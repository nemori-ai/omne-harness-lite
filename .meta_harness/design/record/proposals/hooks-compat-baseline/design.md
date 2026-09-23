# hooks 兼容层基线：翻译层从哪里起步

## 需要作出的选择

**选择对象**：把 Claude Code 与 Codex 的 hooks 配置（事件名、matcher、handler、输出 JSON）
翻译成本项目[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的那一层，
**用什么做起点**：DSH `hook-protocol` 里与运行时无关的那一半、DSH 两个桥接包、全自研，
还是只做一次性离线转换。

**影响什么可观察结果**：组织超管或租户把一份 `hooks.json` / `settings.json` 里的 hooks 导入进来，
拿到的是哪些拓展件、各挂在哪个位置、各是哪一档干预力、导入时被明示了什么；
运行时这些 hook 被调到之后，它们的输出怎样只经日志起作用。

**本提案不定的**：本项目自己的**拓展点协议**——位置的调用契约、每一类拓展件报错时的处置策略、
结论条目的形状。那是阶段 3/4 的设计（[PF-012 §5.8](../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)
「各类具体用哪条策略、协议长什么样，归拓展点协议（规格阶段设计）」）。
兼容层是那份协议的一个**消费者**：本提案只选它的代码与结构起点，**不替协议预填默认值**；
凡是要协议或产品先定的，列在[交接缺口](#交接缺口)。

### 必须保留的性质

下文以 P1–P10 指称，[alternatives.md](alternatives.md) 逐条对照候选。

| # | 性质 | 出处 |
|---|---|---|
| P1 | **事件→位置映射以研究 §五为准**；映射不上的（会话、子代理、环境、设置、呈现、模型切换、工具私有）**不译**，导入时列出并指向各自的 PF | [研究报告 §五、§六](../../../../research/loop-extension-hooks-compat/reports/2026-09-23-hooks-to-positions.md#五事件--位置映射表) |
| P2 | **输出只折成三种动作 + 等人**：追加一条 / 决定下一条还没落盘的长什么样 / 否决 / 落卡等人；`allow` 译为「无意见」，**代答一律不允许** | [PF-012 rev 9 能做什么，不能做什么](../../../product/PF-012-agent-loop-and-run/design.md#能做什么不能做什么)、[没有「放宽」这一档](../../../product/PF-012-agent-loop-and-run/design.md#没有放宽这一档)；[PF-008 rev 5 §6.1](../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答) |
| P3 | **定档规则**：`deny`/`block` → 可否决；`updatedInput`/`additionalContext` → 可改写；其余 → 只观察；**工作区带来的一律只观察** | [PF-002 rev 13 §4 Loop Extension](../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)、[§5.7](../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) |
| P4 | **失败方向**：不可用视作卸载且可见；可用却报错按类型策略，可否决一档默认当否决（fail-closed）；**与宿主 fail-open 的差异在导入时明示** | [PF-012 干预力三档](../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)、[可插拔服务](../../../product/PF-012-agent-loop-and-run/design.md#拓展件是可插拔的服务不可用即卸载报错按策略)；[PF-012 decisions 已知来源问题](../../../product/PF-012-agent-loop-and-run/decisions.md#四已知的来源问题)「导入时要明示」 |
| P5 | **瀑布**：同一位置按声明顺序依次过；别家并行折叠的一组，要么排成先后几件、要么折成一件，**搬进来之后仍是瀑布** | [PF-012 三种形态](../../../product/PF-012-agent-loop-and-run/design.md#三种形态两种装得进一种拆两半) |
| P6 | **`continue:false`、PostToolBatch block 等「停住」**：先落一条取消请求（发起方写那一件），再落终态「被取消」 | [PF-012 否决表下「执行动作之后，明确不给否决」](../../../product/PF-012-agent-loop-and-run/design.md#干预力三档直接用-pf-000-的)、[§6.10](../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) |
| P7 | **改参数先落生效参数**；放行判断判的、人签的、实际执行的是同一份参数 | [PF-012 改参数，先落一条生效参数](../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数) |
| P8 | **command hook 在哪个执行环境跑，归执行环境那一套**；不回退宿主机 | [PF-005 rev 5 执行环境权限](../../../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限)、[§6.9](../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) |
| P9 | **协议漂移可跟进**：钉住兼容的宿主版本，宿主升级时有一条可重复的重核路径，过期不能静默 | [研究：两家的 hook 协议都在变](../../../../research/loop-extension-hooks-compat/research.md#两家的-hook-协议都在变claude-code-规则带大量版本分叉codex-有声明而不运行的-handler-与保留字段) |
| P10 | **只靠改日志起作用**：hook 的结论落日志；新的一次尝试与回放**不重跑 hook 进程**；Stop 续跑计数从日志数出 | [PF-012 §6.9](../../../product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用)、[§6.7](../../../product/PF-012-agent-loop-and-run/design.md#67-检测状态从日志派生不另存)、[等人是 loop 的原语](../../../product/PF-012-agent-loop-and-run/design.md#等人是-loop-的原语) |

**可以调整的**：代码来源（fork、改写、自写）、fork 的边界、导入与运行两半是否分开实现、
宿主配置文件在导入时读还是运行时读（后者受 P3 约束，见[下文](#契约动作链与-cordis-投影)）。

## 现有能力如何承载

**调查范围**：研究包 [loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/README.md)（首轮，2026-09-23；
Claude Code 2.1.280 文档快照、Codex `5c5308f` 源码、DSH `c291e79` 的 `packages/hooks/*`）；
产品正文 PF-012 rev 9、PF-002 rev 13、PF-008 rev 5、PF-005 rev 5；
[SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)。
研究的映射是按 PF-012 **rev 7** 推的；rev 9 的十一个位置与两个维度未变，
rev 9 补的是否决表、「停住」译法、等人原语与可插拔服务，**映射表本身仍可消费**，但下表逐项注明新 rev 补上了什么。

| 要求 | 现有承载 | 如何组合、谁交接 | 未覆盖承诺、实现缺口或未确认前提 |
|---|---|---|---|
| P1 映射 | 研究 §五两张表（CC 33 个事件、Codex 12 个）与 §六「映射不上的」 | 兼容层照表把「事件 + matcher 值」译成「位置 + 情形筛选」；**同名 `SessionStart` 按 matcher 值拆开**（`compact` 落压缩之后，其余归 PF-015） | 映射是推断不是宿主自述；Run 边界处（StopFailure、Interrupt、legacy notify）是近似；CC 只有文档证据 |
| P2 折叠 | PF-012 rev 9 三种动作 + 等人；研究 §七折叠表；DSH `merge.ts` | DSH merge 只折**决定、上下文、`continue:false`、systemMessage**，**不碰 `updatedInput`、`updatedToolOutput`** | 改写类输出的折叠无现成代码；`ask`、`defer` 译成什么未定（见[交接缺口](#交接缺口) G2） |
| P3 定档 | PF-002 rev 13 定档表 + 工作区最严值 | 导入时逐件定档，各层再照常收窄 | **shell 命令不声明自己的输出**，「按声明的输出能力」要落成按事件的输出上限还是由安装者声明，未定（G1）；`ask`/`defer` 不在表里（G2） |
| P4 失败方向 | PF-012 rev 9 两分（不可用 / 报错）+ 三档默认 | 兼容层只负责**把宿主的 fail-open 事实报出来**；策略本身归协议 | 「一件 command hook」哪些情形算不可用、哪些算报错，没人定（G4）；研究：两家对多数事件超时、崩溃、路径写错都放行 |
| P5 瀑布 | PF-012 rev 9 瀑布；DSH merge 的决定折叠与顺序无关 | 一个 matcher 组可在一件拓展件内部折叠后再进瀑布 | 排成几件还是折成一件、与系统自带放行判断的先后，[归拓展件那一侧](../../../product/PF-012-agent-loop-and-run/design.md#改参数先落一条生效参数)（G5）；Codex 改写「最后完成者胜」要换成确定规则 |
| P6 停住 | PF-012 rev 9 译法（取消请求 + 被取消） | DSH merge 把首个 `continue:false` 粘成 `stop` | **DSH 两个桥都不执行它**；两家同一字段在不同事件上的效果不一（研究 §十） |
| P7 生效参数 | PF-012 rev 9 性质 | 兼容层产出改写结论，落条目归协议 | DSH 桥对 `updatedInput` 只记日志不生效；其「三处一致」提案仍是 proposed |
| P8 执行环境 | PF-005 rev 5 执行环境权限（**按工具逐个授予**） | 兼容层的 runner 经执行环境接缝起子进程 | **hook 不是工具**，它的子进程落在哪、受哪一项权限管，PF-005 正文未述（G6）；两家都以宿主用户权限起子进程，无沙箱先例 |
| P9 漂移 | 研究钉住的版本 token 与重核指引 | 兼容层的方言表以钉住版本为键 | DSH 以 CC 30 / Codex 10 个事件为基线，今天是 33 / 12；matcher、codec、merge 各有一处可指认的漂移 |
| P10 日志 | PF-012 rev 9 §6.9、§6.10、等人原语与回放 | hook 进程的解码输出作为结论落日志，出卡前先落 | DSH 的 `hook/invoked`/`hook/result` 成对条目与之同向，但**依赖 DSH Session 与 turn 结构**；Stop 计数两家都在内存 |

**研究撞上的七个缺口，到 rev 9 的状态**（答案逐条见 [PF-012 decisions rev 8 那张表](../../../product/PF-012-agent-loop-and-run/decisions.md#rev-8-新推的)）：
1 否决表、2 放宽、3 代答、4 卡片来源、5 停住终态、7 瀑布——**已由产品正文答了**；
6 外来 hook 怎么定档——PF-002 rev 13 给了表，**但表的适用基础与 `ask`/`defer` 仍未述**（G1、G2）。

## 剩余责任与能力演化

| 剩余问题 | 关系 | 归属理由与消费者影响 |
|---|---|---|
| 两家方言的编解码（stdin 负载、退出码、输出 JSON，按宿主版本） | **扩展**：Loop Extension 能力下一类拓展件的提供者 | 兼容层；本提案选的就是它的起点 |
| 导入：把宿主配置译成拓展件声明（名字、位置、情形、干预力）并出一份导入报告 | **组合**：走 PF-002 资产的持有与授权那一套 | 兼容层产出，资产治理照常接手；**报告是 P3/P4 的「明示」的唯一落点** |
| 运行：跑 handler、按档裁掉越档输出、折叠、交出结论 | **组合**：站在拓展点协议之上 | 兼容层；**依赖协议先定**（阶段 3/4） |
| 「外来 hook」这一类的报错策略、结论条目形状 | 属拓展点协议 | 不在兼容层定，兼容层只消费 |
| hook 子进程的落点与权限 | 属执行环境 | PF-005 owner；兼容层只经接缝请求 |

**不提出新维度。**兼容层是 [Loop Extension](../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension) 这一类资产下的一种拓展件及其导入工具，
挂在已有的十一个位置上、走已有的三档干预力；它不新增位置、不新增档位，
也不为「外来」开特权——[自带的不享受特权](../../../product/PF-012-agent-loop-and-run/design.md#系统自带的几件各站在哪)，外来的同样不享受。

## 取舍入口

四个候选、逐条性质对照、推荐与翻盘条件见 [alternatives.md](alternatives.md)。
**推荐 A（fork DSH hook-protocol 的无运行时一半，自写 runner、导入与方言映射），不是接受。**

## 契约、动作链与 Cordis 投影

本提案不写契约，也不设计拓展点协议。下面只记**任何候选都必须守、且会约束协议阶段输入**的几条形状事实：

- **导入是资产操作，不是运行时读宿主配置。**PF-002 说的是「导入成拓展件」，拓展件是资产、按层持有与授权。
  若运行时直接去读仓库里的 `.claude/settings.json`、`.codex/hooks.json`，那它就是**工作区提供的资产**，
  按 [§5.7](../../../product/PF-002-assets-settings-and-permissions/design.md#57-工作区那一级不参与权限计算) 一律只观察；
  读宿主机用户目录下的配置则**没有租户持有者**，与 [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant) 相抵。
  所以「两家配置文件原样读入」只能作为**导入的输入**成立。
- **每件导入的拓展件是一件可插拔服务。**它依赖执行环境接缝；接缝不在，按 Cordis 的 `inject` 语义就是停在未加载，
  正对 PF-012「不可用即卸载」——**但「此刻不在」要可见**，那一笔由协议定。
- **matcher、codec、merge 是纯计算，不制造 fiber**；异步 hook 的在途登记与卸载时 abort 属 `ctx.effect` 纳管的副作用。
- **协议若用 Cordis 事件承载否决，异步 hook 的控制判定不能走 `bail`**（它不 await）；这是提醒协议阶段的输入，不在此处定派发。

## 证据义务与受阻消费

| 依赖的性质与前提 | 保护者/环境责任 | 所需证据与当前结果 | 闭合条件、负责产物及受影响选择 |
|---|---|---|---|
| 映射对 CC 2.1.280 实际行为成立 | 宿主 | **只有文档**；研究列了五项探针（多件改写谁胜出、改写与决定是否留痕、并行 PreToolUse 是否全判完、Stop 计数、Codex Stop 重入），**均未跑** | 影响「兼容到什么程度」的声明，**不改变起点选择**；探针归研究包后续轮次 |
| A 与 C 的差别是否实质 | 本提案作者 | **区分实验未跑**：在钉住副本上把 matcher 精确集、CC 方言全退出码读 JSON、merge 加 `defer` 与改写字段、剥离 `dsh-session` 类型扩展四处改完，量四个文件与测试的改动比例 | 改动超过一半行数则翻向 C（见 [alternatives.md](alternatives.md#推荐与仍待区分的事项)）；实验归实施计划的第一步 |
| P2、P4、P6、P7、P10 在兼容层里不被违反 | 兼容层实现 | 尚无；须各有一条**该语义消失即失败**的测试：`allow` 不产生放行；可否决档 hook 超时被当作否决且留痕；`continue:false` 产生取消请求 + 被取消；改写先落生效参数；回放不重起子进程；Stop 计数崩溃后从日志复现 | 协议定稿后登记到兼容层节点的验证义务；**在协议之前写不出** |

## 交接缺口

**以下各项无论选哪个候选都要另定**，兼容层不自己填默认值。

| # | 缺口 | 谁定 | 受影响 |
|---|---|---|---|
| G1 | **定档的依据**：shell 命令不声明输出，PF-002「按它声明的输出能力」落成**按事件的输出上限**（PreToolUse → 可否决）还是**由安装者声明**；以及越档输出（只观察档的 hook 交回 `deny`）是丢弃并留痕还是整次算报错 | PF-002 owner 定依据；协议定越档处置 | 导入报告、运行时裁剪 |
| G2 | **`ask`、`defer` 译成什么**：PF-002 定档表没列。`ask` 若译成「落卡等人」（PF-012 里属可否决一档），卡片选项由谁写——导入的 hook 自己不写选项，[PF-008 §6.8](../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) 要求「出卡的那一件自己写」；`defer`（CC 只在 `-p`、单调用）无对应 | PF-002 / PF-008 owner；卡片形状归协议 | PreToolUse 的全部 CC 配置 |
| G3 | **`updatedPermissions`、`setMode` 等改资产的输出**：PF-008 §6.1 只点名了 `allow` 与代答；改权限设置不在三档里，译为「无意见」并明示还是整件拒导 | PF-002 owner | CC PermissionRequest |
| G4 | **command hook 的「不可用」与「报错」分界**：脚本路径不存在、执行环境落不了位（[PF-005 §6.9](../../../product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) 是拒绝）、非零非 2 退出、超时，各算哪一类。算不可用，把关的那一关就「此刻不在」（与 CC「路径写错门就静默失效」同形，只多了可见）；算报错，可否决档就 fail-closed | 拓展点协议（「外来 hook」这一类的策略） | P4 的全部兑现 |
| G5 | **瀑布里的排法**：一个 matcher 组折成一件还是排成几件；导入件与系统自带放行判断在「执行动作之前」谁先谁后（关系到 P7「放行之后参数不许再变」）；多件改写的确定性规则 | PF-002 与拓展件那一侧；协议 | P5、P7 |
| G6 | **hook 子进程的落点与权限**：PF-005 的执行环境权限按工具授予，hook 不是工具；子进程的资源记在谁的账上 | PF-005 owner | P8 |
| G7 | **只观察档不等于没有副作用**：工作区带来的 command hook 定档只观察，但它的子进程照样执行任意命令。PF-002 §5.7 用「执行权限取问一下」管住了 Tool 与 MCP 的动作，**hook 的执行不在那张表里**——「能力可以从项目里来，权力不行」在这里有缺口 | PF-002 / PF-005 owner | 所有工作区来源的 hook |
| G8 | **Stop 续跑上限**：CC 8 次、Codex 未见上限；导入的 Stop hook 用哪一个上限，或只靠 [循环守卫](../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) | 协议；必要时 PF-012 owner | Stop、SubagentStop |
| G9 | **非 loop 事件的接收方**是否接受 hook：PF-015（SessionStart 非 compact、SessionEnd）、PF-007（Subagent*）、PF-016（Notification、MessageDisplay）、PF-002/PF-005（Config/Cwd/File/Worktree）、PF-013（ModelSwitch）、PF-006（Task*、Elicitation）、PF-010（InstructionsLoaded） | 各 PF owner | 在各自接住之前，导入报告列为「未导入，归 X」 |
| G10 | **导入后宿主配置变了怎么办**：重新导入是资产的新版本还是新资产；两家的信任模型（CC 工作区信任、Codex 按定义哈希）由资产授权取代后，是否还要保留哈希比对 | PF-002 / PF-003 owner | 导入的生命周期 |
| G11 | **兼容声明的宿主版本**：钉哪一版 CC、哪一版 Codex，升级重核由谁触发 | 实施计划 | P9 |

评审处置见 [review.md](review.md)；决定与下游入口从 [README](README.md) 导航。
