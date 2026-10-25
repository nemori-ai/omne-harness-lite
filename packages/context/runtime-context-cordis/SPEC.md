# @omne-harness/runtime-context-cordis 行为规格

状态：Service 实现成员，`draft`，没有运行实现。本成员把 [runtime-context](../runtime-context/SPEC.md) 的机制装进 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义的服务 `runtimeContext`，并承担 isolate 绑定、消费者类读取、按作用域过滤的唤醒、撤除与清理。领域行为和机制行为都不在本页。本页沿用 [runtime-context](../runtime-context/SPEC.md) 的本地设计；契约新增的持有者面 `beginReplay` 与 `finishReplay`、调用方主体参数，以及两个权威端口由装配入口交给 Service 实现（[runtime-context-cordis-contract 性质 9](../runtime-context-cordis-contract/SPEC.md#结果与不变量)），随机制成员的重新设计一起进入本页，见 runtime-context 的[明确缺项](../runtime-context/SPEC.md#明确缺项)。

## 范围与依据

本成员从 `./cordis` 导出 `RuntimeContextService` 的具体子类与插件，Cordis 绑定只在这里加上。根入口不导出任何东西（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4) 的空根入口）。不装配 Cordis 的独立调用方直接从 [runtime-context](../runtime-context/SPEC.md) 取机制工厂，那时没有 intercept 配置，`bind` 的消费者类取自读取资格。本成员不导出第二个服务键，不增补新事件。

配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。可调项是观察链保留上限、来源调用与生产者回调的超时、诊断级别。默认值只是初值。配置错误时插件加载失败。假设：此时 fiber 进入 `FAILED`，Service 子类的这条路径未经 basis 核验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。

## 结果与不变量

1. 一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。重复装载不静默覆盖。假设：重复装载在 `provide` 时失败，这一点只有源码读数，未经 basis 核验。
2. 经服务调用时，`bind` 从调用方 fiber 的 intercept 配置取消费者类，与读取资格核对。取不到配置即拒绝，不默认为任何一类。这条核对是一致性检查，不计为访问控制；访问边界是机制按读取资格做的核对。
3. `registerProducer` 在方法内 `this.ctx.effect` 登记，把生产者身份与块声明交给机制，代际由机制新取，不取 fiber `uid`。撤除函数先取消本代在途调用，再在配置的超时内等本代在途读取结算，然后只移除本代登记；本代已被新一代替换时不改动登记（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
4. 唤醒走机制的变化出口：插件装载时把 `onChange(scope, revision)` 交给工厂，回调里派发事件。派发走 `this.ctx.emit`，载荷是作用域引用与视图修订，不带块键。派发对象带 `Context.filter`，只到达在扩展 ctx 上以属性键 `scope` 标出该作用域引用、并在那里 `on` 的监听者。属性键 `scope` 由 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义。不建 fiber，不建 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。监听者同步执行，不返回 Promise；派发放在 `try` 中，监听者失败只记录诊断（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
5. 本阶段没有耐久存储端口。持有者在服务之外保存注册与步提交；`persisted` 的供给块由生产者重新发布。服务重启后，在生产者重新发布之前这些块读到缺项。本成员不把这写成失败，也不用旧值填充。将来有存储端口时，缺席行为保持同样含义：端口不在场即按缺项处理，不让服务加载失败。
6. 撤除顺序：插件卸载时先拒绝新的 `bind`、注册、登记与签发，再使全部绑定读者结束，取消在途的来源调用与生产者回调，在配置的超时内等在途读取结算，最后关闭机制实例并释放表。撤除不撤回已交给持有者的变化材料，也不撤回任何外部效果。
7. 本成员不导入任何上层领域的契约。租户、作用域、资格全部随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与机制实例 | 本插件的 fiber | 插件卸载 |
| 生产者登记 | 生产者插件的 fiber | 生产者卸载、`dispose`、或本插件卸载 |
| 绑定读者 | 建立它的消费者插件 | 资格撤销、消费者卸载、本插件卸载 |
| 唤醒监听 | 监听者的 fiber | 监听者卸载 |

插件卸载时有在途读取：在途的来源调用与回调先被取消，读取在超时内结算，结算后返回撤除前的值，被取消的调用按未知结算；关闭后到达的读取返回拒绝（服务已关闭，见契约的[读取结果](../runtime-context-contract/SPEC.md#读取结果)）。插件卸载时有在途的生产者发布：发布被丢弃并记录诊断。

进程失败：本成员没有可恢复的东西。重建沿 [runtime-context SPEC](../runtime-context/SPEC.md#所有权失败与生命周期) 的顺序：持有者按耐久顺序重放并重新签发资格，生产者重新登记。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、intercept 配置、事件 | [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md) |
| 机制行为 | [runtime-context SPEC](../runtime-context/SPEC.md) |
| 三条机制读数 | [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md)；定义成员已用真实 Cordis 4.0.4 测试固定，尚未登记为共同 basis 保证。性质 3 的代际不依赖 fiber `uid`，新旧两代的交错由本成员的测试覆盖 |

持续验证义务，随实现进入 `tests/`：生产者插件卸载后登记已撤除且依赖该块的读取读到缺项；生产者插件体重跑时新一代先登记、旧一代后撤除，新一代的登记仍在；两个消费者插件各自取到自己的 intercept 配置；作用域 A 的唤醒不到达作用域 B 的监听者，载荷不带块键；插件卸载时在途调用被取消、在途读取在超时内结算、关闭后读取拒绝；来源调用或回调超时按未知结算；重复装载失败；配置错误时 fiber `FAILED`。

本成员不覆盖：持久化与跨进程一致性，以及真实消费者与生产者的端到端组合。
