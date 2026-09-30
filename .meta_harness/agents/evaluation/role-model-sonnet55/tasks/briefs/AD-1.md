@@GOAL
交付 `apps/cli/src/input.ts`：单次治理命令的输入取得。四个公开函数的签名已在文件里给出，实现体待交付：

- `readInputFile`：有界、只读一次地读取一个输入文件，区分普通文件与秘密文件两种核对。
- `payloadJSON`：把非秘密载荷文本解析成对象。
- `buildIntent`：由已解析的命令与选项构造交给 CG2 的非秘密 Intent 候选。
- `readSecrets`：从受保护文件取得命令表 `secretFields` 要求的全部秘密，返回 CG2 的 `PromptResult`。

@@WRITE_PATHS
- `apps/cli/src/input.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | CQ1 S-3 的非秘密输入规则 | 每条拒绝情形以对应的封闭诊断代码失败；合法输入保留原字符串与对象语义 |
| A2 | CQ1 S-4 的秘密文件规则 | 权限、来源、类型、符号链接、编码、限额各自以对应诊断代码失败；内容逐字节保留 |
| A3 | CQ1 S-2 的载荷与登录标识规则 | 秘密成员出现在载荷里、登录标识两处同时给出，分别按契约拒绝 |
| A4 | 命令表每条命令都能构造出通过 `validIntent` 的 Intent | 用 CG 规格的合法示例（去掉秘密成员）逐条构造成功 |
| A5 | 取消 | 已取消的信号不开始读取；读取中取消以 `input-cancelled` 失败 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v1/contract.md`（CQ1）S-2、S-3、S-4、S-6、S-10；命令表 `commands.json` 同目录。接受依据：`.meta_harness/design/record/decisions/governance-cli-file-entry-adoption/`（D049）。
- 节点设计：`.meta_harness/design/realization/apps/cli/governance.md`「输入取得」与「首个可实施增量的裁剪」；节点入口 `README.md` 同目录。
- CG2 的 Intent/Output 形状与合法示例：`.meta_harness/design/spec/compositions/governance-client-operations/`；类型从包 `@omne-harness-lite/governance-client-operations` 的公开入口取。
- 公开面与相邻接口：失败用 `apps/cli/src/diagnostic.ts` 的 `InputFailure`（代码取自封闭集合）；命令与调用形状来自 `apps/cli/src/parser.ts`；`apps/cli/src/tui/forms.ts` 与 `apps/cli/src/application.ts` 是本模块的消费者。
- 本次采用值：普通载荷上限 64KiB，证书文件上限 1MiB，每个秘密上限 64KiB；JSON 嵌套深度上限 64。
- 已采用的增量裁剪：秘密只从受保护文件取得；来源缺席以 `tty-unsupported` 失败，不进入任何终端输入。
- 关闭已打开文件被拒绝属于缺陷而不是输入失败：以消息为 `input-restore-failed` 的普通 `Error` 抛出。

@@PROPERTIES
- 每个文件只打开并读取一次；任何收场路径都关闭本次打开的句柄。
- 不回显、不记录载荷与秘密内容；失败只带封闭诊断代码。
- 数值不经浮点舍入后再判定；重复成员不被后值覆盖。
- 解析结果不受 `__proto__` 之类成员名影响。
