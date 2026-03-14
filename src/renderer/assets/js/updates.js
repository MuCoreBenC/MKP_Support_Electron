let globalVersions = [];
let isLegacyVisible = false;
let versionActionInFlight = false;

const APP_UPDATE_MODE_KEY = 'update_mode';
const APP_UPDATE_STATE_KEY = 'mkp_app_update_state';
const APP_UPDATE_BADGE_TARGETS = ['icon-nav-versions'];
const APP_UPDATE_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

const RedDotManager = {
  ensure(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return null;

    let dot = target.querySelector('.mkp-badge-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'mkp-badge-dot';
      target.appendChild(dot);
    }
    return dot;
  },

  show(targetId, pulse = true) {
    const dot = this.ensure(targetId);
    if (!dot) return;
    dot.classList.add('show');
    dot.classList.toggle('pulse', pulse);
  },

  hide(targetId) {
    const dot = this.ensure(targetId);
    if (!dot) return;
    dot.classList.remove('show', 'pulse');
  }
};

function normalizeAppVersion(version) {
  return String(version || '0.0.0').replace(/^v/i, '').trim() || '0.0.0';
}

function setVersionActionBusy(isBusy, activeButton = null) {
  versionActionInFlight = isBusy;

  document.querySelectorAll('[data-version-action="true"]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;

    if (isBusy) {
      button.dataset.prevDisabled = button.disabled ? 'true' : 'false';
      if (button !== activeButton) {
        button.disabled = true;
        button.classList.add('opacity-60', 'cursor-not-allowed');
      }
      return;
    }

    const wasDisabled = button.dataset.prevDisabled === 'true';
    delete button.dataset.prevDisabled;
    button.disabled = wasDisabled;
    button.classList.remove('opacity-60', 'cursor-not-allowed');
  });
}

function parseManifestToUI(manifest, currentAppVersion) {
  const cleanCurrent = normalizeAppVersion(currentAppVersion);
  const uiVersions = [];

  if (!manifest || typeof manifest !== 'object' || !manifest.latestVersion) {
    return uiVersions;
  }

  uiVersions.push({
    version: `v${manifest.latestVersion}`,
    date: manifest.releaseDate,
    desc: manifest.shortDesc || '常规体验优化与错误修复',
    status: manifest.latestVersion === cleanCurrent ? 'RUNNING' : 'LATEST',
    current: manifest.latestVersion === cleanCurrent,
    canRollback: manifest.canRollback !== false,
    details: Array.isArray(manifest.releaseNotes) ? manifest.releaseNotes : [],
    downloadUrl: manifest.downloadUrl || ''
  });

  if (Array.isArray(manifest.history)) {
    manifest.history.forEach((item) => {
      if (!item?.version) return;
      uiVersions.push({
        version: `v${item.version}`,
        date: item.releaseDate,
        desc: item.shortDesc || '历史版本更新',
        status: item.version === cleanCurrent ? 'RUNNING' : 'LEGACY',
        current: item.version === cleanCurrent,
        canRollback: item.canRollback !== false,
        details: Array.isArray(item.releaseNotes) ? item.releaseNotes : [],
        downloadUrl: item.downloadUrl || ''
      });
    });
  }

  return uiVersions;
}

function getAppManifestUrls() {
  return [
    `${CLOUD_BASES.gitee}/cloud_data/app_manifest.json?t=${Date.now()}`,
    `${CLOUD_BASES.jsDelivr}/cloud_data/app_manifest.json?t=${Date.now()}`,
    `${CLOUD_BASES.github}/cloud_data/app_manifest.json?t=${Date.now()}`
  ];
}

async function fetchAppManifestWithFallback() {
  let lastError = null;

  for (const url of getAppManifestUrls()) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      Logger.warn('应用版本清单节点失败', { url, error: error.message });
    }
  }

  throw lastError || new Error('无法获取云端版本清单。');
}

function buildPatchUrlCandidates(downloadUrl) {
  const urls = [];
  const append = (url) => {
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  };

  append(downloadUrl);

  try {
    const fileName = new URL(downloadUrl).pathname.split('/').pop();
    append(`${CLOUD_BASES.gitee}/cloud_data/${fileName}`);
    append(`${CLOUD_BASES.jsDelivr}/cloud_data/${fileName}`);
    append(`${CLOUD_BASES.github}/cloud_data/${fileName}`);
  } catch (error) {}

  return urls;
}

async function getCurrentAppVersion() {
  if (window.mkpAPI && typeof window.mkpAPI.getAppVersion === 'function') {
    return normalizeAppVersion(await window.mkpAPI.getAppVersion());
  }
  return normalizeAppVersion(APP_REAL_VERSION);
}

