# 形式工件范围

RunDriver 的 core/scheduler/ops/progress 配置来自 legacy v3 当前工件。模型把 gate 登记保留到 `WakeGate` 消费 ready-gate arrival 才清除，因此不能证明 SE-14/LC-04 新要求的 gate-restored 裁决提交与登记释放原子发生。`ConfirmIsolation` 只抽象强隔离证据已经成立的分支；模型没有从 isolation unknown/unverified 到 cancelled 的动作，也不验证真实证据字段。RN-05 的更强终态门把 `partial.unknown` 改成隔离已证实后的外部效果未知，这是未接受的新 candidate semantic change，不是 legacy 等价或已接受政策。模型还不包含真实 Cordis 生命周期、I/O、预算数值或跨进程故障。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
