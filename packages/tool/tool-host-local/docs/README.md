# tool-host-local 文档职责

本目录维护本提供者的内部设计、使用及集成说明。六个主题目前都是占位。非类型行为归根 [SPEC](../SPEC.md)，公共行为归契约包的 [SPEC](../../tool-contract/SPEC.md)。

| 主题 | 信息职责 |
| --- | --- |
| [architecture.md](architecture.md) | 内部模块、依赖、状态和资源责任 |
| [flows.md](flows.md) | 关键业务和数据流 UML |
| [object-model.md](object-model.md) | 对象、身份、关联和生命周期 |
| [public-api.md](public-api.md) | 导出入口与接口定义导航 |
| [context.md](context.md) | 消费者、系统定位及调用场景 |
| [cordis.md](cordis.md) | Cordis 依赖、服务实现与生命周期 |

主题需要拆分时可升级为同名目录，并提供 README 和 index。目录索引见 [index](index.md)。
