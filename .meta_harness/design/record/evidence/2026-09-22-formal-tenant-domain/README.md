# 2026-09-22 · 租户相关领域的形式工件首次执行

租户相关领域五份候选契约中的**两份**带形式工件。本次把它们**全部跑了一遍**：
组织治理的 TLA+ 行为模型（两个配置）与 Alloy 结构模型（四条命令）、
账号注册组合的 TLA+ 行为模型（三个配置）。

**这是这批契约的第一次成套执行**，也是 [`record/evidence/`](../README.md) 的第一条记录。
五份契约仍是 `candidate`，**通过不提升任何一份的状态**——
[接受由 decisions 完成，采用登记由 registry 完成](../README.md#读取与引用纪律)。

## 跑了什么，结果是什么

| 任务目录 | 是不是 formal task | 模型与配置 | 结果 | 规模 |
|---|---|---|---|---|
| `organization-governance-v1-membership/` | **是**（任务 id 同名） | `Membership.tla` ＋ `Membership.cfg`（`Actors = {a1, a2}`、`Serialized = TRUE`） | **无反例**，退出 0（[原文](organization-governance-v1-membership/output/tlc-Membership.log)） | 19 generated · **7 distinct** · 0 left on queue · 报告深度 4 |
| └ `validity-check/` | **不是**（预期反例，见[该目录 README](organization-governance-v1-membership/validity-check/README.md)） | 同一模型 ＋ `Membership_NoSerialization.cfg`（`Serialized = FALSE`） | **按预期违反** `AtLeastOneSuperAdministrator`，退出 **12**（[原文](organization-governance-v1-membership/validity-check/output/tlc-Membership_NoSerialization.log)） | 149 generated · 78 distinct · **18 left on queue**（未穷尽）· 深度 6 |
| `account-registration-v1-basic/` | **是** | `Registration.tla` ＋ `basic.cfg` | **无反例**，退出 0（[原文](account-registration-v1-basic/output/tlc-basic.log)） | 55 generated · **31 distinct** · 0 left · 深度 7 |
| `account-registration-v1-crash/` | **是** | `Registration.tla` ＋ `crash.cfg` | **无反例**，退出 0（[原文](account-registration-v1-crash/output/tlc-crash.log)） | 17600 generated · **4422 distinct** · 0 left · 深度 13 |
| `account-registration-v1-progress/` | **是** | `Registration.tla` ＋ `progress.cfg`（唯一检查时序性质的配置） | **无反例**，退出 0；时序性质 2 branches，在 62 total distinct states 上检查完（[原文](account-registration-v1-progress/output/tlc-progress.log)） | 55 generated · **31 distinct** · 0 left · 深度 7 |
| `unregistered-alloy-affiliation/` | **不是**（原因见[下节](#alloy-为什么没有登记成任务)） | `Affiliation.als`，四条命令（[原文](unregistered-alloy-affiliation/output/alloy-exec.log)） | `run aNonTrivialTree` **SAT**（预期找到实例）；`AcceptPreservesAcyclic`、`PersonalOrganizationSharesNoAncestor`、`ShareAncestorIsSameAffiliationTree` 三条 **UNSAT**（预期无反例） | scope 见[下节](#alloy-的-scope) |

**没有反例落在当前的模型与契约上。**唯一的反例来自
[有效性核对那一次](organization-governance-v1-membership/validity-check/README.md)，它的失败是预期结果。

每个任务目录的形状一致：`input/`（模型与配置的逐字节快照 ＋ `SHA256SUMS`）、
`output/`（工具原始输出，不做摘要式改写）。
**六份 `input/` 快照与执行时 `spec/` 下的同名文件逐字节相同**，
写这份记录时又核对过一次，仍然相同。

## 工具与环境

| | |
|---|---|
| TLC | **TLC2 Version 2026.09.12.025210 (rev: 867aefb)**，`/opt/tlaplus/tla2tools.jar` |
| Java | **Eclipse Adoptium 21.0.12.1 64bit**（`/usr/local/bin/java` → `/opt/java/jdk-21.0.12.1+1-jre/bin/java`） |
| Alloy | **Alloy 6.2.0**，`/opt/alloy/alloy.jar`，子命令 `alloy exec`；求解器 **sat4j**，`bitwidth 4`、`symmetry 20`、`coreMinimization 2` |
| 主机 | Linux 5.15.0-1084-aws amd64，**8 核**；TLC 用 **4 workers**、6955MB heap、64MB offheap |
| 时间 | 日志时间戳 **2026-09-22 11:07:03 – 11:07:07**；Alloy receipt 记 `"timezone":"Etc/UTC"`，因此这些时间戳按 UTC 读 |
| 位置 | 主线本机执行，工作目录在任务区；**不是** `check_design.py --formal run` 那条路径 |

以上每一项都来自产物本身——TLC 日志首行的版本与运行器信息、Alloy `receipt.json` 的
`solver` / `bitwidth` / `symmetry` / `timezone` 字段。**没有一项是事后补写的。**

### 命令是从日志重建的，不是原样抄下来的

本次执行时没有留下命令行。从产物可以确定的部分：工作目录分别是 `gov/` 与 `reg/`，
`-metadir` 取 `meta-<配置名>`（这些目录在任务区里），TLC 用默认 worker 数（日志记为 4），
**未加 `-noGenerateSpecTE`**（有效性核对那次因此生成了 `Membership_TTrace_*.tla`/`.bin`）。
Alloy 为 `alloy exec`，输出落在 `Affiliation/`。

[`registry/formal-tasks.json`](../../../registry/README.md) 登记的 runner **与这次不完全相同**：
它固定 `-workers 1`、加了 `-metadir tmp/tlc/<task-id> -cleanup -noGenerateSpecTE`，
工作目录是设计根。**这些差异不改变被检查的东西**——模型、配置、常量、性质集合完全一致。
已直接对比确认：**`generated` / `distinct` / `left on queue` 三个计数与 worker 数无关**，
而**「报告深度」与 worker 数有关**（`Membership.cfg` 下 1 worker 报 3、4 workers 报 4，
状态计数两次都是 19/7）。上表记的是本次执行（4 workers）的报告值。

## 这次检查关掉了哪些故障路径

**每条结论只在它那个配置的范围内成立。**下表是本次实际关掉的东西，不是模板。

| 配置 | 故障注入 | 发起者放弃 | 到期与清除链 | 公平性 | 死锁检查 |
|---|---|---|---|---|---|
| `Membership.cfg` | — | — | — | **无公平性假设**，因此**不检查任何进展性质** | `CHECK_DEADLOCK FALSE`（本模型不承诺进展，「没有下一个动作」不是缺陷） |
| `Membership_NoSerialization.cfg` | — | — | — | 同上 | 同上 |
| `basic.cfg` | `Failures = FALSE` | `Abandoning = FALSE` | `Expiring = FALSE` | 用 `SafeSpec`，**无公平性** | 配置未写，按默认 |
| `crash.cfg` | **`Failures = TRUE`** | **`Abandoning = TRUE`** | **`Expiring = TRUE`** | 用 `SafeSpec`，**无公平性** | 同上 |
| `progress.cfg` | `Failures = FALSE` | `Abandoning = FALSE` | `Expiring = FALSE` | 用 `Spec`，**带公平性**：每次尝试的 `Organize` 与 `Activate` 各有 `WF_vars`；**`Claim` 刻意不加** | 同上 |

三处必须跟着结论一起传下去的边界：

- **`crash.cfg` 是唯一真正检查 `NoOrphanPersonalOrganization` 的地方。**
  `basic.cfg` 里 `Expiring = FALSE`，清除链根本不发生，那条不变量在那里是平凡的——
  **它在 `basic.cfg` 下的「通过」不构成本条的证据**。
- **`progress.cfg` 的三个 `FALSE` 不是「顺便关掉的」，它们就是
  [S-19 进展性质的前提本身](../../../spec/compositions/account-registration/v1/contract.md#s-19-有前提的进展)。**
  `Failures = FALSE` 是「存储最终持续可用」，`Abandoning = FALSE` 是「发起者不放弃」，
  `Expiring = FALSE` 把清除链排除在前提之外。**前提在真实系统里不可观察**，
  模型里是常量取值与公平性假设，**不是被证明的事实**。
- **`Membership.tla` 假设存储兑现 `S-17` 的序列化。**这条前提由提供者承担，
  跨节点时不再自动成立（[契约 S-42](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）。

`Attempts` / `Actors` 的规模分别是 3／2 个元素。**加大规模是另一次检查**，
结论按它自己的范围陈述；本次不对任何更大的规模作声明。

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

### Alloy 为什么没有登记成任务

**不是因为检查器不支持这个模型种类**——它支持：`formal-tasks.json` 的 `kind`
接受 `tla` 与 `alloy` 两个值，`.als` 工件的校验路径是现成的。

**是因为手上这个 runner 没有可用的失败信号。**`alloy exec` 的退出码与断言结果无关：
把 `acceptAffiliationRequest` 的判环前置改回**不含自身**的写法之后，
`AcceptPreservesAcyclic` 变成 **SAT**（也就是找到了反例），`alloy exec` **仍然退出 0**。
这是本次为了判断能否登记而做的直接对比，不是推断。

而 [`--formal run` 只以退出码判成败](../../../registry/README.md)。
以 `alloy exec` 为 runner 登记这四条命令，会得到一个**永远通过的任务**——
它只能说明模型解析得动、求解器跑得完，**不能说明任何断言成立**。
那正是[本区红线里「有限检查不写成无条件证明」](../README.md#读取与引用纪律)要挡住的东西，
与[有效性核对那次不登记](organization-governance-v1-membership/validity-check/README.md#为什么它不登记为-formal-task)是同一条道理的两面。

**闭合条件**（归主线，本次不做）：要让它成为一个真任务，需要一个**会因断言被违反而非零退出**的
runner——例如读 `receipt.json`、对每条命令逐条比对预期 SAT/UNSAT。
那是 `tooling/` 的改动，不是清单里能填一行解决的事。
在此之前，本次 Alloy 的结果**只以证据形式存在**，由
[组织治理的验证入口](../../../spec/capabilities/organization-governance/verification.md)引用。

## 这次没有覆盖什么

**不在这里重列。**每份契约的形式入口已经逐条写明各自的模型盖不到什么，
以及那些条款改用哪种证据形式：

- [组织治理 · formal 入口](../../../spec/capabilities/organization-governance/v1/formal/README.md)
- [账号注册组合 · formal 入口](../../../spec/compositions/account-registration/v1/formal/README.md)

只提醒两件**本次运行本身**的事实，它们不在那两页里：

1. **变异核对与（TLA+ 那边的）有效性核对，本次一条都没做。**
   两份 formal 入口一共列了 3 个 Alloy 变异、7 个 TLA+ 变异与 2 个 TLA+ 否定配置，
   **本次运行不包含其中任何一个**。因此上表的「无反例」**只说明断言没被违反，
   不说明断言有内容**；`Membership.cfg` 那一条是例外——它的非平凡性由
   [同目录的有效性核对](organization-governance-v1-membership/validity-check/README.md)撑着。
2. **五份契约的规范场景演练，一条都没有发生。**本次只跑模型，模型连实现都没看见。

## 先前运行

**2026-09-22 09:57 前后，主线还跑过一次 Alloy**，`AcceptPreservesAcyclic` 给出了
`child = newParent` 的自环反例，据此改写了
[组织治理 S-32 的判环前置](../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求)与模型里对应的那一行。

**那一次不单独成为一个 run，本条就是它留下的全部记录。**理由是它拿不出证据该有的东西：
模型在反例之后立刻被改，**改动未提交**，因此当时跑的那份 `Affiliation.als` 已经不存在，
**没有输入快照，也无从补做**。[没有输入就没有可引用的结论](../README.md#准入)——
把它补建成一个 run，等于用今天的文件冒充当时的输入。

它的影响不在这里，在[组织治理的验证入口](../../../spec/capabilities/organization-governance/verification.md)：
那份契约的 S-32 是**被一个反例改出来的**，这件事本身要留在契约的变化记录里。
**本次运行是改写之后的第一次重跑**，跑的是改写后的模型。

## 结论边界

- **五份契约仍是 `candidate`。**本次全部通过**不接受任何一份**，
  也不使它们可被消费者采用；[接受归 decisions](../../decisions/README.md)。
- **「无反例」的范围是「这个模型、这个配置、这个规模」。**
  不外推到更大规模、不外推到真实存储、不外推到跨进程。
- **模型不是实现。**本次没有任何实现被检查过，因为没有实现。
- **重跑是新的 run。**本目录不再改写；同一批任务再跑一次建新目录。

返回[运行证据](../README.md) · [已发生的事](../../README.md)
