# @omne-harness/mcp

[English](README.md)

MCP 的通用实现：在 `@omne-harness/mcp-contract` 的五个需求端口上实现 MCP 组的核心服务，以及生产用的内存清单存储。

## 职责与状态

本包实现契约的五个应用服务：类别端口 `inspection`、读口 `discovery`、调用口 `invoker`、状态口 `status` 与连接口 `connections`。它们共享一张连接表、一个在途表与一个任务表。连接表经端口（凭据句柄、进程落点、传输工厂）建立连接，把状态交给 `Connection` 聚合保存，并按组设计的次序关闭连接。

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
- 错误、生命周期与资源：拒绝与连接失败是 `Outcome` 的失败；前提违反（非法转移、伪造的关口令牌、不是对象的配置）抛出 `TypeError` 或 `RangeError`。没有调用方等着的工作里出现的本包错误由连接表的任务作用域记下，`closeAll` 把它们装进一个 `AggregateError` 拒绝；`closeAll` 之后出现的这种错误作为未捕获的异常抛出。连接表拥有每条连接的传输、进程句柄与凭据句柄，并按关闭次序释放它们。

## 设计

模块：`config`、`inspection`、`discovery`、`invoker`（`calls`：`invoke`、`continueWithInput`、`cancel`；`tasks`：四个任务操作）、`status`、`connections`、`store/memory`，以及内部的 `internal/assembly`（各张表与各服务唯一的装配）、`internal/connection`（聚合）、`internal/in-flight`（聚合：调用的占位与它的停止信号）、`internal/task-table`（本次运行的任务）、`internal/lost`（传输答复对连接状态的含义）、`internal/gate`（S1 唯一的裁决与两个令牌）、`internal/guard`（使用边界与发布边界上的关口）、`internal/table`（连接表，只编排）、`internal/entry`（一个条目的资源、视图、谓词与资源的搬移）、`internal/teardown`（唯一的关闭次序）、`internal/late`（时限后端口交来的东西）、`internal/build`（时限下的建连、连接丢失的收场与关停的核对）、`internal/turns`（每个持有一次只跑一个）、`internal/settings`、`internal/port`（唯一的端口适配器 `ask`，与时限下的等待 `waitAtMost`、`within`）、`internal/scope`（连接表的任务作用域，对外只给能交工作的视图）、`internal/text`。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) 与 [docs/object-model.md](docs/object-model.md)。

SPEC MC-14 怎样兑现：

- 关闭次序只有一个入口：`internal/teardown.ts` 的 `teardown(entry)`。它返回确认范围；拆除在途时再要求拆除，加入在途的那一次（`Entry.tearing`）。
- 每一步经 `internal/port.ts` 的 `ask` 问端口，`ask` 把端口被调用时的同步抛出与 reject 读成该端口的违约答复（SPEC MC-15）：`closeTransport`、`stopOne`（一个进程；`stopProcesses` 逐个问每个进程）与 `releaseHeld`。没有哪一步因端口而 reject，所以每一步都执行，每个进程都被问到。关闭次序外面没有 catch：本包的错误使拆除 reject。
- 每一步在端口答复之后才清空自己的字段，所以那一步等端口时 `holdsNothing` 仍为假。
- `internal/entry.ts` 放谓词与搬移。五项资源都不持有时 `holdsNothing(held)` 为真。`forgettable(entry)` 是「已关闭」且 `holdsNothing`，`internal/table.ts` 的 `forget` 只经它删除条目。凭据句柄在条目里或在一个落点里（`handOverToLanding`、`landingAnswered`）。进程句柄在 `process` 或 `lingering` 里（`recordStop`、`adoptLingering`）。
- 关停时，`closeAll` 先对每个条目发起 `abandonLandings`，再关闭各条目，等两者都结束，然后取走任务作用域记下的本包错误并关闭作用域。这些错误，连同放弃落点或关闭某个条目时抛出的本包错误，以一个 `AggregateError` 拒绝（其余条目照样关完），再次调用 `closeAll` 不再抛出它们。作用域关闭之后才出现的错误交给作用域的事后出口：缺省作为未捕获的异常抛出，测试可以给表另一个出口。`abandonLandings` 只释放仍在途的落点的句柄。落点从开始起就在途，所以时限之内的落点也算。落点交来进程之后，句柄等那个进程的 `stop()` 答复（S9）。关停之后才到时限的落点已经没有句柄：`abandonLandings` 释放了它。
- 时限下的等待不再等的工作：等待方自己发起的（`internal/port.ts` 的 `within`）到期后在连接表的任务作用域里继续：超出时限的失败建连的收场，以及端口迟到交来的东西的收口；只是加入别人工作的等待（`waitAtMost`）到期只停止等待，工作留给它的拥有者。作用域由连接表自己创建，对外只给能交工作的视图，只有 `closeAll` 退出它。表的时限都来自一个来源（`TableRuntime.startBound`，缺省 `AbortSignal.timeout`）。测试注入能逐个触发的时限（`tests/doubles/bounds.ts`），探索器注入它自己的（`tests/model/explore.ts`）。

