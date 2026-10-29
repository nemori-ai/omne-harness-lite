# 工程工作入口

本区帮助人和 agent 在任务场景中找到有效输入、适用约定、技能方法、交付与验证。先选一个主场景，再按条件展开共享规范。实际契约继续归领域和成员，开发命令继续归[开发指南](../development.md)。

## 从任务开始

从[场景选择](scenarios/README.md)进入调查与设计、新功能、缺陷、重构、性能、依赖与环境、评审交付或文档技能维护。已有明确依据的局部任务直接工作；新含义或必要依据缺失时，只暂停依赖部分。常驻线会话与 reduce 会话不走场景选择，从下表前两行进入。

实现维护者先确定任务；评审者先确定精确成果与验收；架构和交付负责人先检查目标、证据与未决。十类角色的首轮路径由[读者入口](../README.md)维护，使用者不必为一次公开操作通读工程文档。

## 查询共享主题

| 要回答的问题 | 唯一展开入口 |
|---|---|
| 常驻线会话开工、交回、等待与恢复 | [`line`](../../.meta_harness/agents/skills/line/canonical/SKILL.md) 技能，阶段归[Line 状态空间](map-reduce-states.md#4-line-状态空间)，记录格式归[线会话记录](integration.md#线会话记录) |
| reduce 会话建卡、派发、集成与收口 | [`dispatch`](../../.meta_harness/agents/skills/dispatch/canonical/SKILL.md) 与 [`integrate`](../../.meta_harness/agents/skills/integrate/canonical/SKILL.md) 技能，阶段归[Reduce 状态空间](map-reduce-states.md#3-reduce-状态空间)，协作规则归[集成节点的清单](integration.md#集成节点的清单) |
| 对话建卡、取任务、更新与恢复 | [agent交付操作](agent-delivery.md)，先核实际启用范围 |
| 卡、Stage、条件、决定及调度单写 | [交付协议](delivery.md) |
| 交付线、里程碑、契约基线与卡属性 | [多层分支集成](integration.md#交付线)及[卡属性与合法组合](delivery.md#卡属性与合法组合) |
| 六种工作类型及其证据 | [工作类型](work-types.md) |
| 正式技术提案与规范写回 | [RFC入口](../rfcs/README.md) |
| 输入、范围、责任、交接、停止与完成 | [共享工作约定](workflow.md) |
| 可信、可解释、质量、性能与交付量的依据 | [质量与证据](quality.md) |
| 技能名称、固定来源、采用与加载 | [技能引用](skills.md) |
| TypeScript 方法与未定政策 | [技能采用及差异](skills.md#项目差异与负责边界) |
| 公开入口、包与依赖 | [源码布局](../workspace.md#使用与维护)及[创建入口](../development.md#创建和整改产品包) |
| 开发环境与工具版本 | [开发准备](../development.md#准备可用的检出)及实际配置 |
| 异步、取消、清理与资源 | [防御指导](../defensive-patterns.md)及[验证责任](quality.md#异步资源的验证责任) |
| 分层、SSOT、表达、排版与维护 | [文档治理](documentation.md) |
| 演进、独立消费、提交与发布边界 | [演进与交付](publication.md) |

## 现行源与未完成范围

本区组织现行项目约定及已授权的共享／场景结构。它引用[研发品味的项目补充](../../.meta_harness/agents/roles/engineering-taste.md)、[源码布局](../workspace.md)、[验证说明](../verification.md)、[防御指导](../defensive-patterns.md)、[整洁回路](../clean-loop.md)和[贡献指南](../../CONTRIBUTING.md)，不替代这些拥有者。

本区的研发方法分三层：流程 pstack `poteto-mode`，写法 Matt，品味 ub-mode。分工、精确来源及读取方式归[技能引用](skills.md#三层分工)；宿主发现、步骤遵循及行为结果分别判断。

仍有具名缺项：[TypeScript 政策](skills.md#尚待明确的-typescript-政策)、[运行政策](scenarios/dependencies-and-runtime.md#尚待明确的运行政策)与[宿主加载与行为验证](skills.md#宿主加载与行为验证待补)。

GitHub内置Status字段承载协议Stage，配置按字段ID定位；不另建可独立编辑的Stage副本。

## 检查与维护

文档维护者更新拥有者正文，再同步场景、技能入口和角色／任务导航。目标由[唯一登记](../documentation.json)维护。运行 `pnpm run check:docs` 核对链接，运行 `pnpm run docs:inventory` 观察缺项、未知和增减。结果范围见[治理说明](documentation.md#检查与结论边界)；不将结构通过当作内容、技能行为或发布授权。

工作任务的同步、FI/RI、主干准入、稳定点与流程失效时的恢复，从[多层分支集成](integration.md)进入。主干准入、Git 运输和交付接受分别核对。
