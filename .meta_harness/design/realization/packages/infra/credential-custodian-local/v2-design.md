# credential-custodian-local：模型副本来源绑定增量

本稿 **candidate，未接受**，2026-09-27 rev 2。`v2-design.md` 指本节点对 CCL v2 的候选实现增量，不是新契约版本；[已接受设计](design.md)保持原状态。源码 `packages/infra/credential-custodian-local` **尚未建包**。新增函数、子入口、表列与装配选项名均为**候选**，不冒充已有 API。

## 输入与兑现边界

基线为 `omne-harness-lite-design-2026-09-15`；精确依赖接受状态及采用记录以 [registry catalog](../../../../registry/catalog.json) 为准。本轮输入为模型适配提案与主线对本机取值缺口的裁定，消费者为 [model-profile-directory v3 候选](../../model/model-profile-directory/v3-design.md)及 `apps/model-request-acceptance`。产品依据沿既有 CCL 的 PF-016 rev 8、PF-002 rev 20、PF-013 rev 13。本稿只补真实本机副本与目录当前引用的关联，不交付中心送达、OAuth 用户流程或完整 secrets 子系统。

| 精确坐标 | 本节点消费或保留范围 |
| --- | --- |
| [`capability.credential-custodian/v2`](../../../../spec/capabilities/credential-custodian/v2/contract.md) | S-5～S-20 的六操作、原值返回、加密、按登录状态归属及撤除全部保留；S-22～S-28 与原 N-1～N-11 不删减 |
| [`capability.model-profile-directory/v3`](../../../../spec/capabilities/model-profile-directory/v3/contract.md) | S-7/S-12/S-19/S-20/S-32：绑定引用决定租户取值，present 不保证 body 可交；当前绑定与已证来源相等才交给目录 |
| `data.identity-values/v1`、`data.asset-model/v2#S-23`、`data.offer-expiry/v1#S-22` | 沿旧精确身份、CredentialRef 与 Instant；不升级成其他节点默认数据版本 |
| `core/storage` 现有 AtomicStorage/StorageUnit；D-042 共同参与采用 | 同一个真实实例、顺序参与、异常先到共同终结边界；Unit.query 不等于独立只读快照 |
| `capability.account-identity/v3`、`capability.organization-governance/v2` | **归装配**的真实账号、登录状态及租户资格前提；本节点不增加读时登录核验，也不重做身份服务 |

现有包尚无实现。`core/storage` 的公开 protocol 已有 `atomic`、`StorageUnit.assertStorage/run/query/mutate`；候选目录 `./tx-reads` 尚未实现。保留 D-026 的存储选择、D-027 的 NORMAL 边界。本轮新增组合先以真实 SQLite 文件库验收；不能仅由 StorageUnit 类型外推 PG 或跨库可用。

## 契约责任到插件、服务与操作

| 契约责任 | 插件、服务或公开构件（候选） | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| CCL2 S-5/S-6/S-12～S-15 | 既有 storeReplica/readReplica/discardReplica/discardLoginState | 原 tenant 主键副本行；新增可缺席 source_ref 只供目录关联 | generic store 整行替换并清来源标记；generic read 仍按 tenant 原值返回；MCR-V1 |
| CCL2 S-7/S-8；目录3 S-12 | 共享 sealBody/openBody、现读 keyFile、诊断剥值 | 原 AES-GCM 构件；来源绑定密文格式增量 | 真实 keyFile，无秘密/引用日志；来源字段进入认证上下文；MCR-V2/V5，CCL-11 仍须取证 |
| 目录3 S-7/S-19/S-20 | 技术子入口 ./model-replica 的 storeBoundReplica/readBoundReplicaIn | 与目录 ./tx-reads 共用一个 StorageUnit 锁定读 | 当前 bindingRef、expectedRef、replica.sourceRef 三者全等才交 body；旧/无来源不交；MCR-V3/V4 |
| CCL2 S-16～S-18/S-19 | 完整 credentialCustodian 六操作插件与原清扫 | 仍要真实 mcp-bridge ./tx-reads、迁移/外键与同源 clock/TTL | 不以本轮 model-only 组件声称完整插件已实现；MCR-3，旧 S-25/S-28/N-1/N-10 保留 |
| CCL2 S-20；目录3 S-23 | full 插件与 model-only 闭包各自的准入/在途 owner | 单一组合 cleanup；实际事务结束后才释放 | 不因取消返回就销毁借出的 unit/key/body；撤除不删副本、密钥或目录绑定；MCR-V6 |
| CCL2 S-11/S-19；目录3 S-12 | 受限技术入口与真实 bootstrap | named directory consumer 与验收启动发布者 | 新增的只是提供者组件，不加领域操作或替换旧六操作的判据；MCR-V7 |

