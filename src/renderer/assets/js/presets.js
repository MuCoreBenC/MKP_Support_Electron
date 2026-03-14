let isMultiSelectMode = false;
let selectedLocalFiles = new Set();
let localSearchQuery = '';
let localSortMode = 'custom';
let draggedCard = null;
let presetContextMenuTarget = null;
let lastRenderedLocalFiles = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPresetDate(timestamp) {
  if (!timestamp) return '--';
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '--';
  }
}

function formatPresetSize(size) {
  if (!Number.isFinite(size) || size <= 0) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function getCustomOrderKey(printerId, versionType) {
  return `mkp_custom_order_${printerId}_${versionType}`;
}

function getLocalSortKey(printerId, versionType) {
  return `mkp_local_sort_${printerId}_${versionType}`;
}

function getPinnedPresetKey(printerId, versionType) {
  return `mkp_pinned_presets_${printerId}_${versionType}`;
}

function getPinnedPresetSet(printerId, versionType) {
  try {
    const raw = localStorage.getItem(getPinnedPresetKey(printerId, versionType));
    return new Set(JSON.parse(raw || '[]'));
  } catch (error) {
    return new Set();
  }
}

function savePinnedPresetSet(printerId, versionType, pinnedSet) {
  localStorage.setItem(
    getPinnedPresetKey(printerId, versionType),
    JSON.stringify(Array.from(pinnedSet))
  );
}

function getVisibleLocalFileNames() {
  return Array.from(document.querySelectorAll('#localPresetsList .collapse-item'))
    .map((item) => item.dataset.releaseId)
    .filter(Boolean);
}

function getCurrentPresetContext() {
  const printerData = typeof getPrinterObj === 'function' ? getPrinterObj(selectedPrinter) : null;
  if (!printerData || !selectedVersion) {
    return null;
  }
  return { printerData, versionType: selectedVersion };
}

function loadLocalSortMode(printerId, versionType) {
  localSortMode = localStorage.getItem(getLocalSortKey(printerId, versionType)) || 'custom';
  const select = document.getElementById('localSortSelect');
  if (select) {
    select.value = localSortMode;
  }
}

function updateLocalManagerUI() {
  const btnMultiSelect = document.getElementById('btnMultiSelect');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const batchToolbar = document.getElementById('localBatchToolbar');
  const batchSummary = document.getElementById('localBatchSummary');
  const batchDeleteBtn = document.getElementById('btnBatchDelete');
  const batchDuplicateBtn = document.getElementById('btnBatchDuplicate');
  const sortSelect = document.getElementById('localSortSelect');
  const managerDivider = document.getElementById('localManagerDivider');

  if (btnMultiSelect) {
    btnMultiSelect.classList.toggle('text-blue-500', isMultiSelectMode);
    btnMultiSelect.classList.toggle('bg-blue-50', isMultiSelectMode);
    btnMultiSelect.classList.toggle('dark:bg-blue-900/30', isMultiSelectMode);
  }

  if (checkUpdateBtn) {
    checkUpdateBtn.classList.toggle('hidden', isMultiSelectMode);
  }

  if (sortSelect) {
    sortSelect.classList.toggle('hidden', !isMultiSelectMode);
  }

  if (managerDivider) {
    managerDivider.classList.toggle('hidden', !isMultiSelectMode);
  }

  if (batchToolbar) {
    batchToolbar.classList.toggle('hidden', !isMultiSelectMode);
  }

  const selectedCount = selectedLocalFiles.size;
  if (batchSummary) {
    batchSummary.textContent = selectedCount > 0
      ? `已选中 ${selectedCount} 个预设`
      : '批量模式已开启，可点击卡片或使用右键菜单。';
  }

  if (batchDeleteBtn) {
    batchDeleteBtn.textContent = selectedCount > 0 ? `删除选中 (${selectedCount})` : '删除选中';
    batchDeleteBtn.disabled = selectedCount === 0;
    batchDeleteBtn.classList.toggle('opacity-50', selectedCount === 0);
    batchDeleteBtn.classList.toggle('cursor-not-allowed', selectedCount === 0);
  }

  if (batchDuplicateBtn) {
    batchDuplicateBtn.textContent = selectedCount > 0 ? `复制选中 (${selectedCount})` : '复制选中';
    batchDuplicateBtn.disabled = selectedCount === 0;
    batchDuplicateBtn.classList.toggle('opacity-50', selectedCount === 0);
    batchDuplicateBtn.classList.toggle('cursor-not-allowed', selectedCount === 0);
  }
}

function toggleLocalSearch() {
  const wrapper = document.getElementById('localSearchWrapper');
  const input = document.getElementById('localSearchInput');
  if (!wrapper || !input) return;

  if (wrapper.classList.contains('hidden')) {
    wrapper.classList.remove('hidden');
    input.focus();
  } else {
    wrapper.classList.add('hidden');
    input.value = '';
    localSearchQuery = '';
    const context = getCurrentPresetContext();
    if (context) {
      renderPresetList(context.printerData, context.versionType);
    }
  }
}

function handleLocalSearch(value) {
  localSearchQuery = String(value || '').trim().toLowerCase();
  const context = getCurrentPresetContext();
  if (context) {
    renderPresetList(context.printerData, context.versionType);
  }
}

function setLocalSortMode(mode) {
  const context = getCurrentPresetContext();
  localSortMode = mode || 'custom';

  if (context) {
    localStorage.setItem(getLocalSortKey(context.printerData.id, context.versionType), localSortMode);
    renderPresetList(context.printerData, context.versionType);
  }
}

function toggleMultiSelectMode(forceValue = null) {
  isMultiSelectMode = typeof forceValue === 'boolean' ? forceValue : !isMultiSelectMode;
  if (!isMultiSelectMode) {
    selectedLocalFiles.clear();
  }
  updateLocalManagerUI();

  const context = getCurrentPresetContext();
  if (context) {
    renderPresetList(context.printerData, context.versionType);
  }
}

function toggleFileSelection(fileName, cardElement) {
  if (!fileName) return;

  if (selectedLocalFiles.has(fileName)) {
    selectedLocalFiles.delete(fileName);
  } else {
    selectedLocalFiles.add(fileName);
  }

  const isSelected = selectedLocalFiles.has(fileName);
  const targetCards = cardElement
    ? [cardElement]
    : Array.from(document.querySelectorAll('#localPresetsList .collapse-item'))
      .filter((item) => item.dataset.releaseId === fileName);

  targetCards.forEach((item) => syncLocalSelectionCard(item, isSelected));

  updateLocalManagerUI();
}

function syncLocalSelectionCard(cardElement, isSelected) {
  if (!cardElement) return;

  cardElement.classList.toggle('preset-selected', isSelected);
  cardElement.classList.toggle('border-blue-500', isSelected);
  cardElement.classList.toggle('bg-blue-50/20', isSelected);

  const checkbox = cardElement.querySelector('.multi-checkbox');
  if (!checkbox) return;

  checkbox.classList.toggle('bg-blue-500', isSelected);
  checkbox.classList.toggle('border-blue-500', isSelected);
  checkbox.classList.toggle('border-gray-300', !isSelected);
  checkbox.classList.toggle('dark:border-gray-600', !isSelected);

  const icon = checkbox.querySelector('svg');
  if (icon) {
    icon.classList.toggle('opacity-100', isSelected);
    icon.classList.toggle('opacity-0', !isSelected);
  }
}

function toggleSelectAllLocal() {
  const fileNames = getVisibleLocalFileNames();
  const allSelected = fileNames.length > 0 && fileNames.every((fileName) => selectedLocalFiles.has(fileName));

  fileNames.forEach((fileName) => {
    if (allSelected) {
      selectedLocalFiles.delete(fileName);
    } else {
      selectedLocalFiles.add(fileName);
    }
  });

  const context = getCurrentPresetContext();
  if (context) {
    renderPresetList(context.printerData, context.versionType);
  } else {
    updateLocalManagerUI();
  }
}

function invertLocalSelection() {
  const fileNames = getVisibleLocalFileNames();
  fileNames.forEach((fileName) => {
    if (selectedLocalFiles.has(fileName)) {
      selectedLocalFiles.delete(fileName);
    } else {
      selectedLocalFiles.add(fileName);
    }
  });

  const context = getCurrentPresetContext();
  if (context) {
    renderPresetList(context.printerData, context.versionType);
  } else {
    updateLocalManagerUI();
  }
}

function saveCustomOrder(printerId = selectedPrinter, versionType = selectedVersion) {
  if (!printerId || !versionType) return;

  const container = document.getElementById('localPresetsList');
  if (!container) return;

  const newOrder = Array.from(container.querySelectorAll('.collapse-item'))
    .map((item) => item.dataset.releaseId)
    .filter(Boolean);

  localStorage.setItem(getCustomOrderKey(printerId, versionType), JSON.stringify(newOrder));
}

function clearAppliedPresetSelection(printerData, versionType, fileNames) {
  const currentKey = `${printerData.id}_${versionType}`;
  const currentStorageKey = `mkp_current_script_${currentKey}`;
  const activeFile = localStorage.getItem(currentStorageKey);

  if (activeFile && fileNames.includes(activeFile)) {
    localStorage.removeItem(currentStorageKey);
    delete appliedReleases[currentKey];
    saveUserConfig();
    if (typeof window.updatePresetCacheSnapshot === 'function') {
      window.updatePresetCacheSnapshot(null, null);
    }
    if (typeof window.emitActivePresetUpdated === 'function') {
      window.emitActivePresetUpdated({ reason: 'preset-cleared', path: null, forceRefresh: true });
    }
  }
}

async function executeBatchDelete() {
  if (selectedLocalFiles.size === 0) return;

  const confirmed = await MKPModal.confirm({
    title: 'Confirm Batch Delete',
    msg: `You are about to delete <span class="font-bold text-red-500">${selectedLocalFiles.size}</span> local presets. This action cannot be undone.`,
    type: 'error',
    confirmText: 'Delete'
  });

  if (!confirmed) return;

  const context = getCurrentPresetContext();
  const fileNames = Array.from(selectedLocalFiles);

  let result = null;
  if (window.mkpAPI && typeof window.mkpAPI.deletePresetFiles === 'function') {
    result = await window.mkpAPI.deletePresetFiles(fileNames);
  } else {
    const deleted = [];
    const failed = [];
    for (const fileName of fileNames) {
      const res = await window.mkpAPI.deleteFile(fileName);
      if (res && res.success) {
        deleted.push(fileName);
      } else {
        failed.push({ fileName, error: res?.error || 'Delete failed' });
      }
    }
    result = { success: failed.length === 0, deleted, failed };
  }

  if (result.failed && result.failed.length > 0) {
    await MKPModal.alert({
      title: 'Partial Delete Failure',
      msg: result.failed.map((item) => `${escapeHtml(item.fileName)}: ${escapeHtml(item.error)}`).join('<br>'),
      type: 'error'
    });
  }

  if (context) {
    clearAppliedPresetSelection(context.printerData, context.versionType, result.deleted || []);
  }

  selectedLocalFiles.clear();
  toggleMultiSelectMode(false);

  if (context) {
    await renderPresetList(context.printerData, context.versionType);
  }
}

async function executeBatchDuplicate() {
  if (selectedLocalFiles.size === 0) return;

  const context = getCurrentPresetContext();
  if (!context) return;

  const localMap = new Map(lastRenderedLocalFiles.map((item) => [item.fileName, item]));

  for (const fileName of selectedLocalFiles) {
    const meta = localMap.get(fileName);
    await handleDuplicateLocal(
      fileName,
      context.printerData.id,
      context.versionType,
      meta?.realVersion || '0.0.1'
    );
  }

  await renderPresetList(context.printerData, context.versionType);
}

function editAndApplyLocal(fileName, printerId, versionType) {
  const printerData = typeof getPrinterObj === 'function' ? getPrinterObj(printerId) : null;
  if (!printerData) return;

  handleApplyLocal(fileName, fileName, printerData, versionType, null);
  if (typeof navTo === 'function') {
    navTo('page:params');
  }
}

async function getManifestPresetsForPrinter(printerData, versionType) {
  if (!printerData || !versionType) {
    return [];
  }

  try {
    if (!window.mkpAPI || typeof window.mkpAPI.readLocalPresetsManifest !== 'function') {
      return [];
    }

    const localManifestRes = await window.mkpAPI.readLocalPresetsManifest();
    if (!localManifestRes?.success || !Array.isArray(localManifestRes.data?.presets)) {
      return [];
    }

    return localManifestRes.data.presets.filter((preset) => {
      return preset.id === printerData.id && (!preset.type || preset.type === versionType);
    });
  } catch (error) {
    Logger.warn('Read local preset manifest failed', { error: error.message });
    return [];
  }
}

function collectLocalPresetMatchers(printerData, versionType, manifestPresets = []) {
  const acceptedPrefixes = new Set();
  const acceptedFileNames = new Set();
  const normalizedVersionType = String(versionType || '').trim().toLowerCase();

  const registerFileName = (fileName) => {
    const normalizedFileName = String(fileName || '').trim().toLowerCase();
    if (!normalizedFileName) return;

    acceptedFileNames.add(normalizedFileName);

    const marker = `_${normalizedVersionType}_`;
    const markerIndex = normalizedFileName.indexOf(marker);
    if (markerIndex >= 0) {
      acceptedPrefixes.add(normalizedFileName.slice(0, markerIndex + marker.length));
    }
  };

  acceptedPrefixes.add(`${String(printerData?.id || '').trim().toLowerCase()}_${normalizedVersionType}_`);

  const defaultPresetFile = printerData?.defaultPresets?.[versionType];
  if (defaultPresetFile) {
    registerFileName(defaultPresetFile);
  }

  manifestPresets.forEach((preset) => {
    registerFileName(preset?.file);
  });

  return {
    acceptedPrefixes,
    acceptedFileNames
  };
}

function matchesLocalPresetForPrinter(fileName, matcher) {
  const normalizedFileName = String(fileName || '').trim().toLowerCase();
  if (!normalizedFileName || !matcher) {
    return false;
  }

  if (matcher.acceptedFileNames.has(normalizedFileName)) {
    return true;
  }

  return Array.from(matcher.acceptedPrefixes).some((prefix) => normalizedFileName.startsWith(prefix));
}

async function fetchCloudPresetLogMap(printerData, versionType) {
  const map = {};
  const matchedPresets = await getManifestPresetsForPrinter(printerData, versionType);
  matchedPresets.forEach((preset) => {
    if (!preset.file) return;
    const changes = Array.isArray(preset.releaseNotes)
      ? preset.releaseNotes
      : (preset.releaseNotes ? [preset.releaseNotes] : (preset.description ? [preset.description] : ['General improvements and parameter updates']));
    map[preset.file.toLowerCase()] = changes;
  });
  return map;
}

function applyLocalPresetSort(localData, printerData, versionType) {
  const pinned = getPinnedPresetSet(printerData.id, versionType);
  localData.forEach((item) => {
    item.isPinned = pinned.has(item.fileName);
  });

  const customOrderStr = localStorage.getItem(getCustomOrderKey(printerData.id, versionType));
  const customOrder = customOrderStr ? JSON.parse(customOrderStr) : [];

  return localData.sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    if (localSortMode === 'custom' && !localSearchQuery) {
      const leftIndex = customOrder.indexOf(left.fileName);
      const rightIndex = customOrder.indexOf(right.fileName);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
    }

    if (localSortMode === 'name-asc') {
      return left.displayTitle.localeCompare(right.displayTitle, 'zh-CN', {
        numeric: true,
        sensitivity: 'base'
      });
    }

    if (localSortMode === 'updated-desc') {
      return (right.modifiedAt || 0) - (left.modifiedAt || 0);
    }

    const versionCompare = compareVersionsFront(right.realVersion, left.realVersion);
    if (versionCompare !== 0) return versionCompare;
    return (right.modifiedAt || 0) - (left.modifiedAt || 0);
  });
}

