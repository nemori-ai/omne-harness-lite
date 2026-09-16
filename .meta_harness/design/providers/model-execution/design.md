# Model Execution 提供者映射设计

## 能力到 Cordis 的候选投影

候选 `ModelExecutionPlugin` / `omneModelExecution` 与独立 host，按 tenant/profile/attempt 分区。 生命周期与状态权威独立于另一项 M 能力；模型请求可以消费媒体引用，媒体
保存不因此成为模型 adapter 内部细节。prepare 不发网；admit 与预算/授权/epoch 同门；dispatch 只经 OpenRouter；inspect/settle 认回迟到事实；换代排空原 attempt。

## 精确依赖与所有权

S/G/L 的 outgoing manifest 是 M 可用输入上界，不等于这个 provider 全部直接消费。候选 catalog
为本 provider 登记的实际直接依赖只有：

- S：`data.core-work` 的 CD-01～CD-05、`composition.core-work-coordination` 的 CC-01～CC-07、`capability.durable-records` 的 DR-01/DR-02/DR-03/DR-05；
- L：`capability.session` 的 SE-01/SE-03/SE-06/SE-10/SE-11/SE-13/SE-14/SE-16/SE-18/SE-19/SE-20，`capability.run` 的 RN-01/RN-02/RN-03/RN-05/RN-07/RN-08/RN-09，`capability.run-driver` 的 RD-01/RD-02/RD-04/RD-06/RD-07/RD-08/RD-10/RD-13/RD-16，以及 `capability.tools` 的 TL-01/TL-02/TL-07/TL-08/TL-11/TL-12/TL-19/TL-20；
- G：`capability.tenant-governance` 的 TG-01/TG-02/TG-05 和 `capability.budget-accounting` 的 BG-01～BG-04；
- M：独立 `capability.media-content` 的 CT-01～CT-04。

动作授权只沿 L 已固定的共同门见证消费；G 尚未向 M 发布 AU 候选接口，不能由本组自行升级为
直接依赖。上界资源 hash 见本次 `input-dependencies.json`，实际依赖条款以 `catalog-delta.json`
对应候选坐标为准；未列出的上界输入不是隐含依赖。
Context 只携带作用域和依赖，不能成为业务状态权威。跨 tenant 默认拒绝；同物理内容摘要不能
披露另一个 tenant 是否已有内容，也不能授予读取权。

provider 的持久 ledger 保存 immutable observations 与 revisioned current disposition；M 是唯一 writer，以
attemptId/attemptEpoch/expectedRevision/evidenceId CAS 全序更新，并在同一 CC 门核对 Step 唯一 success、
Run epoch/fence/RN-05。未获业务接纳的 late output 只记审计/费用/隔离，不生成 Message/tool batch；unknown 可经 inspect
单调细化，abandoned 必须引用 execution fence。provider 在提交 disposition 前先把同 operation 的
`attempt.closing.pending` observation 写入 M ledger；无 receipt 时只从它 fold 出 closing/outcome_unresolved，
它不是 current disposition，投影为 in_progress 并保留草稿，不能由 active snapshot 合成；显式提交的 durable business unknown 必为
settled_without_message，首次投影即 semantic close。disposition 进入 Session durable history，由
SessionProjection 提供正文/明确无正文/outcome-unresolved/retention gap，不由 active publisher 留第二历史。

active publisher 提供 sourceId/sourceGeneration、可靠有序 callback 与 compact public-state snapshot/cut。state 以
`coveredThrough`（下一未覆盖 chunk index）表达同 transformVersion 的 fold 前缀；routeBinding 与
actualResponseIdentity 分开。historyAnchor 为 session position 或无 Session work anchor。provider 换代
fence 旧 attemptEpoch；普通重试新建 attemptId。active sourceGeneration 固定 transformVersion，frame 统一
携带 runEpoch?/attemptEpoch/sourceGeneration/dispositionRef；旧代 `source.generation.changed` 唯一对应
E 的 `stream.source-generation-changed`，二者不是同一协议对象；单 listener 故障只撤该订阅。当前源码没有
ledger、callback、active snapshot 或 disposition projection 的符合实现。

## 失败、迟到和撤除

外部请求或保留操作一旦可能发出，timeout/abort 只能记 unknown/partial，并由原 attempt/
operation owner inspect、对账和接收迟到结果。重试产生新 attempt，保留原费用和因果关系。
provider 停止先封闭新准入、排空/隔离在途工作并保存可恢复事实；插件卸载不等于撤回外部效果、
删除媒体、释放预算或取消历史交付。

## OpenRouter 传输适配边界

ModelHost 保留 attempt、共同准入、预算、结算和迟到结果的权威；传输适配只承担请求投影、
OpenRouter 出站、流解析及结果回传。内部工具调用的 `toolCalls/toolCallId` 必须映射为
OpenRouter wire 的 `tool_calls/tool_call_id`，后续工具结果须带回原调用 ID；本地工具的
实际执行仍走 Tools/授权门，模型适配层不能直接执行。路由中选择的 provider 与响应中
实际服务的 provider 分开记录，费用也区分 OpenRouter 响应／可核实账务的实际金额、
目录价格估算和缺失值；估算或数值偶合不能冒充实际收费输入给 Budget。

按 [D-019](../../decisions/pi-ai-openrouter-transport/decision.md) 定向 fork pi-ai 的 OpenRouter
provider、目录与流解析；fork 必须向 Host 暴露实际服务商、实际费用及其来源、响应身份，
并保留明确的请求参数、无暗中重试、abort/错误和私有 replay 语义。DSH `llm-pi-ai`
的设置、账号、凭据与本项目 Account/Budget/共同门不是同一权威，不因复用传输而接入。
