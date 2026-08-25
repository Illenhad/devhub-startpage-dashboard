/**
 * Widget Informations Système Multi-OS (RAM, Disque, CPU)
 */

class SystemWidget {
  constructor() {
    this.autoRefresh = false;
    this.intervalSeconds = 5;
    this.timerId = null;

    // Elements
    this.refreshBtn = document.getElementById('sys-refresh-btn');
    this.autoToggle = document.getElementById('sys-auto-toggle');
    this.intervalSelect = document.getElementById('sys-interval-select');

    this.ramPercent = document.getElementById('ram-percent');
    this.ramBar = document.getElementById('ram-bar');
    this.ramUsed = document.getElementById('ram-used');
    this.ramFree = document.getElementById('ram-free');

    this.diskPercent = document.getElementById('disk-percent');
    this.diskBar = document.getElementById('disk-bar');
    this.diskUsed = document.getElementById('disk-used');
    this.diskAvail = document.getElementById('disk-avail');

    this.sysUptime = document.getElementById('sys-uptime') || document.getElementById('mac-uptime');
    this.sysCpu = document.getElementById('sys-cpu') || document.getElementById('mac-cpu');
    this.sysArch = document.getElementById('sys-arch') || document.getElementById('mac-arch');
    this.sysTemp = document.getElementById('sys-temp') || document.getElementById('mac-temp');
    this.sysTempState = document.getElementById('sys-temp-state') || document.getElementById('mac-temp-state');

    this.bindEvents();
    this.loadStats();
  }

  bindEvents() {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.loadStats(true));
    }

    if (this.autoToggle) {
      this.autoToggle.addEventListener('change', (e) => {
        this.autoRefresh = e.target.checked;
        this.updateAutoRefresh();
      });
    }

    if (this.intervalSelect) {
      this.intervalSelect.addEventListener('change', (e) => {
        this.intervalSeconds = parseInt(e.target.value, 10) || 5;
        if (this.autoRefresh) {
          this.updateAutoRefresh();
        }
      });
    }
  }

  updateAutoRefresh() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.autoRefresh) {
      this.timerId = setInterval(() => this.loadStats(false), this.intervalSeconds * 1000);
      const indicator = document.getElementById('auto-refresh-indicator');
      if (indicator) indicator.classList.remove('hidden');
    } else {
      const indicator = document.getElementById('auto-refresh-indicator');
      if (indicator) indicator.classList.add('hidden');
    }
  }

  async loadStats(isManual = false) {
    if (isManual && this.refreshBtn) {
      const icon = this.refreshBtn.querySelector('i') || this.refreshBtn;
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 600);
    }

    try {
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error('Erreur API');
      const data = await res.json();
      this.render(data);
    } catch (err) {
      console.error('Erreur chargement système:', err);
    }
  }

  render(data) {
    const { memory, disk, uptime, cpuModel, cpuCores, arch } = data;

    // RAM
    if (memory) {
      if (this.ramPercent) this.ramPercent.textContent = `${memory.percent}%`;
      if (this.ramUsed) this.ramUsed.textContent = `${memory.used} / ${memory.total}`;
      if (this.ramFree) this.ramFree.textContent = `${memory.free} libre`;
      if (this.ramBar) {
        this.ramBar.style.width = `${memory.percent}%`;
        // Coloration dynamique
        this.ramBar.className = 'h-full rounded-full transition-all duration-500 ' + 
          (memory.percent > 85 ? 'bg-rose-500' : memory.percent > 70 ? 'bg-amber-500' : 'bg-emerald-500');
      }
    }

    // Disque
    if (disk) {
      if (this.diskPercent) this.diskPercent.textContent = `${disk.percent}%`;
      if (this.diskUsed) this.diskUsed.textContent = `${disk.used} / ${disk.total}`;
      if (this.diskAvail) this.diskAvail.textContent = `${disk.available} dispo`;
      if (this.diskBar) {
        this.diskBar.style.width = `${disk.percent}%`;
        this.diskBar.className = 'h-full rounded-full transition-all duration-500 ' + 
          (disk.percent > 90 ? 'bg-rose-500' : disk.percent > 75 ? 'bg-amber-500' : 'bg-indigo-500');
      }
    }

    // CPU / Uptime & OS
    if (this.sysUptime && uptime) this.sysUptime.textContent = uptime;
    if (this.sysCpu && cpuModel) this.sysCpu.textContent = `${cpuModel.split('@')[0].trim()} (${cpuCores} cœurs)`;
    if (this.sysArch) {
      const p = data.platform || 'OS';
      const pIcon = p === 'macOS' ? '🍏 ' : p === 'Windows' ? '🪟 ' : p === 'Linux' ? '🐧 ' : '';
      this.sysArch.textContent = `${pIcon}${p} • ${arch || '64-bit'}`;
    }

    // Titre de module dynamique
    const sysTitleEl = document.getElementById('sys-module-title');
    if (sysTitleEl && data.platform) {
      sysTitleEl.textContent = `Système ${data.platform}`;
    }

    // Température
    const { temperature } = data;
    if (temperature && this.sysTemp) {
      this.sysTemp.textContent = temperature.celsius || '-- °C';
      if (this.sysTempState) {
        this.sysTempState.textContent = temperature.state || 'Optimal';
      }
      if (temperature.value) {
        this.sysTemp.className = 'font-mono font-bold text-xs ' + 
          (temperature.value > 75 ? 'text-rose-400' : temperature.value > 55 ? 'text-amber-400' : 'text-emerald-400');
      }
    }
  }
}

window.SystemWidget = SystemWidget;
