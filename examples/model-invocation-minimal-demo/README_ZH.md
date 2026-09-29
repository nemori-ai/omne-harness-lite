# 模型调用最小示例

这是一个可在终端交互、真实流式输出且持久化的多轮模型对话示例。它使用真实本地账号、组织资格、会话归属、当前求值输入、官方模型档案、加密凭据副本、OpenRouter 传输和 JSONL 会话日志。原 `model-request-acceptance` 装配迁入此示例；可复用能力仍在 `packages/`。

示例装入 **`deepseek/deepseek-v4-pro-0813`** 与 **`deepseek/deepseek-v4.1-flash`** 两条官方档案，均固定供应商路由 **`deepinfra/fp8`** 并禁止回退。Pro 只是首次会话的显式初选。`/models` 读取当前目录展示列表，`/model` 显示选中和有效路由，`/model <标识>` 耐久切换后续请求的选中路由；不会重建会话或清空历史。上层锁可能让有效路由不同于选中路由，重启后仍读原耐久选择。其他已发布模型定义未随之自动具备可用的档案、适配与输入计量。

模型请求阶段安装 Cordis `modelTransport` 服务，并为每组精确定义与输入计量构件装入可信贡献 fiber。运行时为每次调用取得该服务的固定租约；发布新贡献不会改变旧调用。撤旧先禁止该版本的新取得，再等待租约、HTTPS 读取及回调实际停止。应用关闭先收口运行时，再卸载贡献与传输服务。本机受控 HTTPS 测试覆盖旧调用在途时的 Pro／Flash 贡献更替，也核验无法解释的配置在 HTTP 和模型锚点之前返回 `invalidInput`。这只是进程内热更切片；目录采用与旧版显式撤除仍由调用方负责。

程序调用的 `ModelRequestDeployment` 必填 `defaultRetry` 和 `registryPolicy`。`defaultRetry` 提供可替换的重试退避政策与随机采样来源；`createDemoDefaultRetryConfiguration()` 给出本示例的初值。`registryPolicy` 配置当前评估填充的重试次数及并发上限，`createDemoConfig()` 的初值为 `{ maxRetries: 2, maxInFlight: 8 }`。根发布声明官方 `omne-official:default-retry` 贡献，但耐久记录重试结论不会自行再次请求模型。程序调用方应等待返回的非零 `plan.after`，再显式调用 `dispatchAgain`；该操作重新检查当前评估限额，可能拒绝发送而保留原重试结论。调用者可在打开应用前替换这些显式部署值。

应用从当前评估输入填充真实 SQLite 装配清单，向同一 Cordis runner 服务借出受限的 EIS 历史 reader；独立的 P5 fiber 向该服务登记默认重试实现。`dispatchRunner(actor, session, request, signal)` 重新核验身份和会话，再经 runtime 同前缀 `readAttempts(..., { consumeFailure: true })` 获取失败来源；`replayRunner(actor, session, request)` 只读耐久结论，不取得该来源也不写入。执行 `after_model_call` 时，可信的构造期 `runnerExternal` 提供者必须核验并借出真实 Run、日志及环境句柄；缺少该 owner，本示例返回 `unavailable`。普通无 Run 的 CLI 对话不会伪造 Run 或自动调用 P5。
程序接口 `startServiceCall` 可把已经建立的 `run`、`attempt` 和原可用性 `report` 一起透传给 `openCall`。可信构造期的 `runHistory` reader 可从 runtime 交来的受持有完整前缀解释 Run；缺席时 Run 结算仍不可用。`persistModelReply` 把原待落盘回复和同一个 reader 交给结算协调器，由它依据受持有前缀认回或追加完整的消息／响应批，并判定响应是否迟到。默认校准 reader 只处理无 Run 的消息链；有 Run 的调用须由可信构造期的 `calibrationHistory` reader 从该前缀证明所选消息的来源因果，否则返回 `sourceUnavailable`。仅供本地验收的构造期 `controlledRunFixture` 借用本应用的已认证会话、当前资产注册表和物理会话日志 owner；其 `startAttempt` 在栅栏内追加 `attempt_started` 后返回注册表的真实可用性报告，调用方在 `finally` 释放 scope。这个有限 fixture 只选择该会话中一个已核实 Run／attempt 的完整线性消息链；未选入或冲突的 Run 仍不可用。它不提供 CLI Run 命令或通用 Run owner。CLI 继续发送无 Run 调用。runner 请求必须属于耐久模型调用的同一个 Run。

