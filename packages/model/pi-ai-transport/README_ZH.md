# @omne-harness/pi-ai-transport

[English](README.md)

## 职责与状态

本成员是 Model 组的共享 pi 传输。它集中维护 pi fork 以及公共的 HTTP/SSE、取消与连接资源，家族不复制这些机制。职责与建包条件见[组架构“成员与新增条件”](../docs/architecture.md#成员与新增条件)。

当前交付两部分：

- 根入口导出五个已接受的家族贡献接口类型，只有类型，没有运行时值。
- 包内传输机制：连接容量、同步发起的 HTTPS 交换、SSE 分帧、协议帧、网络资源与诊断隔离。它们不经入口导出，供同包的 `ModelTransport` 实现使用。

`ModelTransport` 尚未实现，因此本包还不能独立完成一次模型请求。设计、实现与运行验证分别判断。

### 支持范围

支持范围分五档。每档只写已核对的事实：测试核对了什么，没有核对什么。改变支持范围的提交同步本表、[SPEC](SPEC.md) 与组页的状态。现有证据都来自单个进程与本地 HTTPS 服务，没有真实供应商、代理或包外消费者的验证。

| 档 | 已交付的内容 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | `PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding`、`PiFamilyContributions`，形状照抄组架构的已接受代码块 | 根入口，只有类型 | `public-entry.spec.ts` 核对根入口没有运行时导出，`public-entry.spec-d.ts` 以编译期用例核对类型。没有家族实现消费这些类型 |
| 容量与诊断隔离已实现 | 连接容量：FIFO 授予，可取消，可关闭，预约不过期，只消费一次，消费之后只经座位归还名额。诊断隔离：事件只含种类与级别，观察者的故障只改变计数 | 包内 `src/capacity.ts`、`src/diagnostics.ts`，不经入口导出 | 快层单元测试，使用真实的 `AbortController`。没有包外消费者 |
| SSE 分帧与协议帧已实现 | 字节流到 SSE 事件 data 文本：任意切点下的 UTF-8 与换行，单事件字节上限，四种失败原因。data 文本到协议帧：end-marker 单独成帧，无损 JSON，EOF 不判定终局 | 包内 `src/sse.ts`（改编自 pi）、`src/frames.ts` | 快层单元测试，使用真实字节流与 Node 可读流。没有真实供应商的流 |
| HTTPS 交换与网络资源已实现 | 同步发起的单次 POST，不重试，不跟随重定向。四种结果，封闭的拒绝原因，错误体三种状态。停止在物理关闭前胜出，名额在物理关闭之后归还。新建连接的连接超时。网络资源的关闭排空 | 包内 `src/http.ts`、`src/network.ts` | 慢层测试，对真实本地 HTTPS 服务与自签证书。不证明真实供应商、代理或公网 TLS |
| 尚未交付 | `ModelTransport` 的 `prepare → materialize → start`（2.2）。请求规划、固定绑定与帧到 `TransportFact` 的映射（2.3）。OpenAI 家族（2.5），真实请求经 OpenRouter 固定路由。凭据解析与真实供应商请求（2.6）。第二个差异显著的家族对共享传输接口的验证（后续线）。按优先级与等待方式分配连接席位：未实现，未采用为契约。当前按先来先得授予名额，调用方用取消信号结束等待。方向与责任见 [docs/architecture.md“未实现的优化方向：按优先级与等待方式分配连接席位”](docs/architecture.md#未实现的优化方向按优先级与等待方式分配连接席位) | 无 | 这些路径没有证据 |

## 使用

家族作者从根入口取得类型：`import type { PiFamilyContributions } from '@omne-harness/pi-ai-transport'`。依赖本包会安装 model-contract、operation-result、json-text 与 content-block，不安装 Cordis、`@omne-harness/model` 或任何家族。本包没有 Cordis 入口，理由见 [Cordis 集成](docs/cordis.md)。

传输机制只能由同包代码使用。类型的用法、包内组合的示意，以及初始化与释放责任见[使用与定位](docs/context.md)。

## 契约

[行为规格](SPEC.md)拥有容量、交换、SSE、帧、网络资源与诊断的结果、所有权、失败、取消与生命周期，也拥有秘密只在包内的约束。五个类型的形状与家族作者的行为归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)。公开入口的导航见[公开接口](docs/public-api.md)。

## 设计

六个机制模块各回答一个问题：谁可以发、怎样发一次并收场、字节怎样成为事件、事件怎样成为帧、怎样组合与排空、观察怎样隔离。网络资源组合并注入容量、连接池与诊断隔离，交换不自行创建它们。模块、交换的相位、资源所有权与设计理由见[内部架构](docs/architecture.md)，时序见[关键流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。SSE 分帧改编自 pi，来源见 [UPSTREAM.md](UPSTREAM.md)。

## 配置与运行

所有限额都由调用方给出，本包不设默认值：

- 网络资源：`maxConnections`（容量与连接池的套接字上限）、`idleConnectionTimeoutMs`（池中空闲连接的关闭时限）、可选的 `tls.ca`，以及可选的诊断观察者与 `maxPending`。
- 每次交换：`connectTimeoutMs`（只作用于新建连接，`null` 表示不设）与 `maxErrorBodyBytes`。
- SSE 分帧：`maxEventBytes`。协议帧：`endMarker` 与 JSON 限额。

调用方负责：

- 创建网络资源并调用 `close()`；
- 归还预约，或把它交给一次交换；
- 读完 2xx 响应体，或停止交换；
- 在请求头中放入凭据。

本包负责物理关闭交换、归还名额与排空在途交换。本包只校验头部字符集，不解析、保存或记录凭据。运行需要 Node.js 24 或更高版本，不需要其他外部程序。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。实际验证过的 Node.js 版本以各次运行报告为准。

```sh
pnpm turbo run typecheck --filter=@omne-harness/pi-ai-transport
pnpm turbo run test --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:fast --filter=@omne-harness/pi-ai-transport
pnpm turbo run test:slow --filter=@omne-harness/pi-ai-transport
pnpm run lint:deps
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。慢层需要 PATH 中有 `openssl`，用它生成自签证书。测试分层、夹具与替身见[测试说明](tests/README.md)，覆盖与未覆盖见 [SPEC“组合与验证”](SPEC.md#组合与验证)。

已知限制：`pnpm run package:template scan --member packages/model/pi-ai-transport` 的 `integration` 为 `unknown`。原因是 `docs/architecture/constraints.json` 中本成员仍为候选，层未定。这项登记归架构拥有者，结构检查不受影响。

## 维护

- 改变家族贡献类型：先改组架构的已接受代码块，再同步 `src/family.ts`、类型测试与[公开接口](docs/public-api.md)。
- 改变机制行为：同步 SPEC、对应测试与[关键流程](docs/flows.md)。2.2 实现之后，还要同步 `ModelTransport` 的调用代码。
- 改变 `src/sse.ts`：同步 `provenance.json` 与 `UPSTREAM.md`。
- 增加运行依赖：先核对组架构的依赖方向，再更新 `tests/dependencies.spec.ts`。
- 改变支持范围：同步本表、英文 README、[组页](../README.md)、[组架构](../docs/architecture.md)与[包组织](../../../docs/package-organization.md)中的状态。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
UPSTREAM.md、LICENSE.pi   从 pi 改编的代码的来源说明与原许可证
provenance.json           来源、哈希与改编内容
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
