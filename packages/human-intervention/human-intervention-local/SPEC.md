# @omne-harness/human-intervention-local 行为规格

## 范围与依据

本成员是[HITL 公共协议](../human-intervention/docs/protocol.md)的单机 SQL 提供者。依据为用户已接受的 HJ0 与 C2 实施范围。公开模型和应用服务合同归 human-intervention，SQL 原子性与耐久提交归 sql-contract。当前实现操作终态参与者及可信装配读回/封口能力；请求、卡片、独立 WaitOwner 和 Identity 组合尚在实施，不能据此宣称完整 HITL 服务可用。

## 结果与不变量

### 原操作身份

固定服务 hitl 内，以 OperationRef 的租户、actor、operationId 识别原操作。method 与规范化命令内容进入 inputDigest；摘要不同必须冲突，不能用修改后的输入认回原结果。不同 actor 或租户使用相同 operationId 不共享终态。

### 终态与封口

终态是 committed 或 aborted。consume 必须和业务参与者处于同一 SQL 提交，任一参与者失败则终态也回滚。seal 将没有终态的操作永久标为 aborted；已有 committed 时保留原状态。consume 不得越过已封口或已消费的身份。原提交的重复调用由 SQL 原操作日志认回。

inspect 返回 absent 仅表示本次快照未找到记录，不能转换为 not-committed。只有已确认的 aborted 才是封口证据。存储故障或丢失提交回执返回 unavailable，调用者保留原操作继续查询。终态 committed 不是业务成功；应用服务必须从原 SQL 操作回执读取完整业务结果。

## 所有权、失败与生命周期

createHitlSqlTerminals 是可信装配能力，不是面向用户的授权接口。工厂绑定一个 tenant SQL domain，并拒绝不匹配的操作租户。服务调用方必须先做当前资格校验，不能把可构造的 OperationRef 当凭据。SQL participant/read handler 仅供已登记可信组合执行，不自行接受网络访问。

本成员拥有 hi_terminals。原等待、资格、配值和授权数据由各原拥有者提供事务事实，HITL 不读其私表。终态工厂不创建 worker，不关闭调用者提供的共享 SqlStorage。进程退出不会删除耐久终态。当前尚未提供完整应用服务的 close/drain 实现。

## 组合与验证

材料登记消费 sql-contract/worker 的 participant、migration 与 snapshot read 合同。组合必须包含真实业务参与者；直接提交单个 consume 只关闭操作身份，不能伪造一张已答卡片。

[终态测试](tests/terminals.spec.ts)使用真实 SQLite worker，覆盖封口阻止迟到写、共同回滚、重启、actor 隔离、租户匹配与丢失回执认回。[公共入口测试](tests/public-entry.spec.ts)检查真实材料登记。当前未验证完整注册/答卡、Identity 撤权协调、原等待恢复、物理断电或分布式提供者。
