# 公开接口导航

本文件导航本包的公开边界。精确类型归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口 | 源码 | 导出 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/pi-ai-transport` | [index.ts](../src/index.ts)，家族类型在 [family.ts](../src/family.ts)，配置类型在 [config.ts](../src/config.ts)，工厂在 [transport.ts](../src/transport.ts)，网络资源在 [network.ts](../src/network.ts) | 运行时值 `createPiTransport`、`createNetworkResources`、`defineFamily`、`composeFamilies`、`recordAdoption`、`replayFormatsOf`。类型：`PiFamily`、`PiFamilySpec`、`PiModelRecordHead`、`PiReplayFormats`、`PiTransport`、`NetworkConfig`、`NetworkResources`、`ProxyConfig`、`DiagnosticObserver`、`PiTransportConfig`、`PiRoute`、`PiCredentialSlot`、`PiTransportLimits`、`PiProtocolFrame`、`PiResponseDecoder`、`PiMaterializedMedia`、`PiFamilyBinding`、`PiFamilyContributions` | 实现 pi 家族贡献的家族作者，以及装配传输与家族的代码 |
| `@omne-harness/pi-ai-transport/chat-completions` | [chat-completions/index.ts](../src/chat-completions/index.ts)，入口在 [bind.ts](../src/chat-completions/bind.ts)，校准算术在 [calibration.ts](../src/chat-completions/calibration.ts)，共用计量规则在 [measurement.ts](../src/chat-completions/measurement.ts)，类型在 [vocabulary.ts](../src/chat-completions/vocabulary.ts) | 运行时值 `bindChatCompletions`、`calibratedAmount`、`calibratedMethod`、`calibratedDigest`、`unitExtras`、`ANCHORED_METHOD`、`NO_CALIBRATION`。类型：`ChatCompletionsBindingInput`、`CalibrationArithmeticInput`、`CalibratedAmount`、`MeterUnits`、`ChatCompletionsLimits`、`ChatCompletionsRecord`、`WireProfile`、`ServingPin`、`GatewayParam`、`GatewayField`、`FieldsOfValue`、`ParameterKind`、`ParameterValue`、`ParameterAccept`、`ParameterWire`、`ParameterRule`、`ParameterTable`、`ExtensionRule`、`VendorHooks`、`ReasoningCodec`、`ReasoningDetail`、`ReplayPart`、`ReplaySource`、`ReplayWire`、`GatewayUsage`、`ChatUsageItem`、`FamilyMeter`、`ProjectedRequest`、`ProjectedTurn`、`ProjectedPart` | 用网关引擎产生绑定的家族包 |
| `@omne-harness/pi-ai-transport/testing` | [testing/index.ts](../src/testing/index.ts)，夹具检查在 [fixtures.ts](../src/testing/fixtures.ts)，指纹在 [adoptions.ts](../src/testing/adoptions.ts) | 运行时值 `checkChatCompletionsFixtures`、`fixtureDirectory`、`FIXTURE_FILES`、`GATEWAY_END_MARKER`、`checkAdoptionFingerprints`、`appendAdoptionFingerprints`、`renderFingerprints`。类型：`FixtureReport`、`AdoptionFingerprint`、`FingerprintReport` | 家族包的测试与指纹生成脚本。它读写文件，不供运行中的装配使用 |

- 根入口的运行时导出是 `createNetworkResources`、`createPiTransport` 与家族表的四个函数。子入口 `./chat-completions` 的运行时导出是上表的七个名字。子入口 `./testing` 的运行时导出是上表的七个名字。[public-entry.spec.ts](../tests/public-entry.spec.ts) 核对这三点，并核对引擎内部不可经包导出访问。
- `package.json` 声明 `.`、`./chat-completions` 与 `./testing` 三个导出入口，没有 `./cordis`。
- 本包不转导 model-contract、json-text、content-block 或 operation-result 的任何名字。

连接容量、HTTP 交换、SSE 分帧、协议帧与诊断隔离是包内机制，不经任何入口导出。它们由同包的网络资源与三段传输组合。装配用根入口的 `createNetworkResources` 创建网络资源，再把它作为 `PiTransportConfig.network` 交给 `createPiTransport`。装配拥有网络资源并负责关闭它。`NetworkResources` 是不透明句柄：包外只能调用它的 `close()`，连接池、在途登记与容量都不可达。只有 `createNetworkResources` 能建立句柄。`createPiTransport` 收到其他对象时同步抛出 `RangeError`。

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
| `defineFamily`、`composeFamilies`、`recordAdoption`、`replayFormatsOf`、`PiFamily`、`PiFamilySpec`、`PiModelRecordHead`、`PiReplayFormats` | [family-table.ts](../src/family-table.ts) | [SPEC“家族表”](../SPEC.md#家族表) |
| `bindChatCompletions` 与 `./chat-completions` 的类型 | [bind.ts](../src/chat-completions/bind.ts)、[vocabulary.ts](../src/chat-completions/vocabulary.ts) | [SPEC“网关引擎：请求”](../SPEC.md#网关引擎请求)、[“网关引擎：流解释”](../SPEC.md#网关引擎流解释) |
| `./testing` 的值与类型 | [fixtures.ts](../src/testing/fixtures.ts)、[adoptions.ts](../src/testing/adoptions.ts) | [SPEC“家族测试助手”](../SPEC.md#家族测试助手) |

五个类型的形状照抄组架构的已接受代码块。改变形状须先改组架构。`PiFamilyBinding.replayFormat` 是这次发出产出的回放格式，记录没有回放格式时为 `null`。传输把非 `null` 的值写入物化回执的 `replayFormat`。`PiFamilyBinding.encode` 的输入含该供应商的回放声明（`declaration`）与再发略去集合（`resent`），结果含编码诊断（`diagnostics`）。网关引擎的 `VendorHooks.usage` 返回 `ChatUsage`（`items` 与 `usage-inconsistent` 诊断），类型 `ChatUsage` 与 `UsageDiagnostic` 从 `./chat-completions` 导出。类型引用的 `Adoption`、`Supplier`、`TransportFact`、`ModelFault` 等定义见 [model-contract 公开接口](../../model-contract/docs/public-api.md)。

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
| 规范 JSON 与摘要 | [canonical-json.ts](../src/canonical-json.ts) | [SPEC“记录与采用”](../SPEC.md#记录与采用) |
| 网关引擎的规划、投影与请求体 | [request.ts](../src/chat-completions/request.ts)、[projection.ts](../src/chat-completions/projection.ts)、[parameters.ts](../src/chat-completions/parameters.ts)、[gateway.ts](../src/chat-completions/gateway.ts)、[json.ts](../src/chat-completions/json.ts) | [SPEC“网关引擎：请求”](../SPEC.md#网关引擎请求) |
| 网关引擎的流解码器 | [decoder.ts](../src/chat-completions/decoder.ts)、[chunk.ts](../src/chat-completions/chunk.ts)、[details.ts](../src/chat-completions/details.ts)、[decimal.ts](../src/chat-completions/decimal.ts) | [SPEC“网关引擎：流解释”](../SPEC.md#网关引擎流解释) |
