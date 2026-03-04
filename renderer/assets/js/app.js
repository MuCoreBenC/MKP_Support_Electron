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
function init() {
  renderBrands();
  renderPrinters(selectedBrand);
  renderVersions();
  bindNavigation();
  bindContextMenu();
  renderWizardBrands();
  updateVersionListForPrinter();
  filterFaq('');
  initTheme();
  initSystemThemeListener();
  initOnboardingSetting();
  
  // 检查是否显示引导界面
  if (!checkShowOnboarding()) {
    skipOnboarding();
  }
}

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

/*
 * selectPrinter(printerId) - 选择机型
 * @param {string} printerId - 机型ID
 * 功能：更新选中机型状态，更新侧边栏显示，更新版本列表
 */
function selectPrinter(printerId) {
  selectedPrinter = printerId;
  
  // 找到对应的打印机对象
  let selectedPrinterObj = null;
  for (const brandId in printersByBrand) {
    const printer = printersByBrand[brandId].find(p => p.id === printerId);
    if (printer) {
      selectedPrinterObj = printer;
      selectedBrand = brandId;
      break;
    }
  }
  
  if (selectedPrinterObj) {
    // 更新侧边栏显示
    document.getElementById('sidebarBrand').textContent = brands.find(b => b.id === selectedBrand).shortName;
    document.getElementById('sidebarModelName').textContent = selectedPrinterObj.shortName;
    document.getElementById('sidebarVersionBadge').textContent = '未选择';
    
    // 更新当前打印机支持的版本
    currentPrinterSupportedVersions = selectedPrinterObj.supportedVersions;
    updateVersionListForPrinter();
    
    // 重新渲染品牌和机型列表
    renderBrands();
    renderPrinters(selectedBrand);
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
 * renderVersions() - 渲染版本列表
 * 功能：在版本控制页面显示版本历史
 */
function renderVersions() {
  const versionList = document.getElementById('versionList');
  versionList.innerHTML = '';
  
  const displayCount = versionsExpanded ? versions.length : INITIAL_DISPLAY_COUNT;
  const displayVersions = versions.slice(0, displayCount);
  
  displayVersions.forEach(version => {
    const versionCard = document.createElement('div');
    versionCard.className = 'bg-white rounded-xl border border-gray-200 p-5';
    versionCard.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="px-2.5 py-1 rounded-full text-xs font-medium ${version.status === 'RUNNING' ? 'bg-green-100 text-green-800' : version.status === 'Beta' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}">${version.status}</div>
          <div>
            <div class="font-medium text-gray-900">${version.version}</div>
            <div class="text-xs text-gray-500">${version.date}</div>
          </div>
        </div>
        ${version.current ? '<div class="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">当前版本</div>' : ''}
      </div>
      <p class="text-sm text-gray-600 mb-3">${version.desc}</p>
      <div class="space-y-1">
        ${version.details.map(detail => `<div class="flex items-start gap-2 text-sm text-gray-600">
          <svg class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span>${detail}</span>
        </div>`).join('')}
      </div>
    `;
    versionList.appendChild(versionCard);
  });
  
  // 更新展开/收起按钮
  const expandBtn = document.querySelector('button[onclick="toggleExpandMore()"]');
  const expandBtnText = document.getElementById('expandBtnText');
  if (versions.length > INITIAL_DISPLAY_COUNT) {
    expandBtnText.textContent = versionsExpanded ? '收起' : '历史版本';
    expandBtn.classList.remove('hidden');
  } else {
    expandBtn.classList.add('hidden');
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
 * checkForUpdates() - 检查更新
 * 功能：模拟检查更新操作
 */
function checkForUpdates() {
  // 模拟检查更新
  alert('检查更新中...\n当前已是最新版本');
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
 * @param {string} version - 版本类型
 * 功能：根据选中的版本更新侧边栏版本徽章的样式和文本
 */
function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
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

// 1. 本地存储引擎：将用户的选择永久存入本地缓存
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

// 2. 辅助中心：快速根据机型ID找到它的完整数据
function getPrinterObj(printerId) {
  for (const brandId in printersByBrand) {
    const p = printersByBrand[brandId].find(p => p.id === printerId);
    if (p) return p;
  }
  return null;
}

// 3. 核心复用：通用版本卡片渲染器（同时给“引导页”和“下载页”打工！）
function renderVersionCards(containerId, printerData, currentSelectedVersion, onSelectCallback) {
  const container = document.getElementById(containerId);
  if (!container || !printerData) return;
  container.innerHTML = '';

  // 严格读取该机型支持的版本，默认兜底标准版
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
    // 自带完美的暗黑模式和选中高亮
    card.className = `version-card group bg-white dark:bg-[#252526] rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${isSelected ? 'selected border-blue-500' : 'border-gray-200 dark:border-[#333333] hover:border-blue-300'}`;
    
    // 绑定点击事件
    card.onclick = () => onSelectCallback(vType);

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

// 4. 重写：引导页版本渲染 (直接调用上面的引擎)
function renderWizardVersions(printerData) {
  renderVersionCards('wizardVersionList', printerData, wizardSelectedVersion, (vType) => {
    wizardSelectedVersion = vType;
    renderWizardVersions(printerData); // 刷新自己
    updateWizardBadges(printerData.name, vType); 
    updateWizardButtons(); // 激活下一步按钮
  });
}

// 5. 新增：下载页版本渲染 (直接调用上面的引擎，逻辑完全一致)
function renderDownloadVersions(printerData) {
  renderVersionCards('downloadVersionList', printerData, selectedVersion, (vType) => {
    selectedVersion = vType;
    saveUserConfig(); // 选完立刻存档！
    
    renderDownloadVersions(printerData); // 刷新自己
    updateSidebarVersionBadge(vType); // 侧边栏联动
    
    // 解锁下载按钮和日期选择器
    const dateSelect = document.getElementById('dateSelect');
    if(dateSelect) {
        dateSelect.disabled = false;
        dateSelect.classList.remove('cursor-not-allowed', 'text-gray-400');
        dateSelect.classList.add('text-gray-900', 'dark:text-gray-100');
    }
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if(dlBtn) dlBtn.disabled = false;
    if(dlHint) dlHint.style.opacity = '0';
  });

  // 防呆逻辑：如果因为换了机型导致没选中版本，立刻上锁
  if (!selectedVersion) {
    const dateSelect = document.getElementById('dateSelect');
    if(dateSelect) {
        dateSelect.disabled = true;
        dateSelect.classList.add('cursor-not-allowed', 'text-gray-400');
        dateSelect.classList.remove('text-gray-900', 'dark:text-gray-100');
    }
    const dlBtn = document.getElementById('downloadBtn');
    const dlHint = document.getElementById('downloadHintWrapper');
    if(dlBtn) dlBtn.disabled = true;
    if(dlHint) dlHint.style.opacity = '1';
  }
}

// 6. 重写：主界面选择机型 (换机型 = 自动清空旧版本并存档)
function selectPrinter(printerId, keepVersion = false) {
  selectedPrinter = printerId;
  let selectedPrinterObj = getPrinterObj(printerId);
  
  if (selectedPrinterObj) {
    selectedBrand = brands.find(b => printersByBrand[b.id].some(p => p.id === printerId)).id;
    
    // 【核心要求】：切换机型时，强制清空版本变为"未选择"（除非是刚从引导页带数据过来）
    if (!keepVersion) {
        selectedVersion = null; 
    }

    // 更新侧边栏文字
    document.getElementById('sidebarBrand').textContent = brands.find(b => b.id === selectedBrand).shortName;
    document.getElementById('sidebarModelName').textContent = selectedPrinterObj.shortName;
    updateSidebarVersionBadge(selectedVersion);
    
    saveUserConfig(); // 存档
    
    // 让界面重新画一遍
    renderBrands();
    renderPrinters(selectedBrand);
    renderDownloadVersions(selectedPrinterObj);
  }
}

// 7. 重写：引导页完成按钮 (把引导页的选择同步给主界面并存档)
function completeOnboarding() {
  selectedBrand = wizardSelectedBrand;
  selectedPrinter = wizardSelectedPrinter;
  selectedVersion = wizardSelectedVersion;
  
  saveUserConfig(); // 存档
  
  // 触发主界面更新 (传入 true 代表不要洗掉刚才选的版本)
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

// 8. 重写：侧边栏徽章更新 (支持显示灰色的"未选择")
function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
  if (!badge) return;
  
  badge.style.backgroundColor = '';
  badge.style.color = '';
  
  if (!version) {
    badge.textContent = '未选择';
    badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400 dark:bg-[#333] dark:text-gray-500 whitespace-nowrap transition-colors duration-300';
    return;
  }
  
  badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors duration-300';
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
  }
}

// 9. 重写：软件加载时的初始化 (开局读档！)
function init() {
  loadUserConfig(); // 第一步：读取本地配置文件
  
  renderBrands();
  selectPrinter(selectedPrinter, true); // 使用读取到的数据画出界面
  
  renderVersions();
  bindNavigation();
  bindContextMenu();
  renderWizardBrands();
  filterFaq('');
  initTheme();
  initSystemThemeListener();
  initOnboardingSetting();
  
  if (!checkShowOnboarding()) {
    skipOnboarding();
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