# @omne-harness/mcp-host-local

[English](README.md)

MCP 组的本机宿主成员：契约 `McpTransportFactory` 与 `McpTransport` 的两个真实实现（stdio、Streamable HTTP 含旧 HTTP+SSE 回退）与授权发现的取回。

## 职责与状态

本包把 [`@omne-harness/mcp-contract`](../mcp-contract/README_ZH.md) 的传输端口兑现在真实的进程管道与 HTTP 连接上。调用方是 [`@omne-harness/mcp`](../mcp/README_ZH.md)：它经 `McpTransportFactory.open(material, signal)` 取得传输，再调用 `discover`、`listActions`、`call`、任务操作、`cancelRequest` 与 `close`。本包不起进程、不停进程、不读设置、不取凭据：进程由落点交来，凭据句柄由调用方放在材料里。

| 范围                                                                                         | 状态                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio 传输：按行读写、解析不了的行丢弃、行字节上界、退出窗口、stderr 读出丢弃、T5 的关闭次序 | 已实现，在脚本化对端、SDK 对端与 `server-everything` 上验证                                                                                               |
| Streamable HTTP 传输：JSON 与 SSE 应答、不跟随重定向、再发规则、授权发现、旧修订的会话与 S07 | 已实现，在脚本化对端、SDK bearer 网关、SDK 2025 会话与 `server-everything` 上验证                                                                         |
| 旧 HTTP+SSE 回退：GET 流 + endpoint，作为 HTTP 线路的一种模式                                | 已实现，在脚本化对端与 `server-everything sse` 上验证                                                                                                     |
| 契约传输套件 `mcpTransportConformance()`                                                     | 两种材料各跑一遍；通过、不适用与失败分开计数，不适用的用例与理由在 [SPEC](SPEC.md#组合与验证)                                                             |
| 远程对端、TLS、代理、真实网络失败                                                            | 未验证                                                                                                                                                    |
| 与 `@omne-harness/mcp` 的真实组合                                                            | `tests/e2e/` 在本机五个目标（`server-everything` 的三种传输、`server-filesystem`、`mcp-server-fetch`）上验证；范围与未覆盖项见 [SPEC](SPEC.md#组合与验证) |
| 技术接受                                                                                     | 尚未取得；本包是候选实现                                                                                                                                  |

## 使用

```ts
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'

const factory = createLocalTransportFactory({
  clientInfo: { name: 'my-host', version: '1.0.0' },
  probeTimeoutMs: 2_000, // stdio 上 server/discover 的等待时限
})

// material 来自调用方：stdio 带落点交来的 ProcessHandle，Streamable HTTP 带连接目标与可选的凭据句柄
const opened = await factory.open(material, signal)
if ('failure' in opened) throw new Error(opened.failure.kind)
const transport = opened.ok
const identity = await transport.discover()
// … listActions、call、getTask、updateTask、getTaskResult、cancelTask、cancelRequest
await transport.close() // 关闭传输；进程由它的持有者停止
```

依赖：`@omne-harness/mcp-contract`（端口与协议函数）、`@omne-harness/json-text`、`@omne-harness/operation-result`、`eventsource-parser`。运行环境：Node ≥ 24，全局 `fetch`（可经 `options.fetch` 注入）。本包是 `module` 变体，没有 Cordis 绑定，见 [docs/cordis.md](docs/cordis.md)。初始化只是建工厂；释放是每个传输的 `close()`，没有全局状态。

## 契约

公开类型在 [src/index.ts](src/index.ts)（`createLocalTransportFactory`、`LocalTransportOptions`）；端口类型是契约的 `@omne-harness/mcp-contract/provider`，本包不导出 SDK 的类型。类型以外的行为由 [SPEC.md](SPEC.md) 拥有：它写明本包兑现契约的哪些条款、本包自定的事项、说明怎样兑现的 H 条目、与官方 SDK 的复用关系，以及与协议和契约的偏离。选项不合法时 `createLocalTransportFactory` 抛出 `RangeError`；传输方法以 `Outcome` 答复，不 reject。错误、生命周期与资源的拥有者见 SPEC「所有权、失败与生命周期」。

## 设计

一个与线路无关的协议会话（`src/session.ts`）加两条线路（`src/stdio-line.ts`、`src/http-line.ts`）。线路只搬字节并报告线上发生了什么；会话把它翻成契约的线上事件，交给契约根导出的 `classifyWireEvent` 归类，再从契约的决策层取得 T8 行的结论。请求的组成、页的剔除、授权发现、应答的读法与出站消息的文本都调用契约根导出的函数。模块与机制见 [docs/architecture.md](docs/architecture.md)，流程见 [docs/flows.md](docs/flows.md)，对象见 [docs/object-model.md](docs/object-model.md)。

## 配置与运行

配置只有 `LocalTransportOptions`：`clientInfo`（两项非空文本）、`probeTimeoutMs`（正整数，没有缺省）、可选 `fetch`。本包不读环境变量、不写日志、不设自己的网络超时。调用方负责：交来的 `ProcessHandle` 的进程生命周期、凭据句柄的取得与释放、每个传输的 `close()`。本包负责：传输关闭时释放它持有的读写端、计时与在途的 `fetch`。

## 验证

```sh
pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local
pnpm exec vitest run --mode fast                                   # public-entry、session、lines（内存线路）
pnpm exec vitest run --mode slow --typecheck.enabled=false         # conformance、stdio、http（起子进程与本机端口）
```

慢层起子进程与本机 HTTP 服务端（随机端口 20000–59999），每个用例结束时核对没有遗留。SPEC 的 SDK 复用表依据 `tests/probes/` 的探针，探针回答的问题与输出摘录在 [verification/proofs/sdk](verification/proofs/sdk/README.md)。请求生命周期的性质与每条性质的证据见 [SPEC「性质与证据」](SPEC.md#properties)。测试覆盖什么、没有覆盖什么见 [SPEC「组合与验证」](SPEC.md#组合与验证)。测试通过不等于技术接受。

## 维护

T8 的结论，以及两个传输共用的规则（请求的组成、读类再发一次、取消的方式、流断开与授权拒绝的结算、退出窗口、线上上限），来自契约的根导出。这些规则改变时，`src/session.ts` 随之调用新的导出。`TRANSPORT_TABLE` 加行时 `tests/session.spec.ts` 自动覆盖。线路端口 `src/line.ts` 是内部类型，改它要同步两条线路与内存线路替身。SDK 升级时重跑 `tests/probes/` 的探针，重核 SPEC「与 SDK 的复用关系」的 `文件:行`，并核对 B 层夹具的 API。消费者：`@omne-harness/mcp`（经契约端口）、组设计。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放对端夹具，probes/ 存放 SDK 探针，model/ 存放有界穷举探索器与它的负控
schema/                   对外 Schema（本包没有）
verification/             持续验证资源；models/ 存放 TLA+ 模型，proofs/sdk/ 存放 SDK 复用的论证
adr/                      有持续消费者的实现取舍（本包没有）
examples/                 面向公开入口的示例（本包没有）
resources/                运行所需的非源码资源（本包没有）
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
