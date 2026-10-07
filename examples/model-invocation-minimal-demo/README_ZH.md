# 模型调用最小示例

[English](README.md)

本示例是一个可运行的 **Cordis 模型调用 loop**，不是正式业务应用。单个宿主进程在同一个 Cordis context 里接线 `@omne-harness-lite/model-request-runtime-local` 的公开面，组合真实本地存储（SQLite）、JSONL 会话日志、加密凭据副本、账号与成员资格检查以及 OpenRouter 传输。默认模式发送独立模型请求；工具模式增加一个持久 Run 驱动，展示模型调用工具后的续答。它不是完整 Agent Runtime 或生产治理。凡需要受信提供者之处，本示例只提供单进程、单宿主的证据并如实说明，不能当作跨进程权威的模板。可复用能力留在 `packages/`；本示例只做装配。

它有两个入口：

- 交互式命令行，进行耐久、流式、多轮的文本对话（`dist/cli.js`）；
- 程序装配（`createAcceptanceApplication`、`openDemo`、`createDemoSupervisor`），测试与受信本机宿主经它以图片、工具、Run 坐标、确认和诊断触达同一个 runtime。

## 运行命令行

采用仓库根目录声明的 Node 与 pnpm 版本，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='你的实际 OpenRouter 密钥'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo" --token-margin-multiplier 1.1 --token-margin-reserve 256
```

如果终端已经位于 `examples/model-invocation-minimal-demo`，则从当前目录运行编译产物：

```sh
node dist/cli.js --data ../../tmp/my-model-demo --token-margin-multiplier 1.1 --token-margin-reserve 256
```

`node dist/cli.js --help` 列出全部选项。两个 token 余量选项必填，其余选项默认值如下：

| 选项                                 | 默认值    | 含义                                                                                                                     |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--max-output-tokens <n>`            | `16384`   | 每次响应的输出上限，包含上游计入输出用量的推理 tokens。所选档案仍校验其上限；示例从不截小过大的值。                      |
| `--transport-retirement-wait-ms <n>` | `10000`   | 撤除传输贡献时的正整数等待；命令行始终设 `force=false`。等待超时仍保留 owner，不冒称清理完毕。                           |
| `--ipc-max-message-bytes <n>`        | `1048576` | 每条完整 IPC 消息的字节上限，父子两端都生效。                                                                            |
| `--ipc-max-commands <n>`             | `1`       | 主管与 worker 之间待处理 IPC 请求的上限。                                                                                |
| `--tools`                            | 关闭      | 启用纯函数工具 `demo__echo`、`demo__nonce`，以及工具结果后的模型续答。                                                   |
| `--key-file <路径>`                  | 无        | 仅所有者可读（0600）的文件，只含密钥原始字节，不解析 `.env` 格式；末尾一个换行会被忽略。与 `OPENROUTER_API_KEY` 二选一。 |

新对话请使用**尚不存在**的 `--data` 目录；示例以仅所有者可访问的权限创建它。`/exit` 或输入结束后，仍用相同路径继续。既有目录只有在认证会话及耐久日志可读、可对账时才接受；归属未知的未完工作会被拒绝。不要在命令行传密钥值。密钥发布进加密副本之后，正常重启可省略环境变量和 `--key-file`；再次提供密钥会通过真实凭据发布 API 替换。

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
You> /models
  anthropic/claude-fable-5.1 [official] legal
  anthropic/claude-opus-5 [official] legal
  ...
  deepseek/deepseek-v4-pro-0813 [official] legal
  deepseek/deepseek-v4.1-flash [official] legal
  google/gemini-3.7-flash [official] legal
  ...
* openai/gpt-6-luna [official] legal
  ...
  z-ai/glm-5.3-prime [official] legal
You> /model deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Effective: deepseek/deepseek-v4.1-flash (session, official)
You> What did I ask?
Assistant> You asked me to say hello.
Saved. {"outcome":"complete", ...}
Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7
You> /history
user: Say hello.
assistant: Hello!
user: What did I ask?
assistant: You asked me to say hello.
You> /exit

