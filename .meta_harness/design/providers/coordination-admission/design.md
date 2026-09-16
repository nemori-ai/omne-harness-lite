# 共同准入提供者设计映射

## 采用接口

提供者消费 `composition.core-work-coordination@1` 的精确候选坐标，并在 Cordis Context 中以有生命周期的服务/插件装配。
tenant、operation、因果、epoch、修订与资源所有者必须显式；依赖撤除时先封闭新使用并收口已有责任。

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
