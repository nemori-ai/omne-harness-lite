# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：内部模块、状态与资源归属、关键机制及理由、设计限制
- [flows.md](flows.md)：写路径、压缩提交、epoch 视图读取、派生重建，失败与生命周期
- [object-model.md](object-model.md)：表、索引与进程内对象，生命周期
- [public-api.md](public-api.md)：公开边界、候选导出与配置的导航
- [context.md](context.md)：消费侧使用与系统定位
- [cordis.md](cordis.md)：作为 `sessionTransactions` 提供者的 Cordis 集成

## 阅读路径

- 装配或独立使用：[context.md](context.md#使用方式)，再读 [cordis.md](cordis.md) 或 [public-api.md](public-api.md)。
- 实现事务端口与读路径：[../SPEC.md](../SPEC.md)、[architecture.md](architecture.md)，再读 [flows.md](flows.md)。
- 改表与索引：[object-model.md](object-model.md)，再读 SPEC 的[符合性](../SPEC.md#符合性)。
- 修改本包：[architecture.md](architecture.md#验证与维护)，再读 SPEC 的[组合与验证](../SPEC.md#组合与验证)。
