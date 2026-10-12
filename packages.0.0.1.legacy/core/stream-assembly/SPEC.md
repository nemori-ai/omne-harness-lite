# 到达装配的纯值承诺

[公开根](src/index.ts)拥有五个操作及其形状。本包按 arrival-events 的语法归约一条流，交出快照、块、账和结局；没有自有 Schema、共享状态、时钟、I/O、事件或提交点，不执行工具、不发模型请求、不写日志、不做授权。相同输入得到相同结果。路由、持有、时间、消息身份及持久记录由宿主负责。

## 状态与操作

状态是调用方持有的不透明值，只能从本包取得。每次接受交出新状态，旧状态及已交出的快照不变，可合法分叉；只使用一条当前分支是宿主责任。同一串被接受事件唯一确定快照与结算。状态不携带 Session 或租户，不是消息，不进日志；进程消失后没有状态可放弃。

| 操作 | 必须保持的行为 |
| --- | --- |
| start | 必填合法目标；初始位置为零，无块、账、收尾。不补默认目标。同目标重复创建不失败，也不证明目标可再次发出 |
| accept | 只收事件，不收信封。成功全有或全无地交出位置加一的新状态；拒绝不交新状态、不改旧值、位置、账、首内容或汇总。同事件在新状态再接一次会重复追加，不能当作幂等去重 |
| snapshot | 任意合法状态可读，无判定失败；按开块次序给已封口块及开着的块。已填的追加块含全部已到片段，替换块含最后一次内容；没填过的开块不带 content。调用参数保持原文。快照不含砍汇总 |
| closeOut | 未收尾返回 stream_not_finished；已收尾交 blocks、account、ending，重复结算同一值相等，不表示可重复落账。不铸 MessageId 或时间 |
| abandon | 等价于接受 `finish {reason: lost, error: reason}` 后结算，已有账仍保留。已收尾拒绝 event_after_finish；附带 reason 按 finish.error 的形状校验，不合法为 malformed。reason 只用于模型流，工具流带 reason 为 malformed。成功时 ending.error 原样承载合法 reason。这不是恢复，不重新执行任何工作 |

位置是本流被接受事件的计数，不是事件身份。快照位置 n 后，观察者从第 n+1 个被接受事件接收。首内容位置只在载荷非空 fill，或此前未填且封口内容非空的 close 首次出现；空参数原文封口不算内容。一经确定不变，同时进入快照与结局。本包不给时刻。

## 块归约与唯一解析点

块按 open 次序排列，与 close 次序无关。追加相接，替换只取最后一次，没填过没有归约。已封口的非调用块以生产者交出的 block 为准，不重算或验证它等于片段归约；该等式由生产者保证。思考块的不透明 opaque 只来自封口。

只有接受一个工具调用 close 时解析参数，最多一次。空原文按 `{}` 解析。未被内容修改且工具名合法时，按严格无损 JSON 解析：整段恰为一个 JSON 文本，任一层重名成员拒绝解析，数值保持精确十进制，不舍入超过安全整数的值。解析失败或工具名不满足字符集／长度限制，close 仍被接受：落 complete=true、unparseable=true、原 rawArguments，无 arguments。合法解析交出 arguments，后续快照、结算、放弃、宿主及执行方不再次解析。工具执行运行时拥有不启动执行、写失败结果的责任；本包只标记。

开着的调用若接受过 frame_too_long、quota_exhausted 或 rejected 的 trim，索引指向它或缺席，则内容可能残缺，不解析；即使后来封口，也落成半截调用。rate_merged 不算修改。封口后的 trim 只进汇总，不改已定块。其他块按实际送达内容落。

结算时，已封口块保留封口值；未封口调用始终落 complete=false、原归约参数（未填为空串）、开块的 callId／tool，visibility 两位都为 false。未封口非调用块若填过，保留实际归约，替换可为空；未填不落块。语音追加按字节相接并重新给标准 base64。保留开块身份，不补全或丢弃已交付内容。

## 账与砍汇总

模型流接受过 account 则原样用其 usage／cost；没有则四项用量和费用明确 unknown、source=none，不记零、不估计、不借上次。工具流的 frames.emitted 是被接受 open／fill／close 数加 merged 加 cut；没有帧只有 finish 合法且为零。账不进块，记录位置及恰一次追加由宿主负责。

```text
merged = 所有 rate_merged 的 merged 之和
byReason.rate_merged = merged
byReason.frame_too_long = 未配对的 frame_too_long 个数
byReason.quota_exhausted = quota_exhausted 个数
byReason.rejected = rejected 个数
cut = byReason.quota_exhausted + byReason.rejected
omittedBytes = 所有非 rate_merged 的 omittedBytes 之和
```

