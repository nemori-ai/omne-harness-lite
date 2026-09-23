# 角色模型复评：Opus 5.5 与 GPT-6 Sol（2026-09-23）

本记录保存一次换模型的依据、提示审计与验证结果。模型与档位的权威仍在各角色的
`claude.yaml` / `codex.toml` / `assembly.toml`；支持证据在
[宿主支持记录](../../skills/design-subagents/canonical/references/model-support.json)。

## 采用结果

分工原则：
- **写的角色换新模型**：这些角色产出量大，写完都有下游评审把关；
- **判断「表达有没有写清」的评审跟着换**；
- **判断「选择对不对」的关口和终审留 Fable 5.1**：主线和起草者已经换成 Opus 5.5，让这几道关用另一个模型，作者与评审的盲点不叠在一起。

Codex 侧只做一件事：旧的 Sol 换成新的 Sol，Astra 保持不变。

| 角色 | Claude Code | Codex | 依据 |
|---|---|---|---|
| kernel-developer | Fable 5.1 → `claude-opus-5-5` | `gpt-6-astra` 不变 | Opus 5.5 增幅最大的就是真实仓库里的多步编码；产出有测试和验收把关 |
| architecture-drafter、spec-drafter、realization-drafter、product-design-drafter | Fable 5.1 → `claude-opus-5-5` | `gpt-6-astra` 不变 | 官方说 Opus 5.5 在大多数工作上达到 Fable 5.1 水平，引用更准、表达更清楚；产物都会再派评审。architecture-drafter 做能力拆分提案这一段时，派发者可单次改用 `fable` |
| spec-reviewer | Fable 5.1 → `claude-opus-5-5` | `gpt-6-astra` 不变 | 判表达、靠机械核对表；租户领域那四轮 29→0 本来就跑在 Opus 家族（当时是 Opus 5）上；派发次数最多 |
| architecture-reviewer、product-design-reviewer、plan-reviewer | `claude-fable-5-1` 不变 | `gpt-6-astra` 不变 | 判选择的关口和终审；与已换成 Opus 5.5 的作者跨模型；派发量小 |
| application、capability、infrastructure、verification-developer，tui-debugger，tui-qa | `opus` 别名 → 精确的 `claude-opus-5-5` | `gpt-5.6-sol` → `gpt-6-sol` | Claude：别名从 CLI 2.1.280 起已经静默从 Opus 5 漂到 Opus 5.5，改钉精确 ID，以后换模型才会留下记录。Codex：产品负责人裁定跟随新一代；官方与 AA 的数据是价格减半、错误更少，**但 DeepSWE 与知识工作有回退**，列入观察 |

第一阶段只换模型、不动档位，结果才能归因到模型本身。terra/luna 没有角色使用；GPT-6 也没有 Terra。

**前台主会话**的建议，不入角色配置：
- Claude Code 平时用 Opus 5.5，遇到基座级裁定时向上切到 Fable 5.1。往上切能保留 thinking 块；缓存按模型隔离，所以只在步骤边界切。
- Codex 前台保持 Astra，Sol 当执行者。

## 依据摘要

| 项 | Claude Opus 5.5 | Claude Fable 5.1 | GPT-6 Astra | GPT-6 Sol |
|---|---|---|---|---|
| 标价（输入 / 缓存读取 / 输出，美元每百万 token） | 4 / 0.20 / 20 | 10 / 0.25 / 50 | 10 / 1.00 / 50 | 2 / 0.20 / 10 |
| AA 智能指数（2026-09 版） | 58 | 53 | 53 | 48（GPT-5.6 Sol 为 47） |
| AA 最高档每题输出 token | 约 119k | 约 78k | 约 27k | 约 31k |
| 需要注意的地方 | 思考恒开，默认 `medium`；同档位想得比 Opus 5 多；在长上下文推理等三项上未领先；官方说实际使用中与 Fable 5.1 的差距比分数显示的小 | 官方仍称它是 Claude Code 里最强的模型 | Codex 官方推荐的主代理 | 只比 5.6 Sol 高 1 分；知识工作 Elo 降约 100；幻觉率 92%→60% |

