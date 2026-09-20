# TypeSafe Jev 机制、训练与用途补全（`jev-1.13.0`，2026-09-19 第二轮）

**取代状态：** 当前有效，未被取代

- 执行者与日期：Claude Code 会话，应设计者要求，2026-09-19；与
  [发布周主张核查](2026-09-19-launch-claims-audit.md) 同日，接在其后
- 调查范围：官方对技术原理的说明、官方对训练方法的说明（官方缺失处转查社区解读与推测）、
  官方主张的用途、社区上的热门应用场景。**不含**实际 API 调用，不含自行实测，不含选型判断。
- 输入与方法：以 `docs.typesafe.ai/llms.txt` 的完整导航为底逐页 WebFetch 官方文档（七页机制文档、
  一页 jaggedness、四页用途与 demo），重抓 HN 原帖（498 条，较首轮 256 条），
  再按"官方缺什么就去社区找什么"反向检索架构与训练的第三方分析，最后按
  「真跑过 / 声称做过」两档收集社区场景。一手原文与搜索摘要分别标注。
- 处置的既有结论：两条修正——「架构与训练方法未公开」的表述分层（changelog rev 1）、
  「能力边界由设计固定」中弃权项由待核实转为一手确认（rev 2）；六条新增（rev 3–8）。
  这八条必须原样出现在 [changelog.md](../changelog.md)。

## 完整报告正文

### 起点：首轮那句「无技术细节」当时就过宽了

首轮的结论之一是「架构与训练方法未公开，权重不开放」，正文写着"官方仅称单次查询并行产出全部输出、
训练用 RLCD，无论文、无技术细节"。标题没错，那半句错了——**首轮只读了 `docs/models` 这一页限额表，
没进官方的概念与原语文档**。本轮按 `llms.txt` 把导航拉全才发现，官方文档有 60 余页，
其中概念三页、原语五页、置信一页、构建指导一页、API 一页，全部在讲机制。

这是一次自查发现的表述失准，不是新证据推翻旧判断，因此记「修正」而不是「推翻」——
判据按家族标准：能不能具体指出原结论依赖的哪个假设在当时就不成立。这里不能，
方向（架构与训练未公开）一直成立，垮掉的只是"无技术细节"这个过宽的概括。

教训值得写下来：**"厂商未公开 X"这类负面结论，取证成本在于"该读的地方有没有读遍"**，
而首轮把一页限额表当成了官方文档的全部。本轮补的第一件事就是先取完整导航，再谈有没有。

### 官方讲到哪里为止：三层，公开程度差别很大

拉全之后，"未公开"这句话应该拆成三层：

| 层 | 公开程度 | 证据 |
|---|---|---|
| 接口语义 | **完整**：state 与问题怎么组织、三原语返回什么、confidence 从哪来、阈值怎么定 | 七页官方文档 |
| 架构 | **完全保留**：CEO 两次 "close to the chest"，第二次补"考虑写论文" | 文档读遍未见；HN 官方回帖 |
| 训练方法 | **只给目标，不给方法** | `machine-learning-primer` 一页 |

接口语义这一层，官方给得相当干净。一次请求是一个 `state` 对一组具名问题，
"All questions see the same state and are evaluated independently"，并且
"one cannot become hidden context for another"——**同请求内问题之间互不可见**。
三原语的返回形状固定：Choice 给 `choice` 加全选项概率分布加 `confidence`，
且概率被约束在给定选项集内；Score 要有序档位，答案可以落在两档之间；
Noul 只给一个 0–1 概率，**没有独立的 confidence 字段**。

架构这一层，本轮的负面结论要按强度写清楚：**按 `llms.txt` 的完整导航逐项判断，
可能涉及架构或训练的只有 `concepts/` 与 `introduction/` 两组，均已读遍，未见参数量、层数、
注意力结构、tokenizer、预训练底座、训练数据来源、损失或奖励形式的任何陈述。**
这是"读遍未找到"，不是"构造反例证实不存在"。两者在升格成设计依据时份量完全不同，
所以结论里必须标出来——官方一旦发论文，这条立刻失效。

### 本轮最有用的一条机制事实：confidence 是算出来的，不是训出来的

