# SnapshotCache：记录仓用保管的快照作答读取

本目录的模型检查 [TS-16](../../../SPEC.md#ts-16-读取用保管的快照作答) 的规则。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

一个账本域。存储只接受带期望修订号的提交：期望等于当前修订号才写入。保管者是一个进程里全部提交的入口；其他写者是别的进程。存储的内容抽象成已写入的写序列，某个修订号下的内容由这个序列决定。

| 变量 | 含义 |
| --- | --- |
| `store` | 已写入的写序列，长度就是域修订号 |
| `cache` | 保管者的快照：一个写序列，或没有 |
| `pending` | 保管者在途的一次提交：期望修订号与要写的内容 |
| `age` | 快照距离上次被存储确认过了多少拍 |
| `answered`、`lag` | 最近一次读取答出的内容，以及那份内容被确认之后过了多少拍 |
| `deed` | 最近一件收不回的事所依据的内容，以及它的提交生效时存储的内容 |
| `absent` | 最近一次答“没有”所依据的内容，以及当时存储的内容 |

## 2. 动作

| 动作 | 含义 |
| --- | --- |
| `Tick` | 时间过一拍 |
| `OtherCommit` | 别的进程提交 |
| `FullRead` | 没有快照时整域读 |
| `Send` | 按快照决定并发出提交，不读 |
| `Committed` | 存储答已提交：快照随同一次写前进，这次提交所守的事随之做出 |
| `Conflict` | 存储答冲突：丢掉快照 |
| `Unknown` | 答复丢失，写可能生效也可能没有：丢掉快照 |
| `PureRead` | 读取。快照在 `MaxAge` 之内直接作答；超过时先向存储取修订号，变了就整域读 |
| `AbsentRead` | 答“没有”。由存储作答，它的修订号同时确认或替换快照 |

## 3. 性质

| 名称 | 含义 |
| --- | --- |
| `SnapshotIsStoreAtItsRevision` | 快照的修订号等于存储的修订号时，快照就是存储的内容 |
| `SnapshotIsAPastContent` | 快照总是存储曾经有过的内容。所以按它决定的写要么被存储在同一修订号接受，要么被拒 |
| `ReadIsBoundedStale` | 读取答出的内容，距离被存储确认不超过 `MaxAge` 拍 |
| `DeedOnCurrentContent` | 收不回的事所依据的内容，就是它的提交生效时存储的内容 |
| `AbsenceIsCurrent` | 答“没有”所依据的内容，就是当时存储的内容 |

## 4. 配置

| 配置 | 去掉的规则 | 必须命中 |
| --- | --- | --- |
| `positive` | 无 | 五条不变式都成立 |
| `assume-applied` | 答复未知时把快照当作已写入而前进 | `SnapshotIsAPastContent` |
| `never-check` | 读取从不向存储确认，不论快照多旧 | `ReadIsBoundedStale` |
| `deed-on-read` | 按读取答出的内容直接做收不回的事，中间没有提交 | `DeedOnCurrentContent` |
| `absent-from-snapshot` | 答“没有”用快照 | `AbsenceIsCurrent` |

答复未知时保留旧快照不前进也是安全的（它仍是过去的内容）。实现选择丢掉，少一种状态。

## 5. 运行

```
TLA2TOOLS_JAR=<TLC 1.7.4 的 jar> python3 check.py --out <输出目录>
```

## 6. 模型到代码

源码在 `packages/tool/tool-storage-sql/src/ledger-keeper.ts`。决定是全函数，每个结果对应模型的一个动作。

| 模型 | 函数与结果 |
| --- | --- |
| `FullRead` | `planRead` 与 `planRecord` 答 `whole`；`keeping` 的 `whole` 读整个域，`snapshotOf` 把它变成快照 |
| `PureRead`，在 `MaxAge` 之内 | `planRead` 与 `planRecord` 答 `answer` |
| `PureRead`，超过 `MaxAge` | `planRead` 答 `confirm`，`planRecord` 答 `ask`；`judged` 按存储的修订号确认或丢掉快照 |
| `AbsentRead` | `planRecord` 在快照没有该键时答 `ask`；`planRead` 在快照没有记录时答 `whole` |
| `Send` | 调用方按读到的修订号发出提交；保管者不参与决定 |
| `Committed`、`Conflict`、`Unknown` | `afterCommit` 的三个分支；被断言域的快照由 `refuted` 判断 |
| `FullRead` 的前提“没有在途提交” | `Crossings`：读取途中有同域提交经过时，答复不成为快照 |

判据用例：`tests/ledger-keeper.spec.ts`。

## 7. 模型不覆盖的

- 快照怎样由写集合算出（放入、删除、整域删除）。它由用例守：提交之后的快照与存储的整域读逐条相同。
- 同一进程里并发的两次提交。它们各自提交，后到的被存储拒绝，走 `Conflict`；模型的 `Conflict` 一律丢掉快照，实现在快照已被另一次提交推进时保留它，那份快照仍满足 `SnapshotIsAPastContent`。
- 到期索引。它不进快照。
- 读取之后不经提交就做的待办（推送、停止、释放、确认）。它们靠对象接受重复成立，依据在 `tool` SPEC 的[记录仓读取的新鲜度](../../../../tool/SPEC.md#记录仓读取的新鲜度)。
