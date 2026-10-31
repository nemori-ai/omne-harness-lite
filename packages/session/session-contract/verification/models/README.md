# verification/models

本目录承载本成员的形式模型、精确配置及可复跑检查器。每份模型说明所检查的 SPEC 条款、抽象前提、工具版本、具名负控和未覆盖。原始运行证据留任务 tmp。

[Session frontier](frontier/README.md)包含 Frontier、PM02、GapIsolation 和 FrozenActive 四个有限模型。它们分别验证历史前缀与解除、首输入拒收、共享隔离门及 frozen-active 新输入竞争。没有形式 refinement 或完整组合证明。

承诺或实现结构变化时复核抽象、动作映射与输入 hash。产品对应关系须由真实入口及发布点验证提供，不能从模型通过推断。
