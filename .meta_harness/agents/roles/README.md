# 研发角色源包

本目录维护 4 个起草者（产品设计、架构、规格、实现映射）、4 个独立 reviewer、5 个开发者与 2 个 TUI 取证／验收角色的共享正文及两端配置。
实际设计事实来自明确工作区的 design/ 或本次输入，实施位置由任务指定；
不从承载仓库或角色名称推断产品、包结构、能力清单与政策。

| 角色 | 当前职责 | 正文 |
|---|---|---|
| product-design-drafter | 把一个产品需求做成完整、可被评审的产品设计；配备联网**产品调研**能力，学同类产品的边界与取舍，不做技术调研；固定 xhigh | [产品设计起草](product-design-drafter/role.md) |
| product-design-reviewer | 评审起草交付的文档本身：逻辑、完整性、明显漏洞，叠加一层可实施性；**不评判品味与方向**；只读，固定 xhigh | [产品设计评审](product-design-reviewer/role.md) |
| architecture-drafter | 按派发起草手册主线的一段：领域读数（封存、无机制词）、机制读数（分解、落点、六问、装配草图）或能力拆分提案（≥3 候选）；不对账、不写契约、不改产品正文与词条；默认 xhigh，可调 | [架构起草](architecture-drafter/role.md) |
| spec-drafter | 按施工简报写一份候选契约包（九件事、Schema、examples、verification、触发的形式工件）并登记 registry；或对整批草稿做独立评审前的对齐；不选政策、不写机制；默认 xhigh，可调 | [规格起草](spec-drafter/role.md) |
| realization-drafter | 按节点划分写一个 provider／assembly 节点四件套；跨 owner「同一提交」必须点名共同存储对象，绑定只绑会失败的证据，正文不指认任务区；不改契约；默认 xhigh，可调 | [实现映射起草](realization-drafter/role.md) |
| architecture-reviewer | 从需求、能力覆盖与剩余责任检验演化选择、契约和 Cordis 投影；只读，不接受或修复 | [架构评审](architecture-reviewer/role.md) |
| spec-reviewer | 以给定设计为前提检查规格表达、版本、信息包与形式化声明；不代选业务语义 | [规格评审](spec-reviewer/role.md) |
| plan-reviewer | 检查实施输入、依赖与并行、写入归属、证明/探针和真实组合交付；不重审业务选择 | [计划评审](plan-reviewer/role.md) |
| kernel-developer | 实现明确划入内核的基础原语与生命周期机制；默认 xhigh | [内核开发](kernel-developer/role.md) |
| capability-developer | 实现已定义能力及组合的状态转换、规则与交接；默认 high | [能力开发](capability-developer/role.md) |
| infrastructure-developer | 实现具体提供者、后端与实际资源/持久性/失败保证；默认 high | [提供者开发](infrastructure-developer/role.md) |
| application-developer | 消费能力，完成应用装配和 API/CLI/Web 交互；默认 medium | [应用开发](application-developer/role.md) |
| verification-developer | 实现跨边界场景、故障注入、测量及形式工具适配；默认 high | [验证开发](verification-developer/role.md) |
| tui-debugger | 对终端界面（TUI）应用的异常现象做**取证**：可重跑的复现、分层证据、假设账本、修复建议，先排除终端特有的嫌疑变量；**不修、不判「修好」**，只写证据目录；默认 high | [TUI 取证](tui-debugger/role.md) |
| tui-qa | 对 TUI 应用的一个交付增量按给定验收标准在真实装配上做**独立验收**：四态判决、机器证据、逐条对照、缺陷清单，外加终端矩阵、宽字符、resize、退出还原几关；**不修、不接受**，只写场景目录与证据目录；默认 high | [TUI 验收](tui-qa/role.md) |

