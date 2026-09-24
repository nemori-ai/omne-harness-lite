# 模态投影与模态转换

**一个会话此刻挡哪几种模态，以及一个读不懂的块怎样在落盘之前被配上兜底。**
两件事共用同一个事实——**一个块有没有 [transcript](../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript)**：
转换那一半在「消息落盘之前」决定它，[模态投影](../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)那一半在落盘之后读它，再由合法目标拿去判一份[模型档案](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile)能不能用。

> **契约身份 `modality-projection` 沿用起草时的名字，它拥有两件事：投影判定 ＋ 转换件**——[模态投影](../../../ubiquitous_language/terms/record-and-context.md#ul-modality-projection--模态投影--modality-projection)与兼容判定，以及[模态转换件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)的键、登记表（整份声明 `declareConverters`、查登记 `lookupConverter`）与一次转换（主线裁定，见 [D-040 §S17 S17-h](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s17modality-projection报回的)：改名收益不够）。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.modality-projection, 1)`
- **状态**：`candidate`（2026-09-23 起草；2026-09-24 经第一轮独立评审并按处置修订；2026-09-25 修复波 2 按第二轮独立复评原地改，处置见[验证入口](verification.md#独立评审)），**未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=modality-projection`、
  `contract_path=spec/capabilities/modality-projection/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖五项（`data.content-blocks` v1、`data.messages` v1、`data.model-profile` v1、`data.loop-extension` v1、`data.identity-values` v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：无——本版不建形式工件，理由在[契约 S-29](v1/contract.md#s-29-本版选用哪些形式工件)
- **提供者/装配映射**：尚无。投影的缓存与读路径归 `capability.model-request-runtime` 的提供者；转换件的实现与登记归系统装配层

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。「有没有 transcript」这一个事实，写它的规则（键、登记、合法产出、全有或全无）与读它的规则（投影、兼容）必须出自同一处——分开写，就会出现「转换那边以为兜住了、投影这边照样挡」或反过来 |
| 为什么是 capability 而不是 data | 它有操作、有失败集合，还有一条**会被否决的动作链**（落盘之前转不成就不落盘）；这些是 data 契约没有的 |
| 为什么不并进模型请求运行时 | 转换跑在「消息落盘之前」，那一刻可以没有运行、没有 agent runtime；变化原因（新的媒体类型、转换件契约）与「发出一次调用」无关。投影判定本身是纯函数，放在这里与转换共用定义，**缓存与读路径**才归运行时 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 五份数据契约；不依赖任何能力契约 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 投影到底计哪些块 | [契约 S-5](v1/contract.md#s-5-模态投影是对会话日志的一次折叠) |
| 投影怎么才能增量维护而不成第二份权威 | [契约 S-6](v1/contract.md#s-6-只增不减可以逐条并进去重算必得同一答案) |
| 「没登记」与「登记了但不可用」为什么收场不同 | [契约 S-9](v1/contract.md#s-9-登记表同键一件登记是系统装配层的声明)、[S-21](v1/contract.md#s-21-转换件不可用即转换失败) |
| 一个文件块两个键都命中时听谁的 | [契约 S-10](v1/contract.md#s-10-一个块落在哪个键上) |
| 五个操作各自的前置、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 一条消息在落盘之前被怎么转 | [契约 S-20](v1/contract.md#s-20-一条消息在落盘之前的转换全有或全无) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-26](v1/contract.md#s-26-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个结果的实例 | [examples](v1/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 我是消费者，我要的面在不在 | [契约第十二节](v1/contract.md#十二消费者核对) |
| 哪些事还没人裁 | [契约第十一节](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份组合契约，值类型引用 `data.content-blocks`、`data.model-profile`、`data.identity-values`。
**不建 `formal/`**：投影与兼容是纯函数，它们的代数定律用性质测试比有限状态穷举更直接；登记表的「替换不经过没登记」按构造成立，风险在实现，只有真跑并发看得见。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
