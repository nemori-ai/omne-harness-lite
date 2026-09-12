---
kind: decision
id: D-002
status: accepted
scope: 决定权威与因果复议
date: 2026-09-12
sources:
  - ../proposals/documentation-system/README.md
acceptance: ../proposals/documentation-system/README.md#接受记录
supersedes: []
---

# D-002：决定权威与因果复议

## 决定

在同一适用范围内，没有新观测时，有效决定具有最终权威。决定至少关联一份提案或研究。推翻需说明新观测、旧前提为何失效、因果解释、复现方法和验证证据，并经相应授权形成取代记录。新的措辞、偏好、重复旧争论或单纯更换执行 agent 不构成新观测。

## 理由与取舍

允许无新依据反复争论会导致架构漂移；完全禁止改变则无法响应反例和环境变化。采用有证据的可追溯复议，机械检查验证结构，人负责判断因果论证是否充分。

## 落实与边界

完整规则见 [知识流转](../maintenance/knowledge-flow.md)，元数据与检查见 [验证约定](../maintenance/verification.md)。用户明确的新要求是需要记录的输入变化；事实与安全故障如实报告，不因决定权威掩盖反例。

## 复核条件

出现与本决定前提有关的新要求、可复现反例或环境变化时，按 D-002 记录新观测与因果解释；没有新观测时直接沿用决定。