Closed. Start again with the same --data path to resume.
```

以上数值仅作示意；回答正文、token 用量和美元费用来自上游实际响应。每次提交都可能产生 OpenRouter 费用。`/models`、`/model`、`/model <标识>`、`/history` 与 `/help` 不发送模型请求。未知斜杠命令在本地拒绝。

启用工具模式时，从新建数据目录开始：

```sh
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-tool-demo" --tools --token-margin-multiplier 1.1 --token-margin-reserve 256
```

输入“调用 demo__nonce 生成口令，然后原样回复口令”。口令只在工具实际执行时生成。工具结果确认写入会话后，示例在同一 Run 中请求模型续答。`demo__echo` 返回输入对象的 `value` 字段。工具模式的会话创建时就声明 context；已有缺少声明的会话会拒绝绑定。

### 一轮对话做什么

默认模式每轮发送一条文本用户消息，参数为 `reasoningEffort: 'low'` 与所配置的输出上限。已认证会话绑定统一的 `createModelRuntime` 服务；示例在发送前登记本次调用的宿主 owner，并保留到物理停止。服务打开并派发调用，由有界、经会话授权的观察端把回复流式送到终端。观察端默认上限为 256 个事件与 262,144 字节，程序调用可分别设置这两个正整数。投递诊断与背压不能代替持久历史或结算。

交回的回复由示例自己持久化：`persistModelReply` 在下一轮之前把回复消息与其模型响应作为一个耐久批写入。每次请求把校验后的完整消息历史（包括先前的推理和媒体块）交给调用层；可见性与模型兼容遵循公共契约。共享 OpenRouter reader 把非空 `delta.refusal` 字符串原样作为回复文字流式输出；拒答不会另起一条收场路径（[refusal 服务回归](tests/refusal-service.spec.ts)）。

每个响应耐久结算之后（包括失败响应），终端重新读取本会话已持久化的模型响应，打印累计输入、输出、缓存 token 与实际美元费用。缺失值显示为 `known + N unknown` 并带 `(incomplete)` 标记；不估算，也不把未知计为零。使用同一数据路径重启后，累计值恢复一致。

耐久记录的模型失败响应只打印一行通用失败提示，命令行关闭后以非零状态退出；不打印上游错误正文。被拒绝的请求打印 runtime 给出的拒绝原因。回复提交未确认时循环停止并保留责任。不会自动重试或回退。调用期间按 Ctrl+C 请求**系统停止**，并等待实际结算和应用关闭；它不是耐久的用户中断操作。不要清空数据，也不要自动重发状态未知的调用。

协议故障或断流时，已交付文字保留在模型响应中，不自动变成历史消息。`/history` 读取真实会话日志。打开既有对话时先认证、核实会话归属并对账耐久模型日志，然后才开放新调用；不会自动重发。

### 数据目录

数据目录含 SQLite 状态、JSONL 会话历史（`session-logs/`）、工程日志（`diagnostics/`）、生成的签名密钥、副本加密密钥，以及保存本地示例账号密码的 `demo-state.json`。整个目录保持私有，需要时一起备份。OpenRouter 密钥只存于加密副本。首次准备中断会保持「未完成」标记，不静默重放。旧的不兼容开发格式写下的数据不会被猜测、改写或转换；请使用新的 `--data` 目录，原目录保持不动。

### 模型

示例装入 `@omne-harness-lite/pi-ai-transport` 发布的全部官方定义：按包的官方目录 `officialCatalog` 装入八家 37 叶（OpenAI 12、Anthropic 4、Google 2、DeepSeek 2、xAI 2、Qwen 8、Moonshot 2、ZAI 5），每叶一条官方档案、一个输入计量构件，档案固定该叶定义钉住的唯一供应商路由并禁止回退。缓存档由路由的缓存声明推导：自动缓存保持 automatic，显式缓存取声明的首个 TTL 与断点布局（如 Anthropic 为 `1h`／`last_message`）。模型、计量构件与缓存档的对应只在该包目录中维护，示例不另设映射。新会话显式初选 **`openai/gpt-6-luna`**。已有会话保留其耐久选择。**装入不等于认证**：哪些叶已真实认证，以[实现映射验证页](../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md)的逐叶证据表为准；Google 两叶、Qwen 八叶、ZAI 五叶的输入校准仍在增量线上。`/models` 读取当前展示列表（按路由名排列这 37 条，上面的示例输出以 `...` 省略），`/model` 显示选中与有效路由，`/model <标识>` 耐久切换后续请求的选中路由，不重建会话，也不清空历史。上层锁可能让有效路由不同于选中路由；重启后读取耐久选择。沿用旧数据目录重启时，更高的官方清单序号把新增档案登记进目录，原两条 DeepSeek 档案按新配置修订更新。

## 装配 runtime 的公开面

`createModelRuntime(construction)` 除传输、历史 reader 与政策外，还需要只有宿主才能提供的受信端口。`src/bootstrap.ts` 的 `createAcceptanceApplication` 用真实组件提供它们（不用内存替身，也不发布恒答 `unavailable` 的端口）：

| runtime 输入                           | 本示例提供                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callAccess.check`                     | `createDemoCallAccess`（`src/call-references.ts`）。每次 `read`、`wait`、`settle`、`cancel` 与 `ack` 都重新核验认证入口捕获的登录状态、有效成员资格和 Session 到租户的持有关系，检查借用的日志绑定与调用的原关联，然后才在带撤权信号的证据下运行准入回调。应用开始关闭时该信号被中止。调用者不能传入 `allowed` 标志。                    |
| `callPresence.read`                    | `createDemoCallPresence` 消费原物理拥有者的 `executionSource`，包括 store 移除后保有的原代际。只有原容器仍持有执行资源时才报告 `live`；只有容器已释放其精确租约且该 Session 结算 owner 上没有未知写者时，或受覆盖的冷 worker 依据宿主见证的退出证据建成恢复 scope 之后，才报告 `stopped`。登记表为空绝不是停止证明，其余一律 `unknown`。 |
| `callFacts`                            | runtime 的 `createModelCallFacts` 与 `createModelCallContentStore`，落在本示例自己的 SQLite 存储上。内容表由 `modelCallContentMigrations('sqlite')` 提供，并入示例的迁移序列。预算来自 `modelRequest.callReferences`（`maxScopes` 与内容的 `maxConcurrentWrites`／`maxContentBytes`）；runtime 不提供默认值。                            |
| `SessionRuntimeBinding.sourceVersions` | 部署期不可变标识：官方清单序号与已部署的官方能力集合。示例没有逐次调用的修订读取器，因此不引用可变路径或档案名。                                                                                                                                                                                                                         |
| `acknowledgementCleanup`               | `modelRequest.acknowledgementCleanup` 中显式、有限的重试计划：`createExplicitCleanupSchedule([200, 1_000, 5_000, 30_000])`。它是必填项、没有默认值，可换成任何政策对象。中止一轮不会丢弃耐久的清理责任。                                                                                                                                 |
| `openCall` 的 `creationKey`            | `deriveCreationKey`：对 Session、用户消息身份及显式 call／Run 坐标做纯哈希，跨进程稳定，绝不是随机值。                                                                                                                                                                                                                                   |

