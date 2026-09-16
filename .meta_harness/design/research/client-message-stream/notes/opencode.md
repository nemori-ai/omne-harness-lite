# OpenCode 228e909：选择性观察

- 原始出处：`docs/research/client-message-stream/notes/opencode.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`1b2f3a98755fb8a761cae35c9157c3216deaa5ab1724883045f291a0d4fcf701`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

SSE eager listener 使用无界队列且无 Last-Event-ID；V2 durable events 有 seq/version，但 token delta live-only、ended 为 replay 边界。它同时证明候选 2 可实施及第二历史成本。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
