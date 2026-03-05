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


// 状态管理
let selectedVersion = null;
let selectedDate = null;
let selectedPrinter = 'a1';
let selectedBrand = 'bambu';
let currentPrinterSupportedVersions = ['standard', 'quick'];
let contextMenuTarget = null;
let currentStep = 1;
let wizardSelectedBrand = 'bambu';
let wizardSelectedPrinter = null;
let versionsExpanded = false;
const INITIAL_DISPLAY_COUNT = 3;
let sidebarCollapsed = false;




// ============================================================
// 底层服务：统一更新检查引擎 (带冷却防刷机制)
// ==========================================


// ==========================================
// Node.js 端的版本对比工具 (绝对靠谱的版本号对比)
// ==========================================
function compareVersions(v1, v2) {
  const a = (v1 || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const b = (v2 || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;  // v1 新
    if (num1 < num2) return -1; // v2 新
  }
  return 0; // 一样
}

// ==========================================
// 底层服务：统一更新检查引擎 (缓存驱动版)
// ==========================================

const UPDATE_CONFIG = {
  app: {
    manifestUrl: 'http://localhost:3000/app_manifest.json', 
    getLocalVersion: () => '1.0.0', 
    cooldownMinutes: 5 // 统一 5 分钟缓存有效期
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

/**
 * 核心引擎
 * @param {string} type - 'app' 或 'preset'
 * @param {string} targetId - 机型ID (如 'a1')
 * @param {boolean} forceCheck - 是否无视缓存，强制请求云端？
 */
async function checkUpdateEngine(type, targetId = null, forceCheck = false) {
  const config = UPDATE_CONFIG[type];
  if (!config) throw new Error(`未知的更新类型: ${type}`);

  const lastCheckKey = `mkp_last_check_${type}`;
  const cacheKey = `mkp_manifest_cache_${type}`;
  const lastCheckTime = localStorage.getItem(lastCheckKey);

  let cloudData = null;
  let usedCache = false;

  // 1. 尝试使用本地缓存 (如果不强制刷新，且在5分钟有效期内)
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

  // 2. 如果没有缓存，或者缓存过期，或者用户强制要求，则去云端拉取
  if (!cloudData) {
    try {
      Logger.info(`[更新引擎] 正在从云端拉取最新 ${type} 清单...`);
      const response = await fetch(config.manifestUrl);
      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
      cloudData = await response.json();

      // 拉取成功，写入缓存并更新时间戳
      localStorage.setItem(cacheKey, JSON.stringify(cloudData));
      localStorage.setItem(lastCheckKey, Date.now().toString());
      Logger.info(`[更新引擎] ${type} 清单拉取成功，已更新本地缓存`);
    } catch (error) {
      Logger.error(`[更新引擎] 网络请求失败:`, error.message);
      // 网络断开时的降级处理：死马当活马医，看看有没有旧缓存能用
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

  // 3. 开始版本对比逻辑
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

  const hasUpdate = compareVersions(cloudVersion, localVersion) > 0;

  return { success: true, hasUpdate, localVersion, cloudVersion, data: targetData, usedCache };
}

// ==================== 3. 侧边栏功能 ====================
/*
 * toggleSidebar() - 切换侧边栏折叠/展开状态
 * 
 * 功能说明：
 * 1. 切换sidebarCollapsed状态标志
 * 2. 添加/移除CSS类控制样式变化
 * 3. 修改wrapper的width属性实现宽度动画
 * 
 * 【宽度修改说明】
 * 如需修改侧边栏宽度，请修改以下位置的数值：
 * - 展开宽度：wrapper.style.width = '288px'（第1205行）
 * - 折叠宽度：wrapper.style.width = '72px'（第1202行）
 * 同时需要修改CSS中的.sidebar-wrapper-collapsed和.sidebar-collapsed
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('sidebarWrapper');
  sidebarCollapsed = !sidebarCollapsed;
  if (sidebarCollapsed) {
    sidebar.classList.add('sidebar-collapsed');
    wrapper.classList.add('sidebar-wrapper-collapsed');
    wrapper.style.width = '72px';  // 【折叠宽度】修改这里可改变折叠后的宽度
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    wrapper.classList.remove('sidebar-wrapper-collapsed');
    wrapper.style.width = '200px'; // 【展开宽度】修改这里可改变展开后的宽度
  }
}

/*
 * toggleFaq(button) - 展开/折叠FAQ答案（使用通用折叠方案）
 * @param {HTMLElement} button - 点击的问题按钮
 * 功能：切换答案的显示/隐藏状态，带平滑动画
 */
function toggleFaq(button) {
  const item = button.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('is-expanded');
    }
  }
}

/*
 * toggleCollapse(element) - 通用折叠面板切换函数
 * @param {HTMLElement} element - 触发元素（按钮或头部）
 * 
 * 使用场景：
 * - FAQ 展开/收起
 * - 高级设置面板
 * - 侧边栏子菜单
 * - 任何需要平滑展开/收起的内容
 * 
 * 工作原理：
 * 1. 查找最近的 collapse-item 父容器
 * 2. 切换 collapse-wrapper 的 is-expanded 类
 * 3. CSS 自动处理动画效果
 */
function toggleCollapse(element) {
  const item = element.closest('.collapse-item');
  if (item) {
    const wrapper = item.querySelector('.collapse-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('is-expanded');
    }
    // 同时切换 collapse-item 的 expanded 类（用于箭头旋转）
    item.classList.toggle('expanded');
  }
}

/*
 * expandCollapse(element) - 展开折叠面板
 * @param {HTMLElement} element - 触发元素
 */
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

/*
 * collapseCollapse(element) - 收起折叠面板
 * @param {HTMLElement} element - 触发元素
 */
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

/*
 * generateFaqItemHtml(item) - 生成单个FAQ项HTML
 * @param {Object} item - FAQ数据对象
 * @returns {string} HTML字符串
 */
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

/*
 * filterFaq(keyword) - 过滤FAQ列表
 * @param {string} keyword - 搜索关键词
 * 功能：根据关键词过滤FAQ，匹配问题和答案内容
 */
function filterFaq(keyword) {
  const list = document.getElementById('faqList');
  const lowerKeyword = keyword.toLowerCase().trim();
  
  if (!lowerKeyword) {
    list.innerHTML = faqData.map(item => generateFaqItemHtml(item)).join('');
    return;
  }
  
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

// ==================== 4. 初始化 ====================
/*
 * init() - 页面初始化函数
 * 
 * 功能说明：
 * 在页面加载时调用，初始化各个模块：
 * - 渲染品牌列表
 * - 渲染机型列表
 * - 渲染版本列表
 * - 绑定导航事件
 * - 绑定右键菜单事件
 * - 渲染引导页品牌列表
 * - 更新版本列表显示状态
 * - 初始化引导界面设置
 */


// ==================== 5. 引导页功能 ====================
/*
 * skipOnboarding() - 跳过新手引导
 * 功能：添加淡出动画后隐藏引导页
 */
function skipOnboarding() {
  const onboarding = document.getElementById('onboarding');
  onboarding.classList.add('animate-fade-out');
  setTimeout(() => {
    onboarding.style.display = 'none';
  }, 200);
}

/*
 * goToStep(step) - 跳转步骤并触发变色检查
 */
function goToStep(step) {
  currentStep = step;
  
  // 1. 更新顶部小圆圈和页面内容的显示
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
  
  // 2. 每次切换页面，都去检查一下按钮该灰还是该蓝
  updateWizardButtons();
}

/* ============================================================ 
    引导页动态渲染逻辑升级版 (包含徽章更新与版本过滤) 
    ============================================================ */ 

 // 更新全局徽章栏 (机型名和版本名) 


 // 渲染对应的机型列表，并绑定版本刷新 
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
         wizardSelectedVersion = null; // 切换机型时，强制清空版本 
         
         renderWizardModels(brandId); 
         updateWizardOffsets(printer); 
         updateWizardBadges(printer.name, null); // 更新全局机型名 
         renderWizardVersions(printer); // 核心：根据该机型拥有的版本渲染第二页 
         updateWizardButtons(); // 激活下一步 
       }; 
       modelList.appendChild(modelItem); 
     } 
   }); 
 } 


