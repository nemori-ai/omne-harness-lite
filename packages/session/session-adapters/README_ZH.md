# @omne-harness/session-adapters

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Session 的适配成员。模板变体：`cordis-module`。

## 职责与状态

本包是 Session 组里唯一导入邻域契约的成员。Session 认识全部六个邻域：Agent、Model、Tool、Runtime Context、Request Context 与执行环境。邻域不认识 Session，它们的契约只写通用角色，例如外部协调者、提交参加者、消费者拥有者、作用域持有者、历史持有者与维护者。本包在这些角色与 Session 的命令、端口和事实之间做翻译。

本包拥有三类东西：

- 入站插件。邻域调用它们，或它们读取邻域的输出，再以 Session 的命令写入会话事实。
- 构造依赖端口与出站端口的实现。端口接口归 [session-contract](../session-contract/SPEC.md#构造依赖端口与出站端口)，服务键归 [session-cordis-contract](../session-cordis-contract/docs/cordis.md#端口服务键)。
- 翻译表，包括 `session.modes` 的翻译表。

治理规则、调度与存储不归本包，分别归 [session-contract](../session-contract/README.md)、[session](../session/README.md) 与 [session-storage-sql](../session-storage-sql/README.md)。

状态：适配成员，`draft`。[SPEC](SPEC.md) 是候选设计，尚未技术接受。

- 已实现：无。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。
- 未实现：全部十七个插件与端口提供者。
- 受具名前提阻塞：历史源、受理拓展点、两个驻留端口、Agent 记录迟到结果的入口，以及无活体 runtime 时的执行视图。每项前提与闭合前的表现见 [SPEC](SPEC.md#具名前提与明确缺项)。

## 使用

应用装配者只在会话路径上使用本包。独立调用邻域的调用方不需要它。

1. 装载 [session-cordis](../session-cordis/README.md) 与一个存储提供者。
2. 从 `@omne-harness/session-adapters/cordis` 装载插件。[插件清单](SPEC.md#插件清单)标为等待前提的插件不装载。
3. 在装配入口构造作用域释放端口，交入维护拥有者签发的恢复授权。
4. 把会话的消费者 owner 向 Model 声明为免守卫。Session 不参加 Model 的受理点守卫。

入站插件这样声明调用方类：

```ts
export const inject = {
  session: { caller: 'coordinator' },
}
```

只需要翻译函数的测试与工具从根入口导入，根入口不导入 Cordis。完整的装配步骤见[使用与定位](docs/context.md)。

## 契约

- `src/` 拥有公开形状，现在为空。
- [SPEC](SPEC.md) 拥有每个插件的行为、结果对应表、翻译表与具名前提。
- [Cordis 页](docs/cordis.md) 拥有 `inject`、提供的键、登记与撤除。
- [公开接口页](docs/public-api.md) 索引导出。
- [session-contract SPEC](../session-contract/SPEC.md) 拥有命令、条款与端口语义。

本包不持有业务状态，只持有可丢的派生物：活体句柄、订阅、上一份已过滤快照与前缀摘要缓存。撤除插件不撤回已提交的会话事实，也不撤回外部效果。

## 设计

每个插件只适配一个邻域的一种角色，只以一个调用方类调用 `session` 服务。翻译是确定的纯函数。每个插件以封闭表把邻域结果对应为 Session 结果。表外的结果按依赖失败处理，不成为业务拒绝。边界与理由见[内部架构](docs/architecture.md)，每个插件的流程见[关键流程](docs/flows.md)，运行对象与身份对应见[对象模型](docs/object-model.md)。

## 配置与运行

插件配置经 Standard Schema 校验。可调项是事件页大小、邻域调用的超时与重试退避，以及重新释放的页大小。默认值只是初值。恢复授权是运行时对象，不是配置，由应用装配交入。应用装配只装一个 session-cordis 提供者，因为每个租户一个恢复扫描者依赖它。

## 验证

在仓库根运行：

```sh
pnpm turbo run test --filter=@omne-harness/session-adapters
```

现有的两个测试只核对模板入口，见 [tests/](tests/README.md)。[SPEC](SPEC.md#组合与验证) 的持续验证义务 VA-01 至 VA-19 尚未覆盖。结构检查通过不证明行为。

## 维护

- 邻域契约变化时，同步对应插件、它的对应表与流程。
- Session 的端口或命令变化时，同步对应插件与 [Cordis 页](docs/cordis.md)。
- 具名前提闭合时，更新插件状态，删除缺口行，补上行为与测试。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护人由负责人指定。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本地图
index.md                  包内阅读路径
SPEC.md                   插件、对应表、翻译表与具名前提
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       边界、模块、机制与 SOLID 选择
├── flows.md              每个插件一条流程
├── object-model.md       运行对象与身份对应
├── public-api.md         导出入口与定义索引
├── context.md            装配步骤与定位
└── cordis.md             inject、键、登记与 IC 映射
src/                      index.ts 与 cordis.ts，现在只有模板标记
tests/                    两个入口测试，fixtures/ 现在为空
schema/                   模板占位
verification/             models/ 与 proofs/，模板占位
adr/                      模板占位
examples/                 模板占位
resources/                模板占位
acceptance/               模板占位，fixtures/ 同样
```

每个目录有 README.md 说明职责，有 index.md 导航。`docs/` 之外的这些文件仍是模板占位，不陈述本包事实。阅读路径见 [index.md](index.md)。
