---
name: lightweaver-assets
description: Import task media and publish versioned reusable voices, methods, and materials in LightWeaver.
---

# 导入素材与库项

先 `project show <id> --json` 取得当前修订。导入会复制并计算内容摘要，原始文件保持原位。

```bash
npx weaver asset add --project demo --file /absolute/source.mp4 --expected-revision revision --request-id import-source --json
npx weaver library list --json
npx weaver library set --file /absolute/voice.json --media /absolute/reference.wav --request-id publish-voice --json
```

上传 voice 的 payload 包含 kind、name 和实际 referenceText；material 包含 kind 和 name。method 的 schema 通过 `weaver schema library` 查询。

更新库项带 itemId 和 expectedVersion。项目绑定精确版本，显式 rebind 才升级。删除只删除 head，历史项目仍能读取旧版本。采用素材用 `asset adopt`。

`library/` 的内置包通过 `capabilities.builtinPackageVersion` 发现版本，再 `library import-builtin --package-version <digest>` 显式导入。日常库修改保存在 SQLite。
