# @omne-harness/tool-definitions

[English](README.md)

## 职责与状态

本包提供 Files 与 Shell 纯根作者，经已限权设施执行。独立 Tool 调用已实现。生产 Cordis 绑定与真实后端组合验证由父线继续交付。

## 使用

导入 createFilesAuthor 或 createShellAuthor，传入显式 JsonValue 配置。完整方式见[使用说明](docs/context.md)与可运行的[测试驱动](tests/run-author.ts)。

## 契约

[公开源码](src/index.ts)拥有类型，[SPEC](SPEC.md)拥有行为、失败与资源责任。[公开接口](docs/public-api.md)导航实际定义。

## 设计

同一命令表供声明、校验与 help 使用。Files 先预检再写入。Shell 使用精确的 command 或 terminal 门面。理由见[内部架构](docs/architecture.md)。

## 配置与运行

resultMaxBytes 必填。Shell 另需 executable、argsPrefix、cwd 与 env。Files 可选绝对路径 cwd，相对路径在调用设施之前按它解析（R2-D290）。调用者提供当前授权和落点事实。作者不读取宿主默认值。

## 验证

运行本成员 build、typecheck、test。[成员测试](tests/README.md)使用公开作者、真实 Tool 作用域及非耐久设施，不证明真实文件系统、PTY 或生产授权。

## 维护

修改命令时同步同一张表与行为测试。修改环境门面时协调宿主消费者。未完成绑定见 [Cordis](docs/cordis.md)。

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
