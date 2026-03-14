function skipOnboarding() {
  const onboarding = document.getElementById('onboarding');
  if (!onboarding) return;

  if (document.documentElement.hasAttribute('data-hide-onboarding')) {
    onboarding.style.display = 'none';
    return;
  }

  onboarding.classList.add('animate-fade-out');
  setTimeout(() => {
    onboarding.style.display = 'none';
  }, 200);
}

function completeOnboarding() {
  selectedBrand = wizardSelectedBrand;
  selectedPrinter = wizardSelectedPrinter;
  selectedVersion = wizardSelectedVersion;
  saveUserConfig();

  selectPrinter(selectedPrinter, true);

  const onboarding = document.getElementById('onboarding');
  if (!onboarding) return;

  onboarding.classList.add('animate-fade-out');
  setTimeout(() => {
    onboarding.style.display = 'none';
    const targetNav = document.querySelector('[data-page="calibrate"]');
    if (targetNav) targetNav.click();
  }, 200);
}

function goToStep(step) {
  currentStep = step;

  for (let index = 1; index <= 3; index++) {
    const stepItem = document.getElementById(`step${index}`);
    const stepContent = document.getElementById(`stepContent${index}`);
    if (!stepItem || !stepContent) continue;

    if (index < step) {
      stepItem.classList.remove('active');
      stepItem.classList.add('completed');
      stepContent.classList.add('hidden');
    } else if (index === step) {
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
  if (!brandList) return;

  brandList.innerHTML = '';

  brands.forEach((brand) => {
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

  printers.forEach((printer) => {
    if (printer.disabled) return;

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
  });
}

function updateWizardOffsets(printer) {
  document.getElementById('wizardXOffset').textContent = printer.xOffset.toFixed(2);
  document.getElementById('wizardYOffset').textContent = printer.yOffset.toFixed(2);
  document.getElementById('wizardZOffset').textContent = printer.zOffset.toFixed(2);

  const selectedModelBadge = document.getElementById('selectedModelBadge');
  if (selectedModelBadge) {
    selectedModelBadge.textContent = printer.name;
    selectedModelBadge.classList.remove('hidden');
  }
}

function updateWizardBadges(printerName, versionType) {
  const summaryBar = document.getElementById('wizardSummaryBar');
  const modelBadge = document.getElementById('selectedModelBadge');
  const versionBadge = document.getElementById('selectedVersionBadge');

  if (printerName && summaryBar && modelBadge) {
    summaryBar.classList.remove('hidden');
    summaryBar.classList.add('flex');
    modelBadge.textContent = printerName;
    modelBadge.classList.remove('hidden');
  }

  if (versionType && versionBadge) {
    const theme = VERSION_THEMES[versionType];
    if (theme) {
      versionBadge.textContent = theme.title;
      versionBadge.style.setProperty('background-color', theme.bg, 'important');
      versionBadge.style.setProperty('color', theme.text, 'important');
      versionBadge.style.setProperty('border-color', 'transparent', 'important');
      versionBadge.classList.remove('hidden');
    }
  } else if (versionBadge) {
    versionBadge.classList.add('hidden');
  }
}

function renderWizardVersions(printerData) {
  renderVersionCards('wizardVersionList', printerData, wizardSelectedVersion, (versionType) => {
    wizardSelectedVersion = versionType;
    renderWizardVersions(printerData);
    updateWizardBadges(printerData.name, versionType);
    updateWizardButtons();
  });
}

function updateWizardButtons() {
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  if (!leftBtn || !rightBtn) return;

  if (currentStep === 1) {
    leftBtn.textContent = '跳过引导';
    leftBtn.onclick = skipOnboarding;
    rightBtn.textContent = '下一步';
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

window.skipOnboarding = skipOnboarding;
window.completeOnboarding = completeOnboarding;
window.goToStep = goToStep;
window.renderWizardBrands = renderWizardBrands;
window.renderWizardModels = renderWizardModels;
window.updateWizardOffsets = updateWizardOffsets;
window.updateWizardBadges = updateWizardBadges;
window.renderWizardVersions = renderWizardVersions;
window.updateWizardButtons = updateWizardButtons;
