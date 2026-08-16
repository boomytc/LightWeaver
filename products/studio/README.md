# Studio

本机控制站：人管音色和可复用素材，并在片子上点名用哪支声、哪些元素。编排和出片走 agent + weaver。

```bash
# 仓库根
make install
make studio
```

浏览器打开 `http://127.0.0.1:5175/`。API 在 `127.0.0.1:8788`。顶栏可切换浅色 / 深色，GitHub 指向本仓。铸声用 [ModelBest 控制台](https://platform.modelbest.cn/console/login?ref=B08B4DDF)。

| 路径 | 做什么 |
| --- | --- |
| `/` | 这张图 |
| `/films` `/f/<id>` | 点名音色 / `kit`，看场次和成片 |
| `/voices` | 听、铸、收下 wav |
| `/library` | 收元素和参考图 |

- 片子主路径是 agent + `weaver`
- LightUI 顾客片来自 `data/first-party/`（不提交）
- 空壳可建到 `data/projects/`（不提交）
- 共享音色 / 元素 / 参考在 `library/`，不是通用 DAM
- `<video src>` 只用 `projectMedia(id, rel)`，不用磁盘绝对路径
