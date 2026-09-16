# MessageStream 与 SessionProjection 提供者设计

## 服务与资源边界

`SessionProjection` 把耐久 facts 与 M disposition revisions 折成 `changes/snapshot`，拥有 `completeTo/floor`；Session read face
是 `visibilityVersion` 的权威，SessionProjection 只消费/传播它并在版本变化时使已构建快照失效。两者都不拥有
连接、订阅、transient 或授权决定。候选 `MessageStreamPlugin` 提供 `omneMessageStream`
服务与 generation-scoped `subscribe` resource，消费 projection reader、事实 committed contribution、
对象读权 resolver 和可选 transient publishers；它拥有 listener、per-subscription sent/事实水位、
交接缓冲与 transient ring，不拥有事实、projection 内容或 installed cursor。installed cursor 由客户端拥有；
MessageStream 收到的 client ack 仅是观察，不成为安装权威。

## 依赖和装载

required：DR/CC commit positions、SessionProjection changes/snapshot/completeTo/floor、Session read face visibilityVersion、Session/TG/AU
读权与 OB 诊断；缺任一则 plugin not-ready。optional：MC/Tools transient publisher、EH presentation；
缺失只关闭相应实时类别并发 source-unavailable/gap，不伪造 settlement。资源身份含 tenant/session/
principal/subscription/generation，Context 只携 scope 和 handles。

## 恢复与撤除

durable reader 按原 commitPosition 产生授权投影批：只含 principal 可见 facts/state updates，但该视图原子完整；
hidden-only 批固定编码为空 projection group 或由本次 `changes` 响应的 `coveredThrough` 跨过，
不发 placeholder/per-object rejection；全局 `projection.completeTo` 不冒充已返回区间。
客户端只有在 opened 的 resync=none 且 cursor/visibility 有效，或 MS-12 snapshot 已原子安装取得
新 cursor 后，才在事实提示/重连以及无帧的有界本地对账周期主动调用 `changes(after,to)`；
resync=full/resumable=null 必须先 snapshot，不能从空/旧 cursor 调 changes。`to=latest`
在调用开始解析为具体 `resolvedTo=projection.completeTo`，响应满足 `after ≤ coveredThrough ≤ resolvedTo`
（具体 to 时 `coveredThrough ≤ to`）。响应的授权组带完整 history/body refs 与 state updates，客户端
逐组同水位原子安装后才推进 installed cursor；无公开事实提示但有 state update 的组仍返回，纯 hidden-only
区间可凭 coveredThrough 安装覆盖证明。事实帧与最后帧都只作唤醒，不是安装证明。
每个有状态变化的 complete batch 携完整 attemptStateUpdates，full snapshot 携当前主体获准的完整
attemptStates，明确返回 in_progress/settled_with_message/settled_without_message/abandoned；durable business unknown
是 `settled_without_message{outcome:unknown}` 并首次关闭草稿，closing/outcome_unresolved 则只从 M ledger
耐久 `attempt.closing.pending` observation 在同一 asOf fold 为
`in_progress{pendingReason:outcome_unresolved}` 并保留草稿，不能由 active snapshot 混入；即使没有 terminal
revision，该 closing batch 也必须带完整 update。客户端原子安装 history+states 的完整 commit batch 后才推进cursor。
full snapshot 不接收 identity/lastKnownPosition，只返回 collection-level asOf/floor/visibilityVersion/coverage 与
授权完整集合；隐藏、不存在、过期没有逐项分类，缺席只由客户端标 local evidence_unavailable。visibilityVersion
只随授权投影定义变化，隐藏业务提交可以只推进 asOf。snapshot 回显 replacementToken；client reducer 仅在
token/current visibility 匹配且 asOf 不低于 installedCursor 时，原子替换 states/cursor/revision/semantic-close
bookkeeping，否则整份丢弃重取。位置仍在可服务范围却缺 projection 输入时整个 snapshot unavailable。
active侧按visibility注册listener；M在effective cut后对每 listener 独立有序callback，
E校验pub连续并缓冲，再读MC-13 compact state/cut。baseline以coveredThrough（下一未覆盖chunk index）
安装可判定 folded state，并建立 started/chunk dedup；ended 只按 dispositionRef 去重。新 attemptEpoch
baseline 后丢弃旧 epoch buffered frame。enqueue与buffer empty→live在同一串行器线性化，gap/乱序/
单 listener overflow 撤该订阅并换 subscriberGeneration；不把共享 source 标 unavailable。transformVersion
与 sourceGeneration 绑定；正常换代只消费 M 有序 `source.generation.changed` marker，并唯一对应映射成封闭的
`stream.source-generation-changed`，崩溃/不可读走 source failure。ended只作hint，最终由durable
disposition reducer收口；unknown revision可更新呈现而不重复close，retention expiry不生成业务outcome。旧 provider
撤除器只撤其 generation 的 listeners/resources，不能撤新 generation；撤除先封新订阅，再关闭交接、
发 resync_required、释放缓冲，最后撤服务。慢/溢出关闭订阅，不反压事实或 projection。当前
`packages/session/projection` 只有 registry/fork 基元，没有这些服务。
