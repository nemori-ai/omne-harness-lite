# organization-governance

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿，设计同日由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`（[契约](../../../../spec/capabilities/organization-governance/v1/contract.md)，状态 `accepted`、已冻结，设计依据 PF-001 rev 15）
- 源码位置：`packages/tenancy/organization-governance`——**已实现（HUB `c9b5850`）**：`src/plugin.ts`（`organizationGovernancePlugin`、`OrganizationGovernanceConfigSchema`）、`src/types.ts`（四个服务面 `OrganizationsService`／`OffersService`／`MembershipsService`／`OrganizationPurgeService` 与逐字对契约 ⑥ 的失败联合、服务名常量、本契约拥有的 `InvitationId`／`AffiliationRequestId`、读面形状、config 与事件类型）、`src/organizations.ts`／`src/memberships.ts`／`src/offers.ts`／`src/purge.ts`（四个服务面的实现）、`src/records.ts`（行解码与共用判定）、`src/runtime.ts`（共用依赖与失败映射）、`src/migrations.ts`（迁移片段 `organizationGovernanceMigrations`、`OG_TABLES`）。第二层 `tenancy` 是租户领域这个限界上下文的名字，产品负责人已拍板（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，提供四个服务面（服务名 `organizations`、`memberships`、`offers`、`organization-purge`），兑现契约**全部 25 个操作**。内部三组（隶属、成员、邀约）本版不拆——「创建组织」一次提交同时产生组织行、成员记录与首位超管，接受邀请一次提交写成员记录与邀请终结记录，内核不提供跨 fiber 事务（理由在 [design.md](design.md#实现路径与来源)）。**第四个服务面是本节点新加的**：[S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 没有授权前置，契约把「只由清除链调用」记为装配给（[S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）；把它放在一个**只有 [account-registration](../account-registration/README.md) inject 的服务名**上，是这条装配保证在 Cordis 上能落到的最具体形状，理由在 [design.md](design.md#s-53-单独一个服务名只给清除链)

## 分层状态

- 语义接受范围：`capability.organization-governance` v1 **全部条款**（含其已知缺口作为显式缺口），依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)（产品负责人，2026-09-22）；本节点的设计——含跨 owner「同一提交」靠账号行过期事实加引用约束、四个服务面、无进程内锁——随同一决定被接受为实现路径；S-36／S-37 登录状态参数收窄为品牌这一处修订随 [D-028](../../../../record/decisions/governance-center-design-acceptance/decision.md) 接受（2026-09-23）。接受不提升下面三层
- 可实施范围：本节点声称兑现 25 个操作的九件事、四条贯穿规矩（S-15～S-18）、S-14 五条（含 ⑤ 残留清扫的**方法**，触发与节奏归装配 G-13）、五个通知事件、S-42 表左列九行里落到本节点或存储要求上的部分，逐条见 [design.md](design.md#能力到-cordis-的投影)，以上**已实现（HUB `c9b5850`）**；S-32 的判定次序与 design 不一致，待主线裁定（[实施缺口](design.md#实施缺口与消费者影响)）。**不兑现**：S-42 右列全部协议给保证；S-38 的「不可达」（资产 owner）；S-49／S-50 的另一半（资产、会话契约尚无）；G-1 会话级层身份；G-2 组织消失的事件源（契约禁止预埋）；G-3 计量；G-6 运行控制
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **三条**，绑到 `formal:organization-governance-v1-membership`（S-17／S-28／S-29 的序列化不变量；S-39 不绑——模型没有在它被违反时会失败的断言）。Alloy 模型**未登记为 formal task**（退出码归 tooling 的缺口），不可绑；规范场景 S-46～S-54 已有包内测试（见下一项），逐条状态待 [verification.md](verification.md) 回填
- 实际验证：包内测试（`tests/{scenarios,organizations,memberships,offers,faults,inputs,migrations,plugin}.spec.ts`、`tests/types.spec-d.ts`；跨契约与归别处的写成带指向的 `it.skip`）在运行 `2026-09-23-tests-tenancy-leg-2` 里随十三个 TS 成员 build／typecheck／test 在 sqlite 下全过，证据登记在 [`record/evidence/2026-09-23-tests-tenancy-leg-2/`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)（HUB）；逐条覆盖待 [verification.md](verification.md) 回填

## 按当前问题展开

| 当前问题                                                                                                                       | 阅读入口                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 四个服务面、跨 owner 的「同一提交」为什么落在账号行的事实与引用约束上、序列化落到存储的什么要求、S-53 怎么只给清除链、装卸配对 | [实现设计](design.md)         |
| 哪条承诺由哪份证据支持、前提是什么                                                                                             | [绑定表](bindings.yaml)       |
| 实际跑过什么、九条场景各缺什么                                                                                                 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

2026-09-25增量：D042/D043范围内的新版本局部实现及测试见[证据](../../../../record/evidence/2026-09-25-tests-governance-participation/README.md)。旧bindings不整批升级；新entry/host组合未验，不声明生产开闸。