```ts
// app.bindModelRuntime(actor, session) 返回的 service 限定在该 Session。
const opened = await service.openCall({
  creationKey: deriveCreationKey({ session, userMessage: user.id }),
  session,
  target: effective.effectiveModel.routeName,
  basis: effective.effectiveModel,
  messages: [user],
  tools: [],
  parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
  host: callHost.host, // 比任何单个消费者都长寿的执行 owner
})
if (!('callId' in opened)) throw new Error('open refused')
const reply = await service.dispatch({ session, callId: opened.callId })
// 之后任何 loop 都可按引用读取耐久结果；这不会再次发送。
const viewed = await service.acquireCall({ ref: opened.ref, mode: 'read' })
```

示例为每条用户消息派生一个 creation key。确认之前，runtime 拒绝在已发布的 creation key 下发布另一个调用，因此第二次 `openCall` 返回 `unavailable`，不会写入该调用。确认之后，同键且创建值与原关联一致时认回为已确认的小视图，同键下的不同值返回 `creationConflict`（runtime 的 `tests/acceptance-a22-acknowledgement.spec.ts`）。

### 按引用读取调用

`acquireCall` 与 `acknowledgeCall` 暴露在同一个绑定 service 上。`read` 返回耐久视图：状态、来源、presence，就绪时还有结果。对 live 调用的 `wait` 返回独立的 consumer，其 `release()` 只停止自己的观察；释放它不会取消执行 owner，执行 owner 随宿主停止而停止。其他 Session 的引用、不存在的调用或正在关闭的应用，都不触及模型即被回答。

已确认的 ready 回复是终态事实：耐久视图与 `readAttempts` 报告状态 `complete`（或 `interrupted`），并在最后一次发出上以 `result: { disposition: 'disposition_pending', pending }` 携带待处分原件，而不是 `reply_pending` 状态。从耐久调用事实结算该回复不会把容器从宿主注销；登记在宿主停止时释放（`tests/acceptance-d4-lifecycle.spec.ts`、`tests/model-service-retry-control.spec.ts`、`tests/model-service-settlement.spec.ts`）。

### 处分、确认与释放

`persistModelReply` 是示例写入持久化消息的路径；应在确认调用之前执行。`settleReply` 结算非持久化处分（`vetoed` 或 `consumed`）。最终响应提交之后，重复的 `settleReply` 只由该 final 判定：同一处分以原状态认回，不同处分返回 `alreadyEnded`，都不写入。

```ts
// `reply` 是调用方自己保存的派发结果（`'replyPending' in reply`）。
if (!('replyPending' in reply)) throw new Error('no pending reply to hand over')
const acknowledged = await service.acknowledgeCall({
  ref: opened.ref,
  expectedResult: { kind: 'response', response: reply.replyPending.id },
})
// { acknowledged: { ref, target, acknowledgedAt, cleanup: 'released' } }
// 或 cleanup: 'pending'，并带非空的 pendingReasons 列表
```

