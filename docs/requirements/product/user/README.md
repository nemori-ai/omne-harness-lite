# 用户维度

[产品三维](../README.md)

主条目：

- [PF-001：原生租户隔离与多组织上下文](PF-001-tenant-organization-context.md)
- [PF-006：用户设置、Agent 定义级授权与出厂默认覆盖](PF-006-user-settings-and-agent-definition-authorization.md)
- [PF-007：系统发起的 HITL 与动作授权确认](PF-007-system-initiated-hitl.md)
- [PF-008：统一决策池与跨会话直接答复](PF-008-unified-decision-pool.md)
- [PF-009：多模态输入、附件与命令操作](PF-009-multimodal-input-attachments-and-commands.md)
- [PF-010：个人与组织的资产、设置及权限管理](PF-010-organization-personal-assets-and-permissions.md)
- [PF-013：Session、Run 生命周期与运行中输入管理](PF-013-session-run-lifecycle-and-pending-input-control.md)

PF-010 统一维护个人用户、组织超级管理员等主体的管理范围与操作；PF-006
维护配置覆盖和定义授权的生效规则。管理体验可以连续，需求正文分别保留唯一归属。

副维度关联：[PF-002：外部环境感知与响应](../environment/PF-002-external-change-response.md)
（主维度：环境）。用户能授权和管理独立的 Connector 连接，辨认安装与供给状态；
组织准入与要求安装保留各成员的同意和数据边界。环境响应遵循适用权限与流程，
可以向用户告知结果或提出待决定事项。

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

副维度关联：[PF-012：Computer、Browser、Shell 能力与沙盒／本机使用](../environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)
（主维度：环境）。Agent 可以在获准范围内直接操作与用户共享的电脑环境；用户
能辨认实际目标、观察和中断调用，桌面接管与环境权限保持明确。

副维度关联：[PF-014：运行时发现与按需装载工具、技能](../agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md)
（主维度：智能体）。能力可见性和使用遵循用户的有效授权与选用范围，手动
Skill 调用继续使用 PF-009 的 slash 入口。

副维度关联：[PF-015：制品管理与隔离工作副本](../agent/PF-015-artifact-management-and-isolated-working-copies.md)
（主维度：智能体）。用户的持久工作材料按租户及权限管理，多个会话可同时
处理而不静默覆盖，保存、冲突、清理和发布结果可辨认。
