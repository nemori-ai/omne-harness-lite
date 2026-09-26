# 组织治理

组织、成员、租户角色、邀约、隶属及当前租户身份的承诺由本能力拥有。账号及登录状态由 account-identity 拥有；精确依赖、资源和采用范围以 [catalog](../../../registry/README.md) 为准。

| 版本 | 承诺与采用者 | 接受依据 |
| --- | --- | --- |
| [v1](v1/contract.md) | 原组织治理、成员/隶属及选择规则，消费 AI1/OE1；旧注册与旧入口按各自版本继续消费 | [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) |
| [v2](v2/contract.md) | draft 的接收方拒绝与显式共同参与，消费 AI3/OE2；当前治理实现、AR2、EC2/EC3 及其运输/客户端保持此坐标 | [D-042](../../../record/decisions/governance-participation-provider/decision.md)；有限登录与邀约依据 [D-040](../../../record/decisions/governance-identity-offer-contracts/decision.md) |
| [v3](v3/contract.md) | #9 原 v2 的行政迁移：成员关系生效时刻、隶属建立时刻及资产分享不复活，仍消费 AI1/OE1；资产转移 v2 钉它，相关提供者尚未实施 | 原语义 [D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)，新坐标 [D-066](../../../record/decisions/pr9-pr10-coordinate-reconciliation/decision.md) |

**v3 不是 v2 的功能超集。** 数字后移不升级任何当前治理消费者，不表示当前治理实现已经写入或读取两个时刻。原 #9 v2 的字节及上下文保存在 D-066 的固定 main 快照中，不能用当前 draft v2 解释那份历史接受。

## 版本包

三份版本均 accepted 并冻结。v1 有 Membership/Affiliation 模型，v2 的规范工件按自身资源清单登记；v3 只发布正文，沿用 v1 模型，新增时刻性质由其 [S-45](v3/contract.md#s-45-本版选用哪些形式工件) 和 [S-61](v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出) 的有界场景及前提表达。旧模型没有证明真实 SQL 的共同参与、登录活动或时刻严格递增。

- [v3 与 v1 的条款差异及消费者规则](v3/contract.md#十三版本差异与规范工件)
- [验证义务与原证据](verification.md)
- [提供者设计及实现状态](../../../realization/packages/tenancy/organization-governance/README.md)

接受、实现及验证分别读取；后续规范变化发新版本。返回 [能力契约](../README.md)。
