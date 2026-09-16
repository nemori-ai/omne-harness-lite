# 系统需求容器

这里维护待设计系统的产品结果、系统目标与全局约束，并可保存形成这些要求时值得回顾的用户访谈语境；
系统身份和要求由实际导入的正文或本次明确输入确定，不由工作区所在位置推断。

条款身份、确认范围、来源和基线由各 topic 拥有。[当前需求覆盖输入](coverage-obligations.md)
把可消费条款投影给后续能力纵线，并规定覆盖结论的最低证据；它不重新定义需求，也不替代提案中的能力覆盖分析。

## 检索入口

- 产品要求可按 [智能体](product/by-agent.md)、[环境](product/by-environment.md) 或
  [用户](product/by-user.md) 观察面检索；这些索引不是能力维度，也不预设插件边界。
- [来源处置](source-disposition.md) 与 [基础来源](foundation-provenance.md) 说明当前正文怎样从已确认输入形成；
  它们不提升条款状态。
- [用户访谈记录](interviews/README.md) 保存需求讨论、争论、公开理由、修正及决策背景；它是可选来源语境，
  不自动成为正式要求、提案或决定。

### 产品主题

| 要求     | 主题                                                                                                  | 要求     | 主题                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `PF-001` | [租户与组织上下文](product/PF-001-tenant-organization-context/README.md)                              | `PF-002` | [外部变化响应](product/PF-002-external-change-response/README.md)                                         |
| `PF-003` | [工具执行观察与控制](product/PF-003-tool-execution-observation-and-control/README.md)                 | `PF-004` | [Sub-agent 委派与监督](product/PF-004-subagent-delegation-and-supervision/README.md)                      |
| `PF-005` | [Agent 发起人类输入与授权](product/PF-005-agent-initiated-human-input-and-approval/README.md)         | `PF-006` | [用户设置与 Agent 定义授权](product/PF-006-user-settings-and-agent-definition-authorization/README.md)    |
| `PF-007` | [系统发起 HITL](product/PF-007-system-initiated-hitl/README.md)                                       | `PF-008` | [统一决策池](product/PF-008-unified-decision-pool/README.md)                                              |
| `PF-009` | [多模态输入、附件与命令](product/PF-009-multimodal-input-attachments-and-commands/README.md)          | `PF-010` | [组织与个人资产、权限](product/PF-010-organization-personal-assets-and-permissions/README.md)             |
| `PF-011` | [规划、日历与提醒](product/PF-011-future-planning-calendars-and-reminders/README.md)                  | `PF-012` | [Computer、Browser、Shell 与沙盒](product/PF-012-computer-browser-shell-sandbox-and-native-use/README.md) |
| `PF-013` | [Session、Run 与待处理输入](product/PF-013-session-run-lifecycle-and-pending-input-control/README.md) | `PF-014` | [工具与 skill 的发现和装载](product/PF-014-runtime-tool-and-skill-discovery-and-loading/README.md)        |
| `PF-015` | [制品与隔离工作副本](product/PF-015-artifact-management-and-isolated-working-copies/README.md)        | `PF-016` | [Agent 开发插件与在线装载](product/PF-016-agent-developed-cordis-plugins-and-live-deployment/README.md)   |
| `PF-017` | [跨会话历史与后台协作](product/PF-017-cross-session-history-and-background-coordination/README.md)    | `PF-018` | [Selfound 知识与认知](product/PF-018-selfound-knowledge-and-cognition-use/README.md)                      |
| `PF-019` | [订阅、用量、账单与预算](product/PF-019-tenant-subscription-usage-billing-and-budget/README.md)       | `PF-020` | [依赖可用性与降级](product/PF-020-dependency-availability-and-degradation/README.md)                      |
| `PF-021` | [多机器部署与装配](product/PF-021-multi-machine-deployment-and-assembly/README.md)                    | `PF-022` | [多模态响应与输出](product/PF-022-multimodal-response-and-output/README.md)                               |
| `PF-023` | [会话模型选择与连续性](product/PF-023-session-model-selection-and-continuity/README.md)               | `PF-024` | [多命令工具定义](product/PF-024-multi-command-tool-definition/README.md)                                  |
| `PF-025` | [外部 hooks 兼容](product/PF-025-external-hooks-compatibility/README.md)                              |          |                                                                                                           |

### 系统主题

- [跨系统约束](system/constraints/README.md)
- [完全动态系统](system/fully-dynamic-system/README.md)
- [利益对齐](system/interest-alignment/README.md)
- [超长期运行与演化](system/long-running-and-evolving/README.md)
- [可观测性与日志](system/observability-and-logging/README.md)
- [omne-next 连续性](system/omne-next-continuity/README.md)
- [运行时状态与连续性](system/runtime-state-and-continuity/README.md)

## 准入门槛与停止条件

- 至少能定位观察者、触发情形、所需/禁止结果、来源和确认范围；未决解释必须能与已确认条款分开。
- 尚不能形成正式条款，但交流来源可恢复且具有持续回顾价值时，可先进入访谈包；其他未确认输入停在 intake 或任务输入，不补造需求。
- 机制偏好和能力划分转 proposals，不写回结果条款；访谈中的确认或拒绝也须由正式 owner 显式吸纳才升级状态。

## 新建需求或访谈主题

正式需求从本地 [topic 模板包](.templates/topic/README.md) 复制为 `system/<topic>/` 或 `product/<topic>/`。
入口说明本次范围与输入，`requirements.md` 拥有条款，`changes.md` 拥有来源、确认与前提变化；
下游能力覆盖与机制选择归提案，不把需求名称直接转成新插件。

可选的访谈记录从[访谈模板包](.templates/interview/README.md)复制为 `interviews/<topic>/`；
它保存讨论语境与后续归位建议，不创建条款编号，也不替代正式需求主题。

已有主题沿其入口接续；本 README 维护 system/product 索引、访谈入口及覆盖义务入口，不将 `.templates/` 计作已确认要求。
信息包的裁剪与引用见 [系统设计链](../README.md#主题是信息包)。
