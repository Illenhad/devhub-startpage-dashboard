# Dev Hub — Tableau de Bord & Startpage Universelle (macOS, Windows, Linux)

Une page de démarrage de navigateur web moderne, ultra-légère, esthétique et multi-thèmes, conçue pour tourner en local sur votre machine (**macOS**, **Windows** ou **Linux**) afin de surveiller vos ressources système, piloter vos conteneurs Docker, veiller sur vos flux RSS & mots-clés et discuter avec vos modèles d'IA locaux via Ollama (AI Studio).

---

## Fonctionnalités Principales

### 1. 🖥️ Moniteur Système Multi-OS
- **Surveillance de la mémoire RAM** : Mesure précise de la RAM utilisée, libre et détaillée selon l'OS (Active, Wired, Cache, Buffers, Swap).
- **Disques & Partitions** : Détection des disques et volumes montés (`Macintosh HD`, lecteurs Windows `C:`, `D:`, partitions Linux).
- **Moniteur de Processus & Top Consommateurs** : Liste triable et filtrable avec PID, utilisateur, CPU%, Mémoire et temps d'activité.
- **Détection des Fichiers Volumineux** : Spotlight instantané (macOS) ou scanner récursif universel (Windows & Linux) avec bouton pour révéler directement le fichier dans le gestionnaire de fichiers natif (Finder, Explorateur Windows, Dossier Linux).
- **Température & État thermique** : Mesure et indicateur de santé en temps réel.
- **Contrôle d'actualisation** : 
  - Rafraîchissement automatique **désactivé par défaut**.
  - Bouton d'actualisation manuelle immédiate.
  - Interrupteur (toggle) pour activer le rafraîchissement automatique avec choix de l'intervalle (**2s, 5s, 10s, 30s**).

### 2. 🐳 Gestionnaire Docker
- **Détection automatique du démon Docker** : Pastille de statut en direct (*Vert : Connecté*, *Rouge : Démon inactif*).
- **Liste des conteneurs locaux** : Visualisation de chaque conteneur avec nom, image, ports mappés et statut d'exécution.
- **Actions rapides en direct** : Boutons pour Démarrer (`start`), Arrêter (`stop`), Redémarrer (`restart`) ou Supprimer les conteneurs arrêtés (`prune`).
- **Inspection des Logs & Métriques** : Visualiseur de journaux en direct et monitoring des flux I/O / CPU conteneurisés.

### 3. 🦙 AI Studio (Ollama & IA Locale)
- **Discussion Multi-Tours & Modèles Locaux** : Compatible avec tous les modèles Ollama installés.
- **🧠 Titrage Automatique Intelligent par IA** : Synthèse percutante de 3 à 5 mots du sujet de la discussion dès le premier message ou via le bouton **✨**.
- **✏️ Renommage interactif inline** et persistance des sessions.
- **Personas intégrés & Boutons de rejeu / régénération de prompts**.
- **Rendu Markdown enrichi & Copie de code en 1 clic**.

### 4. 📰 Veille Technologique & Lecteur RSS
- **Période de veille ciblée** : Récupération et affichage limités à la **dernière semaine max (7 jours)** pour une actualité toujours fraîche et pertinente.
- **Crawler automatique en arrière-plan** toutes les 15 minutes.
- **Filtres par mots-clés de veille** (Google News RSS FR) et suivi de flux RSS personnalisés avec badges dynamiques d'articles non lus.
- **Purge automatique** des articles lus après 1 jour (24h) pour garder une interface toujours épurée et performante.

### 5. 🎨 Personnalisation & Thèmes
- **4 Ambiances Visuelles** : *Standard* (Moderne / Slate), *Code* (Monokai Pro IDE), *Lecture* (Typographie Sérif apaisante), *Performance* (Monitoring Cyber High-Tech).
- **Modes Lumineux** : *🖥️ Auto (Système)*, *☀️ Clair*, *🌙 Sombre*.

