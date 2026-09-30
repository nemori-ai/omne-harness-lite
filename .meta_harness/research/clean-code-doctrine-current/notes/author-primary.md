# 作者一手来源：X 原帖、GitHub 仓库、视频转写（2025-06 → 2026-09-21）

- 原始出处：X `@unclebobmartin`（user id 9505092）；GitHub `unclebob`；视频为 X 原生上传。
- 取得方式：X 原帖经 `https://api.fxtwitter.com/i/status/<id>`（FixTweet 只读代理，返回原帖全文、UTC 时间戳、回复对象）
  与 `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<t>` 两条只读接口取回，主会话逐条读过；
  JSON 原样落在 `sources/fx/<id>.json`、`sources/fx-<id>.json`、`sources/synd-<id>.json`。
  GitHub README 与实验文件经 `raw.githubusercontent.com` 与 `api.github.com` 取回；两段视频用 `faster-whisper`（small、int8、CPU）本地转写，
  转写稿在 `sources/*.transcript.txt`，**转写是机器输出，引文以转写稿为准并标「whisper 转写」**。
- 消费对象：research.md 全部 agent 时代结论（C-11 至 C-20）与「演变表」。
- 立场：作者自述。它只证明他**说了什么、做了什么、承认了什么**；不证明其方法在别处成立。

## A. X 原帖时间线（全部主会话逐字复核）

