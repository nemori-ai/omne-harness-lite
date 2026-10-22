# Runtime Context 的 Cordis 定义

本页是 Runtime Context 这一接缝的 Cordis 定义正文：服务键、抽象 `Service`、intercept 配置、事件、依赖分类、登记与撤除协议，以及它们怎样符合 IC 约定。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 8。三面操作的领域行为归 [runtime-context-contract SPEC](../../runtime-context-contract/SPEC.md)，机制归 [runtime-context](../../runtime-context/docs/architecture.md)，Service 实现、isolate 绑定、撤除与资源清理归 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，本页不复制。

现状：`src/cordis.ts` 与 `src/index.ts` 只有模板标记，两个入口都没有导出。下文是 SPEC 固定的目标形状，不是源码事实。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 服务定义

| 定义 | 形状 | 依据 |
| --- | --- | --- |
| 服务键 | `runtimeContext`，只由 `RuntimeContextService` 的 `static readonly provide` 给出。`./cordis` 导出的键常量取自它，常量名随实现确定 | 性质 1，[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[IC-7](../../../../docs/architecture/cordis-integration-conventions.md#ic-7) |
| 抽象类 | `RuntimeContextService extends Service`，构造函数以 `RuntimeContextService.provide` 调 `super`。它 `implements` 契约根入口的三面操作类型，同一组签名不写两份 | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| 类的 JSDoc | `@owner packages/context/runtime-context-contract`。三面操作出自协议形状，没有契约 ID，所以写 `@owner`，不写 `@contract` | 性质 2，[IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) |
| intercept 配置类型 | `{ consumer: ConsumerClass }`，`ConsumerClass` 取自契约根入口 | 性质 3 |
| 事件 | `runtime-context-cordis-contract/changed`，模式 `emit`，载荷是作用域引用与视图修订 | 性质 5，[IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) |

三面方法如下。方法的输入、结果与失败归契约，本表只说明谁调用、本成员加了什么 Cordis 承诺。

| 面 | 方法 | 调用方 | 本成员加的 Cordis 承诺 |
| --- | --- | --- | --- |
| 生产者面 | `registerProducer` | 生产者插件，在自己的插件体里调用 | 登记即效应，登记落在调用方 fiber 上。代际由机制新取，撤除函数只移除本代登记。见[登记与撤除协议](#登记与撤除协议) |
| 持有者面 | `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit` | 作用域持有者的适配器 | 没有额外的 Cordis 承诺。注册、资格与步提交都是参数与结果，提交归持有者（[RC-02](../../runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)、[RC-05](../../runtime-context-contract/SPEC.md#rc-05-状态块上下文更新与步提交)） |
| 读者面 | `bind` | 消费者一侧的适配器插件 | 消费者类从调用方 fiber 的 intercept 配置读出，与读取资格核对。见 [intercept 配置与消费者类](#intercept-配置与消费者类) |

本成员不定义第二个服务键，不定义块级服务。块是数据，不是服务。没有任何一方 `inject` 一个块。必需块缺席是读取时的缺项（[RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)），不让消费者 fiber 进入 `PENDING`（性质 7）。

## intercept 配置与消费者类

消费者插件用对象形式的 `inject` 声明自己以哪个消费者类来读：

```ts
export const inject = {
  runtimeContext: { consumer: 'model' },
}
```

对象形式仍然是必需依赖。对象里的值只是给这项服务的 intercept 配置，不是「可选」标记（[inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md)）。所以 `runtimeContext` 不在场时，消费者插件停在 `PENDING`。这与块缺席无关：块缺席仍然只是读取结果里的缺项。

服务方法用 `this[Service.resolveConfig]()` 取得配置。服务方法里的 `this.ctx` 是调用方的上下文（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)），所以取到的是调用方 fiber 声明的配置。不同消费者插件各自取到自己的配置。这一点现在是源码读数，见[机制读数与假设](#机制读数与假设)。

消费者类是装配事实，不是资格授予（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。`bind` 把配置里的消费者类与读取资格里的消费者类核对，不一致即拒绝。这条核对是一致性检查，不计为访问控制。访问边界是读取资格：资格只来自作用域持有者签发，由机制的资格表保管，每次读取按资格核对（[RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。资格身份由持有者交给建立读者的一方，读者按资格身份 `bind`。经 `ctx.get` 现取服务的调用方没有这份配置。按 [runtime-context-cordis 的性质 2](../../runtime-context-cordis/SPEC.md#结果与不变量)，取不到配置的 `bind` 被拒绝。所以读者面的调用方必须用对象形式 `inject`。

## 事件

`runtime-context-cordis-contract/changed` 是本成员唯一的事件。名称的范围取声明它的包名，事件部分用过去分词，符合 [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10)。`./cordis` 增补 `Events`，JSDoc 写 `@mode emit` 与载荷各项的 `@param`（[IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。

| 项 | 内容 |
| --- | --- |
| 载荷 | 作用域引用与视图修订。不带块键，不带值，不带前值 |
| 含义 | 只是唤醒提示，不是事实源。监听者被唤醒后经绑定读者读取，按读取取得变化，读到什么以读取结果为准（[RC-04](../../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)） |
| 过滤 | 派发方按作用域过滤。监听者在扩展 ctx 上以属性键 `scope` 标出作用域引用；派发对象带 `Context.filter`，只到达标记等于本次作用域引用、并在那里 `on` 的监听者。精确派发归 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md) |
| 监听者 | 同步执行，不得返回 Promise。派发方把 `emit` 放在 `try` 中，监听者失败只记录诊断，不改变已提交的结果（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)、[emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md)） |
| 丢失 | 不影响正确性。下一次执行开始或挂接建立时，调用方主动取完整快照承接（[RC-04](../../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)） |

监听者在扩展 ctx 上标记作用域所用的属性键是 `scope`（[性质 5](../SPEC.md#结果与不变量)）。派发方的 filter 与监听者共用这个键。按 [IC-1](../../../../docs/architecture/cordis-integration-conventions.md#ic-1)，它随本成员的服务定义维护。

Cordis 4.0.4 的派发对用 `{ global: true }` 注册的监听者不做过滤（源码读数：`events.ts` 的 `dispatch`）。监听本事件的一方不得用全局监听，否则会收到所有作用域的唤醒。这是约定，Cordis 不阻止全局监听，本成员也不阻止。执行点在载荷：载荷只有作用域引用与视图修订，不含块键、值或其他受存在性披露约束的信息，所以全局监听者只能得知某个作用域在某个修订有变化，读不到内容。内容仍只经按资格的读取取得。

## 依赖分类

| 依赖方 | 怎样依赖 | 换代或缺席时 |
| --- | --- | --- |
| 生产者插件 | 数组形式 `inject: ['runtimeContext']`，用定义包导出的键常量或字符串字面量（[IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8)） | 提供者换代，生产者插件体先卸载再重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)）。旧登记随旧 fiber 撤除，重跑后以同一生产者身份重新登记，得到新代际。旧撤除函数晚于新登记运行时，只移除旧一代，不动新一代 |
| 作用域持有者的适配器 | 数组形式 `inject` | 同上。注册、资格与步提交的耐久保存归持有者，不随插件重跑丢失 |
| 消费者一侧的适配器插件 | 对象形式 `inject: { runtimeContext: { consumer } }` | 提供者换代，插件体重跑。重跑后重新 `bind`，先取完整快照（[RC-04](../../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)） |
| 只监听唤醒的一方 | 不 `inject`。用 `ctx.on` 监听事件，类型增补用 `import type {} from '@omne-harness/runtime-context-cordis-contract/cordis'` 取得（[IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9)） | 提供者不在场时没有唤醒。正确性不依赖唤醒 |
| 提供者 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md) | `extends RuntimeContextService`，不另写键，不自己 `ctx.provide` 这个键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)） | 不适用 |
| 只需要契约类型的包 | 从 [runtime-context-contract](../../runtime-context-contract/README.md) 根入口 `import type`。不需要本成员 | 不适用 |

依赖方只引用本成员与契约成员，不导入提供者的实现入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。提供者选择归应用装配。

## 登记与撤除协议

本成员按 [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 的「登记即效应」定义 `registerProducer`：

1. 生产者插件在自己的插件体里调用 `registerProducer`。
2. 提供者在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，所以效应落在生产者插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
3. 登记带生产者身份。生产者句柄的代际由机制在每次登记时新取，单调递增（[RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。提供者不取 fiber `uid` 作代际，因为插件体重跑后 `uid` 是否变化没有核验。
4. 生产者句柄的 `dispose` 调用 effect 返回的撤除函数。显式 `dispose` 与 fiber 卸载走同一个撤除函数。
5. 撤除函数先取消本代在途调用，再在超时内等本代在途读取结算，然后只移除本代登记（[RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。本代已被新一代替换时，撤除函数不改动登记。这个次序必须写在同一个 effect 里。不同 effect 之间的释放是并发的（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。

登记结束有三种情形：生产者插件卸载、生产者 `dispose` 句柄、服务撤除。服务撤除时，`inject` 了本服务的生产者插件随之卸载或重跑，它们的效应也被撤除。在途发布与在途读取怎样结算归 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md)。

边界：

- 只有在插件内调用时，登记才跟随生产者撤除。根 Context 上的调用使效应属于根 fiber，只允许测试或装配入口这样用（[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
- 调用方 fiber 已进入卸载后再调用，`effect` 抛 `INACTIVE_EFFECT`，登记不成立（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。
- 本成员不采用 IC-13 的目录写法。生产者登记表示「谁现在在供值」，不是需要显式撤回或接替的业务事实。生产者换代由同一身份的新代际表达，旧代迟到的发布被丢弃，旧代的撤除不动新代（[RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。
- 撤除登记不收回读者已经读到的值，也不撤回任何外部效果。

提供者须验证：生产者插件卸载后，它的登记已撤除；插件体重跑时新一代先登记、旧一代后撤除，新一代的登记仍在。这两条义务归 [runtime-context-cordis](../../runtime-context-cordis/SPEC.md#组合与验证)。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 键只在 `RuntimeContextService.provide`，键常量取自它，提供者 `extends` 不写键 | 没有源码。实现后由导出测试核对键常量等于 `provide` |
| [IC-3](../../../../docs/architecture/cordis-integration-conventions.md#ic-3) 抽象 Service 与 `@owner` | 抽象类 `implements` 三面操作类型，JSDoc 写 `@owner packages/context/runtime-context-contract` | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口只重导出契约类型，Cordis 定义只在 `./cordis` | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有运行导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 本成员只定义一个键。重复装载的处置归提供者 | 归 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md#ic-符合性映射) |
| [IC-10](../../../../docs/architecture/cordis-integration-conventions.md#ic-10) 事件命名 | `runtime-context-cordis-contract/changed`：范围是本包名，过去分词表示通知 | 没有源码 |
| [IC-11](../../../../docs/architecture/cordis-integration-conventions.md#ic-11) 事件增补位置 | 在 `./cordis` 增补 `Events`，JSDoc 写 `@mode emit` 与 `@param` | 没有源码 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | `registerProducer` 在方法里 `this.ctx.effect` 登记，不采用目录写法 | 机制有 basis。撤除验证归提供者 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是操作参数 `ScopeRef`。事件按作用域引用过滤。每次读取不建 fiber，不建 isolate | 按作用域过滤是假设，见下一节 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 租户随读取资格作为参数进入。intercept 配置只声明消费者类，不授予资格；`bind` 的消费者类核对是一致性检查 | 没有源码 |

## 机制读数与假设

本成员的承诺用到下列 Cordis 机制。已有 basis 条目的机制以条目为准。

| 机制 | 依据 | 支撑 |
| --- | --- | --- |
| 服务方法里的 `this.ctx` 是调用方上下文 | [service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md) | 性质 4 的效应归属 |
| 必需服务换提供者，插件体重跑 | [plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md) | 依赖分类 |
| 不同 effect 的释放并发 | [effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md) | 性质 4 的撤除次序 |
| `inject` 没有可选形式 | [inject-has-no-optional-form](../../../../.meta_harness/design/basis/cordis/inject-has-no-optional-form.md) | 性质 3、7 |
| isolate 只隔离实例可见性 | [isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md) | 性质 6 |
| `ctx.<键>` 与 `ctx.get` 的分工 | [ctx-property-is-not-ctx-get](../../../../.meta_harness/design/basis/cordis/ctx-property-is-not-ctx-get.md) | 依赖分类 |

下列三条只有源码读数，还没有进入 basis。每条要补一个 probe，按 basis 的规矩登记。

| 候选条目 | probe 要证明什么 | 支撑的性质 |
| --- | --- | --- |
| `inject-object-config-reaches-service-resolve-config` | 消费者插件写 `inject: { svc: { consumer: 'model' } }`，服务方法里 `this[Service.resolveConfig]()` 取到 `{ consumer: 'model' }`。两个声明不同消费者类的插件各自取到自己的值 | 性质 3。提供者一侧是 [runtime-context-cordis 的性质 2](../../runtime-context-cordis/SPEC.md#结果与不变量) |
| `emit-filter-selects-listeners-by-extended-ctx` | 在两个分别标了作用域 `a` 与 `b` 的扩展 ctx 上各 `on` 一个监听。派发对象带 `Context.filter` 时，`emit` 只唤醒 `a` 的监听者。两个监听属于同一条 fiber，撤除这条 fiber 后两个都被撤除 | 性质 5。提供者一侧是 runtime-context-cordis 的性质 4 |
| `ctx-set-does-not-notify` | 提供者用 `ctx.set` 改服务值后，`internal/service` 不发，`inject` 它的消费者不重跑，`ctx.get` 读到新值 | 性质 5 的前提：值变化不产生任何 Cordis 通知，唤醒只能由本事件给出；值与修订放在服务自己的状态里，变化不会使消费者插件重跑 |

性质 4 的代际由机制新取，不依赖 fiber `uid`，所以 fiber `uid` 不再是必需的 probe。插件体重跑时新旧两代的登记与撤除交错，由提供者的测试覆盖。

这些读数补齐之前，SPEC 的性质 3、5 与性质 4 的交错部分是假设，不是已核验的保证。依赖它们的提供者性质同样是假设，见 [runtime-context-cordis SPEC](../../runtime-context-cordis/SPEC.md#组合与验证)。Cordis 升版时，先按 IC 约定重跑相关 probe。

## 验证义务

本成员自己验证：

- 根入口没有运行导出，也不导入 `@deepseek-ai/cordis`。
- `./cordis` 的源码、生成声明和产物不导入 `@omne-harness/runtime-context` 或 `@omne-harness/runtime-context-cordis`（性质 8）。
- 导出的键常量等于 `RuntimeContextService.provide`。

继承这些定义的提供者验证四条机制性质：生产者卸载后登记已撤除，插件体重跑时旧一代的撤除不删掉新一代的登记，两个消费者类的插件各取到自己的配置，按作用域过滤的唤醒只到达该作用域的监听者。这些义务归 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md#验证义务)。
