# 用户维度索引

本页按产品的**用户维度**观察面检索要求；它是索引，不是能力维度，也不预设插件边界。

| 身份 | 当前要求 | 主维度 | 副维度 |
|---|---|---|---|
| `PF-001` | [PF-001：原生租户隔离与多组织上下文](PF-001-tenant-organization-context/README.md) | `user` | `agent` |
| `PF-002` | [PF-002：外部环境感知与响应](PF-002-external-change-response/README.md) | `environment` | `user`、`agent` |
| `PF-003` | [PF-003：工具执行可观察、生命周期控制与后台接续](PF-003-tool-execution-observation-and-control/README.md) | `agent` | `user` |
| `PF-004` | [PF-004：Sub-agent 派发、协作与监督](PF-004-subagent-delegation-and-supervision/README.md) | `agent` | `user` |
| `PF-005` | [PF-005：智能体主动提问、请求授权与答复接续](PF-005-agent-initiated-human-input-and-approval/README.md) | `agent` | `user` |
| `PF-006` | [PF-006：用户设置、Agent 定义级授权与出厂默认覆盖](PF-006-user-settings-and-agent-definition-authorization/README.md) | `user` | `agent` |
| `PF-007` | [PF-007：系统发起的 HITL 与动作授权确认](PF-007-system-initiated-hitl/README.md) | `user` | `agent` |
| `PF-008` | [PF-008：统一决策池与跨会话直接答复](PF-008-unified-decision-pool/README.md) | `user` | `agent` |
| `PF-009` | [PF-009：多模态输入、附件与命令操作](PF-009-multimodal-input-attachments-and-commands/README.md) | `user` | `agent` |
| `PF-010` | [PF-010：个人与组织的资产、设置及权限管理](PF-010-organization-personal-assets-and-permissions/README.md) | `user` | `agent` |
| `PF-011` | [PF-011：面向未来的复杂日程规划、日历与通知提醒](PF-011-future-planning-calendars-and-reminders/README.md) | `agent` | `environment`、`user` |
| `PF-012` | [PF-012：Computer、Browser、Shell 能力与沙盒／本机使用](PF-012-computer-browser-shell-sandbox-and-native-use/README.md) | `environment` | `agent`、`user` |
| `PF-013` | [PF-013：Session、Run 生命周期与运行中输入管理](PF-013-session-run-lifecycle-and-pending-input-control/README.md) | `user` | `agent` |
| `PF-014` | [PF-014：运行时发现与按需装载工具、技能](PF-014-runtime-tool-and-skill-discovery-and-loading/README.md) | `agent` | `user`、`environment` |
| `PF-015` | [PF-015：制品管理与隔离工作副本](PF-015-artifact-management-and-isolated-working-copies/README.md) | `agent` | `user`、`environment` |
| `PF-016` | [PF-016：Agent 开发 Cordis 插件并在线部署装载](PF-016-agent-developed-cordis-plugins-and-live-deployment/README.md) | `agent` | `user`、`environment` |
| `PF-017` | [PF-017：跨会话历史状态检索与后台通信协作](PF-017-cross-session-history-and-background-coordination/README.md) | `agent` | `user` |
| `PF-018` | [PF-018：使用 omne-selfound 的知识与认知能力](PF-018-selfound-knowledge-and-cognition-use/README.md) | `agent` | `user`、`environment` |
| `PF-019` | [PF-019：租户订阅、额度、用量、账单与预算管理](PF-019-tenant-subscription-usage-billing-and-budget/README.md) | `user` | `agent` |
| `PF-020` | [PF-020：依赖可用性、局部离线与诚实降级](PF-020-dependency-availability-and-degradation/README.md) | `environment` | `user`、`agent` |
| `PF-021` | [PF-021：多机器接入、工作部署与动态装配](PF-021-multi-machine-deployment-and-assembly/README.md) | `environment` | `user`、`agent` |
| `PF-022` | [PF-022：多模态响应与输出](PF-022-multimodal-response-and-output/README.md) | `agent` | `user` |
| `PF-023` | [PF-023：会话级合法模型切换与下一轮接续](PF-023-session-model-selection-and-continuity/README.md) | `user` | `agent` |
| `PF-025` | [PF-025：兼容外部命令式 hooks 体系](PF-025-external-hooks-compatibility/README.md) | `agent` | `user` |

同一要求只由其 topic 正文拥有；多维度出现只表示不同观察面。

## 来源处置

源索引 `docs/requirements/product/user/README.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `f8a5af2faf2396eec489d787eb06cfc0a1c49d9ef88d1a02dda2e92459750f9a`）按当前 topic 元数据重建；原索引不复制，恢复坐标为 `git show e3573ca72d18bfe7ddd002df5025551b51eede46:docs/requirements/product/user/README.md`。完整理由见 [来源处置清单](../source-disposition.md)。
