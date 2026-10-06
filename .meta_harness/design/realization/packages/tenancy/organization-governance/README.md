> N4 迁移读法：组织治理四面类型、Service 集成与 SQL 当前投影已采用[模块旁现行源](../../../../architecture/pilots/n4-ownership.md)。
> 下文原当前投影不再约束已迁任务。未迁协议、未来增量与证据义务保持原精确范围；历史实现/运行坐标不改写。

# organization-governance

- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-22 首稿，设计同日由 D-023 接受为实现路径；兑现 `omne-harness-lite-design-2026-09-15 · capability.organization-governance · v1`（[契约](../../../../spec/capabilities/organization-governance/v1/contract.md)，状态 `accepted`、已冻结，设计依据 PF-001 rev 19）。**2026-09-25 按 v3 修订（设计已接受，尚未实现）**：`omne-harness-lite-design-2026-09-15 · capability.organization-governance · v3`（[契约](../../../../spec/capabilities/organization-governance/v3/contract.md)，`accepted`、已接受）是 v1 的加法版——两个时刻、三个读面带出它们、同一提供者同时服务钉 v1 与钉 v3 的消费者（[§十三](../../../../spec/capabilities/organization-governance/v3/contract.md#十三版本差异与规范工件)）；另为资产提供者登记三项外部依赖、导出一组事务内读函数（[design「v3 修订」](design.md#v3-修订候选尚未实现)）。**v1 部分的状态不变**
- 源码位置：`packages/tenancy/organization-governance`——**已实现（HUB `c9b5850`）**：`src/plugin.ts`（`organizationGovernancePlugin`、`OrganizationGovernanceConfigSchema`）、`src/types.ts`（四个服务面 `OrganizationsService`／`OffersService`／`MembershipsService`／`OrganizationPurgeService` 与逐字对契约 ⑥ 的失败联合、服务名常量、本契约拥有的 `InvitationId`／`AffiliationRequestId`、读面形状、config 与事件类型）、`src/organizations.ts`／`src/memberships.ts`／`src/offers.ts`／`src/purge.ts`（四个服务面的实现）、`src/records.ts`（行解码与共用判定）、`src/runtime.ts`（共用依赖与失败映射）、`src/migrations.ts`（迁移片段 `organizationGovernanceMigrations`、`OG_TABLES`）。第二层 `tenancy` 是租户领域这个限界上下文的名字，产品负责人已拍板（D-024）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，提供四个服务面（服务名 `organizations`、`memberships`、`offers`、`organization-purge`），兑现契约**全部 25 个操作**。内部三组（隶属、成员、邀约）本版不拆——「创建组织」一次提交同时产生组织行、成员记录与首位超管，接受邀请一次提交写成员记录与邀请终结记录，内核不提供跨 fiber 事务（理由在 [design.md](design.md#实现路径与来源)）。**第四个服务面是本节点新加的**：[S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 没有授权前置，契约把「只由清除链调用」记为装配给（[S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)）；把它放在一个**只有 [account-registration](../account-registration/README.md) inject 的服务名**上，是这条装配保证在 Cordis 上能落到的最具体形状，理由在 [design.md](design.md#s-53-单独一个服务名只给清除链)。**v3 不改插件边界**：同一插件、同一 fiber，多 provide 两个 v3 读面的服务名（候选 `organizations-v3`、`memberships-v3`），钉哪一版由消费者 inject 哪个名字表达、装配绑定；另导出一个事务内读入口（候选子路径 `./tx-reads`），只许 [asset-governance](../../assets/asset-governance/README.md) import

## 当前采用

| 版本 | 来源与状态 |
| --- | --- |
| OG1 | 原基础治理及旧消费者 |
| OG2 | draft 的拒绝与共同参与已实现，D-042/D-043；末尾参与证据仅覆盖此版 |
| OG3 | #9 的时刻与资产依赖设计已接受，尚未实现；D-066 行政迁移 |

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。存量实现对应的旧契约接受仍有效，本次新增设计尚未实现。
- 可实施范围：本节点声称兑现 25 个操作的九件事、四条贯穿规矩（S-15～S-18）、S-14 五条（含 ⑤ 残留清扫的**方法**，触发与节奏归装配 G-13）、五个通知事件、S-42 表左列九行里落到本节点或存储要求上的部分，逐条见 [design.md](design.md#能力到-cordis-的投影)，以上**已实现（HUB `c9b5850`）**；S-32 的判定次序与 design 不一致，待主线裁定（[实施缺口](design.md#实施缺口与消费者影响)）。**不兑现**：S-42 右列全部协议给保证；S-38 的「不可达」（资产 owner）；S-49／S-50 的另一半（资产、会话契约尚无）；G-1 会话级层身份；G-2 组织消失的事件源（契约禁止预埋）；G-3 计量；G-6 运行控制。**v3 声称兑现（设计，尚未实现）**：v3 S-1～S-61 中与 v1 不同的全部条款——S-7、S-8 两个时刻，S-20／S-21／S-25／S-29／S-32／S-33 ④ 的写集合，S-22／S-36／S-59 ⑤⑧ 的读面，S-42 新增两行在单机上的兑现，S-45 的 v3 行，S-61 场景，§十三「写按 v3、答按调用方钉的版本、存量记录不补时刻」；v1 同文条款沿用上面的已实现部分。**v3 不兑现**：S-42 两行的右列（G-7）；「先后两次串行提交的时刻不相等」在 `infra/clock` 交接落地之前兑现不了（[V3-2](design.md#实施缺口与消费者影响)）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **三条**，绑到 `formal:organization-governance-v1-membership`（S-17／S-28／S-29 的序列化不变量；S-39 不绑——模型没有在它被违反时会失败的断言）。Alloy 模型**未登记为 formal task**（退出码归 tooling 的缺口），不可绑；规范场景 S-46～S-54 已有包内测试（见下一项），逐条状态待 [verification.md](verification.md) 回填。**v3 另三条**：`capability.organization-governance/v3#S-17`／`#S-28`／`#S-29` 绑到同一个 formal task（v3 [S-45](../../../../spec/capabilities/organization-governance/v3/contract.md#s-45-本版选用哪些形式工件) 声明沿用、模型不含两个时刻）；两个时刻的证据是场景 S-61，**未开始**，没有绑定
- 验证义务：组织、成员、邀请、故障、输入、迁移、插件和公开类型须按 [verification.md](verification.md) 检查；跨契约义务明确承担者，跳过不计通过。历史版本的测试不自动证明新版本源码符合性。

## 按当前问题展开

| 当前问题                                                                                                                       | 阅读入口                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 四个服务面、跨 owner 的「同一提交」为什么落在账号行的事实与引用约束上、序列化落到存储的什么要求、S-53 怎么只给清除链、装卸配对 | [实现设计](design.md)         |
| v3 的两个时刻怎么写、双版本怎么服务、存量记录怎么办、给资产提供者的三项外部依赖与事务内读入口                                   | [v3 修订](design.md#v3-修订候选尚未实现) |
| 哪条承诺由哪份证据支持、前提是什么                                                                                             | [绑定表](bindings.yaml)       |
| 实际跑过什么、九条场景各缺什么                                                                                                 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，获准采用的终态写回当前承诺拥有者；比较与接受过程留本工作树 tmp。

2026-09-25增量：D042/D043范围内的新版本局部实现及测试见证据。旧bindings不整批升级；新entry/host组合未验，不声明生产开闸。
