# Agent 指导与角色源定义

本目录拥有 Codex 可发现的 skills，以及双端 subagent 的共享源定义；完整归属见
[源码布局](../docs/maintenance/workspace.md)。

`skills/` 中的正文、脚本、模板与测试作为自包含技能维护，并与 `.claude/skills/`
保持一致。只修改相关技能，不因位于本目录就加载全部技能。

[roles/](roles/README.md) 拥有角色正文与宿主适配，原生文件由源定义生成到
`.codex/agents/` 与 `.claude/agents/`。编写或更改角色时使用
[design-subagents](skills/design-subagents/SKILL.md)，生成与验证入口归角色索引。
