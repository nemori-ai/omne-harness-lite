# @omne-harness/runtime-context-cordis-contract 行为规格

状态：Cordis 定义成员，`draft`。本成员只拥有 Runtime Context 的 Cordis 定义：一个服务键、一个抽象 `Service`、一个事件、一种 intercept 配置。领域行为归 [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md)。本页不另写第二份保证。`./cordis` 已实现服务定义；领域机制及生产提供者不在本成员。

## 范围与依据

本成员承接 [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)、[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17) 对 Runtime Context 这一个接缝的要求。服务定义、依赖分类、登记与撤除协议、事件和三条机制读数的当前验证边界归 [docs/cordis.md](docs/cordis.md)。

根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 定义从 `./cordis` 导出。

## 结果与不变量

本成员必须保持下列性质。

1. 服务键 `runtimeContext` 只由抽象类 `RuntimeContextService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键。
2. `RuntimeContextService` 实现契约根入口的[三面操作](../runtime-context-contract/SPEC.md#三面操作)类型：生产者面 `registerProducer`，持有者面 `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`，读者面 `bind`。同一组签名不写两份。类上的 JSDoc 写 `@owner packages/context/runtime-context-contract`。
3. intercept 配置类型是 `{ consumer: ConsumerClass }`。消费者插件以对象形式 `inject: { runtimeContext: { consumer: '…' } }` 声明自己的消费者类。服务方法经 `this[Service.resolveConfig]()` 沿调用方 fiber 取得它。这是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。`bind` 把它与读取资格里的消费者类核对，不一致即拒绝。这条核对是一致性检查，不计为访问控制。访问边界是读取资格：资格由作用域持有者签发、由机制的资格表保管，每次读取按资格核对（[RC-03](../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。
4. `registerProducer` 登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：在方法里用 `this.ctx.effect` 登记，登记落在生产者插件的 fiber 上，生产者卸载即撤。登记带生产者身份。生产者句柄的代际由机制在每次登记时新取，单调递增，不取 fiber `uid`（[RC-07](../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。撤除函数只移除本代登记；本代已被新一代替换时不改动。提供者须验证生产者卸载后登记已撤除，并验证插件体重跑时新旧两代的登记与撤除交错不删掉新一代的登记。
5. 事件只有一个：`runtime-context-cordis-contract/changed`，载荷是作用域引用与视图修订，模式 `emit`。载荷不带块键，不带值。它只是唤醒提示，不是事实源；读者按读取取得变化。派发方按作用域过滤：监听者在扩展 ctx 上以属性键 `scope` 标出作用域引用，派发对象带 `Context.filter`，只到达标记相同的监听者。属性键 `scope` 由本成员定义。监听本事件不得用全局监听。这是约定，Cordis 不阻止全局监听；执行点是载荷：载荷只含作用域引用与修订，不含受存在性披露约束的信息。丢失事件不影响正确性，下一次读取承接。
6. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。作用域是操作参数 `ScopeRef`，不是 Cordis Context，也不是 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。租户随读取资格作为参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 块是数据不是服务。没有任何一方 `inject` 一个块。必需块缺席是读取时的缺项（[RC-03](../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)），不让消费者 fiber 进入 PENDING。
8. `./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/runtime-context` 或 `@omne-harness/runtime-context-cordis`。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务键与抽象类 | 本成员 | 随包 |
| 生产者登记 | 生产者插件的 fiber | 插件卸载、`dispose` 句柄，或服务撤除 |
| 消费者类声明 | 消费者插件的 intercept 配置 | 随消费者 fiber |
| 事件监听 | 监听者的 fiber（经 `ctx.on`） | 随监听者 fiber |
| 值、修订、游标、资格核对 | 不在本成员。归 [runtime-context](../runtime-context/SPEC.md) | — |

服务撤除、在途读取结算、旧代迟到发布的拒绝是提供者的责任，归 [runtime-context-cordis SPEC](../runtime-context-cordis/SPEC.md)。本成员只定义这些操作的形状与承诺。

## 组合与验证

| 承诺 | 位置 | 本成员怎样消费 |
| --- | --- | --- |
| 三面操作与纯函数 | [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) | 抽象类实现其操作类型 |
| 生产者句柄代际与撤除 | [RC-07](../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复) | 性质 4 |
| 变化只是唤醒 | [RC-04](../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料) | 性质 5 |
| 事件命名与增补位置 | [IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11) | 性质 5 |

持续验证义务由提供者承担：生产者卸载后登记撤除；插件体重跑时旧一代的撤除不删掉新一代的登记；两个不同消费者类的插件各取到自己的 intercept 配置；按作用域过滤的唤醒只到达该作用域的监听者，载荷不带块键。机制读数与性质的对应以 [docs/cordis.md 的机制读数与假设](docs/cordis.md#机制读数与假设)为准：

- `inject-object-config-reaches-service-resolve-config` 支撑性质 3，即各插件取到自己的 intercept 配置。
- `emit-filter-selects-listeners-by-extended-ctx` 与 `ctx-set-does-not-notify` 支撑性质 5，即按作用域过滤的唤醒，以及值变化只经本事件通知。
- 性质 4 里「生产者卸载即撤」的效应归属已有 basis。代际由机制新取，不依赖 fiber `uid`，所以不需要 fiber `uid` 的 probe。新旧两代交错的撤除由提供者的测试覆盖。

三条读数已在本成员的真实 Cordis 4.0.4 测试中固定，结论与性质一致。它们尚未登记到 basis；本地验证不授予跨成员的共同采用，也不证明生产提供者的完整并发和恢复行为。提供者的交错与资源结算义务仍须自行验证。

文档导航见 [index](index.md)。
