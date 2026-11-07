# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则见仓库的 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。机制事实按 `@deepseek-ai/cordis` 4.0.4 核对。

## 集成入口

`@omne-harness/telemetry-node/cordis` 导出两个插件工厂与日志桥：

- `createTelemetryNodePlugin({ runtime })` 返回 `TelemetryNodePlugin`，`createDisabledTelemetryPlugin({ runtime })` 返回 `DisabledTelemetryPlugin`。两个类都继承 `@omne-harness/telemetry-cordis-contract/cordis` 的 `TelemetryService`，`bind` 交给 `runtime.port`。
- `createCordisLogBridge(options)` 返回一个 exporter 与它的状态操作。exporter 设 `levels.default` 为 2（WARN），`colors` 为假，文本用 `Logger.format` 生成。

逐条对照 IC：

| IC           | 兑现                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| IC-1、IC-2   | 插件继承契约的 `TelemetryService`，不另写键，也不自己 `ctx.provide`                                    |
| IC-3         | 服务定义与 `@owner` 归 telemetry-cordis-contract。本包只提供实现                                       |
| IC-4         | 根入口不导入 Cordis。`tests/public-entry.spec.ts` 遍历构建产物核对                                     |
| IC-5         | 发射方只引用契约的定义入口与键。本包的实现入口只由应用装配引用                                         |
| IC-6         | 应用在一个 isolate 标签下只装一个 `telemetry` 提供者。本包不设受信子树                                 |
| IC-7         | 成员名 `telemetry-node` 表达实现方式。键与契约名不含 `pino`                                            |
| IC-8、IC-9   | 插件 `inject` 为空。没有可选依赖。关闭遥测由禁用插件表达，它是在场的提供者                             |
| IC-10、IC-11 | 本包不声明 Cordis 事件，不用 `ctx.emit`                                                                |
| IC-12        | `close` 直接返回 Promise。日志桥的 exporter 用 try/catch，不向记日志的一方抛错                         |
| IC-13        | 本包不登记贡献目录。emitter 是不可变的值                                                               |
| IC-14        | 插件没有配置。预算由应用的配置给出，本包不给默认值，非法预算让 `createTelemetryRuntime` 抛 `TypeError` |
| IC-15、IC-16 | 运行时、定义与 Pino 实例是运行时对象，不进插件树配置。插件工厂经闭包取得运行时                         |
| IC-17        | 会话作用域靠 `Binding.work`，不靠 Context                                                              |
| IC-18        | `scope` 由调用方给出。本包不从 scope 推断权限                                                          |
| IC-19        | 段配对与准入计数只在同一进程内成立。跨进程靠 `Carrier` 与接收方重新绑定                                |

## 生命周期与清理

插件不创建资源。应用在插件之外创建运行时，并在关闭步骤里显式关闭它。插件构造时用 `ctx.effect` 登记一个兜底：fiber 结束时调用 `runtime.close(0)`。Cordis 的 effect 并发释放，不保证次序，所以兜底不承担排空。应用先关闭时，兜底得到已有的报告，什么也不做。

Service 方法里的 `this.ctx` 是调用方，所以 `bind` 不创建也不关闭资源。日志桥的 exporter 由 `root.logger.exporter` 登记，随登记它的 fiber 撤除。`tests/cordis-entry.spec.ts` 与 `tests/log-bridge.spec.ts` 用真实 `Context` 核对这些行为。