`acknowledgeCall({ ref, expectedResult })` 把模型侧副本交出去释放。它与读取是不同的动作：示例的 `callAccess` 重新核验 `ack`，持有引用或释放 consumer 都不会确认。runtime 先写一条耐久确认，再按显式清理政策删除该调用存下的副本。此后旧引用只回答一个不含路由、回复与输入校准的小型账务视图，回复正文不能再读回：确认前请自己保存原始结果。

对已确认的 ready 调用再作否决或消费处分时，须把原始待处分结果作为 `retainedResult` 交回；缺少时 `settleReply` 返回 `wrongPhase`。runtime 校验交回值、耐久暂存完整批，并追加一条最终响应；之后同一处分无需再交全文即可认回，不同处分返回 `alreadyEnded`，日志不变。`tests/call-reference-service.spec.ts` 通过真实 SQLite、JSONL 与本机 TLS 服务运行这些路径，并检查只有 ready 的调用的确认，以及关闭时撤回访问资格。

### 结算证据与诊断

runtime 成功的 ready 交接以引用 marker 发布，不是结算批，因此工程日志中该调用留下的是 runtime 的 `reply_handoff` 行，而不是 runtime 的 `settlement` 行。runtime 的结算事件投影是内部实现、未导出，所以示例自己经 `persistModelReply` 完成的持久化结算不进入租户工程日志。它的公开证据是类型化验收诊断端口：`AcceptanceDiagnostics.record` 为该调用收到一条 `settlement` 操作事件，结果为 `settlement.committed`（`tests/d6-completion-pending-close.spec.ts`、`tests/d6-completion-sink-isolation.spec.ts`）。

`AcceptanceDiagnostics.record` 在适用的操作事件上接收类型化 `settlement` 与 `observer` 关联。结算事件保留租户、会话、调用、dispatch、响应、owner、policy 与争用计数；观察拒收事件保留租户、会话、调用、dispatch、位置及缓冲计数。请求正文、凭据值、工具数据及配置正文不进入此端口。抛错或异步 sink 独立增加 `status().diagnosticFailures`，不影响模型结果，`close()` 后计数仍可读取。该回调同步、尽力投递；它与下述有界工程日志都不承诺诊断无损投递。

## 部署配置

`createDemoConfig()` 返回本示例显式的 `modelRequest` 部署；程序调用方可在打开应用前替换其中任何值：

- `transport.imagePreparation` 加载已安装的 sharp codec，采用可替换的 `modelImageBalancedV1` 政策。正式与受控 HTTPS 传输使用同一准备配置。原消息保持不变，计量与发送共用准备后的图片字节。runtime 通过捕获的传输 owner 清理复用 scope，关闭时也如此。
- `maxScopes` 与 `callReferences.maxScopes` 为 64；引用内容预算为 4 个并发写入、每个内容值 16 MiB。这些是本地资源配置，不是模型限制。
- `defaultRetry` 提供可替换的重试退避政策与随机采样来源（`createDemoDefaultRetryConfiguration()`）；`registryPolicy` 把当前评估填充的重试次数与并发上限设为 `{ maxRetries: 2, maxInFlight: 8 }`。
- `settlement.contention.limits` 为 `{ submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 }`。保留的会话前缀较大的消费者（例如带图片历史）须自行调高 `retainedBytes` 与 `elapsedMs`；模型图片上限不会覆盖这项运行预算。

```ts
// config 来自 createDemoConfig(...)；diagnostics 是已有的诊断记录器。
if (!config.modelRequest) throw new Error('model request deployment required')
const modelRequest = config.modelRequest
const imageConfig = {
  ...config,
  modelRequest: {
    ...modelRequest,
    settlement: {
      ...modelRequest.settlement,
      contention: {
        ...modelRequest.settlement.contention,
        limits: {
          ...modelRequest.settlement.contention.limits,
          retainedBytes: 16 * 1024 * 1024,
          elapsedMs: 60_000,
        },
      },
    },
  },
}
const app = createAcceptanceApplication(imageConfig, {
  stage: 'modelRequest',
  diagnostics,
})
```

### 图片准备

装配的传输按 D-109 在最终输入门之前准备图片。超过档案 `maxImageBytes` 的图片在有限政策内重新编码，因此 4 MiB + 1 字节的 PNG 以一次请求发出，其内联图片不超过 4 MiB，而耐久的用户消息保留原字节。恰好 4 MiB 的图片原样发出。`input_limit_exceeded` 只留给准备后仍超出上限的候选；配置的 token 余量超限在零 HTTP 请求下拒绝（`tests/openai-sol-luna-images-service.spec.ts`）。命令行没有图片附件语法；图片沿程序接口的用户消息进入。

