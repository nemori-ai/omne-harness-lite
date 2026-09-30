@@GOAL
交付 `apps/cli/src/tui/screen.ts`：治理 TUI 的整帧布局与帧写入。类型与签名已在文件里给出：

- `safeText`：把不可信文本作为数据呈现。
- `layout`：由一份屏幕状态与窗口尺寸算出一整帧。
- `FrameWriter`：串行拥有屏幕帧写入——至多一份在途写入与一份最新待写状态。

@@WRITE_PATHS
- `apps/cli/src/tui/screen.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 身份区完整 | 中心、账号、组织逐项完整呈现，不截短；内容按实际可见宽度换行，宽字符不溢出行尾 |
| A2 | 窗口不足 | 小于 60 列 16 行，或身份所需行数使正文没有容量时，不给出可操作的帧，只给不滚动的提示；尺寸非法时不输出任何字节 |
| A3 | 分页 | 长正文分页，身份区、页码、输入行与页脚保持在可见区域；页号越界时夹到有效范围 |
| A4 | 输出只含应用所有的控制 | 帧里只有定位与清屏；不改变任何终端私有模式；输入组件生成的样式序列被剥离，光标标记只用于定位硬件光标 |
| A5 | 交付屏障 | 只有最新修订的帧实际写完才回调 `delivered`；背压期间只保留最新一帧 |
| A6 | 关闭与失败 | 关闭丢弃未发送帧、等待在途写入实际结束、此后不回调也不再写；写失败只上报一次并停止后续输出 |
| A7 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 节点设计：`.meta_harness/design/realization/apps/cli/tui.md`「身份、表单与操作」「终端输出与重绘的拥有者」「评审中的输入与呈现承接补充」。接受依据：`.meta_harness/design/record/decisions/governance-tui-entry-adoption/`（D051）。
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v2/contract.md`（CQ2）关于可见状态、预览确认与关闭的条款；呈现转义沿 CQ1 S-6。
- 复用组件：`@earendil-works/pi-tui` 0.86.1 的 `Input`、`visibleWidth`、`stripTerminalSequences`、`CURSOR_MARKER`（已采用，见 tui.md「选择与拥有者」）。
- 消费者：`apps/cli/src/tui/application.ts`、`apps/cli/src/tui/dialog.ts`。
- 本次采用值：每帧以光标归位加清屏（`ESC [ H`、`ESC [ 2 J`）开头，行间用 CR LF；最右一列留空；页码行格式为 `Page <当前>/<总数>`；窗口不足的提示文本为 `Window too small. Enlarge to show the full identity and current step.`；`safeText` 把 C0、DEL、C1 与双向控制字符写成 `\uXXXX`（四位小写十六进制），并先把不成对的代理项规整为合法文本；尺寸非法时返回 `{ bytes: '', fits: false, page: 0, pages: 1 }`。

@@PROPERTIES
- 看不到的预览不能被确认：旧帧的回调不得使新状态可确认。
- 待写帧有界：输入与 resize 只替换待写状态，不累计帧链。
- 「已调用写」不等于屏幕完成；关闭等待的是实际写入结束。
