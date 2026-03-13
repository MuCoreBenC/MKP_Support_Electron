// ==========================================
// 全局日志管理器 (Logger)
// ==========================================
const Logger = {
  _format(level, msg, data) {
    const dataStr = data ? ' | 附加数据: ' + JSON.stringify(data) : '';
    const logStr = `[${level}] ${msg}${dataStr}`;
    
    if (level === 'ERROR') console.error(logStr);
    else if (level === 'WARN') console.warn(logStr);
    else console.log(logStr);

    if (window.mkpAPI && window.mkpAPI.writeLog) {
      window.mkpAPI.writeLog(logStr);
    }
  },
  info: (msg, data) => Logger._format('INFO', msg, data),
  warn: (msg, data) => Logger._format('WARN', msg, data),
  error: (msg, data) => Logger._format('ERROR', msg, data)
};

// ============================================================
// 🚀 MKP 全局 SaaS 级弹窗系统 (点击判定穿透修复版)
// ============================================================
const MKPModal = {
  _resolve: null,

  show: function (options) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      
      const overlay = document.getElementById('mkp-global-modal');
      const card = document.getElementById('mkp-modal-card');
      const iconBox = document.getElementById('mkp-modal-icon-box');
      const iconSvg = document.getElementById('mkp-modal-icon');
      const titleEl = document.getElementById('mkp-modal-title');
      const msgEl = document.getElementById('mkp-modal-msg');
      const cancelBtn = document.getElementById('mkp-modal-cancel');
      const confirmBtn = document.getElementById('mkp-modal-confirm');

      titleEl.textContent = options.title || '提示';

      // 💡 自动拦截并翻译 fetch failed
      let finalMsg = options.msg || '';
      if (finalMsg.includes('fetch failed')) {
          finalMsg = '无法连接到云端服务器，请检查网络连接或代理设置。';
      }
      msgEl.innerHTML = finalMsg;

      const type = options.type || 'info';
      
      iconBox.className = 'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0';
      confirmBtn.className = 'px-5 py-2 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-95 text-white';

      // ... (中间的颜色和图标判断逻辑保持不变) ...
      if (type === 'error') {
        iconBox.classList.add('bg-red-50', 'dark:bg-red-900/20');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
        iconSvg.className = 'w-5 h-5 text-red-500';
        confirmBtn.classList.add('bg-red-500', 'hover:bg-red-600');
        confirmBtn.textContent = options.confirmText || '确定';
      } else if (type === 'success') {
        iconBox.classList.add('bg-green-50', 'dark:bg-green-900/20');
        iconSvg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
        iconSvg.className = 'w-5 h-5 text-green-500';
        confirmBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        confirmBtn.textContent = options.confirmText || '好的';
      } else {
        iconBox.classList.add('theme-bg-soft');
        iconSvg.className = 'w-5 h-5 theme-text';
        confirmBtn.classList.add('theme-btn-solid');
        // ... (省略警告等其他图标)
      }

      if (options.mode === 'alert') {
        cancelBtn.classList.add('hidden');
      } else {
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = options.cancelText || '取消';
      }

      // ==========================================
      // 💡 核心修复区：极其精准的“点击外部”判定算法
      // ==========================================
      // 使用 onmousedown 响应更迅速。只要点击目标的祖先节点不是卡片(#mkp-modal-card)，就统统算作点在了空白处！
      overlay.onmousedown = (e) => {
          if (!e.target.closest('#mkp-modal-card') && options.allowOutsideClick === true) {
              this.cancel();
          }
      };

      // 顺手在 JS 里把实体按钮也强制接管，防止 HTML 里没写 onclick 失效
      cancelBtn.onclick = () => this.cancel();
      confirmBtn.onclick = () => this.confirmBtn();

      // 弹出动画
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      card.classList.remove('scale-95');
    });
  },

  hide: function () {
    const overlay = document.getElementById('mkp-global-modal');
    const card = document.getElementById('mkp-modal-card');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    card.classList.add('scale-95');
  },

  cancel: function () {
    this.hide();
    setTimeout(() => { if (this._resolve) this._resolve(false); }, 200);
  },

  confirmBtn: function () {
    this.hide();
    setTimeout(() => { if (this._resolve) this._resolve(true); }, 200);
  },

  confirm: function (options) { return this.show({ ...options, mode: 'confirm' }); },
  alert: function (options) { return this.show({ ...options, mode: 'alert' }); }
};


// ==========================================
// 1. 全局状态与变量管理
// ==========================================
let selectedVersion = null;
let selectedDate = null;
let selectedPrinter = 'a1';
let selectedBrand = 'bambu';
let currentPrinterSupportedVersions = ['standard', 'quick'];
let contextMenuTarget = null;
let currentStep = 1;
let wizardSelectedBrand = 'bambu';
let wizardSelectedPrinter = null;
let wizardSelectedVersion = null;
let versionsExpanded = false;
let isLegacyVisible = false; 
const INITIAL_DISPLAY_COUNT = 3;
let sidebarCollapsed = false;
let appliedReleases = {}; 

let cachedOnlineReleases = null; 
let currentZOffset = 0; 
let currentXOffset = 0;
let currentYOffset = 0;

let APP_REAL_VERSION = '0.0.0';

// ==========================================
// 🚀 列表高级管理引擎 (多选 / 搜索 / 排序 / 联动编辑)
// ==========================================
let isMultiSelectMode = false;
let selectedLocalFiles = new Set();
let localSearchQuery = '';

function toggleLocalSearch() {
  const wrapper = document.getElementById('localSearchWrapper');
  const input = document.getElementById('localSearchInput');
  if (wrapper.classList.contains('hidden')) {
    wrapper.classList.remove('hidden');
    input.focus();
  } else {
    wrapper.classList.add('hidden');
    input.value = '';
    localSearchQuery = '';
    renderPresetList(getPrinterObj(selectedPrinter), selectedVersion);
  }
}

function handleLocalSearch(val) {
  localSearchQuery = val.trim().toLowerCase();
  renderPresetList(getPrinterObj(selectedPrinter), selectedVersion);
}

function toggleMultiSelectMode() {
  isMultiSelectMode = !isMultiSelectMode;
  selectedLocalFiles.clear();
  
  const btnMultiSelect = document.getElementById('btnMultiSelect');
  const btnBatchDelete = document.getElementById('btnBatchDelete');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');

  if (isMultiSelectMode) {
    btnMultiSelect.classList.add('text-blue-500', 'bg-blue-50', 'dark:bg-blue-900/30');
    btnBatchDelete.classList.remove('hidden');
    checkUpdateBtn.classList.add('hidden'); // 多选时隐藏检查更新按钮
  } else {
    btnMultiSelect.classList.remove('text-blue-500', 'bg-blue-50', 'dark:bg-blue-900/30');
    btnBatchDelete.classList.add('hidden');
    checkUpdateBtn.classList.remove('hidden');
  }

  // 刷新列表以显示/隐藏多选框
  renderPresetList(getPrinterObj(selectedPrinter), selectedVersion);
}

function toggleFileSelection(fileName, cardElement) {
  if (selectedLocalFiles.has(fileName)) {
    selectedLocalFiles.delete(fileName);
    cardElement.classList.remove('border-blue-500', 'bg-blue-50/20');
    cardElement.querySelector('.multi-checkbox').classList.remove('bg-blue-500', 'border-blue-500');
    cardElement.querySelector('.multi-checkbox svg').classList.add('opacity-0');
  } else {
    selectedLocalFiles.add(fileName);
    cardElement.classList.add('border-blue-500', 'bg-blue-50/20');
    cardElement.querySelector('.multi-checkbox').classList.add('bg-blue-500', 'border-blue-500');
    cardElement.querySelector('.multi-checkbox svg').classList.remove('opacity-0');
  }
  
  const delBtn = document.getElementById('btnBatchDelete');
  delBtn.textContent = selectedLocalFiles.size > 0 ? `删除选中 (${selectedLocalFiles.size})` : '删除选中';
}

async function executeBatchDelete() {
  if (selectedLocalFiles.size === 0) return;
  const isConfirmed = await MKPModal.confirm({
    title: '确认批量删除？',
    msg: `即将彻底删除选中的 <span class="font-bold text-red-500">${selectedLocalFiles.size}</span> 个配置。<br>此操作不可恢复。`,
    type: 'error',
    confirmText: '确认删除'
  });

  if (!isConfirmed) return;

  for (const fileName of selectedLocalFiles) {
    await window.mkpAPI.deleteFile(fileName);
  }

  // 检查是否删除了当前应用的文件
  const currentKey = `${selectedPrinter}_${selectedVersion}`;
  const activeFile = localStorage.getItem(`mkp_current_script_${currentKey}`);
  if (selectedLocalFiles.has(activeFile)) {
    localStorage.removeItem(`mkp_current_script_${currentKey}`);
    delete appliedReleases[currentKey];
  }

  toggleMultiSelectMode(); // 退出多选模式
}

// 💡 联动编辑功能：自动应用并跳转
function editAndApplyLocal(fileName, printerId, versionType) {
  const printerData = getPrinterObj(printerId);
  handleApplyLocal(fileName, fileName, printerData, null); // 自动置为已应用
  navTo('page:params'); // 跳转修改参数
}

// 💡 拖拽排序核心逻辑
let draggedCard = null;

function saveCustomOrder() {
  const container = document.getElementById('localPresetsList');
  const items = container.querySelectorAll('.collapse-item');
  const newOrder = Array.from(items).map(item => item.dataset.releaseId);
  
  const key = `mkp_custom_order_${selectedPrinter}_${selectedVersion}`;
  localStorage.setItem(key, JSON.stringify(newOrder));
}
// 💡 提取全局版本主题字典 (合并冗余)
const VERSION_THEMES = {
  standard: { title: '标准版', bg: 'var(--theme-standard-bg)', text: 'var(--theme-standard-text)' },
  quick: { title: '快拆版', bg: 'var(--theme-quick-bg)', text: 'var(--theme-quick-text)' },
  lite: { title: 'Lite版', bg: 'var(--theme-lite-bg)', text: 'var(--theme-lite-text)' }
};

// 💡 全局状态缓存中心 (彻底消灭重复读硬盘日志)
const GlobalState = {
  onboarding: null,
  getOnboarding() {
    if (this.onboarding === null) {
      Logger.info("Read variable: showOnboarding");
      const saved = localStorage.getItem('showOnboarding');
      this.onboarding = (saved !== 'false'); // 默认true
    }
    return this.onboarding;
  },
  setOnboarding(val) {
    this.onboarding = val;
    Logger.info("Write variable: showOnboarding, v:" + val);
    localStorage.setItem('showOnboarding', val);
  }
};

const CLOUD_BASES = {
  gitee: 'https://gitee.com/MuCoreBenC/MKP_Support_Electron/raw/main',
  jsDelivr: 'https://cdn.jsdelivr.net/gh/MuCoreBenC/MKP_Support_Electron@main',
  github: 'https://raw.githubusercontent.com/MuCoreBenC/MKP_Support_Electron/main'
};
// ==========================================
// 🚀 全局版本状态管理 (单源 JSON 驱动)
// ==========================================
let globalVersions = []; // 替代原来写死的 versions 数组

// 1. JSON 转换器：把 manifest 翻译成 UI 数组
function parseManifestToUI(manifest, currentAppVersion) {
  const cleanCurrent = currentAppVersion.replace(/^v/, '');
  const uiVersions = [];

  // 组装最新版本
  const latestV = 'v' + manifest.latestVersion;
  uiVersions.push({
    version: latestV,
    date: manifest.releaseDate,
    desc: manifest.shortDesc || '常规体验优化与错误修复',
    status: (manifest.latestVersion === cleanCurrent) ? 'RUNNING' : 'Legacy',
    current: (manifest.latestVersion === cleanCurrent),
    canRollback: manifest.canRollback !== false,
    details: manifest.releaseNotes || []
  });

  // 组装历史版本
  if (manifest.history && Array.isArray(manifest.history)) {
    manifest.history.forEach(h => {
      const histV = 'v' + h.version;
      uiVersions.push({
        version: histV,
        date: h.releaseDate,
        desc: h.shortDesc || '历史版本更新',
        status: (h.version === cleanCurrent) ? 'RUNNING' : 'Legacy',
        current: (h.version === cleanCurrent),
        canRollback: h.canRollback !== false,
        details: h.releaseNotes || []
      });
    });
  }

  return uiVersions;
}

// ==========================================
// 🚀 软件启动时：读取本地的 app_manifest.json (特权 API 版)
// ==========================================
async function loadLocalManifest() {
  try {
    // 1. 获取当前软件真实的本地版本号 
    const currentAppVersion = window.mkpAPI && typeof window.mkpAPI.getAppVersion === 'function' 
        ? await window.mkpAPI.getAppVersion() 
        : '0.2.2'; // 兜底版本

    // 💡 2. 彻底抛弃 fetch！呼叫底层 API 去硬盘上拿数据！
    let localManifest = null;
    if (window.mkpAPI && window.mkpAPI.readLocalManifest) {
        localManifest = await window.mkpAPI.readLocalManifest();
    }

    if (!localManifest) {
        throw new Error('底层 API 未返回数据，请检查 app_manifest.json 是否在根目录下且命名正确');
    }
    
    // 3. 转换并赋值给全局变量
    globalVersions = parseManifestToUI(localManifest, currentAppVersion);
    
    // 4. 通知 UI 渲染
    if (typeof renderVersions === 'function') {
        renderVersions();
    }
  } catch (error) {
    console.error("[VersionEngine] 加载本地版本清单失败:", error);
  }
}

// 3. 在页面初始化时自动调用
document.addEventListener('DOMContentLoaded', () => {
   loadLocalManifest();
});
// ==========================================
// 🚀 企业级网络请求引擎 (海陆空三线容灾)
// ==========================================
async function fetchCloudDataWithFallback(fileName) {
  const urls = [
    `${CLOUD_BASES.gitee}/cloud_data/presets/${fileName}`,
    `${CLOUD_BASES.jsDelivr}/cloud_data/presets/${fileName}`,
    `${CLOUD_BASES.github}/cloud_data/presets/${fileName}`
  ];

  let lastError;
  for (let i = 0; i < urls.length; i++) {
    try {
      const url = `${urls[i]}?t=${Date.now()}`; 
      console.log(`[网络请求] 正在尝试线路 ${i + 1}: ${urls[i]}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP 状态码: ${response.status}`);
      
      console.log(`[网络请求] 线路 ${i + 1} 请求成功！`);
      return await response.json(); 
    } catch (error) {
      console.warn(`[网络请求] 线路 ${i + 1} 失败: ${error.message}，准备切换备用线路...`);
      lastError = error;
    }
  }
  throw new Error("云端节点均无法连接，请检查您的网络环境。");
}




// ==========================================
// 2. 底层工具与配置服务
// ==========================================
function compareVersionsFront(v1, v2) {
  try {
    const s1 = String(v1 || '0.0.0').replace(/^v/i, '');
    const s2 = String(v2 || '0.0.0').replace(/^v/i, '');
    const a = s1.split('.').map(Number);
    const b = s2.split('.').map(Number);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const num1 = isNaN(a[i]) ? 0 : a[i];
      const num2 = isNaN(b[i]) ? 0 : b[i];
      if (num1 > num2) return 1;  
      if (num1 < num2) return -1; 
    }
    return 0; 
  } catch (e) { return 0; }
}

