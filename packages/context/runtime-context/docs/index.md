# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-RCI01 至 F-RCI05 机制流程，失败与生命周期
- [object-model.md](object-model.md)：内部对象与关系、生命周期、实例状态
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：经 Cordis 使用、独立使用与定位
- [cordis.md](cordis.md)：不适用 Cordis 集成的理由

## 阅读路径

- 实现机制：[../SPEC.md](../SPEC.md)、[architecture.md](architecture.md)，再读 [flows.md](flows.md)。
- 不装配 Cordis，直接使用机制：[context.md](context.md#独立使用)，再读 [public-api.md](public-api.md)。
- 修改本成员：[architecture.md](architecture.md)、[object-model.md](object-model.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
