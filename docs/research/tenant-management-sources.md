---
kind: research
id: R-tenant-management-sources
scope: PF-006/PF-010 的职责整理，以及个人用户与组织超级管理员对资产、设置、权限的管理
---

# 个人与组织管理操作的来源核对

[PF-010 管理要求](../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) · [PF-006 生效规则](../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md) · [研究索引](README.md)

2026-09-12 用户提出考虑合并 PF-006/PF-010，并授权自行判断；同时明确个人
用户可管理自己个人租户下的权限、设置与资产，组织超级管理员可管理所在组织
的这些对象。以下来源固定于 `omne-next` 提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，九份引用文件与 Git blob 逐字节
核对。静态阅读不证明原系统或本项目的管理功能已实现。

## 本次整理的职责判断

保留两个产品编号，PF-010 扩为“个人与组织的资产、设置及权限管理”：

| 条目 | 唯一维护的内容 | 互相引用的边界 |
|---|---|---|
| PF-010 | 谁在什么个人/组织范围管理哪些对象，以及查询、创建、修改、撤销/删除的对象语义 | 管理设置/定义授权后如何影响运行，引用 PF-006；停止 Session/Run 引用 PF-013 |
| PF-006 | 配置覆盖、定义级授权及实际求值、失效与生效规则 | 管理主体、操作目录与统一管理体验引用 PF-010，不再另列同义 CRUD |

这是本轮按用户授权作出的需求组织判断，不是原系统已经替本项目接受的架构
选择。理由是管理操作与生效规则可以独立增长：新增一种资产管理动作，不必
重写模型偏好的覆盖规则；新增一种设置的求值规则，也不必复制组织管理范围。
产品可以保持连续管理体验，文档无需因此合成一份大正文，原有条款身份与引用
也可保持稳定。此处不定义独立管理服务、设置聚合或页面数量。

## 来源与映射

| 来源 | 状态与本轮核对范围 | 本项目对应 |
|---|---|---|
| [组织与成员生命周期][membership] | Accepted · current，2026-08-03；角色治理、最后 active owner、成员变更生效与私人数据边界 | PF-010.C8/C9：组织最高治理资格、角色权限分配、最后管理者保护；源 owner/admin/member 名称不直接成为本项目枚举 |
| [资产管理与 custom Agent 旅程][journey] | Accepted · current，2026-08-05；Outcome、PORTAL-1～5、Failure/time semantics | C9/C10：统一管理体验、精确生命周期动作、引用影响、部分成功、冲突与重试、秘密引用；不合并资产治理与 Run 控制 |
| [创作与不可变发布][authoring] | Accepted · current，2026-08-03；actor/ownership、draft/release、并发、发布/丢弃/退役 | C9/C10：自有定义创建、修订、发布；草稿丢弃与已发布退役不同，不能无痕删除已发布定义 |
| [选用与精确版本][acquisition] | Accepted · current，2026-08-03；actor、pin、update、entitlement/uninstall | C9：显式选版、卸载选用关系，权益和源定义保留；旧检查不能代替提交时准入 |
| [租户权益生命周期][entitlement] | Accepted · current，2026-08-03；Tenant/actor、签发者、有效性与退出边界 | C9：签发/暂停/恢复/撤销须有对应 authority；管理员不能自造外部权益，撤权不自动删除或强停 |
| [模型档案][profiles] | Accepted · current，2026-09-11；Statement、AC-3～6 | C9：自定义档案增删改、官方原档只读；删除退出可选集合，现存引用有明确处置，变更留痕不等于任意历史版本读取 |
| [模型选择与会话连续性][model-selection] | Accepted · current，2026-09-04；Statement、AC-1～3 | PF-006.C4/C6 的明确实例：会话选择覆盖用户偏好，再到定义默认；缺席层按已有规则回落，不外溢 |
| [设备能力同意][device-consent] | Accepted · current，2026-07-30，含后续对账；Statement、Effective-state、AC-3～7 | C9 管理授权仍保留目标 owner、模式与范围、当前生效边界；撤销全权依据不会顺带撤销独立有效的逐项授权 |
| [User Settings 聚合投影][settings-draft] | **Draft**，含 2026-08-04 对账；§1～3 的分类、入口与例子 | 仅作范围核对：统一设置体验不应改写各设置本来的含义；其 CQRS/facade、字段归属及 UI/Agent 可编辑交集不是本项目接受依据 |

资产类型与 official/customized 原有范围继续由[资产来源核对](tenant-asset-and-permission-sources.md)
维护；本页补充管理操作，不重新登记全部分类。

## 防止管理范围被误解

- **组织超级管理员不是平台管理员。** 用户本轮明确的是所在组织的管理资格。
  源最高角色 `owner` 可管理组织设置/角色，源 `admin` 权限较窄；不能直接把
  英文 admin 等同本轮超级管理员，也不能复制源枚举代替本项目角色模型。
  组织管理仍不授予成员个人租户、私人会话或个人设备/外部账号的专属同意权。
- **CRUD 不要求对象全部有同一种删除。** 自有草稿可修订/丢弃，已发布定义
  以新版本更新并保留退役历史；外部原件、租户选用、权益与未来激活分别管理。
  已获使用权不等于获得编辑或 fork 权，移除选用不等于撤回供应方权益。超级
  管理员的组织权限不能改写官方发布原件或伪造外部签发结果。
- **清除覆盖的结果由设置自己的规则决定。** 模型三层链是明确来源实例；
  本轮将它用于解释“清除当前覆盖”和“把值设为 false/空值”的差异，不推广
  成所有设置共享三层。组织设置、账号偏好、设备同意与 Session 状态不能因
  同处管理界面就自动获得相同作用域或覆盖优先级。
- **旧 Draft 不限制新要求的直接管理入口。** User Settings 草稿曾以 UI
  控件形态和 UI/Agent 双路可编辑交集划分类别，并将某些自然语言权限字段
  留给 Agent 编辑。本轮不能据此否定用户已明确的权限/设置管理能力；具体
  字段和编辑方式仍按真实语义细化，也不从该 Draft 导入“一切用户事实均可
  由 Agent 更改”的无条件新承诺。
- **治理生效不等于运行停止。** 来源的权益、成员、资产和配置变化影响各自
  后续准入，已有调用的停止归 [PF-013](../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)
  及单工具 PF-003。依赖影响需要明确，但不默认级联删除会话、日程或其它资产。
- **管理权与模型档案的组织归属另有区别。** 用户已确认组织范围的管理能力；
  哪些模型档案属于账号个人设置、哪些成为组织共享资产仍需具体建模，不能从
  一条支持自定义档案增删改的来源就默认为所有账号档案组织共享。

本轮未采用源 BC 分工、角色枚举、统一写门面、数据库或接口形式，未执行权限
隔离、并发修改或依赖影响测试。当前候选只登记仍缺的管理与生效设计，不因
本次文档整理改变其接受状态。

[membership]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-organization-tenant-and-membership-lifecycle.md
[journey]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/first-party-agent-asset-and-custom-agent-management-journey.md
[authoring]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-authorized-agent-asset-authoring-and-immutable-release.md
[acquisition]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-authorized-agent-asset-acquisition-and-version-selection.md
[entitlement]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-effective-agent-asset-entitlement-lifecycle.md
[profiles]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/blueprint-model-profile-as-one-fully-filled-form.md
[model-selection]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/durable-session-model-selection-and-non-degrading-continuity.md
[device-consent]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-consented-device-capability-use.md
[settings-draft]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/user-settings-aggregate-projection.md
