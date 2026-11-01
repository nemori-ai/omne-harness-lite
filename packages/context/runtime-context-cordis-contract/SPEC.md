# @omne-harness/runtime-context-cordis-contract 行为规格

状态：Cordis 定义成员，`draft`。本成员只拥有 Runtime Context 的 Cordis 定义：三个服务键（`runtimeContext`、`runtimeContextTrust`、`runtimeContextReaderEligibility`）与对应的三个抽象 `Service`、一个事件、一种 intercept 配置，以及 `./testing` 子路径的读取资格交接替身与套件。领域行为归 [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md)。本页不另写第二份保证。`./cordis` 已实现服务定义；领域机制及生产提供者不在本成员。

## 范围与依据

本成员承接 [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)、[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17) 对 Runtime Context 这一个接缝的要求。服务定义、依赖分类、登记与撤除协议、事件和三条机制读数的当前验证边界归 [docs/cordis.md](docs/cordis.md)。

根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 定义从 `./cordis` 导出。

## 结果与不变量

本成员必须保持下列性质。

1. 服务键 `runtimeContext` 只由抽象类 `RuntimeContextService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键。
2. `RuntimeContextService` 实现契约根入口的[三面操作](../runtime-context-contract/SPEC.md#三面操作)类型：生产者面 `registerProducer`，持有者面 `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`、`beginReplay`、`finishReplay`，读者面 `bind`。八个抽象方法的参数与结果都从根入口的操作类型推出，同一组签名不写两份。调用方主体是操作的第一个参数，不从 intercept 配置或 fiber 取得。类上的 JSDoc 写 `@owner packages/context/runtime-context-contract`。
3. intercept 配置类型是 `{ consumer: ConsumerClass }`。消费者插件以对象形式 `inject: { runtimeContext: { consumer: '…' } }` 声明自己的消费者类。服务方法经 `this[Service.resolveConfig]()` 沿调用方 fiber 取得它。这是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。`bind` 把它与读取资格里的消费者类核对，不一致即拒绝。这条核对是一致性检查，不计为访问控制。访问边界是读取资格：资格由作用域持有者签发、由机制的资格表保管，每次读取按资格核对（[RC-03](../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。
4. `registerProducer` 登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：在方法里用 `this.ctx.effect` 登记，登记落在生产者插件的 fiber 上，生产者卸载即撤。登记带调用方主体、租户与生产者身份，生产者槽是租户加块键。生产者句柄的代际由机制在每次登记时新取，单调递增，不取 fiber `uid`（[RC-07](../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)）。撤除函数只移除本代登记；本代已被新一代替换时不改动。一个插件为几个租户供值时，为每个租户分别登记，撤除各自的句柄。提供者须验证生产者卸载后登记已撤除，并验证插件体重跑时新旧两代的登记与撤除交错不删掉新一代的登记。
5. 事件只有一个：`runtime-context-cordis-contract/changed`，载荷是作用域引用与视图修订，模式 `emit`。载荷不带块键，不带值。它只是唤醒提示，不是事实源；读者按读取取得变化。派发方按作用域过滤：监听者在扩展 ctx 上以属性键 `scope` 标出作用域引用，派发对象带 `Context.filter`，只到达标记相同的监听者。属性键 `scope` 由本成员定义。监听本事件不得用全局监听。这是约定，Cordis 不阻止全局监听；执行点是载荷：载荷只含作用域引用与修订，不含受存在性披露约束的信息。丢失事件不影响正确性，下一次读取承接。作用域过滤与禁止全局监听不是安全隔离。本事件只供受信装配使用，不开放给不受信的插件。本成员不在载荷里增加租户字段来伪造通知授权。
6. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。作用域是操作参数 `ScopeRef`，不是 Cordis Context，也不是 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。租户随读取资格、注册材料、生产者登记与发布输入作为参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 块是数据不是服务。没有任何一方 `inject` 一个块。必需块缺席是读取时的缺项（[RC-03](../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)），不让消费者 fiber 进入 PENDING。
8. `./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/runtime-context` 或 `@omne-harness/runtime-context-cordis`。
9. 契约的两个权威端口（可信绑定来源与权威端口，见[通用权威端口](../runtime-context-contract/SPEC.md#通用权威端口)）是装配入口交给 Service 实现的运行时对象，不进插件树，也不由消费者插件提供。本成员不为它们定义服务键。Service 实现取不到端口时，对应操作按「不可用」收场，不放行。
10. 构造输入键 `runtimeContextTrust` 只由抽象类 `RuntimeContextTrustService` 的 `static readonly provide` 给出，`super` 与常量 `runtimeContextTrustKey` 取自它，逐属性投影契约根入口的 `RuntimeContextTrust`。装配入口在受信子树 provide；提供者插件 `inject` 该键，键缺席时停在 PENDING。它不是 Runtime Context 能力，不进插件树 JSON 与插件配置，不增事件。子树可见性是装配位置，不是封装保证。
11. 读取资格交接键 `runtimeContextReaderEligibility` 只由抽象类 `RuntimeContextReaderEligibilityService` 的 `static readonly provide` 给出，常量 `runtimeContextReaderEligibilityKey` 取自它。类实现契约根入口的 `ReaderEligibilityHandoff`。作用域持有者的适配器提供它，建立读者的一方 `inject` 它。`current({ principal, tenant, scope, consumer })` 返回五种结果之一：`current`（带资格身份）、`absent`、`refused`、`unknown`、`unavailable`。作用域不属于请求里的租户时，答复是 `refused`。持有者按自己的政策答复：可以返回已签发的资格，也可以当场签发。交接不授予读取权，访问边界仍是资格表与每次读取的核对（[RC-03](../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。返回的资格被取代或撤销后，`bind` 被拒，建立读者的一方再取一次。
12. `./testing` 子路径发布脚本替身 `createScriptedReaderEligibility` 与套件 `readerEligibilityConformance`。脚本替身只答列出的请求：作用域绑定的租户与请求不同时答 `refused`，没有列出的请求答 `unavailable`，资格必须显式列出。套件不导入提供者成员，夹具交入被测的交接。根入口与 `./cordis` 不转导出 testing。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务键与抽象类 | 本成员 | 随包 |
| 生产者登记 | 生产者插件的 fiber | 插件卸载、`dispose` 句柄，或服务撤除 |
| 消费者类声明 | 消费者插件的 intercept 配置 | 随消费者 fiber |
| 交出的资格身份 | 签发它的作用域持有者；建立读者的一方只持有身份 | 资格被取代或撤销时 `bind` 被拒，再取一次 |
| 事件监听 | 监听者的 fiber（经 `ctx.on`） | 随监听者 fiber |
| 值、修订、游标、资格核对 | 不在本成员。归 [runtime-context](../runtime-context/SPEC.md) | — |

服务撤除、在途读取结算、旧代迟到发布的拒绝是提供者的责任，归 [runtime-context-cordis SPEC](../runtime-context-cordis/SPEC.md)。本成员只定义这些操作的形状与承诺。

## 组合与验证

| 承诺 | 位置 | 本成员怎样消费 |
| --- | --- | --- |
| 三面操作与纯函数 | [runtime-context-contract SPEC](../runtime-context-contract/SPEC.md) | 抽象类实现其操作类型 |
| 生产者槽、句柄代际与撤除 | [RC-07](../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复) | 性质 4 |
| 恢复会话的两个操作 | [RC-09](../runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值) | 性质 2 |
| 权威端口由调用方提供 | [通用权威端口](../runtime-context-contract/SPEC.md#通用权威端口) | 性质 9 |
| 变化只是唤醒 | [RC-04](../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料) | 性质 5 |
| 事件命名与增补位置 | [IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11) | 性质 5 |

持续验证义务由提供者承担：读取资格交接的提供者运行 `readerEligibilityConformance`；生产者卸载后登记撤除；两个租户在同一块键上的登记各自撤除，互不影响；插件体重跑时旧一代的撤除不删掉新一代的登记；两个不同消费者类的插件各取到自己的 intercept 配置；按作用域过滤的唤醒只到达该作用域的监听者，载荷不带块键。机制读数与性质的对应以 [docs/cordis.md 的机制读数与假设](docs/cordis.md#机制读数与假设)为准：

- `inject-object-config-reaches-service-resolve-config` 支撑性质 3，即各插件取到自己的 intercept 配置。
- `emit-filter-selects-listeners-by-extended-ctx` 与 `ctx-set-does-not-notify` 支撑性质 5，即按作用域过滤的唤醒，以及值变化只经本事件通知。
- 性质 4 里「生产者卸载即撤」的效应归属已有 basis。代际由机制新取，不依赖 fiber `uid`，所以不需要 fiber `uid` 的 probe。新旧两代交错的撤除由提供者的测试覆盖。

三条读数已在本成员的真实 Cordis 4.0.4 测试中固定，结论与性质一致。它们尚未登记到 basis；本地验证不授予跨成员的共同采用，也不证明生产提供者的完整并发和恢复行为。提供者的交错与资源结算义务仍须自行验证。

文档导航见 [index](index.md)。
