# 耐久记录 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.durable-records, 1)`。正文从 legacy
`capability.durable-records@2` 重基，保留 DR-01～DR-05，包括批内稳定顺序与 eventId。
D-008/D-015 仅作 provenance；本坐标保持 candidate、`acceptance:null`。

本能力拥有 append/read/recovery/ordering/unknown 与 writer 生命周期。业务状态解释归
对应能力，共同准入及提交后的后果交接归 `composition.core-work-coordination@1`。
个人创建消费普通单租户 DR-01 commit；[TG-01](../../../capabilities/tenant-governance/v1/contract.md)
拥有来源核实、业务事实与唯一性，本能力不凭记录内容自授许可。
本能力的数据依赖为同 baseline 的 [CD-01/02](../../../data/core-work/v1/contract.md)
`OperationRef` 与 `UserRef`，以及 [ARI-1/2](../../../data/agent-runtime-identity/v1/contract.md)
`OpaqueId`/tenant 身份；本能力自有 `StreamRef`、`CommitEnvelope`、`RevisionConflict`
形状见 [v1 Schema](schema.json)，不能借用 provider TypeScript 类型作规范。

## 记录结构与编码

`StreamRef={namespace:OpaqueId, owner:OpaqueId, scope:{kind:"system"} |
{kind:"tenant",tenantId:OpaqueId}, streamId:OpaqueId}`；相等是五个语义字段
（含 scope kind/tenantId）的逐字段精确相等。`RevisionConflict={kind:"revision",
currents:[{stream:StreamRef,revision:Counter}]}`，`Counter` 为无前导零的非负十进制
整数字符串（零恰为 `"0"`）；`currents` 无重复，按原冻结 appends 顺序只列提交时
实际 `expectedRevision != currentRevision` 的流，`revision` 是其实际 head。
JSON Schema 约束结构，逐字段身份、CAS、顺序和来源可信性由本契约行为约束。

本版 `core-json/1` canonical JSON 是有效 JSON 值的 UTF-8、无 BOM/无多余空白编码：
对象键按 UTF-16 code unit 词典序严格升序，数组保留原序；字符串与有限数字按
ECMAScript `JSON.stringify` 的对应值呈现，禁止 NaN/Infinity 和不成对 surrogate。
`canonicalInput` 必须解码为本 Schema 的 `OperationInput`：精确字段为
`{format:"core-operation/1",operationKind,tenantId,principal,target,arguments,
preconditions,causality}`；`principal` 是 `{kind:"user",user:UserRef}` 或
`{kind:"system",systemId:OpaqueId}`，`causality` 的允许引用见 Schema，未使用时为
空对象。该格式归本能力的存储操作输入编码所有，不替业务 owner 定义
`target/arguments/preconditions` 的含义。`OperationInput` **没有 namespace 字段**；
`operation.namespace` 来自受信准备绑定的完整 `OperationRef`；个人创建使用
TG-01 的 Tenant T，不复用 Account A；writer epoch 固定为 `core.writer`。writer 核可信
准备与输入的 tenant、principal 一致；`operation.principalId` 恰为 principal 的
canonical JSON，不能仅凭输入自报身份授权。codec 与 replay 同样须解析/验证
该对象、摘要和 `OperationRef` 主体绑定；完整行本身不重建当代身份授权。
v3 outer journal line 恰为 Schema 的 `JournalLine{byteLength,formatVersion,payload,sha256}`；
payload 是 Schema 的 `CommitEnvelope` 三个封闭子类型之一的 canonical 字符串。两层及
`canonicalInput` 均用该规则；`inputDigest` 是 `canonicalInput` UTF-8 字节的 SHA-256
小写十六进制，outer line 的长度和摘要按 DR-04 对 payload UTF-8 字节计算。
记录 formatVersion 恰为 `core-journal/3`；appends 数组及每个 append 的 records 数组
保留原冻结顺序，canonical JSON 只规范对象键与编码，不重排数组。解码须
字节重新编码一致，不能仅因 JSON 值相等便接纳非 canonical 字节。格式、字段集、
嵌套身份和冲突形状在本候选版本内固定；不认识格式或字段即拒绝可写恢复。

