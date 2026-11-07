# 内部架构

## 模块与依赖

`migration.ts` 拥有九张私表及索引。`materials.ts` 将实际模块映射成 SqlStorage 的固定迁移材料。根入口只导出该材料工厂。公共业务类型仍归 governance-contract，真实 Provider 尚未实现。

```mermaid
flowchart LR
  Assembly[装配者] --> Materials[governanceSqlMigrations]
  Materials --> SQL[SqlStorage迁移执行]
  SQL --> Relations[governance.activation私表]
  Contract[governance-contract公共行为] -.-> Provider[待实现的业务Provider]
  Provider -.-> Relations
```

## 关键机制与理由

注册与目标之间是多对多关系。`gc_member_target` 保留哪份注册支撑哪个目标，不能只保存声明下存在几个注册。选中定义和目标是当前采用的物化投影，业务参与者必须与支持边共同提交。

待恢复枚举使用 `INDEXED BY gc_operation_pending` 固定本拥有者的部分索引，并保留完整 keyset 和 LIMIT。仅建立同前缀索引不足以保证 SQLite 不选主键范围。索引更名或删除须同步该查询；索引缺失时拒绝执行，不回退历史扫描。

原操作表保存受理和提交中状态，为未知回执恢复留有持久入口。原身份不随 epoch 改变，旧请求不能通过换代获得新业务身份。epoch 是后续参与者核验的当前性字段，不是外键可证明的全局时序。

来源权威拥有不可变声明，`gc_definition` 是核验后的本地副本。它不是一个新的全局定义发行中心。

`definition-source.ts` 只消费 `GovernanceDefinitionSource`，在异步等待前固定请求，之后比较原发布的完整身份及内容。`definition.ts` 继续拥有纯定义语义检查。来源选择、主体准入、当前采用是不同责任；来源比较不代替 Identity 保留或当前性围栏。

```mermaid
sequenceDiagram
  participant C as 待接线的应用协调器
  participant V as resolveDefinition
  participant S as 原发布来源
  C->>V: 有限声明
  V->>V: 复制并固定完整正文
  V->>S: ownerId / definitionId / version
  S-->>V: 完整规范声明或 unavailable
  V->>V: 核对身份、语义和完整正文
  V-->>C: verified / conflict / unavailable
```

此图表示已实现的比较机制；原发布 producer 与公共协调器尚未接通。不同租户可以消费同一权威，不能各自用当地可编辑的定义副本冒充该权威。

## 验证与维护

Schema 测试运行真实 SQLite；材料测试运行真实 Worker。角色资格、动态生命周期及业务 current 来源尚无生产符合性证据。关系变化须同步 [对象模型](object-model.md)、[规格](../SPEC.md) 和实际迁移，不以更新旧迁移来兼容已发布数据。

## 原操作与业务写者

`operation-schema.ts` 定义本包私有命令、身份和保管记录。`operation.ts` 负责受理、固定执行内容、终态和原结果读取；`scope.ts` 负责精确 scope 绑定和 epoch 切换。`definition.ts` 消费 Settings/Permissions 的公共纯验证，不重复规则算法，也不认证发行来源。`contribution.ts` 负责登记和精确撤除；`apply-operation.ts` 将当前 epoch 判断、业务写入与原结果写入放进同一次事务。

```mermaid
flowchart LR
  Admission[待接线：Identity与发布来源协调器] -.-> Accept[acceptOperation]
  Accept --> Saved[持久原请求与SQL身份]
  Saved --> Submit[submitOperation固定执行内容]
  Submit --> Apply[applyOperation核对终态与epoch]
  Apply --> Register[registerContribution]
  Apply --> Withdraw[releaseContribution]
  Register --> Finish[finishOperation原结果]
  Withdraw --> Finish
  Seal[sealOperation] --> Finish
```