async function saveCloudManifestToLocal(manifest) {
  if (!window.mkpAPI || typeof window.mkpAPI.saveLocalManifest !== 'function') {
    return;
  }
  await window.mkpAPI.saveLocalManifest(JSON.stringify(manifest, null, 2));
}

async function readLocalAppManifest() {
  if (!window.mkpAPI || typeof window.mkpAPI.readLocalManifest !== 'function') {
    return null;
  }
  return await window.mkpAPI.readLocalManifest();
}

function persistAppUpdateState(payload = {}) {
  const state = {
    latestVersion: normalizeAppVersion(payload.latestVersion),
    hasUpdate: !!payload.hasUpdate,
    checkedAt: Date.now()
  };
  localStorage.setItem(APP_UPDATE_STATE_KEY, JSON.stringify(state));
  return state;
}

function readAppUpdateState() {
  try {
    return JSON.parse(localStorage.getItem(APP_UPDATE_STATE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function applyAppUpdateBadge(hasUpdate) {
  APP_UPDATE_BADGE_TARGETS.forEach((targetId) => {
    if (hasUpdate) {
      RedDotManager.show(targetId, true);
    } else {
      RedDotManager.hide(targetId);
    }
  });
}

function syncAppUpdateState(manifest, currentAppVersion) {
  if (!manifest?.latestVersion) return false;

  const cleanCurrent = normalizeAppVersion(currentAppVersion);
  const latestVersion = normalizeAppVersion(manifest.latestVersion);
  const hasUpdate = compareVersionsFront(latestVersion, cleanCurrent) > 0;

  persistAppUpdateState({ latestVersion, hasUpdate });
  applyAppUpdateBadge(hasUpdate);
  return hasUpdate;
}

function hydrateCachedAppUpdateBadge() {
  const cached = readAppUpdateState();
  if (!cached?.latestVersion) return;

  const hasUpdate = compareVersionsFront(cached.latestVersion, normalizeAppVersion(APP_REAL_VERSION)) > 0;
  applyAppUpdateBadge(hasUpdate);
}

async function loadLocalManifest() {
  try {
    const currentAppVersion = await getCurrentAppVersion();
    const localManifest = await readLocalAppManifest();

    if (!localManifest) {
      throw new Error('本地 app_manifest.json 读取失败。');
    }

    globalVersions = parseManifestToUI(localManifest, currentAppVersion);
    renderVersions();
    syncAppUpdateState(localManifest, currentAppVersion);
  } catch (error) {
    Logger.error('[VersionEngine] 加载本地版本清单失败', { error: error.message });
  }
}

function createVersionCardHTML(version, type) {
  let badgeClass = 'bg-gray-100 text-gray-800';
  let btnText = '回退';
  let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  let btnAction = '';
  let isDisabled = false;

  const isLegacy = type === 'legacy';
  const defaultOpenClass = isLegacy ? '' : 'is-open is-expanded';
  const defaultExpandedClass = isLegacy ? '' : 'expanded';

  if (type === 'stable') {
    badgeClass = 'theme-bg-soft';
    btnText = version.current ? '已是最新' : '检查更新';
    btnClass = 'theme-btn-solid';
    if (version.current) {
      isDisabled = true;
    } else {
      btnAction = 'onclick="event.stopPropagation(); manualCheckAppUpdate(this)"';
    }
  } else if (version.canRollback === false || version.version.includes('-')) {
    isDisabled = true;
    btnText = '不可回退';
    btnClass = 'bg-gray-50 text-gray-400 cursor-not-allowed dark:bg-[#1e1e1e] opacity-60';
  } else {
    btnAction = `onclick="event.stopPropagation(); handleRollback(this, '${version.version}')"`
  }

  return `
    <div class="bg-white dark:bg-[#252526] rounded-xl border border-gray-200 dark:border-[#333] p-5 mb-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-[#444] cursor-pointer group collapse-item ${defaultExpandedClass}" onclick="toggleCollapse(this)">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-3">
          <div class="px-2.5 py-1 rounded-full text-[10px] font-bold ${badgeClass}">${version.status}</div>
          <div>
            <div class="font-bold text-gray-900 dark:text-gray-100">${version.version}</div>
            <div class="text-[10px] text-gray-400">${version.date || '--'}</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button data-version-action="true" data-version="${version.version}" class="px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${btnClass}" ${isDisabled ? 'disabled' : ''} ${btnAction}>
            ${btnText}
          </button>
          <div class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1e1e1e] group-hover:bg-gray-100 dark:group-hover:bg-[#2a2a2a] transition-colors flex-shrink-0">
            <svg class="w-4 h-4 text-gray-500 transition-transform duration-300 toggle-arrow collapse-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
      </div>
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${version.desc || '常规更新'}</p>
      <div class="collapse-wrapper ${defaultOpenClass}">
        <div class="collapse-inner">
          <div class="space-y-1 pt-3 mt-2 border-t border-gray-100 dark:border-[#333]">
            ${(version.details || []).map((detail) => `
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

function renderVersions() {
  const versionList = document.getElementById('versionList');
  if (!versionList) return;

  versionList.innerHTML = '';
  if (!Array.isArray(globalVersions) || globalVersions.length === 0) {
    return;
  }

  const latestVersion = globalVersions[0];
  const runningVersion = globalVersions.find((item) => item.current);
  const topVersions = [];

  if (latestVersion) topVersions.push(latestVersion);
  if (runningVersion && runningVersion.version !== latestVersion?.version) {
    topVersions.push(runningVersion);
  }

  topVersions.forEach((version) => {
    versionList.innerHTML += createVersionCardHTML(version, 'stable');
  });

  const legacyVersions = globalVersions.filter((item) => !topVersions.includes(item));
  if (legacyVersions.length === 0) {
    return;
  }

  const legacyContainer = document.createElement('div');
  legacyContainer.id = 'legacyVersionsContainer';
  legacyContainer.style.display = isLegacyVisible ? 'block' : 'none';

  let legacyHtml = `
    <div class="py-4 text-xs font-bold text-gray-400 flex items-center gap-2">
      <div class="h-px flex-1 bg-gray-100 dark:bg-[#333]"></div>
      历史归档 (${legacyVersions.length})
      <div class="h-px flex-1 bg-gray-100 dark:bg-[#333]"></div>
    </div>
  `;

  legacyVersions.forEach((version) => {
    legacyHtml += createVersionCardHTML(version, 'legacy');
  });

  legacyContainer.innerHTML = legacyHtml;
  versionList.appendChild(legacyContainer);
}

function toggleExpandMore() {
  isLegacyVisible = !isLegacyVisible;
  Logger.info(`Toggle UI: expand version history, active: ${isLegacyVisible}`);

  const btnText = document.getElementById('expandBtnText');
  if (btnText) {
    btnText.innerText = isLegacyVisible ? '收起历史' : '历史版本';
  }

  const legacyContainer = document.getElementById('legacyVersionsContainer');
  if (legacyContainer) {
    legacyContainer.style.display = isLegacyVisible ? 'block' : 'none';
  }
}

async function manualCheckAppUpdate(btnElement) {
  if (versionActionInFlight) {
    return;
  }

  let resetEngine = null;
  setVersionActionBusy(true, btnElement);

  if (typeof setButtonStatus === 'function' && btnElement) {
    const spinIcon = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
      resetEngine = setButtonStatus(btnElement, '115px', '检查中...', spinIcon, 'btn-expand-theme');
  }

  try {
    const remoteManifest = await fetchAppManifestWithFallback();
    await saveCloudManifestToLocal(remoteManifest);

    const currentAppVersion = await getCurrentAppVersion();
    globalVersions = parseManifestToUI(remoteManifest, currentAppVersion);
    renderVersions();

    if (resetEngine) resetEngine();

    const hasUpdate = syncAppUpdateState(remoteManifest, currentAppVersion);
    if (hasUpdate) {
      const confirmed = await MKPModal.confirm({
        title: `发现新版本 v${remoteManifest.latestVersion}`,
        msg: `更新内容：\n${remoteManifest.shortDesc || '常规体验优化与错误修复'}\n\n是否立即下载并进行静默热更新？`,
        type: 'info',
        confirmText: '立即更新',
        cancelText: '稍后再说'
      });

      if (!confirmed) {
        return;
      }

      if (typeof setButtonStatus === 'function' && btnElement) {
        const downIcon = '<svg class="animate-bounce w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>';
        resetEngine = setButtonStatus(btnElement, '120px', '正在下载...', downIcon, 'btn-expand-theme');
      }

      const updateResult = await window.mkpAPI.applyHotUpdate({
        urls: buildPatchUrlCandidates(remoteManifest.downloadUrl),
        expectedVersion: normalizeAppVersion(remoteManifest.latestVersion)
      });

      if (resetEngine) resetEngine();

      if (!updateResult.success) {
        throw new Error(`热更新失败：${updateResult.error}`);
      }

      await MKPModal.alert({
        title: '更新准备就绪',
        msg: `补丁已应用到 v${updateResult.version || remoteManifest.latestVersion}，软件将重启后生效。`,
        type: 'success'
      });

      if (window.mkpAPI.restartApp) {
        window.mkpAPI.restartApp();
      }
      return;
    }

    await MKPModal.alert({
      title: '已是最新版本',
      msg: `当前运行的 v${currentAppVersion} 已经是云端最新版本。`,
      type: 'success',
      allowOutsideClick: true
    });
  } catch (error) {
    if (resetEngine) resetEngine();
    await MKPModal.alert({
      title: '检查失败',
      msg: error.message,
      type: 'error'
    });
  } finally {
    setVersionActionBusy(false);
  }
}

function initUpdateModeSetting() {
  Logger.info('Read variable: update_mode');
  const savedMode = localStorage.getItem(APP_UPDATE_MODE_KEY) || 'auto';
  const radios = document.querySelectorAll('input[name="updateMode"]');

  radios.forEach((radio) => {
    radio.checked = radio.value === savedMode;
  });

  hydrateCachedAppUpdateBadge();
  silentCheckForUpdate(savedMode);
}

function saveUpdateMode(mode) {
  Logger.info(`Write variable: update_mode, v:${mode}`);
  localStorage.setItem(APP_UPDATE_MODE_KEY, mode);

  if (mode === 'auto') {
    silentCheckForUpdate(mode, { force: true });
  }
}

async function silentCheckForUpdate(mode, options = {}) {
  if (mode === 'manual') {
    hydrateCachedAppUpdateBadge();
    return;
  }

  const cachedState = readAppUpdateState();
  if (cachedState?.hasUpdate) {
    applyAppUpdateBadge(compareVersionsFront(cachedState.latestVersion, normalizeAppVersion(APP_REAL_VERSION)) > 0);
  }

  const shouldSkipFetch = !options.force
    && cachedState?.checkedAt
    && (Date.now() - cachedState.checkedAt) < APP_UPDATE_CHECK_COOLDOWN_MS;

  if (shouldSkipFetch) {
    return;
  }

  try {
    const manifest = await fetchAppManifestWithFallback();
    await saveCloudManifestToLocal(manifest);

    const currentVersion = await getCurrentAppVersion();
    syncAppUpdateState(manifest, currentVersion);
    globalVersions = parseManifestToUI(manifest, currentVersion);
    renderVersions();
  } catch (error) {
    Logger.warn(`[静默更新] 检查失败: ${error.message}`);
  }
}

async function handleRollback(btnElement, targetVersion) {
  if (versionActionInFlight) {
    return;
  }

  const confirmed = await MKPModal.confirm({
    title: `确认回退至 ${targetVersion}?`,
    msg: `回退后将覆盖当前版本的所有代码。<br><br><span class="text-red-500 font-bold">注意：</span> 旧版本可能缺少最新功能或包含已知问题。`,
    confirmText: '确定回退',
    type: 'warning'
  });

  if (!confirmed) {
    return;
  }

  setVersionActionBusy(true, btnElement);
  const spinIcon = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
  const reset = setButtonStatus(btnElement, '100px', '请求中...', spinIcon, 'btn-expand-blue');

  try {
    const manifest = await fetchAppManifestWithFallback();
    const pureVersion = normalizeAppVersion(targetVersion);
    const targetData = (manifest.history || []).find((item) => normalizeAppVersion(item.version) === pureVersion);

    if (!targetData?.downloadUrl) {
      throw new Error(`云端暂未提供 ${targetVersion} 的回退补丁包。`);
    }

    const result = await window.mkpAPI.applyHotUpdate({
      urls: buildPatchUrlCandidates(targetData.downloadUrl),
      expectedVersion: pureVersion
    });

    if (!result.success) {
      throw new Error(`回退补丁应用失败：${result.error}`);
    }

    await MKPModal.alert({
      title: '回退完成',
      msg: `已成功回退至 ${targetVersion}，软件将自动重启。`,
      type: 'success'
    });

    window.mkpAPI.restartApp();
  } catch (error) {
    Logger.error(`[回退失败] ${error.message}`);
    await MKPModal.alert({
      title: '回退失败',
      msg: error.message,
      type: 'error',
      confirmText: '确定'
    });
  } finally {
    reset();
    setVersionActionBusy(false);
  }
}

window.RedDotManager = RedDotManager;
window.parseManifestToUI = parseManifestToUI;
window.loadLocalManifest = loadLocalManifest;
window.manualCheckAppUpdate = manualCheckAppUpdate;
window.initUpdateModeSetting = initUpdateModeSetting;
window.saveUpdateMode = saveUpdateMode;
window.silentCheckForUpdate = silentCheckForUpdate;
window.renderVersions = renderVersions;
window.toggleExpandMore = toggleExpandMore;
window.handleRollback = handleRollback;
