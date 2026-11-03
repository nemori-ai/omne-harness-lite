# W2 MCP 线实施规格：`@omne-harness/mcp` 核心

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。与 [Skill 线规格](../skill/spec.md)同骨架。

- 卡：无卡，负责人 2026-11-03 会话内「W2 开工」；波包 [w2/wave-pack.md](../wave-pack.md)；F `b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01`
- 上一层：[线级地图](../../line-mcp/context-map.md)；[共用约束](../../constraints.md)；[范式 r1](../../operating-model.md)；[W1 规格](../../w1/mcp/spec.md)已定事项 1–19 继续有效；[2026-07-28 核对](../schema-check.md)
- 主工作类型：feature → poteto-mode Feature
- 风险级别：L3。连接键决定不同租户与对端账号永不共用连接；凭据句柄的取得与释放（S9）；并发 `refresh` 的发布边界（迟到结果不覆盖较新的采用）

## Problem Statement

W1 之后 MCP 只有纯函数与接口。没有人能在替身端口上建立一条连接、发现对端的动作清单并整份发布，也没有人能回答「这个接入点现在什么状态」。W3 的调用口与真实传输、M2 之后的工具派生都要先有这层核心。

## Solution

`@omne-harness/mcp` 公开根导出 `createMcpCore(ports, config)`，交出五个服务里的四个（`inspection`、`discovery`、`status`、`connections`），它们共享一张连接表；另导出 `createInMemoryCatalogStore()`（生产可用的内存存储，过 CS 套件）。内部是两个有状态聚合（`Connection`、`InFlightCalls`，类）、一个关口（`admit`，纯函数加端口调用）与四个服务模块。`ActionInvoker` 与任务表在 W3 接在同一张连接表与在途表上。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 成员 SPEC `packages/mcp/mcp-contract/SPEC.md` | F | K1–K3、C1–C8、R1–R7、S1–S9、AV/UE/CU/PL/CS/T 全节、失败码索引 |
| 组页 `packages/mcp/docs/architecture.md` | F | 「MCP 连接」（状态机两张图、不变式 1–6、`close()` 次序）「MCP 动作清单与 MCP 已知动作」「应用服务」（读口、状态口、资格与换代） |
| DDD 建模 `tmp/skill-mcp-domain/model/README.md` | 2026-11-03 本地 | 「MCP 上下文」聚合表、`invoke` 次序骨架（W3）、测试接缝；F1–F5 |
| 聚合草图 `tmp/skill-mcp-domain/model/mcp/{connection,in-flight,gate}.ts` | 2026-11-03 本地 | 形状的起点。写在 W1 之前，与 F 的契约不一致处以契约为准 |
| 契约源码 `mcp-contract/src/{services,ports,transport,catalog,listing,keys,outcomes}.ts` 与 `./testing` | F | 接口签名、五个替身、`conformanceCase` |
| 2026-07-28 核对 | [schema-check.md](../schema-check.md) | 本波只受 `serverInfo` 可选一项影响（已 prep2） |

已定事项（reduce 裁定，写者照做）：

