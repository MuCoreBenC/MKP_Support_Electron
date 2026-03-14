window.presetCache = window.presetCache || { path: null, data: null, timestamp: 0 };

const PARAM_GROUP_META = {
  meta: { title: '预设信息', desc: '识别当前预设的版本、机型和显示名。', icon: 'info' },
  toolhead: { title: '工具头参数', desc: '控制胶笔速度、三轴补偿和工具头动作。', icon: 'toolhead' },
  wiping: { title: '擦嘴策略', desc: '控制擦嘴塔、擦嘴组件以及支撑相关策略。', icon: 'wiping' },
  mount: { title: '工具头展开 G-code', desc: '默认展示完整文本，支持切换到逐行精修模式。', icon: 'mount' },
  unmount: { title: '工具头收起 G-code', desc: '默认展示完整文本，支持切换到逐行精修模式。', icon: 'unmount' },
  advanced: { title: '扩展参数', desc: '当前 JSON 中存在但未分类的高级字段。', icon: 'advanced' }
};

const PARAM_FIELD_META = {
  version: { label: '预设版本', desc: '当前预设的真实版本号，下载页“最新”也会依赖它。', group: 'meta' },
  printer: { label: '适用机型', desc: '当前预设绑定的机型标识。', group: 'meta' },
  type: { label: '版本类型', desc: '标准版、快拆版或 Lite 版等预设分支。', group: 'meta' },
  _custom_name: { label: '显示名称', desc: '本地列表里看到的自定义名称，不影响底层参数逻辑。', group: 'meta' },
  _comment: { label: '发布时间备注', desc: '预设文件里的额外说明，通常记录发布时间或维护备注。', group: 'meta', multiline: true },
  'toolhead.speed_limit': { label: '涂胶速度限制', desc: '限制工具头相关动作的速度上限，过高可能导致动作不稳定。', unit: 'mm/s', group: 'toolhead' },
  'toolhead.offset.x': { label: 'X 轴补偿', desc: '笔尖相对喷嘴的 X 偏移，影响左右方向对位。', unit: 'mm', group: 'toolhead' },
  'toolhead.offset.y': { label: 'Y 轴补偿', desc: '笔尖相对喷嘴的 Y 偏移，影响前后方向对位。', unit: 'mm', group: 'toolhead' },
  'toolhead.offset.z': { label: 'Z 轴高度差', desc: '笔尖高度差，直接影响涂胶高度和碰撞风险。', unit: 'mm', group: 'toolhead' },
  'toolhead.custom_mount_gcode': { label: '展开动作文本', desc: '控制工具头弹出、锁定或准备动作。', type: 'gcode', group: 'mount' },
  'toolhead.custom_unmount_gcode': { label: '收起动作文本', desc: '控制工具头收回、擦嘴和退出动作。', type: 'gcode', group: 'unmount' },
  'wiping.have_wiping_components': { label: '使用擦嘴塔', desc: '开启后改为打印擦嘴塔；关闭时按擦嘴组件路径处理。字段名虽然叫 components，但原版逻辑实际控制的是擦嘴塔方案。', type: 'boolean', group: 'wiping' },
  'wiping.wiper_x': { label: '擦嘴起点 X', desc: '擦嘴塔或擦嘴区域的 X 起始坐标，需要避开模型区域。', unit: 'mm', group: 'wiping' },
  'wiping.wiper_y': { label: '擦嘴起点 Y', desc: '擦嘴塔或擦嘴区域的 Y 起始坐标，需要避开模型区域。', unit: 'mm', group: 'wiping' },
  'wiping.wipetower_speed': { label: '擦嘴塔速度', desc: '擦嘴塔打印速度，过快可能影响稳定性。', unit: 'mm/s', group: 'wiping' },
  'wiping.nozzle_cooling_flag': { label: '涂胶时降温', desc: '控制涂胶期间是否额外执行喷嘴降温逻辑。', type: 'boolean', group: 'wiping' },
  'wiping.iron_apply_flag': { label: '缩小涂胶区域', desc: '原版注释为最小化涂胶区域，通常用于配合熨烫表面优化支撑面表现。', type: 'boolean', group: 'wiping' },
  'wiping.user_dry_time': { label: '额外干燥时间', desc: '在流程里增加等待干燥时间，单位为秒。', unit: '秒', group: 'wiping' },
  'wiping.force_thick_bridge_flag': { label: '强制厚桥', desc: '原版注释为 Force Thick Bridge，常用于桥接厚度相关兼容策略。', type: 'boolean', group: 'wiping' },
  'wiping.support_extrusion_multiplier': { label: '支撑挤出倍率', desc: '调整支撑相关挤出倍率，影响支撑密度和表面表现。', group: 'wiping' }
};

const PARAM_MENU_ACTIONS = [
  { id: 'cut', label: '剪切' },
  { id: 'copy', label: '复制' },
  { id: 'paste', label: '粘贴' },
  { id: 'undo', label: '撤销' },
  { id: 'delete', label: '删除' }
];

const GCODE_LINE_MENU_ACTIONS = [
  { id: 'deleteLine', label: '删除这一行' },
  { id: 'insertAbove', label: '上方插入一行' },
  { id: 'insertBelow', label: '下方插入一行' },
  { id: 'copyLine', label: '复制这一行' },
  { id: 'pasteLine', label: '粘贴' }
];

let paramContextMenuState = { target: null };
let gcodeLineContextMenuState = { row: null, editor: null };
let copiedGcodeLineText = '';
const gcodeHistoryStore = new WeakMap();
const PARAM_HISTORY_LIMIT = 4000;
const paramEditorSession = window.__paramEditorSession || {
  stores: new Map(),
  activePath: null,
  applying: false,
  historyPreviewToken: 0,
  historyPreviewTimer: null,
  lastFocus: null
};
window.__paramEditorSession = paramEditorSession;

