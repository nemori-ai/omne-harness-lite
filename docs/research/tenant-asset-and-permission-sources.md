---
kind: research
id: R-tenant-asset-and-permission-sources
scope: PF-010 组织与个人资产、权益、official/customized 来源及类型清单
---

# 租户资产与权限的来源核对

[PF-010 正文](../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) · [研究索引](README.md)

2026-09-12 按用户本轮要求核对 `omne-next` 提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。所列文件与固定提交 Git blob
逐字节核对。研究快照用于解释本轮范围，不是全系统继承截止点。

## 来源与映射

同日后续讨论增加个人用户与组织超级管理员的管理要求，详见
[管理操作核对](tenant-management-sources.md)和 PF-010.C8–C10。本页继续拥有
原有类型与权益来源记录；管理动作的补充及 PF-006/PF-010 分工由后续记录说明。

| 来源 | 源接受状态与核对范围 | PF-010 对应 |
|---|---|---|
| [按 owner scope 查看资产组合][portfolio] | Accepted · current，2026-07-31；Statement、三关系、Actor/scope、AC-1～8 | C3/C4/C7：四类顶层资产、分组可见、所有权/权益/选用可同时成立、版本与失败诚实 |
| [租户有效权益生命周期][entitlement] | Accepted · current，2026-08-03；Statement、Tenant/actor、权利及失效边界、08-20 amendment | C1/C4/C5：同一租户权益模型、组织按角色行权、不得跨范围借权、撤权不等于强停；官方也需要面向租户的 grant |
| [个人空间与活动租户选择][personal] | Accepted · current，2026-08-03；稳定边界、选择与逐次准入 | C1/C5：个人与组织上下文可辨，selector 不是授权，失败不回退；platform 是官方资产治理范围而非用户可任意选择的组织 |
| [组织与成员生命周期][membership] | Accepted · current，2026-08-03；角色、成员变化与数据边界 | C1/C5：组织共同权益与成员操作权分别表达；角色/退出影响新准入，不授予管理员私人数据权限 |
| [获授权创作与不可变发布][authoring] | Accepted · current，2026-08-03；类型清单、actor/ownership、draft/release | C3/C6：四类定义可创作；作者与 owner 分开，组织内创作不成为个人所有，发布不自动赋予其它权利 |
| [选入资产组合与精确版本][acquisition] | Accepted · current，2026-08-03；scope、权利依据、pin 与更新 | C4/C6：选用不同于权益/安装；默认固定版本，当前范围内显式选择 |
| [资产管理与 custom Agent 旅程][journey] | Accepted · current，2026-08-05；Outcome、product language、PORTAL-1/4/5 | C2/C7：custom Agent 是 Blueprint；组合、激活和可见不产生工具、花费或其它权限 |
| [资产定义、权利与组合视图][asset-design] | Accepted / Maturing 设计；顶层清单、六个事实面、权威边界 | 解释四类资产与 Tool/Middleware/Hook/Rule 的差别，知识不是第五类 Agent asset；不接受源 BC/聚合/读模型分工 |
| [组件来源 ADR-025][sourcing] | Accepted 设计；D-2/3/8 与 07-31 scope correction | 来源轴与类型轴分开，原系统自定义组件的声明性边界；旧自动 personal/org/platform overlay 已被修订，不可抄回 |
| [统一语言][language] | 历史访谈及设计词汇；§2.2 plugin、Agent asset、ComponentProfile | 组件与 Plugin 成员清单，official/custom provenance；版本较旧的身份与解析陈述须连同有效修订读取 |
| [模型档案][model-profile] | Accepted · current，2026-09-11；Statement 的来源、约束及治理 | 档案同形、official 公开只读/custom 可管理；没有据此承诺组织共享模型档案或完整模型子系统设计 |
| [受治理知识与行为候选][knowledge] | Accepted · committed-future，2026-08-04；Outcome、知识与候选归属 | 知识是受治理数据，Agent author 不解除租户归属；本轮只补充类型边界，不据此登记完整演化流程 |

