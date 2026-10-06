# Session 设计的机制探针

三个输入只检查机制和简化算法，不是正式 Session 提供者或真实组合验收。结果从 stdout 返回；调用方将本次输出写到自己工作树的 tmp。

- `probe_cordis.mjs` 从当前 kernel-basis 依赖取得 Cordis，检查独立 Context 的事件、撤除、故障、依赖换代和替身原调用句柄。替身没有实际网络或持久结果，不能证明真实执行排空。
- `probe_projection.py` 使用简化文本块检查冷建／增量一致、引用与失效；不运行产品 codec，不证明真实消息和供应方协议。
- `probe_transactions.py` 使用私有合成 SQLite 库检查共同提交、回滚与故障边界；不证明实际两个提供者的事务参加或部署耐久。

使用当前工作树 Node／Python 执行对应输入。具体状态、范围与真实组合义务归 [验证正文](../../verification.md)。
