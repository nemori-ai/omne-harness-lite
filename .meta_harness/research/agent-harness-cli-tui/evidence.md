# 可复核的来源与观察

本页是**取证条件与局限的索引**：每家的精确对象、怎么取得、这一轮实际核到了什么、以及**不能**据此声称什么。
逐条观察与原始引文在 [reports/](reports/) 的七份当轮报告里，本页不复制。当前结论见 [research.md](research.md)。

**派发者的复核义务已履行**：六份报告是 subagent 产出，属模型输出而非证据。落盘前派发者对每份报告的
**最吃重断言逐条回到原始来源复核**，复核命令与结果记在本页各节「派发者复核」行。未复核的照实标注。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 证据强度 |
|---|---|---|---|
| **Codex** | 源码 `openai/codex` commit `774d64258260f94628cc9fc55cfabd59a668571c`（2026-09-21T06:09:42Z）；本机 CLI `0.154.0`，分发标识 `0.154.0-x86_64-unknown-linux-musl` | 浅克隆源码直读 + 本机 stripped 二进制 `readelf`/`strings` + `gh api` 读 issue/PR/release **原文**（非搜索摘要）+ `developers.openai.com/codex/*` | **最强**。源码 + 官方原话 + issue 原文三层俱全。**但源码 HEAD 与本机版本差 1.5 个 minor / 12 天**，凡以源码解释本机行为处报告内已逐处标注 |
| **Claude Code** | `2.1.278`，原生二进制 BuildID `83effae1a76aa74ce70326f83068a1242f99094a`，linux-x64，234,119,480 B | 二进制 `readelf -S/-d/-V/-sW` + 带边界特征串计数与上下文抽取（`strings -n 6` 共 504,806 行）+ **未混淆的 `install.cjs` / `cli-wrapper.cjs` 英文注释**（本轮最干净的作者自述）+ `~/.claude/` 只读普查 + `--help` 实跑 | **强（实现层）/ 弱（动机层）**。二进制能读出**做了什么**，几乎读不出**为什么**；渲染层没有任何散文说明 |
| **Cursor** | `cursor-agent 2026.08.04-aaa8809`，内部包名 `@anysphere/agent-cli-runtime`；同机并存 `2026.07.20-8cc9c0b`、`2026.07.23-e383d2b` | **webpack chunk 反向取证**——分发包是未压缩/半压缩 JS 且**保留了完整原始模块 ID**，因而拿到 491 个一方源文件路径、40 个 workspace 包名、143 个精确到版本的依赖 + 本机 `file`/`du`/`--help` 实测 + 官方 changelog/docs + `forum.cursor.com` | **实现层最强，动机层为空**。闭源无 issue tracker、无源码仓库；**「作者自述理由」一条都没有**，不是没查（检索位置见该报告 §3.3） |
| **DeepSeek Harness** | `/tmp/deepseek-harness` commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10T22:17:09+08:00），`0.1.5-rc.2` | 源码全量直读 + **`.agents/notes/` 的 Decision / Alternatives considered / Consequences 段**（作者亲笔取舍理由）+ `docs/` + `patches/` + `benchmarks/` + npm registry 元数据 | **最强（取舍理由是一手的——作者写下的，不是从行为反推）**。但副本未装依赖未构建，**无任何运行时取证**；本轮禁用 git，**被删代码的 diff 不在证据里** |
| **Pi** | `earendil-works/pi` commit `890f920884f6d21fc7617d236ef9e1cc5d7a0ef8`（2026-09-21T01:14:53+02:00）；`@earendil-works/pi-tui` / `pi-coding-agent` **0.86.1** | 浅克隆源码直读 + **作者 Mario Zechner 2025-11-30 博客全文**（已本地留存 573 行）+ CHANGELOG（tui 1,183 行 / coding-agent 5,810 行）+ GitHub issue/release/npm registry API 直取 | **强**。源码 + 作者自述俱全。**本机未安装、仓库无 `node_modules`，零运行时取证**；浅克隆无法 `git log -S` 追溯；GitHub search API 中途 403 限流 |
| **Kimi Code** | 本机 `kimi 0.31.0`，ELF BuildID `5e67bdf95c7646325b62decd0ca8d375d325ea19`，153,685,184 B；备份 `kimi.bak` 为 `0.28.1`；嵌入 `@moonshot-ai/pi-tui` `0.80.8`、Node `v24.15.0`；另以上游 HEAD（2026-09-21）作对照 | **从 SEA blob 里完整解出 18.9 MB 未压缩的 `main.cjs`**（rolldown 产物，保留 3,557 个 `//#region <源文件路径>` 标记）+ 209 个 SEA 资产 + `readelf` 逐段 + `kimi --help` 实跑 + 两个仓库的 issue/CHANGELOG/docs/npm/install.sh | **强（源码级）**。SEA 的 `useSnapshot:false` + `useCodeCache:false` 使 JS 以明文存储，证据强度因此从二手跃到一手源码。**但本机 `0.31.0` 与上游 HEAD 已在 alt-screen 上分叉，报告内逐处标注** |
| **本机统一实测**（派发者） | codex `0.154.0` / claude `2.1.278` / cursor-agent `2026.08.04-aaa8809` / kimi `0.31.0`，2026-09-21 | 同一台机器、同一套方法：启动耗时 n=10 取中位、`/usr/bin/time -v` 取峰值 RSS、`ldd`+`objdump -T` 取可移植性下限、同口径终端序列与非交互界面探测 | **无立场**——不是任何一方的自述，是同一把尺子量出来的观测值。**但只有四家可测**（DSH 与 Pi 本机未安装） |

