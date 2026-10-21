# @omne-harness/session-cordis-contract 行为规格

状态：Cordis 定义成员，候选设计，尚未技术接受。本成员只拥有 Session 的 Cordis 定义：一个 Session 服务键、十个端口服务键、一种 intercept 配置和一个事件。领域行为归 [session-contract SPEC](../session-contract/SPEC.md)，本页不另写第二份保证。`./cordis` 的源码现在只有模板标记，没有运行实现。服务定义、依赖分类、事件与机制读数的正文归 [docs/cordis.md](docs/cordis.md)。

## 唯一性

本成员必须保持下列性质。

1. 服务键 `session` 只由抽象类 `SessionService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键，不再次 `ctx.provide` 这个键（[IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1)、[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。
2. `SessionService` 以四个属性暴露契约根入口的四个面：`work`、`management`、`reconciliation`、`history`。四个面挂在同一个键上，不为每个面另立服务键。同一组签名不写两份，类型取自 `session-contract`（[IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。
3. 七个构造依赖端口与三个出站端口各有一个服务键，每个键只由对应抽象类的 `static readonly provide` 给出。端口的接口归 `session-contract`；本成员只给键与抽象类。完整清单见 [docs/cordis.md 的端口服务键](docs/cordis.md#端口服务键)。只有事务端口进 `inject`，其余端口按调用现取。
4. intercept 配置类型是 `{ caller: SessionCallerClass }`，调用方类取 `intake`、`coordinator`、`maintainer`、`reader` 之一。调用方插件以对象形式 `inject: { session: { caller: '…' } }` 声明自己的调用方类，服务方法经 `this[Service.resolveConfig]()` 沿调用方 fiber 取得。调用方类是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。调用方类按操作授权：服务把它与该操作允许的调用方类核对，不在其中即拒绝；这条核对是一致性检查，不计为访问控制。访问边界仍是每个操作的调用资格，由 [session-contract SPEC](../session-contract/SPEC.md) 定义。
5. 事件只有一个：`session-cordis-contract/committed`。载荷是租户、会话身份、会话修订、原提交证据与本次提交的事件种类集合，不带消息正文、凭据或附件地址。它只是唤醒提示，不是事实源；丢失不影响正确性，权威扫描承接（[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。
6. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。租户与会话是操作参数，不用 isolate 或 Cordis Context 表达（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。`./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/session`、`@omne-harness/session-cordis`、`@omne-harness/session-adapters` 或 `@omne-harness/session-storage-sql`。

## 生命周期

Session 不提供运行实例目录，也不为会话建 fiber。服务提供者按显式租户与会话身份处理每个操作；通知不替代共同提交。

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务键与抽象类 | 本成员 | 随包 |
| 调用方类声明 | 调用方插件的 intercept 配置 | 随调用方 fiber |
| 端口的实现 | 提供该端口的插件（存储、适配或应用装配） | 插件卸载；事务端口缺席时 Session 服务停在 `PENDING`，其他端口缺席时只有需要它的操作返回 `unavailable` |
| 事件监听 | 监听者的 fiber（经 `ctx.on`） | 随监听者 fiber |
| 会话事实、修订、操作认回 | 不在本成员。归 [session-contract SPEC](../session-contract/SPEC.md) 与事务端口的提供者 | — |

撤除一个端口插件不撤销已经提交的业务事实。提交参加者的登记随插件生命周期，卸载即撤（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）；登记与撤除的精确协议归登记它的适配插件。

## 实现与验证

Service 实现与依赖注入归 [session-cordis](../session-cordis/README.md)，端口实现归 [session-adapters](../session-adapters/README.md) 与 [session-storage-sql](../session-storage-sql/README.md)。

| 承诺 | 位置 | 本成员怎样消费 |
| --- | --- | --- |
| 四个面的操作与结果 | [session-contract SPEC](../session-contract/SPEC.md) | 抽象类的四个属性取其类型 |
| 构造依赖端口与出站端口的接口 | [session-contract SPEC](../session-contract/SPEC.md) | 每个端口一个服务键 |
| 事件命名与增补位置 | [IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11) | 性质 5 |
| 靠同进程成立的保证 | [IC-19](../../../docs/architecture/cordis-integration-conventions.md#ic-19) | 每租户一个扫描者第一版靠装配单实例兑现，见 [docs/cordis.md](docs/cordis.md#靠装配兑现的保证) |

持续验证义务由实现者承担：根入口不加载绑定；定义入口不导入任何提供者；每个服务键唯一；两个声明不同调用方类的插件各自取到自己的 intercept 配置，调用方类不在操作允许的范围内时被拒绝；事务端口缺席时 Session 服务停在 `PENDING`，其他端口缺席只影响需要它的操作，可选的通知能力缺席不阻止提交；事件载荷不含正文。现有骨架测试不证明这些保证。机制读数与性质的对应见 [docs/cordis.md 的机制读数与假设](docs/cordis.md#机制读数与假设)。
