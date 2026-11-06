# @omne-harness/calendar-local

[English](README.md)

## 职责与状态

本成员提供 Calendar A1 的 SQL 发布持久化、供应材料与运行记录、受限来源获取、发行种子读取、供应运行器和查询/供应 Cordis provider。领域规则复用 calendar，存储仅消费 sql-contract。版本仍为 `0.0.0`、private。真实跨域接线留待 M2 之后，Schedule/Job 留待 A2。

## 使用

从根入口构造 createCalendarSqlPersistence、createCalendarSqlSupplyStorage 和 createCalendarSourceAdapters，接入 calendar 的应用工厂。离线发行使用 createShippedCalendarSeedRegistry 与 shippedCalendarSeedRelease，显式接入供应 seed registry；运行器和 provider 见[使用方式](docs/context.md)。

## 契约

[SPEC](SPEC.md)拥有本成员必要行为，源码定义拥有公开形状。[Calendar 行为](../calendar/SPEC.md)继续约束业务含义。

## 设计

[架构](docs/architecture.md)、[流程](docs/flows.md)和[对象模型](docs/object-model.md)解释本包机制。[Cordis](docs/cordis.md)说明装配责任。

## 配置与运行

Node >=24，ESM。装配选择 SQL 提供者并提供合法 scope 与当前资格。来源配置限定 URL、网络预算、解码和知识 resolver。运行器需要 contextSupplier、seed、稳定操作键、phases、intervalMs、limit 和 observer。provider 的 borrowed/owned、排空和关闭责任见[Cordis](docs/cordis.md)。seed=null 仅是已有库或只读装配模式，不满足发行物离线三历义务。

## 验证

在工作区运行 `pnpm --filter @omne-harness/calendar-local build`、`pnpm --filter @omne-harness/calendar-local typecheck`、`pnpm --filter @omne-harness/calendar-local test`。[测试入口](tests/README.md)说明现有资源和覆盖边界。本域证据不代表最终独立接受或真实跨域集成。

## 维护

同步公开源码、必要行为、真实消费者和双语入口，保留 unknown 与提供者限制，不在正文复制第二套类型。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。

设置环境由根入口 `createCalendarSettingsEnvironment` 适配。宿主恢复原调用的受信主体及目标映射，Settings 验证读取资格；适配器一次读取时区和日历并保留同一修订。缺值不默认补齐，失败不当作完整环境。该读取不保护后续日程提交。