## 派发者复核：哪些断言回到原始来源验过

| 被复核的断言 | 复核方式 | 结果 |
|---|---|---|
| DSH 运行时依赖里有其它 harness 与 ripgrep | `grep` `THIRD_PARTY_NOTICES.md` | **成立**：`@anthropic-ai/claude-agent-sdk` 18 处、`@openai/codex` 1、`@earendil-works/pi-ai` 1、`@vscode/ripgrep` 1、`@agentclientprotocol/sdk` 1 |
| DSH 删 TUI 的决策记录与原文 | 直读 `.agents/notes/archived/simplification/2026-08-04-remove-tui-package.md` | **成立**，Decision 与 Consequences 段逐字一致 |
| `pi-tui` 已从 DSH 工作树清退干净 | 全仓 `grep -rl` | **成立**：36 处命中**全部**在 `.agents/notes/` 散文里，`package.json`/`pnpm-lock.yaml`/`patches/`/`.ts` 零命中 |
| Codex 把 crossterm 换成自家 fork | 直读 `codex-rs/Cargo.toml:622-625` | **成立**，逐字一致 |
| Codex 的 ratatui 开了四个 unstable feature | 直读 `codex-rs/tui/Cargo.toml:93-98` | **成立** |
| Pi 的 CI 只在 ubuntu 上跑测试 | 直读 `.github/workflows/ci.yml` 与 `build-binaries.yml` | **成立**：`ci.yml` 唯一 job `runs-on: ubuntu-latest` |
| Pi 的 issue 被机器自动关闭 | 直读 `.github/workflows/issue-gate.yml` | **成立**：`state_reason:'not_planned'` + `untriaged` 标签 + 自动关闭说明原文 |
| Pi 的 `tuiMode` 默认 `regular` | 直读 `settings-manager.ts:1265-1266` | **成立** |
| Pi 每次流式更新重建 Markdown（#6665 根因 b 仍在） | 直读 `assistant-message.ts:96,114` | **成立**：`clear()` 后 `new Markdown(...)` |
| Cursor 的 Ink 是 vendor 进 monorepo 而非 npm 依赖 | 对 `index.js` 带边界计数 | **成立**：`../ink/build/` **116**、`node_modules/ink/` **0**；fork 独有模块 `RawBlock.js`/`AccessibilityContext.js`/`BackgroundContext.js` 确在 |
| Cursor 的 fork 新增 render 选项且增量渲染没开 | 对全部 chunk 计数 | **成立**：`maxFps:30`、`incrementalRendering:!1`、`stdinInputFilter`、`onFullScreenClear`、`onReactError` 均命中 |
| Cursor 主界面不进 alt-screen | 逐文件数 `?1049h` | **成立**：全 bundle 共 3 处（`1931.index.js` 2 + `4843.index.js` 1） |
| Codex 把 ratatui 的 `Terminal` 整份复制进仓库 | 直读 `tui/src/custom_terminal.rs` | **成立**：首行 `// This is derived from \`ratatui::Terminal\`, which is licensed under the following terms:`，文件 52,350 B |
| Codex 有三套 ScrollbackStrategy 且按终端特判 | 直读 `tui/src/tui/scrollback.rs:20-31` | **成立**：`Standard`/`Zellij`/`FullScreen`，判据为 `is_zellij()` 与 `TerminalName::WindowsTerminal \|\| WT_SESSION` |
| Codex 以终端原生 scrollback 为历史存储 | 直读 `tui/src/insert_history.rs:1-4` | **成立**，文件头原文逐字一致 |
| Codex 默认不进 alt-screen（主对话） | 直读 `tui/src/transcript_mode.rs` | **成立**：`resolve(owned_enabled, alternate_screen_enabled)` 需两者同真才 `Owned`，而 `fullscreen_transcript` 默认 false |
| Codex 帧率钳制在 120 FPS | 直读 `tui/src/tui/frame_rate_limiter.rs:13` | **成立**：`MIN_FRAME_INTERVAL = 8_333_334 ns` |
| Codex 按终端硬编码 resize reflow 上限 | 直读 `tui/src/resize_reflow_cap.rs:19-22` | **成立**：VS Code 1_000 / Windows Terminal 9_001 / WezTerm 3_500 / Alacritty 10_000 |
| Codex 启动探测预算 250 ms | 直读 `tui/src/terminal_probe.rs:24` | **成立** |
| Codex 的 TUI 对非 TTY 拒绝启动 | 直读 `tui/src/tui.rs:431-434` | **成立**：`stdin().is_terminal()` 与 `stdout().is_terminal()` 双重检查 |
| Claude Code 是 Bun 编译而非 Node SEA | `readelf -S` + 版本串 | **成立**：`.bun` 145,887,974 B、`.bun_builtins`、`__DATA,__jsc_opcodes`、`__DATA,__wtf_config` 四个节区俱在，版本串 `Bun v1.4.3 (8c28b3167) Linux x64` |
| Claude Code 仍在用 Ink | 特征串 | **成立**：Ink 上游原样错误文案 `github.com/vadimdemedes/ink/#israwmodesupported` **4 处**；host element `ink-text` 13 / `ink-virtual-text` 11 / `ink-link` 8 / `ink-box` 7 / `ink-raw-ansi` 6 / `ink-root` 4 / `ink-progress` 1 |
| Claude Code 的 Yoga 被换成自研实现 | 特征串 + 符号表 + wasm magic | **成立**：独有文案 `setPointScaleFactor: Int32 storage supports scale 0 or 1 only` 在；`YG*` 原生符号 **0**；wasm magic `\x00asm\x01\x00\x00\x00` **0** |
| Claude Code 的帧调度常量 | 特征串 | **成立**：`var Mm=16,gCr=50,hCr=4,yCr=16384,i1n=250;` 逐字一致 |
| Claude Code 双渲染器 | 特征串 | **成立**：`flicker-free alt-screen renderer with virtualized scrollback` 在；`@bun @bytecode` 1903 处 |

