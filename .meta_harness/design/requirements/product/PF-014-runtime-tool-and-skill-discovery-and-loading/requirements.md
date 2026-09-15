---
kind: product-feature
id: PF-014
primary_dimension: agent
secondary_dimensions: [user, environment]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md
source_sha256: 21549bf444cf961dd9a46279bbb04bd5028cbeeaf9b0cbc0febd5ae0959a1b00
source_anchor: "heading:# PF-014：运行时发现与按需装载工具、技能"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-014：运行时发现与按需装载工具、技能

[智能体维度](../by-agent.md) · [来源核对](../../../research/dynamic-loading-and-artifact-sources/research.md)

主维度：智能体。副维度：用户、环境。2026-09-12 用户明确 Agent 应在运行时
发现并按需装载工具和技能，并授权结合 omne-next 的相关子系统、DSH 与 Cordis
补充。本项定义产品能力；服务注册、模型呈现和可执行实现的装配方式留待设计。

## 已确认要求

C1 是本轮直接要求；C2–C5 结合来源对发现、装载和使用的含义作细化，受已确认
的动态系统、租户、权限及执行环境要求约束。来源的具体 API 与装配策略未被采用。
2026-09-13 用户进一步明确部分工具必须与 skill 配套使用，存在 tool–skill
依赖关系；该新增要求记为 C6，具体依赖表示和 Cordis 映射留待设计。

- **PF-014.C1：运行时可发现并按需装载。** Agent 在运行过程中能够根据工作
  需要发现工具与技能，并装载使用所需内容或能力；不要求用户事先为该次工作
  枚举全部工具/技能，也不把重建整个 Agent 运行时作为每次发现或装载的前提。
- **PF-014.C2：发现信息与完整装载分开。** Agent 能利用用途、能力类型及
  当前可用条件等摘要选择候选，再按需取得完整工具调用定义，或技能正文与所需
  资源。可以保留常驻能力；不要求把所有工具定义、所有技能正文和文件一次性
  注入模型上下文。工具与技能可共同被发现，但后续装载和使用遵循各自含义。
- **PF-014.C3：候选集合和使用资格有明确上下文。** 发现与装载遵循当前
  租户、Agent 定义及选用版本、有效权限、部署装配和执行环境。可使用、可请求
  授权、当前不可用的状态应能区分；披露范围本身也受权限约束。发现条目、读取
  定义或装载技能不等于安装授权、调用授权或外部行动许可，实际使用仍检查当前
  依据。能力目录不可用或不完整不能伪装为成功的空清单。
- **PF-014.C4：装载的结果能支持实际工作。** 工具装载应使获准调用能够到达
  适配当前环境的实现，只有一份无法执行的 Schema 不足以表示可用。技能装载
  应提供可读的指引，并能按需取得或定位资源；资源路径应对应实际使用的宿主机
  或沙盒文件系统。读取技能不自动运行其脚本，也不自动装载全部附件或扩大权限。
- **PF-014.C5：变化与失败可辨认。** 安装、更新、停用、撤权或资源失效之后，
  后续发现、装载与调用应反映适用的当前状态；在安全的装配/请求边界更新模型
  所见内容，不能无声改写已经发出的请求。已发现条目可能在使用前失效，系统
  应明确反馈、重新求值或按规则请求授权。恢复后的运行时重新建立可用能力，
  不能把旧目录快照或历史装载记录当作仍有效的授权。
- **PF-014.C6：支持工具对技能的必需依赖。** 部分工具必须与配套技能一起
  使用；系统应能表达这种依赖，并在发现、装载及使用条件中体现，不能把必需
  配套关系仅当作可忽略的推荐。并非所有工具都必须依赖技能；依赖的粒度、
  版本约束、满足判据及变化后的处理方式由架构设计明确。
  用户同日进一步强调相关生命周期、效用与卸载撤回；本项沿
  [SYS-DYNAMIC.C2](../../system/fully-dynamic-system/requirements.md#已确认要求)处理，不能只做字段关联。

## 产品场景

| 场景 | 应有表现 |
|---|---|
| Agent 遇到尚未装载的工作方法或工具 | 能发现相关候选，理解用途及条件，按需取得完整内容并使用 |
| 发现一项有参考文件和脚本的技能 | 先取得技能指引，按工作需要读取资源；执行脚本另行遵循工具与环境权限 |
| 目录里已有工具，但当前装配缺少其执行环境 | 明确显示不可用原因或所需条件，不把名称可见当作调用成功 |
| 发现后用户撤销授权，或会话运行时重建 | 实际使用时采用有效状态，不延用失效权限；已发生的调用结果保留真实历史 |
| 工具要求配套技能，但技能尚未装载或不可取得 | 能辨认并处理该依赖，不把工具实现已注册等同于配套使用条件已满足 |

## 来源边界与待设计

omne-next 的统一能力发现支持摘要、完整定义与执行/激活分层；官方 Harness
能力发现提供治理补充，但其受管操作目录不等于所有工具的完整目录。DSH 的
技能目录与全文按需读取、工具注册和 Cordis 生命周期提供机制参考；它们不自动
实现本项目完整的工具搜索、租户授权或装载产品体验。

发现入口、排序/索引、常驻与按需选择策略、装载完成判据、资源缓存、版本及撤销
时效、在途调用与实现卸载的协调仍待建模。这里不选择某个搜索算法、工具名称、
middleware、插件代码分发方式或任意可执行扩展权限，也不承诺无需任何检查即可
热替换所有在途实现。

## 关联与落实

[PF-024](../PF-024-multi-command-tool-definition/requirements.md) 补充单槽位的多命令工具定义
范式；本项的发现和按需装载同样适用于这种入口，具体命令帮助及参数呈现待设计。

[PF-009](../PF-009-multimodal-input-attachments-and-commands/requirements.md) 拥有用户通过
slash 手动调用 Skill 的要求；自动发现不取代该入口。DSH 的斜杠词法不覆盖
本项目已有命令规则。[PF-010](../PF-010-organization-personal-assets-and-permissions/requirements.md)
拥有资产管理及来源/权益，[PF-006](../PF-006-user-settings-and-agent-definition-authorization/requirements.md)
拥有设置及定义授权生效，[PF-007](../PF-007-system-initiated-hitl/requirements.md) 拥有系统授权拦截。

[PF-012](../PF-012-computer-browser-shell-sandbox-and-native-use/requirements.md) 拥有
执行环境，[PF-015](../PF-015-artifact-management-and-isolated-working-copies/requirements.md) 拥有
持久制品与工作副本；技能内容、能力定义资产和工作制品保留各自语义。
[PF-016](../PF-016-agent-developed-cordis-plugins-and-live-deployment/requirements.md) 进一步允许
Agent 在权限策略下开发新插件并在线部署；本项继续拥有已有能力的发现与装载。
[SYS-DYNAMIC](../../system/fully-dynamic-system/requirements.md) 提供总约束。
Agent 核心候选（迁移坐标：`.meta_harness/design/proposals/agent-core/#当前需求对应与缺口`）尚缺完整
发现、按需装载与生效变化模型；本轮登记不改变候选接受状态。
