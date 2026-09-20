# PF-001：原生租户隔离与多组织上下文

本信息包拥有 **PF-001** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入后，于 2026-09-16 经用户直接裁决**收窄**（四方面 → 三项，并确认求值方式）；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

- 需求确认状态：等价迁入后经 2026-09-16 用户裁决收窄；以正文和[变更记录](changes.md)为准，不得据 frontmatter 的迁移字段推断正文与源基线一致。
- 设计覆盖状态：`正在设计（直接候选机制）`。三项效用的**共同前提**已完成设计，见[设计投影 v1](design/v1/projection.md)；三项各自的内容仍归 PF-006 / PF-010 / PF-014。
- 规格采用状态：[租户治理 v1](../../../spec/capabilities/tenant-governance/README.md) 为 **candidate**，尚未在当前基线采用或发布。
- Realization 与实现验证：[tenant-governance 节点](../../../realization/packages/tenant-governance/README.md)设计完成未实现；无 assembly，无端到端验证。
- 当前可复用设计落点：[租户治理契约](../../../spec/capabilities/tenant-governance/README.md)的 S-11（差异不超三项）与 S-12（作用域层次唯一）承载本需求的共同前提。
- 覆盖边界与主要缺口：**层间次序**（账号级与租户级谁覆盖谁）、**组织上下文如何确定**、**组织租户如何产生**三项未确认；「流程规范」的处置仍未裁决，设计不得自行归并。组织租户产生无 owner 使本需求当前**无法端到端验证**。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| **要实施本需求，当前该怎么做** | [设计投影视图 v1](design/v1/projection.md)：三项效用的共同前提、作用域层次与未决 gap |
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
