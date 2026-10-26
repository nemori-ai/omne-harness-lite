# 项目管理与系统工程方法论调研：早暴露风险、少返工、避单点瓶颈

**状态：调研材料。**本文是 [Map-Reduce 式交付推进](../README.md) 的依据，不是规则。标「未核」的结论使用前要复核。文中的「我们」指写作时采用这种交付做法的项目，文中的数值是当时的粗估或示例，不是阈值。

调研日期：2026-10-26。来源编号见文末「参考文献」。标「未核」的项，本次没有读到一手原文（多为扫描 PDF 或付费墙），只依据二手摘要，使用前要复核。

**一句话结论**：零通信并行没有消除协调成本，而是把它集中到 reduce 节点。所以要把集成前置（首波就走通跨线的 walking skeleton），按依赖结构划分写范围（DSM），并把 reduce 当作单服务台队列来管理（错峰交回、限 WIP、看队列长度）。

---

## 1. 让风险更早暴露

| 方法 | 核心机制 | 适用前提 | 失败案例或局限 | 来源 |
| --- | --- | --- | --- | --- |
| Risk-driven spiral（Boehm） | 每一圈都做四件事：定目标与约束、评估备选方案并化解风险、开发验证、计划下一圈。「风险决定投入多少」「风险决定细到什么程度」是不变量。后来又加了 LCO/LCA/IOC 三个 anchor point milestone（四项活动按通行转述，原文未核） | 风险可以被识别和排序；团队有能力评估风险 | Boehm 本人列出了 "hazardous spiral look-alikes"，例如在 waterfall 前提不成立时，仍然串行跑多轮增量 waterfall。原文是扫描件，逐条例子未核 | [1][3] |
| Risk exposure | RE = P(不满意结果) × L(损失)，按 RE 排序决定先处理什么。Boehm 的依据是：多数失败项目的事后复盘显示，早点关注高风险元素就能避免或大幅减少问题 | P 和 L 能粗估，并且估计的口径一致 | 原文扫描件未核；定义经二手摘要核实 | [2] |
| Walking skeleton（Cockburn） | "a tiny implementation of the system that performs a small end-to-end function"，不必用最终架构，但要把主要架构组件连起来；之后架构与功能"evolve in parallel" | 系统有明确的端到端路径 | Adzic 批评它仍然只是在验证架构，用户等真实价值的时间偏长，建议先上 "skeleton on crutches" | [4] |
| Tracer bullet（Hunt & Thomas） | "one thin line of execution goes end to end"，代码保留下来并逐步长成产品。prototype 是"for your learning"，用完就扔 | 需求易变，需要快速反馈 | 书中原文未取到，以上依据作者访谈 | [5] |
| Set-based concurrent engineering（Ward、Sobek、Liker） | 同时保留多组备选方案，逐步收窄；三条原则：按专业映射设计空间、取交集来集成、"establish feasibility before commitment" | 并行探索的成本低于晚期返工 | 作者自注：文中的 Toyota 例子是有意挑的极端例子，不是平均情况。本次未取到行业外推广失败的一手研究 | [6][7] |
| Front-loading（Thomke & Fujimoto） | 把问题识别和解决挪到流程早期：一是跨项目迁移知识，二是用仿真等技术提早发现问题 | 有可复用的知识，或有便宜的早期验证手段 | 以上依据 1998 年工作论文，JPIM 2000 正式版未核 | [8] |
| Pre-mortem（Klein） | 假设计划"已经失败"，每人花 2 分钟默写失败原因，再按轮次逐条报，最后评估可能性、影响和预防难度 | 计划已成形，参与者敢于直言 | 证据较薄：作者自述的研究是 178 名学生做假想情景。常被引用的"prospective hindsight 提升 30%"本次未核，而且 1989 年原文摘要说时间视角"影响很小"，与这个数字不符。本次未取到一手失败案例 | [9][10] |
| Assumption-based planning（Dewar，RAND） | 先找出 load-bearing assumption（一旦为假就会改变计划），再筛出其中脆弱的那些；为它们设 signpost，并准备 shaping/hedging action | 计划能显式写出所依赖的假设 | 以上依据书的摘录和书评；1993 年 RAND 报告全文未核；本次未取到失败案例 | [11] |

**小结**：这几种方法的共同点是先处理最有可能推翻计划的东西。spiral 用 RE 排序，skeleton 和 tracer 先走通集成路径，set-based 在承诺前先证明可行，pre-mortem 和 ABP 先把隐含假设写出来。

