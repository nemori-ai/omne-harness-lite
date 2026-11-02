# Agent 具体装配：architecture

本包消费 [agent](../../agent/README.md) 的纯工厂、[agent-cordis-contract](../../agent-cordis-contract/README.md) 的唯一框架定义和 [agent-contract](../../agent-contract/README.md) 的行为。具体本地实例宿主负责调度及登记；主体的当前资格仍由授权领域的适配器经 `agentAccessCheck` 裁定，宿主不自己解释权限。本包不依赖外部协调者的类型。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。宿主插件已部分实现，范围与缺口见 [SPEC](../SPEC.md#宿主插件)。插件的入口、依赖和撤除次序见 [Cordis 装配页](cordis.md)。
