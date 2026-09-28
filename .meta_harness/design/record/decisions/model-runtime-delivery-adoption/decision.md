# D-076 模型请求纵线最终规格与装配投影采用

2026-09-27。依用户“Implement the plan.”委托与[适配提案](../../proposals/model-request-adaptation/design.md)，技术接受 capability.model-request-runtime/v3 全67条与 capability.loop-extension-runner/v3 全52条，采用 runtime、pi transport、runner及 model-request-acceptance 四个精确节点投影。资源、范围及 formed输入见 acceptance.json；旧已发布版本不改字节，消费者仅显式采用新版本。RT的SessionLog2 S22/S23精确依赖本次正式对齐。九份配套契约及其他读提供者的采用沿D070/D072/D073/D074/D075，不在本事件重写。

独立 architecture-reviewer adaptation_architecture_review 对 RT 的 opened回执未知/取消迟到提交指出 RT-AR1，主线要求实际隔离控制；最终Q1–4要求旧追加/流/旧结算写者静止、有效attempt栅栏或无Run唯一承载、日志owner权威恢复读，再沿S33既有时机按真实opened及耐久意图结算。未知期间不写普通响应、不重发、不以旧tail空读假称未提交。此设计已闭合，真实V7/V11及日志交接G8尚待执行。spec-reviewer binding_batch_spec_review 对系统停止S36与恢复分支的RT-B1指出表达冲突；最终明确正常confirmed停止run_cancelled与未知隔离后仅沿S33runtime_lost，未增耐久意图或恢复禁令。架构及表达均确认给定恢复边界一致。

独立 reviewer 对runner精确记录/重放、dispatch结果闭合、实际history/content/body准入与默认重试原规则复审无阻断。既有有限Runner模型正/负工具输出只支持其明确域和假设；公开函数、完整工具/card/modality/身份等既有缺口不据它自动关闭。默认重试是已声明的精确loop-extension件，不拥有豁免身份或暗中覆盖准入。

验收app rev2独立core_projection_review原MAA-AR1认证对象碰撞已改为完整档案及配置来源上下文、完整无损binding及实际route相等；摘要仅索引、读回核全值，旧调用lease通过不继承新配置认证。MAA-AR2落实既有本机owner权限与显式tenant范围，A-V13/V14列真实负控，不新增租户网络诊断API。pi transport与runner节点独立架构复审无阻断；应用只消费真实能力，不私补产品语义。

本事件批准按明确可实施范围建设，未声称真实IO、停止、完整应用、37生产模型认证、OS权限或观测已经验证。USD100单一ledger与每模型G门保留；研究缓存命中只作策略证据。未建全AgentLoop/工具执行/产品CLI/中心同步/OAuth或完整CCL/MCP，model-only窄凭据组件沿D075。独立验收和人的总体签收尚未发生。


## 2026-09-28 工程观测示例实施采用

主线依同一持续实施与技术验收委托，技术采用 [v15 工程观测映射 revision2](../../../realization/packages/model/model-request-runtime/v15-diagnostics-demo-design.md)，精确 SHA256 `c026f6e9b4963dd216d0b4819a07ba823bea73c0370823c49f4f0184a95edbcf`。沿现已接受 RT9 S63、v3 的 JSONL/query/export/有限metrics责任；[原提案评审](../../proposals/model-request-adaptation/review.md#2026-09-28-冷宿主与工程观测窄映射评审)记录独立AR1/AR2及revision2定点复核。采用显式执行关联与来源白名单、装配持有诊断寿命、单授权scope的有限查询导出、实际资源未停时继续持有并显示不完整、全装配多代transport读面容量。

只承接 examples/model-invocation-minimal-demo 工程观测，不恢复已退役正式验收app、不增跨租户授权、trace后台或十三操作。当前契约不变；新增bindings0，D6-V1～V11、Node/POSIX资源与权限仍待实际验证，采用不代表实现和认证完成。候选正文保留受审字节，以本技术采用判可施工。
