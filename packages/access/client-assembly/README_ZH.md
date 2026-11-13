# @omne-harness/client-assembly

[English](README.md)

接入组的客户端装配：客户端一侧的一棵 Cordis 树，跟着服务端现在开着哪些协议，为它认识的每个开放协议在树上放一个协议客户端。
## 职责与状态

本成员拥有 RFC-0015 第 6 节「客户端装配」的客户端一侧。消费者是自己搭 Cordis 树的客户端应用，第一个规划中的是桌面应用；命令行不用它。已实现（卡 #1249）：`connectionPlugin` 与服务 `connection`；`defineProtocolClient` 与服务 `protocol:<名字>/v<主版本>`；根入口里的可用性一步与退避策略。未实现：登录本身（这里只有 `LoginStateSource` 接口）、进程间传输、界面模块。

## 使用

用 `@omne-harness/client-assembly/cordis` 的 `connectionPlugin({ transport, login })` 搭树，再为应用认识的每个协议装一个 `defineProtocolClient(protocol)`。要用某个协议的模块注入 `protocol:<名字>/v<主版本>`：服务端开着这个协议时它加载，撤下时它卸载。传输取自 `@omne-harness/sdk/core`。演示是 `tests/fixtures/assembly-demo.ts`。

## 契约

行为归[行为规格](SPEC.md)：连接怎样处理每一帧、退避、协议客户端在每个事件上做什么。导出的索引在 [docs/public-api.md](docs/public-api.md)。可用性的线上形状是[公开契约](../public-contract/SPEC.md#内置协议-accessv1)的 `accessProtocol`。

## 设计

`src/availability.ts` 是纯函数：把一帧用到视图上，以及退避。`src/cordis.ts` 是两个插件与服务类。视图只归连接；协议客户端读它并登记自己的键，连接据此报告开着却没有客户端的协议。

## 配置与运行

`connectionPlugin` 收传输、登录状态来源，可选退避（缺省 200 毫秒起翻倍，最多 10 秒）、诊断出口与测试用的等待函数。传输与它的凭据归调用方。

## 验证

在本成员目录运行 `pnpm exec vitest run --mode fast`，用例跑在真实的 Cordis 4.0.4 上：协议客户端全化表每个可达的格一条，连接的几条，另有一条端到端，对着以进程启动的服务端接入测试入口。浏览器不在这里验，客户端核心的浏览器夹具在 SDK。

## 维护

`accessProtocol` 变了，`applyFrame` 跟着变。SDK 的 `ClientOf` 变了，收回后客户端的守卫跟着变。`docs/architecture/constraints.json` 登记了本成员，依赖规则跟着改。

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
