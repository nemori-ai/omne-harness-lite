# omne-next / omne_harness：state 子系统、事件框架与出站流的观察

[研究索引](../README.md) · [DSH 笔记](dsh.md) · [OpenRouter 笔记](openrouter.md)

来源：`/data/qiwei/repos/omne-next` 提交 `6263fed54`（2026-09-11 前后）及其 23 个工作树，由
只读调研 subagent 于 2026-09-15 阅读；完整报告在主检出 `tmp/next-design-prep/omne-next-state-and-frames.md`
（Git 忽略，2292 行）。本笔记是报告的筛选与归类，标注沿用报告的**观察**（源码 / 文档逐字
可核）、**推断**（报告或本文的解释）与**未覆盖**（报告明说没读或没跑）。**没有运行任何
代码或测试**；"测试断言什么"来自读测试源码，不是执行结果。旧系统自己多次记录"绿灯
证明不了 close-out"（§9），所以"测试存在"不等于"行为已验证"。

旧系统的设计未必正确，也未必符合本项目架构；本笔记只陈述"旧设计在这里做了 X，理由是
Y"，第 10 节按本项目已定约束给出逐项处置建议，供 [message-stream 提案](../../../proposals/message-stream/README.md)
做特性不丢不漏的核对，不是政策。

## 1. state 子系统：一条 per-session 事件日志

- **观察**：唯一持久真相源是 per-session append-only 日志 `session_runtime_event`（14 字段
  信封：`event_id` 由事实出生处铸造、三段式 `event_type` 作实例数据、`sequence_id` per-session
  单调、`dedup_key` 兼作 WAL intent key、`schema_version` per-instance、`category × direction`
  12 格只 6 格合法），配一个派生的"头"表 `session_event_log_head`（`sequence_id_cursor`、
  `last_applied` fence 水位、`authority_lsn` / `local_lsn` 两个 LSN、affinity worker 与 lease
  epoch）。约束 `UNIQUE(session_id, sequence_id)` 与 `UNIQUE(session_id, dedup_key) WHERE
  dedup_key IS NOT NULL`。
- **观察**：契约 C-10 "头/流分离，流为唯一真相"；C-11 三种 LSN 坐标语义独立，接口按坐标
  类型区分入参，"不得用泛型 `from_lsn`"；C-14 read-model 投影按耐久档分层，canonical 只投影
  `AUTHORITY_ACK`，live 投影可含 `LOCAL_FSYNC` 但必须标 non-canonical。
- **观察**："append 返回 ≠ 耐久"：`append` 返回 `AppendReceipt`，暴露 `durability_tier`
  （`LOCAL_FSYNC` / `AUTHORITY_ACK`）、`authority_status`（`PENDING` / `ACKED` / `DISCARDED`）与已分配
  序号；**禁止二义的 `durable=true`**。`block=False` 的四条约束：准入按事件语义分级（进度 /
  trace 允许，用户承诺 / 外部副作用 / 授权审计计费禁止）、必须可按 `(session_id, sequence_id)`
  观察升级、不可逆动作先等前提 acked、终端用户"已保存"必须 authority-ack。
- **观察**：INV-1-12 per-session 全序，跨 session 顺序刻意不保证。公开历史读面
  `session.history.read` 的 `next_cursor` 是 opaque 且"从权威日志原样转发，本 origin 不重新
  编码——第二次编码就是第二个可能不一致的顺序真相"。
- **观察**：state 侧没有通用事件 reaper；压缩非破坏性（产出独立 Summary，原日志保留）；
  `user_chat` 类 Session 只有 `active / archived / deleted` 三态不进 `expired`。隐私擦除机制
  未选择（ADR-083 只定边界）。
- **观察（代价）**：旧系统自己记录了"一条流承载全部"的后果——工具进度必须旁路到独立表，
  因为载荷会污染权威历史及其上全部投影（上下文渲染、loop detection、compaction 逐个被 MB 级
  载荷拖累），见 §4。

## 2. 事件框架标准与信封

- **观察**：四类事件对象——wire published（schema-first，`<bc>.<aggregate>.<past_participle>`）、
  substrate internal（不跨进程）、marker（`<bc>.log.*`）、transport frame（`harness.<transport>.<frame>`）；
  分界是消费边界不是重要程度。
