# 架构内核与扩展

**这一卷回答：这个系统哪一部分立规矩，其余部分怎么建在它之上。**

```text
   ┌─────────────────── 架构内核 ───────────────────┐
   │  概念在这里定义 · 边界在这里划 · 协议在这里立   │
   └──────────────────────┬─────────────────────────┘
                          │  其余部分消费，不重新定义
                          ▼
              实现 · 扩展 · 更具体的能力
```

**收在这里的是「哪一部分是根基」这个问题的答案**，不是根基里的具体对象——
那些各归其卷：**谁在用**归[主体与归属](subjects-and-ownership.md)，
**agent 由什么构成**归[能力与构成](capabilities-and-composition.md)，
**一段协作怎么走完**归 [Agent 运行时闭环](agent-runtime-loop.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **本卷的词条不归任何一个 topic**——它横跨全部架构内核 topic，
> 没有哪一个拥有它。依据在 [UL-D-2](../decisions.md#ul-d-2--架构内核--2026-09-20)。

## 词条

### UL-architecture-core · 架构内核 · Architecture Core

> **中**：系统里**立规矩**的那一部分——概念在这里定义、边界在这里划、
> 其余部分必须遵守的协议在这里立；其余部分**消费**它们，不重新定义。
> 它由[架构内核 PF 索引](../../product/architecture-core.md)登记的那批产品设计 topic
> 所覆盖的对象、层与领域构成，**那份清单会随设计生长而增补**。
>
> **EN**: The part of the system that **establishes the rules** — where concepts are
> defined, boundaries are drawn, and the protocols everything else must obey are
> set. The rest **consumes** them rather than redefining them. It consists of the
> objects, layers and domains covered by the product-design topics registered in
> the [architecture-core PF index](../../product/architecture-core.md), a set that
> grows as the design grows.

- **形态**：总称
- **出处**：[UL-D-2](../decisions.md#ul-d-2--架构内核--2026-09-20)（产品负责人 2026-09-20 直接裁决）
- **判据**：拿一样东西问——**它是在立规矩，还是在用规矩？**立，在架构内核内；用，在外。
- **别混 ①**：与**上游内核不是一回事**。那指 Cordis 与 DSH `agent` 原语，
  是我们复用的技术底座——[它到底保证什么归 basis](../../basis/README.md)；
  **架构内核是我们自己定义的那部分架构**，站在那之上。
  **承载仓库的常驻指令把那层叫「内核层」**（[承载位置的约定不是本工作区的设计权威](../../../AGENTS.md)，
  这里只当撞名事实引用）。**正因为撞名，这个词不裸用「内核」二字**，正式名始终带「架构」。
- **别混 ②**：它**不是那批 PF 本身**。PF 是**设计材料**，架构内核是那些材料**所描述的那部分系统**——
  给索引页加一个 PF，是**认定**某块内容属于架构内核，不是**造出**一块新的架构内核。
- **弃用**：~~`Harness Core` / 「harness 内核」~~——**不是错**，
  [产品负责人明示两者在本系统里同义](../decisions.md#ul-d-2--架构内核--2026-09-20)；
  **但正文统一写正式名**，理由见那条裁决。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
