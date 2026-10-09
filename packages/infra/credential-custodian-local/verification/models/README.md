# 未来 OAuth 清扫模型

[Sweep.tla](Sweep.tla) 对应 [尚未实现的 OAuth 保管](../../SPEC.md#已接受而未实现的完整保管能力)，不表示当前 model-only 已实现这些操作。

| 配置 | 精确预期 |
| --- | --- |
| Sweep.cfg | TypeOK／GrantedResolvable／OrphanEventuallySwept 在固定范围内无反例 |
| Sweep_Validity_SweepNotGranted.cfg | GrantedResolvable 反例 |
| Sweep_Validity_StaleCompletionTime.cfg | GrantedResolvable 反例 |
| Sweep_Validity_NoSweep.cfg | OrphanEventuallySwept 反例 |
| Sweep_Reach_Granted.cfg | NoGrantedEver 反例，证 granted 可达 |
| Sweep_Reach_Discard.cfg | NoDiscardEver 反例，证 discard 可达 |

固定一份 holding、两 binding、三 ref、TTL=1、MaxTime=3，各动作对所碰 binding 原子排序是前提。桥完成现取时刻是前提；Sweep 每 entry 的弱公平性是前提，不是结论。ThreeKinds 按构造排除 pending 未过期／granted-current，仍需真实并发及失败场景，不把守卫本身当证据。

deposit 比真实调用更宽，允许旧状态；完成迁 granted 只指本 ref。只证明相等 holding 下的引用仍存在并被指向，不表达加密、钥、tenant 隔离、replica、真实一致读取、撤除、崩溃或 binding 不可读。sweepInterval／每轮预算不在模型，必须真实计时，不从“终会”推出上界。

正控、三去保护负控与两可达探针一起才有验证意义。正控须 exit 0，不变量负控须 exit 12，时序负控须 exit 13，且命中对应性质；关死锁检查是有限时钟正常终点，不降低业务要求。从本目录用 TLC、单 worker、配对 cfg、工作树 tmp metadir 执行；单次证据不入 Git。