- **观察**：`DistributedEventEnvelope` 19 个必填字段，含 `tenant_id` 与 `owner_tenant_id` 两轴、
  `idempotency_key`（默认 = `event_id`，消费者按 `(consumer_group, source, idempotency_key)`
  去重）、`ordering_key`（默认 = `session_id`）、`sequence_id` per-`ordering_key`、
  `authority_lease_epoch` fencing term。`additionalProperties: true`，未知字段被容忍**并且仍属于
  语义身份**；"语义指纹"规则只排除两个闭合集合（投递 / 追踪坐标、per-leg producer 印章）。
- **观察**：耐久等级 `x-durability-class`（`durable` / `realtime` / `ephemeral`）是 schema 类级
  属性，CI 机械强制；169 份 wire schema 中 `durable` 143 / `realtime` 26 / `ephemeral` 0。
- **观察（缺陷）**：dual-lane 双路投递的核心纪律"producer 禁止为两条腿铸两个 `event_id`"
  实测**缺陷率 100%**，且两腿 `ordering_key` 不同使 per-key 顺序门也拦不住；修复 ADR-129 仍
  Proposed。
- **观察**：命名反模式表——`runtime.agent.thinking`（不可观察）、`state.session.updating`（现在
  进行时 = 命令语义）、`inbound.trigger.handled`（缺 aggregate）；扩展后缀 `.failed / .refused /
  .conflict / .expired / .deduped`。
- **观察**：加法容忍纪律——公开帧 `additionalProperties: true` 且 optional 字段刻意不进
  `required`，理由"耐久 tail 会重放 producer 在该字段存在之前发出的帧"；两个例外
  `additionalProperties: false`（`session-tool-call-failed-frame`、`SessionAwaiting`）。
- **观察**：公开面天花板 `GW-API-10`——公开 Session API 永不暴露 `NodeId`、worker 身份、
  coordinator endpoint、upstream selector；工具线再加 `run_id / node_id / dispatch_order_id /
  tool_call_id / work_order_id` 与 `traceparent`；`attempt` 刻意不在禁止列表（消费者按它拼接）。
- **观察**：守规则的契约测试：递归收集**任意深度**的 property 名（嵌套 block 是真实泄漏面）并
  **同时断言家族数量**（"只迭代 glob 的守卫在文件搬家那天会回答全部 0 个都是干净的"）；
  admitted origin 列表逐类实例化对拍；`test_stream_event_fields_have_no_falsy_defaults`（§9）。

## 3. 网关出站帧

- **观察**：一个会话一条流 `GET /api/v1/sessions/{session_id}/stream`，SSE；13 个公开帧种类全部
  `session.*`，在 `SESSION_EVENTS` 目录显式登记 `event_class + schema_ref + consumer_profiles`；
  **未登记的事件永不转发，且静默丢弃**（症状是空窗口、没有日志）。`consumer_profiles` 是
  显式允许列表，"不在列表里就是拒绝，没有隐式默认 profile"。
- **观察**：帧信封 `SessionStreamFrame = {event_type, data, id | null}`；`event_type` 走 SSE
  `event:` 字段、位置走 `id:`；`id = null` 表示"不推进任何位置"（keepalive、mid-batch）；`id`
  是 opaque，"除了给自己的重连排序之外不携带任何消费者可据以行动的含义"。
- **观察**：`event_class` 四值封闭——`durable`（可从权威恢复）、`durable_projection`（投影一次
  已耐久迁移，漏帧靠重读不靠重放）、`bounded_live`（可以出 gap，需 canonical recovery）、
  `control`（治理流本身）；**刻意没有 `UNKNOWN`**："说不出怎么恢复的事件就是不发布的事件"。
- **观察**：13 帧：`reply_block.started / reply.delta / reply_block.settled`（`bounded_live`）、
  `reply.settled`（`durable_projection`，整条替换、永不续接）、`status.changed`
  （`durable_projection`：`generating`、`interrupted` 并列、`failure_cause` 7 值封闭、`awaiting`
  块、`retry`）、`user_message.echoed`（与耐久消息同形，`message_id` 由 State 准入时铸一次以对账
  乐观气泡）、`tool_call.failed`（4 值 `reason_code`，不带错误正文）、六个 `tool_progress.*`
  （§4）。空 delta 合法（"消费者必须 append，不能把空读成结束"）；媒体块永远带引用不带内联
  字节（"能载二十兆 base64 的 SSE 通道会在每次重连时把它们全部重发"）。
