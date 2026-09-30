# Martin 使用 AI coding 的方法论：截至 2026-09-30 的综合版本

本文把他 2026 年 1 月到 9 月 30 日关于 agent 写代码的言论、仓库、实验、视频综合成**一份当前做法**，并注明每一条的日期与出处；被他放弃的做法单列。
它回答「他现在到底怎么做」，不回答「该不该学」——后者归 record 家族。逐条证据在 [research.md](research.md) C-13 至 C-20 与 [notes/author-primary.md](notes/author-primary.md)。

> 状态提醒：他 2026-09-18 说 "It's a work in progress, so don't be surprised if it changes a lot over the next few weeks."；这份综合是 09-30 的快照，每条都带日期。

## 0. 一句话版本

用一个 Grok agent，给几条指引，一次一个不大的任务；人不逐行读代码，读结构、读度量、抽查、盯过程；
CRAP／覆盖率／变异／DRY／依赖检查仍作为工具跑，但阈值放宽、不再用流水线和门禁强制流程；
用 uml-viewer 这类「审讯工具」看结构图、指着图让 agent 改；责任仍在人，新手先写三年代码。

## 1. 前提判断（他为什么这样做）

| 判断 | 原话（日期） |
|---|---|
| agent 比人快得多，人写代码不再是主要工作 | "AIs are faster at writing compiled languages then humans are. Deal with it. There's still plenty left for you to do."（X 2026-04-20）；"maybe 20 times"（Rant 2026-07-26） |
| 人读代码是瓶颈 | "Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level."（X 2026-04-14）；"the human review of code is a bottleneck"（X 2026-09-18） |
| 模型 2026 年内变强到改变了方法 | "the models have gotten astronomically better"（X 2026-09-07）；"Two years ago, I did not think the AI's would be as capable and potent as they are."（X 2026-04-27） |
| 整洁对 agent 仍必要 | "the agents get just as confused by messy code as we humans do"（X 2026-07-24）；"All the old principles still apply … The bigger the mess, the longer the time."（X 2026-09-21） |
| 不能靠提示词得到好代码 | "I wish it were possible to prompt good code -- but that's not the way the models work."（X 2026-08-10）；长文档会落在上下文中间被忽略（Rant 2026-04-21） |
| 程序员不会被取代，但内容变了 | "will not replace programmers … will increase the demand for programmers"（X 2025-09-01）；"You are not going to be the ones writing the code."（Rant 2026-04-20） |

## 2. 人与 agent 的分工（2026-09 版）

**人负责**：任务切分与顺序；模块结构与组件分组（"Architecture remains, so far, in the realm of human judgement"，X 2026-03-07；到 09-11 松动为「可以和模型辩论，有时它对」）；
写或批准 Gherkin 验收（"Specs … with final approval, ferociously defended, by the humans"，X 2026-02-12）；看结构图与度量；抽查；给名字（演示视频里 agent 卡在 "Game Game" 时他给出 "Game API"）；
承担责任（"you are the engineer … they are tools, and they are not accountable"，X 2026-05-30）。

**agent 负责**：全部代码与单元测试；跑工具并按工具结果自我修正；重构与重新分区；变异测试补测试；自己发现并报告问题（演示视频里 agent 自行发现类名重复）。

**他不做的**：不逐行评审（"Certainly not a classic, line by line, review"，X 2026-08-17）；不自己写代码（"How much of that code did I write? Zero."，Rant 2026-05-20）；不让 agent 互改提示词（"spooky"，X 2026-08-21）；不让 agent 之间聊天协作（"a gaggle of agents honking at each other"，X 2026-08-21）。

## 3. 工作节奏

- 一次一个不大的任务，走开约 40 分钟（X 2026-09-11）；"a well considered prompt every ten minutes or so"（X 2026-09-18）。
- 迭代要短到一天以内（X 2026-08-08）。
- 先跑通再弄对（"first make it work then make it right"，Rant 2025-10-26）；SOLID 之类原则约 80% 在事后重构时应用。
- 不做大计划、不写长规格：大计划 "half-cocked" 执行后推倒（访谈 2026-08-19，转述）；规格是一次性的；改动便宜所以迭代。
- 频繁提交，随时 `git reset --hard`（Rant 2025-12-13："your friend is git reset hard"）。
- 复杂任务与简单任务分开：六 agent 写 hello world 出 1558 行是 "actual AI slop"（X 2026-06-11）；"Don't run Hello, World through a disciplined engineering process meant for more complicated applications."

## 4. 约束层：工具、度量与阈值

