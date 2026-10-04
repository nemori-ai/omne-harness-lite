@@GOAL
交付 `apps/cli/src/parser.ts` 中的两个函数（类型、命令表加载与签名已在文件里给出）：

- `parseInvocation`：把进程参数映射成一次调用——帮助、版本、语法错误或一条命令。
- `secretOption`：秘密字段对应的来源选项名。

@@WRITE_PATHS
- `apps/cli/src/parser.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | CQ1 S-2 的命令与选项规则 | 命令表每条命令只接受它的 `allowedOptions`；未知命令、未知选项、重复选项、缺值、额外位置参数均为语法错误，不打开任何文件 |
| A2 | `machine` 前缀 | 同一命令带与不带前缀只改变呈现模式；语法错误时仍能还原调用方要的呈现模式，包括前缀出现在全局选项之后 |
| A3 | 帮助与版本 | 无参数与单独的 `--help` 为帮助，单独的 `--version` 为版本；机器模式不兼容这两种说明 |
| A4 | `center configure` | 需要 `--endpoint` 且 `--system-ca`、`--ca-file`、`--spki` 恰好一个 |
| A5 | 语法错误的诊断 | 无法确定命令为 `invalid-command`，其余为 `invalid-options`；已确定的命令随错误一并返回 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v1/contract.md`（CQ1）S-2、S-6、S-10；命令表 `commands.json` 同目录，`apps/cli/commands/governance.json` 是它的逐字节副本。接受依据：`.meta_harness/design/record/decisions/governance-cli-file-entry-adoption/`（D049）。
- 节点设计：`.meta_harness/design/realization/apps/cli/governance.md`「输入取得」「第二轮关闭首轮缺口的对应」。
- 公开面与相邻接口：`Invocation`、`Command` 类型见本文件；消费者是 `apps/cli/src/input.ts`、`apps/cli/src/application.ts`、`apps/cli/src/presentation.ts`。`tui` 入口在进入本函数之前已由 `apps/cli/src/main.ts` 分流，不归本函数。
- 本次采用值：布尔选项为 `system-ca`、`refresh`、`help`、`version`，其余选项带值；解析用 Node 公开的参数解析 API；返回的选项值对象不可变。
- 秘密字段与来源选项的对应见 CQ1 S-4 第 1 项。

@@PROPERTIES
- 语法无效的调用不产生命令，也不触发任何文件或状态访问。
- 呈现模式的还原只影响输出形式，不授权任何命令。
- 不存在「解析了但当前命令忽略」的选项。
