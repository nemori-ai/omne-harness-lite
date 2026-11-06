# tests/e2e

本目录承载端到端旅程：`createMcp`（`@omne-harness/mcp`）加本包的 `createLocalTransportFactory`，对真实的 MCP 参考服务端走一遍同一条旅程。

## 允许的内容

旅程用例（`*.spec.ts`，文件头写 `@module-tag slow`）、用例的装配、目标表，以及起非 Node 进程的夹具。夹具复用 `../fixtures/` 的进程句柄、子进程登记与 `everythingHttp`，只导入，不改。

## 边界

五个需求端口里，`adoption`、`eligibility`、`credentials`、`store` 是契约 `@omne-harness/mcp-contract/testing` 的内存替身。`landing` 起真实进程。`checkOutput` 对任何值答 `conforms` 并计数：它不代表 JSON Schema 引擎。`transports` 是本包的真实工厂。

旅程是一张表，七步各有「适用」列：

| 步  | 动作                                                                  | 期望的结局种类                                                |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | `discovery.refresh`，再读目录与协商的修订                             | `published`                                                   |
| S2  | `invoker.invoke` 一个只读工具                                         | `complete`                                                    |
| S3  | `invoke` 一个服务端以 `isError: true` 答的调用                        | `toolError`                                                   |
| S4  | `invoke` 一个要求输入的工具，再 `continueWithInput`                   | `inputRequired`，然后 `complete`                              |
| S5  | `invoke` 一个以任务答的工具，`queryTask` 到 `completed`，`taskResult` | `task`，`completed`，`complete`                               |
| S6  | `invoke` 一个长时工具，请求发出后 `cancel`                            | `cancel` 答 `signalled`，`invoke` 答 `unknown`（`abandoned`） |
| S7  | `connections.release`                                                 | `released`，停止范围与目标一致，没有遗留进程                  |

目标与适用的步见 `targets.ts` 和 `journey.spec.ts` 的 `JOURNEY` 表。S4 与 S5 只适用于现代修订上的 `server-everything`：2025-11-25 没有任务扩展，表单输入是服务端发起的请求，本实现不做。F 与 P 没有长时工具，不做 S4 至 S6。结局种类只来自可观察的服务答复：测试不读实现的内部状态。

目标 P（`mcp-server-fetch`，Python）不在默认的 `uv sync --locked` 里。用例在 `<仓库根>/.venv/bin/mcp-server-fetch` 不存在时跳过，跳过的名字是 `mcp-server-fetch not installed: run uv sync --locked --group mcp-fixtures`。跳过不是通过。

## 维护

加目标时，在 `targets.ts` 加一项，写明启动方式、预期修订与每步的工具和参数，并在 `JOURNEY` 的 `applies` 里登记。服务端升级时核对工具名与参数。每个用例结束时核对没有遗留的子进程。MC3-12 的比较读两个现代目标的结局序列：只跑其中一个目标时，这条用例失败。

## 本包事实

文件：`assembly.ts`（端口与 `createMcp` 的装配）、`targets.ts`（目标表）、`command.ts`（按命令起进程的句柄）、`journey.spec.ts`（旅程表与断言）。负责人：本成员的维护者。当前缺口：没有 OAuth 目标；远程服务端不在本目录，兼容读数见任务材料。
