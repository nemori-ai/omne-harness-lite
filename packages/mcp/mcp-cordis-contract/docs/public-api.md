# MCP Cordis 定义的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，非类型行为归 [SPEC](../SPEC.md)，服务定义的正文归 [Cordis 说明](cordis.md)。七个接口的输入、输出与失败归 [mcp-contract SPEC](../../mcp-contract/SPEC.md)。

## 导出入口

| 入口                                       | 源码                              | 发布产物                             | 调用者                                                                                           |
| ------------------------------------------ | --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `@omne-harness/mcp-cordis-contract`        | [src/index.ts](../src/index.ts)   | `dist/index.js`、`dist/index.d.ts`   | 没有调用者。根入口是空导出                                                                       |
| `@omne-harness/mcp-cordis-contract/cordis` | [src/cordis.ts](../src/cordis.ts) | `dist/cordis.js`、`dist/cordis.d.ts` | 提供三个服务的插件（mcp-host-local），提供四个端口的实现方，使用服务的插件，只需要类型增补的一方 |

根入口与 Cordis 无关（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。需要接口类型的一方直接依赖 mcp-contract。`./cordis` 只有服务定义，不导入任何提供者（[性质 6](../SPEC.md#结果与不变量)）。只需要 `Context` 增补的一方用 `import type {} from '@omne-harness/mcp-cordis-contract/cordis'`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。

## 定义索引

### 根入口

没有导出。

### `./cordis`

| 名字                          | 种类     | 键                                                                                                                                                                                          | 接口与行为位置                                                                                            |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ActionDiscoveryService<P>`   | 抽象类   | `mcpActionDiscovery`                                                                                                                                                                        | `ActionDiscovery<P>`，见 [mcp-contract SPEC 的应用服务接口](../../mcp-contract/SPEC.md#services)          |
| `ActionInvokerService<P>`     | 抽象类   | `mcpActionInvoker`                                                                                                                                                                          | `ActionInvoker<P>`（`ActionCalls<P> & TaskControl<P>`），见同一节                                         |
| `EndpointStatusService<P, S>` | 抽象类   | `mcpEndpointStatus`                                                                                                                                                                         | `EndpointStatus<P, S>`，见同一节                                                                          |
| `AdoptionViewService<P, S>`   | 抽象类   | `mcpAdoptionView`                                                                                                                                                                           | `AdoptionView<P, S>`，见 [AV 节](../../mcp-contract/SPEC.md#port-adoption)                                |
| `UseEligibilityService<P>`    | 抽象类   | `mcpUseEligibility`                                                                                                                                                                         | `UseEligibility<P>`，见 [UE 节](../../mcp-contract/SPEC.md#port-eligibility)                              |
| `CredentialUseService<P>`     | 抽象类   | `mcpCredentialUse`                                                                                                                                                                          | `CredentialUse<P>`，见 [CU 节](../../mcp-contract/SPEC.md#port-credentials)；`acquire` 是带两个重载的属性 |
| `ProcessLandingService<P>`    | 抽象类   | `mcpProcessLanding`                                                                                                                                                                         | `ProcessLanding<P>`，见 [PL 节](../../mcp-contract/SPEC.md#port-landing)                                  |
| 键常量                        | 常量     | `mcpActionDiscoveryKey`、`mcpActionInvokerKey`、`mcpEndpointStatusKey`、`mcpAdoptionViewKey`、`mcpUseEligibilityKey`、`mcpCredentialUseKey`、`mcpProcessLandingKey`，取自对应类的 `provide` | 键值见 [SPEC 性质 1](../SPEC.md#结果与不变量)                                                             |
| `Context` 增补                | 类型增补 | 七个键                                                                                                                                                                                      | [SPEC 性质 4](../SPEC.md#结果与不变量)                                                                    |

调用者资格：本成员没有按调用方类分面的方法，不声明 intercept 配置。访问判断归 mcp-contract 的四个端口与它们的实现方。