1. **公开根只有两个工厂与它们的类型**：`createMcpCore<P, S>(ports: McpPorts<P, S>, config: McpConfig<P>): McpCore<P, S>`，`McpCore = Omit<McpServices<P, S>, 'invoker'>`；`createInMemoryCatalogStore(): CatalogStore`。`createMcp` 在 W3 加上 invoker 后导出。聚合、关口、连接表不从公开根导出，但以成员内模块（`src/internal/`）的形式留给 W3。
2. **`McpConfig` 校验**在 `createMcpCore` 入口：三个上界不是正的安全整数、`principalKey` 不是函数时抛 `RangeError`（S3）。
3. **`Connection` 聚合是类**，只做状态转移，不做 IO：`state`（S7 的五态加 `closed`）、`generation`、`key`、`peer?`、`residual?`。构造时给 `GenerationPolicy`：`on-attempt`（stdio，每次 `attempt()` 加一，含失败）或 `on-negotiation`（HTTP，`ready()` 时加一）。非法转移抛 `TypeError`（编程错误）：`closed` 之后任何转移；`degraded` 只能由 `ready` 进入；`ready` 只能由 `preparing` 或 `degraded` 进入。`isCurrent(generation)` 判断迟到结果。
4. **`InFlightCalls` 聚合是类**（本波只建不接调用口）：键 `(tenant, principalKey, correlationKey)`；`reserve` 查重与占位一步；`markSent(key, requestId, generation)`；`markEnded`；`cancel(key)` 的答复按 S2（`signalled` / `no-call-in-flight` / `unknown`）；`release(key)` 撤销占位。代际已换的键 `cancel` 答 `unknown`。表项在本次运行内保留，`ended` 状态不删除。
5. **关口 `admit(ports, access, ref)`**：S1 的次序（`AdoptionView.endpoint` → 未采用 `not-available-to-you`、不可读 `unknown` → `UseEligibility.check` → `not-eligible` 为 `not-available-to-you`、被挡下为 `blocked`、`unknown`）。成功交出能力令牌 `AdmittedEndpoint`：带 `AdoptedEndpoint` 与一个模块私有品牌（`unique symbol`），只能由 `admit` 造出；需要连接的内部函数只收 `AdmittedEndpoint`，所以编译期就保证先过关口。`admitWithoutEligibility` 给任务操作复用连接的路径（S1 例外，W3 用）。
6. **连接表**键是 `connectionKeyOf(tenant, holding, adoptionRevision, peerAccount)`（K2）的规范文本；一张 `Map`。`ensure(admitted, { connectBound? })`：
   1. `peerAccountOf(auth, binding)`；缺凭据 → `credential-unavailable(missing)`（K1）。
   2. 组键；表里有且状态是 `ready`/`degraded` → 复用。状态是 `lost`/`none` → 重建（新代际）。`preparing` 在途 → 等同一 promise（单飞）。
   3. S4 配值检查：target、credential、connect-timeout、env，只报第一项。
   4. 新建：`Connection.attempt()`（stdio 先加代际）→ `auth` 不是 `none` 时 `CredentialUse.acquire(purpose)`（stdio 用 `process-env`，HTTP 用 `http-authorization` 带 target）→ stdio 经 `ProcessLanding.start(env)` 取进程句柄 → `McpTransportFactory.open(material)` → `transport.discover()` → `Connection.ready(peer)`。任一步失败：按 R6 答 `ConnectionFailure`，连接转 `lost` 带 S7 原因，`residual` 按进程 `stop()` 的确认范围，进程凭据句柄立即释放（S9），`markUnavailable` 写入清单（写入冲突 → 保留，不可用 → 不报）。
   5. 连接时限：从第 4 步开始计时，覆盖到 `ready`；超时按 `connection-unavailable` 处理并收口已起的进程。用 `AbortSignal.timeout(connectTimeout)` 组合 `connectBound`。
7. **`discovery.refresh`**（S5）：`admit` → `ensure` 取连接 `(transport, generation)` → `store.read(catalogKey)` 得 `basedOn`（`absent` 或修订）→ 循环 `transport.listActions(cursor)` 至多 `maxListingPages` 页，任一页 `TransportFailure` 按 S5 分类 → `completeListing({ pages, basedOn, acquiredAt, maxPages, maxActions })` → 缺陷答 `kept(listing-incomplete)` → `mergeListing(current, listing)` → `stale-revision` 答 `kept(superseded)` → **发布边界**：连接代际仍是当前（`connection.isCurrent(generation)`）、`signal` 未中止、`UseEligibility.check` 仍 `granted`（否则答对应 `Refusal` 不发布）→ `store.write(key, record, expected: basedOn)` → `revision-conflict` 答 `kept(superseded)`、`unavailable` 答 `unknown` → `published(revision)`。两次并发 `refresh` 的用例必须出现一次 `published` 一次 `kept(superseded)`，且存储里是较新的那份。
8. **`discovery.current`**：`admit` → 读 `store`（`absent` → `not-acquired`）→ `basisCurrent` 比较采用依据与当前连接（S8）；不连接、不发现；`ReadFailure` 收窄。`discovery.peer`：`admit` → 连接表没有 `ready`/`degraded` 连接答 `not-connected`；不为回答而建连接。
9. **`status.inspect`**：`admit` 的变体——未采用答 `not-available-to-you`，`unknown` 答 `unknown`；有资格但被挡下不是失败，写进 `use: blocked`。视图：连接状态（含 `residual`）、凭据四态（S7：`auth` 为 `none` → `not-required`；配值 `absent`/`invalid`/`present` 按 `AdoptedEndpoint.settings` 三态）、`use`。`status.list`：`AdoptionView.endpoints(scope)` → 逐项资格，只列 `granted` 与被挡下的（被挡下进 `use: blocked`），`not-eligible` 不列；任一 `unknown` 整次 `unknown`。
10. **`connections.release`**：`admit`（被禁用答 `blocked` 可接受，S1）→ 连接表有连接则 `close()` 次序（组页「`close()` 按下面的次序收场」）：拒新请求 → `transport.close()` → stdio `process.stop()` → 报告确认范围；`stop()` 答 `root-only`/`unconfirmed` 时状态 `lost(close-unconfirmed)` 带 `residual`，答 `tree-confirmed` 回到 `none`；HTTP 凭据句柄随关闭释放。没有连接答 `no-connection`。`closeAll()` 对表里每条做同样的事，只报告确认范围，不核采用。
11. **撤采用与禁用的自动关闭**（S1 末句、不变式 6）：每次 `ensure`/`admit` 发现采用修订变了（键不同）或资格不是 `granted` 时，先关闭旧键或该接入点的连接（同 10 的次序），再继续。本波不做后台轮询。
12. **凭据句柄生命周期**（S9）：每条连接一个进程凭据句柄；在进程 `stop()` 返回后释放；准备失败立即释放。HTTP 句柄随连接关闭释放。用例用替身的句柄计数证明「释放恰好一次」。
13. **`createInMemoryCatalogStore`** 是生产内存实现，不是 `./testing` 的替身：按 `catalogKey` 规范文本存整份记录，CS1–CS8 全过（CS7 由键隔离保证）；没有 `unavailable` 的路径（内存永远可用），CS8 用例 `NotApplicable`。
14. **`inspection`**：`mcpEndpointBodyContract()` 加 `inspect(body)`（`parseEndpointBody`）与 `launchesLocalCommand(body)`，三者共享一份正文读取，不重复解析规则。
15. **脚本化传输替身**只在本成员测试里：`tests/doubles/scripted-transport.ts` 给出 `McpTransportFactory` 替身，每次 `open` 交出一个按脚本应答的 `McpTransport`，脚本项可以是立即值、`TransportFailure` 或一个可由测试在稍后 resolve 的 deferred（用来排并发次序）。替身记录每次调用，用例断言调用序列。
16. **类/函数**：只有 `Connection`、`InFlightCalls`、内存存储（可用闭包或类）是有状态的；服务是返回对象字面量的工厂函数。无 `as`（`as const` 除外）、无 `any`。品牌只由契约守卫或 `admit` 授予。
17. **不做**：任何真实传输、SDK、任务表、`invoke`；`list_changed` 订阅（`changedNotified` 保持为假）；后台重连。

