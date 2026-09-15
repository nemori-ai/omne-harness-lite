---
kind: system-requirement
ids: [SYS-IDENTITY, SYS-KERNEL, SYS-SPEC, SYS-DEPLOY, SYS-TENANT, SYS-LLM, SYS-EXPERIMENT]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/constraints.md
source_sha256: 6e959ebecc755643f3a1988573a5135cf973bd06cf2aff765396965008650991
source_anchor: "heading:# 已确认的跨系统约束"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# 已确认的跨系统约束

系统要求（迁移坐标：`.meta_harness/design/requirements/system/README.md`） · 架构落实投影（迁移坐标：`.meta_harness/design/architecture/constraints/`）

以下各 ID 对应标题下的已确认正文，不包括后续设计候选。它们承接迁移前
architecture/constraints.md 的用户要求，来源范围见项目基线（迁移坐标：`.meta_harness/method/research/project-baseline/README.md`）。
2026-09-12 本轮用户叙述进一步明确组织或个人的服务对象与最终目标，已分别归属
目标正文（迁移坐标：`.meta_harness/design/requirements/system/README.md`）。迁移保留原 ID，不声称历史确认时已经使用这些新路径。

## SYS-IDENTITY

项目名为 omne-harness-lite，是更轻量化、更高性能的 OMNE harness 系统，以 Cordis
为内核，保留并遵循 omne-next/omne_harness 的核心设计理念和最佳实践，为服务于
组织或个人的智能体系统提供能力。功能继承的具体义务归 [SYS-CONTINUITY](../omne-next-continuity/requirements.md)。

## SYS-KERNEL

内核层复用 Cordis 与 DSH `agent` 原语；Agent Loop、Harness 层、工具协议、治理
和其他子系统由本项目自行定义和实现。DeepSeek Harness 不作为本项目的实现，
本项目不称为 Cordis Harness。实际采用的版本与实现映射仍需固定。

2026-09-13，用户补充确认维护边界：Cordis 直接使用官方发布的包；其他选定复用的
DSH 组件采用 fork，由本项目自行维护、拓展和二次开发。具体发布版本和导入范围
仍需逐项确定；这不表示所有 DSH 包都已选定，也不要求一般第三方依赖一并 fork。

## SYS-SPEC

设计保持编程语言无关，作为未来严格验证与跨语言复现的规格依据。TLA+ 表达行为
权威规格，Alloy 辅助验证结构约束，JSON Schema 定义数据契约；实现不能替代规格。

## SYS-DEPLOY

第一版完整交付是单机系统；设计阶段确保关键机制、模块和子系统具备清晰边界，
未来可独立扩展为分布式、异构物理节点和微服务化部署，而不改变领域语义。
该要求不预先要求全部分布式设施。

## SYS-TENANT

从第一天起支持租户隔离。受租户所有权约束的关键对象和跨边界操作显式携带租户
身份，跨租户访问默认拒绝；沿用 omne-next/omne_harness 的双层结构，区分自然人
全局身份与租户成员关系。自然人全局身份不被强行归为单一租户。

本条拥有全局隔离义务；[PF-001](../../product/PF-001-tenant-organization-context/requirements.md)
引用本条并拥有多组织协作要求，具体契约仍在候选阶段。

## SYS-LLM

所有模型请求统一经 OpenRouter 发送。该要求不决定尚未确认的模型档案与调用细节。

## SYS-EXPERIMENT

当前处于设计、规格建模与实验性演进阶段，尚未正式上线或对外提供生产服务。
接受有明确设计和验证依据的大胆重构，不为旧版本保留未经要求的实现兼容层；
历史材料的保留不构成兼容承诺。