function flattenObject(ob) {
  const toReturn = {};
  for (const i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    if ((typeof ob[i]) === 'object' && ob[i] !== null && !Array.isArray(ob[i])) {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

function unflattenObject(ob) {
  const result = {};
  for (const i in ob) {
    const keys = i.split('.');
    keys.reduce(function(r, e, j) {
      return r[e] || (r[e] = isNaN(Number(keys[j + 1])) ? (keys.length - 1 === j ? ob[i] : {}) : []), r[e];
    }, result);
  }
  return result;
}

function saveUserConfig() {
  const config = { brand: selectedBrand, printer: selectedPrinter, version: selectedVersion, appliedReleases: appliedReleases };
  Logger.info("Write variable: mkp_user_config");
  localStorage.setItem('mkp_user_config', JSON.stringify(config));
}

function loadUserConfig() {
  try {
    Logger.info("Read variable: mkp_user_config");
    const saved = localStorage.getItem('mkp_user_config');
    if (saved) {
      const config = JSON.parse(saved);
      if (config.brand) selectedBrand = config.brand;
      if (config.printer) selectedPrinter = config.printer;
      if (config.version) selectedVersion = config.version;
      if (config.appliedReleases) appliedReleases = config.appliedReleases; 
    }
  } catch (e) { console.error("加载配置文件失败", e); }
}

function getPrinterObj(printerId) {
  for (const brandId in printersByBrand) {
    const p = printersByBrand[brandId].find(p => p.id === printerId);
    if (p) return p;
  }
  return null;
}

const UPDATE_CONFIG = {
  app: {
    manifestUrl: `${CLOUD_BASES.gitee}/cloud_data/app_manifest.json`, 
    getLocalVersion: () => APP_REAL_VERSION,
    cooldownMinutes: 5 
  },
  preset: {
    manifestUrl: `${CLOUD_BASES.gitee}/cloud_data/presets/presets_manifest.json`,
    getLocalVersion: (presetId) => {
      Logger.info("Read variable: mkp_local_presets");
      const localPresets = JSON.parse(localStorage.getItem('mkp_local_presets') || '{}');
      return localPresets[presetId] || '0.0.0'; 
    },
    cooldownMinutes: 5 
  }
};

// ============================================================
// 🧭 MKP 全局路由与跳转管理器
// ============================================================
const MKPRouter = {
  routes: {
    'page:model':     () => document.querySelector('[data-page="model"]')?.click(),
    'page:download':  () => document.querySelector('[data-page="download"]')?.click(),
    'page:calibrate': () => document.querySelector('[data-page="calibrate"]')?.click(),
    'page:params':    () => document.querySelector('[data-page="params"]')?.click(),
    'page:faq':       () => document.querySelector('[data-page="faq"]')?.click(),
    'page:about':     () => document.querySelector('[data-page="about"]')?.click(),
    'page:setting':   () => document.querySelector('[data-page="setting"]')?.click(),
    'link:github':    () => MKPRouter.openExt('https://github.com/MuCoreBenC/MKP_Support_Electron'),
    'link:gitee':     () => MKPRouter.openExt('https://gitee.com/MuCoreBenC/MKP_Support_Electron'),
    'link:bilibili':  () => MKPRouter.openExt('https://space.bilibili.com/1475765743'), 
    'link:qq':        () => MKPRouter.openExt('https://qm.qq.com/cgi-bin/qm/qr?k=JEQTF6AQ1PUgHFek0-D6lAUJMEKrsJj_&jump_from=webapi&authKey=FPWUUquvsNzy7b8djT9PAFiZ8pjAZMflI6SJTFXMRIEKDWuFF2DavQMjgWm9GgZK')
  },
  openExt: (url) => {
    Logger.info(`[Router] 跳转外部链接: ${url}`);
    if (window.mkpAPI && window.mkpAPI.openExternal) window.mkpAPI.openExternal(url); 
    else window.open(url, '_blank'); 
  },
  go: (target) => {
    const action = MKPRouter.routes[target];
    if (action) action();
    else console.warn(`[Router] 未找到跳转目标: ${target}`);
  }
};
window.navTo = MKPRouter.go;

// ==========================================
// 🚀 全局通用：UI折叠引擎 (合并冗余逻辑)
// ==========================================
const CollapseManager = {
  toggle: function(element, forceState = null) {
    const item = element.closest('.collapse-item') || element; // 兼容自身就是 item 的情况
    if (!item) return;
    
    // 自动寻找内部的包装器和箭头
    const wrapper = item.querySelector('.collapse-wrapper') || item.nextElementSibling;
    const arrow = item.querySelector('.collapse-arrow') || item.querySelector('.toggle-arrow');
    if (!wrapper) return;

    // 如果未指定 forceState，则自动取反
    const isCurrentlyOpen = wrapper.classList.contains('is-open') || wrapper.classList.contains('is-expanded');
    const isExpanding = forceState === 'expand' ? true : (forceState === 'collapse' ? false : !isCurrentlyOpen);

    if (isExpanding) {
      wrapper.classList.add('is-open', 'is-expanded'); // 兼容新老类名
      item.classList.add('expanded');
      if (arrow) arrow.classList.add('icon-rotate-180');
    } else {
      wrapper.classList.remove('is-open', 'is-expanded');
      item.classList.remove('expanded');
      if (arrow) arrow.classList.remove('icon-rotate-180');
    }
  }
};

// 暴露全局快捷方法
window.toggleCardDetails = (el) => CollapseManager.toggle(el);
window.toggleFaq = (el) => CollapseManager.toggle(el);
window.toggleCollapse = (el) => CollapseManager.toggle(el);
window.expandCollapse = (el) => CollapseManager.toggle(el, 'expand');
window.collapseCollapse = (el) => CollapseManager.toggle(el, 'collapse');


// ==========================================
// 🚀 Vercel 风格按钮状态转换器 (终极双向防抖 & 丝滑无缝版)
// ==========================================
function setButtonStatus(btn, targetWidth, text, iconSvg, themeClass) {
    if (!btn) return { unlock: () => {} };

    // 💡 1. 如果已经在动画中，完美丝滑切换 (防抽搐连招)
    if (btn.dataset.isAnimating === 'true') {
        btn.style.width = targetWidth;
        btn.className = `${btn.dataset.origClasses} btn-q-bounce ${themeClass}`; 
        
        const animBox = btn.querySelector('#q-anim-box');
        if (animBox) {
            animBox.style.opacity = '0'; // 旧文字淡出
            setTimeout(() => {
                animBox.innerHTML = `
                    <div style="display: flex;">${iconSvg}</div>
                    <span class="${btn.dataset.fontSizeClass} font-bold leading-none relative -top-[1px]" style="color: currentColor;">${text}</span>
                `;
                animBox.style.opacity = '1'; // 新文字淡入
            }, 150);
        }
        return btn._restoreFn; 
    }

    // 💡 2. 第一次触发，拍下快照
    const origWidth = btn.offsetWidth + 'px';
    const origHeight = btn.offsetHeight + 'px';
    const origHtml = btn.innerHTML;
    const origClasses = btn.className;

    const sizeMatch = origClasses.match(/text-(xs|sm|base|lg)/);
    const fontSizeClass = sizeMatch ? sizeMatch[0] : 'text-sm';

    btn.dataset.isAnimating = 'true';
    btn.dataset.origClasses = origClasses;
    btn.dataset.fontSizeClass = fontSizeClass;

    // 💡 3. 构建起跑姿势：赋予原始绝对宽度，并穿上动画铠甲
    btn.style.width = origWidth;
    btn.style.height = origHeight;
    btn.className = `${origClasses} btn-q-bounce`; // 只加基础动画壳，不加上主题色

    // 替换内部 DOM 结构
    btn.innerHTML = `
        <div id="q-anim-box" style="opacity: 0; transition: opacity 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 100%; white-space: nowrap;">
            <div style="animation: iconFadeIn 0.3s ease-out forwards; display: flex;">${iconSvg}</div>
            <span class="${fontSizeClass} font-bold leading-none relative -top-[1px]" style="animation: textSlideIn 0.3s ease-out forwards; color: currentColor;">${text}</span>
        </div>
    `;

    // 💡【起跑魔法：强制发令枪】
    // 逼迫浏览器在这一刻立即渲染 origWidth，将其作为不可磨灭的动画起点。
    // 没有这一句，开头的形变动画就会瞬间消失！
    void btn.offsetWidth; 

    // 💡 4. 开始冲刺：冲向目标宽度，并平滑加上目标主题色
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            btn.style.width = targetWidth;
            btn.className = `${origClasses} btn-q-bounce ${themeClass}`;
            btn.style.pointerEvents = 'none';

            const animBox = btn.querySelector('#q-anim-box');
            if (animBox) animBox.style.opacity = '1';
        });
    });
    // 内部元素淡入
    const animBox = btn.querySelector('#q-anim-box');
    if (animBox) animBox.style.opacity = '1';

    // 💡 5. 还原控制器
    const restoreFn = () => {
        const animBox = btn.querySelector('#q-anim-box');
        if (animBox) animBox.style.opacity = '0'; 

        setTimeout(() => {
            // 第一步：先用动画平滑缩回原来的固定宽度
            btn.style.width = origWidth;
            btn.className = `${origClasses} btn-q-bounce`;

            setTimeout(() => {
                // 💡【落地魔法 1：切断余震】
                // 彻底切断过渡引擎，防止 padding 恢复时产生“深呼吸”般的抽搐抖动
                btn.style.setProperty('transition', 'none', 'important');

                // 瞬间剥离保护壳，重置为 auto 自适应
                btn.innerHTML = origHtml;
                btn.className = origClasses; // 精准还原原本的 class
                btn.style.width = '';
                btn.style.height = '';
                btn.style.pointerEvents = '';
                
                delete btn.dataset.isAnimating;
                delete btn.dataset.origClasses;
                delete btn.dataset.fontSizeClass;
                delete btn._restoreFn;

                // 💡【落地魔法 2：无缝着陆】
                // 在没有 transition 的庇护下，瞬间让浏览器按原生 padding 渲染完毕，完成无缝交接！
                void btn.offsetWidth;

                // 一切就绪，重新激活按钮原生 CSS 动画能力
                btn.style.removeProperty('transition');
            }, 150); // 必须留足 350ms 让宽度缩回动画走完
        }, 150); // 让文字先淡出 150ms
    };

    // 永久驻留解锁 (防止网络异常卡死)
    restoreFn.unlock = () => {
        setTimeout(() => {
            // 解锁也需要遵循安全落地原则
            btn.style.setProperty('transition', 'none', 'important');
            
            btn.style.pointerEvents = '';
            btn.className = origClasses; 
            btn.style.width = '';
            btn.style.height = '';
            
            delete btn.dataset.isAnimating;
            delete btn.dataset.origClasses;
            delete btn.dataset.fontSizeClass;
            delete btn._restoreFn;
            
            void btn.offsetWidth;
            btn.style.removeProperty('transition');
        }, 400);
    };

    btn._restoreFn = restoreFn;
    return restoreFn;
}

async function handleDownloadOnline(releaseId, fileName, btnElement) {
  if (btnElement.dataset.isDownloading === 'true') return;
  btnElement.dataset.isDownloading = 'true';

  Logger.info(`[O402] DL preset, file:${fileName}`); 
  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  let resetEngine = setButtonStatus(btnElement, '90px', '下载中', SPIN_ICON, 'btn-expand-theme');

  try {
    const downloadUrls = [
      `${CLOUD_BASES.gitee}/cloud_data/presets/${fileName}`,
      `${CLOUD_BASES.jsDelivr}/cloud_data/presets/${fileName}`,
      `${CLOUD_BASES.github}/cloud_data/presets/${fileName}`
    ];
    
    let result = { success: false, error: "所有下载节点均失败" };
    const startTime = Date.now();
    
    for (const url of downloadUrls) {
      try {
        const res = await window.mkpAPI.downloadFile(url, fileName);
        result = res;
        if (result.success) break; 
      } catch (e) { result.error = e.message; }
    }

    const elapsed = Date.now() - startTime;
    if (elapsed < 1500) {
        await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
    }

    if (result.success) {
      const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
      resetEngine = setButtonStatus(btnElement, '115px', '已下载覆盖', CHECK_ICON, 'btn-expand-green');

      // 🍏 核心魔法触发器：告诉系统刚刚下载了谁，让它的边框闪绿光！
      window.newlyDownloadedFile = fileName;

      const printerData = getPrinterObj(selectedPrinter);
      await renderPresetList(printerData, selectedVersion);

      // (旧的卡片放大动画逻辑已经被删除，因为我们用了更优美的 CSS flash-success)

      setTimeout(() => {
        resetEngine();
        btnElement.dataset.isDownloading = 'false';
      }, 2000);

    } else {
      resetEngine();
      btnElement.dataset.isDownloading = 'false';
      Logger.error(`[E405] DL save err: ${result.error}`); 
      await MKPModal.alert({ title: '下载失败', msg: result.error, type: 'error' });
    }
  } catch (error) {
    resetEngine();
    btnElement.dataset.isDownloading = 'false';
    Logger.error(`[E403] DL timeout: ${error.message}`); 
    await MKPModal.alert({ title: '网络异常', msg: '下载过程中发生异常，请检查网络。', type: 'error' });
  }
}

async function fetchCloudPresets(printerId, versionType) {
  try {
    Logger.info(`[O401] Fetch manifest, p:${printerId}, v:${versionType}`); 
    const manifestUrls = [
      `${CLOUD_BASES.gitee}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`,
      `${CLOUD_BASES.jsDelivr}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`,
      `${CLOUD_BASES.github}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`
    ];

    let response;
    for (const url of manifestUrls) {
      try {
        response = await fetch(url);
        if (response.ok) break; 
      } catch (e) {}
    }
    
    if (!response || !response.ok) throw new Error(response ? `HTTP_${response.status}` : 'NetworkError');
    
    const cloudData = await response.json();

    // 💡 终极防弹衣：把保存本地的操作单独包裹起来！
    // 这样就算你的 main.js 没重启或者接口写错了，也绝对不会导致页面卡死报错！
    try {
        if (window.mkpAPI && window.mkpAPI.saveLocalPresetsManifest) {
            await window.mkpAPI.saveLocalPresetsManifest(JSON.stringify(cloudData, null, 2));
            // 顺便让本地列表也刷新一下，让它读到最新的日志
            const printerData = getPrinterObj(selectedPrinter);
            if (printerData) renderPresetList(printerData, selectedVersion);
        }
    } catch (saveErr) {
        console.warn("保存本地清单缓存失败 (可能是 main.js 未重启):", saveErr);
    }

    const matchedPresets = (cloudData.presets || []).filter(p => p.id === printerId && (p.type ? p.type === versionType : true));
    matchedPresets.sort((a, b) => compareVersionsFront(b.version, a.version));

    const currentAppVer = UPDATE_CONFIG.app.getLocalVersion();
    const today = new Date().toISOString().split('T')[0];

    return {
      success: true, 
      data: matchedPresets.map((p, index) => ({
        id: `v${p.version || currentAppVer}`,
        version: p.version || currentAppVer,
        date: p.lastModified || today,
        isLatest: index === 0,
        fileName: p.file,
        changes: Array.isArray(p.releaseNotes) ? p.releaseNotes : (p.releaseNotes ? [p.releaseNotes] : (p.description ? [p.description] : ['常规优化与参数更新']))
      }))
    };
  } catch (error) {
    Logger.error(`[E401] Manifest fetch err: ${error.message}`); 
    let errorMsg = "请求超时或发生未知错误";
    if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) errorMsg = "无法连接到云端服务器，请检查本地网络。";
    else if (error.message.includes('HTTP_404')) errorMsg = "云端配置文件不存在 (404)，请联系开发者。";
    else if (error.message.includes('JSON')) errorMsg = "云端数据格式错误，无法解析。";
    return { success: false, error: errorMsg }; 
  }
}

