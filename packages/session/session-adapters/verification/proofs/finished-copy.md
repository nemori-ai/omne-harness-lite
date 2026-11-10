# 终态内存账本的可丢弃性

拥有者是 Session 的 Journal 提供者。权威事实在 SQL，内存 Book 保存折叠视图 V、材料 C、发布位置 p、未知写入 H、派生副本 D 和串行尾 Q。既有投影 P 满足 D=P(V,C)，但 H 尚未成为耐久事实时必须重新放回副本。此处不改变存储提交、Agent 终结或 Session Run 终态的边界。

## 全化规则

一次串行操作结清后，仅在 V.executions 非空、全部有 finish.ended 且 H 为空时，令 Book 回到冷态：D=null，V 为空视图，C 为空，已加载集合为空，p=null。其他组合保持原值。H（此时为空）、Q 与 Book 身份不变。冷态就是进程重启后首次触及该会话时的状态。Q 保存成功或失败已经结清的 void Promise；真实结果通过本次调用的 run Promise 交回消费者。

## 归纳论证

1. 串行任务始于前一 Q 结清之后。副本清理在 run 的 finally 内，下一 Q 在 finally 之后结清。因此下一任务不能与同一个 Book 的副本清理交错。清理不删除或替换 Book，已经入队的调用仍共享同一串行身份。
2. H 非空时不清副本，不因查询暂不可用而忘记未知或排除写入。活动 execution 存在时也不清副本。临时错误不被当成终结事实。
3. H 为空且全部加载执行已终结时，V、C、p 与 D 都只是耐久事实的派生物：没有只存在于内存的写入。回到冷态不丢原事实。下次操作先读当前持久根、核资格，因 p=null 走冷启动：读未终结的执行及其事实，被点名的已终结执行按需整读。这条路径与进程重启后的路径是同一条，认回索引与 adopted request 来源由它从耐久事实取得。外部提交在两次调用之间到达时，仍由该根检查发现。冷启动的读取量只与未终结的执行有关，所以回到冷态不使后续操作的代价随会话历史增长。
4. Q 的成功分支和失败分支都返回 void，故排队尾不持有本次答复。调用者仍通过 run 取得原值或原拒绝。此变换不吞调用者的异常，也不把失败改成业务成功。
5. P 对终态观察项必须完整。原终结事实与 checkpoint 的 after_terminal passages 确定每项身份、顺序、实现和 terminal。observation.recorded 只把对应项的 observed 从 null 变成原依据。按 passage 查表后依原顺序投影，与写者在 tryFinish 和 recordTerminalObservation 的更新相同。未登记项不能由“没有记录”推成“没有责任”。

## 守护及声明边界

[session-log-journal-finish.spec.ts](../../tests/session-log-journal-finish.spec.ts) 经生产 Journal 和真实 SQLite 材料的测试存储验证公开结果：终态快照的每个对象在调用者不再持有时可回收（含折叠事实与已解码的块）；原终局与原 operation 可认回；冷读保留两个观察项的顺序；登记其中一项后冷读、认回仍一致。

[session-log-journal-replay.spec.ts](../../tests/session-log-journal-replay.spec.ts)、[session-log-journal-custody.spec.ts](../../tests/session-log-journal-custody.spec.ts) 与 [session-log-journal.spec.ts](../../tests/session-log-journal.spec.ts) 继续守住保留/重建回放、保管、未知答复、两实例竞争和共同提交。

这是局部归纳论证，不是机器穷举整个实现。它不保证 GC 的执行时刻。公开内存反例使用同进程 GC。

内存边界：已静止会话的 Book 只留排队身份。未终结执行的 V 与 C 没有字节上界，它们随该执行的事实增长。`readExecutionRecords` 的折叠另有个数与块文本两个上界，淘汰规则由 [records-fold-bound.spec.ts](../../tests/records-fold-bound.spec.ts) 守护。真实发行上的组合读数见历史成本对照（`apps/harness-server/tests/history-cost/control.ts`）：强制回收后的活堆按调用记录。
