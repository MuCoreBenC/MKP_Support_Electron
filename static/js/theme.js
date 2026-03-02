window.currentThemeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';

    // 核心动画执行器（将所有视觉改变打包到一起，防止动画被浏览器取消）
    window.executeThemeTransition = function(mode, isDark, event) {
      const html = document.documentElement;

      // 把所有的 DOM 改变全部集中在这个函数里
      const applyDOMChanges = () => {
        window.currentThemeMode = mode;
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
      };

      if (!document.startViewTransition) {
        applyDOMChanges();
        return;
      }

      // 智能获取扩散圆心坐标（鼠标点击位置 或 屏幕正中心）
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
    };

    // 1. 卡片点击分发器
    window.setThemeMode = function(mode, event) {
      if (window.currentThemeMode === mode) return;
      const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      window.executeThemeTransition(mode, isDark, event);
    };

    // 2. 侧边栏按钮兼容逻辑
    window.toggleDarkMode = function(event) {
      const isDark = document.documentElement.classList.contains('dark');
      window.setThemeMode(isDark ? 'light' : 'dark', event);
    };

    // 3. 监听系统级夜间模式自动切换
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (window.currentThemeMode === 'system') {
        window.executeThemeTransition('system', e.matches, null);
      }
    });

    // 初始化防御机制
    if (!document.documentElement.hasAttribute('data-theme-mode')) {
      document.documentElement.setAttribute('data-theme-mode', 'light');
    }