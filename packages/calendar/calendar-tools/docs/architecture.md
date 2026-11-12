# 成员架构

## 模块与依赖

[protocol.ts](../src/protocol.ts)组合 Calendar 请求/结果 schema；[environment.ts](../src/environment.ts)从 CallAccess 取得可信 CalendarCallContext；[author.ts](../src/author.ts)声明工具、执行查询并编码完整结果；[cordis.ts](../src/cordis.ts)接入现行 Tool 贡献。依赖 Calendar 定义与 Tool 公开作者协议，不导入 calendar 实现或 calendar-local。

成员关系见[组架构](../../docs/architecture.md)，公共服务 DTO 与本机工厂配置分开。

## 关键机制与理由

模型参数只描述动作与查询，不能携带 tenant/actor/authContext。可信环境沿底层 prepare/inspectPreparation 取得上下文，release/inspectRelease 仍委托原环境。Tool 协议拥有贡献、调用、结果保管和 offload，Calendar 不建设第二套详情存储。

## 验证与维护

持续资源见[测试](../tests/README.md)。公开形状修改时同步真实消费者，行为修改回 [SPEC](../SPEC.md)。本域验证、独立接受和 M2 后真实跨域装配分别取证。
