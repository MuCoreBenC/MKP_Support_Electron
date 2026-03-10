// 品牌数据
const brands = [
  { id: 'bambu', name: '拓竹', shortName: 'Bambu Lab', subtitle: 'Bambu版', favorite: true },
  { id: 'creality', name: '创想三维', shortName: 'Creality', subtitle: '', favorite: false },
  { id: 'prusa', name: '快造科技', shortName: 'Prusa', subtitle: '', favorite: false },
  { id: 'anycubic', name: '纵维立方', shortName: 'Anycubic', subtitle: 'Klipper版', favorite: false },
  { id: 'diy', name: 'DIY', shortName: 'DIY', subtitle: '', favorite: false },
];

// 机型数据（按品牌分组）
const printersByBrand = {
  bambu: [
    { id: 'a1', name: 'Bambu Lab A1', shortName: 'A1', image: 'assets/images/a1.webp', favorite: true, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.30, supportedVersions: ['standard', 'quick'], scriptPaths: { standard: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\A1standard.toml" --Gcode', quick: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\A1quick.toml" --Gcode' } },
    { id: 'a1mini', name: 'Bambu Lab A1 mini', shortName: 'A1mini', image: 'assets/images/a1mini.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.25, supportedVersions: ['standard', 'quick'], scriptPaths: { standard: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\A1ministandard.toml" --Gcode', quick: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\A1miniquick.toml" --Gcode' } },
    { id: 'p1s', name: 'Bambu Lab P1S', shortName: 'P1S', image: 'assets/images/p1s.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.35, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\P1Slite.toml" --Gcode' } },
    { id: 'x1', name: 'Bambu Lab X1', shortName: 'X1', image: 'assets/images/x1.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.40, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\X1lite.toml" --Gcode' } },
    { id: 'p2s', name: 'Bambu Lab P2S', shortName: 'P2S', image: 'assets/images/p2s.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.30, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\P2Slite.toml" --Gcode' } },
    { id: 'x2', name: 'Bambu Lab X2', shortName: 'X2', image: 'assets/images/x1.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.40, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\X1lite.toml" --Gcode' } },
    { id: 'x3', name: 'Bambu Lab X3', shortName: 'X3', image: 'assets/images/x1.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.40, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\X1lite.toml" --Gcode' } },
    { id: 'x4', name: 'Bambu Lab X4', shortName: 'X4', image: 'assets/images/x1.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.40, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\X1lite.toml" --Gcode' } },
    { id: 'x5', name: 'Bambu Lab X5', shortName: 'X5', image: 'assets/images/x1.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 3.40, supportedVersions: ['lite'], scriptPaths: { lite: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\X1lite.toml" --Gcode' } },

  ],
  creality: [
    { id: 'k1c', name: 'Creality K1C', shortName: 'K1C', image: 'assets/images/k1c.webp', favorite: false, disabled: true, xOffset: 0.00, yOffset: 0.00, zOffset: 0.00, supportedVersions: [], scriptPaths: {} },
    { id: 'k2c', name: 'Creality K2C', shortName: 'K2C', image: 'assets/images/k2c.webp', favorite: false, disabled: true, xOffset: 0.00, yOffset: 0.00, zOffset: 0.00, supportedVersions: [], scriptPaths: {} },
  ],
  prusa: [],
  anycubic: [
    { id: 's1c', name: 'Anycubic S1C', shortName: 'S1C', image: 'assets/images/s1c.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 2.80, supportedVersions: ['standard'], scriptPaths: { standard: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\S1Cstandard.toml" --Gcode' } },
  ],
  diy: [
    { id: 'voron24', name: 'VORON 2.4', shortName: 'V2.4', image: 'assets/images/voron24.webp', favorite: false, disabled: false, xOffset: 0.00, yOffset: 0.00, zOffset: 2.50, supportedVersions: ['standard'], scriptPaths: { standard: '"D:\\MKPSupport Ver.Wisteria\\main.exe" --Toml "C:\\Users\\WZY\\Documents\\MKPSupport\\Voron24standard.toml" --Gcode' } },
  ],
};



// FAQ 数据数组
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

// 导出数据
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { brands, printersByBrand, faqData };
}
