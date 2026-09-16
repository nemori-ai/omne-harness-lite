# 工具定义、调用、结果与控制验证范围

ToolCall safety/progress 两项任务覆盖调用的有限状态抽象；StopProgressUnknown 已显示业务 settled 与物理 exposure 可分离。模型不证明 exposure owner/generation、同代 quiescent/isolation、RN-05 barrier、真实执行、I/O、费用、人类批准或 frames 传输符合。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
本轮只通过设计树 internal gate、来源哈希和依赖映射；候选接受、真实组合测试、形式工具运行
和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。

TL-15 联合 DR-01 验证：同一 tools stream 一次 append 内多 facts 共享 revision、eventId 的 recordIndex 各异；按 eventId 逐事实去重，按 operationId 认回提交，按 `(call,attempt)` 去重结算 arrival，三者不可互换。
