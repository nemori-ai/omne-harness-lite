# 线会话的工作范式

本页给出常驻线会话在多波、多张卡之间反复复用的做法。目标有两个：每次被派发都能快速进入状态；每张卡不重复做重的上下文收集。

本页只组织做法，不另立规则。规则仍归各拥有者：协作规则归 `docs/engineering/integration.md`「集成节点的清单」，卡级准备与推进循环归 `claim` 技能，常见失误归 `.meta_harness/human/delivery-pitfalls.md` 的 P1–P17，方法采用归 `docs/engineering/skills.md`。

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
2. **加载技能。** 先 `line`；每张卡按 `claim`；评审用 `review-code`、`review-docs`、`review-delivery`。改文档前加载 `asd-ste100`。
3. **方法地图。** 按下一节写一份本线版本：本线的主工作类型对应哪个 playbook，三层各用哪些技能，哪些项目规矩最常碰到。
4. **环境。** 依赖安装、生成 agent 投影、`check:agents` 通过；记下 Node、pnpm、git 版本。
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
| 研发品味 | ub-mode（`docs/engineering/skills.md`「ub-mode 研发品味」）；`.meta_harness/agents/roles/engineering-taste.md`「维度分解与正交」 |
| 领域边界隔离 | `docs/architecture/layers-and-dependencies.md`「依赖关系与禁止方向」「领域语义依赖与模型边界」；`docs/domains/boundaries.md`「关键接缝与组合承担者」 |
| 面向契约实现 | `.meta_harness/agents/roles/developer-contract.md`「采用的接口与行为承诺是实际输入」；成员 SPEC 与 `api/`；`integration.md`「里程碑与契约基线」「可加改动」 |
| SOLID 与 DDD 方法 | `docs/architecture/layers-and-dependencies.md`「方法依据与采用范围」 |
| TypeScript | `pstack:typescript-best-practices`；包边界归 `docs/workspace.md` 与 `publication.md` |
| 防御与失败语义 | `docs/defensive-patterns.md`「当前指导」；`quality.md`「公开能力、策略与观测」 |
| 结构读数与测试判别力 | ub-mode 的「做好」一段，用本项目的 `metrics`、`mutation` 与 loop:status 量，阈值归整洁回路（`docs/clean-loop.md`「回路怎么转」）；声明边界归 `docs/verification.md` |
| 新责任边界 | `harness-design-handbook` 技能 |

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
3. `spec.md`：方法按 `to-spec`，格式按 `claim` 技能的 spec 模板。「原则与约束」一节引用线级 `constraints.md`，只写本卡新增条目。
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
- **线级：** `tmp/line-<线>/state.md` 开头的「本波进度」，格式固定：
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
3. **单次工具调用有时长上限。** 给等待命令加 `--timeout`，取略小于宿主单次调用上限的值。退出码 3 表示超时，不表示条件不成立：立即用**同一个 `--since`** 在新的前台调用里重跑同一条命令。这是重新挂上事件等待，不是轮询 GitHub（每次启动只做一次有界对账）。
4. **等待返回后**按 delta 处理：active 开工、idle 再次前台阻塞等待、redo 按新 attempt 重开、terminal 交最终报告。只有读到明确的 terminal delta 并交完最终报告，才可以结束回合。
5. **等自己派出的子代理时同理：** 前台没有别的工作就阻塞等它，不结束回合。
6. **唯一的后台进程是本机事件接收器**（`events-receiver-cli serve`）。每台机器只有一个接收器。它是常驻服务，要活过会话，由本机第一个开工的会话启动一次。启动方法见 `tools/dev-flow/src/delivery/README.md`「事件等待」。首次消息只给只读的 `health` 命令，不给 `init` 与 `serve`。接收器不是等待命令，等待命令本身仍然前台阻塞。
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
