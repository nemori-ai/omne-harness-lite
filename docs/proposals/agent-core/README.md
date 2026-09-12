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

同日用户新增 [SYS-RUNTIME-CONTINUITY.C1–C3](../../requirements/system/runtime-state-and-continuity.md#已确认要求)。
后续执行语义设计须说明运行实例与持久状态如何分工、同构资源如何恢复接续，以及
异构装配对执行条件的影响；当前候选未给出覆盖这些目标的完整承诺。此处仅补充
新需求与缺口，不改变原 v1 审阅记录和候选状态。

随后新增 [PF-003.C1–C6](../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md#已确认要求)。
[v1 工具候选](v1/tools.md)的定义/执行/结果/离场边界及[v1 执行候选](v1/execution.md)
的收束与恢复是已有输入，但尚未说明完整的用户状态读面、按需过程帧、单次调用
中断、手动及自动转后台，以及运行时恢复后的后台调用关联。原稿把详细进度协议
留待后续，不代表该产品要求可以不被满足；后续修订须覆盖这些要求，并区分会话
实例重建与后台执行宿主的生命周期。

[PF-004](../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md)
进一步确认完整继承 sub-agent 要求。v1 中“并发工作通过新 Session / 显式派发”
只提供方向，尚未定义三种关系、live 委托授权、可恢复工作树、人类监督、定时
handoff 与结果新触发等完整语义；后续候选须消费专项继承范围，并处理其来源
差异。此处不把旧方案或 omne-next 的实现结构接受为本项目设计。

[PF-005](../../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md)
新增主动提问、请求授权及对应 HITL 要求。v1 的普通输入接纳与执行前授权检查
尚未覆盖请求及答复的精确关联、长期等待、多个请求独立存在、待办池作答、恢复
接续和批准动作引用；也未定义通用批准与专用权限授予的区别。后续修订须消费
这些已确认要求；普通聊天不能被候选输入处理策略事后猜成某个请求的答复。
