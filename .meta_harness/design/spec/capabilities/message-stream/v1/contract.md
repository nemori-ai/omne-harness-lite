# 客户端消息流与恢复 v1

坐标为 `(omne-harness-lite-design-2026-09-15, capability.message-stream, 1)`，状态为 candidate、
`acceptance:null`。MS-01～MS-24 从 legacy current 同名 v1 重基；D-015 只证明旧谱系接受，
不接受本坐标。此能力拥有公开帧、订阅、cursor、reconcile 与 transient gap，不拥有事实、
准入、投影、授权或第二份历史。

M/L 联合交接：durable outcome 由 MC-06 ledger 经 SessionProjection changes/snapshot 恢复；
active transient 由 MC-12～MC-14 compact public state/source cut 恢复，两条协议不共享位置或权威。
实时发布与 active state 共用同一 `toPublic`/fold；`ended` 仅在 DR-02
receipt 后出现；媒体对象的来源元数据使用 `producedBy{call: CallRef}`，`MediaRef`
仍只含 `tenantId/mediaId`；同一 MediaRef/`mediaId` 可以同时被过程帧和终态结果引用，
消费者按 `mediaId` 只呈现一次，未取得耐久引用的媒体不进入终态。依赖的精确坐标与条款见本轮 catalog delta。正文直接消费 CD/CC/DR、Session SE-01/02/03/10/14/18/19/20、Run、RunDriver、Tools、HD、MC、CT、TG、AU、OB、External Hooks HK-17 与 lifecycle LC-06/09；没有列出的上界输入不是隐含依赖。

## 定义与原则

**MS-01**：客户端消息流是投递面，不是权威。它不产生事实、不持有耐久状态、不做准入，也不
持有 records 写面：每一帧要么可追溯到一条已提交事实在协调域内的位置，要么是一条带 attempt
或调用身份的瞬态观察，要么是本契约封闭词表内的控制帧（MS-04）。客户端的任何接收、确认或
游标推进都不改变事实，也不使任何工作前进或停止；订阅的建立与结束不影响 Run、调用、请求与
记录的状态（PF-013.C10、
LC-06）。流服务在运行时重建后为
空：它不重放自己的历史，客户端按游标从投影补齐（MS-11）。

**MS-02**：一个订阅恰对应一个 Session。该 Session 内 Run、Step、调用、attempt、请求的帧都在
这条流里，以信封的 `subject` 区分，客户端按身份分流，不按对象另开连接。租户级的列表变化
（Session 目录、待办池计数）走另一条轻量流，只投递不带正文的提示（`session.lifecycle.changed`、
`hd.request.created / closed`），不扩展本流的词表，也不承载任何 Session 正文。子 Session 的帧
合并不在本版承诺范围
（PF-004），
本版不为其预留语义。

## 帧信封与封闭的帧类别

**MS-03**：每帧的信封是
`Frame{kind, dedupKey, subject, at, position | null, batch | null, ephemeral | null, render | null,
payload, payloadRef}`。`position = {domain, seq}` 是产生该帧的提交在协调域内的位置
（DR-01）；`batch = {index, count}` 是该提交在本订阅**投递前
核对后可见**的帧中排第几、共几条，因而是订阅局部的数字，而 `position.seq` 与 `dedupKey` 是全局
身份；`ephemeral = {owner, epoch, seq}` 是瞬态帧在其 owner 内的单调序号。`position` 与
`ephemeral` 恰有一个非空，或两者皆空（控制帧）；`subject` 至少含 `tenant` 与 `session`。信封不
携带内部坐标（存储偏移、进程句柄、内部 id），公开面的字段集合是封闭的
（SYS-OBSERVABILITY.C5 / C6、
OB-03）。

**MS-04**：帧恰有四类，类别集合封闭：

