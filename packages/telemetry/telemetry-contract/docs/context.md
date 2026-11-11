# 使用与定位

本文件说明消费方怎样使用本包，以及本包在系统与[遥测能力组](../../README.md)中的位置。系统层的观测要求归[横切概念](../../../../docs/architecture/cross-cutting-concepts.md)。

## 使用方式

- **发射领域**只依赖根入口。它在自己的实现成员里声明定义，并经已有的回调参数接收 emitter。领域成员不认识 `telemetry` 服务键，它的安装闭包里没有 Cordis。
- **服务定义**成员 `telemetry-cordis-contract` 依赖根入口：它的抽象 `TelemetryService` 实现 `TelemetryPort`。
- **提供者**依赖根入口与 `telemetry-cordis-contract/cordis`。它继承 `TelemetryService`，实现 `bind`，并用 `validateBinding` 与 `validateFields` 判定准入。
- **应用装配**把提供者装成 `telemetry` 行。发射方的行把 `telemetry-cordis-contract` 的 `telemetryKey` 写进 `inject`，在行体里构造 facade。
- **领域测试**用 `./testing` 的捕获替身断言字段与段归属，不需要 Cordis。

## 消费者与定位

本包是遥测能力组的纯契约成员。具名消费者如下：

| 消费者                                              | 用到什么                                                                                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/telemetry/telemetry-cordis-contract`      | `TelemetryPort`、`Binding`、`Emitter`（类型）                                                                                                                                          |
| `packages/telemetry/telemetry-node`                 | `Binding`、`Emitter`、`Segment`、`Admission`、`DropReason`、`CloseReport`、`validateBinding`、`validateFields`、`encodeCarrier`、`decodeCarrier`、`define*`、`isSegment`、`TELEMETRY_LIMITS` |
| `apps/harness-server`                               | `defineEvent`（入口诊断事件，含可选字段）、`validateFields`、`Fields`、`TelemetryPort`、`CloseReport`                                                                                  |
| Session 与 Agent 的遥测 facade                      | `define*`、`Binding`、`Emitter`、`./testing`                                                                                                                                           |

依赖方向：领域实现成员、服务定义成员与提供者依赖本包，本包只依赖 `@omne-harness/legal-identity`。
