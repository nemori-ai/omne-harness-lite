# 公开接口导航

本文件索引公开入口与定义。精确类型归源码，行为归 [SPEC.md](../SPEC.md)。端口类型与校验归 [telemetry-contract](../../telemetry-contract/docs/public-api.md)。

## 导出入口

| 入口                                             | 源码                              | 内容                                                         | 依赖 Cordis |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------ | ----------- |
| `@omne-harness/telemetry-cordis-contract`        | [src/index.ts](../src/index.ts)   | 不导出值                                                     | 否          |
| `@omne-harness/telemetry-cordis-contract/cordis` | [src/cordis.ts](../src/cordis.ts) | `TelemetryService`、`telemetryKey`、`Context.telemetry` 增补 | 是          |

调用者资格：提供者继承 `TelemetryService`；发射方的行与应用装配引用 `telemetryKey`。领域实现成员不引用本包。

## 定义索引

| 名字               | 源码                              | 失败行为                                                                  |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| `TelemetryService` | [cordis.ts](../src/cordis.ts)     | 抽象类，自己不抛错；`bind` 的行为归 telemetry-contract TC-1（不抛错）     |
| `telemetryKey`     | [cordis.ts](../src/cordis.ts)     | 常量 `telemetry`，取自 `TelemetryService.provide`（SPEC.md TS-1）         |
