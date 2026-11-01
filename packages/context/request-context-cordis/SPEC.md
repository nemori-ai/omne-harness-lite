# @omne-harness/request-context-cordis 行为规格

状态：Service 实现成员，`draft`，没有运行实现。本成员把 [request-context](../request-context/SPEC.md) 的机制装进 [request-context-cordis-contract](../request-context-cordis-contract/SPEC.md) 定义的服务 `requestContext`，并承担贡献登记表、策略实现选择、配置校验失败、isolate 绑定与撤除。领域行为和机制行为都不在本页。

## 范围与依据

本成员从 `./cordis` 导出 `RequestContextService` 的具体子类与插件。根入口不导出任何东西（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）；不装配 Cordis 的独立调用方用 request-context-contract 根入口的 `createAssemblyOperations`，来源登记表的工厂是 [request-context](../request-context/SPEC.md) 的 `createContextSourceRegistry`。本成员提供两个键：`requestContext` 与 `contextAccountingInbox`（由同一个插件在同一个 fiber 提供），并必需 `inject` 信任键 `requestContextTrust`，缺席时停在 `PENDING`。本成员不增补新事件。插件实现尚未交付，见 [Cordis 页](docs/cordis.md)。

配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。可调项：压缩策略的选择与它的参数、表示策略的选择与偏好顺序、修剪阈值、缓存容量。默认值只是初值。

## 结果与不变量

1. 一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。重复装载不静默覆盖。假设：重复装载在 `provide` 时失败，这一点只有源码读数，未经 basis 核验。
2. 贡献登记表的寿命随贡献者 fiber：`contributeSection`、`contributeVariable` 在方法内 `this.ctx.effect` 登记；贡献者卸载时撤除函数移除登记，再调用来源登记表实例的 `notify('contributions', …)`（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。段渲染结果只归来源登记表实例，本插件不持有。作用域引用从调用方 fiber 的 intercept 配置取得：`scope: null` 登记到全局层；取不到配置即拒绝。
3. 同层同名登记拒绝。带逐请求变化变量的段拒绝。登记成功先调用来源登记表实例的 `notify('contributions', …)`，再发 `request-context-cordis-contract/changed`，载荷带作用域引用、该层的新修订与登记面实例的代次；派发放在 `try` 中，监听者失败只记录诊断（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
4. 策略实现在插件加载时按配置选择。配置里指向不存在的策略、或策略参数不合 schema，插件加载失败，不静默回退到默认策略。假设：此时 fiber 进入 `FAILED`，Service 子类的这条路径未经 basis 核验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。
5. 撤除顺序：插件卸载时先拒绝新的登记，新的组装返回不可用（服务已卸载），再取消在途组装（[RQ-09](../request-context-contract/SPEC.md#rq-09-取消恢复与迟到) 允许取消组装），然后丢弃贡献登记表，调用来源登记表的 `close()`，等待全部来源集合结算（[request-context-cordis-contract 性质 11](../request-context-cordis-contract/SPEC.md#结果与不变量)）；disposer 被调用不代替异步结算。被取消的组装返回不可用（服务已卸载）。撤除不撤回已交出的候选、计划或转换。本页的「组装」与「在途组装」都指经服务的 `assembly(target)` 交出的操作组发起的组装（[request-context-cordis-contract 性质 2](../request-context-cordis-contract/SPEC.md#结果与不变量)）。
6. 本成员不为每次请求开 fiber，不用 `inject` 表达输入，不发第二种事件（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。历史源读口、转换件结果等读口属于来源集合，由来源适配者经 `register` 或 `replace` 按目标登记（[RQ-12](../request-context-contract/SPEC.md#rq-12-来源集合与登记面)）；`assembly(target)` 的操作组只借用该目标已登记的来源集合，目标没有登记时返回不可用；本插件不 `inject` 作用域持有者或模型侧的服务，只按配置选两个策略。租户、作用域与资格全部随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 本成员不导入任何协调者或持有者的契约。
8. 本插件只把贡献登记面的变化经 `notify('contributions', …)` 交给来源登记表实例，带作用域引用与该层的修订。本插件不订阅 Runtime Context 的事件、持有者的提交通知或模型选择变更：这些变化随输入携带的修订进入组装，由机制每次比较（[request-context 候选缓存](../request-context/SPEC.md#候选缓存)）。来源登记表实例在构造时从本插件取得登记面的读口。
9. `assembly(target)` 交出的操作组在每次调用时从本插件的登记表现取该作用域适用的贡献集合，不收调用方传入的贡献，覆盖证据记本作用域适用的段列表摘要与登记面实例的代次。操作组的作用域、组装上下文的作用域引用、历史依据的作用域引用三者不一致时返回无效（[request-context-cordis-contract 性质 2](../request-context-cordis-contract/SPEC.md#结果与不变量)）。
10. 本插件是 `context.compaction-settings` 与 `context.window-usage` 两块的生产者（[RQ-02](../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。Runtime Context 对本插件是可选依赖，不写进本插件的 `inject`。本插件用 `ctx.inject(['runtimeContext'], …)` 把登记两块生产者的那段工作放进子 fiber（[IC-8](../../../docs/architecture/cordis-integration-conventions.md#ic-8)）：Runtime Context 在场时子 fiber 运行并登记；不在场时子 fiber 停在 `PENDING`，本插件照常提供服务，两块读到缺项；Runtime Context 后到场时子 fiber 运行并登记；Runtime Context 换代时子 fiber 重跑，以同一生产者身份重新登记。`context.window-usage` 的回调按作用域取来源登记表实例记下的最近一次固定请求的占用比例。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与来源登记表实例 | 本插件的 fiber | 插件卸载 |
| 一条贡献的登记 | 贡献者插件的 fiber | 贡献者卸载、撤除函数、本插件卸载 |
| 段渲染结果 | 来源登记表实例 | 段撤除后的下一次通知，或来源登记表实例关闭 |
| 两块的生产者登记 | 本插件的子 fiber | Runtime Context 撤除或换代、本插件卸载 |
| 策略实例 | 本插件 | 插件卸载 |
| 事件监听 | 监听者的 fiber | 监听者卸载 |

插件卸载时有在途组装：在途组装被取消，返回不可用（服务已卸载）；关闭后到达的组装也返回不可用。进程失败：本成员没有可恢复的东西，重建沿贡献者重新登记。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、intercept 配置、事件 | [request-context-cordis-contract](../request-context-cordis-contract/docs/cordis.md) |
| 机制、缓存、默认策略数值 | [request-context SPEC](../request-context/SPEC.md) |
| 机制读数 | [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md) 列的 `inject-object-config-reaches-service-resolve-config`；定义成员已用真实 Cordis 4.0.4 测试固定，尚未登记为共同 basis 保证。事件由监听者按载荷过滤，不依赖派发方过滤的读数 |

持续验证义务，随实现进入 `tests/`：贡献者卸载后登记已撤除，来源登记表实例收到通知后不再有它的渲染结果；同层重名拒绝；逐请求变量的段拒绝；变化事件带该层修订与实例代次；配置指向不存在的策略时 fiber `FAILED`；插件卸载时在途组装被取消并返回不可用、不无限等待，关闭后组装返回不可用；登记与撤除都经 `notify('contributions', …)` 到达来源登记表实例；`assembly(target)` 只借用该目标已登记的来源集合，目标没有登记时返回不可用；Runtime Context 不在场时本插件照常可用、两块读到缺项，Runtime Context 到场后两块有值；重复装载失败。

本成员不覆盖：持久化与跨进程一致性，以及真实贡献者、协调者与持有者的端到端组合。
