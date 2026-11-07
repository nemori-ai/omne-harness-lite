# 对象模型

## 对象与关系

Scope 表示一个租户内某服务可采用的治理范围。Definition 是不可变声明副本。Contribution 是某次装配取得的独立租约。Member 表示租约进入当前采用集合，MemberTarget 记录该租约具体支撑的目标。Operation 保存一个原始命令及其进展。

```mermaid
classDiagram
  Scope "1" --> "many" Contribution
  Definition "1" --> "many" Contribution
  Scope "1" --> "many" Operation
  Contribution "1" --> "0..1" Member
  Member "1" --> "many" MemberTarget
  Definition "1" --> "many" Item
  Scope "1" --> "many" SelectedDefinition
  SelectedDefinition "1" --> "many" SelectedTarget
```

当前源码用关系记录表达这些有身份的对象，迁移采用 SqlStorage 的 MigrationModule。没有为每张表创建一个无行为 class。业务 Provider 后续通过公开契约消费外域，不继承外域对象或持有其私表。

## 生命周期

租约持久状态为 active/released，关闭受理的内存阶段与持久撤除区分。撤除最终须与采用投影在一个事务完成。Scope 换 epoch 后旧行保留为历史，当前读取必须核对 epoch。

声明与原结果不因租约撤除而删除。资产、设置值、身份和权限值的生灭各归原领域。登记、采用、撤除和epoch围栏已有私有事务写者；公开服务及Cordis关闭流程仍待接线。

Operation 的原请求与执行内容分别固定。前者表达业务意图，后者绑定实际组合和协调材料，不能因重试而用当前版本替换。当前源码用严格 Schema 的记录和事务函数表达这个状态机。

```mermaid
stateDiagram-v2
  [*] --> accepted: 受理并保存原请求
  accepted --> submitted: 保存固定执行内容
  accepted --> aborted: 精确封口
  submitted --> committed: 业务与原结果同提交
  submitted --> aborted: 封口或业务拒绝
  committed --> committed: 认回原结果
  aborted --> aborted: 认回原终态
```

## 采用的值对象

Candidate 是当前租约及其不可变声明的读取结果，不发行新身份。AdoptionMember 把一个 Candidate 与其选择的完整目标集合组合。AdoptionEvidence 是同操作、同事务域、同epoch的消费投影，包含目标拥有者事实与实际关口映射，不授予权限。

```mermaid
classDiagram
  Candidate --> Contribution
  Candidate --> Definition
  AdoptionMember --> Candidate
  AdoptionMember --> SettingsTarget
  AdoptionEvidence --> OperationBinding
  AdoptionEvidence --> TargetOwnerFact
  AdoptionEvidence --> EnforcementBinding
  AdoptionPlan ..> AdoptionMember
  AdoptionPlan ..> AdoptionEvidence
```

纯计划核对这些值，关系写者执行已成立的整份计划。数据关系、业务判断与外部事实生产分开承担责任；不为临时计划增加持久表，也不把目标拥有者的生命周期搬入治理域。

## 原操作持有的身份保留

StandingCustody 是 Operation 内的保管值，不是另一个资格拥有者。它保存向 Identity 发出的完整请求及原回执。身份资格和保留是否释放仍归 Identity。

```mermaid
classDiagram
  Operation "1" *-- "0..1" StandingCustody
  StandingCustody --> StandingRequest
  StandingCustody --> StandingReservation
  StandingRequest --> OperationBinding
  StandingRequest --> RecoveryAddress
  IdentityReservations ..> StandingReservation
```

```mermaid
stateDiagram-v2
  [*] --> requested: 原请求持久化
  requested --> held: 匹配的真实回执
  requested --> settled: 原终态及结算回执
  held --> settled: 原终态及结算回执
  settled --> settled: 认回，拒绝复活
```

保管状态与业务状态是不同维度。业务已终止时仍可能收到 held 回执，持有该历史回执不表示业务可以继续。业务入口必须先检查原终态。

## 同事务计划

ActivationPlan 是一次 SQL 事务内的判别值，不是持久任务或授权令牌。control 携带严格元数据请求，mutation/adoption 携带原业务绑定、epoch与事务域，adoption还携带具名当前事实。observation只允许认回缺失、冲突或原终态。

```mermaid
classDiagram
  ActivationPlan <|-- ControlPlan
  ActivationPlan <|-- MutationPlan
  ActivationPlan <|-- AdoptionPlan
  ActivationPlan <|-- ObservationPlan
  MutationPlan --> OperationBinding
  AdoptionPlan --> OperationBinding
  AdoptionPlan --> AdoptionEvidence
  ActivationWriter ..> ActivationPlan
  ActivationWriter --> Operation
```

图中继承箭头表达判别联合的变体，不表示源码使用 class 继承。参与者的表访问能力由固定 SQL 材料约束，计划值不会取得外域对象的所有权。

## 原 SQL 阶段请求

SqlStageCustody 是原 Operation 拥有的不可变请求记录。Execution 表达业务执行绑定，CommitRequestV2 还包含实际命令正文。两者分开存放，避免完整请求包含自身。SQL 回执由 SqlStorage 拥有，治理域只保存发出请求的依据。

```mermaid
classDiagram
  Operation "1" *-- "0..7" SqlStageCustody
  SqlStageCustody --> SqlStage
  SqlStageCustody *-- CommitRequestV2
  CommitRequestV2 *-- SqlIdentity
  CommitRequestV2 *-- FactCommandV2
  Operation *-- Execution
  FactCommandV2 ..> Execution : 业务请求绑定
  SqlStorage ..> CommitRequestV2 : 提交与认回
```

首次保存确定该阶段的完整请求。重复保存相同请求认回原值，不同请求冲突。封口后保留历史请求，允许身份结算继续，但业务写者先认回终态。持久事务函数承载这些行为，不为关系行增加无行为的包装类。
