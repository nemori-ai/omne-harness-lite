---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/future-planning-calendar-and-notification-sources.md
source_sha256: 4ffa29a824e7e05e0566b2040127a0d1ae71061b6c93a262cb1b03d828fcaac3
source_anchor: "heading:# 未来规划、日历与通知的来源核对"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---


# 未来规划、日历与通知的来源核对

[PF-011 正文](../../requirements/product/PF-011-future-planning-calendars-and-reminders/requirements.md) · [研究索引](../README.md)

2026-09-12 按用户本轮口述核对 `omne-next` 提交
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。下列来源均与固定提交 Git blob
逐字节核对，接受范围只按表中产品章节及有效修订映射，不等于接受源实现结构。

## 来源与确认范围

| 来源 | 源状态与核对范围 | PF-011 对应 |
|---|---|---|
| [日程管理与到期幂等][management] | Accepted · current，2026-07-30；Statement/lifecycle/到期边界；08-27 起草及原子改期为 committed-future amendment | C8/C9：持久管理、草稿不触发、替换可追踪、同一窗口不重复受理 |
| [确定性非线性重复][recurrence] | Accepted · committed-future，2026-08-04；表达/预览、有限边界、发生项身份 | C2/C7：复杂日期算术、次数/截止与预览；时区旧条款按后续环境跟随解释 |
| [业务日历感知日程][calendar-schedule] | Accepted · committed-future，2026-08-04；日历调整、版本采用、碰撞、AC-1～7 | C3/C7：逐日例外、过滤/平移、同版本一致、变更只影响未受理未来 |
| [日历数据供应与版本发布][calendar-supply] | Accepted · committed-future，2026-08-19，含 08-20/21 首次装载增补；扩展性、供应、首批与 day-0 条款 | C6：中/日/美初始范围、持续更新、覆盖与认知时间、版本出处和随包可用数据 |
| [日历知识查询][calendar-read] | Accepted · committed-future，2026-08-27；查询面及 CAL-AC-1～9 | C3/C7：Agent 与用户可查目录、日别、工作日算术和无副作用预览，同版本查询/到期一致 |
| [用户生效环境与日程跟随][environment-follow] | Ratified · committed-future，2026-08-20，含同日第三次口述；Outcome、UAC-1～3 及修订说明 | C7：生效时区及日历跟随、有界重算、显式固定例外与历史不倒改 |
| [一次性工作与完成][one-shot] | Accepted · committed-future，2026-08-11；S-1～3、08-13 执行状态澄清 | C2/C8/C9：一次性形态、按执行结果终结、到期条件不足的默认终止与可选等待 |
| [Agent 自建派发与分级同意][authoring] | Accepted · committed-future，2026-08-11，含后续草稿与命令分级修订；表达力及三类未来工作路径 | C1/C2/C8：Agent 与用户共用完整时间表达能力；专项授权仍归 PF-004.C8，本页不重写 |
| [Agent 定时自唤醒][self-wake] | Accepted · committed-future，2026-08-11；Actor、等待、接续、控制与 loop 边界 | C5：当前会话未来继续同一工作，不需逐次确认，耐久等待与单次接续；HITL 后续热宽限沿共享等待语义读取 |
| [仅提醒日程][reminder] | Accepted · committed-future，2026-08-27；承诺范围、RM-AC-1～5 | C4/C9：到期通知无需执行、发生项去重、错过不批量补发；互斥种类限制被本轮“和/或”明确扩展 |
| [通知耐久事实与授权送达][notification] | Accepted · current，2026-08-04；Statement、AC-1～8 | C10：站内耐久落点、按用户策略投递、真实结果、多路同一身份、HITL 不另造事实 |
| [日程观测与议程视图][observability] | Accepted · committed-future，2026-08-27；观测面、当日事实门控与历史窗口补充 | C11：日/周 agenda、逐发生项记录、定义修订与真实执行关联；不以字段推断价值或健康 |
| [依赖受阻、恢复与终局失效][dependency] | Accepted · committed-future，2026-08-04 / 08-05 合并；两状态轴、恢复/终局分支 | C9：暂时受阻不等于用户暂停，自动重评不是自动修复，不以同名替代物复活旧计划 |
| [日程状态变迁通知][standing-notice] | Accepted · committed-future，2026-08-27；来源与合并条款 | C11：受阻、恢复和失效主动通知；一般关机错过的统一处置在源仍有门控，不据它补造完整保证 |
| [个人版定时信源简报][personal-briefing] | Accepted · committed-future，2026-08-11；Outcome、PEB-1～5 | C1/C10 的产品旅程参照：信源 → 日程 → 工作 → 通知；至少机内及一条 owner 配置的机外路径，来源可追问，错过不伪造 |