/*
 * renderWizardBrands() - 渲染引导页品牌列表
 * 功能：在引导页中显示品牌列表，支持选择
 */
function renderWizardBrands() {
  const brandList = document.getElementById('wizardBrandList');
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
  
  // 初始渲染机型列表
  renderWizardModels(wizardSelectedBrand);
}

/*
 * updateWizardOffsets(printer) - 更新引导页偏移参数
 * @param {Object} printer - 打印机对象
 * 功能：显示选中机型的默认偏移参数
 */
function updateWizardOffsets(printer) {
  document.getElementById('wizardXOffset').textContent = printer.xOffset.toFixed(2);
  document.getElementById('wizardYOffset').textContent = printer.yOffset.toFixed(2);
  document.getElementById('wizardZOffset').textContent = printer.zOffset.toFixed(2);
  
  const selectedModelBadge = document.getElementById('selectedModelBadge');
  selectedModelBadge.textContent = printer.name;
  selectedModelBadge.classList.remove('hidden');
}
/*
 * 1. updateWizardBadges() - 修复：全局徽章栏 (变成侧边栏同款胶囊样式)
 */
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
      // 侧边栏同款样式：应用专属背景色和文字色，没有边框
      versionBadge.style.backgroundColor = theme.bg;
      versionBadge.style.color = theme.text;
      versionBadge.style.borderColor = 'transparent';
      versionBadge.classList.remove('hidden');
    }
  } else {
    if (versionBadge) versionBadge.classList.add('hidden');
  }
}

/*
 * 2. renderWizardVersions() - 修复：精准读取 data.js 中的 supportedVersions
 */
function renderWizardVersions(printerData) {
  const versionList = document.getElementById('wizardVersionList');
  if (!versionList || !printerData) return;
  versionList.innerHTML = '';

  // 严格读取 data.js 中该机型配置的 supportedVersions 数组
  let availableVersions = ['standard']; // 默认兜底
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

    const isSelected = wizardSelectedVersion === vType;
    const card = document.createElement('div');
    card.className = `version-card group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected border-blue-500' : 'border-gray-200 dark:border-[#333333] hover:border-blue-300'}`;
    
    card.onclick = () => {
      wizardSelectedVersion = vType;
      renderWizardVersions(printerData); 
      updateWizardBadges(printerData.name, vType); 
      updateWizardButtons(); // 瞬间激活下一步！
    };

    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors" style="background: var(--theme-${vInfo.theme}-bg); color: var(--theme-${vInfo.theme}-text)">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${vInfo.iconPath}"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold text-gray-900 dark:text-gray-100">${vInfo.title}</span>
          </div>
          <p class="text-xs text-gray-500 truncate">${vInfo.desc}</p>
        </div>
        <div class="check-indicator w-6 h-6 rounded-full border-2 ${isSelected ? 'border-transparent bg-blue-500' : 'border-gray-200 dark:border-[#444]'} flex items-center justify-center flex-shrink-0 transition-all duration-200">
          <svg class="w-4 h-4 text-white ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    `;
    versionList.appendChild(card);
  });
}

