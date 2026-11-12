# verification/models

本目录承载本包的形式模型。当前内容有三部分：Journal 收尾协议的有界模型 [Finishing.tla](Finishing.tla) 及其配置、运行脚本与回放轨迹；Agent 循环等人状态点的有界模型 [CardRounds.tla](CardRounds.tla) 及其配置；五个旧状态空间模型的登记。旧模型的脚本与结果文件尚未迁入本目录，也没有重跑。

## 允许的内容

模型源文件、配置、运行结果与说明。每个模型写明它检查的性质、对应的 SPEC 条款、抽象前提与未覆盖的部分。登记与源文件分开：登记在本页，源文件迁入后放在同目录。

## 边界

模型通过不等于实现符合。有限模型检查的结论只在所列规模上限内成立，不写成证明。

### 收尾协议模型（AG-23）

[Finishing.tla](Finishing.tla) 检查 SPEC 的 Journal 收尾协议：候选与路线、终结责任清单、取消判断，commit 的 F1 与 F2、prepareFinish、tryFinish，commitSettlement 的六个变体，消息交接 P、Ja、Rh、exclude 与 `currentHandoff` 指针，有效取消与 Session 参加者，崩溃、重试与同操作认回。状态与事件的对应、抽象、环境假定、规模上限与回放映射见 [formal-mapping.md](../formal-mapping.md)。每次运行的记录见 [formal-runs.md](../formal-runs.md)。

| 文件 | 用途 |
| --- | --- |
| `valid.cfg`、`valid-cancel.cfg`、`valid-coordinated.cfg` | 安全性质的正控。每份检查八条安全性质与 `TypeOK`：七条以不变量检查，`PointerByJa` 以动作性质检查 |
| `valid-keep-cancelled.cfg` | 安全性质的正控，取 `SupersedeStaleCancelled = FALSE`（内存 Journal 的读法），其余同 `valid-cancel.cfg` |
| `live.cfg`、`live-cancel.cfg` | 活性 `CancelSettles` 的正控，在 `LiveSpec` 的公平性假定与 `SupersedeStaleCancelled = TRUE` 的前提下检查 |
| `bad-<错误>.cfg` | 负控。每份打开一个故意的错误，只检查它应命中的那一条性质 |
| `probe-keep-cancelled.cfg` | 探针，不是控制。记录内存 Journal 的读法（`SupersedeStaleCancelled = FALSE`）下 `CancelSettles` 是否成立，不参与通过判定 |
| `trace-*.cfg` | 轨迹导出。`TraceSpec` 只含回放驱动能映射的步骤 |
| `finishing-traces.json` | `run.py traces` 导出的轨迹。`src/testing-journal-replay.ts` 内嵌同一份内容，成员自测核对两者相等 |
| `run.py` | 串行运行 TLC，判读控制的结果，记录探针的观察，保存证据，导出轨迹 |

性质与负控的对应：

| 性质 | 负控配置 | 故意的错误 |
| --- | --- | --- |
| `NoEndWithPending` | `bad-skip-pending` | author route 的 tryFinish 不检查待办项 |
| `UnknownNotBlockedOrEnded` | `bad-unknown-as-pending` | 未定项按待办处理：tryFinish 返回 blocked，判断为 blocked |
| `CancelFirst` | `bad-ignore-cancel` | 推进授权下的 F1、prepareFinish 与 tryFinish 不看有效取消 |
| `NoEndOutsideSettling` | `bad-stale-intent` | prepareFinish 与 tryFinish 不核对 execution 是否在 settling |
| `NoStaleJudgment` | `bad-stale-judgment` | tryFinish 不比较判断输入与当前闭包 |
| `PointerByJa` | `bad-rh-moves-pointer` | Rh 也清除 `currentHandoff` |
| `OneCustodian` | `bad-release-before-custody` | custody 写入的回执未定时，生产者已释放副本 |
| `OneCustodian` | `bad-release-while-issued` | 调用仍为 issued、尚无任何 custody 写入时，生产者已释放副本 |
| `ReplayOriginal` | `bad-recheck-before-recognize` | 同一操作重试时先检查生命周期，后认回原结果 |
| `CancelSettles` | `bad-new-run-blocks-cancel` | 旧 execution 的收束步骤等待新 Run 占用的槽位 |

运行方法：从仓库根经运行名额执行。

```sh
node scripts/with-test-slot.mjs python packages/agent/agent-contract/verification/models/run.py
node scripts/with-test-slot.mjs python packages/agent/agent-contract/verification/models/run.py traces
```

