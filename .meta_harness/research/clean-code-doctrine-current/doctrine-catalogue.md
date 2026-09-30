# 整洁之道条目全表：敏捷开发 · 架构设计 · 代码编写（最新版本）

本表把 Martin 整洁之道的每一条道、观念、原则按三块列全，每条给**最新表述**（出处与年份）、**更早表述**、**状态判定**与**复核级别**。
判断依据与独立证据在 [research.md](research.md)（C-1 至 C-20）；本表只列条目，不重复论证。

复核级别：**已复核** = 主会话读过原文字节（样章 PDF、目录页、博客、辩论、推文 JSON、视频转写）；**仅转述** = 子代理取回或第三方转述；
**目录层** = 只能从出版社目录确认该条存在，正文未读，表述按小节标题给出，不补原文。
状态词：保留 / 加限定 / 收窄 / 修正 / 新增 / 改口。

出处缩写：1e = Clean Code 第一版（2008，目录已复核）；2e = Clean Code 第二版（2025，目录与样章已复核）；Coder = The Clean Coder（2011，目录已复核）；
CA = Clean Architecture（2017，目录已复核）；Agile = Clean Agile（2019，目录仅转述）；Craft = Clean Craftsmanship（2021，目录已复核）；
FD = Functional Design（2023，目录仅转述）；WP = We, Programmers（2024，目录仅转述）；Blog = blog.cleancoder.com；X = 推文（ID）；Rant = Morning Bathrobe Rant 视频转写（ID）。

---

## 一、敏捷开发（过程、职业、工艺与伦理）

### 1.1 敏捷本身

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 敏捷是什么 | Agile 前言："Agile is a small idea about the small problem of small programming teams doing small things."；"a restatement of Agile as it was told in 2000"（2019） | Blog 2014-03-28："Agile is a culture expressed through a set of practices." | 保留 | 仅转述 |
| 敏捷的目的 | Rant 2025-06-05："Agile does not make teams go fast … nothing … makes a team go fast except doing a good job"；"Agile was trying to repair the break between programmers and business … by telling the truth. Agile is a way of measuring progress … The purpose of agile is to destroy hope." | Agile Ch2 "The Reasons for Agile"（2019） | 保留 | 已复核（转写） |
| 迭代长度 | X 2026-08-08："an Agile project that uses AI will have to shrink their Sprint size to one day (or less)" | Rant 2025-06-05：一到两周，"Two is probably the most you want to spend"；"sprint … is a dumb name" | 收窄（AI 场景） | 已复核 |
| 计划与反应 | X 2025-07-17："It's _always_ a mix … If you don't plan, you die. If you don't react, you die." | Agile Ch3 Planning（2019） | 保留 | 已复核 |
| 大规模敏捷 | Blog 2018-04-02："Once you are doing something big, you have left the realm of Agile."；Agile Ch6 "Agile in the Large"（目录） | Blog 2014 | 保留 | 仅转述 |
| Scrum 与认证 | Rant 2025-05-05：Scrum 1995 是好主意，败于 "the invasion of the project managers"，种子是 "Certified Scrum master courses … I thought it was a dumb idea"；Agile Ch6 "Scrum Masters / Certification / Real Certification"（目录） | Blog 2018-08-28 "The Tragedy of Craftsmanship"：敏捷运动商业化、抛弃程序员 | 保留 | 已复核（转写）+目录层 |
| 业务实践（Circle of Life） | Agile Ch3：Planning、Small Releases、Acceptance Tests、Whole Team | XP 原版 | 保留 | 目录层（仅转述） |
| 团队实践 | Agile Ch4：Metaphor、Sustainable Pace、Collective Ownership、Continuous Integration、Standup Meetings | XP 原版 | 保留 | 目录层（仅转述） |
| 技术实践 | Agile Ch5：TDD、Refactoring、Simple Design、Pair Programming（各条细则见第三块） | XP 原版 | 保留 | 目录层（仅转述） |
| 估算 | Rant 2025-06-05："developers can't estimate worth a damn anyway … The only way to know whether you're going to make the deadline is to measure your progress"；Coder Ch10 Estimation（PERT、Law of Large Numbers）；Craft Ch14 "Estimate Honestly and Fairly"；2e Ch35 同名（Lies / Honesty, Accuracy, Precision / Aggregation / Pressure） | Coder 2011 | 保留 | 已复核（转写、目录）|
| 结对 | Rant 2025-05-14："sit down with somebody for an hour a day … the best kind of code review you can have"；Blog 2021-01-17："A mature team might pair 50% of the time, or even less" | Coder 2011 把结对当处理打断的手段 | 收窄（非强制、给出比例） | 已复核（转写）+仅转述 |
| 规格与大计划（AI 场景） | X 2026-02-12："SDD … carries the risk of BUFD … Specs will be co-authored by the humans and the AI, but with final approval, ferociously defended, by the humans."；访谈 2026-08-19（转述）："Specs are ephemeral" | 同上「计划与反应」 | 新增（AI 场景） | 仅转述 |
| 敏捷与 AI 的关系 | X 2026-08-04：固定工作流做成静态 FSM、模拟器、蒙特卡洛，"Don't tell me software engineering is dead."；2026-08-19 精细方案 "unworkable"，改简单方案 | — | 新增后又收窄 | 已复核 |

