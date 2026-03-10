# MKP Support Electron 
 
 A modern desktop application for `https://github.com/YZcat2023/MKPSupport` , built with Electron, featuring dual-mode operation (CLI + GUI) and modern user experience. 
 
 ## 📜 声明与致敬 (Credits & Acknowledgement) 
 
 本项目是基于 `https://github.com/YZcat2023/MKPSupport`  开发的第三方可视化桌面应用版本。 
 
 原版 MKP Support 是一款优秀的 3D 打印辅助工具，其核心定位为：**"用于后处理 FDM 支撑结构，以提升打印质量并减少材料使用"**。 
 
 本项目的核心参数理念、数据结构与处理思路均完全源自原作者。本项目采用 Electron 技术栈，将 Web 界面封装为极具现代感的桌面应用，旨在为用户提供零门槛、极度丝滑的使用体验。感谢原作者为 3D 打印开源社区做出的杰出贡献。 
 
 --- 
 
 ## ✨ 核心特性 (Features) 
 
 * 🌗 **双重人格架构 (Dual-Mode)**: 支持 CLI 静默处理模式（配合切片软件后台运行）和 GUI 沉浸式图形界面模式，无缝切换。 
 * 🍎 **macOS 级物理动效 (Fluid Animations)**: 基于正弦波（Sine Wave）算法的 Z 轴校准网格，实现流畅的 Dock 挤压与悬浮特效。 
 * 🎛️ **可视化校准中心 (Visual Calibration)**: 简化参数调整流程，通过直观的 UI 方块进行 Z轴/XY轴 偏移微调，数据精准映射至底层 TOML/JSON 配置。 
 * 🎨 **现代化交互设计 (Modern UI/UX)**: 
   * 采用 `color-mix` 动态色阶技术，支持全局主色调、暗黑模式及版本专属配色。 
   * 自定义全局弹窗系统与平滑滚动锚点导航。 
   * 简洁的表单联动与红点提醒系统。 
 * ☁️ **云端同步与更新 (Cloud & Update)**: 接入 GitHub Releases，支持在线拉取最新机型预设、一键应用并支持软件本体升级。 
 * 🛡️ **参数解析引擎**: 智能识别并处理嵌套的底层物理参数，确保打印机安全。 
 
 --- 
 
 ## 🛠️ 快速开始 (Quick Start) 
 
 ### 1. 环境准备 
 确保您的计算机已安装 `https://nodejs.org/`  (推荐 18.x 或更高版本)。 
 
 ### 2. 克隆项目 
 ```bash 
 git clone `https://github.com/MuCoreBenC/MKP_Support_Electron.git` 
 cd MKP_Support_Electron 
 ```

### 3. 安装依赖 
 ```bash 
 # 进入核心工程目录并安装 npm 依赖 
 cd ui_app 
 npm install 
 ```

### 4. 运行与构建 

#### 🖥️ GUI 图形模式 (开发与打包) 
 ```bash 
 # 开发模式运行 (支持热重载) 
 npm start 
 
 # 构建应用 (打包输出至 dist 目录) 
 npm run build 
 ```

#### 💻 CLI 命令行模式 (切片软件调用) 
 ```bash 
 # 静默处理 Gcode 文件 
 electron . --Gcode <gcode文件路径> <toml配置文件路径> 
 ```

 注：CLI 模式会静默处理 Gcode 文件，完成后显示系统原生通知并自动退出，完美融入 Bambu Studio / OrcaSlicer 的后处理流程。 
 
 ## 📂 项目结构 (Project Structure) 

 ```plaintext 
 MKP_Support_Electron/ 
 ├── ui_app/                 # Electron 核心工程 
 │   ├── src/ 
 │   │   ├── main/           # 主进程 (Node.js) 
 │   │   │   ├── main.js       # Electron 入口、CLI 拦截与生命周期 
 │   │   │   └── mkp_engine.js # Gcode 底层处理引擎 
 │   │   └── renderer/       # 渲染进程 (Web UI) 
 │   │       ├── index.html    # 主界面视图 
 │   │       └── assets/       # 前端静态资源 
 │   │           ├── css/        # Tailwind 体系与自定义动画 CSS 
 │   │           ├── js/         # 交互逻辑、配置读取、数据解耦 
 │   │           └── images/     # 机型贴图与图标库 
 │   ├── package.json        
 │   └── preload.js          # 进程间通信安全桥梁 (IPC Context Bridge) 
 ├── reference_python/       # 核心算法 Python 源码存档 
 └── README.md 
 ```

 ## 💻 技术栈 (Tech Stack) 

 - **桌面框架**: Electron 
 - **前端渲染**: Vanilla JavaScript (原生JS) + HTML5 
 - **样式系统**: Tailwind CSS + CSS Variables (动态计算) 
 - **后端引擎**: Node.js 
 - **数据存储**: JSON / TOML 
 - **构建与分发**: electron-builder / electron-updater 
 
 ## 👤 作者 (Author) 
 MuCoreBenC 
 
 ## 📄 许可证 (License) 
 MIT License 
