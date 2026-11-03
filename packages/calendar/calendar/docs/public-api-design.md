# Calendar 公开 API 设计

本页是 2026-11-03 确认范围的公开形状设计，尚非源码导出。实际包仍 `export {}`。行为以 [SPEC](../SPEC.md) 为准，跨域值是消费投影，不是外域运行时对象。下列公共服务形状实施时由 calendar-contract 的公开类型与 Standard Schema 唯一拥有，派生传输和工具 schema；不能另写平行 DTO。Schedule 消费本页的 CalendarSelection 与不可变快照，不使 Calendar 依赖 Schedule。共同可信调用语义在此集中说明，不把它变成 Calendar 对身份领域的治理权。

公共服务协议与本机工厂配置分开维护。可替换服务端口归 calendar-contract，工厂 Dependencies/Configuration 归 calendar，SQL 参加者与具体存储映射归 calendar-local。下文进程内依赖对象不属于 HTTP/远程请求或回执。根公共协议不携带 Context、数据库句柄、函数或运行时实例；取消观察的 signal 由客户端本地处理，不直接序列化。分布式交接与强保证的前提归[安装和部署边界](../../../../docs/package-organization.md#日历与日程的安装和部署边界)。

## 1. 编码、版本与调用上下文

协议 ID：`omne.calendar-schedule/1`。HTTP JSON 使用 camelCase。JSON 对象拒绝未声明字段；缺失与 null 不混同。日期 `YYYY-MM-DD`，civil datetime `YYYY-MM-DDTHH:mm:ss`，UTC instant `YYYY-MM-DDTHH:mm:ss.SSSZ`。v1 civil 不含 offset，精度秒；instant 精度毫秒。IANA timezone 必须在提供者固定 tzdb 内可解析。整数要求 safe integer；禁止 NaN/Infinity。UUID 字符串规范为小写。Unicode 文本保留原值。

输出判别联合必须穷尽，consumer 不把未知 variant 当成功。新可选字段只在所有真实消费者同步更新后加入，沿目标 0.0.0–0.1.0 演进政策，不提前承诺永久历史 wire 兼容。

```ts
type Ref = string // 具体 schema 分别验证 UUID / authority ref，不互相替代
type Instant = string
type Civil = string
type LocalDate = string
type OwnerRef = {kind: 'tenant'; tenantId: Ref; ownerId: Ref}
  | {kind: 'system'; systemScopeRef: Ref}
interface CallContext {
  principalRef: Ref
  owner: OwnerRef
  actor: { kind: 'human' | 'agent' | 'system'; actorRef: Ref }
  authContextRef: Ref
  requestId: Ref
  originatingSessionRef: Ref | null
}
interface CommandMeta {
  operationKey: string // 1..128 UTF-8 bytes，由调用方产生并在重试保留
  expectedRevision: number | null // create 为 null；已有对象命令必填
  consentRef: Ref | null // 引用，不是授权结论
}
type CommandResult<T> =
  | { kind: 'committed'; operationRef: Ref; value: T; replayed: boolean }
  | { kind: 'noChange'; operationRef: Ref; value: T; replayed: boolean }
  | { kind: 'unknown'; operationRef: Ref; retryAfterMs: number }
  | { kind: 'rejected'; error: DomainError }
type QueryResult<T> = { kind: 'ok'; value: T } | { kind: 'error'; error: DomainError }
interface DomainError {
  code: ErrorCode
  message: string
  retryable: boolean
  requestId: Ref
  details: Readonly<Record<string, string | number | boolean | null>>
}
```

OwnerRef显式区分租户归属与合法系统归属。source owner导入tenant分支。系统工作不能伪造特殊tenant，通知接收方也不能反推源工作所有者。系统归属到storage的映射必须由其提供者采用合法系统命名空间；缺少此能力时该装配受阻，不能把systemScopeRef偷填tenantId。

originatingSessionRef 只作可空来源追踪；非会话发起的程序Job传null，不影响创建或执行，不是强制Session依赖。

`CallContext` 由可信 host adapter 构造，应用服务仍验证 authContextRef。持有 Service 或调用 JavaScript 方法不构成可信身份。系统维护使用明确 system principal 和任务范围，不伪造用户或特殊 tenant。`AbortSignal` 只能作为进程内调用选项，不能进入 DTO、哈希或持久命令。

每个命令的 fingerprint 为 RFC 8785 JCS 的 UTF-8 bytes 后 SHA-256，小写 hex。参与哈希的是 `{protocol,operation,owner,aggregateRef,payload,expectedRevision,consentRef}`，不含 requestId、operationKey、运行时对象或 retry count。日期/UUID 先按上述 wire 规范校验，拒绝而不静默修剪。排序按 JCS，不按 localeCompare。跨语言 golden 至少覆盖中文、emoji、斜杠、负数、指数数值、null、空数组、键顺序。sourceFingerprint 单独保存，不能转当 targetFingerprint。

同作用域同 operationKey 同 fingerprint 返回原回执，同 key 不同 fingerprint 返回 `operation_key_conflict`。幂等键作用域含 owner、operation、aggregateRef 和 protocol；create 的 aggregateRef 为 owner 下 create namespace。旧 proof/receipt 不因 label 修改重写。无默认 TTL 删除历史或去重事实。

## 日历值与查询

CalendarSelection 为 `{calendarId, version:{kind:'latest'}|{kind:'pinned',versionId}}`。CalendarSnapshot 是不可变值，含 calendarId、versionId、coverageStart/end、timezone、weeklyDefault、逐日 overrides、knowledgeAsOf、contentHash、provenanceRefs、publicationGeneration。版本查询不返回 Context、连接、缓存或其他 runtime 实例。日期外的元数据不能被当成覆盖证明。

```ts
interface CalendarQueries {
  list(ctx: CallContext): Promise<QueryResult<readonly CalendarInfo[]>>
  get(ctx: CallContext, input: {calendarId: string}): Promise<QueryResult<CalendarInfo>>
  effective(ctx: CallContext): Promise<QueryResult<EffectiveCalendar>>
  resolve(ctx: CallContext, input: CalendarResolve): Promise<QueryResult<CalendarResolution>>
}
type CalendarResolve = {
  selection: {kind: 'effective'} | {kind: 'explicit'; calendarId: string}
  version: {kind: 'latest'} | {kind: 'pinned'; versionId: Ref}
  query: {kind: 'day'; date: LocalDate}
    | {kind: 'count'; from: LocalDate; to: LocalDate}
    | {kind: 'next'; after: LocalDate; count: number}
}
type CalendarResolution = {calendarId: string; versionId: Ref; coverageStart: LocalDate; coverageEnd: LocalDate;
  result: {kind: 'day'; date: LocalDate; working: boolean; holiday: boolean; override: boolean}
    | {kind: 'count'; from: LocalDate; to: LocalDate; count: number}
    | {kind: 'next'; after: LocalDate; dates: readonly LocalDate[]}}
```

CalendarInfo 含 calendarId、timezone、semanticBoundary、publishedVersionId 或 null、publicationGeneration、versions、supplyStanding 或 null。CalendarVersionInfo 含 versionId、coverageStart/end、knowledgeAsOf、synthesizedAt、contentHash、provenanceRefs、isPublished。EffectiveCalendar 含 owner、environmentRevision、activeTimezone、calendar。list 不需生效选择。有效环境读取为一个原子 revision，Calendar 只解析，不保存偏好。

resolve 的 selection、version、query 必须明确。transport 可显式补 version=latest，根 API 不藏默认。next 默认 5、上限 366；count 为闭区间，不跨版本覆盖。未发布/未知 pin、缺有效环境、覆盖不足与合法 empty 分开返回，不回退 latest、UTC 或另一日历。

## 纯计算根入口

所有操作只读不可变 snapshot，返回判别结果，不访问 Clock、数据库、网络或 Cordis。普通业务失败返回 invalid、coverageInsufficient 或 searchLimit，合法 empty 是成功。

| 操作 | 输入与结果 |
| --- | --- |
| classifyDay | snapshot + date，返回工作/非工作/假日日别、override、来源 |
| countWorkingDays | snapshot + from/to，含两端 count 与 basis |
| shiftWorkingDays | snapshot + date + signed integer，0 返回原日，其余从起始日外计数，返回遍历范围 |
| listWorkingDays | snapshot + 严格 after + 正整数 count，返回 dates 与 basis |
| selectNthWorkingDay | snapshot + periodStart/end + ordinal，返回 date 或完整 empty |

## 供应端口与应用服务

CalendarSupply.probe(calendarId,sourceId,policyVersion,operationKey) 返回 unchanged/changed/failed 和 observation。refresh(calendarId,policyVersion,operationKey) 返回 published/noChange/withheld/rejected/unknown 和 evidenceRef。importSeed(packRef,packHash,releaseRef,operationKey) 返回逐历结果。queryPublication(operationRef) 返回原 OperationView。操作只允许 supply/provisioning principal，普通 Calendar tool 不暴露供应写权限。

SourceAdapter.probe/acquire/parse 只返回带出处的观察/贡献。CalendarRepository 负责同 scope 的不可变快照读取、候选与发布 operation query；PublicationParticipant 保护 publicationGeneration、版本、出处、回执与 outbox 一致提交。Schedule 的 CalendarBasisGuardParticipant 仅验证公开版本守卫，不读取 Calendar 私有表。正式存储类型沿 [sql-contract](../../../storage/sql-contract/SPEC.md)，不能传异步 transaction callback。

## 错误与使用边界

错误码包括 unauthenticated、not_found、forbidden、invalid_input、invalid_timezone、missing_environment、environment_incoherent、unknown_calendar_version、coverage_insufficient、revision_conflict、stale_basis、operation_key_conflict、authority_unavailable、search_limit、capacity_exceeded、provider_failure。跨范围不存在和无权读取统一 not_found；诊断不带其他租户存在性。unknown 是独立结果，不是普通 ErrorCode。可重试仅允许再观察或按原 operation 认回。

独立宿主直接调用纯计算或 CalendarQueries/CalendarSupply 工厂，不装载 Cordis。进程内工厂接入 CalendarRepository、EnvironmentReader、AuthorityReader、Clock、SourceAdapter；Clock 的 now 与 monotonic 分开。查询的 signal 只取消观察；发布 signal 不撤销已提交事实。工厂及端口是本设计义务，当前没有可运行示例。

## Cordis 与独立工具

采用现行 Cordis 4.0.4 和 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。calendar-contract 与 calendar 根入口不导入 Cordis；calendar-cordis-contract 的 `./cordis` 唯一声明 CalendarQueryService/calendarQueryKey=calendarQuery 与 CalendarSupplyService/calendarSupplyKey=calendarSupply。抽象 Service implements calendar-contract 接口，static readonly provide 与 key 同源，构造函数 super(ctx,key)，@owner 指向 calendar-cordis-contract；提供者继承而不重复 provide。服务方法把调用交给提供者宿主，资源不建在 caller ctx 上。

Calendar tool 是独立装配贡献，由 calendar-tools 承接，只依赖 calendar-contract 及 calendar-cordis-contract 的 `./cordis` 定义，inject: [calendarQueryKey]，经 ctx.calendarQuery 调用 list/get/effective/resolve，动作均 calendar.read。模型不能传 tenant、actor、authContext、SQL、供应配置或任意 callback。Tool adapter 构造可信上下文，保留 kind/依据/错误，超长输出给 detailRef 与 truncated=true。工具注册使用[现行 Tool 贡献协议](../../../tool/tool-cordis-contract/docs/cordis.md)，calendar-tools 已初始化为空入口，工具行为尚未实现。

必需依赖变化先停止新准入并按原操作接续；可选依赖按调用现取，缺席真实返回 unavailable。dispose 只撤自己 token、listener、timer、句柄和使用权。其完成不证明发布、通知或后台动作已撤销。配置校验同步，网络检查归初始化；部分初始化失败仍释放已取得资源。详细路径见[流程](key-flows.md)。

## 应用工厂与供应数据约束

目标工厂createCalendarApplication({repository,persistence,environment,authority,clock,sourceAdapters,policies})返回{queries,supply}。纯计算可直接从根入口调用，不需要工厂或运行器。查询只解析所需repository/读取资格/有效环境；缺供应网络不阻已知覆盖内回答。供应运行器、tools和Cordis是外部装配，可分别装卸。CalendarRepository和PublicationParticipant对照[内部设计](internals.md#持久化与实际限制)落在真实sql-contract，不公开任意SQL执行入口。

CalendarSnapshot.weeklyDefault恰好7项，从周一到周日，每项为workingDay/holiday/nonWorkingDay；overrides按LocalDate唯一，每项给出实际分类、provenanceRefs及备注。coverageStart/end为包含边界，范围必须连续可解释；不可变version的contentHash为规范内容JCS/SHA-256，发布generation单调增加，观测时间不当知识截至。provenance含sourceId、role、lineageRef、权威原文引用、取得时刻和原材料hash；声明角色不伪造独立血统。source原材料与规范内容各自hash，不能混用。

PublicationParticipant的publish命令携带calendarId、expectedGeneration、candidate/version引用、policyHash及authorityGuardRefs；原子保存不可变内容、provenance、pointer/generation、operation receipt和outbox。same-content返回noChange，异内容同version拒绝；generation变更返回revision_conflict/stale_basis后重新校验。withheld/rejected候选、源响应/差异和失败同样持久保留，不能被误列为publishedVersion。原operation身份按scope+domain+operation+protocol+key映射sql-contract五维，异payload返回operation_key_conflict。
