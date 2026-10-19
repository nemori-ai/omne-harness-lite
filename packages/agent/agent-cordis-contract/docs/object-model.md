# Agent Cordis 定义：object-model

Service 的方法形状从 [agent-contract](../../agent-contract/README.md) 索引取得，不复制公开操作类型。对象的身份与生命周期归[纯契约的对象模型](../../agent-contract/docs/object-model.md)。Context、fiber 与 Service 是装配对象，不写入领域数据契约。目录与登记的关系见 [登记协议](cordis.md#登记输入与撤除协议)。登记身份、登记状态和登记句柄是契约包的对象，本包只写它们的 Cordis 承载。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，未实现。以上是包边界与设计归属。
