# 公开接口导航

本文件导航本包的公开边界。精确类型归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/pi-ai-transport` | [index.ts](../src/index.ts)，家族类型在 [family.ts](../src/family.ts)，配置类型在 [config.ts](../src/config.ts)，工厂在 [transport.ts](../src/transport.ts)，网络资源在 [network.ts](../src/network.ts) | 运行时值 `createPiTransport`、`createNetworkResources`。类型：`PiTransport`、`NetworkConfig`、`NetworkResources`、`ProxyConfig`、`DiagnosticObserver`、`PiTransportConfig`、`PiRoute`、`PiCredentialSlot`、`PiTransportLimits`、`PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding`、`PiFamilyContributions` | 实现 pi 家族贡献的家族作者，以及装配传输与家族的代码 |

- 根入口只有两个运行时导出：`createNetworkResources` 与 `createPiTransport`。[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对这一点。
- `package.json` 只声明 `.` 一个导出入口，没有 `./cordis` 或 `./testing`。
- 本包不转导 model-contract、json-text、content-block 或 operation-result 的任何名字。

连接容量、HTTP 交换、SSE 分帧、协议帧与诊断隔离是包内机制，不经任何入口导出。它们由同包的网络资源与三段传输组合。装配用根入口的 `createNetworkResources` 创建网络资源，再把它作为 `PiTransportConfig.network` 交给 `createPiTransport`。装配拥有网络资源并负责关闭它。`NetworkResources` 的字段引用包内类型。装配只把网络资源交给传输并调用 `close()`，不需要导入这些包内类型。

## 定义索引

公开类型与值：

| 类型或值 | 定义 | 行为条款 |
| --- | --- | --- |
| `createPiTransport`、`PiTransport` | [transport.ts](../src/transport.ts) | [SPEC“三段传输”](../SPEC.md#三段传输) |
| `PiTransportConfig`、`PiRoute`、`PiCredentialSlot`、`PiTransportLimits` | [config.ts](../src/config.ts) | [SPEC“构造”](../SPEC.md#构造) |
| `createNetworkResources`、`NetworkConfig`、`NetworkResources`、`ProxyConfig` | [network.ts](../src/network.ts) | [SPEC“网络资源”](../SPEC.md#网络资源)、[“代理”](../SPEC.md#代理) |
| `DiagnosticObserver` | [diagnostics.ts](../src/diagnostics.ts) | [SPEC“诊断隔离”](../SPEC.md#诊断隔离) |
| `PiProtocolFrame` | [family.ts](../src/family.ts) | 产生帧的规则见 [SPEC“协议帧”](../SPEC.md#协议帧) |
| `PiResponseDecoder` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiMaterializedMedia` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiFamilyBinding` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiFamilyContributions` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |

五个类型的形状照抄组架构的已接受代码块。改变形状须先改组架构。类型引用的 `Adoption`、`Supplier`、`TransportFact`、`ModelFault` 等定义见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。

包内机制（不导出）：

| 机制 | 源码 | 行为条款 |
| --- | --- | --- |
| 三段传输的实现 | [materialized.ts](../src/materialized.ts)、[fact-stream.ts](../src/fact-stream.ts)、[termination.ts](../src/termination.ts)、[payload.ts](../src/payload.ts) | [SPEC“materialize”](../SPEC.md#materialize)至[“关闭”](../SPEC.md#关闭) |
| 连接容量 | [capacity.ts](../src/capacity.ts) | [SPEC“连接容量”](../SPEC.md#连接容量) |
| HTTP 交换 | [http.ts](../src/http.ts)，含错误类 `ResponseBodyStoppedError` 与 `ResponseBodyReadError` | [SPEC“发起交换”](../SPEC.md#发起交换)至[“连接超时与连接池”](../SPEC.md#连接超时与连接池)，以及[“秘密与对外事实”](../SPEC.md#秘密与对外事实) |
| SSE 分帧 | [sse.ts](../src/sse.ts) | [SPEC“SSE 分帧”](../SPEC.md#sse-分帧) |
| 协议帧 | [frames.ts](../src/frames.ts) | [SPEC“协议帧”](../SPEC.md#协议帧) |
| 连接池 | [pool-agent.ts](../src/pool-agent.ts) | [SPEC“网络资源”](../SPEC.md#网络资源)、[“代理”](../SPEC.md#代理) |
| 诊断隔离的事件与计数 | [diagnostics.ts](../src/diagnostics.ts) | [SPEC“诊断隔离”](../SPEC.md#诊断隔离) |
