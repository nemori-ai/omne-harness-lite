# D-051 追加：pi-tui 升到 1.0.0（2026-10-02）

产品负责人 2026-10-02 裁定：pi 于 2026-10-01 发布 1.0.0，[D-051](decision.md) 采用的 `@earendil-works/pi-tui` 由 0.86.1 同步升到 1.0.0。同日 `pi-ai-transport` 那份 fork 也改锚到了 1.0.0（[D-019 追加](../model-provider-pi-ai-fork/rebase-1.0.0-2026-10-02.md)）。

D-051 接受的范围不变：仍只用公共的 Input、宽字符与普通按键组件，仍是那一处 UndoStack 256 快照补丁；本页只追加。

## 改了什么

- `pnpm-workspace.yaml` 的 catalog 改为 `1.0.0`；补丁改名为 `apps/cli/patches/pi-tui-1.0.0.patch`，内容不变（pnpm 记的补丁哈希前后都是 `a2c748dd…`）；锁文件只换了这一个包。
- 1.0.0 的直接依赖与 0.86.1 相同（`marked` 18.0.11、`get-east-asian-width` 1.6.0），没有新增传递依赖；许可证仍是 MIT。

## 用到的五个导出在两版之间的差别

| 导出 | 所在上游文件 | 0.86.1 → 1.0.0 |
|---|---|---|
| `Input` | `components/input.ts` | 未变 |
| `StdinBuffer` | `stdin-buffer.ts` | 未变 |
| `CURSOR_MARKER` | `tui.ts` | 值未变（`ESC _pi:c BEL`） |
| `visibleWidth` | `utils.ts` | 改写成快速路径（纯 ASCII、制表符与转义序列不再走字素切分），上游意图是结果不变 |
| `stripTerminalSequences` | `utils.ts` | 函数体未变；它调用的 `extractAnsiCode` 改为委托新增的 `ansiCodeLength`，与 `visibleWidth` 同属提速改写 |

撤销栈（`undo-stack.ts`）上游一字未改，256 上限补丁仍然需要。

## 怎么验证的

升级前后各跑一遍，逐字节比对：

- **导出探针**：覆盖上面五个导出的 41 项输入（中日韩宽字符、全角、emoji 与组合序列、制表符、CSI／OSC／APC 转义、`CURSOR_MARKER`；Input 的输入、撤销、水平滚动与括号粘贴在 8／12／20／40 列下的渲染；StdinBuffer 对拆开的转义序列、括号粘贴与 Kitty 键的分帧）。两版输出相同，SHA-256 `aa20d124…`。
- **真实终端**：在 80×24 的 pty 里起 `omne tui --terminal-profile xterm-379 --setup`，应答 DECRQM，敲一行含中文的输入、撤销一次、Ctrl+C 退出。两版各录两次，四份字节流完全相同（4222 字节，SHA-256 `78cd9335…`）。
- `apps/cli` 的 typecheck、139 条测试与 5 条可执行验收都通过。

探针、pty 驱动与各次输出存在主检出 `tmp/pi-v1-cleanup/stage2-pi-tui/`，`SHA256SUMS` 在案。这一轮只是升级回归，**不是** D-051 尚缺的产品 TUI 运行验收；Mac iTerm 那一档仍未实测。

返回[本 topic 入口](README.md)。
