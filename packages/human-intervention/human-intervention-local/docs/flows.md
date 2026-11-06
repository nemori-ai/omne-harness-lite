# 关键流程

## 提交与封口

业务提交先以 consume 参与原 SQL 事务，再运行真实业务参与者。事务成功后终态与业务结果一起可见；失败一起回滚。seal 则竞争同一原操作身份，已有提交保留 committed，尚未提交写入 aborted。

## 未知结果

客户端未收到提交回执时，保留 OperationRef 和 inputDigest。inspect 读取当前终态；absent 不能证明未提交。需要证明操作不会再提交时调用 seal，随后按原 SQL 操作日志认回完整业务结果。存储不可用时继续保留未知，不换 operationId 重发。
