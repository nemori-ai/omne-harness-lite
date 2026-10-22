# Session Cordis 定义：object-model

本成员没有领域对象。Service 的属性类型从 [session-contract](../../session-contract/README.md) 取得，不复制公开操作类型。Context、fiber 与 Service 是装配对象，不写入领域数据契约。`SessionService` 以四个属性暴露契约的四个面；Run 和执行尝试不成为 Service 子类或插件实例。领域对象见 [session-contract 的对象模型](../../session-contract/docs/object-model/README.md)，服务定义见 [Cordis 定义](cordis.md)。
