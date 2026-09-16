# 形式工件范围

Lifecycles safety/progress 来自 legacy v2 当前工件。其 RunDriver 投影把 gate 登记保留到 `WakeGate` 消费才清除，不能证明 SE-14/LC-04 新要求的 gate-restored 裁决提交原子释放。`Isolated` 只代表强隔离门已经成立；`CancelInterrupted` 只覆盖 cancel 与不存在未决隔离的 force_stop，不覆盖 interrupted → non-placeholder stopping。RN-05 严格终态门已有独立用户接受依据，但旧模型不含 A stopping+B running、派生 barrier、supplement/C 阻断、用户 hold 独立解除或真实 exposure/错代证据，不能证明本候选澄清。模型也不覆盖三类 readiness 的完整数据形状。Split 配置只保存跨域义务/反例来源，不登记成已通过任务。模型将具名同域组合当作原子动作，这本身不是实现证明。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
