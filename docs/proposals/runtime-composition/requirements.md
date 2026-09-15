# 需求消费、交接对齐和本轮覆盖

消费基线为 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0`，本轮开始时工作分支的
`docs/requirements/` 与其无差异。复用已交付的保留引用
`requirements-baseline/2026-09-13-dsh-core-adoption`、[自包含 bundle 及恢复记录](../dsh-core-adoption/requirements.md#基线恢复)，
不为同一需求快照再制作一份历史包。确认范围以该 commit 的正文为准。

## 本轮直接设计范围

| 确认条款 | 本轮回应及边界 |
|---|---|
| [SYS-KERNEL/TENANT/SPEC/DEPLOY/LLM](../../requirements/system/constraints.md) | Cordis 官方包；自有 fork 的语义责任；租户/当前操作授权；语言无关交接；单机串行边界可独立扩展；模型统一 OpenRouter，未设计具体模型协议 |
| [SYS-DYNAMIC.C1/C2](../../requirements/system/fully-dynamic-system.md) | 定义、贡献、绑定和运行对象分别建模；撤销与新使用共用屏障，在途使用保留；不宣称达到全部完全动态判据 |
| [SYS-RUNTIME-CONTINUITY.C1–C3](../../requirements/system/runtime-state-and-continuity.md) | Session 事实、临时运行与独立工作分离；附着释放不删除历史，重新附着不自动恢复 Run；具体同构/异构恢复协议仍需后续能力 |
| [PF-013.C1–C4/C10](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | 归档/删除/运行控制与附着生命周期分别表达；Session 资格变化必须与发布/准入共同裁决；逻辑控制和物理停止不混同。完整 Session/Run 状态机不在本轮发布 |
| [PF-006.C2/C4/C5](../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、[PF-010.C1/C4/C5](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) | 原定义关联、当前目标操作权限和运行配置分别表达；不以历史允许或同租户标签放行。IAM/资产的完整数据契约仍由各专题定义 |
| [PF-020.C1–C6](../../requirements/product/environment/PF-020-dependency-availability-and-degradation.md) | 实例必要依赖、操作条件和可选贡献分开；失效仅影响真实依赖；注册存在不证明就绪；不绕过 OpenRouter |

沿用 [D-005](../../decisions/D-005-agent-runtime.md) 及精确 identity/live-agent v1；
本轮组合协议落实 AR-4–AR-16 的提供者义务，不撤回或改写已发布版本。

## 共同边界覆盖与后续责任

| 需求/材料 | 本轮确定的共同边界 | 必须由后续专题完成 |
|---|---|---|
| [PF-013.C5–C11](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | 输入/Run 权威独立于活体；忙时受理不是注入当前模型调用 | Session 日志、耐久队列、取批/编辑竞争、控制整体意图及恢复规格 |
| [PF-003.C1–C6](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | 工具执行拥有过程帧/后台工作；Session 关联，上下文选择，存储保存 | 帧/结果协议、记录等级、后台接管、控制传播和保留条件 |
| [PF-005](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md)、[PF-007](../../requirements/product/user/PF-007-system-initiated-hitl.md)、[PF-008](../../requirements/product/user/PF-008-unified-decision-pool.md) 已确认条款 | 耐久人类等待不由临时实例所有；普通输入不自动成为答复 | 待答和唯一答复、恢复接续、暂行批准、决策池的精确行为 |
| [PF-009.C1/C3/C4](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md)、[PF-022.C1–C6](../../requirements/product/agent/PF-022-multimodal-response-and-output.md)、[PF-023.C1–C7](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md) | 原始内容、模型投影、实际请求依据和供应商协议分开 | 唯一共享媒体/内容数据契约、能力判定、准备发送、窗口压缩与模型切换提交 |
| [PF-014.C1–C6](../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md)、[PF-024.C1/C2](../../requirements/product/agent/PF-024-multi-command-tool-definition.md) | scope/贡献可见性不等于可调用；在途使用有明确所有者 | 工具/skill 激活、单槽多命令、内容预算、装配一致性 |
| [PF-017.C1–C4](../../requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md) | 历史读面不依赖目标 Agent/原工具驻留；查询与通信各自授权 | 查询游标/水位、协作投递/受理/唤醒及其耐久语义 |
| [PF-019.C2/C4/C6/C7](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md)、[SYS-OBSERVABILITY.C1–C7](../../requirements/system/observability-and-logging.md) | 业务身份与请求/调用关联不随运行时销毁而失去 | 计费准入、金额精度/迟到费用、完整观测和读取治理 |

本轮不以组合形式模型覆盖所有这些条款。未列为完整交付的要求继续有效，不得
用共用 Context、日志追加成功或 Provider 已注入代替其具体设计与验证。

## 交接与候选的适用性

[来源清单](evidence/inputs.json)保留上下文初步模型和工具帧协调稿的原件、字节与哈希，
分别支持能力分界和工具帧责任的取舍；原阶段检查不构成当前实现证据。

会话交接全文的历史身份为该清单中的 `handoff_source`，长期消费仅需以下事实：
用户要求从 Cordis 能力组合出发设计上下文与 Session，并纳入 Session log 及工具
内部过程帧的交接；这些问题没有接受全部候选接口。该交接 §2 记录上述用户范围，
§3.3/§3.4 纠正早期稿的基线：D-005 已接受身份/活体契约，Cordis 4.0.2 已固定，
fork 仅为源算法起点。更早两稿中的空 catalog/未固定版本已过时，不作为本轮前提。
精确用户要求沿本页基线与对应 PF 条款消费，候选边界分别归 design 和上述两份原件。

当前另有 D-006、PF-014.C6、PF-024.C1/C2 和 SYS-DYNAMIC.C2 澄清，均按上述基线
消费。早期稿的历史评审不覆盖这些新增依据或本轮精确接口。

[提示词旧候选](../agent-core/v1/system-prompt.md)中已明确的用户要求仅用于保持
静态原文与受控动态来源的边界；不接受其旧聚合/Schema，不在本轮替动态渲染频率
作选择。该文件在消费基线中可读取，后续专题须将所用确认条款与目标规格正式关联。

## 下一阶段的可派发条件

本轮 A 给出运行附着组合和职责边界。B/C/D/E 仍按 [D-006 计划](../dsh-core-adoption/design-plan.md)
分别正式设计。共享内容、Run/Step 身份、持久写入/恢复和精确请求事实等交叉接口
必须由共同拥有者先定稿；不能把本轮“归属已明确”当作“所有数据结构已发布”。
