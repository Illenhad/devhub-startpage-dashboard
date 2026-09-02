import { exec, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

/**
 * 1. MÉMOIRE RAM MULTI-OS (macOS, Linux, Windows)
 */
export async function getSystemMemory() {
  if (isMac) {
    return getMacMemory();
  } else if (isLinux) {
    return getLinuxMemory();
  } else if (isWindows) {
    return getWindowsMemory();
  }
  return getFallbackMemory();
}

/**
 * RAM macOS : sysctl + vm_stat
 */
async function getMacMemory() {
  try {
    const { stdout: totalMemRaw } = await execAsync('sysctl -n hw.memsize');
    const totalBytes = parseInt(totalMemRaw.trim(), 10) || os.totalmem();

    let pageSize = 4096;
    try {
      const { stdout: pageSizeRaw } = await execAsync('sysctl -n hw.pagesize');
      pageSize = parseInt(pageSizeRaw.trim(), 10) || 4096;
    } catch {
      pageSize = 4096;
    }

    const { stdout: vmStatRaw } = await execAsync('vm_stat');
    const lines = vmStatRaw.split('\n');
    const vmData = {};

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const val = parseInt(parts[1].replace('.', '').trim(), 10);
        if (!isNaN(val)) {
          vmData[key] = val;
        }
      }
    }

    const freePages = (vmData['Pages free'] || 0) + (vmData['Pages speculative'] || 0);
    const activePages = vmData['Pages active'] || 0;
    const wiredPages = vmData['Pages wired down'] || 0;
    const compressedPages = vmData['Pages occupied by compressor'] || 0;
    const inactivePages = vmData['Pages inactive'] || 0;

    // Used RAM = Active + Wired + Compressed
    const usedBytes = (activePages + wiredPages + compressedPages) * pageSize;
    const freeBytes = totalBytes - usedBytes;

    const totalGB = (totalBytes / (1024 ** 3)).toFixed(1);
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    const freeGB = (freeBytes / (1024 ** 3)).toFixed(1);
    const percent = Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100)));

    return {
      total: `${totalGB} Go`,
      used: `${usedGB} Go`,
      free: `${freeGB} Go`,
      active: `${((activePages * pageSize) / (1024 ** 3)).toFixed(1)} Go`,
      wired: `${((wiredPages * pageSize) / (1024 ** 3)).toFixed(1)} Go`,
      compressed: `${((compressedPages * pageSize) / (1024 ** 3)).toFixed(1)} Go`,
      inactive: `${((inactivePages * pageSize) / (1024 ** 3)).toFixed(1)} Go`,
      percent,
      totalBytes,
      usedBytes,
      freeBytes
    };
  } catch {
    return getFallbackMemory();
  }
}

/**
 * RAM Linux : /proc/meminfo
 */
async function getLinuxMemory() {
  try {
    const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
    const lines = meminfo.split('\n');
    const data = {};

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const val = parseInt(parts[1].trim().split(/\s+/)[0], 10);
        if (!isNaN(val)) {
          data[key] = val * 1024; // Convertir kB en Bytes
        }
      }
    }

    const totalBytes = data['MemTotal'] || os.totalmem();
    const availableBytes = data['MemAvailable'] || (data['MemFree'] + (data['Buffers'] || 0) + (data['Cached'] || 0)) || os.freemem();
    const usedBytes = totalBytes - availableBytes;
    const freeBytes = availableBytes;

    const buffers = (data['Buffers'] || 0);
    const cached = (data['Cached'] || 0);
    const active = (data['Active'] || 0);

    const totalGB = (totalBytes / (1024 ** 3)).toFixed(1);
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    const freeGB = (freeBytes / (1024 ** 3)).toFixed(1);
    const percent = Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100)));

    return {
      total: `${totalGB} Go`,
      used: `${usedGB} Go`,
      free: `${freeGB} Go`,
      active: `${(active / (1024 ** 3)).toFixed(1)} Go`,
      wired: `${((buffers + cached) / (1024 ** 3)).toFixed(1)} Go (Cache)`,
      compressed: `${((data['SwapTotal'] ? (data['SwapTotal'] - (data['SwapFree'] || 0)) : 0) / (1024 ** 3)).toFixed(1)} Go (Swap)`,
      inactive: `${((data['Inactive'] || 0) / (1024 ** 3)).toFixed(1)} Go`,
      percent,
      totalBytes,
      usedBytes,
      freeBytes
    };
  } catch {
    return getFallbackMemory();
  }
}

