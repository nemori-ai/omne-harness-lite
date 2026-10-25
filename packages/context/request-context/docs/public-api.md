# Request Context 派生计算的公开接口导航

本页是导出索引，不是第二套签名。精确类型归 `src/`，本成员的本地行为归 [SPEC](../SPEC.md)，纯操作的输入、结果与失败归 [request-context-contract SPEC](../../request-context-contract/SPEC.md)。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | [request-context-cordis](../../request-context-cordis/README.md)，以及不装配 Cordis、又要托管登记或账目投影的独立调用方 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)），见 [Cordis 说明](cordis.md)。只需要独立操作组的调用方用契约根入口的 `createAssemblyOperations`，直接依赖 [request-context-contract](../../request-context-contract/docs/public-api.md)。

## 定义索引

### 现有导出

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| `createContextSourceRegistry` | 函数 | 输入 `ContextRegistryOptions<P>`（主体绑定、登记授权判定者、两个策略实现），返回 `ContextSourceRegistry<P>`：`register`、`replace`、`assembly(target)`、`close()` | [SPEC 来源登记表](../SPEC.md#来源登记表)、[RQ-12](../../request-context-contract/SPEC.md#rq-12-来源集合与登记面) |
| `createContextAccounting` | 函数 | 输入 `AccountingOptions<P>`（来源核验、读取资格、窄采用来源、恢复授权、必填的 `limits`），返回 `{ inbox, recovery }`：`ContextAccountingInbox<P>` 与 `ContextRecovery<P>` | [SPEC 账目投影](../SPEC.md#账目投影)、[RQ-14](../../request-context-contract/SPEC.md#rq-14-窗口占用与账目收到)、[RQ-15](../../request-context-contract/SPEC.md#rq-15-普通访问与系统恢复) |

参数与返回值的类型都归 [request-context-contract](../../request-context-contract/docs/public-api.md)，本成员不另写签名。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口恰好导出这两个工厂。

历史源读口、Model 准备资源、转换件结果读口与读取资格随来源集合 `ContextSources<P>` 登记，不在构造时给出，也不逐次交入。请求字节取自 Model 的 `rules.plan` 返回的物化表示，本成员没有序列化端口。

### 随实现进入的导出

下表的内容由 SPEC 固定，名称与签名随实现进入。某项进入 `src/` 后，把它移到上一节，并同步导出测试。

| 定义 | 种类 | 输入与输出 | 依据 |
| --- | --- | --- | --- |
| 候选缓存 | 登记表实例的内部状态，另加 `notify(change)` | 键与 `PreparedInputKey` 相同；按组失效 | [候选缓存](../SPEC.md#候选缓存) |
| 默认压缩策略 | 契约压缩策略端口的实现 | 触发界线、保留预算、保留偏好、修剪优先与步数上界，数值是配置初值 | [默认策略与修剪器](../SPEC.md#默认策略与修剪器) |
| 默认表示策略 | 契约表示策略端口的实现 | 按模态的偏好顺序，原件优先于派生表示，派生表示优先于 transcript | 同上 |
| 配置 | 工厂的参数 | 修剪阈值与缓存容量。默认值只是初值 | [候选缓存](../SPEC.md#候选缓存)、[默认策略与修剪器](../SPEC.md#默认策略与修剪器) |

两个默认策略要能被 request-context-cordis 按配置选中，所以要从根入口可达。它们是单独导出，还是由工厂按配置构造，SPEC 没有写明，随实现确定。

缓存实现后，登记表实例的通知入口是 `notify(change)`，种类只有 `contributions`，带作用域引用（全局层为 `null`）与该层的修订（[候选缓存](../SPEC.md#候选缓存)）。[request-context-cordis](../../request-context-cordis/SPEC.md#结果与不变量) 经这个入口把贡献的登记与撤除告诉实例。别的组的变化不经通知，每次调用时由组令牌比较得知。

组装结果的种类沿契约的[组装的结果](../../request-context-contract/SPEC.md#组装的结果)表：四种结局、三类失败与未知。登记表只在借用失败与发布核对失败时增加不可用（`owner: 'source-registry'`）。任一依赖端口缺席时，相关操作返回不可用（[本地行为](../SPEC.md#本地行为)）。
