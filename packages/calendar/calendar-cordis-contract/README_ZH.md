# @omne-harness/calendar-cordis-contract

[English](README.md)

## 职责与状态

本成员唯一声明 CalendarQueryService/calendarQueryKey 和 CalendarSupplyService/calendarSupplyKey，供 Cordis 本机装配。业务实现、配置和资源归 provider。根入口不导出运行服务，服务定义从 `./cordis` 消费。版本仍为 `0.0.0`、private，最终独立验收未完成，尚未父分支合回。真实跨域接线留待 M2 之后，Schedule/Job 留待 A2。

## 使用

提供者继承公开 Service，消费者按 service key inject。查询与供应可分开装载。精确导出和 Context 类型增补见[公开索引](docs/public-api.md)，资源归属见[Cordis](docs/cordis.md)。

## 契约

[SPEC](SPEC.md)拥有本成员必要行为，源码定义拥有公开形状。[Calendar 行为](../calendar/SPEC.md)继续约束业务含义。

## 设计

[架构](docs/architecture.md)、[流程](docs/flows.md)和[对象模型](docs/object-model.md)解释本包机制。[Cordis](docs/cordis.md)说明装配责任。

## 配置与运行

采用 Cordis 4.0.4。定义包没有业务配置或启动流程，不创建数据库、网络或 timer。装配注入不授 calendar.read 或供应资格；调用仍提供可信上下文。

## 验证

在工作区运行 `pnpm --filter @omne-harness/calendar-cordis-contract build`、`pnpm --filter @omne-harness/calendar-cordis-contract typecheck`、`pnpm --filter @omne-harness/calendar-cordis-contract test`。[测试入口](tests/README.md)说明现有资源和覆盖边界。本域证据不代表最终独立接受或真实跨域集成。

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
