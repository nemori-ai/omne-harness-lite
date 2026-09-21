# Claude Code 的 CLI/TUI：一个被 Bun 编译成 223 MiB 单文件原生可执行的 React 19 + Ink 终端应用；Ink 的渲染后端与 Yoga 布局引擎都已被 Anthropic 换掉，闪烁问题追了 17 个月仍然开着

> 本报告的一手证据有三条独立来源：(1) 对本机 `@anthropic-ai/claude-code` **2.1.278** 原生二进制做符号表/节区/特征串取证；(2) 官方 `CHANGELOG.md`（401 个版本、7,158 行）与 `code.claude.com/docs`；(3) `anthropics/claude-code` GitHub issue tracker（92,995 issues / 11,532 open）与 npm registry。
> **二进制结论与官方 changelog 在关键点上互相独立印证**（见 §1.5）。所有结论绑定 2.1.278。**本报告只给约束，不给方案。**

---

## 0. 调查对象与取得方式

| 项 | 值 |
|---|---|
| 调查对象 | Anthropic Claude Code CLI/TUI 实现层 |
| 精确版本 | `2.1.278`（`claude --version` 实测：`2.1.278 (Claude Code)`）；npm 发布时间 **2026-09-19T01:48:59.758Z** |
| 本地路径 | `/data/qiwei/.local/share/fnm/node-versions/v24.18.0/installation/lib/node_modules/@anthropic-ai/claude-code`（下文记 `$PKG`） |
| 原生二进制 | `$PKG/node_modules/@anthropic-ai/claude-code-linux-x64/claude`，与 `$PKG/bin/claude.exe` 为**同一 inode 硬链接**（inode 18093568，link count 2） |
| 二进制规格 | ELF 64-bit LSB, x86-64, dynamically linked, BuildID `83effae1a76aa74ce70326f83068a1242f99094a`, `not stripped`，**234,119,480 B（223.3 MiB）** |
| 抓取日期 | 2026-09-21 |
| 只读语料 | `~/.claude/`（settings、projects、paste-cache 等），全程只读，未写入未修改 |
| 非交互调用 | 仅 `--version`、`--help`（符合 BRIEF 三·2）。**未启动交互会话、未发起模型请求、未自行做性能基准** |
| 网络一手 | 官方 `CHANGELOG.md`（raw，746 KB / 7,158 行 / 401 版本号）、`code.claude.com/docs/en/*`、GitHub REST API（`gh`，已认证）、`registry.npmjs.org` |

**证据强度自评**

- **最强（双源互证）**：Yoga 被换成纯 TS 实现、Bun 是内嵌运行时、Ink 仍在使用。这三条**二进制取证与官方 changelog 各自独立得出同一结论**。
- **强（一手可复现）**：分发形态、体积构成、帧调度常量、终端模式表、环境变量与遥测事件名、issue 编号与状态、npm 各平台体积。
- **中**：动机。二进制读不到「为什么」；`install.cjs` 注释和 Boris Cherny 的访谈提供了部分自述，但**渲染架构选择没有任何官方解释**。
- **弱 / 已被推翻**：我基于二进制得出的「无 IME 处理」这一负面结论**被外部证据推翻**，见 §7.1，这是本轮最需要交代的一次取证失败。

---

## 1. 技术栈

**结论：2.1.278 是 `bun build --compile --bytecode` 产出的单文件原生可执行，JS 引擎是 JavaScriptCore（不是 V8，不是 Node SEA）；应用层是 TypeScript + React 19 + Ink，但 Ink 的渲染后端与 Yoga 布局引擎都已被 Anthropic 自己的实现替换；ripgrep 以 Rust 目标码静态链入同一文件。**

### 1.1 运行时：Bun v1.4.3 + JavaScriptCore（二进制实证 + 官方 changelog 互证）

ELF 节区表是最硬的证据——节区名在链接期写入，不受 minify 影响：

| 节区 | 大小 | 占文件 |
|---|---:|---:|
| `.bun` | 145,887,974 B (139.13 MiB) | 62.3% |
| `.text` | 61,747,804 B (58.89 MiB) | 26.4% |
| `.rodata` | 21,321,972 B (20.33 MiB) | 9.1% |
| `.bun_builtins` | 2,619,879 B (2.50 MiB) | 1.1% |
| `__DATA,__wtf_config` | 16,384 B | — |
| `__DATA,__jsc_opcodes` | 16,384 B | — |

`.bun` / `.bun_builtins` 是 Bun 单文件编译产物的标志节区；`__DATA,__wtf_config` 与 `__DATA,__jsc_opcodes` 是 JavaScriptCore 的 WTF 基础库与字节码解释器节区。版本串：

```
Bun v1.4.3 (8c28b3167) Linux x64
bun/1.4.3 npm/? node/v26.3.0 linux x64
```

> 第二行的 `node/v26.3.0` 是 **Bun 伪装的 npm user-agent**，不代表这里跑着 Node。看到它就判定 Node 会直接错。

**官方独立印证**（CHANGELOG，一手）：

> `2.1.181` — "**Upgraded the bundled Bun runtime to 1.4**"

即 Anthropic 自己把 Bun 称作 "the bundled … runtime"。另有 `2.1.91`（"faster `stripAnsi` on Bun by routing through `Bun.stripANSI`"）、`2.1.117`（"`NO_PROXY` … when running under Bun"）、`2.1.0`（"native installer or Bun"）。

**明确排除 Node SEA 与 V8**（带边界特征串，全二进制计数）：

| 特征串 | 命中 | 判读 |
|---|---:|---|
| `NODE_SEA_BLOB` / `NODE_JS_SEA` | **0 / 0** | 不是 Node Single Executable Application |
| `JSC::` | 1672 | JavaScriptCore（来自 `__PRETTY_FUNCTION__` 断言文本） |
| `WTF::` | 1059 | JSC 的 WTF 基础库 |
| `JavaScriptCore` | 99 | — |
| `v8::` | 23 | **不是真 V8**，见下 |
| `node::` | 2 | 同为兼容垫片 |
| `napi_`（dynsym） | 149 | Bun 导出的 N-API 符号 |

23 处 `v8::` **必须看上下文**，原文是：

```
Local<T> v8::HandleScope::createLocal(JSC::VM &, JSC::JSValue) [T = v8::Array]
Local<T> v8::HandleScope::createLocal(JSC::VM &, JSC::JSValue) [T = v8::Object]
```

第一个参数就是 `JSC::VM &`——这是 **Bun 把 V8 C++ ABI 映射到 JSC 之上的兼容垫片**（为 node-gyp 原生模块提供），不是 V8 本体。`node::MakeCallback` 同理。

符号表佐证：`readelf -sW` 共 2514 行、约 1486 个已定义符号；416 个 C++ mangled 符号**全部是 `_ZN2v8...` / `_ZN4node...`**，**`JSC`/`WTF` mangled 为 0，`YG*`（Yoga）为 0**。

> **需要更正一个常见误读**：`file` 报 `not stripped` 容易让人以为符号表完整。实际 `.symtab` 仅 30,552 B（约 1273 项），内容基本等于 `.dynsym`。**导出的 C++ 符号只有 Bun 为原生插件刻意暴露的 V8 ABI 表面**，不是调试符号。想「按符号还原实现」会落空。

工具链（`.comment`，一手）：`GCC 13.1.0` / `rustc 1.99.0-nightly (9f36de775 2026-07-19)` / `LLD 22.1.8` / `clang 21.1.5`。

**Bun 与 Anthropic 的关系**（一手，来自 Bun 侧）：Bun 创始人 Jarred Sumner，2025-12-02，<https://bun.com/blog/bun-joins-anthropic>：

> "**Claude Code ships as a Bun executable to millions of users.**"
> "Anthropic is investing in Bun as the infrastructure powering Claude Code, Claude Agent SDK, and future AI coding products."

> **约束**：Bun 自 2025-12-02 起归 Anthropic 所有，因此此后 Bun 对 Claude Code 的表述实际上是第一方表述——引用时不能当独立第三方佐证。

### 1.2 打包：约 1,897 个 chunk，全部预编译成 JSC 字节码（一手实证）

每个内嵌模块都带统一页眉页脚，完整原文：

```
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.
// Version: 2.1.278
var Mm=16,gCr=50,hCr=4,yCr=16384,i1n=250;
export{Mm,gCr,hCr,yCr,i1n};
// @bun @bytecode
```

| 标记 | 计数 | 含义 |
|---|---:|---|
| `/$bunfs/root/chunk-*.js`（去重） | **1,897** | 内嵌虚拟文件系统的 chunk 数 |
| `// @bun @bytecode` | 1,903 | **每个 chunk 都开了 bytecode 编译** |
| `Version: 2.1.278` | 1,901 | 每个 chunk 带版本戳 |

`/$bunfs/` 是 Bun 单文件可执行的内嵌虚拟文件系统前缀。`@bytecode` 说明构建用了 `bun build --compile --bytecode`：**JSC 字节码被预生成并与源码一起嵌入**，这是 `.bun` 节高达 139 MiB 的直接原因（源码 + 字节码两份）。

**官方印证**（CHANGELOG `2.1.243`）：

> "Improved memory usage of native builds: **code is now loaded on demand instead of keeping the whole bundle resident (roughly 40–70 MB less memory per session)**"

> **判断（非事实）**：bytecode 预编译换取启动时解析开销的减少，代价是体积。二进制不说明动机，这是从构建选项推的。

### 1.3 React 19 + Ink：仍在使用（三源互证）

**取证过程必须交代，因为第一轮探针给出的是假阴性。**

第一轮用「包路径类」特征串，**全部 0 命中**：`node_modules/ink/` = 0、`react-reconciler` = 0、`yoga-layout` = 0、`cli-truncate` / `ansi-escapes` / `string-width` / `wrap-ansi` = 0。

**这一组 0 不能得出「Ink 已弃用」**——Bun 打包器内联并 minify，包路径本就不会落进产物。换成 **minify 后能存活的运行时字面量**再测，结论反转：

| 特征串 | 命中 | 性质 |
|---|---:|---|
| `https://github.com/vadimdemedes/ink/#israwmodesupported` | **4** | **Ink 上游原样错误文案 + 作者仓库 URL** |
| `ink-text` / `ink-virtual-text` / `ink-box` / `ink-root` | 14 / 12 / 8 / 5 | Ink host element |
| `"react": "^19"` | 3 | React 主版本 |
| `Minified React error #` + `https://react.dev/errors/` | 有 | React 官方错误跳转模板 |
| React Scheduler 全套 `unstable_scheduleCallback` / `unstable_shouldYield` / `unstable_forceFrameRate` | 有 | React 调度器源码 |

**官方 changelog 独立印证**（一手，401 版本中唯一一次字面提到 Ink，且晚至 2.1.110）：

> `2.1.110` — "Fixed potential excessive memory allocation when piped (non-TTY) **Ink** output contains a single very wide line"
> `2.1.15` — "Improved UI rendering performance with **React Compiler**"
> `2.1.69` — "Fixed a memory leak where old message array versions accumulated in **React Compiler `memoCache`** over long sessions"
> `2.1.47` — "Fixed **React** crash (error #31) when a skill's `argument-hint` …"

**issue tracker 第三方印证**：#53200 "**Ink render panic** on Agent-Teams subagent spawn (createInstance cli.js:502:249, v2.1.119)"（closed 2026-04-25）。

> **必须纠正一个流传甚广的二手说法**：多个社区来源称「v2.0.10（2025-10）用自研渲染器替换了 Ink」。**changelog 的 `2.0.10` 原文只有一句 "Rewrote terminal renderer for buttery smooth UI"，全文未提 Ink**；而 `2.1.110` 仍在说 "Ink output"。**「2.0.10 替换掉 Ink」没有一手依据。**

**再纠正一次我自己的假阳性**：`ink-[a-z-]+` 泛匹配会捞到 `ink-local`、`ink-free`、`ink-repo`、`ink-register-failed`、`ink-cwd-b`、`ink-soft`——逐条看上下文，分别是 `link-local`、`link-free`、`deep-link-repo`、`deep-link-register-failed`、`deep-link-cwd-b`、CSS 变量 `--ink-soft` 的尾巴，**不是 Ink 元素**。

