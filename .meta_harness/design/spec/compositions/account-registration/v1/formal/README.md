# 形式化工件与论证映射

本目录是 `composition.account-registration` v1 的行为模型与检查配置。
本页维护**规范条款 → 形式对象 → 检查配置**的对应；它本身不是模型，也不是通过记录，
**不填执行状态**——执行状态在[验证入口](../../verification.md)。

契约正文在 [`../contract.md`](../contract.md)。

## 为什么本主题触发了行为模型义务

本契约自定义了一条跨 owner 的提交协议——[激活为唯一提交点](../contract.md#s-10-激活是唯一提交点)
加上[三步各自幂等](../contract.md#s-9-幂等边界)——并**以这条协议为依据，省略了跨边界的原子提交**
（[S-24](../contract.md#s-24-内核不提供由本契约兑现的表) 第一行）。

「依赖某性质省略或放宽控制」正是必须给出行为模型与关键性质检查的那一类。
省略的是控制，代价必须由模型承接；**不是因为用了 TLA+ 才有义务，是因为省略了控制才有义务**。

## 本版本选用什么

| 规范条款/性质 | 所需表达及理由 | 形式对象 | 未覆盖范围与相应义务 |
|---|---|---|---|
| [S-13](../contract.md#s-13-一个可用账号有且仅有一个个人组织) 可用账号有且仅有一个个人组织（含「不存在已激活却无个人组织的账号」那一面） | 状态不变量；跨三步、跨并发，只有行为模型能在全部交错上检查 | `ActivatedHasPersonalOrganization` ∧ `OnePersonalOrganizationPerAccount` | 模型不表达组织内部结构（成员资格效力、角色）——那归 `capability.organization-governance` |
| [S-35](../contract.md#s-35-个人组织不会变成孤儿) 个人组织不会变成孤儿 | 状态不变量，**只有在清除链与注册主链交错时才可能被违反**；它是 S-13 的镜像面，不是同一条 | `NoOrphanPersonalOrganization`，**只在 [`crash.cfg`](crash.cfg) 下被真正检查**（`basic.cfg` 里清除链根本不发生） | 模型不表达「那条孤儿记录此后谁也到不了」——那是可达性的产品后果，不是本模型的状态 |
| [S-34](../contract.md#s-34-第二条动作链未激活到期清除) 清除链两步的次序 | 次序由本组合排，但它在运行期**有对应物**——① 产出清除依据、② 把依据写成前置；要检查它是否 load-bearing，就得让两步真的是两次提交 | `sweep` 变量 ＋ `ExpireAccount` 的 `sweep = "orgCleared"`（**这条守卫就是那份依据**） | 依据的**形状与不可伪造性**不在模型里——`sweep` 是一个布尔式的阶段标记，模型不表达「依据与 AccountId 绑定」（单标识模型里只有一个账号）。**那一半的证据形式是 [`capability.account-identity/v1#S-41`](../../../../capabilities/account-identity/v1/contract.md#s-41-未激活记录到期释放标识) 的 ④（不带清除依据）与 ⑤（依据绑的是另一个账号），以及 [`#S-42`](../../../../capabilities/account-identity/v1/contract.md#s-42-伪造的依据两侧都被拒) 的第 1 支（自制一份依据）**；**本契约有意不为它自设一条场景**——那三支检查的是 [`#S-38`](../../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的前置，**属那份能力契约的义务**，在这里再立一条只会造出第二份会分叉的说法。**以坐标引用它们即是消费**：`#S-41`／`#S-42`（连同下面 [`#S-14` 前置③那一行](#本版本选用什么)对应的 [`#S-43`](../../../../capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期)）已按评审轮三定的判据登进 [S-2](../contract.md#s-2-参与方与精确承诺) 的消费 clauses；「本契约不自设场景」不等于「不消费那份契约的场景」。本包在清除链上自己登记的义务是**跨两步的那几条**（跳过 ① 直接调 ②、两步之间中断后重扫、与主链并发），见[验证入口](../../verification.md#证据义务)。清扫**谁来跑、多久跑一次**同样不在模型里：`Expire` 与两步清除都是可在任何位置插入的环境动作，这是最坏情况，也对应[缺口 G-6](../contract.md#九已知缺口) |
| [S-14](../contract.md#s-14-一个登录标识上至多一个账号) 一个登录标识至多一个账号 | 不需要独立断言 | **被建模方式吸收**，见[下节](#模型吸收了哪一条不变量) | 它在真实实现里由存储唯一约束兑现，证据形式是[规范场景 S-31](../contract.md#s-31-规范场景两个同标识并发注册)，不是模型 |
| [S-15](../contract.md#s-15-激活不回退) 激活不回退 | 数据形状约束 | 模型中 `account` 无从 `"activated"` 出发的转移；由 `TypeOK` 与动作集合共同表达 | — |
| [S-16](../contract.md#s-16-中断绝不被呈现为成功) 中断不呈现为成功 | 安全性质，必须在故障注入下检查 | `NoFalseSuccess` | — |
| [S-10](../contract.md#s-10-激活是唯一提交点) 激活的前置是个人组织已存在 | 它约束的是**转移**不是状态，写成状态不变量会丢掉「谁在什么时候检查」 | `OrganizationBeforeActivation`（`[][A]_vars` 形式的动作性质） | — |
| [S-20](../contract.md#s-20-收敛) 静止时没有第三种形态 | 直接对应验收判据措辞 | `ConvergentOutcome` | 见[下节](#convergentoutcome-不是一条独立性质)——它是上面几条的投影，如实记明 |
| [S-5](../contract.md#s-5-终结结果集合) 终结结果集合无「其他」 | 类型约束 | `TypeOK` 中 `outcome` 的值域 | — |
| [S-19](../contract.md#s-19-有前提的进展) 有前提的进展 | 时序性质，需要显式公平性与前提 | `EventualOutcome`（leads-to），只在 `progress.cfg` | **常量取值对应的是前提 (b)(c)，不是 (a)(b)**：`Abandoning = FALSE` 是 (b)「发起者不放弃」，`Failures = FALSE` 是 (c)「存储最终持续可用」，两者在真实系统中不可观察，模型把它们写成常量取值与公平性假设，**不是被证明的事实**。**(a)「部署可访问」由前件承接**——前件是 `pc[a] # "start"`，一次尝试已经开始就说明它送到了 ①，因此 (a) 不需要一个常量。**前提 (d)（两个参与方的服务面都能被解析到）根本没有被建模**：模型里两个参与方的动作恒可发生，它是模型的一条假设，不是被检查的前提。要检查它须给模型加一个「参与方缺席」的常量，本版没有加——它的证据形式是规范场景 [S-29](../contract.md#s-29-规范场景参与方缺席时不放行)。**还有一支不在前件内**：① 撞上一条已过期记录时尝试留在 `"start"`（`ClaimExpired(a)` 是守卫谓词不是动作），`EventualOutcome` 对它**什么也没说**；那一支的进展由 [S-8](../contract.md#s-8-三步次序与责任交接) 的分支表承担，证据是[验证入口登记的规范场景](../../verification.md#证据义务) |
| [S-8](../contract.md#s-8-三步次序与责任交接) 的**激活依据**：由 ② 产出、③ 把持有它写成前置、只绑定 AccountId；「同一次尝试内产出即用」是组合的流程规则 | 它是 ③ 能否发生的守卫之一，而 ③ 是唯一提交点；不建模就等于假定它恒真 | `warrant` 变量（按 `Attempts` 索引）＋ `ActivateOk` 的 `warrant[a]` 守卫；`OrganizeOk` 置真（**含幂等那一路**）、`ClaimFresh` 全部清零（绑定 AccountId）。**按 `Attempts` 索引表达的是组合「只用本次尝试 ② 产出的那一份」这条流程规则**，不是凭证绑定尝试——凭证本身只绑定 AccountId，模型里凭证不作废 | 依据的**形状与不可伪造性**不在模型里——`warrant` 是布尔，模型不表达「伪造一份」。那一半的证据形式是 [`capability.account-identity/v1#S-42`](../../../../capabilities/account-identity/v1/contract.md#s-42-伪造的依据两侧都被拒) 的规范场景 |
| [`capability.account-identity/v1#S-14`](../../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置③：激活在自己那一次提交里现读「已过期」 | 它是 [S-13](../contract.md#s-13-一个可用账号有且仅有一个个人组织) 的**第三个保护点**，只在清除链与主链交错时才用得上 | `ActivateOk` 的 `~expired` 守卫 | 真实实现上的证据形式是 [`capability.account-identity/v1#S-43`](../../../../capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期)（故障注入支 ＋ 真并发支）；本包在[验证入口](../../verification.md#证据义务)记它的组合侧可观察形式（发起者看到 `interrupted`），**两边是同一次演练的两面**。它也是本契约消费的 clause（[S-2](../contract.md#s-2-参与方与精确承诺)） |
| [S-25](../contract.md#s-25-装配给的保证-vs-协议须给的保证) 装配给的保证 | **不建模**。模型假定 ③ 读得到 ② 提交后的事实、且「是否已过期」这个事实对三个读取点（`OrganizeOk`、`ActivateOk`、`ExpireOrganization`）是同一个答案（单机装配给的那两条） | — | 跨进程的新鲜度界未定义（[G-3](../contract.md#九已知缺口)）；**本模型的全部结论只保留其单机范围，不得外推** |

**不选用 Alloy。**本契约没有需要在给定规模上找结构反例的关系约束：
「一个账号一个个人组织」是一条计数约束，在行为模型里就是一个不变式，
另建一份结构模型只会产生第二份需要同步的说法。

**不选用 Schema。**本契约不拥有任何数据形状（[S-3](../contract.md#s-3-本契约明确不承诺什么)）。

## TLA+ 与 TLC

### 模型文件

[`Registration.tla`](Registration.tla)。建模对象是**一个登录标识**上的若干次注册尝试；
「重来」就是 `Attempts` 里的另一次尝试。

不同登录标识之间没有共享状态（① 的幂等边界就是登录标识），因此单标识模型已覆盖本契约要检查的全部交错；
把多个标识放进同一个模型只会乘出没有新行为的状态。

### 语义映射

| 契约概念 | 模型对象 | 说明 |
|---|---|---|
| 这个登录标识上的账号 | `account ∈ {None, "unactivated", "activated"}` | `None` 即不存在 |
| 该账号的个人组织数量 | `orgCount ∈ Nat` | 产品要求恰一个；模型不约束它只能是 0/1，**让错误的实现有机会把它撑到 2**，否则不变量检查不出东西 |
| 一次尝试走到哪一步 | `pc[a] ∈ {"start","claimed","organized","done"}` | 对应 [S-8](../contract.md#s-8-三步次序与责任交接) 的三步 |
| 发起者收到的回执 | `outcome[a]` | 取值即 [S-5](../contract.md#s-5-终结结果集合) 的四个终结结果，或 `None` |
| 发起者放弃 | `abandoned[a]` | **环境选择，系统不可观察**；只为表达 [S-19](../contract.md#s-19-有前提的进展) 前提 (b)，实现不得去读它 |
| ① 产生未激活账号 | `Claim(a)` 的四个分支 ＋ 守卫谓词 `ClaimExpired(a)` | `ClaimFresh` / `ClaimResume` / `ClaimTaken` / `ClaimRejected`，逐条对 [S-12](../contract.md#s-12-重试规则) 的各行。**`ClaimExpired(a)` 不是动作**：它是 `identifier-held-by-expired-record` 那一路，本组合[就地跑清除链再重跑 ①](../contract.md#撞上一条已过期的记录时为什么由本组合接手)，所以尝试**留在 `"start"`**，没有终结分支。**它已从 `ClaimTaken` 的守卫里减出去**——不减，「到期之后同一标识注册得成」这条判据在模型里走不出来 |
| ② 创建个人组织与首个租户 | `Organize(a)` = `OrganizeOk(a)` ∨ `OrganizeRejected(a)` | `orgCount` 已为 1 时不再增加 = AccountId 幂等边界，**且那一路照样产出依据**（[`#S-20` 的⑦](../../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)）。`OrganizeRejected` 是 `accountRecordExpired` / `accountDoesNotExist` ⇒ `interrupted`（[S-8](../contract.md#s-8-三步次序与责任交接) 的分支表） |
| ③ 激活（唯一提交点） | `Activate(a)` = `ActivateOk(a)` ∨ `ActivateRejected(a)` | 守卫是 **`warrant[a]` ∧ `~expired`**，对应 [`#S-14`](../../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置②③；对 `account` 的赋值是幂等的。`ActivateRejected` 是 `account-record-expired` / `account-not-found` / `warrant-invalid` ⇒ `interrupted`。**这里以前写的是 `orgCount >= 1`，那是个错误的守卫**——`#S-14` 按契约读不到组织那一侧，写成读 `orgCount` 就把「依据可能已经过时」整件事藏了起来 |
| 本次尝试手上的激活依据 | `warrant[a]` | `OrganizeOk` 置真、`ClaimFresh` 全部清零。清零表达的是**绑定 AccountId**：换了一条记录，手上的旧依据绑定的都是上一条记录，对新记录一份也不匹配（凭证本身不作废，只是绑定的对象不在了） |
| 故障 | `Fail(a)`，受 `Failures` 控制 | 覆盖 [S-11](../contract.md#s-11-失败停在哪) 的每个中断位置 |
| 提交成立而回执未送达 | `Activate(a)` 的第二个分支，受 `Failures` 控制 | 覆盖 [S-6](../contract.md#s-6-每个终结结果的含义与对应的存储状态) 第三行 |
| 这条记录是否已过留存期限 | `expired`，由 `Expire` **单调**置真，受 `Expiring` 控制 | `capability.account-identity/v1#S-18` 返回值里的「是否已过留存期限」及其单调性 |
| 清除链走到哪一步 | `sweep ∈ {"idle", "orgCleared"}` | **`sweep = "orgCleared"` 就是那份[清除依据](../../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)**：① 成功时产出它，② 把它写成自己的前置。**模型里这条守卫因此不是模型独有的**——运行期有对应物。**两步之间的窗口仍是真开着的**：`ExpireAccount` 不看 `orgCount`，正如 `#S-38` 不核实个人组织 |
| 清除链 ① 清个人组织 | `ExpireOrganization` | `capability.organization-governance/v1#S-53`；`expired ∧ account = "unactivated"` 就是它②的两条现读（已过期、未激活），对已清过幂等；`sweep' = "orgCleared"` 就是它产出依据 |
| 清除链 ② 清账号记录 | `ExpireAccount` | `capability.account-identity/v1#S-38`；`sweep = "orgCleared"` 是它的依据前置，`expired ∧ account = "unactivated"` 是它**自己照判**的那两条——**依据不放宽它们** |
| 「一条已过期的记录不能再被建个人组织」 | `OrganizeOk(a)` 的 `~expired` | [`capability.organization-governance/v1#S-20`](../../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的前置②与 `accountRecordExpired` |
| 「一条已过期的记录不能再被激活」 | `ActivateOk(a)` 的 `~expired` | [`capability.account-identity/v1#S-14`](../../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置③与 `account-record-expired`。**这是同一个单调事实的第三个读取点** |

**抽象掉的东西，逐条写明**：

- **凭据**没有独立取值域。「凭据是否合规」与「凭据是否匹配那个未激活账号」在模型里是
  `Claim` 的非确定分支。理由：本契约不拥有凭据的形状（[S-3](../contract.md#s-3-本契约明确不承诺什么)），
  它只拥有「匹配则从 ② 继续、不匹配则算标识已被占用」这条收场规则，而非确定分支恰好覆盖这条规则的两侧。
- **存储**是隐式的。模型不表达两个 owner 各自的提交边界内部，只表达「这一步的效果要么整个成立、要么没发生」。
  这个抽象成立的前提是各 owner 的单次提交确实原子——那是它们各自契约的承诺，不是本模型的结论。
- **时间**不在模型里。本契约没有任何带时限的条款（[S-19](../contract.md#s-19-有前提的进展) 明说不给上界）。
  **「到期」因此建模成一个可以插在任何两步之间的环境动作 `Expire`，不是一个时钟**——
  那恰好是最坏情况。**清扫的发起者与节奏同样不在模型里**（[缺口 G-6](../contract.md#九已知缺口)）：
  两步清除是任意可插入的动作，模型不假设有人一定会来跑它，也不假设它跑得多快。
- **成员资格效力与角色**不在模型里。② 的内部结构归 `capability.organization-governance`；
  本模型只关心「个人组织在不在」这一个可被 ③ 读到的事实。
- **清除链的两个发起者不在模型里。**`ExpireOrganization` 与 `ExpireAccount` 是**一对不区分发起者的动作**：
  [主链就地发起](../contract.md#撞上一条已过期的记录时为什么由本组合接手)与
  [清扫发起](../contract.md#s-34-第二条动作链未激活到期清除)**都映射到这同一对**。
  这个抽象是成立的，理由写在契约里：**两个发起者走的是同一条链、同一套幂等边界**，
  差别只在拿到失败分类之后做什么（主链要给发起者一个终结结果，清扫不用），
  而**那一半根本不是这两个动作的语义**。
  **因此不得把模型的通过读成「两个发起者的处置都被检查过」**——
  [按发起者分的那张处置表](../contract.md#参与方失败值到终结结果的映射)的证据形式是规范场景。
- **「重跑 ① 只做一次」不在模型里。**模型里一次尝试的 `Claim(a)` 可以反复发生（`Claim` 刻意不加公平性），
  没有任何变量记着「这次尝试已经重跑过一次了」。
  那条规则是[契约对编排者的约束](../contract.md#撞上一条已过期的记录时为什么由本组合接手)，**不是不变量**：
  破坏它的后果是一次尝试在极端交错下反复重跑，而**那不会违反本模型检查的任何一条性质**
  （它仍然不会产生「已激活 ∧ 无个人组织」，也不会把中断报成成功）。
  **它的证据形式是规范场景**，见[验证入口](../../verification.md#证据义务)。

### 公平性加在哪里，为什么

```text
Fairness == \A a \in Attempts : WF_vars(Organize(a)) /\ WF_vars(Activate(a))
```

**`Claim` 刻意不加公平性。**一次新的 `Claim` 就是一次「重来」，而系统从不承诺发起者会重来——
[S-12](../contract.md#s-12-重试规则) 把重来写成发起者的选择，[S-19](../contract.md#s-19-有前提的进展) 的前提 (b) 也明说
「发起者不放弃」是环境假设。给 `Claim` 加 WF 等于把「用户一定会重试」偷偷写成系统保证，
那样一来 `EventualOutcome` 通过就不再说明任何事情。

因此 `EventualOutcome` 的前件是 `pc[a] # "start"`：**一次已经开始的尝试**必达终结结果。

### 三个配置，各检查什么，为什么要分开

| 配置 | `Attempts` | `Failures` | `Abandoning` | `Expiring` | 检查什么 | 分开的理由 |
|---|---|---|---|---|---|---|
| [`basic.cfg`](basic.cfg) | `{a1, a2}` | FALSE | FALSE | FALSE | 六条安全性质 + `OrganizationBeforeActivation` | **把故障与清除链一起隔离掉。**它若出反例，问题一定在注册主链的次序、幂等或提交点上——先定位到最小原因。**`NoOrphanPersonalOrganization` 在这里是平凡的**（清除链根本不发生），列出来只为让两个配置检查的是同一组性质 |
| [`crash.cfg`](crash.cfg) | `{a1, a2, a3}` | TRUE | TRUE | TRUE | **同一组**性质 | 这是主检查：任意中断位置 × 任意交错 × 放弃 × 到期。第三次尝试代表「用同一标识重来」，因此这一配置同时覆盖 [S-12](../contract.md#s-12-重试规则) 与 [S-22](../contract.md#s-22-编排本链的提供者被卸载或换代)；**也是 [S-35](../contract.md#s-35-个人组织不会变成孤儿) 唯一被真正检查的地方** |
| [`progress.cfg`](progress.cfg) | `{a1, a2}` | FALSE | FALSE | **TRUE** | `EventualOutcome`（唯一检查时序性质的配置） | 前两个常量取值就是 [S-19](../contract.md#s-19-有前提的进展) 的前提 (b)(c)：`Abandoning = FALSE` 是「发起者不放弃」，`Failures = FALSE` 是「存储最终持续可用」。**`Expiring` 开着**，理由见下 |

**`progress.cfg` 为什么必须关掉故障**：故障会把尝试收束到 `interrupted`，而 `interrupted`
**也是**一个终结结果。开着故障，`EventualOutcome` 会被「被打断」这条路径满足，
检查的就不再是「动作链会走完」，而是一句恒真的话。这类空洞正是有界进展性质最容易出的毛病。

**`progress.cfg` 为什么反过来要开着 `Expiring`**：**理由不同形，别照抄故障那一条。**
故障是一条**万能的逃生门**：它能在任何位置把任何尝试一刀收束掉，所以开着它这条性质就恒真。
而到期只影响两处（`OrganizeOk` 与 `ActivateOk` 的 `~expired`），
且那两处的收场是[契约自己写明的分支](../contract.md#参与方失败值到终结结果的映射)——
`accountRecordExpired` 与 `account-record-expired`，模型里就是 `OrganizeRejected` 与 `ActivateRejected`。
**关掉它只会缩小这条性质的检查范围**，把「碰上到期还能不能走到终结」整块排除在外。

> **这一格是评审轮一改的，改之前写的是 `Expiring = FALSE`。**
> 那时的理由（「到期会让尝试推进不下去」）**当时是对的**：模型里 `Organize` 只有成功一路，
> 一次走到 `"claimed"` 的尝试碰上到期就真的卡在那里。
> 评审轮一按 [S-8](../contract.md#s-8-三步次序与责任交接) 的分支表补上两条 `Rejected` 支之后，
> 卡住那条路径不存在了，这条前提随之失效——**所以删掉它，不是放宽，是它已经不是前提了**。
> **两条 `Rejected` 支落在 `Organize(a)` / `Activate(a)` 的析取里**，
> 因此 `Fairness` 的 `WF_vars` 同时覆盖它们：两个动作在各自的 `pc` 上恒可发生。

**`basic.cfg` 与 `crash.cfg` 为什么不合并**：合并之后仍然只出一个反例，
但反例落在哪一层要靠人去读。分成两个配置，「哪一层坏了」由**哪个配置先红**直接回答。

### 有效性核对

模型必须**真的能走到成功**，否则不变式全绿只说明成功状态不可达。核对方式：

1. 临时把 `~(account = "activated" /\ orgCount = 1)` 当作不变量跑 `basic.cfg`，**必须出反例**，
   且反例的最后一个状态是某次尝试 `outcome = "registered"`。
2. 临时把 `~(account = "unactivated" /\ Terminated)` 当作不变量跑 `crash.cfg`，**必须出反例**——
   这证明「账号停在未激活」这条失败路径确实在覆盖范围内，不是被约束排除掉了。

> **这两个否定配置不写成文件，也不登记为形式任务。**它们是一次性的有效性核对，
> 断言为真才是失败；把它们登记成任务会在 `formal-tasks` 里留下一条「期望失败」的检查，
> 与该清单的语义相反。核对做过没做过，记在[验证入口](../../verification.md)。

### 变异核对：证明不变式不平凡

一条永远为真的不变式检查不出任何东西。下列变异**每一个都必须使某条不变式出反例**；
做不到的那一条不变式是平凡的，要回头改写。

| # | 变异 | 配置 | 期望被哪条抓到 | 期望反例的形状 |
|---|---|---|---|---|
| M1 | `OrganizeOk` 改成无条件 `orgCount' = orgCount + 1` | `basic` | `OnePersonalOrganizationPerAccount` | 两次尝试各建一个个人组织 |
| M2 | 把 `outcome' = [... EXCEPT ![a] = "registered"]` 加进 `OrganizeOk`（提交点前移到 ②） | `crash` | `NoFalseSuccess` | ② 之后发回执，随后故障，账号停在未激活却已呈报成功 |
| M3 | `ClaimFresh` 去掉 `account = None` 前置 | `basic` | `NoFalseSuccess`、`ActivatedHasPersonalOrganization`、`ConvergentOutcome`（**任一条先红即可**） | 激活之后又被重来的 ① 覆盖回未激活 |
| M4 | **`ExpireAccount` 去掉 `sweep = "orgCleared"`**（= 去掉[清除依据](../../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)那条前置） | `crash` | `NoOrphanPersonalOrganization` | 账号记录先被清掉，个人组织留下——**这正是契约里写的「反过来会留下没有账号的个人组织」** |
| M5 | **`OrganizeOk` 去掉 `~expired`**（一条已过期的记录还能被建个人组织） | `crash` | `NoOrphanPersonalOrganization` | 清除链 ① 清掉组织、主链 ② 在窗口里又建一个、清除链 ② 再把账号删掉 |
| M6 | **`ActivateOk` 去掉 `~expired`**（= 去掉 [`#S-14` 的前置③](../../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)） | `crash` | `ActivatedHasPersonalOrganization` | ② 走完之后记录到期、清除链 ① 清掉组织，主链凭手上那份依据照样激活 ⇒「已激活 ∧ 无个人组织」 |
| M7 | **`ActivateOk` 去掉 `warrant[a]`**（= 去掉[激活依据](../contract.md#激活依据由谁产出绑定什么)那条前置） | `crash` | `ActivatedHasPersonalOrganization` | 整条记录被清掉、另一次尝试建了一条**全新**记录，旧尝试凭一份绑定的是上一条记录的依据激活它 |
| M8 | `Fairness` 去掉 `WF_vars(Activate(a))` | `progress` | `EventualOutcome` | 尝试停在 `"organized"` 永不推进 |

**M4～M7 四个必须都做，它们堵的是四个不同的洞。**
M4、M5 抓的是同一条不变量：一个是**次序**（谁先谁后），一个是**次序之间那个窗口**（中间能不能插进来）。
只做 M4，会得出「排好次序就够了」这个错误结论——而那个窗口在真实系统里是开着的，
因为[两步分属不同 owner、各自单次提交](../contract.md#s-34-第二条动作链未激活到期清除)。

M6、M7 抓的是**另一条**不变量（[S-13](../contract.md#s-13-一个可用账号有且仅有一个个人组织)），
堵的是 ③ 那一侧的两个洞：
**M6 是「依据还在手上，但它断言的事实已经没了」**，
**M7 是「依据绑的是另一条记录」**。
**两者都被原来那个 `orgCount >= 1` 守卫藏住了**——直接读组织那一侧的状态，
等于假定 ③ 看得见组织，而 [`#S-14` 按契约看不见](../../../../capabilities/account-identity/v1/contract.md#s-2-消费者与依赖方向)。
**这是评审轮一发现的真洞，不是一次措辞修正。**

执行状态在[验证入口](../../verification.md)；**本页不记录跑没跑过**。

### 结果入口

TLC 的模型修订、实际配置、常量取值、限制范围、完成情况、反例与局限，
全部在[验证入口](../../verification.md)记录，原始产物归
[`record/evidence/`](../../../../../record/evidence/README.md)。

**TLA+ 描述行为规格，TLC 只对给定配置做检查。**在已检查范围内未发现反例，
不自动成为任意范围的证明；尤其**不覆盖**：真实存储的提交原子性、跨进程、
两个参与方契约各自的内部正确性。

## `ConvergentOutcome` 不是一条独立性质

如实记明：`ConvergentOutcome` 在逻辑上是
`ActivatedHasPersonalOrganization ∧ OnePersonalOrganizationPerAccount ∧ NoFalseSuccess`
在静止点上的合取投影，**不是一条独立的不变量**。

单独检查它的理由只有一个：它逐字对应
[验收判据](../../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)
的措辞（「要么……要么……不存在第三种」）。上面三条里任一被削弱时，它给出的反例直接就是验收语言，
不需要再翻译一次。

**这不使它成为额外证据。**四条一起通过，证据强度等于前三条通过。

## 模型吸收了哪一条不变量

[S-14](../contract.md#s-14-一个登录标识上至多一个账号)「一个登录标识至多一个账号」在模型里**没有对应的断言**，
因为模型把「这个标识上的账号」建模成了单个变量 `account`——它在结构上就装不下第二个账号。

**这是一处被声明的抽象，不是一条被检查的性质。**它在真实实现里由存储的登录标识唯一约束兑现，
证据形式是[规范场景 S-31](../contract.md#s-31-规范场景两个同标识并发注册)（两个同标识并发注册，
观察只产生一个账号），不是本模型。**不得把本模型的通过读成这条不变量已被检查。**

## 版本与证据边界

模型、性质与假设随规范版本冻结；**三个检查配置本身也是规范工件**——
它们固定了每条性质被检查的范围，改范围等于改本契约声称的证据边界，须发布新版本。

执行配置、命令、原始输出、反例在版本外保存，绑定实际模型与输入快照。
本页维护规范到论证对象的对应，不填随运行变化的通过状态。
