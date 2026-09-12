# 2026-09-12 文档与规格组织迁移记录

[维护入口](../README.md) · [文档入口](../../README.md) · [逐文件清单](2026-09-12-inventory.json)

本记录说明已经交付的组织变更、来源去向与验证边界。组织和治理的接受依据是
[文档体系提案的用户授权记录](../../proposals/documentation-system/README.md#接受记录)
及 D-001～D-003；本记录不批准任何候选业务契约。

## 迁移范围与去向

原工作区存在未提交设计资料。迁移前保留完整源文件快照，提交 `59ef5f2` 保存
当时全部受管理输入；逐文件清单记录原路径、SHA-256、目标及是否逐字节保留。
84 份输入均有去向，其中 63 份在当前目录中仍有完全相同的副本。
其余更新或合并项可从源快照提交完整回查，没有以迁移为名静默删除独有材料。

| 原位置 | 当前归属 |
|---|---|
| `docs/architecture.md` | [当前架构](../../architecture/README.md)、[约束](../../architecture/constraints.md)；动态提示状态键讨论由 [agent-core 附件](../../proposals/agent-core/v1/system-prompt-profile.schema-notes.md)承接；原件为研究文本附件 |
| `docs/dsh-cordis-fully-dynamic.zh.md` | [DSH 动态能力研究](../../research/dsh-cordis-dynamic/README.md)，保留原文与版本局限 |
| `docs/defensive-patterns.md` | [当前指导](../../defensive-patterns.md)、[适用记录](../../defensive-patterns/catalog.md)、演化规范与评估协议；原件另存 |
| `spec/domain/**` | [DDD 历史原件](../../../spec/archive/ddd-models/README.md)，21 份文件字节与 SHA-256 保持一致 |
| 九项旧模型 | [租户候选](../../proposals/tenant-contracts/README.md)与[模型候选](../../proposals/model-contracts/README.md)，逐项保留数据、操作、事件、不变量和缺口；继续 review |
| `spec/proposals/agent-core/v1/**` | [Agent 核心提案](../../proposals/agent-core/v1/README.md)，候选身份不变 |
| `spec/traceability/` | 提案的[就近追踪记录](../../proposals/agent-core/v1/traceability.md)及[验证规范](../verification.md) |
| 按工具划分的空规格入口 | 工件跟随能力、数据、组合契约；工具使用方式由[验证规范](../verification.md)承接 |
| `check_agent_core_proposal.py` | 文档、规格与离线 Schema 检查，另含能检出实际故障的测试 |
| 架构指南与双端 skills | 保留专题结构，更新身份导航、接受依据与按需读取路线 |

旧 `domain/` 只在历史归档内保留；新有效契约通过 `spec/catalog.json` 精确登记。
当前清单为空、没有正式 TLA+/Alloy 模型；这与业务设计仍待 review 的事实一致。

## 主 agent 验收

主 agent 审阅并集成各分支，修复发现的问题后在集成状态重新检查：

- 本地导航、中文/同页/重复标题锚点、决定来源及循环取代、双端 skill 内容一致性通过。
- 正式清单、候选与工具 Schema 的离线解析通过；测试覆盖正式 Schema、未登记版本、候选误用与冻结登记缺失。
- `make docs-check BASELINE=0ce5ad5`、`make spec-check`、`make test` 通过，26 个测试成功。
- 架构导航与研发品味两个 skill 的 Codex/Claude 副本均通过 skill 格式检查。
- `make spec-tools` 正确返回非零：本机缺 Java、TLC JAR 和 Alloy JAR。没有声称执行过真实形式模型。
- 模型评估只验证离线报告格式与证据完整性；测试夹具是合成数据，没有实际模型评估或主力模型切换。

首轮审阅纠正了扫描旧路径导致漏检、Markdown 标题解析错误和“完整负面证据被当成缺数据”等问题。
保留这些观察是解释本次验证改动的依据，不将其泛化为所有模型的永久性弱点。

## 导航与权限场景走查

以下是主 agent 的文档路线审查，不冒称真实开发模型实验：

| 场景 | 沿用的权威与阅读终点 | 验收观察 |
|---|---|---|
| 修正文档内局部链接 | 当前文件与 `docs-check` | 无需为局部修正新建研究/提案/决定 |
| 改变提供者撤除边界 | architecture-design → 生命周期/演化指南 → 所属精确契约及决定 | 指南提供判断维度；具体未定政策仍作为提案 |
| 实现与文档冲突 | 定位有效契约、版本和接受记录 | 不因代码现状或资料更长而越过已接受语义 |
| 跨服务复制租户身份定义 | 当前租户约束 → 共享规格或候选状态 | 复用语义；尚未接受的完整字段不可伪装成当前标准 |
| 没有新观测时重开旧决定 | D-002 → 知识流转 | 沿用决定，不制造新提案取代它 |
| 新观测足以挑战前提 | 决定 → 来源研究/提案 → 复现与验证 | 新证据不自动改变政策；取代记录必须保留因果解释 |
| 评估移除一项提醒 | 防御 ID → 协议 → 分组结果与采用依据 | 移除提示与撤销系统保证分开；一个失败分组不抹掉其他组证据 |

根 `AGENTS.md` 继续承担项目心智、少量红线、研发品味和导航；字段、版本、流程、
命令及实验材料留在所属文档与工具。子级 `.agents/AGENTS.md`、`.claude/AGENTS.md`
继续负责双端 skill 维护，无新增层层重复的 AGENTS 提示链。

## 使用边界

此交付建立了可继续工作的组织与维护机制，没有宣称产品架构、业务模型或严格证明已经完成。
历史原件并不是新实现的兼容目标；研究固定来源也不能代表上游未来版本。
形式工具环境与真实模型实验应在实际任务需要时准备并记录真实结果。