按单题折算：Opus 5.5 约为 Fable 5.1 的四到六成，GPT-6 Sol 约为 Astra 的三成。
这些是公开评测的数字，不代表本项目的任务分布。

## 提示审计（按目标模型的官方提示指南）

| 发现 | 处置 |
|---|---|
| architecture-reviewer 的 Claude 适配段要求「给派发者简短进展」，但子代理只回传最终结果；单独停下汇报就等于提前交卷 | 改为：进展写进与下一次工具调用同一条消息，以纯文字结束回合就是交回 |
| 无人值守的起草者只防住了「接下来我将…」一种收尾；另外几种（做完一段就汇报、问要不要继续）没防；product-design-drafter 与开发者契约完全没有这一条 | 四个起草者的 role.md 和 developer-contract.md 补齐措辞；原有的停止条件不变 |
| spec-drafter 引用了不存在的 `design/spec/AGENTS.md` | 删除 |
| 为 Opus 5 写的「不把高推理强度变成反复自检」「推理档位用在判断上」这类句子 | 保留，按官方建议列入下一阶段的去留对照 |

角色正文里点名的其余路径与 handbook 锚点逐一核对过，都存在。

## 验证

| 层级 | 结果 |
|---|---|
| 生成器准入 | 旧支持记录拒绝 `claude-opus-5-5`；更新后全部角色生成成功 |
| 仓库检查 | `make agents-check`、`make test`、`make docs-check` 全部通过（HUB 工作树内，含改动前的基线） |
| Claude Code 原生加载与实际模型 | 在工作树里用 `claude -p --model haiku` 开新进程派发：spec-drafter 的用量记在 `claude-opus-5-5[1m]` 名下，architecture-reviewer 记在 `claude-fable-5-1` 名下；两者都原文引出了新加的句子，spec-drafter 也确认不再引用 `design/spec/AGENTS.md` |
| Codex 宿主与账户 | 0.154.0 下服务端拒绝 `gpt-6-sol`；升到 0.156.1 后目录可见 `gpt-6-sol` 与 `gpt-6-luna`，`codex exec -m gpt-6-sol` 返回正常 |
| Codex 原生加载与实际模型 | 在工作树里用 `codex exec -m gpt-6-luna` 派出 capability-developer，子会话日志记录的模型是 `gpt-6-sol`，并原文回出了角色指令的第一句 |
| 未验证 | 其余换模型角色的实际派发；各角色在新模型上的任务质量（下一批任务按收敛轮数与 token 用量对照，未跑） |

**回滚条件**：某个角色的评审收敛轮数比基线（租户领域：spec 四轮 29→0）多一轮以上，或者出现一类只有旧模型才抓得到的阻断，就退回该角色。

## 来源（2026-09-23 核对）

- Claude Code [模型配置](https://code.claude.com/docs/en/model-config)、[子代理](https://code.claude.com/docs/en/sub-agents)
- [What's new in Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5)、[Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)、[Effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[Introducing Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5)
- [Codex 模型](https://learn.chatgpt.com/docs/models)、[GPT-6 Sol 模型页](https://developers.openai.com/api/docs/models/gpt-6-sol)、[OpenAI 定价](https://developers.openai.com/api/docs/pricing)
- Artificial Analysis：[Opus 5.5](https://artificialanalysis.ai/articles/claude-opus-5-5)、[Fable 5.1](https://artificialanalysis.ai/articles/claude-fable-5-1)、[GPT-6 Sol](https://artificialanalysis.ai/models/gpt-6-sol)
- 二手报道（Sol 的分项数字）：[the-decoder](https://the-decoder.com/openais-gpt-6-sol-and-luna-cut-prices-in-half-but-barely-move-the-needle-on-performance/)、[officechai](https://officechai.com/ai/gpt-6-sol-shows-modest-gain-over-gpt-5-6-sol-on-artificial-analysis-intelligence-index-but-at-a-much-cheaper-price/)
