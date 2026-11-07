# 公开接口导航

本文件索引公开入口与定义。精确类型归源码，行为归 [SPEC.md](../SPEC.md)。

## 导出入口

| 入口                                  | 源码                              | 内容                                                                                             | 依赖 Cordis |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| `@omne-harness/telemetry-node`        | [src/index.ts](../src/index.ts)   | `createTelemetryRuntime`、`createDisabledTelemetry` 与运行时的类型                               | 否          |
| `@omne-harness/telemetry-node/cordis` | [src/cordis.ts](../src/cordis.ts) | `createTelemetryNodePlugin`、`createDisabledTelemetryPlugin`、`createCordisLogBridge` 与相关类型 | 是          |

## 定义索引

| 名字                                                                                 | 源码                                    | 失败行为                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| `createTelemetryRuntime`、`TelemetryRuntime`                                         | [runtime.ts](../src/runtime.ts)         | 非法选项抛 `TypeError`；打不开的文件抛 `Error`；操作不抛错 |
| `summarizeTelemetry`、`TelemetrySummary` 等报告类型                                  | [summary.ts](../src/summary.ts)         | 纯函数；坏行跳过并计数，不抛错                             |
| 命令 `omne-telemetry-summary`                                                        | [summary-cli.ts](../src/summary-cli.ts) | 用法错误退出码 2，读失败退出码 1                           |
| `TelemetryRuntimeOptions`、`TelemetryBudgets`、`TelemetryOutlet`、`TelemetryClock`   | [options.ts](../src/options.ts)         | 类型                                                       |
| `TelemetryRecord`、`LogRecordInput`、`LogLevel`、`RecordScope`                       | [record.ts](../src/record.ts)           | 类型                                                       |
| `createDisabledTelemetry`                                                            | [disabled.ts](../src/disabled.ts)       | 不抛错                                                     |
| `createTelemetryNodePlugin`、`createDisabledTelemetryPlugin`、`TelemetryPluginClass` | [cordis.ts](../src/cordis.ts)           | 插件类；兜底关闭不拒绝                                     |
| `createCordisLogBridge`、`CordisLogBridge`、`CordisLogBridgeCounts`                  | [log-bridge.ts](../src/log-bridge.ts)   | 非法容量或文本上限抛 `TypeError`；exporter 不抛错          |

调用者资格：应用装配创建运行时、日志桥与插件。领域成员不导入本包，它们只依赖 telemetry-contract（IC-5）。
