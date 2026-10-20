# Session 实现对象

公开值、句柄及提供者端口由 [纯契约](../../session-contract/README.md) 拥有。工厂私有状态与构造参数不能反向成为领域外的必装依赖。

## 构造对象

`SessionDependencies` 聚合注入能力，`SessionConfiguration` 是静态配置；具体形状只在 [工厂入口](public-api.md) 维护。公开操作接口由工厂返回，业务身份仍通过每次调用显式提供。

## 状态拥有者

运行机制见 [内部设计](architecture/mechanisms.md)。持久事实与临时执行对象分别管理；状态机、身份和失败协议由公共契约约束，不能通过拆包新建第二个事实拥有者。
