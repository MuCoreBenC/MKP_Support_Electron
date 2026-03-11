// ==========================================
// 📦 品牌数据
// ==========================================
const brands = [
  { id: 'bambu', name: '拓竹', shortName: 'Bambu Lab', subtitle: 'Bambu版', favorite: true },
  { id: 'creality', name: '创想三维', shortName: 'Creality', subtitle: '', favorite: false },
  { id: 'prusa', name: '快造科技', shortName: 'Prusa', subtitle: '', favorite: false },
  { id: 'anycubic', name: '纵维立方', shortName: 'Anycubic', subtitle: 'Klipper版', favorite: false },
  { id: 'diy', name: 'DIY', shortName: 'DIY', subtitle: '', favorite: false },
];

// ==========================================
// 🖨️ 机型数据（按品牌分组）
// 彻底移除了废弃的 scriptPaths 和硬编码的偏移量
// 引入 defaultPresets 映射最新的 JSON 预设文件
// ==========================================
const printersByBrand = {
  bambu: [
    { 
      id: 'a1', name: 'Bambu Lab A1', shortName: 'A1', image: 'assets/images/a1.webp', favorite: true, disabled: false, 
      supportedVersions: ['standard', 'quick'], 
      defaultPresets: { standard: 'a1_standard_v3.0.0-r1.json', quick: 'a1_quick_v3.0.0-r1.json' } 
    },
    { 
      id: 'a1mini', name: 'Bambu Lab A1 mini', shortName: 'A1mini', image: 'assets/images/a1mini.webp', favorite: false, disabled: false, 
      supportedVersions: ['standard', 'quick'], 
      defaultPresets: { standard: 'a1mini_standard_v3.0.0-r1.json', quick: 'a1mini_quick_v3.0.0-r1.json' } 
    },
    { 
      id: 'p1s', name: 'Bambu Lab P1S', shortName: 'P1S', image: 'assets/images/p1s.webp', favorite: false, disabled: false, 
      supportedVersions: ['lite'], 
      defaultPresets: { lite: 'p1_lite_v2.4.2-r1.json' } 
    },
    { 
      id: 'x1', name: 'Bambu Lab X1', shortName: 'X1', image: 'assets/images/x1.webp', favorite: false, disabled: false, 
      supportedVersions: ['lite'], 
      defaultPresets: { lite: 'x1_lite_v2.4.2-r1.json' } 
    }
  ],
  creality: [
    { id: 'k1c', name: 'Creality K1C', shortName: 'K1C', image: 'assets/images/k1c.webp', favorite: false, disabled: true, supportedVersions: [], defaultPresets: {} },
    { id: 'k2c', name: 'Creality K2C', shortName: 'K2C', image: 'assets/images/k2c.webp', favorite: false, disabled: true, supportedVersions: [], defaultPresets: {} },
  ],
  prusa: [],
  anycubic: [
    { 
      id: 's1c', name: 'Anycubic S1C', shortName: 'S1C', image: 'assets/images/s1c.webp', favorite: false, disabled: false, 
      supportedVersions: ['lite'], // 💡 修正：根据你云端的 s1c_lite_v1.2.0-r1.json，这里应该是 lite 版
      defaultPresets: { lite: 's1c_lite_v1.2.0-r1.json' } 
    },
  ],
  diy: [
    { 
      id: 'voron24', name: 'VORON 2.4', shortName: 'V2.4', image: 'assets/images/voron24.webp', favorite: false, disabled: false, 
      supportedVersions: ['standard'], 
      defaultPresets: {} // 暂无预设，置空
    },
  ],
};

