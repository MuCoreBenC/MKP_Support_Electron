let brandPrefixSyncFrame = 0;

function syncBrandPrefixVisibility() {
  const appRoot = document.getElementById('mainApp');
  if (!appRoot) return;

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const shouldCompact = viewportWidth <= 1002 || (viewportWidth <= 1133 && !sidebarCollapsed);
  appRoot.classList.toggle('compact-brand-prefix', shouldCompact);
}

function requestBrandPrefixVisibilitySync() {
  if (brandPrefixSyncFrame) {
    cancelAnimationFrame(brandPrefixSyncFrame);
  }

  brandPrefixSyncFrame = requestAnimationFrame(() => {
    brandPrefixSyncFrame = 0;
    syncBrandPrefixVisibility();
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('sidebarWrapper');
  if (!sidebar || !wrapper) return;

  sidebarCollapsed = !sidebarCollapsed;
  Logger.info("Toggle UI: sidebar, collapsed:" + sidebarCollapsed);

  sidebar.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  wrapper.classList.toggle('sidebar-wrapper-collapsed', sidebarCollapsed);
  requestBrandPrefixVisibilitySync();
}

function updateSidebarVersionBadge(version) {
  const badge = document.getElementById('sidebarVersionBadge');
  if (!badge) return;

  const theme = VERSION_THEMES[version];
  if (theme) {
    badge.textContent = theme.title;
    badge.style.setProperty('background-color', theme.bg, 'important');
    badge.style.setProperty('color', theme.text, 'important');
  } else {
    badge.textContent = '未选择';
    badge.style.removeProperty('background-color');
    badge.style.removeProperty('color');
  }
}

function selectPrinter(printerId, keepVersion = false) {
  Logger.info(`[O202] Select printer, p:${printerId}`);
  if (typeof clearOnlineListUI === 'function') clearOnlineListUI();

  selectedPrinter = printerId;
  const selectedPrinterObj = getPrinterObj(printerId);
  if (!selectedPrinterObj) return;

  const matchedBrand = brands.find((brand) => printersByBrand[brand.id].some((printer) => printer.id === printerId));
  if (matchedBrand) {
    selectedBrand = matchedBrand.id;
  }

  if (!keepVersion) selectedVersion = null;

  const sidebarBrand = document.getElementById('sidebarBrand');
  const sidebarModelName = document.getElementById('sidebarModelName');

  if (sidebarBrand && matchedBrand) {
    sidebarBrand.textContent = matchedBrand.shortName;
  }
  if (sidebarModelName) {
    sidebarModelName.textContent = selectedPrinterObj.shortName;
  }

  updateSidebarVersionBadge(selectedVersion);
  saveUserConfig();
  renderBrands();
  renderPrinters(selectedBrand);
  renderDownloadVersions(selectedPrinterObj);
}

function renderBrands() {
  const brandList = document.getElementById('brandList');
  if (!brandList) return;

  brandList.innerHTML = '';

  const sortedBrands = [...brands].sort((left, right) => {
    if (left.favorite && !right.favorite) return -1;
    if (!left.favorite && right.favorite) return 1;
    return left.name.localeCompare(right.name);
  });

  sortedBrands.forEach((brand) => {
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
  Logger.info(`[O201] Select brand, b:${brandId}`);
  selectedBrand = brandId;
  renderBrands();
  renderPrinters(brandId);

  const brand = brands.find((item) => item.id === brandId);
  const currentBrandTitle = document.getElementById('currentBrandTitle');
  if (brand && currentBrandTitle) {
    currentBrandTitle.textContent = `${brand.name}${brand.subtitle ? ' - ' + brand.subtitle : ''}`;
  }
}

function toggleBrandFavorite(brandId) {
  Logger.info(`[O204] Toggle fav, b:${brandId}`);
  const brand = brands.find((item) => item.id === brandId);
  if (!brand) return;

  brand.favorite = !brand.favorite;
  renderBrands();
}

function toggleFavorite(event, printerId) {
  event.stopPropagation();
  Logger.info(`[O204] Toggle fav, p:${printerId}`);

  const printers = printersByBrand[selectedBrand] || [];
  const printer = printers.find((item) => item.id === printerId);
  if (!printer) return;

  printer.favorite = !printer.favorite;
  renderPrinters(selectedBrand);
}

function generatePrinterCardsHtml(printers) {
  return printers.map((printer) => {
    const currentBrandObj = brands.find((brand) => brand.id === selectedBrand);
    const brandPrefix = currentBrandObj ? currentBrandObj.shortName : '';
    let prefixHtml = '';
    let mainName = printer.name;

    if (brandPrefix && printer.name.startsWith(brandPrefix)) {
      mainName = printer.name.substring(brandPrefix.length).trim();
      prefixHtml = `<span class="brand-prefix text-gray-400 font-normal mr-1">${brandPrefix}</span>`;
    } else {
      const parts = printer.name.split(' ');
      if (parts.length > 1) {
        const first = parts[0];
        mainName = printer.name.substring(first.length).trim();
        prefixHtml = `<span class="brand-prefix text-gray-400 font-normal mr-1">${first}</span>`;
      }
    }

    return `
      <div class="select-card rounded-xl p-3 flex flex-col h-full ${printer.id === selectedPrinter ? 'selected' : ''} ${printer.disabled ? 'printer-card-disabled' : ''}"
           ${!printer.disabled ? `onclick="selectPrinter('${printer.id}')"` : ''}
           oncontextmenu="showPrinterContextMenu(event, '${printer.id}')">
         <div class="relative flex items-center justify-center h-6 mb-2 w-full px-5">
           <div class="text-sm font-medium flex items-center justify-center w-full overflow-hidden whitespace-nowrap">
             ${prefixHtml}<span class="truncate text-gray-700 dark:text-gray-200">${mainName}</span>
           </div>
           <div class="absolute right-0 top-1/2 -translate-y-1/2 cursor-pointer z-10" onclick="toggleFavorite(event, '${printer.id}')" title="点击收藏/取消收藏">
             <svg class="w-4 h-4 star-icon ${printer.favorite ? 'favorited' : 'not-favorited'} hover:scale-110 transition-transform"
                  fill="${printer.favorite ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 20 20">
               <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
             </svg>
           </div>
         </div>
         <div class="relative w-full aspect-video flex items-center justify-center mt-auto pointer-events-none">
           <img src="${printer.image}" alt="${printer.name}" class="w-full h-full object-contain drop-shadow-sm">
           ${printer.disabled ? '<div class="absolute bottom-0 left-0 px-2 py-1 rounded bg-gray-200 text-xs text-gray-500">开发中</div>' : ''}
         </div>
      </div>
    `;
  }).join('');
}

function renderPrinters(brandId) {
  const grid = document.getElementById('printerGrid');
  if (!grid) return;

  const rawPrinters = printersByBrand[brandId] || [];
  const printers = [...rawPrinters].sort((left, right) => {
    if (left.favorite && !right.favorite) return -1;
    if (!left.favorite && right.favorite) return 1;
    return 0;
  });

  if (printers.length === 0) {
    grid.innerHTML = '<div class="col-span-3 py-16 text-center"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center"><svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="text-gray-500 mb-2">暂未支持</div><div class="text-sm text-gray-400">敬请期待</div></div>';
    return;
  }

  grid.innerHTML = generatePrinterCardsHtml(printers);
  requestBrandPrefixVisibilitySync();
}

function filterPrinters() {
  const searchInput = document.getElementById('printerSearch');
  const grid = document.getElementById('printerGrid');
  if (!searchInput || !grid) return;

  const search = searchInput.value.toLowerCase();
  const rawPrinters = printersByBrand[selectedBrand] || [];
  const filtered = rawPrinters.filter((printer) => printer.name.toLowerCase().includes(search));

  filtered.sort((left, right) => {
    if (left.favorite && !right.favorite) return -1;
    if (!left.favorite && right.favorite) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="col-span-3 py-8 text-center text-gray-400">未找到匹配的机型</div>';
    return;
  }

  grid.innerHTML = generatePrinterCardsHtml(filtered);
  requestBrandPrefixVisibilitySync();
}

function bindContextMenu() {
  document.addEventListener('contextmenu', (event) => {
    const printerCard = event.target.closest('.select-card');
    if (!printerCard) return;

    event.preventDefault();
    contextMenuTarget = printerCard;
    showContextMenu(event.clientX, event.clientY);
  });

  document.addEventListener('click', hideContextMenu);
}

function showContextMenu(x, y) {
  const contextMenu = document.getElementById('contextMenu');
  if (!contextMenu) return;

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
  const contextMenu = document.getElementById('contextMenu');
  if (contextMenu) {
    contextMenu.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', requestBrandPrefixVisibilitySync);
window.addEventListener('resize', requestBrandPrefixVisibilitySync);

window.toggleSidebar = toggleSidebar;
window.updateSidebarVersionBadge = updateSidebarVersionBadge;
window.selectPrinter = selectPrinter;
window.renderBrands = renderBrands;
window.selectBrand = selectBrand;
window.toggleBrandFavorite = toggleBrandFavorite;
window.toggleFavorite = toggleFavorite;
window.renderPrinters = renderPrinters;
window.filterPrinters = filterPrinters;
window.generatePrinterCardsHtml = generatePrinterCardsHtml;
window.bindContextMenu = bindContextMenu;
window.showContextMenu = showContextMenu;
window.showPrinterContextMenu = showPrinterContextMenu;
window.hideContextMenu = hideContextMenu;
window.syncBrandPrefixVisibility = syncBrandPrefixVisibility;