/**
 * RAM Windows : os + PowerShell CIM
 */
async function getWindowsMemory() {
  try {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;

    const totalGB = (totalBytes / (1024 ** 3)).toFixed(1);
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    const freeGB = (freeBytes / (1024 ** 3)).toFixed(1);
    const percent = Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100)));

    return {
      total: `${totalGB} Go`,
      used: `${usedGB} Go`,
      free: `${freeGB} Go`,
      active: `${usedGB} Go`,
      wired: 'N/D',
      compressed: 'N/D',
      inactive: `${freeGB} Go`,
      percent,
      totalBytes,
      usedBytes,
      freeBytes
    };
  } catch {
    return getFallbackMemory();
  }
}

/**
 * RAM Fallback générique
 */
function getFallbackMemory() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const totalGB = (totalBytes / (1024 ** 3)).toFixed(1);
  const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
  const freeGB = (freeBytes / (1024 ** 3)).toFixed(1);
  const percent = Math.round((usedBytes / totalBytes) * 100);

  return {
    total: `${totalGB} Go`,
    used: `${usedGB} Go`,
    free: `${freeGB} Go`,
    active: `${usedGB} Go`,
    wired: 'N/D',
    compressed: 'N/D',
    inactive: `${freeGB} Go`,
    percent,
    totalBytes,
    usedBytes,
    freeBytes
  };
}

/**
 * 2. DISQUE PRINCIPAL MULTI-OS
 */
export async function getSystemDisk() {
  const disks = await getAllDisks();
  if (disks.length > 0) {
    // Sélectionner le disque racine / système principal
    const rootDisk = isWindows
      ? (disks.find(d => d.mountPoint.toLowerCase().startsWith('c:')) || disks[0])
      : (disks.find(d => d.mountPoint === '/') || disks[0]);
    return rootDisk;
  }

  return {
    total: 'N/D',
    used: 'N/D',
    available: 'N/D',
    percent: 0,
    mountPoint: isWindows ? 'C:\\' : '/',
    label: isWindows ? 'Lecteur C:' : 'Disque Principal'
  };
}

/**
 * 3. TOUS LES DISQUES & PARTITIONS MULTI-OS
 */
export async function getAllDisks() {
  if (isWindows) {
    return getWindowsDisks();
  } else {
    return getUnixDisks();
  }
}

/**
 * Disques macOS / Linux : df -k
 */
