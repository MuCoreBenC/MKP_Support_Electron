// ==================== 外观主题三态控制系统 (带圆形扩散动画) ====================
let currentThemeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';

// 🚀 新增：全局主色调引擎 (支持未来无限扩展)
const THEME_PALETTE = {
  blue: { name: '蔚蓝', rgb: '59, 130, 246' },      // Tailwind Blue 500
  emerald: { name: '翠绿', rgb: '16, 185, 129' },   // Tailwind Emerald 500
  violet: { name: '紫罗兰', rgb: '139, 92, 246' },  // Tailwind Violet 500
  orange: { name: '橙黄', rgb: '245, 158, 11' },    // Tailwind Amber 500
  rose: { name: '玫瑰', rgb: '244, 63, 94' },        // Tailwind Rose 500
  pink: { name: '猛男粉', rgb: '236, 72, 153' },    // Tailwind Pink 500
  green: { name: '极客绿', rgb: '34, 197, 94' },    // Tailwind Green 500
  purple: { name: '深邃紫', rgb: '168, 85, 247' }   // Tailwind Purple 500
};

// 初始化主题与颜色
function initTheme() {
  const savedMode = localStorage.getItem('themeMode') || 'light';
  const savedColor = localStorage.getItem('appThemeColor') || 'blue'; // 默认蔚蓝
  
  setThemeMode(savedMode, null);
  setGlobalThemeColor(savedColor);
}

// 🚀 新增：切换全局主色调
function setGlobalThemeColor(colorKey) {
  const color = THEME_PALETTE[colorKey] || THEME_PALETTE.blue;
  // 将 RGB 值注入到 HTML 根节点，供 CSS 全局调用
  document.documentElement.style.setProperty('--primary-rgb', color.rgb);
  localStorage.setItem('appThemeColor', colorKey);
}

// 1. 卡片点击分发器
function setThemeMode(mode, event) {
  if (currentThemeMode === mode) return; 
  
  currentThemeMode = mode;
  localStorage.setItem('themeMode', mode);
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  executeThemeTransition(mode, isDark, event);
}

// 2. 侧边栏按钮逻辑
function toggleDarkMode(event) {
  const isDark = document.documentElement.classList.contains('dark');
  setThemeMode(isDark ? 'light' : 'dark', event);
}

// 3. 核心动画执行器
function executeThemeTransition(mode, isDark, event) {
  const html = document.documentElement;

  const applyDOMChanges = () => {
    html.setAttribute('data-theme-mode', mode);
    html.classList.toggle('dark', isDark);

    const icon = document.querySelector('.dark-icon-sun path');
    if (icon) {
      if (isDark) {
         icon.setAttribute('d', 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z');
      } else {
         icon.setAttribute('d', 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-2.25l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z');
      }
    }

    if (window.mkpAPI && window.mkpAPI.setNativeTheme) {
          window.mkpAPI.setNativeTheme(mode);
        }
  };

  if (!document.startViewTransition) {
    applyDOMChanges();
    return;
  }

  const x = (event && event.clientX !== undefined) ? event.clientX : window.innerWidth / 2;
  const y = (event && event.clientY !== undefined) ? event.clientY : window.innerHeight / 2;
  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(() => {
    applyDOMChanges();
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
      { duration: 400, easing: "ease-out", pseudoElement: "::view-transition-new(root)" }
    );
  });
}

function initSystemThemeListener() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentThemeMode === 'system') {
      executeThemeTransition('system', e.matches, null);
    }
  });
}

function setVersionTheme(version, textHex, bgHex) {
  const root = document.documentElement;
  root.style.setProperty(`--theme-${version}-text`, textHex);
  root.style.setProperty(`--theme-${version}-bg`, bgHex);
  
  if (window.selectedVersion === version && typeof updateSidebarVersionBadge === 'function') {
    updateSidebarVersionBadge(version);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initTheme, setThemeMode, toggleDarkMode, setVersionTheme, initSystemThemeListener, setGlobalThemeColor };
}