---

## 2. 减少重复工作与运筹

| 方法 | 核心机制 | 适用前提与取舍 | 来源 |
| --- | --- | --- | --- |
| Cost of delay 与 WSJF | "If you only quantify one thing, quantify the cost of delay"。WSJF = CoD ÷ 工期，SAFe 把 CoD 拆成三项：业务价值、时间紧迫性、风险降低或机会使能 | 要能粗估 CoD。"85% 的产品经理不会量化 CoD""估计值相差 50:1"都是二手转述，未核 | [12][13] |
| 批量大小与交易成本 | E6 U-Curve Principle：批量越小，持有成本越低，但交易成本越高，总成本呈 U 形，而且谷底平坦。要缩小批量，先降低交易成本（例如自动化） | 不是"越小越好"，而是一种经济权衡 | [12] |
| 队列 | Q14："Don't control cycle time, control queue size"。cycle time 是滞后指标，queue size 是领先指标。利用率越高，队列非线性地增长 | 产品开发里的队列是信息，所以看不见 | [12] |
| DSM partition、sequencing 与 tearing（Steward；Eppinger & Browning） | 用矩阵表示任务之间的信息依赖。partition 找出耦合块，sequencing 把反馈标记尽量推到对角线附近。tearing 选出最少的反馈标记、假定其取值，把剩余部分变成上三角，而且尽量让 tear 落在最小的块里 | 依赖关系能显式列出。Eppinger 等（1994）用 DSM 重新排序任务，减少迭代 | [14] |
| Rolling-wave planning | 近期工作细化到 work package，远期工作只保留 planning package，开工前再展开 | PMBOK 原文未核，以上依据二手资料 | [15] |
| Phase-gate / Stage-Gate（Cooper） | 阶段之间设 go/kill gate。后续版本提出 "gates with teeth"、精简 gate、阶段可重叠（simultaneous execution），以及 Agile-Stage-Gate 混合模式 | gate 防止坏项目继续，但会带来等待和官僚化。"混合模式缩短约 30% 上市时间"来自 Cooper 白皮书，PDF 未能读取，未核 | [16] |
| Definition of Done / Ready | DoD 是 Increment 的 commitment；不满足 DoD 的工作"cannot be released or even presented"。DoR 不在 Scrum Guide 里，是补充实践；Scrum Alliance 认为它可选，并提醒不要把它变成阶段关卡 | 多个团队合作同一产品时，"must mutually define and comply with the same Definition of Done" | [17] |

**取舍**：rolling-wave 让计划只在近期细化；phase-gate 在关键点做硬裁决。两者可以组合：里程碑起点是 gate（确认契约基线），里程碑内部用 rolling-wave（每波只细化下一波）。

---

## 3. 避免单一瓶颈

| 理论 | 机制 | 对并行度的约束 | 来源 |
| --- | --- | --- | --- |
| TOC five focusing steps（Goldratt） | IDENTIFY、EXPLOIT、SUBORDINATE、ELEVATE、PREVENT INERTIA。"The output of the constraint governs … the organization as a whole"；要最大化约束本身的利用率，"NOT … non-constraints" | 非约束环节跑满不会增加系统产出 | [18] |
| Drum-buffer-rope | drum 是约束定下的节拍；buffer 是约束前的时间或在制缓冲；rope 把上游投料和约束的消耗速度绑在一起 | 投料速度由约束决定，而不是由上游产能决定。以上依据二手资料，*The Race*（1986）原文未核 | [19] |
| Critical chain 与 buffer management | 把各任务里藏的安全余量集中成 project buffer，汇入点放 feeding buffer；用 fever chart 看"完成比例对缓冲消耗"，按绿、黄、红三区触发动作 | 以上依据工具厂商和 TOCICO 词表（PDF 未读到），Goldratt 1997 原书未核 | [20] |
| Little's law | L = λW，适用于平稳系统的长期平均，不依赖到达分布和服务分布 | WIP 不变时，吞吐上不去，周期就只能变长 | [21] |
| Kingman 公式 | Wq ≈ ρ/(1−ρ) · (c_a² + c_s²)/2 · E[S] | 单服务台在高利用率、高变异时等待时间爆炸。三个杠杆：降 ρ、降到达变异、降服务变异 | [22] |
| Kanban WIP 上限（Anderson） | 加 WIP 上限，形成 pull system；"optimizing for utilization is not desirable"，要留 slack | 以上引语来自引用汇编站，未核 | [23] |
| Brooks 定律 | 沟通成本分两部分：培训（随人数线性增长）和相互沟通（n(n−1)/2）。不能切分的任务，加人也没用 | 并行度的上限取决于任务能切分到什么程度 | [24] |
| Conway 定律 | 组织设计的系统，会复制它的沟通结构；"the design which occurs first is almost never the best possible"。Inverse Conway maneuver：先按目标架构调整组织 | 并行单元之间的边界会变成系统的接缝 | [25] |

