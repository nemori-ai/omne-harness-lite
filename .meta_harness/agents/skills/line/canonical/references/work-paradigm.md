# 线会话的工作范式

本页给出常驻线会话在多波、多张卡之间反复复用的做法。目标有两个：每次被派发都能快速进入状态；每张卡不重复做重的上下文收集。

本页只组织做法，不另立规则。规则仍归各拥有者：协作规则归 `docs/engineering/integration.md`「集成节点的清单」，卡级准备与推进循环归 `claim` 技能，常见失误归 `.meta_harness/human/delivery-pitfalls.md` 的 P1–P17，方法采用归 `docs/engineering/skills.md`。

## 核心想法：按存续期分三层准备，每层只做差额

| 层 | 什么时候做 | 产物（放 `tmp/line-<线>/`） | 什么时候刷新 |
| --- | --- | --- | --- |
| 会话级 | 线会话第一次开工，做一次 | 身份与长程目标、方法地图、环境记录、线级上下文地图主体、线级工程约束 | 换会话接续时读回，不重做；delta 写明拥有者正文变了才改对应条目 |
| 波级 | 每次读到 delta | 本波变化摘要：新 F、reduce 做过的消费者迁移、外域变化、本波任务 | 每个 delta 一次，只写变化 |
| 卡级 | 每张卡开工 | 本卡附录、`spec.md`、`plan.md` | 只写本卡相对线级产物的差额 |

判断一项内容放哪一层，只问一句：**它在下一张卡、下一波还成立吗？** 成立就上移一层，只写一次。

反面做法：每张卡重读整套设计正文、重写完整上下文地图、重新选技能、重新整理工程约束。这些都属于会话级，做一次就够。

## 会话级：开工时一次做好

1. **身份与长程目标。** 写下：本线是谁、父卡、负责的卡与预案队列、里程碑卡的关闭门、本线结果服务哪道门。以后每个局部决定都回到这里核对。
2. **加载技能。** 先 `line`；每张卡按 `claim`；评审用 `review-code`、`review-docs`、`review-delivery`。改文档前加载 `asd-ste100`。
3. **方法地图。** 按下一节写一份本线版本：本线的主工作类型对应哪个 pstack playbook，哪些 Matt 技能会用到，哪些项目规矩最常碰到。
4. **环境。** 依赖安装、生成 agent 投影、`check:agents` 通过；记下 Node、pnpm、git 版本。
5. **线级上下文地图主体。** 本线各卡共用的拥有者正文、系统图景入口（`docs/orientation.md`）、最容易踩的耦合与禁止的依赖方向、相邻线的接口、读者角色。reduce 已给出时只核对。
6. **线级工程约束 `constraints.md`。** 按 `claim` 技能「线级一次性准备」的六项表（研发品味、演进政策与提交、领域边界与依赖方向、SOLID 与 TypeScript、防御指导、验证级别）逐项写本线适用条目。

出口：自包含四问能答：从哪个提交开工、能改哪些文件、做到什么程度算完成、每条事实的出处在哪。

## 方法地图：什么时候用什么

规则与项目差异归 `docs/engineering/skills.md`，下表只是索引。