| 类别 | `kind` | `payload` 与位置 |
|---|---|---|
| 事实提示 | 各耐久流事实名原样（三段式，由 session v1、run v1、tools v1、human-decisions v1 各自拥有，本契约不复制该词表） | 小事实带事件 `data`；产生派生消息的事实（取批、attempt 结算、调用结算、Step 开启）只带 `position` 与 `subject`，正文由客户端按位置从 `history` 读面拉 |
| 耐久帧 | `tools.frame.<kind>`（记录等级为 `critical` 或 `durable`，tools v1） | 帧 payload 或 `payloadRef`；`position` 取 `frames(S)`（SE-19）的提交位置，`subject` 带 `call` 与 `attempt`；`render` 来自命令声明 |
| 瞬态 | `model.attempt.started / chunk / ended`（MS-20）、记录等级为 `transient` 的 `tools.frame.<kind>` | 帧内容；`ephemeral` 非空 |
| 控制 | `stream.opened{target, resumable, baseline, resync: none \| full}`、`stream.gap{owner, epoch?, reason}`、`stream.source-unavailable{attempt, owner, generation, reason}`、`stream.source-generation-changed{sourceId,fromGeneration,toGeneration,newTransformVersion,transitionId}`、`stream.closed{reason}` | 见 MS-10、MS-13、MS-15、MS-23；`position` 与 `ephemeral` 皆空 |

控制帧的 `kind` 恰是上表五个；授权投影组及其 `attemptStateUpdates` 通过 SE-10 的
`changes` 读面交付，不伪装为事实帧或新增隐式控制帧。只有客户端主动读取并安装该响应，
才取得隐藏区间的完整覆盖证明。`stream.gap.reason` 恰是
`trimmed | crash_gap | unconfirmed | decode_unavailable | unavailable`，前四值取
tools v1 帧缺口词表中的同名值，`unavailable` 由本契约新增，表示来源
或投影暂不可用；`stream.closed.reason` 恰是
`unauthorized | unavailable | session_deleted | resync_required`。
人类请求卡片不是新的帧种类：`hd.request.created / closed` 与 `hd.decision.recorded` 是事实提示，
卡片内容与可答性来自 human-decisions v1 的读面；问答型答复
的正文以调用结算的 `tool_result` 进入历史。哪些事实不进本流由 MS-18 封闭。

**MS-05**：帧可带呈现标识 `render{kind, version, language?}`。`kind` 的首版词表恰九值：
`plain`（纯文本）、`markdown`、`html`（可直接渲染的片段）、`terminal`（ANSI 语义）、`code`
（语言由 `render.language` 给出，该参数只配 `code`）、`log`、`table`（结构化文本）、`widget`
（文本且媒体类型为 `text/html`）、`image`（媒体引用）。随词表成立的三条规则：渲染意图与内容
的媒体类型正交，不从对方推导；非法组合具名拒绝，不静默改写；未知 `kind` 降级为按媒体类型
的默认渲染，且降级对消费端可见。`render.version` 是词表版本，首版为 `1`；扩展词表发布新版本，
不原地改义。语义不依赖 `render`：客户端据它选组件，不据它判断事实含义。

## 顺序、去重与客户端游标

**MS-06**：每帧带 `dedupKey`。传输允许在断线、重连、确认丢失或整批补齐时重发同一帧；
“至多一次”只指客户端按 `dedupKey` 安装／呈现同一语义帧至多一次，不是网络投递恰好一次。
单连接发送可以重发，但必须保持事实帧的批次顺序，不能把后批发到未完成的前批之前。

客户端去重安装后的事实序列按 `(position.seq, batch.index)` 严格单调；同批 `index` 从 1 连续到
`count`，`seq` 可以因其它 Session 的提交而跳号。客户端收到重发帧时仍把它计入当前批的完整性，
只抑制第二次呈现；收到倒退、乱序或越过未完成批的帧时关闭订阅并从最后 installed cursor 重开。
瞬态帧只在其 owner 的 `ephemeral.seq` 上单调，可以因裁剪产生 gap。事实帧的
`dedupKey` 是 DR-01 的事实 `eventId`；瞬态帧的 `dedupKey` 是
`"<issuer>:<epoch>:<seq>"`，`issuer` 是实际发布 owner 或受信观察者；控制帧的
`dedupKey` 由服务端生成并在同一控制事实重发时保持稳定。不能以连接内计数代替。