每轮接收文本输入、无工具、无 Run，参数为 `reasoningEffort: low` 和 `maxOutputTokens: 16384`。已认证会话绑定统一的 `createModelRuntime` 服务；服务打开并派发调用，由绑定会话授权且有双重缓冲上限的观察端把流送到终端。每次发送前先登记实际调用宿主，并在物理停止前保留其所有权。打开既有对话时先认证、核实会话归属、对账耐久模型日志，然后才开放新调用；不会自动重发。完整回复与模型响应由示例在同一耐久批次结算后才进入下一轮。每次请求把校验后的完整消息历史（包括先前的推理和媒体块）交给调用层，不加纯文本白名单。可见性和模型兼容遵循公共契约；命令行目前仅提供文本输入。`/history` 读真实会话日志。使用相同数据路径重启会重新认证并恢复原会话，不重放注册或来源发布。

共享 OpenRouter reader 也会把非空 `delta.refusal` 字符串原样流式输出为回复文字，包括空白。完整且耐久持久化的回复在重开后仍可读，并可进入下一轮实际选中的历史。协议故障或断流时，已交付文字保留在模型响应中，不自动变成历史消息。中断命令沿已有控制／结果分工，拒答不会新增另一套收场路径。受控 [refusal service 回归](tests/refusal-service.spec.ts) 使用本地 TLS，不代表真实付费模型认证。

用 `--max-output-tokens <正整数>` 配置每次响应的输出上限，默认 16,384。所选模型的档案仍校验其上限，demo 不会静默截小过大的配置。此额度包含上游计入输出的推理 tokens。使用相同 `--data` 和新上限重启，保留原会话历史。
当前开发格式在每次调用快照中完整携带项目输入上限及上游限制事实，每条响应也必填 MR9 输入校准事实。旧开发版本产生的不兼容数据不会被猜测、改写或自动转换；验证当前版本请显式使用新的 `--data` 目录，原目录保持不动。

后续每轮，demo reader 从同一已认证日志前缀交出所有实际选入的旧 assistant 响应。runtime 用其中一个可用输入观察作为锚，并单独交出全部已知的选入输出组，包括输入计数不可用的响应。planner 保留完整消息 wire，把各组归到稳定前缀、锚回放或新增输入。demo reader 覆盖线性无 Run 会话和显式受控的单 Run fixture，不据此声称任意分支或压缩来源已可证明。

两个 token 余量选项均须显式配置。示例用 `ceil(estimatedTokens * 1.1) + 256` 与项目输入上限比较。两个固定版本的 DeepSeek 计量构件均在受支持的参考渲染域内提供有符号的回放／新增估算。来源、计量依据、投影和参考边界校验通过后，规划器复用上游输入观察，只计量回放输出和新增输入，稳定前缀不会再次进入边际 tokenizer。不适用时回退全量计量；全量仍不可用则在发送前拒绝。[本地 DeepSeek 服务回归](tests/deepseek-marginal-service.spec.ts) 通过已认证服务调用和受控 TLS 覆盖两个路由，不代表真实上游精度认证。后续运行时沿已认证、实际选入的 no-Run JSONL 消息链核原响应、dispatch 与回复关系，把最新可用的准确上游输入观察交给同一传输规划器。只有计量依据和投影仍适用时，规划器才可只计量实际回放输出与新增输入；本地受控 Anthropic 服务测试对无 Run 和可信单 Run 选入链均覆盖此路径。切换模型或改变输入前缀会回退全量，某轮缺可用 usage 时仍可检查更早的合法观察。旧响应不因此改写，估算也不进入实际用量或费用。余量可调整，不保证与上游计数相等。本地程序调用使用 `openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?, host?)`，取得真实 application 与已认证 actor。CLI 使用 `createDemoSupervisor(...).open()` 的独立远程 facade，只传可序列化命令与展示身份；worker 内仍调用同一个 `openDemo`，每次操作都重新核实身份。部署的 `modelRequest.transport.retirement` 必须提供正整数 `waitMilliseconds`、`force` 与可替换的 `schedule`；等待超时仍保留资源所有权，不冒称清理完毕。CLI 明确设 `force=false`，撤除等待默认为 10,000 毫秒，可用 `--transport-retirement-wait-ms <正整数>` 调整。

观察队列默认有明确的 256 事件与 262,144 字节上限，程序调用可分别调整这两个正整数。投递诊断及背压不能代替持久历史或结算。

