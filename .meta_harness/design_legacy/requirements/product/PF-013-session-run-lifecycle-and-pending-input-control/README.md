# PF-013：Session、Run 生命周期与运行中输入管理

本信息包拥有 **PF-013** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

本段只导航 **PF-013** 已有设计及其缺口；它不是逐条 requirement coverage 结论，不能把候选
契约或 provider 设计写成当前基线已经采用、实现或验证。

- 需求确认状态：已确认范围等价迁入；以本 topic 的正文和变更记录为准。
- 设计覆盖状态：`正在设计（直接候选机制）`
- 规格采用状态：下列 candidate spec 尚未在当前基线的 catalog 中采用或发布。
- Provider、assembly 与实现验证：有目标 provider 设计；没有实际 assembly topic，未形成此需求的端到端交接或验证结论。

### 当前可复用设计落点

| 责任起点 | 当前设计 |
| --- | --- |
| Session、Run 与 Run Driver 的状态、生命周期和输入接续 | [Session candidate](../../../spec/capabilities/session/README.md)、[Run candidate](../../../spec/capabilities/run/README.md)、[Run Driver candidate](../../../spec/capabilities/run-driver/README.md) |
| 工具调用与跨能力生命周期交接 | [Tools candidate](../../../spec/capabilities/tools/README.md)、[Session–Run–Agent Lifecycles candidate](../../../spec/compositions/session-run-agent-lifecycles/README.md) |
| 可实施责任的目标映射 | [session-run provider](../../../providers/session-run/README.md)、[agent-run-driver provider](../../../providers/agent-run-driver/README.md)、[session-persistence provider](../../../providers/session-persistence/README.md) |

### 覆盖边界与主要缺口

这些材料为 PF-013 的能力覆盖分析提供直接起点，但尚未逐条判定 `covered / partial / uncovered / unknown`。
候选语义、provider 符合性、跨能力失败/恢复动作链，以及应用级 provider 选择与装配仍未闭合；下一步由
[全局覆盖输入](../../coverage-obligations.md) 的实际消费者记录精确结论与证据。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
