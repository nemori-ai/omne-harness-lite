# TypeSafe Jev 发布周主张核查（`jev-1.13.0`，2026-09-19）

**取代状态：** 当前有效，未被取代

- 执行者与日期：Claude Code 会话，应设计者要求，2026-09-19 单次完成
- 调查范围：Jev 宣称的能力与其证据强度；能力边界；相对通用模型的代价；本项目经 OpenRouter 的可得性。
  不含实际 API 调用、不含与竞品的自行实测。
- 输入与方法：WebSearch 定位 + WebFetch 取原文，共六类来源（厂商博客、厂商文档、HN 发布原帖、
  独立预注册测试、OpenRouter 模型页、二手综述）。先取一手，再专门反向检索短板与质疑。
- 处置的既有结论：首次调查

## 完整报告正文

### 取证从"这个对象是否存在"开始

调查对象由设计者口头给出（"TypeSafe 团队的 Jev"）。本次会话的知识截止早于该模型发布，
因此第一步不是查它的特性，而是**先核实它是否存在、名字是否如所述**——在确认之前不写任何描述性内容。
两次检索命中官方站点、多家媒体与 HN 原帖，对象确认：TypeSafe AI，2026-09-15 发布，
首个模型 Jev，当前版本 `jev-1.13.0`。这一步值得记录：对象名由人口述、模型无先验知识时，
"先证存在"与"直接描述"的分岔就在这里，走错一步后面全是编造。

### 厂商措辞把四件事合并成了一件

发布稿的核心卖点是"类型安全、永不幻觉、快 40–200 倍、便宜两个数量级"。拆开看是四件独立的事：

1. **输出格式合法** —— 由构造保证，真的成立；
2. **输出事实正确** —— 没有任何额外保证；
3. **置信度可用于路由** —— 厂商无证据，独立测试部分支持、部分证否；
4. **更快更省** —— 数字成立，但对照组选错了。

第 1 与第 2 的合并是最有效的一次措辞操作。官方原话只说 "The model never makes type errors."
——这句严格讲没错。但同一页把"幻觉率 0%"画进对比图，而脚注写着
"Our number is not empirical. Schema matching is guaranteed, thus we can confidently add 0% into the plots."
即：图里那个 0% 是从"schema 必然匹配"推出来的，不是测出来的。读者看到的是柱状图上的 0%，
读到脚注才知道它与"事实正确率"无关。

HN 上 jacobgold 一句话把它拆开："Sure, it can't emit an invalid type, but it can still emit a
completely wrong valid value." 官方账号的回应承认 "type-safety and hallucination are intrinsically
related"，随后建议拿随机森林作比，但没有收回宣传措辞。**这是一次让步，不是更正。**

### 第 4 点的对照组选错了，这是整份调查里最关键的缺口

"比前沿 LLM 快 40–200 倍"——Jev 不生成文本，拿它与自回归文本生成比延迟，
接近同义反复。HN 上 jacobgold 的说法是："A generative model that can output code in a
Turing-complete language can do anything a computer can do. Jev can only generate structured output."
bigglebear 更直接：一个小型微调分类器也能达到类似延迟。

真正能判定 Jev 价值的对照是两个：**同一个 LLM 开 constrained decoding**（同样保证 schema 合法）、
以及**一个小型微调分类器**（同样毫秒级、同样只出结构化结果）。两个对照当前都没有人给出，
厂商没做，社区也没做。**这意味着"40–200 倍"里有多少来自模型本身、多少来自"不生成文本"这个选择，
现在无法区分。** 缺这一项，速度优势的归因是空的。

附带一处：Doom 演示被 bigglebear 指为 "severely cooked"，理由是喂给模型的是预结构化的游戏状态坐标，
不是像素级感知——若成立，那么演示里的延迟优势有一部分来自感知环节被预先做掉了。
这条未经复现，按社区指控记录，不作为事实。

另一个叙事细节值得留档：发布帖原标题是 "Jev: New frontier model 40-400x cheaper and 20-200x faster"，
**发布不到一小时被改**（WhitneyLand 记录）。"frontier model"一词借用的是通用能力的信誉，
而这是个只能做分类、打分、判定的模型。

### 校准：厂商没给证据，独立测试给了一半

厂商侧至今没有论文、没有可靠性曲线、没有 ECE 数字、没有把 RLCD 与架构效果分开的消融实验。
被追问时官方账号答 "we're going to release some more info on evaluations over time"。

填上这个缺口的是 PrimeLine 一位开发者的预注册测试（3600 条，四个公开数据集）：

- 置信度 ≥0.9 时约 **92%** 正确，覆盖 73% 样本 —— 这支持"置信度大体可用"；
- 但校准误差按问题类型分别为 yes/no **0.012**、pick-one **0.086**、rating scale **0.254**，
  最好与最差差约 20 倍 —— 这**证否**了"一个置信阈值可以横跨所有问题类型"；
