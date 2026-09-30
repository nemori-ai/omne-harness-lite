@@GOAL
交付 `apps/cli/src/application.ts` 中的 `runCli`：一次 CLI 调用的装配与收场——解析调用、取得输入、打开本机状态（CLS）、创建治理客户端（CG）、执行一次 `runPrepared`、按次序关闭并交付最终报告，返回进程退出状态。`CliRuntime`、`providers` 与签名已在文件里给出。

@@WRITE_PATHS
- `apps/cli/src/application.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | CQ1 S-5、S-10 的正常次序 | CLS 打开 → CG 动作 → CG close 实际完成 → CLS close → 最终报告输出；人读模式的 Preview 在取得秘密之前输出 |
| A2 | CQ1 S-6 的人读与机器呈现 | 人读命令在 stdout 不是 TTY 时以 `tty-required` 拒绝且不打开状态；帮助与版本不访问状态；机器输出是一份完整 JSON 文档 |
| A3 | CQ1 S-10 失败表逐行 | 受理前失败用未发起模板；CG 动作抛未声明异常时不伪造报告；CG close 被拒时保留报告、不关闭借用的 CLS；CLS close 被拒时保留报告；输出失败不重写、不重做业务。各行的诊断代码与退出状态按表 |
| A4 | CQ1 S-7 的停止 | 已受理的工作与其 close 实际结束后才释放 CLS；输入读取中收到停止则等它结束且不再打开状态 |
| A5 | 诊断 | 只写封闭代码，格式 `omne: <code>`，不含原异常文本 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v1/contract.md`（CQ1）S-5、S-6、S-7、S-10。接受依据：`.meta_harness/design/record/decisions/governance-cli-file-entry-adoption/`（D049）。
- 节点设计：`.meta_harness/design/realization/apps/cli/governance.md`「装配与资源」「输出、信号与失败」。
- 参与方公开面：`@omne-harness-lite/governance-client-operations`（`createGovernanceClient`、`runPrepared`、`close`、`exitStatus`、报告类型）；`@omne-harness-lite/client-local-state`（`openClientLocalState`、`ClientStateOpenFailure` 及其 `reason`）。
- 相邻模块：`parser.ts`（调用形状）、`input.ts`（`buildIntent`、`readSecrets`）、`presentation.ts`（`previewText`、`reportText`、未发起模板 `unopened`）、`validation.ts`（`validIntent`、`validReport`）、`version.ts`、`diagnostic.ts`。
- 本次采用值：默认状态目录为 `<home>/.omne-harness-lite`，`--state-dir` 显式覆盖，目录必须是绝对路径；应用交付失败的退出状态为 70，人读被拒为 2，其余沿 `exitStatus`；帮助文本列出命令表每条命令与其选项。

@@PROPERTIES
- 应用不拥有治理事实：报告只来自 CG 或未发起模板，不在异常处理里改写已发生的事实。
- 每个资源只由其拥有者关闭一次；CG 未实际静止不释放它借用的 CLS。
- 一次调用至多一次 CG 动作，任何失败都不自动重放。
- 不用 `process.exit` 中断收场。
