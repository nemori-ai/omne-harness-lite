# Session 持久提供者：设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 与 `composition.core-work-coordination@1` 的精确候选坐标。目标是消费受限 `RecordReader`/Watermark/decoder 的纯恢复过程，不提供 Cordis 服务或 writer；`recoverSession` 尚未实现，当前默认入口只有 `/baseline`。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/session/persistence/design.md`，SHA-256 `cbf488cd5c3832913a5a30975ef607f86aae1709154cd846bf3a737d99858bac`。只有 baseline-facing 设计；recover 与完整 Session 恢复尚未实现，新 v1 联合符合性无证据。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

联合恢复候选要求 persistence 在同一完整 DR commit 前缀恢复 M immutable observations/current
disposition，包含 `attempt.closing.pending` observation，并保留 revision 与 execution fence 关系；
outcome_unresolved 只能由该耐久 observation fold，不能从 active snapshot 合成。retention 已删除的证据只能报告可服务 floor/gap，
不能默认空或推断 outcome。该映射需要 L reviewer 重审，当前 `recoverSession` 缺失也意味着没有实现证据。
SessionProjection 的 changes 在每个获准非空 commit batch 须携完整 attemptStateUpdates，full snapshot 携授权完整
attemptStates；history 与状态由客户端同水位原子安装。`changes(after,to)` 返回 `coveredThrough ≤ to`，
`to=latest` 固定调用时 resolvedTo，不能将全局 completeTo 直接当本次响应水位；空授权批可由
coveredThrough 跨过但不生成对象级 placeholder。历史分页只在完整 commitPosition 批边界切页。closing.pending 无 terminal revision 仍须产生
in_progress update。用户 hold 与 RN-05 派生 scheduler barrier 分离；后者从 Run stopping/
execution-exposure gate 恢复并由 Session scheduler 执行，不写成第二个 hold。
恢复/投影把一个 stream 在一个 composite batch 的 owner append 视为一次 aggregate revision 变化；同 append
多 facts 共享 revision，逐 fact 顺序取最终 records envelope `(batchSeq,index)`，不从 prepare identity 或
`(stream,revision)` 合成 eventId/逐 fact 去重键。恢复按当前 envelope format 的 canonical StreamRef 顺序与
append-local order 重算最终 `(coordinationDomain,batchSeq,recordIndex)`，验证同批相对引用在 commit 后的
解析与在线一致；事实数量不参与 stream head/revision 的重建。
snapshot 不接受客户端 identity/lastKnownPosition，只返回当前主体获准集合及 collection-level
asOf/floor/visibilityVersion/coverage；隐藏、不存在、已过期没有逐项分类。旧本地草稿缺席只由客户端标
evidence_unavailable。仍在服务范围却缺 projection 输入必须 fail unavailable；所有条目先执行当前可见性裁剪。

## 持续消费的映射


| 阶段 | 目标责任 | 当前状态 |
|---|---|---|
| 输入 | 获准 reader、已同步 Watermark、decoder/fold 与精确版本表 | 目标接口，默认入口当前只有 `/baseline` |
| 纯恢复 | 在一个已核实完整前缀与精确 watermark 上，调用受信清单内各 owner 的 decoder/纯 fold 生成全部候选 durable roots，并核验版本、跨 owner 关系及来源范围；`recoverSession` 只返回这些候选和诊断，不自行提交 arrival、发行 epoch 或安装可见根 | `recoverSession` 尚未实现 |
| 联合发布 | Admission recovery host 核验全部 required owner generations、旧 ExactUse/资源 claim、新 writer epoch 与 host generation，在一个短门中原子安装所有根及共同消费水位；任一缺失、旧代、不同水位或关系不闭合则 fail closed | 恢复宿主符合性未验证 |
| 工作恢复 | 联合基线已可消费后，裁决者通过正常 CC 提交清空 accepted arrivals；原执行 owner inspect/subscribe 在途 attempt，重核当前资格/兼容性，最后联合准入才发行 epoch/WorkPermit 并进入驱动。裁决扫描可以写入，但不属于只读 `recoverSession`；工作门在它完成前保持关闭 | 设计顺序，未有产品恢复测量 |
| 清理 | 成功/取消/失败释放本次 reader use；host generation 防晚到安装 | writer/锁最终释放仍归宿主 |

恢复 publication 不由单个 Session root 成功决定：受信 Admission recovery host 验证全部 required owners、
旧 ExactUse/资源 claim 处置、新 writer epoch 与 host generation 后，才将同一完整 baseline 原子发布并 reopen。
这里的 reopen 只使已核实基线及受限裁决提交可用，不替代 SE-11 的扫描、attempt 核实和最终工作准入；若任何旧 claim 仍可能承载外部效果且未被具名接管，CC-06 继续阻止 reopen。
旧 host/owner generation 的迟到安装 ack 不影响新代；原 `committed + publication=blocked` completion 原件不改。
基线覆盖该原 position 后，新代 lookup 才可另报 `consumable{originalCompletion,baselineRef}`，不重发事实、
广播或 receipt；consumable 也不准自动重发旧模型/工具 attempt，仍需 CC-06 当前资格、墓碑与 inspect 核实。
未结算、释放失败或外部效果 unknown 的责任继续阻断，不能因 fold 成功清空。