/*
 * 3. updateWizardButtons() - 修复：物理级撕毁/添加 disabled 属性，彻底防卡死
 */
function updateWizardButtons() {
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  if (!leftBtn || !rightBtn) return;

  if (currentStep === 1) {
    leftBtn.textContent = '跳过引导';
    leftBtn.onclick = skipOnboarding;
    rightBtn.textContent = '下一步';
    
    if (wizardSelectedPrinter) {
      rightBtn.disabled = false;
      rightBtn.removeAttribute('disabled');
      rightBtn.classList.remove('opacity-50', 'cursor-not-allowed'); // 确保恢复亮蓝色
      rightBtn.onclick = () => goToStep(2);
    } else {
      rightBtn.disabled = true;
      rightBtn.setAttribute('disabled', 'true');
      rightBtn.classList.add('opacity-50', 'cursor-not-allowed'); // 确保变成不可点的灰色
      rightBtn.onclick = null;
    }
  } else if (currentStep === 2) {
    leftBtn.textContent = '上一步';
    leftBtn.onclick = () => goToStep(1);
    rightBtn.textContent = '下一步';
    
    if (wizardSelectedVersion) {
      rightBtn.disabled = false;
      rightBtn.removeAttribute('disabled');
      rightBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      rightBtn.onclick = () => goToStep(3);
    } else {
      rightBtn.disabled = true;
      rightBtn.setAttribute('disabled', 'true');
      rightBtn.classList.add('opacity-50', 'cursor-not-allowed');
      rightBtn.onclick = null;
    }
  } else if (currentStep === 3) {
    leftBtn.textContent = '上一步';
    leftBtn.onclick = () => goToStep(2);
    rightBtn.textContent = '完成并进入';
    rightBtn.disabled = false;
    rightBtn.removeAttribute('disabled');
    rightBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    rightBtn.onclick = completeOnboarding;
  }
}
// ==================== 6. 品牌相关功能 ====================
/*
 * renderBrands() - 渲染品牌列表
 * 功能：在选择机型页面显示品牌列表，支持收藏和选择
 */
