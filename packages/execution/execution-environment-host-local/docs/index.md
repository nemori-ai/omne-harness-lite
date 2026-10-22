# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：插件与配置、服务子类、登记即效应、撤除顺序、isolate 绑定、IC 符合性映射、验证义务
- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、宿主文件使用（已接受）、SOLID 与扩展边界、验证与维护
- [flows.md](flows.md)：F-EEH01 至 F-EEH03 机制流程，失败与生命周期
- [object-model.md](object-model.md)：服务实例、提供者、设施实例、句柄代际与生命周期
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：装配、点名、独立使用与定位

## 阅读路径

- 装配服务：[context.md](context.md)，再读 [cordis.md](cordis.md)。
- 使用宿主文件：[architecture.md](architecture.md#宿主文件使用)、[flows.md](flows.md)，再读 [../SPEC.md](../SPEC.md#宿主文件使用)。
- 修改本成员：[architecture.md](architecture.md)、[object-model.md](object-model.md)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
