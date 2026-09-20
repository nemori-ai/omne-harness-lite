# Model Execution v1 验证范围

| 条款 | 当前证据 | 未覆盖 |
|---|---|---|
| MC-01～MC-03 | `packages/model/llm` 有消息、请求配置和来源标记的纯源码切片 | 档案服务、事实来源、候选读面、manifest 与共同准入 |
| MC-04～MC-06 | stream assembler/紧凑记录有源码测试；L 的 RD-08/RD-16 提供调用侧切点 | OpenRouter 出口、attempt ledger、CAS disposition、late-result acceptance guard、abandoned 出边封闭、inspect、usage/cost |
| MC-07 | 消息/内容块存在纯构造与装配基元 | 贡献排序、秘密投送、skill 一致性和模型族投影 |
| MC-08～MC-11 | ModelSelection 有限模型只覆盖 MC-09 与 MC-10 的两个不变量 | 切换共同屏障、事实来源、压缩执行、费用与下一 Run 组合 |
| MC-12～MC-14 | llm 源切片有私有紧凑流算法 | exact frame clocks、attempt fencing、per-listener callback failure、transform/source generation、compact state/cut、真实重连 |

当前没有 model-execution host、Cordis plugin、OpenRouter 网络 adapter 或 attempt 状态权威。
形式工件 registered-not-run，且只覆盖有限模型选择抽象；不覆盖 disposition、active handoff 或 client reducer。源包测试即使通过也不证明 MC 契约符合。

round-3 的可编码边界还包括：无 receipt 窗口没有 current revision；durable business unknown 是
without_message 终态；late-result CAS 门失败只有保持 current/空 pointer 一个结果；generation marker 是旧代
最后 publication。E 本轮不修改或运行 formal 模型。