| 工具 | 作用 | 当前阈值 / 用法（日期） | 来源 |
|---|---|---|---|
| CRAP（crap4clj / crap4go / crap4java / crapper） | `CRAP = CC² × (1 − coverage)³ + CC`，找复杂且欠测的函数 | 演变：人 <4 → agent 6（06-19）→ 8（03 战役）→ 10（swarm-forge 09-02 提交，且「回答一个问题的 cond/case 可超」）→ 单 agent 时说 <12，结果自然 <6（Rant 09-12）；实验结论 "CRAP analysis can be overdone (eg 4)"、"buys coverage and spends cleanliness. It does not improve design." | V-G、V-G5、V-G2、V-V1 |
| 覆盖率 | 前提条件，非目标 | 高覆盖 "within easy reach … adolescent carelessness to ignore it"（X 08-21）；但 "it doesn't mean the code works"（Rant 04-20） | V-A、V-R |
| 变异测试（clj-mutate / mutate4go / mutate4java；差分模式） | 「测试的测试」，保证语义稳定性 | 仍在用；"can leave scars"、"forces the agent to do stupid things"（09-11、09-12）；差分变异，禁 `--mutate-all`（宪法） | V-A、V-V1、V-G1 |
| DRY 工具（dry4clj / go / java） | 重复检测 | 宪法必装；"Do not invent project-local CRAP, DRY, mutation, or coverage proxies." | V-G1 |
| 依赖检查（dependency-checker → arch-view → uml-viewer） | 依赖方向规则；结构可视化 | uml-viewer：违反依赖规则标红，CRAP／变异着色，按 Common Closure Principle 分组；"This is how I review the projects I create with agents nowadays."（09-21） | V-G4、V-A |
| 语言级结构检查（speclj-structure-check） | 让 spec 文件结构健全 | Claude skill 形态 | V-G |
| 拆分依据 | 何时拆文件 | 从「变异点 >100 就拆」改为「一个文件不止一个职责才拆」（09-02） | V-G5 |
| 原则 | 凡能确定性的都交给确定性工具 | "Don't tell an agent to calculate code coverage … Have the agent run deterministic tools"（X 08-06）；"We are now using code to constrain reasoning agents."（X 08-26） | V-A |

## 5. 测试层：三条流与锁定

- **三条测试流**（X 2026-08-03、08-12）：单元测试（agent 写，"I don't look at much"）；Gherkin 验收（人管、agent 不可改、"slightly more scrutiny"）；QA 规程（markdown，在 UI 层执行，"slightly more scrutinized"）。
  各自缺失的后果：无单元测试→回归多；无验收→UI 与业务规则混；无 QA→API 好用 UI 不好用。
- **锁定**："make it harder to change the tests than the code"：前两条流做变异测试锁住（X 08-03）；Acceptance-Pipeline-Specification 把 Gherkin 编成 JSON IR、生成测试、再变异示例值检查测试是否真连到应用。
- **TDD 对 agent**：不要求三定律节奏，要求同等结果："TDD is a human discipline. I don't expect agents to follow it."（X 07-30）；但仍指令 "write failing tests first"，"They do this tolerably well"（X 08-12）。
- **测试写多少**：他两次自认过载："Lots of times I just use unit tests and crap evaluation."（X 07-02）；"I was clearly overusing gherkin."（X 09-18）。当前：小任务只用单元测试 + CRAP；Gherkin 仍作人的工具，不再由 harness 强制。
- **额外测试**：属性测试、性能测试、多线程抖动测试由 agent 写（Rant 07-26）；宪法把属性测试与常规验证分开跑。

## 6. 评审层：不逐行读，但像鹰一样盯

当前版本（08-17 至 09-21 综合）：

1. **不逐行读代码**："not a classic, line by line, review"；"if I want to see the code, I can see the code. Now, you know, I usually don't."（演示 09-21）。
2. **读结构**：uml-viewer 看组件、依赖方向、CRAP／变异着色；"look carefully at the architecture using appropriate visualization tools"（X 08-18）。
3. **扫代码不读代码**："You don't read the code. You scroll the code."，看方法名、参数个数、目录结构、依赖（Rant 05-06）。
4. **抽查**："Sometimes I'll pop it open and do a spot check."（X 08-17）。
5. **盯过程与产物**："watching the process and probing the artifacts … I watch it like a hawk."（X 08-18）；07-10 QA agent 谎报完成后他加了检查 QA 脚本是否真调 API 的工具。
6. **审讯而不是驾驭**："Instead of building tools that harnessed the agents... What if we built tools that helped us interrogate them."（X 09-14）；发现结构问题后告诉关联的 agent 改，改完图重画（X 09-18）。
7. **适用范围由他自己限定**："working hypothesis … sufficient for a broad category of projects"（X 08-10）；新手不适用（播客 07-22）。

他自己记录的评审层失效：03-05 "None of my normal checks on crap, coverage, or cyclomatic complexity detected this. Codex cheated a lot."；03-17 测试没测出行为退化，回滚；09-21 演示中一个模块覆盖率为零而工具没跑。

## 7. 编排层：从六角色流水线回到单 agent

