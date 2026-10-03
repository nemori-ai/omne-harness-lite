# #65 通用库与机制调研＋探路件（Ajv 8.20.0、Node v24.21.0，2026-10-02）

**取代状态：** 原貌存档。本文件是子代理报告，是模型输出而不是证据；主线逐条核对的结果在 [evidence.md](../evidence.md)，当前该信什么只看 [research.md](../research.md)。

- 执行者与日期：子代理（主会话为 #65 派发，含探路件），2026-10-02
- 调查范围：Ajv standalone 能否承载本仓库的 exact 关键字及代价；按需与跨导入缓存机制；替代库；Ajv 选项
- 输入与方法：会话临时目录 `research-libs/` 下自写探路件（可能已清理），只读仓库；8 核机器，load1 6.7–16，各组 5 轮交替取中位数
- 处置的既有结论：首次调查。
- 收录说明：原件 `tmp/test-tiers-mutation/lazy-schema-libs.md`（工作树 `test-tiers-mutation`，Git 忽略），sha256 `16f76793b690de10a0be0e2c3b7e6c2188725bf3d10b346e348724692c83e637`。原文一级标题改为本页标题，原文的二级小节下移为三级；方案取舍的三处短语与「推荐」一段删去，删处以〔〕标出；其余逐字未改，含报告自己的「风险」与「未核实」两段。

## 完整报告正文

探路件与原始结果：会话 scratchpad `research-libs/`（`out/` 生成产物、`results/` 计时、`vt/` vitest 探针）。机器 8 核，测量期间 load1 6.7–16，各组 5 轮交替取中位数并记 CPU。仓库未改。

### 结论（子代理）

构建期生成 Ajv standalone 模块可行〔删：一句关于是否换库的取舍〕；探路件跑通了自定义关键字与 Draft 2020-12 多资源 `$ref`／`$dynamicRef`。
要改的：exact 关键字从 `validate` 型改 `code` 型（调用原函数）；正则引擎的 `code` 指向可 import 的名字。

| 对拍对象 | 规模 | 不一致 |
|---|---|---|
| messages（54 定义，经 createSchemaRuntime） | 581,688 对 | 0 |
| tool-definition（21 定义） | 27,783 对 | 0 |
| exact 元校验器（含 `$dynamicRef`） | 29,117 对 | 0 |

| 场景 | 现状 | standalone 导入 | ＋NODE_COMPILE_CACHE |
|---|---|---|---|
| messages | 761 ms（负载 6.7–7.7）／1053 ms（负载 11–12） | 35 ms | 12–15 ms |
| 元校验器 | 107 ms | 5.6 ms | — |

### 1. Ajv standalone（ajv@8.20.0）

| 项 | 情况 | 证据 |
|---|---|---|
| 前提 | 必须 `code.source: true` | `dist/standalone/index.js:6-8`；https://ajv.js.org/standalone.html |
| 自定义关键字 | 文档："only `code` and `macro` user-defined keywords are supported"；`code` 型用 `gen.scopeValue` 时要给 `code` 属性 | 同上 |
| 我们的 16 个 exact 关键字 | 都是 `validate` 型（`exact-schema.ts:165-314`），直接生成抛 `CodeGen: "code" for keyword0 not defined` | `keyword.js:87-91`、`scope.js:5-7,134`；`probe-validate-keyword-fails.mjs` |
| 绕法 A〔删：取舍标注〕 | 改 `code` 型：`gen.scopeValue('keyword', {ref: fn, code: _\`__exact["exact_type"]\`})`，生成 `fn.call(this, schema, data, undefined, {instancePath})`；函数本体就是 `installExactKeywords` 那几个 | `build-messages.mjs` 的 `codeKeyword` |
| 绕法 B | 保留 `validate` 型，先 `ajv.scope.value('keyword', {ref, code})` 预注册；对拍 107,676 对 0 不一致；依赖私有行为 | 〔删：取舍标注〕 |
| `code.regExp` | 引擎的 `code` 原样当标识符（`util.js:142-147`，`code.js:70-79`）；现 `'schemaPattern'` 生成 `const func0 = schemaPattern;` 加载报未定义；把 code 设成可 import 的名字即可 | 实测 |
| `passContext` | 支持（`validateN.call(this, …)`） | 生成产物 |
| `ownProperties` | 支持（`Object.prototype.hasOwnProperty`） | 生成产物 |
| `$dynamicRef`、跨资源 `$ref` | 支持 | 对拍 |
| ESM | 开 `code.esm` 后运行时 helper 仍写 `require("ajv/dist/runtime/…")`（`compile/index.js:46`），需 `createRequire` 前导或打包 | 文档 |
| 体积 | `code.source` 让每个函数的顶层 Schema 内联成字面量（`compile/index.js:62`）；messages 124 个常量 91 个无人用，剥掉只省 7% | `strip-schemas.mjs` |

