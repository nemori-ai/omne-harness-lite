# 客户端消息流 v1

本契约身份为 `capability.message-stream`，版本 1。它是本批次新增的契约，没有上一版，
不取代任何已发布版本：此前分散在各能力读面与出站流边界材料里的投递语义在这里收成一份
承诺——帧信封与封闭的帧类别、客户端游标、断线补齐与全量重取、作用域与投递、模型
attempt 的瞬态帧协议。[决定 D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md)
确立的事实与提示分家、`records.envelope.committed` 提交后广播与三段式事实名是它的前提。
接受依据为[决定 D-015](../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)。

规范依赖：[session v2](../../session/v2/contract.md)（Session、历史与派生消息、读面
`changes / snapshot / visibilityVersion / history`、`frames(S)`、Inbound）、
[run v2](../../run/v2/contract.md)（Run 状态与执行 epoch）、
[run-driver v3](../../run-driver/v3/contract.md)（Step 切点与辅助工作）、
[tools v2](../../tools/v2/contract.md)（调用事实、`tools.frame.<kind>`、记录等级、缺口词表、帧读面与
`calls` 贡献）、[human-decisions v2](../../human-decisions/v2/contract.md)（请求事实、可见范围与
`requests` 贡献）、[model-execution v2](../../model-execution/v2/contract.md)（attempt、结算记录、
`attempts` 读面、公开投影）、[durable-records v2](../../durable-records/v2/contract.md)（提交序号、
批内记录顺序、`committed` 回执）、[共享数据 CD v2](../../../data/core-work/v2/contract.md)（消息与
内容块形状）、[media-content v2](../../media-content/v2/contract.md)（媒体引用与取回）、
[生命周期组合 LC v2](../../../compositions/session-run-agent-lifecycles/v2/contract.md)（事实广播与
跨协调域义务）、[共同准入 CC v2](../../../compositions/core-work-coordination/v2/contract.md)（协调域）、
[tenant-governance v1](../../tenant-governance/v1/contract.md)（租户成员资格）、
[external-hooks v1](../../external-hooks/v1/contract.md)（hooks 观察事实的去向）、
[engineering-observation v1](../../engineering-observation/v1/contract.md)（工程观测读面与披露裁剪）、
[action-authorization v1](../../action-authorization/v1/contract.md)（读权判定的权威位置）。本契约只
定义已提交事实与瞬态观察怎样被投递到获准客户端，不改写任何权威的状态转移，也不定义传输
选型、心跳、批处理、压缩与阈值等装配参数。

行为模型见 [Cursor.tla](Cursor.tla) 与 [CursorMC.tla](CursorMC.tla)，符合性要求见
[场景](scenarios.md)，覆盖范围、有限性与未建模项见验证说明。

## 定义与原则

