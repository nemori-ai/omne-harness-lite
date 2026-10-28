# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [architecture.md](architecture.md)：依赖方向、值与行为的归属、设计限制
- [flows/](flows/index.md)：跨成员流程与失败分支
- [object-model/](object-model/index.md)：对象、日志事件目录、状态转移与归约
- [public-api.md](public-api.md)：候选定义与导出索引
- [context.md](context.md)：消费者、使用顺序与系统定位
- [cordis.md](cordis.md)：没有 Cordis 入口的理由

- [initialization.md](initialization.md)：初始化材料、可信来源、同批事实与精确发布摘要
- [recompute-release.mjs](recompute-release.mjs)：按完整生产源码集合重算发布常量

## 阅读路径

- 取一个面来用：[context.md](context.md)，再读 [public-api.md](public-api.md)。
- 实现机制或提供者：[../SPEC.md](../SPEC.md)，再读 [object-model/README.md](object-model/README.md) 与 [flows/README.md](flows/README.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[候选的持续验证义务](../SPEC.md#候选的持续验证义务)。