### 1.2 职业（The Clean Coder，2011；2e 第四部分沿用）

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 承担责任 | Coder Ch1 "Taking Responsibility"；前言："With that knowledge comes the responsibility to act." | — | 保留 | 仅转述 |
| 不造成伤害 | Coder Ch1 "First, Do No Harm" → 誓言第一条 → Craft Ch12 → 2e Ch28 "Harm"（No Harm to Society / Harm to Function / No Harm to Structure / Soft / Tests） | 2011 | 保留（措辞连续） | 已复核（2e 目录） |
| 职业道德 | Coder Ch1 "Work Ethic"（每周投入学习练习的时间，正文未读） | — | 保留 | 目录层（已复核目录） |
| 说不 | Coder Ch2 "Saying No"（Adversarial Roles / High Stakes / Being a "Team Player" / The Cost of Saying Yes / Code Impossible）；Craft Ch11 "You Must Say NO"；Blog 2019-05-18 737 Max："We need to have the courage to say 'No' when we assess that the risk of deploying our code is too high." | 2011 | 保留 | 目录层 + 仅转述 |
| 说是 | Coder Ch3 "A Language of Commitment"；Agile Ch2 "view each one of those practices as a promise, a commitment" | 2011 | 保留 | 目录层 + 仅转述 |
| 编码状态 | Coder Ch4："If you are tired or distracted, do not code."；"Avoid the Zone."（并有例外）；Writer's Block / Debugging / Pacing Yourself / Being Late / Help | 2011 | 保留 | 仅转述 |
| 练习 | Coder Ch6 Practicing（Coding Dojo、Broadening Your Experience） | 2011 | 保留 | 目录层 |
| 验收测试作为需求沟通 | Coder Ch7 "Communicating Requirements / Acceptance Tests"；2e Ch16 "The Acceptance Testing Discipline"；Craft Ch8 | 2011 | 保留（并入 2e） | 目录层 |
| 测试策略 | Coder Ch8 "QA Should Find Nothing"、"The Test Automation Pyramid" → Craft Ch10 "QA Will Find Nothing"、"We Will Not Dump on QA"、"Test Automation"、"Testing the User Interface" | 2011 | 保留 | 目录层（已复核目录） |
| 时间管理 | Coder Ch9（Meetings / Focus-Manna / Time Boxing and Tomatoes / Avoidance / Blind Alleys / Marshes, Bogs, Swamps）；Craft Ch13 "Maintain High Productivity"；2e Ch33（Viscosity / Managing Distractions / Time Management） | 2011 | 保留 | 目录层（已复核目录） |
| 压力 | Coder Ch11 "Avoiding Pressure / Handling Pressure"；2e Ch35 "Pressure" | 2011 | 保留 | 目录层 |
| 协作与团队 | Coder Ch12–13（Programmers versus People / Does It Blend?）；Craft Ch14 "Work as a Team"；2e Ch34（Collaborative Programming / Open/Virtual Office） | 2011 | 保留 | 目录层 |
| 师徒与工艺 | Coder Ch14 Mentoring, Apprenticeship, and Craftsmanship；Craft Ch11 "Mentoring"；播客 2026-07-22："young people … should spend their first three years writing code. They shouldn't touch agents at all." | 2011 | 保留 + 新增（AI 场景） | 目录层 + 仅转述 |
| 工具 | Coder 附录 A（Source Code Control / IDE / Issue Tracking / Continuous Build / 测试工具 / UML/MDA） | 2011 | 保留 | 目录层 |

### 1.3 工艺：纪律、标准、伦理（Clean Craftsmanship，2021；2e 第四部分沿用）

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 三层结构 | Craft 前言："three levels: disciplines, standards, and ethics"；"The days of 'Judges' are over … whether we programmers will define them for ourselves or have them forced upon us" | Blog 2015-11-27 "Prelude to a Profession" | 保留 | 仅转述 |
| 五项纪律 | Craft Part I：TDD、Refactoring、Simple Design、Collaborative Programming、Acceptance Tests（均出自 XP） | Agile Ch5 | 保留 | 已复核（目录） |
| 标准·生产率 | Craft Ch9：We Will Never Ship S**T / Inexpensive Adaptability / We Will Always Be Ready / Stable Productivity | Blog 2012 "The New CTO" | 保留 | 已复核（目录） |
| 标准·质量 | Craft Ch10：Continuous Improvement / Fearless Competence / Extreme Quality / We Will Not Dump on QA / QA Will Find Nothing / Test Automation / Testing the User Interface | Coder Ch8 | 保留 | 已复核（目录） |
| 标准·勇气 | Craft Ch11：We Cover for Each Other / Honest Estimates / You Must Say NO / Continuous Aggressive Learning / Mentoring | — | 保留 | 已复核（目录） |
| 誓言（十条） | Craft Part III & 2e Part IV：1 Harm（Do No Harm）；2 No Defect in Behavior or Structure（Craft 名 "Best Work"）；3 Repeatable Proof；4 Small Cycles；5 Relentless Improvement；6 Maintain High Productivity；7 Work as a Team；8 Estimate Honestly and Fairly；9 Respect for Fellow Programmers；10 Never Stop Learning | Blog 2015-11-18 九条（无 Respect） | 补充（9→10）、第二条改名 | 已复核（2e 目录） |
| 伦理论据 | Craft Part III：737 Max、Knight Capital、Toyota、VW、Iowa Caucus；"it is the fragile foundation of public trust that is at risk … the regulations will follow"；Blog 2018-03-29 引 Booch "Every line of code represents an ethical and moral decision." | Blog 2015、2019 | 保留 | 仅转述 |
| 誓言第四条·小周期 | 2e Ch31：History of Source Code Control / Continuous Integration / Branches versus Toggles / Continuous Deployment / Continuous Build | Craft Ch13 | 保留 | 已复核（目录） |
| 誓言第五条·持续改进 | 2e Ch32：Test Coverage / Mutation Testing / Semantic Stability / Cleaning / Creations | Craft Ch13；Blog 2016-06-10 变异测试 | 补充（变异测试与语义稳定性入书） | 已复核（目录） |
| 权责在人（AI 场景） | X 2026-05-30："you are the engineer. Useful as the AI's are, they are tools, and they are not accountable."；Rant 2026-09-01："you are still the engineer … still in charge and still responsible" | Rant 2025-12-13："treat it like a kindergartener … cannot be accountable" | 保留 | 已复核 |
| 用词 | Craft 前言：回到单用 "craftsman"（"none of those terms carries the historical gravitas"） | Blog 2018-05-02 采用中性写法 | 改口 | 仅转述 |

