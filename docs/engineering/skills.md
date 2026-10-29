# 技能引用与采用边界

本页拥有工程技能的来源、三层分工、项目采用范围与冲突处置。场景页拥有项目步骤及交接，技能正文拥有具体方法。

## 三层分工

本项目的研发方法分三层，各层回答不同的问题，不互相替代：

| 层 | 来源 | 回答什么 | 落在哪里 |
|---|---|---|---|
| 工作流程 | pstack `poteto-mode` | 这类任务按什么顺序推进：选哪个 playbook、何时派子代理、何时验证与收尾 | 任务的待办与推进循环 |
| 交付方案与实施规格的写法 | Matt `to-spec`、`to-tickets`、`writing-for-agents` | 怎样把已讨论的内容写成实施输入、切成可验证的切片、写给子代理的简报 | 项目自己的 spec、plan 模板（`claim` 技能的 `references/`），模板格式归项目 |
| 研发哲学、品味与第一性原理 | Uncle Bob `ub-mode` | 写或改代码时怎样判断：先做对，再做好，并遵循日常实践 | spec 模板的「原则与约束」一节；评审「设计与实践」一面的判据 |

三层之外，项目独有的判断（维度分解与正交、领域语义依赖、Cordis 承载）归[项目研发品味](../../.meta_harness/agents/roles/engineering-taste.md)与 `harness-design-handbook`；交付质量的量度归[整洁回路](../clean-loop.md)。先设计的测试与验证负责「做对」，整洁回路的传感器负责「做好」并量出测试的判别力，两者互补。

采用方法不替代正式语义接受，也不扩大任务权限。

## 来源与项目采用