---

## 4. 对「人 + agent、零通信并行、串行 reduce」的适用边界

先看 agent 实践的一手证据：

- Cognition（2025）：并行子代理会各自做出隐含决策，彼此冲突，例如 Flappy Bird 拆成两半后风格不一致。原则是 "Actions carry implicit decisions, and conflicting decisions carry bad results" [26]。
- Cognition（2026-04）："writes stay single-threaded and the additional agents contribute intelligence rather than actions"；评审代理与编码代理事先不共享上下文时效果最好 [26]。
- Anthropic：多代理系统的 token 消耗约为对话的 15 倍；需要共享上下文的领域（例如编码）不太适合多代理；"Synchronous execution creates bottlenecks" [27]。90.2% 的提升是研究类评测的结果，不能外推到编码。
- METR（2025）：开发者用 AI 后慢了 19%，但事后仍自认为快了 20% [28]。METR 在 2026 年承认新实验"unreliable signal" [28]。可以确定的结论只有一条：主观感受不可靠，要靠测量。

| 理论 | 原有假设 | 在本形态下 | 判断 |
| --- | --- | --- | --- |
| Brooks 定律 | 沟通成本随人数呈 n(n−1)/2 增长 | 零通信并不消除协调，只是把它串行化到 reduce：本该在过程中发生的对话，变成了合并冲突、准入失败和评审修复轮。培训成本对应上下文包，每开一个新会话就要付一次，无法摊销 | **改形**：上限从"人数"变成"reduce 的吞吐"（推断） |
| Conway 定律 | 沟通结构是自然形成的 | 沟通结构完全由设计决定（各线零通信，只有冻结契约），所以系统最弱的接缝必然出现在线与线之间的接口上 | **更强**：可预测，也可以用 inverse Conway 主动设计 |
| TOC / DBR | 人力稀缺，约束会漂移 | agent 产能弹性大、成本低，约束稳定地落在 reduce 机器（准入独占）和人的注意力（裁决、接受）上 | **更强**：约束清晰，应当 exploit 并 subordinate |
| Kingman | 到达和服务近似平稳 | 各线在波末集中交回，c_a 高；评审修复轮次不受控、准入时长固定，c_s 高；单台 reduce 利用率 ρ 也高 | **完全适用**，三个杠杆都能用上 |
| Set-based / arena | 并行探索的人力成本高 | 并行备选的成本主要是 token，相对便宜；收敛仍然在 reduce 进行 | **更强**：对最高风险接口值得用 |
| 人力成本模型（Reinertsen 的利用率论、"空闲是浪费"） | 人的产能是主要成本 | agent 空闲几乎不花钱；昂贵的是人的注意力和 reduce 时间 | **弱化**：不要追求线的利用率，要追求约束的利用率 |
| Pre-mortem | 作用之一是打破会议中的和谐压力（社会机制） | 社会机制不适用于 agent；prospective hindsight 可以交给独立 agent 做，但效果未核 | **部分适用**，未核 |
| Walking skeleton | 先连通架构 | 零通信并行最缺的就是早期集成，正好能补上 | **更强** |

---

## 5. 对我们怎么用、量什么

指标尽量映射到看板现有字段（Status/Line/Kind/Wave/日期/Cycle days）。

### 5.1 让风险早暴露

| 建议 | 指标 | 依据 |
| --- | --- | --- |
| 里程碑首波只做跨所有线的端到端 walking skeleton：各线只交最薄的切片，先让最难的集成路径在 reduce 走通一次 | 首次端到端集成通过的时刻占里程碑总时长的比例；集成类缺陷在最后一波才发现的占比 | [1][3][4][5] |
| 派发前跑 pre-mortem 和 ABP：每条线写出 load-bearing assumption（输入版本、写范围、契约条款），各配一个机读 signpost | 每波触发的 signpost 数；事后复盘发现、但事前没列出的失败原因数（遗漏率） | [9][11] |
| 按 RE = P × L 给线打分，高 RE 的线先派发、先进 reduce；对最高 RE 的接口，让两条线并行试两种方案，在 reduce 收敛 | 高 RE 线在波内的合入次序；返工轮数与 RE 的相关性 | [2][7] |

