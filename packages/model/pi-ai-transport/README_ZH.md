# @omne-harness/pi-ai-transport

[English](README.md)

## 职责与状态

本成员是 Model 组的共享 pi 传输。它集中维护 pi fork 以及公共的 HTTP/SSE、取消与连接资源，家族不复制这些机制。职责与建包条件见[组架构“成员与新增条件”](../docs/architecture.md#成员与新增条件)。

本包交付六部分：

- 根入口导出三段传输的工厂 `createPiTransport` 与它的配置类型。工厂返回的 `ModelTransport` 兑现 `prepare → materialize → start`。
- 根入口导出网络资源的工厂 `createNetworkResources` 与它的配置类型。装配创建并拥有网络资源，再把它交给 `createPiTransport`。网络资源是不透明句柄，包外只能调用它的 `close()`。网络资源可以使用 HTTPS 代理。
- 根入口导出五个已接受的家族贡献接口类型。
- 根入口导出家族表：`defineFamily`、`composeFamilies`、`recordAdoption` 与 `replayFormatsOf`。家族表把供应商的精确采用解析到一个家族包的一条记录。
- 子入口 `./chat-completions` 导出供家族包使用的网关引擎。运行时值是 `bindChatCompletions`、校准算术 `calibratedAmount`，以及两家共用的计量规则与计量器外壳。引擎规划并编码请求，并解释响应流。
- 子入口 `./testing` 导出家族包测试用的检查：按记录检查夹具，以及采用指纹。它读写文件。
- 包内传输机制：连接容量、同步发起的 HTTPS 交换、SSE 分帧、协议帧与诊断隔离。它们不经入口导出，由网络资源与三段传输组合。

本包不含家族。本包的持续验证只用测试家族与测试用的小记录。家族包 `@omne-harness/pi-ai-openai` 与 `@omne-harness/pi-ai-anthropic` 在自己的测试中使用家族表、引擎与测试入口。两个家族经本传输与本地 HTTPS 服务的联调在 `pi-ai-anthropic` 的慢层用例中，不在本包。设计、实现与运行验证分别判断。

### 支持范围

支持范围分九档。每档只写已核对的事实：测试核对了什么，没有核对什么。改变支持范围的提交同步本表、[SPEC](SPEC.md) 与组页的状态。持续验证的证据都来自单个进程、本地 HTTPS 服务、本地 CONNECT 代理与测试家族。真实代理与真实供应商只有手动运行的 `test:live` 证据，没有包外消费者的验证。

| 档 | 已交付的内容 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | `PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding`、`PiFamilyContributions`，形状照抄组架构的已接受代码块 | 根入口，只有类型 | `public-entry.spec.ts` 核对家族类型照抄组架构，`public-entry.spec-d.ts` 以编译期用例核对类型。本包的测试家族、`@omne-harness/pi-ai-openai` 与 `@omne-harness/pi-ai-anthropic` 使用这些类型 |
| 三段传输已实现 | `createPiTransport`：配置校验，按接收方查路由，核对请求含该供应商，经家族贡献取得绑定。prepare 保存请求为该供应商固定的回放声明与这次发出的再发略去集合。materialize 按 FIFO 预约名额、拒绝模型可见的内容引用、用这份声明与集合经家族编码、固定字节与 SHA-256 回执。绑定给出回放格式时，回执还带这个格式。失败时归还名额。start 在同步调用中读取凭据并发出一次请求，没有凭据时不发送并以 `credential` 失败结束。发出之后，事实流先把编码的每条诊断作为 `diagnostic` 事实给出，再经 SSE、协议帧与家族解码器，以恰好一个 `ended` 结束，失败按 SPEC 的映射表区分。路由有 end-marker 时，事实流在 end-marker 处结束，不等待响应体结束。本包读入 end-marker 所在的响应字节之前，取消与关闭在物理停止之后以 `interrupted` 结束。读入之后，协议结束优先，流以解码器的终止结束。关闭之后或网络资源关闭之后的任何 start 不发送，以 `interrupted` 结束，含 start、关闭、再 start 的顺序。重复 materialize 返回 `invalid`。两次 start 之间没有关闭时，第二次 start 返回空流 | 根入口的 `createPiTransport`；包内 `src/transport.ts`、`src/materialized.ts`、`src/fact-stream.ts`、`src/termination.ts`、`src/payload.ts`、`src/config.ts` | 快层用例与内存中的测试家族。慢层对真实本地 HTTPS 服务覆盖映射表各行、容量等待与取消、关闭，并运行 model-contract 符合性套件 transport 组的六条义务（脚本化的提供者）。`pi-ai-anthropic` 的慢层把两个真实家族经同一 `composeFamilies` 交给本传输，对本地 HTTPS 服务发送两家每条记录的夹具，并对两家各一条记录运行同一 transport 组。本包的测试不用真实凭据，也不用 Model 发送路径（`SendResource`）。二者与本传输的组合由 [model-host-local](../model-host-local/README_ZH.md) 交付，它的慢层门禁把四份真实回放件经该装配路径回放。两个家族包的示例经 `executeModel` 与本传输向 OpenRouter 发出请求，只在手动运行时有证据 |
| 容量与诊断隔离已实现 | 连接容量：FIFO 授予，可取消，可关闭，预约不过期，只消费一次，消费之后只经座位归还名额。诊断隔离：事件只含种类与级别，观察者的故障只改变计数 | 包内 `src/capacity.ts`、`src/diagnostics.ts`，除观察者类型 `DiagnosticObserver` 外不经入口导出 | 快层单元测试，使用真实的 `AbortController`。没有包外消费者 |
| SSE 分帧与协议帧已实现 | 字节流到 SSE 事件 data 文本：任意切点下的 UTF-8 与换行，单事件字节上限，四种失败原因。data 文本到协议帧：end-marker 单独成帧，无损 JSON，EOF 不判定终局 | 包内 `src/sse.ts`（改编自 pi）、`src/frames.ts` | 快层单元测试，使用真实字节流与 Node 可读流。没有真实供应商的流 |
| HTTPS 交换与网络资源已实现 | 同步发起的单次 POST，不重试，不跟随重定向。四种结果，封闭的拒绝原因，错误体三种状态。只有同一资源的容量授予的预约能发起交换。停止在物理关闭前胜出，名额在物理关闭之后归还。读者提前结束响应体（含第一次读取之前）时响应关闭。读者按类型区分本地停止（`ResponseBodyStoppedError`）与连接中断（`ResponseBodyReadError`）。从发起到取得已连接套接字的连接超时。网络资源的关闭排空。可选的 HTTPS 代理：配置校验与 Node 版本守卫，经 CONNECT 隧道的交换，直连项，代理拒绝、不可达与不回复时的 `connect-failed`，停止与关闭结束建立中的代理连接，代理拒绝后重置不使进程崩溃 | 根入口的 `createNetworkResources`；包内 `src/http.ts`、`src/network.ts`、`src/pool-agent.ts` | 慢层测试，对真实本地 HTTPS 服务、自签证书与本地 `http:` CONNECT 代理。`test:live` 在设置 `OMNE_LIVE_TESTS=1` 时经云端会话的代理向 OpenRouter 发一次流式请求，只在手动运行时有证据。不证明 `https:` 协议的代理、包外消费者或持续的公网 TLS |
| 家族表已实现 | `recordAdoption`：摘要是整条记录排序键规范 JSON 的 SHA-256。`defineFamily` 拒绝不是纯 JSON 数据的记录、重复的 `(name, revision)` 与同一路由的两条 `current`，并保存冻结副本。`composeFamilies` 拒绝重复的 owner、重复的采用与不是 `defineFamily` 返回的值。`acquire` 按采用四项精确查表：查不到为 `unavailable` `adoption-not-installed`，路由不符为 `invalid`，绑定的供应商或采用不符时释放并返回 `unavailable` `binding-mismatch`，取消后到达的绑定被释放。`replayFormatsOf` 读取记录的回放格式 | 根入口；包内 `src/family-table.ts`、`src/canonical-json.ts` | 快层用例，使用内存中的测试家族。`@omne-harness/pi-ai-openai` 与 `@omne-harness/pi-ai-anthropic` 用家族表定义家族，并在自己的测试中核对 |
| 网关引擎请求一侧已实现 | `bindChatCompletions` 为一条记录给出完整绑定。`rules.plan` 用档案的回放声明投影，规划参数，调用家族的 check，并经家族计量器形成表示；表示带 `units` 侧表。`encode` 使用同一投影，回放用它收到的声明与再发略去集合，不用记录的官方声明。`encode` 同时返回诊断：每条略去推理续接状态部件的消息一条 `replay-omitted`。按项目约定，引擎不关闭推理：词表没有强度 `none` 与 `reasoning.enabled`，引擎不给出 `reasoning-disabled` 诊断。引擎源码不含厂商名。投影、参数、请求体与缓存的规则见 [SPEC“网关引擎：请求”](SPEC.md#网关引擎请求) | 子入口 `./chat-completions`；包内 `src/chat-completions/`（投影与请求改编自 pi） | 快层用例，使用测试记录与 hook 替身。两个家族包在自己的夹具测试中核对记录的请求体。没有真实网关的持续验证 |
| 两家共用的校准算术与计量器外壳已实现 | `calibratedAmount` 是契约可选校准的纯算术，两个家族计量器复用它。完整计量把带推理状态的单元改记其来源的输出 token 数。来源缺失或被扣留时，结果是具名不可用，不按零计。有锚点时，只计覆盖前缀之后的单元，按去掉工具的完整包络差计数。锚点不加余量，余量只按估算部分算。包络差为负时锚点不命中，原因为 `continuation-shrank`。方法来自封存件 `marginal.ts` 与 `output-history.ts`。`rules.plan` 从投影写出表示的 `units` 侧表。两家还共用计量器外壳：核对供应商与表示采用，拒绝待定媒体，调用校准算术，组装预算。方法名先加家族的输出组方法，再加 `+continuation-anchored/1`。输入摘要只在校准有锚点或有 O 时纳入校准。规则见 [SPEC“校准算术”](SPEC.md#校准算术) 与 [“共用计量规则”](SPEC.md#共用计量规则) | 子入口 `./chat-completions`：`calibratedAmount`、共用计量规则与计量器外壳，以及计量接缝的类型 | 快层用例，使用确定性的计数替身，并直接测试共用计量规则。真实 tokenizer 与租约组合由两个家族包验证 |
| 网关引擎流解码器与测试入口已实现 | `createDecoder()` 给出一个解码器：阶段联合加每帧一个纯归约步。content 与 refusal 共用一个文本块。可见推理取本响应第一个非空来源，不显示 `[REDACTED]`。推理片段按无 id 同 index 拼接，签名只采用一次。finish 时家族的推理 hook 封存全部拼接后的项，每个结果成为一个推理续接状态部件。载荷超过 message 上限时不产生部件，改为一条 `reasoning-state-dropped` 诊断。工具参数文本在名字到达之前缓存，受配置的限额约束。`stop`、`tool_calls`、`length` 为完成。`stop` 或 `tool_calls` 时没有文本、思考或工具调用块，或 `tool_calls` 时没有工具调用，以 `upstream-protocol` 失败，不封块。`length` 时工具参数块保持开着。其他 finish 以输入被拒失败。finish 之后的有界尾帧接受 usage 与重复的 finish。首帧固定服务方，由记录钉住。带内错误按整数错误码映射，不回显正文。没有 finish 的流为断流。收场之后，`end()` 调用家族的 usage hook 一次，给出 `account` 事实，值是账目报告 `CallAccountReport`（用量项、以 `openrouter-credit` 计的网关 `cost`、`place` 为 `openrouter/<provider>`、时长未知、修订 `1`），再给出 hook 的每条 `usage-inconsistent` 诊断，最后是 `ended`。已收场的响应在之后失败时，仍给出已收用量的账目：被拒的帧让解码器进入保留 usage 的 `faulted` 阶段，每种读取失败之后事实流调用一次 `end()`，给出它在 `ended` 以外的事实。在收场之前失败的流没有账目。`./testing`：`checkChatCompletionsFixtures` 核对每条记录的 `request.json`、`stream.sse` 与 `facts.json`，`checkAdoptionFingerprints` 与 `appendAdoptionFingerprints` 维护 `adoptions.json` | 子入口 `./chat-completions` 与 `./testing`；包内 `src/chat-completions/chunk.ts`、`details.ts`、`decoder.ts`（chunk 循环与停止映射改编自 pi）与 `src/testing/` | 快层用例，使用测试记录、hook 替身与仿照真实网关流形状手写的流。每次回放经发送的主体解码，以恰好一个 `ended` 结束。两个家族包经测试入口回放自己的记录夹具。`pi-ai-anthropic` 的慢层经本传输与本地 HTTPS 服务回放两家的记录夹具。没有真实流样本 |
| 尚未交付 | 媒体读取（阶段四 4.4）：materialize 目前拒绝模型可见的内容引用。按优先级与等待方式分配连接席位：未实现，未采用为契约。当前按先来先得授予名额，调用方用取消信号结束等待。方向与责任见 [docs/architecture.md“未实现的优化方向：按优先级与等待方式分配连接席位”](docs/architecture.md#未实现的优化方向按优先级与等待方式分配连接席位) | 无 | 这些路径没有证据 |

## 使用

家族作者从根入口取得类型与家族表：`import { defineFamily, composeFamilies } from '@omne-harness/pi-ai-transport'`。家族作者用 `@omne-harness/pi-ai-transport/chat-completions` 的 `bindChatCompletions` 产生每个绑定。装配把 `composeFamilies([...])` 作为 `families` 交给 `createPiTransport`。依赖本包会安装 model-contract、operation-result、json-text 与 content-block，不安装 Cordis、`@omne-harness/model` 或任何家族。本包没有 Cordis 入口，理由见 [Cordis 集成](docs/cordis.md)。

装配用 `createNetworkResources(config)` 创建网络资源。装配拥有网络资源，可以把它交给多个传输。装配再调用 `createPiTransport({ network, families, routes, credential, limits })`，得到 `{ transport, close }`。`transport` 交给 Model 的发送资源。凭据槽在 `start` 的同步调用中读取一次：调用方在调用 `start` 前把秘密放进槽，`start` 返回后清空。装配先关闭所有传输，再关闭网络资源。传输不关闭网络资源。其余传输机制只能由同包代码使用。配置示例、初始化与释放责任见[使用与定位](docs/context.md)。只从根入口导入本包的可运行示例见 [examples](examples/README.md)。

## 契约

[行为规格](SPEC.md)拥有三段传输、容量、交换、SSE、帧、网络资源与诊断的结果、所有权、失败、取消与生命周期，也拥有秘密只在包内的约束、家族表的解析与失败映射，网关引擎的规划、编码与流解释，以及测试入口的夹具与指纹格式。五个类型的形状与家族作者的行为归[组架构“pi 家族贡献的取得协议”](../docs/architecture.md#pi-家族贡献的取得协议)。公开入口的导航见[公开接口](docs/public-api.md)。

## 设计

三段传输组合包内机制：transport.ts 拥有外层与 prepared 的生命周期，materialized.ts 拥有一次发送的名额与发起，fact-stream.ts 把响应读成事实，termination.ts 是失败映射的纯函数。六个机制模块各回答一个问题：谁可以发、怎样发一次并收场、字节怎样成为事件、事件怎样成为帧、怎样组合与排空、观察怎样隔离。连接池 `PoolAgent` 在 `src/pool-agent.ts`，负责经代理建立连接时的两项控制，理由见[内部架构“经代理建立连接”](docs/architecture.md#经代理建立连接)。网络资源组合并注入容量、连接池与诊断隔离，交换不自行创建它们。模块、交换的相位、资源所有权与设计理由见[内部架构](docs/architecture.md)，时序见[关键流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。家族表与网关引擎见[内部架构](docs/architecture.md)。SSE 分帧与引擎的投影、请求参数、chunk 循环和停止映射改编自 pi，来源见 [UPSTREAM.md](UPSTREAM.md)。

## 配置与运行

所有限额都由调用方给出，本包不设默认值：

- 网络资源：`maxConnections`（容量，即同时在途的交换数；连接池本身不设套接字上限）、`idleConnectionTimeoutMs`（池中空闲连接的关闭时限）、可选的 `tls.ca`、可选的 `proxy`（`url` 与 `bypass`），以及可选的诊断观察者与 `maxPending`。本包不读取 `HTTPS_PROXY` 或 `NO_PROXY`，由调用方在边界把环境映射为 `proxy`。
- 每次交换：`connectTimeoutMs`（从发起到取得已连接的套接字，复用的连接在下一个 tick 结束，`null` 表示不设）与 `maxErrorBodyBytes`。
- SSE 分帧：`maxEventBytes`。协议帧：`endMarker` 与 JSON 限额。
- 三段传输：`network`（装配创建并关闭的网络资源）、`families`、`routes`（每个接收方的 `url` 与 `endMarker`）、`credential`（凭据槽），以及 `limits`（`connectTimeoutMs`、`maxErrorBodyBytes`、`maxEventBytes` 与 `json`）。配置不合规时 `createPiTransport` 同步抛出 `RangeError`。
- 每个计时值最多 2147483647 毫秒，即 Node 定时器接受的最大延迟。

调用方的责任见 [SPEC“调用方责任”](SPEC.md#调用方责任)。

本包负责物理关闭交换、归还名额与排空在途交换。本包只校验头部字符集，不解析、保存或记录凭据。代理 URL 可能含凭据，本包不把它写入消息、结果或诊断。运行需要 Node.js 24 或更高版本。配置代理时需要 Node.js 24.5.0 或更高版本，否则构造失败。运行不需要其他外部程序。

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

经真实代理向 OpenRouter 发一次请求（会产生少量费用）。在仓库根运行，不经 turbo：

```sh
OMNE_LIVE_TESTS=1 pnpm --filter @omne-harness/pi-ai-transport run test:live
```

`test:live` 需要 `HTTPS_PROXY`，代理负责加上 OpenRouter 的凭据。不设 `OMNE_LIVE_TESTS=1` 时用例跳过，命令以 0 退出。设了开关而没有 `HTTPS_PROXY` 时用例失败。`test` 与 `test:slow` 也收录这个文件。turbo 会滤掉未声明的环境变量，所以经 turbo 运行时它总是跳过。

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。慢层需要 PATH 中有 `openssl`，用它生成自签证书。测试分层、夹具与替身见[测试说明](tests/README.md)，覆盖与未覆盖见 [SPEC“组合与验证”](SPEC.md#组合与验证)。

`pnpm run package:template scan --member packages/model/pi-ai-transport` 的读数：

- `integration` 为 `unknown`。原因是 `docs/architecture/constraints.json` 中本成员仍为候选，层未定。这项登记归架构拥有者，结构检查不受影响。
- `adoption` 为 `current`：`package.json` 带有 `typescript-package@3.0.0` 的采用标识，变体为 `module`。`structure` 为 `pass`。
- 加 `--check` 时退出码为 0。这个结果不表示集成核对或业务验收已完成。

## 维护

- 改变家族贡献类型：先改组架构的已接受代码块，再同步 `src/family.ts`、类型测试与[公开接口](docs/public-api.md)。
- 改变机制行为：同步 SPEC、对应测试与[关键流程](docs/flows.md)，并同步三段传输中调用该机制的代码。
- 改变失败映射：同步 `src/termination.ts`、SPEC“事实流”的表与 `tests/termination.spec.ts`。
- 改变改编自 pi 的文件（`src/sse.ts`，或 `src/chat-completions/` 下的 `projection.ts`、`request.ts`、`chunk.ts`、`decoder.ts`）：同步 `provenance.json` 与 `UPSTREAM.md`。
- 增加网关字段或引擎的变化点：修改 `src/chat-completions/vocabulary.ts` 的词表，并增加必填字段。之后每个家族的记录都编译失败，直到写明取值。`src/chat-completions/` 中不得出现厂商名。
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
