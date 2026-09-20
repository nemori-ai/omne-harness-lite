# 产品版图：托管平台、竞品模型与开源自托管

- 原始出处：托管平台部分为 Retell、Bland、Smallest.ai、Famulor、TECHSY、Inworld 等厂商与评测博客
  @ 2026-09-19（**仅搜索摘要**）；Gemini 部分为 `ai.google.dev` 与 `firebase.google.com` 官方文档
  （**一手·直连**，同日）；开源部分的短板证据见 `field-reports.md`（GitHub issue，一手）。
- 消费对象：`research.md` 的「报价与真实成本」「自托管不等于功能对等」「中文是独立风险」三条结论。
- 来源立场：托管平台这块**几乎没有中立来源**——"Vapi vs Bland"由 Retell 发布、"Retell vs Vapi"由 Bland
  发布，各家都排自己第一。按"竞争者互评"采信：各家说**对手**的短处可参考，说自己最好不采信。

## 托管平台（互评口径，无独立实测）

- 延迟：Vapi 调优后中位约 500–700ms；Retell 开箱约 600–620ms；Bland 约 700–900ms 随配置深度变化。
  同批来源给的体感阈值：低于 700ms 像对话，高于 900ms 用户会察觉并流失。
- 定价：Retell 自 $0.07/min 起；Vapi 平台费 $0.05/min，但叠加 STT/LLM/TTS/电话后被举例为
  月账单 $10,000–13,200（同场景下平台费本身只占 $2,000）；Bland 打包电话费。
- 互评共识的强项分工：Retell 最快拿到托管低延迟电话 agent；Vapi 适合要掌控全栈的团队；
  Bland 适合高量外呼与确定性流程。

## Google Gemini Live（一手·直连，官方文档）

- 定价（Gemini 3.8 Live 标准档付费层）：文本入 $0.75/M；**音频入 $3.00/M 或 $0.005/min**；
  文本出 $4.50/M；**音频出 $12.00/M 或 $0.018/min**。计费口径逐字：
  "Billing is based on total input and output audio token consumption, calculated at a rate of
  25 tokens per second of audio"。
- 上下文（`capabilities` 页逐字）："A session has a context window limit of: 128k tokens for native
  audio output models [and] 32k tokens for other Live API models."
- 会话时长（`session-management` 与 `best-practices` 两页一致，逐字）：
  "Without compression, audio-only sessions are limited to **15 minutes** and audio-video sessions
  to **2 minutes**"；单个 WebSocket 连接约 **10 分钟**；开启 context window compression
  （滑动窗口 + 触发阈值）可 "extend sessions to an unlimited duration"；
  resumption token "valid for 2 hours after the last session terminates"。
- **语言数：三处官方口径互相矛盾，且无官方解释**——总览页逐字 "70 supported languages"；
  技术规格页语言表标题逐字 "Live API supports the following **99 languages**"（表内含
  Chinese (Simplified) `zh-Hans` 与 Chinese (Traditional) `zh-Hant`，未见 "Mandarin" 字样）；
  Firebase AI Logic 的 limits-and-specs 写 "17 core languages... totaling **89+ languages**
  including 'Chinese, Mandarin'"。三个数字 70 / 89+ / 99，**按来源冲突记录，不挑一个采用**。
- **无原生 SIP**：总览页未提原生 SIP，电话接入只在"合作伙伴集成"里提到第三方 Voximplant。
- 官方写明的限制："The native audio models only support `AUDIO` response modality"；
  Firebase 文档逐字 "The Live API does **not** support generating structured output (like JSON)
  or the Count Tokens API."；客户端场景要求用 ephemeral token。
- 未找到 Google 官方对延迟、口音、语言流利度等**体验层面**的自我批评式限制条款
  （与 OpenAI 消费端稿主动写"某些语言可能有非母语口音"形成对比），
  检索了总览、capabilities、best-practices 三页均未见——可能是其文档体例不写这类内容。

