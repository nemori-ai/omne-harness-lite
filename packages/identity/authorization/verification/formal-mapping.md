# 放行判断：性质、模型与规格的对应

[ActionAuthorization.tla](models/ActionAuthorization.tla) 是一个动作从待判到启动的行为模型。[models.json](models.json) 登记每份配置与它的预期，[check.py](check.py) 按预期判读；成员内 `pnpm run verify:formal` 运行，要有 `TLA2TOOLS_JAR`。正例必须完成且没有错误；反例把模型的 `Variant` 设成一种改坏的写法，必须恰好违反登记的那条性质。

模型问的是：人的答复、取消会话、别人改这一项权限的设置、切换会话运行模式、写资格变化、服务重启、工具启动，以任何次序交错时，下面的性质是否成立。它是有限范围的检查，范围写在 `models.json` 的 `scope` 里，不是无条件的证明。模型把「追加单次授权」与「签出许可」建成两步；规格里它们是同一笔，所以模型证明的是更弱的前提下也安全。

## 性质

| 规格不变式                                                              | 模型性质                       | 改坏之后变红的反例                                                            |
| ----------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| ID-50：没有授权的动作不被放行；主动禁止放宽不了；启动处不采信先前的允许 | `NoUnjustStart`                | `bad-non-atomic-fence`、`bad-fence-trusts-admission`、`bad-bypass-beats-deny` |
| ID-36：一张许可只被它绑定的动作消费                                     | `PermitBound`、`NoUnjustStart` | `bad-permit-not-bound`                                                        |
| ID-51：本会话授权只在给出时的权限依据下被采用                           | `NoUnjustStart`                | `bad-stale-session-grant`                                                     |
| ID-38、ID-50：人的不放行、原话都不产生授权                              | `HumanNoNeverRuns`             | `bad-remark-approves`                                                         |
| Agent 规格「动作与工具」：判断屏障打开之前不发起                        | `BarrierHolds`                 | `bad-no-barrier`                                                              |
| 「许可与消费」：人同意过的单次授权不因重启丢失                          | `ApprovalNotLost`              | `bad-volatile-ledger`                                                         |
| 「人工决定与询问处理」：一个动作被问的次数不超过一加依据变化的次数      | `AskedBounded`                 | 无                                                                            |
| Agent 规格「动作与工具」：卡片轮次总有收场，每个动作都有结局            | `EveryActionSettles`           | `bad-cancel-leaves-card-open`                                                 |

## 动作

| 模型动作                                                           | 规格里的步骤                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `Decide`                                                           | 放行判断这个纯函数，四步的次序                                                 |
| `Judge`、`Rejudge`、`Reconsider`                                   | 官方准入被调用的三种时机：待判的动作；人答复并做完效果之后；卡还开着而依据变了 |
| `Answer`                                                           | 人在放行卡片上答复：五档之一，或只写一段话                                     |
| `AppendOnce`、`Grant`                                              | 本次放行的效果：追加一笔单次授权                                               |
| `AppendSession`                                                    | 本会话放行的效果：追加一笔带依据的本会话授权                                   |
| `WriteAlways`、`Refuse`                                            | 始终放行与始终禁止写租户层权限值；不放行与原话直接拒绝                         |
| `Launch`                                                           | 判断屏障打开，发起工具调用                                                     |
| `Fence`                                                            | 启动围栏受理的那一笔提交：重读依据、认出单次授权并记下消费、受理               |
| `Cancel`、`ChangeMode`、`ChangeSetting`、`FlipWritable`、`Restart` | 取消会话；切换会话运行模式；别人改租户设置；写资格或上界变化；服务重启         |
