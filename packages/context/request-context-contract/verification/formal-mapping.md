# 固定请求恢复、压缩结局与计量会话：性质、模型与实现的对应

[FixedReplay.tla](models/replay/FixedReplay.tla)、[CompactionFit.tla](models/compaction/CompactionFit.tla) 与 [MeasurementSession.tla](models/measurement-session/MeasurementSession.tla) 守的性质、模型与源码的对应、机读守卫与每份配置的用途。规则本身归[包组规格](../../SPEC.md#应然设计)，手写证明在 [proofs](proofs/replay-and-compaction.md) 与 [计量会话的安全证明](proofs/measurement-session.md)。每份配置的预期结论在各模型目录的 `expect.txt`：`pass` 或应被违反的性质名。模型检查只说明有限范围内的设计性质，不证明源码精化。

## 固定请求不可重放

「用同一组固定依据重新准备，得到同一份请求」不成立。请求内容是稳定材料的纯函数，但材料是现读的；固定依据只记修订与摘要，不能按修订重读。下面五种环境变化各给出一个反例：第六层的窗口占用块（它取自已采用事实，固定之后必然变化）、第六层的其他逐请求块、第四层的快照锚点（读取适配器的最近一次完整读取只在内存）、第四至第七组的来源修订、第二组的新输入。另外计量结论不进令牌，同一内容重新计量可能得到需要压缩。

成立的是较弱的恢复协议：恢复时先查 Model，已持有原身份的请求就不再准备；答未知则保持原身份等待，不重发；权威答未受理则重新准备，比较新内容的完整输入摘要（`coverage.budget.inputDigest`）与固定记录里的摘要，相等才沿原身份重新受理；不等就作废这个尝试，换下一个身份重新准备，已采用事实不取被作废的尝试。比较必须用完整输入摘要，只比来源修订会漏过第六层的变化。协议的实施归 Agent 的恢复路径与 Session 的已采用视图；本成员提供内容与摘要的纯派生，由守卫 G1 至 G3 守住。

## 性质表

| 编号 | 性质                                                                             | 规格不变式   | 模型里的性质                                                                                                  | 机读守卫                       |
| ---- | -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR-1 | 同一组固定依据重新准备得到同一请求                                               | 不成立       | `ReplayEqual`，只在五个环境开关全关时成立                                                                     | G3 是窗口占用反例的代码版      |
| FR-2 | 原身份只在内容摘要相等时重新受理；否则等权威未受理，作废后换身份                 | CX-36        | `SentMatchesRecord`、`NoConflict`、`Progress`、`AttemptsSuffice`                                              | G1–G3 守本成员的前提           |
| FR-3 | 已采用事实不取被作废的尝试                                                       | CX-36        | `AdoptedNotVoided`                                                                                            | Session 已采用视图的用例       |
| CF-1 | 压缩只追加记录，不改原历史                                                       | CX-31        | `AppendOnly`                                                                                                  | 压缩记录判定的用例             |
| CF-2 | 保留名单与未结工作在压缩后的视图里；调用与结果不拆开；保留不超预算               | CX-32        | `RetainedVisible`、`OpenVisible`、`NoOrphanResult`、`RetainBounded`                                           | `judgeCompaction` 与计划的用例 |
| CF-3 | 压缩后视图有界，与已覆盖前缀长度无关                                             | CX-33        | `ViewBounded`                                                                                                 | 手写证明                       |
| CF-4 | 结局封闭可见：装不下就是装不下或需要压缩，不静默截断；至多一次压缩计划；步数有界 | CX-29、CX-30 | `NoSilentTruncation`、`FixableFits`、`AtMostOnePlan`、`Terminates`                                            | G4、G5                         |
| CF-5 | 提交的压缩之后请求装得下：摘要后检查与装入裁定同一口径                           | CX-34        | `CompactionKeepsWork`                                                                                         | `trigger-fit.spec.ts`          |
| RA-1 | 每份 Model 组装输入取档案固定的请求表示                                          | CX-37        | `RepresentationAdopted`                                                                                       | G6                             |
| RA-2 | 回退档案有不同家族的供应商时，同一表示会被另一家族拒绝                           | 已知限制     | `NoRepRefusal`（只演示）                                                                                      | 无                             |
| MS   | 计量会话：探测快照、完整键、容量、忙租约不释放、关闭等全部结算、清理失败不报成功 | CX-38        | `ExactKey`、`ProbeSnapshot`、`Bounded`、`BusyNotReleased`、`SharedAcquire`、`ClosedDrained`、`FailureVisible` | `measurement-session*.spec.ts` |

## FixedReplay 与源码

| 模型                                                   | 源码                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `Prepare`、`ContentNow`                                | `src/assembly.ts` 的 `assembleInputs`；内容由 `src/assembly-layers.ts` 与 `src/placement.ts` 的 `placeContext` 派生 |
| `TailNow`                                              | `placement.ts` 的 `tailOf`：第六层逐请求块，按键排序                                                                |
| `AnchorNow`、`adapter`                                 | runtime context 读取适配器的增量或完整读取；适配器状态只在内存                                                      |
| `Fix`                                                  | 协调者固定请求，与 `src/fixed-request.ts` 的 `encodeFixedRequestRecord`                                             |
| `AdoptedAtt`、`voided`                                 | 窄采用来源与 Session 的已采用视图；作废标记在尝试上                                                                 |
| `Admit`、`accepted`、`conflict`                        | Model 的受理：同身份同输入幂等，异输入冲突                                                                          |
| `RecoverFound`、`RecoverUnknown`、`RecoverNotAccepted` | Agent 的恢复路径                                                                                                    |
| `Crash`                                                | 进程崩溃：进程内请求与适配器内存丢失，固定记录保留                                                                  |

模型的内容是元组，代表无碰撞的摘要。模型只有一个作用域、一步工作。

## CompactionFit 与源码

| 模型                        | 源码                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `w`、`open`、`callOf`       | 历史条目的权重、未结工作下界、结果所属的调用                                                                                                     |
| `log`、`Comps`、`ViewSet`   | 历史日志与压缩记录；视图从最后一条压缩记录起算                                                                                                   |
| `Judge`                     | `src/budget.ts` 的 `judgeBudget` 与 `src/assembly-outcome.ts` 的 `assemblyOutcome`                                                               |
| `SysW`                      | 压缩依据里冻结的请求框架（`src/plan.ts` 的 `frameOf`）                                                                                           |
| `Fits`、`T`、`L`            | 触发线与硬上限                                                                                                                                   |
| `Step`、`PostW`、`PostFits` | `src/compaction-step.ts` 的 `deriveFrom`：摘要后整请求对硬限额与触发线，判定与 `judgeBudget` 同一口径；`PostCheckPartial` 为真是只比硬上限的负控 |
| `Legal`                     | `src/plan.ts` 的 `acceptDraft` 与压缩记录判定 `judgeCompaction`                                                                                  |
| `Commit`                    | 压缩记录追加后续接重判                                                                                                                           |
| `Build`、`Rep`              | `src/model-input.ts` 的 `buildModelInput`                                                                                                        |
| `plans`、`steps`、`B`       | 一次准备的计划次数与步数上界                                                                                                                     |

权重代表令牌数。系统提示词、工具与第四、第六层合成一个权重 `SysW`；模型没有覆盖续接时重给的完整快照比冻结框架更大的情形，续接按同一规则复核。

## MeasurementSession 与源码

| 模型事实或动作                         | `src/measurement-session.ts` 的对应                              | 保护的责任                                             |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| `Begin`、`snapKey`、`snapBody`         | `measure` 同步检查关闭与在途数，然后复制档案、来源声明与组装输入 | 在算键之前固定一次探测实际使用的值                     |
| `Pending` 与 `Bounded`                 | 在途集合与在途上限，任务登记与 `finally` 清除                    | 等待取得与一次性租约也占在途限额                       |
| `key`、`Existing`、`SharedAcquire`     | 由完整档案与来源声明的规范文本组成的键与条目表                   | 同键共享取得中的 Promise；不序列化主体                 |
| `Retained`、`Create`                   | 可复用容量、闲置与可复用标记                                     | 可复用项包括正在使用与正在取得的项；只淘汰没有使用者的 |
| `blockedBy`、`Acquire`、`ExactKey`     | 取得闭包先等旧条目释放，再调用准备资源的取得                     | 等待期间继续用同一次探测的快照，不重读调用方的引用     |
| `Users`、`Measure`                     | 使用计数的增减，`src/measurement.ts` 的 `measureWithLease`       | 每份拟定请求独立计划与计量，不缓存权限或预算           |
| `Finish`、`ReleaseDone`、`CleanupDone` | 退休与释放、条目的释放 Promise、使用的 `finally`                 | 非复用项最后一名使用者离开后才释放，释放失败被记录     |
| `Close`、`CloseRelease`、`CloseDone`   | 关闭先置关闭标记，再等全部在途调用，最后等全部条目释放           | 拒绝新探测，等已开始的调用与全部清理结算               |
| `FailureVisible`                       | 失败标记与最终结果的选择                                         | 清理失败不能把原成功作为最终成功返回                   |

源码只遍历当前条目表；模型把被淘汰项显式标为不登记、不可复用。这是表示映射，源码不需要给已移出的对象加状态字段。

## 机读守卫

G1 至 G6 在 `tests/formal-guards.spec.ts`，生成器是带种子的随机数。

| 守卫 | 守的性质                                        | 会在什么缺陷下变红                             |
| ---- | ----------------------------------------------- | ---------------------------------------------- |
| G1   | FR-2 的前提：等材料得等内容                     | 内容依赖计量结论、调用次序或逐请求块的列出次序 |
| G2   | FR-2：内容一变完整输入摘要就变                  | 有一层在计量之后才装入                         |
| G3   | FR-1 反例的代码版：窗口占用变化使内容与摘要都变 | 第六层不进入被计量的输入                       |
| G4   | CF-4：`judgeBudget` 不放过超限或超触发线的请求  | 判定放过超限，或丢掉估算余量                   |
| G5   | CF-4：装不下时不交出截短的请求，至多一次计划    | 截短历史后交出请求；进入第二次计划             |
| G6   | RA-1：四类拟定请求都取档案的表示                | 任一份取别的表示                               |

## 配置的用途

| 模型               | 配置                                                                                                                                                                               | 用途                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| FixedReplay        | `replay-ideal`                                                                                                                                                                     | 五个环境开关全关时可重放                                                                           |
| FixedReplay        | `design`、`design-wide`                                                                                                                                                            | 正控：全部环境开关打开、检查可答未知，恢复协议的性质成立                                           |
| FixedReplay        | `refute-window-usage`、`refute-clock`、`refute-adapter-memory`、`refute-live-groups`、`refute-new-input`                                                                           | 各用一种环境变化反驳 FR-1                                                                          |
| FixedReplay        | `bad-naive-readmit`、`bad-naive-unknown`、`bad-naive-progress`、`bad-compare-tokens`、`bad-keep-voided`                                                                            | 负控：未受理后原身份受理另一份内容；未知时重发；冲突后卡死；只比来源修订；已采用视图保留作废的尝试 |
| CompactionFit      | `design`、`design-wide`                                                                                                                                                            | 正控                                                                                               |
| CompactionFit      | `regression-trigger-gap`                                                                                                                                                           | 回归正控：系统提示词权重为零的旧反例数值，在整请求口径下装得下                                     |
| CompactionFit      | `bad-post-hard-only`                                                                                                                                                               | 负控：摘要后只比硬上限，压缩成功后续接仍判装不下                                                   |
| CompactionFit      | `bad-truncate`、`bad-replan`、`bad-rewrite`、`bad-ignore-open`、`bad-split-pairs`、`bad-retain-budget`、`bad-retain-view`、`bad-strategy-rep`、`bad-skip-resume`、`bad-retry-veto` | 负控：各违反一条点名性质；`bad-retry-veto` 是否决后重开同一步的热环                                |
| CompactionFit      | `limit-mixed-fallback`                                                                                                                                                             | RA-2 的演示，不是负控                                                                              |
| MeasurementSession | `positive`、`production-limits`                                                                                                                                                    | 正控：覆盖复用、共享取得、溢出、淘汰等待、失败与关闭；后者用生产的上限参数，但仍只有两个探测       |
| MeasurementSession | `bad-key-acquire`、`bad-live-measure`、`bad-busy-eviction`                                                                                                                         | 负控：键固定后又读外部键取租约；等待后读外部组装输入；淘汰有使用者的项                             |

## 未覆盖

- FR-2 的协议在 Agent 与 Session 实施；本成员的守卫只守内容与摘要的纯派生。
- 多作用域、多步、并发准备没有建模。计量的数值算法没有建模，只用权重。
- 计量会话模型不证明整个压缩算法、来源持久化、权限服务、Model 计量的正确性或源码精化。