### 5.2 减少重复工作

| 建议 | 指标 | 依据 |
| --- | --- | --- |
| 写范围按实际依赖图（import 图加契约依赖）做 DSM 分区生成：耦合块归同一条线或留给 reduce，冻结契约就是 tear。派发前机器核对"计划写范围"与"依赖分区"是否一致 | 分解错误（越界、写范围与计划不一致）在派发前拦下的数量与交回后才发现的数量之比 | [14][25] |
| 把 DoR 做成机读检查：派发时校验输入基线 commit 与上游卡状态，输入过时就拒绝派发 | 每波因输入过时而返工的线数 | [17] |
| 按 U 曲线调批量：先降低 reduce 的交易成本（只跑受影响集、做增量准入），再缩小单次交回的批量 | 单次交回的 diff 规模；单次准入耗时；每次准入包含的交回数 | [12] |

### 5.3 避免 reduce 成为单点瓶颈

| 建议 | 指标 | 依据 |
| --- | --- | --- |
| 把 reduce 当作 drum：只接收已在线内自跑过同等检查的交回（exploit），派发节奏由 reduce 吞吐决定（rope） | reduce 队列长度 L、吞吐 λ、等待 W，用 Little 定律互相校验；reduce 因交回未就绪而空转的比例 | [18][19][21] |
| 降 c_a：错峰交回，从波末集中交回改为连续流。降 c_s：评审修复轮设上限（例如 2 轮），超出就退回原线 | 交回到合入的等待时间 P50/P90（Cycle days 拆成"在线中"和"在 reduce 中"两段）；评审修复轮数分布 | [22][26] |
| 在 reduce 前设 WIP 上限 k，每波设项目缓冲，用 fever chart 跟踪 | WIP 超限次数；缓冲消耗比与波完成比的斜率（大于 1 就预警） | [20][23] |

### 5.4 人 + agent 形态的专项

| 建议 | 指标 | 依据 |
| --- | --- | --- |
| 把人的注意力列为第二约束：产品和 breaking 裁决批量前置到里程碑起点或波边界，不在波中逐条打断 | 处于"等人裁决"状态的卡数与停留时长 | [18] |
| 坚持单写者和独立评审（评审代理不继承编码上下文）；用实测而不是主观感受评估 agent 提效 | 每条线交回后的缺陷检出数；线的自报完成时间与实际 Cycle days 的偏差 | [26][28] |

---

## 参考文献

