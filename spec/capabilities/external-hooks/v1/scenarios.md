# 规范场景：外部命令式 hooks 兼容 v1

本表是[契约](contract.md)的规范场景，不是已执行的实现测试。本契约没有形式模型，所有
场景的证据都来自提供者验收；覆盖范围与仍缺的证据见[验证说明](../verification.md)。

| 编号 | 初始条件、动作与可观察结果 | 条款 | 证据 |
|---|---|---|---|
| HS-01 | 装配的 `PreToolUse` hook 对某次调用返回 `permissionDecision: deny` 并带 `updatedInput`：该调用结算为 `denied_before_execution{reason: stderr}`，工具参数与原提议逐字节相同，`updatedInput` 在 `hooks.run.completed.entries` 中记 unsupported | HK-02、HK-09（`PreToolUse` 行）、HK-11 | 提供者验收 |
| HS-02 | 授权求值判定为 ask，`PreToolUse` hook 返回 `permissionDecision: allow`：仍按 [TL-07](../../tools/v2/contract.md) 建立 system_approval 请求，hook 的 allow 记 degraded，不产生放行 | HK-02、HK-09（`PreToolUse` 行） | 提供者验收 |
| HS-03 | 工具调用 `succeeded`，`PostToolUse` hook 返回 `decision: block`：结果照常结算并对用户可见，该 tool_use 在模型投影中仍恰得一个块，块的值为 `blocked_by_hook{reason}`；耐久结果不被改写 | HK-02、HK-09（`PostToolUse` 行）、HK-11 | 提供者验收 |
| HS-04 | 队首用户文本项被 `UserPromptSubmit` hook 判 block：该项 `queue.item.closed{closed_by_guard}` 与其 `inbound.arrival.closed{closed_by_guard}` 在同一 take 门内提交，用户看到关闭原因与原输入，后续队列项照常求值 | HK-07、HK-09（`UserPromptSubmit` 行） | 提供者验收 |
| HS-05 | hook 命令超时、崩溃或输出非法 JSON：写 `hooks.run.completed{failed \| timeout}`；S1 守卫视为 pass，`PreToolUse` 按失败放行到 TL-07 门由门判定，S0 与旁路 A 的该次贡献为空 | HK-05、HK-07、HK-15、HK-17 | 提供者验收 |
| HS-06 | `Stop` hook 连续要求续跑：第 `cap` 次触发时 `stop_hook_active = true` 已给出；`n ≥ cap` 时不再入队，写 `hooks.run.completed{status: brake, n, cap}` 并通知用户，Run 正常结算 | HK-16 | 提供者验收 |
| HS-07 | hook 配置来自另一租户的资产或宿主工作目录的 settings 文件：不装载，写 `hooks.config.rejected`；本租户已选用资产的 hook 不受影响 | HK-18 | 提供者验收 |
| HS-08 | 兼容层被卸载时仍有 hook 进程在跑：先封闭新准入，再撤销站点登记，中止进行中的进程并排空记录；已关闭的队列项、已收紧的门判定与已入队的 trigger 项都不回滚 | HK-06 | 提供者验收 |
| HS-09 | `Stop` 观察者在入队 trigger 之后崩溃并重跑：同 `(RunRef, handler)` 去重，不出现第二个 trigger 项，续跑计数不变 | HK-16 | 提供者验收 |
| HS-10 | 工具站点的执行守卫登记不可用：兼容层不进入 ready，写 `hooks.config.rejected{guard_unavailable}`；不出现任何未经守卫求值的放行 | HK-05 | 提供者验收 |
| HS-11 | 配置为 interrupt_then_run 的输入在受理准备阶段被守卫判 close：受理后立即关闭该项，不发出中断，旧 Run 继续运行 | HK-07 | 提供者验收 |
| HS-12 | 组织普通成员装配的 Plugin 含 command hook，部署尚未建立对应执行边界：写 `hooks.config.rejected{execution_boundary_required}`，该资产的其余 hook 照常装配 | HK-19 | 提供者验收 |
