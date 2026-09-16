# Tenant 治理提供者设计映射

消费 `capability.tenant-governance@1`，并固定 S 的 `data.core-work@1`、`capability.durable-records@1`、
`composition.core-work-coordination@1` 与 `capability.engineering-observation@1` 所需条款。
旧 `f98ac926`/`058c77c` 接受只说明 legacy 施工来源，不接受本 baseline 坐标或候选插件。
状态转移、失败语义与重载细节见[当前协议](protocol.md)，其内容同样保持 candidate。

## 实现路径与来源

来源 `packages/governance/tenant/design.md`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）在 legacy 仓库已区分现有实现和目标设计；本包只提取
持续映射，不把源设计状态提升为当前实现符合。共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。


## 能力到 Cordis 的候选投影

| 契约责任 | 候选公开面 | 当前事实与缺口 |
|---|---|---|
| TG-01～TG-03 | `createTenantHost`、`TenantPlugin` / `omneTenant` | host/plugin 无可调用实现；关闭、最后最高管理者、重加入防复活及 tenant 隔离只在设计中 |
| TG-01 统一个人创建 | 两个受信入口 `initializePersonalForDeployment` / `createPersonalForAccount`，共用原操作查询 | 首次 bootstrap 记录 decoder/fold 不能证明后续受信导入、同门排位或双来源恢复；Host 和端口未实现 |
| TG-04～TG-05 | definition/entitlement/acquisition 管理与 `registerReferenceSource` | 值/记录设计已定；引用 owner、当前权益、发布与选用运行门未组合 |

## 所有权、失败与撤除

TenantHost 是 TG 状态权威；租户事实按 tenant 分区，个人唯一 claim 属于 Tenant 的
global system index。自然人身份由账号权威提供，membership 只表达 tenant 内资格。
普通业务准备和最终 gate 重核相应可信主体、membership revision、定义/权益/选用及
provider 代次；个人创建的短门只读已耐久导入的 Account 原后果和 Tenant/Admission
当前根，不同步调用 credential provider。Context、DTO 或菜单选择不构成授权。
成员暂停/移除在 logical 位置
封闭后续准入，耐久后才可作为正向权利依据；重加入形成新 joinedRevision，旧 grant 不复活。
个人租户的 owner 管理入口及 `closeTenant` 另有同门守卫：发起凭据解析出的
`UserRef` 必须等于当前唯一 owner，Account 对该账号的 `active` 状态须已有可信
耐久确认并在本次逻辑位置可核验。Host 不接受 pending、其他账号、seed/系统
标签代替；首版无系统关闭绕过。个人 owner 不可被普通 member 变更暂停/移除，
关闭后清理归 TG-03。Account active 证明如何进入本协调域的当前根、如何与
actor/owner 修订同门核验仍需 Account/CC provider 映射；缺席时相关操作
unavailable，不能以旧创建回执或 TTL 缓存放行。

两个受信入口共用 TenantHost 的一份个人创建 operation/claim 状态机。Host 先按原
operationRef 查询占位与耐久结果；同输入重入沿原 target，不重新分配，也不重跑
首次 init/pending 前态。部署入口只由受信 Host 安装资格取得 seed 与当前初始化前态，
还须核 Account 已耐久分配且不复用的初始 `UserRef`、唯一凭据绑定、一次创建后果
与 seed/target 的受信绑定；seed 字符串本身不能生成 `UserRef`。两种来源的 target
按 TG-01 的注入式、域分离规则由账号权威命名空间、入口种类和 CD-02 完整原操作引用确定，
并由 Account 首次耐久原操作绑定；其提交 unknown 时先核实，确认未提交才按
同输入重备。本机缓存不构成 target 冻结事实。两个入口均只读取 CC-05 已核实
并**耐久导入**的
Account 原始后果，核对 source identity/version、原操作、摘要、`UserRef`、target
及凭据标识唯一绑定已成立；目标沿来源事实固定。较早的 pending 分配、凭据碰撞、
未核实/未耐久导入均不得创建。短门读导入事实与 Tenant/Admission 当前根的确切
水位，不等待 Account provider I/O。导入投影是来源引用，不成为第二份账号权威；
Account 暂时不可用不撤销已导入后果，旧 provider/协调者实例也不能因此取得新代
写入资格。sourceFact 身份、版本、水位与 target 的具体传输/校验由 Account/CC 提供者
闭合；init 来源如何在 Tenant 权威未建立时导入和 seed 绑定也由该纵切闭合，
此处不把业务 DTO 或客户端 origin 当成证明。