async function checkUpdateEngine(type, targetId = null, forceCheck = false) {
  const config = UPDATE_CONFIG[type];
  if (!config) throw new Error(`未知的更新类型: ${type}`);

  const lastCheckKey = `mkp_last_check_${type}`;
  const cacheKey = `mkp_manifest_cache_${type}`;
  const lastCheckTime = localStorage.getItem(lastCheckKey);

  let cloudData = null;
  let usedCache = false;

  if (!forceCheck && lastCheckTime) {
    const diffMinutes = (Date.now() - parseInt(lastCheckTime)) / (1000 * 60);
    if (diffMinutes < config.cooldownMinutes) {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        try {
          cloudData = JSON.parse(cachedStr);
          usedCache = true;
        } catch(e) {}
      }
    }
  }

  if (!cloudData) {
    try {
      Logger.info(`[O401] Fetch manifest, type:${type}`); 
      const response = await fetch(config.manifestUrl);
      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
      cloudData = await response.json();

      localStorage.setItem(cacheKey, JSON.stringify(cloudData));
      localStorage.setItem(lastCheckKey, Date.now().toString());
    } catch (error) {
      Logger.error(`[E401] Manifest timeout: ${error.message}`); 
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
         cloudData = JSON.parse(cachedStr);
         usedCache = true;
      } else {
         return { success: false, error: error.message };
      }
    }
  }

  const localVersion = config.getLocalVersion(targetId);
  let cloudVersion = '0.0.0';
  let targetData = null;

  if (type === 'app') {
    cloudVersion = cloudData.latestVersion;
    targetData = cloudData;
  } else if (type === 'preset') {
    targetData = cloudData.presets.find(p => p.id === targetId);
    if (targetData) cloudVersion = targetData.version;
  }

  const hasUpdate = compareVersionsFront(cloudVersion, localVersion) > 0;
  return { success: true, hasUpdate, localVersion, cloudVersion, data: targetData, usedCache };
}

// ==========================================
// 🚀 检查更新 (拉取云端 -> 覆盖本地 -> 刷新UI -> 触发更新)
// ==========================================
async function manualCheckAppUpdate(btnElement) {
    let resetEngine = null;

    // 1. 启动炫酷的转圈动画
    if (typeof setButtonStatus === 'function') {
        const SPIN_ICON = `<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
        resetEngine = setButtonStatus(btnElement, '115px', '检查中...', SPIN_ICON, 'btn-expand-theme');
    }

    try {
        // 2. 去云端拉取最新的 JSON
        const remoteUrl = `https://gitee.com/MuCoreBenC/MKP_Support_Electron/raw/main/cloud_data/app_manifest.json?t=${Date.now()}`;
        const response = await fetch(remoteUrl);
        if (!response.ok) throw new Error('云端网络请求失败，请检查网络');
        
        const remoteManifest = await response.json();

        // 💡 3. 核心：通过 Electron IPC 将云端的 JSON 覆盖保存到本地硬盘！
        if (window.mkpAPI && window.mkpAPI.saveLocalManifest) {
            await window.mkpAPI.saveLocalManifest(JSON.stringify(remoteManifest, null, 2));
        }

        // 4. 获取当前版本并刷新 UI 列表
        const currentAppVersion = window.mkpAPI ? await window.mkpAPI.getAppVersion() : '0.2.2';
        const cleanCurrent = currentAppVersion.replace(/^v/, ''); // 洗掉 v，只留数字，如 0.2.2
        
        // 解析并刷新你的版本控制页面列表 (使用之前写好的 renderVersions)
        if (typeof parseManifestToUI === 'function') {
            globalVersions = parseManifestToUI(remoteManifest, currentAppVersion);
            if (typeof renderVersions === 'function') renderVersions(); 
        }

        // 检查完毕，先恢复检查按钮的形态
        if (resetEngine) resetEngine(); 

        // 💡 5. 判断是否需要弹窗提示更新
        if (isVersionGreater(remoteManifest.latestVersion, cleanCurrent)) {
            // 发现新版本！触发优雅的高级弹窗
            const isConfirmed = await MKPModal.confirm({
                title: `发现新版本 v${remoteManifest.latestVersion}`,
                msg: `更新内容：\n${remoteManifest.shortDesc || '常规体验优化与Bug修复'}\n\n是否立即下载并进行静默更新？`,
                type: 'info',
                confirmText: '立即更新',
                cancelText: '稍后再说'
            });

            // 6. 用户点击了“立即更新”
            if (isConfirmed) {
                // 让按钮变成下载中
                if (typeof setButtonStatus === 'function') {
                    const DOWN_ICON = `<svg class="animate-bounce w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`;
                    resetEngine = setButtonStatus(btnElement, '120px', '正在下载...', DOWN_ICON, 'btn-expand-theme');
                }

                // 呼叫你的底层热更新下载引擎
                const updateResult = await window.mkpAPI.applyHotUpdate(remoteManifest.downloadUrl);
                
                if (resetEngine) resetEngine();

                if (updateResult.success) {
                    await MKPModal.alert({
                        title: '更新准备就绪',
                        msg: '底层补丁已解压覆盖成功，即将重启软件生效！',
                        type: 'success'
                    });
                    // 重启软件
                    if (window.mkpAPI.restartApp) window.mkpAPI.restartApp();
                } else {
                    throw new Error(`热更新失败：${updateResult.error}`);
                }
            }
        } else {
            // 没有新版本
            await MKPModal.alert({
                title: '已是最新版本',
                msg: `当前运行的 v${cleanCurrent} 已经是云端最新版本。`,
                type: 'success',
                allowOutsideClick: true
            });
        }
    } catch (error) {
        if (resetEngine) resetEngine();
        await MKPModal.alert({
            title: '检查失败',
            msg: error.message,
            type: 'error'
        });
    }
}

// ==========================================
// 💡 辅助工具：严谨的版本号对比算法 (0.2.4 > 0.2.2)
// ==========================================
function isVersionGreater(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return true;
        if (n1 < n2) return false;
    }
    return false;
}
// ==========================================
// ⚙️ 设置页：更新模式保存与读取
// ==========================================
function initUpdateModeSetting() {
    Logger.info("Read variable: update_mode");
    const savedMode = localStorage.getItem('update_mode') || 'auto'; // 默认自动
    
    // 渲染到 UI
    const radios = document.querySelectorAll('input[name="updateMode"]');
    radios.forEach(radio => {
        radio.checked = (radio.value === savedMode);
    });

    // 💡 启动静默检查
    silentCheckForUpdate(savedMode);
}

function saveUpdateMode(mode) {
    Logger.info(`Write variable: update_mode, v:${mode}`);
    localStorage.setItem('update_mode', mode);
}

// ==========================================
// 🤫 静默检查引擎 (专门用来亮小红点)
// ==========================================
async function silentCheckForUpdate(mode) {
    // 只有选择“仅提醒我”或者“自动”时才去查
    try {
        const manifestUrls = [
            `${CLOUD_BASES.gitee}/cloud_data/app_manifest.json?t=${Date.now()}`,
            `${CLOUD_BASES.jsDelivr}/cloud_data/app_manifest.json?t=${Date.now()}`
        ];

        let manifest = null;
        for (const url of manifestUrls) {
            try {
                const res = await fetch(url);
                if (res.ok) { manifest = await res.json(); break; }
            } catch (e) {}
        }
        if (!manifest) return;

        const localVer = UPDATE_CONFIG.app.getLocalVersion();
        const cloudVer = manifest.latestVersion;

        if (compareVersionsFront(cloudVer, localVer) > 0) {
            Logger.info(`[静默更新] 发现新版本 ${cloudVer}，准备亮起红点`);
            
            // 💡 调用全局小红点管理器，在左侧边栏的“设置”按钮上亮起带呼吸灯的红点
            RedDotManager.show('navSettingIcon', true);
            
            // 如果用户选的是“自动”，你可以在这里触发自动下载逻辑 (需要 Electron 底层支持)
            if (mode === 'auto') {
                Logger.info(`[静默更新] 当前模式为自动，理论上这里应该触发后台下载...`);
                // window.mkpAPI.silentDownload(manifest.downloadUrl);
            }
        }
    } catch (e) {
        Logger.warn(`[静默更新] 检查失败: ${e.message}`);
    }
}

// ==========================================
// 🚀 云端预设同步引擎 (修复完美下滚 Bug)
// ==========================================
async function checkOnlineUpdates(btnElement) {
  Logger.info(`[O211] Click check preset update`);
  const onlineEmpty = document.getElementById('onlineEmptyState');
  const onlineList = document.getElementById('onlinePresetsList');
  
  if (!selectedPrinter || !selectedVersion) {
    Logger.warn(`[E202] Invalid UI state: 未选机型就触发检查云端`); 
    await MKPModal.alert({ title: '提示', msg: '请先在左侧选择机型和版本类型，再检查预设更新。', type: 'warning' ,confirmText: '确定',allowOutsideClick: true});
    return;
  }

  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  let reset = () => {};
  if (btnElement) {
      reset = setButtonStatus(btnElement, '100px', '同步中...', SPIN_ICON, 'btn-expand-theme'); 
  }

  onlineEmpty.classList.add('hidden');
  onlineList.classList.remove('hidden');
  onlineList.classList.add('flex');
  onlineList.innerHTML = `
    <div class="p-8 flex flex-col items-center justify-center text-center space-y-3">
      <svg class="w-6 h-6 animate-spin theme-text" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <div class="text-sm text-gray-500">正在与云端服务器同步预设...</div>
    </div>
  `;

  try {
    const printerData = getPrinterObj(selectedPrinter);
    const [cloudResult] = await Promise.all([
      fetchCloudPresets(printerData.id, selectedVersion),
      new Promise(resolve => setTimeout(resolve, 600)) 
    ]);

    if (!cloudResult.success) {
      const errorText = cloudResult.error || "无法连接到云端服务器，请检查您的本地网络或代理设置。";
      onlineList.innerHTML = `
        <div class="p-8 text-center flex flex-col items-center justify-center">
          <div class="w-12 h-12 mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div class="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">获取云端数据失败</div>
          <div class="text-xs text-red-500 max-w-[250px] leading-relaxed">${errorText}</div>
        </div>
      `;
      await MKPModal.alert({ title: '网络请求失败', msg: errorText, type: 'error' });
      return;
    }

    const releases = cloudResult.data;
    if (releases.length === 0) {
      onlineList.innerHTML = `<div class="p-8 text-center text-sm text-gray-500">云端暂未发布该机型和版本的预设文件。</div>`;
      return;
    }
    
    renderListItems(onlineList, releases, printerData, selectedVersion, false);
    
  } catch (error) {
    Logger.error("渲染在线列表发生崩溃:", error);
    onlineList.innerHTML = `<div class="p-8 text-center text-sm text-red-500">界面渲染发生异常。</div>`;
  } finally {
    reset();
    
    // 💡 核心修复：精准定位当前页面的滚动盒子，执行强制下滚
    setTimeout(() => {
        const scrollContainer = document.querySelector('#page-download .page-content');
        if (scrollContainer) {
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight + 1000, // +1000 保证绝对滑到底
                behavior: 'smooth'
            });
        }
    }, 100); // 留出 100ms 确保 DOM 撑开
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('sidebarWrapper');
  const brandWrapper = document.getElementById('brandWrapper'); 

  sidebarCollapsed = !sidebarCollapsed;
  Logger.info("Toggle UI: sidebar, collapsed:" + sidebarCollapsed);
  
  if (sidebarCollapsed) {
    sidebar.classList.add('sidebar-collapsed');
    wrapper.classList.add('sidebar-wrapper-collapsed');
    wrapper.style.width = '72px';
    sidebar.style.width = '72px';
    if (brandWrapper) { brandWrapper.style.maxWidth = '0px'; brandWrapper.style.opacity = '0'; }
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    wrapper.classList.remove('sidebar-wrapper-collapsed');
    wrapper.style.width = '200px';
    sidebar.style.width = '200px';
    if (brandWrapper) { brandWrapper.style.maxWidth = '90px'; brandWrapper.style.opacity = '1'; }
  }
}

// 💡 优化版：依赖全局常量字典
function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
  if (!badge) return; 

  const theme = VERSION_THEMES[version];
  if (theme) {
    badge.textContent = theme.title;
    badge.style.setProperty('background-color', theme.bg, 'important');
    badge.style.setProperty('color', theme.text, 'important');
  } else {
    badge.textContent = '未选择';
    badge.style.removeProperty('background-color');
    badge.style.removeProperty('color');
  }
}

function selectPrinter(printerId, keepVersion = false) {
  Logger.info(`[O202] Select printer, p:${printerId}`); 
  if (typeof clearOnlineListUI === 'function') clearOnlineListUI(); 
  selectedPrinter = printerId;
  let selectedPrinterObj = getPrinterObj(printerId);
  
  if (selectedPrinterObj) {
    selectedBrand = brands.find(b => printersByBrand[b.id].some(p => p.id === printerId)).id;
    if (!keepVersion) selectedVersion = null; 

    document.getElementById('sidebarBrand').textContent = brands.find(b => b.id === selectedBrand).shortName;
    document.getElementById('sidebarModelName').textContent = selectedPrinterObj.shortName;
    updateSidebarVersionBadge(selectedVersion);
    
    saveUserConfig(); 
    renderBrands();
    renderPrinters(selectedBrand);
    renderDownloadVersions(selectedPrinterObj);
  }
}

