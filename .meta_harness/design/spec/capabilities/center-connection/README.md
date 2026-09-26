# 中心连接

**据点上关于「这个据点所属的[治理中心](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-governance-center--治理中心--governance-center)此刻在不在应答」的观察**：三态可达性、进入这一态的时刻、这一次在场里再连上过几次；
本能力自己探、自己重连，**可达性怎么变都不使它撤除或替换**——中心问不到不是让[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上任何在途工作停下的理由。

**这是一份窄口**：只收据点上已列出的消费者要的观察面（据点验收装配里的 `centerConnection` 替身）。**它不拥有**经这条连接向中心发请求（入口组合 v2 的据点客户端，下一程）、
中心标识的比较（PF-016 那一程）、可达性变化的推送（交付面呈现契约，未立）。**依赖方向是单向的：本契约 → 入口组合、传输绑定、时间点。**

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.center-connection, 1)`
- **状态**：`candidate`（2026-09-25 起草，未经独立评审；同日「公开面」修订波原地改，见[修订波](verification.md#修订波2026-09-25-公开面)）——未接受、未冻结
- **catalog 映射**：已登记为 candidate。`family=capabilities`、`topic=center-connection`、
  `contract_path=spec/capabilities/center-connection/v1/contract.md`，`resources` 另含 `v1/examples.md`；
  依赖三项，消费 clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)：
  `composition.governance-center-entry` v1、`composition.governance-center-entry-https-json` v1、`data.offer-expiry` v1
- **formal-tasks 映射**：无——本版不建 TLA+／Alloy，理由见[契约 S-12](v1/contract.md#s-12-本版选用哪些形式工件)
- **提供者／装配映射**：尚无节点（主线另立）。服务键候选名 `centerConnection`（各消费者节点已用）。
  **最小提供者的形态**（本程施工简报定；接口契约 ＋ 最小提供者取代验收替身见 [D-043 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）：**按脚本模拟**——从测试种子读一段对端行为，按它回放可达性；满足[契约 S-5](v1/contract.md#s-5-可达性三态) 不变量的回放都合法，
  断线与重连不以本能力的撤除或替换表达（[S-7](v1/contract.md#s-7-在场不随可达性变)）。真提供者（经真实连接探中心）随入口组合 v2 那一程（[G-1](v1/contract.md#八已知缺口)）

## 准入核对

- **独立责任**：「中心在不在应答」是据点一侧的一份观察，它的变化原因（网络、中心进程起落）与据点上任何一个消费者都不同；它必须**活得比断线长**（[S-7](v1/contract.md#s-7-在场不随可达性变)），这一条放进任何一个消费者里都会让那个消费者的撤除规则跟着连接走。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：三份都已接受——依赖改动时本契约须重核。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 可达性在断线、重连、各种答复下怎样变 | [规范实例](v1/examples.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v1/contract.md#八已知缺口) |

## 版本包

`v1/` 是候选版本目录。发布（接受并冻结）之后规范正文与实例不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。
