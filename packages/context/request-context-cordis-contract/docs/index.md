# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：服务定义、intercept 配置与作用域、事件、依赖分类、登记与撤除协议、策略选择、IC 符合性映射、机制读数与假设
- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：F-RQD01、F-RQD02 机制流程，失败与生命周期
- [object-model.md](object-model.md)：三个技术对象与生命周期
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：各类依赖方的用法与定位

## 阅读路径

- 写一个贡献提示词的插件：[context.md](context.md#贡献者插件)，再读 [cordis.md](cordis.md#登记与撤除协议)。
- 实现提供者：[../SPEC.md](../SPEC.md)、[cordis.md](cordis.md)，再读 [flows.md](flows.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
