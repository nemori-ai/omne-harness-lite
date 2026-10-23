# Model 源码索引

- [源码责任与缺项](README.md)。
- [包根入口](index.ts)。
- [本成员公开入口](../docs/public-api.md)。

- [凭据判定与状态快照](credential.ts)。
- [凭据发送接缝](deliver.ts)。
- [产品发送边界](send.ts)，尝试状态在 [send/attempt.ts](send/attempt.ts)，事实资源在 [send/lifetime.ts](send/lifetime.ts)。
- [独立执行与资源关闭](execute.ts)。
- [采用相等的唯一比较](adoption.ts)：独立执行与准备资源共用。
- 准备资源与校准租约在 `preparation/`：[租约的构造、绑定与计量器](preparation/resources.ts)、[lineage 的边界解析](preparation/lineage.ts)、[调用事实的一次读取与视图](preparation/facts.ts)、[锚点与来源的纯判决](preparation/judge.ts)。行为归[实现规格](../SPEC.md#准备资源与校准租约)。

- [受理、结果消费与实例观察运行工厂](runtime.ts)、[按调用驱动与原操作认回](driver.ts)。
- [原事实流、批次保存与资源释放](receive.ts)、[确认投影与观察者寿命](observation.ts)。
- [内存测试公开入口](testing/index.ts)，[ModelCommands 账目共用套件](testing/accounts.ts)。
- [同步状态与提交](testing/state.ts)、[调用及恢复](testing/calls.ts)、[发出](testing/dispatch.ts)、[归约](testing/arrival.ts)、[读取及清理](testing/consumption.ts)。

[testing/pages.ts](testing/pages.ts) 拥有最终 sealed/partial 投影、目标组页和可完成生命周期的有限保留预算。

[driver.ts](driver.ts)在原 Activity 内保留固定收场意图；[receive.ts](receive.ts)持有唯一原流、确认终止依据与一次释放结果。具体支持范围归[实现规格](../SPEC.md#已实现的调用收场)。