### 传输贡献

模型请求阶段安装 Cordis `modelTransport` 服务，并为每组精确定义与输入计量构件装入一个可信贡献 fiber。runtime 为每次调用取得该服务的固定租约；发布新贡献不会改变已有调用。撤除某个贡献先禁止该版本的新取得，再等待其租约、HTTPS 读取及回调实际停止。应用关闭先收口 runtime，再卸载贡献与传输服务。本机受控 HTTPS 测试覆盖旧调用在途时的 Pro／Flash 贡献更替，并核验无法解释的配置在 HTTP 与模型锚点之前返回 `invalidInput`（`tests/model-transport-service.spec.ts`、`tests/model-hotupdate-integration.spec.ts`）。这只是进程内热更切片；目录采用与旧版显式撤除仍由调用方负责。

### token 余量与响应校准

两个 token 余量选项都是显式部署选择。命令行在 `ceil(estimatedTokens * multiplier) + reserve` 不超过项目输入上限时准入请求。命令行装入 37 个计量构件（各家族按目录绑定）；其中两个 DeepSeek 计量构件在受支持的参考渲染域内提供有符号的回放／新增估算，其余家族的回放／新增能力各按其计量构件（见 pi-ai-transport README）。来源、计量依据、投影与参考边界校验通过后，规划器复用上游输入观察，只计量回放输出与新增输入，稳定前缀不进入边际 tokenizer。不适用时回退全量计量；全量仍不可用则在发送前拒绝请求（[DeepSeek 服务回归](tests/deepseek-marginal-service.spec.ts)）。

后续每轮，示例 reader 从同一已认证日志前缀交出所有实际选入的旧 assistant 响应。runtime 把最新可用的准确输入观察作为锚，并单独交出全部已知的选入输出组，包括输入计数不可用的响应。切换模型或改变输入前缀会触发全量计量；某轮缺可用 usage 时，更早的合法观察仍可用。历史响应从不改写，估算也从不代替实际用量或费用。该 reader 覆盖线性无 Run 会话和显式受控的单 Run fixture，不据此确立任意分支或压缩来源。余量不保证与上游计数相等。

## 重试、runner 与 Run

根发布声明官方 `omne-official:default-retry` 贡献，另一个 fiber 向应用的 Cordis runner 服务登记默认重试实现。耐久记录的重试结论不会自行再次请求模型：程序调用方应等待返回的非零 `plan.after`，再显式调用 `dispatchAgain`；该操作重新检查当前评估限额，可能拒绝发送而保留原重试结论。

应用从当前评估输入填充真实 SQLite 装配清单，并向 runner 服务借出受限的历史 reader。`dispatchRunner(actor, session, request, signal)` 重新核验身份与会话，再经 runtime 同前缀 `readAttempts(..., { consumeFailure: true })` 取得失败来源；`replayRunner(actor, session, request)` 只读耐久结论，不取得该来源也不写入。执行 `after_model_call` 时，需要可信的构造期 `runnerExternal` 提供者核验并借出真实 Run、日志与环境句柄；缺少时本示例返回 `unavailable`。命令行只做无 Run 调用，从不自动调用 runner。runner 请求必须属于耐久模型调用的同一个 Run。

程序接口 `startServiceCall` 可把已经建立的 `run`、`attempt` 与原可用性 `report` 一起透传给 `openCall`。可信构造期的 `runHistory` reader 可从 runtime 交来的受持有前缀解释 Run；缺少时 Run 结算仍不可用。`persistModelReply` 把原待处分回复与同一 reader 交给结算协调器，由它认回或追加完整的消息／响应批，并依据受持有前缀判定是否迟到。默认校准 reader 只处理无 Run 的消息链；有 Run 的调用须由可信构造期的 `calibrationHistory` reader 证明所选消息的来源因果，否则返回 `sourceUnavailable`。

仅供本地验收的构造期 `controlledRunFixture` 借用本应用的已认证会话、当前资产注册表和物理会话日志 owner。其 `startAttempt` 在栅栏内追加 `attempt_started` 后返回注册表的真实可用性报告，调用方在 `finally` 中释放其 scope。它只选择该会话中一个已核实的 Run／attempt 及其完整线性消息链；未选入或冲突的 Run 仍不可用。它不提供命令行 Run 命令，也不是通用 Run owner。

## 程序入口

