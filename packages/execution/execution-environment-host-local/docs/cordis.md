# execution-environment-host-local 的 Cordis 集成

本页是执行环境的 Service 实现正文：Service 子类与插件、配置、登记即效应、撤除顺序、isolate 绑定、调用方类与块发布的现状。它是组内「Service 实现、插件、配置与撤除顺序」的唯一拥有者，主题表见[组架构](../../docs/architecture.md#主题与唯一拥有者)。行为编号与章节指本成员 [SPEC](../SPEC.md)。

服务键、抽象类、intercept 配置与登记协议归 [execution-environment-cordis-contract 的 Cordis 说明](../../execution-environment-cordis-contract/docs/cordis.md)，本成员继承这些定义，不重复提供键。登记表机制归 [execution-environment](../../execution-environment/docs/architecture.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

现状：`src/cordis.ts` 已实现 Service 子类、两个插件、空配置 Schema 与 `hostFilesPlugin` 的配置 Schema。模板标记写明 Runtime Context 生产者插件、`command` 与 `terminal` 提供者还没有接受；调用方类由定义成员的八个模板方法核对。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 插件与配置

`./cordis` 导出下列装配单元：

| 导出 | 种类 | 做什么 |
| --- | --- | --- |
| `ExecutionEnvironmentRegistry` | `ExecutionEnvironmentService` 的具体子类，可以直接当插件装载 | 持有一个登记表实例，提供 `executionEnvironment`。每次恢复操作现取 `executionRecoveryAuthority` 服务 |
| `filesFacilityPlugin` | 函数插件，名称 `filesFacility` | 对象形式 `inject` 服务键常量并声明 `caller: provider`，装载时登记 `files` 设施声明，不登记提供者 |
| `hostFilesPlugin` | 函数插件，名称 `hostFiles` | 对象形式 `inject` 服务键常量并声明 `caller: provider`，装载时按配置的 `drainBoundMs` 登记一个宿主文件提供者，不登记声明；退役超界的诊断写到 `ctx.logger('executionEnvironment.hostFiles')` |

抽象类的构造函数以 `executionEnvironment` 登记服务，子类不写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)）。服务登记在装载它的那条插件 fiber 上，插件撤除时键上就没有服务了。

Service 子类写静态 `Config`，两个函数插件写 `Config` 字段（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。Service 子类与 `filesFacilityPlugin` 共用空配置 Schema：只接受缺省、`null` 或空对象，其余值校验失败，消息是「configuration accepts no fields」。`hostFilesPlugin` 用自己的 Schema `HostFilesConfig`：另接受只带 `drainBoundMs` 的对象，`drainBoundMs` 必须是有限的非负数；缺省时取提供者的初值 10000 毫秒。`drainBoundMs` 是唯一的可调参数，它是可序列化的配置字段；诊断的回调不进配置，由插件体接到 `ctx.logger`。两个函数插件还没有经过 kernel-basis 的 `definePlugin`，见 [SPEC 明确缺项](../SPEC.md#明确缺项)。

`files` 设施声明与宿主文件提供者分成两个插件。理由：声明的拥有者是 `files` 设施，宿主提供者只是它的一个实现者。分开之后，声明的生灭不随宿主提供者，以后的沙箱文件提供者不必依赖宿主插件在场。

恢复授权端口是运行时对象，不进插件树（[IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16)）。装配入口装载 `ExecutionRecoveryAuthorityService` 的子类来提供它，服务键是 `executionRecoveryAuthority`，定义归 [execution-environment-cordis-contract](../../execution-environment-cordis-contract/docs/cordis.md#服务定义)。Service 子类把它当可选依赖，不写进 `inject`，每次恢复操作用 `ctx.get` 现取（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)）。取不到时 `recoverOwned` 与 `releaseScope` 以 `unavailable` 拒绝。恢复授权服务换代或卸载后，下一次恢复操作用新的服务，或答不可用；Service 子类不持有旧引用。

下面两段沿用已接受的 Cordis 集成设计，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。包名、导出名与键常量按现在的成员改写。

宿主文件提供者不是第二个服务键。它是一个插件，导出名字是 `hostFilesPlugin`。`inject` 用对象形式 `{ [executionEnvironmentKey]: { caller: 'provider' } }`，装上时调用 `registerProvider`，声明自己只覆盖 `host_machine` 和 `files`。插件树用包名 `@omne-harness/execution-environment-host-local` 和 `./cordis` 的 `hostFilesPlugin` 来标识它。配置只放可序列化的字段。回调和打开文件的函数不进插件树。

沙箱提供者以后用同一个键登记，声明自己的绑定层和连续性。它不写进宿主插件的 `inject`。登记表按绑定层和所要设施匹配同一个提供者。落点和租约都用这个提供者的连续性。没有匹配的提供者，结果是 `noMatchingEnvironment` 或 `missingFacility`，不改用 `host_machine`。

## 服务子类

`ExecutionEnvironmentRegistry` 构造时调用 `createEnvironmentRegistry`，得到一个登记表实例。服务实例拥有这个登记表实例。

| 面 | 本成员加的责任 | 登记表做的事 |
| --- | --- | --- |
| 环境面 `resolvePlacement`、`acquire`、`inspectAcquisition`、`describe` | 原样转发 | 匹配、获取与核验、租约视图、描述 |
| 恢复面 `recoverOwned`、`releaseScope` | 原样转发；恢复授权每次现取 `executionRecoveryAuthority` 服务，取不到答不可用 | 恢复授权核对、作用域释放、逐提供者恢复 |
| 登记面 `registerFacility`、`registerProvider` | 在调用方 fiber 上登记效应，见[登记即效应](#登记即效应) | 设施声明表、提供者表、退役 |

本成员不另写服务键，不增补事件，也不导入任何上层领域的契约。

## 登记即效应

`registerFacility` 与 `registerProvider` 按 [execution-environment-cordis-contract 的登记协议](../../execution-environment-cordis-contract/docs/cordis.md#登记与撤除协议)实现（[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：

1. 在 `onRegisterFacility` 与 `onRegisterProvider` 钩子里用 `this.ctx.effect` 包住登记表的同名方法。`this.ctx` 是调用方的上下文，效应落在调用方插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
2. 设施声明：登记表返回的撤除函数就是效应的撤除函数。调用方卸载时 Cordis 调用它，调用方也可以经返回值提前调用。
3. 提供者：效应只在调用方 fiber 卸载时调用一次登记表的撤除函数。返回给调用方的撤除函数直接调用登记表的撤除函数。理由：Cordis 的效应撤除只运行一次，第二次调用直接返回，经效应重试会把待处置的退役当成已完成；登记表的撤除函数本身可以重试，并发调用共用一次退役。
4. 登记表拒绝重复登记时抛出。抛出发生在插件体里时，调用方的 fiber 进入 `FAILED`（[plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)）。
5. 提供者的撤除函数在退役待处置时抛出 `RetirementPending`，再调用会再次调用提供者的 `retire()`。

只有在插件内经 `ctx.executionEnvironment` 调用时，登记才跟随调用方撤除。根 Context 上的调用使效应属于根 fiber，只允许测试或装配入口这样用。

## 撤除顺序

本成员有三条撤除路径，见 [SPEC 撤除顺序](../SPEC.md#撤除顺序)。

`hostFilesPlugin` 卸载时，效应让宿主文件提供者退役：先把提供者标为不在场，再使它交出的租约以 `providerRetired` 失效，然后调用提供者的 `retire()`。宿主文件提供者先停止接纳新的文件操作，再等在途操作结束，最多 `drainBoundMs`：都结束返回已排空；超界返回待处置，受管资源为空，插件体把诊断写入 `ctx.logger`，登记表的撤除再抛出 `RetirementPending`，也写入 `ctx.logger`。`files` 设施声明不受影响。

`filesFacilityPlugin` 卸载时，效应从设施声明表删除 `files`。新的落点解析返回 `missingFacility`，已取到的设施对象上的操作返回 `unsupported`。两个插件的效应各自独立，卸载先后不影响结果（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。

`ExecutionEnvironmentRegistry` 卸载时：

1. 构造时登记的效应 `executionEnvironment.close` 调用登记表的 `close()`。
2. `close()` 先拒新的落点、获取与登记，再使全部租约以 `registryClosed` 失效，然后并发退役全部提供者。
3. 结果是待处置时，这个效应的撤除函数抛出 `RetirementPending`，带全部未停的受管资源。Cordis 把它写入 `ctx.logger` 的错误，卸载照常完成（见[机制读数与假设](#机制读数与假设)）。
4. 同时，`inject` 了本服务的插件随之卸载或重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)）。它们的撤除与 `close()` 并发运行。同一个提供者的退役共用一次 `retire()` 调用。

撤除不撤回任何外部效果。已写入宿主文件的字节留在文件里。确认不了停止的受管资源留在集成方账本里，由维护者处置。宿主文件提供者没有受管资源。

## isolate 绑定

一个 isolate 标签下只装一份 `ExecutionEnvironmentRegistry`（[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。Cordis 4.0.4 的 `provide` 发现同一标签下已有登记时抛出（源码读数：`reflect.ts` 的 `provide`），所以重复装载的第二份失败，不静默覆盖。本成员没有测试覆盖这一点。

要两份登记表并存，分到不同的 isolate 标签下，并由装配拥有者写明谁看见哪一份。isolate 只隔离服务实例的可见性，不隔离数据（[isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md)）。所以 isolate 不用于租户或作用域的分隔。租户、作用域与恢复授权全部随操作参数进入（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 调用方类

本成员继承的公开模板方法读取并核对调用方声明，然后进入本成员的受保护钩子；恢复两操作仍由原恢复授权端口逐次核对。调用方类规则与读数归 [execution-environment-cordis-contract](../../execution-environment-cordis-contract/docs/cordis.md#intercept-配置与调用方类)。

## 块的发布

契约要求本成员的 Service 实现作为 Runtime Context 的生产者发布 `execution.placement` 与 `execution.host-facts` 两条块（[INV-EE17](../../execution-environment-contract/SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)）。本成员现在不登记生产者，不发布这两条块。模板标记写明 Runtime Context 生产者插件还没有接受。观察者现在只能经 `describe` 读落点，经宿主文件提供者的 `describe` 读宿主事实。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 子类 `extends ExecutionEnvironmentService`，不写键，不自己 `ctx.provide` | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 按键常量取到服务 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口可达的模块不导入 Cordis 或 `./cordis` | [public-entry.spec.ts](../tests/public-entry.spec.ts) |
| [IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5) 消费者不依赖实现入口 | 调用方经服务定义取服务 | 现在没有组外调用方 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 重复装载在 `provide` 时失败 | 源码读数，没有测试 |
| [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) 可选依赖现取 | 恢复授权服务不写进 `inject`，每次恢复操作 `ctx.get` 现取，取不到答不可用 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 装载前、装载后、卸载后各恢复一次 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 登记面在调用方 fiber 上登记效应，不采用目录写法 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 卸载 `hostFilesPlugin` 后宿主层没有匹配，卸载 `filesFacilityPlugin` 后已取到的设施返回 `unsupported` |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | Service 子类与 `filesFacilityPlugin` 用空配置 Schema，`hostFilesPlugin` 用只接受 `drainBoundMs` 的 Schema。两个函数插件还没有经过 kernel-basis 的 `definePlugin`（偏离，见 [SPEC 明确缺项](../SPEC.md#明确缺项)） | 校验失败的路径没有测试；Service 子类路径没有 basis |
| [IC-16](../../../../docs/architecture/cordis-integration-conventions.md#ic-16) 运行时对象不进插件树 | 恢复授权以 `executionRecoveryAuthority` 服务提供，插件树只有包名、导出名与可序列化配置 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 作用域与租户是参数 | 作用域、租户与恢复授权都随操作参数进入 | 契约类型 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证 | 登记表是进程内副本，重启后不重建租约 | 写在 [execution-environment SPEC](../../execution-environment/SPEC.md#范围与依据) |

## 机制读数与假设

| 机制 | 依据现状 | 影响 |
| --- | --- | --- |
| 同一 isolate 标签下重复 `provide` 抛出 | 源码读数 | 重复装载失败 |
| Service 子类静态 `Config` 校验失败使 fiber `FAILED` | basis 只核验了函数插件 | 配置错误时的加载失败 |
| 撤除函数抛出 `RetirementPending` 时 Cordis 怎样处置 | 读数：Cordis 4.0.4 `fiber.ts` 的 `_unload` 对每个撤除函数捕获抛出，只写入 `ctx.logger.error`，卸载照常完成。包测试 [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 在真实卸载上固定：提供者插件与服务卸载时 `fiber.dispose()` 正常返回，`ctx.logger` 收到 `RetirementPending` | 装配从 `ctx.logger` 与登记表的退役、关闭结果观察退役待处置，不能从卸载结果观察 |
| 效应撤除只运行一次 | 源码读数：`fiber.ts` 的 `effect` 撤除以 `disposing` 标记只运行一次 | 提供者撤除函数的重试不经效应 |

前两项是假设，补齐之前对应的行为以假设成立。Cordis 升版时，先按 IC 约定重跑相关 probe 与包测试。

## 验证义务

[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 在真实 Cordis 4.0.4 上覆盖：

1. 装载服务、`filesFacilityPlugin` 与 `hostFilesPlugin` 后，经租约读一个点名文件。沙箱层没有提供者时返回 `noMatchingEnvironment`。
2. `hostFilesPlugin` 卸载后，租约以 `providerRetired` 失效，宿主层的落点解析返回 `noMatchingEnvironment`。
3. 只装 `hostFilesPlugin` 时落点解析返回 `missingFacility`。卸载 `filesFacilityPlugin` 后，已取到的设施上的写入返回 `unsupported`，文件不变。
4. 服务卸载后，键上没有服务，租约以 `registryClosed` 失效，新获取返回 `ownerStopped`。
5. 恢复授权服务缺席时，恢复两操作返回 `unavailable`。装载后端口被调用一次，宿主文件提供者记为不支持。卸载后又返回 `unavailable`。
6. 经服务登记的提供者退役待处置时，返回的撤除函数每次调用都再调用 `retire()` 并抛出 `RetirementPending`。
7. 提供者插件与服务在退役、关闭待处置时卸载照常完成，`ctx.logger` 收到 `RetirementPending`。
8. 授权后释放作用域，宿主租约以 `scopeReleased` 失效，该作用域的再获取与落点解析为 `referenceExpired`；`describe` 列出该作用域的宿主落点。
9. `hostFilesPlugin` 的配置只接受合法的 `drainBoundMs`，以 `-1` 装载失败；Service 与 `filesFacilityPlugin` 只接受空配置。

[host-provider-drain.spec.ts](../tests/host-provider-drain.spec.ts) 在真实 Cordis 上覆盖：以 `{ drainBoundMs: 20 }` 装载 `hostFilesPlugin`，有一个在途写入时卸载它，`ctx.logger` 先收到退役超界的诊断，再收到 `RetirementPending`，卸载完成。

调用方类核对归定义成员测试；本成员两个提供者插件以对象形式声明 provider，并在真实装载与卸载测试中消费这些模板方法。定义入口自身的验证义务归 [execution-environment-cordis-contract](../../execution-environment-cordis-contract/docs/cordis.md#验证义务)。