- **观察（漂移）**：设计文档列的是另一套名字（`message.delta / message.committed /
  stream.rotate / stream.resume_required / stream.terminal`），HEAD 目录里一个都没有；三条
  `control` 类帧只在设计里存在。**推断**：文档落后于实现。
- **观察**：`StreamPosition` 是两半（`event_log` EventLog cursor、`live_entry` Channel-2 entry id），
  由不同权威铸造、不同时钟、不同粒度，"没有算术关系，这里也不做任何换算"；任一半可缺席。
  `GatewayResumeToken` 把它 HMAC 密封为 SSE id，scope `(resource_id, principal_id, tenant)` 摘要
  进 token；位置**绑资源不绑操作**（流交回的位置必须能翻历史，反之亦然）；`tenant` 只在能
  区分东西处携带。
- **观察**：两种恢复姿势——短窗口断线经 Redis Streams offset 续传；跨窗口或流已 settle 经
  state ledger 回放；pin 节点不可达时返回稳定 unavailable，**不得把 resume 发往别的节点**。
- **观察**：多客户端——每设备一个活跃门面，收敛到 pinned node 上一个 coordinator owner，
  `ActiveFacadeRegistry` 按 `session_id` 与 `correlation_key` 两维索引（只按 run 键会让第二门面
  订阅不到进行中的 turn）；同步边界 v1.0 只同步 committed 态，未提交草稿不同步。
- **观察**：投递前的租户 / 权限核对至少六道（Gateway 准入、target-bound delegation、coordinator
  授权、事件目录 profile 允许列表、provider 侧 owner 头、State 读面 deny-by-default：拒绝时
  owner id 只进服务端日志、抛通用错误）。
- **观察**：anti-corruption 投影三条纪律——"翻译不是转发，每一种帧逐字段构建，provider 明天
  长出一个字段这里什么都不长"；未识别的 provider 帧丢弃不抛错（后果诚实登记）；映射表的键是
  `(SSE 名, 声明的来源类)` 二元组，因为回复块与工具进度块发同样的 SSE 名，只按名字键会让
  "工具的输出穿着模型的名字到达客户端"。

## 4. 工具进度帧

- **观察**：进度是"一条流上的第二条流"：六个公开帧混在同一条会话流上，靠 `tool_execution_id`
  分流，不为每个工具开子流。身份五坐标：`tool_execution_id`（harness 铸、公开、detached 重驱后
  不变）、`tool_call_id`（模型铸、**永不上公开面**）、`attempt`（段序号，attached = 0，重驱 +1）、
  `block_index`（块位置，瞬态坐标非耐久身份）、`revision`（同位置第几版，0 = append 形态）。
- **观察**：耐久落点是旁路表 `harness_runtime_tool_progress_block`（`UNIQUE(tool_execution_id,
  attempt, block_index, revision)`；`payload | file_id`、`size`、`truncated`、`omitted_bytes`、
  `render_hint / mime_type / language`）；EventLog 只留 id 级账 `runtime.tool_execution.progress_block_settled`
  **永不带块体**；在途 delta **没有任何耐久对应物**。"耐久承诺由旁路表 + id 级账承担，不是由
  帧的类别凭空承诺：把 delta 也标成 `durable_projection` 会承诺每一帧漏了都能重放，而实际
  恢复面是重读快照"。
- **观察**：`truncated` 帧的 `reason` 7 值封闭——`frame_rejected`、`rate_merged`、
  `frame_too_long`、`progress_suppressed`、`durable_budget_exhausted`、`durable_write_failed`、
  `block_too_large`；理由"丢它的是哪一层才是可行动的部分——有东西丢了本身告诉读者的是零"。
