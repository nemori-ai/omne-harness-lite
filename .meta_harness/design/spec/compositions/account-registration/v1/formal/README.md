# 注册交接行为模型

[AccountRegistration.tla](AccountRegistration.tla) 描述一个已获准注册的原操作在两个
owner 间的交接。它细化 [ACR-01～06](../contract.md)，不是认证库、Tenant 存储或
CC-06 恢复宿主的实现；本候选没有通过模型文件存在而获得接受或发布状态。
实际执行结果和剩余义务见 [verification](../../verification.md)。

## 状态与规范映射

| 规范性质 | 状态、动作与检查性质 |
|---|---|
| ACR-01 原操作身份稳定 | `Allocate` 耐久固定一个 `user/target`，`identities` 留下分配历史；`StableIdentity` 检查重试/重启未分配第二身份。摘要不同的拒绝和同摘要的重复调用投影为 `RetryOrReject` 的无权威写入。 |
| ACR-02/04 pending 到 active | 账号 `accountDisk/accountPublished` 的 0、1、2 分别表示无身份、pending、active；`accountFlight` 区分逻辑提交，`knownAccount` 是可丢失观察。`SubmitActive` 同时要求耐久身份与 Tenant 可消费依据；`NoEarlyActive` 约束连磁盘上的 active 都不能提前成立。 |
| ACR-03 唯一个人范围 | `tenantLogical` 占位，`tenantDisk` 是完整耐久批次，`tenantPublished` 是可消费事实；TG-01 的 tenant/claim/唯一 owner 成员共同提交抽象成一条绑定 target 的记录。`OnePersonalTenant`、`SameTarget` 与 `PublicationSound` 分别检查唯一性、目标不漂移和发布依据。 |
| ACR-05 未知与回执丢失 | `UnknownAccount/UnknownTenant` 允许磁盘实际提交或未提交两种结果。`LoseReceipt` 不释放占位；`RecoverAccount/RecoverTenant` 仅在独占核实前提下认回或证明未提交。`NoUnknownRelease` 检查 unknown 不能解除原占位。 |
| ACR-05 publication blocked | `BlockPublication` 保留永久的 `tenantBlocked` 历史 completion；普通 `PublishTenant` 不可补发它。只有 `RecoverBaseline` 建立新可消费基线，`NoBlockedActivation` 与 `RecoveredPublication` 检查恢复屏障。 |
| ACR-06 并发、重启与历史结果 | 两个 `Workers` 竞争 `owners` 中的推进许可，`OneCoordinator` 检查唯一持有者。`Crash` 丢弃协调者及观察，保留权威意图和磁盘事实；成功后 `CloseTenant` 可以关闭当前租户，历史成功仍保留，不创建新租户。 |
| ACR-04/06 对外结果 | `ReturnSuccess` 等待可核实 active，`NoFalseSuccess` 检查历史结果有完成事实。`FairSpec` 下的 `EventuallySuccess` 检查有条件进展。 |

这里的 `tenantPublished` 表示已建立且可认回的注册事实，不表示永远有效的访问许可。
`tenantOpen` 表示之后可发生的关闭；模型没有用历史成功授予业务请求。

## 检查范围与前提

- [Safety.cfg](Safety.cfg) 和 [Progress.cfg](Progress.cfg) 均枚举一个原操作、两个可选
  UserRef、两个可选 target、两个竞争协调者。无状态裁剪、深度限制或对称归约；失败、
  重试及重启可以重复交错。正向身份准入已获准，凭据冲突/拒绝不属于本模型的进展目标。
- `Spec` 不承诺最终成功，允许后端无限不可用。`FairSpec` 明示最终 `Stabilize`：后端可完成
  独占核实，崩溃和回执丢失停止；各持续可执行的 owner、查询、发布、恢复动作弱公平调度。
  这比“通常能恢复”更强，是进展检查的环境前提，不能由 TLC 通过反推提供者已兑现。
- 耐久原操作意图的原子分配、账号记录的完整写入、Tenant 批次原子性和协调者旧许可 fencing
  是对应 owner 必须兑现的契约前提。`Recover*` 不是普通 `lookupOperation`：它要求已隔离旧
  writer、核实完整前缀并安全释放未提交占位；单次 `not_seen` 永远不满足此动作。
- 修订后的 AI-02a/ACR-03 进一步要求凭据唯一绑定后才产生不可撤销的一次创建后果，并经
  CC-05 受信耐久导入；本模型的 `Allocate` 将这些步骤抽象为已获准源意图，**没有**
  检查早期 pending、凭据冲突、伪造/错绑导入或源/目标跨域失联交错。
- `RecoverBaseline` 抽象 CC-06 的全部 owner roots、同一基线水位、新 writer/代际与旧资源
  责任收口。该动作保留旧 blocked completion；模型只检查注册消费此证明的方式，不验证
  CC-06 内部重建、全 owner 原子安装或跨进程通道。

## 尚未覆盖的义务

多个独立注册操作之间的账号分配全局唯一性、同一 UserRef 的其他管理操作竞争、摘要规范化、
凭据碰撞与准入拒绝、恶意/错绑回执、永久失败的产品状态、真实 fsync/数据库完整性、旧 worker
持过期令牌重新提交均需要 owner 规格及实现验证。这里两个潜在身份并不等于两个同时注册的账号。
ACR-07 的每次登录态/成员/资产授权以及租户在注册未完成时关闭的竞态也没有在本模型中展开。
不把 `RetryOrReject` 的无写入抽象当作摘要校验器已验证，不把单操作检查推广为全系统隔离证明。

TLA+ 工件表达这段候选行为；没有需要另建的结构关系证明，故本包未添加 Alloy。
有限 TLC 检查与故障变体只能支持所列范围，不是任意规模证明。TLC 使用方式参见
[官方执行说明](https://tla.msr-inria.inria.fr/tlatoolbox/doc/model/executing-tlc.html)。
