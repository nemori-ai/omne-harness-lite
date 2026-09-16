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
