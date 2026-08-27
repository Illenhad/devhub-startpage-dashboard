/**
 * Gestionnaire d'Agencement de l'Écran d'Accueil (DevHub)
 * - Système de Grille 2D Modulaire complet :
 *   * Largeur en colonnes : 1x, 2x, 3x, 4x (col-span-1..4)
 *   * Hauteur en rangées de grille : 1x, 2x, 3x, 4x (row-span-1..4)
 * - Personnalisation centralisée exclusivement dans le menu "Disposer les widgets"
 * - Cartes du dashboard épurées (aucune icône parasite en mode normal)
 * - Redimensionnement 2D interactif et fluide calé sur la grille (étirement du coin ⤡)
 * - Déplacement par boutons d'ordre (← / →) et Drag & Drop pendant l'édition
 * - Masquage et Réaffichage instantané des widgets
 * - Persistance LocalStorage & synchronisation SQLite
 */

class DashboardLayoutManager {
  constructor() {
    this.storageKey = 'devhub_dashboard_layout';
    this.gridContainer = document.getElementById('dashboard-widgets-grid');
    this.customizeToolbar = document.getElementById('dash-customize-toolbar');
    this.customizeToggleBtn = document.getElementById('dash-customize-toggle-btn');
    this.widgetControlsList = document.getElementById('dash-widget-toggles-list');
    this.resetLayoutBtn = document.getElementById('dash-reset-layout-btn');
    this.closeToolbarBtn = document.getElementById('dash-close-toolbar-btn');

    this.isEditing = false;

    this.defaultLayout = [
      { id: 'system', name: 'Système', icon: '💻', size: 1, rowSpan: 1, hidden: false },
      { id: 'docker', name: 'Docker', icon: '🐳', size: 1, rowSpan: 1, hidden: false },
      { id: 'ollama', name: 'AI Studio', icon: '⚡', size: 1, rowSpan: 1, hidden: false },
      { id: 'rss', name: 'Veille & RSS', icon: '📰', size: 1, rowSpan: 1, hidden: false }
    ];

    this.allColClasses = [
      'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4',
      'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4',
      'xl:col-span-1', 'xl:col-span-2', 'xl:col-span-3', 'xl:col-span-4'
    ];

    this.allRowClasses = [
      'row-span-1', 'row-span-2', 'row-span-3', 'row-span-4'
    ];

    this.colClassesMap = {
      1: ['col-span-1', 'md:col-span-1', 'xl:col-span-1'],
      2: ['col-span-1', 'md:col-span-2', 'xl:col-span-2'],
      3: ['col-span-1', 'md:col-span-2', 'xl:col-span-3'],
      4: ['col-span-1', 'md:col-span-2', 'xl:col-span-4']
    };

    this.rowClassesMap = {
      1: ['row-span-1'],
      2: ['row-span-2'],
      3: ['row-span-3'],
      4: ['row-span-4']
    };

    this.layout = this.loadLayout();
    this.draggedCard = null;
    this.placeholder = null;

    this.init();
  }

  init() {
    if (!this.gridContainer) return;

    this.applyLayoutToDOM();
    this.bindEvents();
    this.setupDragAndDrop();
    this.setupCornerResize();
    this.renderToolbarControls();
    this.updateDraggableState();
  }

  // --- Chargement & Sauvegarde ---