function cloneParamData(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeParamValueByKey(key, value) {
  if (typeof value === 'string') {
    return key.includes('gcode') ? normalizeGcodeText(value) : value.replace(/\r\n/g, '\n');
  }
  return cloneParamData(value);
}

function normalizeFlatState(flatState = {}) {
  const normalized = {};
  Object.keys(flatState).sort().forEach((key) => {
    normalized[key] = normalizeParamValueByKey(key, flatState[key]);
  });
  return normalized;
}

function cloneParamFocus(focus) {
  return focus ? { ...focus } : null;
}

function createParamSnapshot(flatState, modes = {}, focus = null) {
  const normalizedModes = {};
  Object.keys(modes || {}).sort().forEach((key) => {
    normalizedModes[key] = modes[key];
  });

  return {
    flat: normalizeFlatState(flatState),
    modes: normalizedModes,
    focus: cloneParamFocus(focus)
  };
}

function serializeParamSnapshot(snapshot) {
  return JSON.stringify({
    flat: normalizeFlatState(snapshot?.flat || {}),
    modes: Object.keys(snapshot?.modes || {}).sort().reduce((acc, key) => {
      acc[key] = snapshot.modes[key];
      return acc;
    }, {})
  });
}

function serializeParamFullState(flatState = {}) {
  return JSON.stringify(normalizeFlatState(flatState));
}

function getParamStore(path) {
  return path ? paramEditorSession.stores.get(path) || null : null;
}

function getActiveParamStore() {
  return getParamStore(paramEditorSession.activePath);
}

function updateParamDirtyUI(store = getActiveParamStore()) {
  const saveBtn = document.getElementById('saveParamsBtn');
  const page = document.getElementById('page-params');
  const currentEditingFile = document.getElementById('currentEditingFile');

  if (saveBtn) {
    saveBtn.classList.toggle('params-save-dirty', !!store?.dirty);
  }

  if (page) {
    page.toggleAttribute('data-has-unsaved', !!store?.dirty);
  }

  if (currentEditingFile) {
    const baseName = currentEditingFile.dataset.baseName || currentEditingFile.textContent || '未选择';
    currentEditingFile.dataset.baseName = baseName;
    currentEditingFile.textContent = store?.dirty ? `${baseName} *` : baseName;
  }
}

function collectParamFullStateFromDom() {
  const flatUpdates = {};
  document.querySelectorAll('.dynamic-param-input[data-json-key]').forEach((input) => {
    const key = input.getAttribute('data-json-key');
    if (!key) return;
    if (input.type === 'checkbox') {
      flatUpdates[key] = input.checked;
      return;
    }
    flatUpdates[key] = coerceParamValue(input.value, input);
  });

  document.querySelectorAll('[data-gcode-mode]').forEach((shell) => {
    const key = shell.getAttribute('data-json-key');
    if (!key) return;
    if (shell.dataset.gcodeMode === 'structured') syncStructuredToRaw(shell);
    const rawInput = shell.querySelector('[data-gcode-raw]');
    flatUpdates[key] = normalizeGcodeText(rawInput ? rawInput.value : '');
  });

  return normalizeFlatState(flatUpdates);
}

function updateParamDirtyState(store = getActiveParamStore()) {
  if (!store) {
    updateParamDirtyUI(null);
    return false;
  }

  const paramsPage = document.getElementById('page-params');
  const canReadDom = store.path === paramEditorSession.activePath
    && paramsPage
    && !paramsPage.classList.contains('hidden')
    && document.querySelector('.dynamic-param-input[data-json-key]');

  const currentSerialized = canReadDom
    ? serializeParamFullState(collectParamFullStateFromDom())
    : (store.savedFullSerialized || store.savedSerialized);

  store.dirty = currentSerialized !== (store.savedFullSerialized || store.savedSerialized);
  updateParamDirtyUI(store);
  return store.dirty;
}

function ensureParamStore(path, flatState) {
  const existing = getParamStore(path);
  if (existing) return existing;

  const snapshot = createParamSnapshot(flatState);
  const serialized = serializeParamSnapshot(snapshot);
  const store = {
    path,
    history: [snapshot],
    index: 0,
    savedSerialized: serialized,
    savedFullSerialized: serializeParamFullState(flatState),
    dirty: false,
    lastFocus: cloneParamFocus(snapshot.focus)
  };
  paramEditorSession.stores.set(path, store);
  return store;
}

function collectParamModesFromDom() {
  const modes = {};
  document.querySelectorAll('[data-gcode-mode]').forEach((shell) => {
    const key = shell.getAttribute('data-json-key');
    if (key) {
      modes[key] = shell.dataset.gcodeMode || 'raw';
    }
  });
  return modes;
}

function captureParamFocus() {
  const active = document.activeElement;
  if (!active) return null;

  const regularField = active.closest('.dynamic-param-input[data-json-key]');
  if (regularField) {
    return {
      type: 'field',
      key: regularField.getAttribute('data-json-key'),
      start: regularField.selectionStart ?? 0,
      end: regularField.selectionEnd ?? 0
    };
  }

  const rawInput = active.closest('[data-gcode-raw]');
  if (rawInput) {
    const shell = rawInput.closest('[data-gcode-mode]');
    return {
      type: 'gcode-raw',
      key: shell?.getAttribute('data-json-key'),
      start: rawInput.selectionStart ?? 0,
      end: rawInput.selectionEnd ?? 0
    };
  }

  const lineInput = active.closest('[data-gcode-line]');
  if (lineInput) {
    const row = lineInput.closest('.gcode-line-row');
    const shell = lineInput.closest('[data-gcode-mode]');
    return {
      type: 'gcode-line',
      key: shell?.getAttribute('data-json-key'),
      lineIndex: Number(row?.dataset.lineIndex || 0),
      start: lineInput.selectionStart ?? 0,
      end: lineInput.selectionEnd ?? 0
    };
  }

  return null;
}

function getParamScrollContainer(element) {
  return element?.closest?.('.page-content') || document.querySelector('#page-params .page-content') || null;
}

function getSelectionPreviewScrollTop(input, position = 0) {
  if (!input || input.tagName !== 'TEXTAREA') return 0;
  const style = window.getComputedStyle(input);
  const lineHeight = parseFloat(style.lineHeight) || 22;
  const beforeText = String(input.value || '').slice(0, Math.max(0, position));
  const lineIndex = beforeText.split('\n').length - 1;
  const targetTop = (lineIndex * lineHeight) - (input.clientHeight / 2) + (lineHeight * 1.5);
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  return Math.max(0, Math.min(maxScrollTop, targetTop));
}

function applySelectionPreview(element, focus) {
  if (!element || !focus) return;
  if (typeof element.setSelectionRange === 'function') {
    const start = focus.start ?? 0;
    const end = focus.end ?? start;
    element.setSelectionRange(start, end);
  }

  if (element.tagName === 'TEXTAREA') {
    element.scrollTop = getSelectionPreviewScrollTop(element, focus.start ?? 0);
  }
}

function applySnapshotModePreview(snapshot) {
  document.querySelectorAll('[data-gcode-mode]').forEach((shell) => {
    const key = shell.getAttribute('data-json-key');
    const mode = snapshot?.modes?.[key];
    if (!mode) return;

    shell.dataset.gcodeMode = mode;
    const rawShell = shell.querySelector('.gcode-raw-shell');
    const structuredShell = shell.querySelector('.gcode-structured-shell');
    if (rawShell) rawShell.classList.toggle('hidden', mode !== 'raw');
    if (structuredShell) structuredShell.classList.toggle('hidden', mode !== 'structured');

    const card = shell.closest('[data-param-gcode]');
    card?.querySelectorAll('[data-mode-btn]').forEach((item) => {
      item.classList.toggle('is-active', item.getAttribute('data-mode-btn') === mode);
    });
  });
}

function resolveParamFocusTarget(focus) {
  if (!focus?.key) return null;

  if (focus.type === 'field') {
    const element = document.querySelector(`.dynamic-param-input[data-json-key="${CSS.escape(focus.key)}"]`);
    return element ? { element, focus } : null;
  }

  const shell = document.querySelector(`[data-gcode-mode][data-json-key="${CSS.escape(focus.key)}"]`);
  if (!shell) return null;

  if (focus.type === 'gcode-raw') {
    const element = shell.querySelector('[data-gcode-raw]');
    return element ? { element, focus } : null;
  }

  if (focus.type === 'gcode-line') {
    const rows = Array.from(shell.querySelectorAll('.gcode-line-row'));
    const row = rows.find((item) => Number(item.dataset.lineIndex) === Number(focus.lineIndex || 0)) || rows[Math.min(rows.length - 1, Math.max(0, Number(focus.lineIndex || 0)))];
    const element = row?.querySelector('[data-gcode-line]') || shell.querySelector('[data-gcode-raw]') || shell;
    return element ? { element, focus } : null;
  }

  return null;
}

function isElementVisibleInParamViewport(element) {
  if (!element) return false;
  const scrollContainer = getParamScrollContainer(element);
  const rect = element.getBoundingClientRect();

  if (!scrollContainer) {
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  return rect.top >= containerRect.top + 12 && rect.bottom <= containerRect.bottom - 12;
}

function isFocusVisibleForPreview(focus) {
  const target = resolveParamFocusTarget(focus);
  if (!target?.element) return true;
  if (!isElementVisibleInParamViewport(target.element)) return false;

  if (target.element.tagName === 'TEXTAREA') {
    const expectedTop = getSelectionPreviewScrollTop(target.element, focus.start ?? 0);
    return Math.abs((target.element.scrollTop || 0) - expectedTop) < 24;
  }

  return true;
}

function withInstantParamScroll(element, callback) {
  const scrollContainer = getParamScrollContainer(element);
  const prevBehavior = scrollContainer?.style.scrollBehavior || '';
  const rootPrevBehavior = document.documentElement.style.scrollBehavior || '';
  const bodyPrevBehavior = document.body.style.scrollBehavior || '';

  if (scrollContainer) scrollContainer.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollBehavior = 'auto';
  document.body.style.scrollBehavior = 'auto';

  try {
    callback(scrollContainer);
  } finally {
    requestAnimationFrame(() => {
      if (scrollContainer) scrollContainer.style.scrollBehavior = prevBehavior;
      document.documentElement.style.scrollBehavior = rootPrevBehavior;
      document.body.style.scrollBehavior = bodyPrevBehavior;
    });
  }
}

function focusElementForHistoryPreview(element) {
  if (!element) return;

  withInstantParamScroll(element, () => {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
  });
}

function restoreParamFocus(focus) {
  const target = resolveParamFocusTarget(focus);
  if (!target?.element) return;
  focusElementForHistoryPreview(target.element);
  applySelectionPreview(target.element, focus);
}

function collectParamSnapshotFromDom() {
  const fullState = collectParamFullStateFromDom();
  const textUpdates = {};
  Object.keys(fullState).forEach((key) => {
    const value = fullState[key];
    if (typeof value === 'string' || typeof value === 'number') {
      textUpdates[key] = value;
    }
  });

  return createParamSnapshot(textUpdates, {}, captureParamFocus());
}

function rememberParamSnapshot(options = {}) {
  if (paramEditorSession.applying) return null;

  const store = getActiveParamStore();
  if (!store) return null;

  const snapshot = collectParamSnapshotFromDom();
  if (options.explicitFocus) {
    snapshot.focus = cloneParamFocus(options.explicitFocus);
  } else if (!snapshot.focus) {
    snapshot.focus = cloneParamFocus(store.lastFocus || store.history[store.index]?.focus || paramEditorSession.lastFocus);
  }

  if (snapshot.focus) {
    store.lastFocus = cloneParamFocus(snapshot.focus);
    paramEditorSession.lastFocus = cloneParamFocus(snapshot.focus);
  }

  const nextSerialized = serializeParamSnapshot(snapshot);
  const currentSerialized = serializeParamSnapshot(store.history[store.index]);

  if (!options.force && nextSerialized === currentSerialized) {
    store.history[store.index].focus = cloneParamFocus(snapshot.focus);
    updateParamDirtyState(store);
    return snapshot;
  }

  if (options.replaceCurrent) {
    store.history[store.index] = snapshot;
  } else {
    store.history = store.history.slice(0, store.index + 1);
    store.history.push(snapshot);
    store.index = store.history.length - 1;
    if (store.history.length > PARAM_HISTORY_LIMIT) {
      store.history = store.history.slice(store.history.length - PARAM_HISTORY_LIMIT);
      store.index = store.history.length - 1;
    }
  }

  updateParamDirtyState(store);
  return snapshot;
}

function applyParamSnapshotToDom(snapshot, options = {}) {
  if (!snapshot) return;

  paramEditorSession.applying = true;
  try {
    document.querySelectorAll('.dynamic-param-input[data-json-key]').forEach((input) => {
      const key = input.getAttribute('data-json-key');
      if (input.type === 'checkbox') return;
      const value = snapshot.flat[key];
      if (value === undefined) return;
      input.value = value == null ? '' : String(value);
    });

    document.querySelectorAll('[data-gcode-mode]').forEach((shell) => {
      const key = shell.getAttribute('data-json-key');
      const rawInput = shell.querySelector('[data-gcode-raw]');

      if (rawInput && snapshot.flat[key] !== undefined) {
        rawInput.value = normalizeGcodeText(snapshot.flat[key]);
      }

      syncRawToStructured(shell, { resetHistory: false });
    });
  } finally {
    paramEditorSession.applying = false;
  }

  updateParamDirtyUI();
}

function applyFullParamStateToDom(flatState = {}) {
  paramEditorSession.applying = true;
  try {
    document.querySelectorAll('.dynamic-param-input[data-json-key]').forEach((input) => {
      const key = input.getAttribute('data-json-key');
      if (!(key in flatState)) return;

      if (input.type === 'checkbox') {
        input.checked = Boolean(flatState[key]);
        return;
      }

      input.value = flatState[key] == null ? '' : String(flatState[key]);
    });

    document.querySelectorAll('[data-gcode-mode]').forEach((shell) => {
      const key = shell.getAttribute('data-json-key');
      if (!(key in flatState)) return;
      const rawInput = shell.querySelector('[data-gcode-raw]');
      if (rawInput) {
        rawInput.value = normalizeGcodeText(flatState[key]);
      }
      syncRawToStructured(shell, { resetHistory: false });
    });

    document.querySelectorAll('.param-row-toggle').forEach((row) => {
      const checkbox = row.querySelector('.dynamic-param-input[type="checkbox"]');
      const status = row.querySelector('.param-switch-status');
      if (checkbox && status) {
        status.textContent = checkbox.checked ? '已开启' : '已关闭';
      }
    });
  } finally {
    paramEditorSession.applying = false;
  }
}

async function stepParamHistory(direction, options = {}) {
  const store = getActiveParamStore();
  if (!store) return false;

  const nextIndex = store.index + direction;
  if (nextIndex < 0 || nextIndex >= store.history.length) return false;

  const targetSnapshot = store.history[nextIndex];
  store.index = nextIndex;
  applyParamSnapshotToDom(targetSnapshot, options);
  updateParamDirtyState(store);
  return true;
}

function discardActiveParamChanges() {
  const store = getActiveParamStore();
  if (!store) return;

  const savedIndex = store.history.findIndex((snapshot) => serializeParamSnapshot(snapshot) === store.savedSerialized);
  if (savedIndex >= 0) {
    store.index = savedIndex;
  } else {
    const current = store.history[store.index];
    store.history = [createParamSnapshot(current.flat, current.modes, current.focus)];
    store.index = 0;
    store.savedSerialized = serializeParamSnapshot(store.history[0]);
  }

  const paramsPage = document.getElementById('page-params');
  if (paramsPage && !paramsPage.classList.contains('hidden')) {
    try {
      applyFullParamStateToDom(JSON.parse(store.savedFullSerialized || '{}'));
    } catch (error) {
      applyParamSnapshotToDom(store.history[store.index], { restoreFocus: false });
    }
  }

  updateParamDirtyState(store);
}

function markActiveParamSnapshotSaved(snapshot = null) {
  const store = getActiveParamStore();
  if (!store) return;
  const targetSnapshot = snapshot || store.history[store.index];
  store.savedSerialized = serializeParamSnapshot(targetSnapshot);
  store.savedFullSerialized = serializeParamFullState(collectParamFullStateFromDom());
  updateParamDirtyState(store);
}

function pushParamSnapshotToHistory(snapshot, options = {}) {
  const store = getActiveParamStore();
  if (!store || !snapshot) return;

  store.history = store.history.slice(0, store.index + 1);
  store.history.push(createParamSnapshot(snapshot.flat, snapshot.modes, snapshot.focus));
  store.index = store.history.length - 1;
  if (store.history.length > PARAM_HISTORY_LIMIT) {
    store.history = store.history.slice(store.history.length - PARAM_HISTORY_LIMIT);
    store.index = store.history.length - 1;
  }

  if (options.markSaved) {
    store.savedSerialized = serializeParamSnapshot(store.history[store.index]);
    store.savedFullSerialized = serializeParamFullState(store.history[store.index].flat);
  }

  updateParamDirtyState(store);
}

function escapeParamHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeGcodeText(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function getParamFieldMeta(key) {
  return PARAM_FIELD_META[key] || {
    label: key.split('.').pop().replace(/_/g, ' '),
    desc: `底层字段：${key}`,
    group: key.startsWith('toolhead.') ? 'toolhead' : key.startsWith('wiping.') ? 'wiping' : 'advanced'
  };
}

function getGroupForField(key) {
  const meta = getParamFieldMeta(key);
  if (meta.group) return meta.group;
  if (key.startsWith('toolhead.custom_mount_gcode')) return 'mount';
  if (key.startsWith('toolhead.custom_unmount_gcode')) return 'unmount';
  if (key.startsWith('toolhead.')) return 'toolhead';
  if (key.startsWith('wiping.')) return 'wiping';
  return 'advanced';
}

function inferInputType(key, value) {
  const meta = getParamFieldMeta(key);
  if (meta.type) return meta.type;
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && value.includes('\n')) return 'textarea';
  return 'text';
}

function getParamGroupIcon(icon) {
  const icons = {
    info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.25 11.25l.041-.02a.75.75 0 011.084.67v4.08a.75.75 0 01-1.125.65l-.041-.02M12 8.25h.008v.008H12V8.25z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    toolhead: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3.75h6m-7.5 4.5h9m-10.5 4.5h12m-9 4.5h6"/>',
    wiping: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.5 7.5h15M6 12h12m-9 4.5h6"/>',
    mount: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 16.5V4.5m0 0l-4.5 4.5M12 4.5l4.5 4.5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.5 19.5h15"/>',
    unmount: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 7.5v12m0 0L7.5 15M12 19.5l4.5-4.5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.5 4.5h15"/>',
    advanced: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m9 12h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/>'
  };
  return icons[icon] || icons.advanced;
}

function getGcodeLineHint(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '空行';
  if (trimmed.startsWith(';')) return '注释';
  if (trimmed.startsWith('G0') || trimmed.startsWith('G1')) return '运动';
  if (trimmed.startsWith('G92')) return '坐标重置';
  if (trimmed.startsWith('M106')) return '风扇';
  if (trimmed.startsWith('M204')) return '加速度';
  if (trimmed.startsWith('L8')) return '自定义宏';
  return '指令';
}

async function getActivePresetPath() {
  const currentKey = `${selectedPrinter}_${selectedVersion}`;
  Logger.info(`Read variable: mkp_current_script_${currentKey}`);
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
    return { path, data: window.presetCache.data };
  }

  Logger.info(`[O301] Read preset, path:${path}`);
  const result = await window.mkpAPI.readPreset(path);
  if (!result.success) {
    Logger.error(`[E301] Preset not found: ${path}`);
    return null;
  }

  window.presetCache = { path, data: result.data, timestamp: now };
  return { path, data: result.data };
}

function getEmptyParamsState() {
  return `
    <div class="col-span-full w-full flex flex-col items-center justify-center min-h-[320px] bg-gray-50/50 dark:bg-[#1E1E1E]/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-[#333] transition-all p-8">
      <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
      </svg>
      <span class="text-lg font-semibold text-gray-500 dark:text-gray-400">当前未应用任何预设</span>
      <span class="text-sm text-gray-400 dark:text-gray-500 mt-2 text-center">请先前往 <span onclick="navTo('page:download')" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer font-medium hover:underline transition-all">【下载预设】</span> 页面应用一个本地配置</span>
    </div>
  `;
}

function buildParamsSummary(presetData, fileName) {
  const printer = presetData?.printer || '--';
  const type = presetData?.type || '--';
  const version = presetData?.version || '--';
  const displayName = presetData?._custom_name || fileName;

  return `
    <div class="params-hero-card">
      <div>
        <div class="params-hero-label">当前预设</div>
        <div class="params-hero-title">${escapeParamHtml(displayName)}</div>
        <div class="params-hero-subtitle">${escapeParamHtml(fileName)}</div>
      </div>
      <div class="params-hero-badges">
        <span class="params-pill">机型 ${escapeParamHtml(printer)}</span>
        <span class="params-pill">类型 ${escapeParamHtml(type)}</span>
        <span class="params-pill params-pill-strong">版本 v${escapeParamHtml(version)}</span>
      </div>
    </div>
  `;
}

function renderFieldTooltip(meta) {
  return `
    <div class="param-tip">
      <div class="param-tip-title">字段说明</div>
      <div class="param-tip-body">${escapeParamHtml(meta.desc || '')}</div>
    </div>
  `;
}

function renderFieldLabel(meta, key, subText = '') {
  const metaText = subText || meta.unit || key;
  return `
    <div class="param-row-main">
      <div class="param-row-title-line">
        <div class="param-field-title">${escapeParamHtml(meta.label)}</div>
        <div class="param-tooltip-anchor">
          <span class="param-help-dot">?</span>
          ${renderFieldTooltip(meta)}
        </div>
      </div>
      <div class="param-field-sub">${escapeParamHtml(metaText)}</div>
    </div>
  `;
}

function createBooleanField(key, value, meta) {
  return `
    <label class="param-row param-row-toggle">
      ${renderFieldLabel(meta, key, '布尔开关')}
      <div class="param-row-control">
        <span class="param-switch-status">${value ? '已开启' : '已关闭'}</span>
        <span class="param-switch-shell">
          <input type="checkbox" data-json-key="${escapeParamHtml(key)}" class="dynamic-param-input sr-only" ${value ? 'checked' : ''}>
          <span class="param-switch-ui"></span>
        </span>
      </div>
    </label>
  `;
}

function createStandardField(key, value, meta, inputType) {
  const isTextarea = inputType === 'textarea' || meta.multiline;
  const valueText = value == null ? '' : String(value);

  if (isTextarea) {
    return `
      <div class="param-row param-row-block">
        ${renderFieldLabel(meta, key, meta.desc || key)}
        <div class="param-row-control param-row-control-block">
          <textarea data-json-key="${escapeParamHtml(key)}" rows="4" class="dynamic-param-input param-editable param-textarea">${escapeParamHtml(valueText)}</textarea>
        </div>
      </div>
    `;
  }

  return `
    <div class="param-row">
      ${renderFieldLabel(meta, key, meta.unit ? `单位：${meta.unit}` : '文本字段')}
      <div class="param-row-control">
        <input type="${inputType === 'number' ? 'number' : 'text'}" step="any" data-json-key="${escapeParamHtml(key)}" value="${escapeParamHtml(valueText)}" class="dynamic-param-input param-editable param-input">
      </div>
    </div>
  `;
}

function renderGcodeLineRow(line, index) {
  return `
    <div class="gcode-line-row" data-line-index="${index}">
      <div class="gcode-line-meta" title="右键可插入、复制、粘贴或删除这一行">
        <span class="gcode-line-number">${index + 1}</span>
        <span class="gcode-line-kind">${escapeParamHtml(getGcodeLineHint(line))}</span>
      </div>
      <input type="text" value="${escapeParamHtml(line)}" class="param-editable gcode-line-input" data-gcode-line>
    </div>
  `;
}

function createGcodeField(key, value, meta) {
  const rawText = normalizeGcodeText(value);
  const lines = rawText.split('\n');
  const renderLines = lines.length > 0 ? lines : [''];

  return `
    <div class="param-row param-row-block param-row-gcode" data-param-gcode="true">
      <div class="param-row-head">
        ${renderFieldLabel(meta, key, '默认整段编辑，可切换为分行精修')}
        <div class="param-field-actions">
          <div class="gcode-mode-switch">
            <button type="button" class="gcode-mode-btn is-active" data-mode-btn="raw" onclick="toggleGcodeMode(this, 'raw')">整段编辑</button>
            <button type="button" class="gcode-mode-btn" data-mode-btn="structured" onclick="toggleGcodeMode(this, 'structured')">分行编辑</button>
          </div>
        </div>
      </div>
      <div class="param-row-control param-row-control-block">
        <div class="gcode-card-shell" data-json-key="${escapeParamHtml(key)}" data-gcode-mode="raw">
        <div class="gcode-raw-shell">
          <textarea class="dynamic-param-input param-editable param-textarea gcode-raw-input" data-gcode-raw rows="10">${escapeParamHtml(rawText)}</textarea>
        </div>
        <div class="gcode-structured-shell hidden">
          <div class="gcode-structured-toolbar">右键行号或整行可插入、复制、粘贴、删除</div>
          <div class="gcode-editor" data-gcode-structured>
            ${renderLines.map((line, index) => renderGcodeLineRow(line, index)).join('')}
          </div>
        </div>
      </div>
      </div>
    </div>
  `;
}

function buildParamGroupSections(flatData) {
  const groups = { meta: [], toolhead: [], wiping: [], mount: [], unmount: [], advanced: [] };

  Object.keys(flatData).forEach((key) => {
    const value = flatData[key];
    const meta = getParamFieldMeta(key);
    const type = inferInputType(key, value);

    if (type === 'gcode') {
      groups[getGroupForField(key)].push(createGcodeField(key, value, meta));
      return;
    }

    if (type === 'boolean') {
      groups[getGroupForField(key)].push(createBooleanField(key, value, meta));
      return;
    }

    groups[getGroupForField(key)].push(createStandardField(key, value, meta, type));
  });

  return groups;
}

function renderParamGroup(groupKey, cards) {
  if (!cards.length) return '';

  const meta = PARAM_GROUP_META[groupKey] || PARAM_GROUP_META.advanced;
  return `
    <section class="params-group-section">
      <div class="params-group-head">
        <div class="params-group-icon">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${getParamGroupIcon(meta.icon)}</svg>
        </div>
        <div>
          <h3 class="params-group-title">${escapeParamHtml(meta.title)}</h3>
          <p class="params-group-desc">${escapeParamHtml(meta.desc)}</p>
        </div>
      </div>
      <div class="params-group-list">
        ${cards.join('')}
      </div>
    </section>
  `;
}

function renumberGcodeRows(editor) {
  Array.from(editor.querySelectorAll('.gcode-line-row')).forEach((row, index) => {
    row.dataset.lineIndex = String(index);
    const number = row.querySelector('.gcode-line-number');
    const kind = row.querySelector('.gcode-line-kind');
    const input = row.querySelector('[data-gcode-line]');
    if (number) number.textContent = String(index + 1);
    if (kind && input) kind.textContent = getGcodeLineHint(input.value);
  });
}

function getStructuredLines(editor) {
  return Array.from(editor.querySelectorAll('[data-gcode-line]')).map((input) => input.value);
}

function syncStructuredToRaw(cardShell) {
  const rawInput = cardShell.querySelector('[data-gcode-raw]');
  const editor = cardShell.querySelector('[data-gcode-structured]');
  if (!rawInput || !editor) return;
  rawInput.value = getStructuredLines(editor).join('\n');
}

function getDefaultGcodeSelection() {
  return { lineIndex: 0, start: 0, end: 0 };
}

function getGcodeEditorSelection(editor) {
  const activeInput = document.activeElement?.closest?.('[data-gcode-line]');
  if (!activeInput || !editor.contains(activeInput)) return getDefaultGcodeSelection();
  const row = activeInput.closest('.gcode-line-row');
  return {
    lineIndex: Number(row?.dataset.lineIndex || 0),
    start: activeInput.selectionStart ?? activeInput.value.length,
    end: activeInput.selectionEnd ?? activeInput.value.length
  };
}

function restoreGcodeEditorSelection(editor, selection = getDefaultGcodeSelection()) {
  const rows = Array.from(editor.querySelectorAll('.gcode-line-row'));
  const row = rows[Math.min(selection.lineIndex || 0, Math.max(rows.length - 1, 0))];
  const input = row?.querySelector('[data-gcode-line]');
  if (!input) return;
  const endPos = Math.min(selection.end ?? input.value.length, input.value.length);
  const startPos = Math.min(selection.start ?? endPos, endPos);
  input.focus();
  input.setSelectionRange(startPos, endPos);
}

function seedGcodeHistory(cardShell, text) {
  gcodeHistoryStore.set(cardShell, {
    stack: [{ text, selection: getDefaultGcodeSelection() }],
    index: 0
  });
}

function ensureGcodeHistory(cardShell) {
  let history = gcodeHistoryStore.get(cardShell);
  if (history) return history;
  const rawInput = cardShell.querySelector('[data-gcode-raw]');
  const text = normalizeGcodeText(rawInput ? rawInput.value : '');
  seedGcodeHistory(cardShell, text);
  return gcodeHistoryStore.get(cardShell);
}

function buildGcodeHistoryState(editor) {
  return {
    text: getStructuredLines(editor).join('\n'),
    selection: getGcodeEditorSelection(editor)
  };
}

function rememberGcodeHistory(cardShell) {
  const editor = cardShell.querySelector('[data-gcode-structured]');
  if (!editor) return;

  const history = ensureGcodeHistory(cardShell);
  const nextState = buildGcodeHistoryState(editor);
  const currentState = history.stack[history.index];

  if (currentState && currentState.text === nextState.text) {
    currentState.selection = nextState.selection;
    syncStructuredToRaw(cardShell);
    return;
  }

  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(nextState);
  history.index = history.stack.length - 1;
  if (history.stack.length > 180) {
    history.stack = history.stack.slice(history.stack.length - 180);
    history.index = history.stack.length - 1;
  }
  syncStructuredToRaw(cardShell);
}

function applyGcodeHistoryState(cardShell, state) {
  const rawInput = cardShell.querySelector('[data-gcode-raw]');
  const editor = cardShell.querySelector('[data-gcode-structured]');
  if (!rawInput || !editor) return;

  const text = normalizeGcodeText(state?.text || '');
  const lines = text.split('\n');
  const renderLines = lines.length > 0 ? lines : [''];
  editor.innerHTML = renderLines.map((line, index) => renderGcodeLineRow(line, index)).join('');
  renumberGcodeRows(editor);
  rawInput.value = text;
  restoreGcodeEditorSelection(editor, state?.selection);
}

function stepGcodeHistory(cardShell, direction) {
  const history = ensureGcodeHistory(cardShell);
  const nextIndex = history.index + direction;
  if (nextIndex < 0 || nextIndex >= history.stack.length) return false;
  history.index = nextIndex;
  applyGcodeHistoryState(cardShell, history.stack[history.index]);
  return true;
}

function syncRawToStructured(cardShell, options = {}) {
  const rawInput = cardShell.querySelector('[data-gcode-raw]');
  const editor = cardShell.querySelector('[data-gcode-structured]');
  if (!rawInput || !editor) return;

  const text = normalizeGcodeText(rawInput.value);
  const lines = text.split('\n');
  const renderLines = lines.length > 0 ? lines : [''];
  editor.innerHTML = renderLines.map((line, index) => renderGcodeLineRow(line, index)).join('');
  renumberGcodeRows(editor);
  if (options.resetHistory !== false) seedGcodeHistory(cardShell, text);
}

function toggleGcodeMode(button, mode) {
  const card = button.closest('[data-param-gcode]');
  const shell = card?.querySelector('[data-gcode-mode]');
  if (!shell) return;

  if (mode === 'structured') syncRawToStructured(shell, { resetHistory: true });
  else syncStructuredToRaw(shell);

  shell.dataset.gcodeMode = mode;
  const rawShell = shell.querySelector('.gcode-raw-shell');
  const structuredShell = shell.querySelector('.gcode-structured-shell');
  if (rawShell) rawShell.classList.toggle('hidden', mode !== 'raw');
  if (structuredShell) structuredShell.classList.toggle('hidden', mode !== 'structured');

  card.querySelectorAll('[data-mode-btn]').forEach((item) => {
    item.classList.toggle('is-active', item.getAttribute('data-mode-btn') === mode);
  });

  updateParamDirtyState();
}

async function renderDynamicParamsPage() {
  const container = document.getElementById('dynamicParamsContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="col-span-full py-10 text-center text-gray-500">
      <svg class="w-8 h-8 animate-spin mx-auto theme-text mb-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      正在读取 JSON 预设文件...
    </div>
  `;

  const preset = await loadActivePreset();
  if (!preset) {
    paramEditorSession.activePath = null;
    container.innerHTML = getEmptyParamsState();
    const currentEditingFile = document.getElementById('currentEditingFile');
    if (currentEditingFile) {
      currentEditingFile.dataset.baseName = '未选择';
      currentEditingFile.textContent = '未选择';
    }
    updateParamDirtyUI(null);
    return;
  }

  const fileName = preset.path.split('\\').pop();
  const currentEditingFile = document.getElementById('currentEditingFile');
  if (currentEditingFile) {
    currentEditingFile.dataset.baseName = fileName;
    currentEditingFile.textContent = fileName;
  }

  if (window.mkpAPI?.ensurePresetBackup) {
    try {
      await window.mkpAPI.ensurePresetBackup(preset.path);
    } catch (error) {}
  }

  const diskFlat = normalizeFlatState(flattenObject(preset.data));
  const diskSnapshot = createParamSnapshot(diskFlat);
  let store = getParamStore(preset.path);
  if (!store) {
    store = ensureParamStore(preset.path, diskFlat);
  } else if (!store.dirty && serializeParamSnapshot(store.history[store.index]) !== serializeParamSnapshot(diskSnapshot)) {
    store.history = [diskSnapshot];
    store.index = 0;
    store.savedSerialized = serializeParamSnapshot(diskSnapshot);
    store.savedFullSerialized = serializeParamFullState(diskFlat);
    store.dirty = false;
    store.lastFocus = cloneParamFocus(diskSnapshot.focus);
  }

  paramEditorSession.activePath = preset.path;
  const activeSnapshot = store.history[store.index];
  const groups = buildParamGroupSections(activeSnapshot.flat);
  container.innerHTML = `
    <div class="col-span-full params-shell">
      ${buildParamsSummary(unflattenObject(activeSnapshot.flat), fileName)}
      ${renderParamGroup('meta', groups.meta)}
      ${renderParamGroup('toolhead', groups.toolhead)}
      ${renderParamGroup('wiping', groups.wiping)}
      ${renderParamGroup('mount', groups.mount)}
      ${renderParamGroup('unmount', groups.unmount)}
      ${renderParamGroup('advanced', groups.advanced)}
    </div>
  `;

  applyParamSnapshotToDom(activeSnapshot, { restoreFocus: false });
  updateParamDirtyState(store);
}

function coerceParamValue(rawValue, input) {
  if (input.type === 'checkbox') return input.checked;

  const value = String(rawValue ?? '');
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (input.type === 'number' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  if ((value.startsWith('{') || value.startsWith('[')) && value.trim()) {
    try {
      return JSON.parse(value);
    } catch (error) {}
  }
  return value;
}

async function saveAllDynamicParams(options = {}) {
  const preset = await loadActivePreset();
  if (!preset) {
    await MKPModal.alert({ title: '提示', msg: '当前未应用任何预设，无法保存。', type: 'warning' });
    return false;
  }

  if (!options.skipConfirm) {
    const confirmed = await MKPModal.confirm({
      title: '保存所有修改？',
      msg: `将把当前参数写回到 <span class="font-mono text-xs">${escapeParamHtml(preset.path.split('\\').pop())}</span>。`,
      type: 'info',
      confirmText: '确认保存',
      cancelText: '再检查一下'
    });
    if (!confirmed) return false;
  }

  const saveBtn = document.getElementById('saveParamsBtn');
  if (!saveBtn || saveBtn.dataset.isSaving === 'true') return false;

  saveBtn.dataset.isSaving = 'true';
  const spinIcon = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
  let resetEngine = setButtonStatus(saveBtn, '110px', '保存中', spinIcon, 'btn-expand-theme');

  const snapshot = rememberParamSnapshot({ force: true }) || collectParamSnapshotFromDom();
  const flatUpdates = snapshot.flat;

  const startTime = Date.now();
  const result = await window.mkpAPI.overwritePreset(preset.path, unflattenObject(flatUpdates));
  const elapsed = Date.now() - startTime;
  if (elapsed < 600) await new Promise((resolve) => setTimeout(resolve, 600 - elapsed));

  if (!result.success) {
    resetEngine();
    saveBtn.dataset.isSaving = 'false';
    await MKPModal.alert({ title: '保存失败', msg: result.error || '写入失败。', type: 'error' });
    return false;
  }

  const nextPresetData = unflattenObject(flatUpdates);
  if (typeof window.updatePresetCacheSnapshot === 'function') {
    window.updatePresetCacheSnapshot(preset.path, nextPresetData);
  } else {
    window.presetCache = {
      path: preset.path,
      data: nextPresetData,
      timestamp: Date.now()
    };
  }
  markActiveParamSnapshotSaved(snapshot);
  if (typeof window.emitActivePresetUpdated === 'function') {
    window.emitActivePresetUpdated({ reason: 'params-save', path: preset.path, forceRefresh: false });
  }
  const checkIcon = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
  resetEngine = setButtonStatus(saveBtn, '118px', '保存成功', checkIcon, 'btn-expand-green');
  setTimeout(() => {
    resetEngine();
    saveBtn.dataset.isSaving = 'false';
  }, 1800);
  return true;
}

async function demoRestoreDefaults() {
  const preset = await loadActivePreset();
  if (!preset?.data) {
    await MKPModal.alert({ title: '提示', msg: '当前没有已应用的预设，无法恢复。', type: 'warning' });
    return;
  }

  const confirmed = await MKPModal.confirm({
    title: '恢复原版参数？',
    msg: '会用当前机型、类型和版本对应的原版预设覆盖当前内容。<br><br>会尽量保留你的显示名称。',
    type: 'warning',
    confirmText: '恢复默认',
    cancelText: '取消'
  });
  if (!confirmed) return;

  const printer = preset.data.printer;
  const type = preset.data.type;
  const version = preset.data.version;
  if (!printer || !type || !version) {
    await MKPModal.alert({ title: '恢复失败', msg: '当前预设缺少 printer/type/version，无法定位原版文件。', type: 'error' });
    return;
  }

  const button = document.getElementById('btn-restore-defaults');
  let resetEngine = () => {};
  if (button) {
    const spinIcon = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    resetEngine = setButtonStatus(button, '110px', '恢复中', spinIcon, 'btn-expand-theme');
  }

  try {
    const defaultFileName = `${printer}_${type}_v${version}.json`;
    let defaultData = null;
    let sourceLabel = '本地原始备份';

    if (window.mkpAPI?.readPresetBackup) {
      const backupResult = await window.mkpAPI.readPresetBackup(preset.path);
      if (backupResult?.success && backupResult.data) {
        defaultData = backupResult.data;
      }
    }

    if (!defaultData) {
      defaultData = await fetchCloudDataWithFallback(defaultFileName);
      sourceLabel = '云端原版文件';
    }

    const result = await window.mkpAPI.overwritePreset(preset.path, defaultData);
    if (!result.success) throw new Error(result.error || '写入原版预设失败。');

    if (typeof window.updatePresetCacheSnapshot === 'function') {
      window.updatePresetCacheSnapshot(preset.path, defaultData);
    } else {
      window.presetCache = {
        path: preset.path,
        data: defaultData,
        timestamp: Date.now()
      };
    }

    const restoredSnapshot = createParamSnapshot(flattenObject(defaultData), collectParamModesFromDom());
    pushParamSnapshotToHistory(restoredSnapshot, { markSaved: true });
    if (!document.getElementById('page-params')?.classList.contains('hidden')) {
      applyParamSnapshotToDom(getActiveParamStore()?.history[getActiveParamStore()?.index], { restoreFocus: false });
    }

    if (typeof window.emitActivePresetUpdated === 'function') {
      window.emitActivePresetUpdated({ reason: 'params-restore-defaults', path: preset.path, forceRefresh: false });
    }
    await renderDynamicParamsPage();
    await MKPModal.alert({ title: '已恢复', msg: `已按${sourceLabel}恢复为 ${defaultFileName} 的初始内容。`, type: 'success' });
  } catch (error) {
    await MKPModal.alert({ title: '恢复失败', msg: error.message, type: 'error' });
  } finally {
    resetEngine();
  }
}

function ensureParamContextMenu() {
  if (document.getElementById('paramEditorContextMenu')) return;

  const menu = document.createElement('div');
  menu.id = 'paramEditorContextMenu';
  menu.className = 'param-context-menu hidden';
  menu.innerHTML = PARAM_MENU_ACTIONS.map((item) => (
    `<button type="button" class="param-context-item" data-action="${item.id}">${item.label}</button>`
  )).join('');
  document.body.appendChild(menu);

  menu.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !paramContextMenuState.target) return;
    const action = button.getAttribute('data-action');
    const target = paramContextMenuState.target;
    hideContextMenus();
    await runParamContextAction(target, action);
  });
}

function ensureGcodeLineContextMenu() {
  if (document.getElementById('gcodeLineContextMenu')) return;

  const menu = document.createElement('div');
  menu.id = 'gcodeLineContextMenu';
  menu.className = 'param-context-menu hidden';
  menu.innerHTML = GCODE_LINE_MENU_ACTIONS.map((item) => (
    `<button type="button" class="param-context-item" data-gcode-action="${item.id}">${item.label}</button>`
  )).join('');
  document.body.appendChild(menu);

  menu.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-gcode-action]');
    if (!button || !gcodeLineContextMenuState.row || !gcodeLineContextMenuState.editor) return;
    const action = button.getAttribute('data-gcode-action');
    const { row, editor } = gcodeLineContextMenuState;
    hideContextMenus();
    await runGcodeLineAction(editor, row, action);
  });
}

function hideContextMenus(options = {}) {
  const paramMenu = document.getElementById('paramEditorContextMenu');
  const gcodeMenu = document.getElementById('gcodeLineContextMenu');
  if (paramMenu) {
    if (typeof window.hideFloatingSurface === 'function') window.hideFloatingSurface(paramMenu, options);
    else paramMenu.classList.add('hidden');
  }
  if (gcodeMenu) {
    if (typeof window.hideFloatingSurface === 'function') window.hideFloatingSurface(gcodeMenu, options);
    else gcodeMenu.classList.add('hidden');
  }
  paramContextMenuState.target = null;
  gcodeLineContextMenuState.row = null;
  gcodeLineContextMenuState.editor = null;
}

function showMenu(menuId, x, y) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  if (typeof window.positionFloatingMenu === 'function') {
    window.positionFloatingMenu(menu, x, y, { keepVisible: true, margin: 12, minWidth: 160 });
  } else {
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }
  if (typeof window.showFloatingSurface === 'function') {
    window.showFloatingSurface(menu);
  } else {
    menu.classList.remove('hidden');
  }
}

function runNativeEditCommand(target, command, value = null) {
  target.focus();
  try {
    return document.execCommand(command, false, value);
  } catch (error) {
    return false;
  }
}

function replaceSelectionWithUndo(target, text) {
  if (runNativeEditCommand(target, 'insertText', text)) return;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? start;
  target.setRangeText(text, start, end, 'end');
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

function deleteSelectionWithUndo(target) {
  if (runNativeEditCommand(target, 'delete')) return;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? start;
  if (start === end) return;
  target.setRangeText('', start, end, 'end');
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
}

async function readClipboardTextSafe() {
  try {
    if (navigator.clipboard) {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string') return text;
    }
  } catch (error) {}
  return copiedGcodeLineText || '';
}

async function runParamContextAction(target, action) {
  target.focus();

  if (action === 'undo') return void runNativeEditCommand(target, 'undo');
  if (action === 'delete') return void deleteSelectionWithUndo(target);

  if (action === 'copy') {
    const selected = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
    copiedGcodeLineText = selected;
    if (!runNativeEditCommand(target, 'copy') && selected) await copyToClipboard(selected);
    return;
  }

  if (action === 'cut') {
    const selected = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
    copiedGcodeLineText = selected;
    if (!runNativeEditCommand(target, 'cut')) {
      if (selected) await copyToClipboard(selected);
      deleteSelectionWithUndo(target);
    }
    return;
  }

  if (action === 'paste') {
    if (runNativeEditCommand(target, 'paste')) return;
    replaceSelectionWithUndo(target, await readClipboardTextSafe());
  }
}

function createGcodeRowElement(line) {
  const row = document.createElement('div');
  row.className = 'gcode-line-row';
  row.innerHTML = `
    <div class="gcode-line-meta" title="右键可插入、复制、粘贴或删除这一行">
      <span class="gcode-line-number"></span>
      <span class="gcode-line-kind"></span>
    </div>
    <input type="text" value="${escapeParamHtml(line)}" class="param-editable gcode-line-input" data-gcode-line>
  `;
  return row;
}

function insertGcodeRow(editor, referenceRow, position, text = '') {
  const row = createGcodeRowElement(text);
  if (!referenceRow) editor.appendChild(row);
  else if (position === 'before') editor.insertBefore(row, referenceRow);
  else editor.insertBefore(row, referenceRow.nextSibling);
  renumberGcodeRows(editor);
  row.querySelector('[data-gcode-line]').focus();
  return row;
}

async function runGcodeLineAction(editor, row, action) {
  const input = row.querySelector('[data-gcode-line]');
  const cardShell = editor.closest('[data-gcode-mode]');
  const jsonKey = cardShell?.getAttribute('data-json-key');
  if (!input) return;

  if (action === 'insertAbove') {
    const newRow = insertGcodeRow(editor, row, 'before', '');
    if (cardShell) rememberGcodeHistory(cardShell);
    rememberParamSnapshot({
      force: true,
      explicitFocus: jsonKey ? {
        type: 'gcode-line',
        key: jsonKey,
        lineIndex: Number(newRow?.dataset.lineIndex || row.dataset.lineIndex || 0),
        start: 0,
        end: 0
      } : null
    });
    return;
  }
  if (action === 'insertBelow') {
    const newRow = insertGcodeRow(editor, row, 'after', '');
    if (cardShell) rememberGcodeHistory(cardShell);
    rememberParamSnapshot({
      force: true,
      explicitFocus: jsonKey ? {
        type: 'gcode-line',
        key: jsonKey,
        lineIndex: Number(newRow?.dataset.lineIndex || row.dataset.lineIndex || 0),
        start: 0,
        end: 0
      } : null
    });
    return;
  }

  if (action === 'copyLine') {
    copiedGcodeLineText = input.value;
    await copyToClipboard(input.value);
    return;
  }

  if (action === 'pasteLine') {
    input.value = await readClipboardTextSafe();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    renumberGcodeRows(editor);
    if (cardShell) rememberGcodeHistory(cardShell);
    rememberParamSnapshot({
      force: true,
      explicitFocus: jsonKey ? {
        type: 'gcode-line',
        key: jsonKey,
        lineIndex: Number(row.dataset.lineIndex || 0),
        start: 0,
        end: input.value.length
      } : null
    });
    return;
  }

  if (action === 'deleteLine') {
    const fallbackLineIndex = Math.max(0, Number(row.dataset.lineIndex || 0) - 1);
    if (editor.querySelectorAll('.gcode-line-row').length === 1) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      row.remove();
      renumberGcodeRows(editor);
    }
    if (cardShell) rememberGcodeHistory(cardShell);
    rememberParamSnapshot({
      force: true,
      explicitFocus: jsonKey ? {
        type: 'gcode-line',
        key: jsonKey,
        lineIndex: Math.min(fallbackLineIndex, Math.max(0, editor.querySelectorAll('.gcode-line-row').length - 1)),
        start: 0,
        end: 0
      } : null
    });
  }
}

async function canNavigateAwayFromParams(nextPage) {
  const paramsPage = document.getElementById('page-params');
  const store = getActiveParamStore();
  if (!paramsPage || paramsPage.classList.contains('hidden') || nextPage === 'params' || !store?.dirty) {
    return true;
  }

  const confirmedSave = await MKPModal.confirm({
    title: '当前参数未保存',
    msg: '检测到当前预设有未保存修改。是否先保存后再切换页面？',
    type: 'warning',
    confirmText: '保存并切换',
    cancelText: '直接切换'
  });

  if (!confirmedSave) {
    discardActiveParamChanges();
    return true;
  }
  return await saveAllDynamicParams({ skipConfirm: true });
}

function bindParamEditors() {
  ensureParamContextMenu();
  ensureGcodeLineContextMenu();
  if (window._paramEditorsBound) return;
  window._paramEditorsBound = true;

  document.addEventListener('contextmenu', (event) => {
    const gcodeHandle = event.target.closest('.gcode-line-meta');
    const gcodeRow = event.target.closest('.gcode-line-row');
    const gcodeEditor = event.target.closest('[data-gcode-structured]');
    if (gcodeHandle && gcodeRow && gcodeEditor) {
      event.preventDefault();
      hideContextMenus();
      gcodeLineContextMenuState.row = gcodeRow;
      gcodeLineContextMenuState.editor = gcodeEditor;
      showMenu('gcodeLineContextMenu', event.clientX, event.clientY);
      return;
    }

    const target = event.target.closest('.param-editable');
    if (!target) {
      hideContextMenus({ immediate: true });
      return;
    }

    event.preventDefault();
    hideContextMenus({ immediate: true });
    paramContextMenuState.target = target;
    showMenu('paramEditorContextMenu', event.clientX, event.clientY);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#paramEditorContextMenu') && !event.target.closest('#gcodeLineContextMenu')) {
      hideContextMenus({ immediate: true });
    }
  });

  const handleParamKeydown = (event) => {
    if (event.key === 'Escape') hideContextMenus();

    const isSave = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's';
    const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    const isRedo = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'));
    const paramsPage = document.getElementById('page-params');
    const isParamsVisible = paramsPage && !paramsPage.classList.contains('hidden');
    const modalVisible = !document.getElementById('mkp-global-modal')?.classList.contains('pointer-events-none');
    if (!isParamsVisible || modalVisible) return;
    if (isSave) {
      event.preventDefault();
      saveAllDynamicParams({ skipConfirm: true });
      return;
    }

    if (!isUndo && !isRedo) return;
    event.preventDefault();
    void stepParamHistory(isUndo ? -1 : 1, { restoreFocus: false });
  };

  window.addEventListener('keydown', handleParamKeydown, true);

  document.addEventListener('input', (event) => {
    const lineInput = event.target.closest('[data-gcode-line]');
    if (lineInput) {
      const row = lineInput.closest('.gcode-line-row');
      const kind = row?.querySelector('.gcode-line-kind');
      const cardShell = lineInput.closest('[data-gcode-mode]');
      if (kind) kind.textContent = getGcodeLineHint(lineInput.value);
      if (cardShell) rememberGcodeHistory(cardShell);
      rememberParamSnapshot();
      return;
    }

    const rawInput = event.target.closest('[data-gcode-raw]');
    if (rawInput) {
      const shell = rawInput.closest('[data-gcode-mode]');
      if (shell?.dataset.gcodeMode === 'structured') syncRawToStructured(shell, { resetHistory: true });
      rememberParamSnapshot();
      return;
    }

    const editable = event.target.closest('.dynamic-param-input[data-json-key]');
    if (editable) {
      rememberParamSnapshot();
    }
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.dynamic-param-input[type="checkbox"]');
    const status = checkbox?.closest('.param-row-toggle')?.querySelector('.param-switch-status');
    if (status) status.textContent = checkbox.checked ? '已开启' : '已关闭';
    if (checkbox) updateParamDirtyState();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindParamEditors();
});

window.getActivePresetPath = getActivePresetPath;
window.loadActivePreset = loadActivePreset;
window.renderDynamicParamsPage = renderDynamicParamsPage;
window.saveAllDynamicParams = saveAllDynamicParams;
window.demoRestoreDefaults = demoRestoreDefaults;
window.toggleGcodeMode = toggleGcodeMode;
window.canNavigateAwayFromParams = canNavigateAwayFromParams;
