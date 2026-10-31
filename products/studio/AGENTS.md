# Studio

界面是桌面工作台，也给 `make studio` 使用。导航是项目、方法、音色、素材库、任务和设置。HTTP 只适配共享 app 服务。浏览器使用 contracts。

开发地址仍是 Vite。桌面生产包由本地服务同源提供编译后的界面。草稿和布局写在数据目录的客户端状态里，不依赖某个端口的 localStorage。

`make studio` 同时启动 API、同一作业 worker 和 Vite。结束临时验收时停止启动的服务。