**MS-07**：客户端游标是 `Cursor{domains: {<coordinationDomain>: seq}, visibility}`：每个协调域一个
已完整安装该主体授权投影视图的提交前缀序号，加上主体对该 Session 的可见范围版本。首版只有一个协调域
（CC-01），游标就是一个序号加一个版本；
一个提交触及几条耐久流只占一个域序号，各流的水位都从域序号派生，因此游标不按流、不按对象
增长。游标不包含任何瞬态位置：瞬态帧不可续，重连以基线取代（MS-23）。编码为不透明字符串，
只由服务端解释，内容含编码版本，旧版本游标按"需全量重取"处置；游标不携带授权，跨租户或跨
Session 使用一律无效（SYS-TENANT）。
"落后多少"是当前域序号与游标序号之差，补齐集合由此确定（MS-11）。

**MS-08**：事实帧是低延迟提示，`batch.index = batch.count` 只证明该订阅本批提示已收齐，
**不**证明授权投影批的完整 state updates、派生正文或 hidden-only 覆盖已安装。客户端耐久游标只有两条合法安装路径：增量按
MS-11 的 `changes(after,to)` 响应推进，首次、过期或可见范围换代的全量路径按 MS-12 的
`snapshot` 同水位 CAS 安装后推进到 `asOf`。增量路径中，逐个完整授权投影批把 history/state updates 同水位原子安装，
然后将没有可见项且已由响应 `coveredThrough` 证明覆盖的间隙一并推进；任一正文或 state update
读取/安装失败则停在最后完整位置。收到前几帧、最后一帧或仅有 `stream.opened` 都不单独推进游标。
重连可重发提示帧，客户端按 `dedupKey` 抑制重复呈现，再由 changes 补齐；游标之下没有半批、
未取回的派生正文或未安装的状态更新——游标的含义是"到这个序号为止授权投影视图完整安装"
（PF-022.C4）。

**MS-09**：游标绑定主体对该 Session 的可见范围版本。该版本由
SE-20 的 `visibilityVersion(session, subject)` 给出，聚合租户
成员资格、Session 授予与请求可见范围；任何影响该主体对本 Session 内对象读权的授予或撤销都使
它变化。订阅时版本不符即全量重取（MS-12）；订阅期间版本变化即 `stream.closed{resync_required}`，
丧失 Session 级读权则 `stream.closed{unauthorized}`。授权变化不做逐帧回填：之前因无权被跳过的
帧不逐条补发，重新获权后由一次全量重取取得一致视图。

## 订阅、增量补齐与全量重取

**MS-10**：订阅请求 `subscribe(session, cursor | null, principal)` 先做 MS-14 的第一处核对并取得
主体的可见范围版本，再取当前域序号 `now`、投影对本 Session 的**完整覆盖水位** `completeTo`
（投影已把序号不超过它的提交全部 fold 进去，SE-10）与可服务下界
`floor`（保留期与投影重建状态给出），恒有 `floor ≤ completeTo ≤ now`。随后发
`stream.opened{target, resumable, baseline, resync}`：`target` 是本次要追平的位置，`resumable` 是
客户端**现在就可以保存**的恢复位置，两者分开。`cursor` 为空、`cursor` 的域序号小于 `floor`，或
可见范围版本不符时，`resync = full` 且 `resumable = null`（MS-12）；否则 `resync = none`、
`resumable = cursor`，随后按 MS-11 补齐。`baseline` 含进程内仍活跃的瞬态 owner：活跃 attempt 的
compact public state、`coveredThrough`、transformVersion 与 source cut（MS-23）、活跃调用的帧水位与记录等级、当前待答请求列表；基线各项各经
自己权威的当前读权核对后才放入（MS-14）。`now` 只是本次追平目标的观察，不与 active baseline 声称同一同步切：耐久全量视图沿 MS-12 的 `asOf`，active owner 沿 MS-23 先建立 callback 再读 compact state/cut，事实缺口由 changes/reconcile 补齐。

