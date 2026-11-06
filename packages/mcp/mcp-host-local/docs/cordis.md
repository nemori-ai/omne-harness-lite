# Cordis 集成

本包提供 MCP 组的 Cordis 插件：`./cordis` 入口的插件工厂 `createMcpPlugin`。服务键与抽象类归 [mcp-cordis-contract](../../mcp-cordis-contract/docs/cordis.md)，本页写插件怎样装载、依赖什么、撤除时发生什么，以及它怎样符合 IC 约定。服务的行为归 [mcp 的 SPEC](../../mcp/SPEC.md) 与 [mcp-contract 的 SPEC](../../mcp-contract/SPEC.md)。Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。本页是候选，尚未取得技术接受。

本包的变体：根入口是传输工厂，没有 Cordis。本包原为 `module` 变体，没有模板采用标识。模板没有「升为提供者」的命令，所以按[现有成员不自动迁移](../../../../docs/package-organization.md)的规则，`src/cordis.ts` 与 `tests/cordis-entry.spec.ts` 手工补入，本包不贴模板标识。加 `./cordis` 之前的 `package-template scan` 读数：`variant` 为 `module`，`structure` 为 `pass`，`findings` 为 0，`integration` 为 `unknown`。加入之后，`scan` 把本成员读作 `service-provider` 变体，`structure` 仍为 `pass`，`findings` 为 0，`integration` 仍为 `unknown`。

## 集成入口

`@omne-harness/mcp-host-local/cordis` 导出插件工厂 `createMcpPlugin(parts)` 与两个类型 `McpPluginParts`、`McpPluginConfig`。工厂经 kernel-basis 的 `definePlugin` 返回插件对象：

| 项         | 内容                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | `mcp`                                                                                                                                                                                                                                               |
| 工厂参数   | `McpPluginParts`：`principalKey`、`checkOutput` 必填；`clock`、`fetch` 可选，缺席时取 `createMcp` 与 `createLocalTransportFactory` 的缺省。函数与本地对象不进配置（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)） |
| 配置       | `McpPluginConfig`：`maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs`、`clientInfo`（`name`、`version`）。全部必填，没有缺省值                                                                                              |
| 依赖       | 没有 `inject`。四个端口是可选依赖，调用时现取（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）                                                                                                                       |
| 提供的服务 | `mcpActionDiscovery`、`mcpActionInvoker`、`mcpEndpointStatus`，登记在装载它的 fiber 上，共一条 fiber（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）                                                                |
| 事件       | 没有                                                                                                                                                                                                                                                |

插件体按次序做五件事：

