# Session 通用实现与 Cordis

本成员是 `module` 变体。它没有 `src/cordis.ts`，没有 `./cordis` 入口，不依赖 `@deepseek-ai/cordis`。本文件存在不导致生成 Cordis 绑定，也不引入 Cordis 依赖。

## 适用性

本成员不需要 Cordis 集成。根入口按 [IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) 与 Cordis 无关，只导出一个不依赖 Cordis 的工厂与 `SchedulingPolicy` 等配置。理由是变化原因不同：

- 命令处理器、协调器、调度器、事件读取与缓存随会话治理的机制变化。它们只依赖 session-contract 的端口接口与纯函数，用替身就能跑完整个状态机。
- 服务键、调用方类的 intercept 配置、端口服务键、提交事件、依赖分类与换代处置随装配约定变化。

独立宿主与测试台使用工厂时，不应因此加载 Cordis。本成员只调用传入的端口，不从 fiber 或 Context 取任何东西，不读 intercept 配置，不派发 Cordis 事件。下列事项由 Cordis 成员替它完成：

- 服务键、抽象类、四个面的挂接、调用方类、端口服务键与提交事件：[session-cordis-contract 的 Cordis 说明](../../session-cordis-contract/docs/cordis.md)。
- 插件装载时调用工厂、取得端口、校验配置、订阅事件、绑定每租户扫描者，以及卸载与换代时的停止顺序：[session-cordis 的 Cordis 说明](../../session-cordis/docs/cordis.md)。两件事的对照见[使用与定位](context.md#框架装配)。

本成员的行为在两种装配下不变。卸载 Cordis 插件不改变已经提交的业务事实。外部效果在提交之后发出，不因实例停止而撤回，也不因依赖缺席而报告为业务成功。

以后若需要本成员直接提供 Cordis 绑定，先按组的[落位判据](../../docs/architecture.md#落位判据)重新判断归属，不在本成员里加 `./cordis` 入口。
