# `@omne-harness-lite/loop-extension-runner`

失败来源端口为 `verifyFailure(subject, binding, execution)`。`runPass` 在首个异步边界前自有捕获并冻结经过，来源核验、扩展输入与日志栅栏使用同一个 execution；服务在向宿主取得 scope 前固定该值。宿主仍须核对失败所属原 Run、会话和实际日志代际。同一 Run 中，原 attempt 1 的失败可由合法 attempt 2 接续消费，当前尝试仍受实际日志栅栏约束。第三参必填，不保留旧二参验证模式。

本包公开一个不依赖宿主的拓展件经过执行函数，以及 `runner/5` 结论纯构件。`runPass` 顺序执行拓展件链，每件结论确认写入后才推进；它通过受控等待来源接续耐久 ask，并返回完整结论历史与生效结果。纯构件仍负责结论编解码、经过键、重试结论和效果合成。

本包同时公开独立函数与 Cordis 服务插件。宿主通过类型化端口提供已授权作用域、必要时的真实 Run、完整日志前缀、有序定义、拓展件执行、等待与卡片事实，以及能力判定。`runPass` 不创建 Run，也不决定模型能否重试发送。`readRunnerRetryConclusions` 检查条目和稠密位置，但单凭数组不能证明读取权限。

采用范围见 [D-106](../../../.meta_harness/design/record/decisions/runner-current-pure-provider-adoption/decision.md)，依据 [Runner5](../../../.meta_harness/design/spec/capabilities/loop-extension-runner/v5/contract.md)、[LC6](../../../.meta_harness/design/spec/data/loop-extension/v6/contract.md) 和继承 [v5](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v5-current-design.md) 的 [v6 实现映射](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v6-run-pass-design.md)，服务接线沿已采用的 [v7](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v7-model-service-design.md)。[验证义务](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/verification.md)区分公共函数层与尚待接线的正式宿主。

## 公开接口

- `readPassConclusions({ initial, anchor, run?, binding, chain, entries, tail })` 纯读传入的经过历史，返回有序的全部结论或具名 replay 失败。它与 `runPass` 共用历史校验核心，不接当前 attempt，不调用贡献、处理等待或补写提醒。服务／宿主先负责合法读取；空数组本身不证明读取成功。
- `createRunnerImplementationRegistry()` 持有内置贡献的代际。`registerBuiltin(name, implementation)` 返回同步、幂等的注销函数；同时在场的同名登记抛错。`capture(name)` 固定所选代际，在途旧贡献撤下后即使同名新代已登记，旧结果仍返回错误。`closeAdmission()` 关闭新准入，`drain()` 等实际贡献 Promise 结束。登记面类型为 `RunnerImplementations`，贡献函数类型为 `RunnerBuiltinImplementation(input, signal, mode)`。
- `runPass(pass, chain, ports, signal)` 返回 `{ conclusions, effect }` 或具名失败。历史保留 final 前所有 ask，生效结果只使用各件 final 和当前 ask。`noRun` 只允许符合条件的 user/system `before_persist_message`；pending 不再次调用，ready 要有等待 owner 给出的回放绑定和独立于贡献者错误的偏离锁存。
- `createRunnerLogAdapter({ log, binding, owner, subjectForCandidate })` 把结论读写接到 SL3 `SessionLog`。调用宿主须把 `subjectForCandidate` 绑定为每条候选结论当时的原定位主体；适配器校验后留存，供恢复时判合法竞争胜者。`createRunnerTaskOwner(binding)` 在调用提供者前登记任务，留存 unknown 写入，并提供 `closeAdmission`、`reconcileStoppedLog`、`drain`。真实日志宿主须先让旧物理写者停止并准入恢复读取，才可对账；新日志读空不能证明旧写入缺席。
- `createRunnerReminderLogAdapter({ log, binding, owner, readMessagePrefix })` 使用模型运行时共用的 `mrr/3` MessageId 键并比较完整消息值。回调须提供该操作位置完整且已授权的前缀；同 ID 异值是冲突，不能当作已写入成功。独立适配器的嵌套链由宿主提供；服务从本次固定的清单链筛选。
- `passKeys(input)` 返回经过、全域及可选的最终、ask、模型调用键；输入不合法返回 `{ invalidInput: true }`。键使用固定 JSON 数组，ask 序号保持精确正整数值。
- `prepareRunnerConclusion(input)` 检查完整 LC6 结论、轮次、租户与运行壳、提醒关联和键，返回尚未写入的 `LogEntryInput`。
- `inspectRunnerConclusion(input)` 返回复制后的完整结论及其关联；真正外域条目返回 `{ unrelated: true }`，runner 标记不一致返回 `{ invalid: true }`。
- `readRunnerRetryConclusions(input)` 按日志顺序读取传入的同会话、完整、稠密前缀。不同日志位置即使值相同也保留两条；不能信任前缀或其中的 runner 条目时返回 `{ unavailable: true }`。
- `composeEffect(initial, conclusions)` 按当前主体依次校验结论，返回 Runner5 的五类效果之一；不一致返回 `{ invalidInput: true }`。`initial` 必须是**未叠加结论的原始** `PositionedSubject`。

在本包目录编译后，可运行完整公共函数示例：

```sh
pnpm run build
node examples/public-pass.mjs
```

