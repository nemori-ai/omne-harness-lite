# @omne-harness/human-intervention-local 行为规格

## 范围与依据

本成员是[HITL 公共协议](../human-intervention/docs/protocol.md)的单机 SQL 提供者。依据为用户已接受的 HJ0 与 C2 实施范围。公开模型和应用服务合同归 human-intervention，SQL 原子性与耐久提交归 sql-contract。当前实现操作终态、请求/卡片事务、独立 WaitOwner 及完整原结果读回。Identity 成员资格协调已实现，独立等待的当前资格查询与统一池已实现，其余公开应用服务尚在实施，不能据此宣称完整 HITL 服务可用。

## 结果与不变量

### 原操作身份

固定服务 hitl 内，以 OperationRef 的租户、actor、operationId 识别原操作。method 与规范化命令内容进入 inputDigest；摘要不同必须冲突，不能用修改后的输入认回原结果。不同 actor 或租户使用相同 operationId 不共享终态。

### 终态与封口

终态是 committed 或 aborted。consume 必须和业务参与者处于同一 SQL 提交，任一参与者失败则终态也回滚。seal 将没有终态的操作永久标为 aborted；已有 committed 时保留原状态。consume 不得越过已封口或已消费的身份。原提交的重复调用由 SQL 原操作日志认回。

inspect 返回 absent 仅表示本次快照未找到记录，不能转换为 not-committed。只有已确认的 aborted 才是封口证据。存储故障或丢失提交回执返回 unavailable，调用者保留原操作继续查询。终态 committed 不是业务成功；应用服务必须从原 SQL 操作回执读取完整业务结果。

## 所有权、失败与生命周期

createHitlSqlTerminals 是可信装配能力，不是面向用户的授权接口。工厂绑定一个 tenant SQL domain，并拒绝不匹配的操作租户。服务调用方必须先做当前资格校验，不能把可构造的 OperationRef 当凭据。SQL participant/read handler 仅供已登记可信组合执行，不自行接受网络访问。

HITL 参与者拥有 hi_terminals、hi_requests 和 hi_request_versions。独立 WaitOwner 参与者分别拥有 hi_wait_controls 与 hi_wait_active/hi_wait_inbox。每张表只有一个写参与者。原等待、资格、配值和授权数据由各原拥有者提供事务事实，HITL 不读其私表。终态工厂不创建 worker，不关闭调用者提供的共享 SqlStorage。进程退出不会删除耐久终态。身份协调器拒绝关闭后的新操作，并排空已受理操作；完整应用服务的生命周期仍须在其装配边界验证。

## 组合与验证

材料登记消费 sql-contract/worker 的 participant、migration 与 snapshot read 合同。组合必须包含真实业务参与者；直接提交单个 consume 只关闭操作身份，不能伪造一张已答卡片。

[终态测试](tests/terminals.spec.ts)使用真实 SQLite worker，覆盖封口阻止迟到写、共同回滚、重启、actor 隔离、租户匹配与丢失回执认回。[公共入口测试](tests/public-entry.spec.ts)检查真实材料登记。[请求与恢复测试](tests/requests.spec.ts)覆盖共同注册/答卡、竞争答复、批次屏障、换代、业务终局、持久拒绝及重启回查。[身份协调测试](tests/identity.spec.ts)通过真实 IdentitySql 和 SQLite 验证成员撤回竞争、结果披露及关闭排空。当前未验证完整公开应用服务、物理断电或分布式提供者。

## 请求与独立等待

准备材料固定原注册调用、读者、答复者及相容实现。prepared 不是有效人工等待。注册必须共同建立请求、卡片和 active 等待；任一参与者失败则全部回滚。卡片引用必须属于同一请求，cardId 在请求内唯一。

请求提交的事实依赖为 terminal、原等待控制、请求计划、原等待 inbox、请求写入。规划者只读本域请求表。它消费原拥有者给出的等待依据，不读原等待私表。WaitOwner 先接纳注册或决定，HITL 写者才确认对应计划。组合漏掉必需参与者时必须在提交前拒绝。

独立等待保存原位置、采用引用及答复收件箱。换代须校验相容实现与 expectedGeneration，并原子增加 receiverGeneration。旧代消费返回 stale-generation。一个批次的所有卡片都有耐久消费回执后，checkpoint 才成为 resume-ready。答复本身不取得执行槽，执行槽准入由实际运行时负责。

