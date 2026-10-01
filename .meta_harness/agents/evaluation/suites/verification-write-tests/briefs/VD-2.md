@@GOAL
为 `apps/cli/src/tui/screen.ts`（治理 TUI 的整帧布局与帧写入：`safeText`、`layout`、`FrameWriter`）交付模块级测试。

@@WRITE_PATHS
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 覆盖身份区完整与窗口不足 | 身份逐项完整呈现；窗口不足与尺寸非法各有能失败的测试 |
| A2 | 覆盖分页与可见区域 | 分页、页号夹取各有能失败的测试 |
| A3 | 覆盖输出只含应用所有的控制与文本转义 | 不改变终端私有模式；控制字符与双向控制字符作为数据呈现 |
| A4 | 覆盖交付屏障 | 旧修订不被确认；背压期间只保留最新一帧 |
| A5 | 覆盖关闭与失败 | 关闭丢弃未发送帧、等待在途写入、此后不回调不再写；写失败只上报一次 |
| A6 | 在当前实现上全部通过 | `apps/cli` 下运行你的测试文件全部通过，`pnpm typecheck` 通过 |

@@SPEC
- 节点设计：`.meta_harness/design/realization/apps/cli/tui.md`「身份、表单与操作」「终端输出与重绘的拥有者」「评审中的输入与呈现承接补充」「必须通过的验证」。接受依据：`.meta_harness/design/record/decisions/governance-tui-entry-adoption/`（D051）。
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v2/contract.md`（CQ2）关于可见状态、预览确认与关闭的条款；呈现转义沿 CQ1 S-6。
- 公开面：被测成员见 `apps/cli/src/tui/screen.ts`；输入组件来自 `@earendil-works/pi-tui` 0.86.1。
- 本次采用值：默认布局至少 60 列 16 行；尺寸非法时返回 `{ bytes: '', fits: false, page: 0, pages: 1 }`；`safeText` 把 C0、DEL、C1 与双向控制字符写成 `\uXXXX`。

@@PROPERTIES
- 看不到的预览不能被确认：旧帧的回调不得使新状态可确认。
- 待写帧有界。
- 「已调用写」不等于屏幕完成；关闭等待的是实际写入结束。
- 等条件不等时间：测试用可控的写入屏障，不用固定延时判定次序。