| 日期（UTC） | ID | 回复对象 | 原文要点（逐字引文见 JSON） |
|---|---|---|---|
| 2025-06-25 | 1937839430821085604 | @davefarley77 | "TDD is double entry bookkeeping. The human must be the pilot of both sides. Tests must not be derived from code, and code must not be derived from tests." |
| 2025-07-17 | 1945820624318075240 | — | YAGNI 与 hammock：“It's _always_ a mix … If you don't plan, you die. If you don't react, you die.” |
| 2025-09-01 | 1962636247769530650 | — | “AI technology will certainly change programming … will not replace programmers; but … will increase the demand for programmers.” |
| 2025-10-25 | 1982150661199298736 | — | 第二版发布：“almost a complete rewrite, with lots of new chapters, and a bunch of new languages like Python, Go, Clojure, etc.” |
| 2026-02-22 | 2025561868866113905 | — | “I had claude write me a little mutation tester in clojure … It vastly increases the semantic stability of the code. Semantic stability is really important when AIs are mucking around with the internals of the code.” |
| 2026-02-26 | 2027126394510069933 | — | “mutation testing … always hard to afford. Now it's just one more Claude agent working down a list.” |
| 2026-03-13 | 2032562619849101804 | — | 三天做完 JVM 语言、wiki、Empire、crap4java/mutate4java、差分变异；“strict TDD, ATDD, Crap, and Mutate workflow that forced coverage into the high 90s, kept Crap below 8, and split any files with more than 50 mutation sites.” |
| 2026-04-14 | 2044114698451476492 | @wookash_podcast（问 500 行 Claude PR 怎么评审） | “I don't review code written by agents. I measure things like test coverage, dependency structure, cyclomatic complexity, module sizes, mutation testing, etc. … Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level.” |
| 2026-07-02 | 2072736888478175413 | — | “I've been pushing very hard on overloading with tests. Gherkin test unit test QA test mutation test gherkin mutation test. … just because we can do them doesn't mean we actually should. Lots of times I just use unit tests and crap evaluation. … For larger projects I can imagine that gherkin testing is pretty useful and so is QA testing. I'm checking that now.” |
| 2026-07-23 | 2080257779395154409 | @ori_pomerantz（“If I am responsible for code, I NEED to understand it”） | “My current strategy is to not read any of the code written by my agents. That's the only way I can take advantage of their productivity. What I do instead is to surround the agents with extreme constraints. Unit tests, gherkin tests, QA procedures, quality metrics, mutation testing, test coverage, and a plethora of others. In the end, I have very high confidence in the code they produce because they've had to run the gauntlet of all of my constraints and tests.” |
| 2026-07-24 | 2080622218527084961 | @themoridwan | “Perhaps they view it as some kind of abandonment of clean code principles. That is not at all what has happened. It's just that now I have tools that help me to enforce my agents to produce clean code and follow those principles.” |
| 2026-07-30 | 2082850576832905657 | — | “TDD is a human discipline. I don't expect agents to follow it. I DO expect agents to write unit tests as carefully and comprehensively as a human would … The reason agents don't have to follow the tight human TDD loop is that they have better and bigger short term memories.” |
| 2026-08-03 | 2084247338613162240 | @HermanBovens | “make it harder to change the tests than the code … three streams of tests … Unit tests in code, acceptance tests in gherkin. QA tests in markdown. The first two are mutation tested to tightly lock them into the existing code.” |
| 2026-08-04 | 2084638878548304046 | — | squad leader + 11 类 worker；“fixed workflow … described by a static FSM”；agents 建 FSM、模拟器、抖动、蒙特卡洛；“Don't tell me software engineering is dead.” |
| 2026-08-06 | 2085351669433303421 | @LifeArtStudios | “Don't tell an agent to calculate code coverage, or cyclomatic complexity. Have the agent run deterministic tools … Don't tell an agent to follow a procedure. Don't give it a long chain of if/else statements … Instead create an executable finite state machine that directs the agents actions.” |
| 2026-08-08 | 2086141128768668111 | @Arthur11750360 | “an Agile project that uses AI will have to shrink their Sprint size to one day (or less) in order to keep the feedback cycle meaningful.” |
| 2026-08-10 | 2086862545319612838 | @CalEvans | “I wish it were possible to prompt good code -- but that's not the way the models work.” |
| 2026-08-12 | 2087502674648305858 | @RailaPaulius | “big ball of mud … spin and thrash hopelessly … nicely partitioned and clean project … changes all day long … Small well named functions (although not as small for agents as for humans.) Well partitioned modules. Appropriate dependency structure. And the keen eye of the supervising human doing spot checks over all of it.” |
| 2026-08-12 | 2087538351175799108 | @VibeCoderMcSwag | “I just tell my agents to write failing tests first … They do this tolerably well -- just like people.” 三类测试各自缺失的后果：无单元测试→回归多；无验收→UI 与业务规则混；无 QA→API 好用 UI 不好用。 |
| 2026-08-12 | 2087563797632278592 | — | “The ability to wrangle these immensely powerful, yet dangerously capricious, agents into a productive harness that produces high quality systems — is the software engineering challenge of this decade.” |
| 2026-08-12 | 2087565882079711599 | — | swarm-forge `squad` 分支“still in progress, but early results are promising.” |
| 2026-08-17 | 2089449442089025936 | — | 发布 negative-test-experiment；摘要“written by grok”。 |
| 2026-08-17 | 2089475660116877769 | @formigarafa | “Certainly not a classic, line by line, review. … Sometimes I'll pop it open and do a spot check. Most of the time I'm reviewing the output of the tools that measure code quality, coverage, and conformance to requirements.” |
| 2026-08-18 | 2089685418828538284 | @lassekt | “Testing is not sufficient. You need to remain situationally aware. … I even spot check some of the code and look carefully at the architecture using appropriate visualization tools. In short, I watch it like a hawk.” |
| 2026-08-18 | 2089687652610060514 | @ivars_auzins | “TDD and bundling have a positive effect on the structure of the code. That CRAP analysis can be overdone (eg 4). And that the tests produced by mutation are not significantly different to justify the premise that negative tests are superior to intentional positive tests.” |
| 2026-08-19 | 2090068337489306092 | @bob_dobalinaa | “I pursued a highly elaborate scheme. It became unworkable. I'm scrapping it for a simpler scheme.” |
| 2026-08-19 | 2090112530874077434 | 引 @mattpocockuk | 访谈直播链接 `youtube.com/live/zcLPGC-tvgk`；“This was a ton of fun!” |
| 2026-08-21 | 2090758607302267226 | @kentcdodds | “High, meaningful coverage is within easy reach of even the most casual projects. … Nowadays it's tantamount to adolescent carelessness to ignore it.” |
| 2026-08-21 | 2090845662698987654 | — | “I've had good luck with six arranged in an assembly line. I've had very bad results with six running in parallel.” |
| 2026-08-21 | 2090846406181322783 | — | “having one agent fix another agent's prompt is spooky.” |
| 2026-08-21 | 2090877283305234651 | @nethumdev | “Collaboration requires a lot of discussion and compromise. The last thing I want is a gaggle of agents honking at each other like a flock of geese.” |
| 2026-08-23 | 2091511895324795292 | @Joobman | “Don't look at swarm-forge as a drop-in product … Look at it … as templates that you can customize.” |
| 2026-08-23 | 2091530252803531107 | @xsamueljr_log | squad 用 six-pack/4-pack 当 worker；leader 分 sub-project、设计接口；“The trick is going to be keeping those interfaces narrow and focussed.” |
| 2026-09-11 | 2098432570887217520 | — | 长帖全文见下 A.1。 |
| 2026-09-12 | 2098744156709441896 | — | 视频 “Morning Bathrobe Rant: Rethinking Harnesses.”（260 s），转写见 C.1。 |
| 2026-09-18 | 2100938985543446954 | — | 长帖全文见下 A.2。 |
| 2026-09-21 | 2102079838639038629 | — | 视频 “A simple demo of uml-viewer. This is how I review the projects I create with agents nowadays.”（533 s），转写见 C.2。 |