  loadLayout() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [];
          for (const item of parsed) {
            const def = this.defaultLayout.find(d => d.id === item.id);
            if (def) {
              // Rétrocompatibilité : si une hauteur en px existait, convertir en rowSpan (1..4)
              let rowSpan = 1;
              if (item.rowSpan && !isNaN(item.rowSpan)) {
                rowSpan = Math.max(1, Math.min(4, parseInt(item.rowSpan, 10)));
              } else if (item.height && !isNaN(item.height)) {
                const h = parseInt(item.height, 10);
                if (h >= 550) rowSpan = 4;
                else if (h >= 400) rowSpan = 3;
                else if (h >= 270) rowSpan = 2;
                else rowSpan = 1;
              }

              merged.push({
                id: item.id,
                name: def.name,
                icon: def.icon,
                size: Math.max(1, Math.min(4, parseInt(item.size, 10) || 1)),
                rowSpan: rowSpan,
                hidden: Boolean(item.hidden)
              });
            }
          }
          for (const def of this.defaultLayout) {
            if (!merged.some(m => m.id === def.id)) {
              merged.push({ ...def });
            }
          }
          return merged;
        }
      }
    } catch (err) {
      console.warn('Erreur chargement disposition widgets:', err);
    }
    return JSON.parse(JSON.stringify(this.defaultLayout));
  }

  saveLayout() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.layout));
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'dashboard_layout',
          value: JSON.stringify(this.layout)
        })
      }).catch(() => {});
    } catch (err) {
      console.warn('Erreur sauvegarde disposition widgets:', err);
    }
  }

  // --- Application dans le DOM ---

  applyLayoutToDOM() {
    if (!this.gridContainer) return;

    const cardsMap = new Map();
    const cards = this.gridContainer.querySelectorAll('[data-widget-id]');
    cards.forEach(card => {
      const id = card.getAttribute('data-widget-id');
      cardsMap.set(id, card);
    });

    for (const item of this.layout) {
      const card = cardsMap.get(item.id);
      if (!card) continue;

      // Nettoyer anciennes classes de colonnes et de rangées
      this.allColClasses.forEach(cls => card.classList.remove(cls));
      this.allRowClasses.forEach(cls => card.classList.remove(cls));
      card.style.minHeight = '';

      // Appliquer les classes de grille (largeur en colonnes)
      const colClasses = this.colClassesMap[item.size] || this.colClassesMap[1];
      colClasses.forEach(cls => card.classList.add(cls));

      // Appliquer les classes de grille (hauteur en rangées)
      const rowClasses = this.rowClassesMap[item.rowSpan] || this.rowClassesMap[1];
      rowClasses.forEach(cls => card.classList.add(cls));

      // Visibilité
      if (item.hidden) {
        card.classList.add('hidden');
      } else {
        card.classList.remove('hidden');
      }

      // Réinsérer dans le conteneur dans l'ordre défini
      this.gridContainer.appendChild(card);
    }
  }

  // --- Événements du Menu & Bascule Mode Édition ---

  bindEvents() {
    if (this.customizeToggleBtn) {
      this.customizeToggleBtn.addEventListener('click', () => this.toggleCustomizeToolbar());
    }

    if (this.closeToolbarBtn) {
      this.closeToolbarBtn.addEventListener('click', () => this.closeCustomizeToolbar());
    }

    if (this.resetLayoutBtn) {
      this.resetLayoutBtn.addEventListener('click', () => this.resetLayout());
    }
  }

  toggleCustomizeToolbar() {
    if (!this.customizeToolbar) return;
    this.isEditing = !this.isEditing;

    if (this.isEditing) {
      this.customizeToolbar.classList.remove('hidden');
      this.customizeToggleBtn?.classList.add('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
      this.gridContainer?.classList.add('is-customizing');
    } else {
      this.closeCustomizeToolbar();
    }

    this.updateDraggableState();
    this.renderToolbarControls();
  }

  closeCustomizeToolbar() {
    this.isEditing = false;
    if (this.customizeToolbar) {
      this.customizeToolbar.classList.add('hidden');
    }
    this.customizeToggleBtn?.classList.remove('bg-brand-500/20', 'text-brand-300', 'border-brand-500/40');
    this.gridContainer?.classList.remove('is-customizing');
    this.updateDraggableState();
  }

  updateDraggableState() {
    const cards = this.gridContainer?.querySelectorAll('[data-widget-id]') || [];
    cards.forEach(card => {
      if (this.isEditing) {
        card.setAttribute('draggable', 'true');
        card.classList.add('cursor-grab');
      } else {
        card.setAttribute('draggable', 'false');
        card.classList.remove('cursor-grab', 'cursor-grabbing');
      }
    });
  }

  // --- Rendu du Panneau de Configuration Centralisé ---

  renderToolbarControls() {
    if (!this.widgetControlsList) return;

    const total = this.layout.length;

    this.widgetControlsList.innerHTML = this.layout.map((item, index) => {
      const isVisible = !item.hidden;
      const rowSpan = item.rowSpan || 1;

      return `
        <div class="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-col justify-between gap-2 shadow-sm transition-all hover:border-zinc-700">
          
          <!-- En-tête : Nom + Bouton Visibilité -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base select-none">${item.icon}</span>
              <span class="font-bold text-xs ${isVisible ? 'text-white' : 'text-zinc-500 line-through'} truncate">${item.name}</span>
            </div>

            <!-- Bouton Masquer / Afficher -->
            <button
              type="button"
              onclick="window.dashboardLayoutManager.toggleWidgetVisibility('${item.id}')"
              class="px-2 py-1 rounded-xl text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                isVisible 
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 border border-zinc-700'
              }"
              title="${isVisible ? 'Masquer ce widget' : 'Réafficher ce widget'}"
            >
              <span>${isVisible ? '👁️ Visible' : '🚫 Masqué'}</span>
            </button>
          </div>

          <!-- Sélecteur de Largeur Grille (1x, 2x, 3x, 4x colonnes) -->
          <div class="flex items-center justify-between gap-1 pt-1.5 border-t border-zinc-800/60">
            <span class="text-[10px] text-zinc-400 font-medium">Largeur :</span>
            <div class="flex items-center gap-0.5 bg-zinc-900 p-0.5 rounded-xl border border-zinc-800">
              ${[1, 2, 3, 4].map(s => `
                <button
                  type="button"
                  onclick="window.dashboardLayoutManager.setWidgetSize('${item.id}', ${s})"
                  class="px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                    item.size === s 
                      ? 'bg-brand-500 text-white font-bold shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }"
                  title="${s} colonne(s) sur la grille"
                >
                  ${s}x
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Sélecteur de Hauteur Grille (1x, 2x, 3x, 4x rangées) -->
          <div class="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800/40">
            <span class="text-[10px] text-zinc-400 font-medium">Hauteur :</span>
            <div class="flex items-center gap-0.5 bg-zinc-900 p-0.5 rounded-xl border border-zinc-800">
              ${[1, 2, 3, 4].map(r => `
                <button
                  type="button"
                  onclick="window.dashboardLayoutManager.setWidgetRowSpan('${item.id}', ${r})"
                  class="px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                    rowSpan === r 
                      ? 'bg-brand-500 text-white font-bold shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }"
                  title="${r} rangée(s) de grille"
                >
                  ${r}x
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Réorganisation de l'Ordre (Monter / Descendre) -->
          <div class="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800/40">
            <span class="text-[10px] text-zinc-500 font-mono">Pos. ${index + 1}/${total}</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onclick="window.dashboardLayoutManager.moveWidget('${item.id}', -1)"
                ${index === 0 ? 'disabled class="opacity-25 px-2 py-0.5 text-zinc-600 text-xs rounded-lg cursor-not-allowed"' : 'class="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs cursor-pointer transition-all"'}
                title="Déplacer vers la gauche"
              >
                ←
              </button>
              <button
                type="button"
                onclick="window.dashboardLayoutManager.moveWidget('${item.id}', 1)"
                ${index === total - 1 ? 'disabled class="opacity-25 px-2 py-0.5 text-zinc-600 text-xs rounded-lg cursor-not-allowed"' : 'class="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs cursor-pointer transition-all"'}
                title="Déplacer vers la droite"
              >
                →
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  // --- Actions Utilisateur Centralisées ---

  setWidgetSize(widgetId, size) {
    const item = this.layout.find(w => w.id === widgetId);
    if (!item) return;

    item.size = Math.max(1, Math.min(4, size));
    this.applyLayoutToDOM();
    this.saveLayout();
    this.renderToolbarControls();
  }

  setWidgetRowSpan(widgetId, rowSpan) {
    const item = this.layout.find(w => w.id === widgetId);
    if (!item) return;

    item.rowSpan = Math.max(1, Math.min(4, rowSpan));
    this.applyLayoutToDOM();
    this.saveLayout();
    this.renderToolbarControls();
  }

  toggleWidgetVisibility(widgetId) {
    const item = this.layout.find(w => w.id === widgetId);
    if (!item) return;

    item.hidden = !item.hidden;
    this.applyLayoutToDOM();
    this.saveLayout();
    this.renderToolbarControls();
  }

  moveWidget(widgetId, direction) {
    const currentIndex = this.layout.findIndex(w => w.id === widgetId);
    if (currentIndex === -1) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= this.layout.length) return;

    const temp = this.layout[currentIndex];
    this.layout[currentIndex] = this.layout[targetIndex];
    this.layout[targetIndex] = temp;

    this.applyLayoutToDOM();
    this.saveLayout();
    this.renderToolbarControls();
  }

  resetLayout() {
    if (confirm('Voulez-vous réinitialiser l\'agencement et les tailles de grille d\'origine ?')) {
      this.layout = JSON.parse(JSON.stringify(this.defaultLayout));
      this.applyLayoutToDOM();
      this.saveLayout();
      this.renderToolbarControls();
    }
  }

  // --- Drag & Drop (Actif UNIQUEMENT pendant le mode personnalisation) ---

  setupDragAndDrop() {
    if (!this.gridContainer) return;

    const cards = this.gridContainer.querySelectorAll('[data-widget-id]');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        if (!this.isEditing) {
          e.preventDefault();
          return false;
        }

        this.draggedCard = card;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.getAttribute('data-widget-id'));

        this.createPlaceholder(card);

        setTimeout(() => {
          card.classList.add('widget-dragging');
        }, 0);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('widget-dragging');
        if (this.placeholder && this.placeholder.parentNode) {
          this.placeholder.parentNode.removeChild(this.placeholder);
        }
        this.draggedCard = null;
        this.placeholder = null;

        this.syncLayoutFromDOM();
        this.saveLayout();
        this.renderToolbarControls();
      });

      card.addEventListener('dragover', (e) => {
        if (!this.isEditing || !this.draggedCard || this.draggedCard === card) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = card.getBoundingClientRect();
        const midPointX = rect.left + rect.width / 2;

        if (e.clientX < midPointX) {
          this.gridContainer.insertBefore(this.placeholder, card);
        } else {
          this.gridContainer.insertBefore(this.placeholder, card.nextSibling);
        }
      });
    });

    this.gridContainer.addEventListener('dragover', (e) => {
      if (this.isEditing) e.preventDefault();
    });

    this.gridContainer.addEventListener('drop', (e) => {
      if (!this.isEditing) return;
      e.preventDefault();
      if (this.draggedCard && this.placeholder && this.placeholder.parentNode) {
        this.gridContainer.insertBefore(this.draggedCard, this.placeholder);
        this.placeholder.parentNode.removeChild(this.placeholder);
        this.placeholder = null;
      }
    });
  }

  createPlaceholder(referenceCard) {
    if (this.placeholder && this.placeholder.parentNode) {
      this.placeholder.parentNode.removeChild(this.placeholder);
    }

    this.placeholder = document.createElement('div');
    this.placeholder.className = 'widget-drop-placeholder rounded-3xl border-2 border-dashed border-brand-500/60 bg-brand-500/10 min-h-[160px] animate-pulse flex items-center justify-center';
    
    const widgetId = referenceCard.getAttribute('data-widget-id');
    const item = this.layout.find(w => w.id === widgetId);
    
    const colClasses = this.colClassesMap[item?.size || 1] || this.colClassesMap[1];
    colClasses.forEach(cls => this.placeholder.classList.add(cls));

    const rowClasses = this.rowClassesMap[item?.rowSpan || 1] || this.rowClassesMap[1];
    rowClasses.forEach(cls => this.placeholder.classList.add(cls));

    this.placeholder.innerHTML = `
      <div class="flex items-center gap-2 text-brand-300 text-xs font-bold">
        <span>📍</span>
        <span>Déplacer ici</span>
      </div>
    `;

    referenceCard.parentNode.insertBefore(this.placeholder, referenceCard.nextSibling);
  }

  // --- Redimensionnement 2D Interactif Calé sur la Grille (Coin ⤡) ---

  setupCornerResize() {
    if (!this.gridContainer) return;

    const handles = this.gridContainer.querySelectorAll('.widget-resize-handle');
    handles.forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        if (!this.isEditing) return;

        e.stopPropagation();
        e.preventDefault();

        const card = handle.closest('[data-widget-id]');
        if (!card) return;
        const widgetId = card.getAttribute('data-widget-id');
        const item = this.layout.find(w => w.id === widgetId);
        if (!item) return;

        const startPointerX = e.clientX;
        const startPointerY = e.clientY;
        const startWidth = card.getBoundingClientRect().width;
        const startHeight = card.getBoundingClientRect().height;
        const gridRect = this.gridContainer.getBoundingClientRect();

        // Calcul dynamique des largeurs de colonnes
        const colCount = window.innerWidth >= 1280 ? 4 : (window.innerWidth >= 768 ? 2 : 1);
        const singleColWidth = (gridRect.width - (colCount - 1) * 14) / colCount;

        // Hauteur de base d'une rangée de grille (~215px + 14px de gap = ~229px)
        const singleRowHeight = 229;

        // Badge flottant indiquant les dimensions en unités de grille
        const indicator = document.createElement('div');
        indicator.className = 'fixed z-50 pointer-events-none px-3 py-1.5 rounded-2xl bg-zinc-950/95 text-white font-mono text-xs font-bold shadow-2xl border border-brand-500/60 backdrop-blur flex items-center gap-1.5 transition-all';
        indicator.innerHTML = `<span>📐</span> <span class="size-text">Grille : ${item.size}x × ${item.rowSpan || 1}x</span>`;
        document.body.appendChild(indicator);

        const updateIndicatorPos = (x, y) => {
          indicator.style.left = `${x + 15}px`;
          indicator.style.top = `${y + 15}px`;
        };
        updateIndicatorPos(e.clientX, e.clientY);

        let currentSize = item.size;
        let currentRowSpan = item.rowSpan || 1;
        card.classList.add('ring-2', 'ring-brand-500', 'shadow-2xl');

        const onPointerMove = (moveEvt) => {
          updateIndicatorPos(moveEvt.clientX, moveEvt.clientY);
          const deltaX = moveEvt.clientX - startPointerX;
          const deltaY = moveEvt.clientY - startPointerY;

          // 1. Calcul de la Largeur en colonnes (1x, 2x, 3x, 4x)
          const projectedWidth = startWidth + deltaX;
          let targetSize = 1;
          if (projectedWidth >= singleColWidth * 3.3) {
            targetSize = 4;
          } else if (projectedWidth >= singleColWidth * 2.3) {
            targetSize = 3;
          } else if (projectedWidth >= singleColWidth * 1.3) {
            targetSize = 2;
          } else {
            targetSize = 1;
          }
          targetSize = Math.max(1, Math.min(4, targetSize));

          // 2. Calcul de la Hauteur en rangées de grille (1x, 2x, 3x, 4x)
          const projectedHeight = startHeight + deltaY;
          let targetRowSpan = 1;
          if (projectedHeight >= singleRowHeight * 3.3) {
            targetRowSpan = 4;
          } else if (projectedHeight >= singleRowHeight * 2.3) {
            targetRowSpan = 3;
          } else if (projectedHeight >= singleRowHeight * 1.3) {
            targetRowSpan = 2;
          } else {
            targetRowSpan = 1;
          }
          targetRowSpan = Math.max(1, Math.min(4, targetRowSpan));

          let changed = false;

          if (targetSize !== currentSize) {
            currentSize = targetSize;
            item.size = currentSize;
            this.allColClasses.forEach(cls => card.classList.remove(cls));
            const newColClasses = this.colClassesMap[currentSize] || this.colClassesMap[1];
            newColClasses.forEach(cls => card.classList.add(cls));
            changed = true;
          }

          if (targetRowSpan !== currentRowSpan) {
            currentRowSpan = targetRowSpan;
            item.rowSpan = currentRowSpan;
            this.allRowClasses.forEach(cls => card.classList.remove(cls));
            const newRowClasses = this.rowClassesMap[currentRowSpan] || this.rowClassesMap[1];
            newRowClasses.forEach(cls => card.classList.add(cls));
            changed = true;
          }

          if (changed) {
            indicator.querySelector('.size-text').textContent = `Grille : ${currentSize}x × ${currentRowSpan}x (${currentSize} col × ${currentRowSpan} lig)`;
          }
        };

        const onPointerUp = () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);

          card.classList.remove('ring-2', 'ring-brand-500', 'shadow-2xl');
          if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }

          this.saveLayout();
          this.renderToolbarControls();
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
    });
  }

  syncLayoutFromDOM() {
    const currentCards = Array.from(this.gridContainer.querySelectorAll('[data-widget-id]'));
    const newOrder = [];

    for (const card of currentCards) {
      const id = card.getAttribute('data-widget-id');
      const item = this.layout.find(w => w.id === id);
      if (item) {
        newOrder.push(item);
      }
    }

    for (const item of this.layout) {
      if (!newOrder.some(n => n.id === item.id)) {
        newOrder.push(item);
      }
    }

    this.layout = newOrder;
  }
}

window.DashboardLayoutManager = DashboardLayoutManager;
