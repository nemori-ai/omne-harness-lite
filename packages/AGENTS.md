# 产品能力的目标维护地图

本树按[产品包组织](../docs/package-organization.md)预留能力组文档。领域页解释业务责任，组入口解释工程关系，实际成员拥有精确使用、行为、内部设计与验证，分别按[成员文档规范](../docs/member-documentation.md)维护。目录不自动成为包、插件或进程。

包组织里写明叶子名的目录都已是 RFC-0003 的 workspace 位置。`packages/common/legal-identity` 与 `packages/common/utc-instant` 已有公开行为。`packages/common/json-text` 的读取函数已于 2026-10-15 在 #242 接受，`judgeJsonValue` 与 `writeJsonText` 是 #373 新增，待 D-02 确认。其余已建包的叶子仍是模板草稿，公开行为还没有实现。`packages.0.0.1.legacy/` 和 `apps.0.0.1.legacy/` 不在 pnpm workspace 里。`slash-command`、`skills`、`mcp`、`storage`、`time`、`telemetry` 的叶子在包组织里仍是占位，没有建包。局部任务先进入所属组README；实施前确认具名消费者、已接受公开承诺及[模板支持范围](../docs/development.md#创建和整改产品包)。组中的目标表与缺文件登记只导航后续责任，不授予实施或采用资格。

旧实现从[legacy入口](../packages.0.0.1.legacy/README.md)查源。其存在与工具依赖不改变docs要求及架构权威；旧政策不能覆盖新树。未接受候选与探路件继续留任务tmp。

新建或拆分成员时核对依赖方向、独立使用及Cordis集成边界；同步组导航、登记、真实消费者和相称验证。文档维护沿[维护指南](../docs/maintenance.md)，公开承诺和命令不复制进常驻提示。
