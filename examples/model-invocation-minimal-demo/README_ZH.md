# 模型调用最小示例

这是一个可在终端交互、真实流式输出且持久化的多轮模型对话示例。它使用真实本地账号、组织资格、会话归属、当前求值输入、官方模型档案、加密凭据副本、OpenRouter 传输和 JSONL 会话日志。原 `model-request-acceptance` 装配迁入此示例；可复用能力仍在 `packages/`。

示例装入 **`deepseek/deepseek-v4-pro-0813`** 与 **`deepseek/deepseek-v4.1-flash`** 两条官方档案，均固定供应商路由 **`deepinfra/fp8`** 并禁止回退。Pro 只是首次会话的显式初选。`/models` 读取当前目录展示列表，`/model` 显示选中和有效路由，`/model <标识>` 耐久切换后续请求的选中路由；不会重建会话或清空历史。上层锁可能让有效路由不同于选中路由，重启后仍读原耐久选择。其他已发布模型定义未随之自动具备可用的档案、适配与输入计量。

模型请求阶段安装 Cordis `modelTransport` 服务，并为每组精确定义与输入计量构件装入可信贡献 fiber。运行时为每次调用取得该服务的固定租约；发布新贡献不会改变旧调用。撤旧先禁止该版本的新取得，再等待租约、HTTPS 读取及回调实际停止。应用关闭先收口运行时，再卸载贡献与传输服务。本机受控 HTTPS 测试覆盖旧调用在途时的 Pro／Flash 贡献更替，也核验无法解释的配置在 HTTP 和模型锚点之前返回 `invalidInput`。这只是进程内热更切片；目录采用与旧版显式撤除仍由调用方负责。

每轮接收文本输入、无工具、无 Run，参数为 `reasoningEffort: low` 和 `maxOutputTokens: 16384`。已认证会话绑定统一的 `createModelRuntime` 服务；服务打开并派发调用，由绑定会话授权且有双重缓冲上限的观察端把流送到终端。每次发送前先登记实际调用宿主，并在物理停止前保留其所有权。装配也提供认证后的恢复对账入口，但交互 CLI 没有恢复命令或自动重发。完整回复与模型响应由示例在同一耐久批次结算后才进入下一轮。每次请求把校验后的完整消息历史（包括先前的推理和媒体块）交给调用层，不加纯文本白名单。可见性和模型兼容遵循公共契约；命令行目前仅提供文本输入。`/history` 读真实会话日志。使用相同数据路径重启会重新认证并恢复原会话，不重放注册或来源发布。


用 `--max-output-tokens <正整数>` 配置每次响应的输出上限，默认 16,384。所选模型的档案仍校验其上限，demo 不会静默截小过大的配置。此额度包含上游计入输出的推理 tokens。使用相同 `--data` 和新上限重启，保留原会话历史。
当前开发格式在每次调用快照中完整携带项目输入上限及上游限制事实。旧开发版本产生的不兼容数据不会自动转换；验证当前版本请显式使用新的 `--data` 目录，原目录保持不动。

两个 token 余量选项均须显式配置。示例用 `ceil(estimatedTokens * 1.1) + 256` 与项目输入上限比较；固定版本的 DeepSeek tokenizer 估算最终输入，余量可调整，不保证与上游实际计数一致。实际 token 用量及费用仍仅采用上游响应。程序调用通过第二个参数配置：`openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?)`。部署的 `modelRequest.transport.retirement` 必须提供正整数 `waitMilliseconds`、`force` 与可替换的 `schedule`；等待超时仍保留资源所有权，不冒称清理完毕。CLI 明确设 `force=false`，撤除等待默认为 10,000 毫秒，可用 `--transport-retirement-wait-ms <正整数>` 调整。

观察队列默认有明确的 256 事件与 262,144 字节上限，程序调用可分别调整这两个正整数。投递诊断及背压不能代替持久历史或结算。

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

首次运行的 `--data` 必须是**尚不存在**的目录；示例会以仅所有者可访问的权限创建它。正常 `/exit` 或输入结束后，仍用相同路径继续。也可将密钥放在仅所有者可读的文件中，通过 `--key-file /absolute/private/key` 传入路径；不要在命令行传密钥值。该文件须为 0600 权限且只包含密钥原始字节，不解析 `.env` 格式；文件末尾一个换行会被忽略。密钥通过真实加密副本发布成功后，正常重启可省略环境变量和 `--key-file`；再次提供密钥会通过真实凭据发布 API 替换。

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

本地检查：`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`，以及从仓库根运行 `python3 examples/model-invocation-minimal-demo/tests/pty-check.py`。测试使用本地受控 TLS 端点，不消费真实生产密钥。服务、选择、观察端和恢复映射依据见 [RT9](../../.meta_harness/design/spec/capabilities/model-request-runtime/v9/contract.md)、[D103](../../.meta_harness/design/record/decisions/model-runtime-host-observer-adoption/decision.md) 和[runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md)；持久响应语义见 [MR8](../../.meta_harness/design/spec/data/model-response/v8/contract.md)。

此前统一服务装配已有[真实 OpenRouter PTY 三轮有界运行证据](../../.meta_harness/design/record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md)。本次模型切换修订只在本地受控 TLS 与 PTY 下验证，尚无跨模型付费请求认证。
