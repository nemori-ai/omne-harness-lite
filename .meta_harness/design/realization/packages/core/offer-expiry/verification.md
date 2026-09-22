# offer-expiry 验证与证据

契约侧的证据义务权威在 [`spec/data/offer-expiry/verification.md`](../../../../spec/data/offer-expiry/verification.md)。
那张表里的义务**绝大多数落在消费者**（拥有发出／撤回／接受与读面的能力契约的提供者，本版即 [organization-governance](../../tenancy/organization-governance/verification.md)）；
本页只登记**本模块自己能证的那一小部分**——判定函数与解析器的行为。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式) 判定式与求值次序 | `deriveState` 单元测试：终结记录优先（`settled='withdrawn'` 且 `now > expiresAt` ⇒ `withdrawn` 不是 `expired`）；严格不等号（`now === expiresAt` ⇒ `pending`）；`target='absent'` ⇒ `expired` | 未开始 | 本节点 |
| [S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在) 不可用 ≠ 不存在 | 单元测试：`now='unavailable'` 或 `target='unavailable'` ⇒ 返回 `'unavailable'`，**不是** `pending` 也不是 `expired`；且有终结记录时仍返回终结记录（①在②之前） | 未开始 | 本节点。**这条只证纯函数**；契约 verification 要求的故障注入（让读面真的读不到）在消费者节点 |
| [S-13](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) | `acceptable` 对 `expired`／`withdrawn`／`accepted` 三值返回同一个 `false` | 未开始 | 本节点；「逐字相同的失败值」在消费者节点的 S-24 三支同跑里证 |
| [S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming)／[S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl) | `timingFrom` 与 `parseOfferTtl` 单元测试：`0`、负数、`NaN`、`Infinity`、非数值 ⇒ `invalidInput`；`undefined` 不进解析器（缺席由调用方分流） | 未开始 | 本节点。「指定值拒绝、默认值启动失败」两路的收场在消费者节点与装配 |
| [S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) 形状 | Schema 副本逐字节核对 + 正反实例过 `validate` | 未开始；契约侧有一次[起草时自检](../../../../spec/data/offer-expiry/verification.md#已执行起草时的-schema-自检2026-09-22)，未绑定冻结 hash | 本节点 |
| 三条 lint 规则 SC-OE-1～3（[design.md](design.md#静态检查义务怎么承载)） | 规则实现 + 「故意违反就失败」自测 | 未开始；**检查器尚不存在** | 本节点提供规则，消费者包 CI 跑 |

**受阻项**：`Instant` 表示选型未定（`Temporal` vs 毫秒整数）前，S-8 的测试写不了。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 无 | — | — | — |

两次 formal evidence run（`2026-09-22-formal-tenant-domain`、`-2`）**不覆盖本契约**——它不建形式工件，契约 verification 已明写。

## 覆盖缺口

- **四条规范场景 S-23～S-26 一条也不在本节点跑**：它们需要真实的发出／撤回／接受路径与存储，owner 是 organization-governance（邀请、隶属请求）；资产那两类**无 owner**（[G-2／G-6](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)）。
- **S-17 五行装配给保证**没有可跑的证据形式，是装配设计的选型声明 + 架构评审；`now` 不后退的候选形状（高水位）在 [design.md](design.md#状态并发与失败映射)，装配节点尚未为本批契约建立。
- **「插件体抛出 ⇒ 启动失败」**是待核对主张，核对前 S-14 默认值那一路的兑现方式不算定。
