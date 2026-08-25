import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Vérifie si le démon Docker est actif
 */
export async function isDockerRunning() {
  try {
    const { stdout } = await execAsync('docker info --format "{{.ServerVersion}}"', { timeout: 3000 });
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

/**
 * Récupère la liste de tous les conteneurs Docker avec leur état
 */
export async function getContainers() {
  try {
    const running = await isDockerRunning();
    if (!running) {
      return {
        isRunning: false,
        message: 'Le démon Docker n’est pas en cours d’exécution (Docker Desktop éteint)',
        containers: [],
        count: { running: 0, stopped: 0, total: 0 }
      };
    }

    const { stdout } = await execAsync('docker ps -a --format "{{json .}}"', { timeout: 5000 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    const containers = lines.map(line => {
      try {
        const raw = JSON.parse(line);
        const state = (raw.State || '').toLowerCase();
        const isStateRunning = state === 'running' || (raw.Status?.toLowerCase().includes('up'));

        return {
          id: raw.ID || raw.Id,
          name: (raw.Names || '').replace(/^\//, ''),
          image: raw.Image || '',
          state: isStateRunning ? 'running' : (state || 'exited'),
          isRunning: isStateRunning,
          status: raw.Status || '',
          ports: raw.Ports || '',
          created: raw.CreatedAt || raw.RunningFor || '',
          size: raw.Size || ''
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    const runningCount = containers.filter(c => c.isRunning).length;

    return {
      isRunning: true,
      message: 'Docker est actif et connecté',
      containers,
      count: {
        running: runningCount,
        stopped: containers.length - runningCount,
        total: containers.length
      }
    };
  } catch (err) {
    return {
      isRunning: false,
      message: err.message || 'Impossible de joindre Docker',
      containers: [],
      count: { running: 0, stopped: 0, total: 0 }
    };
  }
}

/**
 * Effectue une action sur un conteneur (start, stop, restart, pause, unpause, remove)
 */
export async function containerAction(containerId, action) {
  const allowedActions = ['start', 'stop', 'restart', 'pause', 'unpause', 'remove'];
  if (!allowedActions.includes(action)) {
    throw new Error(`Action non autorisée: ${action}`);
  }

  // Sanitize containerId (alphanumeric and dashes/underscores only)
  if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
    throw new Error('Identifiant de conteneur invalide');
  }

  try {
    let cmd = `docker ${action} ${containerId}`;
    if (action === 'remove') {
      cmd = `docker rm -f ${containerId}`;
    }

    const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
    return {
      success: true,
      containerId,
      action,
      output: (stdout || stderr || '').trim()
    };
  } catch (err) {
    return {
      success: false,
      containerId,
      action,
      error: err.message
    };
  }
}

/**
 * Récupère les journaux (logs) d'un conteneur
 */
export async function getContainerLogs(containerId, tail = 150) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
    throw new Error('Identifiant de conteneur invalide');
  }

  const safeTail = parseInt(tail, 10) || 150;

  try {
    const { stdout, stderr } = await execAsync(`docker logs --tail ${safeTail} --timestamps ${containerId}`, { timeout: 8000 });
    return {
      success: true,
      containerId,
      logs: (stdout || stderr || '').trim() || 'Aucun log disponible pour ce conteneur.'
    };
  } catch (err) {
    return {
      success: false,
      containerId,
      error: err.message,
      logs: `Erreur lors de la récupération des logs: ${err.message}`
    };
  }
}

/**
 * Récupère les métriques en direct des conteneurs actifs
 */
export async function getDockerStats() {
  try {
    const running = await isDockerRunning();
    if (!running) return { isRunning: false, stats: [] };

    const { stdout } = await execAsync('docker stats --no-stream --format "{{json .}}"', { timeout: 5000 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    const stats = lines.map(line => {
      try {
        const raw = JSON.parse(line);
        return {
          id: raw.ID,
          name: raw.Name,
          cpuPerc: raw.CPUPerc,
          memUsage: raw.MemUsage,
          memPerc: raw.MemPerc,
          netIO: raw.NetIO,
          blockIO: raw.BlockIO
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return { isRunning: true, stats };
  } catch {
    return { isRunning: false, stats: [] };
  }
}

/**
 * Supprime les conteneurs arrêtés (prune)
 */
export async function pruneContainers() {
  try {
    const { stdout } = await execAsync('docker container prune -f', { timeout: 10000 });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
