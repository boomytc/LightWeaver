# Third-party notices

LightWeaver 桌面客户端把下列组件作为独立进程或库随包提供。权重文件不在安装包内。

- Electron、Chromium：界面与卡片渲染浏览器。许可证见各组件随附声明。
- Node.js：本地业务服务运行时。
- better-sqlite3：SQLite 访问。
- React、Radix Primitives、Tailwind CSS：界面。
- OpenSource UI 的搜索框、软胶囊按钮、内凹按钮和通知卡片（MIT，Copyright (c) 2026 Bidyut Kundu）已按本应用的颜色改写后使用。
- Remotion：无声卡片渲染。
- Playwright：使用随包 Chrome 执行截图与页面捕获。
- FFmpeg / ffprobe：以独立进程调用，不链接进应用主程序。源码与构建说明见 https://ffmpeg.org 。
- Python 3.12、OpenTimelineIO 与 pyJianYingDraft：随包提供产品交接能力。
- transcribe.cpp 0.2.0 与 transcribe Python bindings：本地语音识别运行库。
- TEN VAD：本地语音活动检测运行库。
- llama.cpp llama-server：本地检索与翻译运行库。
- 产品 Python 脚本位于 resources/weaver/scripts。模型、语音与项目交接依赖统一安装在随包 Python 中；首次启动不会安装依赖或下载权重。
