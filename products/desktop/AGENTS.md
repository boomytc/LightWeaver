# Desktop

Electron 主进程负责窗口、菜单、原生文件对话框和它自己启动的业务服务。preload 只暴露具名方法。业务、数据库和媒体制作在独立 Node 服务里，界面只来自 `products/studio/src`。

`npm start` 或 `make desktop` 从源码启动。`make source-zip` 打包已提交源码，环境由接收方的 WorkBuddy 按开发指南准备。不要把 Electron 可执行文件当作服务的 Node。