输出依次包含 `fresh: asked`、`pending: asked`、`replay: proceed`、`final: proceed`、`unavailable: unavailable`、`calls: 2`。示例里的内存等待与日志端口只用于受控演示；正式宿主须提供自己的耐久事实。包测试还使用真实 SL3 JSONL，覆盖关闭重开和未知写入恢复。

下面的示例只演示纯函数。本地构造的位置仅代替日志提供者返回的条目；生产调用必须传真实持久化条目。

```js
import {
  composeEffect,
  inspectRunnerConclusion,
  prepareRunnerConclusion,
} from '@omne-harness-lite/loop-extension-runner'

const session = 'session-example'
const tenant = { organization: 'org-example', account: 'account-example' }
const at = '2026-09-28T10:00:00Z'
const originalPositionedSubject = {
  position: 'before_persist_message',
  subject: {
    message: { id: 'message-example', type: 'user', blocks: [], createdAt: at },
    producer: 'user',
  },
}
const conclusion = {
  extension: 'example-extension',
  position: 'before_persist_message',
  power: 'observe',
  at,
  output: { kind: 'observed' },
}
const prepared = prepareRunnerConclusion({
  session,
  tenant,
  execution: { kind: 'noRun' }, // 仅 before_persist_message 合法
  anchor: 'message-example',
  occurrence: { kind: 'final' },
  value: conclusion,
  reminders: [],
})
if ('invalidInput' in prepared) throw new Error('结论输入无效')

const persistedEntry = { ...prepared.entry, session, position: 1 }
const found = inspectRunnerConclusion({ session, tenant, entry: persistedEntry })
if ('invalid' in found || 'unrelated' in found) throw new Error('日志条目不符合预期')
const result = composeEffect(originalPositionedSubject, [found.conclusion])
if ('invalidInput' in result) throw new Error('结论与原主体不一致')
console.log(result.effect.kind) // proceed
```

除 `before_persist_message` 外，准备耐久结论时调用方须提供真实的 `{ kind: 'withRun', run, attempt }` 壳；`before_persist_message` 可以继承外层真实栅栏，但不会把 Run 字段传给拓展件。`composeEffect` 使用 core 的纯主体与结论判定，无需 Run 或句柄，也不证明曾发生执行。提醒的 MessageId 采用与模型运行时相同的 `mrr/3` 消息键；结论内同时保留完整提醒副本，以便恢复时精确比对。 对于 `producer: system`，只有 runner 内部发起的提醒嵌套继承该栅栏；公开 `runPass` 直接传系统消息及 `withRun` 仍拒绝。等待来源、存在性查询或句柄取得返回后，已观察到的取消会阻止下一次求值，并释放已取得的重演绑定或句柄。

纯函数均为同步实现，不访问网络、时钟、随机源或隐藏存储。`runPass` 是异步函数，只使用显式端口。公共函数成功不证明正式宿主已兑现卡片等待归属、同前缀失败核验、物理写者停止后的恢复，或真实 Run 来源；这些仍是宿主组合义务。

运行 `node examples/replay-and-registry.mjs` 可单独演示贡献登记与纯历史读取，
输出 `replay: 0`、`invocation: output` 和 `withdrawn: true`。
示例显式使用空历史，不宣称完成生产读取或取得 Run 来源授权。

`readRunnerChain({session, binding, sources})` 读取一份当前 loop-extension
清单记录及其所选资产的精确不可变版本。授权宿主借出 `sessionTenancy`、
`manifest` 和受限历史 reader 的 `read`；`isActive` 必须关联这些被捕获的
提供者与物理日志绑定。reader 不取得它们的 `close` 权。其他类别更新不会
替换本表对应的求值，合法同序删除的 `reuse` 表仍然可读。

`RunnerServiceHost` 将 `acquireDispatch` 和 `acquireReplay` 分开，后者只能
取得读取授权。这些装配端口由宿主持有，不是请求数据中的证明。`loopExtensionRunnerPlugin` 配置为
`{host: RunnerHostFactory}`，仅必需 `sessionLog`；同一 fiber 提供
`loopExtensionRunner` 和 `loopExtensionImplementations`。`dispatch(request, signal)`
消费真实链和 SL3 适配器。`replay(request)` 没有当前 attempt，不求值贡献、不调用
守卫、句柄、时钟或提醒写入。共享日志宿主跨插件替换保留 unknown 责任；runner
卸载等待实际调用停止，但不关闭借用的日志与历史 reader。

编译后运行 `node examples/service-lifecycle.mjs`，可观察两个真实 Cordis 服务面，
以及未提供授权清单作用域时明确返回 unavailable。示例使用临时真实 JSONL 日志，
由应用在撤除 runner 后关闭。

本服务增量接入模型路径的 `before_model_call`、`after_model_call`、
`before_persist_message` 和 `after_persist_message`。依赖尚未提供的动作／循环
环境的已知位置返回 `unavailable`，不会误报为未知位置。请求中的 `manifest`
是已授权的会话指认，另携 LC6 定位主体与 `anchor`；dispatch 按需再带
`run`／`attempt`。真实 Run、等待和环境事实仍由宿主供给，服务不创建这些 owner，
也不把缺席事实解释为授权。

`createLoopExtensionRunner({log, host, isActive})` 不启动插件，直接返回同一服务
装配的执行面、登记面、`closeAdmission()` 与 `drain()`。关闭实例不会等待宿主
持有的 unknown 日志任务：宿主必须先停止物理写者、合法准入重开、按原 owner
绑定对账，再 drain。