function renderLocalEmptyState(message) {
  const localEmpty = document.getElementById('localEmptyState');
  const localList = document.getElementById('localPresetsList');
  const step2Badge = document.getElementById('step2Badge');
  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');

  if (localEmpty) {
    localEmpty.classList.remove('hidden');
    localEmpty.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(message)}</p>`;
  }
  if (localList) {
    localList.classList.add('hidden');
    localList.innerHTML = '';
  }
  if (step2Badge) {
    step2Badge.classList.remove('theme-text');
  }
  if (dlBtn) {
    dlBtn.disabled = true;
  }
  if (dlHint) {
    dlHint.style.opacity = '1';
  }
}

async function renderPresetList(printerData, versionType) {
  const localEmpty = document.getElementById('localEmptyState');
  const localList = document.getElementById('localPresetsList');
  const step2Badge = document.getElementById('step2Badge');
  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');

  if (!printerData || !versionType) {
    lastRenderedLocalFiles = [];
    renderLocalEmptyState('请先在上方选择版本类型。');
    updateLocalManagerUI();
    return;
  }

  if (step2Badge) {
    step2Badge.classList.add('theme-text');
  }

  loadLocalSortMode(printerData.id, versionType);

  const manifestPresets = await getManifestPresetsForPrinter(printerData, versionType);
  const cloudLogMap = await fetchCloudPresetLogMap(printerData, versionType);
  const localPresetMatcher = collectLocalPresetMatchers(printerData, versionType, manifestPresets);
  const listResult = window.mkpAPI && typeof window.mkpAPI.listLocalPresetsDetailed === 'function'
    ? await window.mkpAPI.listLocalPresetsDetailed()
    : { success: false, data: [] };

  let localData = (listResult.success ? listResult.data : [])
    .filter((item) => matchesLocalPresetForPrinter(item.fileName, localPresetMatcher))
    .map((item) => {
    const displayTitle = item.customName || item.displayName || item.fileName.replace(/\.json$/i, '');
    const originalBaseName = `${printerData.id}_${versionType}_v${item.realVersion}.json`.toLowerCase();
    const changes = cloudLogMap[item.fileName.toLowerCase()]
      || cloudLogMap[originalBaseName]
      || [`本地自定义配置(预设版本 v${item.realVersion})`];

    return {
      id: item.fileName,
      fileName: item.fileName,
      displayTitle,
      realVersion: item.realVersion,
      modifiedAt: item.modifiedAt,
      createdAt: item.createdAt,
      size: item.size,
      changes,
      isPinned: false,
      isLatest: false
    };
  });

  if (!listResult.success) {
    Logger.warn('读取本地预设详情失败，返回空列表', { error: listResult.error });
  }

  if (localSearchQuery) {
    localData = localData.filter((item) => {
      return item.displayTitle.toLowerCase().includes(localSearchQuery)
        || item.fileName.toLowerCase().includes(localSearchQuery)
        || item.realVersion.toLowerCase().includes(localSearchQuery);
    });
  }

  applyLocalPresetSort(localData, printerData, versionType);

  if (localData.length > 0) {
    const latestItem = [...localData].sort((left, right) => compareVersionsFront(right.realVersion, left.realVersion))[0];
    if (latestItem) {
      const target = localData.find((item) => item.fileName === latestItem.fileName);
      if (target) target.isLatest = true;
    }
  }

  lastRenderedLocalFiles = localData.map((item) => ({ ...item }));

  if (localData.length === 0) {
    lastRenderedLocalFiles = [];
    renderLocalEmptyState(localSearchQuery ? '没有符合版本的本地预设。' : '本地暂无预设，请点击右上角“检查更新”后下载。');
    updateLocalManagerUI();
    return;
  }

  if (localEmpty) {
    localEmpty.classList.add('hidden');
  }

  if (localList) {
    localList.classList.remove('hidden');
    localList.classList.add('flex', 'flex-col', 'gap-2');
    renderListItems(localList, localData, printerData, versionType, true);
  }

  const activeFileName = localStorage.getItem(`mkp_current_script_${printerData.id}_${versionType}`);
  const hasApplied = localData.some((item) => item.fileName === activeFileName);

  if (dlBtn) {
    dlBtn.disabled = !hasApplied;
  }
  if (dlHint) {
    dlHint.style.opacity = hasApplied ? '0' : '1';
  }

  updateLocalManagerUI();
}

function renderListItems(container, releases, printerData, versionType, isLocal) {
  const allowDrag = isLocal && isMultiSelectMode && localSortMode === 'custom' && !localSearchQuery;
  const presetNamePrefix = `${printerData.shortName} ${VERSION_THEMES[versionType]?.title || ''}`.trim();

  container.innerHTML = '';

  releases.forEach((release) => {
    const isApplied = isLocal && release.fileName === localStorage.getItem(`mkp_current_script_${printerData.id}_${versionType}`);
    const isJustDownloaded = isLocal && window.newlyDownloadedFile === release.fileName;
    const isSelected = selectedLocalFiles.has(release.fileName);
    const selectionClass = isSelected ? 'preset-selected border-blue-500 bg-blue-50/20' : 'border-gray-100 dark:border-[#333]';

    const item = document.createElement('div');
    item.dataset.releaseId = release.fileName;
    item.className = `collapse-item transition-all border-b ${selectionClass} last:border-b-0 bg-white dark:bg-gray-800 ${isJustDownloaded ? 'flash-success' : ''}`;

    const buttonText = isLocal ? (isApplied ? '已应用' : '应用') : '下载';
    const buttonClass = isLocal
      ? (isApplied
        ? 'dl-btn theme-btn-solid cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm transition-all btn-q-bounce'
        : 'dl-btn theme-btn-soft cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium transition-all btn-q-bounce')
      : 'dl-btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#333] dark:border-[#444] dark:text-gray-200 dark:hover:bg-[#444] rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px]';

    const pinBadge = release.isPinned
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200 flex-shrink-0">置顶</span>'
      : '';

    const latestBadge = release.isLatest
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium theme-bg-soft flex-shrink-0">最新</span>'
      : '';

    const appliedBadge = isApplied
      ? '<span class="applied-badge px-2 py-0.5 rounded text-[10px] font-medium theme-btn-solid flex items-center gap-1 shadow-sm flex-shrink-0"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>'
      : '';

    const checkboxHtml = isLocal
      ? `<div class="multi-checkbox flex-shrink-0 w-4 h-4 rounded border-2 mr-3 transition-colors flex items-center justify-center ${isMultiSelectMode ? 'flex' : 'hidden'} ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}">
          <svg class="w-3 h-3 text-white transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
        </div>`
      : '';

    const metaHtml = isLocal
      ? `<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <div class="rounded-lg bg-white/60 dark:bg-black/10 px-3 py-2 break-all">文件: <span class="font-mono">${escapeHtml(release.fileName)}</span></div>
          <div class="rounded-lg bg-white/60 dark:bg-black/10 px-3 py-2">修改时间: ${escapeHtml(formatPresetDate(release.modifiedAt))}</div>
          <div class="rounded-lg bg-white/60 dark:bg-black/10 px-3 py-2">大小: ${escapeHtml(formatPresetSize(release.size))}</div>
        </div>`
      : `<div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <div class="rounded-lg bg-white/60 dark:bg-black/10 px-3 py-2 break-all">文件: <span class="font-mono">${escapeHtml(release.fileName || '--')}</span></div>
          <div class="rounded-lg bg-white/60 dark:bg-black/10 px-3 py-2">云端版本: <span class="font-mono">v${escapeHtml(release.realVersion || release.version || '--')}</span></div>
        </div>`;

    const toolHtml = isLocal
      ? `<button class="delete-btn p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="删除本地文件">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
         </button>`
      : '';

    const dragHtml = allowDrag
      ? `<div class="drag-handle ml-1 px-1 text-gray-300 hover:text-gray-500 dark:text-[#444] dark:hover:text-gray-400 cursor-grab active:cursor-grabbing transition-all opacity-0 group-hover:opacity-100" title="拖拽排序">
           <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>
         </div>`
      : '';

    item.innerHTML = `
      <div class="preset-header group px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2A2D2E] transition-colors">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          ${checkboxHtml}
          <span class="text-sm font-bold text-gray-900 dark:text-gray-100 truncate" title="${escapeHtml([presetNamePrefix, release.displayTitle].filter(Boolean).join(' '))}">${escapeHtml([presetNamePrefix, release.displayTitle].filter(Boolean).join(' '))}</span>
          ${pinBadge}
          ${latestBadge}
          ${appliedBadge}
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="flex items-center gap-2 action-tools ${isMultiSelectMode ? 'hidden' : 'flex'}">
            <button class="${buttonClass}">${buttonText}</button>
            ${toolHtml}
          </div>
          <svg class="w-5 h-5 text-gray-400 collapse-arrow transition-transform duration-200 toggle-arrow ${isMultiSelectMode ? 'hidden' : 'block'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          ${dragHtml}
        </div>
      </div>
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-4 pt-1">
            <div class="rounded-xl p-4 theme-bg-subtle">
              <div class="flex justify-between items-center gap-3 mb-2">
              <div class="text-xs font-medium text-gray-700 dark:text-gray-300">更新日志</div>
              <div class="text-[10px] font-bold px-2 py-0.5 rounded theme-bg-soft theme-text">预设版本: v${escapeHtml(release.realVersion || release.version || '--')}</div>
              </div>
              <ul class="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                ${release.changes.map((itemText) => `<li class="flex items-start gap-1.5"><span class="text-gray-300 dark:text-gray-600 mt-0.5">-</span><span>${escapeHtml(itemText)}</span></li>`).join('')}
              </ul>
              ${metaHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    const header = item.querySelector('.preset-header');
    header.addEventListener('click', () => {
      if (isMultiSelectMode) {
        toggleFileSelection(release.fileName, item);
      } else if (typeof toggleCollapse === 'function') {
        toggleCollapse(header);
      }
    });

    const actionButton = item.querySelector('.dl-btn');
    if (actionButton) {
      actionButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isLocal) {
          handleApplyLocal(release.fileName, release.fileName, printerData, versionType, actionButton);
        } else {
          handleDownloadOnline(release.id, release.fileName, actionButton);
        }
      });
    }

    if (isLocal) {
      item.addEventListener('contextmenu', (event) => {
        openPresetContextMenu(event, release, printerData, versionType, item);
      });

      const deleteButton = item.querySelector('.delete-btn');
      if (deleteButton) {
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          handleDeleteLocal(release.fileName, release.fileName, event, printerData, versionType);
        });
      }

      if (allowDrag) {
        const dragHandle = item.querySelector('.drag-handle');
        if (dragHandle) {
          dragHandle.addEventListener('mouseenter', () => item.setAttribute('draggable', 'true'));
          dragHandle.addEventListener('mouseleave', () => {
            if (draggedCard !== item) {
              item.removeAttribute('draggable');
            }
          });
        }

        item.addEventListener('dragstart', (event) => {
          draggedCard = item;
          event.dataTransfer.effectAllowed = 'move';
          setTimeout(() => item.classList.add('opacity-40', 'bg-gray-50'), 0);
        });

        item.addEventListener('dragover', (event) => {
          event.preventDefault();
          if (!draggedCard || draggedCard === item) return;
          const rect = item.getBoundingClientRect();
          const shouldInsertAfter = (event.clientY - rect.top) / Math.max(rect.height, 1) > 0.5;
          item.parentNode.insertBefore(draggedCard, shouldInsertAfter ? item.nextSibling : item);
        });

        item.addEventListener('drop', (event) => {
          event.stopPropagation();
          saveCustomOrder(printerData.id, versionType);
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('opacity-40', 'bg-gray-50');
          item.removeAttribute('draggable');
          draggedCard = null;
        });
      }
    }

    container.appendChild(item);
  });
}

