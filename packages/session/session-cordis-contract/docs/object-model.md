# Session Cordis 定义：object-model

Service 的方法形状从 [session-contract](../../session-contract/README.md) 索引取得，不复制公开操作类型。Context、fiber 与 Service 是装配对象，不写入领域数据契约。SessionWorkService 对接 SessionService；Run 和 attempt 不成为 Service 子类或插件实例。

候选接口尚未实现，以上为包边界与设计归属。
