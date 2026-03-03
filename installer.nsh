; 检测并停止旧进程
Function .onInit
  ; 检测是否有 electron.exe 进程在运行
  nsExec::ExecToStack "tasklist /FI \"IMAGENAME eq electron.exe\" /NH"
  Pop $0 ; 返回值
  Pop $1 ; 输出
  
  ; 检查是否有进程在运行
  StrLen $2 $1
  IntCmp $2 0 noProcesses foundProcesses
  
foundProcesses:
  ; 显示提示信息
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "检测到 MKP Support 正在运行。为了完成安装，需要停止当前运行的实例。是否继续？" IDYES killProcesses IDNO abortInstall
  
killProcesses:
  ; 停止所有 electron.exe 进程
  nsExec::ExecToStack "taskkill /F /IM electron.exe"
  Pop $0 ; 忽略返回值
  Goto noProcesses
  
abortInstall:
  ; 用户取消安装
  Abort
  
noProcesses:
  ; 没有进程在运行，继续安装
FunctionEnd
