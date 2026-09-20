# ModelSelection 形式工件

`ModelSelection.tla` 与 `ModelSelection.cfg` 是 legacy current v2 的逐字节重基，只有限检查
MC-09 的历史模态兼容与 MC-10 的至多一次压缩。它不表达真实 OpenRouter 请求、tenant/授权/
预算共同门、attempt 重试与迟到费用、媒体保留、Run/Driver 竞态、私有序列或帧发布。

本轮不复用旧运行日志。Java/TLA2TOOLS 不可用时登记为 registered-not-run；只有实际 TLC
完整探索退出 0 才能报告该有限模型通过。
