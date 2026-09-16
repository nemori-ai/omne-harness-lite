# 共同准入提供者：设计映射

## 采用接口

提供者消费 `composition.core-work-coordination@1` 的精确候选坐标。当前实现由受信应用直接调用 `createAdmissionCoordinator`，持有 `AdmissionHost` 并向业务分发窄 coordinator；没有 Cordis 服务键或插件。未来 Cordis 插件包装只是待设计候选，不能倒写为实现事实。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/coordination/admission/design.md`，SHA-256 `5b9c851da9d4eed57b61322a25005d31271dc16ad1aa934c0613117c0d98cec8`。短门、ExactUse 与提交后 broadcast 有实现；完整业务能力准入闭环、跨纵线组合行和真实耐久联合验收仍缺。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 接口/机制 | 当前映射 | 明确边界 |
|---|---|---|
| `createAdmissionCoordinator` / `AdmissionHost` | 受信装配持有 host；业务只持窄 coordinator | 不向业务暴露完整 writer、quarantine 或 close |
| `prepareOperation` / `lookupPrepared` | 门外冻结原操作；门内以同 key/input 认回 | `not_seen` 不是跨故障未提交证明 |
| `GateFrame` / owner publication | 同步短门发布 logical，耐久完成后发布 durable | 回调不得 await/返回 thenable；协调者不解释业务字段 |
| `ExactUseIssuer` / `ExactUse` | 绑定真实 owner/pin，单次 claim 与显式 release | 不能靠 cast/反序列化伪造，也不代替 owner 清理资源 |
| committed broadcast | 门外广播已提交 receipt/组合名 | listener 不得改业务结果；丢通知由事实扫描恢复 |

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
