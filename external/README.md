# External Programs

此目录用于存放原作者的 MKPSupport 程序。

## 方式一：使用源码（推荐）

原作者仓库已克隆到 `../MKPSupport/`，可以直接调用：

```bash
cd ../MKPSupport
python main.py --Toml "Presets/A1.toml" --Gcode "your_file.gcode"
```

### 依赖安装
```bash
pip install customtkinter pillow toml requests CTkMessagebox CTkScrollableDropdown CTkToolTip
```

## 方式二：使用编译好的 EXE

如果你已经安装过 MKPSupport，可以从安装目录复制 EXE 到这里：

1. 安装目录通常在：`C:\Users\你的用户名\AppData\Local\MKPSupport\`
2. 复制 `MKPSupport.exe` 和 `_internal` 文件夹到此目录

## 更新方式

原作者程序会自动检查更新，更新链接：
```
https://gitee.com/Jhmodel/MKPSupport/releases/download/gp_update/Bambu_Only_MKPSupport_Setup.exe
```

运行原程序时会自动提示更新。