function renderBrands() {
  const brandList = document.getElementById('brandList');
  brandList.innerHTML = '';
  
  // 按收藏状态和名称排序
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

/*
 * selectBrand(brandId) - 选择品牌
 * @param {string} brandId - 品牌ID
 * 功能：更新选中品牌状态，重新渲染机型列表
 */
function selectBrand(brandId) {
  selectedBrand = brandId;
  renderBrands();
  renderPrinters(brandId);
  
  // 更新当前品牌标题
  const brand = brands.find(b => b.id === brandId);
  if (brand) {
    document.getElementById('currentBrandTitle').textContent = `${brand.name}${brand.subtitle ? ' - ' + brand.subtitle : ''}`;
  }
}

/*
 * toggleBrandFavorite(brandId) - 切换品牌收藏状态
 * @param {string} brandId - 品牌ID
 * 功能：切换品牌的收藏状态，重新渲染品牌列表
 */
function toggleBrandFavorite(brandId) {
  const brand = brands.find(b => b.id === brandId);
  if (brand) {
    brand.favorite = !brand.favorite;
    renderBrands();
  }
}

// ==================== 7. 机型相关功能 ====================
/*
 * toggleFavorite(event, printerId) - 点击星星直接切换收藏状态
 * @param {Event} event - 点击事件
 * @param {string} printerId - 机型ID
 * 功能：切换机型的收藏状态，阻止触发选中卡片
 */
function toggleFavorite(event, printerId) {
  event.stopPropagation(); // 阻止触发选中卡片
  const printers = printersByBrand[selectedBrand] || [];
  const printer = printers.find(p => p.id === printerId);
  if (printer) {
    printer.favorite = !printer.favorite;
    renderPrinters(selectedBrand); // 重新渲染时会自动置顶
  }
}

/*
 * renderPrinters(brandId) - 渲染机型列表（自带收藏置顶）
 * @param {string} brandId - 品牌ID
 * 功能：根据选择的品牌显示对应的机型卡片，支持收藏置顶
 */
function renderPrinters(brandId) {
  const grid = document.getElementById('printerGrid');
  const rawPrinters = printersByBrand[brandId] || [];
  
  // 核心逻辑：自动将 favorite 为 true 的机型排在最前面
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

/*
 * filterPrinters() - 搜索机型过滤（自带收藏置顶）
 * 功能：根据搜索框输入过滤机型，支持收藏置顶
 */
function filterPrinters() {
  const searchInput = document.getElementById('printerSearch');
  if (!searchInput) return; // 防御性判断，防止找不到搜索框报错
  
  const search = searchInput.value.toLowerCase();
  const rawPrinters = printersByBrand[selectedBrand] || [];
  
  // 过滤结果
  const filtered = rawPrinters.filter(p => p.name.toLowerCase().includes(search));
  
  // 对搜索结果也自动执行收藏置顶
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

/*
 * sortPrinters() - 排序机型列表
 * 功能：根据选择的排序方式排序机型
 */
function sortPrinters() {
  renderPrinters(selectedBrand);
}

/*
 * generatePrinterCardsHtml(array) - 抽离出来的通用卡片生成器
 * @param {Array} array - 打印机数组
 * @returns {string} HTML字符串
 * 功能：生成打印机卡片的HTML代码，支持智能品牌前缀提取
 */
function generatePrinterCardsHtml(array) {
  return array.map(p => {
    // 智能提取公共前缀
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

// 8. 重写：主界面选择机型 (换机型 = 自动清空旧版本并存档)
function selectPrinter(printerId, keepVersion = false) {
  selectedPrinter = printerId;
  let selectedPrinterObj = getPrinterObj(printerId);
  
  if (selectedPrinterObj) {
    // 找出所属品牌
    for (const brandId in printersByBrand) {
      if (printersByBrand[brandId].some(p => p.id === printerId)) {
        selectedBrand = brandId;
        break;
      }
    }
    
    if (!keepVersion) {
        selectedVersion = null; 
    }

    // 安全更新左侧边栏文字 (加了防空判断，就算找不到DOM也不会报错白屏)
    const sbBrand = document.getElementById('sidebarBrand');
    if (sbBrand) {
      const bObj = brands.find(b => b.id === selectedBrand);
      if (bObj) sbBrand.textContent = bObj.shortName;
    }

    const sbModel = document.getElementById('sidebarModelName');
    if (sbModel) sbModel.textContent = selectedPrinterObj.shortName;
    
    // 更新左上角徽章 (刚刚修复过的)
    updateSidebarVersionBadge(selectedVersion);
    
    saveUserConfig(); 
    
    renderBrands();
    renderPrinters(selectedBrand);
    
    // 确保这个函数存在再去调用
    if (typeof renderDownloadVersions === 'function') {
      renderDownloadVersions(selectedPrinterObj);
    }
  }
}

// ==================== 8. 右键菜单功能 ====================
/*
 * bindContextMenu() - 绑定右键菜单事件
 * 功能：为机型卡片绑定右键菜单事件
 */
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

/*
 * showContextMenu(x, y) - 显示右键菜单
 * @param {number} x - 菜单X坐标
 * @param {number} y - 菜单Y坐标
 * 功能：在指定位置显示右键菜单
 */
function showContextMenu(x, y) {
  const contextMenu = document.getElementById('contextMenu');
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');
}

/*
 * showPrinterContextMenu(event, printerId) - 显示打印机右键菜单
 * @param {Event} event - 右键菜单事件
 * @param {string} printerId - 打印机ID
 * 功能：显示打印机的右键菜单
 */
function showPrinterContextMenu(event, printerId) {
  event.preventDefault();
  contextMenuTarget = printerId;
  showContextMenu(event.clientX, event.clientY);
}

/*
 * hideContextMenu() - 隐藏右键菜单
 * 功能：隐藏右键菜单
 */
function hideContextMenu() {
  document.getElementById('contextMenu').classList.add('hidden');
}

// ==================== 9. 版本控制功能 ====================

/*
 * renderVersions() - 重新设计的版本控制渲染引擎
 * 功能：将版本分为 稳定/测试/历史 三类，并支持历史版本折叠
 */
function renderVersions() {
  const versionList = document.getElementById('versionList');
  if (!versionList) return;
  versionList.innerHTML = '';

  // 1. 数据分组
  const stableVersion = versions.find(v => v.status === 'RUNNING' || v.status === 'Stable');
  const betaVersion = versions.find(v => v.status === 'Beta');
  const legacyVersions = versions.filter(v => v !== stableVersion && v !== betaVersion);

  // 2. 渲染函数：生成单个版本卡片
  const createCard = (version, type) => {
    let badgeClass = 'bg-gray-100 text-gray-800';
    let btnText = '回退';
    let btnClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';

    if (type === 'stable') {
      badgeClass = 'bg-green-100 text-green-800';
      btnText = version.current ? '已是最新' : '下载并更新';
      btnClass = 'bg-blue-600 text-white hover:bg-blue-700';
    } else if (type === 'beta') {
      badgeClass = 'bg-purple-100 text-purple-800';
      btnText = '立即尝鲜';
      btnClass = 'bg-purple-50 text-purple-600 hover:bg-purple-100';
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
              <svg class="w-3.5 h-3.5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>${detail}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  // 3. 按顺序注入 HTML
  if (stableVersion) versionList.innerHTML += createCard(stableVersion, 'stable');
  if (betaVersion) versionList.innerHTML += createCard(betaVersion, 'beta');

  // 4. 历史版本折叠区
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

/*
 * toggleExpandMore() - 切换版本列表展开/收起状态
 * 功能：切换版本列表的展开/收起状态
 */
function toggleExpandMore() {
  versionsExpanded = !versionsExpanded;
  renderVersions();
}

/*
 * checkForUpdates() - 软件版本检查 (用户点击，强制去云端查询)
 */
async function checkForUpdates() {
  Logger.info("用户点击了检查更新按钮，强制突破缓存限制");
  
  // 核心：第三个参数传 true，代表强行 fetch 云端！
  const result = await checkUpdateEngine('app', null, true);

  if (!result.success) {
    alert('网络请求失败，请检查网络设置。');
    return;
  }

  if (result.hasUpdate) {
    if (confirm(`发现软件新版本 v${result.cloudVersion}！\n是否立即前往下载？`)) {
      Logger.info('用户同意跳转下载', { url: result.data.downloadUrl });
      // 未来这里可以用 electron 的 shell 打开浏览器
    }
  } else {
    alert(`当前软件已是最新版本 (v${result.localVersion})！\n\n您使用的是最新版。`);
  }
}

/*
 * updateVersionListForPrinter() - 更新当前机型的版本列表
 * 功能：根据当前选中的机型更新版本选择列表
 */
function updateVersionListForPrinter() {
  const dateSelect = document.getElementById('dateSelect');
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

/*
 * selectVersion(card, version) - 选择版本类型
 * @param {HTMLElement} card - 版本卡片元素
 * @param {string} version - 版本类型
 * 功能：更新选中版本状态，启用日期选择
 */
function selectVersion(card, version) {
  selectedVersion = version;
  
  // 重置所有卡片状态
  document.querySelectorAll('.version-card').forEach(c => {
    c.classList.remove('selected');
    c.querySelector('.check-indicator').style.borderColor = '#E5E7EB';
    c.querySelector('.check-indicator').style.backgroundColor = 'transparent';
    c.querySelector('.check-indicator svg').style.opacity = '0';
    updateWizardButtons();
  });
  
  // 设置当前卡片状态
  card.classList.add('selected');
  const checkIndicator = card.querySelector('.check-indicator');
  checkIndicator.style.borderColor = 'var(--accent-blue)';
  checkIndicator.style.backgroundColor = 'var(--accent-blue)';
  checkIndicator.querySelector('svg').style.opacity = '1';
  
  // 启用日期选择
  const dateSelect = document.getElementById('dateSelect');
  dateSelect.disabled = false;
  dateSelect.classList.remove('cursor-not-allowed', 'text-gray-400');
  dateSelect.classList.add('text-gray-900');
  
  // 启用下载按钮
  document.getElementById('downloadBtn').disabled = false;
  document.getElementById('downloadHintWrapper').style.opacity = '0';
  
  // 更新侧边栏版本徽章
  updateSidebarVersionBadge(version);
}


/*
 * updateSidebarVersionBadge(version) - 更新侧边栏版本徽章
 */
function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
  if (!badge) return; // 防御性保护

  if (version === 'standard') {
    badge.textContent = '标准版';
    badge.style.backgroundColor = 'var(--theme-standard-bg)';
    badge.style.color = 'var(--theme-standard-text)';
  } else if (version === 'quick') {
    badge.textContent = '快拆版';
    badge.style.backgroundColor = 'var(--theme-quick-bg)';
    badge.style.color = 'var(--theme-quick-text)';
  } else if (version === 'lite') {
    badge.textContent = 'Lite版';
    badge.style.backgroundColor = 'var(--theme-lite-bg)';
    badge.style.color = 'var(--theme-lite-text)';
  } else {
    // 【核心修复】：如果传进来的是 null，强行变回灰色的“未选择”
    badge.textContent = '未选择';
    badge.style.backgroundColor = '#F3F4F6'; // 浅灰底
    badge.style.color = '#9CA3AF'; // 灰字
  }
}

// ==================== 10. 导航功能 ====================
/*
 * bindNavigation() - 绑定导航事件
 * 功能：为侧边栏导航项绑定点击事件，实现页面切换
 */
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      if (page) {
        switchPage(page);
        
        // 更新导航项状态
        document.querySelectorAll('.nav-item').forEach(navItem => {
          navItem.classList.remove('active');
        });
        item.classList.add('active');
      }
    });
  });
}

/*
 * switchPage(page) - 切换页面
 * @param {string} page - 页面ID
 * 功能：显示指定页面，隐藏其他页面
 */
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.add('hidden');
  });
  document.getElementById(`page-${page}`).classList.remove('hidden');
}

// ==================== 11. 校准功能 ====================
/*
 * copyPath() - 复制脚本路径
 * 功能：复制后处理脚本路径到剪贴板
 */
function copyPath() {
  const scriptPath = document.getElementById('scriptPath');
  scriptPath.select();
  document.execCommand('copy');
  
  const copyBtn = document.getElementById('scriptCopyBtn');
  copyBtn.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
    </svg>
  `;
  copyBtn.title = '已复制';
  
  setTimeout(() => {
    copyBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/>
      </svg>
    `;
    copyBtn.title = '复制路径';
  }, 2000);
}

