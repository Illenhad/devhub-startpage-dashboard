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

    this.dropdownTrigger = document.getElementById('theme-dropdown-trigger');
    this.dropdownMenu = document.getElementById('theme-dropdown-menu');
    this.quickModeBtn = document.getElementById('theme-quick-mode-btn');
    this.quickModeIcon = document.getElementById('theme-quick-mode-icon');
    this.activeIconEl = document.getElementById('theme-active-icon');
    this.activeNameEl = document.getElementById('theme-active-name');

    this.presets = {
      standard: { name: 'Standard', icon: '🔷', color: '#6366f1' },
      code: { name: 'Code', icon: '💻', color: '#10b981' },
      reading: { name: 'Lecture', icon: '📖', color: '#d97706' },
      performance: { name: 'Perfs', icon: '⚡', color: '#ec4899' }
    };

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
    // 1. Bouton ouverture / fermeture dropdown d'ambiance
    if (this.dropdownTrigger && this.dropdownMenu) {
      this.dropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dropdownMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!this.dropdownMenu.contains(e.target) && !this.dropdownTrigger.contains(e.target)) {
          this.dropdownMenu.classList.add('hidden');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.dropdownMenu.classList.add('hidden');
        }
      });
    }

    // 2. Bouton bascule rapide Clair/Sombre (1-Clic)
    if (this.quickModeBtn) {
      this.quickModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const nextMode = this.currentMode === 'dark' ? 'light' : 'dark';
        this.setMode(nextMode);
      });
    }

    // 3. Boutons de mode lumineux (Système, Clair, Sombre)
    document.querySelectorAll('button[data-theme-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const choice = btn.getAttribute('data-theme-btn');
        this.setMode(choice);
      });
    });

    // 4. Boutons de preset d'ambiance (Standard, Code, Lecture, Performance)
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

    // 1. Appliquer le mode Clair / Sombre
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

    // 2. Appliquer le Preset d'Ambiance
    root.setAttribute('data-theme-preset', this.currentPreset);
    if (body) {
      body.setAttribute('data-theme-preset', this.currentPreset);
    }

    // 3. Mettre à jour le bouton déclencheur de thème dans le header
    const activeInfo = this.presets[this.currentPreset] || this.presets.standard;
    if (this.activeIconEl) this.activeIconEl.textContent = activeInfo.icon;
    if (this.activeNameEl) this.activeNameEl.textContent = activeInfo.name;

    // 4. Mettre à jour l'icône du basculeur rapide Clair/Sombre
    if (this.quickModeIcon) {
      if (isDark) {
        this.quickModeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>`;
        if (this.quickModeBtn) this.quickModeBtn.title = "Passer en Mode Clair";
      } else {
        this.quickModeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>`;
        if (this.quickModeBtn) this.quickModeBtn.title = "Passer en Mode Sombre";
      }
    }

    // 5. Mettre à jour l'état visuel des boutons de Mode
    document.querySelectorAll('button[data-theme-btn]').forEach(btn => {
      const mode = btn.getAttribute('data-theme-btn');
      const isActive = mode === this.currentMode;

      if (isActive) {
        btn.className = 'theme-toggle-btn p-1.5 rounded-xl flex items-center justify-center gap-1 bg-brand-500 text-white shadow-sm font-bold transition-all text-xs cursor-pointer';
      } else {
        btn.className = 'theme-toggle-btn p-1.5 rounded-xl flex items-center justify-center gap-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all font-medium text-xs cursor-pointer';
      }
    });

    // 6. Mettre à jour l'état visuel des boutons de Preset
    document.querySelectorAll('button[data-theme-preset]').forEach(btn => {
      const preset = btn.getAttribute('data-theme-preset');
      const isActive = preset === this.currentPreset;

      if (isActive) {
        btn.className = 'theme-preset-btn p-2 rounded-2xl flex items-center gap-2 bg-brand-500/20 border border-brand-500/50 text-brand-300 shadow-sm font-bold transition-all text-xs cursor-pointer';
      } else {
        btn.className = 'theme-preset-btn p-2 rounded-2xl flex items-center gap-2 border border-zinc-800/80 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all text-xs cursor-pointer';
      }
    });

    // 7. Mettre à jour la Favicon
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(activeInfo.color)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/><path d='m14 9 3 3-3 3'/></svg>`;
    }
  }
}

// Helpers globaux
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

window.ThemeManager = ThemeManager;
