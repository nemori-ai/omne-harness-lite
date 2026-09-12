# Claude Code 项目入口

本目录维护 Claude Code 的技能入口和原生角色文件；源码归属见
[workspace 规范](../docs/maintenance/workspace.md)。

`skills/` 的自包含资源与 `.agents/skills/` 保持一致，技能自带脚本和测试不移到根
`scripts/`。只读取与当前修改有关的技能及其引用。

`agents/` 中的角色从 [.agents/roles/](../.agents/roles/README.md) 生成，修改应回到
共享源定义，再同步两端；角色设计使用
[design-subagents](skills/design-subagents/SKILL.md)，不要在生成物中建立另一份权威提示。