function renderVersionCards(containerId, printerData, currentSelectedVersion, onSelectCallback) {
  const container = document.getElementById(containerId);
  if (!container || !printerData) return;

  container.innerHTML = '';

  const availableVersions = Array.isArray(printerData.supportedVersions) && printerData.supportedVersions.length > 0
    ? printerData.supportedVersions
    : ['standard'];

  const versionThemeMap = {
    standard: {
      ...(VERSION_THEMES.standard || {}),
      iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      desc: 'v3 标准版，适合新手使用并追求稳定性'
    },
    quick: {
      ...(VERSION_THEMES.quick || {}),
      iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
      desc: 'v3 快速版，适合自行打印安装'
    },
    lite: {
      ...(VERSION_THEMES.lite || {}),
      iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 12h6',
      desc: '适合 P 系列，以及其他 CoreXY'
    }
  };

  availableVersions.forEach((versionType) => {
    const info = versionThemeMap[versionType];
    if (!info) return;

    const isSelected = currentSelectedVersion === versionType;
    const card = document.createElement('div');
    card.className = `version-card version-card-${versionType} group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected theme-border' : 'border-gray-200 dark:border-[#333333] hover:border-gray-300 dark:hover:border-[#444]'}`;

    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="version-card-icon-shell">
          <div class="version-card-icon" style="background:${escapeHtml(info.bg || 'rgba(59,130,246,0.12)')}; color:${escapeHtml(info.text || 'rgb(59,130,246)')}">
            <svg class="version-card-icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${info.iconPath}"/></svg>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">${escapeHtml(info.title || versionType)}</span>
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">${escapeHtml(info.desc)}</p>
        </div>
        <div class="check-indicator version-card-choice w-6 h-6 rounded-full border-2 ${isSelected ? 'border-transparent theme-bg-solid' : 'border-gray-200 dark:border-[#444]'} flex items-center justify-center flex-shrink-0 transition-all duration-200">
          <svg class="w-3.5 h-3.5 text-white transition-opacity" style="opacity:${isSelected ? '1' : '0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      onSelectCallback(currentSelectedVersion === versionType ? null : versionType);
    });

    container.appendChild(card);
  });
}

