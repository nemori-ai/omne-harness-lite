# PF-025：兼容外部命令式 hooks 体系

本信息包拥有 **PF-025** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

- 需求确认状态：已确认范围等价迁入；以正文和变更记录为准。
- 设计覆盖状态：`正在设计（局部相邻基础）`
- 规格采用状态：下列 candidate 尚未在当前基线 catalog 中采用或发布。
- Provider、assembly 与实现验证：相邻 provider 不构成 hooks 兼容交接；没有实际 assembly 或验证结论。
- 当前可复用设计落点：[Run Driver candidate](../../../spec/capabilities/run-driver/README.md)、[Tools candidate](../../../spec/capabilities/tools/README.md)、[Live Agent candidate](../../../spec/capabilities/live-agent/README.md)。
- 覆盖边界与主要缺口：事件映射、handler 集合、降级、续跑刹车和程序化作答资格尚未专项设计。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
