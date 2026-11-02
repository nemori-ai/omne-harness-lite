# Agent 具体装配：object-model

具体插件持有框架资源与纯实现对象，Service 类与键从 [agent-cordis-contract](../../agent-cordis-contract/docs/cordis.md) 复用。AgentInstanceHost 是可替换端口；目录贡献、物理协程与推进资格分别判断。对象的身份与生命周期归[纯契约的对象模型](../../agent-contract/docs/object-model.md)。宿主持有的预约记录和各实例的 `AgentProvider` 是插件内部状态，不是数据契约，也不是登记身份的来源，登记身份由目录分配。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。宿主插件已部分实现，范围与缺口见 [SPEC](../SPEC.md#宿主插件)。