---

## 二、架构设计（Clean Architecture 2017；2e 第二、三部分 2025；Functional Design 2023）

### 2.1 价值与范式

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 软件的两种价值 | 2e Ch23 "The Two Values of Software / Keeping Options Open"；CA Ch2：Behavior 与 Architecture，"The Greater Value"，Eisenhower 矩阵，"Fight for the Architecture" | CA 2017 | 保留 | 已复核（目录） |
| 架构的目标 | Blog 2016-01-04："The important decisions that a Software Architect makes are the ones that allow you to NOT make the decisions about the database, and the webserver, and the frameworks."；CA Ch15 "Keeping Options Open"；2e Ch24 "Leaving Options Open" | CA Ch1 "The Goal?" | 保留 | 仅转述 + 目录 |
| 三种范式 | CA Ch3–6：结构化（去 goto）、OO（去函数指针，"Encapsulation? Inheritance? Polymorphism?" 各打问号）、函数式（去赋值，"Immutability and Architecture / Segregation of Mutability / Event Sourcing"）；每种范式是「拿走一种能力」 | CA 2017 | 保留 | 目录层（已复核目录） |
| OOP 的定义 | Rant 2025-05-02："a set of collaborating nodes called objects … The sender of a message neither knows nor cares how the receiver will respond"；封装、继承、多态 "are not definitional. They are language facilities."；"object models … are models of application behavior"，不是真实世界；对象可不可变 | CA Ch5 | 修正（去掉三要素定义） | 已复核（转写） |
| 封装边界画在哪 | Rant 2025-07-21（评 Muratori）："wrap the policies in encapsulation boundaries, not necessarily all the nouns"；自述 1980 年代按「建模真实世界」写细粒度对象 "doesn't work" | CA Ch5 | 补充（明确反对名词建模） | 已复核（转写） |
| FP 与 OO | Blog 2018-04-13："There is no FP vs OO … a good functional program can (and should) be object oriented"；Blog 2023-01-18/19：函数式程序也应按「类」（内聚函数集 + 内部数据结构）划分，无需 class 关键字、多态、继承 | Blog 2017 | 保留 | 仅转述 |
| 函数式基础 | FD Part I：Immutability / Persistent Data / Recursion and Iteration / Laziness / Statefulness（"When We MUST Mutate"、STM）；Blog 2021-10-28 不可变列表更新的重复代价 | — | 新增（2023） | 目录层（仅转述） |

### 2.2 设计原则（SOLID）

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| SOLID 的地位 | Blog 2020-10-18："The SOLID principles remain as relevant to day as they were in the 90s … Software is still if statements, while loops, and assignment statements"；"The best way to make a complicated mess is to tell everyone to 'just be simple' and give them no further guidance." | 1990s；CA Part III | 保留 | 已复核 |
| SOLID 怎么用 | Rant 2025-10-26："probably 80% after the fact … in a refactoring sense"；"first make it work then make it right"；"conformity is not the goal … pure conformance is never the goal"；"I do write about this in the second edition" | CA 2017 | 加限定（事后重构、不求完全合规） | 已复核（转写） |
| SRP | Blog 2020："Gather together the things that change for the same reasons. Separate things that change for different reasons."；"Microservices do not solve this problem."；2e Ch3 以利益相关方为变化来源；CA Ch7（Symptom 1: Accidental Duplication / Symptom 2: Merges） | 1e、Blog 2014 "the reasons for change are people"；CA "responsible to one, and only one, actor"（原句仅搜索摘要） | 收窄到「人／角色」 | 已复核（博客、2e） |
| OCP | Blog 2020："A Module should be open for extension but closed for modification … Simple code is both open and closed."；CA Ch8（A Thought Experiment / Directional Control / Information Hiding）；Blog 2014-05-12 以插件架构论证 | 1990s | 保留 | 已复核（博客） |
| LSP | Blog 2020："People (including me) have made the mistake that this is about inheritance. It is not. It is about sub-typing. … All duck-types are subtypes of an implied interface."；CA Ch9（Guiding the Use of Inheritance / Square-Rectangle / LSP and Architecture） | CA 2017 及更早以继承讲 | 修正（作者自我纠正） | 已复核（博客） |
| ISP | Blog 2020："Keep interfaces small so that users don't end up depending on things they don't need."；"especially acute in statically typed languages … Dynamically typed languages are affected much less"；"such separation is often not feasible, nor even desirable."；CA Ch10（ISP and Language / ISP and Architecture） | CA 2017 | 加限定 | 已复核（博客） |
| DIP | Blog 2020："Depend in the direction of abstraction. High level modules should not depend upon low level details."；2e Ch3："For small projects, you could be right to make that decision. But for larger projects, the recompile and redeployment burden can get pretty large."；CA Ch11（Stable Abstractions / Factories / Concrete Components）；与 Muratori 共识：DIP 在库与插件边界有价值 | CA 2017 | 加限定（小项目可不做） | 已复核（博客、2e） |
| SOLID 在函数式下 | FD Ch12 逐条讲 SRP/OCP/LSP/ISP/DIP；Blog 2023-01-18："the rules don't change just because you've chosen to use immutable data structures." | — | 新增（2023） | 目录层 + 仅转述 |

