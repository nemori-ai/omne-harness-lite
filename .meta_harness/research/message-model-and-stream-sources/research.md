# DSH、pi-ai 与 minimal-runtime 能承载 PF-009 消息模型与流协议的哪些条款

- 调查对象与日期：DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`，Session 格式 v3）；
  pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（`pi-ai@0.86.1`）；
  minimal-runtime `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（未进 main，非证据）。2026-09-23 只读取证。
- 消费者：本程 proposal「消息与流基线」（待出现）。
- 最近核对：2026-09-23（首轮）。
- 当前结论：前四种消息三源都有，后三种（`SystemReminderMessage`、`ToolInternalMessage`、`CompactionMessage`）、
  块级两个标注、块上的模态文本字段、语音块、「整体替换」填法，三源都没有。流语法 DSH 最接近 PF-009 §5.5；
  pi 的参数残缺解析、「半条消息进上下文」与「组装跳过中止消息」与 PF-009 直接冲突；DSH 与 PF-009 的直接冲突在「永久保存到达过程」
  与「图的文本表示在出门时派生」。三源都没有「事件序列 → 落盘消息 → 两份组装」的单体测试夹具。**这不是接受决定。**

## 问题与区分条件

要核实的是：以 PF-009 rev 4 为主的每一条产品条款，三源里是**原样可承载**、**需要增改**、**既有机制与之冲突**，
还是**根本没有**；以及让模型请求运行时与工具运行时脱离 agent loop 独立测试时，三源各自断在哪一环。

会改变判定的观察：某源在本轮未读的实现里（pi 的另五个 API 实现、DSH 的 DeepSeek SSE 翻译、minimal-runtime 的 session 包）
有与已读部分相反的行为；DSH 的不变量伴件在发行装配里默认挂载与否；pi 0.85.1 与 0.86.1 在流事件上的差异。

## 证据入口

- 逐格判定与四种判定的口径：[对照报告](reports/2026-09-23-message-and-stream-mapping.md)。
- 源码行号与原文要点：[dsh-llm](notes/dsh-llm.md)（D1–D12）、[dsh-session-format](notes/dsh-session-format.md)（S1–S7）、
  [pi-ai](notes/pi-ai.md)（P1–P12）、[minimal-runtime](notes/minimal-runtime.md)（M1–M3）。
- 取证条件、立场与交叉核对：[evidence.md](evidence.md)。

## 当前结论

### 三源都没有 `SystemReminderMessage`、`ToolInternalMessage`、`CompactionMessage` 这三种独立消息类型

DSH 的消息只有 `system | user | assistant` 三种角色，注入的上下文与工具结果都是 `role:'user'`，靠 `source.kind`（`plugin` / `tool`）区分；
压缩是一条带「区间替换」操作的普通消息事件（D1、S3）。pi-ai 有四种角色（多一个 `toolResult`），提醒与压缩摘要是 `pi-agent-core`
里以声明合并加的应用层消息，转请求时一律变成 user（P1、P10）。两源都没有工具执行过程的消息（D9、P9）。

- 适用范围：上述三个精确版本。**不推广到「这些类型加不进去」**——DSH 的来源与块都是合并可扩展的，pi 的应用消息也是。
- 代价与不适用：DSH 把「谁在说话」放在 `source.kind` 上，而 `plugin` 这一种来源同时用于系统提示与注入内容（D1），
  PF-009 §6.1 要求的「看类型就答得出」要额外一层判别；DSH 作者的现行决定是注入内容「不带包装」投影成普通 user 内容，
  与 PF-009 §5.3「落成普通角色后内容自带系统所加标识」方向相反（D1）。pi 的 `custom` 消息映射在 agent 层统一做，不在 provider 实现里（P10），
  与 PF-009 §6.2「映射归各家 adapter」的落点不同。
