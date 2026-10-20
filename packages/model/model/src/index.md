# Model 源码索引

- [源码责任与缺项](README.md)。
- [包根入口](index.ts)。
- [本成员公开入口](../docs/public-api.md)。

- [凭据判定与状态快照](credential.ts)。
- [凭据发送接缝](deliver.ts)。
- [产品发送边界](send.ts)，尝试状态在 [send/attempt.ts](send/attempt.ts)，事实资源在 [send/lifetime.ts](send/lifetime.ts)。
- [独立执行与资源关闭](execute.ts)。

- [受理与实例观察运行工厂](runtime.ts)、[按调用驱动与原操作认回](driver.ts)。
- [原事实流、批次保存与资源释放](receive.ts)、[确认投影与观察者寿命](observation.ts)。
- [内存测试公开入口](testing/index.ts)。
- [同步状态与提交](testing/state.ts)、[调用及恢复](testing/calls.ts)、[发出](testing/dispatch.ts)、[归约](testing/arrival.ts)、[读取及清理](testing/consumption.ts)。

[testing/pages.ts](testing/pages.ts) 拥有最终 sealed/partial 投影、目标组页和可完成生命周期的有限保留预算。