第一条运行全部正控、负控与探针。在命令后追加配置名可以只运行这几项。退出码只由控制决定：每个被请求的控制都运行并通过时为 0。探针只记录观察（holds、violated、did-not-finish 或 unreadable），不影响退出码。第二条导出轨迹，改写 `finishing-traces.json`，并改写回放驱动 `src/testing-journal-replay.ts` 末尾标记之后的轨迹常量。之后用 `pnpm exec oxfmt` 整理回放驱动，重新构建本包，再运行本包测试与两处回放用例。`TLA2TOOLS_JAR` 指向 tla2tools 1.7.4，`JAVA_BIN` 可指定 Java。`FORMAL_OUTPUT_DIR` 指定证据目录，默认是仓库 `tmp/formal/agent-contract-finishing/runs/`。`FORMAL_BUDGET_SECONDS`（默认 1200）、`FORMAL_WORKERS`（默认 4）与 `FORMAL_HEAP`（默认 `-Xmx4096m`）调整单案预算与资源。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 安全负控须退出非零，TLC 报告的被违反性质恰好是配置指定的那一条，并给出反例轨迹。
- 活性负控只有一条 PROPERTY。TLC 的时序违反报告不写性质名，所以按该配置判读：须报告 `Temporal properties were violated.` 并给出反例。
- 超时、解析失败、求值错误与未执行都不算通过。非零退出本身不算负控通过。
- 探针不判通过或失败。探针的配置也只有一条 PROPERTY，`run.py` 按同样的读法记录它成立、被违反或没有完成。

### 等人状态点模型