恢复读索引排除历史终态。当前贡献扫描限129行，实际允许128；在线项统计按当前去重声明计算。重复租约共享声明的预算，不把同一声明的每个租约再算一遍项数。权威来源和作用域资格仍是应用协调器的实施缺口，不能用上述私有执行材料绕过。

## 完整采用

`candidates.ts` 只枚举当前epoch的有效租约，并按定义去重读取正文。`adoption-plan.ts` 比较完整选择、定义相容性、目标和实际关口。`adoption.ts` 在计划成立后替换关系并推进修订。`applyOperation` 将该效果与原结果共同提交。

```mermaid
flowchart LR
  Current[当前租约索引] --> Candidates[去重声明及2 MiB预算]
  Candidates --> Plan[完整采用计划]
  Command[原命令及完整选择摘要] --> Plan
  Facts[同操作目标与关口投影] --> Plan
  Plan -->|全部成立| Replace[原子替换支持及选中关系]
  Replace --> Receipt[采用修订与原回执]
  Plan -->|拒绝| Preserve[保留旧选择]
```

目标投影携带原操作、事务域、epoch、目标来源、完整定义和ownerRevision。它保留目标拥有者的责任，治理写者不读取Settings或Assets私表。当前测试用具名投影夹具执行真实采用事务；生产fact桥接和Identity协调未接通。

## Identity 保留与恢复边界

`standing-schema.ts` 定义请求、回执及保管状态。`standing-custody.ts` 通过完整原操作主键读写 held_json。它不读取 Identity 私表，也不发行资格。`standing-operation.ts` 提供身份保留路径的业务入口和精确封口入口，二者共用原操作终态。

```mermaid
sequenceDiagram
  participant C as 受信协调器，生产接线待完成
  participant G as Governance 本地事务
  participant I as Identity 保留服务
  C->>G: 保存原操作及 requested
  G-->>C: 完整持久请求
  C->>I: reserve 原请求
  I-->>C: held 回执
  C->>G: 保存匹配的 held
  C->>G: submit 与 applyStandingOperation
  G->>G: 业务效果与原终态同提交
  C->>I: settle 原 reservationId
  I->>G: 受信路由 sealGovernanceStanding
  G-->>I: 原 committed 或 aborted
  I-->>C: terminal 并释放保留
  C->>G: 记录相同终态的 settled
```

图中业务提交和结算不要求固定先后。若结算先封口，迟到提交只能认回 aborted。若业务先提交，结算认回 committed。目的端不可用时，Identity 保留不释放，撤权仍待恢复。

复用 [StandingCommit 与 SettingsReservationCustody](../../../assets/settings/verification/README.md) 的模型义务。模型 operation 对应完整治理原操作，terminal 对应该行 committed/aborted，保管请求对应 held_json。有限模型验证以真实 Identity 和同事务封口为前提，不证明来源认证、服务可用性或跨进程部署。真实组合测试见 [持续测试](../tests/README.md)。

## 同时恢复业务与未结算保留

`recovery-migration.ts` 增加恢复部分索引，原迁移字节保持不变。`recovery-read.ts` 提供按同一 scope 做 keyset 分页的只读处理器。索引包含业务 pending，以及业务已终结但保管尚未 settled 的行。只扫描业务 pending 会漏掉提交成功后丢失结算回包的记录。

```mermaid
flowchart LR
  Pending[accepted或submitted] --> Recovery[恢复候选索引]
  Held[终态且requested或held] --> Recovery
  Recovery --> Page[每页最多64个原键与摘要]
  Page --> Original[按原键取得原请求和原结果]
  Original --> Work[可信协调器认回或封口]
  Work --> Settled[确认Identity结算]
  Settled --> Exit[终态settled退出候选]
```

读取材料限定 gc_scope 和 gc_operation 两张表，使用 domain-serial 排序。每次最多读取66行，输出上限256 KiB。失败保持 unavailable，不能变成完整空页。一次分页只覆盖该轮观察到的集合，后续扫描从头发现并发插入。
