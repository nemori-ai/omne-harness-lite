# 账号注册组合

账号身份与个人租户的联合创建。它拥有一件单项能力无法独自拥有的事：
**注册成功是两侧的联合结果**，而两侧分属不同 owner。

- 契约坐标：`omne-harness-lite-design-2026-09-15` · `composition.account-registration` · `v1`
- 版本与采用状态：**candidate**，尚无接受决定
- 依赖：`capability.account-identity` v1（S-3/S-4/S-9）、`capability.tenant-governance` v1（S-1）
- 提供者映射：[realization/packages/account-registration](../../../realization/packages/account-registration/design.md)

## 准入核对

组合责任成立：需求把注册成功写成不可分的产品结果，但两侧责任归属层不同，
且需求未规定不一致时哪侧权威。本契约以**激活为单一提交点**取消不一致的可能，
而不是在两侧之间选一个权威。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1/contract.md](v1/contract.md) |
| 形式模型与检查配置 | [v1/formal/README.md](v1/formal/README.md) |
| 哪些条款有证据 | [verification.md](verification.md) |
| 实施者要怎么做 | [PF-026 设计投影 v1](../../../requirements/product/PF-026-account-journey-and-isolation/design/v1/projection.md) |
