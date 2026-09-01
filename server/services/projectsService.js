import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dbService from './dbService.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Récupère les chemins configurés par l'utilisateur ou initialise avec les dossiers par défaut
 */
export async function getScannedPaths() {
  try {
    const settings = await dbService.getSettings();
    if (settings.git_project_paths && Array.isArray(settings.git_project_paths) && settings.git_project_paths.length > 0) {
      return settings.git_project_paths.filter(p => fs.existsSync(p));
    }
  } catch {}

  // Dossiers par défaut selon le système d'exploitation
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Code'),
    path.join(home, 'Projects'),
    path.join(home, 'Developer'),
    path.join(home, 'dev'),
    path.join(home, 'workspace'),
    path.join(home, 'Documents', 'Projects'),
    path.join(home, 'Documents', 'Code')
  ];

  if (os.platform() === 'win32') {
    candidates.push('C:\\Projects', 'C:\\Code', 'C:\\dev', 'D:\\Projects', 'D:\\Code');
  }

  const existing = candidates.filter(p => fs.existsSync(p));
  
  // Si le dossier du projet actuel a un parent, l'ajouter
  const currentParent = path.dirname(path.resolve('.'));
  if (fs.existsSync(currentParent) && !existing.includes(currentParent)) {
    existing.unshift(currentParent);
  }

  return existing.length > 0 ? existing : [path.resolve('.')];
}

/**
 * Enregistre un nouveau dossier à scanner
 */
export async function addScannedPath(newPath) {
  const normalized = path.resolve(newPath.trim().replace(/^~/, os.homedir()));
  if (!fs.existsSync(normalized)) {
    throw new Error(`Le dossier '${normalized}' n'existe pas.`);
  }

  const currentPaths = await getScannedPaths();
  if (!currentPaths.includes(normalized)) {
    currentPaths.push(normalized);
    await dbService.setSetting('git_project_paths', currentPaths);
  }
  return currentPaths;
}

/**
 * Supprime un dossier de la liste de scan
 */
export async function removeScannedPath(targetPath) {
  const currentPaths = await getScannedPaths();
  const updated = currentPaths.filter(p => p !== targetPath);
  await dbService.setSetting('git_project_paths', updated);
  return updated;
}

/**
 * Exécute des promesses avec un niveau de concurrence contrôlé
 */
async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

/**
 * Scanne les répertoires et extrait le statut Git complet de chaque projet
 */
export async function scanProjects() {
  const rootPaths = await getScannedPaths();
  const discoveredGitDirs = new Set();

  for (const root of rootPaths) {
    findGitRepositories(root, 0, 2, discoveredGitDirs);
  }

  // Si le projet DevHub lui-même n'est pas encore dans la liste, l'ajouter
  const selfDir = path.resolve('.');
  if (fs.existsSync(path.join(selfDir, '.git'))) {
    discoveredGitDirs.add(selfDir);
  }

  const repoList = Array.from(discoveredGitDirs);
  const projects = (await mapConcurrent(repoList, 6, async (repoPath) => {
    try {
      return await inspectGitRepository(repoPath);
    } catch (err) {
      console.warn(`⚠️ [Git Hub] Erreur analyse ${repoPath}:`, err.message);
      return null;
    }
  })).filter(Boolean);

  // Tri : Projets avec modifications non enregistrées en premier, puis alphabétique
  projects.sort((a, b) => {
    if (a.isDirty && !b.isDirty) return -1;
    if (!a.isDirty && b.isDirty) return 1;
    return a.name.localeCompare(b.name);
  });

  return projects;
}

/**
 * Recherche récursive de dépôts Git (présence d'un dossier .git)
 */
function findGitRepositories(dir, currentDepth, maxDepth, results) {
  if (currentDepth > maxDepth) return;

  try {
    if (!fs.existsSync(dir)) return;
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      results.add(dir);
      return; // Ne pas scanner les sous-dossiers d'un dépôt Git existant
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name;
        // Ignorer les dossiers lourds ou cachés
        if (
          name.startsWith('.') || 
          name === 'node_modules' || 
          name === 'vendor' || 
          name === 'dist' || 
          name === 'build' || 
          name === 'target' ||
          name === '__pycache__' ||
          name === '.venv' ||
          name === 'venv'
        ) {
          continue;
        }
        findGitRepositories(path.join(dir, name), currentDepth + 1, maxDepth, results);
      }
    }
  } catch {}
}

