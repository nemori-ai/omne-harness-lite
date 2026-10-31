# Model 实现文档职责

本目录维护可复用领域实现的设计。共同协议、领域值与端口归 [model-contract](../../model-contract/README_ZH.md)，框架定义与登记归 [model-cordis-contract](../../model-cordis-contract/README_ZH.md)。

| 主题 | 信息职责 |
| --- | --- |
| [architecture](architecture.md) | 内部模块、状态和资源责任 |
| [flows](flows.md) | 业务与数据流 |
| [object-model](object-model.md) | 内部对象与构造依赖 |
| [public-api](public-api.md) | 执行函数和工厂设计 |
| [context](context.md) | 选择和构造本实现，进入逐步教学示例 |
| [cordis](cordis.md) | 暂存宿主装配设计；model-host-local 已有，目前只实现本地凭据保管 |

[实现 SPEC](../SPEC.md)补充实现专属行为，完整共同义务见[领域验证](../../model-contract/verification/index.md)。
