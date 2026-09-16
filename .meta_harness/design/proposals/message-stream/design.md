# 客户端交付与恢复机制设计

必要要求逐项是：事实唯一权威、断线恢复、实时过程、每订阅授权、慢客户端不反压工作、动态换代
和媒体呈现真实。候选 1 缺实时过程，候选 2 通过迁移权威才能避免第二历史，候选 3 在现有能力基上
同时覆盖这些要求，因此推荐候选 3。推荐依赖封闭 disposition API、M CAS acceptance、exact frame clocks、
MS-23 per-listener subscribe-first 组合协议及 provider 验收，不产生接受。

该推荐把 durable unknown、耐久 closing/outcome_unresolved 与 transient active state 分在各自权威面；
SessionProjection 的 full snapshot 只返回授权完整集合，changes 返回完整授权投影批与有界 coveredThrough；
客户端在 opened/事实提示/重连及无帧的周期对账主动读取、原子安装 history/state updates，hidden-only 提交
也可凭覆盖证明推进。客户端本地处理缺席草稿，服务端不提供 guessed-identity oracle。
当前有限模型的 buffer 容量界只限定形式化进展结论，不规定生产容量。本次重新裁决只改变 durable
授权/增量投影边界，不改变三候选的选择对象或把推荐升级为接受。
