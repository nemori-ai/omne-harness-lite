# Request Context Cordis 定义的公开接口导航

精确签名归源码，行为归 [SPEC](../SPEC.md)，机制归 [Cordis 说明](cordis.md)。

## 导出入口

根入口只发布类型；`./cordis` 发布 Cordis 服务定义。两者的定义索引如下。

## 定义索引

下列两节分别索引根入口与 Cordis 入口的公开定义。实际导出名字由源码及测试清单核对。

### 根类型导出

根入口 [src/index.ts](../src/index.ts) 显式重导出服务签名与登记面所需的契约类型，不是 request-context-contract 的全部类型名字；精确名单以[导出清单](../tests/fixtures/exports.json)为准。没有运行值，也不导入 Cordis。类型 RequestContextTrust 声明在 [src/trust.ts](../src/trust.ts)。纯操作、Schema 和测试工厂仍从原契约入口导入。

### Cordis 定义

[src/cordis.ts](../src/cordis.ts) 导出下列定义，没有别的运行导出：

| 种类 | 名字 | 说明 |
| --- | --- | --- |
| 抽象类 | `RequestContextService`、`RequestContextTrustService`、`ContextAccountingInboxService` | 三个服务定义，各自的键只在 `static readonly provide` 写一次 |
| 派生键 | `requestContextKey`、`requestContextTrustKey`、`contextAccountingInboxKey` | 取自各抽象类的 `provide` |
| 类型 | `RequestContextIntercept`、`RequestContextPolicySelection`、`RequestContextChangedPayload` | intercept 配置、策略选择的配置形状、变化事件的载荷 |
| 增补 | `Context` 的 `requestContext`、`requestContextTrust`、`contextAccountingInbox` 属性；`Events` 的 `request-context-cordis-contract/changed` 位置参数事件 | 模块增补，没有运行值 |

根入口另导出类型 `RequestContextTrust`（[src/trust.ts](../src/trust.ts)），`./cordis` 不重复导出它。

服务实现登记面的三个操作，参数与结果直接复用原契约。它逐签名投影来源登记表 `ContextSourceRegistry` 的 `register` 与 `replace`，登记挂在调用者的 fiber 上；`assembly(target)` 返回绑定策略与该目标当前登记的来源集合的操作组，目标没有登记或服务已撤除时操作返回不可用（来源登记）。每次托管操作从登记面现取贡献，替换第四组读口给出的贡献；目标作用域与组装上下文、历史依据不一致时返回无效。类型不提供运行时登记表、缓存或默认策略。

策略配置分开指定压缩和表示实现及其可序列化参数。提供者负责选择实现、用原契约的 Standard Schema 校验参数和管理生命周期。

### 测试导出

`./testing`（[src/testing/index.ts](../src/testing/index.ts)，单文件，因为只有已声明的入口可以导入其他包的 testing 子入口）导出 createScriptedRequestContextTrust 与类型 RequestContextTrustScript，以及 requestContextTrustConformance 与类型 RequestContextTrustFixture、RequestContextTrustCase。它不属于生产导出，根入口不转导出它。

[导出清单](../tests/fixtures/exports.json) 由共享工具核对声明、产物、导航与模块增补。[Cordis 探针](../tests/cordis-entry.spec.ts) 使用测试提供者验证真实 Cordis 4.0.4 的配置和生命周期；它不代替生产提供者验收。