会话日志与模型请求阶段还装配 runtime-context 提供者及会话身份来源。`createToolSession(actor, session)` 新建带有持久必需身份块的会话，返回固定的协调及工具视图绑定。`bindToolSession(actor, session)` 只读取已有声明。两个入口都核验当前登录、成员及会话持有租户。已有会话缺声明时返回 `unavailable`，不会补默认声明。SQL 创建与 context 初始化使用不同存储，因此跨存储半完成创建在冷重启后仍可能不可用。这个入口还不执行工具，也不代表模型—工具闭环完成。

包根导出 `createAcceptanceApplication` 及其配置与结果类型和固定阶段 fiber 名、`openDemo`、`createDemoSupervisor`、`runInteractive`、`createDemoConfig`、`createDemoDefaultRetryConfiguration`、`createExplicitCleanupSchedule`、`MODEL`，以及诊断日志与诊断装配入口和它们的类型。装配拥有自己的 Cordis context 与生命周期。它的 `currentTime()` 只读取已有的租约 Clock，供消息与调用时间戳使用；时钟不可用则禁止发送。`AcceptanceHooks` 与 `developmentTransport` 是可信测试控制，不是租户输入。仅认证阶段不发送模型请求。

- `startServiceCall(actor, session, { user, parameters, host, observer?, tools?, callId?, run?, attempt?, report? })` 接收完整且已校验的 `UserMessage`（包括图片块），在打开调用前追加它，由所选模型与传输检查兼容性。
- 提供可信、借用的 `modelRequest.assetRegistry`（`AssetRegistryService.lookup`）时，`tools: ModelToolName[]` 由 runtime 在该会话的真实注册表中解析；没有注册表却给出非空工具名单时返回 `unavailable`。注册表的 owner 须保持其可用直到应用关闭；命令行不配置它。
- `appendServiceToolResult(actor, session, { message, host })` 让外部工具结果写方在完整模型工具调用持久化之后提交已校验的 `ToolMessage`。应用先按完整耐久前缀核当前身份、宿主归属与配对，再做一次条件追加。它不执行工具，也不虚构 Run。
- `openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?, host?)` 为本机程序调用返回真实 application 与已认证 actor。

部署的 `modelRequest.transport.retirement` 必须提供正整数 `waitMilliseconds`、`force` 与可替换的 `schedule`。

## 主管、worker 与恢复

命令行使用 `createDemoSupervisor(...).open()` 与独立的远程 facade，只传可序列化命令与展示身份；worker 内调用同一个本地 `openDemo`，并对每次操作重新核实身份。主管为数据根持有一个跨多轮复用的长期 worker 进程。worker 拥有 Cordis、存储、会话日志、凭据、模型调用及其收口路径；主管拥有 child 实例与 IPC。只有亲眼观察到旧 child 的实际 `exit` 与流 `close` 后才启动后继；IPC 断线或发出 kill 请求都不算退出证据。密钥文件由 worker 在旧耐久调用对账之后才读取，跨 IPC 的只有路径；密钥缺失时，即使恢复已提交，本次启动仍可能失败。部署须把该数据目录专供此主管的 worker 链。

同一主管存活期间，在耐久 dispatch 之后被杀的 worker 可以被替换；后继在零新增模型 HTTP 请求下对账原会话日志。新启动的命令行无法继承另一主管的退出见证：未完调用的旧 owner 未知时，打开会在新请求之前拒绝。日志的 clean marker 或能取得文件锁，都不证明旧模型效应已停止。全部已收场的历史可以由新命令行重开（`tests/cold-supervisor.spec.ts`）。

发送结果中的 `released` 只描述当次停止尝试。终端回调仍在运行时它为 false；回调实际停止后，显式重试 `close()` 才可能完成，主管还会等待 worker 真正退出。主管的受信故障控制可以丢弃一次发送回执，再以冲突的请求 ID 向后继重放；原代际仍会阻止错误交付。`inspect().nativeIpcBackpressureObserved` 报告 Node 的 IPC 发送缓冲是否施加过背压。这些控制用于本地恢复测试，不是租户操作。

## 本机工程日志

示例先认证，再分别打开仅所有者可访问的本机与已核租户 JSONL collector，然后在同一 Cordis context 中激活模型请求 fibers。程序装配时，`createAcceptanceApplication(...).ready` 准备身份与会话日志访问；认证并打开两个诊断 owner 之后，才调用 `activateModelRequest(actor, diagnostics, diagnostics.transports)`。激活失败不会开放模型准入。