- **观察**：呈现标识 `render_hint`（封闭 9 值：`plain / markdown / html / terminal / code / log /
  widget / image / table`）× `mime_type`（IANA）× `language`（仅 `code` 有意义）三字段正交、
  不从对方推导（"`text/plain` 可能想要终端也可能想要日志查看器"）；合法组合表，非法具名拒绝
  不静默改；三层默认（类级 → 每块覆盖 → harness 补齐），帧上永远是显式值；未知值降级到
  `mime_type` 决定的默认渲染且**降级对消费端可见**。旧系统自记的坑：`additionalProperties: true`
  让拼错的 `"terminall"` 通过校验，"不写进契约，闸就是假的"。
- **观察**：拼接规则按 body 内领域坐标 `(attempt, block_index, revision)` 与快照 `as_of` 比较，
  **不用流位置比大小**（位置可为 null，且 opaque 位置拿来比大小等于授予契约不授予的排序语义）；
  重连的 `Last-Event-ID` 与拼接规则正交。
- **观察**：INV-TS-1～5——锚点随帧（每帧携 `tool_execution_id`，骨架首帧携
  `assistant_message_id + tool_call_index`）；工具帧与 turn 解耦（不并进 `status.changed`，两个
  正交状态机）；离场宿主与会话同位点（否则帧到不了且没有任何一处报错）；公平性预算（帧率 /
  字节预算 + 同块 delta coalescing + 回复帧优先）；快照列出所有未终态执行（换设备时 run 早收敛）。
- **观察**：两条惰性读面（候选）——骨架列表（轻，附着时拉一次）与进度块分页（面板打开时才拉；
  超上界拒绝而非截断）；拆两条的理由是目录响应不能变成"200 × 每 execution 的块预算"。
- **观察**：reaper 以墓碑回收块（`payload` 置 NULL，体积 / 类型 / 位置 / 时间戳 / 原因留存，
  "观察者看到的是 transcript 里有一个被回收的块，而不是 transcript 上有一个洞"）；`payload` 列
  无长度上限（"截断的事实另有记录，列上再截一次会让行对自己的陈述变假"）。
- **观察**：fail-open 的配套义务——fail-open 单独安全，"与某处没接上相乘就不安全"，一轮实施
  在六个互不相干位点撞见同一形态（主业照常、相邻能力照常、这一项一声不吭地全丢、契约保持
  绿色）；义务：造 fail-open 协作者同刀必须让"没接上"具名且大声，并立两侧都守的结构闸。

## 5. 模型流式增量

- **观察**：`BlockStream` 一个折叠点同时喂瞬态流与耐久事实，`text / full_text` 是派生属性而非
  并行累积（"第二次累积是对说了什么的第二个答案，而两者可以在什么都不失败的情况下互相
  矛盾"）；delta 不进 EventLog；瞬态帧与耐久事实的接头是重连后**重读耐久前沿**再接 live，
  不是帧里带提交位置。
- **观察**：需求 AC-4 / AC-5 不保证 per-token resume；断线丢的是 delta，回复由 `reply.settled`
  整条替换。**推断**：这与 DSH `end{committed}` 的显式接头是两种取舍，见研究索引 §3.3。
- **观察**：已知缺陷——一次 park 产生的回显与两条 status 帧"没有 SSE `id:`"，问题开着时
  断线的窗口没有位置可以续流；`awaiting` 帧 durable-first 比进程内 `control_applied` 晚数百毫秒。

## 6. 系统通知框架（DRR-005）

- **观察**：注入统一为 `role=Human` 的文本 content block，标签 `<system_notice type=…>` /
  `<system_reminder type=… as_of=… stale completeness continuity …>`，**没有 wire schema**，也不是
  `ContentBlockType` 的一员；INV-1-24 运行期 fail-loud 禁止 System role 动态 append；来源靠
  `producer_actor`，不是 role。
- **观察**：严格 XML 转义升格为契约本体（CONTENT 与 ATTR 都转义；动态 channel slug 白名单
  净化）；always-closed（空 body 也渲成显式开闭对）；属性顺序固定以保 prompt cache 字节一致；
  `as_of` 是观察时刻"never a version counter"。
- **观察**："身份识别永远不从内容来"：用户文本能复现任何信封，只有可信 producer 铸的 marker
  或从耐久 provenance 重建的标记才能把消息归类为 harness 所作；round-trip 不变式 INV-LG-9
  要求标记经"材化 → 日志 → 视图 → 重建"全链保真；多于一个 marker key 则放弃分类（fail-closed）。
