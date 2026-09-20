# 方法的事实依据

这里拥有**关于「怎么做这件事」的调查**：别人的流程怎么设计、形式化能证明到哪、
评测怎么进入决策。它服务的对象是 [skills](../README.md#skills)、[roles](../roles/README.md)
与各 family 的准入规矩，**不是待设计系统的产品能力**。

## 为什么在 `agents/` 而不在 `research/`

两边都叫研究，但**失效事件不同**——而失效事件决定家在哪：

| | [`research/`](../../research/README.md) | 这里 |
|---|---|---|
| 调查对象 | 上游与外部世界的事实 | 我们自己的工作方法 |
| 什么让它失效 | **上游变了**：Cordis 发了新版本、某个 API 改了语义 | **我们的方法变了**：某条准入规矩被推翻、某个 skill 重写 |
| 结论进到哪 | 产品与能力设计 | 规矩本身与写规矩的 skill |

2026-09-20 从承载仓库根 `docs/research/` 搬进来。它们当初和产品调研混在一个目录里，
**是那个目录按格式而非按消费者组织的结果**。

## 这里有什么

| 主题 | 回答的问题 | 今天谁在消费 |
|---|---|---|
| [proposal-processes](proposal-processes/README.md) | PEP、RFC、KEP、EIP、TC39、ADR 等 **15 个上游流程**怎样要求「有哪些候选、为什么选它、为什么不选别的」，以及**写进模板之后实际兑现了多少**（含三次填充率统计） | [record/proposals 的准入与候选比较](../../design/record/proposals/README.md)；「至少三个实质候选」这条规矩的来源 |
| [framework-governance](framework-governance/README.md) | DSH、Pi、OpenCode、Oh-my 系列、LangChain 怎样让**知识流转**与**防御规则**演化：决定与事故归谁、规则入口在哪、靠什么决定增减 | [record 家族的准入](../../design/record/README.md)与[防御指导](../../../docs/defensive-patterns.md)的演化依据 |
| [agent-system-evaluation](agent-system-evaluation/README.md) | 这些项目**怎样评测自己**，评测结果又怎样进入开发、选型和演进决策；含 DSH 的实际调用与复现记录 | [evaluation](../evaluation/README.md) 的协议与范围 |
| [cordis-proof-boundaries.md](cordis-proof-boundaries.md) | Cordis 论文的形式结果**到底证明了什么**，哪些义务留给了组件 | handbook 的[规格表达](../skills/harness-design-handbook/canonical/references/architecture/assurance/specification.md)与[组合性质](../skills/harness-design-handbook/canonical/references/architecture/assurance/composability.md) |
| [design-spec-maintenance](design-spec-maintenance/README.md) | 架构、规格与提供者设计之间**怎样交接**——含一份来源交接文档的原件保留 | handbook 的[规格演进](../skills/harness-design-handbook/canonical/references/spec-evolution.md)与[交付](../skills/harness-design-handbook/canonical/references/handoff.md) |
| [project-baseline](project-baseline/README.md) | 用户当初明确过哪些方向，以及**迁移前的 architecture-guide 与 defensive-patterns 长什么样**（两份 `.txt` 正文快照） | 溯源：handbook 的 `references/architecture/` 是从那份快照改写来的 |

## 原件未改，所以链接不成立

六份都**保持搬来时的原样**，正文里指向 `docs/maintenance/`、`docs/decisions/`、
`docs/proposals/` 的相对链接，**是按它们原来在 `docs/research/` 下的位置写的，在这里不成立**。
其中 `proposal-processes/README.md` 开头的 `../README.md`「研究索引」现在会落到本页——
**路径碰巧还在，指的却不是同一个东西**。

留档保原件，不为了让链接好看而改写历史正文。要还原当时的引用目标，从 Git 历史取：

```sh
git log --oneline -- docs/research/proposal-processes
```

## 它们不是什么

- **不是规矩本身。**规矩归 skills 与各 family 的 README；这里只提供当初据以立规的观察。
  规矩改了，这些观察不跟着改——它们记的是那一天、那个版本下看到了什么。
- **不是接受依据。**每份开头都写明了「研究证据，不是已接受的设计或执行指令」。
  [有效决定在没有新观测时仍具最终权威](../../design/record/README.md)。
- **不保证仍然准确。**核对日期是 2026-09-12 与 2026-09-14，来源都固定到了具体版本或 commit。
  上游此后的变化不在其中。
