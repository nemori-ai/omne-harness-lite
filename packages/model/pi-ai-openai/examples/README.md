# examples

本目录承载面向真实公开入口的使用示例。

## 允许的内容

可运行的示例代码与说明。

## 边界

示例只用公开入口，并写明运行前提。示例不代替测试或规格。

## 维护

公开入口变化时，同步示例并确认它仍能运行。

## 本包事实

[openai-request.ts](openai-request.ts) 经 OpenRouter 请求一个 OpenAI 型号一次。型号名写在脚本顶部，现为 `openai/gpt-5.6-luna`，推理参数为 `low`。[support.ts](support.ts) 放每一轮共用的步骤。示例只从公开入口导入：本包根入口、`@omne-harness/pi-ai-transport`、`@omne-harness/model-contract` 与 `@omne-harness/model`。

一次请求按以下步骤进行：

1. 脚本从 `HTTPS_PROXY` 取得代理。没有该变量时，脚本以 `HTTPS_PROXY is not set` 失败，不发出请求。
2. 脚本从 `officialOpenAiProfiles` 取得官方档案与供应商，凭据为 `{ kind: 'factory' }`。
3. 脚本经 `composeFamilies` 的 `acquire` 取得绑定，调用 `rules.plan` 固定参数采用与表示，组成带 `declarations` 的 `FixedModelRequest`，然后释放绑定。Model 的请求准备归父卡 4.2，所以示例手工完成这一步。
4. 脚本用 `createPiTransport` 建立传输。路由为 `openrouter`，结束标记为 `[DONE]`。凭据槽给占位值，代理把它换成真实凭据。
5. 脚本用 `@omne-harness/model` 的 `executeModel` 执行一次，打印结果。

请求的历史中有一轮用数据写出的工具调用：assistant 消息只有工具调用，工具结果没有内容。OpenAI 记录用 compact 形式写内容，所以这两条消息的内容都写成空字符串。最后一条 user 消息带一张 16×16 的 PNG 图片，请求体写 `detail: 'auto'`。

运行前提：

1. Node 24 或更高版本。
2. `HTTPS_PROXY` 指向为 OpenRouter 请求加入凭据的代理。示例不读取也不保存任何秘密。
3. 先构建本包及其依赖：`pnpm --filter @omne-harness/pi-ai-openai... -r run build`。根入口解析到构建产物。
4. 在本包目录运行：`node --experimental-strip-types examples/openai-request.ts`，或运行 `pnpm --filter @omne-harness/pi-ai-openai examples`。

预期输出依次为：`model:` 行，每个参数采用一行 `parameter:`，然后是 `text:`、`thinking blocks:`、`tool calls:`、`reasoning state:`、可能的 `diagnostic:` 行、`usage:`、`cost:`、`place:`，最后一行 `termination:`。文本与用量每次不同。`reasoning state:` 取决于上游是否返回加密推理项。成功时最后一行是 `termination: completed stop`，退出码为 0。终止不是 `completed` 时退出码为 1。

```text
model: openai/gpt-5.6-luna
parameter: max-output-tokens "1024"
parameter: reasoning-effort "low"
text: "..."
thinking blocks: 0
tool calls: 0
reasoning state: yes (1 part)
usage: input=... output=... ...
cost: ... openrouter-credit
place: openrouter/OpenAI
termination: completed stop
```

`examples` 脚本不属于 `test`。慢层用例 [tests/examples.spec.ts](../tests/examples.spec.ts) 只在 `OMNE_LIVE_TESTS=1` 时在子进程中运行示例，否则在运行时跳过。turbo 的严格环境模式会去掉 `OMNE_LIVE_TESTS` 与 `HTTPS_PROXY`，所以实跑时在本包目录直接运行 `OMNE_LIVE_TESTS=1 pnpm run test:slow`。
