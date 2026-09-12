# 现有内容迁移提案

[方案首页](README.md)

## 目录

- [盘点与迁移原则](#盘点与迁移原则)
- [文档迁移映射](#文档迁移映射)
- [九项旧模型的语义去向](#九项旧模型的语义去向)
- [规格及工具迁移映射](#规格及工具迁移映射)
- [实施顺序与完成判据](#实施顺序与完成判据)

## 盘点与迁移原则

本方案基于当前工作区文件，包含尚未提交的内容。现有 `spec/domain/registry.json` 登记 9 项 `current` 模型；其中 4 项附有 Schema，2 项有独立 `current.json`。另有系统提示词、工具和执行语义的待评审提案。当前架构指南共 24 篇 Markdown 文档。

现有 `current` 只证明登记了当前版本，不能据此补写“用户已批准”。迁移需要逐项保留已有接受依据：已明确接受的要求继续有效，缺少接受依据的具体定义留在提案供 review。也不因为原来使用 DDD 名词，就把所有有效设计一律撤销。

本方案区分三件事：搬移资料、转换组织方式、改变系统语义。前两件不能自动授权第三件。

## 文档迁移映射

| 现有内容 | 建议去向 | 处理方式 |
|---|---|---|
| `docs/architecture-guide/**` | 原路径保留 | 更新权威入口及少量旧术语链接，不重排 24 篇专题 |
| `docs/defensive-patterns.md` | 原路径保留 | 按防御演化提案补充范围、归属与证据；澄清过宽承诺，按需导航，新增和退出均有依据 |
| `docs/dsh-cordis-fully-dynamic.zh.md` | `docs/research/dsh-cordis-dynamic/` | 保留来源和核对范围；旧结论与后续研究不一致处标明修正依据 |
| `docs/architecture.md` 的 Purpose、内核复用及当前系统概览 | `docs/architecture/README.md` | 精简为当前设计视图，区分设计目标与已经实现的事实 |
| Deployment baseline、租户隔离、OpenRouter 及初始系统要求 | `docs/architecture/constraints.md` | 保存已确认要求，链接具体规格或明确尚未落实 |
| Cordis-native modeling 部分 | 已确认方向进入当前架构；详细方法链接现有指南 | 用户本次已经明确不再套用 DDD 分类；具体能力边界仍逐项判断 |
| Invariant definitions 的项目方法部分 | 链接现有指南的不变量专题；未决表示方案留提案 | 避免再创建第二套不变量方法；不擅自发布规则 Schema |
| DSH Harness decomposition 及上游 invariant 实现细节 | 对应 `docs/research/` 主题 | 作为固定版本参考，不冒充项目当前组件图 |
| Industrial design theories | 与指南比对后将有用差异归入对应专题，必要来源留研究 | “可以参考”与“已经选用”区分；去除 DDD 强制前提及未采用模式的承诺 |
| Runtime layers | 当前架构视图与待评审提案分别承接 | 保留 Agent/Loop 的已确认分工；未批准的 Session/Turn/Run/Step 关系不升格 |
| Dynamic state keys and prompt bindings | `docs/proposals/agent-core/` 中的对应讨论 | 保留用户确认的静态/动态提示词需求及未决绑定政策 |
| 根 `README.md`、`AGENTS.md` | 原路径保留 | 更新地图及建模用语，保持租户和共享定义要求的强度 |
| 双端 `architecture-design` skill | 原路径保留 | 更新当前架构、规格清单、提案和维护入口，内容保持一致 |
| 其他 skill 中确实受影响的旧链接 | 原路径保留 | 定向修复，不借迁移扩展 skill 职责 |

新增的知识流转和防御演化规则分别落到 `docs/maintenance/`；本次社区调查在未来采用时归入 `docs/research/` 并保存固定来源版本。当前没有必须迁移的事故复盘，不为填满目标树创建空事故文档。既有防御条目的具体范围调整按[防御模式演化](defensive-evolution.md)逐项判断，不假定整份旧文档都应删除或原样永久保留。

历史资料中保留准确描述原系统的 DDD 名词；本项目当前约定不再要求按聚合分类。根 AGENTS 中“关键聚合根携带租户身份”建议改为“受租户所有权约束的关键对象与跨边界操作显式携带租户身份”，并保留默认拒绝跨租户访问的要求。全局自然人身份等例外依据已有租户模型解释，不能粗暴给每个对象加一个 `tenant_id`。

“全系统共享同一套领域建模”可以凝练为“全系统共享同一套权威概念与契约；同义定义跨能力、服务和实现复用”。这改变组织术语，不降低复用要求，也不禁止在自然语言中使用“领域语义”。

## 九项旧模型的语义去向

下表中的目标路径是**候选归属**。只有既有接受依据或后续明确接受支持相应契约时，才进入正式目录；否则候选正文在 `docs/proposals/tenant-contracts/` 或 `docs/proposals/model-contracts/` 内 review。表中的能力名称不构成服务边界批准。

| 旧定义 | 数据部分的候选归属 | 行为与关系如何保留 |
|---|---|---|
| `domain.aggregate.Tenant@1` | `spec/data/tenant/v1/contract.md` | 创建、关闭、成员管理、活动租户解析等规则按实际责任进入能力提案；租户与成员的约束不能随“聚合”标签一起删除 |
| `domain.entity.UserAccount@1` | `spec/data/user-account/v1/contract.md` | 保留自然人身份与多租户关系；认证与可信身份输入边界仍需行为契约承担 |
| `domain.entity.Membership@1` | `spec/data/membership/v1/contract.md` | 保留 `(tenant_id, user_id)` 身份及关联完整性；成员关系修改和授权由拥有行为的能力表达 |
| `domain.aggregate.LLMProfile@1` | `spec/data/llm-profile/v1/contract.md` | 档案创建、更新、撤回、复活、官方种入限制进入模型目录能力提案；请求发送和会话选择保留各自责任 |
| `domain.value-object.ModelRouting@1` | `spec/data/model-routing/v1/contract.md` | OpenRouter 路由约束含义保留；实际应用这些约束属于模型请求行为 |
| `domain.value-object.ModelModalities@1` | `spec/data/model-modalities/v1/contract.md` | 保留输入/输出模态含义和集合约束 |
| `domain.value-object.ModelLimits@1` | `spec/data/model-limits/v1/contract.md` | 保留限额含义；超过限额的运行行为不由数据 Schema 单独决定 |
| `domain.enum.ModelOrigin@1` | `spec/data/model-origin/v1/contract.md` | 保留词表；`official` 的写入授权条件属于档案管理行为 |
| `domain.enum.AptitudeTier@1` | `spec/data/aptitude-tier/v1/contract.md` | 保留声明等级与运行时保证的区别，不把声明直接当作能力事实 |

旧 Tenant 和 LLMProfile 同时包含数据、命令、事件和生命周期，不能只更名后放进 `data/`。拆分时建立旧章节到新归属的对照，并逐项确认身份、权限、状态转移、关联完整性和不变量均有承接。

新身份不使用旧 `domain.aggregate.*` 的自动别名。数据契约不是旧聚合整体的同义替换；映射应标明“数据部分承接”“行为部分承接”或“纯命名迁移”，不能宣称不存在差异。

当前 LLMProfile 的文字要求固定九个应用能力键，而现有 Schema 的 `aptitudes` 只声明对象及最少属性数，尚不足以表达同一限制。这是迁移时必须显式保留的规格缺口，不在本轮自行补齐键集或宣布 Schema 已完整。

## 规格及工具迁移映射

| 现有文件或目录 | 建议去向 | 保留与修改边界 |
|---|---|---|
| `spec/domain/**` 原件 | `spec/archive/ddd-models/domain/**` | 原始定义、Schema、登记和指针保持原件；外层索引标明历史性质和新归属。内部相对结构保留 |
| 4 个原有 Schema | 原件随历史快照保留；候选新版本跟随相应数据契约 | `$id`、`$ref` 和拆分关系重新核对，不能覆盖旧 Schema 后仍声称原版本未变 |
| `spec/domain/registry.json` 的有效目录职责 | `spec/catalog.json` | 登记已接受的新身份；原 `current` 状态不自动转换成接受依据 |
| 旧分类索引与两个 `current.json` | 历史快照保留；新目录以 README 和单一清单承接 | 有效入口中不再维护并行 DDD 分类和多份当前指针 |
| `spec/proposals/agent-core/v1/**` | `docs/proposals/agent-core/v1/**` | 保留全部提案、Schema 附件、示例、来源和 review 内容；修复相对链接并明确物理迁移 |
| `spec/traceability/agent-core-proposal-v1.md` | 上述提案目录中的 `traceability.md` | 保留提案内需求与来源映射，修复旧登记路径；不恢复已撤回模型 |
| `spec/tla/README.md`、`spec/alloy/README.md`、`spec/schemas/README.md` | `docs/maintenance/verification.md` 与规格入口的必要导航 | 保留工具分工和使用要求；将来模型跟随语义归属。当前这些目录没有实际模型可迁移 |
| `spec/scenarios/README.md`、`spec/traceability/README.md` | 维护规范及各契约的场景/验证说明 | 保留验收和追踪要求，消除“必须先落 domain”的前提 |
| `spec/README.md` | 原路径重写 | 正式规格入口与新分类、引用规则、历史入口 |
| `spec/Makefile`、根 `Makefile` | 原路径保留 | 适配实际验证任务和目录清单，区分环境检查与规格验证 |
| `spec/tools/check_agent_core_proposal.py` | 保留可用检查意图，按新结构改造或替换 | 当前硬编码了 `domain` 和提案路径，只查登记和文档链接；不能作为行为验证依据 |

当前 `make spec-check` 调用的是 `check-tools`，缺少工具时仍可能正常退出，JSON Schema 也只是输出 dialect 信息。迁移后的检查说明和命令行为要一致：实际需要执行的任务不能以提示消息代替执行成功。本方案没有运行或补写形式模型。

旧原件归档可让本轮尚未提交的内容也保持可 review、可追溯；不能假定 Git 历史已经保存了这些文件。这个归档是设计历史，不要求实现支持旧 API，也不新增运行时兼容适配器。

## 实施顺序与完成判据

1. 确认目录职责、版本身份和接受规则；确定现有定义的接受依据与尚未决定的部分。
2. 建立必要索引及维护规则，保存旧原件，按映射迁移研究与提案。
3. 将有依据的有效规格放到新归属，其他内容保持候选；为拆分定义保留逐项映射。
4. 更新架构视图、根入口、相关指南、工具和双端 skill；检查旧有效入口是否仍被误用。
5. 验证文件覆盖、链接/锚点、ID 和版本引用、Schema 本地解析，以及实际存在且受影响的验证任务。

完成时应能列出：迁移前全部文件的去向、保留的接受状态、已解决与未解决的语义缺口、仍未形式化或未验证的部分。正式有效区不再依赖旧 DDD 分类；历史原件和未批准提案仍然可读。

目录一致性检查通过只说明迁移完整，不代表租户、模型、提示词、工具或执行语义已经设计完成。
