# 零发送收尾的安全论证

本证明只覆盖发送前明确拒绝和 Model Commands 的零内容推导。共同行为归 [Model 契约](../../../model-contract/SPEC.md#342-重试失联与恢复)，实现范围归 [成员规格](../../SPEC.md#传输准备的明确拒绝)。

## 状态与前提

对原 call 的 dispatch d，记 S 为已保存的 send，B 为已有块、曾观察内容的标记或 hadContent，W 为本调用的接收窗口，T 为本次事实。派生零内容的定义域为：S=not-sent，B 为空，T 恰为一条 ended/failed，原窗口 w 开着，W 中除 w 外全部 closed。Commands 的执行资格、原 call/dispatch、expected 与 operation 检查先于归约。持久提供者必须履行整批提交或不提交的共同承诺。

## 安全性

1. 初始 dispatch 没有块，S=prepared。recordSend 只有在 B 为空时能写 not-sent。S=not-sent 时 reduceFacts 拒绝所有块操作。其他允许的账目、诊断和失败终止不创造块。因此每次合法提交保持 S=not-sent 蕴含 B 为空。started 不可退回 not-sent 的既有守卫保留。
2. 只有定义域内的完整失败批次能用内部证据关闭 w。归约后 mergeReceiveWindow 再检查所有窗口。仅当全部 closed 才写 none-proven。其他窗口开放或未经证明、当前 unknown、prepared 和空批次不能触发这个推导。外部接收证明仍沿原协议单独核验。
3. none-proven 不授权重试或直接跳过策略。retryable 与 settle 的 retry-not-decided 守卫不变。已确认未发出但需要重试政策的失败，仍等待原决定。历史 unknown 不阻止后来的真实 not-sent 观察。
4. 传输明确拒绝存入 refusal 阶段后，不再进入 acquire 或 start。window、record、terminal 各保存原 Write，请求在调用提供者前固定。未知或抛错沿该 Write 查询并认回，确认前不创建下一写。重复请求返回原回执，因此不重复准备、发送或发布终止。
5. Commands 的每次写仍核当前执行资格。无资格不能由已记录的拒绝取得写权限。释放失败不删除 attempt；终止确认与资源释放分别处理。该论证不把 close 当作业务回滚。

## 活性条件与限制

六类 prepare/materialize 明确拒绝的 cause 都不需要 retry-decision。在资格持续有效、原写最终可确认、后续 drive 被调度且存储有限竞争时，阶段按 refusal、window、record、terminal、settle 前进。释放永久失败可继续保留资源责任，不影响已确认业务终局的事实。

unavailable、解析异常、永久未知、永久失权和一般 retry 决定来源不在活性结论内。这里没有 crash/hot takeover、多个执行进程或无界生产者假设。已 start 的 unknown 不能用本路径降级。该证明依赖实际 not-sent 观察诚实，不能用空数据库替代。

## 源码与可执行守护

- [commands.ts](../../src/commands/commands.ts) 的 recordSend、receiveCompletion、preserve 负责定义域与提交顺序；[state.ts](../../src/commands/state.ts) 的 reduceFacts、hasDispatchContent、completesNotSentWindow、mergeReceiveWindow 负责状态不变量。
- [attempt.ts](../../src/send/attempt.ts) 的 refusal 阶段和原 Write 负责单次准备与未知写认回。既有 [SendBoundary 模型](../../../model-contract/verification/models/SendBoundary.tla) 对凭据拒绝及释放责任作有限抽象。新增传输 cause 的映射不在该模型中，多窗口与内容守卫也须另看上述论证和用例。
- [not-sent-window.spec.ts](../../tests/not-sent-window.spec.ts) 检查双向矛盾、整批拒绝、未知发送、其他窗口及重试守卫。
- [send-transport-refusal.spec.ts](../../tests/send-transport-refusal.spec.ts) 经公开 sender/runtime 检查六个拒绝出口、三种已提交后抛错、读取失败、失权和释放失败。
- [SQL 回归](../../../model-storage-sql/tests/not-sent-window.spec.ts) 经真实参加者和 node:sqlite 测试提供者检查重载、丢回执及原子拒绝。它不覆盖生产 Worker、队列、磁盘耐久或跨进程恢复。

单次运行、具名变异与候选有限模型的结果留任务证据。本文是归纳论证，不宣称模型检查已穷举产品代码。
