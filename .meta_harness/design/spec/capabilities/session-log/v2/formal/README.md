# capability.session-log v2 的形式工件

本目录是契约 [S-25](../contract.md#s-25-本版选用哪些形式工件) 选用的行为模型。它**不是**已经跑过的证据：执行状态在[验证入口](../../verification.md#形式工件)。

## 本版选用什么

| 规范性质/条款 | 所需表达及理由 | 实际模型文件/命题入口 | 未覆盖范围与相应义务 |
|---|---|---|---|
| [S-8](../contract.md#s-8-判重键) 一个判重键至多一条，按耐久内容判 | TLA+：判重是多个写入方共同触碰的存储对象（跨 owner 的「恰一条」都落在它上面），停机重排与并发排空是真实交错 | [`SessionLog.tla`](SessionLog.tla) 的 `UniqueDedupeKey` | 多条目一批只建成一条（整批原子性被建模方式吸收）；键的拼法不建模 |
| [S-10](../contract.md#s-10-尝试栅栏) 带栅栏的条目之前没有同一运行更大的序号 | TLA+：它是一套代际替换协议（新尝试关掉旧尝试）的写入边界 | 同上 `FenceHolds` | 只建一个运行；「loop 先落尝试开始」这个前提不建模（它是写入方的义务），模型里任何一条更大序号的条目都算推进 |
| [S-14](../contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步) 判定与写入同一步 | 作为**开关**进模型：`Serialized` | 否定配置 `SessionLog_NoSerialization_*.cfg` | — |
| [S-8](../contract.md#s-8-判重键) 第 2 条 判重读耐久内容、不读进程内集合 | 作为**开关**进模型：`DurableDedupe` | 否定配置 `SessionLog_VolatileDedupe.cfg` | — |

**被建模方式吸收、不作证据的**：整批全成全不成、位置稠密、读自己写的、载荷原样、租户不混（[S-11](../contract.md#s-11-只增不改载荷原样)～[S-13](../contract.md#s-13-提交与持久)）——模型里一次「写下」就是一条条目一次追加，这些条款被违反时模型里没有会失败的断言；它们的证据是契约的规范场景与故障注入。

## TLA+ 与 TLC

- **模型文件**：[`SessionLog.tla`](SessionLog.tla)。状态：`log`（耐久，已提交的条目序列）、`pending`（每个写入方槽位判过、未写的那一条与判定结论）、`lock`（会话日志锁，`Serialized` 时从判定持有到写下）、`mem`（只在 `DurableDedupe = FALSE` 时被读的进程内键集合）、`crashes`。动作：`Judge(p, e)`（按 `FenceOK`、`KeyFree` 判）、`Write(p)`（结论为真才追加）、`Crash`（进程内的一切丢失，日志留下）、`Done`（有界模型的收尾停顿）。
- **语义映射**：`Judge` 与 `Write` 合起来是契约的一次 `append`（[S-17](../contract.md#s-17-append追加一批条目)）；`FenceOK` 是 S-10 的判定、`KeyFree` 是 S-8 的判定；`Crash` 是 [S-22](../contract.md#s-22-回执丢失与结果未知)、[S-23](../contract.md#s-23-提供者撤除换代与重启) 的「提供者没了、调用方以同一批重交」——重交在模型里就是任一槽位再选同一条条目。
- **TLC 检查输入**：

  | 配置 | 常量 | 检查 | 预期 | 登记 |
  |---|---|---|---|---|
  | [`SessionLog.cfg`](SessionLog.cfg) | `NumAttempts = 2`、`NumKeys = 1`、`NumProcs = 2`、`MaxLen = 3`、`MaxCrashes = 1`、`Serialized = TRUE`、`DurableDedupe = TRUE` | `TypeOK`、`UniqueDedupeKey`、`FenceHolds` | 无反例 | formal task `session-log-v2-appends` |
  | [`SessionLog_NoSerialization_Key.cfg`](SessionLog_NoSerialization_Key.cfg) | 同上，`Serialized = FALSE` | `UniqueDedupeKey` | **反例**：两个槽位都判键空闲、都写下 | 有效性核对，不登记 |
  | [`SessionLog_NoSerialization_Fence.cfg`](SessionLog_NoSerialization_Fence.cfg) | 同上，`Serialized = FALSE` | `FenceHolds` | **反例**：尝试 1 判过栅栏、尝试 2 写下之后尝试 1 才写 | 有效性核对，不登记 |
  | [`SessionLog_VolatileDedupe.cfg`](SessionLog_VolatileDedupe.cfg) | 同正配置，`DurableDedupe = FALSE` | `UniqueDedupeKey` | **反例**：写下、停机、重交同一键又写下 | 有效性核对，不登记 |
  | [`SessionLog_Reach_StaleRejected.cfg`](SessionLog_Reach_StaleRejected.cfg) | 同正配置 | `NeverStaleRejected` | **反例**：栅栏确实拒收过一次旧尝试 | 可达性核对，不登记 |
  | [`SessionLog_Reach_DuplicateRejected.cfg`](SessionLog_Reach_DuplicateRejected.cfg) | 同正配置 | `NeverDuplicateRejected` | **反例**：判重确实拒收过一次同键 | 可达性核对，不登记 |

- **前提写进配置**：`Serialized = TRUE` 即「判定与写入同一步」（契约 S-14 的要求本身）；`DurableDedupe = TRUE` 即「判重读已提交的条目」（S-8 第 2 条）；停机至多一次、日志至多三条是有界检查的范围。**正配置无反例只说明：在这两个前提下、这个范围里，两条不变量不会被并发与停机打破**——两个前提由提供者兑现，正是否定配置要证明它们必要的地方。
- **有效性核对**：四个否定与可达性配置各自预期出反例；它们不出反例，就说明模型或开关写错了，正配置的「无反例」随之不可信。
- **结果入口**：执行记录归 `record/evidence/`，由[验证入口](../../verification.md#形式工件)链接；本页不填执行状态。

## 版本与证据边界

模型与配置随本规范版本冻结；执行配置、命令、原始输出与反例在版本外保存。本页维护规范到模型的对应，不填随运行变化的通过状态。
