# Studio

本地地址 `http://127.0.0.1:5175/`，API 默认端口 5176。`/films` 与 `/films/:id` 编辑和复盘项目；`/methods`、`/voices`、`/library` 管理版本化库项。

HTTP 只适配共享 app 服务。浏览器使用 contracts。保留中文操作标签，让人按名称选择素材、方法和音色。

项目草稿、服务器修订与交付状态分别显示。修改异步交互时同时检查切换项目、请求晚到、未保存修改与冲突后的恢复体验。

`make studio` 同时启动 API、同一作业 worker 和 Vite。结束临时验收时停止启动的服务。
