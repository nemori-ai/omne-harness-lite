# 工程工作入口

本区帮助人和 agent 在任务场景中找到有效输入、适用约定、技能方法、交付与验证。先选一个主场景，再按条件展开共享规范。实际契约继续归领域和成员，开发命令继续归[开发指南](../development.md)。

## 从任务开始

从[场景选择](scenarios/README.md)进入调查与设计、新功能、缺陷、重构、性能、依赖与环境、评审交付或文档技能维护。已有明确依据的局部任务直接工作；新含义或必要依据缺失时，只暂停依赖部分。

实现维护者先确定任务；评审者先确定精确成果与验收；架构和交付负责人先检查目标、证据与未决。十类角色的首轮路径由[读者入口](../README.md)维护，使用者不必为一次公开操作通读工程文档。

## 流程事实在哪

研发流程的环节与做法归 pqw 各技能，本仓库只写自己的命令、位置与判据。下表每个事实只有一个家，其他文件只放指向它的一行指针。

| 事实 | 唯一拥有者 |
| --- | --- |
| AI 主导研发交付的心智 | pqw `teach-pqw-skills` 的 `mental-models.md` |
| 研发流程的环节与做法 | pqw 各技能，入口 `single-session-dev-flow` |
| pqw 的接入值（命令、位置、阈值） | [根 AGENTS.md 的 pqw-skills 接入](../../AGENTS.md#pqw-skills-接入) |
| 研发方法分层与外部技能钉版 | [三层分工](skills.md#三层分工)、[来源与项目采用](skills.md#来源与项目采用) |
| 子代理的模型与档位 | [子代理的模型与档位](skills.md#子代理的模型与档位) |
| 研发品味的项目补充 | [研发品味](../../.meta_harness/agents/roles/engineering-taste.md) |
| 卡、交接信息包、卡属性 | [卡就是交接信息包](delivery.md#卡就是交接信息包)、[卡属性与合法组合](delivery.md#卡属性与合法组合) |
| 交付与接受 | [提交成果供接受](delivery.md#提交成果供接受)、[接受、取消与重开](delivery.md#接受取消与重开) |
| 发卡、开工、开 PR、gate 确认与接受的命令 | [`omne-card`](../../.meta_harness/agents/skills/omne-card/canonical/SKILL.md) |
| 写者约定（门禁、不跑的检查、禁用 stash、trailer） | [`omne-card` 的写者约定](../../.meta_harness/agents/skills/omne-card/canonical/SKILL.md#写者约定) |
| L3 热点清单 | [`omne-card` 的 L3 热点清单](../../.meta_harness/agents/skills/omne-card/canonical/SKILL.md#l3-热点清单) |
| main 与 stable 的提升、npm 发行与恢复 | [`omne-card` 的提升与发行](../../.meta_harness/agents/skills/omne-card/canonical/SKILL.md#提升与发行) |
| 轨道、gate、准入的时机与规则 | [轨道责任与保护](integration.md#轨道责任与保护)、[现行准入](integration.md#现行准入) |
| 准入的机制（记录、增量、复用） | [测试与准入工具说明](../../tools/test-runner/README_ZH.md) |
| 风险级别与人审数 | [按风险选择接受实现的看法](quality.md#按风险选择接受实现的看法) |
| 硬线与传感器 | [整洁回路](../clean-loop.md#回路怎么转) |
| 署名、分支、PR 表达 | [贡献交付](../../CONTRIBUTING.md#形成可审阅的交付) |
| 环境、命令、子模块初始化 | [开发指南](../development.md) |
| 过程材料放哪、唯一源 | [位置与唯一源](documentation.md#位置与唯一源) |
| 文档写作规则 | [文档写作规则](documentation.md#文档写作规则) |
| 缺省基线与验收锁 | [仓库工具链说明](../../tools/repo-toolchain/README_ZH.md) |
| 冲突与验收的入口 | [冲突与验收](../context-map.md#冲突与验收) |

## 查询共享主题

| 要回答的问题 | 唯一展开入口 |
|---|---|
| 六种工作类型及其证据 | [工作类型](work-types.md) |
| 正式技术提案与规范写回 | [RFC入口](../rfcs/README.md) |
| 输入、范围、责任、交接、停止与完成 | [共享工作约定](workflow.md) |
| 可信、可解释、质量、性能与交付量的依据 | [质量与证据](quality.md) |
| Journal 写入量的测量读数、守卫与阈值 | [性能基线](perf-baseline.md) |
| 技能名称、固定来源、采用与加载 | [技能引用](skills.md) |
| TypeScript 方法与未定政策 | [技能采用及差异](skills.md#项目差异与负责边界) |
| 公开入口、包与依赖 | [源码布局](../workspace.md#使用与维护)及[创建入口](../development.md#创建和整改产品包) |
| 开发环境与工具版本 | [开发准备](../development.md#准备可用的检出)及实际配置 |
| 异步、取消、清理与资源 | [防御指导](../defensive-patterns.md)及[验证责任](quality.md#异步资源的验证责任) |
| 分层、SSOT、表达、排版与维护 | [文档治理](documentation.md) |
| 演进、独立消费、提交与发布边界 | [演进与交付](publication.md) |

## 现行源与未完成范围

本区组织现行项目约定及已授权的共享／场景结构。它引用[研发品味的项目补充](../../.meta_harness/agents/roles/engineering-taste.md)、[源码布局](../workspace.md)、[验证说明](../verification.md)、[防御指导](../defensive-patterns.md)、[整洁回路](../clean-loop.md)和[贡献指南](../../CONTRIBUTING.md)，不替代这些拥有者。

仍有具名缺项：[TypeScript 政策](skills.md#尚待明确的-typescript-政策)、[运行政策](scenarios/dependencies-and-runtime.md#尚待明确的运行政策)与[宿主加载与行为验证](skills.md#宿主加载与行为验证待补)。

## 检查与维护

文档维护者更新拥有者正文，再同步场景、技能入口和角色／任务导航。目标由[唯一登记](../documentation.json)维护。运行 `pnpm run check:docs` 核对链接，运行 `pnpm run docs:inventory` 观察缺项、未知和增减。结果范围见[治理说明](documentation.md#检查与结论边界)；不将结构通过当作内容、技能行为或发布授权。

工作任务的同步、FI/RI、主干准入、稳定点与流程失效时的恢复，从[轨道与 gate](integration.md)进入。主干准入、Git 运输和交付接受分别核对。