/**
 * Inspecte un dépôt Git individuel
 */
async function inspectGitRepository(repoPath) {
  const name = path.basename(repoPath);

  let branch = 'unknown';
  let isClean = true;
  let modifiedCount = 0;
  let untrackedCount = 0;
  let stagedCount = 0;
  let ahead = 0;
  let behind = 0;
  let remoteUrl = null;
  let webUrl = null;
  let lastCommit = null;

  // 1. Statut Git (Porcelain v1 + Branch)
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', repoPath,
      '-c', 'safe.directory=*',
      'status', '--porcelain=v1', '-b'
    ], { timeout: 8000 });
    const lines = stdout.trim().split('\n');

    if (lines.length > 0 && lines[0].startsWith('##')) {
      const header = lines[0].substring(2).trim();
      const branchMatch = header.match(/^([^\.\s]+)/);
      if (branchMatch) branch = branchMatch[1];

      const aheadMatch = header.match(/ahead (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);

      const behindMatch = header.match(/behind (\d+)/);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const code = line.substring(0, 2);

      if (code === '??') {
        untrackedCount++;
      } else {
        if (code[0] !== ' ' && code[0] !== '?') stagedCount++;
        if (code[1] !== ' ' && code[1] !== '?') modifiedCount++;
      }
    }

    isClean = (modifiedCount === 0 && untrackedCount === 0 && stagedCount === 0);
  } catch (err) {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C', repoPath,
        '-c', 'safe.directory=*',
        'branch', '--show-current'
      ], { timeout: 4000 });
      branch = stdout.trim() || 'detached';
    } catch {
      branch = 'detached';
    }
  }

  // 2. Dernier Commit
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', repoPath,
      '-c', 'safe.directory=*',
      'log', '-1', '--format=%h|%s|%an|%cr|%cI'
    ], { timeout: 4000 });
    if (stdout.trim()) {
      const [hash, subject, author, relativeTime, isoDate] = stdout.trim().split('|');
      lastCommit = { hash, subject, author, relativeTime, isoDate };
    }
  } catch {}

  // 3. Remote URL & Détection Web URL (GitHub, GitLab, Bitbucket)
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', repoPath,
      '-c', 'safe.directory=*',
      'config', '--get', 'remote.origin.url'
    ], { timeout: 3000 });
    remoteUrl = stdout.trim();
    if (remoteUrl) {
      webUrl = formatGitWebUrl(remoteUrl);
    }
  } catch {}

  // 4. Détection du langage / framework
  const tech = detectProjectTech(repoPath);

  return {
    name,
    path: repoPath,
    branch,
    isClean,
    isDirty: !isClean,
    modifiedCount,
    untrackedCount,
    stagedCount,
    ahead,
    behind,
    remoteUrl,
    webUrl,
    lastCommit,
    tech
  };
}

/**
 * Transforme une URL git (git@github.com:user/repo.git ou https://) en URL de navigateur web
 */
function formatGitWebUrl(gitUrl) {
  if (!gitUrl) return null;
  let url = gitUrl.trim();

  if (url.startsWith('git@')) {
    // Format git@github.com:user/repo.git -> https://github.com/user/repo
    url = url.replace(/^git@([^:]+):/, 'https://$1/');
  }

  url = url.replace(/\.git$/, '');
  return url.startsWith('http') ? url : `https://${url}`;
}

/**
 * Détecte intelligemment les langages, frameworks et icônes associés au projet
 */
