# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 测试文件、测试辅助代码（`memory-line.ts`、`unhandled.ts`）、`model/` 下的探索器与它的负控、`probes/` 下的手工探针，`fixtures/` 下的对端夹具，以及 `e2e/` 下的端到端旅程。

## 边界

快层（`public-entry.spec.ts`、`session.spec.ts`、`lines.spec.ts`）只用内存线路、内存进程句柄与 `fetch` 的替身，不起进程、不开端口。慢层（文件头 `@module-tag slow`：`conformance.spec.ts`、`stdio.spec.ts`、`http.spec.ts`、`e2e/journey.spec.ts`）起真实子进程与本机 HTTP 服务端：A 层是真实线路上的脚本化对端，B 层是 SDK 的真实服务端与 `server-everything`。A 层与 B 层的三个慢层文件在每个用例结束时核对没有遗留的子进程与监听端口；`e2e/` 的用例在每个用例结束时核对没有遗留的子进程，HTTP 目标由旅程自己关闭；`vitest.config.ts` 的 setup 文件 `unhandled.ts` 对每个用例文件生效：用例里没人处理的拒绝或未捕获的异常使该用例失败。真实依赖：Node 的 `child_process`、`node:http`、全局 `fetch`、`@modelcontextprotocol/server`、`@modelcontextprotocol/node`、`@modelcontextprotocol/server-everything`、`zod`。`e2e/` 的慢层用例把调用方 `createMcp` 与本包的传输装在一起，对 `server-everything`（三种传输）、`server-filesystem` 与 `mcp-server-fetch`（Python）走同一条旅程；它是本包与调用方的真实组合的证据，范围见 [e2e/README.md](e2e/README.md)。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。改了会话的等待点或结算次序时，同步 `model/` 的端口替身、性质与 `mutants.ts` 的负控，并用 `node tests/model/mutate.ts` 复跑负控。契约 `TRANSPORT_TABLE` 加行时 `session.spec.ts` 自动覆盖；契约套件加用例时 `conformance.spec.ts` 自动运行，若新用例在真实线路上不适用，把名字与理由加进 `NOT_APPLICABLE`。SDK 升级时核对 `fixtures/sdk/` 的 API。

## 本包事实

测试文件与两层夹具见 [index.md](index.md)。负责人：本成员的维护者。当前缺口：远程对端、TLS 与真实网络失败没有测试；`x-mcp-header` 的剔除只在 A 层验证。
