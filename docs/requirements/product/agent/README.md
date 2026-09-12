# 智能体维度

[产品三维](../README.md)

主条目：

- [PF-003：工具执行可观察、生命周期控制与后台接续](PF-003-tool-execution-observation-and-control.md)
- [PF-004：Sub-agent 派发、协作与监督](PF-004-subagent-delegation-and-supervision.md)
- [PF-005：智能体主动提问、请求授权与答复接续](PF-005-agent-initiated-human-input-and-approval.md)
- [PF-011：面向未来的复杂日程规划、日历与通知提醒](PF-011-future-planning-calendars-and-reminders.md)
- [PF-014：运行时发现与按需装载工具、技能](PF-014-runtime-tool-and-skill-discovery-and-loading.md)
- [PF-015：制品管理与隔离工作副本](PF-015-artifact-management-and-isolated-working-copies.md)
- [PF-016：Agent 开发 Cordis 插件并在线部署装载](PF-016-agent-developed-cordis-plugins-and-live-deployment.md)
- [PF-017：跨会话历史状态检索与后台通信协作](PF-017-cross-session-history-and-background-coordination.md)
- [PF-018：使用 omne-selfound 的知识与认知能力](PF-018-selfound-knowledge-and-cognition-use.md)
- [PF-022：多模态响应与输出](PF-022-multimodal-response-and-output.md)

副维度关联：

- [PF-019：租户订阅、额度、用量、账单与预算管理](../user/PF-019-tenant-subscription-usage-billing-and-budget.md)
  （主维度：用户）：逐 Agent Step 归因金额，重试、后台调用、恢复与子 Agent 消耗保留真实归集。
- [PF-020：依赖可用性、局部离线与诚实降级](../environment/PF-020-dependency-availability-and-degradation.md)
  （主维度：环境）：Agent 按实际依赖、授权和就绪条件工作，断连不伪报成功。
- [PF-021：多机器接入、工作部署与动态装配](../environment/PF-021-multi-machine-deployment-and-assembly.md)
  （主维度：环境）：Agent 工作适配获准机器和插件/服务装配，实际执行位置及接续结果可辨。
- [PF-023：会话级合法模型切换与下一轮接续](../user/PF-023-session-model-selection-and-continuity.md)
  （主维度：用户）：同一会话保留历史，以合法新模型继续下一轮，能力按新条件生效。
- [PF-001：原生租户隔离与多组织上下文](../user/PF-001-tenant-organization-context.md)
  （主维度：用户）：智能体与用户协作时，数据、权限、行动空间和流程规范的效用
  随组织上下文生效。
- [PF-002：外部环境感知与响应](../environment/PF-002-external-change-response.md)
  （主维度：环境）：Connector 供给的获准信息可进入运行中会话的被动感知，
  也可按受治理条件触发新工作；供给方不因传入内容就获得目标选择或行动授权。
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
- [PF-010：个人与组织的资产、设置及权限管理](../user/PF-010-organization-personal-assets-and-permissions.md)
  （主维度：用户）：个人用户与组织超级管理员管理相应范围的资产、设置及权限；
  Agent 的资产、版本与操作资格使用当前有效依据，管理变更不隐式终止活动运行。
- [PF-012：Computer、Browser、Shell 能力与沙盒／本机使用](../environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)
  （主维度：环境）：三类 use 都是 Agent 的能力，各自支持沙盒和当前操作系统的
  直接使用；单个部署的有效范围由模型能力等级、装配、默认权限和用户授权共同
  决定，能力、执行环境与有效授权分别表达。
- [PF-013：Session、Run 生命周期与运行中输入管理](../user/PF-013-session-run-lifecycle-and-pending-input-control.md)
  （主维度：用户）：Agent 遵循精确运行控制与不同的工具级联处置，按用户确认
  的内容和顺序消费排队输入；会话、运行与单次工具的生命周期分别可控。
