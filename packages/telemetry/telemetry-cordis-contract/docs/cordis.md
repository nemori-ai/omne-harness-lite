# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则见仓库的 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。机制事实按 `@deepseek-ai/cordis` 4.0.4 核对。

## 集成入口

`@omne-harness/telemetry-cordis-contract/cordis` 导出抽象类 `TelemetryService` 和键常量 `telemetryKey`，并把 `Context.telemetry` 增补为 `TelemetryService`。键只写一次：`static readonly provide = 'telemetry'`，`telemetryKey` 取自它。`TelemetryService` `implements` 纯契约的 `TelemetryPort`，第一版只有 `bind`。本包不提供具体插件，不登记事件，也不 `inject` 任何服务。根入口不导出值。

逐条对照 IC：

| IC           | 兑现                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| IC-1         | 遥测接缝只有一个服务定义：本入口的 `TelemetryService`。提供者与消费者都引用它                                                   |
| IC-2         | 键只在抽象类写一次。提供者 `extends` 它，不另写键，也不自己 `ctx.provide`                                                       |
| IC-3         | 抽象 `Service` `implements TelemetryPort`。没有契约 ID，所以 JSDoc 写 `@owner packages/telemetry/telemetry-cordis-contract`     |
| IC-4         | 纯契约在另一个成员 `telemetry-contract`，它的安装闭包里没有 Cordis。本包根入口不导出值、不导入 Cordis；Cordis 值只在 `./cordis` |
| IC-5         | 消费者只引用本包的定义入口与键，不引用提供者的实现入口。提供者选择归应用装配                                                    |
| IC-6         | 一个 isolate 标签下只有一个 `telemetry` 提供者。本包不设受信子树                                                                |
| IC-7         | 键 `telemetry` 是能力名词。成员名 `telemetry-cordis-contract` 表达 Cordis 定义职责。键与契约名不含后端名                        |
| IC-8         | 发射方的行把 `telemetryKey` 写进 `inject` 数组字面量。由应用装配兑现                                                            |
| IC-9         | 没有可选依赖。关闭遥测由在场的禁用提供者表达，由 `telemetry-node` 兑现                                                          |
| IC-10、IC-11 | 本包不声明 Cordis 事件。遥测事件名不是 Cordis `Events`，不经 `ctx.emit` 派发                                                    |
| IC-12        | 本包没有异步控制或通知。端口操作同步且不抛错（telemetry-contract TC-1）                                                         |
| IC-13        | 本包没有登记目录。emitter 是不可变的值，随持有者消失                                                                            |
| IC-14        | 本包没有插件配置。运行预算由提供者用 Schema 校验的配置给出                                                                      |
| IC-15、IC-16 | 定义是代码对象，不进插件树配置。行 id `telemetry` 由应用装配承诺                                                                |
| IC-17        | 会话作用域的遥测靠 `Binding.work`，不靠 Context                                                                                 |
| IC-18        | `scope` 是操作参数，由调用方显式给出，必须由 legal-identity 铸造。服务不授予任何权限                                            |
| IC-19        | span 配对与准入计数只在同一进程内成立。跨进程靠 `Carrier` 与接收方重新绑定兑现（telemetry-contract TC-6）                       |

## 生命周期与清理

本包不创建、不持有、也不释放任何运行时资源。`TelemetryService` 的构造函数只调用 `super(ctx, 'telemetry')`。提供者在自己的插件装载上下文里创建运行时资源，并负责撤除、排空与关闭报告。Service 方法里的 `this.ctx` 是调用方，所以提供者不在 `bind` 里创建或关闭共享资源。`tests/cordis-entry.spec.ts` 用真实 `Context` 核对：子类提供键，消费者按键注入，提供者撤除后键不在场。
