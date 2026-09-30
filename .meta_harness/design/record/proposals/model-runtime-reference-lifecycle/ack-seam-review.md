# A22-G2 定点架构评审摘要（2026-09-30，architecture-reviewer，只读）

2026-09-30；只读角色 architecture-reviewer；对象为[ACK 后新处分接缝](ack-post-confirmation-settlement.md)（candidate，评审时为 2026-09-29 的首稿，现已修到 revision 2）、v22 节点 revision 2「ACK 后真实处分的原批责任」与 RT12 S-99⑧/S-103 G-42；结论**修订后可接受**，无阻断。本页是主调度从评审报告摘录的正式评审页：原摘录来自 HUB 任务区 `tmp/model-request-runtime/ack-adoption/a22-g2-seam-review-20260930.md`，以下正文逐字迁入、未改一字；「范围外待裁决」一节即主调度裁决 R-G（原 `rulings-20260930-main-dispatcher.md`）。R1–R4 与 B3 已作为接缝 revision 2 落地，复核归主调度；接受以复核为条件（[决定附注](../../decisions/model-runtime-reference-lifecycle-adoption/ack-contracts-decision.md)）。本页不代替接受，也不是执行证据。

---

对象：`.meta_harness/design/record/proposals/model-runtime-reference-lifecycle/ack-post-confirmation-settlement.md`（candidate）及 v22 节点 revision 2「ACK 后真实处分的原批责任」、RT12 S-99⑧ / S-103 G-42。首次定点评审（既有 `ack-architecture-review.md` 只留一句结论）。

结论：**修订后可接受**。选择成立：边界画在「已实际开始的一笔写」上、事件驱动收敛、不触碰已删内容身份、不索取内核不给的保证。无阻断。

## 需修订（接受前）
- **R1** 暂存行语义二义：须写明「暂存行 = 最近一次未确知零写的追加所用完整批；tailChanged 确认零写后重构批须在新追加生效前耐久更新；回执未知期间禁止覆盖」。依据 S-69④/S-70④/S-70⑤；`ack-contracts-decision.md:27` 已有规则但接缝与 S-99⑧ 未写。
- **R2** 反例缺五个交错：A late 重构后暂存未更新；B 暂存/日志不可得判零写；C ACK 前原晚 writer 的 final 先落（同处分认回/异处分 alreadyEnded，暂存仍自动删）；D 部分碰撞/残批（S-70③）；E 迟到 worker 对新 workId 行的写/删被代际拒绝。A、B 各配 `validity-check` 变异配置；C–E 进 A22-V13/V14 真实并发验收。
- **R3** 暂存删除失败/回执未知的重试与唤醒须复用 ACK 清理同一套耐久待办 + 可配置策略/调度构件，删除回执未知从同行幂等认回。
- **R4** 崩溃恢复后默认路径须由节点选定；若允许「策略继续、恢复 owner 代重送」，重送前必须重核当前 settle 资格（S-99②）。

## 建议
B1 暂存字节报告与上限归策略、不与 `retainedBytes` 内存预算混用；B2 ACK 后在途新写是否入读面待产品确认（当前仅诊断）；B3 把落选候选 (e)「摘要等价认回、缺席即结束」及排除原因写进接缝。

## 范围外待裁决（主调度）
- `ack-contracts-decision.md:33` 在评审前已写「接受」接缝；主调度裁：**接受以 R1–R4 修订为条件**，修订落地后由主调度复核并在决定页加日期附注。
- 是否给 S-70② 在 ACK 后路径一个摘要等价解释（候选 e）：本轮**不给**，维持「不改 S-70/S-71」。
- B2 读面可见：本轮维持仅诊断可见，登记为产品未决项之外的技术备注（不挂产品）。

完整报告在主会话记录中；本页由主调度摘录。