### 1.4 Ink 被改造到什么程度（一手实证）

从二进制读到的 reconciler 片段（原文，已 minify）：

```js
yogaNode: n!=="ink-virtual-text" && n!=="ink-link" && n!=="ink-progress" ? us.Node.create(s) : void 0
```
```js
if(n==="ink-text") f.yogaNode?.setMeasureFunc(M1.bind(null,f));
else if(n==="ink-raw-ansi") f.yogaNode?.setMeasureFunc(R1.bind(null,f));
```

经上下文确认的 host element：

| 元素 | 上游 Ink |
|---|---|
| `ink-root` / `ink-box` / `ink-text` / `ink-virtual-text` | 有 |
| `ink-link` | 上游是独立包 `ink-link`，这里是**内建 host 类型** |
| `ink-progress` | **上游没有** |
| `ink-raw-ansi` | **上游没有**，有专属 measure 函数 |

**上游 Ink 的 `<Static>` 机制不在**：`internal_static` / `ink-static` / `staticOutput` / `unstable__transformChildren` 均为 0。（强度：**读了这几个位置没找到**，非构造反例。）

同一渲染器类上出现大量上游 Ink 没有的字段：

```
frontFrame  backFrame  charPool  stylePool  lastPoolResetTime  lastAtlasResetAt  lastStyleLiveSize
pacerNow  lastPacedFrameAt  frameTimer  frameTimerDueAt  frameMicrotaskQueued
inputPriorityUntil  frameHeldForBacklog
lastYogaCounters={ms,visited,measured,cacheHits,live}
layoutFailed  consecutiveLayoutFailures  relayoutFromScratch  clearLayoutCache
scrollHint  scrollDrainNode  followScroll  layoutShifted  staleAbsolutePaint
selection  searchHighlightQuery  searchPositions  hoveredNodes  frameSink
altScreenParkPatch  loggedGarbageWinsize  nonBlockingStdout
```

`frontFrame`/`backFrame` = **双缓冲**；`charPool`/`stylePool`/`lastAtlasResetAt` = **对象池 + 样式 atlas**；渲染输出是**指令列表**而非字符串拼接；并存在 **cell 网格 + diff**（`new vf({x:0,y:S}, n.viewport.width)`、`C.diff`、`{width, cells, charPool}`、`prevScreen`）。

**官方印证**（`fullscreen` 文档，一手）：

> "Fullscreen rendering **sends only the cells that changed between frames.**"

> **判断（非事实）**：上游 Ink 的路径是「整树渲成字符串 → 与上帧字符串比 → `ansi-escapes` 擦行重画」。这里的 cell 网格、双缓冲、对象池、指令流与之不兼容，**因此渲染后端是被替换的，不是配置差异**。依据是这些字段与上游 API 不相交；**Anthropic 没有任何公开说明确认「fork」这个词**。

他们自己的日志文案里**仍然叫它 ink**（原文）：`ink layout pass threw (${u}): ${n.name}: ${n.message}`。

### 1.5 Yoga 被换成纯 TS 布局引擎 —— 本轮最强的一条（二进制 + changelog 双源独立互证）

**二进制侧（正面识别，非「找不到」）**：

```js
setPointScaleFactor(s){
  if(s!==0 && s!==1) throw Error("setPointScaleFactor: Int32 storage supports scale 0 or 1 only");
  n.pointScaleFactor = s
},
getErrata(){ return n.errata }, free(){},
isExperimentalFeatureEnabled(){ return !1 }, setExperimentalFeatureEnabled(){}, ... liveNodes: 0
```

`"setPointScaleFactor: Int32 storage supports scale 0 or 1 only"` **不是 Yoga 上游任何文案**——上游 C++ Yoga 支持任意 point scale factor（Retina 常用 2）。这是一个**保持 Yoga API 形状、内部用 Int32 存储的自研实现**；`free()` 空操作、`isExperimentalFeatureEnabled()` 恒假都是垫片特征。

排除其他实现形态：

| 形态 | 探测 | 结果 |
|---|---|---|
| 原生 C++ Yoga | `readelf -sW` 找 `YG[A-Z]`；`YGNode`/`YGMeasureMode`/`YGFlexDirection` 字面量；Yoga C++ 断言文案 | **全 0** |
| WebAssembly | 原始 wasm magic `\x00asm\x01\x00\x00\x00` | **0**（另有 11 处裸 `\x00asm`，**逐条 dump 确认全为文本假阳性**，如 `\x00asm regvar requests registe`、`\x00asm constraint %d`、`\x00asm\x00__asm\x00__asm__\x00extern`） |
| Emscripten/asm.js | `HEAPU8` `HEAPF64` `wasmMemory` `asmLibraryArg` `_emscripten` `wasmBinary` `instantiateWasm` `INITIAL_MEMORY` `dynCall` | **全 0** |

**官方 changelog 侧（完全独立地给出同一结论，并给出确切版本与动机）**：

> `2.1.85` — "Improved scroll performance with large transcripts by **replacing WASM yoga-layout with a pure TypeScript implementation**"

而且 changelog 还给出了**换掉它的前因**：

> `2.1.49` — "Fixed unbounded memory growth during long-running sessions caused by **Yoga WASM linear memory never shrinking**"
> `2.1.49` — "Fixed potential rendering issues caused by stale **yoga layout** references"
> `2.1.50` — "Improved startup performance for headless mode (`-p` flag) by deferring **Yoga WASM** and UI component imports"
> `2.1.69` — "Reduced baseline memory by **~16MB** by deferring **Yoga WASM** preloading"

> **这是本报告里最可靠的一条**：二进制取证（wasm 全 0 + 找到 JS 替代实现）与官方 changelog（2.1.85 明说换成 pure TypeScript）**各自独立得出同一结论**，且 changelog 解释了 WASM Yoga 的线性内存不回缩是被换掉的直接原因。我的「wasm magic = 0」由此得到完整解释。

保留的 API 表面：`Config.create()`、`Node.create()`、`calculateLayout`、`setMeasureFunc`、`getComputedWidth/Height/Left/Top`、`insertChild`、`getChildCount`、`markDirty`、`freeRecursive`、`clearLayoutCache`。

> **约束**：布局在主线程 JS 里跑，开销直接落在事件循环上。这解释了为何要为布局单独埋 `lastYogaCounters={ms,visited,measured,cacheHits,live}`，以及为何需要 `layoutFailed`/`consecutiveLayoutFailures`/`relayoutFromScratch` 这套容错——**布局会抛异常，且他们预期它会抛**（参见 §5 的 #2.1.228 / #2.1.277）。

### 1.6 ripgrep 静态链入（一手实证 + 一手自述）

Rust 目标码确实链入：`.comment` 有 `rustc 1.99.0-nightly`；`panicked at` ×9、`library/std/src` ×70、`library/core/src` ×37、`RUST_BACKTRACE` ×9、`called \`Option::unwrap()\`` ×3。ripgrep 模块路径：`ripgrep::search`、`ripgrep::flags::parse`、`RIPGREP_CONFIG_PATH`、`BurntSushi/ripgrep` ×4、`ripgrep` ×355、`ignore::` ×3。

最直接的是他们自己的用户文案（原文）：

> `… found on PATH. Install it (brew install ripgrep / apt install ripgrep / winget install BurntSushi.ripgrep.MSVC) **or use the native claude binary which embeds it**`

另有设置 `sandbox.ripgrep`（`{command, args}`）可覆盖成外部 rg。相关历史：CHANGELOG `2.1.117` — "Native builds on macOS and Linux: the `Glob` and `Grep` tools are replaced by **embedded `bfs` and `ugrep`** … (Windows and npm-installed builds unchanged)"。

### 1.7 分发形态与迁移时点（一手，npm registry + changelog）

**迁移发生在 2026-04-16 → 2026-04-17，一天之内**（npm registry 实测）：

| 版本 | 发布时间 | `bin` | unpackedSize | files | postinstall |
|---|---|---|---:|---:|---|
| **2.1.112（最后一个 JS 版）** | 2026-04-16T19:23:46Z | `{"claude":"cli.js"}` | **49,328,681 B（≈47 MB）** | 20 | 无 |
| **2.1.113（第一个原生版）** | 2026-04-17T19:09:22Z | `{"claude":"bin/claude.exe"}` | 132,292 B（≈129 KB） | 7 | `node install.cjs` |
| 2.1.278（本次） | 2026-09-19T01:48:59Z | `{"claude":"bin/claude.exe"}` | 184,119 B（≈180 KB） | 7 | `node install.cjs` |

官方 CHANGELOG 对这次切换**只有一句**（一手）：

> `2.1.113` — "Changed the CLI to spawn a native Claude Code binary (via a per-platform optional dependency) instead of bundled JavaScript"

> **这一句夹在一个 40 条目的 release list 中间，没有单独公告、没有理由说明、没有迁移指引。** 这是 401 个版本的 changelog 里关于这次分发形态变更的全部内容。

但迁移不是突然的——原生二进制早就作为**可选安装方式**存在，且 npm 弃用在 1 月就预告了：

> `2.0.13`（原生构建已存在）— "Fixed `/plugin` not working on **native build**"
> `2.0.33` — "**Native binary** installs now launch quicker."
> `2.0.71` — "New syntax highlighting engine for **native build**"
> `2.1.15` — "Added **deprecation notification for npm installations** - run `claude install` or see https://code.claude.com/docs/en/setup for more options"

**各平台实际体积**（npm registry 实测，unpacked，2.1.278）：

| 平台包 | unpacked |
|---|---:|
| `claude-code-win32-x64` | **226.2 MB** |
| `claude-code-linux-x64` | **223.3 MB**（= 本机实测 234,119,480 B） |
| `claude-code-linux-x64-musl` | 217.5 MB |
| `claude-code-linux-arm64-musl` | 216.1 MB |
| `claude-code-darwin-arm64` | **207.6 MB** |

> 这填上了我此前的一个缺口：`install.cjs` 注释里写 `~500MB binary`，而实测各平台都在 207–227 MB。**两者仍然对不上**；结合 `2.1.243` 的 "zstd-compressed (about 75 MB instead of **340 MB** on Linux x64)"，可知历史上下载体积曾达 340 MB。注释里的 `~500MB` **在本轮任何一手数据中都找不到对应**，原因未查明。

**wrapper 包本身不含产品代码**：2.1.278 tarball 完整内容仅 7 个文件（`cli-wrapper.cjs` 4,997 B / `install.cjs` 7,196 B / `bin/claude.exe` **500 B 的 shell stub** / `package.json` / `LICENSE.md` / `README.md` / `sdk-tools.d.ts` 167,766 B）。**没有 `cli.js`。** 那个 500 B stub 的全部内容是一条错误消息（原文）：

```
Error: claude native binary not installed.

Either postinstall did not run (--ignore-scripts, some pnpm configs)
or the platform-native optional dependency was not downloaded
(--omit=optional).
```

`package.json` 要点：`"dependencies": {}`（**零运行时依赖**）、`"engines": {"node": ">=22.0.0"}`（**只对 postinstall 生效**）、8 个 `optionalDependencies` 全部锁死 `2.1.278`。dist-tags：`latest: 2.1.278` / `next: 2.1.278` / **`stable: 2.1.267`**。

官方文档对这套模型的表述（一手，`/docs/en/setup`）：

> "The npm package installs the same native binary as the standalone installer. npm pulls the binary in through a per-platform optional dependency … and a postinstall step links it into place. **The installed `claude` binary does not itself invoke Node.**"
> "As of v2.1.198, the npm package requires Node.js 22 or later. On an older Node.js version, npm prints an `EBADENGINE` warning during install rather than failing; the install completes and `claude` still runs, **since the package downloads a native binary that doesn't use your Node.js at runtime**."
> "**Your package manager must allow optional dependencies.**"