## 公开技术面与旧六操作的关系

候选 `./model-replica` 导出 `createModelReplicaCustodian({ storage, clock, keyFile, readCredentialBindingIn })`。它是可独立创建、可关闭的模型副本组件，复用完整插件同一份封存、表访问与失败分类实现，不在这里复制一套 custodian。技术动作如下；它们不加入 `credentialCustodian` 的六个领域方法，不出现在产品管理 API：

| 技术构件 | 作用及结果边界 |
| --- | --- |
| `storeBoundReplica({ loginState, tenant, sourceRef, body })` | 可信写入者已取得并保持同一 `(sourceRef, body)` 对；一次 atomic 内锁定读目录当前引用、比较后整行保存密文与来源。相等成功为 `{ stored: true, tenant }`；绑定不存在/已漂移为 `{ stored: false }` 且不改副本；该 false 是技术比较结果，不新增 CCL 领域失败值 |
| `readBoundReplicaIn(unit, tenant, expectedRef)` | 加入调用方共同单元；先核同实例，再锁定读取真实当前绑定与本节点副本。仅三引用相等且开封成功返回 `{ body }`，不返回 ref；无绑定/无副本/旧无来源/引用不符/打不开返回 `{ absent }`，供目录映射 credentialUnavailable |
| `close()` | 本组件 owner 关闭准入、等待实际在途工作结束；无业务删除或密钥销毁，不是新的领域操作 |

`readCredentialBindingIn` 是显式函数依赖，装配只绑定目录 `./tx-reads` 候选 `createCredentialBindingReader(storage)` 返回的真实闭包：它先 `unit.run`/`assertStorage`，再在 `unit.mutate` 对 `model_credential_binding` 的 tenant 行 `lockRow`，再经 `unit.query` 读当前行，返回内部 binding/absent；函数也核同 storage。**不是先调用 credentialPresent 再把 true 当 ref**，不接受从 manifest 或内存常量造的 reader。本节点不直接 import 目录包、不复制目录列定义；由目录/装配消费两包公开入口并交入真实函数，避免新增 CCL↔directory 包依赖环。该内部 ref 只在受限组件间流转，不新增 modelCatalogRead 返回字段。

`expectedRef` 来自 P-1r 同一个单元里的真实目录选择，不能由外部用户任填后直接换 body。函数是 S-13 取出副本在目录 S-20 消费边界上的受限投影；**原 S-13 不增加 ref 参数或新资格要求**。原 generic storeReplica 无来源证据，每次写入必须将 source_ref 清空，并使用原 tenant-only AAD 封存格式；不能保留上一次来源标记。原 generic readReplica 照旧能读该 tenant 的合法条目，包括带 source_ref 的新格式条目；新格式按已存 source_ref 重建 AAD，不改成 absent；其成功 body 只能交给原具名消费者。通用写入后目录窄读答 absent，明确反映来源未证，不把旧 API 静默升级为已证明当前绑定。

构造许可与执行许可分别检查，不能因为 bootstrap 需要构造闭包就准许它直接读取目录内部引用。本批符号级边界如下；表中未列的模块不获许可，未来送达入口须另有具名采用后才能加入。

