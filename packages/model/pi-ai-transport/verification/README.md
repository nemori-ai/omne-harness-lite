# 持续验证资源

本目录拥有异步计量的自有输入快照与count、digest、checks一致性的行为模型及人工归纳证明。契约归 [SPEC](../SPEC.md)，运行和源码对应归 [formal-mapping.md](formal-mapping.md)。

模型、cfg、负控和证明是持续资源。单次日志、工具摘要、源码修订和接受状态留任务tmp。有限TLC通过、待独立审阅的人工证明、实现符合性和完整应用接受分别报告。没有TypeScript精化证明。

## 阅读路径

- [models](models/index.md) 列出模型及配置。
- [proofs](proofs/index.md) 给出命题、前提、每类转移和限制。
- [formal-mapping.md](formal-mapping.md) 给出可复跑入口及运行守护。
