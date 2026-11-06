# tests/e2e

本目录承载端到端旅程：`createMcp`（`@omne-harness/mcp`）加本包的 `createLocalTransportFactory`，对真实的 MCP 参考服务端走一遍同一条旅程。

## 允许的内容

旅程用例（`*.spec.ts`，文件头写 `@module-tag slow`）、用例的装配、目标表，以及起非 Node 进程的夹具。夹具复用 `../fixtures/` 的进程句柄、子进程登记与 `everythingHttp`，只导入，不改。

## 边界

`createMcp` 的五个需求端口里，`adoption`、`eligibility`、`credentials`、`store` 是契约 `@omne-harness/mcp-contract/testing` 的内存替身，`landing` 起真实进程。另两个端口：`transports` 是本包的真实工厂，`checkOutput` 对任何值答 `conforms`，它不代表 JSON Schema 引擎，旅程调用的工具也都没有 `outputSchema`。

旅程是一张表，七步各有「适用」列：

| 步  | 动作                                                                  | 期望的结局种类                                                                            |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S1  | `discovery.refresh`，再读目录与协商的修订                             | `published`                                                                               |
| S2  | `invoker.invoke` 一个只读工具                                         | `complete`                                                                                |
| S3  | `invoke` 一个服务端以 `isError: true` 答的调用                        | `toolError`                                                                               |
| S4  | `invoke` 一个要求输入的工具，再 `continueWithInput`                   | `inputRequired`，然后 `complete`                                                          |
| S5  | `invoke` 一个以任务答的工具，`queryTask` 到 `completed`，`taskResult` | `task`，`completed`，`complete`                                                           |
| S6  | `invoke` 一个长时工具，等第一条进度通知后 `cancel`                    | `cancel` 答 `signalled`，`invoke` 答 `unknown`（`abandoned`）                             |
| S7  | `connections.release`                                                 | `released`；stdio 目标的 `process` 是 `root-only`，HTTP 目标是 `no-process`；没有遗留进程 |

五个目标各走适用的步。每个目标在 `targets.ts` 登记期望的步号表，用例对实际跑过的步号断言相等。

| 目标                               | 传输            | 协商的修订 | 走的步             | S7 的 `process` |
| ---------------------------------- | --------------- | ---------- | ------------------ | --------------- |
| E-stdio：`server-everything` 2.1.0 | stdio           | 2026-07-28 | S1 至 S7           | `root-only`     |
| E-http：`server-everything` 2.1.0  | Streamable HTTP | 2026-07-28 | S1 至 S7           | `no-process`    |
| E-sse：`server-everything` 2.1.0   | 旧 HTTP+SSE     | 2025-11-25 | S1、S2、S3、S6、S7 | `no-process`    |
| F：`server-filesystem` 2.1.0       | stdio           | 2026-07-28 | S1、S2、S3、S7     | `root-only`     |
| P：`mcp-server-fetch` 2026.10.28   | stdio           | 2026-07-28 | S1、S2、S3、S7     | `root-only`     |

E-sse 的 S4、S5 按修订不适用：旧修订的 `initialize` 不声明客户端能力（契约 `mcp-contract` 的 `legacyInitializeParamsOf`），服务端因此不登记表单输入与任务工具。脚本化传输上的契约用例只作补充覆盖，见 [SPEC](../../SPEC.md#组合与验证)「组合与验证」里该行。F 与 P 没有长时工具，也没有要求输入或任务的工具，不做 S4 至 S6。

S5 选 `simulate-research-query`（`ambiguous: true`）。该工具途中必经 `input_required`，用例断言任务确实经过这一状态并收到答复：这是该工具的前提，换成不问输入的任务工具时 S5 会失败。

S6 选 `trigger-long-running-operation`，参数让它每秒发一条进度通知。用例经 `invoke` 的 `observe` 等到第一条进度通知再 `cancel`，等待有上界；进度通知证明请求已经到达对端。

结局种类只来自可观察的服务答复：测试不读实现的内部状态。

目标 P（`mcp-server-fetch`，Python）不在默认的 `uv sync --locked` 里。用例在 `<仓库根>/.venv/bin/mcp-server-fetch` 不存在时跳过，跳过的名字是 `mcp-server-fetch not installed: run uv sync --locked --group mcp-fixtures`。跳过不是通过。

## 维护

加目标时，在 `targets.ts` 加一项，写明启动方式、预期修订与每步的工具和参数，并在 `JOURNEY` 的 `applies` 里与目标的期望步号表里登记。服务端升级时核对工具名与参数。每个用例结束时核对没有遗留的子进程。两个现代目标的比较用例读两个目标的结局序列：只跑其中一个目标时，这条用例失败。

## 本包事实

文件：`assembly.ts`（端口与 `createMcp` 的装配）、`targets.ts`（目标表）、`command.ts`（按命令起进程的句柄）、`journey.spec.ts`（旅程表与断言）。负责人：本成员的维护者。当前缺口：没有 OAuth 目标；远程服务端不在本目录。
