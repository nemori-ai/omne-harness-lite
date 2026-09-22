# 2026-09-18 · GPT-Live：信源更正后的重新调研

**这是原始材料，不是结论，更不是依据。**

**缘起**：产品负责人更正了上一次调研的信源——

> **quote**：「关于语音那块，我们刚刚到调研和设计是基于 gpt realtime 的对吧？
> 这个可能我提供的信源有误，gpt realtime 确实也是 openai 官方的，
> 但其实我们真正未来要兼容支持的机制是 GPT-Live 的，这块你先做调研，
> 然后对比 gpt real-time 分析对设计的影响。」

调研时间 2026-09-18，读的是官方开发者文档（见文末来源）。
上一篇笔记是 [Realtime 那一次](2026-09-18-openai-realtime.md)，**没有作废**——
但它对 GPT-Live 的描述**只抓到了表层**，下面第一节说明差在哪。

## 〇、一句话：上一次调研把它看小了

上一篇把两者写成「**同一件事的两代**」：回合制 → 全双工。

**那个描述不错，但不是要点。**真正的差别在这里：

| | **Realtime** | **GPT-Live** |
|---|---|---|
| **几个模型** | **一个**——语音、推理、选工具都是它 | **两个**——**语音模型 + 后端模型，分开** |
| 后端是谁挑的 | 没有这个问题 | **你自己挑**，与语音模型无关 |
| 对话与干活 | 在一个回合里 | **对话继续，活在后台跑**（叫「委派」） |

> **GPT-Live 不是「Realtime 的全双工版本」，它是把语音层和推理层拆开了。**

**这一条改变了语音在我们系统里的位置**——见第九节。

## 一、委派：对话继续，后台在跑

官方对这个词的定义：

> Sending work to the backend is called **delegation**: the conversation can continue while that work runs.

以及：

> GPT-Live can keep the conversation going while backend work runs.
> **Finishing that work does not mean the assistant has finished speaking.**

**两种委派模式，差别很大：**

| 模式 | 后端是谁 | 我们的 agent 在哪 |
|---|---|---|
| **responses delegation** | **OpenAI 托管的**一个 Responses 模型 | 只负责**执行工具**（模型选，我们跑） |
| **client delegation** | **我们自己的服务** | **就是后端本身** |

> **我们要兼容的是第二种。**我们有自己的 agent loop、自己的工具、自己的上下文——
> 托管那个后端在我们这里没有位置。

### client delegation 的形状，值得原样记下

| 步骤 | 发生什么 |
|---|---|
| 1 | 语音模型判断这事要干活，发来 `session.delegation.created`，`target: "client"` |
| 2 | **这条通知里只有元数据**：一个 id、一个类型、一个时间偏移 |
| 3 | **它不带用户说了什么，也不带任务文本** |
| 4 | 我们**自己从转写流里把请求重建出来** |
| 5 | 我们的 agent 跑完，**把一段短结果送回去** |

**第 3 步和第 4 步是要紧的**。官方原话：

> Listen for `session.input_transcript.delta` and `session.output_transcript.delta`…
> use the transcript events and application state to **work out what the user wants**.

> **语音模型不告诉我们它听见了什么任务，我们得自己拼。**

而送回去的结果**有硬上限**：

> limited to **500 tokens per append**

## 二、三个注入通道

结果不是「返回值」，是**往语音模型的上下文里追加一段**，且分三个通道：

| 通道 | 官方说法 | 说白了 |
|---|---|---|
| `session.instructions.append` | system-level instructions… such as a greeting, disclosure, or direction to stop speaking | **改它的行为** |
| `session.thinking.append` | information for internal reasoning, **not spoken on append** | **给它知道，但别说出来** |
| `session.commentary.append` | information the model **should speak aloud**, paraphrasing the appended text | **说给用户听** |

