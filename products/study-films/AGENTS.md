# Study-films card adapter

Remotion 只生产指定宽高、fps 和帧长的无声卡片。卡片品牌、文案与布局来自 CardRenderInput。独立命令 `weaver-card --describe` 返回实现和字体指纹，`weaver-card <input.json> <output.mp4>` 渲染。

保留卡片视觉、动画及横竖方形适配。整片拼接、声音、字幕和交付属于共享 FFmpeg 制作链。

`make remotion` 预览卡片。临时渲染输出写 attempt 目录或系统临时目录。
