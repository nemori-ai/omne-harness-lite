# 独立评审与处置

[提案索引](README.md)

评审：Codex `architecture-reviewer`（只读，gpt-6-astra / xhigh），2026-09-15，对象为 HUB 分支
`design/dsh-core-adoption` 提交 `471e9ae` 的本提案全部文件、相关决定与规格、工具执行候选、
六份研究笔记、模型与五个配置、结果登记和日志；评审员未修改文件、未运行 TLC。评审保留
U-48～U-58，不重开政策选项。原始报告在主检出 `tmp/next-design-prep/review-codex-message-stream.md`。

处置栏是作者初判：**已修** 表示本分支已改；**拟修** 表示方向明确、正文尚未改，等用户确认
本表后一并改；**待用户** 表示要新的裁决（列为决定点 L～）。评审结论"存在阻断项"在拟修
项落地前仍然成立。

## 阻断项

| 编号 | 发现 | 初判 | 处置 |
|---|---|---|---|
| B1 | 同一提交可产生多条共享域序号的事实（MS-01 的 taken + created + step.opened 同批），但游标与 `sent` 水位被定义为"已见最大序号"；事实队列只剩一个位置时推第一帧就把水位推到 `n`，同批余下两帧被永久跳过；客户端在同批第一帧后断线同样丢帧；MS-12 把"序号缺口"判为服务端错误也不成立（本 Session `n`、他 Session `n+1`、本 Session `n+2` 合法） | 成立。模型每提交一条事实、`BufferOrdered` 严格递增，正好排除了正文允许的同批多帧 | 拟修：帧位置改为 `{seq, index, count}`（同批内序号与批大小），水位与游标只在整批推完 / 收完后推进到 `seq`，部分推送停在 `seq-1`；`dedupKey` 只去重不证完整；MS-12 的乱序判据改为"同批 index 倒退或同批未收齐即收到更大 seq"；模型改为每次提交 1～2 条事实并让队列容量可小于批大小，`CursorComplete` 按批重述 |
| B2 | 补齐依赖的完整前缀未闭合：`changes(to: now)` 没有"投影已完整处理到哪"的水位就可能虚推 `sent`；`stream.opened{cursor: now}` 在补齐前发出、客户端据此保存游标会跳过未补齐事实；`resync: full` 的同步切不约束随后多页历史与其他读面；投影不可用期间"只发实时"会重现 `SpecNoFill` 的反例；活跃订阅停住时 `floor` 越过其 `sent` 无处置 | 成立。第 4 点最重：cordis.md 的降级政策与本提案自己的否定变体矛盾 | 拟修：session 下一版给 `changes` 加"完整覆盖水位"返回值，`sent` 只能推进到该水位；`stream.opened` 区分 `target`（now）与 `resumable`（可保存的恢复水位），客户端只保存后者；全量重取定义"安装完成点"（最后一页与实时帧接上）之前不推进恢复水位；投影不可用期间不投递事实帧、只发 `stream.gap{unavailable}` 并保持恢复水位不动；`floor` 越过 `sent` 的订阅强制 `resync: full`。模型加 `floor > sent` 分支与投影滞后变量 |
| B3 | 对象级授权过滤与游标完整性没有共同定义：无权时跳过的帧在事后获权后拿不回来（对象本身不再产生事实）；`baseline` 的各组成项也要经各自权威核对读权 | 成立。HD 提供者设计已有"权限变化使旧游标失效"的先例，本线没有对齐 | 待用户（决定点 L）：作者建议沿 HD 先例——游标隐含"该主体当时的可见范围版本"，主体对本 Session 内任一对象的读权变化使其游标失效、下次订阅 `resync: full`；不做逐对象回填。另一边是逐对象回填（服务端记录每个订阅跳过的帧，获权后补发），代价是每订阅的跳过账本 |
| B4 | 派生表不能唯一重建：一事实派生多消息时身份与批内顺序未定义；未取批即撤回的输入没有历史派生路径；辅助 attempt（标题、压缩）会被当普通回复；已验证 `tool_call` 块没有从 `tools.call.proposed` 派生的规则；`AttemptRef` 强制 `StepRef` 对无 Run 的工作不适用 | 成立，四点都是正文缺口 | 拟修：消息身份 = `(eventId, ordinal)`，同批派生按事实内顺序编号；未取批输入的历史派生从 `queue.item.*` 事实给出（含 `supersededBy`）；派生表按 attempt 的 `purpose`（RD-07）分流，辅助 attempt 不派生助手消息、压缩只派生一条系统来源消息；`tools.call.proposed` 派生 / 更新 `tool_call` 块并保留非法调用的原始片段；`AttemptRef` 的 `StepRef` 改为可空并说明无 Run 工作的适用范围 |
| B5 | 已占位调用在 Session 归档后结算：SE-14 D2 关闭 arrival、不开新 Step，按现派生表永远没有最终结果消息（MS-11 的"恰一次"变零次）；占位形状与工具提案冲突（后台 / 等待原因与 notice、`tool_result.value` 只允许文本与媒体） | 成立。把"结果如何进模型"的规则误用为"结果如何进客户端历史" | 拟修：`tools.call.settled` 一律派生 / 更新对应 `tool_result` 消息（客户端可见时机 = 结算），`system_reminder{late_result}` 只是模型消费切点、不再重复呈现结果；占位形状以工具提案 [lifecycle.md 占位](../tool-execution/lifecycle.md#占位与迟到结果的投影) 为准，`tool_result.value` 允许 `deferred_receipt` 的原因与 notice；归档后不开新 Run 的政策不变 |
| B6 | `partial / cancelled` 只保留文本与推理：fork 的 `interruptedBlocks()` 过滤掉全部非 text / reasoning 块，已耐久的图片块在结算替换草稿后消失；Message 没有 attempt 结算状态与缺失块描述 | 成立，违反 RD-08 与 CT-04 | 拟修：派生规则改为"完整且已耐久的块全部保留、未完成块记为缺失"，Message 加 `settlement{status, missing[]}`；cordis.md 的 fork 演化路径登记 `interruptedBlocks()` 的改写，不再称"原样复用" |
| B7 | 公开增量与私有 replay 共用载荷：`finish.replayState` 携带加密推理原件，fork 的 `push()` 同一 chunk 送累加器、装配器和实时发布，基线又直接带紧凑记录；`argumentsDelta` 是未解析原始参数，事实读面的裁剪不覆盖这条瞬态路径 | 成立，是映射缺口（无披露证据） | 拟修：定义 MC 私有记录 → 公开 chunk / 紧凑历史 / 重连基线的统一投影（`toPublic`），三处入口共用；`replayState` 与加密推理只留在 MC 私有读面，模型请求经该读面取回；`argumentsDelta` 按参数键的披露声明裁剪或整体不流出（决定点 M，作者建议整体不流出、只流 `tool-call-start/end`） |
| B8 | MC 活跃基线与瞬态来源消失没有责任链：插件在 attempt 开始后装载拿不到累加器读操作；MC 来源撤除后订阅还活着、草稿无人收尾；Run epoch 与 fork `revision` 的缺帧检测语义不同 | 成立 | 拟修：cordis.md 给 MC 提供者设计一个"活跃 attempt 读面"义务（`attempts(session)` + 版本号，装载时先读基线再订阅事件，同一同步切）；来源撤除时由 MessageStreamPlugin 对每个活跃 attempt 发 `ended{abandoned, reason: source_lost}`，结算事实到达后按位置收尾；登记"Run epoch 只作重基线依据、不作缺帧检测"，缺帧检测靠 attempt 内 `index` 连续 + `ended` 必达（对账兜底） |

## 非阻断建议

| 编号 | 发现 | 处置 |
|---|---|---|
| N1 | 模型覆盖结论过宽：未建模同批多事件、投影滞后 / 重建、跨页读取、授权变化、按位置拉取；`EndedAfterCommit` 无真实 attempt 身份与"提交后、终止帧前"窗口；`GapMarked` 用永久布尔；`BuffersDrain` 允许订阅关闭；`CursorProgress.cfg`（2 条事实、缓冲 2）产生不了"超过容量的待推事实"，"覆盖队列满后续推"的说法不成立；两个否定变体各证明一种失败，不证明"周期对账必要"或"所有有界缓存都不可行"；首稿反例无存档 | 已修（本提交）：证据说明的进展配置覆盖句改正；其余按 B1 / B2 / B8 的模型改动一并收窄，`invariants.md` 证据义务改为映射到实际检查的子性质 |
| N2 | 登记表写 4 worker、安全 8 秒、进展 16 秒；存档日志是 2 worker、安全 22 秒、进展 38 秒、两订阅 3 分 7 秒 | 已修（本提交）：[session 验证范围](../../../spec/capabilities/session/verification.md) 按存档 `results.json` 改写 |
| N3 | Cordis required 依赖撤回（插件退出活动）与操作返回 `unavailable`（局部降级）是两种触发，cordis.md 混用；"出站流没有外部效果"应改为"已披露内容不可撤回" | 拟修：cordis.md 依赖变化表分两列 |
| N4 | 投影输入不完整（模型族、有效能力、切点、调用当前状态、读权）；`delivery` 不证明"模型实际接收"；`ended{failed}` 与 `ended{committed, settled: failed}` 不一致；`stream.gap{unavailable}` 未对齐缺口词表；`render.language` 未进形状；MS-12 例外边界；README 仍把 `system_reminder` 呈现列为待定；跨域游标的责任未登记 | 拟修：随 B4 改正文；README 未决项同步 |

## 评审引出的决定点（待用户）

| # | 问题（人话） | 作者建议 | 另一边 |
|---|---|---|---|
| L | 用户中途获得某个对象（比如一个已关闭的请求）的读权，之前被跳过的帧怎么补 | 沿 HD 的先例：权限一变，这个人的游标作废，下次连上做一次全量重取；不做逐帧回填 | 服务端为每个订阅记"跳过了哪些"，获权后补发；多一本账，跨实例要同步 |
| M | 工具调用参数的流式增量（模型还在写参数的半截 JSON）要不要流给客户端 | 不流；只流"开始写调用 / 写完了"两个标记，完整参数随事实帧到 | 按参数键的披露声明裁剪后流：客户端能看到参数逐字出现，代价是裁剪规则要在半截 JSON 上做 |

## 未覆盖

评审未运行实现、测量背压、重跑形式工具，未验证真实 SSE / HTTP 装配、MC 提供者与 OpenRouter
adapter；传输参数、子 Session 流合并、跨域部署继续属于延后范围。评审不构成接受。