function renderDownloadVersions(printerData) {
  renderVersionCards('downloadVersionList', printerData, selectedVersion, (versionType) => {
    selectedVersion = versionType;
    saveUserConfig();
    renderDownloadVersions(printerData);
    updateSidebarVersionBadge(versionType);
    clearOnlineListUI();
    if (typeof window.refreshCalibrationAvailability === 'function') {
      window.refreshCalibrationAvailability();
    }
  });

  if (!selectedVersion) {
    clearOnlineListUI();
    renderPresetList(printerData, null);
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if (dlBtn) dlBtn.disabled = true;
    if (dlHint) dlHint.style.opacity = '1';
  } else {
    renderPresetList(printerData, selectedVersion);
  }

  if (typeof window.refreshCalibrationAvailability === 'function') {
    window.refreshCalibrationAvailability();
  }
}

async function fetchCloudPresets(printerId, versionType) {
  Logger.info('[O401] 获取云端预设清单', { printerId, versionType });

  const manifestUrls = [
    `${CLOUD_BASES.gitee}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`,
    `${CLOUD_BASES.jsDelivr}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`,
    `${CLOUD_BASES.github}/cloud_data/presets/presets_manifest.json?t=${Date.now()}`
  ];

  const readLocalManifestFallback = async () => {
    if (!window.mkpAPI) {
      return null;
    }

    try {
      if (typeof window.mkpAPI.readBundledPresetsManifest === 'function') {
        const bundledManifest = await window.mkpAPI.readBundledPresetsManifest();
        if (bundledManifest?.success && Array.isArray(bundledManifest.data?.presets)) {
          return bundledManifest.data;
        }
      }

      if (typeof window.mkpAPI.readLocalPresetsManifest === 'function') {
        const localManifest = await window.mkpAPI.readLocalPresetsManifest();
        if (localManifest?.success && Array.isArray(localManifest.data?.presets)) {
          return localManifest.data;
        }
      }
    } catch (error) {
      Logger.warn('读取本地预设 manifest 失败', { error: error.message });
    }

    return null;
  };

  const inferPresetType = (preset) => {
    const directType = String(preset?.type || '').trim().toLowerCase();
    if (directType) return directType;

    const fileName = String(preset?.file || '').toLowerCase();
    const segments = fileName.replace(/\.json$/i, '').split('_');
    return segments.length >= 2 ? segments[1] : '';
  };

  const normalizedRequestedType = String(versionType || '').trim().toLowerCase();
  const normalizedPrinterId = String(printerId || '').trim().toLowerCase();

  const toMatchedPresets = (manifestData) => (manifestData?.presets || [])
    .filter((preset) => String(preset?.id || '').trim().toLowerCase() === normalizedPrinterId)
    .map((preset) => {
      const inferredType = inferPresetType(preset);
      const fileName = String(preset?.file || '');
      const normalizedFileName = fileName.toLowerCase();
      const likelyMatchesRequestedType = normalizedRequestedType
        ? inferredType === normalizedRequestedType
          || normalizedFileName.includes(`_${normalizedRequestedType}_`)
        : true;

      return {
        ...preset,
        type: inferredType || preset?.type || '',
        _matchesRequestedType: likelyMatchesRequestedType
      };
    })
    .filter((preset) => preset._matchesRequestedType)
    .sort((left, right) => compareVersionsFront(right.version, left.version));

  let manifestData = null;
  let response = null;
  for (const url of manifestUrls) {
    try {
      response = await fetch(url);
      if (!response.ok) continue;
      manifestData = await response.json();
      break;
    } catch (error) {
      Logger.warn('云端预设清单节点失败', { url, error: error.message });
    }
  }

  if (manifestData) {
    try {
      if (window.mkpAPI && typeof window.mkpAPI.saveLocalPresetsManifest === 'function') {
        await window.mkpAPI.saveLocalPresetsManifest(JSON.stringify(manifestData, null, 2));
      }
    } catch (error) {
      Logger.warn('保存本地预设 manifest 失败', { error: error.message });
    }
  } else {
    manifestData = await readLocalManifestFallback();
    if (!manifestData) {
      return { success: false, error: response ? `HTTP_${response.status}` : 'NetworkError' };
    }
    Logger.info('云端预设清单不可用，已回退到本地打包 manifest');
  }

  let matchedPresets = toMatchedPresets(manifestData);
  if (matchedPresets.length === 0) {
    const localFallback = await readLocalManifestFallback();
    if (localFallback) {
      const localMatchedPresets = toMatchedPresets(localFallback);
      if (localMatchedPresets.length > 0) {
        matchedPresets = localMatchedPresets;
        Logger.info('云端没有匹配项，已回退到本地打包 manifest 的机型映射');
      }
    }
  }

  const fallbackVersion = typeof APP_REAL_VERSION === 'string' ? APP_REAL_VERSION : '0.0.0';
  const today = new Date().toISOString().split('T')[0];

  return {
    success: true,
    data: matchedPresets.map((preset, index) => ({
      id: `v${preset.version || fallbackVersion}`,
      version: preset.version || fallbackVersion,
      realVersion: preset.version || fallbackVersion,
      date: preset.lastModified || today,
      isLatest: index === 0,
      fileName: preset.file,
      displayTitle: [preset.file ? preset.file.replace(/\.json$/i, '') : '', preset.version ? `v${preset.version}` : '']
        .filter(Boolean)
        .join(' '),
      changes: Array.isArray(preset.releaseNotes)
        ? preset.releaseNotes
        : (preset.releaseNotes ? [preset.releaseNotes] : (preset.description ? [preset.description] : ['常规体验优化与参数更新']))
    }))
  };
}