/*
 * openZModel() - 打开Z轴校准模型
 * 功能：模拟打开Z轴校准模型，显示校准网格
 */
function openZModel() {
  const zProgress = document.getElementById('zProgress');
  const zPlaceholder = document.getElementById('zPlaceholder');
  const zGridSelector = document.getElementById('zGridSelector');
  
  zProgress.classList.remove('hidden');
  zPlaceholder.classList.add('hidden');
  
  setTimeout(() => {
    zProgress.classList.add('hidden');
    zGridSelector.classList.remove('hidden');
    generateZGrid();
  }, 1000);
}

/*
 * generateZGrid() - 生成Z轴校准网格
 * 功能：生成Z轴校准网格，用于视觉校准
 */
function generateZGrid() {
  const zGrid = document.getElementById('zGrid');
  zGrid.innerHTML = '';
  
  const offsets = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
  offsets.forEach(offset => {
    const gridItem = document.createElement('div');
    gridItem.className = 'w-12 h-12 border border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-300 transition-colors';
    gridItem.textContent = offset.toFixed(1);
    gridItem.onclick = () => selectZOffset(offset);
    zGrid.appendChild(gridItem);
  });
}

/*
 * selectZOffset(offset) - 选择Z轴偏移值
 * @param {number} offset - 偏移值
 * 功能：更新Z轴偏移值显示
 */
