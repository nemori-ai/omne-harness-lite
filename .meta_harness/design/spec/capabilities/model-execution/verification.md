# Model Execution v1 验证范围

| 条款 | 当前证据 | 未覆盖 |
|---|---|---|
| MC-01～MC-03 | `packages/model/llm` 有消息、请求配置和来源标记的纯源码切片 | 档案服务、事实来源、候选读面、manifest 与共同准入 |
| MC-04～MC-06 | stream assembler/紧凑记录有源码测试；L 的 RD-08/RD-16 提供调用侧切点 | OpenRouter 出口、attempt ledger、墓碑、inspect、重试、usage/cost 与迟到结算组合 |
| MC-07 | 消息/内容块存在纯构造与装配基元 | 贡献排序、秘密投送、skill 一致性和模型族投影 |
| MC-08～MC-11 | ModelSelection 有限模型只覆盖 MC-09 与 MC-10 的两个不变量 | 切换共同屏障、事实来源、压缩执行、费用与下一 Run 组合 |
| MC-12～MC-14 | llm 源切片有私有紧凑流算法 | message-stream 新坐标、同一 `toPublic`、发布/基线互斥、读权和真实重连 |

当前没有 model-execution host、Cordis plugin、OpenRouter 网络 adapter 或 attempt 状态权威。
形式工件 registered-not-run，且只覆盖有限抽象；源包测试即使通过也不证明 MC 契约符合。
