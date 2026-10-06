# 有效语义与保持边界

## 精确输入

下表的版本来自接受登记和实际消费者，不按目录中的最大版本推断。
旧文件中的 candidate 标题或过时源码注释不改变接受登记。
条款及其 Schema、形式资源共同构成输入，不能只搬操作签名。

| 简称 | 有效输入及接受依据 | 本批关系 |
|---|---|---|
| AI3 | [account-identity v3](../../spec/capabilities/account-identity/v3/contract.md)，身份与 offer 采用 | 账号、登录及凭据接缝 |
| OG2 | [organization-governance v2](../../spec/capabilities/organization-governance/v2/contract.md)，事务参与采用 | 已实现四服务面；OG3 的资产读取和新增承诺不伪报通过 |
| AR2 | [account-registration v2](../../spec/compositions/account-registration/v2/contract.md)，有界注册采用 | 注册及过期清除编排 |
| EC3/HT3 | [入口 v3](../../spec/compositions/governance-center-entry/v3/contract.md)、[HTTPS JSON v3](../../spec/compositions/governance-center-entry-https-json/v3/contract.md)，在线维护采用 | 服务端与运维面；客户端普通操作继续使用 EC2/HT2 已冻结线协议 |
| CG2 | [客户端操作 v2](../../spec/compositions/governance-client-operations/v2/contract.md)，预备输入采用 | 全部 action、use、预备输入及报告 |
| CLS1 | [本地状态 v1](../../spec/capabilities/client-local-state/v1/contract.md)，本地状态采用 | 必要公共形状、CAS、资源生命周期；不裁定新的客户端产品政策 |

IV1/OE2 的身份、warrant、时间形状与失败字面继续由原拥有者维护。
CG2 明确消费的 EC2/HT2 不因服务端采用 EC3/HT3而自动升版。
各契约未迁条款、原测试、模型配置和 Schema URI 保留原身份。

## 操作全集与目标拥有者

每组原公开签名及失败联合逐字迁移，除了下表明确指出的结构变化。
迁移时须用类型测试逐项对照，不能用泛型 `unknown` 返回或统一异常取代原结果。
`participate` 的临时结果不代表提交，参与面与普通面不得混用。

| 服务面 | 全部已有操作 | 目标定义 |
|---|---|---|
| AccountsService | participate、produce、activate、read、purge；AccountParticipation 的 read、resolveActivatedIdentifier | core/account-identity |
| LoginsService | participate、prepareCredentialChange、changeCredential、issue、exchange、revoke、verify、listEffective；LoginParticipation 的 exchange、verify、revoke、listEffective、finalizeActivity、commitCredentialChange | 同上 |
| CredentialsService | parse、derive、verify、checkPolicy | 同上；凭据接缝源于 AI3 S-8/S-26，没有另立能力 |
| RegistrationService | register、purgeExpired | core/account-registration |
| OrganizationsService | participate、createPersonal、createTeam、read、dissolveAffiliation、ancestorChain、shareAncestor、scopeLayers | 既有 core/organization-governance |
| OffersService | participate、issueInvitation、withdrawInvitation、acceptInvitation、declineInvitation、issueAffiliationRequest、withdrawAffiliationRequest、acceptAffiliationRequest、declineAffiliationRequest、readInvitation、readAffiliationRequest、listReceivedInvitations、listIssued、listReceivedAffiliationRequests | 同上 |
| MembershipsService | participate、standing、mine、changeRole、remove、currentTenant、switchCurrentTenant、list、sweepStaleSelections | 同上 |
| OrganizationPurgeService | purgePersonalOrganization | 同上 |
| GovernanceClientOperations | runAction、runPrepared、openUse、close；GovernanceUse 的 run、runPrepared、close | core/governance-client-operations |
| ClientLocalState | read、compareAndReplace；拥有实例的 close | core/client-local-state |
| 客户端传输 | readPublicHealth、exchangeGovernance；配置错误和完整结果联合 | core/governance-center-entry-https-json 定义传输接口，HTTPS 提供者实现 |
| 治理服务端 | 原 31 条普通路由、公开体检、Unix 运维 full-health/backup/backup-status、离线维护函数 | 业务形状归 EC/HT 对应 core；HTTP、TLS、socket 和存储实现归限定提供者 |

CLI 的 parse/present/input 及 TUI 控制只消费公共操作形状。
工厂、独立调用、迁移片段、快照检查等现有根导出须逐项去向登记。
它们不全属于业务定义：SQL migration/table/snapshot 留实现，词汇校验和路由 ID 归公共定义。
不得只保证上表服务方法而丢掉原独立公开能力。

