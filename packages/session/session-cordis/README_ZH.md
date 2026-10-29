# @omne-harness/session-cordis

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Session 的 Service 实现成员，`service-provider` 变体。

## 职责与状态

本成员把 [session](../session/README_ZH.md) 的机制装进 [session-cordis-contract](../session-cordis-contract/README_ZH.md) 定义的服务 `session`。它承担端口的取得、配置校验、调用方类核对、提交通知的派发与订阅、每租户恢复扫描者的绑定，以及撤除与换代。领域行为归 [session-contract](../session-contract/README_ZH.md)，机制行为归 session，端口的实现归 [session-adapters](../session-adapters/README_ZH.md) 与存储提供者，都不在本成员。

状态：Service 实现成员，`draft`。采用依据是[组架构的 Cordis 落位](../docs/architecture.md#cordis-落位)与 [SPEC](SPEC.md)。SPEC 是候选设计，尚未技术接受。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 与 `src/cordis.ts` 只有模板标记，两个入口都没有导出。
- 未实现：具体子类（即插件）、配置 Schema、端口接线、组合通知者、扫描者绑定与撤除。根入口保持为空。
- 尚有缺口：受理槽、来源变化通知与租户集合还缺少通道，见 [SPEC 的明确缺项](SPEC.md#明确缺项)。内部主体经服务键 `sessionPrincipals` 取得。
- 未验证：调用方类读取、重复装载失败、配置错误使 fiber `FAILED`、换代时新旧实例的先后，这四条机制只有源码读数或没有读数，现在是假设。SPEC 列出的验证义务都没有测试。本成员不宣称跨进程的每租户单扫描者。

现在没有应用装配本插件，也没有包依赖本成员。

## 使用

本成员有两个入口：

- `@omne-harness/session-cordis/cordis`：插件。应用装配者在插件树里加一行本插件并给出配置，同时装上事务端口与其他端口的提供者。
- `@omne-harness/session-cordis`：不导出任何东西。不装配 Cordis 的宿主从 [session](../session/README_ZH.md) 取工厂 `createSessionInstance`。

调用方插件、端口提供者与监听者不导入本成员，它们经服务定义使用服务。装配写法与独立使用见[使用与定位](docs/context.md#使用方式)。插件还没有实现，现在没有可运行的示例。

## 契约

- 公开形状归 `src/`，现在为空。导出索引归[公开接口页](docs/public-api.md)。
- 类型以外的行为归 [SPEC](SPEC.md)，性质 1 至 11，含端口接线表、明确缺项与验证义务。
- 插件、`inject`、配置、调用方类核对、通知、扫描者绑定与撤除顺序归 [Cordis 说明](docs/cordis.md)。
- 服务键、抽象类、调用方类、端口服务键与事件归 [session-cordis-contract](../session-cordis-contract/docs/cordis.md)。

本插件的 fiber 拥有服务实例与它的 `SessionInstance`。插件卸载时按固定顺序撤除：拒绝新的面调用、释放各租户的扫描者、限时等待实例停止。撤除不回滚已提交的事实，不补发出站调用，也不撤回外部效果。

## 设计

`./cordis` 分为配置、端口接线、服务子类、通知、扫描者绑定与撤除六块。包外依赖是 session-contract、session-cordis-contract、session 与 `@deepseek-ai/cordis`。只有访问检查、事务端口与内部主体进 `inject`，其余端口每次调用时用本插件的 Context 现取。本成员是提交通知的派发方。扫描者在首次见到租户的通知时绑定。模块与理由见[内部架构](docs/architecture.md)，四条生命周期流程见[生命周期流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

插件配置用 Standard Schema 校验，字段是调度策略 `policy` 的逐字段覆盖、撤除等待上限 `disposeWaitMs` 与受理槽声明 `admission`。`admission` 只能省略或取 `'none'`。省略的策略字段取 session 的初值。默认值只是初值。配置错误时插件加载失败，fiber 进入 `FAILED`；缺事务端口时 fiber 停在 `PENDING`。

每个租户同一时刻只有一个恢复扫描者，第一版靠装配单实例兑现：全部进程里只装一份本插件，不在两个 isolate 标签下各装一份。租户、主体与回调不进配置。本成员不读取资源，只经事务端口访问存储。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session-cordis
```

在本目录执行 `pnpm typecheck` 做类型检查。现有两个测试只断言两个入口没有导出，见 [tests/](tests/README.md)。SPEC 的九项验证义务随实现进入，在真实 Cordis 4.0.4 上运行，见 [Cordis 说明的验证义务](docs/cordis.md#验证义务)。跨进程的每租户单扫描者、持久化与真实邻域的端到端组合不在本成员。结构检查通过不表示行为已验证。

## 维护

- 服务定义改变时，同步具体子类、端口接线、[Cordis 说明](docs/cordis.md)与测试。
- session 的工厂、依赖分类或调度策略改变时，同步配置 Schema、端口接线与[公开接口页](docs/public-api.md)。
- 服务定义成员补上受理槽或变化通知的键时，同步 SPEC 的明确缺项与 Cordis 说明。
- Cordis 升版时，先重跑服务定义成员与本成员列出的 basis probe。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   类型以外的行为，性质 1 至 11、端口接线、明确缺项与验证
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       两个入口、模块、依赖、关键机制与理由、SOLID
├── flows.md              FC-01 至 FC-04 生命周期流程
├── object-model.md       服务实例、配置、端口接线、通知者与租户维护表
├── public-api.md         导出入口与定义索引
├── context.md            装配、独立使用与定位
└── cordis.md             插件、注入、配置、通知、扫描者、撤除与 IC 映射
src/                      index.ts 与 cordis.ts，现在只有模板标记
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   现在为空，配置 Schema 随实现进入 src/
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