1. Boehm, B. "A Spiral Model of Software Development and Enhancement", *IEEE Computer* 21(5), 1988. https://doi.org/10.1109/2.59 （扫描 PDF，正文未核）
2. Boehm, B. "Software Risk Management: Principles and Practices", *IEEE Software* 8(1), 1991. https://www.cs.virginia.edu/~sherriff/papers/Boehm%20-%201991.pdf （扫描件，RE 定义经二手摘要核实）
3. Boehm, B. *Spiral Development: Experience, Principles, and Refinements*, CMU/SEI-2000-SR-008. https://www.sei.cmu.edu/library/spiral-development-experience-principles-and-refinements-spiral-development-workshop-february-9-2000 ；不变量的列表转引自 https://en.wikipedia.org/wiki/Spiral_model
4. Cockburn 在 *Crystal Clear* 中的定义，转引自 Adzic, "Forget the walking skeleton – put it on crutches". https://gojko.net/2014/06/09/forget-the-walking-skeleton-put-it-on-crutches/
5. Hunt & Thomas 访谈 "Tracer Bullets and Prototypes". https://www.artima.com/articles/tracer-bullets-and-prototypes
6. Ward, Liker, Cristiano, Sobek, "The Second Toyota Paradox", *Sloan Management Review* 36, 1995. https://shop.sloanreview.mit.edu/the-second-toyota-paradox-how-delaying-decisions-can-make-better-cars-faster
7. Sobek, Ward, Liker, "Toyota's Principles of Set-Based Concurrent Engineering", 1999. https://sloanreview.mit.edu/article/toyotas-principles-of-setbased-concurrent-engineering
8. Thomke & Fujimoto, 1998 年工作论文. https://www.cirje.e.u-tokyo.ac.jp/research/dp/98/98cf11ab.htm （正式版 JPIM 17(2), 2000，未核）
9. Klein, G. "Performing a Project Premortem", HBR, 2007. https://hbr.org/2007/09/performing-a-project-premortem ；Klein 2021 年自述. https://www.psychologytoday.com/ie/blog/seeing-what-others-dont/202101/the-pre-mortem-method
10. "Back to the future: Temporal perspective in the explanation of events", *J. Behavioral Decision Making*, 1989（摘要）. https://colab.ws/articles/10.1002%2Fbdm.3960020103
11. Dewar, J. *Assumption-Based Planning*, Cambridge UP, 2002（摘录）. https://assets.cambridge.org/97805218/06534/excerpt/9780521806534_excerpt.pdf ；RAND/Army 应用报告. https://apps.dtic.mil/sti/pdfs/ADA324935.pdf （未读取）
12. Reinertsen, D. *The Principles of Product Development Flow*, 2009. https://search.worldcat.org/title/435994279 ；原则 E6、Q14 等转引自 https://ardalis.com/principles-of-product-development-flow-book-review/ 和 https://productdevelopment101.substack.com/p/productivity-in-product-development-4bb （二手）
13. SAFe WSJF（存档页）. https://webarchive.library.unt.edu/web/20161225132214mp_/http://www.scaledagileframework.com/wsjf
14. Eppinger et al., "A model-based method for organizing tasks in product development", *Research in Engineering Design* 6, 1994. https://dspace.mit.edu/handle/1721.1/2468 ；Eppinger & Browning, *DSM Methods and Applications*, MIT Press, 2012. https://stuff.mit.edu/people/eppinger/SDE-MIT/DSM_Book.html ；tearing 与 sequencing：https://dsmweb.org/tearing-a-dsm/ 、https://dsmweb.org/sequencing-a-dsm/
15. Rolling-wave planning（二手）. https://pmstudycircle.com/rolling-wave-planning/
16. Cooper, R. "Stage-Gate Systems", *Business Horizons* 33(3), 1990. https://doi.org/10.1016/0007-6813(90)90040-I ；next-generation：https://experts.mcmaster.ca/scholarly-works/319828 ；Agile-Stage-Gate 白皮书（未能读取）：https://planisware.com/sites/default/files/2022-09/robert-cooper-agile-stage-gate-hybrids_1.pdf
17. Scrum Guide 2020. https://scrumguides.org/scrum-guide.html ；DoR：https://resources.scrumalliance.org/Article/pros-cons-definition-ready
18. TOC Institute, Five Focusing Steps. https://www.tocinstitute.org/five-focusing-steps.html
19. Drum-buffer-rope（二手）. https://maaw.info/DrumBufferRope.htm
20. Critical chain 缓冲与 fever chart（工具厂商文档）. https://success.sciforma.com/en/2026.07/topics/user/critical-chain-monitoring
21. Little's law. https://en.wikipedia.org/wiki/Little%27s_law ；Little 2011 回顾文章. https://doi.org/10.1287/opre.1110.0940
22. Kingman's formula. https://en.wikipedia.org/wiki/Kingman%27s_formula （原文：Proc. Camb. Phil. Soc. 57, 1961，未核）
23. Anderson, D. *Kanban*, 2010. https://www.oreilly.com/library/view/kanban/9781457196102/
24. Brooks, *The Mythical Man-Month*. https://en.wikipedia.org/wiki/The_Mythical_Man-Month ；n(n−1)/2 的推导见课程讲义 https://home.cs.colorado.edu/~kena/classes/5828/s99/lectures/lecture04.pdf
25. Conway, "How Do Committees Invent?", *Datamation*, 1968. https://www.melconway.com/Home/Committees_Paper.html ；Inverse Conway maneuver：https://www.thoughtworks.com/radar/techniques/inverse-conway-maneuver
26. Cognition, "Don't Build Multi-Agents"（2025-06-12）. https://cognition.com/blog/dont-build-multi-agents ；"Multi-Agents: What's Actually Working"（2026-04-22）. https://cognition.com/blog/multi-agents-working
27. Anthropic, "How we built our multi-agent research system". https://www.anthropic.com/engineering/multi-agent-research-system
28. METR 2025 年研究. https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ ；2026 年更新. https://metr.org/blog/2026-02-24-uplift-update/
