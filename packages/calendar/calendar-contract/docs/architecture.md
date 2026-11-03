# 成员架构

## 模块与依赖

[calculation.ts](../src/calculation.ts)定义 LocalDate、snapshot、CalculationBasis、五类计算输入和判别结果。[queries.ts](../src/queries.ts)定义可信上下文、分页、版本选择、查询服务和错误。[supply.ts](../src/supply.ts)定义维护输入、完整操作地址、健康与种子封套。根入口聚合三者，不导入实现或 Cordis。

成员关系见[组架构](../../docs/architecture.md)，公共服务 DTO 与本机工厂配置分开。

## 关键机制与理由

类型由公开 schema 派生，消费者不另写平行 DTO。严格对象在输入边界拒绝未知字段。snapshot 的连续覆盖、不可变版本、原文与规范内容摘要含义由业务契约约束；结构合法不代表来源可靠或当前有权。

## 验证与维护

持续资源见[测试](../tests/README.md)。公开形状修改时同步真实消费者，行为修改回 [SPEC](../SPEC.md)。本域验证、独立接受和 M2 后真实跨域装配分别取证。