安装渠道（`/docs/en/setup`，原生安装被标注 **"(Recommended)"**，npm 被降级到 "Advanced installation options"）：`curl -fsSL https://claude.ai/install.sh | bash`、`irm https://claude.ai/install.ps1 | iex`、`brew install --cask claude-code`、`winget install Anthropic.ClaudeCode`，以及 `downloads.claude.ai` 上的签名 apt/dnf/apk 源。官方硬件要求：**"4 GB+ RAM, x64 or ARM64 processor"**。

**Android 目标：代码里有，发布渠道没有。** `cli-wrapper.cjs` / `install.cjs` 的 `PLATFORMS` 表比 `optionalDependencies` 多 `linux-arm64-android` 与 `linux-x64-android`，代码有专门分支 `Native binaries for ${platformKey} are not available on this release channel.`；npm 上 `@anthropic-ai/claude-code-linux-arm64-android` **返回 404**。这是「代码说的」与「实际发的」分叉的一个具体点。

**旧 JS 路径是否还在：没有。** `cli.js` 在二进制里共 6 处命中，逐条看上下文**没有一处是 Claude Code 自己的 JS 入口**——分别是 Bun 自己的帮助文本、内嵌 lockfile 里 Playwright 的 `bin` 字段，以及一个**堆栈路径归一化白名单**：

```js
var Kd="<user-code>", yV=new Set(["cli.js","cli","sdk.mjs","browser-sdk.js","agentSdk.js"]), TV=/^chunk-[0-9a-z]+\.js$/
```

唯一存活的 JS 路径是**把版本钉在 `@anthropic-ai/claude-code@2.1.112`**（该 tarball 2026-09-21 实测仍可下载，HTTP 200）。

---

## 2. 交互范式与渲染

**结论：2.1.278 同时带着两个渲染器——`default`（经典主屏 inline）与 `fullscreen`（alt-screen + 虚拟滚动，官方称 flicker-free）。fullscreen 自 2.1.89 以环境变量引入、2.1.110 变成 `/tui` 命令、2.1.239 起对更多新装用户默认开启；经典渲染器仍在发布，并且是失败回退路径。**

### 2.1 双渲染器：官方原文

设置 schema 的 `describe()`（**二进制内原文**）：

```js
tui: G(["default","fullscreen"]).optional().describe(
  'Terminal UI renderer. "fullscreen" uses the flicker-free alt-screen renderer with virtualized scrollback (equivalent to CLAUDE_CODE_NO_FLICKER=1). "default" uses the classic main-screen renderer.'
)
```

官方文档 `/docs/en/fullscreen`（一手，本轮最重要的渲染自述）：

> "Fullscreen rendering is an alternative rendering path for the Claude Code CLI that **eliminates flicker, keeps memory usage flat in long conversations, and adds mouse support. It draws the interface on the terminal's alternate screen buffer, like `vim` or `htop`, and only renders messages that are currently visible. This reduces the amount of data sent to your terminal on each update.**"
> "**Only visible messages are kept in the render tree, so memory stays constant regardless of conversation length.**"
> "The difference is most noticeable in terminal emulators where **rendering throughput is the bottleneck, such as the VS Code integrated terminal, tmux, and iTerm2**."
> "Fullscreen rendering is a **research preview** … Behavior may change based on feedback."

**渲染器选择优先级**（`/docs/en/fullscreen` 原表顺序）：`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` 或 `CLAUDE_CODE_NO_FLICKER=0` → Classic；`CLAUDE_CODE_NO_FLICKER=1` → Fullscreen；**fullscreen 启动失败过 → Classic**；`tmux -CC` 或 SSH-to-Windows → Classic；已保存的 `tui` 设置 → 该渲染器；**"Your session fetches feature flags from Anthropic, and you first used Claude Code on or after May 6, 2026 → Fullscreen"**；其他 → Classic。

失败判定（原文）："A session has started successfully once it has drawn its first frame and then either stayed up for 10 seconds or you ended it with `/exit`, Ctrl+C, or Ctrl+D." 连续两次失败后不再尝试。并且明确承认旧行为有缺陷：**"Before v2.1.236, Claude Code kept starting sessions in fullscreen rendering after a failed start."**

**渲染器演进时间线**（CHANGELOG，一手）：

| 版本 | 事件 |
|---|---|
| `2.0.10` | "Rewrote terminal renderer for buttery smooth UI"（**未提 Ink**） |
| `2.1.89` | "Added **`CLAUDE_CODE_NO_FLICKER=1`** environment variable to opt into flicker-free alt-screen rendering with virtualized scrollback" |
| `2.1.97` | `Ctrl+O` focus view；同版另有 6 条 NO_FLICKER 修复 |
| `2.1.110` | "Added **`/tui` command and `tui` setting** — run `/tui fullscreen` to switch … in the same conversation" |
| `2.1.132` | "Added **`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`** … to keep the conversation in the terminal's native scrollback" |
| `2.1.236` | 修复「一次启动失败就永久失败」 |
| `2.1.239` | "**new installs there now start in fullscreen**"（扩展到 Bedrock/Vertex/Foundry） |

> 本机 `~/.claude/settings.json` 为 `"tui": "fullscreen"`。

### 2.2 终端模式协商：带优先级的模式栈（一手实证）

模式常量表（二进制原文）：

```js
MOUSE_BUTTON:1002, MOUSE_ANY:1003, MOUSE_SGR:1006, MOUSE_SGR_PIXELS:1016,
FOCUS_EVENTS:1004, BRACKETED_PASTE:2004, THEME_NOTIFY:2031,
SYNCHRONIZED_UPDATE:2026, WIN32_INPUT_MODE:9001
```

优先级表（原文）：

```js
var f={ bracketedPaste:0, themeReports:0, extendedKeys:0, altScreen:1,
        altScreenKeys:2, mouse:2, mousePixels:2, surface:3, focusEvents:4 }
```

管理器带 `set`/`reset`/`isSet`/`suspend`/`resume({clearKeys})`/`reassertKeys`/`reassertFrom`/`resetAll`。挂载顺序（原文）：

```js
this.props.stdout.write(u.set("bracketedPaste") + u.set("themeReports") + u.set("focusEvents"));
if (M()==="windows") this.props.stdout.write(ZIt);
this.props.stdout.write(u.set("extendedKeys"));
```

卸载逆序 reset，并**等待未回收的终端查询应答**：`if(this.querier && this.querier.owed()>0 && !this.appUnmounted) this.owedReplyHold = setTimeout(...)`。

> **约束**：终端状态被当作一份需显式拥有、可挂起、可重新断言、退出时要清账的资源。`suspend`/`resume` 说明它要在**把终端交给子进程**与拿回来之间反复切换。§5 显示这套清账**确实会漏**（`2.1.248`、`2.1.238`、`2.1.260`）。

**同步输出（DEC 2026）是抗闪烁的核心机制**，官方原文（`/docs/en/fullscreen`）：

> "**Claude Code probes the terminal for synchronized-output support at startup and uses it when the terminal reports it.**"

他们还**解析子进程吐出的转义序列**（二进制原文）：

