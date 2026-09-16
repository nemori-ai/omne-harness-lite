# 产品账号身份与注册旅程

本提案比较 [PF-026](../../requirements/product/PF-026-account-journey-and-isolation/README.md) 的账号权威如何接到既有租户治理。推荐独立账号身份能力，凭据和会话由成熟嵌入式 provider 承接；**推荐不等于接受**。

- 状态：完整候选，待独立架构评审与产品准入政策选择；无决定、规格或 provider 采用。
- 输入基线：PF-026 的用户直接确认；`data.core-work@1` CD-01/02、`capability.tenant-governance@1` TG-01/02 均为迁移候选；PF-019 为正式产品要求；[官方来源研究](../../research/account-auth-sources/README.md)取证于 2026-09-16。
- 范围：同部署多账号的注册、登录、退出、个人范围交接及 CLI 当前账号呈现；永久关户/数据处置不在本次范围。

## 准入核对

选择对象是产品账号权威及认证机制的落点。[设计正文](design.md)列出现有能力的覆盖和剩余责任；[候选比较](alternatives.md)含三个实质不同的路径。账号与组织成员关系的区分已经由 PF-026 确认；开放注册还是邀请/管理员准入未获选择。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现有能力、残余责任、动作链及 Cordis 投影 | [设计正文](design.md) |
| 三候选、推荐和反例 | [候选与取舍](alternatives.md) |
| 已有审阅与受阻事项 | [评审记录](review.md) |

## 后续消费

接受后才可编写账号能力契约、注册与 Tenant 组合契约、CLI/认证 provider 设计及实施计划。`spec/catalog.json` 与当前实现均未登记本提案为采用状态。J/I/C 的现有迁移交付可独立推进；PF-026 的实现就绪不能由本提案替代。
