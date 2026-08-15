# Studio

本地工作台：项目、资产区、场景旁白、校验 / 合成 / 渲染。

```bash
# 仓库根
make install
make studio
```

浏览器打开 `http://127.0.0.1:5175/`。API 在 `127.0.0.1:8788`。

- 内置项目来自 `products/study-films/projects/`
- 新建项目写到 `data/projects/`（study-explainer，只渲到本地）
- 共享音色 / 元素 / 参考在 `library/`
- 场景增删改序、绑静帧、改卡片、选音色走 PATCH，不必手改 JSON
