# 核心工作协调 v1 符合性场景

这些场景固定 [contract](contract.md) 的 committed-blocked 恢复发布协议。它们是候选规格的
验收义务，不表示当前 Admission 或业务 owners 已实现。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| CC-S01 部分 owner 安装失败 | committed 批次含多个 owners；恢复只重建一部分或某 owner 候选根校验失败；共同基线不安装、域不开放、原 operation 仍 committed-blocked，无效果/广播 | CC-03/06；恢复 host + owners 故障注入 |
| CC-S02 旧代确认 | 旧 host/owner generation 在新 writer epoch 后迟到确认；确认被拒且不能推进新代水位或清除隔离 | CC-06；代际并发测试 |
| CC-S03 完整基线原子安装 | 受信宿主在同一完整 watermark 验证跨 owner 关系、重建全部 roots、收口遗留责任并原子安装；读取者只能观察安装前 blocked 或安装后完整基线 | CC-03/06；并发读取与故障注入 |
| CC-S04 原 operation 恢复消费 | 原 completion 保持 committed/blocked；新代 lookup 另报其 position 已由恢复基线覆盖并可消费，operation/receipt/result/eventId 不变，不重提事实、不发补偿性 broadcast | CC-05/06；lookup、扫描与广播测试 |
| CC-S05 不重复外部效果 | 原 attempt 是否已 dispatch 未知；恢复 publication ready 后仍 inspect/关联原 attempt，不能直接执行或换 operation 重试；无法核实保持 unknown | CC-04/06；执行 owner 故障注入 |
| CC-S06 遗留 ExactUse 未收口 | 完整前缀和 owner roots 已重建，但旧 claim/资源仍未结算或不可证明可释放；域保持关闭，直到原 owner 给出合法处置证据 | CC-03/06；资源 owner 联合测试 |
| CC-S07 双入口与互冒 | init 无未初始化前态/受信 seed，或注册仅有 pending 分配、客户端字段、旧 session、未导入来源时，不获新位置；两种受信入口各只能领取对应三/二流资格，不能互冒 | CC-02/03/05；Tenant/Account/Admission/Records 联合测试 |
| CC-S08 导入、重试与短门 | Account 原始后果耐久后重复或丢响应交付，受信接收者核来源/版本/全绑定并耐久去重；未完成导入返回 unavailable/unknown，已导入后 Account 暂时失联仍可在短门纯检查，门内不等待 Account I/O | CC-03/05；真实源/目标 writer 与门内 I/O 注入 |
| CC-S09 同键与竞争 | 同 operation/input 先认回固定 target；有占位或 outcome 时同键异输入冲突；不同 operation 争同 `UserRef` 或 target 仅一个能排位/提交，unknown 与暂时 not_seen 不放行新 target | CC-03；并发与崩溃注入 |
| CC-S10 未提交后重备 | 旧 writer 完整前缀证明原操作未提交并安全解除占位后，同 operation/摘要/target 重备；前缀或释放不明则维持 unknown/blocked，不生成新 target，不伪造旧输入冲突 | CC-03/06；真实 writer 重启和隔离注入 |
| CC-S11 历史与当前 | 已 active Account 或已初始化部署重试原操作仍认回；旧创建 committed_blocked 的 completion 不变，新代完整 owner 基线查询另报可消费；tenant closing/closed 仅返回历史创建结果，不以旧回执授新业务资格或激活账号 | CC-03/05/06；owner/ACR/Tenant 联合查询 |