PF-011.C1 的自主规划动因和基于变化重新安排，以及 C4 的组合效用，来自用户
本轮直接要求。表中局部来源不以自己的 actor 排除、狭义“非线性”定义或旧交付
范围收窄这些要求。已承诺未来内容按 SYS-CONTINUITY 继承，未宣布立即全部可用。

## 来源差异与当前处理

| 差异 | 当前处理与依据 |
|---|---|
| 仅提醒来源把提醒型/执行型列为互斥 | 用户本轮明确执行“和/或”通知。PF-011.C4 接受纯执行、纯提醒和组合三种产品结果；保留纯提醒零执行性质。旧互斥限制不继承为本项目约束；一种定义还是多个协作对象留待设计 |
| 非线性 recurrence 排除结果驱动、自适应及 Agent 管理 | 这是该源条目的范围；Agent authoring 已承诺完整表达力，self-wake 支持当前工作延后继续。本轮用户又直接确认更广规划动因与非线性规划，不能用单一重复规则文档否定；具体规划表示尚未选定 |
| 08-04 recurrence 说旅行只改显示、日程恒用创建时区 | 08-20 生效环境要求明确跟随时区/日历重算，适用于 follow 日程；explicit 固定语义保留。预览/到期的一致性以相同生效环境及版本为前提，不是“永不变化” |
| 早期日历按每条计划指定，后续要求用户单值生效日历 | 沿最新来源解释适用的 follow 计划；系统可提供和查询多份日历，不等于同一用户同时拥有多份默认生效日历。组织日程的设置关系仍须专项建模 |
| 三个初始日历与用户“多国家或地区” | 初始承诺随继承方向保留，目录可扩展；美国联邦日历范围明确。地区/行业历有独立身份，不把一个国家永远只有一本日历写进模型 |
| 原系统 cron 兼容路径和固定框架/组件 | 保留周期性产品表达，不将旧项目的实现兼容迁移义务带入本项目；单例 tick、CalendarOverlay、库与存储布局不随功能采用 |
| Source 的一般 missed-window 处置仍有缺口 | 仅提醒与个人版旅程明确错过不批量补发；一次性执行另有可选等待，周期受阻另有恢复语义。PF-011 不把它们合并成无条件补发或不补发，完整闹钟的离线与精度仍待设计 |
| 通知基础要求未指定外部 provider，个人版承诺至少一条机外路径 | 保留系统推送能力与可配置的实际外部路径，具体通道待选；创建通知、路由投递、人眼看到和 HITL 回答是不同结果 |

## 归属与证据边界

既有 [PF-004](../../requirements/product/PF-004-subagent-delegation-and-supervision/requirements.md)
与[完整 sub-agent 来源核对](../subagent-requirement-sources/research.md)继续拥有定时 handoff、
结果回流、计划分级同意及草稿激活。PF-011 拥有通用时间规划、日历、闹钟和通知；
[PF-008](../../requirements/product/PF-008-unified-decision-pool/requirements.md) 拥有需用户决定
事项的统一池。通知与决策不是两套相互替代的产品事实。

所列来源的日历供应、通知送达和复杂规划是产品承诺，源材料附带的实现记录未经
本轮重验。没有运行原系统，也未测试日历日期、实时钟精度、离线闹钟或外部送达。
本项目后续须以精确规格和对应证据验证；文件链接和文档检查不能证明能力已交付。

[management]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md
[recurrence]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md
[calendar-schedule]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md
[calendar-supply]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md
[calendar-read]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md
[environment-follow]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md
[one-shot]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md
[authoring]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md
[self-wake]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md
[reminder]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md
[notification]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md
[observability]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md
[dependency]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md
[standing-notice]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md
[personal-briefing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness_product_personal_edition/requirements/capabilities/personal-edition-scheduled-source-briefing.md
