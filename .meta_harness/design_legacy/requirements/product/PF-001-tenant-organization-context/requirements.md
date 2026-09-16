---
kind: product-feature
id: PF-001
primary_dimension: user
secondary_dimensions: [agent]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/user/PF-001-tenant-organization-context.md
source_sha256: 2dfd408aeb03424e52369664fa26d38606b7121b8d7c658be8df19527048cbbd
source_anchor: "heading:# PF-001：原生租户隔离与多组织上下文"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-001：原生租户隔离与多组织上下文

[用户维度](../by-user.md)

主维度：用户。副维度：智能体。2026-09-12 用户逐项介绍中的第一项；
确认范围于 2026-09-16 经用户直接裁决收窄，见[变化记录](changes.md#2026-09-16-组织上下文效用范围的收窄)。

## 已确认要求

以下段落及表格为 PF-001 的确认范围。

原生租户隔离义务引用 [SYS-TENANT](../../system/constraints/requirements.md#sys-tenant)。对于同一个用户，系统须能够表示其所归属的多个组织，
以及该用户与这些组织的归属关系。

当用户在不同的组织上下文下与 agent 协作时，组织上下文会影响协作中的
**效用（effect）**。系统须能够表达并使相应差异实际生效。2026-09-16 用户直接裁决
该效用**只限于以下三项**，并同时确认其求值方式：

| 方面 | 随组织上下文适用的内容 | 求值方式 |
|---|---|---|
| 设置 | 协作中适用的配置项取值 | 同字段按明确优先级覆盖 |
| 权限 | 协作中适用的访问与操作权限 | 同字段按明确优先级覆盖 |
| 可用技能或工具 | 协作时可用的技能与工具集合 | 按当前上下文动态组装 |

**求值方式属于确认范围。**设置与权限按同字段优先级覆盖求值，可用技能/工具集按当前
上下文动态组装；系统**不要求**为每个「组织 × 其他身份维度」的组合预先保留独立的设置、
权限或工具集合。优先级链的具体次序由设计确定，本条只要求它明确且可解释。

同一用户在组织 A 与组织 B 的上下文中协作时，上述三项可以有不同的效用；
用户身份、多个组织归属和当前协作所处的组织上下文需要能够分别表达。
具体差异随相应组织上下文生效，并继续受[SYS-TENANT](../../system/constraints/requirements.md#sys-tenant)
的租户隔离要求约束。

**数据范围与隔离边界不在本条单列。**该义务由 [SYS-TENANT](../../system/constraints/requirements.md#sys-tenant)
全局拥有，本条不重复声明；本次收窄不削弱它，也不把任何数据隔离责任转移给上述三项。

## 待澄清与设计输入

这里的“效用（effect）”沿用用户的产品表述，其精确语义、组织上下文的确定与
变化方式，以及相应规则如何作用于协作，待后续展开。当前
[Tenant Governance 候选契约](../../../spec/capabilities/tenant-governance/v1/contract.md#租户与成员)
提供身份与成员关系的设计输入；[租户管理来源研究](../../../research/tenant-management-sources/README.md)
保存可回溯依据。候选尚未在新基线接受，不据此宣称本条全部完成设计。

本页不将产品表述中的 effect 等同于某种运行时 Effect 类型或实现机制。

原确认范围中的**「流程规范」（协作时应遵循的流程、规则与要求）在本次收窄后未单独保留**。
若后续设计证明它既不能由「权限」承载、也不属于「可用技能或工具」的动态组装范围，
须回到需求方重新确认；设计不得自行补一个第四方面，也不得静默把它归入其余三项。

[PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md) 进一步拥有组织级
与个人级的资产、共享权益和角色操作要求；本页保留多组织协作效用的共同前提。
