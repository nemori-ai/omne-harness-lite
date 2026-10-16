# tool 实现规格

本页将说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：受理决定器与记录仓、推进协程、独立执行，以及耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

下列决定已接受，由本包承担。完整记录见契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)：G1 账本工厂与记录仓端口，G2 独立执行作用域，G6 的 runtime 测试装配与记录仓一致性用例，G8 的 `executeTool`、`createIndependentToolScope`、`createToolRuntime` 及其构造形状。

当前只有工厂构造形状，没有行为实现。工单 04 加入独立执行，M3 加入 runtime。实现机制见 [architecture](docs/architecture.md)。

文档导航见 [index](index.md)。
