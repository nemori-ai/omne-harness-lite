---
id: PD-meta-capabilities
title: 元能力入口
status: accepted
revision: 4
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# 元能力入口

本 topic 维护已接受的元工具产品设计，包括入口、关键旅程、可观察判据、能力状态、阶段与未决。Code() 是独立程序编排入口。Engram() 与 Stop() 仅占位，Stop() 不在 0.1.0 引入。设计接受不表示已实现，也不补定阶段表中未定的版本。

## 阅读入口

- [入口总表](design.md#入口清单与分工)导航 Tools、Skills、Files、Shell、Web、Browser、Computer、Agents、TodoItems、BkgJobs、Ask、Cordis、Engram，以及 Code 程序编排入口。Stop 仅保留名称占位。
- [关键用户旅程与判据](design.md#关键用户旅程与可观察判据)说明使用路径和必须守住的异常边界。
- [能力与状态](design.md#能力定义与实现状态记录表)、[阶段承诺](design.md#阶段与版本支持承诺)和[未决](design.md#未决问题与待定事项)分别记录定义、实际证据和待承接责任。
- [Meta Capability 词义](../../ubiquitous_language/terms/capabilities-and-composition.md#ul-meta-capability--meta-能力--meta-capability)拥有统一概念。
- [工具执行产品](../tool-execution/design.md#可编程调用许可)拥有目标工具的 programmable 声明和缺省拒绝。
- [Tool 领域](../../../../docs/domains/tool-execution/README.md)和[Tool 成员](../../../../packages/tool/tool/README.md)拥有调用、准入及真实执行责任。

## 维护

产品负责人确认新的入口选择、名称及阶段。各入口沿实际领域承担业务责任，技术契约、提供者与装配分别设计，不新建统一元工具领域或运行时。Engram 保留知识结构定位，不定命令及实现；Stop 只保留名称与阶段边界，不展开行为。

有效入口规则、旅程和判据由本 topic 维护。版本范围与尚未裁定的问题见正文的阶段表和未决事项。