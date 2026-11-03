---
id: PD-schedules-and-jobs
title: 日程与作业
status: draft
revision: 2
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# 日程与作业

本 topic 维护未来安排、一次接受的工作及其执行、提醒、同意、订阅和结果交付。正文按产品需求、能力与状态、阶段支持、未决事项四块组织。

## 状态

产品负责人于 2026-11-03 确认完整复刻范围和单一终态设计；本页采用该范围内的产品规则，不将整份历史候选或来源系统实现一概视为已接受。环境跟随与显式绑定、双限额、草稿与原子替换、周期统一补跑均属于已确认选择。本文写回结果仍待独立评审与负责人接受，因此 topic 保留 draft 状态。

目标成员公开行为尚未实现，运行、目标 Node 24、耐久及跨域组合没有本次验收证据。源代码、文档检查或库探针不授予支持。完整范围已定，发布版本和实际交付接受仍由负责人确定，见正文末块。

## 阅读入口

- [产品正文](design.md)维护规则、用户路径、能力状态、可观察演示和有效未决。
- [领域责任](../../../../docs/domains/schedules-and-jobs/README.md)维护事实归属与协作边界。
- [能力组](../../../../packages/schedule/README.md)维护工程关系。
- [行为规格](../../../../packages/schedule/schedule/SPEC.md)及[内部设计](../../../../packages/schedule/schedule/docs/internals.md)维护精确行为、技术采用与验证义务。

## 与已有 topic 的关系

| topic                                                  | 消费修订                   | 关系                                                          |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------- |
| [日历](../calendars/README.md)                         | PD-calendars rev 2         | 供应日期身份、版本、覆盖和计算，日程采用依据并接受工作        |
| [会话与工作](../sessions-and-work/README.md)           | PD-sessions-and-work rev 7 | 外部承接指令与当前工作自唤醒；不成为日程核心的必需运行前提    |
| [Agent 定义与工作推进](../agent-progression/README.md) | PD-agent-progression rev 4 | 执行、成果和目标判断继续遵守原治理                            |
| [通知](../notifications/README.md)                     | PD-notifications rev 1     | 交付给定内容并返回真实通知事实，不接管时间规则和 Job 整体结果 |

<a id="source-scope"></a>

## 来源范围与条款定位

来源固定为 `omne-next @ a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0`。下表的 S 编号与 T 编号保留来源追踪身份，范围包含来源已承诺而尚未实现的条款；它们不是本仓库已通过测试的声明。技术实现及逐项验证由行为规格承接，本表只定位产品含义。

| 来源组及精确正文                                                                                                                                                                                                                      | 验收条款范围 | 产品拥有位置                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| [S01 安排管理、草稿和原子替换](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md)      | S01-T01–T14  | [J-SJ01](design.md#schedule-lifecycle)                            |
| [S02 非线性时间规则](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md)                   | S02-T01–T07  | [J-SJ02](design.md#time-rules)                                    |
| [S03 一次性执行与终局](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md)                          | S03-T01–T08  | [J-SJ04](design.md#recovery)                                      |
| [S04 版本日历与候选](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md)                                 | S04-T01–T07  | [J-SJ02、J-SJ03、J-SJ12](design.md#admission-limits)              |
| [S05 三历供应、种子与发行](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md)              | S05-T01–T11  | [日历 J-CA06–J-CA09](../calendars/README.md#source-scope)         |
| [S06 日历知识查询](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md)                      | S06-T01–T09  | [日历 J-CA01–J-CA04、J-CA08](../calendars/README.md#source-scope) |
| [S07 用户环境跟随](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md)                                     | S07-T01–T10  | [J-SJ12](design.md#environment)                                   |
| [S08 依赖恢复与终局失效](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md)        | S08-T01–T14  | [J-SJ04、J-SJ12](design.md#environment)                           |
| [S09 纯提醒](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md)                              | S09-T01–T05  | [J-SJ08](design.md#reminder)                                      |
| [S10 列表、修订、账本与 agenda](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md) | S10-T01–T11  | [J-SJ10](design.md#queries)                                       |
| [S11 依赖变迁通知](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md)                                    | S11-T01–T04  | [J-SJ12](design.md#environment)                                   |
| [S12 系统功能订阅](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md)                   | S12-T01–T08  | [J-SJ13](design.md#subscriptions)                                 |
| [S13 当前工作自唤醒](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md)                       | S13-T01–T09  | [J-SJ17，Session/Agent 拥有](design.md#self-wake-boundary)        |
| [S14 定时子工作交接](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md)                      | S14-T01–T08  | [J-SJ14](design.md#handoff)                                       |
| [S15 作者身份与分级同意](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md)                | S15-T01–T13  | [J-SJ15](design.md#consent)                                       |
| [S16 结果发布与主题归档](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md)                      | S16-T01–T08  | [J-SJ16](design.md#results)                                       |
| [S17 耐久通知与授权送达](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/agent-initiated-user-notification-durable-truth-and-authorized-delivery.md)      | S17-T01–T08  | [J-SJ18，通知拥有](design.md#notification-boundary)               |

来源 S02-T03 的旅行不重解释适用于显式绑定；S07 的日历与时区跟随适用于跟随模式。来源合格次数与实际 Job 次数分别受约束。周期恢复采用统一 none/latest N，最旧 pending 没有优先权；once、环境重新确定未来、提醒窗口及已接受 Job 恢复各守自身规则。S10-T09 的各期不同会话、S15-T08 的同定义独立 child 适用于新会话交接，不能扩张到已有会话路径。上述限定是目标产品规则，不能把目标通过称为源所有行为逐项等价。

## 维护

产品维护者更新规则、能力与适用关系，实现拥有者提供精确版本的支持证据，负责人决定发布和接受。含义变化同步真实消费者、统一语言与对象依据。活动卡、交流、来源快照、推导和检查日志留任务过程材料，正式正文不依赖它们才可读懂。
