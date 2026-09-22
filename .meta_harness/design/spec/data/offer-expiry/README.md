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
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **catalog 映射**：**已登记**（2026-09-22，状态 `candidate`）。`family=data`、`topic=offer-expiry`、
  `contract_path=spec/data/offer-expiry/v1/contract.md`，
  `resources` 另含 `spec/data/offer-expiry/v1/offer-expiry.schema.json`；
  依赖一项：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1`，
  消费 clauses `S-1`（AccountId）与 `S-3`（OrganizationId）。
  [缺口 G-5](v1/contract.md#八已知缺口) 关的就是这一条登记，**契约正文与这里都已标为闭合**。
  `acceptance` 为 `null`，资源未冻结——**登记不是接受**
- **提供者/装配映射**：**尚无**。架构与提供者设计未开始，本包不预填目标设计

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。过期语义不属于任何一个邀约主体的能力契约——四类消费者要共享同一含义，含义分叉就会出现「这里过期了、那里还能接受」 |
| 稳定身份 | `data.offer-expiry`，版本 1 |
| 适用范围 | 待接受的邀约。**已经被接受之后产生的东西不在范围内**——[分享确认之后的使用权没有到期](../../../product/PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期)，租户与上级组织属性同理 |
| 为什么是 data 而不是 capability | 它没有需要被别人调用的行为：到期时刻是值，判定是纯计算，没有自己的授权前提与失败模式。发出、撤回、接受这些**有**授权与失败的操作，归各自的能力契约 |
| 精确依赖 | `data.identity-values` v1，只取 OrganizationId、AccountId 两个名字 |
| 接受状态 | 未接受。本包不写 acceptance |

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
