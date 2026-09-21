# DeepSeek Harness 的 CLI：它没有终端界面——`dsh` 是一个 968 行的 profile 启动器兼插件管理器，人机界面在浏览器与 Electron 里，终端侧只剩一次性 headless、两条 stdio 协议，以及一套对别家终端 agent 的兼容适配

本报告只陈述 DSH 上游自身的事实与作者自述的理由。**全文不含任何关于第三方（含承载本报告的仓库）应当如何选型或实现的判断。**

> **取景说明**：本轮任务书按「TUI 栈」设问。经构造性核查，DSH **不在终端里渲染界面**，因此「渲染循环 / alt-screen / scrollback / 重绘策略」等问题在本对象上**不适用**——§2.3 逐条给出判定与依据，不为填满结构而编造。报告改为回答：这个 CLI 到底承担什么、为什么界面被放到浏览器、它与终端之间还剩什么接口。
>
> §3.6「对别家终端 agent 的兼容姿态」是本对象独有的一节，读者可直接跳阅。

---

## 0. 调查对象与取得方式

| 项 | 值 |
|---|---|
| 对象 | DeepSeek Harness（`dsh`），DeepSeek AI 开源 agent harness |
| 本地路径 | `/tmp/deepseek-harness`（只读副本） |
| commit | `c291e7961a515f6d7af9304e7fd1d257929aef26`，提交时间 `2026-09-10 22:17:09 +0800`（`Merge pull request #3977 from deepseek-harness/worktree/release-0.1.5-sync-master`） |
| 版本 | 根 `package.json` `version: 0.1.5-rc.2`；npm `@deepseek-ai/dsh` 的 `latest` 亦为 `0.1.5-rc.2` |
| 抓取日期 | 2026-09-21 |
| 上游仓库 | `https://github.com/deepseek-ai/deepseek-harness` |

**全部结论绑定在上述 commit。**DSH 自述处于 developer preview 且会破坏兼容（`README.md:13`：「DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**」），早于或晚于该 commit 的版本不受本报告覆盖。

### 取证方法与自我约束

- **未执行任何 `git` 命令**（本轮约束）。因此关于已删除代码，本报告只能引用仍留在工作树中的 `.agents/notes/` 决策记录（作者自述），**不含任何被删代码的 diff**。
- **副本未安装依赖、未构建**：`node_modules` 与 `apps/cli/lib` 均不存在。**因此没有运行 `dsh --help` / `--version`**，本报告不含 CLI 运行时原文输出；所有命令行语法出自 `apps/cli/src/args.ts` 与 `apps/cli/README.md`。
- **子串假阳性防范**：判定 TUI 框架与控制序列时不使用 `ink`、`tui` 一类短词裸匹配，而用带边界的特征串（`ink@`、`"ink"`、`react-reconciler@`、`yoga-layout@`、`?1049`、`?2026`、`DECSET`），命中计数逐项在 §1.3 / §2.3 给出。

### 证据强度自评

| 层级 | 内容 | 强度 |
|---|---|---|
| 一手 · 码 | `packages/**`、`apps/**`、`patches/**`、`pnpm-lock.yaml`、`THIRD_PARTY_NOTICES.md` | **强**，可复核到行 |
| 一手 · 述 | `.agents/notes/**` 的 Decision / Alternatives considered / Consequences 段 | **强**，取舍理由由作者写下，非从行为反推 |
| 一手 · 文档 | `docs/**`、各包 README | **中强**，文档与实现分叉处在 §7.4 逐条声明以哪层为准 |
| 二手 | GitHub Discussion、第三方 issue、博客、SEO 站 | **弱到中**，逐条标注，见 §5 |

---

## 1. 技术栈

**结论：`dsh` 是一个 TypeScript/Node ESM 的启动器，参数用 commander，源码只有 6 个文件 968 行。它不包含任何终端界面渲染代码——这是构造性确认，不是"没查到"。真正的界面技术栈是浏览器里的 React 18 + Cordis 插件图，另有一个 Electron 桌面壳。**

### 1.1 `apps/cli` 到底有多大、在做什么

`apps/cli` 下 `.ts`/`.tsx` 共 **59 个文件**，但其中**源码只有 6 个 `.ts`，合计 968 行**，其余全部是测试（17 个顶层 spec/e2e + `tests/profiles/**` 的快照夹具）。

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/bin.ts` | 66 | `#!/usr/bin/env node` 入口。读版本、调 `parseDshArgs`，按 mode **动态 import** 三个 runner 之一 |
| `src/args.ts` | 211 | commander 适配层。**只解析 launcher 自己的旗标**，第一个不认识的 token 起，全部原样转交被引导的 profile |
| `src/profile-boot.ts` | 392 | 最重的一块：代理环境、信号接管、profile 组合与重组合、HMR 监视、boot |
| `src/plugin.ts` | 163 | `dsh plugin` —— 把参数原样转发给 profile 目录里的 pnpm |
| `src/dump-config.ts` | 59 | `--dump-config` / `--dump-default-config`，不 boot 只打印组合后的树 |
| `src/process-shutdown.ts` | 77 | 信号与退出码 |

【事实】CLI 源码里没有任何 UI、渲染、输入处理代码。
【判断】这 968 行的职责可以概括为：**解析我自己的几个旗标 → 组合一棵 Cordis 插件树 → 把树跑起来 → 把剩下的参数交给树里的应用 → 管好信号与退出码**。

`apps/cli/package.json` 的自述（原文）：`"description": "dsh CLI: profile boot, plugin management, and the browser UI alias"`。

### 1.2 职责边界：三个 boot 期的包

| 包 | 自述职责（README `description` 原文） |
|---|---|
| `@deepseek-ai/dsh-cmdline` | 「App-owned command lines for dsh app bins: your app parses its own flags, `--help`, and exit behavior from the launcher's remaining arguments.」 |
| `@deepseek-ai/dsh-app-boot` | 「Shared Loader boot support for dsh profiles and the temporary Python SDK runtime: environment layers, patches, diagnostics, and configuration preview.」 |
| `@deepseek-ai/dsh-headless` | 「One-shot task mode for dsh: run a single task from the command line and get the final answer printed, for users scripting or automating dsh.」 |

分界线由 `dsh-cmdline` 的 README 讲得最清楚，它给应用三样东西：
- `ctx.cmdlineArgs` —— 本次调用的内层参数，**不可变快照**，读取不消耗也不改变它。README 原文：「`dsh --profile tui --resume abc` gives your app `['--resume', 'abc']`」
- `ctx.appExit` —— 请求进程退出，接到 launcher 的关机控制器上
- `ctx.appReady` —— 启动成功信号，「committed only after the Loader tree and launcher-owned setup succeed」

还有一个专为 stdio 应用准备的原语：「`exitOnStdinEnd(ctx, label)` binds a successfully started stdio application's EOF to `ctx.appExit(0)`. **It never reads or resumes stdin**, so a protocol transport receives bytes buffered before it mounts」。

【判断】这套边界的效果是：**launcher 完全不知道应用的命令行长什么样**，`--help` 由应用自己打印。代价是同一个 `dsh` 二进制下，`--help` 的输出取决于 `--profile` 选了谁（`apps/cli/reference/README.md:25` 明文：「`dsh --profile web --help` prints that app's help and boots nothing, and `dsh --help` (no profile to hand it to) prints the launcher's own」）。

### 1.3 终端界面框架：构造性确认不存在

**这是本报告强度最高的负面结论，属于「构造了反例验证过不存在」**：

| 检索位置 | 检索式（带边界） | 命中 |
|---|---|---|
| `pnpm-lock.yaml`（865,785 字节，全仓唯一锁文件） | `ink@` `blessed@` `opentui@` `react-reconciler@` `yoga-layout@` | **0** |
| 全部非 node_modules 的 `package.json` | 带引号精确名 `"ink"` `"ink-*"` `"blessed"` `"opentui"` `"neo-blessed"` `"chalk"` `"ansi-escapes"` `"string-width"` `"log-update"` `"ora"` `"cli-spinners"` `"terminal-kit"` `"inquirer"` `"prompts"` `"enquirer"` `"@clack/*"` | **各 0** |
| `THIRD_PARTY_NOTICES.md` 的 "Runtime npm dependencies" 表（DSH 自己生成，自述覆盖「every plugin a user can mount from `cordis.yml`」） | 同上 | **各 0** |

作为对照，同一批 `package.json` 里 `react` 出现 **50 处**。

CLI 参数解析库的分布：`commander` 6 处；`yargs`/`cac`/`citty`/`clipanion`/`minimist` 各 **0**。

### 1.4 与「终端」有关的依赖只有三个，没有一个用于绘制界面

| 依赖 | 唯一消费者 | 用途 |
|---|---|---|
| `node-pty@1.2.0-beta.15`（pinned + patched） | `packages/subprocess/subprocess-local/package.json:47` | 给 **agent** 开真 PTY 跑 shell 命令 |
| `@xterm/headless@^6.0.0` | `packages/terminal/terminal-bash/package.json:42`（`src/session.ts:29` 经 `createRequire` 加载） | **无头**终端仿真，解析 PTY 回来的控制序列以判定 shell 就绪。不渲染任何东西 |
| `supports-color@^9.4.0` | `vendor/logger-console/package.json:40`（`src/index.ts:23`：`colors: (supportsColor.stdout ? supportsColor.stdout.level : 0)`） | Cordis 控制台 logger 的颜色分级 |

【判断】前两个服务于「agent 执行命令」，第三个服务于「框架打日志」。**DSH 在终端里唯一的彩色输出通道是框架 logger。**

### 1.5 界面实际的技术栈：浏览器与 Electron

`packages/client/` 下是 **50 个 `ui-*` 包**（`ui-chat`、`ui-conversation`、`ui-approval`、`ui-deliverables`、`ui-tool`、`ui-theme`、`ui-primitives` …）。`packages/client/web/package.json` 自述为「Web boot kernel: static module table, Cordis loader, framework-free boot page, and UI-renderer handoff」，依赖 `react@^18.2.0` / `react-dom@^18.2.0`。

关键渲染件（均出自 `THIRD_PARTY_NOTICES.md` 运行时表 + 源码消费者核对）：

| 用途 | 依赖 | 消费者 |
|---|---|---|
| ANSI → React span | `anser` | `packages/client/ui-primitives/src/ansi.ts` |
| 代码高亮 | `shiki` + `@shikijs/langs` | ui-primitives |
| 数学 | `katex` | ui-primitives/markdown |
| Markdown | `micromark-*` + `mdast-util-*`（**直接渲染 mdast，不经 react-markdown / unified / hast**） | ui-primitives/markdown |
| 输入框 | `lexical` + `@lexical/history|plain-text|text|utils` | composer |
| 长列表虚拟化 | `@tanstack/react-virtual` | `packages/client/ui-trajectory/src/client/TrajectoryTable.tsx:5` |
| 样式 | CSS Modules + `clsx`（`docs/web-styling.md:20` 明文「do not add a component library or Tailwind」） | 全部 ui-* |

`apps/` 四个装配入口，自述（`package.json` 的 `description` 原文）：

| 应用 | description |
|---|---|
| `apps/cli` | 「dsh CLI: profile boot, plugin management, and the browser UI alias」 |
| `apps/web` | 「Web application entry: vite build over the @deepseek-ai/dsh-client-web shell library; dist/ served by apps/cli's dsh web」 |
| `apps/desktop` | 「Electron desktop shell for a bundled dsh runtime and external plugins」 |
| `apps/desktop-host` | 「**Private upstream-Node host process** for the Electron desktop application」 |

### 1.6 原生代码：C11，且与界面无关

`native/` 下只有三个 C 文件（`find` 确认无 `.rs` / `.cc` / `.cpp` / `binding.gyp` / `Cargo.toml`）：

| 文件 | 行数 | 能力 |
|---|---|---|
| `native/system/packages/entry/src/main.c` | 298 | `landlock-run`：self-restrict-then-exec 的 Linux Landlock 沙箱启动器 |
| `native/system/packages/entry/src/flock.c` | 164 | `system.node`：`flock(LOCK_EX\|LOCK_NB)` 的 Node-API v8 异步绑定 |
| `native/system/test/fixtures/flock-oracle.c` | — | 测试用独立 syscall oracle |

