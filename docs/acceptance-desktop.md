# 桌面客户端验收

2026-10-31，本轮修复后生成未签名 macOS arm64 应用：

`products/desktop/release/mac-arm64/LightWeaver.app`

验收直接启动包内可执行文件，PATH 只有系统目录，使用系统临时目录中的独立 LIGHTWEAVER_USER_DATA、项目和合成媒体。没有使用仓库配置中的密钥，也没有修改用户媒体或原有项目。

## 构建与资源

- 工作区类型检查、公开模块边界、Studio 生产构建、桌面构建和 git diff --check 通过。
- 完整 package 检查实际 .app/Contents/Resources/lightweaver，包括 SHA-256、可执行位、符号链接、Node/Chrome/FFmpeg/Python/SQLite/Remotion 原生架构。包内 Node 的 SQLite 内存查询成功，OTIO 与 pyJianYingDraft 可导入。
- 最终包通过 CLI 实际执行 OTIO 导出与重载后，再次完整核验 Resources，文件清单与摘要保持不变。
- 删除 SQLite 原生模块、把 arm64 清单改成 x64、加入绝对外部符号链接，校验均失败。不支持的目标和跨宿主目标在 staging 前被拒绝。
- 卡片构建使用独立空 public 目录，不再收录仓库 public/projects 的用户素材链接。Python 不保留构建缓存的 console entrypoints 或 .pyc；生产子进程关闭字节码写入。

## 真实应用行为

- 首次客户端状态 GET 延迟 700 毫秒，直接打开已有项目；服务器草稿备份仍保留。清除备份遇到 503 时，界面和 native 副本均保留，恢复连接后可重试清除。
- 编辑标题后批量上传两张图片，两条素材和标题均保留。导入请求延迟期间离开项目，余下文件仍导入原项目。
- 保存方案期间继续编辑标题，后续整份文档保存进入修订冲突，没有覆盖服务器的新方案。仅含方案的旧备份恢复后也保留原基线并显示冲突。
- 最后一次编辑在原 800 毫秒防抖窗口内遇到 sidecar 被杀，native journal 保留该编辑；重试后端口改变，仍可显式恢复。保存成功后清除对应 native 备份。
- 连续发起三次重启，最终只有一个业务服务。journal 损坏导致连续重启均被拒后，旧服务和旧界面继续可用，后续设置保存成功。
- 退出确认期间杀死 sidecar，再取消退出，应用进入可重试恢复页。恢复后正常退出，业务服务退出。
- 数据目录偏好尚未生效时，草稿仍写入旧数据目录。切换到不可用目录失败后，磁盘偏好保持旧值，重试回到旧工作区；成功切换后，新工作区与原项目隔离。
- 同一个失败的模型下载作业恢复后，界面重新建立 SSE 订阅，并显示与后端一致的终态。失败由临时普通文件冒充下载根目录触发，没有下载权重。
- 通过启动环境提供虚构 ModelBest Key，设置返回 configured=true，未发送推理请求。模型 Python 路径可在设置页保存到隔离配置；完整性状态不再被误标为未成功调用。
- 开发模式重启后 Vite 使用新端口和新服务凭据，API 可用。强制结束 renderer 后，界面恢复到当前 Vite origin。

## 制作与交接

- card、still、clip 混合短片制作成功，包含原声片段。
- OTIO 导出由官方 opentimelineio 0.18.1 生成并重新加载，收据为 reloaded=true、60 帧。
- 剪映导出由 pyJianYingDraft 0.3.1 生成目标 schema 360000 的草稿与交接收据。
- bundle ZIP 导出、导入成功，导入得到独立项目，原修订保留。
- 包内 CLI 在系统 PATH 下读取与桌面相同的项目；网页捕获使用随包 Playwright 与 Chrome 成功生成图片。
- 随包 Python 可在应用目录外创建独立 venv，环境内 pip 可运行。没有安装可选模型依赖或权重。

## 证明范围

Windows、Linux 和 macOS x64 已有明确资源矩阵及宿主限制，本轮没有在这些系统打包或运行。Windows Job Object 的 C# 结构与协议做了有限检查；启动失败和真实退出码 127 的区分通过模拟 helper 验证，不能代替 Windows 实机验收。

本轮没有签名、公证、安装分发包、打开剪映应用、调用真实模型供应商或重跑长片质量评测。模型 Python 仍为用户可选环境。临时验收脚本、数据、合成媒体和自启服务在完成后清理，不保留测试资产。
