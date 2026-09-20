# OpenAI `gpt-live-1`：规格、主张与已知边界

- 原始出处（一手·直连，WebFetch 直取，2026-09-19）：
  `developers.openai.com/api/docs/models/gpt-live-1`、`.../guides/live`、`.../pricing`、
  `.../deprecations`、`developers.openai.com/cookbook/examples/audio/voice_agent_evaluation`。
- 原始出处（一手·经代理，2026-09-19）：`openai.com/index/introducing-gpt-live/`（消费端发布稿）、
  `openai.com/index/continuous-voice-interaction-with-gpt-live/`（工程稿）、
  `openai.com/index/introducing-gpt-live-1-in-the-api/`（API 专属发布稿）。
  这三篇对 WebFetch 直连返回 403，经 `r.jina.ai` 反向代理取得。
- 取得方式与可信度分级：**「一手·经代理」不等于原始字节**——链路是 OpenAI 服务器 → 第三方反代转换 →
  WebFetch 内置小模型摘要 → 本文，引号内是该小模型判定的原文，未经人工比对原始字节。
  比搜索引擎转述可信（确实访问了该 URL、是抽取而非复述），但仍可能漏抽或改写。
  `web.archive.org` 在本环境不可达，无法用快照交叉验证。
- 消费对象：`research.md` 的「链路不是模型」「gpt-live-1 的具体边界」「评测与生产脱节」三条结论。

## 一手·直连：官方文档页

- 模态：audio、text 输入输出；**image、video 明确不支持**。知识截止 2025-07-31。
- 端点：只支持 `v1/live/sessions`。Chat Completions、Responses、**Realtime**、转录、Assistants、Batch、
  Fine-tuning、Embeddings、图像生成、Videos、语音合成、翻译、Moderation、legacy Completions 全部不支持。
- 能力：支持 streaming 与 function_calling；**不支持结构化输出，不支持微调**。
- 计费：$0.05/分钟、**按秒计**；后端模型与工具用量另计。同页给出 `gpt-realtime-2.1` 的分模态价格
  （音频入 $32.00／缓存 $0.40／音频出 $64.00，文本入 $4.00／出 $24.00，图像入 $5.00，均为每百万 token）。
- 并发会话上限按 tier：25 / 50 / 200 / 300 / 500。
- **连接协议：WebRTC、WebSocket、SIP/电话集成三者并列**（`guides/live` 明写）。
  注意模型规格页本身不提 SIP，入门指南才写——引用时说清出自哪一页。
- 继任关系：`deprecations` 页**全页没有出现 `gpt-live-1`**；官方列的是
  "Jan 20, 2027 | `gpt-realtime` | `gpt-realtime-2.1`"。**`gpt-live-1` 不是 Realtime 的继任者**。
  易混淆项：另有一个转录模型叫 `gpt-live-transcribe`（接替 `gpt-4o-transcribe`，2027-02-26），
  与本包讨论的对话模型 `gpt-live-1` 是两条产品线。

**体系性未记载（强负面结论，非检索不足）**：`gpt-live-1` 的**上下文窗口、最大会话时长、
精确语言清单（尤其中文/普通话）**，在模型页、入门指南、cookbook 评测指南、定价页、三篇发布博客
共七处官方材料中**全部未载**。

## 一手·直连：官方评测指南（cookbook）

这一节对做 harness 的人最有用，因为它是 OpenAI 自己承认的评测难点：

- 逐字："GPT-Live listens while speaking, so user speech, assistant responses, interruptions,
  delegated reasoning, and tool execution can overlap."
- 逐字："The evaluation harness must therefore align audio and events on a continuously advancing
  timeline instead of assuming clean, alternating turns."——**干净的交替轮次这个假设在全双工下不成立**。
- 分级评测 CRAWL / WALK / RUN；并指出合成音频（CRAWL/WALK 两级）**无法建立**
  "multi-turn clarification, yielding, backchannel handling, or conversational recovery" 这类能力的证据。
- 逐字："Voice models are nondeterministic"——需要多次运行并报 P50/P90，单次结果无意义。

## 一手·经代理：三篇官方长文

**架构与职责切分**

- 消费端稿逐字："we decoupled GPT‑Live — which handles continuous interaction — from deeper work.
  When a question requires search, reasoning, or more agentic capabilities, GPT‑Live can delegate
  the task to another model like GPT‑5.5."
