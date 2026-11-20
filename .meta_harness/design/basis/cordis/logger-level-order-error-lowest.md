---
id: logger-level-order-error-lowest
upstream: cordis
version: 4.1.0
kind: positive
symbols:
  - "logger.ts: const enum LoggerLevel { ERROR = 0, WARN = 1, INFO = 2, DEBUG = 3 }——数越大越啰嗦，ERROR 最低"
  - "logger.ts: Logger._method 对每个 exporter 取 targetLevel = exporter.levels?.[name] ?? exporter.levels?.default ?? logger.level ?? INFO；targetLevel < level 即丢弃"
  - "logger.ts: LoggerService.exporter(exporter) 经 ctx.effect 登记，随 fiber 撤除"
lines:
  - "logger.ts:22-27"
  - "logger.ts:154-158"
  - "logger.ts:236-242"
probe: packages/assembly/kernel-basis/tests/logger-level-order-error-lowest.spec.ts
checked: 2026-11-20
---

# logger 的级别序是 ERROR 0 < WARN 1 < INFO 2 < DEBUG 3，缺省导出到 INFO

## 读数

Cordis 的日志级别数值是 ERROR 0、WARN 1、INFO 2、DEBUG 3，数越大越啰嗦。
exporter 的阈值是「最多导出到哪一级」，**缺省是 INFO**。于是没配阈值的 exporter 收到 error、warn、info，只丢 debug。
`LoggerLevel` 是 `const enum`，在按模块单独编译的消费者里运行期不存在，只能用数值或自己的常量。

**想当然的理解**：数值与 4.0.4 相同，`levels: { default: 2 }` 的意思是「放宽到 WARN」。

**实际（4.1.0 取证）**：4.0.4 的 INFO 是 1、WARN 是 2，4.1.0 把两者对调。阈值 2 在两版里导出的都是 error、warn、info 这三级，
所以写着 `levels: { default: 2 }` 的装配行为不变；变的是这个 2 的名字，它现在是 INFO，也是缺省值。
要只收 error 与 warn，阈值写 1。代码里写死的级别数值要带注释说明它是哪一级。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `LoggerLevel` | 四个数值 | exporter 阈值 3 时依次发 error、info、warn、debug，收到的消息 `level` 依次是 0、2、1、3 |
| `_method` 的阈值判断 | 缺省 INFO | 无阈值的 exporter 收到 error、info、warn，不收 debug |
| `levels.default` | 可收紧也可放宽 | 阈值 1 时只收到 error 与 warn；阈值 2 时与无阈值相同 |

## 探针断言什么

探针在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，针对 Cordis 4.1.0 核对：

1. exporter 的 `levels.default` 为 3 时，依次发 error、info、warn、debug，收到的消息 `level` 依次是 0、2、1、3。
2. exporter 不配阈值时，收到 error、info、warn，debug 被丢。
3. exporter 的 `levels.default` 为 1 时，只收到 error 与 warn。
4. exporter 的 `levels.default` 为 2 时，info 与 warn 可见，debug 不可见。

上游若改动级别数值或缺省阈值，四条中至少一条失败。本条目随之失效。