function renderBrands() {
  const brandList = document.getElementById('brandList');
  if(!brandList) return; 
  brandList.innerHTML = '';
  
  const sortedBrands = [...brands].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return a.name.localeCompare(b.name);
  });
  
  sortedBrands.forEach(brand => {
    const brandCard = document.createElement('div');
    brandCard.className = `brand-card p-3 rounded-lg border ${selectedBrand === brand.id ? 'active' : ''} ${brand.favorite ? 'favorited' : ''}`;
    brandCard.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">${brand.name}</div>
          ${brand.subtitle ? `<div class="text-xs text-gray-500">${brand.subtitle}</div>` : ''}
        </div>
        <svg class="star-icon ${brand.favorite ? 'favorited' : 'not-favorited'} w-5 h-5 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24" onclick="toggleBrandFavorite('${brand.id}')">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
        </svg>
      </div>
    `;
    brandCard.onclick = () => selectBrand(brand.id);
    brandList.appendChild(brandCard);
  });
}

function selectBrand(brandId) {
  Logger.info(`[O201] Select brand, b:${brandId}`); 
  selectedBrand = brandId;
  renderBrands();
  renderPrinters(brandId);
  const brand = brands.find(b => b.id === brandId);
  if (brand) document.getElementById('currentBrandTitle').textContent = `${brand.name}${brand.subtitle ? ' - ' + brand.subtitle : ''}`;
}

function toggleBrandFavorite(brandId) {
  Logger.info(`[O204] Toggle fav, b:${brandId}`); 
  const brand = brands.find(b => b.id === brandId);
  if (brand) { brand.favorite = !brand.favorite; renderBrands(); }
}

function toggleFavorite(event, printerId) {
  event.stopPropagation(); 
  Logger.info(`[O204] Toggle fav, p:${printerId}`); 
  const printers = printersByBrand[selectedBrand] || [];
  const printer = printers.find(p => p.id === printerId);
  if (printer) { printer.favorite = !printer.favorite; renderPrinters(selectedBrand); }
}

function renderPrinters(brandId) {
  const grid = document.getElementById('printerGrid');
  if(!grid) return; 
  const rawPrinters = printersByBrand[brandId] || [];
  const printers = [...rawPrinters].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return 0;
  });
  
  if (printers.length === 0) {
    grid.innerHTML = `<div class="col-span-3 py-16 text-center"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center"><svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="text-gray-500 mb-2">暂未支持</div><div class="text-sm text-gray-400">敬请期待</div></div>`;
    return;
  }
  grid.innerHTML = generatePrinterCardsHtml(printers);
}

function filterPrinters() {
  const searchInput = document.getElementById('printerSearch');
  if (!searchInput) return; 
  const search = searchInput.value.toLowerCase();
  const rawPrinters = printersByBrand[selectedBrand] || [];
  const filtered = rawPrinters.filter(p => p.name.toLowerCase().includes(search));
  filtered.sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return 0;
  });
  const grid = document.getElementById('printerGrid');
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-3 py-8 text-center text-gray-400">未找到匹配的机型</div>`;
    return;
  }
  grid.innerHTML = generatePrinterCardsHtml(filtered);
}

function generatePrinterCardsHtml(array) {
  return array.map(p => {
    const currentBrandObj = brands.find(b => b.id === selectedBrand);
    const brandPrefix = currentBrandObj ? currentBrandObj.shortName : '';
    let prefixHtml = '';
    let mainName = p.name;
    
    if (brandPrefix && p.name.startsWith(brandPrefix)) {
      mainName = p.name.substring(brandPrefix.length).trim();
      prefixHtml = `<span class="brand-prefix text-gray-400 font-normal mr-1">${brandPrefix}</span>`;
    } else {
      const parts = p.name.split(' ');
      if (parts.length > 1) {
        const first = parts[0];
        mainName = p.name.substring(first.length).trim();
        prefixHtml = `<span class="brand-prefix text-gray-400 font-normal mr-1">${first}</span>`;
      }
    }

    return `
      <div class="select-card rounded-xl p-3 flex flex-col h-full ${p.id === selectedPrinter ? 'selected' : ''} ${p.disabled ? 'printer-card-disabled' : ''}"
           ${!p.disabled ? `onclick="selectPrinter('${p.id}')"` : ''}
           oncontextmenu="showPrinterContextMenu(event, '${p.id}')">
         <div class="relative flex items-center justify-center h-6 mb-2 w-full px-5"> 
           <div class="text-sm font-medium flex items-center justify-center w-full overflow-hidden whitespace-nowrap"> 
             ${prefixHtml} <span class="truncate text-gray-700 dark:text-gray-200">${mainName}</span> 
           </div> 
           <div class="absolute right-0 top-1/2 -translate-y-1/2 cursor-pointer z-10" onclick="toggleFavorite(event, '${p.id}')" title="点击收藏/取消收藏"> 
             <svg class="w-4 h-4 star-icon ${p.favorite ? 'favorited' : 'not-favorited'} hover:scale-110 transition-transform" 
                  fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 20 20"> 
               <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/> 
             </svg> 
           </div> 
         </div>
         <div class="relative w-full aspect-video flex items-center justify-center mt-auto pointer-events-none">
           <img src="${p.image}" alt="${p.name}" class="w-full h-full object-contain drop-shadow-sm">
           ${p.disabled ? `<div class="absolute bottom-0 left-0 px-2 py-1 rounded bg-gray-200 text-xs text-gray-500">开发中</div>` : ''}
         </div>
       </div>
    `;
  }).join('');
}

function bindContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    const printerCard = e.target.closest('.select-card');
    if (printerCard) {
      e.preventDefault();
      contextMenuTarget = printerCard;
      showContextMenu(e.clientX, e.clientY);
    }
  });
  document.addEventListener('click', () => hideContextMenu());
}

function showContextMenu(x, y) {
  const ctx = document.getElementById('contextMenu');
  if(!ctx) return;
  ctx.style.left = `${x}px`;
  ctx.style.top = `${y}px`;
  ctx.classList.remove('hidden');
}

function showPrinterContextMenu(event, printerId) {
  event.preventDefault();
  contextMenuTarget = printerId;
  showContextMenu(event.clientX, event.clientY);
}

function hideContextMenu() {
  const ctx = document.getElementById('contextMenu');
  if(ctx) ctx.classList.add('hidden');
}


// ==========================================
// 5. 版本与预设列表渲染引擎
// ==========================================
function clearOnlineListUI() {
  cachedOnlineReleases = null;
  const onlineEmpty = document.getElementById('onlineEmptyState');
  const onlineList = document.getElementById('onlinePresetsList');
  if (onlineEmpty) onlineEmpty.classList.remove('hidden');
  if (onlineList) {
    onlineList.classList.add('hidden');
    onlineList.classList.remove('flex');
    onlineList.innerHTML = ''; 
  }
}

