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

## 2026-09-27：v3 候选的义务与变化影响

本节是新增候选范围；以上旧事件和执行结果保留历史身份。[v3](v3/contract.md) 未接受、未冻结、未独立评审，新增正式 binding 0。起草者没有运行 TLC、SANY、真实 IO、跨进程或付费调用；下表不得读取为通过。

| 义务 | 工件与范围 | 当前状态／owner |
|---|---|---|
| 旧判重／栅栏的 unconditional 投影 | v3 formal SessionLog 及正配置＋五类有效性配置 | 未运行；独立形式执行者 |
| 尾比较与准确 late 的有限组合 | TailSettlement Attempt/RunEnd 两正配置；比较缺失／拆步／局部历史／unknown 当零写七负控；三可达性配置 | 未运行；独立形式执行者。条款与前提见 [formal](v3/formal/README.md) |
| 三操作形状、闭合失败与优先级 | [examples](v3/examples.md) 的全部拒绝、空日志零写和无损数 | 未开始；真实 provider 验收者 |
| 全批、位置、持久、恢复、资源停止 | S-26～S-31、S-36；完整回复与响应竞争；实际旧 writer 静止 | 未开始；provider/runtime/reply/装配 owner；模型不证明真实 IO |
| 精确依赖、候选登记和全部写方传播 | [consumer-impact](v3/consumer-impact.md)，当前六条 SL2 消费关系、RT3 必须发布规范演进 | 已列义务，尚未迁移；主线及各 owner |
| 生产 Run 终结认法与共同键 | 原 G-1/G-5、provider G2-2/G2-7 | 未关闭；真实 Run owner、runtime/reply 与主线 |

### 本轮变化的影响

- 保留 S-1～S-31 的适用保证，新增 S-32～S-37；append 的新必填参数与新失败值是版本变化，不能让旧三参数调用隐式获得 unconditional。
- 在 S-22 澄清先前未知与后来拒绝的区别，以及部分撞键不能证明整批内容；这沿施工简报的恢复约束，不提高 SL 对 payload 的识别责任。
- PF-015 只采用 rev13 中 §5.8/6.3/6.11/6.12 原有局部要求；相对 rev11 正文逐字一致。新工作区政策未进入本契约。
- 原模型五类有效性义务保留在新候选中；旧执行不自动覆盖新模型、新配置或新条款。所有被建模方式吸收的语义已单列真实验收义务。
- 正式 catalog/covers/id-namespaces/formal-tasks 未写；任务交接包含完整候选登记数据，不能把候选补丁称为正式登记。未发布 Schema，符合 capability 家族线上形状边界；没有新增结构关系触发 Alloy。

### 本轮表达检查

2026-09-27，在 `panqiwei/model-request-runtime-b1-spec`、基线 `60c0652df9a396b5ef9af256809638be37b42c2a` 上使用 Python 3.12，执行 `check_design.py --root .meta_harness/design --gate internal --formal skip`：通过。初次检查发现 formal 入口误链目录，修为文件导航后通过；原失败输出保留在任务证据，未隐去。另对候选登记作内存合成检查，核对 37 条款、三操作九项、24 资源、5 精确依赖、11 reviewed:false covers、3 正任务与 15 不登记的负控／可达配置，结果无结构错误。旧 v2 的 10 个资源与既存 frozen hash 一致；正式 registry 未改。

这些检查只验证引用、形状、登记候选与冻结不漂移；不解析 TLA 语法、不执行模型、不接受规格、不验证 provider。formal 仍全部未运行。检查执行脚本、原始日志与新文件指纹随任务交接由主线保存，不能将这里的通过扩为行为通过。

### 2026-09-27：独立表达评审后的候选修订

按主线转交的 SL3-ER1/ER2/ER3 作表达对齐，候选仍未接受：

- S-35 区分通用 tailEquals 的本次整批零写与要求业务唯一性消费者的稳定身份／完整批认回。合法无键、无先前未知追加可以重新合法读、构造、条件追加；不新增必填键，不授予无键未知追加自动幂等保证。S-22 补同一适用范围，examples 增加三个无键分支。
- S-17⑦ 的重交明确服从输入、租户、栅栏、判重和尾条件的既定顺序；先前成功不保证新的租户／栅栏检查通过，无键重交也须条件通过才写。
- topic README 的五项依赖修正为 identity-values v1，其余 messages/call-accounts/content-blocks/session-tenancy v2，规范及 registry 采用关系未改。
- 修订前 26 项候选输入与 manifest／registry 候选／检查输出均保全，逐 hash 与独立形式 run-1 的输入一致。独立执行者已确认旧输入执行结束，才开始修订。两份 TLA+ 与十八份配置保持原字节；本轮不运行或改记形式任务，旧形式结果仍只绑定旧正文与原输入，不能替换成新正文哈希。

这次仅修正文适用范围和导航；没有更改产品政策、旧 SL2、RT3、provider、正式 registry 或接受状态。实际结构检查随修订交接；独立复审与结果登记由主线处理。
## 2026-09-27 v3 有限形式执行与精确接受

[真实run1](../../../record/evidence/2026-09-27-formal-session-log-v3/README.md)保全2SANY/3正/15负，正distinct2784／17539／17539；全部指定oracle匹配，无工具/语法错误代替负控。输入为初稿f708，最终f327修文的两TLA/十八cfg/formalREADME字节未变，独立复评确认限定性质投影继续适用；不是最终正文重跑，无键普通条件实例和真实IO仍需另外验收。全尾争用未声明liveness/fairness，批原子/身份/StopOld由模型抽象吸收。

[D083](../../../record/decisions/session-log-tail-condition-adoption/decision.md)正式技术接受v3并冻结24资源，5精确依赖、11项覆盖仍reviewed:false、3正任务登记；登记不扩大执行结果。旧SL2和六个消费者精确关系保持；实际provider新增绑定0，真实持久/跨进程/旧writer停止/Run认法/全部响应写方版本传播未完成，withRun未放行。
