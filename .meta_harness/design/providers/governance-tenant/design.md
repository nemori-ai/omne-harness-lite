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
| TG-04～TG-05 | definition/entitlement/acquisition 管理与 `registerReferenceSource` | 值/记录设计已定；引用 owner、当前权益、发布与选用运行门未组合 |

## 所有权、失败与撤除

TenantHost 是按 tenant 分区的唯一 TG 状态权威；自然人身份由可信身份边界提供，membership
只表达 tenant 内资格。准备和最终 gate 必须重读 credential、membership revision、定义/权益/
选用及所有 provider 代次；Context、DTO 或菜单选择不构成授权。成员暂停/移除在 logical 位置
封闭后续准入，耐久后才可作为正向权利依据；重加入形成新 joinedRevision，旧 grant 不复活。

个人 bootstrap 的应用装配凭受信 TenantHost 安装资格发起一次精确操作。Host 先冻结
不依赖新 tenantId 的原始输入并查询精确 operationRef：已准备者沿原绑定认回，不再
生成新 tenantId；首次占位者才生成 tenantId，在共同门内将该目标与原操作一起固定。
受信装配颁发仅绑定该 Host 实例、operationRef、输入摘要、
新 tenantId 和本代 Admission/writer 的窄凭据；`operationKind=tenant.bootstrap` 与
`owner=tenant` 只是诊断字段，不能作为凭据。若现有 prepare API 先于新 tenantId 分配，
施工须调整目标分配/准备顺序或受信原子绑定，不允许在无目标身份时颁发泛用跨
scope 权限，也不能让同一原操作重试因重新抽取随机 tenantId 而变成异输入。
普通业务对象不能取得颁发接口，凭据不得序列化为可由外部注入的许可信号。

同一批次提交 system `tenant-bootstrap`、system `tenant-personal-index` 和新建 tenant
`tenant:<tenantId>`。逻辑 root 只保留本次初始化/个人索引占位与负向封闭，不将尚未
耐久的 `tenant.created` 成员放进准入可读的正向根；即使延迟 fsync，读取资格也应
失败或返回未开放。耐久发布同时开放 owner 资格；失败/unknown/blocked 保留占位，
不得授予管理权限。恢复先核对三条事实处于同一 batch，seed user、claim tenantId、
creator、owner/member 唯一性与个人种类全部对应，再 fold 并发布可读 root；任何
交叉错配或断裂前缀都拒绝 ready。已有 writer epoch 不影响 Tenant 初始化前态判断。

撤除先关本代新调用，收口引用 source 与 pending/unknown operation，再释放精确注册。来源不明
返回 unavailable/complete=false，不当空集合；关闭租户保留外部效果、财务责任与历史身份。


## 依赖与共同门

提供者实际组合依赖固定为：ARI-1；CD-01/CD-02；DR-01～DR-05；CC-01/CC-02/CC-03/CC-05/CC-06；OB-01～OB-03。其中 DR、OB 与 F 身份是提供者实现依赖，
不因此成为语言契约的新依赖；catalog 仍只保留原 G→CD/CC 六条语义依赖。

| 输入 | 使用范围 | 缺席/换代 |
|---|---|---|
| 列出的 ARI/CD 条款 | 稳定身份、tenant、因果、冻结输入 | 结构有效不代表当前资格；不补造身份 |
| 列出的 DR 条款 | 原操作、耐久回执、恢复/unknown、writer 换代 | 未核实写入保持 unknown，不能换 key 重试 |
| 列出的 CC 条款 | prepare、同门检查、共同提交、publication 与恢复 | blocked/unknown 不执行效果；通知不是状态权威 |
| 列出的 OB 条款 | 关联、拒绝/unknown 与 gap | 普通诊断失败不改业务事实；关键审计失败在效果前 fail closed |

具体 Cordis API 和生命周期仍须在采用版本核对；这里不声称候选 service/plugin 已存在。
