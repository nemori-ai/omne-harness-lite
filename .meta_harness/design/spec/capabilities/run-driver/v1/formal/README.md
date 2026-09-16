# 形式工件范围

RunDriver 的 core/scheduler/ops/progress 配置来自 legacy v3 当前工件。`ConfirmIsolation` 只抽象 RN-05 强隔离证据已经成立的分支；模型没有从 isolation unknown/unverified 到 cancelled 的动作，也不验证真实证据字段。它抽象等待、结算、控制、Yield 与调度，但不包含真实 Cordis 生命周期、I/O、预算数值或跨进程故障。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
