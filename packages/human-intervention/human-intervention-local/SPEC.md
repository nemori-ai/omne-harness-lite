# @omne-harness/human-intervention-local 行为规格

## 范围与依据

本成员是[HITL 公共协议](../human-intervention/docs/protocol.md)的单机 SQL 提供者。依据为用户已接受的 HJ0 与 C2 实施范围。公开模型和应用服务合同归 human-intervention，SQL 原子性与耐久提交归 sql-contract。当前实现操作终态、请求/卡片事务、独立 WaitOwner 及完整原结果读回。Identity 成员资格协调已实现，独立等待的公共命令、查询与恢复应用服务已实现。人类登录、其他原等待适配、交互验证及独立验收不在此实现事实内。

## 结果与不变量

### 原操作身份

固定服务 hitl 内，以 OperationRef 的租户、actor、operationId 识别原操作。method 与规范化命令内容进入 inputDigest；摘要不同必须冲突，不能用修改后的输入认回原结果。不同 actor 或租户使用相同 operationId 不共享终态。

### 终态与封口

终态是 committed 或 aborted。consume 必须和业务参与者处于同一 SQL 提交，任一参与者失败则终态也回滚。seal 将没有终态的操作永久标为 aborted；已有 committed 时保留原状态。consume 不得越过已封口或已消费的身份。原提交的重复调用由 SQL 原操作日志认回。

inspect 返回 absent 仅表示本次快照未找到记录，不能转换为 not-committed。只有已确认的 aborted 才是封口证据。存储故障或丢失提交回执返回 unavailable，调用者保留原操作继续查询。终态 committed 不是业务成功；应用服务必须从原 SQL 操作回执读取完整业务结果。

## 所有权、失败与生命周期

createHitlSqlTerminals 是可信装配能力，不是面向用户的授权接口。工厂绑定一个 tenant SQL domain，并拒绝不匹配的操作租户。服务调用方必须先做当前资格校验，不能把可构造的 OperationRef 当凭据。SQL participant/read handler 仅供已登记可信组合执行，不自行接受网络访问。

HITL 参与者拥有终态、请求、题目、卡片状态、决定及池投影关系；独立 WaitOwner 的唯一状态写者拥有准备、接收控制、active、inbox、receipt 与精确 pending。物理表与键见[对象模型](docs/object-model.md)。每张表只有一个写参与者。原等待、资格、配值和授权数据由各原拥有者提供事务事实，HITL 不读其私表。终态工厂不创建 worker，不关闭调用者提供的共享 SqlStorage。进程退出不会删除耐久终态。身份协调器拒绝关闭后的新操作，并排空已受理操作；完整应用服务的生命周期仍须在其装配边界验证。

## 组合与验证

材料登记消费 sql-contract/worker 的 participant、migration 与 snapshot read 合同。组合必须包含真实业务参与者；直接提交单个 consume 只关闭操作身份，不能伪造一张已答卡片。

[终态测试](tests/terminals.spec.ts)使用真实 SQLite worker，覆盖封口阻止迟到写、共同回滚、重启、actor 隔离、租户匹配与丢失回执认回。[公共入口测试](tests/public-entry.spec.ts)检查真实材料登记。[请求与恢复测试](tests/requests.spec.ts)覆盖共同注册/答卡、竞争答复、批次屏障、换代、业务终局、持久拒绝及重启回查。[身份协调测试](tests/identity.spec.ts)通过真实 IdentitySql 和 SQLite 验证成员撤回竞争、结果披露及关闭排空。[应用入口测试](tests/application.spec.ts)覆盖独立等待公共方法及合法批次。当前未验证物理断电、分布式提供者或完整运行时集成。

## 请求与独立等待

准备材料固定原注册调用、读者、答复者及相容实现。prepared 不是有效人工等待。注册必须共同建立请求、卡片和 active 等待；任一参与者失败则全部回滚。卡片引用必须属于同一请求，cardId 在请求内唯一。

请求提交的依赖为 terminal、只读 wait-plan、本地 local-plan、唯一 independent-state 写者、requests 写者。local-plan 的请求分支只读 HITL 状态并消费原拥有者依据；恢复分支只转交原拥有者计划，不读取 HITL 表。WaitOwner 先接纳注册或决定，HITL 写者才确认对应摘要。静态图拒绝缺失的必需前驱，可信命令构造器保证本次操作的完整参与集合。