async function handleDownloadOnline(releaseId, fileName, btnElement) {
  if (!btnElement || btnElement.dataset.isDownloading === 'true') return;
  btnElement.dataset.isDownloading = 'true';

  Logger.info('[O402] 下载预设', { fileName });
  const spinIcon = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
  let resetButton = typeof setButtonStatus === 'function'
    ? setButtonStatus(btnElement, '90px', '下载中...', spinIcon, 'btn-expand-theme')
    : () => {};

  try {
    const downloadUrls = [
      `${CLOUD_BASES.gitee}/cloud_data/presets/${fileName}`,
      `${CLOUD_BASES.jsDelivr}/cloud_data/presets/${fileName}`,
      `${CLOUD_BASES.github}/cloud_data/presets/${fileName}`
    ];

    let result = { success: false, error: '所有下载节点均失败' };
    for (const url of downloadUrls) {
      try {
        result = await window.mkpAPI.downloadFile(url, fileName);
        if (result.success) break;
      } catch (error) {
        result = { success: false, error: error.message };
      }
    }

    if (!result.success && window.mkpAPI && typeof window.mkpAPI.copyBundledPreset === 'function') {
      try {
        result = await window.mkpAPI.copyBundledPreset(fileName);
        if (result.success) {
          Logger.info('远程预设下载失败，已改用本地打包资源', { fileName });
        }
      } catch (error) {
        result = { success: false, error: error.message };
      }
    }

    if (!result.success) {
      throw new Error(result.error || '下载失败');
    }

    const checkIcon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
    resetButton = typeof setButtonStatus === 'function'
      ? setButtonStatus(btnElement, '115px', '已下载完成', checkIcon, 'btn-expand-green')
      : () => {};

    window.newlyDownloadedFile = fileName;

    const printerData = typeof getPrinterObj === 'function' ? getPrinterObj(selectedPrinter) : null;
    if (printerData) {
      await renderPresetList(printerData, selectedVersion);
    }

    setTimeout(() => {
      resetButton();
      btnElement.dataset.isDownloading = 'false';
    }, 2000);
  } catch (error) {
    resetButton();
    btnElement.dataset.isDownloading = 'false';
    Logger.error('[E403] 下载预设失败', { error: error.message });
    await MKPModal.alert({ title: '下载失败', msg: error.message, type: 'error' });
  }
}

