import { exec, execFile, execSync } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Dictionnaire des services et ports connus
const KNOWN_PORTS = {
  3333: { name: 'DevHub Dashboard', icon: '⚡', category: 'DevHub' },
  3000: { name: 'Node / React / Next.js', icon: '⚛️', category: 'Web Dev' },
  5173: { name: 'Vite / Svelte / Vue', icon: '⚡', category: 'Web Dev' },
  8080: { name: 'HTTP / Spring / Tomcat', icon: '☕', category: 'Backend' },
  8000: { name: 'Python / Django / FastAPI', icon: '🐍', category: 'Backend' },
  5000: { name: 'Flask / AirPlay', icon: '🌐', category: 'Web / System' },
  4200: { name: 'Angular Dev Server', icon: '🅰️', category: 'Web Dev' },
  80: { name: 'HTTP Web Server', icon: '🌍', category: 'Web' },
  443: { name: 'HTTPS Web Server', icon: '🔒', category: 'Web' },
  5432: { name: 'PostgreSQL Database', icon: '🐘', category: 'Database' },
  3306: { name: 'MySQL / MariaDB', icon: '🐬', category: 'Database' },
  27017: { name: 'MongoDB Database', icon: '🍃', category: 'Database' },
  6379: { name: 'Redis Cache', icon: '🔴', category: 'Cache' },
  11434: { name: 'Ollama AI Server', icon: '🦙', category: 'AI' },
  9000: { name: 'Portainer / MinIO', icon: '📦', category: 'DevOps' },
  2375: { name: 'Docker Engine TCP', icon: '🐳', category: 'DevOps' },
  2376: { name: 'Docker Engine TLS', icon: '🐳', category: 'DevOps' },
  7000: { name: 'ControlCenter / AirPlay', icon: '🍏', category: 'System' },
  22: { name: 'SSH Server', icon: '🔑', category: 'System' }
};

let cachedPorts = null;
let lastPortsFetchTime = 0;
let inFlightPortsPromise = null;
const PORTS_CACHE_TTL_MS = 3500; // 3.5s cache pour éviter les rafales d'appels répétés

/**
 * Récupère la liste de tous les ports TCP en écoute (LISTEN) avec leurs processus
 */
export async function getListeningPorts(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPorts && (now - lastPortsFetchTime < PORTS_CACHE_TTL_MS)) {
    return cachedPorts;
  }

  if (inFlightPortsPromise) {
    return inFlightPortsPromise;
  }

  inFlightPortsPromise = (async () => {
    const platform = os.platform();
    try {
      let ports = [];
      if (platform === 'win32') {
        ports = await getWindowsPorts();
      } else {
        // macOS (darwin) et Linux
        ports = await getUnixPorts();
      }
      cachedPorts = ports;
      lastPortsFetchTime = Date.now();
      return ports;
    } catch (err) {
      console.error('⚠️ [Ports] Erreur récupération des ports:', err.message);
      return cachedPorts || [];
    } finally {
      inFlightPortsPromise = null;
    }
  })();

  return inFlightPortsPromise;
}

/**
 * Parsing sous macOS & Linux via lsof / ss
 */
async function getUnixPorts() {
  let output = '';
  try {
    const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null || true');
    output = stdout;
  } catch (e) {
    output = e.stdout || '';
  }

  if (!output.trim()) {
    try {
      const { stdout } = await execAsync('ss -tulpn 2>/dev/null || netstat -tlpn 2>/dev/null || true');
      output = stdout;
    } catch {}
  }

  const lines = output.trim().split('\n');
  const ports = [];
  const seen = new Set();
  const currentPid = process.pid;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 9) {
      let command = parts[0];
      // Décodage des caractères échappés (ex: Code\x20H -> Code Helper)
      command = command.replace(/\\x20/g, ' ');

      const pid = parseInt(parts[1], 10);
      const user = parts[2];
      const protocol = parts[4] || 'TCP';
      const name = parts[8]; // e.g. *:3000 ou 127.0.0.1:51235

      const portMatch = name.match(/:(\d+)$/);
      if (portMatch && !isNaN(pid)) {
        const port = parseInt(portMatch[1], 10);
        const key = `${port}-${pid}`;

        if (!seen.has(key)) {
          seen.add(key);

          const known = KNOWN_PORTS[port] || null;
          const address = name.substring(0, name.lastIndexOf(':')) || '*';
          const isDevHub = pid === currentPid || port === 3333;

          ports.push({
            port,
            pid,
            command,
            user,
            protocol,
            address,
            url: `http://localhost:${port}`,
            serviceName: known?.name || cleanProcessName(command),
            icon: known?.icon || getProcessIcon(command),
            category: known?.category || 'Processus',
            isDevHub,
            canKill: !isDevHub && pid > 1
          });
        }
      }
    }
  }

  // Tri par numéro de port croissant (avec ports de dev mis en avant)
  ports.sort((a, b) => a.port - b.port);
  return ports;
}

/**
 * Fallback Windows via netstat si PowerShell est indisponible
 */
