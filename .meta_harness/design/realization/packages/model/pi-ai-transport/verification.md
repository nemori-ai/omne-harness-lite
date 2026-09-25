# pi-ai-transport 验证与证据

本页记本节点触发的证据义务、实际跑过什么、覆盖到哪里。原始输入与输出归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并写范围。**源码不存在，本节点没有任何实现层的证据。**

## 证据义务

义务从契约 [S-38](../../../../spec/capabilities/model-request-runtime/v1/contract.md#s-38-装配给的保证-vs-协议须给的保证) 传输适配十一条、生产者一侧的数据契约条款与 [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md#理由与保留前提) 的比较门产生，不从已有测试反推。**T 系列**是本包的符合性测试：不装 Cordis、不连外网，只用函数面对一个本机脚本化 HTTP 端（按脚本回状态码、首部与 SSE 字节，并记下收到的每一个请求）；**G 系列**是比较门，必须对真实 OpenRouter 实测。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| S-38 第 1 条；S-22；`data.model-response/v1` S-24 | **T-1**：脚本端回 `503`、`429`、首部后断开、正文中途断开各一次 ⇒ 每次收到的请求恰 1 个；请求体 `provider` 恰为 `{ order: [那一家], allow_fallbacks: false, require_parameters: true }`；`extra` 带 `models`／`route`／`provider` 时这三键不出现在请求里、记进丢项 | 未开始 | 本节点；建包即可跑 |
| S-38 第 2 条；S-18 | **T-2**：`400`、`401`、`402`、`403`、`404`、`408`、`413`、`429`、`500`、`502`、`503`、`504`、`418`、`302` 各一次 ⇒ 交回 `http_status`、状态码逐字相同、首部原样；响应体超过 `maxErrorBodyBytes` 时停读且不截改已读部分的含义（只交状态码与首部、记诊断） | 未开始 | 本节点 |
| S-38 第 3 条；D-035 保留前提 1、2 | **T-3**：工具参数分多片到达（含一片把一个多字节字符切成两半、含中途是不合法 JSON 的前缀）⇒ 交出的 `fill` 片段相接**逐字节等于**上游各片 `function.arguments` 相接；工具调用块封口不带块。**SC-1** 静态检查：参数路径上没有任何 JSON 解析调用 | 未开始 | 本节点 ＋ 承载仓库 `tools/ts-checks`（规则未写） |
| S-38 第 4 条；S-16 | **T-4**：脚本端先回首部、停 500 ms、再发第一片内容 ⇒ 首部到达时 `readStream` 不交任何事件，第一个事件是 `open` | 未开始 | 本节点 |
| S-38 第 5 条；S-19 | **T-5**：进程环境里放一把 `OPENROUTER_API_KEY`、交空凭据或全空白凭据 ⇒ `local` 失败、脚本端**零请求**。**T-5b**：交一个哨兵凭据串，跑完全部失败支 ⇒ 本包交出的任何值（失败事实、`StreamEnd`、诊断事件）里找不到它或它任何不短于 `credential_fragment_min_length` 的片段（取值是契约 G-6，测试配置自带）。**SC-2**：包内没有 `process.env` 的读取 | 未开始 | 本节点 |
| S-38 第 6 条 | **T-6**：抓到的请求里没有 `x-session-id`、`session_id`、`user`、`prompt_cache_key` | 未开始 | 本节点 |
| S-38 第 7 条；S-11 末段 | **T-7**：消息里有图而快照 `inputModalities` 只有 `text` ⇒ `{ rejected: "modality_not_carried" }`、零请求；工具结果里的图同样；出现语音块 ⇒ 同样拒绝；`PI_AI_CARRIABLE_MODALITIES` 恰为 `{ text, image }` | 未开始 | 本节点 |
| S-38 第 8 条；`data.model-response/v1` S-9 | **T-8**：SSE 带 `id`、`model`、顶层 `provider` ⇒ `serving` 三项原样；`model` 从没出现 ⇒ `upstreamModel` 缺席（不以路由名填）；`provider` 中途变了 ⇒ 保留第一个、记 error 级诊断 | 未开始 | 本节点 |
| S-38 第 9 条 | **T-9**：脚本端回 `302` 带 `Location` 指向另一个本机端口 ⇒ `http_status` 302、那个端口**零请求**。这一支同时是「`node:https` 不跟随重定向」这一假设的 probe | 未开始 | 本节点 |
| S-38 第 10 条；S-29 ④；`data.model-profile/v1` S-17、S-21 | **T-10a**：`planRequest` 交出的改值与丢项，与 `sendRequest` 实际发出的请求体逐项对得上（发出的 = 合并后的，换掉改值项、去掉丢项项）；`planned` 冻结后改不动。**T-10b**：参数处置表逐行——缺席的项不出现；`reasoningEffort` 缺席 ⇒ 请求里没有 `reasoning`；`max` ⇒ 记丢项；`extra` 里落在本包握着的键或统一项上游拼法的 ⇒ 记丢项 | 未开始 | 本节点 |
| S-38 第 11 条 | **T-11**：工具条目名（含 `__`）原样进 `function.name`；回来的调用块头 `tool` 与上游 `function.name` 逐码点相同 | 未开始 | 本节点 |
| S-51（生产者一侧）；`data.arrival-events/v1` S-7、S-11、S-13 | **T-12**：一组录制的 SSE 夹具（纯文本、思考＋文本、思考只有 `reasoning_details`、单个与并行工具调用、`finish_reason = length`、`stop`、`tool_calls`）⇒ 交出的序列逐个交给 stream-assembly 的 `accept` **一个都不被拒**；`length` 那一支没有任何 `close`，`stop`／`tool_calls` 那一支每个开着的块都有 `close` | 未开始；stream-assembly 尚未建包 | 本节点；stream-assembly 建包后 |
| `data.arrival-events/v1` S-8、S-9；`data.content-blocks/v1` S-14 | **T-13**：`BlockId` 在一条流里两两不同；每个 `open` 都带两位 `visibility`；工具调用块头带 `callId` 与 `tool`；`CallId` 形如 `call_` 加 32 个 `[A-Za-z0-9_-]` 字符、同一（`ModelCallId`，发出，索引）恒得同一个值。**「在一份会话日志里两两不同」没有测试能证**：它建在 SHA-256 抗碰撞与三元组会话内唯一之上，这里只登前提，不登成已证 | 未开始 | 本节点 |
| `data.arrival-events/v1` S-20 | **T-14**：性质测试——任意切分的片段序列，封口块内容 = 片段按到达次序相接（那份契约写明这条的证据只能落在生产者一侧） | 未开始 | 本节点 |
| `data.arrival-events/v1` S-15 | **T-15**：带 `usage` 的流恰交一个 `account`、且在生成器返回之前；没有 `usage` 的流不交；`usage` 来两次 ⇒ 取后一个、记 info 级诊断 | 未开始 | 本节点 |
| `data.content-blocks/v1` S-9 | **T-16**：`reasoning_details` 进 `opaque`，经严格无损读写回来、同一路由名再请求时 `reasoning_details` 与上游原样**逐值相等**（含一个超过 2^53 的整数）；换一个路由名时不带 `reasoning_details` | 未开始 | 本节点；回放在真实上游上是否被接受归 G 系列 |
| `data.messages/v1` S-35、S-36 | **T-17**：`SystemReminderMessage`、`CompactionMessage` 各落成一条带系统标识的 `user`（`routeWireHints` 写了 `developer` 的路由落 `developer`）、不丢；`ToolInternalMessage` ⇒ 规划拒绝；有调用无结果 ⇒ 规划拒绝，**请求里没有凭空造出的结果** | 未开始 | 本节点 |
| `data.call-accounts/v1` S-4～S-8；那份契约 G-9 | **T-18**：`cost` 为 `0.000000123456789012345678`（超过 17 位有效数字）⇒ `cost_usd` 精确相同；`cost` 缺席、为字符串、为负 ⇒ `cost_usd: "unknown"`、`source: none`；`prompt_tokens` 小于缓存读加缓存写 ⇒ 三项输入都 `"unknown"`；缺席的 token 数不记 0 | 未开始 | 本节点；换算规则本身的真伪归 G-9 |
| S-18 的来源分支（本包交的事实） | **T-19**：DNS 失败、拒绝连接 ⇒ `connect`；正文中途断开且无 `finish_reason` ⇒ `stream_broken`（不封口）；`finish_reason` 之后又来内容、单事件超过 `maxSseEventBytes`、一帧 JSON 有重复成员、名字始终没到的工具调用、`delta.images`／`delta.audio`／`delta.refusal` 非空 ⇒ `protocol`；首帧带 `role`、`refusal: null`、`annotations: []`、`content: ""` ⇒ **不交任何事件、不以 `protocol` 收场**；HTTP 200 之后帧里带 `error: { code: 500 }` ⇒ `in_band`，**`statusCode = 500`、`inBand: true`、`httpStatus = 200`**（断言 `statusCode` 不是 200、不缺席；契约 S-38 第 2 条）；帧里 `error` 没有整数 `code`、或只有异常的 `finish_reason` ⇒ `in_band`、`statusCode` 与 `inBand` 都缺席、`upstreamError` 原样；`maxConnections = 1`、一条流占着连接时第二次 `sendRequest` 在排队中收到中止 ⇒ `local`、带 `queued` 留痕、脚本端对第二次**零请求**；拿到连接之后调用方中止 ⇒ `aborted`、此后不再交任何增量 | 未开始 | 本节点 |
| 装卸（[design](design.md#成对的装载与撤除)） | **T-20**：用 kernel-basis 的测试装配起本插件：配置缺席 ⇒ 取初值；配置不合形状 ⇒ 插件 `FAILED`、`modelTransport` 不可见；一条流在途时撤除本插件 ⇒ 那条流**不断**、继续交增量直到调用方中止或自然收尾；撤除之后再 `sendRequest` ⇒ `local`、零请求；最后一条在途结束后连接池被销毁 | 未开始 | 本节点 ＋ kernel-basis |
| SC-3 | 静态检查：网络 API 只在 `sendRequest` 所在模块里出现；`planRequest` 与 `createPiAiTransport` 不开连接 | 未开始（规则未写） | 本节点 ＋ `tools/ts-checks` |
| **G 系列：D-019 比较门**（十五项）与请求差异四项（最大生成长度字段、`store`、`reasoning`、`strict`） | 对每条目标路由用同一份输入实测，逐项记结果：请求路由四项、原始工具参数与结果回传 ID、流终态与无尾随事件、实际执行方与响应 ID、`usage.cost` 质量（按 generation id 查 `/generation` 对账）、私有 replay、重定向、错误、断流（首 token 前后各一）、abort（首 token 前后各一，含是否仍计费）、无隐藏重试 | 未开始；受阻于授权与预算（真实请求要花钱） | 主线 → 实施程；产品负责人授权。**任何费用或身份丢失先报反例**（D-019） |
| G 系列：本页新增的比较项 | `max_tokens` 与 `max_completion_tokens` 是否等价；`store: false` 与上游缺省；`require_parameters: true` 在单家路由下的实际效果；`transforms` 的缺省；`anthropic/*` 走 chat-completions 时的思考回放、缓存断点与中途 system；`reasoningEffort` 的取值集；`402`／`403`／`404`／`413` 是否出现、含义；带内错误的形状，带内 `code` 与 HTTP 状态是否同一套码（契约 G-5）；`delta` 内容成员闭集是否完备、各家首帧实际带哪些非内容字段、`refusal` 何时非空；`cost` 的单位；`prompt_tokens` 是否含缓存读写；`is_byok` 下 `cost` 的含义；`CallId` 在上游的词法上限 | 未开始；同上 | 同上；结果回填 design 的 PAT-N3、N5～N7、N10、N12、N13 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
| --- | --- | --- | --- |
| （无） | — | — | — |

**有限检查不写成无条件证明。**T 系列跑通只说明本包对脚本化输入的行为；它不说明 OpenRouter 的实际行为，那一半只能来自 G 系列。

## 覆盖缺口

- **没有任何实现层证据**：源码不存在（PAT-N1）。
- **比较门一项都没过**（PAT-N2）：在它过之前，产品装配里的真实发出没有证据支撑。
- **`CallId` 的会话内唯一**只能登前提（SHA-256 抗碰撞、`ModelCallId` 会话内唯一），给不出会失败的测试；若评审认为这不够，退路是让 P-2 把 `CallId` 的登记落在会话日志的判重键上——那是 model-request-runtime 一侧的改动，报主线。
- **状态码表、费用单位、用量换算**都是待核对主张（PAT-N3、N5、N6）；T 系列只核本包照表与照规则做，不核规则本身对不对。
- **PAT-N4、PAT-N9 已由契约闭合**（D-040 §八 N-40 ④、N-41）：T-19 的带内一支从「两样都交出来」改为断言 `statusCode` = 带内 `code` 且带 `inBand`；T-7、T-17 仍只核本包拒绝且零出站——拒绝值到 `undispatched{modality_mismatch}`／`invalidInput{reason}` 的收场在 P-2，证据归 model-request-runtime 一侧。
- **P-2 对 `local{queued}` 与无码带内错误的分类**（PAT-N18）：T-19 只核本包交出的事实；P-2 按哪一行收场没有判据，受阻的是场景 S-46 的对应支。
- **跨 fiber 的撤除次序与等待**未核实；本设计的结局不依赖它，T-20 只覆盖同一装配里先撤本插件的那一种。**kernel-basis 的 probe 候选**（候选名 `dispose-order-across-inject`，owner kernel-basis 节点，尚未登记）：提供者 fiber 撤除时，inject 它的依赖方是在提供者的异步撤除函数完成之前还是之后被卸载；它决定本插件撤除的等待是否要等到在途流自然收尾（[design 的撤除等待上界](design.md#成对的装载与撤除)）。

## 独立评审

2026-09-25 本节点首稿随 N7 批（infra 三节点与本节点）经一次独立的架构评审（只读结构核对，无运行）：本节点无阻断，应修 1、建议 2、观察 2。契约侧据此改写（D-040 §八 N-40 ④、N-41），本页与 design 按下表对齐。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| F-5（应修） | 节点落后于契约已裁的两处：`in_band` 的状态码仍标开放，规划拒绝仍写「没有落点」 | PAT-N4、PAT-N9 改「已由契约闭合」；`in_band` 失败事实定为 `statusCode` = 带内 `code` ＋ `inBand: true` ＋ `httpStatus` 另带，`inBand` 由 P-2 原样落；三种拒绝值映射到 S-28 表第 3 行（`modality_mismatch`）与第 6 行（`invalidInput{reason}`）；「`openCall` 已过而 `planRequest` 仍拒」定为两处判定不一致的缺陷，收场照契约 S-29 ④ | design 投影表 S-38 第 2、7 条行、新节「规划拒绝的三种值与收场」、流翻译表带内一行与 `StreamEnd`、失败映射表、成因表与表下两条、PAT-N4、N9；本页 T-19 |
| S-2（建议） | 连接池排队会把本机饱和折成 `upstream_unavailable` | 排队中被中止 ⇒ `local`、带 `queued` 留痕，不交 `aborted`；`maxConnections` 初值标「无测量依据、实施程测」；P-2 一侧的分类登 PAT-N18 ① | design 策略配置项 `maxConnections` 行、失败映射表、成因表 `unrecognized` 行、PAT-N18；本页 T-19 |
| S-3（建议） | `readStream` 未列内容成员闭集，非内容字段可能被当成认不出来 | 写明闭集 `content`／`reasoning*`／`reasoning_details`／`tool_calls`／`images`／`audio`，**另加 `refusal`**（非空即拒答文本，忽略就是静默丢）；闭集之外的成员一律忽略；闭集列入比较门 | design 流翻译表两行与表下「内容成员闭集」一条；本页 T-19、G 系列新增比较项 |
| 观察（`connectTimeoutMs`） | 它是 S-21 两个设置项之外的第三处时限来源 | 已在策略配置项表标价，不改 | — |
| 观察（撤除等待上界） | 若内核先完整撤除本插件再卸 P-2，撤除等待要等在途流自然收尾 | 写明上界「等于流的自然收尾，受 P-2 的时限约束」；撤除函数等最后一条在途收场、池销毁后才返回；内核次序登 kernel-basis probe 候选 | design 装卸表与「撤除的等待上界」一条；本页覆盖缺口 |
| 契约对齐（主线） | 同一批契约改写还承接了 PAT-N3 的 402／403 两行、PAT-N11（G-22）、PAT-N16、PAT-N17（G-23）、PAT-N14 的 ②③ | 各行改指契约坐标；PAT-N14 只剩「工具条目的来路」，改「待契约（与 MRR-N14 同一件事）」 | design 参数处置表 `maxOutputTokens` 行、策略配置项 `routeWireHints` 行、inject 边与依赖表、PAT-N3、N11、N14、N16、N17；README 分层状态 |
