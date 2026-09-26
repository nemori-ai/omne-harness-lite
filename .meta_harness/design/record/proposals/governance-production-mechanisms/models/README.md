# 登录机制候选的有限模型

这些模型是提案的检查材料，尚非接受/冻结规格，也未登记为生产形式任务。TLC 正例与故意破坏机制的负控成对运行；性质不读取负控开关。

| 模型 | 映射 | 正例／负控 |
|---|---|---|
| LoginLifetime | 一个登录、一次在途业务；成功结果后按当前时刻判定 touch；业务结果失败/进程中断不 touch | valid／bad-admission（错误回填准入时刻），检查 NoRevival、AbsoluteBound |
| LoginCommit | 将最终判定后、提交前展开为 staged；暂存活动与效果，Commit 才公开，Rollback 丢弃；独立 Observe 抽象 verify/list/准入查询 | commit-valid／commit-bad-observer（观察者绕过共同串行化），检查 NoObservedRevival、AbsoluteBound |
| CredentialRevision | 一个账号、一次改密和一次并发凭据比对/签发；签发记录实际使用的凭据快照与登录代际 | revision-valid／revision-bad（去掉签发前代际比较），检查 NoStaleIssue、OldLoginInvalid |

时间单位为 30 分钟，Idle=2、Absolute=16，MaxTime=18；保留 1h/8h 比例且跨越绝对截止。只检查安全性，不检查公平性/无饥饿；关闭死锁检测是因为有限时钟及完成状态允许停止，不是消除产品死锁义务。

LoginCommit 的 Stage 是候选事务的线性化点：在共同保护内最终取时并暂存；该保护延续到 Commit/Rollback。它不声称墙钟读取和物理提交同时发生。NoObservedRevival 只约束可见的到期判断不可随后恢复有效；不是“物理时间一经过旧持久值截止、即使事务正在暂存也不得提交”的更强性质。所有有效性观察者必须遵守这项协议；SQL/入口路径的精化还需逐路落实。

CredentialRevision 的不变量直接比较 `issueSnapshot` 与 `loginRevision`，不再读取开关派生的 staleIssued 标志。负控仅移除 Issue 的保护，保留相同事实记录与不变量；旧 run 的标志写法有假绿风险，不能作为代际证据。

最终可信时钟不可用映射到 Rollback，实际提供者必须连同业务效果共同回滚，不回填准入时刻。模型未覆盖多账号/多登录/组织锁、授权、实际 SQL 隔离与连接、密码算法、网络、物理故障或备份回退。运行记录与输入快照将保存在 record/evidence；模型通过不代表这些实现义务完成。
