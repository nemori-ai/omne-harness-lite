# Cordis 集成


PanQiWei 已接受这一节的设计，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。Cordis 只负责装配。领域语义留在[模型](model.md)。根入口 `src/index.ts` 导出那些类型和操作签名，不导入 `@deepseek-ai/cordis`，也不导入 `./cordis`。集成入口是本包的 `./cordis`。`package.json` 导出这个入口。

这一刀只有一个服务接缝。键是 `executionEnvironment`。定义写一次。

```ts
abstract class ExecutionEnvironmentService extends Service {
  static readonly provide = "executionEnvironment"
  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentService.provide)
  }
  abstract resolvePlacement(input: {
    tenantId: string
    callId: string
    binding: EnvironmentBinding
    facilities: readonly string[]
  }): Promise<
    | { kind: "placement"; binding: EnvironmentBinding; continuity: EnvironmentContinuity }
    | { kind: "rejected"; reason: "notAuthorized" | "noMatchingEnvironment" }
  >
  abstract acquire(input: {
    tenantId: string
    callId: string
    binding: EnvironmentBinding
    facilities: readonly string[]
  }): Promise<
    | { kind: "acquired"; lease: EnvironmentLease }
    | { kind: "rejected"; reason: "missingFacility" | "noMatchingEnvironment" | "notAuthorized" }
  >
  abstract registerProvider(provider: EnvironmentProvider): () => Promise<void>
}
const EXECUTION_ENVIRONMENT = ExecutionEnvironmentService.provide
```

类上写 `@owner packages/execution/execution-environment`。登记表实现继承这个类并提供键。设施提供者不继承它，也不另写键。它们把 `EnvironmentProvider` 交给 `registerProvider`。消费者从 `./cordis` 引用 `EXECUTION_ENVIRONMENT`。租户和调用身份是参数，不从 `ctx` 或插件实例推断。

`registerProvider` 在方法里用 `this.ctx.effect` 登记，并返回撤除函数。登记落在调用方的 fiber 上。调用方卸下，登记就撤。登记表不自己记一份名单再等人来注销。

宿主文件提供者不是第二个服务键。它是一个插件，导出名字是 `hostFilesPlugin`。`inject` 里写 `EXECUTION_ENVIRONMENT`，装上时调用 `registerProvider`，声明自己只覆盖 `host_machine` 和 `files`。插件树用包名 `@omne-harness/execution-environment` 和 `./cordis` 的 `hostFilesPlugin` 来标识它。配置只放可序列化的字段。回调和打开文件的函数不进插件树。

沙箱提供者以后用同一个键登记，声明自己的绑定层和连续性。它不写进宿主插件的 `inject`。登记表按绑定层和所要设施匹配同一个提供者。落点和租约都用这个提供者的连续性。没有匹配的提供者，`acquire` 的结果是 `noMatchingEnvironment` 或 `missingFacility`，不改用 `host_machine`。

资源恢复是另一个接缝。它不进这个 `./cordis`。这一刀也不声明事件。