// ==========================================
// 🚀 刷新本地列表并展开在线预设 (原生 API 强制下滚)
// ==========================================
async function safeRefreshLocalList() {
  const onlineList = document.getElementById('onlinePresetsList');
  const isOnlineVisible = onlineList && !onlineList.classList.contains('hidden');

  const printerData = getPrinterObj(selectedPrinter);
  await renderPresetList(printerData, selectedVersion);

  if (onlineList) {
    const newEmpty = document.getElementById('onlineEmptyState');
    if (newEmpty) { newEmpty.classList.add('hidden'); newEmpty.classList.remove('flex'); }
    
    onlineList.classList.remove('hidden'); 
    onlineList.classList.add('flex');
    let parent = onlineList.parentElement;
    while (parent && parent.id !== 'root' && parent.tagName !== 'BODY') {
      if (parent.classList.contains('hidden')) parent.classList.remove('hidden');
      parent = parent.parentElement;
    }

    // 🚀 核心修复：使用更原生的 scrollIntoView 彻底解决滚动失败问题
    setTimeout(() => {
      // 确保元素存在并且已经完成渲染
      if (onlineList) {
          // block: 'end' 表示让该元素的底部，对齐视口的底部（也就是滑到最下面）
          onlineList.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 150); // 稍微增加一点延时(150ms)，确保 DOM 高度完全撑开后再滚动，极其稳健
  }
}

function renderVersionCards(containerId, printerData, currentSelectedVersion, onSelectCallback) {
  const container = document.getElementById(containerId);
  if (!container || !printerData) return;
  container.innerHTML = '';

  let availableVersions = ['standard'];
  if (printerData.supportedVersions && printerData.supportedVersions.length > 0) {
    availableVersions = printerData.supportedVersions;
  }

  // 💡 补充缺失图标，其余继承全局字典
  const localThemes = {
    standard: { ...VERSION_THEMES.standard, iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'v3原版，适合到手即用追求稳定' },
    quick: { ...VERSION_THEMES.quick, iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z', desc: 'v3快拆版，适合自行打印安装' },
    lite: { ...VERSION_THEMES.lite, iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 12h6', desc: '适合P系列，及其他CoreXY' }
  };

  availableVersions.forEach(vType => {
    const vInfo = localThemes[vType];
    if (!vInfo) return;

    const isSelected = currentSelectedVersion === vType;
    const card = document.createElement('div');
    
    card.className = `version-card group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected theme-border' : 'border-gray-200 dark:border-[#333333] hover:border-gray-300 dark:hover:border-[#444]'}`;
    
    card.onclick = () => {
      onSelectCallback(currentSelectedVersion === vType ? null : vType);
    };

    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors" style="background: ${vInfo.bg}; color: ${vInfo.text}">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${vInfo.iconPath}"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold text-gray-900 dark:text-gray-100">${vInfo.title}</span>
          </div>
          <p class="text-xs text-gray-500 truncate">${vInfo.desc}</p>
        </div>
        <div class="check-indicator w-6 h-6 rounded-full border-2 ${isSelected ? 'border-transparent theme-bg-solid' : 'border-gray-200 dark:border-[#444]'} flex items-center justify-center flex-shrink-0 transition-all duration-200">
          <svg class="w-4 h-4 text-white ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderDownloadVersions(printerData) {
  renderVersionCards('downloadVersionList', printerData, selectedVersion, (vType) => {
    Logger.info(`[O203] Select version, v:${vType}`); 
    selectedVersion = vType; 
    saveUserConfig();
    
    const currentKey = `${printerData.id}_${vType}`;
    const activeFileName = localStorage.getItem(`mkp_current_script_${currentKey}`);
    if (activeFileName) Logger.info(`[O301] Read preset (Tab switch), apply file:${activeFileName}`);

    renderDownloadVersions(printerData); 
    updateSidebarVersionBadge(vType); 
    clearOnlineListUI();
  });

  if (!selectedVersion) {
    clearOnlineListUI();
    renderPresetList(printerData, null);
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if(dlBtn) dlBtn.disabled = true;
    if(dlHint) dlHint.style.opacity = '1';
  } else {
    renderPresetList(printerData, selectedVersion);
  }
}

// ==========================================
// 🚀 极简本地预设渲染引擎 (智能扒取 JSON 内部真实版本号)
// ==========================================
async function renderPresetList(printerData, versionType) {
  const localEmpty = document.getElementById('localEmptyState');
  const localList = document.getElementById('localPresetsList');
  const step2Badge = document.getElementById('step2Badge');
  
  if (!versionType || !printerData) {
    if(localEmpty) {
      localEmpty.classList.remove('hidden');
      localEmpty.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">请先在上方选择「版本类型」</p>`;
    }
    if(localList) localList.classList.add('hidden');
    if (step2Badge) step2Badge.classList.remove('theme-text');
    return;
  }

  if (step2Badge) step2Badge.classList.add('theme-text');
  
  let localFileNames = [];
  if (window.mkpAPI && window.mkpAPI.getLocalPresets) {
    localFileNames = await window.mkpAPI.getLocalPresets();
  }

  let cloudLogMap = {};
  try {
      if (window.mkpAPI && window.mkpAPI.readLocalPresetsManifest) {
          const localManifestRes = await window.mkpAPI.readLocalPresetsManifest();
          if (localManifestRes && localManifestRes.success && localManifestRes.data && localManifestRes.data.presets) {
              const matchedPresets = localManifestRes.data.presets.filter(p => p.id === printerData.id && (p.type ? p.type === versionType : true));
              matchedPresets.forEach(p => {
                  if(p.file) {
                     cloudLogMap[p.file.toLowerCase()] = Array.isArray(p.releaseNotes) ? p.releaseNotes : (p.releaseNotes ? [p.releaseNotes] : (p.description ? [p.description] : ['常规优化与参数更新']));
                  }
              });
          }
      }
  } catch(e) {}

  const filePrefix = `${printerData.id}_${versionType}_`;
  const matchedFiles = localFileNames.filter(name => name.startsWith(filePrefix));
  
  const userDataPath = window.mkpAPI && typeof window.mkpAPI.getUserDataPath === 'function' 
        ? await window.mkpAPI.getUserDataPath() 
        : '';

  let localData = [];
  
  // 💡 核心巨变：扒开 JSON 查验真实身份与用户自定义名字！
  for (const fileName of matchedFiles) {
      let realVersion = '0.0.1';
      let customName = null; // 存放内嵌的中文名
      
      // 读取本地文件内容
      if (userDataPath && window.mkpAPI.readPreset) {
          const filePath = `${userDataPath}\\${fileName}`;
          const res = await window.mkpAPI.readPreset(filePath);
          if (res.success && res.data) {
              if (res.data.version) realVersion = res.data.version; 
              if (res.data._custom_name) customName = res.data._custom_name; // 获取中文名！
          } else {
              const versionMatch = fileName.match(/_v([a-zA-Z0-9\.-]+)/i);
              if (versionMatch) realVersion = versionMatch[1];
          }
      }

      // 外显标题清洗：如果有 customName 就用它，没有就用切掉后缀的文件名
      let displayTitle = fileName.replace(/\.json$/i, '');
      if (displayTitle.startsWith(filePrefix)) {
          displayTitle = displayTitle.substring(filePrefix.length);
      }
      if (customName) {
          displayTitle = customName; 
      }

      // 日志匹配：如果它是副本，我们可以用它的“真实版本”推导出原始文件名，再去云端字典里捞日志！
      const fileLower = fileName.toLowerCase();
      const originalBaseName = `${printerData.id}_${versionType}_v${realVersion}.json`.toLowerCase();
      
      const realChanges = cloudLogMap[fileLower] || cloudLogMap[originalBaseName] || [`本地自定义配置 (底层版本 v${realVersion})`];

      localData.push({
        id: fileName, // 确保应用和删除时的 ID 是唯一的文件名
        displayTitle: displayTitle, // UI 上显示的干净名字 (可能是中文)
        realVersion: realVersion,   // 内部展开显示的真实版本
        fileName: fileName,         // 纯英文的时间戳底层文件
        changes: realChanges, 
        isLatest: false 
      });
  }

  // 💡 应用搜索过滤
  if (localSearchQuery) {
      localData = localData.filter(d => d.displayTitle.toLowerCase().includes(localSearchQuery) || d.fileName.toLowerCase().includes(localSearchQuery));
  }

  // 💡 应用拖拽自定义排序 (如果存在的话)
  const customOrderKey = `mkp_custom_order_${printerData.id}_${versionType}`;
  const customOrderStr = localStorage.getItem(customOrderKey);
  
  if (customOrderStr && !localSearchQuery) {
      try {
          const customOrder = JSON.parse(customOrderStr);
          localData.sort((a, b) => {
              const idxA = customOrder.indexOf(a.fileName);
              const idxB = customOrder.indexOf(b.fileName);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              // 兜底降序
              return a.realVersion.localeCompare(b.realVersion, undefined, { numeric: true, sensitivity: 'base' }) * -1;
          });
      } catch(e) {}
  } else {
      // 排序：按真实版本号倒序
      localData.sort((a, b) => {
          return a.realVersion.localeCompare(b.realVersion, undefined, { numeric: true, sensitivity: 'base' }) * -1;
      });
  }

  if (localData.length > 0 && !localSearchQuery && !customOrderStr) {
      localData[0].isLatest = true; 
  }

  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');

  if (localData.length > 0) {
    if(localEmpty) localEmpty.classList.add('hidden');
    if(localList) {
      localList.classList.remove('hidden');
      localList.classList.add('flex', 'flex-col', 'gap-2'); 
      renderListItems(localList, localData, printerData, versionType, true);
    }
    
    // 判断是否有选中的配置
    const activeFileName = localStorage.getItem(`mkp_current_script_${printerData.id}_${versionType}`);
    const hasApplied = localData.some(r => r.fileName === activeFileName);
    
    if (dlBtn && dlHint) {
      if (hasApplied) { dlBtn.disabled = false; dlHint.style.opacity = '0'; } 
      else { dlBtn.disabled = true; dlHint.style.opacity = '1'; }
    }
  } else {
    if(localEmpty) {
      localEmpty.classList.remove('hidden');
      localEmpty.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">本地暂无预设，请点击右上角检查更新并下载</p>`;
    }
    if(localList) { localList.classList.add('hidden'); localList.innerHTML = ''; }
    if (dlBtn) dlBtn.disabled = true;
    if (dlHint) dlHint.style.opacity = '1';
  }
}
// ==========================================
// 🚀 瞬间复制本地预设 (带参数穿透)
// ==========================================
async function handleDuplicateLocal(fileName, printerId, versionType, realVersion) {
  try {
    if (!window.mkpAPI || !window.mkpAPI.duplicatePreset) {
        throw new Error("请先在 main.js 中添加 duplicate-preset 接口并重启软件！");
    }
    // 把机型、版本等信息传给后端，用来生成标准的纯英文底层文件名
    const result = await window.mkpAPI.duplicatePreset({ fileName, printerId, versionType, realVersion });
    if (result.success) {
        // 魔法触发：告诉系统刚复制出来的文件是谁，让它闪烁绿光！
        window.newlyDownloadedFile = result.newFileName;
        
        // 瞬间重新渲染列表
        const printerData = getPrinterObj(printerId);
        await renderPresetList(printerData, versionType);
    } else {
        throw new Error(result.error);
    }
  } catch (error) {
    await MKPModal.alert({ title: '复制失败', msg: error.message, type: 'error' });
  }
}

// ==========================================
// 🚀 渲染卡片 HTML (加入多选框 + 拖拽手柄 + 联动编辑)
// ==========================================
function renderListItems(container, releases, printerData, versionType, isLocal) {
  container.innerHTML = '';
  const presetNamePrefix = `${printerData.shortName} ${VERSION_THEMES[versionType]?.title || ''}`;

  releases.forEach((release) => {
    const isApplied = isLocal && (release.fileName === localStorage.getItem(`mkp_current_script_${printerData.id}_${versionType}`));
    const isJustDownloaded = isLocal && (window.newlyDownloadedFile === release.fileName);
    const isSelected = selectedLocalFiles.has(release.fileName);

    const item = document.createElement('div');
    item.dataset.releaseId = release.fileName; 
    
    // 如果选中了，卡片本身也给点高亮反馈
    const selectionClass = isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-gray-100 dark:border-[#333]';
    item.className = `collapse-item transition-all border-b ${selectionClass} last:border-b-0 bg-white dark:bg-gray-800 ${isJustDownloaded ? 'flash-success' : ''}`;

    let btnText = '下载';
    let btnClass = 'dl-btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#333] dark:border-[#444] dark:text-gray-200 dark:hover:bg-[#444] rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px]';

    if (isLocal) {
      if (isApplied) {
        btnText = '已应用';
        btnClass = 'dl-btn theme-btn-solid cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm transition-all btn-q-bounce';
      } else {
        btnText = '应用';
        btnClass = 'dl-btn theme-btn-soft cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium transition-all btn-q-bounce';
      }
    }

    // 💡 多选复选框 UI
    const checkboxHtml = isLocal ? `
      <div class="multi-checkbox flex-shrink-0 w-4 h-4 rounded border-2 mr-3 transition-colors flex items-center justify-center ${isMultiSelectMode ? 'flex' : 'hidden'} ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}">
        <svg class="w-3 h-3 text-white transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
      </div>
    ` : '';

    // 💡 编辑和复制按钮 (注意传入了 release.realVersion)
    const toolsHtml = isLocal ? `
      <div class="w-px h-4 bg-gray-200 dark:bg-[#444] mx-1"></div>
      <button class="p-1.5 text-gray-400 hover:text-emerald-500 transition-colors" title="编辑参数" onclick="event.stopPropagation(); editAndApplyLocal('${release.fileName}', '${printerData.id}', '${versionType}')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
      </button>
      <button class="p-1.5 text-gray-400 hover:theme-text transition-colors" title="立即制作副本" onclick="event.stopPropagation(); handleDuplicateLocal('${release.fileName}', '${printerData.id}', '${versionType}', '${release.realVersion}')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      </button>
      <button class="delete-btn p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="删除本地文件">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    ` : '';

    // 💡 拖拽手柄 UI (移入时才激活拖拽，防止平时误触)
    const dragHtml = isLocal ? `
      <div class="drag-handle ml-2 px-1 text-gray-300 hover:text-gray-500 dark:text-[#444] dark:hover:text-gray-400 cursor-grab active:cursor-grabbing transition-colors" title="拖拽排序" 
           onmouseenter="this.closest('.collapse-item').setAttribute('draggable', true)" 
           onmouseleave="this.closest('.collapse-item').removeAttribute('draggable')">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>
      </div>
    ` : '';

    // 💡 点击整个头部的逻辑：多选模式下打勾，正常模式下展开
    item.innerHTML = `
      <div class="preset-header px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2A2D2E] transition-colors" 
           onclick="if(isMultiSelectMode) { toggleFileSelection('${release.fileName}', this.closest('.collapse-item')) } else { toggleCollapse(this) }">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          ${checkboxHtml}
          <span class="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">${presetNamePrefix} ${release.displayTitle || release.id}</span>
          ${release.isLatest ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium theme-bg-soft flex-shrink-0">最新</span>' : ''}
          ${isApplied ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium theme-btn-solid flex items-center gap-1 shadow-sm flex-shrink-0"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>' : ''}
        </div>
        
        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="flex items-center gap-1 action-tools ${isMultiSelectMode ? 'hidden' : 'flex'}">
            <button class="${btnClass}">${btnText}</button>
            ${toolsHtml}
          </div>
          <svg class="w-5 h-5 text-gray-400 collapse-arrow transition-transform duration-200 toggle-arrow ${isMultiSelectMode ? 'hidden' : 'block'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          ${dragHtml}
        </div>
      </div>
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-4 pt-1">
            <div class="rounded-xl p-4 theme-bg-subtle">
              <div class="flex justify-between items-center mb-2">
                 <div class="text-xs font-medium text-gray-700 dark:text-gray-300">更新日志：</div>
                 <div class="flex gap-2">
                     <div class="text-[10px] font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-black/20 text-gray-500 dark:text-gray-400">文件: ${release.fileName}</div>
                     <div class="text-[10px] font-bold px-2 py-0.5 rounded theme-bg-soft theme-text">底层版本: v${release.realVersion || release.version}</div>
                 </div>
              </div>
              <ul class="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                ${release.changes.map(c => `<li class="flex items-start gap-1.5"><span class="text-gray-300 dark:text-gray-600 mt-0.5">•</span> ${c}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    const dlBtn = item.querySelector('.dl-btn');
    if(dlBtn) {
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); 
        if (isLocal) handleApplyLocal(release.fileName, release.fileName, printerData, dlBtn);
        else handleDownloadOnline(release.id, release.fileName, dlBtn);
      });
    }

    if (isLocal) {
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); 
          handleDeleteLocal(release.fileName, release.fileName, e);
        });
      }

      // 💡 绑定 HTML5 拖拽事件
      item.addEventListener('dragstart', function(e) {
          draggedCard = this;
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => this.classList.add('opacity-40', 'bg-gray-50'), 0);
      });
      
      item.addEventListener('dragover', function(e) {
          e.preventDefault(); // 必须阻止默认行为才能成为放置目标
          if (this === draggedCard) return;
          const rect = this.getBoundingClientRect();
          const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          this.parentNode.insertBefore(draggedCard, next ? this.nextSibling : this);
      });
      
      item.addEventListener('drop', function(e) {
          e.stopPropagation();
          saveCustomOrder(); // 保存新顺序到本地
      });
      
      item.addEventListener('dragend', function() {
          this.classList.remove('opacity-40', 'bg-gray-50');
          this.removeAttribute('draggable'); // 拖拽完移除属性，回归正常
          draggedCard = null;
      });
    }

    container.appendChild(item);
  });
}

function selectVersion(card, version) {
  Logger.info(`[O203] Select version, v:${version}`);
  selectedVersion = version;
  
  document.querySelectorAll('.version-card').forEach(c => {
    c.classList.remove('selected', 'theme-border');
    c.classList.add('border-gray-200', 'dark:border-[#333333]');
    c.querySelector('.check-indicator').className = 'check-indicator w-6 h-6 rounded-full border-2 border-gray-200 dark:border-[#444] flex items-center justify-center flex-shrink-0 transition-all duration-200';
    c.querySelector('.check-indicator svg').style.opacity = '0';
    updateWizardButtons();
  });
  
  card.classList.add('selected', 'theme-border');
  card.classList.remove('border-gray-200', 'dark:border-[#333333]');
  
  const checkIndicator = card.querySelector('.check-indicator');
  checkIndicator.className = 'check-indicator w-6 h-6 rounded-full border-2 border-transparent theme-bg-solid flex items-center justify-center flex-shrink-0 transition-all duration-200';
  checkIndicator.querySelector('svg').style.opacity = '1';
  
  const dateSelect = document.getElementById('dateSelect');
  if(dateSelect){
    dateSelect.disabled = false;
    dateSelect.classList.remove('cursor-not-allowed', 'text-gray-400');
    dateSelect.classList.add('text-gray-900');
  }
  
  const dlBtn = document.getElementById('downloadBtn');
  if(dlBtn) dlBtn.disabled = false;
  const dlHint = document.getElementById('downloadHintWrapper');
  if(dlHint) dlHint.style.opacity = '0';
  
  updateSidebarVersionBadge(version);
}


