# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [common-journal.ts](common-journal.ts)：共用场景 `scene`，在内存提供者上建立会话日志与可配置的访问裁定，并导出 `ok`、操作身份与检查点等构造
- [progression.ts](progression.ts)：在 `scene` 上推进一个 Run 的步骤：交入、受理、承接、取消、冻结、开新 Run 与结束
- [tool-call.ts](tool-call.ts)：Tool 调用与 Model 结果的离线原事实样本
- [result-call.ts](result-call.ts)：在 `scene` 上提交一次待决的 Tool 调用，并构造它的结果保管请求（`custody`）
- [original-scope.ts](original-scope.ts)：以 `create` 建立带原作用域的会话
- [session-conformance.ts](session-conformance.ts)：session-contract 事务一致性套件的夹具
- [entries-conformance.ts](entries-conformance.ts)：agent-contract entries 一致性套件的夹具
