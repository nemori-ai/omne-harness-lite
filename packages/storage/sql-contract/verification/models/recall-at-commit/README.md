# RecallAtCommit：提交时认回，不先查询

本目录的模型检查 sql-contract SPEC 的[认回标记](../../../SPEC.md#认回标记)。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

一个操作有若干次调用（重试，也包括另一个进程的重试）和若干代次。调用方发出代次 g，只有 g 是早先调用的回滚回执时才换到 g + 1。存储是权威：执行之前先认同一身份的回执，认到就原样答它并标明“认回”；没有标记的答复是本次调用执行出来的回执。答复丢失的调用方什么也不知道，再次发送之前先问存储。

| 变量 | 含义 |
| --- | --- |
| `receipt` | 每个代次在存储里的回执：没有、已提交、已回滚 |
| `effects` | 这个操作的写生效了几次 |
| `gen`、`phase` | 每个调用所在的代次与阶段 |
| `belief` | 每个调用把结局当成什么：自己的、认回的、已回滚 |
| `ran` | 已提交回执是不是这个调用执行出来的 |

## 2. 性质

| 名称 | 含义 |
| --- | --- |
| `AtMostOnce` | 所有代次、所有调用加起来，写至多生效一次 |
| `OwnIsOwn` | 把已提交回执当成自己的那个调用，确实是它执行的 |
| `OneWriter` | 至多一个调用执行了写 |

## 3. 配置

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `positive` | 无 | 三条不变式都成立 |
| `no-mark` | 答复不说“认回”，调用方把每份回执都当成自己的 | `OwnIsOwn` |
| `blind-retry` | 答复丢失后不问存储，直接发下一代次 | `AtMostOnce` |

## 4. 运行

```
TLA2TOOLS_JAR=<TLC 1.7.4 的 jar> python3 check.py --out <输出目录>
```

## 5. 模型到代码

| 模型 | 代码 |
| --- | --- |
| `Commit` 认到回执 | `sqlite-provider/src/worker/group.ts` 的 `admit`：答 `recalled: true`；同一组里同身份的等待者在 `settleReceipt` 里答 `recalled: true` |
| `Commit` 执行 | 同文件的 `settleReceipt`：本条目自己的调用答 `recalled: false` |
| `Take` | `session-adapters/src/journal-commit.ts` 的 `commitGeneration`；`session-storage-sql/src/commit.ts` 的 `fromResult`；`model-storage-sql/src/commit.ts` 的 `commitFacts` 与 `afterCommit`（认回的回滚换下一代，认回的已提交回到重读） |
| `Query`（答复丢失之后） | `journal-commit.ts` 的 `standingOf`；Session 一侧是 R7；Model 一侧是 `model-storage-sql/src/commit.ts` 的 `settleUnresolved`（「一次 run」第 2 步） |

判据用例：`src/testing/conformance.ts` 的 C01 与 C05；`sqlite-provider/tests/group.spec.ts` 的等待者用例；Model 一侧是 `model-storage-sql/tests/commit.spec.ts` 的「attempt generations」与「operation identity」两组。

## 6. 模型不覆盖的

- 同一身份、不同输入的调用（`identity_conflict`）。它不执行，答早先的回执，与认回同一条路。
- `recall: 'never'` 的身份：不存回执，不认回。
