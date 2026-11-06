# 关键流程

## 提交与封口

业务提交先以 consume 参与原 SQL 事务，再运行真实业务参与者。事务成功后终态与业务结果一起可见；失败一起回滚。seal 则竞争同一原操作身份，已有提交保留 committed，尚未提交写入 aborted。

## 未知结果

客户端未收到提交回执时，保留 OperationRef 和 inputDigest。inspect 读取当前终态；absent 不能证明未提交。需要证明操作不会再提交时调用 seal，随后按原 SQL 操作日志认回完整业务结果。存储不可用时继续保留未知，不换 operationId 重发。

## 答复与恢复

原等待控制参与者核验来源、答复者与业务终局。请求规划者决定本次答复是否成立。WaitOwner 把成立的决定写入原收件箱，HITL 保存同一决定与完整结果。后续任一参与者失败会撤销整次写入。

live 等待的接收者通过 bindReceiver 取得新代次，再消费原收件箱。重启后读取原操作结果不会再次分配代次。live 等待的最后一张卡完成耐久消费后，批次才变为 resume-ready。实际执行仍须运行时重新取得名额与当前资格。

```mermaid
sequenceDiagram
  participant Caller as 调用者
  participant App as 独立应用
  participant Identity
  participant T as T 终态
  participant W as W 等待规划
  participant J as J 组合规划
  participant F as F WaitOwner
  participant H as H HITL
  participant Journal as SqlStorage journal
  Caller->>App: submitReply（原 OperationRef）
  App->>Identity: 校验并保留目的操作 reservation
  rect rgb(235,245,255)
    Note over T,H: 一个 SQL 提交；任一失败全部回滚
    App->>T: 绑定原操作
    T->>W: 终态事实
    W->>J: 当前等待与资格依据
    J->>F: 答复增量计划
    F->>H: inbox 与 pending 已共同写入的事实
    H-->>App: 卡片决定与原操作结果
  end
  App->>Identity: 依据目的端终态结算 reservation
  alt 提交回执未知
    App-->>Caller: unknown（保留原身份）
    Caller->>App: getOperation（原身份及摘要）
    App->>Identity: 核验当前主体与资格
    App->>T: 查询原终态
    T-->>App: committed / aborted / absent / unavailable
    App->>Journal: 按原 SQL 操作身份读取完整结果
    Journal-->>App: 原业务结果或仍未知
    App-->>Caller: 原结果或仍未知
  end
  Caller->>App: bindReceiver（live 等待）
  Note over App,F: 原代次 CAS，恢复提交使用 T/W/J/F
  Caller->>App: consumeDecision（当前代次和原决定）
  rect rgb(235,245,255)
    App->>T: 消费原操作
    T->>W: 当前代次及终局检查
    W->>J: 消费计划
    J->>F: 共同写 receipt/count/checkpoint，删除 pending
    F-->>App: accepted 或 superseded receipt
  end
  Note over App,F: 从未 bind 的 terminal 可按当前代次结算 superseded，不创建 receiver
  Caller->>App: acknowledgeDelivery（原 receipt）
  rect rgb(235,245,255)
    App->>T: 确认原操作
    T->>W: 核对原 owner 与 receipt
    W->>J: 接手确认依据
    J->>F: 等待计划确认
    F->>H: 写 accepted/superseded delivery 投影
    H-->>Caller: acknowledged
  end
  Note over Caller,H: 后续 Continue 与执行名额归实际运行时，本成员不执行
```

事务框中的 T/W/J/F/H 箭头表示参与者事实依赖，执行由 SqlStorage 调度。consume 与 acknowledge 是独立的原操作，均沿相同 Identity reservation 和未知结果认回规则。图中后两次提交省略重复的 reservation 箭头。ack 未完成时，F 已生成 receipt 的决定也已退出 pending。读取和确认不替代实际 Continue。
