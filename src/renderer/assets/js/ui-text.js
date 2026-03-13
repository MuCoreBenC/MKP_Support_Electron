function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function setPlaceholder(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.setAttribute('placeholder', value);
  }
}

function setTitleAttr(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.setAttribute('title', value);
  }
}

function initUIText() {
  document.title = '支撑面改善工具 (MKP SupportE)';

  setTitleAttr('#btn-toggle-sidebar', '折叠侧边栏');
  setText('#text-nav-home', '选择机型');
  setText('#text-nav-download', '下载预设');
  setText('#text-nav-calibrate', '校准偏移');
  setText('#text-nav-params', '修改参数');
  setText('#text-nav-versions', '版本控制');
  setText('#text-nav-faq', '常见问题');
  setText('#text-nav-about', '关于软件');
  setText('#text-nav-darkmode', '外观模式');
  setText('#text-nav-theme', '软件设置');

  setText('#title-page-home', '选择机型');
  setText('#title-page-download', '模型预设');
  setText('#title-page-calibrate', '校准偏移');
  setText('#title-page-params', '修改参数');
  setText('#title-page-versions', '版本控制');
  setText('#title-page-faq', '常见问题');
  setText('#title-page-about', '关于软件');
  setText('#title-page-settings', '软件设置');
  setText('#contextMenuFavoriteText', '收藏此机型');

  setPlaceholder('#printerSearch', '搜索机型...');
  setPlaceholder('#localSearchInput', '搜索文件名...');
  setPlaceholder('#mkp-modal-input', '请输入内容');

  const brandListTitle = document.querySelector('#page-home .col-span-3 .text-sm.font-medium.text-gray-500');
  if (brandListTitle) {
    brandListTitle.textContent = '品牌列表';
  }

  setText('#currentBrandTitle', '拓竹 - Bambu版');

  setTitleAttr('#btnMultiSelect', '批量管理');
  setText('#checkUpdateBtn span', '检查预设');
  setText('#localBatchSummary', '批量模式已开启，可点击卡片或使用右键菜单。');

  setText('#mkp-modal-cancel', '取消');
  setText('#mkp-modal-confirm', '确定');

  setText('#contextMenuFavoriteText', '收藏此机型');
  setText('#leftBtn', '跳过引导');
  setText('#rightBtn', '下一步');

  const pageDownloadSub = document.querySelector('#page-download .page-header-sub p');
  if (pageDownloadSub) {
    pageDownloadSub.textContent = '选择版本类型和发布日期以获取对应的预设配置';
  }

  const downloadSectionTitles = document.querySelectorAll('#page-download h2.text-base.font-semibold');
  if (downloadSectionTitles[0]) {
    downloadSectionTitles[0].textContent = '选择版本类型';
  }
  if (downloadSectionTitles[1]) {
    downloadSectionTitles[1].textContent = '本地预设';
  }
  if (downloadSectionTitles[2]) {
    downloadSectionTitles[2].textContent = '在线预设';
  }

  const downloadSectionDescs = document.querySelectorAll('#page-download p.text-xs.text-gray-500');
  if (downloadSectionDescs[0]) {
    downloadSectionDescs[0].textContent = '根据您的打印机配置选择合适的版本';
  }
  if (downloadSectionDescs[1]) {
    downloadSectionDescs[1].textContent = '已存放在您电脑中的配置，支持拖拽排序、搜索、多选和右键管理';
  }
  if (downloadSectionDescs[2]) {
    downloadSectionDescs[2].textContent = '云端最新的配置文件，下载后将出现在本地预设中';
  }

  const downloadPrevLabel = document.querySelector('#btn-download-prev span');
  if (downloadPrevLabel) {
    downloadPrevLabel.textContent = '上一步';
  }

  const downloadNextLabel = document.querySelector('#downloadBtn span');
  if (downloadNextLabel) {
    downloadNextLabel.textContent = '下一步';
  }

  const homeNextLabel = document.querySelector('#btn-home-next span');
  if (homeNextLabel) {
    homeNextLabel.textContent = '下一步';
  }

  const hintLabel = document.querySelector('#downloadHintWrapper span');
  if (hintLabel) {
    hintLabel.textContent = '请完成选项';
  }

  const localEmptyLabel = document.querySelector('#localEmptyState p');
  if (localEmptyLabel) {
    localEmptyLabel.textContent = '请先在上方选择「版本类型」';
  }

  const onlineEmptyLabel = document.querySelector('#onlineEmptyState p');
  if (onlineEmptyLabel) {
    onlineEmptyLabel.textContent = '点击上方的“检查预设”获取云端预设';
  }

  setPlaceholder('#versionSearch', '搜索版本号或更新描述...');

  const faqPageSub = document.querySelector('#page-faq .page-header-sub p');
  if (faqPageSub) {
    faqPageSub.textContent = '以下是用户最常遇到的问题及解决方案';
  }

  const aboutIntro = document.querySelector('#page-about .text-sm.theme-text.opacity-80.mt-1');
  if (aboutIntro) {
    aboutIntro.textContent = '请加入我们的 QQ 群或查看视频教程获取更多帮助';
  }

  const bugTitle = document.querySelector('#setting-update .mt-6 .text-sm.font-medium');
  if (bugTitle) {
    bugTitle.textContent = '遇到 Bug 或卡顿？';
  }

  const bugDesc = document.querySelector('#setting-update .mt-6 .text-xs.text-gray-500');
  if (bugDesc) {
    bugDesc.textContent = '请生成诊断报告，发送至官方 QQ 群以获取协助';
  }

  const bugReportButton = document.querySelector('#setting-update button[onclick="if(window.mkpAPI) window.mkpAPI.exportBugReport()"]');
  if (bugReportButton) {
    bugReportButton.lastChild.textContent = '生成诊断报告 (至桌面)';
  }

  const colorTitle = document.querySelector('#mkp-color-card h3');
  if (colorTitle) {
    colorTitle.textContent = '自定义主题色';
  }

  const colorApply = document.querySelector('#mkp-color-card button[onclick="applyCustomColor()"]');
  if (colorApply) {
    colorApply.textContent = '确认应用';
  }

  const wizardSummaryLabel = document.querySelector('#wizardSummaryBar > span:first-child');
  if (wizardSummaryLabel) {
    wizardSummaryLabel.textContent = '当前选择:';
  }

  const wizardBrandsLabel = document.querySelector('#stepContent1 .w-32 .text-\\[11px\\]');
  if (wizardBrandsLabel) {
    wizardBrandsLabel.textContent = '品牌';
  }

  const wizardModelsLabel = document.querySelector('#stepContent1 .flex-1 .text-\\[11px\\]');
  if (wizardModelsLabel) {
    wizardModelsLabel.textContent = '机型';
  }

  const stepTwoHint = document.querySelector('#stepContent2 > div:first-child');
  if (stepTwoHint) {
    stepTwoHint.textContent = '为该机型选择需要应用的预设版本';
  }

  const stepThreeHint = document.querySelector('#stepContent3 > div:first-child');
  if (stepThreeHint) {
    stepThreeHint.textContent = '当前配置偏移参数预览';
  }

  const stepThreeFooter = document.querySelector('#stepContent3 .text-xs.text-gray-400.text-center');
  if (stepThreeFooter) {
    stepThreeFooter.textContent = '以上参数仅供参考，请在实际使用中进行视觉校准';
  }
}

document.addEventListener('DOMContentLoaded', initUIText);
