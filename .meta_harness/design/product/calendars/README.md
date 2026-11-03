---
id: PD-calendars
title: 日历
status: draft
revision: 2
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# 日历

本 topic 维护中、日、美三份业务日历的日期知识、版本、供应和查询。正文按产品需求、能力与状态、阶段支持、未决事项四块组织。

## 状态

产品负责人于 2026-11-03 确认完整复刻范围和单一终态设计；本页采用该范围内的产品规则，不将整份历史候选或来源系统实现一概视为已接受。环境跟随与显式绑定、双限额、草稿与原子替换、周期统一补跑均属于已确认选择。本文写回结果仍待独立评审与负责人接受，因此 topic 保留 draft 状态。

目标成员公开行为尚未实现，运行、目标 Node 24、耐久及跨域组合没有本次验收证据。源代码、文档检查或库探针不授予支持。完整范围已定，发布版本和实际交付接受仍由负责人确定，见正文末块。

## 阅读入口

- [产品正文](design.md)维护规则、用户路径、能力状态、可观察演示和有效未决。
- [领域责任](../../../../docs/domains/calendars/README.md)维护事实归属与协作边界。
- [能力组](../../../../packages/calendar/README.md)维护工程关系。
- [行为规格](../../../../packages/calendar/calendar/SPEC.md)及[内部设计](../../../../packages/calendar/calendar/docs/internals.md)维护精确行为、技术采用与验证义务。

## 与已有 topic 的关系

| topic                                         | 消费修订                    | 关系                                                                |
| --------------------------------------------- | --------------------------- | ------------------------------------------------------------------- |
| [日程与作业](../schedules-and-jobs/README.md) | PD-schedules-and-jobs rev 2 | 消费日期知识；拥有环境跟随、日历采用和 Job 接受，日历不接管工作状态 |
| [通知](../notifications/README.md)            | PD-notifications rev 1      | 承接合法供应风险提示；供应状态仍归日历                              |

<a id="source-scope"></a>

## 来源范围与条款定位

来源固定为 `omne-next @ a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0`。下表的 S 编号与 T 编号保留来源追踪身份，范围包含来源已承诺而尚未实现的条款；它们不是本仓库已通过测试的声明。技术实现及逐项验证由行为规格承接，本表只定位产品含义。

| 来源组及精确正文                                                                                                                                                                                                         | 验收条款范围 | 产品拥有位置                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------- |
| [S04 版本日历与候选](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md)                    | S04-T01–T07  | [J-CA02–J-CA04、J-CA08；安排采用归日程](design.md)                           |
| [S05 三历供应、种子与发行](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md) | S05-T01–T11  | [J-CA06–J-CA09](design.md)                                                   |
| [S06 日历知识查询](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md)         | S06-T01–T09  | [J-CA01–J-CA04、J-CA08](design.md)                                           |
| [S07 用户环境跟随](https://github.com/nemori-ai/omne-next/blob/a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md)                        | S07-T01–T10  | [J-CA05；跟随语义归日程 J-SJ12](../schedules-and-jobs/design.md#environment) |

## 维护

产品维护者更新规则、能力与适用关系，实现拥有者提供精确版本的支持证据，负责人决定发布和接受。含义变化同步真实消费者、统一语言与对象依据。活动卡、交流、来源快照、推导和检查日志留任务过程材料，正式正文不依赖它们才可读懂。
