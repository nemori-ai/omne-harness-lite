# 可复核的来源与观察

本页是**索引与取证条件**：每个来源的精确对象、取得方式、立场、这一轮实际核到了什么、以及不能据此声称什么。
逐条观察与行号在 [notes/](notes/) 的三份来源笔记里，本页不复制；映射全表在 [reports/2026-09-23-hooks-to-positions.md](reports/2026-09-23-hooks-to-positions.md)。
当前结论见 [research.md](research.md)。

宿主升级时 grep 本页与 `notes/` 里的版本 token（`2.1.280`、`2.1.274`、`5c5308f`、`c291e79`、`0.142.5`），命中的记录就是需要重新核对的候选。

## E1 Claude Code 官方参考页

- 消费对象：research.md 中所有关于 Claude Code 的结论。
- 来源与精确修订：`https://code.claude.com/docs/en/hooks.md`，**2026-09-23 抓取**；原样字节随包存为
  [sources/claude-code-hooks-2026-09-23.txt](sources/claude-code-hooks-2026-09-23.txt)，sha256 `dc59d7c4fb28b246b15db67fd30819cbc6aca09392be662080b602eeab6d5422`；
  来历与校验见 [sources/provenance.json](sources/provenance.json)、[sources/SHA256SUMS](sources/SHA256SUMS)（`cd sources && sha256sum -c SHA256SUMS`）。
  扩展名改为 `.txt` 只为不让仓库的 Markdown 链接检查解析官方页的站内绝对链接，内容未改。
- 来源立场：厂商自述。
- 取得方式：`curl -sSL`，HTTP 200，**未经 WebFetch 模型摘要**；本机 `claude --version` = 2.1.280。
- 环境与前提：页面不标对应的发布版本，页内最高提到 v2.1.274；「它描述的就是 2.1.280」是**未核对的假设**。
- 实际观察：见 [notes/claude-code.md](notes/claude-code.md)（按「doc:行号」引用快照）。
- 支持范围：该日线上文档对 33 个事件、5 种 handler、退出码、JSON 字段、决策优先级、`defer` 回路、Stop 8 次上限、transcript 重放注入等的**表述**。
- 不支持：2.1.280 实测行为；多个 PreToolUse 改写的胜出规则；改写是否在 transcript 留痕；并行调用的 PreToolUse 是否全判完才执行。
- 找过没找到：本机没有 Claude Code 源码或更早的官方文档副本；二手整理 `/data/qiwei/repos/cc-master/design_docs/research/claude-code-hooks-reference.md`（2026-06-11）只作线索，本轮未采信其结论。
- 后续核对：无。

## E2 Codex 源码与文档

- 消费对象：research.md 中所有关于 Codex 的结论。
- 来源与精确修订：`openai/codex` @ `5c5308fc9a9ee789049d646ef11e5400384b9c6f`，主检出 `tmp/sources/codex-5c5308f.tar.gz` 解包于
  `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/codex/codex-rs/`（只含 `hooks`、`protocol`、`rmcp-client`、`core/src`）；
  官方文档副本 `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/codex-docs/hooks.md`（2026-09-20 抓取自 learn.chatgpt.com，sha256 `6b4c549c4f1df78e802f289151e54f7677128b8a9929912afb7e8ecd975d2ce9`）。
  两份原件的校验在主检出 `tmp/sources/SHA256SUMS`，本包不另存（它们已被钉住）。
- 来源立场：厂商自述（文档）与厂商实现（源码）；冲突处按源码记并写明（PermissionRequest 保留字段、prompt/agent handler、schema 与运行时）。
- 取得方式：直接读文件与 grep；未运行二进制。
- 实际观察：见 [notes/codex.md](notes/codex.md)（源码 `路径:行号`、文档「doc:行号」）。
- 支持范围：该 SHA 的事件枚举、handler 支持、并发执行、决定折叠、改写的应用方式、Stop 续跑、审批优先级、legacy notify。
- 不支持：rollout 是否持久化 hook 记录与改写（crate 不在副本内）；当前发行版行为。
- 后续核对：无。

## E3 DSH hook-protocol 与桥接

- 消费对象：research.md 中关于 DSH 的三条结论，以及各条结论里的 DSH 对照。
- 来源与精确修订：`deepseek-ai/deepseek-harness` @ `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`），主检出 `tmp/sources/dsh-c291e79.tar.gz`
  解包于 `/data/qiwei/repos/omne-harness-lite/tmp/sources/extracted/dsh/`；读了 `packages/hooks/**` 与四份 `.agents/notes`。