### 2.3 组件原则

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 组件是什么 | CA Ch12（A Brief History of Components / Relocatability / Linkers）；2e Ch20 "Components / A Brief History of Components" | CA 2017 | 保留 | 已复核（目录） |
| 内聚三原则 | CA Ch13：Reuse/Release Equivalence、Common Closure、Common Reuse，及三者的张力图；2e Ch20 "Component Cohesion"；uml-viewer README（2026-09）："I tell my agent to group modules into components by the Common Closure Principle." | CA 2017 | 保留（CCP 成为他给 agent 的分组准则） | 已复核（目录、README） |
| 耦合三原则 | CA Ch14：Acyclic Dependencies、Stable Dependencies、Stable Abstractions；Top-Down Design；2e Ch20 "Component Coupling" | CA 2017 | 保留 | 已复核（目录） |

### 2.4 架构

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 架构是什么 | CA Ch15：服务于 Development / Deployment / Operation / Maintenance，核心是 Keeping Options Open、Device Independence | CA 2017 | 保留 | 已复核（目录） |
| 独立性 | CA Ch16：按 Use Cases / Operation / Development / Deployment 解耦；Decoupling Layers / Use Cases / Mode；Independent Develop-ability / Deployability；Duplication（真假重复）；2e Ch24 同结构 | CA 2017 | 保留 | 已复核（目录） |
| 画边界 | CA Ch17：What Lines Do You Draw, and When?；Plugin Architecture；2e Ch25 "Architectural Boundaries"（Plug-in Architecture、Case Study: FitNesse） | Blog 2014 | 保留 | 已复核（目录） |
| 边界的形态 | CA Ch18：Boundary Crossing / The Dreaded Monolith / Deployment Components / Threads / Local Processes / Services | CA 2017 | 保留 | 目录层 |
| 策略与层次 | CA Ch19 "Policy and Level"：层次 = 离输入输出的距离；2e Ch3 "High-level policy should not depend on low-level details." | CA 2017 | 保留 | 已复核（2e）+目录 |
| 业务规则 | CA Ch20：Entities / Use Cases / Request and Response Models | CA 2017 | 保留 | 目录层 |
| 尖叫的架构 | CA Ch21：架构应表达用例而不是框架；"Frameworks Are Tools, Not Ways of Life"；Testable Architectures | Blog 2011-09-30 | 保留 | 目录层 |
| 依赖规则 | 2e Ch27 "The Dependency Rule"；2e Ch3 "dependencies cross only toward the higher-level side"；CA Ch22 "Source code dependencies must point only inward, toward higher-level policies."；uml-viewer（2026-09）把违反依赖规则的边标红 | Blog 2012-08-13 "source code dependencies can only point inwards" | 保留（工具化） | 已复核（2e、README；CA 原句仅转述） |
| Presenter 与 Humble Object | CA Ch23：Humble Object Pattern、Presenters and Views、Database Gateways、Data Mappers、Service Listeners；Blog 2018-08-13 承认调 UI 时会临时合并 presenter 与 view，"Worse is Better" | CA 2017 | 保留 + 自认破例 | 目录层 + 已复核（博客） |
| 部分边界 | CA Ch24：Skip the Last Step / One-Dimensional Boundaries / Facades | CA 2017 | 保留 | 目录层 |
| 层与边界 | CA Ch25（Hunt the Wumpus 例：Crossing / Splitting the Streams） | CA 2017 | 保留 | 目录层 |
| Main 组件 | CA Ch26 "The Ultimate Detail"：Main 是最低层插件 | CA 2017 | 保留 | 目录层 |
| 服务与微服务 | Rant 2025-05-12："A service is a function … There is no such thing as a service-oriented architecture. There is a service-oriented deployment, but not an architecture … never use services or microservices for the purpose of decoupling."；CA Ch27（Service Architecture? / Service Benefits? / The Kitty Problem / Component-Based Services / Cross-Cutting Concerns）；Blog 2014-09-19、10-01："Treat the deployment model as a detail" | Blog 2014 | 保留 | 已复核（转写）+目录+仅转述 |
| 测试边界 | CA Ch28：Tests as System Components / Design for Testability / The Testing API | CA 2017 | 保留 | 目录层 |
| 嵌入式 | CA Ch29 Clean Embedded Architecture（App-titude Test / Target-Hardware Bottleneck） | CA 2017 | 保留 | 目录层 |
| 数据库是细节 | CA Ch30（"What If There Were No Disk?"、"But What about Performance?"）；Rant 2025-05-01："there is no impedance mismatch … An ORM is … a data structure hydrator … Low level things like ORMs should depend on high level things like business objects … across any architectural boundary, the data structures live on the high level side."；Rant 2025-04-30 SQL 是 "bloated old arcane syntax" | Blog 2016 "The database is merely an IO device."；Blog 2017-12-09 Dbtails | 保留 | 已复核（转写）+目录 |
| Web 是细节 | CA Ch31 "The Endless Pendulum" | CA 2017 | 保留 | 目录层 |
| 框架是细节 | CA Ch32："Asymmetric Marriage"、The Risks、The Solution（不嫁给框架） | CA 2017 | 保留 | 目录层 |
| 包组织 | CA Ch34 "The Missing Chapter"（Simon Brown）：Package by Layer / by Feature / Ports and Adapters / by Component；"Organization versus Encapsulation" | CA 2017 | 保留 | 目录层 |
| 持续设计 | 2e Ch21 "Continuous Design"：Continuous Change / Continuous Design / "the Four Cs of Continuous Design" / When Else Do We Design? | — | 新增（2e） | 目录层（已复核目录） |
| 架构归人（AI 场景） | X 2026-03-07："Architecture remains, so far, in the realm of human judgement … Don't trust the AIs to create the architecture."；2e p.69 Future Bob：LLM "not adept at understanding higher architectural goals"；X 2026-09-11："I have had long debates with grok and codex about the structure of systems … I have, more than once, found myself agreeing with their views." | — | 新增，后收窄 | 已复核 |
| 依赖检查工具化 | dependency-checker（2026-03）、arch-view（2026-03）、uml-viewer（2026-09）：依赖方向机械检查、按 CRAP／变异着色、可对 agent 下达结构改动 | — | 新增（2026） | 已复核 |
| 设计模式 | FD Part V Ch16 "Design Patterns Review"（Abstract Server / Adapter / Command / Composite / Decorator / Visitor / Abstract Factory；"Postscript: OO Poison?"）；Rant 2025-05-10 讽刺「设计模式毁掉程序员」的说法："it presents a more refined view of all the crappy solutions you were trying to discover by yourself" | Agile Software Development（2002） | 保留 | 目录层 + 已复核（转写） |
| 类型系统 | Rant 2025-05-08：静态与动态 "They're both wrong … the answer … is to check your types at test time."；Blog 2021-06-25/29：偏好动态类型 + 按需契约（clojure/spec 的 DBC）；Blog 2017-01-13："type systems do not decrease the testing load. Not even the tiniest bit."；AIR-J（2026-03）给机器的语言要求显式类型与效应 | Blog 2016 "You don't need static type checking if you have 100% unit test coverage" | 修正 | 已复核（转写、README）+仅转述 |
| 数据流 | FD Ch11 Data Flow | — | 新增（2023） | 目录层 |
| 并发 | 2e Ch22：Why Concurrency? / Concurrency Defense Principles / "2025 Update and Report from the Field"；1e Ch13 + Appendix A（Know Your Library / Execution Models / Beware Dependencies Between Synchronized Methods / Keep Synchronized Sections Small / Shut-Down / Testing Threaded Code）；FD Part IV Concurrency | 1e 2008 | 更新（2025 现场报告，内容未读） | 目录层（已复核目录） |