**为什么必须原生**（`main.c:2-13` 原文）：「The Landlock rung of a consuming sandbox seam, for Linux hosts where `bwrap` is unusable (not installed, unprivileged user namespaces disabled, or an LSM profile that denies mount — **Landlock is an independent syscall family and needs none of those**).」——裸 syscall，且必须在 `exec` 前自我限制，JS 做不到。

`flock` 原生化的动机不是性能而是**消除安装期编译**（`.agents/notes/implemented/architecture/2026-09-07-prebuilt-system-primitives.md` Problem 段）：「The JSONL writer's `fs-ext` dependency compiled a NAN addon during consumer installation. Native compiler availability and Node module ABI changes therefore affected ordinary installs, including Node 26.」

平台矩阵（`native/system/docs/support-matrix.md:5-14`）：linux-x64 / linux-arm64（静态 Landlock 可执行 + glibc 与 musl 两份 `system.node`）、darwin-x64 / darwin-arm64（只有 `system.node`，无 Landlock）。**Windows 两者皆无**：「Windows has neither a Landlock launcher nor this POSIX addon.」**无安装期编译回退**（`native/system/AGENTS.md`：「There is no install-time compile fallback. Missing Landlock binaries probe unusable; missing flock bindings reject acquisition, **never silently grant a lock**.」）。

一条可引用的历史：`.agents/notes/rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md` 在拒绝把 Landlock 启动器换成第三方 Rust 库时提到，该启动器「**already migrated away from a Rust dependency**」——即它曾经是 Rust，后迁到 C。

**明确记录：`native/` 的存在与终端界面无任何关系**，它服务于沙箱与文件锁。

### 1.7 vendor/：源码内联的框架层

`vendor/` 是 9 个包的**源码内联副本**（非 npm 依赖、非 submodule、非 git fork）：`cosmokit@1.8.1`、`schemastery@3.18.0`、`cordis@4.0.0-rc.7`，以及 `loader`/`include`/`group`/`timer`/`hmr`/`logger-console`。`vendor/README.md:3` 原文：「They are copied into this monorepo instead of being depended on via npm, so that the harness **fully owns its framework layer (auditable, patchable, pinned)**.」全部重命名到 `@deepseek-ai` scope，理由（`:5`）：「publishing the harness publishes this framework layer too, and a publication under the upstream names would squat them on the registry」。README 逐条记录 **19 项本地修改**，同步靠人工按修改日重放；自动化漂移检查目前仍是 **proposed 未实现**（`.agents/notes/proposed/process/2026-06-11-supply-chain-and-vendor-drift.md`）。

---

## 2. CLI 的终端行为契约（以及哪些问题不适用）

**结论：`dsh` 在终端里只做四件事——打印一行启动 URL、把 reasoning 写 stderr 把答案写 stdout、让 stdout 被协议帧独占、管好信号与退出码。它不检测 TTY，不进 raw mode，不发任何屏幕控制序列。**

### 2.1 五个出厂 profile 的 IO 契约

`docs/architecture.md:43` 原文：「Every supported Node application starts at the `dsh` CLI with a named profile. The shipped applications are `dsh web` (the deliberate alias for `--profile web`), `dsh --profile headless`, `dsh --profile sdk`, `dsh --profile sdk-minimal`, and `dsh --profile acp`.」

| profile | 应用自有参数 | stdout | stderr | 谁是人机界面 |
|---|---|---|---|---|
| `web` | `--host` `--port` `--trusted-host` `--no-open` | 一行 `dsh web:` + 带 token 的 URL | 打不开浏览器时的诊断 | **浏览器** |
| `headless` | 任务文本（位置参数） | 只有最终答案 | reasoning delta，前缀 `dsh: reasoning:` | 无（一任务一进程） |
| `sdk` / `sdk-minimal` | 无 | JSON-RPC 帧 | — | 调用方程序 |
| `acp` | 无 | 换行分隔的 ACP JSON-RPC 帧 | — | 调用方程序 |

（参数列出自 `apps/cli/reference/README.md:33-39`。）

### 2.2 非交互 / 管道模式：有，且契约写得很细

**这是 DSH 与终端之间真正存在的接口。**`packages/bundle/headless/README.md:36` 原文：
> 「The agent works through the task, **streams each non-empty provider reasoning delta to stderr under a `dsh: reasoning:` heading**, then prints the final answer on stdout and exits. Consecutive reasoning deltas stay in one section... A successful run without reasoning keeps stderr empty; a failure exits 1 and prints `dsh: <code>: <message>` to stderr.」

【判断】stdout 只放答案、stderr 放过程，这正是管道友好的形状：`dsh --profile headless "..." > answer.txt` 能拿到干净结果。

作者自己列的缺点（同 README 的 **Known Limitations** 段，原文）：
- 「**One task per run** — after the task is answered the process exits; there is no interactive follow-up」
- 「**No pre-token heartbeat** — stderr stays silent until the provider emits a non-empty reasoning delta; **a delayed first token exposes no earlier progress signal.**」
- 「**Reasoning enters stderr logs** — redirection and supervisors may retain substantially more and potentially sensitive model output; route stderr to a controlled sink when needed.」
- 「**Only reasoning and the final answer are printed** — a run without an assistant message prints an empty stdout line and exits 1; **intermediate tool output is not printed.**」

**stdout 纯净性被写成纪律**（`.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md:29`）：
> 「**stdout carries framed JSON-RPC only, so the app mounts no stdout logger and the bridge does not monkey-patch process output.**」

`packages/bundle/acp-app/README.md` 补充：`dsh --profile acp --help` 「writes help and exits **without claiming stdin or stdout**」。

### 2.3 原任务书的终端渲染诸问：逐条判定

| 任务书问题 | 判定 | 依据与强度 |
|---|---|---|
| alt-screen 还是 inline 滚动区 | **不适用** | **构造性确认**：全仓库（不限扩展名、不排除任何目录）检索 `?1049`、`?2026`、`DECSET`、`alternate screen`、`alt-screen`、`altscreen`，**命中文件数各为 0**；动态构造形态 `\x1b[?${`、`\u001b[?${`、`CSI ?` 同样 **0**。对照组 `?2004`（bracketed paste）命中 2 个文件，且**都是 `.agents/notes/` 里的散文**，不是代码 |
| 渲染循环 / 重绘策略 | **不适用**（终端层） | 无终端渲染代码。浏览器侧的等价物见 §2.5 |
| scrollback | **不适用于界面**，但在**工具层**存在 | `scrollbackLines`/`scrollbackMaxBytes` 是 `packages/terminal/terminal-bash` 给 agent 的 PTY 会话保留的输出缓冲（默认 10,000 行 / 4 MiB），不是界面滚动历史 |
| 宽字符 / CJK 处理 | **终端层不适用**；**浏览器层存在且实现完整** | 见 §2.5 与 §3.5 |
| 终端能力探测与降级 | **当前不存在**；历史 TUI 曾有（`COLORTERM` 探测 truecolor） | 见 §3.3 的历史证据 |
| 输入模型（多行、粘贴、快捷键、IME） | **终端层不适用**（无 raw mode、无 readline）；浏览器侧用 Lexical | 见 §2.4、§2.5 |
| 非 TTY / headless / 管道 | **适用**，见 §2.2 | — |
| 多路输出（stdout vs 渲染区） | **适用**，形态是 stdout vs stderr vs 协议帧独占，见 §2.1–2.2 | — |
| 主题与可访问性 | **终端层不适用**；浏览器侧有 | 见 §3.5 |

### 2.4 没有 TTY 检测（"该读的地方读遍了没找到"级）

```
grep -rn "isTTY|isatty|setRawMode|process.stdin.on|readline" packages/ apps/ vendor/ --include='*.ts'   （排除 test/spec）
```
→ 唯一命中是 `packages/experimental/webworker-runtime/src/node/builtin_modules/implemented/tty.ts:11` 的 `isatty` 垫片，属实验性 WebWorker 里的 Node 内建模块模拟，与 CLI 无关。

【判断】出厂 CLI **不按 TTY 与否改变行为**。
【前提】该判断成立的前提是：`vendor/logger-console` 依赖的 `supports-color` 自己会查 TTY——那一层的适应是库行为，不是 DSH 代码。

唯一的环境自适应是 **SSH 检测**，且只决定「要不要替你开浏览器」：`packages/util/launch-environment/src/index.ts:120-126`「Detect SSH from non-empty `SSH_CONNECTION` or `SSH_TTY` inherited at launch.」

**信号与退出码**（`apps/cli/reference/README.md:91` 原文）：
> 「Process shutdown gives the plugin tree **up to five seconds** to dispose. The first `SIGINT`/`SIGTERM` starts that graceful drain — `SIGTERM` is a supervisor's ordinary stop request and **exits 0** on every surface, `SIGINT` reports **130**; a second signal forces immediate exit. If one-shot normal completion is already stuck in disposal, the first `Ctrl+C` is the escalation and exits immediately instead of being swallowed.」

`src/profile-boot.ts:304-308` 的注释说明信号接管的时点：「Signals own teardown throughout the startup window, not only after `boot()` settles: an inserted provider can publish before sibling rows finish mounting.」

### 2.5 界面在浏览器里怎么渲染（终端诸问的等价物落在哪）

**流式节流**：`packages/client/ui-conversation/src/client/conversation/assembly.ts:130-138`，代码注释原文「**Cross three paint opportunities before publishing high-frequency stream updates.**」实现是三层嵌套 `requestAnimationFrame`。
【事实】高频流式更新每跨 3 个绘制机会发布一次。【推断】60Hz 下约合 20 fps 文本刷新上限。【前提】该换算假设 rAF 与刷新率同步，代码未声明目标帧率。

**增量 Markdown**（`.agents/notes/archived/architecture/2026-08-06-web-markdown-incremental-ast-renderer.md`）：
- Problem 原文：「`MarkdownText` re-parsed the whole accumulated reply on every streaming publish ... **per-chunk main-thread work grew linearly with the reply and the stream's cumulative cost grew quadratically.**」
- 解法：冻结除末尾两个 block 外的一切，只从最后一个冻结 block 的 `position.end.offset` 之后重解析。「Each source region parses O(1) times per stream instead of once per chunk; **a single giant block (an unclosed fence) degrades to the old full-reparse cost and no worse.**」
- 作者自列的两处行为偏差：「a reference-style link or footnote whose definition lands on the other side of a freeze boundary **renders literally while streaming**, and a footnote reference can **flash back to literal text**」

**终端输出在 DOM 里被重放**：`packages/client/ui-primitives/src/ansi.ts`（443 行）不是简单 ANSI→HTML，而是逐列 cell 重放——
- 光标移动（`\r`、退格、`\x1b[K`）按列缓冲重放。`.agents/notes/archived/feature/2026-07-28-web-terminal-card.md:24` 原文：「These semantics match a real terminal; **truncate-and-delete approximations look right and are not.**」
- Tab 停位 8 列（`ansi.ts:98` `TAB_WIDTH = 8`）
- **宽字符占两列且 spacer 语义正确**（`ansi.ts:286-290` 注释）：「A wide character occupies two columns; the trailing one is a spacer, marked so that overwriting the lead cell leaves a blank behind instead of closing the gap and shifting everything after it left.」
- 组合符号占零列（`ansi.ts:105`）：`ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}​-‏⁠]$/u`
- `blink` **故意不实现**（`ansi.ts:58-59`）：「`blink` is deliberately absent — **animated text is not reproduced.**」

宽度判定的实现（`ansi.ts:113-135`）——**这是本轮 i18n 与渲染的交汇点**：
```
const WIDE_CHAR = new RegExp(
  '\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}'
  + '|\\p{Emoji_Presentation}'
  + '|[\\uff01-\\uff60\\u3000-\\u303e]', 'u')
```
注释原文：「Emoji presentation only: the U+2600-U+27BF symbol block is mostly SINGLE width — `✓` (the check every progress line writes, this fixture included) **advances one column, verified against a real terminal**, so taking the whole block as wide misaligned exactly the output this card exists for.」

