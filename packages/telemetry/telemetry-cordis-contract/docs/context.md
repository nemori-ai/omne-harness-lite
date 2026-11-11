# 使用与定位

本文件说明消费方怎样使用本包，以及本包在系统与[遥测能力组](../../README.md)中的位置。系统层的观测要求归[横切概念](../../../../docs/architecture/cross-cutting-concepts.md)。

## 使用方式

- **提供者**从 `./cordis` 导入 `TelemetryService`，继承它并实现 `bind` 与 `discard`。运行时资源在提供者自己的插件上下文创建。
- **发射方的行**从 `./cordis` 导入 `telemetryKey`，写进 `inject` 数组字面量，在行体里用 `ctx.telemetry.bind(binding)` 取得 emitter，再交给成员工厂已有的可选参数。
- **领域实现成员**不依赖本包。它只依赖 `telemetry-contract` 的根入口，经回调参数接收 emitter。
- **领域测试**不依赖本包。它用 `telemetry-contract/testing` 的捕获替身。

最小示例见 [README](../README_ZH.md#使用)。本包没有初始化与释放。

## 消费者与定位

本包是遥测能力组的 Cordis 定义成员，位于纯契约 `telemetry-contract` 与提供者 `telemetry-node` 之间。具名消费者：

| 消费者                              | 用到什么                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `packages/telemetry/telemetry-node` | `TelemetryService`（`./cordis` 的两个插件工厂继承它）         |
| `apps/harness-server`               | `telemetryKey`（`telemetry` 行提供，`server-entry` 行注入）   |

依赖方向：本包依赖 `telemetry-contract` 与 `@deepseek-ai/cordis`；提供者与应用依赖本包；纯契约与领域成员不依赖本包。
