# 智能体维度

[产品三维](../README.md)

主条目：

- [PF-003：工具执行可观察、生命周期控制与后台接续](PF-003-tool-execution-observation-and-control.md)
- [PF-004：Sub-agent 派发、协作与监督](PF-004-subagent-delegation-and-supervision.md)
- [PF-005：智能体主动提问、请求授权与答复接续](PF-005-agent-initiated-human-input-and-approval.md)
- [PF-011：面向未来的复杂日程规划、日历与通知提醒](PF-011-future-planning-calendars-and-reminders.md)

副维度关联：

- [PF-001：原生租户隔离与多组织上下文](../user/PF-001-tenant-organization-context.md)
  （主维度：用户）：智能体与用户协作时，数据、权限、行动空间和流程规范的效用
  随组织上下文生效。
- [PF-002：外部环境感知与响应](../environment/PF-002-external-change-response.md)
  （主维度：环境）：变化可进入智能体当前工作的输入，也可按适用条件触发新的
  工作，并引出相应行为；确认范围仍以主条目为准。
- [PF-006：用户设置、Agent 定义级授权与出厂默认覆盖](../user/PF-006-user-settings-and-agent-definition-authorization.md)
  （主维度：用户）：Agent 的实际行为受适用设置和定义级授权约束，运行时重建后
  仍使用当前有效依据。
- [PF-007：系统发起的 HITL 与动作授权确认](../user/PF-007-system-initiated-hitl.md)
  （主维度：用户）：系统独立检查 Agent 动作，发起事前授权确认；合格动作支持
  已登记的暂行确认与结果回传。
- [PF-008：统一决策池与跨会话直接答复](../user/PF-008-unified-decision-pool.md)
  （主维度：用户）：不同会话中的主动请求和系统请求汇入同一池，答复关联原工作，
  并按请求类型驱动接续或其它后果。
- [PF-009：多模态输入、附件与命令操作](../user/PF-009-multimodal-input-attachments-and-commands.md)
  （主维度：用户）：Agent 收到真实、保序的多模态内容与附件，用户通过 slash
  手动调用 Skill，并可用明确目标的键盘命令控制工作。
- [PF-010：组织级与个人级资产和权限](../user/PF-010-organization-personal-assets-and-permissions.md)
  （主维度：用户）：Agent 的可用资产与行动权限按当前范围生效；官方/自定义来源、
  定义所有权、使用权益、选用版本与执行准入分别表达。
- [PF-012：Computer、Browser、Shell 能力与沙盒／本机使用](../environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)
  （主维度：环境）：三类 use 都是 Agent 的能力，各自支持沙盒和当前操作系统的
  直接使用；能力、执行环境与有效授权分别表达。