每次构造 transport 前先预留一个代际。其注册表只借用绑定本机 collector 与固定 `transport:<generation>` 执行标识的 record 端口；注册与退役事件来自真实注册表，不进入租户日志。确认未取得资源的构造中止会留下代际缺口；状态未知的构造保留其预留。service 的 `inspect()` 把注册表投递失败与丢弃同网络诊断、collector 健康分开报告。当前、构造中、仍存活的旧代际与终态 transport 代际共用一个保留上限（`createDemoDiagnosticConfig` 中为四）；活跃 owner 占满时拒绝新构造。

`openDemo(...).diagnostics.tenant` 与 `.local` 向受信本机宿主提供有界 `query`、`exportPage` 与 `health`。`close()` 先停止业务，再关闭诊断写端，返回 `complete`、`businessComplete`、诊断关闭结果和 transport 健康状态。未完成时保留同一 owner 并重试；关闭后读句柄仍可用。业务关闭后诊断 sink 仍在执行时，结果保持未完成并报告待处理数量。接受、写入、刷盘是不同水位：同步失败不声称已刷盘，也不撤销已持久化的会话回复。`DemoDiagnosticConfig.journalFileSystem` 允许受信程序宿主为日志提供文件系统以做故障注入；命令行没有该选项。诊断墙钟读取 `@omne-harness-lite/clock-lease` 导出的宿主时间源；时钟不可读或倒退时，保留期查询不可用。

计量诊断只保存封闭投影：模式、回退、精度、预测与准入 tokens、有符号贡献、安全的 basis 修订及保留的来源前缀摘要，不含 `configuration.values`。collector 的 `planning` 耗时涵盖整个规划边界，不只是 tokenizer 耗时。估算值从不进入累计实际用量或账单。

```ts
import type { DemoConversation } from '@omne-harness-lite/model-invocation-minimal-demo'

export async function closeAndReadDiagnostics(demo: DemoConversation) {
  const closed = await demo.close()
  const tenant = demo.diagnostics.tenant
  const page = await tenant.query({ scope: tenant.scope, limit: 32, maxBytes: 65_536 })
  return { closed, page, health: tenant.health() }
}
```

`createDiagnosticJournal(config)` 在私有根下独占创建新的 collector 目录；`openDiagnosticJournalReader(config)` 在关闭或重启后只读重开。须提供完整的 `DiagnosticJournalConfig`，包括 scope、时钟、调度、保留策略与查询／导出界限。

```ts
import {
  createDiagnosticJournal,
  type DiagnosticJournalConfig,
} from '@omne-harness-lite/model-invocation-minimal-demo'

export async function readEngineeringPage(config: DiagnosticJournalConfig) {
  const journal = await createDiagnosticJournal(config)
  const page = await journal.query({
    scope: config.scope,
    limit: config.queryMaxRecords,
    maxBytes: config.queryMaxBytes,
  })
  const closed = await journal.close()
  return { page, closed, health: journal.health() }
}
```

查询与 `exportPage(query, { maxRecords, maxBytes })` 必须传入完全相同的已绑定 scope。空日志的 `through.sequence='0'` 固定空快照，不是记录身份。游标过期、损坏、超时与容量耗尽都有明确结果。TTL 清理只在 owner 活跃时运行，进程退出后不继续；删除失败或 I/O 未结束不算空间释放。这些工程记录与会话历史分开。

## 开发用 runner 宿主

`createAcceptanceApplication()` 返回的应用另提供 `runExtensionPass(actor, session, request)`，用于显式给入的开发扩展。`DemoRunnerRequest` 复用 runner 包已有的 pass、chain 与非存储端口；用到哪些端口就给入对应的真实执行与等待来源，`isActive()` 的结果不证明 Run 或等待卡片事实。该入口不注册产品链，也不增加模型命令。

应用验证参与者与会话，并提供共享 JSONL 绑定、结论写入、提醒读写与物理任务 owner；调用者不能替换这些存储端口，也不能自行宣称写入者已停止。`subjectForCandidate` 为每条结论（包括嵌套 pass）给出原始的定位 subject，runner adapter 核验二者的关系。runner 服务 adapter 只借用历史 reader 的 `read` 能力；reader 及其 `close()` 仍归应用持有。

始终等待 `app.close()`。它先关闭 runner 准入并取消 pass，保留仍在执行的贡献，停止其他共享日志消费者，再关闭真实日志。未知追加只能在对同一日志经 SL3 恢复准入重开、读取原键之后解决。退出情况仍未知的写入者保持未完成；不要把 `complete: false` 报成正常关闭。

## 验证

在仓库根目录执行（不使用模型凭据，不产生付费请求）：

```sh
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test
python3 examples/model-invocation-minimal-demo/tests/pty-check.py
```

