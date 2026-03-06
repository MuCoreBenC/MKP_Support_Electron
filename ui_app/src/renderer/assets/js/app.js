// ==========================================
// 全局日志管理器 (Logger)
// ==========================================
const Logger = {
  _format(level, msg, data) {
    const dataStr = data ? ' | 附加数据: ' + JSON.stringify(data) : '';
    const logStr = `[${level}] ${msg}${dataStr}`;
    
    // 1. 打印到浏览器开发者工具控制台
    if (level === 'ERROR') console.error(logStr);
    else if (level === 'WARN') console.warn(logStr);
    else console.log(logStr);

    // 2. 发送到主进程，永久写入本地硬盘
    if (window.mkpAPI && window.mkpAPI.writeLog) {
      window.mkpAPI.writeLog(logStr);
    }
  },
  info: (msg, data) => Logger._format('INFO', msg, data),
  warn: (msg, data) => Logger._format('WARN', msg, data),
  error: (msg, data) => Logger._format('ERROR', msg, data)
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
const INITIAL_DISPLAY_COUNT = 3;
let sidebarCollapsed = false;
let appliedReleases = {}; // 记录每个机型应用的版本 (例如：{ 'a1_standard': 'v1.5' })

// 在线预设独立缓存体系
let cachedOnlineReleases = null; 

// Z轴与XY轴全局偏移记录
let currentZOffset = 0; 
let currentXOffset = 0;
let currentYOffset = 0;

// ==========================================
// 2. 底层工具与配置服务
// ==========================================
// 极其强壮的前端版本号对比工具 (防格式报错)
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
  } catch (e) {
    return 0;
  }
}

// 对象扁平化工具 (把层级深的 JSON 拍扁)
function flattenObject(ob) {
  var toReturn = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    if ((typeof ob[i]) == 'object' && ob[i] !== null && !Array.isArray(ob[i])) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

// 逆向还原工具 (把拍扁的键值对重新组装成 JSON 对象)
function unflattenObject(ob) {
  var result = {};
  for (var i in ob) {
    var keys = i.split('.');
    keys.reduce(function(r, e, j) {
      return r[e] || (r[e] = isNaN(Number(keys[j + 1])) ? (keys.length - 1 === j ? ob[i] : {}) : []), r[e];
    }, result);
  }
  return result;
}

function saveUserConfig() {
  const config = {
    brand: selectedBrand,
    printer: selectedPrinter,
    version: selectedVersion,
    appliedReleases: appliedReleases 
  };
  localStorage.setItem('mkp_user_config', JSON.stringify(config));
}

function loadUserConfig() {
  try {
    const saved = localStorage.getItem('mkp_user_config');
    if (saved) {
      const config = JSON.parse(saved);
      if (config.brand) selectedBrand = config.brand;
      if (config.printer) selectedPrinter = config.printer;
      if (config.version) selectedVersion = config.version;
      if (config.appliedReleases) appliedReleases = config.appliedReleases; 
    }
  } catch (e) {
    console.error("加载配置文件失败", e);
  }
}

function getPrinterObj(printerId) {
  for (const brandId in printersByBrand) {
    const p = printersByBrand[brandId].find(p => p.id === printerId);
    if (p) return p;
  }
  return null;
}

// ==========================================
// 3. 更新引擎与网络拉取
// ==========================================
const UPDATE_CONFIG = {
  app: {
    manifestUrl: 'http://localhost:3000/app_manifest.json', 
    getLocalVersion: () => '0.1.1', 
    cooldownMinutes: 5 
  },
  preset: {
    manifestUrl: 'http://localhost:3000/presets_manifest.json',
    getLocalVersion: (presetId) => {
      const localPresets = JSON.parse(localStorage.getItem('mkp_local_presets') || '{}');
      return localPresets[presetId] || '0.0.0'; 
    },
    cooldownMinutes: 5 
  }
};

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
          Logger.info(`[更新引擎] 使用缓存的 ${type} 清单 (距上次更新 ${diffMinutes.toFixed(1)} 分钟)`);
        } catch(e) {
          Logger.warn(`[更新引擎] 缓存读取失败，准备重新拉取`);
        }
      }
    }
  }

  if (!cloudData) {
    try {
      Logger.info(`[更新引擎] 正在从云端拉取最新 ${type} 清单...`);
      const response = await fetch(config.manifestUrl);
      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
      cloudData = await response.json();

      localStorage.setItem(cacheKey, JSON.stringify(cloudData));
      localStorage.setItem(lastCheckKey, Date.now().toString());
      Logger.info(`[更新引擎] ${type} 清单拉取成功，已更新本地缓存`);
    } catch (error) {
      Logger.error(`[更新引擎] 网络请求失败:`, error.message);
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
         cloudData = JSON.parse(cachedStr);
         usedCache = true;
         Logger.info(`[更新引擎] 无网络，降级使用过期缓存清单`);
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

async function fetchCloudPresets(printerId, versionType) {
  try {
    const manifestUrl = `http://localhost:3000/presets_manifest.json?t=${Date.now()}`;
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`HTTP 错误: ${response.status}`);
    
    const cloudData = await response.json();
    const allPresets = cloudData.presets || [];
    
    const matchedPresets = allPresets.filter(p => p.id === printerId && (p.type ? p.type === versionType : true));
    matchedPresets.sort((a, b) => compareVersionsFront(b.version, a.version));

  return matchedPresets.map((p, index) => {
    // 1. 获取当前软件定义的版本号 (比如你刚改的 0.1.1)
    const currentAppVer = UPDATE_CONFIG.app.getLocalVersion(); //
    
    // 2. 获取今天的日期 (格式化为 YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    let finalChanges = ['常规优化与参数更新'];
    if (Array.isArray(p.releaseNotes)) {
        finalChanges = p.releaseNotes;
    } else if (typeof p.releaseNotes === 'string') {
        finalChanges = [p.releaseNotes]; 
    } else if (p.description) {
        finalChanges = [p.description];
    }

    return {
      // 如果云端没给版本号，就显示当前软件的版本号
      id: `v${p.version || currentAppVer}`, 
      
      version: p.version || currentAppVer,
      
      // 如果云端没给日期，就显示今天，而不是死板的 2026-03-05
      date: p.lastModified || today, 
      
      isLatest: index === 0, 
      fileName: p.file, 
      changes: finalChanges 
    };
  });

  } catch (error) {
    console.error("拉取云端清单失败:", error);
    return []; 
  }
}

async function checkOnlineUpdates() {
  const onlineEmpty = document.getElementById('onlineEmptyState');
  const onlineList = document.getElementById('onlinePresetsList');
  
  const refreshIcon = document.getElementById('refreshIcon');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const checkUpdateText = document.getElementById('checkUpdateText');
  
  if (!selectedPrinter || !selectedVersion) {
    alert("请先选择机型和版本类型");
    return;
  }

  if (refreshIcon) refreshIcon.classList.add('animate-spin');
  if (checkUpdateBtn) checkUpdateBtn.disabled = true;
  if (checkUpdateText) checkUpdateText.textContent = '检查中...';

  onlineEmpty.classList.add('hidden');
  onlineList.classList.remove('hidden');
  onlineList.classList.add('flex');
  
  onlineList.innerHTML = `
    <div class="p-8 flex flex-col items-center justify-center text-center space-y-3">
      <svg class="w-8 h-8 theme-text animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <div class="text-sm text-gray-500">正在与云端服务器同步...</div>
    </div>
  `;

  try {
    const printerData = getPrinterObj(selectedPrinter);
    const [releases] = await Promise.all([
      fetchCloudPresets(printerData.id, selectedVersion),
      new Promise(resolve => setTimeout(resolve, 600)) 
    ]);

    if (releases.length === 0) {
      onlineList.innerHTML = `<div class="p-8 text-center text-sm text-gray-500">云端暂未发布该版本的预设文件。</div>`;
      return;
    }
    renderListItems(onlineList, releases, printerData, selectedVersion, false);
    
  } catch (error) {
    if (window.Logger) Logger.error("在线预设获取失败:", error);
    onlineList.innerHTML = `<div class="p-8 text-center text-sm text-red-500">连接云端失败，请检查网络设置。</div>`;
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
    if (checkUpdateBtn) checkUpdateBtn.disabled = false;
    if (checkUpdateText) checkUpdateText.textContent = '检查更新';
  }
}

async function checkForUpdates() {
  Logger.info("用户点击了检查更新按钮，强制突破缓存限制");
  const result = await checkUpdateEngine('app', null, true);

  if (!result.success) {
    alert('网络请求失败，请检查网络设置。');
    return;
  }

  if (result.hasUpdate) {
    if (confirm(`发现软件新版本 v${result.cloudVersion}！\n是否立即前往下载？`)) {
      Logger.info('用户同意跳转下载', { url: result.data.downloadUrl });
    }
  } else {
    alert(`当前软件已是最新版本 (v${result.localVersion})！\n\n您使用的是最新版。`);
  }
}

// ==========================================
// 4. 界面渲染引擎：侧边栏、品牌、机型
// ==========================================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('sidebarWrapper');
  sidebarCollapsed = !sidebarCollapsed;
  if (sidebarCollapsed) {
    sidebar.classList.add('sidebar-collapsed');
    wrapper.classList.add('sidebar-wrapper-collapsed');
    wrapper.style.width = '72px';  
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    wrapper.classList.remove('sidebar-wrapper-collapsed');
    wrapper.style.width = '200px'; 
  }
}

