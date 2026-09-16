# 耐久记录 v1 符合性场景

这些场景固定 [contract](contract.md) 的 revision、顺序、身份与恢复边界。它们是候选规格的
验收义务，不表示当前 provider 已通过。

| 编号 | 触发与可观察结果 | 条款与证据归属 |
|---|---|---|
| DR-S01 同流三事实 | 空 stream 在一个 accepted append 写入三个有序 facts；三者共享 revision `1`，eventId 的 `recordIndex` 各不相同；下一 append 用 expected revision `1` 成功，用 `3` 冲突 | DR-01；records codec、writer 与恢复联合验收 |
| DR-S02 多流 canonical replay | prepare 以任意跨 stream 顺序产生事实；adapter 每流合并一次、保留流内顺序并按版本化 canonical StreamRef 排 append；在线读取、重启恢复和 replay 得到相同 flatten 顺序及 eventId | DR-01/03；adapter + JSONL 重启验收 |
| DR-S03 非 canonical 输入 | 重复 stream 或非 canonical append 顺序到达 writer；在分配 batchSeq/eventId 前具名拒绝，不静默重排、不占 operation | DR-01/02；records codec 与 writer 负例 |
| DR-S04 prepare 身份 | prepare 产生临时 correlation；commit 后 facts 只以 DR 分配的 `(domain,batchSeq,recordIndex)` 为 eventId，临时值不能被消费方当成耐久身份 | DR-01/02；adapter 与 consumer 契约测试 |
| DR-S05 恢复修订一致 | 重启扫描含多 facts append 的完整前缀；assigned/durable/read/replay 都把每次 append 计作 `+1`，不按 fact count 推导 revision | DR-01/03/04；真实 JSONL 重启与差分 replay |