[CardRounds.tla](CardRounds.tla) 检查 Agent 循环收到一个需要等人的结论之后的原生等待：先保存后呈现，present 结果未知时只用 lookup，整批屏障，一轮全部答复齐备之后才交回，交回至多一次，取消、全拒与终结之后作废尚无答复的卡片并不再采纳，崩溃恢复不回退、不重复。判断来自准入还是扩展不在模型内。现有模型已覆盖的部分、状态与代码落点、环境假定、规模上限与未覆盖见 [formal-mapping.md](../formal-mapping.md#等人状态点模型)。运行记录见 [formal-runs.md](../formal-runs.md#等人状态点模型)。

| 文件 | 用途 |
| --- | --- |
| `cardrounds-safety.cfg`、`cardrounds-safety-wide.cfg` | 安全性质的正控。每份检查十条不变量、`TypeOK` 与动作性质 `RecoveryMonotone`。wide 把崩溃与丢回执的上限各提高到 2 |
| `cardrounds-progress.cfg` | 活性 `Progress` 的正控：没有取消与全拒，人最终答复每张卡片 |
| `cardrounds-settle.cfg` | 活性 `StopSettles` 的正控：取消与全拒都允许，不假定人答复 |
| `cardrounds-reach-<路径>.cfg` | 可达性见证。每份写一条“从不发生”的路径（`Never...`），TLC 必须给出反例。它说明正控不是因为该路径不可达才通过 |
| `cardrounds-bad-<错误>.cfg` | 负控。每份打开一个故意的错误，只检查它应命中的那一条性质 |

性质与负控的对应：

| 性质 | 负控配置 | 故意的错误 |
| --- | --- | --- |
| `BarrierBeforePresent` | `cardrounds-bad-nobarrier` | present 不等整批屏障 |
| `OncePresent` | `cardrounds-bad-newround` | present 结果未知时开新 round 重发同一请求 |
| `ClosedLeavesNoLiveCard` | `cardrounds-bad-noinvalidate` | 终结之后已呈现的一轮不作废就关闭 |
| `ClosedLeavesNoLiveCard` | `cardrounds-bad-asnone` | 终结之后 present 结果未知的一轮不 lookup，按“无卡片”关闭 |
| `OnceHandBack` | `cardrounds-bad-rehandback` | 崩溃后恢复把已有结果的一轮再交回一次 |
| `AllAnsweredBeforeHandBack` | `cardrounds-bad-partial` | 一张卡片有答复就记为已答复 |
| `NoAdoptAfterStop` | `cardrounds-bad-late` | 交回不看取消与全拒 |
| `NoAnswerAfterInvalidate` | `cardrounds-bad-invalidasanswer` | read 把作废读作人的答复 |
| `NoFabricatedAnswer` | `cardrounds-bad-timeout` | 尚无答复的卡片读作答复（默认批准） |
| `WaitHoldsNoSlot` | `cardrounds-bad-holdslot` | ask 之后不释放执行名额 |
| `RecoveryMonotone` | `cardrounds-bad-rewind` | 恢复把已呈现的一轮重建为已请求 |
| `Progress` | `cardrounds-bad-noresume` | 崩溃后恢复把已答复的一轮当作仍在等人 |

运行方法：从仓库根经运行名额执行 `node scripts/with-test-slot.mjs python3 packages/agent/agent-contract/verification/models/run.py cardrounds`。参数 `cardrounds` 只运行本模型的配置，也可以列出单个配置名。`run.py` 对本模型的配置加 `-deadlock`，因为本批已采纳、卡片已关闭这类终止状态不是死锁。判读规则与上一节相同。可达性见证按安全负控判读：TLC 须报告配置指定的那一条 `Never...` 不变量被违反，并给出反例。

### 旧模型的登记

下表登记五个旧模型。性质列写模型检查的不变量，前提列写模型的抽象，未覆盖列写模型没有建模的状态空间。每个模型另有一个负控变体，负控变体违反该性质并给出反例轨迹，用于确认检查器能检出违反。

| 模型 | 性质 | 对应条款 | 前提 | 负控反例 | 未覆盖 |
| --- | --- | --- | --- | --- | --- |
| original-effect | 一个原动作不创建第二个逻辑效果身份（one-effect-per-action） | SPEC 的[并发与提交](../../SPEC.md#并发与提交)，机制页的[操作身份的确定派生](../../../agent/docs/architecture/mechanisms.md#操作身份的确定派生) | 单个逻辑操作，一次崩溃，两个潜在请求身份，理想的原子存储动作 | 崩溃后以新身份重试，生产者受理了两个身份 | 生产者侧的去重能力，网络失败形态，多进程交错 |
| result-custody | 释放生产者副本之前已有耐久的消费保管（custody-before-release） | SPEC 的[持久性与交付责任](../../SPEC.md#持久性与交付责任)，机制页的[交付责任解除的两条路径与保管者更替](../../../agent/docs/architecture/mechanisms.md#交付责任解除的两条路径与保管者更替) | 单个结果，一次崩溃，理想的原子存储动作 | 读取结果后立即解除交付责任，没有耐久保管 | processed 路径的完成依据，后台占位与最终结果的两个版本，材料绑定未知 |
| input-finish | 原输入先受理时，旧完成候选不能成立（no-finish-with-prior-input） | SPEC 的[条件终结](../../SPEC.md#条件终结)与[输入内容与水位线](../../SPEC.md#输入内容与水位线) | 单个 execution，一个输入边界，理想的原子存储动作 | 读取空的输入边界后接入输入，仍按旧边界终结 | 提交参加者的冲突响应，多个输入来源，取消与完成的竞争 |
| send-fence | 旧资格撤回后不能新发出（no-send-after-revocation） | SPEC 的[主体资格核验](../../SPEC.md#主体资格核验)与[恢复与接管](../../SPEC.md#恢复与接管) | 一个挂接，一次撤权，发出围栏为理想原子动作 | 用准备时缓存的允许越过当前撤权 | 接管的条件提交，两个推进者的交错，生产者侧围栏的实际实现 |
| card-barrier | 必要卡片处理完成之后才发工具（processed-before-dispatch） | SPEC 的[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)第 4 条 | 两张卡片，一次崩溃，理想的原子存储动作 | 两张卡片已答复但尚未 processed 即发出工具 | 多轮卡片，present 确定失败，Tool 受理时拒绝 |

五个模型都没有建模：网络的全部失败形态、完整的有限压缩计划、跨源事务、真实的二进制存储、长期公平性、全部多进程交错，以及 Model 的接收窗口、流快照恢复与消费者外部发送成功后丢回执的状态空间。所以它们不能作为流内容重交与外部交付未知这条不变量的验证证据。负控检出这些具体反例不等于证明任意规模下正确。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。切点表、控制竞争表或两条交付责任解除路径改变时，先改对应模型的前提列，再决定是否重跑。迁入脚本与结果文件时，重跑后记录运行结果与检查器版本，并把本页的登记状态改为已运行。

## 本包事实

- 当前内容：收尾协议模型的源文件、配置、运行脚本与导出轨迹；等人状态点模型的源文件与配置；五个旧模型的登记。
- 收尾协议模型的状态：在 [formal-runs.md](../formal-runs.md) 所列规模上限内，安全正控通过，每条性质的负控命中该性质。活性正控只在 `SupersedeStaleCancelled = TRUE`（读法甲）前提下通过。在内存 Journal 的读法（FALSE）下，探针给出 `CancelSettles` 的反例。Reduce 已定的读法乙尚未建模，是进波 2 的已知限制，见 [formal-mapping.md](../formal-mapping.md)“取消收束”。这不是证明，也不表示实现符合模型。两份内存 Journal 的回放结果见同一页。
- 等人状态点模型的状态：在 [formal-runs.md](../formal-runs.md#等人状态点模型) 所列规模上限内，安全与活性正控通过，每个可达性见证给出反例，每条性质的负控命中该性质。Agent 循环已实现官方准入的卡片轮次里出卡、等待与交回的部分（落点见 [formal-mapping.md](../formal-mapping.md)），轮次的关闭尚未实现。没有轨迹回放，模型不表示任何实现符合它。模型取的三项读法见 [formal-mapping.md](../formal-mapping.md#模型取的读法与契约缺口)。
- 旧模型的来源与状态：源文件与结果文件不在本包，迁入前只是登记。已登记，未重跑，未验证，不能作为验证证据。
- 证据缺口：作者协议的回放协议，即唯一提交点加幂等认回，尚无行为模型。扩展调用先提交已请求、调用后提交结论、结果未知时以 `replay` 重调、能力按经过身份加操作序号认回原操作，这条链的“已有最终结论的调用不再调用”“认回不重复计费”与“比对不一致后锁存”都只由 SPEC 与作者协议页陈述，场景推演见[持续验证场景](../scenarios.md#扩展调用的接续)。本页不宣称它已验证。补模型时按上表的格式登记性质、前提、未覆盖和负控变体。
- 负责人：本包的维护者。迁入前的缺口是源文件、运行结果与检查器版本三项。
