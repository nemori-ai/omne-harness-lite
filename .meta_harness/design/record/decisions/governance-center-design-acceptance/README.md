# D-028：接受治理中心交付面这一程的设计链

产品负责人 2026-09-23 把治理中心交付面（PF-017）这一程 harness design 的**全部产物**翻为正式接受：
入口契约 v1、账号能力契约 v2、能力边界选择（入口层独立 fiber，候选 A）、六个 realization 节点的设计与修订。
**接受的是设计，不是实现**——入口层的源码一行都还没有，其余节点的本程修订也尚未落到源码。

- **输入与下游**：来源提案是 [`proposals/governance-center-entry`](../../proposals/governance-center-entry/README.md)（入口层落在哪、四候选裁 A；
  [两次 architecture-reviewer 评审](../../proposals/governance-center-entry/review.md)）；被接受的对象在 [`spec/`](../../../spec/README.md#当前状态) 与
  [`realization/`](../../../realization/README.md)。下游是 [registry](../../../registry/README.md) 的状态翻转与冻结（本决定落地时同步完成），
  以及据 [PF-017 投影 v1](../../../product/PF-017-governance-center-as-deployable-application/projection/README.md) 与
  [PF-001 投影 v2](../../../product/PF-001-identity-scope-and-agent-constraints/projection/README.md) 派发的实施。
- **范围定位**：只解决「这批设计是不是有权者接受的精确对象」。
  **不解决**：实现与验证（归 realization 的实际证据）、传输绑定与防冒充手段（入口契约 G-10／G-11，owner 入口层节点，实施前闭合）、
  升级整体性的契约家（G-12）、各契约「已知缺口」表里仍开着的产品与架构问题。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 的设计会话中裁定，原话「入口契约、账号能力、能力设计点都接受」，并对四件待定项逐一选择；**摘录见[决定正文](decision.md)** |
| 精确修订 | HUB 分支 `panqiwei/tenancy-leg-2` 的落地提交（见决定正文「实际接受依据」）；契约资源逐文件 SHA-256 登记在 [`registry/frozen.json`](../../../registry/README.md) |
| 接受范围 | 四类对象，逐项写在[决定正文](decision.md#选择与范围)的范围表里；**契约条款全部接受，含各自「已知缺口」表——接受的是缺口以显式缺口存在，不是替它们填值** |
| 保留前提 | 见正文「理由与保留前提」：PF-017 rev 2、PF-001 rev 16、PF-016 rev 3 不变；单机部署字面读法；D-027 的持久性边界按 PF-017 rev 2 的写法；Cordis 4.0.4 |
| 取代关系 | 不取代任何决定。[D-023](../tenant-domain-design-acceptance/README.md) 接受的账号能力 v1 仍有效，v2 不自动升级消费者——入口契约钉 v2，注册组合与治理契约仍钉 v1 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么现在接受、四件待定项各选了什么、**不表示**什么 | [决定正文](decision.md) |
| 两份契约的精确坐标与冻结哈希 | [registry](../../../registry/README.md)：`catalog.json` 的 `acceptance` 指向本包 [`acceptance.json`](acceptance.json) |
| 实施从哪进 | [PF-017 投影 v1](../../../product/PF-017-governance-center-as-deployable-application/projection/README.md)、[PF-001 投影 v2](../../../product/PF-001-identity-scope-and-agent-constraints/projection/README.md) |
| 入口层为什么是独立 fiber、什么证据会翻盘 | [`proposals/governance-center-entry`](../../proposals/governance-center-entry/alternatives.md) |

返回[决定](../README.md)。
