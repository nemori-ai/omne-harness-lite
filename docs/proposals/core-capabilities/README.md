---
kind: proposal
id: P-core-capabilities
status: accepted
scope: 会话、状态与持久化、工具、租户治理、模型及多模态的能力识别、精确契约与组合设计
---

# 核心能力设计

本任务承接 D-005～D-007，以已确认系统目标、产品需求和固定 DSH 复用来源为依据。
用户要求先识别 capabilities，再同时完成相互依赖的设计；设计已由
[D-008](../../decisions/D-008-core-capabilities.md)接受。执行范围与用户追加的
设计后 fork 授权见[工作计划](plan.md)，源码基线与目标实现分别验收。

既有 identity/live-agent v1 与 Agent/Session 附着组合 v1 保持有效。旧工具、租户、
模型、上下文候选及 tmp 复用评估作为输入，其历史状态不自动成为本轮正式选择。
共享身份、内容、授权和事实交接先统一，避免各专题复制同义契约。

- [能力与组合边界](capabilities.md)：阶段 1 的状态权威、依赖、系统审批落点及来源差异。
- [需求消费与覆盖](requirements.md)：本轮确认范围、相邻接口与尚未完成的部分。

- [共同数据与提交](shared-contracts.md)、[租户与授权](tenant-and-authorization.md)、
  [会话与运行](session-and-run.md)、[工具](tools.md)、[人类请求](human-decisions.md)、
  [模型与媒体](models-and-content.md)、[必要相邻能力](supporting-capabilities.md)：
  正式规格导航及保留的来源／取舍；规范正文已分拆迁移，不留并行 draft。
- [独立评审](review.md)、[验证映射](verification.md)、
  [发布清单](evidence/publication.json)：受审版本、发现处置、有限结果与未实现义务。
- [定向 fork 交付](fork/delivery.md)：固定来源的本地源码、公开基线入口、裁剪和实际检查。
- [职责包布局](fork/package-layout.md)：D-009 接受的能力族/叶子组织，及其[重组交付](fork/package-layout-delivery.md)。
- [第一批二次开发工作包](implementation/README.md)：集中维护目标边界、验收清单、实施规格、TDD 推进计划与交付对账；共享目标包已开始交付，最小运行基线与完整 M1/M2 尚未交付。
- [设计与规格维护交接](design-spec-maintenance-handoff.md)：交给规范与技能设计会话的讨论、具体缺口、成因及待确认的长期归属建议；不作为新规范的接受依据。

## 接受记录

2026-09-13，任务作者在用户要求完成本批能力设计、正式化并继续 fork 的授权
范围内，结合独立只读评审接受本轮设计。评审者未代为接受，也不表述为用户
逐条审阅了本轮新协议。接受对象为 catalog 中以 D-008 为依据的 13 个新 v1：
共享数据、耐久记录、共同准入、租户治理、动作授权、Session/Run、人类决定、
工具、模型、媒体、预算账务、工程观测与命令输入。

最终受审修订 `c966da10f1822542a69e0665c41fb4265bfc3989`；此前发现已逐项
修订并复核，范围内无未解决阻断。规范按编号条款归属拆分、移除候选 framing、
换成精确依赖链接；模型、配置、Schema 和组合场景按原字节迁移，差异与哈希
见发布清单。既有 12 份冻结文件保持不变。

本次证据为 7 个正向有限模型、15 项指定反例和 21 个结构样例符合预期，
不代表真实存储／执行器／OpenRouter／媒体／财务提供者或完整应用已验收。
需求及补充计划由交付的 bundle 独立恢复验证，保留引用尚未推送远端。
后续源码 fork 消费本次契约及单独施工计划；目标语义缺口继续明确记录。
