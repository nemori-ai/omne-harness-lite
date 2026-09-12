# 机器可检查的元数据

本页说明决定 front matter、`spec/catalog.json`、`spec/frozen.json` 和
`spec/archive/ddd-models/manifest.json` 的受版本控制接口约定。精确字段形状分别引用下列 Schema；正文解释含义，不维护另一份注册表。它为检查工具提供结构，
不创建第二份目录清单、运行时注册表或领域模型；具体语义仍以决定和契约正文为准。

## 格式定义

- [决定](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/decision.schema.json)
- [规格清单](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/catalog.schema.json)
- [冻结清单](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/frozen.schema.json)
- [历史原件清单](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/archive.schema.json)
- [形式任务清单](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/formal-tasks.schema.json)：执行含义见[验证规范](verification.md)。

## 需求正文

精确结构由[需求元数据 Schema](../../tools/spec-tools/src/omne_harness_lite_spec_tools/formats/requirement.schema.json)定义。

`docs/requirements/system/` 与 `product/` 下除 README.md 外的 Markdown 主正文
使用 YAML front matter。系统主题可拥有多个独立 SYS-* 条款，产品主正文拥有一个
PF-NNN 身份；README 只是导航，不登记身份。附件如需独立维护，应先明确其正文
入口和检查范围，不以无元数据的第二份正文规避唯一性。

```yaml
kind: system-requirement
ids: [SYS-TENANT, SYS-DEPLOY]
```

```yaml
kind: product-feature
id: PF-001
primary_dimension: user
secondary_dimensions: [agent]
```

系统正文 `kind` 固定为 `system-requirement`，`ids` 是非空、不重复的 SYS-* 字符串
列表；身份使用大写字母、数字和连字符。产品 `kind` 固定为 `product-feature`，
`id` 使用至少三位数字的 PF-NNN，文件名以该 ID 加连字符开头；主、副维度值只能为
`environment`、`user`、`agent`。`secondary_dimensions` 可为空，不重复且不含主维度。
字段仅限对应示例所列项；不设整页接受状态。确认依据与条款范围由正文表达。

身份在全部需求主正文中唯一，主维度与 product 下第一层目录一致；主、副维度
README 必须链接唯一正文。每个维度 README 中指向主正文的链接也必须有相应
维度声明，副维度关联说明由审阅核对。具体机械实现归
[文档检查器](../../tools/spec-tools/src/omne_harness_lite_spec_tools/check_docs.py)。
正文中的跨要求引用不重新登记身份；SYS-REUSE 与 GOV-* 的外部拥有者按
[系统索引](../requirements/system/README.md)导航，不另复制为需求正文。

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

`catalog_version` 为 `1`；`contracts` 为数组。契约 `id` 以 `data.`、`capability.` 或
`composition.` 开头，后接小写语义名称；清单中的同一 ID 只出现一次。`current_version` 是正整数或 `null`；每项 `versions` 含正整数
`version`、`accepted|superseded|withdrawn` 状态、仓库相对 `contract.md` 路径及仓库相对的
决定或提案 `acceptance` 链接。来源必须有已接受范围，不能指向待审候选；结构检查仍不代替人工确认接受范围。初始清单可以是空数组：旧模型的 `current` 标记没有逐项
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