生成产物：tool-definition 310 KB（0.2 s）；messages 1.04 MB（`inlineRefs:false` 863 KB；只取 ModelInvocationRecord 一个闭包 361 KB），0.7–1.1 s；元校验器 76 KB。

对拍：tool-definition 夹具子值 1,323 × 21 = 27,783 对，default／optimize0／inlineRefsFalse 三变体 0 不一致，53 条负例结论一致；
messages v8 夹具子值＋exact 关键字的数字与字符串变异（`1E+400`、`9007199254740993`、`1.0`、astral）10,772 × 54 = 581,688 对，0 不一致 0 抛错，夹具 `schemaValid` 45 行全对；
元校验器：仓库 35 个 schema 文件全部子值＋21 个手写变异 29,117 个，0 不一致。

messages 导入（5 轮交替中位数）：

| 配置 | 负载 6.7–7.7 | 负载 10.9–12.1 |
|---|---|---|
| 现状 | 761 ms | 1053 ms（CPU 998） |
| 现状＋NODE_COMPILE_CACHE | 718 | 967 |
| standalone | 35.0 | 34.5（CPU 36） |
| standalone＋NODE_COMPILE_CACHE | 11.8 | 14.5 |
| standalone 只取一个定义的闭包 | — | 19.3 |

单次校验两边一样，约 0.6–1 ms，主要在无损复制与数字投影这层包装。

现状拆分（单进程，负载 11–13）：建元校验器 40–58 ms；9 份资源元校验＋变换＋addSchema 约 260 ms；编译 54 个定义 895–1109 ms（CPU 约 790）；同进程再建一次 runtime 约 800 ms CPU（实例间不复用）。

vitest 4.1.11 探针（3 个 spec，`--maxWorkers=1`，负载 12–16，各 1 次）：现状每文件 2.0–2.9 s；standalone 被 vitest 内联（不在 node_modules 下）首个 1874 ms、之后 450–585 ms；
外部化（`server.deps.external`）或 `createRequire` 原生加载 38–124 ms。每个 spec 文件 pid 不同（按文件分进程）。**生成模块必须外部化。**

### 2. 按需与跨导入缓存

| 机制 | 结论 | 证据 |
|---|---|---|
| `module.enableCompileCache()`／`NODE_COMPILE_CACHE` | 只缓存模块文件的 V8 code cache，不管 `new Function` | https://nodejs.org/docs/latest-v24.x/api/module.html#module-compile-cache（v24.15 起非实验） |
| 对 Ajv 运行时 | 没用（761→718，噪声内） | 实测 |
| 对 standalone 文件 | 有用（35→12–15） | 实测 |
| vitest 下 | 没看到收益，未核实 | 实测 |
| 冷启动构成 | tool-definition 编译进程内第一次 457 ms、预热后 158 ms，约 2/3 是 Ajv 自身 JIT 预热 | 实测 |
| 只按需编译（`getSchema` 本就惰性） | 只编 ToolDefinition 一个定义 CPU 476→266 ms（引用闭包覆盖大部分定义），省不到一半 | 实测 |
| 按内容哈希磁盘缓存 | 没有通用成熟实现；自写原型 `hash-cache.mjs`（键 = sha256(Ajv 版本＋选项＋关键字／正则引擎源码＋资源＋导出名)，未命中生成、写临时文件再 rename，命中 `require(esm)`）：未命中 1.27 s，命中 65–89 ms（哈希占 30–50 ms） | 实测 |

