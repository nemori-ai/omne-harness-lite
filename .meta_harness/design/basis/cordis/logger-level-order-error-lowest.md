---
id: logger-level-order-error-lowest
upstream: cordis
version: 4.0.4
kind: positive
symbols:
  - "logger.ts: const enum LoggerLevel { ERROR = 0, INFO = 1, WARN = 2, DEBUG = 3 }——数越大越啰嗦，ERROR 最低"
  - "logger.ts: Logger._method 对每个 exporter 取 targetLevel = exporter.levels?.[name] ?? exporter.levels?.default ?? logger.level ?? INFO；targetLevel < level 即丢弃"
  - "logger.ts: LoggerService.exporter(exporter) 经 ctx.effect 登记，随 fiber 撤除"
lines:
  - "logger.ts:22-27"
  - "logger.ts:154-158"
  - "logger.ts:231-237"
probe: packages.0.0.1.legacy/core/kernel-basis/tests/basis/logger-level-order-error-lowest.test.ts
checked: 2026-09-23
---

# logger 的级别序是 ERROR 0 < INFO 1 < WARN 2 < DEBUG 3，缺省只导出到 INFO

## 读数

Cordis 的日志级别不是常见的「warn 比 info 严重、阈值往上收」：数值 ERROR 0、INFO 1、WARN 2、DEBUG 3，
exporter 的阈值是「最多导出到哪一级」，**缺省是 INFO**。于是 `logger.warn(...)` 与 `logger.debug(...)` 在没配阈值的 exporter 上一律被丢。
`LoggerLevel` 是 `const enum`，在按模块单独编译的消费者里运行期不存在，只能用数值或自己的常量。

**想当然的理解**：warn 比 info 更该被看见，默认一定导出。

**实际（4.0.4 取证）**：warn 级诊断默认看不见。装配（tenancy-host）要看到各节点的 warn 级诊断（例如通知处理者抛出、
升级不可撤回 U-3 这类），必须给它登记的 exporter 配 `levels: { default: 2 }` 或更高；不配就是静默。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `LoggerLevel` | 四个数值 | exporter 阈值 3 时收到的四条消息 `level` 依次是 0、1、2、3 |
| `_method` 的阈值判断 | 缺省 INFO | 无阈值的 exporter 只收到 error 与 info |
| `levels.default` | 可放宽 | 阈值 2 时 warn 可见、debug 不可见 |
