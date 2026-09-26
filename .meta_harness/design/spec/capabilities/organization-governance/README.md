# 组织治理

**一个组织里谁说了算、谁在里面、它跟别的组织是什么关系**，
以及**一次登录此刻站在哪个[租户](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant)身份上**。

这是租户相关领域里最大的一份契约。它拥有
[组织](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)及其
[上级组织属性](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)、
成员关系与[租户角色](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant-role--租户角色--tenant-role)、
[邀请](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-invitation--邀请--invitation)与
[隶属请求](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-affiliation-request--隶属请求--affiliation-request)的全生命周期、
[上级链](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-ancestor-chain--上级链--ancestor-chain)读面，
以及[当前租户身份](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)这项选择。

**它不拥有账号与登录状态**——那归 `capability.account-identity` v1，本契约消费它的六条（[S-4](v1/contract.md#s-4-依赖方向与被消费的面) 的被消费面表：`S-14`／`S-17`／`S-18`／`S-20`／`S-22`／`S-38`，与 catalog 一致）。
**依赖方向是单向的：治理 → 账号。**特别地，本契约**不消费凭据校验**——
它与组织治理没有共同的判定输入或不变量，登进消费清单会让「换掉它要不要重审本契约」
得到一个错误的答案。**理由不是重启半径**：本契约 inject 账号读面，
那个提供者换代本来就会重跑本契约。这条契约级边界实际买到什么，
见[契约 S-4 末段的四条](v1/contract.md#s-4-依赖方向与被消费的面)。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.organization-governance, 1)`
- **状态**：`accepted`，资源已冻结——[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)（产品负责人，2026-09-22）接受 v1 全部条款，
  含[已知缺口](v1/contract.md#十一已知缺口)作为显式缺口；**此后语义改动发布 v2，不原地改 v1**。接受不表示已实现或已验证
- **catalog 映射**：**已登记并接受**（2026-09-22，状态 `accepted`，`acceptance` 指向 D-023 的 [`acceptance.json`](../../../record/decisions/tenant-domain-design-acceptance/acceptance.json)）。`family=capabilities`、
  `topic=organization-governance`、
  `contract_path=spec/capabilities/organization-governance/v1/contract.md`，
  `resources` 另含 `v1/formal/Membership.tla`、`v1/formal/Membership.cfg`、
  `v1/formal/Membership_NoSerialization.cfg`、`v1/formal/Affiliation.als` 与 `v1/formal/README.md`
  （导航页随接受一并登记为资源，版本目录整体冻结）；依赖三项；
  六项资源的 SHA-256 已登记在 [`frozen.json`](../../../registry/README.md)。
  [缺口 G-10](v1/contract.md#十一已知缺口) 关的就是这一条登记与它暴露的消费清单缺口，
  **两半都已在评审轮一闭合**（评审轮三前它占用 `G-5`，与已关闭的 shareAncestor 那条一号两指，改号不改内容）。
  - `capability.account-identity · v1` 消费 clauses `S-14`、`S-17`、`S-18`、`S-20`、`S-22`、`S-38`（评审轮四按「引用即消费」补齐四条），
    取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)。
  - `data.offer-expiry · v1` 消费 clauses `S-2`、`S-4`～`S-14`（不含 S-15）、`S-16`～`S-20`，
    由正文里按号引用的位置收齐——**整块引用不复制**，与包入口这句话一致。
    **`S-19` 是评审轮一补上的**：[S-25](v1/contract.md#s-25-接受邀请)／[S-32](v1/contract.md#s-32-接受隶属请求) 的⑧
    把「组织存在性读面不可用」收成 `unavailable`，依据正是那条把读面责任派给持有该对象的契约。
  - **`data.identity-values · v1` 的 clauses 已在评审轮一补齐**：
    [S-4 新增了身份值侧的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)，
    逐条给号共 **27 条**——
    `S-1`、`S-3`～`S-12`、`S-14`～`S-19`、`S-26`～`S-35`。
    **`S-13`（sameAccountDistinctTenants）有意不在其内**：它的消费者是 PF-003 的资产契约，
    本契约只在消费者核对表里提到它，[提到不是消费](v1/contract.md#s-4-依赖方向与被消费的面)。
    **catalog 的这一项须按那张表更新**——原来只登了 `S-3` 与 `S-33`
- **formal-tasks 映射**：**已登记一个任务**（2026-09-22）——
  `organization-governance-v1-membership`，即 `Membership.tla` ＋ `Membership.cfg`（`Serialized = TRUE`）。
  **另外两样按设计不登记**：`Membership_NoSerialization.cfg` **期望失败**（退出 12），
  与该清单的语义相反；四条 Alloy 命令的 runner `alloy exec` **退出码与断言结果无关**，
  登记它只会得到一个永远通过的任务。两者的证据与理由都在
  [两次运行](../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md)
  （[第一次](../../../record/evidence/2026-09-22-formal-tenant-domain/README.md)之后
  `Affiliation.als` 改过，**Alloy 那四格以第二次为准**；`Membership.*` 两次逐字节相同），
  映射仍见 [formal 入口](v1/formal/README.md)
- **提供者/装配映射**：[`realization/packages/tenancy/organization-governance`](../../../realization/packages/tenancy/organization-governance/README.md)（一个插件、四个服务面，[S-53](v1/contract.md#s-53-清除未激活账号的个人组织) 单列只给清除链）；设计已随 D-023 接受，源码尚未建包

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。组织规则、成员关系与隶属关系被**两条跨行不变量**和**一次同提交**绑在一起——「任何时刻至少一位有效超管」跨组织与成员两处事实，「创建组织」要在一次提交里同时产生组织、成员关系与首位超管。把它们分开就得自造一套跨边界提交协议，而没有任何瓶颈测量支持那样做 |
| 稳定身份 | `capability.organization-governance`，版本 1 |
| 适用范围 | 组织与成员这一侧的事实与操作。**账号、登录状态、凭据不在范围内**；资产持有与配值、会话、成本计量也不在 |
| 为什么是 capability 而不是 data | 它的每个写操作都有**授权前置**（谁能邀请、谁能调角色、谁能解除）与**失败模式**，且有[需要被别人调用的读面](v1/contract.md#s-26-成员资格判定)。这两样是 data 契约没有的 |
| 精确依赖 | `data.identity-values` v1（身份值与隔离义务）、`data.offer-expiry` v1（过期语义，**整块引用不复制**）、`capability.account-identity` v1（两个读面） |
| 接受状态 | 已接受：[D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md)，2026-09-22；catalog `acceptance` 指向该包的 `acceptance.json` |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| **二十五个**操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 邀约与成员现在是什么样（六个读面，评审轮一新增） | [契约 S-55～S-60](v1/contract.md#六个读面邀约与成员现在是什么样) |
| 哪些性质由谁保护、前提是什么 | [契约第七节](v1/contract.md#七性质与前提) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-42](v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) |
| 哪些条款映射到哪个模型、模型盖不到什么 | [formal 入口](v1/formal/README.md) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |
| 我是消费者，我要的面在不在 | [契约第十二节](v1/contract.md#十二消费者核对) |
| 哪些事还没人裁 | [契约第十一节](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 是本契约的候选版本目录，含 `contract.md` 与 `formal/`。

**本包建 `formal/`，理由与[过期语义那一份](../../data/offer-expiry/README.md#版本包)正好相反**：
那一份没有状态机，判定式没有交错可被反驳；**这一份有**。
「任何组织在任何时刻至少有一位有效超级管理员」是一条
[自定义并发协议](v1/contract.md#s-17-同一组织的成员写入序列化)——
两次动作各自的前置都成立、合起来违反不变量，**只有行为模型表达得了这种交错**。
上级链的三条结构约束同理：至多一个上级由形状兑现，**无环不是**，它要在写入的同一次提交内读多行判定。

**本包不建 Schema。**本契约用到的数据形状全部归 `data.identity-values` v1 与
`data.offer-expiry` v1；[在这里再建一份就是第二份权威](v1/contract.md#s-45-本版选用哪些形式工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## v2 候选

[v2规格草稿](v2/contract.md)接续D040，增加接收方拒绝与显式共同参与，未采用/未实现。v1消费者不自动迁移。

2026-09-25，[D042](../../../record/decisions/governance-participation-provider/decision.md)接受[v2](v2/contract.md)，既有消费者仍按各自采用版本。
