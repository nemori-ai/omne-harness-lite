# Runtime Context 供给机制的流程

本页给出本成员的五条机制级流程。每条有一张时序图和一张「失败与责任交接」表。行为以 [SPEC](../SPEC.md) 为准，图只投影条款，不表示运行实现已经存在。

协议级流程归 [runtime-context-contract 的协议流程](../../runtime-context-contract/docs/flows.md)，本页的流程是它们在机制内部的展开。Cordis 装载、登记寿命与唤醒派发归 [runtime-context-cordis 的流程](../../runtime-context-cordis/docs/flows.md)。图中的「机制实例」是工厂的输出，内部的表见[内部架构](architecture.md#模块与依赖)。

## 流程

### F-RCI01 注册变更与步提交的核对和写入

协议流程：契约的 F-RC02 与 F-RC07。条款：[RC-02](../../runtime-context-contract/SPEC.md#rc-02-块声明注册与参数)、[RC-05](../../runtime-context-contract/SPEC.md#rc-05-状态块上下文更新与步提交)。

```mermaid
sequenceDiagram
  participant H as 作用域持有者
  participant M as 机制实例
  participant Reg as 注册表
  participant Proj as 当前投影
  participant Obs as 观察链
  H->>M: prepareRegistration(注册材料)
  M-->>H: 核对结果，不写表
  H->>H: 在本成员之外提交注册决定或步提交
  H->>M: applyCommit(已提交的结果，依据的注册修订)
  M->>Reg: 比较注册修订
  alt 依据的修订是当前修订
    M->>Reg: 写入注册，前进注册修订
    M->>Proj: 写入步提交的值（状态块）
    M->>Obs: 追加视图修订
  else 修订已变
    M-->>H: 拒绝，当前注册不变
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 核对 | 只给核对结果，表不变 | 核对失败带逐项原因，持有者修正材料后重新提交 |
| 持有者提交 | 提交在本成员之外完成 | 提交未知时由持有者按原提交身份查询，本成员不重建另一条注册 |
| 比较修订 | 依据的修订不是当前修订时拒绝 | 不用后写覆盖先写。持有者按当前注册重新提交 |
| 写入步提交 | `reduceStep` 的结果在 `applyCommit` 时写入投影 | 提交前不改投影。失败步里成功动作的更新由持有者处置，本成员不写入 |

### F-RCI02 发布与代际

协议流程：契约的 F-RC01 与 F-RC08。条款：[RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复)。

```mermaid
sequenceDiagram
  participant P as 生产者
  participant M as 机制实例
  participant PT as 生产者表
  participant Proj as 当前投影
  participant Obs as 观察链
  P->>M: registerProducer(块键, 代际)
  M->>PT: 记录生产者与代际
  P->>M: 发布(值, 代际)
  M->>PT: 比较代际
  alt 代际不小于当前代际
    M->>M: 按块声明的 schema 校验
    M->>Proj: 写入值，前进修订
    M->>Obs: 追加视图修订
  else 旧代际
    M->>M: 丢弃并记录诊断
  end
  P->>M: 使当前值失效
  M->>Obs: 只写一次唤醒，不前进修订
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 登记 | 生产者表记录当前代际 | 为没有块声明的块键登记被拒绝 |
| 旧代发布 | 丢弃，投影与修订不变，有诊断 | 旧代不能覆盖新代的值 |
| 值不合 schema | 发布被拒绝，当前值与修订不变 | 不存成「内容无法解释」 |
| 使失效 | 读者被唤醒，修订不变 | 读者读到什么以读取时的值为准 |
| `dispose` | 等本代在途读取结算后撤除 | 在途读取用撤除前的值与修订。撤除后依赖该块的读取读到缺项 |

### F-RCI03 读取：核资格、翻译、缺项

协议流程：契约的 F-RC03 与 F-RC05。条款：[RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项)、[RC-06](../../runtime-context-contract/SPEC.md#rc-06-需要绑定与读者形状)。

```mermaid
sequenceDiagram
  participant R as 绑定读者
  participant M as 机制实例
  participant Reg as 注册表
  participant Proj as 当前投影
  R->>M: read(需要) 或 snapshot()
  M->>M: 核资格：作用域、消费者类、允许的键、注册修订
  M->>Reg: 取当前注册与需要绑定
  M->>Proj: 本作用域查找，没有再查父作用域
  alt 有当前值
    M->>M: 按绑定执行翻译
    M-->>R: 消费者形状的值与来源修订
  else 必需块无值
    M-->>R: 缺项，带块键
  else 可选块无值
    M-->>R: 该项标「无值」，读取成功
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 核资格 | 资格有效时继续 | 资格撤销后返回拒绝（无权）。撤权前已返回的值不收回 |
| 注册修订落后 | 按当前注册读取，结果带签发时与当前的两个修订 | 持有者判断是否重新签发资格 |
| 作用域链查找 | 同键读到子级值，子级无值时读到父级值 | 成本与链长成正比 |
| 翻译 | 读者拿到自己的形状 | 翻译抛出时返回缺项，带来源修订，没有部分结果 |
| 缺项与「无值」 | 都不是失败；「无值」只用于可选需要 | 依赖它的动作按自己的契约处置。本成员不用空值或旧值填充 |

### F-RCI04 `changes` 与游标作废

协议流程：契约的 F-RC04。条款：[RC-04](../../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)。

```mermaid
sequenceDiagram
  participant R as 绑定读者
  participant M as 机制实例
  participant Obs as 观察链
  R->>M: changes(游标)
  M->>M: 核资格
  M->>Obs: 定位游标
  alt 游标有效且在保留范围内
    Obs-->>R: 游标之后的变化与新游标
  else 游标早于保留下界、授权范围变化、生产者换代或进程重建
    M-->>R: 游标作废，需要重取
    R->>M: snapshot()
    M-->>R: 完整快照、视图修订与新游标
  end
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 游标有效 | 只返回读者资格允许的变化 | `per-request` 块不在观察链里，所以不在变化里 |
| 超过保留上限 | 最老的变化被丢弃 | 持有旧游标的读者得到游标作废，不得到残缺的增量 |
| 游标作废 | 读者重取完整快照 | 调用方不需要自己判断是哪种情形 |
| 变化材料 | 只为模型可读块生成，前值按读者资格过滤 | 本成员不保存变化材料。写成提醒归持有者 |

### F-RCI05 关闭与重建

条款：[SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期)、[IC-19](../../../../docs/architecture/cordis-integration-conventions.md#ic-19)。

```mermaid
sequenceDiagram
  participant C as 关闭方
  participant M as 机制实例
  participant H as 作用域持有者
  participant P as 生产者
  participant R as 读者
  C->>M: 关闭实例
  M->>M: 拒绝新的注册与登记
  M->>M: 使全部绑定读者结束
  M->>M: 等在途读取结算
  M->>M: 释放四张表
  Note over M: 进程崩溃时没有这些步骤，表随进程丢失
  H->>M: 新实例：重新注册，重新签发资格
  P->>M: 重新登记并发布
  R->>M: 重新 bind，取完整快照
```

| 环节 | 结果 | 失败与责任交接 |
| --- | --- | --- |
| 关闭后的新请求 | 拒绝（服务已关闭） | 调用方改用新实例 |
| 关闭时在途读取 | 先结算，结算后返回关闭前的值与修订 | 关闭后到达的读取返回拒绝（服务已关闭） |
| 已交出的变化材料与外部效果 | 不撤回 | 外部效果的拥有者 |
| 重建 | 按持有者、生产者、读者的顺序重建 | `persisted` 供给块在生产者重新发布之前读到缺项。本成员不用旧值填充 |

## 失败与生命周期

| 情形 | 结果 | 责任方 | 依据 |
| --- | --- | --- | --- |
| 注册修订落后的变更 | 拒绝，当前注册不变 | 持有者重新提交 | [RC-02](../../runtime-context-contract/SPEC.md#rc-02-块声明注册与参数) |
| 旧代发布 | 丢弃，有诊断 | 生产者 | [RC-07](../../runtime-context-contract/SPEC.md#rc-07-生产者句柄并发撤除与恢复) |
| 撤权后的读取 | 拒绝（无权），已返回的值不收回 | 持有者 | [RC-03](../../runtime-context-contract/SPEC.md#rc-03-当前读取资格与缺项) |
| 翻译抛出 | 缺项，带来源修订 | 集成方修正翻译 | [RC-06](../../runtime-context-contract/SPEC.md#rc-06-需要绑定与读者形状) |
| 游标落后或作废 | 要求重取完整快照 | 读者的调用方 | [RC-04](../../runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料) |
| 进程失败 | 四张表丢失 | 持有者与生产者重建 | [SPEC 所有权、失败与生命周期](../SPEC.md#所有权失败与生命周期) |

各内部对象的创建与结束见[对象模型](object-model.md#生命周期)。
