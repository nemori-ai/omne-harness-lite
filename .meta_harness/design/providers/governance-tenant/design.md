# Tenant 治理提供者设计映射

消费 `capability.tenant-governance@1`，并固定 S 的 `data.core-work@1`、`capability.durable-records@1`、
`composition.core-work-coordination@1` 与 `capability.engineering-observation@1` 所需条款。
旧 `f98ac926`/`058c77c` 接受只说明 legacy 施工来源，不接受本 baseline 坐标或候选插件。
状态转移、失败语义与重载细节见[当前协议](protocol.md)，其内容同样保持 candidate。
个人创建的单机映射采用[候选 B](../../proposals/account-personal-local-creation/design.md)；
精确行为以同 baseline 的 TG/AI/CC/DR 候选规格为准，提供者采用仍未验证。

## 实现路径与来源

来源 `packages/governance/tenant/design.md`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）在 legacy 仓库已区分现有实现和目标设计；本包只提取
持续映射，不把源设计状态提升为当前实现符合。共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。


## 能力到 Cordis 的候选投影

| 契约责任 | 候选公开面 | 当前事实与缺口 |
|---|---|---|
| TG-01～TG-03 | `createTenantHost`、`TenantPlugin` / `omneTenant` | host/plugin 无可调用实现；关闭、最后最高管理者、重加入防复活及 tenant 隔离只在设计中 |
| TG-01 统一个人创建 | 受信 init 与后续注册共用 Tenant 的个人创建及 T 查询；具体入口签名待 provider 固定 | 已有 bootstrap/personal-index decoder/fold 属旧实现形状，不能证明 F 受信读取、目标单流排位或双来源恢复；Host 和端口未实现 |
| TG-04～TG-05 | definition/entitlement/acquisition 管理与 `registerReferenceSource` | 值/记录设计已定；引用 owner、当前权益、发布与选用运行门未组合 |

## 所有权、失败与撤除

TenantHost 是 TG 状态权威；个人唯一性由 `personalTarget(UserRef)` 的注入映射、
与组织租户不相交的 ID 空间以及目标 tenant 流首个个人创建事实共同保护。自然人
身份由账号权威提供，membership 只表达 tenant 内资格。
普通业务准备和最终 gate 重核相应可信主体、membership revision、定义/权益/选用及
provider 代次；个人创建在短门外经同进程当前受信 Account 读面取得完整 F，
短门只核冻结的 F 绑定与 Tenant/Admission 当前根，不等待 Account 或 credential
provider I/O。Context、DTO 或菜单选择不构成授权。
成员暂停/移除在 logical 位置
封闭后续准入，耐久后才可作为正向权利依据；重加入形成新 joinedRevision，旧 grant 不复活。
个人租户的 owner 管理入口及 `closeTenant` 另有同门守卫：发起凭据解析出的
`UserRef` 必须等于当前唯一 owner，Account 对该账号的 `active` 状态须已有可信
耐久确认并在本次逻辑位置可核验。Host 不接受 pending、其他账号、seed/系统
标签代替；首版无系统关闭绕过。个人 owner 不可被普通 member 变更暂停/移除，
关闭后清理归 TG-03。Account active 证明如何进入本协调域的当前根、如何与
actor/owner 修订同门核验仍需 Account/CC provider 映射；缺席时相关操作
unavailable，不能以旧创建回执或 TTL 缓存放行。

两个受信入口共用 TenantHost 的一份个人创建 T/目标占位和结果状态机。Host 在门外
从当前受信 Account 服务按 `sourceRef` 读取完整且不可变的 F，核版本、`entryKind`、
`UserRef`、target 和 Account 来源真实性；未发行 F、Account 缺席、较早 pending 分配、
凭据碰撞或客户端自填字段都不得准备新 T。`personalTarget(UserRef)` 按 TG-01
编码重算，必须与 F.targetTenantId 相同。T 由 F.sourceRef 注入式派生，规范输入
C 仅含 TG-01 指定的公开 F 字段；`inputDigestT` 只由 C 计算，不复用 Account 私有
A 或 digestA。Host 先按 T/C 查询占位与耐久结果；同输入认回，异输入拒绝。
受信 init 的一次性资格由 Account AI-08 核实；Tenant 另核已证实的空 Tenant 根，
不从 seed 字符串、writer epoch 或物理空文件推定初态。Account 在一次受信读取后
暂时失联，不撤销同代已冻结的 F；host/owner/writer 换代后须重新读取同一 F。

