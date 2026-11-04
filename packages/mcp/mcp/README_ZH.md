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

模块：`config`、`inspection`、`discovery`、`status`、`connections`、`store/memory`，以及内部的 `internal/connection`（聚合）、`internal/in-flight`（聚合）、`internal/gate`（S1 唯一的裁决与两个令牌）、`internal/guard`（使用边界与发布边界上的关口）、`internal/table`（连接表，只编排）、`internal/entry`（一个条目的资源、视图、谓词与资源的搬移）、`internal/teardown`（唯一的关闭次序）、`internal/late`（时限后端口交来的东西）、`internal/build`（时限下的建连、连接丢失的收场与关停的核对）、`internal/turns`（每个持有一次只跑一个）、`internal/settings`、`internal/abort`（时限，以及端口 reject 的读法 `answerOf`）、`internal/text`、`internal/canonical`。见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) 与 [docs/object-model.md](docs/object-model.md)。

SPEC MC-14 怎样兑现：

- 关闭次序只有一个入口：`internal/teardown.ts` 的 `teardown(entry)`。它返回确认范围；拆除在途时再要求拆除，加入在途的那一次（`Entry.tearing`）。
- 每一步在调用端口的地方经 `internal/abort.ts` 的 `answerOf` 吸收该端口的违约：`closeTransport`、`stopOne`（一个进程；`stopProcesses` 逐个问每个进程）与 `releaseHeld`。没有哪一步因端口而 reject，所以每一步都执行，每个进程都被问到。关闭次序外面没有 catch：本包的错误使拆除 reject。
- 每一步在端口答复之后才清空自己的字段，所以那一步等端口时 `holdsNothing` 仍为假。
- `internal/entry.ts` 放谓词与搬移。五项资源都不持有时 `holdsNothing(held)` 为真。`forgettable(entry)` 是「已关闭」且 `holdsNothing`，`internal/table.ts` 的 `forget` 只经它删除条目。凭据句柄在条目里或在一个落点里（`handOverToLanding`、`landingAnswered`）。进程句柄在 `process` 或 `lingering` 里（`recordStop`、`adoptLingering`）。
- 关停时，`closeAll` 先对每个条目发起 `abandonLandings`，再用 `Promise.all` 关闭各条目。关停之后才超出时限的落点，由建连立即释放它的句柄（`releaseLanding`）。

### 给下一波

调用口接在下面的内部模块上。约定：需要连接的函数只收 `AdmittedEndpoint`，它只由关口授予；服务不直接写 `Connection` 聚合，只向连接表报告结果。

- `internal/guard.ts`，服务实际走的关口：`admitForUse(gate, access, ref): Promise<Outcome<AdmittedEndpoint, GateRefusal>>`，`gate = { ports, table }`。它在 `admit` 上组合（先采用后资格，SPEC MC-2），接入点被撤采用或被设置挡下时关闭它的连接（不变式 6，接入点级）；`not-eligible` 与 `unknown` 不关闭。`stillAdmitted(gate, access, ref, revision): Promise<Outcome<'admitted' | 'superseded', GateRefusal>>` 是发布边界上的同一关口：采用修订已不是 `revision` 时答 `superseded`。
- `internal/gate.ts`：`admit(ports, access, ref): Promise<GateDecision>`（S1 唯一的裁决，`refusalOf(decision)` 给 R1 的拒绝）与 `admitWithoutEligibility(ports, access, ref): Promise<Outcome<AdoptedOnly, not-available-to-you | unknown>>`（给复用连接的任务操作，SPEC S2）。`AdoptedOnly` 带解析过的 `definition`；`AdmittedEndpoint` 是 `AdoptedOnly` 加资格。两个令牌只在关口内从采用端口的答复铸出：`judge(ports, access, token)` 对不是它铸出的令牌（含换了定义的副本）抛出 `TypeError`；`assertAdmitted(value)` 对未准入的对象抛出 `TypeError`，`ensure` 也这样核对。
- `internal/table.ts`：`ensure(admitted: AdmittedEndpoint, access: Access<P>, options?: { connectBound?: Millis }): Promise<Outcome<Ensured, EnsureFailure>>`。`Ensured` 是 `ensure` 答复那一刻的快照：`{ transport, generation, connection, peer, catalogKey, adoptionRevision, bound }`，`connection` 是只读视图 `{ generation, isCurrent(generation) }`。`EnsureFailure` 是 `{ stage: 'settings', reason }`（没有标记：S4 的拒绝、K1 的 `credential-unavailable(missing)`、重读采用的结果——被撤采用答 `not-available-to-you`，不可读、reject 或令牌修订不是当前修订答 `unknown`——以及重读或临界区等关闭、等拆除在这次调用的连接时限内没有结束，或表在建连之前或途中被 `closeAll` 关停时的 `connection-unavailable`）或 `{ stage: 'connect', reason: ConnectionFailure | EffectUnknown, catalog }`。`catalog` 说明清单标记的结果：`marked`（已写入）、`revision-conflict`（已有更新的采用）、`unavailable`（存储不能读或写）、`not-acquired`（尚无清单）。`markUnavailable` 的原因（`UnavailableMark`）是 `connection-unavailable`、`authorization-required`、`credential-unavailable`、`landing-unavailable`。已建立连接上的请求用 `settle(connection, generation, 'page-failed' | 'listed')` 与 `lose(connection, generation, reason, mark): Promise<CatalogMark | 'not-current'>` 报告结果；代际已不是当前时不动作。`lose` 先同步拒新请求，再与 `close` 共用条目唯一的拆除（`internal/teardown.ts`：传输、进程、句柄；每一步都执行，每个进程都被问到，端口 reject 按 SPEC MC-14 处置）。拆除途中的 `release` 等它完成；拆除途中的 `ensure` 至多等到自己的连接时限，然后答 `connection-unavailable`。时限后才交来的进程在交来时停止，它未确认的范围出现在 `residual` 里，进程凭据句柄在这次 `stop()` 之后释放。条目只在 `forgettable`（`internal/entry.ts`：已关闭，且没有传输、进程、句柄、未确认停止的进程与在途落点）时离开表。调用方的 `signal` 不进 `ensure`：建连由同键的所有调用方共享，只受连接时限约束，时限从取凭据起覆盖进程启动、打开传输与协商；临界区里的重读与等关闭、等拆除受这次 `ensure` 自己的时限约束。另有 `current(key)`、`stateOf(tenant, holding)`、`close(tenant, holding)`、`closeAll()`。连接的落点仍在途时 `close` 与 `closeAll` 报 `unconfirmed`；`closeAll` 把表关停（之后每个 `ensure` 答 `connection-unavailable`，途中的建连停在下一步），立即释放在途落点的句柄，再同时关闭每个条目，等全部拆除结束（SPEC MC-14）。宿主应以自己的期限包住 `closeAll`：关闭次序的端口永不答复时它也不答复（SPEC「已知限制」）。
- 连接键：`internal/settings.ts` 的 `prepareSettings(adopted, connectBound)` 给要连接的操作的 `account`（经 `peerAccountOf`）与时限；`readAccountOf(adopted)` 给不连接的操作（`current`、`peer`）的账号。`connectionKeyOf(tenant, endpoint, account)` 与 `catalogKeyOf` 是契约的；`internal/text.ts` 给它们的规范文本。
- `internal/in-flight.ts`：`class InFlightCalls`，方法 `reserve(key): 'reserved' | 'in-use'`、`markSent(key, requestId, generation): 'sent' | 'cancelled'`、`markEnded(key)`、`release(key)`、`cancel(key, currentGeneration): CancelAnswer`、`requestIdOf(key)`。键是 `{ tenant, principalKey, correlationKey }`，`principalKey` 是 `McpConfig.principalKey` 给出的文本。占位后、发出前收到取消时，`markSent` 答 `cancelled`：调用方答「未发出」，键转为已结束。对未占位的键调用 `markSent` 抛出 `TypeError`。

