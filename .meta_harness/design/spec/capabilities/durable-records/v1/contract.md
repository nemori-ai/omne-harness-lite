# 耐久记录 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.durable-records, 1)`。正文从 legacy
`capability.durable-records@2` 重基，保留 DR-01～DR-05，包括批内稳定顺序与 eventId。
D-008/D-015 仅作 provenance；本坐标保持 candidate、`acceptance:null`。

本能力拥有 append/read/recovery/ordering/unknown 与 writer 生命周期。业务状态解释归
对应能力，共同准入及提交后的后果交接归 `composition.core-work-coordination@1`。
本候选 personal creation 分支消费同 baseline 的 [CC-03/05/06](../../../compositions/core-work-coordination/v1/contract.md)
所颁发的一笔资格；[TG-01](../../../capabilities/tenant-governance/v1/contract.md) 拥有业务事实，
本能力不凭记录内容自授许可。

## 耐久记录能力

**DR-01**：记录能力提供 `readHead`、`readRange`、`commit`、`lookupOperation`、
`acquireWriter`、`closeWriter`。一个 `commit` 含可信 namespace、操作身份、输入
内容摘要、期望修订、一个或多个有 owner 的记录及确定结果；每个批次全部成立或
全部不成立。属于不同状态权威不妨碍它们参加已声明的共同提交，但仅相同提供者
明确支持的协调域内可原子提交；不同文件、服务或远程 store 不自动享有该保证。

记录 envelope 保存 formatVersion、coordinationDomain、commitId、单调 `batchSeq`、
各目标 stream 和前置修订、tenant、主体、因果引用、状态变化类型／版本、数据及
操作结果。一个 envelope 对每个 stream 至多接受一个 append；每个 accepted append
令该 stream 的 revision **恰好加一**，与 append 内的事实数量无关。同一 append 的全部
事实共享该次提交后的 stream revision；该 revision 只标识一次 stream update，不能兼作
逐事实身份、逐事实 sequence 或去重键。owner 可保留辅助事实序号，但它不得参与存储 CAS、
完整性或事实身份判断。

提交者在 `commit` 前把同一 stream 的事实合并为唯一 append，并保留 append-local fact
order；随后按当前 envelope format 指定的 canonical `StreamRef` 编码对 appends 严格升序
排列，再按该顺序 flatten。跨 stream 的 prepare 输入顺序没有业务语义；需要表达的跨 owner
关系必须由完整批次、因果引用与 owner 校验表达。writer 对重复 stream 或非 canonical 输入
返回拒绝，不得静默重排，因为重排会改变逐事实身份。排序规则随 envelope format/version
固定；升级不能让同一历史 envelope 得到另一种顺序。

append 内顺序与 canonical flatten 后的批内顺序都是 envelope 的一部分。`readRange`、恢复
与重放按同一顺序给出记录；每条 accepted fact 的 `eventId` 是本能力在 durable commit 时
分配的 `(coordinationDomain, batchSeq, recordIndex)` 确定编码，其中 `recordIndex` 是 canonical
flatten 后的批内位置。prepare 阶段只能使用不冒充 `eventId` 的临时 correlation identity。
消费者（历史派生、出站流去重）引用最终 `eventId`；`(stream, revision)` 只能认出一次 stream
update，不能逐事实去重。业务状态转移由所属能力校验和解释；存储只维护批次、顺序、完整性、
独占写入和去重，不调用任意用户插件判定权限或推断事件含义。

普通操作的每条 stream scope 必须与 operation tenant 一致。唯一受限混合流例外是
Tenant personal creation 的**一笔冻结原操作**，由受信装配在当前代颁发不可伪造的
单次资格。资格绑定来源 `deployment_init | account_registration`、原 operationRef、
冻结输入摘要、`UserRef`、personal target tenantId、精确协调域、精确 expected revisions、
Tenant owner/Admission host generation 与 writer epoch。`deployment_init` 的 appends
集合恰为 system `tenant-bootstrap`、system `tenant-personal-index`、tenant
`tenant:<target>` 三条；`account_registration` 恰为后两条。唯一 tenant append 的
scope tenantId 与 streamId 必须严格等于绑定 target；不得添加其他 system/tenant
stream、改变集合、跨域使用或拆成多次 commit。每流一个 append，仍按版本化 canonical
`StreamRef` 升序；一个流内多个 facts 只推进一次 revision。

来源是受信颁发者的封闭变体，不是提交者提供的 `operationKind`、`origin`、`owner`、
`UserRef` 字符串或反序列化 envelope；旧代资格不能被恢复扫描或历史结果重新铸造。
存储验证资格绑定、精确流形状、tenant/target 身份、expected revisions、CAS、writer
代际、唯一排序和结果一致性；不读业务事实来判断 Account 授权、唯一 claim、creator
或 owner。那些关系及当前准入归 Tenant 与 CC；未得到它们颁发的有效绑定时返回
rejected/unavailable，不开放泛用 null-tenant 混写。

