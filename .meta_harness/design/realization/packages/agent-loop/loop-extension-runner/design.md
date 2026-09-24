# loop-extension-runner 实现设计

契约：[`capability.loop-extension-runner` v1](../../../../spec/capabilities/loop-extension-runner/v1/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的插件名、服务名、方法名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**自建，不 fork。**D-033 接受的 hooks 兼容层起点明写「不取 DSH 的 `runner`」（[D-033](../../../../record/decisions/hooks-compat-baseline/decision.md#选择与范围)）——它的「执行器拒绝 ⇒ 非阻断、永不抛」正是本契约 S-12 末条不继承的方向。

- **求值不用 Cordis 的事件派发**：`emit` 丢掉返回值，`bail` 遇到异步监听者就把 Promise 当作结论交回、不等它（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)）；本契约 S-10 第 5 条要 runner 自己等每一件。链的次序与成员是会话级数据（装配清单），不是 Cordis 的注册序。runner 按清单逐件 `await` 直接调用实现。**名字相同、含义不同**：契约说的「逐件顺序求值」不是 Cordis 的 `waterfall`（契约 S-10 的注）。
- **复用**：结论、输入、声明、记录的形状与表示层校验取同批纯模块 `packages/core/tool-model`（`data.loop-extension` v1）；消息与块取 `packages/core/message-model`；共用件 `definePlugin`、`resolveOptional`、`Outcome` 取 [kernel-basis](../../core/kernel-basis/README.md)。
- **效果合成、三张处置表都是纯函数**（契约 S-12、S-13、S-15、S-17 的表），与插件分开导出，场景逐格演练它们。

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 服务键（候选）与方法 | 必需 inject | 调用时取用（`resolveOptional`） | 配置 |
|---|---|---|---|---|
| 插件 `loop-extension-runner` | `loopExtensionRunner`：`dispatch`、`replay`（契约 S-21、S-22）；`loopExtensionImplementations`：`registerBuiltin(builtinName, 实现) → 注销函数`、`registerCommandExecutor(执行器) → 注销函数` | `sessionLog`（块 D，无契约） | `assemblyManifest`（装配清单读面，PF-004 的契约未起草）；`modelRuntime`（`legalTargets`、`canDispatchAgain`）；`toolAdmission`（`admit`，本批无提供者）；依赖在场判定面（候选 `dependencyPresence`，无契约） | 无 |

- **只 inject 会话日志**：草图写派发器「inject：会话日志读写」、其余一律可选取用——`inject` 没有可选形式（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），写进去就等于「没有它我不跑」，而本契约要的是「实现缺席即那一件不可用，不是 runner 不可用」（契约 S-4）。
- **配置错误政策**：本插件没有配置。重复登记同一个 `builtinName` 或第二个命令执行器 ⇒ 登记方法抛出 ⇒ **登记者**的插件体抛出、`FAILED`、装配启动失败——与同批各节点同一条「配置错误即启动失败」；runner 自己不受影响。

### 实现怎样在场：贡献者登记，runner 从不 inject 贡献者

照草图「贡献的统一形状」：贡献者 inject `loopExtensionImplementations`、登记、拿回注销函数、包进自己的 `ctx.effect`；**登记的寿命等于贡献者 fiber 的寿命**。runner 在求值那一刻按名查表，查不到即那一件「此刻不在」（契约 S-7「runner 不装载、不启动任何实现」）。

| 贡献者 | 登记什么 | 节点 |
|---|---|---|
| 模态转换那一件 | `registerBuiltin` | [modality-projection](../../model/modality-projection/README.md) 的 P-3 |
| 默认重试件 | `registerBuiltin` | [model-request-runtime](../../model/model-request-runtime/README.md) 的 P-5 |
| 卸载判定 | `registerBuiltin` | `packages/tools/tool-execution-runtime`（同批，由那边定） |
| 循环探测 | `registerBuiltin` | agent loop 那一程（尚无节点） |
| 兼容件的外部命令执行器（`implementation.kind = command` 的全部件） | `registerCommandExecutor` | [hooks-import](../hooks-import/README.md) |

- **放行判断不走登记表**：它那一格对一轮动作**整批调一次** `admit`（契约 S-29 第 5 条），输入是 `capability.tool-admission` 自己的形状、不是统一输入；所以它的「实现」就是调用时取用的 `toolAdmission` 服务。本批没有提供者 ⇒ 每一轮都「不可用」⇒ 全拒件顶上（契约 S-17）——**这是本批的已知收场，不是缺陷**。
- **登记面受限**：只许上表的系统包解析 `loopExtensionImplementations`（静态检查候选规则，同 organization-governance 的 `restricted-call-sites`）。理由：系统自带件有四样特权（契约 S-7），任何够得着登记面的一方都能冒一个 `builtinName`；放行判断「不得被替换」由它不在登记表里、只经 `toolAdmission` 兑现。
- **「实现在求值中途被撤下」的机制**（契约 S-34 第 4 行）：每条登记带一个代际；一次求值开始时捕获那条登记，返回时若它已被注销（代际变了），这一次按**报错**记（`error` 写明「实现在求值中途被撤下」），不采用它交回的东西。内核不取消在途调用，所以不靠「中断那次调用」——那次调用照常跑完，只是结果不被采用。

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 一次经过与锚 | `dispatch` 按位置从输入与日志推锚 | 尚未实现 | **受阻于契约 G-1**：锚在日志里怎么落未定，「由日志推出」那几行写不成代码 |
| S-6 链从装配清单来；两处末位 | 经过开始时经 `assemblyManifest` 读一次链（之后不变）；按能力标识把放行判断、模态转换移到各自链末；清单里没有它们也在链末认一件 | 同上 | 放行判断的标识已定（`omne-official:admission-judgment`）；**模态转换的标识未定型**（契约 G-3，modality-projection 节点 MP-N2），认不出就钉不了；清单里四样值怎么表示是契约 G-2 |
| S-7 系统自带件 | 登记表（上节）；认法只凭能力标识 | 同上 | 循环探测、重试的标识同在契约 G-3 |
| S-8 不持有运行实例里的状态 | 除登记表（实现句柄，不是事实）之外没有任何状态；「已有结论」「连续否决次数」都现读日志 | 同上 | 重启、换协程、换实例不改任何一次经过的结果 |
| S-9 日志只读句柄 | 每一件每一次调用新造一个句柄：只读、查询一律限定在清单指认的那个会话；调用返回即作废（代际标记），作废后读取失败 | 同上 | 读的接口本身归会话日志（块 D） |
| S-10 逐件顺序、先落后算 | 逐件 `await` 实现 → 两类判断 → 结论追加确认落盘 → 才开始下一件 | 同上 | 场景 S-36、S-38 |
| S-11 每件恰一条结论 | 带栅栏的经过靠尝试栅栏、无运行的经过靠条件写入（[RL-2、RL-3](#存储要求)） | 同上 | 场景 S-47 |
| S-12、S-13、S-17 不可用、报错、关门表 | 纯函数三张表；判「不可用」四种情形：`needs` 不在场（问依赖在场判定面）、登记表查不到、实现在开始之前报「起不来」、放行判断的依据缺项 | 同上 | 依赖在场判定面没有契约（RUN-N5） |
| S-14 两类合法性判断 | 表示层校验取 `packages/core/tool-model`；`select_model` 问 `modelRuntime.legalTargets`、`retry` 问 `modelRuntime.canDispatchAgain` | 同上 | 判定来源缺席 ⇒ 这一次 `unavailable`、那一件不留记录 |
| S-15 效果合成 | 纯函数：已落结论 → 效果 | 同上 | 场景逐格 |
| S-16 缺席默认答案 | 清单读面缺席或读不到 ⇒ `unavailable`；读面答「没有这份清单」⇒ `manifestMissing` | 同上 | 场景 S-43 |
| S-18 只跑一轮 | 再 `dispatch` 同一次经过即回放（S-28） | 同上 | 受阻于 G-1 |
| S-19 提醒 | 经过走完、交出效果之前按链序追加，每条以 `MessageId` 条件追加（[RL-4](#存储要求)）；每条提醒由 runner 自己发起一次嵌套的 `before_persist_message` 经过 | 同上 | 提醒的 `id`、`createdAt` 由谁给是契约 G-5 |
| S-21 `dispatch` | `loopExtensionRunner.dispatch`；`before_action` 带 `actions` 时各动作的经过并发推进到放行判断那一格，会合后调一次 `admit`，结果按 `CallId` 分回 | 同上 | 凭据经哪一格交出是契约 G-16；答复三种表示是契约 G-17 |
| S-22 `replay` | `loopExtensionRunner.replay`：只读，不受栅栏 | 同上 | 受阻于 G-1 |
| S-23～S-30 效果之后与回放、一批、连续否决 | runner 只落结论、合成效果、追加提醒；连续否决次数从日志数，上限是运行时设置（从装配清单的求值结果取） | 同上 | 上限读不到 ⇒ `unavailable`（契约 S-30 第 3 条）；设置的来路同 RUN-N2 |
| S-31 不开事件 | 不 `emit`、不监听 | — | [事件](#事件派发过滤与边界) |
| S-32 左列、S-33、S-34 | 见[装配给 vs 协议给](#装配给-vs-协议给)与[装卸表](#成对的装载与撤除) | — | 取消的收场值见 RUN-N4 |

### inject 边与换代时收掉的在途事实

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| runner → `sessionLog` | 必需 | runner 插件体重跑，两个服务重新 provide；登记表随旧实例没了，**贡献者都 inject 登记面、随之重跑并重新登记**；inject `loopExtensionRunner` 的调用方重跑。**在途的 `dispatch` 跑在调用方的协程上、拿着旧引用继续**：已提交的结论留在日志里，后面的提交若写不进即 `unavailable`；下一次对同一次经过的 `dispatch` 从日志接着走（回放）。**没有需要交接的活状态** | S-8、S-33 末段 |
| runner ⇢ `assemblyManifest` | 调用时 | 不重跑；缺席或读不到 ⇒ `unavailable`，不当空链 | S-16、S-33 |
| runner ⇢ `modelRuntime` | 调用时 | 不重跑；缺席 ⇒ 那一件判不出 ⇒ `unavailable`、不留记录，不当「合法」也不当「不合法」 | S-14、S-33 |
| runner ⇢ `toolAdmission` | 调用时 | 不重跑；缺席 ⇒ 放行判断不可用 ⇒ 全拒件 | S-17、S-29 第 7 条 |
| runner ⇢ `dependencyPresence` | 调用时 | 不重跑；缺席 ⇒ 带 `needs` 的件判不出 ⇒ `unavailable`；不带 `needs` 的件不受影响 | S-12 ①、S-16 |
| 五类贡献者 → `loopExtensionImplementations` | 必需（在各自节点） | 贡献者重跑、重新登记；其间那一件「此刻不在」：系统自带件由指定挂件顶上，兼容件按它声明的处置（导入件恒 `skip`） | S-12、S-17、S-34 |
| agent runtime、入站受理方 → `loopExtensionRunner` | 必需（在各自节点，尚无） | 调用方重跑即新的一次尝试，回放接着走 | S-28、S-34 |

### 事件：派发、过滤与边界

- **不发、也不监听任何 Cordis 事件**（契约 S-31）；所以没有 `emit`／`serial`／`bail`／`waterfall` 的选择，也没有 `thisArg` 过滤器要设。需要知道「某件下了什么结论」的一方读日志。
- **F② 依赖消失时谁被卸载**：只有会话日志的换代会卸载 runner；其余依赖缺席只让那一件或那一次失败，范围最小。
- **F③ 有没有一条通道能越过会话或租户边界**：没有事件。能读东西的只有日志只读句柄：它的每一次查询都限定在清单指认的那个会话，**没有能指认别的会话的参数**；调用返回即作废。登记表是部署范围的（系统装配的实现不按租户分份），里面只有实现句柄，不带任何会话数据。

### 存储要求

对会话日志提供者的要求（块 D，**无契约、无节点**；本节点只能列——缺口 RUN-N1）。与 [model-request-runtime 的 L 系列](../../model/model-request-runtime/design.md#存储要求)落在**同一本日志、同一个尝试行**上，两边各写一条、互指。

| # | 要求 | 对应契约条款 |
|---|---|---|
| RL-1 | 每条结论一次追加，确认即落盘；确认之前 runner 不开始下一件 | S-10 第 2 条、S-32 第 1 行 |
| RL-2 | **尝试栅栏在写入边界上判**：带运行的经过（含它引出的嵌套经过）的每一次写，在同一存储事务里锁定读那个运行的尝试行，序号不是最大即拒（`attemptSuperseded`） | S-21 ②、S-32 第 3 行 |
| RL-3 | **无运行的经过按 (会话, 位置, 维度, 锚, 件名) 唯一**：已有即拒、失败可识别，runner 改读那一条接着走 | S-21 ②、S-32 第 4 行 |
| RL-4 | 提醒按 (会话, `MessageId`) 唯一，已有即不再写 | S-19 第 2 条 |
| RL-5 | 按锚读出一次经过已落的全部结论，按提交次序；读不到返回可识别的失败，不返回空 | S-22、S-28、S-9 第 4 条 |
| RL-6 | `ask` 记录落盘即可见；卡片由等待原语从它重建（卡片那一侧的唯一性归卡片与等待，契约 S-27 第 2 条） | S-27、S-32 倒数第 3 行 |

**RL-3 的键里有「锚」，而锚的表示是契约 G-1**——这条要求在 G-1 闭合之前写不成约束。

### 跨 owner 的共同存储对象与两条交错

runner 的每一次写都是一次追加，**没有「同一提交」要跨 owner**（契约 S-21 ④：一次经过不是一次原子提交）；需要排序的是两个写入者对**同一次经过**的并发写：

| # | 交错 | 没有共同对象会怎样 | 三个替身为什么挡不住 | 共同对象怎样排序 |
|---|---|---|---|---|
| X-1 | 旧尝试里半死不活的协程 ‖ 新尝试的协程，同时推同一次经过的第 k 件 | 两条最终结论（P-1 破），效果取决于谁的读先到 | **时间谓词**（「旧协程超时即作废」）挡不住一个恰好醒来的旧协程；**进程内锁**随 runner 实例生灭，两副协程可能拿着两个实例；**没落盘的「我在推」标记**另一副看不见 | RL-2：写在同一事务里锁定读尝试行；推进在前 ⇒ 旧写被拒（`attemptSuperseded`），推进在后 ⇒ 新协程回放时读到它 |
| X-2 | 无运行的入站经过：同一条外面进来的消息被两副受理方协程同时落盘（重复投递） | 两条结论 | 同上，且没有尝试行可锁 | RL-3：后写的被拒，runner 改读先成的那一条接着走 |

两条都被契约的行为模型（尚未建，G-14）列为义务 `StaleAttemptCannotWrite`；**模型没有之前，证据只能是真并发演练**（[verification](verification.md#证据义务) C-1、C-2），受阻于会话日志提供者；X-2 另受阻于 G-1。

### 装配给 vs 协议给

契约 S-32 左列，本版单机怎样兑现：

| 契约 S-32 的保证 | 本节点单机的兑现 |
|---|---|
| 先落后算 | 同进程：结论追加确认之后才调下一件（RL-1） |
| 实现在场 | 贡献者登记；求值那一刻查登记表 |
| 尝试栅栏 | RL-2（在日志的写入边界判，不在 runner 这一侧判） |
| 无运行的经过条件写入 | RL-3（受阻于 G-1） |
| 一批一次会合 | 同进程：对同一批只收一次带齐的 `actions`，核对 `batch` 里不在 `actions` 的只能是日志里那条回复中解析不了的调用 |
| 放行输入的来路 | `admission` 由 agent loop 交来；runner 核报告的会话与运行；不现算报告、不另读授权上下文 |
| 调用方身份 | **归装配**：`loopExtensionRunner` 是能力间内部面，只有这个会话的 agent loop 与入站受理方够得着（[cli](../../../apps/cli/README.md) 装配）；本节点不核实 |
| 句柄只及本会话、只在这一次调用里有效 | 进程内只读视图，调用返回即作废 |
| 判定来源在场 | 同进程调用时取用；缺席 ⇒ `unavailable`；`canDispatchAgain` 答 `alreadyEnded` 按「不合法」处置 |
| 不可用处置声明与指定挂件在场 | 声明随清单读，读不到即 `unavailable`；指定挂件是本包的纯函数表，随 runner 在场 |
| 卡片先于等待可见 | RL-6；卡片落盘归等待原语 |
| 链的次序与两处末位 | 从本地清单读；末位由 runner 强制（模态转换那一处受阻于它的标识未定型） |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.loop-extension/v1`、`data.messages/v1`、`data.content-blocks/v1`、`data.call-accounts/v1`、`data.model-response/v1`、`data.identity-values/v1` | 包依赖同批纯模块与 `identity-values` | 随包版本 | — |
| `capability.model-request-runtime/v1` S-24、S-50 | 调用时取用 `modelRuntime`（[model-request-runtime](../../model/model-request-runtime/design.md)） | 每一次判定现取 | 缺席 ⇒ `unavailable` |
| `capability.tool-admission/v1` S-7、S-21、S-26、S-29 | 调用时取用 `toolAdmission`；**本批无提供者** | 每一轮现取 | 缺席 ⇒ 全拒件 |
| `capability.asset-evaluation/v1` S-8、S-42 | 经装配清单读求得的值（`assemblyManifest`，无契约） | 经过开始时读定 | 缺席 ⇒ `unavailable` |
| `capability.asset-registry/v1` S-11 | 不直接调：可用性报告由 agent loop 随 `admission` 交来 | 一次尝试内同一份 | 缺项按契约 S-29 第 5 条 |
| `capability.modality-projection/v1` S-20、S-22、S-23 | 系统自带那一件经登记表 | 求值那一刻查 | 缺席 ⇒ 指定挂件 |
| 会话日志（块 D，无契约） | 必需 inject `sessionLog`；RL-1～RL-6 | 每一次写与读 | 读写不了 ⇒ `unavailable`，停在出事那一件之前 |

**被谁消费**：agent loop 与入站受理方（`loopExtensionRunner`）；五类贡献者（`loopExtensionImplementations`）。

## 状态、并发与失败映射

**一次 `dispatch` 的步骤**：核输入（身份参数无默认值）→ 读清单定链（钉末位）→ 按锚读已落结论并核前缀（对不上即 `replayInconsistent`）→ 从第一件没有最终结论的件起逐件：判在场 → 造输入（新句柄）→ `await` 实现 → 两类判断 → 追加结论（RL-1～RL-3）→ 下一件；遇终止即停 → 按链序追加提醒（RL-4，每条一次嵌套经过）→ 交出效果。
**写权**：runner 只写结论与提醒；终态、取消请求、上交条目、卡片都不是它写（契约 S-23 末条）。
**并发**：件与件之间不并行；一批动作各自的经过之间可以并行，各自只读自己已落的结论。**不加进程内锁**：两副协程之间的次序只落在 RL-2、RL-3 上。
**失败映射**：日志不可用 ⇒ `unavailable`；RL-2 拒收 ⇒ `attemptSuperseded`；RL-3 冲突 ⇒ 读已有那一条继续；实现抛出 ⇒ 按「开始之后即报错」记（契约 S-12），它报「起不来」且在开始之前 ⇒ 不可用；判定来源缺席 ⇒ `unavailable`。没有 catch-all：runner 自己的缺陷上抛。
**取消**：契约 S-34 要「运行被取消 ⇒ 停」，而 `dispatch` 的输入里没有宿主、⑥ 里没有「被取消」这一收场值（RUN-N4）。本节点能落的只有机制的一半：调用方随调用交来它的中止信号（候选，投影层参数，不是语义输入），runner 在每两件之间检查、已中止即不开始下一件，并把同一个信号随调用交给正在求值的那一件（实现据此停下它的在途工作，例如[兼容件执行器](../hooks-import/design.md#一次被调到的子进程起限时停)停子进程组）；这一次 `dispatch` 以什么收场待缺口闭合，**本节点不自造一个失败值**。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| `ctx.provide`：`loopExtensionRunner`、`loopExtensionImplementations` | runner fiber；`ACTIVE` 即可解析 | provide 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目）；第二个失败则第一个随 fiber 撤 | 服务消失；调用方与贡献者重跑或 `PENDING`；**在途的 `dispatch` 跑完**，按各自那一次提交收场；**保留**：日志里的全部结论与提醒 |
| 登记表（实现句柄） | runner 实例；表项的寿命归各贡献者的 effect | 重复登记 ⇒ 抛给登记者 | 随实例没了；贡献者重跑后重新登记。注销时正在跑的那一次按「中途被撤下」记报错 |
| 每一次调用的日志只读句柄 | 那一次调用；不是 effect | — | 调用返回即作废 |
| 无定时器 | — | — | 一件不返回的实现没有时间上界（契约 G-7），runner 不替它设 |

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；实现受阻于其中的 G-1（锚的表示）、G-2（清单里四样值的表示）、G-3（三个能力标识）、G-5（提醒的 `id`）、G-7（时限）、G-14（行为模型）、G-16（凭据交出的那一格）、G-17（答复的三种表示）。下面是本节点自己的缺口。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| RUN-N1 | **会话日志的提供者没有契约、没有节点**：RL-1～RL-6 没有家（与 model-request-runtime 的 MRR-N1 同一个缺口） | 主线 → 块 D（loop 那一程） | 全部经过 | 会话日志契约写出这些要求，有提供者节点互指 |
| RUN-N2 | **装配清单读面没有契约、没有提供者**：链、四样值、不可用处置声明、连续否决上限都读不到 ⇒ 每一次 `dispatch` `unavailable`（与 MRR-N3 同一个缺口） | PF-004 的契约 owner | agent loop 的每一个状态点 | PF-004 契约起草、给出读面 |
| RUN-N3 | **两份契约对不上：系统一侧的实现要会话与租户，统一输入不带**。模态转换那一件要 `tenant`（`capability.modality-projection/v1#S-20` ②、`#S-18` ①）；兼容件的执行器要「这一次会话的会话级执行环境」（`capability.hooks-import/v1#S-18`）；而 `data.loop-extension/v1#S-11` 的输入成员闭合、不带会话与租户，本契约 S-7 说系统自带件「同一套输入」。候选解法：runner 在调用实现时另交一份调用上下文（会话、租户）——超出现有条款，**本节点不自选** | 主线 ＋ `data.loop-extension`、本契约、两份消费契约的 owner | 模态转换那一件、全部兼容件 | 某份契约写明实现从哪里拿到会话与租户 |
| RUN-N4 | **取消时 `dispatch` 的收场没有值**：契约 S-34「这个运行被取消 ⇒ 停、不产出效果」，S-21 ⑥ 闭合、没有这一支；输入里也没有宿主的中止信号 | 本契约 owner（主线） | agent loop 的取消路径；兼容件被取消时那一次求值的收场（hooks-import HI-N6） | 契约补一个收场值与中止信号的来路 |
| RUN-N5 | **依赖在场判定没有提供者**：`needs` 里每一项「在不在场」由谁答（资产注册表契约 G-6 同题） | 主线 ＋ `packages/tools/asset-registry`（庚） | 带 `needs` 的件 | 有一个读面给出在场与自报 |
| RUN-N6 | **静态检查规则未写**：`loopExtensionImplementations` 只许五类系统贡献者解析 | 本节点 ＋ 承载仓库 `tools/ts-checks` | 契约 S-7、S-17 的装配给 | 规则写成并在 CI 里跑 |

**契约文字里的旧装配名**：契约 S-4 与第十四节消费者表写 `apps/runtime-host`，D-039 已裁「不立 `apps/runtime-host`，两块运行时归 `apps/cli`」——承接左列的是 [cli](../../../apps/cli/README.md)。本节点照 D-039 写，契约文字的更正报主线。