async function getUnixDisks() {
  try {
    const { stdout } = await execAsync('df -k', { timeout: 3500 });
    const lines = stdout.trim().split('\n');
    if (lines.length <= 1) return [];

    const disks = [];
    const seenMounts = new Set();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\s+/g, ' ').trim();
      const parts = line.split(' ');
      if (parts.length < 6) continue;

      const filesystem = parts[0];
      const totalKB = parseInt(parts[1], 10) || 0;
      const usedKB = parseInt(parts[2], 10) || 0;
      const availKB = parseInt(parts[3], 10) || 0;
      const percentStr = parts[4];
      const mountPoint = parts.slice(8).join(' ') || parts[parts.length - 1];

      // Ignorer les pseudo-filesystems Linux et macOS
      if (
        filesystem === 'devfs' ||
        filesystem === 'tmpfs' ||
        filesystem === 'devtmpfs' ||
        filesystem === 'overlay' ||
        filesystem === 'udev' ||
        mountPoint.startsWith('/System/Volumes/Update') ||
        mountPoint.startsWith('/dev') ||
        mountPoint.startsWith('/sys') ||
        mountPoint.startsWith('/proc') ||
        mountPoint.startsWith('/run') ||
        mountPoint.startsWith('/var/run') ||
        mountPoint.startsWith('/snap')
      ) {
        continue;
      }

      if (seenMounts.has(mountPoint)) continue;
      seenMounts.add(mountPoint);

      const totalGB = (totalKB / (1024 * 1024)).toFixed(1);
      const usedGB = (usedKB / (1024 * 1024)).toFixed(1);
      const availGB = (availKB / (1024 * 1024)).toFixed(1);
      const percent = totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : parseInt(percentStr, 10) || 0;

      let label = mountPoint;
      if (mountPoint === '/') {
        label = isMac ? 'Disque Système (Macintosh HD)' : 'Racine Système (/)';
      } else if (mountPoint.startsWith('/System/Volumes/Data')) {
        label = 'Données Utilisateur (Data)';
      } else if (mountPoint.startsWith('/home')) {
        label = 'Dossiers Utilisateurs (/home)';
      } else if (mountPoint.startsWith('/Volumes/') || mountPoint.startsWith('/media/') || mountPoint.startsWith('/mnt/')) {
        label = `Stockage Externe (${path.basename(mountPoint)})`;
      }

      disks.push({
        filesystem,
        mountPoint,
        label,
        total: totalGB >= 1000 ? `${(totalGB / 1024).toFixed(1)} To` : `${totalGB} Go`,
        used: usedGB >= 1000 ? `${(usedGB / 1024).toFixed(1)} To` : `${usedGB} Go`,
        available: availGB >= 1000 ? `${(availGB / 1024).toFixed(1)} To` : `${availGB} Go`,
        percent,
        totalGB: parseFloat(totalGB),
        usedGB: parseFloat(usedGB)
      });
    }

    return disks;
  } catch (err) {
    console.error('Erreur getUnixDisks:', err);
    return [];
  }
}

let cachedWindowsDisks = null;
let lastWindowsDisksFetch = 0;
const WINDOWS_DISKS_CACHE_TTL = 30000; // 30 secondes de cache pour les disques

/**
 * Disques Windows : PowerShell Get-CimInstance Win32_LogicalDisk (avec cache)
 */
async function getWindowsDisks() {
  const now = Date.now();
  if (cachedWindowsDisks && (now - lastWindowsDisksFetch < WINDOWS_DISKS_CACHE_TTL)) {
    return cachedWindowsDisks;
  }

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,FileSystem,Size,FreeSpace,VolumeName | ConvertTo-Json'
    ], { timeout: 6000 });
    if (!stdout.trim()) return cachedWindowsDisks || [];

    let parsed = JSON.parse(stdout.trim());
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    return parsed.filter(d => d && d.Size > 0).map(d => {
      const totalBytes = parseInt(d.Size, 10) || 0;
      const freeBytes = parseInt(d.FreeSpace, 10) || 0;
      const usedBytes = totalBytes - freeBytes;

      const totalGB = (totalBytes / (1024 ** 3)).toFixed(1);
      const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
      const availGB = (freeBytes / (1024 ** 3)).toFixed(1);
      const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

      const driveId = d.DeviceID || 'C:';
      const volName = d.VolumeName ? ` (${d.VolumeName})` : '';

      return {
        filesystem: d.FileSystem || 'NTFS',
        mountPoint: driveId,
        label: `Lecteur Local ${driveId}${volName}`,
        total: totalGB >= 1000 ? `${(totalGB / 1024).toFixed(1)} To` : `${totalGB} Go`,
        used: usedGB >= 1000 ? `${(usedGB / 1024).toFixed(1)} To` : `${usedGB} Go`,
        available: availGB >= 1000 ? `${(availGB / 1024).toFixed(1)} To` : `${availGB} Go`,
        percent,
        totalGB: parseFloat(totalGB),
        usedGB: parseFloat(usedGB)
      };
    });

    cachedWindowsDisks = disks;
    lastWindowsDisksFetch = Date.now();
    return disks;
  } catch (err) {
    console.error('Erreur getWindowsDisks:', err);
    return cachedWindowsDisks || [];
  }
}

