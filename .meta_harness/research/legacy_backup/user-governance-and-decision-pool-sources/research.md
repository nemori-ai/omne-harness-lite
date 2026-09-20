---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/user-governance-and-decision-pool-sources.md
source_sha256: e47e42022ab7b7894cef5b8159f50ed9a8f2e5fe9d9e76a5475e265acd5aefac
source_anchor: "heading:# 用户设置、系统 HITL 与决策池的来源核对"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---


# 用户设置、系统 HITL 与决策池的来源核对

[PF-006 设置与授权](../../../design_legacy/requirements/product/PF-006-user-settings-and-agent-definition-authorization/requirements.md) ·
[PF-007 系统 HITL](../../../design_legacy/requirements/product/PF-007-system-initiated-hitl/requirements.md) ·
[PF-008 决策池](../../../design_legacy/requirements/product/PF-008-unified-decision-pool/requirements.md)

2026-09-12 用户明确从 omne-next 继承这三项，并明确授权目标是 Blueprint /
Definition。本次使用干净检出提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，
下列源文件均与该 Git blob 逐字节核对。来源链接固定版本；本页核对产品含义，
不把来源 Draft、实现结构或历史交付状态作为本项目接受依据。

## 用户设置与定义级授权

| 来源 | 源状态与核对范围 | 用途 |
|---|---|---|
| [User Settings 聚合投影][settings] | Draft；§1～3 及设置清单 | 提供用户设置与授权代改的组织参考。跨 BC 投影、固定 UI/agent 交集及“所有用户事实都可委托”是旧设计主张，不随本次直接要求批准 |
| [Agent Blueprint 组成][blueprint] | Draft / 设计材料；§2.1～2.2 | 定义持有 permission base 和 ops defaults，用户授权覆盖另有事实；支持区分出厂材料与实际有效配置 |
| [权限设计][permission] | Draft / 设计材料；§1、§13.2 | 旧 `agent_id` 被解释为获授权 blueprint manifest；与本轮用户定义级口径相符，但旧字段、生命周期和身份合并不能直接搬入 |
| [设备能力同意与持续范围][device] | Accepted · current，2026-07-30，含后续语义澄清；Statement、AC-2～5 及生命周期 | 模式与范围分别选择、目标从发起会话权威派生、持续授权跨重启、撤销及实时准入；只在设备权限适用范围内映射 |
| [会话模型选择与连续性][model] | Accepted · current，2026-09-04；Statement、AC-1～3 | 设置覆盖实例：会话选择 → 用户偏好 → 定义默认，缺席回落、来源可解释、会话选择不外溢 |
| [账号级跨设备快捷键][keys] | Accepted · committed-future，2026-08-04；Actors and scope、Synchronization、Agent-requested change | 另一种设置作用域：UserAccount，合法动作绑定、授权代改和跨设备同一事实；不能据单个字段推导所有设置都属于 Agent 或 Tenant |

PF-006 的“用户设置可覆盖出厂默认”和“授权对象是定义”来自本轮用户直接确认，
不依赖把上述 Draft 升格。设备来源使用 `logical Agent`，旧设计使用 manifest
标识；本项目后续须显式映射定义、版本、会话与运行身份。单机部署、UserSettings
汇总面或工厂权限种子的历史代码位置都不决定本项目的语义拥有者。

设置草稿的“任意用户事实都能由 agent 修改”与较新的[官方能力要求][official]
保留 human-only、独立批准和 hard floor 的边界不能混读。本次只确认用户可管理
设置及授权；Agent 代改仍须由具体动作的有效要求和权限支持。系统默认可覆盖，
不代表用户有权覆盖租户隔离或所有治理要求。

## 系统发起 HITL

| 来源 | 源状态与核对范围 | 用途 |
|---|---|---|
| [HITL 触发与效果分类][hitl-design] | 设计材料；UC-1 的 Path A/B、2026-08-27 发起者及阻塞/暂行路区分，UC-2 | 系统基于动作权限、用户授权和会话权限模式要求 HITL，区别于 Agent 主动询问；批准前执行与暂行执行分别判断 |
| [编译与执行时授权分工][compile] | 设计材料；§1 的流程职责、§2 domain service 表 | 编译发布动作/权限投影与事实坐标，执行点结合有效授权检查；本轮“编译后需授权动作执行前拦截”由用户直接确认，不预选旧 PEP、类或包 |
| [受治理能力发现与调用][official] | Accepted · current；OHC-2/3、Failure and time semantics | 专用同意明确动作、目标和 scope；执行前 live check，权限变化、硬性拒绝与 human-only 边界不被覆盖 |
| [ADR-116][pool-adr] | Accepted，2026-08-28；D-2、D-9 | 原系统已把 harness authorization 列为统一池的未来路径。其“本期不实施”是源交付范围，不能否定本轮明确要求 |
| [暂行副作用确认][tentative] | Accepted · committed-future，2026-08-27；承诺范围、TE-AC-1～9 与 08-28 池呈现修订 | PF-007.C6/C7：显式资格、受遏制暂行产物、完整及级联撤销、一个决定多入口、按声明回传；非阻塞不是所有动作的默认待遇 |

