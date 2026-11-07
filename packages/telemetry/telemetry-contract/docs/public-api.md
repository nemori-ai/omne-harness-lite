# 公开接口导航

本文件索引公开入口与定义。精确类型与运行时校验归源码，行为归 [SPEC.md](../SPEC.md)。Cordis 服务定义与键不在本包，见 [telemetry-cordis-contract](../../telemetry-cordis-contract/docs/public-api.md)。

## 导出入口

| 入口                                       | 源码                                            | 内容                                         | 依赖 Cordis |
| ------------------------------------------ | ----------------------------------------------- | -------------------------------------------- | ----------- |
| `@omne-harness/telemetry-contract`         | [src/index.ts](../src/index.ts)                 | 纯契约的类型与函数                           | 否          |
| `@omne-harness/telemetry-contract/testing` | [src/testing/index.ts](../src/testing/index.ts) | `createCapturingTelemetry`、`CapturedRecord` | 否          |

## 定义索引

| 名字                                                                                                       | 源码                                        | 失败行为                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `OwnedRef`、`TelemetryScope`、`Binding`、`validateBinding`                                                 | [binding.ts](../src/binding.ts)             | `validateBinding` 不抛错，答 `invalid`                       |
| `FieldRule`（可带 `optional: true`）、`FieldSchema`、`LabelRule`、`LabelSchema`、`Fields`                  | [definitions.ts](../src/definitions.ts)     | 类型；`Fields` 把可选字段的键变成可省略                      |
| `EventDefinition`、`MetricDefinition`、`SegmentDefinition`、`defineEvent`、`defineMetric`、`defineSegment` | [definitions.ts](../src/definitions.ts)     | 非法定义抛 `TypeError`                                       |
| `validateFields`                                                                                           | [fields.ts](../src/fields.ts)               | 不抛错，答 `invalid`；可选字段缺席答 `ok`                    |
| `Carrier`、`encodeCarrier`、`decodeCarrier`                                                                | [carrier.ts](../src/carrier.ts)             | `encodeCarrier` 抛 `TypeError`；`decodeCarrier` 答 `invalid` |
| `TELEMETRY_LIMITS`、`ValidationResult`                                                                     | [limits.ts](../src/limits.ts)               | 常量与类型                                                   |
| `DropReason`、`DiscardReason`、`DISCARD_REASONS`、`TelemetryDefinition`、`Admission`、`Segment`、`Emitter`、`TelemetryPort`、`CloseDropReason`、`CloseReport`、`isSegment` | [port.ts](../src/port.ts)                   | 端口操作不抛错（SPEC.md TC-1）；`discard` 的无效输入答 `dropped(invalid)`（TC-15）；`CloseReport.droppedBy` 的键是 `CloseDropReason`，`dropped` 是各项之和（TC-15） |
| `createCapturingTelemetry`、`CapturedRecord`                                                               | [testing/index.ts](../src/testing/index.ts) | 非法 `capacity` 抛 `TypeError`；操作不抛错                   |
