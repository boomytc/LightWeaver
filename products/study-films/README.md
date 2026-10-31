# LightWeaver card renderer

`make remotion` 打开卡片预览。`weaver-card --describe` 显示适配器指纹。独立入口接受共享 CardRenderInput，输出无声 MP4。

支持 title、points、close 卡片，按传入画幅布局。width、height、fps、durationFrames 来自已解析制作计划。共享制作链验证卡片规格后，完成整片字幕、混音和封装。