v3 的 `recordClass`/`source` 由可信 writer 根据普通准备或内部 writer 动作赋值：
`ordinary_commit|ordinary_conflict` 对应 `source="ordinary"`，
`writer_epoch` 对应 `source="writer"`。
它们是持久辨别码，不是调用者提交的权限声明；codec 对每行强制相应封闭子类型，
writer 再核受信来源与资格，replay 只核历史结构和完整前缀，绝不据历史字节重铸资格。
Schema 的通用 `BaseEnvelope` 只是内部共同字段定义，不能当作可单独接纳的 payload。

## 耐久记录能力

**DR-01**：记录能力提供 `readHead`、`readRange`、`commit`、`lookupOperation`、
`acquireWriter`、`closeWriter`。一个 `commit` 含可信 namespace、操作身份、输入
内容摘要、期望修订、一个或多个有 owner 的记录及确定结果；每个批次全部成立或
全部不成立。属于不同状态权威不妨碍它们参加已声明的共同提交，但仅相同提供者
明确支持的协调域内可原子提交；不同文件、服务或远程 store 不自动享有该保证。

记录 envelope 保存 formatVersion、coordinationDomain、commitId、单调 `batchSeq`、
各目标 stream 和前置修订、tenant、主体、因果引用、状态变化类型／版本、数据及
操作结果；`batchSeq` 恰为 `position.seq`，没有另一个可分歧的序号字段。一个 envelope
对每个 stream 至多接受一个 append；每个 accepted append
令该 stream 的 revision **恰好加一**，与 append 内的事实数量无关。同一 append 的全部
事实共享该次提交后的 stream revision；该 revision 只标识一次 stream update，不能兼作
逐事实身份、逐事实 sequence 或去重键。owner 可保留辅助事实序号，但它不得参与存储 CAS、
完整性或事实身份判断。

提交者在 `commit` 前把同一 stream 的事实合并为唯一 append，冻结 appends 数组及
append-local fact order；同一批不能重复 `StreamRef`。writer 不按 StreamRef 排序，也不
静默重排；按冻结 appends 数组次序、再按各 append 的 records 次序 flatten。此顺序属于
调用者提交的批次，不能从跨 stream 的顺序推断业务因果；跨 owner 关系由完整批次、
因果引用与 owner 校验表达。重复 stream 在分配位置和 operation 占位前拒绝，
读取、重启与 replay 不得让同一历史 envelope 得到另一种顺序。

append 内顺序与上述 flatten 后的批内顺序都是 envelope 的一部分。`readRange`、恢复
与重放按同一顺序给出记录；每条 accepted fact 的 `eventId` 是本能力在 durable commit 时
分配的 `(coordinationDomain, batchSeq, recordIndex)` 确定编码，其中 `recordIndex` 是
flatten 后的批内位置。prepare 阶段只能使用不冒充 `eventId` 的临时 correlation identity。
消费者（历史派生、出站流去重）引用最终 `eventId`；`(stream, revision)` 只能认出一次 stream
update，不能逐事实去重。业务状态转移由所属能力校验和解释；存储只维护批次、顺序、完整性、
独占写入和去重，不调用任意用户插件判定权限或推断事件含义。

普通操作的可信冻结 `OperationInput.tenantId` 与业务 appends 双向对应：为 `null` 时
每条普通业务 stream 必须是 system scope；为非空 `t` 时每条都必须是
`{kind:"tenant",tenantId:t}`，不能混 system 或另一 tenant。普通 CAS 冲突按
**原** `attemptedAppends` 执行同一双向核验，provider-owned 结果 stream 则按下文
采用 system 或原 tenant scope；用户自报 `tenantId:null` 不授 system 写权限。
TG-01 的个人创建 C 将 `tenantId` 固定为 personal target，以普通单租户流提交；
其 `inputDigestT` 由 C 的 canonical 字节计算，与 Account 私有 `digestA` 无映射要求。
DR 仅核受信准备的 T/C、tenant scope、CAS 和 writer 资格；F 的来源、UserRef 唯一性
及 owner 事实归 Tenant/CC 核实。DR 记录中不得放 A、`digestA` 或凭据内容。

冲突 envelope 的 `attemptedAppends` 必须保存原冻结成功候选的有序
`[{stream:StreamRef,expectedRevision:Counter}]`，与原 appends 一一对应、无重复，
不含业务 facts，且绝不参与已应用状态或 eventId 分配；成功与 writer epoch 行禁填该字段。
它与 `recordClass`、`source`、原 `OperationRef`、`canonicalInput`/`inputDigest` 同处一份
耐久 envelope。writer 在短门对原冻结候选核准入与 CAS，并且只从该候选生成
`attemptedAppends`，不能用事后重组的列表或客户端自报来源替代。
恢复时必须持锁核实该冲突行**之前**同域连续完整前缀，对每个 attempted stream 计算
当时 head，从 expectedRevision 不相等者按 attempted 顺序重建非空 `RevisionConflict.currents`；
结果须与 outcome、唯一 provider fact 逐字段相同，否则拒绝可写恢复。
前缀未核实则保持 unknown/unavailable，不仅凭冲突行或落后投影报告 durable conflict。

