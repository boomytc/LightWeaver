# Third-party notices

LightWeaver 桌面客户端把下列组件作为独立进程或库随包提供。权重文件不在安装包内。

- Electron、Chromium：界面与卡片渲染浏览器。许可证见各组件随附声明。
- Node.js：本地业务服务运行时。
- better-sqlite3：SQLite 访问。
- React、Radix Primitives、Tailwind CSS：界面。
- Remotion：无声卡片渲染。
- FFmpeg / ffprobe：以独立进程调用，不链接进应用主程序。源码与构建说明见 https://ffmpeg.org 。
- 产品 Python 脚本位于 resources/weaver/scripts。可选模型 Python 环境由用户另行指定，首次启动不会安装。