| Kimi 的 TUI 是 pi-tui 的厂内 fork | 对二进制取特征串与 SEA 资产内的 package.json | **成立**：`@moonshot-ai/pi-tui` 8 处，`"name": "@moonshot-ai/pi-tui"` 出现两次，描述串 `Terminal User Interface library with differential rendering` 在 |
| Kimi 里残留 pi 上游痕迹 | 特征串 | **成立**：`PI_TUI_WRITE_LOG` / `PI_HARDWARE_CURSOR` / `PI_CLEAR_ON_SHRINK` 各 1 处；`@mariozechner/clipboard`（pi 作者的包）**85 处** |
| Kimi `0.31.0` 无 alt-screen、无鼠标 | 逐序列计数 | **成立**：`[?1049h` / `[?1049` / `[?1000h` / `[?1002h` / `[?1003h` / `[?1006h` **全部 0**；对照组 `[?2004h`(1) / `[?2026h`(3) / `[?1004h`(1) 均在 |
| Kimi 是 Node SEA 且 JS 明文 | 特征串 | **成立**：`NODE_SEA_BLOB` 在，构建路径串 `dist-native/intermediates/main.cjs` 在 |
| DSH 把别家 harness 钉版当运行时依赖 | 直读两个 `package.json` | **成立**：`subagent-claude-code` → `"@anthropic-ai/claude-agent-sdk": "0.3.263"`；`subagent-codex` → `"@openai/codex": "0.153.4"` |
| DSH 的 `apps/cli` 源码只有 968 行 | `find` + `wc`（排除 test/spec） | **成立**：6 个 `.ts`，合计 968 行 |
| DSH 明确拒绝 `--host 0.0.0.0` | 直读 `apps/cli/tests/built-bin.e2e.ts:365` | **成立**，断言的错误文案原文：`--host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead` |

**未复核的**：六份报告中所有**第三方 issue 正文**（codex 的 §5、cursor 的 forum 线程、pi 的 issue 数字）派发者**未独立复现**，只采信各路声明的「经 `gh api` / 页面读取原文」；这些条目在各报告里已标为「报告者自述，未复现」。

## 派发者任务书里被 subagent 纠正的三处错误

记在这里是因为它们是**取证链的一部分**——说明任务书的前提被核过，而不是被继承下来。

1. **「`~/.codex/tui.toml` 是 TUI 专属配置」——不成立。** 派发者把 kimi 的目录清单张冠李戴写进了 codex 的任务书。
   `find ~/.codex -maxdepth 2 -name '*.toml'` 只有 `config.toml`，TUI 配置是它里面的 `[tui]` 段。
   （`tui.toml` 确实存在，但在 `~/.kimi-code/`。）
