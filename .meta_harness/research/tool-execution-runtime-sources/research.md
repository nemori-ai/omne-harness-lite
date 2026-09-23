# DSH jobs 与 local-execution 对 PF-006 工具执行运行时的承载度

- 调查对象与日期：DeepSeek Harness `c291e796`（`0.1.5-rc.2`）的 `dsh-jobs` / `dsh-jobs-local` / `dsh-tool-jobs`；
  本仓库 `feat/minimal-runtime@d79484d` 的 `packages/tools/local-execution`（未进 main）。2026-09-23。
- 消费者：本程 proposal「工具运行时基线」（待出现）。
- 最近核对：2026-09-23 / DSH `c291e796`、minimal-runtime `d79484d`、PF-006 rev 14。
- 当前结论：DSH jobs 是一个**进程内、以活体 agent 实例为主人、只登记后台工作**的任务登记表，
  它的授权、首胜结算、控制器栅栏与撤除逻辑成熟，但 PF-006 最核心的三条——绑会话不绑实例、
  中途转后台＝换宿主、停机后以「失败」送回会话——**它的形状都装不下**，要改契约而不只是换实现。
  local-execution 是一个**持久账本 + 协作停止栅栏**的单机文件执行者，恢复语义扎实，但只做两种文件动作，
  明确不做 shell、后台、帧、等待态，且把停机后的在途执行落成 PF 明确拒绝的「状态不明」。
  两源大体**互补、重叠很少**；等待态、发帧、中途转后台、会话归档连带收场等责任**两源都没有**。

## 问题与区分条件

逐条问：PF 的这条要求，这份代码**原样**能不能兑现？判级只有四档，对照表按此填：

| 判级 | 含义 |
|---|---|
| **可承载** | 源的现有语义就是这条要求，最多改名或接线 |
| **需改** | 源里有对应机制，但语义偏了，改的是它**已有**的形状（默认值、词表、触发点、目标对象） |
| **不可承载** | 源的形状与要求**相矛盾**：要兑现就得换掉那一块机制，而不是调整它 |
| **未覆盖** | 源里压根没有对应的东西 |

会改变判级的观察：某条机制在源码里的实际挂钩点（例如清理挂在哪个 Cordis 作用域上）、
状态词表里有没有那个取值、记录是否跨进程存活。

## 证据入口

