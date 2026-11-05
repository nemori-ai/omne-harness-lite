# 固定请求恢复与压缩结局：性质、模型与实现的对应

本页说明 [FixedReplay.tla](models/replay/FixedReplay.tla) 与 [CompactionFit.tla](models/compaction/CompactionFit.tla) 守住哪些性质，模型的变量和动作对应哪些源码，以及每条性质的机读守卫。运行记录见 [formal-runs.md](formal-runs.md)，无界推广见 [proofs](proofs/README.md)。

模型检查只说明有限范围内的设计性质。它不证明源码精化。

## 结论：固定请求不可重放，恢复靠摘要比较与作废换身份（R2-D306）

「用同一组固定依据重新准备，得到同一份请求」不成立。请求内容是稳定读取材料的纯函数（RQ-01），但材料是现读的。固定依据只记录修订与摘要，不能按修订重读。TLC 在五种环境下各找到一个反例：

| 反例配置 | 变化的输入 | 说明 |
| --- | --- | --- |
| `refute-window-usage` | 第六层的 `context.window-usage` | 它取自已采用事实（RQ-14）。M0 把已采用事实改成这次请求本身，所以 M0 之后重新准备时第六层必然不同。这一条与环境无关 |
| `refute-clock` | 第六层的其他逐请求块 | 例如时钟，每次现读 |
| `refute-adapter-memory` | 第四层的快照锚点 | runtime context 读取适配器的「最近一次完整读取」只在内存。崩溃后只能完整读取，锚点移到当前历史尾 |
| `refute-live-groups` | 第四至第七组的来源修订 | M0 与恢复之间可以变化 |
| `refute-new-input` | 第二组的历史上界 | 新输入在这期间保存 |

另外，计量结论不进令牌（RQ-13）。同一内容重新计量可能得到 `needs-compaction`，这时没有候选。守卫 G1 确认结局可以不同而内容相同。

可重放只在五个环境开关全关时成立（`replay-ideal`）。这不是生产环境。

成立的是较弱的恢复协议，由 `design` 配置检查：

1. 恢复时先查 Model。Model 已持有原身份的请求，就不再准备。
2. 检查答 unknown，保持原身份等待，不重发。
3. 权威答 not-accepted，重新准备，比较新内容的摘要与固定记录里的 `coverage.budget.inputDigest`。相等才沿原身份重新受理。
4. 不等就作废这个 attempt，以 attempt+1 重新准备。已采用事实不取被作废的 attempt。

比较必须用 `coverage.budget.inputDigest`。它是 Model 计量给出的完整输入摘要。`fixed.digest` 只摘要候选身份与可固定标记，不绑定内容。来源修订也不够：`bad-compare-tokens` 给出只比修订时第六层变化漏过的反例。

这条协议的实施归 agent 的恢复路径与 session 的已采用视图，不归本成员。本成员提供的是内容与摘要的纯派生，由守卫 G1 至 G3 守住。

## 性质表

