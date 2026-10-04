# 可复核的来源与观察

版本 token：Claude Code `2.1.287`；Codex CLI `0.159.0`；Codex 源码标签 `rust-v0.159.0`；文档抓取日 `2026-10-01`。
原文字节在 [sources/](sources/)，在该目录下 `sha256sum -c SHA256SUMS` 校验。

## E-1 Claude Code 钩子文档

- 消费对象：[研究正文](research.md) 的 C-1、C-2、C-3、C-4、C-5、C-6、C-7。
- 来源与精确修订：`https://code.claude.com/docs/en/hooks.md`，2026-10-01 抓取；快照 `sources/claude-code-hooks.md.txt`，
  SHA-256 `813a20444e614fbe41a6049983c474da527e5b7eeb6a26a64404fe1e6d90fa14`。文档不带版本号，对应当日的 `2.1.287`。
- 来源立场：厂商自述。
- 取得方式：`curl -sL https://code.claude.com/docs/en/hooks.md`。首轮由调查 subagent 抓取并摘句；**主会话当日重新抓取，在快照里逐句找到下列原文**。
- 实际观察（主会话核对过的原句）：
  - 「Stop hooks receive `stop_hook_active`, `last_assistant_message`, `background_tasks`, and `session_crons`. The `stop_hook_active` field is `true` when Claude Code is already continuing as a result of a stop hook.」
  - 「SubagentStop hooks receive `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, and `last_assistant_message`. The `agent_type` field is the value used for matcher filtering.」
  - 「Exit 2 means a blocking error. On events that can block, exit 2 blocks whether or not you print JSON」
  - 「With a parsed object that passes schema validation, for events that use the standard decision model, Claude Code ignores the exit code and the JSON alone decides the outcome」
  - 「when Claude Code tries to parse your stdout as JSON and can't, it reports a non-blocking error on every exit code other than 2」
  - 「`Stop` and `SubagentStop`: the reason is fed back to Claude as its next instruction and the turn continues」
  - 「It keeps the conversation going through the same loop protections as `decision: "block"`, namely the `stop_hook_active` input and the 8-consecutive-continuation cap」
  - 「both export them as the environment variables `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_DATA` on the spawned process」
- 支持范围：文档宣称的行为。不支持「实际如此执行」——没有触发过钩子。目录信任、设置自动重载、`Stop` 每轮触发与用户中断不触发等几句由首轮报告摘出，主会话没有逐句复核，以[首轮报告](reports/2026-10-01-first-round.md.txt)第 2 节为准。
- 后续核对：Claude Code 升级后重新抓取，比对快照。

## E-2 Codex 钩子文档

- 消费对象：C-1、C-2、C-3、C-4、C-5、C-6。
- 来源与精确修订：`https://developers.openai.com/codex/hooks.md`（308 跳转到 `https://learn.chatgpt.com/docs/hooks.md`），2026-10-01 抓取；
  快照 `sources/codex-hooks.md.txt`，SHA-256 `724881d81f1a9fdb35ea42d4851a11b1f6606bbc6e9d2d05c1e8c466fc25c630`。对应当日的 `0.159.0`。
- 来源立场：厂商自述。
- 取得方式：`curl -sL https://developers.openai.com/codex/hooks.md`。主会话当日重新抓取并逐句核对。
- 实际观察（主会话核对过的原句）：
  - 「Non-managed hooks must be reviewed and trusted before they run.」
  - 「Project-local hooks load only when the project `.codex/` layer is trusted.」
  - 「Codex records trust against the hook's current hash, so new or changed hooks are marked for review and skipped until trusted.」
  - 输入字段表：`SubagentStop` 的 `stop_hook_active`——「Whether this subagent was already continued」；`Stop` 的 `stop_hook_active`——「Whether this turn was already continued by `Stop`」。
  - 「`Stop` expects JSON on `stdout` when it exits `0`. Plain text output is invalid」；`SubagentStop` 同。
  - 「You can also use exit code `2` and write the continuation reason to `stderr`.」
  - 「Codex to continue and automatically creates a new continuation prompt that acts」（原句跨行，后半为 as a new user prompt）
  - 配置位置：`~/.codex/hooks.json`、`~/.codex/config.toml`、`<repo>/.codex/hooks.json`、`<repo>/.codex/config.toml`。
- 支持范围：文档宣称的行为；文档没有写续跑次数上限、没有写改动后要不要重启、没有写软链接。
- 后续核对：Codex 升级后重新抓取，比对快照。

## E-3 Codex 源码与两端本机二进制的观察（仅转述，主会话未核原文）

- 消费对象：C-3 的「多一个字段即作废」、C-4 的「读到的代码里没有计数上限」、C-7 的「变量停在会话起点」。
- 来源与精确修订：GitHub `openai/codex` 标签 `rust-v0.159.0`；本机 `codex-cli 0.159.0` 与 `claude 2.1.287` 二进制里的字符串。
- 来源立场：一手源码，但由调查 subagent 阅读并转述。
- 取得方式：见[首轮报告](reports/2026-10-01-first-round.md.txt)第 3、4 节逐条给出的文件与位置。
- 支持范围：只能当作待核对的主张。要据它做不可逆的选择之前，按报告给的位置重新读一遍。
- 后续核对：未做。