| 场合 | 方法 | 本项目的依据与边界 |
| --- | --- | --- |
| 进入一张卡，按主工作类型走流程 | pstack `poteto-mode` 的 playbook：feature、bug-fix、refactoring、perf-issue、investigation；没有贴合的才用 `figure-it-out` | `skills.md` 采用表；工作类型归 `docs/engineering/work-types.md` |
| 改现有代码前弄清结构与落点 | `pstack:how`；查已有决定的理由用 `pstack:why` | 不替代拥有者正文 |
| 写本卡实施输入 | 方法用 Matt `to-spec`（直接读 `skills.md` 钉住的 SKILL.md）；模板用 `claim` 技能的 `references/spec-template.md` | 已明确的输入不重复审批；正式形状归实际拥有者 |
| 切交付切片 | 方法用 Matt `to-tickets`；模板用 `claim` 技能的 `references/plan-template.md` | 首版前不做 expand–contract 兼容过渡，同波迁移消费者（`publication.md`） |
| 设计模块、核类型外承诺 | Matt `codebase-design`；pstack `architect` | 不变量、失败、配置与性能承诺 |
| 写 TypeScript | `pstack:typescript-best-practices` | `docs/architecture/layers-and-dependencies.md` |
| 定位缺陷 | Matt `diagnosing-bugs`（按需）；pstack bug-fix playbook | 先便宜复现，再怀疑环境（P6） |
| 评审 | `review-code`、`review-docs`、`review-delivery`；Matt `code-review` 分开判 Standards 与 Spec | 力度按 `quality.md` 风险级别：L0、L1 不派实现评审，L3 逐行读热点 |
| 写文档与报告 | `asd-ste100`；`pstack:technical-writing`、`pstack:unslop` | 保留事实、条件与置信度 |
| 写给子代理的简报 | Matt `writing-for-agents` | 只给指针、写明完成与停止条件 |

### 开发为主的线：工程准则

开发线的产出是代码，质量主要由下列准则决定。准则本身归各拥有者，本表只回答三件事：去哪读、在哪一层落地、由什么检查。检查方式沿整洁回路（`docs/clean-loop.md`）的思路：能量的交给传感器，量不了但能问出后果的交给评审，剩下的交给人。

