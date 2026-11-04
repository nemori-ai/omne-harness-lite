# tests/fixtures 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [agent-context-ready.ts](agent-context-ready.ts)：真实 agent-context 的一次 `ready` 准备（真实 Request Context 登记处与 Runtime Context 机制），供 AD-04 用它的 `ready.state` 与 `ready.coverage` 核对覆盖摘要
- [adopted-request.ts](adopted-request.ts)：一次采用请求的取值：Request Context 形状的覆盖、固定请求记录、agent-context 为覆盖铸的证据摘要，以及模型调用引用（FIXED-FACTS F4、F5）
- [common-journal.ts](common-journal.ts)：共用场景 `scene`，在内存提供者上建立会话日志与可配置的访问裁定，并导出 `ok`、操作身份与检查点等构造；`openInput` 与 `submitInput` 按消息准入构造 `open` 的原受理与运行时上下文，以及 `submit` 的 new-input 谱系
- [progression.ts](progression.ts)：在 `scene` 上推进一个 Run 的步骤：交入（初始输入或一次 submit 的输入）、受理、承接、取消、冻结、开新 Run 与结束
- [tool-call.ts](tool-call.ts)：Tool 调用与 Model 结果的离线原事实样本
- [result-call.ts](result-call.ts)：在 `scene` 上提交一次待决的 Tool 调用，并构造它的结果保管请求（`custody`）
- [original-scope.ts](original-scope.ts)：以 `create` 建立带原作用域的会话
- [session-conformance.ts](session-conformance.ts)：session-contract 事务一致性套件的夹具
- [entries-conformance.ts](entries-conformance.ts)：agent-contract entries 一致性套件的夹具
- [main-reply.ts](main-reply.ts)：在 `sqlScene` 上写一次 H 的 P 与 Ja（主回复或 Tool 结果），与协调器的写法相同
- [sql-scene.ts](sql-scene.ts)：生产 Journal 提供者的场景：node:sqlite 替身（加载材料里的真实模块）或真实 sqlite-provider 上的会话存储与 Journal，一个已开 Run 的会话，以及故障注入（按语句文本或按语句与参数）与提交计数；`nextRun` 取消当前 Run 并开下一个
- [sql-real-config.ts](sql-real-config.ts)：真实 sqlite-provider 的配置
- [property.ts](property.ts)：折叠定律的种子属性工具：xorshift32 生成器与 `forAll`，失败报种子；仓库没有 fast-check
- [journal-facts.ts](journal-facts.ts)：随机事实日志的生成器 `scene`：一或两个 execution，打开、挂接、若干生产者轮（intend、receive、judge，可选认回、控制、等待、扩展、作废重备、崩溃恢复）与终结，批带 `pub` 与到达的修订