### A.1 2026-09-11 长帖全文（fx 接口取回，未截断）

> OK. It's time to rethink this.
> I've spend the last several weeks working on a harness that tightly constrains the agents to work the way that I want them to work. I set up all kinds of gates, and tests, and tools, and protocols, and ...
> And while I was heads-down getting that to work, the agents got a LOT better. So much so that when I came up for air, the need for my harness was obviated. Indeed, the need for _any_ but the most liberal of harnesses may be obviated.
> Just how good these things have gotten blows me away. I have had long debates with grok and codex about the structure of systems -- as if they were senior engineers. They often disagree with me and have their own perspectives. I have, more than once, found myself agreeing with their views.
> I have not given up on constraints and tooling. Unit testing is still important. So is CRAP and Mutation testing. These tools still find bugs and offer useful constraints, though they can leave scars.
> However, the agents have gotten so good that I can now give one a very significant task with a few guidelines and it will faithfully implement it. I can walk away for 40 minutes and when I return it will be done. CRAP will be satisfied, Coverage will be high, and Mutation testing complete. The architecture will be clean, and the code will be very good.
> The end result may not behave perfectly, but it's so close that a couple of tweaks usually puts it into place.
> What does this mean going forward? I'm not sure. But I'm beginning to think that harnesses should not treat agents as components within a software design.

### A.2 2026-09-18 长帖全文

> Given that agents still need high level supervision. And given that the human review of code is a bottleneck. And given that the models have gotten good enough that strict deterministic harnesses are suboptimal.
> Then how should we supervise their output.
> My current solution is to use an interrogation tool coupled with an agent. The tool displays the structure of the system in a UML-like diagram, color coded with crap and mutation scores. The diagram is dynamic, allowing the user to click on element and drill down through the architecture -- all the way to code.
> The user can detect structures that need improvement and tell the associated agent to make the appropriate changes. These changes can range from high level architectural changes, to the lowest level code refactorings. The associated agent will make those changes and cause them to be redisplayed.
> The tool I'm using is custom made for me, but you can point an agent at it and use it as a template to build your own custom tool.
> It's a work in progress, so don't be surprised if it changes a lot over the next few weeks. … http://github.com/unclebob/uml-viewer.

## B. GitHub `unclebob`（`api.github.com/users/unclebob/repos?sort=pushed`，2026-09-30 取）

2026 年新建或活跃的与 agent 工作流相关的仓库（创建 / 最近推送）：

