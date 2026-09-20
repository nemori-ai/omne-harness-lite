# 核心工作协调 v1 符合性场景

这些场景固定候选契约的恢复发布和个人创建准入，不表示 provider 已通过。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| CC-S01 部分 owner 安装失败 | committed 批次只重建一部分 owner 或候选根校验失败；基线不安装、域不开放、原 operation 保持 committed_blocked | CC-03/06；恢复宿主故障注入 |
| CC-S02 旧代确认 | 旧 host/owner generation 在新 writer epoch 后迟到，不能推进新代水位或清除隔离 | CC-06；代际并发 |
| CC-S03 完整基线原子安装 | 同一完整 watermark 验证跨 owner 关系并一次安装全部 roots；读者只见安装前 blocked 或安装后完整基线 | CC-03/06；并发读取 |
| CC-S04 原操作恢复消费 | 原 completion 保持 blocked；新代 lookup 另报原位置被基线覆盖并可消费，operation/receipt/eventId 不变 | CC-06；查询/扫描 |
| CC-S05 不重复外部效果 | 原 attempt 是否 dispatch 未知时先核实，不直接执行或换操作 | CC-04/06；故障注入 |
| CC-S06 遗留 ExactUse 未收口 | 前缀和 roots 已重建，但旧资源责任未结算；域继续关闭 | CC-03/06；资源 owner 联合 |
| CC-S07 双入口准入 | init 缺已核实空根、本代资格或完整 F；signup 在 init active 前、只有 pending、客户端 DTO 或旧 session；均不得取得 T 新位置 | CC-02/03；Account/Tenant 联合 |
| CC-S08 F 直接读取与换代 | 当代门外读 F 后 Account 暂离线，本次准备仍可提交；host/owner/writer 换代须重读同 F，旧准备失效；F 同 ref 异内容封闭 | CC-03；当前代读取与故障注入 |
| CC-S09 同键和目标竞争 | 同 T/C 认回；T 同键异 C 冲突；不同 F 同 UserRef 争同 target 时第二 T 不能认回第一 T，unknown/not_seen 不开放新目标 | CC-03；并发/崩溃 |
| CC-S10 未提交后重备 | 完整前缀证明 T 未提交并安全解除占位后同 T/C 重备；否则保持 unknown/blocked | CC-03/06；writer 隔离 |
| CC-S11 历史与当前 | init/signup 原 T 认回历史结果，publication 新代证明与当前 Tenant business eligibility 分别查询，closing/closed 不恢复权限 | CC-03/06；owner 查询 |
