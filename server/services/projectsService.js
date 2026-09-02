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
    cachedProjects = null;
    lastProjectsScanTime = 0;
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
  cachedProjects = null;
  lastProjectsScanTime = 0;
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

let cachedProjects = null;
let lastProjectsScanTime = 0;
let inFlightScanPromise = null;
const PROJECTS_CACHE_TTL_MS = 30000; // Cache de 30 secondes

/**
 * Détecte si un chemin pointe vers une distribution WSL et extrait la distro et le chemin Linux
 */
export function parseWslPath(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return null;
  const match = dirPath.match(/^(\\\\wsl\.localhost|\/\/wsl\.localhost|\\\\wsl\$|\/\/wsl\$)[\\\/]([^\\\/]+)(.*)$/i);
  if (!match) return null;
  const distro = match[2];
  let linuxPath = match[3].replace(/\\/g, '/');
  if (!linuxPath.startsWith('/')) linuxPath = '/' + linuxPath;
  return { distro, linuxPath };
}

/**
 * Formate un chemin Linux WSL en chemin UNC Windows
 */
export function formatWslUncPath(distro, linuxPath) {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`;
}

/**
 * Détecte les technos à partir de la liste des fichiers racines du projet
 */
function detectProjectTechFromFiles(files = []) {
  const fileSet = new Set(files);
  if (fileSet.has('package.json')) return { name: 'Node.js', icon: '🟢', color: 'text-emerald-400' };
  if (fileSet.has('pyproject.toml') || fileSet.has('requirements.txt') || fileSet.has('Pipfile')) return { name: 'Python', icon: '🐍', color: 'text-amber-400' };
  if (fileSet.has('Cargo.toml')) return { name: 'Rust', icon: '🦀', color: 'text-orange-500' };
  if (fileSet.has('go.mod')) return { name: 'Go', icon: '🐹', color: 'text-cyan-500' };
  if (fileSet.has('composer.json')) return { name: 'PHP', icon: '🐘', color: 'text-indigo-400' };
  if (fileSet.has('pom.xml') || fileSet.has('build.gradle')) return { name: 'Java / Kotlin', icon: '☕', color: 'text-red-400' };
  if (fileSet.has('Dockerfile') || fileSet.has('docker-compose.yml')) return { name: 'Docker / DevOps', icon: '🐳', color: 'text-sky-400' };
  return { name: 'Projet Code', icon: '💻', color: 'text-zinc-400' };
}

/**
 * Scan ultra-rapide des dépôts Git situés dans WSL via Python natif Linux (0% surcharge 9P)
 */
async function scanWslProjectsBatch(distro, linuxPath) {
  const pyScript = `
import os, subprocess, json

def inspect(repo):
    try:
        status = subprocess.check_output(['git', '-C', repo, '-c', 'safe.directory=*', 'status', '--porcelain=v1', '-b'], text=True, stderr=subprocess.DEVNULL)
        lines = status.strip().split('\\n')
        branch = 'unknown'
        ahead = 0
        behind = 0
        untracked = 0
        staged = 0
        modified = 0
        if lines and lines[0].startswith('##'):
            h = lines[0][2:].strip()
            import re
            m = re.match(r'^([^\\.\\s]+)', h)
            if m: branch = m.group(1)
            ah = re.search(r'ahead (\\d+)', h)
            if ah: ahead = int(ah.group(1))
            bh = re.search(r'behind (\\d+)', h)
            if bh: behind = int(bh.group(1))
            for l in lines[1:]:
                if not l: continue
                code = l[:2]
                if code == '??': untracked += 1
                else:
                    if code[0] not in (' ', '?'): staged += 1
                    if code[1] not in (' ', '?'): modified += 1
        is_clean = (modified == 0 and untracked == 0 and staged == 0)
        
        last_commit = None
        try:
            log = subprocess.check_output(['git', '-C', repo, '-c', 'safe.directory=*', 'log', '-1', '--format=%h|%s|%an|%cr|%cI'], text=True, stderr=subprocess.DEVNULL).strip()
            if log:
                parts = log.split('|')
                if len(parts) >= 5:
                    last_commit = {'hash': parts[0], 'subject': parts[1], 'author': parts[2], 'relativeTime': parts[3], 'isoDate': parts[4]}
        except: pass

        remote_url = None
        try:
            remote_url = subprocess.check_output(['git', '-C', repo, '-c', 'safe.directory=*', 'config', '--get', 'remote.origin.url'], text=True, stderr=subprocess.DEVNULL).strip() or None
        except: pass

        files = os.listdir(repo)
        return {
            'linuxPath': repo,
            'name': os.path.basename(repo),
            'branch': branch,
            'isClean': is_clean,
            'isDirty': not is_clean,
            'modifiedCount': modified,
            'untrackedCount': untracked,
            'stagedCount': staged,
            'ahead': ahead,
            'behind': behind,
            'remoteUrl': remote_url,
            'lastCommit': last_commit,
            'files': [f for f in files if f in ('package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'composer.json', 'pom.xml', 'build.gradle', 'Dockerfile', 'docker-compose.yml')]
        }
    except Exception as e:
        return None

results = []
for root, dirs, files in os.walk('${linuxPath}'):
    if '.git' in dirs:
        dirs.remove('.git')
        r = inspect(root)
        if r: results.append(r)
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'vendor', 'dist', 'build', '__pycache__', '.venv', 'venv')]

print(json.dumps(results))
`;

  try {
    const { stdout } = await execFileAsync('wsl.exe', ['-d', distro, 'python3', '-c', pyScript], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15000
    });
    const rawList = JSON.parse(stdout.trim());
    return rawList.map(r => {
      const uncPath = formatWslUncPath(distro, r.linuxPath);
      return {
        name: r.name,
        path: uncPath,
        branch: r.branch,
        isClean: r.isClean,
        isDirty: r.isDirty,
        modifiedCount: r.modifiedCount,
        untrackedCount: r.untrackedCount,
        stagedCount: r.stagedCount,
        ahead: r.ahead,
        behind: r.behind,
        remoteUrl: r.remoteUrl,
        webUrl: formatGitWebUrl(r.remoteUrl),
        lastCommit: r.lastCommit,
        tech: detectProjectTechFromFiles(r.files || [])
      };
    });
  } catch (err) {
    console.warn(`⚠️ [Git Hub WSL Batch] Repli pour ${linuxPath}:`, err.message);
    return null;
  }
}

/**
 * Scanne les répertoires et extrait le statut Git complet de chaque projet
 * Ne s'actualise que lors de la première ouverture ou lors d'un rafraîchissement manuel
 */
export async function scanProjects(forceRefresh = false) {
  if (!forceRefresh && cachedProjects !== null) {
    return cachedProjects;
  }

  if (inFlightScanPromise) {
    return inFlightScanPromise;
  }

  inFlightScanPromise = (async () => {
    try {
      const rootPaths = await getScannedPaths();
      const discoveredLocalGitDirs = new Set();
      const wslProjects = [];

      for (const root of rootPaths) {
        const wslInfo = parseWslPath(root);
        if (wslInfo && os.platform() === 'win32') {
          // Traitement optimisé en batch sous WSL
          const batchRes = await scanWslProjectsBatch(wslInfo.distro, wslInfo.linuxPath);
          if (batchRes && Array.isArray(batchRes)) {
            wslProjects.push(...batchRes);
            continue;
          }
        }
        findGitRepositories(root, 0, 2, discoveredLocalGitDirs);
      }

      // Si le projet DevHub lui-même n'est pas encore dans la liste, l'ajouter
      const selfDir = path.resolve('.');
      if (fs.existsSync(path.join(selfDir, '.git'))) {
        discoveredLocalGitDirs.add(selfDir);
      }

      const localRepoList = Array.from(discoveredLocalGitDirs);
      const localProjects = (await mapConcurrent(localRepoList, 4, async (repoPath) => {
        try {
          return await inspectGitRepository(repoPath);
        } catch (err) {
          console.warn(`⚠️ [Git Hub] Erreur analyse ${repoPath}:`, err.message);
          return null;
        }
      })).filter(Boolean);

      const allProjects = [...localProjects, ...wslProjects];

      // Déduplication par chemin
      const seenPaths = new Set();
      const projects = [];
      for (const p of allProjects) {
        if (!seenPaths.has(p.path)) {
          seenPaths.add(p.path);
          projects.push(p);
        }
      }

      // Tri : Projets avec modifications non enregistrées en premier, puis alphabétique
      projects.sort((a, b) => {
        if (a.isDirty && !b.isDirty) return -1;
        if (!a.isDirty && b.isDirty) return 1;
        return a.name.localeCompare(b.name);
      });

      cachedProjects = projects;
      lastProjectsScanTime = Date.now();
      return projects;
    } finally {
      inFlightScanPromise = null;
    }
  })();

  return inFlightScanPromise;
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
  const wslInfo = parseWslPath(projectPath);

  let cmd = '';

  switch (editor) {
    case 'vscode':
    case 'code':
      if (wslInfo && platform === 'win32') {
        cmd = `code --remote wsl+${wslInfo.distro} "${wslInfo.linuxPath}" || code "${p}"`;
      } else {
        cmd = `code "${p}"`;
      }
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
        if (wslInfo) {
          cmd = `start wt.exe -d "${wslInfo.linuxPath}" 2>nul || powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'wsl.exe -d ${wslInfo.distro} --cd \"\"\"${wslInfo.linuxPath}\"\"\"' "`;
        } else {
          cmd = `start wt.exe -d "${p}" 2>nul || powershell -NoProfile -Command "Start-Process powershell -WorkingDirectory '${p.replace(/'/g, "''")}'"`;
        }
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
