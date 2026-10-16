# Tool 文档职责

本目录按六个主题组织内部设计、公开使用和集成说明。根 [SPEC](../SPEC.md) 拥有完整非类型行为，包括 P01 至 P16 操作协议和 C01 至 C04 组合协议。公开类型的精确定义归源码；[public-api](public-api.md) 是源码导航，并唯一维护尚未实现的函数签名。

| 主题 | 信息职责 |
| --- | --- |
| [architecture.md](architecture.md) | 内部模块、依赖、状态与资源、实施机制、Code 宿主构造及持续外部缺项 |
| [flows.md](flows.md) | 协议时序、Code 子调用和 TL-F01 至 TL-F07 业务旅程 UML |
| [object-model.md](object-model.md) | 对象职责、身份、关联、生命周期及参数与依赖的区分 |
| [public-api.md](public-api.md) | 实际导出索引与唯一设计定义 |
| [context.md](context.md) | 独立消费、系统定位和典型调用场景 |
| [cordis.md](cordis.md) | Cordis 依赖、服务、启动、撤除和交接 |

持续覆盖与验证场景归 [verification](../verification/README.md)，单次模型和评审证据留任务 tmp。本目录不另设行为专题或验证报告。主题需要拆分时可升级为同名目录，并提供 README 和 index。

文件和推荐阅读顺序见 [index](index.md)。目录采用状态见[包入口](../README.md#目录结构与文档职责)。