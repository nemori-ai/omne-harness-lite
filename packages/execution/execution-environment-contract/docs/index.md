# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、设施协议、SOLID 与扩展边界、技术后续设计与来源缺项、验证与维护
- [flows.md](flows.md)：F-EEC01 至 F-EEC06 协议流程，失败与生命周期
- [object-model.md](object-model.md)：角色、对象与关系、生命周期
- [public-api.md](public-api.md)：导出入口与定义索引，需要声明的 schema 与两条块声明
- [context.md](context.md)：独立消费、经集成方消费、邻域交接与系统定位
- [cordis.md](cordis.md)：不适用 Cordis 集成的理由

## 阅读路径

- 集成方：[context.md](context.md)，再读 [flows.md](flows.md) 与 [public-api.md](public-api.md)。
- 提供者作者：[object-model.md](object-model.md)，再读 [architecture.md](architecture.md#设施协议) 与 [context.md](context.md#提供者作者)。
- 工具作者：[public-api.md](public-api.md#工具环境声明)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[持续验证义务](../SPEC.md#持续验证义务)。
