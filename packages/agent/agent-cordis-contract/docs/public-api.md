# Agent Cordis 定义：public-api

当前根入口和 `./cordis` 均为空。设计中的类、键、增补和事件仅维护在 [Cordis 定义](cordis.md)。未来消费者只从 `@omne-harness/agent-cordis-contract/cordis` 导入绑定，领域类型从 `@omne-harness/agent-contract` 导入；不从实现包导入 Service。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，未实现。以上是包边界与设计归属。
