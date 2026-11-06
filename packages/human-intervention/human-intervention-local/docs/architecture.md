# 内部架构

## 模块与依赖

公共模型来自 human-intervention。单机模块消费 sql-contract/worker，实际装配注入 SqlStorage。Node crypto 和 canonicalize 计算稳定身份，Zod 解析输入与持久记录。本成员不导入 Session、Agent、Tool 或 Cordis。

```mermaid
flowchart LR
  A[可信装配] --> C[commands 生成具名命令]
  C --> SQL[注入 SqlStorage]
  subgraph TX[同一事务及事实依赖]
    T[terminal] --> W[独立 WaitOwner control]
    T --> P[HITL request-plan 只读]
    W --> P
    P --> I[独立 WaitOwner inbox]
    P --> R[HITL request-write]
    I --> R
  end
  SQL --> T
  O[operations inspect / seal] --> SQL
  O --> Q[原操作完整日志]
  G[当前 Identity 资格与 reservation] -. 待接应用服务 .-> C
```

## 关键机制与理由

terminal-participant 与业务参与者处于同一事务。请求规划者读取本域状态并消费 WaitOwner 提供的事实，原拥有者接纳计划后，请求写者才持久化。这个依赖图没有循环，每张表只有一个写者。组合缺少事实提供者时 SQL 在接受前拒绝，不靠运行时空适配补齐。

control 拥有准备材料、接收代次、业务终局和消费 checkpoint。inbox 拥有 active 关联及决定收件箱。两者是同一独立 WaitOwner 内的状态职责。HITL 只拥有请求、卡片及其披露所需数据。Session/Tool/Agent 原等待将通过同一事实协议接入，不复制独立等待的生命周期。

操作身份包含租户、actor 与 operationId。method 和规范化输入进入摘要，不进入唯一键。SQL 原操作日志保存完整结果，hi_terminals 仅记录提交或封口。operations 在读回时验证方法与结果的对应关系，不能从终态位推断业务成功。

## 验证与维护

[终态测试](../tests/terminals.spec.ts)与[请求恢复测试](../tests/requests.spec.ts)运行真实 SQLite worker。测试覆盖晚失败共同回滚、竞争答复、重启、代次隔离和批次屏障。当前还没有公开应用服务的 Identity 资格协调与池分页。该实现不能替代完整 C2 独立验收。行为承诺归[规格](../SPEC.md)。
