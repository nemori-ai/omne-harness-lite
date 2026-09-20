# PF-006 设计交流笔记

设计这块产品时，人与 AI 交流过程中有价值的信息留在这里。

**这里是原始材料，不是结论。**任何一条要成为产品事实，必须经由
[decisions.md](../decisions.md) 记录，并落进 [design.md](../design.md)。
笔记本身**不得被引为依据**。

## 现有笔记

| 日期 | 笔记 | 谈了什么 |
|---|---|---|
| 2026-09-17 | [工具与技能](2026-09-17-tools-and-skills.md) | 开题：meta 标签与上下文预算 → 依赖声明与同名替换件 → 工具执行绑 session → 三个问题的答复 → 取用机制 skill 与 tool 不一样 → 划出 PF-007 → 用词改「常驻」对齐 omne-next |
| 2026-09-18 | [工具定义与返回值](2026-09-18-tool-definition-and-result.md) | 两种 schema 范式 → 四项可选声明 → **等待态是原语不是声明**（纠正 PM）→ 两种返回形态与 `ToolResult` → 执行的账 → 「集中来写」的排版要求 → **不声明就是不能后台** |

> **rev 4 的 offloading 那次交流记在别处。**它发生在 agent-loop 的语境下，
> 原话见 [PF-012 的交流笔记](../../PF-012-agent-loop-and-run/interviews/2026-09-18-agent-loop.md)。
