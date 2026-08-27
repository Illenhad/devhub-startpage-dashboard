/**
 * Gestionnaire Avancé de Thèmes & d'Ambiances (Synchronisé SQLite & Multi-Navigateurs)
 * - Modes Lumineux : Système (suit l'OS), Clair, Sombre
 * - Ambiances / Presets : Standard (Moderne), Code (IDE/Terminal), Lecture (Sérénité/Sérif), Performance (Cyber/Monitoring)
 */

class ThemeManager {
  constructor() {
    this.currentMode = localStorage.getItem('devhub_theme_mode') || localStorage.getItem('mac_theme_mode') || 'system';
    this.currentPreset = localStorage.getItem('devhub_theme_preset') || localStorage.getItem('mac_theme_preset') || 'standard';

    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', () => {
      if (this.currentMode === 'system') {
        this.applyTheme();
      }
    });

    this.bindEvents();
    this.applyTheme();
    this.syncFromBackend();
  }

  async syncFromBackend() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const settings = await res.json();
        const hasLocalMode = localStorage.getItem('devhub_theme_mode') || localStorage.getItem('mac_theme_mode');
        const hasLocalPreset = localStorage.getItem('devhub_theme_preset') || localStorage.getItem('mac_theme_preset');
        let changed = false;

        // Ne synchroniser depuis SQLite que si aucun choix local n'est stocké
        if (!hasLocalMode && settings.theme_mode && settings.theme_mode !== this.currentMode) {
          this.currentMode = settings.theme_mode;
          localStorage.setItem('devhub_theme_mode', this.currentMode);
          changed = true;
        }

        if (!hasLocalPreset && settings.theme_preset && settings.theme_preset !== this.currentPreset) {
          this.currentPreset = settings.theme_preset;
          localStorage.setItem('devhub_theme_preset', this.currentPreset);
          changed = true;
        }

        if (changed) {
          this.applyTheme();
        }
      }
    } catch {}
  }

  bindEvents() {
    // Boutons de mode lumineux (Système, Clair, Sombre)
    document.querySelectorAll('button[data-theme-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const choice = btn.getAttribute('data-theme-btn');
        this.setMode(choice);
      });
    });

    // Boutons de preset d'ambiance (Standard, Code, Lecture, Performance)
    document.querySelectorAll('button[data-theme-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const preset = btn.getAttribute('data-theme-preset');
        this.setPreset(preset);
      });
    });
  }

  setMode(mode) {
    if (!['system', 'light', 'dark'].includes(mode)) return;
    this.currentMode = mode;
    localStorage.setItem('devhub_theme_mode', mode);
    this.applyTheme();

    // Persistance SQLite partagée
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'theme_mode', value: mode })
    }).catch(() => {});
  }

  setPreset(preset) {
    if (!['standard', 'code', 'reading', 'performance'].includes(preset)) return;
    this.currentPreset = preset;
    localStorage.setItem('devhub_theme_preset', preset);
    this.applyTheme();

    // Persistance SQLite partagée
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'theme_preset', value: preset })
    }).catch(() => {});
  }

  applyTheme() {
    const isSystemDark = this.mediaQuery ? this.mediaQuery.matches : true;
    const isDark = this.currentMode === 'dark' || (this.currentMode === 'system' && isSystemDark);

    const root = document.documentElement;
    const body = document.body;

    // 1. Appliquer le mode Clair / Sombre sur HTML et BODY
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      if (body) {
        body.classList.add('dark');
        body.classList.remove('light');
      }
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      if (body) {
        body.classList.remove('dark');
        body.classList.add('light');
      }
    }

    // 2. Appliquer le Preset d'Ambiance sur HTML et BODY
    root.setAttribute('data-theme-preset', this.currentPreset);
    if (body) {
      body.setAttribute('data-theme-preset', this.currentPreset);
    }

    // 3. Mettre à jour l'état visuel STRICTEMENT des boutons de Mode (balises <button>)
    document.querySelectorAll('button[data-theme-btn]').forEach(btn => {
      const mode = btn.getAttribute('data-theme-btn');
      const isActive = mode === this.currentMode;

      if (isActive) {
        btn.className = 'theme-toggle-btn p-1.5 rounded-xl flex items-center justify-center bg-brand-500 text-white shadow-sm font-bold transition-all text-xs cursor-pointer';
      } else {
        btn.className = 'theme-toggle-btn p-1.5 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all font-semibold text-xs cursor-pointer';
      }
    });

    // 4. Mettre à jour l'état visuel STRICTEMENT des boutons de Preset (balises <button>)
    document.querySelectorAll('button[data-theme-preset]').forEach(btn => {
      const preset = btn.getAttribute('data-theme-preset');
      const isActive = preset === this.currentPreset;

      if (isActive) {
        btn.className = 'theme-preset-btn px-2 py-1 rounded-xl flex items-center gap-1 bg-brand-500 text-white shadow-sm font-bold transition-all text-xs cursor-pointer';
      } else {
        btn.className = 'theme-preset-btn px-2 py-1 rounded-xl flex items-center gap-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all font-medium text-xs cursor-pointer';
      }
    });

    // 5. Mettre à jour la Favicon du navigateur selon le Preset actif
    const themeColors = {
      standard: '#6366f1',
      code: '#10b981',
      reading: '#d97706',
      performance: '#ec4899'
    };
    const activeColor = themeColors[this.currentPreset] || '#6366f1';
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(activeColor)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/><path d='m14 9 3 3-3 3'/></svg>`;
    }
  }
}

// Helpers globaux pour déclenchement direct
window.setAppThemeMode = (mode) => {
  if (window.themeManager) {
    window.themeManager.setMode(mode);
  } else {
    localStorage.setItem('devhub_theme_mode', mode);
    location.reload();
  }
};

window.setAppThemePreset = (preset) => {
  if (window.themeManager) {
    window.themeManager.setPreset(preset);
  } else {
    localStorage.setItem('devhub_theme_preset', preset);
    location.reload();
  }
};

// Initialisation globale
window.ThemeManager = ThemeManager;
