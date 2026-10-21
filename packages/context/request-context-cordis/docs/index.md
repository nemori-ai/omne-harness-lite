# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：插件与服务、配置与策略选择、isolate 绑定、贡献登记表、变化事件派发、撤除顺序、IC 符合性映射、机制读数与假设、验证义务
- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-RQP01 至 F-RQP03 机制流程，失败与生命周期
- [object-model.md](object-model.md)：服务实例、插件配置与贡献登记表的生命周期
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：装配、独立使用与定位

## 阅读路径

- 装配本插件：[context.md](context.md)，再读 [cordis.md](cordis.md#配置与策略选择)。
- 实现本插件：[../SPEC.md](../SPEC.md)、[cordis.md](cordis.md)，再读 [flows.md](flows.md) 与服务定义成员的 [Cordis 说明](../../request-context-cordis-contract/docs/cordis.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
