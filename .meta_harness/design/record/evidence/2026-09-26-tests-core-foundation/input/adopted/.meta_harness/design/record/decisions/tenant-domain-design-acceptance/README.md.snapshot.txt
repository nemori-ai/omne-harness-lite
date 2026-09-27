# D-023：接受租户领域的设计链

产品负责人 2026-09-22 把租户领域这一程 harness design 的**全部产物**翻为正式接受：
五份契约 v1、能力拆分与共用数据契约的合并裁定、六个 provider 节点的设计、PF-001 的设计投影 v1。
**接受的是设计，不是实现**——源码一行都还没有。

- **输入与下游**：来源提案是 [`proposals/tenant-capability-split`](../../proposals/tenant-capability-split/README.md)（五份边界怎么切）与
  [`proposals/identity-values-v1`](../../proposals/identity-values-v1/README.md)（共用数据契约三份合并）；
  被接受的对象在 [`spec/`](../../../spec/README.md#当前状态)、[`realization/packages/`](../../../realization/README.md#当前主题)
  与 [PF-001 的投影目录](../../../product/PF-001-identity-scope-and-agent-constraints/projection/README.md)。
  下游是 [registry](../../../registry/README.md) 的状态翻转与冻结（本决定落地时同步完成），以及据投影 v1 派发的实施。
- **范围定位**：只解决「这批设计是不是有权者接受的精确对象」。
  **不解决**：实现（归 realization 的实际验证）、装配（归应用节点）、Cordis 采用版本、`tenancy` 这个名字、各契约「已知缺口」表里仍开着的产品问题。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）。契约接受与设计采用是产品负责人对本设计链的裁决权 |
| 接受记录 | 2026-09-22 的设计会话中裁定，原话「租户领域这块的全部 harness design 都翻为正式接受」；**摘录见[决定正文](decision.md)** |
| 精确修订 | 主检出 `main` 提交 `a6e490a`（2026-09-22）；其中 `spec/` 与两份提案最后改于 `677d910`，六个节点 `affa4af`，投影 `c61f333`。契约资源逐文件 SHA-256 登记在 [`registry/frozen.json`](../../../registry/README.md) |
| 接受范围 | 四类对象，逐项写在[决定正文](decision.md#选择与范围)的范围表里；**契约条款全部接受，含各自「已知缺口」表——接受的是缺口以显式缺口存在，不是替它们填值** |
| 保留前提 | 见正文「理由与保留前提」：PF-001 rev 15 不变；语义再改出 v2；单机部署字面读法；Cordis 手册基线 4.0.2 |
| 取代关系 | 不取代任何决定。[D-022](../cli-tui-delivery-form/README.md) 当日写的「不表示接受任何契约」是那条决定的范围声明，不被本决定改写 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么现在接受、**不表示**什么 | [决定正文](decision.md) |
| 五份契约的精确坐标与冻结哈希 | [registry](../../../registry/README.md)：`catalog.json` 的 `acceptance` 指向本包 [`acceptance.json`](acceptance.json) |
| 实施从哪进 | [PF-001 投影 v1](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md) |
| 拆分为什么是五份、什么证据会翻盘 | [`proposals/tenant-capability-split`](../../proposals/tenant-capability-split/alternatives.md) |

返回[决定](../README.md)。
