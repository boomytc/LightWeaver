# 桌面客户端验收

本机产物是未签名的 macOS arm64 应用：

`products/desktop/release/mac-arm64/LightWeaver.app`

启动的是包内 `Contents/MacOS/LightWeaver`，`PATH` 只有系统目录，并设置独立的 `LIGHTWEAVER_USER_DATA`。没有写仓库 `data/` 或 `config.local.yaml`。

这次包上的结果：

- 公开模块边界和工作区类型检查通过。资源清单通过，包内 Node 是 `Contents/Resources/lightweaver/node/bin/node`。
- 第一次启动的服务 origin 是 `http://127.0.0.1:64027`。按路径导入 `clip.mp4` 和 `still.png`，保存后项目有两条素材。原生桥已挂上。
- 右上角保存提示在悬停的 3.5 秒内保持，离开后 1.8 秒仍在，再经过约 3 秒无接触后消失。卡片位于窗口右上角。
- 退出后用同一用户目录再次启动，origin 变为 `http://127.0.0.1:64277`。项目标题和两条素材仍在，模式是 production。
- 保存期间又改了片名。服务器保留提交时的「晚到前」，输入框保留之后的「晚到后的编辑」。
- card、still、clip 制作成功。包内 ffprobe 读到成片 1920×1080、H.264、AAC、2 秒。导出文件与交付摘要一致。字幕保存为「改过的字幕」。源窗播放时间向前走到约 0.52 秒。
- 设置里对一个真实目录做了完整性校验。Qwen3-ASR 显示文件不存在、完整性未下载、运行时有缺失、调用尚未成功。未启用未校验权重。
- 更长的卡片制作出现后代进程后取消。作业状态成为 cancelled，该进程随后不在。
- 未保存时从菜单退出，对话框提供保存、保留草稿、放弃和取消。选择取消后留在项目里。

Windows 与 Linux 只有 electron-builder 目标，没有在本机安装或运行。没有公证，也没有使用签名凭据。模型供应商协议没有改，这次没有重跑付费推理或长片评测。Python 模型环境没有在首次启动时安装。
