# message-stream v1 的验证范围

形式工件位于 [message-stream/v1](v1/)：[Cursor.tla](v1/Cursor.tla) 建模一个协调域内的提交序号、
投影的完整覆盖水位与下界、每订阅的事实队列与瞬态环、可丢的提交广播、周期对账、强制重取、一个
瞬态 attempt 的 `started / chunk / ended`、断线与进程崩溃；[CursorMC.tla](v1/CursorMC.tla) 提供对称
约减与两个否定变体。[Cursor.cfg](v1/Cursor.cfg)（安全）与 [CursorProgress.cfg](v1/CursorProgress.cfg)
（进展）是登记的配置，由 [formal-tasks.json](../../formal-tasks.json) 的
`message-stream-cursor-safety` 与 `message-stream-cursor-progress` 执行——两个任务此前指向提案
证据目录，随本版接受改指 v1 目录的同名文件（哈希相同）。补充配置
（`CursorThree`、`CursorTwo`、`CursorProgressFull`）与两个否定配置（`CursorNoFill`、`CursorBuffered`）
连同重放脚本留在[提案证据目录](../../../docs/proposals/message-stream/evidence/README.md)，只在重放
时运行，不登记为形式任务。

本页记录的运行结果是提案证据目录中存档日志与
[results.json](../../../docs/proposals/message-stream/evidence/model/results.json) 的转录，未在本次
发布时重跑：存档记录的模块哈希 `caefdab2…`、对称约减模块哈希 `e8dd7da6…` 与两个登记配置的哈希
与 v1 目录内的副本逐字节一致，因此结果绑定的是同一批文件；`source_commit` 是重放时的检出 HEAD，
文件身份以哈希为准。检查是有限状态证据，不是无界系统或真实实现的证明。

条款编号（[契约](v1/contract.md) 的 MS-01～MS-24）与性质编号（本页的 MS-1～MS-13、MP-1～MP-3）
是两个编号空间，性质编号沿提案；[场景](v1/scenarios.md)的 MSS-01～MSS-17 用自己的前缀。引用时写明
"条款"、"性质"或"场景"。

## 配置、规范映射与结果

| 配置 | 规范映射 | 有限范围与结果（2026-09-15 存档重放，8 核 4 worker，TLC 带 `-deadlock`） |
|---|---|---|
| Cursor.cfg（安全，登记） | `TypeOK`；`NoForeignDelivery`（[MS-14](v1/contract.md) 的作用域部分）；`CursorComplete`（[MS-08](v1/contract.md)、[MS-11](v1/contract.md)：游标之下每一批的每个事实单元全部已投递，不论丢过多少次广播）；`SentComplete`（[MS-11](v1/contract.md)：服务端水位不虚报）；`SentWithinProjection`（[MS-11](v1/contract.md)、[MS-13](v1/contract.md)：水位不越过完整覆盖水位）；`EndedAfterCommit`（[MS-22](v1/contract.md)）；`BufferOrdered`、`DeliverOnce`（[MS-06](v1/contract.md)）；`AtMostOnePartial`（[MS-08](v1/contract.md) 的半批）；`DraftCurrent`（[MS-22](v1/contract.md)、[MS-13](v1/contract.md) 的 `crash_gap`）；`Monotone` | 1 个订阅、2 次提交（每次至多 2 条共享序号的事实）、两个缓冲各 2、至多 1 次崩溃与 1 次断线、投影可滞后；135.9 万生成 / 25.7 万不同状态，9 秒，完整探索通过 |
| CursorProgress.cfg（进展，登记） | `TypeOK`、`CursorComplete`、`SentWithinProjection`；`EventuallyDelivered`（MP-1）；`BuffersDrain`（MP-3：事实队列最终排空或订阅关闭）；`AttemptsSettle`（MP-2）；`GapMarked`（MS-4 的最终可见，永久布尔） | 同上但无崩溃、不断线；弱公平加在事实投递、缺口投递、瞬态投递、对账、订阅、强制重取、投影 fold 与 attempt 收尾；25.1 万生成 / 5.8 万不同状态，32 秒，通过 |
| CursorThree.cfg（安全补充，不登记） | 同 Cursor.cfg | 3 次提交（覆盖"两批都没推完时第三批到达"）；2158.7 万生成 / 367.2 万不同状态，2 分 4 秒，通过 |
| CursorTwo.cfg（两订阅补充，不登记） | 同 Cursor.cfg | 2 个订阅（对称约减）、2 次提交（每次 1 条）、至多 1 次崩溃与 1 次断线；1901.6 万生成 / 262.7 万不同状态，2 分 1 秒，通过 |
| CursorProgressFull.cfg（进展补充，不登记） | 同 CursorProgress.cfg | 加至多 1 次崩溃与 1 次断线；135.9 万生成 / 25.7 万不同状态，2 分 48 秒，通过 |
| CursorNoFill.cfg（否定，不登记） | 广播只转发自身、不从订阅水位补（去掉 [MS-11](v1/contract.md) 的"从 `sent` 推送"）：期望违反 `CursorComplete` | 780 生成 / 459 不同状态，1 秒内给出预期反例（退出码 12）：订阅后丢第一次广播、听到第二次，游标越过未投递的事实 |
| CursorBuffered.cfg（否定，不登记） | 补齐来自最近 `Retain` 条的流缓冲而非投影（去掉 [MS-11](v1/contract.md) 的"补齐来自投影"）：期望违反 `CursorComplete` | 450 生成 / 241 不同状态，1 秒内给出预期反例（退出码 12）：离线期间两条事实，续订只拿到最后一条 |