| 仓库 | 创建 | 最近推送 | 描述（原文） | 对本研究的意义 |
|---|---|---|---|---|
| `crapper` | 2026-09-30 | 2026-09-30 | CRAP scores for Clojure, Java, Go, TypeScript, Rust, and Python… | 公式 `CRAP = CC² × (1 − coverage)³ + CC`，阈值 1–5 低、5–30 看一眼、30+ 高风险 |
| `uml-viewer` | 2026-09-13 | 2026-09-30 | Live Quil UML class-diagram viewer driven by EDN | 9-18 帖所说的「审讯工具」；README：与 agent 耦合、CRAP/变异着色、依赖规则违反标红、按 Common Closure Principle 分组 |
| `swarm-forge` | 2026-04-17 | 2026-09-07 | A simple tool for coordinating several AI agents. | 他的多 agent harness；`main` 放「constitution」三篇（engineering / workflow / handoffs），分支 two/four/six-pack、project-manager、lieutenant、squad、sprint-module-squad、adversaries；后端 grok / codex / claude / copilot |
| `negative-test-experiment` | 2026-08-17 | 2026-08-17 | Eight independent Hunt the Wumpus runs: testing discipline × CRAP, then mutation. | 他本人的对照实验，见 B.2 |
| `Acceptance-Pipeline-Specification` | 2026-05-13 | 2026-08-20 | Portable acceptance pipeline specification | Gherkin → JSON IR → 生成入口 → 运行；「acceptance mutation」= 变异示例值 |
| `crap4go` / `crap4java` / `crap4clj` | 2026-05 / 03 / 02 | 2026-05 / 03 / 09 | CRAP 工具；crap4go README 自带 `SKILL.md` 作为 Claude Code skill；crap4clj 描述为 “A skill …” | 工具是 skill 形态，说明他实际用 Claude Code |
| `mutate4go` / `mutate4java` / `clj-mutate` | 2026-05 / 03 / 02 | — / — / 2026-09-19 | 变异测试器 | |
| `dry4go` / `dry4java` / `dry4clj` | 2026-05 / 05 / 05 | — | DRY 检查 | |
| `dependency-checker` | 2026-03-07 | 2026-06-17 | A namespace dependency checker for clojure apps. | 架构依赖规则可执行化 |
| `arch-view` | 2026-03-08 | 2026-03-20 | interactive viewer of the structure of a clojure project | uml-viewer 前身 |
| `AIR-J` | 2026-03-14 | 2026-03-16 | A simple language for AIs to use and humans to ignore. | “one meaning, one representation” |
| `speclj-structure-check` | 2026-02-24 | 2026-06-03 | A Claude skill for clojure and speclj … | |
| `experiment-htw-go-swarm` / `-clj-swarm` | 2026-06-02 | 2026-06-02 | Hunt the Wumpus … built with SwarmForge | six-pack 流水线的实际产物，logbook 记录 specifier→coder→refactorer→architect |
| `Pharaoh` / `Pharaoh-js` | 2026-02-20/21 | 2026-02-21/22 | “Rewritten in Clojure by Claude” / “generated from gherkin by Claude” | 2026-02 起已在用 Claude |
| `GoVideoStore` / `BoboliaTaxes` | 2024-08 | 2024-09 / 08 | “For Clean Code 2d. ed.” | 第二版示例仓库 |

### B.1 swarm-forge `main` 的 `engineering.prompt`（2026-09-04 提交 `f4f5fbca` 时的版本）要点

- Startup：从 `github.com/unclebob/...` 拉最新 CRAP / mutation / DRY 工具，按语言表安装。
- Design And Testability：“Work in small, reviewable increments.” “Prefer the simplest design that supports the current behavior and leaves clear options for the next step.”
  分离可测模块与「环境不适」模块；IO 近端模块不得重新回答领域问题（“Walking the same facts again is a defect even when the dependency arrow already points inward.”）。
- Acceptance Pipeline：用 APS；acceptance mutation = 变异 Gherkin 示例值。
- Verification：constitution 工具**逐个**跑，不并发；`--max-workers 4`；函数变异是相对 manifest 的差分，禁 `--mutate-all`；Gherkin 变异 `--level hard`。
- Guardrails：“Do not invent project-local CRAP, DRY, mutation, or coverage proxies.” 不许手改变异 manifest。

`six-pack` 分支 README：角色 specifier(Codex) → coder(Grok) → cleaner(Grok, batch, back-one) → architect(Grok, batch, back-all) → hardender(Codex) → QA(Grok, batch, back-all)；
specifier 的前向交接要经 dashboard「Attention」人工批准；“Every project agent reads all six articles before its role prompt.”

`handoffs.prompt`：只有 `git_handoff` 与 `note` 两种消息；“Do not write long handoff bodies.”；阻塞时用 `pack_dashboard_request.sh clarify` 问操作者，不在 pane 里问。

### B.2 negative-test-experiment（2026-08-17，`experiment-summary.md` / `experiment-conclusion.md` / `experiment-abstract.txt`）

- 设计：Hunt the Wumpus 从空仓库写 8 次 = 4 种测试纪律（three laws / test-last / bundling / none）× CRAP<4 开关；同一 25 条验收；之后各自冻结再跑变异。首轮因把两份程序复制到八格被作废，本轮重写。
- 数字（conclusion.md）：CRAP-off 行数 396/331/387/340、函数 40/33/52/41；CRAP-on 行数 478/549/603/524、函数 88/86/118/95。八棵树校验和互不相同。
- 作者结论（summary.md）：“CRAP buys coverage and spends cleanliness. It does not improve design.” “Acceptance is cheap to satisfy and silent on suite quality.”
  “Coverage is a weak distinguisher among the three testing disciplines.” “Mutation is the only step that systematically grew tests after the program existed.”