独立等待保存原位置、采用引用及答复收件箱。换代须校验相容实现与 expectedGeneration，并原子增加 receiverGeneration。旧代消费返回 stale-generation。live 等待的整个批次都有耐久消费回执后，checkpoint 才成为 resume-ready。答复本身不取得执行槽，执行槽准入由实际运行时负责。

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

每次查询先核验真实主体及当前成员资格。单项查询在 HITL 快照内核验登记时由原拥有者提供的不可变读者投影及请求关联。不存在、无权或租户不匹配的请求统一返回 denied。服务返回投影前再次核验资格；跨领域写提交的保护仍由各自写服务负责，查询不声称跨服务可串行化快照。

池按请求登记序号、请求内卡片顺序分页。序号以十进制字符串传递，避免 JavaScript number 的精度丢失。游标签名绑定当前 actor、租户、固定位置、规范过滤条件及快照修订，limit 可在续页时调整。密钥由装配者安全保管，同密钥重装配可续页，换钥后旧游标返回 invalid-input。游标不是读取资格。

hi_request_versions_v2 随请求变更递增。每页在一个SQL快照内读取修订、索引键及卡片正文；续页修订不符返回 conflict。服务不保存历史快照，不混合新旧内容。池按当前 actor 和实际非空状态桶索引查找，独立范围内不匹配的 origin/session 过滤直接得到空页。每桶最多 P+2 个请求键及 P+1 个卡片键，合并后水合至多 P 个完整 item。输出预算先耗尽时返回 partial 和有效续页；单项无法容纳时返回 limited。complete 表示本页按快照和容量完成，不表示所有结果都在这一页。存储失败返回 unavailable，不能跳过故障后宣称完整。

close 拒绝新查询，并等待已接受查询完成全部受众读取及最后资格核验。它不关闭共享存储，不结束原人工等待。

## 独立等待应用入口

createIndependentHitlApplication 同时实现 HumanInterventionCommands、HumanInterventionQueries、RecoveryCommands 和 RecoveryQueries。它消费上述查询与 Identity 协调机制，仍由可信原工作拥有者准备独立等待材料。接口接受公共 decoder 已验证的命令。没有合法 OperationRef 的网络输入在 decodeHitlCommand/decodeRecoveryCommand 阶段拒绝，不伪造回执关联。

submitReply 只接受 CardRef。服务从已获准的持久请求取得原 WaitRef，不能由客户端提供另一个等待地址。其余命令带各自定义的原引用；最终的所有权、响应资格及代次仍在原等待参与者事务内重核。已解析命令的262144 UTF-8字节预算只计算公共命令，不包含local路由封套。写入成功、拒绝及 unknown 都保留原操作身份。

hitlCommandBinding 和 recoveryCommandBinding 用于保存原操作查询依据。前者对 canonicalize 编码的 `{method,command}` 求 SHA-256，后者对 `{kind,command}` 求 SHA-256，其中 bindReceiver 对应 kind=bind，consumeDecision 对应 kind=consume。输入先通过对应公共schema；输出以十六进制摘要与原 OperationRef 绑定。getOperation 只认回 HITL 命令，getRecoveryOperation 只认回恢复命令，查询错误方法家族返回 conflict。unknown 不触发新操作身份或自动再次执行动作。

### 原等待与交付查询

getWait 在原 WaitOwner 的一个SQL快照内读取控制、active关联及收件箱。准备材料尚未成为active等待时返回 not-found；无读取资格时返回 denied。terminal 状态保留终局依据，完整批次已接手时为 accepted，存在答复但批次未接手时为 replied，否则为 waiting。deliveryCursor 当前为 null，消费者从 readInbox 的第一页开始；读取不会确认接手。

readInbox 只向原消费者披露，当前接收代次必须匹配。其签名游标绑定 tenant、actor、完整 WaitRef 及 receiverGeneration。收件箱按耐久追加顺序分页，答复不会因读取删除，消费后的决定仍可认回。代次过期返回 stale-generation；把旧游标改配新代次返回 invalid-input。新答复可在后续查询出现，不把已返回页解释为未来完整集合。

listDeliveries 只读取固定 destination 下当前消费者尚未接手的决定。独立 WaitOwner 读口在同一快照中核验原租户、原消费者及耐久消费回执；HITL 不跨读其私表。查询从精确 pending 的 tenant、owner、destination 索引按收件箱序号前进，取得至多 P+1 个键并水合 P 项；不扫描已接手历史或尚未答复的等待。游标绑定租户、actor、目的地和查询种类，不能与池或readInbox互换。ack尚未完成但原消费者已经接手的决定不会再列为未接手。

