# `data.identity-values` v1 · 身份值与隔离义务的三份候选

**选择对象**：把「这个系统里的东西归谁」——账号、组织、租户、登录状态各是什么形状——
以及**每个持有租户范围对象的 owner 都要遵守的那组同形条款**，写成**一份共用的数据契约**时，
它应该承诺到什么程度。

三份候选对「拥有什么」没有分歧，分歧在**边界画在哪**：
`TenantId` 给不给标量形式、不透明标识的相等语义要不要写进契约、
`ScopeLayerIdentity` 的变体枚举是开是闭、「显式携带」携带的是 `TenantId` 还是按归属层的那个值。

- **当前状态：合并件已接受。**三份竞标已由主线合并裁定，合并结果落盘为
  [`spec/data/identity-values` v1](../../../spec/data/identity-values/README.md)，
  并由 [D-023](../../decisions/tenant-domain-design-acceptance/README.md)（产品负责人，2026-09-22）接受，
  [catalog 状态 `accepted`、资源已冻结](../../../registry/README.md)。
  **接受的是合并件，不是任何一份原件**——三份原件本身未被独立评审，留在本包作来源。
- **本次终点与范围**：把竞标原件、择优规则与主线裁定收成一个可长期消费的信息包。
  评审记录见 [review.md](review.md)：合并件经过四轮 spec-reviewer 评审并在第四轮收敛（0 阻断）；三份原件本身未被独立评审，architecture-reviewer 未派。
- **输入基线**：PF-001 rev 8 及其后续修订、PF-002、PF-003、PF-015 的产品正文，
  [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 与
  [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)，
  以及[统一语言](../../../ubiquitous_language/README.md)的相关词条。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是，见本页开头与 [alternatives.md](alternatives.md#选择对象与必要约束) |
| 现有能力覆盖 | **本基线此前没有任何身份值契约**，[design.md](design.md) 记的是这次调查的结果：三份候选**都**判定它必须独立成一份 `data` 契约，理由一致（没有操作、没有状态转移、被十几个 owner 共享） |
| 剩余责任 | 见 [design.md](design.md#剩余责任与归属) |
| 三个实质候选 | **齐。**[`candidates/A`](candidates/README.md)、`B`、`C` 三份**独立起草的完整契约包**（各含 `contract.md` ＋ Schema ＋ 起草笔记），不是改名或调参。它们在四个可判断的点上**给出不同答案**，[逐条列在 alternatives.md](alternatives.md#四个真正分歧的点) |
| 接受权限 | **本包不产生接受。**落盘、评审、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这次要选的是什么，现有能力怎么承载，剩下什么责任 | [设计正文](design.md) |
| 三份候选差在哪，按什么规则择优，主线裁了哪些争议 | [候选与取舍](alternatives.md) |
| 有没有人独立审过 | [评审记录](review.md)——合并件四轮 spec-reviewer，第四轮 0 阻断；原件未审、架构评审未派 |
| 三份原件本身 | [`candidates/`](candidates/README.md)（含迁入时唯一改动的说明与迁移前后的 SHA-256） |

## 后续消费

- **已落盘的候选契约**：[`spec/data/identity-values` v1](../../../spec/data/identity-values/README.md)。
  **它是合并结果，不是三份中的任何一份**；对应关系见
  [alternatives.md 的择优规则](alternatives.md#择优规则合并成一份的依据)。
- **已在 catalog 登记**（2026-09-22）：坐标
  `(omne-harness-lite-design-2026-09-15, data.identity-values, 1)`，状态 `accepted`（自 D-023 起），
  `dependencies` 为空数组，`acceptance` 指向 D-023 的 `acceptance.json`。
- **四个消费者契约**各自登记了对它的依赖：
  [offer-expiry](../../../spec/data/offer-expiry/README.md)、
  [account-identity](../../../spec/capabilities/account-identity/README.md)、
  [organization-governance](../../../spec/capabilities/organization-governance/README.md)、
  [account-registration](../../../spec/compositions/account-registration/README.md)。
- **还没有的**：决定文件、冻结登记、提供者与装配映射、任何证据。
  本契约[不建形式工件](../../../spec/data/identity-values/README.md#版本包)，
  它触发的义务是静态检查与消费者核对场景，状态一律「未开始」。

排期与派工不在本包，留在任务区。返回[提案](../README.md)。