CLI 为数据根持有一个跨多轮复用的长期 worker 进程。worker 拥有 Cordis、存储、会话日志、凭据、模型调用和收口路径；CLI 主管拥有真实 child 实例及 IPC。只有亲眼观察旧 child 的进程 `exit` 及流 `close` 后才启动后继。IPC 断线或发出 kill 请求不算退出证据。`--ipc-max-message-bytes`、`--ipc-max-commands` 明确设置有限 IPC 边界；字节上限在父子两端均作用于每条完整 IPC 消息。密钥文件由 worker 在旧耐久调用对账后才读取，IPC 只传路径，不传密钥值；指定的密钥缺失时，旧调用可已完成对账，但本次启动仍会失败。部署须把该数据目录专供此主管的 worker 链。

同一个主管仍存活时，旧 worker 在耐久 dispatch 后被杀，后继可在零新增模型 HTTP 请求下对账原日志。新启动的 CLI 无法继承另一主管的退出见证；若旧 owner 的未完调用来源未知，打开会在新请求前拒绝。日志的 clean marker 或可取得文件锁都不证明旧模型效应已停止。全部已收场历史可由新 CLI 正常重开。本机 HTTPS 测试覆盖真实派发、SIGKILL、child 退出、同主管恢复及新主管拒绝；其他冷恢复和故障义务仍按 runtime realization 跟踪。

程序调用的 `AcceptanceDiagnostics.record` 在适用的操作事件上接收类型化 `settlement` 与 `observer` 关联。结算事件保留租户、会话、调用、dispatch、响应、owner、policy 与争用计数；观察拒收保留租户、会话、调用、dispatch、位置及缓冲计数。装配只投影这些既有字段，请求正文、凭据值、工具数据及配置正文不进入此诊断端口。抛错或异步 sink 会独立增加 `status().diagnosticFailures`，`close()` 后仍可读取计数。该回调为同步尽力投递。下述独立类型化 collector 提供有界 JSONL 存储与查询；两个接口都不承诺诊断无损投递。

## 运行

采用仓库根目录声明的 Node 与 pnpm 版本，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='你的实际 OpenRouter 密钥'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo" --token-margin-multiplier 1.1 --token-margin-reserve 256
```

如果终端已经位于 `examples/model-invocation-minimal-demo`，则从当前目录直接运行编译产物：

```sh
node dist/cli.js --data ../../tmp/my-model-demo --token-margin-multiplier 1.1 --token-margin-reserve 256
```

新对话请使用**尚不存在**的 `--data` 目录；示例会以仅所有者可访问的权限创建它。正常 `/exit` 或输入结束后，仍用相同路径继续。既有目录只有在认证会话及耐久日志可读、可对账时才接受；来源未知的未完工作会拒绝。也可将密钥放在仅所有者可读的文件中，通过 `--key-file /absolute/private/key` 传入路径；不要在命令行传密钥值。该文件须为 0600 权限且只包含密钥原始字节，不解析 `.env` 格式；文件末尾一个换行会被忽略。密钥通过真实加密副本发布成功后，正常重启可省略环境变量和 `--key-file`；再次提供密钥会通过真实凭据发布 API 替换。

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
You> /models
* deepseek/deepseek-v4-pro-0813 [official] legal
  deepseek/deepseek-v4.1-flash [official] legal
You> /model deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Effective: deepseek/deepseek-v4.1-flash (session, official)
You> What did I ask?
Assistant> You asked me to say hello.
Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7
You> /history
user: Say hello.
assistant: Hello!
user: What did I ask?
assistant: You asked me to say hello.
You> /exit
Closed. Start again with the same --data path to resume.
```

上面的数值仅作示意；回答正文、token 用量和美元费用来自上游实际响应。每次提交都可能产生 OpenRouter 费用；`/models`、`/model`、`/history` 与 `/help` 不发送模型 HTTP 请求，也不产生模型调用费用。每个模型响应耐久结算后（包括失败响应），终端重新读取此已认证会话的模型响应历史，显示累计输入、输出、缓存 token 和实际美元费用。缺失值会明确显示为 `known + N unknown`，并标为 `incomplete`；不估算，也不把未知计为零。使用同一数据路径重启后累计值恢复。模型失败响应仍会耐久落盘；终端仅显示通用失败提示，关闭后返回非零状态，不打印上游错误正文。不会自动重试或回退。未知斜杠命令在本地拒绝。调用期间 Ctrl+C 请求**系统停止**并等待实际结算和应用关闭；它不是耐久的用户中断操作。拒绝、提交未知或关闭未完成都会显式显示。不要自动清空数据或重发状态未知的调用。