### 6. ⚡ Barre d'accueil & Recherche Universelle
- Horloge numérique dynamique et date locale.
- Barre de recherche épurée avec **Startpage par défaut** (sélecteur de moteur : **Startpage**, **Google**, **DuckDuckGo**, **Ecosia**, **Qwant**, **Bing** ou saisie directe d'URL / localhost) et raccourci clavier `/`.
- Mémorisation automatique de votre moteur de recherche favori dans SQLite.

---

## Structure du Projet

```text
devhub-startpage-dashboard/
├── server/
│   ├── index.js              # Point d'entrée serveur Express & routes statiques
│   ├── routes/
│   │   ├── system.js         # API RAM, Disque, CPU, Uptime
│   │   ├── docker.js         # API Conteneurs & Actions Docker
│   │   ├── ollama.js         # API Détection modèles & Streaming Ollama
│   │   ├── rss.js            # API Flux RSS & Purge automatique
│   │   ├── settings.js       # API Préférences & Thèmes SQLite
│   │   └── watch.js          # API Mots-clés de veille technologique
│   └── services/
│       ├── systemService.js  # Métriques système multi-plateformes (macOS, Windows, Linux)
│       ├── dockerService.js  # Wrapper Docker CLI & gestion du démon
│       ├── ollamaService.js  # Connecteur HTTP & Streaming SSE Ollama
│       ├── rssService.js     # Parser RSS XML & fetcher
│       ├── dbService.js      # Base de données SQLite embarquée (WAL mode)
│       └── watchService.js   # Crawler & veille d'articles en arrière-plan
├── public/
│   ├── index.html            # Interface utilisateur Dark Theme & Responsive
│   ├── css/
│   │   └── styles.css        # Styles, animations et glassmorphism
│   └── js/
│       ├── app.js            # Initialisation globale, horloge & recherche
│       ├── systemWidget.js   # Logique widget RAM/Disque/Auto-refresh
│       ├── systemFullWidget.js # Vue complète Processus/Disques/Gros fichiers
│       ├── dockerWidget.js   # Logique widget Docker & actions
│       ├── dockerFullWidget.js # Vue complète Docker & logs
│       ├── ollamaWidget.js   # Logique widget Ollama & streaming
│       ├── ollamaFullWidget.js # Vue complète Ollama Studio
│       ├── rssWidget.js      # Logique widget RSS
│       ├── rssFullWidget.js  # Vue complète Veille & Flux RSS
│       └── themeManager.js   # Gestionnaire de thèmes et d'ambiances
├── scripts/
│   └── autostart.js          # Script universel d'autostart (LaunchAgent, systemd, Windows Startup)
├── Makefile                  # Raccourcis de commandes Make
├── package.json              # Dépendances du projet
└── README.md                 # Documentation
```

---

## Instructions d'Installation et de Lancement

### 1. Prérequis
- **Node.js** (version 18 ou supérieure)
- **Docker Desktop** *(optionnel, si vous utilisez des conteneurs)*
- **Ollama** *(optionnel, si vous utilisez des modèles IA locaux)*

### 2. Installation des dépendances
Rendez-vous dans le répertoire du projet et installez les paquets :
```bash
make install
# ou : npm install
```

### 3. Lancer l'application manuellement
Démarrez le serveur local :
```bash
make dev
# ou : npm start / npm run dev
```

L'application est disponible immédiatement sur :  
👉 **`http://localhost:3333`**

---

## ⚡ Démarrage Automatique au Démarrage de la Machine (macOS, Windows, Linux)

Pour que le tableau de bord tourne silencieusement en tâche de fond dès l'ouverture de session :

### Activer le démarrage automatique :
```bash
make autostart-enable
# ou : npm run autostart:enable
```

### Vérifier le statut :
```bash
make autostart-status
# ou : npm run autostart:status
```

### Désactiver le démarrage automatique :
```bash
make autostart-disable
# ou : npm run autostart:disable
```

Les journaux d'activité sont consultables dans `devhub.log` et `devhub.err.log` (ou `data/server.log`).

---

## Configurer comme Page de Démarrage de votre Navigateur

Pour que cette page s'ouvre automatiquement à chaque nouvel onglet ou ouverture de votre navigateur :

1. **Safari** :  
   - Allez dans *Safari > Réglages > Général*.  
   - Dans *Nouvelles fenêtres s'ouvrent avec* : choisissez *Page d'accueil*.  
   - Définissez l'URL de la page d'accueil sur `http://localhost:3333`.

2. **Google Chrome / Brave / Arc** :  
   - Allez dans *Paramètres > Au démarrage*.  
   - Cochez *Ouvrir une page spécifique ou un ensemble de pages* et ajoutez `http://localhost:3333`.  
   - *(Optionnel)* Vous pouvez installer une extension de type *New Tab Redirect* pour rediriger chaque nouvel onglet vers `http://localhost:3333`.

---

## Configuration avancée

- **Changer le port d'écoute** : Définissez la variable d'environnement `PORT` (ex: `PORT=4000 npm start`).
- **Hôte Ollama personnalisé** : Définissez la variable `OLLAMA_HOST` (ex: `OLLAMA_HOST=http://192.168.1.50:11434 npm start`).
