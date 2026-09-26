# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-25）：形式工件有证据，规范场景仍无。**
> `capability.session-log` v2 是 `candidate`，**未接受、未经独立评审**；尚无提供者节点、尚无源码。
> 行为模型与六个配置已执行一次（run [`2026-09-25-formal-session-log`](../../../record/evidence/2026-09-25-formal-session-log/README.md)，六份全按预期）；规范场景**一条都没演练**。
> 通过不提升状态；有限检查不是证明，范围与前提见下表与那次 run 的「边界」。

## 证据义务

### 形式工件

| 配置 | 检查哪条条款的哪条性质 | 前提（写进配置） | 预期 | 登记 | 状态 |
|---|---|---|---|---|---|
| [`SessionLog.cfg`](v2/formal/SessionLog.cfg) | [S-8](v2/contract.md#s-8-判重键) `UniqueDedupeKey`：一个判重键至多一条；[S-10](v2/contract.md#s-10-尝试栅栏) `FenceHolds`：带栅栏的条目之前没有更大序号；`TypeOK` | `Serialized = TRUE`（S-14 判定与写入同一步）、`DurableDedupe = TRUE`（S-8 第 2 条判重读耐久内容）；两个尝试、一个键、两个写入方槽位、日志至多三条、停机至多一次 | 无反例 | formal task `session-log-v2-appends` | **已运行：退出 0，无反例**（5846 generated · 2784 distinct） |
| [`SessionLog_NoSerialization_Key.cfg`](v2/formal/SessionLog_NoSerialization_Key.cfg) | `UniqueDedupeKey` | `Serialized = FALSE` | **反例** | 有效性核对，不登记 | **已运行：退出 12，按预期出反例** |
| [`SessionLog_NoSerialization_Fence.cfg`](v2/formal/SessionLog_NoSerialization_Fence.cfg) | `FenceHolds` | `Serialized = FALSE` | **反例** | 有效性核对，不登记 | **已运行：退出 12，按预期出反例** |
| [`SessionLog_VolatileDedupe.cfg`](v2/formal/SessionLog_VolatileDedupe.cfg) | `UniqueDedupeKey` | `DurableDedupe = FALSE` | **反例**（停机后重交） | 有效性核对，不登记 | **已运行：退出 12，按预期出反例** |
| [`SessionLog_Reach_StaleRejected.cfg`](v2/formal/SessionLog_Reach_StaleRejected.cfg) | `NeverStaleRejected`：栅栏从不拒收 | 同正配置 | **反例**（栅栏确实会拒收） | 可达性核对，不登记 | **已运行：退出 12，可达** |
| [`SessionLog_Reach_DuplicateRejected.cfg`](v2/formal/SessionLog_Reach_DuplicateRejected.cfg) | `NeverDuplicateRejected`：判重从不拒收 | 同正配置 | **反例**（判重确实会拒收） | 可达性核对，不登记 | **已运行：退出 12，可达** |

**证据**：run [`2026-09-25-formal-session-log`](../../../record/evidence/2026-09-25-formal-session-log/README.md)（提交 `85e71ba4` 上跑，命令与登记逐项相同，输入快照带 `SHA256SUMS`、TLC 原始日志入库）。六份全按预期：两条不变量各有一份否定配置把它推翻，两个拒绝状态各有一份可达性配置证明到得了，所以正配置的无反例不是空真。
**边界**（照那次 run）：常量与关闭的路径见 [formal 入口](v2/formal/README.md)，**有限检查不是无条件证明**；模型只覆盖 S-8（判重）与 S-10（栅栏）；锚的算法不在模型里（它归调用方，`capability.loop-extension-runner/v2#S-5`）。**通过不提升本契约的状态**，它仍是 candidate。

**被建模方式吸收的**（整批原子、位置稠密、读自己写的、载荷原样、租户不混）不写成「已由模型覆盖」，证据是下表的场景与故障注入。

### 规范场景

**六条全部未开始**——它们要的是真实提供者，而提供者节点尚未立起。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-26 判重：停机重排不多一条](v2/contract.md#s-26-判重停机重排不多一条) | 演练 ＋ **杀进程** ＋ **故障注入**（判重换成进程内集合，预期失败） | **未开始** | 受阻：最小提供者节点未立。工具执行运行时节点 N-1、据点装配义务「结果消息恰有一条」的日志一半落在这里 |
| [S-27 栅栏：旧协程写不进](v2/contract.md#s-27-栅栏旧协程写不进) | 演练，两副协程真并发 | **未开始** | 同上；模型请求运行时节点 C-1～C-3、拓展点派发节点 C-1 的日志一半落在这里 |
| [S-28 回复与响应体：撞键整批不写](v2/contract.md#s-28-回复与响应体撞键整批不写) | 演练，**跨契约**（本契约 ＋ 模型请求运行时 ＋ agent loop） | **未开始** | agent loop 那一方尚无节点：只能由测试驱动代它交那一批 |
| [S-29 一本日志一个租户身份](v2/contract.md#s-29-一本日志一个租户身份) | 演练 | **未开始** | 同 S-26 |
| [S-30 位置与读](v2/contract.md#s-30-位置与读) | 演练 ＋ 在提交途中杀进程 | **未开始** | 「半批不可见」只有杀进程才看得出 |
| [S-31 读不到不是没有](v2/contract.md#s-31-读不到不是没有) | **故障注入**（存储读不到） | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 每次尝试的第一条条目是尝试开始记录 | [S-10](v2/contract.md#s-10-尝试栅栏) 第 2 条 | agent loop（尚无契约） | loop 那一程的场景 |
| 条目壳上的租户身份取自会话持有的那一个 | [S-12](v2/contract.md#s-12-一本日志一个租户身份) 第 3 条、[S-21](v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) | 写入方 ＋ `capability.session-tenancy` | 装配的结构检查 |
| 要「恰一条」的写入给判重键；结果未知时以同一判重键重交 | [S-22](v2/contract.md#s-22-回执丢失与结果未知) | 各写入方 | 各写入方契约的场景 |
| 载荷在落盘前、读回时各校验一次 | [S-11](v2/contract.md#s-11-只增不改载荷原样) 第 3 条 | 写入方与读方 | 各自契约 |
| 单写者（属主排他） | [S-21](v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) 第二行 | 最小提供者节点 ＋ 据点装配 | 据点装配 verification 的「第二个据点进程起不来」演练 |

## 对齐义务

- **`attemptSuperseded`** 与 `capability.loop-extension-runner/v2#S-21` ⑥ 的同名值**同义**；那一边改含义，本契约同轮改。
- **`alreadyRecorded`** 与 `capability.assembly-manifest/v2` 的同名值说同一件事（「这个键已有一条已提交的记录，这一次什么都没写」）；两边改一边，另一边同轮核。
- **尝试「被取代」**：`capability.run-attempt-facts/v2` 的「已被取代」与本契约 [S-10](v2/contract.md#s-10-尝试栅栏) 的栅栏条件同义（那一份契约以坐标消费本契约的 S-10）；本契约改 S-10 的判法，那一份同轮核。

## 实际执行

- **形式工件**：一次，run [`2026-09-25-formal-session-log`](../../../record/evidence/2026-09-25-formal-session-log/README.md)，结果在上面[形式工件](#形式工件)表。
- **规范场景**：一条都没演练。

## 独立评审

**尚未评审。**

## 变化的影响

| 日期 | 变化 | 影响 |
|---|---|---|
| 2026-09-25 | 起草 v1（candidate） | 新登 catalog、covers、formal-tasks 各条目；消费者的契约（`capability.tool-execution-runtime`、`capability.model-request-runtime`、`capability.loop-extension-runner`）**正文尚未改指本契约**——它们的 G-1／会话日志缺口原样开着，改指与否由主线裁 |

## 修订波（2026-09-25 公开面）

依据链：[D-063](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1（替身改为接口契约 ＋ 最小提供者）、R-12（锚改为调用方传入的不透明键）；[D-060 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-33～N-37。候选未冻结，原地改。

| 变化 | 依据 | 落在哪 | 语义变不变、对消费者 |
|---|---|---|---|
| 「尚无决定记录」改链 D-063 R-1；账本外名字 `tenantMismatch`、`alreadyRecorded` 标「主线已接受」（N-37 ①） | R-1；N-37 ① | [契约](v2/contract.md) 首段、S-16 失败值表下注、[README](README.md) 提供者映射 | 不改语义 |
| **G-2 闭合**：锚由调用方随 `dispatch` 传入的不透明键给出，派发器把它拼进判重键与读取键；锚的算法归 loop 那一程；S-2「锚怎样算」一行、第十二节 RL-3／RL-5／派发 S-5 三行随之改 | R-12 | [S-2](v2/contract.md#s-2-本契约不拥有什么)、[G-2](v2/contract.md#十已知缺口)、消费者核对三行 | 不改语义；派发器那一侧的场景从「受阻」翻「可跑（键由测试给）」 |
| **形式工件的运行结果填进**（主线另派，本波一并落）：六份配置的状态由「未运行」改为实际结果，证据指 [run 2026-09-25-formal-session-log](../../../record/evidence/2026-09-25-formal-session-log/README.md) | N-37 ⑪ | 本文件顶部与[形式工件](#形式工件)、[实际执行](#实际执行)；契约 S-25 那一格；[formal 入口](v2/formal/README.md) | **状态不因通过而提升**：仍 candidate；有限常量下的模型检查不是证明 |
| 消费者正文改指本契约：`capability.tool-execution-runtime` v2（S-19、S-22、S-46、G-1）、`capability.loop-extension-runner` v2（S-21 ②、S-32、G-8 注）已在本波改指；`capability.model-request-runtime` v2 **本波未改指**（它的 S-2、S-8 仍写「会话日志的拥有者」，已报主线） | R-1 | 那几份契约 | 本契约不变 |

**没有证据因此作废**：本波对正文的改动不触及形式模型建模的性质（判重键至多一条、栅栏）。

### 2026-09-26 产品依据复核

按 [D-064](../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 复核 PF-005 rev 6 与 PF-012 rev 15 的适用条款：hooks 宿主机允许已确认、允许读面接线仍是缺口；旧尝试推进写仍被拒，响应体与账的结算例外与 session-log S-10 同向。没有改变形式模型；本次未重跑模型检查，旧证据不扩张为本次运行证据。
