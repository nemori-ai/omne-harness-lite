# @omne-harness/runtime-context-cordis 行为规格

状态：Service 实现成员，`draft`，没有运行实现。本成员把 [runtime-context](../runtime-context/SPEC.md) 的机制装进 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义的服务 `runtimeContext`，并承担 isolate 绑定、消费者类读取、按作用域过滤的唤醒、撤除与清理。领域行为和机制行为都不在本页。

## 范围与依据

本成员从 `./cordis` 导出 `RuntimeContextService` 的具体子类与插件，Cordis 绑定只在这里加上。根入口不另写工厂，只重导出 [runtime-context](../runtime-context/SPEC.md) 的机制工厂，不依赖 Cordis（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。经根入口使用时没有 intercept 配置，`bind` 的消费者类取自读取资格。本成员不导出第二个服务键，不增补新事件。

配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。可调项是观察链保留上限与诊断级别。默认值只是初值。配置错误时插件加载失败。假设：此时 fiber 进入 `FAILED`，Service 子类的这条路径未经 basis 核验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。

## 结果与不变量

1. 一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。重复装载不静默覆盖。假设：重复装载在 `provide` 时失败，这一点只有源码读数，未经 basis 核验。
2. 经服务调用时，`bind` 从调用方 fiber 的 intercept 配置取消费者类，与读取资格核对。取不到配置即拒绝，不默认为任何一类。经根入口的机制工厂使用时没有 intercept 配置，消费者类取自读取资格。
3. `registerProducer` 在方法内 `this.ctx.effect` 登记，代际取登记时的 fiber `uid`。生产者 fiber 卸载时撤除函数等本代在途读取结算后再移除登记（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。
4. 唤醒走 `this.ctx.emit`，派发对象带 `Context.filter`，只到达在扩展 ctx 上以属性键 `scope` 标出该作用域引用、并在那里 `on` 的监听者。属性键 `scope` 由 [runtime-context-cordis-contract](../runtime-context-cordis-contract/SPEC.md) 定义。不建 fiber，不建 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。监听者同步执行，不返回 Promise；派发放在 `try` 中，监听者失败只记录诊断（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
5. 本阶段没有耐久存储端口。持有者在服务之外保存注册与步提交；`persisted` 的供给块由生产者重新发布。服务重启后，在生产者重新发布之前这些块读到缺项。本成员不把这写成失败，也不用旧值填充。将来有存储端口时，缺席行为保持同样含义：端口不在场即按缺项处理，不让服务加载失败。
6. 撤除顺序：插件卸载时先拒绝新的 `bind`、注册与登记，再使全部绑定读者结束，等在途读取结算，最后关闭机制实例并释放表。撤除不撤回已交给持有者的变化材料，也不撤回任何外部效果。
7. 本成员不导入任何上层领域的契约。租户、作用域、资格全部随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与机制实例 | 本插件的 fiber | 插件卸载 |
| 生产者登记 | 生产者插件的 fiber | 生产者卸载、`dispose`、或本插件卸载 |
| 绑定读者 | 建立它的消费者插件 | 资格撤销、消费者卸载、本插件卸载 |
| 唤醒监听 | 监听者的 fiber | 监听者卸载 |

插件卸载时有在途读取：读取在结算前不被打断，结算后返回撤除前的值；关闭后到达的读取返回拒绝（服务已关闭，见契约的[读取结果](../runtime-context-contract/SPEC.md#读取结果)）。插件卸载时有在途的生产者发布：发布被丢弃并记录诊断。

进程失败：本成员没有可恢复的东西。重建沿 [runtime-context SPEC](../runtime-context/SPEC.md) 的顺序。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、intercept 配置、事件 | [runtime-context-cordis-contract](../runtime-context-cordis-contract/docs/cordis.md) |
| 机制行为 | [runtime-context SPEC](../runtime-context/SPEC.md) |
| 三条机制读数 | [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md)；补齐前性质 2、3、4 是假设 |

持续验证义务，随实现进入 `tests/`：生产者插件卸载后登记已撤除且依赖该块的读取读到缺项；两个消费者插件各自取到自己的 intercept 配置；作用域 A 的唤醒不到达作用域 B 的监听者；插件卸载时在途读取结算、关闭后读取拒绝；重复装载失败；配置错误时 fiber `FAILED`。

本成员不覆盖：持久化与跨进程一致性，以及真实消费者与生产者的端到端组合。
