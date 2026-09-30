@@GOAL
交付 `apps/cli/src/version.ts` 的 `versionText`：读取构建标识文件并给出 `--version` 的输出文本。签名已在文件里给出。

@@WRITE_PATHS
- `apps/cli/src/version.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 标识文件缺席 | 返回 `omne 0.0.0 development` 加换行 |
| A2 | 标识文件合法 | 内容为 64 位小写十六进制、可带一个结尾换行；返回 `omne 0.0.0 <标识>` 加换行 |
| A3 | 标识文件不合法 | 不是常规文件、是符号链接、长度或内容不合时抛出，不输出版本 |
| A4 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 节点设计：`.meta_harness/design/realization/apps/cli/packaging.md`。接受依据：`.meta_harness/design/record/decisions/governance-cli-portable-adoption/`（D050）。
- 消费者：`apps/cli/src/application.ts`。

@@PROPERTIES
- 版本显示只读构建制品，不访问登录或本机状态。
- 打开的文件在任何收场路径都关闭。