受信装配只为一笔冻结个人创建颁发精确混合流资格，绑定来源、operationRef、摘要、
`UserRef`、target、精确 stream 集合/预期修订、Tenant Host 与本代 Admission/writer；
init 为 system `tenant-bootstrap` + system `tenant-personal-index` + 目标
`tenant:<tenantId>` 三流，注册仅后两流。后者仍属目标租户，不能改记 system；
`operationKind`/owner 字符串和反序列化 envelope 不可取得凭据。准备资格必须核对
Account 后果已耐久绑定 target；不能先发无目标的跨 scope 许可。当前
DR-01/CC-03 候选已声明统一封闭许可及 conflict target 持久表示；真实
writer/Admission/TenantHost 尚无符合性证据，注册入口保持 unavailable，不能
拿旧 bootstrap 诊断字段或历史记录当作新代资格。

逻辑 root 仅保留原操作/个人索引占位和负向封闭；未耐久 `tenant.created`/owner
成员不能进入准入可读正向根。一个批次的 personal-index claim、personal tenant、
creator 和唯一 active owner 必须同批核对，init 再核 bootstrap 事实与 seed；注册
再核 sourceFact 与同操作绑定。sync 失败、unknown 和 committed_blocked 不开放新
资格。恢复先以完整前缀逐批校验二/三流关系与业务唯一性，再候选 fold；CC-06
恢复宿主一次安装全部 owner roots 后，Tenant 本代查询才可给另立的可消费证明。
历史提交结果、publication 可消费证明和当前 tenant/owner 资格分别读取；旧创建
租户后来 closing/closed 只保留历史认回，不让旧回执恢复业务准入。
本创建不附带组织成员关系；个人创建 sourceFact 只授权原个人创建，不能充当
账号 active 或独立组织入会的业务证明。普通业务使用仍核 Account active 与当前
Tenant 资格；本纵切不扩张独立组织入会政策。

撤除先关本代新调用，收口引用 source 与 pending/unknown operation，再释放精确注册。来源不明
返回 unavailable/complete=false，不当空集合；关闭租户保留外部效果、财务责任与历史身份。


## 依赖与共同门

提供者候选组合依赖为：ARI-1；CD-01/CD-02；AI-01/02/02a/04/08 的来源绑定；
DR-01～DR-05；CC-01/02/03/05/06；OB-01～OB-03。下游 ACR-03～06 消费本
Host 的回执/可消费证明以完成激活，不是 Tenant 的反向依赖。其中 DR、OB 与运行
身份是提供者实现依赖，不能由本页擅自改 catalog；TG 新消费 Account 来源与 CC
导入，待统一集成时登记精确坐标/条款和消费者映射。

| 输入 | 使用范围 | 缺席/换代 |
|---|---|---|
| 列出的 ARI/CD 条款 | 稳定身份、tenant、因果、冻结输入 | 结构有效不代表当前资格；不补造身份 |
| AI 与 CC-05 导入 | Account 原始后果和稳定 target；ACR 是回执的下游消费者 | 未核实/未耐久导入不得排位；已导入后 Account 暂时不可用不撤销后果 |
| 列出的 DR 条款 | 原操作、耐久回执、恢复/unknown、writer 换代 | 未核实写入保持 unknown，不能换 key 重试 |
| 列出的 CC 条款 | prepare、同门检查、共同提交、publication 与恢复 | blocked/unknown 不执行效果；通知不是状态权威 |
| 列出的 OB 条款 | 关联、拒绝/unknown 与 gap | 普通诊断失败不改业务事实；关键审计失败在效果前 fail closed |

具体 Cordis API 和生命周期仍须在采用版本核对；这里不声称候选 service/plugin 已存在。
