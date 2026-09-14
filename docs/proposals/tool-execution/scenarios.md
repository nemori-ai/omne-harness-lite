# 场景：调用生命周期的验收路径

[提案索引](README.md) · [生命周期](lifecycle.md) · [不变式](invariants.md) · [证据模型](evidence/README.md)

每个场景给出触发、期望的事实序列（事件 kind 按[转移表](lifecycle.md#转移表)）、
[ToolCall.tla](evidence/model/ToolCall.tla) 里对应的动作与性质，以及模型不覆盖、要由提供者
验收兑现的部分。编号 TS-xx，与 run-driver v2 的 S-xx 场景互不重号；提案接受后进入 tools
下一版的 scenarios。

| 编号 | 场景 | 期望事实序列 | 模型动作与性质 | 模型外验收 |
|---|---|---|---|---|
| TS-01 | 前台调用正常结算并接续 | `tools.call.proposed` → `tools.call.admitted`（AU allow、BG 预留、AR pin 同批）→ `execution.attempt.accepted` → `execution.attempt.dispatch_intent` → `execution.attempt.terminal` + `tools.call.settled{succeeded}` + `inbound.arrival.accepted{call_settlement}` 同批 → Run waiting → `inbound.arrival.classified{continuation}` → 下一 Step 的 tool_result | Propose / GateAllow(foreground) / Start / Dispatch / Terminal / Adjudicate / Consume；SettledDelivered、ConsumedOnce | 结果按 `outputSchema` 校验、`content` 引用已耐久（[schema.md](schema.md#结果形状)）；费用随 attempt 记 |
| TS-02 | 门 = ask，人批准后执行 | `tools.call.waiting` + `hd.request.created{system_approval}` → 批准 → `run.approval.consumed` + `tools.call.admitted` 同批 → 同 TS-01 | GateAsk / Approve；HumanByAnswer 不适用（tool 类）；AnswerOnce | 决定只被这次准入消费、新 attempt 不能重用（[T-9](invariants.md#调用)）；HD 决策池与超时不解除 |
| TS-03 | 门 = deny 或人拒绝 | `tools.call.settled{denied_before_execution}` + arrival 同批；无 attempt | GateDeny / Reject；AttemptAfterAdmission | tool_result 载明拒绝原因；hooks `PreToolUse` deny 走同一路径且不改参数（T-6） |
| TS-04 | stop 先于 start（墓碑） | admitted 后用户 stopCall → `tools.control.requested` + `execution.stop.fenced` + `tools.call.settled{cancelled_before_execution}` 同批；owner 迟到的 start 被拒 | StopRequest 于 admitted；NoStartAfterFence、FenceConsistent；否定变体 lateStart 证明去掉 owner 短门的 fence 检查即违反 | owner 短门把 start 与 fence 排在同一账本（TL-08） |
| TS-05 | 执行中 stop，真实结果先到 | `tools.control.requested` → owner 报 `execution.stop.progressed{quiescent}` → `tools.call.settled{interrupted}`；若 terminal 先到则结果为真实结局、`tools.control.progressed` 随后 | StopRequest 于 executing / StopProgress / Terminal；StopsProgress、SettledStable | `forced_isolation` 后的 `possible_effect` 标记；清理失败 retained（[T-3](invariants.md#调用)） |
| TS-06 | 手动或自动转后台，Run 收束，后台结算开新 Run | `tools.relation.detach_requested` → `tools.relation.detached` → 驱动器写 deferred_receipt → Run completed → 后台 `tools.call.settled` → `inbound.arrival.classified{queue}` → trigger 开新 Run 消费 | Detach / DetachConfirm / RunWake / RunComplete / Adjudicate（C 列）/ RunStart；TerminalRunOnlyBackground | 前台上限计时归 tools 包，三值记录到调用（TL-10）；`background` 声明协议装载核实 |
| TS-07 | detach 失败保持前台 | `tools.relation.detach_requested` → owner 拒绝 → 关系回 foreground 并报告；owner 崩溃中的 detach 同样回退 | DetachFail / OwnerRecover 的 rel 回退 | 单次失败原因具名；interrupt_then_run 下失败改为 stop（[级联表](lifecycle.md#控制与级联表)） |
| TS-08 | 执行 owner 崩溃 | accepted 无 dispatch_intent → 同 attemptId 重发 start，不建第二个 attempt；dispatch_intent 而 terminal 不明 → `tools.call.settled{unknown}`，之后只追加 `tools.call.resolved` | OwnerCrash / OwnerRecover；UnknownAfterDispatch | 费用暴露、inspect 核实、`resolution` 追加不改写（TL-07）；墓碑先于新 start 恢复（TL-08） |
| TS-09 | Run interrupt | 前台、转换中、后台调用全部 stop（PF-013.C4）；`human` 请求保留；resume 后 pending continuation 被消费 | RunInterrupt / RunResume / Consume；InterruptKeepsHuman、NoStaleContinuation | 全 Run 阻塞的显式 resume；后台调用被停的用户提示 |
| TS-10 | Run cancel | 所有 open 调用 stop 或 cancelled；`human` 请求关闭并结算 `cancelled_before_execution`；未消费输入 closed；cancel 后到达的结算按 D1 列 closed | RunCancel / Adjudicate（D1）；NoStaleContinuation、FenceConsistent | force_stop 的 epoch 撤销与 `run.late_fact.recorded` |
| TS-11 | 归档后后台调用继续 | Archive 不动任何调用；后台 terminal → arrival 受理 → `closed(closed_by_archive)`；结果引用按数据治理保留 | Archive / Adjudicate（D2）；ArchiveKeepsWork、ArchivedNoPending | 删除后的结果处置；恢复归档后不重开已关闭结算（政策 b） |
| TS-12 | `human ask`：答复作为工具返回值 | `tools.call.proposed` → allow：`tools.call.admitted` + `hd.request.created{question}` 同批 → 视图 `waiting_human`，Step 收束，Run waiting → 用户答复：`hd.decision.recorded` + `tools.call.settled{succeeded}` + arrival 同批 → continuation → 下一 Step 该 tool_use 的 tool_result = 答复 | GateAllow(human_wait) / RunWait / Answer / Adjudicate / Consume；HumanByAnswer、HumanRequestsResolve | 崩溃后请求与调用均耐久、答复照常路由（RD-16）；迟到第二次答复按 HD-02 返回现状不生成 arrival |
| TS-13 | `human ask` 期间 interrupt | 请求保留，Run interrupted；答复仍可记录并结算，continuation 等 resume 后消费 | Answer 于 interrupted / RunResume（Conts ≠ {} → waiting）/ Consume；InterruptKeepsHuman | 用户界面区分"Run 已中断"与"问题仍开放" |
| TS-14 | `human request_approval` 后的动作调用 | 答复 approve 作为 tool_result 并产生一次性决定 → 后续动作调用过门引用该决定并消费 → 越界（动作/对象不符）被门拒绝并要求新请求 | 不建模（两次调用的耦合） | PF-005.C10；决定只覆盖所述 Action（[H-1](invariants.md#内建人类请求工具)、T-9） |
| TS-15 | 并行批（`parallel_safe`） | 两个前台调用同批准入并 start；先结算的 continuation 唤醒驱动器，驱动器发现另一调用未结算再次等待；写回按模型发出顺序 | 两调用的 Terminal / Consume / RunWait 交错；SettledDelivered | 首版驱动器可串行；写回顺序与合成结果（`cancelled_before_execution`）的验收 |
| TS-16 | 前台上限到点 | `onLimit: detach` → TS-06；`onLimit: stop` → TS-05；`keep_waiting` → 无事件，Run 预算到期走 interrupt/cancel | Detach / StopRequest 作为无标签触发；RunInterrupt | 计时用单调执行时长、HITL 等待不计；有效阈值算不出正数时启动前不承诺（[T-11](invariants.md#调用)） |
| TS-17 | hooks `PostToolUse` block | 结果照常结算与消费；投影选择器把该结果以 `blocked_by_hook{reason}` 占位，耐久结果不变 | 不建模 | `hooks.run.completed` 记录；参数与结果不可改（T-6；[cordis.md](cordis.md#hooks-兼容层在工具站点的落点)） |
