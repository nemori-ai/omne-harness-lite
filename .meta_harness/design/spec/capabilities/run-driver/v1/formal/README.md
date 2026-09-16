# 形式工件范围

RunDriver 的 core/scheduler/ops/progress 配置来自 legacy v3 当前工件。模型把 gate 登记保留到 `WakeGate` 消费 ready-gate arrival 才清除，因此不能证明 SE-14/LC-04 新要求的 gate-restored 裁决提交与登记释放原子发生。`ConfirmIsolation` 只抽象强隔离证据已经成立的分支；模型没有 execution exposure 集合、settled unknown、错代/迟到/恢复证据，也没有不占位 stopping 派生 scheduler barrier。RN-05 严格终态门已有独立用户接受依据，但这些澄清仍是 candidate 资源，旧模型不能证明。模型还不包含真实 Cordis 生命周期、I/O、预算数值或跨进程故障。

旧 TLC 日志不复用。本轮 Java/TLC 不可用时状态为 `registered-not-run`；只有实际 runner
成功并绑定本候选资源哈希后，才能陈述对应有限模型检查结果。

## 进展检查的执行边界

`RunDriverProgress.cfg` 与 `RunDriverProgressHuman.cfg` 检查同一 `LiveSpec` 下的
`P1/P1g/P1y/P1w`；后者同时保留其声明的安全不变式。两个配置均不启用对称规约。
检查成本包含全部可达状态，以及 TLC 为时序性质建立的五个分支；日志中的时序图节点数
不等于不同业务状态数。队列非空时超时只是检查未完成，不能记为 PASS 或性质反例。

TLC 2.19（工具发行版 v1.7.4，源码修订
`5a47802b5c391f59ecdd44117981f4ff8c0656ba`）支持 `-lncheck final`。它把中途重复的
活性检查推迟到可达图展开完毕，再检查完整图；不删除性质、公平性条件或行为边。
依据是该修订的 [TLCGlobals.doLiveness](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/TLCGlobals.java#L54)、
[LiveCheck.check/finalCheck](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/liveness/LiveCheck.java#L156)
与 [ModelChecker 的最终检查](https://github.com/tlaplus/tlaplus/blob/5a47802b5c391f59ecdd44117981f4ff8c0656ba/tlatools/org.lamport.tlatools/src/tlc2/tool/ModelChecker.java#L244)。
此选项下，最终完整图的 temporal check 成功、退出码为零且队列清空，才构成一次通过。
最终检查前被中止不能作为局部活性通过证据。

runner 可在模型与配置不变的前提下使用有界 heap、ParallelGC 和单 JVM 的多个 worker，
并为各任务分配独立 `-metadir`。调度与超时由全局形式任务拥有者根据实际结果登记；
并行任务必须按合计 CPU/内存预算安排，不能把单 JVM 耗时预算直接搬到大量 JVM 同跑的环境。
该工具版本不接受 `-noGenerateSpecTE`，不得保留此参数却引用删除该参数后的运行作登记通过。

这些是检查器执行条件，不扩展模型的证明范围。尤其原模型的 `ConfirmIsolation` 仍只抽象
强隔离证据已成立的分支，不能由本页的运行选项推导 RN-05 的 exposure 集合、错代证据、
stopping barrier 或真实提供者行为已经得到验证。