function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
  if (!badge) return; 

  if (version === 'standard') {
    badge.textContent = '标准版';
    badge.style.setProperty('background-color', 'var(--theme-standard-bg)', 'important');
    badge.style.setProperty('color', 'var(--theme-standard-text)', 'important');
  } else if (version === 'quick') {
    badge.textContent = '快拆版';
    badge.style.setProperty('background-color', 'var(--theme-quick-bg)', 'important');
    badge.style.setProperty('color', 'var(--theme-quick-text)', 'important');
  } else if (version === 'lite') {
    badge.textContent = 'Lite版';
    badge.style.setProperty('background-color', 'var(--theme-lite-bg)', 'important');
    badge.style.setProperty('color', 'var(--theme-lite-text)', 'important');
  } else {
    badge.textContent = '未选择';
    // 💡 核心修复：未选择时，移除内联样式，让 Tailwind 自带的深灰色完美接管！
    badge.style.removeProperty('background-color');
    badge.style.removeProperty('color');
  }
}

function selectPrinter(printerId, keepVersion = false) {
  if (typeof clearOnlineListUI === 'function') {
    clearOnlineListUI(); 
  }
  selectedPrinter = printerId;
  let selectedPrinterObj = getPrinterObj(printerId);
  
  if (selectedPrinterObj) {
    selectedBrand = brands.find(b => printersByBrand[b.id].some(p => p.id === printerId)).id;
    
    if (!keepVersion) {
        selectedVersion = null; 
    }

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
  selectedBrand = brandId;
  renderBrands();
  renderPrinters(brandId);
  
  const brand = brands.find(b => b.id === brandId);
  if (brand) {
    document.getElementById('currentBrandTitle').textContent = `${brand.name}${brand.subtitle ? ' - ' + brand.subtitle : ''}`;
  }
}

function toggleBrandFavorite(brandId) {
  const brand = brands.find(b => b.id === brandId);
  if (brand) {
    brand.favorite = !brand.favorite;
    renderBrands();
  }
}

function toggleFavorite(event, printerId) {
  event.stopPropagation(); 
  const printers = printersByBrand[selectedBrand] || [];
  const printer = printers.find(p => p.id === printerId);
  if (printer) {
    printer.favorite = !printer.favorite;
    renderPrinters(selectedBrand); 
  }
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
    grid.innerHTML = `
      <div class="col-span-3 py-16 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="text-gray-500 mb-2">暂未支持</div>
        <div class="text-sm text-gray-400">敬请期待</div>
      </div>
    `;
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

function sortPrinters() {
  renderPrinters(selectedBrand);
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
             ${prefixHtml} 
             <span class="truncate text-gray-700 dark:text-gray-200">${mainName}</span> 
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
  
  document.addEventListener('click', () => {
    hideContextMenu();
  });
}

function showContextMenu(x, y) {
  const contextMenu = document.getElementById('contextMenu');
  if(!contextMenu) return;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');
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

async function safeRefreshLocalList() {
  const onlineList = document.getElementById('onlinePresetsList');
  const isOnlineVisible = onlineList && !onlineList.classList.contains('hidden');

  const printerData = getPrinterObj(selectedPrinter);
  await renderPresetList(printerData, selectedVersion);

  if (isOnlineVisible) {
    const newList = document.getElementById('onlinePresetsList');
    const newEmpty = document.getElementById('onlineEmptyState');
    
    if (newEmpty) {
      newEmpty.classList.add('hidden');
      newEmpty.classList.remove('flex');
    }
    if (newList) {
      newList.classList.remove('hidden');
      newList.classList.add('flex');
      
      let parent = newList.parentElement;
      while (parent && parent.id !== 'root' && parent.tagName !== 'BODY') {
        if (parent.classList.contains('hidden')) {
          parent.classList.remove('hidden');
        }
        parent = parent.parentElement;
      }
    }
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

  const versionDetails = {
    standard: { title: '标准版', desc: 'v3原版，适合到手即用追求稳定', iconPath: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z', theme: 'standard' },
    quick: { title: '快拆版', desc: 'v3快拆版，适合自行打印安装', iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z', theme: 'quick' },
    lite: { title: 'Lite版', desc: '适合P系列，及其他CoreXY', iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 12h6', theme: 'lite' }
  };

  availableVersions.forEach(vType => {
    const vInfo = versionDetails[vType];
    if (!vInfo) return;

    const isSelected = currentSelectedVersion === vType;
    const card = document.createElement('div');
    
    // 💡【核心修复】：将原本的 border-blue-500 替换为 theme-border
    card.className = `version-card group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected theme-border' : 'border-gray-200 dark:border-[#333333] hover:border-gray-300 dark:hover:border-[#444]'}`;
    
    card.onclick = () => {
      if (currentSelectedVersion === vType) {
        onSelectCallback(null); 
      } else {
        onSelectCallback(vType);
      }
    };

    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors" style="background: var(--theme-${vInfo.theme}-bg); color: var(--theme-${vInfo.theme}-text)">
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
    selectedVersion = vType; 
    saveUserConfig();
    
    renderDownloadVersions(printerData); 
    updateSidebarVersionBadge(vType); 
    
    clearOnlineListUI();
    renderPresetList(printerData, vType);
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
  
  const releases = await fetchCloudPresets(printerData.id, versionType);
  
  const localData = [];
  for (const release of releases) {
    let exists = false;
    if (window.mkpAPI && window.mkpAPI.checkFileExists) {
      exists = await window.mkpAPI.checkFileExists(release.fileName);
    }
    if (exists) localData.push(release);
  }

  if (localData.length > 0) {
    if(localEmpty) localEmpty.classList.add('hidden');
    if(localList) {
      localList.classList.remove('hidden');
      localList.classList.add('flex');
      renderListItems(localList, localData, printerData, versionType, true);
    }

    const hasApplied = localData.some(r => r.id === appliedReleases[`${printerData.id}_${versionType}`]);
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if (dlBtn && dlHint) {
      if (hasApplied) {
        dlBtn.disabled = false; 
        dlHint.style.opacity = '0';
      } else {
        dlBtn.disabled = true; 
        dlHint.style.opacity = '1';
      }
    }
  } else {
    if(localEmpty) {
      localEmpty.classList.remove('hidden');
      localEmpty.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">本地暂无预设，请点击右上角检查更新并下载</p>`;
    }
    if(localList) {
      localList.classList.add('hidden');
      localList.innerHTML = '';
    }

    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if (dlBtn) dlBtn.disabled = true;
    if (dlHint) dlHint.style.opacity = '1';
  }
}

// ============================================================
// 核心 HTML 生成器 (纯享极简版：支持重复点击应用)
// ============================================================
function renderListItems(container, releases, printerData, versionType, isLocal) {
  container.innerHTML = '';
  const versionNames = { standard: '标准版', quick: '快拆版', lite: 'Lite版' };
  const presetNamePrefix = `${printerData.shortName} ${versionNames[versionType] || ''}`;

  releases.forEach((release) => {
    const isApplied = isLocal && (release.id === appliedReleases[`${printerData.id}_${versionType}`]);
    const item = document.createElement('div');
    
    item.dataset.releaseId = release.id;
    item.className = 'collapse-item transition-all border-b border-gray-100 dark:border-[#333] last:border-b-0 bg-white dark:bg-gray-800';

    let btnText = '下载';
    // 💡【修复Bug】：必须保留 dl-btn 作为事件绑定的锚点
    let btnClass = 'dl-btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#333] dark:border-[#444] dark:text-gray-200 dark:hover:bg-[#444] rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px]';

    if (isLocal) {
      if (isApplied) {
        btnText = '已应用';
        btnClass = 'dl-btn theme-btn-solid cursor-pointer transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm';
      } else {
        btnText = '应用';
        btnClass = 'dl-btn theme-btn-soft cursor-pointer transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium';
      }
    }

    item.innerHTML = `
      <div class="preset-header px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2A2D2E] transition-colors">
        <div class="flex items-center gap-3">
          <span class="text-sm font-bold text-gray-900 dark:text-gray-100">${presetNamePrefix} ${release.id}</span>
          ${release.isLatest ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium theme-bg-soft">最新</span>' : ''}
          ${isApplied ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium theme-btn-solid flex items-center gap-1 shadow-sm"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>' : ''}
          <span class="text-xs text-gray-400 ml-2 hidden sm:inline">发布于 ${release.date}</span>
        </div>
        
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <button class="${btnClass}">
              ${btnText}
            </button>
            
            ${isLocal ? `
            <button class="delete-btn p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="删除本地文件">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            ` : ''}
          </div>
              <svg class="w-5 h-5 text-gray-400 collapse-arrow transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
      </div>
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-4 pt-1">
          <div class="rounded-xl p-4 theme-bg-subtle">
            <div class="flex justify-between items-center mb-2">
                 <div class="text-xs font-medium text-gray-700 dark:text-gray-300">更新日志：</div>
                 <div class="text-[10px] font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-black/20 text-gray-500 dark:text-gray-400">文件: ${release.fileName}</div>
              </div>
              <ul class="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                ${release.changes.map(c => `<li class="flex items-start gap-1.5"><span class="text-gray-300 dark:text-gray-600 mt-0.5">•</span> ${c}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;

    const header = item.querySelector('.preset-header');
    header.addEventListener('click', () => {
      const wrapper = item.querySelector('.collapse-wrapper');
      wrapper.classList.toggle('is-expanded');
      item.classList.toggle('expanded'); 
    });

    const dlBtn = item.querySelector('.dl-btn');
    if(dlBtn) {
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); 
        if (isLocal) {
          // 【核心修复 2】：去掉拦截，永远允许点击，并且把按钮元素本身传过去做动画
          handleApplyLocal(release.id, release.fileName, printerData, dlBtn);
        } else {
          handleDownloadOnline(release.id, release.fileName, dlBtn);
        }
      });
    }

    if (isLocal) {
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); 
          handleDeleteLocal(release.id, release.fileName, e);
        });
      }
    }

    container.appendChild(item);
  });
}

function selectVersion(card, version) {
  selectedVersion = version;
  
  document.querySelectorAll('.version-card').forEach(c => {
    c.classList.remove('selected');
    c.classList.remove('theme-border');
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

function updateVersionListForPrinter() {
  const dateSelect = document.getElementById('dateSelect');
  if(!dateSelect) return;
  if (currentPrinterSupportedVersions.length > 0) {
    dateSelect.disabled = false;
    dateSelect.classList.remove('cursor-not-allowed', 'text-gray-400');
    dateSelect.classList.add('text-gray-900');
  } else {
    dateSelect.disabled = true;
    dateSelect.classList.add('cursor-not-allowed', 'text-gray-400');
    dateSelect.classList.remove('text-gray-900');
  }
}

function renderVersions() {
  const versionList = document.getElementById('versionList');
  if (!versionList) return;
  versionList.innerHTML = '';

  const stableVersion = versions.find(v => v.status === 'RUNNING' || v.status === 'Stable');
  const betaVersion = versions.find(v => v.status === 'Beta');
  const legacyVersions = versions.filter(v => v !== stableVersion && v !== betaVersion);

  const createCard = (version, type) => {
    let badgeClass = 'bg-gray-100 text-gray-800';
    let btnText = '回退';
    let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';

    if (type === 'stable') {
      badgeClass = 'theme-bg-soft';
      btnText = version.current ? '已是最新' : '下载并更新';
      btnClass = 'theme-btn-solid';
    } else if (type === 'beta') {
      badgeClass = 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400';
      btnText = '立即尝鲜';
      btnClass = 'theme-btn-soft';
    }

    return `
      <div class="bg-white dark:bg-[#252526] rounded-xl border border-gray-200 dark:border-[#333] p-5 mb-4 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="px-2.5 py-1 rounded-full text-[10px] font-bold ${badgeClass}">${version.status}</div>
            <div>
              <div class="font-bold text-gray-900 dark:text-gray-100">${version.version}</div>
              <div class="text-[10px] text-gray-400">${version.date}</div>
            </div>
          </div>
          <button class="px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${btnClass}" 
                  ${version.current && type === 'stable' ? 'disabled' : ''}>
            ${btnText}
          </button>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">${version.desc}</p>
        <div class="space-y-1">
          ${version.details.map(detail => `
            <div class="flex items-start gap-2 text-xs text-gray-500">
              <svg class="w-3.5 h-3.5 theme-text mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>${detail}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  if (stableVersion) versionList.innerHTML += createCard(stableVersion, 'stable');
  if (betaVersion) versionList.innerHTML += createCard(betaVersion, 'beta');

  if (legacyVersions.length > 0) {
    const legacyContainer = document.createElement('div');
    legacyContainer.className = 'collapse-item mt-6';
    legacyContainer.innerHTML = `
      <button class="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3" onclick="toggleCollapse(this)">
        <svg class="collapse-arrow w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        <span>查看历史旧版本 (${legacyVersions.length})</span>
      </button>
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          ${legacyVersions.map(v => createCard(v, 'legacy')).join('')}
        </div>
      </div>
    `;
    versionList.appendChild(legacyContainer);
  }
}

function toggleExpandMore() {
  versionsExpanded = !versionsExpanded;
  renderVersions();
}

// ==========================================
// 6. 下载、应用与删除控制器
// ==========================================
async function handleDownloadOnline(releaseId, fileName, btnElement) {
  const originalHtml = btnElement.innerHTML;
  const originalClasses = btnElement.className;

  btnElement.disabled = true;
  btnElement.innerHTML = `
    <svg class="w-4 h-4 animate-spin theme-text mr-1 inline" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>下载中
  `;

  try {
    const fileUrl = `http://localhost:3000/${fileName}`; 
    const [result] = await Promise.all([
      window.mkpAPI.downloadFile(fileUrl, fileName),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);

    if (result.success) {
      btnElement.className = 'dl-btn px-4 py-1.5 rounded-lg text-xs font-medium transition-all bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      btnElement.innerHTML = `<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>已覆盖本地`;

      const printerData = getPrinterObj(selectedPrinter);
      await renderPresetList(printerData, selectedVersion);

      setTimeout(() => {
        const newCard = document.querySelector(`#localPresetsList [data-release-id="${releaseId}"]`);
        if (newCard) {
          const isDark = document.documentElement.classList.contains('dark');
          
          newCard.style.transition = 'none';
          newCard.style.zIndex = '10'; 
          newCard.style.transform = 'scale(1.01)'; 
          newCard.style.boxShadow = isDark ? '0 8px 20px rgba(0,0,0,0.5)' : '0 8px 20px rgba(0,0,0,0.08)'; 

          // 给卡片背景加一点当前的动态颜色
          newCard.style.backgroundColor = 'rgba(var(--primary-rgb), 0.1)'; 

          requestAnimationFrame(() => {
            setTimeout(() => {
              newCard.style.transition = 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
              newCard.style.backgroundColor = '';
              newCard.style.boxShadow = '';
              newCard.style.transform = 'scale(1)';
              
              setTimeout(() => {
                newCard.style.zIndex = '';
              }, 1200);
            }, 50);
          });
        }
      }, 50);

      setTimeout(() => {
        btnElement.disabled = false;
        btnElement.className = originalClasses;
        btnElement.innerHTML = originalHtml;
      }, 2500);

    } else {
      alert("下载失败: " + result.error);
      btnElement.disabled = false;
      btnElement.innerHTML = originalHtml;
    }
  } catch (error) {
    alert("下载过程中发生异常，请检查网络。");
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
  }
}

// ============================================================
// 极其纯粹的 本地应用 (支持重复点击刷新动画，已修复丢类名Bug)
// ============================================================
function handleApplyLocal(releaseId, fileName, printerData, clickedBtn = null) {
  // 1. 强制覆盖保存应用状态和文件名，彻底解决旧数据导致的路径卡死 Bug
  const currentKey = `${printerData.id}_${selectedVersion}`;
  appliedReleases[currentKey] = releaseId;
  localStorage.setItem(`mkp_current_script_${currentKey}`, fileName);
  saveUserConfig();

  const localContainer = document.getElementById('localPresetsList');
  if (!localContainer) return;

  const cards = localContainer.children;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const isThisCardApplied = (card.dataset.releaseId === releaseId);
    
    // 🚨 核心锚点：靠 .dl-btn 找到按钮
    const btn = card.querySelector('.dl-btn');
    const badgeContainer = card.querySelector('.preset-header .flex.items-center.gap-3');

    if (isThisCardApplied) {
      if (btn) {
        // 判断当前是不是“重新应用”的点击
        const isReapply = (btn.textContent.trim() === '已应用') && (btn === clickedBtn);
        
        // 💡 修复：确保 className 永远包含 'dl-btn' 和 'theme-btn-solid'
        btn.className = 'dl-btn theme-btn-solid cursor-pointer transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium shadow-sm';
        
        if (isReapply) {
          // 【重新应用动画】：转圈 -> 变绿提示 -> 恢复
          btn.innerHTML = `<svg class="w-3.5 h-3.5 mr-1 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>刷新`;
          
          setTimeout(() => {
            btn.innerHTML = `<svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>已应用`;
            // 临时变绿
            btn.style.backgroundColor = '#10B981'; 
            btn.style.color = '#FFFFFF';
            
            setTimeout(() => {
              btn.innerHTML = '已应用';
              // 移除内联样式，恢复到 theme-btn-solid 的全局主题色
              btn.style.backgroundColor = ''; 
              btn.style.color = '';
            }, 1200);
          }, 500);
        } else {
          // 第一次点击应用，瞬间变即可
          btn.innerHTML = '已应用';
        }
      }
      
      // 添加“当前使用”小徽章
      if (badgeContainer) {
        const hasBadge = Array.from(badgeContainer.children).some(el => el.textContent.includes('当前使用'));
        if (!hasBadge) {
          const badgeHtml = `<span class="applied-badge px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 shadow-sm animate-scale-in theme-btn-solid"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>当前使用</span>`;
          badgeContainer.insertAdjacentHTML('beforeend', badgeHtml);
        }
      }
    } else {
      // 剥夺其他卡片的“已应用”状态
      if (btn) {
        btn.innerHTML = '应用';
        // 💡 修复：绝对不能把 'dl-btn' 弄丢了！
        btn.className = 'dl-btn theme-btn-soft cursor-pointer transition-all duration-200 active:scale-95 flex items-center justify-center min-w-[76px] rounded-lg px-4 py-1.5 text-xs font-medium';
      }
      if (badgeContainer) {
        const badges = Array.from(badgeContainer.children);
        for (let j = 0; j < badges.length; j++) {
          if (badges[j].textContent.includes('当前使用')) {
            badges[j].remove();
          }
        }
      }
    }
  }

  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');
  if (dlBtn) dlBtn.disabled = false;
  if (dlHint) dlHint.style.opacity = '0';
}

async function handleDeleteLocal(releaseId, fileName, event) {
  if (event) event.stopPropagation(); 
  const confirmDelete = confirm(`确定要删除本地配置 [${fileName}] 吗？\n删除后可以随时重新从云端下载。`);
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
      alert(`删除失败: ${result.error}`);
    }
  } catch (error) {
    alert(`删除过程中发生错误。`);
  }
}

async function applyPreset(releaseId, isInstalled, fileName) {
  Logger.info(`准备处理预设: ${releaseId}`);
  const result = await checkUpdateEngine('preset', selectedPrinter);

  if (!result || !result.success) {
    alert("获取预设信息失败，请检查网络。");
    return;
  }

  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');
  if(dlBtn) {
    dlBtn.disabled = false;
    dlBtn.innerHTML = `<span>下一步</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>`;
  }
  if(dlHint) dlHint.style.opacity = '0';

  if (result.hasUpdate) {
    Logger.info(`发现新版预设 v${result.cloudVersion}，准备下载`);
    alert(`发现新版 JSON 预设 (v${result.cloudVersion})！\n\n即将去网络请求下载：${fileName}\n\n下载完成后将为您应用此版本。`);
    
    const localPresets = JSON.parse(localStorage.getItem('mkp_local_presets') || '{}');
    localPresets[selectedPrinter] = result.cloudVersion;
    localStorage.setItem('mkp_local_presets', JSON.stringify(localPresets));

  } else if (isInstalled === 'true') {
    Logger.info(`应用了本地已有的配置 v${result.localVersion}`);
    alert(`已成功应用本地配置: ${releaseId}`);
  } else {
    Logger.info(`版本一致 v${result.localVersion}，跳过下载直接应用`);
    alert(`本地已是最新配置 (v${result.localVersion})，无需重复下载！即将为您应用。`);
  }
}

// ==========================================
// 7. 手风琴折叠与 FAQ 系统
// ==========================================
function toggleFaq(button) {
  const item = button.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('is-expanded');
    }
  }
}

function toggleCollapse(element) {
  const item = element.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('is-expanded');
    }
    item.classList.toggle('expanded');
  }
}