- **观察**：`NoticeType` 四值闭集（`conversation_summary`、`system_context`、`orphaned_tool_result`、
  `unknown_role`）+ 动态 channel slug + 兜底裸文本；`InjectionKind` 8 值（含 `tool_failure` 与
  `tool_interrupted` 刻意分开："把中断记成失败会教模型重试一个人刚停下的东西"）。
- **观察（负结论）**：**没有按模型族投影**（无 `developer` message、无按 provider 选角色的
  代码）；文档理由是前缀 prompt caching 与闭合 XML 防误续写，"provider caching 仅作可选优化"。
- **观察**：`<system_notice>` 是渲染期产物不落库；广播 `<system_reminder>` 的 `rendered_text`
  逐字落库并原样重放；token fit 估算不计通知；渲染期丢弃表约 50 种 event_type。**未找到**当前
  实现里按通知类型的 trim / keep_latest 规则（只在 v1 与遗留实现里有）。

## 7. 后台工具占位与迟到结果

- **观察**：占位是普通 `ToolMessage` 纯文本三段（头行 · 通告"结果 NOT 在本消息、完成后有状态
  通知" · 可复制的取回调用示意），**刻意不带预览**（"读起来像状态行的占位正是让模型空转的
  原因"）；`status` 走默认成功语义；全仓无 `deferred_receipt`。`ToolResultDisposition` 四值
  `inline / offloaded / placeholder / error_envelope`；取消的离场执行以 `placeholder` 结算。
- **观察**：`ReflowPolicy` 四值 `silent / inform / wake_continuation / compensate`，detach 时冻结
  在工作单；理由"合并 silent 与 inform 会让『从未被告知』与『被告知了只是晚一点』不可区分"。
  **实现只有一个值可用**：single-node 写死 `wake_continuation` 且刻意不做旋钮，`inform` 遇到即抛
  异常。消费者对未知值必须 fail loud（"默认成安静成员丢一次唤醒，默认成大声成员起一个没人要
  的 turn"）。**观察（偏差）**：`compensate` 不看 `succeeded`，成功终局同样唤醒。
- **观察**：唤醒走普通 inbound 路（`runtime.work_order.completed / failed` → routed trigger），
  `dedup_key = work_order:{id}` 不含终局名；已登记缺口：忙 session 拒绝第二次 live dispatch 且无
  有界公平的 pending-turn 队列，靠总线重投顶替。
- **观察**：唤醒通知 `<system_reminder>` 带工具名、`tool_call_id`、成败、错误类、结果尺寸，
  **不带结果本体、不带 `tool_execution_id`**（产品面坐标永不到模型侧）。
- **观察**：迟到人类答复**不共用**离场机制（HITL 走 `WaitFact` + revival chain，无 ReflowPolicy，
  永不超时）。
- **观察**：取回工具四态 `result / result_pending / result_purged / result_not_found`，四态先于
  任何操作符裁决（grep 一个墓碑得到墓碑元数据）；owner 不符按 `not_found` 返回（不泄漏存在性）；
  首读盖章是一次改变保留臂的耐久写。两层保留 `unread ? created + T1 : first_read + T2`，
  `0 < T2 < T1`，默认 7d / 24h **且必须是配置项**（无运行数据支撑一个正确窗口）；CAS 终结；常规
  sweep 绝不删行，唯一删除入口是 Session 终态清扫；清理对 agent 完全静默、不发 wire 事件。

## 8. HITL 卡片在流里的投影

- **观察**：卡片本体**不走实时流**——材化为 `role=AI` 耐久消息的 `hitl_request` content block
  （十值闭集 `ContentBlockType` 的第十个；用户提交面 7 值闭集不含它："提交的会是一张人从未
  看过的伪造请求"），"加入晚的客户端从普通历史读回它，而不是从它错过的一次 live 广播"；
  实时流上只有 `status.changed` 的 `awaiting{kind, since, request_message_id}` 块，进出等待各推
  一帧、不新增事件类型。块里**没有**"还在等你"标志（"冻在不可变消息里的副本在等待关闭那一刻
  就错了"），可答性 = 卡片 + 会话面 `awaiting` 双到齐。
