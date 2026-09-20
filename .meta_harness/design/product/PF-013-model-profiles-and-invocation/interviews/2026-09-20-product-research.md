# 2026-09-20 · 产品调研：别人怎么做模型档案、失败处置与切换

**这是观察，不是依据。**产品负责人的裁决在 [decisions.md](../decisions.md)；
本页只记录起草时看到的事实与来源，**没有一条进过拍板记录**。
正文采纳的部分都在 §5/§7 里说明了「为什么适用于本产品」——
**理由是我们自己的，不是「别人也这么做」**。

## 一、看到的事实

### 1. OpenRouter 自陈两层回退

同一模型内的 provider 故障转移（`allow_fallbacks` 默认开，触发于 5xx 与限流），
与跨模型的 `models` 数组——**按序走一遍、绝不无限重试**。
官方博客明确把「模型消失 / 弃用」列为该数组要扛的场景。

- [Model Fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [Provider Failover vs Model Fallbacks](https://openrouter.ai/blog/insights/reliability-failover/)
- [Keep Your Agent Running When Models Disappear](https://openrouter.ai/blog/tutorials/keep-your-agent-running-when-models-disappear/)

**采纳的是「有序列表 + 走一遍就停」这个形状**——它让「试尽」可以完全由档案已有的字段决定，
**正好解开「不许出现任何秒数、又要判定何时放弃」这个矛盾**。

> **推测（标为推测）**：他们选「走一遍就停」大概是为了给延迟和花费一个上界。

### 2. 首 token 之后不重试，是行业既有做法

一份跨供应商的生产可靠性指南写明：首 token 之后的失败以「Response interrupted」呈现，
**永不重试**——重试会重复已经被读到的文本；并指出流一旦开始，错误只能以流内事件到达。

- [LLM API Timeouts, Retries, and Idempotency Across Providers](https://therouter.ai/blog/llm-api-timeouts-retries-idempotency-cross-provider-guide/)

**采纳，但理由换成了我们自己的**：PF-009 的三条记录规矩合起来已经让「再发一次」没有落脚点。
**不是因为别人这么做，是因为我们的记录规矩不允许两份回复。**

### 3. 切到不支持某模态的模型，会话「卡死」是同类产品反复出现的投诉

共同形态是：**一条带图的消息进了历史，这个会话在纯文本模型下就永远发不出去**。

- [open-webui #2628](https://github.com/open-webui/open-webui/issues/2628)（切到非视觉模型直接 hang）
- [open-webui #10592](https://github.com/open-webui/open-webui/issues/10592)
- [cline #9819](https://github.com/cline/cline/issues/9819)（文本模型 404）
- [opencode #24948](https://github.com/anomalyco/opencode/issues/24948)
- deepseek-harness discussion #2370（带图历史切不到纯文本模型）

**这批观察最初被写成待裁决**，产品负责人 2026-09-20 以[裁决 14](../decisions.md#裁决-14--模态兼容挡在算合法目标那一刻) 关掉：
**不兼容的模型根本不进合法目标集合**，从源头挡住。正文留它作现实依据。

### 4. 界面显示的模型与实际答话的模型不一致，引发过大规模投诉

多家媒体报道用户抗议被静默改路由；一条 issue 的标题直接就是
「requests served by X while the app kept showing Y」。
**用户反对的不是改路由本身，而是不被告知、也无法留在自己选的那个上。**

- [TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/openai-responds-to-furious-chatgpt-subscribers-who-accuse-it-of-secretly-switching-to-inferior-models)
- [Tech Edition](https://www.techedt.com/openai-faces-backlash-over-secret-chatgpt-model-switching)
- [openai/codex #44637](https://github.com/openai/codex/issues/44637)

**采纳成 §7 的反面案例与 acceptance 第一条「绝不能」**——它正是「选中模型 / 有效模型」
这一对要防的错，也是「不替用户改选」那条规则的现实依据。

> **推测（标为推测）**：他们做这个路由是为了安全策略。**动机是推测，投诉本身是事实。**

### 5. 凭据按「连接 / 范围」配是主流，按模型逐条配是少数

LiteLLM 的 master key 登录被其自己的文档批评为
「**永久、共享、明文、无法按人轮换、事后分不清是哪个管理员做的**」。

- [Open WebUI × LiteLLM](https://docs.litellm.ai/docs/tutorials/openweb_ui)
- [Open WebUI 讨论 #4477](https://github.com/open-webui/open-webui/discussions/4477)（按用户配 key 仍是需求，不是现状）

**用来把「一把凭据」的代价写诚实**：除了「做不到这个模型走另一个账号」，
还写了「同范围内所有自建档案的用量记在同一把凭据上，**上游账单分不到单条档案**」。

## 二、看过但没采纳的

| 没采纳 | 为什么 |
|---|---|
| **OpenRouter 的跨模型回退**（一个模型不行就自动换另一个来答） | 它**静默改变了是谁在答话**——正撞上第 4 条那个投诉，也撞上「换模型是用户的命令」。正文写死**换模型不是这一层的手段** |
| **自动把图交给一个视觉模型描述成文字** | 那等于这一层自己再发起一次模型调用，与「一步之内至多一次模型调用」和 Run 的成本归属直接冲突 |
| **按模型逐条配凭据**（LiteLLM 风格） | 产品负责人已裁决范围层一把。代价如实写进 §7 |
| **切换前先校验**（`switchable` 布尔 + 拒绝理由） | 「不得拒绝」已排除。而且校验要在切换那一刻判窗口，**与生效点直接矛盾** |
| **九点 aptitudes** | 裁决不留。真实代价不是存储，是「**每加一个模型就有人去填九个没人读的格子，填错了没人发现**」 |

返回 [topic 入口](../README.md)。
