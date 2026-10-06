# 六个 agent harness 的 CLI/TUI：现在该信什么

- **调查对象与日期**：Codex CLI `0.154.0` + 源码 `774d6425`｜Claude Code `2.1.278`（BuildID `83effae1…`）｜
  Cursor `cursor-agent 2026.08.04-aaa8809`｜Kimi Code `0.31.0`（+ 上游 HEAD 对照）｜
  DeepSeek Harness `c291e796` / `0.1.5-rc.2`｜Pi `890f9208` / `0.86.1`。
  **全部 2026-09-21 当日取证**（DSH 源码副本为 2026-09-10 快照）。
- **消费者**：**待出现。**本项目尚无覆盖终端交付层的产品或架构正文
  （`design/product` 的 PF-000…PF-015 无一覆盖）。最可能的第一个消费者是未来的交付层架构设计；
  [PF-008 人机协同](../../design/product/PF-008-human-in-the-loop/README.md) 的呈现面可能间接消费，
  **但此刻它并未依赖本结论**。
- **最近核对**：2026-09-21（首轮）。
- **当前结论（一句话）**：这一代终端 agent **在渲染层无一例外地 fork、替换或自建**，且
  **六家里三家的终端渲染血缘指向同一个库**；「终端原生 scrollback 优先」是共识，但五家都撞到同一堵墙、
  都并排加了一条全屏路径而**没有一家把默认切过去**；真正的取舍空间在运行时选择（启动成本横跨两个数量级）
  与终端差异的承担方式；**CJK 组合态输入与屏幕阅读器是两处共同的、目前没有已知解法的缺口**；
  **公开的 TUI 性能数字是真空，而内部测量普遍很强**。

## 问题与区分条件

要区分三件事：**哪些做法六家一致**——那是这一代的事实基线，另做一种选择要额外举证；
**哪些六家分歧**——那才是真的取舍空间；**哪些问题六家都没解决**。

会改变本页边界的观察：任一家把全屏渲染器切成默认；任一家公布带测法的 TUI 性能数字；
任一家给出 IME 组合态或屏幕阅读器的架构级解法。

## 证据入口

取证条件、各家局限、派发者的逐条复核记录与三处任务书错误，全部在 [evidence.md](evidence.md)，
**取证条件与结论不写在同一页**。逐条观察与原始引文在 [reports/](reports/) 的七份当轮报告里。

## 当前结论

### 一、没有一家直接使用上游 TUI 框架的原样版本

| 家 | 渲染层的实际形态 |
|---|---|
| **Codex** | ratatui `0.30.2`（开四个 `unstable-*` feature）+ **自维护的 crossterm fork**（`openai-oss-forks/crossterm` rev `45fecb95`），并把 ratatui 的 `Terminal` **整份复制进仓库**改造成 `custom_terminal.rs`（52,350 B，保留 MIT 头） |
| **Claude Code** | React 19 + **vendored Ink**，但渲染后端换成 cell 网格 + 双缓冲（`frontFrame`/`backFrame`）+ 字符/样式对象池 + 指令流；**Yoga 从 WASM 换成自研纯 TypeScript 实现** |
| **Cursor** | **Ink 被 vendor 进 Cursor monorepo 成 workspace 包 `ink/`**（`../ink/build/` 116 处、`node_modules/ink/` 0 处），加了 `maxFps`/`incrementalRendering`/`stdinInputFilter`/`onReactError`/`onFullScreenClear`/`onImmediateRender` 六个上游没有的 render 选项，以及 CSI-u 解析、OSC 8 感知截断、屏幕阅读器模式 |
| **Pi** | **从零自建** `@earendil-works/pi-tui`（`packages/tui/src` 18,267 行 TS），运行时依赖只有 `get-east-asian-width` 与 `marked` |
| **Kimi Code** | **`@moonshot-ai/pi-tui`——pi-tui 的厂内 fork**（本机 `0.80.8`），靠**周期性 re-baseline** 跟上游 |
| **DSH** | 曾用 **`@earendil-works/pi-tui` 并打 pnpm patch**，2026-08-04 **整包删除，不留兼容层** |

- **适用范围**：对上表各自的精确版本成立。**不支持**推广为「上游 TUI 框架不可用」——
  Codex 重写公告里作者对 Ink 是正面评价（「has been easy to whip up and iterate with」），
  Pi 作者拒绝 Ink 的理由是「**I definitely don't want to write my TUI like a React app**」，
  两者理由完全不同。**也不支持**「Claude Code 弃用了 Ink」这一流传说法：
  `2.0.10` 的原文只有 "Rewrote terminal renderer for buttery smooth UI"，**全文没提 Ink**，
  而 `2.1.110` 的 changelog 仍字面提到 Ink，二进制里 Ink 上游原样错误文案也仍在。
- **代价与不适用**：fork 与自建把上游的维护责任变成自有资产。可量化的代价：
  Codex 的 crossterm fork **无 README、无 changelog、无 diff 说明**，调研方明确写「我没能核到它改了什么」——
  **一个不透明的底层依赖**，任何以上游 crossterm 行为为前提的推论对 Codex 不成立；
  Claude Code 因自研布局而**预期布局会抛异常**（`layoutFailed`/`consecutiveLayoutFailures`/
  `relayoutFromScratch`/`reportLayoutFaultToErrorTracking` 一整套容错，日志上限 5 条），
  且纯 JS 布局跑在主线程，布局耗时直接计入事件循环；
  Pi 的 18k 行里按键解析、宽字符测宽、多行编辑器、Markdown、LaTeX、图片协议全部自担，
  两份 CHANGELOG 合计 6,993 行、终端兼容条目密集出现，**是持续维护税而非一次性成本**。