- **观察**：跨会话决策池 `PendingDecisionItem`（agent 发起与 harness 发起统一；`harness.authorization`
  与 `tentative.decision` 只在设计里，契约枚举只声明已实现值）；池读面 `provider_global` 不 pin
  节点，可达性按行发布 `reachability`（Gateway 从 locus standing 合成，无 default 分支）；作答
  登记在会话 cohort（"答一个决定是该决定所属会话上的一次普通 turn"）。
- **观察**：`kind=human` 的等待**永不超时**，多处钉死（枚举 docstring、schema、工具 args 黑名单
  `timeout / deadline / default_answer …`）；`requested_at` "NOT a deadline"；没有 `expired` 状态。
- **观察**：答复回路——两个入口收敛到同一条 pinned 提交链，`hitl_reply{decision, note,
  request_message_id}` 恒带 `request_message_id`（否则"答一个已换代的旧请求，静默且带回执"）；
  first-accepted-wins CAS 是唯一仲裁点；两层幂等（公开 `Idempotency-Key` 必填 + 由条目身份派生的
  key `decision-answer:{item_id}`，"两个客户端重试同一答案必须收敛成一个 turn"）。回执只表示
  "答复被受理"，不表示 agent 已据此行动。
- **观察**：池行 standing 与等待 standing 正交（"补偿解决的等待不是 owner 的答案"）；settle 表
  按 `applied_by` 查表，只有 `OWNER_REPLY` → `answered`，其它一律 `cancelled`，supersede 覆盖；
  终态重投吸收、不同终态冲突抛错。四条不变式：先耐久注册再暴露（INV-HITL-1）、池内可见 ⇒
  request 存在且可结算、一条池条目 ⇔ 一条材化消息 + 一个 awaiting 锚、指针不悬空。
- **观察**：两条诚实边界——节点暂离期间答不进去（具名拒绝，不伪装受理）；节点永久退役后
  条目由 Lane R 清扫成 `cancelled / system_sweep`，不静默消失。

## 9. 取证与教训

- **观察**：`test_stream_event_fields_have_no_falsy_defaults`——序列化只写"看起来有用"的字段，
  三条分支丢弃 falsy 值，于是 `block_index = 0`（每个单块回复）、`text = ""`（零内容增量）在
  wire 上消失，**而碰巧开第二个块的 fixture 序列化得完美**，两次上线事故整套单测都是绿的。
- **观察**：Session 终态清扫曾用资产归属租户轴过滤治理租户列，生产中删 0 行且不抛错；端到端
  旅程同样绿，因为 fixture 两轴取值恒等使值域坍缩，"缺一轴与用错轴逐字节不可区分"。
- **观察**：ship 路径 `model_dump(mode="json")` 不带 `exclude_none`，未设置的 optional 字段以
  显式 `null` 上 wire，canonical schema 若声明裸标量 `type` 就被 producer 自己的正常输出违反。
- **观察**：设计文档与实现的系统性漂移至少五处（帧名、目录条数 7 vs 13、`stream.resume_required`
  只在设计、骨架帧 `tool_execution.changed` 是候选、`reflowed_at` 不在 settled schema）。

## 10. 对本项目的处置清单（作者判断，非政策）

按提案已定约束核对：一个 Session 一条流；`session(S) / queue(S) / inbound(S) / frames(S)`
同域 append-only，游标 = 每个协调域一个提交序号；出站流不产生事实，客户端按水位从投影补齐；
帧信封 `render: {kind, version}`；租户隔离从第一天起。"沿用"= 直接进提案或契约；"改形"= 保留
判断、换成本项目的形状；"不要"= 不采用并说明为什么。

