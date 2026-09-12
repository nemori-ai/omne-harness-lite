# Agent 核心模型 · 第一版综合提案

状态：**in-review**。这是供用户 review 的候选提案，不是已经接受的架构决定或形式化证明。

本提案覆盖系统提示词、工具，以及 Session / Turn / Run / Step 的关系。
阅读顺序：

1. [社区证据与术语映射](sources.md)
2. [系统提示词](system-prompt.md)
3. [工具](tools.md)
4. [Session / Turn / Run / Step](execution.md)
5. [验收场景与待裁决点](review.md)
6. [提案内追踪](traceability.md)

本目录从 `spec/proposals/agent-core/v1/` 物理迁移，保留研究对照、设计建议与待裁决项。
三块未经批准的历史 `spec/domain/` 模型文件及其目录、注册项已撤回；包括此前 v1 骨架与 v2 候选。
提案中的模型名称仅表达设计建议，待用户批准后再决定是否正式建模。
模型规格版本与运行时内容 revision 是两回事：发布一份新提示词内容不必升级其 Schema。

第一版应先决定语义和边界，再写 TLA+/Alloy 的精确状态模型；本次不宣称已有模型检查结果。
