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
const INITIAL_DISPLAY_COUNT = 3;
let sidebarCollapsed = false;
let appliedReleases = {}; 

let cachedOnlineReleases = null; 
let currentZOffset = 0; 
let currentXOffset = 0;
let currentYOffset = 0;
let calibrationContextKey = '';
let isUserConfigPersistenceSuspended = false;
let isCrossWindowSyncBound = false;
let lastPresetMutationSignalTs = 0;
let presetMutationPromptInFlight = false;

let APP_REAL_VERSION = '0.0.0';
const ACTIVE_PRESET_UPDATED_EVENT = 'mkp:active-preset-updated';
const PRESET_MUTATION_SIGNAL_KEY = 'mkp_preset_mutation_signal';
const RENDERER_WINDOW_SYNC_ID = `renderer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

function updatePresetCacheSnapshot(path, data) {
  window.presetCache = {
    path: path || null,
    data: data || null,
    timestamp: Date.now()
  };
}

function emitActivePresetUpdated(detail = {}) {
  window.dispatchEvent(new CustomEvent(ACTIVE_PRESET_UPDATED_EVENT, {
    detail: {
      reason: detail.reason || 'unknown',
      path: detail.path || null,
      forceRefresh: detail.forceRefresh !== false,
      keepSelections: detail.keepSelections === true
    }
  }));
}

window.updatePresetCacheSnapshot = updatePresetCacheSnapshot;
window.emitActivePresetUpdated = emitActivePresetUpdated;

function normalizePresetPathForCompare(filePath) {
  return String(filePath || '')
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .trim()
    .toLowerCase();
}

function broadcastPresetMutation(detail = {}) {
  const payload = {
    path: detail.path || null,
    reason: detail.reason || 'unknown',
    ts: Date.now(),
    sourceId: RENDERER_WINDOW_SYNC_ID
  };
  localStorage.setItem(PRESET_MUTATION_SIGNAL_KEY, JSON.stringify(payload));
}

window.broadcastPresetMutation = broadcastPresetMutation;
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
    const tokenize = (value) => String(value || '0.0.0')
      .replace(/^v/i, '')
      .toLowerCase()
      .split(/[\.\-_]/)
      .flatMap((part) => part.match(/[a-z]+|\d+/g) || ['0']);
    const isNumeric = (token) => /^\d+$/.test(token);
    const isZeroLike = (token) => token === undefined || token === null || token === '' || token === '0';

    const leftTokens = tokenize(v1);
    const rightTokens = tokenize(v2);
    const len = Math.max(leftTokens.length, rightTokens.length);

    for (let i = 0; i < len; i++) {
      const left = leftTokens[i];
      const right = rightTokens[i];

      if (left === right) continue;
      if (left === undefined) return isZeroLike(right) ? 0 : -1;
      if (right === undefined) return isZeroLike(left) ? 0 : 1;

      if (isNumeric(left) && isNumeric(right)) {
        const num1 = Number(left);
        const num2 = Number(right);
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
        continue;
      }

      if (isNumeric(left) && !isNumeric(right)) return 1;
      if (!isNumeric(left) && isNumeric(right)) return -1;

      const textCompare = left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
      if (textCompare !== 0) return textCompare;
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

function positionFloatingMenu(menu, x, y, options = {}) {
  if (!menu) return;

  const margin = Number.isFinite(options.margin) ? options.margin : 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const wasHidden = menu.classList.contains('hidden');
  const prevVisibility = menu.style.visibility;
  const prevLeft = menu.style.left;
  const prevTop = menu.style.top;

  if (wasHidden) {
    menu.classList.remove('hidden');
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
  }

  const rect = menu.getBoundingClientRect();
  const menuWidth = Math.max(rect.width || 0, options.minWidth || 0);
  const menuHeight = Math.max(rect.height || 0, options.minHeight || 0);

  let left = Number.isFinite(x) ? x : margin;
  let top = Number.isFinite(y) ? y : margin;

  if (left + menuWidth + margin > viewportWidth) {
    left = Math.max(margin, viewportWidth - menuWidth - margin);
  }
  if (top + menuHeight + margin > viewportHeight) {
    top = Math.max(margin, viewportHeight - menuHeight - margin);
  }

  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
  menu.style.maxWidth = `${Math.max(180, viewportWidth - margin * 2)}px`;
  menu.style.maxHeight = `${Math.max(120, viewportHeight - margin * 2)}px`;

  if (wasHidden) {
    menu.style.visibility = prevVisibility;
  } else {
    menu.style.visibility = '';
  }

  if (wasHidden && options.keepVisible !== true) {
    menu.classList.add('hidden');
    menu.style.left = prevLeft;
    menu.style.top = prevTop;
    menu.style.visibility = prevVisibility;
  }
}

window.positionFloatingMenu = positionFloatingMenu;

const floatingSurfaceHideTimers = new WeakMap();
const floatingTooltipState = {
  anchor: null
};

function escapeFloatingText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearFloatingSurfaceHideTimer(element) {
  const timer = floatingSurfaceHideTimers.get(element);
  if (timer) {
    clearTimeout(timer);
    floatingSurfaceHideTimers.delete(element);
  }
}

function showFloatingSurface(element) {
  if (!element) return;
  clearFloatingSurfaceHideTimer(element);
  element.dataset.floatingSurface = 'true';
  element.classList.remove('hidden', 'is-hiding');
  requestAnimationFrame(() => {
    element.classList.add('is-visible');
  });
}

function hideFloatingSurface(element, options = {}) {
  if (!element || element.classList.contains('hidden')) return;
  clearFloatingSurfaceHideTimer(element);
  element.classList.remove('is-visible');

  if (element.id === 'tooltip') {
    floatingTooltipState.anchor = null;
  }

  if (options.immediate) {
    element.classList.remove('is-hiding');
    element.classList.add('hidden');
    return;
  }

  element.classList.add('is-hiding');
  const timer = window.setTimeout(() => {
    element.classList.remove('is-hiding');
    element.classList.add('hidden');
    floatingSurfaceHideTimers.delete(element);
  }, 160);
  floatingSurfaceHideTimers.set(element, timer);
}

function hideAllFloatingSurfaces(options = {}) {
  document.querySelectorAll('[data-floating-surface="true"]:not(.hidden)').forEach((element) => {
    hideFloatingSurface(element, options);
  });
}

function ensureGlobalTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return null;
  tooltip.dataset.floatingSurface = 'true';
  tooltip.classList.add('app-floating-tooltip');
  return tooltip;
}

function getFloatingTooltipContent(anchor) {
  if (!anchor) return '';
  if (anchor.dataset.tooltipHtml) return anchor.dataset.tooltipHtml;

  const inlineTip = anchor.querySelector('.param-tip');
  if (inlineTip) return inlineTip.innerHTML;

  const title = anchor.dataset.tipTitle || '';
  const body = anchor.dataset.tipBody || '';
  if (!title && !body) return '';

  const safeTitle = title ? `<div class="param-tip-title">${escapeFloatingText(title)}</div>` : '';
  const safeBody = body ? `<div class="param-tip-body">${escapeFloatingText(body)}</div>` : '';
  return `${safeTitle}${safeBody}`;
}

function positionFloatingTooltip(anchor, tooltip) {
  if (!anchor || !tooltip) return;

  const margin = 12;
  const gap = 10;
  const anchorRect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  tooltip.style.maxWidth = `${Math.max(220, viewportWidth - margin * 2)}px`;
  tooltip.style.visibility = 'hidden';
  tooltip.classList.remove('hidden');

  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width || 280;
  const tooltipHeight = tooltipRect.height || 120;

  let left = anchorRect.left;
  let top = anchorRect.bottom + gap;
  let placement = 'bottom';

  if (left + tooltipWidth + margin > viewportWidth) {
    left = viewportWidth - tooltipWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }

  if (top + tooltipHeight + margin > viewportHeight) {
    const topPlacement = anchorRect.top - tooltipHeight - gap;
    if (topPlacement >= margin) {
      top = topPlacement;
      placement = 'top';
    } else {
      top = Math.max(margin, viewportHeight - tooltipHeight - margin);
    }
  }

  tooltip.dataset.placement = placement;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.visibility = '';
}

function showFloatingTooltip(anchor) {
  const tooltip = ensureGlobalTooltip();
  const content = getFloatingTooltipContent(anchor);
  if (!tooltip || !content) return;

  floatingTooltipState.anchor = anchor;
  tooltip.innerHTML = content;
  positionFloatingTooltip(anchor, tooltip);
  showFloatingSurface(tooltip);
}

function hideFloatingTooltip(options = {}) {
  const tooltip = ensureGlobalTooltip();
  if (!tooltip) return;
  floatingTooltipState.anchor = null;
  hideFloatingSurface(tooltip, options);
}

function bindFloatingTooltipSystem() {
  if (window.__floatingTooltipSystemBound) return;
  window.__floatingTooltipSystemBound = true;

  document.addEventListener('mouseover', (event) => {
    const anchor = event.target.closest('.param-tooltip-anchor, [data-floating-tip], [data-tooltip-html]');
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    showFloatingTooltip(anchor);
  }, true);

  document.addEventListener('mouseout', (event) => {
    const anchor = event.target.closest('.param-tooltip-anchor, [data-floating-tip], [data-tooltip-html]');
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    if (floatingTooltipState.anchor === anchor) {
      hideFloatingTooltip();
    }
  }, true);

  document.addEventListener('focusin', (event) => {
    const anchor = event.target.closest('.param-tooltip-anchor, [data-floating-tip], [data-tooltip-html]');
    if (anchor) showFloatingTooltip(anchor);
  });

  document.addEventListener('focusout', (event) => {
    const anchor = event.target.closest('.param-tooltip-anchor, [data-floating-tip], [data-tooltip-html]');
    if (anchor && floatingTooltipState.anchor === anchor) {
      hideFloatingTooltip();
    }
  });

  window.addEventListener('resize', () => {
    if (floatingTooltipState.anchor) {
      const tooltip = ensureGlobalTooltip();
      if (tooltip && !tooltip.classList.contains('hidden')) {
        positionFloatingTooltip(floatingTooltipState.anchor, tooltip);
      }
    }
  });
}

function bindFloatingSurfaceAutoDismiss() {
  if (window.__floatingSurfaceAutoDismissBound) return;
  window.__floatingSurfaceAutoDismissBound = true;

  let pending = false;
  const handleScrollDismiss = (event) => {
    const target = event.target;
    if (target?.closest?.('#tooltip, .param-context-menu, #fileContextMenu')) return;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      hideAllFloatingSurfaces();
    });
  };

  document.addEventListener('scroll', handleScrollDismiss, true);
  window.addEventListener('resize', () => {
    hideAllFloatingSurfaces({ immediate: true });
  });
}

window.showFloatingSurface = showFloatingSurface;
window.hideFloatingSurface = hideFloatingSurface;
window.hideAllFloatingSurfaces = hideAllFloatingSurfaces;
window.showFloatingTooltip = showFloatingTooltip;
window.hideFloatingTooltip = hideFloatingTooltip;
window.bindFloatingTooltipSystem = bindFloatingTooltipSystem;
window.bindFloatingSurfaceAutoDismiss = bindFloatingSurfaceAutoDismiss;

function saveUserConfig() {
  if (isUserConfigPersistenceSuspended) {
    return;
  }

  let previousConfig = {};
  try {
    previousConfig = JSON.parse(localStorage.getItem('mkp_user_config') || '{}') || {};
  } catch (error) {
    previousConfig = {};
  }

  const mergedAppliedReleases = {
    ...(previousConfig.appliedReleases || {}),
    ...appliedReleases
  };
  const resolvedPrinter = selectedPrinter || previousConfig.printer || null;
  const resolvedBrand = selectedBrand || previousConfig.brand || null;
  const resolvedVersion = resolvePersistedVersionForPrinter(
    resolvedPrinter,
    selectedVersion || previousConfig.version || null,
    { appliedReleases: mergedAppliedReleases }
  );

  const config = {
    brand: resolvedBrand,
    printer: resolvedPrinter,
    version: resolvedVersion,
    appliedReleases: mergedAppliedReleases
  };

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
      if (config.appliedReleases) appliedReleases = config.appliedReleases; 
      selectedVersion = resolvePersistedVersionForPrinter(
        config.printer || selectedPrinter,
        config.version || selectedVersion,
        config
      );
    }
  } catch (e) { console.error("加载配置文件失败", e); }
}

function resolvePersistedVersionForPrinter(printerId, preferredVersion = null, config = {}) {
  if (!printerId) return null;

  const printer = getPrinterObj(printerId);
  const supportedVersions = Array.isArray(printer?.supportedVersions) ? printer.supportedVersions : [];
  if (supportedVersions.length === 0) {
    return preferredVersion || null;
  }

  if (preferredVersion && supportedVersions.includes(preferredVersion)) {
    return preferredVersion;
  }

  const appliedMap = (config && typeof config === 'object' && config.appliedReleases && typeof config.appliedReleases === 'object')
    ? config.appliedReleases
    : appliedReleases;

  for (const version of supportedVersions) {
    const currentKey = `${printerId}_${version}`;
    if (localStorage.getItem(`mkp_current_script_${currentKey}`) || appliedMap?.[currentKey]) {
      return version;
    }
  }

  return null;
}

function hasRestorablePresetSession() {
  const restoredVersion = resolvePersistedVersionForPrinter(selectedPrinter, selectedVersion, { appliedReleases });
  if (!selectedPrinter || !restoredVersion) {
    return false;
  }
  return !!localStorage.getItem(`mkp_current_script_${selectedPrinter}_${restoredVersion}`);
}

async function withSuspendedUserConfigPersistence(callback) {
  const previousState = isUserConfigPersistenceSuspended;
  isUserConfigPersistenceSuspended = true;
  try {
    return await callback();
  } finally {
    isUserConfigPersistenceSuspended = previousState;
  }
}

function syncOnboardingSettingFromStorage() {
  const nextValue = localStorage.getItem('showOnboarding') !== 'false';
  GlobalState.onboarding = nextValue;

  const checkbox = document.getElementById('showOnboarding');
  if (checkbox) {
    checkbox.checked = nextValue;
  }
  document.documentElement.toggleAttribute('data-hide-onboarding', !nextValue);

  if (!nextValue && typeof skipOnboarding === 'function') {
    skipOnboarding();
  }
}

function syncDockSettingsFromStorage() {
  const savedAnimState = localStorage.getItem('setting_dock_anim');
  const wantsAnim = savedAnimState === null ? true : savedAnimState === 'true';
  const animCheckbox = document.getElementById('settingMacAnim');
  if (animCheckbox) {
    animCheckbox.checked = wantsAnim;
  }
  toggleMacDockAnimation(wantsAnim, { persist: false });

  const sizeValue = parseInt(localStorage.getItem('setting_dock_size'), 10);
  if (Number.isFinite(sizeValue)) {
    window.macDockBaseSize = sizeValue;
    document.documentElement.style.setProperty('--dock-base-size', `${sizeValue}px`);
    const sizeSlider = document.getElementById('settingDockSizeRange');
    if (sizeSlider) {
      sizeSlider.value = String(sizeValue);
    }
  }

  const scaleValue = parseFloat(localStorage.getItem('setting_dock_scale'));
  if (Number.isFinite(scaleValue)) {
    window.macDockMaxScale = scaleValue;
    const scaleSlider = document.getElementById('settingDockScaleRange');
    if (scaleSlider) {
      scaleSlider.value = String(scaleValue);
    }
  }
}

function syncThemeSettingsFromStorage() {
  window.__mkpExternalStorageSyncApplying = true;
  try {
    if (typeof initTheme === 'function') {
      initTheme();
    }
    if (selectedVersion && typeof updateSidebarVersionBadge === 'function') {
      updateSidebarVersionBadge(selectedVersion);
    }
  } finally {
    window.__mkpExternalStorageSyncApplying = false;
  }
}

async function syncUserConfigFromStorage() {
  const previousPrinter = selectedPrinter;
  const previousVersion = selectedVersion;

  loadUserConfig();

  await withSuspendedUserConfigPersistence(async () => {
    const printer = selectedPrinter ? getPrinterObj(selectedPrinter) : null;
    if (printer) {
      selectPrinter(selectedPrinter, true);
      if (typeof window.renderDownloadVersions === 'function') {
        window.renderDownloadVersions(printer);
      }
    } else {
      renderBrands();
      renderPrinters(selectedBrand);
    }

    if (typeof updateSidebarVersionBadge === 'function') {
      updateSidebarVersionBadge(selectedVersion);
    }

    if (previousPrinter !== selectedPrinter || previousVersion !== selectedVersion) {
      if (typeof updateScriptPathDisplay === 'function') {
        updateScriptPathDisplay();
      }
    }

    if (typeof refreshCalibrationAvailability === 'function') {
      await refreshCalibrationAvailability();
    }
    if (typeof refreshCalibrationOffsets === 'function') {
      await refreshCalibrationOffsets({ forceRefresh: true, keepSelections: false });
    }
  });
}

async function syncActivePresetFromStorage(changedKey) {
  const currentKey = `${selectedPrinter || ''}_${selectedVersion || ''}`;
  const shouldRefreshPresetLists = changedKey === `mkp_current_script_${currentKey}`;

  if (shouldRefreshPresetLists) {
    const printer = selectedPrinter ? getPrinterObj(selectedPrinter) : null;
    if (printer && typeof window.renderDownloadVersions === 'function') {
      await withSuspendedUserConfigPersistence(async () => {
        window.renderDownloadVersions(printer);
      });
    }
  }

  if (typeof updateScriptPathDisplay === 'function') {
    updateScriptPathDisplay();
  }
  if (typeof refreshCalibrationAvailability === 'function') {
    await refreshCalibrationAvailability();
  }
  if (typeof refreshCalibrationOffsets === 'function') {
    await refreshCalibrationOffsets({ forceRefresh: true, keepSelections: false });
  }
}

async function refreshCurrentPresetViews(options = {}) {
  if (typeof window.updatePresetCacheSnapshot === 'function') {
    window.updatePresetCacheSnapshot(null, null);
  } else {
    window.presetCache = { path: null, data: null, timestamp: 0 };
  }

  const printer = selectedPrinter ? getPrinterObj(selectedPrinter) : null;

  if (printer && typeof window.renderDownloadVersions === 'function') {
    await withSuspendedUserConfigPersistence(async () => {
      window.renderDownloadVersions(printer);
    });
  }

  if (typeof updateScriptPathDisplay === 'function') {
    updateScriptPathDisplay();
  }

  if (typeof refreshCalibrationAvailability === 'function') {
    await refreshCalibrationAvailability();
  }
  if (typeof refreshCalibrationOffsets === 'function') {
    await refreshCalibrationOffsets({ forceRefresh: true, keepSelections: false });
  }

  const paramsPageVisible = !document.getElementById('page-params')?.classList.contains('hidden');
  if (paramsPageVisible && typeof window.renderDynamicParamsPage === 'function') {
    await window.renderDynamicParamsPage();
  }

  if (typeof window.emitActivePresetUpdated === 'function' && options.emit !== false) {
    window.emitActivePresetUpdated({
      reason: options.reason || 'external-refresh',
      path: options.path || null,
      forceRefresh: true,
      keepSelections: false
    });
  }
}

async function maybePromptExternalPresetRefresh(rawValue) {
  let signal = null;
  try {
    signal = JSON.parse(rawValue || 'null');
  } catch (error) {
    return;
  }

  if (!signal?.path || !signal?.ts) {
    return;
  }
  if (signal.sourceId === RENDERER_WINDOW_SYNC_ID) {
    return;
  }
  if (signal.ts <= lastPresetMutationSignalTs) {
    return;
  }

  const getActivePath = typeof window.getActivePresetPath === 'function'
    ? window.getActivePresetPath
    : null;
  if (!getActivePath) {
    return;
  }

  const activePresetPath = await getActivePath();
  if (!activePresetPath) {
    return;
  }

  if (normalizePresetPathForCompare(activePresetPath) !== normalizePresetPathForCompare(signal.path)) {
    return;
  }

  lastPresetMutationSignalTs = signal.ts;
  if (presetMutationPromptInFlight) {
    return;
  }

  presetMutationPromptInFlight = true;
  try {
    const paramsPageVisible = !document.getElementById('page-params')?.classList.contains('hidden');
    const hasUnsavedParamChanges = paramsPageVisible && typeof window.hasUnsavedParamChanges === 'function'
      ? window.hasUnsavedParamChanges()
      : false;
    const fileName = activePresetPath.split('\\').pop();
    const reasonMap = {
      'save-z-offset': '另一个窗口修改了当前预设的 Z 偏移。',
      'save-xy-offset': '另一个窗口修改了当前预设的 XY 偏移。',
      'params-save': '另一个窗口保存了当前预设的参数。',
      'params-restore-defaults': '另一个窗口恢复了当前预设的默认参数。'
    };
    const reasonText = reasonMap[signal.reason] || '另一个窗口修改了当前正在使用的预设。';
    const dirtyText = hasUnsavedParamChanges
      ? '<br><br><span class="text-red-500">当前页面还有未保存修改，刷新后会丢弃这些本地改动。</span>'
      : '';

    const confirmed = await MKPModal.confirm({
      title: '检测到其他窗口修改了当前预设',
      msg: `${reasonText}<br><br>文件：<span class="font-mono text-xs">${escapeHtml(fileName)}</span><br><br>是否立即刷新当前页面内容？${dirtyText}`,
      type: 'info',
      confirmText: '立即刷新',
      cancelText: '稍后再说'
    });

    if (!confirmed) {
      return;
    }

    await refreshCurrentPresetViews({
      reason: 'external-preset-refresh',
      path: activePresetPath,
      emit: false
    });
  } finally {
    presetMutationPromptInFlight = false;
  }
}

function bindCrossWindowStorageSync() {
  if (isCrossWindowSyncBound) {
    return;
  }
  isCrossWindowSyncBound = true;

  window.addEventListener('storage', async (event) => {
    if (!event.key) {
      return;
    }

    try {
      if (event.key === 'mkp_user_config') {
        Logger.info('[Sync] 收到跨窗口配置同步: mkp_user_config');
        await syncUserConfigFromStorage();
        return;
      }

      if (event.key.startsWith('mkp_current_script_')) {
        Logger.info(`[Sync] 收到跨窗口预设同步: ${event.key}`);
        await syncActivePresetFromStorage(event.key);
        return;
      }

      if (event.key === PRESET_MUTATION_SIGNAL_KEY) {
        Logger.info('[Sync] 收到跨窗口预设内容变更信号');
        await maybePromptExternalPresetRefresh(event.newValue);
        return;
      }

      if (event.key === 'showOnboarding') {
        Logger.info('[Sync] 收到跨窗口配置同步: showOnboarding');
        syncOnboardingSettingFromStorage();
        return;
      }

      if (event.key === 'update_mode' || event.key === 'update_mode_initialized_v2') {
        Logger.info('[Sync] 收到跨窗口配置同步: update_mode');
        if (typeof initUpdateModeSetting === 'function') {
          initUpdateModeSetting();
        }
        return;
      }

      if (
        event.key === 'setting_dock_anim'
        || event.key === 'setting_dock_size'
        || event.key === 'setting_dock_scale'
      ) {
        Logger.info(`[Sync] 收到跨窗口配置同步: ${event.key}`);
        syncDockSettingsFromStorage();
        return;
      }

      if (
        event.key === 'themeMode'
        || event.key === 'appThemeColor'
        || event.key === 'customThemeRgb'
        || event.key === 'customThemeHex'
        || event.key === 'preferredDarkMode'
        || event.key.startsWith('theme_ver_')
      ) {
        Logger.info(`[Sync] 收到跨窗口主题同步: ${event.key}`);
        syncThemeSettingsFromStorage();
      }
    } catch (error) {
      Logger.error(`[Sync] 跨窗口同步失败: ${error.message}`);
    }
  });
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
  saveUserConfig();
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
    document.documentElement.toggleAttribute('data-hide-onboarding', !showOnboardingCheckbox.checked);
    showOnboardingCheckbox.addEventListener('change', function() {
      GlobalState.setOnboarding(this.checked);
      document.documentElement.toggleAttribute('data-hide-onboarding', !this.checked);
    });
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

function extractOffsetValues(jsonData = {}) {
  const toolheadOffset = jsonData?.toolhead?.offset || {};
  const x = Number(
    toolheadOffset.x
    ?? jsonData.x_offset
    ?? jsonData.x
    ?? 0
  );
  const y = Number(
    toolheadOffset.y
    ?? jsonData.y_offset
    ?? jsonData.y
    ?? 0
  );
  const z = Number(
    toolheadOffset.z
    ?? jsonData.z_offset
    ?? jsonData.z
    ?? 0
  );

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0
  };
}

function clearCalibrationSelections() {
  selectedGridOffset = null;
  selectedXYOffset = { x: 0, y: 0 };

  const zBadge = document.getElementById('zBadge');
  if (zBadge) zBadge.classList.add('hidden');
  const xyBadgeX = document.getElementById('xyBadgeX');
  const xyBadgeY = document.getElementById('xyBadgeY');
  if (xyBadgeX) xyBadgeX.classList.add('hidden');
  if (xyBadgeY) xyBadgeY.classList.add('hidden');
}

function setCalibrationCurrentSummaryVisible(visible) {
  const zSummary = document.getElementById('zCurrentOffsetSummary');
  const xySummary = document.getElementById('xyCurrentOffsetSummary');
  if (zSummary) zSummary.classList.toggle('hidden', !visible);
  if (xySummary) xySummary.classList.toggle('hidden', !visible);
}

function resetCalibrationPanels(options = {}) {
  clearCalibrationSelections();

  const showSummary = options.showSummary === true;

  [
    ['zProgress', true],
    ['xyProgress', true],
    ['zPlaceholder', false],
    ['xyPlaceholder', false],
    ['zGridSelector', true],
    ['xyGridSelector', true]
  ].forEach(([id, hidden]) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle('hidden', hidden);
  });

  setCalibrationCurrentSummaryVisible(showSummary);
}

function applyCalibrationOffsetSnapshot(offsets = {}, options = {}) {
  const nextOffsets = {
    x: Number.isFinite(Number(offsets.x)) ? Number(offsets.x) : 0,
    y: Number.isFinite(Number(offsets.y)) ? Number(offsets.y) : 0,
    z: Number.isFinite(Number(offsets.z)) ? Number(offsets.z) : 0
  };
  const hasActivePreset = options.hasActivePreset !== false;

  window.currentXOffset = nextOffsets.x;
  window.currentYOffset = nextOffsets.y;
  window.currentZOffset = nextOffsets.z;

  if (!options.keepSelections) {
    clearCalibrationSelections();
  }

  [
    ['currentXOffsetDisplay', nextOffsets.x],
    ['currentYOffsetDisplay', nextOffsets.y],
    ['zOriginal', nextOffsets.z],
    ['zNewValue', nextOffsets.z],
    ['currentZOffsetDisplay', nextOffsets.z]
  ].forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = hasActivePreset ? Number(value).toFixed(2) : '--';
    }
  });

  setCalibrationCurrentSummaryVisible(hasActivePreset);

  if (typeof updateZGridSelection === 'function') {
    updateZGridSelection();
  }
  if (typeof updateXYSummary === 'function') {
    updateXYSummary();
  }

  const xGrid = document.getElementById('xyXGrid');
  const yGrid = document.getElementById('xyYGrid');
  if (xGrid && yGrid && (xGrid.children.length > 0 || yGrid.children.length > 0) && typeof generateXYGrid === 'function') {
    generateXYGrid();
  }
}

async function refreshCalibrationOffsets(options = {}) {
  const preset = typeof loadActivePreset === 'function'
    ? await loadActivePreset(options.forceRefresh === true)
    : null;
  const hasActivePreset = !!preset?.data;
  const offsets = hasActivePreset ? extractOffsetValues(preset.data) : { x: 0, y: 0, z: 0 };
  applyCalibrationOffsetSnapshot(offsets, {
    keepSelections: options.keepSelections === true,
    hasActivePreset
  });
  return offsets;
}

async function getCalibrationAvailability() {
  const activePresetPath = typeof getActivePresetPath === 'function'
    ? await getActivePresetPath()
    : null;

  if (!selectedPrinter) {
    return { ready: false, reason: '请先选择机型。' };
  }
  if (!selectedVersion) {
    return { ready: false, reason: '请先选择版本。' };
  }
  if (!activePresetPath) {
    return { ready: false, reason: '请先在【下载预设】页面应用一个本地配置。' };
  }

  return { ready: true, presetPath: activePresetPath };
}

function applyCalibrationButtonState(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.classList.toggle('calibration-action-disabled', !enabled);
}

async function refreshCalibrationAvailability() {
  const availability = await getCalibrationAvailability();
  const enabled = availability.ready;
  const nextContextKey = `${selectedPrinter || ''}|${selectedVersion || ''}|${availability.presetPath || ''}`;
  const shouldResetPanels = calibrationContextKey !== nextContextKey;
  calibrationContextKey = nextContextKey;

  [
    document.getElementById('zDirectEditBtn'),
    document.getElementById('zOpenBtn'),
    document.getElementById('xyDirectEditBtn'),
    document.getElementById('xyOpenBtn')
  ].forEach((button) => {
    applyCalibrationButtonState(button, enabled);
    if (button) {
      button.title = enabled ? '' : availability.reason;
    }
  });

  document.querySelectorAll('button[onclick^="saveZOffset"], button[onclick^="saveXYOffset"]').forEach((button) => {
    applyCalibrationButtonState(button, enabled);
  });

  if (shouldResetPanels) {
    resetCalibrationPanels({ showSummary: enabled });
  } else if (!enabled) {
    setCalibrationCurrentSummaryVisible(false);
  }

  return availability;
}

async function ensureCalibrationReady() {
  const availability = await refreshCalibrationAvailability();
  if (availability.ready) return true;

  await MKPModal.alert({
    title: '暂时不能校准',
    msg: availability.reason,
    type: 'warning'
  });
  return false;
}

async function fetchAndRenderZOffsetData() {
  try {
    await refreshCalibrationOffsets({ forceRefresh: false, keepSelections: false });
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
  if (!(await ensureCalibrationReady())) return;

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
  if (!(await ensureCalibrationReady())) return;

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
    const nextPresetData = preset.data?.toolhead?.offset
      ? {
          ...preset.data,
          toolhead: {
            ...preset.data.toolhead,
            offset: {
              ...preset.data.toolhead.offset,
              z: newZ
            }
          }
        }
      : {
          ...preset.data,
          z_offset: newZ
        };
    updatePresetCacheSnapshot(preset.path, nextPresetData);
    applyCalibrationOffsetSnapshot(extractOffsetValues(nextPresetData), { keepSelections: false });
    emitActivePresetUpdated({ reason: 'save-z-offset', path: preset.path, forceRefresh: false });
    if (typeof broadcastPresetMutation === 'function') {
      broadcastPresetMutation({ reason: 'save-z-offset', path: preset.path });
    }

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
let selectedXYOffset = { x: 0, y: 0 };

function updateXYSummary() {
  const baseX = Number(window.currentXOffset) || 0;
  const baseY = Number(window.currentYOffset) || 0;
  const nextX = Number((baseX + (selectedXYOffset.x || 0)).toFixed(2));
  const nextY = Number((baseY + (selectedXYOffset.y || 0)).toFixed(2));

  const mappings = [
    ['xyOriginalX', baseX],
    ['xyOriginalY', baseY],
    ['xyNewX', nextX],
    ['xyNewY', nextY]
  ];

  mappings.forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = Number(value).toFixed(2);
    }
  });

  const badgeX = document.getElementById('xyBadgeX');
  const badgeY = document.getElementById('xyBadgeY');
  if (badgeX) {
    badgeX.textContent = selectedXYOffset.x >= 0 ? `+${selectedXYOffset.x.toFixed(2)}` : selectedXYOffset.x.toFixed(2);
    badgeX.classList.toggle('hidden', selectedXYOffset.x === 0);
  }
  if (badgeY) {
    badgeY.textContent = selectedXYOffset.y >= 0 ? `+${selectedXYOffset.y.toFixed(2)}` : selectedXYOffset.y.toFixed(2);
    badgeY.classList.toggle('hidden', selectedXYOffset.y === 0);
  }
}

function buildXYAxisButton(axis, offset) {
  const AXIS_SLOT = 28;
  const AXIS_MAJOR = 74;
  const selected = selectedXYOffset[axis] === offset;
  const label = offset > 0 ? `+${offset.toFixed(1)}` : (offset === 0 ? '0' : offset.toFixed(1));
  const distance = Math.min(Math.abs(offset), 1);
  const scale = 1.08 - distance * 0.46;
  const sizeStyle = axis === 'x'
    ? `width:${AXIS_SLOT}px; height:${Math.round(AXIS_MAJOR * scale)}px;`
    : `width:${Math.round(AXIS_MAJOR * scale)}px; height:${AXIS_SLOT}px;`;

  return `
    <button type="button" class="xy-axis-btn ${selected ? 'is-selected' : ''}" onclick="selectXYOffset('${axis}', ${offset})">
      ${axis === 'y'
        ? `<div class="xy-axis-label">${label}</div><div class="xy-axis-btn-inner" style="${sizeStyle}"></div>`
        : `<div class="xy-axis-btn-inner" style="${sizeStyle}"></div><div class="xy-axis-label">${label}</div>`}
    </button>
  `;
}

function generateXYGrid() {
  const xGrid = document.getElementById('xyXGrid');
  const yGrid = document.getElementById('xyYGrid');
  if (!xGrid || !yGrid) return;

  const offsets = [-1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0];
  xGrid.innerHTML = offsets.map((offset) => buildXYAxisButton('x', offset)).join('');
  yGrid.innerHTML = offsets.map((offset) => buildXYAxisButton('y', offset)).join('');
  updateXYSummary();
}

function selectXYOffset(axis, offset) {
  selectedXYOffset[axis] = offset;
  generateXYGrid();
}

async function fetchAndRenderXYOffsetData() {
  try {
    await refreshCalibrationOffsets({ forceRefresh: false, keepSelections: false });
  } catch (error) {
    Logger.error(`[E303] XY preset parse err: ${error.message}`);
    window.currentXOffset = 0;
    window.currentYOffset = 0;
  }

  selectedXYOffset = { x: 0, y: 0 };
  updateXYSummary();
}

async function openXYGridDirectly() {
  if (!(await ensureCalibrationReady())) return;

  const placeholder = document.getElementById('xyPlaceholder');
  const selector = document.getElementById('xyGridSelector');
  const progress = document.getElementById('xyProgress');

  await fetchAndRenderXYOffsetData();
  progress.classList.add('hidden');
  placeholder.classList.add('hidden');
  selector.classList.remove('hidden');
  generateXYGrid();
}

async function openXYModel() {
  if (!(await ensureCalibrationReady())) return;

  const progress = document.getElementById('xyProgress');
  const placeholder = document.getElementById('xyPlaceholder');
  const selector = document.getElementById('xyGridSelector');

  await fetchAndRenderXYOffsetData();

  progress.classList.remove('hidden');
  placeholder.classList.add('hidden');

  try {
    Logger.info('[O305] Open XY calibration model');
    Logger.info('Read variable: hasOpenedModelBefore');
    const hasOpened = localStorage.getItem('hasOpenedModelBefore');
    const forceOpenWith = !hasOpened;
    const result = await window.mkpAPI.openCalibrationModel('XY', forceOpenWith);

    if (!result.success) {
      throw new Error(result.error || '打开模型失败');
    }

    if (forceOpenWith) {
      Logger.info('Write variable: hasOpenedModelBefore, v:true');
      localStorage.setItem('hasOpenedModelBefore', 'true');
    }

    progress.classList.add('hidden');
    selector.classList.remove('hidden');
    generateXYGrid();
  } catch (error) {
    Logger.error(`[E602] XY model open err: ${error.message}`);
    progress.classList.add('hidden');
    placeholder.classList.remove('hidden');
    await MKPModal.alert({
      title: '打开模型失败',
      msg: error.message,
      type: 'error'
    });
  }
}

async function saveXYOffset(btnElement) {
  if (!(await ensureCalibrationReady())) return;
  if (!btnElement) btnElement = document.querySelector('button[onclick^="saveXYOffset"]');

  const preset = await loadActivePreset(true);
  if (!preset) {
    await MKPModal.alert({ title: '提示', msg: '请先在左侧菜单的【下载预设】页面应用一个配置！', type: 'warning' });
    return;
  }

  const nextX = Number((window.currentXOffset + (selectedXYOffset.x || 0)).toFixed(2));
  const nextY = Number((window.currentYOffset + (selectedXYOffset.y || 0)).toFixed(2));

  const SPIN_ICON = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  let resetLoading = () => {};
  if (btnElement) resetLoading = setButtonStatus(btnElement, '126px', '保存中...', SPIN_ICON, 'btn-expand-theme');

  let updatePayload = {};
  if (preset.data?.toolhead?.offset) {
    updatePayload = {
      toolhead: {
        ...preset.data.toolhead,
        offset: {
          ...preset.data.toolhead.offset,
          x: nextX,
          y: nextY
        }
      }
    };
  } else {
    updatePayload = {
      x_offset: nextX,
      y_offset: nextY
    };
  }

  const result = await window.mkpAPI.writePreset(preset.path, updatePayload);
  if (!result.success) {
    if (btnElement) resetLoading();
    await MKPModal.alert({ title: '保存失败', msg: result.error, type: 'error' });
    return;
  }

  const nextPresetData = preset.data?.toolhead?.offset
    ? {
        ...preset.data,
        toolhead: {
          ...preset.data.toolhead,
          offset: {
            ...preset.data.toolhead.offset,
            x: nextX,
            y: nextY
          }
        }
      }
    : {
        ...preset.data,
        x_offset: nextX,
        y_offset: nextY
      };
  updatePresetCacheSnapshot(preset.path, nextPresetData);
  applyCalibrationOffsetSnapshot(extractOffsetValues(nextPresetData), { keepSelections: false });
  emitActivePresetUpdated({ reason: 'save-xy-offset', path: preset.path, forceRefresh: false });
  if (typeof broadcastPresetMutation === 'function') {
    broadcastPresetMutation({ reason: 'save-xy-offset', path: preset.path });
  }

  const CHECK_ICON = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
  if (btnElement) {
    const reset = setButtonStatus(btnElement, '110px', '已保存', CHECK_ICON, 'btn-expand-green');
    setTimeout(reset, 1000);
  }
}

window.updateScriptPathDisplay = updateScriptPathDisplay;
window.refreshCalibrationAvailability = refreshCalibrationAvailability;
window.openZGridDirectly = openZGridDirectly;
window.openZModel = openZModel;
window.openXYGridDirectly = openXYGridDirectly;
window.openXYModel = openXYModel;
window.selectXYOffset = selectXYOffset;
window.saveXYOffset = saveXYOffset;
window.refreshCalibrationOffsets = refreshCalibrationOffsets;


function bindNavigation() {
  // 防内存泄漏：如果绑定过了就不再绑
  if (window._isNavBound) return;
  window._isNavBound = true;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      const page = item.getAttribute('data-page');
      if (page) {
        if (typeof window.canNavigateAwayFromParams === 'function') {
          const allowSwitch = await window.canNavigateAwayFromParams(page);
          if (!allowSwitch) return;
        }

        await switchPage(page);
        document.querySelectorAll('.nav-item').forEach(navItem => {
          navItem.classList.remove('active');
        });
        item.classList.add('active');
      }
    });
  });
}

async function switchPage(page) {
  Logger.info(`[UI] Switch tab, page:${page}`);
  document.querySelectorAll('.page').forEach(p => {
    p.classList.add('hidden');
  });
  document.getElementById(`page-${page}`).classList.remove('hidden');

  if (page === 'params') {
    if (typeof renderDynamicParamsPage === 'function') await renderDynamicParamsPage();
  } else if (page === 'calibrate') {
    if (typeof updateScriptPathDisplay === 'function') updateScriptPathDisplay();
    if (typeof refreshCalibrationAvailability === 'function') {
      await refreshCalibrationAvailability();
    }
    if (typeof refreshCalibrationOffsets === 'function') {
      await refreshCalibrationOffsets({ forceRefresh: false, keepSelections: false });
    }
  }
}

function toggleMacDockAnimation(enable, options = {}) {
  const shouldPersist = options.persist !== false;
  if (shouldPersist) {
    Logger.info("Write variable: setting_dock_anim, v:" + enable);
  }
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

  if (shouldPersist) {
    localStorage.setItem('setting_dock_anim', enable ? 'true' : 'false');
  }
}

window.macDockBaseSize = parseInt(localStorage.getItem('setting_dock_size')) || 38;
window.macDockMaxScale = parseFloat(localStorage.getItem('setting_dock_scale')) || 1.5;

function setMacDockSize(sizeValue, options = {}) {
  const shouldPersist = options.persist !== false;
  if (shouldPersist) {
    Logger.info("Write variable: setting_dock_size, v:" + sizeValue);
  }
  window.macDockBaseSize = parseInt(sizeValue);
  if (shouldPersist) {
    localStorage.setItem('setting_dock_size', sizeValue);
  }
  document.documentElement.style.setProperty('--dock-base-size', `${sizeValue}px`);
}

function setMacDockScale(scaleValue, options = {}) {
  const shouldPersist = options.persist !== false;
  if (shouldPersist) {
    Logger.info("Write variable: setting_dock_scale, v:" + scaleValue);
  }
  window.macDockMaxScale = parseFloat(scaleValue);
  if (shouldPersist) {
    localStorage.setItem('setting_dock_scale', scaleValue);
  }
}

// 全局防重复初始化锁
let _isAppInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (_isAppInitialized) return;
  _isAppInitialized = true;

  window.addEventListener(ACTIVE_PRESET_UPDATED_EVENT, async (event) => {
    const detail = event?.detail || {};
    await refreshCalibrationAvailability();
    await refreshCalibrationOffsets({
      forceRefresh: detail.forceRefresh !== false,
      keepSelections: detail.keepSelections === true
    });
    if (typeof updateScriptPathDisplay === 'function') {
      updateScriptPathDisplay();
    }
  });

  bindFloatingSurfaceAutoDismiss();
  bindFloatingTooltipSystem();
  bindCrossWindowStorageSync();

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
  await refreshCalibrationAvailability();
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

  if (typeof window.ensureHomeCatalogReady === 'function') {
    await window.ensureHomeCatalogReady();
  }
  
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
  
  if (typeof loadLocalManifest === 'function') {
    await loadLocalManifest();
  } else {
    renderVersions();
  }
  bindNavigation();
  bindContextMenu();
  renderWizardBrands();
  filterFaq('');
  
  // 💡 执行各种外部模块的初始化
  if (typeof initTheme === 'function') initTheme();
  if (typeof initSystemThemeListener === 'function') initSystemThemeListener();
  if (typeof initOnboardingSetting === 'function') initOnboardingSetting();

  if (typeof initUpdateModeSetting === 'function') {
    initUpdateModeSetting();
  }
  const hasSavedSession = hasRestorablePresetSession();
  if (!GlobalState.getOnboarding()) {
    Logger.info("用户设置了关闭引导页，直接跳过");
    skipOnboarding();
  } else if (hasSavedSession) {
    Logger.info("检测到已保存的机型版本与预设，跳过新手引导");
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