【事实】DSH 用 Unicode 属性转义自判宽度，**未引入 `string-width` / `wcwidth` / East-Asian-Width 表**（全仓这三个名字命中 0）。
【判断】这是刻意的近似，作者自述覆盖面是「the ranges a command's output realistically carries」（`ansi.ts:126-127`），不是完整 UAX #11。
【推断】超出 Han/Kana/Hangul/全角块/Emoji_Presentation 的宽字符（如部分 Ambiguous-width）会被算成一列。**本报告未构造反例验证，此为推断不是事实。**

**输入**：浏览器 composer 用 **Lexical**。【判断】这意味着多行、IME、撤销重做由该编辑器负责。**本报告未精读 composer 源码，这是依赖选择推出的判断，不是读到的契约。**

---

## 3. 工程实践与设计品味

**结论：DSH 的品味可概括为「拒绝是第一等公民」——它有一份机器可检的拒绝清单，而最重的几个拒绝（删 TUI、砍 ACP 的 UI 面、不收外部 PR）都留下了署名理由。多语言是一等公民（1,437 个双语台账文件）。品牌文件只管商标不管视觉。**

### 3.1 为什么界面在浏览器：作者自述的直接理由

这个问题在仓库里有一份正面回答——**它是以"删掉 TUI"的形式写下的**。`.agents/notes/archived/simplification/2026-08-04-remove-tui-package.md`（Status: implemented，Archived: 2026-09-04）。

**Problem（`:10-12`，原文）**：
> 「Removing the implicit `dsh` terminal application left `@deepseek-ai/dsh-tui` without a shipped composition. The package still carried a terminal renderer, interactive command and question adapters, extension overlays, snapshot fixtures, a patched `pi-tui` dependency, and SDK scaffolding that advertised TUI as a supported application interface. **Keeping that surface required maintaining a product-sized frontend whose only remaining consumer was the project generator itself.**
> The package also made the repository's supported application inventory misleading. **Current runnable products use Web, ACP, JSON-RPC, or one-shot CLI entry points, while the SDK continued to offer a terminal choice that no example or product command exercised.**」

**Decision（`:16`）**：
> 「The `packages/ui/tui` package is deleted **without a compatibility package or alias.**」

**Alternatives considered（`:30-34`，三条全文）**：
> 「**Keep the package unshipped.** Rejected because it preserves the maintenance cost and continues to present an unsupported terminal frontend as reusable product surface **without a real composition proving its lifecycle.**
> **Keep the SDK option for external consumers.** Rejected because the generator would be the package's only in-repository consumer and would scaffold an application the repository no longer accepts end to end.
> **Move the package to an examples or experimental group.** Rejected because moving code does not provide a current product need, a maintained deployment, or assembled acceptance. **A future terminal frontend should start from its actual host and interaction requirements rather than inherit this implementation by default.**」

**Consequences（`:38-40`）**：
> 「DeepSeek Harness has no terminal UI package. **Existing imports and `cordis.yml` rows that depend on the package fail instead of being translated.** **Web remains the shipped interactive surface**; ACP, JSON-RPC, and one-shot CLI remain the non-Web entry points.
> ... **Reintroducing a terminal frontend requires a named product or deployment, an explicit package boundary, a concrete interaction provider, and assembled lifecycle and transcript acceptance for that frontend.**」

【判断】理由不是「浏览器更好」，而是**「没有出厂组合在用它，而它的维护成本是一个产品级前端」**。作者从头到尾没有论证 Web 在交互上优于终端。这一点值得精确记录，因为它容易被读成前者。

该 note 还顺手记下了**随包一起丢掉的能力**（`:22`）：
> 「The terminal UI had kept session identity visible during long conversations, removed duplicate model labels, attached elapsed timing and phase status to messages, showed workspace and branch context beside the prompt, and conservatively parsed complete XML wrappers for human-readable fallback output. **Those choices improved one terminal frontend but do not justify retaining it without a deployment.**」

以及一条自评技术债：「A future XML fallback must still use a real parser rather than regular expressions.」

### 3.2 第二条相关拒绝：把 ACP 从"第二个 UI"砍回自动化协议

`.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md`。Problem（`:11`）原文：
> 「The ACP bridge **had become a second interactive product UI.** It translated durable events into editor cards, terminal metadata, diffs, plans, titles, reasoning, commands, modes, model and permission pickers, session navigation, and human elicitation. **Those responsibilities duplicated the TUI and the Web client while coupling an automation transport to UI services, persistence queries, presentation policy, and editor-specific conventions.**」

Decision（`:23`）划定了什么被踢出线：「Raw chunks, todos, plans, titles, retry markers, terminal metadata, diffs, locations, and presentation projections **remain off the ACP wire.** ... session load/delete/fork, commands, modes, plan review, terminals, client filesystem operations, and human elicitation **remain unsupported.**」

Alternatives 里有一条罕见的「方案没错但归属错了」（`:43`）：
> 「**Keep the earlier editor bridge behind disciplined service boundaries.** Rejected **even though that bridge correctly used** interface services, tool-owned render intents, approval and user-questions answerers, harness-owned execution, and a stdout-pure composition. ... **Those boundaries were coherent but could not make editor cards, session navigation, configuration pickers, and human elicitation belong in an automation protocol.**」

【判断】把 §3.1 与 §3.2 并读，DSH 在 2026-07 到 08 之间做的是同一件事：**把"人机呈现"收敛到唯一一处（Web），其余通道只许传语义事实。**

### 3.3 历史备查：被删掉的那个 TUI 是什么

保留此节只为让上述决定可被还原，**它不描述当前版本**。全部来自作者自述（`.agents/notes/archived/**`），非代码。

- 渲染栈是第三方库 **`@earendil-works/pi-tui`**（即 pi 项目的 TUI 库），且被 pnpm patch 过。`2026-07-24-tui-shell-prompt-editor.md:16`：「The pinned `@earendil-works/pi-tui` package carries a pnpm patch that adds `frame: "none"` and fixed-width prompt prefixes to `EditorOptions`.」该 note 明确拒绝了「Vendor the complete pi-tui package」：「The project updates frequently... Owning the full source and synchronization process would add disproportionate maintenance.」
- 是全屏且硬要求 TTY。`2026-07-17-dedicated-full-screen-tui-front-door.md:18`：「**The plugin requires both stdin and stdout to be TTYs and fails instead of silently changing to line-oriented behavior.**」并拒绝了静默降级（`:44-47`）：「**Let the TUI plugin silently downgrade when either stream is not a TTY** — rejected because **a fallback hides deployment mistakes and changes interaction semantics.**」
- 调色板刻意主题无关。`2026-07-21-tui-banner-brand-gradient.md:12`：「the TUI palette is deliberately theme-agnostic. It uses **only standard 16-color ANSI (SGR) codes and attributes** so a user's terminal scheme remaps every color; **the `themeViolations()` snapshot gate rejects any RGB, extended-palette, or explicit-background cell.**」品牌渐变横幅是「the sole sanctioned exception」，由 snapshot 断言机械围栏。
- truecolor 从 `COLORTERM`（`truecolor` 或 `24bit`）探测，显式配置永远胜出，且只在 `apply()` 边界读 `process.env`（同文件 `:20`）。无 truecolor 时退回单色亮蓝。
- Windows 不降级：`2026-07-20-windows-tui-support.md:16`「**DeepSeek Harness adds no platform rejection or reduced Windows mode.**」
- **清退彻底性（一手核查）**：`pi-tui` 在当前工作树的全部命中都在 `.agents/notes/**` 的散文里；`package.json`、`pnpm-lock.yaml`、`patches/`、任何 `.ts` 中命中 **0**。`pnpm-workspace.yaml:86-89` 的 `patchedDependencies` 今天只剩三项。
- **【环境假设声明】**本轮禁用 git，**无法确认 pi-tui 当时被钉在哪个精确版本**；note 只说 "pinned"。

### 3.4 应用入口被 CI 门禁焊死

`docs/architecture.md:45` 原文：
> 「Vendored CLIs, build-only and test-only executables, direct in-process plugin mounting, and the private browser WebWorker preview are not Harness application launchers. `verify-application-entrypoints`〔落盘编辑：原文此处是指向 DSH 仓库 `scripts/verify-application-entrypoints.ts` 的相对链接，落盘后无法解析，已去链保留原词〕 keeps every package bin, executable source, and root demo in an explicit class and **rejects a Node application path that bypasses `dsh`.**」

`AGENTS.md`：「**Application launch.** Only `dsh` profiles launch supported Node apps; package bins, demos, and public SDK argv escapes are **forbidden**.」

【判断】这条门禁是 §3.1 那个决定能持续成立的机制保障：任何人想再加一个终端入口，会先撞上 CI。

### 3.5 i18n 与品牌（约束的是 Web/桌面界面，不是终端）

| 项 | 数字（一手计数） |
|---|---|
| `*.i18n.yaml` 双语台账 | **1,437** |
| `*.zh.md` 中文对照页 | **1,440** |

机制不是翻译记忆，是**双语一致性台账**。`README.i18n.yaml` 全文：
```
# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each
# side as of the last confirmed-consistent state. Both languages carry equal authority;
# after editing either side, bring the other along and re-record with:
#   pnpm run verify-translation-pairing --write README.md
README.md: 36adfe913902e75ce0673adc2cb5cb692151a291
README.zh.md: f6861b4c9490741b5e5f2d825a370766178dd9f6
```
注意「**Both languages carry equal authority**」——中英对等，不是英文为源。

UI 文案本地化由 **AST 检查**强制（`.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md`）。Decision：「**Locale dictionaries own all product-authored client UI wording.**」「Cordis-free primitives require complete localized copy props and own no language fallback」（漏了即类型错误）。`verify-client-ui-i18n` 用 TypeScript AST「rejects natural-language JSX text, copy-bearing attributes and component props, literal JSX branches, label/copy data, named copy helpers, string-returning display formatters, and destructuring defaults」。

Alternatives 中三条拒绝：
- 「**Rely on review and AGENTS.md alone**」——拒绝理由是规则已被绕过**几百次**
- 「**Keep primitive fallback copy for convenient direct use**」——「**a fallback is itself an implicit locale choice**」
- 「**Translate every string that reaches the DOM**」——会污染证据、标识符与命令文本

语言切换（`2026-07-30-client-locale-full-rollout.md`）：注册期文案走 label thunk（`SlotLabel = string | (() => string)`），拒绝「re-register on switch」，理由原文「amplifies into a storm; ledger version churn also busts every version-keyed projection cache」；也拒绝 `toLocaleString()`/`Intl` 做日期：「follows the browser/OS language, not the app locale, **guaranteeing mixed text after a switch**」。

初始语言（`2026-07-31-browser-derived-initial-locale.md`）：Problem 原文「The Settings Language row opened every first visit in Chinese ... **The fallback was doing two jobs at once**: the last resort for an unresolvable locale, and the answer for every user who had simply never chosen.」解法是浏览器语言 → `en` 兜底；且「**`window`, not `navigator`, is the browser test**」，因为 Node ≥21 有全局 `navigator`，否则会把服务器机器的 locale 漏进来。

**与渲染的第二个交汇点**：`packages/client/ui-primitives/src/markdown/cjkFriendlyStrong.ts` 是一个 **micromark 语法扩展**，让 `**粗体**` 在紧跟 CJK 文字（无空白边界）时也能正确闭合，因为 CommonMark 默认规则会误解析。**这是解析层的 CJK 修正，不是显示宽度。**

**品牌**：`BRAND_GUIDELINES.md` 只有 12 行，**全是商标使用政策，无任何配色、字形、排印或语气规范**。要点：可描述性使用「built on DeepSeek Harness」；推荐缩写 **DSH** 命名生态项目；「please avoid using the full 'DeepSeek Harness' trademark directly ... **'DeepSeek Harness' is a registered trademark of DeepSeek.**」中文版是忠实翻译，无额外内容。视觉规范实际在代码里：`packages/client/ui-theme/` 拥有 `--dsw-*` token，`docs/web-styling.md:9`「The token sheets are the sole color authority」。

