# agent-cordis-contract

## 职责与状态

Agent 能力唯一的 Cordis 服务定义：服务、键、类型增补及框架协议。设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。

`./cordis` 入口导出：

- 20 个抽象 Service 和具体的 `AgentInstancesService`，另有 21 个键常量。
- 21 个键的 `Context` 增补，以及 `Events` 中的 `agent-cordis-contract/instance-retired` 事件。
- 接口 `AgentPublicationAuthority`。
- 目录插件 `agentInstancesPlugin`。

根入口不导出值，只导出三个类型：`AgentLocalRoute`、`AgentRegistrationInput` 与 `AgentWithdrawalInput`。根入口没有到 Cordis 的边。

目录插件 `agentInstancesPlugin` 提供 `agentInstances` 键。本包没有实现 Agent 推进 Loop、评估器、其他服务键的提供者和宿主插件。宿主插件归 [agent-host-local](../agent-host-local/README.md)。没有用真实提供者做过运行验证。

## 使用

消费 Agent 服务的插件从 `@omne-harness/agent-cordis-contract/cordis` 导入键常量与类型，领域类型从 `@omne-harness/agent-contract` 导入。插件不从实现包导入 Service。[入口页](docs/public-api.md)导航到源码。

## 契约

[SPEC](SPEC.md) 拥有行为。[Cordis 页](docs/cordis.md)拥有服务键、登记协议以及对 IC-1 至 IC-19 的符合性映射。

## 设计

[架构](docs/architecture.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。Cordis 定义与具体提供者分包。目录插件的 `Config` 是空对象，拒绝任何成员。依赖和撤除见 [集成设计](docs/cordis.md)。

## 验证

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/agent-cordis-contract`，在本目录运行 `pnpm typecheck`。turbo 先构建本包及其依赖。本目录里的 `pnpm test` 只运行 Vitest，不构建。测试在 Cordis 4.0.4 上运行，覆盖根入口、键集合与类集合、目录的登记规则和目录插件，文件清单见[测试说明](tests/README.md)。发布权威、主体资格核验和宿主在测试里是测试子类，测试不证明真实提供者的行为。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证。实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板。六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
