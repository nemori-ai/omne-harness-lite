# 放行判断：性质、模型与规格的对应

[ActionAuthorization.tla](models/ActionAuthorization.tla) 是一个动作从待判到开始执行的行为模型。[models.json](models.json) 登记每份配置与它的预期，[check.py](check.py) 按预期判读；成员内 `pnpm run verify:formal` 运行，要有 `TLA2TOOLS_JAR`。正例必须完成且没有错误；反例把模型的 `Variant` 设成一种改坏的写法，必须恰好违反登记的那条性质。

模型问的是：人的答复、取消会话、别人改这一项权限的设置、切换会话运行模式、写资格变化、服务重启、工具开始，以任何次序交错时，下面的性质是否成立。许不许只在 Agent 的准入判一次：放行的结论、用掉的单次授权与依据在准入那一次提交里一起记下；交给 Tool 之后，Tool 照常执行，不再判。它是有限范围的检查，范围写在 `models.json` 的 `scope` 里，不是无条件的证明。模型把「追加单次授权」与「成为可用的单次授权」建成两步；规格里它们是同一笔，所以模型证明的是更弱的前提下也安全。

模型里的权限档位与它的修订（`tier`、`rev`）是一道关口的。一个能力可以有几道关口，一个动作恰好归其中一道，各道之间没有共享的状态，所以下面的性质对每一道关口分别成立。不设关口的动作不进这个状态机。

## 性质

| 规格不变式 | 模型性质 | 改坏之后变红的反例 |
| --- | --- | --- |
| [ID-50](../../SPEC.md#不变式)：没有授权的动作不被放行；主动禁止放宽不了；准入按当前事实算，不照搬人的答复 | `NoUnjustAdmission` | `bad-admission-trusts-answer`、`bad-bypass-beats-deny` |
| [ID-36](../../SPEC.md#不变式)：一张单次授权只被它绑定的动作的准入用掉 | `PermitBound`、`NoUnjustAdmission` | `bad-permit-not-bound` |
| [ID-51](../../SPEC.md#不变式)：本会话授权只在给出时的权限依据下被采用 | `NoUnjustAdmission` | `bad-stale-session-grant` |
| [ID-38](../../SPEC.md#不变式)、[ID-50](../../SPEC.md#不变式)：人的不放行、原话都不产生授权 | `HumanNoNeverRuns` | `bad-remark-approves` |
| Agent 规格「动作与工具」：判断屏障打开之前不发起 | `BarrierHolds` | `bad-no-barrier` |
| 「许可与消费」：人同意过的单次授权不因重启丢失 | `ApprovalNotLost` | `bad-volatile-ledger` |
| [TL-26](../../../tool/SPEC.md#不变式)：Tool 不判授权；撤回只影响之后的准入，已准并交出的动作除了取消不在开始时被拒 | `AdmittedNotRefused` | `bad-start-rejudges` |
| 「人工决定与询问处理」：一个动作被问的次数不超过一加依据变化的次数 | `AskedBounded` | 无 |
| Agent 规格「动作与工具」：卡片轮次总有收场，每个动作都有结局 | `EveryActionSettles` | `bad-cancel-leaves-card-open` |

## 守着每条性质的用例

模型只在它的有限范围内说话；实现守不守得住，靠下面这些用例。路径从仓库根算起，发行树用例在慢层。

| 模型性质 | 纯函数与成员用例 | 发行树用例 |
| --- | --- | --- |
| `NoUnjustAdmission` | `packages/identity/authorization/tests/release.spec.ts`（四步的次序，禁止在先）；`apps/harness-server/tests/rows/authorization/current-tool-permission.spec.ts`（单次与本会话授权怎样被采用）；`apps/harness-server/tests/rows/authorization/once-grant.spec.ts`（准入记录写明凭什么放行与授权引用） | `apps/harness-server/tests/rows/authorization/release-session.spec.ts`（依据变了重新问）；`release-always.spec.ts`（始终禁止之后任何会话不放行） |
| `PermitBound` | `apps/harness-server/tests/rows/authorization/once-grant.spec.ts`（单次授权绑定动作、目标与参数摘要）；`packages/session/session-contract/tests/authorization-expression.spec.ts`（按消费方登记与退出） | `release-card-flow.spec.ts`（本次放行只执行这一次，再调仍出卡；直接调与经 `Tools` 调各一条） |
| `HumanNoNeverRuns` | `apps/harness-server/tests/rows/authorization/release-asking.spec.ts`（不放行、原话、跳过各自的拒绝类别）；`answer-effects.spec.ts`（写不成的始终禁止只拒这一次） | `release-card-flow.spec.ts`（三种不放行的答法都不执行） |
| `BarrierHolds` | `packages/agent/agent/tests/loop-admission.spec.ts`、`loop-cards.spec.ts`（一批全部有结论之前不发起） | `release-session.spec.ts`、`release-always.spec.ts`（一批三次调用只答一次） |
| `ApprovalNotLost` | `packages/session/session-storage-sql/tests/authorization-context.spec.ts`（授权上下文随会话日志提交并可重建） | `release-restart.spec.ts`（三处重启后授权还在、不再问人、至多执行一次） |
| `AdmittedNotRefused` | 无 | `apps/harness-server/tests/rows/authorization/release-changed.spec.ts`（放行之后、开始之前关口改成禁止，这次照常执行，下一次在准入时挡住） |
| `AskedBounded` | `packages/agent/agent/tests/loop-cards-rejudge.spec.ts`（同批重判只作废不再出卡）；`apps/harness-server/tests/rows/authorization/pass-memory.spec.ts` | `release-session.spec.ts`（本会话放行后不再出卡；设置变了才重新出卡） |
| `EveryActionSettles` | `packages/agent/agent/tests/loop-cards.spec.ts`（卡开着时取消、整批被拒的收场） | `apps/harness-server/tests/rows/authorization/release-card-flow.spec.ts`（卡开着时取消，之后同一会话接着用） |

## 动作

| 模型动作 | 规格里的步骤 |
| --- | --- |
| `Decide` | 放行判断这个纯函数，四步的次序 |
| `Judge`、`Rejudge`、`Reconsider` | 官方准入被调用的三种时机：待判的动作；人答复并做完效果之后；卡还开着而依据变了 |
| `Admit` | 准入提交：放行的结论、用掉的单次授权与依据在同一次提交里记进会话日志 |
| `Answer` | 人在放行卡片上答复：五档之一，或只写一段话 |
| `AppendOnce`、`Grant` | 本次放行的效果：追加一笔单次授权 |
| `AppendSession` | 本会话放行的效果：追加一笔带依据的本会话授权 |
| `WriteAlways`、`Refuse` | 始终放行与始终禁止写租户层权限值；不放行与原话直接拒绝 |
| `Launch` | 判断屏障打开，把调用交给 Tool |
| `Start` | Tool 开始执行；不判授权 |
| `Cancel`、`ChangeMode`、`ChangeSetting`、`FlipWritable`、`Restart` | 取消会话；切换会话运行模式；别人改租户设置；写资格或上界变化；服务重启 |
