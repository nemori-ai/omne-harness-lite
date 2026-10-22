# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-RQ01 至 F-RQ06 协议流程，失败与生命周期
- [object-model.md](object-model.md)：对象与关系、生命周期、状态与转移
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：独立消费、邻域交接、字段对应与系统定位
- [cordis.md](cordis.md)：不适用 Cordis 集成的理由

## 阅读路径

- 编写协调者一侧的适配器：[context.md](context.md)，再读 [object-model.md](object-model.md) 与 [flows.md](flows.md)。
- 实现历史源读口或调用人侧投影：[../SPEC.md](../SPEC.md) 的历史源一节，再读 [flows.md](flows.md) 的 F-RQ05。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[持续验证义务](../SPEC.md#rq-11-持续验证与未覆盖)。