下一波的 `invoke` 次序见 [docs/flows.md](docs/flows.md)。

## 配置与运行

`McpConfig` 四个字段必填，没有缺省值（契约 SPEC S3）。连接时限来自采用的 `connect-timeout` 配值；配值缺失时用请求的 `connectBound`（S4）。`createMcpCore` 接受可选的第三个参数 `{ now }`，它给出清单取得时刻的时钟；不给时读本机时钟。与本波已定事项的三处偏离（`refresh` 的 `signal`、`{ now }`、复制的 JSON 规范化）及退出条件见 SPEC.md。其余输入都来自五个端口。本包不保存耐久状态；内存存储只在一次运行内有效。

## 验证

运行 `pnpm turbo run build typecheck test --filter=@omne-harness/mcp`。测试运行在契约的内存替身与脚本化传输工厂（`tests/doubles/`）上。它们穷举两个聚合，覆盖服务实际走的关口的六种答复、`ensure` 的每种配值缺陷与连接失败、`refresh` 的发布边界（并发与迟到结果用 deferred 排次序）、`tests/races.spec.ts` 的交错（旧代际迟到的页、关闭对建连、永不返回或抛出的端口、建连与取页期间的中止、永不答复的临界区重读）、状态视图、关闭次序、`close()`／`stop()`／`release()` reject 每种组合下的拆除与几个进程中一个 `stop()` reject 的拆除（`tests/teardown.spec.ts`，在 `tests/doubles/faults.ts` 的端口上）、遗忘的条件（`tests/entry.spec.ts`）、关停对另一条目的关闭与对途中建连（`tests/shutdown.spec.ts`）、reject 的读类端口（`tests/port-breach.spec.ts`），以及存储的符合性套件。下面每条性质都有具名变异让用例变红：连接键含对端账号、凭据句柄取一次释放一次、迟到的清单不发布、前一步 reject 时拆除的每一步仍执行、每个进程都被要求停止、持有在途落点的条目不被遗忘、`closeAll` 先释放在途落点的句柄、表关停时建连停下。SPEC.md 列出未覆盖项：没有真实传输、进程、对端与耐久存储。连接表生命周期的性质 P1–P8 另有用 TLC 检查的 TLA+ 模型与驱动真实连接表的有界穷举探索器（`tests/model/`），两者的范围、与代码的映射及已知反例见 [verification/README.md](verification/README.md)。

## 维护

契约 SPEC 的服务条款一变，这里同名的模块随之变：S5 是 `discovery.ts`，S7 是 `status.ts`，S8 是 `connections.ts` 与 `internal/table.ts`，S9 是 `internal/teardown.ts`、`internal/late.ts` 与 `internal/build.ts`。新增一种传输时，加一个 `GenerationPolicy` 取值与 `internal/settings.ts` 的一个分支。下一波加 `invoker` 与 `createMcp`；`createMcpCore` 留给不需要调用口的宿主。消费者：`@omne-harness/mcp-host-local`（端口与传输）与组设计。

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
