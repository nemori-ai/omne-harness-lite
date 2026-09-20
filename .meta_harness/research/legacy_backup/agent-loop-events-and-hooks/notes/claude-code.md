# Claude Code / Agent SDK 0.3.270：选择性观察

- 原始出处：`docs/research/agent-loop-events-and-hooks/notes/claude-code.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`d621d74ba13fdbd3afea09ba1d188dc680459d3adf5f9f8cf399be6bf0d48409`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

固定目录含 SessionStart、UserPromptSubmit、Pre/PostToolUse、PermissionRequest、Stop、Compact 等事件及 command 输出字段；字段具有 rewrite/continue 等宿主语义。HK-08 只选择能落到封闭内部站点的子集。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
