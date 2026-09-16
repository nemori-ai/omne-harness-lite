# 能力地图

| 维度 | 状态权威与插件投影 | 不拥有 | 提供者状态 |
|---|---|---|---|
| `data.core-work` | 共享值与 Schema；数据包，无独立运行插件 | 授权、状态转移、呈现 | Schema 候选，消费映射待迁移 |
| `capability.durable-records` | 记录、writer、耐久水位、unknown；独立插件是候选投影 | 业务语义与授权 | storage-records 仅 ports/codec；JSONL 有受限 factory 实现；session-persistence 是未实现的 Session 恢复消费者 |
| `composition.core-work-coordination` | 短门、逻辑位置、共同提交、outbox/回执；独立插件是候选投影 | 各能力状态、外部效果恰好一次 | admission 由应用直接调用 factory，联合行待核对 |
| `capability.engineering-observation` | log/trace/diagnostic、cursor/gap/query；独立插件是候选投影 | 授权、控制、业务真相 | diagnostics runtime 由应用创建与注入，不是 Cordis 服务；读面未闭合 |

四个维度因责任与变化边界正交，但通过精确条款组合；正交不表示任意操作可交换。
