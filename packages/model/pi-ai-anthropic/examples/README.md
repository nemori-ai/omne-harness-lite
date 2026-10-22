# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

本目录有两个示例。两个示例都经 OpenRouter 发出真实请求，共用 [support.ts](support.ts) 中每一轮的步骤。示例只从公开入口导入：本包与 `@omne-harness/pi-ai-openai` 的根入口、`@omne-harness/pi-ai-transport`、`@omne-harness/model-contract`、`@omne-harness/model`、`@omne-harness/stream-arrival` 与 `@omne-harness/message`。本包源码不导入 `pi-ai-openai`，只有示例和测试把它作为开发依赖使用。

每一轮按以下步骤进行：

1. 脚本从 `HTTPS_PROXY` 取得代理。没有该变量时，脚本以 `HTTPS_PROXY is not set` 失败，不发出请求。
2. 脚本从官方档案函数取得档案与供应商，凭据为 `{ kind: 'factory' }`。
3. 脚本经 `composeFamilies` 的 `acquire` 取得绑定，调用 `rules.plan` 固定参数采用与表示，组成带 `declarations` 的 `FixedModelRequest`，然后释放绑定。Model 的请求准备归父卡 4.2，所以示例手工完成这一步。
4. 脚本用 `createPiTransport` 建立传输。路由为 `openrouter`，结束标记为 `[DONE]`。凭据槽给占位值，代理把它换成真实凭据。
5. 脚本用 `@omne-harness/model` 的 `executeModel` 执行一次，打印文本、是否有推理状态、用量、账目位置与终止。

### anthropic-request.ts

[anthropic-request.ts](anthropic-request.ts) 请求 `anthropic/claude-opus-5.5` 一次，推理参数为 `low`。该记录没有前缀规则。请求的历史中有一轮用数据写出的工具调用：assistant 消息只有工具调用，没有推理状态，工具结果没有内容。这一轮不能接续，推理仍然开启：

- `rules.plan` 按请求记下推理参数 `low`，打印 `parameter: reasoning-effort "low"`，行尾没有 `(requested ...)`；
- 请求体写 `reasoning.effort: "low"`；
- 事实中没有 `reasoning-disabled` 诊断。

2026-10-22 经代理实测：网关接受这样的请求。`claude-opus-5.5` 拒绝 `reasoning.enabled: false`，所以本例不再演示降级。

本包记录用 parts 形式写内容，所以只有工具调用的 assistant 消息与没有内容的工具结果都写成空列表。请求还带一张 16×16 的 PNG 图片（`detail: 'auto'`）与停止序列。思考块数与推理状态由上游决定，下面的值只是示例。

```text
model: anthropic/claude-opus-5.5
parameter: max-output-tokens "1024"
parameter: stop ["\n\nEND"]
parameter: reasoning-effort "low"
text: "..."
thinking blocks: 1
tool calls: 0
reasoning state: yes (1 part)
usage: input=... output=... cache-read=... cache-write=... ...
cost: ... openrouter-credit
place: openrouter/Anthropic
termination: completed stop
```

### cross-family-history.ts

[cross-family-history.ts](cross-family-history.ts) 在同一段历史中交替请求 `openai/gpt-5.6-luna` 与 `anthropic/claude-opus-5.5`，共四轮：OpenAI、Anthropic、OpenAI、Anthropic。OpenAI 的推理参数为 `high`，Anthropic 的推理参数为 `low`，每轮最多输出 2048 个词元。每轮的问题需要少量推理。2026-10-22 的实测中，这两个型号在这两个推理参数下多数时候返回推理状态，但是否返回由上游决定。示例在上述步骤之外再做三件事：

1. 每轮发出前，脚本用 `projectReplay` 打印每条 assistant 消息的处理：带上哪些推理状态部件，略去哪些部件，以及诊断。`replay summary:` 行列出带上与略去状态的轮次。
2. 每轮完成后，脚本打印 `reply state: round <轮次> yes` 或 `reply state: round <轮次> no`，说明这一轮的回复是否带有推理状态。
3. 脚本用 `assembleStream` 把事实组成 assistant 消息，追加到历史。`finish` 的 `replay` 取档案声明的 `produces` 作 `scope`，取 `replayFormatsOf` 的 `produces` 作 `format`。按契约，独立执行时由调用方组成消息。

某一轮的 `replay summary:` 行由前面各轮的回复决定：

- 同一家族的回复带有推理状态时，该轮次列在 `carried` 中；
- 另一家族的回复带有推理状态时，该轮次列在 `omitted` 中，并有 `replay-omitted` 诊断；
- 没有推理状态的回复不出现在两个列表中。

每轮的回复都带有推理状态时，`replay summary:` 行为：

```text
replay summary: carried [] omitted []
replay summary: carried [] omitted [1]
replay summary: carried [1] omitted [2]
replay summary: carried [2] omitted [1, 3]
```

每轮最后一行是 `termination:`。某一轮没有以 `completed` 结束时，脚本停止后续各轮，退出码为 1。

运行前提：

1. Node 24 或更高版本。
2. `HTTPS_PROXY` 指向为 OpenRouter 请求加入凭据的代理。示例不读取也不保存任何秘密。
3. 先构建本包及其依赖：`pnpm --filter @omne-harness/pi-ai-anthropic... -r run build`。该命令也构建 `pi-ai-openai`、`model` 与 `stream-arrival`。根入口解析到构建产物。
4. 在本包目录运行 `node --experimental-strip-types examples/anthropic-request.ts` 与 `node --experimental-strip-types examples/cross-family-history.ts`，或运行 `pnpm --filter @omne-harness/pi-ai-anthropic examples`。

文本与用量每次不同。`examples` 脚本不属于 `test`。慢层用例 [tests/examples.spec.ts](../tests/examples.spec.ts) 只在 `OMNE_LIVE_TESTS=1` 时在子进程中运行两个示例，否则在运行时跳过。该用例核对以下各项：

- `anthropic-request.ts` 以 `completed` 结束，推理参数行为 `parameter: reasoning-effort "low"`，没有 `reasoning-disabled` 行；
- `cross-family-history.ts` 的四轮都以 `completed` 结束。用例按 `reply state:` 行推出每轮应有的 `replay summary:` 行，并与打印的行逐行比较；
- 第 1 至 3 轮中，两个家族各至少有一轮回复带有推理状态。否则用例失败，并说明上游没有返回推理状态，所以略去与带回的路径没有得到检验。

turbo 的严格环境模式会去掉 `OMNE_LIVE_TESTS` 与 `HTTPS_PROXY`，所以实跑时在本包目录直接运行 `OMNE_LIVE_TESTS=1 pnpm run test:slow`。