官方 `confidence` 页有一句话值得单独拎出来：
"'confidence' is a statistic computed from the probability distribution the answer already gives you."

首轮的独立测试（[E4](../evidence.md#e4-独立预注册测试)）已经说过 Choice 的 confidence
"is not a separately trained quantity"，当时只有第三方一家之言。**本轮拿到了厂商侧的一手确认，
两边对上了。** 这是少见的情形：独立测试的机制判断被厂商文档反向印证。

它的后果比听上去大。既然 confidence 只是"分布有多集中"的一个汇总统计量，那么：

- 它**不携带任何关于"模型是否见过这类输入"的信息**。一个完全没见过的输入，模型照样可以给出
  高度集中的分布，从而给出高 confidence。把它当分布外检测用会落空。
- 它与首轮测到的"校准误差按问题类型差 20 倍"是自洽的——同一个导出公式套在三种形状的分布上，
  本来就没有理由在三处都同样准。

官方对阈值的说法也与此一致，只给方法不给数字：
"A confidence threshold is not one number. Different actions within the same system should be gated at
different levels depending on the consequences of getting it wrong."
以及 "Start with conservative thresholds, test with your own data, and adjust as you observe results."
——厂商没有承诺任何一个可以照抄的阈值，这一点在读发布稿时是看不出来的。

### 训练：官方给了目标，方法一侧完全空白

RLCD 展开为 Reinforcement Learning for Calibrated Decisions。官方说明的全部内容是**目标**：

- 概率 "optimized against outcomes to reflect uncertainty"；
- "Higher probability should correspond to a greater chance that the answer is correct."，
  0.2 的预测约 20% 发生，0.8 约 80%，1.0 则 100%；
- 选这条路的理由是路线判断，不是技术细节："large-scale automation will be dominated by AI-to-AI and
  AI-to-software interactions, so the machine interface matters more than the chat interface."；
- 对照：RLHF 优化人类偏好导致 "mode dropping"；RLVR 产出的推理模型 "strong at tasks such as
  mathematics, but slower and more expensive"。

方法一侧：预训练底座、数据来源、损失与奖励形式、模型规模、是否蒸馏，**一条都没有**。
发布稿的 FAQ 甚至专门列了 "Where does our training data come from?" 这一问，正文没有答案。
官方另给的一点信息是模型属 "zero-shot" 而非 "instruction-tuned"。

社区补得上吗？**补不上。** HN 上 sothatsit 把话说得很清楚：
"System One hasn't said how RLCD works, but they do say it is explicitly training models to output
'calibrated' probabilities"。同一线程里 porridgeraisin 给了一个机制直觉——
对"答案为否却给出 {yes: 0.9, no: 0.1}"的分布重罚、对 {yes: 0.6, no: 0.4} 轻罚——
读起来很顺，但**没有任何来源**，它是评论者按名字反推的。这种东西一旦被当成"RLCD 的实现方式"引用，
后面所有基于它的推理都建在沙上，所以证据记录里对它加了"不得作为 RLCD 的实际实现引用"。

由此得到一条对下游有用的否定结论：**"因为用了 RLCD 所以置信度可信"这条推理链，每一环都没有证据。**
厂商没有消融实验把训练目标与架构的贡献分开，社区也没有。目前能支撑置信度的只有外部实测，
而外部实测与训练方法叫什么名字无关。

### 一个检索陷阱：RLCD 是重名的

学术界早有一个 RLCD——Reinforcement Learning from **Contrastive Distillation**
（arXiv 2307.12950，2023，Meta 有官方复现库），做的是用正负提示构造偏好对、无需人类反馈的对齐方法。
与 TypeSafe 的 Reinforcement Learning for **Calibrated Decisions** 只是缩写相同，机构、年份、
方法、目的全不一样。

这条本身不影响任何结论，但值得留档：后来的人检索 "RLCD" 会同时撞上两者，
若不加分辨就会把一篇 2023 年的对齐论文当成 Jev 的训练方法读——那是一条看起来有出处、实则完全错位的引用。

### 社区把架构推到了哪一步

官方不讲，社区里推得最远的是 Archer Hume 在 2026-09-17 发的一篇黑盒分析，
基于**一万次以上 API 调用**。他的结论是：

> "a causal transformer (likely using sparse MoE) repurposed for decisions: shared-state encoding,
> isolated question suffixes, and direct probability readouts instead of text generation."

值得采信其方法的地方在于，他自己把每条主张分成四档（厂商已公布 / 实验观测 / 推断 / 推测），
并明说 "the sparse backbone is the least certain part" 与 "This is clearly all quite speculative"。
支撑他的观测是可复跑的：

- **共享 state ＋ 问题后缀**：问题之间的 token 计费精确可加；超过约 100 个问题后延迟几乎不再增长；
  服务端耗时随输入 token 线性、随问题数亚线性；
- **选项在打分前相互作用**（listwise，而非逐项独立打分）：往选项集里塞一个无关的 "weather"，
  能把 customer/unknown 的对数比从 +0.38 压到 +0.11，且在 10 个区块上复现；
- **问题间确实隔离**：secret 放在兄弟问题里得 0.00 概率，移进共享 state 得 0.90
  ——这与官方文档所述完全一致，是一次外部行为对官方语义的独立印证；
- **自定义分词**：445 次探测显示既不匹配公开模型也不匹配 o200k；
- **校准**：MMLU 样本上算得 ECE 0.0313。

他还排除了三种架构：constrained text decoding（厂商明示输出路径不同）、diffusion（该计算不需要）、
双向 encoder（丢掉因果缓存的效率）。

**但本轮必须同时记下一个冲突**：HN 上 NitpickLawyer 恰恰认为就是 constrained generation
——"You can setup constrained gen so that only valid options...can be outputted."
一边排除，一边主张，两说直接对立。按家族纪律，这种冲突是并行取证里最值钱的产出，
记进证据、不挑顺眼的采用。本包**不裁决**，只标出裁决它需要什么：复跑假选项注入与 token 计费两项探测。

顺带修掉首轮的一处措辞欠账：首轮把社区推测记成"constrained 或 diffusion-like decision model"，
读起来像是一种推测。实际上它们是**两种互斥的推测**，而且现在其中一种有了具体的反证尝试。

### 官方说它能做什么：成体系，但"不适合"藏在另一页

官方用途索引给五类定位，其中一类对本仓库这类系统直接相关，原话照录：

1. AI Automation Software——"run it a million times in the background without a human co-pilot"；
2. Real-time applications——自称 150ms，"faster than human perception"；
3. AI Map Reduce over Big Data；
4. Universal Verification——"Verify the input prompt, extractions, reasoning traces, tool calls,
   or inputs of any other AI"；
5. **Harness Engineering**——"model routing, semantic context retrieval, LLM error detection and guardrails"。

再往下是十项任务类型（分类、检测、打分、路由、搜索、检索、排序、验证、ML 特征抽取、结构化抽取）、
十九个行业纵向、25 篇配方与 4 篇模式，另有一个面向 Claude Code 与 Codex 的 agent skill，
指导 agent 主动去代码库里找"可以用判断替换脆弱代码"的位置。

官方的构建主张本身是清楚的，而且反直觉的一点是它**反对 agent 形态**：

> "Keep deterministic work in code. It is reliable and cheap. Avoid agent `while` loops when a software
> workflow can express the same behavior."

理由是 "every loop introduces another opportunity to go off the rails"，模型只出现在需要
"programmable common sense" 或解释非结构化数据的地方。配套方法是拆题（"Broad questions hide several
judgments behind one answer."）、一次问很多独立问题、用确定性规则或加权和组合、
把概率当特征喂给下游经典 ML 模型、不确定的交给人或更贵的模型。

**这一页要配一条负面观察才算取证完整：用途索引页通篇没有"不适合"一节。** 不适用的场合写在
另一页（jaggedness）。两页分处文档的不同分支，只读其一得到的印象是片面的——
这不是隐藏，但确实是一种排版上的偏向。

同时要如实记另一面：官方**确实**单列了那一页 jaggedness，而且写得具体。
和首轮观察到的"厂商主动标注自己最弱的两处证据"是同一种作风。
两件事都真实：营销页只讲适合，文档里又备了一页自曝弱点；只记其中一件都会失真。

### 厂商自曝的失败模式里，有一条会让常见兜底设计失效

jaggedness 页逐条自述这一版不可靠的地方：不可靠计数且"error grows with the size of the thing being
counted"；"not a calculator"；"reads dates as text, not as ordered quantities"；hex 与 RGB 等数值表示差、
不能判断两值是否接近；"multiple hops of reasoning costs accuracy"；长 state 掺入无关内容会掉准确率；
措辞上"answers the question you wrote, not the one you meant"；"not trained to generate text"。

这些大体是"语义模型不擅长数量与精确计算"的常识，但其中有一条是**结构性**的，
不属于常识范畴：**肯定问与其否定问的概率不保证和为可预测的值。**

这一条的后果具体而现实。一种很自然的兜底设计是：同一件事正着问一遍、反着问一遍，
两次概率若不互补就判为不可信、转人工。厂商这句话等于预先说明**这个校验不成立**——
不守恒本身就是常态，据此告警只会得到一堆假阳性。附带地，这也削弱了"自洽性检查"这类配方的一部分预期，
尽管官方自己也备了两篇自洽性配方（用的是重复采样，不是互补提问）。

另外一个附带收获：首轮把"不会算术""把日期当文本"列为**二手流传说法、未经一手确认**，
本轮这一页把它们升为一手。二手汇总这次说对了——但当时按未确认处理仍然是对的做法，
因为同一批二手汇总里的"每请求 32 问、每 choice 64 选项"至今仍无一手依据。

### 社区场景：四档证据，强度差得很远

"社区热门应用场景"这个问题最容易写成一张热闹的清单。本轮把它按证据强度分四档处理，
差别大到必须分开写：

| 档 | 内容 | 能支撑什么 |
|---|---|---|
| 有数字、有复核 | paddo.dev 的商品匹配队列 | 成本与耗时可引用；准确率只有 50 条自评 |
| 有数字、无复核 | every.to 的 777 次判断 | 只支撑速度与成本的量级 |
| 有实现、无测量 | LangChain 的 harness 集成 | 支撑"能这么接"，不支撑效果 |
| 只有声称 | awesome-list 条目、无来源的开发者文章、HN 上的"打算做" | 只支撑"注意力在这些方向" |

第一档值得展开，因为它是本轮唯一一份带人工复核的生产记录：9,081 对低置信商品匹配候选，
约 150 行代码，一个 noul 问"是否同一商品"加一个 choice 问差异类型，
**总花费 $0.32、耗时 13 分 22 秒**（6 并发），结果 49% 驳回、21% 确认、30% 落在弃权选项，
手工复核 50 条中 48 条判断合理。作者那句话点出了这类场景真正的变量：

> "The per-row cost of the validate step is what stopped me building it.
> At 32 cents per 9,000 rows it should run nightly."

**注意那 30% 的"弃权"是作者自己加的选项，不是模型能力**——这恰好和本轮确认的弃权语义对上：
模型不提供这一档，要用就得自己造。同一位作者还写明结论暂按"仅供参考"处理，等校准验证。
本轮三份记录里唯一做了复核的那份，反而是最保守的那份。

LangChain 那份的位置要摆正：它是官方博客，**带商业动机**，性能数字整段转述厂商，非自行测量。
但它做的事情本身有信息量——把 Jev 接在模型路由与工具调用护栏两处，
后者是在工具执行前判风险并拦截，作者称这对标 Claude、Cursor 等编码 harness 的闭源安全机制。
它也如实写了限制："doesn't generate text"、"isn't a drop-in replacement for an LLM"。

第四档要特别小心。那篇 dev.to 文章标题叫《开发者真正在用 Jev 建的五件事》，读起来像是实地报道，
实际上**通篇无来源、无代码、无可核实的项目链接**，里面的"约 300ms""每次检查不到一美分"
无从回溯。awesome-list 好一些（586 星，条目分组清楚，维护者还对交易与家居自动化明确标注
"仅限 dry-run 或需另设安全控制"），但条目同样未经逐条核实。

把四档合起来看，社区注意力集中在三个方向：**给 LLM 或 agent 当护栏与路由器**、
**把每行成本压到让全量判定变得可行**、**塞进实时循环做逐帧或逐块决策**。
第三簇目前几乎全是演示与压测——Doom、游戏 bot、按区块决策的交易机器人，没有一个带独立测量。

还有一条不该漏的代价：**"全量跑"会把原先靠抽样掩盖的错误全部暴露到下游。**
成本从不可行变可行，不等于结果从不可用变可用——这也是唯一做了复核的那位作者只敢把结论标为
"仅供参考"的原因。

### 两处取证失败与首轮遗留项的处置

失败一并留档，不装作没发生：

- `flaviocopes.com/jev/`（社区 deep dive）返回 **HTTP 403**，本轮未取得；
- 首轮的 `openrouter.ai/typesafe/jev-1.13` **404** 仍未复查（本轮未重试，不属本轮范围）。

首轮「未知与下一项证据」表里的五项，本轮处置如下：

| 首轮未知 | 本轮处置 |
|---|---|
| 与 constrained decoding / 小分类器的同任务对照空白 | **未解决**，仍是最关键缺口 |
| 校准只有单人单批数据 | **未解决**；新增的 ECE 0.0313 同样是单人单批 |
| 中文/CJK 只有一句定性 | **未解决**，本轮未找到任何中文实测 |
| 「不能弃权」无一手确认 | **已解决**：确认成立，且补上"要由调用方自建"的机制 |
| OpenRouter 32K 与官方 64k/32k 口径不一致 | **未解决**，需实际调用 |

## 本轮结论

1. **"未公开技术细节"应拆成三层**：接口语义有完整文档，架构完全保留，训练只给了优化目标。
   首轮把三层压成一句，是因为只读了一页限额表。
2. **`confidence` 是从概率分布算出的统计量，厂商一手确认。** 它只反映分布集中程度，
   不携带"模型是否见过这类输入"的信息；与首轮测到的按问题类型差 20 倍的校准误差自洽。
3. **RLCD 只有目标，没有方法。** 官方未公布底座、数据、损失与规模；社区给出的奖励形式是无来源推想。
   因此"因为用了 RLCD 所以置信度可信"这条推理链没有任何一环有证据支撑。
   另注意学术界有同名不同物的 RLCD（arXiv 2307.12950）。
4. **架构的最强公开解读是一次单人黑盒探测**，其观测具体且自带分级，但与 HN 上的
   constrained decoding 猜想直接冲突，本包不裁决；裁决它需要复跑假选项注入与 token 计费两项探测。
5. **官方用途成体系且明确反对 agent 自选下一步的形态**，但用途索引页不写不适合，
   不适合写在按版本命名的 jaggedness 页。
6. **厂商自曝的失败模式里，"互补问题概率不守恒"是结构性的**，它让"正反两问互校"这类兜底设计失效。
7. **社区场景要按四档证据分开读**：真跑过且有复核的只有一份（$0.32 判 9,081 对，50 条自评 48 条合理），
   其余依次是有数字无复核、有实现无测量、纯声称。注意力集中在护栏与路由、全量判定的成本、
   实时循环决策三簇，第三簇几乎全是演示。

## 本轮局限

- **仍未执行任何实际 API 调用。** 接口语义全部取自文档，"文档说的不等于实现做的"这一条在本轮无法检验；
  三处限额口径（token 预算 / 32 问 / cardinality 255）的矛盾也只能记录，不能解决。
- **未复现任何一次社区探测。** archerhume 的 10,000+ 次调用、445 次分词探测、ECE 0.0313，
  全部按其自述采信；它与官方文档一致的那几项（问题隔离）可算交叉印证，其余不能。
- **未逐个打开社区项目仓库。** awesome-list 的 31 个用例、11 个独立实现按列表计数，
  "其余是声称"这一归类的宽严因此有误差——其中可能有真实运行的项目被归进了声称档。
- **未逐篇打开官方 25 篇配方。** 只支撑"官方备了哪些配方"，不支撑任何一篇的内容成立。
- **中文场景仍然全空白。** 本轮专门检索过，未找到任何中文实测；官方仍只有
  "handled but not equally well" 一句。这是**已检索未发现**，不是不存在。
- **发布周效应未消除。** 全部社区证据产生于发布后四天内，没有任何一份跑满一周以上的记录；
  长期稳定性、限额调整、价格变化、模型静默更新的影响，本轮一概没有信息。
- **两处取证失败**：`flaviocopes.com/jev/` 403；首轮的 OpenRouter 模型页 404 未重试。