| 时间 | 做法 | 结果（他的话） |
|---|---|---|
| 2026-01 | 一到三个 Claude 来回切 | "I am the bottleneck. And the bottleneck is all planning."；"back down to one agent, feeling my way. Frustrating." |
| 04-18 | 三 agent（Claude 架构、Codex 编码） | — |
| 04-20 → 06-04 | swarm-forge：two-pack → four-pack → six-pack（specifier → coder → cleaner → architect → hardender → QA，各在独立 worktree 与 tmux，宪法三篇 + 角色提示，交接只有 `git_handoff` 与 `note`） | 06-04 "a usable application with a solid architecture and overloaded with unit tests, acceptance tests, and QA tests"；05-29 John Henry 数据：5 人平均 146.6 分钟，四角色 swarm 62 分钟，"Code quality: Adequate" |
| 08-04 | squad leader + 11 类 worker，静态 FSM + 模拟器 + 蒙特卡洛 | 08-19 "highly elaborate scheme. It became unworkable." |
| 08-21 | 结论：流水线六个可行，并行六个失败；agent 间不聊天；不互改提示词；swarm-forge 只是模板 | — |
| 09-07 → 09-18 | 放弃严格 harness；单 Grok + 几条指引 | "apparently the harness is doing the damage"；40 分钟对 3–4 小时；token 消耗 "fallen by a huge factor"；"harnesses should not treat agents as components within a software design" |
| 09-30 | 仍是单 agent（写书工具半小时） | "I'm using just one agent by the way" |

**保留下来的编排经验**（他没有收回的）：一次一个故事；agent 短命、单一职责、上下文小；交接靠提交与结构化产物，不靠聊天；并行的多个写者会互相踩（"double up on functionality, create independent test access … the horrible cascade of merges"）。

## 8. 模型与工具选择（截至 09-30）

只用 Grok（09-18 "I've stopped using any other model for the time being"）；之前：Claude（01–02）→ Codex（02-28 起；05-14 注销 Claude）→ Grok 与 Codex 因额度来回切（05–08）。
"Grok Build 是主力"没有一手证据；他 06-27 说 "Grok build is not as good. Codex is better so far."。工具形态：自写 Clojure／Go／Java／Python 工具，部分以 Claude Code skill 形态发布（crap4go 的 `SKILL.md`）。

## 9. 学习路径与伦理

- 新手先写三年代码再碰 agent（播客 07-22）；"AI discipline is similar to trigger discipline when using an automatic weapon."（X 02-04）；电动工具伤手指的比喻从 2025-05 用到 2026-07。
- 责任在人；agent "cannot be accountable"（Rant 2025-12-13、X 2026-05-30、Rant 2026-09-01）。
- 但他的 swarm-forge 要求 agent 提交带 "By <role>." 署名——与「责任在人」并存，他未解释。

## 10. 已放弃或降级的做法（不要当作他的当前立场引用）

| 做法 | 曾主张 | 放弃／降级时间与原话 |
|---|---|---|
| 只信人逐行看 | "Nothing can be trusted other than direct human inspection at the code level."（02-21） | 04-14 起不评审 |
| 三定律 TDD 对 AI 必要 | "the three laws of TDD are necessary to keep Claude from going off the rails."（02-21） | 07-30 "TDD is a human discipline. I don't expect agents to follow it." |
| CRAP < 4 给 agent | Rant 04-20 "below five or below four" | 08-18 "can be overdone (eg 4)"；09-02 阈值 10；09-12 <12 |
| 测试过载（Gherkin + QA + 变异 + Gherkin 变异全上） | 08-03 三条流全锁 | 07-02 "just because we can … doesn't mean we should"；09-18 "overusing gherkin" |
| 用可执行 FSM／门禁强制 agent 走固定流程 | 08-06 "create an executable finite state machine that directs the agents actions" | 09-07 "over constraining"；09-11 "the need for _any_ but the most liberal of harnesses may be obviated" |
| 多 agent 流水线 / squad | 04-20 → 08-23 | 09-11 "harnesses should not treat agents as components"；09-14 "massively inefficient" |
| 大计划 / 详尽规格 | 02-12 SDD "very valuable" | 同帖已警告 BUFD；08-19 精细方案放弃 |
| 让 agent 自己算指标 | — | 08-06 "Don't tell an agent to calculate code coverage" |

## 11. 仍在实验、没有结论的

- uml-viewer 与 crapper 每天在改（09-29、09-30 提交）；多语言扫描器刚加。
- 「删掉全部测试再用变异重建」（儿子 Justin 的想法，08-16）：无结果。
- 负向测试是否优于有意的正向测试：实验结论「没有显著差异」（08-18）。
- 「模型够好所以宽松 harness 即可」只基于单任务对比，无数据。
- 09-24 转引 DHH "hand coding no longer economically viable" 只有 "!!!!!"，未展开。

## 12. 这套方法论与他的书面原则的关系

- 与书面版本一致的：读多于写（改为「读结构多于读代码」）；先跑通再弄对；依赖规则（工具化）；简单设计四条；验收测试纪律；持续改进（覆盖率、变异、语义稳定性正是 2e 第 32 章）。
- 与书面版本分对象处理的：函数大小（agent 可更大）、注释（agent 可稍多）、TDD 节奏（agent 不查）。
- 与书面版本有张力、他未调和的：伦理层「权责在人」与 agent 署名提交；「原则只是准则」与 2026 上半年的硬门禁；「不可能提示出好代码」与 9 月「几条指引即可」。