| 旧设计项 | 处置 | 落点与理由 |
|---|---|---|
| 一条 per-session 日志承载全部事件、`(category, direction)` 二维分类 | 不要 | 本项目四条同域流各带水位，工具帧在 `frames(S)` 而不是旁路表；旧系统自己记录的"载荷污染全部投影"正是分流的理由（[U-42](../../../proposals/tool-execution/README.md#裁决记录2026-09-14用户)） |
| 头 / 流分离、流为唯一真相（C-10）；LSN 坐标按类型区分（C-11） | 沿用（已有） | records 的 DR-01 单调序号与投影水位已是这个分工；游标按域序号而不是泛型 `from` |
| 回执分"序号已分配"与"耐久已确认"、禁二义 `durable=true` | 改形 | 本项目单机首版只有一档耐久（DR-02 回执），但 `ended{committed}` 只在回执之后发、终端"已保存"只以事实为准，这两条判断沿用；多档耐久留分布式阶段 |
| `additionalProperties: true` 的加法容忍 + optional 不进 `required` | 改形 | 信封与游标 Schema 在 [MS-10](../../../proposals/message-stream/invariants.md) 下用 `additionalProperties: false` 拒绝内部坐标；帧 `payload` 由 `render.version` 版本化而不是靠容忍未知字段 |
| 公开面天花板 GW-API-10（不带节点 / 进程 / 内部 id）与递归收集字段名 + 断言家族数量的契约测试 | 沿用 | MS-10 的 Schema 检查按同法写：递归字段名黑名单、帧种类计数 |
| `event_class` 四值（`durable / durable_projection / bounded_live / control`） | 不要 | 语义轴不同：它说"漏了怎么恢复"，本项目帧类（事实提示 / 耐久帧 / 瞬态 / 控制）与记录等级已表达同一信息；不再引入第二套 |
| "说不出怎么恢复的事件就是不发布的事件"、未登记事件静默丢弃 | 改形 | 词表封闭沿用；但未登记的帧在本项目是提供者错误，要具名记录（[SYS-OBSERVABILITY](../../../requirements/system/observability-and-logging.md)），不静默 |
| 帧种类走 SSE `event:`、位置走 `id:`、`id = null` 表示不推进 | 沿用 | `apps/local-harness` 的 SSE 端点按此映射 `kind` 与 `position`；瞬态帧无位置对应 `id = null` |
| `StreamPosition` 两半 + HMAC `GatewayResumeToken` | 不要 | 本项目没有第二条瞬态通道，游标就是域序号；位置**绑资源不绑操作**、`tenant` 不进游标这两条判断沿用（[决定 G / U-54](../../../proposals/message-stream/README.md#裁决记录2026-09-15用户)） |
| 拼接按 body 内领域坐标 `(attempt, block_index, revision)`，不按流位置比大小 | 沿用 | 工具帧按 `{attempt, seq}`、attempt 帧按 `AttemptRef + idx`；游标只用于"从哪拉"，不用于帧内排序 |
| 空 delta 合法、消费者必须 append；`reply.settled` 整条替换永不续接 | 沿用 | [delta-protocol.md](../../../proposals/message-stream/delta-protocol.md)：`chunk` 可空；派生消息替换草稿 |
| `render_hint × mime_type × language` 正交 + 合法组合表 + 未知值可见降级 | 改形 | `render.kind` 词表以这 9 值为起点（决定 J），`mime` 归内容块的媒体引用，`language` 作 `code` 的参数；非法组合具名拒绝、未知 `render.kind` 降级并标记 |
| `truncated.reason` 7 值 | 改形 | [缺口词表](../../../proposals/tool-execution/frames.md#缺口词表) 已有 `trimmed`，把"哪一层丢的"补成原因子字段（`rate_merged / frame_too_long / budget_exhausted / write_failed`），见提案 |
| INV-TS-1 锚点随帧；INV-TS-2 工具帧与 turn 解耦 | 沿用（已有） | 帧信封 `subject.call / attempt`；工具生命周期与 Run 解耦已由 U-43 / U-45 定 |
| INV-TS-4 公平性预算（回复帧优先、同块 coalescing） | 改形 | 背压只作用于瞬态旁路（MS-6）；优先级与合并作为传输参数留实现阶段测量，不进契约 |
| INV-TS-5 快照列出所有未终态执行 | 沿用 | `stream.opened.baseline` 含活跃调用的帧水位与 `recordLevel`、活跃 attempt、待答请求 |
| 两条惰性读面（骨架列表轻、块分页面板打开才拉） | 沿用 | 事实提示只带位置、客户端按位置拉（决定 D）；`readFrames` 分页超上界拒绝 |
| 墓碑回收（元数据留存、`payload` 置空）、`payload` 无长度上限 | 沿用 | `frames(S)` 的保留与回收按数据治理；截断只记事实不二次截 |
| `BlockStream` 单折叠、`text` 派生属性 | 沿用（fork 已有） | `packages/model/llm` 的 `BlockAssembler / AssistantStreamAccumulator` |
| 重连靠重读耐久前沿而不是帧带提交位置 | 改形 | 本项目 `ended{committed, position}` 显式接头（DSH 型）加 `stream.opened.baseline`；两者都要 |
| `<system_reminder>` 统一 Human role、严格 XML 转义、身份不从内容来 | 改形 | `system_reminder` 是内容块类型而非文本约定，来源由 `Origin` 记录；投影时按模型族选 user / developer（旧系统没有这层，是本项目新增）；转义与"用户输入不能伪造 `system_reminder`"沿用（MS-8） |
| 通知不计入 token fit、渲染期丢弃表 | 未定 | 归上下文装配（MC-07），不在本线 |
| 占位 `ToolMessage` 纯文本、刻意不带预览、不邀请轮询 | 改形 | 占位是结构化 `deferred_receipt`（U-46）；"不带预览、说结果会被通知而不是让模型轮询"的内容判断沿用 |
| `ReflowPolicy` 四值 | 不要 | 本项目迟到结果统一为 `inbound.arrival` 分类（U-45 / U-46），没有"存放而不起 turn"的第二面；`silent` 与 `inform` 的区分理由记入提案[未决项](../../../proposals/message-stream/README.md#未决项)，产品若要"存而不唤醒"归 [PF-003](../../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) 的需求变更 |
| 唤醒通知不带结果本体、不带产品面坐标 | 沿用 | `system_reminder{late_result}` 只带 `ref: call` 与摘要；`tool_execution` 类内部 id 不到模型侧 |
| 取回工具四态、owner 不符按 not_found | 沿用 | tools 读面与 CT 读面按同一原则；不泄漏存在性 |
| 两层保留 T1 / T2 且必须是配置项 | 改形 | 保留期归数据治理与 records；"无运行数据不定常数"的判断沿用 |
| HITL 卡片走历史不走 live、流上只有等待信号 | 沿用（已有） | `hd.request.created` 事实提示 + HD 读面 `pool.get`；卡片不是新帧种类 |
| 人的等待永不超时、`requested_at` 不是 deadline | 沿用（已有） | HD 契约 HT-2 同型 |
| 答复恒带 `request_message_id`、条目身份派生幂等键、first-accepted-wins | 沿用（已有） | HD-02 / HD-09；本线只投递 |
| 决策池 `reachability` 按行发布 | 未定 | 单机首版无节点 locus；分布式阶段再议 |
| fail-open 的"同刀让没接上具名" | 沿用 | 出站流依赖变化政策里每一项退化都发 `stream.gap{reason}` 或 `stream.closed{reason}`，不静默 |
| falsy 默认与租户轴坍缩的取证教训 | 沿用 | 场景 MS-01 用 `idx = 0`、空 `chunk`；MS-08 用两个不同租户而不是同值 |
| 设计文档与实现漂移 | 沿用（方法） | 本项目以 catalog / frozen 与检查器防止；提案接受后帧词表进契约不留两套名字 |

## 11. 局限

- **未覆盖**：`adapters/session_stream.py` 逐帧投影函数体（320–1618 行）、state 的 DDD 文档
  与 DRR-001..009、runtime plane 的多份 DRR、169 份 wire schema 未抽读部分、`omne_gateway /
  omne_core / omne_core_v1 / omne_openrouter` 的系统阅读。
- **未覆盖**：23 个工作树只做差分级判断（提交标题与 `--stat`），核对过的四个与 main 无独有信息。
- **未消解**：`llm.*` 帧计数分歧（docstring 说五个、代码枚举六个）。
- 报告的子问题 5～8 由并行子调研完成，主调研抽样复核了关键引文，未逐行复核。
- 本笔记未评估旧设计的对错；第 10 节的处置是作者对照本项目约束的判断，接受与否随提案裁决。
