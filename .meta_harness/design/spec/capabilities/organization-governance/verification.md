# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态：形式工件已执行第二次（run `-2`，评审轮一修订之后），规范场景一条都没演练过。**
> `capability.organization-governance` v1 已由 [D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受并冻结（2026-09-22），提供者设计在 [`realization/packages/tenancy/organization-governance`](../../../realization/packages/tenancy/organization-governance/README.md)；尚无源码、尚无装配。**此后版本目录不再原地改，语义改动发布 v2。**
> 下表登记的是**已经触发的证据义务**，其中形式工件那一组在
> [2026-09-22 的两次运行](#实际执行)里各执行过一遍，**结果记在那一节**。
>
> **上一次 run 的四条 Alloy 结果对当前模型不适用**：`Affiliation.als` 在评审轮一之后改过
> （`run aNonTrivialTree` 加了 `acyclic[c]` 前件，注释补了身份值契约坐标），
> **已按那个口径在 run `-2` 全部重跑**，见[变化的影响](#变化的影响)。
> **TLA+ 那一侧（`Membership.tla` 与两个 cfg）一个字节都没改**，
> 因此上一次 run 的那两行**仍在其原有范围内有效**；run `-2` 是一次同输入重跑，两次结论一致。
> **这两类不能合成一句话读。**
>
> **八条规范场景仍然一条都没演练过**——它们要的是真实实现，而实现不存在。
> **本包那三个 Alloy 变异／非平凡核对两次运行一条都没做**，因此模型那几条「无反例」
> **只说明断言没被违反，不说明断言有内容**；唯一的例外是
> [S-17 那条](#实际执行)，它的非平凡性由同一次运行里的有效性核对撑着。
> 此前那次抓到自环反例的 Alloy 执行仍然如实留在
> [结果与反例](#已执行alloy-抓到-s-32-的判环漏掉自环2026-09-22)一节，
> **它的结论对当前模型一条也不适用**。

## v2（`candidate`，2026-09-24）的证据义务

> **[v2](v3/contract.md) 是加法版**：两个时刻（[成员关系生效时刻](v3/contract.md#s-8-成员关系记录)、[隶属建立时刻](v3/contract.md#s-7-上级组织属性)）、写下它们的几条写路径多一项、带出它们的三个读面多一项并多一种 `unavailable` 触发、[S-22](v3/contract.md#s-22-读组织) ② 指路更正；**逐条差异在 [v2 第十三节](v3/contract.md#十三版本差异与规范工件)，上面这些之外与 v1 同文**。经独立评审第一轮（[处置表](#独立评审)），未接受。
> 因此下文「证据义务」一节里 v1 的每一行**对 v3 同样适用**（条款号相同、含义相同；S-22、S-36、S-59 那几行演练时另按 v3 的返回与失败触发核），实现采用 v3 时兑现一次即两版都有了；本节只登 v3 **新增**的义务与**沿用**的范围。
> **v2 一条证据都还没有**：没有新的执行，规范场景未开始。

| 规范条款与性质 | 证据形式 | 状态 | 适用范围、前提与未完成义务 |
|---|---|---|---|
| [v2 S-17](v3/contract.md#s-17-同一组织的成员写入序列化) ＋「至少一位有效超管」；[v2 S-7](v3/contract.md#s-7-上级组织属性) 三条结构约束与 [S-12](v3/contract.md#s-12-上级链与有共同上级) 的谓词 | **沿用 v1 的模型，不复制 cfg**：TLC 对 [`v1/formal/Membership.tla`](v1/formal/Membership.tla) ＋ [`Membership.cfg`](v1/formal/Membership.cfg)（formal task `organization-governance-v1-membership`）；Alloy [`v1/formal/Affiliation.als`](v1/formal/Affiliation.als) | **沿用 v1 的两次运行**（[下文](#实际执行)），**本版没有重跑**——模型与配置一个字节都没动 | **沿用成立的前提**：两个模型不含两个时刻；v2 给成员关系记录与上级组织属性多加的一项只随模型里已有的动作（加入、解除、接受隶属、解除隶属）一并写下，**不增加动作、不改守卫**，所以那几条结论在 v3 里**范围与前提不变**（`Actors = {a1, a2}`、存储兑现序列化；Alloy 的 scope）。**它们对两个时刻什么也没说**——不能把这一行读成「时刻已由模型覆盖」。v2 若日后给这两项加了守卫或新动作，这一行作废、要出 v3 自己的模型 |
| [v2 S-61](v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出) 两个时刻：随写入写下、解除不清（成员）／随值清空（隶属）、再接上改写成**严格更晚**的时刻；[S-22](v3/contract.md#s-22-读组织)／[S-36](v3/contract.md#s-36-当前租户身份查询)／[S-59](v3/contract.md#s-59-列出组织成员) 带出它们、读不到 ⇒ `unavailable` | 演练 ＋ 故障注入（两段，见条款） | **未开始** | 责任：提供者。**「严格更晚」一支必须在同一时钟分辨率内连做**，否则永远是绿的却什么也没证明——它是 [v2 S-42](v3/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末行「先后两次串行提交的时刻不相等」唯一的实现侧证据。受阻：提供者缺席（实现映射仍钉 v1） |
| [v2 S-42](v3/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末行：两个时刻与消费者写下的时刻同一时间源、不后退、先后可区分 | 装配侧检查（时间源选型）＋ 上一行的连做 | **未开始** | 责任：装配。**消费者那一侧**：`capability.asset-transfer` 的 TLC 任务只在「时刻同源严格递增、使用时判定是一步原子读」两条前提下检查 `NoRevival`，**把这条当作前提、不证明它**；先读关系、后读时刻的读序被那一建模方式吸收，证据是那份契约的场景 S-44 |

## 证据义务

### 形式工件

| 规范条款与性质 | 模型／命令及抽象映射 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-17](v1/contract.md#s-17-同一组织的成员写入序列化) ＋「至少一位有效超管」 | TLC 对 [`Membership.tla`](v1/formal/Membership.tla)，配置 [`Membership.cfg`](v1/formal/Membership.cfg)（`Serialized = TRUE`）；映射见 [formal 入口](v1/formal/README.md#tla-与-tlc) | **已执行两次**（[run `2026-09-22-formal-tenant-domain` 与 run `…-2` · 任务 `organization-governance-v1-membership`](#实际执行)）：两次都**无反例**，19 generated · 7 distinct · 完整穷尽。**两次输入逐字节相同**（模型与 cfg 本轮未改） | 责任已从「跑通」转到范围：结论只在 `Actors = {a1, a2}`、**且存储真的兑现序列化**这个前提下成立。跨节点不自动成立（[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)） |
| 同上的**有效性** | 同一模型，配置 [`Membership_NoSerialization.cfg`](v1/formal/Membership_NoSerialization.cfg)（`Serialized = FALSE`），**预期找到反例** | **已执行两次**（各自同一次 run 内，[run `-2` 的 `validity-check/`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/organization-governance-v1-membership/validity-check/README.md)）：两次都**按预期违反**，反例轨迹与 [flows §3.3](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) 的局面对得上 | **这一条与上一条必须成对报告，两次都一起报了。**它**不登记为 formal task**——期望失败的检查与该清单的语义相反（检查器按退出码判成败，这次退出 12） |
| [S-32](v1/contract.md#s-32-接受隶属请求) 判环 ＋ [S-7](v1/contract.md#s-7-上级组织属性) 无环 | Alloy `check AcceptPreservesAcyclic for 5 but exactly 2 Config`，**预期无反例** | **已执行**（[run `-2` · `unregistered-alloy-affiliation/`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#alloy-的-scope)）：**UNSAT**，即该规模内无反例。**上一次 run 那一格不再适用**（模型已改）；本次跑的是加了 `acyclic[c]` 前件的当前模型 | 责任：规格工具。**两个非平凡核对本次没做**：① 注释掉判环前置后该 check 必须给出反例；② **判环改回不含自身的 `ancestorChain` 后也必须给出反例**（`child = newParent` 的自环）。**②在判断 Alloy 能否登记为任务时被顺带做过一次**（改坏后 check 确实变成 SAT），但那是在临时副本上做的，**不作为本条的核对记录**。缺了它们，这条「无反例」区分不了「判环起作用」与「规模太小碰不到环」 |
| [S-6](v1/contract.md#s-6-两个变体与四条结构性禁止) ＋ [S-12](v1/contract.md#s-12-上级链与有共同上级) 个人组织恒不共祖 | Alloy `check PersonalOrganizationSharesNoAncestor for 5 but exactly 1 Config` | **已执行**（[run `-2`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#alloy-的-scope)）：**UNSAT**。跑的是加了 `disj` 之后的新形式 | 责任：规格工具 |
| [S-12](v1/contract.md#s-12-上级链与有共同上级)「有共同上级」**就是**「同一棵隶属树」 | Alloy `check ShareAncestorIsSameAffiliationTree for 5 but exactly 1 Config`，**预期无反例**（**这一格本轮改过**，改前预期找到反例） | **已执行**（[run `-2`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#alloy-的-scope)）：**UNSAT** | 责任：规格工具。**第三个变异核对两次都没做**——把 `shareAncestor` 改回不含自身的读法后该 check 必须给出反例。**缺它，这条「无反例」不能被读成 A3 有内容**：若 `sameAffiliationTree` 被写成了同一个式子，A3 就是「X iff X」，永远无反例却什么也没检查 |
| 模型的一致性 | Alloy `run aNonTrivialTree for 4 but exactly 1 Config`，**预期找到实例**。**本轮 pred 加了 `acyclic[c]` 前件** | **已执行**（[run `-2`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#加-acyclicc-前件之后找到的实例换了一个)）：**SAT**，实例的 `parent` 是 `O3→O2→O0→O1`，**一条真正的三级无环链**。**上一次 run 那一格已作废**——当时的实例 `parent` 含 `O0→O1→O2→O0`，是个**环** | **加前件的理由**：不加，这个 run 可以靠一个**环**满足（环上任意两点互为对方上级链的成员），那样的实例既不是三级深的隶属树、**也落在 A3 前件 `acyclic[c]` 之外**——于是「模型能产生合法实例」对 A3 一条也不适用。**上一次真的就落在这个坑里**（见左列两次实例的对比）。重跑之后，上面三条 check 的「无反例」**在 A3 前件下有了一个见证**，但**仍不等于断言非平凡**——那要靠三个变异核对，[它们一个都没做](#三条成对报告的义务) |
| [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 与「个人组织存在 ⇒ 账号记录存在」（第七节两条单向式之一；另一条「已激活的账号 ⇒ 恰有一个个人组织」的激活侧前提在账号契约，本包同样不建模） | **不由本包的模型兑现**：它跨本契约与账号契约两个提交边界，行为模型归 `composition.account-registration` v1 的[第二条动作链](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)（不变式 `NoOrphanPersonalOrganization`）。本包这一侧的证据形式是**规范场景 [S-54](v1/contract.md#s-54-清除只对未激活账号成立)** | **未执行** | 责任：提供者 ＋ 组合契约。**本契约只兑现 ⇒ 那一半的一步**（现读激活状态、同提交删两条记录）；**次序由组合承担**，[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 不核实账号记录是否已被清 |
| [S-7](v1/contract.md#s-7-上级组织属性)「至多一个上级」 | **不由断言兑现**：它是 Alloy 字段的 `lone` 多重性，写成断言按定义恒真 | **未执行。**证据形式是对实现数据形状的静态检查：**不存在写入第二个上级值的路径** | 责任：提供者。**Alloy 全绿不能记作本条已验证** |

### 规范场景

| 规范条款 | 证据形式 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-46 邀约的三种收场](v1/contract.md#s-46-邀约的三种收场) | 演练：真实存储、真实的发出／撤回／接受路径，**邀请与隶属请求各一遍** | **未执行** | 阻断在提供者缺席。**②③ 必须在同一次演练里对比**——分开跑证明不了「结果值逐字相同」 |
| [S-47 过期之后接受被拒](v1/contract.md#s-47-过期之后接受被拒且没有中间状态) | 演练，**显式关闭后台清理**；上界取 `issuedAt + offer_ttl` | **未执行** | 演练必须能操纵时间源，否则上界只能靠等待，无法作为回归检查。**这条同时是 `data.offer-expiry/v1#S-18` 的反面证据** |
| [S-48 并发移除对方](v1/contract.md#s-48-并发移除对方只有先成的一方成立) | **真并发**演练，不是两次顺序调用 | **未执行** | **顺序调用不经过 S-17 要保护的那个窗口，跑了也不算。**这条与上面的 TLC 两条是**三份不同范围的证据**：模型证交错语义，演练证提供者真的兑现了序列化 |
| [S-49 解除之后再加入](v1/contract.md#s-49-解除之后再加入回来的是同一个租户) | **跨契约**演练：本契约 ＋ 资产 owner 两侧一起跑 | **未执行** | 只跑本契约这一半**证明不了**「持有没被删」。受阻：PF-002／PF-003 的契约尚未成稿 |
| [S-50 切换只影响此后新建的东西](v1/contract.md#s-50-切换只影响此后新建的东西) | **跨契约**演练：本契约 ＋ PF-015 的会话契约 | **未执行** | 受阻：PF-015 的契约尚未成稿，且 [PF-015 本身仍是草稿](../../../product/PF-015-session-lifecycle-and-ownership/design.md) |
| [S-51 个人组织里没有这个动作](v1/contract.md#s-51-个人组织里没有这个动作) | 演练，**发起者必须是该组织的超级管理员** | **未执行** | 发起者不是超管就区分不了结构性禁止与权限判定——那正是 [acceptance 判据](../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据) 点名的错法 |
| [S-52 成员资格不可用时明确失败](v1/contract.md#s-52-成员资格不可用时明确失败) | **故障注入** | **未执行** | **这条最容易在实现里被一个「读不到就当没有」抹掉，必须真跑。**责任：提供者 |
| [S-21 创建团队组织](v1/contract.md#s-21-创建团队组织) 创建键的幂等边界 | 演练，**五支同跑**：①带键创建 ⇒ `OrganizationId`；②同创建者同键重放 ⇒ **同一个** `OrganizationId`、组织数不增、成员关系不重写；③同创建者不同键 ⇒ 另一个组织；④另一账号用同一个键 ⇒ 另一个组织（键绑定创建者）；⑤不带键连调两次 ⇒ 两个组织。**故障注入一支**：键登记读不到 ⇒ `unavailable`，**不得创建**。另：把 `team_creation_key_retention` 推过之后同键 ⇒ 新组织 | **未执行** | 责任：提供者。**②是唯一证明「回执丢失后重试认回同一逻辑操作」的证据**（[PF-001 §6.8](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#68-管理结果)）；故障注入那一支防「读不到登记就当没见过」——那正是回执丢失最常见的时刻。**这一行是 architecture-reviewer 2026-09-22 阻断 2 闭合时新增的** |
| [S-54 清除只对未激活账号成立](v1/contract.md#s-54-清除只对未激活账号成立) | 演练 ＋ 故障注入，**八支同跑**：①未激活且已过期 ⇒ `ok` **并拿到清除依据**；②已激活 ⇒ `accountIsActivated`；③**未激活但仍在期限内 ⇒ `accountNotExpired`，该账号随后仍能完成注册**；④**构造态**：构造「由该 `AccountId` 定位到的组织不是个人组织」（本操作只收 `AccountId`，正常输入表达不出团队组织，与⑦同为构造态）⇒ `organizationIsNotPersonal`；⑤**幂等（账号仍在）**：重复调 ⇒ `ok` 且仍返回依据；⑥**幂等（账号也已不在）**：①之后再清掉账号记录，用同一 `AccountId` 再调 ⇒ **`ok` 且仍返回依据**；⑦**缺陷观测**：构造「账号已不在、组织还在」⇒ **`accountDoesNotExist`**，组织原样还在、不产出依据；⑧账号读面 `storage-unavailable` ⇒ `unavailable`，组织原样还在**且不产出依据** | **未执行** | 责任：提供者。**这是本契约唯一的销毁路径，它的全部内容是「在什么情况下不删」**；只跑成功那一支，一个漏判的实现看起来完全正常。**`accountNotExpired` 那一支是本操作自己那一半防御的唯一证据**——它证明本操作**不替调用方相信「该清了」**；少了它，一个只判「未激活」的实现会全绿通过其余七支，并在运行期删掉一个**正在注册的人**的空间。**⑥⑦必须挨着跑**：两者的输入都是「账号读不到」，**区别只在组织在不在**；一个不分岔的实现要么把一次正常重扫报成缺陷（[清除链因此停住](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)），要么让一条真被破的不变量悄无声息。**⑧还须与⑥⑦对照**：`storage-unavailable` **不得**被当成「账号不存在」走进那两支。**这一步删错是不可逆的** |
| [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 产出的**清除依据** | 演练：成功与幂等成功**都要拿到依据**，且依据**与该 `AccountId` 绑定**；失败与 `unavailable` **一律不产出依据** | **未执行** | 责任：提供者。**它是[清除链次序在运行期的对应物](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)**：`capability.account-identity/v1#S-38` 没有依据就拒绝。**「失败不产出依据」必须真跑**——一个在拒绝路径上也发依据的实现，会让 ② 在 ① 根本没做成时照删不误 |
| [S-23](v1/contract.md#s-23-发出邀请)／[S-30](v1/contract.md#s-30-发出隶属请求) 的 `invalidOfferDuration` | 演练，**两路对比**：不给时长 ⇒ 按该类默认值写入；给一个非正／不合形状的时长 ⇒ **拒绝**，不写入任何东西 | **未执行** | 责任：提供者。**两路必须在同一次里对比**——把非法时长静默换成默认值的实现，只跑缺席那一路看不出来，而它会把一份发起者以为立刻过期的邀约变成一份长期有效的邀约 |
| [S-30](v1/contract.md#s-30-发出隶属请求) 指向自己 ⇒ `wouldFormACycle` | 演练：对自己的组织发一份隶属请求 | **未执行** | 责任：提供者。**与 [S-32](v1/contract.md#s-32-接受隶属请求) 的判环用同一个值**，演练须核对两处返回的**逐字相同**；实现不得为自环另开一个失败值 |
| **[S-55](v1/contract.md#s-55-读邀请)～[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)、[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的读时派生** | 演练：发一份邀请与一份隶属请求，各在 `expiresAt` **之前**读一次、**之后**再读一次，**其间不做任何写入、不运行后台清理** | **未执行** | **必须观察到**前一次是 `pending`、后一次是 `expired`，且**存储里没有任何字段被改过**（`data.offer-expiry/v1#S-7`：`expired` 不是被存下来的值）。同一次里核对列表面（[S-57](v1/contract.md#s-57-列出账号收到的待接受邀请)、[S-60](v1/contract.md#s-60-列出组织收到的隶属请求)）：那两份**过期后不再出现在默认列表里**，**而这不是一次写入**。责任：提供者。**这是 `data.offer-expiry/v1#S-9` 在本契约的落点**——在这六条读面之前它没有落点 |
| **[S-55](v1/contract.md#s-55-读邀请)／[S-56](v1/contract.md#s-56-读隶属请求) 的授权与不泄漏** | 演练：用**第三方**身份读一份存在的邀请／隶属请求 | **未执行** | **必须观察到** `invitationDoesNotExist`／`affiliationRequestDoesNotExist`，**不是 `notAuthorized`**；且与读一个**真不存在**的标识**返回逐字相同的值**。**两支必须同跑**——分开跑证明不了「不可区分」，而可区分就是一次存在性泄漏。责任：提供者 |
| **[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 不返回不全的名单；[S-55](v1/contract.md#s-55-读邀请)（`tenant` 支）／[S-56](v1/contract.md#s-56-读隶属请求)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的授权判定不可用 ⇒ `unavailable`** | **故障注入，两路**：(a) 让底层读面部分不可用，分别调 [S-59](v1/contract.md#s-59-列出组织成员) 与 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求)；(b) 让②的**成员资格判定**以 `unavailable` 失败，分别调 [S-55](v1/contract.md#s-55-读邀请)（`tenant` 支）、[S-56](v1/contract.md#s-56-读隶属请求)、[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)、[S-59](v1/contract.md#s-59-列出组织成员)、[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) | **未执行** | (a) **必须观察到** `unavailable`，**绝不能**观察到一份少了几行的列表。(b) **必须观察到**五处都是 `unavailable`，**绝不能**观察到 `invitationDoesNotExist`／`affiliationRequestDoesNotExist`／`notAuthorized`——那是把失败说成「没有这份」或失权（[S-9](v1/contract.md#s-9-成员资格判定结果两值不可用是读面失败)）。责任：提供者。**这与 [S-52](v1/contract.md#s-52-成员资格不可用时明确失败) 是不同的注入**：那条注入后调的是单点判定与写操作，这条调的是读面——一个把异常吞掉再 `continue` 的实现只在 (a) 里露馅，一个在授权判定的 `catch` 里返回拒绝值的实现只在 (b) 里露馅。**[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 那一支尤其要跑**：少一项就是一份超管永远看不见、然后静静过期的隶属请求。**(b) 是评审轮三补的**：此前只有 [S-59](v1/contract.md#s-59-列出组织成员) ⑧写了这一路，另四条的⑧漏了 |
| **[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 三条读面的授权分档**（PF-001 rev 15） | 演练，**同一个组织、三个调用方一起跑**：该组织的超管、该组织的**普通成员**、**另一个组织**的成员，各调这三条一次（九次）。**外加一支**：该组织的普通成员调 [S-59](v1/contract.md#s-59-列出组织成员) 并把①那个开关显式置成**「连无效的一起要」**（第十次）——**同一个组织里要先有至少一位已被解除的成员**，否则这一支即使实现错了也返回同一份列表，什么都证明不了 | **未执行** | **必须观察到**：普通成员调 [S-59](v1/contract.md#s-59-列出组织成员) 的**默认档**拿到**完整的有效成员名单**（里面**没有**那位已解除的），调 [S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 得 `notAuthorized`；**普通成员显式要「连无效的一起要」⇒ `notAuthorized`**，**绝不能**观察到「静默按默认档返回一份有效名单」——那会让他以为这个组织从没解除过谁（[S-59](v1/contract.md#s-59-列出组织成员) ⑧）；超管三条全通，且他走「连无效的一起要」时**那位已解除的必须出现在列表里**。另一个组织的成员三条全 `notAuthorized`。责任：提供者。**十次必须同跑**：[S-59](v1/contract.md#s-59-列出组织成员) 的②是**两档不同授权**（默认档＝有效成员任一角色，另一档＝超管），而另两条**整条仍是超管**——一个沿用「三条同一道授权」实现的版本，只跑超管那一行看起来完全正常，**三条里必有一条是错的**（要么普通成员看不到名单，要么他看到了本不该看的邀约）；一个把①当成纯取值过滤实现的版本，**前九次全对、第十次把已解除的成员交给了普通成员**。**另一个组织那一行是防「判成员资格时漏了组织这一半」**：默认档这道判定是「是不是这个组织的成员」，漏掉后半句就成了「是不是某个组织的成员」 |
| **[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 是隶属请求唯一的发现路径** | **跨操作演练**：组织 A 的超管调 [S-30](v1/contract.md#s-30-发出隶属请求) 向组织 B 发一份 → **B 的超管在不知道任何标识的前提下**调 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求) → 拿到 `AffiliationRequestId` → 调 [S-32](v1/contract.md#s-32-接受隶属请求) 接受 | **未执行** | **必须观察到**这条链**全程不需要任何带外传递的标识**。责任：提供者。**这条演练的是[flows §1.7](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#17-建立与解除组织隶属) 能不能走通**——在 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 之前它走不通：`AffiliationRequestId` 不透明、[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 只列发出的、[S-30](v1/contract.md#s-30-发出隶属请求) ⑨不发事件。**演练里不得让测试自己把 id 从第一步传给第三步**，那样跑的就不是这条义务 |
| **每个操作的 `invalidInput`**（[S-16](v1/contract.md#s-16-缺席时的默认答案)） | 演练：对**25 个操作**各传一次缺席／不合形状的身份参数 | **未执行** | **必须观察到** `invalidInput`，**不是 `unavailable`、不是各自的 `…DoesNotExist`、不是 `notAuthorized`**。责任：提供者。**这一条要跑全 25 个**——它最容易被实现成「哪个顺手用哪个」，而三者的含义（重试有没有用、对象在不在、你有没有资格）互不相同 |
| **判别式收到未知取值一律拒绝**（`data.identity-values/v1#S-32`） | 演练：向 [S-28](v1/contract.md#s-28-调整角色) 传一个不在 `TenantRole` 取值集合内的角色；向按 `OrganizationKind`／`MembershipStanding` 取值分支的路径各注一次未知取值；**向 [S-55](v1/contract.md#s-55-读邀请) ① 传一个不在 `account`／`tenant` 之内的调用方身份判别式** | **未执行** | **必须观察到** `invalidInput`，**绝不能**观察到「未知就走 else 分支」或被映射到某个默认取值。责任：提供者。**这是本轮把 `#S-32` 补进消费清单带来的义务**——判别式集合封闭这件事，只有在收到集合外的值时才看得出来。**[S-55](v1/contract.md#s-55-读邀请) 那一支是评审轮二加的**：它此前写成「`AccountId` 或 `TenantId`」的无判别式联合，实现只能靠「哪个字段有值」去猜，而**两个都给或都不给时猜不出**，且猜错一次就是把另一类人的授权判定用在这个调用方身上 |
| **[S-35](v1/contract.md#s-35-层身份) 没有 `unavailable`** | 静态检查 ＋ 演练：本操作不调任何提供者，失败集合恰一个值 | **未执行** | **必须观察到**它的失败集合里**只有 `invalidInput`**。责任：提供者。**这条是 [S-36](v1/contract.md#s-36-当前租户身份查询) 的反衬**：同样收一个不透明标识，那一条**有** `unavailable`（它真的读存储），这一条没有 |
| **[S-25](v1/contract.md#s-25-接受邀请) ②的「接受者账号已激活」** | 演练：给一个**未激活**账号发邀请（若该路径可达）或在接受前清除该账号，然后接受 | **未执行** | **必须观察到** `accountNotActivated`／`accountDoesNotExist`，**且没有成员关系被建起来**。责任：提供者。**这是本轮补的前置**：发出时判过一次不够，发出与接受之间账号可以被清除（`capability.account-identity/v1#S-38`），没有它会写出一条指向不存在账号的 `TenantId` |
| **[S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求) 撤回一份已过期的** | 演练：发一份、放到过期、撤回它 | **未执行** | **必须观察到** `alreadyConcluded`，**且存储里没有多出一条 `withdrawn` 记录**；此后再读，派生状态仍是 `expired`。**只看返回值不够**。责任：提供者。**这与 `data.offer-expiry` 那一侧是同一次执行可以同时兑现的两条义务**，[两边各自记结果](../../data/offer-expiry/verification.md) |
| **[S-20](v1/contract.md#s-20-创建个人组织) 的幂等不是拒绝** | 演练：对同一个 `AccountId` 连调两次 | **未执行** | **必须观察到**第二次返回 `ok` 与**同一个** `OrganizationId`，**绝不能**观察到任何失败值。责任：提供者。**这条撑着[「中途失败可以用同一标识接着完成」](../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)**；本轮把 `personalOrganizationAlreadyExists` 删掉之后，它是那条验收判据在本契约唯一的兑现点 |
| **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的 `accountDoesNotExist`**（**即 [S-54](v1/contract.md#s-54-清除只对未激活账号成立) 的⑦支，在这里单独登记它的断言**） | 演练：构造「账号记录已不在、个人组织还在」，调 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) | **未执行** | **必须观察到** `accountDoesNotExist`、**组织原样还在**、**不产出依据**，且这次失败**可被观测**（不折进 `unavailable`）。责任：提供者。**这是「个人组织存在 ⇒ 账号记录存在」被破之后唯一的运行期观测点**——除了这里，没有别的地方会同时看到「组织在、账号不在」。**本轮把它的触发条件收窄了**：读不到账号**本身不再是这个值**，[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ②乙先看组织——组织也不在就是一次正常重扫（`ok`）。**因此这一条必须与 [S-54](v1/contract.md#s-54-清除只对未激活账号成立) ⑥支同跑**，否则证明不了实现真的分了这个岔 |
| **[S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求) 再撤回一份已 `withdrawn` 的 ⇒ `ok`** | 演练，**与上面「[S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求) 撤回一份已过期的」那一行同跑，四支对比**：撤回一份 `pending` 的 ⇒ `ok` 并写下记录；**再撤回同一份 ⇒ `ok`，且存储里仍只有一条记录**；撤回一份已 `accepted` 的 ⇒ `alreadyConcluded`；撤回一份已过期的 ⇒ `alreadyConcluded` 且不写记录 | **未执行** | 责任：提供者。**四支必须同跑**：`alreadyConcluded` 的定义是[「存在一条**本操作不会再写的**终结记录（`accepted`），或已过期」](v1/contract.md#s-24-撤回邀请)，**`withdrawn` 不在其内**。一个按「终结记录存在就拒」实现的版本，会在第二支给出 `alreadyConcluded`——**只跑第一、三、四支看不出这个差别**。**这是评审轮二改掉的一处**：上一轮的定义写成「终结记录存在或已过期」，与⑦的幂等承诺当场矛盾 |
| **[S-26](v1/contract.md#s-26-成员资格判定) 的返回值是一个闭合和，三样都由返回值承载** | 静态检查 ＋ 演练：核对返回类型恰为 `invalidInput \| MembershipStandingResult`，且右支恰两支；再分别制造三种情形各调一次 | **未执行** | **必须观察到**三样（`MembershipStanding`、`failure = unavailable`、`invalidInput`）**都从返回值拿到**，**绝不能**有任何一样走异常、日志、事件或旁路信号。责任：提供者。**`invalidInput` 不得被塞进 `MembershipStandingResult` 当第三支**——那个类型是**判定结果**的类型，形状归 [`data.identity-values/v1#S-10`](../../data/identity-values/v1/contract.md#s-10-membershipstanding)，本契约引用不自定义。**这一条只有静态检查看得见**：一个把 `invalidInput` 抛成异常的实现，在所有正常路径上表现完全一致 |
| **过期判定的存在性读面不可用 ⇒ `unavailable`**（`data.offer-expiry/v1#S-20`） | **故障注入**：让[组织存在性读面](v1/contract.md#s-22-读组织)不可用，分别调 [S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求)（撤回）、[S-25](v1/contract.md#s-25-接受邀请)／[S-32](v1/contract.md#s-32-接受隶属请求)（接受）、[S-55](v1/contract.md#s-55-读邀请)～[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求)（读） | **未执行** | **必须观察到**九处都以 `unavailable` 失败：撤回**不写终结记录**；接受**不产生任何效果**；读面**不返回派生状态、不返回残缺或空的列表**。**绝不能**观察到任何一处把「读不到」判成「组织不存在 ⇒ 已过期」——那会把一次抖动变成一份（或一整表）邀约的**永久**失效（[`data.offer-expiry/v1#S-9`](../../data/offer-expiry/v1/contract.md#s-9-读时派生且派生状态不回退)：派生状态不回退）。责任：提供者。**这与时间源那一次注入是两次不同的注入，不能互相替代**——[时间源那一次登记在过期语义那一侧](../../data/offer-expiry/verification.md)；**[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 那一支尤其要跑**——它判过期用的指向对象就是调用方自己的组织，折错方向会让超管看到一张空表 |
| **[S-57](v1/contract.md#s-57-列出账号收到的待接受邀请)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的过滤开关有默认** | 演练，**每条两路对比**：不给开关调一次、给「连已终结的（[S-59](v1/contract.md#s-59-列出组织成员)：连无效的）一起要」调一次 | **未执行** | **必须观察到**不给开关时**只拿到 `pending` 的**（[S-59](v1/contract.md#s-59-列出组织成员) 是**只拿到有效的**），给了开关时**多出已终结（无效）的那些**，且**每一项都带它此刻求出的派生状态／有效性**。责任：提供者。**[S-57](v1/contract.md#s-57-列出账号收到的待接受邀请)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 的默认是评审轮二补的**——此前 [S-57](v1/contract.md#s-57-列出账号收到的待接受邀请) 根本没有这个开关（本账号因此没有任何面回看自己接受过的邀请），[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 有开关却没写默认。**四条同形、默认也同形**，演练须核对这一点：形状分叉会让调用方在四条之间各记一套规矩 |
| **`invitation.issued` 必发**（[S-40](v1/contract.md#s-40-事件都是通知)） | 演练：发出一份邀请，观察派发 | **未执行** | **必须观察到**提交之后派发一次。责任：提供者。**必发不等于必达**——本条只断言发出方派发了，不断言任何监听者收到；[邀请的送达面是读面](v1/contract.md#s-55-读邀请)，不是这个事件。**本轮把它从「可选」改成「必发」，这一格因此第一次写得出断言** |

### 由别处承担、本契约只写明要求的

| 条款 | 谁承担 | 说明 |
|---|---|---|
| [S-10](v1/contract.md#s-10-邀请)／[S-11](v1/contract.md#s-11-隶属请求) 的过期判定式与求值次序 | `data.offer-expiry` v1 | 本契约**引用不复制**。那份契约的证据义务在[它自己的验证入口](../../data/offer-expiry/verification.md)。**[S-46](v1/contract.md#s-46-邀约的三种收场)／[S-47](v1/contract.md#s-47-过期之后接受被拒且没有中间状态) 与那边的 `#S-23`～`#S-25` 不是重复登记**：那边断言判定式（什么时候不再可被接受、三种来路逐字同值、上界是 `offer_ttl`），**这边断言本契约自己那个具名值 `offerNoLongerValid` 与本契约自己的效果面**。**一次执行可以同时兑现两边，但两边各自记结果，谁也不填谁的空** |
| 身份值的形状与隔离义务的静态检查 | `data.identity-values` v1 | 同上 |
| 账号已激活判定、账号存在判定（`#S-18`）、登录状态校验（`#S-17`） | `capability.account-identity` v1 | 该契约**已成稿**，条款号已填进 [S-4](v1/contract.md#s-4-依赖方向与被消费的面)；**证据义务归它自己的[验证入口](../account-identity/verification.md)**，本包不重复登记。[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 又消费一次 `#S-18`，仍是同一条依赖。**catalog 已登记**（2026-09-22，clauses `S-17`／`S-18`；评审轮四按「引用即消费」补 `S-14`／`S-20`／`S-22`／`S-38`，共六条），[缺口 G-10](v1/contract.md#十一已知缺口)（评审轮三前编号 G-5）就此闭合 |
| 未激活账号记录的清除与登录标识的释放 | `capability.account-identity` v1 的 `#S-38` | 本契约的 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) **只清个人组织那一半**；账号那一半与两步的次序归 `composition.account-registration` v1 的[第二条动作链](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)。**本包不重复登记它们的义务** |
| 租户级持有「不可达但不销毁」（[S-38](v1/contract.md#s-38-解除只改成员关系的有效性) 的前提） | 资产 owner 的契约 | 本契约给判定，**不给强制**。这一条没有本契约能单独跑出来的证据 |
| 各 owner 的访问点显式携带 `TenantId` 并调用 [S-26](v1/contract.md#s-26-成员资格判定) | 各 owner | 这是 17 条「有前提地能」的那个共同前提；**本契约只提供判定面** |
| 「已经开始的调用是否停止」（[S-44](v1/contract.md#s-44-撤销不发出停止信号) 的另一半） | 尚无 owner 契约 | [缺口 G-6](v1/contract.md#十一已知缺口) |
| **调用方身份已由入口层核实**（全部写操作与读面，[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末两行） | **apps 装配** | **本契约的授权判定全部以「身份值是真的」为前提，而这个前提不由本契约兑现**。谁拿到一个 `TenantId` 就能以那个身份调它的每一个操作。**因此本契约的面不得被直接暴露成终端 API**——装配必须在它前面放一层身份核实。**这一条没有本契约能单独跑出来的证据**：它的证据形式是装配侧的检查（终端 API 前有入口层）与跨进程时的协议重验（`data.identity-values/v1#S-30`），**两者都不在本包** |
| [S-55](v1/contract.md#s-55-读邀请)～[S-57](v1/contract.md#s-57-列出账号收到的待接受邀请) 返回的派生状态**的判定式** | `data.offer-expiry` v1 | 本契约兑现的是**它在这几个读面上被按读取时点求值**（[上表](#规范场景)那一行）；判定式本身的证据在[那份契约的验证入口](../../data/offer-expiry/verification.md) |

## 实际执行

**按时间倒序。每一行自带它跑的是哪一版模型**——
[`Membership.*` 本轮未改，`Affiliation.als` 改了](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#为什么重跑)，
因此两个 run 的行**不是整批作废、也不是整批仍然有效**。

| run id | 任务／命令 | 配置与范围 | 结果 | evidence |
|---|---|---|---|---|
| `2026-09-22-formal-tenant-domain-2` | **formal task** `organization-governance-v1-membership` | [`Membership.cfg`](v1/formal/Membership.cfg)：`Actors = {a1, a2}`、`Serialized = TRUE`、`CHECK_DEADLOCK FALSE`、**无公平性假设** | **无反例**，退出 0；19 generated · 7 distinct · **0 left on queue**（完整穷尽）· 报告深度 4 | [任务目录](../../../record/evidence/2026-09-22-formal-tenant-domain-2/organization-governance-v1-membership/output/tlc-Membership.log) |
| 同上 | **有效性核对，不是任务** | 同一模型 ＋ [`Membership_NoSerialization.cfg`](v1/formal/Membership_NoSerialization.cfg)：`Serialized = FALSE` | **按预期违反** `AtLeastOneSuperAdministrator`，退出 **12**；148 generated · 76 distinct · **17 left on queue**（**未穷尽**，TLC 见到第一个反例就停） | [`validity-check/`](../../../record/evidence/2026-09-22-formal-tenant-domain-2/organization-governance-v1-membership/validity-check/README.md) |
| 同上 | **Alloy 四条命令，未登记为任务** | `run aNonTrivialTree for 4 but exactly 1 Config`（**本轮 pred 加了 `acyclic[c]` 前件**）；三条 `check` 分别 `for 5 but exactly 2 / 1 / 1 Config`；求解器 sat4j，`bitwidth 4`，`symmetry 20` | `aNonTrivialTree` **SAT**（预期，实例是 `O3→O2→O0→O1` 这条**无环链**）；其余三条 **UNSAT**（预期无反例） | [原始输出与 receipt](../../../record/evidence/2026-09-22-formal-tenant-domain-2/unregistered-alloy-affiliation/output/alloy-exec.log) |
| `2026-09-22-formal-tenant-domain` | **formal task** `organization-governance-v1-membership` | 同上，**输入与 run `-2` 逐字节相同** | **无反例**，退出 0；19 generated · 7 distinct · **0 left on queue** | [任务目录](../../../record/evidence/2026-09-22-formal-tenant-domain/organization-governance-v1-membership/output/tlc-Membership.log) |
| 同上 | **有效性核对，不是任务** | 同上，**输入与 run `-2` 逐字节相同** | **按预期违反**，退出 **12**；149 generated · 78 distinct · **18 left on queue** | [`validity-check/`](../../../record/evidence/2026-09-22-formal-tenant-domain/organization-governance-v1-membership/validity-check/README.md) |
| 同上 | **Alloy 四条命令，未登记为任务** | **对应旧模型**（`aNonTrivialTree` 的 pred 无 `acyclic[c]` 前件） | `aNonTrivialTree` **SAT**，但实例含 `O0→O1→O2→O0` **这个环**；三条 `check` **UNSAT**。**这四格对当前模型不适用** | [原始输出与 receipt](../../../record/evidence/2026-09-22-formal-tenant-domain/unregistered-alloy-affiliation/output/alloy-exec.log) |

**TLA+ 那两行两次输入逐字节相同**（`Membership.tla` = `5c7656a4…`、`Membership.cfg` = `abaa8fa2…`），
**因此上一次 run 的那两格不作废**。有效性核对两次计数略有出入（149/78/18 对 148/76/17）——
**TLC 见到第一个反例就停，多 worker 下停在哪一刻不确定**，
这恰好说明那几个数不是穷尽数，[run `-2` 的 validity-check README 记了这件事](../../../record/evidence/2026-09-22-formal-tenant-domain-2/organization-governance-v1-membership/validity-check/README.md#计数与上一次-run-略有出入输入却完全相同)。

**工具与环境**：两次相同——TLC2 2026.09.12.025210、Eclipse Adoptium 21.0.12.1、Alloy 6.2.0，4 workers；
精确版本、主机、时间戳与命令重建说明在
[run `-2` 的 README](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#工具与环境)。
**退出码不在 TLC 日志里**，由主线执行时记录。

**Alloy 为什么没有登记成 formal task**：不是检查器不支持 `kind: "alloy"`——它支持。
是 `alloy exec` **的退出码与断言结果无关**：把判环前置改坏之后
`AcceptPreservesAcyclic` 变成 SAT（找到了反例），它**仍然退出 0**；
而 `--formal run` 只看退出码，登记它会得到一个**永远通过的任务**。
[对比过程与闭合条件在 run README](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md#alloy-为什么仍然没有登记成任务)：
要登记它，先得有一个会因断言被违反而非零退出的 runner，那是 `tooling/` 的改动。
**run `-2` 没有出现任何改变这个判断的新情况。**

**这两次执行都不提升本契约的状态。**它仍是 `candidate`，未接受、未冻结。

## 结果与反例

### 已执行：Alloy 抓到 S-32 的判环漏掉自环（2026-09-22）

**这是本包的第一次执行记录，而且它的结论是一个反例。**
它**早于[上节那次运行](#实际执行)**，跑的是**改写之前**的模型。

- **执行对象**：当时的 [`Affiliation.als`](v1/formal/Affiliation.als)，四个命令全跑。
- **结果**：`AcceptPreservesAcyclic` **给出反例**。
  反例形态是 **`child = newParent`**：接受一份指向自己的隶属请求，
  写进去的是一条 `o → o` 的自环。
- **根因**（已用探针确认，不是猜测）：当时的判环前置写成
  「`child` 不在 `newParent` 的**上级链**上」，而[上级链按定义不含自己](v1/contract.md#s-12-上级链与有共同上级)——
  `child = newParent` 时这一条**恒真**，[S-32](v1/contract.md#s-32-接受隶属请求) 的三条前置全过。
  **这是契约的漏洞，不是模型的错**：模型忠实地表达了当时的契约，
  然后在给定规模内把那个契约漏洞找了出来。
- **处置**：[S-32](v1/contract.md#s-32-接受隶属请求) ④③ 改成两半
  （`newParent` 不是 `child` 自己，**且** `child` 不在 `newParent` 的上级链上），
  [S-30](v1/contract.md#s-30-发出隶属请求) 增加「指向自己 ⇒ `wouldFormACycle`」，
  模型里那一行改成 `child not in newParent.*(c.parent)`。
  **同时新增一个变异核对**：判环改回不含自身的写法时该 check 必须重新给出这个反例。
- **这次执行的结果对当前模型一条也不适用。**模型已改，**当时没有重跑**；
  改写后的模型跑过两次，都在[上节](#实际执行)——**以 run `-2` 为准**，
  它跑的是又加了 `acyclic[c]` 前件之后的版本。
  **不得**把这一次的「抓到反例」读成当前模型的状态，也不得把它的通过项读成现在的通过项。
- **它没有输入快照，因此不单独成为一次 run。**模型在反例之后立刻被改、改动未提交，
  当时跑的那份 `Affiliation.als` 已经不存在。
  [上节那次 run 的 README 里如实记了这一句](../../../record/evidence/2026-09-22-formal-tenant-domain/README.md#先前运行)，
  **没有用今天的文件补建一个 run 去冒充当时的输入**。
- **它的副产物已经清掉了。**当时 Alloy 以
  `spec/compositions/account-registration/v1/formal/` 为工作目录，
  在那里生成过 `Affiliation/` 与 `Affiliation_probe/` 两个目录——
  既不是这个 topic，也[不该在任何版本目录里](../../README.md)。
  那两个目录现已不存在；本次重跑的产物一律落在
  [`record/evidence/`](../../../record/evidence/README.md) 下。

### 尚无的记录

**形式工件之外，本包没有任何执行记录**，包括起草时的自检——本版**不附 Schema**，
因此连一次形状自检都没有做过，这里**如实写「未登记」**，不写「已通过」。

**八条规范场景一条都没演练过**，**本包的三个 Alloy 变异／非平凡核对一个都没做**
（就是[下节那三条成对报告义务](#三条成对报告的义务)点名的那三个）。
**「三个」是本包自己的数**——此前这里写过「十一个」，那是**租户相关领域五份契约的跨包总数**，
挂在本包名下会让读者以为本包欠着十一项；**跨包总数见[规格容器的当前状态](../../README.md#当前状态)**。
**本包另有一个 TLA+ 有效性核对**（`Membership_NoSerialization.cfg`），它**两次运行都做了**，
与这三个未做的不在一类，[不要合起来数](#三条成对报告的义务)。
下一次执行时按[实际执行](#实际执行)那张表的列补行：run id、任务或命令、配置与范围、
结果（含状态数与是否完整穷尽）、evidence 链接；
反例另记 trace 位置与它对应的契约条款，原始产物归
[record/evidence/](../../../record/evidence/README.md)。

记录时必须分开陈述：**模型检查的结果**、**规范场景演练的结果**、**真实组合的符合性**。
三者范围不同，不能互相冒充：[有限模型未找到反例只支持已建模且已执行的范围](../../README.md#按需展开形式化工件)，
运行时检查只支持实际观察到的关系。

### 三条成对报告的义务

1. **TLC 的两个配置必须一起报。**只报 `Serialized = TRUE` 通过，
   读者无从判断那条不变量是不是平凡的。
   **两次运行都是两条一起报的**，见[实际执行](#实际执行)——**这一条已经满足**。
2. **Alloy 的 `AcceptPreservesAcyclic` 必须连同两个非平凡核对一起报**（整行注释掉、改回不含自身）。
   只报「无反例」，读者无从判断是判环起了作用、还是规模太小碰不到环、
   **还是判环又漏掉了自环那一档**——最后这一种已经真的发生过一次。
   **这一条尚未满足**：两次运行都只报了 `UNSAT`，两个核对一次都没做。
3. **Alloy 的 `ShareAncestorIsSameAffiliationTree` 必须连同它的变异核对一起报**
   （把 `shareAncestor` 改回不含自身的读法，必须重新给出祖先—后代那个反例）。
   只报「无反例」，读者无从判断 `sameAffiliationTree` 是不是被写成了同一个式子——
   **那样它就是「X iff X」，永远无反例却什么也没检查**。
   **这一条同样尚未满足**，两次运行都没做。

## 独立评审

**v2 第一轮**：spec-reviewer（只读），2026-09-24，基线 HUB `765b01dc`（批 R3：v2 与 `data.asset-model`、`capability.asset-evaluation`、`capability.asset-governance`、`capability.asset-transfer` 同批）。
处置按主线的修复简报（2026-09-24，裁定 K37、K46——已收进 [D-060 §五](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)——与全局规矩 G1～G6）；**评审意见不代替接受**，v2 仍是 candidate。**v1 目录一个字节未动**。

| 发现 | 处置 | 落点 |
|---|---|---|
| OG-1（依据 rev 落后，未复核只是叙述） | **改**：PF-001 按 changelog 由 rev 15 复核到 17，相邻依据 PF-002 → 20、PF-003 → 5、PF-015 → 11、PF-007 → 18，逐条写出复核结论；只有 PF-003 rev 5 改了一处——第十二节「复制前提」一行按两条通则改写（给的面不变、仍够） | v3 抬头「设计依据」「相邻依据」「复核结论」、[第十二节](v3/contract.md#十二消费者核对) |
| OG-2（「v1 消费者用到的条款在本版逐字相同」不实） | **改**（K46）：抬头、第十三节、包入口的「逐字相同」都改掉；第十三节逐个 v1 消费者列出它消费的条款里哪些变了、属于哪种相容性（写集合多一项／返回多一项／`unavailable` 多一种触发）；写明同一提供者同时服务 v1、v2 消费者的规则（写按 v2、答按调用方钉的版本、存量记录无时刻时 v3 读面收 `unavailable` 不补值） | [v2 第十三节](v3/contract.md#十三版本差异与规范工件)、v2 抬头、[README](README.md) |
| OG-3（S-45 说消费者那一侧的交错「已由模型检查」过头） | **改**（K46）：收窄为「模型只在两条前提下检查 `NoRevival`，读序被建模方式吸收、证据是资产流转的场景 S-44」；本页 v3 S-42 那一行同改 | [v2 S-45](v3/contract.md#s-45-本版选用哪些形式工件) |
| OG-4（S-22 ② 残留「（超管）」） | **改**（K46）：删去，改为按 S-59 ② 授权；第十三节差异表加一行（表示：更正指路） | [v2 S-22](v3/contract.md#s-22-读组织) ② |
| OG-5（covers note 写「发布 v2」） | **改**：两条 note 改为「起草 v3 候选时登记」 | registry `covers.json` |
| AT-2（读 S-59 的调用主体与资产流转说法不一） | **改**（K37）：第十二节「不复活」一行写与资产流转 S-9 ② 同一句「运行时代行」；跨进程时 S-59 ② 要认那个服务身份，并进 [G-7](v3/contract.md#十一已知缺口) | [v2 第十二节](v3/contract.md#十二消费者核对)、G-7 |

**G2**：抬头的依据改引 D-060 §三 R2-1。**形式工件**：v2 不建自己的模型，本轮没有改任何模型或配置，**不重跑**；v1 的两次运行对 v3 的适用范围照旧（v2 S-45）。

**v2 第二轮**：spec-reviewer（只读），2026-09-25，基线 HUB `8ad37c50`（批 R3，发现表 `tmp/assets-runtimes/reviews/r2-R3.md`）；修复波 2 处置，主线裁定见 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)。**只动 v2；v1 目录一个字节未动。**

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| 建议（空表头） | 第十三节「对消费者的影响」下有一个空表头 `\| 消费者 \| 钉哪一版 \| 影响 \|` 加分隔行，GFM 会把紧跟的两段正文并进表 | **改**：删去空表头 | [v2 第十三节](v3/contract.md#对消费者的影响) |
| 建议（状态词） | 本页「变化的影响」写「已执行：**发布**候选 v2」，与 OG-5 同类 | **改**：「起草候选 v2」，并注明原写法 | 本页变化的影响 |
| 建议（S-42 缺代行一行） | K37 的「代行」与跨进程时 S-59 ② 要认服务身份只写在第十二节，而该节自称不新增承诺；S-42「调用方身份已经核实过」那一行只讲入口层 | **改**：S-42 表加「（v2）代行读两个时刻」一行，左列装配给（单机由运行时代行、做不到按读不到收），右列协议给并入 G-7；第十三节差异表 S-42 那一行同改 | [v2 S-42](v3/contract.md#s-42-装配给的保证-vs-协议须给的保证)；第十三节 |
| （OG-1～OG-5 核对） | 评审核为兑现 | 不改 | — |
| （应修 4 的另一端） | `capability.asset-transfer` 以本契约 `#S-42` 为依据却未登记 | 不改本契约：消费者那一侧补登（同一位起草者同轮落） | `registry/catalog.json` |

**形式工件**：没有模型或配置改动，**不重跑**。

### 实现映射反推（2026-09-25，节点独立评审 N2）

| 编号 | 发现 | 处置 | 落点 |
|---|---|---|---|
| OG-2（N2） | v3 S-42「代行读两个时刻」行的单机路径文字（运行时代行读 S-59／S-22）与节点实现路径（事务内直读，D-060 §八 N-19）不同；本版 `organizations-v2`／`memberships-v2` 无消费者 inject | 装配给列加半句「同一存储内一次可串行化读（含事务内直读）即满足，不要求经服务面代行」；接受口径不因无消费者而变（[D-060 §八 M59](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | [v2 S-42](v3/contract.md#s-42-装配给的保证-vs-协议须给的保证) |
| OG-1（N2） | S-42 末行「先后两次串行提交的时刻不相等」由时钟分辨率给，`infra/clock` 尚未兑现（C-15，[D-060 §八 M58](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)） | 契约不改，手段已选时钟；提供者侧登缺口 | [infra/clock](../../../realization/packages/infra/clock/design.md#实施缺口与消费者影响) |

## 变化的影响

- **已执行：独立评审第二轮的原地修订（v2）**（2026-09-25，[处置表](#独立评审)）。**v1 目录一个字节未动**。S-42 表多一行「代行读两个时刻」——**新增的是装配给／协议给的归属陈述，不是新语义**：同一句原本只在第十二节；第十三节差异表同步；删去一个空表头。**对消费者**：资产流转（钉 v2）从此能在 S-42 点到它依赖的那一行，并已把 `#S-42` 登进 catalog。**对证据**：无影响。

- **已执行：独立评审第一轮的原地修订（v2）**（2026-09-24，[处置表](#独立评审)）。**v1 目录一个字节未动**。
  **改了的**：v2 抬头（状态、依据改引 D-060、PF-001 与相邻依据复核到当前并写出结论、「逐字相同」改为逐项差异）；[S-22](v3/contract.md#s-22-读组织) ② 指路更正（这一处从此与 v1 不同文）；[S-45](v3/contract.md#s-45-本版选用哪些形式工件) 末行收窄；[G-7](v3/contract.md#十一已知缺口) 范围多一项；[第十二节](v3/contract.md#十二消费者核对)「复制前提」按 PF-003 rev 5 改写、「不复活」一行加调用主体一句；[第十三节](v3/contract.md#十三版本差异与规范工件)差异表加两行、「对消费者的影响」重写为逐个消费者的相容性表并加同一提供者服务两版的规则。
  **对证据的影响**：没有模型或配置改动，**没有要作废或重跑的**；v2 S-22、S-36、S-59 的演练义务按 v3 的返回形状与失败触发核（上文 v3 一节）。
  **对消费者**：钉 v1 的四份（注册组合、入口组合、资产治理、模型档案目录）不自动升；升时按第十三节那张表核。钉 v3 的资产流转与本版第十二节同句。
- **已执行：起草候选 v2（加法版）**（2026-09-24，主线裁定 R2-1，规格修订第二轮；「起草」原写作「发布」，2026-09-25 第二轮评审改——候选未发布）。新建 [`v3/contract.md`](v3/contract.md)：v1 全文复制后只加两个时刻、三个读面带出它们、[S-42](v3/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末行、第七节一行、[S-45](v3/contract.md#s-45-本版选用哪些形式工件) 一行与新场景 [S-61](v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出)；逐条见 [v2 §十三](v3/contract.md#十三版本差异与规范工件)。
  **v1 目录一个字节都没动**（`frozen.json` 的六项不变）；catalog 新登 v3 为 `candidate`，依赖三项与 v1 相同。**lineage 不登**：该清单只收旧谱系 → 当前谱系的重定基，同谱系内的版本关系记在 v3 §十三。
  **对证据的影响**：v1 的两次运行**原样有效**；v2 **沿用**它们，适用范围与前提写在[上文 v3 一节](#v2candidate2026-09-24的证据义务)——没有重跑、没有复制配置。新增一条场景义务（S-61），未开始。
- **已记录：`capability.account-identity` v2（`candidate`）限定了本契约两处的成立范围**（2026-09-23）。
  账号能力 v3 起 LoginStateId 不再是凭证，线上认人只凭出示物走 [AI v3 S-44](../account-identity/v2/contract.md#s-44-按出示物换取身份)
  （[AI v3 S-30](../account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)「只有 S-44 认出示物」一行）。据此，
  [S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 让 [S-36](v1/contract.md#s-36-当前租户身份查询)／[S-37](v1/contract.md#s-37-切换当前租户身份) 以「自己就带一道 S-17 校验」免于「调用方身份已经核实过」那一行的豁免，
  与 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 把「登录状态校验面」当作身份核实，**都只在进程内成立**，不再是跨进程核实的依据。
  **本契约 v1 已冻结，一个字不改**；条款语义不变（S-36／S-37 仍按 LoginStateId 校验有效性），措辞收口归本契约的下一版，与 D-023 点名的措辞项同批。
  **对实现者的约束**：只读本契约的实现者，**不得从线上收 LoginStateId 作认人依据**——交给 S-36／S-37 的 LoginStateId 须来自账号能力 v3 的 S-15、S-44、S-37 的结果或本契约以它为键的记录。
  **对证据的影响：无**——本契约已执行的只有形式模型检查，它们不涉及跨进程认人。
- **已执行：G-12 闭合（S-21 加可选创建键）**（2026-09-22，产品负责人选 (b)）。[S-21](v1/contract.md#s-21-创建团队组织) ① 加可选创建键、④ 键登记同提交、⑦ 幂等边界 (创建者 AccountId, 创建键)、⑧ 登记读不到 ⇒ `unavailable`／键不合形状 ⇒ `invalidInput`；[S-16](v1/contract.md#s-16-缺席时的默认答案) 表加一行（缺席 = 不去重）；保留期 `team_creation_key_retention` 为部署配置。**失败集合不变、不改任何其他操作、模型不涉及**。**新增一条证据义务**（[上表](#规范场景) S-21 行：五支 + 故障注入）。这是**语义改动**，候选版本原地改，不发新版本。
- **已执行：architecture-reviewer 批次评审的处置**（2026-09-22）。阻断 2（S-21 未知结果后重试的认回无拥有者）登记为 [G-12](v1/contract.md#十一已知缺口)，owner 入口层／apps 装配，闭合选项 (a) 入口层去重 / (b) S-21 加可选幂等键（语义改动）；非阻断 2（当前租户身份残留清扫）：[S-14](v1/contract.md#s-14-当前租户身份是登录状态上的一项选择) ⑤ 删「读到失效即删」（校验不过到不了记录，无执行点），登记 [G-13](v1/contract.md#十一已知缺口)。**不新增义务、不改任何操作**。
- **已执行：PF-001 升到 rev 15**（2026-09-22，
  [PF-001 changelog rev 15](../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)）。
  **rev 15 只改了 [flows §4 角色与操作](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作) 里成员名单那一行**——
  拆成「查看成员名单（有效成员）」与「查看已解除的成员」两行，后者**只归超级管理员**；
  表下把「看已解除的成员」并进管理类那一句，[acceptance §一](../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)／[§二](../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#二绝不能发生的事) 各补一条。其余各页一个字未动。
  它答的正是 [S-59](v1/contract.md#s-59-列出组织成员) 自己写下的那句「若产品认为已解除的只该给超管看，**那是一条新的产品规则**」。
  **形式工件一个字节都没动**：读面的授权不在 [`Membership.tla`](v1/formal/Membership.tla) 与
  [`Affiliation.als`](v1/formal/Affiliation.als) 的建模范围内（两个模型只管成员写入的交错与隶属链的结构），
  **不触发重跑**，[run `-2` 的全部结论在其原有范围内继续有效](#实际执行)。
  **改动仍直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。

  | rev 15 落在哪一条 | 复核结论 |
  |---|---|
  | [S-59 列出组织成员](v1/contract.md#s-59-列出组织成员) ①② | **改了。**①那个过滤开关**拆成两档分别授权**，并写明它**跨一道授权分界**；②由一句话改成按档判：**默认档（只要有效的）**＝该组织的有效成员、任一角色（不变）；**「连无效的一起要」**＝该组织的**超级管理员**，普通成员请求这一档 ⇒ `notAuthorized`。**失败集合不变、不新增失败值**——`notAuthorized` 本来就在⑥里 |
  | [S-59](v1/contract.md#s-59-列出组织成员) ⑤⑦⑧ | **措辞改了，承诺没扩。**⑤写明无效项**只在超管那一档出现**，普通成员拿到的列表里**不含无效项**（不是隐去字段）；⑦加一句**两档的返回值不得互相复用**；⑧加两句——两档的判定不可用**都**收 `unavailable`（超管那一档多判一次角色，角色读不到同样是 `unavailable`），以及**被拒的那一档不得静默降级成默认档返回**。③④⑥⑨不变 |
  | [S-59](v1/contract.md#s-59-列出组织成员) 条末那段「这是一次读法，不是一次放宽」 | **删了，换成「产品已定（PF-001 rev 15）」。**那段是本契约在产品没说时写下的自陈与预告，产品说了之后它就是过时的说法；换上的那段讲**为什么这个开关不是纯粹的取值过滤**——按旧读法实现，普通成员就能把这个组织解除过谁全部读出来 |
  | [S-16 缺席时的默认答案](v1/contract.md#s-16-缺席时的默认答案) 的默认值表 | **加了一句，判法没改。**[S-59](v1/contract.md#s-59-列出组织成员) 那一格补明它的两档**授权不同**，所以「缺席取默认」顺带决定了走哪一道授权；**「非身份参数有默认值、缺席取默认」这条判法一个字没改**，取完默认再按②判那一档 |
  | [S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) | **不受影响。**两条**整条**仍只归超管，rev 15 没有碰它们；只把②里那处产品依据的 rev 标注由 14 改到 15 |
  | [第十二节消费者核对](v1/contract.md#十二消费者核对) 里成员名单那一行 | **改了措辞**：授权由「rev 14 定的那一档」改为「**rev 15 定的那两档**」——有效成员那一份任一角色都能读，已解除的那些只归超管。够不够的结论不变 |
  | [缺口 G-11](v1/contract.md#十一已知缺口) | **不动。**它在 rev 14 已闭合，记的是当时的答复与落点，**不是现行条款**；rev 15 是那条规则之后补的一格，不重开已闭合的缺口 |
  | 其余条款 | **不受影响。**rev 15 没有动任何写操作、任何判定式、任何失败值；抬头设计依据里引的 `design.md` 各节与 flows 其余各节**原文逐字未变**，只把抬头的 rev 标注与 [S-12 判据那处的 `（rev 14）`](v1/contract.md#s-12-上级链与有共同上级) 一并改到 15（**该判据自 rev 12 定下后未再改动**） |

  **不新增独立的证据义务，但已有的那一条要加一支**：[三条读面的授权分档演练](#规范场景)
  由九次改为**十次**——多的那一次是**该组织的普通成员显式请求「连无效的一起要」，必须被 `notAuthorized` 拒**，
  且**演练前这个组织里要先有至少一位已被解除的成员**。
  **没有那位已解除的成员，这一支即使实现错了也返回同一份列表，什么都证明不了**；
  而一个把①当成纯取值过滤实现的版本，**前九次全对，第十次把已解除的成员交给了普通成员**。

- **已执行：能力拆分投票裁定落地（修正 2 部分）**（2026-09-22，依据
  [`record/proposals/tenant-capability-split/`](../../../record/proposals/tenant-capability-split/README.md#后续消费)
  的主线处置）。三票独立评审**全投维持五份拆分**，主线裁「A ＋ 修两处瑕疵」。
  **本轮只落地其中的修正 2（改写拆分理由），修正 1（当前租户身份的存与取移交）未落盘**，理由见下。
  **改动仍直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。
  **形式工件一个字节都没动**：[`Membership.tla`](v1/formal/Membership.tla)、它的两个 cfg 与
  [`Affiliation.als`](v1/formal/Affiliation.als) 建模的是**成员写入的交错**与**隶属链的结构**，
  **都不涉及当前租户身份，也不涉及拆分理由的措辞**（已逐文件核实：三个文件里没有任何
  tenant 选择／登录状态的状态变量或关系），**不触发重跑**，
  [run `-2` 的全部结论在其原有范围内继续有效](#实际执行)。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 末段「消费凭据校验会把整个组织治理重启一遍」** | **整段改写。**那句话在契约层不成立——本契约 inject 的是账号能力的读面，**那个提供者换代本来就会重跑本契约**，多消费或少消费它的一条操作不改变重启半径。改写为两半：① 不消费 [`#S-15`](../account-identity/v1/contract.md#s-15-验证凭据并签发登录状态) 的真正理由（没有共同的判定输入或不变量，登进清单会让「换掉它要不要重审本契约」得错答案，与排除 `data.identity-values/v1#S-13` 同一条规矩）；② 这条契约级边界实际买到的**四样**，逐样带落点坐标——反方向的半径收敛、契约层的失败隔离（[S-43](v1/contract.md#s-43-依赖的提供者不可用)／[`capability.account-identity/v1#S-28`](../account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)）、SYS-DEPLOY 的分布式缝已逐条标价（[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)／[`#S-30`](../account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)／[`composition.account-registration/v1#S-25`](../../compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证)）、账号身份非范围化（[`#S-12`](../account-identity/v1/contract.md#s-12-账号身份事实不是范围化对象)、SYS-TENANT） | **不新增证据义务，不改任何条款的承诺。**改的是一段设计理由的措辞，**没有动任何前置、失败集合、提交点或判定式**。**catalog 不变**：新引的那批坐标是**边界理由的依据**，不是本契约据以写出承诺、判定、映射或证据落点的条款，按[登记口径](../../README.md#当前状态)不登记为消费（正文已写明这一句） |
  | **[包入口](README.md)第三段同一句** | 同口径改写，并指向 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 末段 | 无 |

  **修正 1 随后由主线改判并落地（2026-09-22）**：不搬家，改为在 [S-14](v1/contract.md#s-14-当前租户身份是登录状态上的一项选择)
  增第 5 条——那项选择是本契约整体拥有的一条独立记录（存、取、写与生灭），以 `LoginStateId` 为键引用账号契约的登录状态记录；
  登录状态失效后不可达（S-36／S-37 先走校验），残留由本契约提供者清理（卫生工作，不进失败集合、无可观察结果）。
  S-36／S-37 与 `membershipNotEffective` 原样保留，catalog 不变；[包入口](README.md)同段把「两个读面」改准为六条。
  **不新增证据义务**——不可达已由 S-36／S-37 ⑧ 的故障注入行覆盖，清理是卫生工作不演练。
  **下面是当时未落盘的原方向记录，保留作推导痕迹：**
  **未落盘：修正 1 的原方向（「当前租户身份」的存与取移交 `capability.account-identity`）。**
  裁定方向是把 [S-14](v1/contract.md#s-14-当前租户身份是登录状态上的一项选择) 的存与取、
  [S-36](v1/contract.md#s-36-当前租户身份查询) 与 [S-37](v1/contract.md#s-37-切换当前租户身份)
  移到账号契约，本契约只留成员资格判定（[S-26](v1/contract.md#s-26-成员资格判定)）与层身份（[S-35](v1/contract.md#s-35-层身份)）。
  **落盘被一条硬约束挡住**：[S-36](v1/contract.md#s-36-当前租户身份查询) ④ 承诺的初值是
  `(该账号的个人组织, 该账号)`，而**个人组织的 `OrganizationId` 不透明、由存储在创建时生成、
  不可从 `AccountId` 派生**（[`data.identity-values/v1#S-3`](../../data/identity-values/v1/contract.md#s-3-organizationid)、
  [`#S-5`](../../data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)），
  它是本契约 [S-20](v1/contract.md#s-20-创建个人组织) 产生的事实。
  账号契约要算得出这个初值就必须消费本契约的读面，
  **那会把依赖方向从「治理 → 账号」翻过来**，直接违反本节开头那一句与
  [`capability.account-identity/v1#S-2`](../account-identity/v1/contract.md#s-2-消费者与依赖方向)。
  **因此本轮不动 [S-14](v1/contract.md#s-14-当前租户身份是登录状态上的一项选择)／[S-36](v1/contract.md#s-36-当前租户身份查询)／[S-37](v1/contract.md#s-37-切换当前租户身份)，
  操作数仍是 25，catalog 的 clauses 不变**；缺口与待裁项报回主线（见该提案的「仍未闭合的事项」）。

- **已执行：PF-001 升到 rev 14**（2026-09-22，
  [PF-001 changelog rev 14](../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)）。
  **rev 14 只改了 [flows §4 角色与操作](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#四角色与操作) 那张表**——
  补进「查看成员名单」「查看本组织发出的邀约」「查看本组织收到的隶属请求」三行，其余各页一个字未动。
  它答的正是本契约登记的[缺口 G-11](v1/contract.md#十一已知缺口)。
  **形式工件的语义一个字节都没动**：三条读面的授权不在 [`Membership.tla`](v1/formal/Membership.tla) 与
  [`Affiliation.als`](v1/formal/Affiliation.als) 的建模范围内（两个模型只管成员写入的交错与隶属链的结构），
  **不触发重跑**，[run `-2` 的全部结论在其原有范围内继续有效](#实际执行)
  （`Affiliation.als` **只改了一行 rev 注释**，见本条末尾）。
  **改动仍直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。

  | rev 14 落在哪一条 | 复核结论 |
  |---|---|
  | [S-59 列出组织成员](v1/contract.md#s-59-列出组织成员) ② | **改了。**由「该组织的超级管理员」**放宽为「该组织的有效成员，任一角色」**，并删去「待产品确认，见缺口 G-11」那句。**判的只有成员资格，不判角色。**①、③～⑨不变，**失败集合不变**（`notAuthorized` 仍在：非本组织的一律不给）。⑧那句「②自己那次成员资格判定不可用 ⇒ `unavailable`，不得收成 `notAuthorized`」**照旧成立**——②仍然是一次成员资格判定，只是不再附带角色条件 |
  | [S-58 列出组织发出的邀请与隶属请求](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) ② | **授权不变，标注改了。**仍是超级管理员；「待产品确认，见缺口 G-11」改为「**产品已定**（PF-001 rev 14 flows §4）」——**这一格此前是本契约在产品没说的地方取的一档，现在是产品裁的那一档**，两者恰好相同。失败集合不变 |
  | [S-60 列出组织收到的隶属请求](v1/contract.md#s-60-列出组织收到的隶属请求) ② | **同上。**授权仍是超管，标注由「待产品确认」改为「产品已定」；它原本给的那条理由（接受隶属请求本来就只有超管能做）**与产品答复一致**，保留 |
  | [缺口 G-11](v1/contract.md#十一已知缺口) | **闭合。**答复与三条的落点写进缺口表那一行，**编号保留不重排**（与 G-10 同一办法） |
  | [S-42 装配给的保证 vs 协议须给的保证](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 的读面表 | **不改。**那两行说的是「调用方身份这个值由谁保证为真」，与**用这个值做什么判定**无关；读面清单仍是 `S-22`／`S-26`／`S-27`／`S-34`／`S-35`／`S-55`～`S-60` 十一条，一条不增不减。末尾那句「『无授权前置』的读面不是『谁都能读』——[S-59](v1/contract.md#s-59-列出组织成员)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 有自己的 `notAuthorized`」**在放宽之后照样成立** |
  | [第十二节消费者核对](v1/contract.md#十二消费者核对) 里成员名单那一行 | **改了措辞**：消费者由「组织的超级管理员」改为「**组织里的任何一位有效成员**」，够不够的结论不变 |
  | 其余条款 | **不受影响。**rev 14 没有动任何写操作、任何判定式、任何失败值，也没有动 [flows §1.4](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#14-创建组织)～[§1.8](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#18-切换当前组织)、[§2](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)、[§3.3](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#33-成员关系) 与 `design.md` 的任何一节——抬头设计依据里引的那些**原文逐字未变** |

  **新增一条证据义务**：[三条读面的授权分档演练](#规范场景)（同组织超管／同组织普通成员／另一组织成员 × 三条 ＝ 九次同跑）。
  **它是这次放宽唯一看得出来的地方**——三条读面此前共用同一道授权，
  只跑超管那一行，放宽做没做、做没做过头，两种错都看不见。

  **抬头 rev 标注由 rev 13 改到 rev 14**，并加一条「rev 14 落下来的是三条读面的授权」；
  [S-12 判据那处的 `（rev 13）`](v1/contract.md#s-12-上级链与有共同上级) 同步改为 `rev 14`
  （**该判据自 rev 12 定下后未再改动**，改的只有 rev 标注）。
  [`Affiliation.als`](v1/formal/Affiliation.als) 的 `:73` 注释由「PF-001 §4（rev 13）的判据」改为 **rev 14**，
  **与评审轮二那次同一办法**：改的只有这一行注释，
  **模型语义与四条命令一字未动，因此不重跑**，[run `-2` 的四格结论继续有效](#实际执行)。

- **已执行：评审轮三修订**（2026-09-22）。轮三处置表对本契约裁定阻断 3 条、非阻断 8 条、产品格 1 条，
  另有四条从别的包点名落到本契约（过期语义侧 N-3、身份值侧 N-2、注册组合侧 B2）与三条跨包同改（撤销一次性、时间源不后退、`accountDoesNotExist` 归缺陷型）；
  **改动仍直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。
  **形式工件一个字节都没动**：[`Membership.tla`](v1/formal/Membership.tla)、两个 cfg、[`Affiliation.als`](v1/formal/Affiliation.als) 与 [formal 入口](v1/formal/README.md)本轮**都未修改**
  （第七节拆开的两条单向式本来就不在本包的模型里，formal 入口第一表已写明 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 不建模；
  `Affiliation.als` 与 formal 入口里提到的「缺口 G-5」指的是 shareAncestor 读法差异那条，**编号不变**），**不触发重跑**，
  [run `-2` 的全部结论在其原有范围内继续有效](#实际执行)。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **第七节的 ⇔ 与「恰有」拆成两条单向式**（阻断 A-1） | 「每个账号恰有一个个人组织」改为**至多一个**（[S-20](v1/contract.md#s-20-创建个人组织) 幂等边界 ＋ 一一约束），并写明「至少一个」在两个可达窗口里为假；「个人组织存在 ⇔ 账号记录存在」改为**「个人组织存在 ⇒ 对应的账号记录存在」**（保护点：清除链次序 ＋ 依据，与组合契约 [S-35](../../compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿) 同形）与**「已激活的账号 ⇒ 恰有一个个人组织」**（[S-20](v1/contract.md#s-20-创建个人组织) ④同提交 ＋ 激活侧前置，与组合契约 [S-13](../../compositions/account-registration/v1/contract.md#s-13-一个可用账号有且仅有一个个人组织) 同形）；[S-6](v1/contract.md#s-6-两个变体与四条结构性禁止)、[S-20](v1/contract.md#s-20-创建个人组织)、[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)、[S-45](v1/contract.md#s-45-本版选用哪些形式工件)、[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 里引这两句的地方同步；本页[形式工件表](#形式工件)的 S-53 行与 `accountDoesNotExist` 行改措辞 | **不新增义务，不改模型**。上一轮的两条量词写宽了：注册 ② 提交前与清除窗口里都存在「有账号记录、没有个人组织」的合法状态，⇔ 与「恰有」在那里为假 |
  | **[S-55](v1/contract.md#s-55-读邀请)（`tenant` 支）／[S-56](v1/contract.md#s-56-读隶属请求)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的⑧补「成员资格判定 `unavailable`」一路**（阻断 A-2） | 四处与 [S-59](v1/contract.md#s-59-列出组织成员) ⑧同形补一句：成员资格判定以 `unavailable` 失败 ⇒ 本操作 `unavailable`，**不得收成 `…DoesNotExist`／`notAuthorized`** | **[故障注入那一行](#规范场景)扩成两路**，(b) 路覆盖五条读面的授权判定 |
  | **撤销清除依据的「一次性」**（阻断 A-3，跨包同改 1） | [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ⑤改为「绑定该 `AccountId`、不可伪造、**本版不作废**」；绑定表删「一次尝试」与「一次性」两行，改为「作废：不作废」；「为什么一次尝试不能取成一次调用」「为什么它必须一次性」两段**整段删除**，改写为「为什么本版不作废」——依据断言的事实一经成立永远为真（个人组织只为未过期记录创建，过期单调，S-53 只对已过期成功），重放安全由 [`capability.account-identity/v1#S-38`](../account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 前置②③的现读承担 | **删一条义务**（「把已核实过的依据再交一次 ⇒ 被拒」那一行**不再登记**）。旧论证依赖「`AccountId` 被新注册重新用上」，而即便如此那条新记录未过期、`#S-38` ③ 就挡住它——一次性是没有收益的运行时状态，三份契约同口径撤销 |
  | **[S-16](v1/contract.md#s-16-缺席时的默认答案) 的默认值表补「邀请指定的角色」**（N-1） | 新增一行：[S-23](v1/contract.md#s-23-发出邀请) ①的指定角色缺省普通成员；「写操作里恰有这一个」改为不带计数，[S-23](v1/contract.md#s-23-发出邀请) ①的「唯一一个」同步 | **不新增义务**。[S-10](v1/contract.md#s-10-邀请) 早写着「缺省为普通成员」，表里漏了它，「恰有一个」当场为假 |
  | **[S-54](v1/contract.md#s-54-清除只对未激活账号成立) 的④改为构造态**（N-2） | 「④一个团队组织」改为「构造『由该 `AccountId` 定位到的组织不是个人组织』再调」，与⑦缺陷观测同形，并写明为什么正常输入表达不出它 | **义务不变，演练方式改**：本页[规范场景表](#规范场景)的④支同步 |
  | **[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 补 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的调用面行**（N-3） | 装配给 ＝ 只有清除链够得着它；协议给 ＝ 接收边界鉴别调用方并定义授权——与组合契约 [S-25](../../compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证) 同句 | **不新增义务**。[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ②的「调用面由装配限定（S-42）」此前在 S-42 无对应行 |
  | **缺口 G-5 一号两指**（N-4） | 已闭合的 catalog 那条改用 **G-10**（G-8、G-9 已删除不复用）；旧 G-5 归 shareAncestor 读法差异不变；[包入口](README.md)、[S-4](v1/contract.md#s-4-依赖方向与被消费的面)、缺口表与本页各处引用统一 | **不改变义务** |
  | **[S-59](v1/contract.md#s-59-列出组织成员) ⑤补「投影、不得作准入依据」**（N-5） | 带 [`data.identity-values/v1#S-10`](../../data/identity-values/v1/contract.md#s-10-membershipstanding) 坐标：名单上的角色与有效性是读取时点的投影，准入仍走 [S-26](v1/contract.md#s-26-成员资格判定) 现读 | **不新增义务** |
  | **裸 `#S-n` 补坐标**（N-6） | [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 注、[S-26](v1/contract.md#s-26-成员资格判定) 注、[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 正文里的 `#S-13`／`#S-33`／`#S-18`／`#S-38` 一律写全契约前缀 | **不改变义务** |
  | **超管不变量对 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 空真**（N-7） | 第七节首行前提列补一句：不变量量化在存在的组织上，被清除的组织不在量化域内 | **不改变义务，不改模型**（模型里没有删组织的动作） |
  | **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ③与②乙的次序**（N-8） | ③补：在②三步之后才判；②乙先浮出，账号读不到时不判③ | **不改变义务** |
  | **[S-32](v1/contract.md#s-32-接受隶属请求) ⑧补存在性读面**（过期语义侧 N-3） | 与 [S-25](v1/contract.md#s-25-接受邀请) ⑧同形：时间源或接收方组织存在性读面不可用（`data.offer-expiry/v1#S-16`／`#S-20`）⇒ `unavailable`，不得放行也不得判成已失效 | **并入[存在性读面那条注入义务](#规范场景)**（那一行已列 S-32） |
  | **[S-36](v1/contract.md#s-36-当前租户身份查询) ⑧补「那项选择读不到 ⇒ `unavailable`」**（身份值侧 N-2） | 不得收成④的初值——初值是「尚未切换过」这个已判出事实的答案，读不到没有这个事实 | **不新增独立义务**：它是 [S-52](v1/contract.md#s-52-成员资格不可用时明确失败) 同类的「读不到就当没有」，落在实现的一个 `catch` 里 |
  | **`accountDoesNotExist` 的「终止型」换词**（注册组合侧 B2，跨包同改 4） | [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 正文与本页轮一记录改为「缺陷观测支（不删组织、不产依据、须报出）」；三分类词归组合契约 [S-34](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)，本契约不自立分类 | **不改变义务**。「终止型」在组合契约里是另一类（`accountIsActivated` 等成立的结论），借词撞名 |
  | **进展性质的时间源前提改坐标**（跨包同改 3） | 「时间源可用且单调（`#S-16`）」改指 [`data.offer-expiry/v1#S-17` 的「`now` 不后退」行](../../data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证)——S-16 从未承诺单调 | **不改变义务** |
  | **新登记[缺口 G-11](v1/contract.md#十一已知缺口)**（产品格 O-1） | 普通成员能否查看本组织成员名单与本组织发出的邀约，flows §4 无此行；owner PF-001 产品负责人；[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的②维持超管并标注「待产品确认」 | **不改变义务**。产品答复若放宽，三条的授权前置改、失败集合不变 |

- **已执行：评审轮二修订**（2026-09-22）。同一位 spec-reviewer 复评，对本契约提出**新阻断 5 条、非阻断 11 条**，
  另有三条从别的包点名落到本契约（过期语义侧两条、注册组合侧一条）；
  主线逐条裁定处置，**改动仍直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。
  **形式工件一个字节都没动**：本轮改的全是操作的输入、返回、失败集合与求值次序，
  [`Membership.tla`](v1/formal/Membership.tla)、两个 cfg 与 [`Affiliation.als`](v1/formal/Affiliation.als) 的**模型语义不受影响**，
  [run `-2` 的全部结论在其原有范围内继续有效](#实际执行)。
  （`Affiliation.als` **只改了一行注释**里的 rev 标注，见本节末；**不触发重跑**。）

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **[S-26](v1/contract.md#s-26-成员资格判定) 的返回值写成一个闭合和**（阻断 1） | 返回 ＝ `invalidInput \| MembershipStandingResult`；⑥改写成「`invalidInput`；以及 `MembershipStandingResult` 的失败支 `failure = unavailable`」；**`MembershipStandingResult` 仍恰两支，形状归 [`data.identity-values/v1#S-10`](../../data/identity-values/v1/contract.md#s-10-membershipstanding)，本契约引用不自定义**；并写明三样一律由返回值承载 | **新增一条义务**（返回类型的静态检查 ＋ 三种情形各调一次）。**上一轮这里写错了**：把 `invalidInput` 说成 `MembershipStandingResult` 的失败支之一，而那个类型是**判定结果**的类型，[表示层拒绝按 `#S-33` 不是判定结果](../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) |
  | **`alreadyConcluded` 的定义改写，本契约是它的权威**（阻断 2） | [S-24](v1/contract.md#s-24-撤回邀请) 给出定义：**存在一条本操作不会再写的终结记录（即 `accepted`），或已按 `data.offer-expiry/v1#S-8` 过期**；**`withdrawn` 明确不在其内**，再撤回一份已 `withdrawn` 的是**幂等重入 ⇒ `ok`**；[S-31](v1/contract.md#s-31-撤回隶属请求) ⑦引同一定义。**[过期语义那一侧不再自写定义](../../data/offer-expiry/v1/contract.md#s-8-判定式)**，只保留「已过期 ⇒ 不得写终结记录」那条禁止 | **新增一条义务**（撤回四支同跑）。**上一轮两处各写一份定义**，写法是「终结记录存在或已过期」——它把 `withdrawn` 括了进来，**与⑦的幂等承诺当场矛盾** |
  | **[S-57](v1/contract.md#s-57-列出账号收到的待接受邀请) 的授权与过滤**（阻断 4 ＋ 范围外 1） | ②改成[与 S-27 同一写法](v1/contract.md#s-27-我的租户)：**无授权前置**，输入的 `AccountId` 即调用者本人，身份由入口层核实（[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）；①加一个**可选过滤开关**，**默认只要 `pending` 的**，与 [S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-59](v1/contract.md#s-59-列出组织成员)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 同形；[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 补上它缺的默认 | **新增一条义务**（四条读面各跑两路）。**②此前写着「本人：调用方就是这个账号」却没有任何输入表达「调用方」**，既给不出授权判定，也列不出失败值——它是一句写不成条款的话 |
  | **[S-55](v1/contract.md#s-55-读邀请) ① 的调用方身份加判别式**（非阻断 13） | 由无判别式的「`AccountId` 或 `TenantId`」改为**带判别式的两支**（`account`／`tenant`），**集合外一律 `invalidInput`**（`data.identity-values/v1#S-32`）；②与①的两支一一对应 | **并入[判别式那条义务](#规范场景)，多一支**。无判别式的联合只能靠「哪个字段有值」去猜，而**两个都给或都不给时猜不出**，猜错一次就是把另一类人的授权判定用在这个调用方身上 |
  | **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的求值次序与 `accountDoesNotExist` 的触发条件**（注册组合侧阻断 2） | ②写成固定三步：**表示层 → 读账号 → 读组织**；**账号读不到时不立即失败**，再看组织——**组织也不在 ⇒ `ok` 并返回依据**（②乙、⑦乙），**组织仍在 ⇒ `accountDoesNotExist`**（缺陷观测，不删、不产依据、必须可观测）；⑦的幂等拆成甲乙两路，「组织没了不等于那个账号此刻还该被清」那句**限定为只对甲成立**；⑧写明 `account-not-found`（结论）与 `storage-unavailable`（没有结论）**不可互相折叠** | **[S-54](v1/contract.md#s-54-清除只对未激活账号成立) 由六支增到八支**（加「账号也已不在的幂等」与「缺陷观测」两支），**且这两支须挨着跑**。**这修的是一条真的会卡住的路**：清除链两步都做完之后重扫，上一轮的写法会给 `accountDoesNotExist`，[而那条链必须能安全重扫](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除) |
  | **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ⑤ 的清除依据写死绑定与一次性**（非阻断 14） | ⑤补：绑定**该 `AccountId` 与本次这一趟清除链执行**、**一次性**（被 `capability.account-identity/v1#S-38` 核实之后即作废，重扫须重新调本操作取得）；并写明「一次尝试」为什么取「一次清除链执行」而不是「本操作的一次调用」 | **新增一条义务**（把已核实过的依据再交一次 ⇒ 必须被拒）。**[`data.identity-values/v1#S-35` 的性质 4 此前在本契约没有落点](../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)**：那里要求每个实例写死「一次尝试指什么」，而本契约只写了「绑定 AccountId」 |
  | **[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的登录状态校验面由三出口改为四出口**（非阻断 10） | 补 `invalid-input` 的映射行 ⇒ `invalidInput`，并写明**这一支在本契约里到不了**、它靠的前提是**两侧词法约束同源**（`data.identity-values/v1#S-31`），前提一旦不成立它立刻可达 | **不新增可跑的义务，补的是一处漏掉的出口**。`capability.account-identity/v1#S-17` 的失败集合**恰为三个**，上一轮只映射了两个 |
  | **[S-25](v1/contract.md#s-25-接受邀请) ② 的理由改写成「本版到不了的观测点」**（非阻断 9） | 前置与两个失败值**不动**；理由由「那期间账号可以被清除」改写为：**本版没有任何路径能让已激活账号消失**（`capability.account-identity/v1#S-38` 只对未激活且已过期的记录成立，[已激活不回退不消失](../../capabilities/account-identity/v1/contract.md#s-20-已激活不回退不消失)），因此这两支**判不出真**；保留的三条理由逐条写出 | **不改变义务**，[那条演练照旧](#规范场景)。**上一轮给的理由不成立**：它描述的交错在本版不可达，而一条站不住的理由会让下一个读者以为这个前置可以删 |
  | **[S-16](v1/contract.md#s-16-缺席时的默认答案) 的「恰有一个非身份参数带默认值」改成一张表**（非阻断 6） | 拆成两类：**写操作里恰有一个**（邀约时长，默认值来自部署配置）；**读面的过滤开关各有默认**（四条，默认写死在条款里，没有可配之处） | **不新增义务**。补完 [S-57](v1/contract.md#s-57-列出账号收到的待接受邀请)／[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 的默认之后，「恰有一个」这句话当场变假 |
  | **[S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求)／[S-55](v1/contract.md#s-55-读邀请)～[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 的⑧补存在性读面**（过期语义侧非阻断 4） | 各⑧补「[组织存在性读面](v1/contract.md#s-22-读组织)不可用 ⇒ `unavailable`」，并写明**绝不得据此判成「组织不存在 ⇒ 已过期」** | **新增一条故障注入义务**（九处一起注）。[那条规矩此前只在接受路径上有落点](../../data/offer-expiry/v1/contract.md#s-20-不可用--不存在)（[S-25](v1/contract.md#s-25-接受邀请)／[S-32](v1/contract.md#s-32-接受隶属请求) 的⑧），撤回与读面上**无处可落** |
  | **[S-55](v1/contract.md#s-55-读邀请) 的「唯一一处」删掉**（非阻断 8） | 改为「**按不透明标识定位的四条操作一致如此**」（[S-24](v1/contract.md#s-24-撤回邀请)、[S-31](v1/contract.md#s-31-撤回隶属请求)、[S-55](v1/contract.md#s-55-读邀请)、[S-56](v1/contract.md#s-56-读隶属请求)），并写明按组织定位的三条**不在其内**、它们给 `notAuthorized` | **不改变义务**，修正的是一句与 [S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求)／[S-56](v1/contract.md#s-56-读隶属请求) 直接相抵的话 |
  | **[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 的读面行补 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求)，并写明 [S-36](v1/contract.md#s-36-当前租户身份查询)／[S-37](v1/contract.md#s-37-切换当前租户身份) 有意不列**（非阻断 11） | 读面行改为 `S-55`～`S-60` 共**十一条**；新增一段说明：那两条**自带登录状态校验**，是那道核实的一部分，**列进去会让这张表自指** | **不新增义务**，补的是一条漏掉的读面与一处会被读成疏忽的有意省略 |
  | **两处「两个指向组织」改为接收方单数**（过期语义侧阻断 3） | [S-11](v1/contract.md#s-11-隶属请求) 的宿主引注与[缺口 G-4](v1/contract.md#十一已知缺口) 都改为「按**接收方组织这一个**指向对象判过期」，并写明**「判定对象是单数」与「宿主未裁」是两件事**：前者[产品正文已经定了](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)，未裁的只有后者 | **不改变义务**。[S-11](v1/contract.md#s-11-隶属请求) 正文与 [S-56](v1/contract.md#s-56-读隶属请求)／[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 早已是单数写法，**这两处是上一轮漏改的残留**，且它们被拿来论证 G-4 不阻断，留着会把一处笔误写成论据 |
  | **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) ③ 的链接改指第七节**（非阻断 16） | 「空真的守卫」原链接指向[已知缺口](v1/contract.md#十一已知缺口)，改指[第七节不变量表](v1/contract.md#不变量)——**「由 `AccountId` 定位必得个人组织」的依据是那条不变量，不是任何缺口** | **不改变义务** |
  | **[缺口 G-10](v1/contract.md#十一已知缺口)（当时编号 G-5）的「23 条」改准**（非阻断 15） | 改为 **27 条**并列出号段（`S-1`、`S-3`～`S-12`、`S-14`～`S-19`、`S-26`～`S-35`），与[包入口](README.md)和 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的表一致 | **不改变义务**。三处此前是 27／27／23，**catalog 按那张表登记，数不一致会让核对无从下手** |
  | **verification 的「十一个变异」改准**（run `-2` 落盘者发现） | 本页三处改为「**本包三个 Alloy 变异／非平凡核对**」，并写明十一个是**跨包总数**、见[规格容器的当前状态](../../README.md#当前状态)；另点出本包的 TLA+ 有效性核对**两次都做了**，不与这三个合起来数 | **不改变义务**，改的是一个挂错名下的数 |

  **rev 标注同步**（逐条复核见下一条）：PF-001 由 rev 12 改到 **rev 13**，
  **抬头三处「正文落盘中」全部删掉**（[S-23](v1/contract.md#s-23-发出邀请) ②的笔误裁决、
  [S-7](v1/contract.md#s-7-上级组织属性) 的「创建时可指定」删除、
  [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的产品依据）——**正文已落盘，那三条不再是「已裁未落」**；
  PF-002 由 rev 8 改到 **rev 9**；[`Affiliation.als`](v1/formal/Affiliation.als) 的 `:73` 注释
  由「PF-001 §4（rev 12）的判据」改为 **rev 13**。
  **`Affiliation.als` 改的只有这一行注释，模型语义与四条命令一字未动，因此不重跑**；
  [run `-2` 的四格结论继续有效](#实际执行)。

- **已执行：PF-001 升到 rev 13、PF-002 升到 rev 9 的复核**（2026-09-22，
  [PF-001 changelog rev 13](../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)、
  [PF-002 changelog rev 9](../../../product/PF-002-assets-settings-and-permissions/changelog.md)）。
  **rev 13 的「下游要复核什么」直接点了本契约三条**，逐条复核如下——

  | rev 13 点的是什么 | 复核结论 |
  |---|---|
  | ① [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的**产品依据现在落在 rev 13 §4**（「个人组织与第一个租户随记录一起消失」） | **成立，本契约已经是那句话的落点。**改的只有抬头那条「正文落盘中」的措辞与 rev 标注；[本操作的产品依据一节](v1/contract.md#本操作的产品依据)原文不变。**这一条此前不登记缺口，现在更不必登记** |
  | ② 凡把**邀请、角色调整、隶属建立/解除**的授权前提写成「有管理资格的成员」的，**一律收成超管** | **本契约四处全部已是超管**：[S-23](v1/contract.md#s-23-发出邀请) ②、[S-28](v1/contract.md#s-28-调整角色) ②、[S-30](v1/contract.md#s-30-发出隶属请求) ②、[S-32](v1/contract.md#s-32-接受隶属请求) ②、[S-33](v1/contract.md#s-33-解除隶属) ②。**全文检索「管理资格」只出现在 [S-23](v1/contract.md#s-23-发出邀请) 下面那段解释里**，讲的正是这处笔误已被裁掉。**无需改动** |
  | ③ 组织创建那条链**不接受「上级组织」作为入参** | **成立。**[S-20](v1/contract.md#s-20-创建个人组织) ①只收 `AccountId`、[S-21](v1/contract.md#s-21-创建团队组织) ①只收创建者 `AccountId`，两条的④都写着「上级为空」；[S-5](v1/contract.md#s-5-组织) 的属性表「何时确定」一格写的是「创建时为空」。**上级组织属性[只有两条写路径](v1/contract.md#s-7-上级组织属性)，都不在创建链上** |
  | **校准：「组织没有终结路径」收窄为「团队组织」** | **成立。**[S-5](v1/contract.md#s-5-组织)、[S-11](v1/contract.md#s-11-隶属请求) 与[缺口 G-2](v1/contract.md#十一已知缺口) 都已是收窄后的写法，并给出那条结构性理由（个人组织既发不出邀请也不参与隶属关系，**没有任何邀约指向它**）。**[G-2 仍然开着](v1/contract.md#十一已知缺口)**，[S-46](v1/contract.md#s-46-邀约的三种收场) 的覆盖范围不变 |
  | **校准：[flows §2](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)「已过留存期限」那一行的措辞** | **不落在本契约的条款上。**那一行讲的是**注册入口**遇到已过期记录时怎么办，归[注册组合契约](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)；本契约只提供 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 那一步，**它的两条前置与新措辞一致**（记录已过期才清、连同个人空间一起清） |

  **PF-002 rev 9** 把组织层资产管理动作的资格从「管理资格」收成超级管理员，
  **与 rev 13 是同一条裁决的传播**。本契约引 PF-002 的只有[抬头「相邻依据」那一行的 §5.2](v1/contract.md)，
  而 **rev 9 只动了 flows §1.1 与 §3.1 两处，§5.2 不受影响**；
  [消费者核对表里 PF-002 那一行](v1/contract.md#十二消费者核对) 要的仍是
  [S-26](v1/contract.md#s-26-成员资格判定) ＋ [S-35](v1/contract.md#s-35-层身份) 两个面，**一个字不用改**。
  **PF-002 rev 10**（2026-09-22，工作区重定义为租户持有的一级归属、由目录承载、opt-in）同样**不动 §5.2**；
  本契约 [S-35](v1/contract.md#s-35-层身份) 那句「工作区不在其列」在新定义下照旧成立（它仍不是一重身份）。**无需改动。**
  **因此只改 rev 标注**：`rev 8` → `rev 9`。

  **本契约语义不因这两次升 rev 改变，不需要新版本**；已有证据（两次 run 的全部结论）不受影响。
- **已执行：评审轮一修订**（2026-09-22）。一位 spec-reviewer 对本契约提出阻断 10 条、非阻断 14 条，
  主线逐条裁定处置，**改动直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，未接受、未冻结。

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **补了六个读面**（[S-55](v1/contract.md#s-55-读邀请)～[S-60](v1/contract.md#s-60-列出组织收到的隶属请求)） | 读邀请、读隶属请求（各按标识）、列出账号收到的待接受邀请（本人）、列出组织发出的邀约（超管）、列出组织成员（超管，返回 `TenantId` ＋ 角色 ＋ 效力）、**列出组织收到的隶属请求（超管）**。各写全九件事，返回的派生状态含 `expired`，按 `data.offer-expiry/v1#S-9` 读时求值 | **新增五条义务**（读时派生、不泄漏存在性、列表不残缺、**隶属请求的发现路径**、`invalidInput` 全覆盖）。**这补的是真空洞**：`data.offer-expiry/v1#S-9` 此前在本契约**没有落点**，[S-3](v1/contract.md#s-3-本契约明确不承诺什么) 说的「对方查询得到它」**没有面**，[S-22](v1/contract.md#s-22-读组织) 把读者指向的 [S-26](v1/contract.md#s-26-成员资格判定) **列不出名单** |
  | **[S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 单独说**：它补的是隶属请求**唯一的发现路径** | 在它之前，一份隶属请求发出去之后接收方**在系统内无从得知它存在**——`AffiliationRequestId` 不透明猜不出（`data.identity-values/v1#S-31`）、[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) 只列自己发出的、[S-30](v1/contract.md#s-30-发出隶属请求) ⑨不发任何事件。[S-58](v1/contract.md#s-58-列出组织发出的邀请与隶属请求) ⑤那句「本版不给」删掉改指 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求)；[S-30](v1/contract.md#s-30-发出隶属请求) ⑨仍「不发」，补一句「接收方靠 [S-60](v1/contract.md#s-60-列出组织收到的隶属请求) 发现」 | **新增一条跨操作义务**（发→列→接受全程不带外传标识）。**有意不加事件**：[送达面是读面不是事件](v1/contract.md#s-40-事件都是通知)，把「对方得知道」挂在可能漏发的通知上，漏一次就留下一份没人看得见的请求。**这修的是一条走不通的产品流程**——[flows §1.7](../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#17-建立与解除组织隶属) 的「对方组织的超管接受」此前在契约里等不到可接受的那一刻 |
  | **表示层拒绝值 `invalidInput`** | 进**每一个**操作的失败集合（[S-16](v1/contract.md#s-16-缺席时的默认答案) 新增一节，口径取 `data.identity-values/v1#S-33`）；[S-35](v1/contract.md#s-35-层身份) 的 `unavailable` **删掉**——它是纯计算，永远有结论 | **新增两条义务**（25 个操作各跑一次；[S-35](v1/contract.md#s-35-层身份) 的失败集合恰一个值）。**此前输入缺席／非法在本契约没有落点**，只能被实现折进 `unavailable` 或某个 `…DoesNotExist` |
  | **[S-20](v1/contract.md#s-20-创建个人组织) 的 ②⑥⑦ 三处冲突取 ⑦** | ②删掉「尚无个人组织」这条前置，⑥删掉 `personalOrganizationAlreadyExists`，⑦的幂等成为唯一口径 | **新增一条义务**（连调两次都得 `ok` 与同一个 `OrganizationId`）。**组合契约那一侧同步**：[注册主链第 2 步](../../compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接)的重跑此后不会撞上一个失败值 |
  | **[S-25](v1/contract.md#s-25-接受邀请) 补「接受者账号已激活」** | ②补前置，⑥补 `accountNotActivated`／`accountDoesNotExist`，⑦的重复接受改为**直接引** `data.offer-expiry/v1#S-13`（`accepted` 是第三条来路），**不再借用 `alreadyConcluded` 的语义** | **新增一条义务**。**这是一处真漏**：发出时判过一次，但发出与接受之间账号可以被 `capability.account-identity/v1#S-38` 清除 |
  | **[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 五处** | 输入**只收 `AccountId`**（原来还收 `OrganizationId`，而幂等那一路取不到账号）；④补**受 [S-17](v1/contract.md#s-17-同一组织的成员写入序列化) 序列化**；⑥补 `accountDoesNotExist`（**缺陷观测支：不删组织、不产依据、须报出**；分类词归 [`composition.account-registration/v1#S-34`](../../compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)，评审轮三换词）与 `invalidInput`，恰六个；⑤的清除依据改为**引用 [`data.identity-values/v1#S-35` 交接凭证](../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)**；⑨写明**有意不发 `membership.changed`** | **新增一条义务**（`accountDoesNotExist` 那一支）。[S-54](v1/contract.md#s-54-清除只对未激活账号成立) 的六支**不变**。**「依据不可伪造」此后是身份值契约的承诺**，不是本契约自造的一个说法——没有它，[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) → `#S-38` 的次序守卫是空的 |
  | **调用方身份由谁核实**（[S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 末两行） | 补「调用方身份已由入口层核实」＝**装配给**，跨进程须携带授权依据并在接收边界重验（`data.identity-values/v1#S-30`）＝**协议给**；读面同标注 | **不新增可跑的义务，新增一条[由别处承担](#由别处承担本契约只写明要求的)**。**代价写明了**：本契约的授权判定全部以「身份值是真的」为前提，**它的面不得被直接暴露成终端 API** |
  | **`alreadyConcluded` 的定义扩写** | [S-24](v1/contract.md#s-24-撤回邀请)／[S-31](v1/contract.md#s-31-撤回隶属请求)：终结记录存在**或已过期**；④补「提交内先现读一次过期判定」 | **新增一条义务**（撤回一份已过期的，**须核对存储里没有多出记录**）。依据是 `data.offer-expiry` 本轮新增的 [S-8 反方向](../../data/offer-expiry/v1/contract.md#s-8-判定式) |
  | **两处改名与一处必发** | `targetIsNotTeamOrganization` → **`issuerIsPersonalOrganization`**（原名说的是「目标不是团队组织」，而判的是**发起方**是不是个人组织，[S-23](v1/contract.md#s-23-发出邀请) ③读的是发起者 `TenantId` 的组织）；`invitation.issued` 由「可选」改为**必发** | 改名**不新增义务**，但 [S-51](v1/contract.md#s-51-个人组织里没有这个动作) 的演练须核对新名字。必发**新增一条义务**——**一个可选的事件连断言都写不出来** |
  | **[S-27](v1/contract.md#s-27-我的租户) ⑧收窄 ＋ 不变量拆成单向式** | ⑧从「不得返回空列表」改为「**读不到**不得返回空列表」，并列出三种输入各自的答案；性质表把「每个账号至少有一个有效租户」拆成**已激活方向**的单向式，另注明「每个账号恰有一个个人组织」**在清除窗口里是空真的** | **不新增义务，修正的是一条在清除窗口里为假的断言**。与 `composition.account-registration` v1 的 [S-13](../../compositions/account-registration/v1/contract.md#s-13-一个可用账号有且仅有一个个人组织)／[S-35](../../compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿) 同形——那两条本来就是拆开的两条单向式 |
  | **消费清单补齐**（[S-4](v1/contract.md#s-4-依赖方向与被消费的面)） | 新增身份值侧的被消费面表，逐条给号 **27 条**（`S-1`、`S-3`～`S-12`、`S-14`～`S-19`、`S-26`～`S-35`）。**`S-13` 有意排除**：它的消费者是 PF-003 的资产契约，本契约只在消费者核对表里**提到**它，**提到不是消费**——登进去会让「换掉 `#S-13` 要不要重审本契约」得到错误答案。**`S-7`／`S-28`／`S-32`／`S-34` 是本轮补上的**（记录键的序列化形式、切换不回头改已捕获的值、判别式集合封闭、语义身份不是实现地址）；过期语义侧补 `#S-19`；[S-12](v1/contract.md#s-12-上级链与有共同上级) 改为**带坐标引用** `data.identity-values/v1#S-14`／`#S-15`，函数名统一 `ancestorChain`；[S-30](v1/contract.md#s-30-发出隶属请求) 的「按分量判定」改为 `#S-31` 逐码点相等 | **catalog 的 `clauses` 须按那张表更新**（registry 一侧的动作）。[缺口 G-10](v1/contract.md#十一已知缺口)（当时编号 G-5）的后半就此闭合 |

  **另有三处依据落在 PF-001 rev 13**（**当时产品负责人已裁、正文尚未落盘**；
  rev 13 已于评审轮二落盘并对齐，见本节第一条。**均不登记缺口**）：
  [S-23](v1/contract.md#s-23-发出邀请) ②的「管理资格」是笔误、本版即超级管理员；
  [S-7](v1/contract.md#s-7-上级组织属性) 的「创建时可指定上级」由产品删掉、上级创建时一律为空；
  [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的产品依据改指 rev 13 §4「个人组织与第一个租户身份随之消失」那一句。
  **rev 13 落盘后本契约把 rev 标注与锚点对齐**，语义不变、不出新版本。

  **语义确有变化**（新增五个操作、多处失败集合增删、[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 的输入收窄），
  **但本契约未发布，因此改在 v1 原地**；[不可原地覆盖的是已发布规格](../../README.md)。
- **已执行：Alloy 模型改动**（2026-09-22，评审轮一）。两处：
  `Affiliation.als` 的抬头注释补上 `data.identity-values/v1#S-14`／`#S-15` 的**精确坐标**
  （两个谓词的定义式归那份契约，本契约与模型都是引用）；
  **`run aNonTrivialTree` 的 pred 加了 `acyclic[c]` 前件**。

  > **模型已改，[上次那轮 Alloy 执行的结果不再适用](#实际执行)。**
  > `aNonTrivialTree` 的 pred 变了，它那次的 SAT 与实例**直接作废**；
  > 三条 `check` 的断言式未变，但**证据未绑定冻结 hash、模型文件已改**，
  > 按本页的口径**一律须重跑**。
  >
  > **已于 run `-2` 全部重跑**（[结果](#实际执行)）：三条 `check` 仍 `UNSAT`，
  > `aNonTrivialTree` 这次给出的是 `O3→O2→O0→O1` 一条**无环链**，
  > 而上一次那个实例含环 `O0→O1→O2→O0`——**加前件要挡的正是它**。
  > 因此三条 check 的「无反例」现在**在 `acyclic[c]` 前件下有了一个见证**；
  > **但这仍不是「断言非平凡」**，那要靠三个变异核对。
  > **[三条成对报告的义务](#三条成对报告的义务)不因这次重跑减少**，
  > **本包那三个 Alloy 变异／非平凡核对仍然一个都没做**。
- **已执行：PF-001 升到 rev 12、PF-003 的标注对齐到 rev 4**（2026-09-22，
  [PF-001 changelog](../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)）。
  **本轮改动直接落在 v1 上，不发布第二个版本**——本契约仍是 `candidate`，
  未接受、未冻结，[不可原地覆盖的是已发布规格](../../README.md)。
  （**catalog 已于当日晚些时候登记**，状态仍是 `candidate`；**登记不是发布**，
  资源未进 `frozen.json`，因此这句推理不受影响。）
  四处改动：

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **「有共同上级」的判据**（rev 12 校准） | [S-12](v1/contract.md#s-12-上级链与有共同上级) 改为「把各自算进自己的上级链之后两条链有交集」，并写明它**就是**「同一棵隶属树」；[S-34](v1/contract.md#s-34-上级链与有共同上级) 的读面同步，并明写**消费者不得自己从上级链求交**；[S-12](v1/contract.md#s-12-上级链与有共同上级)「个人组织恒假」补上「与它不同」这个限定 | **Alloy 的 `ShareAncestorIsSameAffiliationTree` 从「预期反例」翻成「预期无反例」**，`PersonalOrganizationSharesNoAncestor` 的断言加 `disj`。**此前那次执行的结果对这两条全部作废。**`sameAffiliationTree` 改为按「根相同」独立写，并**新增第三个变异核对**，否则断言会退化成「X iff X」 |
  | **S-32 判环漏掉自环**（Alloy 抓到，见[上节](#已执行alloy-抓到-s-32-的判环漏掉自环2026-09-22)） | [S-32](v1/contract.md#s-32-接受隶属请求) ④③ 改成两半；[S-30](v1/contract.md#s-30-发出隶属请求) 增加「指向自己 ⇒ `wouldFormACycle`」，**不另立失败值** | **Alloy 那次执行的反例是这条改动的依据**，改后**未重跑**。**新增一个变异核对**（判环改回不含自身必须重新出反例）。[S-30](v1/contract.md#s-30-发出隶属请求) 的新失败值须演练，见上表 |
  | **邀约时长的表示层校验** | [S-23](v1/contract.md#s-23-发出邀请)／[S-30](v1/contract.md#s-30-发出隶属请求) 的失败集合各加一个 `invalidOfferDuration`，口径取 `data.identity-values/v1#S-33` | **新增一条义务**（两路对比的演练）。**判定式仍整块归 `data.offer-expiry` v1，那一侧的证据不受影响**——非法时长在进入判定之前就被拒了 |
  | **个人组织有了唯一的销毁路径** | 新增操作 [S-53](v1/contract.md#s-53-清除未激活账号的个人组织)；[S-5](v1/contract.md#s-5-组织)「组织没有终结路径」收窄；[S-6](v1/contract.md#s-6-两个变体与四条结构性禁止) 补一条例外说明；[S-22](v1/contract.md#s-22-读组织) 的 `organizationDoesNotExist` 从「本版不会被触发」改为「只在一种情形下被触发」；性质表补「**个人组织存在 ⇔ 对应账号记录存在**」 | **新增三条义务**：规范场景 [S-54](v1/contract.md#s-54-清除只对未激活账号成立)、清除依据的产出条件，以及跨契约那一半（归组合契约的 `NoOrphanPersonalOrganization`）。**⇒ 那一半不由本契约独立兑现**——[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 不核实账号记录是否已被清；它兑现的是**产出依据**那一步，次序由组合承担 |
  | **主线裁定：[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 补「已过期」前置并产出清除依据** | 前置②由「未激活」扩为「未激活**且已过留存期限**」，**两条都在本操作自己的提交里现读** `capability.account-identity/v1#S-18` 的两个字段；失败集合加 **`accountNotExpired`**（与 `#S-38` 的 `not-expired` 对称）；⑤ 成功（**含幂等成功**）返回一份与该 `AccountId` 绑定的**清除依据**；契约里「信任调用方」那段**删掉**，改写成「两步各自现读同一个单调事实，谁也不替谁判」；[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的依赖表记明**两处方向相反**（S-20 要未过期、S-53 要已过期） | **[S-54](v1/contract.md#s-54-清除只对未激活账号成立) 由五支增到六支**（加 `accountNotExpired` 那一支），另加一条依据产出条件的演练。**Alloy 与 TLA+ 都不受影响**：这两条都是操作前置与返回值，不是结构关系，也不改变清除链在模型里的两步形状 |

  **[缺口 G-2 没有被这条销毁路径关掉。](v1/contract.md#十一已知缺口)**
  个人组织[既发不出邀请也不参与隶属关系](v1/contract.md#s-6-两个变体与四条结构性禁止)，
  所以没有任何邀约指向它；「指向的组织已不存在」这个分支**仍然没有触发源**，
  [S-46](v1/contract.md#s-46-邀约的三种收场) 仍然覆盖不到它。
  **本包此前只有一次执行记录，它的结论是一个反例，已按上表处置。**
- **已执行：三项依赖在 catalog 登记**（2026-09-22，[G-10](v1/contract.md#十一已知缺口)（当时编号 G-5）就此闭合）：
  账号那一项按 [S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的条款号登记（`S-17`、`S-18`）；
  过期那一项按正文里按号引用的位置收齐。
  **身份值那一项只登记了 `S-3` 与 `S-33`，是不完整的**——
  S-4 的被消费面表**没有列身份值与隔离义务那一侧**，正文里那一侧大多以散文引用、不给条款号。
  **补全归契约 owner**，登记侧的说明在[包入口](README.md)。
  **本契约语义不变，不需要新版本**；已有证据不受影响。
- **已执行：`MembershipStanding` 与 `ScopeLayerIdentity` 立了词条**（2026-09-22）：
  [S-9](v1/contract.md#s-9-成员资格判定结果两值不可用是读面失败) 与
  [S-13](v1/contract.md#s-13-层身份读面) 改为直接引用
  [UL-membership-standing](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing) 与
  [UL-scope-layer-identity](../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-layer-identity--作用域层身份--scope-layer-identity)；
  两条词条与契约原有表述**逐条对上**（两取值、不可用不是第三个取值；出厂默认那一格没有身份对象）。
  **语义不变、不出新版本**，已有证据仍适用；原缺口 G-8 随之删除。
- **已执行：PF-001 升到 rev 11**（2026-09-22，[changelog](../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)）：
  邀约时长改为「每类各有默认值（部署配置），发出时发起者可指定这一份」。
  [S-10](v1/contract.md#s-10-邀请)／[S-11](v1/contract.md#s-11-隶属请求) 补写口径，
  [S-23](v1/contract.md#s-23-发出邀请)／[S-30](v1/contract.md#s-30-发出隶属请求) 的①补一个**可选**输入；
  判定式仍整块归 `data.offer-expiry` v1，**本契约语义不变、不出新版本**，原缺口 G-9 随之删除。
  [S-47](v1/contract.md#s-47-过期之后接受被拒且没有中间状态) 的演练此后须**显式给出这一份的时长**，不依赖某个全局默认。
- **会话级层身份定下来**（[G-1](v1/contract.md#十一已知缺口)）：
  [S-13](v1/contract.md#s-13-层身份读面) 补一格。其余三层的判定不变，
  但 [S-35](v1/contract.md#s-35-层身份) 的返回形状变了——**须发布新版本**。
- **团队组织获得终结路径**（[G-2](v1/contract.md#十一已知缺口)，**本版仍然开着**）：
  「指向的组织已不存在」**才会首次获得触发源**——
  [S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 给不了它，个人组织身上没有任何邀约。
  届时 [S-46](v1/contract.md#s-46-邀约的三种收场) 要加一条同形场景；
  判定式归 `data.offer-expiry` v1，本契约语义不变，**不需要新版本**。
- **跨进程演化**（[G-7](v1/contract.md#十一已知缺口)）：
  [S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 左列的五条从「装配给」转为「协议给」，
  **语义边界改变，须发布新版本**；本版的全部证据只保留其单机范围，**不得外推**。
  特别是 TLC 的结果——它假设存储兑现序列化，那个假设在跨节点时不再自动成立。

结果不改写规范。发现语义问题回到来源设计（PF-001／PF-003／PF-015），不在这里改契约。
