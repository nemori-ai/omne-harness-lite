# 模型调用最小示例

这是一个可在终端交互、真实流式输出且持久化的多轮模型对话示例。它使用真实本地账号、组织资格、会话归属、当前求值输入、官方模型档案、加密凭据副本、OpenRouter 传输和 JSONL 会话日志。原 `model-request-acceptance` 装配迁入此示例；可复用能力仍在 `packages/`。

示例显式选择 **`deepseek/deepseek-v4-pro-0813`**，固定供应商路由 **`deepinfra/fp8`**，禁止回退。每轮只用文本、无工具、无 Run，参数为 `reasoningEffort: low` 和 `maxOutputTokens: 1024`。回答实时流到终端，完整回复与模型响应在同一耐久批次结算后才进入下一轮。`/history` 读真实会话日志。使用相同数据路径重启会重新认证并恢复原会话，不重放注册、来源发布或模型选择。

## 运行

采用仓库根目录声明的 Node 与 pnpm 版本，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='你的实际 OpenRouter 密钥'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo"
```

首次运行的 `--data` 必须是**尚不存在**的目录；示例会以仅所有者可访问的权限创建它。正常 `/exit` 或输入结束后，仍用相同路径继续。也可将密钥放在仅所有者可读的文件中，通过 `--key-file /absolute/private/key` 传入路径；不要在命令行传密钥值。该文件须为 0600 权限且只包含密钥原始字节，不解析 `.env` 格式；文件末尾一个换行会被忽略。密钥通过真实加密副本发布成功后，正常重启可省略环境变量和 `--key-file`；再次提供密钥会通过真实凭据发布 API 替换。

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
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

上面的数值仅作示意；回答正文、token 用量和美元费用来自上游实际响应。每次提交都可能产生 OpenRouter 费用。每个模型响应耐久结算后（包括失败响应），终端重新读取此已认证会话的模型响应历史，显示累计输入、输出、缓存 token 和实际美元费用。缺失值会明确显示为 `known + N unknown`，并标为 `incomplete`；不估算，也不把未知计为零。`/history` 只读消息，不增加累计值；使用同一数据路径重启后累计值恢复。模型失败响应仍会耐久落盘；终端仅显示通用失败提示，关闭后返回非零状态，不打印上游错误正文。不会自动重试或回退。`/help` 显示命令。调用期间 Ctrl+C 请求**系统停止**并等待实际结算和应用关闭；它不是耐久的用户中断操作。拒绝、提交未知或关闭未完成都会显式显示。不要自动清空数据或重发状态未知的调用。

数据目录含 SQLite 状态、JSONL 会话历史、生成的签名密钥、副本加密密钥，以及保存本地示例账号密码的 `demo-state.json`。保持整个目录私有；需要保留历史时一起备份。OpenRouter 密钥由加密副本保存，不以明文写入示例元数据。首次准备中断会保持“未完成”标记，不静默重放。本示例不声称实现完整 Session／Inbound／Agent Loop、十三个完整 runtime 操作、所有官方模型、自动恢复或模型认证。

公共根入口还导出 `createAcceptanceApplication`、配置与结果类型及固定阶段 fiber 名，供开发消费者使用。装配拥有 Cordis Context 和生命周期。`currentTime()` 只读取它已有的租约 Clock，供示例的消息与调用时间使用；时钟不可用则禁止发送。`AcceptanceHooks` 与 `developmentTransport` 是可信测试控制，不交给租户输入。仅认证阶段不发送模型请求。

本地检查：`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`、`pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`。测试使用本地受控 TLS 端点，不消费真实生产密钥。语义依据见 [D076](../../.meta_harness/design/record/decisions/model-runtime-delivery-adoption/decision.md)、[D092](../../.meta_harness/design/record/decisions/model-auth-bootstrap-adoption/decision.md)、[RT5](../../.meta_harness/design/spec/capabilities/model-request-runtime/v5/contract.md)、[MR5](../../.meta_harness/design/spec/data/model-response/v5/contract.md) 和[装配 realization](../../.meta_harness/design/realization/retired/model-request-acceptance/README.md)。