- 作者另指出 Choice 的 confidence 不是独立训练出来的量，而是 top choice 对随机猜测的重标定。

一份测试同时给出正反两面，这正是独立来源的价值：厂商的说法不会自带"但在评分量表上差 20 倍"。

### 准确率：赢一项、输一项，排序会翻转

同一份测试的两个真实任务：

| 任务 | 排序 |
|---|---|
| 提交信息分类（800 条） | **Jev 65.8%** > Opus 5 63.5% > GPT-5.6 59.5% > Haiku 54.6% |
| 知识库分类（450 条） | Haiku 97.8% > GPT-5.6 92.7% > **Jev 90.7%** > Opus 5 86.9% |

六对两两排序中五对翻转。解析失败率 Jev 0/800，其余 0–2/800 —— 类型安全的实证收益在这里，
但绝对量很小（最差的 Haiku 也只有 2/800），不足以单独支撑选型。

这份测试的污染必须一并记住：两个语料都来自单人仓库，56.5% 的提交带 `Co-Authored-By: Claude`
标记、知识库条目由 Claude 会话写成——对 Claude 系模型的比较因此有利偏倚。作者自己写明
"Treat the flip as a demonstration that task shape matters, not as a benchmark result you could reproduce."
**采信它的翻转现象，不采信它的具体名次。**

### 硬边界来自文档，不来自评测

`docs.typesafe.ai/models` 给出的限制是设计固定的，不随使用方式放宽：64k/请求与 32k（state 加最长问题）
两档预算；纯文本输入，无图像音频视频；速率 250k tok/s、1200 req/min 且"动态调整"；
英语为主，含 CJK 的其他语言 "handled but not equally well"；不做按客户微调。

文档**没有**回答的：每请求最大问题数、每个 choice 的选项上限、评分档位范围、cardinality
（发布稿说 255，二手汇总说 gateway 限 64 选项/32 问题，三者对不上），以及是否有
unknown/needs_review 语义。「不能弃权」这条在多份二手汇总里出现，一手查不到，因此标为待核实——
它对"低置信时怎么办"的设计影响很大，值得优先补一手确认。

### 厂商透明度：这一面也要记

容易被批评淹没的一点：TypeSafe 自己开了 "We love skeptics, and are skeptics ourselves." 一节，
按可验证程度给自家主张分级，主动写下"幻觉率非实证"和"无法证明定价未被补贴"两条对自己不利的话，
并放出 live evals 面板（含分歧案例与完整查询）与一个开源 adapter，让第三方能在竞品模型上重跑同一套对比。
不可复现的是训练方法与内部 workflow evals。

**同等强度地说两面**：发布稿的营销措辞确实把类型安全与事实正确合并了，同一份发布稿也确实
主动标注了自己最弱的两处证据。两件事都真实，记其中一件而略去另一件都会失真。

### 本项目侧的可得性

本项目全部模型请求经 OpenRouter。`typesafe/jev-1.13` 在 OpenRouter 上为开放接入（非 waitlist），
$0.042/M 输入、$0/M 输出，与厂商定价一致，页面显示已处理 129B tokens。
注意口径差异：OpenRouter 页标 context 32K，厂商文档是 64k/32k 两档预算，需一次实际调用确认。
`https://openrouter.ai/typesafe/jev-1.13` 在本轮返回 404，模型信息取自
`https://openrouter.ai/typesafe` 列表页——取证失败本身一并记录。

## 本轮结论

收敛后的结论见 [research.md](../research.md)，共七条。本轮最值得带走的三句：

1. 保证的是 schema 合法，不是事实正确；那个 0% 是推导出来的。
2. "快 40–200 倍"缺的不是更多前沿模型对照，而是 constrained decoding 与小分类器对照；
   缺它，加速的归因无法成立。
3. 置信度可用但不能一个阈值走天下，评分量表类问题的校准误差是 yes/no 的约 20 倍。

## 本轮局限

- **未执行任何实际 API 调用**：所有延迟、限额、计费行为均属未验证，包括本项目最关心的
  OpenRouter 侧实际可用 context。
- **独立证据只有一份，且单人单批**：校准与准确率两条结论都压在同一份预注册测试上，
  它自身的语料污染（56.5% Claude 标记）对模型间比较有利偏倚。
- **未接触架构层面的任何一手材料**：无论文、无权重、无 API reference 的完整字段表；
  社区关于"constrained 或 diffusion-like"的推测未采信为事实。
- **未覆盖中文场景**：文档只有一句"handled but not equally well"，无任何数字；
  本项目若有中文决策点，这里是空白。
- **发布周效应**：全部来源产生于发布后四天内，社区判断尚未沉淀，二手文章高度同源于发布稿；
  一个月后回看，可用的独立证据大概率比现在多。
