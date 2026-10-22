# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture/](architecture/index.md)：模块与状态责任、设计理由、SOLID、包与安装边界，以及日志与提交的机制说明
- [flows.md](flows.md)：命令处理器、协调器与调度器的实现流程
- [object-model.md](object-model.md)：构造对象与内存状态的拥有者
- [public-api.md](public-api.md)：导出入口、工厂、参数与失败
- [context.md](context.md)：独立装配、框架装配与定位
- [cordis.md](cordis.md)：本成员不加载 Cordis 的理由

## 阅读路径

- 实现机制：[../SPEC.md](../SPEC.md)、[architecture/README.md](architecture/README.md)，再读 [flows.md](flows.md)。
- 不装配 Cordis，直接构造实例：[context.md](context.md#独立装配)，再读 [public-api.md](public-api.md)。
- 修改本成员：[architecture/README.md](architecture/README.md)、[object-model.md](object-model.md)，再读 SPEC 的[验证](../SPEC.md#验证)。
- 判断某件事该放本成员还是 Cordis 成员：[cordis.md](cordis.md)，再读[组架构的落位判据](../../docs/architecture.md#落位判据)。
