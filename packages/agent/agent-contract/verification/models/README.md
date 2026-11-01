# verification/models

本目录承载本包的形式模型。当前内容有两部分：Journal 收尾协议的有界模型 [Finishing.tla](Finishing.tla) 及其配置、运行脚本与回放轨迹；五个旧状态空间模型的登记。旧模型的脚本与结果文件尚未迁入本目录，也没有重跑。

## 允许的内容

模型源文件、配置、运行结果与说明。每个模型写明它检查的性质、对应的 SPEC 条款、抽象前提与未覆盖的部分。登记与源文件分开：登记在本页，源文件迁入后放在同目录。

## 边界

模型通过不等于实现符合。有限模型检查的结论只在所列规模上限内成立，不写成证明。

### 收尾协议模型（AG-23）

[Finishing.tla](Finishing.tla) 检查 SPEC 的 Journal 收尾协议：候选与路线、终结责任清单、取消判断，commit 的 F1 与 F2、prepareFinish、tryFinish，commitSettlement 的六个变体，消息交接 P、Ja、Rh、exclude 与 `currentHandoff` 指针，有效取消与 Session 参加者，崩溃、重试与同操作认回。状态与事件的对应、抽象、环境假定、规模上限与回放映射见 [formal-mapping.md](../formal-mapping.md)。每次运行的记录见 [formal-runs.md](../formal-runs.md)。

| 文件 | 用途 |
| --- | --- |
| `valid.cfg`、`valid-cancel.cfg`、`valid-coordinated.cfg` | 安全性质的正控。每份检查八条安全性质、`TypeOK` 与动作性质 `PointerByJa` |
| `live.cfg`、`live-cancel.cfg` | 活性 `CancelSettles` 的正控，在 `LiveSpec` 的公平性假定下检查 |
| `bad-<错误>.cfg` | 负控。每份打开一个故意的错误，只检查它应命中的那一条性质 |
| `probe-keep-cancelled.cfg` | 探针，不是控制。检查内存 Journal 的读法下 `CancelSettles` 是否成立 |
| `trace-*.cfg` | 轨迹导出。`TraceSpec` 只含回放驱动能映射的步骤 |
| `finishing-traces.json` | `run.py traces` 导出的轨迹。`src/testing-journal-replay.ts` 内嵌同一份内容，成员自测核对两者相等 |
| `run.py` | 串行运行 TLC，判读结果，保存证据，导出轨迹 |

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
| `ReplayOriginal` | `bad-recheck-before-recognize` | 同一操作重试时先检查生命周期，后认回原结果 |
| `CancelSettles` | `bad-new-run-blocks-cancel` | 旧 execution 的收束步骤等待新 Run 占用的槽位 |

运行方法：从仓库根经运行名额执行。

```sh
node scripts/with-test-slot.mjs python packages/agent/agent-contract/verification/models/run.py
node scripts/with-test-slot.mjs python packages/agent/agent-contract/verification/models/run.py traces
```

第一条运行全部正控、负控与探针。在命令后追加配置名可以只运行这几项。第二条导出轨迹，改写 `finishing-traces.json`，并改写回放驱动 `src/testing-journal-replay.ts` 末尾标记之后的轨迹常量。之后用 `pnpm exec oxfmt` 整理回放驱动，重新构建本包，再运行本包测试与两处回放用例。`TLA2TOOLS_JAR` 指向 tla2tools 1.7.4，`JAVA_BIN` 可指定 Java。`FORMAL_OUTPUT_DIR` 指定证据目录，默认是仓库 `tmp/formal/agent-contract-finishing/runs/`。`FORMAL_BUDGET_SECONDS`（默认 1200）、`FORMAL_WORKERS`（默认 4）与 `FORMAL_HEAP`（默认 `-Xmx4096m`）调整单案预算与资源。

判读规则：

- 正控须退出 0，并输出 `Model checking completed. No error has been found.`。
- 安全负控须退出非零，TLC 报告的被违反性质恰好是配置指定的那一条，并给出反例轨迹。
- 活性负控与探针只有一条 PROPERTY。TLC 的时序违反报告不写性质名，所以按该配置判读：须报告 `Temporal properties were violated.` 并给出反例。
- 超时、解析失败、求值错误与未执行都不算通过。非零退出本身不算负控通过。

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

- 当前内容：收尾协议模型的源文件、配置、运行脚本与导出轨迹；五个旧模型的登记。
- 收尾协议模型的状态：在 [formal-runs.md](../formal-runs.md) 所列规模上限内，正控通过，每条性质的负控命中该性质。这不是证明，也不表示实现符合模型。两份内存 Journal 的回放结果见同一页。
- 旧模型的来源与状态：源文件与结果文件不在本包，迁入前只是登记。已登记，未重跑，未验证，不能作为验证证据。
- 证据缺口：作者协议的回放协议，即唯一提交点加幂等认回，尚无行为模型。扩展调用先提交已请求、调用后提交结论、结果未知时以 `replay` 重调、能力按经过身份加操作序号认回原操作，这条链的“已有最终结论的调用不再调用”“认回不重复计费”与“比对不一致后锁存”都只由 SPEC 与作者协议页陈述，场景推演见[持续验证场景](../scenarios.md#扩展调用的接续)。本页不宣称它已验证。补模型时按上表的格式登记性质、前提、未覆盖和负控变体。
- 负责人：本包的维护者。迁入前的缺口是源文件、运行结果与检查器版本三项。
