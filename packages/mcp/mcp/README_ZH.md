# @omne-harness/mcp

[English](README.md)

MCP 的通用实现：在 `@omne-harness/mcp-contract` 的五个需求端口上实现 MCP 组的核心服务，以及生产用的内存清单存储。

## 职责与状态

本包实现契约五个应用服务中的四个：类别端口 `inspection`、读口 `discovery`、状态口 `status` 与连接口 `connections`。它们共享一张连接表。连接表经端口（凭据句柄、进程落点、传输工厂）建立连接，把状态交给 `Connection` 聚合保存，并按组设计的次序关闭连接。调用口 `invoker` 与任务表是下一波的工作。

状态：W2 的核心实现，建立在候选契约上。行为正文是 [SPEC.md](SPEC.md)，它引用契约条款号并写明本包自己的决定。组设计是[组工程设计](../docs/architecture.md)。

| 部分                                                                | 状态                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `createMcpCore`：`inspection`、`discovery`、`status`、`connections` | 已实现。在契约的内存替身与脚本化传输上测试                              |
| `createInMemoryCatalogStore`                                        | 已实现。通过契约的 `CatalogStore` 套件；CS8 不适用                      |
| `Connection` 与 `InFlightCalls` 聚合、关口、连接表                  | 已实现为内部模块；下一波在它们上面接调用口                              |
| `invoker`（`invoke`、`continueWithInput`、`cancel`、四个任务操作）  | 本包尚无                                                                |
| 真实传输、官方 SDK、真实对端、真实进程、耐久存储                    | 不在本包。`@omne-harness/mcp-host-local` 提供它们；本包没有在它们上验证 |
| `list_changed` 订阅、后台重连                                       | 未实现。`changedNotified` 保持为假；失联的连接在下一次使用时重建        |

## 使用

本包只有一个入口。宿主先建五个端口与配置，再建核心：

```ts
import { createInMemoryCatalogStore, createMcpCore } from '@omne-harness/mcp'

const mcp = createMcpCore(
  { adoption, eligibility, credentials, landing, store: createInMemoryCatalogStore(), transports },
  {
    principalKey: principal => principal.id,
    maxListingPages: 4,
    maxActions: 200,
    instructionsByteLimit: 4096,
  },
)

const refreshed = await mcp.discovery.refresh(access, { ref })
if ('ok' in refreshed && refreshed.ok.kind === 'published') report(refreshed.ok.revision)

// 退出时。它只报告已确认的停止范围。
const closed = await mcp.connections.closeAll()
```

只有 `refresh` 会建立连接。`current`、`peer`、`inspect` 与 `list` 从不连接。持有实例的宿主在退出时调用 `closeAll()`。不合法的配置在构造时抛出 `RangeError`。本包不需要 Cordis，见 [docs/context.md](docs/context.md)。

## 契约

- 公开类型与运行时校验：[src/](src/README.md)，导航在 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。它引用本包兑现的[契约 SPEC](../mcp-contract/SPEC.md) 条款（S1、S3–S5、S7–S9、K1–K3、C1–C7），并列出本包自己的决定。
- 错误、生命周期与资源：拒绝与连接失败是 `Outcome` 的失败；前提违反（非法转移、伪造的关口令牌、不是对象的配置）抛出 `TypeError` 或 `RangeError`。连接表拥有每条连接的传输、进程句柄与凭据句柄，并按关闭次序释放它们。

## 设计

模块：`config`、`inspection`、`discovery`、`status`、`connections`、`store/memory`，以及内部的 `internal/connection`（聚合）、`internal/in-flight`（聚合）、`internal/gate`（能力令牌）、`internal/table`（连接表）、`internal/settings`、`internal/guard`、`internal/text`、`internal/canonical`。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) 与 [docs/object-model.md](docs/object-model.md)。

### 给下一波

调用口接在三个内部模块上。它们的签名：