一条独有观察：`packages/client/ui-brand-official/README.md` 写明**默认/开源构建的标识是一条"鱼"**，官方标识只在 `official` 构建档位出现：「Other build profiles keep the shell's fish mark and local-build label, while the conversation hero always uses the animated fish.」且「**no brand configuration surface here**」——换品牌靠写一个占同样 slot 的包。

### 3.6 对别家终端 agent 的兼容姿态（本对象独有）

**结论：DSH 自己不做终端界面，却在四个层面主动吃下别家终端 agent 的生态资产——配置格式、hooks、指令文件、乃至把别家 agent 整个当子进程跑。而且每一处的缺口都被逐条列到了字段级。**

#### (a) 把别家 agent 当 subagent 后端跑

`packages/subagent/` 下的后端清单：`subagent-acp`、`subagent-claude-code`、`subagent-codex`、`subagent-dsh-sdk`、`subagent-fork-in-process`、`subagent-spawn-in-process`、`subagent-in-process-driver`。

**两个鲤外 agent 被钉了精确版本并作为运行时依赖**（一手，`package.json`）：

| 包 | 依赖与版本 |
|---|---|
| `packages/subagent/subagent-claude-code/package.json:44` | `"@anthropic-ai/claude-agent-sdk": "0.3.263"` |
| `packages/subagent/subagent-codex/package.json:47` | `"@openai/codex": "0.153.4"` |

`subagent-claude-code` 的自述（README Summary 原文）：
> 「Install this Profile Bundle when a delegated task should run as **a fresh, unattended Claude Code session in the parent workspace.** Each run accepts one self-contained text task and returns the final answer or a safe failure diagnostic; reasoning, tool traffic, stderr, usage, and workspace diffs stay out of the parent Session. **Native Claude settings and authentication remain authoritative**, while Profile configuration selects the model, environment, and `permissionMode`. **The platform-pinned runtime starts on demand and never falls back to the host `claude` executable.** Choose it when isolation and genuine Claude Code behavior matter more than continuation or prompts.」

`subagent-codex`：
> 「...delegated work should run in a **genuine, unattended Codex session** in the parent Session's workspace... **Native Codex configuration and authentication remain authoritative**, while `permissionMode` selects the non-interactive approval and sandbox behavior. The Bundle supplies a compatible native Codex payload, but it exposes no model capability until a delegation tool is configured.」

`THIRD_PARTY_NOTICES.md` 为此专设一节 "Official Claude Code platform payloads"，原文：
> 「The project owner authorizes distribution of every version of the official `@anthropic-ai/claude-agent-sdk` package and the official Claude Code CLI/platform payloads that each version declares through `optionalDependencies`. **This identity-scoped authorization does not classify their declared terms as permissive** and does not cover any unrelated runtime package」

并列出该 SDK 0.3.263 声明的可选平台包，每个「carries the official Claude Code **2.1.263** executable」。

【判断】所以 DSH 的分发物里可以带上别家 agent 的可执行载荷，且为此单独做了授权声明。这是一种相当激进的兼容姿态。

#### (b) 跑别家的 hooks 配置

两个桥接包，自述（README `description` 原文）：
- `@deepseek-ai/dsh-hooks-claude-code`：「Run your existing Claude Code `hooks.json` or settings hook config during agent runs — block prompts and tools, attach context, or force continuation」
- `@deepseek-ai/dsh-hooks-codex`：「Run your existing Codex `hooks.json` hook config during agent runs」

两者都出现在 `apps/cli/package.json` 的**生产依赖**里。

**两面都要有证据——这两个包的 Known Limitations 是本轮读到的最坦诚的一份缺口清单**，直接引用要点：

