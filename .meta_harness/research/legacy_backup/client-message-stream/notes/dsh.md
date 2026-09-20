# DSH c291e79：选择性观察

- 原始出处：`docs/research/client-message-stream/notes/dsh.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`208761abf383aadc9b099abaada3b8c2594a3b79784efde2dcacc92e20d61c04`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

session/event 是通知面，assistant stream 的 start/chunk/end 是进程内实时面；没有证明持久 cursor 或 baseline→listener 原子交接。支持候选 1/3 的分层，不支持直接声称恢复完备。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