| 准则 | 拥有者（先读这里） | 落在哪一层 | 怎样检查 |
| --- | --- | --- | --- |
| 顶层架构遵循 | `docs/orientation.md`（领域地图、核心方向、三类顶层图）；`docs/architecture/README.md`；`docs/architecture/structure.md`「三条分解轴」「组合保证由谁承担」；IC 约定 `docs/architecture/cordis-integration-conventions.md` 与 constraints | 会话级：线级地图主体写本线涉及的架构条款与组合承担者。卡级：`spec.md` 写本卡受约束的条款 | `review-code` 正确性一面按已采用架构判；冲突按 `AGENTS.md`「冲突入口」交拥有者，不从实现反推 |
| 研发品味 | `.meta_harness/agents/roles/engineering-taste.md`「通用判断」「维度分解与正交」「TS/JS 代码」 | 会话级：`constraints.md` 写本线适用条目。卡级：设计前先命名问题所在的轴与拥有者，对照「四种做坏的样子」与「迷失了轴的信号」 | 评审只在规则对应具体后果时形成发现，品味观察不替代验收判据 |
| 领域边界隔离 | `docs/architecture/layers-and-dependencies.md`「依赖关系与禁止方向」「领域语义依赖与模型边界」「外域概念的进入方式」「隔离语义，不隐藏责任」；`docs/domains/boundaries.md`「关键接缝与组合承担者」 | 卡级：新增或改变跨域概念、公开字段、端口或状态分支时，在 `spec.md` 回答「设计与开发的核对」五问 | `pnpm run lint:deps` 报依赖违规与环；评审查「被集成方是否认识了集成方」「适配器里是否静默补造规则」 |
| 面向契约实现 | `.meta_harness/agents/roles/developer-contract.md`「采用的接口与行为承诺是实际输入」；成员 SPEC 与 `api/`（`docs/member-documentation.md`）；`integration.md`「里程碑与契约基线」「可加改动」 | 卡级：`spec.md` 列出本卡实现的精确契约条款与版本；卡的 `contract:` 标签决定只许可加还是允许破坏性改动 | change-scope 与 contract-check 在准入里核对快照差异；契约与实现冲突时上报，不改契约迁就实现 |
| SOLID 与 DDD 方法 | `docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」 | 卡级：用单一职责区分变化原因，用依赖倒置与接口隔离表达消费者所需能力；限界上下文与防腐层用于判断概念归属与转换 | `review-code` 设计与实践一面，问题要指到具体类型、函数或分支；这些方法不替代业务语义与不变量的判断 |
| TypeScript 最佳实践 | `pstack:typescript-best-practices` 与 `principle-type-system-discipline`；`engineering-taste.md`「TS/JS 代码」；包边界归 `docs/workspace.md` 与 `publication.md` | 写范围含 `.ts` 时会话级加载；实施简报写明适用条目 | `typecheck`、`lint:rules`、`lint:oxlint`；评审查非法状态是否可表示、外部数据是否在边界解析 |
| 防御与失败语义 | `docs/defensive-patterns.md`「当前指导」；`quality.md`「公开能力、策略与观测」 | 卡级：`spec.md` 写本卡的失败、未知、取消、清理与外部效果；策略做成可配置对象，默认值只是初值 | 评审查错误是否被静默变成成功、disposer 是否被当成可逆 |
| 结构读数与测试判别力 | `docs/clean-loop.md`「回路怎么转」（四条硬线）；`docs/verification.md` 的声明边界 | 若干切片后集中跑一次，不在每个切片跑 | `pnpm run metrics --base <taskBase> --coverage`（圈复杂度、CRAP）；`pnpm run mutation --base <taskBase>`（差分变异）；红项逐条交代，不在量测范围内写「未测量」 |
| 新责任边界 | `harness-design-handbook` 技能（覆盖、性质、Cordis 承载） | 只在出现新的能力或责任边界时加载 | `design-reviewer` 按指定的一种判断评审 |

三层里的复用方式：

- **会话级**写一次：线级地图主体里的架构条款与组合承担者、`constraints.md` 的六项（研发品味、演进政策与提交、领域边界与依赖方向、SOLID 与 TypeScript、防御指导、验证级别）。
- **卡级**只写差额：本卡实现的契约条款、跨域概念的五问回答、失败语义、新增的约束条目。
- **实施简报**按 `.meta_harness/agents/roles/developer-task.md` 给 developer 子代理：精确契约与版本、写范围、适用的品味与防御条目、`implementation_kind`、完成与停止条件。不把整套准则抄进简报，只给指针与本卡条目。
- **交回**时，交接报告逐项交代传感器读数和评审结论，红项写处置。

文档为主的线把「顶层架构遵循」「领域边界隔离」换成文档治理（`docs/engineering/documentation.md`「位置与唯一源」）与 `asd-ste100`；其余照用。

### 按自己的宿主选择和设置角色模型

线会话的多数实际工作由它派出的子代理完成，模型选错直接影响质量与成本。规则与钉值归 `.meta_harness/agents/roles/README.md`「模型配置与本次派发」和 `.meta_harness/agents/roles/dispatch-policy.json`，档位分工归 `claim` 技能的卡推进循环「角色与模型」。

1. **认清宿主。** 会话级准备时写下自己是 Claude Code 还是 Codex，以及版本。pstack 在 Codex 上按 `skills.md` 引的 Codex 适配说明换算工具名与模型名。
2. **按卡定工作类型与风险。** 能力与组合、提供者是默认档；规格完整的单模块切片可降到经济档；内核原语与生命周期、安全敏感、跨多个包或整个装配升到顶档。拿不准时上调一档。
3. **用解析器取值。** 在工作树根运行下面的命令，得到 requested 的 model 与 effort。`--work-kind` 与 `--risk` 的合法值见 `dispatch-policy.json` 中该角色的 `work` 与 `top_risks`。结果存进 `tmp/line-<线>/role-dispatch.json`，同类卡复用。

   ```sh
   uv run --locked python .meta_harness/agents/skills/design-subagents/canonical/scripts/render_pair.py \
     --source .meta_harness/agents/roles/<角色> --resolve <claude_code 或 codex> \
     --policy-version <版本> --work-kind <类型> [--risk <风险>]
   ```

4. **按宿主机制设置。**
   - Claude Code：角色文件钉了默认模型，派发时用 Agent 工具的 `model` 参数覆盖。
   - Codex：角色文件的钉值优先于派发值；developer 与 qa 的 `codex.toml` 不钉模型，所以**派发时必须显式给模型**，不给就继承父会话的模型，而且不会报错。
5. **记录。** requested 与 observed 分开记；宿主不提供运行观测时 observed 写 unknown。固定角色（如 design-reviewer）的钉值不覆盖，判「表达」时按 README 的例外处理。

### 最常碰到的项目规矩

| 规矩 | 拥有者 |
| --- | --- |
| 认卡、交回、证据与接受 | `docs/engineering/agent-delivery.md`（证据规则在第 5 节） |
| 风险级别、评审与升级阶梯 | `docs/engineering/quality.md` |
| 隔离、单写与工作树清理 | `docs/engineering/workflow.md` |
| 演进政策、提交与权限 | `docs/engineering/publication.md` |
| 署名、分支与 `Harness`／`Agent-Role` trailer | `CONTRIBUTING.md` |
| 验证能声称什么、不能声称什么 | `docs/verification.md` |
| 常见失误 | `.meta_harness/human/delivery-pitfalls.md` P1–P17 |

## 波级：读 delta，只记变化

1. 读 delta：新 F、本波 assignment（active、idle、redo、terminal）、reduce 做过的修改与消费者迁移、外域变化。
2. 写本波变化摘要。delta 提到的拥有者正文若在线级地图里，只更新那一条。
3. active：从新 F 建本波批次分支，按队列开卡。不重放上一波的补丁。
4. idle：只做第 1、2 步，然后继续等。这一步让下一次开工几乎零成本。
5. redo：按任务卡上的新 attempt 重开，波号不变。
6. terminal：交最终报告，结束。

## 卡级：只写差额

1. 认卡、核对 binding、建工作树、运行 `start` 并读回（`claim` 技能「卡级增量准备」第 1–6 步）。
2. 本卡附录：绑定、本卡依据、缺口、受影响成员。主体引用线级地图。一页以内。
3. `spec.md`：方法按 `to-spec`，格式按 `claim` 技能的 spec 模板。工程约束一节引用线级 `constraints.md`，只写本卡新增条目。
4. `plan.md`：方法按 `to-tickets`，格式按 `claim` 技能的 plan 模板。每个切片写端到端行为、对应判据、验收命令、角色与模型分配、七步待办。
5. 待决事项先筛三层：过度设计删掉 → 自己能定的具名裁定写进 `spec.md` → 只有产品规则、范围变化、新的破坏性契约改动才算缺口。缺口不提问：停依赖部分，继续其余，整波做不下去就交回。

## 推进循环：每个切片的七步

1. 便宜档子代理补本切片上下文，只补差额。
2. 写简报（`writing-for-agents`）：命令必须能在当前仓库运行（P8）。
3. 写者实施；最后一次改动后重跑全部门禁，报告日志时间与提交号（P1）。
4. 你复跑功能门禁，核对写范围。
5. 只有高风险切片当场评审；常规评审集中到实施完成后一次。
6. 阻断合成一轮集中修复；同类阻断出现两次就整类处理（P3）。
7. 提交并推送，更新 `plan.md` 进度总览。

### 进度记录：两层，固定格式

- **卡级：** `tmp/issue-<号>/plan.md` 的进度总览，格式与更新时点归 `claim` 技能 plan 模板「进度更新」：进度条一行、当前一行、切片表，状态只用五个值。每完成一步就勾选，写者交回、提交推送、受阻时改表，交回前改成最终状态并贴进交接报告。
- **线级：** `tmp/line-<线>/state.md` 开头的「本波进度」，格式不改：
  - `本波进度：[■■■□□□□□□□] 1/3 卡已交回 · 波 <w> · F <短 sha> · 更新 <UTC 时间>`
  - `当前：#<卡号> 切片 <号> 第 <n> 步`；轮空写 `当前：轮空，等待下一条 delta`；受阻写 `当前：受阻：<一句原因>`。
  - 卡队列表：`| 卡 | 状态 | 批次分支上的提交 |`，状态只用 `待做`、`进行中（切片 x/y）`、`已交回`、`受阻（<原因>）`、`跳过（<理由>）`。