### 调用口

调用口在 `src/calls.ts` 与 `src/tasks.ts`，接在关口、连接表、在途表与任务表上。它的次序、连接失败到「未发出」的映射、取消的接线与任务操作的规则是 SPEC [MC-16](SPEC.md#mc-16) 与 [MC-17](SPEC.md#mc-17)；在途表是 [MC-12](SPEC.md#mc-12)。流程图在 [docs/flows.md](docs/flows.md)。

## 配置与运行

`McpConfig` 四个字段必填，没有缺省值（契约 SPEC S3）。连接上界来自采用的 `connect-timeout` 配值；配值缺失时用请求的 `connectBound`（S4）。给清单打取得时刻的时钟是 `McpPorts.clock`，不给时读本机时钟。输出校验函数是 `McpPorts.checkOutput`，必填。与契约的偏离及其退出条件在 SPEC.md。其余都来自端口。本包不保存耐久状态；内存存储、在途表与任务表只活一次运行。

## 验证

运行 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`。测试运行在契约的内存替身与两个脚本化传输（`tests/doubles/`）上：成员自己的脚本化「传输对象做什么」，给连接表用；契约的 `createScriptedTransportFactory` 脚本化「对端说什么」，给调用口用（`tests/invoke.spec.ts`、`tests/cancel.spec.ts`、`tests/continue.spec.ts`、`tests/tasks.spec.ts`）。它们穷举两个聚合，覆盖服务实际走的关口的六种答复、`ensure` 的每种配值缺陷与连接失败、`refresh` 的发布边界（并发与迟到结果用 deferred 排次序）、`tests/races.spec.ts` 的交错（旧代际迟到的页、关闭对建连、永不返回或抛出的端口、建连与取页期间的中止、永不答复的临界区重读、排在挂起的调用后面或加入挂起的建连的调用，时限由测试逐个触发）、状态视图、关闭次序、`close()`／`stop()`／`release()` reject 每种组合下的拆除与几个进程中一个 `stop()` reject 的拆除（`tests/teardown.spec.ts`，在 `tests/doubles/faults.ts` 的端口上）、遗忘的条件（`tests/entry.spec.ts`）、关停对另一条目的关闭与对途中建连（`tests/shutdown.spec.ts`）、reject 或被调用时同步抛出的端口（`tests/port-breach.spec.ts`）、任务作用域（`tests/port.spec.ts`），以及存储的符合性套件。下面每条性质都有具名变异让用例变红：发出次序的每一步拒绝并按 SPEC MC-12 收口键、连接失败映射表的每一行、在途表与任务表按租户与主体隔离、任务只在发起时的对端账号上操作、连接键含对端账号、凭据句柄取一次释放一次、迟到的清单不发布、前一步 reject 时拆除的每一步仍执行、每个进程都被要求停止、持有在途落点的条目不被遗忘、`closeAll` 先释放在途落点的句柄、表关停时建连停下、关停开始之后失败的建连不标记清单、每个 `ensure` 在自己的时限答复、任务作用域的错误交到 `closeAll` 或作用域的事后出口。SPEC.md 列出未覆盖项：没有真实传输、进程、对端与耐久存储。连接表与调用口的性质另有两个用 TLC 检查的 TLA+ 模型，以及驱动真实代码的有界穷举探索器（`tests/model/`）。性质与每种证据对每条性质的结论见 [SPEC.md「性质与证据」](SPEC.md#properties)；两者的范围、与代码的映射，以及让每条性质变红的负控与变异见 [verification/README.md](verification/README.md)。

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
