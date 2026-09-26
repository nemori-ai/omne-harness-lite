# 待接受邀约的过期语义

一份**待对方点头的[邀约](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-offer--邀约--offer)**
在什么时刻、按什么规则不再可被接受，以及它失效之后留下什么。
**「邀约」是统称，词条已写明这四样不共享一套身份机制**——它们共享的只有本契约这一条规矩。
本系统有四样这种东西——[加入组织的邀请](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-invitation--邀请--invitation)、
[隶属请求](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-affiliation-request--隶属请求--affiliation-request)，
以及 PF-003 的[待确认的复制通知与分享邀请](../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)。
产品正文把它们明说成[「同一条规矩的两个实例」](../../../product/PF-001-identity-scope-and-agent-constraints/design.md#两种邀约都会过期)，
所以这条规矩有一个共同的家，而不是在四处各写一遍。

**本契约只拥有「什么时候不再能被接受」。**谁能发出、谁能接受、接受之后产生什么，
各归发出它的那个能力契约。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.offer-expiry, 1)`
- **状态**：`accepted`，资源已冻结——[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md)（产品负责人，2026-09-22）接受 v1 全部条款，含[已知缺口](v1/contract.md#八已知缺口)作为显式缺口；**此后语义改动发布 v2，不原地改 v1**。接受不表示已实现或已验证
- **catalog 映射**：**已登记并接受**（2026-09-22，状态 `accepted`，`acceptance` 指向 D-023 的 [`acceptance.json`](../../../record/decisions/tenant-domain-design-acceptance/acceptance.json)）。`family=data`、`topic=offer-expiry`、
  `contract_path=spec/data/offer-expiry/v1/contract.md`，
  `resources` 另含 `spec/data/offer-expiry/v1/offer-expiry.schema.json`；
  依赖一项：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`，
  消费 clauses `S-1`（AccountId）与 `S-3`（OrganizationId）。
  [缺口 G-5](v1/contract.md#八已知缺口) 关的就是这一条登记，**契约正文与这里都已标为闭合**。
  两项资源的 SHA-256 已登记在 [`frozen.json`](../../../registry/README.md)
- **提供者/装配映射**：[`realization/packages/core/offer-expiry`](../../../realization/packages/core/offer-expiry/README.md)（纯模块：`OfferTiming`、派生状态纯求值、`Clock` 形状）；设计已随 D-023 接受，源码尚未建包

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。过期语义不属于任何一个邀约主体的能力契约——四类消费者要共享同一含义，含义分叉就会出现「这里过期了、那里还能接受」 |
| 稳定身份 | `data.offer-expiry`，版本 1 |
| 适用范围 | 待接受的邀约。**已经被接受之后产生的东西不在范围内**——[分享确认之后的使用权没有到期](../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)，租户与上级组织属性同理 |
| 为什么是 data 而不是 capability | 它没有需要被别人调用的行为：到期时刻是值，判定是纯计算，没有自己的授权前提与失败模式。发出、撤回、接受这些**有**授权与失败的操作，归各自的能力契约 |
| 精确依赖 | `data.identity-values` v1，只取 OrganizationId、AccountId 两个名字 |
| 接受状态 | 已接受：[D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md)，2026-09-22；catalog `acceptance` 指向该包的 `acceptance.json` |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/offer-expiry.schema.json) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。除 `contract.md` 与 `offer-expiry.schema.json` 外没有其他规范工件。

**本包不建 `formal/`。**理由：本契约不拥有状态机。
`pending → accepted / withdrawn` 这两条转移的权威在发出邀约的那个能力契约（成员记录、上级组织属性、资产持有各自的写入边界），
本契约只给一条**读时求值的谓词**和它必须被求值的时点；
谓词本身没有交错，写不出一个会被并发反驳的行为模型。
真正需要行为模型检查的是「接受」这个操作与成员记录写入的同提交关系，
那条义务落在拥有该操作的能力契约，不在这里复制第二份状态机。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是**规范场景**，在[验证入口](verification.md)登记。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## v2 接受（D-040）

[v2 契约](v2/contract.md)与[Schema](v2/offer-expiry.schema.json)补接收方拒绝终结；仅治理消费者拟升级，资产不自动获得拒绝动作。已按 D-040 登记并冻结，现有实现仍采用 v1，消费者不自动升级。
