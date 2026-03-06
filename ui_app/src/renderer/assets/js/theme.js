// ==================== 外观主题三态控制系统 ====================
let currentThemeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';

// 🚀 全局主色调数据字典
const THEME_PALETTE = {
  blue: { name: '蔚蓝', rgb: '59, 130, 246' },
  emerald: { name: '翠绿', rgb: '16, 185, 129' },
  violet: { name: '紫罗兰', rgb: '139, 92, 246' },
  orange: { name: '橙黄', rgb: '245, 158, 11' },
  rose: { name: '玫瑰', rgb: '244, 63, 94' },
  pink: { name: '猛男粉', rgb: '236, 72, 153' },
  green: { name: '极客绿', rgb: '34, 197, 94' },
  purple: { name: '深邃紫', rgb: '168, 85, 247' }
};

// 🚀 版本颜色的默认值
const DEF_VER_THEMES = {
  standard: { rgb: '59, 130, 246', key: 'blue' },
  quick: { rgb: '245, 158, 11', key: 'amber' },
  lite: { rgb: '168, 85, 247', key: 'purple' }
};

function initTheme() {
  const savedMode = localStorage.getItem('themeMode') || 'light';
  const savedColor = localStorage.getItem('appThemeColor') || 'blue';
  
  setThemeMode(savedMode, null);
  setGlobalThemeColor(savedColor);

  // 初始化版本的跟随状态
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
  localStorage.setItem('appThemeColor', colorKey);

  // 刷新所有全局调色板的锁定光环
  document.querySelectorAll('.global-color-btn').forEach(btn => {
     if(btn.dataset.color === colorKey) btn.classList.add('active');
     else btn.classList.remove('active');
  });
}

// 核心优化：版本颜色现在只接收纯 RGB！
function setVersionTheme(version, rgbValue, colorKey) {
  const root = document.documentElement;
  
  // 如果是跟随主题魔法，就映射到 --primary-rgb 变量
  if (colorKey === 'follow') {
     root.style.setProperty(`--ver-${version}-rgb`, `var(--primary-rgb)`);
  } else {
     root.style.setProperty(`--ver-${version}-rgb`, rgbValue);
  }

  localStorage.setItem(`theme_ver_${version}`, JSON.stringify({rgb: rgbValue, key: colorKey}));

  // 刷新该版本所在行的锁定光环
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
  localStorage.setItem('themeMode', mode);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  executeThemeTransition(mode, isDark, event);
}

function toggleDarkMode(event) {
  const isDark = document.documentElement.classList.contains('dark');
  setThemeMode(isDark ? 'light' : 'dark', event);
}

function executeThemeTransition(mode, isDark, event) {
  const html = document.documentElement;
  const applyDOMChanges = () => {
    html.setAttribute('data-theme-mode', mode);
    html.classList.toggle('dark', isDark);

    const icon = document.querySelector('.dark-icon-sun path');
    if (icon) {
      if (isDark) icon.setAttribute('d', 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z');
      else icon.setAttribute('d', 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-2.25l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z');
    }
    if (window.mkpAPI && window.mkpAPI.setNativeTheme) window.mkpAPI.setNativeTheme(mode);
  };

  if (!document.startViewTransition) { applyDOMChanges(); return; }

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initTheme, setThemeMode, toggleDarkMode, setVersionTheme, initSystemThemeListener, setGlobalThemeColor };
}