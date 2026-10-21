# @omne-harness/session

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

会话组的机制实现成员，`module` 变体。

## 职责与状态

本成员不依赖 Cordis，实现[会话契约的运行契约](../session-contract/SPEC.md#运行契约候选)，不新增公开行为。它拥有契约没有写明的机制：

- 命令处理器流水线：每个命令只做一次耐久提交。
- 五个协调器与七个调度器：前者决定发出什么，后者决定何时再检查哪个会话。
- 受理流水线两组拓展点（before-admit、after-admit）的编排。
- 从 Agent 事件派生事实的读取规则。
- 条目缓存与快照缓存。
- 调度策略对象。

本成员不持有任何耐久状态。会话日志、操作记录、治理状态、派生索引与消费游标都归事务端口的提供者。内存里只有计时、重放计数与缓存，进程重启后丢失，由恢复扫描从权威读重建。

允许与拒绝只来自 session-contract 的纯函数。四个面、端口与事件归 [session-contract](../session-contract/README.md)，服务定义归 [session-cordis-contract](../session-cordis-contract/README_ZH.md)，Cordis 绑定归 [session-cordis](../session-cordis/README_ZH.md)，邻域适配归 [session-adapters](../session-adapters/README_ZH.md)，SQL 存储归 [session-storage-sql](../session-storage-sql/README_ZH.md)。

状态：机制实现成员，候选技术设计，尚未技术接受。

- 已实现：没有。`src/index.ts` 只有模板标记，根入口没有导出。
- 未实现：工厂、命令处理器、协调器、调度器、缓存与 `close`，清单见[公开入口页](docs/public-api.md#随实现进入的导出)。
- 未验证：[SPEC](SPEC.md) 的条款都没有测试，崩溃矩阵与故障场景也没有运行器。

[session-cordis](../session-cordis/README_ZH.md) 的依赖里已经列出本成员，但两边的根入口都没有导出，所以现在没有运行中的调用。其他包不依赖本成员。

## 使用

本成员只有根入口 `@omne-harness/session`，现在没有导出。实现进入之后，宿主按下面的顺序使用：

1. 构造 `SessionDependencies` 与 `SessionConfiguration`。启动条件只有事务端口。
2. 调用 `createSessionInstance(dependencies, configuration)`。
3. 用 `facesFor(caller)` 给每个调用方类各自的面。
4. 对宿主要服务的每个租户调用 `maintain(tenant)`，保存返回的句柄。
5. 把提交通知交给 `committed`，把变化通知交给 `changed`。
6. 退出时先释放各租户的维护句柄，再调用 `close()`。

只消费领域接口的调用方不安装本成员，安装 session-contract。Cordis 插件安装 session-cordis-contract。装配 Cordis 的应用也不直接导入本成员，由 session-cordis 代为调用工厂。独立使用与经 Cordis 使用的差别见[使用与定位](docs/context.md)。

工厂的签名是候选形状，现在没有可运行的示例。

## 契约

- 公开形状归 `src/`，现在为空。
- [SPEC](SPEC.md) 拥有契约没有写的机制：流水线（CP）、拓展点（EX）、协调器（C1 至 C5）、调度器（S1 至 S7 与 SR）、事件读取（RD）、缓存（CA）、崩溃矩阵（CR）与验证义务（VM）。
- [公开入口页](docs/public-api.md)拥有工厂、两个参数与实例成员。
- [对象模型](docs/object-model.md)拥有构造对象与内存状态的拥有者。
- 操作、失败、事件与状态机归[契约 SPEC](../session-contract/SPEC.md)，本成员只链接，不复述。

调用工厂的一方拥有实例，负责关闭。`close` 之后四个面返回 `unavailable`；`close` 不回滚已提交的事实，也不取消任何 Agent、Tool 或 Model 的执行。出站端口缺席只让需要它的操作失败，事务端口缺席则整个实例不能启动。

## 设计

实例内部有面与调用方类核对、命令处理器、拓展点编排、协调器、调度器、每会话串行队列、事件读取规则、缓存、策略与生命周期十类模块。依赖只有一个方向：调度器调用协调器，协调器调用命令处理器与出站端口，命令处理器调用事务端口、桥与纯函数。

关键机制有：

- 一个用例一次提交，重放只靠操作身份。
- 外部调用在提交之后发出，回执作为新事实提交。
- 协调器与调度器不持状态。
- 缓存只淘汰，不承担正确性。
- 派生物在输入变化时维护，请求到达时只读取。

模块与理由见[内部架构](docs/architecture/README.md)，日志模型与技术义务见[机制说明](docs/architecture/mechanisms.md)，流水线、协调器与调度器的流程见[实现流程](docs/flows.md)。

## 配置与运行

工厂有两个参数：`SessionDependencies` 是注入的端口，`SessionConfiguration` 是静态的 `SchedulingPolicy`。`SchedulingPolicy` 含各类间隔、重试上限、退避序列与缓存预算，`defaultSchedulingPolicy` 只给初值，宿主可以整体或逐字段替换。工厂拒绝不合法的策略并指出字段。形状见[公开入口页](docs/public-api.md#配置)，字段含义与初值见 [SPEC](SPEC.md#schedulingpolicy)。

本成员不读环境变量，不读资源文件。租户、会话与操作身份是调用参数，不进依赖或配置。一个实例服务全部会话。每个租户在全部进程里只能有一个扫描者，第一版只装一个实例即可兑现。

时钟、通知总线与存储介质不由本成员选择，宿主经端口提供。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/session
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试只断言根入口没有导出，不证明任何行为。SPEC 的[验证义务](SPEC.md#vm-机制的持续验证义务)与[故障场景](docs/fault-scenarios.md)是后继实现必须通过的结果，不是已运行的测试。结构检查通过不表示行为已验证。

## 维护

- 公开导出改变时，同步 SPEC、[公开入口页](docs/public-api.md)、[src 索引](src/index.md)与导出测试。
- session-contract 改动操作、端口、事件或状态转移时，先改 SPEC 里受影响的条款与故障场景。
- 工厂签名改变时，同步组内唯一的使用方 session-cordis。
- 新的邻域是 session-adapters 的新插件，本成员不改。
- 成员关系与依赖方向归[组入口](../README.md)，具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   机制行为：CP、EX、C、S、SR、RD、CA、CR、VM
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture/         模块、设计理由、日志与提交机制
├── flows.md              流水线、协调器与调度器流程
├── object-model.md       构造对象与内存状态的拥有者
├── public-api.md         导出入口、工厂、参数与失败
├── context.md            独立使用、经 Cordis 使用与定位
└── cordis.md             本成员不加载 Cordis 的理由
src/                      只有 index.ts，现在为空导出
tests/                    只有入口测试，fixtures/ 为空
schema/                   现在为空，本成员不发布 Schema
verification/             故障场景，models/ 与 proofs/ 为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
