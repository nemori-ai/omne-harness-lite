# 内容块的无损数值校验与生产者铸号

R2 曾由[合并前本支 D-068](../../decisions/content-blocks-seams-adoption/README.md)限定接受。当前 [D-070](../../decisions/core11-integration-coordination/decision.md)已整体采用上游 core，承接 I-B、退役 N-A；原实现及运行仅按历史输入读。本包处理已接受映射在开包前暴露的两处具体缺口；不改变已冻结的 `data.content-blocks/v2`，不宣称模型工作闭环可实施。

- 基线：2026-09-27，HUB `c265bd03`；[D-060 M36/M44/M49](../../decisions/mainline-self-rulings-2026-09/decision.md)、[D-062](../../decisions/assets-runtimes-node-acceptance/decision.md)。
- 对象：[content-blocks](../../../realization/packages/core/content-blocks/design.md) 与 [pi-ai-transport](../../../realization/packages/model/pi-ai-transport/design.md) 的映射；前者已有上游当前实现；后者仍受非法 target、登记／恢复及 D-019 比较门约束。
- 准入：数值校验有三个实际实现路径，铸号协调另有三个路径；均在[候选比较](alternatives.md)说明可行条件、代价与反例。
- 作者推荐：CB 专用、只供校验的数值视图；保留生产者分工并明确 pi 的确定性铸号例外。这是原 R2 推荐；当前范围以 D-070 为准。

[设计及反向核对](design.md) · [候选与取舍](alternatives.md) · [评审与处置](review.md)。节点与 PF-009 局部投影已接续；完整 pi 入口仍不可实施。

R1 原稿保留为 [源快照](r1-source.tar.gz) 与 [哈希](r1-source.sha256.json)；R2 按两份独立评审补充，两份复核已记录，原件不改。

[PR11 三候选整合](core11-integration.md)及 D-070 接续旧技术采用，不重标旧195项和独立QA。
