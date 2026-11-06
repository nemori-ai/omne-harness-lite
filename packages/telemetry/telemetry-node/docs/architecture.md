# 内部架构

本文件说明本包的模块划分、依赖方向、状态与资源归属，以及关键机制和理由。行为条款归 [SPEC.md](../SPEC.md)。

## 模块

| 模块             | 职责                                                                          | 依赖                                     |
| ---------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| `options.ts`     | 选项类型与一次性校验（TN-1）                                                  | telemetry-contract、legal-identity       |
| `record.ts`      | `TelemetryRecord` 的形状、scope 的记录形式、`log` 记录的构造                  | telemetry-contract、legal-identity       |
| `outlet.ts`      | 两种出口：`writer` 包住应用的写函数，`file` 包住 Pino 同步 destination        | `pino` 10.4.0                            |
| `pipeline.ts`    | 有界队列、计数、限频摘要、排空与关闭报告（TN-2 的容量部分、TN-4、TN-5、TN-7） | outlet 的接口                            |
| `emitter.ts`     | 端口：绑定快照、定义核对、字段校验、记录构造、段（TN-2、TN-3、TN-6）          | telemetry-contract、pipeline 的接口      |
| `runtime.ts`     | 组装上面四个模块，提供 `ingestLog`                                            | 以上全部                                 |
| `summary.ts`     | 离线聚合遥测记录（TN-11），纯函数                                             | 无运行时依赖                             |
| `summary-cli.ts` | 命令 `omne-telemetry-summary`：读文件或标准输入，输出报告                     | `summary.ts`                             |
| `disabled.ts`    | 禁用实现（TN-8）                                                              | telemetry-contract 的类型                |
| `log-bridge.ts`  | Cordis 日志桥（TN-9）                                                         | `@deepseek-ai/cordis`、record            |
| `cordis.ts`      | 两个插件工厂与日志桥的出口（TN-10）                                           | `@deepseek-ai/cordis`、契约的 `./cordis` |

依赖方向：根入口（`index.ts`）只到达前七个模块，不到达 Cordis。`cordis.ts` 与 `log-bridge.ts` 只从 `./cordis` 入口发布。

## 状态与资源归属

- 队列、计数、打开的段数与关闭状态只在 pipeline 的闭包里。只有 pipeline 改写它们，emitter 只经 pipeline 的接口准入或丢弃。
- 绑定快照与段的结束状态在 emitter 的闭包里，随 emitter 或段对象一起消失。
- `file` 出口的 SonicBoom 实例归 outlet，由 `close` 或 `abandon` 结束。
- 日志桥的状态（引导、就绪、直写、关闭后）、引导缓冲与计数在桥的闭包里。桥只借用运行时，不关闭它。
- 插件类只捕获应用交入的运行时，不创建资源。

## 关键机制与理由

- **准入同步，排空异步。** 准入只做校验、序列化测量与入队，开销有上限。排空放到 `setImmediate`，所以调用方从不等待出口，关闭时的「排空到边界」也有实际含义。
- **每条记录单独写出。** 出口失败只计一次输出错误，不影响同一批里的其他记录。
- **先拷贝，后校验。** 绑定与字段先取冻结拷贝，再交给契约的校验函数。所以校验的值与写出的值相同，调用方之后的修改或读取时变化的代理对象都不影响记录。
- **定义用契约的 `define*` 重新核对。** 规则只在契约里写一份。冻结的定义按对象身份缓存核对结果，所以热路径上只核对一次。
- **期限按单调时钟。** 关闭的排空在每条记录之前比较 `clock.monotonicMs()` 与期限。时钟由应用交入，所以期限行为可以确定地测试。
- **自监控不经过本管线。** 摘要直接调用应用交入的 `summary`，并按间隔限频。这避免出口故障递归写回队列。
- **`file` 出口用同步 destination。** Pino 10.4.0 的 SonicBoom 在同步模式下用 `fs.openSync` 打开文件，用 `fs.writeSync` 写入。打开失败在创建时抛出，写入失败在 `write` 返回前发出 `error`。所以 `write` 返回就表示到达 `local-sink` 边界。
