# 执行槽预占验证

本资源验证 Agent runtime 与本地宿主的预占、空闲回收交错。承诺归 Agent 契约。reserved 只有实例身份，不证明 execution 已受理。

## 不变量与归纳

初态 free/idle。取得槽后，reserve 同步将槽及报告改为 reserved；accept 将其改为 running/occupied；release 同步恢复 free/idle。expire 只接受 idle，并在下一次 await 前设置 draining。资格检查返回后再次检查 draining。因此取得槽先发生时不会回收，回收先发生时不能新预占；retired 时不能出现新工作。

证明前提是本地登记句柄正常同步执行。report 抛错、跨进程消息丢失、quiesce 资格拒绝恢复和未知原写认回不在本模型内。无法从本模型推出它们的安全性或最终进展。

## 模型及实现映射

| 模型动作或性质                    | 实现与运行守护                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| BeginInvoke / PassAccess          | provider.ts 的 guard、draining 检查及 occupy；host-local 的 reservation.spec.ts 挂起资格检查 |
| reserved / NoReclaimHeld          | stateOf 同步投影；同一用例挂起 Journal.open 并推进 host 时钟                                 |
| Expire / NoAdmissionWhileDraining | host.ts expire、quiesceNow 与 provider quiesce 同步检查                                      |
| Release / NoRetiredWork           | 明确受理失败后释放槽；之后正常回收                                                           |
| 未知预占保留                      | loop-admission.spec.ts 检查查询 pending、查询失败及认回期间的 reserved；模型不表示原写协议   |

MaxInvokes=2，单槽，允许两个资格检查同时挂起。当前有限范围有24个独立状态。隐藏 reserved 的负控须违反 NoReclaimHeld；跳过 draining 的负控须违反 NoAdmissionWhileDraining。有限探索及上述归纳论证不构成生产源码的机器精化证明，也不保证外部依赖最终返回。