普通操作的 CAS 不匹配也只写**同原操作**的 provider-owned conflict outcome envelope：
唯一 append 为 `{namespace:"core.records",owner:"durable-records",scope:原可信输入的
tenant scope 或 system,streamId:"operation-outcomes"}`，其中唯一 fact 为
`{kind:"operation.conflict",version:"3",data:RevisionConflict}`；`outcome` 恰为
`{status:"conflict",conflict:RevisionConflict}`，`requiredUses=[]`。writer 依据原可信
冻结输入的 tenant、原 `OperationRef`/`canonicalInput`/`inputDigest` 及实际 CAS mismatch
生成并验证该记录；`currents` 按 `attemptedAppends` 顺序列出且与 fact 逐字段一致。原业务
appends 全不应用，结果 stream 自身按通常 CAS `+1`；只在该 outcome 实际耐久后返回
conflict，lookup/replay 以原操作身份认回同一结果。调用者不能直接提交此保留
namespace/stream。个人创建目标已在受信 C、T 的稳定派生与 tenant-scope
`attemptedAppends` 中保存，CAS 冲突沿普通 outcome 认回，不能仅凭同 target 的
另一 T 成功而把本 T 报为 committed。

所有新操作与 provider-owned 记录使用严格 `core-journal/3` envelope。每次取得 writer
时，在同一 journal 的 `core.writer` 保留 namespace 写入并同步一个 `writer.acquire`
批次，随后才交出新 writer；首次 epoch 为 `"1"`，每次取得独占权从已核实完整前缀
的最后 epoch 严格加一，不能借 PID/时间或未耐久的内存计数代替。该批次的
`operation={namespace:"core.writer",principalId:受信系统主体的 canonical JSON,
operationId:"epoch:<domain64>:<epoch>"}`；`domain64` 是 coordinationDomain 的
UTF-8 字节按 RFC 4648 URL-safe base64 编码、无填充，解码再编码必须相同；
该无歧义分隔编码使不同 domain 的同一 epoch 不共用 `OperationRef`。
`canonicalInput` 是 `core-operation/1` 的 `writer.acquire`，tenantId=null、target 为
coordinationDomain、arguments 含本 epoch、preconditions 含前一 epoch；唯一 append 是
`{namespace:"core.writer",owner:"durable-records",scope:{kind:"system"},streamId:"writer-epochs"}`，
唯一 fact 为 `{kind:"writer.epoch",version:"3",data:{epoch}}`，committed result 也恰含
epoch，`requiredUses=[]`。position.writerEpoch 等于该 epoch，stream revision 仍按
append `+1`。`core.writer` 与 `writer-epochs` 仅 writer 自己可写；replay 校验
operation、输入、domain、前一 epoch、单调 epoch、position、append、outcome 与
连续前缀一致，不能把普通业务行或旧格式行当成新代写入权。完整但未回执的 acquire
须先认回并在下次取得写入权时再严格加一；失败或未知时不交出 writer。

Records codec 与 JSONL writer/replay 须固定 v3 canonical 字节、摘要、必填与禁填字段，
严格按记录版本解码、验证完整前缀与上述跨字段关系。旧候选
`core-journal/1`、`/2` 不获此协议的读取或继续写入兼容承诺；发现存量字节时先
保全原件，拒绝按 v3 可写恢复，另作显式处置。不能把旧专属 target 字段重释成
v3 字段，亦不能从历史记录推导新代写入资格。未知格式、额外字段或不一致的
outcome/fact/binding 同样阻断可写恢复。provider 验收须清点实际存量。

**DR-02**：`commit` 结果区分：`committed(receipt)`、CAS 冲突的
`conflict(RevisionConflict)`、同键异输入的 `conflict(operation_input)`、
`rejected(reason)`、`unavailable`、`unknown(operationRef)`。`RevisionConflict.currents`
可列多个实际不匹配流；`operation_input` 不产生第二份耐久 outcome 或 receipt。
只有实际耐久确认后
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