function clearOnlineListUI() {
  cachedOnlineReleases = null;
  const onlineEmpty = document.getElementById('onlineEmptyState');
  const onlineList = document.getElementById('onlinePresetsList');

  if (onlineEmpty) {
    onlineEmpty.classList.remove('hidden');
  }
  if (onlineList) {
    onlineList.classList.add('hidden');
    onlineList.classList.remove('flex');
    onlineList.innerHTML = '';
  }
}

async function checkOnlineUpdates(btnElement) {
  Logger.info('[O211] 手动检查预设更新');

  const onlineEmpty = document.getElementById('onlineEmptyState');
  const onlineList = document.getElementById('onlinePresetsList');

  if (!selectedPrinter || !selectedVersion) {
    await MKPModal.alert({
      title: '提示',
      msg: '请先在左侧选择机型和版本类型，再检查更新。',
      type: 'warning',
      confirmText: '确定',
      allowOutsideClick: true
    });
    return;
  }

  const spinIcon = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
  const reset = btnElement && typeof setButtonStatus === 'function'
    ? setButtonStatus(btnElement, '100px', '同步中...', spinIcon, 'btn-expand-theme')
    : () => {};

  if (onlineEmpty) onlineEmpty.classList.add('hidden');
  if (onlineList) {
    onlineList.classList.remove('hidden');
    onlineList.classList.add('flex');
    onlineList.innerHTML = `
      <div class="p-8 flex flex-col items-center justify-center text-center space-y-3">
        <svg class="w-6 h-6 animate-spin theme-text" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <div class="text-sm text-gray-500">正在与云端服务器同步预设...</div>
      </div>
    `;
  }

  try {
    const printerData = typeof getPrinterObj === 'function' ? getPrinterObj(selectedPrinter) : null;
    if (!printerData) return;

    const cloudResult = await fetchCloudPresets(printerData.id, selectedVersion);
    if (!cloudResult.success) {
      const errorText = cloudResult.error || '无法连接到云端服务器，请检查网络或代理设置。';
      if (onlineList) {
        onlineList.innerHTML = `
          <div class="p-8 text-center flex flex-col items-center justify-center">
            <div class="w-12 h-12 mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">获取云端数据失败</div>
            <div class="text-xs text-red-500 max-w-[260px] leading-relaxed">${escapeHtml(errorText)}</div>
          </div>
        `;
      }
      await MKPModal.alert({ title: '网络请求失败', msg: errorText, type: 'error' });
      return;
    }

    if (!onlineList) return;

    if (cloudResult.data.length === 0) {
      onlineList.innerHTML = '<div class="p-8 text-center text-sm text-gray-500">云端暂未发布该机型和版本的预设文件。</div>';
      return;
    }

    renderListItems(onlineList, cloudResult.data, printerData, selectedVersion, false);
  } catch (error) {
    Logger.error('渲染在线预设列表失败', { error: error.message });
    if (onlineList) {
      onlineList.innerHTML = '<div class="p-8 text-center text-sm text-red-500">在线列表渲染失败，请稍后重试。</div>';
    }
  } finally {
    reset();
    setTimeout(() => {
      const scrollContainer = document.querySelector('#page-download .page-content');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight + 1000,
          behavior: 'smooth'
        });
      }
    }, 100);
  }
}

