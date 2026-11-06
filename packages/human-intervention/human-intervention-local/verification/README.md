# 持续验证

## 范围与入口

本包验证真实 SQLite 事务、独立等待恢复和 Identity 成员资格组合。跨提供者的有限状态模型归[公共 HITL 验证](../../human-intervention/verification/README.md)。本包维护关系投影守护，不复制公共模型。

运行 build、typecheck、test:fast、test:slow。测试通过只说明已执行场景；独立评审、验收、性能原始证据和交付接受分别记录在任务 tmp。完整 W18 仍需真实 Session 消费者；独立来源分组不能算 Session 集成。物理断电、远端提供者及任意跨进程故障尚不在这些测试的证明范围。

[独立 HITL 验证台](workbench/README.md)使用实际应用工厂、IdentitySql 和 SQLite，供人工交互检查。它不提供产品登录或完整运行时接入。

## 行为和关系守护

| 性质 | 实现保护 | 可重复反例 |
| --- | --- | --- |
| JointRegistration、OneOriginalRequest | T/W/J/F/H共同提交；稳定OperationRef及唯一RequestRef | [requests.spec.ts](../tests/requests.spec.ts) 缺前驱、F之后失败、unknown原结果；[migration.spec.ts](../tests/migration.spec.ts) 原登记认回 |
| UniqueDecision | 卡片CAS、公开decideReply、每卡决定主键 | requests 双人答复；[relations.spec.ts](../tests/relations.spec.ts) 同卡第二决定 |
| Custody、ReplyCustody | H决定与F inbox/pending同提交 | requests 答复晚失败；relations 双向DecisionInboxExact、原话改写 |
| NoRevival | W终局权威、只使pending卡失效、terminal checkpoint | requests 终局竞争及superseded；relations terminal改ready负控 |
| QualifiedDecision、CurrentComposition | 原ID-19协调及WaitOwner responder | [identity.spec.ts](../tests/identity.spec.ts) 两种撤权顺序及原结果披露；requests reader/responder区别 |
| TenantIsolation | 验证主体、复合键、事实绑定、签名查询上下文 | identity 主体伪造；[queries.spec.ts](../tests/queries.spec.ts) actor/租户/游标绑定；relations 跨租户FK |
| OnceConsumption、OnceDelivery | F原子写receipt/count/pending；先核代次再认回 | requests 消费晚失败、重复消费、ack前退出交付；relations PendingExact和ReceiptCountExact负控 |
| BatchBarrier、generation fence | 活跃批次card_count及任意精度代次 | requests 部分批次、重启换代；relations 提前ready、代次倒退 |
| Recovery ownership | J恢复分支零SQL，唯一F写者 | [relational.spec.ts](../tests/relational.spec.ts) SQL禁止端口、唯一拥有者及完整构造器 |
| PoolExact | reader×实际非空bucket增量目录 | relations 漏桶、空桶、错actor；[pool-filters.spec.ts](../tests/pool-filters.spec.ts) 全状态子集及delivery的独立参考求值 |

[relations.ts](relations.ts)从业务关系独立计算期望集合，用双向EXCEPT核对PoolExact、PendingExact、DecisionInboxExact和JointRegistration。它不调用产品目录维护函数。count/checkpoint与实际receipt行数比较；还核对连续题序、决定状态、接收代次和FK。逐提交的 immutableDecisions 快照可检测两份保管同时被改写，单一静态集合检查无法发现这种历史篡改。所有具名关系负控须触发对应守护；DDL负控单独声明数据库约束，不能用不相关SQL异常冒充关系守护成功。

## 原子动作到关系状态的映射

一次提交才对应模型中的Register、AnswerCommit或Receive；事务内部中间行不可对外观察。T绑定原操作，W读取原等待依据，J决定组合增量，F写等待关系，H写请求关系。任一失败使抽象投影保持原状。恢复使用T/W/J/F，封口使用T。静态图只强制前驱，完整集合由commands构造器承担。

迁移保持身份、题序、决定内容和消费事实，不对应新Register或Receive。版本化导出让HITL从自己的旧请求重建原登记并核验摘要，双向比较全部决定身份及完整摘要。真实旧API生成的固定库见[fixtures](../tests/fixtures/README.md)。迁移负控覆盖改登记操作、改决定正文、漏/多决定、丢receipt；失败后旧记录和旧schema保留，新的关系表不存在。新库、已升级库重开及原操作认回分别执行。未执行的断电和提交响应丢失不能由事务回滚测试推定。

## 索引分页的固定前提

在修订v下，每卡恰属一个bucket；PoolExact使某actor的每个非空请求桶恰好出现一次。每桶索引返回当前位置之后的有序卡片键，分支至多取P+1项。合并五个分支后取前P项，与对完整有序卡片序列应用同一过滤的前P项相同。续页取最后返回卡片的后继，故固定v下不重复、不遗漏。序号空隙和int64最大值由位置解析测试覆盖。

修订、目录键和正文属于同一SQL snapshot。续页比较签名中的修订，不符时冲突；不把新旧内容混在一页。受众投影来自原拥有者、登记后不可变，当前Identity资格在查询前后核验。将来改变受众必须增加相应失效协议。

inbox按耐久序号追加；receipt不删除或重排inbox。pending仅退出已消费项，目录保存原owner、destination和inbox序号。恢复分页依赖每批最多64卡、每卡一个决定及当前代次检查。读取不生成消费操作或receipt。

## 预算与规模

[application.spec.ts](../tests/application.spec.ts)从公开工厂运行登记、答复、查询原结果、bind、inbox、delivery、consume、ack、取消及close，保留64张卡每张8192个四字节字符原话的回归。requests慢层另覆盖64卡×64读者的每次桶转换与共同关系守护，单场景上限30秒。

规模证据应分别记录真实handler/participant的SQL、返回行、绑定和正文bytes，实际SQLite的VM_STEP/FULLSCAN_STEP/SORT及query plan，以及关闭探针后的真实应用延迟。返回行上限不是扫描量；B树高度不意味着严格常数耗时。大历史、未答等待、深交付游标、正文极限和长期资源分别测量。未取得的锁时长、页缓存或Worker消息指标明确保留空缺，不能从SQL行数推算。
