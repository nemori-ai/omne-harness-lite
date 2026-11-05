# grant 到 attempt 的解析模型

本目录检查 [AttemptGrant.tla](AttemptGrant.tla)：Authority 挂接时带的 grant（一次提交回执的 `source`）解析到发出它的那个 attempt。运行器不调用产品代码。

正式行为来源是 R2-D348 与 R2-D349：attempt 是 Session 的事实；Agent 只保留 `exec.attached.grant`；Session 在提交时记下回执到 attempt 的对应（`sl_attempt_grant`，`src/worker/participant.ts` 的 `recordAttemptGrants`），Authority 的 grant 只按这份记录解析（`session-adapters` 的 `attemptOfGrant` 用 `SessionAttemptRecord.grant` 查找），不在读时推断。历史索引对原受理行的 attempt 解析（`src/worker/history-index.ts` 的 `attemptOf`）不属于本模型，见下表。

## 资源

| 文件 | 内容 |
| --- | --- |
| [AttemptGrant.tla](AttemptGrant.tla) | 一个 Run，attempt 依次开始，每次提交发一张回执并在同一提交记入索引 |
| `positive.cfg` | 正控：三个 attempt、六张回执，检查全部性质 |
| `negative-started-only.cfg` | 负控：只记 `started` 回执，查不到就回落到 Run 唯一的 attempt。这是 R2-D349 修掉的生产读法 |
| [run-tlc.sh](run-tlc.sh) | 运行两份配置并判读 |

## 性质

| 性质 | 含义 | 负控 |
| --- | --- | --- |
| `GrantResolves` | 每张回执解析到发出它时的 attempt，与之后开始的 attempt 个数无关 | `negative-started-only`：第二个 attempt 开始后，第一个 attempt 的提交回执解析不到；第二个 attempt 的提交回执也解析不到 |
| `StaleStaysStale` | 更早 attempt 的 grant 不会解析成当前 attempt。消费者看到 stale，不会看到假的 current | 无负控 |
| `IndexAtCommit` | 索引只在提交时写入，不改写。读时不推断 | 无负控 |

负控说明缺陷为什么会藏起来：一个 Run 只有一个 attempt 时回落给出正确答案，第二个 attempt 开始时才错。实现里对应 `tests/attempt-grant.spec.ts` 的「同一 Run 第二个 attempt 的两份 grant 各自解析」与「旧 attempt 的 Authority 提交答 stale-advance」。

## 模型与实现的对应

| 模型 | 实现 |
| --- | --- |
| `receipts[r]` 与位置 `r` | 一次提交的 `CommitReceipt.source`；`sl_attempt_grant.position` 是它在日志里的位置 |
| `index` | `sl_attempt_grant (tenant, session, attempt, position, grant)`，由参加者随批写入 |
| `Resolve(r)` | `session-adapters` 的 `attemptOfGrant`：只按记下的 grant 查；查不到不指名任何 attempt，不回落。`history-index.ts` 的 `attemptOf` 解析原受理行：先按行记下的 `attempt`，再按 `grantNames`，最后保留「该 Run 只有一个 SE15」的兜底。这个兜底不在模型内，模型只覆盖 grant 的解析 |
| `StartAttempt` | `startRun` 与 `claim`：开始一个 attempt，它的 `started` 回执也是一张 grant |
| `Commit` | 当前 attempt 下的任何 Agent 发布 |

抽象掉的部分：多个 Run、租户、崩溃与恢复、回执的摘要内容。

## 运行

在带 Java 与 tla2tools 的 Linux 登录 shell 里：

```sh
bash run-tlc.sh <本目录> <证据目录>
```

退出码 0 表示正控完成且负控命中点名的性质。运行记录见 [formal-runs.md](formal-runs.md)。
