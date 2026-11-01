# Model 测试索引

- [测试范围与运行入口](README.md)。
- [根入口与源码边界测试](public-entry.spec.ts)。
- [凭据判定测试](judgment.spec.ts)。
- [独立执行组合](execute.spec.ts)、[准备结果读取](execute-outcome.spec.ts)、[取消与资源生命周期](execute-lifecycle.spec.ts)、[传输提供者符合性](execute-transport.spec.ts)、[公开类型消费](execute.spec-d.ts)。
- [安装闭包场景](install/scenario.mjs)：经消费目录里安装的包调用 `executeModel`、`deliver`、判定及真实受理、首次分派与实例观察。
- [测试夹具](fixtures/index.md)。

- [请求准入与参数](memory-admission.spec.ts)、[内存身份与恢复](memory-core.spec.ts)、[发出与流](memory-dispatch.spec.ts)、[发出边界的拒绝](memory-dispatch-refusals.spec.ts)、[收场的回放](memory-replay.spec.ts)、[读/ACK/清理](memory-consumption.spec.ts)。
- [账目共用套件](commands-accounts.spec.ts)：账目规则、清理后仍可读的消息身份、缺回放格式的收场整批被拒。
- [真实受理、首次分派与完整符合性](runtime-admission.spec.ts)。
- [实例观察](runtime-observation.spec.ts)、[原流保存及交错](runtime-receive.spec.ts)、[受控外部流与宿主](runtime-fixture.ts)。
- [原流交接、确认推进、刷新乱序与驱动锁](runtime-transitions.spec.ts)。
- [quiesce 的受理闸门、认回与 pending/running 计数](runtime-quiesce.spec.ts)。
- [取消对发送的停止请求](send-interruption.spec.ts)：只停被取消调用的发送，保留驱动信号，流结束后不再停止。
- [构造与五端口](runtime-testing.spec.ts)、[合法身份与受信测试适配](memory-fixture.ts)。

[memory-partial.spec.ts](memory-partial.spec.ts) 从实际 preserve 驱动部分结果、真实 trim、目标页、临界容量的控制/终局/读/ACK/清理。

[runtime-settlement.spec.ts](runtime-settlement.spec.ts)验证真实 driver 的原终局收场、未知认回、确定竞争、晚到事实及唯一释放。[教学脚本](../examples/README.md)由包 test 入口持续运行。

- [公开结果读取](runtime-reading.spec.ts)、[processed ACK 与交错风险](runtime-acknowledgement.spec.ts)、[分页准备预算](memory-paging.spec.ts)。
- [准备资源与校准租约](preparation.spec.ts)：真实内存 Commands 上的锚点命中、清理后仍命中、另一租户与不存在同结果、每种不命中与扣留原因、按访问依据读取、全有全无取得与幂等释放。
- [符合性装配](runtime-conformance-fixture.ts)、[消费者完成记录](completion-records.ts)、[真实收场准备](runtime-consumption-fixture.ts)。