**MS-11**：增量补齐来自投影，不来自流自己的缓冲。只有 `stream.opened{resync:none}`
且传入的 installed cursor/visibilityVersion 仍有效，或 MS-12 全量 snapshot 已原子安装得到新 cursor 后，
客户端才调用 `changes`；`stream.opened{resync:full,resumable:null}` 后必须先走 MS-12，不能以无效旧游标或
空游标直接增量补齐。满足前提后，客户端在 opened 后、收到事实提示后、重连后，以及即使没有任何帧
也按有界本地对账间隔主动调用
`changes(session, installedCursor, to: commitPosition | latest, principal, visibilityVersion) →
{projectionBatches, resolvedTo, coveredThrough, floor, visibilityVersion}`（SE-10）。帧提示可让客户端以
其位置作为具体 `to` 立即追平；周期本地对账即使没有帧也传 `to=latest`，服务端在调用开始固定
`resolvedTo=projection.completeTo`。响应只承诺 `installedCursor ≤ coveredThrough ≤ resolvedTo`
（具体 `to` 时必 `coveredThrough ≤ to`），且不越过服务端完整覆盖水位；未达 `resolvedTo`
时客户端从新的 installedCursor 再请求，投影恢复后周期对账继续推进。此读面返回按原 commitPosition
分组的授权投影批。每组只含 principal 可见 facts/state updates，但对授权视图原子完整；
隐藏记录不发 placeholder 或逐对象 rejection。hidden-only durable batch 可固定编码为空投影组，也可由
响应 `coveredThrough` 整体跨过；同 provider/version 的编码固定，客户端不得用空组/缺号
分类对象。非空组同时携完整 `attemptStateUpdates` 与历史/正文引用，按原批位置顺序在客户端原子安装；
事实提示帧按 DR-01 批内记录顺序与 `(seq,index)` 投递，但不承载完整安装证明。即使该批没有
可公开事实提示而只有状态更新，changes 仍返回非空组；即使整个区间没有授权内容，changes 的
`coveredThrough` 仍能推进客户端 cursor。服务端为每个存续订阅记一个已推送水位 `sent = (seq, batch.index)`（`batch.index` 是订阅局部的批内推送序，不是 SE-03 位置里的耐久序 `index`），即最后推出的那一帧的位置，
整批推完时 `index = count`。每次听到 `records.envelope.committed` 广播都从 `sent` 而不是从广播自带
的序号推送该作用域内 `(sent, min(now, completeTo)]` 的事实，所以丢失广播不留洞；没有后继广播
时由周期对账（`sent` 低于 `completeTo` 即再推一次）补上。水位**永不越过** `completeTo`：投影没
有完整处理到的提交不推；空授权投影区间可直接把**服务端 sent**水位推进到 completeTo，
客户端仍须通过 changes 响应安装覆盖证明才推进 installed cursor。队列装不下非空授权批时
推出前缀并把 sent 停在批内，有空位时从 sent 续推
（MS-17）。停住的订阅被保留期追上（`sent.seq` 低于 `floor`）时发 `stream.closed{resync_required}`，
客户端以游标重订阅并走全量重取。补齐期间到达的实时事实帧按 `dedupKey` 去重后排在补齐之后。

