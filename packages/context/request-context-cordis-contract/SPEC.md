# @omne-harness/request-context-cordis-contract 行为规格

状态：Cordis 定义成员，`draft`。本成员只拥有 Request Context 的 Cordis 定义：一个服务键、一个抽象 `Service`、一个事件、一种 intercept 配置。它承载三件事：提示词贡献的登记面、来源登记表 `register`、`replace` 与 `assembly(target)` 的投影，以及压缩策略与表示策略的提供者选择。领域行为归 [request-context-contract SPEC](../request-context-contract/SPEC.md)。本页不另写第二份保证。`./cordis` 已实现服务定义；生产提供者实现不在本成员。

## 范围与依据

本成员承接 [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)、[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)、[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17) 对 Request Context 这一个接缝的要求。服务定义、依赖分类、登记与撤除协议、事件归 [docs/cordis.md](docs/cordis.md)。

提示词贡献只有两类：有序段与变量。贡献者是定义、工作区指导、技能与元能力用法的拥有者。它们是多个插件，各有自己的寿命，所以登记面放在 Cordis 上。操作组与来源集合的协议仍由契约根入口定义（[RQ-12](../request-context-contract/SPEC.md#rq-12-来源集合与登记面)）。组装入口有两条：托管路径上，来源适配者经服务的 `register` 按目标登记来源集合，调用方用服务的 `assembly(target)` 取得已配置的操作组；独立路径上，调用方用契约根入口的 `createAssemblyOperations` 直接绑定自己的来源集合。两条路径执行同一读取协议，差别只在第四组的贡献集合：Cordis 路径由服务从登记面现取，独立路径由来源集合的第四组读口给出。依据：产品 [§6.1](../../../.meta_harness/design/product/runtime-context/design.md#61-request-context-的派生计算)、[#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) 的 J13。

根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 定义从 `./cordis` 导出。

## 结果与不变量

本成员必须保持下列性质。

1. 服务键 `requestContext` 只由抽象类 `RequestContextService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键。
2. `RequestContextService` 实现契约根入口的登记面操作类型：`contributeSection`、`contributeVariable`、`contributions(scope)`。它另逐签名投影来源登记表 `ContextSourceRegistry` 的 `register` 与 `replace`，以及组装入口 `assembly(target)`。`register` 与 `replace` 的语义归 [RQ-12](../request-context-contract/SPEC.md#rq-12-来源集合与登记面)：登记键是 `(tenant, scope)`，同键第二次登记为冲突，登记授权由提供者构造时注入的授权判定者核验，不由来源集合自授。`assembly(target)` 返回一组操作，这组操作已按该 isolate 的配置绑定了选定的策略，并只用该目标当前登记的来源集合；目标没有登记时操作返回不可用（来源登记）。提供者不 `inject` 作用域持有者或模型侧的服务。操作组在每次调用时从登记面现取该作用域适用的贡献集合，替换第四组读口给出的贡献；第四组的令牌同时覆盖登记面实例的代次与全局层、本作用域层的修订，组装上下文仍取登记来源的第四组。目标的作用域与组装上下文、历史依据的作用域引用不一致时返回无效。服务只交出已配置的操作组，不把 `assemble`、`planCompaction` 这类操作直接写成自己的方法。类上的 JSDoc 写 `@owner packages/context/request-context-contract`。
3. `contributeSection` 与 `contributeVariable` 登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：在方法里用 `this.ctx.effect` 登记，登记落在贡献者的 fiber 上，贡献者卸载即撤。提供者须验证贡献者卸载后登记已撤除。
4. 贡献带作用域引用 `ScopeRef`。全局层的贡献以 `scope: null` 登记。全局层只放与租户无关的贡献；与某个租户相关的贡献按作用域登记。同一层同名拒绝，不覆盖。解析时作用域层遮蔽全局层。
5. 带逐请求变化变量的段在登记时拒绝（[RQ-02](../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。登记时根据变量显式声明的 `volatility` 识别逐请求变化，不从文本内容推断。登记不渲染文本。
6. 事件只有一个：`request-context-cordis-contract/changed`，载荷是作用域引用、该层的登记修订与登记面实例的代次，模式 `emit`。登记面的每一层（全局层与每个作用域层）各有自己的修订，一层的登记或撤除只使这一层的修订前进；登记面实例的代次在每次提供者构造登记面时新取，重启后不同。全局层的贡献变化时，载荷的作用域引用为 `null`。贡献变化即发，带修订。它只是失效提示，不携带内容。监听者按载荷过滤：监听作用域 X 的一方接收作用域为 X 的载荷，也接收作用域为 `null` 的载荷。别的作用域的贡献变化不影响作用域 X 的提示词键与前缀变化原因。
7. intercept 配置类型是 `{ scope: ScopeRef | null }`：贡献者插件以对象形式 `inject` 声明自己的作用域，`null` 表示全局层；服务方法经 `this[Service.resolveConfig]()` 取得。它是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
8. 压缩策略与表示策略的实现由提供者在构造时按配置选择，配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。本成员只定义选择的配置形状，不定义策略数值。提供者按配置只选这两个策略，不从别的服务取依赖。
9. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。作用域是参数，不是 Context，也不是 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。
10. `./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/request-context` 或 `@omne-harness/request-context-cordis`。
11. `register` 与 `replace` 是登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：登记挂在调用者的 fiber 上，fiber 撤除只触发对应句柄的 `withdraw()`，不等待结算。服务的 intercept 作用域只是装配事实；`target.tenant` 显式传入并由授权判定者核验，作用域与 fiber 都不是租户授权。服务撤除时提供者调用登记表的 `close()`，等待全部来源集合结算；disposer 被调用不代替异步结算。
12. 信任服务 `RequestContextTrustService`（键 `requestContextTrust`）把 `principalBinding` 与 `registrationAuthority` 两个原端口逐属性交给消费者。聚合类型 `RequestContextTrust<P>` 声明在根入口 `src/trust.ts`，由 `ContextRegistryOptions<P>` 的 `Pick` 派生，不复制字段类型，不新造登记授权协议。信任对象由装配入口在受信子树提供，不进插件树 JSON，没有 root 共享签发者。信任键缺席时消费者不运行。
13. 键只是交付路径。不 `inject` 就取不到，不是访问控制：每次 `register` 与 `replace` 仍由 `registrationAuthority` 判定。`allowed` 不含同步 current。本成员不保证登记写入与远端撤权的原子排序，也不让 `allowed` 成为后续读取许可。
14. 账目收件口服务 `ContextAccountingInboxService`（键 `contextAccountingInbox`）投影原契约的 `ContextAccountingInbox<P>`。提供者在提供 `requestContext` 的同一个插件 fiber 提供它，使窗口占用与收账读同一份状态。本成员只定义键与抽象类。
15. `./testing` 子路径发布脚本替身 `createScriptedRequestContextTrust` 与套件 `requestContextTrustConformance`。脚本替身按字段逐一相等匹配 `access`、`target`、`owner`、`action`；未列出的输入答 `unavailable`，成功必须显式列出。套件不导入提供者成员，夹具经 `createRegistry({ trust, policies })` 交入登记表工厂。根入口与 `./cordis` 不转导出 testing。

## 所有权、失败与生命周期

| 事物                 | 拥有者                                                       | 结束                           |
| -------------------- | ------------------------------------------------------------ | ------------------------------ |
| 服务键与抽象类       | 本成员                                                       | 随包                           |
| 一条贡献的登记       | 贡献者插件的 fiber                                           | 插件卸载、撤除函数，或服务撤除 |
| 一个来源集合的登记 | 登记者的 fiber；集合的读口归来源适配者 | fiber 撤除触发 `withdraw()`；`settled` 之后来源适配者才可关闭读口 |
| 作用域引用声明       | 贡献者插件的 intercept 配置                                  | 随贡献者 fiber                 |
| 事件监听             | 监听者的 fiber                                               | 随监听者 fiber                 |
| 渲染结果、缓存、候选 | 不在本成员。归 [request-context](../request-context/SPEC.md) | —                              |

服务撤除、在途组装的结算是提供者的责任，归 [request-context-cordis SPEC](../request-context-cordis/SPEC.md)。

## 组合与验证

| 承诺                           | 位置                                                                                                                                                     | 本成员怎样消费 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 提示词贡献两类、拒绝逐请求变量 | [RQ-02](../request-context-contract/SPEC.md#rq-02-组装的前置输入)                                                                                        | 性质 2、5      |
| 贡献变化是缓存失效来源         | [request-context SPEC](../request-context/SPEC.md)                                                                                                       | 性质 6         |
| 策略可替换、默认值只是初值     | [RQ-04](../request-context-contract/SPEC.md#rq-04-模态与可追溯表示)、[RQ-06](../request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界)           | 性质 8         |
| 事件命名与增补位置             | [IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11) | 性质 6         |

持续验证义务由提供者承担：贡献者卸载后登记撤除；同层重名拒绝；作用域层遮蔽全局；带逐请求变量的段被拒绝；变化事件带该层修订与实例代次，按载荷的作用域过滤；别的作用域的贡献变化不使本作用域的提示词键变化；`assembly(target)` 只用该目标当前登记的来源集合，目标没有登记时返回不可用；登记挂在调用者 fiber 上，fiber 撤除后新操作不再借用该集合，旧句柄的撤除不删后继登记。消费者类与作用域经 intercept 配置到达服务方法这一条机制读数尚未进入 basis，与 [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md) 列的同一条；固定 Cordis 4.0.4 的本地探针已验证该机制；尚未登记共同 basis，不据此扩大共同采用或跨版本保证。

文档导航见 [index](index.md)。