源 UC-1 有旧 LangGraph、PAUSED、HostConsent 与 PermissionGrant 描述；它们不
构成本项目规格。系统发起的判断与请求后果可以复用产品语义，但如何编译、何处
执行、怎样停驻和恢复仍由后续建模定义。暂行资格不是 agent 对“可撤销”的自评。

## 决策池与直接作答

| 来源 | 源状态与核对范围 | 用途 |
|---|---|---|
| [主动人类请求要求][human] | Accepted · current；2026-08-28 / 09-01 / 09-08 amendments 与 AC-10/11 | 自包含池项、直接作答、状态与可答性分别表达、多个请求独立结算；原 PF-005 共享条款现由 PF-008 拥有 |
| [ADR-116][pool-adr] | Accepted；用户原话、D-1～6、D-9 与 08-31 / 09-01 amendments | 所有会话、agent 或系统请求集中呈现；源批准明确“无需打开会话”“提交后驱动后续”，请求类型保留自己的事实与效果 |
| [统一池设计][pool-design] | Draft / Maturing；§1～5.1 | 解释来源定位、呈现、作答及关闭出口；特别区分请求存在与作答路由此刻可达，不照搬表、事务、Gateway 或枚举策略 |
| [通知要求][notification] | Accepted · current；Statement、AC-3/5/6 | 注意力通知关联同一请求，已读不产生决定、送达失败不关闭请求、预览不能泄漏完整敏感内容 |

用户本轮“决策通知池”按可集中输入决定的语义登记为 PF-008，不将其降为通知
列表。来源的池与通知区分是事实和效果的区分，不通过本次需求记录选定页面布局。

## 修订、关联与证据边界

- **共享正文迁移。** PF-005.C8/C9 的通用池要求转由 PF-008 维护，原条款身份
  保留引用；PF-005 继续拥有 agent 请求内容与答复含义。PF-007 拥有系统请求，
  PF-004 的定时草稿等专项流程引用池，保持其独立授权与后果。
- **当前可见不等于此刻可答。** 源 2026-09-01 修订已收窄早期“可见必可答”
  说法；离线期间预收决定并重放尚非来源承诺。设备不可达不让请求消失，也不能
  伪报答复已受理。具体物理节点亲和策略不随池产品要求引入。
- **等待及暂行窗口不代替决定。** 08-31 允许有界热宽限后回收实例；09-08
  允许多个独立人类请求并存；暂行呈现窗口到期只改变呈现，不自动准驳。这些
  有效修订与正文一起消费，不能抄回旧“单一等待”或“固定驻留实例”的前提。
- **来源状态保持原义。** 已核对所列相关章节、明确业务裁决和有效修订，未
  运行原系统或重验其实现/交付声称。Draft 仅供解释，直接用户要求与已接受
  产品条款按范围登记；该研究提交不是整体 omne-next 功能继承的截止基线。

[settings]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/user-settings-aggregate-projection.md
[blueprint]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/subsystems/agent_blueprint/ddd/aggregates.md
[permission]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/bounded-contexts/bc-5-permission.md
[device]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-consented-device-capability-use.md
[model]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/durable-session-model-selection-and-non-degrading-continuity.md
[keys]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/useraccount-cross-device-session-run-control-keystroke-bindings.md
[hitl-design]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/hitl-design.md
[compile]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/subsystems/agent_blueprint/application-spec.md
[official]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/governed-official-harness-capability-discovery-and-invocation.md
[pool-adr]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-116-unified-pending-decision-pool-and-answer-as-owner-turn.md
[tentative]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-tentative-effect-confirmation-and-owner-review-pool.md
[human]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-human-input-request-durable-wait-and-causal-continuation.md
[pool-design]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/hitl-decision-pool.md
[notification]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md