---

## 三、代码编写（Clean Code 2e 第一部分 2025；Craftsmanship 纪律 2021；相关博客与视频）

### 3.1 总纲

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 原则的地位 | 2e p.41："these are not strict laws. They are not rules that must be followed. They are, more or less, guidelines. Each should be applied in the context of the problem at hand"；X 2026-03-21（对 AI）："all rules are more like guidelines" | 1e："We will present these opinions as absolutes, and we will not apologize for our stridence." | 收窄 | 已复核 |
| 一句话总纲 | 2e Ch3 "Everything Small, Well Named, Organized, and Ordered"；"you'll be 90% of the way toward cleaning code" | 1e Ch1 多位名家对 clean code 的定义 | 新增 | 已复核 |
| 读多于写 | 2e Ch1 "We Read More Than We Write" | 1e "We Are Authors"："the ratio of time spent reading vs. writing is well over 10:1" | 保留 | 已复核（目录）|
| 童子军规则 | 2e Ch1 "The Boy Scout Rule"；Rant 2025-05-09："now because you have tests you can follow the Boy Scout rule … Leave the code cleaner than you found it every single time" | 1e | 保留 | 已复核 |
| 先跑通再弄对 | Rant 2025-05-15："We're only smart enough to get bad code working. And then after it's working, we could clean it … First, make it work, then make it right. The only way to go fast is to do a good job."；不必向老板要清理的许可（"a cowardly move"） | 1e Ch16 "First, Make It Work / Then Make It Right" | 保留 | 已复核（转写） |
| 太干净 | Blog 2018-08-13：接受 "livable code"，"there are also little places where I break the rules specifically because those breakages create affordances for transient issues" | — | 加限定 | 已复核 |
| 会有代码 | 2e Ch1 "There Will Be Code"（p.2–3 索引显示加入了 AI 提示与需求规格）；1e："specifying requirements in such detail that a machine can execute them is programming. Such a specification is code." | 1e 2008 | 保留（AI 段落未读） | 已复核（目录）+仅转述 |
| 整洁与 AI 的关系 | X 2026-05-14："Clean Code was never about syntax. It was always about structure … If we, who pilot agents, disengage from syntax, we are not disengaging from structure. The Clean Code principles still apply."；X 2026-09-21："All the old principles still apply. All the same consequences still accrue. The bigger the mess, the longer the time." | — | 新增 | 已复核 |

