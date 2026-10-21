# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：服务定义、方法分面、intercept 配置、登记与撤除协议、依赖分类、IC 符合性映射、机制读数与假设
- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-EED01、F-EED02 机制流程，失败与生命周期
- [object-model.md](object-model.md)：两个技术对象、一项类型增补与生命周期
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：各类依赖方的用法与定位

## 阅读路径

- 写一个依赖本服务的插件：[context.md](context.md)，再读 [cordis.md](cordis.md)。
- 实现 Service：[../SPEC.md](../SPEC.md)、[cordis.md](cordis.md)，再读 [flows.md](flows.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
