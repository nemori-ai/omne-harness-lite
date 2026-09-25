# loop-extension-runner 实现设计

契约：[`capability.loop-extension-runner` v1](../../../../spec/capabilities/loop-extension-runner/v1/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的插件名、服务名、方法名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**自建，不 fork。**D-033 接受的 hooks 兼容层起点明写「不取 DSH 的 `runner`」（[D-033](../../../../record/decisions/hooks-compat-baseline/decision.md#选择与范围)）——它的「执行器拒绝 ⇒ 非阻断、永不抛」正是本契约 S-12 末条不继承的方向。

- **求值不用 Cordis 的事件派发**：`emit` 丢掉返回值，`bail` 遇到异步监听者就把 Promise 当作结论交回、不等它（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)）；本契约 S-10 第 5 条要 runner 自己等每一件。链的次序与成员是会话级数据（装配清单），不是 Cordis 的注册序。runner 按清单逐件 `await` 直接调用实现。**名字相同、含义不同**：契约说的「逐件顺序求值」不是 Cordis 的 `waterfall`（契约 S-10 的注）。
- **复用**：结论、输入、声明、记录的形状与表示层校验取同批纯模块 [`packages/core/loop-extension`](../../core/loop-extension/README.md)；消息、块、归属标识、响应体取 [`packages/core/messages`](../../core/messages/README.md)、[`packages/core/content-blocks`](../../core/content-blocks/README.md)、[`packages/core/call-accounts`](../../core/call-accounts/README.md)、[`packages/core/model-response`](../../core/model-response/README.md)（一契约一包，D-040 §八 M41）；句柄的不透明串用 `identity-values` 的 `generateOpaqueIdentifier()`；共用件 `definePlugin`、`resolveOptional`、`Outcome` 取 [kernel-basis](../../core/kernel-basis/README.md)。
- **效果合成、三张处置表都是纯函数**（契约 S-12、S-13、S-15、S-17 的表），与插件分开导出，场景逐格演练它们。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：对一次经过逐件求值、合成效果是可单独取用的函数，不依赖 Cordis、会话、租户或存储；本插件的 `dispatch` 是它的一种消费者。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出；不 import Cordis，不读日志与清单，只调调用方交来的端口）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `runPass(pass, chain, ports, signal) → Promise<PassResult>` | 对**一次经过**逐件求值：钉两处末位 → 按 `ports.readConclusions` 读回已落的结论并核前缀（对不上即 `replayInconsistent`）→ 从第一件没有最终结论的件起：判在场（`ports.presence`）→ `ports.invoke(name, input)` → 两类合法性判断（`ports.judges`）→ **`await ports.record(结论, 键)` 确认之后**才开始下一件 → 遇终止即停 → 提醒 → 合成效果。`pass` 是 (位置, 维度, 锚, 统一输入)，**锚是调用方给的不透明键**（[S-5](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-5-一次经过)，[D-043 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）；`chain` 是调用方给的有序件列表（各件的名字、`needs`、不可用处置）；中止信号到 ⇒ `cancelled`，在途那一件不落结论 | 统一输入、结论、记录、效果、提醒：`data.loop-extension/v1`；消息与块：`data.messages/v1`、`data.content-blocks/v1`；逐件与先落后算、不可用与报错、效果合成、关门表的**词汇**借本契约 [S-10](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-10-逐件顺序求值先落后算)、[S-12](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-12-不可用与报错runner-怎么分)、S-13、[S-15](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-15-效果怎么合成)、[S-17](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-17-系统自带件不可用时一律关门)——**函数层的行为本身没有契约条款**（缺口 RUN-N7） |
| `composeEffect(conclusions)` | S-15 那张表：已落结论 → 效果 | 同 S-15 |
| `unavailableDisposition`、`errorDisposition`、`closedGateFallback`（S-12、S-13、S-17 三张表） | 纯函数，逐格对表 | 同各条 |
| `passKeys(pass, name)` | 一件在一次经过上的判重键与读取键（带写入方前缀 `runner/`，会话日志 [G-5](../../../../spec/capabilities/session-log/v1/contract.md#十已知缺口)） | `capability.session-log/v1` [S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键)、[S-9](../../../../spec/capabilities/session-log/v1/contract.md#s-9-读取键) 的「键由写入方拼」 |

`ports.record` 的答复恰四种（候选）：`recorded`、`alreadyRecorded`（改读已落的那一条接着走）、`superseded`（⇒ `attemptSuperseded`）、`unavailable`——与会话日志 [S-17](../../../../spec/capabilities/session-log/v1/contract.md#s-17-append追加一批条目) ⑥ 同一分法，调用方把日志接上时逐值对过去即可。

**Cordis 服务面**：插件 `loop-extension-runner`、服务 `loopExtensionRunner`（`dispatch`、`replay`）与受限登记面 `loopExtensionImplementations`（[下节](#插件服务键与配置)）。**`dispatch` 就是 `runPass` 加一组绑好的端口**：`readConclusions`／`record` 接 `sessionLog.readByKey`／`append`（带栅栏或判重键，[存储要求](#存储要求)）、`chain` 从 `assemblyManifest` 读、`presence` 接 `assemblyManifest.dependencyPresence`、`invoke` 查登记表并造两只句柄、`judges` 接 `modelRuntime`、放行判断那一格接 `toolAdmission`；另在三处检查点多查一件「本实例已撤除」。

**只在运行时层成立、函数层不承诺**（外面另包 `runPass` 的人拿不到这些，要就自己补）：每件恰一条最终结论、回放重建同一效果、只跑一轮、提醒恰一次（S-11、S-18、S-19 第 2 条、S-22、S-28）——函数层把键与栅栏交给 `ports.record`，**「恰一条」成立与否取决于那个端口是否判定与写入同一步、按耐久内容判**（会话日志 [S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键)、[S-14](../../../../spec/capabilities/session-log/v1/contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步)），接一个进程内数组就没有；尝试栅栏（S-21 ②）；链从装配清单来（S-6 的来路；钉末位在函数层做）；系统自带件的四样特权与放行判断不得被替换（S-7、S-17，靠受限登记面）；日志只读句柄与执行环境句柄只及本会话、调用返回即作废（S-9、S-50）；`admission.report` 三者核对（S-21 ①，要知道 `manifest` 指认的会话与尝试）；runner 被撤除时在途经过不继续（S-34，M63）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **公开 `runPass` 与端口**（选）；落选：只公开效果合成与三张处置表，逐件循环留在插件里 | 逐件循环的正确性（先落后算、恰一条、回放）全押在端口的语义上；公开出去，外部接一个内存数组就以为得到了 P-1。纯表已经够别人复用「判法」 | 端口的形状（四种答复、已落结论的次序）没有契约条款，是本节点定的候选；runner 契约改了它就得跟着改 | 中：SYS-OPEN 要的是「求值一次经过」这件事能单独拿走，只给表等于只给了零件；服务面复用同一个 `runPass`，两份循环一定会分叉（品味「同一概念一个权威定义」）。「恰一条」不承诺写在上表，外部包装者看得见 |

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 服务键（候选）与方法 | 必需 inject | 调用时取用（`resolveOptional`） | 配置 |
|---|---|---|---|---|
| 插件 `loop-extension-runner` | `loopExtensionRunner`：`dispatch`（另收调用方的中止信号，投影层参数）、`replay`（契约 S-21、S-22）；`loopExtensionImplementations`：`registerBuiltin(builtinName, 实现) → 注销函数`、`registerCommandExecutor(执行器) → 注销函数`、`resolveTenant(environment)`、`resolveExecutionEnvironment(environment)`（契约 S-50） | `sessionLog`（`capability.session-log/v1`：[S-17](../../../../spec/capabilities/session-log/v1/contract.md#s-17-append追加一批条目) `append`、[S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读) `readByKey`） | `assemblyManifest`（`capability.assembly-manifest/v1`：[S-16](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-16-readhead读头与每一类最后一条) `readHead` 读链，[S-19](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-19-dependencypresence依赖名此刻在不在场) `dependencyPresence` 判 `needs`——**在场判定是它的一个查询，不另设服务键**，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②）；`modelRuntime`（`legalTargets`、`canDispatchAgain`）；`toolAdmission`（`admit`，本批无提供者）；`sessionTenancy`（`capability.session-tenancy/v1` [S-8](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-8-holdingtenant读会话持有的租户身份) `holdingTenant`）与 `executionEnvironments`（`capability.execution-environments/v1` [S-11](../../../../spec/capabilities/execution-environments/v1/contract.md#s-11-resolvesessionenvironment) `resolveSessionEnvironment`）——后两者只供句柄解析（契约 S-50；真承接者未到、接口已定，契约 G-20） | 无 |

- **只 inject 会话日志**（接口 `capability.session-log` v1 已定；最小提供者 JSONL 追加器节点尚无，真承接者 loop 与会话那一程未到，RUN-N1）：草图写派发器「inject：会话日志读写」、其余一律可选取用——`inject` 没有可选形式（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），写进去就等于「没有它我不跑」，而本契约要的是「实现缺席即那一件不可用，不是 runner 不可用」（契约 S-4）。
- **配置错误政策**：本插件没有配置。重复登记同一个 `builtinName` 或第二个命令执行器 ⇒ 登记方法抛出 ⇒ **登记者**的插件体抛出、`FAILED`、装配启动失败——与同批各节点同一条「配置错误即启动失败」；runner 自己不受影响。

### 实现怎样在场：贡献者登记，runner 从不 inject 贡献者

照草图「贡献的统一形状」：贡献者 inject `loopExtensionImplementations`、登记、拿回注销函数、包进自己的 `ctx.effect`；**登记的寿命等于贡献者 fiber 的寿命**。runner 在求值那一刻按名查表，查不到即那一件「此刻不在」（契约 S-7「runner 不装载、不启动任何实现」）。

| 贡献者 | 登记什么 | 节点 |
|---|---|---|
| 模态转换那一件 | `registerBuiltin` | [modality-projection](../../model/modality-projection/README.md) 的零状态贡献者插件（D-040 §八 M68：持有登记表的 P-3 不 inject 本插件的登记面） |
| 默认重试件 | `registerBuiltin` | [model-request-runtime](../../model/model-request-runtime/README.md) 的 P-5 |
| 卸载判定 | `registerBuiltin` | `packages/tools/tool-execution-runtime`（同批，由那边定） |
| 循环探测 | `registerBuiltin` | agent loop 那一程（尚无节点） |
| 兼容件的外部命令执行器（`implementation.kind = command` 的全部件） | `registerCommandExecutor` | [hooks-import](../hooks-import/README.md) |

- **放行判断不走登记表**：它那一格对一轮动作**整批调一次** `admit`（契约 S-29 第 5 条），输入是 `capability.tool-admission` 自己的形状、不是统一输入；所以它的「实现」就是调用时取用的 `toolAdmission` 服务（D-040 §八 M44 接受为推导）。本批没有提供者 ⇒ 每一轮都「不可用」⇒ 全拒件顶上（契约 S-17）——**这是本批的已知收场，不是缺陷**。
- **登记面受限**：只许上表的系统包解析 `loopExtensionImplementations`（静态检查候选规则，同 organization-governance 的 `restricted-call-sites`）。理由：系统自带件有四样特权（契约 S-7），任何够得着登记面的一方都能冒一个 `builtinName`；放行判断「不得被替换」由它不在登记表里、只经 `toolAdmission` 兑现。
- **「实现在求值中途被撤下」的机制**（契约 S-34 第 4 行）：每条登记带一个代际；一次求值开始时捕获那条登记，返回时若它已被注销（代际变了），这一次按**报错**记（`error` 写明「实现在求值中途被撤下」），不采用它交回的东西。内核不取消在途调用，所以不靠「中断那次调用」——那次调用照常跑完，只是结果不被采用。

### 执行环境句柄：每次调用一只，按会话解析

契约 S-50 的读面在本节点的样子：

- **造**：每调一件实现，runner 用 `generateOpaqueIdentifier()` 造一只新串放进输入的 `environment`，并在本实例的**句柄表**里登一行：串 → (`manifest` 指认的会话, 这一件, 这一次经过, 调用代际)。**表里只有会话的内部指认，串本身不承载它**；输入里没有会话标识（契约 S-50 第 2 条）。
- **失效**：那一次调用返回（或按叫停被放弃）时删掉那一行；此后解析即失败，不返回上一次的值（S-50 第 3 条）。句柄表随 runner 实例生灭（[装卸表](#成对的装载与撤除)），runner 换代之后旧实例造的句柄一律解析失败——那一件按 S-50 第 4 条自己归「起不来」或报错，而它交回的东西不会落：那一次 `dispatch` 在下一处检查点以 `unavailable` 收场（[runner 自身被撤除](#状态并发与失败映射)）。
- **解析**：两样**分开解析、按需才取**——`resolveTenant` 经 `sessionTenancy.holdingTenant(会话)` 取那个会话持有的租户身份；`resolveExecutionEnvironment` **先经同一个 `holdingTenant` 取租户，再以 (租户, 会话) 调 `executionEnvironments.resolveSessionEnvironment`**（[S-11](../../../../spec/capabilities/execution-environments/v1/contract.md#s-11-resolvesessionenvironment)：它要租户才答；[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩），交回执行环境引用（那份契约的 [S-5](../../../../spec/capabilities/execution-environments/v1/contract.md#s-5-执行环境引用)，不透明）。模态转换那一件只在有块要转时取租户（D-040 §八 N-20），它不必因为执行环境那一侧不在而失败；反过来，**租户读不到时执行环境也解析不出**——这是 S-11 的入参决定的，不是本节点的选择。
- **解析不出**（行已删；来源缺席；`holdingTenant` 答 `sessionNotFound` 或 `unavailable`；`resolveSessionEnvironment` 答它 [S-11](../../../../spec/capabilities/execution-environments/v1/contract.md#s-11-resolvesessionenvironment) ⑥ 的任一失败值）⇒ 那一次解析以可识别的失败收场（候选 `environmentUnresolved`），**不给默认、不回退宿主机、不拿别的会话的顶上**；归「起不来」还是报错由那一件按它开始与否判（S-50 第 4 条），runner 在它交回时照 S-12 记。
- **受限**：两个解析方法与登记方法同在受限面 `loopExtensionImplementations` 上，只有登记过实现的系统包够得着（RUN-N6 的同一条静态检查）。

| 选择 | 落选方的最强论证 | 本方的弱点 | 置信度 |
|---|---|---|---|
| **输入里放串、解析走受限面**（本方） | 随调用直接交一个解析闭包：进程内最简单，闭包随调用结束自然失效，不必有句柄表 | 多一张随实例生灭的表 | 高：输入的形状是契约的 `EnvironmentHandle` 串（`data.loop-extension/v1#S-41`）；跨进程之后闭包过不去，解析请求要带会话与租户身份在接收边界重验（S-32），串＋解析面与那时的协议同形 |
| **两样分开解析**（本方） | 一个 `resolveEnvironment` 一次交回两样，面更小；而且执行环境本来就要先取租户（S-11），合起来少读一次 | 两个方法；取执行环境时租户多读一次（`holdingTenant` 是只读、答案不变，session-tenancy S-6） | 高：执行环境那一侧的真承接者未到、产品装配里常解析不出，合成一个方法会让只要租户的模态转换也跟着解析失败 |
| **句柄表在 runner 实例里，不落日志** | 落进日志，runner 换代后旧句柄仍解析得出 | 换代时在途的那一件解析失败、白跑一趟 | 高：句柄只在一次调用里有效（S-50 第 3 条），它不是正确性事实（S-8）；换代时那一件交回什么都不落——旧 `dispatch` 在下一处检查点以 `unavailable` 收场（D-040 §八 M63），下一次 `dispatch` 回放时它重新求值、拿新句柄 |

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 一次经过与锚 | **锚是调用方随 `dispatch` 交来的不透明键**（参数 `anchor`，一批动作时是逐项对应的 `anchors`，`replay` 同名；契约 [S-21](../../../../spec/capabilities/loop-extension-runner/v1/contract.md#s-21-dispatch一次经过)；[D-043 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)），runner 不推、不解析，原样拼进判重键与读取键（`passKeys`） | 尚未实现 | 不再受阻：场景的键由测试给。**键怎样算**归 loop 那一程（契约 G-1 收窄后的那一半）；调用方的两条义务（同一次经过同一把、不同经过不同把）本节点兑现不了 |
| S-6 链从装配清单来；两处末位 | 经过开始时经 `assemblyManifest.readHead`（[S-16](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-16-readhead读头与每一类最后一条)）读一次链（之后不变）——**从记录内容里怎样取出链是 assembly-manifest 的 [G-4](../../../../spec/capabilities/assembly-manifest/v1/contract.md#十已知缺口)**，服务面读链在它闭合前写不成代码；函数面 `runPass` 由调用方交链，不受它挡；按能力标识把放行判断、模态转换移到各自链末；清单里没有它们也在链末认一件 | 同上 | 放行判断的标识已定（`omne-official:admission-judgment`）；**模态转换的标识未定型**（契约 G-3，modality-projection 节点 MP-N2），认不出就钉不了；清单里四样值怎么表示是契约 G-2 |
| S-7 系统自带件 | 登记表（上节）；认法只凭能力标识 | 同上 | 循环探测、重试的标识同在契约 G-3 |
| S-8 不持有运行实例里的状态 | 除登记表（实现句柄，不是事实）之外没有任何状态；「已有结论」「连续否决次数」都现读日志 | 同上 | 重启、换协程、换实例不改任何一次经过的结果 |
| S-9 日志只读句柄 | 每一件每一次调用新造一个句柄：只读、查询一律限定在清单指认的那个会话；调用返回即作废（代际标记），作废后读取失败 | 同上 | 句柄背后是 `sessionLog.readByKey`／`readSince`（[S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读)、[S-19](../../../../spec/capabilities/session-log/v1/contract.md#s-19-readsince从某个位置往后读)），会话参数由句柄表那一行给、不由拓展件给 |
| S-50 执行环境句柄 | [上节](#执行环境句柄每次调用一只按会话解析)：每次调用一只新串、句柄表登会话、调用返回即删；两样分开按需解析，执行环境先经 `holdingTenant` | 同上 | **真承接者未到、接口已定**（契约 G-20）：验收装配里最小提供者答测试种子，场景 S-52 可跑；产品装配里会话持有租户没有写入方（session-tenancy G-2）⇒ 解析一律失败 ⇒ 兼容件全部「起不来」、含要转的块的消息被否决；兼容件起子进程另要一项产品没给的宿主机允许（execution-environments G-3，hooks-import 节点 fail-closed） |
| S-10 逐件顺序、先落后算 | 逐件 `await` 实现 → 两类判断 → 结论追加确认落盘 → 才开始下一件 | 同上 | 场景 S-36、S-38 |
| S-11 每件恰一条结论 | 带栅栏的经过靠尝试栅栏、无运行的经过靠判重键（[RL-2、RL-3](#存储要求)；会话日志 [S-10](../../../../spec/capabilities/session-log/v1/contract.md#s-10-尝试栅栏)、[S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键)） | 同上 | 场景 S-47 |
| S-12、S-13、S-17 不可用、报错、关门表 | 纯函数三张表；判「不可用」四种情形：`needs` 不在场（问 `assemblyManifest.dependencyPresence`，[S-19](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-19-dependencypresence依赖名此刻在不在场)）、登记表查不到、实现在开始之前报「起不来」、放行判断的依据缺项 | 同上 | 在场判定**接口已定、事实没有来源**（assembly-manifest [G-2](../../../../spec/capabilities/assembly-manifest/v1/contract.md#十已知缺口)）：任何一个名字判不出 ⇒ 整次 `unavailable`（它的 S-19 ⑧），产品装配里带 `needs` 的件恒判不出（RUN-N5） |
| S-14 两类合法性判断 | 表示层校验取 `packages/core/loop-extension`；`select_model` 问 `modelRuntime.legalTargets`、`retry` 问 `modelRuntime.canDispatchAgain` | 同上 | 判定来源缺席 ⇒ 这一次 `unavailable`、那一件不留记录 |
| S-15 效果合成 | 纯函数：已落结论 → 效果 | 同上 | 场景逐格 |
| S-16 缺席默认答案 | `assemblyManifest` 缺席或 `readHead` 答 `unavailable` ⇒ `unavailable`；`readHead` 答头 `0`（这个会话一条换表记录都没有，[S-5](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-5-一个会话一列换表记录) 第 3 条）⇒ `manifestMissing` | 同上 | 场景 S-43 |
| S-18 只跑一轮 | 再 `dispatch` 同一次经过（同一把键）即回放（S-28） | 同上 | 不再受阻：键由调用方给，场景的键由测试给 |
| S-19 提醒 | 经过走完、交出效果之前按链序追加，每条以 `MessageId` 拼判重键追加（[RL-4](#存储要求)）；每条提醒由 runner 自己发起一次嵌套的 `before_persist_message` 经过 | 同上 | 提醒的 `id`、`createdAt` 由谁给是契约 G-5 |
| S-21 `dispatch` | `loopExtensionRunner.dispatch`；`before_action` 带 `actions` 时各动作的经过并发推进到放行判断那一格，会合后调一次 `admit`，结果按 `CallId` 分回。**核 `admission.report`**：它带的会话、`runId`、`attempt` 三者逐一对 `manifest` 指认的会话、`run`、`attempt`，任一不等 ⇒ `invalidInput`、一件都不求值（D-040 §八 M46）。**叫停** ⇒ `cancelled`（[取消](#状态并发与失败映射)） | 同上 | 凭据经哪一格交出是契约 G-16；答复三种表示是契约 G-17；场景 S-51 |
| S-22 `replay` | `loopExtensionRunner.replay`：只读，不受栅栏；按那把键拼的读取键 `readByKey`（[S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读)，按提交次序） | 同上 | 不再受阻：键由调用方给 |
| S-23～S-30 效果之后与回放、一批、连续否决 | runner 只落结论、合成效果、追加提醒；连续否决次数从日志数，上限是运行时设置（从装配清单的求值结果取） | 同上 | 上限读不到 ⇒ `unavailable`（契约 S-30 第 3 条）；从记录内容里怎样取出这项设置同 RUN-N2（assembly-manifest G-4） |
| S-31 不开事件 | 不 `emit`、不监听 | — | [事件](#事件派发过滤与边界) |
| S-32 左列、S-33、S-34 | 见[装配给 vs 协议给](#装配给-vs-协议给)与[装卸表](#成对的装载与撤除) | — | 叫停丢了之后那一件还能写进什么归契约 G-8 |

### inject 边与换代时收掉的在途事实

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| runner → `sessionLog` | 必需 | runner 插件体重跑，两个服务重新 provide；登记表随旧实例没了，**贡献者都 inject 登记面、随之重跑并重新登记**；inject `loopExtensionRunner` 的调用方重跑。**在途的 `dispatch` 跑在调用方的协程上，不继续**：它在下一处检查点见旧实例已撤除，以 `unavailable` 收场、**不再落任何结论记录**（D-040 §八 M63，[runner 自身被撤除](#状态并发与失败映射)）——旧登记表已被贡献者注销，接着求值只会把「此刻不在」读成指定挂件的否决写进日志。已提交的结论留在日志里；下一次对同一次经过的 `dispatch` 从日志接着走（回放）。**没有需要交接的活状态** | S-8、S-33 末段 |
| runner ⇢ `assemblyManifest`（`readHead` 读链；`dependencyPresence` 判 `needs`） | 调用时 | 不重跑；缺席或 `readHead` 读不到 ⇒ `unavailable`，不当空链；`dependencyPresence` 缺席或答 `unavailable` ⇒ 带 `needs` 的件判不出 ⇒ `unavailable`，不带 `needs` 的件不受影响 | S-12 ①、S-16、S-33 |
| runner ⇢ `modelRuntime` | 调用时 | 不重跑；缺席 ⇒ 那一件判不出 ⇒ `unavailable`、不留记录，不当「合法」也不当「不合法」 | S-14、S-33 |
| runner ⇢ `toolAdmission` | 调用时 | 不重跑；缺席 ⇒ 放行判断不可用 ⇒ 全拒件 | S-17、S-29 第 7 条 |
| runner ⇢ `sessionTenancy` | 调用时（`resolveTenant` 与 `resolveExecutionEnvironment` 两处都先取它） | 不重跑；缺席或答 `sessionNotFound`／`unavailable` ⇒ 那一次解析失败，那一件按开始与否归「起不来」或报错 | S-50 第 1、4 条 |
| runner ⇢ `executionEnvironments` | 调用时（只在 `resolveExecutionEnvironment` 里，拿到租户之后） | 同上；不回退宿主机 | S-50 第 4 条 |
| 五类贡献者 → `loopExtensionImplementations` | 必需（在各自节点） | 贡献者重跑、重新登记；其间那一件「此刻不在」：系统自带件由指定挂件顶上，兼容件按它声明的处置（导入件恒 `skip`） | S-12、S-17、S-34 |
| agent runtime、入站受理方 → `loopExtensionRunner` | 必需（在各自节点，尚无） | 调用方重跑即新的一次尝试，回放接着走 | S-28、S-34 |

### 事件：派发、过滤与边界

- **不发、也不监听任何 Cordis 事件**（契约 S-31）；所以没有 `emit`／`serial`／`bail`／`waterfall` 的选择，也没有 `thisArg` 过滤器要设。需要知道「某件下了什么结论」的一方读日志。
- **F② 依赖消失时谁被卸载**：只有会话日志的换代会卸载 runner；其余依赖缺席只让那一件或那一次失败，范围最小。
- **F③ 有没有一条通道能越过会话或租户边界**：没有事件。能读东西的只有两只句柄：日志只读句柄的每一次查询都限定在清单指认的那个会话，**没有能指认别的会话的参数**；执行环境句柄只解析出句柄表那一行登的会话的租户与执行环境，串本身不承载会话；串是 128 位随机数（`generateOpaqueIdentifier()` 取 16 个随机字节），解析面只有登记过实现的系统包够得着，一件实现手里只有自己这一次调用的那一只；两只都在调用返回时作废。登记表是部署范围的（系统装配的实现不按租户分份），里面只有实现句柄，不带任何会话数据。

### 存储要求

对会话日志提供者的要求。会话日志的窄口接口 2026-09-25 起**已定**：`capability.session-log` v1（candidate；它的[消费者核对](../../../../spec/capabilities/session-log/v1/contract.md#十二消费者核对)已逐条对过下表，右列是对上的条款）；最小提供者（JSONL 追加器）节点由主线另立、尚无；真承接者 loop 与会话那一程未到（那份契约 G-1；RUN-N1）。与 [model-request-runtime 的 L 系列](../../model/model-request-runtime/design.md#存储要求)落在**同一本日志、同一个栅栏判法**上（会话日志 S-10），两边各写一条、互指；最小提供者节点立起来时写一条对应本节的要求。

| # | 要求 | 对应契约条款 | 接口契约兑现条款 |
|---|---|---|---|
| RL-1 | 每条结论一次追加，确认即落盘；确认之前 runner 不开始下一件 | S-10 第 2 条、S-32 第 1 行 | [S-13](../../../../spec/capabilities/session-log/v1/contract.md#s-13-提交与持久) 第 2、4 条（成功返回即已持久、读自己写的） |
| RL-2 | **尝试栅栏在写入边界上判**：带运行的经过（含它引出的嵌套经过）的每一次写带 `fenced{run, attempt}`；日志在提交点上看已提交条目壳上的 `(run, attempt)`，同一运行有更大序号即整批不写（`attemptSuperseded`）。**不另存尝试行**——比较对象就是日志里的条目 | S-21 ②、S-32 第 3 行 | [S-10](../../../../spec/capabilities/session-log/v1/contract.md#s-10-尝试栅栏)（只关不开；前提「每次尝试第一条是尝试开始记录」是 loop 的义务）、[S-14](../../../../spec/capabilities/session-log/v1/contract.md#s-14-同一会话的追加一条接一条判定与写入是同一步) |
| RL-3 | **无运行的经过按 (位置, 维度, 锚, 件名) 至多一条**：`passKeys` 把它拼成判重键（带前缀 `runner/`；锚是调用方交来的键，[D-043 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)），已有即拒（`alreadyRecorded{keys}`），runner 改读那一条接着走 | S-21 ②、S-32 第 4 行 | [S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键)（按耐久内容判、撞上整批不写、判定与写入同一步）；键的名字空间是那份契约的 G-5 |
| RL-4 | 提醒按 `MessageId` 至多一条：以它拼判重键，已有即不再写 | S-19 第 2 条 | S-8 |
| RL-5 | 按锚读出一次经过已落的全部结论，按提交次序；读不到返回可识别的失败，不返回空 | S-22、S-28、S-9 第 4 条 | [S-9](../../../../spec/capabilities/session-log/v1/contract.md#s-9-读取键)（每条结论带「这一次经过」的读取键）、[S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读)（按位置升序；读不到 `unavailable`，不返回空） |
| RL-6 | `ask` 记录落盘即可见；卡片由等待原语从它重建（卡片那一侧的唯一性归卡片与等待，契约 S-27 第 2 条） | S-27、S-32 倒数第 3 行 | S-13 第 4 条 |

**RL-3 的键里有「锚」**：锚由调用方交来（契约 S-5），这条要求写得成约束；**跨尝试、跨停机交来同一把键**是调用方的义务（契约 G-1 收窄后的那一半），本节点兑现不了。

### 跨 owner 的共同存储对象与两条交错

runner 的每一次写都是一次追加，**没有「同一提交」要跨 owner**（契约 S-21 ④：一次经过不是一次原子提交）；需要排序的是两个写入者对**同一次经过**的并发写：

| # | 交错 | 没有共同对象会怎样 | 三个替身为什么挡不住 | 共同对象怎样排序 |
|---|---|---|---|---|
| X-1 | 旧尝试里半死不活的协程 ‖ 新尝试的协程，同时推同一次经过的第 k 件 | 两条最终结论（P-1 破），效果取决于谁的读先到 | **时间谓词**（「旧协程超时即作废」）挡不住一个恰好醒来的旧协程；**进程内锁**随 runner 实例生灭，两副协程可能拿着两个实例；**没落盘的「我在推」标记**另一副看不见 | RL-2：共同对象是**这本日志的提交点与已提交条目壳上的 `(run, attempt)`**（会话日志 S-10、S-14）。新尝试的尝试开始记录先提交 ⇒ 旧写被拒（`attemptSuperseded`）；旧写先提交 ⇒ 新协程回放时读到它（RL-5）。两者在同一本日志的提交序列里排出次序 |
| X-2 | 无运行的入站经过：同一条外面进来的消息被两副受理方协程同时落盘（重复投递） | 两条结论 | 同上，且没有尝试可比 | RL-3：共同对象是**判重键**（会话日志 S-8 第 5 条：它就是跨 owner 的共同存储对象）；后写的被拒，runner 改读先成的那一条接着走。前提：两副协程交来**同一把锚键**——调用方的义务 |

两条都被契约的行为模型（尚未建，G-14）列为义务 `StaleAttemptCannotWrite`。**日志那一侧**的两条判法已有会失败的模型证据：会话日志契约的 `SessionLog.tla`（formal task `session-log-v1-appends`；`FenceHolds`、`UniqueDedupeKey`，去掉「判定与写入同一步」或「按耐久内容判」即出反例）——**它证的是接口，不证 runner 真的给每次写带了栅栏与键**，所以不绑到本节点；runner 这一侧的证据只能是真并发演练（[verification](verification.md#证据义务) C-1、C-2），受阻于会话日志最小提供者节点尚无。X-2 的键由测试给即可跑。

### 装配给 vs 协议给

契约 S-32 左列，本版单机怎样兑现：

| 契约 S-32 的保证 | 本节点单机的兑现 |
|---|---|
| 先落后算 | 同进程：结论追加确认之后才调下一件（RL-1） |
| 实现在场 | 贡献者登记；求值那一刻查登记表 |
| 尝试栅栏 | RL-2（在日志的写入边界判，不在 runner 这一侧判；会话日志 S-10） |
| 无运行的经过条件写入 | RL-3（锚键由调用方交来；会话日志 S-8） |
| 一批一次会合 | 同进程：对同一批只收一次带齐的 `actions`，核对 `batch` 里不在 `actions` 的只能是日志里那条回复中解析不了的调用 |
| 放行输入的来路 | `admission` 由 agent loop 交来；runner 核报告的会话、`runId`、`attempt` 三者（D-040 §八 M46）；不现算报告、不另读授权上下文 |
| 执行环境句柄只及本会话、只在这一次调用里有效 | 同进程：按 `manifest` 指认的会话登句柄表，调用返回即删；两样在调用时经 `sessionTenancy`、`executionEnvironments` 取用（执行环境先取租户；真承接者未到，契约 G-20） |
| 叫停 | 同进程：调用方随 `dispatch` 交中止信号，runner 转给在途那一件（[取消](#状态并发与失败映射)）；叫停经什么跨进程送到归组合契约 |
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
| `capability.asset-evaluation/v1` S-8、S-42 | 经装配清单读求得的值（`assemblyManifest.readHead`，`capability.assembly-manifest/v1` [S-16](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-16-readhead读头与每一类最后一条)；从记录内容里怎样取是那份契约的 G-4） | 经过开始时读定 | 缺席 ⇒ `unavailable` |
| `capability.asset-registry/v1` S-11 | 不直接调：可用性报告由 agent loop 随 `admission` 交来，runner 核它带的会话、`runId`、`attempt` | 一次尝试内同一份 | 缺项按契约 S-29 第 5 条；三者任一对不上 ⇒ `invalidInput` |
| `capability.modality-projection/v1` S-20、S-22、S-23 | 系统自带那一件经登记表 | 求值那一刻查 | 缺席 ⇒ 指定挂件 |
| `capability.session-log/v1` [S-8](../../../../spec/capabilities/session-log/v1/contract.md#s-8-判重键)～[S-10](../../../../spec/capabilities/session-log/v1/contract.md#s-10-尝试栅栏)、[S-17](../../../../spec/capabilities/session-log/v1/contract.md#s-17-append追加一批条目)、[S-18](../../../../spec/capabilities/session-log/v1/contract.md#s-18-readbykey按读取键读) | 必需 inject `sessionLog`；RL-1～RL-6 | 每一次写与读 | `unavailable` ⇒ `unavailable`，停在出事那一件之前；`attemptSuperseded` ⇒ `attemptSuperseded`；`alreadyRecorded` ⇒ 读已落的那一条接着走；`tenantMismatch` 与 `invalidInput` ⇒ 缺陷（壳上的租户与尝试是 runner 如实给的） |
| `capability.session-tenancy/v1` [S-8](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-8-holdingtenant读会话持有的租户身份)、`capability.execution-environments/v1` [S-11](../../../../spec/capabilities/execution-environments/v1/contract.md#s-11-resolvesessionenvironment)（契约 S-50；真承接者未到、接口已定，G-20） | 调用时取用 `sessionTenancy`、`executionEnvironments`，只在句柄解析时；执行环境先经 `holdingTenant` | 每一次解析现取 | 缺席或答不出 ⇒ 那一次解析失败，不给默认 |
| `capability.assembly-manifest/v1` [S-19](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-19-dependencypresence依赖名此刻在不在场) `dependencyPresence` | 调用时取用 `assemblyManifest`（同一个服务键，[D-040 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②） | 每一件判在场时现取 | 缺席、`unavailable`（含有一个名字没有事实） ⇒ 带 `needs` 的件判不出 ⇒ `unavailable` |

**被谁消费**：agent loop 与入站受理方（`loopExtensionRunner`）；五类贡献者（`loopExtensionImplementations`）。

## 状态、并发与失败映射

**一次 `dispatch` 的步骤**：核输入（身份参数无默认值、`anchor`／`anchors` 缺席或不合表示即 `invalidInput`；`before_action` 上核 `admission.report` 的三者）→ 读清单定链（钉末位）→ 按锚读已落结论并核前缀（对不上即 `replayInconsistent`）→ 从第一件没有最终结论的件起逐件：查叫停与实例撤除 → 判在场 → 造输入（新的日志句柄与执行环境句柄）→ `await` 实现（与叫停、实例停止竞速）→ 删句柄 → 两类判断 → 查叫停与实例撤除 → 追加结论（RL-1～RL-3）→ 下一件；遇终止即停 → 按链序追加提醒（RL-4，每条一次嵌套经过）→ 交出效果。
**写权**：runner 只写结论与提醒；终态、取消请求、上交条目、卡片都不是它写（契约 S-23 末条）。
**并发**：件与件之间不并行；一批动作各自的经过之间可以并行，各自只读自己已落的结论。**不加进程内锁**：两副协程之间的次序只落在 RL-2、RL-3 上。
**失败映射**：日志不可用 ⇒ `unavailable`；RL-2 拒收 ⇒ `attemptSuperseded`；RL-3 冲突 ⇒ 读已有那一条继续；实现抛出 ⇒ 按「开始之后即报错」记（契约 S-12），它报「起不来」且在开始之前 ⇒ 不可用；判定来源缺席 ⇒ `unavailable`；本实例已撤除 ⇒ `unavailable`、不落记录（见下）。没有 catch-all：runner 自己的缺陷上抛。
**取消**（契约 S-21 ② 末句、⑥ `cancelled`、S-34；D-040 §八 M39）：调用方随 `dispatch` 交来它的中止信号（候选，投影层参数；叫停跨进程怎样送到归组合契约，契约 S-21 ②）。runner 把同一个信号随调用交给正在求值的那一件（实现据此停下它的在途工作，例如[兼容件执行器](../hooks-import/design.md#一次被调到的子进程起限时停)停子进程组），并在三处查它：**开始下一件之前**、**追加那一件的结论之前**、**追加提醒之前**。已中止 ⇒ 这一次经过不再写任何东西（不落在途那一件的结论、不开始后面的件、不补提醒），`dispatch` 以 `cancelled` 收场，已提交的结论都在。
- **不等在途那一件结束，也不跟踪它**：它可能不理信号，而拓展件本版没有时间上界（契约 G-7）；等它就是让一个不守约的件拖住整个运行的取消。那一件的调用照常跑完（内核不取消在途调用），它的 Promise 只挂着一个丢弃结果、拒绝记一条 info 级结构化日志的收尾，不落日志条目；**runner 不再持有它的任何状态、不计入任何 effect**。上界：件与件不并行，所以每一次经过、每一次叫停至多留下一件（一批动作各经过各一件）；runner 撤除时也不等它。停下子进程之类的在途工作是那一件自己的义务。
- **叫停 ‖ 结论追加**：信号在那一件已交回、runner 已查过信号、追加尚未确认时到来——那一件此时已不在求值中，它的结论照常提交（契约「不留记录」说的是收到信号时还在求值的那一件）；追加确认后 runner 在下一处检查点看到信号，以 `cancelled` 收场。两种次序的结果都是「一条结论要么完整落下、要么不落」，没有半条。**取消的权威在日志里的取消请求**（PF-012 §6.15），不在信号本身；信号丢了之后那一件还能写进什么归尝试栅栏与 loop 那一程（契约 G-8）。

| 选择 | 落选方的最强论证 | 本方的弱点 | 置信度 |
|---|---|---|---|
| **收到叫停即返回 `cancelled`，不等在途那一件** | 等它结束再返回：`dispatch` 返回时这一次经过里没有任何东西还在跑，取消路径更干净 | 返回之后那一件可能还在跑一小段（兼容件要等子进程确认退出），它的外部效果不因返回而停止 | 中：契约只要「它这一次求值不留记录」，没有要求等；等则取消的时长受一个无上界的件支配 |

**runner 自身被撤除**（dispose，或因 `sessionLog` 换代而重跑；D-040 §八 M63）：在途的 `dispatch` **不继续**，以 `unavailable` 收场、**不再落任何结论记录**。
- **检查点**：复用上面三处，查叫停的同时查「本实例已撤除」——判 `fiberIsActive(ctx)`（[kernel-basis](../../core/kernel-basis/README.md) 共用件，与 account-registration「每步之前检查本 fiber 是否仍 `ACTIVE`」同一写法）。等在途那一件时，与叫停一起竞速的还有**实例的停止信号**（执行环境句柄表那个 effect 的撤除函数第一步触发），一件慢件拖不住这次收场。在途那一件不另收停止信号：它的贡献者 inject 了本插件的登记面，随之重跑、自己收场（兼容件经撤除函数停子进程）。
- **为什么查 fiber 状态、不只查撤除函数里的标记**：撤除开始时 runner fiber 先离开 `ACTIVE`，服务随后消失，贡献者的注销在那之后——所以一次「因撤除而查不到实现」一定发生在离开 `ACTIVE` 之后，而追加之前的检查排在查表之后，**必然看得见撤除**，指定挂件的否决写不进日志。撤除开始之前就已发出的追加照常落下：它依据的是撤除之前的登记表，是一条正当的结论。
- **待核对主张**：「撤除开始即离开 `ACTIVE`，先于任何 effect 撤除」。kernel-basis 的 `fiber-state-readable` 没有观察到 `UNLOADING`（那个节点记下的缺口），basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) 第三条（`UNLOADING` 之后再建 effect 即抛）与它一致但不是它的 probe。会失败的证据是 [verification](verification.md#证据义务) 的最小场景：它不成立，场景里就会看到撤除之后落下的否决。
- **不申请 S-8 例外**：已提交的结论都在；下一次对同一次经过的 `dispatch`（新实例上）从日志接着走、在途那一件重新求值——「换一个 runner 实例不改变任何一次经过的结果」（契约 S-8、S-33 末段）由此守住。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| `ctx.provide`：`loopExtensionRunner`、`loopExtensionImplementations` | runner fiber；`ACTIVE` 即可解析 | provide 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目）；第二个失败则第一个随 fiber 撤 | 服务消失；调用方与贡献者重跑或 `PENDING`；**在途的 `dispatch` 在下一处检查点见实例已撤除，以 `unavailable` 收场、不再写**（M63）；**保留**：日志里的全部结论与提醒 |
| 登记表（实现句柄） | runner 实例；表项的寿命归各贡献者的 effect | 重复登记 ⇒ 抛给登记者 | 随实例没了；贡献者重跑后重新登记。runner 仍在、贡献者自己撤下时，正在跑的那一次按「中途被撤下」记报错；随 runner 一起没了的按上一行收场 |
| 每一次调用的日志只读句柄 | 那一次调用；不是 effect | — | 调用返回即作废 |
| 执行环境句柄表 | runner 实例；包进 `ctx.effect`，每一行的寿命是一次调用 | — | 撤除函数先触发实例的停止信号（叫醒正在等在途那一件的 `dispatch`，M63），再清空整张表：旧实例造的、仍在途的句柄此后解析失败，那一件按契约 S-50 第 4 条归「起不来」或报错；**什么仍为真**：已经解析出去的执行环境引用不被收回——它指向的执行环境归执行环境那一侧，本节点不拥有 |
| 叫停或实例撤除后仍在跑的那一件的调用 | **不跟踪**：只挂一个丢弃结果、拒绝记 info 日志的收尾；不是 effect，runner 不持有它的状态 | — | 每一次经过至多一件；runner 撤除不等它、不收它；跑完即了，它的外部效果不回滚，停下它是那一件自己的义务 |
| 无定时器 | — | — | 一件不返回的实现没有时间上界（契约 G-7），runner 不替它设 |

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；实现受阻于其中的 G-2（清单里四样值的表示）、G-3（三个能力标识）、G-5（提醒的 `id`）、G-7（时限）、G-8（loop 那一程，含叫停丢了之后的写入）、G-14（行为模型）、G-16（凭据交出的那一格）、G-17（答复的三种表示）、G-20（执行环境句柄两样：接口已定、真承接者未到）；G-1 已收窄为「锚的算法归 loop 那一程」，不再挡本节点的回放与只跑一轮（[D-043 R-12](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）。下面是本节点自己的缺口；「本程不补、留给下一程」的几项按 [D-040 §八 M43](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 标出它的编号。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| RUN-N1 | **会话日志：接口已定、真承接者未到**。RL-1～RL-6 已对到 `capability.session-log` v1 的条款（[存储要求](#存储要求)）；最小提供者（JSONL 追加器）节点由主线另立、尚无；真承接者 loop 与会话那一程未到（那份契约 G-1；与 model-request-runtime 的 MRR-N1 同一个缺口） | 主线（最小提供者节点）；loop 与会话那一程（M43 C-1） | 全部经过（服务面）；函数面 `runPass` 不受挡 | 最小提供者节点写出对应 RL-1～RL-6 的要求并互指 |
| RUN-N2 | **装配清单：接口已定、读链未约定**。`capability.assembly-manifest` v1 给出 `readHead`（[S-16](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-16-readhead读头与每一类最后一条)），但链、四样值、不可用处置声明、连续否决上限要从记录内容里怎样取、写入方是否记下了它们没有约定（那份契约 [G-4](../../../../spec/capabilities/assembly-manifest/v1/contract.md#十已知缺口)；本契约 G-2）——**服务面读链写不成代码**，每一次 `dispatch` 在它闭合前只能 `unavailable`（与 MRR-N3 同一个缺口）。最小提供者节点尚无；真承接者 PF-004 那一程未到 | 主线 → PF-004 那一程（M43 C-2） | agent loop 的每一个状态点（服务面）；函数面 `runPass` 由调用方交链，不受挡 | 那一程定下记录里求值那一部分的形状与链的读法，或给出专门的读 |
| RUN-N3 | **已闭合**（D-040 §八 M38）：统一输入加执行环境句柄（`data.loop-extension/v1#S-41`），读面是契约 S-50，本节点的落法见[执行环境句柄](#执行环境句柄每次调用一只按会话解析)。两样的来路是契约 G-20（M43 C-7），不在此重抄 | — | — | — |
| RUN-N4 | **已闭合**（D-040 §八 M39）：`dispatch` ⑥ 加 `cancelled`，叫停转给在途那一件；本节点的落法见[取消](#状态并发与失败映射) | — | — | — |
| RUN-N5 | **依赖在场判定：接口已定、事实没有来源**。`needs` 的判定改问 `assemblyManifest.dependencyPresence`（[S-19](../../../../spec/capabilities/assembly-manifest/v1/contract.md#s-19-dependencypresence依赖名此刻在不在场)，不另设服务键，D-040 §八 N-37 ②）；在场事实没有写面与权威来源（assembly-manifest [G-2](../../../../spec/capabilities/assembly-manifest/v1/contract.md#十已知缺口)，与资产注册表契约 G-6 同题）——产品装配里每个名字判不出 ⇒ 带 `needs` 的件那一次 `unavailable`；验收装配由测试种子给事实 | 主线（这个查询的家）＋ PF-006 依赖解析与据点装配那一程（事实的来源） | 带 `needs` 的件 | 在场事实有写面与来源；若它的家不在装配清单，那份契约出新版、本节点改钉 |
| RUN-N7 | **函数层的行为没有契约条款**：`runPass`、端口的四种答复、`passKeys` 的拼法是本节点定的候选；本契约的条款写的是服务面（`dispatch`），函数面只借它的词汇（[公开面](#公开面)） | 主线（要不要让契约为函数面写条款，与 TER T-17 同题） | 外部包装 `runPass` 的人 | 契约为函数面给出条款，或明写「函数面不受契约约束」 |
| RUN-N6 | **静态检查规则未写**：`loopExtensionImplementations` 只许五类系统贡献者解析（登记与句柄解析同在这个面上） | 本节点 ＋ 承载仓库 `tools/ts-checks` | 契约 S-7、S-17、S-50 的装配给 | 规则写成并在 CI 里跑 |

承接契约 S-32 左列的装配是 [cli](../../../apps/cli/README.md)（契约 S-4 已按 D-040 §八 M40 改名）：它要装 `sessionLog`、`assemblyManifest`、`sessionTenancy`、`executionEnvironments` 四份接口契约的最小提供者（验收装配由测试种子答；产品装配里会话持有租户与在场事实没有写入方），并让调用方能把中止信号与锚键交进 `dispatch`。
