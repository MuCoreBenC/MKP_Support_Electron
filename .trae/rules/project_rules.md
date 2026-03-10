# MKP Support 项目规则 (Electron 版本)

## Git 配置

### 用户信息
- **用户名**: MakinoKanna
- **邮箱**: 使用 GitHub 邮箱或 user@example.com

在执行 Git 操作前，请确保配置正确的用户信息：
```bash
git config user.name "MakinoKanna"
git config user.email "user@example.com"
```

### 代理配置
本项目需要代理才能连接 GitHub，代理端口为 **7890**：
```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```
## Git 提交规则（重要）

**禁止擅自提交！** 每次提交前必须遵循以下流程：

1. 完成代码修改后，先告知用户修改了什么
2. **必须询问用户是否要提交**
3. 用户确认后，才能执行 `git add`、`git commit`、`git push`
4. 如果用户不确认，保留修改在本地，不执行任何 Git 操作


## 技术栈

- **桌面框架**: Electron
- **核心逻辑**: Python 脚本
- **前端**: Vanilla JavaScript + Tailwind CSS
- **构建工具**: electron-packager

## 启动项目

### 1. 环境准备
确保您的计算机已安装 Node.js 14 或更高版本，以及 Python 3.8 或更高版本。

### 2. 安装依赖

```bash
# 安装 npm 依赖
npm install

# 安装 Python 依赖
pip install -r requirements.txt
```

### 3. 运行应用

```bash
# 开发模式运行
npm start

# 构建应用
npm run build
```

构建完成后，可在 `dist-electron` 目录中找到可执行文件。

## 代码规范

- 代码注释使用中文
- 变量和函数命名使用英文
- 遵循现有的代码风格和命名约定


### 提交命令顺序
```bash
git add .
git commit -m '提交说明'
git push
```

### 版本标签
发布新版本时创建标签：
```bash
git tag -a v1.0.0 -m '版本说明'
git push origin v1.0.0
```

## 构建和安装

### 构建优化
- 使用 `electron-packager` 构建应用
- 排除不必要的依赖和文件，减小构建大小

### 安装处理
- 使用 NSIS 生成安装程序
- 安装过程中会自动检测并终止旧版本的进程

## 功能特性

- **桌面应用**: 基于 Electron 构建的跨平台桌面应用
- **Bambu Studio 路径检测**: 自动检测 Bambu Studio 安装路径
- **手动路径选择**: 支持用户手动选择切片软件安装路径
- **现代化界面**: 响应式设计，支持暗色模式
- **配置管理**: 使用 JSON 格式统一管理机型库和预设路径
