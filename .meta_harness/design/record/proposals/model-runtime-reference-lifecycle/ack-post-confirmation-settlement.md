# ACK 后新处分写入的临时责任

2026-09-29 起草；**revision 2，2026-09-30**：按独立定点架构评审的最小修订清单 R1–R4 及建议 B3 修订（主调度摘录在 HUB 任务区 `tmp/model-request-runtime/ack-adoption/a22-g2-seam-review-20260930.md`，裁决 `rulings-20260930-main-dispatcher.md` R-G；正式评审记录待主线提升为 record）。candidate；接受以本修订落地并经主调度复核为条件（[决定附注](../../decisions/model-runtime-reference-lifecycle-adoption/ack-contracts-decision.md)）。接续[技术选择revision2](ack-technical-choices.md)，只闭合其中已经允许的延后真实处分，不增加公开操作或产品概念。

## 触发反例与边界

原ready模型副本已合法释放；消费者随后交回其自持原完整值，当前有资格的写方准备真实final（persisted时仍同批消息）。若第一次追加回执未知并崩溃，不能继续依赖已经删除的ready重造完整原批，也不能从摘要补reply/route/inputCalibration。反过来，为了这种未来可能性让每次ACK永久扣住全文，违反已接受用户要求。这里只保护**已经实际开始的这一笔新写入**，不是提前为所有可能后继消费保管结果。

## 最小承接选择

沿原结算owner及现Storage，把这次已经构造、核验且获当前资格的完整原批与原批身份/判重键/来源前缀作为该次结算的临时恢复数据，在首次可能产生追加效果前确认耐久。该记录不发布ModelResponse、不构成第二个模型结果事实源；SessionLog仍裁决实际final。既有提供者若已有能跨崩溃认回该原批的暂存机制，直接复用，不另建通用journal或GC服务。

