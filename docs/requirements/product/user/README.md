# 用户维度

[产品三维](../README.md)

主条目：

- [PF-001：原生租户隔离与多组织上下文](PF-001-tenant-organization-context.md)
- [PF-006：用户设置、Agent 定义级授权与出厂默认覆盖](PF-006-user-settings-and-agent-definition-authorization.md)
- [PF-007：系统发起的 HITL 与动作授权确认](PF-007-system-initiated-hitl.md)
- [PF-008：统一决策池与跨会话直接答复](PF-008-unified-decision-pool.md)
- [PF-009：多模态输入、附件与命令操作](PF-009-multimodal-input-attachments-and-commands.md)
- [PF-010：组织级与个人级资产和权限](PF-010-organization-personal-assets-and-permissions.md)

副维度关联：[PF-002：外部环境感知与响应](../environment/PF-002-external-change-response.md)
（主维度：环境）。环境引发的响应遵循用户所在组织上下文的权限与流程，可以向
用户告知结果或提出待决定事项；确认范围仍以主条目为准。

副维度关联：[PF-003：工具执行可观察、生命周期控制与后台接续](../agent/PF-003-tool-execution-observation-and-control.md)
（主维度：智能体）。用户能够观察调用状态、按需查看内部过程帧，单独中断目标
调用，并将声明支持后台的调用手动切换到独立于会话运行时的执行状态；系统也
支持自动切换，恢复后的运行时能重新关联已有后台调用。

副维度关联：[PF-004：Sub-agent 派发、协作与监督](../agent/PF-004-subagent-delegation-and-supervision.md)
（主维度：智能体）。Owner 能查看完整子智能体树并终止可取消的后代，也能对
Agent 建立的未来派发工作进行授权、确认激活、查看和逐项终止。

副维度关联：[PF-005：智能体主动提问、请求授权与答复接续](../agent/PF-005-agent-initiated-human-input-and-approval.md)
（主维度：智能体）。用户能够接收问题、作出批准或拒绝，在会话或跨会话待办池
中答复；一次性决定与能力权限授予分别表达，等待和答复可跨运行时重建接续。

副维度关联：[PF-011：面向未来的复杂日程规划、日历与通知提醒](../agent/PF-011-future-planning-calendars-and-reminders.md)
（主维度：智能体）。用户可表达时间意图、选择日历、管理和终止安排，查看日程
及结果，并在未来收到系统安排的提醒与通知；仅提醒不要求启动 Agent。
