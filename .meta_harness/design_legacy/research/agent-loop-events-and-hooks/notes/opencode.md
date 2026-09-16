# OpenCode 228e909：选择性观察

- 原始出处：`docs/research/agent-loop-events-and-hooks/notes/opencode.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`5b71cc0f9214be7b5cbb61e11d53cbc444262b851fd39a5b1c982d5d47531258`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

插件事件与工具 hooks 表明外部扩展可行，但其 bus/plugin 权力和本项目 extension sites 不同，只用于比较 adapter 责任。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
