# 形式工件范围

Lifecycles safety/progress 来自 legacy v2 当前工件。Split 配置只保存跨域义务/反例来源，不登记成已通过任务。模型将具名同域组合当作原子动作，这本身不是实现证明。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
