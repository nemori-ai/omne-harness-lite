# 消息数据模型与流协议：DSH、pi-ai 与 minimal-runtime 能承载 PF-009 的哪些条款

本项目要定一版「消息的完整数据模型 + 流的契约、协议与流程机制」，目标之一是让**模型请求运行时**与
**工具运行时**都能脱离 agent loop 独立端到端测试。两个候选起点是 DeepSeek Harness 的 `dsh-llm`
（及其 session 格式）与 pi 的 `pi-ai`（及 `pi-agent-core`）；本仓库未合入的 `feat/minimal-runtime`
是 DSH 的一份定向 fork，作为「已经走过一步的现状」对照。

这项调查要区分的是：**对照 [PF-009（rev 4）](../../design/product/PF-009-context-message-types/design.md)
的每一条，哪一源的现有结构原样可承载、哪一源要增改、哪一源的既有机制与条款相冲突、哪一源根本没有**；
以及「分次到达 → 落盘消息 → 两份组装」这条链上，三源各自有哪些可以单独拿出来测的零件。
**它不回答该选哪一源、该怎么设计**——那归本程 proposal。

- 调查对象与基线：
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-root@0.1.5-rc.2`，Session 格式 v3）；
  pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（`@earendil-works/pi-ai@0.86.1`）；
  minimal-runtime `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（未进 main，**不作上游证据**）。
  产品正文以 HUB `panqiwei/assets-runtimes` 上 PF-009 rev 4、PF-006 rev 14、PF-010 rev 5、PF-012 rev 7、PF-013 rev 4、PF-000 rev 1 为准。
- 消费者：本程 proposal「消息与流基线」（待出现）。
- 最近核对：2026-09-23（首轮）。

## 准入核对

三源都是**只读源码阅读**，没有运行任何测试或探针；凡是「运行起来会怎样」的说法都标为代码阅读推断。
取证条件、来源立场与各自局限在 [证据记录](evidence.md)，逐源观察在 [notes/](notes/)。
随结论一起传下去的三条限制：

- **DSH 与 pi 的决策注记、README 是作者自述**，只证明作者宣称了什么；短板一律取自源码本身、
  上游自己的 rejected/archived 注记，或两源之间的交叉对照。**未检索两源的 issue tracker。**
- **minimal-runtime 不是上游事实**：它是本仓库未合入分支的现状读数，只用来说明「DSH fork 一步之后丢了什么、加了什么」。
- **pi 的观察对应 0.86.1**；DSH 的 `dsh-llm-pi-ai` 依赖声明为 `^0.85.1`，minimal-runtime 钉的也是 0.85.1 加补丁——
  **两者之间的差异本轮没有核对**。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、取证条件与局限是否可复核 | [证据记录](evidence.md) |
| 按来源分别看到了什么 | [来源笔记](notes/)：[dsh-llm](notes/dsh-llm.md) · [dsh-session-format](notes/dsh-session-format.md) · [pi-ai](notes/pi-ai.md) · [minimal-runtime](notes/minimal-runtime.md) |
| PF 条款 × 三源的逐行对照表全文 | [历次报告](reports/2026-09-23-message-and-stream-mapping.md) |

只读研究正文就知道当前该信什么；要核对某一格为什么判成「需改」或「不可承载」，去对照表；
要复核具体源码行，去来源笔记。
