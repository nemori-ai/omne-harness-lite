# execution-environments-host 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/execution-environments/verification.md`](../../../../spec/capabilities/execution-environments/verification.md)：本版**不建形式工件**（[S-18](../../../../spec/capabilities/execution-environments/v1/contract.md#s-18-本版选用哪些形式工件)），证据全部是对真实操作系统进程的场景与故障注入。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（自己解析程序路径、退出即定结果、共享的停止例程、读面缺席的两种收场、撤除序列）。**本节点尚未建包，一切未开始。**

## 证据义务

### 规范场景（六条加两节实例，全部未开始）

| 场景 | 本节点上的形式与前提 | 另外受阻于 | 状态 |
|---|---|---|---|
| [S-19](../../../../spec/capabilities/execution-environments/v1/contract.md#s-19-落点的四种答案) 落点的四种答案 | 单元测试（`decidePlacement` 逐支）＋ 集成测试：种子件按 RD-1 给六个工具的读数；故障注入：种子件答「读不到」；把第一个改 `never-allow` 再问 | 读面没有契约（EEH-1）：**有前提：种子件** | 未开始 |
| [S-20](../../../../spec/capabilities/execution-environments/v1/contract.md#s-20-拓展件子进程没有允许就不起) 拓展件子进程没有允许就不起 | 两支：种子件答「没有」、种子件**不装**（产品形态）⇒ 都是 `noLanding{hostNotAllowed}`；种子件答「读不到」⇒ `unavailable`；三支都断言一个进程都没起（进程表与操作系统两侧都核） | —— | 未开始 |
| [S-21](../../../../spec/capabilities/execution-environments/v1/contract.md#s-21-孙进程随组停下) 孙进程随组停下 | 对真实进程：`/bin/sh -c 'echo hi; sleep 600 &'`；断言 `processOutcome` 在 `sh` 退出后返回（**不等孙进程**，关键选择四）、`stdout` 是 `hi\n`、`stopProcessGroup` 之后孙进程不在 | 上游语义取证（EEH-7） | 未开始 |
| [S-22](../../../../spec/capabilities/execution-environments/v1/contract.md#s-22-停不下来有界答复之后继续停) 停不下来：有界答复之后继续停 | 故障注入经可替换的信号端口：一段时间内「组里还有」；断言 `stopReplyBound` 之内答 `notConfirmed`、故障解除后例程继续、再停答 `confirmedGone` | —— | 未开始 |
| [S-23](../../../../spec/capabilities/execution-environments/v1/contract.md#s-23-环境变量不继承) 环境变量不继承 | 本进程环境里放哨兵；`launch.environment` 只给两项、其中**没有**程序搜索路径、`program` 给绝对路径；输出恰两项；另起一个参数里带 `$HOME`、`;` 的进程，核参数逐字相等 | 假设 ⑤（`env` 不合并）待取证 | 未开始 |
| [S-24](../../../../spec/capabilities/execution-environments/v1/contract.md#s-24-别人的引用旧的引用) 别人的引用，旧的引用 | 集成测试；重启以撤除再装上本插件模拟；失败值与「从没发过的串」逐字比较 | —— | 未开始 |
| [examples §3](../../../../spec/capabilities/execution-environments/v1/examples.md#3-停不下来与撤除) 停不下来与撤除 | 验收装配：撤除本插件时有一次 `processOutcome` 在等、一个组在跑 | —— | 未开始 |
| [examples §4](../../../../spec/capabilities/execution-environments/v1/examples.md#4-每个失败值一个反例) 失败值与次序 | 每个失败值一个反例 ＋ 四条次序回归例 | —— | 未开始 |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **程序路径自己解析**（关键选择三）：`launch.environment` 没有程序搜索路径而 `program` 是裸名 ⇒ `programNotFound`（即使本进程的搜索路径里有它）；空项即工作目录；带 `/` 的相对路径按工作目录解析；工作目录不在 ⇒ `launchRefused`、不是 `programNotFound`；解析之后文件被挪走 ⇒ `programNotFound`。**变异**：把查找交回 `spawn` 时第一支要红 | 集成测试 | 未开始 | 本节点 |
| N-2 | **退出即定结果**（关键选择四）：孙进程继承管道并持续写时，`processOutcome` 在 `outputDrainGrace` 之内返回；结果定下之后孙进程写满管道也不挂住（照读照丢）；超出 `outputBound` 的截断标记准确 | 集成测试 | 未开始 | 本节点 |
| N-3 | **共享的停止例程**（关键选择六）：两次并发 `stopProcessGroup` 只有一轮 `SIGTERM`／`SIGKILL`；各自按自己到达的时刻加 `stopReplyBound` 答复 | 集成测试（信号端口计数） | 未开始 | 本节点 |
| N-4 | **撤除序列**：撤除时在 `spawn` 途中的那一次答 `environmentsWithdrawn` 而它起的进程被停；在等的调用都得 `environmentsWithdrawn`；停不下来的组记 error 日志后不再有定时器、不再发信号 | 演练（信号端口故障注入） | 未开始 | 本节点 |
| N-5 | **读面缺席的两种收场**（关键选择一）：不装种子件时，`placeExecution` 答 `unavailable`、`startProcess` 答 `noLanding{hostNotAllowed}`、`resolveSessionEnvironment` 照常 | 集成测试 | 未开始 | 本节点 |
| N-6 | **配置错误一个政策**：五项任一缺席或非法、`stopGrace ≥ stopReplyBound`、`stopPollInterval ≥ stopReplyBound`、Windows 上装载 ⇒ 启动失败、诊断点名不含值 | 单元测试 ＋ `apps/cli` 装配测试 | 未开始 | 本节点 ＋ `apps/cli` |
| N-7 | **日志不带参数与环境变量的值**：以哨兵值起进程、制造每一种失败，扫日志 | 集成测试 | 未开始 | 本节点 |
| N-8 | **公开函数面**：`decidePlacement` 与 `decideExtensionLanding` 逐支穷举；`startGroup` 不装 Cordis、不给租户即可起停；函数层不判引用与租户（那是服务面的事） | 单元测试 | 未开始 | 本节点；有实现即可跑 |
| N-9 | **上游语义取证**（EEH-7 的六条与 `execvp` 查找差别） | 每条一个会失败的测试，Linux 与 macOS 各跑；需要时登 basis | 未开始 | 本节点 |
| N-10 | **结构检查**：本包不 inject 任何服务、不 `emit`、不监听；种子件不在任何 `packages/*` 里、不在产品据点清单里 | `tools/ts-checks`（候选规则）＋ cli 结构检查，带「故意违反就失败」的自测 | 未开始 | 本节点 ＋ `apps/cli` ＋ ts-checks owner |

## 实际执行

**无。**本节点没有源码；契约本版没有形式任务。

## 覆盖缺口

- **全部条款没有任何实现证据**：源码、测试、集成运行都不存在；[bindings](bindings.yaml) 为空。
- **只能在种子件上跑通的**（D-040 §八 N-35 ①）：S-19 的四种答案；S-21～S-23、examples §2／§3 的全部起停（`startProcess` 要种子件给出拓展件子进程的允许才起得来）——记「有前提：种子件」，不计入实际验证完成数。受阻消费者：执行宿主起执行者第 2 步（产品里恒 `failed{environment_unavailable}`）、全部兼容件（产品里恒「起不来」）。
- **上游语义全部待取证**（EEH-7）：S-7、S-13～S-15 的每一条都立在六条假设上。
- **契约读法待核**：S-14 ⑤「它写出的字节」（EEH-4）。
- **契约 S-16 右列（协议须给）**本节点一条都不兑现。

## 独立评审

**尚无。**本节点首稿未经独立评审；评审意见与处置落在这里，处置不等于评审闭合。
