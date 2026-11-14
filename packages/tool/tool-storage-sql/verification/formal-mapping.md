# tool-storage-sql 形式模型对照

正控要求 TLC 完成检查且没有错误；负控只开一处违约，要求 TLC 以点名性质的反例结束。模型只证明列出的有限状态和前提，不证明实现。

## SnapshotCache

模型 [SnapshotCache.tla](models/snapshot-cache/SnapshotCache.tla)：一个账本域，存储只接受带期望修订号的提交，保管者是一个进程里全部提交的入口。别的进程写同一个数据库不在支持的部署内，模型把它当作环境故障（`OtherCommit`）留着，用来证明这时写入与答「没有」照样安全。快照被当作整个域的内容；只知道部分记录的快照、快照怎样由写集合算出、同一进程里并发的两次提交与到期索引不建模，由 `tests/ledger-keeper.spec.ts` 守。

| 性质                           | 守的规则                                                                 | 代码位置                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `SnapshotIsStoreAtItsRevision` | 快照的修订号等于存储的修订号时，快照就是存储的内容                       | [ledger-keeper.ts](../src/ledger-keeper.ts) 的 `afterCommit`（提交答已提交时快照随同一次写前进）                        |
| `SnapshotIsAPastContent`       | 快照总是存储曾经有过的内容，按它决定的写要么在同一修订号被接受，要么被拒 | `afterCommit` 的冲突与未知分支丢掉快照；`refuted` 判断被断言域的快照                                                    |
| `ReadIsAPastContent`           | 读取答出的内容总是存储曾经有过的内容                                     | `planRead` 与 `planRecord` 答 `answer`；`Crossings`：读取途中有同域提交经过时答复不成为快照                             |
| `DeedOnCurrentContent`         | 收不回的事所依据的内容，就是它的提交生效时存储的内容                     | 收不回的事只在提交答已提交之后做                                                                                        |
| `AbsenceIsCurrent`             | 答「没有」所依据的内容，就是当时存储的内容                               | `planRecord` 在快照没有该键时答 `ask`，`planRead` 在快照没有记录时答 `whole`，由存储作答；`judged` 按答复确认或替换快照 |

| 配置                                     | 种类 | 预期                                                              |
| ---------------------------------------- | ---- | ----------------------------------------------------------------- |
| `SnapshotCache-positive.cfg`             | 正控 | 五条不变式都成立                                                  |
| `SnapshotCache-assume-applied.cfg`       | 负控 | 违反 `SnapshotIsAPastContent`（答复未知时把快照当作已写入而前进） |
| `SnapshotCache-deed-on-read.cfg`         | 负控 | 违反 `DeedOnCurrentContent`（按读取答出的内容直接做收不回的事）   |
| `SnapshotCache-absent-from-snapshot.cfg` | 负控 | 违反 `AbsenceIsCurrent`（答「没有」用快照）                       |
