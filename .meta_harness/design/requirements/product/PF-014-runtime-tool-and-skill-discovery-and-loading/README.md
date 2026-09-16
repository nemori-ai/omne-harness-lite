# PF-014：运行时发现与按需装载工具、技能

本信息包拥有 **PF-014** 的当前确认范围；它保存需要兑现的结果与
明确未决项，不选择能力边界、Cordis 插件或提供者。

- 目标基线：`omne-harness-lite-design-2026-09-15`
- 来源基线：`omne-harness-lite-legacy-spec` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- 当前状态：已确认范围等价迁入；正文保留明确的待澄清/待设计项
- 下游状态：能力覆盖、规格和提供者映射由后续纵线建立

## 设计覆盖状态

本段只导航 **PF-014** 的设计起点；它不是逐条 requirement coverage 结论，不能把候选
契约或 provider 设计写成当前基线已经采用、实现或验证。

- 需求确认状态：已确认范围等价迁入；以本 topic 的正文和变更记录为准。
- 设计覆盖状态：`尚未开始专项设计`
- 规格采用状态：没有 PF-014 的 candidate 或已采用专项契约。
- Provider、assembly 与实现验证：没有发现目录、按需装载的 provider/assembly 交接或专项实现验证结论。

### 当前可复用设计落点

[运行时装载与制品管理来源研究](../../../research/dynamic-loading-and-artifact-sources/README.md) 可避免重复调研；
[Tools candidate](../../../spec/capabilities/tools/README.md) 只提供既有工具调用的责任边界。二者没有定义发现目录、
依赖表示、按需装载或向模型披露的协议；当前没有 PF-014 专项机制 topic。

### 覆盖边界与主要缺口

PF-014 的所有条款仍待能力覆盖分析。后续工作应先说明现有 Tools 责任及其合理组合为何不足，再决定是否扩展
它或形成独立责任；不得把 requirement 名称直接当作插件或契约名。[全局覆盖输入](../../coverage-obligations.md)
保留逐条结论和证据的唯一入口。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 需要兑现哪些结果与边界 | [需求正文](requirements.md) |
| 确认范围怎样追到源修订 | [来源与变化](changes.md) |
| 哪些覆盖结论仍待建立 | [全局覆盖输入](../../coverage-obligations.md) |

后续覆盖分析必须逐条给出 `covered / partial / uncovered / unknown` 及证据；本包不从要求名称预设新能力。
