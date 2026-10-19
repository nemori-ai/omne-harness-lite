# Agent Cordis 定义公开接口

根入口 `.` 不导出值，只导出三个类型：`AgentLocalRoute`、`AgentRegistrationInput` 与 `AgentWithdrawalInput`，定义在 [src/index.ts](../src/index.ts)。根入口没有到 Cordis 的边：构建后的 `index.js` 没有导入，`index.d.ts` 也不引用 Cordis。

`./cordis` 由 [src/cordis.ts](../src/cordis.ts) 定义，源码是唯一定义，本页不手写签名。

- 17 个抽象 Service 类与 1 个具体类 `AgentInstancesService`，共 18 个，另有 18 个键常量，命名是服务键加 `Key`，例如 `agentJournalKey`。键、类与契约类型的对照见 [Cordis 页的服务键表](cordis.md#服务键与提供者)。
- `Context` 增补：每个键对应的服务类型。
- `Events` 增补：`agent-cordis-contract/instance-retired`，参数是 tenant、AgentInstanceId、发布代次与原因。
- 接口 `AgentPublicationAuthority`：宿主对一次登记或撤除的同步最终核验。它带 Cordis 的 `Context` 类型，所以只从 `./cordis` 导出。
- 目录插件 `agentInstancesPlugin`：静态 `inject` 是 `agentPublicationAuthority` 与 `agentAccessCheck`，`Config` 是拒绝任何成员的空对象。
- 根入口三个类型的再导出。

类型参数取自 `@omne-harness/agent-contract`。服务行为与依赖分类见 [cordis](cordis.md)。消费者只从 `@omne-harness/agent-cordis-contract/cordis` 导入绑定，不从实现包导入 Service。

状态：设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。以上定义已实现，任何服务键的提供者与宿主插件尚未实现。
