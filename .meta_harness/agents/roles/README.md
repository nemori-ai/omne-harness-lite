# 研发角色源包

本目录维护起草者（产品设计、规格、实现映射）、独立评审（设计、实现）、开发者、独立验收与 TUI 取证角色的共享正文及 Codex、Claude Code、Cursor 配置；有哪些以下表为准。
**架构读数与能力拆分提案没有起草角色**：它们由主线或负责人亲自写，agent 只评审与反驳（见[下文](#架构与模块承诺)）。
实际设计事实来自明确工作区的现行拥有者或本次输入，实施位置由任务指定；
不从承载仓库或角色名称推断产品、包结构、能力清单与政策。

| 角色 | 当前职责 | 正文 |
|---|---|---|
| product-design-drafter | 把一个产品需求做成完整、可被评审的产品设计；配备联网**产品调研**能力，学同类产品的边界与取舍，不做技术调研；维护可观察产品场景，并按任务范围给演示与交接建议；固定档位：Claude Code 一端 xhigh，Codex 一端 high | [产品设计起草](product-design-drafter/role.md) |
| product-design-reviewer | 评审起草交付的文档本身：逻辑、完整性、明显漏洞，叠加一层可实施性；核对产品含义归长期正文，不承担任务调度与处置；**不评判品味与方向**；只读，默认 medium，最高 high | [产品设计评审](product-design-reviewer/role.md) |
| design-reviewer | 设计材料的独立只读评审，**一次派发只做一种判断**：选择（读数、能力边界、契约批次的语义整体、提供者或装配设计）、表达（规格文本）或计划（施工计划）；只读本次那一页判据，不混报、不修复、不接受；默认 medium，「选择」判断用 xhigh | [设计评审](design-reviewer/role.md) |
| implementation-reviewer | 一次实现类交付的独立评审，**只在接受级别 L2／L3 或读数里有未交代的红项时派**；先跑执行仓库声明的检查，再按检查表问；每条发现带工具输出或具体反例，不收品味意见；不改受版本管理的文件、不接受；默认 medium，最高 high | [实现评审](implementation-reviewer/role.md) |
| developer | 按规格与施工计划实现一个限定切片。派发字段 `implementation_kind` 取 `product`、`terminal` 或 `verification`。四类任务性质仍在正文里。写入范围由任务给。不替代 qa 或 diagnostician。模型与档位按本次任务选，默认 high | [开发](developer/role.md) |
| diagnostician | 只对 `surface` 为 `terminal` 的异常做取证。缺省或非终端 surface 停止，桌面异常交回任务负责人。不修、不判「修好」。Codex 模型钉 `gpt-6.1-sol`，默认 high | [终端取证](diagnostician/role.md) |
| qa | 对一个可运行的交付增量按给定验收标准在真实装配上做独立验收。交付面是终端时加载 `terminal-acceptance`。不修、不接受。Codex 模型由派发者传入，默认 high | [独立验收](qa/role.md) |

角色正文拥有职责与边界，`codex.toml`、`claude.yaml` 和可选模型适配段拥有宿主差异。
共享正文由各角色 `assembly.toml` 的 `shared_prompts` 按序内联。七个角色的第一项都是[开工框架](project-frame.md)。
五个研发角色接着内联[研发品味](engineering-taste.md)。developer 再内联[共同契约](developer-contract.md)。
implementation-reviewer 再内联[实现评审检查表](implementation-review-checklist.md)。那份文件是这些问法唯一的正文。
固定提示已经包含必要输入、行动授权和停止条件。[派发模板](developer-task.md)提供本次事实，不进入固定提示。
design-reviewer 的判据不内联：三种判断各一页，在手册的 `references/review/` 下，评审时只读本次那一页。
生成说明见[工具入口](../../tooling/README.md)，生成物归工作区内
`.codex/agents/` 与 `.claude/agents/`；这些目录由工具生成，未生成时不作为文档链接目标。

## 开工框架

[开工框架](project-frame.md)是七个角色固定提示的第一段共享正文。它要求角色先理解任务，再按需阅读根 `AGENTS.md`、`docs/requirements.md`、`docs/architecture/`、`docs/domains/` 和这次用到的 `docs/engineering/` 拥有者。它不复制这些正文，也不授予岗位权限。

两个产品角色只内联这一段，不内联研发品味。五个研发角色在它之后内联品味。拼接顺序为 `role.md` → 开工框架 →（研发角色）研发品味 →（按角色）共同契约或检查表 → 模型适配段。

## 共享研发品味

[研发品味](engineering-taste.md)是设计与研发角色共用的研发品味的项目补充，只写项目独有的判断。研发品味以 ub-mode 为基础，ub-mode 的采用归[技能采用入口](../../../docs/engineering/skills.md#ub-mode-研发品味)，不复制进角色提示。
它接在开工框架之后，只在各角色自身的职责、判断对象与授权之内生效。评审与验收角色不把品味当独立发现来源或验收判据。

**两个产品设计角色刻意不挂品味**：它们站在 product manager 视角，明令不做技术判断。
product-design-reviewer 还明写不评判设计品味。工程品味会把它们往技术设计上拉。它们仍要按开工框架约束产品判断。
`tooling/tests/test_role_sources.py` 守住这条：新角色忘了先挂框架、研发角色忘了接着挂品味，或产品角色误挂品味，`pnpm run test:python` 都会失败。

改品味只改这一个文件，然后按工具入口重编生成物并运行 `pnpm run check:agents`；
已开着的 Claude Code 会话在启动时就固化了角色定义，要开新会话才会用上新正文。
根 `AGENTS.md` 的同名一节只是给主会话的简短投影，原则级变化时再同步它。

## 产品设计的起草与评审

这一对角色服务于**产品设计**，与下面的设计评审服务的对象不同——
设计评审判断的是**技术材料**，这一对判断的是**产品文档**。

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

## 架构与模块承诺

领域语义与性质先于机制选择。主会话或负责人明确能力、对象、责任及不变量，再选择提供者与装配；Cordis约束集成，不反向决定领域模型。

模块承诺从[系统技术入口](../../../docs/architecture/README.md)定位实际成员的公开类型、行为契约及验证资源，使用执行仓库版本化包模板。包群与完整成员文档按[两层成员文档](../../../docs/member-documentation.md)维护；SPEC不重复公开形状，仍须完整表达必要行为条件。未迁精确技术承诺继续由[原架构源](../../design/architecture/README.md)拥有。系统级预期归执行仓库docs/architecture；提案、比较和评审过程归工作树tmp，必要终态理由归实际拥有者。不要重建中央版本契约或节点四件套。

设计草稿的独立判断按下表派发；输入须有明确依据、采用范围及未决事项。评审不代写、不选产品政策、不接受。

## 按判断对象选择 reviewer

设计材料只有一个评审角色 design-reviewer，**一次派发只做一种判断，简报里写明是哪一种**。
三种判断共用只读纪律与报告格式，各自判据按需读取。两类意见混在一份报告里会互相淹没；需要两种判断时分别派发。常设判定任务归[评估用例集](../evaluation/suites/README.md)。

| 简报里写的判断 | 它回答的问题 | 判据页（相对手册 skill 的根） | 特有输入与返回边界 |
|---|---|---|---|
| **选择** | 现有能力能否承载；剩余责任是否支撑新维度；每条性质有没有保护点；插件与组合能否兑现 | `references/review/choice.md` | 需求确认范围、能力基或其缺口、设计快照；审批次时附实际源码/接口依赖图及范围。返回语义反例和所需决定或证据，不代写替代设计 |
| **表达** | 既定选择是否被完整、明确、规范地写出来 | `references/review/expression.md` | 规格快照及其落实的设计，加相关机器检查输出与未覆盖范围。返回表达、引用、版本、证据声明的缺口，不重新判断是否应新增能力 |
| **计划** | 依赖这些设计，实施能否安全推进并形成证据 | `references/review/plan.md` | 计划、验收、采用的设计与规格、必要现状。返回受阻任务、写入冲突、证据和组合责任缺口，不逐条重审规格 |

派发前运行本次实际适用的引用、类型/Schema、资源或依赖检查，附原始输出与范围。机器读数是事实，评审者判断其后果，不重复已经核过的机械项。没有适用入口时明确未覆盖，不能伪造旧工具输出。
评审角色不运行工具；其只读/禁止执行边界保持不变。

先给出明确设计工作区、待审对象与可恢复修订、目标/约束、采用依据及范围；比较修订时再附比较基线。
候选可以受审，设计缺陷本身不是开始评审的前置缺项。不要假设评审者继承了主会话的背景、已读 skill 或当前执行仓库。
不要求每项局部修改依次经过三种判断。product-design-reviewer 同样只读，但判断对象是产品文档，不走这三页。

TLC/Alloy 工件按需选择，不因缺某工具文件就判错，也不以 optional 取消已触发的义务。
目录、审阅或工具通过不产生接受、发布或实际验证状态。返回意见带对象/版本、范围、位置、依据、触发后果及缺口，
分阻断、非阻断、范围外待裁决与未覆盖四组；报告通过返回消息交付，由派发者按已有授权保存。

## 实现评审与独立验收

这两个角色看的是**实现类交付**，默认不派：每个交付单元都派一遍会把迭代拖长。什么级别派谁，权威在手册的
[按风险选择接受实现的看法](../../../docs/engineering/quality.md#按风险选择接受实现的看法)。

| 角色 | 问的问题 | 怎么取证 | 可写 |
|---|---|---|---|
| implementation-reviewer | 这次变更有没有越出写入范围、动了验收、破了依赖方向、留下没交代的结构问题、违背它声称兑现的契约 | **先跑工具**（变更清单、仓库规则检查、结构度量、受影响范围的测试与失败归因），再按[检查表](implementation-review-checklist.md)问；每条发现带工具输出或具体反例 | 不改任何受版本管理的文件 |
| qa | 交付的东西按验收标准**到底过没过** | 在干净检出的真实装配上跑验收场景，四态判决加机器证据 | 只写验收场景目录与证据目录 |

**派发 implementation-reviewer 时给齐**：执行仓库与检出、任务基线提交与交付提交、接受级别、任务简报里的写入范围与验收清单、
实施规格、实施者的交付说明（它会当作待验证的主张），以及执行仓库声明各检查入口的文档位置。
它不评命名与风格；只有品味、没有证据的话它会放进末尾的「观察」，**那一节不是待办**。

**派发 qa 时给齐**：交付增量的坐标、验收标准（产品验收条目、契约条款坐标或计划里的清单）、
启动方式与环境、干净检出与两个可写目录、可用的验证设施、预算。
**不转发实现者的完成声明**；验收实例不得是实现者，也不得是写了被验代码的任何实例。
流程：QA 实例 A 在实现前或并行写验收场景 → 实现者交付 → 干净上下文的 QA 实例 B 在干净检出上跑
→ Fail 交 developer（终端面的现象交 diagnostician）→ 修复后新实例复验（只跑 Fail 项加冒烟）→ Pass 由派发者或产品负责人接受。
qa 原来叫 tui-qa，只服务终端界面；2026-10-01 泛化成通用角色，终端那几关改为「交付面是终端界面时才过」，
依据与验证范围见[现行实现评审用例](../evaluation/suites/implementation-review/README.md)。

**本项目三宿主角色配置均没有按路径的写保护**：「不改源码」「只写这两个目录」是指令约束，
派发者收工时用 `git status` 核写入范围，越界即本次结果无效。这两个角色的 `permissionMode` 是 `default`
而不是 design-reviewer 的 `dontAsk`，因为它们要运行检查、被测程序与外部进程；Codex 侧是 `workspace-write`，Cursor 侧请求 `readonly: false`。

## 实施种类与终端取证

developer 一次派发只取一个 `implementation_kind`。

| 值 | 问的问题 | 加载 | 可写 |
|---|---|---|---|
| `product` | 上一节四类任务性质怎么兑现 | 无交付面 skill | 任务给定的产品源码与测试 |
| `terminal` | 终端交互与呈现怎么做出来 | `terminal-practice` | 任务给定的终端消费者与回归测试 |
| `verification` | 验证设施怎么建 | `verification-facility` | 任务给定的测试、`tools/` 或 `scripts/` |

终端实践、终端验收、终端取证和验证设施实践在对应 skill 里，不写入 `shared_prompts`。
验证设施不把尚未实现的产品行为补进 fixture。developer 不替代 qa 或 diagnostician 的判决。

diagnostician 只覆盖终端取证。`surface` 不是 `terminal` 就停止。桌面异常交回任务负责人。
它运行被测程序、往指定目录写证据，但不改产品源码、不接受结果。方法在 `terminal-forensics`。

| 角色 | 问的问题 | 可写 | 交给谁 |
|---|---|---|---|
| developer | 怎么把它做出来 | 任务给定的源码与测试 | 派发者 |
| diagnostician | 这个终端异常怎么发生的 | 只写证据目录。埋点只在显式给定的隔离工作树里，且收工前撤净 | 派发者 → developer |
| qa | 交付的东西按标准到底过没过 | 只写验收场景目录与证据目录 | 派发者或产品负责人接受 |

派发 diagnostician 时给齐 `surface: terminal`、带观察者的现象陈述、构建坐标、启动方式与环境、oracle、
证据目录、预算（默认三条假设或三次复现失败即停）。说不清 oracle 就先派一次「提议 oracle」，认可后再派取证。
因果链闭合后，把 `verdict.md` 与 `repro.sh` 作为 developer 任务的实施规格与验收判据。
修复后由派发者重跑复现脚本判「修好」。

`tui-developer`、`verification-developer`、`tui-debugger` 已删除，不加别名。

## 开发责任与并行

开发任务按能力纵线、产物及允许写入范围划分，不按角色反推模块——实现只有一个 developer 角色，
代码是集体所有的，这次能写哪里只看任务给的范围。
使用 Cordis、拥有 runtime 或被复用不自动归内核；能力拥有行为与产品规则，提供者兑现
实际资源结果，应用负责接线/交互，验证设施不补造尚未实现的能力。
这四类工作各自「不由你补」的东西写在 [developer 的正文](developer/role.md)里，派发时不必复述。

完整目标边界、验收清单、实施规格与施工计划是开发者必需输入，可以直接引用现有材料。
就绪按本任务的语义、提供者、装配与证据分别判断，内部算法和组织在既定契约内自主选择；
不能把尚未决定的公共语义交给 worker 猜测，也不为四项输入复制四套长期文档。

独立任务可在隔离工作树并行。共享对象和集成拓扑由单一负责人维护，耦合任务按依赖串行。
执行检出、宿主 cwd、写权和清理保护归[协作流程](../../../docs/engineering/workflow.md)，不按角色强排流水线。
**专项清理是一种单独的派发**：把一个超了预算的成员拉回线内，不加行为、不改契约。它由执行仓库的回路状态入口出草稿、
负责人批准后才派给 developer，固定给哪六节、什么时候不派，见[清理任务派发说明](cleanup-task.md)。
实施者平时只在自己所改的文件里顺手清理，超出的列为清理候选——不自己扩大范围，也不由主会话替负责人批。

每份共享接口/Schema/锁文件/装配资产指定写入负责人，需要组合时指定真实组合交付负责人。
替身和分支单测只支持其范围；组合责任不附带他人的写权、继续委派、Git 合并或接受权。

## 模型配置与本次派发

模型的权威在各角色的 `codex.toml`、`claude.yaml`；档位的权威在固定档位角色的这两个文件、可调角色的 `assembly.toml` 与
[派发策略](dispatch-policy.json)。只有 product-design-drafter 固定档位；其余角色的默认档位见上表，可按任务选 medium/high/xhigh，
以 `render_pair.py --resolve` 按策略给出的值为准。这些钉值来自有日期的支持记录，不是对当前账户或新版本宿主的重新核验。

**顶档模型的档位**（负责人 2026-10-30 裁定，#947）：Claude Fable 5.1 与 Codex GPT-6 Astra 默认用 medium，需要时最高用 high；
只有 hardest 任务才用 xhigh。hardest 取 pstack `poteto-mode` 的说法：跨模块的设计、棘手的并发、精细的算法。
策略用 `hardest_work` 与 `hardest_risks` 列出本项目认定的 hardest：design-reviewer 的「选择」判断；developer 的内核原语与生命周期、
跨模块生命周期、跨进程故障。解析器对顶档模型上的非 hardest 任务把默认值和下限压到 `top_model_maximum_effort`（high），
并拒绝更高的覆盖值。别的模型（Opus、Sonnet、GPT-6.1 Sol）不受这条约束。

**design-reviewer 判「表达」时可以换成 Opus 5.5**：Claude Code 一端角色文件钉 Fable 5.1，派发时用 Agent 工具的 `model` 参数覆盖
（原 spec-reviewer 钉的就是 Opus 5.5，合并对照里「表达」那一种也是在它上面跑的）；「表达」在 Opus 5.5 上用 xhigh。判「选择」与「计划」用钉值的模型。
Codex 一端钉 GPT-6 Astra，三种判断都用它；其中「表达」与「计划」不是 hardest，最高用 high。

**developer 的模型按本次任务选**，不由角色固定。选法写在它的 description 里，依据是角色合一记录：

| 任务 | Claude Code | Codex | 档位 |
|---|---|---|---|
| 能力与组合的行为、具体提供者（默认） | Opus 5.5 | GPT-6.1 Sol | high |
| 单个模块、规格完整的应用切片 | Sonnet 5.5 | GPT-6.1 Sol | high |
| 内核原语与生命周期机制 | Fable 5.1 | GPT-6 Astra | xhigh |
| 跨模块生命周期、跨进程故障 | Fable 5.1 | GPT-6 Astra | xhigh |
| 安全敏感、跨多个包或整个装配、契约把失败／诊断／顺序留给判断、发布门禁 | Fable 5.1 | GPT-6 Astra | high |

两端换模型的机制不同：Claude Code 的角色文件钉了默认模型，派发时用 Agent 工具的 `model` 参数覆盖；
Codex 里**角色文件钉的模型优先于派发值**，所以 developer 与 qa 的 `codex.toml` 不钉模型，**Codex 派发必须显式给模型**，
不给就继承父会话的模型。diagnostician 继续钉 `gpt-6.1-sol`。

开发者派发参数从源配置取得。在本工作区根、使用具备 Python 3.12+ 和 PyYAML 的解释器：

```sh
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/developer --dispatch codex --effort high
python agents/skills/design-subagents/canonical/scripts/render_pair.py \
  --source agents/roles/developer --dispatch claude --effort high
```

命令仅打印 JSON。Codex 派发需要显式应用返回的 effort，developer 的输出里 `model` 为空，由派发者按上表填；直接调用角色不保证采用源默认档位。
`--dispatch` 只给角色默认值与合法档位，不按任务核对 hardest；按任务派发用 `--resolve`，它按策略给出模型与档位。
Claude Code 上，按次的档位用 Agent 工具的 `effort` 参数传入解析结果：2026-10-30 实测，钉 `effort: xhigh` 的 design-reviewer
以 `effort: medium` 派发，子代理轨迹记录的实际档位是 medium。要改 effort 以外的字段时，Claude 会话仍应用完整角色 JSON；
实际调用面和支持范围沿 `design-subagents` skill 核对。固定档位的角色（product-design-drafter）不接受此调档入口。

Cursor 一端暂不跟随：`cursor.yaml` 仍钉 `claude-fable-5-1-xhigh` 与 `claude-fable-5-1-high`，以保留现有资格。这是已知偏离，
Cursor 派发者按上面的规则选已核对的模型 ID；Cursor 实际使用前，补 `-medium` 的支持证据并重新取得资格。

原生文件存在不说明当前会话已加载。具名角色不可用时，可在已有授权内交接完整生成提示作普通
agent 试用，并说明未经应用的原生沙箱与权限不能算生效；无可用独立评审能力时保留具体缺口。
角色正文、内联提示、判据或模型配置变化后，按[交付质量](../../../docs/engineering/quality.md)选择受影响验证。
保留[用例集](../evaluation/suites/README.md)及其必要读取资源，实际行为或模型采用变化按对应评估协议比较。
仅方法路由变化不自动触发全模型评估；复用依据、执行范围与未覆盖须如实报告。

当前采用范围、必要理由和复核条件归角色源；本次试用与验证放工作树 tmp，不要求恢复迁移过程。

## Cursor 角色

Cursor 原生配置与模型/权限资格由 [design-subagents](../skills/design-subagents/canonical/references/cursor.md) 拥有。角色职责不因新增宿主改变。生成配置不继承已有 Claude/Codex 评估资格；本次依赖精确模型或权限的任务须另核实际运行。

每个角色的`cursor-qualification.yaml`绑定本角色实际提示及native字段。七个角色都进入 Cursor 投影。
生成器把它们写到 `.cursor/agents/<name>.md`。源更新后重新编译即同步；`compile_agents.py --check` 核对字节，方式与 Codex、Claude Code 相同。
七个生产记录现为 proved。PanQiWei 接受它们在 Cursor CLI `2026.08.04-aaa8809` 与 IDE `3.24.12` 的项目视图中正式派发。Cloud 没有版本记录，不在派发范围内。
pending 或绑定过期的文件不进入合格摘要。proved 且绑定仍对应当前源的文件进入合格摘要，`subagentStart` 按文件摘要放行。
记录缺失或 unsupported 时，整个 Cursor 构建在写入前不产生文件。

## 协作派发与宿主策略

外部常驻 Line 与唯一 Reduce 的状态归 [负责人状态](../../../docs/engineering/map-reduce-states.md)，按 `line`、`dispatch`、`integrate` 与 `claim` 技能执行。角色名不授予跨域修改、发布或接受权限，派发事实必须包含实际范围、固定输入、结束条件和恢复入口。

Codex 与 Claude Code 使用同一职责源和各自已核验模型默认配置。选择规则归 [dispatch-policy.json](dispatch-policy.json)，精确宿主值归各角色的 `codex.toml` 与 `claude.yaml`，不能在模板重抄一份模型表。精确 model、effort、策略修订和选择理由由正式角色解析器输出；developer/qa 的 model 不得为 null。固定约束优先，未知宿主/角色/模型及冲突失败，不静默降级。requested 与 observed 分别记录，宿主未提供运行观测则为 unknown。两宿主配置存在及生成通过不代表实际加载或等待续接通过；采用者在开工边界读回有效版本，旧会话不支持热载时明确接续方式。
