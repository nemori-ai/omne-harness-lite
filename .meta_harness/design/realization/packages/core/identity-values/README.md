# identity-values

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 `efe73eb5`），2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · data.identity-values · v1`（[契约](../../../../spec/data/identity-values/v1/contract.md)，状态 `accepted`、已冻结）
- 源码位置：`packages/core/identity-values`——**已实现（`efe73eb5`）**：`src/{parsed,opaque,values,predicates,validate,handoff-warrant,identifier}.ts`，公开入口 `.` 与 `./schema`，导出名逐项见 [design.md 投影表](design.md#能力到-cordis-的投影)。归 `core`：它兑现一份 `data.*` 契约，被租户领域全部四个节点与将来的资产领域消费（[两层布局](../../../README.md#packages-的两层布局)；第一层不是 workspace 成员，见承载仓库 `docs/workspace.md`）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——那份契约[没有操作、没有状态转移、没有提交点，因此不需要插件](../../../../spec/data/identity-values/v1/contract.md#这份契约拥有什么)。它提供三样：身份值的类型与相等／序列化、Schema 校验入口、[交接凭证](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant)的签发与核实原语。**隔离义务（[S-16](../../../../spec/data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)～[S-30](../../../../spec/data/identity-values/v1/contract.md#s-30-跨边界须重新验证)）本模块兑现不了**——它们约束的是每个 owner 自己的判定路径，本模块只提供类型与检查器，义务落在消费者节点

2026-09-26 的公开面追加：`OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS` 是解析器消费的唯一冻结 26 点数组；`IDENTITY_BRAND_NAMES` 恰 AccountId／OrganizationId／LoginStateId，`IDENTITY_TYPE_NAMES` 再含 TenantId／ScopeLayerIdentity。后续检查器从公开入口消费名单；不把 LoginIdentifier 或 HandoffWarrant 登成身份。

## 分层状态

- 语义接受范围：`data.identity-values` v1 **全部条款**（含其已知缺口作为显式缺口），依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计随同一决定被接受为实现路径。接受不提升下面三层
- 可实施范围：本节点声称兑现的条款逐条见 [design.md「能力到 Cordis 的投影」](design.md#能力到-cordis-的投影)——身份值形状（S-1～S-13、S-31～S-34）、`MembershipStandingResult` 的两支形状（S-10）、`ScopeLayerIdentity` 两变体（S-11）、交接凭证的形状与签发／核实原语（S-35），以上**已实现（`efe73eb5`）**，验证登记见下两层。**不兑现**：隔离义务 S-16～S-30 的任何一条（只给检查器），成员资格效力怎么算（S-10 的行为面归治理节点），标识的**部署内唯一**（归各持有节点的存储约束）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——本契约没有已登记的 formal task。证据义务见 [verification.md](verification.md)：契约 `examples.md` 参与机检的 86 行正反实例、S-35 四类反例、Schema 副本逐字节相同，都由包内测试承担，运行结果登记在那里的「实际执行」
- 实际验证：运行 [`2026-09-26-tests-core-foundation`](../../../../record/evidence/2026-09-26-tests-core-foundation/README.md)：实现 `efe73eb5`、HUB `f73078ba`，build／typecheck 退出 0，**259/259**，另有 built exports 外部消费者与六组织 Alloy 输出的有界对照。SC-1／SC-2／SC-9 规则形式已实现并有正反例；checks 最终 HUB **100/100**、24-rule scan。SC-1 当前真实准入覆盖 **0**，SC-2／SC-9 只覆盖登记语法形状；租户隔离与消费者完整义务保持在各 owner。前提、原始输出与历史范围见 [verification.md](verification.md#本次追加验证2026-09-26)

- 本轮公开验证：另见 [`2026-09-26-tests-core-public`](../../../../record/evidence/2026-09-26-tests-core-public/README.md)：值相等／品牌、闭合输入与带内失败、显式上级快照、warrant 四项子场景及两组严格类型反例，同一 HUB 外层12/12、零跳过；按本节点 [公开追加验证](verification.md#公开消费者追加验证2026-09-26) 的条款与边界读取。具名类型完整名单与三个 opaque 品牌互赋负例尚待后续实际运行；本轮不提升整体完成或最终接受。

## 按当前问题展开

| 当前问题                                         | 阅读入口                            |
| ------------------------------------------------ | ----------------------------------- |
| 怎样实现、公开面是什么、静态检查义务落到什么形式 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么               | [绑定表](bindings.yaml)（当前为空） |
| 实际跑过什么、覆盖到哪里                         | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
