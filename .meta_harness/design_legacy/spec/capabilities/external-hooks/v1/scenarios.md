# 规范场景：外部命令式 hooks 兼容 v1

本表是契约的规范场景，不是已执行的实现测试。本契约没有形式模型，所有
场景的证据都来自提供者验收；覆盖范围与仍缺的证据见验证说明。

| 编号 | 初始条件、动作与可观察结果 | 条款 | 证据 |
|---|---|---|---|
| HS-01 | 装配的 `PreToolUse` hook 对某次调用返回 `permissionDecision: deny` 并带 `updatedInput`：该调用结算为 `denied_before_execution{reason: stderr}`，工具参数与原提议逐字节相同，`updatedInput` 在 `hooks.run.completed` 的 `fieldEntries[]` 中记 unsupported | HK-02、HK-09（`PreToolUse` 行）、HK-11 | 提供者验收 |
| HS-02 | TL-07 预备门判 ask，`PreToolUse` 返回 allow：allow 记 degraded，不产生放行；准入提交前过 CC-02/AU-06 当前撤权/资格屏障，仍有效才创建 system_approval，无效则拒绝且不重跑 hook | HK-02、HK-09（`PreToolUse` 行）、HK-15 | 提供者验收 |
| HS-03 | 工具调用 `succeeded`，`PostToolUse` hook 返回 `decision: block`：结果照常结算并对用户可见，该 tool_use 在模型投影中仍恰得一个块，块的值为 `blocked_by_hook{reason}`；耐久结果不被改写 | HK-02、HK-09（`PostToolUse` 行）、HK-11 | 提供者验收 |
| HS-04 | 队首用户文本项被 `UserPromptSubmit` hook 判 block：该项 `queue.item.closed{closed_by_guard}` 与其 `inbound.arrival.closed{closed_by_guard}` 在同一 take 门内提交，用户看到关闭原因与原输入，后续队列项照常求值 | HK-07、HK-09（`UserPromptSubmit` 行） | 提供者验收 |
| HS-05 | hook 命令超时、崩溃或输出非法 JSON：写 `hooks.run.completed{failed \| timeout}`；S1 守卫视为 pass，`PreToolUse` 保留 TL-07 预备门的 deny/ask 下界，不重跑 hook；准入提交前仍过 CC-02/AU-06 当前撤权/资格屏障，S0 与旁路 A 的该次贡献为空 | HK-05、HK-07、HK-15、HK-17 | 提供者验收 |
| HS-06 | Stop hook 运行在 tenant config revision R（缺省 cap=8）下要求续跑，但入队门已有 `n >= cap`：不入队，该次唯一 `hooks.run.completed{status: blocked}` 的 `presentationEntries[]` 给出 stop_cap_exhausted 呈现，Run 正常结算；不产生额外 completion | HK-16、HK-17 | 提供者验收 |
| HS-07 | hook 配置来自另一租户的资产或宿主工作目录的 settings 文件：不装载，写 `hooks.config.rejected`；本租户已选用资产的 hook 不受影响 | HK-18 | 提供者验收 |
| HS-08 | 兼容层被卸载时仍有 hook 进程在跑：先封闭新准入，再撤销站点登记，中止进行中的进程并排空记录；已关闭的队列项、已收紧的门判定与已入队的 trigger 项都不回滚 | HK-06 | 提供者验收 |
| HS-09 | `Stop` 观察者在入队 trigger 之后崩溃并重跑：同 `(RunRef, handler)` 去重，不出现第二个 trigger 项，续跑计数不变 | HK-16 | 提供者验收 |
| HS-10 | 工具站点的执行守卫登记不可用：兼容层不进入 ready，写 `hooks.config.rejected{guard_unavailable}`；不出现任何未经守卫求值的放行 | HK-05 | 提供者验收 |
| HS-11 | 配置为 interrupt_then_run 的输入在受理准备阶段被守卫判 close：受理后立即关闭该项，不发出中断，旧 Run 继续运行 | HK-07 | 提供者验收 |
| HS-12 | 组织普通成员装配的 Plugin 含 command hook，部署尚未建立对应执行边界：写 `hooks.config.rejected{execution_boundary_required}`，该资产的其余 hook 照常装配 | HK-19 | 提供者验收 |

| HS-13 | tenant config revision R 固定 `cap=1`，同一 completed Run 上两个 Stop handler 均要求续跑：恰一个 trigger 在 take/start 原子步骤占 slot 并创建 Run，另一个按 SE-06 `closed(source_invalid)`，仅这个 cap 分支的 HK 观察记 `stop_cap_exhausted` 与原 runId/triggerId；另注入 asset 失效，其观察必须记 asset 失效依据且不得记 `stop_cap_exhausted`。两次 hook 运行各自恰一条 completion；take-time 关闭不改它们。崩溃重放、多 worker 与重复通知不突破 cap | HK-16、HK-17 | 并发与恢复 fault-injection |
| HS-14 | S1 两个 handler 依序返回 `pass+context A` 与 `close(reason R)+context B`：最终 close，输入事实不改；A/B 只随 completion 审计保留，不进入 Step。全 pass 时 A/B 按序进入实际 taken batch 的首个 Step | HK-02、HK-07、HK-15、HK-17 | 提供者验收 |
| HS-15 | PreToolUse 前 TL-07 产生预备 ask；hook 命令超时。系统不重跑 hook、不放宽 ask；准入提交前 CC-02/AU-06 撤权/资格屏障可使旧 ask/allow 失效，若仍有效才创建当前合格 system_approval；completion 记 timeout | HK-05、HK-11、HK-15 | 提供者验收 |
| HS-16 | hook 输出 systemMessage/statusMessage：输出字段处置进入 `fieldEntries[]`，可见内容进入 `presentationEntries[{presentationId,kind,content:{body}|{bodyRef},dedupKey,visibility}]`；客户端仅经有权工程观测/消息投影看见，卸载、断线或重试不产生第二种业务状态或重复呈现 | HK-01、HK-02、HK-17 | 审计与投影验收 |
