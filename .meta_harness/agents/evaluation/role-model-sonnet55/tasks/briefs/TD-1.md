@@GOAL
交付 `apps/cli/src/tui/mode-replies.ts` 的 `ModeReplies`：位于终端字节入口、先于输入分帧器的有界控制答复拆分器。它从字节流里取出完整的 2004 模式答复交给查询方，其余字节按原顺序交还下游。公开成员与签名已在文件里给出。

@@WRITE_PATHS
- `apps/cli/src/tui/mode-replies.ts`
- `apps/cli/tests/` 下新增的测试文件（不修改、不删除已有测试与 `tests/support/`）

@@ACCEPTANCE
| ID | 可观察结果 | 通过条件 |
|---|---|---|
| A1 | 答复可出现在任意切口 | 在粘贴开始标记、结束标记、UTF-8 多字节字符的每个字节切口插入五种答复中的任一种并逐字节投递，下游仍得到原粘贴，查询方得到该答复值 |
| A2 | 有界 | 任一时刻持有的候选不超过 11 字节 |
| A3 | 非答复字节原样保序 | 被打断的普通前缀、非法字节、不在识别集合里的序列逐字节原序交还下游 |
| A4 | 停止时的持有 | 持有半个候选期间 `drainHeld` 不完成；候选成为完整答复或被交还下游之后才完成，且在下游同步处理完之后 |
| A5 | 错误与 EOF | 输入错误不释放候选；真实 EOF 把未匹配候选交还下游并完成等待者；EOF 之后不再处理输入 |
| A6 | 成员检查 | `apps/cli` 下 `pnpm test` 与 `pnpm typecheck` 通过 |

@@SPEC
- 节点设计：`.meta_harness/design/realization/apps/cli/iterm.md`「R2：控制答复先分帧的修订候选」全节。接受依据：`.meta_harness/design/record/decisions/governance-iterm-provider-adoption/`（D054）。
- 契约：`.meta_harness/design/spec/compositions/governance-cli-entry/v2/contract.md`（CQ2）关于输入拥有与关闭的条款；接受依据 `.meta_harness/design/record/decisions/governance-tui-entry-adoption/`（D051）。
- 相邻接口：下游是 `apps/cli/src/tui/framer.ts` 的 `InputFramer`；消费者是 `apps/cli/src/tui/terminal.ts`。
- 研究依据：`.meta_harness/research/agent-harness-cli-tui/reports/2026-09-25-iterm-input/`。
- 本次采用值：识别集合是 `ESC [ ? 2004 ; <0-4> $ y` 这五个精确序列。

@@PROPERTIES
- 不丢字节、不改顺序、不产生业务键。
- 超时不是释放：候选的收场只来自后继字节或真实 EOF。
- 持有量有界。