function selectZOffset(offset) {
  const zBadge = document.getElementById('zBadge');
  const zNewValue = document.getElementById('zNewValue');
  const zOriginal = document.getElementById('zOriginal');
  
  const originalValue = parseFloat(zOriginal.textContent);
  const newValue = originalValue + offset;
  
  zBadge.textContent = offset >= 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1);
  zBadge.classList.remove('hidden');
  zNewValue.textContent = newValue.toFixed(1);
}

/*
 * saveZOffset() - 保存Z轴偏移值
 * 功能：模拟保存Z轴偏移值
 */
function saveZOffset() {
  alert('Z轴偏移已保存');
}

/*
 * openXYModel() - 打开XY轴校准模型
 * 功能：模拟打开XY轴校准模型，显示校准网格
 */
function openXYModel() {
  const xyProgress = document.getElementById('xyProgress');
  const xyPlaceholder = document.getElementById('xyPlaceholder');
  const xyGridSelector = document.getElementById('xyGridSelector');
  
  xyProgress.classList.remove('hidden');
  xyPlaceholder.classList.add('hidden');
  
  setTimeout(() => {
    xyProgress.classList.add('hidden');
    xyGridSelector.classList.remove('hidden');
    generateXYGrid();
  }, 1000);
}

/*
 * generateXYGrid() - 生成XY轴校准网格
 * 功能：生成XY轴校准网格，用于视觉校准
 */
function generateXYGrid() {
  const xyGrid = document.getElementById('xyGrid');
  xyGrid.innerHTML = '';
  
  // 生成一个简单的XY校准网格
  for (let y = -2; y <= 2; y++) {
    const row = document.createElement('div');
    row.className = 'flex';
    for (let x = -2; x <= 2; x++) {
      const gridItem = document.createElement('div');
      gridItem.className = 'w-16 h-16 border border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-300 transition-colors';
      gridItem.textContent = `${x},${y}`;
      gridItem.onclick = () => selectXYOffset(x, y);
      row.appendChild(gridItem);
    }
    xyGrid.appendChild(row);
  }
}

/*
 * selectXYOffset(x, y) - 选择XY轴偏移值
 * @param {number} x - X轴偏移值
 * @param {number} y - Y轴偏移值
 * 功能：更新XY轴偏移值显示
 */
function selectXYOffset(x, y) {
  alert(`XY轴偏移已选择: X${x}, Y${y}`);
}

/*
 * saveXYOffset() - 保存XY轴偏移值
 * 功能：模拟保存XY轴偏移值
 */
function saveXYOffset() {
  alert('XY轴偏移已保存');
}

// ============================================================
// 终极数据同步与本地存储模块 (大一统引擎)
// ============================================================

// 1. 本地存储引擎
function saveUserConfig() {
  const config = {
    brand: selectedBrand,
    printer: selectedPrinter,
    version: selectedVersion
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
    }
  } catch (e) {
    console.error("加载配置文件失败", e);
  }
}

// 2. 辅助中心
function getPrinterObj(printerId) {
  for (const brandId in printersByBrand) {
    const p = printersByBrand[brandId].find(p => p.id === printerId);
    if (p) return p;
  }
  return null;
}

// 3. 核心复用：上方版本卡片 (清爽外观 + 再次点击取消选择)
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
    
    // 保持你圈出来的清爽原貌
    card.className = `version-card group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected border-blue-500' : 'border-gray-200 dark:border-[#333333] hover:border-blue-300'}`;
    
    // 【核心交互】：点击已选中的就传 null 取消掉，没选中的就正常传 vType
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
        <div class="check-indicator w-6 h-6 rounded-full border-2 ${isSelected ? 'border-transparent bg-blue-500' : 'border-gray-200 dark:border-[#444]'} flex items-center justify-center flex-shrink-0 transition-all duration-200">
          <svg class="w-4 h-4 text-white ${isSelected ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================================
// 云端动态数据拉取引擎 (OTA 更新核心)
// ============================================================

/* * 模拟云端的 manifest.json 文件内容。
 * 未来你只需要把这段 JSON 放在 GitHub/Gitee 上，用 fetch() 去拉取它的 Raw 链接即可。
 * 格式非常简单：大分类是机型 ID，中分类是版本类型，里面就是一个个的更新记录！
 */
const simulatedCloudManifest = {
  "a1": {
    "quick": [
      { id: 'v2.0', date: '2024-10-24', isLatest: true, fileName: 'A1_quick_v2.0.toml', changes: ['优化了底面支撑剥离的手感', '修复了在大体积模型下的Z轴漂移误差'] },
      { id: 'v1.5', date: '2024-09-12', isLatest: false, fileName: 'A1_quick_v1.5.toml', changes: ['出厂默认参数', '稳定且兼容性极高的基础预设'] }
    ],
    "standard": [
      { id: 'v1.0', date: '2024-08-01', isLatest: true, fileName: 'A1_standard_v1.0.toml', changes: ['初代标准版发布'] }
    ]
  },
  "a1mini": {
    "quick": [
      { id: 'v3.0', date: '2024-11-01', isLatest: true, fileName: 'A1mini_quick_v3.0.toml', changes: ['专门针对 Mini 优化的快拆参数'] }
    ]
  }
};

