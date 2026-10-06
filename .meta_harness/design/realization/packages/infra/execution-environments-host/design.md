# execution-environments-host 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

**2026-09-26 裁决对账**：[D-064 ⑭](../../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。本次只更新裁决依据，未登记实现或验证完成。


## 实现路径与来源

**自建一个小的 Cordis 插件，没有可复用的上游对象**：落点判断的次序、进程组的起停与有界答复是本项目的契约语义（`capability.execution-environments` v2）。起停进程只用 Node 内置的 `node:child_process`、`node:fs` 与 `process.kill`，**不引第三方进程管理库，也不引执行器类库替本节点调度重试或轮询**（[D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 口径）。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| `spawn`（`shell: false`、`detached: true`、三路管道） | `node:child_process` | 起进程；`detached` 让子进程自成一个会话与进程组，组号即它的进程号 |
| `process.kill(-组号, 信号)`、`process.kill(-组号, 0)`、`process.kill(组号, 0)` | Node 内置 | 按组发信号；探组里还有没有进程；探组号上此刻是不是另有一个进程（发信号前核组长身份，[关键选择七](#关键选择)） |
| `stat`、`access(X_OK)` | `node:fs/promises` | 起之前判工作目录与程序（[关键选择三](#关键选择)） |
| 随机字节 | `node:crypto` | 执行环境引用与进程组引用（不透明，32 字节 base64url） |
| 身份值类型与表示层校验（`TenantId`） | [`core/identity-values`](../../core/identity-values/README.md) | ① 的表示层校验 |
| `SessionRef`、`ToolDefinitionRef` 的形状 | [`core/messages`](../../core/messages/README.md)、[`core/loop-extension`](../../core/loop-extension/README.md) | `resolveSessionEnvironment`、`placeExecution` 的输入 |
| `definePlugin`、`resolveOptional` | [`core/kernel-basis`](../../../../../../packages/core/kernel-basis/README.md) | 插件骨架、config 校验、读面的现取 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；机制语义引 [basis](../../../../basis/README.md) 条目。
**进程与信号的上游语义 basis 一条都没有**，下面每一条都是**假设，须按 source-check 取证**（[EEH-7](#实施缺口与消费者影响)）：① POSIX 上 `detached: true` 使子进程调 `setsid`，新会话、新进程组，组号等于子进程号；② `process.kill` 给负数即对整组发信号，组里一个进程都没有时以 `ESRCH` 失败；③ 起的进程已退出而未被回收（僵尸）时仍算组里有进程；Node 在 `exit` 事件前后回收它；④ `spawn` 的 `spawn` 事件表示程序已被执行，执行失败以 `error` 事件带错误码到达；⑤ 给了 `env` 选项时子进程的环境恰是它，不与本进程的环境合并；⑥ `exit` 事件给 `(code, signal)`，二者恰一个非空；⑦ 一个号在还是某个进程的进程号、进程组号或会话号时，操作系统不把它分给新进程（POSIX 的进程组寿命规则）；⑧ 子进程只由 Node 在事件循环上收回，收回与 `exit` 事件之间不跑任何 JS——子进程句柄上退出码与信号都还空 ⇔ 还没收回；本进程里没有别的代码对任意子进程调 `waitpid`。
**只在 POSIX 上**：插件体在 Windows 上抛出 ⇒ 启动失败（进程组语义不同，本版不做）。
**配置错误一个政策**（与同批节点、`apps/cli` 同一条）：config 经 `definePlugin` 的 `Config` 在插件体之前校验，不过即 fiber `FAILED`、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；诊断点名那一项、不含值。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：落点判定与进程组原语以函数公开，不依赖 Cordis、会话或租户；本插件的服务面是它们的一种消费者。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `decidePlacement(reading)` | 纯判定：一份工具落点读数（或「读不到」）→ `host`／`noLanding{why}`／`unavailable`，按契约 S-6 的次序 | [S-6](../../../../spec/capabilities/execution-environments/v2/contract.md#s-6-落点判断本版只有宿主机) 第 1～4 条 |
| `decideExtensionLanding(allowance)` | 纯判定：拓展件子进程的宿主机允许（有／没有／读不到）→ `host`／`noLanding{hostNotAllowed}`／`unavailable` | S-6 末段 |
| `resolveProgram(program, environment, workingDirectory, probe)` | 按 `environment` 里的程序搜索路径解析出绝对路径，或交回 `programNotFound`／`launchRefused`；`probe` 是可替换的文件探测端口 | [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) ③⑥ |
| `startGroup(launch, limits, signals?)` → 句柄 | 起一个进程、开一个新组；句柄有 `outcome()`（起的那一个结束时交结果）与 `stop()`（按组停、每次发信号前核组长身份、在 `stopReplyBound` 内答 `confirmedGone`／`notConfirmed`、未确认则继续停直到句柄被释放）；`signals` 是可替换的信号端口（故障注入用） | S-13～[S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup) 的起停语义 |

**Cordis 服务面**：插件 `execution-environments-host`、服务 `executionEnvironments`（五个操作，名字取契约），不 inject 任何服务（[下节](#插件边界与服务面)）。

**只在运行时层成立、函数层不承诺**：执行环境引用绑定 (租户, 会话)、同一次在场里同一对同一个引用、跨租户与跨在场一律 `referenceNotValid`（S-5）；进程组引用绑定它的执行环境引用、到 `confirmedGone` 为止有效（S-7）；落点读数的来路与「每次现读」（S-12 ④——函数只判交来的那一份）；撤除时停下起过的每一组、在等的答 `environmentsWithdrawn`（S-17）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **落点判定与进程组原语都公开**（选）；落选：只公开两个纯判定，起停留在插件里 | 进程组原语的形状全押在待取证的上游语义上（EEH-7），此刻公开等于交出一个还没定形的面 | 形状随取证结论可能改；candidate 期要跟着改公开入口 | 中：「在宿主机上按组起停、有界答复」是 MCP 桥的 stdio 连接与兼容件都要的构件，外部包装者最想单独拿的就是它 |

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `execution-environments-host`（候选名），一条 fiber，据点根作用域一份。不 inject 任何服务**：它没有耐久事实，不要存储；不写领域时刻，不要 `clock`（停止宽限与答复上界是时长，由定时器量）。
它 provide 一个服务 `executionEnvironments`（服务键见契约 README；执行宿主、派发器、兼容件三个消费者共用），方法与契约第四节五个操作一一对应：`resolveSessionEnvironment`、`placeExecution`、`startProcess`、`processOutcome`、`stopProcessGroup`。**全部尚未实现**。

**落点读数的来路**（契约 [G-2](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口)、G-3：没有契约）：每次调用时经 `resolveOptional` 现取一个可选服务（候选名 `executionPlacementReadings`，**无契约，形状是本节点对来路的要求**，[下文](#对落点读数来路的要求清单)）。验收装配由 `apps/cli` 测试代码里的一个种子件提供它；产品装配里没有它。

插件体 provide 服务、登记**一个** effect，持有：引用表（(租户, 会话) ↔ 执行环境引用）、进程组表（进程组引用 → 组号、所属执行环境引用、子进程句柄、结果、状态、「组空」标记与看守定时器）、在途起进程计数、在等的调用、撤除标记。**全部只在内存里**——契约 [S-17](../../../../spec/capabilities/execution-environments/v2/contract.md#s-17-撤除重启与在途) 第 1 条：本能力没有耐久事实。

**config**（候选名；全部必填、代码里不放默认，缺一或非法即启动失败）：

| 配置项 | 形状与约束 | 候选初值（由装配的配置给） | 来源条款 |
|---|---|---|---|
| `stopGrace` | 正时长 | **2 s** | 契约 S-15 ④、[G-6](../../../../spec/capabilities/execution-environments/v2/contract.md#十已知缺口) |
| `stopReplyBound` | 正时长，大于 `stopGrace` | **5 s** | 契约 S-15 ④、G-6 |
| `outputBound` | 正整数字节，每一路各自 | **1 MiB** | 契约 [S-14](../../../../spec/capabilities/execution-environments/v2/contract.md#s-14-processoutcome) ⑤、G-6 |
| `outputDrainGrace` | 非负时长 | **100 ms** | 本节点（[关键选择四](#关键选择)） |
| `stopPollInterval` | 正时长，小于 `stopReplyBound` | **50 ms** | 本节点（确认组空的探测间隔与未确认之后继续停的节拍） |

**本节点没有迁移、没有表。**

### 关键选择

**一、不 inject 任何服务；落点读数调用时现取（选）。**

| | 必需 inject 读面：读面不在，本插件 `PENDING` | **读面作可选、每次调用现取（选）** |
|---|---|---|
| 落选方的最强论证 | 读面是判落点的唯一输入，「没有它我不跑」如实；读面换代时本插件重跑，不留旧读面的引用 | —— |
| 本方弱点 | —— | 读面缺席要逐个操作映射成契约值（下一段）；服务总在，消费者看不出「来路根本没装」与「这一次读不到」的差别 |
| 为什么选它 | 产品装配里没有读面（G-2 没有契约）：必需 inject 让本插件整批 `PENDING`，兼容件拿到的是「执行环境缺席」而不是契约 G-3 要它拿到的 `noLanding{hostNotAllowed}`；`resolveSessionEnvironment`、`processOutcome` 这些不需要读面的操作也跟着不在 | 每个操作按契约答：工具落点读面缺席 ⇒ `unavailable`（S-6 第 1 条「读不到」，G-2）；拓展件子进程的允许**没有** ⇒ `noLanding{hostNotAllowed}`（S-6 末段、G-3「读面接线前 fail-closed」）——**两者不对称，是契约给的** |
| 置信度 | 中高 | |

**二、读面是一个可选服务，种子件在 `apps/cli` 测试代码里（选）。**

| | 种子作为本插件 config 的一项（验收装配给、产品装配不给） | **读面是一个服务，本插件现取；种子件是 `apps/cli` 测试代码里的插件（选）** |
|---|---|---|
| 落选方的最强论证 | 少一个插件；种子与本插件同起同停 | —— |
| 本方弱点 | —— | 本节点要写下一个无契约的服务形状（候选）；读面的真承接者到来时要按它的契约改一次 |
| 为什么选它 | 本插件的包里就多了一条「按种子答」的路径，产品装配只差一项 config 就走上它；cli 的规矩是替身不在任何 `packages/*` 里 | 本包里只有「读面说什么就判什么」这一条路径；种子件与替身同在测试代码，结构检查挡得住它进产品清单 |
| 置信度 | 中 | |

**三、程序路径由本插件按 `launch.environment` 的程序搜索路径解析（选），不交给 `spawn` 查找。**

| | `spawn` 直接给 `program`，让它按环境查找 | **起之前自己解析成绝对路径，再交给 `spawn`（选）** |
|---|---|---|
| 落选方的最强论证 | 少一段代码；与操作系统的查找规则逐字一致 | —— |
| 本方弱点 | —— | 要自己写一段 POSIX 查找（按 `:` 切、空项即工作目录、带 `/` 的按工作目录解析），与 `execvp` 的边角可能不同（EEH-7 取证） |
| 为什么选它 | `launch.environment` 里没有程序搜索路径时，底层可能退回一个缺省搜索路径（**假设，待取证**），子进程自己却看不到它——违反 S-13 ③「与子进程自己看到的一致」；工作目录不存在时 `spawn` 报的错误码与「程序不存在」相同，`startFailed` 的两种缘由分不开 | 找不到 ⇒ `programNotFound`、找得到而不可执行或工作目录不在 ⇒ `launchRefused`，都在起之前判出（S-13 末条「从没跑过」）；解析与 `spawn` 之间文件被挪走 ⇒ `spawn` 的 `ENOENT` 仍收成 `programNotFound` |
| 置信度 | 中高 | |

**四、结果在起的那一个进程退出时定下：退出之后最多再等 `outputDrainGrace` 读完管道（选）。**

| | 等三路管道都关闭（`close` 事件）再交结果 | **`exit` 之后，管道读到结束或到 `outputDrainGrace` 为止，先到者定下结果（选）** |
|---|---|---|
| 落选方的最强论证 | 输出一个字节都不丢；不需要多一项配置 | —— |
| 本方弱点 | —— | 起的进程退出前写进管道、却在宽限之后才被读到的字节会丢；子孙与它共用管道，结果里的字节也可能有子孙写的（EEH-4） |
| 为什么选它 | 起的进程在后台留下一个继承了标准输出的孙进程时（契约 [S-21](../../../../spec/capabilities/execution-environments/v2/contract.md#s-21-孙进程随组停下)、examples §2 第 1 步的 `sleep 600 &`），管道要等孙进程结束才关——`processOutcome` 挂到孙进程死为止，违反 S-14 ④「在起的那个进程结束时返回」 | 按 S-14 ④ 返回；结果定下之后管道照读照丢，不让子孙因管道写满而挂住，直到管道关闭 |
| 置信度 | 中 | |

**五、进程组 = POSIX 会话与进程组（选）。**

| | 只追踪起的那一个进程 | 每个组一个控制组（cgroup） | **`detached` 起进程，按组号发信号（选）** |
|---|---|---|---|
| 落选方的最强论证 | 可移植、最简单 | 子孙逃不出去（`setsid` 也逃不掉），确认组空不需要轮询 | —— |
| 本方弱点 | —— | —— | 子孙主动另开会话或进程组就逃出去（契约 S-3 已写明不承诺）；确认组空要轮询；组全灭之后组号可被系统再分配——每次发信号之前要核组长身份（关键选择七），剩一条前提（EEH-5） |
| 为什么选它 | 停不到孙进程，违反 S-7「按组停」 | 要权限与操作系统的控制组层级，Node 核心不带，单机据点以普通用户跑 | Node 内置即可做到，契约的前提（S-7「子孙没有主动移出」）正好是它的边界 |
| 置信度 | 中高 | | |

**六、停组：每组一个停止例程，并发的停止请求共享它、各按自己的时限答复（选）。**每次 `stopProcessGroup` 各自发信号、各自轮询也能工作，但两次并发请求会各发一遍宽限与强制，第二次的宽限从它自己的时刻算，整组被强制结束的时刻取决于谁先来。本方：第一次请求起一个例程（`SIGTERM` → 等 `stopGrace` → 组里还有 ⇒ `SIGKILL` → 每 `stopPollInterval` 探一次组空），后来的请求只登记一个等待者；每个等待者的时限是它自己到达时刻加 `stopReplyBound`，到点仍未确认就答 `notConfirmed`，**例程不停**——此后每个节拍先核组长身份（关键选择七）、核得上再发一次 `SIGKILL` 并探组空，直到组空、核不上或本插件撤除（S-15 末段：未确认之后继续停）。置信度：高。

**七、每一次发信号之前核组长身份：问三件事——组长收回没有、组号上另有没有进程、看守见没见过组空（选；契约 [S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup) ④ 与第六节「信号绝不到达组外进程」，主线裁定 [D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②）。**

| | 组号加组长起始时刻（读 `/proc/<组号>/stat`；桥节点 S-28 回收的先例） | pidfd（Linux ≥ 5.3） | **三问（选）** |
|---|---|---|---|
| 落选方的最强论证 | 与桥的回收同一套身份；跨重启也核得了（桥靠它回收上一任留下的进程） | 内核给的进程句柄，不怕号被再分配 | —— |
| 本方弱点 | —— | —— | 组长退了而组里还有子孙时，要一个看守每 `stopPollInterval` 探一次，直到组空（每个这样的组每拍一次系统调用）；第三问立在一条前提上（EEH-5，N-9 取证）；第一问立在假设 ⑧ 上 |
| 为什么不选／选它 | 组长先退、子孙还在组里时 `/proc/<组号>` 已不在、起始时刻读不出 ⇒ 这样的组一律「判不出」，`SIGKILL` 一次也发不出去——而 `SIGTERM` 之后组长先退正是最常见的次序；只在有 `/proc` 的系统上成立。本节点没有耐久事实、不跨重启回收（G-7），用不上它的长处 | 它指一个进程、不指一个组，按组发信号仍用组号；Node 核心没有 pidfd 接口，要原生扩展 | 本实例自己起、自己收回组长，「组号此刻被谁占着」它知道得最准；Node 内置即可做到 |
| 置信度 | | | 中 |

**判法**（每一次发 `SIGTERM`／`SIGKILL` 之前，与发信号在同一段同步代码里，中间不 `await`）：

1. **组长还没被本进程收回**（子进程句柄上退出码与信号都还空）⇒ 组号被它占着（活着或是僵尸，假设 ⑦⑧）⇒ 这个组就是本组 ⇒ 发。
2. **组长已收回，组号上此刻有进程**（`process.kill(组号, 0)` 成功或 `EPERM`）⇒ 那不是本组的组长，组号已被再分配 ⇒ 原组已一个不剩（假设 ⑦）⇒ **核不上**：不发、例程停、按一个都不剩答 `confirmedGone`（S-15 ④）、**error 级**记录（组号、引用）——它说明本机的号在一个看守间隔里转完了一圈，是 EEH-5 那条前提失守的信号。
3. **组长已收回，组号上没有进程**（`ESRCH`）⇒ 看守没见过这个组空 ⇒ 核得上，发；见过 ⇒ 组已记成空，不再发任何信号，答 `confirmedGone`。
4. **探测报 `ESRCH`／`EPERM` 以外的错误码** ⇒ **判不出** ⇒ 这一次不发、按 `notConfirmed` 答、下一拍再核（S-15 ④），error 级记录。

**看守**：组长被收回（`exit` 事件）的那一刻同步探一次组（`process.kill(-组号, 0)`）：`ESRCH` ⇒ 记下「组空」；还有 ⇒ 起一个定时器每 `stopPollInterval` 探一次，探到 `ESRCH` 即记下「组空」、停定时器。停止例程自己的探测算看守的一拍。看守只发信号 0，不递送任何信号。**剩下的前提**（EEH-5）：看守相邻两拍之间（`stopPollInterval` 加事件循环的停顿），号空间没有转完一圈、把这个号分给一个新进程、它又自立为组长再退出只留下组员——否则第 3 问会把那个新组认成本组。

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。**判定次序**一律：表示层 → 撤除标记 → 引用 → 读面 → 起停。方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/execution-environments/v2/contract.md#s-5-执行环境引用) 执行环境引用 | 引用表：(租户两个分量, 会话) → 32 字节随机引用，反向表引用 → (租户, 会话) | 尚未建包 | 跨租户、没发过、上一次在场发的一律同一个 `referenceNotValid`；引用不含任何可读出的内容 |
| [S-6](../../../../spec/capabilities/execution-environments/v2/contract.md#s-6-落点判断本版只有宿主机) 落点判断 | `decidePlacement`／`decideExtensionLanding`；读数每次经读面现取 | 尚未建包 | `always-allow`、`auto_place` ⇒ `host`（N-37 ⑥）；不缓存；不回退；本插件不另持任何名单 |
| [S-7](../../../../spec/capabilities/execution-environments/v2/contract.md#s-7-进程组) 进程组 | 进程组表；组号 = 起的进程号（`detached`）；进程以本进程的操作系统身份跑（`spawn` 不给 `uid`／`gid`） | 尚未建包 | 引用寿命到 `confirmedGone`；起的进程自己退出不使引用失效（起看守，[关键选择七](#关键选择)）；信号只到本组：每次发之前核组长身份，剩下的前提见 EEH-5 |
| [S-8](../../../../spec/capabilities/execution-environments/v2/contract.md#s-8-缺席时的默认答案)、[S-9](../../../../spec/capabilities/execution-environments/v2/contract.md#s-9-失败值) 缺席与失败值 | 失败映射表（[下文](#状态并发与失败映射)） | 尚未建包 | 失败值恰六个，没有 catch-all |
| [S-11](../../../../spec/capabilities/execution-environments/v2/contract.md#s-11-resolvesessionenvironment) `resolveSessionEnvironment` | 查或登记引用表 | 尚未建包 | 不核会话持有的租户（调用方义务，S-3）；同一对同一个引用 |
| [S-12](../../../../spec/capabilities/execution-environments/v2/contract.md#s-12-placeexecution) `placeExecution` | 引用核对 → 现取读面、读这个租户下这个工具的权限与目标环境 → `decidePlacement` | 尚未建包；读面无契约（G-2，EEH-1） | 读面缺席或答「读不到」⇒ `unavailable`；两样之一读不到即整份「读不到」（次序回归例 3） |
| [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) `startProcess` | 表示层（含 `launch` 五项全在；参数与环境里没有 NUL、变量名里没有 `=`——操作系统传不了的一律 `invalidInput`）→ 撤除 → 引用 → 拓展件子进程的允许 → 工作目录与 `resolveProgram` → `spawn`（`shell: false`、`env` 恰是 `launch.environment`、`cwd`、`detached`）→ 等 `spawn` 或 `error` 事件 → 登记组、写 `input` 后关标准输入 | 尚未建包；上游语义待取证（EEH-7） | **实现约束**：在途起进程计数在撤除标记核过的**同一段同步代码里、第一个 `await` 之前**加一，调用落定时减一；`spawn` 之前同步再核一次撤除标记，已置即不起、答 `environmentsWithdrawn`（撤除序列第 ② 步等的就是这个计数）。**提交点**是 `spawn` 事件：之前失败什么都不留；**产品装配未交入允许时 fail-closed**：读面缺席即「没有允许」⇒ `noLanding{hostNotAllowed}`（G-3、N-37 ⑧），什么都不起。环境变量**恰是**交来的那一份，本插件不按任何白名单增删：`EnvAllowlist` 的形状定在 S-13 表下，由调用方按它自己的那一份取出再并进 `launch.environment`（EEH-3，已闭合） |
| [S-14](../../../../spec/capabilities/execution-environments/v2/contract.md#s-14-processoutcome) `processOutcome` | 等组表里那一项的结果（[关键选择四](#关键选择)）；每一路各收 `outputBound` 字节，超出的丢、置 `truncated` | 尚未建包 | `exit` 带码 ⇒ `exited{code}`，带信号 ⇒ `terminated`；放弃等待不停任何东西；重复取同一份；等待没有自己的时限 |
| [S-15](../../../../spec/capabilities/execution-environments/v2/contract.md#s-15-stopprocessgroup) `stopProcessGroup` | 每组一个停止例程（[关键选择六](#关键选择)） | 尚未建包 | 组已经空了（看守已记下）⇒ 立即 `confirmedGone`；每次发信号之前核组长身份（[关键选择七](#关键选择)）：核不上 ⇒ 不发、例程停、答 `confirmedGone`、error 级记录；判不出 ⇒ 这一次不发、`notConfirmed`；答 `confirmedGone` 之后从组表删掉那一项、引用失效；`notConfirmed` 之后例程继续 |
| [S-16](../../../../spec/capabilities/execution-environments/v2/contract.md#s-16-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-17](../../../../spec/capabilities/execution-environments/v2/contract.md#s-17-撤除重启与在途) 撤除、重启与在途 | 撤除序列在一个 effect 里（[装卸](#成对的装载与撤除)） | 尚未建包 | 重启后引用表与组表都是空的 ⇒ 旧引用一律 `referenceNotValid`；崩溃时还在跑的进程不被停（G-7） |

### 对落点读数来路的要求清单

**这不是一份契约**（G-2、G-3 的来路本版没有契约）；它是本节点对「谁来给读数」的要求，验收装配的种子件按它写，真承接者（PF-005 那一程与资产设置求值那一侧）到来时按它们的契约改这里。服务名与方法名都是**候选**。

| # | 要求 | 对应条款 |
|---|---|---|
| RD-1 | `toolPlacement(tenant, tool)` 交回这个租户下这个工具**此刻**的执行环境权限（`always-allow`／`auto_place`／`never-allow`／没有值）与目标环境（声明了／没声明），**两样一起**；任一样读不到就整份答「读不到」 | S-6 第 1～4 条、S-12 ④ |
| RD-2 | `extensionHostAllowance(tenant)` 交回拓展件子进程的宿主机允许：有／没有／读不到。**产品允许针对 hooks 兼容件（D-064 ⑭）**，本节点只把租户交过去；如何让读面保持这一范围而不扩到其他拓展件，仍归 G-3 的接线义务 | S-6 末段、G-3 |
| RD-3 | 不缓存：每次调用答此刻的值 | S-6「每次现判」 |
| RD-4 | 「没有值」与「读不到」分得开 | S-8 第 2、3 行 |

### 事件与过滤器

**不发、不听任何 Cordis 事件**（契约第五节）。进程结束、组被确认停下都经 `processOutcome`、`stopProcessGroup` 的返回交回。

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 落点读数（`executionPlacementReadings`，候选；**无契约**） | **可选**，每次调用 `resolveOptional` 现取（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)） | 每次现取；读面换代不让本插件重跑 | 缺席：工具落点 ⇒ `unavailable`；拓展件子进程 ⇒ `noLanding{hostNotAllowed}`（关键选择一） |
| 身份值、会话引用、工具定义引用的形状 | **纯 import** | 随包版本 | —— |

**被谁消费**（都调用时现取本服务）：执行宿主起执行者第 2 步调 `placeExecution`（[tool-execution-runtime](../../tools/tool-execution-runtime/design.md) T-6）；派发器解析执行环境句柄时调 `resolveSessionEnvironment`，先经 `sessionTenancy` 取租户；兼容件经 `startProcess`／`processOutcome`／`stopProcessGroup` 起、等、停子进程，拿到结果之后停组（[hooks-import](../../agent-loop/hooks-import/design.md#一次被调到的子进程起限时停) 的四件事）。本插件没有 inject 边，**任何提供者换代都不让它重跑**。

## 状态、并发与失败映射

**写权**：两张表只由本插件的操作与停止例程写；JS 单线程，读表、改表之间没有交错。**组的状态**：`running`（起来了）→ `ended`（起的那一个退出了、已被收回，组里可能还有子孙；看守在探）→ 停止例程在跑 → `gone`（确认组空，从表里删）；停止例程可以在 `running` 或 `ended` 时开始；`ended` 的组被看守记成「组空」之后不再发任何信号。**服务状态**：`serving` → `withdrawn`（撤除开始，单调）。**本节点没有存储，也就没有跨 owner 的「同一提交」**。

**失败映射**（没有 catch-all）：

| 情形 | 映射 |
|---|---|
| 身份参数缺席、形状不合；`launch` 任一项缺席；参数或环境里有 NUL、变量名里有 `=` 或为空 | `invalidInput` |
| 撤除标记已置 | `environmentsWithdrawn` |
| 引用没发过、上一次在场发的、不属于交来的租户；进程组引用不是经这个执行环境引用起的、或已 `confirmedGone` | `referenceNotValid`（不分） |
| 读面缺席（工具落点）；读面答「读不到」 | `unavailable` |
| 权限是 `never-allow` 或没有值；拓展件子进程没有允许（含读面缺席） | `noLanding{hostNotAllowed}` |
| 目标环境声明了 | `noLanding{requirementNotJudged}` |
| 程序按搜索路径找不到；解析之后 `spawn` 报 `ENOENT` | `startFailed{programNotFound}` |
| 工作目录不在或不是目录；程序找得到而不可执行；`spawn` 报其余错误码（`EACCES`、`EAGAIN`、`EMFILE`、`ENOMEM`…） | `startFailed{launchRefused}` |
| 写标准输入遇到 `EPIPE`（子进程先关了它） | 不是这次调用的失败：起的进程照跑，debug 级记录 |
| 发信号之前核组长身份核不上（组号上是别的进程） | 不发；这一组的例程停、答 `confirmedGone`；**error 级**记录（组号、引用） |
| 核组长身份时探测报意外错误码（判不出） | 这一次不发、答 `notConfirmed`、下一拍再核；error 级记录 |
| 本插件的缺陷（表里查到的项形状不对、事件次序违反假设） | 上抛、error 日志——**不折成任何契约值** |

**记日志时不写 `launch` 的参数与环境变量的值**：那是消费者交来的，里面可能有秘密；只写组号、引用与失败类型。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验；平台核对（Windows 即抛） | `definePlugin` 的 `Config` 与插件体开头 | 不过 ⇒ `FAILED`、装配启动失败 | —— |
| `ctx.provide('executionEnvironments')` | 本 fiber；插件体运行即可解析 | 随 fiber 撤（`provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**，EEH-9） | 服务消失；已拿到引用的调用方此后得 `environmentsWithdrawn` |
| 一个 effect：引用表、组表、停止例程与看守的定时器、在途起进程计数、在等的调用、撤除标记 | 本 fiber；空表起步 | —— | **撤除序列**（下文），全在这一个 effect 的 disposer 里 |
| **起过的进程**（外部效果） | 起它的那一次 `startProcess` 在 `spawn` 事件时登记进本实例的组表；**本实例拥有它，直到确认组空或撤除序列第 ⑤ 步** | `spawn` 之前失败什么都不留；`spawn` 之后登记失败是缺陷，先按组停再上抛 | 撤除时按组停；停不下来的留在操作系统里，**此后没有拥有者**（G-7）；它们已经做过的事不回滚 |

**撤除序列**（契约 S-17；一个 effect 内按次序 `await`，basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）：

1. **置 `withdrawn`**：此后到达的请求一律 `environmentsWithdrawn`。
2. **等在途的起进程落定**：等在途计数归零。计数覆盖从撤除标记核过到落定的整段（第一个 `await` 之前就加一，[S-13 行](#契约责任到插件服务与操作)的实现约束），所以停在读面、`stat`、`resolveProgram` 那几次 `await` 里的调用也在等之列：它们醒来后在 `spawn` 之前同步再核撤除标记 ⇒ 不起、答 `environmentsWithdrawn`；已在 `spawn` 与 `spawn`／`error` 事件之间的跑完——**内核不取消在途调用**；起来了的登记进组表（下一步照停），那一次调用答 `environmentsWithdrawn`（「这一次没有结论」：进程起过、随即由撤除停下或停不下）。若计数在第一个 `await` 之后才加一：撤除标记恰在那几次 `await` 期间置位时这一步看不见它，第 ④ 步停完之后它才 `spawn` ⇒ 一个无主进程，且没有任何记录。
3. **交出在等的结局**：正在等的 `processOutcome` 与 `stopProcessGroup` 一律以 `environmentsWithdrawn` 收。
4. **按组停**：组表里每一个还没 `gone` 的组并发跑停止例程，各以 `stopReplyBound` 为界。
5. **收尾**：仍未确认的组记 error 级日志（组号、引用，不含参数与环境）；清掉全部定时器（停止例程与看守）、移除管道上的监听——**那些组此后没有拥有者**：本实例已不在，下一次在场不认识它们（引用全部失效），本版不回收（G-7）。

**在途进程归谁**：从 `spawn` 事件到撤除序列第 ⑤ 步，归起它的这个实例；消费者（兼容件）对它的停止请求在第 ① 步之后得 `environmentsWithdrawn`，按「未确认」处置（契约 S-17 末条）。**保留**：没有——本能力没有耐久事实。

**提供者换代时收掉什么**：本插件没有 inject 边，任何依赖换代都不让它重跑；只有装配撤它（排空重启）时走上面的序列。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 [S-16](../../../../spec/capabilities/execution-environments/v2/contract.md#s-16-装配给的保证-vs-协议须给的保证) 逐行；右列（执行环境在远端时）本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 只有显式允许才落宿主机 | 读面说是什么就判什么，缺席不当允许 | 本节点 ＋ **装配**（读面：验收装配的种子件；产品装配没有，G-2、G-3） |
| 交来的租户就是会话持有的租户 | 不核 | **装配**（调用方经 `sessionTenancy` 取了再交，cli A-21） |
| 按组停得到整组 | 本进程与子进程同机、同一操作系统身份；组号发信号 | 本节点 ＋ **装配**（据点进程不改自己的操作系统身份） |
| 有界答复 | 停止例程按 `stopReplyBound` 答 | 本节点 |
| 子进程环境变量不带本进程的秘密 | `env` 恰是 `launch.environment` | 本节点（**假设 ⑤ 待取证**，EEH-7） |

**归装配的事项**（点名给 `apps/cli`）：五项 config 的值；验收装配里提供读面的种子件（执行环境权限、目标环境、拓展件子进程的允许，放在 `apps/cli` 测试代码，产品清单里出现即结构检查失败）；**要求 cli 把本插件加入它的显式撤除次序**——在兼容件与执行宿主之后撤（它们撤除时要经本插件停下起过的组；cli 的承接行 A-32，[「归装配」逐条承接](../../../apps/cli/design.md#归装配的事项逐条承接)）；**未加入时的收场**（已兜住，次序不承担正确性）：兼容件的停组得 `environmentsWithdrawn`、按「未确认」交回，而本插件自己的撤除序列第 ④ 步已按组停——显式次序只让验收里的撤除收场确定、可断言；据点进程以普通用户身份跑、不改身份。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 EEH-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| EEH-1 | **工具落点读数没有来路**（契约 G-2）：产品装配里每一次 `placeExecution` 答 `unavailable` | 执行宿主 S-38 第 2 步（`failed{environment_unavailable}`，TER T-6） | PF-005 owner ＋ 资产设置求值那一侧 | 有一个读面给出「这个租户下这个工具此刻的权限与目标环境」；本节点 RD-1 改指它 |
| EEH-2 | **拓展件子进程的宿主机允许没有**（契约 G-3，账本 ⑭）：产品装配未交入允许时 fail-closed，每一件兼容件「起不来」；产品允许针对 hooks 兼容件，读面须保持这一范围（RD-2） | 兼容件全部（HI-N1） | 执行环境与据点装配 owner | 产品已裁；读面给出那一项 |
| EEH-3 | **已闭合**：`EnvAllowlist` 的形状定在契约 [S-13](../../../../spec/capabilities/execution-environments/v2/contract.md#s-13-startprocess) 表下那一条（名集合；按它从据点进程环境取出的恰是名字在集合里、环境里此刻有的那几个）。本能力不持有、不读任何一份——`launch.environment` 由调用方交全；兼容件的 `hookEnvAllowlist` 与桥的 `stdioEnvAllowlist` 是两个策略点、同一个形状，各自引用那一条、各自应用。本插件恰好交 `launch.environment`、不按白名单增删（S-13 行） | —— | —— | —— |
| EEH-4 | **已闭合**：契约 [S-14](../../../../spec/capabilities/execution-environments/v2/contract.md#s-14-processoutcome) ⑤ 已改为「起的进程所在管道上的字节」（D-060 §八 N-40 ③）：子孙与它共用管道，结果里可能有子孙写的字节，退出之后 `outputDrainGrace` 才到的字节会丢 | —— | —— | —— |
| EEH-5 | **组号再分配：已改为每次发信号前核组长身份（[关键选择七](#关键选择)），剩一条前提作证据义务**——组长已收回之后，看守相邻两拍之间（`stopPollInterval` 加事件循环停顿）号空间转不完一圈并让一个新组长占过又放下这个号；取证与演练见 verification N-9 第 ⑨ 条、N-11。另：停不下来与崩溃之后的组无人回收（契约 G-7） | 契约第六节「信号绝不到达组外进程」、S-15 ④；S-17 | 本节点（前提的取证）；PF-005 那一程（G-7） | N-9 第 ⑨ 条在目标机上量出号空间转一圈的最短时间远大于看守间隔、N-11 演练通过；G-7 的闭合（耐久记下起过的组、按身份核对后回收） |
| EEH-6 | **引用表只增不减**：会话结束不使引用失效（契约 G-8），长期待机的据点里引用表随会话数增长；组表靠调用方停组才收，消费者不停组就一直留着 | S-5、S-7；PF-016 长期待机 | PF-005 ＋ PF-015 那一程 | 会话结束的触发有契约 |
| EEH-7 | **只在 POSIX；进程与信号的上游语义全部待取证**（[实现路径](#实现路径与来源)的八条假设，另加 `execvp` 的查找规则与关键选择三的差别） | S-7、S-13～S-15 | 本节点 | 每条一个会失败的测试（Node 24.18.0 起，Linux 与 macOS 各跑一遍）；需要时登 basis |
| EEH-8 | 「没声明要用执行环境的工具这一维不适用」本版不区分、声明了目标环境即 `requirementNotJudged`（契约 G-4、G-5）：本节点照契约 | S-6 第 3 条、S-12 末条 | PF-005 与 `data.tool-definition` owner | 契约新版本 |
| EEH-9 | `provide` 由 effect 纳管：kernel-basis 有 probe、没有 basis 条目——**待核对主张** | 装卸表 | `core/kernel-basis` owner | 升格为 basis 条目 |
| EEH-10 | **已裁**：路径维持 `infra/`——主线把[两层布局](../../../README.md#packages-的两层布局)里 `infra/` 的定义扩为「兑现 `core/` 协议级构造，或据点／中心的窄口基础设施契约（密钥保管、进程起停、连接探测）」（D-060 §八 N-40 ①） | —— | —— | —— |

**报给主线**（不在本节点改）：hooks-import 设计里引的「HI-N11」在它的缺口表里没有这一行。「工具配 `host` 或 `auto_place` 答 `host`」按契约读作执行环境权限 `always-allow` 或 `auto_place` 答 `host`（`host` 是答复，不是权限值）。**产品装配里装不装**：本版不装（cli 关键选择 5）；装上之后工具一律 `unavailable`、兼容件一律 `noLanding{hostNotAllowed}`——如实失败，不填默认值。
