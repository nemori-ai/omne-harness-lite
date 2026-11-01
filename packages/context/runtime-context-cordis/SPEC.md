# @omne-harness/runtime-context-cordis 行为规格

状态：Service 实现成员，`draft`，已有运行实现。本成员把 [runtime-context](../runtime-context/SPEC.md) 的机制装进 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义的服务 `runtimeContext`，并承担 isolate 绑定、消费者类读取、按作用域过滤的唤醒、撤除与清理。领域行为和机制行为都不在本页。整套 `runtimeContextConformance` 在真实 Cordis 4.0.4 上经本成员的服务通过。

## 范围与依据

本成员从 `./cordis` 导出 `RuntimeContextService` 的具体子类 `RuntimeContextProvider` 与插件入口 `createRuntimeContextPlugin`，Cordis 绑定只在这里加上。根入口不导出任何东西（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。不装配 Cordis 的独立调用方直接从 [runtime-context](../runtime-context/SPEC.md) 取机制工厂，那时没有 intercept 配置，`bind` 不做调用方比较。本成员不导出第二个服务键，不增补新事件。

配置经静态 `Config` 的 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。字段是 runtime-context 的七个上限（`retention`、`replayCapacity`、`supplyBoundMs`、`settleBoundMs`、`readCacheEntries`、`refreshConcurrency`、`refreshRetryMs`）与诊断级别 `diagnostics`（`off`、`debug`、`info`、`warn`，初值 `debug`）。全部字段可省略，省略即取初值。初值只是配置初值。上限的判定调用 runtime-context 的 `resolveRuntimeContextConfig`，本成员不另写一份。未知字段、非数字的上限、非法上限或非法诊断级别使插件加载失败，fiber 进入 `FAILED`，不提供服务。本成员的测试在 Cordis 4.0.4 上验证了这一点。

## 结果与不变量

1. 一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。重复装载在 `provide` 时失败，第二份 fiber 进入 `FAILED`，第一份不受影响。第二份在构造机制之前失败，不建立第二个机制实例。
2. 经服务调用时，`bind` 用 `this[Service.resolveConfig]()` 取调用方的 intercept 配置，把其中的消费者类交给机制的 `bind`。机制在全部访问核对之后、建立读者之前比较它与资格的消费者类。不一致，或调用方没有声明，答拒绝（`callerMismatch`）。这条核对是一致性检查，不计为访问控制；访问边界是机制按读取资格做的核对。比较放在访问核对之后，所以不向无权的调用方披露资格是否存在。
3. `registerProducer` 在第一次 `await` 之前取得调用方的 `this.ctx`，把调用转给机制。机制答已登记之后，本成员在调用方 fiber 上用 `effect` 登记撤除函数。撤除函数调用句柄的 `dispose`，只撤除本代登记；本代已被新一代替换时不改动登记（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。代际由机制新取，不取 fiber `uid`。交给生产者的句柄的 `dispose` 运行同一个效应，所以显式撤除与之后的 fiber 卸载共用一次幂等撤除。
   调用方 fiber 在 `registerProducer` 等待期间已经卸载时，`effect` 无法登记。本成员立即撤除这次登记（句柄的 `dispose` 同步拒绝本代新操作，并在上界内结算），然后答拒收（`closed`），不抛出。该租户加块键的槽随即空出，别的生产者身份可以登记。