- 评分表（1–5，作者自评）：所有 CRAP-on 行 cleanliness 为 1 或 2；CRAP 从未提高 design 分。
- 局限（作者自述与本轮观察）：一个小游戏、一种语言（Babashka/Clojure）、8 次、单人自评；摘要由 Grok 撰写；程序由 agent 写，「纪律」是给 agent 的指令而非人的行为。
- 他 08-18 的自评（2089687652610060514）：“CRAP analysis can be overdone (eg 4)”；变异测试没有证明「负向测试优于有意的正向测试」。

## C. 视频转写（whisper small，本地）

### C.1 2026-09-12 “Morning Bathrobe Rant: Rethinking Harnesses”（260 s）

关键句（转写稿 `sources/bathrobe-rant-2098744156709441896.transcript.txt`）：

- [00:01–00:35] “For the last several months I have been working on harnesses that will take agents and orchestrate them. I worked very hard on figuring out ways for the agents to hand off to each other without polluting each other. I worked very hard on establishing the deterministic tools that each agent would use…”
- [00:47–01:14] “let's just try to use one agent to do the same thing and the one agent did it better than the harness by a rather large factor … they didn't used to be this good”
- [01:24–01:59] “what would have taken my harness three or four hours to produce and produce acceptably but not really great a single grok instance now can produce that in 40 minutes and do a better job than my harness even though the harness is using that same grok model apparently the harness is doing the damage”
- [02:23–03:17] “I relaxed all of my constraints I said keep crap below 12 do some mutation testing write some unit tests don't do any gherkin … usually I had a keeping crap below six … 40 minutes later it produced a remarkably good outcome not perfect … it had actually without trying kept crap below six anyway”
- [03:23–03:55] “the mutation testing did help to find some bugs and omissions but it also left scars … the mutation testing algorithm forces the agent to do stupid things it also forces the agent to do good things”
- [03:55–04:06] “maybe I should not be considering the agents to be components in a software design”

→ 「40 分钟 vs 3–4 小时」**是他本人在视频里说的**，不只是第三方转述；但它是单次、单任务、无公开数据的自述。

### C.2 2026-09-21 uml-viewer 演示（533 s）

关键句（转写稿 `sources/uml-viewer-demo-2102079838639038629.transcript.txt`，whisper small）：

- [00:01–00:09] "So, I thought you might like to see the UML viewer in action. This is how I review projects now."（对象是几个月前用 agent 写的 Missile Command）
- [00:26–00:36] "I'm going to double click on Handle click and bring up the code. And if I want to see the code, I can see the code. Now, you know, I usually don't."
- [00:57–01:07] "green means good, red means bad. … the quill and the Java swing, that's all foreign. So it's kept outside the component."
- [01:36–01:54] "There's no coverage. The coverage numbers are all at zero. The mutation numbers show an immense number of uncovered mutants. … I had my agents doing crap and mutate, but for some reason they didn't want to do it on these."（一个模块的门禁根本没跑，靠看图才发现）
- [02:21–03:06] 他在与图关联的 agent 里输入指令；agent 发现 "the coverage tool for some reason decided it didn't want to cover that particular module"，重写并重新分区后覆盖变绿；变异随后由 agent 自行跑
- [04:56–05:03] "the game class being out at the top level. It should be in its own component. So I'm telling the agent … put the game module in its own component."（结构决定由人下达）
- [05:57–07:16] 重命名产生 "Game Game"，agent 反复无法决定，他给出名字 "Game API"
- [08:41–08:46] "nice architecture, pretty good design. I can see it at a snapshot."


### C.3 26 条「Morning Bathrobe Rants」（2025-04-30 → 2026-09-30，whisper base 批量转写）

索引与视频地址在 `sources/rants/index.txt`；转写稿逐条在 `sources/rants/<id>.transcript.txt`，本节只摘与结论相关的句子。

