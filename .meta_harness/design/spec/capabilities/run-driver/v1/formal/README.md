# 形式工件范围

RunDriver 的 core/scheduler/ops/progress 配置来自 legacy v3 当前工件。模型把 gate 登记保留到 `WakeGate` 消费 ready-gate arrival 才清除，因此不能证明 SE-14/LC-04 新要求的 gate-restored 裁决提交与登记释放原子发生。`ConfirmIsolation` 只抽象强隔离证据已经成立的分支；模型没有 execution exposure 集合、settled unknown、错代/迟到/恢复证据，也没有不占位 stopping 派生 scheduler barrier。RN-05 严格终态门已有独立用户接受依据，但这些澄清仍是 candidate 资源，旧模型不能证明。模型还不包含真实 Cordis 生命周期、I/O、预算数值或跨进程故障。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