| 编号 | 性质 | 出处 | 违背后果 | 原来靠什么守 | 现在怎么守 |
| --- | --- | --- | --- | --- | --- |
| FR-1 | 同一组固定依据重新准备，得到同一请求 | RQ-01、RQ-14 | — | 无 | 不成立。五个反驳配置，见上节 |
| FR-2 | 原身份只在内容摘要相等时重新受理；否则等权威 not-accepted，作废后换 attempt+1 | RQ-14；model-contract 同身份异输入答 conflict | Model 持有的请求与固定记录不符；或身份冲突后卡死 | 无 | `SentMatchesRecord`、`NoConflict`、`Progress`、`AttemptsSuffice`；守卫 G1–G3 守本成员的前提 |
| FR-3 | 已采用事实不取被作废的 attempt | RQ-14「读取时点」 | 下一次准备把从未发出的请求当作上一次已采用 | 无 | `AdoptedNotVoided`；守卫在 session，见 [formal-runs.md](formal-runs.md#迁移) |
| CF-1 | 压缩只追加记录，不改原历史 | RQ-06 | 原历史丢失 | message 与本包用例 | `AppendOnly` |
| CF-2 | 保留名单与未结工作在压缩后的视图里；调用与结果不拆开 | RQ-06「保留名单」「未结工作」「配对」 | 丢失未完成的工作，或看到孤立结果 | 用例与 `judgeCompaction` | `RetainedVisible`、`OpenVisible`、`NoOrphanResult`、`RetainBounded` |
| CF-3 | 压缩后视图有界，与已覆盖前缀长度无关 | RQ-06「增量判断窗口」；RQ-10 | 请求随会话增长无界 | 无 | `ViewBounded`；[证明](proofs/README.md#cf-3-压缩后视图有界) |
| CF-4 | 结局封闭且可见：装不下就是 `cannot-fit` 或 `needs-compaction`，不静默截断；至多一次压缩计划；步数有界 | RQ-02 结果表、RQ-05、RQ-06、RQ-07 | 静默截断；压缩热环 | 用例 | `NoSilentTruncation`、`FixableFits`、`AtMostOnePlan`、`Terminates`；守卫 G4、G5 |
| CF-5 | 提交的压缩之后请求装得下：摘要后检查与装入裁定同一口径 | RQ-06「装得下的口径」（R2-D316） | 压缩成功后 `resume` 仍判装不下，工作失败 | 无 | `CompactionKeepsWork`；回归正控 `regression-trigger-gap`，负控 `bad-post-hard-only`；`tests/trigger-fit.spec.ts` |
| RA-1 | 每份 Model 组装输入取 `profile.definition.representation` | RQ-05 | 家族在 `rules.plan` 拒绝 | 用例 | `RepresentationAdopted`；守卫 G6 |
| RA-2 | 回退档案有不同家族的供应商时，同一表示会被另一家族拒绝 | RQ-05 | 整个准备不可用 | 无 | 已知限制，只建模（`limit-mixed-fallback`） |

## FixedReplay 与源码

| 模型 | 源码 |
| --- | --- |
| `Prepare`、`ContentNow` | `src/assembly.ts` 的 `assembleInputs`；内容由 `src/assembly-layers.ts` 的 `assembledInput` 与 `src/placement.ts` 的 `placeContext` 派生 |
| `TailNow` | `placement.ts` 的 `tailOf`：第六层逐请求块，按键排序 |
| `AnchorNow`、`adapter` | runtime context 读取适配器的增量或完整读取。适配器状态只在内存 |
| `Fix` | agent 协调器的 M0 与 `src/fixed-request.ts` 的 `encodeFixedRequestRecord`。固定记录带 `coverage.budget.inputDigest` |
| `AdoptedAtt`、`voided` | 窄的已采用来源；session 的已采用分区。作废标记在 attempt 意图上 |
| `Admit`、`accepted`、`conflict` | Model 的受理：同身份同输入幂等，异输入 `conflict` |
| `RecoverFound`、`RecoverUnknown`、`RecoverNotAccepted` | agent 的恢复路径：查 Model、unknown 等待、not-accepted 后重新准备与比较 |
| `Crash` | 进程崩溃：进程内请求与适配器内存丢失，固定记录保留 |

模型的内容是元组，代表无碰撞的摘要。模型只有一个作用域、一步工作。

## CompactionFit 与源码

| 模型 | 源码 |
| --- | --- |
| `w`、`open`、`callOf` | 历史条目的权重、未结工作下界、结果所属的调用 |
| `log`、`Comps`、`ViewSet` | message 的历史日志与压缩记录；视图从最后一条压缩记录起算 |
| `Judge` | `src/budget.ts` 的 `judgeBudget` 与 `src/assembly-outcome.ts` 的 `assemblyOutcome` |
| `SysW` | 压缩依据里冻结的请求框架 `frame`：第一层系统提示词、第二层工具、第四层与第六层提醒消息（`src/plan.ts` 的 `frameOf`） |
| `Fits`、`T`、`L` | 触发线（百分比线与余量的较小者）与硬上限 |
| `Step`、`PostW`、`PostFits` | `src/compaction-step.ts` 的 `deriveFrom`：摘要后检查，整请求（请求框架、保留项、摘要、其后条目）对硬限额与触发线，判定用 `src/budget.ts` 的 `overTrigger`，与 `judgeBudget` 同一口径（R2-D316）。`PostCheckPartial` 为 TRUE 是恢复旧检查的负控 |
| `Legal` | `src/plan.ts` 的 `acceptDraft` 与 message 的 `judgeCompaction` |
| `Commit` | 压缩记录追加后 resume 重判 |
| `Build`、`Rep` | `src/model-input.ts` 的 `buildModelInput` |
| `plans`、`steps`、`B` | 一次准备的计划次数与步数上界 |

权重代表令牌数。系统提示词、工具与第四、第六层合成一个权重 `SysW`。

## 机读守卫

全部在 `tests/formal-guards.spec.ts`。生成器是带种子的 mulberry32，每条 48 至 192 个用例。

| 守卫 | 守的性质 | 会在什么缺陷下变红 | 变异负控 |
| --- | --- | --- | --- |
| G1 | FR-2 的前提：等材料得等内容 | 内容依赖计量结论、调用次序或逐请求块的列出次序 | 去掉 `tailOf` 的排序 |
| G2 | FR-2：内容一变 `inputDigest` 就变 | 有一层在计量之后才装入 | 计量时去掉最后一条消息 |
| G3 | FR-1 反例的代码版：`window-usage` 变化使内容与摘要都变 | 第六层不进入被计量的输入 | 同 G2 |
| G4 | CF-4：`judgeBudget` 不放过超限或超触发线的请求 | 判定放过超限，或丢掉估算余量 | 上限加一；去掉余量 |
| G5 | CF-4：装不下时不交出截短的候选，至多一次计划 | 截短历史后交出候选；进入第二次计划 | 去掉「已进入压缩」的判断 |
| G6 | RA-1：四类候选都取档案的表示 | 任一候选取别的表示 | 表示换成另一个名字 |

变异负控的结果见 [formal-runs.md](formal-runs.md#守卫的变异负控)。

## 未覆盖

- FR-2 的协议在 agent 与 session 实施。本成员的守卫只守内容与摘要的纯派生。
- 多作用域、多步、并发准备没有建模。
- 计量的数值算法没有建模，只用权重。
