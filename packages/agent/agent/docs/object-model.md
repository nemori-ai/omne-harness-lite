# Agent 实现对象

对象的身份、构造、状态、合法转换、所有者以及销毁或保留条件，由[纯契约的对象模型](../../agent-contract/docs/object-model.md)唯一拥有。公开值、句柄及提供者端口由 [纯契约](../../agent-contract/README.md) 拥有。工厂私有状态与构造参数不能反向成为领域外的必装依赖。

## 构造对象

`AgentRuntimeBinding` 固定实例身份、租户、安全作用域和精确采用。`AgentConfiguration` 是可序列化配置。`AgentDependencies` 聚合注入能力。具体形状、依赖逐项分类和配置项只在 [工厂入口](public-api.md) 维护。公开操作接口由工厂返回，业务身份仍通过每次调用显式提供。

## 状态拥有者

运行机制见 [内部设计](architecture/mechanisms.md)。持久事实与临时执行对象分别管理。状态机、身份和失败协议由公共契约约束，不能通过拆包新建第二个事实拥有者。