当前代短门核 F 绑定、目标流空前态、唯一 personal/owner、init 的空 Tenant 根及
host/owner/writer generations；门内不等待 Account I/O。Tenant 经普通 DR-01
单租户提交向 `tenant:<target>` 的一个 append 同批写个人租户、creator 与唯一
active owner 成员。不同 UserRef 的目标流互不竞争；两个不同 F 声称同一 UserRef
时仅一个 T 可占该目标首位置，另一 T 得到自身 durable conflict，不能认回前者。
业务字符串、反序列化 envelope 与旧代准备均不能取得当前写入资格。当前
writer/Admission/TenantHost 尚无此映射的符合性证据，个人创建入口保持 unavailable。

逻辑 root 仅保留原 T/目标占位和负向封闭；未耐久 `tenant.created`/owner
成员不能进入准入可读正向根。同一目标 append 的个人租户、creator、唯一 active
owner 事实须逐项核对；init 另核 Account 受信来源和初始空 Tenant 根。sync 失败、
unknown 和 committed_blocked 不开放新资格。恢复先以完整前缀逐条核对目标流
中的 F/T/C 绑定和唯一性，再候选 fold；CC-06 恢复宿主一次安装全部 owner roots
后，Tenant 本代查询才可给另立的可消费证明。
历史提交结果、publication 可消费证明和当前 tenant/owner 资格分别读取；旧创建
租户后来 closing/closed 只保留历史认回，不让旧回执恢复业务准入。
本创建不附带组织成员关系；个人创建 sourceFact 只授权原个人创建，不能充当
账号 active 或独立组织入会的业务证明。普通业务使用仍核 Account active 与当前
Tenant 资格；本纵切不扩张独立组织入会政策。

撤除先关本代新调用，收口引用 source 与 pending/unknown operation，再释放精确注册。来源不明
返回 unavailable/complete=false，不当空集合；关闭租户保留外部效果、财务责任与历史身份。


## 依赖与共同门

提供者候选组合依赖为：ARI-1；CD-01/CD-02；AI-01/02/02a/04/08 的来源绑定；
DR-01～DR-05；CC-01/02/03/06；OB-01～OB-03。下游 ACR-03～06 消费本
Host 的回执/可消费证明以完成激活，不是 Tenant 的反向依赖。其中 DR、OB 与运行
身份是提供者实现依赖，不能由本页擅自改 catalog；TG 的个人创建直接消费
Account F 受信读面，不消费 CC-05 导入。其他真正需要耐久交接的路径仍可消费通用
CC-05；待集成时登记精确坐标/条款和消费者映射。

| 输入 | 使用范围 | 缺席/换代 |
|---|---|---|
| 列出的 ARI/CD 条款 | 稳定身份、tenant、因果、冻结输入 | 结构有效不代表当前资格；不补造身份 |
| AI 受信 F 读面 | Account 原始后果、稳定 target、AI-08 init 资格；ACR 是回执的下游消费者 | 未发行 F 或新代 Account 缺席不得准备；同代已冻结 F 不因短暂失联撤销，换代须重读 |
| 列出的 DR 条款 | 原操作、耐久回执、恢复/unknown、writer 换代 | 未核实写入保持 unknown，不能换 key 重试 |
| 列出的 CC 条款 | prepare、同门检查、共同提交、publication 与恢复 | blocked/unknown 不执行效果；通知不是状态权威 |
| 列出的 OB 条款 | 关联、拒绝/unknown 与 gap | 普通诊断失败不改业务事实；关键审计失败在效果前 fail closed |

具体 Cordis API 和生命周期仍须在采用版本核对；这里不声称候选 service/plugin 已存在。
