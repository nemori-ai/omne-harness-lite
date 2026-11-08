# 公开接口导航

## 导出入口

根入口导出固定SQL材料、普通应用服务工厂、Identity目的解析器与Settings来源目的解析器，定义见[index.ts](../src/index.ts)。createGovernanceLocal只在启动恢复完成后交回贡献服务、permissionBasis、已配置的 externalWrites 与关闭接口。SQL、Identity、声明来源与当前事实是受信装配输入。

./cordis导出createGovernanceLocalPlugin与配置，定义见[cordis.ts](../src/cordis.ts)。它继承governance-contract唯一的服务定义。调用方fiber只承担自身贡献清理，内部清理权柄不从公共根入口导出。

## 定义索引

迁移材料遵循sql-contract的SqlMaterialCatalog。业务类型归[governance-contract](../../governance-contract/docs/public-api.md)。调用方及提供者关闭见[Cordis集成](cordis.md)，持久行为与限制见[SPEC](../SPEC.md)。

## 采用集合引用

根入口还导出createGovernanceCollection。调用方用已知的scope、声明修订、完整贡献引用、DefinitionRef和选定目标构造collection。它只计算稳定引用，不证明集合完整、当前或已获授权。提供者仍从当前候选重算，并拒绝漏项、重复和过期依据。

## Transaction-local target observation

