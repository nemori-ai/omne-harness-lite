# @omne-harness/human-intervention-local 行为规格

## 范围与依据

本成员是[HITL 公共协议](../human-intervention/docs/protocol.md)的单机 SQL 提供者。依据为用户已接受的 HJ0 与 C2 实施范围。公开模型和应用服务合同归 human-intervention，SQL 原子性与耐久提交归 sql-contract。当前实现操作终态、请求/卡片事务、独立 WaitOwner 及完整原结果读回。Identity 组合、统一池和公开应用服务尚在实施，不能据此宣称完整 HITL 服务可用。

## 结果与不变量

### 原操作身份

固定服务 hitl 内，以 OperationRef 的租户、actor、operationId 识别原操作。method 与规范化命令内容进入 inputDigest；摘要不同必须冲突，不能用修改后的输入认回原结果。不同 actor 或租户使用相同 operationId 不共享终态。

### 终态与封口

终态是 committed 或 aborted。consume 必须和业务参与者处于同一 SQL 提交，任一参与者失败则终态也回滚。seal 将没有终态的操作永久标为 aborted；已有 committed 时保留原状态。consume 不得越过已封口或已消费的身份。原提交的重复调用由 SQL 原操作日志认回。

inspect 返回 absent 仅表示本次快照未找到记录，不能转换为 not-committed。只有已确认的 aborted 才是封口证据。存储故障或丢失提交回执返回 unavailable，调用者保留原操作继续查询。终态 committed 不是业务成功；应用服务必须从原 SQL 操作回执读取完整业务结果。

## 所有权、失败与生命周期

createHitlSqlTerminals 是可信装配能力，不是面向用户的授权接口。工厂绑定一个 tenant SQL domain，并拒绝不匹配的操作租户。服务调用方必须先做当前资格校验，不能把可构造的 OperationRef 当凭据。SQL participant/read handler 仅供已登记可信组合执行，不自行接受网络访问。

HITL 参与者拥有 hi_terminals、hi_requests 和 hi_request_versions。独立 WaitOwner 参与者分别拥有 hi_wait_controls 与 hi_wait_active/hi_wait_inbox。每张表只有一个写参与者。原等待、资格、配值和授权数据由各原拥有者提供事务事实，HITL 不读其私表。终态工厂不创建 worker，不关闭调用者提供的共享 SqlStorage。进程退出不会删除耐久终态。当前尚未提供完整应用服务的 close/drain 实现。

## 组合与验证

材料登记消费 sql-contract/worker 的 participant、migration 与 snapshot read 合同。组合必须包含真实业务参与者；直接提交单个 consume 只关闭操作身份，不能伪造一张已答卡片。

[终态测试](tests/terminals.spec.ts)使用真实 SQLite worker，覆盖封口阻止迟到写、共同回滚、重启、actor 隔离、租户匹配与丢失回执认回。[公共入口测试](tests/public-entry.spec.ts)检查真实材料登记。[请求与恢复测试](tests/requests.spec.ts)覆盖共同注册/答卡、竞争答复、批次屏障、换代、业务终局、持久拒绝及重启回查。当前未验证公开应用服务、Identity 撤权协调、物理断电或分布式提供者。

## 请求与独立等待

准备材料固定原注册调用、读者、答复者及相容实现。prepared 不是有效人工等待。注册必须共同建立请求、卡片和 active 等待；任一参与者失败则全部回滚。卡片引用必须属于同一请求，cardId 在请求内唯一。

请求提交的事实依赖为 terminal、原等待控制、请求计划、原等待 inbox、请求写入。规划者只读本域请求表。它消费原拥有者给出的等待依据，不读原等待私表。WaitOwner 先接纳注册或决定，HITL 写者才确认对应计划。组合漏掉必需参与者时必须在提交前拒绝。

独立等待保存原位置、采用引用及答复收件箱。换代须校验相容实现与 expectedGeneration，并原子增加 receiverGeneration。旧代消费返回 stale-generation。一个批次的所有卡片都有耐久消费回执后，checkpoint 才成为 resume-ready。答复本身不取得执行槽，执行槽准入由实际运行时负责。

业务终局只使未答卡失效，保留已有决定。此后接收已有决定生成 superseded 回执，不能恢复执行。acknowledgeDelivery 必须匹配原拥有者保管的完整消费回执。相同决定的后续消费认回原回执，不重复推进 checkpoint。

## 完整原结果

createHitlSqlOperations 的 inspect 从终态和 SQL 原操作日志认回方法、输入摘要、原业务结果及提交凭据。方法必须与结果类型匹配，结果内 OperationRef 必须与外层相同。接收代次过期、绑定 CAS 冲突等已确定的恢复拒绝也保存为原结果。committed 表示该结果已保管，不表示拟动作获准。

终态为 committed 而原日志缺少合法业务结果时，不得伪造成功。日志暂不能确认时返回 unknown，结果损坏时返回 unavailable。该工厂也不认证身份，公开调用者仍须先校验当前资格与披露权限。seal 只有认回 durable aborted 后才能返回 not-committed。