| 体系 | 固定来源 | 采用范围 |
|---|---|---|
| pstack port | 0.9.79，[michael-denyer/pstack-claude@60ae9e25610744bccd45bd405c211413a471aaf8](https://github.com/michael-denyer/pstack-claude/tree/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack) | Codex 与 Claude Code 的工作流程层 |
| Cursor 官方 pstack | 0.15.20，[cursor/plugins@1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) | Cursor 的工作流程层，不覆盖 port 0.9.79 |
| Matt skills | 1.3.1，[mattpocock/skills@b0618bc436ad893b3c5e84e55fba86586d34a404](https://github.com/mattpocock/skills/tree/b0618bc436ad893b3c5e84e55fba86586d34a404/skills) | 交付方案与实施规格的写法层；其余入口按需 |
| ub-mode | [unclebob/ub-mode@57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f](https://github.com/unclebob/ub-mode/tree/57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f) | 研发哲学、品味与第一性原理层 |
| 项目方法 | [.meta_harness/agents](../../.meta_harness/agents/README.md) | 项目独有的技能、角色与模板；canonical 源与宿主生成分别维护 |

参与本项目迭代维护前，人或 agent 须在实际使用的 coding agent 宿主中装好上表四个外部来源的指定版本。步骤与核对沿[开发初始化](../development.md#初始化-coding-agent-插件)，负责人核对沿[给人的指南](../development_human.md#开始前准备-coding-agent-环境)。一台机器装好不替代新机器、云端环境或新宿主的初始化。

ub-mode 只有一份 `SKILL.md`，上游没有声明许可证。按固定提交取原文装进宿主的用户技能目录（Claude Code 为 `~/.claude/skills/ub-mode/`，Codex 为 `~/.codex/skills/ub-mode/`，Cursor 为 `~/.cursor/skills/ub-mode/`），不复制进本仓库。

Claude Code on the web 环境每次会话启动时把 pstack port、Matt 与 ub-mode 更新到上游最新版本，见[会话脚本](../../.meta_harness/agents/cloud/claude-code/README.md)，实际版本可能比本表新；Cursor Cloud 镜像按本表 revision 安装，见[镜像说明](../development.md#cursor-cloud-agent-镜像)。版本差异按开发初始化核对和报告，不改变本表的采用范围。

## 阅读与实际加载

agent 先核对当前宿主实际发现的技能，再读所选 `SKILL.md` 及其必要参考。Codex 的名称为 `pstack:<name>`、`mattpocock-skills:<name>` 与 `ub-mode`；下文 `Matt:<name>` 映射到 `mattpocock-skills:<name>`。不要把插件正文复制进项目 canonical 源。

Matt `to-spec`、`to-tickets` 与按需的 `grill-with-docs` 在固定源中声明 `disable-model-invocation: true`：宿主不会自动触发，按已安装路径直接读正文，并在报告里写明读取方式。缺少入口、正文或宿主能力时报告具体缺口，依赖它的步骤暂停，其余照常推进；技能名出现在提示里不等于已经加载。

同名技能写明来源：`pstack:tdd` 与 `Matt:tdd` 是两份不同的正文，默认用 `pstack:tdd`；ub-mode 的 TDD 一节是同一纪律的精简表述。playbook 是 poteto-mode 引用的流程文件，不是独立技能。

## pstack 方法入口

以下入口固定 Codex/Claude port 的正文，属于工作流程层；判断原则由 ub-mode 承担，见下文。Cursor 从来源表的官方版本加载同名方法及其真实宿主适配，不把 port 步骤自动复制为 Cursor 保证。按[场景选择](scenarios/README.md)触发，不作为要求全跑的清单。

| 精确方法 | 何时展开 |
|---|---|
| [pstack:poteto-mode](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/SKILL.md) | 非平凡任务选择 playbook；具体顺序归场景 |
| [pstack:how](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/how/SKILL.md) | 理解源码、职责与路径 |
| [pstack:why](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/why/SKILL.md) | 查取舍、历史与原因，保留置信度 |
| [pstack:architect](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/architect/SKILL.md) | 接口或边界设计 |
| [pstack:arena](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/arena/SKILL.md) | 存在多个有效方案时比较 |
| [pstack:figure-it-out](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/figure-it-out/SKILL.md) | 无适用 playbook 的复杂任务 |
| [pstack:benchmark-checklist](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/benchmark-checklist/SKILL.md) | 基线、噪声、指标和测量含义 |
| [pstack:blast-radius](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/blast-radius/SKILL.md) | 核对 diff 外消费者与真实结果 |
| [pstack:interrogate](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/interrogate/SKILL.md) | 对抗评审，发现由任务负责人处置 |
| [pstack:tdd](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/tdd/SKILL.md) | 有价值且相称的测试驱动路径 |
| [pstack:create-verification-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/create-verification-skill/SKILL.md) | 没有真实验证路线时补方法 |
| [pstack:maintain-verification-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/maintain-verification-skill/SKILL.md) | 验证路线漂移时维护 |
| [pstack:correct](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/correct/SKILL.md) | 重复错误优先查结构、类型和检查 |
| [pstack:reflect](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/reflect/SKILL.md) | 提出环境或技能改进，应用受原文及任务授权约束 |
| [pstack:automate-me](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/automate-me/SKILL.md) | 重复操作的自动化候选 |
| [pstack:technical-writing](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/technical-writing/SKILL.md) | 文种与技术表达方法，保留项目写作要求 |
| [pstack:unslop](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/unslop/SKILL.md) | 清晰表达；不删条件和未知 |
| [pstack:typescript-best-practices](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/typescript-best-practices/SKILL.md) | 读取或修改 .ts、.tsx 时加载，必要依赖为 type-system-discipline；具体项目保证仍归拥有者 |
| [pstack:swarm](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/swarm/SKILL.md) | 分区调查、覆盖矩阵和并行汇总，写者仍须隔离 |
| [pstack:show-me-your-work](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/show-me-your-work/SKILL.md) | 长任务的可审阅临时决策记录，项目保存边界见下文 |

### playbook 入口

| 固定流程文件 | 场景定位 |
|---|---|
| [investigation](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/investigation.md) | 只读调查，结论后结束 |
| [feature](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/feature.md) | 已明确的新行为交付 |
| [bug-fix](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/bug-fix.md) | 复现、机制与修复 |
| [refactoring](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/refactoring.md) | 保持行为的结构变化 |
| [perf-issue](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/perf-issue.md) | 一次性能问题 |
| [hillclimb](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/hillclimb.md) | 持续指标改进 |
| [runtime-forensics](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/runtime-forensics.md) | 运行观察，先交诊断 |
| [trace-forensics](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/trace-forensics.md) | 已有 trace 的分析 |
| [authoring-a-skill](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md) | 技能维护，采用项目维护入口 |
| [opening-a-pr](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/opening-a-pr.md) | 已授权的 PR 准备 |
| [babysit](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/babysit.md) | 已授权的 PR 监护 |
| [shipping](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/shipping.md) | 已授权的发布／合并 |
| [autonomous-run](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autonomous-run.md) | 单项长任务驱动到明确终点，不把本地定时机制当宿主保证 |
| [orchestrate](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/orchestrate.md) | 跨阶段项目、多个独立执行者与单一协调责任；普通局部任务不增加调度层 |
| [autopilot-full](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autopilot-full.md) | 独立交付队列，每项一个负责人，操作者合并 |
| [autopilot-stack](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/autopilot-stack.md) | 构建并验证线性栈，集成拓扑由一个负责人维护，落地由任务授权决定 |
| [multi-phase-plan](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md) | 多阶段或多 PR 的依赖和检查点；采用验证差异见质量入口 |
| [pause-safely](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/pause-safely.md) | 收到明确暂停要求时保存可恢复边界 |
| [session-pickup](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/session-pickup.md) | 接续检查点、cloud URL 或已推送分支 |
| [worktree-cleanup](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md) | 获准清理时核对材料与实际消费者，clean 状态不能证明唯一材料可丢 |

较大但单次可完成的任务用 figure-it-out 定制流程；长期项目才用 Orchestrate。并行覆盖用 swarm，方案竞争用 arena。任务规模与成果终点决定流程，不以“自驱”一词强制套完整项目调度。

[Codex 适配](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/references/codex-tools.md)和[恢复存储](https://github.com/michael-denyer/pstack-claude/blob/60ae9e25610744bccd45bd405c211413a471aaf8/plugins/pstack/skills/poteto-mode/references/resume-storage.md)属于必要参考。实际工具、停止能力、线程容量及定时方式以当前宿主为准。映射中的旧工具名称不能视为本会话能力；vendored scripts 的 gt 泛称不能成为统一安装条件，按具体脚本检查 Node、bun、gh 或其它实际依赖。

## Matt 写法入口

Matt 在本项目只承担「怎样写」：方法用 Matt，模板格式用项目自己的。

| 精确入口 | 采用范围 |
|---|---|
| [Matt:to-spec](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/to-spec/SKILL.md) | 必用：把已讨论的内容综合成实施输入，填进 `claim` 技能的 spec 模板。不重新访谈，不自动发 issue |
| [Matt:to-tickets](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/to-tickets/SKILL.md) | 必用：验收与依赖明确后切可交付切片，填进 `claim` 技能的 plan 模板。不另建正式规格权威 |
| [Matt:writing-for-agents](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/productivity/writing-for-agents/SKILL.md) | 必用：写给子代理的简报、技能与 AGENTS.md。只给指针，写明完成与停止条件 |
| [Matt:grill-with-docs](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/grill-with-docs/SKILL.md) | 按需：需求或偏好缺口的访谈，依赖 [grilling](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/productivity/grilling/SKILL.md)、[domain-modeling](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/domain-modeling/SKILL.md) |
| [Matt:codebase-design](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/codebase-design/SKILL.md) | 按需：模块接口与类型之外的承诺（不变量、失败、配置、性能） |
| [Matt:code-review](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/code-review/SKILL.md) | 按需：分开判 Standards 与 Spec；项目评审仍走 `review-code`、`review-docs`、`review-delivery` |
| [Matt:diagnosing-bugs](https://github.com/mattpocock/skills/blob/b0618bc436ad893b3c5e84e55fba86586d34a404/skills/engineering/diagnosing-bugs/SKILL.md) | 按需：可证伪探针 |

概念和理由写回项目既有拥有者，不另造 GLOSSARY 或 ADR 权威。

## ub-mode 研发品味

[ub-mode](https://github.com/unclebob/ub-mode/blob/57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f/SKILL.md) 是写或改代码时的判断基础。本页的「研发品味」指 ub-mode 这一层通用判断；项目独有的判断另见[项目研发品味](../../.meta_harness/agents/roles/engineering-taste.md)。它的 [README](https://github.com/unclebob/ub-mode/blob/57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f/README.md) 说明它松散地基于 poteto 规则（poteto-mode／pstack）的部分内容，并做了精简。一份正文覆盖三段：先做对、再做好、日常实践。

- **何时加载：** 写或改代码、写 spec 的「原则与约束」、做评审「设计与实践」一面时。每次读完整一份，约 4 KB。
- **取代原则清单：** poteto-mode 的 Principles 一节（二十个 `pstack:principle-*` 子技能）由 ub-mode 取代。不要求逐个加载这些子技能，也不要求在回复里逐条点名所读原则；某条 ub-mode 写得太短、确实需要展开时，再读对应的 `pstack:principle-*`。poteto-mode 的 playbook、子代理与回复写法照常使用。
- **TDD：** 先设计好必要的测试与验证。实施可以按 TDD 顺序，做法按 ub-mode 的 TDD 一节。

ub-mode 与本项目的差异：

| ub-mode 原文 | 本项目的对应与处置 |
|---|---|
| TDD：先写会失败的测试 | 先设计必要的测试与验证（判据、反例、变红验证）；实施可以按 TDD 顺序，与[整洁回路](../clean-loop.md)互补 |
| Crapper：每个函数 CRAP 小于 10 | 用 `pnpm run metrics --base <taskBase> --coverage` 量圈复杂度、覆盖率与 CRAP；阈值与带归[整洁回路](../clean-loop.md)，不另定 10。度量若干切片后集中跑一次、集中修复，子切片只跑功能门禁 |
| Dryer：消除相似度 0.8 以上的重复 | 用 loop:status 的重复行读数；阈值归整洁回路 |
| Mutator：覆盖未覆盖、杀死存活、删除死代码 | 用 `pnpm run mutation --base <taskBase>`（差分变异，只量 `packages/`、`apps/`）；等价变异写理由。变异与度量一起集中跑、集中修复 |
| ub-mode 的术语表一条 | 术语归统一语言（`.meta_harness/design/ubiquitous_language/`），不另建词表 |
| Keep a Log 并在完成时报告 | 过程记录留任务 tmp，交付时写交接报告；长任务可用 `pstack:show-me-your-work` |
| Commit and Push：最后推到主线 | 提交格式与来源 trailer 归 [CONTRIBUTING](../../CONTRIBUTING.md)；主干只经 PR 与 github-gate 进入，见[多层分支集成](integration.md) |
| Worktree Cleanup | 清理条件归[工作约定](workflow.md#责任与协作交接) |

## 项目差异与负责边界

| 外部默认或风险 | 本项目实际依据与处置 |
|---|---|
| 并行写入、独立工作树或集成分支 | 独立任务隔离并行，共享接口、锁文件及集成拓扑单一负责人，耦合工作按依赖串行；交接归[工作约定](workflow.md#责任与协作交接) |
| architect 默认先设计后实施 | 按[贡献范围](../../CONTRIBUTING.md#确定变更范围)和任务终点；新承诺未接受只停依赖实施 |
| playbook 的提交、PR、外部消息或 Shipping | 按[交付权限](publication.md#提交表达与权限)，技能不授予外部操作权限 |
| 决策日志、调度状态与过程记录 | 按[成果保存](publication.md#成果保存与跨会话接续)和[终态规则](../development.md#终态与过程材料)：真实成果用 Git 远端保存，临时记录不整体入库 |
| 直接写宿主 skills | canonical 源维护后生成，见 [agent 能力源](../../.meta_harness/agents/README.md) |
| 写作方法删除 hedging 与未知 | 按 [asd-ste100](../../.meta_harness/agents/skills/asd-ste100/canonical/SKILL.md) 保留事实、条件与置信度 |
| to-spec 的测试 seam 确认、自动发 issue | 已明确的输入不重复审批；发布须有任务授权 |
| code-review 默认只看已提交 diff | 先明确实际源与覆盖，不为适配方法擅自提交 |
| 专用流程固定 swarm、多条 lane 或新增阻断 | 按[质量风险选择](quality.md#按成果和风险验证)，依风险选择，不新增全任务固定门禁 |
| to-tickets 默认 expand–contract | 首版前沿[演进政策](publication.md#当前演进与消费者)，同波迁移消费者并删除替代实现 |
| spec、票据与正式契约 | Matt 方法组织单次实施输入；正式形状、行为契约、Schema 身份与验收归实际拥有者，切卡按[工作类型](work-types.md)与[交付操作](agent-delivery.md) |
| TypeScript 与 Node | 方法用 `pstack:typescript-best-practices` 及其 type-system-discipline 依赖；配置归根 `tsconfig.base.json`、成员 `tsconfig.json` 与 workspace catalog，异步义务归[防御指导](../defensive-patterns.md) |

冲突先定位要求的范围、拥有者与接受依据，不用「外部方法优先」处理。

### 尚待明确的 TypeScript 政策

<!-- documentation:placeholder -->

完整的项目 TypeScript 政策及采用例外尚未单独确定，由工程要求负责人补齐。在此之前按 `pstack:typescript-best-practices` 与 type-system-discipline，不据技能名声称项目政策完整。

## 宿主加载与行为验证待补

<!-- documentation:placeholder -->

本机安装和 skills/list 发现已完成，相关正文已按审计范围读取。本批可做入口代表任务走读，不能由此宣称原生调用、自动路由或产品行为验收。ub-mode 在各宿主用户技能目录中的实际发现与加载，同样只有本机核对。Codex SessionStart 自动路由仍需按宿主 /hooks 审阅并信任，本项目未提供其信任与执行完成证据。Windows、压缩恢复、隔离检出的实际 hook 观察及跨机器恢复分别保留未验证；结构可读不会解除这些缺项。

## 更新与维护传播

本页由工程文档维护者与 agent 能力维护者共同核对。更换上游 revision 前检查正文、必要参考、触发、权限和语义，同步本页来源表、[开发初始化](../development.md#初始化-coding-agent-插件)与两套云端脚本。新增方法或门禁回实际拥有者，不用新版本静默扩大采用。一次复核的证据留 tmp。

## 项目分支集成技能

涉及工作分支同步、FI/RI、checkpoint、主干准入或流程失效恢复时，加载自有 [branch-integration](../../.meta_harness/agents/skills/branch-integration/canonical/SKILL.md)。它从[共同规则](integration.md)和实际 CLI 展开，不授予外部动作。

## 项目设计判断的边界

[harness-design-handbook](../../.meta_harness/agents/skills/harness-design-handbook/canonical/SKILL.md) 聚焦能力覆盖、性质保护责任和 Cordis 承载，只在出现新的能力或责任边界时加载。普通工程、文档归属与交付由三层方法和现有工程拥有者承担；风险与升级归 quality，组合证明门槛归 verification。