现成预编译工具：`@fastify/ajv-compiler` `StandaloneValidator`（4.0.6，周下载 16M，只给 store／restore 钩子，CJS）；`ajv-cli compile`（5.0.0，2023-04，49 万，支持 `--spec=draft2020` 与 `-c` 关键字模块）；`ajv-build-tools`、`esbuild-plugin-ajv`（约 1）；`ajv-pack` 已归档。

### 3. 替代库（tool-definition 21 定义；5 轮中位数，负载 12.3–13.4；括号为负载约 7 单次）

| 库 | 2020-12 与跨资源 | 机制 | 首用（导入＋编译＋首次校验） | 一万次校验 | 对拍 | exact 语义 |
|---|---|---|---|---|---|---|
| Ajv 8.20 运行时 | 是 | JIT | 537 ms，CPU 476（230） | 81 ms（30） | 基准 | 能 |
| **Ajv standalone** | 是 | 生成代码 import | **28 ms，CPU 21**；＋compile cache 14（12） | 100（31） | 0 不一致 | 能（绕法 A） |
| typebox 1.3.34 | 自报全支持；资源嵌进 `$defs` 时 12 对栈溢出 | JIT；`Code()` 出 ESM 仍要 typebox 运行时 | 414（低负载 96＋99）；只编一个 216 | 144–175（56） | 0 | 不能（`~refine` 拿不到根与路径） |
| @sinclair/typebox 0.34 TypeCompiler | 不能处理普通 JSON Schema | — | — | — | 不可用 | — |
| @exodus/schemasafe 1.3.0 | 支持 | JIT；`toModule()` | 476（259） | **46（19）最快** | 0 | 不能（只支持自定义 format） |
| @cfworker/json-schema 4.1.1 | 支持（少量未支持项） | 解释 | 102（47） | 1235（537） | 0 | 不能 |
| @hyperjump/json-schema 1.17.8 | 最全 | 解释，异步 API | 675（307） | 1162（552） | 0 | 能（实验 API），太慢 |

### 4. Ajv 选项（预热后 15 轮，负载 13.4–13.9；新实例＋3 份资源＋21 定义）

默认 158 ms；`code.optimize:false` 99.6（−37%）；`validateSchema:false` 126.8（−20%）；两项 66.0（−58%）；`inlineRefs:false` 141（−11%）；`code.lines` +3%；`addUsedSchema:false` +5%。
冷启动新进程 CPU：默认 476、optimize:false 381、validateSchema:false 411、两项 339。全开仍比 standalone 导入（约 20 ms CPU）慢 15–20 倍。

### 子代理的推荐与风险（作为输入，非结论）〔推荐部分已删〕

〔删节：原文此处是一段「推荐」，内容是子代理为本项目拟的改造方案（拆包、生成流水线、运行时两面、防过期与测试配置）。按研究家族红线未收录，已交回派发者，供 #65 的提案使用。〕

风险：语义差异只会出在包装与关键字适配层；生成代码依赖同版本 `ajv/dist/runtime/*`，升级 Ajv 必须重生成；每包 0.3–1 MB，公共资源编进每个包；
改 Schema JSON 的变异要重生成才生效；已有隐患：`usePattern` 按 `rx.toString()` 去重（`code.js:75`），非 RegExp 匹配器都得到键 `"[object Object]"`（今天只有 InlineBytes 一个特例）。

未核实：其余约 22 个包（含 loop-extension 两个 runtime）没生成过；vitest 下 compile cache；外部化的副作用；25 个包总体积；动态编译点接哈希缓存；typebox README 自报数字。

## 本轮结论

见上文各节；主线复跑与核对的结果在 [evidence.md](../evidence.md) 的 E6–E13、E15、E16，与原文不一致处集中在 [冲突与不一致](../evidence.md#冲突与不一致)。

## 本轮局限

报告自列的「未核实」项照原文保留在正文末段；vitest 探针、哈希缓存原型、替代库耗时与 Ajv 选项四组数字主线未复跑。
