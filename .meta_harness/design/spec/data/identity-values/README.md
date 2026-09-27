# 身份值与隔离义务

## 工作区接入的适用范围

S-22／CS-6 的“同目录不同租户必为两份工作区”与现行产品的共享逻辑工作区／实例不一致。该部分需要随工作区身份契约以新版本接续；旧版继续按原承诺读取，不能把其中 TenantId 偷换成求值上下文。账号、组织等未消费该规则的接口不因此自动升级。

依据：[冻结规则 S-22／CS-6](v1/contract.md)；[工作区与实例的产品定义](../../../product/PF-020-workspace/design.md#工作区workspace)。

**这个系统里的东西归谁**——账号、组织、租户、登录状态各是什么形状，什么时候算同一个；
以及**每一个持有租户范围对象的 owner 都要遵守的那组同形条款**。

这两样在一起，因为[跨租户访问默认拒绝](../../../foundation/cross-system-constraints/requirements.md#sys-tenant)
这件事**不需要跨 owner 的共同提交，需要的是每个 owner 各自不漏**。
写成一份共用契约，每个 owner 才能照着逐条自检；
把判定挪到一道守门插件里，就会留下「守门通过但数据层没校验」的那条路。

**它是本次租户相关领域里最先定的一份**：其余契约引用它的值，不各自复制一份同义类型。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.identity-values, 1)`
- **状态**：`accepted`，资源已冻结——[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)（产品负责人，2026-09-22）接受 v1 全部条款，含[已知缺口](v1/contract.md#十已知缺口)作为显式缺口；**此后语义改动发布 v2，不原地改 v1**。接受不表示已实现或已验证
- **catalog 映射**：**已登记并接受**（2026-09-22，状态 `accepted`，`acceptance` 指向 D-023 的 [`acceptance.json`](../../../record/decisions/tenant-domain-design-acceptance/acceptance.json)）。`family=data`、`topic=identity-values`、
  `contract_path=spec/data/identity-values/v1/contract.md`，
  `resources` 另含 `spec/data/identity-values/v1/identity-values.schema.json` 与
  `spec/data/identity-values/v1/examples.md`；
  **`dependencies` 为空数组**——本契约不消费任何其他契约的条款，不是「待填」；
  三项资源的 SHA-256 已登记在 [`frozen.json`](../../../registry/README.md)
- **提供者/装配映射**：[`realization/packages/core/identity-values`](../../../realization/packages/core/identity-values/README.md)（纯模块：身份值类型、Schema 校验、交接凭证签发／核实原语）；设计已随 D-023 接受，源码尚未建包

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。这些值被所有涉及租户归属的能力共享，**写两遍必然分叉**；隔离义务同理——十五条同形条款散进各能力契约，就会出现「这里校验了、那里没有」。[交接凭证 S-35](v1/contract.md#s-35-交接凭证-handoff-warrant) 落在这里出于**同一条理由**（三份契约都要用它），但它**既不是身份值也不是隔离义务**——它没有产品出处，因此[也不立统一语言词条](v1/contract.md#s-35-为什么不立统一语言词条) |
| 稳定身份 | `data.identity-values`，版本 1 |
| 适用范围 | **一个部署之内。**本版的完整交付是单机，但每一条的领域语义在跨进程之后必须原样成立；哪些结论由装配给、哪些须由协议重新兑现，逐条列在[契约第六节](v1/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有状态转移、没有提交点、没有自己的授权前提与失败模式，**因此不需要插件**。有状态的是记录（成员记录、登录状态记录、组织记录），它们的写路径归各自的能力契约 |
| 精确依赖 | **无。**它是本基线的第一份身份值契约，不 `$ref` 任何其他 Schema。输入是产品正文与全局约束条款（非 spec 坐标） |
| 谁在等它 | 同批的三份候选契约——[账号身份](../../capabilities/account-identity/README.md)（`S-1`／`S-2`／`S-9`／`S-30`／`S-31`／`S-33`／`S-35` **七条**——`S-30` 按「正文以坐标引用即消费」的判据列入，catalog 已按七条登记）、[组织治理](../../capabilities/organization-governance/README.md)（值的形状、上级链与 `shareAncestor` 的定义、`S-35`）、[账号注册组合](../../compositions/account-registration/README.md)（`S-1`／`S-2`／`S-35`，**catalog 已登记这条依赖**）；[`data.offer-expiry` v1](../offer-expiry/README.md) 取 **`S-1`／`S-3`** 两个名字；**资产领域是具名第一消费者**（契约尚未建立）。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份，本行只作索引** |
| 接受状态 | 已接受：[D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md)，2026-09-22；catalog `acceptance` 指向该包的 `acceptance.json` |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/identity-values.schema.json) |
| 一个值长什么样、什么会被拒 | [v1 正反实例](v1/examples.md) |
| 我是消费者，我该照着做什么 | [隔离义务](v1/contract.md#五隔离义务)（每条两栏：谁在何处保护 / 违反时可观察到什么）＋[消费者核对场景 CS-1～CS-10](v1/contract.md#消费者核对场景) |
| 我要拿一份「依据」交给下一步 | [S-35 交接凭证](v1/contract.md#s-35-交接凭证-handoff-warrant)：六条性质，以及**不可伪造是契约承诺、机制归 realization** |
| 要演练隔离义务，脚本在哪 | [`examples.md` 第 13 节 IS-1～IS-10](v1/examples.md#13-隔离义务的规范场景)；它与 CS 那一组**不互相顶替**，状态见[验证入口](verification.md#证据义务) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`identity-values.schema.json`、
`examples.md`——**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒」说清楚。

**本包不建 `formal/`。**理由：本契约**没有状态转移**——
[TenantId 无销毁路径](v1/contract.md#s-6-tenantid-无生灭路径)、
[组织变体无变更路径](v1/contract.md#s-4-organizationkind)，这两条本身就是「没有这条边」。
它也没有需要在给定规模里找反例的结构关系：上级链的无环与至多一个上级
（[S-14](v1/contract.md#s-14-上级组织与上级链)、[S-15](v1/contract.md#s-15-shareancestor)）
由**组织治理契约的结构模型**检查，**那份模型消费本契约的值定义，本契约不另造一份平行模型**。
在这里建模型只会产出一份与 Schema 同义的工件。
**[S-35 交接凭证](v1/contract.md#s-35-交接凭证-handoff-warrant)也不改变这个判断**——
凭证的产出与核实发生在**两条操作之间**，本契约一步状态转移也没有多出来；
那条次序守卫在**账号注册组合的行为模型**里检查。

[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是**静态检查**与**消费者核对场景**，在[验证入口](verification.md)登记，
状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
