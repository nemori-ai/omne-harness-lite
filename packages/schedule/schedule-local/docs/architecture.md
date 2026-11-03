# 成员架构

本成员以本地机制兑现schedule核心端口。计算worker拥有线程生命周期；storage模块拥有管理持久化材料及SQL协议适配。application组合两者及管理、预测、查询；它拥有worker，借用storage。

成员关系归[组架构](../../docs/architecture.md)。公共服务协议与提供者构造依赖分开。本机句柄、工厂回调和SQL参加者不进入线上请求与回执。

```mermaid
flowchart LR
  App[Schedule应用] --> Worker[计算worker适配]
  Worker --> Pool[Piscina线程池]
  Pool --> Pure[纯规则枚举]
  App --> Store[管理store及persistence]
  Store --> Sql[SqlStorage公共协议]
  Sql --> Guard[具名权威守卫]
  Sql --> Own[本域参加者]
  Own --> Decision[纯管理决定]
  Own --> Tables[本域记录与outbox]
```

计算使用固定编译entry，取消终止任务，dispose等待真实退出。存储参与者在事务内重新决定，不复制状态机。schema集中校验守卫及持久结果；records保存变更，read和pagination处理一次快照中的可见集合。

scope由构造固定，业务owner及读取权限仍逐边界绑定。外部守卫的具体权威实现归各拥有者。当前测试夹具只证明本地消费协议，未形成生产跨域组合。Cordis绑定显式注入storage与Calendar，并按[生命周期](cordis.md)排空。后台扫描仍待后续实现。
