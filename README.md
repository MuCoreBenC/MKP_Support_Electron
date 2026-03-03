# MKP-Support-FastUI (Electron 版本)

A modern desktop application for [MKP Support](https://github.com/YZcat2023/MKPSupport), built with Electron and Vanilla JS.

## 声明与致敬 (Credits & Acknowledgement)

本项目是基于 [YZcat2023/MKPSupport](https://github.com/YZcat2023/MKPSupport) 开发的第三方可视化桌面应用版本。

原版 MKP Support 是一款优秀的 3D 打印辅助工具，其核心定位为：**"用于后处理 FDM 支撑结构，以提升打印质量并减少材料使用 (An application for post-processing FDM support structures to improve print quality and reduce material usage.)"**。

本项目的核心参数理念、数据结构与处理思路均完全源自原作者。本项目采用 Electron 技术栈，将 Web 界面封装为桌面应用，旨在为用户提供更加便捷的使用体验。感谢原作者为 3D 打印开源社区做出的杰出贡献。

## 项目特性 (Features)

* **桌面应用**: 基于 Electron 构建的跨平台桌面应用，无需浏览器即可运行。
* **现代化架构**: 采用 Python 脚本处理核心逻辑，Electron 提供界面支持。
* **响应式 UI**: 基于 Vanilla JavaScript 与 Tailwind CSS 构建的单页面应用 (SPA)，自适应不同尺寸的窗口显示。
* **视觉与交互**: 
  * 完整的暗色模式 (Dark Mode) 支持，支持跟随系统。
  * 优雅的折叠面板、分类导航与极简的视觉反馈。
* **配置解耦**: 抛弃硬编码，采用 JSON 格式统一管理机型库、品牌流及预设路径。
* **构建优化**: 优化构建大小，减少不必要的依赖和文件。

## 快速开始 (Quick Start)

### 1. 环境准备
确保您的计算机已安装 Node.js 14 或更高版本，以及 Python 3.8 或更高版本。

### 2. 克隆项目
```bash
git clone https://github.com/MakinoKanna/MKP-Support-FASTUI.git
cd MKP-Support-FASTUI
git checkout electron-version

```

### 3. 安装依赖

```bash
# 安装 npm 依赖
npm install

# 安装 Python 依赖
pip install -r requirements.txt

```

### 4. 运行应用

```bash
# 开发模式运行
npm start

# 构建应用
npm run build

```

构建完成后，可在 `dist-electron` 目录中找到可执行文件。