正向配置要求 TLC 完整探索并退出 0；否定配置要求对应不变量出现反例（退出 12），它们各证明一种
实现失败，不证明周期对账是唯一办法，也不证明所有有界缓存方案都不可行。

## 性质与保护点

安全性质 MS-1～MS-13 与进展性质 MP-1～MP-3 沿提案的编号与陈述；"证据"列写实际检查到的子性质，
未执行的义务分别保留，不表述为已证明。

| 性质 | 陈述（摘要） | 契约保护点 | 证据 |
|---|---|---|---|
| MS-1 | 出站流不产生事实：每帧可追溯到一条已提交事实或一条带身份的瞬态观察；客户端的确认不改变事实 | [MS-01](v1/contract.md)、[MS-03](v1/contract.md) | 信封 Schema 检查（待）；游标模型（帧只由事实或瞬态动作产生） |
| MS-2 | 每帧带去重键；同一事实至多投递一次到同一订阅；事实帧按 `(seq, index)` 单调、同批 `index` 连续；瞬态帧在 owner 内严格单调 | [MS-06](v1/contract.md) | 游标模型 `BufferOrdered`、`DeliverOnce`；投递单测（待） |
| MS-3 | 重连补齐按批完整：补齐集合 ∪ 已投递集合 = 作用域内不超过完整覆盖水位的全部已提交事实；游标之下没有半批、没有未取回的派生正文；补齐来自投影；全量重取取自同一水位的单一快照 | [MS-08](v1/contract.md)、[MS-11](v1/contract.md)、[MS-12](v1/contract.md) | 游标模型 `CursorComplete`、`SentComplete`、`AtMostOnePartial`，否定变体 `SpecNoFill` / `SpecBuffered`；正文安装与快照安装不建模，由场景 MSS-05、MS-10 与客户端单测承担 |
| MS-4 | 瞬态缺口可见：裁剪、未确认、崩溃丢失、来源消失与丢弃以缺口词表明示；耐久事实只有"落后"与"投影暂不可用" | [MS-13](v1/contract.md)、[MS-17](v1/contract.md) | 游标模型 `DraftCurrent`、`GapMarked`（永久布尔，只证"至少显示过一次"）；场景 MSS-06、MS-15 |
| MS-5 | 投递前核对读权：订阅建立（含基线各项）与每帧投递前各核对一次；撤权不中断工作；可见范围版本变化使游标失效；跨租户游标无效 | [MS-09](v1/contract.md)、[MS-14](v1/contract.md)、[MS-15](v1/contract.md) | 游标模型只覆盖作用域部分（`NoForeignDelivery`）；授权变化未建模，由场景 MSS-08 与授权单测承担 |
| MS-6 | 背压不阻塞事实与工作：慢客户端只丢瞬态帧并留缺口，不延迟提交、不阻塞驱动器或执行 owner | [MS-17](v1/contract.md) | 游标模型（事实队列与瞬态环分开，`CommitFact` 不受缓冲约束）；场景 MSS-06；负载单测（待） |
| MS-7 | `ended` 指向的提交存在且不超过当前水位；同一 attempt 的三种帧共享身份，`chunk` 序号稠密零起，`ended` 之后无该 attempt 的 `chunk` | [MS-20](v1/contract.md)、[MS-22](v1/contract.md) | 游标模型 `EndedAfterCommit`（模型没有真实 attempt 身份，也没有"提交后、终止帧前"的独立窗口）；提供者单测（待） |
| MS-8 | 消息模型单一权威：历史投影、模型请求装配与客户端呈现消费同一消息与内容块定义，差异只在投影 | 归 [CD v2](../../data/core-work/v2/contract.md) 与 [session v2](../session/v2/contract.md)；本契约只承诺"正文按位置拉、不在帧里另造一份"（[MS-04](v1/contract.md)） | 投影单测（待） |
| MS-9 | 耐久帧与 Session 日志同域 append-only，回放与实时看到同一序列 | [MS-04](v1/contract.md)（耐久帧的位置取 `frames(S)` 提交） | [tools v2](../tools/v2/contract.md) 与 [session v2](../session/v2/contract.md) 的证据；场景 MSS-02 |
| MS-10 | 呈现标识稳定：`kind` 与版本在声明里固定，语义不依赖它；公开面不携带内部坐标 | [MS-03](v1/contract.md)、[MS-05](v1/contract.md) | 信封与词表的 Schema 检查（待，含 `additionalProperties: false` 与字段名单） |
| MS-11 | 一个调用的最终结果在客户端视图里恰出现一次：结算事实一律派生结果消息，引用类提醒只引用它 | 归 [session v2](../session/v2/contract.md) 的派生表与 [CD v2](../../data/core-work/v2/contract.md)；本契约只承诺"结算事实以位置提示、正文按位置拉"（[MS-04](v1/contract.md)） | 投影单测（待）；场景 MSS-03、MS-04、MS-14 |
| MS-12 | 媒体只发引用：流不内联媒体字节，引用取回时核对读权；预览是唯一例外且仍有原件引用 | [MS-14](v1/contract.md)、[MS-18](v1/contract.md) | 信封 Schema 检查（待） |
| MS-13 | 私有载荷不经任何入口流出：回放状态、加密推理原件与未校验的调用参数只在私有记录与读面；三处入口共用同一公开投影 | [MS-18](v1/contract.md)、[MS-21](v1/contract.md) | model-execution 提供者单测（待：三处入口同一函数、过滤后计数连续、tool-call 终止帧无参数）；Schema 检查（待） |
| MP-1 | 每条已提交事实最终投递到每个活跃订阅，或进入该订阅下一次补齐的集合 | [MS-11](v1/contract.md) | 游标模型 `EventuallyDelivered`（有限事实数、弱公平） |
| MP-2 | 每个已开始的瞬态尝试最终以 `ended{committed, …}` 或 `ended{abandoned}` 收尾 | [MS-22](v1/contract.md)、[MS-24](v1/contract.md) | 游标模型 `AttemptsSettle`；来源消失的代发未建模，由场景 MSS-16 承担 |
| MP-3 | 断线重连后客户端在有限次拉取内追平完整覆盖水位并回到与事实一致的视图 | [MS-10](v1/contract.md)～[MS-12](v1/contract.md) | 游标模型 `BuffersDrain` 与 `EventuallyDelivered`（前提：投影最终追平提交，由投影提供者承担） |