async function getWindowsPortsFallback() {
  try {
    const { stdout } = await execAsync('netstat -ano -p tcp', { timeout: 4000 });
    const lines = stdout.trim().split('\n');
    const rawPorts = [];
    const seen = new Set();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.includes('LISTENING')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        const localAddr = parts[1];
        const pid = parseInt(parts[parts.length - 1], 10);
        const portMatch = localAddr.match(/:(\d+)$/);

        if (portMatch && !isNaN(pid)) {
          const port = parseInt(portMatch[1], 10);
          const key = `${port}-${pid}`;
          if (!seen.has(key)) {
            seen.add(key);
            rawPorts.push({
              port,
              pid,
              command: 'Processus',
              user: '',
              address: localAddr.substring(0, localAddr.lastIndexOf(':')) || '0.0.0.0'
            });
          }
        }
      }
    }
    return rawPorts;
  } catch {
    return [];
  }
}

/**
 * Parsing sous Windows via PowerShell
 */
async function getWindowsPorts() {
  const psScript = `
    $procTable = @{}
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $procTable[[int]$_.Id] = $_.ProcessName }
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $owningPid = [int]$_.OwningProcess
      $pName = if ($procTable.ContainsKey($owningPid)) { $procTable[$owningPid] } else { 'System' }
      [PSCustomObject]@{
        port = $_.LocalPort
        pid = $owningPid
        command = $pName
        user = ''
        address = $_.LocalAddress
      }
    } | ConvertTo-Json -Compress
  `;

  let parsed = [];

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ], { timeout: 6000 });

    if (stdout.trim()) {
      const res = JSON.parse(stdout.trim());
      parsed = Array.isArray(res) ? res : [res];
    }
  } catch (err) {
    console.warn('⚠️ [Ports Windows] Erreur PowerShell, fallback netstat:', err.message);
    parsed = await getWindowsPortsFallback();
  }

  if (!parsed.length) return [];

  const currentPid = process.pid;
  const seen = new Set();
  const ports = [];

  for (const item of parsed) {
    const port = parseInt(item.port, 10);
    const pid = parseInt(item.pid, 10);
    if (!port || isNaN(port)) continue;

    const key = `${port}-${pid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const known = KNOWN_PORTS[port] || null;
    const isDevHub = pid === currentPid || port === 3333;
    const command = item.command || 'Processus';

    ports.push({
      port,
      pid,
      command,
      user: item.user || '',
      protocol: 'TCP',
      address: item.address || '0.0.0.0',
      url: `http://localhost:${port}`,
      serviceName: known?.name || cleanProcessName(command),
      icon: known?.icon || getProcessIcon(command),
      category: known?.category || 'Processus',
      isDevHub,
      canKill: !isDevHub && pid > 4
    });
  }

  ports.sort((a, b) => a.port - b.port);
  return ports;
}

/**
 * Tue un processus par son PID ou son Port de manière sécurisée
 */
export async function killProcess(pid, port = null) {
  const currentPid = process.pid;

  if (pid === currentPid || port === 3333) {
    throw new Error('Impossible d\'arrêter le processus de DevHub lui-même.');
  }

  if (pid <= 1) {
    throw new Error('Action refusée sur un processus système vital (PID <= 1).');
  }

  const platform = os.platform();

  if (platform === 'win32') {
    try {
      await execAsync(`taskkill /F /PID ${pid}`);
    } catch {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Stop-Process -Id ${pid} -Force`
      ]);
    }
  } else {
    // macOS et Linux
    await execAsync(`kill -9 ${pid}`);
  }

  console.log(`🛑 [Ports] Processus PID ${pid} (Port ${port || 'N/A'}) arrêté avec succès.`);
  
  // Attendre 200ms que l'OS libère le socket puis renvoyer la liste actualisée
  await new Promise((r) => setTimeout(r, 200));
  cachedPorts = null;
  lastPortsFetchTime = 0;
  return await getListeningPorts(true);
}

/**
 * Nettoie le nom du processus pour un affichage lisible
 */
function cleanProcessName(name) {
  if (!name) return 'Inconnu';
  const clean = name.split(/[\/\\]/).pop();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Assigne une icône intelligente selon le type de commande
 */
function getProcessIcon(cmd) {
  const c = (cmd || '').toLowerCase();
  if (c.includes('node') || c.includes('npm') || c.includes('vite') || c.includes('next')) return '🟢';
  if (c.includes('python') || c.includes('uvicorn') || c.includes('gunicorn')) return '🐍';
  if (c.includes('docker') || c.includes('com.docker')) return '🐳';
  if (c.includes('ollama')) return '🦙';
  if (c.includes('postgres')) return '🐘';
  if (c.includes('mysql') || c.includes('mariadb')) return '🐬';
  if (c.includes('redis')) return '🔴';
  if (c.includes('mongo')) return '🍃';
  if (c.includes('java') || c.includes('spring')) return '☕';
  if (c.includes('go') || c.includes('hugo')) return '🐹';
  if (c.includes('rust') || c.includes('cargo')) return '🦀';
  if (c.includes('ruby')) return '💎';
  if (c.includes('php')) return '🐘';
  if (c.includes('code') || c.includes('cursor') || c.includes('zed')) return '💻';
  if (c.includes('controlcenter') || c.includes('rapportd')) return '🍏';
  return '🔌';
}

export default {
  getListeningPorts,
  killProcess
};
