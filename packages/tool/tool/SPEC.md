# tool 实现规格

<!-- documentation:placeholder -->

本页将说明本实现怎样满足[契约 SPEC](../tool-contract/SPEC.md)：受理决定器与记录仓、推进协程、独立执行，以及耐久性怎样依赖记录仓提供者。本页不另写公共保证，也不能用实现限制改写公共承诺。

当前只有工厂构造形状，没有行为实现。工单 04 加入独立执行，M3 加入 runtime。设计中的实现机制当前仍在契约包的 [architecture](../tool-contract/docs/architecture.md)，工单 02c 把它们迁到本包。

文档导航见 [index](index.md)。