**MS-12**：全量重取只有一个读面：`snapshot(session, principal, replacementToken) → {replacementToken,asOf,floor,
visibilityVersion,coverage,history,attemptStates,queue,requests,calls}`（SE-10），全部派生视图取自投影同一 fold 水位
`asOf = completeTo`，历史分页按同一 `asOf` 过滤（SE-03 的
`history(session, range, asOf)`），只在完整 commit batch 边界切页，不存在各读面各一个时刻。其中 `requests` 与 `calls` 的可见范围
裁剪不属于投影：
human-decisions v1 与 tools v1 各按
SE-10 把它们注册为投影贡献并在贡献里自带裁剪规则，投影只在同一
水位上调用它们——授权语义仍只有能力自己一份权威，时刻却只有 `asOf` 一个。`stream.opened` 的
`target` 取 `asOf`，`(asOf, now]` 由随后的补齐推进，期间收到的更大序号的帧由客户端暂存。**安装
完成点**是：快照的 history 与当前主体获准的完整 attemptStates 集合已经同一原子安装，且其 `visibilityVersion` 与订阅时
一致；且 replacementToken 仍是当前重取代次、`asOf >= installedCursor`。客户端用一个 CAS 同时替换
history/states/cursor/revision/semantic-close bookkeeping；不能只安装消息或只推进 cursor，也不能用迟到
snapshot 把 terminal/一次 close/cursor 回退。此刻客户端才保存游标 `= asOf` 并应用
暂存帧。接口不接受本地旧草稿 identity；projection 只给授权后的集合及 collection-level coverage。
snapshot 缺席的本地旧草稿只进入客户端可逆的 local evidence_unavailable，不产生业务 outcome 或 semantic close，
也不能区分隐藏、不存在与已过期。授权投影定义换代要求 full resync；隐藏对象业务提交可推进 asOf 而不换 visibilityVersion。
任一读取失败，或可见范围版本在安装期间变化，客户端不保存游标、重开订阅重来。服务端
不持有安装状态，能够终止一次安装的只有客户端。

**MS-13**：已提交事实没有缺口，只有落后与"投影暂不可用"；低于 `floor` 才是需全量重取。瞬态内容
的缺失一律以 `stream.gap` 明示，不冒充完整：慢客户端丢弃瞬态帧记 `trimmed`；进程重启后基线为空，
客户端草稿记 `crash_gap`；已知存在但丢失的 terminal hint 记 `unconfirmed`；帧格式版本无解释器记
`decode_unavailable`；来源或投影暂不可用记 `unavailable`。缺口帧只说明"这里少了瞬态内容"，不改变
任何事实；耐久帧历史自身的缺口（保留期、读取故障、结果未知等）由
tools v1 的帧读面在读取时返回，不经 `stream.gap` 另表达一遍。
投影不可用（重建中、版本不符、`changes` 返回不可用）时，已开订阅**停止投递任何事实帧**——没有
完整覆盖水位就不能证明前缀完整——发一次 `stream.gap{owner: session, reason: unavailable}`，
水位与游标原地不动，瞬态帧照常；新订阅照常受理，事实帧等投影恢复；恢复后从水位对账续推。
投影不可用期间"只发实时帧"不被允许。

## 作用域与投递

**MS-14**：读权核对恰在两处发生，各自向拥有该对象的能力读面求值，流服务不读原始记录、不自持
授权判断：

| 时点 | 核对什么 | 失败时 |
|---|---|---|
| 订阅建立 | 认证主体（SYS-IDENTITY）、租户成员资格（TG-01）、对该 Session 的 `read_metadata` 与 `read_content`（SE-20） | 拒绝订阅，不建立任何缓冲；无权与不存在的回答不可区分 |
| 每帧投递前 | 该帧 `subject` 指向对象的读权：调用帧与工具结果经 tools v1 的帧读面，请求卡片经 human-decisions v1 的可见范围，媒体引用不在流内核对、取回时由 media-content v1 核对 | 该帧不投递（`batch.count` 按可见帧计）；连续失败或丧失 Session 级读权 → `stream.closed{unauthorized}` |
| 订阅建立时的基线各项 | 活跃 attempt 的公开流、活跃调用的帧水位、待答请求列表各经自己权威的当前读权，不凭外层 Session 主体一次放行 | 无权项不放入基线 |

事实广播的作用域路由只解决可见性投递，不构成授权（LC-06）：
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
records 的背压归 tools v1 的记录等级，不在本契约。

