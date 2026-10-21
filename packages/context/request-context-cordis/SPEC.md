# @omne-harness/request-context-cordis 行为规格

状态：Service 实现成员，`draft`，没有运行实现。本成员把 [request-context](../request-context/SPEC.md) 的机制装进 [request-context-cordis-contract](../request-context-cordis-contract/SPEC.md) 定义的服务 `requestContext`，并承担贡献登记表、策略实现选择、配置校验失败、isolate 绑定与撤除。领域行为和机制行为都不在本页。

## 范围与依据

本成员从 `./cordis` 导出 `RequestContextService` 的具体子类与插件。根入口导出一个不依赖 Cordis 的工厂，输入契约端口、策略实现与配置，输出同一份实现（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。本成员不导出第二个服务键，不增补新事件。

配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。可调项：压缩策略的选择与它的参数、表示策略的选择与偏好顺序、修剪阈值、缓存容量。默认值只是初值。

## 结果与不变量

1. 一个 isolate 标签下只装一份本插件（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。重复装载不静默覆盖。假设：重复装载在 `provide` 时失败，这一点只有源码读数，未经 basis 核验。
2. 贡献登记表的寿命随贡献者 fiber：`contributeSection`、`contributeVariable` 在方法内 `this.ctx.effect` 登记；贡献者卸载时撤除函数移除登记并丢弃它的渲染结果（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）。作用域引用从调用方 fiber 的 intercept 配置取得：`scope: null` 登记到全局层；取不到配置即拒绝。
3. 同层同名登记拒绝。带逐请求变化变量的段拒绝。登记成功即发 `request-context-cordis-contract/changed`，载荷带作用域引用与新修订；派发放在 `try` 中，监听者失败只记录诊断（[IC-12](../../../docs/architecture/cordis-integration-conventions.md#ic-12)）。
4. 策略实现在插件加载时按配置选择。配置里指向不存在的策略、或策略参数不合 schema，插件加载失败，不静默回退到默认策略。假设：此时 fiber 进入 `FAILED`，Service 子类的这条路径未经 basis 核验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。
5. 撤除顺序：插件卸载时先拒绝新的登记与组装，再等在途组装结算，再丢弃登记表与缓存。撤除不撤回已交出的候选、计划或转换。本页的「组装」与「在途组装」都指经服务的 `assembly(scope)` 交出的操作组发起的组装（[request-context-cordis-contract 性质 2](../request-context-cordis-contract/SPEC.md#结果与不变量)）。
6. 本成员不为每次请求开 fiber，不用 `inject` 表达输入，不发第二种事件（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。租户、作用域与资格全部随操作参数进入（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 本成员不导入任何协调者或持有者的契约。

## 所有权、失败与生命周期

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务实例与机制实例 | 本插件的 fiber | 插件卸载 |
| 一条贡献的登记与渲染结果 | 贡献者插件的 fiber | 贡献者卸载、撤除函数、本插件卸载 |
| 策略实例 | 本插件 | 插件卸载 |
| 事件监听 | 监听者的 fiber | 监听者卸载 |

插件卸载时有在途组装：结算后返回撤除前的结果；关闭后到达的组装返回拒绝。进程失败：本成员没有可恢复的东西，重建沿贡献者重新登记。

## 组合与验证

| 承诺 | 位置 |
| --- | --- |
| 服务键、抽象类、intercept 配置、事件 | [request-context-cordis-contract](../request-context-cordis-contract/docs/cordis.md) |
| 机制、缓存、默认策略数值 | [request-context SPEC](../request-context/SPEC.md) |
| 机制读数 | [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md) 列的三条；补齐前性质 2、3 的 intercept 与过滤部分是假设 |

持续验证义务，随实现进入 `tests/`：贡献者卸载后登记与渲染结果都已撤除；同层重名拒绝；逐请求变量的段拒绝；变化事件带修订并按作用域到达；配置指向不存在的策略时 fiber `FAILED`；插件卸载时在途组装结算、关闭后组装拒绝；重复装载失败。

本成员不覆盖：持久化与跨进程一致性，以及真实贡献者、协调者与持有者的端到端组合。
