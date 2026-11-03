# @omne-harness/schedule-local

[English](README.md)

## 职责与状态

本包提供可终止规则worker与日程管理SQL后端，复用schedule纯领域决定。当前为private 0.0.0。本地应用组合管理、预测与查询，Cordis插件显式注入存储和日历。Job执行和恢复扫描尚未实现。

## 使用

目标消费者和允许依赖见[组架构](../docs/architecture.md)。先构建编译入口，再创建计算worker。SQL宿主先登记材料和具名守卫，再构造管理后端。消费者使用公开根入口，不导入私有源码。

## 契约

[SPEC](SPEC.md)记录本成员边界，[公开入口](docs/public-api.md)区分现有导出与后续定义。已有[业务行为](../schedule/SPEC.md)和[API 设计](../schedule/docs/public-api-design.md)继续作为实施输入，不因拆包复制类型定义。

## 设计

[架构](docs/architecture.md)说明本成员责任。[Cordis](docs/cordis.md)说明绑定适用性。目录初始化不建立新领域、进程或分布式实现。

## 配置与运行

Node >=24，ESM。宿主提供worker容量、SqlStorage、固定scope、组合身份与守卫适配，并负责存储关闭。组合应用须等待application.close，独立worker须等待worker.dispose。单机后端与未来远程实现必须遵守相同公共语义，不能以同进程调用替代可靠交接。

## 验证

运行 `pnpm --filter @omne-harness/schedule-local build`、`typecheck` 和 `test`。fast覆盖公开边界及真实SQLite；slow覆盖线程终止与进程崩溃。权威、同意、Calendar及额度使用符合性夹具，不代表生产跨域联调通过。

## 维护

实现公共定义时同步消费者、必要行为与验证。区分已实现导出与后续能力。空的cordis入口不能称为已安装服务。

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