/**
 * 4. TEMPÉRATURE DU SYSTÈME MULTI-OS
 */
export async function getSystemTemperature() {
  let tempC = null;
  let thermalState = 'Optimal';

  if (isMac) {
    // macOS
    try {
      const { stdout } = await execAsync('osx-cpu-temp', { timeout: 800 });
      const match = stdout.match(/([0-9.]+)/);
      if (match) tempC = Math.round(parseFloat(match[1]));
    } catch {}

    if (tempC === null) {
      try {
        const { stdout } = await execAsync('ioreg -r -c AppleSmartBattery', { timeout: 1000 });
        const vTempMatch = stdout.match(/"VirtualTemperature"\s*=\s*(\d+)/i) || stdout.match(/"Temperature"\s*=\s*(\d+)/i);
        if (vTempMatch) tempC = Math.round(parseInt(vTempMatch[1], 10) / 100);
      } catch {}
    }

    try {
      const { stdout } = await execAsync('pmset -g therm', { timeout: 800 });
      if (/thermal warning/i.test(stdout)) thermalState = 'Élevé';
    } catch {}
  } else if (isLinux) {
    // Linux /sys/class/thermal
    try {
      const tempFiles = ['/sys/class/thermal/thermal_zone0/temp', '/sys/class/thermal/thermal_zone1/temp', '/sys/class/hwmon/hwmon0/temp1_input'];
      for (const tf of tempFiles) {
        try {
          const raw = await fs.readFile(tf, 'utf8');
          const val = parseInt(raw.trim(), 10);
          if (!isNaN(val) && val > 0) {
            tempC = Math.round(val > 1000 ? val / 1000 : val);
            break;
          }
        } catch {}
      }
    } catch {}
  }

  // Estimation dynamique si non mesurable directement
  if (tempC === null) {
    const load1 = (os.loadavg()[0] || 0.5);
    tempC = Math.round(34 + Math.min(28, load1 * 4));
  }

  return {
    celsius: `${tempC} °C`,
    value: tempC,
    state: thermalState,
    isHot: tempC > 75,
    isWarm: tempC > 55 && tempC <= 75
  };
}

/**
 * 5. LISTE DES PROCESSUS MULTI-OS
 */
export async function getProcessesList() {
  if (isWindows) {
    return getWindowsProcesses();
  } else {
    return getUnixProcesses();
  }
}

/**
 * Processus macOS / Linux : ps
 */