## 原则与约束

| ub-mode 条目 | 本规格的取舍 |
| --- | --- |
| 先做对 | 状态机与发布边界先有用例；并发用例用 deferred 排次序，不用 sleep |
| 其余 | 按 ub-mode 全文 |

| 判断或约束 | 拥有者 | 本规格的具体条目 |
| --- | --- | --- |
| 轴与拥有者 | `engineering-taste.md` | 四条轴：采用与资格（端口拥有）、连接生命周期（`Connection` 拥有）、清单采用（纯函数拥有，服务只做发布边界）、凭据与进程（端口拥有，服务只管句柄的取得与释放时点）。服务不让清单结果决定连接状态 |
| 领域边界 | `layers-and-dependencies.md` | 无新增外域概念 |
| 面向契约 | 成员 SPEC | 实现 S1、S3–S5、S7–S9、K1–K3、C 系列的调用方义务；`contract:` candidate |
| 防御与失败语义 | `docs/defensive-patterns.md` | 见下 |
| 演进政策 | `publication.md` | 无被替代实现 |

### 跨域概念的五问

不适用：本波不新增跨域概念。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | `refresh` 整份发布；`current`/`peer`/`inspect` 不连接 | `mcp` | 服务 + 替身用例 |
| 失败 | 每条 R1/R6/R7 的失败按条件给出；失败时保留原采用，`markUnavailable` 只在连接类失败 | `mcp` | 每条一例；变异 |
| 未知 | `effect-unknown` 带子因；存储不可用 `unknown`；不压成失败 | `mcp` | 用例 |
| 取消与清理 | `signal` 在发布边界核对；`close()` 只报告确认范围；`residual` 原样记 | `mcp` | 用例：`stop()` 答 `unconfirmed` 时状态 `lost(close-unconfirmed)` |
| 外部效果 | 进程启动与传输打开是外部效果；关闭不声称可逆 | `mcp` | 替身计数 |

可配置的策略：`McpConfig` 四项（必填无缺省）。连接时限来自采用配值或 `connectBound`。

## User Stories

1. 作为宿主装配者，我要用五个端口与一份配置得到四个核心服务，以便 W3 接上调用口而不改装配。
2. 作为读者，我要 `refresh` 一次就得到整份发布的清单或保留原采用的原因，以便不把半份清单当成全部。
3. 作为读者，我要并发 `refresh` 时较晚的结果不覆盖较新的采用，以便迟到刷新不回退。
4. 作为无权主体，我对任何接入点得到同一个答复，以便探不到别的租户的接入点。
5. 作为运维，我要 `inspect` 看到连接状态、残留进程与凭据有无，但看不到凭据值。
6. 作为宿主，我要 `closeAll` 只报告确认停止的范围，以便退出时知道还有什么没停。
7. 作为凭据拥有者，我要每条连接恰好取一次、用完释放一次的句柄，以便秘密不多留。

