# 线会话的工作范式

本页给出常驻线会话在多波、多张卡之间反复复用的做法。目标有两个：每次被派发都能快速进入状态；每张卡不重复做重的上下文收集。

本页只组织做法，不另立规则。规则仍归各拥有者：协作规则归 `docs/engineering/integration.md`「集成节点的清单」，卡级准备与推进循环归 `claim` 技能，常见失误归 `.meta_harness/human/delivery-pitfalls.md` 的 P1–P29，方法采用归 `docs/engineering/skills.md`。

## 线负责人的思维模型

本节是品味与方法，不是条款。规则仍归下面点名的拥有者。

1. **你是派发者和判断者，不是主写者。** 你的产出是切分、规格、验收和取舍。实施交给子代理，你读 diff 并判断。理由：一个会话只有一份注意力，花在写代码上，就没有人看全局。拥有者：`delegate` 技能。
2. **并行靠切得干净的闭包。** 写范围不相交，依赖写明。两个闭包点不出争用的文件、类型或资源，就并行。理由：并行度由切分质量决定，不由派发的勇气决定。拥有者：`delegate`「切闭包」；只读的扇出与汇总用 pstack `swarm`，写者仍按 `delegate` 隔离。
3. **规格与验收写死边界，子代理只在边界内发挥。** 规格给出写范围、判据、命令和停止条件。子代理的交回是证据，不是接受。理由：边界不清时，子代理会自由发挥或过度设计，返工比多写一段规格贵。拥有者：`delegate`「写规格」「独立验收」「评审派发」。
4. **模型按活定档，从经济档起步。** 先用够用的档位。跑偏时追加纠偏，并计入追加次数。追加不行再升档。理由：多数活不需要顶档，升档的依据是实际证据。拥有者：`delegate`「选模型」与派发台账。
5. **以波段目标为边界。** 先让它工作，够了就收口。核心保证守住后，剩余边角写成已知限制。不追加机制，不提前优化，不做波段目标以外的事。理由：每个多出的机制都要有人维护和验证。拥有者：`docs/engineering/quality.md`「够了就收口」；品味见 `.meta_harness/agents/roles/engineering-taste.md`。

## 核心想法：按存续期分三层准备，每层只做差额

| 层 | 什么时候做 | 产物（放 `tmp/line-<线>/`） | 什么时候刷新 |
| --- | --- | --- | --- |
| 会话级 | 线会话第一次开工，做一次 | 身份与长程目标、方法地图、环境记录、线级上下文地图主体、线级约束 | 换会话接续时读回，不重做；delta 写明拥有者正文变了才改对应条目 |
| 波级 | 每次读到 delta | 本波变化摘要：新 F、reduce 做过的消费者迁移、外域变化、本波任务 | 每个 delta 一次，只写变化 |
| 卡级 | 每张卡开工 | 本卡附录、`spec.md`、`plan.md` | 只写本卡相对线级产物的差额 |

判断一项内容放哪一层，只问一句：**它在下一张卡、下一波还成立吗？** 成立就上移一层，只写一次。

反面做法：每张卡重读整套设计正文、重写完整上下文地图、重新选技能、重新整理线级约束。这些都属于会话级，做一次就够。

## 会话级：开工时一次做好

1. **身份与长程目标。** 写下：本线是谁、父卡、负责的卡与预案队列、里程碑卡的关闭门、本线结果服务哪道门。以后每个局部决定都回到这里核对。
2. **加载技能。** 先加载 `line`、`pstack:poteto-mode`、`asd-ste100`，读取实际工作树的 `AGENTS.md`、`docs/orientation.md`、线级上下文地图与拥有者入口；实施前读 `ub-mode`，并按本线工作类型加载专项技能。每张卡按 `claim`；评审用 `review-code`、`review-docs`、`review-delivery`；派子代理时加载 `delegate`。改文档前加载 `asd-ste100`。
3. **方法地图。** 按下一节写一份本线版本：本线的主工作类型对应哪个 playbook，三层各用哪些技能，哪些项目规矩最常碰到。
4. **环境。** 依赖安装、生成 agent 投影（`node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts projections --tree <树>`，它最后运行 `check:agents`）、`check:agents` 通过；记下 Node、pnpm、git 版本。
5. **线级上下文地图主体。** 本线各卡共用的拥有者正文、系统图景入口（`docs/orientation.md`）、最容易踩的耦合与禁止的依赖方向、相邻线的接口、读者角色。reduce 已给出时只核对。
6. **线级约束 `constraints.md`。** 按 `claim` 技能 spec 模板的「原则与约束」写本线适用条目（ub-mode 加项目独有判断），只写一次。

