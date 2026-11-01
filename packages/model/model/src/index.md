# Model 源码索引

- [源码责任与缺项](README.md)。
- [包根入口](index.ts)。
- [本成员公开入口](../docs/public-api.md)。

- [凭据判定与状态快照](credential.ts)。
- [凭据发送接缝](deliver.ts)。
- 档案读取在 `profiles/`：[`createModelProfiles` 与租户检查](profiles/profiles.ts)、[同名求值与列表的纯判决](profiles/judge.ts)。行为归[实现规格](../SPEC.md#档案读取与同名求值)。
- [产品发送边界](send.ts)，尝试状态在 [send/attempt.ts](send/attempt.ts)，事实资源在 [send/lifetime.ts](send/lifetime.ts)。
- [独立执行与资源关闭](execute.ts)。
- [采用相等的唯一比较](adoption.ts)：独立执行与准备资源共用。
- 准备资源与校准租约在 `preparation/`：[租约的构造、绑定与计量器](preparation/resources.ts)、[lineage 的边界解析](preparation/lineage.ts)、[调用事实的一次读取与视图](preparation/facts.ts)、[锚点与来源的纯判决](preparation/judge.ts)。行为归[实现规格](../SPEC.md#准备资源与校准租约)。

- [受理、结果消费与实例观察运行工厂](runtime.ts)、[按调用驱动与原操作认回](driver.ts)。
- [原事实流、批次保存与资源释放](receive.ts)、[确认投影与观察者寿命](observation.ts)。
- 共享归约核心在 `commands/`，经子路径 `@omne-harness/model/commands` 导出：[入口与 createModelCommandsCore](commands/index.ts)、[规范编码与身份铸造](commands/value.ts)、[22 个方法](commands/commands.ts)、[存储端口](commands/storage.ts)、[状态机与写驱动](commands/state.ts)、[纯判定](commands/judge.ts)、[文档与端口类型](commands/types.ts)。边界归[实现规格](../SPEC.md#共享归约核心)。
- [内存测试公开入口](testing/index.ts)，[ModelCommands 账目共用套件](testing/accounts.ts)。
- [内存存储、测试控制与发送围栏](testing/state.ts)。[调用及恢复](testing/calls.ts)、[发出](testing/dispatch.ts)、[读取及清理](testing/consumption.ts)把内存存储的核心交给对应方法组。

[commands/judge.ts](commands/judge.ts) 拥有最终 sealed/partial 投影、目标组页和可完成生命周期的有限保留预算。

[driver.ts](driver.ts)在原 Activity 内保留固定收场意图；[receive.ts](receive.ts)持有唯一原流、确认终止依据与一次释放结果。具体支持范围归[实现规格](../SPEC.md#已实现的调用收场)。
