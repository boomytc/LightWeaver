# Weaver core

`src/contracts` 保存运行时 schema 和推导类型。`src/app` 组合项目、库、作业、分析、制作、交接与迁移服务。公开入口由 package exports 声明。

SQLite 保存运行元数据，CAS 保存不可变字节。旧 JSON 只由 `src/migration` 导入。路径与单个产品无关。

模型边界在 `src/adapters` 和 `scripts/`。远程 TTS、VLM 与本地 ASR 是显式能力。外部 agent 提供旁白，核心执行确定的制作计划。增加 provider 时同时定义协议、绑定参数与诊断提示。

纯时间轴逻辑在 `src/timeline`，媒体进程在 `src/media`。作业和 HTTP 调用链共用 `src/jobs`。

本仓采用有限验收。模型、媒体与恢复路径的实测范围写入交付说明；临时验证脚本不进入仓库。
