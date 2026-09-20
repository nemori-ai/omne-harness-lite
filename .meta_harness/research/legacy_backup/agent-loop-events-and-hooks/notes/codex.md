# Codex d77ebc7：选择性观察

- 原始出处：`docs/research/agent-loop-events-and-hooks/notes/codex.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`52d7eb5ea0a2d7829d3428cf4ba1847031c37a620c836e3d7bd683fbb814f741`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

固定 hooks schema/事件包含命令 handler、状态消息、决策与超时；具体目录与 Claude 不同，因此需要逐项 mapping，不能声明抽象兼容。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
