# 2026-09-16 有限形式模型检查

本包保存当前候选设计的实际 TLC 结果，作为后续规格评审的可复核输入。检查通过只说明列出的有限模型、配置和性质未发现反例；不提升 catalog 接受状态，也不证明正文全部条款、真实提供者或客户端符合性。

- [`legacy-31/formal-results.json`](legacy-31/formal-results.json) 保存原 31 项登记任务的逐项结果；同目录还有输入锁、事后核对和 31 份原始日志。原运行使用 `formal-tasks.json` SHA-256 `0644ef257b0c720a14038b816eb7bc1339482d754099699dab0cbd8e639286f7`；31 项均以精确登记命令退出 0、TLC 完成且最终队列为空。复制入本包后，逐项日志哈希仍与结果文件一致。
- 2026-09-16 再核对当前 [`formal-tasks.json`](../../formal-tasks.json)：上述 31 项任务记录未变，51 个模型/配置输入全部仍与 `legacy-31/formal-input-lock-at-start.json` 的 SHA-256 一致。当前清单另外登记 4 项 Account Registration 任务，因此整个清单的哈希与原运行不同；原结果仅复用到未变的 31 项。
- [`account-registration-4/results.json`](account-registration-4/results.json) 保存新增 4 项在当前规范路径以登记命令重新运行的结果；原始日志在同目录。四项均退出 0、TLC 完成且最终队列为空；精确模型/配置、工具和日志哈希见结果文件。
- [`cc-runtime-revision/results.json`](cc-runtime-revision/results.json) 保存未登记 CC/DR 恢复候选模型的正配置、12 个原负配置、双排列探针及 3 个动作门负配置，共 17 次 TLC 执行。正配置通过；其余各自出现指定反例。动作性质和负例的定向独立复核已通过；模型仍不覆盖完整 CC-06。

模型与配置的字节相同不表示后来修改的自然语言前提已被模型覆盖。每个 topic 的 `formal/README.md` 和 `verification.md` 仍限定性质、抽象及未验证边界；特别是 BG-04 的 unknown exposure、CC-06 的真实恢复与 Account 凭据提供者不由上述结果证明。J 的跨能力联合判定、规范采用与冻结另行完成。