async function getUnixProcesses() {
  try {
    const psCmd = isMac 
      ? 'ps -axo pid,user,%cpu,%mem,rss,etime,command' 
      : 'ps -eo pid,user,%cpu,%mem,rss,etime,args --sort=-%mem';

    const { stdout } = await execAsync(psCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 4000 });
    const lines = stdout.trim().split('\n');
    if (lines.length <= 1) return [];

    const processes = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 7) continue;

      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) continue;

      const user = parts[1];
      const cpu = parseFloat(parts[2]) || 0;
      const mem = parseFloat(parts[3]) || 0;
      const rssKB = parseInt(parts[4], 10) || 0;
      const uptime = parts[5];
      const command = parts.slice(6).join(' ');

      const rawCmd = command.split(' ')[0];
      const name = path.basename(rawCmd).replace(/^-/, '') || rawCmd;

      const rssMB = (rssKB / 1024).toFixed(1);
      const rssFormatted = rssKB >= 1024 * 1024 
        ? `${(rssKB / (1024 * 1024)).toFixed(2)} Go` 
        : `${rssMB} Mo`;

      let uptimeSeconds = 0;
      try {
        const uParts = uptime.split('-');
        let timePart = uParts[0];
        let days = 0;
        if (uParts.length === 2) {
          days = parseInt(uParts[0], 10) || 0;
          timePart = uParts[1];
        }
        const timeUnits = timePart.split(':').map(v => parseInt(v, 10) || 0);
        if (timeUnits.length === 3) {
          uptimeSeconds = (days * 86400) + (timeUnits[0] * 3600) + (timeUnits[1] * 60) + timeUnits[2];
        } else if (timeUnits.length === 2) {
          uptimeSeconds = (days * 86400) + (timeUnits[0] * 60) + timeUnits[1];
        } else if (timeUnits.length === 1) {
          uptimeSeconds = (days * 86400) + timeUnits[0];
        }
      } catch {}

      processes.push({
        pid,
        user,
        cpu,
        mem,
        rssKB,
        rssMB: parseFloat(rssMB),
        rssFormatted,
        uptime,
        uptimeSeconds,
        name,
        command
      });
    }

    return processes;
  } catch (err) {
    console.error('Erreur getUnixProcesses:', err);
    return [];
  }
}

let cachedWindowsProcesses = null;
let lastWindowsProcessFetch = 0;
const WINDOWS_PROCESS_CACHE_TTL = 2500;
let previousWindowsCpuSamples = new Map();

/**
 * Fallback rapide Processus Windows via tasklist
 */
async function getWindowsProcessesFallback() {
  try {
    const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { maxBuffer: 10 * 1024 * 1024, timeout: 4000 });
    const lines = stdout.trim().split('\n');
    const totalMem = os.totalmem();
    const username = os.userInfo()?.username || 'SYSTEM';
    const processes = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(/^"([^"]+)","(\d+)","([^"]*)","([^"]*)","([^"]*)"/);
      if (!match) continue;

      const name = match[1];
      const pid = parseInt(match[2], 10);
      const rawMem = match[5];
      const memDigits = rawMem ? rawMem.replace(/[^\d]/g, '') : '0';
      const rssKB = parseInt(memDigits, 10) || 0;
      const rssMB = parseFloat((rssKB / 1024).toFixed(1));
      const mem = totalMem > 0 ? parseFloat(((rssKB * 1024 / totalMem) * 100).toFixed(1)) : 0;
      const rssFormatted = rssMB >= 1024 ? `${(rssMB / 1024).toFixed(2)} Go` : `${rssMB} Mo`;

      processes.push({
        pid,
        user: username,
        cpu: 0,
        mem,
        rssKB,
        rssMB,
        rssFormatted,
        uptime: 'Actif',
        uptimeSeconds: 0,
        name: name.replace(/\.exe$/i, ''),
        command: name
      });
    }

    processes.sort((a, b) => b.rssKB - a.rssKB);
    return processes;
  } catch (err) {
    console.error('Erreur getWindowsProcessesFallback:', err.message);
    return [];
  }
}

/**
 * Processus Windows : Compteurs de performance WMI Win32_PerfFormattedData_PerfProc_Process avec Fallback tasklist & Cache
 */