4. 唤醒走机制的变化出口：插件构造时把 `onChange(scope, revision)` 交给工厂，回调里派发事件。派发走插件自己的 `ctx.emit`，载荷是作用域引用与视图修订，不带块键。派发对象带 `Context.filter`，只到达在扩展 ctx 上以属性键 `scope` 标出该作用域引用、并在那里 `on` 的监听者。属性键 `scope` 由 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义。不建 fiber，不建 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。监听者抛出时异常回到机制的出口保护，机制记诊断，写入不回滚（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
5. 本阶段没有耐久存储端口。持有者在服务之外保存注册与步提交；`persisted` 的供给块由生产者重新发布。服务重启后，在生产者重新发布之前这些块读到缺项。本成员不把这写成失败，也不用旧值填充。将来有存储端口时，缺席行为保持同样含义。
6. 撤除：插件构造时登记一个效应，卸载时它调用机制的 `close()`。`close()` 在一个函数里按机制的五步执行：拒绝新请求、结束全部绑定读者、取消在途等待、在 `settleBoundMs` 内等全部在途操作结算、释放表。五步不拆成几个效应（[effect-disposal-concurrent-not-ordered](../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。撤除不撤回已交给持有者的变化材料，也不撤回任何外部效果。生产者的撤除函数在机制关闭之后运行时安全返回。
7. 本成员不导入任何上层领域的契约。租户、作用域、资格全部随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
8. 插件 `inject` 构造输入键 `runtimeContextTrust`（由 runtime-context-cordis-contract 定义），只取出 `authority` 与 `bindings` 交给工厂；键缺席时插件停在 PENDING，不从插件配置取信任对象。子树可见性是装配位置，不是封装保证。
9. 机制实例只存在于构造函数的闭包里。Cordis 交给调用方的是扩展后的实例，`#private` 字段经它会失败，而普通字段会把机制暴露在 `bind` 的比较之外。
10. `createRuntimeContextPlugin(options?)` 不带参数时返回 `RuntimeContextProvider` 本身。`options.mechanism` 替换机制工厂，只供测试使用。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与机制实例 | 本插件的 fiber | 插件卸载，效应调用 `close()` |
| 生产者登记 | 生产者插件的 fiber | 生产者卸载、`dispose`、或本插件卸载 |
| 绑定读者 | 建立它的消费者插件 | 资格撤销、消费者卸载、本插件卸载 |
| 唤醒监听 | 监听者的 fiber | 监听者卸载 |

插件卸载时有在途操作：在途的等待被取消，在途操作答关闭或结算为未知、缺项，不答成功。卸载之后到达的调用答关闭（见契约的[读取结果](../runtime-context-contract/SPEC.md#读取结果)）。插件卸载时有在途的生产者发布：发布答拒收（`closed`）。

提供者换代与进程失败：`runtimeContextTrust` 的提供者换代，或本插件重新运行，都会建立一个新的机制实例。新实例的全部作用域围栏关闭，等同于进程重建。持有者按契约 [RC-09](../runtime-context-contract/SPEC.md#rc-09-作用域结束恢复会话与恢复后供值) 用恢复会话恢复每个作用域并重新签发资格，生产者重新登记（[runtime-context SPEC](../runtime-context/SPEC.md#所有权失败与生命周期)）。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、intercept 配置、事件 | [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md) |
| 机制行为 | [runtime-context SPEC](../runtime-context/SPEC.md) |
| 三条机制读数 | [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md)；定义成员已用真实 Cordis 4.0.4 测试固定，尚未登记为共同 basis 保证。性质 3 的代际不依赖 fiber `uid`，新旧两代的交错由本成员的测试覆盖 |

持续验证义务，均在 `tests/`，在真实 Cordis 4.0.4 上运行，不用替身：

| 场景 | 测试 |
| --- | --- |
| 整套 `runtimeContextConformance` 经服务通过；`bind` 经声明资格消费者类的 intercept 上下文调用 | [conformance.spec.ts](tests/conformance.spec.ts) |
| 信任键缺席时 PENDING；只交出两个原端口；信任提供者卸载后回到 PENDING，重新提供时建立新机制 | [trust-inject.spec.ts](tests/trust-inject.spec.ts) |
| 配置错误时 fiber `FAILED`；重复装载失败；生产者卸载后读到缺项；插件体重跑时旧撤除不删新一代；调用方在登记中卸载时撤除并答 `closed`；显式撤除与卸载共用一次撤除；唤醒只到达同一作用域且不带块键；监听者抛出不撤回发布；intercept 不一致或缺席时 `bind` 答 `callerMismatch`；卸载时在途读取结算、之后答关闭；关闭后生产者撤除安全返回 | [lifecycle.spec.ts](tests/lifecycle.spec.ts) |
| `./cordis` 的导出集合与根入口为空 | [cordis-entry.spec.ts](tests/cordis-entry.spec.ts)、[public-entry.spec.ts](tests/public-entry.spec.ts) |

本成员不覆盖：持久化与跨进程一致性，以及真实消费者与生产者的端到端组合。
