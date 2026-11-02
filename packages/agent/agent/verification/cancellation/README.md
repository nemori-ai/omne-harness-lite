# Run 取消与单调用中断的有限模型

[Cancellation.tla](Cancellation.tla) 检查取消与模型请求、工具动作和结果接收之间的交错。模型检查只说明给定抽象和有限范围内的性质。它不证明产品实现符合模型，也不证明外部服务最终响应。

## 采用与边界

本资源按 #502 revision 3 的 R2-D15 和 M-CANCEL 闭包维护。采用的源码与契约基线是 `2e6fa47b1e95b8f0108fbe2032d9f9457f4b54a8`。

| 契约拥有者 | 本模型采用的承诺 |
| --- | --- |
| [Agent 的四种控制](../../../agent-contract/SPEC.md#四种控制)及其六个阶段 | 取消停止 execution 的新推进。单调用中断不终结 execution，也不取消其他调用。受理、撤权、生产者确认和物理停止分别表达 |
| [Agent 的取消判断与路线](../../../agent-contract/SPEC.md#取消判断与路线) | 取消沿受信判断和唯一终态出口完成。已发生内容、费用和未交清责任保持原归属 |
| [Session 的终态与控制](../../../../session/session-contract/SPEC.md#终态与控制) | 取消生效时同次记录 Run 终态并撤销新发起资格。终态至多一次。迟到结果可以保存 |
| [PA-08](../../../../session/session-contract/SPEC.md#pa-08-取消与受理取消与终结的竞争) | 按权威顺序处理取消与正常终结的竞争。Agent 已结束但 Session 尚未解释时，取消仍可先成为 Run 终态 |
| [Session C3](../../../../session/session/SPEC.md#c3-控制传播协调器) | 保存取消意图之后，沿原关联传播。传播完成不等于生产者已停止 |

本模型补上派发、取消和接收的组合交错。现有 [Finishing 模型](../../../agent-contract/verification/models/Finishing.tla) 继续负责候选、判断、责任清单、原操作认回和条件终结的细节。[Model reception 模型](../model-reception/README.md) 继续负责接收共同提交、资格核验和账目出站。本资源不替换这两份模型，也没有证明三个模型之间的精化关系。

## 状态、范围和动作

每个配置包含一个 Run、一个 execution 和一至两个具名的前台调用。正控分别使用一个模型调用加一个工具调用、两个模型调用。调用身份不复用。每个调用最多产生一份部分内容和一份收场内容，各自附带一个费用事实。内容与费用可以分别到达。费用 token 表示应保留的费用事实，不表示数值加总正确。

| 状态变量 | 含义与拥有者 |
| --- | --- |
| `run`、`terminalWrites` | Session 的 active/completed/cancelled 与终态提交次数 |
| `cancel` | 控制意图的 none/requested/revoked/rejected。requested 可以与正常完成竞争 |
| `eligible` | 当前新推进资格。Session 取消生效和正常终态都撤销它 |
| `fenced`、`confirmed` | Agent 已应用取消围栏，以及对停止新派发的确认。确认不表示物理停止 |
| `agentEnd`、`handedOff` | Agent 的结束结论，以及交给持续接收方的原调用责任集合 |
| `phase`、`outcome` | 每调用的 idle/prepared/running/finished，以及 none/complete/interrupted 收场结果 |
| `interrupted`、`cancelStops`、`singleTarget` | 单调用中断请求、Run 取消的前台中断请求，以及唯一单调用控制的原目标 |
| `produced`、`content`、`costs` | 生产者保管的事实，以及接收方已保存的内容和费用 |
| `everContent`、`everCosts` | 观察用历史集合，只增不减。产品动作不读取它们 |
| `dispatchSafe`、`isolationSafe` | 观察用布尔值，记录是否出现确认后派发或单调用控制越界。产品动作不读取它们 |

| 动作 | 状态变化与抽象边界 |
| --- | --- |
| `Prepare(c)` | 保存一次动作准备。取消可以发生在准备之后、派发之前 |
| `Dispatch(c)` | 重新核对资格和围栏后派发。它表示原请求进入生产者排序域的线性化点，不表示网络包发送的时间 |
| `RequestCancel` | 保存取消意图。它允许已有准备、派发和接收继续交错 |
| `Revoke` | 同一原子动作撤销新推进资格、记录取消生效，并将 Run 终态设为 cancelled |
| `RejectCancel` | 正常 Run 终态先成立时，将尚未生效的取消意图标为拒绝 |
| `ApplyCancel`、`ConfirmCancel` | Agent 应用围栏并对当前前台调用请求中断，随后确认。两步之间仍允许生产者完成和接收 |
| `Interrupt(c)` | 只对目标调用发送中断请求，不改 Run、推进资格或 Run 取消状态 |
| `EmitPartial(c)`、`Complete(c, result)` | 生产者可在控制前后产生事实。已请求中断的调用仍可正常收场，也可报告 interrupted。中断请求本身不创建收场事实 |
| `ReceiveContent(t)`、`ReceiveCost(t)` | 沿原身份保存事实。它们不要求 Run 或 Agent 仍活跃，也不要求对方事实先到达 |
| `Handoff` | 持续接收方接管已发调用的责任。它不清空生产者材料，不冒充生产者完成 |
| `FinishAgent` | 正常路径要求本有限工作集合已结束并完成接收。取消路径要求确认及原调用责任已交接，不要求生产者物理停止 |
| `InterpretComplete` | Session 将 Agent 正常结束解释为 Run completed。已有 cancelled 终态时不能覆盖 |

`Next` 枚举上述动作的任意交错。没有状态裁剪、最大步数约束或对称性缩减。`CHECK_DEADLOCK FALSE` 允许完成后的合法静止，`NoInternalDeadlock` 另行检查：只有所有必要责任都完成的状态可以没有下一动作。合法 stuttering 不等于进展，进展由时序性质检查。

## 性质与负控

| 要求 | 检查 | 负控与预期反例 |
| --- | --- | --- |
| P1 确认后不发新动作 | `NoDispatchAfterConfirmation` | `bad-model-fence`、`bad-tool-fence` 删除 `Dispatch` 的围栏核对。已准备动作在确认之后才派发 |
| P2 保留已有内容 | `RetainContent` | `bad-content` 清空接收方已存内容，历史集合仍保留该事实 |
| P2 保留已有费用 | `RetainCosts` | `bad-cost` 清空接收方已存费用，历史集合仍保留该事实 |
| P3 单调用隔离 | `SingleCallIsolation`、`OtherCallsProgress` | `bad-interrupt` 将中断目标扩展到全部 running 调用。两个模型调用同时在途时违反隔离 |
| P4 接收有进展 | `EventualReception` | `bad-reception` 删除内容接收动作。生产者已产生内容，公平调度仍不能保存它 |
| P4 终结有进展 | `EventualTermination`、`CancelProgress`、`NoInternalDeadlock` | `bad-finish` 删除 Agent 完成动作，产生永久未结束的时序反例 |

正控还检查 `TypeOK`、`TerminalUnique` 和 `ConfirmationFenced`。`OtherCallsProgress` 要求单调用中断后，其他已发调用最终收场。Run 的继续由不变的推进资格、未改变的 Run 状态和 `EventualTermination` 共同检查。另一次显式 Run 取消仍可合法终结该 Run。

负控各自只改变具名故障开关，不改性质。两个时序负控的 cfg 各只选择一个时序性质，因为 TLC 的时序失败消息不包含性质名。运行器同时核对 cfg、退出码和反例标记，语法错误、工具失败和超时均不算检出。

## 公平性与环境前提

两个常规正控对内部推进、控制传播、责任交接、内容与费用接收使用逐动作弱公平性。动作持续可用时，调度器最终会执行它。用户取消、单调用中断和部分内容产生没有公平性要求，因而取消可以不发生，也可以发生在任意可用时刻。

常规 `Spec` 另假定每个已发调用最终沿 `FinishCall` 收场。这是外部响应前提，可以包含正常完成或中断完成。模型没有设置完成的时间上限，也没有假定取消请求立刻使生产者停止。

`valid-no-response` 使用 `CancelWithoutResponse`，撤掉生产者响应公平性，增加取消请求的弱公平性。它只检查逻辑终结、已产生事实的接收和取消推进，不检查外部调用最终停止。此配置检查逻辑取消能否在生产者永久不响应时完成。正常终态先成立仍是合法竞争结果。

所有进展结论还以前台工作集合有限、当前访问资格可用、受信取消判断最终允许收束、责任接收方持续可用为前提。`FinishAgent` 抽象已经满足的 Finishing 条件，不重新证明政策判断或责任转移提供者。永久拒绝、未知提交、依赖永久消失和无限新输入不在本模型的进展承诺内。这些条件不限制本模型要检查的取消、派发、生产者完成和接收之间的交错。

## 源码映射与后续实现义务

| 模型边界 | 基线公开形状或实际入口 | 现状与所需实现验证 |
| --- | --- | --- |
| 取消与中断控制 | [ExecutionControl、ControlStage、ControlRecord](../../../agent-contract/src/execution.ts) | 公开形状区分六个控制阶段。本模型的 confirmed 仅指派发围栏确认，不能直接写成 `physically-stopped` |
| Session 意图及 Run 终态 | [decideCancelRun、decideStopCall](../../../../session/session-contract/src/decide-control.ts)，[Session SPEC](../../../../session/session/SPEC.md#c3-控制传播协调器) | 纯规则已有具名目标核验。需用真实事务及控制传播证明撤权与终态共同可见，以及迟到的正常结束不能覆盖取消 |
| Agent 派发与唯一终态出口 | [coordinator.ts](../../src/loop/coordinator.ts) 的请求、工具与 F3，`prepareFinish` / `tryFinish` | 基线 F3 使用 advancement 授权。取消路线仍是 [U-19](../../docs/architecture/open-questions.md#待各拥有者闭合的具名缺口)，不得把本模型作为实现完成证据 |
| Agent 控制入口 | [provider.ts](../../src/provider.ts) 的 `control.control` | 基线返回 stage 5 未实现。后续实现需验证派发前最新资格检查，不能只检查准备时的资格 |
| 内容与费用保存 | [receiving.ts](../../src/receiving.ts)、[receiving-outlet.ts](../../src/receiving-outlet.ts) | 需验证取消、单调用中断和逻辑终态之后，原材料、费用与接收责任继续可读。共同提交和原操作认回另由 reception 模型覆盖 |
| 责任交接与收束 | [Finishing 的映射](../../../agent-contract/verification/formal-mapping.md)及 Journal 的 `commitSettlement` / `tryFinish` | 本模型只记录接收责任交接，不证明 U-29 的 Rh 保管、磁盘耐久或跨进程恢复 |

跨进程消息被抽象成可任意延迟的独立动作。权威撤权与生产者新受理必须在同一排序依据上核对，本模型用 `eligible` 表示该依据。实现应验证远端旧快照、缓存许可、失联和重新挂接时的围栏，本模型没有假定进程内布尔值能够提供这些保证。

本模型没有展开租户身份、后台 Tool、暂停、停用、单调用重复控制、多个 execution、模型重试、工具建议准入、完整取消判断或消息丢失后的重传。不得由本模型推导这些行为。线包待裁的 prefixes、authority 主体类别和登记表缺席语义不进入模型。

## 执行

Windows 宿主从工作树根运行。Python 仅使用标准库。TLC 使用任务指定的 WSL Ubuntu-24.04 与 `/opt/tlaplus/tla2tools.jar`。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
export OMNE_TEST_SLOT_DIR="C:/Users/ALIENW~1/AppData/Local/Temp/omne-test-slots-ALIENWARE"
python packages/agent/agent/verification/cancellation/run-models.py --help
python packages/agent/agent/verification/cancellation/run-models.py --parse-only
python -B packages/agent/agent/verification/cancellation/test-runner.py
node scripts/with-test-slot.mjs python packages/agent/agent/verification/cancellation/run-models.py
```

运行器先执行负控，再执行正控。可在命令后追加一个或多个 cfg 名称，不含扩展名。`--timeout` 调整单配置预算，默认 180 秒。`--output` 只能指定本工作树 `tmp/` 下的证据根目录。

Windows 运行器把模型、配置及自身快照通过标准输入复制到 WSL 的独立 `/tmp/omne-cancellation.*`。Java 在该副本运行，TLC 状态文件也留在该副本。证据复制到工作树的 `tmp/line-session-run/w2/M-CANCEL/runs/<UTC 时间>/`。正常结束、失败或超时退出后删除 WSL 副本。没有在 `/mnt/d` 安装依赖或运行仓库构建。

每次执行保存输入 SHA-256、源码 HEAD、JAR SHA-256、Java/TLC 版本、完整命令、参数、退出码、状态数和原始日志。HEAD 只定位基线，输入哈希标识未提交候选的实际字节。正控要求退出 0 且出现完整搜索成功标记。安全性负控要求退出 12、指定不变量及轨迹。时序负控要求退出 13 和时序反例。未执行配置与工具失败不能记为通过。

## 实测范围

2026-11-02 在 Windows 11 宿主启动 WSL Ubuntu-24.04，使用 Temurin 21.0.12.1、TLC2 2.19（TLA2Tools 1.7.4，revision `5a47802`）。JAR SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。参数为一个 worker、`-Xmx1024m`、ParallelGC、seed 787、fingerprint polynomial 0，每 cfg 180 秒预算。

| cfg | 生成状态 / 不同状态 | TLC 退出码 | 判读 |
| --- | --- | --- | --- |
| `valid-mixed` | 327,185 / 73,169 | 0 | 正控安全性质与时序性质通过，搜索深度 24 |
| `valid-models` | 327,185 / 73,169 | 0 | 同上，模型调用之间的控制隔离 |
| `valid-no-response` | 327,185 / 73,169 | 0 | 无生产者响应公平性时，逻辑终结与已产生事实接收通过 |
| `bad-model-fence` | 83 / 57 | 12 | 确认后派发模型请求，违反 `NoDispatchAfterConfirmation` |
| `bad-tool-fence` | 83 / 57 | 12 | 确认后派发工具动作，违反 `NoDispatchAfterConfirmation` |
| `bad-interrupt` | 160 / 111 | 12 | 单调用中断改变另一在途调用，违反 `SingleCallIsolation` |
| `bad-content` | 62 / 49 | 12 | 中断清空已有内容，违反 `RetainContent` |
| `bad-cost` | 66 / 51 | 12 | 中断清空已有费用，违反 `RetainCosts` |
| `bad-reception` | 525 / 276 | 13 | 已产生内容一直未接收，违反 `EventualReception` |
| `bad-finish` | 1,778 / 670 | 13 | Agent 始终未结束，违反 `EventualTermination` |

正控日志均包含 `Model checking completed. No error has been found.`，无剩余队列状态。TLC 报告的指纹碰撞估计为乐观 `1.0E-9`、实际指纹估计 `1.3E-10`。这些仍是有限模型检查结果，不是数学证明。负控在反例处停止，其状态数不代表完整探索。

原始日志与输入快照位于当次工作树 `tmp/line-session-run/w2/M-CANCEL/runs/20261102T121645.502318Z/`，`results.json` 汇总全部十项。上述完整运行入口退出 0。阶段性的模型表达错误和失败输出留在闭包证据目录，不进入长期行为声明。