业务终局只使未答卡失效，保留已有决定。此后接收已有决定生成 superseded 回执，不能恢复执行。acknowledgeDelivery 必须匹配原拥有者保管的完整消费回执。相同决定的后续消费认回原回执，不重复推进 checkpoint。

## 完整原结果

createHitlSqlOperations 的 inspect 从终态和 SQL 原操作日志认回方法、输入摘要、原业务结果及提交凭据。方法必须与结果类型匹配，结果内 OperationRef 必须与外层相同。接收代次过期、绑定 CAS 冲突等已确定的恢复拒绝也保存为原结果。committed 表示该结果已保管，不表示拟动作获准。

终态为 committed 而原日志缺少合法业务结果时，不得伪造成功。日志暂不能确认时返回 unknown，结果损坏时返回 unavailable。该工厂也不认证身份，公开调用者仍须先校验当前资格与披露权限。seal 只有认回 durable aborted 后才能返回 not-committed。

## Identity 成员资格协调

createIdentityQualifiedHitl 只消费 Identity 的 PrincipalVerifier、TenantStandingSource 与 StandingReservations。每次具名写入和原操作查询都先验证已签发主体、当前成员资格、所需具名资格与租户。OperationRef.actorRef 必须等于该主体的 standingPrincipalRef，不接受外部自报 actor。

新写入通过 ID-19 保留短暂 reservation，绑定固定租户、主体、原操作与输入摘要。提交完成或异常后请求 settle；无法确认终态时保留原操作并返回 unknown。等人期间不持有 reservation。已提交结果的重放也必须重新核验当前资格。

createHitlStandingDestination 仅装入 Identity 的可信目的端 resolver。它严格匹配 owner、destination、scope、principal、operationId 和规范 targetRef，再调用同一业务目的端的原子 seal。撤权先封口时，晚到原提交不能成立；提交先成立时，撤权保留历史结果，后续披露仍重查资格。目标端不可用时不得谎报封口成功，撤权由 Identity 的既有恢复协议继续处理。

该协调器只兑现 ID-19 的成员关系与具名资格。它不签发主体，不验证人类登录凭据，也不授予卡片、会话、资产或许可权限。原等待控制继续核验来源与受众。其他适用 guard 必须由后续完整应用装配提供，不可用本协调器代替保护向量。

close 先拒绝新工作，再等待已受理的读写结束。操作在调用注入端口前加入排空集合，重入关闭也不能漏掉该操作。关闭不删除请求、不终结业务等待、不关闭共享 SqlStorage；Identity 的恢复 resolver 有独立装配生命周期。


## 独立等待的查询与分页

createIndependentHitlQueries 实现公共 getRequest、getCard 和 listPool。装配者注入原有 Identity/SQL 配置、固定 locationRef 及至少32字节的游标签名密钥。该工厂只支持独立 WaitOwner，不替代 Session、Agent 或 Tool 的原等待适配。它不实现 getOperation、listDeliveries 或写命令。

每次查询先核验真实主体及当前成员资格。单项查询从 HITL 的请求记录取得原等待引用，再通过原拥有者读口核验受众及请求关联。不存在、无权或租户不匹配的请求统一返回 denied。服务返回投影前再次核验资格；跨领域写提交的保护仍由各自写服务负责，查询不声称跨服务可串行化快照。

池按请求登记序号、请求内卡片顺序分页。序号以十进制字符串传递，避免 JavaScript number 的精度丢失。游标签名绑定当前 actor、租户、固定位置、规范过滤条件及快照修订，limit 可在续页时调整。密钥由装配者安全保管，同密钥重装配可续页，换钥后旧游标返回 invalid-input。游标不是读取资格。

hi_request_versions 随请求变更递增。扫描过程中每次读取都同时取得该修订和下一请求，返回页前比较最后一次读取。修订不同返回 conflict，调用方从新快照重新开始；服务不保存历史快照，也不混合新旧内容。每页最多扫描64个请求。达到结果条数或数据末尾时 completeness 为 complete；扫描预算先耗尽时为 partial，返回有效续页游标。complete 表示这一页按其快照和限制完成，不表示全部结果都在这一页。原等待读口或存储失败返回 unavailable，不跳过故障后宣称完整。

close 拒绝新查询，并等待已接受查询完成全部受众读取及最后资格核验。它不关闭共享存储，不结束原人工等待。
