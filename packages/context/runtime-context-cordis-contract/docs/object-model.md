# Runtime Context Cordis 定义的对象模型

本成员没有自己的领域对象。块声明、注册、读取资格、生产者句柄、绑定读者与变化材料都归 [runtime-context-contract 的对象模型](../../runtime-context-contract/docs/object-model.md)，本成员只在服务方法的签名里引用它们。理由是本成员只拥有一个装配接缝：它规定这些对象经哪个服务键、以哪种 Cordis 方式交换，不规定对象本身。

本成员定义三个技术对象。它们不自动成为产品领域对象。精确形状随 `./cordis` 的实现进入，现在源码里没有，见[公开接口页](public-api.md)。

## 对象与关系

| 对象 | 身份 | 拥有者 | 可变性 | 关联 |
| --- | --- | --- | --- | --- |
| `RuntimeContextService` 抽象类 | 服务键 `runtimeContext` | 本成员 | 静态，随包发布 | `extends` Cordis 的 `Service`，`implements` 契约的三面操作类型。提供者 `extends` 它 |
| intercept 配置 `{ consumer }` | 消费者插件 fiber 上的一份配置 | 声明它的消费者插件 | 随该插件的 `inject` 声明，运行时不改 | `consumer` 是契约的 `ConsumerClass`。`bind` 拿它与读取资格做一致性核对，这不是访问控制 |
| 事件载荷 | 一次派发 | 派发它的提供者 | 值，派发即完 | 作用域引用加视图修订，不带块键，事件名 `runtime-context-cordis-contract/changed` |

```mermaid
classDiagram
  class Service
  class RuntimeContextService {
    <<abstract>>
    provide = runtimeContext
    registerProducer()
    prepareRegistration()
    issueEligibility()
    revokeEligibility()
    applyCommit()
    bind()
  }
  class RuntimeContextIntercept {
    consumer
  }
  class ChangedPayload {
    scope
    revision
  }
  class ProviderService
  Service <|-- RuntimeContextService
  RuntimeContextService <|-- ProviderService
  RuntimeContextService ..> RuntimeContextIntercept : bind 读取
  ProviderService ..> ChangedPayload : emit
```

图中 `RuntimeContextIntercept`、`ChangedPayload` 与 `ProviderService` 是说明用的名字。`ProviderService` 代表 [runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md) 的具体子类。导出的类型名随实现确定。

## 生命周期

| 对象 | 创建 | 变化 | 结束 |
| --- | --- | --- | --- |
| 抽象类 | 包发布 | 契约的三面操作类型改变时随包升版 | 包退出 |
| intercept 配置 | 消费者插件装载，Cordis 把对象形式 `inject` 的值写进该 fiber 的 intercept | 不变。改消费者类就是改装配 | 随消费者插件的 fiber 结束 |
| 事件载荷 | 提供者在投影变化后派发 | 无 | 派发即完。监听者不保存它作为事实 |

本成员定义的协议还约束两类运行期事物，它们的实例都不归本成员：

- 生产者登记：归生产者插件的 fiber，在插件卸载、`dispose` 句柄或服务撤除时结束。撤除只移除本代登记。协议见 [Cordis 说明](cordis.md#登记与撤除协议)。
- 事件监听：经 `ctx.on` 注册，归监听者的 fiber，随它结束。