## Implementation Decisions

- `packages/mcp/mcp/src/`：`index.ts`、`config.ts`、`internal/connection.ts`、`internal/in-flight.ts`、`internal/gate.ts`、`internal/table.ts`（连接表与 `ensure`、`close`）、`discovery.ts`、`status.ts`、`connections.ts`、`inspection.ts`、`store/memory.ts`。
- `tests/`：`connection.spec.ts`（状态机穷举）、`in-flight.spec.ts`、`gate.spec.ts`、`ensure.spec.ts`、`refresh.spec.ts`（含并发）、`status.spec.ts`、`release.spec.ts`、`memory-store.spec.ts`（跑 `mcpCatalogStoreConformance`）、`doubles/scripted-transport.ts`。
- W3 接入点：`internal/table.ts` 的 `ensure`、`internal/in-flight.ts`、`internal/gate.ts` 的 `admitWithoutEligibility`。写者在成员 README「给下一波」节写明这三处的签名。

## Testing Decisions

- 先写红；红灯输出存 `tmp/closures/w2-mcp-core/red/`。
- 接缝：服务 + 五个契约替身 + 脚本化传输；聚合状态机穷举；内存存储过 CS 套件。
- 先例：`mcp-contract/tests/conformance.spec.ts`（套件用法）。
- 传感器与命令：同 [W1 规格](../../w1/mcp/spec.md#testing-decisions)表；L3 热点（`gate.ts`、`table.ts` 的键与句柄释放、`refresh` 发布边界）由 reduce 逐行读并派 implementation-reviewer。
- 不能声称的事：没有真实传输与真实进程；连接时限只用假时钟/`AbortSignal.timeout` 的小值测；没有跨进程故障。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| MC2-1 | `createMcpCore` 对不合法 `McpConfig` 抛 `RangeError`；合法时交出四个服务 | 用例 |
| MC2-2 | `Connection` 两种代际策略的每个合法转移与每个非法转移都有用例；迟到代际被拒 | `connection.spec.ts` |
| MC2-3 | `InFlightCalls`：占位查重一步、同租户同主体才能取消、不在表答 `unknown`、代际已换答 `unknown`、占位后发出前取消则不发出 | `in-flight.spec.ts` |
| MC2-4 | `admit` 的六种答复各一例；`AdmittedEndpoint` 不能在模块外构造（类型测试 + 运行时） | `gate.spec.ts`、`types.spec-d.ts` |
| MC2-5 | `ensure`：复用、重建、单飞、S4 四种配值缺陷、R6 四种连接失败各一例；失败后 `markUnavailable` 已写入且原采用不变；进程凭据句柄在失败时立即释放 | `ensure.spec.ts`；替身计数 |
| MC2-6 | `refresh`：`published`；`kept` 三种原因各一例；并发两次只一次 `published`，存储是较新的；发布边界的三项核对（代际、取消、资格）各一例 | `refresh.spec.ts` |
| MC2-7 | `current` 与 `peer` 不调用传输工厂（替身计数为 0）；`basisCurrent` 三态 | 用例 |
| MC2-8 | `status.inspect`/`list`：凭据四态、`use` 两态、`residual` 出现在 `lost`；`not-eligible` 不进 `list`；对无权主体存在与不存在同答 | `status.spec.ts` |
| MC2-9 | `release`/`closeAll`：`close()` 次序（替身调用序列）；`stop()` 三种范围对应的状态与报告；HTTP 句柄释放恰好一次 | `release.spec.ts` |
| MC2-10 | `createInMemoryCatalogStore` 过 `mcpCatalogStoreConformance()`（CS8 `NotApplicable`）；跨租户、跨对端账号、跨持有互不可见 | 套件 |

## 待决事项

| 缺口 | 影响的切片 | 处置 |
| --- | --- | --- |
| 无 | — | — |

## Out of Scope

- `ActionInvoker`、任务表、真实传输、SDK、`list_changed` 订阅、后台重连、Cordis、组页写回。

## Further Notes

- `model/mcp/connection.ts` 等草图写于 W1 之前：`CallMode` 相关内容已删，只取聚合分法与不变式。
- W3 的契约可加调整清单在 [schema-check.md](../schema-check.md)，本波不动契约。
