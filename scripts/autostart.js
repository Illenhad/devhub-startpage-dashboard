#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'server', 'index.js');
const nodeBin = process.execPath;

const action = process.argv[2] || 'status';
const platform = process.platform;

async function main() {
  console.log(`🖥️  Détection de la plateforme : ${getPlatformName(platform)} (${platform})\n`);

  switch (action) {
    case 'enable':
      await enableAutostart();
      break;
    case 'disable':
      await disableAutostart();
      break;
    case 'status':
    default:
      await statusAutostart();
      break;
  }
}

function getPlatformName(p) {
  if (p === 'darwin') return 'macOS ';
  if (p === 'win32') return 'Windows 🪟';
  if (p === 'linux') return 'Linux 🐧';
  return p;
}

// -------------------------------------------------------------
// 1. ACTIVER LE DÉMARRAGE AUTOMATIQUE
// -------------------------------------------------------------
async function enableAutostart() {
  if (platform === 'darwin') {
    // macOS LaunchAgent
    const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    const plistPath = path.join(agentsDir, 'com.devhub.startpage.plist');
    const oldPlistPath = path.join(agentsDir, 'com.machub.startpage.plist');
    if (fs.existsSync(oldPlistPath)) {
      try {
        await execAsync(`launchctl unload "${oldPlistPath}" 2>/dev/null || true`);
        fs.unlinkSync(oldPlistPath);
      } catch {}
    }
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.devhub.startpage</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeBin}</string>
        <string>${serverEntry}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${projectRoot}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/local/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(projectRoot, 'data', 'server.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(projectRoot, 'data', 'server.err')}</string>
</dict>
</plist>
`;
    fs.writeFileSync(plistPath, plistContent, 'utf8');
    try {
      await execAsync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      await execAsync(`launchctl load "${plistPath}"`);
      console.log(`✅ [macOS] Service LaunchAgent installé et démarré avec succès !`);
      console.log(`📁 Fichier : ${plistPath}`);
      console.log(`🌐 Dashboard accessible sur : http://localhost:3333`);
    } catch (err) {
      console.error(`❌ Erreur activation LaunchAgent:`, err.message);
    }
  } else if (platform === 'linux') {
    // Linux systemd user service
    const systemdDir = path.join(os.homedir(), '.config', 'systemd', 'user');
    if (!fs.existsSync(systemdDir)) {
      fs.mkdirSync(systemdDir, { recursive: true });
    }
    const servicePath = path.join(systemdDir, 'startpage-dashboard.service');
    const serviceContent = `[Unit]
Description=DevHub Startpage & Monitoring Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=${projectRoot}
ExecStart=${nodeBin} ${serverEntry}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
    fs.writeFileSync(servicePath, serviceContent, 'utf8');
    try {
      await execAsync('systemctl --user daemon-reload');
      await execAsync('systemctl --user enable --now startpage-dashboard.service');
      console.log(`✅ [Linux] Service systemd utilisateur activé et lancé !`);
      console.log(`📁 Fichier : ${servicePath}`);
      console.log(`🌐 Dashboard accessible sur : http://localhost:3333`);
    } catch (err) {
      console.error(`❌ Erreur activation systemd:`, err.message);
    }
  } else if (platform === 'win32') {
    // Windows Startup folder
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    if (!fs.existsSync(startupDir)) {
      fs.mkdirSync(startupDir, { recursive: true });
    }
    const batPath = path.join(startupDir, 'startpage-dashboard.cmd');
    const batContent = `@echo off
cd /d "${projectRoot}"
start "" /B "${nodeBin}" "${serverEntry}"
`;
    fs.writeFileSync(batPath, batContent, 'utf8');
    console.log(`✅ [Windows] Script de démarrage automatique créé !`);
    console.log(`📁 Fichier : ${batPath}`);
    console.log(`🌐 Dashboard accessible sur : http://localhost:3333`);
  }
}

// -------------------------------------------------------------
// 2. DÉSACTIVER LE DÉMARRAGE AUTOMATIQUE
// -------------------------------------------------------------
async function disableAutostart() {
  if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.devhub.startpage.plist');
    const oldPlistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.machub.startpage.plist');
    try {
      await execAsync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      await execAsync(`launchctl unload "${oldPlistPath}" 2>/dev/null || true`);
      if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
      if (fs.existsSync(oldPlistPath)) fs.unlinkSync(oldPlistPath);
      console.log(`🛑 [macOS] Service LaunchAgent désactivé et supprimé.`);
    } catch (err) {
      console.error(`❌ Erreur désactivation:`, err.message);
    }
  } else if (platform === 'linux') {
    const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'startpage-dashboard.service');
    try {
      await execAsync('systemctl --user disable --now startpage-dashboard.service 2>/dev/null || true');
      if (fs.existsSync(servicePath)) fs.unlinkSync(servicePath);
      await execAsync('systemctl --user daemon-reload 2>/dev/null || true');
      console.log(`🛑 [Linux] Service systemd désactivé et supprimé.`);
    } catch (err) {
      console.error(`❌ Erreur désactivation:`, err.message);
    }
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const batPath = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'startpage-dashboard.cmd');
    if (fs.existsSync(batPath)) {
      fs.unlinkSync(batPath);
      console.log(`🛑 [Windows] Raccourci de démarrage automatique supprimé.`);
    } else {
      console.log(`ℹ️ [Windows] Aucun raccourci de démarrage trouvé.`);
    }
  }
}

// -------------------------------------------------------------
// 3. STATUT DU DÉMARRAGE AUTOMATIQUE
// -------------------------------------------------------------
async function statusAutostart() {
  if (platform === 'darwin') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.devhub.startpage.plist');
    const exists = fs.existsSync(plistPath);
    console.log(`Fichier LaunchAgent : ${exists ? '✅ Présent' : '❌ Absent'} (${plistPath})`);
    try {
      const { stdout } = await execAsync('launchctl list | grep com.devhub.startpage || true');
      console.log(`Statut d'exécution : ${stdout.trim() ? '🟢 En cours d’exécution' : '⚪ Inactif'}`);
    } catch {
      console.log(`Statut d'exécution : ⚪ Inactif`);
    }
  } else if (platform === 'linux') {
    const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'startpage-dashboard.service');
    const exists = fs.existsSync(servicePath);
    console.log(`Fichier systemd : ${exists ? '✅ Présent' : '❌ Absent'} (${servicePath})`);
    try {
      const { stdout } = await execAsync('systemctl --user is-active startpage-dashboard.service 2>/dev/null || true');
      console.log(`Statut d'exécution : ${stdout.trim() === 'active' ? '🟢 En cours d’exécution (active)' : '⚪ Inactif'}`);
    } catch {
      console.log(`Statut d'exécution : ⚪ Inactif`);
    }
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const batPath = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'startpage-dashboard.cmd');
    const exists = fs.existsSync(batPath);
    console.log(`Fichier de démarrage Startup : ${exists ? '✅ Présent' : '❌ Absent'} (${batPath})`);
  }
}

main().catch(console.error);
