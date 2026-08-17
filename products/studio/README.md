# Studio

本机控制站：工作台复制给 agent 的说明；片子页复盘轨迹。编排和出片走 agent + weaver。

```bash
# 仓库根
make install
make studio
```

浏览器打开 `http://127.0.0.1:5175/`。API 在 `127.0.0.1:8788`。顶栏可切换浅色 / 深色，GitHub 指向本仓。铸声用 [ModelBest 控制台](https://platform.modelbest.cn/console/login?ref=B08B4DDF)。

| 路径 | 做什么 |
| --- | --- |
| `/` | 点名组合，复制说明 |
| `/films` `/f/<id>` | 复盘场次和成片 |
| `/voices` | 听、铸、收下 wav |
| `/library` | 素材增强：加、改、删 |
| `/methods` | 方法增强：加、改、删，再点去组合 |

- 片子主路径是 agent + `weaver`
- 任务实例在 `data/`（不提交）
- 共享音色 / 元素 / 参考在 `library/`；元素不强制
- `<video src>` 只用 `projectMedia(id, rel)`，不用磁盘绝对路径
