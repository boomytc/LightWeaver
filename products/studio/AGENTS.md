# Studio

界面是桌面工作台，也给 `make studio` 使用。导航是项目、方法、音色、素材库、任务和设置。HTTP 只适配共享 app 服务。浏览器使用 contracts。

界面由 Vite 提供，桌面主进程为本地 API 绑定会话和允许来源。草稿和布局写在数据目录的客户端状态里，不依赖某个端口的 localStorage。

`make studio` 同时启动 API、同一作业 worker 和 Vite。结束临时验收时停止启动的服务。