构建前须先构建 workspace 依赖（在仓库根执行 `pnpm run build`）。PTY 检查在操作系统伪终端下驱动真实交互命令行，对接受控本机 TLS。单个文件可用 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/<file>.spec.ts --maxWorkers=1` 运行。完整套件会派生 worker 进程并运行大历史用例；主机负载较高时，请避免与其他重任务并行运行。

所有测试都使用受控本机 TLS 端点与合成上游响应。它们验证服务组合、耐久历史与账务路径；不认证 tokenizer 精度、effort 映射、缓存保留、私有预处理或真实路由接受。

| 测试文件                                                                                                                                                      | 经授权服务验证的内容                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/call-reference-service.spec.ts`                                                                                                                        | creation key、`acquireCall`、确认（已结算与只有 ready）、ACK 后带 `retainedResult` 的 `settleReply`、重复处分，以及关闭时撤回访问                                         |
| `tests/model-service-settlement.spec.ts`、`tests/model-service-retry-control.spec.ts`                                                                         | 回复处分、由宿主释放的登记、重试控制，以及已确认 ready 读为 `complete`＋`disposition_pending`                                                                             |
| `tests/d6-completion-*.spec.ts`                                                                                                                               | 关闭归属、sink 隔离与失败、脱敏、HTTP 503，以及 `reply_handoff`／`settlement.committed` 证据                                                                              |
| `tests/deepseek-marginal-service.spec.ts`                                                                                                                     | 两条 DeepSeek 路由：三轮耐久对话的边际校准，以及零 HTTP 的超限余量拒绝                                                                                                    |
| `tests/openai-sol-luna-images-service.spec.ts`                                                                                                                | GPT-6 Sol／Luna 及对应 Pro（`pi-ai:openai` `mp4-18`，definition 6／7，Pro 为 6）：图片历史、恰好 4 MiB 边界（Sol）、4 MiB + 1 字节的 D-109 准备，以及 token 余量拒绝      |
| `tests/openai-pro-images-service.spec.ts`                                                                                                                     | 三个 GPT-5.6 Pro 绑定与 GPT-6 Astra Pro：三轮图片历史，`scope_unknown` 下的全量估算准入                                                                                   |
| `tests/openai-output-history-service.spec.ts`                                                                                                                 | 三个 GPT-5.6 非 Pro 型号：中间回复输出已知、输入用量未知，随后复用锚或全量计量                                                                                            |
| `tests/google-effort-service.spec.ts`、`tests/xai-effort-service.spec.ts`、`tests/zai-prime-effort-service.spec.ts`、`tests/qwen-open-effort-service.spec.ts` | 三轮耐久对话下的请求 effort（Google 与 xAI 为 `low`／`medium`／`high`，Z.ai Prime 为 `low`／`high`／`max`，两个开源 Qwen 叶为 `high`／`max`），以及零 HTTP 的超限余量拒绝 |
| `tests/qwen-visible-service.spec.ts`                                                                                                                          | 六个商业 Qwen 叶在各自声明的缓存配置下，每轮全量计量                                                                                                                      |
| `tests/xai-closeout-service.spec.ts`、`tests/moonshot-three-round-service.spec.ts`                                                                            | xAI 不透明回复的持久化与原样重发；Moonshot 有／无工具的三轮                                                                                                               |
| `tests/refusal-service.spec.ts`                                                                                                                               | 拒答文字的提交、关闭重开后的精确回放，以及被宿主取消或停滞时限停止                                                                                                        |
| `tests/model-transport-service.spec.ts`、`tests/model-hotupdate-integration.spec.ts`                                                                          | 精确传输贡献、新贡献发布时旧调用排空，以及无法解释配置的 `invalidInput`                                                                                                   |
| `tests/cold-supervisor.spec.ts`、`tests/crash-reopen.spec.ts`、`tests/control-writer-uncertainty.spec.ts`、`tests/response-writer-cold-recovery.spec.ts`      | 受管 worker、SIGKILL、崩溃重开、未知控制与响应写者，以及不再发 HTTP 的冷恢复                                                                                              |
| `tests/runner-host.spec.ts`                                                                                                                                   | 已认证 runner pass、提醒持久化、重放、关闭后重开与文件系统故障注入                                                                                                        |

服务、选择、观察端、恢复、确认与校准的映射遵循已接受的 [RT12](../../.meta_harness/design/spec/capabilities/model-request-runtime/v12/contract.md) 与 [MR11](../../.meta_harness/design/spec/data/model-response/v11/contract.md)，校准由 D107 采用，图片准备由 D-109 采用；提供者状态见 [runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)。统一服务装配的真实 OpenRouter PTY 有界证据见 2026-09-28 示例服务证据，经本示例服务入口的真实逐叶三轮运行列在 [transport 验证](../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md)。命令行的模型切换本身只在受控本机 TLS 与 PTY 检查下验证。
