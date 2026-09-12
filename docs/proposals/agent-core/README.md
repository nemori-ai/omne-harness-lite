# Agent 核心能力提案

状态：**in-review**。当前审阅入口为 [v1 综合提案](v1/README.md)，涉及系统提示词、工具与执行层。
用户已确认的需求与具体候选表示分别记录；本索引不批准新的模型、服务边界或聚合。

每次新一轮候选修订新建版本目录，保留已有审阅记录。接受范围由关联决定明确，不能因目录迁移而扩大。

## 当前需求对应与缺口

需求依据为 [SYS-KERNEL](../../requirements/system/constraints.md#sys-kernel)、
[SYS-DYNAMIC](../../requirements/system/fully-dynamic-system.md)、[SYS-LONG-RUNNING](../../requirements/system/long-running-and-evolving.md)
及 [PF-001](../../requirements/product/user/PF-001-tenant-organization-context.md)、
[PF-002.C1](../../requirements/product/environment/PF-002-external-change-response.md#已确认要求)。
现有提示词、工具和执行语义是局部候选，不代表已覆盖长期运行、进化、跨组织协作
或外部变化引发响应的完整链路。具体唤醒、感知、响应和授权组合仍需设计。

2026-09-12 按 D-004 补充本入口的当前关系，使用本轮需求工作区快照；
这不是对旧版本的历史追溯声明，也不改变 in-review 状态。接受具体设计前再固定
所采用的确认条款与 Git 基线。
