# hooks-import 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

**2026-09-26 裁决对账**：[D-064 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。本次只更新裁决依据，未登记实现或验证完成。


契约：[`capability.hooks-import` v2](../../../../spec/capabilities/hooks-import/v2/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的插件名、服务名、方法名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**起点是 D-033 接受的候选 A：fork 无运行时的一半，其余自写。**

| 部分 | 来源 | 本节点的处置 |
|---|---|---|
| matcher 求值、按方言的编解码、多件输出的合并、脱离运行的辅助、`HookOutput` 类型 | fork：DSH `c291e79` 的 `hook-protocol` 四个文件（`matcher`、`codec`、`merge`、`detached`）与类型；**剥掉对 `dsh-session` 的类型扩展** | 包内一个自有模块（候选路径 `src/vendor/hook-protocol/`），按 [SYS-KERNEL](../../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 记来历；**不与上游同步**（D-033 保留前提：DSH 的基线已落后于两家来源产品）。先做[提案](../../../../record/proposals/hooks-compat-baseline/alternatives.md#推荐与仍待区分的事项)列的四处立刻要改的事（matcher 精确集对齐 Claude Code 现行规则、Claude Code 方言的退出码与 JSON 读法、merge 补 `defer` 与改写字段、剥掉 `dsh-session` 类型扩展），再逐格对契约 S-16、S-19、S-20；两者不一致处以契约为准 |
| 导入与导入报告 | 自写 | 纯函数 `importHostHooks`（契约 S-11～S-15） |
| 两张方言映射表 | 自写，**以契约 S-23、S-24 为唯一权威** | 一个静态数据模块，逐行对契约的表；不据研究材料另推导来源产品行为 |
| 执行器（被调到时的全过程） | 自写 | 契约 S-16～S-22；**不继承** DSH「执行器拒绝 ⇒ 非阻断、永不抛」（契约 S-19 与 runner S-12 末条） |
| DSH 的 `runner`、`events`、`invariant` 与两个桥 | **不取**（D-033） | — |

- **A／C 区分实验是实施的第一步**（D-033 随 A 一起接受的判据）：在钉住的副本上做完这四处之后量四个文件与测试的改动行数，**超过一半即改选 C（全自写）**，以新决定记录、取代 D-033 这一项范围。实验未跑（缺口 HI-N4）；它不改本页的插件边界，只改 fork 模块的来源。
- **DSH 的许可与来历没有记录**：D-033 与所引研究都没有写 DSH 的许可证（缺口 HI-N3）。vendoring 之前核实并按 SYS-KERNEL 记下；许可不允许时直接走 C。
- **方言版本钉死**（契约 S-5）：Claude Code `2.1.280`、Codex `5c5308fc`；升级即契约新版本，本节点不自行跟版。
- **复用**：声明、输入（含执行环境句柄）、结论的形状取同批纯模块 [`packages/core/loop-extension`](../../core/loop-extension/README.md)（一契约一包，D-060 §八 M41）；共用件 `definePlugin`、`Outcome` 取 [kernel-basis](../../../../../../packages/core/kernel-basis/README.md)。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：导入、两张方言映射、原生输入与输出的互译、以及「跑一次来源产品的 hook」都是可单独取用的函数，不依赖 Cordis、会话、租户或存储；兼容插件是它们的一种消费者。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `importHostHooks(host, config) → ImportReport \| invalidInput` | 导入与导入报告（纯函数） | 本契约 [S-11](../../../../spec/capabilities/hooks-import/v2/contract.md#s-11-importhosthooks)～S-15；声明形状 `data.loop-extension/v2` |
| `dialects`（两张映射表，静态数据） | 契约 S-23、S-24 逐行 | 同 S-23、S-24 |
| `toHostInput(dialect, event, input, facts)` | 统一输入 → 那一家那一事件的原生输入；`facts` 是调用方数好的 `stop_hook_active` 等日志事实 | S-17；统一输入 `data.loop-extension/v2` |
| `buildLaunch(dialect, handler, environment)` | 一条 handler → 一次起进程的参数：**解释器写成 `program`、那一行命令作它的参数**，环境变量恰是交来的那一份 | 形状对 `capability.execution-environments/v2` [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) ① 的 `launch`（不经解释器、不继承环境变量） |
| `fromHostOutput(dialect, event, ended, stdout, stderr)` | 退出与输出 → 一条结论、非阻断错误或「报错」（按契约 S-19 各行归类、S-20 的优先级、S-22 越档不自降）；解码用 fork 的 `codec`、`merge` | S-19、S-20、S-22；结论 `data.loop-extension/v2` |
| `runHostHook(handler, dialect, input, facts, launcher, signal)` | 跑一次：`buildLaunch` → `launcher.start` → 等 `launcher.outcome`、handler 时限或中止信号 → 到点或中止即 `launcher.stop` → 拿到结果后也 `launcher.stop`（清掉留下的子孙）→ `fromHostOutput`。`launcher` 是调用方交的三个函数，答复分法照 execution-environments S-13～S-15（不带租户与引用：那两样由调用方闭包进去） | 同上各条；起不来与报错的分界照 S-19 |

**Cordis 服务面**：兼容插件 `hooks-compat`（[下节](#纯函数插件与服务键)）向 runner 登记一个外部命令执行器；执行器就是 `runHostHook` 加一个绑好的 `launcher`——经 runner 的句柄解析取租户与执行环境引用，`launcher` 调 `executionEnvironments` 的 `startProcess`／`processOutcome`／`stopProcessGroup`（S-13～S-15）；另做回放检查（先读 `ask` 记录）与在途子进程集合。

**只在运行时层成立、函数层不承诺**：子进程落在**这一次会话**的执行环境里、只在那一项宿主机允许在场时起（S-18、S-26 第 1 行；execution-environments [G-3](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口)）——函数层在调用方给的 `launcher` 起的地方跑，给一个直接 `spawn` 的就落在调用方的机器上；回放不重跑（S-21，要读日志）；撤除时停下起过的子进程（S-27）；`stop_hook_active` 从日志数（S-17 第 3 条，函数层收调用方数好的值）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **公开 `runHostHook` 与 `launcher` 端口**（选）；落选：只公开导入、映射表与两个互译函数，起停子进程留在插件里 | 起子进程是安全敏感的一步（落点、环境变量、进程组），公开出去等于让外部绕开执行环境的判定直接跑来源产品的脚本 | `launcher` 的形状是本节点定的候选；外部给一个不按组停的 `launcher`，「超时后确实停下」就不成立——这条写在「函数层不承诺」里 | 中：SYS-OPEN 点名「执行工具等核心能力可单独取用」，跑一次 hook 与执行一次工具同类；函数层本来就不判落点，判落点的是 `launcher` 背后的那一方，公开函数面不削弱服务面 |

## 契约到 Cordis 的投影

### 纯函数、插件与服务键

| 单元 | 公开入口（候选） | 必需 inject | 调用时取用 | 配置 |
|---|---|---|---|---|
| 导入 | 包入口导出 `importHostHooks(host, config) → ImportReport \| invalidInput` 与报告类型 | — | — | — |
| 兼容插件 `hooks-compat` | 不 provide；向 runner 登记一个外部命令执行器 | runner 的实现登记面 `loopExtensionImplementations`（[loop-extension-runner](../loop-extension-runner/design.md#实现怎样在场贡献者登记runner-从不-inject-贡献者)）——登记执行器，也经它的 `resolveTenant` 与 `resolveExecutionEnvironment` 解析输入里的执行环境句柄（[runner 节点](../loop-extension-runner/design.md#执行环境句柄每次调用一只按会话解析)；runner 那边都先经 `sessionTenancy`） | `executionEnvironments`（`capability.execution-environments/v2`：[S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) `startProcess`、[S-14](../../../../spec/capabilities/execution-environments/v2/contract.md#s-14-processoutcome) `processOutcome`、[S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup) `stopProcessGroup`，每次都带 (租户, 执行环境引用)）；接口已定、真承接者 PF-005 那一程未到 | `hookEnvAllowlist`（候选；名字列表，可以为空、不可以缺席；见[环境变量](#一次被调到的子进程起限时停)） |

- **导入为什么不是服务**：契约 S-11 ④ 它是纯函数，不读存储、不写任何东西；做成服务只会多一条 inject 边。谁调它、怎样把报告交给资产治理落地，归装配与资产治理（缺口 HI-N5）。
- **执行器为什么一个**：runner 对 `command` 件只认「有没有一个命令执行器」（runner 节点登记面）；两家来源产品的差别在方言数据与编解码里，不在执行器的数目里。
- **配置错误政策**：`hookEnvAllowlist`（一份 [`EnvAllowlist`](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess)）缺席或不合那一条的形状 ⇒ `Config` 校验不过 ⇒ 本插件 `FAILED`、装配启动失败；runner 已有一个命令执行器时再登记 ⇒ 登记抛出 ⇒ 同一收场（与同批各节点同一条）。

| 选择 | 落选方的最强论证 | 本方的弱点 | 置信度 |
|---|---|---|---|
| **导入是包导出的纯函数，不是服务** | 做成服务，导入的调用方经 inject 拿到它，将来导入挪到另一个进程时换提供者即可，不必改包依赖 | 调用方直接依赖本包；导入要跨进程时（例如治理中心侧导入）得另起一个服务面 | 高：契约 S-11 ④、S-26 末行「导入是纯翻译，跨进程之后不变」 |
| **一个包、两样东西**（纯函数与兼容插件同包） | 拆成两个包：导入只依赖纯模块，执行器才依赖 runner 与执行环境，谁只要导入就不背运行时依赖 | 只要导入的调用方也装上了执行器的依赖 | 中：两者共用方言映射表与 fork 的 `codec`，拆开要么第三个包、要么复制；D-059 定的节点只有一个 |
| **注销与停进程同一个 effect** | 分两个 effect 各管各的，撤除函数更短、更好测 | 一个撤除函数里有先后两步，一步抛错时后一步靠 `finally` 保住 | 高：basis `effect-disposal-concurrent-not-ordered` 的读数，两个 effect 的完成次序不受控 |
| **环境变量按允许清单从据点环境取值**（选；`hookEnvAllowlist` 必填、可空） | 落选一「把据点进程的环境整份交下去」：来源产品就是这么做的，hook 脚本依赖的变量一个不少。**它输在** execution-environments S-13 ③ 为了秘密明写不继承；整份交下去等于把据点进程里的凭据交给一段来源产品的脚本。落选二「只给方言规定的那几个变量」：最小。**它输在**解释器要程序搜索路径才找得到，几乎所有脚本还要 home 一类的基础变量，只给方言变量等于每一件都 `startFailed{programNotFound}` | 允许清单要装配给，给漏了 hook 就因缺变量而失败（按契约 S-19 的退出码归类收场）；给多了就多交出去——**哪些变量安全归装配判**，本节点只保证清单之外一个都不给 | 中：与 MCP 桥 `stdioEnvAllowlist` 是**两个配置项、同一形状类型**（形状与取法定在 execution-environments S-13 的 `EnvAllowlist`），一个据点里两处起外部进程不各写一套；产品装配未交入允许时 fail-closed，这一选择到 G-3 闭合才生效 |

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 来源、方言、配置来源 | `importHostHooks` 的输入校验；方言版本常量 | 尚未实现 | 来源由导入者声明、不核实（契约写明的边界） |
| S-6、S-7 一条 command 一件；name 导出 | 纯函数：逐 handler 产出一件，`name` 按契约 S-7 的式子（路径串的 SHA-256） | 同上 | 场景 S-35 |
| S-8～S-10 干预力、工作区来源、兼容件载荷 | 纯函数：`power` 取映射表的上限；工作区来源的每件带 `requires_tenant_enablement`；声明显式写 `unavailability: skip` | 同上 | 落地时的拒收与禁用落格归资产治理（契约 G-7、G-8） |
| S-11～S-15 导入与报告 | `importHostHooks`：先按方言解析整份、**任何一个 matcher 不合法即整份 `invalidInput`**，再逐条产出 `imported`／`degraded`／`skipped`；带 `args` 或 `shell` 字段的 CC handler 一律 `skipped{no_mapping}`（契约 S-14 ⑦，G-16 闭合之前） | 同上 | 场景 S-29、S-30、S-34 |
| S-16 情形筛选 | 执行器第一步：情形不满足或 matcher 不匹配 ⇒ `observed`、不起子进程；matcher 求值用 fork 的 `matcher`（按方言） | 同上 | 比对值取不到 ⇒ 按报错（不当匹配也不当不匹配） |
| S-17 原生输入 | `toHostInput`：不给 `transcript_path`、`permission_mode`、`session_id` 与租户标识；`stop_hook_active` 从日志数。执行器**要调 `resolveTenant`**——起、等、停子进程都要带租户（execution-environments S-13～S-15 ①；[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑩）——但租户身份**只进那三次调用，不进原生输入** | 同上 | 场景 S-36（断言原生输入里没有租户标识） |
| S-18 子进程在哪跑 | 起子进程之前经 `resolveTenant`、`resolveExecutionEnvironment(input.environment)` 取租户与这一会话的执行环境引用，工作目录交不出即起不来（契约 G-15，HI-N7），`startProcess(tenant, ref, buildLaunch(…))`；**不回退宿主机**、不拿别的会话的；时限取 handler 的 `timeout` 或方言默认 | 同上 | **接口已定、真承接者未到**（execution-environments v1；runner 契约 G-20）。**产品装配未交入允许时 fail-closed**：拓展件子进程的宿主机允许产品已给、装配尚未接入（execution-environments [G-3](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口)，账本 ⑭），`startProcess` 答 `noLanding{hostNotAllowed}` ⇒ 每一件「起不来」（HI-N1） |
| S-19 起不来与报错 | 句柄解析不出、交不出工作目录、`startProcess` 答 `noLanding`／`unavailable`／`referenceNotValid`／`environmentsWithdrawn`／`startFailed{programNotFound \| launchRefused}`，都在**开始之前**判出 ⇒ 报「起不来」；开始之后按契约 [S-19](../../../../spec/capabilities/hooks-import/v2/contract.md#s-19-起不来与报错) 的各行归类，非阻断错误的收场按 S-19 与 [`capability.loop-extension-runner/v2#S-13`](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-13-报错处置策略的执行)；判不出开始之前还是之后 ⇒ 按报错（[失败映射](#状态并发与失败映射)） | 同上 | 场景 S-32（含句柄解析不出、`noLanding` 两支） |
| S-20、S-22 输出译回、越档 | fork 的 `codec`（按方言）→ 契约 S-20 的优先级取一样；越档不自降，交 runner 按报错处置 | 同上 | 场景 S-31 |
| S-21 `ask` 与回放 | 执行器在起子进程**之前**先经日志句柄找这一件在这一次经过里的 `ask` 记录与答复：有答复即按契约 S-21 第 3 条直接交回最终结论，**不起子进程** | 同上 | 场景 S-33（以子进程被调用的次数为准） |
| S-23、S-24 映射表 | 静态数据模块，逐行对契约 | 同上 | 每行一条测试 |
| S-25 不开事件 | 不 `emit`、不监听 | — | [事件](#事件派发过滤与边界) |
| S-26 左列、S-27 | 见[装配给 vs 协议给](#装配给-vs-协议给)与[装卸表](#成对的装载与撤除)；取消一行见[起、限时、停](#一次被调到的子进程起限时停) | — | runner 场景 S-51 的兼容件一支 |

### inject 边与换代时收掉的在途事实

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| 兼容插件 → `loopExtensionImplementations` | 必需 | 兼容插件重跑、重新登记；旧实例撤除时**经执行环境停下它起过、还在跑的子进程**（按进程组，契约 S-27 末行「已起的子进程由执行环境停下」），那几次求值由 runner 按「实现在求值中途被撤下」记成报错；其间全部兼容件「此刻不在」、按声明（`skip`）跳过，看得见 | S-27 第 1、5 行；runner S-34 |
| 兼容插件 ⇢ `executionEnvironments` | 调用时 | 不重跑；缺席 ⇒ 这一件「起不来」⇒ 不可用、按声明处置；已起的子进程要停而它缺席或答 `environmentsWithdrawn` ⇒ 当场按报错交回（「已请求停止、未确认退出」，M64），子进程留给执行环境善后（它的 S-17：撤除时停下起过的组） | S-18、S-19、S-26 第 2 行、S-27 第 2 行 |
| runner → 执行器 | 按登记（在 runner 节点） | runner 换代 ⇒ 本插件随之重跑（上一行） | runner S-7 |
| 导入的调用方 → `importHostHooks` | 包依赖，无 inject | 无运行时依赖 | S-11 |

### 一次被调到的子进程：起、限时、停

下面四件事（带租户、解释器写成 `program`、交全环境变量、结果之后停组）都落在 `capability.execution-environments` v2 的 S-13～S-15 上；那份契约的最小提供者节点 [`execution-environments-host`](../../infra/execution-environments-host/design.md#契约责任到插件服务与操作) 已立（candidate）：`spawn` 不经 shell、环境恰是 `launch.environment`、按程序搜索路径解析 `program`、POSIX 进程组、每组一个停止例程。拓展件子进程的宿主机允许来自它的可选读面 `executionPlacementReadings`，读面缺席即 `noLanding{hostNotAllowed}`（那个节点的关键选择一），验收装配由种子件给。

- **起**：先经 runner 解析执行环境句柄，取租户与执行环境引用（任一解析不出即「起不来」，不起），再 `startProcess(tenant, ref, launch)`（[S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess)），每次落在**新的进程组**里；以 (租户, 执行环境引用, 进程组) 登记进本插件实例的在途集合，挂上三个「停」的来源：handler 时限到、本插件撤除、运行被取消。**产品装配未交入允许时，在这一步 fail-closed**：拓展件子进程的宿主机允许没有（execution-environments G-3；最小提供者 `execution-environments-host` 在产品装配里读面缺席 ⇒ 同一答复）⇒ `noLanding{hostNotAllowed}` ⇒ 起不来。
- **解释器写成 `program`**：来源产品的 hook `command` 是交给命令解释器的一行；`startProcess` 不经解释器、不做插值（S-13 ③），所以 `buildLaunch` 把**那一家的解释器**写成 `program`、那一行命令原样作它的参数——解释器是哪一个、参数怎样摆，是方言数据里的一格，随方言版本钉死（契约 S-5）。契约 [S-18](../../../../spec/capabilities/hooks-import/v2/contract.md#s-18-子进程在哪跑钱记在哪) 第 3 条第 2 项写 Claude Code 在 macOS 与 Linux 上是 `sh -c`（引研究原文）、Codex 按与 CC 同构读（契约 G-5）；**basis 没有条目，本节点按待核对主张用**（HI-N8）。解释器按 `launch.environment` 里的程序搜索路径找（S-13 ③），允许清单里没有程序搜索路径那一项就 `startFailed{programNotFound}` ⇒ 起不来。
- **交全环境变量**：子进程的环境恰是 `launch.environment`、不继承据点进程的任何变量（S-13 ③；那里可能有秘密）。`buildLaunch` 给的**恰是**按 `hookEnvAllowlist` 这份 [`EnvAllowlist`](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) 从据点进程环境里取出的变量（取法以那一条为准：名字不在据点环境里就不给，不补空值；白名单的值未定，契约 [G-15](../../../../spec/capabilities/hooks-import/v2/contract.md#十一已知缺口)）。**来源产品给 hook 导出的变量，本项目给不出的不造**（契约 S-18 第 3 条第 3 项：CC 的 `CLAUDE_PROJECT_DIR` 一类），用到它们的 command 按 S-19 收场。**允许清单之外的一个都不给**——与 MCP 桥的 `stdioEnvAllowlist` 两个配置项、同一形状（execution-environments S-13 的 `EnvAllowlist`）。
- **工作目录**：`startProcess` 的 `workingDirectory` 必带、没有默认（S-13 ①）；来源产品在会话的当前目录里跑 hook，而统一输入与句柄解析都不交出这一项——**没有来路**（契约 [G-15](../../../../spec/capabilities/hooks-import/v2/contract.md#十一已知缺口)，HI-N7）。契约写明闭合之前交不出工作目录的就不起、是「起不来」，**不拿据点进程的当前目录顶上**。允许读面未接线时，在它之前就会 fail-closed，不影响本版行为；G-3 闭合时它就挡在前面。
- **拿到结果之后停组**：`processOutcome` 交回的只是起的那一个进程的结果，组里别的子孙可能还在（S-14）；执行器拿到结果、译出结论之后**照样 `stopProcessGroup`**，确认退出即出在途集合。答 `notConfirmed` 时**结论照交**（那是 hook 自己的退出与输出，S-19 没有「子孙没停完」这一行），记 error 级结构化日志，那个组留在在途集合里，撤除时再停；执行环境那一侧自己也继续停它（S-15 末段）。
- **停**：`stopProcessGroup(tenant, ref, processGroup)`（[S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup)；契约 S-26 第 2 行「同一台机器上按进程组停」、S-27 末行），等它在 `stopReplyBound` 之内答 `confirmedGone` 或 `notConfirmed`。确认退出 ⇒ 这一次按报错交回（超时）或由 runner 按中途撤下记（撤除）。**答未确认、答不了或执行环境那一侧缺席 ⇒ 执行器当场按报错交回，`error` 写明「已请求停止、未确认退出」，不挂起**；子进程留给执行环境按进程组善后（execution-environments S-15 末段：`notConfirmed` 之后它继续停）——「没确认就不算停下」落成「如实报错、不假装停下」，而不是让这一次经过无限等下去（D-060 §八 M64）。执行器自己不设确认计时器（不自造政策值）：「有界地答复」已由 execution-environments S-15 ④ 承诺（`stopReplyBound`，值归装配，那份契约 G-6）。停用的是起的时候解析出的那个引用，不再解析句柄——调用返回或 runner 换代之后句柄已失效，引用仍有效（runner 节点的装卸表）。
- **运行被取消**（契约 S-27 取消一行、runner S-21 ⑥ `cancelled`；D-060 §八 M39）：runner 把调用方的中止信号随调用交来（[runner 的取消段](../loop-extension-runner/design.md#状态并发与失败映射)）；执行器收到即按上一条停进程组，然后以「已中止」拒绝这一次调用——**不译成 `veto`、不按报错、不自造任何结论**，runner 丢弃它交回的东西、不留记录。runner 不等它（那边的取舍），所以「确认退出」是执行器自己托管的收尾：停不下或确认不了只记 error 级日志，那一次已经没有结论可交。
- **脚本的副作用不可逆**（契约 S-3）：停下它不撤销它写过的文件、发过的请求。

### 事件：派发、过滤与边界

- **不发、也不监听任何 Cordis 事件**（契约 S-25）：导入是一次纯翻译；兼容件被调到时的一切都经 runner 落成结论。
- **F② 依赖消失时谁被卸载**：只有 runner 登记面的换代会让本插件重跑；范围只到本插件与它的在途子进程。
- **F③ 有没有一条通道能越过会话或租户边界**：没有事件。**越界的风险在子进程落在哪**：它必须落在**这一次会话**的执行环境里（契约 S-26 第 1 行）：执行器手里只有这一次调用的执行环境句柄，runner 按经过所在的会话解析它（runner S-50），执行器没有能指认别的会话的参数，也没有回退宿主机的分支。产品装配未交入允许时 fail-closed（HI-N1：宿主机允许没有），本插件对每一件兼容件都报「起不来」。租户身份只进 `startProcess`／`processOutcome`／`stopProcessGroup` 三次调用，执行环境引用跨租户即 `referenceNotValid`（execution-environments S-5），不进原生输入。日志只读句柄只及本会话（runner S-9），执行器经它读 `ask` 记录与数 `stop_hook_active`，读不到别的会话。

### 存储要求：无

导入不读不写存储；执行器只经日志句柄读、自己不写（结论由 runner 写）。本节点不 inject 存储，没有要求清单，也没有跨 owner 的同一提交。

### 装配给 vs 协议给

契约 S-26 左列，本版单机怎样兑现：

| 契约 S-26 的保证 | 本节点单机的兑现 |
|---|---|
| 子进程落在会话级执行环境里 | 执行器只经 runner 解析的句柄取租户与执行环境；装配（[cli](../../../apps/cli/README.md)）要装 `sessionTenancy`、`executionEnvironments` 的最小提供者（接口已定，runner 契约 G-20；节点 [`session-tenancy-table`](../../session/session-tenancy-table/design.md#实施缺口与消费者影响)、[`execution-environments-host`](../../infra/execution-environments-host/design.md#实施缺口与消费者影响) 已立）——**产品装配未交入允许时 fail-closed**：本版没有会话级沙箱，子进程只能落宿主机且要一项产品已给、装配尚未接入的允许（execution-environments G-3），一律「起不来」（HI-N1） |
| 超时后子进程确实停下 | `stopProcessGroup` 按进程组停；`confirmedGone` ⇒ 按契约 S-19 超时那一种情形交回，`notConfirmed` ⇒ 按报错交回「已请求停止、未确认退出」、不挂起（M64），子进程归执行环境善后（它继续停，S-15 末段）；拿到结果之后同样停组 |
| 运行被取消时子进程确实停下 | 中止信号随 runner 的叫停在同一进程里送到执行器，按进程组停；那一次不留记录 |
| 回放不重跑 | 执行器起子进程之前先读 `ask` 记录与答复，有即直接交回 |
| 导入是纯翻译 | 纯函数，不读不写 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.loop-extension-runner/v2` S-6、S-9、S-12～S-14、S-21 ⑥、S-27～S-29、S-34、S-50 | 必需 inject 登记面；日志只读句柄与执行环境句柄随每次调用交来，后者经登记面解析；中止信号随调用交来 | 每次调用两只新句柄 | runner 缺席 ⇒ 本插件 `PENDING`，兼容件无执行器 ⇒ 不可用 |
| `data.loop-extension/v2`（含 S-41）、`data.asset-model/v2`、`data.messages/v2`、`data.content-blocks/v2`、`data.identity-values/v1` | 包依赖同批纯模块（`packages/core/{loop-extension,asset-model,messages,content-blocks}`）与 `identity-values` | 随包版本 | — |
| `capability.tool-admission/v2` S-15、S-28 | 只取四档选项的 `id` 与 `label`（常量）；不调它的服务 | 随包版本 | — |
| `capability.execution-environments/v2` [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess)～[S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup)（接口已定、真承接者 PF-005 那一程未到，最小提供者节点 [`execution-environments-host`](../../infra/execution-environments-host/design.md#契约责任到插件服务与操作) 已立（candidate）；产品装配未交入允许时 fail-closed，[G-3](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口)） | 调用时取用 `executionEnvironments`，每次带 (租户, 句柄解析出的引用) | 每次起、等、停子进程现取 | 缺席、`noLanding`、`unavailable`、`referenceNotValid`、`startFailed` ⇒ 「起不来」；见[失败映射](#状态并发与失败映射) |
| `capability.session-tenancy/v2` [S-8](../../../../spec/capabilities/session-tenancy/v2/contract.md#s-8-holdingtenant读会话持有的租户身份)（间接） | 不直接调：租户经 runner 的 `resolveTenant` 取，runner 那边经 `sessionTenancy` | 每次起子进程之前 | 解析不出 ⇒ 「起不来」 |

**被谁消费**：runner（执行器）；导入的调用方与资产治理（纯函数与报告形状）。

## 状态、并发与失败映射

**本插件的状态**只有在途子进程集合（(租户, 执行环境引用, 进程组) 与它属于哪一次调用），只在实例里；**没有耐久事实**。一次调用的步骤：情形与 matcher → 回放检查 → 造原生输入 → 解析执行环境句柄（租户与引用）→ `startProcess` → 等 `processOutcome`、时限或中止信号 → `stopProcessGroup`（到点、中止，或拿到结果之后清子孙）→ 按方言解码 → 按优先级译成一条结论交回 runner（中止时不交结论）。
**并发**：同一批动作各自的经过并行时，几件兼容件可能各起一个子进程，互不共享状态。
**失败映射**（契约 S-19 各行落到 execution-environments 的答复上；没有 catch-all）：

| 情形 | 归哪一类 |
|---|---|
| `resolveTenant` 或 `resolveExecutionEnvironment` 解析不出；交不出工作目录（本版恒如此，G-15）；`startProcess` 答 `noLanding{hostNotAllowed}`（本版恒如此，G-3）、`unavailable`、`referenceNotValid`、`environmentsWithdrawn`、`startFailed{programNotFound}`、`startFailed{launchRefused}`；`executionEnvironments` 缺席 | **起不来**（开始之前；进程从没跑过，S-13 末段） |
| `processOutcome` 答 `exited{code}` | 按契约 [S-19](../../../../spec/capabilities/hooks-import/v2/contract.md#s-19-起不来与报错) 的退出码各行归类、退出码 0 按 S-20 译；非阻断错误怎样交回、runner 怎样记，按 S-19 与 [`capability.loop-extension-runner/v2#S-13`](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-13-报错处置策略的执行)，本节点不另定 |
| `processOutcome` 答 `terminated`（本执行器停的：时限到）；等结果时答 `referenceNotValid`／`environmentsWithdrawn` | 开始之后：按契约 S-19 超时、执行环境被撤下那两种情形的归类收场 |
| `stopProcessGroup` 答 `notConfirmed` 或停不了（撤除那一支） | **报错**（「已请求停止、未确认退出」，M64） |
| `startProcess`／`processOutcome`／`stopProcessGroup` 答 `invalidInput` | 缺陷（参数是本执行器造的）：上抛，runner 记成报错 |
| 映射表查不到一个已导入的事件（导入与映射表不同版） | 缺陷：上抛，runner 记成报错 |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（`hookEnvAllowlist`） | `definePlugin` 的 `Config`，插件体之前 | 不过 ⇒ `FAILED`、装配启动失败 | —— |
| 向 runner 登记外部命令执行器 | 兼容插件 fiber；拿回注销函数包进 `ctx.effect` | 已有执行器 ⇒ 抛出 ⇒ `FAILED` | 注销；此后全部兼容件「此刻不在」、按声明跳过 |
| 在途子进程集合（同一个 effect 的撤除函数负责），每项是 (租户, 执行环境引用, 进程组) | 兼容插件 fiber；每起一个进程即入集合，停进程组的请求得到答复（确认退出或未确认）即出集合（含取消之后自己托管的那段收尾） | 句柄解析不出或起进程失败都在开始之前 ⇒ 「起不来」，不入集合 | 撤除函数：对集合里每个进程组请执行环境停止 → 等答复；未确认的记 error 级结构化日志、归执行环境按进程组善后（M64）→ 撤除函数里的异常只进日志（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），所以每一步自己记 error 级结构化日志。**仍为真**：脚本已做的外部效果；runner 仍在时把那几次记成报错，runner 一并撤除时那几次不留记录（runner 节点 M63） |
| 每次调用的时限计时器 | 那一次调用；退出即清 | — | 撤除时随进程停一起清 |

**注销与停进程放进同一个撤除函数、次序写死**（先注销、再停进程）：同一 fiber 的各个 effect 撤除时并发、不保证次序，分成两个 effect 会出现「进程已停、执行器仍登记着、runner 又派来一件」的窗口。

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；落地一侧受阻于契约 G-1（留痕没有家）、G-7（越限声明谁拒）、G-8（禁用落在租户层那一格），Codex 解析受阻于 G-5，路径规范化是 G-6。下面是本节点自己的缺口。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| HI-N1 | **执行环境：接口已定、真承接者未到；产品装配未交入允许时 fail-closed**。起、等、停三面由 `capability.execution-environments` v2 [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess)～S-15 接住（有界答复、未确认继续停，M64 的前提由它的 S-15 承诺）；runner 解析句柄的两条来路接口已定（runner 契约 G-20）。**仍挡着**：① 拓展件子进程的宿主机允许产品已给、装配尚未接入（execution-environments [G-3](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口)，**接线缺口，D-064 ⑭ 已裁**，[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑧）——产品装配未交入允许时，`startProcess` 答 `noLanding{hostNotAllowed}`，每一件兼容件都「起不来」、按声明跳过，可否决的兼容件那道闸这一次就没了，只剩那条不可用记录（与 N-26 一致）；会话级沙箱仍不在本版（那份契约 G-1），但已不阻止获准使用宿主机的 hooks。**真承接者未到，最小提供者节点 [`execution-environments-host`](../../infra/execution-environments-host/design.md#实施缺口与消费者影响) 已立（candidate）**：允许来自它的可选读面 `executionPlacementReadings`，产品装配里缺席 ⇒ `noLanding{hostNotAllowed}`（它的 EEH-2），验收装配由种子件给；它本版只进验收装配 | 执行环境与据点装配 owner；完整沙箱能力另归 PF-005 那一程 | 全部兼容件 | ① 产品允许已由 D-064 ⑭ 裁定；接上 execution-environments S-6 所需允许读面，保持只及 hooks 兼容件，那个节点的 RD-2 指到实际读面；**另挡在 HI-N7、HI-N8 之后** |
| HI-N2 | **已闭合**（D-060 §八 M38）：统一输入加执行环境句柄（`data.loop-extension/v2#S-41`），契约 S-18 改为经它取，读面是 runner S-50；本节点的落法见[操作落点](#操作落点) S-18 一行 | — | — | — |
| HI-N3 | **DSH 的许可与来历未核**：vendoring 之前必须核实并记下 | 本节点（核对）→ 主线（许可不允许时改选 C 的决定） | fork 模块 | 许可与来历记入 SYS-KERNEL 要求的位置 |
| HI-N4 | **D-033 的 A／C 区分实验未跑**：实施第一步；超过一半改动即以新决定改选 C | 本节点（实施计划第一步）→ 主线（新决定） | fork 模块 | 实验跑完、结果记录；需要时出新决定 |
| HI-N5 | **谁调 `importHostHooks`、报告怎样交给资产治理落地**：配置文件在用户本机，落地在治理中心 | [cli](../../../apps/cli/README.md)（壬）＋ `packages/assets/asset-governance`（己）＋ 未来资产/据点入口（版本未分配）（下一程，M43 C-4） | 导入者（组织超管或租户） | 装配与资产治理写明这一条动作链 |
| HI-N7 | **子进程的工作目录与白名单变量没有来路**（契约 [G-15](../../../../spec/capabilities/hooks-import/v2/contract.md#十一已知缺口)）：`startProcess` 的 `workingDirectory` 必带（execution-environments S-13 ①），来源产品在会话的当前目录里跑 hook；统一输入（`data.loop-extension/v2`）与句柄解析都不交出这一项；`hookEnvAllowlist` 的值未定。契约定了闭合前的收场：交不出工作目录即「起不来」、不拿据点当前目录顶上 | 主线（与 PF-005、PF-015 那一程：工作目录经哪个读面给出、是否随执行环境引用给；白名单定值） | 全部兼容件（HI-N1 ① 闭合之后才显出来） | 契约 G-15 闭合：有一个读面按会话给出工作目录，本节点经它取、不给默认；白名单有值 |
| HI-N8 | **两家来源产品各用什么解释器跑 hook `command`、参数怎样摆**：契约 [S-18](../../../../spec/capabilities/hooks-import/v2/contract.md#s-18-子进程在哪跑钱记在哪) 第 3 条第 2 项写 Claude Code 在 macOS 与 Linux 上是 `sh -c`（引研究原文）、Codex 按与 CC 同构读（契约 G-5）；basis 没有条目——**待核对主张**（钉在 Claude Code `2.1.280`、Codex `5c5308fc`），Codex 一侧是契约自己登的缺口 | 本节点（取证）→ basis；Codex 一侧随契约 G-5 | `buildLaunch` 的解释器那一格 | 两条 basis 条目（带会失败的 probe） |
| HI-N10 | **已闭合**（2026-09-25 修订波第二轮）：契约 [S-19](../../../../spec/capabilities/hooks-import/v2/contract.md#s-19-起不来与报错) 已按主线裁定改为兼容件的收场照来源产品的退出码语义（非 0 非 2、含 127，为非阻断错误）；非阻断错误在 runner 记录里怎样落归 S-19 与 [`capability.loop-extension-runner/v2#S-13`](../../../../spec/capabilities/loop-extension-runner/v2/contract.md#s-13-报错处置策略的执行)。本节点只引这两处，不复述归类 | — | — | — |
| HI-N11 | **已闭合**（2026-09-25 修订波第二轮）：`EnvAllowlist` 的形状与取法定在 [`capability.execution-environments/v2#S-13`](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) 表下一条（有限的变量名集合，可空、每个名非空；取的恰是名字在集合里且据点进程环境此刻有的，原名原值，不补空值）；`hookEnvAllowlist` 与桥的 `stdioEnvAllowlist` 是它的两份配值。本节点的 `Config` 校验与取法都改指那一条（桥节点 B-9 同） | — | — | — |
| HI-N9 | **函数层的行为没有契约条款**：`runHostHook`、`launcher` 端口、`buildLaunch` 是本节点定的候选；本契约写的是被调到时的服务面语义 | 主线（与 TER T-17、runner RUN-N7 同题） | 外部包装 `runHostHook` 的人 | 契约为函数面给出条款，或明写「函数面不受契约约束」 |
| HI-N6 | **已闭合**（D-060 §八 M39）：runner `dispatch` ⑥ 加 `cancelled`，契约 S-27 写明在途的兼容件收到停止信号、那一次不留记录；本节点的落法见[起、限时、停](#一次被调到的子进程起限时停) | — | — | — |
