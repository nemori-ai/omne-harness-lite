# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

> **当前状态（2026-09-25 起草）：没有任何证据。**
> `capability.session-log` v1 是 `candidate`，**未接受、未经独立评审**；尚无提供者节点、尚无源码。
> 行为模型与六个配置**已写、未运行**；规范场景**一条都没演练**。

## 证据义务

### 形式工件

| 配置 | 检查哪条条款的哪条性质 | 前提（写进配置） | 预期 | 登记 | 状态 |
|---|---|---|---|---|---|
| [`SessionLog.cfg`](v1/formal/SessionLog.cfg) | [S-8](v1/contract.md#s-8-判重键) `UniqueDedupeKey`：一个判重键至多一条；[S-10](v1/contract.md#s-10-尝试栅栏) `FenceHolds`：带栅栏的条目之前没有更大序号；`TypeOK` | `Serialized = TRUE`（S-14 判定与写入同一步）、`DurableDedupe = TRUE`（S-8 第 2 条判重读耐久内容）；两个尝试、一个键、两个写入方槽位、日志至多三条、停机至多一次 | 无反例 | formal task `session-log-v1-appends` | **未运行** |
| [`SessionLog_NoSerialization_Key.cfg`](v1/formal/SessionLog_NoSerialization_Key.cfg) | `UniqueDedupeKey` | `Serialized = FALSE` | **反例** | 有效性核对，不登记 | **未运行** |
| [`SessionLog_NoSerialization_Fence.cfg`](v1/formal/SessionLog_NoSerialization_Fence.cfg) | `FenceHolds` | `Serialized = FALSE` | **反例** | 有效性核对，不登记 | **未运行** |
| [`SessionLog_VolatileDedupe.cfg`](v1/formal/SessionLog_VolatileDedupe.cfg) | `UniqueDedupeKey` | `DurableDedupe = FALSE` | **反例**（停机后重交） | 有效性核对，不登记 | **未运行** |
| [`SessionLog_Reach_StaleRejected.cfg`](v1/formal/SessionLog_Reach_StaleRejected.cfg) | `NeverStaleRejected`：栅栏从不拒收 | 同正配置 | **反例**（栅栏确实会拒收） | 可达性核对，不登记 | **未运行** |
| [`SessionLog_Reach_DuplicateRejected.cfg`](v1/formal/SessionLog_Reach_DuplicateRejected.cfg) | `NeverDuplicateRejected`：判重从不拒收 | 同正配置 | **反例**（判重确实会拒收） | 可达性核对，不登记 | **未运行** |

**为什么未运行**：起草这一版的任务没有给出 TLC 工具链。**在正配置跑出无反例、五个核对都按预期出反例之前，不得把 S-8、S-10 当作有模型证据**；闭合条件：一次实际运行，配置、命令与原始输出入 `record/evidence/`，本表改填结果。

**被建模方式吸收的**（整批原子、位置稠密、读自己写的、载荷原样、租户不混）不写成「已由模型覆盖」，证据是下表的场景与故障注入。

### 规范场景

**六条全部未开始**——它们要的是真实提供者，而提供者节点尚未立起。

| 场景 | 证据形式 | 状态 | 说明、责任与受阻 |
|---|---|---|---|
| [S-26 判重：停机重排不多一条](v1/contract.md#s-26-判重停机重排不多一条) | 演练 ＋ **杀进程** ＋ **故障注入**（判重换成进程内集合，预期失败） | **未开始** | 受阻：最小提供者节点未立。工具执行运行时节点 N-1、据点装配义务「结果消息恰有一条」的日志一半落在这里 |
| [S-27 栅栏：旧协程写不进](v1/contract.md#s-27-栅栏旧协程写不进) | 演练，两副协程真并发 | **未开始** | 同上；模型请求运行时节点 C-1～C-3、拓展点派发节点 C-1 的日志一半落在这里 |
| [S-28 回复与响应体：撞键整批不写](v1/contract.md#s-28-回复与响应体撞键整批不写) | 演练，**跨契约**（本契约 ＋ 模型请求运行时 ＋ agent loop） | **未开始** | agent loop 那一方尚无节点：只能由测试驱动代它交那一批 |
| [S-29 一本日志一个租户身份](v1/contract.md#s-29-一本日志一个租户身份) | 演练 | **未开始** | 同 S-26 |
| [S-30 位置与读](v1/contract.md#s-30-位置与读) | 演练 ＋ 在提交途中杀进程 | **未开始** | 「半批不可见」只有杀进程才看得出 |
| [S-31 读不到不是没有](v1/contract.md#s-31-读不到不是没有) | **故障注入**（存储读不到） | **未开始** | 最容易被「读不到就当没有」抹掉的一条，必须真跑 |

### 由别处承担、本契约只写明要求的

| 要求 | 写在哪 | 由谁兑现 | 证据落点 |
|---|---|---|---|
| 每次尝试的第一条条目是尝试开始记录 | [S-10](v1/contract.md#s-10-尝试栅栏) 第 2 条 | agent loop（尚无契约） | loop 那一程的场景 |
| 条目壳上的租户身份取自会话持有的那一个 | [S-12](v1/contract.md#s-12-一本日志一个租户身份) 第 3 条、[S-21](v1/contract.md#s-21-装配给的保证-vs-协议须给的保证) | 写入方 ＋ `capability.session-tenancy` | 装配的结构检查 |
| 要「恰一条」的写入给判重键；结果未知时以同一判重键重交 | [S-22](v1/contract.md#s-22-回执丢失与结果未知) | 各写入方 | 各写入方契约的场景 |
| 载荷在落盘前、读回时各校验一次 | [S-11](v1/contract.md#s-11-只增不改载荷原样) 第 3 条 | 写入方与读方 | 各自契约 |
| 单写者（属主排他） | [S-21](v1/contract.md#s-21-装配给的保证-vs-协议须给的保证) 第二行 | 最小提供者节点 ＋ 据点装配 | 据点装配 verification 的「第二个据点进程起不来」演练 |

## 对齐义务

- **`attemptSuperseded`** 与 `capability.loop-extension-runner/v1#S-21` ⑥ 的同名值**同义**；那一边改含义，本契约同轮改。
- **`alreadyRecorded`** 与 `capability.assembly-manifest/v1` 的同名值说同一件事（「这个键已有一条已提交的记录，这一次什么都没写」）；两边改一边，另一边同轮核。
- **尝试「被取代」**：`capability.run-attempt-facts/v1` 的「已被取代」与本契约 [S-10](v1/contract.md#s-10-尝试栅栏) 的栅栏条件同义（那一份契约以坐标消费本契约的 S-10）；本契约改 S-10 的判法，那一份同轮核。

## 实际执行

**无。**模型未运行，规范场景一条都没演练。

## 独立评审

**尚未评审。**

## 变化的影响

| 日期 | 变化 | 影响 |
|---|---|---|
| 2026-09-25 | 起草 v1（candidate） | 新登 catalog、covers、formal-tasks 各条目；消费者的契约（`capability.tool-execution-runtime`、`capability.model-request-runtime`、`capability.loop-extension-runner`）**正文尚未改指本契约**——它们的 G-1／会话日志缺口原样开着，改指与否由主线裁 |
