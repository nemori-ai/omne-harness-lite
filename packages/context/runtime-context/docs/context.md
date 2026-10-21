# Runtime Context 供给机制的使用与定位

本页说明谁使用本成员、怎样使用，以及本成员在能力组中的位置。系统关系归[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md)，组内分解归[组入口](../../README.md)。本页不另立架构。

## 使用方式

本成员现在没有导出。下面是 SPEC 固定的用法，随工厂的实现生效。

### 经 Cordis 使用

装配 Cordis 的系统不直接导入本成员。[runtime-context-cordis](../../runtime-context-cordis/docs/cordis.md) 在插件装载时调用工厂，把机制实例装进服务 `runtimeContext`。生产者、作用域持有者与读者经服务定义 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/docs/context.md) 使用它。

### 独立使用

不装配 Cordis 的调用方直接调用工厂。下例是职责伪代码，不表示当前包已有运行导出：

```text
实例 = 工厂(契约端口, { 观察链保留上限 })

生产者：句柄 = 实例.registerProducer(块键, 代际, 按作用域供值的回调？)
        代际由调用方给出，必须可比较；旧代际的发布被丢弃
        用句柄按作用域发布、使失效；不再供值时 dispose

作用域持有者：核对结果 = 实例.prepareRegistration(注册材料)
              在自己的存储里提交注册决定
              实例.applyCommit(已提交的结果)
              资格身份 = 实例.issueEligibility(…)
              重签或收窄范围：实例.issueEligibility(…, 取代的资格身份)；旧资格失效，读者沿新资格继续，游标作废
              实例.revokeEligibility(资格)；之后该资格的读取按拒绝（无权）

读者：读者 = 实例.bind(资格身份)
      第一次 snapshot 取完整快照与游标
      之后 changes(游标)；游标作废时重新 snapshot

结束：关闭实例；关闭后的请求被拒绝
```

独立调用方要自己承担 Cordis 提供者替它做的事：

1. 给出代际。经 Cordis 时代际取生产者 fiber 的 `uid`。
2. 在生产者结束时调用 `dispose`。经 Cordis 时登记随插件卸载自动撤除。
3. 自己决定何时唤醒读者。本成员不派发事件。
4. 注册、自有值与步提交的耐久保存。本成员不持有耐久状态。

访问系统托管的数据时，仍适用原访问契约（[RC-01](../../runtime-context-contract/SPEC.md#rc-01-消费者身份与范围)）。

### 初始化与释放

工厂调用即初始化，没有其他前提。调用工厂的一方拥有机制实例，负责关闭它。关闭按[内部架构](architecture.md#关闭顺序与重建)的顺序进行。

## 消费者与定位

本成员是 Runtime Context 的机制实现，只依赖纯契约。下图投影[组架构](../../docs/architecture.md#安装与源码依赖)里与本成员相关的边，两者不一致时以组架构为准。

```mermaid
flowchart LR
  RCC[runtime-context-contract]
  RCI[runtime-context] --> RCC
  RCP[runtime-context-cordis] -->|调用工厂| RCI
  Ind[独立调用方] -->|调用工厂| RCI
```

| 使用方 | 怎样使用 | 本成员给什么 |
| --- | --- | --- |
| [runtime-context-cordis](../../runtime-context-cordis/README.md) | 插件装载时调用工厂，插件卸载时关闭实例 | 三面操作的机制实现 |
| 独立调用方 | 直接调用工厂 | 同上，代际、撤除与唤醒由调用方自己承担 |

组内只有 runtime-context-cordis 依赖本成员。生产者、持有者与读者不直接依赖本成员，它们依赖服务定义（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

### 现在的真实消费者

现在没有包依赖本成员。runtime-context-cordis 的 `package.json` 还没有列出本成员，随实现进入。

### 上层页面

- 系统关系：[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md)。
- 公开行为：[runtime-context-contract SPEC](../../runtime-context-contract/SPEC.md)、[协议流程](../../runtime-context-contract/docs/flows.md)。
- 组内成员与阅读路径：[组入口](../../README.md)、[组协作入口](../../docs/key-flows.md)。