| 符号 | 本批 import / 构造许可 | 返回闭包的执行许可 |
| --- | --- | --- |
| directory `./tx-reads` 的 `createCredentialBindingReader(storage)` | `apps/model-request-acceptance` 的可信装配/bootstrap 可导入并调用工厂，向 CCL/P-1r 传递同一真实 reader；CCL **不 import** directory | `readCredentialBindingIn(unit,tenant)` 仅由目录 P-1r 与 CCL 模型副本构件执行；bootstrap 只能构造/传递，不得执行或呈现返回的 ref |
| CCL `./model-replica` 的 `createModelReplicaCustodian(...)` | 同一可信装配导入并构造唯一实例，持有关闭权；目录仅借用构造依赖，不在重跑时再建 | 下三行分别限定，不因持有完整对象自动开放所有成员 |
| `storeBoundReplica` | 不另建实例；bootstrap 借用装配拥有的写闭包 | 仅上述 bootstrap 实際导入 source pair 的写入路径；未来中心送达 owner 未定义，本批不预先放行 |
| `readBoundReplicaIn` | 目录 P-1r 取得装配交入的读取闭包 | 仅 P-1r 在其共同单元内执行；CCL 内部实现可委派同包构件，不给 bootstrap 直接读 body |
| `close` | 装配持有唯一实例的关闭闭包 | 仅该装配 owner 执行；P-1r 与 bootstrap 借用者不得关闭共享实例 |

普通 runtime、工具、日志、配置展示不能直接导入技术取值子入口；runtime 仍只消费目录 credentialLookup。结构 guard 同时检查具体导入符号、构造点、闭包传递及调用点，正例必须允许 bootstrap 构造并传递，负例分别覆盖 bootstrap 执行 reader、P-1r 执行 close、CCL 反向 import directory；不能只按包目录做一个允许列表。受信同进程代码可反射/读内存，子入口或 Cordis isolate 不是沙箱。

## 真实写入、当前取值与共同对象

**真实来源**：验收装配使用已实现的 account-registration/account-identity/organization-governance 公开能力建立实际账号、登录状态和有效 tenant，使用实际取得的 LoginStateId，不造品牌值或恒真身份服务。可信 bootstrap 从本次明确输入的凭据源取得并持有 `(sourceRef, body)` 对，以真实目录 bindCredential 为该租户设置引用，再调用 storeBoundReplica；二者是两个可见步骤，中间可暂时取不到值。它核 `tenant.account` 属于该据点账号及真实登录状态；本节点不把这项前提再变成每次读时资格核验。此路径只验证本机显式发布，不声称已从中心取值或已闭合 CCL G-5/G-6/G-7。不能给任意旧 body 在读取或迁移时贴上新引用。

候选副本表仍为 `credential_custodian_replica`，主键 `(tenant_organization, tenant_account)`。在原 login_state/stored_at/sealed_body 上加可空 `source_ref`：旧行及 generic 写入为 SQL NULL；只有带实际来源的技术写入填值。一次提交同时替换四项，不存在先写 body、随后补 source_ref 的窗口。没有独立“当前来源”旁表。新增来源关联的封存格式版本将 tenant 与 sourceRef 的确定编码都放入 AAD；旧封存格式只能对应无来源行。把旧密文复制后仅改 source_ref 不会成为可读新格式，源标记改动/跨租户移动须开封失败。通用读须按真实格式开封，不能依赖新 source_ref 默认值改释旧密文。

共同存储对象明确为：**目录 owner 写的 `model_credential_binding(tenant)` 行，加本节点 owner 写的 `credential_custodian_replica(tenant)` 行**。目录 bind/unbind 与来源校验写入在同一真实绑定行上排序；CCL 只经目录 helper 锁定读该行，不修改它。source_ref 不建指向当前绑定的外键：轮换/解绑允许留下旧副本，且不应阻止目录改变绑定；安全来自取值时同单元比较和认证密文，不来自自动级联删除。两包同一 AtomicStorage 实例为前提，assertStorage 不接受“不同实例恰好同文件”。对应目录 R3-7/R3-8，双方都登记要求。

写入次序：表示校验、准入、现读密钥与 clock、封存 → atomic → 真实 binding 行锁定读 → 若与 sourceRef 不同则不写 → 相同则写副本整行 → 单元真实结束才对外确认。不可在共同单元内调用目录 bindCredential、通用 storeReplica 或另一个普通 storage.write。参与函数异常必须传播到单元唯一终结边界，随后由外层做安全失败映射，不能吞异常后提交半份。

