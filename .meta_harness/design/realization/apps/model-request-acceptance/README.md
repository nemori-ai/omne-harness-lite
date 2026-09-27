# model-request-acceptance

- kind：assembly。
- 对象与设计修订：开发验收装配，revision 2，candidate；未接受。按独立评审 MAA-AR1/AR2 补全认证匹配值及本机查询/导出权限，待复审。
- 源码位置：`apps/model-request-acceptance`，尚未建应用；不由设计目录存在推断实现。
- 交付面：[PF-013 模型档案与调用](../../../product/PF-013-model-profiles-and-invocation/README.md) rev 13 的模型请求纵线技术验收；相关 PF-009 rev 8、PF-012 rev 15 采用范围沿 runtime3。不是新的产品交互面。
- 边界依据：[适配提案](../../../record/proposals/model-request-adaptation/design.md)、[真实读取投影](../../../record/proposals/model-request-adaptation/read-projection.md)、[D-070](../../../record/decisions/model-adaptation-binding-acceptance/decision.md)、[D-072](../../../record/decisions/agent-definition-read-adoption/decision.md)、[D-073](../../../record/decisions/model-current-input-contracts-adoption/decision.md)、[D-074](../../../record/decisions/model-read-provider-adoption/decision.md)。

## 分层状态

- **语义接受范围**：catalog 中 profile3/messages4/response4/directory3、AD1、AE4/manifest3/registry3/LC4 已接受；account-identity3、organization-governance2、session-log2、session-tenancy2、credential-custodian2 等已有契约按设计表精确消费。runtime3、runner3 仍为 candidate，本装配不接受它们。D-074 只接受读取提供者，未接受本应用、transport 或目录/凭据来源修订。
- **可实施范围**：本稿把真实单机装配、机器场景入口、资源所有权、共享费用账本和阶段门写成候选实施边界。需要候选契约/节点采用后才可据其开工；已接受部分可由对应 owner 并行实施。完整 Agent Loop、工具执行、CLI、OAuth、MCP、中心同步及无真实来源分支不在成功范围。
- **绑定与证据**：[bindings.yaml](bindings.yaml) 为 0 条；研究有 37 个模型缓存读证据，但本应用没有实现层证据。认证须匹配精确档案/配置来源上下文、完整无损 ModelAdaptationBinding 和实际 provider route，不用裸修订或摘要替代全值比较；本机查询/导出共用所有者权限及显式租户范围。新增反例与全部义务见 [verification.md](verification.md)。
- **实际验证**：尚无应用运行、真实装配、生产模型认证或总体签收；本次仅运行设计结构检查，结果另列验证页。预定测试、节点无阻断评审和研究实测均不提升这一层。

## 阅读入口

| 问题                                       | 入口                          |
| ------------------------------------------ | ----------------------------- |
| 怎样启动、调用、恢复和关闭，谁拥有资源     | [实现设计](design.md)         |
| 哪些阶段和模型必须验，什么会阻止发送或通过 | [验证与证据](verification.md) |
| 已有哪条符合性绑定                         | [绑定表](bindings.yaml)       |

本文只定义技术验收装配；不补产品配置政策、会话创建 API、LLM 基类或组织自定义模型管理 API。候选命名不冒充已经存在的公开接口。

## 2026-09-27 最终技术采用

[D-076](../../../record/decisions/model-runtime-delivery-adoption/decision.md)接受对应精确规格与本节点投影。旧候选读数和验证历史保留。此事件不代替源码、真实故障/停止或37模型生产认证；新增实际绑定另附运行证据。