async function getWindowsProcesses() {
  const now = Date.now();
  if (cachedWindowsProcesses && (now - lastWindowsProcessFetch < WINDOWS_PROCESS_CACHE_TTL)) {
    return cachedWindowsProcesses;
  }

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Select-Object IDProcess,Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json -Compress'
    ], { timeout: 7000, maxBuffer: 15 * 1024 * 1024 });

    if (!stdout.trim()) {
      cachedWindowsProcesses = await getWindowsProcessesFallback();
      lastWindowsProcessFetch = Date.now();
      return cachedWindowsProcesses;
    }

    let parsed = JSON.parse(stdout.trim());
    if (!Array.isArray(parsed)) parsed = [parsed];

    const totalMem = os.totalmem();
    const username = os.userInfo()?.username || 'SYSTEM';
    const numCores = os.cpus()?.length || 1;

    const processes = parsed
      .filter(p => p && p.IDProcess > 0 && p.Name !== '_Total' && p.Name !== 'Idle')
      .map(p => {
        const pid = p.IDProcess;
        const cleanName = p.Name.replace(/#\d+$/, '');
        const rawCpu = p.PercentProcessorTime || 0;
        const cpu = parseFloat(Math.min(100, Math.max(0, rawCpu / numCores)).toFixed(1));
        const rssBytes = p.WorkingSetPrivate || 0;
        const rssKB = Math.round(rssBytes / 1024);
        const rssMB = parseFloat((rssBytes / (1024 * 1024)).toFixed(1));
        const mem = totalMem > 0 ? parseFloat(((rssBytes / totalMem) * 100).toFixed(1)) : 0;

        const rssFormatted = rssMB >= 1024 
          ? `${(rssMB / 1024).toFixed(2)} Go` 
          : `${rssMB} Mo`;

        return {
          pid,
          user: username,
          cpu,
          mem,
          rssKB,
          rssMB,
          rssFormatted,
          uptime: 'Actif',
          uptimeSeconds: 0,
          name: cleanName,
          command: cleanName
        };
      });

    processes.sort((a, b) => (b.cpu - a.cpu) || (b.rssKB - a.rssKB));
    cachedWindowsProcesses = processes;
    lastWindowsProcessFetch = Date.now();
    return processes;
  } catch (err) {
    console.error('Erreur getWindowsProcesses:', err.message);
    cachedWindowsProcesses = await getWindowsProcessesFallback();
    lastWindowsProcessFetch = Date.now();
    return cachedWindowsProcesses;
  }
}

/**
 * 6. FICHIERS VOLUMINEUX MULTI-OS
 */
export async function getHeavyFiles(minSizeMB = 100, limit = 25) {
  const home = os.homedir();
  const minBytes = minSizeMB * 1024 * 1024;

  if (isMac) {
    // Utiliser Spotlight mdfind sur macOS pour une vitesse instantanée
    try {
      const { stdout } = await execAsync(`mdfind "kMDItemFSSize > ${minBytes}" -onlyin "${home}" | head -n 60`, { timeout: 3500 });
      const filePaths = stdout.trim().split('\n').filter(Boolean);
      const fileResults = [];

      for (const fpath of filePaths) {
        try {
          const stats = await fs.stat(fpath);
          if (stats.isFile()) {
            const sizeBytes = stats.size;
            const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
            const sizeGB = (sizeBytes / (1024 ** 3)).toFixed(2);
            const sizeFormatted = sizeBytes >= 1024 ** 3 ? `${sizeGB} Go` : `${sizeMB} Mo`;

            fileResults.push({
              name: path.basename(fpath),
              path: fpath,
              ext: path.extname(fpath).replace('.', '').toLowerCase() || 'fichier',
              sizeBytes,
              sizeFormatted,
              modified: stats.mtime.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            });
          }
        } catch {}
      }

      fileResults.sort((a, b) => b.sizeBytes - a.sizeBytes);
      return fileResults.slice(0, limit);
    } catch {}
  }

  // Scanner de fichiers Node.js rapide universel (Linux, Windows & macOS fallback)
  try {
    const fileResults = [];
    const targetDirs = [
      path.join(home, 'Downloads'),
      path.join(home, 'Documents'),
      path.join(home, 'Desktop'),
      path.join(home, 'Videos'),
      path.join(home, 'Musique')
    ];

    const ignoredDirs = new Set(['node_modules', '.git', '.cache', 'AppData', 'Library', '$RECYCLE.BIN', 'System Volume Information']);

    async function scanDir(currentPath, depth = 0) {
      if (depth > 4 || fileResults.length >= 80) return;
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.env') continue;
          if (ignoredDirs.has(entry.name)) continue;

          const fullPath = path.join(currentPath, entry.name);
          if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              if (stats.size >= minBytes) {
                const sizeBytes = stats.size;
                const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
                const sizeGB = (sizeBytes / (1024 ** 3)).toFixed(2);
                const sizeFormatted = sizeBytes >= 1024 ** 3 ? `${sizeGB} Go` : `${sizeMB} Mo`;

                fileResults.push({
                  name: entry.name,
                  path: fullPath,
                  ext: path.extname(entry.name).replace('.', '').toLowerCase() || 'fichier',
                  sizeBytes,
                  sizeFormatted,
                  modified: stats.mtime.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                });
              }
            } catch {}
          } else if (entry.isDirectory()) {
            await scanDir(fullPath, depth + 1);
          }
        }
      } catch {}
    }

    for (const d of targetDirs) {
      await scanDir(d, 0);
    }

    fileResults.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return fileResults.slice(0, limit);
  } catch (err) {
    console.error('Erreur getHeavyFiles:', err);
    return [];
  }
}

