# @omne-harness/mcp-cordis-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。本包只有 MCP 的 Cordis 服务定义：七个抽象 `Service`、它们的服务键与 `Context` 增补。公开形状归 [src/cordis.ts](src/cordis.ts)，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包没有运行逻辑：抽象类的方法都是抽象成员，不做核对，不持有状态。

## 范围与依据

状态：已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受。下文「本版本」指成员版本 0.0.0。

| 依据                                                                    | 本规格采用的范围                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IC 约定](../../../docs/architecture/cordis-integration-conventions.md) | [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)、[IC-7](../../../docs/architecture/cordis-integration-conventions.md#ic-7) 至 [IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9) 对 MCP 的七个接缝的适用 |
| [MCP 契约规格](../mcp-contract/SPEC.md)                                 | 三个服务接口 `ActionDiscovery`、`ActionInvoker`（`ActionCalls` 与 `TaskControl`）、`EndpointStatus`（[应用服务接口](../mcp-contract/SPEC.md#services)），四个需求端口 `AdoptionView`、`UseEligibility`、`CredentialUse`、`ProcessLanding`（AV、UE、CU、PL 各节）。它们的输入、结果与失败归该规格                                       |
| [MCP 能力组](../README.md#成员与依赖)                                   | 本成员的职责与允许的依赖：只依赖 `mcp-contract` 与 Cordis 发布包                                                                                                                                                                                                                                                                       |

Cordis 采用发布包 `@deepseek-ai/cordis@4.0.4`。

本成员只认通用角色：服务的消费者、端口的提供者。它不认识任何调用方类型，也不点名端口的实现方。主体类型 `P` 与作用域类型 `S` 是类型参数，本成员不解释它们。

## 结果与不变量

本成员必须保持下列性质。

1. 七个服务键只由各抽象类的 `static readonly provide` 给出。抽象类的构造函数以 `<类>.provide` 调用 `super`。`./cordis` 另导出七个键常量，各取自对应类的 `provide`。消费者引用键常量，写 `ctx.get(mcpAdoptionViewKey)` 这样的调用；常量的字面量类型使 `ctx.get` 有类型。提供者 `extends` 抽象类，不另写键，也不自己 `ctx.provide` 这个键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。七个键互不相同。

   | 键                   | 键常量                  | 抽象 Service                  | `implements`           | 接口出处                              |
   | -------------------- | ----------------------- | ----------------------------- | ---------------------- | ------------------------------------- |
   | `mcpActionDiscovery` | `mcpActionDiscoveryKey` | `ActionDiscoveryService<P>`   | `ActionDiscovery<P>`   | `@omne-harness/mcp-contract`          |
   | `mcpActionInvoker`   | `mcpActionInvokerKey`   | `ActionInvokerService<P>`     | `ActionInvoker<P>`     | `@omne-harness/mcp-contract`          |
   | `mcpEndpointStatus`  | `mcpEndpointStatusKey`  | `EndpointStatusService<P, S>` | `EndpointStatus<P, S>` | `@omne-harness/mcp-contract`          |
   | `mcpAdoptionView`    | `mcpAdoptionViewKey`    | `AdoptionViewService<P, S>`   | `AdoptionView<P, S>`   | `@omne-harness/mcp-contract/provider` |
   | `mcpUseEligibility`  | `mcpUseEligibilityKey`  | `UseEligibilityService<P>`    | `UseEligibility<P>`    | `@omne-harness/mcp-contract/provider` |
   | `mcpCredentialUse`   | `mcpCredentialUseKey`   | `CredentialUseService<P>`     | `CredentialUse<P>`     | `@omne-harness/mcp-contract/provider` |
   | `mcpProcessLanding`  | `mcpProcessLandingKey`  | `ProcessLandingService<P>`    | `ProcessLanding<P>`    | `@omne-harness/mcp-contract/provider` |

2. 每个抽象类 `extends` Cordis 的 `Service`，`implements` 上表的接口，类上的 JSDoc 写 `@owner packages/mcp/mcp-cordis-contract`。接缝出自操作类型，没有契约 ID，所以写 `@owner`（[IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。`ActionInvoker<P>` 是 `ActionCalls<P> & TaskControl<P>` 的类型别名，`ActionInvokerService` 照样 `implements` 它，七个方法都是抽象方法。类不写 `static inject`（[IC-8](../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。
3. 抽象方法的参数与结果用 `Parameters` 与 `ReturnType` 从接口推出，同一组签名不写两份。例外是 `CredentialUseService` 的 `acquire`：接口给它两个重载，`Parameters` 只取最后一个，所以它写成 `abstract readonly acquire: CredentialUse<P>['acquire']`，保留两个重载。子类以属性提供它。
4. `./cordis` 增补 `Context`，七个属性名与键相同。泛型类的类型参数取 `unknown`：装配的可信身份适配器可以收窄它们，实现仍在运行时核对每个输入。
5. 根入口没有运行导出，不导入 `@deepseek-ai/cordis`（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。`./cordis` 的运行导出恰为七个抽象类与七个键常量。本成员没有 `./testing` 入口：四个端口的替身已在 `@omne-harness/mcp-contract/testing`。
6. `./cordis` 只导入 `@omne-harness/mcp-contract` 的类型与 `@deepseek-ai/cordis`，不导入任何提供者（[IC-5](../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。
7. 本成员不声明事件，不增补 `Events`。
8. `EndpointInspection` 与 `Connections` 没有键。`EndpointInspection` 是资产类别协议，经资产的类别登记接入；`Connections.closeAll` 由提供三个服务的插件在撤除时调用，`release` 没有按服务键取用的消费者。重新判断的条件：出现要按服务键释放连接的消费者。
9. 四个端口服务 `mcpAdoptionView`、`mcpUseEligibility`、`mcpCredentialUse` 与 `mcpProcessLanding` 对使用它们的插件是可选依赖：没有人把它们写进 `inject`。使用方每次调用时用 `ctx.get(<键常量>)` 现取，接受 `undefined`，不缓存取到的引用（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。缺席时答什么、换代的粒度由使用这四个端口的提供者成员兑现，`mcp-host-local` 的规则见其 [SPEC「Cordis 插件」](../mcp-host-local/SPEC.md#port-absent)。

## 所有权、失败与生命周期

| 事物                                                                                   | 拥有者                                     | 结束                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| 七个服务键与抽象类                                                                     | 本成员                                     | 随包                                                     |
| `mcpActionDiscovery`、`mcpActionInvoker`、`mcpEndpointStatus` 的实例                   | 装载提供者的插件的 fiber                   | 该 fiber 卸载。之后 `ctx.get` 答 `undefined`             |
| `mcpAdoptionView`、`mcpUseEligibility`、`mcpCredentialUse`、`mcpProcessLanding` 的实例 | 装载它们的插件的 fiber，由端口的实现方装配 | 该 fiber 卸载。之后使用方现取不到，按性质 9 由使用方答复 |

本成员没有状态、资源与外部效果，没有需要撤除的东西，也没有本成员自己的失败。服务换代时，使用方下一次调用现取到新的实例，旧引用不被持有。换代时在途的端口调用怎样处置由使用方规定，`mcp-host-local` 的规则见其 [SPEC「Cordis 插件」](../mcp-host-local/SPEC.md#cordis-plugin)。连接、进程与凭据句柄的收口归提供三个服务的插件与 [mcp 的 MC-10](../mcp/SPEC.md#mc-10)。

## 组合与验证

本成员消费 [mcp-contract 的 SPEC](../mcp-contract/SPEC.md#services) 的七个接口，不复制它们的行为。

| 义务                                                                                        | 验证方法                                                                                                                                         | 前提与未覆盖                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 性质 1：键只写一次，值如表所列；键常量等于 `provide`；互不相同                              | [tests/cordis-entry.spec.ts](tests/cordis-entry.spec.ts) 逐个断言 `provide` 的字面值、键常量等于 `provide`，以及七个键互不相同                   | 键在源码里只有 `provide` 一处，由本测试与代码审阅共同保证 |
| 性质 1 与所有权表：七个类各有一个最小具体子类，装载后键上是该子类的实例，卸载后键上没有服务 | 同一测试文件的表格用例，真实 Cordis 4.0.4 的 `Context`                                                                                           | 子类是测试里的最小实现，方法不被调用，不是提供者          |
| 性质 5：导出集合恰为七个类与七个键常量                                                      | 同一测试文件的导出集合断言；[tests/public-entry.spec.ts](tests/public-entry.spec.ts) 断言根入口没有运行导出、源码不导入 Cordis、构建产物没有导入 | 根入口导入边界只核对 `src/index.ts` 与 `dist/index.js`    |
| 性质 6：不导入提供者                                                                        | `package.json` 的依赖只有 `mcp-contract` 与 Cordis；`lint:deps`                                                                                  | 不由运行测试覆盖                                          |
| 性质 3、4：签名与 `Context` 增补                                                            | `tsc` 类型检查；mcp-host-local 的子类与测试在编译期使用它们，`acquire` 的两个重载由其适配器按用途分支调用                                        | 类型不是运行时校验                                        |
| 性质 9：缺席与换代                                                                          | 归使用方：mcp-host-local 的 [SPEC「Cordis 插件的验证」](../mcp-host-local/SPEC.md#cordis-plugin-verification)                                    | 本成员不验证                                              |

命令：在成员目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试经包名导入 `dist`，所以先构建再测试。

没有覆盖：Cordis 升版后键与装载读数的跨版本适用。升版时重跑本成员与 mcp-host-local 的测试。`package-template scan` 对本成员的 IC-1、IC-3、IC-5 读数是 `unknown`：`docs/architecture/constraints.json` 没有映射本成员入口的责任，该文件归集成线，本成员不改。人工核对见 [docs/cordis.md 的 IC 符合性映射](docs/cordis.md#ic-符合性映射)。