// 💡 性能优化：将版本生成函数提出来，避免闭包内存泄漏
function createVersionCardHTML(version, type) {
  let badgeClass = 'bg-gray-100 text-gray-800';
  let btnText = '回退';
  let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  let btnAction = ''; 
  let isDisabled = false;

  const isLegacy = (type === 'legacy');
  const defaultOpenClass = isLegacy ? '' : 'is-open is-expanded';
  
  // 💡 核心修复：外层必须加上 expanded 状态，CSS 里的箭头才会自动向上翻转！
  const defaultExpandedClass = isLegacy ? '' : 'expanded';

  if (type === 'stable') {
    badgeClass = 'theme-bg-soft';
    btnText = version.current ? '已是最新' : '检查更新';
    btnClass = 'theme-btn-solid';
    if (version.current) isDisabled = true;
    else btnAction = `onclick="event.stopPropagation(); manualCheckAppUpdate(this)"`;
  } else if (type === 'beta') {
    badgeClass = 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400';
    btnText = '立即尝鲜';
    btnClass = 'theme-btn-soft';
  } else {
    if (version.canRollback === false || version.version.includes('-')) {
      isDisabled = true;
      btnText = '不可回退';
      btnClass = 'bg-gray-50 text-gray-400 cursor-not-allowed dark:bg-[#1e1e1e] opacity-60';
    } else {
      btnAction = `onclick="event.stopPropagation(); handleRollback(this, '${version.version}')"`;
    }
  }

return `
    <div class="bg-white dark:bg-[#252526] rounded-xl border border-gray-200 dark:border-[#333] p-5 mb-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-[#444] cursor-pointer group collapse-item ${defaultExpandedClass}" onclick="toggleCollapse(this)">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="px-2.5 py-1 rounded-full text-[10px] font-bold ${badgeClass}">${version.status}</div>
          <div>
            <div class="font-bold text-gray-900 dark:text-gray-100">${version.version}</div>
            <div class="text-[10px] text-gray-400">${version.date}</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button class="px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${btnClass}" 
                  ${isDisabled ? 'disabled' : ''} ${btnAction}>
            ${btnText}
          </button>
          <div class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1e1e1e] group-hover:bg-gray-100 dark:group-hover:bg-[#2a2a2a] transition-colors flex-shrink-0">
             <svg class="w-4 h-4 text-gray-500 transition-transform duration-300 toggle-arrow collapse-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
      </div>
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${version.desc}</p>
      <div class="collapse-wrapper ${defaultOpenClass}">
        <div class="collapse-inner">
          <div class="space-y-1 pt-3 mt-2 border-t border-gray-100 dark:border-[#333]">
            ${version.details.map(detail => `
              <div class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <svg class="w-3.5 h-3.5 theme-text mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span>${detail}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 💡 优化版版本渲染引擎：完美适配 JSON 驱动与独立归档区
// ==========================================
function renderVersions() {
  const versionList = document.getElementById('versionList');
  if (!versionList) return;
  
  // 1. 渲染前，彻底清空
  versionList.innerHTML = '';

  // 💡 修复 Bug：正确的非空判断！
  if (typeof globalVersions === 'undefined' || globalVersions.length === 0) {
      console.warn("数据还未加载完毕，或者 globalVersions 为空");
      return;
  }

  // 2. 智能分组逻辑
  const latestVersion = globalVersions[0]; 
  const runningVersion = globalVersions.find(v => v.current === true); 

  const topVersions = [];
  if (latestVersion) topVersions.push(latestVersion);
  if (runningVersion && runningVersion.version !== latestVersion?.version) {
      topVersions.push(runningVersion);
  }

  const legacyVersions = globalVersions.filter(v => !topVersions.includes(v));

  // 3. 渲染常驻区
  topVersions.forEach(v => {
      versionList.innerHTML += createVersionCardHTML(v, 'stable'); 
  });

  // 4. 渲染历史区
  if (legacyVersions.length > 0) {
    const legacyContainer = document.createElement('div');
    legacyContainer.id = 'legacyVersionsContainer';
    
    // 根据全局折叠状态决定初始是否隐藏
    legacyContainer.style.display = (typeof isLegacyVisible !== 'undefined' && isLegacyVisible) ? 'block' : 'none';

    let legacyHtml = `
      <div class="py-4 text-xs font-bold text-gray-400 flex items-center gap-2">
        <div class="h-px flex-1 bg-gray-100 dark:bg-[#333]"></div>
        历史归档 (${legacyVersions.length})
        <div class="h-px flex-1 bg-gray-100 dark:bg-[#333]"></div>
      </div>
    `;
    
    legacyVersions.forEach(v => { 
        legacyHtml += createVersionCardHTML(v, 'legacy'); 
    });

    legacyContainer.innerHTML = legacyHtml;
    versionList.appendChild(legacyContainer);
  }
}
// ==========================================
// 💡 优化版切换器：不再重新渲染 DOM，而是纯粹切换容器可见性
// ==========================================
function toggleExpandMore() {
  isLegacyVisible = !isLegacyVisible;
  Logger.info("Toggle UI: expand version history, active: " + isLegacyVisible);
  
  // 1. 改变按钮文字
  const btnText = document.getElementById('expandBtnText');
  if (btnText) btnText.innerText = isLegacyVisible ? '收起历史' : '历史版本';
  
  // 2. 🌟 核心修复：直接找到那个历史容器，控制它的显示隐藏！绝不碰上面的卡片！
  const legacyContainer = document.getElementById('legacyVersionsContainer');
  if (legacyContainer) {
      legacyContainer.style.display = isLegacyVisible ? 'block' : 'none';
  }
}

async function handleRollback(btnElement, targetVersion) {
  const userConfirm = await MKPModal.confirm({
    title: `确认回退至 ${targetVersion}?`,
    msg: `回退后将覆盖当前版本的所有代码。<br><br><span class="text-red-500 font-bold">⚠️ 注意：</span> 旧版本可能缺少最新的功能或存在已知 Bug。您确定要继续吗？`,
    confirmText: '确定回退', type: 'warning'
  });

  if (!userConfirm) return;

  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  const reset = setButtonStatus(btnElement, '100px', '请求中...', SPIN_ICON, 'btn-expand-blue');

  try {
    const url = `${CLOUD_BASES.gitee}/cloud_data/app_manifest.json?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("无法连接到云端服务器验证补丁。");
    const manifest = await res.json();

    const pureVersion = targetVersion.replace('v', '');
    const historyList = manifest.history || [];
    const targetData = historyList.find(item => item.version === pureVersion);

    if (!targetData || !targetData.downloadUrl) throw new Error(`云端暂未提供 ${targetVersion} 的回退补丁包，请联系开发者。`);

    const result = await window.mkpAPI.applyHotUpdate(targetData.downloadUrl);

    if (result.success) {
      await MKPModal.alert({ title: '回退完成', msg: `已成功回退至 ${targetVersion}，软件即将自动重启。`, type: 'success' });
      window.mkpAPI.restartApp();
    } else {
      throw new Error(`回退补丁应用失败: ${result.error}`);
    }

  } catch (error) {
    Logger.error(`[回退失败] ${error.message}`);
    await MKPModal.alert({ title: '回退失败', msg: error.message, type: 'error' ,confirmText: '确定'});
  } finally {
     reset();
  }
}

async function copyPath() {
    Logger.info(`[O307] Copy script`); 
    const scriptPath = document.getElementById('scriptPath');
    const copyBtn = document.getElementById('scriptCopyBtn');
    if (!scriptPath || !copyBtn) return;

    try {
        // 💡 核心修改：调用无敌复制引擎
        await copyToClipboard(scriptPath.value);
        
        // 复制成功，启动魔法动画！
        const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
        const reset = setButtonStatus(copyBtn, '92px', '已复制', CHECK_ICON, 'btn-expand-green');
        setTimeout(reset, 3000);

    } catch (err) {
        Logger.error(`[E203] Copy failed: ${err}`); 
        await MKPModal.alert({ title: '复制失败', msg: '无法访问剪贴板，请手动全选复制。', type: 'error', confirmText: '确定' });
    }
}

function handleApplyLocal(releaseId, fileName, printerData, clickedBtn = null) {
  Logger.info(`[O301] Read preset, apply file:${fileName}`);
  const currentKey = `${printerData.id}_${selectedVersion}`;
  appliedReleases[currentKey] = releaseId;
  Logger.info("Write variable: mkp_current_script_" + currentKey);
  localStorage.setItem(`mkp_current_script_${currentKey}`, fileName);
  saveUserConfig();

  const localContainer = document.getElementById('localPresetsList');
  if (!localContainer) return;

  const cards = localContainer.children;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const isThisCardApplied = (card.dataset.releaseId === releaseId);
    const btn = card.querySelector('.dl-btn');
    const badgeContainer = card.querySelector('.preset-header .flex.items-center.gap-3');

    if (isThisCardApplied) {
      if (btn) {
        const isReapply = (btn.textContent.trim() === '已应用') && (btn === clickedBtn);
        
        // 💡 必须保留 btn-q-bounce，动画才会生效！
        btn.className = 'dl-btn theme-btn-solid btn-q-bounce cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm transition-all';
        
        if (isReapply) {
          const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
          const reset = setButtonStatus(btn, '96px', '已刷新', CHECK_ICON, 'btn-expand-green');
          setTimeout(reset, 1500);
        } else {
          btn.innerHTML = '已应用';
        }
      }
      
      if (badgeContainer) {
        const hasBadge = Array.from(badgeContainer.children).some(el => el.textContent.includes('当前使用'));
        if (!hasBadge) {
          const badgeHtml = `<span class="applied-badge px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-sm animate-scale-in theme-btn-solid"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>`;
          badgeContainer.insertAdjacentHTML('beforeend', badgeHtml);
        }
      }
    } else {
      if (btn) {
        btn.innerHTML = '应用';
        btn.className = 'dl-btn theme-btn-soft btn-q-bounce cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium transition-all';
      }
      if (badgeContainer) {
        const badges = Array.from(badgeContainer.children);
        for (let j = 0; j < badges.length; j++) {
          if (badges[j].textContent.includes('当前使用')) badges[j].remove();
        }
      }
    }
  }

  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');
  if (dlBtn) dlBtn.disabled = false;
  if (dlHint) dlHint.style.opacity = '0';
}

// ==========================================
// 🚀 彻底重构：删除本地预设 (SaaS 级弹窗)
// ==========================================
async function handleDeleteLocal(releaseId, fileName, event) {
  if (event) event.stopPropagation(); 
  
  // 💡 核心升级：调用咱们自己的高级弹窗，红色警告质感拉满！
  const confirmDelete = await MKPModal.confirm({
    title: '确认删除本地配置？',
    msg: `即将删除文件 <span class="font-mono text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">${fileName}</span><br><br><span class="text-xs text-gray-500">删除后，您可以随时在“在线预设”中重新下载。</span>`,
    confirmText: '确定删除', 
    type: 'error' 
  });
  
  if (!confirmDelete) return;

  try {
    const result = await window.mkpAPI.deleteFile(fileName);
    if (result.success) {
      const printerData = getPrinterObj(selectedPrinter);
      const currentKey = `${printerData.id}_${selectedVersion}`;
      if (appliedReleases[currentKey] === releaseId) {
        delete appliedReleases[currentKey];
        saveUserConfig();
      }
      renderPresetList(printerData, selectedVersion);
    } else {
      await MKPModal.alert({ title: '删除失败', msg: result.error, type: 'error' });
    }
  } catch (error) { 
      await MKPModal.alert({ title: '删除异常', msg: '删除过程中发生未知错误。', type: 'error' });
  }
}

// ==========================================
// 💡 FAQ 常见问题渲染器 (完美暗黑模式 + SaaS 质感)
// ==========================================
function generateFaqItemHtml(item) {
  return `
    <div class="collapse-item faq-item bg-white dark:bg-[#252526] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden transition-colors hover:shadow-sm hover:border-gray-300 dark:hover:border-[#444]">
      
      <button class="faq-question w-full px-5 py-4 flex items-center justify-between text-left outline-none group" onclick="toggleCollapse(this)">
        <span class="font-medium text-gray-900 dark:text-gray-100 group-hover:theme-text transition-colors">${item.question}</span>
        
        <div class="w-6 h-6 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1e1e1e] group-hover:bg-gray-100 dark:group-hover:bg-[#2a2a2a] transition-colors flex-shrink-0">
          <svg class="collapse-arrow w-4 h-4 text-gray-500 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </button>

      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-5 pt-1 border-t border-gray-100 dark:border-[#333] mt-1">
            <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-3">
              ${item.answer}
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}
function filterFaq(keyword) {
  const list = document.getElementById('faqList');
  if(!list) return;
  const lowerKeyword = keyword.toLowerCase().trim();
  
  if (!lowerKeyword) {
    if(typeof faqData !== 'undefined') list.innerHTML = faqData.map(item => generateFaqItemHtml(item)).join('');
    return;
  }
  
  if(typeof faqData !== 'undefined') {
    const filtered = faqData.filter(item => item.question.toLowerCase().includes(lowerKeyword) || item.answer.toLowerCase().includes(lowerKeyword));
    if (filtered.length === 0) {
      list.innerHTML = `<div class="text-center py-12 text-gray-500"><svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><p class="text-sm">未找到相关问题</p><p class="text-xs text-gray-400 mt-1">请尝试其他关键词</p></div>`;
    } else {
      list.innerHTML = filtered.map(item => generateFaqItemHtml(item)).join('');
    }
  }
}
// ============================================================
// 🚀 设置页面锚点导航与滚动监听 (真·精准无Bug版)
// ============================================================

window.scrollToSetting = function(sectionId) {
  const container = document.getElementById('settingsPageContent'); // 获取真正的滚动容器
  const target = document.getElementById(sectionId); // 获取目标模块
  
  if (!container || !target) return;

  // 核心魔法：通过 getBoundingClientRect 获取视口相对位置
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  
  // 精准计算：当前已滚动的距离 + 目标相对于容器顶部的偏差 - 20px的安全留白
  const targetScrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 20;

  // 执行丝滑滚动
  container.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth' 
  });
};

// ==========================================
// 8. 新手引导页 (Wizard) 系统
// ==========================================
function initOnboardingSetting() {
  const showOnboardingCheckbox = document.getElementById('showOnboarding');
  if (showOnboardingCheckbox) {
    showOnboardingCheckbox.checked = GlobalState.getOnboarding();
    showOnboardingCheckbox.addEventListener('change', function() {
      GlobalState.setOnboarding(this.checked);
    });
  }
}

function skipOnboarding() {
  const onboarding = document.getElementById('onboarding');
  if(onboarding) {
    onboarding.classList.add('animate-fade-out');
    setTimeout(() => { onboarding.style.display = 'none'; }, 200);
  }
}

function completeOnboarding() {
  selectedBrand = wizardSelectedBrand;
  selectedPrinter = wizardSelectedPrinter;
  selectedVersion = wizardSelectedVersion;
  saveUserConfig(); 
  
  selectPrinter(selectedPrinter, true); 
  
  const onboarding = document.getElementById('onboarding');
  if(onboarding) {
      onboarding.classList.add('animate-fade-out');
      setTimeout(() => {
        onboarding.style.display = 'none';
        const targetNav = document.querySelector('[data-page="calibrate"]');
        if(targetNav) targetNav.click();
      }, 200);
  }
}

function goToStep(step) {
  currentStep = step;
  for (let i = 1; i <= 3; i++) {
    const stepItem = document.getElementById(`step${i}`);
    const stepContent = document.getElementById(`stepContent${i}`);
    if (!stepItem || !stepContent) continue;
    
    if (i < step) {
      stepItem.classList.remove('active'); stepItem.classList.add('completed'); stepContent.classList.add('hidden');
    } else if (i === step) {
      stepItem.classList.add('active'); stepItem.classList.remove('completed'); stepContent.classList.remove('hidden');
    } else {
      stepItem.classList.remove('active', 'completed'); stepContent.classList.add('hidden');
    }
  }
  updateWizardButtons();
}

function renderWizardBrands() {
  const brandList = document.getElementById('wizardBrandList');
  if(!brandList) return;
  brandList.innerHTML = '';
  
  brands.forEach(brand => {
    const brandItem = document.createElement('div');
    brandItem.className = `model-list-item ${wizardSelectedBrand === brand.id ? 'selected' : ''}`;
    brandItem.textContent = brand.name;
    brandItem.onclick = () => {
      wizardSelectedBrand = brand.id;
      renderWizardBrands();
      renderWizardModels(brand.id);
    };
    brandList.appendChild(brandItem);
  });
  renderWizardModels(wizardSelectedBrand);
}

function renderWizardModels(brandId) { 
  const modelList = document.getElementById('wizardModelList'); 
  if (!modelList) return; 
  modelList.innerHTML = ''; 
  const printers = printersByBrand[brandId] || []; 
  
  printers.forEach(printer => { 
    if (!printer.disabled) { 
      const modelItem = document.createElement('div'); 
      modelItem.className = `model-list-item ${wizardSelectedPrinter === printer.id ? 'selected' : ''}`; 
      modelItem.textContent = printer.name; 
      modelItem.onclick = () => { 
        wizardSelectedPrinter = printer.id; 
        wizardSelectedVersion = null; 
        
        renderWizardModels(brandId); 
        updateWizardOffsets(printer); 
        updateWizardBadges(printer.name, null); 
        renderWizardVersions(printer); 
        updateWizardButtons(); 
      }; 
      modelList.appendChild(modelItem); 
    } 
  }); 
} 

function updateWizardOffsets(printer) {
  document.getElementById('wizardXOffset').textContent = printer.xOffset.toFixed(2);
  document.getElementById('wizardYOffset').textContent = printer.yOffset.toFixed(2);
  document.getElementById('wizardZOffset').textContent = printer.zOffset.toFixed(2);
  
  const selectedModelBadge = document.getElementById('selectedModelBadge');
  selectedModelBadge.textContent = printer.name;
  selectedModelBadge.classList.remove('hidden');
}

function updateWizardBadges(printerName, versionType) {
  const summaryBar = document.getElementById('wizardSummaryBar');
  const modelBadge = document.getElementById('selectedModelBadge');
  const versionBadge = document.getElementById('selectedVersionBadge');

  if (printerName) {
    summaryBar.classList.remove('hidden');
    summaryBar.classList.add('flex');
    modelBadge.textContent = printerName;
    modelBadge.classList.remove('hidden');
  }

  if (versionType) {
    const theme = VERSION_THEMES[versionType];
    if (theme) {
      versionBadge.textContent = theme.title;
      versionBadge.style.setProperty('background-color', theme.bg, 'important');
      versionBadge.style.setProperty('color', theme.text, 'important');
      versionBadge.style.setProperty('border-color', 'transparent', 'important');
      versionBadge.classList.remove('hidden');
    }
  } else {
    if (versionBadge) versionBadge.classList.add('hidden');
  }
}

function renderWizardVersions(printerData) {
  renderVersionCards('wizardVersionList', printerData, wizardSelectedVersion, (vType) => {
    wizardSelectedVersion = vType;
    renderWizardVersions(printerData); 
    updateWizardBadges(printerData.name, vType); 
    updateWizardButtons(); 
  });
}

function updateWizardButtons() {
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  if (!leftBtn || !rightBtn) return;

  if (currentStep === 1) {
    leftBtn.textContent = '跳过引导'; leftBtn.onclick = skipOnboarding;
    rightBtn.textContent = '下一步';
    rightBtn.disabled = !wizardSelectedPrinter;
    rightBtn.onclick = rightBtn.disabled ? null : () => goToStep(2);
  } else if (currentStep === 2) {
    leftBtn.textContent = '上一步'; leftBtn.onclick = () => goToStep(1);
    rightBtn.textContent = '下一步';
    rightBtn.disabled = !wizardSelectedVersion;
    rightBtn.onclick = rightBtn.disabled ? null : () => goToStep(3);
  } else if (currentStep === 3) {
    leftBtn.textContent = '上一步'; leftBtn.onclick = () => goToStep(2);
    rightBtn.textContent = '完成并进入';
    rightBtn.disabled = false; rightBtn.onclick = completeOnboarding;
  }
}

// ==========================================
// 9. 动态 JSON 参数引擎
// ==========================================
window.presetCache = { path: null, data: null, timestamp: 0 };

async function getActivePresetPath() {
  const currentKey = `${selectedPrinter}_${selectedVersion}`;
  Logger.info("Read variable: mkp_current_script_" + currentKey);
  const fileName = localStorage.getItem(`mkp_current_script_${currentKey}`);
  if (!fileName) return null;
  const userDataPath = await window.mkpAPI.getUserDataPath();
  return `${userDataPath}\\${fileName}`;
}

async function loadActivePreset(forceRefresh = false) {
  const path = await getActivePresetPath();
  if (!path) return null;

  const now = Date.now();
  if (!forceRefresh && window.presetCache.path === path && (now - window.presetCache.timestamp < 2000)) {
    return { path: path, data: window.presetCache.data };
  }

  Logger.info(`[O301] Read preset, path:${path}`); 
  const result = await window.mkpAPI.readPreset(path);
  if (result.success) {
    window.presetCache = { path: path, data: result.data, timestamp: now };
    return { path, data: result.data };
  }
  
  Logger.error(`[E301] Preset not found: ${path}`);
  return null;
}

async function renderDynamicParamsPage() {
  const container = document.getElementById('dynamicParamsContainer');
  if (!container) return;
  
  container.innerHTML = `<div class="col-span-2 py-10 text-center text-gray-500"><svg class="w-8 h-8 animate-spin mx-auto theme-text mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>正在读取 JSON 预设文件...</div>`;

  const preset = await loadActivePreset();
  if (!preset) {
    container.innerHTML = `<div class="col-span-full w-full flex flex-col items-center justify-center min-h-[320px] bg-gray-50/50 dark:bg-[#1E1E1E]/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-[#333] transition-all p-8"><svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg><span class="text-lg font-semibold text-gray-500 dark:text-gray-400">当前未应用任何预设</span><span class="text-sm text-gray-400 dark:text-gray-500 mt-2 text-center">请先前往 <span onclick="navTo('page:download')" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer font-medium hover:underline transition-all">【下载预设】</span> 页面应用一个本地配置</span></div>`;
    return;
  }

  const fileName = preset.path.split('\\').pop();
  document.getElementById('currentEditingFile').textContent = fileName;

  const flatData = flattenObject(preset.data);
  let html = '';

  for (const key in flatData) {
    let val = flatData[key];
    if (Array.isArray(val) || typeof val === 'object') val = JSON.stringify(val);
    html += `<div class="bg-gray-50 dark:bg-[#1E1E1E] rounded-xl p-3 border border-gray-100 dark:border-[#333] flex flex-col justify-center"><label class="text-xs text-gray-500 block mb-1.5 break-all font-mono">${key}</label><input type="text" data-json-key="${key}" value='${val}' class="dynamic-param-input input-field theme-ring w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#444] transition-all"></div>`;
  }
  container.innerHTML = html;
}

// ==========================================
// 🚀 全局参数保存引擎 (接入高级 Q 弹连招与防连点)
// ==========================================
async function saveAllDynamicParams() {
  const preset = await loadActivePreset();
  if (!preset) {
    await MKPModal.alert({ title: '提示', msg: '当前未应用任何预设，无法保存。', type: 'warning' });
    return;
  }

  const saveBtn = document.getElementById('saveParamsBtn');
  if (!saveBtn) return;

  // 💡 1. 防连点节流阀：如果在保存中，无视狂点
  if (saveBtn.dataset.isSaving === 'true') return;
  saveBtn.dataset.isSaving = 'true';

  // 💡 2. 启动第一段连招：主题色转圈加载态
  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  let resetEngine = setButtonStatus(saveBtn, '105px', '保存中', SPIN_ICON, 'btn-expand-theme');

  const inputs = document.querySelectorAll('.dynamic-param-input');
  const flatUpdates = {};
  
  inputs.forEach(input => {
     const key = input.getAttribute('data-json-key');
     let val = input.value;
     if (!isNaN(val) && val.trim() !== '') val = Number(val);
     else if (val === 'true') val = true;
     else if (val === 'false') val = false;
     else if (val.startsWith('[') || val.startsWith('{')) { try { val = JSON.parse(val); } catch(e){} }
     flatUpdates[key] = val;
  });

  const nestedUpdates = unflattenObject(flatUpdates);
  Logger.info(`[O302] Write preset, path:${preset.path}`);
  
  // 记录开始时间
  const startTime = Date.now();
  const result = await window.mkpAPI.writePreset(preset.path, nestedUpdates);

  // 💡 3. 极客细节：哪怕本地写硬盘只有 10 毫秒，也强制让它转够 0.6 秒，保证视觉的从容与优雅
  const elapsed = Date.now() - startTime;
  if (elapsed < 600) {
      await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
  }
  
  if (result.success) {
    Logger.info(`[O302] Write preset success`); 
    if (window.presetCache) window.presetCache.timestamp = 0; 

    // 💡 4. 第二段连招：无缝切入“保存成功”的翡翠绿打勾状态
    const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
    resetEngine = setButtonStatus(saveBtn, '110px', '保存成功', CHECK_ICON, 'btn-expand-green');
    
    // 2秒后恢复原样，并解锁
    setTimeout(() => {
      resetEngine();
      saveBtn.dataset.isSaving = 'false';
    }, 2000);

  } else {
    Logger.error(`[E303] Preset write err: ${result.error}`); 
    resetEngine(); // 失败恢复原状
    saveBtn.dataset.isSaving = 'false';
    await MKPModal.alert({ title: '保存失败', msg: result.error, type: 'error' });
  }
}

function iosSmoothScroll(element, targetX, durationMs) {
  if (element._scrollAnimId) cancelAnimationFrame(element._scrollAnimId);
  const startX = element.scrollLeft;
  const distance = targetX - startX;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    let progress = elapsed / durationMs;
    if (progress > 1) progress = 1;
    const easeOut = 1 - Math.pow(1 - progress, 5);
    element.scrollLeft = startX + distance * easeOut;

    if (progress < 1) element._scrollAnimId = requestAnimationFrame(step); 
    else element._scrollAnimId = null;
  }
  element._scrollAnimId = requestAnimationFrame(step);
}

