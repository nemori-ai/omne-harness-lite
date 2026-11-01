# @omne-harness/session-cordis-contract 行为规格

状态：Cordis 定义成员，候选设计，尚未技术接受。本成员只拥有 Session 的 Cordis 定义：一个 Session 服务键、十一个依赖服务键（八个构造依赖端口、两个出站端口与内部主体）、三个受信服务键、一种 intercept 配置和一个事件。领域行为归 [session-contract SPEC](../session-contract/SPEC.md)，本页不另写第二份保证。访问检查定义的源码支持与其余服务键分别核验；声明装配要求不表示提供者已交付。提供者实现不在本成员。服务定义、依赖分类、事件与机制读数的正文归 [docs/cordis.md](docs/cordis.md)。

## 唯一性

本成员必须保持下列性质。

1. 服务键 `session` 只由抽象类 `SessionService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键，不再次 `ctx.provide` 这个键（[IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1)、[IC-2](../../../docs/architecture/cordis-integration-conventions.md#ic-2)）。
2. `SessionService` 以四个属性暴露契约根入口的四个面：`work`、`management`、`reconciliation`、`history`。四个面挂在同一个键上，不为每个面另立服务键。同一组签名不写两份，类型取自 `session-contract`（[IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)）。
3. 八个构造依赖端口、两个出站端口与内部主体 `SessionInternalPrincipals` 各有一个服务键，每个键只由对应抽象类的 `static readonly provide` 给出。端口的接口归 `session-contract`；本成员只给键与抽象类。完整清单见 [docs/cordis.md 的端口服务键](docs/cordis.md#端口服务键)。访问检查端口与内部主体进 Session 服务提供者的 `inject`。公开事务端口 `sessionTransactions` 供直接调用者与符合性套件；Session 服务提供者只为 `pending`、`references` 与 `releasedScopes` 按调用现取它。其余端口按调用现取。
4. intercept 配置类型是 `{ caller: SessionCallerClass }`，调用方类取 `intake`、`coordinator`、`maintainer`、`reader` 之一。调用方插件以对象形式 `inject: { session: { caller: '…' } }` 声明自己的调用方类，服务方法经 `this[Service.resolveConfig]()` 沿调用方 fiber 取得。调用方类是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。调用方类按操作授权：服务把它与该操作允许的调用方类核对，不在其中即拒绝；这条核对是一致性检查，不计为访问控制。访问边界仍是每个操作的调用资格，由 [session-contract SPEC](../session-contract/SPEC.md) 定义。
5. 事件只有一个：`session-cordis-contract/committed`。载荷是租户、会话身份、会话修订、原提交证据与本次提交的事件种类集合，不带消息正文、凭据或附件地址。它只是唤醒提示，不是事实源；丢失不影响正确性，权威扫描承接（[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)）。
6. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。租户与会话是操作参数，不用 isolate 或 Cordis Context 表达（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)、[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
7. 根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。`./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/session`、`@omne-harness/session-cordis`、`@omne-harness/session-adapters` 或 `@omne-harness/session-storage-sql`。
8. 三个受信服务键各由对应抽象类的 `static readonly provide` 给出，只在装配的受信子树内可见，根上的插件按名取得时得到 `undefined`（[受信服务键](docs/cordis.md#受信服务键)）：
   - `sessionDelegatedTransactions`（`SessionDelegatedTransactionsService`，接口 `SessionDelegatedTransactions`）：一次面操作已核验后的委派入口。会话存储组合提供，Session 服务提供者 `inject`。
   - `sessionWorkPrincipals`（`SessionWorkPrincipalsService`，接口 `SessionWorkPrincipals`）：按会话签发协调器与维护者主体。装配入口提供，Session 服务提供者 `inject`。
   - `sessionPrincipalBindings`（`SessionPrincipalBindingsService`，接口 `SessionPrincipalBindingSource`）：会话归属读口。会话存储组合提供，只由装配入口按调用读取。

   接口与行为归 session-contract 的[委派入口](../session-contract/docs/access-check.md#委派入口)与[会话归属读口与会话工作主体](../session-contract/docs/access-check.md#会话归属读口与会话工作主体)，本成员不另写第二份保证。

## 当前访问检查的装配

`SessionAccessCheckService<P>` 实现 session-contract 的同名接口，唯一键 `sessionAccessCheck` 取自其 `static readonly provide`。接口、裁定与目标以契约根入口为唯一类型源。本成员不实现授权规则，也不把租户清单加入服务配置。

Session 执行边界在构造时必须取得该端口，与委派事务入口、内部主体、会话工作主体一同形成必需依赖。Cordis 下缺席或撤除时服务保持 `PENDING`，不能靠旧 allowed 继续服务。每次公开操作仍在实际执行处检查，不以依赖就绪代表当前主体有权。一次面操作在开头检查一次，之后经 `sessionDelegatedTransactions` 绑定的视图读写，视图不再检查；公共事务入口的每个方法仍各自检查一次。

授权实现由授权适配器提供。租户分支使用真实 `Access`；系统目录沿 IC-18 的系统主体，不能包装成任意租户访问。系统授权的生产提供者尚未交付。此处声明装配要求，不把空的 session/session-cordis 包视为完成接线或运行验证。

## 游标签名

`SessionCursorSigning` 是读取游标（RD-CURSOR）的窄签名依赖。提供者按调用使用当前键，不提供读取原始键的方法。

- `verify` 只接受当前键。轮换后旧 `keyId` 的签名为 `invalid`，没有历史键宽限期。
- 键来源不可读，或提供者已卸载，答 `unavailable`，不答 `invalid`。
- 换代或卸载后的旧调用不得返回看似当前的成功，包括在途调用：`verify` 在完成前复核当前键。完成时键已换代，答 `invalid`（该签名确由旧键签出而不再被接受，与卸载的 `unavailable` 区分）；完成时已卸载，答 `unavailable`。符合性套件用「轮换时在途的 verify」一例兑现。
- 第一次 `await` 前捕获输入字节，输出签名字节由调用者独占。

## 生命周期

Session 不提供运行实例目录，也不为会话建 fiber。服务提供者按显式租户与会话身份处理每个操作；通知不替代共同提交。

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 服务键与抽象类 | 本成员 | 随包 |
| 调用方类声明 | 调用方插件的 intercept 配置 | 随调用方 fiber |
| 端口的实现 | 提供该端口的插件（存储、适配或应用装配） | 插件卸载；访问检查、委派事务入口、内部主体或会话工作主体缺席时 Session 服务停在 `PENDING`，其他端口缺席时只有需要它的操作返回 `unavailable` |
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

持续验证义务由实现者承担：根入口不加载绑定；定义入口不导入任何提供者；每个服务键唯一；两个声明不同调用方类的插件各自取到自己的 intercept 配置，调用方类不在操作允许的范围内时被拒绝；访问检查端口、委派事务入口、内部主体或会话工作主体缺席时 Session 服务停在 `PENDING`，其他端口缺席只影响需要它的操作，可选的通知能力缺席不阻止提交；事件载荷不含正文。本成员的测试证明：根入口没有运行导出且不导入 Cordis，`./cordis` 不导入提供者，每个键常量等于对应抽象类的 `provide`，真实 `Context` 能装载 `SessionService` 的子类并在卸载后移除。其余义务归提供者。机制读数与性质的对应见 [docs/cordis.md 的机制读数与假设](docs/cordis.md#机制读数与假设)。
