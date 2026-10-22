# @omne-harness/request-context-cordis-contract 行为规格

状态：Cordis 定义成员，`draft`。本成员只拥有 Request Context 的 Cordis 定义：一个服务键、一个抽象 `Service`、一个事件、一种 intercept 配置。它承载两件事：提示词贡献的登记面，以及压缩策略与表示策略的提供者选择。领域行为归 [request-context-contract SPEC](../request-context-contract/SPEC.md)。本页不另写第二份保证。`./cordis` 已实现服务定义；生产提供者实现不在本成员。

## 范围与依据

本成员承接 [IC-1](../../../docs/architecture/cordis-integration-conventions.md#ic-1) 至 [IC-3](../../../docs/architecture/cordis-integration-conventions.md#ic-3)、[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)、[IC-10](../../../docs/architecture/cordis-integration-conventions.md#ic-10)、[IC-11](../../../docs/architecture/cordis-integration-conventions.md#ic-11)、[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)、[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)、[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17) 对 Request Context 这一个接缝的要求。服务定义、依赖分类、登记与撤除协议、事件归 [docs/cordis.md](docs/cordis.md)。

提示词贡献只有两类：有序段与变量。贡献者是定义、工作区指导、技能与元能力用法的拥有者。它们是多个插件，各有自己的寿命，所以登记面放在 Cordis 上。纯操作仍由契约根入口定义。组装入口有两条：托管路径上，调用方用服务的 `assembly(scope, ports)` 取得已配置的操作组；独立路径上，调用方从 [request-context](../request-context/SPEC.md) 的机制工厂取得同一组操作。两条路径交出的操作签名相同，差别在两处：贡献集合在 Cordis 路径由操作组现取，在独立路径由调用方传入；历史源读口、计量端口、转换件结果端口与请求序列化端口在 Cordis 路径由调用方逐次交入，在独立路径由工厂在构造时取得。依据：产品 [§6.1](../../../.meta_harness/design/product/runtime-context/design.md#61-request-context-的派生计算)。

根入口与 Cordis 无关，只重新导出契约词汇所需的类型（[IC-4](../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 定义从 `./cordis` 导出。

## 结果与不变量

本成员必须保持下列性质。

1. 服务键 `requestContext` 只由抽象类 `RequestContextService` 的 `static readonly provide` 给出。导出的键常量取自它。提供者不另写键。
2. `RequestContextService` 实现契约根入口的登记面操作类型：`contributeSection`、`contributeVariable`、`contributions(scope)`。它另有组装入口 `assembly(scope, ports)`：`ports` 含历史源读口、计量端口、转换件结果端口与请求序列化端口，由调用方逐次交入。它返回一组纯操作，这组操作已按该 isolate 的配置绑定了选定的策略，并只用这次交入的端口。提供者不 `inject` 作用域持有者或模型侧的服务，四项端口缺席时相关操作返回不可用。操作组在每次调用时从登记面现取该作用域适用的贡献集合，不收调用方传入的贡献；覆盖证据记现取时本作用域适用的段列表摘要与登记面实例的代次。操作组的作用域、组装上下文的作用域引用、历史依据的作用域引用三者不一致时返回无效。组装本身仍是纯函数：现取的贡献集合、段列表摘要与实例代次是这次调用的输入。服务只交出已配置的操作组。服务不把 `assemble`、`planCompaction` 这类纯操作直接写成自己的方法。类上的 JSDoc 写 `@owner packages/context/request-context-contract`。
3. `contributeSection` 与 `contributeVariable` 登记即效应（[IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)）：在方法里用 `this.ctx.effect` 登记，登记落在贡献者的 fiber 上，贡献者卸载即撤。提供者须验证贡献者卸载后登记已撤除。
4. 贡献带作用域引用 `ScopeRef`。全局层的贡献以 `scope: null` 登记。同一层同名拒绝，不覆盖。解析时作用域层遮蔽全局层。
5. 带逐请求变化变量的段在登记时拒绝（[RQ-02](../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。登记时根据变量显式声明的 `volatility` 识别逐请求变化，不从文本内容推断。登记不渲染文本。
6. 事件只有一个：`request-context-cordis-contract/changed`，载荷是作用域引用、该层的登记修订与登记面实例的代次，模式 `emit`。登记面的每一层（全局层与每个作用域层）各有自己的修订，一层的登记或撤除只使这一层的修订前进；登记面实例的代次在每次提供者构造登记面时新取，重启后不同。全局层的贡献变化时，载荷的作用域引用为 `null`。贡献变化即发，带修订。它只是失效提示，不携带内容。监听者按载荷过滤：监听作用域 X 的一方接收作用域为 X 的载荷，也接收作用域为 `null` 的载荷。别的作用域的贡献变化不影响作用域 X 的提示词键与前缀变化原因。
7. intercept 配置类型是 `{ scope: ScopeRef | null }`：贡献者插件以对象形式 `inject` 声明自己的作用域，`null` 表示全局层；服务方法经 `this[Service.resolveConfig]()` 取得。它是装配事实，不是资格授予（[IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18)）。
8. 压缩策略与表示策略的实现由提供者在构造时按配置选择，配置经 Standard Schema 校验（[IC-14](../../../docs/architecture/cordis-integration-conventions.md#ic-14)）。本成员只定义选择的配置形状，不定义策略数值。提供者按配置只选这两个策略，不从别的服务取依赖。
9. 一个 isolate 标签下一个提供者（[IC-6](../../../docs/architecture/cordis-integration-conventions.md#ic-6)）。作用域是参数，不是 Context，也不是 isolate（[IC-17](../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。
10. `./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/request-context` 或 `@omne-harness/request-context-cordis`。

## 所有权、失败与生命周期

| 事物                 | 拥有者                                                       | 结束                           |
| -------------------- | ------------------------------------------------------------ | ------------------------------ |
| 服务键与抽象类       | 本成员                                                       | 随包                           |
| 一条贡献的登记       | 贡献者插件的 fiber                                           | 插件卸载、撤除函数，或服务撤除 |
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

持续验证义务由提供者承担：贡献者卸载后登记撤除；同层重名拒绝；作用域层遮蔽全局；带逐请求变量的段被拒绝；变化事件带该层修订与实例代次，按载荷的作用域过滤；别的作用域的贡献变化不使本作用域的提示词键变化；`assembly(scope, ports)` 只用这次交入的端口，端口缺席时返回不可用。消费者类与作用域经 intercept 配置到达服务方法这一条机制读数尚未进入 basis，与 [runtime-context-cordis-contract/docs/cordis.md](../runtime-context-cordis-contract/docs/cordis.md) 列的同一条；固定 Cordis 4.0.4 的本地探针已验证该机制；尚未登记共同 basis，不据此扩大共同采用或跨版本保证。

文档导航见 [index](index.md)。
