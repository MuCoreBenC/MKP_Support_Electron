// ==================== 外观主题三态控制系统 ====================
let currentThemeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';
window.__mkpExternalStorageSyncApplying = window.__mkpExternalStorageSyncApplying === true;

// 🚀 全局主色调数据字典 (已替换为 Bambu Lab 官方拓竹绿)
const THEME_PALETTE = {
  blue: { name: '蔚蓝', rgb: '59, 130, 246' },
  emerald: { name: '翠绿', rgb: '16, 185, 129' },
  violet: { name: '紫罗兰', rgb: '139, 92, 246' },
  orange: { name: '橙黄', rgb: '245, 158, 11' },
  rose: { name: '玫瑰', rgb: '244, 63, 94' },
  pink: { name: '猛男粉', rgb: '236, 72, 153' },
  green: { name: '拓竹本色', rgb: '0, 174, 66' }, // 💡 官方纯正 RGB
  purple: { name: '深邃紫', rgb: '168, 85, 247' }
};

const DEF_VER_THEMES = {
  standard: { rgb: '59, 130, 246', key: 'blue' },
  quick: { rgb: '245, 158, 11', key: 'amber' },
  lite: { rgb: '168, 85, 247', key: 'purple' }
};

function initTheme() {
  const savedMode = localStorage.getItem('themeMode') || 'light';
  const savedColor = localStorage.getItem('appThemeColor') || 'blue';
  
  currentThemeMode = savedMode;
  const isDark = savedMode === 'dark' || savedMode === 'oled' || (savedMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  document.documentElement.setAttribute('data-theme-mode', savedMode);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('oled', savedMode === 'oled'); // 应用极简黑

  if (window.mkpAPI && window.mkpAPI.setNativeTheme) {
    window.mkpAPI.setNativeTheme(isDark ? 'dark' : 'light');
  }

  if (savedColor === 'custom') {
      const customRgb = localStorage.getItem('customThemeRgb') || '59, 130, 246';
      setCustomThemeColorRaw(customRgb);
  } else {
      setGlobalThemeColor(savedColor);
  }

  ['standard', 'quick', 'lite'].forEach(ver => {
     const saved = localStorage.getItem(`theme_ver_${ver}`);
     if (saved) {
         const p = JSON.parse(saved);
         setVersionTheme(ver, p.rgb, p.key);
     } else {
         setVersionTheme(ver, DEF_VER_THEMES[ver].rgb, DEF_VER_THEMES[ver].key);
     }
  });
}

function setGlobalThemeColor(colorKey) {
  const color = THEME_PALETTE[colorKey] || THEME_PALETTE.blue;
  document.documentElement.style.setProperty('--primary-rgb', color.rgb);
  if (!window.__mkpExternalStorageSyncApplying) {
    localStorage.setItem('appThemeColor', colorKey);
  }

  document.querySelectorAll('.global-color-btn').forEach(btn => {
     if(btn.dataset.color === colorKey) btn.classList.add('active');
     else btn.classList.remove('active');
  });
}

// ============================================================
// 🎨 自研 Figma 级纯 JS 色彩交互引擎 (HSV/RGB 实时转换)
// ============================================================

let colorHSV = { h: 0, s: 100, v: 100 };
let isDraggingBoard = false;
let isDraggingHue = false;

// 1. 初始化引擎事件监听
function initFigmaColorPicker() {
    if(window._colorPickerInit) return; // 防重复绑定
    window._colorPickerInit = true;

    const board = document.getElementById('colorBoard');
    const hue = document.getElementById('hueSlider');

    // 鼠标按下触发拖拽
    board.addEventListener('mousedown', (e) => { isDraggingBoard = true; updateBoard(e); });
    hue.addEventListener('mousedown', (e) => { isDraggingHue = true; updateHue(e); });

    // 鼠标移动实时计算 (绑定在 window 上防止拖拽过快脱离区域)
    window.addEventListener('mousemove', (e) => {
        if (isDraggingBoard) updateBoard(e);
        if (isDraggingHue) updateHue(e);
    });

    // 鼠标抬起释放拖拽
    window.addEventListener('mouseup', () => {
        isDraggingBoard = false;
        isDraggingHue = false;
    });
}

// 2. 二维画板 (S 与 V 计算)
function updateBoard(e) {
    const board = document.getElementById('colorBoard');
    const rect = board.getBoundingClientRect();
    let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    colorHSV.s = (x / rect.width) * 100;
    colorHSV.v = 100 - ((y / rect.height) * 100);
    updateColorUI();
}

// 3. 一维滑块 (Hue 色相计算)
function updateHue(e) {
    const hue = document.getElementById('hueSlider');
    const rect = hue.getBoundingClientRect();
    let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

    colorHSV.h = (x / rect.width) * 360;
    updateColorUI();
}

// 4. HSV 矩阵转 RGB (核心级显卡算法)
function hsvToRgb(h, s, v) {
    s = s / 100; v = v / 100;
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h <= 360) { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r, g, b) {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

// HEX 转 HSV (回显用)
function hexToHsv(hex) {
    let r = parseInt(hex.slice(0, 2), 16) / 255;
    let g = parseInt(hex.slice(2, 4), 16) / 255;
    let b = parseInt(hex.slice(4, 6), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
}

// 5. 渲染 UI 与游标位置
function updateColorUI(updateInput = true) {
    const rgb = hsvToRgb(colorHSV.h, colorHSV.s, colorHSV.v);
    const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);

    // 画板底色 (永远保持当前色相的最高亮度和最高饱和度)
    const baseRgb = hsvToRgb(colorHSV.h, 100, 100);
    document.getElementById('colorBoard').style.backgroundColor = `rgb(${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]})`;

    // 移动那两个可爱的白圈游标
    document.getElementById('colorThumb').style.left = `${colorHSV.s}%`;
    document.getElementById('colorThumb').style.top = `${100 - colorHSV.v}%`;
    document.getElementById('hueThumb').style.left = `${(colorHSV.h / 360) * 100}%`;

    // 更新预览方块和输入框
    document.getElementById('finalColorPreview').style.backgroundColor = `#${hex}`;
    if (updateInput) document.getElementById('hexColorInput').value = hex;
}

function syncFromInput(val) {
    let hex = val.replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length === 6) {
        colorHSV = hexToHsv(hex);
        updateColorUI(false);
    }
}

// 6. 弹窗控制
function openCustomColorPicker() {
    initFigmaColorPicker(); // 按需挂载引擎
    
    const modal = document.getElementById('mkp-color-modal');
    const card = document.getElementById('mkp-color-card');
    
    // 获取之前的颜色来回显
    let savedHex = localStorage.getItem('customThemeHex') || '#3B82F6';
    if (savedHex.startsWith('#')) savedHex = savedHex.substring(1);
    
    colorHSV = hexToHsv(savedHex);
    document.getElementById('hexColorInput').value = savedHex;
    updateColorUI(false); // 强制刷一次游标位置

    modal.classList.remove('opacity-0', 'pointer-events-none');
    card.classList.remove('scale-95');
}

function closeCustomColorPicker() {
    const modal = document.getElementById('mkp-color-modal');
    const card = document.getElementById('mkp-color-card');
    modal.classList.add('opacity-0', 'pointer-events-none');
    card.classList.add('scale-95');
}

function applyCustomColor() {
    const hexInput = document.getElementById('hexColorInput').value;
    let pureHex = hexInput.replace(/[^0-9A-Fa-f]/ig, '').substring(0, 6);
    if (pureHex.length !== 6) pureHex = '3B82F6'; 
    
    const fullHex = '#' + pureHex;
    
    // 利用咱们刚才的 HSV 引擎最后算一次 RGB 数组
    const rgbArr = hsvToRgb(colorHSV.h, colorHSV.s, colorHSV.v);
    const rgbStr = `${rgbArr[0]}, ${rgbArr[1]}, ${rgbArr[2]}`;
    
    setCustomThemeColorRaw(rgbStr);
    localStorage.setItem('customThemeHex', fullHex); 
    closeCustomColorPicker();
}

// 暴露 API
window.openCustomColorPicker = openCustomColorPicker;
window.closeCustomColorPicker = closeCustomColorPicker;
window.syncFromInput = syncFromInput;
window.applyCustomColor = applyCustomColor;

function setCustomThemeColorRaw(rgbStr) {
  document.documentElement.style.setProperty('--primary-rgb', rgbStr);
  if (!window.__mkpExternalStorageSyncApplying) {
    localStorage.setItem('appThemeColor', 'custom');
    localStorage.setItem('customThemeRgb', rgbStr);
  }

  document.querySelectorAll('.global-color-btn').forEach(btn => btn.classList.remove('active'));
  const customBtn = document.getElementById('customColorBtnWrapper');
  if (customBtn) customBtn.classList.add('active');
}

function setVersionTheme(version, rgbValue, colorKey) {
  const root = document.documentElement;
  if (colorKey === 'follow') root.style.setProperty(`--ver-${version}-rgb`, `var(--primary-rgb)`);
  else root.style.setProperty(`--ver-${version}-rgb`, rgbValue);

  if (!window.__mkpExternalStorageSyncApplying) {
    localStorage.setItem(`theme_ver_${version}`, JSON.stringify({rgb: rgbValue, key: colorKey}));
  }

  document.querySelectorAll(`.version-color-btn[data-version="${version}"]`).forEach(btn => {
     if(btn.dataset.color === colorKey) btn.classList.add('active');
     else btn.classList.remove('active');
  });
  if (window.selectedVersion === version && typeof window.updateSidebarVersionBadge === 'function') {
    window.updateSidebarVersionBadge(version);
  }
}

function setThemeMode(mode, event) {
  if (currentThemeMode === mode) return; 
  currentThemeMode = mode;
  if (!window.__mkpExternalStorageSyncApplying) {
    localStorage.setItem('themeMode', mode);
  }
  
  // 💡 新增神级细节：只要用户点过 'dark' 或 'oled'，就把它记作“我最爱的黑夜模式”
  if (mode === 'dark' || mode === 'oled') {
      if (!window.__mkpExternalStorageSyncApplying) {
        localStorage.setItem('preferredDarkMode', mode);
      }
  }
  
  const isDark = mode === 'dark' || mode === 'oled' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  executeThemeTransition(mode, isDark, event);
}

function toggleDarkMode(event) {
  const isDark = document.documentElement.classList.contains('dark');
  // 💡 核心修复：读取用户最爱的黑夜模式，如果没有，默认给 'dark'
  const preferredDark = localStorage.getItem('preferredDarkMode') || 'dark';
  // 如果当前是黑夜，切成白天；如果当前是白天，切成他最爱的黑夜！
  setThemeMode(isDark ? 'light' : preferredDark, event);
}

function executeThemeTransition(mode, isDark, event) {
  const html = document.documentElement;
  const applyDOMChanges = () => {
    html.setAttribute('data-theme-mode', mode);
    html.classList.toggle('dark', isDark);
    html.classList.toggle('oled', mode === 'oled'); // 赋予极简黑身份

    // 动态刷新那 4 个卡片的外观高亮
    ['light', 'dark', 'oled', 'system'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if(btn) {
            if (m === mode) {
                btn.classList.add('theme-border');
                btn.style.backgroundColor = 'rgba(var(--primary-rgb), 0.05)';
            } else {
                btn.classList.remove('theme-border');
                btn.style.backgroundColor = 'transparent';
            }
        }
    });

    // 💡 核心神级修复：必须把真实的 'system' 传给主进程！
    // 只有传入 'system'，Electron 的 nativeTheme.themeSource 才会解除强制锁定，恢复读取 Windows 系统的真实颜色。
    if (window.mkpAPI && window.mkpAPI.setNativeTheme) {
        const nativeMode = mode === 'oled' ? 'dark' : mode; // 只能传 'light', 'dark', 或 'system'
        window.mkpAPI.setNativeTheme(nativeMode); 
    }
  };

  // 兼容不支持 View Transitions API 的环境
  if (!document.startViewTransition) { applyDOMChanges(); return; }

  // 炫酷的圆圈扩散动画
  const x = (event && event.clientX !== undefined) ? event.clientX : window.innerWidth / 2;
  const y = (event && event.clientY !== undefined) ? event.clientY : window.innerHeight / 2;
  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(() => { applyDOMChanges(); });
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
      { duration: 400, easing: "ease-out", pseudoElement: "::view-transition-new(root)" }
    );
  });
}
function initSystemThemeListener() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentThemeMode === 'system') executeThemeTransition('system', e.matches, null);
  });
}

// 暴露全局变量
window.openCustomColorPicker = openCustomColorPicker;
window.closeCustomColorPicker = closeCustomColorPicker;
window.syncColorFromNative = syncColorFromNative;
window.syncColorFromHex = syncColorFromHex;
window.applyCustomColor = applyCustomColor;
