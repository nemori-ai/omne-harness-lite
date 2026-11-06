# @omne-harness/mcp

[English](README.md)

MCP 的通用实现：在 `@omne-harness/mcp-contract` 的五个需求端口上实现 MCP 组的核心服务，以及生产用的内存清单存储。

## 职责与状态

本包实现契约的五个应用服务：类别端口 `inspection`、读口 `discovery`、调用口 `invoker`、状态口的两个服务 `status` 与 `connections`。它们共享一张连接表、一个在途表与一个任务表。连接表经端口（凭据句柄、进程落点、传输工厂）建立连接，把状态交给 `Connection` 聚合保存，并按组设计的次序关闭连接。

状态：W2 的核心实现，W3 修订了连接表的生命周期并接入调用口，建立在候选契约上。行为正文是 [SPEC.md](SPEC.md)，它引用契约条款号并写明本包自己的决定。组设计是[组工程设计](../docs/architecture.md)。

| 部分                                                                       | 状态                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `createMcp`：`inspection`、`discovery`、`invoker`、`status`、`connections` | 已实现。在契约的内存替身与脚本化传输上测试                              |
| `createInMemoryCatalogStore`                                               | 已实现。通过契约的 `CatalogStore` 套件；CS8 不适用                      |
| `Connection` 与 `InFlightCalls` 聚合、关口、各张表                         | 已实现为内部模块                                                        |
| 清单容错（单个不合法工具剔除并报告）                                       | 本包尚无；另一闭包为它改契约 C1                                         |
| 真实传输、官方 SDK、真实对端、真实进程、耐久存储                           | 不在本包。`@omne-harness/mcp-host-local` 提供它们；本包没有在它们上验证 |
| `list_changed` 订阅、后台重连                                              | 未实现。`changedNotified` 保持为假；失联的连接在下一次使用时重建        |

## 使用

本包只有一个入口。宿主先建端口与配置，再建服务：

```ts
import { createInMemoryCatalogStore, createMcp } from '@omne-harness/mcp'

const mcp = createMcp(
  {
    adoption,
    eligibility,
    credentials,
    landing,
    store: createInMemoryCatalogStore(),
    transports,
    checkOutput, // 宿主的 JSON Schema 校验器，形状是 OutputValidator
  },
  {
    principalKey: principal => principal.id,
    maxListingPages: 4,
    maxActions: 200,
    instructionsByteLimit: 4096,
  },
)

const refreshed = await mcp.discovery.refresh(access, { ref })
if ('ok' in refreshed && refreshed.ok.kind === 'published') report(refreshed.ok.revision)

const result = await mcp.invoker.invoke(access, {
  ref,
  action,
  args,
  expectedDefinition, // 调用方从 discovery.current 读到的摘要
  correlationKey,
  signal,
})
if (result.kind === 'sent') consume(result.outcome)

// 退出时。它只报告已确认的停止范围。
const closed = await mcp.connections.closeAll()
```

`refresh`、`invoke` 与任务操作需要连接而没有可用连接时，才建立连接。任务操作先找任务的对端账号下的连接（SPEC [MC-17](SPEC.md#mc-17) 第 3 步）。`continueWithInput` 只在发出它时的代际的连接上继续：它不为了证明这一点而建连，也不在更晚的代际上发出（SPEC [MC-16](SPEC.md#mc-16) 第 6、7 步）。`current`、`peer`、`inspect`、`list` 与 `cancel` 从不连接。持有实例的宿主在退出时调用 `closeAll()`。不合法的配置在构造时抛出 `RangeError`。`clock` 是唯一可选的端口：不给时本机时钟给清单打时间戳。本包不需要 Cordis，见 [docs/context.md](docs/context.md)。

## 契约

- 公开类型与运行时校验：[src/](src/README.md)，导航在 [docs/public-api.md](docs/public-api.md)。
- 类型以外的行为：[SPEC.md](SPEC.md)。它引用本包兑现的[契约 SPEC](../mcp-contract/SPEC.md) 条款（列在它开头的依据表里），并列出本包自己的决定。
- 错误、生命周期与资源：拒绝与连接失败是 `Outcome` 的失败。前提违反抛出 `TypeError` 或 `RangeError`。连接表拥有每条连接的传输、进程句柄与凭据句柄。错误、关停与资源释放的规则见 [SPEC.md](SPEC.md#所有权失败与生命周期) 的 MC-10 与 MC-14。

## 设计

模块、状态与资源的归属，以及这样设计的理由，见 [docs/architecture.md](docs/architecture.md)。流程见 [docs/flows.md](docs/flows.md)，对象模型见 [docs/object-model.md](docs/object-model.md)。

### 调用口

调用口在 `src/calls.ts` 与 `src/tasks.ts`，接在关口、连接表、在途表与任务表上。它的次序、连接失败到「未发出」的映射、取消的接线与任务操作的规则是 SPEC [MC-16](SPEC.md#mc-16) 与 [MC-17](SPEC.md#mc-17)；在途表是 [MC-12](SPEC.md#mc-12)。流程图在 [docs/flows.md](docs/flows.md)。

## 配置与运行

`McpConfig` 四个字段必填，没有缺省值，规则见契约 SPEC 的 [S3](../mcp-contract/SPEC.md#services) 与 S4。`McpPorts.clock` 可选，`McpPorts.checkOutput` 必填。与契约的偏离及其退出条件在 [SPEC.md](SPEC.md#deviations)。其余都来自端口。本包不保存耐久状态；内存存储、在途表与任务表只活一次运行。

## 验证

运行 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`。测试运行在契约的内存替身与两个脚本化传输（`tests/doubles/`）上，不用真实传输、进程、对端与耐久存储。测试覆盖的范围、性质、模型与变异见 [SPEC.md](SPEC.md#properties) 与 [verification/README.md](verification/README.md)。

## 维护

契约 SPEC 的服务条款一变，这里同名的模块随之变：S2 是 `calls.ts`、`tasks.ts`、`internal/in-flight.ts` 与 `internal/task-table.ts`，S5 是 `discovery.ts`，S7 是 `status.ts` 与 `internal/lost.ts`，S8 是 `calls.ts`、`tasks.ts`、`discovery.ts` 与 `internal/table.ts`，S9 是 `internal/teardown.ts`、`internal/late.ts` 与 `internal/build.ts`。新增一种传输只加一个 `GenerationPolicy` 取值和 `internal/settings.ts` 的一个分支。消费者：`@omne-harness/mcp-host-local`（端口与传输）与组设计。

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
