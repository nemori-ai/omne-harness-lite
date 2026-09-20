# 账号身份

自然人产品身份的产生、验证与登录态管理。对消费者承诺：给出的账号身份唯一、已通过验证、
且可追到一次仍然有效的登录。

- 契约坐标：`omne-harness-lite-design-2026-09-15` · `capability.account-identity` · `v1`
- 版本与采用状态：**candidate**，尚无接受决定
- catalog 映射：`capabilities/account-identity`，无依赖
- 提供者映射：[realization/packages/account-identity](../../../realization/packages/account-identity/design.md)（设计完成，未实现）

## 准入核对

独立责任成立：认证方式换代是独立变化原因，消费者是所有需验明身份的能力。
它**不拥有**租户与成员关系——账号身份先于租户存在，两者无依赖。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1/contract.md](v1/contract.md) |
| 哪些条款有证据、哪些仍缺 | [verification.md](verification.md) |
| 这条能力服务于什么产品判断 | [PF-001 产品设计](../../../product/PF-001-identity-scope-and-agent-constraints/design.md) |
