# composition.account-registration v1

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.account-registration, 1)`
- **设计依据**：[PF-001 §4 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)、
  [§4 个人组织](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#个人组织)、
  [§4 租户](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#租户)、
  [flows §1.1 注册](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)、
  [flows §2 分支与异常](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)、
  [flows §3.1 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)、
  [§4 未激活的账号记录不会永久占着那个名字](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)——
  **rev 13 在这一节写明「为它准备的个人组织与第一个租户随之消失」，
  那是[本契约清除链](#s-34-第二条动作链未激活到期清除)两步合起来要兑现的那一条**，
  也是[它为什么不能只清账号记录](#次序先清组织再清账号)；
  [acceptance §三「注册的提交点在激活」](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)、
  [decisions §二「注册以激活为单一提交点」](../../../../product/PF-001-identity-scope-and-agent-constraints/decisions.md#二pm-推导)（PF-001 **rev 15**）；
  [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)
- **参与方契约**：`capability.account-identity` v1 与 `capability.organization-governance` v1，坐标与消费 clauses 见 [S-2](#s-2-参与方与精确承诺)；
  两者**已成稿**，条款号已填，依赖项已于 2026-09-22 登记进 catalog（状态 `candidate`；[G-4](#九已知缺口) 已闭合）
- **精确语义依赖**：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`——
  本契约[不铸任何标识](#s-3-本契约明确不承诺什么)，但它**逐字传递** AccountId
  并据它判定次序，因此消费两条：
  [`#S-1`（AccountId）](../../../data/identity-values/v1/contract.md#s-1-accountid)、
  [`#S-2`（登录标识不是 AccountId）](../../../data/identity-values/v1/contract.md#s-2-登录标识不是-accountid)。
  **第二条是本契约的形状依据**：① 的幂等边界按登录标识、而其余两步与整条清除链按 AccountId，
  两者分开正是那条条款说的事。
  **第三条是 [`#S-35`（交接凭证）](../../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)**：
  两份依据都是它的实例，而本契约是它们的**产出方与携带方**
  （[S-8](#s-8-三步次序与责任交接)、[S-34](#s-34-第二条动作链未激活到期清除)）。
  **第四条是 [`#S-33`（表示层校验与判定分开）](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)**：[S-8](#s-8-三步次序与责任交接) 的 `invalid-input` 分支据它区分「表示层校验」与「政策判定」（评审轮四按「实质消费」补登）。
  **这是一条消费，不是「间接消费」**——本契约据它的「只绑定一个对象标识、不可伪造、本版不作废」
  写出了[激活依据的产出与绑定规则](#激活依据由谁产出绑定什么)，也据它把
  [S-35 的第一个前提](#s-35-个人组织不会变成孤儿)挂在「依据不可伪造」上；依据可伪造，那条不变量当场失效。
  **三条都已登记进 catalog**（`clauses: S-1, S-2, S-35`），[G-7](#九已知缺口) 就此闭合
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `composition.account-registration/v1#S-10`。
  **编号在本版本内只追加，不重排**：后补的条款取下一个未用的号并放进它语义所属的那一节，
  因此节内的号**不一定连续递增**。
  **评审轮一、轮二与轮三的修订都没有新增条款号**：改的是既有条款的内容与本页对外部条款号的引用形式

## 一、含义与使用范围

### S-1 本契约拥有什么

本契约拥有**一次注册从入口走到稳定点的整体责任**：三步动作链的次序与幂等边界、
唯一提交点的位置、终结结果集合，以及「中途停在任何位置时系统里留下什么」。

**以及那条链没走完时留下的东西最后怎么办**：
[产品给未激活的账号记录定了留存期限](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)，
到期要**清除记录并释放登录标识**——而这件事同样跨两个 owner（账号记录在一边，个人组织在另一边），
同样没有哪个单项能力能自己完成。它是本契约的**第二条动作链**（[S-34](#s-34-第二条动作链未激活到期清除)）。
**两条链共用同一套家当**：同样的两个参与方、同样的「每一步各自幂等、可安全重跑」的形状。

这件事**任何一个单项能力都拥有不了**。产品把注册成功定义成两件事同时成立——
[有身份**且**有自己的空间](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)——
而账号这一半的事实归 `capability.account-identity`，个人组织那一半归 `capability.organization-governance`，
两者各有自己的提交边界。**内核不提供跨边界的原子提交**（[S-24](#s-24-内核不提供由本契约兑现的表)），
所以「两件事一起成立」不能靠一个跨两个 owner 的事务取得。

本契约的做法是**把它改写掉**：不追求两件事同时写入，而是让**激活**成为唯一的提交点，
并让它之前的每一步都可以安全重跑。于是「不一致」这种状态在可观察面上不存在——
中途停下时系统里只有「没有可用账号」，没有「有账号但没有个人空间」。

### S-2 参与方与精确承诺

| 参与方 | coordinate、clauses 与 rebase_relation | 向本组合提供的保证 | 对本组合提出的前提 |
|---|---|---|---|
| `capability.account-identity` | `omne-harness-lite-design-2026-09-15 · capability.account-identity · v1`；消费 clauses **[`#S-13`（① 产生账号，未激活）](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)、[`#S-14`（③ 激活账号）](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)、[`#S-18`（读账号，取激活状态与「是否已过留存期限」）](../../../capabilities/account-identity/v1/contract.md#s-18-读账号)、[`#S-19`（登录标识部署内唯一，含「释放之后可被新账号取得」）](../../../capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一)、[`#S-38`（清除链的 ②，清除到期的未激活账号记录）](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)、[`#S-39`（`unactivated_retention`，① 的幂等窗口与清除链的触发判据）](../../../capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)、[`#S-41`（场景：未激活记录到期释放标识，本契约引其 ④⑤ 作清除依据绑定的证据）](../../../capabilities/account-identity/v1/contract.md#s-41-未激活记录到期释放标识)、[`#S-42`（场景：伪造的依据两侧都被拒，本契约引其第 1 支作清除依据不可伪造的证据）](../../../capabilities/account-identity/v1/contract.md#s-42-伪造的依据两侧都被拒)、[`#S-43`（场景：依据产出之后记录才过期，与本契约 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 第三个保护点的演练是同一次的两面）](../../../capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期)、[`#S-30`（跨边界须重新验证：[S-25](#s-25-装配给的保证-vs-协议须给的保证)「三个读取点读到同一答案」的兑现落点，评审轮四按「实质消费」补登）](../../../capabilities/account-identity/v1/contract.md#s-30-跨边界须重新验证)**；`rebase_relation` **不适用**（首版，无前身，见 [S-32](#s-32-本版是首版)）。**`#S-19` 与 `#S-39` 是评审轮二补上的**：本表的保证列与 [S-9](#s-9-幂等边界)／[S-12](#s-12-重试规则)／[S-34](#s-34-第二条动作链未激活到期清除) 早就在引它们，clauses 却漏了。**`#S-41`／`#S-42`／`#S-43` 是评审轮三按「引用即消费」补上的**：[formal/README](formal/README.md#本版本选用什么) 与[验证入口](../verification.md#证据义务)以坐标引用这三条场景作本契约证据的落点，**正文以坐标引用即登记为消费，只有否定式提及不登**；catalog 由主线同步 | ① 以**登录标识 ＋ 留存期限**为幂等边界产生未激活账号，同一标识上**至多一个账号**（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的幂等边界＋[`#S-19`](../../../capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一)）；**① 撞上一条已过期的未激活记录时，给 `identifier-held-by-expired-record` 并交出那条记录的 AccountId**（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)）；③ 激活，且激活对「已激活」是无二次效果的（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的幂等边界），**并在自己那一次提交里现读「是否已过留存期限」，读到「是」就以 `account-record-expired` 拒绝**（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置③）；账号的激活状态与「是否已过留存期限」可读，且后者**单调**（[`#S-18`](../../../capabilities/account-identity/v1/contract.md#s-18-读账号) 的性质 2）；**清除链的 ②：在单次提交内删除一条已过期的未激活记录并释放它占的登录标识，且对「记录已不存在」幂等返回 `ok`；并把「持有与该 AccountId 绑定、且由产出方签发的清除依据」写成自己的前置**（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | **两处前置事实都由本组合在调用前取得并传入**：激活的前置事实（该账号的个人组织已存在）＝ [`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的**激活依据**；清除链 ② 的前置事实（该账号的个人组织已不存在）＝ [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的**清除依据**，由清除链 ① 产出。**两份都是[交接凭证](../../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)的实例，只绑定 AccountId**（本版不绑定尝试、不作废，[`#S-35` 性质 4](../../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)）；**「同一次尝试内产出即用」是本契约对自己动作链的流程规则**（[S-8 ②](#激活依据由谁产出绑定什么)），不由凭证承载。本能力**不 inject 组织治理**，不自行去查——**两份依据都是这条单向依赖边的直接后果**，[次序因此由本组合承担，而依据使它在运行期有对应物](#s-34-第二条动作链未激活到期清除)。**新鲜度由本组合保证**：[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 明写它不核实依据的新鲜度（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)），本契约的 [S-8](#s-8-三步次序与责任交接) ② 因此承诺「同一次尝试内产出即用」 |
| `capability.organization-governance` | `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`；消费 clauses **[`#S-20`（② 创建个人组织）](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)、[`#S-53`（清除链的 ①，清除未激活账号的个人组织）](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)**；`rebase_relation` **不适用** | ② 在**单次提交**内创建个人组织，并使该账号在其中的[成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)为**有效**、[租户角色](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)为[超级管理员](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)（第一个租户随之成立，[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的④）；以 AccountId 为幂等边界，同一账号**至多一个个人组织**——**该账号已有个人组织时幂等返回既有的那一个，不报错**（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的⑦）；**在自己那一次提交里现读「是否已过留存期限」，读到「是」就以 `accountRecordExpired` 拒绝**（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的前置②）；**清除链的 ①：只收 AccountId，在单次提交内删除个人组织与其唯一成员关系记录，且在同一次提交里现读账号的激活状态与过期状态——读到已激活就以 `accountIsActivated` 拒绝，读到未过期就以 `accountNotExpired` 拒绝；成功（含幂等成功）返回一份与该 AccountId 绑定的清除依据**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)） | 传入的 AccountId 指向一个已存在的账号；本能力**不要求该账号已激活**——[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的②明写这一条，并给了理由：**激活的前置正是个人组织已存在**，要求已激活会让注册无法完成。**清除链那一步反过来要求账号记录仍然存在**：[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 要现读它才判得出「未激活」与「已过期」。**[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 只由本组合调用**（[S-25](#s-25-装配给的保证-vs-协议须给的保证)）：它自己没有授权前置 |
| 清扫提供者（消费者，不是参与方） | 不是契约参与方，是[清除链](#s-34-第二条动作链未激活到期清除)的**第二个发起者** | 无。它只是按 [`capability.account-identity/v1#S-39`](../../../capabilities/account-identity/v1/contract.md#s-39-unactivated_retention) 的期限扫描并发起清除链，输入只有 **AccountId**；**不带任何租户身份**——账号记录是账号级对象，一条未激活的账号记录没有任何租户效力 | 按 [S-34](#s-34-第二条动作链未激活到期清除) 的次序走两步，**不得跳过 ①**；按[终止型／抖动型](#s-34-第二条动作链未激活到期清除)处置失败。**它不承担任何正确性**（[G-6](#九已知缺口)）：到期之后那个名字能不能重新注册，由[注册主链自己兑现](#s-8-三步次序与责任交接)，不等它 |
| 注册入口（消费者） | 不是契约参与方，是**注册主链**的唯一消费者 | 把发起者提供的登录标识与凭据交给本组合，并把[终结结果](#s-5-终结结果集合)原样呈现给发起者 | 不得自行拆开三步、不得跳过 ③ 直接宣告成功、不得把 `interrupted` 改写成成功或改写成 `identifier-taken`。**表示层校验归它**：登录标识与凭据的形状不合格时应当在此拒绝，不要交进来（交进来的收场是 `interrupted`，见[失败值映射](#参与方失败值到终结结果的映射)）。**也不得把 [`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的 `identifier-held-by-expired-record` 透出给发起者**——那个值到不了它手上，本组合[就地消化掉了](#撞上一条已过期的记录时为什么由本组合接手) |

> **条款号已填。**两份参与方契约与本契约同期起草，起草期间本表只能用操作名指认；
> 它们成稿后条款号已稳定，因此本表改为**直接写条款号**。
> **注册主链**：① = [`capability.account-identity/v1#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)、
> ③ = [`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)
> （另用 [`#S-18`](../../../capabilities/account-identity/v1/contract.md#s-18-读账号) 读激活状态）、
> ② = [`capability.organization-governance/v1#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)。
> **[清除链](#s-34-第二条动作链未激活到期清除)**：① = [`capability.organization-governance/v1#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)、
> ② = [`capability.account-identity/v1#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)。
> **本页此后出现的每一个 `#S-n` 都带着它的坐标与链接**：裸的条款号离开上下文就指不出是谁的第 n 条，
> 而本契约同时引着三份契约的编号。
> 两条依赖项已登记进 catalog（2026-09-22，[G-4](#九已知缺口) 已闭合）；登记为 `candidate` 只表示采用关系可查，不表示接受。
> **参与方仍然是两个，不是四个**——清除链没有引入新的依赖边，只是在同两条边上多消费了两个条款。

**两侧分属不同 owner，这是本契约存在的原因，不是它要消除的东西。**
把账号与个人组织塞进同一个能力确实可以换来一次提交，本契约也就没有存在的必要；
不那样做买到的是下面四样，**每一样在两份参与方契约里都有具名落点**：

| 拆开买到什么 | 落点 |
|---|---|
| **反方向的半径收敛** | 治理 inject 的是账号能力的读面（[`capability.organization-governance/v1#S-4`](../../../capabilities/organization-governance/v1/contract.md#s-4-依赖方向与被消费的面)），所以**账号提供者换代本来就会重跑治理**——那个方向合不合并都一样。拆开收的是**另一个方向**：只需要「来者是谁」的那些消费者（[`capability.account-identity/v1#S-17`](../../../capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 校验登录状态、[`#S-18`](../../../capabilities/account-identity/v1/contract.md#s-18-读账号) 读账号）**不因组织治理换代而重跑** |
| **契约层的失败隔离** | 账号面不可用时治理的相关操作以具名值**明确失败、不静默降级**（[`capability.organization-governance/v1#S-43`](../../../capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)）；反过来，账号能力**只依赖存储**、不消费任何其他契约（[`capability.account-identity/v1#S-28`](../../../capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)），治理不可用不使它失效。这是两份契约各自写下的收场，不是实现习惯——**合成一份之后这两句话没有地方可写** |
| **SYS-DEPLOY 的分布式缝已逐条标价** | 两侧各自把「本版由装配给、跨进程后须由协议重新兑现」的保证**逐条点名**（[`capability.account-identity/v1#S-30`](../../../capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)、[`capability.organization-governance/v1#S-42`](../../../capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)），本契约的三步交接同样点名（[S-25](#s-25-装配给的保证-vs-协议须给的保证)）。合成一份会把这些缝藏进一次进程内调用，[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要的「语义不变地拆成分布式」届时**无从逐条兑现** |
| **账号身份事实不是范围化对象** | [`capability.account-identity/v1#S-12`](../../../capabilities/account-identity/v1/contract.md#s-12-账号身份事实不是范围化对象) 兑现 [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 的方式是**它什么也不提供**：没有任何操作接受层身份作参数，也没有任何读面按层返回账号事实。与持有组织、成员关系与层身份的那一份合并之后，这条负向承诺**失去它的结构依据**，只剩一句自律 |

> **这四条里没有「换一次认证方式就会把整个组织治理重启一遍」，那是有意的。**
> 那句话在契约层**不成立**：治理 inject 的是账号能力的读面，
> **账号提供者换代本来就会重跑治理**，多消费或少消费它的一条操作都不改变这个半径。
> 收益在上表**反方向**那一行，不在这一句上。
>
> **上表里的坐标是拆分理由的依据，不是本契约据以写出承诺、判定、映射或证据落点的条款**，
> 按[登记口径](../../../README.md#当前状态)**不登记为消费**——本契约的消费面仍以
> [S-2](#s-2-参与方与精确承诺) 的表为准。这与治理契约把
> `data.identity-values/v1#S-13` 排除在消费清单之外**是同一条规矩**。

### S-3 本契约明确不承诺什么

- **不承诺跨边界的原子提交。**三步分属两个 owner 的三次提交，中间**存在**可被观察到中断的时刻；
  被消除的不是中断，是「中断留下不一致状态」这个后果（[S-10](#s-10-激活是唯一提交点)）。
- **不承诺回滚。**任何一步已经提交的事实都不被撤销：账号不删，个人组织不删，激活不回退
  （[flows §3.1](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号) 明写激活不可逆）。
- **不按「多久没动」清理，也不承诺任何一条记录一定会被清掉。**
  发起者放弃与发起者只是慢，在系统侧**无法分辨**——这一条没有变。
  变的是**产品给了一个与「放弃」无关的判据**：
  [未激活记录有一个按部署配置的留存期限，到期清除、登录标识释放](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)。
  本契约据此有了[第二条动作链](#s-34-第二条动作链未激活到期清除)，但它承诺的只是**那条链怎么走**：
  **谁发起、多久扫一遍，归装配**；本契约**不设定时器**，
  也**不把「记录终将被清掉」当作任何条款的保护点**（[S-19](#s-19-有前提的进展) 的进展仍不依赖它）。
- **不做准入判定。**谁可以注册不在本契约范围内——产品把入口定为
  [「任何能访问该部署的人」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)。
- **不做限流与滥用防护。**[PF-001 明确把它排除在本版之外](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#四本版不验收的)。
- **不定义凭据的形状与合规规则。**「凭据是否合规」是一次判定的**结果**，本契约只消费这个结果
  （[S-6](#s-6-每个终结结果的含义与对应的存储状态)）；规则本身是政策，见[缺口 G-2](#九已知缺口)。
- **不定义登录。**注册结束于账号可用；此后怎么登录、怎么签发登录状态归 `capability.account-identity`。
- **不铸任何标识。**AccountId 与 OrganizationId 由各自的 owner 生成，形状归
  `data.identity-values` v1；本契约只传递它们。
- **不承诺任何对外交换格式。**本契约没有自己的 Schema——它拥有的是次序与责任，不是形状。

## 二、注册成功的含义与终结结果

### S-4 注册成功

**注册成功 ≝ 该[登录标识](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier)上的账号已激活（可用）
∧ 该账号的[个人组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-personal-organization--个人组织--personal-organization)存在，
且该账号在其中的[成员资格效力](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-membership-standing--成员资格效力--membership-standing)为**有效**、
[租户角色](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)为[超级管理员](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-super-administrator--超级管理员--super-administrator)
（第一个[租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)随之成立）。**

> **「登录标识」本版不可改**，注册时定下（[PF-001 §4 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)）。
> 本契约的 ① 幂等边界正建立在这一点上：它若可改，边界就要重新定义。

两者缺一不可。这不是本契约的发明，是产品对「注册成功」的定义：
[「有身份且有自己的空间」](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)。

### S-5 终结结果集合

一次注册尝试的结果取自且仅取自以下四个值：

```text
registered  |  identifier-taken  |  credential-rejected  |  interrupted
```

**没有第五个值，也没有「其他」。**结果值类型上不留开放分支——留了就会有实现把一个
自己没想清楚的情况丢进去，而发起者看到的是一个没有约定含义的收场
（[acceptance §二](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#二绝不能发生的事)
把「注册失败却显示成功」列为绝不能发生）。

### S-6 每个终结结果的含义与对应的存储状态

| 结果 | 含义（发起者看到什么） | 这次尝试结束时存储里是什么 | 可否用同一标识重来 |
|---|---|---|---|
| `registered` | 注册成功，账号可用 | 账号已激活；该账号恰有一个个人组织 | 不需要，也不应当——重来会得到 `identifier-taken` |
| `identifier-taken` | [这个名字已经有人用了](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) | **本次尝试没有改变任何东西**；该标识上原有的账号原样留存 | 换一个标识 |
| `credential-rejected` | [具体哪条规则不满足](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) | **没有产生账号，标识也没有被占用** | 可以，改凭据后重来 |
| `interrupted` | [这次没有注册成功](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) | 见下 | **可以，用同一标识继续**（[S-12](#s-12-重试规则)） |

**`interrupted` 是一个可辨认的终结结果，不是「结果未知」。**它明确地说：
这次尝试没有取得成功回执。它对应的存储状态有**四行、三种**，按中断发生的位置而定
（第一行与第三行是**同一种**存储状态——该标识上没有账号——只是到达它的路径不同）：

| 中断位置 | 存储状态 | 依据 |
|---|---|---|
| ① 提交之前 | 该标识上**没有账号** | [flows §2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)「底层不可用 → 不产生部分结果」 |
| ① 之后、③ 提交之前 | 账号**停在未激活**——[不是可用账号](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号) | [flows §2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常)「注册 2 或 3 中途失败」 |
| ① 之后、③ 提交之前，**且此后[清除链](#s-34-第二条动作链未激活到期清除)跑过** | 该标识上**没有账号**，标识**已释放** | [flows §3.1](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)「过留存期限 ⇒ 记录清除、标识释放 →（不存在）」 |
| ③ 提交之后、回执送达之前 | 账号**已激活**（注册其实已经成立） | 见下 |

**第三行是新的一行，它与第二行是同一次中断的两个时点。**
中断之后**存储状态会自己变**——不是因为有人重试，而是因为[清除链](#s-34-第二条动作链未激活到期清除)跑到了它。
因此「这次尝试结束时存储里是什么」这个问题，在 `interrupted` 这一支上**只对回执发出那一刻成立**；
发起者隔了很久再回来，看到的可能是第一行那个状态（没有账号），而不是第二行。
**[S-12](#s-12-重试规则) 因此按「重来那一刻的当前存储状态」判，不按中断时的状态判。**

**第三行是本契约推出来的，不是产品正文写的。**产品正文只描述到「中途失败」，
没有谈提交成立而回执未送达的情形。本契约**不为它新增任何承诺**：
它落在哪个结果上，完全由既有条款决定——发起者没收到成功回执，所以这次尝试是 `interrupted`
（[S-5](#s-5-终结结果集合) 没有第五个值）；他以同一标识重来时，
[S-12](#s-12-重试规则) 按存储状态判定，得到 `identifier-taken`。
这是既有条款的**推论**，登记在[缺口 G-1](#九已知缺口) 供产品负责人核对是否要另外说点什么。

> **因此不能把 `interrupted` 读成「账号一定停在未激活」。**
> 它精确的含义只有一句：**这次尝试没有取得成功回执**。

### S-7 回执不可撤销

一次尝试的终结结果一经交给发起者，**不再改写**。

`registered` 尤其如此：它是**外部效应**，内核不提供外部效应回滚（[S-24](#s-24-内核不提供由本契约兑现的表)），
本契约也不承诺补偿。保护它的办法只有一个——**回执只在提交点之后发出**
（[S-10](#s-10-激活是唯一提交点)），绝不提前。

反过来不成立：发起者收到 `interrupted` 之后，账号**可能**已经可用（[S-6](#s-6-每个终结结果的含义与对应的存储状态) 第三行）。
这不是回执被改写，是回执从来没有承诺过存储状态的反向蕴含。

## 三、完整动作链

### S-8 三步、次序与责任交接

```text
① 产生未激活账号 ──→ ② 创建个人组织与首个租户 ──→ ③ 激活
   account-identity      organization-governance      account-identity
                                                      ↑ 唯一提交点
```

| 步骤及正常/失败分支 | 当前拥有者与保护点 | 交接前提及完成条件 | 接收失败/未知时谁接续 |
|---|---|---|---|
| **① 产生未激活账号**<br>正常：标识未被占用、凭据合规 → 账号以未激活状态建立，AccountId 定下 | `capability.account-identity`。**保护点**：登录标识在整个部署内唯一的存储约束（[PF-001 §4 账号](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号)）。写入即占用标识 | **前提**：无，这是入口。**完成条件**：存在一个未激活账号，其登录标识等于本次提交的标识，且 AccountId 可被 ② 使用 | 失败分支见下三行。**结果未知时**：发起者以同一标识重来，① 的幂等边界使重来认回同一个账号（[S-9](#s-9-幂等边界)），不产生第二个 |
| ① 失败：标识已被**已激活**账号占用 | 同上 | 不交接 | **终结**：`identifier-taken`。本次尝试不改变任何东西 |
| ① 失败：标识已被**未激活**账号占用，**仍在留存期限内**，且凭据不匹配 | 同上 | 不交接 | **终结**：`identifier-taken`（[S-12](#s-12-重试规则)） |
| ① 失败：标识已被一条**已过留存期限**的未激活记录占用<br>（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 给 `identifier-held-by-expired-record`，**携带那条记录的 AccountId**，凭据匹不匹配都一样） | 同上 | **不交接，也不终结** | **本组合就地接手**：拿返回的 AccountId 跑一遍[清除链 ①②](#s-34-第二条动作链未激活到期清除)；**两步都 `ok`（含幂等）走完时**，**重跑本次尝试的 ①**一次。重跑得到的是**一个全新的 AccountId**，链条从 ② 正常续下去。清除链任一步失败时**不重跑**，收场按[按发起者分的表](#参与方失败值到终结结果的映射)定。**这条分支是「到期即可重新注册」的兑现处**，见下 |
| ① 失败：凭据不合规 | 同上 | 不交接 | **终结**：`credential-rejected`。不产生账号，也不占用标识 |
| ① 失败：输入在表示层就不合格（`invalid-input`） | 同上 | 不交接 | **终结**：`interrupted`，**并另记为一次可观测的入口缺陷**。**这不是 `credential-rejected`**：后者说的是凭据**不合规**，是一次做出来的政策判定；而这一支根本没判过（[`data.identity-values/v1#S-33`](../../../data/identity-values/v1/contract.md#s-33-表示层校验与判定分开)）。**表示层校验归注册入口**，见 [S-2](#s-2-参与方与精确承诺) 对它的要求 |
| ① 失败：存储不可用 | 同上 | 不交接 | **终结**：`interrupted`。不产生部分结果 |
| **② 创建个人组织与首个租户**<br>正常：个人组织建立，该账号在其中成员资格效力为有效、角色为超级管理员；**本组合据这次成功返回产出[激活依据](#激活依据由谁产出绑定什么)** | `capability.organization-governance`。**保护点**：「账号 → 个人组织」一一对应的存储约束；组织与首条有效成员资格**在同一次提交内**写入，[不存在「有组织但没有管理员」的中间状态](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#14-创建组织)；**并在同一次提交里现读「是否已过留存期限」**（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的前置②） | **前提**：① 已完成，AccountId 指向一个存在的账号（**不要求已激活**）。**完成条件**：该账号的个人组织存在，**且本组合手上有一份与该 AccountId 绑定、本次尝试内刚产出的激活依据** | 失败分支见下三行。**结果未知时**：重来时 ② 的幂等边界（AccountId）使已存在的个人组织被认回，**那次幂等返回同样产出激活依据**，链条从 ③ 续上 |
| ② 失败：该账号**已有**个人组织 | 同上 | — | **不是失败**：[`#S-20` 的⑦幂等返回既有的那一个](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)，视为本步已完成，**照常产出激活依据**，直接进入 ③ |
| ② 失败：账号记录**已过留存期限**（`accountRecordExpired`）或**不存在**（`accountDoesNotExist`） | 同上 | 不交接 | **终结**：`interrupted`。**不建组织**，账号或者停在未激活、或者已不存在。前者正是[清除链 ① 抢在前面](#与注册主链并发)那一格 |
| ② 失败：存储不可用（`unavailable`） | 同上 | 不交接 | **终结**：`interrupted`。**账号停在未激活**——对发起者等同于没注册成功 |
| **③ 激活**<br>正常：账号转为已激活 | `capability.account-identity`。**保护点**：激活的**前置是个人组织已存在**（[flows §3.1](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)），由本组合以**激活依据**承载；**外加 [`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 自己在同一次提交里现读的前置③「未过留存期限」**。这是本组合的**唯一提交点** | **前提**：② 已完成，且**它产出的激活依据被本组合带到了这一步**。**完成条件**：账号可用，注册成功 | **终结**：`registered` |
| ③ 失败：② 没做成，本组合手上没有依据 | 同上 | 不交接 | **不调用 ③**。账号停在未激活，本次尝试 `interrupted`。**本组合不得拿一份别的依据凑数**，也不得「反正组织应该建好了」就直接调 |
| ③ 失败：依据无效（`warrant-invalid`） | 同上 | 不交接 | **终结**：`interrupted`，**并另记为一次可观测的组合缺陷**——依据是本组合自己产出并带过来的，它无效意味着产出、携带或核实三者之一坏了，见下 |
| ③ 失败：账号记录**已过留存期限**（`account-record-expired`）或**不存在**（`account-not-found`） | 同上 | 不交接 | **终结**：`interrupted`。**不激活**。前者是「依据产出之后记录才过期」那个次序，它挡住的正是[「已激活 ∧ 无个人组织」](#s-13-一个可用账号有且仅有一个个人组织) |
| ③ 失败：存储不可用 | 同上 | 不交接 | **终结**：`interrupted`。账号停在未激活 |
| ③ 提交成立、回执未送达 | 同上 | — | **终结**：`interrupted`（[S-6](#s-6-每个终结结果的含义与对应的存储状态) 第三行）。账号已可用；重来得 `identifier-taken` |

#### 激活依据由谁产出，绑定什么

**激活依据由本组合产出，不是由治理契约产出。**
它在 [`capability.organization-governance/v1#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)
**成功返回的那一刻**由本组合铸出，**含幂等返回既有个人组织那一路**——
因为那一路断言的事实与新建那一路**逐字相同**：这个账号的个人组织现在存在。

它是 [`data.identity-values/v1#S-35`「交接凭证」](../../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)的一个实例，
**只绑定本次 AccountId**——凭证本版不绑定尝试、也不作废（`#S-35` 性质 4）。

- **绑定 AccountId** 挡住「用 A 的依据激活 B」（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置②）。
- **「同一次尝试内产出即用」是本契约对自己动作链的流程规则，不由凭证承载**：一次尝试中断之后，
  下一次尝试必须自己走一遍 ②（哪怕它走的是幂等那一路）再拿依据。
  **这不是多余的一次调用**——它正是「个人组织此刻存在」这个事实的**重新读取**。
  它不靠凭证来强制，也不需要：即便一份旧依据被拿去调 ③，
  [`#S-14` 前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 现读「是否已过留存期限」照样挡住状态已变的情形，
  而个人组织一经存在在本版不会在记录未过期时消失，重放造不成错误效果。

**[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 不核实新鲜度**（它只核存在、绑定与签发方），
所以**「同一次尝试内产出即用」这一条只有本契约能给**。本契约在此给出它。

#### 参与方失败值到终结结果的映射

[S-5](#s-5-终结结果集合) 只有四个值，而两个参与方合起来有十几个失败值。
**每一个都要在这里有落点**，否则实现会自己发明一个第五种收场。

| 参与方失败值 | 出现在哪一步 | 终结结果 | 另记什么 |
|---|---|---|---|
| `identifier-taken`（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)） | ① | `identifier-taken` | — |
| `credential-rejected`（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)） | ① | `credential-rejected` | — |
| **`identifier-held-by-expired-record`（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)）** | ① | **不终结**：跑[清除链 ①②](#s-34-第二条动作链未激活到期清除)；**两步都 `ok` 走完 ⇒ 重跑 ① 一次，按重跑的结果定**；任一步失败 ⇒ 按下面那张按发起者分的表，**不重跑** | — |
| `accountRecordExpired`（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)）／`account-record-expired`（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)） | ②／③ | `interrupted` | — |
| `accountDoesNotExist`（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)）／`account-not-found`（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)） | ②／③ | `interrupted` | **组合缺陷**：本组合刚在 ① 拿到这个 AccountId，它却不存在。除非期间跑过清除链，否则这是一次可观测的不一致 |
| `warrant-invalid`（[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)） | ③ | `interrupted` | **组合缺陷**：依据由本组合产出并携带，它无效说明产出、携带或核实坏了一处。**清除链那一侧的 `purge-warrant-invalid` 不在这一行**，它归下面那张按发起者分的表 |
| `invalid-input`（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)／[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)）、`invalidInput`（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)）——两套拼法各带本名 | ①③／② | `interrupted` | **①：入口缺陷**（登录标识或凭据的表示层校验归注册入口，它不该把这种东西交进来）。**②③：组合缺陷**（那两步的输入是 AccountId，由本组合从 ① 的结果里拿到并逐字传递，表示层被拒说明本组合传错了东西）。**清除链那一侧归下面那张表的缺陷型** |
| `unavailable`／`storage-unavailable`（注册主链的任一参与方） | ①②③ | `interrupted` | — |
| **清除链两步的全部失败值，按本名逐个列、各归其坐标**——清除链 ① [`capability.organization-governance/v1#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的**恰六个**：`accountIsActivated`／`accountNotExpired`／`organizationIsNotPersonal`／`accountDoesNotExist`（只在「账号不在、组织仍在」那一支）／`invalidInput`／`unavailable`；清除链 ② [`capability.account-identity/v1#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的**恰四个**：`not-expired`／`purge-warrant-invalid`／`invalid-input`／`storage-unavailable`。**十个值，两套拼法，不得互相冒充**：`invalidInput` 与 `invalid-input`、`unavailable` 与 `storage-unavailable` 各是两个参与方自己的值，原样带出（见 [S-34](#s-34-第二条动作链未激活到期清除) 的返回面） | 只出现在清除链 | **按发起者分两种，见下面那张表** | 见下 |

**上表里有两个同名值，分属不同参与方，不得合并**：

| 同名值 | 出自哪 | 含义 | 落点 |
|---|---|---|---|
| `accountDoesNotExist` | [`capability.organization-governance/v1#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)（注册主链 ②） | 建个人组织时账号记录不在了 | `interrupted`，**组合缺陷**（本组合刚在 ① 拿到这个 AccountId） |
| `accountDoesNotExist` | [`capability.organization-governance/v1#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)（清除链 ①） | **账号记录不在了、而个人组织还在**——它是[「个人组织存在 ⇒ 账号记录存在」被破的唯一运行期观测点](#s-35-个人组织不会变成孤儿)。**账号与组织都不在时 `#S-53` 给的是幂等 `ok`，不是这个值** | **缺陷型**，见下表 |

**清除链的失败值没有单一的终结结果，因为[它有两个发起者](#s-34-第二条动作链未激活到期清除)。**
下表按发起者分两列；**三分类本身两边共用，处置不同**：

| 三分类 | 哪几支 | **主链就地发起**（[S-8](#s-8-三步次序与责任交接) 的过期分支） | **清扫发起** |
|---|---|---|---|
| **终止型**——这是一个成立的结论 | `accountIsActivated`、`accountNotExpired`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）、`not-expired`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | **主链路径上不可达**：主链走到这里是因为 ① 刚给了 `identifier-held-by-expired-record`——那条记录**已过期**，「已过期」[单调](../../../capabilities/account-identity/v1/contract.md#s-18-读账号)，而激活要过 [`#S-14` 的前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)，所以它在这期间**既不可能变回未过期、也不可能被激活**，三支都没有来路。**出现即契约违反 ⇒ 按缺陷型处置**：`interrupted` 并另记为一次可观测的缺陷，**不重跑 ①** | **不产生终结结果**：把这个目标移出本轮候选，**不排队重试**。（清扫路径上 ① 的 `accountIsActivated`／`accountNotExpired` 是**可达的正常收场**——清扫判早了，或那个账号已经激活；② 的 `not-expired` **在清扫路径上同样不可达**（① 能 `ok` 就说明已过期，单调，此后激活不了），出现即缺陷型，两个发起者下都须报出、不重试） |
| **缺陷型**——调用方传错了东西，或次序坏了 | `organizationIsNotPersonal`、`invalidInput`、`accountDoesNotExist`（**账号不在而组织仍在**）（三者都出自 [`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）；`purge-warrant-invalid`、`invalid-input`（出自 [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | **`interrupted`**，**并另记为一次可观测的缺陷**。**不重跑 ①**——传错的那个值重跑一次还是那个值 | **不产生终结结果**：移出本轮候选**并报出来**；按抖动型无限重试只会把同一个错误刷满日志 |
| **抖动型**——没有结论 | `unavailable`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）、`storage-unavailable`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | **`interrupted`**，不重跑 ① | **不产生终结结果**：停在当前步，下一轮扫描按幂等续做 |

**「清扫发起」那一列里没有任何一格产生终结结果**——
[S-5](#s-5-终结结果集合) 的四个值是**一次注册尝试**的结果，而清扫发起的那次清除背后没有注册尝试；
清扫拿到的是[参与方失败值原样 ＋ 三分类标签](#s-34-第二条动作链未激活到期清除)。
**两列的分类判据完全相同**，不同的只是「拿到这个分类之后做什么」：主链要给发起者一个答案，清扫不用。

**「组合缺陷」「入口缺陷」那一列不改变发起者看到的东西**：他看到的仍然是 `interrupted`。
它改变的是**责任归属与可观测责任**——这几类落进 `interrupted` 的情形
**不是**正常的外部中断，而是次序、携带或输入出了问题，且各有一个具名的责任方。
**契约在这里只要求它们可被区分地记录下来**，具体的观测通道归提供者设计；
**它们不得被合并进普通的 `interrupted` 统计里**，否则一条坏掉的依据链看起来就只是「存储不太稳」。

#### 撞上一条已过期的记录时为什么由本组合接手

**这是「到期即可重新注册」这条产品判据的兑现处**，[验收原文](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)是
「停在第 1 步、等过留存期限、再用那个标识注册 ⇒ 注册得成，且得到一个全新账号」。

它**不能**靠清扫兑现：清扫[没有上界](#s-19-有前提的进展)，
而这条判据要的是**这一次尝试**就能成。
它也**不能**靠 [`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 自己
「顺手把过期记录删掉再新建」兑现：删记录之前必须先清个人组织，
而[账号身份契约不消费治理契约](../../../capabilities/account-identity/v1/contract.md#s-2-消费者与依赖方向)，
它无从发起那一步——**这正是本组合存在的理由**。

**三步是**：① 得 `identifier-held-by-expired-record` 与那条记录的 AccountId →
跑[清除链 ①（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）② （[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)）](#s-34-第二条动作链未激活到期清除) →
**重跑 ①**，此时标识已释放，走 `ClaimFresh` 那一路，得到**另一个 AccountId**。

**「重跑 ①」只有一条来路：清除链两步都 `ok`（含幂等 `ok`）走完。**
**在那条来路上，① 在一次尝试里最多重跑一次。**
重跑仍得 `identifier-held-by-expired-record`
（有别人抢在中间又注册了一条并且它也过期了，这要求一段极长的交错）⇒ **终结为 `interrupted`**，
不循环。**本契约不设重试次数参数**：一次就够，剩下的交给发起者重来。

**清除链任一步失败时，一律不重跑 ①**；收场按[那张按发起者分的表](#参与方失败值到终结结果的映射)定，分三种：

- **终止型**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的 `accountIsActivated`／`accountNotExpired`，
  [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的 `not-expired`）——
  **在主链就地发起这条路径上不可达**。理由是同一个单调事实：① 刚判过那条记录**已过期**
  （否则给的不是 `identifier-held-by-expired-record`），「已过期」不会翻回「否」，
  而激活要过 [`#S-14` 的前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)——
  所以它在清除链跑的这段时间里**既不可能未过期、也不可能已激活**，三个值都没有来路。
  **真的观察到，说明单调性被翻了回去、`#S-14` 前置③被跳过了、或 ① 压根没判过期**——
  与 [S-34 里 ② 给 `not-expired` 那一支](#s-34-第二条动作链未激活到期清除)是同一种契约违反。
  **收场按缺陷型**：终结为 `interrupted`，另记为一次可观测的缺陷，**不重跑 ①**。
  （**这三个值在清扫发起时是正常的可达收场**——清扫判早了，或那个账号已经激活；
  分类词两边共用，「不可达」只是主链这一列的事。）
- **缺陷型**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的
  `organizationIsNotPersonal`／`invalidInput`／`accountDoesNotExist`，
  [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的 `purge-warrant-invalid`／`invalid-input`）——
  **终结为 `interrupted`，并另记为一次可观测的缺陷**，**不重跑 ①**。
- **抖动型**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的 `unavailable`，
  [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的 `storage-unavailable`）——
  **终结为 `interrupted`**，不重跑 ①。发起者重来即可。

**本组合不为了让这次注册成功而绕过清除链的任何一条前置。**
「重跑 ①」不是绕过：它重新走一遍 [`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的全部前置，
得到的可能是 `identifier-taken`、可能是一个全新的 AccountId，**由那一次调用自己判**。

**三类交接关系在本链上各出现在哪里**：

- **派生与守卫**：③ 读「个人组织存在」这一事实作为准入。它是**只读派生**，
  读到的版本必须是 ② 的提交之后的版本——这条在单机由装配给，跨进程须由协议重新兑现（[S-25](#s-25-装配给的保证-vs-协议须给的保证)）。
- **同提交共写**：只在**每一步内部**存在。② 的「组织 + 首个成员资格」必须同提交，
  由 `capability.organization-governance` 兑现；**跨步之间没有同提交共写**，这正是本契约的形状。
- **提交后反应**：③ 之后向发起者发出成功回执。它是提交后的外部效应，不可回滚、不可撤销（[S-7](#s-7-回执不可撤销)）。

**不得凭「这三步写在同一个函数里」宣称原子。**它们是三次跨 owner 的提交，
把它们放进同一段代码不会产生任何原子性；本契约的正确性完全不依赖它们是否被连续执行。

### S-34 第二条动作链：未激活到期清除

**编号排在后面，是因为本版编号只追加不重排（见抬头的「条款编号」）；它与 [S-8](#s-8-三步次序与责任交接) 同级。**

```text
① 清除个人组织与首个租户 ──→ ② 清除账号记录、释放登录标识
   organization-governance      account-identity
```

**触发**：某条未激活的账号记录过了
[`capability.account-identity/v1#S-39` 的 `unactivated_retention`](../../../capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)。

**本版有两个发起者，本契约都认**：

1. **注册主链自己**——① 撞上那条记录、拿到 `identifier-held-by-expired-record` 时，
   [就地跑这条链再重跑 ①](#撞上一条已过期的记录时为什么由本组合接手)。
   **它是有界的**：一次注册尝试之内完成。
2. **清扫提供者**——按期限扫描并发起。**它发起的是本契约的清除链，不自持依据**：它不得拿着 ① 产出的依据跨过本组合直接调 ②，因此 [S-22](#s-22-编排本链的提供者被卸载或换代) 同样覆盖它——编排者换代时在途的清除链等同崩溃，旧依据无人出示；`data.identity-values/v1#S-35` 的「同进程登记随进程重启丢失」那一行对本批次因此不产生「良性丢失被记成缺陷」的情形。**多久扫一遍不在本契约**，由装配给（[G-6](#九已知缺口)）。

**两个发起者走的是同一条链、同一套幂等边界**，本契约不为它们分别定义次序。
**它们的分工是**：第 1 个兑现[「到期即可重新注册」这条验收判据](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)，
第 2 个只是卫生——把没人再来碰的过期记录收掉，让存储不要一直长。
**第 2 个不承担任何正确性**：本契约的条款一条也不挂在它身上。

本契约拥有的只有**两步的次序、每一步的幂等边界，以及它与注册主链并发时的收场**。

**清除链对发起它的人有返回面，「不发回执」说的是另一件事。**
**成功 ≝ 两步都 `ok`**（含任一步的幂等 `ok`：组织本来就不在、记录本来就不在）。
本链**没有自己的结果值类型**，返回面恰为两支：
**`ok`** ｜ **（参与方失败值原样，三分类标签）**——失败值按本名带出
（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的 `accountIsActivated`……，
[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的 `purge-warrant-invalid`……，
十个值的清单在[映射表](#参与方失败值到终结结果的映射)末行），
**加上一个三分类标签**（终止型／缺陷型／抖动型，见下），**不翻译、不归并**。
两个发起者据此各做各的处置：主链把它映射成一个[终结结果](#s-5-终结结果集合)，清扫据它决定移出候选还是下一轮续做。
**[S-5](#s-5-终结结果集合) 的四个值不适用于本链**——那是注册尝试的结果集合。
**「清除链不发回执」指的是它不对注册发起者说话**：一次由清扫发起的清除，那个人根本不知道它发生过。

| 步骤及正常/失败分支 | 当前拥有者与保护点 | 交接前提及完成条件 | 接收失败/未知时谁接续 |
|---|---|---|---|
| **① 清除个人组织**<br>正常：该账号的个人组织与它那条唯一的成员关系记录一起被删，**并产出一份清除依据** | `capability.organization-governance`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）。**保护点**：在**同一次提交内现读账号的激活状态与过期状态**——读到已激活即 `accountIsActivated`，读到未过期即 `accountNotExpired` | **前提**：该账号的记录**仍然存在**、**未激活**且**已过留存期限**（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 自己现读核实，**不信调用方的断言**）。**完成条件**：该账号名下没有个人组织，**且本组合手上有一份与该 AccountId 绑定的清除依据** | 分支见下六行（**其中一行不是失败**：账号与组织都已不在时是幂等 `ok`）。**结果未知时**：下一轮扫描重来，[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 对「已不存在」幂等返回 `ok` **并再产出一份依据**，链条从 ② 续上 |
| ① 失败：账号**已激活** | 同上 | 不交接 | **整条链终止**（**终止型**，不是抖动，重扫一万次也是同一个答案），`accountIsActivated`。**这是产品要的收场**——那个账号已经可用，它的个人组织**必须留着**。**主链就地发起时这一支不可达**（① 刚判过期、「已过期」单调、激活过不了 [`#S-14` 前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)），出现即按缺陷型处置，见[按发起者分的处置表](#参与方失败值到终结结果的映射) |
| ① 失败：账号记录**未过留存期限** | 同上 | 不交接 | **整条链终止**（**终止型**），`accountNotExpired`。清扫提供者判早了；那个人**可能正走在注册流程中**，他的个人空间**必须留着**。主链就地发起时同上一行：不可达，出现即缺陷型 |
| ① 失败：目标不是个人组织 | 同上 | 不交接 | **停在本步**，`organizationIsNotPersonal`，**并另记为一次可观测的缺陷**（**缺陷型**：调用方传错了目标，**不是一次可重试的抖动**，重扫一万次也是同一个值） |
| ① 失败：**账号记录不存在、而个人组织还在** | 同上 | 不交接 | **停在本步**，`accountDoesNotExist`，**并另记为一次可观测的缺陷**（**缺陷型**）。它是[「个人组织存在 ⇒ 账号记录存在」被破的唯一运行期观测点](#s-35-个人组织不会变成孤儿)——**账号先于组织被清了**。[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 在这一支**不删那个组织、也不产依据**；本组合**不得**为了「让它干净」补一次删除，那是在一个已知有缺陷的状态上再做一次不可逆的写。**账号与组织都已不在时不是这一支**，见下一行 |
| ① 「失败」：**账号记录不存在、个人组织也不存在** | 同上 | **正常交接** | **不是失败**：[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 幂等返回 `ok` **并产出依据**——它断言的事实（这个 AccountId 的个人组织已不存在）确实成立。链条**照常进入 ②**，② 也对「记录已不存在」幂等返回 `ok`，整条链走完。**主链就地发起时再重跑 ①**，落回一次全新注册 |
| ① 失败：账号读面或存储不可用 | 同上 | 不交接 | **停在本步**（**抖动型，重扫有意义**），`unavailable`。**什么都没删、也没有依据**；下一轮扫描重来 |
| **② 清除账号记录**<br>正常：账号记录被删，登录标识释放 | `capability.account-identity`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)）。**保护点**：删记录与释放标识**在同一次提交内**；前置里**再判一次**「未激活且已过期」，**并核实清除依据与该 AccountId 绑定** | **前提**：① 已完成，**且它产出的清除依据被本组合带到了这一步**。**完成条件**：该标识上没有账号，标识回到可注册状态 | 失败分支见下四行 |
| ② 失败：记录**未过期或已激活** | 同上 | — | `not-expired`，**两个发起者下都不可达**（① 能走完 ⇒ 已过期 ⇒ 单调 ⇒ 激活不了），**出现即缺陷型**：报出、不重试、主链 `interrupted`。**个人组织已经被 ① 删掉了**——这一支的收场见下面「两步之间崩溃」。推理见下 |
| ② 失败：输入在表示层就不合格（`invalid-input`） | 同上 | 不交接 | **停在本步**，**并另记为一次可观测的组合缺陷**：这一步的输入只有 AccountId 与依据，都由本组合从 ① 那里拿到并逐字传递 |
| ② 失败：**没有依据或依据不匹配** | 同上 | 不交接 | **停在本步**，`purge-warrant-invalid`，**并另记为一次可观测的缺陷**（**缺陷型**，不是抖动）。**什么都没删。**它意味着 ① 没做成、或有人绕过 ① 直接调了 ②——**后者正是这条依据要挡的**（见下）。**重扫不会让它好转**：依据不会自己出现 |
| ② 失败：存储不可用 | 同上 | 不交接 | **停在本步**，`storage-unavailable`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的本名，不是 ① 那边的 `unavailable`）。账号记录原样留存、标识仍被占用；下一轮扫描从 ① 重来（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 幂等返回 `ok` 并再给依据）再做 ② |

**失败要分成三类读，不能混。分类与发起者无关；[处置随发起者不同](#参与方失败值到终结结果的映射)**：

| 类别 | 哪几支 | 这一类是什么 | 清扫发起时的收场 |
|---|---|---|---|
| **终止型**——这是一个成立的结论 | ① 的 `accountIsActivated`、`accountNotExpired`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）；② 的 `not-expired`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | 那条记录**不该被清**（已经激活，或还在期限内） | **整条链终止**，重扫不会得出别的答案。清扫提供者应当**把这个目标从本轮候选里去掉**，不是排队重试。（**主链就地发起时这三支不可达；② 的 `not-expired` 在清扫路径上也不可达**，出现即按缺陷型处置——报出、不重试，见[按发起者分的表](#参与方失败值到终结结果的映射)） |
| **缺陷型**——调用方传错了东西，或次序坏了 | ① 的 `organizationIsNotPersonal`、`invalidInput`、`accountDoesNotExist`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）；② 的 `purge-warrant-invalid`、`invalid-input`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | 重扫**不会**自己好转：传错的那个值下一轮还是那个值；而 `purge-warrant-invalid` 与 `accountDoesNotExist` 各自指向一处坏掉的次序 | **停在当前步**，**并记录为一次可观测的缺陷**。清扫提供者应当**把这个目标从本轮候选里去掉并报出来**，按抖动型无限重试只会把同一个错误刷满日志 |
| **抖动型**——没有结论 | ① 的 `unavailable`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)）；② 的 `storage-unavailable`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)） | 判定根本没做出来 | **停在当前步**，下一轮扫描按幂等续做。按当时实际状态重试**是有意义的** |

> **`purge-warrant-invalid` 与 `organizationIsNotPersonal` 是评审轮二挪过来的。**
> 前者原列在抖动型，而[失败值映射表](#参与方失败值到终结结果的映射)一直把它记作**组合缺陷**——
> 两处对不上。它的含义是「① 没做成、或有人绕过 ① 直接调了 ②」，**重扫不会让它好转**。
> 后者原列在终止型，而正文自己写着「清扫提供者传错了目标」——那正是缺陷型的定义。

**`not-expired` 出现在 ② 这个位置时，只可能来自「已激活」，不可能来自「未过期」。**
推理是三步：① 能跑完，说明它当时现读到「已过期」
（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的前置，否则它会以 `accountNotExpired` 拒绝）；
「已过期」这个事实[是单调的](../../../capabilities/account-identity/v1/contract.md#s-18-读账号)，不会翻回「否」；
所以 ② 读到的「还不能清」只剩另一个来源——**那条记录在 ①② 之间被激活了**
（[`#S-38` 的两个来源写在同一个值里](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)）。

**再往下推一步，这一支在本版是到不了的**：激活要过
[`#S-14` 的前置③「未过留存期限」](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)，
而那条记录已经过期且不会翻回去，所以**它在 ①② 之间根本激活不了**。

**既然到不了，为什么还留着这一支**：因为它是那条推理**被破时的观测点**。
真的观察到 ② 返回 `not-expired`，说明上面三步里有一步不成立——
单调性被实现翻了回去、[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置③被跳过了、或者 ① 压根没现读过期状态。
**这一支因此只报不改**：不重试、不补偿、不试图把个人组织建回来
（本契约[没有这类动作](#s-34-第二条动作链未激活到期清除)），**按一次真实的契约违反记录下来**。
**把它读成「清扫判早了」是错的**——那会让人去调扫描间隔，而问题根本不在节奏上。

**把终止型当成抖动会让清扫无限重试一个永远不会成功的目标**；
把抖动型当成终止会让一条该清的记录被永久跳过。两类的区别与
[`capability.account-identity/v1#S-27`](../../../capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案)
「授权结论与『判不出来』永远是两个值」是**同一条规矩**。

#### 次序：先清组织，再清账号

**这个次序不是随手定的，反过来会破坏 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 的镜像面。**

**先清账号会留下一个没有账号的个人组织**，理由是结构性的，不是时序运气：
`capability.organization-governance/v1#S-53` 的前置要**现读账号记录**才判得出「未激活」与「已过期」。
账号记录先没了，那次读给的是「账号不存在」——而
[`#S-53` 的失败集合里没有这一支](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)，
收场只能是拒绝或 `unavailable`。**那个个人组织从此再也清不掉**，
而它对应的账号已经不存在了：这正是
[S-13](#s-13-一个可用账号有且仅有一个个人组织) 那条不变量的镜像面
（`NoOrphanPersonalOrganization`，见 [S-35](#s-35-个人组织不会变成孤儿)）被违反的样子。

**这个次序在运行期有对应物，不只是本契约的一句条款。**
① 成功时产出一份**清除依据**，而 ② 把「持有与该 AccountId 绑定的清除依据」
[写成了自己的前置](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)。
**因此「② 先跑」这件事在运行期跑不起来**：没有依据，[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 给 `purge-warrant-invalid`，什么都不删。

> **机制照抄注册主链的 ③。**那一步的前置事实（个人组织已存在）同样跨 owner，
> 同样由本组合取得并传入，那份凭证叫[激活依据](#s-8-三步次序与责任交接)。
> **两条链因此形状相同**：`capability.account-identity` [不消费治理契约](../../../capabilities/account-identity/v1/contract.md#s-2-消费者与依赖方向)，
> 凡需要治理侧事实作前置的地方，**依据都由本组合带进来，并由本组合承担正确性**。
>
> **依据只证明「组织那半已做」，不证明那条记录此刻仍然可清。**
> [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 自己的「未激活」与「已过期」两条前置**照判不误**——
> 依据是在过去某一刻产出的，而「已激活」在它产出之后仍可能发生。
> **依据是次序的凭证，不是状态的快照**；把它当通行证用会让 [`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 当场失守。

**按 ①→② 走则两步之间崩溃是安全的**：此刻状态是「账号记录还在、未激活、没有个人组织」。
它与[注册走到 ① 之后、② 之前](#s-8-三步次序与责任交接)那个状态**逐字相同**，
而那个状态本来就是[三个稳定状态之一](#s-11-失败停在哪)。收场有两个，都成立：

- **清扫再跑一轮**：[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 幂等返回 `ok`，[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 把账号记录清掉，链条走完；
- **发起者带同一标识、同一凭据回来了**：[S-12](#s-12-重试规则) 的第三行——
  ① 认回同一个 AccountId，**② 重新建一个个人组织**，③ 激活。
  注册成立，[S-13](#s-13-一个可用账号有且仅有一个个人组织) 仍然成立。

**「任一步失败就停在当前步，重扫时幂等续做」是这条链的全部恢复机制。**
本契约**不为它设补偿、不设回滚、不设任何「把删掉的个人组织建回来」的动作**——
两步各自幂等，重扫就够了。

#### 与注册主链并发

**两条链会撞在一起，交错必须有确定的收场。**准入判据只有一个，且两边用的是同一个：
**「账号未激活」这件事，由谁写谁在自己那一次提交里现读**。

| 交错 | 谁先提交 | 终态 | 为什么它满足 [S-13](#s-13-一个可用账号有且仅有一个个人组织) |
|---|---|---|---|
| **主链 ③（激活）** vs **清除链 ①（清组织）** | **主链 ③ 先** | 账号已激活，个人组织**还在**——清除链 ① 现读到「已激活」，以 `accountIsActivated` 拒绝，**整条链终止**；② 也不会被执行（它前面那一步没过） | 可用账号有个人组织 ✓ |
| 同上 | **清除链 ① 先** | 个人组织没了。**主链 ③ 此时必然被 [`#S-14` 的前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 拒绝**：清除链 ① 能跑，说明那条记录已过期，而 ③ 在自己那一次提交里现读同一个单调事实 ⇒ `account-record-expired`，**不激活**，本次尝试 `interrupted`。清除链 ② 随后把账号记录清掉 | 没有可用账号 ✓ |
| **主链 ②（建组织）** vs **清除链 ①（清组织）** | **主链 ② 先** | 组织建起来了，清除链 ① 随后把它删掉；主链 ③ 读不到个人组织 ⇒ 不激活，`interrupted`；清除链 ② 清掉账号记录 | 没有可用账号 ✓ |
| 同上 | **清除链 ① 先** | 主链 ② **必然失败**，`accountRecordExpired`（见下），**不会再建出一个组织**；本次尝试 `interrupted` | 没有可用账号，**且没有孤儿组织** ✓ |
| **主链 ①（认回记录）** vs **清除链 ②（清账号）** | **清除链 ② 先** | 记录没了，主链 ① 变成一次**全新注册**，得到**另一个 AccountId**（[S-12](#s-12-重试规则) 最后一行） | 没有可用账号，随后正常注册 ✓ |
| 同上 | **主链 ① 先** | 主链 ① 认不回来：那条记录**已过期**，[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的前置①不满足 ⇒ `identifier-held-by-expired-record`（[S-12](#s-12-重试规则) 第五行）。**主链就地跑清除链**——它与清扫提供者跑的是同一条链、同一套幂等边界，**两个发起者撞在一起也只是多一次幂等重跑**：[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 与 [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 各自对「已不存在」返回 `ok`。随后主链重跑 ①，得到**一个全新的 AccountId** | 中途没有可用账号；随后正常注册 ✓ |
| **主链 ③（激活）** vs **清除链 ②（清账号）** | **任一顺序** | **③ 跑不成**：清除链 ② 能跑，说明它前面的 ① 跑过，也就说明那条记录已过期；③ 的前置③现读同一个单调事实 ⇒ `account-record-expired`。**因此这一格没有「③ 先」的分支**——③ 在整个清除链开始之后就再也通不过了 | 没有可用账号 ✓ |

#### 为什么不会留下一个没有账号的个人组织

**这一条要单独讲，因为它是这条链最容易出错的地方，而它的收场不靠「实现小心一点」。**

危险的形态只有一个：**清除链 ① 先清掉个人组织，主链 ② 随后又建了一个，清除链 ② 再把账号记录删掉。**
组织留下了，它的账号没了——[S-35](#s-35-个人组织不会变成孤儿) 被违反，
而那条记录此后**谁也到不了**（没有账号就没有租户身份）、**谁也再清不掉**
（`capability.organization-governance/v1#S-53` 要现读账号才判得出「未激活」，账号已经不在了）。

**挡住它的不是次序，是一个单调事实**：

- 清除链 ① 能跑，说明那一刻
  [`capability.account-identity/v1#S-18`](../../../capabilities/account-identity/v1/contract.md#s-18-读账号) 读到**已过留存期限**；
- [那个字段是单调的](../../../capabilities/account-identity/v1/contract.md#s-18-读账号)——一旦为「是」，此后每一次读都是「是」；
- 而 [`capability.organization-governance/v1#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的前置②
  **要在自己那一次提交里现读它**，读到「是」就以 `accountRecordExpired` 拒绝。

**所以主链 ② 不可能在清除链 ① 之后提交成功。**
两边各读各的，**不需要跨 owner 的协调，也不需要谁等谁**——
这正是本契约[把跨边界原子提交换掉](#s-24-内核不提供由本契约兑现的表)的同一招：
**找一个单调的事实，让两边在各自的提交里读它。**

**同一招还要用第三次，在 ③ 上。**只堵住 ②，还剩一条路：
主链在清除链 ① **之前**就走完了 ②（个人组织建好、激活依据已在本组合手上），
清除链 ① 随后把组织清掉，主链这才去调 ③。
**若 ③ 只看依据，它会激活成功**——留下一个「已激活 ∧ 没有个人组织」的账号，
[S-13](#s-13-一个可用账号有且仅有一个个人组织) 当场被违反，
而清除链 ② 接着**还会**因为 [`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的前置②（未激活）改判为 `not-expired` 停住，
于是那个账号永远可用、永远没有个人空间。
**依据在这里挡不住任何东西**：它是次序的凭证，而次序确实走对了。

挡住它的是同一个单调事实的第三个读取点：
[`capability.account-identity/v1#S-14` 的前置③](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号)，
**在激活自己那一次提交里现读「是否已过留存期限」**，读到「是」就以 `account-record-expired` 拒绝。

> **这一条是评审轮一从组合层查出来的，不是产品正文写的。**
> 它在产品语言上的后果与 ② 那条同形：一次[早已过期、注定走不完的注册尝试](#s-12-重试规则)
> 得到 `interrupted` 而不是最后一步才留下一个残废的账号。
> **三个读取点缺一不可**：② 堵「① 之后又建组织」，③ 堵「② 之前就建好、① 之后才激活」，
> ① 自己堵「记录已经激活了还去清它的组织」。

> **这条前置是本轮从交错分析里推出来的，不是产品正文写的。**
> 产品只说「到期清除记录、释放标识」；「一条已过期的记录不能再被建个人组织」
> 是**规格层为了不留孤儿而加的一条**。它在产品语言上的后果很小：
> 一次[早已过期、注定走不完的注册尝试](#s-12-重试规则)得到 `interrupted` 而不是继续往下走一步再失败。

### S-9 幂等边界

**注册主链**：

| 步骤 | 幂等边界 | 重跑时发生什么 | 谁在何处保护 |
|---|---|---|---|
| ① | **[登录标识](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-identifier--登录标识--login-identifier) ＋ [留存期限](../../../capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)** | **期限之内**：同一标识上不产生第二个账号，凭据匹配时认回同一个 AccountId。**期限之外**（记录已被[清除链](#s-34-第二条动作链未激活到期清除)清掉）：不认回任何东西，**这是一次全新注册，产生另一个 AccountId** | `capability.account-identity`（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的幂等边界）＋ 存储的登录标识唯一约束 |
| ② | **AccountId** | 同一账号下不产生第二个个人组织 | `capability.organization-governance` + 存储的「账号 → 个人组织」一一约束 |
| ③ | 无需额外边界 | 已激活再激活是**无操作**，不产生二次效果 | `capability.account-identity`（激活对已激活状态幂等） |

**①的幂等边界有两半，两半都要写出来。**只写「登录标识」会让读者以为同一个名字**永远**收敛到同一个 AccountId——
而[产品要的正是它到期之后不再收敛](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)：
「过了留存期限之后另一个人用那个标识注册 ⇒ **注册得成**」。
**「幂等」在这里是有窗口的**，窗口就是那个留存期限。

**清除链**（[S-34](#s-34-第二条动作链未激活到期清除)）：

| 步骤 | 幂等边界 | 重跑时发生什么 | 谁在何处保护 |
|---|---|---|---|
| ① | **AccountId** | 个人组织已不存在 ⇒ `ok`，无二次效果 | `capability.organization-governance`（[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的⑦） |
| ② | **AccountId** | 账号记录已不存在 ⇒ `ok`，无二次效果 | `capability.account-identity`（[`#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 的幂等边界） |

两条链的每一步都各自幂等，因此**两条链都可以从任意位置安全重跑**。这一条是本契约把
「跨边界原子提交」换掉的另一半：提交点让中断不留下不一致，幂等让重来能接上。
**清除链没有提交点这一说**——它[不对注册发起者发回执](#s-34-第二条动作链未激活到期清除)，
两步都是「把一件已经成立的事实（记录已过期）落成删除」。
（它对**发起它的那一方**仍有返回面：`ok`（两步都 `ok`，含幂等）｜ 参与方失败值原样 ＋ 三分类标签，见 [S-34](#s-34-第二条动作链未激活到期清除)。）

> **对提供者的直接后果**：编排本链的插件体**必须可重复执行**。它不得把链条走到哪一步
> 这件事只留在自己的闭包里——[必需服务换提供者会使插件体先卸载再重跑](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，
> 而重跑之所以安全，靠的就是这三个幂等边界，不是靠「不要重跑」。

### S-10 激活是唯一提交点

**本组合只有一个提交点：③ 激活。**

- 在 ③ 提交之前，**没有任何可观察面上的「注册成功」**：账号未激活，
  而[未激活的账号不能用于任何交互，包括登录](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)。
- ③ 的前置是「个人组织已存在」。因此**一个可用账号必然已经有了自己的空间**——
  这正是产品要的那条不变量（[S-13](#s-13-一个可用账号有且仅有一个个人组织)）。
- 成功回执**只在 ③ 提交成立之后**发出（[S-7](#s-7-回执不可撤销)）。

**去掉这条的后果是确定的**：若账号一建立就可用，中途失败会留下一个没有个人组织的可用账号，
[它登录进来什么也做不了，而用户以为自己注册成功了](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#11-注册)。

### S-11 失败停在哪

**任何一步失败，都停在该步之前的稳定状态上，不产生部分结果，也不回滚已经提交的事实。**
逐分支见 [S-8](#s-8-三步次序与责任交接) 的表。三个稳定状态是：

```text
没有账号  →  账号未激活（标识已占用）  →  账号已激活（注册成立）
```

**只有第三个是「可用账号」。**前两个对发起者都是同一件事：这次没注册成功。

### S-12 重试规则

发起者收到 `interrupted` 之后**可以用同一标识重来**
（[acceptance §一](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)：
「注册中途失败后用同一个名字重来 → 能接着完成，不会说这个名字已经被占用了」）。
重来是**一次新的尝试**，从 ① 开始，按该标识上的**当前存储状态**判定。
**下表各行都以本次凭据合规为条件**——[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的求值次序是
**表示层 → 凭据合规 → 占用判定**，凭据不合规时**任何一行都走不到**，收场是 `credential-rejected`；
**唯一的例外是第三行**（幂等认回）：那一路只做**比对**、不重判合规，
[`#S-13` 明写认回不过 `credential_policy`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)。
「凭据匹不匹配」（与已存记录比对）与「凭据合不合规」（过政策）是两件事，下表说「匹配」时只指前者：

| 该标识上的当前状态 | 本次尝试怎么走 | 结果 |
|---|---|---|
| 没有账号 | 正常走 ①②③ | 按 [S-5](#s-5-终结结果集合) |
| 有**已激活**账号 | ① 即终结 | `identifier-taken` |
| 有**未激活**账号，**仍在[留存期限](../../../capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)内**，**凭据匹配** | ① 认回同一个 AccountId（不产生第二个），**从 ② 继续** | 按 [S-5](#s-5-终结结果集合)；正常路径下为 `registered` |
| 有**未激活**账号，**仍在留存期限内**，**凭据不匹配** | ① 即终结 | `identifier-taken` |
| 有**未激活**账号，**已过留存期限** | ① 给 [`identifier-held-by-expired-record`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 与那条记录的 AccountId（[`#S-13`](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的前置①不满足），**凭据匹不匹配都一样**。**本次尝试不终结**：本组合就地跑一遍[清除链 ①②](#s-34-第二条动作链未激活到期清除)；两步都 `ok` 则**重跑 ①**一次，落回第一行；任一步失败则 `interrupted`（[按发起者分的表](#参与方失败值到终结结果的映射)）。凭据合规是表抬头写的共同条件，「匹不匹配都一样」说的是与那条已存记录**匹配与否** | 按 [S-5](#s-5-终结结果集合)；正常路径下为 `registered`，且**是一个全新的 AccountId** |
| 该标识上原有的那条未激活记录**已被清除链清掉** | 落回第一行：正常走 ①②③，**产生一个全新的 AccountId** | 按 [S-5](#s-5-终结结果集合)；正常路径下为 `registered` |

**「到期之后重来」是一次全新注册，不是同一条链的续接。**
本人拿着同一个标识、同一份凭据回来，得到的是**另一个账号**——
[原来那条记录已经不在了，新账号与它没有任何关系](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)。
**因此「重来能接着完成」这条产品承诺是有窗口的**：
[窗口之内接着完成，窗口之外重新开始](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)，
两者都是产品要的收场，**不是一个降级**。

**第五行与第六行为什么仍然分开写**：
[`#S-13` 的前置①要求「未激活**且仍在留存期限内**」](../../../capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)，
**已过期**与**已清除**在它眼里是两件事——前者标识还被占着、记录还在，
后者标识已释放、记录已不在。**本契约[不承诺任何记录一定会被清掉](#s-3-本契约明确不承诺什么)**，
所以这两个状态都真实存在，不能合成一格。

**但两行的结果是同一个**，这是评审轮一的裁决落在这里：
第五行不再以 `identifier-taken` 终结，而是由本组合[就地跑一遍清除链再重跑 ①](#撞上一条已过期的记录时为什么由本组合接手)，
于是它**落回第六行**。**产品可观察面上因此只有一句话**：
[「过了留存期限之后另一个人用那个标识注册 ⇒ 注册得成」](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)，
**不管清扫跑没跑到它**。

**改之前这一格报 `identifier-taken`，那是一个与产品判据对不上的收场**：
它把「等过留存期限再来」变成了「等清扫跑过之后再来」，
而清扫[没有上界](#s-19-有前提的进展)——一条验收判据挂在一个没有上界的东西上，就没法验收。

**最后一行为什么不是 `credential-rejected`**：`credential-rejected` 说的是凭据**不合规**，
是一条与标识无关的规则判定；而这里凭据是合规的，只是不属于那个已经占着这个标识的账号。
把它报成 `credential-rejected` 会告诉一个不相干的人「你的凭据有问题」，而实情是这个名字已经有人在用。

**本契约不提供「验证是不是我」之外的任何续接手段**：凭据匹配是唯一的续接依据。
它不是一次登录（[未激活账号不能登录](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)），
是 ① 这一步内部的同一次凭据判定。


## 四、整体性质

### S-13 一个可用账号有且仅有一个个人组织

**不变量。**「有」由 ③ 的前置（[S-10](#s-10-激活是唯一提交点)）保护——不激活一个还没有个人组织的账号；
「仅有一个」由 ② 的幂等边界（[S-9](#s-9-幂等边界)）保护——同一 AccountId 下不建第二个。

它的另一面就是「**不存在已激活却没有个人组织的账号**」，也就是
[验收判据](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)
要排除的那第三种形态；**两面是同一条不变量**，不单列成两条。

形式对应：`ActivatedHasPersonalOrganization` ∧ `OnePersonalOrganizationPerAccount`
（见 [formal/README](formal/README.md#本版本选用什么)）。

### S-35 个人组织不会变成孤儿

**不变量。个人组织存在 ⇒ 对应的账号记录存在。**

这是 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 的**镜像面**，但**不是它的另一说法**：
S-13 说「可用账号必有个人组织」，本条说「个人组织必有账号」。
两条都被违反的形态各自不同——前者是一个登进来什么也做不了的用户，
后者是一份**谁也到不了、谁也再清不掉**的记录。

**保护点是[清除链的次序](#s-34-第二条动作链未激活到期清除)**：先 ①（清组织）再 ②（清账号）。
**它不由任何一个参与方独立兑现**：`capability.account-identity/v1#S-38`
[按契约不核实个人组织是否已被清](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)，
`capability.organization-governance/v1#S-53` 则[要现读账号记录才判得出「未激活」](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)。
**次序是本契约的条款，正如[三步的次序](#s-8-三步次序与责任交接)是本契约的条款。**

**它有三个前提，三个都由参与方条款兑现，不是一句愿望**：

1. **次序**：[`capability.account-identity/v1#S-38`](../../../capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录)
   的前置「持有与该 AccountId 绑定、且由产出方签发的清除依据」，
   而依据由清除链 ① 产出。**没有依据，② 跑不起来**——次序因此在运行期有对应物，
   不只是[本契约的一句条款](#s-34-第二条动作链未激活到期清除)。
   **这条前提本身又依赖[交接凭证不可伪造](../../../data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)**：
   依据可伪造，次序就还是一句条款。
2. **次序之间那个窗口**：[`capability.organization-governance/v1#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 的前置②
   （**该账号记录未过留存期限**，在它自己那一次提交里现读）。
   它挡住的是「① 与 ② 之间主链又建了一个组织」。
3. **一份旧依据在窗口之后仍能激活**：[`capability.account-identity/v1#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 的前置③
   （同一个单调事实，在激活自己那一次提交里现读）。
   它挡住的是「主链早已走完 ②、清除链 ① 清掉组织之后主链才去激活」——
   那条路径留下的是 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 被违反的形态，
   而它会**连带**使清除链 ② 永远停在 `not-expired`。

**这条不变量被破时有一个具名的运行期观测点，它不在本契约里。**
[`capability.organization-governance/v1#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)
的 `accountDoesNotExist` 就是它：**账号记录不在了、个人组织还在**——
除了清除链 ① 那一次现读，系统里没有别的地方会同时看到这两件事。
它在本契约里的收场是[缺陷型](#参与方失败值到终结结果的映射)：
**停在当前步，只报不改**；主链就地发起时终结为 `interrupted` 并记缺陷。

> **不要把它读成「顺手把那个组织也删了」。**判不出该不该删——
> [`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的两条前置都读账号，账号没了就无从判起。
> **也不要把它折进 `unavailable`**：那会把一次结构性缺陷伪装成一次基础设施抖动，
> 而这条不变量就此失去它唯一的观测点。

理由与完整的交错走查在
[S-34 的「为什么不会留下一个没有账号的个人组织」](#s-34-第二条动作链未激活到期清除)。
**三个前提各去掉一个，本条或 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 立刻失效**——
[行为模型对前两处各有一个变异核对](formal/README.md#变异核对证明不变式不平凡)，第三处由 `Activate` 的
`warrant` 与 `~expired` 两个守卫各承一半、**各有一个变异核对**，**全部必须出反例**。
让「已过期」这个事实变得可以翻回「否」，会把上面三条路径同时打开。

形式对应：`NoOrphanPersonalOrganization`，在 [`crash.cfg`](formal/crash.cfg) 下检查——
**必须在故障与并发全开的那个配置里检查**，无故障的配置碰不到那个交错。

### S-14 一个登录标识上至多一个账号

**不变量。**由 ① 的幂等边界与存储的登录标识唯一约束共同保护（[S-9](#s-9-幂等边界)）。

它的安全面是「**同一个登录标识上绝不出现两个不同的账号**」——
出现了就意味着[登录时无法确定是谁](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)。

形式对应：**没有**。行为模型把「这个标识上的账号」建模成了单个变量，
**这条不变量被建模方式吸收了**（见 [formal/README](formal/README.md#模型吸收了哪一条不变量)）；
它的证据形式是规范场景 [S-31](#s-31-规范场景两个同标识并发注册)，不是模型检查。

### S-15 激活不回退

**不变量。**已激活的账号不会变回未激活，也不会消失。
由 `capability.account-identity` 的数据形状兑现——那里没有这条写路径
（[flows §3.1](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#31-账号)：本版无注销）。

形式对应：模型中 `account` 没有从 `"activated"` 出发的转移。

### S-16 中断绝不被呈现为成功

**安全性质。绝不能发生**：一次没有走到 ③ 提交的尝试，收到了 `registered`。

保护点：回执只在提交点之后发出（[S-7](#s-7-回执不可撤销)、[S-10](#s-10-激活是唯一提交点)）。
依据：[acceptance §二](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#二绝不能发生的事)
「注册、登录失败却显示成功，或把数据接进了另一个账号」。

形式对应：`NoFalseSuccess`，且**必须在故障注入下检查**——无故障的配置证明不了这一条。

### S-17 已发出的成功回执不被撤回

**安全性质。绝不能发生**：一份已发出的 `registered` 被撤回，或它所指的账号随后变得不可用。

保护点：[S-7](#s-7-回执不可撤销) + [S-15](#s-15-激活不回退)。前者管回执，后者管账号；
两者缺一，「注册成功」就会变成一句可以反悔的话。

### S-18 回执侧不承诺唯一

**同一标识上的两次尝试可以都得到 `registered`。**当它们持同一份匹配的凭据时，
第二次在 ① 认回同一个 AccountId、在 ② 认回同一个个人组织、在 ③ 做一次无二次效果的激活——
它们注册的**是同一个账号**，两份成功回执说的是同一件事实。

本契约承诺的是**状态侧的唯一性**（[S-13](#s-13-一个可用账号有且仅有一个个人组织)、[S-14](#s-14-一个登录标识上至多一个账号)），
**不是回执侧的唯一性**。要求「至多一次成功回执」需要为回执本身建立一个去重边界，
而产品没有提出这个要求；按最小正确模型不预埋。

### S-19 有前提的进展

**一次已经开始的注册尝试，最终到达[四个终结结果](#s-5-终结结果集合)之一。**

前提（缺一不可，且都不由本契约兑现）：

| 前提 | 由谁兑现 | 失效时 |
|---|---|---|
| (a) 部署可访问——发起者能把请求送到 ① | 环境假设 | 尝试根本没开始，本性质的前件不成立 |
| (b) 发起者不放弃 | 环境假设，**系统无法观察**（[S-3](#s-3-本契约明确不承诺什么)） | 尝试永远停在中途，未激活记录原样留存 |
| (c) 存储最终持续可用 | 两个参与方各自的存储提供者 | 尝试以 `interrupted` 收场；这**仍是**一个终结结果，因此本性质不被违反 |
| (d) 两个参与方的服务面都能被解析到 | 装配 | 同 (c) |

**「记录会不会过期」不是本性质的前提。**过期之后每一步都有具名的收场——
② 给 `accountRecordExpired`、③ 给 `account-record-expired`、① 给 `identifier-held-by-expired-record`
并由[本组合就地接手](#撞上一条已过期的记录时为什么由本组合接手)——
**它们都通向某个终结结果**，因此不会让这条性质失效。
**这一条是评审轮一补上 [S-8](#s-8-三步次序与责任交接) 的过期分支之后才成立的**：
在那之前，一条走到 `claimed` 的尝试碰上过期会卡住，那时「记录不过期」确实得算一条前提。

**这条性质没有上界，本契约也不给一个。**给不出上界的原因是 (a)(b) 两条前提在系统侧不可观察，
任何上界都会变成一句无法被反例否定的话。它的可检查形式是
[formal/README](formal/README.md#本版本选用什么) 里的 leads-to：
`pc ≠ "start" ⤳ outcome ∈ 终结结果`，**在显式公平性与 (b)(c) 被写成常量取值的前提下**由 TLC 检查
（`Abandoning = FALSE` 是 (b)，`Failures = FALSE` 是 (c)；
**`Expiring` 不在前提里，[`progress.cfg`](formal/progress.cfg) 因此把它开着**）。
**(d) 没有被建模**：模型里两个参与方的动作恒可发生，**它是模型的一条假设，不是被检查的前提**，
如实记在 [formal/README](formal/README.md#本版本选用什么)。

> **① 撞上一条已过期记录的那一支，不在 `EventualOutcome` 的前件内。**
> 前件是 `pc[a] # "start"`，而模型里那一格的尝试**留在 `"start"`**
> （`ClaimExpired(a)` 是[守卫谓词，不是动作](formal/README.md#语义映射)）——
> **TLC 对那一支什么也没说**。
>
> **这不是模型的漏洞，是分工，而且必须写出来**：那一支的进展由
> [S-8](#s-8-三步次序与责任交接) 的分支表承担——就地跑清除链，两步都 `ok` 则**重跑 ① 一次**并按重跑的结果终结，
> 任一步失败则按[清除链的三分类](#参与方失败值到终结结果的映射)终结为 `interrupted`；
> 它的**证据是[验证入口登记的规范场景](../verification.md#证据义务)**，不是 `EventualOutcome`。
> **因此不得把 [`progress.cfg`](formal/progress.cfg) 无反例读成「撞上过期记录的尝试也一定会走到终结结果」。**

**「标识未占用」「凭据合规」不是本性质的前提。**它们是到达 `registered` 而非
「某个终结结果」的条件；`identifier-taken` 与 `credential-rejected` 同样是产品要的收场
（[flows §2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) 每一行都可重试），
把它们写进前提会把这条性质缩成只谈成功路径。

### S-20 收敛

**中途失败之后不再重试时，系统收敛到两种形态之一，没有第三种：**

```text
账号已激活 ∧ 该账号恰有一个个人组织     （注册成立）
              或
该标识上不存在可用账号                   （注册未成立；账号或者不存在，或者停在未激活）
```

这逐字对应[验收判据](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#三判据)：
「在第 1、2 步之间任意位置中断，检查结果：要么账号可用且有个人组织，要么没有可用账号。**不存在第三种**」。

**这条判据约束的是存储状态，不是回执。**账号可用而某次尝试收到 `interrupted`
（[S-6](#s-6-每个终结结果的含义与对应的存储状态) 第三行）仍属第一种形态——
它没有留下「有账号但没有个人空间」的用户，那才是这条判据要排除的东西。

形式对应：`ConvergentOutcome`。**它在逻辑上是 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 与
[S-16](#s-16-中断绝不被呈现为成功) 在静止点上的投影，不是一条独立证据**，
单独检查的理由与其局限写在 [formal/README](formal/README.md#convergentoutcome-不是一条独立性质)。

## 五、并发、撤除与替换

### S-21 两个同标识的注册并发发生

允许的交错与裁决者：

- **① 与 ① 并发**：由**存储的登录标识唯一约束**裁决，本契约不另设协调。
  先成者建立未激活账号；后成者不产生第二个账号，按 [S-12](#s-12-重试规则) 的表继续——
  凭据匹配则从 ② 接着走，不匹配则 `identifier-taken`。
- **② 与 ② 并发**（同一账号）：由**「账号 → 个人组织」一一约束**裁决。
  先成者建立个人组织；后成者认回它，不产生第二个——
  [S-13](#s-13-一个可用账号有且仅有一个个人组织) 的「仅有一个」就落在这里。
- **③ 与 ③ 并发**：激活对已激活是无操作，两次都成功，
  [两份回执说的是同一件事](#s-18-回执侧不承诺唯一)。
- **② 与 ③ 交错**：③ 的前置是**现读**的。若 ③ 在 ② 提交之前读，前置不成立 → 不激活，`interrupted`；
  **不存在「读到一半的个人组织」**——② 是单次提交。

**没有任何交错能产生「可用但没有个人组织的账号」**：唯一把账号变可用的动作是 ③，
而它的前置在同一次判定里被现读。这一条由 [formal/](formal/README.md) 的 `crash.cfg`
在三次并发尝试的全部交错上检查。

### S-22 编排本链的提供者被卸载或换代

**本组合不拥有任何事实。**它没有自己的存储，走到哪一步这件事不构成一条需要被保存的记录。

因此编排者被卸载、换代或重跑时：

- **在途的那次尝试停在它当时所在的位置**，与一次崩溃**完全等同**：
  已提交的事实留存，未提交的不产生，不回滚、不补偿、不清理。
- 发起者得到 `interrupted`，或者什么也收不到（回执随编排者一起消失）；
  两种情况下他的处置相同——**以同一标识重来**，按 [S-12](#s-12-重试规则) 续上。
- **不得**为此引入「把链条状态存下来以便续跑」的机制。那会造出一个新的、
  需要自己的生灭与清理的长命对象，而三个幂等边界已经使重来安全（[S-9](#s-9-幂等边界)）。

### S-23 参与方缺席时哪项保证暂停、哪项继续

| 缺席的是 | 暂停的保证 | 继续成立的保证 |
|---|---|---|
| `capability.account-identity` | ①③ 无法进行 → **进展性质 [S-19](#s-19-有前提的进展) 暂停**；不再有新的 `registered` | [S-13](#s-13-一个可用账号有且仅有一个个人组织) 至 [S-18](#s-18-回执侧不承诺唯一) 全部。已激活的账号不因此变得不可用 |
| `capability.organization-governance` | ② 无法进行；③ 的前置**读不到** → 进展性质暂停 | 同上。**尤其是 [S-13](#s-13-一个可用账号有且仅有一个个人组织)**：读不到个人组织时 ③ **不激活**，因此「可用但没有个人空间」依然不会出现 |
| 两者都缺席 | 所有尝试以 `interrupted` 收场 | 同上 |

**缺席时的默认答案一律是明确失败，不放行。**③ 的前置读不到时**不得**按「大概已经建好了」放行——
那正好制造出 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 要排除的那种账号。这一条与
[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)
「目标范围不可用时明确失败，不静默回退」是同一条规矩。

## 六、内核不提供的部分

### S-24 内核不提供、由本契约兑现的表

| 内核不提供 | 本组合需要吗 | 本契约怎么兑现 |
|---|---|---|
| **跨 fiber 事务 / 跨边界原子提交** | 需要「账号 + 个人组织 + 激活」一起成立 | **不用。**改写成「[唯一提交点](#s-10-激活是唯一提交点) + [三步各自幂等](#s-9-幂等边界)」，从可观察面上取消不一致状态 |
| **外部效应回滚** | 成功回执是外部效应 | **不承诺。**保护手段是让回执只在提交点之后发出（[S-7](#s-7-回执不可撤销)）；区分清楚：本契约有**幂等重试**，没有恢复、补偿或撤销 |
| **持久化与崩溃恢复** | 三步事实必须跨重启成立 | 三步各自落在各自 owner 的**单次提交**里；崩溃后**以幂等重试收敛**（[S-9](#s-9-幂等边界)、[S-12](#s-12-重试规则)、[S-20](#s-20-收敛)）。本契约不设恢复动作 |
| **时序保证** | 需要三步的先后 | **不依赖内核。**次序是本契约的条款（[S-8](#s-8-三步次序与责任交接)），并由每一步的前置条件强制：② 要 AccountId，③ 要个人组织存在 |
| **背压与流控** | 不需要 | **不承诺。**[注册限流是明确的非目标](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#四本版不验收的) |
| 可靠投递 | 不需要 | 本组合没有投递语义。回执不是投递保证——[S-6](#s-6-每个终结结果的含义与对应的存储状态) 第三行正是回执可能到不了的那一行 |
| 权限边界 / 沙箱 | 不需要 | 注册不做准入判定（[S-3](#s-3-本契约明确不承诺什么)） |
| 有序的异步清理 | 不需要 | 本契约不清理未激活记录（[S-3](#s-3-本契约明确不承诺什么)） |
| 跨进程的身份与可见性 | 需要（[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)） | 本链上的身份全部来自存储或产品（登录标识），**无一来自运行时**；跨进程后由 [S-25](#s-25-装配给的保证-vs-协议须给的保证) 右列重新兑现 |

## 七、装配给 vs 协议给

### S-25 装配给的保证 vs 协议须给的保证

| 保证 | 本版（单机）由谁给 | 跨进程之后谁重新兑现 |
|---|---|---|
| ③ 的前置检查读到的是 ② 提交之后的事实（同节点顺序可见） | **装配给**：两个参与方的读写落在同一节点、同一存储的可见性域内 | **协议给**：须定义「个人组织存在」这一读数的新鲜度界，并写明超界时的收场（按缺席处理，即不激活）。**界未定义前不得跨节点执行 ③** |
| ① 的幂等边界：同一登录标识至多一个账号 | **装配给**：单节点存储的唯一约束 | **协议给**：跨节点的标识分配必须重新兑现唯一性；两节点各自「检查后写入」不构成唯一约束 |
| ② 的幂等边界：同一账号至多一个个人组织 | **装配给**：同一存储的一一约束 | **协议给**：同上 |
| ② 内部「组织 + 首条有效成员资格」同提交 | **装配给**：单次存储提交的原子性 | **协议给**：归 `capability.organization-governance`，不在本契约 |
| **三步的次序** | **不是装配给的**——它是本契约的条款 [S-8](#s-8-三步次序与责任交接)，由每步的前置条件强制 | **不变。**这是把次序写成契约而不是写成「调用顺序」的收益：它不随部署形态改变 |
| 中断不留下不一致状态 | **不是装配给的**——它由 [S-10](#s-10-激活是唯一提交点) 的提交点位置决定 | **不变。**提交点是语义位置，不是物理位置 |
| **[`capability.organization-governance/v1#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 只由本组合调用** | **装配给**：那条操作自己**没有授权前置**，它在本版成立靠的是「只有本组合的清除链够得着它」 | **协议给**：跨进程后「够不着」不再成立，须在接收边界鉴别调用方并为它定义授权。**做不到就等于给了一条直接删任何账号个人组织的入口**——它前面那三条现读（未激活、已过期、是个人组织）挡得住误删，**挡不住有权限的人删错目标** |
| **三个「是否已过留存期限」读取点读到同一个答案**（[`#S-20`](../../../capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 前置②、[`#S-14`](../../../capabilities/account-identity/v1/contract.md#s-14-激活账号) 前置③、[`#S-53`](../../../capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的现读） | **装配给**：同一时间源 ＋ 同一参数源，见 [`capability.account-identity/v1#S-30`](../../../capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) | **协议给**：同上那份契约的右列。**[S-35](#s-35-个人组织不会变成孤儿) 与 [S-13](#s-13-一个可用账号有且仅有一个个人组织) 的三个前提全部挂在这一条上**，它失效时两条不变量一起失效，且**失效是静默的**：每个节点各自都自洽 |

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)
要求领域语义在分布式演化中不变，因此右列不是「以后再说」，而是**本契约已经记下的待兑现项**；
未兑现的部分登记在[缺口 G-3](#九已知缺口)。

## 八、规范表达与证据义务

### S-26 本版选用的形式工件

本契约**触发了行为模型的义务**：它自定义了一条跨 owner 的提交协议
（[唯一提交点 + 幂等重试](#s-10-激活是唯一提交点)），并**以该协议为依据省略了跨边界事务**。
按组合性质的门槛，「依赖某性质省略或放宽控制」必须给出覆盖所声明范围的行为模型与关键性质检查；
局部通过不能替代整体保证，有限范围的检查也不能表述为无条件证明。

选用：**TLA+ 行为模型 [`formal/Registration.tla`](formal/Registration.tla)**，三个检查配置
[`basic.cfg`](formal/basic.cfg)、[`crash.cfg`](formal/crash.cfg)、[`progress.cfg`](formal/progress.cfg)。
条款 → 不变式 → 配置的映射在 [`formal/README.md`](formal/README.md)。

**不选用 Alloy**：本契约没有需要在给定规模上找结构反例的关系约束——
「一个账号一个个人组织」是一条计数约束，在行为模型里就是一个不变式，
另建一份结构模型只会产生第二份需要同步的说法。

**不建 Schema**：本契约不拥有任何交换或存储的数据形状（[S-3](#s-3-本契约明确不承诺什么)）。

### 规范场景

场景约束消费者可观察的结果，与行为模型分工不同：模型检查全部交错，场景检查**真实组合**。
执行状态在[验证入口](../verification.md)，不写进本版本目录。

### S-27 规范场景：中途失败后用同一标识重来

走完 ①，在 ② 提交之前注入存储故障，观察到 `interrupted`；随后**以同一标识、同一凭据**重来。
**必须观察到**：重来**不**报 `identifier-taken`，而是从 ② 接着走到 `registered`；
结束时该账号**恰有一个**个人组织。

依据：[acceptance §一](../../../../product/PF-001-identity-scope-and-agent-constraints/acceptance.md#一可观察场景)
「注册中途失败后用同一个名字重来 → 能接着完成，不会说这个名字已经被占用了」。

### S-28 规范场景：在任意位置中断没有第三种形态

分别在 ① 之后、② 之后、③ 提交之前三个位置中断，且**此后不再重试**。
**必须观察到**：每一次检查的结果都落在 [S-20](#s-20-收敛) 的两种形态之一；
特别地，**没有任何一次**出现「账号可用但没有个人组织」。

### S-29 规范场景：参与方缺席时不放行

让 `capability.organization-governance` 不可用，然后驱动一次注册走到 ③。
**必须观察到**：③ 的前置读不到 → **不激活**，结果为 `interrupted`，账号停在未激活。
**绝不能观察到**：读不到时按「大概已经建好了」放行（[S-23](#s-23-参与方缺席时哪项保证暂停哪项继续)）。

### S-30 规范场景：编排者被卸载在途尝试等同崩溃

在 ① 与 ② 之间卸载编排本链的提供者。
**必须观察到**：账号停在未激活；**没有**任何清理动作发生；
以同一标识重来能接着完成（同 [S-27](#s-27-规范场景中途失败后用同一标识重来)）。

### S-31 规范场景：两个同标识并发注册

同一标识、同一凭据的两次尝试并发进行。
**必须观察到**：只产生一个账号、一个个人组织；
两次尝试**都可以**是 `registered`（[S-18](#s-18-回执侧不承诺唯一)）。
换成**不同凭据**的两次并发：先成者继续，后成者 `identifier-taken`。

**这条场景是 [S-14](#s-14-一个登录标识上至多一个账号) 的唯一证据形式**——
它在行为模型里被建模方式吸收了，模型检查不覆盖它。

## 九、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **③ 提交成立而回执未送达**的情形，产品正文未述。本契约按既有条款推出收场（[S-6](#s-6-每个终结结果的含义与对应的存储状态) 第三行 + [S-12](#s-12-重试规则)：这次尝试 `interrupted`，重来得 `identifier-taken`），**没有新增承诺**；但产品可能想要别的表现，例如回执可补发、或重来时给一句「你已经注册好了，去登录」 | PF-001 的 owner | 产品正文明确这一情形的表现，或确认「按既有条款推论办」 |
| G-2 | **「凭据不合规」的规则内容未定。**[flows §2](../../../../product/PF-001-identity-scope-and-agent-constraints/flows.md#二分支与异常) 只说「具体哪条规则不满足」，规则本身是政策 | 产品负责人 + `capability.account-identity` | 规则定下并落在 `capability.account-identity`；本契约的 `credential-rejected` 语义不变，**不需要新版本** |
| G-3 | **跨进程的读数新鲜度界未定义**（[S-25](#s-25-装配给的保证-vs-协议须给的保证) 右列第一行），标识与个人组织两个幂等边界的跨节点兑现方式同样未定义。**清除链把它再推进一格**：[S-35](#s-35-个人组织不会变成孤儿) 依赖「已过期」这个事实被两边**各自现读**到同一个答案，跨节点之后须定义它的传播界 | 架构设计（本版单机不阻断） | 分布式演化启动时给出新鲜度界与跨节点唯一性协议，并作为本契约的**新版本**发布 |
| G-4 | **已闭合（2026-09-22）**：本契约与两个参与方契约均已登记进 catalog（状态 `candidate`），两条依赖项带 [S-2](#s-2-参与方与精确承诺) 列出的 `clauses`。编号保留不重排，与条款编号同一规矩 | — | — |
| G-5 | [S-9](#s-9-幂等边界) 对提供者的后果引用了 [`basis/cordis/plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，而**该条目的 probe 为 null，是待核对主张** | kernel 侧首个集成包 | 补上会失败的 probe，或改写该条依赖。**本契约的正确性不依赖它**——幂等边界的依据来自产品正文的提交点，那条 basis 只是说明这个形状对重跑是安全的 |
| G-6 | **清扫提供者的发起者与节奏未定。**[S-34](#s-34-第二条动作链未激活到期清除) 拥有清除链的次序与幂等，但**谁来跑、多久扫一遍、扫描本身失败了怎么办**归装配，而架构与提供者设计尚未开始。后果是[那条进展性质没有上界](#s-19-有前提的进展)：**本契约不承诺任何一条到期记录一定会被清掉**。**评审轮一之后这条缺口降级为卫生义务**：清扫**不再承担任何验收判据**——[「到期即可重新注册」由注册主链自己兑现](#撞上一条已过期的记录时为什么由本组合接手)。它剩下的作用只有一个：把没人再来碰的过期记录收掉，让存储不要一直长 | 架构与提供者设计 | 装配给出清扫的发起方式与节奏，并说明它自身的失败与重入。**本契约的条款不因此改变**——两步各自幂等，重扫就够了。**这条缺口开着不阻断任何验收** |
| G-7 | **已闭合（2026-09-22）**：catalog 已给本契约补上第三条依赖项（坐标 `data.identity-values` v1，`clauses: S-1, S-2, S-35`），与抬头的「精确语义依赖」逐条一致。编号保留不重排，与条款编号同一规矩。**`covers.json` 不在本条的闭合条件里**——`acceptance.md#三判据` 那一行曾缺 [S-12](#s-12-重试规则) 与 [S-34](#s-34-第二条动作链未激活到期清除)，评审轮二后已由主线补登记（2026-09-22） | — | — |

**本版关掉了一条缺口，它不再出现在上表**（关掉它的是 PF-001 **rev 12**；
**本契约当前的设计依据是 rev 15**，见抬头与
[该 topic 的 changelog](../../../../product/PF-001-identity-scope-and-agent-constraints/changelog.md)）：

| 原编号 | 原来是什么 | 现在怎么了 |
|---|---|---|
| 旧 G-2 | **未激活记录的留存没有期限，标识因此被长期占用**；产品正文没说过另一个人能不能用这个名字 | **闭合。**rev 12 给了答案：[期限按部署配置，到期清除记录并释放登录标识，到期之后另一个人可以用](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#未激活的账号记录不会永久占着那个名字)。按那条缺口自己写的闭合条件，**它是一条新的产品规则**，本契约据此新增[第二条动作链 S-34](#s-34-第二条动作链未激活到期清除)、新的不变量 [S-35](#s-35-个人组织不会变成孤儿)，并改写了 [S-3](#s-3-本契约明确不承诺什么)／[S-6](#s-6-每个终结结果的含义与对应的存储状态)／[S-9](#s-9-幂等边界)／[S-12](#s-12-重试规则)。**语义确实变了**——只是本契约仍是未登记的候选版本，[所以变化落在 v1 上，不另发版本](#s-32-本版是首版) |

## 十、版本差异与规范工件

### S-32 本版是首版

没有被采用的旧版本，因此没有语义或表示差异可记。

**2026-09-22 评审轮一的修订同样直接落在 v1 上，不发布第二个版本**——
本契约仍是 `candidate`，未接受、未冻结，[不可原地覆盖的是已发布规格](../../../README.md)。
本轮改的是：[S-8](#s-8-三步次序与责任交接) 的分支表（过期那一路、失败值映射、激活依据的产出端）、
[S-12](#s-12-重试规则) 第五行、[S-34](#s-34-第二条动作链未激活到期清除) 的两个发起者与交错表、
[S-35](#s-35-个人组织不会变成孤儿) 的前提由两条改为三条、[S-19](#s-19-有前提的进展) 的前提、
[S-25](#s-25-装配给的保证-vs-协议须给的保证) 新增两行，以及**行为模型与 `progress.cfg`**。
**模型改了，[上一次 TLC 运行的结论不再适用](../verification.md#实际执行)。**

**2026-09-22 评审轮二的修订同样直接落在 v1 上。**本轮改的是：
抬头的依据 rev（12 → 13）与「精确语义依赖」、[S-2](#s-2-参与方与精确承诺) 的消费 clauses（补 `#S-19`／`#S-39`）、
[S-8](#s-8-三步次序与责任交接) 的[失败值映射表](#参与方失败值到终结结果的映射)（末行按发起者拆两列、同名值分辨表）、
[S-12](#s-12-重试规则) 第五行的凭据合规条件、
[S-34](#s-34-第二条动作链未激活到期清除)（清除链的返回面、① 的两支「账号记录不存在」、失败分类由两类改三类）、
[S-19](#s-19-有前提的进展)（① 过期支不在 `EventualOutcome` 前件内）、
[S-35](#s-35-个人组织不会变成孤儿)（写明唯一的运行期观测点），以及 `formal/README.md` 的对应几处。
**[`Registration.tla`](formal/Registration.tla) 与三个 `.cfg` 一个字节没改**，
因此 [run `-2` 的三行结论全部仍然适用](../verification.md#实际执行)。

**2026-09-22 评审轮三的修订同样直接落在 v1 上。**本轮改的是：
[失败值映射表](#参与方失败值到终结结果的映射)的清除链行（十个失败值按本名带坐标；
**「主链就地发起 × 终止型」改为「主链路径上不可达，出现 ⇒ 缺陷型」**）、
[S-8](#s-8-三步次序与责任交接) 的过期分支与「重跑 ① 只在两步都 `ok` 走完那一路」、
[S-12](#s-12-重试规则) 表抬头的凭据合规条件、[S-34](#s-34-第二条动作链未激活到期清除)（返回面补成功侧、两张表的失败值本名）、
[S-19](#s-19-有前提的进展) 那句边界、[S-2](#s-2-参与方与精确承诺) 的 account-identity clauses 补 `#S-41`／`#S-42`／`#S-43`（引用即消费），
以及 `formal/README.md` 的一句说明；**跨包同改**：撤销「清除依据一次性」，凭证只绑定 AccountId、不再绑定本次尝试，「同一次尝试内产出即用」降为本组合 [S-8](#s-8-三步次序与责任交接) ② 的流程规则（[S-2](#s-2-参与方与精确承诺) 保证列、[激活依据由谁产出](#激活依据由谁产出绑定什么)）。**模型与三个 `.cfg` 仍然一个字节没改**，run `-2` 的结论照旧；`Registration.tla:224` 注释仍写「与本次尝试绑定」，**有意留置**以保住 run `-2` 输入快照逐字节相同，下次模型语义改动时一并修。
**「不可达」不改模型**：模型里两步清除本来就不区分发起者，主链就地发起那一列的处置从来不在模型的语义里。

2026-09-17 曾在 PF-001 rev 1 上建过一批候选契约（含一份同名的注册组合与一份 `Registration.tla`），
**已于 2026-09-22 由产品负责人整体废弃**；它们从未被接受或冻结，
**不构成本契约的前身，本契约不继承其任何条款，形式模型也从条款重新建立**，
不与之建立 lineage 关系。见[规格容器的当前状态](../../../README.md#当前状态)。

### S-33 本版的规范工件

本文件与 `formal/` 下的 [`Registration.tla`](formal/Registration.tla)、
[`basic.cfg`](formal/basic.cfg)、[`crash.cfg`](formal/crash.cfg)、[`progress.cfg`](formal/progress.cfg)；
与 catalog 登记的 `resources` 一致。[`formal/README.md`](formal/README.md) 是导航页，**不是规范工件**、不进冻结面。

**三个检查配置本身是规范工件**：它们固定了模型的常量取值，也就固定了每条性质被检查的范围；
改变范围等于改变本契约所声称的证据边界，须发布新版本。

接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。
