# xml-format

- kind：provider
- 对象与设计修订：项目自有格式化机制的迁入设计；用户2026-09-26明确选择此包和util位置，主调度负责技术评审与接受。
- 源码位置：`packages/util/xml-format`，尚未建包。
- 契约采用与边界依据：没有独立领域契约或数据交换坐标；用户选定的既有项目实现作为技术来源，[design.md](design.md)列实际采用行为、前提与调整，不凭旧分支spec获得接受。

## 分层状态

- 语义接受范围：包的需要与位置已由用户明确；本节点技术映射经独立评审，由主调度在用户委托内接受（[D-067](../../../../record/decisions/core-formatter-adoption/decision.md)），不表示用户已总体接受。
- 可实施范围：单独import可用的格式化函数和声明类型，不提供Cordis服务、不执行工具、不组上下文。
- 绑定与证据：[bindings.yaml](bindings.yaml)为空；没有可绑定契约条款或formal task。技术要求逐项沿[verification.md](verification.md)验证。
- 实际验证：迁入后尚无；旧分支的结果不升级本HUB的实现状态。

| 问题 | 入口 |
|---|---|
| 来源、公开面、前提与迁入调整 | [实现设计](design.md) |
| 需要实际跑什么、证据与未覆盖 | [验证](verification.md) |