- **2026-09-30 "Software Products"**（2105262791217299790，161 s）：用 Scrivener 写了四五本书，"Why am I using a tool that does 80% of what I want … when I could build my own tool"；"I had my agent which happens to be grok at this point and I'm using just one agent by the way … it built it for me in half an hour"（对应 GitHub `bookwriter` 仓库，2026-09-28 创建）；"Software products may be a thing of the past … who in the world would buy a software product now when it is easier and cheaper to make the product that you are absolutely tuned to use"。→ 佐证 C-19/C-20：截至 09-30 仍是单 agent + Grok。
- **2026-09-15 "WE'RE ALL DOOMED… again."** 与 **2026-09-14 "The AI threat"**：对「AI 灭绝人类」说的调侃与反驳（"the AI will be the mice"），与编程原则无关，不进结论。
- **2026-09-01 "AI slop"**（2094742094187307295）："Can you create a lot of slop with AI's? Oh yes you can … but it's not inevitable. If you use reasonable disciplines … constraining the AI … they'll produce pretty reasonable code"；"the models have gotten so much better since even January it's kind of startling"；"You can do that by measuring things, you don't have to read every line … you are still the engineer, you are still the systems analyst, you are still in charge and still responsible."
- **2026-05-20 "Tubes on pegs"**（2057064795241676838）：agent 是抽象阶梯的又一级（1964 年拨管子写二进制起）；用 SwarmForge 以 Go 重写 xspringies："How much of that code did I write? Zero. How many lines of code did I read? Zero. Did I review any of that code? No. … I just kind of looked at the shape … Looks like they've got good names. I looked at the module structure."；"I was very engaged throughout … I had to answer dumb questions … I'd look at the Gherkin and say, no, that's wrong."
- **2026-05-06 "Disengage from the syntax"**（2052002463452958899）："Code makes humans slow."；"To be a good agent manager, you still have to be able to skim the code … You don't read the code. You scroll the code."；"We need to tie them up in knots regarding the size of modules and the interconnectivity between the modules and the number of arguments they're passing and dependencies between the modules. … But we do not need to keep control over the parentheses and the braces."
- **2026-04-21 "Quicksilver"**（2046578685080220074）：vibe coding 的「水银」问题（加一个功能坏前一个）→ "You must provide an unbreakable law for the behavior of the system. And you can't just load it into the context … the first things you say and the last things you say have a lot more importance than the stuff in the middle … So you need to have acceptance tests that are executed outside of the processing of the AI"；Gherkin → 让 AI 写 parser 到 JSON → 生成器出单元测试（即后来的 APS）。
- **2026-04-20 "AI out-codes you; deal with it"**（2046206145597972849，全片）：开头见 C-13；后半："you tell that AI to cover the damn code. And then you use a mutation tester … have the AI build that tool for you. It'll only take you about five minutes"；"drive the crap down to … below five or below four or something like that, which will force it to cut up all the big functions into little tiny functions"；"I think you can make the code a hell of a lot cleaner by driving the AI to do it for you."
- **2025-12-13 "Truly Bizarre Failure Modes"**（1999825947726340531）：用 Grok CLI（"I know, I should be using Opus"）改两行的任务，agent 空转五分钟、改构建脚本、把测试文件每行复制一遍后宣称 "this is perfect"；"you better watch them like a hawk … do a lot of git commits … your friend is git reset hard"；"the amount of detail that I am required to give it is tantamount to just writing the code myself. So there have been a few times when I've just given up"；"treat it like a kindergartener … Something that cannot be accountable, because it's too immature."（填补 X 时间线接口取不到的 2025-10 至 12 月空档）
- **2025-10-26 "SOLID up front"**（1982432101665484900）：回应「SOLID 太前置、毁架构」："That's not how I use the solid principles … mostly after the fact"；"first make it work then make it right"；"The applications of the principles for me at least are probably 80% after the fact … in a refactoring sense"；"conformity is not the goal … pure conformance is never the goal"；"I do write about this in the second edition of the book because there's been so much misunderstanding".
- **2026-07-26 "20X"**（2081334541667410312）："AI agents can write code many times faster than you can, maybe 20 times. … You're going to have those agents … write unit tests and acceptance tests and QA tests, and then you're going to mutate those tests and you're going to run quality metrics and you are going to torture the code."
- **2025-07-21 Muratori 在 Better Software 大会的演讲**（1947270222005879240，733 s）：称其 "OOPs, the 35-year mistake" 历史部分 "impeccable"；把 Muratori 的论点复述为「封装边界应画在策略（解析、处理、存储订单）而不是名词（Order 对象）上」，"which by the way I completely agree with. That is not a controversial point from my perspective."；自述 1980 年代中期自己也照「建模真实世界」的书写过细粒度对象，"doesn't work. Find that out real fast."；"the way you use the technique to make sense is to wrap the policies in encapsulation boundaries, not necessarily all the nouns."
- **2025-06-05 "agile"**（1930572242099769507）："Agile does not make teams go fast. … there is nothing that makes a team go fast except doing a good job."；"Agile was trying to repair the break between programmers and business … by telling the truth. Agile is a way of measuring progress."；迭代一到两周，"Two is probably the most you want to spend"；"developers can't estimate worth a damn anyway"；"The purpose of agile is to destroy hope. Hope is the project killer."
- **2025-06-03 "testing discipline"**（1929854761626436092）：复式记账类比全篇："a testing discipline like test driven development is double entry bookkeeping … Little test, little code, execute zero … in tiny little steps just like the accountants."；"integration tests are not sufficient … when software goes wrong, it doesn't usually go wrong in the business rules. It goes wrong deep down in the weird stuff, the funny little error recoveries, the strange exception catches, the bizarre race conditions."；"testing discipline, a fundamental aspect of being a professional software developer."
- **2025-05-16 "vibe coding"**（1923334334171197549）："The code that you are producing when you are vibe coding is simply a string of the next most likely tokens"；"Large language models do not think they simply calculate"；"They are power tools … when a novice uses a power tool they lose fingers."
- **2025-05-15 "bad code"**（1922961635011944714）："We aren't smart enough to write good code. We're only smart enough to get bad code working. And then after it's working, we could clean it."；"You don't have to ask for permission [to clean] … It's a passive aggressive move … a cowardly move."；"First, make it work, then make it right. The only way to go fast is to do a good job."
- **2025-05-14 "code reviews"**（1922611747401216416）：传统评审会与邮件评审的工时算不过来；他过去做的「一人黄笔红笔逐行、用时与写代码相当」的评审有效但 "hideous"；主张 "you should sit down with the author at the time that the code is being written … like the airlines fly their planes … pilot flying and pilot monitoring … an hour a day … the best kind of code review you can have."（AI 之前的评审基线）
- **2025-05-12 "Micro Services"**（1921895270322786438）："A service is a function … There is no such thing as a service-oriented architecture. There is a service-oriented deployment, but not an architecture. … never use services or microservices for the purpose of decoupling."
- **2025-05-10 "Design Patterns will destroy you"**（1921175033809961469，46 s）：讽刺帖；"it presents a more refined view of all the crappy solutions you were trying to discover by yourself".
- **2025-05-09 "Write your damned tests"**（1920794352214741335）：代码腐烂的原因是恐惧——没有测试就不敢碰；有测试 "the devil cannot speak"，五分钟清理；"now because you have tests you can follow the Boy Scout rule."
- **2025-05-08 "Types"**（1920433782563254776）：静态类型走向图灵完备的模板语言"衔尾蛇"，动态类型在导弹起爆前五毫秒抛类型错误；引 Capers Jones 的 Smalltalk 五倍生产率研究（转述）；"the answer … is to check your types at test time."
- **2025-05-05 "SCRUM"**（1919367681339273347）："In 1995, Scrum was a good idea … the precursor to Agile"；败于 "the invasion of the project managers"，种子是 "Certified Scrum master courses. … I thought it was a dumb idea".
- **2025-05-02 "OOP"**（1918276572760486249）：定义 "a set of collaborating nodes called objects … The sender of a message neither knows nor cares how the receiver will respond"；接口与实现一对多；"encapsulation or inheritance or polymorphism … are not definitional. They are language facilities."；"object models … are models of application behavior", not of the real world；对象可不可变，"it is entirely possible to create object-oriented functional programs"；优势只有一条：解耦。
- **2025-05-01 "ORMs"**（1917912012526702945）："there is no impedance mismatch … An ORM is not an object relational mapper. An ORM is a data structure hydrator."；"Low level things like ORMs should depend on high level things like business objects … every source code dependency crossing that line points up towards the business objects."；"across any architectural boundary, the data structures live on the high level side."
- **2025-04-30 "SQL"**（1917558113177108537，47 s）：应直接用数据库内部数据表示与函数调用，"not … some bloated old arcane syntax invented 50 years ago for people typing at a teletype."