数据目录含 SQLite 状态、JSONL 会话历史、生成的签名密钥、副本加密密钥，以及保存本地示例账号密码的 `demo-state.json`。保持整个目录私有；需要保留历史时一起备份。OpenRouter 密钥由加密副本保存，不以明文写入示例元数据。首次准备中断会保持“未完成”标记，不静默重放。本示例仅演示 no-Run 子集；不声称实现完整 Session／Inbound／Agent Loop、所有官方模型、通用 Run 失败历史、交互式恢复命令或模型认证。

公共根入口还导出 `createAcceptanceApplication`、配置与结果类型及固定阶段 fiber 名，供开发消费者使用。装配拥有 Cordis Context 和生命周期。`currentTime()` 只读取它已有的租约 Clock，供示例的消息与调用时间使用；时钟不可用则禁止发送。`AcceptanceHooks` 与 `developmentTransport` 是可信测试控制，不交给租户输入。仅认证阶段不发送模型请求。

程序消费者可通过 `startServiceCall(actor, session, { user, parameters, host, observer? })` 提交完整且已校验的 `UserMessage`，包括图片块。装配在打开调用前原样耐久追加消息，由所选模型和传输检查兼容性。本地受控 TLS 测试覆盖两轮真实 Flash 服务调用、两张不同 PNG、持久 JSONL 历史与第二轮完整线上请求。交互命令行仍只接收文本；此入口不增加附件命令语法、工具执行或 Run。

可信部署可提供借用的 `modelRequest.assetRegistry`（`AssetRegistryService.lookup` 端口）。此时 `startServiceCall` 可带 `tools: ModelToolName[]`，由运行时在该会话的真实注册表中解析；缺注册表而给出非空工具名单则返回 unavailable。外部工具结果写方在完整模型工具调用已经持久化后，可用 `appendServiceToolResult(actor, session, { message, host })` 提交已校验的 `ToolMessage`。装配先核当前身份、宿主归属及完整耐久前缀中的配对，再做一次条件追加；不执行工具，也不虚构 Run。借用注册表的所有者须保持它存活直到应用关闭；命令行不配置此端口。本地受控 TLS 测试覆盖真实注册表／清单／求值输入填表、工具声明、助手调用和响应持久化、配对结果、下一轮线上历史、拒绝分支和关闭。

本地检查：`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`，以及从仓库根运行 `python3 examples/model-invocation-minimal-demo/tests/pty-check.py`。测试使用本地受控 TLS 端点，不消费真实生产密钥。服务、选择、观察端、恢复和校准映射依据见 [RT10](../../.meta_harness/design/spec/capabilities/model-request-runtime/v10/contract.md)、[D107](../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/decision.md) 和[runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)；持久响应语义见 [MR9](../../.meta_harness/design/spec/data/model-response/v9/contract.md)。

此前统一服务装配已有[真实 OpenRouter PTY 三轮有界运行证据](../../.meta_harness/design/record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md)。本次模型切换修订只在本地受控 TLS 与 PTY 下验证，尚无跨模型付费请求认证。

### 本机工程日志

示例先完成真实认证，分别打开仅属主可访问的本机与已核租户 JSONL collector，再在同一 Cordis Context 中激活模型请求 fibers。程序装配时，`createAcceptanceApplication(...).ready` 只准备身份与会话日志访问；认证并打开两个诊断 owner 后，才调用 `activateModelRequest(actor, diagnostics, diagnostics.transports)`。该参数提供 `local` 与 `tenant` 句柄。激活失败不会开放模型准入。

每次构造 transport 前先预留代际。注册表只借用绑定本机 collector 和固定 `transport:<generation>` 执行标识的 record 端口；注册与退役事件由真实注册表产生。确认未取得资源的构造中止会留下代际编号缺口；资源状态未知时保留预留名额。这些事件不进入租户日志。service 的 `inspect()` 分别报告注册表投递失败与拒收，不与网络诊断或 collector health 相加；保留的终态快照也保留这两项原值。

诊断墙钟读取 `@omne-harness-lite/clock` 导出的宿主时间源，在应用租约业务 Clock 关闭后仍供保留读句柄使用；时钟不可读或倒退时，保留期查询返回不可用。

