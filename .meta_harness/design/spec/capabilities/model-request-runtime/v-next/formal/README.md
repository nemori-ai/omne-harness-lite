# v-next ACK 行为模型：暂存行扩展

2026-09-30，candidate。本目录是 v12 冻结的 [`formal/AckLifecycle.tla`](../../v12/formal/AckLifecycle.tla) 的候选后继：按接缝 revision 2 R1/R2 加入暂存行代际、回执未知的在途追加与恢复时的可读性；其余动作、常量与十条原不变量逐字保留，八份原变异配置与 v12 字节相同。它不是已登记的 formal task，不改 registry；下一版本冻结时随 contract 一起登记。抽象边界沿 [v12 ACK-README](../../v12/formal/ACK-README.md)：两个 call、两个 consumer、单 Focus、至多一次 crash，不建模真实权限来源、字节或密码学。

## 相对 v12 改了什么

| 新增变量 | 含义 |
|---|---|
| `appendFlight` | 新 final 的追加在途、回执未知 |
| `batchGen` | 未提交批的代际：0 为首批；1 为 `tailChanged` 后按 S-71 重构 `late` 的批 |
| `tempGen` | 暂存行当前保存的批代际 |
| `finalGen` | 已提交 final 的代际；2 表示原晚 writer 的 final |
| `logReadable` | 恢复 owner 能否读到暂存行与日志；`Recover` 后可能为假，`LogUp` 恢复 |

动作：v12 的 `CommitFinal` 拆成 `BeginAppend`（追加前暂存行必须持有将追加的批）、`AppendLands`（追加生效，回执可能仍未知）、`Receipt`（活着的写方取得回执：已生效即成功，否则 `tailChanged` 关闭窗口）；新增 `Reconstruct`（无未知回执、无 final 时重构 late）、`UpdateTemp`（回执未知期间不可）、`RecoveryRead`（全部写方停止且可读时以权威读解决未知）、`LogUp`；`EndSettlement` 要求可读、无未知回执，且判 `ended_unavailable` 前所有可能写者已停止；`OldFinal` 记 `finalGen = 2`。变异专用动作 `PresumeAbsent` 只在 `Mutation = "absenceUnreadable"` 下启用。

## 断言 ↔ 条款

| 断言 | 检查什么 | 前提 |
|---|---|---|
| `TempCoversInflight` | 接缝 R1「重构批的更新须在新追加可能生效前耐久」；[S-99⑧](../../v12/contract.md#s-99-ack-后的真实处分与-retainedresult)「首次可能追加前耐久」 | 追加生效抽象为一步；上述有限常量 |
| `RecoveredMatchesFinal` | 接缝反例 A：恢复 owner 从暂存行认回或重送的批，就是新写方已提交的批（只约束 `finalGen ∈ {0,1}`，原晚 writer 的 final 由 C 处理） | 同上 |
| `EndedMeansAbsent` | 接缝反例 B / [S-70⑤](../../v12/contract.md#s-70-稳定身份完整原批和未知结果)：以 `unavailable` 结束写责任只能来自可读权威读确证的缺席，不能带着未知回执或已存在的 final | 同上 |

原十条不变量与两条进展性质沿 v12 ACK-README；`FairSpec` 另加 `Receipt`、`RecoveryRead`、`LogUp` 弱公平，进展仍只在存储与日志最终可读、写方最终停止下成立。

## 配置

- `AckLifecycle.cfg`（`Spec`，13 条不变量）与 `AckProgress.cfg`（`FairSpec` + 两条 leads-to）：预期无反例。
- `validity-check/Ack-staleTemp.cfg`（反例 A，`RecoveredMatchesFinal`）与 `validity-check/Ack-absenceUnreadable.cfg`（反例 B，`EndedMeansAbsent`）：预期出反例，按工作区口径不登记为 formal task。
- `validity-check/` 其余八份是 v12 原变异的逐字复制，用于确认扩展没有让原负控失效。

## 被建模方式吸收、不写成「已由模型覆盖」

- `Reconstruct` 不要求先有一次已确认的零写，只要求无未知回执、无 final；「按 S-71 策略准许」本身未建模。
- 「回执未知期间禁止覆盖」是 `UpdateTemp` 的守卫，本批没有为它单独设变异。
- 接缝 R3（删除重试/唤醒复用 ACK 清理构件、删除回执未知从同行认回）、R4（代重送前重核 settle 资格）、反例 C 的认回/`alreadyEnded` 返回、D 的部分碰撞键、E 的代际比较：均未建模，证据在版本外 verification 登记的真实并发验收义务。
- 不证明真实字节、SQL/JSONL 耐久、权限来源或密码学。

实际执行结果与输入位置在版本外 [verification](../../verification.md#接缝-revision-2-修订2026-09-30)。