// 【模拟网络请求】：去 GitHub 拉取数据
async function fetchCloudPresets(printerId, versionType) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 真实环境下这里是： const response = await fetch('https://raw.githubusercontent.com/你的仓库/presets_manifest.json');
      // return response.json();
      
      const printerData = simulatedCloudManifest[printerId];
      if (printerData && printerData[versionType]) {
        resolve(printerData[versionType]);
      } else {
        resolve([]); // 如果云端没有这个机型的这个版本，返回空数组
      }
    }, 600); // 模拟 0.6 秒的网络延迟，让你看到酷炫的加载动画
  });
}

// ------------------------------------------------------------
// 异步渲染列表引擎 (自带 Loading 骨架屏)
// ------------------------------------------------------------
async function renderPresetList(printerData, versionType) {
  const container = document.getElementById('presetReleasesContainer');
  const emptyState = document.getElementById('presetEmptyState');
  const listEl = document.getElementById('presetReleasesList');
  const step2Badge = document.getElementById('step2Badge');
  
  if (!container || !listEl) return;

  if (!versionType || !printerData) {
    emptyState.classList.remove('hidden');
    listEl.classList.add('hidden');
    listEl.classList.remove('flex');
    if (step2Badge) step2Badge.classList.remove('text-blue-500');
    return;
  }

  // 1. 点亮左侧图标，隐藏空状态，显示列表容器
  if (step2Badge) step2Badge.classList.add('text-blue-500');
  emptyState.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.classList.add('flex');
  
  // 2. 注入 Loading 动画！(网络请求时让用户等待)
  listEl.innerHTML = `
    <div class="p-8 flex flex-col items-center justify-center text-center space-y-3">
      <svg class="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <div class="text-sm text-gray-500">正在从云端拉取最新预设数据...</div>
    </div>
  `;

  // 3. 执行网络请求拉取数据
  const releases = await fetchCloudPresets(printerData.id, versionType);

  // 4. 清空 Loading，渲染真实数据
  listEl.innerHTML = '';
  
  if (releases.length === 0) {
    listEl.innerHTML = `<div class="p-8 text-center text-sm text-gray-500">云端暂未发布该版本的预设文件。</div>`;
    return;
  }

  const versionNames = { standard: '标准版', quick: '快拆版', lite: 'Lite版' };
  const presetNamePrefix = `${printerData.shortName} ${versionNames[versionType] || ''}`;

  releases.forEach((release) => {
    const item = document.createElement('div');
    // 默认折叠
    const isExpanded = false; 
    
    // 【判断本地是否已安装】
    // 这里未来可以通过 Electron 的 fs.existsSync() 去检查本地 User 文件夹里有没有这个 release.fileName
    const isInstalledLocally = false; // 暂时模拟全都没安装

    item.className = `collapse-item border-b border-gray-100 dark:border-[#333] last:border-b-0`;
    
    item.innerHTML = `
      <div class="preset-header px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2A2D2E] transition-colors">
        <div class="flex items-center gap-3">
          <span class="text-sm font-bold text-gray-900 dark:text-gray-100">${presetNamePrefix} ${release.id}</span>
          ${release.isLatest ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">最新</span>' : ''}
          ${isInstalledLocally ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>已安装</span>' : ''}
          <span class="text-xs text-gray-400 ml-2 hidden sm:inline">发布于 ${release.date}</span>
        </div>
        
        <div class="flex items-center gap-4">
          <button class="dl-btn px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${isInstalledLocally ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-[#333] dark:text-gray-200 dark:hover:bg-[#444]' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'}">
            ${isInstalledLocally ? '应用此版本' : '下载并应用'}
          </button>
          <svg class="w-5 h-5 text-gray-400 collapse-arrow transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>
      
      <div class="collapse-wrapper">
        <div class="collapse-inner">
          <div class="px-5 pb-4 pt-1">
            <div class="bg-gray-50 dark:bg-[#1E1E1E] rounded-xl p-4 border border-gray-100 dark:border-[#333]">
              <div class="flex justify-between items-center mb-2">
                 <div class="text-xs font-medium text-gray-700 dark:text-gray-300">更新日志：</div>
                 <div class="text-[10px] text-gray-400 font-mono bg-gray-200 dark:bg-[#333] px-2 py-0.5 rounded">云端文件: ${release.fileName}</div>
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
      // 1. 在 (e) 前面加一个 async
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); 
        
        // 2. 在调用的函数前面加一个 await (意思是：耐心等它去云端对比/下载完)
        await applyPreset(release.id, isInstalledLocally.toString(), release.fileName);
        
        // 如果你以后想在下载完成后立马弹个炫酷的提示，就可以写在这里
        // console.log("所有下载和处理流程都已经彻底结束啦！");
      });

      listEl.appendChild(item);
    });
}


// 5. 升级版：打通页面的核心逻辑
function renderDownloadVersions(printerData) {
  renderVersionCards('downloadVersionList', printerData, selectedVersion, (vType) => {
    selectedVersion = vType; // null=反选, standard=选中
    saveUserConfig();
    
    renderDownloadVersions(printerData); // 刷新自己
    updateSidebarVersionBadge(vType); 
    
    // 核心联动：下方的折叠列表
    renderPresetList(printerData, vType);
  });

  // 控制右上角的下一步按钮
  if (!selectedVersion) {
    renderPresetList(printerData, null);
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if(dlBtn) dlBtn.disabled = true;
    if(dlHint) dlHint.style.opacity = '1';
  } else {
    renderPresetList(printerData, selectedVersion);
  }
}

// 6. 重写：引导页逻辑复用
function renderWizardVersions(printerData) {
  renderVersionCards('wizardVersionList', printerData, wizardSelectedVersion, (vType) => {
    wizardSelectedVersion = vType;
    renderWizardVersions(printerData); 
    updateWizardBadges(printerData.name, vType); 
    updateWizardButtons(); 
  });
}

// ==========================================
// 终极合并版：预设下载/应用逻辑 (无阻拦版)
// ==========================================
async function applyPreset(releaseId, isInstalled, fileName) {
  Logger.info(`准备处理预设: ${releaseId}`);

  // 1. 调用更新引擎 (第三个参数默认 false，优先使用 5 分钟内的本地缓存，不卡顿)
  const result = await checkUpdateEngine('preset', selectedPrinter);

  if (!result || !result.success) {
    alert("获取预设信息失败，请检查网络。");
    return;
  }

  // 2. UI 交互：点亮“下一步”按钮
  const dlBtn = document.getElementById('downloadBtn');
  const dlHint = document.getElementById('downloadHintWrapper');
  if(dlBtn) {
    dlBtn.disabled = false;
    dlBtn.innerHTML = `<span>下一步</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>`;
  }
  if(dlHint) dlHint.style.opacity = '0';

  // 3. 根据引擎对比结果，直接执行操作，绝不弹窗说“请3分钟后再试”
  if (result.hasUpdate) {
    Logger.info(`发现新版预设 v${result.cloudVersion}，准备下载`);
    alert(`发现新版 JSON 预设 (v${result.cloudVersion})！\n\n即将去网络请求下载：${fileName}\n\n下载完成后将为您应用此版本。`);
    
    // 【未来预留】：这里执行真实的下载代码...
    
    // 下载成功后，更新本地记录
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

// 8. 重写：主界面选择机型 (换机型 = 自动清空旧版本并存档)
function selectPrinter(printerId, keepVersion = false) {
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

// 9. 重写：引导页完成按钮
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
        document.querySelector('[data-page="calibrate"]').click();
      }, 200);
  }
}

/*
 * 10. 软件加载时的初始化 (修复版 + 日志埋点)
 */
async function init() {
  Logger.info("=== 软件启动，开始初始化 ===");
  // 【新增】：动态设置窗口左上角的标题和版本号
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
  
  // 【关键修复】：取消注释，让设置界面的事件绑定生效！
  if (typeof initTheme === 'function') initTheme();
  if (typeof initSystemThemeListener === 'function') initSystemThemeListener();
  if (typeof initOnboardingSetting === 'function') initOnboardingSetting();

  // 检查是否显示引导界面
  if (typeof checkShowOnboarding === 'function' && !checkShowOnboarding()) {
    Logger.info("用户设置了关闭引导页，直接跳过");
    skipOnboarding();
  } else {
    Logger.info("进入新手引导页面");
  }
}


// ==================== 12. 事件监听 ====================
/*
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', init);

// 初始化引导界面设置
function initOnboardingSetting() {
  const showOnboardingCheckbox = document.getElementById('showOnboarding');
  if (showOnboardingCheckbox) {
    // 从本地存储加载设置
    const savedSetting = localStorage.getItem('showOnboarding');
    if (savedSetting !== null) {
      showOnboardingCheckbox.checked = savedSetting === 'true';
    }
    
    // 绑定事件监听器
    showOnboardingCheckbox.addEventListener('change', function() {
      localStorage.setItem('showOnboarding', this.checked);
    });
  }
}

// 检查是否显示引导界面
function checkShowOnboarding() {
  const savedSetting = localStorage.getItem('showOnboarding');
  // 默认显示引导界面
  return savedSetting !== 'false';
}

/*
 * completeOnboarding() - 完成新手引导
 * 功能：隐藏引导页并切换到校准偏移页面
 */
function completeOnboarding() {
  const onboarding = document.getElementById('onboarding');
  onboarding.classList.add('animate-fade-out');
  setTimeout(() => {
    onboarding.style.display = 'none';
    // 切换到校准偏移页面
    document.querySelector('[data-page="calibrate"]').click();
  }, 200);
}

/*
 * 手动选择路径
 */
function manualSelectPath() {
  // 模拟手动选择路径
  alert('请选择Bambu Studio安装路径');
}
// ==========================================
// 开发者辅助小工具：实时显示窗口分辨率
// （软件发布前记得把这段删掉哦！）
// ==========================================
const sizeIndicator = document.createElement('div');
sizeIndicator.style.cssText = 'position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.7); color:white; padding:4px 8px; border-radius:4px; z-index:99999; font-size:12px; font-family:monospace; pointer-events:none; transition:all 0.1s;';
document.body.appendChild(sizeIndicator);

function updateDevSize() {
  sizeIndicator.textContent = `${window.innerWidth} x ${window.innerHeight}`;
  // 如果宽度小于 1000（触发折叠的临界点），变红提示你！
  if (window.innerWidth <= 1000) {
    sizeIndicator.style.background = 'rgba(239, 68, 68, 0.9)'; // Tailwind的红色
  } else if (window.innerWidth <= 1366) {
    sizeIndicator.style.background = 'rgba(245, 158, 11, 0.9)'; // Tailwind的橙色
  } else {
    sizeIndicator.style.background = 'rgba(0, 0, 0, 0.7)'; // 正常黑色
  }
}

window.addEventListener('resize', updateDevSize);
updateDevSize(); // 初始化执行一次