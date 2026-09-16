# 产品账号身份与注册旅程

本提案比较 [PF-026](../../requirements/product/PF-026-account-journey-and-isolation/README.md) 的账号权威如何接到既有租户治理。候选 A 的架构路径已由 [D-016](../../decisions/account-identity/decision.md) 接受；具体 provider 及规格仍待设计与验证。

- 状态：三个候选的比较材料；候选 A 的能力边界和成熟嵌入式 provider 优先验证方向已接受。用户另确认首版自助注册与用户名密码加可撤销会话；具体库及 provider 采用未定。
- 输入基线：PF-026 的用户直接确认；`data.core-work@1` CD-01/02、`capability.tenant-governance@1` TG-01/02 均为迁移候选；PF-019 为正式产品要求；[官方来源研究](../../research/account-auth-sources/README.md)取证于 2026-09-16。
- 范围：同部署多账号的注册、登录、退出、个人范围交接及 CLI 当前账号呈现；永久关户/数据处置不在本次范围。

## 准入核对

选择对象是产品账号权威及认证机制的落点。[设计正文](design.md)列出现有能力的覆盖和剩余责任；[候选比较](alternatives.md)含三个实质不同的路径。账号与组织成员关系的区分由 PF-026 确认；用户随后选择了首版自助注册、用户名密码和可撤销会话。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现有能力、残余责任、动作链及 Cordis 投影 | [设计正文](design.md) |
| 三候选、推荐和反例 | [候选与取舍](alternatives.md) |
| 已有审阅与受阻事项 | [评审记录](review.md) |

## 后续消费

接受范围与依据见 [D-016](../../decisions/account-identity/decision.md)。账号能力契约、注册与 Tenant 组合契约、CLI/认证 provider 设计及实施计划依次落实其未决义务；当前 `spec/catalog.json` 与实现尚未登记或兑现。J/I/C 的现有迁移交付可独立推进；PF-026 的实现就绪不能由本提案替代。
