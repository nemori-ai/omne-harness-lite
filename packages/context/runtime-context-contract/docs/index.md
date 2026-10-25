# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-RC01 至 F-RC09 协议流程，失败与生命周期
- [object-model.md](object-model.md)：对象与关系、生命周期、状态与转移
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：独立消费、邻域交接与系统定位
- [cordis.md](cordis.md)：不适用 Cordis 集成的理由

## 阅读路径

- 声明一个块或一条需要：[context.md](context.md)，再读 [object-model.md](object-model.md)。
- 实现持有者面、生产者面或读者面：[../SPEC.md](../SPEC.md)，再读 [flows.md](flows.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[持续验证义务](../SPEC.md#持续验证义务)。
