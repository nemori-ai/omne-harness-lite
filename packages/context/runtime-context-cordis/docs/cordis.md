# runtime-context-cordis 的 Cordis 集成

本页是 Runtime Context 的 Service 实现正文：具体子类与插件、配置、isolate 绑定、消费者类读取、生产者登记、按作用域过滤的唤醒、撤除顺序与持久化端口的缺席。它是组内「Service 实现、撤除与资源清理」这一主题的唯一拥有者（[组架构](../../docs/architecture.md#主题与唯一拥有者)）。性质编号指本成员 [SPEC](../SPEC.md#结果与不变量) 的性质 1 至 10。

服务键、抽象类、intercept 配置、事件与登记协议归 [runtime-context-cordis-contract 的 Cordis 说明](../../runtime-context-cordis-contract/docs/cordis.md)，本插件继承这些定义，不重复提供键。供给机制归 [runtime-context](../../runtime-context/docs/architecture.md)。共同集成规则归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

现状：`src/cordis.ts` 导出具体子类 `RuntimeContextProvider` 与插件入口 `createRuntimeContextPlugin`。子类 `inject` 键 `runtimeContextTrust`，键缺席时停在 PENDING，取出 `authority` 与 `bindings` 交给 runtime-context 的工厂 `createRuntimeContext`。`src/index.ts` 无导出。机制事实按已采用的 Cordis 4.0.4 核对。有 basis 条目的写条目链接，只有本成员测试的写测试。

## 插件与服务

`./cordis` 导出 `RuntimeContextService` 的具体子类与插件入口。本成员只提供一个键 `runtimeContext`。抽象类的构造函数以这个键登记服务，子类不写键（[IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2)、[service-subclass-provides-its-key](../../../../.meta_harness/design/basis/cordis/service-subclass-provides-its-key.md)）。服务登记在装载它的那条插件 fiber 上，插件撤除时键上就没有服务了。

插件构造时调用工厂，交入两个原端口、配置里的上限、变化出口回调与诊断出口，得到一个机制实例。机制实例只存在于构造函数的闭包里（性质 9）。八个操作把调用转给机制实例，并加上本页写的 Cordis 责任：

| 面 | 本插件加的责任 | 机制实例做的事 |
| --- | --- | --- |
| 生产者面 `registerProducer` | 在第一次 `await` 之前取调用方上下文；机制答已登记之后在调用方 fiber 上登记效应；调用方已卸载时立即撤除并答拒收（`closed`） | 生产者表、身份核对、新取代际、代际比较、旧代拒收 |
| 持有者面 `prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`、`beginReplay`、`finishReplay` | 直接转发。关闭后的结果由机制给出 | 提交应用、资格签发与撤销、步提交写入、恢复会话 |
| 读者面 `bind` | 取调用方的 intercept 配置，把消费者类交给机制比较 | 访问核对之后比较消费者类，读取资格、翻译、快照与变化 |

视图修订前进后，机制经变化出口调用本插件，本插件派发唤醒事件，见[按作用域过滤的唤醒](#按作用域过滤的唤醒)。

本成员不导出第二个服务键，不增补新事件，也不导入任何上层领域的契约（性质 7）。

## 配置

插件配置用 Standard Schema 校验（[IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。Service 子类用静态 `Config` 声明 Schema。全部字段可省略，省略即取初值。初值只是配置初值，由装配给出实际值。

| 字段 | 含义 | 初值 | 去向 |
| --- | --- | --- | --- |
| `retention` | 游标最多落后多少个视图修订 | 64 | 机制工厂 |
| `replayCapacity` | 一份恢复材料的条目上限 | 10000 | 机制工厂 |
| `supplyBoundMs` | 一次来源调用或供值回调的等待上界 | 30000 | 机制工厂 |
| `settleBoundMs` | 撤销登记与关闭等待在途操作结算的上界 | 1000 | 机制工厂；撤除也用它 |
| `readCacheEntries` | 读取缓存的条目上限，0 表示不缓存 | 256 | 机制工厂 |
| `refreshConcurrency` | 恢复后供值同时在途的来源调用上限 | 16 | 机制工厂 |
| `refreshRetryMs` | 恢复后供值失败之后不再调用来源的间隔 | 0 | 机制工厂 |
| `diagnostics` | 机制诊断写到 `ctx.logger('runtime-context')` 的哪个级别：`off`、`debug`、`info`、`warn` | `debug` | 本插件的诊断输出 |

上限的合法值由 runtime-context 的 `resolveRuntimeContextConfig` 判定，Schema 调用它。未知字段被拒绝，所以拼错的字段不会静默取初值。配置错误时插件加载失败，fiber 进入 `FAILED`，不提供任何服务（[plugin-throw-fails-fiber](../../../../.meta_harness/design/basis/cordis/plugin-throw-fails-fiber.md)）。这条 basis 按函数插件核验。Service 子类静态 `Config` 的路径由本成员的 [lifecycle.spec.ts](../tests/lifecycle.spec.ts) 在 Cordis 4.0.4 上验证：校验失败使 `ctx.plugin` 拒绝，fiber 状态为 `FAILED`，键上没有服务。

## isolate 绑定

一个 isolate 标签下只装一份本插件（[IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。同一标签下重复装载时，第二份在 `provide` 时失败，不静默覆盖（性质 1）。Cordis 4.0.4 的 `provide` 发现同一标签下已有登记时抛出 `service "…" has been registered`。本成员的测试验证：第二份 fiber 进入 `FAILED`，第一份的机制照常应答。抛出发生在父类构造函数里，所以第二份不建立机制实例。

要两份实现并存，分到不同的 isolate 标签下，并由装配拥有者写明谁看见哪一份。isolate 只隔离服务实例的可见性，不隔离数据（[isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md)）。所以 isolate 不用于租户或作用域的分隔。租户、作用域与资格全部随操作参数进入（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 消费者类读取

`bind` 用 `this[Service.resolveConfig]()` 取调用方的 intercept 配置（性质 2），把消费者类交给机制：

1. 机制先完成全部访问核对：资格状态、权威端口、可信绑定与作用域状态。任一项不成立时答无权、未知或关闭，与调用方声明无关。
2. 访问核对通过之后，声明的类与资格的类不一致，或调用方没有声明，答拒绝（`callerMismatch`）。经 `ctx.get` 现取服务、没有 intercept 配置的调用方因此被拒绝。
3. 一致时建立绑定读者。

消费者类只决定「以哪一类来读」，不授予资格。这条核对是一致性检查，不计为访问控制。能读什么由作用域持有者签发、机制保管的资格决定，每次读取由机制核对资格的状态、租户与集合（[IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18)、[RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)）。比较放在访问核对之后，所以无权的调用方得不到资格是否存在的线索。

## 生产者登记

`registerProducer` 按 [runtime-context-cordis-contract 的登记协议](../../runtime-context-cordis-contract/docs/cordis.md#登记与撤除协议)实现（性质 3、[IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：

1. 在第一次 `await` 之前取 `this.ctx`。`this.ctx` 是调用方的上下文，效应落在生产者插件的 fiber 上（[service-method-ctx-is-caller](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)）。
2. 把生产者身份与块声明交给机制实例。代际由机制新取，本插件不取 fiber `uid`。
3. 机制答已登记之后，在调用方上下文上登记效应。撤除函数调用机制句柄的 `dispose`：立即拒绝本代新操作，在 `settleBoundMs` 内等本代在途的供值调用结算，然后只撤除本代登记。本代已被同一身份的新一代替换时，机制不改动登记。交给生产者的句柄的 `dispose` 运行同一个效应。
4. 调用方 fiber 在第 2 步的等待期间已经卸载时，第 3 步的 `effect` 抛出（Cordis 4.0.4 对已卸载或正在卸载的 fiber 抛 `INACTIVE_EFFECT`，[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。本插件捕获它，立即撤除这次登记，答拒收（`closed`）。槽随即空出。

生产者插件体重跑时，新 fiber 上的登记可能先于旧 fiber 的撤除函数运行。按第 3 步，旧撤除函数只撤除旧一代，新一代的登记仍在。本成员的测试覆盖这种交错。

生产者插件卸载后，依赖该块的读取读到缺项（`producer-withdrawn`），不读到旧值。

## 按作用域过滤的唤醒

本插件在构造时把变化出口回调 `onChange(scope, revision)` 交给 runtime-context 的工厂。某个作用域的视图修订每前进一次，机制同步调用它一次（[runtime-context 的变化出口](../../runtime-context/SPEC.md#变化出口)）。回调里本插件派发事件 `runtime-context-cordis-contract/changed`，载荷是作用域引用与视图修订，不带块键（性质 4）：

1. 派发走插件自己的 `ctx.emit`。派发对象带 `Context.filter`。filter 读监听者 ctx 上属性键 `scope` 的作用域标记，只有标记等于本次作用域引用的监听者被调用。
2. 每次派发不建 fiber，不建 isolate（[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。
3. 监听者同步执行，不得返回 Promise。Cordis 4.0.4 的 `emit` 不捕获监听者的异常，排在抛出者后面的监听者这一轮不被调用（[emit-listener-throw-propagates](../../../../.meta_harness/design/basis/cordis/emit-listener-throw-propagates.md)）。异常回到机制的出口保护，机制记诊断（`change-outlet-failed`），写入不回滚（[IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。所以一个坏监听者会让同一作用域的其他监听者错过这一次唤醒。唤醒丢失不影响正确性，下一次读取承接。

监听者标记作用域所用的属性键是 `scope`，由服务定义成员定义，见 [runtime-context-cordis-contract 的事件](../../runtime-context-cordis-contract/docs/cordis.md#事件)。过滤由派发方按监听者的标记完成。全局监听者不经过过滤，不得全局监听是约定；载荷不含块键或值，约定被违反时也不泄露内容。

使当前值失效把当前值变为缺项，也前进视图修订，所以同样经变化出口到达本插件，不需要另一条唤醒路径。

## 撤除顺序

插件构造时登记一个效应。插件卸载时它调用机制的 `close()`，`close()` 按下列顺序执行（性质 6）：

1. 拒绝新请求：此后每个入口答关闭。
2. 使全部绑定读者结束。
3. 取消在途的等待：等权威端口、可信绑定来源或供值回调的操作立即结束等待。
4. 在 `settleBoundMs` 内等全部在途操作结算，包括持有者面、生产者面与读者面。在途操作答关闭或结算为未知、缺项，不答成功。
5. 释放全部表与读取缓存。

五步在机制的一个函数里，本插件只登记一个效应，不分成几个效应再指望它们按逆序完成（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。插件卸载时在途的生产者发布答拒收（`closed`）。

撤除不撤回已交给持有者的变化材料，也不撤回任何外部效果。生产者登记在生产者插件的 fiber 上。本插件撤除时，`inject` 了 `runtimeContext` 的生产者插件随之卸载或重跑（[plugin-body-reruns-on-provider-change](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)），它们的效应与本插件的撤除并发运行。机制已关闭时句柄的 `dispose` 立即返回，所以这些撤除函数安全返回。

## 持久化端口的缺席

本阶段没有耐久存储端口（性质 5）。持有者在服务之外保存注册与步提交。`persisted` 的供给块由生产者在重启后重新发布。服务重启后，在生产者重新发布之前，这些块读到缺项。本成员不把这写成失败，也不用旧值填充。

这和系统页一致：Runtime Context 不持有耐久状态，也没有存储端口，`persisted` 供给块由生产者在重启后重新发布（[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md#成员与-cordis-落位)）。本成员因此不 `inject` 任何存储服务。

进程失败、信任提供者换代或本插件重新运行时，新的机制实例从空开始，全部作用域围栏关闭。持有者按 [runtime-context SPEC](../../runtime-context/SPEC.md#所有权失败与生命周期) 的顺序用恢复会话恢复每个作用域并重新签发资格，生产者重新登记。

## IC 符合性映射

| 规则 | 本成员怎样符合 | 现在的证据 |
| --- | --- | --- |
| [IC-2](../../../../docs/architecture/cordis-integration-conventions.md#ic-2) 服务键只写一次 | 子类 `extends RuntimeContextService`，不写键，不自己 `ctx.provide` | [conformance.spec.ts](../tests/conformance.spec.ts) 经键 `runtimeContext` 取得服务并跑整套契约；[cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 核对子类继承抽象类 |
| [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 根入口与 Cordis 无关 | 根入口不导出任何东西。独立路径从 runtime-context 取工厂 | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出 |
| [IC-6](../../../../docs/architecture/cordis-integration-conventions.md#ic-6) 一个 isolate 标签一个提供者 | 重复装载在 `provide` 时失败 | [lifecycle.spec.ts](../tests/lifecycle.spec.ts)「a second provider under the same isolate label fails」 |
| [IC-12](../../../../docs/architecture/cordis-integration-conventions.md#ic-12) 通知的失败处理 | 监听者抛出回到机制的出口保护，只记诊断 | 机制有 basis；[lifecycle.spec.ts](../tests/lifecycle.spec.ts)「a listener that throws does not undo the publication」 |
| [IC-13](../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 登记即效应 | `registerProducer` 在调用方 fiber 上登记，撤除只移除本代；调用方已卸载时撤除并答 `closed` | 效应归属有 basis；[lifecycle.spec.ts](../tests/lifecycle.spec.ts) 的生产者卸载、新旧两代交错与调用方在登记中卸载三条用例 |
| [IC-14](../../../../docs/architecture/cordis-integration-conventions.md#ic-14) 配置校验 | 静态 `Config` 用 Standard Schema，配置错误即 `FAILED`。上限是配置字段，初值只是初值 | [lifecycle.spec.ts](../tests/lifecycle.spec.ts)「a configuration error fails the fiber」 |
| [IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17) 作用域不是 Context 或 isolate | 作用域是参数。唤醒按作用域标记过滤，不建 fiber 或 isolate | [lifecycle.spec.ts](../tests/lifecycle.spec.ts)「a wake-up reaches only listeners of the same scope」 |
| [IC-18](../../../../docs/architecture/cordis-integration-conventions.md#ic-18) 租户是参数 | 租户随读取资格进入。intercept 配置与 isolate 都不授予资格 | [conformance.spec.ts](../tests/conformance.spec.ts) 的跨租户与权威组义务经服务通过 |
| [IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19) 同进程保证 | 全部表是进程内副本，重建靠持有者的恢复会话与重新签发资格、生产者重新登记 | 写在 [runtime-context SPEC](../../runtime-context/SPEC.md#范围与依据) |

## 机制读数与假设

服务定义成员已用真实 Cordis 4.0.4 测试固定三条读数，见该定义成员的机制说明。共同 basis 登记仍待其拥有者完成。本成员的性质 2、4 依赖这些读数，本成员的 [lifecycle.spec.ts](../tests/lifecycle.spec.ts) 与 [conformance.spec.ts](../tests/conformance.spec.ts) 在同一版本上覆盖了它们的使用方式。性质 3 的代际由机制新取，不依赖 fiber `uid` 的读数。

本成员另有两项此前只有源码读数的机制，现在由本成员的测试在 Cordis 4.0.4 上验证，尚未登记为共同 basis：

| 机制 | 依据现状 | 影响的性质 |
| --- | --- | --- |
| 同一 isolate 标签下重复 `provide` 抛出 | 本成员测试 | 性质 1 |
| Service 子类静态 `Config` 校验失败使 fiber `FAILED` | 本成员测试；basis 只核验了函数插件 | 配置错误时的加载失败 |

## 验证义务

本成员的测试在 `tests/`，覆盖 SPEC [组合与验证](../SPEC.md#组合与验证)列出的场景。全部在真实 Cordis 4.0.4 上运行，不用替身：

1. 整套 `runtimeContextConformance` 经服务通过。
2. 生产者插件卸载后，登记已撤除，依赖该块的读取读到缺项。
3. 生产者插件体重跑时新一代先登记、旧一代后撤除，新一代的登记仍在。
4. 调用方 fiber 在登记等待期间卸载时，登记被撤除，结果是拒收（`closed`），槽空出。
5. intercept 声明另一类或没有声明时 `bind` 答 `callerMismatch`，声明一致时建立读者。
6. 作用域 A 的唤醒不到达作用域 B 的监听者，载荷不带块键。
7. 插件卸载时在途读取在上界内结算，之后的读取答关闭。
8. 同一 isolate 标签下重复装载失败。
9. 配置错误时 fiber 进入 `FAILED`。

本成员不覆盖持久化与跨进程一致性，也不覆盖真实消费者与生产者的端到端组合。定义入口自身的验证义务归 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/docs/cordis.md#验证义务)。
