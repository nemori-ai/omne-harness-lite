# Codex d77ebc7：选择性观察

- 原始出处：`docs/research/client-message-stream/notes/codex.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`bba6cf6cc6ef9cc2c77fbdfc64f44cddba65af6fe3faf375895fb60c30942e9d`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

app-server 通知与 rollout/history 分离；客户端需从权威状态恢复。观察不证明本项目 ACL、批次或 generation fence。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