1. 造四个端口适配器（见[端口的现取](#端口的现取)）。
2. 造内存清单库 `createInMemoryCatalogStore()` 与本地传输工厂 `createLocalTransportFactory({ clientInfo, probeTimeoutMs, fetch })`。`fetch` 只在工厂参数给了时传。
3. 调一次 `createMcp(ports, { principalKey, maxListingPages, maxActions, instructionsByteLimit })`。三个服务共用它的一张连接表、一张在途表与一张任务表。
4. 登记撤除函数（见[生命周期与清理](#生命周期与清理)）。
5. 逐个 `new` 三个服务子类。子类留在本包内部，把每个方法转给 `createMcp` 交出的 `discovery`、`invoker`、`status`。`inspection` 与 `connections` 不提供成服务。

### 配置的检查

配置的 Standard Schema 只查形状：五个字段都在，四个上界是数，`clientInfo` 是对象且 `name` 与 `version` 都是文本，两层都没有多余字段。不合形状时交 `issues`，Cordis 使加载失败。Schema 交出一份新对象，之后改动输入不影响插件。

取值范围不在 Schema 里重写：`createLocalTransportFactory` 的选项检查与 `createMcp` 的配置检查在 `apply` 里抛 `RangeError`，加载照样失败（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。范围规则只有一处来源。加载失败时不登记撤除函数，也不提供服务。

插件在 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 的插件树里由包名与导出名 `@omne-harness/mcp-host-local/cordis` 的 `createMcpPlugin` 标识。工厂参数由装配入口交给工厂，配置的五个字段是插件树行的数据。

## 端口的现取

四个端口适配器每次被调用时，从 `apply` 收到的 `ctx` 用 `ctx.get(<键常量>)` 取服务：

| 情形                     | 答复                                                                  | 契约出处                                           |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| 端口在场                 | 把参数原样转过去，答复原样交回                                        | —                                                  |
| `mcpAdoptionView` 缺席   | `endpoints` 与 `endpoint` 答 `{ failure: 'unknown' }`                 | [AV6](../../mcp-contract/SPEC.md#port-adoption)    |
| `mcpUseEligibility` 缺席 | `check` 答 `{ kind: 'unknown' }`                                      | [UE5](../../mcp-contract/SPEC.md#port-eligibility) |
| `mcpCredentialUse` 缺席  | `acquire` 答 `{ failure: 'unknown' }`。两个用途各自转给端口对应的重载 | [CU6](../../mcp-contract/SPEC.md#port-credentials) |
| `mcpProcessLanding` 缺席 | `start` 答 `{ failure: 'unknown' }`                                   | [PL4](../../mcp-contract/SPEC.md#port-landing)     |

适配器不缓存取到的引用，也不用服务方法里调用方的上下文。缺席不放行：`mcp` 按默认拒绝处理 `unknown`，依赖该端口的操作不建连、不交动作。各操作的答复归 mcp-contract：采用或资格不可读时答 `unknown`（[S1](../../mcp-contract/SPEC.md#services)、[R1](../../mcp-contract/SPEC.md#refusals)）；凭据不可读时答 `credential-unavailable`（`unknown`），落点不可读时答 `landing-unavailable`（R6）。凭据端口只在接入点的 `auth` 不是 `none` 时被调用（[mcp 的 MC-5](../../mcp/SPEC.md#mc-5)）。

### 换代时旧引用的处置

端口提供者换代后，下一次端口调用取新的提供者。插件不因换代重跑，连接表不重建。已建连接持有的凭据句柄与进程句柄是旧提供者交出的，连接存续期间照旧使用，连接关闭时按 [MC-10](../../mcp/SPEC.md#mc-10) 释放：进程句柄 `stop()`，凭据句柄 `release()`。采用换代后修订不同时，下一次要连接的操作按 MC-5 关闭旧修订的连接，按新的采用建连。

## 生命周期与清理

插件登记一个撤除函数，内容只有一步：`await services.connections.closeAll()`，标签 `mcp.closeAll`。fiber 卸载时：

- Cordis 撤回三个服务键，之后 `ctx.get` 答 `undefined`。
- 撤除函数等 `closeAll` 结算。`closeAll` 先把表置为已关停（mcp-contract [S8](../../mcp-contract/SPEC.md#services)），之后到达的操作答关停的答复；再并发关闭每条连接：关传输、停进程、释放凭据句柄（MC-10）。服务键的撤回与 `closeAll` 谁先谁后不改变答复。
- Cordis 4.0.4 的卸载对全部撤除函数做 `Promise.all`，逐个等待，所以 `dispose()` 在 `closeAll` 结算之后才返回。
- 撤除时已发出、还没有应答的调用：传输关闭时它的答复以 `no-answer`（`abandoned`）兑现，调用答 `sent`，结局 `unknown`（`abandoned`）（mcp-contract T5、[O6](../../mcp-contract/SPEC.md#outcomes)、S8）。效果未知，不压成失败。

撤除函数不捕获。`closeAll` 只在 `mcp` 本包有编程错误时以 `AggregateError` 拒绝（MC-10），撤除函数把它原样抛出，Cordis 的卸载捕获它并交 `ctx.logger.error`，卸载照常完成。Cordis 4.0.4 的 `Logger` 收到 `AggregateError` 时逐个写出它装着的错误，不写 `AggregateError` 本身。

`closeAll` 不声称进程已停，报告的是实际确认的范围，插件丢弃这份报告。撤除不撤回已经发出的调用。

## 依赖分类

| 依赖方                                                            | 怎样依赖                                                                                         | 换代或缺席时                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 本插件对四个端口                                                  | 可选依赖，不 `inject`，每次调用 `ctx.get`                                                        | 缺席答 `unknown`；换代后下一次调用用新实例 |
| 使用三个服务的插件                                                | 按键取用，见 [mcp-cordis-contract 的依赖分类](../../mcp-cordis-contract/docs/cordis.md#依赖分类) | 插件卸载后键上没有服务                     |
| 本包对 `@omne-harness/mcp`、`mcp-cordis-contract`、`kernel-basis` | `package.json` 的生产依赖，引用它们的公开入口                                                    | 不适用                                     |

## IC 符合性映射

| 规则                                                                           | 本包怎样符合                                                                                                                                          | 现在的证据                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1)   | 引用 mcp-cordis-contract 的定义，不另写键或类                                                                                                         | 源码；[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)        |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)   | 一个插件体里逐个 `new` 三个子类，共一条 fiber。理由：三个服务共用一次 `createMcp` 的三张表，分 fiber 时一个服务可以先于其余撤除，而其余仍在用共享的表 | 用例「removes the three services and stops the peer process…」     |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)   | 根入口不导入 Cordis，插件只从 `./cordis` 发布                                                                                                         | [public-entry.spec.ts](../tests/public-entry.spec.ts)              |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)   | 只依赖 mcp-cordis-contract、mcp 与 kernel-basis 的公开入口，不依赖端口提供者；产品源码不导入契约的 `./testing`                                        | `lint:deps`；源码                                                  |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)   | 没有 `inject`：插件没有必需依赖                                                                                                                       | 源码                                                               |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)   | 四个端口调用时现取，接受 `undefined`，不缓存；换代时旧引用的处置见上文                                                                                | 缺席与换代用例                                                     |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) | 经 `definePlugin` 定义，配置 Schema 查形状；范围由 `createMcp` 与 `createLocalTransportFactory` 在 `apply` 里查；配置错误使加载失败                   | 配置用例（接受一份完整合法配置；拒绝缺字段、多字段、错类型与越界） |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) | 插件由包名与导出名标识；函数与本地对象经工厂参数，配置只有可序列化的数据                                                                              | 源码                                                               |

## 机制读数

| 机制                                                                              | 依据                                                                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| effect 的撤除函数之间并发释放                                                     | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) |
| 插件 `apply` 抛出使 fiber 失败，`ctx.plugin()` 的等待交出这个错误                 | [plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)；本包配置用例               |
| `dispose()` 等异步撤除函数结算；撤除函数的拒绝交 `ctx.logger.error`，卸载照常完成 | Cordis 4.0.4 `lib/index.js` 的 `_unload`；本包撤除用例与机制探针                                                                  |
| `Logger` 逐个写出 `AggregateError` 装着的错误                                     | Cordis 4.0.4 `src/logger.ts` 的 `_method`；本包机制探针                                                                           |

后两项还没有进入 basis，跨版本适用是待核验假设。Cordis 升版时重跑本包的 `tests/cordis-entry.spec.ts`。

## 验证义务

本包验证，全部在 [tests/cordis-entry.spec.ts](../tests/cordis-entry.spec.ts)（慢层，起脚本化对端进程）：

- 一份完整合法的配置使插件装载成功，三个键取得到服务，在本地 stdio 传输与脚本化对端进程上走通「刷新 → 调用」。
- 三个服务子类的每个方法经插件调用一次并断言答复：`current`、`refresh`、`peer`；`invoke`、`continueWithInput`、`cancel`；`queryTask`、`taskResult`、`provideTaskInput`、`cancelTask`；`inspect`、`list`。
- 四个端口逐个缺席（其余三个照常提供）时，依赖它的操作按契约答复，不起进程；补上端口后清单仍是 `not-acquired`。
- 资格端口换代后，下一次操作答拒绝；采用端口换代后，下一次 `refresh` 按新的采用建连并发布新的清单。
- 撤除时对端进程已退出（`ProcessHandle.exited` 已兑现），三个键取不到；撤除时在途的调用答 `unknown`（`abandoned`）。
- Cordis 机制探针：撤除函数以 `AggregateError` 拒绝时，`dispose()` 照常返回，`ctx.logger` 逐个收到它装着的错误。
- 配置：Schema 对一份完整合法配置交出等值的新对象；对非对象、缺字段、多字段、上界不是数、`clientInfo` 缺字段、`clientInfo.name` 不是文本各交一条确切的 `issues`，插件加载失败；`maxActions` 为 0 与 `probeTimeoutMs` 为 0 各以 `RangeError` 使加载失败。

## 未覆盖

- 插件的撤除函数不捕获 `closeAll` 的 `AggregateError`：外部无法诱发这条路径（只有 `mcp` 本包的编程错误才产生它，见 [MC-10](../../mcp/SPEC.md#mc-10)）。机制一半由探针用例证明；插件一半（撤除函数只有一步 `await`，不包 `try`）由评审逐行核对。
- 四个端口只用 `@omne-harness/mcp-contract/testing` 的内存替身与测试夹具的落点验证。真实的采用、资格、凭据与落点实现，要等它们的实现方装载后验证。
- Streamable HTTP 上的插件旅程：未执行。传输本身由本包的 HTTP 用例与 `e2e/` 覆盖。
- 进程树的实际停止范围：未测量。测试落点的 `stop()` 只停根进程。
- 同一 isolate 重复装载与多个 isolate 并存（[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)）：未验证。
- 应用插件树中的装配与真实消费者：未执行。
- `docs/architecture/constraints.json` 没有映射本包 `src/` 与 mcp-cordis-contract 的入口责任，`package-template scan` 为此报 `integration` 为 `unknown`。该文件归集成线，本包不改。
