# model-request-acceptance（历史装配投影）

> 此目录保存 D-076、D-092 曾采用的技术验收装配设计。原节点坐标为
> `realization/apps/model-request-acceptance`，已退出当前 `apps/` 实现映射；
> 对应源码现为开发示例 `examples/model-invocation-minimal-demo`。
> 以下起草时的源码路径、应用 owner 和「未开始」等陈述只说明当时的投影，
> 不能作为当前需要交付同名产品 app 的依据。旧决定中记录的路径与字节 SHA
> 保留为采用时的历史来源；此处迁址不变更已发布规格。

- kind：assembly
- 对象与设计修订：开发验收装配，revision 2，candidate；未接受。按独立评审 MAA-AR1/AR2 补全认证匹配值及本机查询/导出权限，待复审。
- 源码位置：`apps/model-request-acceptance`（D-076 采用时的节点坐标；当前源码已迁至 `examples/model-invocation-minimal-demo`，此坐标不再是产品应用或当前源码位置）。下文起草时的「尚未建应用」是旧时点读数，不能用来判断当前源码状态。
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
| 真实鉴权阶段的升级确认与目录启动写入如何排序 | [启动投影增量（候选）](v3-auth-bootstrap-design.md) |
| 哪些阶段和模型必须验，什么会阻止发送或通过 | [验证与证据](verification.md) |
| 已有哪条符合性绑定                         | [绑定表](bindings.yaml)       |

本文只定义技术验收装配；不补产品配置政策、会话创建 API、LLM 基类或组织自定义模型管理 API。候选命名不冒充已经存在的公开接口。

## 2026-09-27 最终技术采用

[D-076](../../../record/decisions/model-runtime-delivery-adoption/decision.md)接受对应精确规格与本节点投影。旧候选读数和验证历史保留。此事件不代替源码、真实故障/停止或37模型生产认证；新增实际绑定另附运行证据。

## 真实鉴权启动增量的分层状态

[v3-auth-bootstrap-design.md](v3-auth-bootstrap-design.md) revision 1 是本节点的窄候选增量，解决原 bootstrap 2/3“全阶段 ACTIVE 后确认”与目录 MD3 S-18 preprovide 耐久提交的冲突；原 design.md 未改。

- **语义接受**：原契约、D-075 和 D-076 的接受保留；本增量尚未接受，不能自动替代原确认规则。
- **可实施范围**：候选将基础迁移／真实鉴权依赖就绪后的升级确认与目录／lookup／唯一 CCL 就绪后的场景准入分开；仅覆盖 A-1/A-2/A-6 的本机阶段。须独立架构评审与主线精确采用，AB-G1 未闭合前不派发依赖此顺序的应用实现。
- **绑定与证据**：新增 0 条，bindings.yaml 不改；AB-V1～AB-V8 是待执行的真实组合和负控义务，不能以 provider 包内结果顶替。
- **实际验证**：尚无本增量应用运行证据。确认前基础 clock 租约允许写入；确认后清单已提交而后续启动失败时不整库回滚。确认删除后落盘失败等继承边界、真实身份和关闭证据缺口分别为 AB-G2/AB-G3，不表述为已修复。
## 真实身份启动顺序的当前采用（2026-09-27）

[D-092](../../../record/decisions/model-auth-bootstrap-adoption/decision.md) 精确采用 [v3-auth-bootstrap rev1](v3-auth-bootstrap-design.md) 的窄范围。独立架构评审范围内无阻断：基础六 fiber 真实就绪后确认、目录/CCL/lookup 完整门后才准入；确认后失败保留业务事实且不整库回退。原设计与起草标签保留历史坐标；应用源码、AB-V1～V8和逐符号守卫未完成，新增绑定0，不提升完整纵线。

## 2026-09-28 开发示例的当前落点

用户将此装配明确归为开发示例，不作为正式产品应用。原有 Cordis 装配、真实身份与来源、模型调用和会话日志的实现及测试移到 `examples/model-invocation-minimal-demo`；本目录只保留已采用的历史技术投影，不新增产品交互面或规格版本。示例在固定 DeepSeek V4 Pro 0813、文本、空工具、无 Run 的范围内提供实际终端流式多轮交互、正常关闭及同文件重开。源码集成点为 HUB `ef653370`；受控 TLS、PTY 与迁移测试的有限证据由当前交付记录维护，后续源码增量以 Git 历史为准。完整十三操作、37 模型双路径认证、异常退出恢复仍未签收，`bindings.yaml` 仍为 0 条。