**MS-01**：客户端消息流是投递面，不是权威。它不产生事实、不持有耐久状态、不做准入，也不
持有 records 写面：每一帧要么可追溯到一条已提交事实在协调域内的位置，要么是一条带 attempt
或调用身份的瞬态观察，要么是本契约封闭词表内的控制帧（MS-04）。客户端的任何接收、确认或
游标推进都不改变事实，也不使任何工作前进或停止；订阅的建立与结束不影响 Run、调用、请求与
记录的状态（[PF-013.C10](../../../../docs/requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求)、
[LC-06](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）。流服务在运行时重建后为
空：它不重放自己的历史，客户端按游标从投影补齐（MS-11）。

**MS-02**：一个订阅恰对应一个 Session。该 Session 内 Run、Step、调用、attempt、请求的帧都在
这条流里，以信封的 `subject` 区分，客户端按身份分流，不按对象另开连接。租户级的列表变化
（Session 目录、待办池计数）走另一条轻量流，只投递不带正文的提示（`session.lifecycle.changed`、
`hd.request.created / closed`），不扩展本流的词表，也不承载任何 Session 正文。子 Session 的帧
合并不在本版承诺范围
（[PF-004](../../../../docs/requirements/product/agent/PF-004-subagent-delegation-and-supervision.md)），
本版不为其预留语义。

## 帧信封与封闭的帧类别

**MS-03**：每帧的信封是
`Frame{kind, dedupKey, subject, at, position | null, batch | null, ephemeral | null, render | null,
payload, payloadRef}`。`position = {domain, seq}` 是产生该帧的提交在协调域内的位置
（[DR-01](../../durable-records/v2/contract.md)）；`batch = {index, count}` 是该提交在本订阅**投递前
核对后可见**的帧中排第几、共几条，因而是订阅局部的数字，而 `position.seq` 与 `dedupKey` 是全局
身份；`ephemeral = {owner, epoch, seq}` 是瞬态帧在其 owner 内的单调序号。`position` 与
`ephemeral` 恰有一个非空，或两者皆空（控制帧）；`subject` 至少含 `tenant` 与 `session`。信封不
携带内部坐标（存储偏移、进程句柄、内部 id），公开面的字段集合是封闭的
（[SYS-OBSERVABILITY.C5 / C6](../../../../docs/requirements/system/observability-and-logging.md)、
[OB-03](../../engineering-observation/v1/contract.md)）。

**MS-04**：帧恰有四类，类别集合封闭：

| 类别 | `kind` | `payload` 与位置 |
|---|---|---|
| 事实提示 | 各耐久流事实名原样（三段式，由 [session v2](../../session/v2/contract.md)、[run v2](../../run/v2/contract.md)、[tools v2](../../tools/v2/contract.md)、[human-decisions v2](../../human-decisions/v2/contract.md) 各自拥有，本契约不复制该词表） | 小事实带事件 `data`；产生派生消息的事实（取批、attempt 结算、调用结算、Step 开启）只带 `position` 与 `subject`，正文由客户端按位置从 `history` 读面拉 |
| 耐久帧 | `tools.frame.<kind>`（记录等级为 `critical` 或 `durable`，[tools v2](../../tools/v2/contract.md)） | 帧 payload 或 `payloadRef`；`position` 取 `frames(S)`（[SE-19](../../session/v2/contract.md)）的提交位置，`subject` 带 `call` 与 `attempt`；`render` 来自命令声明 |
| 瞬态 | `model.attempt.started / chunk / ended`（MS-20）、记录等级为 `transient` 的 `tools.frame.<kind>` | 帧内容；`ephemeral` 非空 |
| 控制 | `stream.opened{target, resumable, baseline, resync: none \| full}`、`stream.gap{owner, epoch?, reason}`、`stream.closed{reason}` | 见 MS-10、MS-13、MS-15；`position` 与 `ephemeral` 皆空 |

控制帧的 `kind` 恰是上表三个；`stream.gap.reason` 恰是
`trimmed | crash_gap | unconfirmed | decode_unavailable | unavailable`，前四值取
[tools v2](../../tools/v2/contract.md) 帧缺口词表中的同名值，`unavailable` 由本契约新增，表示来源
或投影暂不可用；`stream.closed.reason` 恰是
`unauthorized | unavailable | session_deleted | resync_required`。
人类请求卡片不是新的帧种类：`hd.request.created / closed` 与 `hd.decision.recorded` 是事实提示，
卡片内容与可答性来自 [human-decisions v2](../../human-decisions/v2/contract.md) 的读面；问答型答复
的正文以调用结算的 `tool_result` 进入历史。哪些事实不进本流由 MS-18 封闭。

**MS-05**：帧可带呈现标识 `render{kind, version, language?}`。`kind` 的首版词表恰九值：
`plain`（纯文本）、`markdown`、`html`（可直接渲染的片段）、`terminal`（ANSI 语义）、`code`
（语言由 `render.language` 给出，该参数只配 `code`）、`log`、`table`（结构化文本）、`widget`
（文本且媒体类型为 `text/html`）、`image`（媒体引用）。随词表成立的三条规则：渲染意图与内容
的媒体类型正交，不从对方推导；非法组合具名拒绝，不静默改写；未知 `kind` 降级为按媒体类型
的默认渲染，且降级对消费端可见。`render.version` 是词表版本，首版为 `1`；扩展词表发布新版本，
不原地改义。语义不依赖 `render`：客户端据它选组件，不据它判断事实含义。

## 顺序、去重与客户端游标

**MS-06**：每帧带 `dedupKey`，同一事实至多投递一次到同一订阅。事实帧在一个订阅内按
`(position.seq, batch.index)` 字典序严格单调，同一批内 `index` 从 1 连续到 `count`，`seq` 之间
允许跳号（别的 Session 的提交占用了序号）；瞬态帧在其 owner 的 `ephemeral.seq` 上严格单调。
事实帧的 `dedupKey` 是事实的 eventId（[SE-12](../../session/v2/contract.md)），瞬态帧的
`dedupKey` 是 `"<issuer>:<epoch>:<seq>"`，`issuer` 是 owner 或代发的观察者（MS-24），控制帧的
`dedupKey` 由服务端生成。客户端发现 `(seq, index)` 倒退、同批 `index` 跳号，或同批未收齐就收到
更大的 `seq`，视为服务端错误：关流并以游标重订阅，服务端对该订阅以 `resync_required` 处置。
按 `dedupKey` 去重免的是重复呈现，不免安装：重发批中已见过的帧不再呈现，但该批未完成的正文
安装仍须完成才能推进游标（MS-08）。

**MS-07**：客户端游标是 `Cursor{domains: {<coordinationDomain>: seq}, visibility}`：每个协调域一个
已整批收齐的提交序号，加上主体对该 Session 的可见范围版本。首版只有一个协调域
（[CC-01](../../../compositions/core-work-coordination/v2/contract.md)），游标就是一个序号加一个版本；
一个提交触及几条耐久流只占一个域序号，各流的水位都从域序号派生，因此游标不按流、不按对象
增长。游标不包含任何瞬态位置：瞬态帧不可续，重连以基线取代（MS-23）。编码为不透明字符串，
只由服务端解释，内容含编码版本，旧版本游标按"需全量重取"处置；游标不携带授权，跨租户或跨
Session 使用一律无效（[SYS-TENANT](../../../../docs/requirements/system/constraints.md#sys-tenant)）。
"落后多少"是当前域序号与游标序号之差，补齐集合由此确定（MS-11）。

**MS-08**：游标只在一个提交的整批**安装完成**后推进到该提交的序号：收到该批的最后一帧
（`batch.index = batch.count`），且该批中只给位置的帧所引用的派生正文都已按位置读到本地。收到
同批的前几帧不推进；正文拉取失败不推进；重连后服务端从游标之后补齐，只收了一半的那一批因此
整批再来一次（MS-11），客户端按 `dedupKey` 丢掉重复的帧、补完未完成的安装。因此游标之
下没有半批，也没有未取回的派生正文——游标的含义是"到这个序号为止我什么都有了"
（[PF-022.C4](../../../../docs/requirements/product/agent/PF-022-multimodal-response-and-output.md#已确认要求)）。

**MS-09**：游标绑定主体对该 Session 的可见范围版本。该版本由
[SE-20](../../session/v2/contract.md) 的 `visibilityVersion(session, subject)` 给出，聚合租户
成员资格、Session 授予与请求可见范围；任何影响该主体对本 Session 内对象读权的授予或撤销都使
它变化。订阅时版本不符即全量重取（MS-12）；订阅期间版本变化即 `stream.closed{resync_required}`，
丧失 Session 级读权则 `stream.closed{unauthorized}`。授权变化不做逐帧回填：之前因无权被跳过的
帧不逐条补发，重新获权后由一次全量重取取得一致视图。

## 订阅、增量补齐与全量重取

**MS-10**：订阅请求 `subscribe(session, cursor | null, principal)` 先做 MS-14 的第一处核对并取得
主体的可见范围版本，再取当前域序号 `now`、投影对本 Session 的**完整覆盖水位** `completeTo`
（投影已把序号不超过它的提交全部 fold 进去，[SE-10](../../session/v2/contract.md)）与可服务下界
`floor`（保留期与投影重建状态给出），恒有 `floor ≤ completeTo ≤ now`。随后发
`stream.opened{target, resumable, baseline, resync}`：`target` 是本次要追平的位置，`resumable` 是
客户端**现在就可以保存**的恢复位置，两者分开。`cursor` 为空、`cursor` 的域序号小于 `floor`，或
可见范围版本不符时，`resync = full` 且 `resumable = null`（MS-12）；否则 `resync = none`、
`resumable = cursor`，随后按 MS-11 补齐。`baseline` 含进程内仍活跃的瞬态 owner：活跃 attempt 的
公开紧凑流与 `nextIndex`（MS-23）、活跃调用的帧水位与记录等级、当前待答请求列表；基线各项各经
自己权威的当前读权核对后才放入（MS-14），基线与 `now` 在同一同步切上取出。

**MS-11**：增量补齐来自投影，不来自流自己的缓冲：`changes(session, after, to) →
{batches, completeTo}`（[SE-10](../../session/v2/contract.md)）返回该 Session 作用域内序号落在
左开右闭区间 `(after, min(to, completeTo)]` 的全部已提交事实，按提交分组，组内按
[DR-01](../../durable-records/v2/contract.md) 的批内记录顺序；投影为事实提示帧后按 `(seq, index)`
投递。服务端为每个存续订阅记一个已推送水位 `sent = (seq, index)`，即最后推出的那一帧的位置，
整批推完时 `index = count`。每次听到 `records.envelope.committed` 广播都从 `sent` 而不是从广播自带
的序号推送该作用域内 `(sent, min(now, completeTo)]` 的事实，所以丢失广播不留洞；没有后继广播
时由周期对账（`sent` 低于 `completeTo` 即再推一次）补上。水位**永不越过** `completeTo`：投影没
有完整处理到的提交不推。队列装不下整批时推出前缀并把水位停在批内，有空位时从 `sent` 续推
（MS-17）。停住的订阅被保留期追上（`sent.seq` 低于 `floor`）时发 `stream.closed{resync_required}`，
客户端以游标重订阅并走全量重取。补齐期间到达的实时事实帧按 `dedupKey` 去重后排在补齐之后。

**MS-12**：全量重取只有一个读面：`snapshot(session, principal) → {asOf, history, queue, requests,
calls, visibility}`（[SE-10](../../session/v2/contract.md)），全部派生视图取自投影同一 fold 水位
`asOf = completeTo`，历史分页按同一 `asOf` 过滤（[SE-03](../../session/v2/contract.md) 的
`history(session, range, asOf)`），不存在各读面各一个时刻。其中 `requests` 与 `calls` 的可见范围
裁剪不属于投影：
[human-decisions v2](../../human-decisions/v2/contract.md) 与 [tools v2](../../tools/v2/contract.md) 各按
[SE-10](../../session/v2/contract.md) 把它们注册为投影贡献并在贡献里自带裁剪规则，投影只在同一
水位上调用它们——授权语义仍只有能力自己一份权威，时刻却只有 `asOf` 一个。`stream.opened` 的
`target` 取 `asOf`，`(asOf, now]` 由随后的补齐推进，期间收到的更大序号的帧由客户端暂存。**安装
完成点**是：快照全部读到，且其 `visibility` 与订阅时一致；此刻客户端才保存游标 `= asOf` 并应用
暂存帧。任一读取失败，或可见范围版本在安装期间变化，客户端不保存游标、重开订阅重来。服务端
不持有安装状态，能够终止一次安装的只有客户端。

**MS-13**：已提交事实没有缺口，只有落后与"投影暂不可用"；低于 `floor` 才是需全量重取。瞬态内容
的缺失一律以 `stream.gap` 明示，不冒充完整：慢客户端丢弃瞬态帧记 `trimmed`；进程重启后基线为空，
客户端草稿记 `crash_gap`；`ended{abandoned}` 记 `unconfirmed`；帧格式版本无解释器记
`decode_unavailable`；来源或投影暂不可用记 `unavailable`。缺口帧只说明"这里少了瞬态内容"，不改变
任何事实；耐久帧历史自身的缺口（保留期、读取故障、结果未知等）由
[tools v2](../../tools/v2/contract.md) 的帧读面在读取时返回，不经 `stream.gap` 另表达一遍。
投影不可用（重建中、版本不符、`changes` 返回不可用）时，已开订阅**停止投递任何事实帧**——没有
完整覆盖水位就不能证明前缀完整——发一次 `stream.gap{owner: session, reason: unavailable}`，
水位与游标原地不动，瞬态帧照常；新订阅照常受理，事实帧等投影恢复；恢复后从水位对账续推。
投影不可用期间"只发实时帧"不被允许。

## 作用域与投递

**MS-14**：读权核对恰在两处发生，各自向拥有该对象的能力读面求值，流服务不读原始记录、不自持
授权判断：

| 时点 | 核对什么 | 失败时 |
|---|---|---|
| 订阅建立 | 认证主体（[SYS-IDENTITY](../../../../docs/requirements/system/constraints.md#sys-identity)）、租户成员资格（[TG-01](../../tenant-governance/v1/contract.md)）、对该 Session 的 `read_metadata` 与 `read_content`（[SE-20](../../session/v2/contract.md)） | 拒绝订阅，不建立任何缓冲；无权与不存在的回答不可区分 |
| 每帧投递前 | 该帧 `subject` 指向对象的读权：调用帧与工具结果经 [tools v2](../../tools/v2/contract.md) 的帧读面，请求卡片经 [human-decisions v2](../../human-decisions/v2/contract.md) 的可见范围，媒体引用不在流内核对、取回时由 [media-content v2](../../media-content/v2/contract.md) 核对 | 该帧不投递（`batch.count` 按可见帧计）；连续失败或丧失 Session 级读权 → `stream.closed{unauthorized}` |
| 订阅建立时的基线各项 | 活跃 attempt 的公开流、活跃调用的帧水位、待答请求列表各经自己权威的当前读权，不凭外层 Session 主体一次放行 | 无权项不放入基线 |

事实广播的作用域路由只解决可见性投递，不构成授权（[LC-06](../../../compositions/session-run-agent-lifecycles/v2/contract.md)）：
服务端收到广播后仍经读面取内容。同租户管理员没有默认读权，紧急控制权限不扩大为读权。

**MS-15**：撤权（租户成员停用、Session 授予收回、Session 删除）在下一帧投递前生效：服务端发
`stream.closed{reason}` 并释放该订阅，不发补偿帧、不通知工作侧、不中断任何工作。已投递到客户端
的内容不能收回；本契约承诺的边界是"已披露的内容不可撤回"，不是"没有外部效果"。重新获权或
对象级获权后由一次全量重取取得一致视图（MS-09）。

**MS-16**：同一 Session 可有多个订阅（同一用户多设备、多个获准主体）。每个订阅有独立游标、独立
缓冲与独立读权核对；不存在共享的消费指针，一个订阅的投递、停住或关闭不影响另一个，也不影响
事实。

**MS-17**：背压只丢弃瞬态内容，从不丢弃事实，也从不向工作侧传导。事实提示与耐久帧共用每订阅
一个有界队列：队列满时该订阅的水位停住（可以停在一批中间），有空位时从 `sent` 续推，不丢事实、
不关订阅、不延迟任何提交；长期不消费的订阅按装配参数断开，客户端以游标重订阅。瞬态帧用与事实
队列分开的每订阅每 owner 有界环：满则丢最旧并欠下一个缺口，下一次投递先给 `stream.gap{trimmed}`，
不通知 owner、不延迟 owner。流服务从不向执行 owner、驱动器或 records 施加背压；耐久帧从 owner 到
records 的背压归 [tools v2](../../tools/v2/contract.md) 的记录等级，不在本契约。

**MS-18**：以下内容不进客户端流，其去向另有权威，且不因客户端需要而进入本流的词表：hooks 的
观察事实（`hooks.run.completed`、`hooks.config.rejected / unsupported`，
[external-hooks v1](../../external-hooks/v1/contract.md)）与诊断 log、trace、度量，归工程观测读面
（[OB-01 / OB-03](../../engineering-observation/v1/contract.md)）；审计事实按审计读面的读权披露；
媒体字节归 [media-content v2](../../media-content/v2/contract.md) 的读面，流只发引用，唯一例外是标记
为预览、不超过装配阈值的派生预览，原件仍以引用取回；秘密引用与事实 `data` 中的敏感字段经读面
裁剪后才可出现；模型正在写的调用参数增量、回放状态与加密推理原件由
[model-execution v2](../../model-execution/v2/contract.md) 的公开投影统一裁掉（MS-21）。hooks 对用户
可见的后果已经是队列与调用的事实，本流据那些事实呈现。

**MS-19**：Session 归档后订阅可继续存在并保持只读：后台调用的帧与结算照常到达，归档不停止工作，
也不因订阅而开新 Run（[SE-02 / SE-14](../../session/v2/contract.md)）。Session 删除后发
`stream.closed{session_deleted}`，之后对该 Session 的订阅请求一律回答不可访问。

## 模型 attempt 的瞬态帧协议

**MS-20**：一次模型 attempt 在客户端的实时形态恰是三种瞬态帧，它们不是事实；发布者是
model-execution，其发布义务归 [MC-12](../../model-execution/v2/contract.md)，本条定义帧的身份与形状：
`model.attempt.started{attempt, epoch, pub, purpose, request, provider, model, startedAfter}`、
`model.attempt.chunk{attempt, epoch, pub, index, at, chunk}`、
`model.attempt.ended{attempt, epoch, pub, index, outcome}`，其中 `outcome` 恰是
`committed{position, settled: success | partial | failed | cancelled | unknown}` 或
`abandoned{reason: writer_unavailable | owner_lost | source_lost, observer: owner | message_stream}`。
`attempt` 是 [model-execution v2](../../model-execution/v2/contract.md) 的独立 attempt 身份，没有 Run 的
工作其 Step 引用为空；`epoch` 是该工作的执行代次（[run v2](../../run/v2/contract.md)），只作重基线
依据，不作缺帧检测；`index` 在 attempt 内稠密零起，`ended.index` 等于已发 chunk 数；`startedAfter`
是 attempt 开始时的客户端游标值，供客户端把草稿排在正确的事实之后。`purpose` 在 `started` 上就
带（`reply | title | compression | auxiliary`，词表归 [MC-06](../../model-execution/v2/contract.md)）：客户端
只把 `reply` 展开为助手草稿，其它目的不产生草稿，结算时直接撤下。

**MS-21**：流出的 chunk 词表恰是 `block-start{index, blockType}`、`text-delta`、
`reasoning-delta{text, form: text | summary}`、`tool-call-start{index, id, name}`、`tool-call-end{index}`、
`block-end{index, block}`、`usage{usage}`、`finish{reason}`，它是私有词表经公开投影 `toPublic` 得到的。
`toPublic` 是对一个 attempt **整段私有序列**的确定性转换，且对私有序列前缀单调（历史与实时看到
同一块序列）：公开 `index` 由它稠密分配，被过滤的私有 chunk 不留洞；`block-end` 对 tool-call 块只带
标识与名称、不带参数；推理块的形态由其第一条公开 delta 决定并写在 `block-start`，同一私有块里后
到的不同形态另开一个公开块，有明文的块不再流出该块的摘要；摘要先到、明文后到时两个公开块都
保留，已流出的帧不撤回，是否折叠归客户端呈现。实时帧、耐久的紧凑流记录与重连基线三处出口共用
同一 `toPublic` 对同一私有序列的结果，由 [MC-14](../../model-execution/v2/contract.md) 保证，没有第二
条路径把私有载荷送出（[OB-03](../../engineering-observation/v1/contract.md)）：
调用参数的增量不流出，客户端只看到"开始写调用"与"写完了"，完整参数随调用提议事实到达；回放
状态与加密推理原件只在 model-execution 的私有记录与读面。

**MS-22**：`ended{committed}` 只在 attempt 结算记录取得 [DR-02](../../durable-records/v2/contract.md) 的
`committed` 回执之后发出，发起写入或队列接纳都不算；`ended.outcome.position` 指向的提交因此存在
且不超过该流当前水位。客户端把 chunk 累积视为草稿，收到 `ended{committed, position}` 后用该位置的
派生消息**原子替换**整段草稿；被截断或未完成的块不由流补全，而由结算事实按
[CD v2](../../../data/core-work/v2/contract.md) 的缺失标记保留已流出的前缀，客户端从派生消息看到前缀
与"未完成"。`ended{abandoned}` 只在没有任何结算记录能提交时发出，客户端把草稿标 `unconfirmed` 并
等待事实收尾。缺帧检测靠 attempt 内 `index` 稠密与 `ended` 必达：结算事实已到而 `ended` 未到时，
客户端按事实收尾。

**MS-23**：重连基线取自 [MC-13](../../model-execution/v2/contract.md) 的读面
`attempts(session) → {items, version}`，每项含 attempt 身份、`epoch`、`nextIndex` 与经 `toPublic`
的公开紧凑流；该读面的快照与帧发布在提供者内同一互斥下完成，发布计数 `pub = {gen, n}` 由
model-execution 分配（[MC-12](../../model-execution/v2/contract.md)），`version` 是快照时的 `pub`。
本契约据此定义消费侧的同步切：先读基线再订阅（或反
过来），在同一 `gen` 内丢弃 `n` 不大于 `version.n` 的帧，其余接在基线之后；收到 `gen` 与已知
`version.gen` 不同的帧时先重读 `attempts` 取新基线再判定——换代不靠另一条通知，帧自己说明。客户端
把基线展开为草稿，再接收 `index` 不小于 `nextIndex` 的 chunk；`epoch` 不匹配或 `index` 不连续时丢弃
草稿并重开订阅。进程重启后基线为空，客户端草稿记 `crash_gap`，靠结算事实或 Run 侧失败事实收尾。

**MS-24**：来源消失而进程未崩溃（模型执行提供者卸载、换代、读面失联）时，流服务对自己账上每个
活跃 attempt 代发 `ended{abandoned, reason: source_lost, observer: message_stream, index: 已见 chunk 数}`，
并把该 attempt 在自己账上记为已关闭：此后同一 attempt 的任何帧——包括来源恢复后 owner 迟到的 chunk
与 owner 自己的 `ended`——一律丢弃。代发不证明 owner 已停止发布，所以关闭的是消费者自己的账，不是
owner 的；代发帧的 `dedupKey` 第一段是 `observer` 而非 owner，因此不与 owner 的帧同键。发现来源消失
的责任在消费者（读面调用失败或服务撤回通知任一即触发），不在 model-execution。客户端草稿记
`unconfirmed`，随后按该 attempt 的结算事实或 Run 侧失败事实按位置读消息收尾。

## 验证边界

本契约的行为模型只覆盖单个协调域内的游标推进、服务端水位、补齐与瞬态收尾（验证说明）。
按位置拉取派生正文的安装过程、全量重取的多视图快照、授权与可见范围版本的变化、来源消失的代发、
媒体与 `render`、多个协调域、租户级轻量流与传输装配均不在模型内，由规范场景与提供者验收承担。
跨协调域部署前必须先兑现 [LC-09](../../../compositions/session-run-agent-lifecycles/v2/contract.md) 的
义务清单：本版只承诺同一协调域内的顺序与完整前缀，`Cursor.domains` 的多域形状在那些义务兑现前
不构成跨域承诺。