```js
var T=new Set([1000,1002,1003,1004,1006,2004,2031]), D=/\x1b\[\?([\d;]+)([hl])/g;
ni=new Set("ABCDEFGHJKLMPSTXZ@`adefm"), ii=new Set(["1049","1047","47"]),
si=/\x1b\[(?<params>[<-?]?[0-;]*)(?<intermediates>[ -/]*)(?<final>[@-~])|\x1b[\]PX^_][^\x07\x18\x1a\x1b\x9c]*.../
```

> **判断（非事实）**：这是对工具输出做 ANSI 净化、并对子进程改过的私有模式做记账/还原。依据是这些集合与正则；二进制未说明意图。

已确认的转义序列（原始字节计数）：`ESC[?1049h` ×1、`ESC[?2026h` ×2、`ESC[?25l`/`?25h`、`ESC[?1000h`、`ESC[?1006h`、OSC 52（剪贴板）×4、OSC 8（超链接）×17、OSC 11（背景色查询）×1、`ESC[6n` ×2、`ESC[c`（DA1）×1。

> `ESC[?2004h` 的**原始字节为 0**，但 `bracketedPaste` 出现 34 次、常量 `BRACKETED_PASTE:2004` 存在——序列由 `function FH(E){return Xi(\`?${E}h\`)}` **运行时拼装**。**又一个「0 命中不等于不存在」的例子。**

alt-screen 不是整 app 一把梭，而是 **React 组件**，来自他们自己的告警（原文）：`alt-screen: yoga height ${Y} > terminalRows ${T} — something is rendering outside <AlternateScreen>`。

### 2.3 帧调度：精确常量（一手实证）

```js
queuePacedFrame(){
  this.cancelScheduledFrame();
  if(this.nonBlockingStdout!==null && this.nonBlockingStdout.queuedBytes() > yCr){
    this.frameHeldForBacklog=!0; this.frameTimerDueAt=this.pacerNow()+i1n;
    this.frameTimer=setTimeout(()=>{this.frameTimer=null,this.queuePacedFrame()}, i1n); return
  }
  this.frameHeldForBacklog=!1; this.frameMicrotaskQueued=!0; ...
}
requestInputPriorityFrame=()=>{ this.inputPriorityUntil=this.pacerNow()+gCr };
scheduleFrame(){
  if(this.frameMicrotaskQueued)return;
  let n=this.pacerNow(), s=n-this.lastPacedFrameAt, u = n<this.inputPriorityUntil ? hCr : Mm;
  if(s>=u){ this.queuePacedFrame(); return } ...
}
```

| 常量 | 值 | 作用 |
|---|---:|---|
| `Mm` | **16** ms | 默认帧间隔 ≈ **60 fps 上限** |
| `hCr` | **4** ms | 输入优先期内帧间隔 ≈ 250 fps |
| `gCr` | **50** ms | 一次按键后的「输入优先窗口」 |
| `yCr` | **16384** B | stdout 待写字节阈值，**超过就压帧** |
| `i1n` | **250** ms | 因 backlog 压帧后的重试间隔 |

另有 `Ks=8192`（`calculateLayout(Ks)` 可用宽度哨兵）、`ib=5`（同会话最多 5 条布局故障日志）。

> **约束**：16 KiB 的 backlog 阈值说明**渲染对终端写入做背压**——终端或 ssh 管道排不动时主动降帧，而非继续堆输出。代价是慢速链路上 UI 更新会被**有意**延迟到 250 ms 粒度。
> 官方对应的一条优化（CHANGELOG `2.1.191`）：**"Reduced CPU usage during streaming responses by ~37% by coalescing text updates to 100ms"** —— 即流式文本另有 100 ms 合并窗口。

### 2.4 输入模型

二进制计数：`setRawMode` ×44、`isRawModeSupported` ×11（原文 `isRawModeSupported(){return this.props.stdin.isTTY}`）、`useInput` ×59、`Shift+Enter` ×49、`vimMode` ×30、`readline` ×103、`historySearch` ×27、`onPaste` ×37、`clipboard` ×186、`image/png` ×52。

**Shift+Enter 支持矩阵**（`/docs/en/terminal-config` 原表）：

| 终端 | Shift+Enter 换行 |
|---|---|
| Ghostty, Kitty, iTerm2, WezTerm, Warp, Apple Terminal, Windows Terminal | Works without setup |
| 其他支持 kitty keyboard protocol 的（foot、Alacritty ≥0.16） | Works without setup. Requires Claude Code v2.1.269 or later |
| VS Code, Cursor, Devin Desktop, Alacritty <0.16, Zed | Run `/terminal-setup` once |
| **gnome-terminal, JetBrains IDEs (PyCharm, Android Studio)** | **Not available; use Ctrl+J or `\` then Enter** |

**粘贴**（`/docs/en/terminal-config` 原文）：

> "When you paste **more than 800 characters or more than three lines** into the prompt, Claude Code collapses the input to a placeholder such as `[Pasted text #1 +120 lines]` … In a terminal window shorter than 12 rows the line limit drops."
> "**The VS Code integrated terminal can drop characters from very large pastes before they reach Claude Code, so prefer file-based workflows there.**"

折叠内容缓存在 `~/.claude/paste-cache/`（本机实测存在该目录，含 1 个 5,509 B 的 `.txt`）。

**编辑器与快捷键**：`keybindingFlavor` 设置在 `2.1.238` 引入、`2.1.261` **被宣布不再有任何作用**（"`keybindingFlavor` no longer has any effect"）。`2.1.208` 加了 `vimInsertModeRemaps`（`jj` → Escape）。

### 2.5 非交互 / headless

`--help` 与 `/docs/en/cli-reference` 一致的相关开关：`-p/--print`、`--output-format <text|json|stream-json>`、`--input-format <text|stream-json>`、`--include-partial-messages`、`--replay-user-messages`、`--include-hook-events`、`--forward-subagent-text`、`--json-schema`、`--max-budget-usd`、`--no-session-persistence`、`--permission-prompts <host|none>`。计数：`stream-json` ×142、`isNonInteractive` ×177、`isTTY` ×140、`headless` ×439。

`--print` 的原文警告（`--help`）：

> "The workspace trust dialog is skipped when Claude is run in non-interactive mode (via -p, **or when stdout is not a TTY**, e.g. piped or redirected output). Only use this in directories you trust. **Settings files that fail validation are silently ignored in this mode** (no error dialog is shown)."

`/docs/en/headless` 的两条硬限制（一手）：

> "**Piped stdin is capped at 10MB.**"
> "If your consumer reads the stream slowly, Claude Code waits for the queued output to drain before exiting, **scaling the wait with how much is still queued, capped at 30 seconds. Before v2.1.214 the exit wait was capped at about two seconds, which could cut off the end of a large response.**"

以及 TUI 与 headless 的关系自述：

> "The Agent SDK gives you the same tools, agent loop, and context management that power Claude Code." / "Built-in commands that only run in the terminal interface, such as `/login`, aren't available."
> "`--bare` is the recommended mode for scripted and SDK calls, and **will become the default for `-p` in a future release**."

`sdk-tools.d.ts`（167,766 B / 4,153 行 / 88 个导出类型）是 **`json-schema-to-typescript` 自动生成**产物，头部原文：`This file was automatically generated by json-schema-to-typescript. DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file` / `JSON Schema definitions for Claude CLI tool inputs`。

> **约束**：工具契约的权威源是 **JSON Schema**，TS 类型是投影产物；CLI 与 SDK 共用同一份。

### 2.6 可访问性与主题

- `--ax-screen-reader`（原文）：`Render screen-reader friendly output (flat text, no decorative borders or animations).` CHANGELOG `2.1.208` 引入，另可用 `CLAUDE_AX_SCREEN_READER=1` 或设置 `"axScreenReader": true`。
- `NO_COLOR` ×20、`FORCE_COLOR` ×38、`COLORTERM` ×21、`truecolor` ×27、`ansi256` ×36、`prefers-reduced` ×18。
- **主题**：`THEME_NOTIFY:2031`（DEC 2031 配色变更通知）+ OSC 11 背景色查询 + `themeReports` 模式 → 自动明暗探测。自定义主题为 `~/.claude/themes/` 下的 JSON，`base` 取值 `dark`/`light`/**`dark-daltonized`**/**`light-daltonized`**/`dark-ansi`/`light-ansi`（含色盲友好档）。官方原文："**Unknown tokens and invalid color values are ignored, so a typo cannot break rendering.**"（注意 §5 有一条 `2.1.277` 修复「`theme` 值畸形导致启动崩溃」，**与这句文档陈述存在张力**。）
- 终端内嵌图片：`terminalImages` ×14、`CLAUDE_CODE_FORCE_TERMINAL_IMAGES`、`kitty graphics` ×6；**`sixel` = 0、`]1337;File=` = 0、`_Gf=` = 0**。本轮**未能确证**实际走哪条图片协议。

---

## 3. 工程实践与设计品味（含作者自述）

**结论：能取到的作者自述集中在「技术选型为什么是 TS+React」和「打包为什么这么做」；关于渲染架构为何被重写、为何迁到原生二进制，唯一的一手理由是一条 GitHub COLLABORATOR 回帖，官方 changelog 与文档都没有给理由。**

### 3.1 Boris Cherny（Claude Code 创建者）的自述 —— 一手，最有价值

来源：Latent Space 播客 "Claude Code: Anthropic's Agent in Your Terminal"，Boris Cherny + Cat Wu（PM），页面标注 2025-05-07，<https://www.latent.space/p/claude-code>。
> ⚠️ 这些引文经由摘要式抓取层取得，**引文可靠性标为「中」**；若要在正文引用建议回原始 transcript 复核。

**论 Ink（本轮最值钱的一句）：**

> "**Ink is amazing. It's sort of hacky and janky in a lot of ways. It's like you have React and then the renderer is just translating the React code to like ANSI language.**"

**论 Bun：**

> "We use Bun. So big fans of Bun. That's been, it makes writing our tests and running tests much faster."
> "**We use Bun to compile the code together.**"

**论「为什么是终端」：**

> "Because it runs in the terminal, it has access to a bunch of stuff that you just don't get if you're running on the web or on desktop."
> "We think of it as like a Unix utility. … The same way you can compose code into workflows."
> "**Claude Code is not a product as much as it's a Unix utility.**"

来源：The Pragmatic Engineer, Gergely Orosz, "How Claude Code is built", 2025-09-23，<https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built>（引文可靠性「中」）：

> "**TypeScript and React are two technologies the model is very capable with, so were a logical choice.**"
> "With an off-distribution stack, the model can still learn it. But you have to show it the ropes and put in the work. **We wanted a tech stack which we didn't need to teach: one where Claude Code could build itself.** And it's working great; around 90% of Claude Code is written with Claude Code"
> "**With every design decision, we almost always pick the simplest possible option.** … So we went with this: Claude Code runs batch commands locally, and reads and writes to the filesystem. **There's no virtualization**"
> "Every time there's a new model release, we delete a bunch of code."

> **这是本轮最重要的设计品味证据**：TUI 技术栈的选型理由**不是终端渲染的技术优劣，而是「模型对这套栈最熟，所以 Claude Code 能自己写自己」**。
> **注意时效**：这篇 2025-09 的文章把 npm 描述为分发方式（"npm is used for distributing Claude Code. It's the most popular package manager in the Node ecosystem."）并称 Yoga 是 "the layout system, open sourced by Meta"——**两者都已被 2.1.113 与 2.1.85 推翻**。引用时必须标明它描述的是迁移前的状态。

### 3.2 打包层的自述（一手，`install.cjs` / `cli-wrapper.cjs` 未混淆注释）

这两个文件是本轮最干净的作者自述：

> `// … `claude` execs the native binary directly — **no Node.js process stays resident.**`
> `// Try hardlink first (instant, zero extra disk for a ~500MB binary; …)`
> `// Read the stub before unlinking so we can restore it if both link and copy fail (ENOSPC, NFS error mid-500MB-copy).`
> `// The .exe extension + no-shebang stub makes npm's cmd-shim … emit a direct exec on Windows; Unix ignores the extension. **Same pattern as Bun's npm package.**`
> `// It exists for environments where postinstall doesn't run (--ignore-scripts) — users can run `node cli-wrapper.cjs` directly **and pay the Node-process overhead as the price.**`
> `// Rosetta 2: … Prefer the native arm64 binary — **the x64 build needs AVX, which Rosetta doesn't emulate.**`
> `// process.report … Faster than spawning `ldd` and avoids the ENOENT→musl false positive when ldd isn't on PATH (minimal containers).`
> `// Node.js ignores some signals (e.g. SIGPIPE → SIG_IGN), so re-raising is unreliable. Exit with the POSIX convention 128+signum instead.`

可直接读出的取舍：**常驻进程为零**、**接受巨型单文件并用硬链接规避二次占盘**、**为 `--ignore-scripts` 留降级路径且明说代价**、**照抄 Bun 自己的 npm 打包模式**、**优先原生 arm64 因为 x64 构建依赖 AVX**。

### 3.3 迁移到原生二进制的唯一一手理由

GitHub issue #50270 上 Anthropic COLLABORATOR `ant-kurt` 的回帖，2026-04-23（一手）：

> "Claude Code 2.1.113 has switched to a native executable (after npm deprecation was announced in January), **which drops support for some platforms. We may add support for Android in the future - this requires either a [bun](https://github.com/oven-sh/bun) target for `android-arm64` or static musl.**
> You can pin to the last JS bundle release https://www.npmjs.com/package/@anthropic-ai/claude-code/v/2.1.112 to continue using Claude Code for now."

> **这是 issue tracker 上唯一一条 Anthropic 作者关于这次迁移的表态**，而且它说的是**代价**（掉平台支持）与**绕路**（钉 2.1.112），不是收益。**没有任何官方材料说明迁移到原生二进制换来了什么。**
> 已检索：401 个版本的官方 CHANGELOG、`code.claude.com/docs/en/{setup,fullscreen,cli-reference,headless,terminal-config,troubleshooting,overview}`、Anthropic 工程博客（以 `anthropic.com`/`claude.com` 限域搜索）、Latent Space、The Pragmatic Engineer、YC Startup Library —— **均未发现迁移理由的官方陈述**。

### 3.4 渲染层：做了什么很清楚，为什么没有自述

投入强度可从埋点密度看出：**自建 Perfetto 追踪**（`CLAUDE_CODE_PERFETTO_TRACE`、`initializePerfettoTracing`）、**帧计时采样**（`CLAUDE_CODE_FRAME_TIMING_LOG` + `_SAMPLE_EVERY`）、**重绘调试**（`CLAUDE_CODE_DEBUG_REPAINTS`）、**启动计时**（`CLAUDE_CODE_PROFILE_STARTUP`、`CLAUDE_CODE_EMIT_STARTUP_TIMING`、**`CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER`**、遥测 `spawn_ms` / `CCR_RUNNER_STARTUP_TIMING`）、**布局计数器**（`lastYogaCounters`）。

遥测事件名（二进制抽取）中与终端渲染直接相关的：

```
tengu_flicker                        tengu_flickering_rain
tengu_jediterm_scroll_bug_detected   tengu_scroll_arrows_detected
tengu_scroll_speed_set               tengu_scroll_summary
tengu_terminal_probe                 tengu_render_glyph_cardinality
tengu_tui_command  tengu_tui_optout_reason  tengu_tui_refused
tengu_bg_attach_first_frame          tengu_terminal_sidebar
```

滚动遥测字段：`{ jump_to_bottom_clicks, page_jumps, reached_scrollback_cap, scrolls }`。

> **有 `tengu_flicker` 这个事件名，说明闪烁被当作可上报指标跟踪**（事实）。上报条件本轮未取到。

**没有找到的**：二进制内没有任何解释渲染架构选择的散文；官方也没有发过 TUI 实现的工程博客（见 §3.3 检索清单）。

### 3.5 明确拒绝做什么（一手）

- **FreeBSD 不支持**：`FreeBSD is not natively supported on this version of Claude Code. Consider running under Linuxulator.`（对应 issue #61313 请求发布 freebsd 包，**已关闭**）
- **Android 代码里有、渠道里没有**（§1.7）
- **Rosetta 下不跑 x64 构建**（AVX）
- **`--ignore-scripts` 下不自动工作**，只留手动降级并明说代价
- **`setPointScaleFactor` 只接受 0 或 1**（自研布局主动收窄上游能力面）
- **`keybindingFlavor` 在 `2.1.261` 被宣布不再有任何作用**（引入后 23 个版本即废弃）

### 3.6 渲染器迁移是一场被度量的、有阻力的推广（一手实证）

```js
if(eo.length>0){ i("tengu_tui_refused",{uncarriable:!0}); ... }           // 状态无法跨渲染器搬运
if(Le()){ i("tengu_tui_refused",{active_tasks:!0,...}); return "Cannot switch renderers while work is run[ning]" }
h(`Already using the ${Se} renderer.`, {display:"system"})
"The setting was saved; restart Claude Code to apply it."
class c{ latched=!1; upsellImpression=void 0;
  latchFromEnv(){ ... this.mode = a.CLAUDE_CODE_TUI_TRIAL==="fullscreen" ? "fullscreen" : void 0; a.unset("CLAUDE_CODE_TUI_TRIAL") } }
(a.SSH_CONNECTION || a.SSH_CLIENT || a.SSH_TTY)                            // SSH 参与门控
```

退出新 TUI 时收集**自由文本理由**：`tengu_tui_optout_reason` 带 `{reason_length, feedback_id}`。

> **约束（事实）**：存在 `uncarriable`（状态无法搬运）与 `active_tasks`（有任务在跑不能切）两类硬拒绝，部分场景需重启——**两个渲染器不是运行时可自由互换的**。
> **判断（非事实）**：`upsellImpression` + `TUI_TRIAL` + `optout_reason` 的组合形态上是一次有阻力的迁移推广。这是从字段名推的，Anthropic 未说明。§5.2 的 #41965 / #41814 / #42670 提供了阻力的外部证据。

---

## 4. 实施取舍与代价

**结论：买到的是零依赖、零常驻 Node、ripgrep 内嵌、内存随会话长度持平；付出的是 207–227 MB 单平台体积、glibc ≥ 2.26 与 AVX 的硬件/发行版下限、一整套自维护的渲染与布局基础设施，以及一次性斩断了社区改 `cli.js` 做定制的生态。**

### 4.1 体积

| 项 | 值 | 来源 |
|---|---:|---|
| linux-x64 单文件 | **234,119,480 B = 223.3 MiB** | `stat` 实测（与 npm registry 一致） |
| 各平台区间 | **207.6 MB（darwin-arm64）～ 226.2 MB（win32-x64）** | npm registry |
| 迁移前 JS bundle（2.1.112） | **49,328,681 B（≈47 MB）** | npm registry |
| wrapper 包本体 | 184,119 B（≈180 KB），7 文件 | npm registry |
| 下载体积（zstd 后） | **约 75 MB**（此前 340 MB） | CHANGELOG `2.1.243` |
| 内嵌 chunk 数 | 1,897 | `/$bunfs/root/chunk-*.js` 去重 |

**三个数不能混为一谈**：**223 MiB** 是解包后磁盘占用，**约 75 MB** 是 zstd 后的下载体积（`2.1.243` 起），**340 MB** 是 `2.1.243` 之前的未压缩下载体积。

体积削减轨迹（CHANGELOG，一手）：

> `2.1.203` — "**Reduced binary size by ~7 MB and startup memory by ~7 MB** by loading a large bundled dependency lazily instead of inlining it"
> `2.1.243` — "**zstd-compressed (about 75 MB instead of 340 MB on Linux x64)**" / "native binary size: about 2 MB smaller by storing the bundled skill and prompt text more compactly"
> `2.1.251` — "the native binary is about **5 MB** smaller" / "**Removed syntax highlighting for six rarely used languages (1c, gml, isbl, mathematica, maxima, sqf); the binary is 2.5 MB smaller**"

> 最后一条是体积压力的直白证据：**为了 2.5 MB 砍掉六种语言的语法高亮**。
> 反向证据（社区）：#89445 "[BUG] With each release, the installer package increases in size by about 10–20 MB."（**已关闭**，2026-08-25）。

> **约束**：`@bun @bytecode` 让每个 chunk 同时存源码与字节码，是体积主因之一。要小体积就得放弃 bytecode 的启动收益——**两者在同一个旋钮上**。

### 4.2 可移植性下限（一手实测 + issue 佐证）

`ldd`：动态链接，`NEEDED` 为 `librt` / `libc` / `ld-linux-x86-64` / `libpthread` / `libdl` / `libm`。`readelf -V` 的 GLIBC 需求**最高 `GLIBC_2.26`**。

> **事实**：二进制要求 glibc ≥ 2.26（2017-08 发布）。**由此推出的判断**：glibc 停在 2.17 的发行版（RHEL/CentOS 7）无法直接运行 glibc 构建。**该判断依赖的环境假设**是这些发行版未加装更高版本 glibc。另有 musl 变体覆盖 Alpine。

**AVX 是更硬的一道门槛**，且这是迁移造成的真实用户损失（issue，一手）：

- #50466 — "[BUG] 2.1.113 crashes with SIGILL \"illegal hardware instruction\" on Ivy Bridge (AVX2-less) Intel Macs — **regression from 2.1.112**" — 已关闭
- #50384 — "Illegal instruction crash on CPUs without AVX after 2.1.112 (native binary regression)" — 已关闭
- #50684 — "Claude Code CLI unusable on pre-Haswell Intel Macs (no AVX2) — need Node.js fallback or non-AVX binary" — 已关闭
- #67973 — "darwin-x64 binary requires AVX2 since 2.1.113 — please ship bun-darwin-x64-baseline (like Linux/Windows already do)" — 已关闭
- **#33153 — "Bundled Bun binary lacks AVX baseline support — crashes on non-AVX CPUs" — 仍开着**
- **#55520 — "[BUG] npm install now ships Bun binary (v2.1.126) — npm workaround for non-AVX VPS is dead, no upgrade path" — 仍开着 / reopened，17 条评论，无维护者回复**
- #51976 — "npm install broken on non-AVX Linux x64 CPUs since v2.1.113 — Node.js (cli.js) fallback removed" — **closed as `not_planned`**

> **约束**：`51976` 被标 `not_planned` 关闭，而 `55520` 仍开着且无人回复——**「非 AVX 机器没有升级路径」是一个被知晓、未承诺解决的状态**。

**平台掉落**：#50270 "v2.1.113+ broken on Termux/Android: native binary requires glibc, no JS fallback" — **仍开着**，69 评论 / 62 反应，标签含 `regression`，串里还汇集了 Haiku OS 与 OpenBSD 的同根因用户。#61313（FreeBSD 包）与 #20202（OpenBSD 保留 npm 安装）均已关闭。

### 4.3 生态代价：社区改 `cli.js` 的路被切断

- **#52460** — "CC silently replaces on-disk binary at unchanged version string, defeating **tweakcc** and other patchers" — **closed as `duplicate`**，2026-04-27。issue 正文（一手）：用户用 `tweakcc --apply` 补丁了 2.1.111，验证了注入的 RGB 值与 `tweakcc v4.0.11` 标记；重启后 `~/.local/share/claude/versions/<version>` 下的二进制被静默替换，**同文件名、同版本号、补丁全无**。**无维护者回复。**
- #4429 — ":rocket: Introducing tweakcc - customize your Claude Code installation"（2025-07-25，迁移前的社区定制器），已关闭。

> **检索结果（负面，中等强度）**：以 `in:title (tweakcc OR "patch the" OR patching OR minified OR unpatchable)` 与全文 `tweakcc`（53 命中）检索 issue tracker，**除 #52460 与 #4429 外未发现其他专门讨论「失去改 cli.js 能力」的 issue**。判断：这类抱怨主要迁移到了第三方仓库（Piebald-AI/tweakcc、flipphoneguy/claude-code-termux、claude-yolo/claude-yolo，均在 #50270 评论中被点名），而非留在官方 tracker。

### 4.4 必须自己维护的东西

替换渲染后端与 Yoga，意味着以下都成为自有资产：flexbox 布局求解、cell 网格 diff、双缓冲、对象池与样式 atlas、帧调度与背压、终端模式栈、子进程 ANSI 净化、滚动与选区、终端兼容探测。

容错成本在二进制里可见：布局抛异常是被预期的（`layoutFailed`、`consecutiveLayoutFailures`、`relayoutFromScratch`、`reportLayoutFaultToErrorTracking`，日志上限 `ib=5`，告警 `ink layout pass threw (…)`），终端上报尺寸不可信也有处理（`loggedGarbageWinsize`）。

**代价在 §5 里兑现**：`2.1.228`「会话可能完全停止重绘而进程还活着」、`2.1.277`「内部渲染错误后屏幕可能整场不再更新」——这正是自维护布局层的失败模式。

### 4.5 可调试性

- **正向**：内建 Perfetto 追踪、帧计时日志、重绘调试、启动 profile、`--debug [filter]`（分类过滤如 `"api,hooks"` / `"!1p,!file"`）、`--debug-file`、`CLAUDE_CODE_DIAGNOSTICS_FILE`、`CLAUDE_CODE_TERMINAL_RECORDING`、`claude doctor`、`--safe-mode`、`--bare`、以及 **`/heapdump`**（官方 troubleshooting 原文：写出 `<session-id>.heapsnapshot` 与 `<session-id>-diagnostics.json`，"The summary says whether most memory is in the JS heap, which the snapshot captures, **or in native memory, which it doesn't**"）。
- **负向**：应用代码以 minified + bytecode 嵌在 `.bun` 节，路径为 `/$bunfs/root/chunk-xxxx.js`，符号表只有 V8 ABI 垫片。**外部做符号级定位极困难**；他们自己都需要一份堆栈路径归一化白名单。issue #52223 "Bash tool returns **minified cli.js source** instead of command output in subagents"（已关闭）说明这种不透明也会泄漏到用户面前。

### 4.6 生态锁定

- 绑定 **Bun + JavaScriptCore**：JSC 与 V8 在性能特征、GC、正则、`Intl` 上不等价（**判断**，本轮未构造测试）。真实后果已出现：#68576 "Deterministic Bun segfault at 0xCD on Windows 10 — Trend Micro Apex One DLLs in crash stack; **2.1.112 (Node) works, 2.1.113+ (Bun) crash**"（已关闭）——**迁移边界最干净的一次前后对照**。
- 原生插件须走 Bun 的 napi / V8-ABI 垫片。tree-sitter 也受影响：#34220 "tree-sitter-bash **stubbed out in Bun single-file binary** — all Bash permission checks use legacy fallback"（已关闭）。
- **Bun 自 2025-12-02 归 Anthropic 所有**，这项锁定同时也是内部化。

### 4.7 磁盘侧运行时代价（本机实测，只读）

| 目录 | 大小 |
|---|---:|
| `~/.claude/projects/`（会话 transcript） | **2.6 GB** |
| `~/.claude/file-history/` | 92 MB |
| `~/.claude/plugins/` | 20 MB |

最大单个 transcript 为 73,385 行 JSONL，每行带 `version` 字段。

> 这是**单机长期使用后**的数字，不是通用基准。说明会话持久化磁盘增长无界（存在 `.last-cleanup` 与 `backups/`，清理策略本轮未核实）。社区侧对应：#5024 "History accumulation in .claude.json causes performance issues and storage bloat"（已关闭，50 反应）、#16093 "Infinite logging loop in debug files causes 200GB+ disk usage"（已关闭）。

---

## 5. 坑：官方与社区

来源：`anthropics/claude-code` GitHub REST API（`gh`，已认证；仓库 **92,995 issues / 11,532 open**）、官方 `CHANGELOG.md`（401 版本）。标题均为**逐字引用**。

### 5.1 二进制自带的已知问题处理（一手，原文）

**(a) JetBrains JediTerm 滚轮变方向键**（2.1.278 里做了检测与提示，**上游未修**）：

```js
i("tengu_jediterm_scroll_bug_detected",{});
text:"Scroll support in JetBrains IDE 2025.2 terminals is experimental · upgrade to 2025.3+ for the b[est …]"
text:"Scroll wheel is sending arrow keys · use PgUp/PgDn to scroll"   // timeoutMs:12000
```
检测手段 `arrowWindow` / `arrowWindowDir` / `lastStdinTime`——**靠方向键突发模式反推是滚轮**。

**(b)** 终端上报尺寸不可信：`loggedGarbageWinsize`。
**(c)** 布局抛异常：预期会发生，走恢复路径。
**(d)** 渲染越界：`alt-screen: yoga height … something is rendering outside <AlternateScreen>`。
**(e)** 渲染器切换硬限制：`uncarriable` / `active_tasks` / 需重启。
**(f)** 安装期失败：`install.cjs` 显式处理 `EEXIST`/`EXDEV`/`EPERM`/`ENOSPC`/NFS 中途失败并恢复 stub。

### 5.2 仍然开着（OPEN）

**渲染 —— 这是最刺眼的一组：闪烁与滚动问题追了 17 个月仍未关闭**

| # | 逐字标题 | 状态 | 规模 |
|---|---|---|---|
| [#769](https://github.com/anthropics/claude-code/issues/769) | "[BUG]  In-progress Call causes Screen Flickering" | **OPEN/reopened**，2025-04-12 | **307 评论 / 335 反应**，标签 `bug, area:tui, oncall` |
| [#826](https://github.com/anthropics/claude-code/issues/826) | "[BUG] Console scrolling top of history when claude add text to the console" | **OPEN/reopened**，2025-04-19 | **354 评论 / 822 反应** |
| [#1913](https://github.com/anthropics/claude-code/issues/1913) | "Terminal Flickering" | **OPEN**，2025-06-10 | 187 评论 / 321 反应 |
| [#10794](https://github.com/anthropics/claude-code/issues/10794) | "[BUG] Critical: Terminal Flickering Causes Complete VSCode Crashes on macOS" | **OPEN**，2025-11-01 | `area:tui, area:ide, oncall` |
| [#36582](https://github.com/anthropics/claude-code/issues/36582) | "Terminal keeps scrolling to top when conversation gets long" | **OPEN**，2026-03-20 | 39 评论 / 135 反应 |
| [#34845](https://github.com/anthropics/claude-code/issues/34845) | "Terminal randomly scrolls to top and auto-scrolls to bottom during output, breaking scrollback navigation" | **OPEN**，2026-03-16 | 48 反应 |
| [#52924](https://github.com/anthropics/claude-code/issues/52924) | "TUI duplicates rendered text in scrollback on long sessions (Windows + Linux)" | **OPEN**，2026-04-24 | `has repro, area:tui` |
| [#46834](https://github.com/anthropics/claude-code/issues/46834) | "TUI relayouts (SIGWINCH / permission-mode toggle) spill entire transcript into scrollback as duplicate copies" | **OPEN**，2026-04-12 | `has repro, area:tui` |
| [#51828](https://github.com/anthropics/claude-code/issues/51828) | "[BUG] Scrollback duplication on terminal resize persists in 2.1.116 (VS Code integrated terminal, macOS)" | **OPEN**，2026-04-22 | `has repro, area:tui` |
| [#42002](https://github.com/anthropics/claude-code/issues/42002) | "Terminal scrollback not working in long sessions (alternate screen buffer)" | **OPEN**，2026-04-01 | `area:tui` |
| [#29937](https://github.com/anthropics/claude-code/issues/29937) | "[BUG] Terminal rendering corruption in tmux - text overlaps and overwrites previous output" | **OPEN**，2026-03-02 | 69 反应 |
| [#60185](https://github.com/anthropics/claude-code/issues/60185) | "New scroll UI breaks tmux copy mode workflow (scrollback no longer accessible)" | **OPEN**，2026-05-18 | `regression, stale` |
| [#71468](https://github.com/anthropics/claude-code/issues/71468) | "[Bug] Accidental mouse clicks on selection prompts misfire; mitigation breaks fullscreen scrollback" | **OPEN**，2026-06-25 | `reproduced` |
| [#4851](https://github.com/anthropics/claude-code/issues/4851) | "[BUG] Terminal Scrollback Buffer Rewind Lag in Claude Code + Tmux + Visual Studio Code After Extended Use" | **OPEN**，2025-07-31 | 97 反应 |

**性能 —— 内存与 idle CPU**

| # | 逐字标题 | 状态 |
|---|---|---|
| [#4953](https://github.com/anthropics/claude-code/issues/4953) | "Claude Code Memory Leak - Process Grows to 120+ GB RAM and Gets OOM Killed" | **OPEN**，2025-08-01，97 评论 |
| [#11315](https://github.com/anthropics/claude-code/issues/11315) | "Critical Memory Leak: Claude Code Consumed 129GB RAM and Caused System Freeze" | **OPEN**，2025-11-09 |
| [#21567](https://github.com/anthropics/claude-code/issues/21567) | "**Terminal renderer CPU spin: 100% CPU with 625K writes/0 blits on large session**" | **OPEN**，2026-01-28，`area:tui, perf:memory` |
| [#95078](https://github.com/anthropics/claude-code/issues/95078) | "[BUG] claude spins at 100% CPU indefinitely on startup — **regression between 2.1.112 and 2.1.113**" | **OPEN**，2026-09-17（距本次抓取 4 天），`perf:cpu` |
| [#17148](https://github.com/anthropics/claude-code/issues/17148) | "Claude Code consumes 100%+ CPU when idle in terminal" | **OPEN**，2026-01-09 |
| [#19393](https://github.com/anthropics/claude-code/issues/19393) | "High CPU usage (100%+) when Claude Code instances are idle - v2.1.12" | **OPEN**，2026-01-20 |
| [#8856](https://github.com/anthropics/claude-code/issues/8856) | "Memory leak: Missing cleanup for /tmp/claude-*-cwd working directory tracking files" | **OPEN**，111 评论 |

> #21567 与 #95078 是本组里最相关的两条：一条直接是**渲染器 CPU 空转**（`625K writes / 0 blits`），一条把启动 CPU 空转**直接归因到原生二进制边界**（2.1.112 → 2.1.113）。

**glibc 2.44 启动崩溃 —— 一个大簇，且与官方 changelog 冲突**

[#89334](https://github.com/anthropics/claude-code/issues/89334) "[BUG] v2.1.242 segfaults on every launch (even `--version`) — interposed mimalloc `free` has no NULL check, glibc `newlocale` calls `free(NULL)` pre-main; v2.1.241 unaffected"（**OPEN**，2026-08-24，16 评论，`regression`），加上 #89412 / #89394 / #89369 / #89427 / #89415 / #89371 / #89421 / #89420 / #89419 —— **全部仍开着**。另有 [#90126](https://github.com/anthropics/claude-code/issues/90126) "Native installer produces a binary with the correct size but the wrong contents; hangs pre-main on a pthread_mutex_lock"（**OPEN**）。

> **文档/changelog 与实现的分叉点**：CHANGELOG `2.1.245` 称 "Fixed a crash on startup on Linux distributions that ship glibc 2.44 (for example Arch Linux, CachyOS and Fedora Rawhide)"，**但整簇 issue 至今仍开着**。**以 issue tracker 的实际状态为准：这条在 2.1.278 抓取日仍是未关闭状态。**

**分发 / stub 二进制**

| # | 逐字标题 | 状态 |
|---|---|---|
| [#88103](https://github.com/anthropics/claude-code/issues/88103) | "[BUG] 2.1.237 tagged `latest` with its linux-x64, win32-x64 and linux-x64-musl native packages never published - installs land on a dead 500-byte stub" | **OPEN**，标签含 **`high-priority`**，2026-08-20 |
| [#95297](https://github.com/anthropics/claude-code/issues/95297) | "[BUG] `claude upgrade` reports success but leaves `bin/claude.exe` as the fallback stub — native binary not linked" | **OPEN**，2026-09-18（距抓取 3 天） |
| [#84051](https://github.com/anthropics/claude-code/issues/84051) | "Interrupted auto-update leaves claude broken (missing bin symlink, placeholder stub, truncated native binary) with no self-healing" | **OPEN**，`reproduced` |

**输入 / IME / 粘贴**

| # | 逐字标题 | 状态 |
|---|---|---|
| [#1547](https://github.com/anthropics/claude-code/issues/1547) | "[BUG] **IME input causes performance issues and duplicate conversion candidates**" | **OPEN**，2025-06-04，**261 反应（输入类最高）** |
| [#18170](https://github.com/anthropics/claude-code/issues/18170) | "Copy/paste from terminal includes unwanted indentation and trailing spaces" | **OPEN**，135 评论 / 294 反应 |
| [#23134](https://github.com/anthropics/claude-code/issues/23134) | "Feature Request: Option to disable paste text collapse in input field" | **OPEN**，157 反应 |
| [#21382](https://github.com/anthropics/claude-code/issues/21382) | "[BUG] Korean IME composition fails in Quick Launcher (Option+Space) on macOS" | **OPEN**，2026-01-28 |
| [#31371](https://github.com/anthropics/claude-code/issues/31371) | "[BUG] Shift+Enter no longer creates a new line in the input" | **OPEN**，2026-03-06 |
| [#78267](https://github.com/anthropics/claude-code/issues/78267) | "[BUG] Bare-URL linkifier swallows fullwidth punctuation and CJK text into OSC 8 hyperlinks" | **OPEN**，2026-07-16 |
| [#22719](https://github.com/anthropics/claude-code/issues/22719) | "Shift+Enter not inserting newline in native version (iTerm2/macOS)" | **OPEN**，2026-02-03 |
| [#89030](https://github.com/anthropics/claude-code/issues/89030) | "[BUG] Over mosh, copy-on-select only works the first time … identical OSC 52 is deduped by mosh state sync" | **OPEN**，2026-08-23 |

**平台锁死**：#50270（Termux/Android，**OPEN**，69 评论）、#55520（非 AVX 无升级路径，**OPEN**）、#33153（Bun 缺 AVX baseline，**OPEN**）、#93189 "Kaspersky antivirus falsely detects Claude Code as PDM:Exploit.Win32.Generic"（**OPEN**，2026-09-09）。

### 5.3 已修复 / 已关闭（选摘）

**2.1.89 alt-screen 渲染器上线时的集中反弹**（全部已关闭）：

- #41814 "Messages disappear from terminal display during conversation after v2.1.89 update" — closed/completed，**62 评论 / 130 反应**
- #42670 "[Critical UX Regression] No way to access conversation history — alternate screen buffer kills all scrollback (v2.1.89+)" — closed/completed，52 反应
- #41965 "v2.1.89 regression: flicker-free rendering destroys terminal scrollback by default" — closed as `duplicate`
- #42024 "v2.1.89: scrollback history lost in terminal (Ghostty)" — closed as `duplicate`
- #3648 "Terminal Scrolling Uncontrollably During Claude Code Interaction" — closed/completed，**337 评论 / 836 反应（单个 TUI 话题最大）**
- #18451 "[FEATURE] Petition to rename Claude Code to: Flicker Code, or Seizure Code" — closed，17 反应

**字宽 / emoji**：#80475 "Newer emoji U+1FAEA (🫪 \"DISTORTED FACE\", Unicode 17.0) corrupts TUI render — cell-width mismatch, column misalignment & stray-glyph artifacts"、#30471 "TUI misalignment caused by string-width miscalculating emoji character width on macOS 12"、#76424 "Spinner glyph U+2733 (✳) renders double-width on Windows, shifting the whole status line every animation frame" — 均已关闭。

**IME（大量已关闭）**：#8405 "[BUG] Pressing Enter to confirm IME (Japanese) conversion unintentionally sends the prompt"（**95 反应**）及兄弟 #8498/#8455/#8423；#25186 "Korean IME composition window appears at wrong position (bottom-left of terminal)"；#16322 "[CRITICAL] Korean IME: Composing characters display at wrong position (unusable for Korean users)"；#39067 "[2.1.83+] Korean IME toggle key outputs [57358u in input area"；**#42417 "New renderer (CLAUDE_CODE_NO_FLICKER=1): Japanese text clipboard copy garbled on Windows (UTF-8 → CP932 mojibake via OSC 52)"（直接把 mojibake 归因到新渲染器）**。

**迁移期连带损伤（全部已关闭）**：#51234 "~/.claude/skills/ directory deleted on first run after 2.1.113→2.1.114 update"、#50289 "`.mcp.json` per-server `timeout` no longer honored since 2.1.113"、#50567 "OTEL_METRICS_EXPORTER=otlp silently no-ops in 2.1.113"、#50819 "TUI input completely unresponsive starting in 2.1.113 (Linux kernel 3.10)"、#50792 "Possible Windows binary incompatibility in 2.1.113"、#25713 "Native binary (Bun/JSC) aborts on ARM64 Linux with 64K page size kernels"。

### 5.4 官方 changelog 里的 revert 与回归（一手）

**显式 revert：**

> `2.1.273` — "**Reverted** a 2.1.268 change that checked Read and Edit deny rules on Bash lines the permission checker can't analyze (`eval`, `env -C`)"
> `2.1.260` — "**Reverted** the 2.1.259 change applying `Read()` deny rules to Bash arguments; it denied `npm run build` under a `Read(./**/build/**)` rule in every mode"
> `2.1.233` — "**Reverted** the 2.1.232 Bash permission changes for Cygwin-style symlinks on Windows and for input redirections (`< file`)"
> `2.1.111` — "**Reverted** the v2.1.110 cap on non-streaming fallback retries — it traded long waits for more outright failures during API overload"

**一次公开的 release note 更正**（罕见且值得记）：

> `2.1.212` — "**Corrected an earlier release note (2.1.200): tmux through the 3.6 series lacks synchronized output;** newer tmux with support is detected automatically"

（被更正的原文是 `2.1.200` "Fixed rendering flicker under tmux 3.4+ by enabling synchronized terminal output"。）

**TUI 相关回归（按版本）**：`2.1.269` 修 **2.1.247** 的按键编码回归（kitty protocol / st / rxvt-unicode / WezTerm）；`2.1.179` 修 **2.1.172** 的 WSL2 滚轮回归；`2.1.203` 修 **2.1.196** 的误判低内存导致 15–20 秒卡顿；`2.1.181` 修 **2.1.169** 的 ~120 ms 启动回归；`2.1.105` 修 **2.1.100** 的 alt+enter / Ctrl+J 换行回归；`2.1.258` 修 **2.1.255** 导致的 macOS 12 无法启动。

**AVX 崩溃在迁移前就修过两次**：`2.1.17` 与 `2.1.19` 都写着 "Fixed crashes on processors without AVX instruction support"。

### 5.5 本版本（2.1.278）仍在修的渲染稳定性问题（一手）

`2.1.278` 自身只有两条与 auto-mode 计费相关的条目，**无 TUI 内容**。但紧邻的 `2.1.277` 说明渲染稳定性在本版本仍是活跃修复区：

> "Fixed **a rare case where the screen could stop updating for the rest of the session** after an internal rendering error"
> "Fixed a crash ('**unrecoverable interface error**') when the prompt held text containing terminal color codes"
> "Fixed … sessions … exiting with 'Claude Code exited after an unrecoverable interface error' **when the first spinner appeared**"
> "Fixed typed or pasted text occasionally coming out scrambled … during key repeat or very fast input"

同族更早的：`2.1.228` "Fixed interactive sessions that could **stop redrawing entirely, while the process kept running**, after a rare internal layout error"；`2.1.229` "Fixed a RangeError crash when a progress bar or markdown table rendered in a very narrow terminal window"。

### 5.6 明确的负面检索结果（已检索未发现）

- **Docker 镜像膨胀**：以 `in:title (proxy OR offline OR airgap OR "air-gapped")`（372 命中）与 `in:title ("disk space" OR "disk usage" OR "download size" OR "234 MB" OR bloat)`（69 命中）检索，**未发现专门针对 ~220 MB 原生二进制导致 Docker 镜像膨胀的 issue**，也没有围绕 234 MB 这个数字的 issue。
- **大文本粘贴吞吐**：以 `in:title paste in:title (slow OR truncated OR large OR mangled OR broken)`（592 命中）检索，**未发现专门讲「粘贴超大文本慢或被截断」的 issue**。粘贴类抱怨集中在**折叠成占位符**（#23134、#3412）与**复制出来的格式**（#18170、#22073、#13378）。
- **Emacs term/vterm、ConEmu**：以 `in:title (emacs OR vterm OR mosh)`（28 命中）与 `in:title (WSL OR powershell OR ConEmu)`（599 命中）检索，**未发现 Emacs term/vterm 渲染 bug，未发现 ConEmu 标题的 issue**。官方仅在 changelog 提及：`2.1.129` 为 Emacs `eat` 加了 `CLAUDE_CODE_FORCE_SYNC_OUTPUT=1`。
- **SELinux、Rosetta**：以 `in:title (antivirus OR Defender OR SELinux OR Rosetta OR "false positive")` 检索，**未出现 SELinux 或 Rosetta 标题的 issue**。
- **Anthropic 官方 TUI 工程博客**：以限域搜索 `anthropic.com` + `claude.com`，**未发现任何第一方讲 Claude Code 终端 UI 实现的文章**。

---

## 6. 性能指标

**结论：有公开数字，但几乎全部是「相对改善量」（省了多少 MB、快了多少 ms、降了百分之多少），没有任何 Anthropic 公布的绝对基准（启动耗时、稳态内存、帧率）。本路未自行基准测试。**

### 6.1 官方公布的数字（CHANGELOG，一手；全为相对量）

| 版本 | 数字 | 原文 |
|---|---|---|
| `2.1.243` | **75 MB vs 340 MB** | "zstd-compressed (about **75 MB instead of 340 MB** on Linux x64)" |
| `2.1.243` | **省 40–70 MB/会话** | "code is now loaded on demand … (roughly **40–70 MB less memory per session**)" |
| `2.1.203` | **-7 MB 体积 / -7 MB 启动内存** | "Reduced binary size by **~7 MB** and startup memory by **~7 MB**" |
| `2.1.251` | **-5 MB**；**-2.5 MB** | "the native binary is about **5 MB** smaller"；"Removed syntax highlighting for six rarely used languages …; the binary is **2.5 MB** smaller" |
| `2.1.243` | **-2 MB** | "about **2 MB** smaller by storing the bundled skill and prompt text more compactly" |
| `2.1.69` | **-16 MB 基线内存** | "Reduced baseline memory by **~16MB** by deferring Yoga WASM preloading" |
| `2.1.69` | **~35 MB / 1000 turns** | "REPL render scopes accumulated over long sessions (**~35MB over 1000 turns**)" |
| `2.1.191` | **CPU -37%，合并窗口 100 ms** | "Reduced CPU usage during streaming responses by **~37%** by coalescing text updates to **100ms**" |
| `2.1.181` | **~120 ms/次启动** | "Fixed a startup regression (**~120ms per launch** in fresh environments, introduced in 2.1.169)" |
| `2.1.205` | **updater 峰值 -400 MB** | "Auto-update binary downloads now stream to disk … cutting the updater's peak memory usage by roughly **400 MB**" |
| `2.1.208` | **64 MB/server** | "MCP stdio server stderr accumulating up to **64 MB per server**" |
| `2.1.172` | **5 Hz** | "`/goal` status chip no longer re-renders the terminal at **5 Hz** while idle" |
| `2.1.72` | **-510 KB** | "Reduced bundle size by **~510 KB**" |
| `2.1.238` | **10 秒** | "the automatic update check now runs about **10 seconds** after launch instead of competing with startup for CPU" |
| `2.1.208` | **200 行** | Markdown 表超过 **200 行**只渲前 200 行 |
| headless 文档 | **10 MB / 30 秒** | "Piped stdin is capped at **10MB**"；退出前排空等待"capped at **30 seconds**"（2.1.214 前仅约 2 秒） |

> **测法**：CHANGELOG **一条都没有给测法**。这些是厂商自报的改善量，无法独立复核。

### 6.2 从二进制取到的配置常量（一手；**不是性能测量结果**）

| 量 | 值 | 性质 |
|---|---:|---|
| 默认帧间隔 | **16 ms**（`Mm`） | 目标上限 |
| 输入优先帧间隔 | **4 ms**（`hCr`） | 目标上限 |
| 输入优先窗口 | **50 ms**（`gCr`） | 阈值 |
| stdout backlog 阈值 | **16,384 B**（`yCr`） | 阈值 |
| backlog 压帧重试 | **250 ms**（`i1n`） | 阈值 |
| 布局宽度哨兵 | 8,192（`Ks`） | 常量 |
| 布局故障日志上限 | 5（`ib`） | 常量 |

> **必须区分**：16 ms / 4 ms / 50 ms / 16 KiB / 250 ms 是**他们设定的目标与阈值**，不是实测帧率或延迟。把它们读成「Claude Code 跑在 60 fps」是错的——这是**帧率上限**。

### 6.3 体积实测（一手）

见 §4.1 表。linux-x64 **223.3 MiB**、darwin-arm64 **207.6 MB**、win32-x64 **226.2 MB**；迁移前 JS bundle **≈47 MB**。

### 6.4 Anthropic 具备但未公开的测量能力（一手）

`CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER`（**专测到第一帧**）、`CLAUDE_CODE_PROFILE_STARTUP`、`CLAUDE_CODE_EMIT_STARTUP_TIMING`、遥测 `spawn_ms` / `CCR_RUNNER_STARTUP_TIMING`、`CLAUDE_CODE_FRAME_TIMING_LOG` + `_SAMPLE_EVERY`、`CLAUDE_CODE_PERFETTO_TRACE`、`lastYogaCounters`。

> **判断**：这些开关说明启动耗时与帧耗时被内部持续测量。**这些绝对数据未公开**——本轮未找到任何对外发布的绝对数值。

### 6.5 社区侧的数字

- #21567（**OPEN**）标题内含测量：渲染器 "100% CPU with **625K writes/0 blits** on large session"。
- #4953（**OPEN**）"Process Grows to **120+ GB RAM**"；#11315（**OPEN**）"Consumed **129GB RAM**"。
- #50270 评论中一位 Termux 用户报 **236 MB** 的 `claude.exe`（**二手**，用户评论，非 Anthropic 陈述）。

> 这些是用户自报，**无统一测法**，只能作为量级参照与「问题存在」的证据，不能当基准。

### 6.6 本路未自行基准测试

BRIEF 三·2 规定跨家统一性能实测由派发者做。**本路未测启动耗时、内存或渲染延迟**，只收集厂商与社区公布的数字。

---

## 7. 本轮不支持什么 / 未查证

### 7.1 被外部证据**推翻**的我方结论（最需要交代的一条）

**我基于二进制得出的「未发现 IME 处理」是一次取证失败。**

我的探测过程本身是对的：裸 `IME` 命中 1480 次，但词边界匹配 `(^|[^A-Za-z])IME([^A-Za-z]|$)` = **0**，1480 次全部归因于 `BUILD_TIME`(271)、`ETIMEDOUT`(65)、`TIMESTAMP`(76)、`MIME`(25)、`XDG_RUNTIME_DIR`(21) 等；`compositio` 的 32 次全是 Unicode 属性名与 CSS。**这些子串判定都成立。**

**但由此写下的「本轮没有找到任何 IME 证据」是误导性的**，因为外部一手证据显示 IME 处理大量存在：

- CHANGELOG `2.1.160` — "Fixed **CJK IME composition** appearing at the bottom-left of the screen instead of at the input caret"
- CHANGELOG `2.1.187` — "Fixed pasted Korean/CJK text turning into mojibake in terminals that deliver paste as per-byte extended-key events"
- CHANGELOG `2.1.126` / `2.1.97` — Windows no-flicker 模式下的 CJK 乱码修复
- issue #1547（**OPEN，261 反应**）、#8405（95 反应）、#16322、#25186、#21382、#39067…

**教训**：`IME` 这个缩写在代码里根本不作为标识符出现（实现会叫 `composition`、`extendedKeys`、`win32InputMode` 等）。**「用某个词的探针没搜到」与「该功能不存在」之间没有关系**——当探针词不是实现者会用的词时，负面结论没有任何强度。这条比子串假阳性更隐蔽。

### 7.2 「构造了验证」的负面结论（强）

- **不是 Node SEA**：`NODE_SEA_BLOB` / `NODE_JS_SEA` = 0，且存在互斥的 `.bun` / `.bun_builtins` / `__DATA,__jsc_opcodes` 节区与 `Bun v1.4.3` 版本串；官方 changelog `2.1.181` 独立印证。
- **不是 V8**：23 处 `v8::` 全部是 `Local<T> v8::HandleScope::createLocal(JSC::VM &, JSC::JSValue)` 形态的 JSC 映射垫片，**签名本身**证明了这一点。
- **Yoga 不是 WASM 也不是 Emscripten**：wasm magic 逐字节检查，11 处裸 `\x00asm` **逐条 dump 确认全为文本假阳性**；9 个 Emscripten 标记全 0；**并且正面找到了 JS 替代实现**；**并且官方 changelog `2.1.85` 独立确认换成了 pure TypeScript**。本报告最强的一条。
- **npm 包内没有 `cli.js`**：解包 2.1.278 tarball 实测，7 个文件，`bin/claude.exe` 是 500 B 的 shell stub。
- **`ink-local` / `ink-free` / `ink-repo` 等不是 Ink 元素**：逐条上下文确认为 `link-` / `deep-link-` / CSS 变量尾巴。

### 7.3 「读了该读的地方没找到」（中）

- **上游 Ink 的 `<Static>` 机制**：`internal_static` / `ink-static` / `staticOutput` / `unstable__transformChildren` 均为 0。未构造反例。
- **迁移到原生二进制的官方理由**：已检索 401 版本 CHANGELOG、7 个官方文档页、Anthropic 官方博客（限域搜索）、Latent Space、Pragmatic Engineer、YC Library、Bun 博客——**唯一接近理由的一手陈述是 issue #50270 上 `ant-kurt` 的回帖**，且它只讲代价不讲收益。
- **Anthropic 官方 TUI 实现工程博客**：不存在（已限域检索 `anthropic.com` / `claude.com`）。
- **Docker 镜像膨胀 / 大文本粘贴吞吐 / Emacs vterm / ConEmu / SELinux / Rosetta 的 issue**：检索式与命中数见 §5.6，均未发现。
- **Sixel / iTerm2 内嵌图片协议**：`sixel` = 0、`]1337;File=` = 0、`_Gf=` = 0，但 `terminalImages` = 14、`kitty graphics` = 6。**图片实际走哪条协议未确证。**
- **`tengu_flicker` 的上报条件**。
- **`install.cjs` 注释里 `~500MB` 的出处**：各平台实测 207–227 MB，历史下载体积 340 MB，**都不是 500 MB**，来源未查明。

### 7.4 明确的文档/实现分叉（按 BRIEF 要求声明以哪层为准）

1. **glibc 2.44 崩溃**：CHANGELOG `2.1.245` 称已修复；issue #89334 及九个同簇 issue **至今仍开着**。→ **以 issue tracker 为准**：在 2.1.278 抓取日，该问题未被 tracker 确认关闭。
2. **主题容错**：`/docs/en/terminal-config` 称 "a typo cannot break rendering"；CHANGELOG `2.1.277` 修了「`theme` 值畸形导致启动崩溃」。→ **以 changelog 为准**：文档描述的是修复后的目标状态。
3. **tmux 同步输出**：`2.1.200` 声称修复 "tmux 3.4+"，`2.1.212` **官方自行更正**为 "tmux through the 3.6 series lacks synchronized output"。→ **以 2.1.212 的更正为准**。
4. **npm 与 native 构建曾有不同工具面**：`2.1.117` "(Windows and npm-installed builds unchanged)" 说明二者一度分叉；当前 `/docs/en/setup` 称 "installs the same native binary"。→ **以当前文档 + npm registry 实测为准**：2.1.278 已收敛。

### 7.5 本轮完全未做

- 不做跨家比较、不写综述（BRIEF 开篇要求）。
- 未自行做性能基准（BRIEF 三·2）。
- 未启动交互会话、未发起模型请求（BRIEF 三·2）。
- 未核实 `~/.claude/projects/` 的清理与保留策略。
- 未分离出 `default` 与 `fullscreen` 两条渲染器的独立代码路径（只确认了配置文案、优先级表与共享字段）。
- 未构造测试验证 JSC 与 V8 在此负载下的差异。

---

## 8. 证据清单

### 8.1 本地一手（可复现，全部只读）

| # | 来源 | 类型 | 取法 |
|---|---|---|---|
| L1 | `$PKG/package.json` | 一手原文 · 厂商 | `cat` |
| L2 | `$PKG/install.cjs`（7,196 B，**未混淆 + 英文注释**） | 一手 · **作者自述** | `cat` |
| L3 | `$PKG/cli-wrapper.cjs`（4,997 B，同上） | 一手 · **作者自述** | `cat` |
| L4 | `$PKG/README.md` / `LICENSE.md` | 一手 · 厂商 | `cat` |
| L5 | `$PKG/sdk-tools.d.ts`（167,766 B / 4,153 行 / 88 类型） | 一手 · 生成产物 | `cat` / `grep` |
| L6 | `…/claude-code-linux-x64/claude`（BuildID `83effae1…`，234,119,480 B） | 一手二进制 | `file` / `stat` / `ldd` |
| L7 | 节区表 | 一手二进制 | `readelf -S -W` |
| L8 | 动态段与 GLIBC 版本（最高 2.26） | 一手二进制 | `readelf -d` / `readelf -V` |
| L9 | 符号表（2514 行 / 1486 已定义 / 416 个 `_Z`，全为 v8/node） | 一手二进制 | `readelf -sW` / `nm` / `nm -D` |
| L10 | `.comment` 工具链 | 一手二进制 | `readelf -p .comment` |
| L11 | 特征串计数与上下文（504,806 行 `strings -n 6`） | 一手二进制 | `strings` + 带边界 `grep -F` + Python 上下文抽取 |
| L12 | wasm magic 逐条 dump（11 处，全假阳性） | 一手二进制 | Python `bytes.count` / `find` |
| L13 | `claude --version` → `2.1.278 (Claude Code)` | 一手实测 · 非交互 | 直接调用 |
| L14 | `claude --help` 全文 | 一手原文 · 厂商 · 非交互 | 直接调用 |
| L15 | `~/.claude/settings.json`（含 `"tui":"fullscreen"`、`"theme":"dark"`） | 一手 · 本机配置 | `cat`（只读） |
| L16 | `~/.claude/` 目录普查与体积（projects 2.6 GB） | 一手实测 · 本机 | `ls -la` / `du -sh`（只读） |
| L17 | `~/.claude/paste-cache/`、`shell-snapshots/` 存在性 | 一手 · 本机 | `ls -la`（只读） |

### 8.2 网络一手

| # | 来源 URL | 类型 |
|---|---|---|
| W1 | `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`（746 KB / 7,158 行 / **401 版本**） | **一手 · 厂商官方** |
| W2 | `https://code.claude.com/docs/en/setup` | 一手 · 厂商官方 |
| W3 | `https://code.claude.com/docs/en/fullscreen` | **一手 · 厂商官方（渲染自述最集中）** |
| W4 | `https://code.claude.com/docs/en/terminal-config` | 一手 · 厂商官方 |
| W5 | `https://code.claude.com/docs/en/cli-reference` | 一手 · 厂商官方 |
| W6 | `https://code.claude.com/docs/en/headless` | 一手 · 厂商官方 |
| W7 | `https://code.claude.com/docs/en/troubleshooting` | 一手 · 厂商官方 |
| W8 | GitHub REST API `anthropics/claude-code`（`gh`，已认证；92,995 issues / 11,532 open） | **一手 · 第三方与用户** |
| W9 | `https://github.com/anthropics/claude-code/issues/50270#issuecomment-4308968635`（`ant-kurt` COLLABORATOR） | **一手 · 厂商员工表态** |
| W10 | `https://registry.npmjs.org/@anthropic-ai/claude-code`（含 2.1.112 / 2.1.113 / 2.1.278 元数据与解包内容） | **一手 · 发布事实** |
| W11 | `https://bun.com/blog/bun-joins-anthropic`（Jarred Sumner，2025-12-02） | 一手 · Bun 方（2025-12 后即第一方） |
| W12 | `https://www.latent.space/p/claude-code`（Boris Cherny / Cat Wu，2025-05-07） | **一手 · 作者自述**，引文可靠性「中」 |
| W13 | `https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built`（Gergely Orosz，2025-09-23） | 一手访谈内容 / 二手框架，引文可靠性「中」 |

### 8.3 明确标注的二手（仅作存在性记录，未用于任何事实主张）

`kotrotsos.medium.com`（Claude Code Internals Part 11: Terminal UI）、`claude-code-from-source.com/ch13-terminal-ui`、`dev.to/minnzen`（"leaked source" TUI toolkit）、`kenhuangus.substack.com`（Chapter 6: Terminal UI Architecture）、`slyapustin.com/blog/claude-code-no-flicker.html`、`analyticsindiamag.com`、`frr.dev/posts/claude-code-native-build-bun/`、`ycombinator.com/library/UN-boris-cherny-building-claude-code`（抓取仅得标题，无正文）。

> **其中两条二手说法与一手证据冲突，已在 §1.3 驳回**：(1)「Claude Code 把 Ink fork 到面目全非」——**没有任何 Anthropic 来源用过 "fork" 这个词**；(2)「v2.0.10 用自研渲染器替换了 Ink」——`2.0.10` 原文未提 Ink，且 `2.1.110` 仍在说 "Ink output"。

### 8.4 关键原文引用索引（便于复核）

| 主张 | 原文锚点 | 来源 |
|---|---|---|
| Bun 运行时 | `Bun v1.4.3 (8c28b3167) Linux x64`；节区 `.bun` / `.bun_builtins` / `__DATA,__jsc_opcodes` | L6–L11 |
| Bun 官方确认 | "Upgraded the bundled Bun runtime to 1.4" | W1 `2.1.181` |
| 非 V8 | `Local<T> v8::HandleScope::createLocal(JSC::VM &, JSC::JSValue)` | L11 |
| bytecode 构建 | `// @bun @bytecode` ×1903 | L11 |
| Ink 在用（二进制） | `https://github.com/vadimdemedes/ink/#israwmodesupported` ×4 | L11 |
| Ink 在用（官方） | "when piped (non-TTY) **Ink** output contains a single very wide line" | W1 `2.1.110` |
| Yoga 换纯 TS（二进制） | `setPointScaleFactor: Int32 storage supports scale 0 or 1 only` | L11 |
| **Yoga 换纯 TS（官方）** | "**replacing WASM yoga-layout with a pure TypeScript implementation**" | **W1 `2.1.85`** |
| 分发切换 | "spawn a native Claude Code binary … instead of bundled JavaScript" | W1 `2.1.113` |
| 分发切换（时间） | 2.1.112 @ 2026-04-16 → 2.1.113 @ 2026-04-17 | W10 |
| 迁移唯一理由 | "which drops support for some platforms … You can pin to the last JS bundle release" | W9 |
| 双渲染器（二进制） | `'Terminal UI renderer. "fullscreen" uses the flicker-free alt-screen renderer with virtualized scrollback…'` | L11 |
| 双渲染器（官方） | "It draws the interface on the terminal's alternate screen buffer, like `vim` or `htop`, and only renders messages that are currently visible." | W3 |
| 帧调度常量 | `var Mm=16,gCr=50,hCr=4,yCr=16384,i1n=250;` | L11 |
| 终端模式表 | `BRACKETED_PASTE:2004, THEME_NOTIFY:2031, SYNCHRONIZED_UPDATE:2026, WIN32_INPUT_MODE:9001` | L11 |
| 同步输出探测 | "Claude Code probes the terminal for synchronized-output support at startup" | W3 |
| ripgrep 内嵌 | "…or use the native claude binary which embeds it" | L11 |
| 零常驻 Node | "the native binary directly — no Node.js process stays resident" | L2 |
| 抄 Bun 打包模式 | "Same pattern as Bun's npm package." | L2 |
| AVX 限制 | "the x64 build needs AVX, which Rosetta doesn't emulate" | L3 |
| **Ink 的作者评价** | "**Ink is amazing. It's sort of hacky and janky in a lot of ways.**" | W12（Boris Cherny） |
| **选型理由** | "We wanted a tech stack which we didn't need to teach: one where Claude Code could build itself." | W13（Boris Cherny） |
| 闪烁最久未决 | #769 "[BUG]  In-progress Call causes Screen Flickering"，OPEN 17 个月 | W8 |
| 体积削减到砍语言 | "Removed syntax highlighting for six rarely used languages …; the binary is 2.5 MB smaller" | W1 `2.1.251` |
| 官方自我更正 | "Corrected an earlier release note (2.1.200)…" | W1 `2.1.212` |

---

*报告版本绑定：`@anthropic-ai/claude-code` **2.1.278** / linux-x64 / BuildID `83effae1a76aa74ce70326f83068a1242f99094a` / npm 发布 2026-09-19。抓取日期 **2026-09-21**。*