function detectProjectTech(repoPath) {
  const has = (file) => fs.existsSync(path.join(repoPath, file));

  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) return { name: 'Next.js', icon: '▲', color: 'text-zinc-100' };
      if (deps['react']) return { name: 'React', icon: '⚛️', color: 'text-cyan-400' };
      if (deps['vue']) return { name: 'Vue.js', icon: '🟢', color: 'text-emerald-400' };
      if (deps['svelte']) return { name: 'Svelte', icon: '🔥', color: 'text-orange-400' };
      if (deps['express']) return { name: 'Node / Express', icon: '🟢', color: 'text-emerald-500' };
      return { name: 'Node.js', icon: '🟢', color: 'text-emerald-400' };
    } catch {
      return { name: 'JavaScript', icon: '🟨', color: 'text-amber-400' };
    }
  }

  if (has('Cargo.toml')) return { name: 'Rust', icon: '🦀', color: 'text-orange-500' };
  if (has('go.mod')) return { name: 'Go', icon: '🐹', color: 'text-cyan-500' };
  if (has('pyproject.toml') || has('requirements.txt') || has('Pipfile')) return { name: 'Python', icon: '🐍', color: 'text-amber-400' };
  if (has('composer.json')) return { name: 'PHP', icon: '🐘', color: 'text-indigo-400' };
  if (has('pom.xml') || has('build.gradle')) return { name: 'Java / Kotlin', icon: '☕', color: 'text-red-400' };
  if (has('Package.swift') || fs.readdirSync(repoPath).some(f => f.endsWith('.xcodeproj'))) return { name: 'Swift / Apple', icon: '🍏', color: 'text-orange-400' };
  if (has('Dockerfile') || has('docker-compose.yml')) return { name: 'Docker / DevOps', icon: '🐳', color: 'text-sky-400' };

  return { name: 'Projet Code', icon: '💻', color: 'text-zinc-400' };
}

/**
 * Ouvre un projet dans un éditeur de code, un terminal ou l'explorateur natif
 */
export async function openInEditor(projectPath, editor = 'vscode') {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Le chemin '${projectPath}' est introuvable.`);
  }

  const platform = os.platform();
  const p = path.resolve(projectPath);

  let cmd = '';

  switch (editor) {
    case 'vscode':
    case 'code':
      cmd = `code "${p}"`;
      break;

    case 'cursor':
      cmd = `cursor "${p}"`;
      break;

    case 'zed':
      cmd = `zed "${p}"`;
      break;

    case 'sublime':
    case 'subl':
      cmd = `subl "${p}"`;
      break;

    case 'terminal':
      if (platform === 'darwin') {
        cmd = `open -a Terminal "${p}"`;
      } else if (platform === 'win32') {
        cmd = `start wt.exe -d "${p}" 2>nul || powershell -NoProfile -Command "Start-Process powershell -WorkingDirectory '${p.replace(/'/g, "''")}'"`;
      } else {
        cmd = `x-terminal-emulator --working-directory="${p}" || gnome-terminal --working-directory="${p}"`;
      }
      break;

    case 'finder':
    case 'explorer':
    default:
      if (platform === 'darwin') {
        cmd = `open "${p}"`;
      } else if (platform === 'win32') {
        cmd = `explorer.exe "${p}"`;
      } else {
        cmd = `xdg-open "${p}"`;
      }
      break;
  }

  try {
    await execAsync(cmd);
    console.log(`🚀 [Git Hub] Projet ${path.basename(p)} ouvert avec ${editor}`);
    return { success: true, message: `Projet ouvert avec ${editor}` };
  } catch (err) {
    // Sous Windows, explorer.exe retourne le code 1 même en cas de succès
    if (platform === 'win32' && (editor === 'explorer' || editor === 'finder' || err.code === 1)) {
      console.log(`🚀 [Git Hub] Projet ${path.basename(p)} ouvert avec ${editor}`);
      return { success: true, message: `Projet ouvert avec ${editor}` };
    }

    // Si l'éditeur spécifique n'est pas installé dans le PATH, fallback sur le Finder/Explorateur
    if (editor !== 'finder' && editor !== 'explorer') {
      try {
        const fallbackCmd = platform === 'darwin' ? `open "${p}"` : platform === 'win32' ? `explorer.exe "${p}"` : `xdg-open "${p}"`;
        await execAsync(fallbackCmd);
        return { success: true, message: `Commande '${editor}' introuvable, dossier ouvert dans le gestionnaire de fichiers.` };
      } catch (fErr) {
        if (platform === 'win32' && (fErr.code === 1 || !fErr.code)) {
          return { success: true, message: `Commande '${editor}' introuvable, dossier ouvert dans l'Explorateur Windows.` };
        }
      }
    }
    throw new Error(`Impossible de lancer ${editor} : ${err.message}`);
  }
}

export default {
  getScannedPaths,
  addScannedPath,
  removeScannedPath,
  scanProjects,
  openInEditor
};
