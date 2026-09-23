# 工具执行运行时基线：fork DSH jobs、拓展 local-execution、自研，还是混合

**选择对象**：承载「一次[工具执行](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)」的运行时，
**实现从哪里起步**——fork DeepSeek Harness 的 jobs 三层再改造、拓展 minimal-runtime 分支的 `tools/local-execution`、
在 Cordis 4.0.4 与 `core/storage` 之上自研，还是把两源的零件拼起来再补一个执行器。
这是一个**实现起点**的选择，不是契约：工具执行运行时的契约、提供者设计与装配都还没有起草，
本包的结论只决定后续那份契约与提供者设计**以什么为参照、复用哪些代码**。

**作者推荐 C（自研，借 DSH jobs 的契约词汇与 tool-jobs 的模型面、借 local-execution 的恢复纪律，只借设计不继承代码）**，
理由与翻盘条件见[候选与取舍](alternatives.md#推荐与仍待区分的事项)。**推荐不是接受。**

- **当前状态：候选。**没有评审、没有决定；[`record/decisions/`](../../decisions/README.md) 无对应决定文件。
- **本次终点与范围**：四个实质候选逐条对到十条必要性质，给出总负担、关键反例与证据缺口，推荐一条并列出仍待区分的实验。
  **不写**契约、提供者设计、装配或包布局；**不改**产品正文、研究、词条与 [proposals 索引](../README.md)。
- **输入基线**（均取自 HUB `.worktrees/assets-runtimes`，2026-09-23）：
  - 产品正文：[PF-006](../../../product/PF-006-tools-and-skills/design.md) rev 16、
    [PF-012](../../../product/PF-012-agent-loop-and-run/design.md) rev 9、
    [PF-008](../../../product/PF-008-human-in-the-loop/design.md) rev 5、
    [PF-007](../../../product/PF-007-meta-capabilities/design.md) rev 16，
    旁及 [PF-009](../../../product/PF-009-context-message-types/design.md) rev 5、[PF-014](../../../product/PF-014-inbound-intake-and-queueing/design.md) rev 4、
    [PF-015](../../../product/PF-015-session-lifecycle-and-ownership/design.md) rev 11；
    **PF-006 rev 16 含 2026-09-23 的纠正**：工具执行有自己独立的 runtime、绑会话、从不由 agent runtime 承载，前台/后台只说 agent runtime 是否阻塞在它上面。
  - 统一语言：[`terms/execution-and-outcome.md`](../../../ubiquitous_language/terms/execution-and-outcome.md) 的工具执行、执行收场、后台执行、工具等待态、发帧、结果卸载六条；
    [领域对象条目 UL-tool-execution](../../../domain_objects/objects.md#ul-tool-execution--工具执行)。
  - 研究：[tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/README.md)（17 条断言、16 行对照表，DSH `c291e796`、minimal-runtime `d79484d`，**对照的是 PF-006 rev 14**——rev 16 的纠正对它的影响见 [design.md](design.md#研究基线与-rev-16-的差)）；
    旁及 [tool-definition-shape-sources](../../../../research/tool-definition-shape-sources/README.md)、[message-model-and-stream-sources](../../../../research/message-model-and-stream-sources/README.md)。
  - 硬约束：[D-026](../../decisions/infrastructure-persistence-choices/README.md)（无 in-memory、Kysely + `node:sqlite`/pg、队列 redis、本地日志 JSONL）、
    [D-025](../../decisions/cordis-adoption-version/README.md)（Cordis 4.0.4 官方包）、
    [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)（选定复用的 DSH 组件以 fork 自维护）、
    [SYS-TENANT](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)、[SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
    [D-022](../../decisions/cli-tui-delivery-form/README.md)（会话、Run、工具执行在用户本机）。
  - 可复用基座：realization 的 [`core/storage`](../../../realization/packages/core/storage/README.md)、[`core/kernel-basis`](../../../realization/packages/core/kernel-basis/README.md)、
    [`infra/storage-sql`](../../../realization/packages/infra/storage-sql/README.md)、[`infra/clock`](../../../realization/packages/infra/clock/README.md) 四个候选节点。
  - **未读 `design_legacy/`**：旧设计链对 DSH jobs 的取舍已退役，不作依据。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：工具执行运行时的**实现起点**——四条路径回答的是同一个问题「从哪份代码或哪份设计开始，才能以最小总负担兑现十条必要性质」 |
| 现有能力覆盖 | 见 [design.md](design.md#现有能力如何承载)：本仓库没有任何工具执行的契约、提供者或代码；存储、时钟、内核小件四个候选节点可复用；两份外部源各覆盖一部分 |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：十条性质里有六条**两源都没有**，其余四条各有一源部分承载 |
| 三个实质候选 | **齐，四个**：A fork DSH jobs、B 拓展 local-execution、C 自研、D 混合。A、B、D 各被至少一条必要性质的**结构性反例**排除，反例引自研究断言，不是陪衬，见 [alternatives.md](alternatives.md) |
| 接受权限 | **本包不产生接受。**作者推荐、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、十条必要性质从哪来、现有能力承载到哪、剩下什么 | [设计正文](design.md) |
| 四条路径各怎么兑现十条性质、代价与反例、为什么推荐 C、什么会翻盘、还差哪些实验 | [候选与取舍](alternatives.md) |
| 评审了什么、怎么处置 | [评审记录](review.md)（尚无） |

## 后续消费

- **下游**：工具执行运行时的候选契约（`spec/`，**尚未起草**）与它的提供者节点（`realization/`，**尚未建**）。
  本包被接受之后，那两处以本包的推荐路径为起点；未接受之前，下游起草可以引用本包的性质矩阵与反例，但不得把推荐当作已定的实现路径。
- **受影响的已有候选**：[`apps/cli` 架构](../../../realization/apps/cli/architecture.md#拓扑与进程模型)里「前台每个运行一组进程」的分组与「转后台不换宿主」之间有一处需要实验区分的张力（[alternatives.md X-4](alternatives.md#仍待区分的实验)），本包只登记，不改那份文件。
- **需要他方裁定的**：见 [design.md 交接缺口](design.md#交接缺口)——D-026 对活体句柄的读法、执行账的存放形态、起草时读到的一处 PF-012 与 PF-006 的措辞张力。
