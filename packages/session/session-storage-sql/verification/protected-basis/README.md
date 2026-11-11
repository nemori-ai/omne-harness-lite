# 受保护提交模型

本目录检查 [SessionPermissionWrite.tla](SessionPermissionWrite.tla)。模型描述一次权限配值写入：同一个原操作可以到达多次，每次投递先准入，再在事务外解析依据，最后提交。模型不执行产品 TypeScript，也不证明 SQL 实现符合模型。

正式行为来源是[提交依据](../../docs/commit-basis.md#受保护提交)与 [Session 权限配值](../../../session-contract/docs/permission-assignments.md)。

## 状态

| 状态 | 含义 |
| --- | --- |
| `auth` | 调用方的登录资格。它在另一个事务域，准入时读取。它只会失效一次 |
| `src` | 组织层的值。它在另一个事务域，解析依据时读取。读取可能失败。它至多改一次，改后不再允许这次写入 |
| `f` | 租户域的依据事实（定义投影、采用、租户层目标）。它的写者与 Session 的提交在同一个事务域。它至多改两次：第一次改后仍允许写入，第二次改后不允许 |
| `receipt` | Session 的操作回执。它是这次写入唯一的持久痕迹 |
| `effects` | 原操作的效果发生的次数 |
| `pc`、`seenF`、`seenSrc` | 每次投递的进度，以及它读到的事实 |

## 性质

| 性质 | 含义 | 负控（去掉的前提） |
| --- | --- | --- |
| `AtMostOnce` | 一个原操作的效果至多发生一次 | `negative-blind`：提交不看回执 |
| `CommitUsesCurrentFact` | 效果依据的租户域事实等于提交那一刻的事实 | `negative-unguarded`：提交不核对读到的事实 |
| `SourceIsFresh` | 一次投递使用的组织层的值不早于这次投递开始 | `negative-held`：沿用上一次投递保管的值 |
| `ReplayIsRecognised` | 原操作已经生效之后，投递得到原结果。依据事实之后的变化不会把它答成拒绝或不可用。只有失去登录资格的调用方例外 | `negative-early`：解析失败就直接答复。`negative-query`：解析之前先问一次回执 |
| `FailedResolutionIsNotDurable` | 解析失败不留持久裁定。下一次投递按自己读到的事实裁定 | `negative-durable`：把无法裁定记成回执 |
| `EveryAttemptEnds` | 事实停止变化后，每次投递都会结束 | 无负控 |

两个 `ReplayIsRecognised` 负控说明提交循环的顺序为什么是现在这样。解析失败就直接答复时，已经生效的原操作在依据事实变化后重传，会被答成拒绝。解析之前先问回执时，回执还不存在；另一次投递随后提交，依据事实再变化，这次解析失败，答成不可用。所以认回执必须排在答复解析失败之后。

## 模型与实现的对应

| 模型 | 实现 |
| --- | --- |
| `Admit` | `commit` 的准入步骤。应用的依据来源另外在每次调用时核对登录 |
| `ReadSrc`、`ReadF` | 应用的受保护依据来源（`SessionProtectedBasisSource` 的实现）。它每次被调用都读取，不保管 |
| `Commit` 先看回执 | [commit.ts](../../src/commit.ts) 的 `commitFacts`：先查原操作各代次的回执；来源答失败后再查一次 |
| `Commit` 核对 `seenF = f` | 受保护组合里的依据参加者，在事务里用同事务的事实重算裁定。它停下时这一代次滚回，投递答不可用 |
| 效果与回执同时成立 | Session 写者在同一事务写事件、权限修订与操作记录 |
| 失败不留裁定 | 来源失败不提交；参加者停下只占用一个代次 |

抽象掉的部分：多个原操作、同一操作换了内容的冲突、代次的编号、提交结果未知、租户。并发的同身份提交由存储的身份去重处理，模型把它并进「提交先看回执」这一步。

实现的证据是 [protected-basis-real.spec.ts](../../tests/protected-basis-real.spec.ts) 与应用的真实组合用例。对应关系最后一次核对于 2026-11-10。

## 运行

设置 `TLA2TOOLS_JAR` 指向 TLC 的 JAR，然后运行：

```sh
TLA2TOOLS_JAR=<tla2tools.jar> python3 packages/session/session-storage-sql/verification/protected-basis/run-models.py [输出目录]
```

正例必须退出 0 并报告完整搜索。负控必须退出 12，并且只报告表中指定的不变量。工具出错、超时或命中别的性质都算失败。单次运行的日志写到输出目录，不进本目录。
