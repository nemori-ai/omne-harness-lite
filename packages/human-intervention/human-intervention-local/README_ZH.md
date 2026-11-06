# @omne-harness/human-intervention-local

[English](README.md)

## 职责与状态

HITL 的 Node 单机 SQL 提供者，依据已接受的 HJ0。当前已实现操作终态、请求/卡片共同提交、独立 WaitOwner 恢复与原操作结果回查。Identity 成员资格协调已接入具名写入和结果回查；独立等待的请求/卡片查询与统一池分页已实现，其余公开应用服务仍在实施，不代表完整 C2 可用。

## 使用

从根入口导入 hitlSqlMaterials、independentWaitSqlMaterials 和操作工厂。装配者向现有 SqlStorage 登记材料及组合，再传入该存储、tenant domain、组合版本和摘要。真实装配样例见[测试 world](tests/world.ts)。

## 契约

[公开接口](docs/public-api.md)指向源码定义，[SPEC](SPEC.md)拥有原操作身份、封口竞争和未知结果。终态工厂是可信装配能力，不验证终端用户身份。

## 设计

[内部架构](docs/architecture.md)说明 SQL 参与者和读口，[对象模型](docs/object-model.md)区分操作值、耐久终态和外部注入存储。

## 配置与运行

装配者提供已登记组合与租户域。工厂不创建或关闭共享存储，不读取环境默认值，不注册全局服务。

## 验证

依次运行本成员 build、typecheck、test:fast。真实 SQLite 验证出卡、竞争答复、批次恢复、接收代次、原结果回查、封口和回滚。真实 IdentitySql 还覆盖成员撤回、目标不可用与关闭排空。查询验证还覆盖私人受众、快照变更、游标绑定、读取期间撤权和有界续页。完整应用服务及独立验收仍未覆盖。

## 维护

原操作身份和材料变更须同步终态测试与行为正文。C2 负责人继续完成服务及独立验收；不要将材料可登记等同于业务已接受。

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