### 3.2 命名

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 命名各条 | 2e Ch4 "Meaningful Names"：Use Intention-Revealing Names … Final Words（目录只列首末）；1e Ch2 全部小节：Use Intention-Revealing Names / Avoid Disinformation / Make Meaningful Distinctions / Use Pronounceable Names / Use Searchable Names / Avoid Encodings / Avoid Mental Mapping / Class Names（名词）/ Method Names（动词）/ Don't Be Cute / Pick One Word per Concept / Don't Pun / Use Solution Domain Names / Use Problem Domain Names / Add Meaningful Context / Don't Add Gratuitous Context | 1e | 保留（2e 正文未读） | 已复核（两版目录） |
| 命名与问题规模 | 2e Ch3 p.58："When the problem is small, names can afford to be inconsistent or vague … But as the problem grows, names become much more important" | — | 加限定 | 仅转述（样章在库，未逐句核） |
| 站在读者头脑里 | 2e Ch3："work hard to put yourself in the headspace of those who do not understand the code" | 1e | 保留 | 仅转述 |
| 对 agent | Rant 2026-05-06：管理者要 "skim the code … looking at … the names of some of the methods and the number of arguments"；Rant 2026-05-20："Looks like they've got good names." | — | 新增 | 已复核（转写） |

### 3.3 函数

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 小 | 2e Ch3 p.42："Functions should be small. Most should be just a handful of lines."；2e Ch7 "Small!"；X 2026-08-12："Small well named functions (although not as small for agents as for humans.)" | 1e Ch3 "Small!"（自述无研究支持） | 保留 + 加限定（agent 尺度更大） | 已复核 |
| 只做一件事 | 2e Ch10 "One Thing"（Extract Method Refactoring / "What Are Large Functions Anyway?"）；2e Ch3 "It ensures that each function does one, and only one, thing." | 1e "Do One Thing" | 保留 | 已复核 |
| 过度拆分的代价 | 2e Ch3 p.68："adding structure adds complexity—and that complexity is not free. There's a cognitive price to pay."；辩论："it is possible to over-decompose, and that Clean Code 1st ed. doesn't provide much guidance on how to recognize over-decomposition"；2e Ch8 "This Is Too Much to Constantly Keep in Mind" | 1e 无 | 加限定 | 已复核 |
| 每函数一个抽象层级 / 自顶向下 | 2e Ch7 "Reading Code from Top to Bottom: The Stepdown Rule"；Ch11 "Be Polite"（The Newspaper Metaphor / The Stepdown Rule: Once Again / The Abstraction Roller Coaster / "This Is How We Write, but Not How We Want to Read"） | 1e "One Level of Abstraction per Function" | 保留 | 已复核（目录） |
| switch | 2e Ch7 "Switch Statements"；Ch12 "Switch Statements / The OO/Procedural Trade-off"；Blog 2021-03-06 用工厂+多态让 if/else 链只出现一次；与 Muratori 的条件规则："When operations proliferate more rapidly than types we both use switches. When types proliferate more rapidly than operations we both use dynamic dispatch." | 1e | 保留 + 加条件 | 已复核（目录、问答）+仅转述 |
| 参数 | 2e Ch8 "Function Arguments"；1e：越少越好、避免标志参数、参数对象 | 1e | 保留（2e 正文未读） | 目录层 |
| 命令查询分离 | 2e Ch8 "Command Query Separation" | 1e | 保留 | 目录层 |
| 异常优于错误码 | 2e Ch8 "Prefer Exceptions to Returning Error Codes"；1e Ch7 Error Handling 全部小节（Use Exceptions Rather Than Return Codes / Write Your Try-Catch-Finally Statement First / Use Unchecked Exceptions / Provide Context with Exceptions / Define Exception Classes in Terms of a Caller's Needs / Define the Normal Flow / Don't Return Null / Don't Pass Null） | 1e | 收窄（2e 无独立错误处理章；1e 其余各条是否保留待验证） | 已复核（两版目录） |
| DRY | 2e Ch8 "DRY: Don't Repeat Yourself"；2e Ch18 "Minimize Duplication"；Craft Ch6；Blog 2021-10-28 承认函数式下不可变更新会带来重复；swarm-forge 宪法把 DRY 做成工具（dry4clj/go/java）并且 "IO-near modules must not reimplement a domain question … Walking the same facts again is a defect even when the dependency arrow already points inward." | 1e | 保留（工具化） | 已复核 |
| 无副作用 | 2e Ch8 "Side Effects"；1e "Have No Side Effects"；对 Axol 的回应："if the word 'purity' is to have a useful meaning it must be an external attribute of a function unrelated to its implementation. You may not like the fact that I use instance variables as a proxy for function arguments" | 1e | 保留（纯度定义为外部属性，有争议） | 目录层 + 仅转述 |
| 结构化编程 | 2e Ch8 "Structured Programming"；2e Ch30 "Repeatable Proof"（Dijkstra / Structured Programming / Functional Decomposition / TDD et al.）；X 2025-08-19："we are still creating recursive structures of sequence, selection, and iteration" | 1e | 保留 | 已复核（目录、推文） |
| 怎么写出这样的函数 | 2e Ch9 "The Clean Method"（Make It Right / Example）；1e "How Do You Write Functions Like This?"（先写糙再重构） | 1e | 保留 | 目录层 |
| 性能 | 2e Ch3："Is the new structure slower than the old one? Probably so … For most applications, that tiny decrease in performance would be of no concern at all."；2e Ch12 "But What About Performance?"；问答 2023："Frankly, I think that's a fair criticism."；"If you are trying to squeeze every nanosecond from a battery of GPUs, then Clean Code may not be for you" | 1e 未论 | 加限定 | 已复核 |