**暂存行的精确含义（R1）。**暂存行保存的是**最近一次结果尚未确知为零写的追加所用的完整批**——连同该批的原批身份、判重键与来源前缀——不是「某个曾经构造过的批」。[S-70④](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果)的 `tailChanged` 确认该次整批零写之后，写方可按 [S-71](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-71-争用政策与责任保留) 策略准许重读并重构 `late`，并**用重构后的完整批更新暂存行**；这次更新必须在新的追加可能生效之前耐久，否则崩溃后恢复 owner 手里只有旧批。回执未知期间（[S-70⑤](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果)：先前追加为 `unavailable`、丢回执或仍在途）**禁止覆盖暂存行**——那一批可能已经提交，暂存行是认回它的唯一依据。[RT12 S-99⑧](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-99-ack-后的真实处分与-retainedresult)已写「首次可能追加前耐久」与「同原批/合法 late 重构」，但没有写暂存行的这一精确含义；v12 已接受冻结，不原地补句，该句作为版本外勘误指引登记在[契约入口](../../../spec/capabilities/model-request-runtime/README.md#v12-ack后继候选)，并列为 [v-next 待并入项](../../../spec/capabilities/model-request-runtime/v-next/README.md)，由下一版本正文并入。

- 仅在此次真实处分开始时取得，不能在ACK时预存一份“以防未来”的full ready。
- 回执unknown时，暂存与真实writer责任保留；取消/关闭/超时不假定原写者停止。原S70完整原批认回与实际停止前提不变，不能重跑消费副作用。
- 已确认原合法完整final、所有可能晚写者真实收束后，自动释放该临时原批与纯暂存引用，不需消费方再次ACK；正式final/消息保持不可变。
- 若实际全部写者已停止且权威完整前缀确证该批未提交，按原显式结算重试策略继续同原批/允许的late重构；策略决定结束本次写责任时，可释放仅此原批并返回明确unavailable。后续重新申请真实处分仍由消费方提供其自持原值，不能宣称此前已经提交或替其决定用途。
- 未决旧批不能因一次新的零写/碰撞、当前writer离开或策略耗尽而删除。恢复owner读取暂存与原日志认回；暂存/日志不可得明确unavailable，不以缺失为零写证明。
- **暂存删除的重试与唤醒（R3）**：暂存行删除失败或删除回执未知时，重试与唤醒复用 ACK 清理（[S-96～S-98](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-100-全部现有入口的九项传播)之 host 关闭/撤除行「确认与清理责任另耐久」）同一套耐久待办与可配置的策略/调度构件——同一策略对象、同一唤醒入口——不新建第二套待办或计时器。删除回执未知从同一暂存行幂等认回：确切读到该行已不存在（不是读失败）才算已删，行仍在则按同一策略重试，读不到按 `unavailable` 保留待办；不重复报成功，也不因一次读失败宣称已删。

**崩溃恢复后的默认路径（R4）。**恢复 owner 的默认路径是：先让本次写方实际停止（停止信号、卸载开始、fence 都不算，[S-70⑤](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果)）→ 读取权威完整前缀 → 读得本原批则按已确认继续收口；权威读确证缺席（零写）则**结束本次物理写责任**、返回明确 `unavailable`、删除暂存行，消费者持自持值按 [S-99](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-99-ack-后的真实处分与-retainedresult) 重新申请处分。这沿用节点现行 reconcile 路径的语义（`service-reconcile`：认回或结束，不代写）。「策略继续、由恢复 owner 代重送」**不是默认**，只作为 [S-71](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-71-争用政策与责任保留) 策略的显式选择存在；选择它时，重送前必须重核当前 settle 资格（[S-99②](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-99-ack-后的真实处分与-retainedresult)）——原写方取得的资格不随暂存行转移给恢复 owner，资格不可核即 `unavailable`，不重送。

原ACK不可回退、原已释放payload不复活。`cleanup=released`表示该ACK确认的模型保管副本清单和对应私有缓存已释放；之后合法新处分创建的必要在途原批是**新的实际写入责任**，由该次结算状态/诊断明确可见，不能借此重新提供结果领取或长期缓存。它在已无实际写入用途时也必须自动清理，不属于“ACK后默认永久保留”的例外。实现不能用同一已删除locator/version复用内容身份。

## 候选对照（评审建议 B3）

- **采用：只为已实际开始的一笔新写暂存完整批**（本页）。代价是一次发前耐久写与一次自动删除；收益是崩溃后能认回或重送同一批而不依赖已删 ready。
- **落选 (e)：身份 + MS8 摘要 + 结构完整性认回、缺席即结束。**不暂存完整批；崩溃后恢复 owner 只凭原批身份、MS8 语义摘要与日志结构完整性判断该批是否已提交，缺席即结束写责任并返回 `unavailable`。排除原因：它需要给 [S-70②](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果) 在 ACK 后路径一个「摘要等价即完整认回」的解释——完整认回须确认该批要求的所有成员与原值，摘要不是原值；并且「缺席即结束」在回执未知、写方未实停时会把未决旧批判成未提交，与 [S-70⑤](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果) 冲突。主线裁定本轮不改 S-70/S-71（R-G），故排除；若未来改 S-70，须重新对照。
- **落选：为一切可能的后继消费永久保留原 ready 全文。**违反已接受的用户要求（ACK 后清理副本），见开头触发反例。

## 对原能力的精确影响

RT12对后继处分只补：释放后不得依赖已删payload恢复；本次实际开始的写入必须保有跨崩溃认回原完整批所需数据，责任终结后自动清除，独立于原ACK。未知恢复/策略仍沿S70/S71；无需再给ACK增加输入、第二个确认或新的业务事件。MR最终值不变，MS ACK的releasablePayloads不追加未来项目，不修改原日志。

runtime后继在现Storage中给该次结算暂存明确owner/键/代际/状态；与SQL删除在同存储事务中认回，且与SessionLog不假称跨库原子。具体物理复用原settlement暂存还是现ModelCallContent单独kind由节点选，但必须同一生命周期，禁止永久恢复缓存分支。

## 必须失败的反例

1. 释放后新合法persisted回执unknown→崩溃→恢复能认回完整原批，消息/final至多一批。
2. 去掉发前原批耐久暂存后，崩溃令恢复只剩hash，验证应失败，不能从当前档案补字段。
3. final已确认但实际旧writer尚未停，不得提前删其恢复责任；全部收束后自动删，无第二ACK。
4. 真实停止+完整读确证未提交+策略结束，临时原批释放，不遗留默认永久副本；仍pending处分且费用沿ACK见证，不伪final。
5. 原cleanup保持已释放，既有旧ref不重新交全文；新写入责任与实际临时字节可观察，其他调用不受影响。
6. **A：late 重构后暂存未更新。**合法 `tailChanged` 后写方重构了 `late`，却没有把重构批耐久更新到暂存行就发起新追加→崩溃→恢复 owner 手里只有旧批：要么以旧 `late` 重送，要么与已提交的重构批认回失败。有限模型变异 [`Ack-staleTemp.cfg`](../../../spec/capabilities/model-request-runtime/v-next/formal/README.md) 去掉「追加前暂存行须持有将追加批」的守卫，`RecoveredMatchesFinal` 必须失败。
7. **B：暂存行/日志不可得判零写。**恢复 owner 在暂存行或日志读不到时把「读不到」当作「零写」，结束写责任并释放暂存；而该批（或原晚 writer 的 final）可能已经提交。变异 [`Ack-absenceUnreadable.cfg`](../../../spec/capabilities/model-request-runtime/v-next/formal/README.md) 允许在不可读时结束，`EndedMeansAbsent` 必须失败。
8. **C：原晚 writer 的 final 先落。**ACK 前已取得发布许可的原晚 writer 在新处分开始后先提交 final；新写必须按 [S-49⑦](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-49-settlereply)/[S-86](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-86-结果发布计账处分与关闭) 同处分认回原 final 或以 `alreadyEnded` 收口，不追加第二批；暂存行仍自动删除，原 `cleanup=released` 不回退。有限模型能走出这一交错，但没有为「认回/alreadyEnded 的返回」设断言；证据是真实并发验收（节点 [A22-V13/V14](../../../realization/packages/model/model-request-runtime/verification.md)）。
9. **D：部分碰撞/残批。**新写命中 `alreadyRecorded` 且为部分碰撞、身份不符或残批（[S-70③](../../../spec/capabilities/model-request-runtime/v12/contract.md#s-70-稳定身份完整原批和未知结果)）：不报成功、不补残批、不换 ID 再写；暂存行保留、阶段保持未完成、返回 `unavailable`。真实并发验收（A22-V13）。
10. **E：迟到 worker 的代际拒绝。**旧一次写责任的迟到 worker 对新一次写责任（新代际；节点以 workId 区分）的暂存行做写或删，必须被代际比较拒绝；新写责任的暂存行不因此丢失或被覆盖。真实并发验收（A22-V14）。