- **线级什么时候改：** 读到 delta 时按新队列重写；每张卡开工、每个切片完成、每张卡交回、受阻、开始等待时改。
- 进度与提交历史不一致时，以提交历史为准，先改进度再继续。

结构度量、差分变异和品味核对在若干切片后集中跑一次。全量准入归 reduce，线内只跑本卡成员的类型检查、测试、format、oxlint 和按需的 `check:docs`／`check:agents`。

## 证据：一次做对，接受者不用回头问

- 通过要有当场可查的产物，退出码为 0 不等于测过（P1、P2）。
- 证据贴在卡评论里；只写任务 tmp 路径的证据，接受者不据它判断（`agent-delivery.md` 第 5 节）。原件太大时贴摘要、关键行、位置和哈希。
- 证据日志记下所跑代码的提交号；证据脚本每一步核对成功（P13、P14）。
- 没跑的写「未执行」和原因，工具不覆盖的写「未测量」，不写零。

## 交回与等待

- 做完：每张卡合入本线批次分支，卡上发五节交接报告（做了什么、没做什么、发现的冲突、给集成节点的提示、评审闭合）。整线本波交完就开批次 PR，在线父卡发交回记录，然后停写。
- 做不了：同一个入口交回 blocked，写清原因、已完成部分和剩余工作，然后停写。
- 等待：一条等待命令等线父卡的下一条 delta。等待本身出问题时写进状态，等人转告，不轮询。

