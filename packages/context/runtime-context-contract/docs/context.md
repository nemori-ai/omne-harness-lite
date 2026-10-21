# Runtime Context 纯契约的使用与定位

本页说明消费方怎样使用本成员，以及本成员在系统与能力组中的位置。系统关系归[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md)，领域责任归[领域页](../../../../docs/domains/runtime-context/README.md)，组内分解归[组入口](../../README.md)。本页不另立架构。

## 使用方式

### 独立消费

独立调用方不建作用域持有者，也不装配 Cordis。它只安装本成员，自己给出 `ScopeRef`、块声明、生产者与资格材料。只处理调用方自己给出的数据时，缺上层对象不算拒绝。访问系统托管的数据时，仍适用原访问契约（[RC-01](../SPEC.md#rc-01-消费者身份与范围)）。

现在能用的只有类型。下例在语义拥有者的包里声明一个供给块，它只用现有导出：

```ts
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type Locale = Readonly<{ tag: string }>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'example.locale': Locale
  }
}

declare const localeSchema: StandardSchemaV1<unknown, Locale>

export const localeBlock: SuppliedBlockDescriptor<'example.locale', Locale> = {
  kind: 'supplied',
  key: 'example.locale',
  schema: localeSchema,
  consumers: ['model', 'tool'],
  required: false,
  disclosure: 'plain',
  carriesPrevious: true,
  volatility: 'stable',
  recovery: 'reread',
}
```

`localeSchema` 可以是任何实现 Standard Schema 的校验器。块键前缀写语义拥有者自己的域。

五个纯函数进入根入口之后，独立调用方可以直接调用它们：

1. 用 `judgeNeed` 与 `judgeBinding` 核对需要与绑定。
2. 用 `judgeRegistration` 核对注册材料。
3. 用 `reduceStep` 把一步的更新合并成步提交材料。
4. 用 `diffForReminder` 从两份快照算出变化材料。

这些函数现在还没有导出，见[公开接口页](public-api.md#随实现切片进入的导出)。提交与存储仍归调用方自己。

`ScopeRef.ref` 是品牌字符串。本成员现在不导出它的构造或解码函数。

### 初始化与释放

本成员没有初始化步骤，不持有资源，也没有需要释放的对象。纯函数不触碰存储。需要供给中介的运行时行为时，改用组内的机制成员与 Cordis 成员，见下一节。

## 消费者与定位

本成员处在依赖的最底层。下图投影[组架构](../../docs/architecture.md#安装与源码依赖)里与本成员相关的边，两者不一致时以组架构为准。

```mermaid
flowchart LR
  RCC[runtime-context-contract]
  Owners[块的语义拥有者包] -->|增补 ContextBlocks，导出块声明| RCC
  Needs[消费者契约] -->|声明上下文需要| RCC
  RCD[runtime-context-cordis-contract] --> RCC
  RCI[runtime-context] --> RCC
  RQC[request-context-contract] -->|读取结果类型与 volatility| RCC
  RCP[runtime-context-cordis] --> RCD
  RCP --> RCI
```

### 邻域交接

本成员只定义各面交换的类型与纯函数。各面的运行实现与服务入口在别的成员里。

| 面 | 谁实现 | 谁使用 | 怎样进入 | 本成员给什么 |
| --- | --- | --- | --- | --- |
| 声明面 | 块的语义拥有者 | 集成方与供给中介 | 语义拥有者包导出块声明，用 `declare module` 增补 `ContextBlocks` | 块声明类型与空块表 |
| 需要面 | 消费者契约的作者 | 集成方 | 在消费者自己的定义里声明 `ContextNeed`，不点名块键 | 需要类型、`judgeNeed` |
| 生产者面 | [runtime-context](../../runtime-context/README.md) 的机制，经 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/docs/cordis.md) 的服务提供 | 生产者 | 生产者在自己的插件生命周期里登记供值，得到生产者句柄 | `ProducerHandle` 与代际规则 |
| 持有者面 | 同上 | 作用域持有者，它在注册时是集成方 | 经同一服务提交注册、签发资格、提交步 | `Registration`、`Eligibility`、`StepCommit` 材料，`judgeRegistration`、`judgeBinding`、`reduceStep`、`diffForReminder` |
| 读者面 | 同上 | 消费者一侧的适配器，按消费者类读取 | 按持有者签发的资格建立绑定读者 | `ContextReader`、`Snapshot`、`Changes` 与五种读取结果 |
| 请求组装 | [request-context-contract](../../request-context-contract/README.md) | 发起请求的协调者 | 依赖本成员的读取结果类型与块声明的 `volatility` | 读取结果类型、`volatility` |

服务键、各面方法名与消费者类的读取方式归 runtime-context-cordis-contract，本页不复制。

### 现在的真实消费者

execution-environment-contract 是现在唯一用本成员声明块的语义拥有者。它导入 `ScopeRef`、`ConsumerClass` 与 `SuppliedBlockDescriptor`，并增补 `ContextBlocks`。execution-environment 导入 `ScopeRef`。组内其他成员的依赖随它们的实现进入。

### 上层页面

- 系统关系、成员切分与 Cordis 落位：[系统页 Runtime Context](../../../../docs/architecture/runtime/runtime-context.md)。
- 领域责任与各邻域对本域的角色：[领域页](../../../../docs/domains/runtime-context/README.md)、[角色与交接](../../../../docs/domains/runtime-context/architecture.md)。
- 组内成员与跨成员流程：[组入口](../../README.md)、[组协作入口](../../docs/key-flows.md)。
- 本成员的流程：[协议流程](flows.md)。
