const MKPModal = {
  _resolve: null,
  _cleanup: null,
  _mode: 'alert',

  show(options = {}) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._mode = options.mode || 'alert';

      const overlay = document.getElementById('mkp-global-modal');
      const card = document.getElementById('mkp-modal-card');
      const iconBox = document.getElementById('mkp-modal-icon-box');
      const iconSvg = document.getElementById('mkp-modal-icon');
      const titleEl = document.getElementById('mkp-modal-title');
      const msgEl = document.getElementById('mkp-modal-msg');
      const inputEl = document.getElementById('mkp-modal-input');
      const cancelBtn = document.getElementById('mkp-modal-cancel');
      const confirmBtn = document.getElementById('mkp-modal-confirm');

      let finalMsg = options.msg || '';
      if (finalMsg.includes('fetch failed')) {
        finalMsg = '无法连接到云端服务器，请检查网络连接或代理设置。';
      }

      titleEl.textContent = options.title || '提示';
      msgEl.innerHTML = finalMsg;

      iconBox.className = 'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0';
      confirmBtn.className = 'px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 text-white';

      const type = options.type || 'info';
      if (type === 'error') {
        iconBox.classList.add('bg-red-50', 'dark:bg-red-900/20');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
        iconSvg.className = 'w-5 h-5 text-red-500';
        confirmBtn.classList.add('bg-red-500', 'hover:bg-red-600');
      } else if (type === 'success') {
        iconBox.classList.add('bg-green-50', 'dark:bg-green-900/20');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
        iconSvg.className = 'w-5 h-5 text-green-500';
        confirmBtn.classList.add('bg-green-500', 'hover:bg-green-600');
      } else if (type === 'warning') {
        iconBox.classList.add('bg-amber-50', 'dark:bg-amber-900/20');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m0 3.75h.01M10.29 3.86l-7.5 13A1.5 1.5 0 004.08 19.5h15.84a1.5 1.5 0 001.3-2.24l-7.5-13a1.5 1.5 0 00-2.6 0z"/>';
        iconSvg.className = 'w-5 h-5 text-amber-500';
        confirmBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
      } else {
        iconBox.classList.add('theme-bg-soft');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
        iconSvg.className = 'w-5 h-5 theme-text';
        confirmBtn.classList.add('theme-btn-solid');
      }

      confirmBtn.textContent = options.confirmText || (this._mode === 'prompt' ? '保存' : '确定');

      if (this._mode === 'alert') {
        cancelBtn.classList.add('hidden');
      } else {
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = options.cancelText || '取消';
      }

      if (this._mode === 'prompt') {
        inputEl.classList.remove('hidden');
        inputEl.placeholder = options.placeholder || '请输入内容';
        inputEl.value = options.value || '';
      } else {
        inputEl.classList.add('hidden');
        inputEl.value = '';
      }

      const finish = (value) => {
        this.hide();
        if (typeof this._cleanup === 'function') {
          this._cleanup();
          this._cleanup = null;
        }
        setTimeout(() => {
          if (this._resolve) {
            this._resolve(value);
            this._resolve = null;
          }
        }, 200);
      };

      const cancel = () => finish(this._mode === 'prompt' ? null : false);
      const confirm = () => finish(this._mode === 'prompt' ? inputEl.value.trim() : true);

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        } else if (event.key === 'Enter' && this._mode === 'prompt') {
          event.preventDefault();
          confirm();
        }
      };

      overlay.onmousedown = (event) => {
        if (options.allowOutsideClick === true && !event.target.closest('#mkp-modal-card')) {
          cancel();
        }
      };

      cancelBtn.onclick = cancel;
      confirmBtn.onclick = confirm;
      document.addEventListener('keydown', onKeyDown);

      this._cleanup = () => {
        overlay.onmousedown = null;
        cancelBtn.onclick = null;
        confirmBtn.onclick = null;
        document.removeEventListener('keydown', onKeyDown);
      };

      overlay.classList.remove('opacity-0', 'pointer-events-none');
      card.classList.remove('scale-95');

      if (this._mode === 'prompt') {
        requestAnimationFrame(() => {
          inputEl.focus();
          inputEl.select();
        });
      }
    });
  },

  hide() {
    const overlay = document.getElementById('mkp-global-modal');
    const card = document.getElementById('mkp-modal-card');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    card.classList.add('scale-95');
  },

  alert(options) {
    return this.show({ ...options, mode: 'alert' });
  },

  confirm(options) {
    return this.show({ ...options, mode: 'confirm' });
  },

  prompt(options) {
    return this.show({ ...options, mode: 'prompt' });
  }
};

window.MKPModal = MKPModal;
