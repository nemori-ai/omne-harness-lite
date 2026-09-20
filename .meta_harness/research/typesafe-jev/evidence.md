# 可复核的来源与观察

取证日 2026-09-19，分两轮：第一轮（E1–E6）核发布周主张，第二轮（E7–E13，同日）补机制、训练、
官方用途与社区场景四面。全部通过 WebFetch/WebSearch 取得，**未执行任何实际 API 调用**。
以下每条记录的「实际观察」为来源页面所载内容；本项目未复现其中任何测量。

| 编号 | 来源 | 立场 | 本轮 |
|---|---|---|---|
| [E1](#e1-官方发布) | 发布博客 | 厂商自述 | 一 |
| [E2](#e2-官方文档) | `docs/models` 限额页 | 厂商自述 | 一 |
| [E3](#e3-hn-发布讨论) | HN 原帖（两次抓取：256 → 498 条） | 一手社区，含官方回帖 | 一、二 |
| [E4](#e4-独立预注册测试) | PrimeLine 预注册测试 | 独立实测，单人单批 | 一 |
| [E5](#e5-openrouter-可得性) | OpenRouter 模型列表 | 第三方平台 | 一 |
| [E6](#e6-二手技术综述) | 媒体与聚合分析 | 二手，仅交叉印证 | 一 |
| [E7](#e7-官方概念与机制文档) | `docs` 概念/原语/状态/置信/构建/API 七页 | 厂商自述 | 二 |
| [E8](#e8-官方自述的能力不均) | `docs/model-jaggedness/jev-1.13` | 厂商自述**弱点** | 二 |
| [E9](#e9-官方用途索引与配方清单) | `docs` 用途索引、demo、cookbook 导航 | 厂商自述 | 二 |
| [E10](#e10-社区黑盒架构分析) | archerhume 行为探测 | 独立实测＋分级推断 | 二 |
| [E11](#e11-社区实际使用记录) | paddo.dev、every.to、LangChain | 独立第三方实践 | 二 |
| [E12](#e12-社区用例汇总与开发者叙述) | awesome-jev、dev.to | 社区汇总，强度低 | 二 |
| [E13](#e13-rlcd-命名碰撞) | arXiv 2307.12950 与其复现库 | 学术一手 | 二 |

## E1 官方发布

- 消费对象：`research.md` 的「schema 合法不保证事实正确」「速度与成本数字全部来自厂商」
  「架构与训练方法未公开」三条结论。
- 来源与精确修订：<https://typesafe.ai/blog/introducing-system-one-models-and-jev> @ 2026-09-19 抓取；
  发布日 2026-09-15，对应模型 `jev-1.13.0`。
- 来源立场：厂商自述。只证明 TypeSafe 宣称什么，短板与代价另找独立来源（见 E3、E4）。
- 取得方式：WebFetch 页面全文，按架构、量化主张、幻觉措辞、局限、输入输出、可得性六项提取。
- 环境与前提：页面为营销与技术混合的发布稿，非论文；其中的对照实验由 TypeSafe 自行设计与执行。
- 实际观察：
  - 类型安全原话 "The model never makes type errors."；
  - 自曝一句 "Our number is not empirical. Schema matching is guaranteed, thus we can confidently
    add 0% into the plots."；
  - 数字：端到端 70ms–500ms、"40x-200x faster"、workflow evals "193.6x faster"、"444.6x cheaper"、
    输入 $0.042/MTok、输出 "FREE (too cheap to meter)"；
  - 机制描述只到 "Generates all outputs in a single query"（Parallel 对 LLM 的 Sequential），
    未说明架构；提到 cardinality 上限 255；
  - 设有 "We love skeptics, and are skeptics ourselves." 一节，按可验证程度给自身主张分级，
    并自认无法证明定价未被补贴："We can't prove it isn't subsidized"；
  - 可第三方复现的面：evals 面板 <https://evals.typesafe.ai/>、开源 adapter
    <https://github.com/typesafe-ai/system-one-adapter-python>（可在竞品模型上重跑同一对比）；
    不可复现：训练方法、内部 workflow evals；
  - 对照模型：GPT-5.6 Terra、GPT-6 Astra、Fable 5.1、DeepSeek；任务含工作流自动化、
    结构化决策、Doom、Wikipedia 导航。
- 支持范围：支持「厂商宣称了什么」与「厂商承认哪些主张非实证」；不支持任何性能数字的独立成立。
- 后续核对：发布稿会被编辑（发布当日标题已改过一次，见 E3），再次引用时重新抓取并比对措辞。

## E2 官方文档

- 消费对象：`research.md` 的「能力边界由设计固定」与「经 OpenRouter 已可直接调用」两条结论。
- 来源与精确修订：<https://docs.typesafe.ai/models> @ 2026-09-19 抓取；所述版本 `jev-1.13.0`，
  别名 `jev-latest`、`jev-preview` 均指向它。
- 来源立场：厂商自述（产品文档，比发布稿更接近契约，但仍非承诺性 SLA）。
- 取得方式：WebFetch，按版本、上下文、限额、模态、语言、明示限制提取。
- 环境与前提：文档自述速率限制"动态调整"，可不经通知变更。
- 实际观察：
  - 上下文 "64k tokens per request; 32k tokens for `state` plus the longest question"；
  - 定价 "$42 / $0.042"（每 Btok/Mtok），"Charged per input token. Output tokens are free."；
  - 速率 "250,000 tokens per second / 1,200 requests per minute"；
  - 模态 "Text only. String, JSON object, or array of text values. No image, audio, or video input."；
  - 语言："English is the primary training language and where accuracy is currently best"，
    含 CJK 的其他语言 "handled but not equally well"；
  - 不做按客户微调，定制只经请求参数。
- 支持范围：支持上述限额与模态边界；**未覆盖**每请求最大问题数、每个 choice 的选项上限、
  评分档位范围、cardinality，以及是否存在 unknown/needs_review 语义——这些在本页查不到。
- 后续核对：E1 称 cardinality 上限 255，二手汇总称 gateway 限制为每请求 32 问、每 choice 64 选项，
  本页均未确认，三者是否矛盾待查 API reference。

## E3 HN 发布讨论

- 消费对象：`research.md` 的「不保证事实正确」「速度缺同类基线」「架构未公开」三条结论，
  厂商措辞退让的记录，以及第二轮新增的「官方公开到机制轮廓为止」「训练只给了目标」两条。
- 来源与精确修订：<https://news.ycombinator.com/item?id=49717558>，同日两次抓取——
  第一次约 256 条评论，第二次 498 条。两次观察分列于下，**后者不覆盖前者**。
- 来源立场：一手社区讨论，含 TypeSafe 方账号回帖；发言者身份未经独立验证，按帖内标注采信。
- 取得方式：WebFetch 两次——第一次按技术质疑、官方回应、基准方法、实测报告、未答问题五项提取；
  第二次专取架构与训练相关发言，以及「人们打算拿它建什么」。
- 环境与前提：抓取为页面快照，讨论仍在进行；评论者多数未公开身份与利益关系。
- 实际观察（第一次抓取，256 条）：
  - jacobgold："Sure, it can't emit an invalid type, but it can still emit a completely wrong valid value."；
  - jacobgold 对速度对照："A generative model that can output code in a Turing-complete language can do
    anything a computer can do. Jev can only generate structured output"；
  - bigglebear 指 Doom 演示 "They've severely cooked this to make it look far more capable than it is in
    practice"，理由是喂入预结构化的游戏状态坐标而非像素感知；另指出小型微调分类器可达类似延迟；
  - WhitneyLand 记录原标题为 "Jev: New frontier model 40-400x cheaper and 20-200x faster"，
    发布不到一小时被改；
  - 官方方回应：承认 "type-safety and hallucination are intrinsically related" 但未收回措辞；
    被追问校准证据时答 "we're going to release some more info on evaluations over time"；
    架构 "close to the chest"；
  - 未获答复的问题：RLCD 与标准 RL 的差异、上下文是否随会话增长、准确率保证的文档位置、
    多模态计划、最大输入尺寸、开放权重与本地部署。
- 实际观察（第二次抓取，498 条；专取架构与训练）：
  - 官方账号 CompleteSkeptic 对 RLCD 只给目标不给方法："System One models are trained for calibrated
    decisions: their probabilities are optimized against outcomes to reflect uncertainty."；
  - 同一账号对架构："architecture is close to the chest for now, but we have talked about writing a paper"
    ——比第一次抓取多出**论文意向**，仍非承诺；
  - 同一账号称模型是 "zero-shot" 而非 "instruction-tuned"；
  - sothatsit 把 RLCD 与 RLVR 对照："RLVR generally upweights tokens along the whole thinking trace
    that led to a correct answer...System One hasn't said how RLCD works, but they do say it is
    explicitly training models to output 'calibrated' probabilities"——**明说官方未讲 RLCD 怎么做**；
  - porridgeraisin 给出一个机制直觉（**属推测，无来源**）："In RLCD...you basically massively negatively
    reward a distribution that is {yes: 0.9, no: 0.1} if the answer was no, and less negatively reward
    a {yes: 0.6, no: 0.4}."；
  - NitpickLawyer 的 constrained decoding 猜想："I thought about constrained generation as well...
    You can setup constrained gen so that only valid options...can be outputted."；
    adastra22 反向猜测 "the underlying inference algorithm is fundamentally different, hence the speed gains"
    ——两条互斥的推测并存，线程内**未收敛**；
  - zenlikethat：输入与 criteria 都可为结构化 JSON，"model is trained to understand structure"；
  - 讨论中人们**声明打算建**（非已建成）：垃圾/钓鱼检测、家谱记录匹配、家庭自动化路由、
    合同校验、agent 工作流的语义分支。
- 支持范围：支持「存在哪些公开质疑、官方在何处让步或回避」；支持「官方对 RLCD 只公布了优化目标」；
  不支持任何质疑本身的技术正确性——评论者的推断（如"构造上近似 diffusion decision model"、
  porridgeraisin 的奖励形式）属推测，**不得作为 RLCD 的实际实现引用**。
- 后续核对：线程会继续增长；官方若真的发论文，架构与训练两条结论须整体重估。

## E4 独立预注册测试

- 消费对象：`research.md` 的「置信度按问题类型差异达一个数量级」与「准确率强任务依赖」两条结论。
- 来源与精确修订：<https://primeline.cc/blog/typesafe-jev-pre-registered-test> @ 2026-09-19 抓取。
- 来源立场：独立第三方，但为单人（PrimeLine 的 Robin）执行，仅一名外部审阅者核对了算术子集。
  这是目前唯一的独立实测，其结论的份量应按单人单批数据计。
- 取得方式：WebFetch，按方法、模型、样本量、指标、失败项与作者自述局限提取。
- 环境与前提：作者称结果在看到任何答案之前预先写定，并弃置了早期不成立的发现后重建测试；
  无 prompt/prefix caching，每次调用为完整 state 计费。
- 实际观察：
  - 校准：3600 条，跨影评、新闻分类、情感量表、银行意图；置信度 ≥0.9 时约 92% 正确、覆盖 73%；
    校准误差 yes/no 0.012、pick-one 0.086、rating scale 0.254（自述"20x spread"）；
    不同问题类型**未在同一批样本上测量**；
  - Choice 的 confidence "is not a separately trained quantity"，是 top choice 对随机猜测的重标定；
  - 任务一（提交信息分类，800 条）：Jev 65.8%、Opus 5 63.5%、GPT-5.6 59.5%、Haiku 54.6%；
  - 任务二（知识库分类，450 条）：Haiku 97.8%、GPT-5.6 92.7%、Jev 90.7%、Opus 5 86.9%；
  - 六对两两排序中五对翻转；解析失败 Jev 0/800、Opus 5 1/800、Haiku 2/800、GPT-5.6 0/800；
  - 12 项失败模式测试：4 项确认、8 项证伪；复合评分模式对知识库分类错误的回收率 43.4%；
  - 作者自述污染：两个语料均出自单人仓库，56.5% 的提交带 `Co-Authored-By: Claude`，
    知识库条目由 Claude 会话写成；并明言 "Treat the flip as a demonstration that task shape matters,
    not as a benchmark result you could reproduce."
- 支持范围：支持「在这两个特定任务与四个公开数据集上观察到的数值与排序翻转」；
  不支持推广到其他任务、其他语料或本项目场景；对 Claude 系模型的比较受语料污染影响。
- 后续核对：若出现第二份独立测试，与本条并列记录，不用新的覆盖旧的。

## E5 OpenRouter 可得性

- 消费对象：`research.md` 的「经 OpenRouter 已可直接调用」结论；本项目全部模型请求经 OpenRouter。
- 来源与精确修订：<https://openrouter.ai/typesafe> @ 2026-09-19 抓取。
  同日 <https://openrouter.ai/typesafe/jev-1.13> 返回 HTTP 404，未取得该页。
- 来源立场：第三方托管平台页面，非厂商自述也非独立评测；反映的是接入状态与计费，不反映质量。
- 取得方式：WebFetch 列表页，提取模型 slug、定价、上下文、接入状态。
- 环境与前提：平台页面数据由 OpenRouter 维护，与厂商文档可能不同步。
- 实际观察：`typesafe/jev-1.13`，$0.042/M 输入、$0/M 输出，context 标注 32K，状态为开放（非 waitlist），
  已处理 129B tokens；另有 `~typesafe/jev-latest` 重定向到 Jev 家族最新版，未标价；
  页面未提供吞吐、延迟或可用率统计。
- 支持范围：支持「2026-09-19 时可经 OpenRouter 开放调用且定价与官方一致」；
  不支持任何可用性或延迟承诺。
- 后续核对：context 标注 32K 与 E2 的 64k/32k 两档预算口径不一致，需一次实际调用确认；
  模型页 404 说明平台侧 URL 结构可能变动，再次引用前重查。

## E6 二手技术综述

- 消费对象：仅用于交叉印证，不单独支撑 `research.md` 的任何结论。
- 来源与精确修订：<https://www.latent.space/p/ainews-jev-a-system-one-model-that> @ 2026-09-19 抓取；
  另见 <https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/>
  与 <https://www.theregister.com/ai-and-ml/2026/09/16/typesafe_ai_debuts_model_for_machines_that_plays_doom/>。
- 来源立场：二手媒体与聚合分析，非一手取证，部分内容转述厂商发布稿。
- 取得方式：WebFetch 与 WebSearch 摘要；搜索结果中另有多家 SEO 内容站（DataCamp、Medium、
  explainx、kingy、ziplyne 等）的同题文章，内容高度同源于发布稿，**未采信**。
- 环境与前提：这些页面之间互相引用，同一说法出现多次不构成多个独立来源。
- 实际观察：社区侧对架构的推测为 "not a general language model"、"closer to a constrained or
  diffusion-like decision model"；多家汇总给出的「不能弃权」「不会算术」「把日期当文本」
  「state 加全部问题约 64k、state 加最长问题约 32k」等说法，仅部分能在 E2 中找到对应。
- 支持范围：只支持「存在这些流传说法」；**不支持**其中任何一条作为事实——需回到 E1/E2/E3 确认。
- 后续核对：其中「不能弃权」与每请求问题数/选项数上限是当前最值得回一手确认的两项。

## E7 官方概念与机制文档

- 消费对象：`research.md` 的「官方把机制讲到轮廓为止」「训练只公布了优化目标」两条新结论，
  以及「能力边界由设计固定」中弃权语义一项的一手确认。
- 来源与精确修订：以 <https://docs.typesafe.ai/llms.txt> 的完整导航为底，逐页抓取
  <https://docs.typesafe.ai/concepts/system-one>、<https://docs.typesafe.ai/introduction/machine-learning-primer>、
  <https://docs.typesafe.ai/concepts/state.md>、<https://docs.typesafe.ai/primitives.md>、
  <https://docs.typesafe.ai/confidence.md>、<https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md>、
  <https://docs.typesafe.ai/api.md>，均 @ 2026-09-19 抓取，所述版本 `jev-1.13.0`。
- 来源立场：厂商自述。与 E1 发布稿不同，这几页面向使用者而非读者，机制描述服务于"怎么用"，
  不服务于"怎么实现"——这正是它给得出接口语义、给不出架构的原因。
- 取得方式：WebFetch 逐页全文，按机制、训练、上下文、弃权语义、限额五项提取；**一手原文，非搜索摘要**。
- 环境与前提：产品文档可随版本静默更新，本条记录的是 2026-09-19 的页面状态。
- 实际观察（机制面）：
  - 定位："System One models are a class of AI models built to make fast, structured decisions that
    software can use directly."；明示不做什么："do not write replies, produce code, or generate
    explanations of their reasoning."；
  - state 与问题的关系："Each request evaluates one state against one or more questions. All questions
    see the same state and are evaluated independently."；`primitives.md` 补一句
    "Every question in a request sees the same state, is evaluated independently, and returns a typed
    answer under the ID you chose."——即**同请求内问题之间互不可见**，一个问题的答案不会成为另一个的上下文；
  - state 形态："State must be a string, JSON object, or array of text values."；
    文档未说明跨请求是否保持状态，按每请求独立评估的措辞推断为无状态（**推断，非页面陈述**）；
  - 三原语：Choice 返回 `choice` / `probabilities` / `confidence`，概率分布**被约束在给定选项集内**，
    不会产出集合外的值；Score 需要有序 criteria，答案可落在两档之间，返回 `score` / `legend` /
    `probabilities` / `confidence`；Noul 返回单个 0–1 概率，"Near 1 is a strong yes, near 0 a strong no,
    near 0.5 uncertain."，**无独立 confidence 字段**；
  - confidence 的来历（一手确认）："'confidence' is a statistic computed from the probability
    distribution the answer already gives you."，且 "TypeSafe computes it for you and returns it on
    every Choice and Score answer"——**不是独立训练出来的量**，与 [E4](#e4-独立预注册测试) 的独立观察一致；
  - 阈值指导："A confidence threshold is not one number. Different actions within the same system
    should be gated at different levels depending on the consequences of getting it wrong."，
    并要求 "Start with conservative thresholds, test with your own data, and adjust as you observe results."；
  - API 形状：`POST https://api.typesafe.ai/v1/systemone`，请求为 `state` + `model` + `questions`（具名映射），
    响应为 `answers`（按问题 ID 回填）+ `usage`；错误码 401/422/429/529。
- 实际观察（训练面）：
  - RLCD 全称与目标："Reinforcement learning for calibrated decisions"，训练模型
    "return decisions and calibrated probabilities instead of generated text"；
  - 校准的定义："Higher probability should correspond to a greater chance that the answer is correct."，
    并举例 0.2 的预测约 20% 发生、0.8 约 80%；
  - 选择该目标的理由："large-scale automation will be dominated by AI-to-AI and AI-to-software
    interactions, so the machine interface matters more than the chat interface."；
  - 与既有方法的对照（厂商给的）：RLHF 优化人类偏好，导致 "mode dropping"；RLVR 产出的推理模型
    "strong at tasks such as mathematics, but slower and more expensive"；
  - `concepts/system-one` 关于训练只有一句："System One models are trained for calibrated decisions:
    their probabilities are optimized against outcomes to reflect uncertainty."
- 实际观察（弃权语义，回答上一轮的待核实项）：
  - Choice **没有内建弃权**——文档要求调用方自己造："Callers must manually add an `other` or
    `none of the above` option when the list might not cover every input."；
  - Noul 无弃权概念，0.5 即表示真实的不确定；
  - `api.md` 的请求/响应字段表中**没有**任何 unknown / needs_review / abstain 字段。
- 实际观察（限额，与 [E2](#e2-官方文档) 口径对照）：
  - `primitives.md` 称每请求问题数 "Limited only by token budget (approximately 32,000 tokens shared
    between state and questions)"——**与二手汇总所称"每请求 32 问"不是一回事**，后者仍无一手依据；
  - Choice 选项数与 Score 档位数：`primitives.md` 与 `api.md` 均称无成文上限（Score 最少 2 档），
    与 [E1](#e1-官方发布) 的 "cardinality up to 255" 并存，**三处口径仍未统一**。
- 支持范围：支持「官方文档在接口与语义层面说了什么」与「弃权语义确不存在于模型侧」；
  **不支持**任何关于架构或训练实现的推论。按 `llms.txt` 的完整导航逐项判断，可能涉及架构或训练的
  只有 `concepts/` 与 `introduction/` 两组，均已读遍——**未见**参数量、层数、注意力结构、tokenizer、
  预训练底座、训练数据来源、损失或奖励形式的任何陈述。这是**读遍未找到**，不是构造反例证实不存在。
- 后续核对：CEO 已提及"考虑写论文"（见 [E3](#e3-hn-发布讨论) 第二次抓取）；论文一旦出现，
  本条的「读遍未找到」即失效，须整体重取。

## E8 官方自述的能力不均

- 消费对象：`research.md` 的「能力边界由设计固定」条（把此前只见于二手的失败模式升为一手），
  以及「官方把机制讲到轮廓为止」条中厂商透明度的一面。
- 来源与精确修订：<https://docs.typesafe.ai/model-jaggedness/jev-1.13.md> @ 2026-09-19 抓取；
  页面按版本命名，即厂商对 `jev-1.13` 这一版的自述弱点清单。
- 来源立场：厂商自述，但内容全部对自己不利——这类自曝的证据强度高于发布稿的同类陈述，
  不过它仍是厂商挑选后公布的，**不能当作弱点的完整清单**。
- 取得方式：WebFetch 全文，按失败模式逐项提取；一手原文。
- 环境与前提：页面未给任何数字，全部为定性描述；未说明这些结论出自何种内部测试。
- 实际观察：
  - 总述："fast, calibrated, and good at common-sense judgment but it is not perfect"；
    "does the best on System One tasks"，"may struggle with tasks that require additional levels of indirection"；
  - 字面理解："answers the question you wrote, not the one you meant"，"can be quite literal in its understanding"；
  - 计数："jev-1.13 does not count reliably"（字符、词频、列表项），且 "error grows with the size of
    the thing being counted"；
  - 数值表示：hex 值、RGB 三元组表现差，不能可靠判断两个值是否接近；"struggles with tasks that
    require numeric precision"；
  - 数学："not a calculator"，"will perform better on semantic questions than mathematical ones"；
  - 日期时间："reads dates as text, not as ordered quantities"，在比较、时长计算、混合格式与相对引用上不可靠；
  - 间接性："multiple hops of reasoning costs accuracy"；
  - 长 state："Accuracy falls as the state grows with content unrelated to the decision"；
  - **结构性不变量：肯定问与否定问的概率不保证和为可预测的值**；
  - 生成："not trained to generate text"。
- 支持范围：支持「厂商自己承认哪些任务形态不可靠」；此前 [E6](#e6-二手技术综述) 中
  「不会算术」「把日期当文本」两条流传说法**由此获得一手确认**。
  不支持把这份清单当作穷尽——页面未声明完整性，也未给任何量化阈值。
- 后续核对：该页按版本命名，下一版模型应有对应新页；版本推进时先比对这一页的增删。

## E9 官方用途索引与配方清单

- 消费对象：`research.md` 的「官方把用途定义为软件内的判断点」新结论。
- 来源与精确修订：<https://docs.typesafe.ai/concepts/use-case-map.md>、
  <https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md>、
  <https://docs.typesafe.ai/demos.md>、<https://docs.typesafe.ai/agent-skill.md>，
  配方清单取自 <https://docs.typesafe.ai/llms.txt> 的导航，均 @ 2026-09-19 抓取。
- 来源立场：厂商自述，且是营销意图最强的一面——用途索引页**只讲适合、不讲不适合**（见下）。
- 取得方式：WebFetch 逐页；配方为导航清单计数，**未逐篇打开**，因此只支持"官方备了哪些配方"，
  不支持任何配方的内容成立。
- 环境与前提：官方用途页与 [E8](#e8-官方自述的能力不均) 分处两页，读其一会得到片面印象。
- 实际观察：
  - 五类定位：AI Automation Software（"run it a million times in the background without a human co-pilot"）、
    Real-time applications（"150ms...faster than human perception"）、AI Map Reduce over Big Data、
    Universal Verification（"Verify the input prompt, extractions, reasoning traces, tool calls, or
    inputs of any other AI"）、**Harness Engineering**（"model routing, semantic context retrieval,
    LLM error detection and guardrails"）；
  - 任务类型表十项：Classification、Detection、Scoring、Routing、Search、Retrieval、Ranking、
    Verification、ML Feature Extraction、Structured Data Extraction；
  - 行业纵向十九项（检索、科学发现、模型路由、LLM 护栏、语义代码 lint、特征抽取、招聘、线索生成、
    客服、保险理赔、金融犯罪、法务合规、电商、审核与信任安全、广告、游戏、风险评估、需求预测、知识图谱）；
  - 构建指导（`how-to-build`）："Keep deterministic work in code. It is reliable and cheap. Avoid agent
    `while` loops when a software workflow can express the same behavior."；模型只出现在需要
    "programmable common sense" 或解释非结构化数据之处；明确反对 agent 自选下一步的形态，
    理由是 "every loop introduces another opportunity to go off the rails"；
  - 拆题与组合："Broad questions hide several judgments behind one answer."；
    "Combine independent answers with deterministic rules or weighted sums. For learned composition,
    use the probabilities as features in a downstream classical machine-learning model."；
    "Escalate uncertain cases to a person or a more expensive reasoning model."；
  - 官方配方 25 篇，含自洽性（noul/choice 各一）、并行提问、重排序、逐行语义查找、结构恢复、
    function calling、skill 建议、知识图谱实体对齐、RAG 段落分类、引用复核、LLM 护栏、SDE cascade、
    日期抽取、层级分类、按置信度分类等；模式页另有四篇（推测性 fan-out、置信度门控路由、复合评分、意图路由）；
  - demo 页只列一个（智能家居："Evaluate user smart home requests with speculative questions and LLM
    fallback"），**与 [E1](#e1-官方发布) 里的 Doom、Wikiracing 不在同一页**，文档侧未给这两个的数字；
  - agent skill："Drop-in skill for Claude Code, Codex, and other agent environments."，
    指导 agent 去自家代码库里找"可以用判断替换脆弱代码"的位置。
- 支持范围：支持「官方主张的用途范围与推荐用法」；**不支持**其中任何一项用途的效果成立——
  该页无一个数字、无一条对照。同时明确记一条负面观察：**用途索引页通篇没有"不适合"一节**，
  不适合的场合只写在另一页（[E8](#e8-官方自述的能力不均)）。
- 后续核对：配方数量会随版本增长，引用时重新计数；若官方补出带数字的用途证据，另立条目并列。

## E10 社区黑盒架构分析

- 消费对象：`research.md` 的「架构的最强公开解读来自黑盒探测，非厂商确认」新结论。
- 来源与精确修订：<https://archerhume.com/posts/jevs-architecture-unmasked/>，作者 Archer Hume，
  发文 2026-09-17，@ 2026-09-19 抓取。
- 来源立场：独立第三方，个人博客，未披露与 TypeSafe 的关系。作者**自行把主张分成三档**
  （厂商已公布 / 实验观测 / 推断），这一做法本身提高了可核性，但结论仍出自单人一轮实验。
- 取得方式：WebFetch 全文，按主张、证据类型、分级、被排除的架构四项提取；一手原文。
  本项目**未复现其中任何一次探测**。
- 环境与前提：全部为黑盒行为实验，作者称基于 10,000+ 次 API 调用；无权重、无内部访问。
- 实际观察：
  - 总结论（作者原话）："a causal transformer (likely using sparse MoE) repurposed for decisions:
    shared-state encoding, isolated question suffixes, and direct probability readouts instead of
    text generation."；
  - 时序与计费观测：问题间 token 计费精确可加，支持"共享 state ＋ 问题后缀"模型；
    超过约 100 个问题后延迟几乎不再增长；服务端耗时随输入 token 线性、随问题数亚线性；
  - 参考卡实验：把同一信息挪到不同位置，准确率从 12/16 变 16/16——选项可访问完整上下文；
  - 假选项注入：塞进一个无关的 "weather" 选项，把 customer/unknown 的对数比从 +0.38 压到 +0.11，
    作者称在 10 个区块上复现——**选项在打分前相互作用**（listwise，而非逐项独立打分）；
  - 可见性隔离：把 secret 放在兄弟问题里得 0.00 概率，移进共享 state 得 0.90——
    与 [E7](#e7-官方概念与机制文档) 所述"问题间独立评估"相互印证；
  - tokenizer 指纹：445 次探测显示自定义分词，既不匹配公开模型也不匹配 OpenAI 的 o200k；
  - 校准：MMLU 样本上算得 ECE 0.0313（分布集中），新鲜数学题上不确定度随之上升；
  - 作者排除的三种架构：constrained text decoding（厂商明示输出路径不同）、diffusion（该计算不需要）、
    双向 encoder（丢掉因果缓存的效率）；
  - 作者自述最不确定的一项："the sparse backbone is the least certain part"，并在开头声明
    "This is clearly all quite speculative"。
- 支持范围：支持「在这些探测下观察到的外部行为」与「这些行为与哪种架构假设相容」；
  **不支持**任何一条作为 Jev 的实际架构——厂商未确认，作者亦未声称确认。
  尤其注意：它与 [E3](#e3-hn-发布讨论) 中 NitpickLawyer 的 constrained decoding 猜想**互相矛盾**，
  本轮不裁决孰是孰非，两说并存记录。
- 后续核对：若出现第二份独立的架构探测，与本条并列；厂商发论文则本条降为历史推断。

## E11 社区实际使用记录

- 消费对象：`research.md` 的「社区场景已跑出三簇」新结论。
- 来源与精确修订：<https://paddo.dev/blog/thirty-cent-judge>（2026-09-19）、
  <https://every.to/also-true-for-humans/mini-vibe-check-typesafe-s-jev-judged-everything-i-ve-written-in-0-7-seconds>
  （Mike Taylor，2026-09-15）、<https://www.langchain.com/blog/building-a-harness-with-jev>
  （Sydney Runkle 与 Hunter Lovell，2026-09-17），均 @ 2026-09-19 抓取。
- 来源立场：三份均为独立第三方的实际使用记录，但**都不是对照实验**：没有基线、没有预注册、
  没有第二人复核。LangChain 一份带商业动机（推自家集成），paddo.dev 一份作者自陈运营竞品
  Pricogni，every.to 一份为发布当日的初体验。
- 取得方式：WebFetch 逐篇全文；一手原文。本项目未复现其中任何一次运行。
- 环境与前提：三者的任务、规模与判定标准各不相同，数字之间**不可互相比较**。
- 实际观察：
  - paddo.dev（批量判定）：9,081 对低置信商品匹配候选，约 150 行实现，一个 noul 问"是否同一商品"
    加一个 choice 问"差异类型"（包装规格 / 色号 / 配方 / 副线 / 产品线）；总花费 **$0.32**、
    耗时 **13 分 22 秒**（6 并发）；结果 49% 驳回、21% 确认、30% 弃权（**弃权是作者自建的选项，
    不是模型能力**，与 [E7](#e7-官方概念与机制文档) 一致）；手工复核 50 条中 48 条判断合理；
    作者原话："The per-row cost of the validate step is what stopped me building it. At 32 cents per
    9,000 rows it should run nightly."，并自述结论暂按"仅供参考"处理，待校准验证；
  - every.to（质量筛查）：37 篇文档（27 篇自己写的、10 篇 AI 写的）× 21 个问题 = 777 次判断，
    **0.7 秒内**完成，成本约四分之一美分；作者同时写明 "whether you'd trust those results is another
    question"，上线前想要更严格的准确率核查；
  - LangChain（harness 集成）：把 Jev 接进 agent harness 的两处——**模型路由**（直查、抽取、局部改动
    走快模型，复杂任务走强模型）与**工具调用护栏**（中间件在工具执行前用 Jev 判风险并拦截，
    作者称这对标 Claude、Cursor 等编码 harness 的闭源安全机制）；性能数字**转述自厂商**
    （"up to 200x faster inference and 400x lower cost"），非自行测量；明确写下限制：
    Jev "doesn't generate text" 且 "isn't a drop-in replacement for an LLM"。
- 支持范围：支持「这三件事确实有人做出来了，以及各自付了多少钱、花了多长时间」；
  **不支持**任何准确率结论——三份里只有 paddo.dev 做了手工复核，样本 50 条，且由作者本人判定。
  也不支持把这些成本外推到别的任务：三者的 state 大小与问题数均未完整披露。
- 后续核对：这三份都产生于发布后四天内；一个月后应重查是否有人报告长期运行的结果或翻车案例。

## E12 社区用例汇总与开发者叙述

- 消费对象：仅用于勾勒社区注意力的分布，**不单独支撑任何结论**。
- 来源与精确修订：<https://github.com/Anil-matcha/awesome-jev-by-typesafe> @ 2026-09-19 抓取
  （586 星、109 fork、MIT）；<https://dev.to/mini2809/five-things-developers-are-actually-building-with-jev-and-why-it-matters-52je>
  （2026-09-18）。
- 来源立场：社区汇总与个人叙述，非取证。awesome-list 的条目由维护者收集，**未逐条核实**；
  dev.to 一篇**通篇无来源标注**，其"开发者正在建造"的说法无法回溯到具体项目。
- 取得方式：WebFetch。另尝试 <https://flaviocopes.com/jev/>（社区 deep dive）**失败，HTTP 403**，
  本轮未取得该页——取证失败一并记录。
- 环境与前提：发布后四天内的社区快照，条目多为提案与试验，少数标注为生产使用。
- 实际观察：
  - awesome-jev 收 31 个用例，分六组：工作流控制 4、检索与知识 4、安全与质量 4、数据与运营 8、
    实时与 agent 系统 2、近期工作流评测 9；另收 11 个独立实现、9 个生态集成、4 个基准/校准项目；
    维护者对高风险域（交易、家居自动化）**明确标注仅限 dry-run 或需另设安全控制**；
  - dev.to 列出的五件事（**均无来源、无代码、无可核实项目链接**）：浏览器 agent 选 DOM 元素
    （称决策从数秒降到约 300ms）、游戏 AI（Tetris / Pac-Man / Snake / 五子棋 / Doom）、
    护栏（称每次检查"a fraction of a cent"）、编码 agent 的上下文裁剪工具 `save-token-jev`、
    按区块决策的 `jev-trader`。
- 支持范围：只支持「社区当前把注意力放在哪些方向」与「有人声称建了这些东西」；
  **不支持**其中任何一个项目真实存在、真的在跑或效果成立。引用具体项目前须逐个回到其仓库核实。
- 后续核对：awesome-list 的星数与条目会快速变化，引用时重新计数；
  `flaviocopes.com/jev/` 的 403 下轮换取得方式重试。

## E13 RLCD 命名碰撞

- 消费对象：`research.md` 的「训练只公布了优化目标」条的一处检索陷阱说明。
- 来源与精确修订：<https://arxiv.org/abs/2307.12950>（RLCD: Reinforcement Learning from Contrastive
  Distillation for Language Model Alignment，2023）与其复现库
  <https://github.com/facebookresearch/RLCD>；@ 2026-09-19 经 WebSearch 定位。
- 来源立场：学术一手（论文与官方复现库），与 TypeSafe 无关。
- 取得方式：WebSearch 定位并读摘要级信息；**未通读论文全文**——本条只需确认"存在同名不同物"，
  不需要该方法的技术细节。
- 环境与前提：两个 RLCD 出自不同机构、不同年份、不同目的。
- 实际观察：学术界的 RLCD 展开为 Reinforcement Learning from **Contrastive Distillation**，
  做的是用正负提示构造偏好对、无需人类反馈的对齐方法；TypeSafe 的 RLCD 展开为
  Reinforcement Learning for **Calibrated Decisions**，目标是让概率对齐真实正确率。
  两者**只是缩写相同，方法与目的均不同**。
- 支持范围：支持「同名不同物这一事实」；不支持两者之间存在任何技术继承或借鉴——
  TypeSafe 从未提及前者，本条也不暗示它该提。
- 后续核对：若 TypeSafe 发论文，看它是否处理这一命名冲突。

一手原文（E1、E2、E3、E5、E7、E8、E9、E13）与二手转述（E6、E12）已分别标注；
[E4](#e4-独立预注册测试) 与 [E10](#e10-社区黑盒架构分析) 为独立实测，但均为单人单轮，未经复现；
[E11](#e11-社区实际使用记录) 是实际使用记录而非对照实验。
两轮均未执行任何实际 API 调用，因此所有延迟、限额与计费行为仍属未验证。
本轮两处取证失败一并留档：`flaviocopes.com/jev/` 返回 403（见 [E12](#e12-社区用例汇总与开发者叙述)），
上一轮的 `openrouter.ai/typesafe/jev-1.13` 返回 404（见 [E5](#e5-openrouter-可得性)）。
