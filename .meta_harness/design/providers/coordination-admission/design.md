# 共同准入提供者：设计映射

## 采用接口

提供者消费 `composition.core-work-coordination@1` 的精确候选坐标。当前实现由受信应用直接调用 `createAdmissionCoordinator`，持有 `AdmissionHost` 并向业务分发窄 coordinator；没有 Cordis 服务键或插件。未来 Cordis 插件包装只是待设计候选，不能倒写为实现事实。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 [legacy Admission 设计](../../../../packages/coordination/admission/design.md)，SHA-256 `5b9c851da9d4eed57b61322a25005d31271dc16ad1aa934c0613117c0d98cec8`；该页记录 P1 的已接受机制与固定旧证据，并非新 v1 的符合性证据。短门、ExactUse、receipt 型提交后通知在当前源码中存在；[当前 `CommittedNotice`](../../../../packages/coordination/admission/src/index.ts) 只有 `composition`、`canonicalInput`、`receipt`，不含原提交 envelope 的 appends/facts，因此**不符合** D-014 和 [LC-06](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 的原 envelope 广播。完整业务能力准入闭环、跨纵线组合行和真实耐久联合验收仍缺。
源码实现状态须由 I/实施任务在精确 revision 核对；本文区分来源机制、目标映射与尚未交付的改动，不把旧测试或通知存在升级为新契约验收。

## 持续消费的映射


| 接口/机制 | 当前映射 | 明确边界 |
|---|---|---|
| `createAdmissionCoordinator` / `AdmissionHost` | 受信装配持有 host；业务只持窄 coordinator | 不向业务暴露完整 writer、quarantine 或 close |
| `prepareOperation` / `lookupPrepared` | 门外冻结原操作；门内以同 key/input 认回，重入门再查去重 | `not_seen` 不是跨故障未提交证明；不能绕过原 coordinator 票据 |
| `GateFrame` / owner publication | 单同步短门发布 logical，writer 耐久后按 seq 在另一短门发布全部 durable roots，再完成 coordinator 票据 | 回调不得 await/返回 thenable；旧 durable 根不能覆盖较新的 logical 根；协调者不解释业务字段 |
| `ExactUseIssuer` / `ExactUse` | 绑定真实 owner/pin，单次 claim 与显式 release | 不能靠 cast/反序列化伪造，也不代替 owner 清理资源 |
| `records.envelope.committed` | 目标为 writer→Admission 受信交接**原始已提交 envelope**，仅 committed/ready 后门外广播一次 | 当前 `CommittedNotice` 不含 envelope，是待改实现；listener 不得改业务结果，丢通知由事实扫描恢复 |
| Tenant personal creation binding | 受信装配仅给 TenantHost 两个封闭入口；两者都先核 Account 已耐久分配的不复用 `UserRef`、唯一凭据绑定、固定 target 与 AI-02a 创建后果经 CC-05 导入。init 再核 AI-08 受信初始账号来源、Tenant 尚未建立、seed 与独占部署资格；registration 核普通注册来源。首次排位前冻结原 operation/摘要/`UserRef`/target，短门纯查来源、claim、target head 与当前代际，颁发本代一次性的三/二流资格并交 Records/JSONL | 普通 coordinator、客户端 origin/owner/operationKind/UserRef、seed 文本、Tenant 自分配的 UserRef、旧 session 或持久 envelope 均不能铸造权限；门内不 await Account I/O |

### 短门、票据与使用的持久语义

来源 P1 的短门只运行受信组合的同步纯检查；外部查询、Schema 校验、资源取得、记录与候选根计算都在门外。进入门后按身份/租户和硬资格、修订与去重、绑定/epoch、grant/决定、预算和精确使用资格顺序复核当前根；未通过不能得到逻辑位置或效果许可。`isCurrentFrame` 仅证明对象是当前活动 frame，不授业务权限；重入、过期 frame 与异步返回均拒绝。

提交前冻结 `PreparedCommit.owners`、publication owner 和 `requiredUses.binding` 的不可变快照；publication owner 与记录 owner 集合完全相等、各一次，use binding 与 requiredUses 完全相等且实例出自真实 issuer/pin。任何漏、重、多、伪造、accessor 或可变描述错配都在排位前具名拒绝，不能先写后补。每个 `retainAt`、`publishLogical`、`publishDurable` 严格同步返回 `undefined`；抛错/thenable 使域隔离，晚到 rejection 由门外诊断接管，晚到 resolve 不能恢复 ready。

新的 apply 票据在同一短门把 fresh use 绑定到原 operation/input/Position，最多调用一次 `retainAt`；同操作同输入重复认回原票据，不能再次扣取或释放原 claim。ExactUse 的 `fresh`、`claimed`、`releasing`、`retained`、`released` 五态按原 owner 的证据和清理结果单向转移；releasing 不能抢占，retained/released 不能重用。有 claim 的释放只能由原资源 owner 依据 settled 或 verified_not_committed 证明，unknown 保留责任；释放失败/不确定也保留原 claim，协调者不成为第二资源 owner。重复、拒绝、组装失败只清理本次快照中未移交且确为 fresh 的 pin。

writer committed、coordinator completion 与 owner publication 是不同事实。按序发布全部 owner durable roots 后才 resolve coordinator completion；publication 失败使原票据以 `committed + blocked` 完成、域单调隔离并保留占位和资源，不得改写为未提交或让后续票据越过缺口。逻辑根已走到 n+2 时，n 的耐久提升不能把旧快照覆盖到 logical。`close` 先关新准入，再等待已排位票据的 writer 结论和 coordinator publication，最后排空/关闭 writer；在途效果由原 owner 结算或隔离。

### 原 envelope 广播交接

D-014（legacy source `docs/decisions/D-014-session-run-agent-lifecycles.md`，SHA-256 `b112d9566ae618cb3af544a5f6b5bf4e0beb5d2734c9df8f9a8c1b6fe14e845c`）与 [LC-06](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 要求事实即事件：交给反应者的是**原提交 envelope**，不是 receipt、规范输入或从它们重新拼出的第二份事件。目标采用受信 writer→Admission handoff：writer 在已核实 committed 的结果中交出与耐久前缀同一身份、canonical 内容和顺序的不可变完整 envelope（含所有 appends、facts 与批内位置，逐事实 eventId 按原位置确定）；Admission 核对 domain、commit/operation、position、receipt 与 envelope 绑定，只保管和转交这个对象，不重新赋予事实身份。该 handoff 的公开 port、生命周期及实际后端返回方式仍需 DR/Admission 联合实施映射；目前 writer 只返回 receipt，不具备该输入。

在所有 owner durable roots 发布完成、coordinator 票据 committed/ready 且自身 completion 已 resolve 之后，Admission 在 GateFrame 外按 seq 对当时订阅者广播该原 envelope 一次。`blocked`、`unknown` 和未成立的操作不广播；重试认回同一票据不重播。每个 listener 独立隔离异常并报告 delivery 状态，不能影响原提交、其余 listener 或水位；应用按 tenant/Session scope 路由，反应者在自己的门内重读权威状态并按 envelope 的稳定 eventId 幂等。广播是提示，不提供耐久恰好一次投递：提交至通知之间崩溃、未订阅或 listener 失败由提供者启动扫描完整事实前缀补漏，扫描不得重做原提交。

若真实 writer 无法随 committed 结果交出原 envelope，唯一待评估的后备映射是按该 receipt 的精确 position 从**同一已核实耐久前缀**读取原 envelope，再验证完整身份与内容后投递；拿不准、读错位置或不可读取即不发布 ready 提示并保留可扫描的缺口。该后备不是已接受实现，不得退化成 receipt 自造通知。旧实现 `CommittedNotice`/测试仅证明 receipt 型通知的顺序和异常隔离，不能证明本节。

来源 P1 的 `record_conflict` 仅证明其原 provider-owned 冲突记录可以耐久并以原 Receipt 认回，不发布业务根或消费 use。新 v1 的通用冲突 outcome 是否以及如何成为可广播的完整事实 envelope、与 DR v3 personal creation 专项 conflict envelope 的范围关系仍属 **CC/DR 语义 owner 未决**；本文不替它定义全局冲突事件或擅自把现有 conflict 通知排除规则扩大为新契约。

Account→CC 的受信接收者对 init 与 registration 均在门外核 Account 源 fact identity、
schema/version、签发权、原 operation/摘要、`UserRef`、target 与一次创建授权，
然后将它以稳定身份耐久
导入目标协调域并去重；响应丢失查原 identity。导入的是不可变授权投影，Account
暂时不可达或 pending 后来 active 不撤销它；账号激活仍查 Account 自身结果。
未核实/未导入时新创建 unavailable/unknown。导入前后的通知不直接颁发资格；
旧 host/owner/writer generation 不能使用历史导入事实写入新代，新代须先经 CC-06
完整根安装。导入意图的交付责任及结果由 CC-05 保留可查询。

同一 personal creation operation 已排位后，prepare/lookup 必须返回原 target 与
pending/unknown 状态；不能因 init 已完成、Account active 或暂时 not_seen 重跑首次准入
或二次生成 target。跨重启只有 CC-03 的旧 writer 完整前缀核实了未提交并安全解除了
占位，才能沿同一原 operation/摘要/target 重新准备；历史 committed 与当前 Tenant
业务资格分别查询。租户 closing/closed 后原创建只认回历史结果，不赋予当前访问。

writer 的 `committed`、coordinator completion 与 publication 状态是三个不同事实。writer
完成耐久后，coordinator 必须在另一短门按 seq 提升全部 owner 的 durable 根。原 coordinator
completion 对 `committed + publication=ready`、`committed + publication=blocked` 或具名 `unknown`
都必须完成，不能因本地发布失败悬挂；只有 `publication=ready` 才允许相关效果并广播。
`publishDurable` 抛错时不能改称未提交：票据以 `committed + publication=blocked` 认回，协调域单调隔离，
禁止相关效果和 committed broadcast，并保留全部占位、ExactUse claim 与资源收口责任。
未核实写入保持 `unknown`。

同一 operation 的重试返回原 coordinator ticket/completion，不能绕过 coordinator 直接等待
writer Promise。blocked 域只有在恢复者核实耐久前缀、重建全部 owner 根、清楚处置保留资源
并取得新的合法 writer/epoch 后才可重新开放；通用 undo、listener 成功或日志输出都不能清除隔离。

## `committed_blocked` 的恢复发布接口

这是 `composition.core-work-coordination@1` CC-06 的目标 provider delta，当前实现尚未证明符合。
受信装配在普通 AdmissionHost 之外提供恢复宿主；业务 coordinator、listener、任意 owner 和用户代码
都不能取得安装权限。恢复宿主只接受一个不可变 `RecoveryPublicationBaseline`：

- `coordinationDomain` 与从完整前缀取得的精确 `through: Watermark`；
- 新取得的 `writerEpoch` 和本次 `recoveryHostGeneration`；
- 按受信装配清单恰好覆盖全部 required owners 的 `ownerRoots`，每项携带 owner identity、
  owner generation、该 watermark 上的 durable root 与来源范围；
- 从同一前缀核实的跨 owner batch relations，以及每个遗留 ExactUse/资源 claim 的处置证明。

安装前恢复宿主逐批验证 envelope、canonical 顺序/eventId、跨 owner 关系和 operation outcome，
再调用各 owner 的纯 fold 得到根；不能让 owner 自报一个未绑定前缀的根。owner 集合缺失/重复、
watermark/domain 不同、旧 host/owner generation、旧 writer epoch、关系不闭合、资源处置 unknown
或任一候选根校验失败都会隔离新 host，且不得部分推进。owner 先在门外 fold 并生成不可变
候选根；宿主在短门内复核代际和所有根的完整性，随后一次切换覆盖全部 owner roots 与
coordinator 水位的共同快照。若 owner 只能依次执行可单独发布或可能失败的安装回调，
则没有满足原子性，必须保持关闭，不能把逐个安装加 try/catch 当作 rollback。门内步骤
同步、无 await/thenable，恢复安装不调用旧 `publishDurable`，也不逐 operation 重演通知。

旧 ExactUse 仍以原 operation/binding/claim 为身份。恢复宿主让原 owner 依据 settled、
verified_not_committed 或已关联的现存 attempt 处置它们；无法证明可释放、清理失败或外部效果仍
unknown 的 claim 保持 retained 并阻止 reopen。安装完整基线、收口全部阻塞责任并取得新 writer/epoch
三者都完成后，宿主才一次性把新 generation 转为 open；旧代迟到确认永远不能作用于新 generation。

`lookupPrepared` 对历史票据仍返回原 `committed + publication=blocked` completion，不改写它。
恢复宿主另提供受信查询投影 `lookupRecoveredPublication(operation)`：只有 operation receipt 的 position
不晚于已安装 baseline watermark、其 envelope/owner relations 已包含于该 baseline 且输入身份匹配时，
才返回 `consumable{originalCompletion, baselineRef}`；否则返回 blocked/unknown。这里的 consumable 只
表示业务 durable roots 已在新代一致可读，不生成第二份 receipt/result，不补发 committed broadcast，
也不授权 attempt 直接执行。调用者仍按 CC-06 核实当前资格、墓碑、原 attempt 与执行 owner 关联。