function handleApplyLocal(releaseId, fileName, printerData, versionType = selectedVersion, clickedBtn = null) {
  Logger.info('[O301] 应用本地预设', { fileName, versionType });

  const currentKey = `${printerData.id}_${versionType}`;
  appliedReleases[currentKey] = releaseId;
  localStorage.setItem(`mkp_current_script_${currentKey}`, fileName);
  saveUserConfig();

  const localContainer = document.getElementById('localPresetsList');
  if (!localContainer) return;

  Array.from(localContainer.children).forEach((card) => {
    const isActiveCard = card.dataset.releaseId === releaseId;
    const button = card.querySelector('.dl-btn');
    const badgeContainer = card.querySelector('.preset-header .flex.items-center.gap-3');

    if (button) {
      if (isActiveCard) {
        const isReapply = button.textContent.trim() === '已应用' && button === clickedBtn;
        button.className = 'dl-btn theme-btn-solid btn-q-bounce cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm transition-all';

        if (isReapply && typeof setButtonStatus === 'function') {
          const checkIcon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>';
          const reset = setButtonStatus(button, '96px', '已应用', checkIcon, 'btn-expand-green');
          setTimeout(reset, 1500);
        } else {
          button.innerHTML = '已应用';
        }
      } else {
        button.className = 'dl-btn theme-btn-soft btn-q-bounce cursor-pointer flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium transition-all';
        button.innerHTML = '应用';
      }
    }

    if (!badgeContainer) return;

    Array.from(badgeContainer.querySelectorAll('.applied-badge')).forEach((badge) => badge.remove());
    if (isActiveCard) {
      badgeContainer.insertAdjacentHTML(
        'beforeend',
        '<span class="applied-badge px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-sm animate-scale-in theme-btn-solid"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>'
      );
    }
  });

  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');
  if (dlBtn) dlBtn.disabled = false;
  if (dlHint) dlHint.style.opacity = '0';
  if (typeof window.updateScriptPathDisplay === 'function') {
    window.updateScriptPathDisplay();
  }
  if (typeof window.refreshCalibrationAvailability === 'function') {
    window.refreshCalibrationAvailability();
  }
  if (typeof window.updatePresetCacheSnapshot === 'function') {
    window.updatePresetCacheSnapshot(null, null);
  }
  if (typeof window.emitActivePresetUpdated === 'function') {
    window.emitActivePresetUpdated({ reason: 'apply-local-preset', path: null, forceRefresh: true });
  }
}

async function handleDeleteLocal(releaseId, fileName, event, printerDataArg = null, versionTypeArg = null) {
  if (event) event.stopPropagation();

  const printerData = printerDataArg || (typeof getPrinterObj === 'function' ? getPrinterObj(selectedPrinter) : null);
  const versionType = versionTypeArg || selectedVersion;
  if (!printerData || !versionType) return;

  const confirmed = await MKPModal.confirm({
    title: '确认删除本地配置',
    msg: `即将删除文件 <span class="font-mono text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">${escapeHtml(fileName)}</span><br><br><span class="text-xs text-gray-500">删除后，您可随时在"在线预设"中重新下载。</span>`,
    confirmText: '确认删除',
    type: 'error'
  });

  if (!confirmed) return;

  try {
    const result = await window.mkpAPI.deleteFile(fileName);
    if (!result.success) {
      throw new Error(result.error || '删除失败');
    }

    clearAppliedPresetSelection(printerData, versionType, [fileName]);
    await renderPresetList(printerData, versionType);
  } catch (error) {
    await MKPModal.alert({ title: '删除失败', msg: error.message, type: 'error' });
  }
}

async function handleDuplicateLocal(fileName, printerId, versionType, realVersion) {
  try {
    if (!window.mkpAPI || typeof window.mkpAPI.duplicatePreset !== 'function') {
      throw new Error('当前版本缺少 duplicate-preset 接口，请重启后重试。');
    }

    const result = await window.mkpAPI.duplicatePreset({ fileName, printerId, versionType, realVersion });
    if (!result.success) {
      throw new Error(result.error || '复制失败');
    }

    window.newlyDownloadedFile = result.newFileName;
    const printerData = typeof getPrinterObj === 'function' ? getPrinterObj(printerId) : null;
    if (printerData) {
      await renderPresetList(printerData, versionType);
    }
  } catch (error) {
    await MKPModal.alert({ title: '复制失败', msg: error.message, type: 'error' });
  }
}

async function handleRenameLocal(target = presetContextMenuTarget) {
  if (!target) return;

  const nextName = await MKPModal.prompt({
    title: '重命名显示名称',
    msg: '仅修改 UI 显示名称，不移动预设文件名，避免影响现有逻辑。',
    value: target.displayTitle || '',
    placeholder: '输入新的显示名称',
    confirmText: '保存'
  });

  if (nextName === null) return;

  const finalName = nextName.trim();
  if (!finalName) {
    await MKPModal.alert({ title: '命名无效', msg: '显示名称不能为空。', type: 'warning' });
    return;
  }

  const result = await window.mkpAPI.renamePresetDisplay({ fileName: target.fileName, newName: finalName });
  if (!result.success) {
    await MKPModal.alert({ title: '重命名失败', msg: result.error || '保存失败', type: 'error' });
    return;
  }

  await renderPresetList(target.printerData, target.versionType);
}

