# 设计方法与治理

这里维护 Meta Harness 自身可跨产品复用的方法依据和知识治理。它回答“怎样设计、
怎样判断材料可持续消费”，不保存待设计产品的需求、能力、实现状态或一次交付进度。

| 当前问题                             | 入口                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 从需求推导能力、契约和 Cordis 投影   | [Harness 设计手册](../agents/skills/harness-design-handbook/canonical/SKILL.md)                 |
| 判断长期知识归属、接受状态或版本传播 | [治理入口](governance/README.md)                                                                |
| 复核方法选择所依据的事实             | [方法研究](research/)，例如 [harness 设计治理研究](research/harness-design-decisions/README.md) |
| 方法本身需要比较候选或记录接受       | `proposals/` / `decisions/`；沿与产品设计相同的研究、提案、决定边界                             |

`guide/` 是方法专题的长期归档位置；运行时的渐进式入口由 handbook 的 references
承担，不能再复制一套同义正文。topic 模板归相应 design family 的 `.templates/`。
旧方法提案和历轮评审只有在仍解释当前规则时才提炼，原件与取舍保留在来源修订。