**MS-18**：以下内容不进客户端流，其去向另有权威，且不因客户端需要而进入本流的词表：hooks 的
观察事实（`hooks.run.completed`、`hooks.config.rejected / unsupported`，
external-hooks v1）与诊断 log、trace、度量，归工程观测读面
（OB-01 / OB-03）；审计事实按审计读面的读权披露；
媒体字节归 media-content v1 的读面，流只发引用，唯一例外是标记
为预览、不超过装配阈值的派生预览，原件仍以引用取回；秘密引用与事实 `data` 中的敏感字段经读面
裁剪后才可出现；模型正在写的调用参数增量、回放状态与加密推理原件由
model-execution v1 的公开投影统一裁掉（MS-21）。hooks 对用户
可见的后果已经是队列与调用的事实，本流据那些事实呈现。

**MS-19**：Session 归档后订阅可继续存在并保持只读：后台调用的帧与结算照常到达，归档不停止工作，
也不因订阅而开新 Run（SE-02 / SE-14）。Session 删除后发
`stream.closed{session_deleted}`，之后对该 Session 的订阅请求一律回答不可访问。

## 模型 attempt 的瞬态帧协议

**MS-20**：一次模型 attempt 在客户端的实时形态恰是三种瞬态帧，它们不是事实；发布者是
model-execution，其发布义务归 MC-12，本条定义帧的身份与形状：
`model.attempt.started{attemptId, attemptEpoch, runEpoch?, sourceGeneration, transformVersion, pub,
purpose, request, routeBinding, historyAnchor}`、
`model.attempt.chunk{attemptId, attemptEpoch, runEpoch?, sourceGeneration, transformVersion, pub, index, at, chunk}`、
`model.attempt.ended{attemptId, attemptEpoch, runEpoch?, sourceGeneration, transformVersion, pub, index,
dispositionRef:{attemptId,attemptEpoch,revision,commitPosition}}`。内外 attemptId/attemptEpoch 必须相等，
不等即拒绝该 frame 并重订阅；这是与 MC-12 完全相同的唯一 dispositionRef shape。ended 只定位已经
耐久提交的 MC-06 disposition；它不携带独立
outcome，也没有 owner_lost/writer_unavailable 到 abandoned 的旁路。observer 的 source loss 只用 MS-24
非终态控制帧表达。

`attemptId` 是 model-execution v1 的独立持久身份；`attemptEpoch` 是同一 attempt 的执行权代次，
`runEpoch?` 是有 Run 工作的 Run 执行代次，无 Run 工作为空。两者都不作缺帧检测，也不能相互比较。
`index` 在 attemptEpoch 内稠密零起，`ended.index` 等于已发 chunk 数。`historyAnchor` 是
`session{position}` 或 `work{workRef,basisRevision}` 的封闭联合，客户端只把前者映射到当前可见 Session
视图；它不是带 visibility 的客户端 cursor。`routeBinding` 是预绑定路线，不冒充 durable disposition
才能给出的 actual provider/model。`purpose` 在 `started` 上就
带（`reply | title | compression | auxiliary`，词表归 MC-06）：客户端
只把 `reply` 展开为助手草稿，其它目的不产生草稿，结算时直接撤下。

**MS-21**：流出的 chunk 词表恰是 `block-start{index, blockType}`、`text-delta`、
`reasoning-delta{text, form: text | summary}`、`tool-call-start{index, id, name}`、`tool-call-end{index}`、
`block-end{index, block}`、`usage{usage}`、`finish{reason}`，它是私有词表经公开投影 `toPublic` 得到的。
`toPublic` 是对一个 attempt **整段私有序列**的确定性转换，且对私有序列前缀单调（历史与实时看到
同一块序列）：公开 `index` 由它稠密分配，被过滤的私有 chunk 不留洞；`block-end` 对 tool-call 块只带
标识与名称、不带参数；推理块的形态由其第一条公开 delta 决定并写在 `block-start`，同一私有块里后
到的不同形态另开一个公开块，有明文的块不再流出该块的摘要；摘要先到、明文后到时两个公开块都
保留，已流出的帧不撤回，是否折叠归客户端呈现。实时帧、耐久的紧凑流记录与重连基线三处出口共用
同一 `toPublic` 对同一私有序列的结果，由 MC-14 保证，没有第二
条路径把私有载荷送出（OB-03）：
调用参数的增量不流出，客户端只看到"开始写调用"与"写完了"，完整参数随调用提议事实到达；回放
状态与加密推理原件只在 model-execution 的私有记录与读面。

