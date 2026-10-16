# tool-host-local 行为规格

本页维护单机宿主在公共契约之外真实承担的行为：配置、资源所有权、失败、生命周期、并发、持久性、取消与恢复。公共结果、不变量和协议归契约包 `@omne-harness/tool-contract` 的 [SPEC](../tool-contract/SPEC.md)。本页不另写公共保证，也不能用提供者限制改写公共承诺。

下列决定已接受，由本包承担。它们在契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)中有完整记录：

- G4：宿主时钟适配器，同进程单调时钟加进程 epoch，跨进程比较返回 unknown。
- G5：第一版采用同机的启动协调器和耐久受理台账，实现 [P04](../tool-contract/SPEC.md#p04-实际发起围栏) 要求的启动排序域。
- G7：`ToolBindingRegistry` 由本包实现。
- G9：本包命名为 `packages/tool/tool-host-local`。

这些决定尚未实现。

文档导航见 [index](index.md)。
