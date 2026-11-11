# Cordis 集成

本包不集成 Cordis。它没有 `./cordis` 入口，不导入 `@deepseek-ai/cordis`，生产安装闭包里没有 Cordis（IC-4）。`tests/public-entry.spec.ts` 遍历构建产物的导入，并沿 `package.json` 的 workspace 依赖核对没有通向 Cordis 的路径。

## 集成入口

遥测的唯一 Cordis 服务定义 `telemetry`（抽象类 `TelemetryService`、键常量 `telemetryKey`、`Context.telemetry` 增补）归成员 [telemetry-cordis-contract](../../telemetry-cordis-contract/docs/cordis.md)。该成员依赖本包的 `TelemetryPort`、`Binding` 与 `Emitter`。提供者继承那里的服务；发射方的行从那里取键。

本包与 Cordis 的关系只有一条：本包的类型与校验函数被服务定义和提供者消费。逐条 IC 对照见 [telemetry-cordis-contract 的 Cordis 页](../../telemetry-cordis-contract/docs/cordis.md#集成入口)。

## 生命周期与清理

本包不创建、不持有、也不释放任何运行时资源。定义、绑定与 emitter 都是不可变的值（SPEC.md「所有权、失败与生命周期」）。提供者的装载、撤除与关闭报告归 `telemetry-node`。
