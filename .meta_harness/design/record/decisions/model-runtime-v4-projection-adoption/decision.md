# D-087：RT4／SL3 结算消费者投影采用

2026-09-27，主线依用户“Implement the plan”、遵循已接受 spec／realization 实施及主调度／验收职责授权，技术采用 [v4-design](../../../realization/packages/model/model-request-runtime/v4-design.md) rev 2，SHA256 `95a0115e89404d147ef547655e06e3c8bca86a79c16b9a9fa8b13dc56518f212`。本事件承接 [D-086](../model-runtime-tail-settlement-adoption/decision.md) 的 RT4、[D-083](../session-log-tail-condition-adoption/decision.md) 的 SL3、[D-084](../session-log-jsonl-v3-projection-adoption/decision.md)／[D-085](../session-log-recovery-projection-adoption/decision.md) 的日志投影，沿 [D-081](../model-late-coordination-direction/decision.md) 选择的[共同日志尾条件方向](../../proposals/model-request-adaptation/late-coordination.md)。接受的是提供者机制增补，没有新领域操作、产品政策或规范版本。

采用十三操作及全部外部写方的四参数追加矩阵：普通记录沿原 fence＋unconditional；响应整批始终 unfenced，withRun 使用构造该批的同次合法完整前缀之 tailEquals，noRun 使用 unconditional 且 late 缺席。共同物理对象为同一 session 的 entries.jsonl；完整原批优先认回，保持原 ResponseId、指定 MessageId、原绑定、参数、账和收场。两项 late 事实均已可判才应用其布尔结果；任一不可判仍 unavailable。THIS 零写拒绝不关闭先前 unknown，当前模型选中也不认回未知切换命令。

采用由原调用／回复 owner 持有的单一结算协调器、显式可替换 settlementContention 策略和 settlementScheduler。次数、经过时长、持有字节、并发及等待均显式提供，无隐式默认或后台恢复调度；额度不能因尾冲突重置。已开始 IO 的耗尽／取消不伪造停止，opened unknown 强门仍高于响应结算。关闭在同一 effect 中关准入、实际停止或具名继续持有、明确责任交接后释放实际使用引用；正常调用的既有精确 lease 义务不变。纯 invokeModel 保持无日志／Run／争用策略依赖，P-2／P-5 边界及 AR3 精确依赖不变。

独立 architecture-reviewer 对 rev 1 无阻断；spec-reviewer 对 rev 1 无阻断，提出 R4-EX1 非阻断消歧。rev 2 仅改修订号和“两项均已可判时”限定；定向复审关闭 EX1。主线亲核119输入无漂移、最终候选及最小差分；[135成员评审归档](../../proposals/model-request-adaptation/reviews/model-runtime-v4-projection-2026-09-27.tar.gz) SHA256 `e266650e23079f20fe816b7e9c3b831bb2e20ff9ecd84b23276b56401cb0a510` 全部逐字读回。归档中的评审记录是主线据消息所作的明确归因摘要，不是逐字转录或人的总体签收。两类评审不代替本技术采用，也未执行 IO／TLC。

R4-G7 中的候选技术采用步骤由本事件完成。R4-G1～G6／RT4 G-28～G-31 的生产 Run 认法、共同 codec 和完整原批认回、合法全读授权、多值 headers、具体调度与资源测量、实际全写方停止和宿主恢复交接继续由原 owner 交付。retainedBytes 不证明 SL3 全读瞬时内存有界；owner 留存、close 或首次触发不证明恢复被调度或预算内存在提交机会。不能满足前提时按原门受阻，不以 fixture、默认 false、授权 bool 或接口形状填平。

本次采用允许按精确投影建设已闭合的公共构件与对应消费者；依赖上述缺口的生产接线仍受阻。新源码、R4-V1～V13、真实十三操作、租户装配和恢复尚未验收，新增 bindings0。旧四件套、v3原文、bindings及原证据字节不改；旧 runner3、transport和公共函数证据不自动升级。本事件不放行整个P2、官方37认证或人的总体交付。
