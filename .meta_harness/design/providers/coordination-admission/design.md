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