## 不变式与行为验证对应

| 保持义务 | 必须观察的结果 | 拥有者与验收 |
|---|---|---|
| AI3 身份及凭据代际 | AccountId/LoginStateId/出示物边界，G/g 失效次序，单次准备票据，clock 失败及过期边界；无凭据输出 | AI 定义薄规格；T2 的类型、故障、真实 SQLite 与 L3 热点 |
| AR2 分步主链 | produce→createPersonal→activate 各自提交，激活是注册语义提交；中断不推断未发生，不回滚已提交前步，不增加补偿 | 注册薄规格；原 crash/progress 模型及停止/换代测试 |
| OG2 同提交 | 个人组织和首位成员写入、AI 账号读取参与同一 StorageUnit；入口登录/成员校验、当前租户与业务写原组合边界保持 | OG/入口薄规格；跨实例 unit 拒绝、并发授权变化、失败回滚 |
| 注册清除 | OG S-53→AI S-38 携带原 warrant；未知提交不签发虚构依据，原三分类不翻译；过期冲突后只重试一次 produce | AR2 的返回、数据库事实及故障记录逐项对照 |
| 租户与授权 | 自然人全局身份与成员关系分离，显式租户身份；外来租户默认拒绝；isolate 不授予数据权限 | OG、入口、客户端原拒绝优先次序及两租户真实组合 |
| 组织结构 | 幂等键、成员复用身份、至少一位 superAdministrator、无隶属环；失败不产生部分状态，通知只在提交后 | OG 原形式模型、事务失败与事件计数 |
| 客户端使用期 | 固定 center/trust/login 绑定，单 use busy、不重投；取消、未知远端结果、本地 CAS 未确认分开；预备输入先捕获后等待 | CG2 S-2～16；TLS/CLI/PTY、并发换绑与取消晚完成 |
| 本地状态 | storeId/revision/operationId、不可伪造且实例绑定 snapshot token；CAS 冲突与未确认保持，目录及落盘保证不变 | CLS1；真实私有目录/SQLite/多进程、关闭和故障 |
| 宿主启停 | 校验密钥先于数据接触；全部 ACTIVE→确认升级→开闸→重验 clock；确认后失败不恢复旧快照 | 真实 SQLite/TLS/Unix/CLI 和升级故障注入 |
| 撤除与外部效果 | 停止准入不等于实际完成；已提交事务、scrypt、网络及维护工作等到真实收场后才释放依赖 | 每个提供者的 completion；换代/迟到/双失败观察 |

AR2 的三步不能改成全链同一个事务。本条校正任务计划早期“账号、个人组织和 owner 同提交”的歧义。
精确同提交只在原 OG/AI/入口条款指定的 StorageUnit 内成立。
同样，IC-19 是同进程保证在未来由协议兑现，早期 R0 把它标成可观测性的说明属于盘点误记。
原 R0 快照保留，本次采用正确条款，不改写历史输入。

## 影响面与原问题

BASE AST 盘点覆盖 11 个成员的 273 个源码/测试文件、194 条相关 import/export/require，另有 34 个元数据消费者。
静态入口包括根、`./cordis`、Schema 子入口和生成器。源码扫描不是动态可达性证明。
计算路径的 Schema require 要按各 schema-inputs 的有限清单核对；Docker 测试的客户端路径要在包改名后执行。
历史 record 与角色评估夹具保留当时输入，不做全仓替换。

实际跨域消费者包括 model-invocation-minimal-demo、evaluation-input-store、loop-extension-runner、
model-request-runtime-local 和 model-profile-directory。它们只做必要公共导入与组合改接。
不借本批重构这些领域的业务。

IR-CC-1 的 PHC 随机三字符子串误判须在 T2 按原保密承诺纠正判据，并在 T5 复验。
QA-FAC-1 的完整 W6 导出/Schema 拥有者问题继续归 N6。EIS 超时与 A5 原 45 秒冷恢复因果缺口未关闭。
旧机械报告另指出 OG2 与 AR2 的 formal/README.md 未登记 resources。
M02/M05 必须从实际目录收齐这两份模型说明及前提，不只从登记抽取；T2 复用它们验证，
N5/N6 在对应模型/登记迁移时接续并关闭 E4，不原地改写历史接受记录。
原失败和原始输入保留。任何新行为差异先定位契约，不能以“旧实现如此”或放宽断言掩盖。
