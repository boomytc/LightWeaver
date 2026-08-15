# Studio

本地复核面：片子由 agent 经 weaver 写；这里检视 issues、回放 `assets/outputs/`（经 `/api/media`）、改词、补静帧。CRUD 仍可用。

```bash
# 仓库根
make install
make studio
```

浏览器打开 `http://127.0.0.1:5175/`。API 在 `127.0.0.1:8788`。

- 片子主路径是 agent + `weaver`
- LightUI 顾客片来自 `data/first-party/`（不提交）
- 新建项目写到 `data/projects/`（不提交；无 publish 只渲到本地）
- 共享音色 / 元素 / 参考在 `library/`
- 场景增删改序、绑静帧、改卡片、选音色走 PATCH，不必手改 JSON
- `<video src>` 只用 `projectMedia(id, rel)`，不用磁盘绝对路径
