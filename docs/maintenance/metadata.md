# 机器可检查的元数据

本页是决定 front matter、`spec/catalog.json`、`spec/frozen.json` 和
`spec/archive/ddd-models/manifest.json` 的受版本控制接口约定。它为检查工具提供结构，
不创建第二份目录清单、运行时注册表或领域模型；具体语义仍以决定和契约正文为准。

## 决定 front matter

每份 `docs/decisions/D-*.md` 的 YAML front matter 使用以下字段：

```yaml
kind: decision
id: D-042
status: accepted # accepted | superseded | withdrawn
scope: 仅此决定适用的非空范围说明
date: 2026-09-12
sources:
  - ../proposals/topic/README.md
  - ../research/topic/README.md
acceptance: ../proposals/topic/README.md#接受记录
supersedes: []
```

`kind` 必须为 `decision`；`id` 为 `D-NNN`；`status` 只能为所列三值；`scope` 非空；
`date` 是 ISO 日期；`sources` 是非空的相对链接列表，且至少一项位于 `docs/proposals/`
或 `docs/research/`。`acceptance` 是可解析的相对链接，指向接受依据。`supersedes` 是列表；
没有取代时使用空列表。

新决定取代既有决定时，每一项为 `{id: D-NNN, scope: 非空范围}`，并增加：

```yaml
change_basis:
  observation: 可辨认的新观察、反例或已变化前提
  causal_explanation: 说明该观察如何使旧前提或决定在所列范围内不再成立
  reproduction: ../research/topic/reproduction.md
  verification: ../research/topic/verification.md
```

`observation` 与 `causal_explanation` 均为非空文字，`reproduction` 与 `verification`
均为可解析本地链接。结构检查只能确认字段和链接；是否为真正的新观测及因果理由是否充分，
由人工审阅按[版本规范](versioning.md)判断。

## 规格目录清单

`spec/catalog.json` 的完整顶层形状为：

```json
{
  "catalog_version": 1,
  "contracts": [
    {
      "id": "data.example",
      "current_version": 1,
      "versions": [
        {
          "version": 1,
          "status": "accepted",
          "path": "spec/data/example/v1/contract.md",
          "acceptance": "docs/decisions/D-042-example.md"
        }
      ]
    }
  ]
}
```

`catalog_version` 为 `1`；`contracts` 为数组。契约 `id` 仅以 `data.`、`capability.` 或
`composition.` 开头；`current_version` 是正整数或 `null`；每项 `versions` 含正整数
`version`、`accepted|superseded|withdrawn` 状态、仓库相对 `contract.md` 路径及仓库相对的
决定或提案 `acceptance` 链接。初始清单可以是空数组：旧模型的 `current` 标记没有逐项
接受依据，不能据此登记正式版本。

## 冻结与历史归档

`spec/frozen.json` 的形状为：

```json
{
  "format": 1,
  "files": {
    "spec/data/example/v1/contract.md": "<sha256>"
  }
}
```

`format` 为 `1`；`files` 将仓库相对路径映射到 SHA-256。每个已发布版本目录的规范文件均
须登记，运行证据不放在版本目录内。审阅冻结内容时使用检查工具的 `--baseline <git-ref>`，
以发现原件和哈希在同一改动中被一并重写。

`spec/archive/ddd-models/manifest.json` 的形状为：

```json
{
  "format": 1,
  "files": [
    {
      "original": "spec/domain/entities/example/v1/contract.md",
      "path": "domain/entities/example/v1/contract.md",
      "sha256": "<sha256>"
    }
  ]
}
```

`format` 为 `1`；每项记录迁移前的仓库相对 `original`、相对归档根的 `path` 和原件
SHA-256。旧 `domain/` 的相对结构必须完整保留。归档证明历史可复查，不表示旧内容已接受，
也不要求实现兼容旧 API。
