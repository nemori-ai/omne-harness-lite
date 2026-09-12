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

[PF-006](../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、
[PF-007](../../requirements/product/user/PF-007-system-initiated-hitl.md) 与
[PF-008](../../requirements/product/user/PF-008-unified-decision-pool.md) 补充用户设置、
定义级授权、系统发起的 HITL 及统一决策池。执行前授权检查尚不足以表达覆盖
出厂默认值、当前有效授权、耐久阻塞确认、合格动作暂行定夺及跨会话直接答复。
候选修订须消费这些要求，并保持配置、动作授权、决定后果与集中呈现各自语义；
此处不接受原系统的编译器、权限表、池存储或运行时分工。

[PF-009](../../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md)
要求保序多模态输入、附件耐久引用、真实模型消费，以及命令发现、Skill 手动
slash 入口和键盘控制。现有普通输入候选未完整覆盖这些行为，不能把接收文件
视为模型已读取，或把命令控制等同于聊天文本。
[PF-010](../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)
补充资产分类、组织共享和个人范围；后续能力组合与调用设计须分别消费来源、
所有权、权益、版本选择及当前动作权限，不能从 official/customized 标签直接
推导准入，也不能以用户默认覆盖为由自动借用其它租户资产。

[PF-011](../../requirements/product/agent/PF-011-future-planning-calendars-and-reminders.md)
要求 Agent 依据任务、演进需要及外部信号规划未来，结合多地日历形成周期性或
非线性安排，并支持执行、通知及组合效用。现有执行与恢复候选尚未覆盖复杂
时间表达、日历供给/查询、日程管理、单次接续、机械提醒及真实推送；定时 sub-agent
仍按 PF-004 的专项要求建模。源提醒/执行互斥和旧固定时区说法已有明确新要求
或修订，后续候选应消费 PF-011 的[差异处理](../../research/future-planning-calendar-and-notification-sources.md#来源差异与当前处理)，
不从旧实现引入调度器、数据模型或通知通道选择。

[PF-012](../../requirements/product/environment/PF-012-computer-browser-shell-sandbox-and-native-use.md)
要求 Computer、Browser、Shell 三类能力同时具备沙盒与运行时当前操作系统
直接使用的支持。现有工具执行候选尚未表达这六种产品组合、环境选择、精确目标、
共享桌面接管、浏览器身份及环境间交接。后续设计应保持沙盒边界，同时支持
获准本机操作，不能用源沙盒专用的 host 排除收窄本轮要求，也不能把隔离失败
静默降级为本机执行；具体实现、权限表示与支持矩阵仍待设计。

用户随后补充 PF-012.C2：某一部署的有效环境范围由模型能力等级、部署装配、
部署默认权限和用户授权共同作用，不能将系统级六种组合误写为每个部署都同时
开放。候选仍需定义这四项输入的组合、覆盖与变更生效规则。

[PF-002.C2–C9](../../requirements/product/environment/PF-002-external-change-response.md#已确认要求)
进一步纳入 Connector 接入、按用户独立安装与供给授权、Push/Pull、生命周期和
状态，以及运行中被动感知与条件触发的主动响应。现有执行候选尚未覆盖这些
链路和恢复语义；后续候选须分别表达供给、呈现、触发与行动结果，并保持来源
内容与目标/权限决定的边界。本轮不采用原 SDK、Channel 存储或 State/Inbound
分工，具体来源范围见[核对记录](../../research/connector-environment-source-sources.md)。
