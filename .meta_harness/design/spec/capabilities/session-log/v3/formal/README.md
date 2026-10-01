# SL3 行为规格与待执行义务

**candidate，未接受。此文件描述规范任务；实际运行与结果只记版本外 verification。**本包没有执行 TLC、SANY 或真实提供者测试。候选任务清单交主线核对后才写入正式 registry，当前新增正式任务数 0、binding 数 0。

## 模型分层

- [SessionLog.tla](SessionLog.tla) 保留 SL2 对判重与尝试栅栏的模型，投影为 SL3 `condition=unconditional`。`Serialized` 保护判定与写同一步，`DurableDedupe` 区分耐久条目与易失集合；这是旧性质在新版本中的规范工件，旧运行记录不改名充作本次结果。
- [TailSettlement.tla](TailSettlement.tla) 分开调用者预读、构造、提交与日志追加。日志只比较 tail 和不透明壳键（`BatchKeysFree`），载荷是 opaque；`LateIn`、`HasResponse`、`Batch` 是**消费者验收投影**。测试条目 kind/actor/att/late 是模型局部编码，key 的 1/2 仅代表两个不同的稳定不透明键，没有为生产 Run 或键格式定义新的 wire shape。
- 两个结算者共享同一个 ResponseId、原发出 attempt=1：actor 1 为单响应结算，actor 2 为独立消息＋响应整批提交。边界方可写 attempt=2 或同 attempt 的 Run 终结；噪声方可在预读与提交之间追加不相关事实。恢复可以在请求仍未提交时失去回答，也可以在成功提交后丢回答。
- `StopOld` 是环境已经完成旧写者隔离的抽象动作。它没有证明真实进程／网络／文件写者停止；实际实现必须另外给出证据。一个按键缺席读不能替代该动作。模型识别已提交响应即完整获胜批，是因为批原子和字段完整被抽象吸收，实际消费者仍须按读取键认回整批。

## 正配置（候选 formal tasks）

| task ID／配置 | 条款与能失败的断言 | 常量、前提与范围 |
|---|---|---|
| `session-log-v3-appends`／[SessionLog.cfg](SessionLog.cfg) | S-8 `UniqueDedupeKey`；S-10 `FenceHolds`；TypeOK 只检查模型值域 | 两尝试、一键、两槽位、MaxLen=3、MaxCrashes=1；Serialized=TRUE、DurableDedupe=TRUE；无公平性；只看 unconditional 追加 |
| `session-log-v3-tail-attempt`／[TailSettlement_Attempt.cfg](TailSettlement_Attempt.cfg) | S-33 `TailGuardSound`；S-34/S-36 消费组合的 `LateCorrect`；S-22/S-35 `NoFalseNoWrite` | 两结算者、共享响应身份、MaxRequests=2、最多一条无关记录与一个 attempt=2 边界；CheckTail/AtomicTail/CompleteRead/SafeRecovery 全 TRUE |
| `session-log-v3-tail-run-end`／[TailSettlement_RunEnd.cfg](TailSettlement_RunEnd.cfg) | 同上，特别覆盖同 attempt 的 Run 终结 | 与上相同，仅 BoundaryKind="end"，终结在 attempt=1；不假设尝试号一定改变 |

`TailGuardSound` 断言成功批使用的预读尾等于写入前实际尾；`LateCorrect` 比较响应载荷与响应提交前历史的消费者解释。`NoFalseNoWrite` 逐模型请求 `(actor, request ordinal)` 记录否认提交的结论：旧请求仍可能写入，或已提交时，断言失败。合法停止后权威读缺席也会记录这一结论，所以并非“正配置从不检查未知”形成的空真。

本模型的 request ordinal 是有限探索标号，不是新增产品身份。`MaxRequests=2` 是穷举边界，不是生产重试默认。TailSettlement 没有公平性、时间、退避或无饥饿声明；`CHECK_DEADLOCK FALSE` 允许有限探索在 done/exhausted 停住，不能据此声称实际进展。S-35 的提交机会与责任保留仍需真实组合验收。

## 四类新负控与可达性（不登记 formal tasks）

文件都在 `validity-check/`，具体链接见下表；正式运行应将每份负控的特定反例断言与退出状态一并核对，不能只看退出码非零。