## 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [MS-01](v1/contract.md) 职责边界 | 游标模型（帧只由事实或瞬态动作产生；流无耐久状态） | "不持有 records 写面"由提供者装配验收 |
| [MS-02](v1/contract.md) 一个 Session 一条流 | 无模型（模型只有一个 Session 作用域） | 租户级轻量流、子 Session 合并（本版不承诺） |
| [MS-03](v1/contract.md) 信封 | 无模型；Schema 检查（待） | 全部字段形状 |
| [MS-04](v1/contract.md) 四类帧与封闭词表 | 模型只区分事实单元与瞬态帧 | 事实提示与耐久帧的区别、`payload` 规则、控制帧词表的封闭性（Schema 检查与提供者验收） |
| [MS-05](v1/contract.md) 呈现标识 | 无模型；Schema 检查与词表核对（待） | 全部 |
| [MS-06](v1/contract.md) 顺序与去重 | `BufferOrdered`、`DeliverOnce`、`Monotone` | 去重键的形状；客户端对乱序的自我保护（场景 MSS-12） |
| [MS-07](v1/contract.md) 游标内容与编码 | 模型的游标是单个序号（单协调域） | 不透明编码与版本、可见范围版本字段、多域形状 |
| [MS-08](v1/contract.md) 整批安装完成才推进 | `CursorComplete`、`AtMostOnePartial` | 正文安装（模型以"收齐最后一个单元"为推进条件），由场景 MSS-01、MS-05 与客户端单测承担 |
| [MS-09](v1/contract.md) 可见范围版本 | 未建模 | 全部；由场景 MSS-08 与授权单测承担 |
| [MS-10](v1/contract.md) 订阅与 `stream.opened` | `Subscribe` 的两个分支（`cursor ≥ floor` / `< floor`） | `target` 与 `resumable` 的字段区分、基线各项的读权核对、同步切 |
| [MS-11](v1/contract.md) 增量补齐与服务端水位 | `CursorComplete`、`SentComplete`、`SentWithinProjection`、`Reconcile`、`ForceResync`；否定变体 `SpecNoFill` / `SpecBuffered` | 分页读取的真实实现、投影重建（模型里投影只是滞后） |
| [MS-12](v1/contract.md) 全量重取 | `Subscribe` 的 `cursor < floor` 分支（安装视为原子） | 多视图快照、`asOf` 过滤、贡献的裁剪、安装完成点与客户端终止安装 |
| [MS-13](v1/contract.md) 缺口与不可用 | `GapMarked`、`DraftCurrent`；`Project` 停住时 `SentWithinProjection` 成立 | 缺口词表逐值、缺口只发一次（场景 MSS-15 与投递单测） |
| [MS-14](v1/contract.md) 两处核对 | `NoForeignDelivery`（作用域部分） | 授权判定本身、基线各项的核对（场景 MSS-08、授权单测） |
| [MS-15](v1/contract.md) 撤权 | 未建模（`ForceResync` 只覆盖保留期一侧） | 全部；场景 MSS-08 |
| [MS-16](v1/contract.md) 多客户端 | `CursorTwo.cfg`（补充配置，逐订阅的 `DeliverOnce` 与 `NoForeignDelivery`） | 登记配置只有一个订阅 |
| [MS-17](v1/contract.md) 背压 | 事实队列与瞬态环分开、水位停在批内、`CommitFact` 不受缓冲约束 | 阈值与断开参数（装配）；对 owner 无背压由负载单测承担 |
| [MS-18](v1/contract.md) 不进流的清单 | 无模型 | 全部；由 Schema 检查、提供者验收与[工程观测](../engineering-observation/v1/contract.md)读面承担 |
| [MS-19](v1/contract.md) 归档与删除 | 无模型 | 全部；场景 MSS-11、MS-14 |
| [MS-20](v1/contract.md) 三种瞬态帧 | `StartAttempt`、`Chunk`、`EndCommitted`、`Abandon`（无真实 attempt 身份与 `purpose`） | 字段形状、`purpose` 分流、`startedAfter` |
| [MS-21](v1/contract.md) 公开投影 | 未建模 | 全部；由 model-execution 提供者单测承担 |
| [MS-22](v1/contract.md) 瞬态与耐久的接头 | `EndedAfterCommit`、`DraftCurrent` | "提交后、终止帧前"的独立窗口；原子替换草稿（客户端单测） |
| [MS-23](v1/contract.md) 重连基线与同步切 | `Subscribe` 只重置草稿，不建模基线内容 | `pub = {gen, n}` 的比较与换代重读（提供者与插件单测） |
| [MS-24](v1/contract.md) 来源消失 | `Abandon` 只表示 owner 自己放弃 | 代发、关闭自己的账、后续帧丢弃（场景 MSS-16 与插件单测） |

