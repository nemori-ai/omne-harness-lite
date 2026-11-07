# Cordis 集成

本包提供 MCP 组的 Cordis 插件：`./cordis` 入口的插件工厂 `createMcpPlugin`。插件行为的唯一规范正文是 [SPEC「Cordis 插件」](../SPEC.md#cordis-plugin)：配置、端口的现取与缺席时的答复、换代、撤除与已知限制。本页写装配怎样用它、它依赖什么、它用到的 Cordis 机制，以及它怎样符合 IC 约定。服务键与抽象类归 [mcp-cordis-contract](../../mcp-cordis-contract/docs/cordis.md)，服务的行为归 [mcp 的 SPEC](../../mcp/SPEC.md) 与 [mcp-contract 的 SPEC](../../mcp-contract/SPEC.md)。Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。本页已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受。

本包的变体：根入口是传输工厂，没有 Cordis。本包按 `module` 变体建立，没有模板采用标识。模板没有「升为提供者」的命令，所以按[现有成员不自动迁移](../../../../docs/package-organization.md)的规则，`src/cordis.ts`、`tests/cordis-entry.spec.ts` 与 `tests/cordis-journey.spec.ts` 手工补入，本包不贴模板标识。`package-template scan` 把本成员读作 `service-provider` 变体，`structure` 为 `pass`，`findings` 为 0，`integration` 为 `unknown`（原因见[未覆盖](#未覆盖)）。

## 集成入口

`@omne-harness/mcp-host-local/cordis` 导出插件工厂 `createMcpPlugin(parts)` 与两个类型 `McpPluginParts`、`McpPluginConfig`。工厂经 kernel-basis 的 `definePlugin` 返回插件对象：

| 项         | 内容                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | `mcp`                                                                                                                                                                                                               |
| 工厂参数   | `McpPluginParts`：`principalKey`、`checkOutput` 必填；`clock`、`fetch` 可选。函数与本地对象不进配置（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)）                               |
| 配置       | `McpPluginConfig`：四个上界 `maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs` 与 `clientInfo`（`name`、`version`）。全部必填，没有缺省值。Schema 的判据见 [SPEC](../SPEC.md#cordis-plugin) |
| 依赖       | 没有 `inject`。四个端口是可选依赖，调用时现取（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）                                                                                       |
| 提供的服务 | `mcpActionDiscovery`、`mcpActionInvoker`、`mcpEndpointStatus`，登记在装载它的 fiber 上，共一条 fiber（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)）                                |
| 事件       | 没有                                                                                                                                                                                                                |

插件在 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 的插件树里由包名与导出名 `@omne-harness/mcp-host-local/cordis` 的 `createMcpPlugin` 标识。工厂参数由装配入口交给工厂，配置的五个字段是插件树行的数据。

装配要做的事：

- 由四个端口的实现方各装载一个 Service 子类（`mcpAdoptionView`、`mcpUseEligibility`、`mcpCredentialUse`、`mcpProcessLanding`）。没有装载的端口，插件按 [SPEC「端口缺席」](../SPEC.md#port-absent)答复。
- 只装载本插件一次。同一 isolate 装载两次的处置未定，见下文 IC-6。
- 要看到撤除时停止范围未确认的警告，日志导出器对 `mcp` 的级别要设为 2 或更高。Cordis 4.0.4 的导出器没有设级别时只导出 `error` 与 `info`。
- 落点或凭据句柄可能挂起时，卸载插件的宿主自己给 `fiber.dispose()` 一个期限。插件不设期限，见 [SPEC 的已知限制](../SPEC.md#cordis-plugin)。

## 生命周期与清理

撤除函数、警告、在途调用的答复与已知限制见 [SPEC「Cordis 插件」](../SPEC.md#cordis-plugin)的「撤除」与「已知限制」两项。本节只写依赖的 Cordis 机制：

- Cordis 4.0.4 的卸载对全部撤除函数做 `Promise.all`，逐个等待，所以 `dispose()` 在撤除函数结算之后才返回。
- 撤除函数的拒绝由卸载捕获并交 `ctx.logger.error`，卸载照常完成。`Logger` 收到 `AggregateError` 时逐个写出它装着的错误，不写 `AggregateError` 本身。
- Cordis 撤回三个服务键，之后 `ctx.get` 答 `undefined`。服务键的撤回与 `closeAll` 谁先谁后不改变答复：`closeAll` 之后到达的操作按 mcp-contract [S8](../../mcp-contract/SPEC.md#services) 答复。

## 依赖分类

| 依赖方                                                                                     | 怎样依赖                                                                                         | 换代或缺席时                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 本插件对四个端口                                                                           | 可选依赖，不 `inject`，每次端口调用 `ctx.get`                                                    | 见 [SPEC「端口缺席」](../SPEC.md#port-absent)与「换代」 |
| 使用三个服务的插件                                                                         | 按键取用，见 [mcp-cordis-contract 的依赖分类](../../mcp-cordis-contract/docs/cordis.md#依赖分类) | 插件卸载后键上没有服务                                  |
| 本包对 `@omne-harness/mcp`、`mcp-cordis-contract`、`kernel-basis` 与 `@deepseek-ai/cordis` | `package.json` 的生产依赖，引用它们的公开入口                                                    | 不适用                                                  |

## IC 符合性映射

| 规则                                                                           | 本包怎样符合                                                                                                                                          | 现在的证据                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1)   | 引用 mcp-cordis-contract 的定义，不另写键或类                                                                                                         | 源码；两个用例文件只用键常量                                                                                                                                                                                                                                                                           |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)   | 一个插件体里逐个 `new` 三个子类，共一条 fiber。理由：三个服务共用一次 `createMcp` 的三张表，分 fiber 时一个服务可以先于其余撤除，而其余仍在用共享的表 | `scan` 读数 `converged`；快层用例「provides the three services on load … and removes them when the plugin unloads」                                                                                                                                                                                    |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3)   | 三个服务子类 `extends` mcp-cordis-contract 的抽象类 `ActionDiscoveryService`、`ActionInvokerService`、`EndpointStatusService`，不另写 `@owner`        | 类型检查（抽象成员都实现）；源码                                                                                                                                                                                                                                                                       |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)   | 根入口不导入 Cordis，插件只从 `./cordis` 发布                                                                                                         | [public-entry.spec.ts](../tests/public-entry.spec.ts)：根入口的运行导出只有 `createLocalTransportFactory`；根入口不导入 Cordis 由源码核对（`src/index.ts` 只导出 `factory.ts` 与 `options.ts` 的定义）                                                                                                 |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)   | 只依赖 mcp-cordis-contract、mcp 与 kernel-basis 的公开入口，不依赖端口提供者；产品源码不导入契约的 `./testing`                                        | `lint:deps`；`scan` 读数 `unknown`（`docs/architecture/constraints.json` 未映射入口责任），人工核对：`src/cordis.ts` 的导入只有 Cordis 的类型、`@omne-harness/mcp`、`mcp-contract` 的类型、`mcp-cordis-contract/cordis`、`kernel-basis/cordis`、`operation-result` 与本包的 `factory.ts`、`options.ts` |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)   | 同一 isolate 重复装载的处置未定、未验证。只装一次的前提由装配承担                                                                                     | 没有                                                                                                                                                                                                                                                                                                   |
| [IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7)   | 提供者成员的限定名是 `mcp-host-local`：组名 `mcp` 加落点 `host-local`；插件名 `mcp` 是组名。键名归 mcp-cordis-contract                                | 源码；`package.json` 的 `name`                                                                                                                                                                                                                                                                         |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)   | 没有 `inject`：插件没有必需依赖                                                                                                                       | 源码                                                                                                                                                                                                                                                                                                   |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)   | 四个端口调用时现取，接受 `undefined`，不缓存；换代见 [SPEC](../SPEC.md#cordis-plugin)                                                                 | 快层缺席与换代用例；快层 `opens a Streamable HTTP endpoint …`（凭据端口按 `http-authorization` 用途被问到）；慢层「补上端口后发布」与采用换代用例                                                                                                                                                      |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) | 经 `definePlugin` 定义，配置 Schema 查形状；范围由 `createMcp` 与 `createLocalTransportFactory` 在 `apply` 里查；配置错误使加载失败                   | 快层配置用例：接受一份完整合法配置；逐行拒绝（含 `clientInfo` 内多余字段、`Date`、从原型继承字段与符号键），断言 `ValidationError` 与消息；`maxActions` 与 `probeTimeoutMs` 为 0 时的 `RangeError`                                                                                                     |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) | 插件由包名与导出名标识；函数与本地对象经工厂参数，配置只有可序列化的数据                                                                              | 源码；`McpPluginParts` 与 `McpPluginConfig` 由 `Pick` 与 `Omit` 从 `McpConfig`、`McpPorts`、`LocalTransportOptions` 推出；快层 `opens a Streamable HTTP endpoint through the fetch …`（`fetch` 部件）、慢层 `stamps the published catalog …`（`clock` 部件）                                           |

## 机制读数

| 机制                                                                              | 依据                                                                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| effect 的撤除函数之间并发释放                                                     | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) |
| 插件 `apply` 抛出使 fiber 失败，`ctx.plugin()` 的等待交出这个错误                 | [plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)；本包配置用例               |
| Schema 答 `issues` 时 `ctx.plugin()` 以 `ValidationError` 拒绝                    | Cordis 4.0.4 `lib/index.js` 的 `resolveConfig`；本包配置用例                                                                      |
| `dispose()` 等异步撤除函数结算；撤除函数的拒绝交 `ctx.logger.error`，卸载照常完成 | Cordis 4.0.4 `lib/index.js` 的 `_unload`；本包撤除用例与机制探针                                                                  |
| `Logger` 逐个写出 `AggregateError` 装着的错误                                     | Cordis 4.0.4 `lib/index.js` 的 `Logger._method`；本包机制探针                                                                     |
| 导出器没有设级别时不导出 `warn`（级别 2）                                         | Cordis 4.0.4 `lib/index.js` 的 `Logger._method`；本包警告用例的导出器设 `levels: { default: 2 }`                                  |

后四项还没有进入 basis，跨版本适用是待核验假设。Cordis 升版时重跑本包的 `tests/cordis-entry.spec.ts` 与 `tests/cordis-journey.spec.ts`。

## 验证义务

判据、使用例变红的反例与用例的对照，以及没有覆盖的项，见 [SPEC「Cordis 插件的验证」](../SPEC.md#cordis-plugin-verification)。

## 未覆盖

- `docs/architecture/constraints.json` 没有映射本包 `src/` 与 mcp-cordis-contract 的入口责任，`package-template scan` 为此报 `integration` 为 `unknown`，IC-5、LAYER-DIP、LAYER-ENTRY 与角色（ROLE）的条目都是 `unknown`；IC-2 的条目是 `converged`。该文件在 `docs/architecture/` 下，不归本包，本包不改。上表的人工核对栏写出了核对的内容。
- 其余见 [SPEC「Cordis 插件的验证」](../SPEC.md#cordis-plugin-verification)的「没有覆盖」。
