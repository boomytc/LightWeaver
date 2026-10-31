# 桌面客户端验收

本机产物是未签名的 macOS arm64 应用：

`products/desktop/release/mac-arm64/LightWeaver.app`

启动命令是应用内的 `Contents/MacOS/LightWeaver`。验收使用独立的 `LIGHTWEAVER_USER_DATA`，不写仓库 `data/` 或 `config.local.yaml`。生产服务由包内 Node v22.23.4 启动，动态回环端口，界面从该 origin 加载。没有会话凭据的请求返回 401。

已在这个包上做过：

- 创建项目「验收短片」，按路径导入 `clip.mp4` 与 `still.png`，保存 card、still、clip。
- 退出后用同一用户目录再次启动，项目、两条素材和三条场景仍在。第二次 origin 端口与第一次不同。
- 制作作业成功。包内 ffprobe 接受成片：1920×1080、H.264、AAC、2 秒。导出写入选定的 mp4，摘要与交付视频一致。
- 把字幕改成「改过的字幕」并保存。源窗视频从包内媒体地址播放，时间向前走。
- 一次更长的卡片制作在出现渲染子进程后取消。作业状态成为 cancelled，渲染进程随后消失。
- 设置页能看到文件是否存在、完整性、运行时和尚未成功调用。未下载的权重没有被启用。
- 未保存时离开项目，对话框提供保存、保留草稿、放弃和取消。

Windows 与 Linux 只具备 electron-builder 目标，没有在本机安装或运行。没有做公证，也没有使用签名凭据。模型供应商协议没有改，这次没有重跑付费推理或长片评测。Python 模型环境没有在首次启动时安装。
