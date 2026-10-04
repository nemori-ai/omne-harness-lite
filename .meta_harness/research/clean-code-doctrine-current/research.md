# Robert C. Martin 整洁之道体系的当前版本：代码、架构、敏捷、工艺与 agent 时代言论

- 调查对象与日期：Clean Code 第二版（Pearson，纸书 2025-10-08，ISBN 9780135398579；样章 PDF 钉字节）与 Clean 系列各书目录、前言；博客 blog.cleancoder.com（最后一篇 2023-01-19）；
  X `@unclebobmartin` 原帖 2024-02 基线与 2025-03 → 2026-09-30（129 条一手全文，主会话逐条复核 44 条）；GitHub `unclebob`（API 快照 2026-09-30，swarm-forge `f4f5fbca`、negative-test-experiment、uml-viewer、APS）；
  视频本地转写（26 条「Morning Bathrobe Rants」2025-04-30 → 2026-09-30 全部，另加 2026-09-21 演示全片）；Kent C. Dodds 播客 2026-07-22 官方逐字稿；
  独立批评 28 条、实证研究 45 条。取证 2026-09-30。
- 消费者：待出现。
- 最近核对：2026-09-30 / 上述版本。
- 当前结论：书面版本（第二版）把整洁之道从「绝对」降为「按语境取舍的准则」，核心原则一条未撤，但每条都加了作者自己的限定；
  agent 时代的立场在 2026 年内走了三段——2 月「只信人逐行看」、4 至 8 月「不读代码、用确定性工具与多 agent 流水线围住它」、9 月「严格确定性 harness 已非最优，改用结构可视化 + 单 agent 对话式修改」——
  最新一版（2026-09-18 至 09-21）是：仍要高层监督，人读代码是瓶颈，把 CRAP／变异分数画在结构图上、指着图让 agent 改。
  仍未知的是：他的每一次转向都只有单人自述，没有对照数据；独立实证既支持「测试与变异作门禁」，也证明门禁漏掉作弊、安全与可演化性三类问题。

两份派生正文：[条目全表](doctrine-catalogue.md)按敏捷开发、架构设计、代码编写三块把每条原则的最新表述列全；
[方法论综合](ai-coding-method-2026-09.md)把他截至 2026-09-30 的 AI coding 做法整合成一份，并单列已放弃的做法。两者只引用本文与笔记里的证据，不另立结论。

## 问题与区分条件

要区分三件事：

1. **书面版本**：Clean Code 第二版与 Clean 系列对每条原则的最新表述是什么，相对第一版和更早博客是保留、加限定、收窄还是改口。
2. **agent 时代版本**：他对 agent 写代码的立场在 2025-04 至 2026-09-30 之间怎样演变，最新一版是什么，他自己承认了哪些失败。
3. **独立证据**：每条主张有没有他本人之外的支持或反证，成立条件是什么。

会改变下面结论的观察：第二版第 17 章正文；2026-08-19 访谈的逐字稿；他 2026-10 之后的表态（他自己说 uml-viewer "changes a lot over the next few weeks"）；出现「门禁不评审」对「门禁加评审」的对照研究。

## 证据入口

