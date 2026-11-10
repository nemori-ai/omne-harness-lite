# 关键流程

## 流程

材料安装、普通应用服务和Cordis生命周期已实现。生产声明发行、current事实及跨域消费者仍待组合。

```mermaid
sequenceDiagram
  participant A as 装配者
  participant M as 材料工厂
  participant S as SqlStorage
  participant W as SQLite Worker
  A->>M: governanceSqlMigrations
  M-->>A: 固定模块和摘要
  A->>S: 材料目录与组合
  S->>W: 安装拥有者迁移
  W->>W: 建表与索引并verify
  W-->>S: 迁移结果
```

## 失败与生命周期

材料文件缺失不能静默变成空迁移。数据库约束失败使所在事务失败。重开读取同一数据库不重新创建已有关系；迁移的版本与摘要由 SqlStorage 认回。unknown、seal、reserve及fiber卸载由应用协调器与生命周期控制负责，迁移测试不证明这些行为。

## 登记、撤除与恢复事务

生产写者已经由普通应用协调器消费。低层操作测试保留具名夹具；应用与Cordis测试使用真实Identity和SQLite，声明/current仍为具名来源夹具。

```mermaid
sequenceDiagram
  participant C as 受信协调器
  participant O as 原操作写者
  participant B as 业务写者
  C->>O: 受理原命令
  O-->>C: 保存的原身份
  C->>O: 固定执行内容
  C->>B: 按原内容执行
  B->>B: 核对终态、epoch和业务约束
  B->>O: 同事务保存效果及原结果
  Note over O,B: 下游失败时全部回滚
  C->>O: 重启后按原身份认回
```

封口在业务之前成立时，迟到执行只返回 aborted。业务先成立时，封口认回 committed。换 epoch 隔离新业务，不删除旧操作结果。Identity reserve、settle和可信目的地恢复已接入应用协调器；完整生产来源和跨域消费仍待验收。