- 撞上这条事实会怎样：直接复用任一源的消息联合类型，PF-009 的七种会退化成「三/四种角色 + 来源判别」，§6.1 的判定要靠读来源字段，而来源字段在两源里的分类轴都与 PF 不同。
- 来源：[D1](notes/dsh-llm.md#d1-消息一个带身份的不可变值角色只有三种)、[S3](notes/dsh-session-format.md#s3-压缩是区间替换不是逐块点名)、[P1](notes/pi-ai.md#p1-四种消息没有消息身份)、[P10](notes/pi-ai.md#p10-应用层自定义消息与会话条目)；对照报告 §1。
- 最近核对：2026-09-23 / 上述版本。

### 三源都没有块级「给人看 / 给模型看」标注，只有消息级或事件级的近似

DSH 的近似在事件级：模型面取 surface，人的记录取「以 append 进入」的事件，替换副本只给模型（S3）。
pi 的近似在消息级与字段级：`custom.display`、`bashExecution.excludeFromContext`、`toolResult.details` 不进请求（P10）。
minimal-runtime 的 `Frame` 有可见性授权，那是权限不是标注（M3）。

- 适用范围：三个精确版本的块类型与消息类型全部字段。
- 代价与不适用：PF-009 §4 把两个标注定为「中枢机制」，PF-010 的压缩（名单 + 块标注算出可读集合）与 §5.6 的「✗✗ 半截工具调用」都以它为前提；
  三源里没有任何一个现成结构能承载「同一条消息里各块去向不同」。PF-010 §5.7 还要点名具体块，而两源的块都没有身份：
  DSH 只能以（消息 id，下标）寻址，pi 的消息连 id 都没有（D1、P1）。
- 来源：[S3](notes/dsh-session-format.md#s3-压缩是区间替换不是逐块点名)、[P10](notes/pi-ai.md#p10-应用层自定义消息与会话条目)、[M3](notes/minimal-runtime.md#m3-sessionmessage-stream-是投递面不是消息模型)；对照报告 §3。
- 最近核对：2026-09-23 / 上述版本。

### 两源都把「图给不能看图的模型」放在出门时派生，与 PF-013 转换件的「落盘前就地写」方向相反

DSH 在把请求交给 adapter 前，若模型不收图，把全部图换成固定占位文本，文件则无条件换成句柄文本；每次请求重算，块上不留字段（D3）。
pi 的 `transformMessages` 做同样的事（P11）。PF-012 §5.8 与 PF-013 的转换件要求在「消息落盘之前」就地给块上记录文本的字段赋值、之后不变，
没有文本那一份的块把收不下它的模型挡在合法目标之外（PF-013 §5.11）。

- 适用范围：两源的请求组装路径；minimal-runtime 未导入这段投影（M1）。
- 代价与不适用：两源的出门投影会**把请求照样发给纯文本模型、用占位代替图**，这正是 PF-013 §5.11 选择在「算合法目标」那一刻挡掉的情形；
  而且因为是每次重算，模态投影（PF-013 §4）在两源里没有可以增量维护的单调事实来源。文件句柄文本一侧与 PF-013「文件引用是文本、不是模态」一致。
- 撞上这条事实会怎样：沿用两源的投影位置，块上就不会有「转没转」这个落盘即定的事实，PF-013 的模态投影只能每次从全部历史重算。
- 来源：[D3](notes/dsh-llm.md#d3-图不能给纯文本模型在出门那一刻处理不落盘)、[P11](notes/pi-ai.md#p11-图给不能看图的模型出门时换占位)；对照报告 §3。
- 最近核对：2026-09-23 / 上述版本。

### DSH 的工具调用块保留模型原始参数串，pi 在流中与收尾都对参数做残缺解析

DSH 的 `tool-call` 块与 `tool/call` 事件都保存模型产出的原始 JSON 字符串，到派发时才解析（D2、S4）。
pi 每个参数 delta 到达即做「严格 → 修补 → 残缺前缀」三级解析，收尾时再解析一次并删除原始串，`toolcall_end` 只交出对象（P4）；
`pi-agent-core` 自己在注释里承认截断时的调用可能「解析并通过校验、却悄悄不完整」，于是在 `length` 收尾时一律判错（P4）。

- 适用范围：DSH 自有 adapter 路由；pi 的 `openai-completions` 逐行已读，另五个 API 实现只确认调用同一解析函数。
  **DSH 经 `dsh-llm-pi-ai` 调 pi 的路由不在「原始串」之列**：那里 `block-end` 的参数是 pi 解析结果的重新序列化（D10）。
- 代价与不适用：PF-009 §6.10「没收齐的参数不解析、只在收齐之后解析一次」与 pi 的机制直接冲突；DSH 满足这一条，但它的装配器以 `block-end` 为权威终值、
  不校验与 delta 之和一致（D5），参数串的「原始」取决于 adapter 是否如实给出。
- 来源：[D2](notes/dsh-llm.md#d2-内容块六类合并可扩展)、[D10](notes/dsh-llm.md#d10-调-pi-ai-的那条路由会把原始参数串换成重新序列化的结果)、[S4](notes/dsh-session-format.md#s4-工具调用有独立的日志事件参数原样)、[P4](notes/pi-ai.md#p4-工具参数流中每一次-delta-都解析收尾时残缺也解析)；evidence「两源之间的交叉核对」第一行。
- 最近核对：2026-09-23 / 上述版本。

### DSH 的 `StreamChunk` 在块级开合、封口交完整块、账只一次与必有结局上最接近 PF-009 §5.5，但后两条只由可选伴件强制

DSH 的词表是 `block-start / 三种 delta / block-end{完整块} / usage / finish`，块索引关联，任意块类型都可开合（D4）；
不变量伴件把「delta 必须落在同类已开块上」「usage 至多一次」「finish 后无 chunk」「必须以 finish 结束」写成可执行检查（D5）；
运行时把 adapter 抛错归一为终止 chunk（D6）。pi 的事件只对文本、思考、工具调用三种用途开合，没有独立的用量事件，终止事件带完整消息（P3）。
按对照报告 §4 的九行计数：DSH 可承载五、需改三、未覆盖一；pi 可承载二、需改四、未覆盖二、不可承载一；minimal-runtime 可承载三、需改五、未覆盖一。

- 适用范围：`dsh-llm` 的流协议层；「强制」只在 `llm-invariant` 伴件已挂载时成立，本轮没核对哪些发行装配默认挂载它。
- 代价与不适用：装配器本身是宽容的——没有 finish 时按 `stop` 处理、usage 与 finish 都后写覆盖、缺 start/end 的 delta 也能装配（D5）；
  adapter 迭代器正常结束却没给 finish 时运行时不补（D6）。**伴件不在时，「必有结局」与「账只一次」都会静默退化。**
  minimal-runtime 的切片恰好没导入伴件与运行时（M1）。
- 来源：[D4](notes/dsh-llm.md#d4-流协议streamchunk-七种块索引关联)、[D5](notes/dsh-llm.md#d5-装配器是宽容的语法由一个可选的不变量伴件把关)、[D6](notes/dsh-llm.md#d6-失败统一成终止-chunk)、[P3](notes/pi-ai.md#p3-流事件每块-startdeltaend终止是-done-或-error)、[P5](notes/pi-ai.md#p5-流的结局靠实现自觉事件流类不强制)、[M1](notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片)；对照报告 §4。
- 最近核对：2026-09-23 / 上述版本。

### 两源都没有「开块时声明追加或整体替换」，也都没有语音

两源的开块事件只带块类型，所有 delta 都是追加（D4、P3）；两源的模态词表都只有文本与图（D2、P2）。

- 适用范围：两源的助手流；pi 的工具更新是另一条通道，见下条。
- 代价与不适用：PF-009 §5.5 的「整体替换」填法与 §6.15 的「每一块开块时自说」在两源里没有任何对应物，也就没有可复用的实现或测试；
  PF-009 §7 自己也写明「整体替换」模型那边用不上、是为工具面板留的——而两源的工具侧恰恰都没有块级帧。
- 来源：[D2](notes/dsh-llm.md#d2-内容块六类合并可扩展)、[D4](notes/dsh-llm.md#d4-流协议streamchunk-七种块索引关联)、[P2](notes/pi-ai.md#p2-内容块文本思考图工具调用)、[P3](notes/pi-ai.md#p3-流事件每块-startdeltaend终止是-done-或-error)。
- 最近核对：2026-09-23 / 上述版本。

### 「组装结果与一次性拿到的相同」在三源里都不是被检查的不变量

DSH 装配器以 `block-end` 为准，伴件只查类型与开合，不查内容（D5）；它的测试断言「紧凑喂入 == 逐条展开喂入」与 `blocks()` 幂等，
fast-check 性质测试不含「任意切分方式下装配相同」（D7、D11）。pi 的帧归约同样以权威 end 为准，测试覆盖语法错误而不覆盖和（P8）；
参数经残缺解析再序列化后更不保证与原始串一致（P4、D10）。minimal-runtime 没导入性质测试（M1）。

- 适用范围：三源的装配/归约层与随附测试。**不推广到「三源会装配出不同结果」**——那需要构造一个 delta 之和与 end 不一致的流去跑，本轮没做。
- 代价与不适用：PF-009 §6.8 说这是「可验证的性质，不是一句愿望」；三源都没有现成的验证可继承。DSH 的「以 end 为准」意味着 adapter 给错 end 时，
  用户在流里看到的与日志里留下的会不同，而没有任何一层会报错。
- 来源：[D5](notes/dsh-llm.md#d5-装配器是宽容的语法由一个可选的不变量伴件把关)、[D7](notes/dsh-llm.md#d7-紧凑流记录把怎么到的无损存下来)、[D11](notes/dsh-llm.md#d11-可测零件)、[P8](notes/pi-ai.md#p8-可回放的帧编码终止结算不在帧里)。
- 最近核对：2026-09-23 / 上述版本。

### 三源对流断时半截工具调用的处置互不相同，也都不同于 PF-009

DSH：用户叫停时只把非空白 text/reasoning 装进 `interrupted` 消息，工具调用不论开合都不进消息；写到上限截断时装配直接丢掉全部工具调用；
被丢的调用只在嵌入的流记录里留证（D5、D8、S2）。pi：半截调用以残缺解析的对象留在消息里；截断时被合成的错误结果回喂模型；
中止/出错的消息在组装时整条跳过，用户已看到的文字模型也看不到（P4、P6）。PF-009 §5.6 要求：留在消息里、两个标注都关；
用户叫停时已交付的文字给模型；另补一条中断提醒。

- 适用范围：DSH 的装配器与 agent-loop 取消路径；pi 的 `openai-completions` 与 `pi-agent-core` 的 loop 与请求组装。minimal-runtime 只有装配器，loop 未核对。
- 代价与不适用：DSH 作者**明确否决过**给模型看的中断消息，事实只留在 `turn/end{aborted}`（D8）——PF-009 §6.13 的「只要中断就补提醒」在 DSH 没有对应物，而且是有意为之。
  pi 在「用户叫停、已有内容」一行与 PF-009 相反：PF-009 给模型的那份保留已交付文字，pi 整条跳过。
- 撞上这条事实会怎样：沿用 DSH 的截断处置，日志里就没有「它当时打算调什么」这个事实（PF-009 §5.6 要留的正是这个）；沿用 pi 的，模型会看到一个自己没发完整的调用和一条系统编的错误结果。
- 来源：[D5](notes/dsh-llm.md#d5-装配器是宽容的语法由一个可选的不变量伴件把关)、[D8](notes/dsh-llm.md#d8-这些零件在-agent-loop-里被接成一次尝试一份结算)、[S2](notes/dsh-session-format.md#s2-一次模型尝试一份结算结算里嵌着整条紧凑流)、[P4](notes/pi-ai.md#p4-工具参数流中每一次-delta-都解析收尾时残缺也解析)、[P6](notes/pi-ai.md#p6-中止与出错部分内容留在消息里但组装时整条跳过)；对照报告 §5。
- 最近核对：2026-09-23 / 上述版本。

### 只有 pi 有工具执行中的输出通道，而它是结果快照的瞬态广播，不是一条消息的到达增量

DSH 的工具执行上下文只多 `deferContext` 与 `concludeTurn`，UI 卡片由参数与最终结果纯算（D9）；minimal-runtime 的瞬态源只定义了模型尝试（M3）。
pi 的 `onUpdate` 每次交出整份部分结果（`content` + `details`），发成瞬态事件、从不进上下文、不落盘，工具定义里无需声明（P9）。

- 适用范围：三源的工具执行路径。
- 代价与不适用：pi 的通道满足 PF-009 §6.14（不进模型上下文）与 PF-006「系统不查工具定义」，但它只有「整份替换」一种、在结果级而非块级，
  没有节流或合并，监听者被逐个 `await`，且监听者失败会传回工具结算（后一点是代码阅读推断）——与 §6.16、§6.17 相反。
  minimal-runtime 的投递面对瞬态帧有「丢最旧并发 gap」的策略，gap 只说谁、为什么，不说多少（M3）。
- 来源：[D9](notes/dsh-llm.md#d9-工具执行没有执行中往外说话的通道)、[P9](notes/pi-ai.md#p9-工具执行中的更新整份部分结果瞬态不落盘)、[M3](notes/minimal-runtime.md#m3-sessionmessage-stream-是投递面不是消息模型)；对照报告 §6。
- 最近核对：2026-09-23 / 上述版本。

### DSH 的会话格式承载「只增不改、消息只是日志一部分」，但把到达过程永久存进结算

DSH 的会话日志是 seq 连续的只增事件流，消息只占四类事件，未识别的必需事件拒绝重建（S1）；每次模型尝试提交一份结算，
结算里嵌着整条带时间戳、保留全部 delta 边界的紧凑流；作者明确否决过「只存装配后的消息」（S2）。
pi 只在消息收尾时写条目，帧编码注明终止结算另存（P7、P8）。

- 适用范围：DSH Session 格式 v3；pi 的 harness 会话条目（其现行地位本轮未核）。
- 代价与不适用：DSH 这一选择与 PF-009 §9.2「不留到达的过程」直接相反（PF-009 自己也引了这一分歧）；作者自记的代价是结算前没有持久证据（进程丢失即丢整条在途流）、
  单份结算可能很大（S2）。格式历史包袱：三条相邻迁移约 4,700 行，v1→v2 改变事件基数而重写全部 seq 与同会话引用，作者自评「让以后改变基数的迁移在设计上就是昂贵的」；
  恢复后当前历史整份常驻内存（S5、S6）。
- 来源：[S1](notes/dsh-session-format.md#s1-会话日志是只增的事件流消息只是其中四类)、[S2](notes/dsh-session-format.md#s2-一次模型尝试一份结算结算里嵌着整条紧凑流)、[S5](notes/dsh-session-format.md#s5-格式版本与迁移链)、[S6](notes/dsh-session-format.md#s6-jsonl-落盘)、[P7](notes/pi-ai.md#p7-半条消息以完整消息的类型存在于上下文数组里)、[P8](notes/pi-ai.md#p8-可回放的帧编码终止结算不在帧里)；对照报告 §7。
- 最近核对：2026-09-23 / 上述版本。

### minimal-runtime 的 LLM 切片丢了 DSH 兜住流语法与失败归一的两层；它的 message-stream 是投递面，不是消息模型

`@omne-harness-lite/llm` 与 DSH 原件的差异只在 import 与格式化，但完整 `LlmRuntime`、`invariant` 伴件、图/文件请求投影与性质测试都未导入（M1）。
`message-stream` 把已提交事实与在途瞬态合成一条客户端流：租户绑定、HMAC 完整性保护的持久游标，进程内的活动代际，先订阅重建，
事实队列不丢、瞬态环丢最旧并发 gap；载荷是不透明 JSON（M3）。

- 适用范围：未合入分支的一次性读数，**不是上游事实，也不是已接受设计**。
- 代价与不适用：切片里剩下的装配器对「缺 finish」「usage 多次」都是宽容的，没有任何一层报错（M1 的推论）；
  `message-stream` 不定义消息、块、标注或流语法，对 PF-009 只触及 §6.9 与 §6.16 两处。
- 来源：[M1](notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片)、[M3](notes/minimal-runtime.md#m3-sessionmessage-stream-是投递面不是消息模型)。
- 最近核对：2026-09-23 / `d79484d`。

### 三源都没有「事件序列 → 落盘消息 → 两份组装」的单体测试夹具，零件散在 loop 或宿主服务上

DSH 的零件最全：纯装配器、紧凑流、纯派生都在，但脚本化输入要经 Cordis 的 `LlmRuntime`，结算类住在 agent-loop 包，
派生住在 session 包（D8、D11、S3）。pi 有假 provider、可注入的流函数与纯归约，链在 agent-loop 里闭合，中间经过「半条消息进上下文」（P7、P12）。
minimal-runtime 只有纯装配与紧凑流（M1）。三源都没有「工具帧 → 那条消息」这一环（D9、P9、M3）。

- 适用范围：三源已读的包与测试。
- 代价与不适用：本项目要让模型请求运行时与工具运行时各自不经 loop 就闭环，链上的每一环——脚本化事件源、语法校验、事件 → 完整消息（含三种收场）、
  完整消息 → 追加端口、日志 → 两份组装、帧 → `ToolInternalMessage`——都得能单独调用；对照报告 §8 的表格标出了三源各自断在哪一环。
  **这是对缺口位置的陈述，不是对接口形状的选择。**
- 来源：[D8](notes/dsh-llm.md#d8-这些零件在-agent-loop-里被接成一次尝试一份结算)、[D11](notes/dsh-llm.md#d11-可测零件)、[P12](notes/pi-ai.md#p12-可测零件)、[M1](notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片)；对照报告 §8。
- 最近核对：2026-09-23 / 上述版本。

### 两源的消息与块类型各自带着宿主或供应商的耦合

DSH 的类型文件直接扩展 Cordis 的事件表与 Typert 的错误表，图/文件块依赖 `dsh-attachment`，运行时是 Cordis 服务并结构化读取 `fs` 服务（D12）。
pi 的块类型里嵌着注明供应商专属的字段（`textSignature` 注 OpenAI Responses、`thoughtSignature` 注 Google、`namespace` 注 OpenAI Responses），
`Usage` 带计价，`AssistantMessage` 带 `api/provider`，图字节内联（P1、P2）；残缺解析在六个 API 实现里各调一次（P4）。

- 适用范围：两源的公开类型与运行时入口。
- 代价与不适用：拿 DSH 做起点，就要在 fork 时切掉宿主依赖——minimal-runtime 的切法说明，切掉宿主运行时的同时也切掉了失败归一与语法校验两层（M1）。
  拿 pi 做起点，供应商字段与解析时机随每个 API 实现分散；pi 的类型没有消息身份。两源都不带块标注与模态文本字段，承载这两项意味着改写各自的装配、派生与出门投影。
- 来源：[D12](notes/dsh-llm.md#d12-与宿主的耦合)、[P1](notes/pi-ai.md#p1-四种消息没有消息身份)、[P2](notes/pi-ai.md#p2-内容块文本思考图工具调用)、[P4](notes/pi-ai.md#p4-工具参数流中每一次-delta-都解析收尾时残缺也解析)、[M1](notes/minimal-runtime.md#m1-omne-harness-litellm-是-dsh-dsh-llm-的纯零件切片)；对照报告 §9。
- 最近核对：2026-09-23 / 上述版本。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| DSH 的 `llm-invariant` 伴件在需要它的装配里是挂着的 | 「DSH 的 `StreamChunk` …最接近 PF-009 §5.5」里「账只一次、必有结局」两行从可承载降为需改 | 未核对：没查发行 profile 的挂载清单 |
| pi 另五个 API 实现的中止与收尾与 `openai-completions` 同构 | 「DSH 的工具调用块保留…pi…残缺解析」对这五个实现的收尾部分；「三源对…半截工具调用的处置」的 pi 一侧 | 部分：只 grep 到它们调用了同一解析函数 |
| pi 0.85.1 与 0.86.1 的流事件与解析行为相同 | 对「DSH 经 pi 路由」「minimal-runtime 钉的 pi」一侧的推广 | 未核对 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| DSH 装配器在「delta 之和 ≠ block-end」时的实际后果 | 构造一条这样的 chunk 序列喂 `BlockAssembler` 与紧凑流，比对 `blocks()` 与 `joinAssistantStreamText` | 「组装相同」的验证能否继承 DSH 的测试；proposal 定流契约前 | 调研或验证执行者，一个小探针 |
| pi 缺终止事件时是否真的挂起；更新监听者抛错时工具结算的实际结果 | 用 faux provider 构造只 `end()` 不推终止事件的流；注册一个抛错的 `tool_execution_update` 监听者 | pi 作为工具帧起点时 §6.17 的判定；proposal 定工具帧前 | 同上 |
| DSH 哪些发行装配默认挂载 `llm-invariant` | 读 DSH 的 profile / 装配清单 | 同第一行支撑假设 | 调研执行者 |
| minimal-runtime 的消息落盘形状 | 读 `packages/session/{session, persistence, projection}` | 对照表第三列的「未核对」格子 | 调研执行者 |
| PF-009 §6.6 与 PF-013 转换件的口径、出错断流时已交付内容的去处、嵌套块的标注与身份、语音块标注的时序 | 产品正文层面的确认（见对照报告 §11） | 消息模型 proposal 的块字段与流断收场 | 产品负责人 / 对应 topic owner；**本研究只报告，不裁决** |

## 采用与后续核对

目前没有提案或决定消费本研究；「消费者」字段指向的 proposal「消息与流基线」出现后回填链接。
上游换版本时，先 grep `evidence.md` 与 `notes/` 里的旧 commit token；触及上面任何一条结论，就按[演进事件词](../README.md#演进事件词)
建 `changelog.md` 记一条，再改本文件。
