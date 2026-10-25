# @omne-harness/session-cordis-contract

[English](README.md)

Session 的 Cordis 定义成员，`service-contract` 变体。

## 职责与状态

本成员只拥有 Session 这一接缝的 Cordis 定义，由这些部分组成：服务键 `session`、抽象类 `SessionService`、端口服务键、intercept 配置 `{ caller }`，以及唤醒事件 `session-cordis-contract/committed`。

本成员不拥有领域行为。四个面与端口接口归 [session-contract](../session-contract/README_ZH.md)，治理机制归 [session](../session/README_ZH.md)，Service 实现与注入归 [session-cordis](../session-cordis/README_ZH.md)，端口由 [session-adapters](../session-adapters/README_ZH.md) 与 [session-storage-sql](../session-storage-sql/README_ZH.md) 提供。本成员只认通用角色：调用方类、端口提供者与监听者。

状态：Cordis 定义成员，`draft`。[SPEC](SPEC.md) 写明各项性质，是候选设计，尚未技术接受。采用依据是 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。

| 导出 | 支持 | 位置 |
| --- | --- | --- |
| 带四个面的 `SessionService` 与 `sessionKey` | 已导出 | `src/cordis.ts` |
| 十个端口 Service 与键：`sessionTransactions`、`sessionPrincipals`、`sessionIdentity`、`sessionEvidence`、`sessionClock`、`sessionIdleInput`、`sessionContextInput`、`sessionNotifier`、`sessionAgentDrive`、`sessionScopeRelease` | 已导出 | `src/cordis.ts` |
| `SessionIntercept`、`Context` 与 `Events` 增补、事件 `session-cordis-contract/committed` | 已导出 | `src/cordis.ts` |
| 根入口的类型重导出 | 已导出，没有运行值 | `src/index.ts` |
| `sessionToolStartFence`、`sessionDeliveryRelease` | 已被替代，不定义 | [session-contract SPEC](../session-contract/SPEC.md#被替代的协议) |
- 未验证：intercept 配置的 Cordis 机制读数只有源码读数，所以 SPEC 的性质 4 是假设，见 [Cordis 说明](docs/cordis.md#机制读数与假设)。

## 使用

本成员有两个入口：

- 根入口 `@omne-harness/session-cordis-contract` 只重导出契约类型，不导入 Cordis。
- `@omne-harness/session-cordis-contract/cordis` 承载服务定义。

实现进入后，调用方插件这样声明自己的调用方类：

```ts
import type {} from '@omne-harness/session-cordis-contract/cordis'

export const inject = {
  session: { caller: 'intake' },
}
```

对象形式的 `inject` 仍是必需依赖，对象里的值是 intercept 配置。经 `ctx.get` 现取服务的插件没有这份配置，服务会拒绝它的调用。四个调用方类与各类依赖方的依赖分类见 [Cordis 说明](docs/cordis.md#intercept-配置与调用方类)。

独立使用不需要本成员。只用领域值与纯接口的调用方安装 [session-contract](../session-contract/README_ZH.md)。

## 契约

- 服务定义归 `src/`。
- 性质与生命周期表归 [SPEC](SPEC.md)。
- 服务定义、端口服务键、事件、依赖分类与 IC 符合性映射归 [Cordis 说明](docs/cordis.md)。
- 导出索引归[公开接口页](docs/public-api.md)。
- 四个面的操作、结果与失败归 [session-contract SPEC](../session-contract/SPEC.md)。

本成员不持有资源。调用方插件的 fiber 拥有它的 intercept 配置的寿命，监听者的 fiber 拥有事件监听的寿命，每个端口由它的提供者拥有。撤除一个端口插件不撤销已提交的业务事实。

## 设计

每个入口一个源文件。包外依赖是 session-contract 的类型与 `@deepseek-ai/cordis`。本成员不导入任何提供者或机制。四个面共用一个服务键。只有事务端口与内部主体进 `inject`，其余端口按调用现取。模块与理由见[内部架构](docs/architecture.md)。本成员为什么没有自己的流程与领域对象，见[流程](docs/flows.md)与[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有插件配置，没有环境前提，运行时不读取资源。intercept 配置 `{ caller }` 是调用方插件的装配声明，不是本成员的配置。提供者配置归 [session-cordis](../session-cordis/docs/cordis.md)。应用装配只装一个 session-cordis 提供者，因为每个租户只有一个恢复扫描者这一条依赖它。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session-cordis-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试只断言两个入口都没有导出，见 [tests/](tests/README.md)。SPEC 生命周期一节的验证义务还没有覆盖，其中大部分由提供者的测试检查。结构检查通过不表示行为已验证。

## 维护

- 契约里四个面的操作类型变化时，同步抽象类、[公开接口页](docs/public-api.md)与导出测试。
- 契约里的端口接口变化时，同步 [Cordis 说明的端口服务键](docs/cordis.md#端口服务键)与该端口的提供者。
- 服务键、intercept 配置或事件变化时，同步 Cordis 说明与提供者 session-cordis。
- Cordis 升版前，先重跑 Cordis 说明列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   性质与生命周期表
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── cordis.md             服务定义、端口键、事件与 IC 映射
├── architecture.md       入口、依赖与理由
├── context.md            谁安装本成员，系统定位
├── flows.md              本成员没有自己的流程的理由
├── object-model.md       本成员没有领域对象的理由
└── public-api.md         导出入口与定义索引
src/                      index.ts（类型重导出）与 cordis.ts（定义）
tests/                    入口测试：导出集合、键、真实 Context 装载
schema/                   模板占位
verification/             models/ 与 proofs/，模板占位
adr/                      模板占位
examples/                 模板占位
resources/                模板占位
acceptance/               模板占位，fixtures/ 同
```

每个目录的 README.md 说明职责，index.md 负责导航。除 `docs/` 外，这些文件仍是模板占位，没有写本包事实。阅读路径见 [index.md](index.md)。