## 模型的抽象与刻意未覆盖

模型把四条耐久流折叠为一个协调域的提交序列（每次提交要么在本 Session 作用域内带 1～`MaxPer` 条
共享序号的事实单元，要么属于别的 Session），因此不建模流的名字；投影的完整覆盖水位与下界是两个
计数器，投影重建只表现为滞后；客户端只有一个数作游标，`delivered` 集合只为陈述性质而存在。刻意
未覆盖：授权与可见范围版本、按位置拉取派生正文、跨页读取、全量重取的安装过程（视为原子）、来源
消失的代发、媒体引用与 `render`、多个协调域、租户级轻量流，以及传输层的心跳、批处理与断开阈值。

模型发现（随提案证据保留，影响已落入契约）：(1) 首稿在订阅建立时把整个补齐区间一次塞进缓冲，
3 条事实、缓冲 2 的配置立刻给出 `TypeOK` 反例；补齐改为分页、余下由对账续推，背压规则随之从
"缓冲满关订阅并要求重订阅"改为"水位停住、有空位再续"（[MS-11](v1/contract.md)、[MS-17](v1/contract.md)）。
(2) 首稿把事实帧与瞬态帧放在同一个队列，进展检查给出反例：无穷多次 attempt 的瞬态帧一直占满
队列，事实帧永远进不来；模型改为两个缓冲分开，`ended{committed}` 因此进瞬态环、客户端按位置读
消息而不依赖两类帧的顺序（[MS-17](v1/contract.md)、[MS-22](v1/contract.md)）。(3) 单队列下两订阅加
崩溃的配置 5 分钟内未完成；分开后 2 分钟内完成，登记的安全配置仍取 1 个订阅、2 次提交以保证单
配置在 1 分钟内完整探索。

## 其它证据义务与未完成映射

- Schema 检查（实现前）：帧信封、游标编码、`render` 词表与内容块补齐的 JSON Schema；
  [MS-03](v1/contract.md) 的"不带内部坐标"以 `additionalProperties: false` 与字段名单表达。
- 投影单测（实现阶段）：同一消息记录投影为历史、模型请求与客户端呈现三种结果，归
  [session v2](../session/v2/contract.md) 与 [CD v2](../../data/core-work/v2/contract.md) 的证据。
- 授权单测：两处核对用两个不同租户的主体，不用同值替身；可见范围版本变化的失效路径。
- 负载单测：慢客户端不延迟提交、不阻塞执行 owner 与驱动器。
- 客户端单测：整批安装完成点、全量重取的安装原子性、乱序帧的自我保护、`index` 不连续时丢草稿。
- 未完成映射（接受后的产物）：出站流提供者设计；model-execution 提供者设计（公开投影、
  `attempts` 读面与发布计数的互斥、结算记录字段）；投影的 `changes / snapshot / floor` 读面；
  [session v2](../session/v2/contract.md) 的 `frames(S)` 与派生表；SSE 端点与传输参数的装配设计。
  这些缺口阻止依赖它们的实施，不改变本契约已接受的语义范围。