配对只据被接受事件的次序：frame_too_long 后紧接一个 rejected trim，前者不再算入 frame_too_long，按拒收计一次；两段 omittedBytes 都计。中间有其他被接受事件就不配对。每帧至多计一次未原样送达；四个 byReason 始终存在，未发生为零。本包只算接受的 trim，不猜未报告的砍。不自行节流；装配之后为观察者合并的投递节流不进账。模型侧由宿主将汇总写入该次发出的 response.trims；没有砍时响应侧缺席而本包各项为零，两者表示同一事实。

## 拒绝与判定次序

公开表示拒绝沿 arrival-events 原名与次序，不另定义同义拒绝。对信封 `{target: 状态目标, event}` 先判表示，随后 event_after_finish，最后本流次序：

```text
open: index_reused > index_not_monotonic
fill/close: block_not_open > block_already_closed > payload_kind_mismatch
trim: block_not_open
account: account_duplicate
```

表示层顺序为 event_unknown、互斥的 trim_reason_unknown／finish_reason_unknown、嵌套值拒绝、presentation_invalid、head_modality_mismatch、fill_kind_not_appendable、frame_media_inline、replace_payload_shape、malformed。需借开块的两个表示判断只在该块此刻开着时参与。独立的块头模态错误仍先于索引错误；不能一概把载荷判断推后。

本流八个失败是 event_after_finish、index_reused、index_not_monotonic、block_not_open、block_already_closed、payload_kind_mismatch、account_duplicate、stream_not_finished。载荷不匹配包括追加类型／空追加／非法标准 base64，封口块缺席、多余或与开块的 kind／id／visibility／mediaType 不合。解析不了不是这些失败，块头模态归表示拒绝。本包不查重复 BlockId；消息落盘接收边界须以 block_id_duplicate 拒绝，不改写标识。本包不提供 target_unknown 或目标登记。业务拒绝以返回值承载；伪造不透明状态违背调用前提，不作为新业务失败值。

拒绝不是执行失败，不影响工具执行；不补标注、改索引、改填法或接迟到内容。生产者增量被拒，宿主须立即补一次 rejected trim；宿主自己发的 trim／finish 被拒不递归补 trim。收尾后的拒绝无法进该流汇总，须由宿主观测。

## 宿主与协议责任

宿主按 `(Session, target)` 路由，每次发出一份当前状态，串行按生产次序接上次返回值。已收尾目标不再开；dispatch 原样携带，迟到事件不进新发出。工具只发 open／fill／close，运行时发 trim／finish，工具流没有 account。发出侧每次合并、截短、限额须报告 trim，截短 trim 紧挨在其增量之前；被拒增量的 rejected trim 在下个事件前补一次，保证配对可判。

正常完成或有意停止交 finish；失去生产者连续性或宿主有序撤除／替换仍在途时调用 abandon，结局 lost，不冒充 interrupted，不无限悬置状态。进程已消失只能由宿主追补收场及未知账，不经本包恢复。首内容首次出现须先取时刻并记录，再交观察者；快照与后续增量使用同一接受计数，被拒事件不推观察者。按消息拥有者的结局规则包消息；模型流 lost 不成消息，已交付块须按模型响应拥有者的 delivered 规则落在响应中，不丢已花费用。工具内部消息只在 blocks 非空时产生，账按发出／执行身份恰一次持久追加。

跨进程协议须重新兑现有序、不重不漏、显式 Session／租户及接收端授权、dispatch 隔代拒绝、首内容记录先于投递、可比较快照与序号、按发出／执行身份幂等追加。首内容时刻须明确取哪一侧的时钟，避免时长失真。状态不跨进程共享；迁移要迁状态，否则按丢失处理。顺序重复可能静默追加两次，跨会话目标相撞可能泄露内容，账重记会重复计费；单进程调用次序或隔离标签不能替代上述协议保证。

## 相等性质与验证边界

对一串从 start 起逐个接受、以 finish 结尾且调用开着时没有改变内容的 trim 的事件，仅对原流收到过 fill 的块把填归约成一次 fill，未填过的块不补 fill；保留原 open／close／account／finish，按 open 次序排列，所得一次性流也须被接受。两者 blocks、结局 reason／error、usage／cost 相等；不要求事件位置、首内容位置、砍汇总、emitted 相等，也不比较宿主铸的消息身份。改变调用内容的砍不在此前提内。

模型、原规范输入及实际不可变／无损／次序测试由 [verification](verification/README.md) 定位。模型证明的只是其有界抽象，不证明真实生产者、租户隔离、落盘或网络协议。运行时的恢复、请求重发、工具执行及中断提醒保持各自拥有者责任；本次迁移不新增这些业务实现。