### 等待：前台阻塞的工具调用

交出本波之后、交 blocked 之后、轮空时，线会话此刻就该被阻塞地等待：不做别的事，也不停下来。所以等待命令一律这样执行：

1. **用宿主的 shell 或 bash 工具，作为一次前台阻塞的工具调用来执行。** 不加 `nohup`、`&`、`setsid`、`disown`，不放后台，不用 Claude Code 的 `run_in_background`。
2. **原因：** 放到后台而前台不阻塞，会话就会结束本回合。Codex 上，后台进程跑完也唤醒不了已结束的会话，线就永远等不到收口。
3. **单次工具调用有时长上限。** 给等待命令加 `--timeout`，取略小于宿主单次调用上限的值。退出码 3 表示超时，不表示条件不成立：立即用**同一个 `--since`**（命令带 operation-id 与 journal 时也保持不变）在新的前台调用里重跑同一条命令。这是重新挂上事件等待，不是轮询 GitHub（每次启动只做一次有界对账）。
4. **等待返回后**按 delta 处理：active 开工、idle 再次前台阻塞等待、redo 按新 attempt 重开、terminal 交最终报告。只有读到明确的 terminal delta 并交完最终报告，才可以结束回合。
5. **等自己派出的子代理时同理：** 前台没有别的工作就阻塞等它，不结束回合。
6. **唯一的后台进程是本机事件接收器**（`events-receiver-cli serve`）。它是每台机器一个的常驻服务，要活过会话，由本机第一个开工的会话启动一次；它不是等待命令，等待命令本身仍然前台阻塞。
7. 每次重挂前后更新 `state.md` 的等待命令与 `--since`，便于替换会话接续。

- 每次交回、停下或压缩上下文前，更新 `tmp/line-<线>/state.md`：本波进度、身份、已消费 delta、当前 attempt 与 head、未完成操作、下一步。替换会话只读它和线父卡就能接上。

## 每波复盘：把教训变成线级资产

波结束时花几分钟：本波哪条规则被反复违反、哪类阻断出现两次、哪个命令写错了。能变成结构手段的变成结构手段（P7）；属于本线的写进 `constraints.md`；属于项目的写进交接报告「给集成节点的提示」，由 reduce 决定是否写回拥有者。

## 不要做的事

- 每张卡重做会话级产物。
- 波中向人提问、在普通评论向 reduce 求方案、读别线未集成的提交。
- 自跑全量准入（归 reduce），或在准入期间提交。
- 轮询 GitHub 等待。
- 把计划说成已交付，把未执行写成通过。