### 3.4 注释

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 注释是失败的补偿 | 2e Ch5 "Compensating for Failure / Good Comments / Bad Comments"；索引保留 "Comments Do Not Make Up for Bad Code"；辩论："I look at every comment as potential misinformation." | 1e Ch4 | 保留 | 已复核（目录）+仅转述 |
| 必要注释 | Blog 2017-02-23："every comment represents a failure … I have found this kind of thing to be relatively rare."；辩论让步：公共 API 需要注释，团队内部接口不必 | 1e "Good Comments" | 加限定 | 仅转述 + 已复核（辩论） |
| 对 agent | X 2026-06-19："When agents are the audience, I tolerate slightly larger functions, and slightly more comments." | — | 新增 | 已复核 |

### 3.5 格式

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 格式 | 2e Ch6：The Purpose of Formatting / Vertical Formatting / Horizontal Formatting / Team Rules / Uncle Bob's Formatting Rules | 1e Ch5 同名 | 保留（未见变化） | 已复核（两版目录） |
| 语法 vs 结构（AI 场景） | Rant 2026-05-06："we do not need to keep control over the parentheses and the braces … The syntax goes away from our point of view." | — | 新增（格式交给 agent） | 已复核（转写） |

### 3.6 对象、数据结构、类、边界

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 对象与数据结构反对称 | 2e Ch12：What Is an Object? / Data Abstraction / Data/Object Antisymmetry / The Law of Demeter / Data Transfer Objects / Switch Statements / The OO/Procedural Trade-off；Blog 2019-06-16："Classes make it easy to add types but hard to add functions. Data structures make it easy to add functions but hard to add types." | 1e Ch6 | 保留 | 已复核（目录）+仅转述 |
| Demeter 法则 | 2e Ch12 "The Law of Demeter" | 1e | 保留 | 目录层 |
| 类 | 2e Ch13 "Clean Classes"：Classes and Modules versus Files / What Should a Class Contain? | 1e Ch10：Classes Should Be Small!（按职责数）/ Organizing for Change | 保留（2e 正文未读） | 已复核（两版目录） |
| 第三方边界 | 2e Ch26 "Clean Boundaries"：Third-Party IoT Framework / UI/Application Boundary；1e Ch8 Boundaries：Using Third-Party Code / Learning Tests / Using Code That Does Not Yet Exist / Clean Boundaries | 1e | 保留（升入架构部分） | 已复核（两版目录） |
| 系统 | 1e Ch11 Systems：Separate Constructing a System from Using It / 依赖注入 / Test Drive the System Architecture / Optimize Decision Making / Use Standards Wisely / DSL；2e 无独立 Systems 章，内容并入 Part II–III | 1e | 收窄（并入） | 已复核（两版目录） |

### 3.7 测试与纪律

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 为什么测试 | Rant 2025-06-03："a testing discipline like test driven development is double entry bookkeeping … Little test, little code, execute zero … in tiny little steps"；"integration tests are not sufficient … software … goes wrong deep down in the weird stuff" | Blog 2017-03-07 "Symmetry Breaking" | 保留 | 已复核（转写） |
| 三种纪律并列 | 2e Ch14：Discipline 1 TDD / Discipline 2 TCR（Test && Commit ‖ Revert）/ Discipline 3 Small Bundles；辩论："bundling can produce outcomes just as good as TDD but think it may lead to somewhat less test coverage" | 1e Ch9 "The Three Laws of TDD"；Coder Ch5 "The Jury Is In" | 收窄（TDD 从唯一变为三选一） | 已复核（目录、辩论） |
| TDD 三定律 | Craft Ch2–3（The Basics、Getting Stuck、Arrange-Act-Assert、Test Doubles、Architecture）；Blog 2014 "The Cycles of TDD"（秒级三定律、分钟级红绿重构、小时级架构检查） | 1e | 保留 | 目录层 + 仅转述 |
| TDD 的收益在哪 | Blog 2016-11-10："The benefit of writing the tests first is disciplinary. Writing the test first keeps your cycles short"；"The really effective part of TDD is the size of the cycle, not so much whether you write the test first." | Coder "The Jury Is In" | 加限定 | 仅转述 |
| TDD 与架构 | Blog 2017-03-03："architecture does not emerge from TDD … It is not TDD that creates bad designs. It is not TDD that creates good designs. It's you." | — | 加限定 | 仅转述 |
| 测试与代码的结构 | Blog 2017-10-03 "Test Contra-variance"："The structure of the tests must not reflect the structure of the production code"；测试越来越具体、生产代码越来越通用 | — | 保留 | 仅转述 |
| 对 agent 的 TDD | X 2026-07-30："TDD is a human discipline. I don't expect agents to follow it. I DO expect agents to write unit tests as carefully and comprehensively as a human would, and I ensure that by running coverage, crap, and mutation tests."；X 2026-08-12："I just tell my agents to write failing tests first … They do this tolerably well" | X 2025-06-25："The human must be the pilot of both sides." | 收窄（对象分开） | 已复核 |
| 清洁的测试 | 2e Ch15 "Clean Tests"：Domain-Specific Testing Language / F.I.R.S.T. / Test Design；1e "One Assert per Test"（2e 目录不再出现，是否删除待验证）；Blog 2017-05-05："Keep your tests clean. Treat them as first-class citizens of the system." | 1e Ch9 | 保留（一处待验证） | 已复核（两版目录） |
| 测试设计 | Craft Ch4：Testing Databases / Testing GUIs / Test Patterns / Test Design / Transformation Priority Premise；Craft Ch3 Test Doubles（自称不用 mocking 工具，手写 test double，Blog 2017-05-05） | — | 保留 | 目录层 + 仅转述 |
| 验收测试 | 2e Ch16 "The Acceptance Testing Discipline"；Craft Ch8（The Discipline / The Continuous Build）；Rant 2026-04-21："You must provide an unbreakable law for the behavior of the system … acceptance tests that are executed outside of the processing of the AI"；Acceptance-Pipeline-Specification（Gherkin → JSON IR → 生成测试 → 变异示例值） | Coder Ch7 | 保留（工具化）；2026-09-18 自认 "overusing gherkin" | 已复核 |
| 覆盖率 | 2e Ch32 "Test Coverage"；X 2026-08-21："High, meaningful coverage is within easy reach of even the most casual projects … it's tantamount to adolescent carelessness to ignore it."；Rant 2026-04-20："it doesn't mean the code works. It just means it's executing." | Blog 2016 "100% coverage" | 保留 + 加限定（覆盖率不等于正确） | 已复核 |
| 变异测试与语义稳定性 | 2e Ch32 "Mutation Testing / Semantic Stability"；X 2026-02-22："It vastly increases the semantic stability of the code."；X 2026-09-11："These tools still find bugs and offer useful constraints, though they can leave scars." | Blog 2016-06-10（对测试后写套件的让步） | 补充 → 修正（承认留疤） | 已复核 |
| 测试比代码难改 | X 2026-08-03："make it harder to change the tests than the code … three streams of tests … The first two are mutation tested to tightly lock them into the existing code." | — | 新增（AI 场景） | 已复核 |
| 属性测试、性能测试、抖动测试 | Rant 2026-07-26 "20X"："You'll write property tests, you'll write performance tests. If there's multi-threaded code, you will write jitter tests"；swarm-forge 宪法把属性测试与常规验证分开 | FD Part IV "Property-Based Testing" | 补充 | 已复核 |
| 类型在测试时检查 | Rant 2025-05-08："check your types at test time." | Blog 2016–2021 | 修正 | 已复核（转写） |

