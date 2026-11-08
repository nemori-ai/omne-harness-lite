# 收场后的接收对象释放

本论证覆盖 [driver.ts](../../src/driver.ts) 的 `finish`，消费 [成员规格](../../SPEC.md) 的收场和资源释放承诺。它不证明整个运行时内存有界，也不改变 Commands 的 ACK 或结果清理。

## 状态与规则

记 S 为业务收场状态，R 为接收资源释放结果，E 为已确认的接收失败。活动状态为 F(S,R,E)、Done 或 Failed(E)。S 只有确认后才能取 confirmed。R 只有原 receiver.release 成功返回后才能取 ok。

| 前提 | 下一状态 | 保留责任 |
| --- | --- | --- |
| S 未确认 | F | 原收场输入、接收对象和释放结果 |
| S 已确认，R 未成功 | F | 原接收对象与释放结果，继续报告真实失败 |
| S 已确认，R=ok，E 为空 | Done | 公开观察快照与活动身份 |
| S 已确认，R=ok，E 存在 | Failed(E) | 公开观察快照、活动身份及原接收失败 |

此表全化所有组合。未知或抛错不属于确认。释放挂起时仍可推进业务收场，原 drive 锁持续到释放等待结束。

## 归纳论证

1. 初始活动不在 Done 或 Failed(E)。接收完成后进入 F，保留原 receiver。
2. `finish` 先发起 release，再独立推进 settle。它在 settle 或 release 的失败出口都不执行退役转换。因此未知、失败或挂起不能丢弃尚需履行的责任。
3. 仅两个结果均成功时覆盖活动的 stage。Done 和 Failed(E) 都没有 receiver 字段；后续 runStages 不再读取原流或执行 release。失败记录 E 仍由原字段返回，不被改为成功。
4. 活动的 view、claim、publication 不变。重驱动仍先核当前资格与持久事实；保留公开观察不要求保留原发送流。
5. 当前调用返回后，若接收对象没有其他外部持有者，覆盖 stage 消除活动到 receiver 的强引用。GC 可回收它。GC 的执行时刻和运行时其他缓存不在本结论内。

## 可执行守护与限制

[runtime-material-lifetime.spec.ts](../../tests/runtime-material-lifetime.spec.ts) 经公开 runtime/driver 和 send 接缝，弱引用观察正常完成与失联收场的流；运行时存活时对象可回收，原输出仍可观察，重驱动不重复发送，失联仍答原失败。GC 不可用时测试失败，不跳过。

[runtime-settlement.spec.ts](../../tests/runtime-settlement.spec.ts) 守住丢回执、资格变化、原写认回、有限竞争及释放挂起。[runtime-receive.spec.ts](../../tests/runtime-receive.spec.ts) 守住释放失败不重做 return/close。它们与局部论证互补，不是跨进程恢复或整个产品内存上界的证明。
