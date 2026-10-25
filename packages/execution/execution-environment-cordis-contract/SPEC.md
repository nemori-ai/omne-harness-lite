# @omne-harness/execution-environment-cordis-contract 行为规格

状态：Cordis 定义成员，`draft`。本成员只拥有执行环境的 Cordis 定义：服务键 `executionEnvironment`、抽象类 `ExecutionEnvironmentService<P>`、intercept 配置类型 `ExecutionEnvironmentIntercept`，以及三个端口服务：恢复授权端口（服务键 `executionRecoveryAuthority`，抽象类 `ExecutionRecoveryAuthorityService`）、环境授权端口（服务键 `executionEnvironmentAuthority`，抽象类 `ExecutionEnvironmentAuthorityService`）与可信绑定来源（服务键 `executionScopeBinding`，抽象类 `ExecutionScopeBindingService`）。领域行为归 [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md)。本页不另写第二份保证。`./cordis` 导出这些定义与 `Context` 增补。九个公开模板方法先核对调用方类，再委托受保护钩子；交付接受与机制事实分别判断。两个新端口服务依据[本域目标协议](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6371505744)的访问核验写入，由 [#678 修订决定](https://github.com/nemori-ai/omne-harness-lite/issues/678#issuecomment-6398383578)具名采用。

## 范围与依据

本成员承接 [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)、[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18) 对执行环境这一个接缝的要求。上层依据是系统页[执行环境](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备)的成员分工，以及契约的 [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)。服务定义、方法分面、intercept 配置、依赖分类、登记与撤除协议和 IC 符合性映射的正文归 [docs/cordis.md](docs/cordis.md)。

根入口与 Cordis 无关，没有运行导出，也没有类型导出（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。需要契约类型的一方直接从 execution-environment-contract 导入。Cordis 定义只从 `./cordis` 导出。

本成员只认通用角色：集成方、维护者、提供者、设施拥有者。租户、作用域、原调用与恢复授权都是操作参数。

用词：继承本定义、在 Cordis 上实现服务的一方叫「Service 实现」。「环境提供者」只指契约的 `EnvironmentProvider`。调用方类 `provider` 指登记环境提供者与设施声明的一方。

## 结果与不变量

本成员必须保持下列性质。

1. 服务键 `executionEnvironment` 只由抽象类 `ExecutionEnvironmentService` 的 `static readonly provide` 给出。导出的键常量 `executionEnvironmentKey` 取自它。Service 实现 `extends` 这个抽象类，不另写键，也不自己 `ctx.provide` 这个键（[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。
2. `ExecutionEnvironmentService<P>` `implements` 契约根入口的 `ExecutionEnvironment<P>` 与 `ProviderRegistrations`。九个公开模板方法及受保护抽象钩子的参数与结果从这两个契约类型推出，同一组签名不写两份（[IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。九个成员都是方法，不是字段。类上的 JSDoc 写 `@owner packages/execution/execution-environment-cordis-contract`。
3. 类型参数 `P` 是主体的类型。`./cordis` 增补 `Context`，把 `executionEnvironment` 属性的类型写成 `ExecutionEnvironmentService<unknown>`。装配的可信身份适配器可以收窄主体类型。Service 实现仍在运行时核对每个输入，不因类型收窄而跳过核对。
4. intercept 配置类型是 `{ caller: 'integrator' | 'maintainer' | 'provider' }`。调用方插件以对象形式 `inject: { executionEnvironment: { caller: '…' } }` 声明自己的调用方类。`integrator` 对应环境面四个方法（`resolvePlacement`、`acquire`、`inspectAcquisition`、`describe`），`maintainer` 对应恢复面三个方法（`recoverOwned`、`releaseScope`、`inspectRecoveryAcquisition`），`provider` 对应登记面两个方法。只有 `maintainer` 用于恢复面。调用方类是装配声明的一致性检查，不是访问控制（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。环境面每次仍由环境授权端口与可信绑定来源核对（[契约的访问核验](../execution-environment-contract/SPEC.md#访问核验)），恢复面每次仍由恢复授权端口核对（[契约的恢复](../execution-environment-contract/SPEC.md#恢复)）。登记环境提供者与设施声明的权限归装配：只有插件树里列出的插件可以登记；运行中按作用域装上、不进插件树的插件（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）不得登记。每个公开方法以 `this[Service.resolveConfig]()` 读取当前调用方配置。环境面与恢复面在没有 `caller` 声明时放行；登记面必须声明 `provider`。存在但不合三值的声明一律拒绝。声明可从祖先上下文继承，近处声明覆盖远处声明；完全未声明时读取结果为 `{}`。不匹配时，有拒绝通道的七个方法返回 `{ kind: 'rejected', reason: 'callerMismatch' }`，不调用实现钩子；其中 `inspectAcquisition` 与 `inspectRecoveryAcquisition` 的拒绝是查询答复，不是获取记录状态。登记面没有拒绝返回通道，抛出 `CallerClassMismatch`，带操作、期望类与实际声明。登记权限的强制执行点见[明确缺项](#明确缺项)。
5. `registerFacility` 与 `registerProvider` 登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。Service 实现在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，所以登记落在调用方插件的 fiber 上，调用方卸载即撤除。两个方法都返回撤除函数，显式撤除与 fiber 卸载调用登记表的同一个撤除。撤除一个环境提供者的登记等于这个环境提供者开始退役：先拒新租约，再排空（[INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。退役结果是待处置时，调用方直接调用的撤除函数不以正常返回报告完成，再调用会再次退役。fiber 卸载在退役待处置时也会完成，不以失败报告；待处置经 `ctx.logger` 的错误可见（Cordis 4.0.4 的读数见 [docs/cordis.md](docs/cordis.md#机制读数与假设)）。撤除一份设施声明之后，新的获取取不到这个键（[契约的设施协议](../execution-environment-contract/SPEC.md#设施协议)）。本成员不采用 IC-13 的目录写法。
6. 本成员不声明事件，不增补 `Events`。落点与宿主事实的变化经 Runtime Context 的两条块声明到达观察者（[INV-EE17](../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。
7. 一个 isolate 标签下只有一个 Service 实现在场（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。作用域是操作参数 `ScopeRef`，不是 Cordis Context，也不是 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。租户随访问身份作为参数进入，恢复授权也作为参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
8. 根入口没有运行导出，不导入 `@deepseek-ai/cordis`。`./cordis` 只导入契约类型（含 Runtime Context 契约的 `ScopeBindingSource` 类型）与 `@deepseek-ai/cordis`，不导入 `@omne-harness/execution-environment` 或 `@omne-harness/execution-environment-host-local`。
9. 恢复授权端口是装配入口交给执行环境的运行时对象，不进插件树（[IC-16](../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。它的服务键 `executionRecoveryAuthority` 只由抽象类 `ExecutionRecoveryAuthorityService` 的 `static readonly provide` 给出，键常量 `executionRecoveryAuthorityKey` 取自它。抽象类 `implements` 契约的 `RecoveryAuthority`。装配入口装载它的子类来提供端口。Service 实现把它当可选依赖：不写进 `inject`，每次恢复操作现取，取不到时按「不可用」收场（[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。Service 实现从自己装载时的上下文现取，不从服务方法里调用方的上下文取；服务方法里的 `this.ctx` 是调用方的上下文，从那里取会让调用方自己给自己授权。
10. 环境授权端口与可信绑定来源按性质 9 的同一规则提供。环境授权端口的服务键 `executionEnvironmentAuthority` 只由抽象类 `ExecutionEnvironmentAuthorityService<P>` 的 `static readonly provide` 给出，键常量 `executionEnvironmentAuthorityKey` 取自它；抽象类 `implements` 契约的 `EnvironmentAuthority<P>`。可信绑定来源的服务键 `executionScopeBinding` 只由抽象类 `ExecutionScopeBindingService` 的 `static readonly provide` 给出，键常量 `executionScopeBindingKey` 取自它；抽象类 `implements` Runtime Context 契约的 `ScopeBindingSource`。两者都是装配入口装载的运行时对象，不进插件树。Service 实现把它们当可选依赖：不写进 `inject`，从自己装载时的上下文每次现取。取不到时，环境面按「不可用」收场，不放行（[契约的访问核验](../execution-environment-contract/SPEC.md#访问核验)）。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务键与抽象类 | 本成员 | 随包 |
| 端口服务（恢复授权、环境授权、可信绑定） | 装配入口装载的子类 | 装配入口卸载它；之后 Service 实现现取不到，按「不可用」收场 |
| 设施声明的登记 | 设施拥有者插件的 fiber | 插件卸载、调用撤除函数，或服务撤除 |
| 环境提供者的登记 | 登记它的插件的 fiber | 插件卸载、调用撤除函数，或服务撤除。撤除即开始退役 |
| 调用方类声明 | 调用方插件的 intercept 配置 | 随调用方 fiber |
| 获取、租约、受管资源、恢复结算 | 不在本成员。归[契约](../execution-environment-contract/SPEC.md#所有权失败与生命周期)与[登记表机制](../execution-environment/SPEC.md) | — |

服务撤除时的关闭顺序归登记表机制 [execution-environment SPEC](../execution-environment/SPEC.md#关闭)。退役待处置的处置和撤除失败的报告归 Service 实现 [execution-environment-host-local SPEC](../execution-environment-host-local/SPEC.md#撤除顺序)。本成员只定义这些操作的形状与承诺。撤除登记不撤回任何外部效果，也不丢弃旧工作的处置责任（[INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任)）。

## 组合与验证

| 承诺 | 位置 | 本成员怎样消费 |
| --- | --- | --- |
| 环境面、恢复面与登记面的操作类型 | [execution-environment-contract SPEC](../execution-environment-contract/SPEC.md) | 抽象类实现 `ExecutionEnvironment<P>` 与 `ProviderRegistrations`（性质 2） |
| 提供者退役与撤除 | [INV-EE18](../execution-environment-contract/SPEC.md#inv-ee18-提供者换代和-cordis-集成保留原责任) | 性质 5 |
| 恢复授权独立于访问 | [契约的恢复](../execution-environment-contract/SPEC.md#恢复) | 性质 4：调用方类不代替恢复授权 |
| 普通入口的访问核验 | [契约的访问核验](../execution-environment-contract/SPEC.md#访问核验) | 性质 4、10：调用方类不代替环境授权与可信绑定 |
| 服务键、登记即效应、租户是参数 | [IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18) | 性质 1、5、7 |

本成员自己的验证在 `tests/`：

| 性质 | 测试 | 覆盖 |
| --- | --- | --- |
| 性质 1 | [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | 键常量等于 `executionEnvironment`，也等于 `ExecutionEnvironmentService.provide` |
| 性质 1、8、9 | [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | `./cordis` 导出服务定义、分面映射与登记面错误 |
| 性质 1 | [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | 子类作为插件装载时在这个键上提供服务，插件卸载后键上没有服务 |
| 性质 9 | [cordis-entry.spec.ts](tests/cordis-entry.spec.ts) | 恢复授权键常量等于 `ExecutionRecoveryAuthorityService.provide`；子类装载后在这个键上答复，卸载后键上没有服务 |
| 性质 8 | [public-entry.spec.ts](tests/public-entry.spec.ts) | 根入口没有运行导出 |

下列义务由继承本定义的 Service 实现承担，测试归 [execution-environment-host-local](../execution-environment-host-local/SPEC.md#组合与验证)：登记落在调用方 fiber 上并随它撤除，撤除提供者即开始退役，直接调用的撤除函数在退役待处置时可重试，恢复授权、环境授权与可信绑定每次现取且取不到时不放行。性质 4 在 `cordis-entry.spec.ts` 覆盖三类、未声明、非法及祖先声明，并核对九个方法。性质 8 的导入边界只由导出测试间接覆盖，没有逐文件的导入检查。

### 明确缺项

- 登记环境提供者与设施声明的权限现在没有强制执行点：声明为 `provider` 的插件可调用登记面，但该声明本身不能证明插件来自获准插件树。拥有者是本成员（服务定义）与应用装配。
- 新机制读数已由本成员测试固定；候选 basis 条目登记仍归 basis 拥有者，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

文档导航见 [index](index.md)。
