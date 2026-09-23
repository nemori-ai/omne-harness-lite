# 2026-09-23 · 治理中心入口组合的形式工件执行

[`composition.governance-center-entry`](../../../spec/compositions/governance-center-entry/v1/formal/README.md) v1（候选）
的 TLA+ 行为模型 `EntryDecision.tla`：登记的 formal task `governance-center-entry-v1-decision`（正配置）跑一次，
九个否定配置（一个可达性核对、八个变异）各跑一遍。**这是这个任务第一次有输入快照与原始输出入库的执行**；
此前起草者在工作树里跑过多轮，结果只写在[契约验证入口的「实际执行」](../../../spec/compositions/governance-center-entry/verification.md#实际执行)里，原始输出没有入库。

**通过不提升契约的状态**：它仍是 `candidate`，[接受归 decisions，采用登记归 registry](../README.md#读取与引用纪律)。

## 跑了什么，结果是什么

执行在 spoke 工作树 `panqiwei/tenancy-leg-2-evidence`、提交 `c9b5850`，工作目录是设计根 `.meta_harness/design`，
与 [`--formal run` 的执行位置](../../../registry/README.md)相同。每一次的命令行逐条在 [`commands.txt`](commands.txt)，
退出码在 [`exit-codes.tsv`](exit-codes.tsv)——**两份都是执行脚本 [`run-formal.sh`](run-formal.sh) 在执行当时写下的**，不是事后重建。

| 任务目录 | 是不是 formal task | 配置 | 结果 | 规模 |
|---|---|---|---|---|
| `governance-center-entry-v1-decision/` | **是**（任务 id 同名） | `EntryDecision.cfg`（`Mutation = "none"`），命令与 [`registry/formal-tasks.json`](../../../registry/README.md) 登记的**逐项相同**：`-workers 1 -cleanup -noGenerateSpecTE`，无 `-continue` | **无反例，退出 0**；十五条不变量逐状态检查；时序性质 `EventuallyAnswered` 在 776 个状态上检查完（[原文](governance-center-entry-v1-decision/output/tlc-EntryDecision.log)） | 初始 224 · 804 generated · **776 distinct** · 0 left on queue · 深度 9 |
| └ `validity-check/` | **不是**（预期反例，见[该目录 README](governance-center-entry-v1-decision/validity-check/README.md)） | 九个否定配置：`Validity_Reachability.cfg` 加 `-continue` 跑一次；八个变异各跑「无 `-continue`」与「`-continue`」两次 | **九个全部按预期给出反例**：可达性核对的九条「从不」谓词全部被违反；八个变异无 `-continue` 时全部**退出 12**、各自报出预期那条断言 | 见[该目录 README](governance-center-entry-v1-decision/validity-check/README.md) |

同一个任务另经设计检查器执行了一次：`make design-check FORMAL=run`
⇒ `FORMAL governance-center-entry-v1-decision: executed; exit=0`，检查器整体 `PASS`（[原文](design-check-formal-run.log)）。
检查器只按退出码判成败、**不保存 TLC 输出**；这一次与上表那一次是**两次独立执行**，上表的计数只来自上表那次的日志。
同一次检查器执行里另外四个已登记任务也都 `exit=0`，**它们的输出同样没有被保存，本 run 不把它们记成结果**（见[下节](#其余四个任务为什么不重跑)）。

## 输入：快照、哈希与当前 `spec/` 的对照

`governance-center-entry-v1-decision/input/` 是正配置的输入快照（模型 ＋ 正配置），
`validity-check/input/` 是否定配置的输入快照（同一模型 ＋ 九个否定配置）；各带 `SHA256SUMS`。
**十一个文件的快照与当前 `spec/` 下的同名文件逐字节相同**，也与
[`registry/frozen.json`](../../../registry/README.md) 登记的哈希、与[契约验证入口「实际执行」](../../../spec/compositions/governance-center-entry/verification.md#实际执行)那张哈希表相同——写这份记录时逐一核对过：

| 文件 | SHA-256 | 快照 = 当前 `spec/` | = `frozen.json` | = 契约验证入口所记 |
|---|---|---|---|---|
| `EntryDecision.tla` | `05006b6c3ca100d3c5182a6a701044c988a38b08af76a09223f4ee1ffafd24a0` | 是 | 是 | 是 |
| `EntryDecision.cfg` | `12cd556423baedc91761f932ee2e686a1fb4bbf1cb1278d78de1d9c4e0cd4e26` | 是 | 是 | 是 |
| `Validity_Reachability.cfg` | `9949177bb351b7c7ada65ed7b1686de145a15f65085903e350829ace1acccdc8` | 是 | 是 | 是 |
| `Validity_passthroughStateNotValid.cfg` | `3701c37d37fd09db78ae46660fd225669f75e610e6a17f91c4faefdf573e9af4` | 是 | 是 | 是 |
| `Validity_unavailableAsRejected.cfg` | `e50939eb0ce697cc8591f3cbe7c7bece61c9f073b6b750c4ea4272483fda8a88` | 是 | 是 | 是 |
| `Validity_readPresentationBeforeVersion.cfg` | `2029dbcf6d0dc12e610e7daff161f884698e34c1f890f7736bea6511edc3ca5d` | 是 | 是 | 是 |
| `Validity_inputBeforeAuth.cfg` | `45ba38425a16981c50b027f9823ac32991a92fdf0e6f0b6827e4090ea83f7315` | 是 | 是 | 是 |
| `Validity_gateUnavailableAsDenied.cfg` | `60b7d27b324765a917985b2148b97dadd87fb2d1742ef6a154f1abf6bd0704dc` | 是 | 是 | 是 |
| `Validity_defectAsResult.cfg` | `d6fa442ff09cba54fdf367e7a1fefef94c60983e417297df9a04fef6fdde19bf` | 是 | 是 | 是 |
| `Validity_authBeforeEnvelope.cfg` | `d1580671536a87d03bb7d943be14c9c0fadaccf9774ee696a3c7762b1917e28b` | 是 | 是 | 是 |
| `Validity_deriveBeforePayload.cfg` | `97be78b86fc6a3855c63da980a9466a460f8606852bf3f1e35188cb00641ca91` | 是 | 是 | 是 |

### 其余四个任务为什么不重跑

`registry/formal-tasks.json` 另外四个任务（`organization-governance-v1-membership`、`account-registration-v1-{basic,crash,progress}`）
的 artifacts 与[上一次 run `2026-09-22-formal-tenant-domain-2`](../2026-09-22-formal-tenant-domain-2/README.md) 的输入快照**逐字节相同**，
与 `frozen.json` 登记的也相同，写这份记录时逐一核对过：

| 文件 | SHA-256 | 上一次 run 的快照 = 当前 `spec/` |
|---|---|---|
| `Membership.tla` | `5c7656a47c3b827e638a24f781c4039ccb6d7a669e37799e8580101043bde436` | 是 |
| `Membership.cfg` | `abaa8fa24bf14e8c8fa7e7bed0858197a78bd532c56887f27d462c42e1195734` | 是 |
| `Registration.tla` | `83bc2f8c54bd5057e5831f638bd41d25fe8d908bb5fd43db937d2ee324230f20` | 是 |
| `basic.cfg` | `38198123c96a2704908a72b8df4ea8a76cdf1fac1b05a4622c3b3e178915d64d` | 是 |
| `crash.cfg` | `2a77296a8915042cf5f53d0f92a476b2e568e61a68d36044b78282125fff7ffc` | 是 |
| `progress.cfg` | `6c1a4b3da5fe329b4db766559b1a0905002d050c8af71ad42fe1574b75c90cca` | 是 |
| `Membership_NoSerialization.cfg`（有效性核对，非任务） | `8b0631823173848c527d32a9685470184a46a881440cd33fa5a55c19ba990159` | 是 |

**模型没改，上一次 run 的结论照旧适用**；本 run 不重跑它们，引用它们的地方继续引
[`2026-09-22-formal-tenant-domain-2`](../2026-09-22-formal-tenant-domain-2/README.md)，边界按那份 README。

**一处例外要单独记下**：未登记为任务的 Alloy 模型 `Affiliation.als` **与上一次 run 的快照不再逐字节相同**。
上一次快照 `7e25524f…`，当前 `spec/` 与 `frozen.json` 是 `1a72efa2…`；逐行比较只差第 73 行的一处注释
（`PF-001 §4（rev 12）` → `（rev 14）`），断言式与 scope 没有变。
按[证据绑定输入哈希的规矩](../README.md#准入)，上一次 run 的 Alloy 那一行**已不绑定当前文件**；它不是 formal task，本 run 的范围也不含它，**没有重跑**。
要不要为一行注释重跑，归主线裁决（见[异常](#异常)）。

## 工具与环境

| | |
|---|---|
| TLC | **TLC2 Version 2026.09.12.025210 (rev: 867aefb)**，`/opt/tlaplus/tla2tools.jar`（SHA-256 `db131ddb…a331f1f1`） |
| Java | **Eclipse Adoptium 21.0.12.1 64bit**（`/opt/java/jdk-21.0.12.1+1-jre`） |
| 主机 | Linux 5.15.0-1084-aws amd64，8 核；TLC **1 worker**、7824MB heap、64MB offheap |
| 时间 | 日志时间戳 **2026-09-23 16:12:36 – 16:12:57**；主机时区是 UTC（`date -u` 与 TLC 时间戳同值） |
| 设计检查器那一次 | 2026-09-23 16:20:48 – 16:20:57 UTC，`uv run --locked`，CPython 3.12.13 |

TLC 版本、worker 数、heap 都来自各日志首行；Java 路径与 jar 哈希来自执行环境。

## 这次检查的边界

**每条结论只在这个模型、这个配置、这个规模上成立。**模型的前提写在
[formal 入口「前提」](../../../spec/compositions/governance-center-entry/v1/formal/README.md#tla-与-tlc)，这里只列本次执行的事实：

- **一次行为只有一个请求。**多请求交错、跨请求缓存（S-15 δ = 0）不在模型里——
  [formal 入口](../../../spec/compositions/governance-center-entry/v1/formal/README.md#本版本选用什么)逐条写了哪些性质改用别的证据形式。
- **环境不受公平性约束**：每次现读读得到与读不到、撤销发生与否都由环境任选；流水线动作带 `WF_vars(Pipeline)`，`Revoke` 不带。
  `EventuallyAnswered` 只在这个公平性假设下成立，**只用到 S-32 的 P1（中心在运行）**。
- **`CHECK_DEADLOCK FALSE`**：请求走到答复之后没有后继动作，「没有下一个动作」不是缺陷。
- **状态空间被穷尽**：0 states left on queue，深度 9。TLC 报的指纹碰撞概率估计是 `1.2E-15`（optimistic），原文在日志里。
- **模型不是实现**：本 run 没有看任何实现。入口层实现的符合性证据在同日的[测试 run](../2026-09-23-tests-tenancy-leg-2/README.md)，两者分开陈述。

## 与此前执行的关系

[契约验证入口「实际执行」](../../../spec/compositions/governance-center-entry/verification.md#实际执行)记的最后一轮（评审第二轮修订之后）
与本 run **输入哈希完全相同**。计数逐项比对：

| 配置 | 那一轮所记 | 本 run |
|---|---|---|
| `EntryDecision.cfg` | 初始 224；804 / 776 / 0；深度 9 | 初始 224；804 / 776 / 0；深度 9 |
| `Validity_Reachability.cfg`（`-continue`） | 九条全违反：96、70、64、36、34、28、12、8、4 | 同：`NeverVersionMismatch` 96、`NeverInvalidInput` 70、`NeverHealth` 64、`NeverDefect` 36、`NeverUnavailable` 34、`NeverRejected` 28、`NeverResult` 12、`NeverGatePassed` 8、`NeverLateRevocation` 4 |
| 八个变异 | 各自的预期断言与 `-continue` 下的违反次数 | 逐项相同（[明细](governance-center-entry-v1-decision/validity-check/README.md#八个变异)） |

**数字相同不是本 run 的证据来源**——本 run 的证据是它自己的日志；上表只说明两次执行对同一输入给出了同样的结果。
那一轮的原始输出没有入库，所以它**仍然只是起草者自报**；本 run 是第一份可恢复的原文。

## 异常

1. **`Affiliation.als` 与上一次 run 的快照差一行注释**（见[上文](#其余四个任务为什么不重跑)）。只记不修；是否重跑 Alloy 归主线。
2. **`-continue` 下 TLC 的收尾句会误导**：八个变异与可达性核对在 `-continue` 下**都违反了断言**，
   日志末尾却照样印 `Model checking completed. No error has been found.`，退出码也是 0。
   **读这些日志只能看 `Error: Invariant … is violated.` 的条数，不能看收尾句与退出码**；
   无 `-continue` 的那一次（退出 12）才是「按预期失败」的机器可判形式。这也是否定配置不能登记为 formal task 的又一个理由。

没有反例落在正配置上。

## 结论边界

- **契约仍是 `candidate`**，本 run 通过不接受它。
- **「无反例」的范围是「这个模型、这个配置、单请求、上述公平性」**，不外推到多请求、真实传输或真实存储。
- **八个变异只证明八条断言不平凡**；`HealthUnconditional`、`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup`、
  `RejectionOnlyWhenJudged`、`NoDomainWithoutGates` 五条**没有专门变异**，这是
  [formal 入口](../../../spec/compositions/governance-center-entry/v1/formal/README.md#tla-与-tlc)登记过的已知缺口，本 run 没有改变它。
- **重跑是新的 run。**本目录不再改写。

返回[运行证据](../README.md) · [已发生的事](../../README.md)