`openDemo(...).diagnostics.tenant` 与 `.local` 向受信本机宿主提供有界 `query`、`exportPage` 和 `health`。`close()` 先停止业务，再关闭诊断写端，返回 `complete`、`businessComplete`、诊断关闭结果和 transport 健康状态；未完成时保留同一 owner 并重试。关闭后只读句柄仍可用。这些工程记录与会话历史分离。

工程日志读句柄在真实 Cordis 模型贡献热卸载和应用关闭后仍可使用。卸载先使注册进入退役，再等待在途调用宿主引用实际停止；仅发起卸载不代表已完成。若业务关闭后诊断 sink 仍在执行，关闭结果仍为未完成并报告待处理数量；等真实 sink 结束后，重试同一 owner。接受、写入、刷盘是不同水位：同步失败不能声称已刷盘，也不会撤销已持久化的会话回复。

受信程序宿主可通过 `DemoDiagnosticConfig.journalFileSystem` 为两份工程日志提供文件系统，省略时使用 Node 文件系统。此入口用于开发故障注入和本地嵌入，CLI 不提供覆盖参数。诊断写入或同步失败时，业务回复保留在独立的会话日志中，关闭结果明确报告受影响的诊断组件。

计量诊断只保存封闭投影：模式、回退、精度、预测与准入 tokens、有符号贡献、安全的 basis 修订及保留的来源前缀摘要，不包含 `configuration.values`。journal 在异步写入前取得冻结的自有副本，重开、查询和导出使用相同校验。collector 的 `planning` 阶段耗时涵盖完整规划边界及诊断投影，不能解释为纯 tokenizer 耗时。估算值不进入累计实际用量和账单。

`createDemoDiagnosticConfig` 明确示例的限额；独立装配调用者可提供自己的完整 `DemoDiagnosticConfig`。当前、构造中、仍存活的旧代际与终态 transport 快照共用一个保留上限（示例配置为四）。新构造先预留容量，必要时淘汰终态快照；若上限被活跃 owner 占满则拒绝新构造。TTL 物理删除仅在 owner 活跃或再次打开维护时执行，不承诺进程缺席期间定时清理。

```ts
import type { DemoConversation } from '@omne-harness-lite/model-invocation-minimal-demo'

export async function closeAndReadDiagnostics(demo: DemoConversation) {
  const closed = await demo.close()
  const tenant = demo.diagnostics.tenant
  const page = await tenant.query({ scope: tenant.scope, limit: 32, maxBytes: 65_536 })
  return { closed, page, health: tenant.health() }
}
```

`createDiagnosticJournal(config)` 在私有根下独占创建新的 collector 目录；`openDiagnosticJournalReader(config)` 在关闭或重启后只读重开。显式提供完整 `DiagnosticJournalConfig`，包括 scope、时钟、调度、保留策略和查询／导出界限。此提供者可独立使用，也已通过诊断装配接入默认 CLI。

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

查询和 `exportPage(query, { maxRecords, maxBytes })` 必须传完全相同的 scope。空日志的 `through.sequence='0'` 固定空快照，不是记录身份。游标过期、损坏、超时与并发满有明确结果。TTL 清理只在所有者活跃时运行，进程退出后不会继续。保留健康面同时报告条数和字节，删除失败或 I/O 尚未结束不算空间释放。这是工程日志，与会话历史分开。

发送结果中的 `released` 只描述当次停止尝试。终端回调仍在运行时它为 false；回调实际停止后，显式重试 `close()` 才可能完成，主管还会等待 worker 真正退出。关闭准入后，已承认工作仍可在 Clock 存活期间通过 `currentTime()` 读取时间；fiber 实际卸载后返回 unavailable。

主管的受信故障控制可保留已完成的旧 worker 回复，再向后继请求重放发生 ID 冲突的包；原代际检查仍会阻止错误交付。`inspect().nativeIpcBackpressureObserved` 反映 Node 实际 IPC send 缓冲是否施加过背压。这些控制用于本地恢复测试，不是租户操作。

## 开发用 runner 宿主

`createAcceptanceApplication()` 返回的本地应用另提供
`runExtensionPass(actor, session, request)`，用于显式给入的开发扩展。
`DemoRunnerRequest` 复用 runner 包已有的 pass、chain 和非存储端口。
使用哪些端口，就需要给入对应的真实执行或等待来源；`isActive()` 的结果
不证明 Run 或等待卡片事实。该入口不会注册产品链，也不会增加模型命令。