**MS-22**：耐久恢复只消费 SessionProjection 的 `changes/snapshot`；客户端按 MS-11 主动对账，
服务端事实提示、ended 或无帧都不能代替 changes 的授权区间覆盖证明。`commitPosition{domain,seq}` 是
DR 完整 commit batch 的位置；不同于 `eventId{domain,seq,recordIndex}`、记录批内位置、订阅 frame
`batch.index` 与任何 pub。`projection.completeTo/floor` 和 durable client cursor 只在同 domain/
projection generation 比较；客户端原子安装完整批及其正文或明确 disposition 后才推进 cursor。

M 的 durable current disposition 是终态权威。Projection 的完整 commit batch 携
`attemptStateUpdates`，full snapshot 携当前主体获准的完整 `attemptStates`；两者使用 SE-03 封闭 union
`in_progress | settled_with_message | settled_without_message | abandoned`。集合接口不接受猜测的 attempt
identity，也不逐项区分隐藏、不存在或已过期。空正文、active 缺席或 ended hint 都不能代替权威状态。
settled_with_message 原子安装/替换草稿；settled_without_message 关闭
草稿但不造消息，其中 `outcome=unknown` 是已耐久业务终态，首次出现即呈现“结果未知”并执行一次
semantic close。M 的无 receipt 窗口 `closing/outcome_unresolved` 不是 disposition，只从 M ledger 耐久
`attempt.closing.pending` observation 在同一 asOf fold 为
`in_progress{pendingReason: outcome_unresolved}` 出现并保留草稿，不能由 active snapshot 合成；没有
terminal revision 的 batch 仍必须带这份完整 state update。full snapshot 中缺少旧本地草稿只使客户端
记录可逆的 local evidence_unavailable，不是 failed/unknown/abandoned、不执行 semantic close；abandoned
必须带权威 fence。

客户端 reducer 以持久 attempt identity 合并 active state、disposition revision 与 ended hint。durable
disposition 支配同 attempt 所有不大于其 attemptEpoch 的 active epoch；fact-before-ended、ended-before-fact、
迟到 ended、重启与重发都只执行一次 semantic close。unknown 后的新 current revision可把呈现单调细化为
success/partial/failed/cancelled并安装正文，但不重开草稿/Run或重复 close。abandoned 必须引用权威 fence，
迟到费用/审计不改变业务处置。MessageStream 的 sent/client ack 只作诊断，installed仍由客户端拥有。

**MS-23**：active transient 使用独立 subscribe-first 协议。E 为 subscription 创建新的
subscriberGeneration，按当前 visibilityVersion 向一个 M `source/sourceGeneration` 注册 listener。MC-12
registration 在线性化点返回 effective cut；此后 callback 对每个 pub.n 可靠有序入 E 有界队列，E 也检查
连续性。某一 callback 失败/溢出只撤该 listener/subscription并 resubscribe；不把共享 source 标为
unavailable，也不影响其他订阅。只有 publisher generation 本身终止/不可读才发 source-unavailable。

listener effective 后读 MC-13 compact `activePublicState` 与 cut。item 的 `coveredThrough` 是下一未折叠
chunk index，state 等价于同 transformVersion 下折叠 `[0,coveredThrough)`；它不是 frame 数组。
客户端按 attemptId/attemptEpoch 原子安装 baseline state。baseline item 覆盖 started 语义与
`[0,coveredThrough)` chunk fold，安装时建立 started dedup identity `(attemptId,attemptEpoch)` 和 chunk dedup
identity `(attemptId,attemptEpoch,index)`；ended 从不被 baseline 覆盖，只按 dispositionRef 去重。buffer 中
与 snapshot 同 sourceGeneration/transformVersion/attemptEpoch 的 chunk，若 `index < coveredThrough` 已被
state prefix 覆盖则去重；其余增量按 pub.n 与 attemptEpoch-local index 应用。新 epoch baseline 安装后，
旧 attemptEpoch 的 buffered started/chunk/ended 一律不得应用。state reducer/version 无法解释时 resubscribe。

