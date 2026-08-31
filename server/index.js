import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Garantir l'accès aux commandes globales (Docker, Ollama, brew, etc.) sous tous les gestionnaires de service (LaunchAgent, systemd)
const extraPaths = [
  '/usr/local/bin',
  '/usr/local/sbin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  `${process.env.HOME || ''}/.docker/bin`,
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin'
];
const currentPath = process.env.PATH || '';
process.env.PATH = Array.from(new Set([...extraPaths, ...currentPath.split(':')])).filter(Boolean).join(':');

import systemRoutes from './routes/system.js';
import dockerRoutes from './routes/docker.js';
import ollamaRoutes from './routes/ollama.js';
import rssRoutes from './routes/rss.js';
import settingsRoutes from './routes/settings.js';
import watchRoutes from './routes/watch.js';
import portsRoutes from './routes/ports.js';
import { startPeriodicCrawler } from './services/watchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3333;

// Middleware avec limite étendue à 50mb pour supporter les gros fichiers et images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir les fichiers statiques du frontend (sans cache pour prise en compte immédiate)
app.use(express.static(publicPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// API Routes
app.use('/api/system', systemRoutes);
app.use('/api/docker', dockerRoutes);
app.use('/api/ollama', ollamaRoutes);
app.use('/api/rss', rssRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/watch', watchRoutes);
app.use('/api/ports', portsRoutes);

// Démarrer le robot d'exploration de veille en arrière-plan (toutes les 15 minutes)
startPeriodicCrawler(15);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Middleware global de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('⚠️ [Erreur Serveur]:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: 'Erreur interne du serveur',
      message: err.message || 'Une erreur inattendue est survenue'
    });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 Dev Hub Dashboard en ligne !`);
  console.log(`  🔗 URL locale : http://localhost:${PORT}`);
  console.log(`  📂 Interface  : ${publicPath}`);
  console.log(`======================================================\n`);
});