The root exports `governanceTargetProjectionCommand`, its binding/result schemas and fact identifier. Register the participant from `governanceSqlMaterials` together with the real Governance table owner. This is a trusted SQL composition interface, not another caller-authorized application service. Management and runtime conditions, unavailable results and observation limits are defined in [GL-24](../SPEC.md#gl-24-transaction-local-target-projection).


## Settings来源协调

createGovernanceLocalSourceDestination 只依赖固定storage、domain、metadata及sourceRoute，可在Settings服务之前构造。装配者把它接到对应Settings来源服务的目的路由，再把该服务的reserve/settle端口作为sourceReservations传给普通工厂。路由必须与原 capture 或 external-write 保存的路由一致。目的解析器分别识别原 capture 与外部写意图协议，不能以新的请求替换原绑定。

sourceReservations是借用依赖。无来源责任的目录装配可以省略；存在历史来源责任时，缺少该依赖使启动恢复失败。关闭时任一来源责任未结算均返回pending，工厂不销毁借用服务。

## 当前权限依据

permissionBasis 实现 Permissions 的 PermissionBasisSource。普通工厂、runtime及Cordis配置保留读取context的泛型。受信装配通过 permission 配置提供 principalOf、resolve 与 project。没有配置时返回 unavailable。读取器先从context取出主体并独立核验，再把实际已核验主体、请求和原context交给resolve。context可以携带原动作定位，但它的结构、摘要或请求回显都不能证明资格。解析器须认回拥有者事实，产出带独立 qualification 的计划。当前事实只能来自选定组合中真实拥有者的投影，调用方不能提交求值材料。

`GovernancePermissionQualificationSchema` 定义具名外域观察信封，见 [permission-qualification.ts](../src/permission-qualification.ts)。`PermissionProjection` 将组合标识与命令成对交回；project 的输入不含未保管 context。读取器在 await 前固定其输出，最终写者精确比较已受理与当前事实中的 qualification。定义见 [permission-reader.ts](../src/permission-reader.ts)，行为归 GL-26；不保留旧的静态 combination/current 两入口。

每次 readCurrent 使用独立 capture，核验主体、租户、组织与服务范围，保留 Identity 资格，并取得原计划指定的 Settings 来源。唯一写者核对原请求、epoch、事务域、目标、qualification 与来源计划，在同事务保存当前依据。组织配值只从该 capture 已保管的快照提取。

current 可以包含不可用来源。原来源尚未取得时，写者保存 aborted 与局部 current，保留原来源清理责任；它不会把不可用来源改成不存在。结果耐久确认后，暂时清理失败不吞掉已知禁止。关闭仍须结清全部责任。current 不是允许执行的凭据，实际启动或写入仍由对应关口核验。

普通工厂已提供此接口；Cordis 服务发布、Session/Agent 约束来源及实际 ActionAdmission/Tool 消费仍须由应用装配完成。

## 受信外域写入

普通工厂可通过 externalWrites 配置发布同名协调出口，未配置则没有该出口。GovernanceLocalOptions 的 ReadContext 与 WriteContext 独立。配置提供 principalOf、resolve、plan 和固定 sourceRoute；类型由根入口导出，定义见 [external-write.ts](../src/external-write.ts)。这些是受信装配端口，不能把 HTTP 请求直接当作资格来源。

execute 接收 context 和原 intent。intent 包含 operationId、write.owner、protocol、targetRef、commandDigest 和 command。resolve 针对已核验主体和固定意图返回 qualification、required、source，或明确拒绝与不可用。plan 在原身份及来源已经保留后，依据保存的 command 生成组合、writer 和完整外域 SQL commands。外域适配器负责解释业务协议及核对摘要；Governance 负责持久保管和不替换。

返回值区分 invalid-input、denied、conflict、unavailable 和 terminal。terminal 携带原 binding、sqlIdentity、committed/aborted 及拥有者 JSON 结果；它不表示所有清理已结束。sqlIdentity 原样来自持久原操作，供受信装配通过 SqlStorage.query 认回原业务回执。相同意图重试认回原资格、事务身份和原结果，修改原操作意图返回 conflict。unavailable 不证明原操作未受理，调用者应使用同一意图重试。

治理 aborted 结果可能仅表示 sealed，不能代替外域具体失败。应用从原 SQL 回执恢复外域公开失败，不另开事务重算。若业务提交尚未发生，查询可能没有回执；查询不可用也不能猜测失败原因。SqlIdentity 只是定位，不授予查询资格，调用仍须使用原租户域内的受信 storage。

该出口沿用工厂的 close 生命周期，不发布新的独立 Cordis 服务。应用装配负责把协调端口交给受信消费者；公开贡献查询仍只支持 contribute、withdraw 和 adopt。外域业务成功路径还要求注册对应 basis、写者、结果和终态参加者。


### 同提交事实协议

根入口导出 governanceExternalWriteBasisFact、governanceExternalWriteResultFact 及对应 schema/type，定义见 [external-write-protocol.ts](../src/external-write-protocol.ts)。固定材料提供 governance.external-write-basis 和 governance.external-write-terminal。前者发布原操作及来源保管，后者校验外域结果并向既有 governance.activation 供应计划。

受信组合负责提供外域依据、唯一业务写者及结果适配器。结果适配器须认回本事务实际业务回执；不能回显调用者提交的成功结果。组合必须包含唯一治理写者，保持所有写入同一 transactionDomain。原始类型不包含服务实例或回调，装配与生命周期仍归提供者。行为及失败边界见 [GL-30](../SPEC.md#gl-30-外域效果与治理终态同提交)。

### 不依赖 Settings 目标的当前声明

`governanceDefinitionProjectionCommand` 生成只读 SQL 参加命令。输入与输出类型分别为 `GovernanceDefinitionBinding`、`GovernanceDefinitionProjection`，精确字段归 [definition-projection.ts](../src/definition-projection.ts)。固定材料提供 `governance.definition-projection` 参加者及同名事实。装配的组合仍须声明 Governance 表的拥有者。

该读取接受完整 scope、epoch、principalRef、captureId、transactionDomain 和 definition，不接受 target 或 mode。返回完整当前注册声明及相关修订，或明确的 scope、definition、limit 不可用原因。它没有将声明采用到 runtime，也没有读取 Settings 配值。没有 Settings 投影的权限项可直接消费此事实。

事实绑定字段不是身份凭证。调用必须来自受信 SQL 装配，消费方须核对原请求的完整绑定。后续动作仍需真实发布、适用约束和准入依据。当前注册、原发布、实际持有和执行器存活是不同事实，不能互相替代。

原 `governanceTargetProjectionCommand` 保留公开形状和 management/runtime 行为。它与独立声明读取共用同一条有界声明查询，runtime 继续检查当前 selected target。行为与验证边界归 [GL-31](../SPEC.md#gl-31-当前注册声明与-settings-目标分离)。
