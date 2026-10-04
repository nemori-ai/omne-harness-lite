---
kind: system-requirement
ids: [SYS-IDENTITY, SYS-KERNEL, SYS-SPEC, SYS-DEPLOY, SYS-TENANT, SYS-LLM, SYS-EXPERIMENT, SYS-OPEN]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/system/constraints.md
source_sha256: 6e959ebecc755643f3a1988573a5135cf973bd06cf2aff765396965008650991
source_anchor: "heading:# 已确认的跨系统约束"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---

# 已确认的跨系统约束

以下各 ID 对应标题下的已确认正文，不包括后续设计候选。可恢复来源由[来源、确认与变化](changes.md)及本页 front matter 的
`source_commit`、`source_file`、`source_sha256` 与 `source_anchor` 共同固定。新增或冲突输入按
`harness-design-handbook` skill 的「需求归位」→「绑定当前系统而非历史设想」处理。
2026-09-12 本轮用户叙述进一步明确组织或个人的服务对象与最终目标，已分别归属
目标正文。条款保留原 ID。

## SYS-IDENTITY

项目名为 omne-harness-lite，是更轻量化、更高性能的 OMNE harness 系统，以 Cordis
为内核，保留并遵循 omne-next/omne_harness 的核心设计理念和最佳实践，为服务于
组织或个人的智能体系统提供能力。功能继承的具体义务归 [SYS-CONTINUITY](../omne-next-continuity/requirements.md)。

## SYS-KERNEL

从 DeepSeek Harness 仅复用 Cordis，直接使用官方发布包，不复用 DSH `agent` 原语。
Agent Runtime（Agent Loop）完全由本项目自主设计；Harness 层、工具协议、治理
和其他子系统同样由本项目自行定义和实现。DeepSeek Harness 不作为本项目的实现，
本项目不称为 Cordis Harness。实际采用的 Cordis 版本与实现映射仍需固定。

2026-09-28，用户明确纠正复用边界：仅采用 Cordis，自主设计 Agent Runtime（Agent Loop），
不采用 DSH `agent` 原语。本条取代此前「Cordis 与 DSH `agent` 原语」的复用范围，
以及 2026-09-13 对其他选定 DSH 组件采用 fork 的安排；确认来源与影响见 [changes.md](changes.md)。

2026-10-01，负责人重定 Cordis 的定位：它仍是内核，是让本项目有条件实现完全动态系统的、
**全系统集成装配时要满足和遵循的契约规范**——架构设计与实现出来的东西，要能以 fiber、plugin、service、inject
的方式集成装配；**它不是建模的视角**。领域与能力独立于 Cordis 建模，装配时逐项核对符合性。
复用范围与采用方式不变。接受记录见 [D-112](../../record/decisions/cordis-as-assembly-contract/README.md)，
确认来源见 [changes.md](changes.md#2026-10-01重定-cordis-的定位)。

## SYS-SPEC

公开 TypeScript 类型与必要运行时校验拥有模块形状；类型表达不出的不变量、失败、
副作用、并发、取消与恢复承诺由模块旁薄规格约束。设计不再要求编程语言无关。
重要隔离、事务、恢复和进展问题仍保留相称的模型、探针或故障测试；实现不能替代承诺。
规格与资源的唯一归属及未迁旧源读法见[架构维护入口](../../architecture/README.md)，
确认与部分取代范围见 [D-115](../../record/decisions/actual-architecture-and-thin-spec/decision.md)。

## SYS-DEPLOY

第一版完整交付是单机系统；设计阶段确保关键机制、模块和子系统具备清晰边界，
未来可独立扩展为分布式、异构物理节点和微服务化部署，而不改变领域语义。
该要求不预先要求全部分布式设施。

## SYS-TENANT

从第一天起支持租户隔离。受租户所有权约束的关键对象和跨边界操作显式携带租户
身份，跨租户访问默认拒绝；沿用 omne-next/omne_harness 的双层结构，区分自然人
全局身份与租户成员关系。自然人全局身份不被强行归为单一租户。

本条拥有全局隔离义务；[PF-001](../../product/PF-001-identity-scope-and-agent-constraints/design.md) 引用本条，
并在其上展开账号、组织、租户三层身份与多组织协作的产品模型。
本条是被展开的那一方：产品设计可以更细，但不得削弱本条。

## SYS-LLM

所有模型请求统一经 OpenRouter 发送。该要求不决定尚未确认的模型档案与调用细节。

## SYS-EXPERIMENT

当前处于设计、规格建模与实验性演进阶段，尚未正式上线或对外提供生产服务。
接受有明确设计和验证依据的大胆重构，不为旧版本保留未经要求的实现兼容层；
历史材料的保留不构成兼容承诺。

返回[基础前提](../README.md)。

## SYS-OPEN

2026-09-25 产品负责人确认：本项目按**开源框架**的角度设计，提供最大限度的开发者自定义灵活度。
调用模型、执行工具这类核心能力，各自是**可公开的、独立的函数闭包**（如 `invokeModel`、`invokeTool`），
不依赖任何运行时、会话、租户或存储即可单独使用；本项目的 runtime（会话、账本、租户、放行等）只是
这些闭包的**一种消费者**——harness 自己用的那一种。其他人可以在外面用别的方式包装同一批组件。
组件的内部构件（解析、装配、判定、投影、传输适配、执行者、转换件、重试件等）同样以可替换、可单独取用的
形态公开，运行时对它们的编排不是它们存在的前提。

这一条约束提供者与装配的形状（每个节点须区分「公开函数面」与「Cordis 服务面」，前者不得被后者吞没），
不改变各契约对运行时层承诺的不变量：只在运行时层成立的性质（如「一个逻辑回复只发一次」「停机不重来」）
由运行时层承担，函数层不作此承诺，节点须写明。
