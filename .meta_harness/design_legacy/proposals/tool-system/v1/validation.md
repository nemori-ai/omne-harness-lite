# 需求覆盖、验证方向与落实次序

本页记录[候选草案](README.md)的覆盖主张和验证计划。没有新增已接受规格，
没有运行本稿的产品测试或形式模型；文档结构检查与独立评审不证明运行正确性。

## 需求覆盖

以下消费范围固定于本稿入口所述需求工作区快照。引用一份要求不等于本工具
专题已经完成它的全部功能，组合接口的未决事项继续限制后续实现承诺。

| 要求与确认范围 | 本稿的对应位置及覆盖边界 |
|---|---|
| [SYS-KERNEL、SPEC、DEPLOY、TENANT、LLM](../../../requirements/system/constraints.md) | 官方 Cordis、其它选定 DSH fork；语言无关候选、单机边界、显式租户和 OpenRouter；具体发布版本及正式模型未定 |
| [SYS-DYNAMIC.C1/C2](../../../requirements/system/fully-dynamic-system.md) | 定义、实现、内容依赖和绑定可变化，版本切换与排空；不声称任意资源可无损在线迁移 |
| [SYS-RUNTIME-CONTINUITY.C1–C3](../../../requirements/system/runtime-state-and-continuity.md) | 持久事实与运行资源分开、同构资源重连、环境与能力绑定；异构迁移的适用范围仍待细化 |
| [SYS-LONG-RUNNING](../../../requirements/system/long-running-and-evolving.md)、[SYS-ALIGNMENT](../../../requirements/system/interest-alignment.md) | 长期等待、可恢复关联、明确权限和外部效果；不宣称只靠工具层兑现整体长期对齐目标 |
| [SYS-OBSERVABILITY.C1–C7](../../../requirements/system/observability-and-logging.md) | 定义到动作、过程/结果、控制、版本、环境、恢复和费用的因果关联；容量、保留与隐私规则需量化 |
| [PF-024.C1/C2](../../../requirements/product/agent/PF-024-multi-command-tool-definition.md) | 单槽位多命令、每命令 Schema/帮助/授权；未承诺批量或 shell 管道 |
| [PF-014.C1–C6](../../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md) | 摘要发现、渐进读取、真实绑定、动态失效、必需 tool–skill 依赖与请求内容证据；搜索排序和内容预算数值未定 |
| [PF-003.C1–C6](../../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | 单次状态、按需过程、单独中断、手动/自动转后台及原工作重连；执行器能力仍需实证 |
| [PF-016.C1–C7、T1–T6](../../../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) | 精确制品、受控准备、就绪发布、排空、权限边界与恢复；代码编辑体验、构建器及部署产品入口另行设计 |
| [PF-005](../../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md)、[PF-007](../../../requirements/product/user/PF-007-system-initiated-hitl.md)、[PF-008](../../../requirements/product/user/PF-008-unified-decision-pool.md) | 耐久动作等待、独立请求、首个有效答复、重新准入与暂行资格接口；请求/决策池权威和领域撤销机制不在本层重建 |
| [PF-001](../../../requirements/product/user/PF-001-tenant-organization-context.md)、[PF-006](../../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、[PF-010](../../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) | 租户、成员关系、资产选用与当前动作授权区分；具体权益、继承和设置求值归其拥有者 |
| [PF-013.C2–C4、C6、C10](../../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | 精确 Run、工具级联、强停/物理停止区分、复合控制、撤权边界；完整会话和输入队列设计另行完成 |
| [PF-012](../../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)、[PF-020](../../../requirements/product/environment/PF-020-dependency-availability-and-degradation.md)、[PF-021](../../../requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md) | 环境显式选择、真实就绪、故障边界、执行所有权与旧提交封锁；本稿没有实现六种环境组合或集群 |
| [PF-019](../../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md) | 并发预算准入、原 Step 归因及迟到费用；账单、套餐、结算由计费能力拥有 |
| [PF-009](../../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md)、[PF-015](../../../requirements/product/agent/PF-015-artifact-management-and-isolated-working-copies.md)、[PF-022](../../../requirements/product/agent/PF-022-multimodal-response-and-output.md)、[PF-023](../../../requirements/product/user/PF-023-session-model-selection-and-continuity.md) | 多模态规范输出、持久制品引用、技能资源定位及下一请求重新组装；完整媒体交付、Skill slash 入口和模型选择另属各专题 |
| [PF-004](../../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md)、[PF-002](../../../requirements/product/environment/PF-002-external-change-response.md)、[PF-011](../../../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md)、[PF-017](../../../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md)、[PF-018](../../../requirements/product/agent/PF-018-selfound-knowledge-and-cognition-use.md) | 通过受控动作和交付入口组合，保留各自权限/所有权；不把子 Agent、Connector、日程、通信或知识系统归并成工具作业 |

## 需要相邻能力提供的契约

| 拥有者 | 工具系统所需承诺 | 缺口对实施的限制 |
|---|---|---|
| 资产/内容与当前授权 | 精确版本、读取和使用资格、撤回生效、可核验的当前准入 | 未定义前不能实现永久缓存放行或自动继承授权 |
| 上下文组装/模型适配 | 可辨认请求快照、必需指引纳入证据、窗口失败、工具返回格式 | 未兑现前不能标记必需 skill 已满足或模型投影兼容 |
| Session / Run 控制 | 精确目标、停止新接纳、可接续资格、耐久输入受理与去重 | 未兑现前不能保证复合控制和后台结果不重复触发 |
| 人类请求与动作批准 | 耐久等待、答复权限、首有效答复及精确动作关联 | 不能用工具 Promise 或聊天文本实现长期批准 |
| 预算与存储 | 按调用预留/对账、条件状态更新、耐久回执和容量失败 | 不能承诺并发预算、准入原子性或结果不丢 |
| 环境执行器 | 实际停止/重连范围、外部工作标识、权限边界、资源所有权 | 每项后台与恢复能力必须逐实现通过验证，不从接口存在推定 |

## 候选不变量与反例场景

下列 V1–V11 是本提案的讨论编号，不登记为正式契约 ID。

| 性质 | 最小反例/验证场景 |
|---|---|
| V1：调用接纳与绑定唯一且可追溯 | 接纳成功但回执丢失、Loop 重建及并发重放只认回同一 invocation；同键不同内容报冲突。同名工具替换后，旧请求不得执行新实现 |
| V2：必需 skill 与请求内容一致 | 只加载实现、skill 无读取资格、压缩删正文、两个操作要求冲突版本；受影响操作不能被当作可调用，帮助仍可解释允许披露的条件 |
| V3：每次新动作遵守租户与当前准入 | 发现后撤权、等待答复期间退租、两个并行调用争用剩余预算；不得用旧快照、批准文本或重复预留绕过 |
| V4：转换和重连不重执行 | 运行中写一次带唯一标识的外部效果，转后台并销毁/重建 Agent；原工作继续且 invocation/attempt 不变，效果没有第二份 |
| V5：控制与收束竞态可解释 | 完成/取消/转后台三方竞争；Run 停止时同时请求新调用；陈旧复合控制到达新的 Run，不得丢工作或误伤新 Run |
| V6：逻辑停止与物理结果不混淆 | 强停后旧执行器返回成功、继续请求动作、仍持有共享桌面；拒绝无效继续权，保留外部事实并阻止不安全复用 |
| V7：耐久等待和交付不重复触发 | 两端同时回答、答复后进程重启、接收成功但交付回执丢失；只触发一次逻辑接续，外部效果仍按其幂等能力处理 |
| V8：动态变化不卸掉在途依赖 | 接纳与发布同时发生、旧 provider 仍占用、清理失败、skill 撤回；保留已接纳工作的精确依赖，新准入反映当前状态 |
| V9：真实结果与可见过程相区分 | 两个观察者从不同游标读取、保留窗口截断、呈现失败、存储满、迟到费用；不消费他人输出、不隐藏缺口、不因渲染错误重执行 |
| V10：依赖失效撤回完整派生效用 | 卸掉 `save` 必需的 skill：命令绑定、可用帮助、指引、独占挂载/监听均撤回，`status` 保留；依赖恢复重新激活但不重执行旧调用 |
| V11：逆效用只撤回其所拥有贡献 | T1/T2/显式用户使用共享 S，撤掉 T1 不伤其余使用；初始化中卸载、A/B 叠加限制后只撤 A、清理报错及旧回调晚到，不丢其它贡献或复活失效代次 |

过程帧另按[专题协议](frames.md)验证：多生产者乱序、同键内容冲突、写入确认
丢失后通道换代、接管者沿原键补交而旧通道被拒绝、待确认载荷丢失时明确缺口、
暂态内容未确认、终态与记录关闭竞态、无订阅者、媒体保存失败、旧格式
解码不可用、后端更换及 Session 删除并发。尤其检查回放不重派工具、模型摘要
不冒充原件、观察者卸载不关闭生产和必需记录。

TLA+ 优先建模依赖变化与激活/撤回、调用接纳、发布/占用、转换/停止/收束及答复/交付的状态转移，
用两个调用、两个实现代次和有限并发控制探索反例；租户、主体和动作关系可用
Alloy 辅助检查。JSON Schema 定义持久引用、操作定义、依赖声明、过程及结果
的共享数据。模型需写明失败、公平性和外部效果假设，不能用有限模型检查宣称
所有执行器和任意网络分区都已证明正确。

## 建议的验证推进

先固定讨论中有争议的语义和组合接口，再以最小纵向场景做实验：一个含
`help/status/save` 的单槽位工具，`save` 必需一个 skill；能够读取指引、调用、
按当前授权拒绝，并对 skill 更新和上下文压缩给出明确结果。卸掉 skill/provider
后检查完整派生效用撤回及其它消费者不受误伤，再恢复依赖检查无重复注册和
无业务重执行。

随后用一个有真实工作标识的长时 Shell 操作验证单次取消、转后台、会话重建
及原工作重连，再覆盖实现更新排空、HITL 等待与故障注入。导入 DSH fork 时
保留有意义的上游测试，新增本项目差异场景；不为文档草稿制造镜像测试。

上述实验是设计验证的起点，不是第一版完整交付范围的缩减。Browser/Computer、
各执行环境、长期决策池和其它已确认机制仍须在对应专题兑现。
