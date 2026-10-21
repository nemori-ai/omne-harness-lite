# Runtime Context 公开接口导航

本页是导出索引，不是第二套签名。精确类型归 [src/index.ts](../src/index.ts)，非类型行为归 [SPEC](../SPEC.md)，对象的身份与生灭归[对象模型](object-model.md)。每个定义的输入、输出与失败行为按所列条款查找。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/runtime-context-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 任何包。语义拥有者用它声明块，消费者契约用它声明需要，独立调用方直接使用 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis，见 [Cordis 说明](cordis.md)。服务键与 `Service` 定义归 [runtime-context-cordis-contract](../../runtime-context-cordis-contract/README.md)。

根入口现在只导出类型，没有运行值。`import type` 足以使用全部现有导出。使用 `StandardSchemaV1` 的类型需要 `@standard-schema/spec`，它是本成员的依赖。

## 定义索引

### 现有导出

下表只列 `src/index.ts` 里真实存在的导出。

| 名称 | 种类 | 用途 | 条款 |
| --- | --- | --- | --- |
| `ScopeRef` | 类型 | 不透明的作用域引用，可带父引用 | [RC-01](../SPEC.md#rc-01-消费者身份与范围)、[RC-03](../SPEC.md#rc-03-当前读取资格与缺项) |
| `ContextBlockKey` | 类型 | 块键，形如 `<语义拥有者域>.<名>` | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |
| `ConsumerClass` | 类型 | 四种消费者类：`model`、`tool`、`extension`、`coordinator` | [RC-01](../SPEC.md#rc-01-消费者身份与范围) |
| `ContextBlocks` | 接口 | 块键到值类型的表。本成员不放任何键，语义拥有者用 `declare module` 增补 | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |
| `BlockDescriptorBase` | 接口 | 两类块声明共用的字段 | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |
| `SuppliedBlockDescriptor` | 接口 | 供给块声明，带恢复方式 | [RC-02](../SPEC.md#rc-02-块声明注册与参数)、[RC-07](../SPEC.md#rc-07-生产者句柄并发撤除与恢复) |
| `StatefulBlockDescriptor` | 接口 | 状态块声明，带写者类、合并规则、持久方式与每步单写者 | [RC-02](../SPEC.md#rc-02-块声明注册与参数)、[RC-05](../SPEC.md#rc-05-状态块上下文更新与步提交) |
| `ContextBlockDescriptor` | 类型 | 两类块声明的联合，以 `kind` 区分 | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |

### 随实现进入的导出

下表的名称由 SPEC 与对象模型点名，现在不在 `src/` 里。签名随实现进入，形状以 SPEC 和对象模型为准。某项进入 `src/` 后，把它移到上一张表，并同步导出测试。

| 名称 | 种类 | 对象模型 | 条款 |
| --- | --- | --- | --- |
| `ContextNeed` | 类型 | 上下文需要 | [RC-06](../SPEC.md#rc-06-需要绑定与读者形状) |
| `NeedBinding` | 类型 | 需要绑定，可带翻译纯函数 | [RC-06](../SPEC.md#rc-06-需要绑定与读者形状) |
| `Registration` | 类型 | 注册，带注册修订 | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |
| `ProducerHandle` | 类型 | 生产者句柄，带代际 | [RC-07](../SPEC.md#rc-07-生产者句柄并发撤除与恢复) |
| `Eligibility` | 类型 | 读取资格：资格身份、允许的块键集合、允许的需要绑定集合等；重签时带取代的资格身份 | [RC-03](../SPEC.md#rc-03-当前读取资格与缺项) |
| `ContextReader` | 类型 | 绑定读者：`snapshot()`、`changes(cursor)`、`read(needs)` | [RC-03](../SPEC.md#rc-03-当前读取资格与缺项)、[RC-04](../SPEC.md#rc-04-读取时点观察与变化材料) |
| `Snapshot`、`Changes` | 类型 | 完整快照与增量，带视图修订与游标 | [RC-04](../SPEC.md#rc-04-读取时点观察与变化材料) |
| `ContextUpdate` | 类型 | 上下文更新 | [RC-05](../SPEC.md#rc-05-状态块上下文更新与步提交) |
| `StepCommit` | 类型 | 步提交 | [RC-05](../SPEC.md#rc-05-状态块上下文更新与步提交) |
| `ChangeMaterial` | 类型 | 变化材料 | [RC-04](../SPEC.md#rc-04-读取时点观察与变化材料) |
| `judgeNeed` | 纯函数 | 核对一条需要本身的合法性 | [RC-06](../SPEC.md#rc-06-需要绑定与读者形状) |
| `judgeBinding` | 纯函数 | 核对一条需要绑定 | [RC-06](../SPEC.md#rc-06-需要绑定与读者形状) |
| `judgeRegistration` | 纯函数 | 核对一条注册材料 | [RC-02](../SPEC.md#rc-02-块声明注册与参数) |
| `reduceStep` | 纯函数 | 对每条更新给出接受或拒绝（无权、不合形状），把接受的更新按声明的 `reduce` 合并成步提交材料 | [RC-05](../SPEC.md#rc-05-状态块上下文更新与步提交) |
| `diffForReminder` | 纯函数 | 从两份快照算出变化材料 | [RC-04](../SPEC.md#rc-04-读取时点观察与变化材料) |
| 作用域引用与块键的两个解码函数 | 纯函数 | 从字符串得到 `ScopeRef` 与 `ContextBlockKey` 品牌类型，不用类型断言。名称随实现确定 | [RC-01](../SPEC.md#rc-01-消费者身份与范围) |
| 三面操作类型 | 类型 | `registerProducer`、`prepareRegistration`、`issueEligibility`、`revokeEligibility`、`applyCommit`、`bind` | [三面操作](../SPEC.md#三面操作) |

读取有四种结果：成功、拒绝、缺项、未知（[读取结果](../SPEC.md#读取结果)）；`changes` 另有游标作废，见对象模型的[领域特有的结果与提交](object-model.md#领域特有的结果与提交)。承载这些结果的类型名现在没有确定，随读者与观察模块一起进入。