读取次序：目录在一个 atomic 单元选择真实当前租户绑定 → 调 readBoundReplicaIn；CCL 核同实例、现读密钥、经同 helper 再核当前绑定、读取同 tenant 副本与来源并比较/开封。单元内操作顺序 await，不并行跑子操作。此处 **Unit.query 只是一种类型视图**，当前保证依靠实际 binding 行锁；SQLite 的 BEGIN IMMEDIATE 还覆盖其写者排序，不用“同一个 Unit”四个字代替机制。P-1r 在 atomic 真正退出之后才把 body 交 runtime；操作自有 key/body 不写盘、不交 afterCommit 通知、不缓存至下一次请求。轮换排在已开始读取之后时，该次仍可交原匹配值；下一次取值必须见新绑定，不能延续旧 body。

两条反例必须真跑：① A/refA 已写，目录轮换 refB，迟到的 refA 来源写入排在轮换之后，必须不覆盖；此时 value 不交 A，直到真实 refB/bodyB 入库。② 读取锁到 refA 后，另事务准备改 refB；该次只能在锁的次序中交完整 A 或得到完整 B/不可用，不能凭前次 present=true 后读取无 ref 校验的残留 A。移除来源比对、将 generic 写入保留来源、或锁前读后直接使用都应被对应负控检出。解绑后的旧副本不恢复租户分支；只由目录 S-20 在确无绑定且 official 时选择 factory。

## 存储要求与模式范围

