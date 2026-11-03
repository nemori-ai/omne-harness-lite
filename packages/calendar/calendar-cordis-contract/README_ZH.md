# @omne-harness/calendar-cordis-contract

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

## 职责与状态

唯一 Service 定义、服务键与 Context 类型增补。服务方法消费纯契约，不引入业务实现或本地后端。 本包为 private 0.0.0 初始化草稿，公开入口仍为空，没有可运行的业务能力。

## 使用

目标消费者和允许依赖见[组架构](../docs/architecture.md)。当前只能构建和检查骨架，不能创建服务或执行业务命令。未来使用者通过公开入口消费，不能导入本包私有源码。

## 契约

[SPEC](SPEC.md)记录本成员边界，[公开入口](docs/public-api.md)区分现有导出与后续定义。已有[业务行为](../calendar/SPEC.md)和[API 设计](../calendar/docs/public-api-design.md)继续作为实施输入，不因拆包复制类型定义。

## 设计

[架构](docs/architecture.md)说明本成员责任。[Cordis](docs/cordis.md)说明绑定适用性。目录初始化不建立新领域、进程或分布式实现。

## 配置与运行

Node >=24，ESM。当前没有业务配置或启动入口。单机后端与未来远程实现必须遵守相同公共语义，不能以同进程调用替代可靠交接。

## 验证

运行 `pnpm --filter @omne-harness/calendar-cordis-contract build`、`typecheck` 和 `test`。测试只检查草稿导出，不证明持久化、租户隔离、网络、生命周期或业务正确性。

## 维护

实现公共定义时同步消费者、必要行为与验证。保留草稿标记，直到公开行为及其验证实际完成。具体方法、schema、服务类和提供者均未实现。

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