2. **「Pi 项目较小，issue 可能不多」——不成立。** `api.github.com/repos/earendil-works/pi` 返回
   `stargazers_count: 107885`、`open_issues_count: 212`，issue 编号已到 #9800+。
3. **「`pi-test.ps1`/`.bat` 是 Windows 测试脚本，说明认真对待 Windows」——不成立。**
   二者是用 `tsx` 跑源码的开发包装器，无任何断言。Windows 的真实待遇见 research.md 相应结论。

另有一条**本轮自身产生并已更正的负面结论**，值得单独记，因为它比子串假阳性更隐蔽：

**「Claude Code 二进制里找不到 IME 处理证据」——已更正，该结论无效。**
取证方用带词边界的探针查 `IME`，匹配为 0（1480 次裸命中全是 `BUILD_TIME`/`ETIMEDOUT`/`TIMESTAMP`/`MIME`
这类子串）。**子串判定本身没错，但探针词选错了**——实现侧用的词是 `composition` / `extendedKeys` /
`win32InputMode`，`IME` 这个缩写根本不作标识符出现。外部证据随后推翻了它：官方 changelog `2.1.160`
字面写 "CJK IME composition"，issue #1547 仍 OPEN。
**教训：探针词不是实现者会用的词时，负面结论没有任何强度。**

另有一处**上一轮结论的版本失效**：codex 仓库 `docs/` 的指针目标已从 `learn.chatgpt.com` 变为
`developers.openai.com/codex/*`（上一轮 [会话设计专题](../agent-harness-session-design/evidence.md) 记录的是前者）。

## 这一轮不能据此声称什么

- **不能据此声称任何关于 TUI 首帧延迟、重绘帧率、大输出滚动性能的横向比较。**
  派发者的统一实测**刻意只测非交互启动**——启动交互式 TUI 等于开一个真实会话，会触碰认证、写入用户状态、可能消耗额度。
  六家报告里出现的帧率/CPU 数字**各自测法与环境都不同**（pi 的来自第三方 issue、DSH 的来自已删 TUI 的 note、
  claude 与 codex 的是配置常量不是测量值），**不可并置成一张表**。
- **不能把配置常量当性能测量。** Claude Code 的 16 ms / 4 ms / 50 ms / 16 KiB / 250 ms 是**目标与阈值**，
  不是实测帧率；说「Claude Code 跑在 60 fps」是错的，那是帧率**上限**。
- **不能据此声称「某家不支持某能力」。** 本轮反复踩到两类假阴性：
  （a）顶层 `--help` 没列不等于没有（codex 的非交互能力在 `exec` 子命令下）；
  （b）二进制里特征串 0 命中不等于不存在（Claude Code 的 `ESC[?2004h` 原始字节为 0，但序列是运行时从常量拼装的）。
  每一个「未发现」都必须连同**检索位置**一起读。
- **不能把六家一致当成正确性证明。** 一致只说明另做一种选择时举证责任更重。
- **不能据此声称任何一家的 ACP 支持情况。** 派发者的 ACP 特征串探测**方法失效**（kimi 明有 `acp` 子命令却 0 命中），
  该维度本轮不产出结论。
- **Cursor 一节几乎全部是反向取证。** 从 minify + webpack 产物读出的是**实现痕迹**，不是官方口径；
  Cursor 从未公开承认用 Ink、从未公开过依赖清单。
- **不能把某一家的 issue 数量当成质量指标。**各家 tracker 的收口方式差别极大：
  **Pi 的 issue 会被 `issue-gate.yml` 在创建时自动关闭**（`state_reason:'not_planned'` + `untriaged`），
  因此该仓库里「closed as not planned」的默认含义是「开门即被机器关掉」而非技术拒绝；
  **DSH 根本不用 Issues 收 bug**（README 指向 Discussions），本轮**没有一条带 `deepseek-harness#<n>` 的缺陷单**；
  **Cursor 没有公开 issue tracker**。跨家比较 issue 数等于比较三套不同的收口制度。
- **不能据此声称 Kimi 的启动比早期版本变慢或变快。**第三方在 v0.6.0 / darwin-arm64 上测得 ~0.21 s，
  派发者在 0.31.0 / linux-x64 上测得中位 1242 ms——**版本、平台、机器、方法全不同，不能相减**。
- **所有结论都绑在上表的精确版本上。** 六家迭代都很快（Codex 本机 `0.154.0` 就精确命中两条仍开着的版本回归）。
  下一轮核对按 [演进事件词](../README.md#演进事件词) 记一条，**不要原地覆盖**。
