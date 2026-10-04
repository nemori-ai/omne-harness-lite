# D-094：MR5 日志 codec 的显式技术采用

2026-09-28，主调度依用户“Implement the plan”、按 spec/realization 施工、主调度与验收以及先闭合最小真实链的授权，技术采用现有 runtime 节点的 [v5-log-codec-design rev1](../../../realization/packages/model/model-request-runtime/v5-log-codec-design.md)，SHA256 `be6563942223693eae3096d7ca3500aec66340c7708cae3b73c335734d902d47`。本事件接续 [D-088](../model-runtime-log-codec-adoption/decision.md) 和 [D-090](../model-headers-v5-adoption/decision.md)，来源方向仍是[共同日志尾条件](../../proposals/model-request-adaptation/late-coordination.md)及[多值响应头](../../proposals/model-request-adaptation/header-handoff.md)，不新增产品政策或领域规范。

采用显式 `/log-codec/v2` 新公开入口，写 mrr/2 payload 并完整消费 MR5；混读按实际 mrr/1→MR4、mrr/2→MR5，保留原 wrapper、值与位置。现有根入口仍 MR4/mrr/1，基线不存在 `/log-codec` 子路径，本次不创建兼容面。共同业务键仍是 D-088 的 mrr/1 命名空间，payload 格式换代不改变 ResponseId/MessageId 判重。捕获域不可伪造且不能通过共享 brand 绕过旧接收；历史读取不自动授予新写资格。完整成员认回和原批优先共用原算法。

独立 architecture-reviewer `/root/m1_g4_codec_boundary_review` 对三项窄选择与 codec 原SHA c6f09dbf 定向复核，本次范围无阻断；指出旧公开子路径的事实错误。root只修正该句后，独立 spec-reviewer `/root/p4_modality_expression_review` 逐项核最终SHA be656394、输入域、混读、捕获/写候选分离、同键和历史原批路径，本次表达范围无阻断，确认该事实问题闭合。两者未运行代码、IO或执行接受。上述为主调度据实际会话消息保存的归因摘要，不冒充逐字评审原件；完整报告当时通过各自会话消息交付。

采用的是提供者纯构件实现约束，不是 RT7/MR6 或 SL4，不改冻结规范、Schema、registry版本和形式任务。codec没有plugin/fiber/service/后台资源，invokeModel不因此取得日志或租户权限。全部LC5-V1～V6尚待执行；当前新增bindings0，未发生本次源码实现验收。

保留D-088的G29-P/H、D-087的实际结算/旧任务静止/合法全读和Run来源前提。混读不认证未知来源的物理同批，不证明旧写方停止，不能替代真实 `[M,R]` 一次 append、JSONL恢复或全部写方采用。生产头交接、完整S20及内容凭据回显、十三操作、37认证和人的整体签收仍未完成。

取代范围只是在**明确采用新入口的消费者**中接续MR5表示及新payload格式；旧根入口、旧历史与原决定其余范围不变。runtime/app及外部回复owner需要显式切换并交真实组合证据；本决定不因新模块存在而自动升级它们。