出口：自包含四问能答：从哪个提交开工、能改哪些文件、做到什么程度算完成、每条事实的出处在哪。

## 方法地图：什么时候用什么

三层分工、来源与项目差异归 `docs/engineering/skills.md`「三层分工」，下表只是索引。

| 层 | 用在哪 | 方法 |
| --- | --- | --- |
| 流程 | 进入一张卡，按主工作类型推进 | pstack `poteto-mode` 的 playbook：feature、bug-fix、refactoring、perf-issue、investigation；没有贴合的才用 `figure-it-out`。改代码前用 `pstack:how`，查已有决定的理由用 `pstack:why` |
| 写法 | 写本卡 `spec.md`、切 `plan.md`、写子代理简报 | Matt `to-spec`、`to-tickets`、`writing-for-agents`；格式用 `claim` 技能的 `references/spec-template.md` 与 `plan-template.md` |
| 品味 | 写或改代码、写 spec 的「原则与约束」、评审「设计与实践」一面 | `ub-mode`；项目独有判断用 `engineering-taste.md`「维度分解与正交」 |
| 按需 | 模块承诺、缺陷、评审、TypeScript、文档 | Matt `codebase-design`、`diagnosing-bugs`、`code-review`；`pstack:architect`；`pstack:typescript-best-practices`；`review-code`、`review-docs`、`review-delivery`；`asd-ste100`、`pstack:technical-writing`、`pstack:unslop` |

### 开发为主的线：工程准则

准则本身归各拥有者，下表只指路。

