# @omne-harness-lite/model-request-runtime-local

公开退避类型和 retryDelay 归[纯定义拥有者](../../core/model-request-runtime/SPEC.md)。集成范围与保留差距见 [SPEC.md](SPEC.md)。

[English](README.md)

调用一次显式模型传输，把响应流装配为最终结果，提供取消、内容时限和异步首内容门。本包是实验性 ESM workspace 成员，尚未发布到 npm。

当前提供独立调用、纯政策函数、限定范围的耐久消费者、四项会话选择／查询操作，以及纯调用历史解释器。`createCallContainerPresence(store)` 从实际调用容器读取原执行世代，在观察回调期间保有容器。缺少容器只表示未知。行为见[实际存续读面](SPEC.md#实际调用容器的存续读面)。

`createModelRuntime` 已把 RT12 的十五个类型化方法组合在同一个进程内调用 owner 下。第十五操作 `acknowledgeCall`（S-96）为每次调用固定一条耐久确认，再经保留门释放该调用的模型副本；此后各读取入口、同键 `openCall` 认回与 `reconcile` 都回 S-97 已确认小视图，控制与新工作到达其终态拒绝（S-100）。ACK 后自带 `retainedResult` 的 `settleReply` 按 S-99 核验后，经一份暂存的写责任完成结算（S-99⑧，见下文「ACK 后的结算」）。属于 Run 的结算消费宿主显式提供的已授权 Run 历史读源；生产 Run 终结与恢复 owner 仍由宿主负责。`./cordis` 通过 Cordis 暴露由应用持有的组合。回复处分使用原锚定调用句柄；本地容器消失后，通过有归属的恢复作用域认回已完成的原完整批；有 Run 的条件恢复保留响应原 attempt，并在较新 attempt 中归账。对于已耐久记录「已出门」但缺响应的调用，不属于 Run 的对账可读取实际停止的原执行事实，或经宿主确认的冷恢复缺席，追补一条中断响应且不再发模型请求。只有中断意图、没有发出记录的调用由耐久终结记录收口。显式调用宿主和有界观察接线遵循 D103；共享端口和队列自身不能证明真实会话接收端已接入，须由宿主提供。装配义务见[当前服务设计](SPEC.md)、[D105 恢复映射](SPEC.md)及[恢复 owner 补充](SPEC.md)，采用和覆盖见[实现映射](SPEC.md)；属于 Run 的生产成功路径仍依赖宿主真实的 Run 终结来源与 owner。

下文 API 表中的公共操作类型和选择、重试、历史、响应构造函数从 `@omne-harness-lite/model-request-runtime` 导入；具体调用、协调、存储等工厂从本包导入。见[公共拥有者](../../core/model-request-runtime/README_ZH.md)。唯一 `MODEL_RUNTIME_SERVICE` 键从公共 `./cordis` 导入。

`ownOpenCallInput(input)` 在宿主准入前检查并复制请求自有 JSON，保留原 host 与 observer endpoint 引用。它不核验权限，不登记资源。行为见 [SPEC.md](SPEC.md)。

`validDispatchInput(input)` 复用 dispatch 入口的身份表示检查，不校验重试计划，不授予调用权限。行为见 [SPEC.md](SPEC.md)。

物理工厂拥有者另取得 `executionSource`，元数据查询不携原调用句柄或私有大内容。恢复用显式 capture/release；ACK 确认、实际停止且旧借用释放后解除模型侧副本。业务投影和 host 不取得它。完成装配自己的恢复责任后再显式调用 `executionSource.release()`；整体 close 必须已确认。见[来源生产](SPEC.md#实际执行来源的生产)。

## 公开接口

| 导出                                                                                      | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invokeModel(input)`                                                                      | 返回包含 `outcome`、`snapshot()`、`observedFacts()` 与 `abort()` 的句柄                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `classifyCause(facts, hasContent, table)`                                                 | 按显式状态码表分类来源，保留原始状态码                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `dispatchGuard(input)`                                                                    | 按显式调用、发出与档案事实同步判定一次重试计划                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DispatchGuardInput`、`DispatchGuardResult`、`DispatchGuardFact<T>`                       | 只读守卫输入、闭合答案与明确的已知／未知事实                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TransportAdapter`、`PlanInput`                                                           | 调用者持有的 plan/send/read 端口与显式请求输入                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `InvocationPolicy`、`ModelInvocationResult`                                               | 调度、脱敏、诊断政策与携带实际字符串发送时刻的未结算结果投影                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `createSessionModelSelection(input)`                                                      | 借用提供者的消费者：`legalTargets`、`selectModel`、`displayList`、`effectiveModel` 与操作收口                                                                                                                                                                                                                                                                                                                                                                                                     |
| `interpretCallHistory({ prefix, callId })`                                                | 从完整自有 SL3 前缀经当前 `mrr/3` codec 解释不属于 Run 或属于 Run 的原始调用记录；Run 终结事实另由授权来源提供                                                                                                                                                                                                                                                                                                                                                                                    |
| `projectCallState({ session, callId, history, local? })`                                  | 仅在耐久响应尚未覆盖时叠加进程自有 `open` 或 `reply_pending` 责任                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ModelRuntimeOperations`、`RuntimeConstruction` 及各操作输入／结果类型                    | 十五操作的显式服务契约与必需宿主端口（含必需的 `acknowledgementCleanup` 重试政策）；类型契约本身不安装可运行服务                                                                                                                                                                                                                                                                                                                                                                                  |
| `createCallContainerStore()`                                                              | 按会话和调用持有进程资源，以及有界、可取消的短 reservation                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ModelCallHost`、`ModelObserverRequest`、`SessionObserverAccess`                          | 原调用的显式生命周期，以及按 dispatch 授权的观察端口                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `createCallPreparationOwner(host)`                                                        | 异步准备前同步登记原调用；迟到资源直到实际收口仍有 owner                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `createModelObserverQueue(input)`                                                         | 每次 dispatch 快照优先的观察队列；按真实 UTF-8 字节和事件数双限，接纳不等于接收者完成                                                                                                                                                                                                                                                                                                                                                                                                             |
| `createRuntimeReads(construction)`                                                        | 六项选择与历史读取方法，以及负责借用提供者收口的 `close()`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `createServiceCalls(construction)`、`createServiceControl(construction)`                  | 面向共享 runtime 装配的独立调用与控制方法组合件                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `createServiceDispatch(construction)`                                                     | 使用固定档案、精确 transport lease、当前会话事实、耐久锚点及原调用句柄实现 dispatch／dispatchAgain                                                                                                                                                                                                                                                                                                                                                                                                |
| `createRuntimeSettleReply(input)`、`createRuntimeReconcile(input)`                        | 非持久化处分从 `callFacts` 读取不可变 ready 内容，经当前 `callAccess` 的 `settle` 准入，再由既有结算算法写最终响应；final 已提交后的重复处分只由该 final 判定：同处分以原状态认回，异处分答 `alreadyEnded`，不查阅任何值，也不写入。ACK 后经核验的调用方自持值通过暂存写责任结算；处分组件必需 ACK `custody` 与 `instance` 标识。对账保留原 scope，直到实际停止并从完整前缀认回；对账必需 runtime 的 ACK `custody`，已确认调用逐调用作答，给出 `settlementWork` 时收口本 runtime 不持有的写责任行 |
| `createSettlementWork(input)`                                                             | 基于结算协调器的一份 ACK 后写责任：每次追加前完整批已耐久在写责任行中，行经 ACK custody 退役；外部 persisted 写方同样可用                                                                                                                                                                                                                                                                                                                                                                         |
| `createServiceAcknowledge(construction, custody?)`、`createAcknowledgementCustody(input)` | 第十五操作，以及每个 runtime 一份的 custody：按显式 `acknowledgementCleanup` 政策与调度器先释放内存副本、再释放保留内容                                                                                                                                                                                                                                                                                                                                                                           |
| `createModelRuntime(construction)`                                                        | 十五方法共用一份调用 store、一份 ACK custody 与可重试收口 owner；无需 Cordis Context                                                                                                                                                                                                                                                                                                                                                                                                              |

`createModelRuntime` 还返回 `project(inputs, facts)`。受信装配交入固定主体的 `ModelRuntimeHostInputs` 和同一内容拥有者的借用 facts 视图。用 `createModelCallFacts(...).project(presence)` 固定视图的 presence reader。全部投影共用原执行与可重试整体 close；投影自身没有 `close`。端口保持稳定，各操作仍重核当前资格。行为见[固定主体与共享执行](SPEC.md#固定主体与共享执行)。纯工厂投影不表示正式 Service 已完成整改。 |

`createRuntimeReconcile(input)` 返回 `{ reconcile, close }`。事实或写入未决而返回 `unavailable` 时，组件保留原恢复作用域；下一次对账会先沿同一作用域认回，不为同会话另开一个恢复入口。`close()` 关闭新对账准入，停止有归属的任务，从原绑定读取完整前缀；仅在物理工作有确定结果后释放各作用域。收口不追加业务记录。若返回 `unavailable`，宿主须继续持有同一组件，在原任务或读取来源恢复后重试；`createModelRuntime` 已将此收口纳入自身的可重试收口。

独立调用的可选 `beforeSend` 是一次传输发送前的同步最终准入。只有字面值 `true` 继续；`false` 在发送前取消，抛错或非法返回保持不可用。锚定服务在这里提供当前停止／代际检查。`observedFacts()` 只在原执行的 reader 和门任务实际停止后读取；不可用不能改判为缺席。它保留的真实发送时刻、部分账和响应头可供恢复使用，而耐久的「已出门」「已开口」记录仍是结算权威。

服务通过 `RuntimeConstruction.diagnostic` 完整转交既有 `SettlementDiagnostic` 的租户、会话、调用、dispatch、响应、owner、policy 及争用计数；观察投递诊断在 `detail` 中保留类型化作用域、位置和缓冲计数，同时向类型化 collector 投影实际 offer/delivery/close 事实。诊断回调只作尽力投递，其失败不改变结算或观察投递的业务结果；应用应独立保留输出失败状态。collector 的存储及查询接口见下文；工程关联与内容边界见 RT9 S-63。

## Cordis 服务装配

`createModelRuntimeLocal()` 创建一代可信装配工厂。插件从具名宿主输入、执行支持、Storage、Clock 和 transport 构造私有调用池、内容及事实。配置显式提供作用域、内容、等待和 token margin 界限，不接收 `construct` 回调，不补政策默认值；受管行另需 `assemblyLifetime`。

Config 的四个精确字段（`tokenMargin.multiplier/reserveTokens`、`reservationWaitPolicy.maxWaitersPerCall/timeoutMs`）使用 JSON 数字词法字符串，例如 `"1.10000000000000000001"` 和 `"256"`。装配方用 `jsonNumberSource` 编码原 `JsonNumber`，提供者严检后恢复精确值，不经浮点转换。独立函数仍使用原 `JsonNumber` 输入。

公共服务键和十五操作归 `@omne-harness-lite/model-request-runtime/cordis`。普通方法通过原宿主桥及实际调用 fiber 捕获固定主体；投影共用同一物理运行时。调用贡献只停止其消费，实际停止后归还借用，不取消执行、不写 ACK。

工厂创建者持有 `ready`、`closeAdmission`、`close` 和 `owner()`。只有可信创建者取得原执行来源及事实借用面，普通服务结果和宿主 capture 不携这些能力。`closeAdmission()` 在原业务判断次序中的停止准入点同步拒绝新建、dispatch 和 dispatchAgain，保留已准入工作、读取、恢复及 ACK；实际 `close()` 才排空并释放资源。资源尚未收场时 `close()` 返回 `unavailable` 或拒绝，须重试同一 owner。受管关闭控制保有原依赖直到确认关闭；同一 factory 不能挂载两次，原行未闭合不能启动后继池。

模型示例已删除，不再作为消费者入口。纯 `createModelRuntime(construction)` 仍可独立使用。

已导出的 `createCallContainerStore().waitReserve(...)` 要求显式的正数等待者上限和超时，以及有归属的调度器与取消信号。显式 `OpenCallInput.host` 是生命周期 owner，不是会话身份；会话、租户与日志代际仍来自已授权会话绑定。它的 `register(close)` 必须在停止后同步拒绝登记；准备 owner 在任何异步准备前登记，调用发布后仍保留同一关闭责任，实际释放后才 unregister。调用容器插入后，活跃 reservation 绑定原锚定调用句柄；释放短 reservation 不丢该句柄、待处分回复、观察绑定、未知写者或精确传输租约。系统停止先请求同一原调用的耐久 S-36 收口；`container.close()` 只有在该结果、原句柄、观察任务均实际释放且其余 owner 核查通过后才释放租约。reservation 本身不产生耐久授权。锚定调用的 `close()` 返回 `unavailable` 时仍保留原协调器与借用引用；原工作实际停止且结算事实可读取后，可再次调用 `close()`。并发关闭共用同一次尝试，已释放后的关闭幂等。

可选的 `OpenCallInput.observer` 交入真实 endpoint 和显式正数事件／字节上限。已授权的会话绑定必须为该 endpoint 与 call 提供 `observers.authorize`；每次 dispatch 在建立接收者及交付文本前重新核对具体目标。独立可用的队列接收原始 `ArrivalEvent` 和原装配快照。`start(snapshot)` 先交付该可见快照，丢掉位置不晚于它的发前暂存增量，然后按序交付更新增量。两个上限均包含在途接收任务，直到它的 `stopped` promise 完成。慢速或失败的观察者不改变模型响应，也不引起重新发出；实际停止未知时 `close()` 保留接收端 owner。宿主须保留不可用的 owner，在真实停止后重试。见 [D103 的归属与接收映射](SPEC.md)。

```ts
import {
  createModelObserverQueue,
  type ModelObserverQueueInput,
} from '@omne-harness-lite/model-request-runtime-local'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'

export async function beginObservedDispatch(
  input: ModelObserverQueueInput,
  visible: AssemblySnapshot,
) {
  const queue = createModelObserverQueue(input)
  const first = queue.start(visible)
  // 即使快照被拒收，也要留住队列：实际停止前 close 可能返回 unavailable。
  return { first, queue }
}
```

直接使用时，宿主给出完整绑定的 `RuntimeConstruction`，一份 call store 只交给一个 runtime，并在仍持有提供者资源时留住返回的 owner。`close()` 同步关闭新服务准入，请求全部调用和组件停止，等待已登记操作；仅在它们实际收口后返回 `released`。返回 `unavailable` 时继续持有同一个 owner，阻断事实消除后重试。call store 不清除耐久历史。

```ts
import { createModelRuntime } from '@omne-harness-lite/model-request-runtime-local'
import type { SessionRef } from '@omne-harness-lite/messages'

export async function inspectWithRuntime(
  construction: Parameters<typeof createModelRuntime>[0],
  session: SessionRef,
  retain: (owner: ReturnType<typeof createModelRuntime>) => void,
) {
  const runtime = createModelRuntime(construction)
  try {
    return await runtime.service.effectiveModel({ session })
  } finally {
    const stopped = await runtime.close()
    if ('unavailable' in stopped) retain(runtime)
  }
}
```

`readAttempts`、`dispatch` 和 `dispatchAgain` 为需要运行失败扩展的调用方提供显式 `{ consumeFailure: true }` 重载，返回 `{ result, consumption }`。普通单参数调用仍只返回业务结果，不持有失败作用域。`consumption.kind === 'failure'` 给出不可序列化的 `ModelFailureSource`，来源就是产出失败结果的同一次授权完整前缀读取。来源会核对该前缀中的原 dispatched 条目壳和失败响应。交给 runner 前，须同时核验精确主体与**该次 runner 的实际 execution**，并始终释放借用。核验只检查自有快照、当前准入和代际，不另读更新的日志尾；无关追加不会使其失效，释放、撤权、宿主停止或代际替换则会。

```ts
import type { CallKey } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelFailureExecution,
  ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'

export async function inspectFailure(
  service: ModelRuntimeOperations,
  key: CallKey,
  execution: ModelFailureExecution,
) {
  const answer = await service.readAttempts(key, { consumeFailure: true })
  if (answer.consumption.kind !== 'failure') return answer.result
  const source = answer.consumption.source
  try {
    return source.verify(source.subject, execution)
  } finally {
    source.release()
  }
}
```

宿主应从同一次 `runPass` 实际使用的 `RunnerPass.execution` 得到上述 `execution`，并核对来源与 runner 的会话、租户和日志代际。来源对 noRun 失败或另一 Run 返回 `invalidInput`；同一 Run 的后续 attempt 可以继续。这里仅校当前 attempt 的合法形状，其准入及栅栏由 runner 和日志负责。主体中按序保留的 retry 结论必须取自同一原调用的授权前缀；runner 历史不可读时返回 `unavailable`，不能补造空数组。宿主在 `runPass` 外层 `finally` 再释放一次，重复释放无害。采用依据见 [runtime v17 映射](SPEC.md)及 [v18 经过绑定](SPEC.md)。

服务宿主分别提供 `call()`、`response()` 和 `message()` 身份来源。回复的 `MessageId` 在那次发送时由 `message()` 产生，不复用 `ResponseId`，也不交由适配器自定。

每次新规划都要求宿主或直接调用者完整给出 `tokenMargin: { multiplier, reserveTokens }`；运行时为该计划捕获它，不补默认值。适用档案上限或上游输入限制事实缺失时，以 `input_limit_missing` 拒绝，不写新锚点、不发 HTTP。估算超门拒绝保留 `basis: 'estimated'`、`estimatedTokens`、`admissionTokens` 和 `limit`；准确超限保留 `basis: 'exact'`、`actual` 和 `limit`。估算值不是上游实际 usage 或费用。采用依据见 [RT8 输入上限契约](../../core/model-request-runtime/SPEC.md)及 [runtime v9 映射](SPEC.md)。

读面组合件在 `close()` 真正释放之前持有借用的选择提供者。由宿主显式传入 `RuntimeConstruction`，其中包含同会话的授权绑定与必需政策。
未知选模写入的回执仍是未知业务结果。原写者及回调实际停止后，组件可以释放其物理登记；它不会重放写入，也不会从当前 route 猜测成功。并发收口共享在途尝试，仅缓存 `released`。

```ts
import { createRuntimeReads } from '@omne-harness-lite/model-request-runtime-local'
import type { SessionRef } from '@omne-harness-lite/messages'

export async function inspectEffectiveModel(
  construction: Parameters<typeof createRuntimeReads>[0],
  session: SessionRef,
) {
  const reads = createRuntimeReads(construction)
  const result = await reads.methods.effectiveModel({ session })
  const closed = await reads.close()
  // close 不可用时继续持有 reads 及其借用提供者，待实际停止后重试。
  return { result, closed, reads }
}
```

## 读取调用，不把本地状态当作耐久事实

先由已认证的会话日志绑定与已登记读取任务经 `readSettlementPrefix` 取得 `prefix`。它会拒绝缺号、租户或会话错误、提供者代际变化。解释器只读该完整前缀，不发送、不写入，也不猜 Run 终结。对不属于 Run 的调用，完整响应批得出的耐久终态优先于旧的本地 `reply_pending` 责任。调用方在凭缺席决定重新发出前，仍须处理未停止的旧写者。

```ts
import {
  interpretCallHistory,
  projectCallState,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'

export function readNoRunCall(prefix: SettlementPrefix, session: SessionRef, callId: string) {
  const history = interpretCallHistory({ prefix, callId })
  return projectCallState({ session, callId, history })
}
```

返回的 `CallHistoryDispatch` 保留原「已出门」条目、「已开口」锚点、已确认的 ready 标记、经验证的完整原响应值及其投影。已确认 ready 而尚无 final 的发出在历史层记为 `reply_pending`，因为收场结果在不可变内容行里；按 RT11/RT12 S-86，它就是 complete 或 interrupted 且 `disposition_pending`。因此 `readAttempts` 读取该内容行，回终态，并在该次发出上带 `result: { disposition: 'disposition_pending', pending }` 完整原结果；runtime 收口无需 final 即可释放；`releaseCall` 回 `alreadyEnded`。只有进程内尚未确认发布的回复仍是 `reply_pending`。`in_flight`、`speaking` 只描述耐久事实前沿，不证明旧网络请求或写者已实际停止。只有中断意图、没有发出记录时，历史保留 `phase: null` 供对账，状态投影在收场未明前返回 `unavailable`。未知模型日志格式也返回 `unavailable`，不冒充缺席。完整前缀中的 Run 原锚与已提交响应可以读取。新建属于 Run 的结算还必须核同前缀 MS6 尝试事实和宿主授权的 G28 终结来源；未知返回 `run_history_unavailable`。

MS8 `model_call_acknowledged` 记录使用独立的按调用稳定日志键；只有本前缀核实其创建键与条目壳、每项可释放载荷都属于该调用（仅当调用不拥有任何载荷时才允许空列表）、目标确为该调用真实终结记录或最后一次终结响应后，才以 `known.acknowledged`（`{ record, entry }`）暴露。仅有 ready 标记时还须带原账见证；若 final 先于 ACK 胜出，解释器把该 final 与见证逐项比较 outcome、initiator、usage、cost、provider、凭据范围与时序。创建与保留结果摘要需要内容，解释器不核。缺少或矛盾的终态来源、或出现不同值的第二条 ACK，返回原因 `history` 的 `unavailable`。`projectCallState` 仍拒绝已确认历史；服务消费者对控制与新工作使用 `acknowledgedAsTerminal`，对读取使用 S-97 小视图，不当作缺席，也不从缓存再给全文。日志只按键去重，`acknowledgeCall` 只从整值读回的耐久值认回自己的批。见 [runtime v22 映射](SPEC.md)。

响应 usage 校准遵循 D107 采用决定及 [runtime v16 映射](SPEC.md)。

## ACK 的确认、撤回与释放

以下规则保证 ACK 不删除无法证明可删的内容，已释放的副本也不会回来（RT12 S-96⑧、S-97、S-98、S-86、S-101；MS8 S-58）：

- **对照原字节核验。**首次确认固定 ACK 记录之前，内容存储用核心语义摘要从保留行重算创建摘要与保留结果摘要。不一致即 ACK 与保留原件矛盾：不确认，也不删除；所有读取该调用的入口（`acknowledgeCall`、读取、`reconcile`）都答 `unavailable`，不给小视图。
- **回执未知时重发或认回，不重建。**ACK 追加的回执未知且日志中没有 ACK 时，重试从 `retiring` 保留行取出已固定的批，只重发该批，或在整值读回后认回。某批已证明零写（`tailChanged` 或 `alreadyRecorded` 碰撞）、其写者已停止、完整前缀中没有 ACK、且争用策略决定停止时，撤回这次准备。调用回到 `retained`，内容重新可读；前提是已固定的批仍等于本记录。本次答复 `unavailable`，之后的 ACK 重新准备。
- **已释放的身份保持已释放。**释放事务在删除每一行之前，把该行的 locator 与 version 记入 `model_call_content_tombstone`。之后无论哪个调用以已记墓碑的身份 `put`，都按 malformed 拒绝。这是逐个已释放身份的记录，不是分配计数器。同一调用内重发的既有拒绝不变。
- **回执未知的 ready 不会被关成另一个 final。**系统停止或运行时关闭遇到 `reply_pending` 的调用时，先读完整前缀。只有该响应存在耐久 ready（或其后的终态事实）时，才让原调用以 ready 收尾；否则答 `unavailable` 并保留责任。ACK 清理从不在 `reply_pending` 上发布 `ready`，因此不会触发锚定句柄的无回复中断（`close()` → `settleCandidate(null, true)`）；调用容器的关闭也不会在 `reply_pending` 上调用该 `close()`——停止留下的相位决定走哪条路。同一条关闭路径上的另一种调用，是「已开口」锚点确认之后、尚未接受任何内容之前被宿主停止的真实在途调用：它的写者证据齐全（锚点回执已知、流由本进程停止），因此按 S-86 以无回复的 `interrupted` final 收口，`dispatch` 与 `close` 都有答复，不把调用永久隔离。只有锚点确认后所有者准入关闭或结算代际变化，才让收场对本写者保持未知。
- **优雅停止遇到仍在途的「已开口」追加时等它，不隔离它。**停止可能在这样的时刻到达锚定所有者：opened 追加已交给日志、回执还没回来、而调用本身已经先收尾。此时所有者等该追加自己的回执（以追加本身结束为界，不另设计时器），再按回执收口。回执落盘：与「已确认后停止」同路——S-86 无回复的 `interrupted` final、`dispatch` 答 settled、容器退役、`runtime.close` 释放、冷进程读到 `interrupted`。回执证明未写入（`tailChanged` 或明确拒绝）：这次调用没有开口，按未开口路径写无回复 final，不带 opened 锚点，也不带 `firstTokenAt`／`delivered`。回执未知（日志层读不回来）：答 `unavailable`、不写 final、保留责任，冷进程仍读到在途前沿。隔离只留给所有者准入关闭、结算代际过期和回执未知三种情况；上面的 `reply_pending` 处理与 ACK 生命周期不变。
- **句柄在释放后仍然有效。**ACK 清理可能释放调用容器。已有的等待句柄仍然有效，下一次等待答复 ACK 小视图；只有执行被替换才使它失效。消费者句柄只持有自己的监听桶，不持有容器；空闲句柄和已关闭的运行时都不会让已释放的容器保持可达。
- **先请求停止，再等待。**结算任务可以只在 `requestStop` 之后才证明实际停止。凡是等待自己拥有的任务之处（ACK 追加及其重试等待、锚定排空与发送前结束、会话选择、未知控制写的恢复）都调用 `requestStopAndWait`；后续步骤仍以 `stopped` 证明为门。

## ACK 后的结算

`acknowledgeCall` 释放模型副本后，没有 final 的调用仍可由自持完整 `PendingModelResponse` 的调用方处分（RT12 S-99）。`settleReply` 先核当前 `settle` 资格，再把该值与 ACK 的原身份、MS8 结果摘要和账见证逐项核对。缺值为 `wrongPhase`，矛盾为 `invalidInput`。日志里已有 final 时由它自行决定：同处分认回，异处分 `alreadyEnded`。

核验通过的值开始一份写责任（`createSettlementWork`）。每次追加可能生效之前，完整批先写入内容存储同一 Storage 中的私有 `model_call_settlement_work` 行。该行保存的是「最近一次尚未确知为零写的追加所用的完整批」。确证零写之后（`tailChanged`，或 `alreadyRecorded` 碰撞），重构 `late` 的批在其追加之前以下一代际原位替换。回执未知期间绝不覆盖该行。每次替换和删除都带该行的 `workId` 与代际，其他写责任或旧代际的迟到 worker 一律被拒。

写责任只在它的全部写方实际停止之后才收口：

- 已确认 final，或前缀中有完整批，即告完成并退役该行。若本组件仍持有同一调用的其他写方，退役要等它们实际停止。
- 权威完整前缀确证该批缺席，则结束本次写责任：退役该行并回 `unavailable`。之后由消费者持自持值重新申请，这会开始一份新的写责任；runtime 不替消费者重送。
- 回执未知、残批（S-70③）或来源不可读时保留该行，并回 `unavailable`。

删除失败或删除回执未知时，该行留作 ACK custody 的待办，由 ACK 清理同一个 `acknowledgementCleanup` 政策与结算调度器重试。只有读到行已不存在才算已删。本 runtime 不持有的行（例如崩溃后留下的行）不由 `settleReply` 收口，而由 `reconcile` 作为恢复 owner 收口；前提是宿主恢复作用域的 `originalInvocation` 报告原执行 `absent`（接缝 R4 默认路径）。ACK 清理保持 `released`，该行也不是重新领取结果的入口。

本节不覆盖：

- 不提供由恢复 owner 代重送的 S-71 显式选项。
- 启动时不扫描残留行；它们在下一次处分、对账或重试时收口。
- persisted 回复（`[M, R]`）由各自的授权写方调用 `createSettlementWork`；普通 `settleReply` 仍是非 persisted。

见 [runtime v22 映射](SPEC.md)（revision 3）及其投影的接缝。

## 调用显式传入的请求

传入完整 `PlanInput`（包含显式校准来源）、明确持有的类型化适配器、凭据与取消信号。本例只导入 runtime 公开包并使用实际流装配器，将它声明为直接依赖；适配器须配置相同的完整凭据政策。资源由调用者持有，在 outcome 与独立门任务实际停止后释放。不读环境凭据。

第一次请求没有前序观察时，明确声明这一事实，不编造历史 usage：

```ts
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'

export function firstRequest(input: Omit<PlanInput, 'calibration' | 'outputHistory'>): PlanInput {
  return { ...input, calibration: { kind: 'none', reason: 'no_observation' }, outputHistory: [] }
}
```

独立调用者如果持有经过授权的原响应，并知道下一次请求实际选入哪些块，可显式提供观察。`outputBlocks` 必须保留完整原输出组，实际选入的块由 `replaySelection` 指明，不能据此裁短原组。适配器仍会核对当前投影与计数依据；传入观察不强制进入增量模式。使用下列类型时，请将 `model-response` 和 `content-blocks` 声明为直接依赖：

```ts
import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import type { ModelResponse } from '@omne-harness-lite/model-response'
import type { PlanInput, ReplaySelection } from '@omne-harness-lite/model-request-runtime'

export function nextRequest(
  input: Omit<PlanInput, 'calibration' | 'outputHistory'>,
  original: ModelResponse,
  outputBlocks: readonly ContentBlock[],
  replaySelection: readonly ReplaySelection[],
): PlanInput {
  return {
    ...input,
    calibration: {
      kind: 'observation',
      inputCalibration: original.inputCalibration,
      usage: original.usage,
      outputBlocks,
      replaySelection,
    },
    outputHistory:
      original.inputCalibration.outputGroup.kind === 'known' && replaySelection.length > 0
        ? [
            {
              inputCalibration: original.inputCalibration,
              usage: original.usage,
              outputBlocks,
              replaySelection,
              origin: {
                adaptation: original.route.adaptation,
                provider: original.route.provider,
                parameters: original.route.parameters,
                ...(original.route.servingProvider === undefined
                  ? {}
                  : { servingProvider: original.route.servingProvider }),
                ...(original.route.upstreamModel === undefined
                  ? {}
                  : { upstreamModel: original.route.upstreamModel }),
              },
            },
          ]
        : [],
  }
}
```

`outputHistory` 始终显式提供，且与唯一输入锚独立。实际选入多个旧响应时，每份响应一组，按其首个目标块位置排序；每组保留原完整块、原 route/parameters 和选入目标映射。输入计数缺失或不可用，不会抹去已知输出组。没有原组事实的独立调用者保留实际消息并显式给 `[]`，全量计量仍须覆盖其 wire 内容。服务只从同一授权前缀和原完整响应批派生各组。详见 [runtime v19 交接](SPEC.md) 与 [transport v13 投影](../pi-ai-transport/SPEC.md)。

后续请求由同会话授权历史读者提供 `calibration`。来源目标包含本次调用和 dispatch；有 Run 时也带本次 Run 与 attempt，来源 owner 必须证明实际选入的分支和候选先后。runtime 核对选入消息来自同一份完整 SL3 前缀、原 dispatch 和完整响应的稳定身份与完整值，以及 assistant 回复确实进入本次模型输入。原调用属于 Run 时，响应顶层 attempt 仍是发出时的原 attempt，即使完整 M/R 批在较新的 attempt 中归账；历史 Run 与当前 Run 不同也可能是合法选入，但仅同名绝不能证明祖先关系。同一调用重试时，连续的前序 dispatch 即使没有回复，也可以提供准确的输入观察，并须保持原调用 Run 一致。planner 再核本次前缀摘要、计数依据、重放输出组及实际新增输入；匹配才使用增量计量，否则全量计量。较新的响应缺失可用输入 usage 时，可选择更早的合法祖先。已提交的原完整批按原值读取，不因当前 Run 终结状态重新判废。读端检查原始值及相邻关系；物理同批保证归原结算 append 与 SL3。`source_unavailable` 与已证明的 `no_observation` 不同。

`TransportAdapter.read` 的每种终态，包括取消与失败，均须返回 `readFacts`。`invokeModel` 在实际停止后保留最终读取事实，不用输入估算覆盖真实 usage 或费用。固定的 `projectOutput` 适配器把实际保留的回复或已交付块映成输出组。相同的 `inputCalibration` 贯穿 Pending、原耐久响应与认回；冷恢复读取原事实，不再请求模型或重新分词。目前 runtime 可核验选入的 no-Run 回复与同一调用的前序 dispatch。跨调用且无关联选入消息的响应，以及缺少授权 Run owner 的 Run 历史，保持来源不可用，不从日志物理位置猜测。

```ts
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import {
  openRouterCredentialRedactionConfig,
  type PlanInput,
  type PlannedSemantics,
  type TransportAdapter,
  type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime'

export const callerPolicy: InvocationPolicy = {
  now: () => new Date().toISOString(),
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
  firstContentTimeoutMs: 60000,
  idleContentTimeoutMs: 60000,
  statusCauseTable: {
    '401': 'credential_unavailable',
    '429': 'upstream_unavailable',
    '503': 'upstream_unavailable',
  },
  credentialRedaction: openRouterCredentialRedactionConfig,
  diagnostic: event => {
    console.log(event.kind)
  },
}

export async function invokeOnce<P extends PlannedSemantics, R>(
  request: PlanInput,
  transport: TransportAdapter<P, R>,
  credential: string,
  signal: AbortSignal,
  beforeFirstContent?: () => Promise<void>,
) {
  const handle = invokeModel({
    ...request,
    transport,
    credential,
    signal,
    policy: callerPolicy,
    ...(beforeFirstContent ? { beforeFirstContent } : {}),
  })
  return await handle.outcome
}
```

实际 OpenRouter 适配器通过[传输包](../pi-ai-transport/README_ZH.md)传入已核实完整定义与自持网络政策。没有默认 pilot；officialModelIds 只列目标，教学数据不能配真实凭据使用。

示例时限与状态表由调用者选择。`credentialRedaction` 是必需的完整显式配置，在规划和发送前校验、绑定；缺失或非法配置返回 `invalidInput` 且不发送。旧任意 `redact` 回调已删除，没有兼容回退。模型、供应商、档案、参数和消息均来自传入请求。

异步工作开始前，调用固定自己持有的请求值及政策成员；借用函数和资源的寿命仍归调用者。使用动态适配引用时，交入 `lease.transport`，用 `lease.track(...)` 登记调用结果及独立的异步内容门/结算，等待它们实际停止后释放。

## 观察、内容门与取消

`handle.snapshot()` 读取已接受序列，不再次发送。可选 `onAccepted(event, snapshot)` 观察同一序列。交入 `beforeFirstContent` 后，内容在门成功前保持不可见；门失败会停止执行，返回本地失败且不交出私有块。没有交门时不具有耐久落盘保证。

调用 `handle.abort()` 或中止传入信号后，等待 `handle.outcome` 再释放资源。出网前取消返回 `{ cancelledBeforeSend: true }`，没有请求结果。已开始发送的调用收敛为 `complete`、`truncated`、`interrupted` 或 `failed`。首内容后失败保留已经交付的部分。usage、缓存零与未知、精确实报费用保真；上游缺身份时不从请求路由补造。

规划拒绝不产生模型响应。意外实现缺陷仍表现为被拒绝的 promise。结果没有会话、租户、ResponseId，也没有耐久入账或回复落盘含义。

## 不发送就判定一次重试计划

`dispatchGuard` 是同步纯函数。调用者交入合法取得的当前调用事实、跨所有尝试的完整开口历史、最近失败、原完整档案快照和重试计划。`{ known: null }` 表示已知该调用不存在；`{ unknown: true }` 表示当前无法确定该事实。不能把本地过时阶段当作已知的当前权威。非法数据返回 `invalidInput`；当前守卫所需事实无法判定时返回 `unavailable`。

函数依次判调用存在、终态或 `reply_pending`、任何一次开口、阶段、失败类别和供应商限制。它使用快照中原有的有序供应商与 `allowFallback`，通过严格 JSON 复制接收输入，不调用 getter、不改入参、不跨调用持有调用状态。守卫没有 Cordis、存储、时钟、调度或网络操作。

下面的教学示例无需服务或凭据即可执行。使用精确 JSON 数时，把 `content-blocks` 与本包一起声明为直接依赖。

```ts
import { dispatchGuard, type DispatchGuardInput } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const input: DispatchGuardInput = {
  session: 'example-session',
  callId: 'example-call',
  call: {
    known: {
      session: 'example-session',
      callId: 'example-call',
      phase: { known: 'awaiting_decision' },
    },
  },
  dispatches: {
    known: {
      session: 'example-session',
      callId: 'example-call',
      opened: [{ known: false }],
    },
  },
  latestFailure: { known: 'upstream_unavailable' },
  snapshot: {
    known: {
      adaptation: {
        implementation: { name: 'teaching', revision: 'one' },
        definition: { modelId: 'teaching/model', revision: 'one' },
        configuration: { revision: 'one', values: {} },
      },
      providers: ['first', 'second'],
      allowFallback: true,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: new LosslessNumber('9007199254740993'),
      maxOutputTokens: 10,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: '2026-09-27T00:00:00Z',
    },
  },
  plan: { provider: 'second', after: 'PT9007199254740993.0000000001S' },
}
const answer = dispatchGuard(input)
if (!('allowed' in answer)) throw new Error('Expected this example retry plan to be allowed')
```

`after` 沿共享 ISO 时长字符串（`PT` 后的时／分／秒），不设数值上限、不转成毫秒。缺席表示不等，函数本身从不等待。答案是 `{ allowed: true }`、`{ refused: { why } }` 或 `{ rejected }`（`wrongPhase` 另带 `phase`）。拒绝原因恰为 `already_spoke`、`fact_class`、`provider_not_allowed`；错误恰为 `invalidInput`、`callNotFound`、`alreadyEnded`、`wrongPhase`、`unavailable`。允许只对应已交入事实，后续实际操作仍核当前状态、宿主停止与依赖。耐久 `canDispatchAgain`／`dispatchAgain` 服务在实际使用时重新核当前调用状态。

## 计算精确重试退避

`retryDelay` 是同步纯函数，实现 [公共纯函数规格](../../core/model-request-runtime/SPEC.md)，沿 D086 接受与 D076 R3-P7 投影、D087 保留范围采用。结果为 `{ ok: duration }` 或 `{ invalidInput: { reason: 'malformed' } }`。五个政策成员、正整数 `n` 和 `[0, 1)` 内的精确 `uniformSample` 均须显式给出，`none` 也不例外。decorrelated 另需 `previousDelay`；第一次重试须按时长值等于 `base`。函数不提供默认值或随机源。

```ts
import { retryDelay } from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

const delay = retryDelay({
  policy: { kind: 'exponential', base: 'PT10S', factor: 2, max: 'PT25S', jitter: 'half' },
  n: 3,
  uniformSample: new LosslessNumber('0.999'),
})
if ('invalidInput' in delay) throw new Error(delay.invalidInput.reason)
if (delay.ok !== 'PT24.9875S') throw new Error('unexpected exact delay')

const next = retryDelay({
  policy: { kind: 'constant', base: 'PT1M', factor: 1.5, max: 'PT2M', jitter: 'decorrelated' },
  n: 1,
  uniformSample: 0.25,
  previousDelay: 'PT60S',
})
if ('invalidInput' in next) throw new Error(next.invalidInput.reason)
if (next.ok !== 'PT67.5S') throw new Error('unexpected decorrelated delay')
console.log(delay.ok, next.ok)
```

构造 `LosslessNumber` 时将 content-blocks 声明为直接依赖。时长接受 TD3 的 H/M/S 字符串、小数秒及等值写法，输出采用精确秒。系数复用公开 `JsonNumber` 表示，可保留十进制字面量及超过 2^53 的重试序号。普通 JavaScript 数值按调用时已有的十进制值处理，函数无法恢复调用前已经丢失的精度。

函数复制并校验 JSON 数据、不读取 getter、不改调用者输入，也不取整到毫秒。算术结果不表示已经允许重试，不执行等待、发送、回退或默认重试贡献。实际定时精度和大时长调度仍受 R3-G7 约束。模型示例已删除，runner接线须由实际消费者验证；37 模型认证仍单独验收。

## 显式共享凭据脱敏

`createCredentialRedactionPolicy(config)` 构造 D093 采用的纯政策。三个具名参数缺一不可。`openRouterCredentialRedactionConfig` 是显式交入、深度不可变的 `openrouter-redaction/1` 基线：片段最小长度 8、已采用的 11 项头名单与 sk-/Bearer/Basic 三个有限描述。算法没有隐式配置、环境、网络、存储或 Cordis 依赖。

`policy.bind(knownCredential)` 返回 `{ ok: bound }` 或 `{ rejected: 'invalidInput' }`。冻结的闭包只公开 `text(value)`、`headers(value)`、`json(value)`，三个操作沿同一明确结果壳。已知凭据须为非空可打印 ASCII；完整凭据即使短于片段阈值也会保护。所有匹配均从原输入求区间并集，每段变为 `█`，不正规化、不猜未知编码、不执行开放正则。头先按原键的 ASCII 大小写折叠剥除名单项，再处理键和值；字符串／有序字符串数组的形状、重复与空值保留。JSON 处理键及全部 scalar token，包括精确数字、布尔和 null；命中的非字符串 scalar 整体变成标记字符串，未命中的类型与数字词法保持。输出独立且冻结，安全值再次处理在值意义上相等。 精确数字准入在模块初始化时捕获可信的公开 LosslessNumber source getter，显式读取品牌源后立即复制为标准自有数字；token 匹配在这份副本上调用 jsonNumberSource，调用者原型的 Get trap 不能替换该数字 token。

`redact(value, knownCredential, params)` 是独立 RT5 S60 JSON／字符串函数，复用同一内核。实际响应头应调用 `bound.headers`，它还会剥除名单项。精确数字示例需把本包和 content-blocks 声明为直接依赖；示例只处理合成数据，不发送请求。

```ts
import {
  createCredentialRedactionPolicy,
  openRouterCredentialRedactionConfig,
  redact,
} from '@omne-harness-lite/model-request-runtime'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'

const policy = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig)
const binding = policy.bind('teaching-secret')
if (!('ok' in binding)) throw new Error(binding.rejected)
const text = binding.ok.text('teaching-secret / Bearer example-token')
if (!('ok' in text) || text.ok !== '█ / █') throw new Error('Unexpected safe text')
const headers = binding.ok.headers({
  Authorization: 'discard',
  X: ['', 'teaching-secret', 'again', 'again'],
  Empty: [],
})
if (!('ok' in headers) || 'Authorization' in headers.ok || headers.ok.X?.length !== 4)
  throw new Error('Expected safe headers with their original array shape')
const rawError = redact(
  [true, null, new LosslessNumber('9007199254740993')],
  'true',
  openRouterCredentialRedactionConfig,
)
if (!('ok' in rawError) || writeJsonLossless(rawError.ok) !== '["█",null,9007199254740993]')
  throw new Error('Expected redacted boolean and unchanged exact number')
```

静态配置非法时抛固定文字、无输入或 cause 的 `CredentialRedactionConfigurationError`。凭据或数据准入非法返回 invalidInput，不调用 getter 或 toJSON。未预期内部处理缺陷抛固定文字、无输入的普通 Error，不伪报非法输入、不返回原文；这个异常表示缺陷，不是成功脱敏或新增领域失败。

通用构造接收最小长度 1～64、最多 128 个小写 ASCII HTTP-token 头名及最多 64 个有限描述，允许显式空名单。这不授予生产配置资格。已采用基线必须保留全部 11 项头与 3 个描述；生产加强配置可以增加项目或将阈值降低到 1～8，仍须单独核资源与误遮罩。大于 8 的值须另一个被接受的生产修订。未来装配 owner 负责核资格，并向两个消费者交入同一完整快照。

本构件处理 raw／error JSON。必需业务状态、身份和费用事实沿各自契约，不能把完整 ModelResponse 交给通用 mapper 改值。raw.body 字节／附件投影、transport/runtime policy 迁移、实际 send/read/头输出及完整 S20 验收尚待对应增量。现有 invoke/transport 回调保留原行为，直到明确的迁移完成。

设凭据长 k、输入长 n、最小片段 m、描述数 d；内核建立最多 k 个固定宽窗口及四个线性终点数组，每个位置最多比较 d 个长度不超过 64 的 literal。工作界为 O(km + n(m + 64d) + output)，以 Set 的精确字符串相等为判据，不以 hash 相同代相等；终点工作内存 O(n)，另有窗口／配置和输出数据。JSON 准入与投影使用迭代遍历，键碰撞后缀的工作包含所需输出键的大小。有限极端输入量测不证明无限输入或同进程沙箱，闭包也不承诺物理内存擦除。

## 从显式目录事实计算模型选择

`legalTargets(rows, allowed, projection, compatible)`、`displayList(rows, allowed, projection, compatible, selected, credentials)` 与 `effectiveModel(selected, lock, rows, allowed)` 是同步纯函数，落实 [RT5 S-10～S-12/S-60](../../core/model-request-runtime/SPEC.md)，复用目录公开的胜出规则。它们没有会话、授权、存储、Cordis 或 IO 端口。事实的当前性、完整性、合法取得及已经求得的会话之上层锁归调用方负责，函数不证明这些前提。

集合输入用无重复的只读数组表达，事实显式为 `{ known: value }` 或 `{ unknown: true }`。已知空投影合法；选中模型已知为 `null` 表示没有耐久初始选择，返回 `unavailable`。锁已知为 `null` 表示当前求值确认没有会话之上的锁，包括可选 model 项缺席；未知锁不能当作无锁。每行须为保留完整 adaptation 的 profile3，与 ref 匹配、同一格不重名，所有路由名共同属于同一组织／租户链。`compatible` 必须纯粹实现“投影 ⊆ 完整档案输入模态”，返回的 `ok` 或非空 `blocked` 集合会按该关系复核。这一显式调用方依赖不意味着已经实现或接入模态投影提供者。

下列教学数据无需凭据或服务即可验证三个操作。公开 import 所用的 runtime 与 model-profile-directory 须声明为直接依赖；它不是可发送的官方模型定义。

档案里的所有数字，包括深层适配配置与参数 extra，均在档案及胜出行判断之前复制。有限 JavaScript 数字和标准 `LosslessNumber` 保留边界上的精确值与数字拼写；普通子类继承可信公开 source getter 时同样支持。外来的 source accessor 或数据覆盖会返回 `invalidInput`，不调用它。数值捕获直接把可信 getter 应用于有真实私有品牌的接收者，再构造自有标准数字，调用者原型上的 Proxy `get` 不能替换数值。输入 getter 与 `toJSON` 均不调用。意外捕获缺陷抛固定普通错误 `model selection JSON capture failed`，不保留原异常或 cause。

```ts
import {
  legalTargets,
  displayList,
  effectiveModel,
  type SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'

const rows: readonly ProfileRow[] = [
  {
    ref: { origin: 'official', routeName: 'teaching/model' },
    profile: {
      routeName: 'teaching/model',
      origin: 'official',
      registration: 'listed',
      adaptation: {
        implementation: { name: 'teaching', revision: 'one' },
        definition: { modelId: 'teaching/model', revision: 'one' },
        configuration: { revision: 'one', values: {} },
      },
      providers: ['teaching-provider'],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 100,
      maxOutputTokens: 10,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      updatedAt: '2026-09-27T00:00:00Z',
    },
  },
]
const compatible: SelectionCompatibility = (profile, projection) => {
  const blocked = projection.filter(modality => !profile.inputModalities.includes(modality))
  return blocked.length === 0 ? { ok: true } : { blocked }
}
const allowed = { known: ['teaching/model'] }
const projection = { known: [] }
const selected = { known: 'teaching/model' }
const legal = legalTargets({ known: rows }, allowed, projection, compatible)
if (!('ok' in legal) || legal.ok[0] !== 'teaching/model') throw new Error('Expected a legal target')
const list = displayList({ known: rows }, allowed, projection, compatible, selected, {
  known: [{ ref: { origin: 'official', routeName: 'teaching/model' }, present: { known: false } }],
})
if (
  !('ok' in list) ||
  !list.ok[0]?.selected ||
  !list.ok[0].annotations.includes('credential_missing')
)
  throw new Error('Expected missing-credential annotation')
const effective = effectiveModel(selected, { known: 'teaching/model' }, { known: rows }, allowed)
if (!('ok' in effective) || effective.ok.selectedBy !== 'layer_lock')
  throw new Error('An equal-name lock keeps its source')
console.log(legal.ok[0], list.ok[0].annotations, effective.ok.selectedBy)
```

合法目标不因凭据缺失或据点传输能力而过滤。租户行撤回后在册的更一般行可以胜出；胜出行缺凭据或模态不符时不回退。没有胜出行时，落点先取最具体在册行，再取已撤回行。展示列表为合法名字加选中名字，每条附自有不可变 ref 与注记；被覆盖行只作注记，不能另选。没有胜出行只标恰一个 `withdrawn` 或 `scope_disallowed`，不问该行的凭据或模态。

成功为 `{ ok: value }`；非法或缺必需数据返回 `{ invalidInput: { reason } }`，必需事实明确未知或兼容回调意外抛错返回 `{ unavailable: true }`，不交出原异常或部分集合。选中／有效名字在链上查无行时返回 `{ profileNotFound: true }`。凭据有无按完整胜出 ref 与来源匹配：缺必需事实是 malformed，显式未知有无是 unavailable。结果自持且深度不可变；借用回调寿命仍归调用者。十五方法已组合；持久投影缓存不由本选择构件提供，当前读取的限定消费者见下文「会话模型的耐久选择」。

目标集成边界与责任选择见 [ADR](adr/service-lifetime.md)。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/model-request-runtime-local... run build
pnpm --filter @omne-harness-lite/model-request-runtime-local run typecheck
pnpm --filter @omne-harness-lite/model-request-runtime-local run test
```

第一条命令同时构建 workspace 依赖。配套传输测试用真实本地 HTTPS 和公开 core 装配器验证 `invokeModel`；本包 `tests/acceptance-*.spec.ts` 在真实 SQLite 内容存储与 SQL Session Log 上验证组合后的服务。这些本地测试都不认证真实模型路由；已记录的真实路由证据见 [realization 验证](SPEC.md)。

## 日志值的捕获、构造与认回

成员检查消费 D089 已采用 的 offer-expiry 公共根比较器：实际 `sentAt` 已知时核 `sentAt <= firstTokenAt <= endedAt`，首 token 缺席时核 `sentAt <= endedAt`。D105 下仅已锚定的 `interrupted` 响应允许 `sentAt: null`；首 token 与 ended 的比较、opened 原值相等仍须核对。null 表示实际发送时刻不可用，不证明零次发送或零费用。普通调用结果和待处分响应仍须有实际字符串时刻。静态非法日期与已知时刻逆序不能返回成员完整；任意小数、时区同点与 opened 原字符串均照原样保留。

公共定义包 `model-request-runtime` 根入口公开 `modelLogFormat`、`encodeModelLogKey`、`decodeModelLogKey`、`captureModelLogValue`、`prepareModelLogEntry`、`inspectModelLogEntry`、`inspectSettlementMembers`、`modelLogJsonEqual`、`recognizeMessageValue` 及其类型，消费 D088 的精确采用。所有这些构件均为纯函数；静态导入和调用不打开日志、不装 Cordis、不读取环境凭据或时钟、不发号。日志类型只从 session-log 根入口消费。

文本与值接收是两个显式模式。任意层重复成员、getter、`toJSON`、非 JSON 对象及伪数字品牌均拒绝。捕获返回自有不可变原 JSON，保留数字词法；响应 judge 的 `{ ok: true }` 不会替调用方制造 owned ModelResponse。

```ts
import { captureModelLogValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const captured = captureModelLogValue({
  category: 'record',
  input: {
    kind: 'text',
    text: '{"kind":"model_call_opened","call":"example-call","dispatch":1.0,"firstTokenAt":"2026-09-27T00:00:01Z"}',
  },
})
if (!('ok' in captured)) throw new Error(captured.reason)
if (!writeJsonLossless(captured.ok.value).includes('"dispatch":1.0'))
  throw new Error('Original numeric spelling must survive capture')
```

构造条目时显式交会话、租户、成对 run/attempt、用途及这条消息之前的完整合法消息前缀。`messagePrefix: null` 表示前缀不可得，日志消息会拒绝，不能偷偷代传空数组。写前 OwnedLogEntry 没有耐久 position。实际写方负责权限、栅栏、condition、追加和清理；selection 恒无判重键，其余 D 必须显式出现在 R 中。persisted AssistantMessage 使用 `{ kind: 'persistedMessage', response: capturedResponse }`，与响应的完整 reply 一致；普通 assistant 和 SystemMessage 不得独立写入。

```ts
import {
  captureModelLogValue,
  prepareModelLogEntry,
  encodeModelLogKey,
} from '@omne-harness-lite/model-request-runtime'
import { parseTenantId } from '@omne-harness-lite/identity-values'

const tenant = parseTenantId({ organization: 'example-organization', account: 'example-account' })
const message = captureModelLogValue({
  category: 'message',
  input: {
    kind: 'value',
    value: {
      id: 'example-message',
      type: 'user',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [],
    },
  },
})
if (!('ok' in tenant) || !('ok' in message)) throw new Error('Invalid example value')
const prepared = prepareModelLogEntry({
  session: 'example-session',
  shell: { tenant: tenant.ok },
  captured: message.ok,
  purpose: { kind: 'message' },
  messagePrefix: [],
})
if (!('ok' in prepared)) throw new Error(prepared.reason)
const key = encodeModelLogKey({ kind: 'message', message: 'example-message' })
if (!('ok' in key) || prepared.ok.dedupeKey !== key.ok || !prepared.ok.readKeys.includes(key.ok))
  throw new Error('D and R must explicitly share the MessageId key')
if ('position' in prepared.ok) throw new Error('A candidate has no durable position')
```

全值相等按精确数学数字、对象成员无序、数组有序和原字符串判断；缺席不等于 null。消息认回保留原捕获值，不用本次候选覆盖原值；仅比 id、正文或 source 不够。

```ts
import { recognizeMessageValue } from '@omne-harness-lite/model-request-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'

const original =
  '{"id":"example-reminder","type":"system_reminder","nature":"event","source":{"kind":"extension","extension":"teaching","payload":{"amount":1.00}},"blocks":[],"createdAt":"2026-09-27T00:00:00Z"}'
const candidate = original.replace('1.00', '1e0')
const recognized = recognizeMessageValue({
  candidate: { kind: 'text', text: candidate },
  original: { kind: 'text', text: original },
})
if (!('same' in recognized)) throw new Error('Expected the same mathematical JSON value')
if (!writeJsonLossless(recognized.original.value).includes('1.00'))
  throw new Error('Recognition must retain the original value')
```

`inspectModelLogEntry` 接收实际 LogEntry、预期 session/tenant、明确用途及该位置之前的消息前缀，反核闭合 `{ format, category, value }` wrapper、壳、position 和全部 D/R；R 读取时按集合核对，不把排列次序当业务值。`inspectSettlementMembers` 接收 `{ mode: 'read', session, tenant, prefix: { entries, tail }, target: { call, dispatch, response }, anchors: { dispatched, opened, intent }, current }`；`current` 为 null，或已指定 `{ messageId, disposition }`（缺席成员用 null）。write 模式还交完整 position-free `candidates` 数组，不要求新 R 已在前缀中。

认回先看原批自己的身份、绑定、参数、原金额和完整回复；败方未提交 MessageId 不同或被另批占用，不单独否定合法原批。原批不存在时，当前候选 MessageId 占用才阻止 absent。`completeMembers` 附原捕获值和条目，以及 `disposition: 'same' | 'firstWinner' | 'unrequested'`；不同合法处置保留先到原批，具体服务的成功/alreadyEnded 映射仍归原操作。

成员检查不证明一次物理 append、合法历史、读权限、Run 生命周期或旧任务实际停止。H1 一次 `[M,R]` 与 H2 分次 `[M]`/`[R]` 可有相同 SL3 读面；G29-P/H 仍由宿主和全部写方关闭。已提交的完整 withRun 原批按原耐久值认回，不重新计算 late。新候选必须同时取得同前缀 MS6 尝试与宿主 G28 终结来源；未知为不可用，归账 attempt 不替换响应里的原发出 attempt。十五方法已组合；生产宿主接线、真实 runner/app 采用、G30/G31 与模型认证仍须各自证据。

```ts
import { captureModelLogValue, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'

const sent = '2026-09-27T00:00:00.0004Z'
const first = '2026-09-27T00:00:00.0003Z'
const order = compareRfc3339Instants(sent, first)
if (!('ok' in order) || order.ok !== 1)
  throw new Error('Sub-millisecond reverse order must remain visible')
const alias = '2026-09-27T01:00:00.0003+01:00'
const sameInstant = compareRfc3339Instants(first, alias)
if (!('ok' in sameInstant) || sameInstant.ok !== 0)
  throw new Error('Expected offset-equivalent instants')
if (modelLogJsonEqual(first, alias)) throw new Error('Original strings remain different')
const opened = captureModelLogValue({
  category: 'record',
  input: {
    kind: 'value',
    value: {
      kind: 'model_call_opened',
      call: 'example-call',
      dispatch: 1,
      firstTokenAt: first,
    },
  },
})
if (
  !('ok' in opened) ||
  opened.ok.record?.kind !== 'model_call_opened' ||
  opened.ok.record.firstTokenAt !== first
)
  throw new Error('Capture must retain the original opened string')
```

比较器与 completeMembers 在声明的合法 RFC3339 输入域内给条件性结果，不认证实际时间来源、闰秒公告、合法历史或物理提交。真正生产边界的生产者／宿主／历史 owner 仍须兑现 TL-G1；未核外部值或历史在该边界保持 unavailable。旧毫秒 Instant／Clock 行为保持原状。

## 当前模型日志 codec

包根只导出当前 codec，接收当前 `messages` 入口（MS8）判定的记录与消息，以及当前 `model-response` 入口（MR11）判定的响应。载荷与业务键格式为 `mrr/3`，保留有序字符串数组 `raw.headers`、精确数字以及缺席与空值的区别。旧 `mrr/1`、`mrr/2` 被识别为未知格式并拒绝；没有旧版运行 codec 导出或兼容读取器。

下面的独立示例构造完整 persisted `[M,R]` 批或一条非持久回复响应。传入完整实际响应与合法消息前缀；示例不执行 IO，也不授予日志权限。将导入的包声明为直接依赖。

```ts
import {
  captureModelLogValue,
  prepareModelLogEntry,
  inspectSettlementMembers,
  type InspectSettlementMembersInput,
} from '@omne-harness-lite/model-request-runtime'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { LogPrefixView } from '@omne-harness-lite/messages'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log'

export function prepareReplyBatch(
  session: string,
  tenant: TenantId,
  responseValue: unknown,
  messagePrefix: LogPrefixView,
): readonly OwnedLogEntry[] {
  const response = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: responseValue },
  })
  if (!('ok' in response)) throw new Error(response.reason)
  const r = prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: response.ok,
    purpose: { kind: 'response' },
    messagePrefix,
  })
  if (!('ok' in r)) throw new Error(r.reason)
  if (response.ok.response?.replyDisposition !== 'persisted') return [r.ok]
  const message = captureModelLogValue({
    category: 'message',
    input: { kind: 'value', value: response.ok.response.reply },
  })
  if (!('ok' in message)) throw new Error(message.reason)
  const m = prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: message.ok,
    purpose: { kind: 'persistedMessage', response: response.ok },
    messagePrefix,
  })
  if (!('ok' in m)) throw new Error(m.reason)
  return [m.ok, r.ok]
}

export function inspectReplyBatch(input: InspectSettlementMembersInput) {
  return inspectSettlementMembers(input)
}
```

通过实际 SL3 提供者**一次追加整个返回数组**。当前检查器保留原载荷值与位置，但不认证物理同批、合法读取或旧写方实际停止。历史值若要成为新的写入候选，须在当前 codec 重新捕获。当前表示依据 [RT7](../../core/model-request-runtime/SPEC.md) 与 [v8 codec 投影](SPEC.md)。

## 单次响应头交接

`SendResult` 仅 response／failed／aborted 分支可带 `rawHeaders`，rejected 分支不带；`TransportFailure.headers` 和 `StreamEnd` 的第二头口不存在。sender 必须已按同一显式政策处理并持有自有不可变的 model-response 头 map。invoke 立即保留这一原值，有序数组重复／空值、缺席与空 map 在四种收场、内容门取消中均不丢失，不再运行第二次头脱敏。非法或可变头表示是整份端口违约，请求实际 reader 停止；独立 HTTP 失败事实仍保留。

上游错误与本地文本经绑定的共享 JSON／text 政策处理，raw/error 的 key 与所有 scalar 都覆盖；独立协议状态和真实 usage/cost 即使字面值与凭据巧合仍保真。处理拒绝或 defect 时省略不安全载荷，交固定阶段诊断，已持有 H 保留。发送前 bind defect 以受控阶段异常拒绝 outcome，不造发出结果；诊断 sink 失败不改变业务。

业务 reply／工具片段保持原装配语义。本实现不关闭内容回显政策、raw.body 附件、完整 S20、生产 TLS 组合或耐久服务。精确采用范围见 D095。

## 耐久结算构件

`readSettlementPrefix`、`interpretSettlementPrefix` 和 `createSettlementCoordinator` 是可独立取用的构件，消费实际 SL3 日志和包根 `mrr/3` 表示。noRun 用 unfenced、unconditional 追加；新建 withRun 批先核原 Run/attempt、最新 MS6 尝试及宿主 Run 终结，再用 unfenced 和完整前缀的 tailEquals 追加。每次均追加完整 `[消息,响应]` 或 `[响应]` 批。合法原批优先，保留其身份、格式和原账；协调器不会规划或发出模型请求。

由宿主提供实际 session/tenant/log 代际绑定与已登记 owner。`SettlementRegistration.start` 必须先登记、再执行；`stopped` 表示资源实际停止。owner 负责同一所有者的并发准入，并提供实际 opened 回执及全部尚未确认的旧写方。这些接口形状不授予权限或认证历史物理同批。具名争用预算和精确单调调度器须显式提供，不安装默认次数、计时器或等待政策。

```ts
import {
  createSettlementCoordinator,
  type SettlementCoordinatorInput,
  type SettlementRequest,
} from '@omne-harness-lite/model-request-runtime-local'

export async function settleResponse(
  dependencies: SettlementCoordinatorInput,
  request: SettlementRequest,
) {
  const coordinator = createSettlementCoordinator(dependencies)
  const task = coordinator.settle(request)
  const result = await task.completion
  await task.stopped
  // An unknown original stays owned: keep this coordinator and settle the same request again.
  if ('unavailable' in result && result.reason === 'write_unknown') return { result, coordinator }
  await coordinator.close()
  return { result }
}
```

`completion` 返回结算结果或不可用原因；`requestStop` 只请求取消，`stopped` 表示该句柄的任务已实际停止。追加回执未知的句柄停止后仍保留其登记、原批和追加条件。之后同一目标的 `settle` 会从同源完整前缀解决这个原句柄，本身不写入：读到完整批返回 `recognized` 并只释放该登记；证实缺席同样释放该登记但返回 `write_unknown`，之后的 `settle` 才可重新提交——提交的仍是同一原请求（RT11 S-86），runtime 的消费方会固定它。前缀不可读时继续保留。`close()` 停止在途工作并主动尝试同一认回，只要仍有登记未释放就以 `Settlement work remains owned` 拒绝；在同一协调器上重试。实际停止被拒绝时在 `stopped` 上可见，并继续保留登记。opened unknown 阻断普通响应。本构件不新增独立恢复 API。

示例接收实际宿主依赖与完整的当前（MR11）响应，不注册服务。十五方法已组合；官方模型认证、生产 G28 来源、合法宿主读权接线及全部写方来源仍需各自证据。采用依据：[D087/v4 投影](SPEC.md)、[v8 当前 codec](SPEC.md)。

## 耐久锚定调用

`createAnchoredModelInvocation` 将独立 `invokeModel`、真实 SessionLog 绑定与共同结算协调器
直接组合。它支持一次发出，工具列表可包含已解析的模型面工具定义；可以不属于 Run，也可以带显式
`run`/`attempt` 对，此时锚点以 fenced 方式追加。宿主提供固定的调用、响应与
消息身份、完整档案绑定和选中来源、实际凭据范围与值、策略、传输、owner 和日志代际。
本函数校验这些值；形状不证明授权或凭据来源。一次调用借用精确传输引用，当前交付没有
实现传输热替换。

原传输只规划一次。dispatched 确认先于 HTTP，opened 确认先于任何可见内容。完整 MR11
响应使用原 opened 时刻、实际用量与费用、上游事实和同次调用已交接的安全响应头。
成功或截断回复先交给调用者承担完整的 `PendingModelResponse`，尚无处置或晚到标记；底层 `settleReply('persisted')` 通过同一协调器一次追加
`[AssistantMessage, ModelResponse]`；明确的 vetoed/consumed 处置只追加响应。
确定的失败和系统中断在 outcome 返回前结算；系统中断没有回复，已交付内容保留在 delivered。

`abort()` 请求系统停止。runtime 服务先持久化用户中断意图，再调用锚定句柄的 `interrupt(initiator)`；调用者通过 `runtime.interrupt` 使用完整协议。在途调用在原 owner 登记内执行短控制任务，并发上限为一时同样可用。控制追加回执未知时，实际任务停止后仍须由同一日志的完整权威前缀认回才释放登记；未决响应写入另行保留。`close()` 关闭准入、请求停止，并等待调用、门回调、追加与结算的实际任务停止。只有已确认结算
或从未发出才调用 `releaseBorrowed`。未知锚点或未知结算返回 unavailable，保留句柄、
原结算请求和借用引用。已出门或已开口锚点回执未知时，只由宿主在既有 S-33 时机恢复。
结算追加回执未知时由共同协调器继续持有：其写者实际停止后，之后的 `settleReply` 或
`close()` 读取同源完整前缀。读到完整批即认回；证实缺席才以同一原请求再次结算
（noRun 逐字节相同，Run 批按 S-70④ 只允许更新 `late` 与条目壳）；前缀不可核则保持
unavailable。之后的其他处置或 close 都不能替换保留的原请求。

完成实际宿主准备后，把输入和明确的回复处置传给下例。close 为 unavailable 时，保留返回的 call 和实际宿主 owner。十五方法已组合；生产 Run owner 与模型认证仍须各自证据。

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
} from '@omne-harness-lite/model-request-runtime-local'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'

/** Supply actual host preparation and an explicit caller disposition. */
export async function runPreparedInvocation<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  disposition: ReplyDisposition,
) {
  const call = createAnchoredModelInvocation(input)
  const outcome = await call.outcome
  const settlement = 'replyPending' in outcome ? await call.settleReply(disposition) : null
  const close = await call.close()
  // Retain call and its host owner when close is unavailable; neither abort nor outcome proves release.
  return { call, outcome, settlement, close }
}
```

### 会话模型的耐久选择

`createSessionModelSelection` 从真实会话日志的完整前缀、当前目录行和当前求值输入提供者读取事实。`selectModel` 是交付面的显式命令：先核合法，再核重复，选中名字变化时追加一条共享 codec 记录。没有模型切换记录的会话仍不可得；目录次序和根设置都不会自动制造初选。

`effectiveModel` 返回既有选择 basis 与实际当前 `EffectiveAssembly`，包含根设置。会话层之上的模型锁得到 `layer_lock`，即使锁定名字与选中名字相同。当前读失败不能变成已知无锁。

`legalTargets` 和 `selectModel` 每次都独立读取当前 EvaluationInput，并调用采用的 AE4 evaluator 后再计算合法目标。根可选 `model` 缺席仍合法；模型锁不筛选合法目标集合。`displayList()` 读取本次合法目标和权威最后选中，再按每条展示胜出行的来源调用目录 `credentialPresent(tenant, origin)`，返回每个路由一条的当前来源、被覆盖行、注记和选中标记。选中名字全被撤回时仍展示；目录没有该选中名字的任何一行时返回 `profileNotFound`；输入读不到返回 `unavailable`。presence 读不暴露凭据本体或引用，也不保证后续取值成功。兑现范围为 [RT5 S9–S14/S24–S27/S66](../../core/model-request-runtime/SPEC.md)，沿采用的 [R3-P2 投影](SPEC.md)。

```ts
import { type SessionModelSelectionInput } from '@omne-harness-lite/model-request-runtime'
import { createSessionModelSelection } from '@omne-harness-lite/model-request-runtime-local'

// ports come from the authenticated host's actual scoped providers.
export async function initializeExplicitSelection(
  ports: SessionModelSelectionInput,
  requestedRoute: string,
) {
  const selection = createSessionModelSelection(ports)
  const legal = await selection.legalTargets()
  if (!('ok' in legal)) return { selection, legal }
  const selected = await selection.selectModel(requestedRoute)
  if (!('selected' in selected)) return { selection, selected }
  const display = await selection.displayList()
  const basis = await selection.effectiveModel()
  return { selection, selected, display, basis }
}
```

保留返回组件，直到它借用的提供者生命周期结束。关闭提供者前先等待 `selection.close()`；若得到 `{ unavailable: true }`，说明原未知写入或清理责任尚保留，应继续持有依赖，不能当作已经释放。每项操作在调用提供者前登记工作，实际停止之后才解除登记。宿主负责真实身份授权、同范围提供者、真正由完整前缀所得的模态投影，以及显式并发上限；类型形状和回调不认证生产来源。本组件不登记完整十五操作服务、不拥有提供者，也不发送模型 HTTP。

## 默认重试的有限决策

`decideRetry` 消费完整 LC6 失败主体（包括按调用归属的 `retryConclusions`）和显式退避输入，返回 LC6 的 `retry`／`observed` 或拒绝值。它不等待、不发送；实际再发仍须经过 `dispatchGuard` 和耐久调用服务。下面的政策值由调用者明确选择，不是 runtime 默认值。

```ts
import { decideRetry } from '@omne-harness-lite/model-request-runtime'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'

export function chooseRetry(subject: AfterModelCallFailureSubject) {
  return decideRetry({
    subject: { known: subject },
    policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT10S', jitter: 'none' },
    uniformSample: 0,
  })
}
```

不允许回退时，本纯函数依据默认扩展已经记录的结论计数；同厂商续接不消耗那一次默认重试。若消费者不能取得完整结论历史，须返回 `unavailable`，不能补造结论。P-5 工厂及插件已通过 demo 的 Cordis runner service 接线。携带 Run 的派发仍须由宿主提供已授权的 Run、日志及环境来源；普通无 Run CLI 不会自动调用 P-5。

## 在耐久调用中携带工具

通过 `planInput.tools` 传入已解析的 `ModelToolEntry`。`modelEntry` 把已校验的工具定义转换为模型面形状；使用下面示例的消费者应直接依赖 tool-definition 包。

```ts
import {
  createAnchoredModelInvocation,
  type AnchoredInvocationInput,
} from '@omne-harness-lite/model-request-runtime-local'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { modelEntry, type ToolDefinition } from '@omne-harness-lite/tool-definition'

export function invokeWithTools<P extends PlannedSemantics, R>(
  input: AnchoredInvocationInput<P, R>,
  definitions: readonly ToolDefinition[],
) {
  return createAnchoredModelInvocation({
    ...input,
    planInput: { ...input.planInput, tools: definitions.map(modelEntry) },
  })
}
```

runtime 负责发送定义并装配流式工具调用；调用者负责在后续历史中提供各调用对应的工具结果。该函数不执行工具，也不自动回填结果。非法定义、重名或孤儿调用在新的 dispatched 锚点和 HTTP 请求之前拒绝。内部服务组合构件已能按捕获的会话或 Run 报告范围解析名字；这不是公开的工具执行 API。交互 demo 仍传空工具列表。

`RuntimeConstruction.transport.acquire(binding, routeName)` 保留三种结果：精确 lease、实现不可取得的 `{unavailable:true}`、绑定或配置非法的 `{invalidInput:{reason:"malformed"}}`。新调用与原锚点重新取得都在 plan/send 前保留拒绝类别；外层操作仍负责既有收口。

### 有界工程诊断

`createDiagnosticCollector(config)` 将类型化观测接入有界队列，用独立 emitter 保留每次调用的关联。调用者须完整提供 `DiagnosticCollectorConfig`，包括 `DiagnosticJournalStore`、单个 local 或 tenant scope、时钟、调度器及全部容量和超时。collector 本身不提供文件存储。`recorded` 只表示内存接纳；written/flushed 水位及未完成关闭从 health 读取。query/export 要求相同 scope 和显式分页界限，精确数值保留 JSON number 表示。

这些是工程诊断记录，与会话日志和恢复权威分开。下例接收真实宿主配置及观测到的 HTTP 状态，每次调用使用独立 emitter；close 返回 incomplete 时继续持有 collector。collector 需要另行提供 journal 存储。健康面同时报告保留、过期和淘汰的条数与字节；无法取得的存储计数保持 unknown。

```ts
import {
  createDiagnosticCollector,
  type DiagnosticCollectorConfig,
} from '@omne-harness-lite/model-request-runtime-local'

export async function recordSend(config: DiagnosticCollectorConfig, httpStatus: number) {
  const collector = createDiagnosticCollector(config)
  const emitter = collector.emitter(config.scope, { executionId: 'invocation-1' })
  const accepted = emitter.record({
    source: 'transport',
    stage: 'send',
    outcome: 'completed',
    facts: { kind: 'transport', httpStatus },
  })
  emitter.close()
  const closed = await collector.close()
  return { accepted, closed, health: collector.health(), metrics: collector.metrics(config.scope) }
}
```

空 journal 的 `through.sequence` 为 `"0"`，只表示尚未写入的水位；它不是记录身份，也不能用作 `after` 或 `causedBy`，这些序列从一开始。新增记录后沿用原零水位，仍只查询空前缀。

`invokeModel` 规划成功时发出 typed `measurement` 事实，包含 full/marginal 模式、适用的回退原因、精度、预测／准入 tokens 和对应的有符号贡献。预测值不成为实际 usage 或费用。basis 仅保留 model/provider 及 tokenizer、meter、replay、transform、projection 修订；事件沿用的 `binding` 只保留实际计划的身份／修订。配置值、提示词、输出内容、签名及原响应体均不进入诊断。访问前检查自有数据属性，collector/journal 保存深复制后的冻结值；未知字段和访问器被拒绝。身份文本若含本次凭据，或诊断投影失败，则省略该投影，不改变请求结果。

`calibrationSource` 描述实际固定计划的 none 原因或 observation 口径；保留了来源前缀证据时附边界和摘要。它不编造 ModelResponse 身份，也不认证调用者声明的祖先关系。服务的已授权关联仍由既有 emitter 附带；独立调用只保留显式交入的关联。

既有 `metrics().stageDurations` 的 planning 项使用 collector 显式单调时钟，覆盖 planning started 至 accepted（或 rejected）。它包含完整规划边界内的投影、校验、序列化、计量和诊断投影，不是 tokenizer 独占耗时。记录的 `elapsedMs` 是 collector 时钟上的位置，不是单次 meter 耗时。纯 planner 不新增计时器。起点缺失／被丢弃或时钟失败时，不编造零耗时。

以下公开查询读取已经写入的记录；宿主继续拥有 collector 和 journal 的生命周期，查询界限和覆盖退化保持显式。

```ts
// calibration-diagnostics-query
import type { DiagnosticScope } from '@omne-harness-lite/model-request-runtime'
import type { DiagnosticCollector } from '@omne-harness-lite/model-request-runtime-local'

export async function readPlanningDiagnostics(
  collector: DiagnosticCollector,
  scope: DiagnosticScope,
) {
  const result = await collector.query({ scope, limit: 100, maxBytes: 1048576 })
  if ('rejected' in result) return result
  const metrics = collector.metrics(scope)
  if ('rejected' in metrics) return metrics
  return {
    measurements: result.page.records.filter(
      record => record.stage === 'planning' && record.facts.kind === 'measurement',
    ),
    planningDurations: metrics.stageDurations.filter(value => value.stage === 'planning'),
    coverage: result.page.coverage,
  }
}
```

`invokeModel` 可接收 `diagnosticAssociation` 与 `diagnosticEmitterFactory`。工厂为本次调用取得一个 emitter，transport 的 send/read 沿用同一关联。自由关联字符串在持有凭据的执行边界处理；独立调用不需要租户或会话。collector 由宿主持有，业务真正停止后再关闭；每次调用只关闭自己的 emitter。诊断回调失败不改变响应或计量事实。

```ts
import {
  invokeModel,
  type DiagnosticCollector,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  type InvocationInput,
  type PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'

export function invokeWithLocalDiagnostics<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
  collector: DiagnosticCollector,
  executionId: string,
) {
  return invokeModel({
    ...input,
    diagnosticAssociation: { executionId },
    diagnosticEmitterFactory: association => collector.emitter({ kind: 'local' }, association),
  })
}
```

服务路径通过 `RuntimeConstruction.diagnosticCollector` 接入，只消费 collector 的 `emitter` 能力；health、query、export 和 close 仍由装配持有。dispatch 从已核实的会话绑定取得 tenant scope，只记录已经存在的身份，重试因果只指向实际 recorded 的引用。`dispatchAgain` 接受后记录重试开始，真正发出仍由 transport 观测。

`openCall` 记录精确 transport lease 的实际取得或拒绝，在 lease 自己的 `release()` 返回后才记录释放；成功绑定携带实际 profile、implementation、definition 和 configuration 版本。观察投递保留原始 offer/delivery/close 阶段和类型化拒绝原因。已确认的 dispatched/opened 日志位置在回复交接或结算时投影，未知回执不捏造位置。冷恢复从同一已验证权威前缀读取位置，只有完整结果成立且 scope 真正关闭后才记录 `without_resend`。结算按固定事实白名单投影。工程记录不成为恢复权威；完整 demo 组合另行执行集成验收。

### 默认重试贡献

`createDefaultRetryImplementation` 是独立的 LC6 贡献函数。调用方显式提供完整退避政策和采样来源。它只读取本次失败主体，包括有序保留的全部重试结论；它不等待、不发送请求，也不写结论。决策开始前取不到采样返回 `notStartedUnavailable`；被调用后的非法输入返回 `errored`。runner 仍须核验定位主体并调用 `canDispatchAgain`，获准后才接受 retry。

```ts
import {
  createDefaultRetryImplementation,
  DEFAULT_RETRY_BUILTIN,
} from '@omne-harness-lite/model-request-runtime-local'
import type { RunnerImplementations } from '@omne-harness-lite/loop-extension-runner'

export function registerDefaultRetry(registry: RunnerImplementations) {
  const implementation = createDefaultRetryImplementation({
    policy: { kind: 'exponential', base: 'PT1S', factor: 2, max: 'PT30S', jitter: 'full' },
    sample: () => 0.25,
  })
  return registry.registerBuiltin(DEFAULT_RETRY_BUILTIN, implementation)
}
```

本代登记结束时调用返回的 disposer。Cordis fiber 从 `@omne-harness-lite/model-request-runtime-local/cordis` 导出 `createModelDefaultRetryPlugin({policy,sample})`；它必需注入 `loopExtensionImplementations`，只在自身 effect 中登记 `omne-official:default-retry`。宿主仍须提供 builtinName 完全相同、位置为 `after_model_call`、维度为 `{ending:'failure'}` 的声明；插件不会自建声明或授予 rewrite 权力。正式 Run 失败路径还依赖宿主的合法 Run 历史和失败来源；不属于 Run 的调用不能进入 runner 的 `after_model_call` 位置。

规划消费异步的 [D109 runtime 映射](SPEC.md)。所有适配器实现 `plan(input, execution): Promise<PlanResult<P>>`；包括取消在内，Promise 只能在自身原生任务实际终结后完成。`invokeModel` 传入真实 owner 信号和可选的 caller 自有 opaque `reuseScope`，scope 不赋权、不持久化。锚定计划交给内层 invoke 时只返回原计划，不再次准备图片。服务以原精确 transport lease 跟踪准备任务，取消和 close 等实际完成才释放引用。runtime 不加载 codec 或补图片政策默认值；这些由 transport factory 显式接收。

```ts
import type {
  PlanInput,
  PlannedSemantics,
  TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'

export async function prepare<P extends PlannedSemantics, R>(
  transport: TransportAdapter<P, R>,
  input: PlanInput,
  signal: AbortSignal,
  reuseScope?: object,
) {
  return await transport.plan(input, {
    signal,
    ...(reuseScope === undefined ? {} : { reuseScope }),
  })
}
```

服务构造必须显式提供正安全整数 `maxScopes`，以及同步的 `ExactTransportAcquirer.clearReuseScope(scope)`。固定 transport 实例的装配须保留其清理闭包，直到 runtime close 成功：

```ts
import type { ExactTransportAcquirer } from '@omne-harness-lite/model-request-runtime-local'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'

export function fixedAcquirer<P extends PlannedSemantics, R>(
  acquire: ExactTransportAcquirer<P, R>['acquire'],
  clearReuseScope: ExactTransportAcquirer<P, R>['clearReuseScope'],
): ExactTransportAcquirer<P, R> {
  return { acquire, clearReuseScope }
}
// createModelRuntime 显式接收 { maxScopes: 64, transport: fixedAcquirer(acquire, clear), ... }。
// 无缓存提供者也实际实现 clearReuseScope: () => {}。
```

runtime 在受信 session bind 后，以 tenant/session/log generation 分隔 opaque scope；有限槽位只淘汰 idle 项，全部占用时可沿普通准备资源限制使用无复用路径。关闭先停准入、取消并等待真实准备和网络任务，再逐项清 scope。清理实际返回值必须是 `undefined`；抛错、其他返回值或 thenable 都保留责任并返回 `unavailable`，pending 尝试被观察且终结前不重试。后续 `runtime.close()` 可以重试失败清理。采用依据见[清理附页](SPEC.md)。本包 owner 测试不证明真实原生图片 codec 已验收。

D110 已采用 [RT11 引用生命周期映射](SPEC.md)。runtime 公开引用面直接使用当前 `messages` 入口（MS8）唯一的 `CallKey`、`CreationKey`、`ModelCallPayloadRef`、`ModelCallCreatedPayload`；未处分与最终结果是当前 `model-response`（MR11）的值。`openCall` 必填显式 creation key。ACK 之前，在已发布的 creation key 下发布另一调用会被拒绝，`openCall` 在新调用写入任何内容行或 marker 之前返回 `unavailable`；ACK 之后，同键且创建摘要与原关联一致时认回为 S-97 小视图，其他值一律答 `creationConflict`（RT12 S-100/S-101；`tests/acceptance-a22-acknowledgement.spec.ts`、`tests/reference-content.spec.ts`）。新增 `CallConsumer` 只等待并释放自己的接收资源，不带执行取消或 persisted 消息控制。`CallAccess.check` 在受信提供者的撤权次序中运行准入 callback；`CallPresence.read` 在原 host 精确代际临界段核 live 附着，不接收 caller 自报授权布尔。

内容存储（`createModelCallContentStore`）先通过既有 Storage 确认不可变 UTF-8 字节，再返回 payload 引用。读取先核 SHA-256，再严格无损解析；同键不同字节拒绝覆盖，提交回执丢失后认回原行，close 等真实写任务停止。外部 attachment/raw-body 引用缺可信保留提供者时返回 `unavailable`。其定向测试（`tests/reference-content.spec.ts`）使用真实 SQLite 和 SessionLog；服务创建、acquire 与 marker 发布由下述服务测试覆盖。RT12 S-98 保留与内容共用同一 Storage：`put` 持发布许可，调用进入 retiring 后拒绝；读取在复制的同一快照内核阶段；`prepareAcknowledgement`/`confirmAcknowledgement` 固定 ACK 记录；`releaseAcknowledged` 在同一事务中删除精确行并标记 released，否则报告 `writer_in_flight`、`storage_unavailable` 或 `receipt_unknown`。发布先从完整前缀准入 marker 再 `put`，被拒的 marker 不留行。许可不跨进程恢复；中断的未发布 `put` 留下的孤行不删除。

```ts
import { type SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import {
  createModelCallContentStore,
  type ModelCallContentValue,
} from '@omne-harness-lite/model-request-runtime-local'
import type { Storage } from '@omne-harness-lite/storage'

export async function confirmContent(
  storage: Storage,
  binding: SettlementLogBinding,
  content: ModelCallContentValue,
  locator: string,
  version: string,
) {
  const owner = createModelCallContentStore({
    storage,
    policy: { maxConcurrentWrites: 2, maxContentBytes: 1_000_000 },
  })
  try {
    return await owner.put({ binding, content, locator, version })
  } finally {
    await owner.close()
  }
}
// host 在打开 Storage 前合成 modelCallContentMigrations('sqlite')。
// 已确认行只是内容；采用的 SessionLog marker 需单独发布。
```

内部 `publishModelCallContent` 先写入 accepted 创建或 ready 内容、读取权威 Session Log 前缀，再以 `tailEquals` 追加 marker。真实 SQLite/SQL Session Log 场景验证 created marker 单次提交、同原件认回及不同字节拒绝。公开 `openCall` 和有回复 `dispatch` 在返回 ref 或终态前调用该发布件。`createIndependentCallConsumer` 独立拥有 wait/release 资源：单次 wait 取消不结束 consumer，release 等待接收任务真实停止。`createRuntimeAcquire` 经受信资格与存在性提供者及共同 facts 投影回答 `acquireCall`。

`createModelCallFacts` 从实际会话前缀投影 created/ready marker，并按摘要读取已确认内容。首个 owner 关闭后，另一个 facts 实例能从 SQL Session Log 和 SQLite 内容存储还原同一引用。在 Cordis/Storage 服务场景中，`openCall` 返回创建引用，`dispatch` 发布 ready 而不捏造最终响应，新建 `acquireCall({ mode: 'read' })` 消费者看到 `complete` 与 `disposition_pending`。释放消费者不取消执行 owner。ready 工作真实排空后，runtime 释放精确 transport lease。之后的处分、ACK 回收（RT12 S-98，见上文确认一节）与 creation key 认回由 `tests/acceptance-a22-acknowledgement.spec.ts`、`tests/acceptance-a22-settlement-work.spec.ts`、`tests/acceptance-20260930-a22-runtime.spec.ts` 覆盖，经 demo 服务的路径由其 `tests/call-reference-service.spec.ts` 覆盖。