async function showLocalFileInFolder(target = presetContextMenuTarget) {
  if (!target) return;

  const result = await window.mkpAPI.showItemInFolder(target.fileName);
  if (!result.success) {
    await MKPModal.alert({ title: '打开失败', msg: result.error || '无法在资源管理器中定位该文件。', type: 'error' });
  }
}

function togglePinnedPreset() {
  if (!presetContextMenuTarget) return;

  const { printerData, versionType, fileName } = presetContextMenuTarget;
  const pinnedSet = getPinnedPresetSet(printerData.id, versionType);

  if (pinnedSet.has(fileName)) {
    pinnedSet.delete(fileName);
  } else {
    pinnedSet.add(fileName);
  }

  savePinnedPresetSet(printerData.id, versionType, pinnedSet);
  renderPresetList(printerData, versionType);
}

function hidePresetContextMenu(options = {}) {
  const menu = document.getElementById('fileContextMenu');
  if (menu) {
    if (typeof window.hideFloatingSurface === 'function') {
      window.hideFloatingSurface(menu, options);
    } else {
      menu.classList.add('hidden');
    }
  }
  presetContextMenuTarget = null;
}

function openPresetContextMenu(event, release, printerData, versionType, cardElement) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('fileContextMenu');
  if (!menu) return;

  presetContextMenuTarget = {
    ...release,
    printerData,
    versionType,
    cardElement
  };

  const pinnedSet = getPinnedPresetSet(printerData.id, versionType);
  const pinText = document.getElementById('ctxText-pin');
  if (pinText) {
    pinText.textContent = pinnedSet.has(release.fileName) ? '取消置顶' : '置顶该配置';
  }

  if (typeof window.positionFloatingMenu === 'function') {
    window.positionFloatingMenu(menu, event.clientX, event.clientY, { keepVisible: true, margin: 12, minWidth: 224 });
  } else {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const menuWidth = menu.offsetWidth || 224;
    const menuHeight = menu.offsetHeight || 280;
    const left = Math.min(event.clientX, Math.max(12, viewportWidth - menuWidth - 12));
    const top = Math.min(event.clientY, Math.max(12, viewportHeight - menuHeight - 12));
    menu.style.left = `${Math.max(12, left)}px`;
    menu.style.top = `${Math.max(12, top)}px`;
  }
  if (typeof window.showFloatingSurface === 'function') {
    window.showFloatingSurface(menu);
  } else {
    menu.classList.remove('hidden');
  }
}

function bindPresetContextMenu() {
  if (window.__presetContextMenuBound) return;
  window.__presetContextMenuBound = true;

  document.addEventListener('click', () => hidePresetContextMenu({ immediate: true }));
  window.addEventListener('resize', () => hidePresetContextMenu({ immediate: true }));

  const actionMap = {
    ctxBtnApply: (target) => {
      if (!target) return;
      handleApplyLocal(
        target.fileName,
        target.fileName,
        target.printerData,
        target.versionType
      );
    },
    ctxBtnEdit: (target) => {
      if (!target) return;
      editAndApplyLocal(
        target.fileName,
        target.printerData.id,
        target.versionType
      );
    },
    ctxBtnCopy: (target) => {
      if (!target) return;
      handleDuplicateLocal(
        target.fileName,
        target.printerData.id,
        target.versionType,
        target.realVersion
      );
    },
    ctxBtnPin: (target) => {
      if (!target) return;
      presetContextMenuTarget = target;
      togglePinnedPreset();
    },
    ctxBtnRename: (target) => handleRenameLocal(target),
    ctxBtnExplore: (target) => showLocalFileInFolder(target),
    ctxBtnDelete: (target) => {
      if (!target) return;
      handleDeleteLocal(
        target.fileName,
        target.fileName,
        null,
        target.printerData,
        target.versionType
      );
    }
  };

  Object.entries(actionMap).forEach(([id, handler]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = presetContextMenuTarget;
      hidePresetContextMenu();
      handler(target);
    });
  });
}

function initPresetManagerText() {
  const textMap = {
    btnSelectAllLocal: '全选当前',
    btnInvertLocal: '反选当前',
    btnBatchDuplicate: '复制选中',
    btnBatchDelete: '删除选中',
    ctxBtnApply: '立即应用',
    ctxBtnEdit: '编辑参数',
    ctxBtnCopy: '复制副本',
    ctxBtnRename: '重命名显示名',
    ctxBtnExplore: '在资源管理器中显示',
    ctxBtnDelete: '删除配置',
    'ctxText-pin': '置顶此配置'
  };

  Object.entries(textMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });

  const multiSelectButton = document.getElementById('btnMultiSelect');
  if (multiSelectButton) {
    multiSelectButton.title = '批量管理';
  }

  const batchSummary = document.getElementById('localBatchSummary');
  if (batchSummary) {
    batchSummary.textContent = '批量模式已开启，可点击卡片或使用右键菜单。';
  }

  const checkUpdateText = document.querySelector('#checkUpdateBtn span');
  if (checkUpdateText) {
    checkUpdateText.textContent = '检查预设';
  }

  const sortSelect = document.getElementById('localSortSelect');
  if (sortSelect) {
    const options = sortSelect.querySelectorAll('option');
    if (options[0]) options[0].textContent = '自定义排序';
    if (options[1]) options[1].textContent = '版本从新到旧';
    if (options[2]) options[2].textContent = '最近修改';
    if (options[3]) options[3].textContent = '名称 A-Z';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initPresetManagerText();
  bindPresetContextMenu();
  updateLocalManagerUI();
});

window.toggleLocalSearch = toggleLocalSearch;
window.handleLocalSearch = handleLocalSearch;
window.toggleMultiSelectMode = toggleMultiSelectMode;
window.toggleFileSelection = toggleFileSelection;
window.toggleSelectAllLocal = toggleSelectAllLocal;
window.invertLocalSelection = invertLocalSelection;
window.executeBatchDelete = executeBatchDelete;
window.executeBatchDuplicate = executeBatchDuplicate;
window.editAndApplyLocal = editAndApplyLocal;
window.renderPresetList = renderPresetList;
window.renderVersionCards = renderVersionCards;
window.renderDownloadVersions = renderDownloadVersions;
window.handleDuplicateLocal = handleDuplicateLocal;
window.handleApplyLocal = handleApplyLocal;
window.handleDeleteLocal = handleDeleteLocal;
window.clearOnlineListUI = clearOnlineListUI;
window.checkOnlineUpdates = checkOnlineUpdates;
window.setLocalSortMode = setLocalSortMode;