契约与状态词表见 [E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)；
存放与生命周期挂钩见 [E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)；
工具面与送达见 [E-3](evidence.md#e-3-dsh-dsh-tool-jobs面向模型的工具与完成送达)；
作者自承的边界见 [E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)；
前台/后台分岔与等人的实现位置见 [E-5](evidence.md#e-5-dsh-producer-与前台等待bash-与-ask_user)；
local-execution 见 [E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
与 [E-9](evidence.md#e-9-local-execution-已知问题停止与文件-io-交错)；
本项目约束见 [E-10](evidence.md#e-10-本项目约束无-in-memory-与存储协议)；
产品条款行号见 [E-11](evidence.md#e-11-产品正文的对照锚点)。

## 逐条对照：PF 条款 × 两源

「DSH」指 jobs 三层合起来；某一格只由 tool-jobs 或某个 producer 提供时在格内点名。
行号出处见 E-1～E-9；每一格的推理见[报告](reports/2026-09-23-dsh-jobs-vs-pf006.md#逐行论证)。

| # | PF 条款（rev） | DSH jobs `c291e796` | local-execution `d79484d` |
|---|---|---|---|
| 1 | **绑会话、不绑 agent runtime 与 run**，收件人是会话（[PF-006 §5.2](../../design/product/PF-006-tools-and-skills/design.md#52-工具这个词指三样东西寿命各不相同)、[§6.5](../../design/product/PF-006-tools-and-skills/design.md#65-工具执行有自己的运行时绑定在-session-上)，rev 14） | **不可承载**。授权按 session id（`jobs-local index.ts:356-360`），但生命周期挂在活体 `Agent` 的 `owner.ctx.effect` 上（`:448-464`），owner 被撤即取消并删记录（`:467-475`）；作者自述「owned background bash now stops with its agent」。逃生口「不给 owner」会丢掉会话栅栏 | **需改**。身份可承载：`CallRef.owner` 是 `StepRef(run→session{tenantId,sessionId})` 或 `WorkRef`（`work-data index.ts:10,16-20,68`）；生命周期**未覆盖**——寿命跟着单机 host 与部署租约，不跟会话 |
| 2 | **前台/后台 × 等待态两维，四种组合都成立**（[§6.6](../../design/product/PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)） | 前后台：**需改**——只有后台进登记表，前台是工具体里的普通 await（`tool-bash index.ts:348,379`）。等待态：**未覆盖**——`JobStatus` 无等待取值（`types.ts:17`）；`ask_user` 的等人是前台 await（`tool-ask-user index.ts:1-5`）。「后台 × 在等」无法表达 | **未覆盖**：`background: unsupported`（`plugin.ts:15`），无等待态概念 |
| 3 | **能否后台由工具定义声明，不声明就不能**；前台超时自动转（§6.6） | **需改**（默认值）：各 producer 以 `enableRunInBackground` 配置，**默认 true**（`tool-bash index.ts:40`）。**不可承载**（自动转）：无提升机制，见第 4 行 | 声明位**可承载**（`background.mode` 字段存在），取值只有 `unsupported`；自动转**未覆盖** |
| 4 | **转后台＝换宿主**：超时自动转、用户手动切、插队顺带触发（§6.6、[§6.12](../../design/product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)、[PF-012 §6.13](../../design/product/PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走) rev 7、[PF-014 §5.4](../../design/product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办) rev 3） | **不可承载**：「Foreground work cannot be promoted — producers choose foreground or background before starting」（`jobs README.md:122`）；前台耦合在 `exec.signal` 上，登记表里没有前台记录可供转移 | **未覆盖**：detach 固定 unsupported（`design.md:126`） |
| 5 | **中断≠失败**，占位说清原因（五种原因），分得出谁掐的（[§6.7](../../design/product/PF-006-tools-and-skills/design.md#67-用户可以中断而中断不是失败)；[PF-007 §6.10](../../design/product/PF-007-meta-capabilities/design.md#610-bkgjobs通向自己发起的执行) rev 16） | 状态**可承载**：`killed` 与 `failed` 分开（`types.ts:34`）。原因与发起者**需改**：快照无原因字段，`reason` 只转给 producer 并记日志（`tool-jobs index.ts:366`）；bash 的 spawn 失败会被记成 `killed`（`background.ts:18-22` TODO）。前台中断以 `TOOL_ABORTED` 抛错、经管线规范化为 `isError`（E-5、E-6） | 状态**可承载**：栅栏命中落 `interrupted`（`host.ts:714-717`），`controlOperation` 记下控制操作；原因取值表**未覆盖** |
| 6 | **六种收场穷举，全部以正常返回到达**（[§5.5](../../design/product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)） | **需改**：终态三种 `completed/killed/failed`；「转后台」由 producer 的正常返回 `{kind:'background', jobId}` 表达；「等不到应答」**未覆盖**；「不可用」不在 jobs 的范围 | **需改**：词表 `succeeded/failed/interrupted/unknown/cancelled_before_execution`（`types.ts:57`）——`unknown` 正是 PF 拒绝的第七种；转后台、等不到应答、不可用**未覆盖** |
| 7 | **停机后不重来，算失败**，判据是与会话失去连续性（§6.12「停机之后，它不重来」） | 「不重来」**可承载**（什么都不留，自然不会重来）；「算失败并送回会话」**不可承载**：记录只在内存（`jobs-local index.ts:1-4,102`），重启后原占位里的 `jobId` 查无此任务（`:345-348`），没有任何东西能合成那条「失败」 | 「不重来」**可承载**：有 `dispatch_intent` 无终态的一律不重放（`host.ts:247-265`）；「算失败」**需改**：现落 `unknown / effect: possible`；另，「accepted 未 dispatch」可经恢复许可继续（`design.md:164-170`），与「不重来」需对齐 |
| 8 | **会话归档时未结束的执行随之收场，不可逆**（§6.5；[PF-015 §6.3](../../design/product/PF-015-session-lifecycle-and-ownership/design.md#63-归档先停活儿再落状态) rev 10） | **需改**：有「owner 被撤 → 取消、等结算、删记录、标 `reported`」的整套机制（`jobs-local index.ts:467-475,507-531`），但触发点是 Agent 实例撤除，不是会话归档 | 机制**可承载**：`requestStop` 可对任一执行下墓碑（`host.ts:766-`）；触发点**未覆盖**（无会话归档钩子，只有 host `close()` 全停，`host.ts:1126-1160`） |
| 9 | **可单独控制**：单独中断一次、单独切后台，不动模型调用与 run（§6.12；[PF-014 §5.3](../../design/product/PF-014-inbound-intake-and-queueing/design.md#53-插队的核心原则)） | 后台单独中断**可承载**（`kill` 逐任务）；前台单独中断不在 jobs 内，经 `exec.signal`（是否能只取消一次调用而不取消整轮，**未核实**）；单独切后台**不可承载**（第 4 行） | 单独中断**可承载**（逐执行 `requestStop`，仅协作式，`force` 返回 unsupported，`host.ts:766-778`）；切后台**未覆盖** |
| 10 | **发帧**：不承诺、不预先声明、读者是人（agent 看不到），落成一条 `ToolInternalMessage` 的到达增量（[§4 发帧](../../design/product/PF-006-tools-and-skills/design.md#发帧)、[工具的产出](../../design/product/PF-006-tools-and-skills/design.md#工具的产出)） | **不可承载**：`readOutput` 是**给模型读的**单一消费游标拉取（`types.ts:85-90`；README `:121`），读一次就被消费；给人看的逐任务流式输出作者列为「separate phase」（web 注记 `:21`） | **未覆盖**：`frames: []`，`subscribe` unsupported（`plugin.ts:14`；`design.md:188-192`），并明文禁止静默降级为内存帧 |
| 11 | **等待态原语**：显式、系统看得见、说得出在等什么形状；上限看占不占资源（[§4 等待态](../../design/product/PF-006-tools-and-skills/design.md#等待态)、§6.6） | **未覆盖**（见第 2 行） | **未覆盖** |
| 12 | **卸载是第三维**，与前后台、等待态正交（[§6.10](../../design/product/PF-006-tools-and-skills/design.md#610-结果太大时卸载而卸载是第三个维度)） | **未覆盖**：`outputLimitBytes` 是首尾截断、只作用于后台读与完成提醒（`tool-jobs index.ts:110-166`），不存原件、不给取全文的路；卸载的执行 PF 另归 agent-loop | **未覆盖**：读超上限直接 `failed{limit_exceeded}`（`design.md:336-338`） |
| 13 | **转后台的执行跑完以提醒回到 agent**，收件人是会话（§6.6） | **需改**（在 tool-jobs）：`onJobDone` → 忙则 `inject`、闲则 `followup` 唤醒，带唤醒预算（`tool-jobs index.ts:278-299`）；送达目标是活体 `Agent`，owner 被撤时挂着的提醒丢失（README `:175`） | 交接端口**可承载**：`terminals` 只发身份铃、消费者重读持久终态、启动后扫描补漏（README `:28-33`）；「提醒」这一消息形态**未覆盖** |
| 14 | **每次执行留一份账，不进上下文**（[§5.4](../../design/product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)） | **需改**：只有 `startedAt/finishedAt`，且随进程消失 | **可承载**（仅文件动作）：持久账本 + 零价 `CostSource`（README `:35-42`） |
| 15 | 租户隔离：受租户所有权约束的对象显式携带租户（系统全局约束） | **未覆盖**：授权只比 session id，无租户维度 | **可承载**：执行身份经 `SessionRef/WorkRef` 携带 `tenantId` |
| 16 | 执行落点与执行环境权限三态、落点不可用即拒绝（[PF-005 执行环境权限](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限)、[§6.9](../../design/product/PF-005-execution-environments-and-sandboxes/design.md#69-落点不可用就是拒绝不降级) rev 5） | **未覆盖**：jobs 不管落点，归各 producer 与沙箱层 | **未覆盖**：只有一个部署独占目录，明言「not a sandbox claim」（README `:12-14`） |

## 当前结论

### DSH jobs 的后台任务寿命挂在 owner 那个活体 Agent 实例上，不挂在会话上

`start` 对有 owner 的任务调用 `ensureOwnerCleanup`，要求该 `Agent` 正是 agent 注册表里的当前实例，
然后在 `owner.ctx.effect(...)` 上挂一个异步清理；这个 Cordis 作用域一撤，清理就取消该 owner 的全部任务、
等结算、**从登记表删掉记录**。授权用的是 session id 相等，但清理与送达用的是对象身份——作者明写
「session equality grants access, but exact object identity selects cleanup and completion delivery」。
所以 PF-006「发起它的 agent runtime 哪怕已经退役也不影响」在 DSH 里恰好相反：**agent 实例退役，后台任务跟着死**。
想让任务比 agent 活得长，DSH 给的唯一办法是不设 owner，而那样任务对任何调用者开放、没有会话栅栏，并活到服务撤除。

- 适用范围：`c291e796` 的 `dsh-jobs` 契约与 `dsh-jobs-local` 实现。
- 代价与不适用：要兑现 PF §6.5，改的是契约面——`JobStart.owner`、`JobDoneListener` 的 owner 参数、
  不变式里 `ownerSession` 与 owner 对齐（`invariant.ts:39-42`）、tool-jobs 的送达目标，全部以 `Agent` 为类型；
  换成会话引用等于重写这个 Service Definition 的一半签名，而**所有 producer（bash、pwsh、terminal、subagent）都按现签名编程**。
  反面：DSH 这一套「清理挂在 owner 作用域 + 同 id 换实例不串台」有 55 条单测覆盖，机制本身是成熟的。
- 撞上这条事实会怎样：直接复用而只换存储，结果是 agent runtime 每次被回收（PF-012 允许它随时起灭）都悄悄杀掉会话里的后台构建，**不报错**。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)、[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 只登记后台工作，前台执行不进登记表，也不能中途转后台

前台还是后台由 producer 在调用开始时二选一：bash 只有 `run_in_background === true` 才走 `jobs.start`，
否则直接 `await ctx.shell.run(..., signal: exec.signal)`。登记表里从来没有前台执行，也就没有「把这一条换个宿主」的对象。
作者把「foreground work cannot be promoted」列为已知限制，并说明理由：提升需要一个 SDK 没有规定的用户交互契约。
PF-006 的三个转后台触发源（超时自动转、用户手动切、插队顺带触发）**全部依赖中途转**。

- 适用范围：`c291e796`；bash、pwsh、terminal、subagent 四个 producer 都按此模式接入（注记 `:88`）。
- 代价与不适用：要兑现就得让前台执行也登记、并能在运行中把取消权从 `exec.signal` 转给登记表——
  这是 producer 接口（`run()` 在调用开始时同步返回钩子）之外的新形状。
  反面：DSH 在「id 一经发布，取消权就归任务自己」这一点上已经想清楚（注记 `:32`），这正是换宿主的后半段。
- 来源：[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)、[E-5](evidence.md#e-5-dsh-producer-与前台等待bash-与-ask_user)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 的记录只在进程内存里，而且契约本身携带进程内对象，不只是实现选了内存

`dsh-jobs-local` 的 store、每 kind 计数器、waiter、作用域分层表、owner 清理表都是进程内 `Map`/`Set`；
README 两处明说任务随进程消亡、不跨重启。更要紧的是**契约层**：`JobStart.run()` 同步返回闭包钩子、
`done` 是一个 `Promise`、owner 与完成监听参数都是活体 `Agent`、id 由进程内计数器生成 `<kind>-N`（重启后从 1 重来）。
DSH 自己两次写明：持久或跨进程后端要先重塑 identity、restart、ownership、observation 才能实现这个契约。

- 适用范围：`c291e796`。
- 代价与不适用：在 D-026「存储与消息队列不提供 in-memory 实现」之下，改动面是
  （a）重写 `jobs-local`（534 行）为经 `core/storage` 的提供者；（b）改 `types.ts` 的 owner、listener、id 生成；
  （c）把 `reported` 做成持久字段——它决定完成提醒发不发，重启后丢了就会重复提醒或漏提醒；
  （d）补一条恢复路径（DSH 完全没有）。**判断前提**：D-026 只点名存储与消息队列，
  取消回调、waiter 这类活体句柄本质上只能在进程内，本轮把它们算作「运行时句柄」而非「内存版基础设施」；
  这个划分 D-026 没有表态（[E-10](evidence.md#e-10-本项目约束无-in-memory-与存储协议)）。
- 撞上这条事实会怎样：只把 `Map` 换成表而不改契约，重启后表里有记录、却没有能 `cancel` 它的钩子，也没有能收它结果的 `Agent`——**记录与事实对不上**。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)、[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)、[E-10](evidence.md#e-10-本项目约束无-in-memory-与存储协议)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 的状态词表没有等待态，也没有「等不到应答」

`JobStatus` 只有 `running | stopping | completed | killed | failed`。DSH 里的「等人」是 `ask_user_question`
这个前台工具体内的一次 await，由 UI provider 回答；系统看得见的只是「一个工具调用还没返回」。
PF-006 要求等待态是**显式状态**、说得出在等什么形状、四种组合（含后台在等）都成立——DSH 两源里都找不到对应物。

- 适用范围：`c291e796`，查过 `packages/jobs/*`、`packages/interaction/{tool-ask-user,user-questions}` 的入口。
- 代价与不适用：等待态与「等不到应答」收场要从零加进状态机与收场词表。反面：DSH 的 `stopping` 中间态
  （已请求取消、producer 尚未释放资源）是 PF 词表里没有、但对「物理上还没停」有诊断价值的一格。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-5](evidence.md#e-5-dsh-producer-与前台等待bash-与-ask_user)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 分得开 killed 与 failed，但不记录中断的原因类别与发起者

终态里 `killed` 与 `failed` 分开，`job_kill` 落 `killed`，这与「中断不是失败」同向。
但快照没有原因字段：`reason` 只原样转给 producer 并写日志；agent 主动掐、owner 撤除、服务撤除都落同一个 `killed`。
PF-006 §6.7 要求占位说清五种原因之一，PF-007 §6.10 要求分得出是 agent 掐的还是用户叫停的。
另有一个反向风险：bash 的非沙箱 spawn 失败目前会被映射成 `killed`（源码 TODO），即**真失败可能以「被中断」出现**。

- 适用范围：`c291e796`。
- 代价与不适用：需在快照与完成提醒里加结构化原因；bash 的失败映射要先修。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-3](evidence.md#e-3-dsh-dsh-tool-jobs面向模型的工具与完成送达)、[E-5](evidence.md#e-5-dsh-producer-与前台等待bash-与-ask_user)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH 的后台开关默认开启，与 PF-006「不声明就不能后台」方向相反

后台能力由各 producer 的 `enableRunInBackground` 配置决定，默认 `true`；jobs 运行时本身不改写 producer 的 schema。
PF-006 §6.6 明确「不声明就是不能后台，默认往保守的那一边倒」。

- 适用范围：`c291e796` 的 bash producer 源码；注记称 terminal、subagent 同样默认 true（未逐一核对源码）。
- 代价与不适用：默认值翻转本身便宜；但 DSH 的「声明」是部署配置而不是工具定义的一部分，
  与 PF 把它放在工具定义里的归属不同。
- 来源：[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)、[E-5](evidence.md#e-5-dsh-producer-与前台等待bash-与-ask_user)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 运行时与 tool-jobs 在代码依赖上可分离，但完成送达与 reported 语义横跨两者

依赖方向是单向的：tool-jobs 注入 `jobs`，运行时两包不引用 tool-jobs。运行时对工具面的唯一要求是
「`start` 时必须有控制器服务这个 owner」，而 `attachController(name)` 是公开方法，作者明说非模型的控制器可以自己挂。
所以**只取运行时、不取工具面在代码上可行**。但有两样东西会跟着留在工具面那一侧：
（1）完成送达——把结算变成 agent 会话里的提醒、忙时注入闲时唤醒、唤醒预算——全在 tool-jobs 的 `onJobDone` 里；
（2）运行时契约里的 `reported` 字段、`kill`/`read`/`wait` 置 `reported` 的规则，是**为 tool-jobs 的提醒去重而设计的**，
不取工具面，这个字段在契约里就成了没有消费者的语义。
工具面这边另外拉入 `dsh-llm`、`dsh-output-retention`、`dsh-tools`、`dsh-system-prompt`、`dsh-agent`
的收件箱事件 `agent/inbox/claimed` 与 `tools/pre-execute` 瀑布——这些都是 DSH 自己的 agent loop 与工具管线契约。

- 适用范围：`c291e796`。
- 代价与不适用：只取运行时，要自己写一个控制器与一个完成监听，并决定 `reported` 的归属；
  取工具面则等于同时接受 DSH 的 agent 收件箱模型。PF-007 的 `BkgJobs()`（list/output/terminate）
  与 tool-jobs 三工具在命令形状上一一对应，但 PF 要求「看得见的范围＝当前 session」，tool-jobs 的视野是「当前 Agent 实例」。
- 来源：[E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)、[E-3](evidence.md#e-3-dsh-dsh-tool-jobs面向模型的工具与完成送达)、[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)
- 最近核对：2026-09-23 / DSH `c291e796`

### DSH jobs 的流式输出是给模型读的单游标拉取，不是给人看的帧

`readOutput()` 返回「自上次调用以来」的增量，每个任务只有一个消费游标，由 `job_output` 替模型读走。
PF-006 的帧读者是人、agent 看不到、落成一条 `ToolInternalMessage` 的到达增量；两者的读者与消费语义相反。
DSH 给浏览器的只有整张任务列表快照，逐任务的给人看的输出流作者列为下一阶段、本 commit 未实现。

- 适用范围：`c291e796`。
- 代价与不适用：帧原语要另建；若同时保留给模型的拉取，二者不能共用这个会被消费掉的游标（作者自述）。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)
- 最近核对：2026-09-23 / DSH `c291e796`

### local-execution 只执行预登记文件的有界读与带修订校验的替换写，不执行 shell、不后台、不发帧、没有等待态

工具定义固定为一个 `local_file` 多命令工具，命令只有 `read{targetId}` 与 `write{targetId,text,expectedContentRevision}`；
定义里 `frames: []`、`background: unsupported`、`stop: cooperative_fence`。设计正文明写不执行 shell、子进程、网络、
动态回调、后台或脱离。它**实际做到的**是：执行前后的持久账本（`accepted → dispatch_intent → temporary_opened → rename_intent → terminal`）、
即使先于 start 也能落的停止墓碑、静止证据、`physical/cleanup/effect` 三维分开记、重启不重放、
执行身份携带租户与会话、零价计费来源。

- 适用范围：`feat/minimal-runtime@d79484d`，未进 main。
- 代价与不适用：它的设计依据是已退役的旧设计链（迁移 tools v1），不是现行 PF；
  所有「可承载」只说明机制形状对得上，**不说明它符合任何已接受契约**。只支持 Linux、Node 24，测试依赖 `/proc`。
- 来源：[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23 / minimal-runtime `d79484d`

### local-execution 停机恢复从不重放，但把在途执行落成「状态不明」而不是「失败」

有 `dispatch_intent` 而无终态的 attempt，恢复时一律追加一条 `outcome: unknown, effect: possible, cleanup: retained` 的终态，注明不可安全重放。
这与 PF-006 §6.12「不重来」一致，但与「落成失败而不是状态不明」直接相反——PF 明写「登记成状态不明会多出第七种收场」。
另外，只有 `accepted`、尚未 `dispatch_intent` 的 attempt，设计允许经恢复许可**继续执行**；PF 的「停了就不重来」没有为「还没真正动手」留例外。

- 适用范围：`d79484d`。
- 代价与不适用：词表层改动小（把收场映射到「失败」），但 local-execution 的 `effect: possible` 与 `physical: unknown`
  携带了 PF 收场词表装不下的信息（效果是否可能已发生、物理上是否已静止）；映射成「失败」时这两维放到哪里，PF 没有说。
  「accepted 未 dispatch 可继续」与「不重来」的冲突需由设计方裁定，本轮不判。
- 来源：[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23 / minimal-runtime `d79484d`

### local-execution 的执行记录是自有 JSONL 账本，不经 core/storage 协议

账本是状态目录下的 `execution-ledger.jsonl`，每条追加后 `fsync` 文件与目录，按序号严格校验前缀；
上限 64 MiB（单条 2 MiB），没有压缩或轮转，写满即 `ledger_capacity_exceeded`。它**不是 in-memory**，
但也不走 main 上的 `core/storage`（Kysely 事务协议）；host 里有 16 处 `ledger.append`。

- 适用范围：`d79484d`；`core/storage` 对照的是 main `2c1a108`。
- 代价与不适用：改走存储协议，要把「每次文件 I/O 之前有一条已耐久的意图」这条顺序保证改写成事务提交，
  并把前缀校验、恢复折叠改成查询；64 MiB 上限对「超长期待机」的系统意味着账本终会写满，而现实现没有出路。
- 来源：[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)、[E-10](evidence.md#e-10-本项目约束无-in-memory-与存储协议)
- 最近核对：2026-09-23 / minimal-runtime `d79484d`

### local-execution 的停止是协作式栅栏，不承诺限时强停；停止与 I/O 交错的竞态已发现、只做了局部修复

`requestStop` 先落墓碑，再等已发出的 syscall 真实结束；等超时只报 `physical: unknown, cleanup: retained`，
`force` 模式固定返回 unsupported，从不签发 `forced_isolation`。2026-09-16 发现：rename 前最后一次放行检查与真正调 `rename`
之间有异步交错，墓碑已耐久时 rename 仍会发出并记成功；`e14a34c` 窄修 rename，`245ef05` 把 rename 前各步统一走 host 串行门，
二者都在 `d79484d` 之内。实施侧自己写明：这只是局部证据，不替代规格落条，也不证明跨 Tools/Budget/Run 的验收。

- 适用范围：`d79484d`；本轮读了源码，未运行测试。
- 代价与不适用：PF-014 的插队要「单独中断一次工具执行」立刻生效；协作式停止下，一个卡在内核里的 syscall 会让这次执行停在
  「已请求中断、物理未停」任意久，而 PF 的收场词表里没有这一格。
- 来源：[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)、[E-9](evidence.md#e-9-local-execution-已知问题停止与文件-io-交错)
- 最近核对：2026-09-23 / minimal-runtime `d79484d`

### local-execution 的 rename 竞态窗口靠部署独占租约兜底，陈旧租约只能人工证明后移除

Node 无法让「最后一次修订核对 → rename」成为条件操作，所以 host 构造时以 `O_EXCL` 创建 `active.lock` 并持续核验；
租约文件已存在（无论是活着的另一个 owner 还是崩溃遗留）即拒绝启动，提示「remove it only after proving the prior owner cannot run」。

- 适用范围：`d79484d`。
- 代价与不适用：崩溃之后**不能自动恢复服务**，需要部署层证明旧 owner 已不可能再运行；这与「超长期待机、稳定运行」的产品目标之间是一笔运维代价。
  它也把执行者钉死在单机单实例，与「未来可独立扩展为分布式」的全局约束之间没有现成过渡。
- 来源：[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23 / minimal-runtime `d79484d`

### 两源在语义上大体互补，重叠只在 start / stop / inspect / 终态通知这四个动作的形状上

DSH jobs 解决的是「一堆异构的长活，谁能看、谁能停、跑完怎么告诉谁」——身份、授权、列表、首胜结算、完成送达；
它不关心效果是否已发生、物理上是否已停、重启后怎么办。local-execution 解决的是「一次有外部效果的执行，怎样在崩溃与停止下仍说得清发生了什么」——
持久意图、墓碑、静止证据、不重放；它不关心后台、列表、多种 producer、给 agent 的提醒。
两者都有 start、stop（kill / requestStop）、inspect（get / inspect）与终态通知（`onJobDone` / `terminals.subscribe`），
但语义不同：DSH 的 kill 置 `stopping` 后等 producer 结算，local-execution 的 stop 先落墓碑、以真实静止证据收口。

- 适用范围：两源各自的上述版本。
- 代价与不适用：两者的对象身份不相容——DSH 以 `<kind>-N` + 活体 `Agent`，local-execution 以 `CallRef{owner, callId, attemptId}` + 执行 epoch/代次；
  拼在一起需要先定一个共同的执行身份。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)、[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23 / DSH `c291e796`、minimal-runtime `d79484d`

### DSH jobs 的依赖面超出 Cordis 本身，且所对 Cordis 版本与本项目不同

契约包 peer 依赖 `dsh-agent`、`dsh-session`、`dsh-brand`、`dsh-invariants`；实现包再加 `dsh-scope`（`ScopedLayers`、`scopeOf`，
决定控制器与监听「对哪些 owner 生效」）、`dsh-timeout`、`schemastery`，并在运行时 `ctx.get('agents')` 取 agent 注册表；
工具面再加 `dsh-llm`、`dsh-output-retention`、`dsh-tools`、`dsh-system-prompt`。
Cordis 用的是 DSH 仓库内 vendor 的 `@deepseek-ai/cordis@4.0.2`，本项目 catalog 钉 `4.0.4` 官方包。
local-execution 则**完全不导入 Cordis**（它的「plugin」是普通类），唯一运行依赖 `work-data` 也只在 minimal-runtime 分支。

- 适用范围：`c291e796`、main `2c1a108`、`d79484d`。
- 代价与不适用：复用 DSH jobs 意味着连带 fork 或重写 `dsh-scope` 的作用域分层与 `dsh-agent` 的注册表/收件箱语义；
  4.0.2→4.0.4 之间 `Service`、`ctx.effect` 的行为差异本轮未验证。local-execution 的 Cordis 映射只存在于它的 design.md，未实现。
- 来源：[E-1](evidence.md#e-1-dsh-dsh-jobs-契约对象状态owner-与钩子)、[E-2](evidence.md#e-2-dsh-dsh-jobs-local进程内实现)、[E-3](evidence.md#e-3-dsh-dsh-tool-jobs面向模型的工具与完成送达)、[E-7](evidence.md#e-7-cordis-版本许可证与上游状态)、[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23

### DSH jobs 是 MIT 许可的预发布代码，契约在三个月内变过形

三包与仓库根均为 MIT；版本 `0.1.5-rc.2`。注记显示：2026-06-20 引入时是一个具体服务、Service API 列 8 个方法；
2026-07-26 拆成定义/提供者两包、方法增至 9 个（加 `onJobsChanged`）；2026-08-11 先后加入每 owner 并发上限与闲置唤醒。
local-execution 为 `UNLICENSED` 的项目私有包。

- 适用范围：`c291e796` 的注记与 `package.json`。
- 代价与不适用：MIT 对 fork 与改写没有障碍；但若跟随上游，这个契约仍在变，每次升级都要重核本页全部行。
  未查 DSH 的 git 历史，变更频率只来自注记日期。
- 来源：[E-4](evidence.md#e-4-dsh-决策注记运行时的设计理由与自承代价)、[E-7](evidence.md#e-7-cordis-版本许可证与上游状态)、[E-8](evidence.md#e-8-minimal-runtime-local-execution范围形状与明确不做)
- 最近核对：2026-09-23 / DSH `c291e796`

### 以下 PF 责任两源都没有承载，查过对照表全部 16 行

用 PF-006 的语言，**任何一源都没覆盖**的是：

1. **以会话为宿主的后台执行**：生命周期绑会话，agent runtime 退役、run 结束都不影响，收件人是会话（对照表 1、13）。
2. **前台执行也是一次可指认、可单独控制的工具执行**（2、9）——DSH 只登记后台，local-execution 只登记两种文件动作。
3. **中途转后台＝换宿主**，三个触发源（前台超时、用户手动切、插队顺带触发），且「不声明就不能后台」（3、4）。
4. **等待态**：显式、系统看得见、说得出在等什么形状，与前后台四种组合；以及「等不到应答」这一收场（2、6、11）。
5. **发帧**：不承诺、不预先声明、读者是人、汇成一条 `ToolInternalMessage` 的到达增量（10）。
6. **六种收场的完整词表与占位原因**：五种原因（用户手动中断 / 转后台 / 因插队转后台 / 因插队被中断 / 人拒绝回复），
   并分得出中断是谁发起的（5、6）。
7. **停机、失去连续性之后把未结束执行落成「失败」并送回会话**（7）——需要在途执行的持久登记加恢复时合成终态；
   local-execution 有前一半，落的终态不对；DSH 两半都没有。
8. **会话归档时中断会话名下的未完成执行，且撤销归档不接回**（8）——两源都有可用的停止机制，都没有这个触发点。
9. **执行落点与执行环境权限三态、落点不可用即拒绝**（16）——两源都不管（这条归 PF-005 那一侧的运行时，列此备查）。

- 适用范围：本轮对照的两源版本与 PF-006 rev 14。
- 代价与不适用：这张清单只说「两源都没有」，**不说这些都该归工具执行运行时自研**——其中卸载（对照表 12）按 PF 归 agent-loop，
  落点（16）归执行环境一侧，未列入上面九条之外的边界由设计方划。
- 来源：本页对照表
- 最近核对：2026-09-23

## 对照中暴露的产品正文张力（只记录，不裁）

1. **「绑会话、不绑 agent runtime」与「前台时宿主是 agent runtime」两种说法并存。**
   [UL-tool-execution](../../design/ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)
   与 PF-006 §5.2、§6.5 写的是无条件「不绑 agent runtime」；PF-006 §6.12 宿主表与 PF-012 §6.13 写前台的宿主就是 agent runtime、run 中断就跟着停；
   [领域对象条目](../../design/domain_objects/objects.md#ul-tool-execution--工具执行)已按后者写成「前台时是 agent runtime；转后台即换成会话」。
   对「前台执行被 agent runtime 回收时怎么办」，两种读法给出相反答案。
2. **PF-006 §6.12 把「agent runtime 被回收」列为「停机」的一种**（`:923-925`），而同一篇 §5.2（`:362-364`）说后台执行不受发起它的 agent runtime 退役影响。
   对已转后台的执行，这两句只能有一句成立。
3. **「转后台」既是六种收场之一，又不是这次执行的终局**：占位消息以「转后台」收场，执行本身还在跑、之后另有真正的结局（完成/失败/被中断）以提醒到达。
   PF-006 §5.5 与 UL-execution-outcome 称六种为「终局」，没有说后台执行的第二次结局落在哪种收场词表里。
4. **PF-012 I-7「等人回话的时间不消耗计算资源」、协程可先被取消**，与「前台工具执行跟着宿主停」放在一起：
   一次停在 `Ask()` 上的前台执行，其宿主被取消时它是「被中断」还是「持久等待后接续」，正文没有交代（PF-014 只处理了插队这一种触发）。
5. **归档对在途执行的措辞不一**：PF-015 `:121`、`:512` 写「被中断」，`:331` 写「被取消」，`:515` 说三件事都是「取消」；
   PF-006 §6.5 只说「随之收场」未指明是六种中的哪一种。
6. **停机后「不重来」没有为「尚未动手」留例外**：local-execution 的实现经验表明「已接纳但未发出任何 I/O」与「已发出 I/O」可以被区分；
   PF 按「可能已在外面做了事」给出理由，却对前者也一并判失败。这是来源经验给出的一个待裁问题，不是 PF 的错误。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| DSH 除 bash 外的 producer（pwsh、terminal、subagent）也只在开始时二选一前后台 | 「只登记后台工作」 | 部分：注记 `:88-98` 自述如此；只核了 bash 源码 |
| D-026 的「不提供 in-memory」不涵盖活体运行时句柄 | 「记录只在进程内存里」一条中的改动面估计 | 未核对：D-026 未表态，属判断前提 |
| 抽取副本与 `c291e796` 一致 | 全部 DSH 结论 | 已核对：`SHA256SUMS` 与 `tmp/sources/README.md` 的钉住记录 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| DSH 能否只取消一次前台工具调用而不取消整轮 | 读 `packages/core/tools` 注册表与 agent-loop 里 `exec.signal` 的来源与派生 | 对照表第 9 行 DSH 列 | 调研执行者，下一轮 |
| Cordis 4.0.2（DSH vendor）与 4.0.4 在 `Service`、`ctx.effect`、scope 撤除顺序上的差异 | 对两个版本的 changelog 与源码 diff | 任何直接移植 DSH jobs 代码的选择 | 调研执行者或内核实现者 |
| local-execution 的 29 条测试在 `d79484d` 上是否全绿 | 在该工作树运行 `pnpm test` | 结论「停止与 I/O 交错已局部修复」的实测支撑 | 需有权运行的人；本轮只读 |
| 上面「产品正文张力」1～6 | 产品负责人裁定 | 运行时基线里执行的宿主、停机判据、后台第二次结局的词表 | 产品设计方 |

## 采用与后续核对

尚无消费者采用本研究；预期消费者是本程 proposal「工具运行时基线」。
DSH 采用版本变动时 grep `c291e796`，minimal-runtime 前进或合入 main 时 grep `d79484d`，重核对照表对应列；
PF-006 升 rev 时逐行核对第一列的锚点与原文。触及结论的变化按本家族演进事件词另记 `changelog.md`。
