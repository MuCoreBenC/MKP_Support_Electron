/* ============================================================
       JavaScript 业务逻辑
       ============================================================
       
       代码结构：
       1. 数据定义 (第1095-1155行) - 品牌和机型数据
       2. 状态管理 (第1160-1175行) - 全局状态变量
       3. 侧边栏功能 (第1180-1200行) - 折叠/展开控制
       4. 初始化函数 (第1205-1215行) - 页面初始化
       5. 引导页功能 (第1220-1325行) - 新手引导流程
       6. 品牌相关功能 (第1330-1415行) - 品牌列表渲染和选择
       7. 机型相关功能 (第1420-1545行) - 机型列表渲染和选择
       8. 右键菜单功能 (第1550-1585行) - 收藏等操作
       9. 版本控制功能 (第1590-1705行) - 版本列表和下载
       10. 导航功能 (第1710-1745行) - 页面切换
       11. 校准功能 (第1750-1915行) - Z轴和XY轴校准
       12. 事件监听 (第1920-1945行) - DOM事件绑定
    ============================================================ */

    // ==================== 1. 数据定义 ====================
    /*
     * 品牌数据
     * @property {string} id - 品牌唯一标识符
     * @property {string} name - 品牌中文名称（用于品牌列表显示）
     * @property {string} shortName - 品牌英文短名（用于侧边栏显示）
     * @property {string} subtitle - 品牌副标题
     * @property {boolean} favorite - 是否收藏
     */
    let brands = [];
    let printersByBrand = {};

    /*
     * 版本历史数据
     * @property {string} version - 版本号
     * @property {string} date - 发布日期
     * @property {string} desc - 版本描述
     * @property {string} status - 版本状态（RUNNING/Beta/Legacy）
     * @property {boolean} current - 是否为当前版本
     * @property {string[]} details - 更新详情列表
     */
    const versions = [
      { version: 'v2.4.0-stable', date: '2024-05-20', desc: '优化了 Z 轴校准算法，提升精度', status: 'RUNNING', current: true, details: ['新增自动 Z 偏移检测功能', '优化校准算法，精度提升 15%', '修复多机型切换时的数据丢失问题', '更新用户界面交互体验'] },
      { version: 'v2.3.9-beta', date: '2024-05-15', desc: '新增 XY 轴联合校准功能', status: 'Beta', current: false, details: ['新增 XY 轴联合校准模式', '优化预设下载速度', '修复部分机型识别问题'] },
      { version: 'v2.3.8-stable', date: '2024-05-10', desc: '修复已知问题，提升稳定性', status: 'Legacy', current: false, details: ['修复启动时的闪退问题', '优化内存占用', '更新多语言支持'] },
      { version: 'v2.3.5-stable', date: '2024-04-28', desc: '重构参数管理模块', status: 'Legacy', current: false, details: ['重构参数管理架构', '新增参数导入导出功能', '优化参数搜索功能'] },
      { version: 'v2.3.0-stable', date: '2024-04-15', desc: '新增快拆版预设支持', status: 'Legacy', current: false, details: ['新增快拆版预设模板', '支持自定义预设管理', '优化预设加载速度'] },
      { version: 'v2.2.0-stable', date: '2024-03-20', desc: '优化界面交互体验', status: 'Legacy', current: false, details: ['全新界面设计', '优化操作流程', '新增暗色主题支持'] },
    ];

    // ==================== 2. 状态管理 ====================
    /*
     * 全局状态变量说明
     * --------------------------
     * selectedVersion: 当前选中的版本类型（standard/quick/lite）
     * selectedDate: 当前选中的日期
     * selectedPrinter: 当前选中的机型ID
     * selectedBrand: 当前选中的品牌ID
     * currentPrinterSupportedVersions: 当前机型支持的版本列表
     * contextMenuTarget: 右键菜单的目标对象
     * currentStep: 引导页当前步骤
     * wizardSelectedBrand: 引导页选中的品牌
     * wizardSelectedPrinter: 引导页选中的机型
     * versionsExpanded: 版本列表是否展开
     * sidebarCollapsed: 侧边栏是否折叠
     */
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
        wrapper.style.width = '216px'; // 【展开宽度】修改这里可改变展开后的宽度
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
     * FAQ 数据数组
     * 包含所有常见问题及其答案
     */
    const faqData = [
      {
        question: '如何开始使用支撑面改善工具？',
        answer: `<p>1. 首先在<span class="text-blue-600 font-medium">选择机型</span>页面选择您的3D打印机型号</p>
          <p>2. 进入<span class="text-blue-600 font-medium">下载预设</span>页面，选择对应的版本并下载预设文件</p>
          <p>3. 在切片软件中配置后处理脚本路径</p>
          <p>4. 进行Z轴和XY轴校准，获取最佳打印效果</p>`
      },
      {
        question: 'Z轴偏移校准的原理是什么？',
        answer: `<p>Z轴偏移校准用于调整打印头与打印床之间的距离。正确的Z轴偏移可以确保：</p>
          <p>• 第一层能够牢固粘附在打印床上</p>
          <p>• 支撑结构能够正确生成</p>
          <p>• 打印表面光滑平整</p>
          <p class="text-gray-500 italic">建议每次更换打印床或喷嘴后都重新校准Z轴偏移。</p>`
      },
      {
        question: 'XY轴偏移校准有什么作用？',
        answer: `<p>XY轴偏移校准用于调整支撑结构与模型之间的水平位置关系。主要作用包括：</p>
          <p>• 确保支撑结构位于正确的位置</p>
          <p>• 提高支撑与模型的接触精度</p>
          <p>• 减少支撑拆除后的残留痕迹</p>`
      },
      {
        question: '后处理脚本如何配置？',
        answer: `<p>在Bambu Studio或OrcaSlicer中配置后处理脚本：</p>
          <p>1. 打开切片软件，进入<span class="text-blue-600 font-medium">工艺 → 其他</span></p>
          <p>2. 找到<span class="text-blue-600 font-medium">后处理脚本容器</span>选项</p>
          <p>3. 将显示的脚本路径复制粘贴到输入框中</p>
          <p>4. 保存设置并重新切片即可生效</p>`
      },
      {
        question: '标准版和快拆版有什么区别？',
        answer: `<p><span class="font-medium text-gray-900">标准版：</span>适用于标准配置的打印机，提供完整的支撑面优化功能</p>
          <p><span class="font-medium text-gray-900">快拆版：</span>适用于使用快拆喷嘴的打印机，针对快拆结构进行了优化</p>
          <p class="text-gray-500 italic">请根据您的打印机实际配置选择对应版本。</p>`
      },
      {
        question: '如何更新到最新版本？',
        answer: `<p>1. 进入<span class="text-blue-600 font-medium">版本控制</span>页面</p>
          <p>2. 点击右上角的<span class="text-blue-600 font-medium">检查更新</span>按钮</p>
          <p>3. 如果有新版本，点击下载即可获取最新功能</p>
          <p class="text-gray-500 italic">建议定期检查更新以获取最新的优化和功能。</p>`
      },
      {
        question: '校准后打印效果不理想怎么办？',
        answer: `<p>如果校准后效果仍不理想，请检查以下几点：</p>
          <p>• 确认选择的机型和版本是否正确</p>
          <p>• 检查打印床是否水平</p>
          <p>• 确认耗材干燥且质量良好</p>
          <p>• 尝试微调偏移参数（每次调整0.05mm）</p>
          <p>• 如问题持续，请联系技术支持获取帮助</p>`
      }
    ];

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
     */
    function init() {
      // 使用 Electron IPC 通信获取打印机数据
      if (window.electronAPI) {
        window.electronAPI.getPrinters()
          .then(data => {
            brands = data.brands;
            printersByBrand = data.printersByBrand;
            renderBrands();
            renderPrinters(selectedBrand);
            renderVersions();
            bindNavigation();
            bindContextMenu();
            renderWizardBrands();
            updateVersionListForPrinter();
            filterFaq('');
          })
          .catch(error => {
            console.error('加载机型数据失败:', error);
          });
      } else {
        // 后备方案：直接加载本地 JSON 文件
        fetch('../data/printers.json')
          .then(response => response.json())
          .then(data => {
            brands = data.brands;
            printersByBrand = data.printersByBrand;
            renderBrands();
            renderPrinters(selectedBrand);
            renderVersions();
            bindNavigation();
            bindContextMenu();
            renderWizardBrands();
            updateVersionListForPrinter();
            filterFaq('');
          })
          .catch(error => {
            console.error('加载机型数据失败:', error);
          });
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
     * finishOnboarding() - 完成新手引导
     * 功能：
     * 1. 获取引导页中选择的品牌和机型
     * 2. 更新全局状态变量
     * 3. 更新侧边栏显示的品牌和机型名称
     * 4. 重新渲染品牌和机型列表
     * 5. 关闭引导页
     */
    function finishOnboarding() {
      if (wizardSelectedPrinter) {
        selectBrand(wizardSelectedBrand);
        selectPrinter(wizardSelectedPrinter);
      }
      skipOnboarding();
    }

    /*
     * goToStep(step) - 引导页步骤切换
     * @param {number} step - 目标步骤（1-3）
     * 
     * 步骤说明：
     * - 步骤1：环境检测
     * - 步骤2：选择机型
     * - 步骤3：基础参数确认
     * 
     * 功能：
     * 1. 更新步骤指示器的样式
     * 2. 显示/隐藏对应的步骤内容
     * 3. 更新底部按钮的文字和点击事件
     */
    function goToStep(step) {
      if (step < 1) step = 1;
      if (step > 3) { finishOnboarding(); return; }
      
      currentStep = step;
      
      for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`step${i}`);
        const contentEl = document.getElementById(`stepContent${i}`);
        stepEl.classList.remove('active', 'completed');
        contentEl.classList.add('hidden');
        if (i < step) stepEl.classList.add('completed');
        else if (i === step) { stepEl.classList.add('active'); contentEl.classList.remove('hidden'); }
      }
      
      const leftBtn = document.getElementById('leftBtn');
      const rightBtn = document.getElementById('rightBtn');
      
      if (step === 1) {
        leftBtn.textContent = '跳过引导';
        leftBtn.onclick = skipOnboarding;
        rightBtn.textContent = '下一步';
        rightBtn.disabled = false;
        rightBtn.onclick = () => goToStep(2);
      } else if (step === 2) {
        leftBtn.textContent = '上一步';
        leftBtn.onclick = () => goToStep(1);
        rightBtn.textContent = '下一步';
        rightBtn.disabled = !wizardSelectedPrinter;
        rightBtn.onclick = () => goToStep(3);
      } else if (step === 3) {
        leftBtn.textContent = '上一步';
        leftBtn.onclick = () => goToStep(2);
        rightBtn.textContent = '开始使用';
        rightBtn.disabled = false;
        rightBtn.onclick = finishOnboarding;
      }
    }

    function manualSelectPath() {
      alert('请选择切片软件安装路径');
    }

    function renderWizardBrands() {
      const list = document.getElementById('wizardBrandList');
      list.innerHTML = brands.map(brand => `
        <div class="model-list-item ${brand.id === wizardSelectedBrand ? 'selected' : ''}" onclick="selectWizardBrand('${brand.id}')">
          <span class="text-xs">${brand.name}</span>
        </div>
      `).join('');
      renderWizardModels(wizardSelectedBrand);
    }

    function selectWizardBrand(brandId) {
      wizardSelectedBrand = brandId;
      wizardSelectedPrinter = null;
      updateSelectedBadge();
      if (currentStep === 2) document.getElementById('rightBtn').disabled = true;
      renderWizardBrands();
    }

    /*
     * renderWizardModels(brandId) - 渲染引导页机型列表
     * @param {string} brandId - 品牌ID
     * 功能：根据选中的品牌渲染对应的机型列表
     */
    function renderWizardModels(brandId) {
      const list = document.getElementById('wizardModelList');
      const printers = printersByBrand[brandId] || [];
      if (printers.length === 0) { 
        list.innerHTML = `<div class="p-3 text-center text-gray-400 text-xs">暂未支持</div>`; 
        return; 
      }
      list.innerHTML = printers.map(p => `
        <div class="model-list-item ${p.id === wizardSelectedPrinter ? 'selected' : ''} ${p.disabled ? 'disabled' : ''}" ${!p.disabled ? `onclick="selectWizardModel('${p.id}')"` : ''}>
          <div class="flex items-center justify-between">
            <span class="text-xs">${p.name}</span>
            ${p.disabled ? '<span class="text-[10px] text-gray-400">开发中</span>' : ''}
          </div>
        </div>
      `).join('');
    }

    /*
     * selectWizardModel(printerId) - 引导页选择机型
     * @param {string} printerId - 机型ID
     * 功能：
     * 1. 更新选中的机型ID
     * 2. 重新渲染机型列表
     * 3. 更新选中徽章
     * 4. 显示该机型的默认偏移参数
     */
    function selectWizardModel(printerId) {
      wizardSelectedPrinter = printerId;
      const printers = printersByBrand[wizardSelectedBrand] || [];
      const printer = printers.find(p => p.id === printerId);
      if (printer) {
        renderWizardModels(wizardSelectedBrand);
        updateSelectedBadge();
        document.getElementById('rightBtn').disabled = false;
        document.getElementById('wizardXOffset').textContent = printer.xOffset.toFixed(2);
        document.getElementById('wizardYOffset').textContent = printer.yOffset.toFixed(2);
        document.getElementById('wizardZOffset').textContent = printer.zOffset.toFixed(2);
      }
    }

    /*
     * updateSelectedBadge() - 更新选中机型徽章
     * 功能：在引导页显示当前选中的机型名称
     */
    function updateSelectedBadge() {
      const badge = document.getElementById('selectedModelBadge');
      if (wizardSelectedPrinter) {
        const printers = printersByBrand[wizardSelectedBrand] || [];
        const printer = printers.find(p => p.id === wizardSelectedPrinter);
        if (printer) { badge.textContent = printer.name; badge.classList.remove('hidden'); return; }
      }
      badge.classList.add('hidden');
    }

    // ==================== 6. 品牌相关功能 ====================
    /*
     * renderBrands() - 渲染品牌列表
     * 功能：
     * 1. 将收藏的品牌排在前面
     * 2. 为每个品牌生成卡片HTML
     * 3. 绑定点击和右键菜单事件
     */
    function renderBrands() {
      const list = document.getElementById('brandList');
      const sortedBrands = [...brands].sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return 0;
      });
      
      list.innerHTML = sortedBrands.map(brand => `
        <div class="brand-card rounded-xl p-3 border border-gray-100 ${brand.id === selectedBrand ? 'active' : ''} ${brand.favorite ? 'favorited' : ''}" 
             onclick="selectBrand('${brand.id}')" 
             oncontextmenu="showBrandContextMenu(event, '${brand.id}')">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm text-gray-800">${brand.name}</span>
                ${brand.favorite ? `
                  <svg class="w-3.5 h-3.5 star-icon favorited" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ` : ''}
              </div>
              ${brand.subtitle ? `<span class="text-xs text-gray-400">${brand.subtitle}</span>` : ''}
            </div>
            <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      `).join('');
    }

    /*
     * selectBrand(brandId) - 选择品牌
     * @param {string} brandId - 品牌ID
     * 功能：
     * 1. 更新全局选中品牌
     * 2. 更新页面标题
     * 3. 重新渲染品牌和机型列表
     */
    function selectBrand(brandId) {
      selectedBrand = brandId;
      const brand = brands.find(b => b.id === brandId);
      
      const titleEl = document.getElementById('currentBrandTitle');
      if (brand.subtitle) {
        titleEl.textContent = `${brand.name} - ${brand.subtitle}`;
      } else {
        titleEl.textContent = brand.name;
      }
      
      renderBrands();
      renderPrinters(brandId);
    }

    /*
     * showBrandContextMenu(event, brandId) - 显示品牌右键菜单
     * @param {Event} event - 鼠标事件
     * @param {string} brandId - 品牌ID
     * 功能：显示收藏/取消收藏的右键菜单
     */
    function showBrandContextMenu(event, brandId) {
      event.preventDefault();
      const brand = brands.find(b => b.id === brandId);
      
      const menu = document.getElementById('contextMenu');
      const menuText = document.getElementById('contextMenuFavoriteText');
      menuText.textContent = brand.favorite ? '取消收藏' : '收藏此品牌';
      
      contextMenuTarget = { type: 'brand', id: brandId };
      menu.style.left = event.clientX + 'px';
      menu.style.top = event.clientY + 'px';
      menu.classList.remove('hidden');
    }

    // ==================== 7. 机型相关功能 ====================
    /*
     * renderPrinters(brandId) - 渲染机型列表
     * @param {string} brandId - 品牌ID
     * 功能：
     * 1. 根据品牌获取机型列表
     * 2. 为每个机型生成卡片HTML
     * 3. 处理禁用状态的机型（开发中）
     * 4. 绑定点击和右键菜单事件
     */
    function renderPrinters(brandId) {
      const grid = document.getElementById('printerGrid');
      const printers = printersByBrand[brandId] || [];
      
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
      
      grid.innerHTML = printers.map(p => `
        <div class="select-card rounded-xl p-3 flex flex-col h-full ${p.id === selectedPrinter ? 'selected' : ''} ${p.disabled ? 'printer-card-disabled' : ''}" 
             ${!p.disabled ? `onclick="selectPrinter('${p.id}')"` : ''}
             oncontextmenu="showPrinterContextMenu(event, '${p.id}')">
          <div class="relative flex-shrink-0">
            <div class="aspect-video bg-transparent rounded-lg mb-3 overflow-hidden flex items-center justify-center">
              <img src="../${p.image}" alt="${p.name}" class="w-full h-full object-contain drop-shadow-sm">
            </div>
            ${p.disabled ? `<div class="absolute top-2 left-2 px-2 py-1 rounded bg-gray-200 text-xs text-gray-500">开发中</div>` : ''}
            <div class="absolute top-2 right-2">
              <svg class="w-4 h-4 star-icon ${p.favorite ? 'favorited' : 'not-favorited'}"
                   fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            </div>
          </div>
          <div class="text-sm font-medium text-gray-700 text-center flex-1 flex items-center justify-center">${p.name}</div>
        </div>
      `).join('');
    }

    /*
     * selectPrinter(id) - 选择机型
     * @param {string} id - 机型ID
     * 功能：
     * 1. 更新全局选中机型
     * 2. 更新侧边栏显示的品牌和机型名称
     * 3. 更新当前机型支持的版本列表
     * 4. 重置版本选择状态
     * 5. 更新校准页面的脚本路径
     */
    function selectPrinter(id) {
      selectedPrinter = id;
      const printers = printersByBrand[selectedBrand] || [];
      const printer = printers.find(p => p.id === id);
      
      if (printer && !printer.disabled) {
        const brand = brands.find(b => b.id === selectedBrand);
        document.getElementById('sidebarBrand').textContent = brand ? (brand.shortName || brand.name) : '';
        document.getElementById('sidebarModelName').textContent = printer.shortName || printer.name;
        currentPrinterSupportedVersions = printer.supportedVersions || ['standard'];
        
        // === 彻底重置预设下载页面的所有状态 ===
        selectedVersion = null;
        
        // 1. 重置所有版本卡片的边框、背景和打勾图标
        document.querySelectorAll('#page-download .version-card[data-version]').forEach(card => {
          card.classList.remove('selected');
          card.style.borderColor = '#E5E7EB';
          const indicator = card.querySelector('.check-indicator');
          if (indicator) {
            indicator.style.backgroundColor = 'transparent';
            indicator.style.borderColor = '#E5E7EB';
            const svg = indicator.querySelector('svg');
            if (svg) svg.classList.add('opacity-0');
          }
        });
        
        // 2. 重置日期下拉框
        const dateSelect = document.getElementById('dateSelect');
        if (dateSelect) {
          dateSelect.disabled = true;
          dateSelect.value = '';
          dateSelect.classList.add('text-gray-400', 'cursor-not-allowed', 'bg-gray-50');
          dateSelect.classList.remove('text-gray-900', 'bg-white', 'cursor-pointer');
        }
        
        // 3. 重置日期步骤前的日历图标颜色
        const step2Badge = document.getElementById('step2Badge');
        if (step2Badge) {
          step2Badge.classList.add('text-gray-400');
          step2Badge.classList.remove('text-blue-500');
        }
        
        // 4. 重置全局其他关联组件
        updateSidebarVersionBadge(null);
        updateDownloadButton();
        updateCalibratePageScript();
        
        // 如果已经在下载预设页面，立即刷新可用卡片的显示/隐藏
        if (typeof updateVersionListForPrinter === 'function') {
          updateVersionListForPrinter();
        }
        
        renderPrinters(selectedBrand);
      }
    }

    function showPrinterContextMenu(event, printerId) {
      event.preventDefault();
      const printers = printersByBrand[selectedBrand] || [];
      const printer = printers.find(p => p.id === printerId);
      
      if (!printer || printer.disabled) return;
      
      const menu = document.getElementById('contextMenu');
      const menuText = document.getElementById('contextMenuFavoriteText');
      menuText.textContent = printer.favorite ? '取消收藏' : '收藏此机型';
      
      contextMenuTarget = { type: 'printer', id: printerId };
      menu.style.left = event.clientX + 'px';
      menu.style.top = event.clientY + 'px';
      menu.classList.remove('hidden');
    }

    function filterPrinters() {
      const search = document.getElementById('printerSearch').value.toLowerCase();
      const printers = printersByBrand[selectedBrand] || [];
      const filtered = printers.filter(p => p.name.toLowerCase().includes(search));
      
      const grid = document.getElementById('printerGrid');
      if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-3 py-8 text-center text-gray-400">未找到匹配的机型</div>`;
        return;
      }
      
      grid.innerHTML = filtered.map(p => `
        <div class="select-card rounded-xl p-3 flex flex-col h-full ${p.id === selectedPrinter ? 'selected' : ''} ${p.disabled ? 'printer-card-disabled' : ''}"
             ${!p.disabled ? `onclick="selectPrinter('${p.id}')"` : ''}
             oncontextmenu="showPrinterContextMenu(event, '${p.id}')">
          <div class="relative flex-shrink-0">
            <div class="aspect-video bg-transparent rounded-lg mb-3 overflow-hidden flex items-center justify-center">
              <img src="../${p.image}" alt="${p.name}" class="w-full h-full object-contain drop-shadow-sm">
            </div>
            ${p.disabled ? `<div class="absolute top-2 left-2 px-2 py-1 rounded bg-gray-200 text-xs text-gray-500">开发中</div>` : ''}
            <div class="absolute top-2 right-2">
              <svg class="w-4 h-4 star-icon ${p.favorite ? 'favorited' : 'not-favorited'}"
                   fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            </div>
          </div>
          <div class="text-sm font-medium text-gray-700 text-center flex-1 flex items-center justify-center">${p.name}</div>
        </div>
      `).join('');
    }

    function sortPrinters() {
      const sortType = document.getElementById('printerSort').value;
      const printers = printersByBrand[selectedBrand] || [];
      
      let sorted = [...printers];
      if (sortType === 'alpha') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortType === 'favorite') {
        sorted.sort((a, b) => {
          if (a.favorite && !b.favorite) return -1;
          if (!a.favorite && b.favorite) return 1;
          return 0;
        });
      }
      
      const grid = document.getElementById('printerGrid');
      grid.innerHTML = sorted.map(p => `
        <div class="select-card rounded-xl p-3 flex flex-col h-full ${p.id === selectedPrinter ? 'selected' : ''} ${p.disabled ? 'printer-card-disabled' : ''}"
             ${!p.disabled ? `onclick="selectPrinter('${p.id}')"` : ''}
             oncontextmenu="showPrinterContextMenu(event, '${p.id}')">
          <div class="relative flex-shrink-0">
            <div class="aspect-video bg-transparent rounded-lg mb-3 overflow-hidden flex items-center justify-center">
              <img src="../${p.image}" alt="${p.name}" class="w-full h-full object-contain drop-shadow-sm">
            </div>
            ${p.disabled ? `<div class="absolute top-2 left-2 px-2 py-1 rounded bg-gray-200 text-xs text-gray-500">开发中</div>` : ''}
            <div class="absolute top-2 right-2">
              <svg class="w-4 h-4 star-icon ${p.favorite ? 'favorited' : 'not-favorited'}"
                   fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            </div>
          </div>
          <div class="text-sm font-medium text-gray-700 text-center flex-1 flex items-center justify-center">${p.name}</div>
        </div>
      `).join('');
    }

    // ==================== 右键菜单 ====================
    function bindContextMenu() {
      document.addEventListener('click', () => {
        document.getElementById('contextMenu').classList.add('hidden');
      });
      
      document.getElementById('contextMenuFavorite').addEventListener('click', () => {
        if (!contextMenuTarget) return;
        
        if (contextMenuTarget.type === 'brand') {
          const brand = brands.find(b => b.id === contextMenuTarget.id);
          if (brand) {
            brand.favorite = !brand.favorite;
            renderBrands();
          }
        } else if (contextMenuTarget.type === 'printer') {
          const printers = printersByBrand[selectedBrand] || [];
          const printer = printers.find(p => p.id === contextMenuTarget.id);
          if (printer) {
            printer.favorite = !printer.favorite;
            renderPrinters(selectedBrand);
          }
        }
        
        document.getElementById('contextMenu').classList.add('hidden');
      });
    }

    // ==================== 版本控制 ====================
    function checkForUpdates() {
      alert('当前已是最新版本！');
    }
    
    /*
     * generateVersionCardHtml(v) - 生成单个版本卡片HTML
     * @param {Object} v - 版本数据对象
     * @returns {string} HTML字符串
     */
    function generateVersionCardHtml(v) {
      return `
        <div class="collapse-item version-card bg-white rounded-xl card-shadow overflow-hidden mb-3">
          <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="toggleCollapse(this)">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                ${v.current ? `
                  <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  </div>
                ` : `
                  <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                `}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-gray-900">${v.version}</span>
                    <span class="text-xs text-gray-400">${v.date}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${
                      v.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' :
                      v.status === 'Beta' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }">${v.status}</span>
                  </div>
                  <div class="text-sm text-gray-500 mt-0.5">${v.desc}</div>
                </div>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0 ml-4">
                <button onclick="event.stopPropagation(); downloadVersion('${v.version}')" class="btn-primary px-3 py-1.5 rounded-lg text-xs font-medium relative z-10">下载</button>
                <div class="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center transition-colors">
                  <svg class="collapse-icon w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div class="collapse-wrapper">
            <div class="collapse-inner bg-gray-50 border-t border-gray-100">
              <div class="p-4">
                <ul class="space-y-1.5">
                  ${v.details.map(d => `<li class="flex items-start gap-2 text-sm text-gray-600"><svg class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>${d}</span></li>`).join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderVersions(filter = '') {
      const list = document.getElementById('versionList');
      const filtered = versions.filter(v => v.version.toLowerCase().includes(filter.toLowerCase()) || v.desc.toLowerCase().includes(filter.toLowerCase()));
      
      const isSearching = filter.trim() !== '';
      const showCount = isSearching ? filtered.length : INITIAL_DISPLAY_COUNT;
      
      const initialItems = filtered.slice(0, showCount);
      const extraItems = filtered.slice(showCount);

      let html = initialItems.map(v => generateVersionCardHtml(v)).join('');

      if (extraItems.length > 0) {
        html += `
          <div id="extraVersionsWrapper" class="collapse-wrapper ${versionsExpanded ? 'is-expanded' : ''}">
            <div class="collapse-inner mt-1">
              ${extraItems.map(v => generateVersionCardHtml(v)).join('')}
            </div>
          </div>
        `;
      }

      list.innerHTML = html;
      updateExpandButton();
    }

    function downloadVersion(version) {
      alert(`正在下载 ${version}...`);
    }

    function toggleExpandMore() {
      versionsExpanded = !versionsExpanded;
      const wrapper = document.getElementById('extraVersionsWrapper');
      if (wrapper) {
        if (versionsExpanded) {
          wrapper.classList.add('is-expanded');
        } else {
          wrapper.classList.remove('is-expanded');
        }
      }
      updateExpandButton();
    }

    function updateExpandButton() {
      const btnText = document.getElementById('expandBtnText');
      if (!btnText) return;
      if (versionsExpanded) {
        btnText.textContent = '收起历史';
      } else {
        btnText.textContent = '历史版本';
      }
    }

    // ==================== 导航 ====================
    function bindNavigation() {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          
          const page = item.dataset.page;
          document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
          document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
          document.getElementById(`page-${page}`).classList.remove('hidden');
          document.getElementById(`page-${page}`).classList.add('active');
          
          if (page === 'download') {
            updateVersionListForPrinter();
          }
        });
      });
    }

    function updateVersionListForPrinter() {
      // 修复：原先的选择器不存在，改用更精确的属性选择器
      const cards = document.querySelectorAll('#page-download .version-card[data-version]');
      if (!cards.length) return;
      
      cards.forEach(card => {
        const versionType = card.dataset.version;
        const isSupported = currentPrinterSupportedVersions.includes(versionType);
        
        if (isSupported) {
          // 恢复显示
          card.style.display = '';
        } else {
          // 强制物理隐藏
          card.style.display = 'none';
          
          // 如果被隐藏的版本正好是当前选中的，强制清空当前选择状态
          if (selectedVersion === versionType) {
            card.classList.remove('selected');
            card.style.borderColor = '#E5E7EB';
            const indicator = card.querySelector('.check-indicator');
            if (indicator) {
              indicator.style.backgroundColor = 'transparent';
              indicator.style.borderColor = '#E5E7EB';
              const svg = indicator.querySelector('svg');
              if (svg) svg.classList.add('opacity-0');
            }
            
            selectedVersion = null;
            const dateSelect = document.getElementById('dateSelect');
            if (dateSelect) {
              dateSelect.disabled = true;
              dateSelect.classList.add('text-gray-400', 'cursor-not-allowed', 'bg-gray-50');
              dateSelect.classList.remove('text-gray-900', 'bg-white', 'cursor-pointer');
              dateSelect.value = "";
            }
            
            const step2Badge = document.getElementById('step2Badge');
            if (step2Badge) {
              step2Badge.classList.add('text-gray-400');
              step2Badge.classList.remove('text-blue-500');
            }
            
            updateSidebarVersionBadge(null);
            updateDownloadButton();
            updateCalibratePageScript();
          }
        }
      });
    }

    /*
     * selectVersion(el, type) - 选择版本类型
     * @param {HTMLElement} el - 点击的卡片元素
     * @param {string} type - 版本类型（standard/quick/lite）
     * 功能：
     * 1. 更新选中状态的视觉样式
     * 2. 启用日期选择器
     * 3. 更新下一步按钮状态
     * 4. 更新侧边栏版本徽章
     * 5. 更新校准页面的脚本路径
     */
    function selectVersion(el, type) {
      if (el.classList.contains('opacity-40')) return;
      
      // 重置所有卡片边框为灰色
      document.querySelectorAll('[data-version]').forEach(card => {
        card.style.borderColor = '#E5E7EB';
        card.classList.remove('selected');
        
        const indicator = card.querySelector('.check-indicator');
        if (indicator) {
          indicator.style.backgroundColor = 'transparent';
          indicator.style.borderColor = '#E5E7EB';
          const svg = indicator.querySelector('svg');
          if (svg) svg.classList.add('opacity-0');
        }
      });
      
      // 设置当前选中卡片，使用对应版本的动态 CSS 变量
      el.classList.add('selected');
      el.style.borderColor = `var(--theme-${type}-text)`;
      
      const indicator = el.querySelector('.check-indicator');
      if (indicator) {
        indicator.style.backgroundColor = `var(--theme-${type}-text)`;
        indicator.style.borderColor = `var(--theme-${type}-text)`;
        const svg = indicator.querySelector('svg');
        if (svg) svg.classList.remove('opacity-0');
      }
      
      selectedVersion = type;
      
      // 启用日期选择器
      const dateSelect = document.getElementById('dateSelect');
      if (dateSelect) {
        dateSelect.disabled = false;
        dateSelect.classList.remove('text-gray-400', 'cursor-not-allowed', 'bg-gray-50');
        dateSelect.classList.add('text-gray-900', 'bg-white', 'cursor-pointer');
      }
      
      // 更新步骤2徽章
      const step2Badge = document.getElementById('step2Badge');
      if (step2Badge) {
        step2Badge.classList.remove('text-gray-400');
        step2Badge.classList.add('text-blue-500');
      }
      
      const dateSelector = document.getElementById('dateSelector');
      if (dateSelector) {
        dateSelector.style.opacity = '1';
      }
      updateDownloadButton();
      updateSidebarVersionBadge(type);
      updateCalibratePageScript();
    }

    function updateCalibratePageScript() {
      const scriptInput = document.getElementById('scriptPath');
      const scriptBtn = document.getElementById('scriptCopyBtn');
      
      const printers = printersByBrand[selectedBrand] || [];
      const printer = printers.find(p => p.id === selectedPrinter);
      
      if (printer && selectedVersion && printer.scriptPaths && printer.scriptPaths[selectedVersion]) {
        scriptInput.value = printer.scriptPaths[selectedVersion];
        scriptBtn.disabled = false;
        scriptBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        scriptInput.value = '';
        scriptInput.placeholder = '请先选择机型和版本';
        scriptBtn.disabled = true;
        scriptBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
    
    /*
     * setVersionTheme(version, textHex, bgHex) - 动态设置版本主题色
     * @param {string} version - 版本类型 (standard/quick/lite)
     * @param {string} textHex - 文字颜色十六进制值
     * @param {string} bgHex - 背景颜色十六进制值
     */
    function setVersionTheme(version, textHex, bgHex) {
      document.documentElement.style.setProperty(`--theme-${version}-text`, textHex);
      document.documentElement.style.setProperty(`--theme-${version}-bg`, bgHex);
      if (selectedVersion === version) updateSidebarVersionBadge(version);
    }

    function updateSidebarVersionBadge(type) {
      const badge = document.getElementById('sidebarVersionBadge');
      
      // 核心修复：每次赋值时，确保清空可能引发暗黑模式覆盖的 bg-gray-100
      badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors duration-300';
      
      if (type === 'standard') {
        badge.textContent = '标准版';
        badge.style.color = 'var(--theme-standard-text)';
        badge.style.backgroundColor = 'var(--theme-standard-bg)';
      } else if (type === 'quick') {
        badge.textContent = '快拆版';
        badge.style.color = 'var(--theme-quick-text)';
        badge.style.backgroundColor = 'var(--theme-quick-bg)';
      } else if (type === 'lite') {
        badge.textContent = 'Lite版';
        badge.style.color = 'var(--theme-lite-text)';
        badge.style.backgroundColor = 'var(--theme-lite-bg)';
      } else {
        // 只有在未选择状态下，才加上灰底灰字
        badge.classList.add('bg-gray-100', 'text-gray-400');
        badge.textContent = '未选择';
        badge.style.color = '';
        badge.style.backgroundColor = '';
      }
    }

    function updateDownloadButton() {
      const btn = document.getElementById('downloadBtn');
      const hintWrapper = document.getElementById('downloadHintWrapper');
      const dateSelect = document.getElementById('dateSelect');
      const dateVal = dateSelect ? dateSelect.value : '';
      
      if (btn) {
        if (selectedVersion && dateVal) {
          btn.disabled = false;
          if (hintWrapper) hintWrapper.style.opacity = '0';
        } else {
          btn.disabled = true;
          if (hintWrapper) hintWrapper.style.opacity = '1';
        }
      }
    }

    function copyPath() {
      const input = document.getElementById('scriptPath');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value);
      }
    }

    let selectedZIndex = 0;
    let selectedXIndex = 0;
    let selectedYIndex = 0;

    function openZModel() {
      const progress = document.getElementById('zProgress');
      const placeholder = document.getElementById('zPlaceholder');
      const gridSelector = document.getElementById('zGridSelector');
      const grid = document.getElementById('zGrid');
      const btn = document.getElementById('zOpenBtn');
      
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      let countdown = 10;
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span class="text-sm">${countdown}秒后可再次操作</span>`;
      
      const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          btn.innerHTML = `<span class="text-sm">${countdown}秒后可再次操作</span>`;
        } else {
          clearInterval(timer);
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
          btn.innerHTML = originalText;
        }
      }, 1000);
      
      progress.classList.remove('hidden');
      placeholder.classList.add('hidden');
      
      setTimeout(() => {
        progress.classList.add('hidden');
        gridSelector.classList.remove('hidden');
        
        grid.innerHTML = '';
        for (let i = -5; i <= 5; i++) {
          const label = i > 0 ? `+${(i * 0.1).toFixed(1)}` : `${(i * 0.1).toFixed(1)}`;
          const isZero = i === 0;
          const cell = document.createElement('div');
          cell.className = `flex flex-col items-center justify-center w-14 h-16 rounded-lg border-2 cursor-pointer transition-all ${isZero ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}`;
          cell.dataset.index = i;
          cell.onclick = () => selectZCell(i, cell);
          cell.innerHTML = `
            <div class="text-lg font-bold ${isZero ? 'text-blue-600' : 'text-gray-700'}">${label}</div>
            ${isZero ? '<div class="w-2 h-2 bg-blue-500 rounded-full mt-1"></div>' : ''}
          `;
          grid.appendChild(cell);
        }
      }, 500);
    }

    function selectZCell(index, element) {
      document.querySelectorAll('#zGrid > div').forEach(el => {
        el.classList.remove('border-blue-500', 'bg-blue-50');
        el.classList.add('border-gray-200', 'bg-white');
        const text = el.querySelector('div:first-child');
        if (text) text.classList.remove('text-blue-600');
        if (text) text.classList.add('text-gray-700');
      });
      element.classList.remove('border-gray-200', 'bg-white');
      element.classList.add('border-blue-500', 'bg-blue-50');
      const text = element.querySelector('div:first-child');
      if (text) text.classList.remove('text-gray-700');
      if (text) text.classList.add('text-blue-600');
      
      selectedZIndex = index;
      const offset = index * 0.1;
      const original = 3.3;
      const newValue = original + offset;
      
      const badge = document.getElementById('zBadge');
      badge.textContent = offset >= 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1);
      badge.classList.remove('hidden');
      badge.className = `text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${offset > 0 ? 'bg-red-100 text-red-600' : offset < 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`;
      
      document.getElementById('zNewValue').textContent = newValue.toFixed(1);
    }

    function saveZOffset() {
      const offset = selectedZIndex * 0.1;
      const newValue = 3.3 + offset;
      alert(`Z轴偏移已保存：${newValue.toFixed(1)} mm`);
    }

    function openXYModel() {
      const progress = document.getElementById('xyProgress');
      const placeholder = document.getElementById('xyPlaceholder');
      const gridSelector = document.getElementById('xyGridSelector');
      const grid = document.getElementById('xyGrid');
      const btn = document.getElementById('xyOpenBtn');
      
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      let countdown = 10;
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span class="text-sm">${countdown}秒后可再次操作</span>`;
      
      const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          btn.innerHTML = `<span class="text-sm">${countdown}秒后可再次操作</span>`;
        } else {
          clearInterval(timer);
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
          btn.innerHTML = originalText;
        }
      }, 1000);
      
      progress.classList.remove('hidden');
      placeholder.classList.add('hidden');
      
      setTimeout(() => {
        progress.classList.add('hidden');
        gridSelector.classList.remove('hidden');
        
        grid.innerHTML = '';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-end gap-2';
        
        const yAxisContainer = document.createElement('div');
        yAxisContainer.className = 'bg-transparent rounded-lg p-1 mb-10';
        const yAxis = document.createElement('div');
        yAxis.className = 'flex flex-col gap-1';
        for (let i = 5; i >= -5; i--) {
          const isZero = i === 0;
          const cell = document.createElement('div');
          cell.className = `flex items-center justify-center w-10 h-3 rounded cursor-pointer transition-all mt-1 ${isZero ? 'bg-green-500' : 'bg-gray-200 hover:bg-green-300'}`;
          cell.dataset.axis = 'y';
          cell.dataset.index = i;
          cell.onclick = () => selectYCell(i, cell);
          if (isZero) {
            cell.innerHTML = '<div class="w-2 h-2 bg-white rounded-full"></div>';
          }
          yAxis.appendChild(cell);
        }
        yAxisContainer.appendChild(yAxis);
        
        const rightColumn = document.createElement('div');
        rightColumn.className = 'flex flex-col gap-2';
        
        const resultCards = document.createElement('div');
        resultCards.className = 'space-y-3';
        resultCards.innerHTML = `
          <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div class="text-xs text-gray-400 mb-1">X轴偏移结果</div>
            <div class="flex items-center justify-center gap-3">
              <div class="text-center">
                <div class="text-xs text-gray-400">当前值</div>
                <div class="text-xl font-semibold text-gray-400" id="xOriginal">0.00</div>
              </div>
              <div class="flex flex-col items-center">
                <div id="xBadge" class="hidden text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-600 mb-1">+0.4</div>
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                </svg>
              </div>
              <div class="text-center">
                <div class="text-xs text-gray-400">计算结果</div>
                <div class="text-xl font-bold text-blue-600" id="xNewValue">0.40</div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div class="text-xs text-gray-400 mb-1">Y轴偏移结果</div>
            <div class="flex items-center justify-center gap-3">
              <div class="text-center">
                <div class="text-xs text-gray-400">当前值</div>
                <div class="text-xl font-semibold text-gray-400" id="yOriginal">0.00</div>
              </div>
              <div class="flex flex-col items-center">
                <div id="yBadge" class="hidden text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-600 mb-1">+0.2</div>
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                </svg>
              </div>
              <div class="text-center">
                <div class="text-xs text-gray-400">计算结果</div>
                <div class="text-xl font-bold text-blue-600" id="yNewValue">0.20</div>
              </div>
            </div>
          </div>
        `;
        
        const xAxisContainer = document.createElement('div');
        xAxisContainer.className = 'bg-transparent rounded-lg p-1 ';
        const xAxis = document.createElement('div');
        xAxis.className = 'flex gap-1';
        for (let i = -5; i <= 5; i++) {
          const isZero = i === 0;
          const cell = document.createElement('div');
          cell.className = `flex items-center justify-center w-3 h-10 rounded cursor-pointer transition-all ml-2 ${isZero ? 'bg-purple-500' : 'bg-gray-200 hover:bg-purple-300'}`;
          cell.dataset.axis = 'x';
          cell.dataset.index = i;
          cell.onclick = () => selectXCell(i, cell);
          if (isZero) {
            cell.innerHTML = '<div class="w-2 h-2 bg-white rounded-full"></div>';
          }
          xAxis.appendChild(cell);
        }
        xAxisContainer.appendChild(xAxis);
        
        rightColumn.appendChild(resultCards);
        rightColumn.appendChild(xAxisContainer);
        
        wrapper.appendChild(yAxisContainer);
        wrapper.appendChild(rightColumn);
        grid.appendChild(wrapper);
      }, 500);
    }

    function selectXCell(index, element) {
      document.querySelectorAll('[data-axis="x"]').forEach(el => {
        el.classList.remove('bg-purple-500');
        el.classList.add('bg-gray-200');
        const isZero = el.dataset.index === '0';
        el.innerHTML = isZero ? '<div class="w-2 h-2 bg-white rounded-full"></div>' : '';
      });
      element.classList.remove('bg-gray-200');
      element.classList.add('bg-purple-500');
      
      selectedXIndex = index;
      const offset = index * 0.2;
      const original = 0.00;
      const newValue = original + offset;
      
      const badge = document.getElementById('xBadge');
      badge.textContent = offset >= 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1);
      badge.classList.remove('hidden');
      badge.className = `text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${offset > 0 ? 'bg-red-100 text-red-600' : offset < 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`;
      
      document.getElementById('xNewValue').textContent = newValue.toFixed(2);
    }

    function selectYCell(index, element) {
      document.querySelectorAll('[data-axis="y"]').forEach(el => {
        el.classList.remove('bg-green-500');
        el.classList.add('bg-gray-200');
        const isZero = el.dataset.index === '0';
        el.innerHTML = isZero ? '<div class="w-2 h-2 bg-white rounded-full"></div>' : '';
      });
      element.classList.remove('bg-gray-200');
      element.classList.add('bg-green-500');
      
      selectedYIndex = index;
      const offset = index * 0.2;
      const original = 0.00;
      const newValue = original + offset;
      
      const badge = document.getElementById('yBadge');
      badge.textContent = offset >= 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1);
      badge.classList.remove('hidden');
      badge.className = `text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${offset > 0 ? 'bg-red-100 text-red-600' : offset < 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`;
      
      document.getElementById('yNewValue').textContent = newValue.toFixed(2);
    }

    function saveXYOffset() {
      const xOffset = selectedXIndex * 0.2;
      const yOffset = selectedYIndex * 0.2;
      alert(`XY轴偏移已保存：X=${xOffset.toFixed(2)} mm, Y=${yOffset.toFixed(2)} mm`);
    }

    // 初始化版本搜索
    document.addEventListener('DOMContentLoaded', () => {
      const searchInput = document.getElementById('versionSearch');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          versionsExpanded = true;
          renderVersions(e.target.value);
        });
      }
      
      // 日期选择器事件
      const dateSelect = document.getElementById('dateSelect');
      if (dateSelect) {
        dateSelect.addEventListener('change', updateDownloadButton);
      }
    });

    init();

    // ==================== 12. 窗口尺寸限制 ====================
    /*
     * 窗口最小尺寸检测
     * 最小宽度：1024px
     * 最小高度：600px
     * 当窗口小于最小尺寸时，显示警告提示
     */
    const MIN_WIDTH = 720;
    const MIN_HEIGHT = 540;

    function checkWindowSize() {
      const warning = document.getElementById('sizeWarning');
      if (window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT) {
        warning.style.display = 'flex';
      } else {
        warning.style.display = 'none';
      }
    }

    window.addEventListener('resize', checkWindowSize);
    checkWindowSize();

    // ==================== 外观主题三态控制系统 ====================
    let currentThemeMode = 'light';

    // 1. 核心状态分配器
    function setThemeMode(mode, event) {
      currentThemeMode = mode;
      document.documentElement.setAttribute('data-theme-mode', mode);

      // 如果选择跟随系统，则检测系统偏好；否则直接使用选择的模式
      const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      applyThemeWithTransition(isDark, event, true);
    }

    // 2. 侧边栏按钮兼容逻辑（强制切换具体的明暗）
    function toggleDarkMode(event) {
      const isDark = document.documentElement.classList.contains('dark');
      setThemeMode(isDark ? 'light' : 'dark', event);
    }

    // 3. 原生圆形扩散动画渲染器
    function applyThemeWithTransition(isDark, event, forceApply = false) {
      const html = document.documentElement;
      const currentlyDark = html.classList.contains('dark');
      
      if (currentlyDark === isDark && !forceApply) return;

      const toggleTheme = () => {
        html.classList.toggle('dark', isDark);
        const icon = document.querySelector('.dark-icon-sun path');
        if (icon) {
          if (isDark) {
             icon.setAttribute('d', 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z');
          } else {
             icon.setAttribute('d', 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-2.25l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z');
          }
        }
      };

      if (!event || !document.startViewTransition) {
        toggleTheme();
        return;
      }

      const x = event && event.clientX !== undefined ? event.clientX : window.innerWidth / 2;
      const y = event && event.clientY !== undefined ? event.clientY : window.innerHeight / 2;
      const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

      const transition = document.startViewTransition(() => {
        toggleTheme();
      });

      transition.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
          { duration: 400, easing: "ease-out", pseudoElement: "::view-transition-new(root)" }
        );
      });
    }

    // 4. 监听系统级夜间模式切换
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (currentThemeMode === 'system') {
        applyThemeWithTransition(e.matches, null, false);
      }
    });

    // 初始化防御
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.documentElement.hasAttribute('data-theme-mode')) {
        document.documentElement.setAttribute('data-theme-mode', 'light');
      }
    });