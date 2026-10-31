# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [testing.md](testing.md)：共同日志内存提供者、受信夹具、故障控制与验证边界

- [architecture.md](architecture.md)：边界、模块、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：每个插件一条流程，失败与生命周期
- [object-model.md](object-model.md)：运行对象、身份对应与生命周期
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：装配步骤、消费者与定位
- [cordis.md](cordis.md)：`inject`、提供的键、登记与撤除、IC 符合性

## 阅读路径

- 装配本成员：[context.md](context.md)，再读 [cordis.md](cordis.md)。
- 实现一个插件：[../SPEC.md](../SPEC.md) 的对应插件节，再读 [flows.md](flows.md) 与 [cordis.md](cordis.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
