# 需求消费与设计覆盖

本轮工作区以 `c3563c9` 为起点；需求正文继续使用其包含的
`dae2df36491c0ab4b8b9a3d16db639dab5ea88b0` 确认范围，既有独立恢复资料见
[D-007 消费记录](../runtime-composition/requirements.md)。2026-09-13 当前会话新增
工具定义声明、装载自动登记、当前模式／授权判定和阻塞审批的明确约束，忠实记录于
[计划](plan.md#工具声明驱动的系统-hitl)。接受设计前须将本次补充形成可恢复的提交依据。

以下列出必须兑现的范围，不是覆盖已完成的声明。[能力图](capabilities.md)只完成
职责识别；精确操作、模型、场景、评审和实际实现证据各自仍须补齐。

| 要求及确认范围 | 本轮设计归属和验收要点 |
|---|---|
| [PF-001 确认正文](../../requirements/product/user/PF-001-tenant-organization-context.md#已确认要求)、SYS-TENANT | 双层身份、当前组织上下文、角色与资源权限；隔离与共享权益并存，scope 可见性不代替授权 |
| [PF-006.C1–C6](../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md#已确认要求) | 字段 owner／作用域／缺席规则、定义授权及持续授权、撤回与下一准入；明确模式和有效来源，不预设全局统一设置层级 |
| [PF-010.C1–C10 及管理操作表](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md#已确认要求) | 身份／成员、定义／权益／选用、设置／授权、模型档案的管理行为和引用影响；Connector、知识与专属账号的领域流程只定义接入义务 |
| [PF-013.C1–C11](../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md#已确认要求) | Session 目录与终态、精确 Run 控制、耐久有序队列、编辑竞态、取批与整体打断意图、跨端恢复；日程仅保留来源和组合接口 |
| [PF-003.C1–C6](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求) | 独立调用状态、按需过程披露、单次中断、手动／自动后台和重新关联；实际后台宿主故障保证逐提供者说明 |
| [PF-014.C1–C6](../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md#已确认要求)、[PF-024.C1/C2](../../requirements/product/agent/PF-024-multi-command-tool-definition.md#已确认要求) | 有权限的渐进发现、工具／命令参数与单槽位投影、必需 skill 生命周期、当前资格、声明登记与撤回 |
| [PF-007.C1–C7](../../requirements/product/user/PF-007-system-initiated-hitl.md#已确认要求) | 系统事前确认闭环；暂行资格、产物及撤销义务保持独立，不能用通用批准替代领域证明 |
| [PF-005.C1–C7/C10](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md#已确认要求)、[PF-008.C1–C7](../../requirements/product/user/PF-008-unified-decision-pool.md#已确认要求) | 最小共用请求、耐久答复与后果交付、池读写和可答性；专用能力授权由相应主体裁决，不把普通回答当持续同意 |
| [PF-009.C1–C7](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md#已确认要求)、[PF-022.C1–C6](../../requirements/product/agent/PF-022-multimodal-response-and-output.md#已确认要求) | 唯一内容与媒体引用、顺序／原件／保留／实际投送、部分交付；slash 到同一输入语义，keyboard 到精确控制；完整 UI 不在本轮 |
| [PF-023.C1–C7](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md#已确认要求) | 模型候选与事实、会话级选择、下一 Run、模态门及一次压缩、实际生成模型和在途绑定 |
| [PF-019.C1–C7](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md#已确认要求) | Step／attempt 费用和计量质量、预算立场、并发准入、迟到结算；订阅与账单的真实提供者义务，支付渠道不在本轮 |
| [SYS-RUNTIME-CONTINUITY.C1–C3](../../requirements/system/runtime-state-and-continuity.md#已确认要求)、[SYS-OBSERVABILITY.C1–C7](../../requirements/system/observability-and-logging.md#已确认要求与工程含义) | 所有权与持久状态解耦，兼容恢复位置、失败／未知及关联，历史查询和诊断不依赖临时实例 |
| [SYS-DYNAMIC](../../requirements/system/fully-dynamic-system.md)、[SYS 全局约束](../../requirements/system/constraints.md) | 定义／实现／绑定／组合的动态变化、语言无关规格、首版单机且保留未来部署边界、租户与 OpenRouter |

## 相邻边界与未覆盖部分

- PF-004 的委托／handoff、PF-011 日程、PF-017 跨会话通信：保留可信发起者、
  精确目标、受理及控制／费用关联；不把本轮局部端口冒充它们的完整能力契约。
- PF-012/PF-020/PF-021 的执行环境与就绪：定义实际能力、不可用、故障和兼容
  恢复的提供者义务；本轮不承诺某一 shell/browser/computer/sandbox 的实际产品实现。
- PF-015 的制品／工作副本：媒体引用可关联制品，但本轮内容保存不实现隔离工作副本
  或并发保存整合。PF-016 的在线插件治理沿既有工具候选和 D-007 消费边界，完整分发
  与隔离执行器不因定义了动态注册表而完成。PF-018 的 selfound 能力保留独立权威。
- 格式容量、执行时限、支持平台、财务商业政策及客户端体验不得用任意数值冒充
  用户要求；必须区分可配置且有约束的实施参数与尚会改变产品含义的未决政策。

已接受 D-005/D-007 继续有效；旧 tenant/model/tool 候选不是正式依赖。旧租户草案
中的“成员之间绝对隔离”不能否定已确认的组织共享资产，旧模型闭集不能排除文件
与未知能力，旧工具来源建议不能扩大 D-006。本轮必须明确这些差异后再接受相应规格。
