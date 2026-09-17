# PF-004：Sub-agent 派发、协作与监督

本信息包拥有 **PF-004** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围迁入，并于 2026-09-16 确认第三方 Harness Agent 的 ACP 接入约束；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

本段只导航 **PF-004** 的相邻设计基础；它不是逐条 requirement coverage 结论，不能把候选
契约或 provider 设计写成当前基线已经采用、实现或验证。

- 需求确认状态：已确认范围等价迁入；以本 topic 的正文和变更记录为准。
- 设计覆盖状态：`正在设计（局部相邻基础）`
- 规格采用状态：下列 candidate spec 尚未在当前基线的 catalog 中采用或发布。
- Provider、assembly 与实现验证：现有目标 provider 不构成 sub-agent 的 provider 交接；没有实际 assembly topic 或专项实现验证结论。

### 当前可复用设计落点

| 相邻责任 | 当前设计及其边界 |
| --- | --- |
| Session/Run 的工作承载、调用和结果接续 | [Session candidate](../../../spec/capabilities/session/README.md)、[Run candidate](../../../spec/capabilities/run/README.md)、[Tools candidate](../../../spec/capabilities/tools/README.md) 提供部分派发与结果回流的共同基础。 |
| 已有运行时的激活和工作归属 | [Agent Runtime architecture](../../../architecture/agent-runtime/README.md) 与 [core-agent provider](../../../providers/core-agent/README.md) 不定义 sub-agent 的独立身份、监督或授权语义。 |
| 第三方 Harness Agent 的统一控制协议 | [PF-004.C12](requirements.md#第三方-harness-agent) 已确认 ACP 是本项目的接入约束；它尚不是外部 target 注册、授权、会话关联、远程控制、恢复或降级的专项设计。 |

### 覆盖边界与主要缺口

尚未形成 sub-agent 身份、委派授权、监督、定时派发、结果闭环、恢复或第三方 ACP
控制的专项能力/组合设计，因此不能从相邻 Session、Run 或 Tools 契约推定 PF-004 的
任何条款已覆盖。下一步由[全局覆盖输入](../../coverage-obligations.md)
的实际消费者先记录承载分析和剩余责任，再判断扩展、组合或新能力。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
