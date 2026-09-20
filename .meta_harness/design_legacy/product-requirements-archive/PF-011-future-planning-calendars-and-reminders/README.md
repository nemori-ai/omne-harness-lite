# PF-011：面向未来的复杂日程规划、日历与通知提醒

本信息包拥有 **PF-011** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

- 需求确认状态：已确认范围等价迁入；以正文和变更记录为准。
- 设计覆盖状态：`尚未开始专项设计`
- 规格采用状态：没有 PF-011 的 candidate 或已采用专项契约。
- Provider、assembly 与实现验证：没有规划、日历、耐久调度或通知的专项交接和验证结论。
- 当前可复用设计落点：[规划、日历与通知来源研究](../../../research/legacy_backup/future-planning-calendar-and-notification-sources/README.md) 可避免重复调研；[Session candidate](../../../spec/capabilities/session/README.md) 只枚举 `schedule_due` 到达入口，二者不定义其产生、规划或通知责任。
- 覆盖边界与主要缺口：复杂规划、日历、耐久调度和通知全流程仍待能力分析。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