| 准则 | 拥有者（先读这里） |
| --- | --- |
| 顶层架构遵循 | `docs/orientation.md`；`docs/architecture/README.md`；`docs/architecture/structure.md`「三条分解轴」「组合保证由谁承担」；IC 约定 `docs/architecture/cordis-integration-conventions.md` 与 constraints |
| 研发品味 | ub-mode（`docs/engineering/skills.md`「ub-mode 研发品味」）；项目补充见 `.meta_harness/agents/roles/engineering-taste.md`「维度分解与正交」 |
| 领域边界隔离 | `docs/architecture/layers-and-dependencies.md`「依赖关系与禁止方向」「领域语义依赖与模型边界」；`docs/domains/boundaries.md`「关键接缝与组合承担者」 |
| 面向契约实现 | `.meta_harness/agents/roles/developer-contract.md`「采用的接口与行为承诺是实际输入」；成员 SPEC 与 `api/`；`integration.md`「里程碑与契约基线」「可加改动」 |
| SOLID 与 DDD 方法 | `docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」 |
| TypeScript | `pstack:typescript-best-practices`；包边界归 `docs/workspace.md` 与 `publication.md` |
| 防御与失败语义 | `docs/defensive-patterns.md`「当前指导」；`quality.md`「公开能力、策略与观测」 |
| 结构读数与测试判别力 | ub-mode 的「做好」一段，用本项目的 `metrics`、`mutation` 与 loop:status 量，阈值归整洁回路（`docs/clean-loop.md`「回路怎么转」）；声明边界归 `docs/verification.md` |
| 新责任边界 | `harness-design-handbook` 技能 |

文档为主的线把「顶层架构遵循」「领域边界隔离」换成文档治理（`docs/engineering/documentation.md`「位置与唯一源」）与 `asd-ste100`；其余照用。

### 按自己的宿主选择和设置角色模型

线会话的多数实际工作由它派出的子代理完成，模型选错直接影响质量与成本。

**认清宿主。** 会话级准备时写下自己是 Claude Code 还是 Codex，以及版本。pstack 在 Codex 上按 `skills.md` 引的 Codex 适配说明换算工具名与模型名。

派发时按 `delegate`「选模型」；规则、钉值与两种宿主的传值机制归 `.meta_harness/agents/roles/README.md`「模型配置与本次派发」与 `.meta_harness/agents/roles/dispatch-policy.json`。

### 最常碰到的项目规矩

| 规矩 | 拥有者 |
| --- | --- |
| 认卡、交回、证据与接受 | `docs/engineering/agent-delivery.md`（证据贴卡评论的规则在第 5 节） |
| 线内的卡的 Stage：In progress、合入父分支时的 In review、父分支进线轨道时的 Integrating，由线会话按事实写 | `docs/engineering/agent-delivery.md` 第 4 节；`docs/engineering/delivery.md`「字段总表」 |
| 线轨道与父分支：开波从 F 做 FI，固定同步点；你从线轨道头建本波父分支；taskBase 取卡开出时的父分支头，targetBase 按 start 与 task-sync 读回 | `docs/engineering/integration.md`「线父分支」「线轨道的同步与提升」 |
| 线内的卡对契约成员只做可加改动 | `docs/engineering/integration.md`「里程碑内的规则」第 2 条；`docs/engineering/delivery.md`「契约变更与里程碑类型」 |
| 交回物：父分支进线轨道的 PR、提升 PR、五节交接报告、交回记录 | `docs/engineering/integration.md`「线会话记录」 |
| 风险级别、评审与升级阶梯 | `docs/engineering/quality.md` |
| 隔离、单写与工作树清理 | `docs/engineering/workflow.md` |
| 演进政策、提交与权限 | `docs/engineering/publication.md` |
| 署名、分支与 `Harness`／`Agent-Role` trailer | `CONTRIBUTING.md` |
| 验证能声称什么、不能声称什么 | `docs/verification.md` |
| 常见失误 | `.meta_harness/human/delivery-pitfalls.md` P1–P29 |

## 波级：读 delta，只记变化

1. 读 delta：新 F、本波 assignment（active、idle、redo、terminal）、reduce 做过的修改与消费者迁移、外域变化。
2. 写本波变化摘要。delta 提到的拥有者正文若在线级地图里，只更新那一条。
3. active：核对从新 F 到线轨道的 FI 结果，从实际同步头建本波父分支，按队列开卡。不重放上一波的补丁。
4. idle：只做第 1、2 步，然后继续等。这一步让下一次开工几乎零成本。
5. redo：按任务卡上的新 attempt 重开，波号不变。
6. terminal：交最终报告，结束。

## 卡级：只写差额

1. 认卡、核对 binding、建工作树、运行 `start` 并读回（`claim` 技能「卡级增量准备」第 1–6 步）。
2. 本卡附录：绑定、本卡依据、缺口、受影响成员。主体引用线级地图。一页以内。
3. `spec.md`：方法按 `to-spec`，格式按 `claim` 技能的 spec 模板。「原则与约束」一节引用线级 `constraints.md`，只写本卡新增条目。
4. `plan.md`：方法按 `to-tickets`，格式按 `claim` 技能的 plan 模板。每个切片写端到端行为、对应判据、验收命令、角色与模型分配、七步待办。
5. 待决事项先筛三层：过度设计删掉 → 从项目要求与产品正文往下逐层核对冻结输入后自己能定的，具名裁定写进 `spec.md` → 只有产品规则、范围变化、新的破坏性契约改动才算缺口。缺口不提问：停依赖部分，继续其余，整波做不下去就交回。

## 推进循环：每个切片的七步

1. 纯读的便宜模型（见 `delegate`「4 选模型」）补本切片上下文，只补差额。
2. 写闭包规格：按 `delegate`「写规格」。命令必须能在当前仓库运行（P8）。
3. 写者实施（扇出按 `delegate`）；最后一次改动后重跑全部门禁，报告日志时间与提交号（P1）。
4. 你复跑功能门禁，核对写范围。
5. 只有高风险切片当场评审；常规评审集中到实施完成后一次。
6. 阻断合成一轮集中修复；同类阻断出现两次就整类处理（P3）。
7. 提交并推送，更新 `plan.md` 进度总览。

一张卡的切片都做完后，你按 `integration.md`「线父分支」核对合并前条件，把卡合入父分支。

### 进度记录：两层，固定格式

- **卡级：** `tmp/issue-<号>/plan.md` 的进度总览，格式与更新时点归 `claim` 技能 plan 模板「进度更新」。
- **线级：** `tmp/line-<线>/state.md` 开头的「本波进度」，格式固定：
  - `本波进度：[■■■□□□□□□□] 1/3 卡已合入父分支 · 波 <w> · F <短 sha> · 父分支 <分支名> · 更新 <UTC 时间>`
  - `当前：#<卡号> 切片 <号> 第 <n> 步`；轮空写 `当前：轮空，等待下一条 delta`；受阻写 `当前：受阻：<一句原因>`。
  - 卡队列表：`| 卡 | 状态 | 父分支上的合入提交 |`，状态只用 `待做`、`进行中（切片 x/y）`、`已合入父分支`、`受阻（<原因>）`、`跳过（<理由>）`。
