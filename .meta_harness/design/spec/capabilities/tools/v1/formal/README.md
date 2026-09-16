# 形式工件范围

ToolCall safety/progress 来自 legacy v2 当前工件，覆盖有限调用状态、去重与进展；真实执行提供者、frames cursor、授权/预算和外部效果不在模型内。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。
