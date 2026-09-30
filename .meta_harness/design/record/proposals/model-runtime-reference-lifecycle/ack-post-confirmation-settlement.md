# ACK 后新处分写入的临时责任

2026-09-29，candidate，待独立定点评审；接续[技术选择revision2](ack-technical-choices.md)，只闭合其中已经允许的延后真实处分，不增加公开操作或产品概念。

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

原ACK不可回退、原已释放payload不复活。`cleanup=released`表示该ACK确认的模型保管副本清单和对应私有缓存已释放；之后合法新处分创建的必要在途原批是**新的实际写入责任**，由该次结算状态/诊断明确可见，不能借此重新提供结果领取或长期缓存。它在已无实际写入用途时也必须自动清理，不属于“ACK后默认永久保留”的例外。实现不能用同一已删除locator/version复用内容身份。

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
