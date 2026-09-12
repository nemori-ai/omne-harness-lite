---
kind: decision
id: D-003
status: accepted
scope: 防御指导与开发模型评估
date: 2026-09-12
sources:
  - ../proposals/documentation-system/README.md
  - ../research/framework-governance/README.md
acceptance: ../proposals/documentation-system/README.md#接受记录
supersedes: []
---

# D-003：防御指导与开发模型评估

## 决定

系统保证与模型辅助分开维护。切换开发主力模型前，必须评估相关防御模式在候选模型、任务和工具条件下是否仍需强制遵循；比较保留、简化或移除的效果，并保留可复现证据和采用决定。主观声称内化或仅版本更新不构成退出依据。

## 理由与取舍

所有提醒永久累加会增加成本并限制能够自主工作的模型；随模型升级一律删除则缺少证据。采用限定范围、对照验证和可回查的精简。系统保证不因删减提醒而撤销。

## 落实与边界

维护方法见 [防御演化](../maintenance/defensive-evolution.md)，专门体系见 [开发模型评估](../evaluation/README.md)。本次交付评估规范和脚手架，不声称已完成任何真实候选模型评估。

## 复核条件

出现与本决定前提有关的新要求、可复现反例或环境变化时，按 D-002 记录新观测与因果解释；没有新观测时直接沿用决定。