E 在与 callback enqueue 相同的队列锁/串行器内排空并原子完成 `buffer empty → live`；因此延迟 n=11
而 n=12 先进入 live 不合法，观察到即 resubscribe。source/subscriber generation、attempt epoch、
transformVersion、visibilityVersion、pub、chunk index 与 commit position各自分域，禁止跨域比较。

transformVersion 与 sourceGeneration 一一绑定。MC-12 的 `source.generation.changed` 是唯一换代观察；
E 在同一 callback 队列消费它，先排完 marker 之前的旧代 pub，再停止旧代 drain，向客户端发
`stream.source-generation-changed`（dedupKey=transitionId），撤旧 listener/queue 并重订阅 toGeneration；
marker 后任何旧代 pub 都是协议错误。visibility 变化、单订阅 overflow、真正 source failure 或进程重启也换 subscriberGeneration，
重新 authorize→register/effective→snapshot/cut→atomic install→drain→live；只清 buffer 后沿用旧 listener
不算 resubscribe。active 失败不阻塞 MS-22 durable changes。慢客户端不反压 M/事实 owner。当前 Cursor
模型不表达本协议，不能作为证明。

本协议的 safety 不依赖“不溢出”：overflow 总是撤当前订阅并换代重来。active handoff 的有界进展只在
以下环境前提下成立：发布总量有限；register/snapshot/install/drain 最终公平执行；至少有一次重订阅的
buffer 容量足以容纳当前有限模型域两代最坏重叠。模型配置界为 `2 * (MaxChunks + 1)`，仅是该有限
模型的验证前提，不是生产 buffer sizing 契约；生产容量须由实现负载与背压策略另行验收。持续生产或
容量反复低于模型界允许持续 overflow/resubscribe，本版不宣称最终进入 live；durable channel 仍须独立进展。

**MS-24**：observer source-lost 与 owner abandonment 是不同事件。读面失联、provider 撤回或 listener
generation 消失时，message-stream 只能发非结算控制帧
`stream.source-unavailable{attempt, owner, generation, reason: source_lost}`，并保留该 attempt 的
unresolved draft；此帧无 durable position，不进入 cursor/replay，不声称 owner 停止、失败或不会结算。
E 按 MS-23 真正 resubscribe；旧 draft最终由 MS-22 durable disposition 收口。

只有 M current disposition 引用权威 execution fence 时，其 ended 才可通过 dispositionRef 提示 abandoned；
message-stream observer 永不代发。写入是否提交未知保持 closing/outcome_unresolved，不得改写成 durable
unknown；只有 M 明确提交的业务 unknown 才是 terminal disposition。若 disposition evidence 已按 Session retention
合法过期或不再可见，客户端只能作 local evidence_unavailable 非业务处置，不能从 durable/active 缺席推 outcome。
source-unavailable 可重复传输但按 `(attempt,source,generation,source_lost)` 去重呈现；它关闭当前交接，
不关闭 attempt。

## 验证边界

本契约的行为模型只覆盖单个协调域内的游标推进、服务端水位、补齐与瞬态收尾（验证说明）。
按位置拉取派生正文的安装过程、全量重取的多视图快照、授权与可见范围版本的变化、来源消失的代发、
媒体与 `render`、多个协调域、租户级轻量流与传输装配均不在模型内，由规范场景与提供者验收承担。
跨协调域部署前必须先兑现 LC-09 的
义务清单：本版只承诺同一协调域内的顺序与完整前缀，`Cursor.domains` 的多域形状在那些义务兑现前
不构成跨域承诺。
