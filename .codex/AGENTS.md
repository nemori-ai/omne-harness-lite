# Codex 原生角色入口

本目录承载 Codex 的原生角色配置；[共享角色索引](../.agents/roles/README.md)拥有
源定义、适配依据和生成入口，完整源码归属见[workspace 规范](../docs/maintenance/workspace.md)。

`agents/` 中的 TOML 是生成物。调整职责、模型或边界时回到共享源定义，使用
[design-subagents](../.agents/skills/design-subagents/SKILL.md) 核对支持情况并生成双端文件。
普通一致性核对只读取源包和生成结果；文件生成成功不代表宿主已经加载或模型已验证。
