# Request Context 的 Cordis 定义

本页是 Request Context 这一接缝的 Cordis 定义正文：服务键、抽象 `Service`、intercept 配置、事件、依赖分类、登记与撤除协议、策略选择，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 10。纯操作、提示词贡献的两类与组装规则归 [request-context-contract SPEC](../../request-context-contract/SPEC.md)。缓存、预计算派生物与默认策略归 [request-context](../../request-context/docs/architecture.md)。Service 实现、贡献登记表、isolate 绑定与撤除归 [request-context-cordis](../../request-context-cordis/docs/cordis.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，本页不复制。

现状：`src/cordis.ts` 与 `src/index.ts` 只有模板标记，两个入口都没有导出。下文是 SPEC 固定的目标形状，不是源码事实。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，没有进入 basis 的机制写明是假设。

## 服务定义

| 定义 | 形状 | 依据 |
| --- | --- | --- |
| 服务键 | `requestContext`，只由 `RequestContextService` 的 `static readonly provide` 给出。`./cordis` 导出的键常量取自它，常量名随实现确定。提供者不另写键 | 性质 1，[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7) |
| 抽象类 | `RequestContextService extends Service`，构造函数以 `RequestContextService.provide` 调 `super`。它 `implements` 契约根入口的登记面操作类型，同一组签名不写两份 | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| 类的 JSDoc | `@owner packages/context/request-context-contract`。登记面出自协议形状，没有契约 ID，所以写 `@owner`，不写 `@contract` | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| intercept 配置类型 | `{ scope: ScopeRef \| null }`，由贡献者插件以对象形式 `inject` 声明；`null` 表示全局层 | 性质 4、7 |
| 事件 | `request-context-cordis-contract/changed`，模式 `emit`，载荷是作用域引用与登记修订 | 性质 6，[IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) |
| 策略选择的配置形状 | 选择压缩策略与表示策略实现的配置字段。本成员只定义形状，不定义策略数值 | 性质 8，[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) |

服务方法是登记面的三项与组装入口 `assembly(scope)`。方法的输入、结果与失败归契约，本表只说明谁调用、本成员加了什么 Cordis 承诺。

| 方法 | 调用方 | 本成员加的 Cordis 承诺 |
| --- | --- | --- |
| `contributeSection` | 贡献者插件，在自己的插件体里调用 | 登记即效应，登记落在调用方 fiber 上。作用域引用取自调用方的 intercept 配置。带逐请求变化变量的段在登记时拒绝。见[登记与撤除协议](#登记与撤除协议) |
| `contributeVariable` | 贡献者插件，在自己的插件体里调用 | 同上 |
| `contributions(scope)` | 要组装系统提示词的调用方，例如协调者一侧的适配器 | 作用域是参数，不是 Context 或 isolate。解析时作用域层遮蔽全局层（性质 4、9） |
| `assembly(scope)` | 要组装请求的调用方，例如协调者一侧的适配器 | 返回一组纯操作，已按该 isolate 的配置绑定选定的策略与该作用域的登记面。组装本身仍是纯函数。提供者卸载时结算经这组操作发起的在途组装（性质 2） |

`assemble`、`planCompaction` 这类纯操作不直接写成服务方法。它们的类型由 [request-context-contract](../../request-context-contract/docs/public-api.md) 的根入口定义（性质 2）。经 Cordis 的调用方用 `assembly(scope)` 取得已配置的操作组：提供者按配置选的策略与带缓存的机制实例经这个入口起作用，[request-context-cordis 的性质 5](../../request-context-cordis/SPEC.md#结果与不变量) 结算的在途组装也就是经这组操作发起的组装。独立调用方不经服务，从根入口的机制工厂取得同一组操作。本成员不定义第二个服务键，也不为每个贡献者或每个作用域建服务。

## intercept 配置与作用域

贡献者插件用对象形式的 `inject` 声明自己的作用域（性质 7）：

```text
inject: { requestContext: { scope: 作用域引用 } }
```

对象形式仍然是必需依赖。对象里的值只是给这项服务的 intercept 配置，不是「可选」标记（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)）。所以 `requestContext` 不在场时，贡献者插件停在 `PENDING`。

服务方法用 `this[Service.resolveConfig]()` 取得配置。服务方法里的 `this.ctx` 是调用方的上下文（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)），所以取到的是调用方 fiber 声明的配置。不同贡献者插件各自取到自己的作用域。「对象形式 `inject` 的值到达服务方法的 `resolveConfig`」这一条还没有进入 basis，见[机制读数与假设](#机制读数与假设)。

全局层的贡献以 `{ scope: null }` 登记（性质 4、7）。作用域引用是装配事实，不是资格授予（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。它只决定一条贡献登记在哪一层。作用域是不透明引用，不是 Context，也不是 isolate（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。按 [request-context-cordis 的性质 2](../../request-context-cordis/SPEC.md#结果与不变量)，取不到 intercept 配置的登记被拒绝。所以贡献者必须用对象形式 `inject`，不能经 `ctx.get` 现取服务再登记。

明确缺项：

- `ScopeRef` 的来源没有点名。request-context-contract 的[公开接口页](../../request-context-contract/docs/public-api.md)没有列出这个类型。

## 事件

`request-context-cordis-contract/changed` 是本成员唯一的事件（性质 6）。名称的范围取声明它的包名，事件部分用过去分词，符合 [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)。`./cordis` 增补 `Events`，JSDoc 写 `@mode emit` 与载荷各项的 `@param`（[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。

| 项 | 内容 |
| --- | --- |
| 载荷 | 作用域引用与登记修订。不带段文本或变量值 |
| 何时发 | 贡献变化即发，每次带新的登记修订 |
| 含义 | 只是失效提示，不是事实源。缓存按登记修订判断提示词这一组是否变了（[request-context SPEC](../../request-context/SPEC.md#候选缓存)） |
| 过滤 | 监听者按载荷里的作用域引用过滤 |
| 监听者 | 同步执行，不得返回 Promise。派发方把 `emit` 放在 `try` 中，监听者失败只记录诊断，不改变已成立的登记（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)、[emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md)） |
| 丢失 | 不改变组装结果。缓存项按修订比较，修订落后的缓存项作废（[request-context SPEC](../../request-context/SPEC.md#候选缓存)） |

Cordis 4.0.4 的派发对用 `{ global: true }` 注册的监听者不做派发方过滤（源码读数：`events.ts` 的 `dispatch`）。本事件的过滤由监听者按载荷完成，所以监听者收到其他作用域的事件时要自己丢弃。

明确缺项：[request-context-cordis 的组合与验证](../../request-context-cordis/SPEC.md#组合与验证)把「按作用域到达」的过滤部分列为依赖机制读数的假设，而本成员的性质 6 把过滤放在监听者一侧。过滤由派发方用 `Context.filter` 完成，还是只由监听者按载荷完成，两份 SPEC 没有统一。全局层的贡献变化时，载荷的作用域引用为 `null`（性质 6）。

## 依赖分类

| 依赖方 | 怎样依赖 | 换代或缺席时 |
| --- | --- | --- |
| 贡献者插件 | 对象形式 `inject: { requestContext: { scope } }`，按 [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8) 用定义包导出的键常量或字符串字面量 | 提供者换代，贡献者插件体先卸载再重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)）。旧登记随旧 fiber 撤除，重跑后重新登记 |
| 读取贡献集合的调用方，例如协调者一侧的适配器 | 数组形式 `inject: ['requestContext']`，调用 `contributions(scope)` | 提供者不在场时插件停在 `PENDING`。不能把服务缺席当成「没有贡献」，否则会组装出缺少系统提示词的候选 |
| 只监听变化事件的一方 | 不 `inject`。用 `ctx.on` 监听事件，类型增补用 `import type {} from '@omne-harness/request-context-cordis-contract/cordis'` 取得（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)） | 提供者不在场时收不到事件。正确性不依赖事件 |
| 提供者 [request-context-cordis](../../request-context-cordis/docs/cordis.md) | `extends RequestContextService`，不另写键，不自己 `ctx.provide` 这个键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)） | 不适用 |
| 只需要契约类型或纯操作的包 | 从 [request-context-contract](../../request-context-contract/README.md) 根入口导入。不需要本成员 | 不适用 |

依赖方只引用本成员与契约成员，不导入提供者的实现入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。提供者选择归应用装配。

## 登记与撤除协议

本成员按 [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 的「登记即效应」定义 `contributeSection` 与 `contributeVariable`（性质 3）：

1. 贡献者插件在自己的插件体里调用登记方法。
2. 提供者用 `this[Service.resolveConfig]()` 取调用方的作用域引用。取不到时拒绝。
3. 提供者核对：同一层已有同名贡献时拒绝，不覆盖（性质 4）。段带逐请求变化的变量时拒绝（性质 5、[RQ-02](../../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。
4. 提供者在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，所以效应落在贡献者插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。方法返回 effect 的撤除函数。
5. 登记成立后，登记修订前进，提供者派发变化事件。
6. 登记方法本身不渲染文本（性质 5）。段文本的预计算归 [request-context](../../request-context/SPEC.md#预计算的派生物)。

撤除函数是唯一的撤除路径。显式调用撤除函数与贡献者 fiber 卸载走同一个函数。撤除后，后续组装不再包含这条贡献，变化事件带新的登记修订。

登记结束有三种情形：贡献者插件卸载、调用撤除函数、服务撤除。服务撤除时，`inject` 了本服务的贡献者插件随之卸载或重跑，它们的效应也被撤除。在途组装的结算归 [request-context-cordis](../../request-context-cordis/docs/cordis.md)。

边界：

- 只有在插件内调用时，登记才跟随贡献者撤除。根 Context 上的调用使效应属于根 fiber，只允许测试或装配入口这样用（[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
- 调用方 fiber 已进入卸载后再调用，`effect` 抛 `INACTIVE_EFFECT`，登记不成立（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。
- 本成员不采用 IC-13 的目录写法。贡献随贡献者寿命存在（[系统页的提示词贡献登记面](../../../../docs/architecture/runtime/request-context.md#提示词贡献登记面)），登记方法返回撤除函数，不返回登记回执。
- 撤除登记不撤回已经交出的候选。已固定的请求不随之后的贡献变化改写（[RQ-07](../../request-context-contract/SPEC.md#rq-07-扩展修改发起与固定采用)）。

提供者须验证：贡献者插件卸载后，它的登记已撤除。这条义务归 [request-context-cordis](../../request-context-cordis/SPEC.md#组合与验证)。

## 策略选择

压缩策略与表示策略都是可替换实现，默认实现只是初值（[RQ-04](../../request-context-contract/SPEC.md#rq-04-模态与可追溯表示)、[RQ-06](../../request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界)）。本成员只定义「选哪一个实现、带什么参数」的配置形状（性质 8）：

| 项 | 归属 |
| --- | --- |
| 选择的配置形状 | 本成员 |
| 用 Standard Schema 校验配置 | 提供者的静态 `Config`（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)） |
| 在构造时按配置选择实现 | 提供者 [request-context-cordis](../../request-context-cordis/docs/cordis.md) |
| 默认实现与配置初值 | [request-context SPEC](../../request-context/SPEC.md#默认策略与修剪器) |
| 两个策略端口的类型 | [request-context-contract](../../request-context-contract/docs/public-api.md) |

策略选择不是服务方法，运行中不能改。改选择就是改提供者的插件配置，提供者重新装载。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1) 一个接缝一个定义 | Request Context 只有本成员这一份服务定义，随协议形状的拥有者组维护 | 没有源码 |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 键只在 `RequestContextService.provide`，键常量取自它，提供者 `extends` 不写键 | 没有源码。实现后由导出测试核对键常量等于 `provide` |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 抽象 Service 与 `@owner` | 抽象类 `implements` 登记面操作类型，JSDoc 写 `@owner packages/context/request-context-contract` | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口只重导出契约类型，Cordis 定义只在 `./cordis` | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有运行导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 本成员只定义一个键。重复装载的处置归提供者 | 归 [request-context-cordis](../../request-context-cordis/docs/cordis.md#ic-符合性映射) |
| [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10) 事件命名 | `request-context-cordis-contract/changed`：范围是本包名，过去分词表示通知 | 没有源码 |
| [IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) 事件增补位置 | 在 `./cordis` 增补 `Events`，JSDoc 写 `@mode emit` 与 `@param` | 没有源码 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 两个登记方法在方法里 `this.ctx.effect` 登记并返回撤除函数，不采用目录写法 | 效应归属有 basis。撤除验证归提供者 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 本成员定义策略选择的配置形状，校验与失败归提供者 | 归 [request-context-cordis](../../request-context-cordis/docs/cordis.md#配置与策略选择) |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是不透明键，经 intercept 配置或 `contributions(scope)` 的参数进入。不为作用域建 fiber 或 isolate | 没有源码 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户与资格是参数 | intercept 配置只声明作用域，不授予资格 | 没有源码 |

## 机制读数与假设

本成员的承诺用到下列 Cordis 机制。已有 basis 条目的机制以条目为准。

| 机制 | 依据 | 支撑 |
| --- | --- | --- |
| 服务方法里的 `this.ctx` 是调用方上下文 | [service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md) | 性质 3 的效应归属，性质 7 的配置来源 |
| 必需服务换提供者，插件体重跑 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) | 依赖分类 |
| 不同 effect 的释放并发 | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) | 性质 3 的撤除 |
| `inject` 没有可选形式 | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md) | 性质 7 |
| `emit` 不捕获监听者异常 | [emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md) | 性质 6 |
| isolate 只隔离实例可见性 | [isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md) | 性质 9 |

下列机制只有源码读数，还没有进入 basis。它与 Runtime Context 服务定义列出的候选条目 `inject-object-config-reaches-service-resolve-config` 是同一条，probe 要证明的内容见 [runtime-context-cordis-contract 的机制读数与假设](../../runtime-context-cordis-contract/docs/cordis.md#机制读数与假设)。

| 机制 | 支撑的性质 |
| --- | --- |
| 对象形式 `inject` 的值到达服务方法的 `this[Service.resolveConfig]()`，不同插件各自取到自己的值 | 性质 7。提供者一侧是 [request-context-cordis 的性质 2](../../request-context-cordis/SPEC.md#结果与不变量) |

这条读数补齐之前，性质 7 是假设，不是已核验的保证。依赖它的提供者性质同样是假设。Cordis 升版时，先按 IC 约定重跑相关 probe。

## 验证义务

本成员自己验证：

- 根入口没有运行导出，也不导入 `@deepseek-ai/cordis`。
- `./cordis` 的源码、生成声明和产物不导入 `@omne-harness/request-context` 或 `@omne-harness/request-context-cordis`（性质 10）。
- 导出的键常量等于 `RequestContextService.provide`。

继承这些定义的提供者持续验证五项：贡献者卸载后登记撤除，同层重名拒绝，作用域层遮蔽全局层，带逐请求变量的段被拒绝，变化事件带修订并按作用域到达。这些义务归 [request-context-cordis](../../request-context-cordis/docs/cordis.md#验证义务)。