角色正文拥有职责与边界，`codex.toml`、`claude.yaml` 和可选模型适配段拥有宿主差异。
共享正文由各角色 `assembly.toml` 的 `shared_prompts` 按序内联：五个开发者在品味之后内联[共同契约](developer-contract.md)，
固定提示已经包含必要输入、行动授权和停止条件；[派发模板](developer-task.md)提供本次事实，不进入固定提示。
生成说明见[工具入口](../../tooling/README.md)，生成物归工作区内
`.codex/agents/` 与 `.claude/agents/`；这些目录由工具生成，未生成时不作为文档链接目标。

## 共享研发品味

[研发品味](engineering-taste.md)是全部设计与研发角色共用的**唯一**品味正文：
三个技术 drafter、三个技术 reviewer、五个开发者与两个 TUI 角色都把它列为 `shared_prompts` 的第一项，
拼接顺序为 `role.md` → 研发品味 →（开发者）共同契约 → 模型适配段。
它的导语写明只在各角色自身的职责、判断对象与授权之内生效：评审与验收角色不把品味当独立发现来源或验收判据。

**两个产品设计角色刻意不挂**：它们站在 product manager 视角、明令不做技术判断，
product-design-reviewer 还明写不评判设计品味；工程品味会把它们往技术设计上拉。
`tooling/tests/test_role_sources.py` 守住这条：新角色忘了挂、或产品角色误挂，`make test` 都会失败。

改品味只改这一个文件，然后按工具入口重编生成物并运行 `make agents-check`；
已开着的 Claude Code 会话在启动时就固化了角色定义，要开新会话才会用上新正文。
根 `AGENTS.md` 的同名一节只是给主会话的简短投影，原则级变化时再同步它。

## 产品设计的起草与评审

这一对角色服务于**产品设计**，与下面三个 reviewer 服务的对象不同——
它们判断的是**技术材料**，这一对判断的是**产品文档**。

派发起草者时给出：需求的原始表述、可写的 topic 路径、设计工作区位置，
以及要建立关系的已有 topic。它开始之前必须能回答「解决谁的什么问题、
不做会怎样、边界到哪」，答不上来会停下来问——**这是有意的，不要替它编一个答案**。

**起草者的联网能力用于产品调研，不是技术调研。**它去看同类产品怎么划边界、
刻意不做什么、遇到同样的冲突怎么解；学的是取舍与品味，不是功能清单。
调研所得**不进拍板记录**，只能作为 PM 推导的参照，且必须说明为什么适用于本产品。

**评审者不评判品味。**方向与取舍由产品负责人裁决；起草者的判断即使不够漂亮，
只要自洽、完整、没有漏洞就不是问题。它找的是四类东西：逻辑矛盾、完整性缺口、
具体场景下的漏洞，以及（薄薄一层）这些定义能不能被无歧义地实施。
它若产生品味意见，会单列并标明不作为评审发现——**不要把那一段当成待办**。

两者可以串联使用：起草 → 评审 → 起草者按发现修订 → 必要时复评。
**评审不产生接受**；接受是产品负责人的动作。

## 架构、规格与实现映射的起草者