- `internal/table.ts`：`ensure(admitted: AdmittedEndpoint, access: Access<P>, options?: { signal?: AbortSignal; connectBound?: Millis }): Promise<Outcome<Ensured, EnsureFailure>>`。`Ensured` 是 `{ transport, generation, connection, peer, catalogKey }`。`EnsureFailure` 是 `{ reason: ConnectionFailure | Refusal | EffectUnknown; catalog: CatalogMark }`，`catalog` 说明清单标记的结果（`marked`、`revision-conflict`、`unavailable`、`not-acquired`、`untouched`）。连接表另有 `lose(connection, reason, mark)`（已建立的连接上的请求发现连接已失效）、`current(key)`、`stateOf(tenant, holding)`、`close(tenant, holding)` 与 `closeAll()`。
- `internal/in-flight.ts`：`class InFlightCalls`，方法 `reserve(key): 'reserved' | 'in-use'`、`markSent(key, requestId, generation): 'sent' | 'cancelled'`、`markEnded(key)`、`release(key)`、`cancel(key, currentGeneration): CancelAnswer`、`requestIdOf(key)`。键是 `{ tenant, principalKey, correlationKey }`，`principalKey` 是 `McpConfig.principalKey` 给出的文本。占位后、发出前收到取消时，`markSent` 答 `cancelled`：调用方答「未发出」，键转为已结束。对未占位的键调用 `markSent` 抛出 `TypeError`。
- `internal/gate.ts`：`admitWithoutEligibility(ports, access, ref): Promise<Outcome<AdmittedEndpoint, not-available-to-you | unknown>>` 给复用连接的任务操作（SPEC S2），与 `admit(ports, access, ref)` 并列。只有这两个函数授予 `AdmittedEndpoint`；`assertAdmitted(value)` 对其他对象抛出 `TypeError`，`ensure` 也这样核对。

约定：需要连接的函数只收 `AdmittedEndpoint`，所以「先过关口再连接」由类型与运行时同时保证。下一波的 `invoke` 次序见 [docs/flows.md](docs/flows.md)。

## 配置与运行

`McpConfig` 四个字段必填，没有缺省值（契约 SPEC S3）。连接时限来自采用的 `connect-timeout` 配值；配值缺失时用请求的 `connectBound`（S4）。`createMcpCore` 接受可选的第三个参数 `{ now }`，它给出清单取得时刻的时钟；不给时读本机时钟。其余输入都来自五个端口。本包不保存耐久状态；内存存储只在一次运行内有效。

## 验证

运行 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`。测试运行在契约的内存替身与脚本化传输工厂（`tests/doubles/`）上。它们穷举两个聚合，覆盖关口的六种答复、`ensure` 的每种配值缺陷与连接失败、`refresh` 的发布边界（并发与迟到结果用 deferred 排次序）、状态视图、关闭次序，以及存储的符合性套件。三条性质各有一处具名变异让用例变红：连接键含对端账号、凭据句柄取一次释放一次、迟到的清单不发布。SPEC.md 列出未覆盖项：没有真实传输、进程、对端与耐久存储。

## 维护

契约 SPEC 的服务条款一变，这里同名的模块随之变：S5 是 `discovery.ts`，S7 是 `status.ts`，S8 是 `connections.ts` 与 `internal/table.ts`，S9 是 `internal/table.ts`。新增一种传输时，加一个 `GenerationPolicy` 取值与 `internal/settings.ts` 的一个分支。下一波加 `invoker` 与 `createMcp`；`createMcpCore` 留给不需要调用口的宿主。消费者：`@omne-harness/mcp-host-local`（端口与传输）与组设计。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本图
index.md                  本包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、校验与实现
tests/                    持续测试；doubles/ 放测试替身
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 放其输入
```

每个目录有说明职责的 README.md 与导航的 index.md。阅读路径见 [index.md](index.md)。一个 docs 专题可以升级为同名目录，带 README.md 与 index.md。专题移动时同步本图。