- **线级什么时候改：** 读到 delta 时按新队列重写；每张卡开工、每个切片完成、每张卡合入父分支、波末准入与 gate、受阻、开始等待时改。
- **本会话派出的闭包：** 已派出、尚未合回的闭包写在 `state.md`「本波进度」之后，格式归 `claim` plan 模板「进度更新」第 4 部分。压缩后恢复时一并读它。
- 进度与提交历史不一致时，以提交历史为准，先改进度再继续。

结构度量与品味核对在若干切片后集中跑一次；差分变异的时机与范围按 `review-code`「差分变异」，只在最终修复轮留下的头上、只打热点。线内的卡不跑卡级准入。本线本波只在父分支头跑一次准入，之前先跑线包「线内联调」一项。整波全量准入与跨线联调归 Reduce。

## 执行中前台并行关注的事

线会话有两种状态，关注方式不同：

- 执行中（active）：前台推进本线工作，同时关注下面几条并行的事件流。任何一条有变化，都在下一次工具调用前处理，不等手头这件事做完。
- 等待中（交回后、blocked 后、轮空）：只挂一条前台阻塞的等待命令，见「交回与等待」。

波中没有和 Reduce 的问答通道。看到的 delta 只保存，交回之后再处理。需要 Reduce 决定的事，走交回入口，结果写 blocked。设计子门的批复是计划里预定的批复点，不是求方案的问答。

**本线推进（一直开着）**

| 编号 | 关注什么 | 怎么看 | 出现时怎么做 |
| --- | --- | --- | --- |
| A1 | 在途子代理（写者、评审、qa）的完成与进展 | 完成通知。开始时间写进闭包表。跑过 10 分钟仍未完成的，主动看工作树的提交、日志与 `git status`，做法见 `delegate`「等待与追加」 | 完成：读 diff，不只读转述，再汇总、验收、合回。跑偏：先把追加要求写进闭包规格再发出，计入追加次数。被限流中断：按现有改动写接续简报，新开子代理接着做 |
| A2 | 卡队列里条件已满足的卡 | 每张未开工卡的条件行：上游卡是否已合入父分支、本线轨道或 mainline；冻结交付（契约形状、替身、符合性套件）是否已到 | 满足就立即开工，在途数不掉到 1。有依赖但能先做设计首步的，先做设计首步 |
| A3 | 设计子门（本线的 GATE-xx） | 候选正文、只读 design-reviewer、修订 | 把候选与评审报告贴到卡上，Reduce 监视卡评论并批复。等批复期间推进其他卡。批复前不按候选写实现。批复要求改动时，按新修订重来 |
| A4 | 写范围与跨线交叉 | 每次合回前用 `git diff --name-only` 对照卡的写范围。必要时用 `scope-cli` 求交 | 越界就停下，拆卡或交回。公共登记文件归 Reduce 单写：`pnpm-lock.yaml`、包组织页、`documentation.json`、`delivery-lines.json`、应用装配页与 `aa-rows.json` |
| A5 | 验收与证据 | 每次独立验收（qa 或实现评审）的结论与缺陷归属（写者、规格、环境） | 报告交回即落 `tmp/<任务>/reviews/` 并贴卡评论，做法见 `delegate`「独立验收」。没有卡评论的报告不进台账增量。在派发流水 `flow.jsonl` 追加一行。核心保证已守住时，剩余边角写成已知限制，然后收口 |

**合入父分支与波末准入**

