# Request Context Cordis 定义的使用与定位

本页说明谁依赖本成员、怎样依赖，以及本成员在能力组中的位置。系统关系与 Cordis 落位归[系统页 Request Context](../../../../docs/architecture/runtime/request-context.md)，组内分解归[组入口](../../README.md)。本页不另立架构。

## 使用方式

本成员已提供抽象定义。下面的写法说明贡献者怎样消费，生产提供者另由装配安装。

### 贡献者插件

贡献者是提示词内容的拥有者：定义、工作区指导、技能与元能力用法的拥有者（[SPEC 范围与依据](../SPEC.md#范围与依据)）。贡献者插件用对象形式 `inject` 声明作用域，在插件体里登记：

```text
import type {} from '@omne-harness/request-context-cordis-contract/cordis'
inject: { requestContext: { scope: 作用域引用 } }
插件体：dispose = ctx.requestContext.contributeSection(段)
        dispose = ctx.requestContext.contributeVariable(变量)
        插件卸载时登记自动撤除；需要提前撤除时调用 dispose
```

段与变量的精确形状归契约的 `PromptContribution`。登记在三种情形下被拒绝：取不到作用域、同层已有同名贡献、段带逐请求变化的变量。日期、当前目录这类会变的运行事实不走提示词贡献，改走 runtime context 块（[RQ-02](../../request-context-contract/SPEC.md#rq-02-组装的前置输入)）。

### 读取贡献集合的调用方

来源适配者为某个目标登记来源集合：七组读口、窄采用来源、历史源读口、转换件结果读口、读取资格与 Model 准备资源。协调者一侧的适配器要组装一次请求时，用数组形式 `inject`，按目标取操作组。操作组每次调用时借用该目标当前登记的来源集合，并从登记面现取该作用域的贡献集合，替换第四组读口给出的贡献。这是托管路径的组装入口；不装配 Cordis 的调用方用契约根入口的 `createAssemblyOperations` 或 [request-context](../../request-context/docs/context.md) 的工厂：

```text
inject: ['requestContext']
登记：句柄 = ctx.requestContext.register({ 访问身份, 目标, 拥有者, 来源集合 })   // 挂在本 fiber 上
操作组 = ctx.requestContext.assembly(目标)
结局 = 操作组.assemble({ 访问身份, 用途, 消费位置, 候选身份 })
要查看当前贡献集合时：贡献集合 = ctx.requestContext.contributions(作用域引用)
```

作用域层的贡献遮蔽全局层的同名贡献。`assembly(target)` 返回的操作组已按该 isolate 的配置绑定选定的策略，只用该目标当前登记的来源集合；目标没有登记时返回不可用（来源登记）。第四组的令牌同时覆盖登记面实例的代次与全局层、本作用域层的修订。提供者不 `inject` 作用域持有者或模型侧的服务。目标的作用域与组装上下文、历史依据的作用域引用不一致时返回无效。`target.tenant` 显式传入并由登记授权核验，intercept 作用域只是装配事实。组装本身仍是纯函数，类型归 [request-context-contract](../../request-context-contract/docs/context.md)。

### 只监听变化事件的一方

不 `inject`。用 `import type {}` 取得事件类型，再 `ctx.on('request-context-cordis-contract/changed', …)`。监听者按载荷里的作用域引用过滤，派发方不过滤：监听作用域 X 的一方接收作用域为 X 或 `null` 的载荷。载荷带作用域引用、该层的登记修订与登记面实例的代次。监听者同步执行，不返回 Promise。事件只是失效提示。读到什么以 `contributions(scope)` 的结果为准。

### 独立使用

不装配 Cordis 的调用方不需要本成员。它自己收集提示词贡献，作为组装输入的一组传给纯操作。只用类型与纯操作时依赖 [request-context-contract](../../request-context-contract/docs/context.md)。要不含 Cordis 的缓存与默认策略时依赖 [request-context](../../request-context/docs/context.md) 的工厂。

### 初始化与释放

本成员不持有资源，没有初始化或释放步骤。贡献登记的释放由 Cordis 的效应完成，见 [Cordis 说明](cordis.md#登记与撤除协议)。

## 消费者与定位

本成员处在纯契约与提供者之间。下图投影[组架构](../../docs/architecture.md#安装与源码依赖)里与本成员相关的边，两者不一致时以组架构为准。

```mermaid
flowchart LR
  RQC[request-context-contract]
  RQD[request-context-cordis-contract] --> RQC
  RQP[request-context-cordis] -->|extends 抽象类| RQD
  Contributors[贡献者插件] -->|对象形式 inject| RQD
  Readers[读取贡献集合的调用方] -->|inject| RQD
  Listeners[监听变化事件的一方] -->|import type 增补| RQD
```

| 依赖方                                                           | 怎样依赖                                                                                                  | 用什么                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [request-context-cordis](../../request-context-cordis/README.md) | `extends RequestContextService`                                                                           | 抽象类、键、事件增补、策略选择的配置形状  |
| 贡献者插件                                                       | 对象形式 `inject`，按 [IC-9](../../../../docs/architecture/cordis-integration-conventions.md#ic-9) 取类型 | `contributeSection`、`contributeVariable` |
| 读取贡献集合的调用方                                             | 数组形式 `inject`                                                                                         | `contributions(scope)`                    |
| 监听变化事件的一方                                               | `import type {}` 与 `ctx.on`                                                                              | 事件                                      |

依赖方不导入提供者的实现入口（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

### 现在的真实消费者

现在没有包依赖本成员。提供者 request-context-cordis 也还没有在 `package.json` 里依赖它。第一批消费者随提供者、贡献者插件与协调者一侧的适配器一起进入。

### 上层页面

- 系统关系与登记面：[系统页的提示词贡献登记面](../../../../docs/architecture/runtime/request-context.md#提示词贡献登记面)、[成员与 Cordis 落位](../../../../docs/architecture/runtime/request-context.md#成员与-cordis-落位)。
- 组内成员与阅读路径：[组入口](../../README.md)、[组协作入口](../../docs/key-flows.md)。
- 共同集成规则：[IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。
