# Desktop

Electron 主进程负责窗口、菜单、原生文件对话框和它自己启动的业务服务。preload 只暴露具名方法。业务、数据库和媒体制作在随包 Node 服务里，界面只来自 `products/studio/src`。

`make desktop` 是开发模式。`make desktop-package` 生成本机未签名可运行包。不要把 Electron 可执行文件当作服务的 Node。
