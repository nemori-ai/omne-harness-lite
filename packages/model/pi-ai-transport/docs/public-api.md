# 公开接口导航

本文件导航本包的公开边界。精确类型归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/pi-ai-transport` | [index.ts](../src/index.ts)，类型定义在 [family.ts](../src/family.ts) | 只有类型：`PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding`、`PiFamilyContributions` | 实现 pi 家族贡献的家族作者，以及装配家族的代码 |

- 根入口没有运行时导出。导入它只能取得类型。[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对这一点。
- `package.json` 只声明 `.` 一个导出入口，没有 `./cordis` 或 `./testing`。
- 本包不转导 model-contract、json-text、content-block 或 operation-result 的任何名字。

连接容量、HTTP 交换、SSE 分帧、协议帧、网络资源与诊断隔离是包内机制，不经任何入口导出。它们供同包的[阶段二](https://github.com/nemori-ai/omne-harness-lite/issues/446) 2.2 `ModelTransport` 实现使用。本包尚无 `ModelTransport` 实现，因此不提供可以独立运行的传输入口。

## 定义索引

公开类型：

| 类型 | 定义 | 行为条款 |
| --- | --- | --- |
| `PiProtocolFrame` | [family.ts](../src/family.ts) | 产生帧的规则见 [SPEC“协议帧”](../SPEC.md#协议帧) |
| `PiResponseDecoder` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiMaterializedMedia` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiFamilyBinding` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |
| `PiFamilyContributions` | [family.ts](../src/family.ts) | [组架构“pi 家族贡献的取得协议”](../../docs/architecture.md#pi-家族贡献的取得协议) |

五个类型的形状照抄组架构的已接受代码块。改变形状须先改组架构。类型引用的 `Adoption`、`Supplier`、`TransportFact`、`ModelFault` 等定义见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。

包内机制（不导出）：

| 机制 | 源码 | 行为条款 |
| --- | --- | --- |
| 连接容量 | [capacity.ts](../src/capacity.ts) | [SPEC“连接容量”](../SPEC.md#连接容量) |
| HTTP 交换 | [http.ts](../src/http.ts)，含错误类 `ResponseBodyStoppedError`、`ResponseBodyReadError` 与 `ExchangeQueuedError` | [SPEC“发起交换”](../SPEC.md#发起交换)至[“连接超时与连接池”](../SPEC.md#连接超时与连接池)，以及[“秘密与对外事实”](../SPEC.md#秘密与对外事实) |
| SSE 分帧 | [sse.ts](../src/sse.ts) | [SPEC“SSE 分帧”](../SPEC.md#sse-分帧) |
| 协议帧 | [frames.ts](../src/frames.ts) | [SPEC“协议帧”](../SPEC.md#协议帧) |
| 网络资源 | [network.ts](../src/network.ts) | [SPEC“网络资源”](../SPEC.md#网络资源) |
| 诊断隔离 | [diagnostics.ts](../src/diagnostics.ts) | [SPEC“诊断隔离”](../SPEC.md#诊断隔离) |