该例外的 durable conflict 只写 provider-owned system `operation-outcomes`。即使只有
`tenant-personal-index` revision 冲突，outcome 和同一 `operation.conflict` fact 也必须
保存原绑定的 `personalTargetTenantId: OpaqueId`、来源、原 operationRef、输入摘要及
`UserRef`；两者逐字段一致，target 等于不可伪造资格绑定。`conflict.currents` 仅列
实际不匹配的 stream，不为保留 target 伪造 tenant current。committed 的 target 则
由唯一 tenant append 的 scope/streamId 与绑定核对。相同 operationRef、摘要、来源、
`UserRef` 和 target 的 lookup/replay 才能认回原结果；同键异输入仅在仍有逻辑占位或
耐久 outcome 可核实时冲突。暂时 `not_seen` 不证明未提交，不能换 target 或换键重写。

新混合操作使用严格 `core-journal/3` envelope；其 personal creation conflict outcome
形状为 `{status:"conflict", conflict:RevisionConflict, personalTargetTenantId:OpaqueId,
source, operationRef, inputDigest, userRef}`，其中 `source` 恰为上述两个封闭枚举值，
其余身份字段必须与操作及资格逐字段相等。唯一 provider-owned `operation.conflict`
fact 使用 version `3`，data 恰为 `{conflict, personalTargetTenantId, source,
operationRef, inputDigest, userRef}`。普通 conflict 不接受这些扩展字段。
Records codec 与 JSONL writer/replay 须固定 v3 canonical 字节、摘要、必填与禁填字段，
严格按记录版本解码、验证完整前缀与上述跨字段关系。旧候选
`core-journal/1`、`/2` 不获此协议的读取或继续写入兼容承诺；发现存量字节时先
保全原件，拒绝按 v3 可写恢复，另作显式处置。不能把旧专属 target 字段重释成
v3 字段，亦不能从历史记录推导新代写入资格。未知格式、额外字段或不一致的
outcome/fact/binding 同样阻断可写恢复。provider 验收须清点实际存量。

**DR-02**：`commit` 结果区分：`committed(receipt)`、`conflict(currentRevision)`、
`rejected(reason)`、`unavailable`、`unknown(operationRef)`。只有实际耐久确认后
返回 committed；接收进内存、emit、排入写队列或文件 write 返回均不够。
同 namespace／主体／operationId 的相同输入重试返回原结果，异输入返回冲突；
不得把原受理消息还原到编辑前状态。结果未知时只查询／认回同一操作，不换键重试。
已提交后通知失败单独报告 delivery 状态，不能声称写入没发生。

**DR-03**：首版每个协调域只有一份被存储提供者真正强制的写入权；writer epoch
跨重启不复用，旧 epoch 不能追加或提交。读者带确切水位读取完整批次；遇到落后
索引返回水位／重新读取，不能用落后投影判断授权、终态或恢复。读取完好历史与
重新获得执行权分别进行。写入权丢失立即封闭新提交，未知写入先核实再接管。

**DR-04**：首版 JSONL 提供者采用一行一个完整提交 envelope 的项目格式；支持的
OS／文件系统须在实现验收列名，不把网络文件系统视为普通本地盘。批次先校验／
编码，串行写入，完成文件同步及新建／替换所需目录同步后才推进耐久水位和回执。
长度／摘要和序号用于发现截断、乱序和完整行损坏；摘要不构成对恶意修改的签名。
只有最后一个未完成提交的尾部可在持有独占写入权、保全故障原件后修复；完整坏行、
中间缺口或不识别格式拒绝可写恢复，禁止跳过。同步或写入失败不推进已确认水位；
若截回旧水位或确认失败也未知，整个 writer 保持隔离及待核实，不继续追加。

**DR-05**：关闭先禁止新提交、排空并完成同步，再释放 writer；失败保留剩余记录、
责任和可诊断结果。计划更换提供者须冻结该域新写、确认旧 writer 已排空和释放，
核对同一已提交前缀／操作结果后启用新 writer；任一步失败保留明确阻塞，不同时
启动两个写者。读取历史可以有独立可用性。格式升级保存原件并记录转换依据，
不静默覆写原有版本；本版不承诺通用不停机存储迁移。

## Legacy v1 → legacy v2 的来源差异

| 条款 | 性质 | 来源裁决 |
|---|---|---|
| DR-01 增加"批内记录顺序属于 envelope、读取与重放稳定" | 兼容扩展 | 消息流第三轮裁决 R19、消息模型 §6 落点表 |
| DR-01 增加记录 `eventId` 的定义（`(coordinationDomain, 批次序号, 批内位置)` 的确定编码） | 兼容扩展 | 规格评审 2026-09-15 指出 session v2 与 message-stream v1 引用的 `eventId` 没有拥有者 |
| DR-01 其余、DR-02～DR-05 | 原文不变 | — |
| Legacy 源规格依赖由 legacy CD v1 / CC v1 改为 legacy CD v2 / CC v2 | 来源澄清 | D-015 批次组成 |