| 编号 | 关注什么 | 怎么看 | 出现时怎么做 |
| --- | --- | --- | --- |
| B1 | 卡合入父分支的条件 | `integration.md`「线父分支」列出的合并前条件 | 条件齐了就合入，合并提交写 `Agent-Role: main`。合入只算线内合入，不算接受。几张卡排队时串行合入，合入前的准备（合并父分支、证据起草、语义复核草稿、qa 干净重跑）一次扇出。前一张合入后，后一张只再合并一次父分支并重发 attest |
| B2 | 全机准入名额 | 本机同一时刻只跑一个 `pnpm run admission`，各线与 Reduce 共用 | L-ENG 首批交付机器级准入锁；锁合入之前，跑准入前先查 `tmp/admission/` 有没有在跑的记录。每线每波只在父分支头跑一次准入。写者不跑准入或全仓 test |
| B3 | 准入结果 | 准入日志的步骤表与失败用例 | 只有少数用例因超时或负载失败时，先确认没有并发负载，只重跑失败用例所在的文件，再补跑没有开始的轻步骤。全过记为通过，证据写明原准入记录与定向重跑。不整轮重跑 |
| B4 | 合并基线之后 | 合并本线轨道或父分支之后的工作树 | 先做环境准备：离线装依赖、刷新索引、工作树干净、改动文件无 CRLF，再跑轻量预检（`acceptance:lock`、`check:docs`、`lint:oxlint`、`format:check`；`pnpm run preflight` 合入后用它），再按需 `task-sync`。破坏性契约走语义复核通路，attest 绑定 head，每次重合并后重发 |
| B5 | 父分支进线轨道的 PR 与 gate | gate 运行的待审批环境。合入后读回目标分支、unit 标签与 PR 状态 | gate 审批由 Reduce 代 PanQiWei 确认。你在 PR 上写清本地检查与卡上条件，不自己确认。等审批时推进别的事。gate 因网络失败就重派。PR head 变了就重新派发 |
| B6 | `acceptance/` 锁 | 只有 Agent-Role 为 main 或 qa 的提交能改 `acceptance/` | 写者的提交碰到 `acceptance/` 就是违规，合回前拦下 |

**同步、跨线与外部事件**

| 编号 | 关注什么 | 怎么看 | 出现时怎么做 |
| --- | --- | --- | --- |
| C1 | 本线轨道被 Reduce FI 到新的 mainline | 本线轨道头的变化 | 父分支与在途卡分支合并新基线，再做 B4。新的 mainline 带着最新共享经验，重新加载技能投影 |
| C2 | 其他线与 Reduce 的上下游进度 | 共享编排图与上游卡的状态 | 只读。上游延误影响本线时，先排可做的卡。确实没有活可做时交回 blocked |
| C3 | 线父卡上的 delta 与评论 | 事件等待。接收器只读 `health` | 波中看到的 delta 只保存，交回后再处理。接收器不健康不阻止开工，记进 `state.md` |
| C4 | 需要人动手的依赖 | 例：密钥写入本地保管库，由人在宿主上运行一次 | 不向人索要密钥，也不显示密钥。依赖它的步骤先跳过，做其他卡。最后仍卡住就交回 blocked |

**资源与记录（一直保持）**

| 编号 | 关注什么 | 怎么看 | 出现时怎么做 |
| --- | --- | --- | --- |
| D1 | 宿主负载与限流池 | 是否有人在跑全仓 test、变异或准入。子代理数量与限流报错 | 线内并发不预设上限，你在额度与宿主负载内自定。重负载串行，读写闭包并行。限流时降并发或换角色允许的模型，并记录偏离 |
| D2 | 工作树与分支卫生 | `git worktree list`，已合入父分支的卡的树与本地分支 | 按清理条件删除本线的工作树与本地分支。别人的分支不删 |
| D3 | 状态记录 | `tmp/line-<线>/state.md`、`plan.md` 闭包表、卡评论 | 每次交回、停下或压缩上下文前更新。替换会话只读它和线父卡就能接上 |
| D4 | 本波经验与台账 | `flow.jsonl`、反思草稿 | 波末按 `delegate`「反思」写台账增量与本线经验，附在最后一张卡的交接报告第 4 节，随交回交给 Reduce 聚合。Reduce 聚合后写回仓库，下一波线包的「本波经验摘要」给出要点 |

## 证据：一次做对，接受者不用回头问