function expandCollapse(element) {
  const item = element.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.add('is-expanded');
    }
    item.classList.add('expanded');
  }
}

function collapseCollapse(element) {
  const item = element.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.remove('is-expanded');
    }
    item.classList.remove('expanded');
  }
}

function generateFaqItemHtml(item) {
  return `
    <div class="collapse-item faq-item bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button class="faq-question w-full px-5 py-4 flex items-center justify-between text-left" onclick="toggleFaq(this)">
        <span class="font-medium text-gray-900">${item.question}</span>
        <svg class="collapse-arrow w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-4">
            <div class="text-sm text-gray-600 leading-relaxed space-y-2">
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
    const filtered = faqData.filter(item => 
      item.question.toLowerCase().includes(lowerKeyword) ||
      item.answer.toLowerCase().includes(lowerKeyword)
    );
    
    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-sm">未找到相关问题</p>
          <p class="text-xs text-gray-400 mt-1">请尝试其他关键词</p>
        </div>
      `;
    } else {
      list.innerHTML = filtered.map(item => generateFaqItemHtml(item)).join('');
    }
  }
}

// ==========================================
// 8. 新手引导页 (Wizard) 系统
// ==========================================
function initOnboardingSetting() {
  const showOnboardingCheckbox = document.getElementById('showOnboarding');
  if (showOnboardingCheckbox) {
    const savedSetting = localStorage.getItem('showOnboarding');
    if (savedSetting !== null) {
      showOnboardingCheckbox.checked = savedSetting === 'true';
    }
    showOnboardingCheckbox.addEventListener('change', function() {
      localStorage.setItem('showOnboarding', this.checked);
    });
  }
}

