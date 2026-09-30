@@GOAL
为 `apps/cli/src/input.ts`（单次治理命令的输入取得：`readInputFile`、`payloadJSON`、`buildIntent`、`readSecrets`）交付模块级测试。

@@WRITE_PATHS
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 覆盖 CQ1 S-3 的非秘密输入规则 | 每条拒绝情形与合法输入的保留语义各有能失败的测试 |
| A2 | 覆盖 CQ1 S-4 的秘密文件规则 | 权限、来源、类型、符号链接、编码、限额、逐字节保留各有能失败的测试 |
| A3 | 覆盖 CQ1 S-2 的载荷与登录标识规则 | 秘密成员出现在载荷里、登录标识两处同时给出各有能失败的测试 |
| A4 | 覆盖取消 | 已取消的信号不开始读取 |
| A5 | 在当前实现上全部通过 | `apps/cli` 下运行你的测试文件全部通过，`pnpm typecheck` 通过 |

@@SPEC
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v1/contract.md`（CQ1）S-2、S-3、S-4、S-6、S-9、S-10；命令表 `commands.json` 同目录。接受依据：`.meta_harness/design/record/decisions/governance-cli-file-entry-adoption/`（D049）。
- 节点设计：`.meta_harness/design/realization/apps/cli/governance.md`「输入取得」与「首个可实施增量的裁剪」；验证义务见同目录 `verification.md`。
- CG2 的 Intent 形状与合法示例：`.meta_harness/design/spec/compositions/governance-client-operations/`。
- 公开面：被测函数见 `apps/cli/src/input.ts`；失败类型见 `apps/cli/src/diagnostic.ts`；调用形状由 `apps/cli/src/parser.ts` 的 `parseInvocation` 产生；`apps/cli/src/validation.ts` 的 `validIntent` 可用于判定 Intent。
- 本次采用值：普通载荷上限 64KiB，证书文件上限 1MiB，每个秘密上限 64KiB；JSON 嵌套深度上限 64；秘密来源缺席以 `tty-unsupported` 失败。

@@PROPERTIES
- 数值不经浮点舍入后再判定；重复成员不被后值覆盖。
- 解析结果不受 `__proto__` 之类成员名影响。
- 秘密文件的核对针对已打开的文件本身，最终分量是符号链接时拒绝。
- 测试不把秘密或载荷内容写进输出。
