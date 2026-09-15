---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/personal-edition-requirement-gap-audit.md
source_sha256: 55643146129340ac00f3404a1887ae096685c428d2139584965c10a9a7effd8c
source_anchor: "heading:# 个人版产品要求的本质比对与 GAP 处置"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---

# 个人版产品要求 GAP 的当前处置

源审计曾按九项候选缺口比较个人版产品要求；本轮只保留 2026-09-12 用户对这些缺口的最终处置，原逐项候选论证由源提交和哈希恢复。

## 当前有效处置

| 原缺口 | 用户处置及当前需求归属 |
|---|---|
| GAP-01 长期记忆 | 暂不新增独立产品要求；当前只消费既有知识/认知范围，新的长期记忆要求仍待用户明确 |
| GAP-02 使用历史与因果依据 | 不作为独立产品要求；工程诊断归 `SYS-OBSERVABILITY`，Agent 可查询的历史归 `PF-017` |
| GAP-03 自主活动总控 | 由 `PF-013` 的会话生命周期/检索与 `PF-011` 的日程管理组合承载，不新增“统一总控”要求 |
| GAP-04 用量、开销和预算 | 已形成 `PF-019`，包含租户订阅/额度/账单/预算及逐 Step 金额归因 |
| GAP-05 完整产品运维 | 不按原宽泛缺口整体接受；已确认部分分别进入环境、资产和部署要求，剩余范围继续待明确 |
| GAP-06 备份/恢复 | 不新增面向用户的完整备份产品要求；已确认的运行时恢复目标归 `SYS-RUNTIME-CONTINUITY` |
| GAP-07 局部离线和降级 | 已形成 `PF-020`，要求按实际依赖诚实表达可用性和降级 |
| GAP-08 多机器接入与工作落点 | 已形成 `PF-021`，同时受 `SYS-DEPLOY` 的首版单机约束 |
| GAP-09 流式与多模态结果 | 多模态输出形成 `PF-022`；流式交付未因审计自动获得完整新承诺 |

## 证据与局限

当前处置可由 `docs/research/personal-edition-requirement-gap-audit.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46` 恢复，SHA-256 为 `55643146129340ac00f3404a1887ae096685c428d2139584965c10a9a7effd8c`。本页不保留原候选能力清单，也不据审计补造新的要求、能力维度或实现结论；各 PF/SYS 正文拥有最终确认范围。
