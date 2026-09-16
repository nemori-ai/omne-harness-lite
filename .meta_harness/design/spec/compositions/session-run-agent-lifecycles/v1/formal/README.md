# 形式工件范围

Lifecycles safety/progress 来自 legacy v2 当前工件。`Isolated` 只代表强隔离门已经成立；`CancelInterrupted` 只覆盖 cancel 与不存在未决隔离的 force_stop，不覆盖 interrupted → non-placeholder stopping。模型不含 isolation unknown/unverified 的终态转换，也不覆盖三类 readiness 的完整数据形状。Split 配置只保存跨域义务/反例来源，不登记成已通过任务。模型将具名同域组合当作原子动作，这本身不是实现证明。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
