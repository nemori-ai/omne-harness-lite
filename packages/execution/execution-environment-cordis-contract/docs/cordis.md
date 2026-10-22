# 执行环境的 Cordis 定义

本页是执行环境这一接缝的 Cordis 定义正文：服务键、抽象 `Service`、方法分面、intercept 配置、依赖分类、登记与撤除协议，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 9。领域行为归 [execution-environment-contract SPEC](../../execution-environment-contract/SPEC.md)，登记表机制归 [execution-environment](../../execution-environment/docs/architecture.md)，Service 实现、撤除顺序与宿主提供者归 [execution-environment-host-local](../../execution-environment-host-local/docs/cordis.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，本页不复制。

接受范围：本页承接 #278 已接受的 Cordis 集成设计，见[技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。下列设计沿用该接受，原文义不变：

- 执行环境只有一个服务键 `executionEnvironment`，定义只写一次，由抽象 `Service` 的 `provide` 给出。
- Service 实现继承这个抽象类，不另写键。提供者不继承它，经登记面登记。
- 登记在方法里用 `this.ctx.effect`，落在调用方的 fiber 上；调用方卸下，登记就撤。
- 宿主提供者是插件，不是第二个服务键。沙箱提供者以后用同一个键登记。
- 租户与调用身份是参数，不从 `ctx` 或插件实例推断。插件配置只放可序列化的字段。
- 本接缝不声明事件。

下列部分按新的成员边界改写，未经技术接受：

| 改写 | 依据 |
| --- | --- |
| 服务定义从机制成员移到本成员，`@owner` 指向本成员 | [组架构](../../docs/architecture.md)的成员切分 |
| 方法签名从契约的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations` 推出：带访问身份、请求方作用域、幂等键、账本与守卫，并增加 `registerFacility` | 契约 [SPEC](../../execution-environment-contract/SPEC.md)；产品正文执行环境第 2 版[环境、落点与资源的概念](../../../../.meta_harness/design/product/execution-environments/design.md#环境落点与资源的概念) |
| 恢复两操作 `recoverOwned` 与 `releaseScope` 放在同一个服务上，不另开接缝 | 产品正文[恢复授权与作用域收场](../../../../.meta_harness/design/product/execution-environments/design.md#恢复授权与作用域收场)；[IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1) |
| 恢复授权端口另有服务键 `executionRecoveryAuthority` | [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)、[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) |
| intercept 配置声明调用方类 | [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)：调用方类是装配事实，不是授权 |

现状：`src/cordis.ts` 已有执行环境与恢复授权两个抽象类、两个键常量、intercept 配置类型与 `Context` 增补。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 服务定义

| 定义 | 形状 | 依据 |
| --- | --- | --- |
| 服务键 | `executionEnvironment`，只由 `ExecutionEnvironmentService.provide` 给出。`executionEnvironmentKey` 取自它 | 性质 1，[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7) |
| 抽象类 | `ExecutionEnvironmentService<P> extends Service<ExecutionEnvironmentIntercept>`，构造函数以 `ExecutionEnvironmentService.provide` 调 `super`。它 `implements` 契约的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations` | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| 类的 JSDoc | `@owner packages/execution/execution-environment-cordis-contract`。接缝出自操作类型，没有契约 ID，所以写 `@owner` | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| intercept 配置类型 | `ExecutionEnvironmentIntercept = { caller: 'integrator' \| 'maintainer' \| 'provider' }` | 性质 4 |
| `Context` 增补 | `executionEnvironment: ExecutionEnvironmentService<unknown>`；`executionRecoveryAuthority: ExecutionRecoveryAuthorityService` | 性质 3、性质 9 |
| 恢复授权服务键 | `executionRecoveryAuthority`，只由 `ExecutionRecoveryAuthorityService.provide` 给出。`executionRecoveryAuthorityKey` 取自它 | 性质 9，[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) |
| 恢复授权抽象类 | `ExecutionRecoveryAuthorityService extends Service`，`implements` 契约的 `RecoveryAuthority`，JSDoc 写 `@owner packages/execution/execution-environment-cordis-contract` | 性质 9，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| 事件 | 没有 | 性质 6 |

八个方法分三面。方法的输入、结果与失败归契约，本表只说明谁调用、本成员加了什么 Cordis 承诺。

| 面 | 方法 | 调用方类 | 本成员加的 Cordis 承诺 |
| --- | --- | --- | --- |
| 环境面 | `resolvePlacement`、`acquire`、`inspectAcquisition`、`describe` | `integrator` | 没有额外承诺。访问身份、请求方作用域、要求、幂等键、账本与守卫都是参数（[契约的获取与租约](../../execution-environment-contract/SPEC.md#获取与租约)） |
| 恢复面 | `recoverOwned`、`releaseScope` | `maintainer` | 调用方类声明见 [intercept 配置与调用方类](#intercept-配置与调用方类)。恢复授权是参数，由端口核对（[契约的恢复](../../execution-environment-contract/SPEC.md#恢复)） |
| 登记面 | `registerFacility`、`registerProvider` | `provider` | 登记即效应，登记落在调用方 fiber 上。见[登记与撤除协议](#登记与撤除协议) |

八个公开成员都写成模板方法，不写成函数字段；它们先核对，再调用对应的 `protected abstract on…` 钩子。理由：经调用方取到的服务是一层代理，方法里读 `this.ctx` 得到调用方的上下文（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。登记面要靠这一点把效应落在调用方 fiber 上。

设施不是服务，提供者也不是服务。设施拥有者与提供者都经 `executionEnvironment` 的登记面登记。

本成员另定义一个服务键 `executionRecoveryAuthority`。恢复授权端口是装配入口交给执行环境的运行时对象，按 [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 不进插件树，由装配入口以 `ExecutionRecoveryAuthorityService` 的子类装载提供。它对 Service 实现是可选依赖（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）：Service 实现不把它写进 `inject`，每次恢复操作用 `ctx.get` 现取，取不到时按「不可用」收场。Service 实现从自己装载时的上下文现取，不从服务方法里调用方的上下文取。理由：服务方法里的 `this.ctx` 是调用方的上下文（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)），从那里取，调用方就能自己提供一个恢复授权端口给自己授权（性质 9）。恢复授权的语义仍归[契约的恢复](../../execution-environment-contract/SPEC.md#恢复)。

## intercept 配置与调用方类

调用方插件可以用对象形式的 `inject` 声明自己的调用方类：

```ts
export const inject = {
  executionEnvironment: { caller: 'maintainer' },
}
```

对象形式仍然是必需依赖。对象里的值只是这项服务的 intercept 配置，不是「可选」标记（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)）。所以 `executionEnvironment` 不在场时，调用方插件停在 `PENDING`。

| 调用方类 | 用哪些方法 | 典型调用方 |
| --- | --- | --- |
| `integrator` | 环境面四个方法 | 集成方的适配器插件 |
| `maintainer` | 恢复面两个方法 | 维护者插件，持有集成方签发的恢复授权 |
| `provider` | 登记面两个方法 | 提供者插件与设施拥有者插件 |

调用方类是装配声明的一致性检查，不是访问控制（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。调用方类由调用方自己写在 `inject` 里，所以它只能发现装配写错，不能拦住有意冒充的插件。恢复两操作每次仍由恢复授权端口核对，调用方类不代替这次核对。

登记环境提供者与设施声明的权限归装配：只有插件树里列出的插件可以登记。运行中按作用域装上、不进插件树的插件（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）不得登记环境提供者或设施声明。

明确缺项：这条登记权限现在没有强制执行点，任何 `inject` 了本服务的插件都能调用登记面。强制执行点由服务定义的拥有者（本成员）与应用装配的拥有者一起定义。

八个模板方法在入口通过 `this[Service.resolveConfig]()` 读取调用方声明。环境与恢复面未声明放行；登记面必须明确声明 `provider`。非法声明或错面调用被拒绝：六个有拒绝通道的方法返回 `callerMismatch`，登记面抛出 `CallerClassMismatch`。祖先声明可继承，近者覆盖远者；完全未声明读取到 `{}`。这项核对不授予访问资格。真实装载读数及其边界见[机制读数与假设](#机制读数与假设)。

## 登记与撤除协议

本成员按 [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 的「登记即效应」定义登记面（性质 5）：

1. 提供者插件或设施拥有者插件 `inject` 了 `executionEnvironment`，在自己的插件体里经 `ctx.executionEnvironment` 调用 `registerProvider` 或 `registerFacility`。
2. 服务实现在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，所以效应落在调用方插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
3. 方法返回撤除函数。显式调用撤除函数与调用方 fiber 卸载都调用登记表的同一个撤除。显式调用可以重试；fiber 卸载只调用一次。
4. 撤除提供者的登记即开始这个提供者的退役：拒绝新租约，使已交租约失效，由原提供者结清在途设施操作（[INV-EE18](../../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。退役结果是待处置时，调用方直接调用的撤除函数不以正常返回报告完成，再调用会再次退役。fiber 卸载本身会完成，待处置经 `ctx.logger` 的错误可见（机制见下文[机制读数与假设](#机制读数与假设)）。
5. 撤除设施声明之后，新的获取取不到这个键。

登记结束有三种情形：调用方插件卸载、调用方调用撤除函数、服务撤除。服务撤除时，`inject` 了本服务的调用方插件随之卸载或重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)），它们的效应也被撤除。

边界：

- 只有在插件内调用时，登记才跟随调用方撤除。根 Context 上的调用使效应属于根 fiber，只允许测试或装配入口这样用（[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
- 用 `ctx.provide` 发布的普通对象没有调用方上下文。要靠这条机制的服务实现必须是 `Service` 子类。
- 不同 effect 的撤除函数并发运行（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。一次撤除内部的先后次序要写在同一个撤除函数里。
- 本成员不采用 IC-13 的目录写法。提供者与设施声明的登记表示「谁现在在场」，在场与否由调用方 fiber 的寿命决定，不是需要显式撤回或接替的业务事实。
- 撤除登记不撤回任何外部效果。确认不了停止的受管资源仍在集成方账本里，由维护者的恢复操作处置。

提供者须验证：调用方插件卸载后，它的登记已撤除。这条义务归 [execution-environment-host-local](../../execution-environment-host-local/SPEC.md#组合与验证)。

## 事件

本成员不声明事件，不增补 `Events`（性质 6）。理由：执行环境的变化对读者是观察，不是控制。落点与宿主事实经 Runtime Context 的两条块声明 `execution.placement` 与 `execution.host-facts` 到达观察者（[INV-EE17](../../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。块声明的语义拥有者是契约成员。生产者是 host-local 的 Service 实现。当前还没有发布。

## 依赖分类

| 依赖方 | 怎样依赖 | 换代或缺席时 |
| --- | --- | --- |
| 集成方的适配器插件 | 只把需要环境的那段工作放进依赖 `executionEnvironment` 的子 fiber：`ctx.inject(['executionEnvironment'], cb)`（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)）。键用定义包导出的键常量或字符串字面量。不把整个工具宿主挂在这项依赖上 | 服务换代，只有子 fiber 重跑；不需要环境的工具调用不因此停在 `PENDING`。已交的租约随旧服务关闭而失效，获取状态以集成方账本为准 |
| 维护者插件 | 对象形式 `inject: { executionEnvironment: { caller: 'maintainer' } }` | 服务换代，插件体重跑。恢复授权由集成方重新给出 |
| 提供者插件与设施拥有者插件 | 对象形式 `inject: { executionEnvironment: { caller: 'provider' } }`，在插件体里调用登记面 | 服务换代，旧登记随旧 fiber 撤除，重跑后重新登记 |
| 只需要类型增补的一方 | 不 `inject`。用 `import type {} from '@omne-harness/execution-environment-cordis-contract/cordis'`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)） | 不适用 |
| Service 实现 [execution-environment-host-local](../../execution-environment-host-local/docs/cordis.md) | `extends ExecutionEnvironmentService`，不另写键，不自己 `ctx.provide` 这个键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)） | 不适用 |
| 只需要契约类型的包 | 从 [execution-environment-contract](../../execution-environment-contract/README.md) 根入口导入。不需要本成员 | 不适用 |
| 恢复授权的提供方（装配入口） | `extends ExecutionRecoveryAuthorityService`，作为插件装载，不另写键 | 卸载或换代后，下一次恢复操作现取到的是新提供方，或者取不到而答不可用 |
| 读取恢复授权的 Service 实现 | 不 `inject`，每次恢复操作 `ctx.get(executionRecoveryAuthorityKey)`（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)） | 不持有旧引用 |

依赖方只引用本成员与契约成员，不导入 Service 实现的入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。Service 实现的选择归应用装配。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1) 一个接缝一个服务定义 | 执行环境与它的恢复授权端口各只有本成员这一份定义，Service 实现与调用方都引用它 | 契约成员与 Service 实现成员都没有另写键 |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 运行时对象不进插件树 | 恢复授权端口以 `executionRecoveryAuthority` 服务提供，Service 实现按 IC-9 现取 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 核对键与装载；现取归 Service 实现的测试 |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 键只在 `ExecutionEnvironmentService.provide`，键常量取自它 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 核对键常量等于 `provide` |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 抽象 Service 与 `@owner` | 抽象类 `implements` 契约的两个操作类型，JSDoc 写 `@owner` | 类型检查；源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口没有导出，Cordis 定义只在 `./cordis` | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有运行导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 本成员只定义一个键。重复装载的处置归 Service 实现 | 归 [execution-environment-host-local](../../execution-environment-host-local/docs/cordis.md#ic-符合性映射) |
| [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) 事件 | 不适用。本成员不声明事件 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 核对导出集合 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 登记面在方法里 `this.ctx.effect` 登记，不采用目录写法 | 机制有 basis。撤除验证归 Service 实现 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是操作参数 `ScopeRef` | 契约类型 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 租户随访问身份进入。intercept 配置只声明调用方类，不授予资格 | 契约类型；八个模板方法与真实装载测试 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证 | 本成员不持有状态。登记表的进程内副本归 [execution-environment](../../execution-environment/SPEC.md#范围与依据) | 不适用 |

## 机制读数与假设

本成员的承诺用到下列 Cordis 机制。已有 basis 条目的机制以条目为准。

| 机制 | 依据 | 支撑 |
| --- | --- | --- |
| 抽象 `Service` 子类作为插件装载，就在抽象类给的键上提供服务 | [service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md) | 性质 1 |
| 服务方法里的 `this.ctx` 是调用方上下文 | [service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md) | 性质 5 的效应归属 |
| 必需服务换提供者，插件体重跑 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) | 依赖分类 |
| 不同 effect 的释放并发 | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) | 性质 5 的撤除次序 |
| `inject` 没有可选形式 | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md) | 性质 4 |
| `ctx.<键>` 与 `ctx.get` 的分工 | [ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md) | 依赖分类 |

以下候选读数由本成员真实 Cordis 4.0.4 测试固定，还没有进入 basis：

| 候选条目 | probe 要证明什么 | 支撑的性质 |
| --- | --- | --- |
| `inject-object-config-reaches-service-resolve-config` | 调用方插件写 `inject: { svc: { caller: 'maintainer' } }`，服务方法里 `this[Service.resolveConfig]()` 取到这份配置。两个声明不同调用方类的插件各自取到自己的值 | 性质 4。这条候选条目与 Runtime Context 的消费者类共用，见 [runtime-context-cordis-contract 的机制读数](../../../context/runtime-context-cordis-contract/docs/cordis.md#机制读数与假设) |

撤除函数抛出时 Cordis 怎样处置，已有读数：Cordis 4.0.4 的 `fiber.ts` `_unload` 对每个撤除函数捕获抛出，只写入 `ctx.logger.error`，卸载照常完成，`fiber.dispose()` 正常返回。所以性质 5 的「不以正常返回报告完成」只对调用方直接调用的撤除函数成立。这条读数由 [execution-environment-host-local 的 cordis-entry.spec.ts](../../execution-environment-host-local/tests/cordis-entry.spec.ts) 在真实 Cordis 卸载上固定。

本成员测试已固定这些读数；候选读数补入 basis 前，其跨版本适用仍是待核验假设，测试通过不代替 basis 准入。Cordis 升版时重跑本成员读数与已有 basis probe。

核验位置（采用发布包 `@deepseek-ai/cordis@4.0.4`）：

| 本地测试名（`tests/cordis-entry.spec.ts`） | 源码核对 | 实际断言与边界 |
| --- | --- | --- |
| `inject-object-config-reaches-service-resolve-config` | `service.ts:86-102`、`fiber.ts:238-245`、`context.ts:141-145`、`utils.ts:165-215` | 两个插件各读自己的声明；根读取 `{}`；另有祖先继承及八方法错面拒绝测试 |
| `emit-filter-selects-listeners-by-extended-ctx` | `events.ts:165-174`、`context.ts:99-107` | 扩展上下文按元数据过滤，global监听绕过；调用方撤除后不再触发。只是内核事实，不给EE新增事件 |
| `ctx-set-does-not-notify` | `reflect.ts:254-266` | `set` 更新读值，但不发 `internal/service`，不重跑依赖者；`provide` 的通知作为正对照 |

已有机制 probe 现在位于 [kernel-basis/tests/service-method-ctx-is-caller.spec.ts](../../../assembly/kernel-basis/tests/service-method-ctx-is-caller.spec.ts)，其中 `service-method-ctx-is-caller.spec.ts`、`inject-has-no-optional-form.spec.ts` 与 `effect-disposal-concurrent-not-ordered.spec.ts` 提供调用方效应、必需注入和撤除事实。本成员另外用模板钩子真实装载验证登记随调用方撤除，服务仍在场。旧封存路径不作为本次运行证据。

## 验证义务

本成员自己验证：

- 根入口没有运行导出。
- `./cordis` 的服务、分面类型与映射、错误类符合导出清单。
- 两个键常量分别等于各自抽象类的 `provide`。
- 子类作为插件装载时在各自的键上提供服务，插件卸载后键上没有服务。

这四项在 [tests/](../tests/README.md) 里有测试。继承这些定义的 Service 实现验证登记随调用方撤除、撤除即退役与关闭顺序。这些义务归 [execution-environment-host-local](../../execution-environment-host-local/docs/cordis.md#验证义务)。
