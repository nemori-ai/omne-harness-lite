---
kind: decision
id: D-001
status: accepted
scope: 文档与规格体系
date: 2026-09-12
sources:
  - ../proposals/documentation-system/README.md
acceptance: ../proposals/documentation-system/README.md#接受记录
supersedes: []
---

# D-001：文档与规格体系

## 决定

采用能力、数据和组合契约组织 spec；docs 按当前架构、方法、提案、决定、研究和维护职责分工。同义定义复用、规范精确引用，发布版本不可覆盖，历史与候选退出有效规格清单。

## 理由与取舍

继续按 DDD 战术分类组织不能直接表达动态能力与组合；只按工具分类会使一项能力的语义分散。保留现有 spec 名称与架构指南路径，避免无收益的改名。

## 落实与边界

组织与维护规则见 [维护入口](../maintenance/README.md)，具体契约入口见 [规格](../../spec/README.md)。本次不批准旧候选业务模型。

## 复核条件

出现与本决定前提有关的新要求、可复现反例或环境变化时，按 D-002 记录新观测与因果解释；没有新观测时直接沿用决定。