转写状态：26 条全部完成（Muratori 那条 733 s 首次因下载不全失败，重下后成功）。

## D. 出版物与辩论的一手核对（主会话读过原文字节）

| 编号 | 对象 | 取得方式 | 核对到的原文 |
|---|---|---|---|
| V-B0 | Clean Code 2e 目录（InformIT 纸书页，Published Oct 8, 2025，672 页） | `sources/informit-cc2e.html` | 37 章四部分 + "Appendix: The Clean Code Debate"（Method Length / Comments / John's Rewrite / Bob's Rewrite / TDD）；Ch14 三种测试纪律；Ch17 "AIs, LLMs, and God Knows What / Programming by Prompt"；Ch32 "Test Coverage / Mutation Testing / Semantic Stability"；Part IV 十章对应十条誓言 |
| V-B1 | Clean Code 2e 出版社样章 PDF（85 页：前言、导言、第 3 章、索引） | `sources/cc2e-sample.pdf`（2 425 364 字节）→ `cc2e-sample.txt` | p.xxv "several more that I would say differently than I did in 2008"；p.xxvi "a bit more confident"；p.41 "not strict laws … more or less, guidelines"；p.42 "Functions should be small. Most should be just a handful of lines."；p.56–57 YAGNI "What if you aren't going to need it?"；DIP "For small projects, you could be right to make that decision."；p.68 "There's a cognitive price to pay."；p.68–69 性能 "Probably so."；p.69 FUTURE BOB "Grok3 … did not invert the dependencies … not adept at understanding higher architectural goals." |
| V-B3 | Ousterhout × Martin 辩论原文（GitHub `johnousterhout/aposd-vs-clean-code`，创建 2024-09-04，最后推送 2025-04-15，1923 星） | `sources/ousterhout-debate-README.md.txt`（114 599 字节） | L614 "We agree that it is possible to over-decompose, and that *Clean Code 1st ed.* doesn't provide much guidance…"；L645 "we disagree on the relative weighting of those two values"；L1242 "You agree for public APIs…"；L2208 "bundling can produce outcomes just as good as TDD but think it may lead to somewhat less test coverage"；L2286 "I have integrated several of your better ideas, as well as this entire document, into the second edition of _Clean Code_." |
| V-B4 | Martin × Muratori 书面问答（GitHub `unclebob/cmuratori-discussion/cleancodeqa.md`，2023） | `sources/cmuratori-cleancodeqa.md.txt`（87 867 字节） | L9 "the structures you were presenting are not the best way to squeeze every nanosecond of performance out of a system"；L13 "If you are trying to squeeze every nanosecond from a battery of GPUs, then Clean Code may not be for you"；L98 "Frankly, I think that's a fair criticism."；L102 "I am not an expert in performance." |
| V-B5 | 博客 "Solid Relevance" 2020-10-18 | `sources/blog-Solid-Relevance.html` | SOLID 五条当前表述；LSP "People (including me) have made the mistake that this is about inheritance. It is not. It is about sub-typing." |
| V-B6 | 博客 "Too Clean?" 2018-08-13 | `sources/blog-TooClean.html` | "there are also little places where I break the rules specifically because those breakages create affordances for transient issues" |
| V-B7 | 博客索引 | `sources/blog-index.html` | 最后一篇 2023-01-19 "Functional Classes in Clojure"；2021 年 9 篇、2022 年 0 篇 |
| V-B8 | cleancoder.com 首页 "Morning Bathrobe Rants" 列表 | `sources/cleancoder-home.html` | 26 条（2025-04-30 → 2026-09-30），全部链接到 X 视频帖；ID 与时长见 `sources/rants/index.txt` |
| V-G5 | swarm-forge 提交 `27f596ad`（2026-09-02，"Raise CRAP to 10 and skip Gherkin mutation when there are no features."） | `api.github.com/.../commits/27f596ad…` | cleaner："reduce CRAP to 6 or below" → "reduce CRAP to 10 or below. A single `cond` or `case` that answers one question may stay above 10; do not split it into helpers that take booleans the caller already knew."；hardender、QA 同步改为 "CRAP gate is 10 or below on **changed** files" |

其余出版物引文（Clean Coder、Clean Agile、Clean Craftsmanship、Functional Design、We Programmers 的前言与目录，以及 2011–2023 的博文）由著作线子代理取回，原报告在 [reports/2026-09-30-first-round/notes/books-subagent.md](../reports/2026-09-30-first-round/notes/books-subagent.md)，主会话未逐句核原文，正文引用时标「仅转述」。
