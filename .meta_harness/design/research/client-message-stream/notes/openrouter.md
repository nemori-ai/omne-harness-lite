# OpenRouter docs 2026-09-15：选择性观察

- 原始出处：`docs/research/client-message-stream/notes/openrouter.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`
- SHA-256：`20aec680a90adb30bd0745e36be076f99f0fce239b07253c1a047a4cc27b3112`
- 取得方式：本轮从固定本地来源选择仍被 E 契约/proposal 消费的观察；完整原文可按 revision 恢复。

## 当前可消费观察

SSE chunk/usage/error 是供应方传输输入，工具参数与推理私有材料需公开投影；它不提供产品 cursor、授权或恢复。

## 局限

该快照只证明相应 revision/抓取日的源码或文档表面；未执行端到端可靠性、权限、重连或兼容测试，
也不接受本项目的新 baseline。未列入的原始细节不因省略而成为反面结论。
