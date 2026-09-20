# pi ceea48f：选择性观察

- 原始出处：`docs/research/client-message-stream/notes/pi.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`48c6f10f6327298b40e0edc863fc50592864f8e5da995a652d87e63d59e14b9c`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

RPC 增量靠 message_end 权威值，跨重启用 append-only entry id cursor 补齐；单进程客户端未覆盖多租户、可见范围和多订阅。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