- **撞上这条事实会怎样**：直接用上游未改版本，会在终端兼容、增量渲染与性能埋点这三处
  撞上它们各自 fork 掉的正是这些地方；而 fork 之后升级上游就要重新对齐
  （Codex 用了四个 `unstable-*` feature，升 ratatui 会撞 API 破坏）。
- **来源**：各家报告 §1；[evidence.md 复核表](evidence.md#派发者复核哪些断言回到原始来源验过)里
  第 4、10、11、13、14、19–22 行为派发者亲自复核。
- **最近核对**：2026-09-21。

### 二、六家里三家的终端渲染血缘指向同一个库

`pi-tui`（作者 Mario Zechner）同时是：**Pi 自己的渲染层**、**Kimi Code 的 fork 基线**
（`@moonshot-ai/pi-tui`，README Acknowledgements 原文致谢 `earendil-works/pi-mono/packages/tui`）、
以及 **DSH 已删除的那套 TUI 的渲染栈**（pnpm patch 过）。
旁证：Kimi 的二进制里还有 `@mariozechner/clipboard`（同一作者的原生剪贴板包）85 处命中，
以及未擦净的上游痕迹——环境变量仍叫 `PI_TUI_WRITE_LOG` / `PI_HARDWARE_CURSOR` / `PI_CLEAR_ON_SHRINK`。

- **适用范围**：只对这三家的这三个版本成立。**不支持**推广为「pi-tui 是事实标准」——
  Codex、Claude Code、Cursor 三家与它无关，另两条路线（ratatui、Ink）各自也有两家在用。
- **代价与不适用**：**fork 一个高速演进的上游，能力节奏会受上游支配。**Kimi 侧有三条可核的代价：
  （a）社区提的保守鼠标策略提案 #1174 开了两个半月**无维护者回应**，最终鼠标能力是
  0.84.5 从上游 re-baseline 搬回来的——**社区提案的路径被 re-baseline 的路径挤掉了**；
  （b）上游改约定就得跟着改（0.85.1 把 pi-tui 自己读 `PI_*` 环境变量的能力删掉）；
  （c）**上游的 bug 直接变成自家的**——#2324 的 resize 闪烁根因追到上游 `earendil-works/pi#6050`，
  而该 issue 在**创建后 11 秒即被 closed / not_planned**。
  更硬的一条：Kimi 曾自己改渲染核心又退回去——pi-tui `0.80.6` changelog 原文
  「Revert the fork's viewport and scrollback rendering patches, restoring the upstream differential-rendering behavior」。
  DSH 侧则留下了**不 vendor 的理由**：「The project updates frequently... Owning the full source and
  synchronization process would add disproportionate maintenance.」
- **撞上这条事实会怎样**：把 pi-tui 当成稳定基座，会同时继承它的演进速度与它的未决缺陷；
  而给它打本地 patch 的那一层，是 Kimi 唯一一次公开承认改砸并回退的地方。
- **来源**：Kimi 报告 §1.5、§4.3；Pi 报告 §1.2；DSH 报告 §3.3（派发者已复核 Kimi 的 fork 身份与 DSH 的清退彻底性）。
- **最近核对**：2026-09-21。

### 三、「终端原生 scrollback 优先」是共识，五家都撞到同一堵墙，且没有一家把默认切过去

| 家 | 默认 | 全屏路径的状态 |
|---|---|---|
| **Codex** | inline viewport，历史行用 escape 序列压进原生 scrollback | `tui.fullscreen_transcript` **默认 false**；alt-screen 只给 overlay 用。正在推进（有采用率遥测，PR #46733 于取证前一天合入） |
| **Claude Code** | `tui: "default"`（classic main-screen） | `tui: "fullscreen"` = **flicker-free alt-screen + 虚拟滚动**（官方文案原文），官方文档自承是 **research preview** |
| **Pi** | `tuiMode: "regular"` | `TuiAltScreen`（1,742 行）文档标 **experimental**；它是被 issue #7304 逼出来的 |
| **Kimi Code** | inline（本机 `0.31.0` **构造性确认无 alt-screen、无鼠标**） | 0.36.0 起加了，但至今 **env 门控**：`KIMI_CODE_TUI_FULL_SCREEN=1`，源码注释原文 `// Fullscreen is experimental and env-gated for now` |
| **Cursor** | 主界面 inline | **两个重滚动子界面整个跳出 Ink** 自己进 alt-screen（`?1049h` 全 bundle 仅 3 处） |

- **适用范围**：对上表版本成立。**不支持**推广为哪一种更好——本轮的事实只是：
  五家都先选了 inline，五家都发现它有天花板，五家都没敢换默认。
  ⚠️ **社区里两处说「Kimi 的 alt-screen 是默认」与 HEAD 源码和官方文档矛盾**，本轮以源码为准。
- **代价与不适用**：inline 路线的代价被一手材料写死了。Pi 作者自陈这条路有一个 catch：
  「if the first changed line is above the visible viewport… we have to do a full clear and re-render.
  **The terminal doesn't let you write to the scrollback buffer above the viewport.**」
  ——这个 catch 就是 Pi 的 #7304 与 Kimi 的 #981/#2168/#2296/#3263。
  全量重绘发 `\x1B[2J\x1B[H\x1B[3J`，**`ESC[3J` 会清掉 scrollback**，即「为保住 scrollback 而选的路线，
  在退化路径上恰恰抹掉 scrollback」。Codex 侧的代价是**特判数量**：三套 `ScrollbackStrategy`
  （Standard / Zellij / FullScreen）+ 按终端硬编码的 reflow 上限（VS Code 1,000 / Windows Terminal 9,001 /
  WezTerm 3,500 / Alacritty 10,000）+ tmux 专属 500 ms 轮询线程。
  全屏路线的代价 Pi 作者也列了：失去 scrollback 就要自己实现搜索与滚动，且
  「**Mouse scrolling specifically always feels kind of off in such TUIs**」。
  另有一条 inline 特有的连带代价：**历史必须窗口化**——Kimi 默认只挂最近 15 轮（`KIMI_CODE_TUI_MAX_TURNS`），
  Cursor 的 `<Static>` 只留最近 10 轮（常量 `tZ=10`），超出的被销毁后**无法再展开**（Kimi #2904）。
- **撞上这条事实会怎样**：把「已完成内容交给终端」当作免费假设，会在**用户向上滚动期间发生重排**时
  撞上整屏重绘并丢失 scrollback。Pi 的 #7304、Codex 的 #27644 / #42020、Kimi 的 #2324
  是同一堵墙的四个撞击点，**都不是「配置错了」，是这条路线的结构性上限**。
- **来源**：各家报告 §2；[本机实测](reports/2026-09-21-本机实测.md) §9。
- **最近核对**：2026-09-21。

### 四、同步输出（DECSET 2026）已是消闪烁的事实基线

派发者同口径探测：`?2026` 在 claude（4）、kimi（6）、codex 二进制（2）与源码（2）、cursor（6）、
pi 源码（14）**全部命中**；唯一 0 命中的 DSH 没有终端界面。三家在源码/文案层有正面佐证：
Codex 每次 `draw` 整体包在 `sync_update` 里；pi-tui README 原文
「All updates are wrapped in **synchronized output** … for atomic, flicker-free rendering」；
Cursor 在变更审阅界面配 `cork()/uncork()` 使用。

- **适用范围**：只支持「这些产物里出现了该序列」。**不支持**按命中次数比较谁做得更完整。
- **代价与不适用**：同步输出**不是万灵药，而且包漏了就前功尽弃**。
  Codex #25622（open）：resize 时的整屏清除发在 `ESC[?2026` 事务**之外**，支持同步更新的终端照样闪空屏。
  更反直觉的一条：Codex #24543（open）——`ESC[?2026h` 本身**在 Visual Studio Developer PowerShell 里
  把 TUI 弄坏了**，即这个序列在少数宿主上是负资产。
  另有 Claude Code `2.1.212` 这一罕见案例：Anthropic **公开更正了自己关于 tmux 同步输出的 release note**。
- **撞上这条事实会怎样**：只在「正常绘制路径」包同步输出、而漏掉 resize / 清屏 / 退出这些边路，
  用户看到的仍然是闪烁，且这类缺陷不会在正常交互里复现。
- **来源**：[本机实测](reports/2026-09-21-本机实测.md) §9；Codex 报告 §2.5、§5.2；Claude Code 报告 §7.4。
- **最近核对**：2026-09-21。

### 五、五家自带检索引擎，六家全都接 MCP

**自带 ripgrep**：Codex（独立文件 `ripgrep 15.2.0`）、Cursor（**fork 过的 `ripgrep 15.1.0-cursor5`**）、
Claude Code（**Rust 目标码静态链入同一个二进制**，第一方文案自陈「or use the native claude binary
**which embeds it**」）、Kimi（二进制内 `ripgrep` 52 处）、DSH（`@vscode/ripgrep` 在自家运行时依赖表里）。
**只有 Pi 没有**（其 coding-agent 的 19 项依赖已穷举）。
Codex 更进一步，把 **`zsh` 与 `bwrap`（自述 "bubblewrap built for Codex"）**也打进分发；
Kimi 则在需要时**按需下载 `fd` 并校验硬编码 SHA-256**。

**MCP**：特征串 `modelcontextprotocol` 在六家全部命中（claude 24 / kimi 35 / codex 10 / cursor 4 / pi 6 / DSH 36）。

- **适用范围**：Pi 那条是「读遍了可穷举的依赖清单未发现」，**不是构造反例验证过不存在**。
  MCP 的命中次数**不可用于比较投入程度**。
- **代价与不适用**：自带工具把宿主差异换成分发体积与**可移植性风险**。
  本轮抓到一个**构造并验证过的反例**：Codex 主二进制是 static-musl、在本机 glibc 2.31 上跑得动，
  但**同一份分发里的 `zsh` 动态链接且要求 GLIBC_2.38，实测执行失败**。
  **分发的可移植性下限由最弱的那个随包文件决定，不由主二进制决定。**
  （该失效对 codex 功能的实际影响本轮未测。）反向的例子：Kimi 的 install.sh **直接拒装 musl/Alpine**
  （原文「we currently only ship glibc binaries, so failing early is better than a runtime dlopen error」），
  却给 `fd` 拉 musl 静态版。
- **撞上这条事实会怎样**：把「主二进制静态链接」当成「这份分发可移植」，会在旧发行版上
  遇到随包资源跑不起来而主程序看起来正常的分裂状态。
- **来源**：[本机实测](reports/2026-09-21-本机实测.md) §5、§6、§11.1；DSH 的 `THIRD_PARTY_NOTICES.md`（派发者已核）。
- **最近核对**：2026-09-21。

### 六、运行时选择决定启动成本，跨度是两个数量级

同一台机器、同一把尺子（非交互 `--help`，n=10 取中位，热缓存）：

| | 运行时形态 | 启动中位 | 峰值 RSS | 分发 | 可移植性下限 |
|---|---|---|---|---|---|
| **Codex** | Rust，**static-musl** 单二进制 | **12 ms** | 24.5 MiB | 324 MB | 主二进制无 libc 依赖 |
| **Claude Code** | **Bun 1.4.3 编译单文件（JavaScriptCore）**，1,897 个 chunk 全部预编译成 JSC 字节码 | **189 ms** | 142.4 MiB | 224 MB | GLIBC_2.26 |
| **Cursor** | **外挂完整 Node v24.5.0（123 MB）** + webpack chunk，未打包 | **801 ms** | 194.4 MiB | 249 MB | GLIBC_2.28 |
| **Kimi Code** | **Node v24.15.0 SEA** 单文件（`useSnapshot:false` + `useCodeCache:false`） | **1242 ms** | 387.7 MiB | 147 MB | GLIBC_2.28（**明确不支持 musl**） |

- **适用范围**：**只是非交互子命令的进程启动成本**，与「用户按下回车到看见界面」不是同一件事。
  **不支持**「启动快 = 交互流畅」。单机、热缓存（无 root 无法清 page cache）。
  DSH 与 Pi 本机未安装，**不具备测的条件**。
  ⚠️ **一处必须并列声明的跨源差异**：Kimi 的 issue #181 记录第三方在 **v0.6.0 / darwin-arm64** 上
  用 `time kimi --help` 测得 **~0.21 s**，而派发者在 **0.31.0 / linux-x64** 上测得中位 **1242 ms**。
  **版本、平台、机器、方法全不同，不能相减，也不能据此断言「后来变慢了」**——记在这里是因为
  两个数字都真实存在，下一轮若要追这条线，起点在这里。
- **代价与不适用**：Claude Code 的 `--version` 是 12 ms 而 `--help` 是 189 ms，**15 倍落差**；
  事实如此，「`--version` 命中早期短路」是**未经源码验证的推断**。
  体积侧各有各的账：Codex 的 262 MB 里 **194.7 MB 是 `.text`——是代码不是资源**，
  且团队已用 `not_planned` 关闭体积优化请求（维护者原话：「This feature request hasn't received
  enough upvotes, so I'm closing it.」）；Claude Code 的 `.bun` 节 139 MiB 里**源码与 JSC 字节码各存一份**，
  体积与启动收益在同一个旋钮上；Cursor 三版本并存 697 MB，**重复的 Node 就占 387 MB**，
  且分发里有可点名的死重量（4 平台 tree-sitter prebuild、一个三个版本目录里都不存在却仍保留 fallback
  与配套 63 KB 品牌 mp4 的 `polished-renderer.node`、20 个用不到的 OpenTelemetry instrumentation、三份 undici）；
  Kimi 的 153.7 MB 里 **17.9 MB 是未 strip 的符号与 DWARF**，SEA 资产的 11.8 MB 里
  **10.4 MB 是浏览器 UI 产物**（Vue/mermaid/katex/字体）——**每个 CLI 用户为 Web UI 承担约 6.8% 的二进制体积**。
  Kimi 还有一条自愿放弃的东西：`useSnapshot:false` + `useCodeCache:false` 让 18.9 MB JS 以**明文**存在二进制里，
  **选 SEA 而不开 snapshot/code-cache，等于放弃了产物的不透明性**。
- **撞上这条事实会怎样**：把 JS 运行时直接外挂（Cursor 路线）会把整个 Node 启动成本计入每次调用，
  在「一次会话里反复起进程」的用法下线性放大。
- **来源**：[本机实测](reports/2026-09-21-本机实测.md) §2–§5；Kimi 报告 §4.1、§6.1。
- **最近核对**：2026-09-21。

### 七、分发形态的迁移会切断生态，而且未必给理由

Claude Code 在 **2026-04-16 → 04-17 一天之内**从 JS bundle 切到原生二进制：
npm 上 `2.1.112` 是最后一个 JS 版（`bin: cli.js`，47 MB），`2.1.113` 起 `bin: bin/claude.exe`（129 KB wrapper）。
**官方对此只有一句话**，夹在 40 条目的 release list 中间：
「Changed the CLI to spawn a native Claude Code binary … instead of bundled JavaScript」。

- **适用范围**：只对 Claude Code 这次迁移成立。
- **代价与不适用**：**理由至今没有**——已检索 401 个版本的 changelog、7 个官方文档页、
  Anthropic 官方博客、多家播客与媒体，**均未发现**。唯一接近的是 issue #50270 上一位
  COLLABORATOR 的回帖，而且**只讲代价不讲收益**：「which drops support for some platforms…
  You can pin to the last JS bundle release」。代价是可点名的：
  （a）**AVX 成了硬门槛**——#50466/#50384/#50684/#67973 全是这次迁移引入的 SIGILL 回归，
  而「非 AVX 机器无 JS 回退」的请求 #51976 被 **closed as `not_planned`**，
  即「没有升级路径」是**被知晓、未承诺解决**的状态；#33153、#55520 仍开着；
  （b）Termux/Android 用户 #50270 **仍 OPEN**（69 评论 / 62 反应），串里汇集了 Haiku 与 OpenBSD 同根因用户；
  （c）**靠改 `cli.js` 做定制的社区生态被切断**——#52460 反映二进制被静默替换打败了 `tweakcc` 一类 patcher，
  **closed as duplicate，无维护者回复**；
  （d）glibc ≥ 2.26 的可移植性下限，RHEL/CentOS 7 的 2.17 跑不了。
- **撞上这条事实会怎样**：把分发形态当作纯粹的内部实现细节来换，会同时切掉
  「平台覆盖」与「用户侧可改性」这两条外部契约，而这两条**都不会在自己的测试里暴露**。
- **来源**：Claude Code 报告 §1.7、§3.1、§5。
- **最近核对**：2026-09-21。

### 八、终端差异的承担方式分四种，没有一种是免费的

| 承担方式 | 谁这么做 | 具体形态 |
|---|---|---|
| **写死特判进代码** | Codex | 独立的 `codex-terminal-detection` crate（只读环境变量，从不执行 PATH 上的程序）；三套 ScrollbackStrategy；按终端硬编码的 reflow 上限；WSL/VS Code 键盘增强降级；tmux 专属轮询线程 |
| **外部化给用户配置** | Pi、Kimi | Pi 的 `docs/terminal-setup.md` 192 行为 **11 类终端**逐一写用户该改什么，并**坦白承认做不到的**（xfce4-terminal / terminator / IntelliJ 内置终端无法区分 `Shift+Enter` 与 `Enter`）；Kimi 启动时检查 tmux 的 `extended-keys` 并给出可执行的修改建议原文 |
| **白名单 + 代替用户改设置** | Cursor | 三张硬编码白名单（Shift+Enter 7 个终端、半块 prompt bar 16 个、内联图片 4 个）；**`configureAppleTerminal()` 会 shell out 到 PlistBuddy 直接改用户 Terminal.app 的偏好** |
| **模式栈 + 运行时探测** | Claude Code | 带优先级的终端模式栈（`bracketedPaste:0 … focusEvents:4`），支持 `suspend`/`resume`/`reassert`，**退出前等待未回收的终端查询应答**；并解析子进程吐出的转义序列做记账还原 |

一条被三家独立采用的巧思：**Kitty 键盘协议协商时在查询串尾部挂一个 DA 哨兵**——
不支持的终端会先回 DA，于是**不需要启动超时**就能落到 modifyOtherKeys（Pi 与 Kimi 共用此实现，Cursor 亦做 CSI-u 协商）。

- **适用范围**：对各自版本成立。**不支持**据此说哪种方式更优。
- **代价与不适用**：探测路线的固有代价是**回复会污染输入**：Cursor 为此写了一个有状态的 stdin 剥离器，
  把迟到的 OSC 10/11/12/4 回复与焦点事件从用户输入里剔掉——**终端协议本身没有带内/带外分离，这条路没有别解**。
  Codex 把启动探测预算压到 **250 ms** 并在 Windows 上干脆不做启动色彩探测；它还有一条被明确记录的二选一：
  PR #35649 为**保输入不丢键**而移除 focus-time 调色板查询，副作用是长会话无法跟随系统明暗切换（#45163，open）。
  特判路线的代价是**判据本身会漏**：Codex 的 `detect()` 只认 `TerminalName::WindowsTerminal` 与 `WT_SESSION`，
  原生 Windows 的 VS Code 终端两者都不满足，于是落到 Standard 策略丢 scrollback（#42020，open）。
  还有一条无法完全覆盖的路径：**异常退出后终端状态残留**——Kimi 写了
  `TERMINAL_RESTORE_SEQUENCE`，但 SSH 断线 / `kill -9` 走不到清理路径（#1984，open）；
  DSH 历史上也栽在同一处，终端被留在 raw mode + bracketed paste，
  **Device Attributes 的回答在进程退出后被 shell 当成输入敲了进去**（`zsh: command not found: 4cecho`）。
- **撞上这条事实会怎样**：按「最小公分母」只用通用序列，会失去这几家都在做的能力；
  按「逐终端适配」则每增加一个宿主就增加一条需要独立验证的路径，且判据漏判时是**静默降级**而非报错。
- **来源**：各家报告 §2.5–2.7。
- **最近核对**：2026-09-21。

### 九、CJK 宽度普遍有解，组合态输入与 ambiguous width 仍在漏

- **Codex**：宽度层扎实（`unicode-width` + **半宽浊点 U+FF9E/FF9F 补正** + 严格正宽度契约，
  测试直接断言 `display_width("ｶﾞﾊﾟ")==4`）。但 **IME 相关 issue 12 条全部 open**，含一个 crash
  （#37506，Windows 拼音 IME 在折行边界按 Enter）。
- **Kimi Code**：投入最显式——`graphemeWidth()` 用 `Intl.Segmenter` + `get-east-asian-width`
  + RGI emoji + 国旗 + 全角块累加 + **泰文/老挝 SARA AM 归一化**；`cjkBreakRegex` 让 CJK **逐字可断**；
  4096 条宽度 LRU；fork 的本地 patch 里有 **CJK-aware autolinks**。
  但 **`graphemeWidth()` 没有 ambiguous=2 的 locale 开关**——#3301（① ② ③ 在 CJK locale 的
  Windows Terminal 上重叠）仍开着，**修复 PR #3554 至今未合**；#2587（CJK 溢出终端宽度）、
  #3753（中文输入法下输入框卡顿）、#2776（**中英混合大段粘贴整个 TUI 冻结**，跨三平台复现、
  逐字输入不触发）**都还开着，且 #2776 没有已知解法**。
- **Pi / Kimi 共用的 IME 方案**：`Focusable` + 零宽 APC 标记 `CURSOR_MARKER`，把**硬件光标**
  定位到假光标处供终端追踪候选窗；README 专门警告容器组件不透传 `focused` 会让
  **中日韩候选窗出现在错误位置**。
- **Claude Code**：**有 IME 处理，且有公开证据**——changelog `2.1.160` 字面提到 "CJK IME composition"，
  issue #1547 仍 OPEN（261 反应）。
  ⚠️ **本轮在这里犯过一次错并已更正**：用带边界探针查二进制里的 `IME`，词边界匹配为 0，
  一度被写成「未找到 IME 处理证据」。**子串判定没错，但探针词选错了**——
  实现侧用的词是 `composition` / `extendedKeys` / `win32InputMode`，`IME` 这个缩写根本不作标识符出现。
  **探针词不是实现者会用的词时，负面结论没有任何强度。**这比子串假阳性更隐蔽。

- **适用范围**：各条强度不同——Kimi 与 Pi 的是「正面读到了机制」，Codex 的 issue 状态是
  `gh api` 读到的原文。**不支持**推广为「这些产品不能输入中文」。
- **代价与不适用**：**这两个缺口目前都没有已知解法**：Kimi 的 ambiguous width 修复 PR 未合、
  大段粘贴冻结无维护者回应；Codex 的 12 条 IME issue 无一关闭。
- **撞上这条事实会怎样**：以中文为主要输入语言的场景，会在**组合态**（拼音候选未上屏时）
  与**东亚 ambiguous 宽度字符**上遇到重绘、光标位置与列对齐三类问题，
  而这三类在纯 ASCII 的测试里都不会暴露。
- **来源**：Codex 报告 §5.3；Kimi 报告 §2.5、§5.1；Pi 报告 §2.5；Claude Code 报告 §2.4、§7.1。
- **最近核对**：2026-09-21。

### 十、差分原地重绘与屏幕阅读器在范式上冲突，无已知解法

- **Kimi #1846（open，无维护者回应）**原文：「Menus already render a `❯` text marker (not color-only),
  but pi-tui's differential redraw makes position changes invisible to screen readers…
  **In other words, blind people cannot tell where the cursor is positioned.**」
  评论里附了一份 NVDA 冻结报告。请求者提的方向（append-only 线性输出模式）**未实现也未被回应**。
- **Codex**：#17552（`accessibility,bug,TUI,CLI`，open）——审批提示在屏幕阅读器下反复重播且读不出来，
  报告者原话「I had to guess the prompt content and answer based on trust」；
  #28637（open）——VoiceOver 焦点被困在输入框里，**读出的是 Rust 内部结构体名 `MaybeHoverSecret`**。
  已做的只有 PR #46040「检测到屏幕阅读器时默认关闭动画」。
- **Claude Code** 有 `--ax-screen-reader`（原文：`Render screen-reader friendly output
  (flat text, no decorative borders or animations)`）；**Cursor** 有 `INK_SCREEN_READER` 且
  开启时**渲染完全不节流**。
- **Pi**：三处全量 grep `accessib` / `a11y` / `screen.reader` / `screenreader`，**零命中**。

- **适用范围**：**不支持**推广为「这些产品完全不可用于屏幕阅读器」——两家提供了专门的扁平输出模式。
  支持的是：**在差分原地重绘这个范式下，位置变化对屏幕阅读器不可见**，
  而两家给出的解法都是「换一种输出模式」而非在该范式内解决。
- **代价与不适用**：提供扁平模式意味着**维护第二条输出路径**；不提供则该用户群不可达。
  Pi 的零命中是「读遍了该读的地方没找到」，不是构造反例。
- **撞上这条事实会怎样**：任何「只靠原地重绘更新位置指示」的界面，在屏幕阅读器下都是静默失效——
  不报错，用户只是不知道光标在哪。
- **来源**：Kimi 报告 §5.1；Codex 报告 §5.6；Claude Code 报告 §2.6；Cursor 报告 §2.5；Pi 报告 §5.5。
- **最近核对**：2026-09-21。

### 十一、公开的 TUI 性能数字是真空，而至少四家在内部持续测量

**六家没有一家公布过带测法的 TUI 性能数字。**这是检索结论不是没查——各路都列明了检索位置。
同时，**内部测量能力普遍很强**：

- **Claude Code**：`CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER`（专门测到第一帧）、`PROFILE_STARTUP`、
  `FRAME_TIMING_LOG`、**自建 Perfetto 追踪**、布局计数器 `lastYogaCounters={ms,visited,measured,cacheHits,live}`、
  遥测事件 `tengu_flicker` / `tengu_flickering_rain`。
- **Cursor**：40+ 个启动 performance mark；**5 秒内 `clearScreen` 超 4 次就上报 Datadog**；
  render stall watchdog；隐藏命令 `repaint-debug`——**用 node-pty 拉起自己、自建单元格级终端模拟器
  做前后帧 diff，产出 `changedCells`/`touchedRows`/`escapeSequenceCount` 并 SSE 推到内嵌 HTML 可视化页**。
- **Pi**：`profile:tui`、`PI_TUI_WRITE_LOG`、`fullRedraws` 计数器、两个 TUI benchmark 脚本
  （**测法写得很细但仓库里没有留下任何基线数字**）。
- **Codex**：仓库内唯一的 e2e 基准是反复 spawn `codex --help`，**测的是进程启动 + clap 解析，不是渲染**；
  `find codex-rs -path '*/benches/*'` 只有 2 个，均非渲染。

- **适用范围**：**不支持**把各家散落的数字并成一张表。
  尤其**不能把配置常量当测量值**：Claude Code 的 16 ms / 4 ms / 50 ms / 16 KiB / 250 ms、
  Kimi 的 16 ms 帧上限与 50 ms delta 合批，都是**目标与阈值**。
- **代价与不适用**：这意味着**任何关于这些产品渲染性能的横向说法目前都没有可引用的一手来源**。
  本轮可引用的带测法数字只有三处，且都不是维护者复核过的：Pi 的 #6665（流式占 ~105% 单核）与
  #9549（regular 模式每次 resize 向 stdout 写 3.9–5.2 MB，测法写明「wrapping `process.stdout.write`
  + sampling `process.cpuUsage()` deltas over 5 s windows」），以及 pi-tui changelog 的
  **「~9-18x alternate-screen render-churn reduction」**——后者**必须带三条限定**：
  只适用 alt-screen 路径、只测分配量 churn 不是帧率/延迟、输出写进 `NullTerminal` 不含真实终端绘制成本。
- **撞上这条事实会怎样**：引用聚合站或媒体转述的「启动只要毫秒」「内存只有几分之一」，
  会追溯到 Codex 那份公告里**没有任何数字的定性表述**。
- **来源**：各家报告 §6；[本机实测](reports/2026-09-21-本机实测.md) 提供了本轮唯一的同口径数字。
- **最近核对**：2026-09-21。

### 十二、闪烁与重绘是这一代最顽固的缺陷类，且是长尾

- **Claude Code #769**「In-progress Call causes Screen Flickering」——**OPEN，2025-04-12 至今，
  307 评论 / 335 反应**，标签 `area:tui, oncall`；#826（**354 评论 / 822 反应**）等一批 `area:tui` 仍开着；
  #21567 是**渲染器 CPU 空转**（「100% CPU with 625K writes/0 blits」）。
- **Cursor**：SSH/tmux 上「屏幕抽搐」仍开着，官方 2026-07-31 复现、2026-09-02 称 in progress、
  报告者 2026-09-08 确认仍坏；tmux 切 pane 重画全历史致负载尖峰的帖子从 2026-04 开到 2026-08，
  用户明说「**Claude and Codex do not exhibit this behavior**」。
- **Codex**：resize/reflow 一组（#37987、#25622、#39268）全 open；#37987 给出量化复现——
  `codex resume` 一个 4605 行会话，replay 期间触发 resize，可视行数**从 76 永久掉到 51**。
- **Kimi**：#2324 resize 闪烁（两个独立宿主 + GIF）、#2776 大段粘贴冻结，均 open。

- **适用范围**：issue 状态是各路在 2026-09-21 读到的。**不支持**按 issue 数量比较谁做得差——
  各家 tracker 的收口方式差别极大（**Pi 的 issue 会被机器自动关闭**，DSH 根本不用 Issues 收 bug）。
- **代价与不适用**：这些不是孤立 bug，而是结论三那条路线的下游。Codex 的 resize 一组
  与其 `streaming/controller.rs` 里写明的「**intentionally avoids byte-level remap complexity
  while the stream is active**」是同一取舍的两面。
- **撞上这条事实会怎样**：把闪烁当作「调一调就好」的表层问题，会在 SSH / tmux / 低速链路 /
  大 transcript 这四个条件叠加时反复撞回同一处；这四家用了 17 个月都还没收敛。
- **来源**：各家报告 §5。
- **最近核对**：2026-09-21。

### 十三、终端不是唯一界面；而把人移出终端，不等于不再依赖终端

- **DSH 把 TUI 整包删了**，`apps/cli` 自述为 "dsh CLI: profile boot, plugin management,
  **and the browser UI alias**"，其 `src` 只有 **6 个 `.ts` 共 968 行**。
  **删除理由不是「浏览器更好」**——原文是「Keeping that surface required maintaining a
  **product-sized frontend whose only remaining consumer was the project generator itself**」，
  作者全程没有论证 Web 在交互上优于终端。**这一点容易被读反。**
- **Kimi** 并行提供 `web`（本地 server + Web UI）与 `vis`（会话可视化），
  且其 TUI 与 Web **面对同一套类型化契约**（`packages/klient`），TUI 走进程内内存传输、Web 走 HTTP/WS。
- **但 DSH 仍然假设开发者的工作环境是终端**：它吃 `AGENTS.md`/`CLAUDE.md`（65,536 字节预算）、
  吃别家的 `hooks.json`、还有一个 `dsh-tmux-context` 包让模型识别自己所在的 tmux 会话与 pane 树。
  更激进的是：**它把 Claude Code 与 Codex 当子进程整个跑**——
  `subagent-claude-code` 钉 `@anthropic-ai/claude-agent-sdk@0.3.263`、
  `subagent-codex` 钉 `@openai/codex@0.153.4`，并为此在 `THIRD_PARTY_NOTICES.md` 专设授权声明。

- **适用范围**：只对这两家的这两个版本成立。**不支持**推广为「终端界面不必要」——
  另外四家都把终端当主界面并为此投入了可观工程。
- **代价与不适用**：DSH 把代价写在自己的 Consequences 里：依赖该包的 import 与 `cordis.yml` 行
  「**fail instead of being translated**」，不提供兼容层。外部代价是**生态立刻补洞**：
  官方 Discussion #3715 里第三方原话「The official `dsh` ships a web UI and a one-shot headless mode,
  **but no interactive terminal agent.**」，至少四个第三方 TUI 项目出现。
  搬去浏览器还带来一条本轮实证的接口事故：**CLI 的一行 stdout 事实上成了第三方的接口契约**——
  Cherry Studio #20119：启动 URL 加 token、根路径加 cookie 认证之后，对方基于「裸 URL + 200」的
  就绪检查直接失效。另有两条硬约束：**明确拒绝 `--host 0.0.0.0`**（原文
  「it would expose remote code execution to the network」），以及 SSH 下只打印 URL、
  **端口转发完全留给用户，仓库里没有任何自动转发或无浏览器降级方案**。
  兼容别家的代价也被 DSH 自己列到字段级：**Claude Code 的 30 个 hook 事件不支持 23 个、
  Codex 的 10 个不支持 5 个**，且并发语义、分层配置发现、热重载均未实现。
- **撞上这条事实会怎样**：把界面放到浏览器，SSH / 无图形 / 容器环境就需要额外的端口转发与信任决策；
  而 CLI 打印的任何一行结构化文本，一旦被下游解析，就成了不能随意改的接口。
- **来源**：DSH 报告 §1、§2.1、§3.1、§3.6、§4.1–4.2、§5.2；Kimi 报告 §3.1（派发者已复核钉版依赖与 968 行）。
- **最近核对**：2026-09-21。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 本机安装的四个 CLI 与其官方分发一致（未被本地改过） | 结论六的全部数字 | **未核对**。未校验官方签名或 checksum |
| Cursor 的 webpack 模块 ID 忠实反映其源码树结构 | 结论一、八里 Cursor 的全部条目 | **未核对**，且无法核对（闭源）。该路报告已声明这一不确定度 |
| 各路读到的 GitHub issue 状态在取证当日为真 | 结论九、十、十二的 open/closed 分类 | 各路声明经 API 或页面读取；派发者**未独立复现** |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查 | 受影响的结论 |
|---|---|---|
| **TUI 首帧延迟、帧率、大输出滚动的横向数字** | 在受控环境用 pty 驱动，测「启动到首帧」与「注入 N 行输出后的稳态帧耗时」；需先解决「启动交互会话会触碰认证与额度」这一障碍 | 结论六只覆盖非交互启动；结论十一指出这一整块无公开数据 |
| **Kimi 启动 0.21 s（v0.6.0/darwin）与 1242 ms（0.31.0/linux）的差异** | 在同一台机器上取多个 Kimi 版本同口径重测 | 结论六的跨源差异声明 |
| **六家的 ACP 支持情况** | 换特征串重测（包名、子命令、协议方法名）；已知 Kimi 用 `@agentclientprotocol/sdk@0.23.0`、Cursor 用 `0.14.1`、DSH 有 `packages/acp` | 本轮无 ACP 结论 |
| **Codex 的 crossterm fork 相对上游改了什么** | 对 rev `45fecb95` 与上游 0.29.0 做 diff | 结论一里「不透明依赖」一条 |
| **各家 IME 组合态的真实行为** | 在真实终端 + 中文输入法下构造复现（本轮禁止启动交互会话，未做） | 结论九目前只到「读到机制 / 读到 issue」 |
| **Claude Code 其余 7 个平台的二进制体积** | 拉取各平台 npm 包 | 其 `install.cjs` 注释写 `~500MB` 与 linux-x64 实测 223 MiB 对不上，原因未查明 |
| **中文社区对 Kimi 的深度分析** | 换通道获取正文（知乎 403、腾讯云社区正文未返回） | 结论一、九的 Kimi 部分缺一类独立视角 |

## 采用与后续核对

本轮**尚无消费者**（见页首）。研究只给约束不给方案：该怎么设计归
record/proposals 与 record/decisions。

后续核对时，先 `grep` [evidence.md](evidence.md) 里的版本 token
（`0.154.0` / `2.1.278` / `2026.08.04-aaa8809` / `0.31.0` / `c291e796` / `890f9208`）定位需要重测的记录；
触及上述任何一条结论时，按 [演进事件词](../README.md#演进事件词) 记一条，**不要原地覆盖**。
特别注意**「版本失效」与「推翻」这一刀**：六家迭代极快（本机 Codex `0.154.0` 就精确命中两条仍开着的
版本回归；Kimi `0.31.0` 与其上游 HEAD 在 alt-screen 上已经分叉），**多数变化会是版本失效而非推翻**。