| 配置 | 唯一破坏前提 | 预期可观察反例 |
|---|---|---|
| [NoTail Attempt](validity-check/TailSettlement_NoTail_Attempt.cfg)、[NoTail RunEnd](validity-check/TailSettlement_NoTail_RunEnd.cfg) | CheckTail=FALSE | 预读后边界／噪声先到，旧批仍成功，TailGuardSound 失败；边界交错还会漏标 late |
| [SplitTail Attempt](validity-check/TailSettlement_SplitTail_Attempt.cfg)、[SplitTail RunEnd](validity-check/TailSettlement_SplitTail_RunEnd.cfg) | AtomicTail=FALSE；先比较，再允许别的追加，再沿用旧判定 | TailGuardSound 失败；并行环境中的比较不是实际提交点比较 |
| [PartialRead Attempt](validity-check/TailSettlement_PartialRead_Attempt.cfg)、[PartialRead RunEnd](validity-check/TailSettlement_PartialRead_RunEnd.cfg) | CompleteRead=FALSE；读取保留真实尾但遗漏边界 | 即使 tailEquals 成功，LateCorrect 失败；条件不能补偿局部历史 |
| [UnknownAsNoWrite](validity-check/TailSettlement_UnknownAsNoWrite.cfg) | SafeRecovery=FALSE；直接把 unknown 标为未写 | NoFalseNoWrite 失败，可由尚在途或已提交但失回执产生 |
| [Reach TailChanged](validity-check/TailSettlement_Reach_TailChanged.cfg) | 正前提，断言 NeverTailChanged | 应出现实际 tailChanged，反驳“不冲突” |
| [Reach Duplicate](validity-check/TailSettlement_Reach_Duplicate.cfg) | 正前提，断言 NeverDuplicateRejected | 双方争同一响应，败方 alreadyRecorded 可达 |
| [Reach Late](validity-check/TailSettlement_Reach_Late.cfg) | 正前提，断言 NeverLateSettled | 合法重读后迟到响应成功可达，不是把一切旧响应挡住 |

## 旧五类有效性义务继续适用

| 配置 | 预期断言／依据 |
|---|---|
| [SessionLog_NoSerialization_Key.cfg](validity-check/SessionLog_NoSerialization_Key.cfg) | Serialized=FALSE，UniqueDedupeKey 反例，S-8/S-14 |
| [SessionLog_NoSerialization_Fence.cfg](validity-check/SessionLog_NoSerialization_Fence.cfg) | Serialized=FALSE，FenceHolds 反例，S-10/S-14 |
| [SessionLog_VolatileDedupe.cfg](validity-check/SessionLog_VolatileDedupe.cfg) | DurableDedupe=FALSE，重启后 UniqueDedupeKey 反例，S-8/S-13 |
| [SessionLog_Reach_StaleRejected.cfg](validity-check/SessionLog_Reach_StaleRejected.cfg) | NeverStaleRejected 反例，栅栏拒绝可达 |
| [SessionLog_Reach_DuplicateRejected.cfg](validity-check/SessionLog_Reach_DuplicateRejected.cfg) | NeverDuplicateRejected 反例，判重拒绝可达 |

这些都是新目录里的候选工件，五类旧执行结果仅保留历史范围。各配置明列常量；不引用 v2 执行次数充作 v3 检查。

## 没有被模型证明的承诺

| 性质 | 为何没有模型覆盖声明 | 必须补的证据 |
|---|---|---|
| 整批原子、没有孤立消息、位置稠密、读取快照、稳定身份 | Batch 一次拼接、位置来自 sequence、响应身份固定，均被抽象吸收；写一条 TypeOK 不会证明它们 | S-26～S-31/S-36 真实批次竞争、杀进程、半批恢复、跨实例读取 |
| tailChanged 零租户初始化／零占键／零位置分配及完整失败优先级 | 新模型不带租户、表示失败或持久索引 | examples 的判定优先级、空日志 T1 冲突后 T2 首次成功、精确故障注入 |
| payload 无损、JSON 重复键拒绝、超大整数比较 | 有限模型只用 0..5，不表达数字编码／解析 | 大整数与精确小数真实往返、坏输入零写 |
| 合法会话／租户授权、完整生产 Run 终结认法 | 模型只有一个合法会话、一个 tenant；kind 是验收驱动局部形状 | 原 owner 授权检查、实际 Run 生产者和识别器组合 |
| 真实旧 writer 静止、owner 换代、权威恢复读与 unknown opened | StopOld 原子化这些外部义务，模型不包含文件锁、socket 或崩溃过程 | 实际进程故障／资源排空、旧写者无法再提交的证明性测试、RT 新版本恢复验收 |
| 任意规模／无限争用下最终完成 | 有限请求数，未登记 liveness task | 可配置策略及提交机会下的有限实际场景；不得声称无饥饿 |

不另建 Alloy：此次没有新增身份或结构关系；有限行为与 consumer projection 用 TLA+ 表达。没有 Schema：能力输入语义由散文限定，线上编码仍归未来 composition。

## 独立运行入口

工具链由主线给独立执行者；候选 registry 用既有 `${JAVA_BIN}` / `${TLA2TOOLS_JAR}` 参数化 runner，工作目录为设计根。正配置沿仓库 task 结构提供 argv，timeout 是检查工具限时，非产品政策。负控显式选择同一模型文件与各 cfg，期望命名断言的反例；解析错误或工具失败不算负控成立。运行者保存精确输入 hash、工具版本、全部原始输出与可恢复反例，再由主线判断证据范围。
