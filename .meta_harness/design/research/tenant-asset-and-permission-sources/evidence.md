# 租户资产、权益与权限来源：证据记录

- 消费对象：TG/AU/BG 覆盖判断、条款 lineage 与 provider gap
- 源：`docs/research/tenant-asset-and-permission-sources.md`，固定提交 `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `0078c5d1912f43b41abfc5b9688fc61e91137c69ae0e2e9ae0e3923524010fe7`
- 取得：P0 固定源清单逐字节核对；源页内外部链接固定 omne-next 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`
- 实际观察：固定 omne-next 6263fed 的 accepted/current 要求与设计来源；official/customized 是来源轴，个人/组织是治理范围轴。
- 支持范围：只支持源页列出的文档/源码/测试事实及其明确局限
- 不支持：新 baseline 接受、运行符合、跨版本全面等价、未执行实验或未列出的产品政策

## 当前事实与反例

- Accepted/current 来源把 definition 来源、owner scope、entitlement、acquisition、installation/
  activation 与一次动作授权分成独立轴；official/customized 不能推出个人/组织 owner 或执行权。
- ADR-025 的 Accepted 设计曾描述 personal⊕organization⊕platform 自动 overlay 和 custom shadow；
  07-31 scope correction 已撤回通用性，当前候选必须从经验证 active tenant 的 ownership、
  entitlement、acquisition 与 grant 构成。恢复旧 overlay 会造成跨租户借权。
- 顶层 definition 仅 Skill、SlashCommand、Plugin、AgentBlueprint；Tool/Middleware 是组件，
  Hook/Rule 是成员，knowledge 不是第五种 definition。官方定义仍需 tenant entitlement；day-0
  entitlement 与 acquisition 也不能合成“官方 owner”。

## 可恢复坐标与状态

固定 `nemori-ai/omne-next@6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`：

| 来源 | 状态 | 路径 / 定位 |
|---|---|---|
| portfolio/entitlement/personal/membership | Accepted · current | `requirements/capabilities/tenant-owner-scoped-agent-asset-portfolio-read.md`；`tenant-effective-agent-asset-entitlement-lifecycle.md`；`tenant-personal-tenant-provisioning-and-active-tenant-selection.md`；`tenant-organization-tenant-and-membership-lifecycle.md`，Statement/AC |
| authoring/acquisition/journey | Accepted · current | `requirements/capabilities/agent-definition-authorized-agent-asset-authoring-and-immutable-release.md`；`...acquisition-and-version-selection.md`；`first-party-agent-asset-and-custom-agent-management-journey.md` |
| asset design | Accepted / Maturing design | `design_docs/cross-cutting/agent-asset-definition-rights-and-portfolio.md`，顶层清单与六事实面；不接受其 BC/聚合分工 |
| ADR-025 | Accepted design + 07-31 correction | `adrs/accepted/ADR-025-agent-component-sourcing.md`，D-2/D-3/D-8 与 correction |
| settings/language background | 历史设计，不是当前产品接受 | `design_docs/bounded-contexts/ubiquitous-language.md`；只能解释词汇 |

本轮只做固定 blob 静态阅读，未运行旧系统、迁移或权限隔离测试；字段、表、registry、BC 和
运行装配均不构成本项目实现证据。
