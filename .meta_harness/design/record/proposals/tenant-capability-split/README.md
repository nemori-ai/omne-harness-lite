# 租户领域的能力拆分：五份契约还是合并

**选择对象**：租户领域的语义边界怎么切——现在是两份 data 契约（身份值、邀约过期）、
两个能力（账号身份、组织治理）、一个组合（账号注册）。**这条边界会被后续每一份设计引用**，
所以它是基座级选择，按[独立评审投票](review.md)的方式裁，不由主线自己定。

- **当前状态：候选，主线已按投票结果裁定「维持五份拆分（A）＋ 修两处瑕疵」**（2026-09-22，产品负责人以选项作答接受此处置）。
  **不是接受**：[`record/decisions/`](../../decisions/README.md) 里没有决定文件，
  五份契约在 [catalog](../../../registry/README.md) 里仍是 `candidate`。
- **本次终点与范围**：把三票原件、四个候选拆法与主线裁定收成一个可长期消费的信息包；
  两处瑕疵的修正落回 `spec/`（见[后续消费](#后续消费)）。
- **输入基线**：PF-001 rev 14、PF-003 rev 4、PF-015 rev 8 的产品正文，
  [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 与
  [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)，
  `harness-design-handbook` 的[能力覆盖与演化](../../../../agents/skills/harness-design-handbook/canonical/references/decompose.md)判据，
  以及经四轮 spec-reviewer 收敛后的五份契约（[spec/README 当前状态](../../../spec/README.md#当前状态)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：账号身份与组织治理之间要不要有契约级边界，以及组合是否独立成契约 |
| 现有能力覆盖 | 五份候选契约已成稿并互相登记依赖，[design.md](design.md) 只记这次要判的承载关系，不重写契约 |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：三票各自独立指出的两处瑕疵 |
| 三个实质候选 | **齐，四个**：A 维持、B 合并两能力、A′ 边界不动只修归属、C 按生命周期切（个人组织随账号）。B 与 C 各有真实反例与代价，都不是陪衬，见 [alternatives.md](alternatives.md) |
| 接受权限 | **本包不产生接受。**投票、裁定、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这次要选的是什么，五份契约怎么承载，剩下什么责任 | [设计正文](design.md) |
| 四个拆法差在哪，为什么裁 A，什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 投票怎么派的、三票各说了什么、反证有没有重复 | [评审记录](review.md) |
| 三票原件 | [`votes/`](votes/vote-1.md)（1、2、3） |

## 后续消费

- **维持不变**：五份契约的边界与 catalog 登记。
- **两处瑕疵的修正（落回 spec，候选版本原地改）**：
  1. 「当前租户身份」的 owner 归一——**落地时改判为「归一不搬家」**：原方向（存取移交 account-identity）
     被硬约束挡住（初值 `(个人组织, 账号)` 里的个人组织是治理事实、account-identity 算不出；S-12「不携带任何租户身份」；
     切换若不判成员资格会删掉 `membershipNotEffective` 承诺）。改为 governance S-14 增第 5 条：
     那项选择是治理**整体拥有的一条独立记录**（存、取、写与生灭），以 LoginStateId 为键引用账号契约的记录；
     登录状态失效后不可达、残留由治理提供者清理。account-identity 只改 S-2「不拥有」行措辞。依赖方向不变、catalog 不变。
  2. 改写两处把「换认证会重启整个治理」当成拆分硬理由的句子
     （`composition.account-registration/v1` S-2 后注、`capability.organization-governance/v1` S-4 末段）：
     治理 inject 账号读面，账号提供者换代本来就会重跑治理；A 买到的是**反方向**的半径收敛与契约层的失败隔离、
     SYS-DEPLOY 标价，不是那一句。
- **登记不做的**：C（按生命周期切）与「再切治理侧」保留为候选，[alternatives.md](alternatives.md#推荐与仍待区分的事项) 写明什么证据会让它们重新上桌。
- 接受仍须有权者在 `record/decisions/` 落决定，再去 registry 翻状态并冻结。
