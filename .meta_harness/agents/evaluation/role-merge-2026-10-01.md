# 角色合一与架构起草角色退役（2026-10-01）

本记录保存一次角色集调整的依据、对应关系与验证范围。角色的现行定义以
[角色源包](../roles/README.md)为准；这里不是第二份定义。

## 改了什么，为什么

负责人 2026-10-01 裁定两件事：

1. **代码集体所有**：四个按模块划分的开发角色合成一个，写入范围由任务简报给，不由角色名给。
2. **架构归人**：领域读数、机制读数与能力拆分提案由主线或负责人亲自写，agent 只评审与反驳。

2026-09-14 至 2026-10-01 的 Claude Code 派发记录里，这几个角色的实际使用次数是：
capability-developer 19、infrastructure-developer 10、application-developer 6、kernel-developer 0、
architecture-drafter 14；同期通用 agent 被派 231 次。四个开发角色的正文有约四分之三是共同契约，
各自独有的只有「这类工作里哪些东西不由你补」那一段。

| 退役 | 去向 |
|---|---|
| kernel-developer、capability-developer、infrastructure-developer、application-developer | [developer](../roles/developer/role.md)：四段边界并成一张「按任务的性质取用边界」表；模型与档位改为按本次任务选 |
| architecture-drafter | 不设替代角色。三段纪律（领域读数先封存、机制读数从领域对象条目起步、提案至少三个实质候选）仍在手册里，由亲写的人遵守；[architecture-reviewer](../roles/architecture-reviewer/role.md) 新增「读数」这一待审对象 |

verification-developer 与三个 TUI 角色不动：它们的行动边界（只写测试设施、只写证据目录、不改产品源码）
是真实的权限差异，不是模块划分。

## 模型怎么选，依据是什么

合一之前，模型钉在各角色文件里；合一之后由派发者按任务选。选法只是把原来的钉值换了个放的位置，
**没有新的对照实验**：

| 任务 | Claude Code | Codex | 档位 | 依据 |
|---|---|---|---|---|
| 能力与组合的行为、具体提供者 | Opus 5.5 | GPT-6 Sol | high | 原 capability-developer、infrastructure-developer 的钉值（[2026-09-23 换代记录](role-model-reeval/README.md)） |
| 单个模块、规格完整的应用切片 | Sonnet 5.5 | GPT-6 Sol | high | 原 application-developer 的钉值；[Sonnet 5.5 对照](role-model-sonnet55/README.md)里它在这类切片上与 Opus 5.5 相当，跨多个包或契约留白时两者的解法不同 |
| 内核原语与生命周期机制 | Fable 5.1 | GPT-6 Astra | xhigh | 原 kernel-developer 的钉值 |
| 安全敏感、跨多个包或整个装配、契约把失败／诊断／顺序留给判断 | Fable 5.1 | GPT-6 Astra | high 起 | 原 application-developer 的 description 里「改派顶档」的条件；同一份对照 |

Claude Code 的角色文件钉 Opus 5.5 作默认，派发时用 Agent 工具的 `model` 参数覆盖。
Codex 的规则是角色文件钉的模型优先于派发值（[Codex 适配说明](../skills/design-subagents/canonical/references/codex.md)），
所以 developer 的 `codex.toml` 不钉模型，派发必须显式给；不给就继承父会话的模型。

## 验证了什么，没验证什么

| 项 | 状态 |
|---|---|
| 生成器接受新源包，两端输出的 description 一致、共享正文逐字相同 | 已核（`make agents-check`） |
| 派发参数入口对 developer 两端都能出参数；Codex 一端 `model` 为空 | 已核（`render_pair.py --dispatch`） |
| Claude Code 新进程里 developer 能被派发，并能引出合并后的边界表 | 已核：`claude -p` 新进程派发，子代理不读文件即逐字引出四类任务与「不由你补」的原话 |
| Claude Code 派发时用 `model` 参数换档确实生效 | 已核：派发时给 `sonnet`，该次运行的 `modelUsage` 里出现 `claude-sonnet-5-5`（角色文件钉的是 Opus 5.5） |
| Codex 新进程里 developer 能被派发、显式给的模型确实生效 | 已核一次：`codex exec`（codex-cli 0.159.0）派发并显式给 `gpt-6-sol`、high；子会话的 rollout 日志里 `agent_role` 为 `developer`、模型 `gpt-6-sol`、档位 `high`，且含新正文独有的句子；父会话报告 kernel-developer、architecture-drafter 不在可用类型里 |
| Codex 派发时**不给**模型会用哪个 | **未验证**；按官方规则应继承父会话的模型 |
| 合并后的正文在实现任务上的效果不比原四个角色差 | **未验证**：没有重跑留出任务。正文从四份各约 25 行变成一份约 35 行，共同契约不变 |

出现下面任一情形时回头看这次合并：developer 在某一类任务上反复越过那一类的「不由你补」；
派发者经常忘了给 Codex 一端的模型；或者留出任务重跑显示合并后的正文有退化。

历史评估记录（[换代](role-model-reeval/README.md)、[Sonnet 对照](role-model-sonnet55/README.md)、
[迁移](role-migration.md)）里的旧角色名保持原样：那是当时实际跑的角色。
