# Run 与 attempt 层的手写证明

本页把 [RunAdvance.tla](../models/run-advance/RunAdvance.tla) 的性质推广到任意长度的日志，并给出 S4 放弃的充分条件。手写证明没有机检，只在所列前提下成立。

## S1 至 S3 对 `reduce` 归纳

**命题。** 对任意长度的提交序列：同一会话至多一个未终结的 Run；至多一个 attempt 持有 advance，序号只增；每个输入至多承接一次；Run 的第一个终态保持不变，终态后没有 attempt 持有 advance。

**前提。** 每个快照都由 `reduce` 从上一快照和一批条目得出，并且 `reduce` 对不合规的批答 quarantined、不产生快照。`reduce` 有四条结构检查：

1. `run.started` 要求没有未终结的 Run。
2. `run.attempt-started` 要求 advance 为空，且序号等于上一序号加一。
3. `run.attempt-released` 要求释放者就是当前持有者。
4. 终态条目要求 advance 为空，且 Run 没有终态。

另外，`intake.handed-over` 只在输入还没有交接时加入交接集。

**推导。** 对快照序列归纳。初始快照没有 Run、没有 advance、没有交接。设第 k 个快照满足命题。第 k+1 个快照只能由一批通过四条检查的条目得出。检查 1 保证新 Run 只在旧 Run 终结后开始。检查 2 保证新的 attempt 只在 advance 为空时取得它，而且序号严格加一，所以旧序号不会再取得 advance。检查 3 保证只有持有者能放下 advance。检查 4 保证终态只写一次，写时 advance 为空；之后检查 2 的「Run 未终结」前提不成立，不再有 attempt。交接集只增不重复。所以第 k+1 个快照也满足命题。命题与日志长度无关。

守卫的变异 R1 表明，判断层去掉检查后，`reduce` 的检查 1 仍然把第二个 Run 挡下。

## S4 有界收束放弃的充分条件

**命题。** 设收束每次读修订与提交之间至少夹着一次与 Run 无关的提交（例如 accept）。若 `expected` 与整份快照修订比较，那么连续 `retriesOnChanged + 1` 次尝试都答 `changed`，收束放弃。若 `expected` 只与 Run 层修订比较，而收束期间没有 Run 层提交，收束在第一次尝试就成功。

**推导。** 比较整份快照修订时，每次无关提交都让修订加一，读到的值在提交时已经过期，所以每次尝试都答 `changed`。尝试次数到 `retriesOnChanged + 1` 时放弃。比较 Run 层修订时，无关提交不改变它；收束期间又没有 Run 层提交，所以读到的值在提交时仍然相等。

**含义。** 第一种比较下，一个持续收到输入的会话可以让收束一直放弃。这正是缺陷 F3。模型的 `negative-global-expected` 给出 3 次无关提交、上限 2 的反例。R2-D327 采用第二种比较：推进命令的 `expected` 是 Run 层修订（契约 [I-R2](../../SPEC.md#run-layer-expected)）。收束期间若有 Run 层提交（`claim`、`release`、`reload`），收束仍答 `changed` 后重读。这类提交来自推进资格的变化，不随输入的多少增加，所以繁忙会话不再让收束放弃。
