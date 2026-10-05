# 形式化工件与论证映射

本页拥有**条款 → 性质 → 模型 → 检查配置**这一层对应关系，以及每个工件**盖不到什么**。
它不是模型，也不是证明，**不填通过状态**——实际执行的工具、配置、范围与结果在
[验证入口](../../verification.md)。

本版选用两个工件，[理由在契约 S-45](../contract.md#s-45-本版选用哪些形式工件)：
并发交错用 TLA+，结构关系用 Alloy。**不建 JSON Schema**——本契约的数据形状全部归
`data.identity-values` v1 与 `data.offer-expiry` v2，在这里再建一份就是第二份权威。

## v2 的复用边界

Membership.tla、两个 cfg 和 Affiliation.als 从冻结 v1 原样复制；语义与有限检查输入未变。
旧执行证据只能复用其已检查范围，不提升为 v2 全部验证。新增拒绝的抽象终结竞争消费 OE2，
真实接收方授权、SQL 参与、登录最终活动与通知边界归 S-64 的提供者测试，旧模型均未覆盖。

## 本版选用什么

| 契约条款 | 性质 | 为什么要这个表达 | 模型与定义 | 未覆盖范围与相应义务 |
|---|---|---|---|---|
| [S-17](../contract.md#s-17-同一组织的成员写入序列化) · [S-28](../contract.md#s-28-调整角色) · [S-29](../contract.md#s-29-解除成员) | **任何组织在任何时刻至少有一位有效超级管理员** | 这是一条**自定义并发协议**：两次动作各自的前置都成立、合起来违反不变量。只有行为模型表达得了交错，也只有它能在去掉序列化时给出反例 | [`Membership.tla`](Membership.tla)：`AtLeastOneSuperAdministrator` | 跨进程协调（[契约 S-42](../contract.md#s-42-装配给的保证-vs-协议须给的保证) 右列、[缺口 G-7](../contract.md#十一已知缺口)）；存储是否真的兑现序列化——**模型假设它兑现，这条前提由提供者承担** |
| [S-25](../contract.md#s-25-接受邀请) · [S-39](../contract.md#s-39-回来的是同一个租户) | 解除之后再加入**是同一条记录重新有效**，角色不继承 | 放进同一个行为模型，是为了让不变量不平凡——有效超管这个集合要能增长 | [`Membership.tla`](Membership.tla)：`Rejoin` | 租户级持有「不可达但不销毁」那一半**不在本模型**：它跨契约，证据形式是[规范场景 S-49](../contract.md#s-49-解除之后再加入回来的是同一个租户) |
| [S-7](../contract.md#s-7-上级组织属性) | **至多一个上级** | **不建断言**：它由 `parent : Organization -> lone Organization` 的多重性兑现，写成断言按定义恒真，是空的 | [`Affiliation.als`](Affiliation.als)：字段声明 | 声明本身不是证据。真正的义务是**实现的数据形状里没有写第二个值的路径**，证据形式是静态检查，登记在[验证入口](../../verification.md) |
| [S-7](../contract.md#s-7-上级组织属性) · [S-32](../contract.md#s-32-接受隶属请求) | **上级链不成环，自环也不行** | 这一条**不由形状兑现**，要在写入的同一次提交内读多行判定——所以要把「接受」建成一次状态转移，才检查得出判环前置在不在起作用 | [`Affiliation.als`](Affiliation.als)：`acceptAffiliationRequest` / `acyclic` / 断言 `AcceptPreservesAcyclic`。判环写成 `child not in newParent.*(c.parent)`（`*` 含自身） | **两次并发接受**不在本模型（Alloy 表达不了交错）。它归[契约 S-42](../contract.md#s-42-装配给的保证-vs-协议须给的保证) 第二行与[缺口 G-7](../contract.md#十一已知缺口) |
| [S-6](../contract.md#s-6-两个变体与四条结构性禁止) · [S-12](../contract.md#s-12-上级链与有共同上级) | **个人组织不在任何链上，因此与任何与它不同的组织都没有共同上级** | 产品正文说这是「恒为空」的直接结果、不是额外规定——断言核对的正是这句推论 | [`Affiliation.als`](Affiliation.als)：`PersonalOrganizationOffChain` / 断言 `PersonalOrganizationSharesNoAncestor`（**带 `disj`**） | 另外三条结构性禁止（不可邀请、唯一成员不可解除、不得有第二个成员）**不在本模型**：它们是操作的失败集合项，证据形式是[规范场景 S-51](../contract.md#s-51-个人组织里没有这个动作)。**个人组织的清除路径**（[S-53](../contract.md#s-53-清除未激活账号的个人组织)）也不在本模型：它是一次带账号读面前置的写操作，不是结构关系 |
| [S-12](../contract.md#s-12-上级链与有共同上级) | 「有共同上级」**就是**「同一棵隶属树」 | PF-001 rev 12 裁定两者是同一个判据；本断言核对的是契约那句推论——**至多一个上级 + 无环 ⇒ 顺着上级走必定终于唯一的根** | [`Affiliation.als`](Affiliation.als)：断言 `ShareAncestorIsSameAffiliationTree`，**预期无反例** | `sameAffiliationTree` 按「根相同」独立写（`rootsOf`），**不与 `shareAncestor` 同式**，否则断言退化成「X iff X」。等价**以 `acyclic[c]` 为前件**——有环时那条链上没有根，前件不能省 |

**没有为下列条款建模型，各自的理由**：

- **邀约的过期**（[S-10](../contract.md#s-10-邀请)、[S-11](../contract.md#s-11-隶属请求)）：
  判定式与有限终结竞争模型归 [data.offer-expiry v2](../../../../data/offer-expiry/v2/contract.md)。
  本契约要证的是**它在接受操作上被按时求值**，那是一次提交边界的事实，
  证据形式是[规范场景 S-46](../contract.md#s-46-邀约的四种收场)～[S-47](../contract.md#s-47-过期之后接受被拒且没有中间状态)。
  **不在这里复制第二份邀约状态机。**
- **成员资格读面的 `unavailable` 失败**（[S-9](../contract.md#s-9-成员资格判定结果两值不可用是读面失败)、[S-26](../contract.md#s-26-成员资格判定)）：
  这是提供者可用性，不是交错问题。建模它只会得到一个「读不到就读不到」的恒真结论；
  它真正会被违反的地方在实现里的一个 `catch`，只有故障注入抓得住——
  证据形式是[规范场景 S-52](../contract.md#s-52-成员资格不可用时明确失败)。
- **切换只影响此后新建的东西**（[S-37](../contract.md#s-37-切换当前租户身份)）：
  本契约这一侧只承诺「本操作没有写向任何层的路径」，是一条**结构性的负向承诺**，
  由代码结构与静态检查兑现；跨契约那一半归 PF-015，证据形式是[规范场景 S-50](../contract.md#s-50-切换只影响此后新建的东西)。

## TLA+ 与 TLC

- **模型文件**：[`Membership.tla`](Membership.tla)。
  状态变量三个：`effective`（成员关系记录的有效性，[S-8](../contract.md#s-8-成员关系记录)）、
  `isSuper`（同一条记录上的角色，[S-8](../contract.md#s-8-成员关系记录)）、
  `staged`（已通过前置、尚未写入的那次请求——**只有去掉序列化时才用得上**）。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `Commit(a,t,k)` 是一个**不可分割的动作** | [S-28](../contract.md#s-28-调整角色)／[S-29](../contract.md#s-29-解除成员) 的「前置与写入同提交」＋ [S-17](../contract.md#s-17-同一组织的成员写入序列化) 的序列化 |
  | `Stage` 与 `Apply` 分成两个动作 | **没有** S-17 时必然存在的那个窗口 |
  | `Remaining(t) # {}` | 前置「之后仍有至少一位有效超管」 |
  | `remove` 与 `demote` 共用同一条前置 | [flows §3.3 两行的前置逐字相同](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) |
  | `Rejoin` 复用同一个 `Actors` 元素 | [S-39](../contract.md#s-39-回来的是同一个租户)：回来的是同一条记录、同一个 `TenantId` |
  | `Promote` | [S-28](../contract.md#s-28-调整角色) 的另一个方向（把超管分配给他人） |

- **公平性与外部可用性**：本模型**不带公平性假设**，因此**不检查任何进展性质**。
  契约的进展性质都是[有界的「下一次／下一道」形式](../contract.md#七性质与前提)，
  它们的证据形式是规范场景，不是这个模型。
- **检查输入**：

  | 配置 | 常量 | 检查什么 | 预期 |
  |---|---|---|---|
  | [`Membership.cfg`](Membership.cfg) | `Actors = {a1, a2}`，`Serialized = TRUE` | `TypeOK`、`AtLeastOneSuperAdministrator` | **在本范围内无反例** |
  | [`Membership_NoSerialization.cfg`](Membership_NoSerialization.cfg) | `Actors = {a1, a2}`，`Serialized = FALSE` | 同上 | **找到反例**（有效性验证） |

  两个配置都关掉死锁检查：本模型不承诺进展，「没有下一个动作」不是缺陷。

- **有效性核对**（**这一节是两个配置一起才成立的**）：
  - 初始状态存在且正是要考察的那个局面——两位有效超管。
  - 关键路径确实可达：`Promote` 与 `Rejoin` 使有效超管集合能增长，
    因此不变量**不是**靠「没人动得了它」成立的。
  - **`Serialized = FALSE` 必须给出反例。**给不出，说明 [S-17](../contract.md#s-17-同一组织的成员写入序列化)
    在本模型里是平凡的，那时问题在模型或条款表述，**不能记作 S-17 已验证**。
  - 反例轨迹须与 [flows §3.3](../../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系)
    描述的局面对得上：两位超管各自动作、各自看都合法、合起来把超管清空。对不上说明抽象错了。
- **`Actors` 的规模**：两个元素足以产生该反例，也足以覆盖 acceptance 点名的场景。
  **更大的规模不自动带来更强的结论**——本模型的交错来自「检查与写入之间的窗口」，
  两个写入者就已经打开它。加大规模是另一次检查，结果按它自己的范围陈述。

TLA+ 描述行为规格，TLC 对给定模型进行检查；**在已检查范围内未发现反例，不自动成为任意范围的证明**。

## Alloy

- **模型文件**：[`Affiliation.als`](Affiliation.als)。
  `Organization` 与两个变体、`Config`（一份「上级组织属性此刻的取值」）、
  派生的 `ancestorChain` / `shareAncestor` / `rootsOf` / `sameAffiliationTree` / `acyclic`，
  以及一次状态转移 `acceptAffiliationRequest`。
- **语义映射**：

  | 模型里的 | 契约里的 |
  |---|---|
  | `parent : Organization -> lone Organization` 的 `lone` | [S-7](../contract.md#s-7-上级组织属性)「至多一个上级」，**由形状兑现** |
  | `fact PersonalOrganizationOffChain` | [S-6](../contract.md#s-6-两个变体与四条结构性禁止) 第 3 条 |
  | `acceptAffiliationRequest` 的三条前置 | [S-32](../contract.md#s-32-接受隶属请求) ② 与 ④ 的判环、无上级、个人组织三项 |
  | 判环写成 `child not in newParent.*(c.parent)`（`*` **含自身**） | [S-32](../contract.md#s-32-接受隶属请求) ④③ 的两半：`newParent` 不是 `child` 自己，**且** `child` 不在 `newParent` 的上级链上 |
  | `c` → `c2` 两份取值 | 同一次提交的前后，**不是两次并发写入** |
  | `ancestorChain` 用 `^`，**不含自己** | **定义式归 `data.identity-values/v1#S-14`**；[S-12](../contract.md#s-12-上级链与有共同上级) 引用不复制 |
  | `shareAncestor` 用 `*`，**含自己** | **定义式归 `data.identity-values/v1#S-15`**（PF-001 rev 12 的判据），同上 |
  | `rootsOf` / `sameAffiliationTree` | [PF-003 §5.2 的「同一棵隶属树」](../../../../../product/PF-003-asset-transfer-and-sharing/design.md#52-边界是那棵隶属树不是单个组织)，**按「根相同」独立写** |

  > **两个谓词的权威在身份值契约，不在本契约。**`Affiliation.als` 的抬头注释已写全那两条的精确坐标；
  > **那两条一改，本模型与 [S-12](../contract.md#s-12-上级链与有共同上级) 都要同步核对**。
  > 函数名统一为 `ancestorChain`／`shareAncestor`——身份值契约、本契约、本模型**三处同一个名字**。

- **检查范围**：

  | 命令 | 范围 | 预期 |
  |---|---|---|
  | `run aNonTrivialTree for 4 but exactly 1 Config` | — | **找到实例**（一致性核对） |
  | `check AcceptPreservesAcyclic for 5 but exactly 2 Config` | 5 个组织、2 份取值 | 无反例 |
  | `check PersonalOrganizationSharesNoAncestor for 5 but exactly 1 Config` | — | 无反例 |
  | `check ShareAncestorIsSameAffiliationTree for 5 but exactly 1 Config` | — | **无反例**（**这一格改过**：此前预期找到反例，依据是当时未裁的缺口 G-5；PF-001 rev 12 裁定两个判据合一之后，改为预期无反例） |

- **一致性核对**：`run aNonTrivialTree` 必须给出一个三级深的团队链，**且那份取值是无环的**。
  给不出说明上面的 fact 把模型约束成了空的，那时三条 check 的「无反例」毫无意义。

  > **`acyclic[c]` 这个前件是本轮加的，不能省。**没有它，这个 run **可以靠一个环满足**：
  > 环上任意两点互为对方上级链的成员，`b in ancestorChain[c,a] and d in ancestorChain[c,b]` 轻易成立。
  > 那样的实例既不是一棵三级深的隶属树，**也落在 A3 的前件 `acyclic[c]` 之外**——
  > 于是「模型能产生合法实例」这句话**对 A3 一条也不适用**，A3 仍可能是空泛成立的。
  > 加上前件，这个 run 找到的实例才同时是 **A3 前件下的一个见证**。
- **非平凡核对，三个变异，每一个都必须使对应的 check 给出反例**：

  | 变异 | 期望被哪条抓到 | 它排除的误判 |
  |---|---|---|
  | `acceptAffiliationRequest` 里那行判环前置**整行注释掉** | `AcceptPreservesAcyclic` | 「判环根本没起作用」与「规模太小碰不到环」分不开 |
  | 判环改回**不含自身**的 `child not in ancestorChain[c, newParent]` | `AcceptPreservesAcyclic`，反例形态是 `child = newParent` 的**自环** | 「判环起了作用」与「判环漏了自环这一档」分不开。**这一格是本轮加的**——旧模型正是这样写的 |
  | `shareAncestor` 改回**不含自身**的 `some ancestorChain[c,o1] & ancestorChain[c,o2]` | `ShareAncestorIsSameAffiliationTree`，反例形态是**一个组织与它自己的上级** | 「两个判据真的合一了」与「`sameAffiliationTree` 被写成了同一个式子因而恒真」分不开 |

  **第三个变异不可省。**`sameAffiliationTree` 若与 `shareAncestor` 同式，A3 就是「X iff X」——
  它永远无反例，却什么也没检查。**做这一步才知道 A3 有内容。**

结构范围内的检查结果**不自动说明任意规模或真实运行成立**。

## 版本与证据边界

用于定义规范的模型、性质与假设随规范版本冻结；已发布后增改规范工件需新版本。
执行配置、命令、原始输出、反例与工具版本在版本目录之外保存，绑定实际模型与输入快照，
由 [topic 的验证入口](../../verification.md)导航。**本页不填随运行变化的通过状态。**

返回 [v2 契约](../contract.md) · [包入口](../../README.md)
