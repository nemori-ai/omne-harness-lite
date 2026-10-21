# Request Context 派生计算的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的本地行为归 [SPEC](../SPEC.md)，纯操作的输入、结果与失败归 [request-context-contract SPEC](../../request-context-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [request-context-cordis](../../request-context-cordis/README.md)，以及不装配 Cordis、又要缓存与默认策略的独立调用方 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），见 [Cordis 说明](cordis.md)。只需要纯操作、不需要缓存的调用方直接依赖 [request-context-contract](../../request-context-contract/docs/public-api.md)。

## 定义索引

### 现有导出

根入口现在没有导出。`src/index.ts` 只有模板标记。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言导出为空。

### 随实现进入的导出

下表的内容由 SPEC 固定。名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| 工厂 | 函数，名称随实现确定 | 输入五项构造依赖与配置，输出一个实例 | [SPEC 范围与依据](../SPEC.md#范围与依据) |
| 实例 | 工厂的返回值 | 实现契约的纯操作，带缓存与预计算派生物。另有实例关闭 | [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |
| 默认压缩策略 | 契约压缩策略端口的实现 | 触发界线、保留预算、保留偏好、修剪优先与步数上界，数值是配置初值 | [默认策略与修剪器](../SPEC.md#默认策略与修剪器) |
| 默认表示策略 | 契约表示策略端口的实现 | 按模态的偏好顺序，原件优先于派生表示，派生表示优先于 transcript | 同上 |
| 配置 | 工厂的参数 | 修剪阈值与缓存容量。默认值只是初值 | [候选缓存](../SPEC.md#候选缓存)、[默认策略与修剪器](../SPEC.md#默认策略与修剪器) |

五项构造依赖是：历史源读口 `HistorySource`、Model 的计量端口、Model 的转换件结果端口、压缩策略实现、表示策略实现。前三项的类型归契约或 Model，两个策略端口的类型归契约。本成员不另写签名。

两个默认策略要能被 request-context-cordis 按配置选中，所以要从根入口可达。它们是单独导出，还是由工厂按配置构造，SPEC 没有写明，随实现确定。

明确缺项：SPEC 把贡献登记的变化事件、历史持有者的提交通知、runtime context 的唤醒与模型选择变更列为失效来源，也要求段渲染结果在贡献登记或撤销时预计算。工厂的五项构造依赖里没有接收这些通知的入口。这个入口确定之前，预计算与按通知失效不能实现。[request-context-cordis 的性质 2](../../request-context-cordis/SPEC.md#结果与不变量) 要求提供者在撤除登记时丢弃渲染结果，所以提供者至少要能把贡献的登记与撤销告诉实例。

组装结果的种类沿契约：四种结局与三类失败（[RQ-05](../../request-context-contract/SPEC.md#rq-05-完整预算与候选完成)）。本成员不增加结果种类。任一构造依赖缺席时，相关操作返回不可用（[本地行为](../SPEC.md#本地行为)）。