## 三个维度不能合并

1. **来源**：official / customized 说明来源与维护方式。Source 声明必须有可信
   依据，不能成为任意请求自封“官方”的权限入口。
2. **归属与适用范围**：个人、组织与平台回答哪个治理范围拥有定义或持有什么
   关系。同一官方定义可由平台持有，多个个人/组织各有独立权益和选用事实。
3. **权利与实际可用性**：ownership、entitlement、acquisition、installation、
   activation 和一次动作准入分别回答问题；类型或来源标签不能合并这些事实。

源 portfolio 明确不从“可查看”推出 organization sharing，entitlement 则明确
组织采用租户级权益、成员按角色代表组织行动。本轮用户**直接确认组织内共享**，
不是用前者的读面推导写权限；个人↔组织显式携入、转让和商业逐席许可仍有独立
范围。共享同一权益依据不等于 owner/admin/member 可以执行相同管理动作。

## 有效修订与资产清单边界

- ADR-025 的 07-10 文本曾写 personal ⊕ organizations ⊕ platform 自动 overlay
  和 custom 自动遮蔽 official；07-31 correction 明确收回其通用性，要求针对
  一个经验证的 active Tenant，以当前 ownership、entitlement、选用和获准
  grant 建立候选范围。用户“可覆盖出厂默认设置”不能被偷换成恢复旧跨租户借权。
- 当前顶层清单严格为 Skill、SlashCommand、Plugin、AgentBlueprint。Tool 与
  Middleware 是平台组件，Hook/Rule 可为成员。源 D-8 暂缓任意可执行 custom，
  后续演化来源允许创作高风险代码候选也不使其自动获准执行；本轮不替本项目
  选择某种插件进程、沙箱或不可变框架边界。
- 模型档案的 09-11 要求已取代旧 roster / 两栏能力事实要求。本轮只取来源与
  可治理性：官方原档只读、自定义档案可管理，和用户选择覆盖出厂默认并不矛盾。
  用户原话没有明确模型档案的组织共享规则，故保留待明确范围。
- 源 08-20 已承诺开户时为个人租户建立 day-0 官方 Agent 的权益，并由 acquisition
  同日 sibling 承诺选用。该修订证明“官方所有”与“该用户已获权”仍是两件事；
  本轮不把当时实际挂载的角色列表或条数冻结为本项目出厂清单。
- 知识、报告和附件属于广义受治理材料，不是第五类顶层 Agent definition。
  附件要求及来源由 [PF-009](../requirements/product/user/PF-009-multimodal-input-attachments-and-commands.md)
  与[输入来源核对](user-input-and-command-sources.md)拥有；不能将所有工作材料
  硬分为 official/customized 或假设它们有相同发布、购买和版本生命周期。

本轮核对上述相关产品章节、来源设计及有效修订，未运行原系统，未采用源字段、
BC、表结构、注册协议或框架类型。文档检查不证明资产治理和权限隔离已经实现。

[portfolio]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-owner-scoped-agent-asset-portfolio-read.md
[entitlement]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-effective-agent-asset-entitlement-lifecycle.md
[personal]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-personal-tenant-provisioning-and-active-tenant-selection.md
[membership]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-organization-tenant-and-membership-lifecycle.md
[authoring]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-authorized-agent-asset-authoring-and-immutable-release.md
[acquisition]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-authorized-agent-asset-acquisition-and-version-selection.md
[journey]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/first-party-agent-asset-and-custom-agent-management-journey.md
[asset-design]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/agent-asset-definition-rights-and-portfolio.md
[sourcing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-025-agent-component-sourcing.md
[language]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/bounded-contexts/ubiquitous-language.md
[model-profile]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/blueprint-model-profile-as-one-fully-filled-form.md
[knowledge]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-governed-knowledge-and-behavior-asset-candidate-authoring.md
