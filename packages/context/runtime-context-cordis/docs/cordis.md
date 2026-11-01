# runtime-context-cordis 的 Cordis 集成

本页是 Runtime Context 的 Service 实现正文：具体子类与插件、配置、isolate 绑定、消费者类读取、生产者登记、按作用域过滤的唤醒、撤除顺序与持久化端口的缺席。它是组内「Service 实现、撤除与资源清理」这一主题的唯一拥有者（[组架构](../../docs/architecture.md#主题与唯一拥有者)）。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 7。

服务键、抽象类、intercept 配置、事件与登记协议归 [runtime-context-cordis-contract 的 Cordis 说明](../../runtime-context-cordis-contract/docs/cordis.md)，本插件继承这些定义，不重复提供键。供给机制归 [runtime-context](../../runtime-context/docs/architecture.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

现状：`src/cordis.ts` 导出 `createRuntimeContextPlugin`：插件 `inject` 键 `runtimeContextTrust`（由服务定义成员定义），键缺席时停在 PENDING，取出 `authority` 与 `bindings` 交给调用方给的构造函数。服务子类、生产工厂与配置尚未实现。`src/index.ts` 仍无导出。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有源码读数的标明「源码读数」。

## 插件与服务

`./cordis` 导出 `RuntimeContextService` 的具体子类与插件。本成员只提供一个键 `runtimeContext`。抽象类的构造函数以这个键登记服务，子类不写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)）。服务登记在装载它的那条插件 fiber 上，插件撤除时键上就没有服务了。

插件装载时调用 runtime-context 的工厂，交入配置与变化出口回调 `onChange`，得到一个机制实例。服务实例拥有这个机制实例。三面操作把调用转给机制实例，并在转发前后加上本页写的 Cordis 责任：

| 面 | 本插件加的责任 | 机制实例做的事 |
| --- | --- | --- |
| 生产者面 `registerProducer` | 在调用方 fiber 上登记效应；撤除时取消本代在途调用、在超时内等本代在途读取，只移除本代登记 | 生产者表、身份核对、新取代际、代际比较、旧代丢弃 |
| 持有者面 `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit` | 关闭后拒绝 | 按提交身份应用提交、资格签发与撤销、步提交写入 |
| 读者面 `bind` | 取调用方的 intercept 配置并核对消费者类，关闭后拒绝 | 读取资格、翻译、快照与变化 |

视图修订前进后，机制经变化出口调用本插件，本插件派发唤醒事件，见[按作用域过滤的唤醒](#按作用域过滤的唤醒)。

本成员不导出第二个服务键，不增补新事件，也不导入任何上层领域的契约（性质 7）。

## 配置

插件配置用 Standard Schema 校验（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。Service 子类用静态 `Config` 声明 Schema。

| 字段 | 含义 | 去向 |
| --- | --- | --- |
| 观察链保留上限 | 每个作用域保留多少变化。超过时最老的变化被丢弃，旧游标作废 | 传给 runtime-context 的工厂 |
| 来源调用与回调的超时 | 机制向来源重读、调用生产者回调时等多久。超时按未知结算。撤除与关闭在取消在途调用之后，也在这个超时内等待结算 | 传给 runtime-context 的工厂；撤除顺序也用它 |
| 诊断级别 | 旧代发布、监听者失败等诊断写到什么级别 | 本插件的诊断输出 |

默认值只是初值，字段名与默认值随实现确定。配置错误时插件加载失败，fiber 进入 `FAILED`，不提供任何服务（[plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)）。这条 basis 按函数插件核验。Service 子类静态 `Config` 的路径没有单独核验，所以「配置错误即 `FAILED`」对本插件还是假设，由本成员的测试补证。

## isolate 绑定

一个 isolate 标签下只装一份本插件（[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。同一标签下重复装载时，第二份在 `provide` 时失败，不静默覆盖（性质 1）。Cordis 4.0.4 的 `provide` 发现同一标签下已有登记时抛出 `service "…" has been registered`（源码读数：`reflect.ts` 的 `provide`）。本成员的测试要验证重复装载失败。

要两份实现并存，分到不同的 isolate 标签下，并由装配拥有者写明谁看见哪一份。isolate 只隔离服务实例的可见性，不隔离数据（[isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md)）。所以 isolate 不用于租户或作用域的分隔。租户、作用域与资格全部随操作参数进入（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 消费者类读取

`bind` 用 `this[Service.resolveConfig]()` 取调用方 fiber 的 intercept 配置（性质 2）：

1. 取不到配置时拒绝，不默认为任何一类。经 `ctx.get` 现取服务的调用方没有这份配置，所以会被拒绝。
2. 配置里的消费者类与读取资格里的消费者类不一致时拒绝。
3. 一致时把调用转给机制实例，机制实例再核读取资格的其余部分。

消费者类只决定「以哪一类来读」，不授予资格。这条核对是一致性检查，不计为访问控制。能读什么由作用域持有者签发、机制保管的资格决定，每次读取由机制核对资格的状态、租户与集合（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)、[RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。

## 生产者登记

`registerProducer` 按 [runtime-context-cordis-contract 的登记协议](../../runtime-context-cordis-contract/docs/cordis.md#登记与撤除协议)实现（性质 3、[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：

1. 在方法里用 `this.ctx.effect` 登记。`this.ctx` 是调用方的上下文，效应落在生产者插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
2. 把生产者身份与块声明交给机制实例。代际由机制新取，本插件不取 fiber `uid`。
3. 撤除函数先取消本代在途调用，再在配置的超时内等本代在途读取结算，然后请机制实例移除本代登记。本代已被同一身份的新一代替换时，机制不改动登记。这几步写在同一个撤除函数里，因为不同 effect 之间的释放是并发的（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。

生产者插件体重跑时，新 fiber 上的登记可能先于旧 fiber 的撤除函数运行。按第 3 步，旧撤除函数只移除旧一代，新一代的登记仍在。本成员的测试覆盖这种交错。

生产者插件卸载后，依赖该块的读取读到缺项，不读到旧值。

## 按作用域过滤的唤醒

本插件在装载时把变化出口回调 `onChange(scope, revision)` 交给 runtime-context 的工厂。某个作用域的视图修订每前进一次，机制同步调用它一次（[runtime-context 的变化出口](../../runtime-context/SPEC.md#变化出口)）。回调里本插件派发事件 `runtime-context-cordis-contract/changed`，载荷是作用域引用与视图修订，不带块键（性质 4）：

1. 派发走 `this.ctx.emit`。派发对象带 `Context.filter`。filter 读监听者 ctx 上属性键 `scope` 的作用域标记，只有标记等于本次作用域引用的监听者被调用。
2. 每次派发不建 fiber，不建 isolate（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。
3. 派发放在 `try` 中。监听者同步执行，不得返回 Promise。监听者抛出时只记录诊断，不改变已提交的结果（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。Cordis 4.0.4 的 `emit` 不捕获监听者的异常，排在抛出者后面的监听者这一轮不被调用（[emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md)）。所以一个坏监听者会让同一作用域的其他监听者错过这一次唤醒。唤醒丢失不影响正确性，下一次读取承接。

监听者标记作用域所用的属性键是 `scope`，由服务定义成员定义，见 [runtime-context-cordis-contract 的事件](../../runtime-context-cordis-contract/docs/cordis.md#事件)。过滤由派发方按监听者的标记完成。全局监听者不经过过滤，不得全局监听是约定；载荷不含块键或值，约定被违反时也不泄露内容。

回调里的派发抛错时，本插件只记录诊断，不让异常回到机制；机制也只记诊断，不回滚写入。

使当前值失效把当前值变为缺项，也前进视图修订，所以同样经变化出口到达本插件，不需要另一条唤醒路径。

## 撤除顺序

插件卸载时，本插件按下列顺序撤除（性质 6）：

1. 拒绝新的 `bind`、注册、登记与签发。
2. 使全部绑定读者结束。
3. 取消在途的来源调用与生产者回调。
4. 在配置的超时内等在途读取结算。结算后返回撤除前的值，被取消的调用按未知结算。
5. 关闭机制实例，释放表。

五步写在同一个 effect 里，不分成几个 effect 再指望它们按逆序完成（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。撤除开始后到达的读取返回拒绝。插件卸载时在途的生产者发布被丢弃，并记录诊断。

撤除不撤回已交给持有者的变化材料，也不撤回任何外部效果。生产者登记在生产者插件的 fiber 上。本插件撤除时，`inject` 了 `runtimeContext` 的生产者插件随之卸载或重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)），它们的效应与本插件的撤除并发运行。所以每个生产者的撤除函数要能在机制实例已关闭后安全返回。

## 持久化端口的缺席

本阶段没有耐久存储端口（性质 5）。持有者在服务之外保存注册与步提交。`persisted` 的供给块由生产者在重启后重新发布。服务重启后，在生产者重新发布之前，这些块读到缺项。本成员不把这写成失败，也不用旧值填充。

这和系统页一致：Runtime Context 不持有耐久状态，也没有存储端口，`persisted` 供给块由生产者在重启后重新发布（[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位)）。本成员因此不 `inject` 任何存储服务。

进程失败后本成员没有可恢复的东西。重建沿 [runtime-context SPEC](../../runtime-context/SPEC.md#所有权失败与生命周期) 的顺序：持有者按耐久顺序重放注册提交、交回 `checkpointed` 状态块的全值、重新签发资格，生产者重新登记。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 子类 `extends RuntimeContextService`，不写键，不自己 `ctx.provide` | 没有源码 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口不导出任何东西。独立路径从 runtime-context 取工厂 | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 重复装载在 `provide` 时失败 | 源码读数。测试随实现进入 |
| [IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12) 通知的失败处理 | `emit` 放在 `try` 中，监听者失败只记录诊断 | 机制有 basis。测试随实现进入 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | `registerProducer` 在调用方 fiber 上登记，撤除函数取消在途调用、限时等在途读取、只移除本代。不采用目录写法 | 效应归属有 basis。生产者卸载后撤除与新旧两代交错的测试随实现进入 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 静态 `Config` 用 Standard Schema，配置错误即 `FAILED`。超时是配置字段，默认值只是初值 | Service 子类路径没有 basis，测试随实现进入 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是参数。唤醒按作用域标记过滤，不建 fiber 或 isolate | 过滤是假设，见下一节 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 租户随读取资格进入。intercept 配置与 isolate 都不授予资格 | 没有源码 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证 | 五张表是进程内副本，重建靠持有者按耐久顺序重放与重新签发资格、生产者重新登记 | 写在 [runtime-context SPEC](../../runtime-context/SPEC.md#范围与依据) |

## 机制读数与假设

服务定义成员已用真实 Cordis 4.0.4 测试固定三条读数，见该定义成员的机制说明。共同 basis 登记仍待其拥有者完成；本提供者没有实现，自己的验证义务仍未兑现。下文未登记读数的假设范围保留。

本成员的性质 2、4 依赖还没有进入 basis 的机制读数，清单与 probe 要证明的内容见 [runtime-context-cordis-contract 的机制读数与假设](../../runtime-context-cordis-contract/docs/cordis.md#机制读数与假设)。读数补齐之前，这两条性质是假设，不是已核验的保证（[SPEC 组合与验证](../SPEC.md#组合与验证)）。性质 3 的代际由机制新取，不依赖 fiber `uid` 的读数。

本成员另有两项只有源码读数或缺少专门核验的机制：

| 机制 | 依据现状 | 影响的性质 |
| --- | --- | --- |
| 同一 isolate 标签下重复 `provide` 抛出 | 源码读数 | 性质 1 |
| Service 子类静态 `Config` 校验失败使 fiber `FAILED` | basis 只核验了函数插件 | 配置错误时的加载失败 |

## 验证义务

本成员的测试随实现进入 `tests/`，至少覆盖 SPEC [组合与验证](../SPEC.md#组合与验证)列出的八项：

1. 生产者插件卸载后，登记已撤除，依赖该块的读取读到缺项。
2. 生产者插件体重跑时新一代先登记、旧一代后撤除，新一代的登记仍在。
3. 两个消费者插件各自取到自己的 intercept 配置。
4. 作用域 A 的唤醒不到达作用域 B 的监听者，载荷不带块键。
5. 插件卸载时在途调用被取消，在途读取在超时内结算，关闭后读取被拒绝。
6. 来源调用或回调超时按未知结算。
7. 同一 isolate 标签下重复装载失败。
8. 配置错误时 fiber 进入 `FAILED`。

前四项在真实 Cordis 4.0.4 上运行，不用替身。本成员不覆盖持久化与跨进程一致性，也不覆盖真实消费者与生产者的端到端组合。定义入口自身的验证义务归 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/docs/cordis.md#验证义务)。