async function updateScriptPathDisplay() {
  const scriptInput = document.getElementById('scriptPath');
  const copyBtn = document.getElementById('scriptCopyBtn');
  if (!scriptInput) return;

  try {
    const presetPath = await getActivePresetPath();
    if (!presetPath) {
      scriptInput.value = "请先在【下载预设】页面应用一个配置！";
      scriptInput.classList.remove('text-gray-500', 'dark:text-gray-400');
      scriptInput.classList.add('theme-text', 'font-bold'); 
      if (copyBtn) copyBtn.disabled = true;
      return;
    }

    const exePath = await window.mkpAPI.getExePath();
    const command = `"${exePath}" --Json "${presetPath}" --Gcode`;
    
    scriptInput.value = command;
    if (scriptInput._scrollAnimId) cancelAnimationFrame(scriptInput._scrollAnimId);
    scriptInput.scrollLeft = 0;
    
    setTimeout(() => {
      const trueTargetX = scriptInput.scrollWidth - scriptInput.clientWidth;
      if (trueTargetX > 0) iosSmoothScroll(scriptInput, trueTargetX, 1000);
    }, 150); 
    
    scriptInput.classList.remove('theme-text', 'font-bold', 'text-red-500');
    scriptInput.classList.add('text-gray-500', 'dark:text-gray-400'); 
    if (copyBtn) copyBtn.disabled = false;
    
  } catch (e) {
    Logger.error(`[E204] Path gen err: ${e.message}`);
    scriptInput.value = "生成路径时发生错误";
    scriptInput.classList.remove('text-gray-500', 'dark:text-gray-400', 'theme-text');
    scriptInput.classList.add('text-red-500', 'font-bold');
  }
}

async function fetchAndRenderZOffsetData() {
  try {
    const preset = await loadActivePreset();
    let fetchedOffset = 0;
    
    if (preset && preset.data) {
      const jsonData = preset.data;
      if (jsonData.toolhead && jsonData.toolhead.offset && jsonData.toolhead.offset.z !== undefined) {
        fetchedOffset = parseFloat(jsonData.toolhead.offset.z);
      } else if (jsonData.z_offset !== undefined) {
        fetchedOffset = parseFloat(jsonData.z_offset);
      } else if (jsonData.z !== undefined) {
        fetchedOffset = parseFloat(jsonData.z);
      }
    }

    window.currentZOffset = fetchedOffset;

    const originalDisplays = [
      document.getElementById('zOriginal'),
      document.getElementById('zNewValue'),
      document.getElementById('currentZOffsetDisplay')
    ];
    originalDisplays.forEach(el => {
      if (el) el.textContent = fetchedOffset.toFixed(2);
    });
  } catch (error) {
    Logger.error(`[E302] Preset parse err: ${error.message}`); 
    console.error("读取 JSON 预设文件失败:", error);
    window.currentZOffset = 0; 
  }
}

function scrollToZCardWithPadding() {
  setTimeout(() => {
    const targetCard = document.getElementById('zCalibrationCard');
    if (targetCard) {
      targetCard.style.scrollMarginTop = '100px';
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

async function openZGridDirectly() {
  const zPlaceholder = document.getElementById('zPlaceholder');
  const zGridSelector = document.getElementById('zGridSelector');
  const zProgress = document.getElementById('zProgress');

  await fetchAndRenderZOffsetData();
  zProgress.classList.add('hidden');
  zPlaceholder.classList.add('hidden');
  zGridSelector.classList.remove('hidden');

  generateZGrid();
  scrollToZCardWithPadding();
}

async function openZModel() {
  const zProgress = document.getElementById('zProgress');
  const zPlaceholder = document.getElementById('zPlaceholder');
  const zGridSelector = document.getElementById('zGridSelector');

  await fetchAndRenderZOffsetData();

  zProgress.classList.remove('hidden');
  zPlaceholder.classList.add('hidden');

  try {
    Logger.info(`[O304] Copy model`); 
    Logger.info(`[O601] Open slicer`); 
    Logger.info("Read variable: hasOpenedModelBefore");
    const hasOpened = localStorage.getItem('hasOpenedModelBefore');
    const forceOpenWith = !hasOpened;
    const result = await window.mkpAPI.openCalibrationModel('Z', forceOpenWith);

    if (result.success) {
      if (forceOpenWith) {
        Logger.info("Write variable: hasOpenedModelBefore, v:true");
        localStorage.setItem('hasOpenedModelBefore', 'true');
      }
      zProgress.classList.add('hidden');
      zGridSelector.classList.remove('hidden');
      
      generateZGrid();
      scrollToZCardWithPadding();
    } else {
      Logger.error(`[E601] Slicer call err / [E306] Model copy err: ${result.error}`); 
      alert('打开模型失败: ' + result.error);
      zProgress.classList.add('hidden');
      zPlaceholder.classList.remove('hidden');
    }
  } catch (error) {
    Logger.error(`[E601] Slicer call err / [E306] Model copy err: ${error.message}`); 
    console.error("打开模型时发生严重底层错误:", error);
    alert('打开模型失败，请按 Ctrl+Shift+I 截图控制台红字发给开发者。');
    zProgress.classList.add('hidden');
    zPlaceholder.classList.remove('hidden');
  }
}

let selectedGridOffset = null;

function generateZGrid() {
  const zGrid = document.getElementById('zGrid');
  if (!zGrid) { Logger.error("[E201] DOM missing: zGrid"); return; }

  const offsets = [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5];
  let html = '';

  offsets.forEach(offset => {
    const displayText = offset > 0 ? `+${offset.toFixed(1)}` : (offset === 0 ? '0' : offset.toFixed(1));
    const isSelected = (selectedGridOffset === offset);

    const boxBg = offset === 0 ? "bg-[#C0C0C0] dark:bg-[#555]" : "bg-[#D9D9D9] dark:bg-[#444]";
    const dotHtml = offset === 0 ? `<div class="absolute inset-0 m-auto w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-400"></div>` : "";
    const textSize = offset === 0 ? "text-3xl font-black leading-none" : "text-base font-medium";

    let boxBorder = isSelected ? "border-current theme-text" : "border-transparent group-hover:border-gray-900 dark:group-hover:border-gray-100";
    let textColor = isSelected ? "theme-text" : (offset === 0 ? "text-black dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100" : "text-black dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100");

    html += `
      <button class="z-block-item flex flex-col items-center justify-end gap-1 outline-none group cursor-pointer h-[160px]" data-offset="${offset}" onclick="handleZBlockClick(${offset})">
        <div class="z-block-box shrink-0 rounded-[7px] border-2 shadow-sm relative flex items-center justify-center transition-colors ${boxBg} ${boxBorder}">
          ${dotHtml}
        </div>
        <div class="h-[24px] flex items-start justify-center">
          <span class="z-block-text font-inter tabular-nums block transition-colors ${textSize} ${textColor}">${displayText}</span>
        </div>
      </button>
    `;
  });

  zGrid.innerHTML = html;
}

function updateZGridSelection() {
  const items = document.querySelectorAll('.z-block-item');
  items.forEach(item => {
    const offset = parseFloat(item.dataset.offset);
    const box = item.querySelector('.z-block-box');
    const text = item.querySelector('.z-block-text');
    const isSelected = (offset === selectedGridOffset);

    const boxBg = offset === 0 ? "bg-[#C0C0C0] dark:bg-[#555]" : "bg-[#D9D9D9] dark:bg-[#444]";
    const textSize = offset === 0 ? "text-3xl font-black leading-none" : "text-base font-medium";

    let boxBorder = isSelected ? "border-current theme-text" : "border-transparent group-hover:border-gray-900 dark:group-hover:border-gray-100";
    let textColor = isSelected ? "theme-text" : (offset === 0 ? "text-black dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100" : "text-black dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100");

    box.className = `z-block-box shrink-0 rounded-[7px] border-2 shadow-sm relative flex items-center justify-center transition-colors ${boxBg} ${boxBorder}`;
    text.className = `z-block-text font-inter tabular-nums block transition-colors ${textSize} ${textColor}`;
  });
}

function handleZBlockClick(offset) {
  selectedGridOffset = offset;
  updateZGridSelection(); 
  selectZOffset(offset);  
}

function selectZOffset(offset) {
  Logger.info(`[O209] Click Z grid, v:${offset}`); 
  const zBadge = document.getElementById('zBadge');
  const zNewValue = document.getElementById('zNewValue');

  const baseVal = parseFloat(window.currentZOffset) || 0; 
  const newValue = Number((baseVal + parseFloat(offset)).toFixed(2));

  if (isNaN(newValue)) {
    Logger.error(`[E501] Offset NaN, base:${baseVal}, offset:${offset}`);
  } else {
    Logger.info(`[O501] Calc Z offset, newZ:${newValue}`);
  }

  if (zBadge && zNewValue) {
    zBadge.textContent = offset >= 0 ? `+${offset.toFixed(2)}` : offset.toFixed(2);
    zBadge.classList.remove('hidden'); 
    zNewValue.textContent = isNaN(newValue) ? "Err" : newValue.toFixed(2); 
  }
}

// ==========================================
// 🚀 Z 轴偏移保存引擎 (带状态净化)
// ==========================================
async function saveZOffset(btnElement) {
  const newValueStr = document.getElementById('zNewValue').textContent;
  const newZ = parseFloat(newValueStr);
  
  if (isNaN(newZ)) {
    await MKPModal.alert({ title: '参数异常', msg: 'Z轴偏移数值异常，请重新选择后再保存！', type: 'error' });
    return;
  }
  
  const preset = await loadActivePreset();
  if (!preset) {
    await MKPModal.alert({ title: '提示', msg: '请先在左侧菜单的【下载预设】页面应用一个配置！', type: 'warning' });
    return;
  }
  
  if (!btnElement) btnElement = document.querySelector('button[onclick^="saveZOffset"]');

  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  let resetLoading = () => {};
  if (btnElement) resetLoading = setButtonStatus(btnElement, '115px', '保存中...', SPIN_ICON, 'btn-expand-theme');

  let updatePayload = {};
  if (preset.data && preset.data.toolhead && preset.data.toolhead.offset) {
    updatePayload = { toolhead: { ...preset.data.toolhead, offset: { ...preset.data.toolhead.offset, z: newZ } } };
  } else {
    updatePayload = { z_offset: newZ };
  }

  const result = await window.mkpAPI.writePreset(preset.path, updatePayload);
  
  if (result.success) {
    window.currentZOffset = newZ;
    document.getElementById('zOriginal').textContent = newZ.toFixed(2);
    const display = document.getElementById('currentZOffsetDisplay');
    if (display) display.textContent = newZ.toFixed(2);

    if (typeof selectedGridOffset !== 'undefined') {
        selectedGridOffset = null;
        if (typeof updateZGridSelection === 'function') updateZGridSelection();
    }
    const zBadge = document.getElementById('zBadge');
    if (zBadge) zBadge.classList.add('hidden');

    if (btnElement) {
      // 💡 核心修改：直接抹掉 resetLoading()，无缝呼叫新的状态！
      const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
      
      // 这一步会极其丝滑地将 115px 的蓝色胶囊，揉捏成 110px 的绿色胶囊，中间没有任何跳跃！
      const resetSuccess = setButtonStatus(btnElement, '110px', '已保存', CHECK_ICON, 'btn-expand-green');
      setTimeout(resetSuccess, 1000); 
    }
  } else {
    // 只有失败的时候，才调用原始的恢复函数
    if (btnElement) resetLoading();
    await MKPModal.alert({ title: '保存失败', msg: result.error, type: 'error' });
  }
}

// ==========================================
// 🚀 XY 轴偏移保存引擎 (同步升级)
// ==========================================
async function saveXYOffset(btnElement) {
  if (!btnElement) btnElement = document.querySelector('button[onclick^="saveXYOffset"]');
  
  // 目前 XY 功能还没接底层，先给它把动画安排上
  const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
  if (btnElement) {
    const reset = setButtonStatus(btnElement, '110px', '已保存', CHECK_ICON, 'btn-expand-green');
    setTimeout(reset, 2000);
  }
}


function bindNavigation() {
  // 防内存泄漏：如果绑定过了就不再绑
  if (window._isNavBound) return;
  window._isNavBound = true;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      if (page) {
        switchPage(page);
        document.querySelectorAll('.nav-item').forEach(navItem => {
          navItem.classList.remove('active');
        });
        item.classList.add('active');
      }
    });
  });
}