旧 [K-1～K-9](design.md#对存储提供者的要求清单) 对完整插件不变；新增模型窄组件要求如下，不另选数据库。

| 编号 | 要求与条款 | owner / 共同对象 |
| --- | --- | --- |
| K-M1 | 目录3 S-19/S-20：绑定选择、来源比较与副本取得能和 bind/unbind 排序 | 同实例 StorageUnit、真实 model_credential_binding tenant 行锁与 replica 行；互指目录 R3-7/R3-8，不抄私有 schema |
| K-M2 | CCL2 S-5/S-7/S-12：密文、source_ref、login_state、stored_at 整行提交；来源与密文不可拆 | 本节点副本主键及新格式 AAD；generic store 明确清来源；旧行迁移只加 NULL，不回填当前 ref |
| K-M3 | CCL2 S-13～S-15：通用读/丢弃保留原语义；按登录状态删除与重归属在副本行排序 | 复用旧 K-1/K-2/K-6；不要求目录删除旧副本，不用当前登录状态限制读 |
| K-M4 | CCL2 S-7/S-9/S-20：不可用可辨、重开留存、参与异常到共同终结边界 | 同一真实 storage、迁移守卫、原持久档位；运行期密钥不可读不假 absent；不作跨库/跨账号复制保证 |

**完整插件**继续提供 credentialCustodian 六操作，需真实桥 `./tx-reads`、桥先行迁移、OAuth 外键、同 clock/TTL 及清扫调度；不得以空桥服务、空 binding 表或总是 notResolvable 的替身开闸。本轮不交付 OAuth 用户流程，也不能因此删掉完整插件的这些依赖。完整插件的缺钥政策仍是两张条目表都空才生成，不能只查 replica 表。

**model-only factory** 是同包技术子入口提供的较窄组件，只提供上表两个副本技术动作与关闭，不 provide credentialCustodian，不宣称 CCL2 六操作/清扫已交付。它只采用 replica 迁移片段；OAuth 片段仍由完整插件按原顺序采用，不制造假的桥表来满足迁移。model-only **要求预置且通过真实校验的 keyFile**，缺席直接启动失败，绝不以未检查 OAuth 表为由自动造新钥。运行期每次取钥仍沿 S-7；配置/制品非法与本批一致为启动失败。该窄组件没有 sweepInterval、oauthPendingTtl 或后台清扫，不给它们虚假默认值。若装配需要旧 generic 操作或 OAuth 能力，必须转用真实完整插件并通过其全部依赖验收，不能把窄对象断言成完整接口。

keyFile 仍为本据点实际独立文件，沿旧普通文件、32 字节、0600、同句柄检查规则；不是只存在于 JS 对象里的“keyring”替身。装配负责与真实账号/据点身份对应的 storage 与 keyFile 路径，其他账号的存储/密钥不借用。无凭据时不会生成“能发模型”的默认值；factory 凭据仍由目录装配另管。

## 失败、观测与生命周期

### 技术结果、异常与借用者映射

下表是本候选**显式选择的提供者投影**，须随本增量采用；不是声称 CCL2 已定义两个新领域操作。独立写复用原 invalidInput/custodianWithdrawn/unavailable 口径，参与读复用已采用 StorageUnit 异常污染及外层映射边界，不新增领域失败名或新的异常类。现有公开 `mapStorageError(error, unavailable)` **仅映射 StorageUnavailable**，其余三型及其他异常重抛；已核 `core/storage` 公开实现及 [参与采用](../../core/storage/design.md#p-13-显式共同事务扩展)。本表不改变其重抛语义。

`storeBoundReplica` 的正常结果闭合为 `{ stored: true, tenant } | { stored: false } | { failure: invalidInput | custodianWithdrawn | unavailable }`。`readBoundReplicaIn` 的正常结果闭合为 `{ body } | { absent }`，**没有正常返回的 failure 成员**；下列失败以异常逃出其 unit.run，最终由 P-1r 的外层 atomic catch 处理。普通外部 tenant/origin 参数仍由目录入口先校验，形状非法沿目录 invalidInput；已经进入技术读取的 tenant/expectedRef 应来自已校验输入与真实 reader，形状非法表示内部边界缺陷。

| 情形 | storeBoundReplica | readBoundReplicaIn / P-1r 外层 |
| --- | --- | --- |
| loginState/tenant/sourceRef 缺席或形状非法；body 不是非空字节序列 | `{ failure: invalidInput }`，不读密钥/clock、不建 atomic；sourceRef 严格用既有 CredentialRef 表示判定 | 本方法不收 loginState/sourceRef/body；tenant/expectedRef 缺席或非法抛 `StorageDefect`（固定诊断），不把内部坏引用伪装为 credentialUnavailable 或外部 invalidInput |
| component 已 close 或停止准入；正常输入尚未进入其操作 | `{ failure: custodianWithdrawn }`；进入 atomic 前再次核准入 | 抛 `StorageUnavailable`（固定 component-withdrawn 阶段，无引用/值）；必须退出共同单元，P-1r 外层映射 `{ failure: unavailable }`，不当 absent |
| 运行期 keyFile 不可读/不合既定规则 | `{ failure: unavailable }`；若已进入撤除并尚未入事务则沿上行 | 在 unit.run 内抛 `StorageUnavailable`，整单元不可提交；外层映射 unavailable。不是密文认证失败那一支 |
| clock.now() 返回 unavailable | `{ failure: unavailable }`，不建写事务；返回前若未入事务且已撤除，沿上表 custodianWithdrawn；其他 clock 程序异常走缺陷边界 | 读取既有副本不取 clock，clock 当前不可用不改变此读；不能新增“每读都核时钟”的隐藏前置 |
| 已确认目录无绑定，或当前 ref 与写入 sourceRef 不同 | `{ stored: false }`，已取得的共同单元正常结束但不写副本 | 已选 tenant 分支后来缺绑定、三引用不等、无副本、source_ref 为旧行 NULL，或密文打不开 ⇒ `{ absent }`；外层 atomic 成功后映射 credentialUnavailable，不重选 factory |
| 匹配且写/读完成 | 真实提交后 `{ stored: true, tenant }` | 暂交 `{ body }` 给 unit owner，**只有外层 atomic 成功退出**后 P-1r 才交 `{ scope: tenant(T), value }`；退出失败即不交 body |
| `StorageUnavailable` 来自绑定 reader、SQL 或共同单元结束 | 先退出自身 atomic，再经 mapStorageError 映射 unavailable；若撤除已开始且事务因此无结论，沿旧 S-20 口径为 custodianWithdrawn，提交与否不确知 | 原异常逃出 run/atomic，再由 P-1r `mapStorageError(error, 'unavailable')` 映射；禁止在 unit 内转换后正常返回或继续提交 |
| `UniqueViolation` | 副本键采用原子整行 upsert；本技术操作没有额外业务冲突分支。意外违反原样按类型抛出至外层安全边界，不当 stored:false，不自动重试 | 查询不应产生唯一冲突；仍抛出，不经 mapStorageError 折成 unavailable。P-1r 不报告 credentialUnavailable |
| `ReferenceViolation` | 本模型来源关联无外键拒绝业务分支；抛出，不冒用 OAuth bindingUnknown，不折不可用/不匹配 | 同左，属于真实组件/迁移缺陷，不转换业务失败 |
| `StorageDefect`；持久行非可缺席字段形状非法；reader 返回不合约值 | 抛出缺陷，不写默认副本 | 抛出缺陷，不交 body，不折 unavailable/absent |
| Unit 不是合规参与对象、属于别的 storage 实例、已结束/过期、在回调/活跃帧之外使用、并发重叠使用 | 写操作自建 unit，不接外部 unit；若内部组合触发这些错误，按 `StorageDefect` 抛出 | 沿真实 unit.run/assertStorage 的 `StorageDefect` 拒绝，活跃单元被污染；已结束单元不撤销其先前提交。P-1r 将其作为装配/调用缺陷暴露，不改成 credentialUnavailable |
| 其他程序异常 | 外层安全边界暴露缺陷，绝不 catch-all 为 unavailable | 同左；借用者不能因发生在运行时路径就降格为业务结果 |

原四型抛出必须先让共同单元实际退出、回滚/排空；外层安全边界再剥离动态 message、cause、数据库键值，仅保留四型类别、固定阶段与已登记约束名。若需重建安全异常，仍为同一失败类别而不改变 `mapStorageError`；不把可含秘密的原异常传给 logger 或再作为 cause 携带。未知程序异常以固定无值缺陷诊断暴露；没有“其它业务失败”分支。表内判断顺序是写入表示层→撤除准入→key/clock→单元内比较/写入；读取先检参与对象/同域，再在有效 unit.run 内校验内部参数、组件准入、key 和真实绑定/副本；这些异常都须逃出 run 使单元不可提交，不能在 run 外提前返回失败对象。已有事务错误不得被后续状态覆盖。

`createModelReplicaCustodian` 的构造/配置/密钥准备失败沿既定启动失败政策抛出，不返回 store/read 的结果；不发布半成品。`close(): Promise<void>` 幂等地关闭准入并等待实际在途结束，重复调用等待同一次排空；正常完成仅为 void。清理遇到真实资源释放缺陷时安全抛出，owner 保留未结束资源责任，不能把发出取消或一次失败当已关闭。已进入工作成功完成仍保留实际结果，不因 close 回写“未提交”；单元尚在外层运行时仍由 P-1r/装配 owner 等待，close 不替其宣布完成。

所有路径无隐式重试、中心查询或 factory 回退；是否再次发布由持有真实来源的 caller 决定。

观测按 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md)：记录发布/取值阶段、已核租户关联、source_match 布尔、结果类别、参与单元实际结束和撤除阶段。body、key、sourceRef/expectedRef/当前 ref、密文均不入日志、trace、错误详情或指标标签；来源无法匹配只报有界原因码，不用引用 hash 变相呈现。观测故障不能把业务失败变成功或声称事务已结束，诊断端口权限、限额与保留由装配配置。

| 取得的资源/贡献 | owner 与可用时点 | 部分失败 | 撤除及保留 |
| --- | --- | --- | --- |
| replica 迁移与实际 keyFile | 存储/装配；升级确认和密钥检查后创建闭包 | model-only 缺钥失败且不生成；迁移失败不开放读写 | 不删表、不删钥；不是实例临时资源 |
| model-only 闭包与真实 binding reader | `apps/model-request-acceptance` 的显式装配 effect；传入 P-1r 的构造依赖，不注册假 credentialCustodian | 构造失败释放本次取得的句柄，不回滚已发布目录/副本事实 | 单个组合 cleanup 先停新操作，再 await 所有在途；P-1r 不拥有副本持久数据 |
| 每次 key 文件句柄、操作自有字节与参加的 unit | 本次操作持有句柄；共同事务归 directory/外层 atomic owner | 所有分支 finally 关句柄；清除可控临时 Buffer，不声称 JS/系统内存可证明抹除 | 取消请求不等于单元结束；wait 至实际提交/回滚后释放，已交 runtime 的值由其本次调用拥有 |
| full 插件原服务、定时器与在途工作 | 原单 fiber / 单 effect | 沿旧装配收口，不启动假清扫 | 旧 S-20 与原撤除表全部保留；无模式切换自动删除数据 |

装配关闭顺序为 runtime/P-1r 停止新取值并等实际调用，随后关闭 model-only factory，最后关闭 OG/storage/clock 等借用依赖。组件只等待自身进入的工作；参与方法返回后外层 unit 尚未结束时，外层 owner 仍持有结果，不能先交 body 或关闭共享 storage。完整插件模式沿原桥先停、custodian 后停的顺序。不能同时把 full 与 model-only 两个独立生命周期对象用于同一组装配来源而不明确唯一 owner。

Cordis 采用 4.0.4（D-025）。[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)、[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)仍是机制依据；已有 probe 不验证本组合。model-only 不借条件 optional inject 隐藏 MCP 缺依赖。原 provide 纳管主张及 Node crypto/fs 的 CCL-11/12 前提仍待对应实际证据，不据本稿升格。

## 关键选择与缺口

| 选择 | 落选方最强论证 | 本方弱点与复查信号 | 置信度 |
| --- | --- | --- | --- |
| tenant 副本附写入时 sourceRef；generic 接口不改 | 把当前 ref 在读时附上不需迁移；直接收紧 readReplica 最少接口 | 新格式与来源迁移需验，旧无来源副本不能供新目录成功取值 | 高：旧接口不包含来源，贴标不能证明对应；完整 generic 兼容语义有明确测试 |
| 共同单元锁真实目录行、比较来源后读/写副本 | present 后 tenant-only 读取开销小，独立事务耦合低 | 多一次锁定读，潜在写者排队；SQLite 先行，PG 真并发未验 | 高：RefA→RefB 的反例可重复，时间戳/内存锁不能保护真实绑定 |
| 注入真实目录事务函数，保持包依赖单向 | CCL 直接导入目录 helper 更容易接线 | 构造边界须通过结构与真实制品测试防止传恒值函数 | 中高：公开组件可独立组合，不复制目录私有列，也不增相互包依赖 |
| model-only 组件与完整六操作插件分清；窄组件预置钥 | 做空桥实现便于装入完整插件；窄组件只查 replica 空便可造钥 | 装配多一步真实密钥准备；窄组件不能冒充完整 CCL，覆盖必须分记 | 高：不隐藏 OAuth 迁移/清扫义务，也不因未检查的密文存在而换钥 |

| # | 缺口与条款 | owner / 受阻范围 | 闭合条件 |
| --- | --- | --- | --- |
| MCR-1 | 本候选未接受、源码未建；目录真实 ./tx-reads 与副本组件尚无制品 | 本节点、directory、主线；本机租户凭据成功链 | 两节点有限独立评审/采用，MCR-V1～V8；不以目录 present=true 验收 |
| MCR-2 | CCL2 S-12/S-15 来源与登录结束的产品送达 G-5/G-6/G-7 仍未定义 | 未来资产/据点入口；中心同步/正式轮换传播 | 本轮明确 bootstrap 只提供实际本地 pair，不冒充中心协议；生产链另有契约 |
| MCR-3 | CCL2 S-16～S-18 的真 MCP 事务函数/迁移仍未实现 | mcp-bridge 与本节点；完整 CCL 插件 | 原 S-25/S-28/N-1/N-10 全部实现验证；model-only 通过不关闭此项 |
| MCR-4 | keyFile、真实账号/登录/tenant/source pair、迁移及关闭次序归新验收装配 | `apps/model-request-acceptance`；该装配尚未成稿 | 点名真实提供者和部署路径，违规调用点负控、跨账号拷贝与零泄漏/零误发证据 |
| MCR-5 | 来源格式与加密/文件上游取证、PG 锁交错、实际撤除均未验 | 本节点、storage/directory owners | 真文件库、真实密钥、MCR-V2～V6；已有 Sweep 模型不覆盖来源引用或此组合 |

没有发现必须增加领域操作才能实现本次来源保护的要求；本稿仅把已有目录取值与保管组件接到可核对的技术边界。若后续要把 sourceRef 写入提升为用户操作、中心送达或通用身份授权服务，必须回相应契约，本候选不作该承诺。