`hooks-claude-code`：
> 「**Unsupported hook events (23 of Claude Code's current 30)** — `Setup`, `InstructionsLoaded`, `UserPromptExpansion`, `MessageDisplay`, `PermissionRequest`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Notification`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation`, and `ElicitationResult`.」
> 「**`PreToolUse` is partial** — `deny` and `ask` decisions work; `allow` does not pre-approve, `defer` is unsupported, `additionalContext` is ignored, and `updatedInput` is logged + warned but not honored」
> 「`transcript_path` is never populated: it is always the empty string, because **the persistence seam exposes no artifact paths and the default Zstandard-compressed session log is not readable by hook scripts.**」
> 「Matching handlers run **serially and are not deduplicated**, whereas Claude Code runs them in parallel and deduplicates identical handlers. One process-level `configPath` is parsed once at load; **Claude Code's layered project, user, plugin, and policy discovery and live reload are not implemented.**」

`hooks-codex`：
> 「**Unsupported hook events (5 of Codex's current 10)** — `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart`, and `SubagentStop`. **Config for these events is silently dropped during parsing.**」
> 「**Every tool is represented as `tool_input: { command }`, so non-shell tool arguments are not faithfully exposed to the hook.**」
> 「every mapped event reports the statically configured `model` and `permission_mode: "default"` **instead of current Codex runtime values**」

两份清单都注明了比对基线：Claude Code 的「official hook-event reference」与 Codex 的「official hook reference」。

【判断】这套兼容是**真实但明确有损**的：事件覆盖率分别约 7/30 与 5/10，且并发语义、分层配置发现、热重载都没实现。DSH 自己把这话说在前面——两份 README 都写着「**Skip it for behavior with no \<reference tool\> equivalent: a native plugin has the full harness API, while this bridge runs only the reference tool's command-hook subset.**」

#### (c) 吃别家的指令文件与技能格式

- `@deepseek-ai/dsh-agent-instructions`（README Summary 原文）：「gives agents workspace guidance from user-global and project-level **`AGENTS.md`-compatible files**」。`apps/cli/reference/README.md:93` 补充：base 模式「load applicable **`AGENTS.md` or `CLAUDE.md`** instructions with a **65,536-byte** render budget」。
- `packages/skill/`：技能目录家族，「Different sources produce the same model-visible format」，由 `skill-filesystem` 做「project, custom, or user-directory discovery」。
- `apps/cli/package.json` 还直接依赖 `@deepseek-ai/dsh-tmux-context`——`packages/context/tmux-context/README.md`：「lets the model identify the tmux session, window, pane, and pane-tree layout containing its agent process... **This package is opt-in and is not included in the shipped Web or headless profiles.**」

【判断】(c) 这一层说明：DSH 虽然把**人**移出了终端，却仍然假设**开发者的工作环境是终端**（tmux、AGENTS.md/CLAUDE.md、`.claude/hooks.json`）。

#### (d) 反向：不把执行权交给编辑器

`.agents/notes/archived/feature/2026-06-18-acp-terminal-and-tool-rendering.md:18` 原文：
> 「The ACP spec has a *client-side* terminal sub-protocol — the agent calls the client's `terminal/create` ... and the **editor** executes the process ... **That model is wrong for us**: our harness executes bash itself through `dsh-bash` (sandboxed env-scrub, background-task ownership, per-session cwd). **Routing execution to the editor would bypass all of that and fork execution into two backends.**」

### 3.7 其他明文拒绝（原文摘录）

`AGENTS.md`：
- 「**No hardcoded tunables in plugins**: ... a `DEFAULT_*` constant or test hook is not configurability.」
- 「**Misconfiguration fails loud** at load when self-contained... **never silently skip a missing referent.**」
- 「**Trust TypeScript at typed same-process boundaries.** Do not add runtime validation, fallback behavior, or hostile-input tests solely for values the static interface requires.」
- 「**An empty `catch` names what it swallows** and why nothing else can reach it.」
- 「Archived notes are frozen: **never edit or treat them as current authority.**」
- 「**Do not use metaphors**」（注释风格）

`CONTRIBUTING.md`（全文 23 行）：
- 「**We are sorry that we cannot accept external pull requests at the moment.**」
- 「We do not believe that packages in the official repository are inherently more important than packages created by the community... not a mandate from us.」

`SAFETY.md`：
- 「**It has not undergone a security audit and must not be treated as secure or production-ready.**」
- 「Sandboxing, approval prompts, and permission controls can reduce risk, **but they do not guarantee isolation or prevent damage.**」

`packages/client/AGENTS.md`：
- 「**A feature plugin MUST NOT runtime-import or re-export another feature plugin's values**」
- 「**module-level handles are forbidden — de-facto singletons**」
- 「**A UI plugin exports no values beyond what cordis loading needs** ... Adding any new value export requires user sign-off, not a matching consumer.」

### 3.8 决策记录制度

`.agents/notes/` 四态，定义出自 `.agents/notes/README.md`：`proposed/`（已评审未实现）、`implemented/`（已发货且与实际发货保持一致）、`rejected/`（「Keep it only while its rationale prevents a tempting, meaningful mistake; otherwise delete the complete triplet.」状态行是 `Status: rejected — <why, in one line>`，因为「**a rejected Agent Note's verdict is the fact readers come for**」）、`archived/`（**永久冻结**，不得编辑、翻译、改格式、移动或删除，也不得当作当前行为的依据）。

`rejected/` 下共 14 条。最能说明取证习惯的一条是 `simplification/2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md`，拒绝理由是**实现之后被证伪**：「implementation (PR #679) falsified the parity premise: vitest's fake clock does not intercept `node:timers/promises`, so the swap costs deterministic fast tests for ~10 deleted lines」。

---

## 4. 实施取舍与代价

**结论：「界面放浏览器」这一选择把成本推到了四个地方——远程/无图形环境要自己转发端口、必须起本地 server 并管好 token、桌面版为此多背一个独立 host 进程与 120–165 MB 安装增量、以及生态里立刻长出至少四个第三方 TUI 来补这个洞。**

### 4.1 必须起一个本地 server 和一个端口

`packages/bundle/web-app/README.md` 原文：
> 「After startup you see a `dsh web:` line **whose root URL carries a fresh process token.** Unless `--no-open` or an SSH session suppresses it, the default browser opens that URL, **receives a signed cookie**, and redirects to the clean root page.」
> 「By default the GUI accepts connections from this machine only. ... **Host and Origin checks control reachability, while the token exchange authenticates every Host API method and WebSocket stream.**」
> 「The LAN addresses are sampled once at startup, so **a network change later is not picked up — restart the GUI to re-advertise.**」

默认 `http://127.0.0.1:3080`（`README.md:27`）。**明确不支持绑定全部接口**（`apps/cli/reference/README.md:89`）：「The CLI **intentionally does not support `--host 0.0.0.0`** and exits with a usage error.」

配置面只有四项（web-app README 的表）：`openBrowser`、`printUrl`、`surfaceContext`、`trustedHosts`。

【判断】代价链条是：终端里的一条命令 → 一个长期驻留的 HTTP+WebSocket server → 一个端口 → 一套 token/cookie 认证 → 一次浏览器移交。这些在一个纯终端 UI 里全都不存在。

### 4.2 SSH / 远程 / 无图形环境

`apps/cli/reference/README.md:89` 原文：
> 「A non-empty inherited `SSH_CONNECTION` or `SSH_TTY` **suppresses the browser handoff** because the SSH client or editor owns the local forwarded address; **the host URL is still printed.**」

web-app README：
> 「When you launch `dsh --profile web` over SSH, the URL line still prints but the browser is not opened for you: the SSH client or editor owns the local forwarding address. **Open the forwarded URL on your machine yourself**; the printed URL names the remote host's loopback endpoint.」

【事实】DSH 对 SSH 的全部处理是「不替你开浏览器，把 URL 打出来」。
【判断】端口转发这一步被留给用户或编辑器。**仓库里没有任何自动转发、反向隧道或终端降级方案**——这是「读遍了没找到」级结论，检索位置：`apps/cli/**`、`packages/bundle/web-app/**`、`packages/host/**`、`docs/user/guide/**`。
【推断】在没有浏览器也无法转发端口的环境（纯 tty 的远程机、受限容器）里，可用的只剩 `headless` 一次性模式与两条 stdio 协议。**本报告未实测该场景。**

### 4.3 进程关系与 `desktop-host` 为什么单独存在

**CLI ↔ 浏览器**：`dsh web` 进程即 server，浏览器是独立进程。关机语义见 §2.4（5 秒优雅退出，SIGINT→130，SIGTERM→0）。

**Electron 侧**（`docs/architecture.md:51-53` 原文）：
> 「Electron starts the **private Desktop Host package under its bundled upstream Node.js process**; that package loads the bundled dsh backend and matching client graph together with enabled profile plugins. Unary RPC, Remote streams, and version-matched client assets cross **versioned framed byte pipes** with Node IPC reserved for lifecycle control, then reach the renderer through the secure `dsh-app://` protocol; **the desktop composition opens no Web server or loopback port.**」

`apps/desktop-host/package.json` 自述：「**Private upstream-Node host process** for the Electron desktop application」。

**为什么不用 Electron 自带的 Node**（`.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.md` 原文）：
> 「This saves package size but **couples dsh to Electron's Node patches, fuses, native ABI, TLS behavior, and process lifecycle. A bundled upstream Node.js keeps dsh on its supported runtime.**」

也拒绝了 JSON IPC：「JSON IPC keeps one message mechanism but expands every request and response body ... **double-encodes image bytes already represented as Base64**」。

【判断】`desktop-host` 独立存在的代价被作者自己量化了：
> 「The bundled upstream Node.js and pnpm are expected to add about **35–50 MB compressed and 120–165 MB installed** before the dsh production tree.」（同 note `:102`）

另一条耦合代价：「**Updating dsh therefore requires a new Electron release even when shell code is unchanged.**」目标平台只有 macOS arm64/x64 与 Windows x64——「**Linux has no supported release target.**」

### 4.4 首次启动路径变长了多少

【事实】可确证的路径事实（`apps/cli/reference/README.md:12` 与 web-app README）：
- `web`/`headless`/`sdk`/`sdk-minimal`/`acp` 五个 profile **首次使用时从出厂模板自动初始化**
- `web` profile 是 `patchReload: live`，其余四个是 `startup`（`docs/architecture.md:29`：「replacing a one-shot or stdio application's dependencies after it owns work would invalidate that lifecycle」）
- `web` 需要构建好的前端产物，否则「if the frontend is not built, startup stops with a build hint (`pnpm run build` in a checkout)」
- 浏览器只在「the complete Loader tree settles」之后才被打开（`apps/cli/reference/README.md:89`）

【推断】因此 `dsh web` 的首启路径是：profile 初始化 → 环境层加载 → bundle 补丁组合 → 整棵插件树 boot → HTTP server 起 → 打开浏览器 → 浏览器再拉一遍前端模块图并等 `renderSlot('root')`。
**【明确未查证】DSH 没有公布任何启动耗时数字，本轮也未实测（副本未构建）。上述只是路径描述，不是耗时结论。**§6.7 列出了检索位置。

一条可引用的**第三方用户观感**（二手，单一来源，经 WebFetch 转述非逐字）：`deepakness.com/blog/deepseek-harness/` 称「Starting it is not instant. I have to launch the server from a terminal and then open the localhost URL in the browser.」以及「It does not ping you when a task finishes. No sound, no notification – the harness just sits quietly in its browser tab」。

### 4.5 生态代价：社区自己把 TUI 补了回来

**官方 Discussion #3715**（第三方作者 `nexlineai`，2026-08-20，经 WebFetch 抓取，引文可核实）：
> 「The official `dsh` ships a web UI and a one-shot headless mode, **but no interactive terminal agent.**」

公开可见的第三方 TUI 至少四个：`nexlineai/dsh-tui`、`gxinxing/deepseek-harness-tui`、`andrecolin/dsh-tui`、`themcswift/deepseek-tui`。**它们各自的渲染栈我只拿到搜索结果标题（其一自述 "built with Ink, React for terminals"），没有一手原文，标为未确证。**

同一 Discussion 里作者记录的两个生态坑（原文）：
> 「three packages it imports at runtime...were declared only as `devDependencies`, so a clean install threw `ERR_MODULE_NOT_FOUND`」
> 「several `@deepseek-ai/dsh-*` packages still point their npm `latest` tag at an older `0.0.1-rc.x` line」

【判断】这些插件能存在，反过来证明 §1.2 的 profile + bundle 扩展机制确实足以挂载一个完整的新前端：`dsh plugin --profile tui add <package>` 之后 `dsh --profile tui`。`apps/cli/README.md:28` 与 `args.ts` 的帮助示例至今以 `tui` profile 举例，并注明「example, **assuming the tui profile is installed**」。

### 4.6 分发形态与体积

| 形态 | 体积 / 代价 | 来源 |
|---|---|---|
| npm `@deepseek-ai/dsh` | **unpackedSize 48,910 字节，fileCount 10**，78 个依赖 | npm registry，2026-09-21 抓取 |
| 单文件可执行（`@yao-pkg/pkg --sea`） | 「artifacts on the order of **174MB** with source entering the blob as-is」 | `2026-07-10-single-file-executable-sdk-runtime-distribution.md:89` |
| Electron 桌面 | 「about **35–50 MB compressed and 120–165 MB installed**」增量 | `2026-08-25-...md:102` |
| Python wheel | 5 个平台 tag，**无 Windows arm64** | `python/sdk-runtime` |

【判断】npm 包本身只有 48KB，说明真实体积全在 78 个依赖里。**本报告未测量安装后总体积**（副本无 node_modules），这是未查证项。

单文件可执行的取舍，作者自述 **Paid** 侧全文（`:89`）：
> 「artifacts on the order of 174MB with source entering the blob as-is (**no bytecode obfuscation**; a closed-source distribution requirement needs a separate evaluation); pkg's VFS/module-hook layer remains community-maintained ...; `--sea` is one invocation per target (matching CI's one leg per platform; **local multi-platform builds are serial**).」

被拒绝的打包路线（同文件）：
- 「**Bare Node native SEA.** The injected main script must be a single CJS file, and the blob carries no filesystem and no module resolution」
- 「**pkg standard mode.** **Killed by the PoC, not a trade-off**: it turns ESM into CJS + V8 bytecode via esbuild, the runtime vm compilation wires up no dynamic-import callback, **every `import()` throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`** ... it also depends on community-patched Node binaries (no macos-arm64 prebuilt; compiling from source on the spot takes about **10 minutes**). **Zero viability for this repo's architecture.**」

### 4.7 patches/：三条"上游不够用"的实证

**1. `patches/node-pty@1.2.0-beta.15.patch`**（改 `lib/unixTerminal.js`）
上游按 `native.dir + '/spawn-helper'` 找 helper，并对 `app.asar` / `node_modules.asar` 做字符串替换（Electron ASAR 假设）。DSH 改为先读环境变量 `DSH_NODE_PTY_SPAWN_HELPER`，其次找 `process.execPath + '-spawn-helper'` 同级文件，最后才回退上游逻辑。
动机（`.agents/notes/archived/feature/2026-07-29-persistent-bash-str-replace-editor.md:20`）：「Because `node-pty` executes a native `spawn-helper` on macOS, each packaged macOS runtime executable ships with a `-spawn-helper` sibling; Linux uses `forkpty` directly.」
【判断】根因是上游假设 addon 与 helper 同处正常 `node_modules` 树或 ASAR，而 pkg `--sea` 单文件把它们摆成可执行文件的同级兄弟，两个假设都不成立。

**2. `patches/@yao-pkg__pkg@6.21.0.patch`**——**只删一行**，`shared.patchChildProcess(entrypoint2);`（patch 全文已核对）。
**这是本轮最能说明 agent harness 特殊性的一条 patch。**作者自述（`2026-07-10-...md`）：
> 「Unpatched, pkg rewrites spawned commands named `node` — including the string after a `-c`/`/c` flag, **exactly the Bash tool's `bash -c` form** — to the executable itself and stamps `PKG_EXECPATH` into every child environment, so **a model-issued `node --version` silently boots the dsh CLI** ... With the call removed, children resolve `node` through PATH like any other process (**a machine without Node reports command-not-found honestly**), no `PKG_EXECPATH` reaches children」
【判断】pkg 这个"自我冒充 node"特性对普通 CLI 是功能，对"里面住着一个会跑 shell 命令的模型"的运行时是纯粹危害。note 提到有一个 "spawn-node scenario" 回归测试专门钉住它，防 pkg 升级把 hook 加回来。

**3. `patches/@electron__osx-sign@1.3.3.patch`**——两处 `fs.stat` → `fs.lstat`。
动机（`2026-08-25-...md`）：「uses `lstat` in both published module builds, so Framework file and directory aliases do not trigger duplicate signing. **The patch remains necessary until the selected upstream release skips those aliases.**」

### 4.8 NIH 审计：一次全部拒绝的依赖替换调查

`.agents/notes/rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md`，状态行：「rejected — **every swap below fails the net-simplification bar on evidence; recorded so the survey is not re-run from scratch**」。约 30 个手写实现对候选库逐一比对，**全部维持手写**。方法论：「a future proposal for any item must beat its recorded reason, not just re-cite the policy.」

对照之下，同一仓库在 ANSI 解析上做了**相反**的选择并写明理由（`2026-07-28-web-terminal-card.md:45`）：
> 「**Hand-roll the SGR parser.** Rejected: an SGR parser is exactly the surface [prefer maintained dependencies over hand-rolling] says not to own — its edge cases (256-palette and truecolor forms, `reverse`, multi-parameter runs, unterminated sequences) **each fail on output nobody produces in a test, so a hand-rolled version stays subtly wrong for a long time.**」

【判断】DSH 的"复用 vs 自写"不是固定偏好，而是按「边缘情况会不会在测试里暴露」来判的。

---

## 5. 坑：官方与社区

**结论：DSH 把 bug 收口到 Discussions，公开可核实的缺陷记录很少；仓库内部的 postmortem 与 note 反而是更可靠的坑来源。最能说明 CLI 层问题的一条，是它那行 `dsh web:` 启动输出事实上成了第三方的接口契约，改一次就把下游打断了。**

### 5.1 检索了哪些位置

| 位置 | 结果 |
|---|---|
| `github.com/deepseek-ai/deepseek-harness` Discussions | 可达；命中 #982（install failed）、#3715（第三方 TUI 公告） |
| 该仓库 Issues | **未能确认是否启用**。`README.md:45` 指向 Discussions 而非 Issues：「Submit feedback or bug reports through [GitHub Discussions]」。本报告**没有**任何一条带 `deepseek-harness#<n>` 编号的官方缺陷单 |
| 第三方项目 issue tracker | 命中 1 条可精确引用：`CherryHQ/cherry-studio#20119` |
| 个人博客 | 命中 1 条：`deepakness.com/blog/deepseek-harness/` |
| Medium | 命中 1 条（70x 慢速，见 5.4） |
| SEO 型站点（`dsh-plugin.org` / `dshdocs.com` / `dshfind.com` / `deepseekdsh.com` / `openclawlaunch.com` 等） | 命中多条，**内容无法溯源到一手**，只在明确标注"不可核实"时引用 |
| 仓库内 `docs/postmortem/` | 4 篇，一手 |
| 仓库内 `.agents/notes/**/bug-fix/` | 数十篇，一手 |

**明确声明**：**我没有在公开渠道找到任何带编号且仍 open 的 DSH 官方缺陷单。**这是"读遍了没找到"级结论，不是"验证过不存在"——很可能只是因为该仓库不用 Issues 收 bug。

### 5.2 仍有影响：CLI 的一行 stdout 成了第三方接口契约（可精确引用）

`https://github.com/CherryHQ/cherry-studio/issues/20119`，2026-09-06。症状：Cherry Studio 2.0.9 启动 dsh 0.1.2-rc.1 报 "startup timed out"，固定到 0.1.0-rc.7 正常。报告者给出的两条根因：
1. 启动 URL 从 `dsh web: http://127.0.0.1:<port>` 变成 `dsh web: http://127.0.0.1:<port>/?token=...`，正则匹配失败
2. dsh 0.1.2-rc.1 加了浏览器会话 cookie 认证，未认证的 `GET /` 返回 401，打破了 Cherry Studio 就绪检查依赖的"裸 URL + 200"契约

**一手佐证**：本 commit 的 `packages/bundle/web-app/README.md` 确认了这两个行为（见 §4.1 引文）。

**状态**：该 issue 在 Cherry Studio 侧 **closed as duplicate**；DSH 侧无对应记录。
【判断】这是典型的"CLI 的 stdout 一行文本事实上成为接口"的事故，且 DSH 侧并未把它当作自己的兼容承诺。

### 5.3 仓库内 postmortem（一手，已修复）

`docs/postmortem/README.md:5` 定义了这套制度：「a bug reached a place it shouldn't have (a real user, a merged PR, a release), and **the interesting part is *why our process let it through***, not just the one-line fix.」四篇：

| # | 标题 | 与 CLI 层的关系 |
|---|---|---|
| 0001 | ACP server crashed on connect: `export default` dropped the plugin's `inject` | ACP stdio 入口崩溃 |
| 0002 | Filesystem snapshot tools were permanently disabled by a literal `!!js` object | 配置层 |
| 0003 | Web agent validated a replacement server instead of the GUI hosting its session | Web 入口 |
| 0004 | Landlock partial-enforcement notice misclassified child failures | 原生沙箱 |

### 5.4 社区报告：持久 bash 工具约 3.5 秒延迟——二手报告，但源码里能看到结构性成因

**二手来源**：Medium 文章（`ai-engineering-trend.medium.com/one-tiny-typo-in-deepseek-harness-slowed-command-execution-down-by-70x-...`）与若干 SEO 站转述，称 `sdk-minimal` 档位下 `pwd`/`ls` 要 3.5 秒以上、首条命令超 7 秒，归因于 `PS1` 哨兵不匹配导致回退到静默超时，修复后 3600ms → 158ms。**这些转述无法溯源到一手 PR 或 commit，本报告不把"是一个 typo"登记为事实。**

**一手核对（在本 commit 源码上）**：
- `packages/terminal/terminal-bash/src/sanitize.ts:9`：`export const CONTROLLED_PROMPT = 'dsh> '`
- `packages/terminal/terminal-bash/src/index.ts:82-86`：子进程环境设 `PS1: CONTROLLED_PROMPT`，并用 `PROMPT_COMMAND` 在每次渲染提示符前重断言 `PS1`；注释原文「Re-asserting PS1 after the marker keeps prompt readiness working when a command overwrote the shell variable」
- `packages/shell/tool-bash-persistent/src/index.ts:268-269` 注释原文：「Echo suppression only: **the prompt stays the backend's own, so the backend's prompt-based readiness detection keeps working.**」
- **默认常量**（`packages/terminal/terminal-bash/src/config.ts:94-99`）：`pollIntervalMs: 50`、`exactProbeAfterMs: 150`、**`idleSilenceMs: 3_000`**、**`handoffGraceMs: 500`**、`timeoutMs: 30_000`

【事实】`idleSilenceMs (3000) + handoffGraceMs (500) = 3500ms`，与社区报告的 3.5 秒完全吻合。
【关键佐证，一手】`packages/terminal/terminal-bash/README.md` 的 Known Limitations 自述：
> 「**Readiness is heuristic without an exact tier** — exact stdin-wait detection depends on the mounted subprocess provider; **providers that cannot prove it (macOS, Windows) settle on prompt-marker and silence/timeout readiness.**」

【推断】因此在 macOS 与 Windows 上，一旦提示符标记路径失效，回退到 3.5 秒静默判定是设计内行为，不只由某处笔误造成。
**【明确未判定】本 commit 的代码已含上述 `PROMPT_COMMAND` 重断言与"prompt 归后端所有"的注释，该具体 bug 在本 commit 是否仍复现，我无法判定**——需要可运行环境，本轮没有。

### 5.5 已修复：终端被 TUI 弄脏后没恢复（历史，画面感最强的一条）

`.agents/notes/implemented/bug-fix/2026-07-31-fail-loud-releases-the-terminal.md:18-20` 原文：
> 「`ui-tui` activates and calls pi-tui's `ProcessTerminal.start()`, which puts stdin in raw mode, enables bracketed paste, and writes the Kitty keyboard-protocol probe — a sequence ending in a Device Attributes query (`ESC [ c`). ... **Nothing disposed the tree, so `ProcessTerminal.stop()` never ran**: raw mode, bracketed paste, and the keyboard protocol stayed set on the shell that outlived the process. **The terminal's answer to the Device Attributes query (`1;2;4c`) arrived after exit and was read by the shell as typed input.**」

note 保留的失败现场原文：
```
dsh: fatal load failure: ValidationError: invalid config:
  - $.providers expected object but got [object Object] (at providers)
$ 1;2;4cecho hello
zsh: command not found: 4cecho
```
**状态：已修复**（断言捕获字节须含 `ESC[?2004l`）。【判断】随 TUI 整包删除，这条修复所保护的路径今天已无出厂消费者；但 `packages/boot/app-boot/src/index.ts` 里的 `installFailLoud`/`release` 机制作为通用设施留了下来（`dsh-app-boot` README 也把它列为特性：「let a terminal-owning app restore its terminal before a fatal exit」）。

### 5.6 已修复：ANSI 渲染的 O(n²) 内存事故（一手，带数字）

`packages/client/ui-primitives/src/ansi.ts:138-144` 的注释即事故记录，原文：
> 「Held as fields rather than as the raw sequence history because a terminal tracks CURRENT state, not a transcript: accumulating sequences made each state boundary re-emit the whole chain, so output that switches color without a full reset emitted **O(n^2) characters (3200 such cells produced 25 MB and eventually a `RangeError`)**.」

`2026-07-28-web-terminal-card.md:24` 补充：「**well under bash's own output cap**」——在工具自己的输出上限之内就已经炸了。**状态：已修复**（改为按 cell 存归一化 SGR 记录）。

### 5.7 作者自认、未解决的限制（一手）

| 位置 | 原文 | 归属 |
|---|---|---|
| `2026-07-28-web-terminal-card.md:37` | 「**tool rows stopped being details-panel click targets and nothing replaced the gesture, so the panel is currently unreachable in the assembled application.** ... until it lands, "the panel stays the place for the full output" is not true」 | **Web 侧，按该 note 归档时的说法仍开着** |
| `packages/terminal/terminal-bash/README.md` | 「**Sessions do not survive process exit** — a harness restart destroys every session.」 | 当前限制 |
| `packages/terminal/terminal-bash/README.md` | 「**Line-oriented output only** ... full-screen alternate-buffer interaction is unsupported.」 | 当前限制（有意） |
| `packages/terminal/terminal-bash/README.md` | 「**pwsh bootstrap in a constrained sandbox** — the prompt function and UTF-8 pin write through `[Console]::`, which the Windows ACL sandbox's read-only mode may deny.」 | 当前限制 |
| `hooks-claude-code` / `hooks-codex` README | 见 §3.6(b) 的整份缺口清单 | 当前限制，自述为「current package constraints, not a task backlog」 |

### 5.8 未能定级的公开报告

以下条目在搜索结果中反复出现，但**我只拿到 SEO 站的转述，没有一手 issue、commit 或日志**，因此**只记为待验证命题，不登记为事实**：
- Web 界面约 50 分钟后 OOM（`FATAL ERROR: Ineffective mark-compacts near heap limit`），归因"cold-history full materialization stacked on four unbounded accumulators"
- 打开单个大的旧会话会冻结整个服务（连 `GET /` 都超时）
- heapUsed 约 1.95 GB、rss 以约 2 MB/s 攀升

【判断】这三条若为真，都落在 §6.2 `long-session-browser` 基准**不**守护的范围内——该基准 README 明写「Heap after forced GC and DOM counts are **diagnostics, not leak budgets**」。**这只是两个事实的并置，不构成对上述报告的确认。**

---

## 6. 性能指标

**结论：DSH 不公布任何面向用户的性能数字——`BENCHMARK.md` 只有 3 行且不含数字，README 里零性能声明。仓库内确有一整套带精确数字的基准，但那是 CI 回归门禁的预算，校准在一台 Apple M4 Pro 上，作者自己就不把它当性能承诺。CLI 本身没有任何启动耗时数字。**

### 6.1 官方公开数字：没有

- `BENCHMARK.md` 全文 3 行，只说「Follow [Get started with the Python SDK] to install the SDK and run the `jsonrpc-agent` minimal variant. Use separate workspaces and session IDs for independent benchmark tasks.」**零数字。**
- 根 `README.md`：`fast|performance|benchmark|ms|latency|startup` 全部零命中。

检索位置已列明：`BENCHMARK.md`、`README.md`、`README.zh.md`、`docs/**`、npm 包元数据。

### 6.2 仓库内的 CI 回归预算（一手，有数字，测法必须一并读）

`benchmarks/AGENTS.md:3` 定义：「This tree owns **required, repository-level performance gates** whose measured user path crosses package ownership」。输入必须合成：「**Never use recorded Sessions, user material, ambient repositories, or network services**」。预算不可被环境覆盖：「environment variables must not override performance budgets」。

**校准机制**（`benchmarks/support/calibration.ts:1-15`）：参考机 **Apple M4 Pro / Node 24.19**；`CI_TIME_SCALE = 2`（「Measured wall-time ratio between the x64 CI runner and the arm64 reference machine」）；`PERFORMANCE_BUDGET_HEADROOM = 1.25`；`ciTimeBudget(expectedMs) = ceil(expectedMs × 2 × 1.25)`。

| 套件 | 被测对象与合成工作量 | 参考机期望 | CI 预算 | 实测中位数 |
|---|---|---|---|---|
| `session-open` | 200 轮 ×(500 文本+125 reasoning) delta = **127,400 个 released-v0 事件**的冷开/读/恢复/投影/首屏历史/agent 恢复 | migrationOpen 220ms、read 8ms、sessionRestore 24ms、projection 14ms、firstOpenFirstHistory 220ms、reopenFirstHistory 48ms、reopenAgentResume 40ms | reopen-open **63ms**；migration-open **550ms**；first-open agent-resume **562ms**；agent-resume 保留堆 `ceil(26.1×1.25)` MB | reopen 48.6ms；agent-resume 455.4ms |
| `agent-continuation` | 长历史请求、冷工具密集续跑、fork 子发现；SDK 变体「100 turns and 800 real file reads through the shipped sdk-minimal profile」 | profile-continuation 1,700ms | request-history 750ms（另有 reviewed 绝对预算 **297ms**）；tool-continuation 1,125ms；catalog 1,125ms；保留堆参考 23MB | 582.304 / 898.252 / 858.364 ms |
| `conversation-fold` | Client 冷折叠 200 条回复；大工作量含「**500,000 streamed deltas compacted into 1,600 stream records**」 | 16ms | **40ms**；delta 数增长 20× 时缩放上限 3.125（实测「about 2.5×；replaying every delta measures about 11×」） | — |
| `active-stream-reconnect` | 重连时重建含 **100,000 delta** 未完成 reasoning 前缀的活跃流 | 50ms | **63ms** | 46.07ms |
| `long-session-browser` | 真 Chromium (Playwright) 打开 **240 轮**会话、翻历史、访问 Trajectory、在「120 text deltas at 16 ms replay pacing」的流式回复中打字 | open 900ms / 最慢翻页 700ms / 首次 Trajectory 500ms | **1125 / 875 / 625 ms** | 翻页 [843.94, 672.83, 684.46]ms；Trajectory [605.79, 367.75, 485.93]ms |

**运行条件**（`vitest.bench.config.ts`）：`fileParallelism: false, maxWorkers: 1`——「Files run one at a time so a measurement never shares the CPU with another benchmark」；`testTimeout: 600_000`。

**不在 CI 里的两条道**：`vitest.web.perf.config.ts`（「Manual high-cardinality diagnostics stay outside every default Vitest inventory and therefore outside CI's executed test lanes」）与 `vitest.web-stress.config.ts`（「Opt-in browser performance lane; no default Vitest config includes `*.stress.ts`」）。

**他们自己的测量方法论**（`.agents/skills/dsh-speed-up-perf/SKILL.md`，自述是「guidance, not a quota or a script」）：
> 「Keep backend and browser end-to-end measurements separate: **a fast history iterator or Client fold does not prove fast transport, paint, scrolling, or input response.**」
> 「**Exclude model/network latency when measuring local overhead, and state that exclusion rather than calling the result complete product latency.**」
> 「**Measure built JavaScript under plain Node for CPU workers; source-loader overhead and module resolution are not the shipped path.**」
> 「**Report all samples and the aggregate that decides the result...** Budgets are source constants, not environment overrides.」
> 「A required browser performance case needs an explicit lane decision and repeated measurements on its actual CI browser/runner before adopting timing budgets; **the Node machine multiplier alone is not browser calibration.**」

【判断】这些数字**不能被引用为"DSH 有多快"**——它们是在合成输入、单 worker、指定参考机加 2×1.25 缩放下的回归阈值。作者就是这么定义的。

### 6.3 浏览器侧的渲染节流（一手，代码）

`packages/client/ui-conversation/src/client/conversation/assembly.ts:130`：高频流式更新跨 **3 个 paint 机会**才发布一次。**代码里没有写目标帧率，只有"3 帧"这一事实。**

### 6.4 历史附注：被删 TUI 的渲染数字

保留此节因为它是本轮**唯一真正的终端渲染性能数字**，但它描述的是已不存在的代码。`.agents/notes/archived/bug-fix/2026-08-03-tui-long-session-render-costs.md`：

- Problem（`:10`）：「On a long resumed session (**196k events, 2.2k steps, 1.8k tool cards**) the TUI took **~12 s to render the transcript and ~800 ms to echo one keystroke.** Profiling attributed both to the render path, not to session load (zstd + parse + surface seed is ~1.7 s).」
- 成因之一（`:12`）：「Every step's timing footer called `stepTimingAt`, which replayed the whole event log from index 0 per footer — **O(steps × events) on the initial render, ~6 s of CPU.**」
- 成因之二（`:13`）：「**pi-tui re-renders every component each frame** and relies on per-component line caches ... so **every frame — every keystroke — re-wrapped every settled card's output.**」
- 结果（`:21`，含测法与环境）：「**Measured on the 196k-event session (tmux, 200×50): resume prompt-ready 12.2 s → 7.2 s; per-keystroke echo 796 ms median → 17 ms (fresh-session parity).**」
- 残留（`:31`）：「the residual per-frame cost is pi-tui's tree traversal and row concatenation, linear in rendered rows. Resume render cost is now dominated by **pi-tui's one-time initial layout (~4 s at 196k events) plus load (~1.7 s)**, both linear.」

动画帧率（`2026-07-27-tui-running-glyph-smooth-fade.md:20,37`）：「`STATUS_ANIMATION_INTERVAL_MS = 50` (**~20 fps**)」，「the diffing terminal only re-emits changed cells, so the extra frames are cheap」。

### 6.5 体积与打包时间

见 §4.6 表。补一条打包时间样本（`2026-08-25-...md:98`）：「An unchanged **737,557,488-byte** payload on Windows took **172.625 seconds** through extraction/copy/cleanup versus **28.031 seconds** through direct extraction, **but that single sample per path does not justify losing failure detection.**」——作者自己标注了这是单样本。

### 6.6 shell 就绪的默认时延常量

见 §5.4：`idleSilenceMs: 3_000` + `handoffGraceMs: 500` = 3500ms；`pollIntervalMs: 50`；`exactProbeAfterMs: 150`；`timeoutMs: 30_000`。（`packages/terminal/terminal-bash/src/config.ts:94-99`）

### 6.7 没有数字的地方（明确列出）

- **`dsh` CLI 本身的启动耗时**：仓库内无基准，公开渠道无数字。检索位置：`BENCHMARK.md`、`benchmarks/**`、`README.md`、npm 元数据、公开搜索。
- **单文件可执行的启动耗时**：同上，无。
- **`dsh web` 从命令到页面可用的端到端耗时**：无。
- **Web UI 的内存占用**：`long-session-browser` 显式声明堆数据是诊断而非预算。
- **安装后总体积**：副本无 node_modules，未测。

---

## 7. 本轮不支持什么 / 未查证

### 7.1 DSH 当前明确不支持的（一手，"作者明文声明"级）

| 不支持 | 出处与原文 |
|---|---|
| 任何交互式终端界面 | `remove-tui-package.md:38`「DeepSeek Harness has no terminal UI package.」 |
| 已删 TUI 的兼容层或别名 | 同上 `:16`「deleted **without a compatibility package or alias**」 |
| 绑定全部网络接口 | `apps/cli/reference/README.md:89`「The CLI **intentionally does not support `--host 0.0.0.0`** and exits with a usage error.」 |
| 绕过 `dsh` 的 Node 应用入口 | `docs/architecture.md:45`，由 `verify-application-entrypoints` CI 门禁拒绝 |
| ACP 上的编辑器卡片 / 会话导航 / 人工询问 | `acp-automation-only-protocol.md:23` |
| Claude Code 30 个 hook 事件中的 23 个 | `hooks-claude-code` README Known Limitations |
| Codex 10 个 hook 事件中的 5 个 | `hooks-codex` README Known Limitations |
| 持久 shell 的全屏 alternate-buffer 交互 | `packages/terminal/terminal-bash/README.md` |
| Windows 上的 Landlock 与 flock addon | `native/system/docs/support-matrix.md:14` |
| Linux 桌面发行 | `2026-08-25-...md`「Linux has no supported release target.」 |
| Windows arm64 Python wheel | `python/sdk-runtime` 的 5 个 wheel tag 里没有 |
| 外部 Pull Request | `CONTRIBUTING.md`「We are sorry that we cannot accept external pull requests at the moment.」 |
| 安装期原生编译回退 | `native/system/AGENTS.md`「There is no install-time compile fallback.」 |

### 7.2 负面结论的强度分级

**"构造了反例验证过不存在"级**（给出了带边界的检索式与命中计数）：
- 仓库中不存在任何 alt-screen / 同步输出控制序列：`?1049`、`?2026`、`DECSET`、`alternate screen`、`alt-screen`、`altscreen`，以及动态构造形态 `\x1b[?${`、`\u001b[?${`、`CSI ?`——**全仓库不限扩展名、不排除任何目录，命中文件数各为 0**。对照组 `?2004` 命中 2 个文件，且都是散文而非代码。
- 仓库中不存在 ink / blessed / opentui / react-reconciler / yoga-layout（lockfile 与全部 `package.json` 命中 0；对照 `react` 50 处）。
- 仓库中不存在 `string-width` / `wcwidth` / east-asian-width 库（命中 0）。
- `pi-tui` 在任何 `package.json` / `pnpm-lock.yaml` / `patches/` / `.ts` 中命中 0。
- `docs/subsystems/` 中不存在 `tui.md`（存在 `terminal.md`、`web-client.md`、`web-server.md`）。

**"该读的地方读遍了没找到"级**：
- 出厂 CLI/host 代码中没有 TTY 检测（检索式与排除项见 §2.4；唯一命中是实验性 WebWorker 垫片）。
- 仓库里没有任何自动端口转发 / 反向隧道 / 无浏览器降级方案（检索位置见 §4.2）。
- 公开渠道没有带编号且仍 open 的 DSH 官方缺陷单（检索位置见 §5.1）。
- `BRAND_GUIDELINES.md` 中没有任何配色/字形/语气规范（全文 12 行已读完）。

**"未确证"级**（有间接迹象但无可引用的一手证据，不得当作事实）：
- 已删 TUI 通过 pi-tui 具体如何接管屏幕（本仓库内无任何控制序列可查，pi-tui 源码不在本仓库）。
- pi-tui 当时被钉在哪个精确版本。
- 第三方 TUI 插件（`@nexlineai/dsh-tui` 等）各自的渲染栈。
- §5.4 的 3.5 秒延迟在本 commit 是否仍复现。

### 7.3 本轮未能核到的

1. **`dsh --help` / `--version` 的运行时原文**——副本未构建，且本轮不允许交互式运行。所有命令行语法均来自源码与文档。
2. **被删 TUI 的实际代码**——本轮禁用 git，只能靠作者自述重建；关于 pi-tui 用法的一切都是"作者说的"而非"代码写的"。
3. **安装后体积、冷启动、`dsh web` 端到端耗时**——需构建与运行环境。
4. **§5.8 的三条社区报告**（Web OOM、大会话冻结、堆增长）——只有 SEO 站转述，未溯源。
5. **DSH 仓库的 GitHub Issues 是否启用**——未确认。
6. **Lexical composer 的实际输入契约**（IME、粘贴、快捷键）——未精读源码，§2.5 的相关陈述标为判断。
7. **`.agents/notes/` 的完整覆盖**——共约 200 余份英文 note，本轮按 CLI/界面/分发/兼容关键词筛选后精读约 60 份，其余未读。
8. **`subagent-claude-code` / `subagent-codex` 的运行时行为**——只读了 README 与依赖钉版，未读实现。

### 7.4 文档与实现的分叉

发现一处，明确声明以哪层为准：

`apps/cli/README.md:28` 与 `apps/cli/src/args.ts` 的帮助示例中仍以 `tui` profile 举例（`dsh --profile tui --resume <id>`、`dsh plugin --profile tui add <package>`），而 §1.3/§3.3 已确证仓库中没有任何 tui bundle。**README 自带限定词**「example, **assuming the tui profile is installed**」，所以这不是错误陈述，而是在演示"外部插件 profile"这一机制。

**以源码为准**：`packages/bundle/` 下只有 `base` / `headless` / `web-app` / `sdk-app` / `sdk-minimal` / `acp-app` 六个出厂 bundle。

---

## 8. 证据清单

标注约定：**[一手·码]** = 本 commit 源码/配置，可复核到行；**[一手·述]** = 作者在 `.agents/notes/` 或官方文档中的自述；**[二手]** = 外部转述，不可逐字核实。

### 8.1 版本与 CLI 本体

| 条目 | 位置 | 类型 |
|---|---|---|
| commit / 时间 / 版本 | `/tmp/deepseek-harness` `c291e796…`；`package.json:2-3` | 一手·码 |
| Node engines | `package.json:8-10` | 一手·码 |
| CLI 自述、bin、files | `apps/cli/package.json` | 一手·码 |
| CLI 源码 6 文件 968 行；59 个 ts/tsx 中其余为测试 | `apps/cli/src/*.ts`（`wc -l`）；`find apps/cli -name '*.ts' -o -name '*.tsx'` | 一手·码 |
| 入口与动态 import 分发 | `apps/cli/src/bin.ts:29-61` | 一手·码 |
| launcher 只解析自己的旗标 | `apps/cli/src/args.ts:3-10`；`apps/cli/reference/README.md:25,29` | 一手·码 + 述 |
| 信号接管时点 | `apps/cli/src/profile-boot.ts:304-308` | 一手·码 |
| `cmdline` / `app-boot` / `headless` 职责 | 三包 README 的 `description` 与 Summary | 一手·述 |
| npm 元数据（48,910 B / 10 files / 78 deps） | `https://registry.npmjs.org/@deepseek-ai/dsh/0.1.5-rc.2`，2026-09-21 抓取 | 一手·外部注册表 |

### 8.2 "不在终端渲染"的证明

| 条目 | 位置 | 类型 |
|---|---|---|
| alt-screen/同步输出控制序列全仓 0 命中 | 全仓库 `grep -rl -F` on `?1049` `?2026` `DECSET` `alternate screen` `alt-screen` `altscreen` `\x1b[?${` `\u001b[?${` `CSI ?`；对照 `?2004` 命中 2 文件均在 `.agents/notes/` | 一手·码 |
| TUI 框架零命中，`react` 50 处 | `pnpm-lock.yaml`；全部 `package.json`；`THIRD_PARTY_NOTICES.md` 运行时表 | 一手·码 |
| 无 TTY 检测 | 检索式见 §2.4；唯一命中 `packages/experimental/webworker-runtime/src/node/builtin_modules/implemented/tty.ts:11` | 一手·码 |
| node-pty / @xterm/headless / supports-color 消费者 | `packages/subprocess/subprocess-local/package.json:47`；`packages/terminal/terminal-bash/package.json:42` 与 `src/session.ts:5,29`；`vendor/logger-console/package.json:40` 与 `src/index.ts:23` | 一手·码 |
| scrollback 属工具层 | `packages/terminal/terminal-bash/src/config.ts:91-92` | 一手·码 |

### 8.3 CLI 的终端契约

| 条目 | 位置 | 类型 |
|---|---|---|
| 出厂应用清单与桌面架构 | `docs/architecture.md:19,25,29,43,45,49-53` | 一手·述 |
| 各 profile 参数表 | `apps/cli/reference/README.md:33-39` | 一手·述 |
| headless 输出契约与 Known Limitations | `packages/bundle/headless/README.md:12,36` 及该段 | 一手·述 |
| web 启动、token、cookie、SSH、LAN、`--no-open` | `packages/bundle/web-app/README.md`；`apps/cli/reference/README.md:89` | 一手·述 |
| 关机与退出码 | `apps/cli/reference/README.md:91` | 一手·述 |
| stdout 纯 JSON-RPC | `.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md:29`；`packages/bundle/acp-app/README.md` | 一手·述 |
| SSH 检测实现 | `packages/util/launch-environment/src/index.ts:120-126` | 一手·码 |
| profile 自动初始化与 patchReload | `apps/cli/reference/README.md:10-16`；`docs/architecture.md:29` | 一手·述 |

### 8.4 浏览器/桌面渲染

| 条目 | 位置 | 类型 |
|---|---|---|
| Web 客户端 React 18、boot kernel | `packages/client/web/package.json` | 一手·码 |
| 三帧节流 | `packages/client/ui-conversation/src/client/conversation/assembly.ts:130-138` | 一手·码 |
| 增量 markdown 与两处行为偏差 | `.agents/notes/archived/architecture/2026-08-06-web-markdown-incremental-ast-renderer.md:10,14,17,18,22,26-30,34` | 一手·述 |
| ANSI 逐列重放、宽字符、blink 拒绝 | `packages/client/ui-primitives/src/ansi.ts:1-4,58-59,74-98,105,107-135,138-144,238-341` | 一手·码 |
| 终端卡设计、被拒方案、O(n²) 事故 | `.agents/notes/archived/feature/2026-07-28-web-terminal-card.md:12,16,20-25,31-37,41-45,47-55,59` | 一手·述 |
| anser / react-virtual 消费者 | `packages/client/ui-primitives/package.json:32`；`packages/client/ui-trajectory/src/client/TrajectoryTable.tsx:5` | 一手·码 |
| Web 样式纪律 | `docs/web-styling.md:9,20-26` | 一手·述 |
| Web 客户端分层 | `docs/subsystems/web-client.md` | 一手·述 |
| apps/* 四入口自述 | `apps/{cli,web,desktop,desktop-host}/package.json` 的 `description` | 一手·码 |

### 8.5 拒绝与品味

| 条目 | 位置 | 类型 |
|---|---|---|
| 删 TUI 的完整论证 | `.agents/notes/archived/simplification/2026-08-04-remove-tui-package.md:10,12,16,22,30-34,38-40` | 一手·述 |
| ACP 砍回自动化协议 | `.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md:11,19,23,29,41,43,45,47,51,53,55,59-63` | 一手·述 |
| 不把执行交给编辑器 | `.agents/notes/archived/feature/2026-06-18-acp-terminal-and-tool-rendering.md:16,18,25,29,33,38,43-47,51` | 一手·述 |
| 入口 CI 门禁 | `docs/architecture.md:45`；`AGENTS.md` | 一手·述 |
| 历史 TUI：pi-tui、TTY 硬要求、拒绝静默降级 | `.agents/notes/archived/feature/2026-07-17-dedicated-full-screen-tui-front-door.md:12,18,22,34,36,44-47`；`2026-07-24-tui-shell-prompt-editor.md:16` | 一手·述 |
| 历史 TUI：主题无关调色板 + snapshot 门禁、truecolor 探测 | `.agents/notes/archived/feature/2026-07-21-tui-banner-brand-gradient.md:12,16,18,20,26` | 一手·述 |
| 历史 TUI：Windows 不降级 | `.agents/notes/archived/feature/2026-07-20-windows-tui-support.md:16,24` | 一手·述 |
| 各类禁令 | `AGENTS.md`、`CONTRIBUTING.md`、`SAFETY.md`、`packages/AGENTS.md`、`packages/client/AGENTS.md` | 一手·述 |
| note 四态定义 | `.agents/notes/README.md`、`.agents/notes/AGENTS.md` | 一手·述 |
| rejected 之一被实现证伪 | `.agents/notes/rejected/simplification/2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md` | 一手·述 |

### 8.6 跨 agent 兼容（§3.6）

| 条目 | 位置 | 类型 |
|---|---|---|
| subagent 后端清单 | `ls packages/subagent` | 一手·码 |
| 钉版依赖 `@anthropic-ai/claude-agent-sdk@0.3.263` | `packages/subagent/subagent-claude-code/package.json:44` | 一手·码 |
| 钉版依赖 `@openai/codex@0.153.4` | `packages/subagent/subagent-codex/package.json:47` | 一手·码 |
| 两个 subagent 后端的自述 | 两包 README Summary | 一手·述 |
| Claude Code 平台载荷授权声明 | `THIRD_PARTY_NOTICES.md` "Official Claude Code platform payloads" 节 | 一手·述 |
| 两个 hooks 桥的自述与完整缺口清单 | `packages/hooks/hooks-claude-code/README.md`、`packages/hooks/hooks-codex/README.md` 的 Summary 与 Known Limitations | 一手·述 |
| 两个 hooks 桥进生产依赖 | `apps/cli/package.json` dependencies | 一手·码 |
| AGENTS.md / CLAUDE.md 指令加载与 65,536 字节预算 | `packages/context/agent-instructions/README.md` Summary；`apps/cli/reference/README.md:93` | 一手·述 |
| 技能目录家族 | `packages/skill/README.md`、`packages/skill/skill/README.md` Summary | 一手·述 |
| tmux 上下文包 | `packages/context/tmux-context/README.md` Summary | 一手·述 |

### 8.7 i18n / 品牌 / 原生 / 分发

| 条目 | 位置 | 类型 |
|---|---|---|
| 1,437 / 1,440 计数 | `find` 计数，本 commit | 一手·码 |
| 双语台账机制 | `README.i18n.yaml` 全文 | 一手·码 |
| locale 拥有 UI 文案 + AST 检查 | `.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md` | 一手·述 |
| label thunk 与被拒方案 | `.agents/notes/archived/architecture/2026-07-30-client-locale-full-rollout.md` | 一手·述 |
| 初始 locale 来自浏览器 | `.agents/notes/archived/feature/2026-07-31-browser-derived-initial-locale.md` | 一手·述 |
| 双语链接规则 | `.agents/notes/archived/process/2026-08-18-localized-bilingual-links.md` | 一手·述 |
| CJK markdown 修正 | `packages/client/ui-primitives/src/markdown/cjkFriendlyStrong.ts` | 一手·码 |
| 品牌文件只管商标；鱼标识 | `BRAND_GUIDELINES.md` / `.zh.md` 全文；`packages/client/ui-brand-official/README.md` | 一手·述 |
| 原生为 C11、动机、平台矩阵、无编译回退 | `native/system/packages/entry/src/main.c:2-13`、`flock.c:2-3`；`native/system/docs/support-matrix.md:5-14`；`native/system/AGENTS.md`；`2026-09-07-prebuilt-system-primitives.md` | 一手·码 + 述 |
| Landlock 曾是 Rust | `.agents/notes/rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md` | 一手·述 |
| vendor 策略与 19 项本地修改 | `vendor/README.md:3,5,53-57` | 一手·述 |
| 单文件可执行取舍与 174MB | `.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md:89` 及 Alternatives 段 | 一手·述 |
| Electron 体积、平台、上游 Node 选择 | `.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.md:98,102` | 一手·述 |
| profile + bundle 扩展模型 | `.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.md`；`apps/cli/reference/README.md:10-16,25-29` | 一手·述 |
| 三个 patch 的内容与动机 | `patches/*.patch` 全文；`2026-07-29-persistent-bash-str-replace-editor.md:20`；`2026-07-10-...md`；`2026-08-25-...md` | 一手·码 + 述 |
| NIH 审计全部拒绝 | `.agents/notes/rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md` | 一手·述 |
| 供应链漂移仍是 proposed | `.agents/notes/proposed/process/2026-06-11-supply-chain-and-vendor-drift.md` | 一手·述 |

### 8.8 性能

| 条目 | 位置 | 类型 |
|---|---|---|
| BENCHMARK.md 无数字 | `BENCHMARK.md` 全文 3 行 | 一手·码 |
| 校准常量 | `benchmarks/support/calibration.ts:1-15` | 一手·码 |
| 五套基准数字 | `benchmarks/session-open/session-open.bench.ts:30,53-73,293,305,315`；`benchmarks/agent-continuation/agent-continuation.bench.ts:15-29` 与 `README.md:9`；`benchmarks/conversation-fold/conversation-fold.bench.client.ts:27-36`；`benchmarks/active-stream-reconnect/reconnect.bench.client.ts:8-9`；`benchmarks/long-session-browser/long-session.bench.ts:102-103` 与 `README.md:13,15` | 一手·码 |
| 基准纪律与非 CI 道 | `benchmarks/AGENTS.md:3,10,12`；`vitest.bench.config.ts`；`vitest.web.perf.config.ts`；`vitest.web-stress.config.ts` | 一手·码 |
| 测量方法论 | `.agents/skills/dsh-speed-up-perf/SKILL.md` | 一手·述 |
| 历史 TUI 12.2s→7.2s / 796ms→17ms | `.agents/notes/archived/bug-fix/2026-08-03-tui-long-session-render-costs.md:10,12,13,21,31` | 一手·述 |
| 25MB RangeError | `packages/client/ui-primitives/src/ansi.ts:138-144`；`2026-07-28-web-terminal-card.md:24` | 一手·码 + 述 |
| shell 就绪默认常量 | `packages/terminal/terminal-bash/src/config.ts:94-99` | 一手·码 |
| 就绪是启发式，macOS/Windows 无精确层 | `packages/terminal/terminal-bash/README.md` Known Limitations | 一手·述 |

### 8.9 外部来源（逐条标注可核实度）

| 条目 | URL | 类型与可核实度 |
|---|---|---|
| 官方 Discussion #3715：「no interactive terminal agent」；devDependencies 与 npm latest tag 两个生态坑 | `https://github.com/deepseek-ai/deepseek-harness/discussions/3715` | 第三方作者（`nexlineai`）一手发帖，经 WebFetch 抓取，**引文可核实** |
| Cherry Studio #20119：dsh 0.1.2-rc.1 破坏就绪检查 | `https://github.com/CherryHQ/cherry-studio/issues/20119` | 第三方一手 issue，2026-09-06，closed as duplicate，**可核实** |
| 用户博客：启动不即时、无完成通知 | `https://deepakness.com/blog/deepseek-harness/` | 二手转述，**单一来源未交叉验证** |
| Medium：持久 bash 70x 慢速 | `https://ai-engineering-trend.medium.com/one-tiny-typo-in-deepseek-harness-slowed-command-execution-down-by-70x-bf3b5ccf439e` | 二手，**归因未溯源到 PR/commit**；3.5s 数值已在源码侧独立印证（§5.4） |
| 第三方 TUI 插件若干 | `github.com/nexlineai/dsh-tui`、`github.com/gxinxing/deepseek-harness-tui`、`github.com/andrecolin/dsh-tui` 等 | 仅搜索结果标题，**各自技术栈未确证** |
| Web OOM / 大会话冻结 / 堆增长 | `dsh-plugin.org` 等 SEO 站 | **不可核实，仅登记为待验证命题** |

---

*报告完成于 2026-09-21，绑定 commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）。*