- 消费端稿逐字（全双工的具体表现）："GPT‑Live is built on a full-duplex architecture, meaning it can
  listen and speak at the same time... can show it's paying attention with phrases like 'mhmm' or 'yeah',
  engage in quick back-and-forth, or just stay quiet when you need a moment to think."
  并称模型"can therefore make interaction decisions many times per second: whether to speak,
  continue listening, pause, interrupt, or invoke a tool."
- API 稿逐字（对级联架构的判断）："single model that reasons over incoming and outgoing audio together,
  avoiding the latency and brittle handoffs of chained STT–LLM–TTS architectures."

**工程稿披露的实现事实**（此前材料完全没有）

- 媒体前端与推理逻辑**从 Python asyncio 改写为 Go**；效果自述"新系统的 p95 匹配前一系统的 p50"。
- 轮次判定的做法是**移除独立的轮次检测器**，改由语音模型自身控制对话流——理由是旧方案
  "检测器判断太早，用户会被打断；判断太晚，响应感觉迟缓"。代价转移到应用侧：应用服务器需要
  "从重叠、偶尔歧义的对话中分离出离散消息"，靠部分转录与时序信号推断说话者。
- 协议优化：启动从六个网络往返减到一个。
- 自述的边界：语音层能"短暂保持交流进行中"，但**"无法隐藏任意缓慢的响应"**；长会话靠"语境压缩"
  管理累积上下文；地理位置是"一阶关注事项"，路由到远端容量会增加延迟。

**官方自己写出的限制**（消费端稿）

- 逐字："For certain languages, the model may have a non-native accent or gaps in fluency"
- 逐字："At launch, GPT‑Live will not support voice with video or screen sharing in ChatGPT"
- API 稿**没有**对应的限制段落——同一发布、两份稿子，面向消费者的那份写了短板，面向开发者的那份没写。

**量化主张（全部为 OpenAI 自测，发布日无独立复现）**

- "GPT‑Live‑1 improves Full Duplex Bench performance by 30 percentage points over GPT‑Realtime‑2.1"
- 与 GPT-6 Astra（medium reasoning）搭配 "ranks #1 on Tau3"
- 合作方 Speak："cutting interruptions by almost 80% versus previous turn-based systems"
- 消费端稿称对 Advanced Voice Mode 在 GPQA、BrowseComp、τ³-Voice Telecom 上占优，
  并称 5–10 分钟匹配对话中被 "strongly preferred"。
- **「75.7% 盲测偏好」这个数字：广泛流传，一手未见。** 多家二手（MLQ、eesel、BigGo）都把它记为
  OpenAI 自述，但两次抓取消费端稿原文（含一次要求逐字输出的重试）只见 "strongly preferred" 定性表述，
  未见该百分比。无法判断是被摘要漏掉，还是出自博客之外的材料（发布会、X 帖、新闻稿）。
  **在来源闭合之前，不要引用这个数字。**

## 二手：开发者侧评价（均有商业利益相关）

- cellcog.ai 发布日文档审计（作者自述未做实机测试，同期其自家产品上线同构架构）：
  **打断不会自动取消后端工作**，后端需自管生命周期；应用侧自持权限、确认、私有函数执行与持久任务状态。
  该文对 Full Duplex Bench 30 点与 Speak 80% 两条的转述，经本轮与 API 稿原文比对**准确**。
- eesel.ai 评测（作者自述主要实测 ChatGPT 语音端，API 部分依赖官方材料；该站销售竞品客服产品）：
  不委托后端时 "its own answers can be shallow or occasionally odd"；过度殷勤，
  "it interrupts thinking pauses and paraphrases you too much"；
  称 $0.05/min 是 "the floor, not the bill"；并指出按通话时长计费与业务目标反向。

## 局限

- 三篇官方长文均为「一手·经代理」，未经原始字节核对；引用其逐字措辞前，若判断重要应重取原文。
- 语言支持、上下文窗口、会话时长这三项对本项目重要，官方体系内确认未载——
  这意味着**中文场景下的可用性只能靠实测确定，没有文档可依**。
- 全部性能数字来自 OpenAI 自测，两家二手来源均有商业利益相关，本轮无任何独立复现。
- ChatGPT 端的「GPT-Live」功能与 API 的 `gpt-live-1` 在多篇文章里混用同名，
  "没有公开 API、电话线路 coming soon" 一类说法指消费端，不适用于 API 模型。
- 未查 OpenAI 的 rate-limits 页、Help Center 与开发者论坛，上下文/时长/语言三项仍有极小概率载于别处。