function switchPage(page) {
  Logger.info(`[UI] Switch tab, page:${page}`);
  document.querySelectorAll('.page').forEach(p => {
    p.classList.add('hidden');
  });
  document.getElementById(`page-${page}`).classList.remove('hidden');

  if (page === 'params') {
    if (typeof renderDynamicParamsPage === 'function') renderDynamicParamsPage();
  } else if (page === 'calibrate') {
    if (typeof updateScriptPathDisplay === 'function') updateScriptPathDisplay();
  }
}

function toggleMacDockAnimation(enable) {
  Logger.info("Write variable: setting_dock_anim, v:" + enable);
  const zGrid = document.getElementById('zGrid');
  const scaleContainer = document.getElementById('dockScaleContainer');
  const scaleSlider = document.getElementById('settingDockScaleRange');

  if (zGrid) {
    if (enable) zGrid.classList.add('enable-dock-anim');
    else zGrid.classList.remove('enable-dock-anim');
  }

  if (scaleContainer && scaleSlider) {
    if (enable) {
      scaleContainer.classList.remove('opacity-40', 'pointer-events-none', 'grayscale');
      scaleSlider.disabled = false;
    } else {
      scaleContainer.classList.add('opacity-40', 'pointer-events-none', 'grayscale');
      scaleSlider.disabled = true;
    }
  }

  localStorage.setItem('setting_dock_anim', enable ? 'true' : 'false');
}

window.macDockBaseSize = parseInt(localStorage.getItem('setting_dock_size')) || 38;
window.macDockMaxScale = parseFloat(localStorage.getItem('setting_dock_scale')) || 1.5;

function setMacDockSize(sizeValue) {
  Logger.info("Write variable: setting_dock_size, v:" + sizeValue);
  window.macDockBaseSize = parseInt(sizeValue);
  localStorage.setItem('setting_dock_size', sizeValue);
  document.documentElement.style.setProperty('--dock-base-size', `${sizeValue}px`);
}

function setMacDockScale(scaleValue) {
  Logger.info("Write variable: setting_dock_scale, v:" + scaleValue);
  window.macDockMaxScale = parseFloat(scaleValue);
  localStorage.setItem('setting_dock_scale', scaleValue);
}

// 全局防重复初始化锁
let _isAppInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (_isAppInitialized) return;
  _isAppInitialized = true;

  Logger.info("Read variable: setting_dock_anim");
  const savedAnimState = localStorage.getItem('setting_dock_anim');
  const wantsAnim = savedAnimState === null ? true : savedAnimState === 'true';
  
  const realVersion = await window.mkpAPI.getAppVersion();
  APP_REAL_VERSION = realVersion; 
  document.getElementById('settingsCurrentVersion').innerText = `v${realVersion}`;

  const animCheckbox = document.getElementById('settingMacAnim');
  if (animCheckbox) animCheckbox.checked = wantsAnim;
  
  toggleMacDockAnimation(wantsAnim);

  const fixedPages = document.querySelectorAll('.page[data-fixed-header="true"]');
  fixedPages.forEach(page => {
    const header = page.querySelector('.page-header');
    const content = page.querySelector('.page-content');
    if (header && content) {
      content.addEventListener('scroll', () => {
        if (content.scrollTop > 10) header.classList.add('is-scrolled');
        else header.classList.remove('is-scrolled');

        if (page.id === 'page-about') {
          const heroSection = document.getElementById('about-hero-section');
          const miniHeader = document.getElementById('about-mini-header');
          if (heroSection && miniHeader) {
            if (content.scrollTop > 190) {
              heroSection.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
              miniHeader.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
              miniHeader.classList.add('opacity-100', 'pointer-events-auto');
            } else {
              heroSection.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
              miniHeader.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
              miniHeader.classList.remove('opacity-100', 'pointer-events-auto');
            }
          }
        }
      });
    }
  });

  const settingsContainer = document.getElementById('settingsPageContent');
  if (settingsContainer) {
    settingsContainer.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('.settings-section');
      const navItems = document.querySelectorAll('.settings-nav-item');
      const containerRect = settingsContainer.getBoundingClientRect();
      let currentActiveIndex = 0;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= containerRect.top + 120) currentActiveIndex = index;
      });

      navItems.forEach((item, index) => {
        if (index === currentActiveIndex) {
          item.classList.add('active', 'theme-text');
          item.classList.remove('text-gray-500', 'hover:text-gray-900', 'dark:hover:text-gray-200');
        } else {
          item.classList.remove('active', 'theme-text');
          item.classList.add('text-gray-500', 'hover:text-gray-900', 'dark:hover:text-gray-200');
        }
      });
    });
  }
  
  document.documentElement.style.setProperty('--dock-base-size', `${window.macDockBaseSize}px`);
  
  const sizeSlider = document.getElementById('settingDockSizeRange');
  if (sizeSlider) sizeSlider.value = window.macDockBaseSize;

  const scaleSlider = document.getElementById('settingDockScaleRange');
  if (scaleSlider) scaleSlider.value = window.macDockMaxScale;

  const dock = document.getElementById('zGrid');
  if (dock) {
    const curveRange = 360; 
    const minScale = 1;     

    dock.addEventListener('mousemove', (e) => {
      if (!dock.classList.contains('enable-dock-anim')) return;
      const currentMaxScale = window.macDockMaxScale; 
      const items = dock.querySelectorAll('.z-block-item');
      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenterX = rect.left + rect.width / 2;
        const beginX = e.clientX - (curveRange / 2);
        const endX = e.clientX + (curveRange / 2);

        let scale = minScale;
        if (itemCenterX >= beginX && itemCenterX <= endX) {
          const amplitude = currentMaxScale - minScale;
          const angle = ((itemCenterX - beginX) / curveRange) * Math.PI;
          scale = (Math.sin(angle) * amplitude) + minScale;
        }
        item.style.setProperty('--dock-scale', scale);
      });
    });

    dock.addEventListener('mouseenter', () => {
      if (!dock.classList.contains('enable-dock-anim')) return;
      dock.style.setProperty('--dock-transition', '0.15s');
      clearTimeout(dock.transitionTimeout);
      dock.transitionTimeout = setTimeout(() => dock.style.setProperty('--dock-transition', '0s'), 150);
    });

    dock.addEventListener('mouseleave', () => {
      dock.style.setProperty('--dock-transition', '0.3s');
      clearTimeout(dock.transitionTimeout);
      const items = dock.querySelectorAll('.z-block-item');
      items.forEach(item => item.style.setProperty('--dock-scale', 1));
    });
  }
  await init();
});

// 🚀 高级复制 QQ 群号功能 (稳定容器版，绝对不闪)
async function copyQQGroup(btnElement) {
  try {
    // 1. 调用双重保险复制引擎
    await copyToClipboard('668350689');
    
    // 2. 启动神级 Q 弹引擎
    const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
    
    // 💡 重点：原来的 QQ 号按钮比较宽，点击后让它“缩减”到 92px 变成“已复制”，有一种非常高级的物理收缩感！
    const reset = setButtonStatus(btnElement, '92px', '已复制', CHECK_ICON, 'btn-expand-green');
    
    // 3. 2秒后自动缩回原样
    setTimeout(reset, 2000);
    
  } catch (err) {
    await MKPModal.alert({ 
      title: '复制失败', 
      msg: '无法访问剪贴板，群号为：668350689', 
      type: 'error', 
      confirmText: '确定' ,
      allowOutsideClick: true
    });
  }
}

// ==========================================
// 🚀 全局通用：双重保险剪贴板引擎 (专治 Electron 复制失败)
// ==========================================
async function copyToClipboard(text) {
  try {
    // 🥇 方案一：尝试使用现代 API (如果环境允许的话)
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("navigator.clipboard API 不可用");
  } catch (err) {
    // 🥈 方案二：DOM 传统强杀方案 (无视安全协议限制，100% 成功率)
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // 把文本框藏到屏幕外面去，防止闪烁
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      
      // 强制选中并执行物理复制命令
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      
      // 销毁证据
      document.body.removeChild(textArea);
      
      if (successful) return true;
      throw new Error("document.execCommand 也失败了");
    } catch (fallbackErr) {
      Logger.error(`[Clipboard] 双重复制引擎均失败: ${err.message} / ${fallbackErr.message}`);
      throw new Error("彻底无法访问系统剪贴板");
    }
  }
}

async function init() {
  Logger.info("[O101] App init start"); 
  Logger.info("=== 软件启动，开始初始化 ===");
  document.title = `支撑面改善工具 (MKP SupportE) v${APP_REAL_VERSION}`;
  
  try {
    if (window.mkpAPI && window.mkpAPI.initDefaultPresets) {
      await window.mkpAPI.initDefaultPresets();
      Logger.info("[O103] Default preset release"); 
      Logger.info("底层默认预设 JSON 检查/释放完成");
    }
  } catch (error) {
    Logger.error(`[E102] Preset release fail: ${error.message}`); 
  }
  
  loadUserConfig(); 
  
  renderBrands();
  if (selectedPrinter) {
    selectPrinter(selectedPrinter, true); 
    Logger.info(`自动加载了上次记忆的机型 | 附加数据: {"printer":"${selectedPrinter}"}`);

    const currentKey = `${selectedPrinter}_${selectedVersion}`;
    Logger.info("Read variable: mkp_current_script_" + currentKey);
    const activeFileName = localStorage.getItem(`mkp_current_script_${currentKey}`);
    
    if (activeFileName) {
      Logger.info(`[O301] Read preset (Auto-load), apply file:${activeFileName}`);
    } else {
      Logger.warn(`[E301] Preset not found on startup for ${currentKey}`);
    }
  }
  
  renderVersions();
  bindNavigation();
  bindContextMenu();
  renderWizardBrands();
  filterFaq('');
  
  // 💡 执行各种外部模块的初始化
  if (typeof initTheme === 'function') initTheme();
  if (typeof initSystemThemeListener === 'function') initSystemThemeListener();
  if (typeof initOnboardingSetting === 'function') initOnboardingSetting();

  initUpdateModeSetting();
  if (!GlobalState.getOnboarding()) {
    Logger.info("用户设置了关闭引导页，直接跳过");
    skipOnboarding();
  } else {
    Logger.info("进入新手引导页面");
  }

  // 🚀 【核心修复：问题一】初始化颜色同步
  // 等待所有 DOM 渲染完毕后，强制同步一次全局颜色和徽章状态！
  setTimeout(() => {
    // 1. 如果你有独立的更新颜色函数，强制呼叫它 (确保 --primary-rgb 被正确注入)
    if (typeof applyCurrentThemeColor === 'function') {
        applyCurrentThemeColor(); 
    } else if (typeof initTheme === 'function') {
        initTheme(); // 兜底再刷一次
    }
    
    // 2. 强制刷新左侧边栏的“版本徽章”颜色 (标准版/快拆版)
    if (selectedVersion) {
        updateSidebarVersionBadge(selectedVersion);
    }
  }, 100);

  Logger.info("[O102] App init done"); 
}