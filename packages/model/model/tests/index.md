# Model 测试索引

- [测试范围与运行入口](README.md)。
- [根入口与源码边界测试](public-entry.spec.ts)。
- [凭据判定测试](judgment.spec.ts)。
- [安装闭包场景](install/scenario.mjs)：经消费目录里安装的包调用 `deliver` 与判定。
- [测试夹具](fixtures/index.md)。

- [请求准入与参数](memory-admission.spec.ts)、[内存身份与恢复](memory-core.spec.ts)、[发出与流](memory-dispatch.spec.ts)、[读/ACK/清理](memory-consumption.spec.ts)。
- [构造与五端口](runtime-testing.spec.ts)、[合法身份与受信测试适配](memory-fixture.ts)。

[memory-partial.spec.ts](memory-partial.spec.ts) 从实际 preserve 驱动部分结果、真实 trim、目标页、临界容量的控制/终局/读/ACK/清理。