### 3.8 重构与简单设计

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 重构 | Craft Ch5：What Is Refactoring? / The Basic Toolkit / The Disciplines；X 2026-06-19："Refactoring is the act of changing the structure of code to be more consumable. But consumable by whom? If the audience is humans, we re-factor to human standards. If the audience is agents, we re-factor to agent standards." | Agile Ch5 | 保留 + 新增（对象分开） | 目录层 + 已复核 |
| 简单设计四条 | 2e Ch18：YAGNI / Covered by Tests / Maximize Expression / Minimize Duplication；Craft Ch6 另有第五条 "Minimize Size" | 1e Ch12 Emergence：Runs All the Tests / No Duplication / Expressive / Minimal Classes and Methods | 修正（YAGNI 入首位；"Minimal Classes and Methods" 不在 2e 标题） | 已复核（目录） |
| YAGNI | 2e Ch3 p.56–57："the original intent of YAGNI was to ask yourself: 'What if you aren't going to need it?' It was a way of asking us to count the cost" | XP 原义 | 修正（改为成本核算） | 已复核 |
| 代码为什么腐烂 | Rant 2025-05-09：因为没有测试就不敢碰，"That is why code rots … because you are afraid of it" | 1e Ch1 "The Total Cost of Owning a Mess" | 保留 | 已复核（转写） |
| 坏味道清单 | 1e Ch17 "Smells and Heuristics"（Comments / Environment / Functions / General / Java / Names / Tests）；2e 无同名章（是否并入待验证） | 1e | 待验证 | 已复核（两版目录） |
| 案例重构 | 2e Ch2 "Clean That Code!"（含 Postscript "Future Bob Playing with Grok3"：Grok3 能通过全部测试但 "did not invert the dependencies"）；1e Ch14–16 Args / JUnit / SerialDate | 1e | 更新（AI 参与） | 已复核（目录、样章 p.69） |

### 3.9 函数式编码

| 条目 | 最新表述 | 更早表述 | 状态 | 复核 |
|---|---|---|---|---|
| 不可变优先 | FD Ch1–2 Immutability / Persistent Data；CA Ch6 "Segregation of Mutability" | CA 2017 | 保留 | 目录层 |
| 递归与惰性 | FD Ch3–4 | — | 新增 | 目录层 |
| 何时必须可变 | FD Ch5 "Statefulness / When We MUST Mutate / STM" | — | 新增 | 目录层 |
| REPL 与测试 | Blog 2020-05-27："REPL driven development feels easier and faster than TDD; but it is not."；FD Ch13 "But What about the REPL? / What about Mocks?" | Blog 2017-10-04 "You don't test things in the REPL; you try things in the REPL." | 保留 | 仅转述 |
| 学 Clojure | Blog 2017-07-11 "Functional programming is important. You should learn it. … I suggest Clojure."；Blog 2019-08-22 "the future is looking very functional to me" | — | 保留 | 仅转述 |

---

## 未列入本表的原因

- 2e 第 17 章 "AIs, LLMs, and God Knows What / Programming by Prompt"、第 14 章正文、第 5 章正文、第 22 章「2025 现场报告」、Functional Design 与 We Programmers 的正文：未取得，只在上表以目录层出现。
- Clean Agile 第 6 章的教练与认证正文、第 7 章 "The Agile Hangover"（Sandro Mancuso 撰写，不是 Martin 的话）：未列。
- 他对 agent 时代的方法论不按条目列在这里，见 [ai-coding-method-2026-09.md](ai-coding-method-2026-09.md)。
