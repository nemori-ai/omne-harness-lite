# 2026-09-22 · 租户相关领域的形式工件第二次执行（评审轮一修订之后）

租户相关领域五份候选契约**经评审轮一逐条修订**，其中两份带形式工件的模型也被改过。
本次把这批工件**全部重跑了一遍**：组织治理的 TLA+ 行为模型（两个配置）与 Alloy 结构模型（四条命令）、
账号注册组合的 TLA+ 行为模型（三个配置）。

这是[同一批任务的第二次执行](../README.md#组织)，run id 按同日同范围的规矩加 `-2`。
**上一次 run 留在原地不改写**：[`2026-09-22-formal-tenant-domain/`](../2026-09-22-formal-tenant-domain/README.md)。

五份契约仍是 `candidate`，**通过不提升任何一份的状态**——
[接受由 decisions 完成，采用登记由 registry 完成](../README.md#读取与引用纪律)。

## 为什么重跑

**因为模型改了，而上一次 run 的输入快照记的是改之前的文件。**
逐文件对照如下——sha256 取自两次 run 各自 `input/` 下的 `SHA256SUMS`，
**本次六份快照又与当前 `spec/` 下的同名文件逐字节相同，写这份记录时核对过**：

| 文件 | 上一次 run | 本次 | 改了吗 |
|---|---|---|---|
| `Membership.tla` | `5c7656a4…` | `5c7656a4…` | **没改** |
| `Membership.cfg` | `abaa8fa2…` | `abaa8fa2…` | **没改** |
| `Membership_NoSerialization.cfg` | `8b063182…` | `8b063182…` | **没改** |
| `Affiliation.als` | `b42413d6…` | `7e25524f…` | **改了** |
| `Registration.tla` | `63acaf36…` | `83bc2f8c…` | **改了** |
| `basic.cfg` | `38198123…` | `38198123…` | 没改 |
| `crash.cfg` | `2a77296a…` | `2a77296a…` | 没改 |
| `progress.cfg` | `fdcaff56…` | `6c1a4b3d…` | **改了** |

改动逐条是什么：

- **`Registration.tla`**（[账号注册组合](../../../spec/compositions/account-registration/v1/formal/README.md)）
  - **新增 `warrant` 变量**，按 `Attempts` 索引：`OrganizeOk` 成功时置真，`ClaimFresh` **把全部依据清零**
    （依据绑定的是上一条记录的 AccountId）。
  - **`Activate` 拆成 `ActivateOk` ＋ `ActivateRejected`。**守卫由 `orgCount >= 1`
    改为 `warrant[a] ∧ ~expired`——评审轮一判定原守卫是错的：
    [`#S-14` 按契约读不到组织那一侧](../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号)。
  - **`Organize` 拆成 `OrganizeOk` ＋ `OrganizeRejected`**，后者在到期或记录不在时终结为 `interrupted`。
  - **`ClaimExpired(a)` 守卫谓词从 `ClaimTaken` 里减出去**：碰上已过期的未激活记录**不终结**这次尝试，
    就地跑清除链再重跑 ①。
  - 不变量 `ActivatedHasPersonalOrganization` 与 `NoOrphanPersonalOrganization` 的注释随之改写。
- **`progress.cfg`**：`Expiring` 由 `FALSE` 改为 **`TRUE`**。
  理由写在配置文件自己的注释里：补上两条 `Rejected` 分支之后，到期**不是**
  [S-19 的前提](../../../spec/compositions/account-registration/v1/contract.md#s-19-有前提的进展)，
  它只把尝试推向 `interrupted`，而 `interrupted` 也是终结结果——**关掉它反而缩小检查范围**。
- **`Affiliation.als`**（[组织治理](../../../spec/capabilities/organization-governance/v1/formal/README.md)）
  - **`run aNonTrivialTree` 的 pred 加了 `acyclic[c]` 前件。**
  - 抬头与两个谓词的注释补上 `data.identity-values/v1#S-14`／`#S-15` 的**精确坐标**
    （两个谓词的定义式归身份值契约，本模型是引用）。**只是注释，断言式未变。**

**`Membership.tla` 与它的两个 cfg 一个字节都没改。**因此本次对那两条来说是一次**同输入重跑**，
[上一次 run 的对应结论并没有因为模型改动而作废](#与上一次-run-的关系)——这一点不要跟着其余几条一起读。

## 跑了什么，结果是什么

| 任务目录 | 是不是 formal task | 模型与配置 | 结果 | 规模 |
|---|---|---|---|---|
| `organization-governance-v1-membership/` | **是**（任务 id 同名） | `Membership.tla` ＋ `Membership.cfg`（`Actors = {a1, a2}`、`Serialized = TRUE`） | **无反例**，退出 0（[原文](organization-governance-v1-membership/output/tlc-Membership.log)） | 19 generated · **7 distinct** · 0 left on queue · 报告深度 4 |
| └ `validity-check/` | **不是**（预期反例，见[该目录 README](organization-governance-v1-membership/validity-check/README.md)） | 同一模型 ＋ `Membership_NoSerialization.cfg`（`Serialized = FALSE`） | **按预期违反** `AtLeastOneSuperAdministrator`，退出 **12**（[原文](organization-governance-v1-membership/validity-check/output/tlc-Membership_NoSerialization.log)） | 148 generated · 76 distinct · **17 left on queue**（未穷尽）· 深度 6 |
| `account-registration-v1-basic/` | **是** | `Registration.tla` ＋ `basic.cfg`（`Attempts = {a1, a2}`） | **无反例**，退出 0（[原文](account-registration-v1-basic/output/tlc-basic.log)） | 55 generated · **31 distinct** · 0 left · 深度 7 |
| `account-registration-v1-crash/` | **是** | `Registration.tla` ＋ `crash.cfg`（`Attempts = {a1, a2, a3}`） | **无反例**，退出 0（[原文](account-registration-v1-crash/output/tlc-crash.log)） | 32170 generated · **6978 distinct** · 0 left · 深度 16 |
| `account-registration-v1-progress/` | **是** | `Registration.tla` ＋ `progress.cfg`（`Attempts = {a1, a2}`，唯一检查时序性质的配置，**本轮 `Expiring = TRUE`**） | **无反例**，退出 0；时序性质 2 branches，在 **374** total distinct states 上检查完（[原文](account-registration-v1-progress/output/tlc-progress.log)） | 491 generated · **187 distinct** · 0 left · 深度 12 |
| `unregistered-alloy-affiliation/` | **不是**（原因见[下节](#alloy-为什么仍然没有登记成任务)） | `Affiliation.als`，四条命令（[原文](unregistered-alloy-affiliation/output/alloy-exec.log)） | `run aNonTrivialTree` **SAT**（预期找到实例，**这次是一条真正的三级无环链**）；`AcceptPreservesAcyclic`、`PersonalOrganizationSharesNoAncestor`、`ShareAncestorIsSameAffiliationTree` 三条 **UNSAT**（预期无反例） | scope 见[下节](#alloy-的-scope) |

**没有反例落在当前的模型与契约上。**唯一的反例来自
[有效性核对那一次](organization-governance-v1-membership/validity-check/README.md)，它的失败是预期结果。

每个任务目录的形状与上一次一致：`input/`（模型与配置的逐字节快照 ＋ `SHA256SUMS`）、
`output/`（工具原始输出，不做摘要式改写）。

**退出码不在 TLC 日志里。**上表那几个退出码由主线执行时记录，本目录保存的产物
只含日志正文；日志里能自证的是 `Model checking completed. No error has been found.`
与 `Error: Invariant … is violated.` 这两句。

### 三处数字必须单独解释，否则会被读错

**以下三条是读日志与模型得出的解释，不是工具输出的一部分。**

1. **`basic.cfg` 的 55/31/0/深度 7 与上一次 run 逐项相同——但模型确实改了。**
   新加的两条 `Rejected` 分支在这个配置下都到不了：`OrganizeRejected` 要 `expired ∨ account = None`，
   而 `Expiring = FALSE` 且走到 `"claimed"` 时记录必在；`ActivateRejected` 要
   `expired ∨ account = None ∨ ~warrant[a]`，而走到 `"organized"` 时 `warrant[a]` 必真。
   `warrant` 这个新变量与 `pc` 同步变化，不产生新的可区分状态。
   **数字相同不是「模型没变」的证据**，只是这个配置碰不到改动的那几处。
2. **`crash.cfg` 的 distinct 从 4422 涨到 6978、深度从 13 涨到 16。**
   涨出来的是 `warrant` 这一维与两条 `Rejected` 分支带来的新交错——
   `Expiring = TRUE` 让它们真的可达。
3. **`progress.cfg` 的 distinct 从 31 涨到 187、时序检查的 total distinct 从 62 涨到 374。**
   直接原因是 `Expiring` 打开：到期、清除链两步与两条 `Rejected` 分支都进了状态空间。
   **这正是把它改为 `TRUE` 的目的**——这条进展性质此后检查的范围比上一次大得多。

## 工具与环境

| | |
|---|---|
| TLC | **TLC2 Version 2026.09.12.025210 (rev: 867aefb)**，`/opt/tlaplus/tla2tools.jar` |
| Java | **Eclipse Adoptium 21.0.12.1 64bit** |
| Alloy | **Alloy 6.2.0**，子命令 `alloy exec`；求解器 **sat4j**，`bitwidth 4`、`symmetry 20`、`coreMinimization 2` |
| 主机 | Linux 5.15.0-1084-aws amd64，**8 核**；TLC 用 **4 workers**、6955MB heap、64MB offheap |
| 时间 | 日志时间戳 **2026-09-22 12:24:50 – 12:24:54**；Alloy receipt 记 `"timezone":"Etc/UTC"`，因此这些时间戳按 UTC 读 |
| 位置 | 主线本机执行，工作目录在本轮任务区；**不是** `check_design.py --formal run` 那条路径 |

以上每一项都来自产物本身——TLC 日志首行的版本与运行器信息、Alloy `receipt.json` 的
`solver` / `bitwidth` / `symmetry` / `timezone` 字段。**没有一项是事后补写的。**

### 命令仍然是从日志重建的

本次执行同样没有留下命令行。从产物可以确定的部分：工作目录分别是 `gov/`（含 Alloy）与 `reg/`，
TLC 用默认 worker 数（日志记为 4），**未加 `-noGenerateSpecTE`**——有效性核对那次因此生成了
`Membership_TTrace_1790079890.tla`/`.bin`。Alloy 为 `alloy exec`，输出落在 `Affiliation/`。
产物里只留下 `meta-Membership_NoSerialization/` 一个 metadir，**无反例的那几次没有留下 metadir**；
这与 `-cleanup` 的行为一致，但**命令行未保存，这一句是推断**。

[`registry/formal-tasks.json`](../../../registry/README.md) 登记的 runner **与这次仍不完全相同**：
它固定 `-workers 1`、加了 `-metadir tmp/tlc/<task-id> -cleanup -noGenerateSpecTE`，工作目录是设计根。
**这些差异不改变被检查的东西**——模型、配置、常量、性质集合完全一致。
上一次 run 已直接对比确认：**`generated` / `distinct` / `left on queue` 三个计数与 worker 数无关**，
而**「报告深度」与 worker 数有关**。上表记的是本次执行（4 workers）的报告值。

## 这次检查关掉了哪些故障路径

**每条结论只在它那个配置的范围内成立。**下表是本次实际关掉的东西，不是模板。

| 配置 | 规模 | 故障注入 | 发起者放弃 | 到期与清除链 | 公平性 | 死锁检查 |
|---|---|---|---|---|---|---|
| `Membership.cfg` | `Actors = {a1, a2}` | — | — | — | **无公平性假设**，因此**不检查任何进展性质** | `CHECK_DEADLOCK FALSE`（本模型不承诺进展，「没有下一个动作」不是缺陷） |
| `Membership_NoSerialization.cfg` | 同上 | — | — | — | 同上 | 同上 |
| `basic.cfg` | `Attempts = {a1, a2}` | `Failures = FALSE` | `Abandoning = FALSE` | `Expiring = FALSE` | 用 `SafeSpec`，**无公平性** | 配置未写，按默认 |
| `crash.cfg` | `Attempts = {a1, a2, a3}` | **`Failures = TRUE`** | **`Abandoning = TRUE`** | **`Expiring = TRUE`** | 用 `SafeSpec`，**无公平性** | 同上 |
| `progress.cfg` | `Attempts = {a1, a2}` | `Failures = FALSE` | `Abandoning = FALSE` | **`Expiring = TRUE`**（本轮改的就是这一格） | 用 `Spec`，**带公平性**：每次尝试的 `Organize` 与 `Activate` 各有 `WF_vars`；**`Claim` 刻意不加** | 同上 |

四处必须跟着结论一起传下去的边界：

- **`crash.cfg` 仍是唯一真正检查 `NoOrphanPersonalOrganization` 的地方。**
  `basic.cfg` 里 `Expiring = FALSE`，清除链根本不发生，那条不变量在那里是平凡的——
  **它在 `basic.cfg` 下的「通过」不构成本条的证据**。
- **`progress.cfg` 的前提本轮少了一条。**现在只有两个 `FALSE`：
  `Failures = FALSE` 是「存储最终持续可用」，`Abandoning = FALSE` 是「发起者不放弃」。
  **`Expiring` 不再是前提，它是打开的。**
  [S-19 的前提 (d)（服务面可解析）仍然完全没有被建模](../../../spec/compositions/account-registration/v1/formal/README.md)。
  **前提在真实系统里不可观察**，模型里是常量取值与公平性假设，**不是被证明的事实**。
- **`Membership.tla` 假设存储兑现 `S-17` 的序列化。**这条前提由提供者承担，
  跨节点时不再自动成立（[契约 S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）。
- **规模没有加大。**`Attempts` 是 3（`crash.cfg`）或 2（另两个），`Actors` 是 2。
  **加大规模是另一次检查**，结论按它自己的范围陈述；本次不对任何更大的规模作声明。

## Alloy 的 scope

| 命令 | scope | 结果 |
|---|---|---|
| `run aNonTrivialTree` | `for 4 but exactly 1 Config` | SAT，1 个实例，落在 [`output/Affiliation/aNonTrivialTree-solution-0.md`](unregistered-alloy-affiliation/output/Affiliation/aNonTrivialTree-solution-0.md) |
| `check AcceptPreservesAcyclic` | `for 5 but exactly 2 Config` | UNSAT |
| `check PersonalOrganizationSharesNoAncestor` | `for 5 but exactly 1 Config` | UNSAT |
| `check ShareAncestorIsSameAffiliationTree` | `for 5 but exactly 1 Config` | UNSAT |

**「UNSAT」在这里读作「在这个规模内找不到反例」，不读作「断言成立」。**
每条命令的 scope、`bitwidth`、`symmetry` 与求解器都在
[`output/Affiliation/receipt.json`](unregistered-alloy-affiliation/output/Affiliation/receipt.json)。

### 加 `acyclic[c]` 前件之后，找到的实例换了一个

这是本次唯一一处**可以逐字对比出来的实质变化**，两边的 `parent` 关系都取自各自的 `receipt.json`：

| | `parent` 关系 | 它是什么 |
|---|---|---|
| 上一次 run | `O0→O1`、`O1→O2`、`O2→O0`、`O3→O2` | **一个三点环**（`O0→O1→O2→O0`）外挂一个 `O3`。它满足旧 pred，却**不是一棵三级隶属树**，而且落在 `AcceptPreservesAcyclic` 与 `ShareAncestorIsSameAffiliationTree` 的前件 `acyclic[c]` **之外** |
| 本次 | `O0→O1`、`O2→O0`、`O3→O2` | **一条真正的三级无环链** `O3→O2→O0→O1`，落在上述两条 check 的前件**之内** |

两次的 skolem 取值碰巧相同（`a = O3`、`b = O2`、`d = O1`），
**因此只看渲染出来的 solution 表格看不出区别，差别全在 `parent` 上**。

**这正是加前件要解决的问题**：上一次那个实例**证明不了模型非空**在那两条 check 的前件下也成立，
于是三条 check 的「无反例」当时**不能被读成非空**。本次的实例**同时是 A3 前件下的一个见证**。

### Alloy 为什么仍然没有登记成任务

**理由与上一次逐字相同，本次没有任何新情况改变它**：
不是检查器不支持这个模型种类（`formal-tasks.json` 的 `kind` 接受 `tla` 与 `alloy`），
**是 `alloy exec` 的退出码与断言结果无关**——上一次为判断能否登记而做过直接对比：
把判环前置改回不含自身的写法后 `AcceptPreservesAcyclic` 变成 SAT（找到了反例），
`alloy exec` **仍然退出 0**；而 [`--formal run` 只以退出码判成败](../../../registry/README.md)。
登记它会得到一个**永远通过的任务**。

**闭合条件**（归主线，本次同样不做）：需要一个**会因断言被违反而非零退出**的 runner，
例如读 `receipt.json`、对每条命令逐条比对预期 SAT/UNSAT。那是 `tooling/` 的改动。
在此之前，本次 Alloy 的结果**只以证据形式存在**，由
[组织治理的验证入口](../../../spec/capabilities/organization-governance/verification.md)引用。

## 变异核对：修订者自报，本 run 未登记

[账号注册组合的 formal 入口](../../../spec/compositions/account-registration/v1/formal/README.md)列了
**八个变异 M1～M8 与两个有效性核对**。修订 `Registration.tla` 的那位 agent
**在报告里称八个变异全部给出反例、两个有效性核对全部按预期失败**。

**那不是本 run 的结果，本 README 不把它记成结果。**
它是在该 agent 自己的工作区执行的：**没有输入快照、没有保存原始输出、没有可恢复的配置文件**
（两个否定不变量[按设计就不写成文件](../../../spec/compositions/account-registration/v1/formal/README.md)）。
[没有输入就没有可引用的结论](../README.md#准入)，用今天的文件补建一份等于冒充当时的输入。

因此口径是：**「修订者自报，未登记」**。
[两份 verification.md 里「变异核对一个都没做」的那几行照旧成立](../../../spec/compositions/account-registration/verification.md)——
在有快照、有原始输出的一次执行把它们跑出来之前，**本次全部「无反例」仍然只说明断言没被违反，不说明断言有内容**。
组织治理那一侧的十一个变异／非平凡核对同样**一个都没做**。

唯一的例外仍是 `Membership.cfg` 那一条：它的非平凡性由
[同目录的有效性核对](organization-governance-v1-membership/validity-check/README.md)撑着，**本次两条一起报了**。

## 这次没有覆盖什么

**不在这里重列。**每份契约的形式入口已经逐条写明各自的模型盖不到什么，
以及那些条款改用哪种证据形式：

- [组织治理 · formal 入口](../../../spec/capabilities/organization-governance/v1/formal/README.md)
- [账号注册组合 · formal 入口](../../../spec/compositions/account-registration/v1/formal/README.md)

只提醒两件**本次运行本身**的事实：

1. **变异核对与（TLA+ 那边的）有效性核对，本次一条都没做**，见[上一节](#变异核对修订者自报本-run-未登记)。
2. **五份契约的规范场景演练，一条都没有发生。**本次只跑模型，模型连实现都没看见。

## 与上一次 run 的关系

**[上一次 run](../2026-09-22-formal-tenant-domain/README.md) 不改写、不删除。**
它与本次的关系按输入是否变过分成两类，**不能一句话统一处理**：

| 上一次 run 的那一行 | 现在怎么读 |
|---|---|
| `organization-governance-v1-membership` 与它的 `validity-check/` | **输入逐字节未变**，那两行**对当前模型仍然适用**。本次是一次同输入重跑，两次结论一致 |
| `account-registration-v1-{basic,crash,progress}` | **对当前模型不适用**：`Registration.tla` 改了，`progress.cfg` 也改了。那三行只保留历史记录价值 |
| `unregistered-alloy-affiliation` | **`run aNonTrivialTree` 那一格直接作废**（pred 变了，实例是个环）。三条 `check` 的断言式虽未变，但**模型文件已改、证据未绑定冻结 hash**，按两份 verification.md 的口径**一并重跑**，结论以本次为准 |

有效性核对两次的计数略有出入（上次 149/78/18，本次 148/76/17），**输入完全相同**。
原因是 **TLC 见到第一个反例就停**，多 worker 下停在哪一刻不是确定的。
**这恰好说明那几个数不是穷尽数**，不能当作状态空间的度量。

## 结论边界

- **五份契约仍是 `candidate`。**本次全部通过**不接受任何一份**，
  也不使它们可被消费者采用；[接受归 decisions](../../decisions/README.md)。
- **「无反例」的范围是「这个模型、这个配置、这个规模」。**
  不外推到更大规模、不外推到真实存储、不外推到跨进程。
- **模型不是实现。**本次没有任何实现被检查过，因为没有实现。
- **重跑是新的 run。**本目录不再改写；同一批任务再跑一次建 `…-3`。

返回[运行证据](../README.md) · [已发生的事](../../README.md)
