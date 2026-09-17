# 租户治理

租户身份、账号与租户的成员关系、成员资格判定，以及**作用域层次的结构定义**。

- 契约坐标：`omne-harness-lite-design-2026-09-15` · `capability.tenant-governance` · `v1`
- 版本与采用状态：**candidate**，尚无接受决定
- catalog 映射：`capabilities/tenant-governance`，**无依赖**
- 提供者映射：[realization/packages/tenant-governance](../../../realization/packages/tenant-governance/design.md)（设计完成，未实现）

## 准入核对

独立责任成立：组织管理规则是独立变化原因，消费者是所有租户范围对象。

**它不是访问控制的执行点**——它回答「这个账号在这个租户有没有成员资格」，
由各对象 owner 在自己的访问点上调用并据此拒绝。

零依赖是有意的：成员关系只消费账号身份的**值**，不需要账号能力在线，
认证提供者故障因此不影响成员资格查询。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1/contract.md](v1/contract.md) |
| 哪些条款有证据、哪些仍缺 | [verification.md](verification.md) |
| 组织上下文怎样影响协作 | [PF-001 设计投影 v1](../../../requirements/product/PF-001-tenant-organization-context/design/v1/projection.md) |
