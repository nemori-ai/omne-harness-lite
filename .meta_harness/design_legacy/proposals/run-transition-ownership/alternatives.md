# 候选与取舍

## 选择对象与必要约束

所有候选都必须保留：Run 事实单一语义、跨 owner 原子提交、每 epoch 至多一 close、strict terminationIntent、
resume/reacquire 恢复与 operation lookup。差异在于 Run 写权落点及协调成本。

| 候选 | 如何兑现 | 差异、反例与成本 | 证据/处置 |
|---|---|---|---|
| 1. 消费者分布式写 Run facts + shared close CAS | Session/Tools/Driver 各按共享 Schema 生成 Run facts，CC 用 expected openEpoch/close CAS 防重复 | 每个消费者必须复制 Run 状态机、reason 与终止门；Yield→Session force-stop、interrupt→superseded 已出现无条件第二 close，新增路径持续扩大双权威 | `9a58ae2` provider/TS-20 反例真实；可实现但维护负担与一个含义一份权威冲突，淘汰 |
| 2. Run owner effect-free prepare + composite submit-time guard | Run owner唯一生成 facts/opaque guard；协调者原样合并；CC submit 时 owner重核 aggregate revision/latest/open/operation | 同时保留 Run 单一权威与 Session hold/Inbound/AR 同批；需明确 preparation 生命周期、guard 和 provider integration | advisor 推荐；本候选推荐但未接受，需 formal/provider证据 |
| 3. Session activity aggregate 成为 Run/epoch 唯一 writer | 把 Session、Run、epoch、queue/control 合并为一个 durable aggregate，单 writer 内完成全部转移 | 可天然单写，但需迁移 MC/RN/LC/SE/RD 权威，难覆盖无 Session work；迁移与验证成本远超当前缺口 | global diagnosis 已评估；在整体 aggregate 迁移前不采用 |

## 推荐与仍待区分的事项

推荐候选 2。它让原子组合保留在 CC、合法性保留在 Run owner，新增概念只有 effect-free preparation 与
submit-time guard。候选 1 已有具体双 close 反例；候选 3 是实质可行的整体重构但成本不成比例。
推荐不决定实现已完成，也不接受新基线。
