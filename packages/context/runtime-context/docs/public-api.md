# Runtime Context 供给机制的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的本地行为归 [SPEC](../SPEC.md)，三面操作的输入、结果与失败归 [runtime-context-contract SPEC](../../runtime-context-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/runtime-context` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [runtime-context-cordis](../../runtime-context-cordis/README.md)，以及不装配 Cordis 的独立调用方 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），见 [Cordis 说明](cordis.md)。

## 定义索引

### 现有导出

根入口现在没有导出。`src/index.ts` 只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言导出为空。

### 随实现进入的导出

下表的内容由 SPEC 固定。名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| 机制工厂 | 函数，名称随实现确定 | 输入契约的端口与配置，输出一个机制实例 | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| 机制实例 | 工厂的返回值 | 实现契约的三面操作：生产者面 `registerProducer`，持有者面 `prepareRegistration`、`issueEligibility`、`applyCommit`，读者面 `bind`。另有实例关闭 | [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |
| 配置 | 工厂的参数 | 观察链保留上限。默认值只是初值 | [SPEC 本地行为](../SPEC.md#本地行为) |

三面操作的签名在契约里写一次。本成员不另写。契约现在还没有导出这些操作类型，见契约的[随实现切片进入的导出](../../runtime-context-contract/docs/public-api.md#随实现切片进入的导出)。

明确缺项：SPEC 没有写明机制实例怎样把投影变化告诉它的使用方。runtime-context-cordis 要据此派发唤醒事件（[runtime-context-cordis 的唤醒](../../runtime-context-cordis/docs/cordis.md#按作用域过滤的唤醒)）。这个出口随工厂一起确定之前，Cordis 一侧的唤醒不能实现。

读取结果的种类沿契约：成功、拒绝、缺项、未知、游标作废。本成员另有「不在场」，表示可选块没有当前值，它不是失败（[SPEC 本地行为](../SPEC.md#本地行为)）。