应用工厂在调用注入端口前记录已接受调用。close 先拒绝新调用，再等待整次调用结束，最后关闭内部适配器。关闭后新命令返回 unavailable，不能冒充提交可能成立的 unknown。共享存储仍由装配者关闭。

### 合法批次与存储预算

内部计划通过事务事实交给参与者，规划参与者的中间回执只保留原绑定与planDigest，不复制完整请求及全部历史答复。SqlStorage journal仍保管参与者返回的完整原业务结果，用于原操作认回。否则合法批次累积会在新的单次答复仍合法时触发回执上限。正式请求、池、等待和交付读材料上限均为8MiB；装配者须为SqlStorage配置至少该单次读取上限及相应全局读预算。参与者单响应无需因整批答复增大。64张卡各提交8192个四字节字符的真实回归验证该累积路径，不据此声称无限输入或无限存储。

## 关系迁移

旧四份迁移及校验和保留。新具名迁移在同一迁移事务中核验旧记录、创建关系状态、退休旧表，并保持原序号和操作身份。各拥有者只读取自己旧表；原等待通过版本化临时导出提供登记 OperationRef、readAudience、决定身份及完整规范摘要。HITL 重建 RegisterRequest 校验原摘要，双向比较决定集合和完整内容。缺失、重复或不符必须整笔失败；不补默认值，不丢弃坏行。临时导出完成采纳验证后删除。原 journal 结果继续解释，不重写存储私表。迁移失败和进程退出的实际验证范围见[持续验证](verification/README.md)。

## 字符表示与终局接手

公共文本边界拒绝孤立代理项，保留合法 NUL、控制字符、空格、换行与四字节 Unicode。关系表中的公共自由文本和标识逐字段保存为规范 JSON 字符串，包括 WHERE 绑定、外键和读者目录。读取先解析字符串单元格，再按原公共 Schema 验证。枚举、摘要、十进制修订及排序序号保持原类型。此表示不改变原操作摘要或公开 DTO，也不将请求重新保存为聚合 JSON。

SQL CHECK 验证 JSON 字符串表示及编码字节上限。256 码点标识最多占1538字节，8192码点原话最多占49154字节，包含引号和最长控制字符转义。非空、码点数和原 UTF-8 预算由公共 Schema 验证。不能将编码后的 SQL length 当作原话长度。旧关系迁移通过 BLOB 读取旧 TEXT 标识并严格解码 UTF-8，避免 Node SQLite 在 NUL 处截断。

live 等待消费前必须绑定接收者。terminal 等待不建立新接收者；若它从未绑定，原 owner 可以用 getWait 读回的当前代次消费已有原决定。消费仍校验身份、代次、原决定和 consumeOperationId，只共同写 superseded receipt、receipt_count、terminal checkpoint 并删除 pending。bindReceiver 继续返回 terminal。该结算不产生 resume-ready 或 Continue，重启后沿原操作认回。

## 投影失效与受管恢复

读者投影、池桶目录和 pending 分别来自原准备受众、请求卡片状态、inbox 与 receipt。正常更新由各自唯一写者在原共同事务内完成。关系守护发现缺行、多行、错误关联或计数不一致时，不能继续把相应实例的查询结果解释为“没有工作”。检测本身不自动修复实例。

本成员不提供在线自动重建。装配或运维者获知损坏后，必须停止路由到该实例，调用 close 拒绝新调用并排空已受理工作。关闭后的调用返回 unavailable。维护期间不提供池、请求或恢复查询，也不从缓存返回空页。共享存储的关闭仍归其装配者。

恢复负责人保存原库与诊断证据，再按经批准的维护方案恢复可信备份或重建投影。重建只能消费原拥有者的可信事实，不能跨写其他拥有者私表，不能重新执行登记、答复、消费或外部动作。当前没有通用投影修复命令；若不能证明权威事实完整，实例保持不可用并交事实拥有者处理。

恢复读取前，负责人必须验证 PoolExact、PendingExact、ReceiptCountExact、DecisionInboxExact、JointRegistration 和外键，核对原决定、原操作身份和消费回执未改变，再重新装配并验证原结果认回。通过关系检查只证明当前集合，不代替决定历史和原操作结果的核对。验证入口见[持续验证](verification/README.md)。