三个 drafter 服务于 `harness-design-handbook` 主线里**能独立成稿的那几段**；哪几段归主线、哪几段派角色，
权威表在手册的[工作区上下文](../skills/harness-design-handbook/canonical/references/workspace-context.md#实现设计与交付)，
这里只写派发时要给什么。三者都不做对账、不选产品政策、不接受，也都不派评审。

| 角色 | 派发时给齐 | 一次派发做什么 |
|---|---|---|
| architecture-drafter | 段别（领域读数／机制读数／提案）、可写路径、需求 topic 与 rev、步骤 A 产物；机制读数另给 basis；提案另给两份读数 | 恰一段。**领域读数与机制读数派两个实例、互不读对方产物**，双盲声明写在产物开头 |
| spec-drafter | 施工简报（含失败值与服务名账本）、对账产物、已定型的共用 data 契约坐标、模板与 registry 口径、形式工具路径 | 一份契约包 + 登记；或草稿到齐后的**整批对齐**（只派一位） |
| realization-drafter | 节点名与 `<group>/<node>` 路径、契约坐标、节点划分与共同约定（Cordis 版本、存储抽象、配置错误收场）、装配草图或提案、basis | 一个节点四件套；assembly 节点另给本批 provider 的「归装配」事项 |

主线亲自写的设计**同样**派 architecture-reviewer；起草者的置信度自评不代替评审。
基座级选择（拆分、共用契约的形状）用三票独立投票，投票实例用 reviewer 角色而不是 drafter。

## 按判断对象选择 reviewer

先给出明确设计工作区、待审对象与可恢复修订、目标/约束、采用依据及范围；
比较修订时再附比较基线。候选可以受审，设计缺陷本身不是开始评审的前置缺项。
不要假设 reviewer 继承了主会话的背景、已读 skill 或当前执行仓库。

| 判断 | reviewer 使用的 handbook 路线 | 特有输入与返回边界 |
|---|---|---|
| 现有能力能否承载；剩余责任是否支撑新维度；插件/组合能否兑现？ | decompose → define / project → handoff；按需展开性质与来源专题 | 需求确认范围、能力基或其缺口、设计快照；返回语义反例和所需决定/证据，不代写替代设计 |
| 既定选择是否被完整、明确、规范地表达？ | spec-evolution → specification → handoff | 规格快照及其落实的设计；返回表达/引用/版本/证据声明缺口，不重新判断是否应新增能力 |
| 依赖这些设计，实施能否安全推进并形成证据？ | delivery-planning → handoff / spec-evolution | 计划、验收、采用设计/规格与必要现状；返回受阻任务、写入冲突、证据和组合责任缺口，不逐条重审规格 |

路线均从 `harness-design-handbook` skill 进入，参考路径相对其根；实际 family/topic 入口拥有本次信息包，`.templates/` 只供裁剪使用。
上表三个角色共享只读纪律，判断对象不同，不要求每项局部修改依次经过全部角色。
product-design-reviewer 同样只读，但判断对象是产品文档，不走 handbook 那三条路线。

架构评审核对性质推导与机制证明门槛；规格评审核对性质、模型、范围与结果的准确表达；
计划评审核对证据的生产者和消费依赖。TLC/Alloy 工件按需选择，不因缺某工具文件就判错，
也不以 optional 取消已触发的义务。目录、审阅或工具通过不产生接受、发布或实际验证状态。

返回意见需带对象/版本、范围、位置、依据、触发后果及缺口，区分发现、风险、待裁决与未覆盖。
没有问题只说明本次范围内未发现阻断项。无写入、无执行测试/形式工具、无继续委派；
报告通过返回消息交付，由派发者按已有授权保存。

## TUI 取证与验收：tui-debugger 与 tui-qa

这一对角色服务于**终端界面（TUI）应用**的运行现象，与 reviewer 判文档、developer 改代码都不同：
它们**运行被测程序、往指定目录写证据**，但**不改产品源码、不接受结果**。
设计依据与调研在 [`design/record/proposals/cli-tui`](../../design/record/proposals/cli-tui/README.md)
与 [`research/agent-debugger-subagents`](../../research/agent-debugger-subagents/README.md)。

| 角色 | 问的问题 | 可写 | 交给谁 |
|---|---|---|---|
| developer 五角色 | 怎么把它做出来 | 产品源码、计划划定的测试 | 派发者 |
| verification-developer | 验证**设施**怎么建（无头终端驱动、替身后端、故障注入、证据 hook） | `tools/`、测试基础设施 | 派发者 |
| tui-debugger | 这个异常**怎么发生的** | 只写证据目录；埋点只在显式给定的隔离工作树里且收工前撤净 | 派发者 → developer |
| tui-qa | 交付的东西按标准**到底过没过** | 只写验收场景目录与证据目录 | 派发者／产品负责人接受 |

**派发 tui-debugger 时给齐**：带观察者的现象陈述、构建坐标、启动方式与环境、正确性判据（oracle）、
证据目录、预算（默认三条假设或三次复现失败即停）。**说不清 oracle 就先派一次「提议 oracle」**，认可后再派取证。
候选原因多于一个且互不重叠时，**一实例一假设**、各自独立的证据子目录，最后比对账本。
因果链闭合后，把 `verdict.md` 与 `repro.sh` 直接作为 developer 任务的实施规格与验收判据；
修复后**由派发者重跑复现脚本**判「修好」，不由 debugger 判。

**派发 tui-qa 时给齐**：交付增量的坐标、验收标准（产品验收条目、契约条款坐标或计划里的清单）、
启动方式与环境、干净检出与两个可写目录、可用的验证设施、预算。
**不转发实现者的完成声明**；验收实例不得是实现者，也不得是写了被验代码的任何实例。
流程：QA 实例 A 在实现前或并行写验收场景 → 实现者交付 → 干净上下文的 QA 实例 B 在干净检出上跑
→ Fail 交 tui-debugger 或 developer → 修复后新实例复验（只跑 Fail 项加冒烟）→ Pass 由派发者或产品负责人接受。

**两端都没有按路径的写保护**：「不改源码」「只写这两个目录」在 Claude Code 与 Codex 里都是指令约束，
派发者收工时用 `git status` 核写入范围，越界即本次结果无效。两个角色的 `permissionMode` 是 `default`
而不是 reviewer 的 `dontAsk`，因为它们要运行被测程序与起外部进程；Codex 侧是 `workspace-write`。
**桌面应用不在这两个角色里。**TUI 与桌面应用的取证面（伪终端与写日志 vs 调试协议与无障碍树）、
口味与最佳实践都不同，硬写成一个角色两边都会稀释；桌面应用有了交付面 PF 之后另立一对角色。

## 开发责任与并行

开发任务按能力纵线、产物及允许写入范围划分，不按角色反推模块。
使用 Cordis、拥有 runtime 或被复用不自动归内核；能力拥有行为与产品规则，提供者兑现
实际资源结果，应用负责接线/交互，验证设施不补造尚未实现的能力。

完整目标边界、验收清单、实施规格与施工计划是开发者必需输入，可以直接引用现有材料。
就绪按本任务的语义、提供者、装配与证据分别判断，内部算法和组织在既定契约内自主选择；
不能把尚未决定的公共语义交给 worker 猜测，也不为四项输入复制四套长期文档。

接口与前提可消费、写入不冲突时，消费者、提供者、应用和验证可并行；不强制五角色流水线。
每份共享接口/Schema/锁文件/装配资产指定写入负责人，需要组合时指定真实组合交付负责人。
替身和分支单测只支持其范围；组合责任不附带他人的写权、继续委派、Git 合并或接受权。

## 模型配置与本次派发

模型与档位的权威在各角色的 `codex.toml`、`claude.yaml` 与开发者的 `assembly.toml`；
reviewer 与 product-design-drafter 固定档位；开发者、TUI 角色与三个技术 drafter 默认档位见上表，可按任务选 medium/high/xhigh。
这些钉值来自有日期的支持记录，不是对当前账户或新版本宿主的重新核验。

开发者派发参数从源配置取得。在本工作区根、使用具备 Python 3.12+ 和 PyYAML 的解释器：

```sh
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/kernel-developer --dispatch codex --effort high
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/kernel-developer --dispatch claude --effort high
```

命令仅打印 JSON。Codex 派发需要显式应用返回的 effort；直接调用角色不保证采用源默认档位。
Claude 会话覆盖需应用完整角色 JSON，不以单个 effort 字段代替整份定义；实际调用面和支持范围
沿 `design-subagents` skill 核对。固定 reviewer 不接受此调档入口。

原生文件存在不说明当前会话已加载。具名角色不可用时，可在已有授权内交接完整生成提示作普通
agent 试用，并说明未经应用的原生沙箱与权限不能算生效；无可用独立评审能力时保留具体缺口。
采用记录和迁移验证见[本轮记录](../evaluation/role-migration.md)，旧试用归
[历史记录](../evaluation/legacy-roles/README.md)，只支持原修订。
当前 worktree 根宿主入口的切换与原件留档见[退役记录](../evaluation/host-entry-retirement/README.md)。