/**
 * 7. OUVRIR ET RÉVÉLER UN FICHIER DANS L'EXPLORATEUR / FINDER
 */
export async function openFileLocation(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Chemin invalide');
  }

  const normalizedPath = path.normalize(targetPath);

  if (isMac) {
    await execFileAsync('open', ['-R', normalizedPath], { timeout: 3000 });
  } else if (isWindows) {
    try {
      const exists = fsSync.existsSync(normalizedPath);
      const isDirectory = exists && fsSync.statSync(normalizedPath).isDirectory();
      
      const args = (exists && !isDirectory)
        ? [`/select,${normalizedPath}`]
        : [isDirectory ? normalizedPath : path.dirname(normalizedPath)];

      const child = spawn('explorer.exe', args, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } catch {
      try {
        await execAsync(`explorer.exe /select,"${normalizedPath}"`);
      } catch (err) {
        if (err.code !== 1) {
          // Si la sélection échoue, ouvrir le dossier parent
          const parentDir = path.dirname(normalizedPath);
          try {
            await execAsync(`explorer.exe "${parentDir}"`);
          } catch (e) {
            if (e.code !== 1) throw e;
          }
        }
      }
    }
  } else if (isLinux) {
    const dir = path.dirname(normalizedPath);
    await execFileAsync('xdg-open', [dir], { timeout: 3000 });
  }

  return { success: true, path: targetPath };
}

// Alias pour compatibilité
export const openFinderPath = openFileLocation;

/**
 * 8. RÉSUMÉ GLOBAL DES MÉTRIQUES SYSTÈME
 */
export async function getSystemStats() {
  const [memory, disk, temperature] = await Promise.all([
    getSystemMemory(), 
    getSystemDisk(), 
    getSystemTemperature()
  ]);

  const uptimeSeconds = os.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const platformName = isMac ? 'macOS' : isWindows ? 'Windows' : 'Linux';
  const osType = os.type();
  const osRelease = os.release();

  let formattedArch = os.arch();
  if (isMac && formattedArch === 'arm64') formattedArch = 'Apple Silicon (ARM64)';
  else if (formattedArch === 'x64') formattedArch = 'x86_64 (64-bit)';

  return {
    hostname: os.hostname(),
    platform: platformName,
    osType,
    osRelease,
    arch: formattedArch,
    uptime: `${hours}h ${minutes}m`,
    cpuModel: os.cpus()[0]?.model || 'Processeur multi-cœurs',
    cpuCores: os.cpus().length,
    loadAvg: os.loadavg().map(v => v.toFixed(2)),
    memory,
    disk,
    temperature,
    timestamp: new Date().toISOString()
  };
}

export default {
  getSystemMemory,
  getSystemDisk,
  getAllDisks,
  getSystemTemperature,
  getProcessesList,
  getHeavyFiles,
  openFileLocation,
  openFinderPath,
  getSystemStats
};