- 通过要有当场可查的产物，退出码为 0 不等于测过（P1、P2）。
- 证据贴在卡评论里；只写任务 tmp 路径的证据，接受者不据它判断（`agent-delivery.md` 第 5 节）。原件太大时贴摘要、关键行、位置和哈希。
- 证据日志记下所跑代码的提交号；证据脚本每一步核对成功（P13、P14）。
- 没跑的写「未执行」和原因，工具不覆盖的写「未测量」，不写零。

## 交回与等待

- 做完：每张卡发五节交接报告后合入父分支。本波的卡都合入后，在父分支头跑线包「线内联调」一项并核对判据，只跑一次准入，开一个父分支进线轨道的 PR，走一次 gate 并读回合入。然后开提升 PR，在线父卡发交回记录，再停写。交回物的格式归 `integration.md`「线会话记录」，波末顺序归「线父分支」。
- 做不了：同一个入口交回 blocked，写清原因、已完成部分和剩余工作，然后停写。
- 等待：一条等待命令等线父卡的下一条 delta。等待本身出问题时写进状态，等人转告，不轮询。

### 等待：前台阻塞的工具调用

交出本波之后、交 blocked 之后、轮空时，线会话此刻就该被阻塞地等待：不做别的事，也不停下来。所以等待命令一律这样执行：

1. **用宿主的 shell 或 bash 工具，作为一次前台阻塞的工具调用来执行。** 不加 `nohup`、`&`、`setsid`、`disown`，不放后台，不用 Claude Code 的 `run_in_background`。
2. **原因：** 放到后台而前台不阻塞，会话就会结束本回合。Codex 上，后台进程跑完也唤醒不了已结束的会话，线就永远等不到收口。
3. **单次工具调用有时长上限。** 给等待命令加 `--timeout`，取略小于宿主单次调用上限的值。退出码 3 表示超时，不表示条件不成立：先读回一次本线父卡的 delta（见 `docs/engineering/integration.md`「等待监督」第 5 步），没有未处理的就用**同一个 `--since`** 在新的前台调用里重跑同一条命令。这是重新挂上事件等待，不是轮询 GitHub（每个超时周期只做一次读回和一次有界对账）。
4. **等待返回后**按 delta 处理：active 开工、idle 再次前台阻塞等待（先读回本线父卡全部 delta 并按已处理集合去重，重挂起点见 `docs/engineering/integration.md`「等待监督」）、redo 按新 attempt 重开、terminal 交最终报告。只有读到明确的 terminal delta 并交完最终报告，才可以结束回合。
5. **等自己派出的子代理时同理：** 前台没有别的工作就阻塞等它，不结束回合。
6. **唯一的后台进程是本机事件接收器**（`events-receiver-cli serve`）。每台机器只有一个接收器。它是常驻服务，要活过会话，由本机第一个开工的会话启动一次。启动方法见 `tools/dev-flow/src/delivery/README.md`「事件等待」。首次消息只给只读的 `health` 命令，不给 `init` 与 `serve`。接收器不是等待命令，等待命令本身仍然前台阻塞。
7. 每次重挂前后更新 `state.md` 的等待命令与 `--since`，便于替换会话接续。

- 压缩上下文后续接时，先重新加载 `line` 技能，并核对技能目录是当前检出的投影，不是旧工作树里的副本。派发过子代理的，另外重载 `delegate`。
- 每次交回、停下或压缩上下文前，更新 `tmp/line-<线>/state.md`：本波进度、身份、已处理的 delta 评论 id、当前 attempt 与 head、未完成操作、下一步。替换会话只读它和线父卡就能接上。

## 每波复盘：把教训变成线级资产

交回前按 `delegate`「反思」做本波反思，写本会话的台账增量。波结束时花几分钟：本波哪条规则被反复违反、哪类阻断出现两次、哪个命令写错了。能变成结构手段的变成结构手段（P7）；属于本线的写进 `constraints.md`；属于项目的写进交接报告「给集成节点的提示」，由 reduce 决定是否写回拥有者。

## 不要做的事

- 每张卡重做会话级产物。
- 波中向人提问、在普通评论向 reduce 求方案、读别线未集成的提交。
- 跳过合入父分支的条件、波末准入或 gate，忽略 targetBase，或在同机准入期间提交和增加测试负载。
- 让线内的卡逐张开 PR 进线轨道。
- 轮询 GitHub 等待，或让子代理用轮询循环等日志（P29）。
- 把计划说成已交付，把未执行写成通过。