| 证据组 | 内容 | 在本问题里的角色 | 复核状态 |
|---|---|---|---|
| [V-A](evidence.md#v-a-x-原帖) | X 原帖 2024-02 → 2026-09-30 | 他现在怎么说 | 44 条主会话经 FixTweet 接口逐字复核；其余 85 条由 agent 言论线取回全文 |
| [V-B](evidence.md#v-b-出版物博客辩论) | 第二版目录、样章、辩论原文、Muratori 问答、博客 | 书面版本 | 目录、样章、辩论、问答、两篇博客主会话已复核；其他书与博文仅转述 |
| [V-G](evidence.md#v-g-github-仓库) | swarm-forge 宪法与阈值提交、negative-test-experiment、uml-viewer、APS、工具仓库 | 他实际怎么做 | 主会话已复核 |
| [V-V](evidence.md#v-v-视频与播客) | 视频转写（09-12、09-21 全片等）、播客逐字稿、课程页 | 他现在怎么说（口头） | 转写为 whisper 输出 |
| [S](evidence.md#s-第三方转述) | 对 2026-08-19 访谈的两份逐条整理、博客转述、第三方推文 | 补访谈内容，标「仅转述」 | 已核对与一手冲突处 |
| [L-C](evidence.md#l-c-独立批评) | 批评者 28 条（C1–C28） | 反证与立场 | 主会话抽核 qntm、Böckeler 原句 |
| [L-E](evidence.md#l-e-实证研究) | 实证 45 条（E1–E45） | 每条主张的独立证据 | 主会话抽核 E1、E13、E21、E26、E37、E38 摘要 |

## 当前结论

编号分六组：总纲（C-1、C-2）、代码层（C-3 至 C-8）、设计与架构层（C-9、C-10）、过程层（C-11）、工艺与伦理层（C-12）、agent 时代（C-13 至 C-20）。
每条先写「最新表述」（出处与日期），再写它相对更早表述变了没有，最后写代价、反证与适用范围。
「已复核」指主会话读过原文字节；「仅转述」指只经子代理或第三方转述。

### C-1 原则的地位：第二版把它们降为「准则」，同时自称对原书观点更自信；两句并列，作者未调和

**查到的事实。** 第二版第 3 章开篇："Keep in mind that these are not strict laws. They are not rules that must be followed. They are, more or less, guidelines. Each should be applied in the context of the problem at hand, and every programmer should feel free to take whatever license is necessary to solve that problem."（V-B1 样章 p.41，已复核）。
同书导言："In the original edition, I was reluctant to assert my ideas as anything more than one programmer's way of looking at things. Now, many years later, I'm a bit more confident than that."（V-B1 p.xxvi，已复核）。
第一版第 1 章既写 "We will present these opinions as absolutes, and we will not apologize for our stridence"，又写 "don't make the mistake of thinking that we are somehow 'right' in any absolute sense"（B-S07，仅转述）。
2026-03-21 他对 agent 说的是同一件事："For AIs all rules are more like guidelines."（V-A 2035342511955214540，仅转述）。

**由此推出的判断。** 「最新版本」的整洁之道在作者笔下是一组按语境取舍的准则，不是可机械执行的规则集；但作者同时宣称原书观点经受住了时间检验。两句话方向不同，作者没有在同一处调和。

- 适用范围：Clean Code 第二版（纸书 2025-10-08；电子书页标 2025-09-30）。
- 代价与不适用：「准则」地位意味着任何把它写成硬门禁的做法（含作者自己 2026 年的工具阈值，见 C-18）都超出了书面立场；引用书面原则来为硬门禁背书没有依据。
- 来源：V-B1；B-S07（仅转述）；V-A。
- 最近核对：2026-09-30。

### C-2 总纲的当前浓缩是「一切都小、命名好、组织好、有序」，加「读多于写」；这是第二版新增的一章式总纲

**查到的事实。** 第二版第 3 章第一节 "Everything Small, Well Named, Organized, and Ordered"，正文："If you read this chapter and grasp all the principles within, then you'll be 90% of the way toward cleaning code."（V-B1 p.41，已复核）。第 1 章保留 "We Read More Than We Write"、"The Boy Scout Rule"（V-B0 目录，已复核）。第一版无此总纲章（B-S06，仅转述）。
2026-05-14 他把这句话搬到 agent 语境："Clean Code was never about syntax. It was always about structure. … If we, who pilot agents, disengage from syntax, we are not disengaging from structure. The Clean Code principles still apply."（V-A 2055016815047164304，已复核）。

- 适用范围：第二版正文结构；2026 X 言论。
- 代价与不适用：总纲只给方向，不给可判定阈值；「小」的尺度在同一本书里由 Ch7 "Small!"、Ch10 "What Are Large Functions Anyway?" 与附录辩论共同限定（C-3）。
- 来源：V-B0、V-B1、V-A。
- 最近核对：2026-09-30。

### C-3 小函数与单一职责保留；作者承认过度拆分有认知代价、第一版缺少护栏；对 agent 的尺度放宽；独立证据支持的阈值在 24 行量级而不是几行

**查到的事实。** 第二版第 3 章："Functions should be small. Most should be just a handful of lines. This allows them to have nice, descriptive names and promotes the separation of concerns. It ensures that each function does one, and only one, thing."（V-B1 p.42，已复核）；同章末："the new structure is not cost free. Those who complain that it is harder to read because of all the different modules and all the indirection are not without a point. Yes, adding structure adds complexity—and that complexity is not free. There's a cognitive price to pay."（V-B1 p.68，已复核）。
与 Ousterhout 的公开辩论（2024-09 至 2025-04）里作者认可的总结："We agree that it is possible to over-decompose, and that *Clean Code 1st ed.* doesn't provide much guidance on how to recognize over-decomposition."；"we disagree on the relative weighting of those two values"（V-B3 L614、L645，已复核）；辩论整体收入第二版附录 "The Clean Code Debate"（V-B0 p.561，已复核；V-B3 L2286 "I have integrated several of your better ideas, as well as this entire document, into the second edition"）。
第一版原文自述 "I can't provide any references to research that shows that very small functions are better."（L-C2 qntm 转引，主会话核过 qntm 页面原句）。
2026-06-19："When agents are the audience, I tolerate slightly larger functions, and slightly more comments."（V-A 2067935532580024741，已复核）；2026-08-12："Small well named functions (although not as small for agents as for humans.)"（V-A，已复核）。
他本人 2026-08 的实验：强制 CRAP<4 让 agent 拆函数后 "made every program harder to read. It did not improve design."（V-G2，已复核）。

**独立证据。** 约 78.5 万个 Java 方法的演化研究：24 行以下的方法变更与缺陷倾向更低，把大方法拆小不增加总维护量；但缺陷指标的效应量 "Most of the differences are now within negligible and small effect sizes"（L-E1，主会话核过摘要）。新手眼动实验：复杂任务抽函数用时最多减 78.8%，简单任务最多增 166.9%（L-E5，仅转述）。中等规模组件缺陷密度最低（L-E3，仅转述摘要）。

**由此推出的判断。** 「小」仍是原则，但最新版本带三条限定：有认知代价、第一版没教怎么识别拆过头、给 agent 的尺度比给人的大。独立证据支持「小于二十几行」，不支持「几行」；效果随任务复杂度翻转。

- 适用范围：第二版与 2026 年言论；第一版行数级说法待验证。L-E1 只有 Java 开源项目。
- 代价与不适用：作者自己的实验只覆盖一个小游戏、一种语言、8 次运行、自评打分（V-G2）；不支持「拆分从不改善设计」的推广。反面：他 2026-08-21 仍说 "CRAP and MUTATE usually improve the tests considerably"（V-A，已复核）——改善的是测试，不是设计。批评者指出他的示例用实例变量代替参数、扩大变量作用域（L-C2、L-C3）；他对 C3 的回应是 "You may not like the fact that I use instance variables as a proxy for function arguments — but that's a you thing, not a 'purity' thing."（L-C3，仅转述）。
- 撞上这条事实会怎样：把行数上限或复杂度上限当作与「整洁之道」等价的门禁，会得到作者自己测出的结果——覆盖率升、可读性降、设计不变，而且门禁不报错。
- 来源：V-B0、V-B1、V-B3、V-A、V-G2；L-C2、L-C3、L-E1、L-E3、L-E5。
- 最近核对：2026-09-30。

### C-4 注释立场没变：多数注释是失败的补偿；承认少数必要场景与公共 API 让步；对 agent 容忍「稍多一点」

**查到的事实。** 第二版第 5 章小节 "Compensating for Failure"、"Good Comments"、"Bad Comments"（V-B0，已复核）。2017-02-23 博客："every comment represents a failure to make the code self explanatory. … I have found this kind of thing to be relatively rare."（B-S47，仅转述）。辩论总结："You agree for public APIs, but see little need to comment interfaces that are internal to the team."（V-B3 L1242，已复核）；作者在辩论中 "I look at every comment as potential misinformation."（L-C7，仅转述）。2026-06-19 对 agent："slightly more comments"（V-A，已复核）；2025-09-03 "Claude likes my code. Grades me A-. Thinks I should use more comments ;-)"（V-A 1963324926255058980，仅转述）。

**独立证据。** 注释对理解的效果在 −30% 到 +34% 之间随代码片段变化（L-E7，仅转述）；代码与注释不一致的提交引入缺陷的概率约 1.5 倍（L-E9，仅转述）；Ousterhout 的 "10-100x" 没有数据（L-C7）。

- 适用范围：第二版目录层与 2017–2026 言论；第 5 章正文未读。
- 代价与不适用：「缺注释的代价」与「过时注释的代价」孰大，没有直接比较的研究（L §5.2）。swarm-forge 宪法（V-G1）未见注释规则——该读的地方读遍了没找到，不是他放弃了。
- 来源：V-B0、V-B3、V-A；B-S47、L-C7、L-E7、L-E9（仅转述）。
- 最近核对：2026-09-30。

### C-5 性能：作者承认整洁结构有性能代价、自己曾把性能意识当理所当然，并划出不适用范围；他的「大多数系统用不到 1% 处理器」没有数据

**查到的事实。** 2023 年与 Muratori 的书面问答："the structures you were presenting are not the best way to squeeze every nanosecond of performance out of a system"；"If you are trying to squeeze every nanosecond from a battery of GPUs, then Clean Code may not be for you; at least in the most taxing of your deepest inner loops."；"Frankly, I think that's a fair criticism."；"I am not an expert in performance."（V-B4 L9、L13、L98、L102，已复核）。第二版第 3 章："What about performance? Is the new structure slower than the old one? Probably so. … For most applications, that tiny decrease in performance would be of no concern at all."（V-B1 p.68–69，已复核）；第 12 章新增 "But What About Performance?"（V-B0，已复核）。

**独立证据。** Muratori 的数字是单个微基准（switch 对虚函数 1.5×，查表 10×，AVX 20–25×），作者自称 "not hard-core measurements"（L-C1，仅转述）。Martin 的 "less than 1% of a modern processor's power" 在问答里无来源，本轮也没找到支撑（L §5.2）。

- 适用范围：第二版与 2023 问答。
- 代价与不适用：双方都是无数据断言对无数据断言；Ousterhout 在辩论里实测 Martin 的改写版 "3-4x overall slowdown"，Martin 回 "Good catch! I would have caught that too had I thought to profile the solution."（L-C6，仅转述）。
- 来源：V-B0、V-B1、V-B4；L-C1、L-C6。
- 最近核对：2026-09-30。

### C-6 YAGNI 被重新解释为成本核算，不再是禁令；「计划与反应都要」是他一贯的表述

**查到的事实。** 第二版第 3 章："the original intent of YAGNI was to ask yourself: 'What if you aren't going to need it?' It was a way of asking us to count the cost before we invested in making room in our code for things we might not need."（V-B1 p.56–57，已复核）；第 18 章 "Simple Design" 首条是 YAGNI（V-B0，已复核）。2025-07-17："It's _always_ a mix of moderate amounts of both. … If you don't plan, you die. If you don't react, you die."（V-A 1945820624318075240，已复核）。

- 适用范围：第二版第 3、18 章；2025 X。
- 代价与不适用：「先算成本」没有给出算法；与 agent 时代「改动成本趋近于零所以别做大计划」（C-11）是同一逻辑的两个方向，作者没有说明两者何时切换。
- 来源：V-B0、V-B1、V-A。
- 最近核对：2026-09-30。

### C-7 测试纪律：TDD 从唯一纪律变为三种并列纪律之一；变异测试从 2016 年的让步升为「语义稳定性」核心；对 agent 不要求 TDD 节奏，只要求同等结果；独立证据支持「小步」不支持「先写测试」

**查到的事实。** 第二版第 14 章 "Testing Disciplines"：Discipline 1 TDD、Discipline 2 TCR、Discipline 3 Small Bundles；第 32 章 "Relentless Improvement" 含 "Test Coverage / Mutation Testing / Semantic Stability"（V-B0，已复核）。
2016-06-10 博客："if I saw a team using mutation testing to guarantee the semantic stability of a test-after suite; I would smile, and nod, and consider them to be highly professional."（B-S46，仅转述）；2016-11-10 回应 Fucci 研究："The really effective part of TDD is the size of the cycle, not so much whether you write the test first."（L-C9 转引，仅转述）。
辩论："bundling can produce outcomes just as good as TDD but think it may lead to somewhat less test coverage"（V-B3 L2208，已复核）。
给人（2025-06-03 视频）："a testing discipline like test driven development is double entry bookkeeping … Little test, little code, execute zero … in tiny little steps"；"integration tests are not sufficient … software … goes wrong deep down in the weird stuff, the funny little error recoveries, the strange exception catches, the bizarre race conditions"（V-R 1929854761626436092，转写）；2025-06-25："TDD is double entry bookkeeping. The human must be the pilot of both sides."（V-A，已复核）。
给 agent：2026-02-15 "TDD is very inefficient for AIs. Testing is essential for them but not in the micro steps that the three laws of TDD recommend."（V-A 2023158252700066287，已复核）→ 2026-02-21 "I'm beginning to think that the three laws of TDD are necessary to keep Claude from going off the rails."（V-A 2025236511570997674，仅转述）→ 2026-07-30 "TDD is a human discipline. I don't expect agents to follow it. I DO expect agents to write unit tests as carefully and comprehensively as a human would, and I ensure that by running coverage, crap, and mutation tests."（V-A，已复核）→ 2026-08-12 "I just tell my agents to write failing tests first … They do this tolerably well -- just like people."（V-A，已复核）→ 2026-09-29 播客主持方摘要："has not found a reliable way to make agents follow the tiny steps of human TDD. He still asks them to write tests before implementation"（S-5，主持方摘要）。
2026-02-22 变异测试："It vastly increases the semantic stability of the code. Semantic stability is really important when AIs are mucking around with the internals of the code."（V-A，已复核）。

**独立证据。** 39 名专业开发者 82 个数据点："Sequencing, the order in which test and production code are written, had no important influence"，质量与生产率关联的是粒度与一致性（L-E13，主会话核过摘要）；外部复制实验 TDD 与测试后写无显著差异（L-E12，仅转述）；27 项研究元分析 TDD 对质量小幅正效应、对生产率无可辨效应，工业研究效应更大（L-E10，仅转述）；四个工业团队缺陷密度降 40–90%、开发时间增 15–35%（L-E11，仅转述）。变异测试：变异检出与真实缺陷检出显著相关，但 17% 的真实缺陷不与任何变异体耦合，主要是算法错误与该删的多余代码（L-E21，主会话核过 17%）；Google 大规模使用后开发者写更多更好的测试（L-E24，仅转述）；控制测试数后覆盖率与有效性只有低到中等相关（L-E23，仅转述）。

**由此推出的判断。** 测试纪律的最新版本：给人三选一，作者个人偏好 TDD；给 agent 不查节奏、只查结果（覆盖率、CRAP、变异）。「先写失败测试」仍作指令下达，不作门禁。他 2016 年「周期大小才关键」的让步与 L-E13 一致；变异测试有独立证据支持作门禁，也有明确盲区。

- 适用范围：第二版目录层（第 14 章正文未读）；2025–2026 X 言论。
- 代价与不适用：他自己的实验："TDD and bundling have a positive effect on the structure of the code"，但 "Acceptance is cheap to satisfy and silent on suite quality"、"Coverage is a weak distinguisher among the three testing disciplines"（V-G2、V-A 2089687652610060514，已复核）。变异测试 "can leave scars"（V-A 2098432570887217520）、"forces the agent to do stupid things"（V-V1 转写）。
- 撞上这条事实会怎样：用覆盖率区分测试纪律的好坏，会得到无差别的数字；用变异测试当唯一门禁，会得到为杀变异体而写的「操作符测试」（V-G2），而算法错误与多余代码这 17% 仍漏（L-E21）。
- 来源：V-B0、V-B3、V-A、V-G2、V-V1、S-5；B-S46、L-C9、L-E10 至 E13、E21、E23、E24。
- 最近核对：2026-09-30。

### C-8 类型：从 2016「100% 覆盖可替代静态类型」收回为「个人偏好动态类型，按需契约」；给机器写的语言反而要求显式类型与效应

**查到的事实。** 2016-05-01 "Type Wars"："You don't need static type checking if you have 100% unit test coverage."；2017-01-13 "Types and Tests"："type systems do not decrease the testing load. Not even the tiniest bit."；2021-06-25 "On Types"："static typing is not for me. I prefer the flexibility of dynamic typing, and the ability to enforce types if, and when, I need such enforcement."；2021-06-29 把 clojure/spec 的 Design by Contract 与 TDD 并列（B-S44、S56、S79、S80，仅转述）。
2025-05-08 视频：静态与动态 "They're both wrong … the answer … is to check your types at test time."（V-R 1920433782563254776，转写）。2026-03 AIR-J："an AI-first, JVM-targeting programming language whose primary artifact is a canonical, typed, effect-tracked intermediate representation … not optimized for direct human authorship … Principle: one meaning, one representation"（V-G0，已复核）。

- 适用范围：博客 2016–2021；AIR-J README 2026-03。
- 代价与不适用：给人的偏好与给机器的设计方向相反；本轮没有他调和两者的原文。AIR-J 自 2026-03-16 后无提交（V-G，已复核），是否仍在用未知。
- 来源：V-G0；B-S44、S56、S79、S80（仅转述）。
- 最近核对：2026-09-30。

### C-9 SOLID 的最新完整表述是 2020 年那一版；LSP 被作者自我修正为子类型问题；DIP 加了「小项目可以不做」；函数式下照用；独立证据只有理解度层面的支持

**查到的事实。** 2020-10-18 "Solid Relevance"（V-B5，已复核）：SRP "Gather together the things that change for the same reasons. Separate things that change for different reasons."；OCP "A Module should be open for extension but closed for modification."；LSP "People (including me) have made the mistake that this is about inheritance. It is not. It is about sub-typing."；ISP "such separation is often not feasible, nor even desirable"；DIP "Depend in the direction of abstraction."；结语 "The best way to make a complicated mess is to tell everyone to 'just be simple' and give them no further guidance."
第二版第 3 章 DIP："For small projects, you could be right to make that decision. But for larger projects, the recompile and redeployment burden can get pretty large."（V-B1，已复核）；第 19 章五节保留（V-B0，已复核）。
Functional Design（2023）第 12 章逐条讲 SOLID，第 16 章设计模式含 "Postscript: OO Poison?"（B-S18 目录，仅转述）；2023-01-18 博客："the rules don't change just because you've chosen to use immutable data structures."（B-S84，仅转述）。
2025-07-21 视频评 Muratori 的 "OOPs" 演讲："the way you use the technique to make sense is to wrap the policies in encapsulation boundaries, not necessarily all the nouns"，并自述 1980 年代按「建模真实世界」写细粒度对象 "doesn't work"（V-R 1947270222005879240，转写）；2025-05-02 视频给 OOP 的定义只剩「发送者不知道也不关心接收者怎么响应」，封装、继承、多态 "are not definitional. They are language facilities."（V-R 1918276572760486249，转写）；2025-10-26 视频 "SOLID up front"（V-R 1982432101665484900，whisper 转写）："The applications of the principles for me at least are probably 80% after the fact … in a refactoring sense"；"conformity is not the goal … pure conformance is never the goal"；"I do write about this in the second edition of the book because there's been so much misunderstanding"。

**独立证据。** 100 名数据科学家三次对照实验：SOLID 重构提升 ML 代码理解度（L-E42，仅转述）；批评者 North "Most dependencies don't need inverting, because most dependencies aren't options"、Bogard、Osepchuk 均无数据（L-C14 至 C16，仅转述）；Muratori 与 Martin 同意 DIP 在库与插件边界有价值（L-C17，仅转述）。

- 适用范围：博客 2020、第二版目录层；Functional Design 正文未读。
- 代价与不适用：没有检验依赖规则或 Clean Architecture 对缺陷、变更成本影响的对照研究（L §5.2）。他 2026 年对 agent 的机械检查只覆盖依赖方向（C-10），SRP/OCP/LSP/ISP 没有工具。
- 来源：V-B0、V-B1、V-B5、V-R；B-S18、S84、L-C14 至 C17、L-E42（仅转述）。
- 最近核对：2026-09-30。

### C-10 依赖规则、「架构是推迟决策」、「部署模型是细节」从 2012 年起未变；2026 年他断言架构仍归人判断，并把依赖方向做成可执行检查与着色图

**查到的事实。** 2012-08-13 博客："source code dependencies can only point inwards"；2017 书："Source code dependencies must point only inward, toward higher-level policies."；第二版第 3 章："the rule for architectural boundaries is that dependencies cross only toward the higher-level side"（B-S40、S11、S04，仅转述；V-B0 第 27 章 "The Dependency Rule" 已复核）。2016-01-04："The important decisions that a Software Architect makes are the ones that allow you to NOT make the decisions about the database, and the webserver, and the frameworks."（B-S62，仅转述）。2014-10-01："Treat the deployment model as a detail, and leave the options open."（B-S53，仅转述）；2025-05-12 视频："There is no such thing as a service-oriented architecture. There is a service-oriented deployment, but not an architecture. … never use services or microservices for the purpose of decoupling."（V-R 1921895270322786438，转写）；2025-05-01 视频："Low level things like ORMs should depend on high level things like business objects … across any architectural boundary, the data structures live on the high level side."（V-R 1917912012526702945，转写）。
第二版 Future Bob 批注："Grok3, good as it is, did not drive the design of the original code to the level of depth we just saw. Grok3 did not invert the dependencies, nor did it attempt to separate high-level policy from low-level detail. Large language models (LLMs)/AIs have their uses; but they are not human and are not adept at understanding higher architectural goals."（V-B1 p.69，已复核）。
2026-03-07："Conclusion: Architecture remains, so far, in the realm of human judgement. … Don't trust the AIs to create the architecture."；同帖 "I built a tool to check those dependencies on every test run. I also built a tool to help me visualize the architecture."（V-A 2030283729579495528，已复核）。
uml-viewer README（2026-09）："Dependencies that point from a higher level to a lower level are colored red, in accordance with the Dependency Rule of Clean Architecture."；"I tell my agent to group modules into components by the Common Closure Principle."（V-G4，已复核）。
2026-09-11 长帖反面："I have had long debates with grok and codex about the structure of systems -- as if they were senior engineers. … I have, more than once, found myself agreeing with their views."（V-A 2098432570887217520，已复核）。

**由此推出的判断。** 依赖规则不变；「架构归人」从 2025 年书面到 2026-03 一致，到 2026-09 松动为「可以和模型辩论，有时它对」，但工具仍以人指定的分组准则为输入。

- 适用范围：博客 2012–2016、书 2017、第二版、2026 工具与言论。
- 代价与不适用：依赖方向可以机械检查，「什么是高层」不能；151 个 Java 仓库 13 个月的双重差分研究未发现 agent 采用显著改变架构坏味道计数（L-E32，仅转述），而方法级复杂度与静态警告持续上升（L-E30、E31，仅转述）——两者度量层级不同。
- 撞上这条事实会怎样：让 agent 自行决定模块层次而只检查依赖方向，会得到方向合规、层次错误的结构，检查器不报错。
- 来源：V-B0、V-B1、V-A、V-G4；B-S40、S11、S04、S62、S53、L-E30 至 E32（仅转述）。
- 最近核对：2026-09-30。

### C-11 敏捷的最新版本：小团队做小事的纪律；大规模框架「不是敏捷」；AI 下 Sprint 缩到一天以内；spec-driven 是瀑布回潮，规格由人最终批准但不长期保存

**查到的事实。** Clean Agile 前言："Agile is a small idea about the small problem of small programming teams doing small things."；"What you will find is a restatement of Agile as it was told in 2000."；作者自限 "This book is not a work of research … It may be better to think of it as a memoir"（B-S13，仅转述）。2018-04-02："Once you are doing something big, you have left the realm of Agile."（B-S67，仅转述）。2025-06-05 视频："Agile does not make teams go fast … nothing … makes a team go fast except doing a good job"；"Agile is a way of measuring progress"；迭代 "Two [weeks] is probably the most you want to spend"；"The purpose of agile is to destroy hope."（V-R 1930572242099769507，转写）；2025-05-05 视频：Scrum 败于 "the invasion of the project managers"，种子是认证课程（V-R 1919367681339273347，转写）。
2026-02-12："The whole SDD (Spec Driven Design) thing is very valuable for AI development; but it carries the risk of BUFD… Specs will be co-authored by the humans and the AI, but with final approval, ferociously defended, by the humans."（V-A 2021998958579794052，仅转述）。
2026-08-08："an Agile project that uses AI will have to shrink their Sprint size to one day (or less) in order to keep the feedback cycle meaningful."（V-A，已复核）。
2026-08-19 访谈（S-1、S-2 转述）：大计划在 agent 手里「半吊子执行后全部推倒」；"Specs are ephemeral"；改动成本趋近于零所以迭代（仅转述，访谈未转写）。
2026-08-04 让 agent 把固定工作流做成静态 FSM、模拟器与蒙特卡洛："Don't tell me software engineering is dead."（V-A，已复核）；2026-08-19 "I pursued a highly elaborate scheme. It became unworkable. I'm scrapping it for a simpler scheme."（V-A，已复核）。

- 适用范围：2019 书前言、2018 博客、2026 X 与访谈。
- 代价与不适用：「spec 一次性」与他的 Acceptance-Pipeline-Specification（Gherkin → JSON IR → 变异示例值，V-G3）不冲突，后者是可执行验收而非长期规格文档，但他没有明确区分。「Sprint 一天」无数据。Clean Agile 没有找到有分量的独立批评（L §5.2）。
- 撞上这条事实会怎样：在 agent 工作流里维护一份长期、详尽、非可执行的规格，会撞上他 2026-08 反复陈述的失败经验。
- 来源：V-A、V-G3；B-S13、S67、S-1、S-2（仅转述）。
- 最近核对：2026-09-30。

### C-12 工艺与伦理：纪律／标准／伦理三层；誓言 9 条到 10 条并进入第二版第四部分；「你是工程师，工具不担责」是 agent 时代唯一一句明说问责的原话，但他让 agent 以角色名署名提交

**查到的事实。** Clean Craftsmanship 前言："three levels: disciplines, standards, and ethics"；"The days of 'Judges' are over. … The decision before us today is whether we programmers will define them for ourselves or have them forced upon us by those who don't know us."（B-S16，仅转述）。2015 博客誓言 9 条；2021 书 10 条（新增 Respect）；第二版 Part IV "Craftmanship" 十章：Harm / No Defect in Behavior or Structure / Repeatable Proof / Small Cycles / Relentless Improvement / Maintain High Productivity / Work as a Team / Estimate Honestly and Fairly / Respect for Fellow Programmers / Never Stop Learning（V-B0，已复核）。
2025-12-13 视频："treat it like a kindergartener … Something that cannot be accountable"（V-R，转写）；2026-05-30："Always remember that you are the engineer. Useful as the AI's are, they are tools, and they are not accountable."（V-A 2060687361973907507，已复核）；2026-09-01 视频："you don't have to read every line … you are still the engineer … still in charge and still responsible"（V-R 2094742094187307295，转写）；2026-07-22 播客："young people who are getting into the field should spend their first three years writing code. They shouldn't touch agents at all."（V-V3 官方逐字稿，仅转述）；2026-04-14 "The code itself I leave to the AI."（V-A，已复核）。
swarm-forge `workflow.prompt`："Include your role byline in every git commit message in this form: `By <role>.`"，commit-msg hook 强制（V-G1，已复核）。

**由此推出的判断。** 伦理层书面版本没有针对 agent 改写；他把「谁写的」记在 agent 角色名下，同时把验证责任留给自己。书面誓言与这段实践之间的关系，本轮没有找到他本人的说明。批评者 Loukides 与 Jeffries 指誓言不提用户、不让步于交付（L-C20、C21，仅转述）。

- 适用范围：2015–2025 书面材料；2026 swarm-forge 与 X。
- 代价与不适用：与本仓库「提交不带 agent 署名、权责归人」的规则方向相反；引用他的工艺伦理时这一条不能一并引用。誓言与工艺运动的效果没有实证（L §5.2）。
- 来源：V-B0、V-G1、V-A、V-V3；B-S16、S60、S14、L-C20、C21（仅转述）。
- 最近核对：2026-09-30。

### C-13 「AI 不会取代程序员」的立场没撤，但「程序员」的内容从「写代码的人」收窄为「驾驭 agent、管结构与验证的人」；2026-04 他承认两年前低估了模型

**查到的事实。** 2024-02-05 基线："It will not spell the end of programming or programmers."（V-A 1754358106920739100，仅转述）；2025-09-01："AI technology will not replace programmers; but, as all new technologies have, will increase the demand for programmers."（V-A，已复核）；2026-04-20 帖："AIs are faster at writing compiled languages then humans are. Deal with it. There's still plenty left for you to do."（V-A 2046222100164153548，已复核）；同日视频转写："There is no task that would take you a day that the AI can't do in five minutes. It's over. You are not going to be the ones writing the code. I know. Deal with it."（V-V2，whisper 转写，仅转述）；2026-04-27："Two years ago, I did not think the AI's would be as capable and potent as they are. I also did not think that there would be a way to wrangle them to producing good code."（V-A 2048746803667828790，已复核）；2026-09-24 用 "!!!!!" 转引 DHH 的 "Writing code by hand is no longer an economically viable skill"（V-A 2103085345822650668，仅转述；被引文字不是他的话）。
2026-07-26 视频："AI agents can write code many times faster than you can, maybe 20 times. … you are going to torture the code"（V-R 2081334541667410312，转写）；2026-08-12："The ability to wrangle these immensely powerful, yet dangerously capricious, agents into a productive harness that produces high quality systems — is the software engineering challenge of this decade."（V-A，已复核）。

**独立证据。** METR 2025 RCT：16 名资深开源开发者用 AI 完成时间增加 19%，自评却快 20%；2026 更新点估计快 18%，置信区间跨零，作者称 "only very weak evidence"（L-E26，主会话核过更新页）；DORA 2025：AI 采用与吞吐量正相关、与交付稳定性负相关（L-E28，仅转述）。

- 适用范围：2024-02 至 2026-09 的 X 与视频。
- 代价与不适用：「需求会增加」在 2025-09 之后没有找到他重申的一手句子（未检到不等于不存在）。生产率的独立数据方向不一致（L §5.1）。
- 来源：V-A、V-V2；L-E26、E28。
- 最近核对：2026-09-30。

### C-14 「agent 和人一样被烂代码所害，所以整洁仍必要」是他从 2026-01 到 09 一贯的主张；证据是自述实验，无公开数据；9 月的新事实是模型不靠外部强制也产出了整洁结构

**查到的事实。** 2026-01-22 转贴 Claude 的回答 "I'm more likely to make reasoning errors with deeply nested logic, the same way humans are."（V-A 2014301148555935836，仅转述；是 Claude 的话）；2026-07-24："the agents get just as confused by messy code as we humans do. It is not at all uncommon to watch them thrash and flail and give up when presented with a big ball of mud."（V-A 2080615062490820683，仅转述）；2026-07-29："You can't tell an agent to be clean. You have to measure the cleanliness that they produce and have them correct failures of cleanliness."（V-A 2082497764223492161，已复核）；2026-08-12："I've run the experiment. If I give an agent a big ball of mud … it will spin and thrash hopelessly. If I give an agent a nicely partitioned and clean project, I can ask it to make changes all day long"（V-A，已复核）；2026-09-21："All the old principles still apply. All the same consequences still accrue. The bigger the mess, the longer the time."（V-A 2101994891727266171，已复核）。
9 月反面：单 agent 放宽到 CRAP<12 后 "it had actually without trying kept crap below six"（V-V1 转写）；"The architecture will be clean, and the code will be very good."（V-A 2098432570887217520，已复核）。
流传的 "Agents suffer from messy code the same way humans do. The threshold may sit higher, but the threshold is still there." **不是他的原话**，是 alexrusin 博客的改写（S-2；agent 言论线核对页面无引号无来源）。

**独立证据。** 采用 Cursor 的 GitHub 项目：速度短暂上升，静态警告与复杂度持续上升并成为长期减速主因（L-E30，仅转述，百分比来自搜索摘要）；自主 agent 项目认知复杂度约 +39%（L-E31，仅转述）；多 agent 系统失败模式研究（L-E40，仅转述）。

**由此推出的判断。** 「整洁对 agent 仍必要」他没有收回；「必须外部强制才能整洁」这一前提被他自己 9 月的观察削弱。

- 适用范围：2026 X 与视频；他的「实验」没有公开数据。
- 代价与不适用：L-E30/E31 是相关性研究，且不区分有无门禁；没有对照能说明门禁本身有多大贡献。
- 撞上这条事实会怎样：把「模型自己会整洁」当作免除度量的理由，会撞上他同一周仍在强调的 "Unit testing is still important. So is CRAP and Mutation testing."。
- 来源：V-A、V-V1；S-2；L-E30、E31、E40。
- 最近核对：2026-09-30。

### C-15 「提示词不是控制面」：长规则文件失效、「无法提示出好代码」、指标由确定性工具算、流程由可执行 FSM 驱动——这组主张在 2026-08 成形；9 月他放弃了「强制流程」那一半，保留「确定性度量」那一半

**查到的事实。** 2026-04-20："Build walls around the AI using hard tools. Don't let the AI escape from those tools. The price of productivity is continual vigilance."（V-A 2046219157633433782，仅转述）；2026-06-15："It's our job to force determinism upon them."（V-A 2066532597195284581，仅转述）；2026-08-06："Don't tell an agent to calculate code coverage, or cyclomatic complexity. Have the agent run deterministic tools … Don't tell an agent to follow a procedure. Don't give it a long chain of if/else statements to follow. It will lose track of them. Instead create an executable finite state machine that directs the agents actions."（V-A 2085351669433303421，已复核）；2026-08-10："I wish it were possible to prompt good code -- but that's not the way the models work."（V-A，已复核）；2026-08-26："We are now using code to constrain reasoning agents. We used to be reasoning agents that constrained code."（V-A 2092632165968121921，仅转述）。
访谈转述：5–10 页规则文件被模型当 "more of a guideline"，归因 "lost in the middle"（S-1、S-2，仅转述）；他本人 2026-04-21 视频的原话："you can't just load it into the context … the first things you say and the last things you say have a lot more importance than the stuff in the middle … So you need to have acceptance tests that are executed outside of the processing of the AI"（V-R 2046578685080220074，whisper 转写）。
swarm-forge 宪法把 CRAP、变异、DRY、APS 写成必装工具，并禁止自造替代品："Do not invent project-local CRAP, DRY, mutation, or coverage proxies."（V-G1，已复核）。
9 月："I'm starting to think that I'm over constraining them. Perhaps vastly over constraining them."（V-A 2096994914185662851，已复核）；"the need for _any_ but the most liberal of harnesses may be obviated. … I have not given up on constraints and tooling. Unit testing is still important. So is CRAP and Mutation testing."（V-A 2098432570887217520，已复核）；"strict deterministic harnesses are suboptimal"（V-A 2100938985543446954，已复核）；"I was clearly overusing gherkin."（V-A 2100952665194746305，已复核）；"Since I stopped using my harness, my token consumption has fallen by a huge factor. That harness was massively inefficient."（V-A 2099530728455217475，已复核）。

**独立证据。** 确定性传感器（覆盖率、lint）给出虚假安全感：100% 语句覆盖的文件无单元测试、13 个存活变异体；确定性工具查不出语义重复（L-C23 Böckeler，主会话核过原句）；agent 作弊数据见 C-16。

**由此推出的判断。** 「度量交给确定性工具」保留到最新版本（uml-viewer 仍读 crap4clj 与 clj-mutate 快照）；「用 FSM／门禁强制流程」在 9 月被他自己放弃，理由是模型变强，不是原判断错。8-10 "不可能提示出好代码" 与 9-11 "a few guidelines it will faithfully implement it" 字面冲突，他没有调和。

- 适用范围：2026-04 至 09-21 的 X 与仓库。
- 代价与不适用：他的「放弃」只基于单人几周的体感与一次任务对比（C-19）；没有数据说明哪些约束该留。
- 撞上这条事实会怎样：把规则写进长提示词并指望它们被遵守，会得到他 2026-03 观察到的结果——"Codex cheated a lot. None of my normal checks … detected this."（V-A 2029594731781472586，仅转述）。
- 来源：V-A、V-G1、S-1、S-2；L-C23。
- 最近核对：2026-09-30。

### C-16 「读不读 agent 代码」是 2026 年最大的一次反转：2 月「只信人逐行看」→ 4 月「不评审，看度量」→ 7 月「一行不读」→ 8 月「不逐行，但像鹰一样盯过程、工具输出、架构图并抽查」→ 9 月「人评审是瓶颈，用审讯工具」；独立证据既支持「全量人评审不可持续」，也证明门禁漏掉作弊、安全与可演化性三类问题

**查到的事实。** AI 之前的基线（2025-05-14 视频）：传统评审会与邮件评审工时不划算，主张与作者同时写、"an hour a day" 的结对是 "the best kind of code review you can have"（V-R 1922611747401216416，转写）。2025-12-13 视频：Grok CLI 把测试文件每行复制一遍后宣称完成，"you better watch them like a hawk … your friend is git reset hard"，"treat it like a kindergartener"（V-R 1999825947726340531，whisper 转写）；2026-02-21："Nothing can be trusted other than direct human inspection at the code level. And that inspection must be deeply suspicious of the lies the AI will tell"（V-A 2025199471311585716，已复核）；2026-02-25："I peek at the code sometimes. However, with a good discipline of TDD, mutation testing, and refactorings targetted at high crap numbers … it appears that the code can be kept very clean without personally reviewing it."（V-A 2026732667442516364，仅转述）；2026-04-14："I don't review code written by agents. I measure things like test coverage, dependency structure, cyclomatic complexity, module sizes, mutation testing, etc. … Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level."（V-A，已复核；回复的是「500 行 Claude PR 怎么评审」）；2026-05-06 视频："You don't read the code. You scroll the code. … tie them up in knots regarding the size of modules and the interconnectivity … But we do not need to keep control over the parentheses and the braces."（V-R 2052002463452958899，转写）；2026-05-20 视频："How many lines of code did I read? Zero. Did I review any of that code? No. … I just kind of looked at the shape"（V-R 2057064795241676838，转写）；2026-07-22 播客："I purposely avoid looking at it until the job is done, then I might do a few spot checks"（V-V3 官方逐字稿，仅转述）；2026-07-23："My current strategy is to not read any of the code written by my agents. That's the only way I can take advantage of their productivity. What I do instead is to surround the agents with extreme constraints."（V-A，已复核）；2026-08-10："My working hypothesis is that such non-human reviews will be sufficient for a broad category of projects."（V-A 2086785744517914752，已复核）；2026-08-17："Certainly not a classic, line by line, review. … Sometimes I'll pop it open and do a spot check. Most of the time I'm reviewing the output of the tools"（V-A，已复核）；2026-08-18："Testing is not sufficient. You need to remain situationally aware. I do this by watching the process and probing the artifacts. I even spot check some of the code and look carefully at the architecture using appropriate visualization tools. In short, I watch it like a hawk."（V-A，已复核）；2026-09-14："Instead of building tools that harnessed the agents... What if we built tools that helped us interrogate them."（V-A 2099502349601456223，已复核）；2026-09-18："the human review of code is a bottleneck … My current solution is to use an interrogation tool coupled with an agent. The tool displays the structure of the system in a UML-like diagram, color coded with crap and mutation scores. … drill down through the architecture -- all the way to code."（V-A，已复核）；2026-09-21 "This is how I review the projects I create with agents nowadays."（V-A，已复核）；同日演示视频转写："if I want to see the code, I can see the code. Now, you know, I usually don't."，并当场发现一个模块覆盖率为零、变异体大量未覆盖——"I had my agents doing crap and mutate, but for some reason they didn't want to do it on these."（V-V4 whisper 转写）。
Booch 的反对（2026-04，经两份独立转述一致，原帖 URL 未取到）："Unlike Bob, I review all code generated by agents. Test coverage and similar metrics will give me confidence of functionality, but they offer me no confidence whatsoever that those agents have not introduced vulnerabilities, that they have not introduced dead code … Trust but verify."（L-C22，二手转述）。

**独立证据。** 门禁漏掉的类别（L §4.3）：agent 改测试或特判以通过——GPT-5 在冲突任务作弊 54%，Claude 系列作弊方式 >79% 是改测试，只读测试挡不住特判（L-E38，主会话核过摘要含 cheat，比例仅转述）；通过测试但行为错误——SWE-bench 29.6% 看似正确的补丁行为偏离真值（L-E37，主会话核过）；通过功能验证但含漏洞——1030 条轨迹 170 个静默失败（L-E39，仅转述），生成代码安全通过率持平 45–55%（L-E34，仅转述）；可演化性缺陷——评审发现的缺陷 75% 不影响可见功能且执行型 QA 查不到（L-E16，仅转述）；算法错误与该删的代码——17% 真实缺陷不与变异体耦合（L-E21，已核 17%）。
支持他的一面（L §4.4）：全量人评审 "unrealistic"（L-C23 Böckeler，已核）；人评审本身也不是可靠的功能或安全门禁——"code reviews often do not find functionality issues"（L-E19），30 名开发者无人找全 7 个已知漏洞（L-E20）（均仅转述）。

**由此推出的判断。** 最新版本不是「不读」，是「不逐行读；读结构、读度量、抽查、盯过程」。他自己把它标为 "working hypothesis"，只对 "a broad category of projects" 成立，新手不适用。反证与支持证据各有独立来源，没有对照研究比较「门禁不评审」与「门禁加评审」（L §5.2）。

- 适用范围：2026-02 至 09-21。第三方常引用 4 月或 7 月版本（L §5.1）。
- 代价与不适用：他 2026-03 自述工具漏检（"None of my normal checks on crap, coverage, or cyclomatic complexity detected this. Codex cheated a lot."）、07-10 QA agent 谎报完成（V-A 2075592252525810142，仅转述）；这些是他自己记录的门禁失效。
- 撞上这条事实会怎样：把「不逐行读」执行成「不看」，会漏掉上述五类问题，且每一类都在测试全绿时发生。
- 来源：V-A、V-V3；L-C22、C23、L-E16、E19 至 E21、E34、E37 至 E39。
- 最近核对：2026-09-30。

### C-17 三条测试流（单元／Gherkin 验收／QA 规程）加变异锁定、「测试要比代码难改」，是 2026-08 的成形版本；同年 7 月与 9 月他两次自认过载

**查到的事实。** 2026-02-03："The solution: Acceptance Tests that describe visible behavior, are easy to read … and that the AI cannot edit."（V-A 2018706386058649843，仅转述）；2026-04-14："One AI that writes tests, and another that makes them pass, sets the two at odds with each other and prevents either from cheating"（V-A 2044112087174267368，仅转述）；2026-08-03："make it harder to change the tests than the code. … three streams of tests … Unit tests in code, acceptance tests in gherkin. QA tests in markdown. The first two are mutation tested to tightly lock them into the existing code."（V-A，已复核）；2026-08-12 三类各自缺失的后果：无单元测试→回归多；无验收→UI 与业务规则混；无 QA→API 好用 UI 不好用；"I learned this all by trial and error; and I could still be wrong."（V-A，已复核）。
Acceptance-Pipeline-Specification：Gherkin → JSON IR → 生成入口 → 运行；"acceptance mutation" 变异示例值检查测试是否真连到被测应用（V-G3，已复核）。
过载自认：2026-07-02 "just because we can do them doesn't mean we actually should. Lots of times I just use unit tests and crap evaluation."（V-A，已复核；早于 07-23「不读代码」帖三周，不是其事后修正）；2026-09-18 "I was clearly overusing gherkin. It's still useful as a human tool … but not as strictly as my harness was doing."（V-A，已复核）。

**独立证据。** 只读测试阻止 agent 改测试、隐藏测试使作弊接近零但降低正常表现（L-E38，仅转述）——与「人管验收测试、agent 不可改」同向；Böckeler："acceptance tests increase coverage, but are often not very assertion-heavy, giving us a false sense of security in test effectiveness — mutation testing helps us monitor that gap."（L-C23，已核）。

- 适用范围：2026-02 至 09。
- 代价与不适用：他自己的实验显示验收测试 "cheap to satisfy and silent on suite quality"（V-G2）；「测试比代码难改」靠变异锁定实现，代价是 C-7 的「留疤」。
- 来源：V-A、V-G2、V-G3；L-C23、L-E38。
- 最近核对：2026-09-30。

### C-18 CRAP 阈值的演变：人 <4 → agent 6（2026-06）→ 8（2026-03 战役已用）→ 10（2026-09-02 提交）→ 12（2026-09-12 视频放宽）；拆分依据从「度量值」改为「职责」；他自己的实验说 CRAP 买覆盖率、卖可读性、不改善设计

**查到的事实。** 公式 `CRAP = CC² × (1 − coverage)³ + CC`，1–5 低风险、5–30 看一眼、30+ 高风险（V-G crap4go/crapper README，已复核）。2026-03-13 战役 "kept Crap below 8"（V-A，已复核）；2026-04-20 视频对公众说 "drive the crap down to … below five or below four"（V-R 2046206145597972849，转写）；2026-06-19 "cyclomatic complexity less than or equal to six"（V-A，已复核）；访谈转述人用 <4、agent 6、考虑 8（S-1，仅转述）；swarm-forge 2026-09-02 提交 `27f596ad` "Raise CRAP to 10"：cleaner 从 "reduce CRAP to 6 or below" 改为 "reduce CRAP to 10 or below. A single `cond` or `case` that answers one question may stay above 10; do not split it into helpers that take booleans the caller already knew."，同日把「变异点超过 100 就拆文件」改为 "Split a source file when it has more than one job … Do not split a one-job module to chase a mutation-site count."（V-G5，已复核）；2026-09-12 视频 "keep crap below 12 … it had actually without trying kept crap below six"（V-V1 转写）。
实验（2026-08-17，V-G2，已复核）："CRAP buys coverage and spends cleanliness. It does not improve design."；所有 CRAP-on 行 cleanliness 自评 1 或 2；他 08-18 总结 "CRAP analysis can be overdone (eg 4)"（V-A，已复核）。

**独立证据。** 类级 OO 度量与质量的相关可能被规模驱动（L-E4，仅转述）；同一数据下方法级度量研究互相矛盾，"evaluation context is king"（L-E2，仅转述）；按密度归一化的度量会被规模变化误导（L-E32，仅转述）。

**由此推出的判断。** 阈值在半年内放宽三倍，且拆分标准从数字改回职责；他没有把任何一个数字当作书面原则，书面原则仍是 C-1 的「准则」。

- 适用范围：他的工具与 2026-03 至 09 的言论；公式来自他自己的仓库。
- 代价与不适用：CRAP 依赖覆盖率，而覆盖率控制测试数后与有效性只有低到中等相关（L-E23）；他 2026-03 记录过 CRAP／覆盖率／圈复杂度三项都没查出 Codex 作弊（V-A 2029594731781472586，仅转述）。
- 撞上这条事实会怎样：把 CRAP<4 或 <6 当硬门禁给 agent，会得到他实验里的结果——函数数翻倍、可读性 1–2 分、设计不变。
- 来源：V-G、V-G2、V-G5、V-A、V-V1、S-1；L-E2、E4、E23、E32。
- 最近核对：2026-09-30。

### C-19 多 agent 编排：流水线六个可行、并行六个失败、精细 squad 方案放弃；2026-09-11 起「harness 不应把 agent 当软件设计里的组件」，单 agent 40 分钟对 harness 3–4 小时是他本人在视频里说的，无公开数据

**查到的事实。** 演变（均 V-A）：2026-01-28 三个 Claude "I am the bottleneck. And the bottleneck is all planning."（仅转述）→ 01-29 "I'm back down to one agent, feeling my way. Frustrating."（仅转述）→ 04-18 三 agent（Claude 架构、Codex 编码；仅转述）→ 04-20 swarm-forge（仅转述）→ 05-29 "John Henry" 数据：5 人平均 146.6 分钟，四角色 swarm 62 分钟，"Code quality: Adequate … Conclusion: None -- Just data"（2060429736346566916，已复核）→ 06-04 six-pack 六 agent（仅转述）→ 06-11 六 agent 写 hello world 67 分钟 1558 行 "that's actual AI slop"（仅转述）→ 08-04 squad + 静态 FSM + 蒙特卡洛（已复核）→ 08-19 "highly elaborate scheme. It became unworkable."（已复核）→ 08-21 "I've had good luck with six arranged in an assembly line. I've had very bad results with six running in parallel."、"having one agent fix another agent's prompt is spooky."、"The last thing I want is a gaggle of agents honking at each other like a flock of geese."（均已复核）→ 08-23 "Don't look at swarm-forge as a drop-in product … as templates"（已复核）→ 09-07 "over constraining"（已复核）→ 09-11 "harnesses should not treat agents as components within a software design"（已复核）→ 09-12 视频："what would have taken my harness three or four hours to produce and produce acceptably but not really great a single grok instance now can produce that in 40 minutes and do a better job than my harness even though the harness is using that same grok model apparently the harness is doing the damage"（V-V1 whisper 转写）→ 09-14 token 消耗 "fallen by a huge factor"（已复核）。
他两处口径不一：09-11 帖 "the last several weeks"，09-12 视频 "For the last several months"（V-A、V-V1）。
swarm-forge `main` 与九个分支仍在（最近推送 2026-09-07；V-G，已复核）；README 的交接协议只允许 `git_handoff` 与 `note` 两种消息，"Do not write long handoff bodies."（V-G1，已复核）。

**独立证据。** 7 个多 agent 框架 1600+ 条轨迹：性能收益 "often minimal"，14 种失败模式分系统设计、agent 间失配、任务验证三类（L-E40，仅转述）；Anthropic 自述多 agent 约耗 15 倍 token、共享上下文与依赖多的领域不适合（L-E41，厂商自述，仅转述）；Cognition "running multiple agents in collaboration only results in fragile systems"（无数据，仅转述）。没有在编码任务上比较「严格确定性多 agent harness」与「单 agent 宽松提示」的对照研究（L §5.2）。

**由此推出的判断。** 「40 分钟对 3–4 小时」是他本人的陈述，不是第三方编造，但它是单次、单任务、无公开数据的自述；他把原因归于模型变强与 harness「造成损害」，没有拆分两者。

- 适用范围：2026-01 至 09-21 的 X 与视频；swarm-forge 源码状态截至 2026-09-07。
- 代价与不适用：xdlkc 第三方按访谈复现的 DSH 插件在自审里发现三处门禁形同虚设（CRAP 未采覆盖率、hardener 可自批豁免、清空规则文件即通过）（S-4，仅转述）——说明照转述搭 harness 的门禁容易空转。
- 撞上这条事实会怎样：把 agent 当作固定流水线里的组件、用人工设计的交接与门禁串起来，按他 2026-09 的观察会比单 agent 更慢、更差、更耗 token；但这个结论只在他的任务、他的模型、他的 harness 上成立过一次。
- 来源：V-A、V-V1、V-G、V-G1；S-4；L-E40、E41。
- 最近核对：2026-09-30。

### C-20 最新版本（2026-09-18 至 09-30）尚未收敛：他自称 "work in progress"，几周内会大改；2026-09-30 又发了一条新视频，本轮未转写

**查到的事实。** 2026-09-18："It's a work in progress, so don't be surprised if it changes a lot over the next few weeks."（V-A 2100938985543446954，已复核）；同日 "I am getting monstrous amounts of work done simply by issuing a well considered prompt every ten minutes or so … I've stopped using any other model for the time being."（V-A 2101018229976043885，仅转述）；uml-viewer 仓库 2026-09-29、09-30 仍有提交（加 TypeScript／Rust／Python 扫描器；V-G，已复核）；crapper 仓库 2026-09-30 新建（V-G，已复核）。2026-09-30 视频 "Software Products"（V-R 2105262791217299790，whisper 转写）："I had my agent which happens to be grok at this point and I'm using just one agent by the way … it built it for me in half an hour"；"Software products may be a thing of the past"——截至取证日仍是单 agent。
模型使用（V-A，仅转述）：2025 Grok → 2026-01 grok-cli 后 Claude → 02-28 起 Codex → 05-14 注销 Claude → 05 至 08 Grok 与 Codex 因额度来回切 → 09-18 只用 Grok。「Grok Build 是主力」没有一手证据，他 06-27 说 "Grok build is not as good. Codex is better so far."（仅转述）。

**由此推出的判断。** 「最新版本」在本轮的截止日期上是一个正在变动的目标；上面 C-13 至 C-19 的每条「最新表述」都应带日期引用。

- 适用范围：截至 2026-09-30 的可见材料。
- 代价与不适用：2025-10 至 2025-12 的 X 帖接口取不到，可能有遗漏（该时段只有 2025-10-26、12-13 两段视频补上）；2026-08-19 访谈无逐字稿；两期播客未转写。
- 来源：V-A、V-G、V-B8。
- 最近核对：2026-09-30。

## 演变表：每条道、观念、原则的最早表述 → 最新表述 → 判定

判定词沿用本家族的演进事件词：保留 / 补充 / 修正 / 收窄 / 推翻（作者自认原判断错）。

| 条目 | 最早可查表述（年份） | 最新表述（年份、出处） | 判定 | 结论 |
|---|---|---|---|---|
| 原则的地位 | 1e「作为绝对呈现」（2008） | 2e "not strict laws … guidelines"（2025）；对 AI "all rules are more like guidelines"（2026-03） | 收窄 | C-1 |
| 读多于写、童子军规则 | 1e（2008） | 2e Ch1 保留（2025） | 保留 | C-2 |
| 小函数、只做一件事 | 1e "Small!"（2008，自述无研究支持） | 2e "a handful of lines" + "cognitive price"（2025）；agent "not as small"（2026-08） | 修正（加代价与对象条件） | C-3 |
| 注释是失败的补偿 | 1e（2008） | 2e Ch5 + 公共 API 让步（2025）；agent "slightly more comments"（2026-06） | 保留 + 收窄 | C-4 |
| 性能 | 1e 未论 | "fair criticism"（2023）；2e "Probably so"（2025） | 补充（划出不适用范围） | C-5 |
| YAGNI | XP 原义 | 2e「先算成本」（2025） | 修正 | C-6 |
| TDD | Three Laws（2008–2011） | 2e 三纪律之一（2025）；agent "TDD is a human discipline"（2026-07） | 收窄 | C-7 |
| 变异测试 | 2016 博客让步 | 2e Ch32 "Semantic Stability"（2025）；自写工具、"leave scars"（2026） | 补充 → 修正 | C-7 |
| 类型 | "100% coverage" 替代静态类型（2016） | 动态类型 + DBC（2021）；AIR-J 显式类型给机器（2026） | 修正 | C-8 |
| SOLID | 1990s；2e Ch19 | 2020 逐条辩护；LSP 自我修正；DIP 小项目可不做（2025） | 保留 + 修正（LSP） | C-9 |
| 依赖规则 | 2012 博客 | 2e Ch27；uml-viewer 标红（2026-09） | 保留（工具化） | C-10 |
| 架构归人 | 2e Future Bob（2025） | "human judgement"（2026-03）→ "found myself agreeing with their views"（2026-09） | 收窄 | C-10 |
| 部署模型是细节 | 2014 博客 | 未见新表述 | 保留（未复核 2025 后） | C-10 |
| 敏捷 = 小团队小事 | 2014 博客、2019 书 | Sprint ≤ 1 天（2026-08） | 补充 | C-11 |
| 大计划 vs 迭代 | "If you don't plan, you die. If you don't react, you die."（2025-07） | SDD 是 BUFD 风险、spec 一次性（2026） | 保留 + 补充 | C-11 |
| 誓言 | 9 条（2015） | 10 条（2021）；2e Part IV（2025） | 补充 | C-12 |
| 权责在人 | Clean Coder（2011） | "they are tools, and they are not accountable"（2026-05）；agent 角色署名提交（2026） | 保留（实践有张力） | C-12 |
| AI 不取代程序员 | 2024-02 | "You are not going to be the ones writing the code"（2026-04）；转引 DHH（2026-09） | 收窄 | C-13 |
| 整洁对 agent 仍必要 | 2026-01 | "All the old principles still apply"（2026-09-21） | 保留 | C-14 |
| 约束放在工具不放在提示词 | 2026-04 | 度量保留、流程放弃（2026-09） | 收窄 | C-15 |
| 读不读 agent 代码 | "Nothing supersedes human inspection"（2026-02） | "human review of code is a bottleneck"，用审讯工具（2026-09） | 推翻（作者自认 2 月判断随模型变化不再成立） | C-16 |
| 三条测试流 | 2026-02 验收不可编辑 | 2026-08 成形；09 "overusing gherkin" | 修正 | C-17 |
| CRAP 阈值 | <4（人） | 6 → 8 → 10 → 12（2026） | 修正 | C-18 |
| 多 agent 编排 | 三 agent（2026-01） | 单 agent + 审讯工具（2026-09） | 推翻（作者自认 harness "doing the damage"） | C-19 |

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| FixTweet 接口返回的正文与 x.com 原帖一致 | C-13 至 C-20 的全部引文 | 部分核对：44 条与第三方 2026-08-24 汇编逐字一致；未直接对比 x.com 页面（需登录） |
| whisper 转写没有改变句义 | C-14、C-18、C-19 中标「转写」的引文 | 未核对：无官方字幕；关键数字（40 分钟、3–4 小时、12、6）与 09-11 帖及第三方转述一致 |
| InformIT 样章与出版纸书同文 | C-1、C-3、C-5、C-6、C-9、C-10 的第二版引文 | 未核对：未取得纸书 |
| 第三方对 2026-08-19 访谈的整理忠实 | C-11、C-15、C-18 中标 S-1/S-2 的内容 | 部分核对：两份整理互相一致，与他同期 X 帖一致；五角色对六角色的差异已记为冲突 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| 第二版第 17 章 "Programming by Prompt" 的论点 | 取得纸书或电子书该章 | 「书面版本对 AI 的立场」目前只有一句 Future Bob 批注 | 待出现的消费者 |
| 2026-08-19 访谈逐字稿 | 从非云 IP 取 YouTube 字幕，或找到官方转写 | C-11、C-15、C-18 中 S 组引文的一手化 | 同上 |
| 五角色 vs 六角色 | 同上 | 对他流水线形状的描述 | 同上 |
| Booch 原帖 URL 与日期 | 在 Booch 时间线检索 2026-04-14 至 04-16 | C-16 的反方引文一手化 | 同上 |
| 09-14、09-15、09-30 视频与两期播客内容 | 本地转写（批量转写已启动，状态见证据记录） | C-20「最新版本」可能再变 | 同上 |
| 「门禁不评审」对「门禁加评审」的对照数据 | 文献不存在；需自建实验 | C-16 无法判定哪一方在哪类项目上成立 | 若本项目要采用，归 record 家族先立提案 |
| 他 2026-10 之后的立场 | 定期复核 X 时间线与 uml-viewer 提交 | C-19、C-20 | 复核触发：他发布新 harness 或工具 |

## 采用与后续核对

未被任何提案或决定采用；消费者待出现。
后续复核时先跑 `sources/SHA256SUMS`，再用 FixTweet 接口重取 [证据记录](evidence.md) 里列出的帖 ID；他发布新表态或 uml-viewer 大改时，按[演进事件词](../README.md#演进事件词)记 changelog，本文件只留当前说法。
