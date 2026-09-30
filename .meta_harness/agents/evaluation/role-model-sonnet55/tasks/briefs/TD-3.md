@@GOAL
交付 `apps/cli/src/tui/framer.ts` 的 `InputFramer`：终端输入分帧器。它在成熟组件看到任何字节之前拥有分帧——括号粘贴帧、模式答复与普通键的切分，严格增量 UTF-8 解码，以及停止时对未完成输入的持有。事件类型与公开成员已在文件里给出。

@@WRITE_PATHS
- `apps/cli/src/tui/framer.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 粘贴是一个数据事件 | 一次完整粘贴只产生一个 `paste` 事件，不产生 Enter 或业务提交；正文含换行、控制字符或模式答复时该次粘贴为 `invalid` |
| A2 | 有界与丢弃 | 超过字段上限或 UTF-8 不合的粘贴不保留正文，继续拥有该帧直到实际结束标记，然后报 `invalid`；持有量只剩定长帧前缀 |
| A3 | 单独的 Esc 不是取消 | 首个 ESC 不因静默超时被结清；实际后继字节排除了粘贴开始或模式答复前缀才释放。显式取消键与退出键可终止未完成前缀并作为键交付 |
| A4 | 停止 | `stop` 之后不再交付语义事件；已开始的粘贴或可能构成开始标记的前缀仍归本分帧器，实际结束或真实 EOF 后 `stop` 才完成；静默多久都不完成 |
| A5 | 错误与 EOF | 输入错误可观察但不解除未完成帧；真实 EOF 解除并交付 `eof` |
| A6 | 只接受登记的序列 | 普通导航键交成熟组件；2004 模式答复成为 `mode` 事件；其余 CSI、字符串类控制、鼠标等为 `invalid`，超长序列的余下部分被丢弃而不成为文本 |
| A7 | UTF-8 | 任意字节切口的多字节字符与增补平面字符都作为完整字符交付 |
| A8 | 释放 | 仍拥有输入时 `dispose` 抛出 |
| A9 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 节点设计：`.meta_harness/design/realization/apps/cli/tui.md`「输入信任与支持前提」「有界输入与关闭」「评审中的输入与呈现承接补充」「D051源码复核后的承接修正」。接受依据：`.meta_harness/design/record/decisions/governance-tui-entry-adoption/`（D051）。
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v2/contract.md`（CQ2）关于输入拥有、取消与关闭的条款。
- 复用组件：`@earendil-works/pi-tui` 0.86.1 的 `StdinBuffer` 只接普通键段，不接粘贴正文（已采用）。
- 相邻接口：字段上限与字段文本判定来自 `apps/cli/src/tui/forms.ts` 的 `FIELD_LIMIT`、`validFieldText`；上游是 `apps/cli/src/tui/mode-replies.ts`，消费者是 `apps/cli/src/tui/terminal.ts`。
- 本次采用值：粘贴开始与结束标记为 `ESC [ 200 ~`、`ESC [ 201 ~`；控制序列候选上限 64 字节；显式取消键为 Ctrl+G（0x07），退出键为 Ctrl+C（0x03）；登记的普通键为方向键、Home、End、Delete、PgUp、PgDn 的 CSI 与 SS3 形式。

@@PROPERTIES
- 输入来源永不结束已开始的帧时，正常关闭不声称完成；超时不能冒充结束。
- 停止之后才开始的新按键不排队给未来界面。
- 粘贴正文不进入成熟组件的无界缓冲。