> **中间这两条，正好是[我们那两个标注](../design.md#每个块带两个标注给人看吗给模型看吗)的一个实例。**
> `thinking` = 给模型看 ✓ / 给人看 ✗；`commentary` = 两个都 ✓。
> **第三方独立走到了同一个形状上。**

**但第三条是我们没有的**：`instructions` 不是内容，**是指令**。
**本版不据此新增任何东西**——记在这里，真做语音时回来看。

**三条都不保证到达**，官方说得很直白：

> An appended acknowledgment arrives after estimated context injection;
> it is **not proof that the model has consumed or spoken the result**,
> or that an external action succeeded.

## 三、最硬的一条：语音层的历史不是我们的账

这是本次调研对本 topic 最有价值的一句：

> Live conversation history can be compacted; **it is not your booking record**.

配套的要求：

> Keep **important facts, confirmed actions, and current task state in your application**,
> and provide relevant context when needed.

它自己怎么管历史：

- **用到 90% 就自动摘要**；
- 换引擎时只拿得到**原始指令 + 最多 8192 token 的历史**（近期消息，外加有的话一份旧消息的摘要）；
- 明写：**较早的细节可能被摘要或省略**。

> **它自己就承认这份历史会掉东西，并要求把真相放在应用这边。**

**这从外面印证了[「记录是唯一真相来源」](../../PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)**——
而且是反着印证的：**不是我们要求语音层可信，是它自己说别信它**。

## 四、回合边界彻底没了，比 Realtime 更狠

Realtime 那边还有回合、有 item、有「这次响应结束了」的事件。**GPT-Live 全没有：**

> Transcript deltas have **no item ID or authoritative turn-completed event**.

> **Do not infer silence from a missing event** or treat a fragment as a complete user turn.

> GPT-Live has **no corresponding event marking the end of each spoken response**.

转写以**带起止毫秒的片段**到达，而且：

- **可以迟到，可以与助手说话的区间重叠**；
- 分组只是显示层的事，**而且必须可以重新分组**；
- 最硬的一条——

> **Do not derive row identity from changing text or end timestamps.**

> **一行的身份，不许从会变的文本或结束时间推出来。**

**这条对我们有直接约束**：如果我们把语音片段做成消息，**那条消息的身份得另有来路**，
不能是「按时间戳算出来的」。

## 五、打断与后台工作，明确解耦

> An interruption in speech **does not cancel a backend operation**,
> and **a cancellation request does not prove that an action was cancelled**.

> Before retrying a failed tool call, **check whether the original action already happened**…
> **a lost response should not cause a second booking**.

**这两句与本项目已有的两条是同一条：**

| 那边说的 | 我们这边已有的 |
|---|---|
| 打断说话 ≠ 取消后台工作 | [PF-006「中断不是失败」](../../PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)，以及转后台与 run 解耦 |
| 取消请求 ≠ 真的取消了 | 项目研发品味：**外部输出不因被运行时调用就变得可逆** |

## 六、那个「把历史截到用户听到的地方」的动作，没有继任者

Realtime 有一个精确到毫秒的截断动作，**连转写一起删**，
为的是「上下文里不留下用户没听到过的文字」。

**GPT-Live 里没有它。**播放进度**完全交给客户端**，而且官方直说：

> **纠正性的指示，收不回用户已经听见的话。**

**上一篇笔记据此写的那条结论要改口径**——见下一节。

## 七、提示词要拆成两份

> **The live model only needs the short handoff rules.**

> Keep the **full procedure and tool schemas in the backend prompt**.

而对语音模型的明确不信任：

> It **must not promise a booking, guess a price, or claim an action has finished**
> before the backend confirms it.

> **Do not guess the result while waiting.**

## 八、与 Realtime 的对照，一张表

| | Realtime | GPT-Live |
|---|---|---|
| 模型数 | 1 | **2（语音 / 后端）** |
| 后端可换 | — | **可以，而且可以是我们自己** |
| 回合 | 有，是协议层的 | **没有**，只有带时间的片段 |
| 「说完了」事件 | 有 | **没有** |
| 把历史截到听到处 | **有**，精确到毫秒，连转写一起删 | **没有继任者** |
| 播放进度 | 客户端报回服务端 | **完全归客户端** |
| 后台干活 | 在回合里的工具调用 | **委派，对话不停** |
| 打断 | 取消当前回复 | **不取消后台工作** |
| 历史的地位 | 应用可精确控制 | **会被自动摘要，官方说「别拿它当账」** |
| 注入上下文 | 往对话里加 item | **三个通道**（指令 / 静默事实 / 要说出口的） |

## 九、对本 topic 设计的影响

### 不变的三条

| 结论 | 为什么仍然成立 |
|---|---|
| **语音是一种能增量的块** | 片段带起止时间、一段一段到，**这一点两边一致** |
| **「半张图没有意义，半段语音有」这条判据** | 与哪一套 API 无关，是内容本身的性质 |
| **双工会动摇「消息一个接一个」，本版不解决** | **GPT-Live 只会让这条更成立**——它连回合都没有了 |

### 要改口径的一条

**上一篇据 Realtime 写的**：「用户没听到的，不能让模型以为它说过了」——
依据是那个连转写一起删的截断动作。

**GPT-Live 没有那个动作，它把这个目标放弃了。**

**但这不等于我们也要放弃。**恰恰相反：

> **语音层的上下文不是我们的记录**（第三节）。
> **我们自己的记录里，「说出去多少」和「用户听到多少」可以是分开记的两件事。**

**所以这条结论在我们这里仍然成立，只是[依据换了](../design.md#59-语音生成了不等于听到了)**——
不再靠「上游提供了一个对齐动作」，而靠「**我们的记录本来就是自己的**」。

### 新掉出来的两条（都不在本 topic 解决）

**一、语音层是系统里第二个持有上下文的参与者，而那份上下文不是我们的记录。**

这不是「多一种块」那么简单。它意味着：

> **将来会有第三份组装**——给人的、给 agent 的、**给语音层的**。
> 而第三份有硬限制：一次 500 token，总共 8192，重建会话最多 128 条。

**这反过来是[「一份会话日志，多种组装」](../design.md#57-一份会话日志两种组装)的一个印证**：
形状不必改，多一个消费者而已。**归 PF-010。**

**二、语音片段做成消息时，身份不能从时间戳或文本算出来。**

官方的硬约束（第四节）。**归真做语音的那一版。**

## 记录边界

- 本篇是 **PM 的提炼摘要**，不是任何人的裁决。
- **OpenAI 的做法不构成本 topic 的依据**，只作起点与印证。
- 读取时间 2026-09-18。GPT-Live 于 **2026-09-10 在 API 上正式可用**，**很新**，
  文档仍在变；**引用请核对当时的来源**。
- 本次**未验证**的几处，不作为任何一条的依据：多个委派并发时的确切语义、
  委派有没有超时、以及三个通道各自在上下文里怎么排序。

## 来源

- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration)
- [Delegation and tools in GPT-Live](https://developers.openai.com/api/docs/guides/live-delegation)
- [Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)
- [Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting)
- [Build more natural voice experiences with GPT-Live-1 in the API](https://openai.com/index/introducing-gpt-live-1-in-the-api/)
