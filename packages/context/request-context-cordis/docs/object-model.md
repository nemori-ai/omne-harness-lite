# request-context-cordis 的对象模型

本成员没有自己的领域对象。提示词贡献、组装输入、请求候选与覆盖证据归 [request-context-contract 的对象模型](../../request-context-contract/docs/object-model.md)。缓存条目、派生物与策略的数值归 [request-context 的对象模型](../../request-context/docs/object-model.md)。本成员有四个技术对象：服务实例、插件配置、贡献登记表与它的条目。它们不自动成为产品领域对象。两个策略实例由本插件按配置构造，寿命归本插件（[SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期)），它们的字段与默认值归 request-context。

本成员没有运行实现。类名与字段名随实现确定。

## 对象与关系

| 对象 | 身份 | 拥有者 | 可变性 | 关联 |
| --- | --- | --- | --- | --- |
| 服务实例 | 一个 isolate 标签下的服务键 `requestContext` | 本插件的 fiber | 实例状态：开放、撤除中 | `extends` 服务定义的抽象类。拥有一个机制实例、一张贡献登记表与两个策略实例 |
| 插件配置 | 一次装载 | 装配者给出，静态 `Config` 校验 | 装载后不变。改配置即重新装载 | 策略选择与参数、修剪阈值、缓存容量。策略选择部分的形状归服务定义成员 |
| 贡献登记表 | 服务实例 | 服务实例 | 每次登记或撤除时前进登记修订 | 按作用域与层组织条目，解析时作用域层遮蔽全局层 |
| 登记条目 | 名字、作用域键与层 | 寿命归贡献者插件的 fiber，存放在登记表里 | 登记后不变。改内容就是撤除后重新登记 | 段或变量的内容、撤除函数。段的渲染结果在机制实例里 |

```mermaid
classDiagram
  class RequestContextService {
    <<abstract>>
  }
  class RequestContextProvider {
    config
    mechanism
    registry
    state
    contributeSection()
    contributeVariable()
    contributions(scope)
  }
  class PluginConfig {
    compactionStrategy
    representationStrategy
    trimThreshold
    cacheCapacity
  }
  class ContributionRegistry {
    revision
    resolve(scope)
  }
  class ContributionEntry {
    name
    scope
    layer
    kind
    dispose
  }
  class MechanismInstance
  RequestContextService <|-- RequestContextProvider
  RequestContextProvider --> PluginConfig
  RequestContextProvider "1" *-- "1" MechanismInstance
  RequestContextProvider "1" *-- "1" ContributionRegistry
  ContributionRegistry "1" o-- "*" ContributionEntry
```

图中的类名是说明用的名字。`RequestContextService` 归 [request-context-cordis-contract](../../request-context-cordis-contract/docs/object-model.md)，`MechanismInstance` 归 [request-context](../../request-context/docs/object-model.md)。登记条目用聚合表示，因为条目的寿命归贡献者插件的 fiber，不归登记表。

明确缺项：登记修订是整张表一个，还是每个作用域一个，SPEC 没有写明。事件载荷带作用域键与登记修订，缓存键用提示词贡献的登记修订，两处都依赖这个粒度。

## 生命周期

| 对象 | 创建 | 变化 | 结束 |
| --- | --- | --- | --- |
| 插件配置 | 装配者装载插件 | 不变 | 插件卸载 |
| 服务实例 | 配置校验通过、策略实例构造后，构造子类并以键登记 | 开放 → 撤除中 | 撤除的三步完成，键上不再有服务 |
| 策略实例 | 插件加载时按配置构造 | 不变 | 插件卸载 |
| 机制实例 | 服务实例构造时调用工厂 | 见 request-context | 撤除的最后一步关闭它 |
| 贡献登记表 | 服务实例构造 | 每次登记或撤除 | 撤除的最后一步丢弃它 |
| 登记条目 | 贡献者调用登记方法 | 不变 | 贡献者卸载、调用撤除函数，或本插件卸载 |

本成员定义的协议还约束一类运行期事物，它的实例不归本成员：

| 事物 | 拥有者 | 结束 |
| --- | --- | --- |
| 变化事件的监听 | 监听者的 fiber | 监听者卸载 |

进程失败时这些对象都丢失。本成员没有可恢复的东西，重建沿贡献者重新登记（[SPEC](../SPEC.md#所有权失败与生命周期)）。
