# 心智模型

心智模型的全文在技能 **`domain-mental-models`** 里。本页只指路，不写心智模型本身。

- 技能的名字：`domain-mental-models`。在会话里按这个名字加载它。
- 技能的源：[.meta_harness/agents/skills/domain-mental-models/canonical/SKILL.md](../.meta_harness/agents/skills/domain-mental-models/canonical/SKILL.md)。不经宿主加载时，直接读这个文件和它旁边的 `references/`。

心智模型回答一件事：在某个领域里工作，或跨领域碰到这个领域时，应当怎样看它。每一份都答三问：它是什么，它不是什么，拿它怎样量一个设计。

## 三层

| 层 | 在哪 | 给谁 |
| --- | --- | --- |
| 两张最简的图，加最影响行为的十来条要点 | 根 [AGENTS.md](../AGENTS.md#系统的最简模型)「系统的最简模型」「心智模型要点」 | 每个 agent，一进项目就看到 |
| 各领域的心智模型与跨领域协调的模型，全文 | 技能 `domain-mental-models`，源在 [.meta_harness/agents/skills/domain-mental-models](../.meta_harness/agents/skills/domain-mental-models/canonical/SKILL.md) | 在某个领域里做设计或实现、或改动波及别的领域的人和 agent。按需加载 |
| 精确的规则 | 各自的拥有者正文：[项目要求](requirements.md)、[架构](architecture/README.md)、[领域](domains/README.md)、各成员的规格 | 要核对一条规则的原文时 |

上一层是下一层的解释，不是它的替代。两层不一致时，以下一层为准，并报告这处不一致。

## 技能 `domain-mental-models` 里有什么

它的 `SKILL.md` 是索引：按你在做的事，指到该读的那一份。

| 文件 | 内容 |
| --- | --- |
| [cross-domain.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/cross-domain.md) | 跨领域协调：调用是远程调用；Run 是边界；知道与决定；谁认识谁；一类事实只有一个写入者；一个完整的领域提供什么；动态性与 Cordis；能力怎样到 agent 手上；能发现的和装进上下文的；工具是函数 |
| [session.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/session.md) | Session 与会话日志 |
| [agent.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/agent.md) | Agent |
| [runtime-context.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/runtime-context.md) | Runtime Context |
| [access.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/access.md) | 接入层：客户端和服务端 |
| [assets.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/assets.md) | 资产与规则：能力标识、类别登记、分层持有与求值、内容的存放与读口 |
| [skill.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/skill.md) | Skill：一个目录，三层披露 |
| [mcp.md](../.meta_harness/agents/skills/domain-mental-models/canonical/references/mcp.md) | MCP：接入点、连接、动作清单，动作经工具入口到 agent 手上 |

还没有写的领域列在 `domain-mental-models` 的 `SKILL.md` 里。

## 维护

本页的拥有者是 docs 维护者。心智模型各份的维护规则在 `domain-mental-models` 的 `SKILL.md`「维护」一节。

根 `AGENTS.md` 的两张图是全系统最简的模型，下面两条由本页拥有：

- 改任何一张架构图时，核对它化简之后仍然是那两张图。化简的意思是：去掉细节、合并同一组责任的框之后，框之间的关系和方向不变。
- 对不上时，先定哪一边对。拥有者正文变了，就改那两张图和技能里对应的那一份；拥有者正文没变，就改这张架构图。