// ==========================================
// ❓ FAQ 数据数组 (已适配最新版本逻辑)
// ==========================================
const faqData = [
  {
    question: '如何开始使用支撑面改善工具？',
    answer: `<p>1. 首先在<span class="text-blue-600 font-medium">选择机型</span>页面选择您的 3D 打印机型号</p>
      <p>2. 进入<span onclick="navTo('page:download')" class="text-blue-500 hover:text-blue-600 cursor-pointer font-medium hover:underline transition-all">下载预设</span>页面，应用或下载对应的 JSON 预设文件</p>
      <p>3. 在切片软件中配置后处理脚本路径</p>
      <p>4. 在本软件中进行 Z 轴和 XY 轴校准，获取最佳打印效果</p>`
  },
  {
    question: 'Z 轴偏移校准的原理是什么？',
    answer: `<p>Z 轴偏移校准用于微调打印头与打印床之间的极限物理距离。正确的 Z 轴偏移可以确保：</p>
      <p>• 支撑接触面能够完美粘附并容易拆除</p>
      <p>• 避免因过度挤压导致的底层“象脚”或撞床风险</p>
      <p class="text-gray-500 italic">警告：请勿随意大幅度调整负值补偿，以免损坏打印机热床。</p>`
  },
  {
    question: 'XY 轴偏移校准有什么作用？',
    answer: `<p>XY 轴偏移校准用于调整支撑结构与模型之间的水平位置关系。主要作用包括：</p>
      <p>• 确保支撑结构位于正确的位置</p>
      <p>• 提高支撑与模型的接触精度</p>
      <p>• 减少支撑拆除后的残留痕迹</p>`
  },
  {
    question: '后处理脚本如何配置？',
    answer: `<p>在 Bambu Studio 或 OrcaSlicer 中配置后处理脚本：</p>
      <p>1. 打开切片软件，进入<span class="text-blue-600 font-medium">工艺 → 其他</span></p>
      <p>2. 找到<span class="text-blue-600 font-medium">后处理脚本</span>选项框</p>
      <p>3. 点击本软件右上角的<span class="text-blue-600 font-medium">复制路径</span>按钮，将包含 <code>--Json</code> 和 <code>--Gcode</code> 参数的完整命令粘贴进去</p>
      <p>4. 保存设置并重新切片即可生效</p>`
  },
  {
    question: '版本之间有什么区别？',
    answer: `<p><span class="font-medium text-gray-900">标准版：</span>适用于原厂标准喷嘴配置的打印机</p>
      <p><span class="font-medium text-gray-900">快拆版：</span>针对使用第三方快拆喷嘴的物理高度落差进行了专项补偿优化</p>
      <p><span class="font-medium text-gray-900">Lite 版：</span>精简版参数，适用于性能受限的旧款机型</p>
      <p class="text-gray-500 italic">请严格根据您的打印机实际物理配置选择对应版本。</p>`
  },
  {
    question: '如何更新到最新预设？',
    answer: `<p>1. 进入<span onclick="navTo('page:setting')" class="text-blue-500 hover:text-blue-600 cursor-pointer font-medium hover:underline transition-all">软件设置</span>页面</p>
      <p>2. 点击<span class="text-blue-600 font-medium">检查更新</span>按钮</p>
      <p>3. 软件会自动向云端请求最新的 <code>-r</code> 优化微调包，并在后台安全替换您的本地旧文件</p>
      <p class="text-gray-500 italic">建议定期检查更新以获取最新的打印调优参数。</p>`
  },
  // 👇 ！！！新增的社区互助问题，包含绝美的官方跳转按钮！！！
  {
question: '遇到问题如何获取官方帮助？',
    answer: `<p>如果您在使用过程中遇到任何问题、或者想分享您的完美参数，欢迎加入我们的官方交流社区：</p>
      <div class="flex flex-wrap gap-3 mt-3">
        <button onclick="navTo('link:qq')" class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#252526] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#333] rounded-xl transition-all duration-200 text-xs font-medium active:scale-95 shadow-sm">
          <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.986 2.007C6.67 2.007 2.364 6.315 2.364 11.626c0 2.502.955 4.786 2.518 6.495-.27.81-.88 2.39-2.616 3.32a.39.39 0 0 0 .185.736c2.81-.077 4.707-1.144 5.753-2.02 1.18.322 2.443.5 3.782.5 5.316 0 9.622-4.308 9.622-9.62-1.01-6.195-6.02-9.03-9.622-9.03zm0 17.037c-1.127 0-2.203-.18-3.21-.52-.303-.102-.63-.053-.896.134-1.14.802-2.793 1.542-4.75 1.765 1.096-1.077 1.637-2.316 1.837-3.155a.4.4 0 0 0-.114-.366 8.814 8.814 0 0 1-2.483-6.276c0-4.877 3.968-8.844 8.845-8.844 4.877 0 8.845 3.967 8.845 8.844 0 4.876-3.968 8.843-8.845 8.843z" fill-rule="evenodd" clip-rule="evenodd"/>
            <path d="M8.28 10.743a1.442 1.442 0 1 1 0-2.884 1.442 1.442 0 0 1 0 2.884zm7.412 0a1.442 1.442 0 1 1 0-2.884 1.442 1.442 0 0 1 0 2.884z"/>
          </svg> 
          加入官方 QQ 群
        </button>

        <button onclick="navTo('link:bilibili')" class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#252526] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#333] rounded-xl transition-all duration-200 text-xs font-medium active:scale-95 shadow-sm">
          <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.866 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.84-2.733c.267-.249.573-.373.92-.373.347 0 .653.124.92.373.249.249.373.551.373.907 0 .356-.124.658-.373.906l-1.134 1.133zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.764-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.249-.56.373-.933.373s-.684-.124-.933-.373c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.249-.56.373-.933.373s-.684-.124-.933-.373c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
          </svg>
          关注 B站动态
        </button>
      </div>`
  }
];

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { brands, printersByBrand, faqData };
}