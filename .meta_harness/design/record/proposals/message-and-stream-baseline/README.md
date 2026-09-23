# 消息数据模型与流协议基线：以谁为起点

**选择对象**：消息与内容块的**数据契约**（落盘形态）、**到达语法**（流协议：到达增量长什么样、按什么次序来）、
**流装配器**（到达增量 → 一条完整消息）这三层，各自以 DSH `llm/llm` 的类型与 `StreamChunk`、pi-ai 的类型与事件、
还是按产品正文自研为起点。这三层被**模型请求运行时**与**工具运行时**同时消费，
产品负责人要求它**先于那两块的契约定型**，并让两者**各自能单独端到端测试**——所以它是共用契约，按基座级选择比较。

**作者推荐 D（混合）**：数据契约按 PF-009／PF-013 自研 JSON Schema；到达语法以 DSH `StreamChunk` 的骨架为起点，
把它的可选不变量伴件升格为语法本身的条款，并补填法声明、整体替换与语音；装配器自写；pi-ai 只在传输适配处被翻译进来。
**三层可以分开选**，D 就是逐层选的结果。理由与会翻盘的证据见[候选与取舍](alternatives.md)。

- **当前状态：候选，尚未评审，尚未接受。**作者推荐不产生接受；本包也不产生任何契约、登记或节点。
- **本次终点与范围**：四个实质候选的完整比较、逐层可分性判断、推荐与最小区分调查。
  **不起草契约**，不改产品正文、研究与 registry。
- **输入基线**：
  - 产品正文：[PF-009](../../../product/PF-009-context-message-types/README.md) rev 5（rev 4 已接受；**rev 5 全文待产品负责人确认**）、
    [PF-013](../../../product/PF-013-model-profiles-and-invocation/README.md) rev 6（rev 4 已接受；**rev 5、rev 6 待确认**）、
    [PF-010](../../../product/PF-010-context-management-and-assembly/README.md) rev 5（已接受）、
    [PF-012](../../../product/PF-012-agent-loop-and-run/README.md) rev 9、[PF-006](../../../product/PF-006-tools-and-skills/README.md) rev 16（均已定稿）、
    [PF-000](../../../product/PF-000-occurrences-and-record-entries/README.md) rev 1。
  - 统一语言：[UL-message](../../../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message)、
    [UL-content-block](../../../ubiquitous_language/terms/record-and-context.md#ul-content-block--内容块--content-block)、
    [UL-block-annotation](../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)、
    [UL-incremental-arrival](../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)、
    [UL-execution-frame](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)、
    [UL-derived-rendering](../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)、
    [UL-transcript](../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript)。
  - 决定：[D-019](../../decisions/model-provider-pi-ai-fork/decision.md)（pi-ai 定向 fork 作传输；**明文把「DSH 的 context/stream/replay 转换是否复用」留给另一次选择**——就是本包）、
    [D-026](../../decisions/infrastructure-persistence-choices/decision.md)（无 in-memory 实现、会话日志一类落 JSONL）。
  - 研究：[message-model-and-stream-sources](../../../../research/message-model-and-stream-sources/README.md)（首轮，2026-09-23，**对照的是 PF-009 rev 4**，rev 5 的差异见 [design.md](design.md#输入基线的一处漂移)）；
    相关：[model-request-transport-sources](../../../../research/model-request-transport-sources/README.md)、
    [tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/README.md)。
  - 约束：[SYS-SPEC](../../../foundation/cross-system-constraints/requirements.md#sys-spec)、
    [SYS-DEPLOY](../../../foundation/cross-system-constraints/requirements.md#sys-deploy)、
    [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)、
    [SYS-LLM](../../../foundation/cross-system-constraints/requirements.md#sys-llm)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：三层各以谁为起点；每层的必要性质列在 [design.md](design.md#必须兑现的性质) |
| 现有能力覆盖 | 设计链里**没有**任何消息或流的契约、节点或登记；「现有」只有三源的结构与研究的逐条款五档判定，承载表见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 三源都没有的部分（三种自有消息、块级标注、派生表示与 transcript、语音、整体替换、帧轨）无论选谁都要自己写；各候选的差别只在其余部分，见 [design.md](design.md#剩余责任与能力演化) |
| 三个实质候选 | **齐，四个**：A 从 DSH 扩展、B 从 pi-ai 扩展、C 全自研、D 逐层混合。B 在数据层有多条源码级反例，**保留为真实路径并写明排除依据**，不是陪衬 |
| 接受权限 | **本包不产生接受。**推荐、评审、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、必须兑现哪些性质、三源各承载到哪、剩什么 | [设计正文](design.md) |
| 四个候选差在哪、为什么推荐 D、三层能不能分开选、什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 评审了哪个修订 | [评审记录](review.md)（尚未记录实际评审） |

## 后续消费

- **待消费者**：消息与块的 `data.*` 契约、到达语法契约及其一致性用例集（**都尚未起草**）；
  模型请求运行时与工具运行时两块的契约与节点（本程块 B、C）以本包的选择为前提。
- **未接受前**：下游不得把 D 当作已定；依赖三层选择的契约只能起草为候选并回链本包。
- **会被本包选择改变的已有结论**：无。D-019 的传输采用方向不重开；本包只决定 pi-ai 的类型与事件**止步于传输适配**。
