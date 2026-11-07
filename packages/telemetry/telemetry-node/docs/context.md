# 使用与定位

本文件说明消费方怎样使用本包，以及本包在系统与[遥测能力组](../../README.md)中的位置。系统层的观测要求归[横切概念](../../../../docs/architecture/cross-cutting-concepts.md)。

## 使用方式

- **应用装配**创建运行时并持有它，把 `createTelemetryNodePlugin({ runtime })` 装成 `telemetry` 行。不需要遥测时，装 `createDisabledTelemetryPlugin({ runtime: createDisabledTelemetry() })`。
- **应用入口**在装载任何行之前创建日志桥，把 `bridge.exporter` 登记在根 logger 上。`telemetry` 行 ACTIVE 后调用 `attach`。关闭步骤先调用 `detach`，再关闭运行时。
- **应用的关闭步骤**在存储关闭之后先调用 `bridge.detach()`，再调用 `runtime.close(deadlineMs)`，把 `CloseReport` 与 `bridge.counts()` 写进关闭报告。
- **发射方的行**只经 `ctx.telemetry` 使用契约的端口，不导入本包。

## 消费者与定位

本包是遥测能力组的提供者成员。具名消费者如下：

| 消费者                      | 用到什么                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/harness-server`       | `createTelemetryRuntime`、`createDisabledTelemetry`、`TelemetryRecord`、`TelemetryRuntimeOptions`、`createTelemetryNodePlugin`、`createDisabledTelemetryPlugin`、`createCordisLogBridge` |

依赖方向：本包依赖 telemetry-contract、legal-identity、`@deepseek-ai/cordis` 与 `pino`。没有领域成员依赖本包。
