# request-context-cordis 的 Cordis 集成

本页是 Request Context 的 Service 实现正文：具体子类与插件、配置与策略选择、isolate 绑定、贡献登记表、变化事件派发与撤除顺序。它是组内「Service 实现、撤除与资源清理」这一主题在 Request Context 一侧的唯一拥有者（[组架构](../../docs/architecture.md#主题与唯一拥有者)）。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 9。

服务键、抽象类、intercept 配置、事件、登记协议与策略选择的配置形状归 [request-context-cordis-contract 的 Cordis 说明](../../request-context-cordis-contract/docs/cordis.md)，本插件继承这些定义，不重复提供键。缓存、派生物与默认策略归 [request-context](../../request-context/docs/architecture.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

现状：`src/cordis.ts` 与 `src/index.ts` 只有模板标记，插件没有实现，包里没有可用的 `./cordis` 导出。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 插件与服务

`./cordis` 导出 `RequestContextService` 的具体子类与插件。本成员只提供一个键 `requestContext`。抽象类的构造函数以这个键登记服务，子类不写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)）。服务登记在装载它的那条插件 fiber 上，插件撤除时键上就没有服务了。

插件加载时按配置选定两个策略实现，再调用 request-context 的工厂，交入两个策略与登记面的读口，得到一个机制实例。本插件不在构造时交三项端口，也不 `inject` 作用域持有者或模型侧的服务。服务实例拥有这个机制实例与贡献登记表。登记面三项方法的 Cordis 责任如下：

| 方法 | 本插件加的责任 | 交给谁 |
| --- | --- | --- |
| `contributeSection`、`contributeVariable` | 从调用方 fiber 取作用域引用，核对重名与逐请求变量，在调用方 fiber 上登记效应，调用 `notify('contributions', …)`，派发变化事件。关闭后拒绝 | 机制实例从登记面读口读段并渲染，渲染结果只归它 |
| `contributions(scope)` | 按作用域解析，作用域层遮蔽全局层。关闭后拒绝 | 结果交给调用方查看。`assembly(scope, ports)` 的操作组自己现取贡献，不经调用方转交 |

本成员不导出第二个服务键，不增补新事件（[SPEC 范围与依据](../SPEC.md#范围与依据)）。它不导入任何协调者或持有者的契约（性质 7）。

经 Cordis 的调用方用服务的 `assembly(scope, ports)` 取得已按配置绑定策略与登记面的一组纯操作（[request-context-cordis-contract 的服务定义](../../request-context-cordis-contract/docs/cordis.md#服务定义)）。`ports` 是历史源读口、计量端口与转换件结果端口，由调用方逐次交入，本插件经机制实例的按调用交入端口的入口转交，这组操作只用这次交入的端口（性质 6）。性质 5 取消的在途组装就是经这组操作发起的组装。这组操作每次调用时从本插件的登记表现取该作用域适用的贡献集合，不收调用方传入的贡献，覆盖证据记本作用域适用的段列表摘要与登记面实例的代次；操作组的作用域与组装上下文、历史依据的作用域引用不一致时返回无效（性质 9）。

本插件只把登记与撤除经 `notify('contributions', …)` 交给机制实例（性质 8）。它不订阅 Runtime Context 的事件、持有者的提交通知或模型选择变更：订阅前两者要导入对方的服务定义或做全局监听，而正确性本来只靠每次调用时比较输入携带的修订（[request-context 候选缓存](../../request-context/SPEC.md#候选缓存)）。

## 配置与策略选择

插件配置用 Standard Schema 校验（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。Service 子类用静态 `Config` 声明 Schema。选择部分的形状由服务定义成员定义，本插件校验并使用它。

| 字段 | 含义 | 去向 |
| --- | --- | --- |
| 压缩策略的选择与参数 | 选哪一个压缩策略实现，以及它的触发界线、保留预算、保留偏好、修剪优先与步数上界 | 选定的实现传给 request-context 的工厂 |
| 表示策略的选择与偏好顺序 | 选哪一个表示策略实现，以及按模态的偏好顺序 | 同上 |
| 修剪阈值 | 修剪器缩短工具结果与媒体占位的界线 | 工厂的配置 |
| 缓存容量 | 每个消费位置保留多少个候选 | 工厂的配置 |

默认值只是初值，数值归 [request-context SPEC](../../request-context/SPEC.md#默认策略与修剪器)。字段名随实现确定。

策略实现在插件加载时按配置选择（性质 4）：

1. 静态 `Config` 校验配置。
2. 配置指向不存在的策略，或策略参数不合 Schema，插件加载失败，fiber 进入 `FAILED`，不提供任何服务（[plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)）。
3. 不静默回退到默认策略。理由是回退会让装配者以为自己选的策略在用，而实际计算用的是另一个。
4. 校验通过后构造策略实例，再调用工厂。

改策略就是改插件配置，本插件重新装载。重新装载的影响半径见[服务定义的代价](../../request-context-cordis-contract/docs/architecture.md#策略选择是配置不是服务方法)。

这条 basis 按函数插件核验。Service 子类静态 `Config` 的路径没有单独核验，所以「配置错误即 `FAILED`」对本插件还是假设，由本成员的测试补证。

## isolate 绑定

一个 isolate 标签下只装一份本插件（[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。同一标签下重复装载时，第二份在 `provide` 时失败，不静默覆盖（性质 1）。Cordis 4.0.4 的 `provide` 发现同一标签下已有登记时抛出 `service "…" has been registered`（源码读数：`reflect.ts` 的 `provide`）。本成员的测试要验证重复装载失败。

要两份实现并存，例如两套不同的策略配置，分到不同的 isolate 标签下，并由装配拥有者写明谁看见哪一份。isolate 只隔离服务实例的可见性，不隔离数据（[isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md)）。所以 isolate 不用于租户或作用域的分隔。租户、作用域与资格全部随操作参数进入（性质 6、[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 贡献登记表

登记方法按 [request-context-cordis-contract 的登记协议](../../request-context-cordis-contract/docs/cordis.md#登记与撤除协议)实现（性质 2、3、[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：

1. 用 `this[Service.resolveConfig]()` 取调用方 fiber 的 intercept 配置里的作用域引用。取不到即拒绝，不默认为任何一层。经 `ctx.get` 现取服务的调用方没有这份配置，所以会被拒绝。
2. 同一层已有同名登记时拒绝，不覆盖。段带逐请求变化的变量时拒绝。
3. 在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，效应落在贡献者插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
4. 这一层的登记修订前进，调用机制实例的 `notify('contributions', …)`，再派发变化事件，见[变化事件派发](#变化事件派发)。
5. 返回 effect 的撤除函数。

撤除函数移除登记，调用 `notify('contributions', …)`，再派发变化事件（性质 2）。机制实例收到通知后重读该层，丢弃已撤除段的渲染结果；本插件不持有渲染结果。显式调用撤除函数与贡献者 fiber 卸载走同一个函数。一条登记的移除与通知写在同一个撤除函数里，因为不同 effect 之间的释放是并发的（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。

`contributions(scope)` 按作用域引用解析：作用域层的贡献遮蔽全局层的同名贡献。登记表只在本插件的进程内，不耐久。进程失败后由贡献者重新登记来重建（[SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期)）。

贡献者插件卸载后，`contributions(scope)` 不再返回它的贡献，后续组装不再包含它。已经交出的候选不撤回。

## 变化事件派发

登记成功即派发 `request-context-cordis-contract/changed`，载荷带作用域引用、该层新的登记修订与登记面实例的代次（性质 3）。登记面的每一层各有修订；登记面实例的代次在本插件每次构造登记面时新取。撤除时同样派发，因为服务定义规定贡献变化即发（[服务定义的性质 6](../../request-context-cordis-contract/SPEC.md#结果与不变量)）。

1. 派发走 `this.ctx.emit`，模式 `emit`。
2. 派发放在 `try` 中。监听者同步执行，不得返回 Promise。监听者抛出时只记录诊断，已成立的登记不变（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。Cordis 4.0.4 的 `emit` 不捕获监听者的异常，排在抛出者后面的监听者这一轮不被调用（[emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md)）。错过事件不改变组装结果，因为缓存按修订比较。
3. 每次派发不建 fiber，不建 isolate（性质 6、[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。

过滤由监听者按载荷完成，派发方不用 `Context.filter`（[服务定义的性质 6](../../request-context-cordis-contract/SPEC.md#结果与不变量)）。全局层的贡献变化时，载荷的作用域引用为 `null`；监听作用域 X 的一方也接收 `null` 载荷。修订按层计，别的作用域的变化不影响作用域 X 的提示词键。机制实例不靠本事件得知变化，本插件经 `notify` 直接交给它。

## 撤除顺序

插件卸载时，本插件按下列顺序撤除（性质 5）：

1. 拒绝新的登记；新的组装返回不可用（服务已卸载）。
2. 取消在途组装（[RQ-09](../../request-context-contract/SPEC.md#rq-09-取消恢复与迟到) 允许取消组装）。被取消的组装返回不可用（服务已卸载）。撤除不等待被取消的组装里尚未返回的端口调用，不无限等待。
3. 丢弃登记表与缓存，关闭机制实例。

三步写在同一个 effect 里，不分成几个 effect 再指望它们按逆序完成（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。撤除函数里的一步抛出时，Cordis 只记日志，不上抛，所以撤除函数要自己捕获每一步，并保证后续步骤仍然执行。

撤除不撤回已交出的候选、计划或转换。贡献登记在贡献者插件的 fiber 上。本插件撤除时，`inject` 了 `requestContext` 的贡献者插件随之卸载或重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)），它们的撤除函数与本插件的撤除并发运行。所以每条登记的撤除函数要能在登记表已丢弃后安全返回，不抛出。

进程失败后本成员没有可恢复的东西。重建沿贡献者重新登记（[SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期)）。

## 两块的生产者

本插件是 `context.compaction-settings` 与 `context.window-usage` 两块的生产者（性质 10、[RQ-02](../../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。Runtime Context 对本插件是可选依赖，按 [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8) 用 `ctx.inject(['runtimeContext'], …)` 把登记两块的那段工作放进子 fiber，不把整个插件挂在 Runtime Context 上：

| 情形 | 结果 |
| --- | --- |
| Runtime Context 在场 | 子 fiber 运行，带生产者身份与两块的声明登记供值 |
| Runtime Context 不在场 | 子 fiber 停在 `PENDING`，本插件照常提供 `requestContext`，两块读到缺项 |
| Runtime Context 后到场 | 子 fiber 运行并登记 |
| Runtime Context 换代或撤除 | 子 fiber 卸载，本代登记撤除；换代后子 fiber 重跑，以同一生产者身份重新登记，得到新代际 |
| 本插件卸载 | 子 fiber 随之卸载，登记撤除 |

`context.window-usage` 的按作用域供值回调取机制实例记下的该作用域最近一次固定请求的占用比例；进程重启后到下一次固定请求之前，回调取不到值，这一块读到缺项。`context.compaction-settings` 的回调取当前选定压缩策略的保留预算与保留偏好。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 子类 `extends RequestContextService`，不写键，不自己 `ctx.provide` | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口不导出任何东西。独立路径从 request-context 取工厂 | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 重复装载在 `provide` 时失败 | 源码读数。测试随实现进入 |
| [IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12) 通知的失败处理 | `emit` 放在 `try` 中，监听者失败只记录诊断 | 机制有 basis。测试随实现进入 |
| [IC-8](../../../../docs/architecture/cordis-integration-conventions.md#ic-8) 必需依赖与子 fiber | Runtime Context 不在 `inject` 里；只有登记两块的那段工作经 `ctx.inject(['runtimeContext'], …)` 放进子 fiber | 没有源码 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | 登记方法在调用方 fiber 上登记，撤除函数移除登记并通知机制实例。不采用目录写法 | 效应归属有 basis。贡献者卸载后撤除的测试随实现进入 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 静态 `Config` 用 Standard Schema。指向不存在的策略或参数不合 Schema 即 `FAILED`，不回退 | Service 子类路径没有 basis，测试随实现进入 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是不透明键。不为每次请求开 fiber，不用 `inject` 表达输入，不建 isolate | 没有源码 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 租户、作用域与资格随操作参数进入。intercept 配置与 isolate 都不授予资格 | 没有源码 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证 | 登记表与缓存是进程内副本。重建靠贡献者重新登记，结果靠输入重算 | 写在 [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |

## 机制读数与假设

本成员的性质 2 依赖还没有进入 basis 的机制读数 `inject-object-config-reaches-service-resolve-config`，probe 要证明的内容见 [runtime-context-cordis-contract 的机制读数与假设](../../runtime-context-cordis-contract/docs/cordis.md#机制读数与假设)。按本成员 [SPEC 的组合与验证](../SPEC.md#组合与验证)，读数补齐之前，性质 2 的 intercept 部分是假设，不是已核验的保证。事件由监听者按载荷过滤，不依赖派发方过滤的读数。

本成员另有两项只有源码读数或缺少专门核验的机制：

| 机制 | 依据现状 | 影响的性质 |
| --- | --- | --- |
| 同一 isolate 标签下重复 `provide` 抛出 | 源码读数 | 性质 1 |
| Service 子类静态 `Config` 校验失败使 fiber `FAILED` | basis 只核验了函数插件 | 性质 4 |

## 验证义务

本成员的测试随实现进入 `tests/`，至少覆盖 SPEC [组合与验证](../SPEC.md#组合与验证)列出的各项：

1. 贡献者插件卸载后，登记已撤除，机制实例收到通知后不再有它的渲染结果。
2. 同一层同名登记被拒绝。
3. 带逐请求变化变量的段被拒绝。
4. 变化事件带该层修订与实例代次。
5. 配置指向不存在的策略时 fiber 进入 `FAILED`。
6. 插件卸载时在途组装被取消并返回不可用，撤除不无限等待；关闭后的组装返回不可用。
7. 登记与撤除都经 `notify('contributions', …)` 到达机制实例（性质 8）。
8. `assembly(scope, ports)` 只用这次交入的端口。
9. Runtime Context 不在场时本插件照常可用、两块读到缺项；Runtime Context 到场后两块有值。
10. 同一 isolate 标签下重复装载失败。

第 1、4、9 项在真实 Cordis 4.0.4 上运行，不用替身。服务定义列出的「作用域层遮蔽全局层」也由本成员的测试承担（[服务定义的验证义务](../../request-context-cordis-contract/docs/cordis.md#验证义务)）。本成员不覆盖持久化与跨进程一致性，也不覆盖真实贡献者、协调者与持有者的端到端组合。定义入口自身的验证义务归 [request-context-cordis-contract](../../request-context-cordis-contract/docs/cordis.md#验证义务)。
