---
name: lightweaver-assets
description: Import task media and publish versioned reusable voices, methods, and materials in LightWeaver.
---

# 导入素材与库项

先读 [入口选择](../lightweaver/SKILL.md)，确定与用户项目一致的 CLI 和数据目录，再 `project show <id> --json` 取得当前修订。以下 `weaver` 表示该实际入口。导入会复制并计算内容摘要，原始文件保持原位。

```bash
weaver asset add --project demo --file /absolute/source.mp4 --expected-revision revision --request-id import-source --json
weaver library list --json
weaver library set --file /absolute/voice.json --media /absolute/reference.wav --request-id publish-voice --json
```

每次导入采用返回的新修订；不同请求使用新的 requestId。预处理前先导入来源，导入处理结果时传 `--provenance /absolute/provenance.json`。用 `schema media-provenance` 查询合同，记录处理说明、画面/声音/字幕参考的精确素材版本及实际源窗，`captions` 标明 `embedded`、`none` 或 `unknown`。这些来源会随项目及 bundle 保留。元数据是作者记录，不代表已验证匹配正确。

上传 voice 的 payload 包含 kind、name 和实际 referenceText；material 包含 kind 和 name。method 的 schema 通过 `weaver schema library` 查询。

更新库项带 itemId 和 expectedVersion。项目绑定精确版本，显式 rebind 才升级。删除只删除 head，历史项目仍能读取旧版本。采用素材用 `asset adopt`。

`library/` 的内置包通过 `capabilities.builtinPackageVersion` 发现版本，再 `library import-builtin --package-version <digest>` 显式导入。日常库修改保存在 SQLite。
