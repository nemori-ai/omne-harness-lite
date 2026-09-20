# 已确认的跨系统约束

本信息包拥有 **SYS-IDENTITY、SYS-KERNEL、SYS-SPEC、SYS-DEPLOY、SYS-TENANT、SYS-LLM、SYS-EXPERIMENT** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入；未另增确认缺口
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

本段按身份导航本 topic 中七项跨系统约束；它不是逐条 requirement coverage 结论。每行的 candidate
spec、目标 provider 或已接受机制决定，都不能单独证明当前基线已采用、实现或验证。

- 需求确认状态：七项约束均已确认范围等价迁入；以本 topic 的正文和变更记录为准。
- 规格采用状态：下列 candidate spec 尚未在当前基线的 catalog 中采用或发布。
- Provider、assembly 与实现验证：provider 设计只表示目标兑现路径；当前没有实际 assembly topic，未形成系统级集成交接或验证结论。

| 系统身份 | 设计覆盖状态 | 当前可复用设计落点 | 覆盖边界与主要缺口 |
| --- | --- | --- | --- |
| `SYS-IDENTITY` | `正在设计（直接候选机制）` | **Agent Runtime Identity candidate**、**Tenant Governance candidate** | 全局自然人身份、租户成员关系和跨能力采用仍未形成条款级分析。 |
| `SYS-KERNEL` | `正在设计（直接候选机制）` | **DSH core adoption decision**、**DSH core adoption proposal** | D-006 已接受；当前新基线的 source adoption 传播、catalog 与专题契约整合尚未闭合。 |
| `SYS-SPEC` | `正在设计（直接候选机制）` | **spec 入口**、**documentation-system decision** | 当前缺少 catalog、冻结和消费者传播的采用闭合；候选包不能冒充发布契约。 |
| `SYS-DEPLOY` | `尚未开始专项设计` | **assemblies 入口** 当前没有实际 assembly topic。 | 多机器身份、远程协议、部署组合与接管机制尚无专项设计。 |
| `SYS-TENANT` | `正在设计（直接候选机制）` | **Tenant Governance candidate**、**Action Authorization candidate**、**Core Work Coordination candidate** | 真实组合和端到端隔离证据仍未闭合。 |
| `SYS-LLM` | `正在设计（直接候选机制）` | **Model Execution candidate**、**model-execution provider** | 实际 OpenRouter 网络出口、attempt 状态权威和真实验证尚缺。 |
| `SYS-EXPERIMENT` | `阶段约束` | **requirements-foundation decision** 记录需求作为当前设计基础。 | 当前“设计、规格建模与实验性演进”限制适用范围；它不是等待专项设计或实现的产品能力。 |

除 `SYS-EXPERIMENT` 外，所有条款仍待能力覆盖分析。后续消费者必须在**全局覆盖输入**
逐条记录结论、组合前提和证据，不能以此表代替。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | **全局覆盖输入** |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
