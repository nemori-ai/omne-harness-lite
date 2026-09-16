# Run 驱动、等待与结算验证范围

六个 TLC 任务覆盖 core、scheduler、ops 以及三类进展配置。模型只在 `WakeGate` 消费 ready-gate arrival 时清除 gate 登记，不能证明 SE-14/LC-04 要求的裁决提交与 gate release 原子发生；也不覆盖真实 provider、跨进程活性或全部外部效果。RN-05 严格终态门已有独立用户接受依据；现有模型仍不覆盖 execution exposure、settled unknown、非占位 stopping barrier 与错代/恢复证据。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
本轮只通过设计树 internal gate、来源哈希和依赖映射；候选接受、真实组合测试、形式工具运行
和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。