**「Gemini 音频输入便宜一个数量级」这条的正确口径**：官方定价对比成立——
Gemini 3.8 Live 音频入 $3.00/M 对 `gpt-realtime-2.1` 音频入 $32.00/M，约 10.7 倍。
但比较对象是 **`gpt-realtime-2.1` 而非 `gpt-live-1`**；`gpt-live-1` 按分钟计费（$0.05/min）不分 token，
**与按 token 计费不同量纲，不能直接比单价**。

## 开源自托管：能力与代价

**能力（厂商/社区口径）**

- Pipecat：Python，把语音 agent 建模为处理器管线，传输无关（传输要自己选和接），插件生态大；
  Pipecat Cloud 于 2026 年 GA。
- LiveKit Agents：建在 LiveKit 的 WebRTC 之上，**媒体服务器、Agents SDK、SIP bridge 全部 Apache 2.0**，
  agent 以参与者身份加入房间，自带电话能力，多方与视频场景强。

**代价（一手 GitHub 证据，详见 `field-reports.md`）**

- **LiveKit 自托管会丢失云端专有的自适应打断模型**，只能退回纯 VAD，对 backchannel 密集的语言
  （印地语/泰卢固语，中文同理）产生真实误打断；该 issue 无维护者回应、无 workaround。
  **"可以自托管"不等于"自托管功能对等"。**
- LiveKit 的电话延迟投诉被维护者**关闭为 "not planned"**。
- Pipecat 在真实电话部署下首轮延迟实测 4–5 秒；轮次检测组件曾在 8kHz（电话标准采样率）静默误判；
  多参与者响应错位的 issue 未解决；**官方明确不提供生产级自托管部署蓝图**。
- 没有任何一篇对两者做过受控对照实测。

**成本**：所谓"自托管有量时可压到 $0.05/分钟以下"，本轮检索后**仍只有厂商口径**。
唯一带可核对方法论的拆解来自 Cerebrium（**serverless GPU 云服务商，利益相关**）：
$0.02932/分钟，核心论点是"并发是分母"——满并发 180 路时 TTS 每通话小时约 0.67 美分，
10 路并发时成本高 18 倍。**该拆解只含 STT/LLM/TTS 计算成本，不含电话线路费与运维人力。**

## 中文与非英语

- OpenAI 官方文档体系内**查不到** `gpt-live-1` 的语言清单（七处材料，见 `gpt-live.md`）；
  消费端发布稿只有一句 "For certain languages, the model may have a non-native accent or gaps in fluency"。
- 中文自有生态存在且活跃，但**全部是厂商自述**：MiniMax Speech 2.6；阶跃星辰 Step-1o-Audio
  自称百毫秒级、支持双向打断；声网自述端到端中位 650ms、打断响应 340ms、
  新加坡/法兰克福/圣保罗 643/658/701ms；开源 TTS 中 Fish Speech 首句约 200ms、Kokoro 约 300ms。
- **本轮检索后，中文/非英语实时语音 agent 的独立实测缺口没有填上**：
  最接近的是一篇个人 ASR 工程博客（非厂商，但主题是通用 ASR 而非完整 agent），
  给出定性踩坑（专有名词误识别、中英混说被搅乱、远场混响、多人重叠）与通用 ASR 的量化
  （离线 WER <3%，流式首字 200–300ms，流式 $0.016/min vs 非流式 $0.008/min）。
  方言实测、中英混说错误率、国内实时语音 API 的第三方测试**一条都没找到**。

## 局限

- 托管平台的全部数字出自竞争者互评，系统性偏向发布方；单价随用量档位与打包方式变化大，只能当量级参考。
- Gemini 的数字是官方一手，但官方内部语言数自相矛盾且无解释。
- 自托管成本的唯一方法论来源本身是 GPU 云厂商，方向有利于己方。
- 未覆盖 Twilio、ElevenLabs、Deepgram 等链路中其他厂商，也未覆盖国内云厂商的整体方案。
