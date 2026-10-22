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

[anthropic-request.ts](anthropic-request.ts) 请求 `anthropic/claude-opus-5.5` 一次，推理参数为 `low`。该记录的前缀规则是 `last-tool-turn`。请求的历史中有一轮用数据写出的工具调用：assistant 消息只有工具调用，没有推理状态，工具结果没有内容。最后一个用过工具的 assistant 消息不能接续，所以：

- `rules.plan` 把推理参数记为 `none`，打印 `parameter: reasoning-effort "none" (requested reasoning-effort "low")`；
- 请求体写 `reasoning.enabled: false`；
- 事实中有一条 `reasoning-disabled` 诊断，原因为 `foreign-prefix`。

本包记录用 parts 形式写内容，所以只有工具调用的 assistant 消息与没有内容的工具结果都写成空列表。请求还带一张 16×16 的 PNG 图片（`detail: 'auto'`）与停止序列。

```text
model: anthropic/claude-opus-5.5
parameter: max-output-tokens "1024"
parameter: stop ["\n\nEND"]
parameter: reasoning-effort "none" (requested reasoning-effort "low")
text: "..."
thinking blocks: 0
tool calls: 0
reasoning state: no
diagnostic: {"kind":"reasoning-disabled","reason":"foreign-prefix"}
usage: input=... output=... cache-read=... cache-write=... ...
cost: ... openrouter-credit
place: openrouter/Anthropic
termination: completed stop
```

### cross-family-history.ts

[cross-family-history.ts](cross-family-history.ts) 在同一段历史中交替请求 `openai/gpt-5.6-luna` 与 `anthropic/claude-sonnet-5`，共四轮：OpenAI、Anthropic、OpenAI、Anthropic。推理参数为 `low`。示例在上述步骤之外再做两件事：

1. 每轮发出前，脚本用 `projectReplay` 打印每条 assistant 消息的处理：带上哪些推理状态部件，略去哪些部件，以及诊断。`replay summary:` 行列出带上与略去状态的轮次。
2. 每轮结束后，脚本用 `assembleStream` 把事实组成 assistant 消息，追加到历史。`finish` 的 `replay` 取档案声明的 `produces` 作 `scope`，取 `replayFormatsOf` 的 `produces` 作 `format`。按契约，独立执行时由调用方组成消息。

上游在每轮都返回推理状态时，`replay summary:` 行为：

```text
replay summary: carried [] omitted []
replay summary: carried [] omitted [1]
replay summary: carried [1] omitted [2]
replay summary: carried [2] omitted [1, 3]
```

第 2、3 轮略去另一家族的状态，并有 `replay-omitted` 诊断。第 3、4 轮带回本型号在第 1、2 轮产出的状态。每轮最后一行是 `termination:`。某一轮没有以 `completed` 结束时，脚本停止后续各轮，退出码为 1。

运行前提：

1. Node 24 或更高版本。
2. `HTTPS_PROXY` 指向为 OpenRouter 请求加入凭据的代理。示例不读取也不保存任何秘密。
3. 先构建本包及其依赖：`pnpm --filter @omne-harness/pi-ai-anthropic... -r run build`。该命令也构建 `pi-ai-openai`、`model` 与 `stream-arrival`。根入口解析到构建产物。
4. 在本包目录运行 `node --experimental-strip-types examples/anthropic-request.ts` 与 `node --experimental-strip-types examples/cross-family-history.ts`，或运行 `pnpm --filter @omne-harness/pi-ai-anthropic examples`。

文本与用量每次不同。`examples` 脚本不属于 `test`。慢层用例 [tests/examples.spec.ts](../tests/examples.spec.ts) 只在 `OMNE_LIVE_TESTS=1` 时在子进程中运行两个示例并核对上面的行，否则在运行时跳过。turbo 的严格环境模式会去掉 `OMNE_LIVE_TESTS` 与 `HTTPS_PROXY`，所以实跑时在本包目录直接运行 `OMNE_LIVE_TESTS=1 pnpm run test:slow`。
