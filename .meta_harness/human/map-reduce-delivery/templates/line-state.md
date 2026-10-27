# 线状态注模板

Line 在交出、停下和压缩前保存下列完整人读恢复快照，位置由线包指定，供接续者取得。本模板不是机器 JSON。正式 state 命令只写共享 schema 的 consumption 字段，消费 delta 后读回；未消费 delta 不造空记录。人读快照不能替代机器回执，也不能将下列扩展字段直接塞入 consumption JSON。规则归[负责人状态](../../../../docs/engineering/map-reduce-states.md)。状态只记录事实，不消费波中新设计或授予写权。

- 身份：<repo、milestone、line parent、owner、当前波、plan revision>
- 状态：<phase/control、active/idle/terminal、当前 attempt/requestId>
- 输入：<binding、F、frozenInput、工具/技能/策略版本>
- 候选：<批次分支/head、每卡状态、报告、准入与评审证据>
- 停写：<交接开始/写者已停止/读回交权；没有时不虚报>
- delta：<已消费连续序号、评论 ID/游标、摘要；未读变化不算已消费>
- pendingOps：<operationId、原输入/journal、外部结果 confirmed/unknown、恢复入口>
- 等待：<purpose=wave/disposition、当前真实 R 或 requestId/旧 attempt、原 shell tool-session、wait journal>
- 处置：<有效 disposition 修订和读回；takeover/rescope/redispatch 各自 guard>
- idle：<原因、最新变化、直接后继与已保存/已挂等待证据>
- terminal：<有效明确决定、最终报告与必要接受；unknown nextHint 不填 terminal>
- 恢复点：<尚未完成动作、允许下一步、失败去向和原目标/游标>
- 缺口与剩余责任：<已停依赖项、可继续工作、非成功结果；不写求方案问答>

恢复先核对唯一执行、当前授权、回执与 head。重复转发不新建执行；已开始交接不回实现，已登记恢复等待。未知副作用先读回同一操作，不另造 ID。STOPPED 不等于 DONE。每次有效 release 顺序更新 state 并重挂；只有明确 terminal 停止。
