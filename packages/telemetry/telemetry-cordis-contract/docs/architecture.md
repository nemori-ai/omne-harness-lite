# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。组级位置见[遥测能力组](../../README.md)，集成规则见仓库的 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

## 模块与依赖

| 模块            | 拥有什么                                                   | 依赖                                                                  |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/index.ts`  | 根入口，不导出值                                           | 无                                                                    |
| `src/cordis.ts` | `TelemetryService`、`telemetryKey` 与 `Context.telemetry` 增补 | `@deepseek-ai/cordis`；`@omne-harness/telemetry-contract` 的类型（只在声明里） |

依赖方向：本包依赖纯契约，纯契约不认识本包。提供者 `telemetry-node` 与应用 `apps/harness-server` 依赖本包的 `./cordis`。构建产物 `cordis.js` 在运行时只到达 `@deepseek-ai/cordis`；`cordis.d.ts` 另到达 `@omne-harness/telemetry-contract`。

本包没有可变状态。

## 关键机制与理由

- **分包而不是分入口。** `dependencies` 属于整个包：纯契约与 Cordis 定义同包时，只用根入口的领域成员安装闭包里也有 Cordis，Agent 的公开入口测试变红。分成两个成员，照 `model-contract` 与 `model-cordis-contract` 的先例，纯契约的安装闭包就没有 Cordis（IC-4）。代价是多一个成员，提供者与发射行各多一条依赖。
- **键只写一次。** `static readonly provide = 'telemetry'`，`telemetryKey` 取自它；`Service` 构造函数用同一个值 `ctx.provide`。提供者继承就得到键，不会写出第二个键（IC-2）。
- **服务实现端口。** `TelemetryService implements TelemetryPort`，所以消费者经 `ctx.telemetry` 看到的形状与纯契约的端口相同；替身与真实提供者对领域代码没有区别。
- **服务不持有资源。** 构造函数只调用 `super`。运行时资源由提供者在自己的插件上下文创建，关闭报告也归提供者。这样换提供者不改服务定义。

## 验证与维护

保证与测试的对应见 SPEC.md 的[组合与验证](../SPEC.md#组合与验证)。改动下列内容时，同步列出的消费者：

- 键 `telemetry`：`telemetry-node` 的插件、`apps/harness-server` 的 `telemetry` 行与每个发射行的 `inject`、`src/s0/aa-rows.json` 与装配页。
- 服务的方法：先改 `telemetry-contract` 的 `TelemetryPort`，再改本包，再改 `telemetry-node` 与捕获替身。