应用负责验证参与者与会话，并提供共享 JSONL 的绑定、结论写入、提醒读取和
写入，以及物理任务所有者。调用者不能替换这些存储端口，也不能自行宣称
原写入者已停止。`subjectForCandidate` 为每条结论提供原始的定位 subject，
包含嵌套 pass；runner adapter 会验证二者的关系。
runner 服务 adapter 只借用历史读取器的 `read` 能力；读取器及其 `close()`
仍由应用 bootstrap 持有和管理。

始终等待 `app.close()`。它先关闭 runner 准入并取消 pass，保留仍在执行的
贡献代码，停止其他共享日志消费者，再关闭真实日志。未知写入只能在对同一
日志完成 SL3 恢复准入、读取原键后解决。旧写入者退出情况仍未知时，关闭仍
未完成；仅清除 I/O 故障不意味着原写入者可以安全复用。不要把
`complete: false` 报成正常关闭。

可执行示例覆盖真实认证调用、提醒持久化、重放与关闭后重开，以及本地文件
系统故障注入：

```sh
# 在仓库根目录执行；不需要模型凭据，不产生付费请求。
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/runner-host.spec.ts --maxWorkers=1
```

独立的 `tests/openai-pro-images-service.spec.ts` 对三个 GPT-5.6 Pro 绑定及 GPT-6 Astra Pro 各做三轮真实持久服务本地 TLS 检查，保留图片历史与上游原 usage/cost；输入观测仍为 `scope_unknown` 时逐轮完整**估算**，并验证超限余量在零 HTTP 下拒绝。运行：`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/openai-pro-images-service.spec.ts`。受控响应不认证真实 Pro 图片预处理或 OpenRouter 接受行为。

`tests/google-effort-service.spec.ts` 对两个 Google Flash 定义的 low／medium／high effort 分别执行三轮持久服务本机 TLS，保留可见历史与响应原 usage/cost，并验证超限余量零 HTTP 拒绝。运行 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/google-effort-service.spec.ts --maxWorkers=1`。合成响应只验证服务装配，不认证 Gemini 计量准确性或真实路由接受行为。

`tests/xai-effort-service.spec.ts` 覆盖两个 Grok 定义的 low／medium／high effort，分别验证三轮持久本机 TLS 及超限余量零 HTTP 拒绝。运行 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/xai-effort-service.spec.ts --maxWorkers=1`。这验证当前服务组合与上游原计量保留；合成响应不认证实际 effort 精度、图片支持或不透明回放。

`tests/zai-prime-effort-service.spec.ts` 在已声明的 5m／last_message 缓存配置下，验证 Prime low／high／max 的三轮持久本机 TLS 文本交互与超限余量零 HTTP 拒绝。运行 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/zai-prime-effort-service.spec.ts --maxWorkers=1`。这不认证真实 effort 精度或缓存保留；历史思考仍在当前官方计量器支持域之外。

`tests/openai-sol-luna-images-service.spec.ts` 覆盖 `mp4-15` 的 Sol/Luna 及对应 Pro：三轮持久调用保留旧图片，基础型号复用合法响应校准，Pro 保持 `scope_unknown` 下全量计量。恰好 4 MiB 的有效 PNG 场景要求经服务原样发送；4 MiB + 1 字节及配置 token 余量超限要求零 HTTP。该大历史测试显式配置结算保留数据 16 MiB、结算窗口 60 秒；demo 默认部署仍为 1 MiB／5 秒，编程接口的图片消费者须按保留的会话前缀配置 `modelRequest.settlement.contention.limits`。模型图片上限不会覆盖这项独立运行预算。运行 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/openai-sol-luna-images-service.spec.ts --maxWorkers=1`。图片沿现有编程接口的用户消息进入，不增加 CLI 附件语法；合成响应仅验证组合，不认证私有预处理或实机型号完整交付。

沿现有配置接口覆盖程序化部署预算（按自己的负载选择有限值）：

```ts
// config is the result of createDemoConfig(...).
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
const app = createAcceptanceApplication(imageConfig, { stage: 'modelRequest' })
```

`tests/openai-output-history-service.spec.ts` 对三个 GPT-5.6 非 Pro 型号做三轮持久本机 TLS：中间回复保留已知 O、输入用量未知，下一轮分别复用更早输入锚或改变 envelope 后全量覆盖两个历史组。运行 `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/openai-output-history-service.spec.ts --maxWorkers=1`。上游原 usage/cost 与密文不改；O+0 是估算，不是上游计量等式。