function checkShowOnboarding() {
  const savedSetting = localStorage.getItem('showOnboarding');
  return savedSetting !== 'false';
}

function skipOnboarding() {
  const onboarding = document.getElementById('onboarding');
  if(onboarding) {
    onboarding.classList.add('animate-fade-out');
    setTimeout(() => {
      onboarding.style.display = 'none';
    }, 200);
  }
}

// 【真正的完成引导函数】
function completeOnboarding() {
  // 保存最后选中的向导结果
  selectedBrand = wizardSelectedBrand;
  selectedPrinter = wizardSelectedPrinter;
  selectedVersion = wizardSelectedVersion;
  saveUserConfig(); 
  
  // 触发全局机型切换联动
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
      stepItem.classList.remove('active');
      stepItem.classList.add('completed');
      stepContent.classList.add('hidden');
    } else if (i === step) {
      stepItem.classList.add('active');
      stepItem.classList.remove('completed');
      stepContent.classList.remove('hidden');
    } else {
      stepItem.classList.remove('active', 'completed');
      stepContent.classList.add('hidden');
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
    const versionThemes = {
      standard: { title: '标准版', bg: 'var(--theme-standard-bg)', text: 'var(--theme-standard-text)' },
      quick: { title: '快拆版', bg: 'var(--theme-quick-bg)', text: 'var(--theme-quick-text)' },
      lite: { title: 'Lite版', bg: 'var(--theme-lite-bg)', text: 'var(--theme-lite-text)' }
    };
    const theme = versionThemes[versionType];
    if (theme) {
      versionBadge.textContent = theme.title;
      // 💡 核心修复：用 setProperty 注入 important
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

/*
 * 3. 极简版 updateWizardButtons() - 依赖 CSS 自动接管样式
 */
function updateWizardButtons() {
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  if (!leftBtn || !rightBtn) return;

  if (currentStep === 1) {
    leftBtn.textContent = '跳过引导';
    leftBtn.onclick = skipOnboarding;
    rightBtn.textContent = '下一步';
    
    // 极简控制：只要控制 disabled 属性，CSS会自动接管变灰和禁用！
    rightBtn.disabled = !wizardSelectedPrinter;
    rightBtn.onclick = rightBtn.disabled ? null : () => goToStep(2);
    
  } else if (currentStep === 2) {
    leftBtn.textContent = '上一步';
    leftBtn.onclick = () => goToStep(1);
    rightBtn.textContent = '下一步';
    
    rightBtn.disabled = !wizardSelectedVersion;
    rightBtn.onclick = rightBtn.disabled ? null : () => goToStep(3);
    
  } else if (currentStep === 3) {
    leftBtn.textContent = '上一步';
    leftBtn.onclick = () => goToStep(2);
    rightBtn.textContent = '完成并进入';
    
    rightBtn.disabled = false;
    rightBtn.onclick = completeOnboarding;
  }
}

// ==========================================
// 9. 动态 JSON 参数引擎
// ==========================================
async function getActivePresetPath() {
  const currentKey = `${selectedPrinter}_${selectedVersion}`;
  const fileName = localStorage.getItem(`mkp_current_script_${currentKey}`);
  if (!fileName) return null;
  const userDataPath = await window.mkpAPI.getUserDataPath();
  return `${userDataPath}\\${fileName}`;
}

async function loadActivePreset() {
  const path = await getActivePresetPath();
  if (!path) return null;
  const result = await window.mkpAPI.readPreset(path);
  if (result.success) return { path, data: result.data };
  return null;
}

async function renderDynamicParamsPage() {
  const container = document.getElementById('dynamicParamsContainer');
  if (!container) return;
  
  container.innerHTML = `<div class="col-span-2 py-10 text-center text-gray-500"><svg class="w-8 h-8 animate-spin mx-auto theme-text mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>正在读取 JSON 预设文件...</div>`;

  const preset = await loadActivePreset();
  if (!preset) {
    container.innerHTML = '<div class="col-span-2 py-10 text-center text-gray-500">当前没有应用的预设。请先在【下载预设】页面应用一个本地配置。</div>';
    return;
  }

  const fileName = preset.path.split('\\').pop();
  document.getElementById('currentEditingFile').textContent = fileName;

  const flatData = flattenObject(preset.data);
  let html = '';

  for (const key in flatData) {
    let val = flatData[key];
    if (Array.isArray(val) || typeof val === 'object') {
       val = JSON.stringify(val);
    }
    html += `
      <div class="bg-gray-50 dark:bg-[#1E1E1E] rounded-xl p-3 border border-gray-100 dark:border-[#333] flex flex-col justify-center">
        <label class="text-xs text-gray-500 block mb-1.5 break-all font-mono">${key}</label>
        <input type="text" data-json-key="${key}" value='${val}' class="dynamic-param-input input-field theme-ring w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#444] transition-all">
      </div>
    `;
  }
  container.innerHTML = html;
}

async function saveAllDynamicParams() {
  const preset = await loadActivePreset();
  if (!preset) return;

  const saveBtn = document.getElementById('saveParamsBtn');
  saveBtn.innerHTML = '保存中...';

  const inputs = document.querySelectorAll('.dynamic-param-input');
  const flatUpdates = {};
  
  inputs.forEach(input => {
     const key = input.getAttribute('data-json-key');
     let val = input.value;
     
     if (!isNaN(val) && val.trim() !== '') {
        val = Number(val);
     } else if (val === 'true') {
        val = true;
     } else if (val === 'false') {
        val = false;
     } else if (val.startsWith('[') || val.startsWith('{')) {
        try { val = JSON.parse(val); } catch(e){}
     }
     flatUpdates[key] = val;
  });

  const nestedUpdates = unflattenObject(flatUpdates);
  const result = await window.mkpAPI.writePreset(preset.path, nestedUpdates);
  
  if(result.success) {
    saveBtn.innerHTML = `<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>保存成功`;
    saveBtn.style.backgroundColor = '#10B981';
    setTimeout(() => {
      saveBtn.innerHTML = '保存所有修改';
      saveBtn.style.backgroundColor = '';
    }, 2000);
  } else {
    alert("保存失败: " + result.error);
    saveBtn.innerHTML = '保存所有修改';
  }
}

// ==========================================
// 10. 校准与脚本路径功能
// ==========================================
async function updateScriptPathDisplay() {
  const scriptInput = document.getElementById('scriptPath');
  const copyBtn = document.getElementById('scriptCopyBtn');
  if (!scriptInput) return;

  try {
    const presetPath = await getActivePresetPath();
    if (!presetPath) {
      scriptInput.value = "请先在【下载预设】页面应用一个配置！";
      
      // ❌ 失败/警告状态：移除正常文字的灰色，加上纯正的主题色和加粗
      scriptInput.classList.remove('text-gray-500', 'dark:text-gray-400');
      scriptInput.classList.add('theme-text', 'font-bold'); 
      
      if (copyBtn) copyBtn.disabled = true;
      return;
    }

    const exePath = await window.mkpAPI.getExePath();
    const command = `"${exePath}" --Json "${presetPath}" --Gcode`;
    
    scriptInput.value = command;
    
    // ✅ 成功状态 (你觉得纯白太亮)：移除警告色，换成柔和的暗灰色 (白天500，夜间400)
    scriptInput.classList.remove('theme-text', 'font-bold', 'text-red-500');
    scriptInput.classList.add('text-gray-500', 'dark:text-gray-400'); 
    
    if (copyBtn) copyBtn.disabled = false;
    
  } catch (e) {
    console.error("生成脚本路径失败:", e);
    scriptInput.value = "生成路径时发生错误";
    
    // 💥 报错状态：变成红色
    scriptInput.classList.remove('text-gray-500', 'dark:text-gray-400', 'theme-text');
    scriptInput.classList.add('text-red-500', 'font-bold');
  }
}


function copyPath() {
  const scriptPath = document.getElementById('scriptPath');
  scriptPath.select();
  document.execCommand('copy');
  
  const copyBtn = document.getElementById('scriptCopyBtn');
  copyBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
  copyBtn.title = '已复制';
  
  setTimeout(() => {
    copyBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>`;
    copyBtn.title = '复制路径';
  }, 2000);
}

function manualSelectPath() {
  alert('请选择Bambu Studio安装路径');
}

async function openZModel() {
  const zProgress = document.getElementById('zProgress');
  const zPlaceholder = document.getElementById('zPlaceholder');
  const zGridSelector = document.getElementById('zGridSelector');
  
  const preset = await loadActivePreset();
  if (preset && preset.data.z_offset !== undefined) {
    currentZOffset = parseFloat(preset.data.z_offset) || 0;
  }
  document.getElementById('zOriginal').textContent = currentZOffset.toFixed(2);
  document.getElementById('zNewValue').textContent = currentZOffset.toFixed(2);
  
  zProgress.classList.remove('hidden');
  zPlaceholder.classList.add('hidden');
  
  try {
    const hasOpened = localStorage.getItem('hasOpenedModelBefore');
    const forceOpenWith = !hasOpened;
    const result = await window.mkpAPI.openCalibrationModel('Z', forceOpenWith);
    
    if (result.success) {
      if (forceOpenWith) localStorage.setItem('hasOpenedModelBefore', 'true');
      zProgress.classList.add('hidden');
      zGridSelector.classList.remove('hidden');
      generateZGrid();
    } else {
      alert('打开模型失败: ' + result.error);
      zProgress.classList.add('hidden');
      zPlaceholder.classList.remove('hidden');
    }
  } catch (error) {
    console.error("打开模型时发生严重底层错误:", error);
    alert('打开模型失败，请按 Ctrl+Shift+I 截图控制台红字发给开发者。');
    zProgress.classList.add('hidden');
    zPlaceholder.classList.remove('hidden');
  }
}

function generateZGrid() {
  const zGrid = document.getElementById('zGrid');
  zGrid.innerHTML = '';
  
  const offsets = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
  offsets.forEach(offset => {
    const gridItem = document.createElement('div');
    gridItem.className = 'w-12 h-12 border border-gray-200 dark:border-[#444] flex items-center justify-center cursor-pointer transition-colors';
    gridItem.textContent = offset.toFixed(1);
    gridItem.onclick = () => selectZOffset(offset);
    zGrid.appendChild(gridItem);
  });
}

function selectZOffset(offset) {
  const zBadge = document.getElementById('zBadge');
  const zNewValue = document.getElementById('zNewValue');
  const newValue = currentZOffset + offset; 
  
  zBadge.textContent = offset >= 0 ? `+${offset.toFixed(2)}` : offset.toFixed(2);
  zBadge.classList.remove('hidden');
  zNewValue.textContent = newValue.toFixed(2);
}

async function saveZOffset() {
  const newValueStr = document.getElementById('zNewValue').textContent;
  const newZ = parseFloat(newValueStr);
  const preset = await loadActivePreset();
  if (!preset) return alert("请先在下载页面应用一个预设！");
  
  const result = await window.mkpAPI.writePreset(preset.path, { z_offset: newZ });
  if (result.success) {
    alert('Z轴偏移已永久保存至当前预设！');
    currentZOffset = newZ;
    document.getElementById('zOriginal').textContent = currentZOffset.toFixed(2);
  } else {
    alert('保存失败: ' + result.error);
  }
}

async function openXYModel() {
  const xyProgress = document.getElementById('xyProgress');
  const xyPlaceholder = document.getElementById('xyPlaceholder');
  const xyGridSelector = document.getElementById('xyGridSelector');
  
  xyProgress.classList.remove('hidden');
  xyPlaceholder.classList.add('hidden');
  
  try {
    const result = await window.mkpAPI.openCalibrationModel('XY', !localStorage.getItem('hasOpenedModelBefore'));
    if (result.success) {
      localStorage.setItem('hasOpenedModelBefore', 'true');
      xyProgress.classList.add('hidden');
      xyGridSelector.classList.remove('hidden');
      generateXYGrid();
    } else {
      alert('打开模型失败: ' + result.error);
      xyProgress.classList.add('hidden');
      xyPlaceholder.classList.remove('hidden');
    }
  } catch (error) {
    alert('打开模型时发生严重底层错误');
    xyProgress.classList.add('hidden');
    xyPlaceholder.classList.remove('hidden');
  }
}

function generateXYGrid() {
  const xyGrid = document.getElementById('xyGrid');
  xyGrid.innerHTML = '';
  for (let y = -2; y <= 2; y++) {
    const row = document.createElement('div');
    row.className = 'flex';
    for (let x = -2; x <= 2; x++) {
      const gridItem = document.createElement('div');
      gridItem.className = 'w-16 h-16 border border-gray-200 dark:border-[#444] flex items-center justify-center cursor-pointer transition-colors';
      gridItem.textContent = `${x},${y}`;
      gridItem.onclick = () => selectXYOffset(x, y);
      row.appendChild(gridItem);
    }
    xyGrid.appendChild(row);
  }
}

function selectXYOffset(x, y) {
  alert(`XY轴偏移已选择: X${x}, Y${y}`);
}

function saveXYOffset() {
  alert('XY轴偏移已保存');
}

// ==========================================
// 11. 页面导航与初始化
// ==========================================
function bindNavigation() {
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

async function init() {
  Logger.info("=== 软件启动，开始初始化 ===");
  const currentAppVersion = UPDATE_CONFIG.app.getLocalVersion();
  document.title = `支撑面改善工具 (MKP Support) v${currentAppVersion}`;
  try {
    if (window.mkpAPI && window.mkpAPI.initDefaultPresets) {
      await window.mkpAPI.initDefaultPresets();
      Logger.info("底层默认预设 JSON 检查/释放完成");
    }
  } catch (error) {
    Logger.error("初始化预设失败，但不影响界面加载:", error);
  }
  
  loadUserConfig(); 
  
  renderBrands();
  if (selectedPrinter) {
    selectPrinter(selectedPrinter, true); 
    Logger.info("自动加载了上次记忆的机型", { printer: selectedPrinter });
  }
  
  renderVersions();
  bindNavigation();
  bindContextMenu();
  renderWizardBrands();
  filterFaq('');
  
  if (typeof initTheme === 'function') initTheme();
  if (typeof initSystemThemeListener === 'function') initSystemThemeListener();
  if (typeof initOnboardingSetting === 'function') initOnboardingSetting();

  if (typeof checkShowOnboarding === 'function' && !checkShowOnboarding()) {
    Logger.info("用户设置了关闭引导页，直接跳过");
    skipOnboarding();
  } else {
    Logger.info("进入新手引导页面");
  }
}

document.addEventListener('DOMContentLoaded', init);

// ==========================================
// 开发者辅助小工具：实时显示窗口分辨率
// ==========================================
const sizeIndicator = document.createElement('div');
sizeIndicator.style.cssText = 'position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.7); color:white; padding:4px 8px; border-radius:4px; z-index:99999; font-size:12px; font-family:monospace; pointer-events:none; transition:all 0.1s;';
document.body.appendChild(sizeIndicator);

function updateDevSize() {
  sizeIndicator.textContent = `${window.innerWidth} x ${window.innerHeight}`;
  if (window.innerWidth <= 1000) {
    sizeIndicator.style.background = 'rgba(239, 68, 68, 0.9)'; 
  } else if (window.innerWidth <= 1366) {
    sizeIndicator.style.background = 'rgba(245, 158, 11, 0.9)'; 
  } else {
    sizeIndicator.style.background = 'rgba(0, 0, 0, 0.7)'; 
  }
}

window.addEventListener('resize', updateDevSize);
updateDevSize();