- 来源立场：作者自述（README、Agent Note）与实现；「与今天两家的漂移」是本轮对照 E1、E2 得出。
- 取得方式：直接读文件；未运行 DSH 测试。
- 实际观察：见 [notes/dsh-hook-protocol.md](notes/dsh-hook-protocol.md)。
- 支持范围：库的对象模型与依赖、两个桥接的事件覆盖与转译规则、作者自认的缺口与理由。
- 不支持：DSH 串行执行与参考实现结果一致（作者论证，未复现）；被依赖包 `dsh-agent`/`dsh-tools` 的内部行为。
- 反常：`pre-tool-input-rewrite.md:35` 说 loop 分派处有 `TODO(pre-tool-input-rewrite)` 锚点，本 SHA 全仓 grep 未命中。
- 后续核对：无。

## E4 本机 Claude Code transcript 与插件实例

- 消费对象：research.md「Claude Code 把 hook 注入的上下文存进 transcript…」一条；notes/claude-code.md「七、本机插件实例」。
- 来源与精确修订：
  - transcript：`/data/qiwei/.claude/projects/-data-qiwei-repos-omne-next/913a4b5c-732e-45fa-ad5e-d715556f2fd0.jsonl`（记录 `version` 2.1.247）；另对 `/data/qiwei/.claude/projects/**.jsonl` 全量 grep `"type":"hook_*"`。
  - 插件：`/data/qiwei/.claude/plugins/cache/cc-master/cc-master/0.21.1/hooks/hooks.json`、`/data/qiwei/.claude/plugins/cache/openai-codex/codex/1.0.5/hooks/hooks.json`、
    `/data/qiwei/.claude/plugins/marketplaces/claude-plugins-official/plugins/*/hooks/hooks.json`（六个）。
- 来源立场：本机实际落盘数据（一手），但路径不钉，随时可能被清理。
- 取得方式：只读 grep 与 JSON 解析。
- 实际观察：`hook_additional_context` 附件带 `hookName`、`hookEvent`、`toolUseID`；全量计数 `hook_system_message` 5、`hook_success` 3、`hook_additional_context` 2、`hook_non_blocking_error` 1。插件 hook 全是 `type: command`。
- 支持范围：注入上下文在 2.1.247 的落盘形态；本机样本的 hook 用法分布。
- 不支持：2.1.280 的落盘形态；「决定」（deny、改写）本身是否落盘；生态整体用法。
- 后续核对：无。

## E5 cc-master Codex 探针（独立实测）

- 消费对象：research.md 关于 Stop 续跑与协议演进的两条结论（旁证）。
- 来源与精确修订：`/data/qiwei/repos/cc-master` @ `613a00e77f394d542c6fef4890ac6d768c7a1f6c`：
  `plugin/src/hooks/_hosts/codex/probes/README.md`、`plugin/src/hooks/_hosts/codex/strategy.yaml`、`plugin/src/hooks/board-guard/CONTRACT.md`、`plugin/src/hooks/_shared/contract.md`。
- 来源立场：独立第三方（插件作者）对 Codex CLI 0.142.5 / 0.144.2 / 0.145.0 的实测记录；**本轮未复跑**，仅转述其记录。
- 实际观察：0.142.5 的 Stop `decision:block` 与 exit 2 反复重入 Stop 直到超时；插件 hook 子进程环境里未见 `PLUGIN_ROOT`/`CLAUDE_PLUGIN_ROOT` 等变量；`apply_patch` 的 `tool_input` 载体随版本变化；
  为同时适配多个宿主，cc-master 另建了一层规范化载荷与结果（`silent`/`context`/`block`/`allow`），宿主不支持 block 的事件由启动器降级或 fail-closed。
- 支持范围：旧版本 Codex 的实际行为与文档不一致的实例；跨宿主适配需要规范化层的实例。
- 不支持：`5c5308f` 或当前发行版的行为。
- 后续核对：无。

## E6 产品正文对照基线

- 消费对象：全部映射与「对照产品正文时撞上的缺口」。
- 来源与精确修订（HUB `.worktrees/assets-runtimes` @ `cdff9e5`）：
  [PF-012 design.md](../../design/product/PF-012-agent-loop-and-run/design.md)（rev 7）§5.3、§5.6、§5.8、§5.9、§6.7、§6.9、§6.10 与 [README](../../design/product/PF-012-agent-loop-and-run/README.md) 的位置清单；
  [PF-008 design.md](../../design/product/PF-008-human-in-the-loop/design.md)（rev 4）§4、§5.2、§5.3、§6.1、§6.8；
  [PF-002 design.md](../../design/product/PF-002-assets-settings-and-permissions/design.md)（rev 10）§4 Loop Extension；
  [PF-000 design.md](../../design/product/PF-000-occurrences-and-record-entries/design.md)（rev 1）§5.3；
  词条 [UL-loop-extension-point](../../design/ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)、[UL-loop-extension](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)。
- 来源立场：本项目产品正文（对照基准，不是被调查对象）。
- 支持范围：位置、维度、三档干预力、否决含义、只经日志起作用、等人与卡片的产品定义。
- 后续核对：上述任一 topic 升 rev 时，本包的映射需复核。
