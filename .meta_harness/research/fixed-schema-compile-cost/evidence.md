# 可复核的来源与观察

本页按记录区分源码与文档取证、主线复跑、子代理转述三种取得方式；「取得方式」一栏只用这三个词之一开头：
**一手原文**（主线亲自读了源码或文档原文）、**复跑**（主线本轮重新执行并记下负载）、**仅转述，未核**（只有子代理报告，主线没有重跑或重读）。
子代理报告的原貌在 [reports/](reports/)，本页引用时写报告名与节。

版本 token（上游升级时 grep 这些）：仓库 `ff57fc8e3`（源码末次变更 `99d8a08af`）、`ajv@8.20.0`、Node `v24.21.0`、
`typebox@1.3.34`、`@sinclair/typebox@0.34.52`、`@exodus/schemasafe@1.3.0`、`@cfworker/json-schema@4.1.1`、`@hyperjump/json-schema@1.17.8`、
`@fastify/ajv-compiler@4.0.6`、`ajv-cli@5.0.0`、DSH `639ed015`、pi `a13d35a7`（1.0.0）、vitest `4.1.11`（只在转述记录里）。

测量环境（适用于下面所有计时）：同一台 8 核机器，与其它会话共用；每次测量前后记 `uptime` 的 load1。
计时脚本每个样本起一个新进程，同一轮里各配置交替执行，取中位数；**不同轮之间的绝对毫秒数不可直接比**，只比同轮内的比例。

## E1 issue 65 正文里的现象与剖析读数

- 消费对象：research.md C-1 的规模背景。
- 来源与精确修订：GitHub issue #65「schema 运行时：模块一加载就编译全部 JSON Schema，是测试导入与 CLI 启动的大头」，创建于 2026-10-02T14:14:23Z，状态 OPEN。
- 来源立场：仓库负责人当日实测（作者自述的测量，不是独立复现）。
- 取得方式：一手原文（`gh issue view 65 --json ...`，2026-10-02 读取）；其中的数字**未复跑**。
- 实际观察：用 node 直接导入 `packages/model/model-request-runtime/dist/index.js`，CPU 采样 8.8 秒，其中 Ajv 编译约 5.4 秒、content-blocks 为复制 schema 做的 JSON 读写与深拷贝约 1.2 秒（负载约 9）；
  `omne --help` 墙钟 2.7 秒，采样 3.1 秒里栈上有 Ajv 的占 2.2 秒；按包含时间排，loop-extension 2.4 秒（两个运行时）、messages 1.2、model-response 1.2、content-blocks 的 `exact-schema` 0.55 等；
  正文另称「每个运行时新编一份 Draft 2020-12 元校验器（`createExactMetaValidator`，约 0.5 秒）」。
- 支持范围：说明顶层编译在整张导入图里的量级；不支持任何一种改法的收益估计。「约 0.5 秒」一句与本轮实测冲突，见 [冲突与不一致](#冲突与不一致)。

## E2 本仓库在模块顶层编译固定 Schema 的位置

- 消费对象：C-1、C-2、C-6。
- 来源与精确修订：仓库 `a7ea39135` 工作树（子代理普查时）；主线抽查时 `ff57fc8e3`，被抽查的文件在两者之间没有变更。
- 取得方式：**仅转述，未核**（普查全表，见 [reports/2026-10-02-repo-survey.md](reports/2026-10-02-repo-survey.md)）；主线一手原文抽查了下列各处，均与报告一致：
  - `packages/core/messages/src/schema.ts:76-89`：顶层 `createSchemaRuntime([...9 份资源])`，随即对 54 个名字 `runtime.compile`。
  - `packages/core/loop-extension/src/schema.ts:99`、`:238-240`：两个运行时 `runtime` 与 `earlyRuntime`。
  - `apps/cli/src/tui/forms.ts:35-39`：顶层编译表单 Schema，加载时校验 `forms.json`，不合格即抛错。
  - `packages/core/tool-definition/src/schema.ts:39-52`：直接 `new Ajv2020({strict:true, strictTypes:false, strictRequired:false, ownProperties:true})`（`validateSchema` 取默认 `true`），三次 `addSchema`，顶层 `getSchema` 21 个。
  - `packages/model/pi-ai-transport/src` 搜 `typebox|ajv|validateTool|Compile` 无命中（pi 的 `validation.ts` 没有移植进 fork）。
  - 测试依赖「工厂构造时就编译」：`packages/core/asset-evaluation/tests/current-loop-body.spec.ts:53-57`（`createAssetModelJudge(wrong)` 同步抛错）、
    `packages/core/content-blocks/tests/schema-runtime.spec.ts:168-169`（非法资源构造当场抛 `TypeError`）。
  - 直接读已编译校验器属性：`packages/tenancy/governance-center-entry/tests/decide.spec.ts:205` 读 `entryValidator('EnvelopeRouteId').schema`。
  - 读 Ajv 的 `errors`：`packages/core/identity-values/src/validate.ts:58-60`。
- 实际观察：约 25 处在模块顶层（或模块级值初始化时）编译；其余位置、导出形状与「全部校验器可编译」类测试的覆盖见报告原文。
- 支持范围：位置与形状的地图；不支持各处耗时（只有 E1 的包含时间与 E9–E11 的三处实测）。

## E3 Ajv 8.20.0 源码里 standalone 与关键字的约束

- 消费对象：C-3、C-4、C-6、C-7、C-12。
- 来源与精确修订：`ajv@8.20.0`，仓库 `node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/`（`package.json` 的 `version` 为 `8.20.0`）。
- 来源立场：上游实现。
- 取得方式：一手原文（主线逐行读）。
- 实际观察：
  - `standalone/index.js:6-8`：实例没有 `code.source` 就抛 `moduleCode: ajv instance must have code.source option`；`:47-49`：校验函数没有 `source` 属性就抛错。
  - `compile/validate/keyword.js:87-91`（`useKeyword`）：`validate`／`compile` 型关键字的函数以 `gen.scopeValue("keyword", { ref: result })` 登记，**不带 `code`**；只有非函数结果才附 `code: stringify(result)`。
  - `compile/codegen/scope.js:5-9`：`ValueError` 的消息是 ``CodeGen: "code" for ${name} not defined``；`:107-112` `scopeCode` 取 `name.value.code`；`:133-135` 取不到就抛这个错。
  - `compile/codegen/scope.js:71-92`（`value`）：同一前缀下按 `value.key ?? value.ref` 去重，已有就直接返回旧名字（`:77-82`）。
  - `vocabularies/code.js:70-79`（`usePattern`）：`key: rx.toString()`（`:75`），`code` 在引擎的 `code` 不是 `"new RegExp"` 时走 `useFunc`。
  - `compile/util.js:142-147`（`useFunc`）：把函数的 `code` 字符串原样包成代码片段，作为标识符或表达式写进生成代码。
  - `compile/index.js:62-64`：开 `code.source` 时，每个被编译 Schema 的顶层对象以 `stringify(sch.schema)` 内联为字面量；`:89`：校验函数由 `new Function(...)` 生成；
    `:93-94`：运行时编译出的函数带 `validate.schema`、`validate.schemaEnv`；`:46`：只有 `$async` 时引入 `require("ajv/dist/runtime/validation_error")`。
  - `runtime/{equal,ucs2length,uri,quote,timestamp,re2,parseJson}.js`：各自的 `.code` 都是 `'require("ajv/dist/runtime/…")'` 字符串。
  - `core.js:273-286`（`getSchema`）：首次请求才编译，结果挂在 `sch.validate` 上复用；`:435-462`（`_addSchema`）：按 Schema **对象身份**查 `_cache`（`:447-449`），`validateSchema` 为真时在 `addSchema` 当场元校验（`:460-461`）。
- 支持范围：Ajv 8.20.0 的这几条行为；不支持其它版本。`validate` 型关键字在 standalone 下失败这一条另有构造验证（E6）。

## E4 Ajv standalone 官方文档

- 消费对象：C-3、C-6、C-10。
- 来源与精确修订：`https://raw.githubusercontent.com/ajv-validator/ajv/v8.20.0/docs/standalone.md`（与 https://ajv.js.org/standalone.html 同源），2026-10-02 抓取，sha256 `6288c005d1794847292d53355d78c1ff67f4885cf9b6ac89ed8163469695b8f8`。
- 来源立场：作者自述。
- 取得方式：一手原文。
- 实际观察（原文）：
  - 第 239–241 行：「Ajv option `code.source` must be set to `true`」「only `code` and `macro` user-defined keywords are supported」「when `code` keywords define variables in shared scope using `gen.scopeValue`, they must provide `code` property with the code snippet」。
  - 第 231 行：「The standalone generated functions still has a dependency on the Ajv. Specifically on the code in the runtime folder of the package.」
  - 第 7 行：「if you have a large number of schemas the bundle can become bigger - when the total size of generated validation code is bigger than Ajv code」。
  - 第 11 行：standalone「supersedes the deprecated package ajv-pack」。
  - 第 21 行称 ESM 输出是「exports & import」；文档**没有**说明开 `code.esm` 后运行时 helper 仍以 `require(...)` 引入——这一条的依据是源码（E3 的 `runtime/*.js`）与生成产物（E8），不是文档。
- 支持范围：上游宣称的支持边界；文档与源码在 ESM 一点上的表述差异见 [冲突与不一致](#冲突与不一致)。

## E5 content-blocks 的 exact 关键字与正则引擎

- 消费对象：C-3、C-4、C-6、C-9、C-12。
- 来源与精确修订：仓库 `ff57fc8e3`，`packages/core/content-blocks/src/`。
- 取得方式：一手原文。
- 实际观察：
  - `exact-schema.ts:1-9`：模块顶层 `import { Ajv2020 }` 与 8 份 Draft 2020-12 元 Schema JSON；`:424-439`：加载时把这 8 份做无损复制并冻结（`fixedMetaResources`）。
  - `exact-schema.ts:156-315`（`installExactKeywords`）：16 个关键字——`exact_{min,max}{Length,Items,Properties}`（6 个，`:165-196`）、`exact_uniqueItems`（`:197-214`）、`exact_type`（`:215-241`）、
    `exact_{minimum,maximum,exclusiveMinimum,exclusiveMaximum,multipleOf}`（5 个，`:249-274`）、`exact_integer`（`:276-292`）、`exact_{const,enum}`（2 个，`:294-314`）——**全部以 `validate:` 定义**（`:169`、`:201`、`:219`、`:253`、`:280`、`:298`），`errors: false`，第三个参数都命名为 `_schema` 且函数体不读它。
  - `exact-schema.ts:131-149`（`original`）：从 `this.root` 与 `context.instancePath` 回取未经数字投影的原值；缺这两样就抛 `missing exact Schema invocation context`。
  - `schema-pattern.ts:30-36`：`schemaPattern` 只在 `source` 恰为 InlineBytes 那一条且 `flags === 'u'` 时返回 `{ test: inlineBytes }`，其余一律 `new RegExp`；引擎的 `code` 是 `'schemaPattern'`。
  - `schema-runtime.ts:59-117`（`createSchemaRuntime`）：每次调用新建一个元校验器（`:63`）与一个 Ajv 实例（`:75-83`，`validateSchema:false`、`passContext:true`、引擎 `code` 为 `'schemaRuntimePatternFactory'`）；
    调用方给的 `patternFactory` 必须返回原生、非 `g`／`y` 的 `RegExp`（`:69-70`）；每份资源复制、元校验、变换后 `addSchema`（`:89-98`）；`validate` 每次调用都做无损复制与数字投影（`:110-113`）。
- 支持范围：现有关键字的类型与 exact 语义依赖的调用上下文；不支持「改写后语义不变」——那是 E7 对拍的范围。

## E6 validate 型关键字与现有正则引擎直接喂给 standalone

- 消费对象：C-3。
- 来源与精确修订：Ajv `8.20.0`（仓库那份）、content-blocks `dist/`（2026-10-02 10:13 构建）。
- 取得方式：复跑（`research-libs/probe-validate-keyword-fails.mjs`，2026-10-02 约 16:00）。
- 实际观察：
  ```json
  { "validateKeywords": "throws: CodeGen: \"code\" for keyword0 not defined",
    "patternEngine": "const func0 = schemaPattern;const pattern4 = func0(\"^a\", \"u\");",
    "patternEngineLoads": "throws: schemaPattern is not defined" }
  ```
  与子代理报告一致。
- 支持范围：构造验证——现有 16 个 `validate` 型关键字原样生成会抛错；引擎 `code` 为 `'schemaPattern'` 时生成的模块加载即报未定义。不支持 `macro` 型能否承载 exact 语义（未试）。

## E7 standalone 产物与运行时 Ajv 的对拍

- 消费对象：C-4。
- 来源与精确修订：messages 的 54 个公开定义（`packages/core/messages/dist/schema.js` 的 `SCHEMA_DEF_NAMES`），值取自 `.meta_harness/design/spec/data/messages/v8/` 的 `ack-examples.json`、`input-limit-examples.json`、`reference-examples.json` 全部嵌套子值；
  生成产物 `research-libs/out/messages.standalone.mjs`（sha256 `45240c91…7327`，见 E8）。
- 方法：一边是仓库 `messages` 的 `validate(def, v)`（经 `createSchemaRuntime`，`validate` 型关键字）；另一边是 standalone 函数，exact 关键字改写为 `code` 型、调用同一批函数
  （`build-messages.mjs` 的 `codeKeyword`：`gen.scopeValue('keyword', { ref: def.validate, code: _\`__exact[...]\` })`，生成 `fn.call(this, schemaCode, data, undefined, {instancePath})`），
  调用前做与 `createSchemaRuntime` 相同的复制与投影。full 模式另对每行顶层值的每个数字叶子换 9 种写法（含 `1E+400`、`9007199254740993`、`1.0`、`-0`）、每个字符串叶子换 6 种（含空串、astral、300 字符）。
  standalone 一侧的 exact 函数来自 `exact-keywords-noajv.mjs`——由 `gen-exact-noajv.mjs` 从 `content-blocks/dist/exact-schema.js` 机械删去 Ajv 与元 Schema 的 import、截掉 `singleSchemas` 之后的部分得到，不是真实的包拆分。
- 取得方式与观察：

  | 模式 | 取得方式 | 时间与负载 | 值 × 定义 = 对数 | 运行时判真 | 不一致 | 抛错 | 夹具 `schemaValid` 列 |
  |---|---|---|---|---|---|---|---|
  | quick（只夹具子值） | 复跑 | 15:56:47，load1 10.05→9.73，8.5 s | 1,994 × 54 = 107,676 | 9,917 | 0 | 0 | 45 行全对 |
  | full（加变异） | 复跑 | 15:57:19 起，load1 9.74→16.69，761 s | 10,772 × 54 = 581,688 | 12,796 | 0 | 0 | 45 行全对 |
  | full | 子代理（报告原值） | 未记 | 581,688 | 未报 | 0 | 0 | 45 行全对 |
  | tool-definition 21 定义 × 三种产物变体 | 仅转述，未核 | — | 1,323 × 21 = 27,783 | — | 0 | — | 53 条负例一致 |
  | 元校验器（含 `$dynamicRef`） | 仅转述，未核 | — | 29,117 | — | 0 | — | — |
  | 保留 `validate` 型、预注册 scope 值的变体 | 仅转述，未核 | — | 107,676 | — | 0 | — | — |
- 支持范围：在这组输入上两侧布尔判定一致。**不支持**：等价证明；对拍集里判真的只占 2.2%（12,796／581,688），绝大多数是「值不属于该定义」的平凡负例；
  只比了布尔结果，没有比 `errors` 内容；其余约二十个包、loop-extension 的两个运行时、model-response 的成员校验器都没有生成过。

## E8 生成产物的体积、构建耗时与可重现性

- 消费对象：C-4、C-6。
- 取得方式：复跑（体积从磁盘读、重生成两次比 sha256）；内联常量「91 个无人用」一条仅转述，未核。
- 实际观察：
  - 2026-10-02 约 16:00（load1 约 10）重跑 `node build-messages.mjs` 两次：源码 1,037,546 字符、`buildMs` 1,384、`schemaConsts` 124、`patternConsts` 8、`keywordRefs` 9、`requires` 为空；
    两次产物与原有文件 sha256 都是 `45240c919d3eb6bf60dad7f7c249a7f13fa01d48f9b6d9b51349d0206df47327`，`exact-runtime.mjs` 都是 `4495dc5979ad93b602f053dfa51e866d490f0610345ffc8eb0d7c2626eac7120`。
  - 磁盘体积（字节，UTF-8；中文 description 使字节数高于字符数）：messages 全部 54 个 1,070,552；`inlineRefs:false` 895,833；只取 `ModelInvocationRecord` 一个闭包 374,150；剥掉未引用常量 993,133（−7.2%）；
    tool-definition 默认 323,729、`code.optimize:false` 352,572、`inlineRefs:false` 306,842；元校验器 76,458。
  - 产物开头即是内联的 Schema 字面量（含 `title`、`description`、`$comment`、`examples`），与 E3 `compile/index.js:62-64` 一致。
  - `require(...)`：messages 产物 0 处（exact 关键字替掉了 `minLength`、`uniqueItems` 等会引入 `ucs2length`、`equal` 的原生关键字）；tool-definition 产物（不做 exact 变换）有 `require("ajv/dist/runtime/equal")`、`require("ajv/dist/runtime/ucs2length")` 各 1 处。
  - 生成函数不带 `.schema`、`.schemaEnv`（messages 产物里 `.schema =`／`.schemaEnv =` 0 处，只有 `validateN.evaluated = `）。
- 支持范围：同一台机器、同一 Node 与 Ajv 版本下生成结果逐字节可重现；不支持跨 Node／Ajv 版本可重现，也不支持其余包的体积。

## E9 messages 的导入耗时矩阵

- 消费对象：C-1、C-5、C-7。
- 方法：`research-libs/matrix.mjs <轮数> messages`，每个样本 `bench-messages.mjs` 起新进程，**计时开始前先导入 content-blocks 的 `dist/index.js`**（两侧都不计 content-blocks 自己的顶层编译）；
  `repo` = 导入 `packages/core/messages/dist/schema.js`；`standalone` = 导入生成模块并套同样的复制与投影包装；`NODE_COMPILE_CACHE` 指向一个先预热过的目录；`oneKMs` = 1,000 次 `ModelInvocationRecord` 校验。
- 取得方式与观察（中位数，ms；括号内为导入 CPU ms）：

  | 配置 | 子代理 5 轮，load1 6.71–7.68 | 子代理 5 轮，load1 10.92–12.05 | **复跑** 3 轮，16:12，load1 7.94–8.68 |
  |---|---|---|---|
  | 现状（导入时 Ajv 编译） | 761.4 | 1,052.7（998.3） | 621.5（908.0） |
  | 现状 + `NODE_COMPILE_CACHE` | 717.5 | 967.4（1,014.1） | 674.2（927.7） |
  | standalone | 35.0 | 34.5（35.9） | 39.5（41.5） |
  | standalone + `NODE_COMPILE_CACHE` | 11.8 | 14.5（16.2） | 11.6（13.3） |
  | standalone，不预热 content-blocks | 39.4 | 42.5（42.3） | 37.9（40.8） |
  | standalone，`inlineRefs:false` | — | 37.4（34.7） | 33.7（35.8） |
  | standalone，只取一个定义的闭包 | — | 19.3（16.9） | 10.0（11.5） |
  | 1,000 次校验，现状／standalone | 774／651 | 930／908 | 670／720 |
- 原始输出：子代理 `research-libs/results/matrix-messages.txt`、`matrix-messages-2.txt`（主线核对过与报告数字一致）；复跑 `draft-65-sources/rerun-matrix-messages-3.txt`。
- 支持范围：同轮之内「现状 ≫ standalone」与「compile cache 对现状无可辨收益、对 standalone 有」三组都成立；绝对值随负载漂移（现状 621–1,053 ms）。
  「只取一个闭包」两轮差近一倍（19.3 对 10.0），只有 3–5 个样本，不支持精确到个位毫秒的比较。不支持整张导入图或 vitest 下的数字。

## E10 createSchemaRuntime 的分段与元校验器

- 消费对象：C-1、C-5。
- 方法：`bench-breakdown.mjs`（单进程，先导入 content-blocks 预热，再依次计：建元校验器两次、`createSchemaRuntime` 9 份资源、编译 54 个定义、同进程再建一套完整运行时并编译）；`matrix.mjs 3 meta`（新进程里 `createExactMetaValidator()` 对导入元校验器的 standalone 产物）。
- 取得方式与观察（ms，括号内 CPU ms）：

  | 段 | 子代理（load1 11–13，单次） | **复跑**（16:13，load1 6.75，单次） |
  |---|---|---|
  | 建元校验器，第一次／第二次 | 40–58 | 56.9（58）／44.7（47） |
  | `createSchemaRuntime` 构造（含其内部新建的一个元校验器与 9 份资源的复制、元校验、变换、`addSchema`） | 约 260 | 149.6（215） |
  | 编译 54 个定义 | 895–1,109（约 790） | 426.4（588） |
  | 同进程再建一套并编译 54 个 | 约 800 CPU | 433.4（639） |
  | 新进程 `createExactMetaValidator()` 对 standalone 导入 | 107 对 5.6（无原始文件，仅转述） | **复跑** 3 轮：78.7（89.3）对 5.2（6.9） |
- 支持范围：编译定义是一套运行时里最大的一段（复跑约占 74%）；同进程第二套运行时的成本与第一套同量级，Ajv 实例之间不复用编译结果（与 E3 `_cache` 按实例、按对象身份一致）。单次计时，不支持细到十毫秒的比较。

## E11 tool-definition 上的按需编译对照

- 消费对象：C-2、C-5。
- 方法：`bench-tooldef.mjs`，Ajv 选项与 `packages/core/tool-definition/src/schema.ts` 相同（`validateSchema` 取默认 `true`、无 exact 关键字），三份资源（content-blocks、asset-model、tool-definition）只读 JSON、不经 dist；
  `all` = `getSchema` 全部 21 个定义，`one` = 只取 `ToolDefinition`；`firstUse` = 导入库 + 建实例 + 编译 + 第一次校验。复跑用的交替脚本是 `draft-65-probes/rerun-tooldef-ondemand.mjs`（只调用 `bench-tooldef.mjs`，不改它）。
- 取得方式与观察（中位数）：

  | 配置 | 子代理 5 轮，load1 12.30–13.35 | **复跑** 5 轮，16:12，load1 8.02–8.58 |
  |---|---|---|
  | Ajv 运行时，全部 21 个：firstUse ms（CPU） | 537.2（476.0） | 385.5（468.5） |
  | Ajv 运行时，只 `ToolDefinition`：firstUse ms（CPU） | 318.1（266.0） | 218.7（266.8） |
  | standalone 模块：firstUse ms（CPU） | 28.2（20.7） | 14.9（17.1） |
  | 一万次校验 ms：全部／只一个／standalone | 81.0／97.5／99.6 | 51.1／47.9／55.3 |

  另：子代理报告同进程里第一次建实例编译 457 ms、预热后 158 ms（仅转述，未核）。
- 支持范围：只编一个定义 CPU 降 43%–44%，两轮一致；不支持把这个比例套到 messages、loop-extension 等经 `createSchemaRuntime` 的包（未测）。

## E12 Ajv 选项对编译耗时的影响

- 消费对象：C-8。
- 取得方式：**仅转述，未核**（未复跑）；主线核对了原始结果文件 `research-libs/results/q4-inprocess.txt` 与 `matrix-tooldef-2.txt`，数字与报告一致。
- 实际观察：同进程预热后、每样本新建实例 + 3 份资源 + 21 个定义，15 轮（load1 13.43→13.86）：默认 158.0 ms；`code.optimize:false` 99.6（−37%）；`validateSchema:false` 126.8（−20%）；两项都关 66.0（−58%）；
  `inlineRefs:false` 141.2（−11%）；`code.lines:true` +3%；`addUsedSchema:false` +5%。冷启动新进程 firstUse CPU：默认 476.0、`optimize:false` 381.2、`validateSchema:false` 411.3、两项 339.4。
- 支持范围：tool-definition 一处、直接 Ajv 用法；`createSchemaRuntime` 的主实例与元校验器实例已经是 `validateSchema:false`（E5），那 20% 对它们已经不存在。

## E13 Node 模块编译缓存的官方文档

- 消费对象：C-7。
- 来源与精确修订：`https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/module.md`，2026-10-02 抓取，sha256 `94647ba08114b86f1b8845f00542ef697b715a16be8bd971ed0bb4504639f3e1`。
- 来源立场：作者自述。
- 取得方式：一手原文。
- 实际观察（原文）：
  - 「Module compile cache」节：启用后「whenever Node.js compiles a CommonJS, an ECMAScript Module, or a TypeScript module, it will use on-disk V8 code cache」，
    「subsequent loads of the same module graph may get a significant speedup if the contents of the modules do not change」，「This may slow down the first load of a module graph」。
  - 缓存在进程即将退出时才写盘（「will only be written to disk when the Node.js instance is about to exit」），可用 `module.flushCompileCache()` 提前写。
  - 「typically only reusable in the same version of Node.js」；默认按模块绝对路径失效，`portable` 选项（v24.12.0 起）按相对布局复用。
  - Limitations：与 V8 覆盖率同用时「the coverage being collected by V8 may be less precise in functions that are deserialized from the code cache. It's recommended to turn this off when running tests to generate precise coverage.」
  - `module.enableCompileCache` 的 changes：v24.15.0「This feature is no longer experimental」。
- 支持范围：文档列举的适用对象只有模块编译；**该节没有提到 `new Function` 或 `eval`**——这是「读遍该节未见」级的负面读数，不是构造验证。对运行时 Ajv 无可辨收益的实测见 E9。

## E14 vitest 下生成模块的加载方式

- 消费对象：C-6、C-7。
- 取得方式：**仅转述，未核**（子代理 vitest `4.1.11` 探针，3 个 spec、`--maxWorkers=1`、load1 12–16、各 1 次）。
- 实际观察（报告原值）：现状每文件 2.0–2.9 s；生成模块不在 `node_modules` 下时被 vitest 内联转换，首个 1,874 ms、之后 450–585 ms；
  用 `server.deps.external` 外部化或 `createRequire` 原生加载为 38–124 ms；每个 spec 文件的 pid 不同。vitest 下开 compile cache「没看到收益」。
- 支持范围：单次样本，只能作量级参考；vitest 配置项的语义未对照官方文档核对。

## E15 替代库的能力与耗时

- 消费对象：C-9。
- 来源与精确修订：上述五个包，安装在 `research-libs/node_modules`。
- 取得方式：能力一项**一手原文**（主线读源码与类型），耗时与对拍**仅转述，未核**（原始结果文件 `matrix-tooldef-2.txt` 已核对与报告一致）。
- 实际观察：
  - `typebox@1.3.34`：`build/schema/types/_refine.d.mts` 的 `XRefinement` 是 `check: (value: unknown) => boolean`；`build/schema/engine/_refine.mjs:9`、`:24` 都只以 `value` 调用 `refinement.check`——拿不到根值与实例路径。
  - `@exodus/schemasafe@1.3.0`：`src/compile.js:80-111` 的选项全集里没有自定义关键字一项，只有 `formats`／`extraFormats`；未知选项直接抛 `Unknown options`；未知关键字默认抛 `Keyword not supported`（`:271`），`lax`／`spec` 模式下则忽略（`:88`）。
  - `@cfworker/json-schema@4.1.1`：`dist/` 下搜 `addKeyword|customKeyword|keywords` 无命中；README 自述「not the fastest due to lack of code generation」并列出有意不支持的测试用例。这一条是「读遍导出未见」级。
  - `@sinclair/typebox@0.34.52` 的 `TypeCompiler` 不能处理普通 JSON Schema、typebox 1.x 把资源嵌进 `$defs` 时 12 对栈溢出、hyperjump 以实验 API 能表达 exact 语义：均仅转述。
  - 耗时（子代理，tool-definition 21 定义，5 轮中位数，load1 12.3–13.4）：firstUse（导入 + 编译 + 首次校验）Ajv 运行时 537 ms、standalone 28、typebox 414（只编一个 216）、schemasafe 476、cfworker 102、hyperjump 675；
    一万次校验 Ajv 81、standalone 100、typebox 144、schemasafe 46、cfworker 1,235、hyperjump 1,162；对拍各 0 不一致。
- 支持范围：exact 语义依赖「投影值 + 按根与路径回取原值」（E5 `original`），上面三项能力读数说明这三个库的扩展点给不出这两样；不支持「换一种不需要投影的 exact 实现之后这些库也不行」——那种结构未调查。只比了五个库，未做更广的检索。

## E16 现成的预编译工具与哈希缓存原型

- 消费对象：C-10。
- 取得方式：npm 元数据**一手原文**（`npm view`，2026-10-02）；工具的钩子形状与哈希原型**仅转述，未核**。
- 实际观察：
  - `@fastify/ajv-compiler@4.0.6`：最新、2026-08-08 更新、`type: commonjs`、依赖 `ajv ^8.12.0`；报告称自带 `StandaloneValidator({ readMode, storeFunction, restoreFunction })`，只给存取钩子。
  - `ajv-cli@5.0.0`：最新、2023-04-28 后无更新、依赖 `ajv ^8.0.0`；报告称支持 `--spec=draft2020` 与 `-c` 加载关键字模块。
  - `ajv-pack@0.3.1`：Ajv 文档称其已被 standalone 取代（E4 第 11 行）。
  - 哈希缓存原型 `research-libs/hash-cache.mjs`：键 = sha256(Ajv 版本 + 选项 + 关键字与正则引擎源码 + 资源 + 导出名)，未命中则生成、写临时文件再 rename，命中则 `require(esm)`；报告值未命中 1.27 s、命中 65–89 ms（其中哈希 30–50 ms）。
  - 报告列的其余候选 `ajv-build-tools`、`esbuild-plugin-ajv` 周下载约 1。
- 支持范围：「没有找到成熟的按内容哈希缓存实现」只覆盖子代理检索过的这几项，是读数缺口级；本轮未扩检。

## E17 同行 pi 1.0

- 消费对象：C-11。
- 来源与精确修订：pi `a13d35a7`，`packages/ai/package.json` 与 `packages/coding-agent/package.json` 的 `version` 都是 `1.0.0`；归档 `tmp/sources/pi-a13d35a.tar.gz`（主检出），解包在会话临时目录 `research-peers/pi-a13d35a/`。
- 取得方式：一手原文（主线抽查下列各处）。
- 实际观察：
  - `packages/ai/src/utils/validation.ts:1` `import { Compile } from "typebox/compile"`；`:6` `const validatorCache = new WeakMap<object, ReturnType<typeof Compile>>()`；`:271-280` `getValidator` 首次用到才 `Compile(schema)`，按 Schema 对象身份缓存；`:317-322` `validateToolArguments` 先 `structuredClone`、`Value.Convert` 再取校验器。
  - 并非处处首用：`packages/coding-agent/src/modes/interactive/theme/theme-json.ts:99` `const compiledThemeSchema = Compile(ThemeJsonSchema)`、`packages/coding-agent/src/core/model-config.ts:245` `const validateModelsConfig = Compile(ModelsConfigSchema)` 都在模块顶层。
  - `scripts/build-coding-agent-bundle.mjs:229-231`：打包出的 CLI 启动器先 `enableCompileCache()` 再加载运行时。
  - 全仓 `package.json` 无 `"ajv` 依赖。
  - 报告里的提交史（`0e932a97d`、`0d7c81ec9`、`35ff2689e` 关于禁 eval 环境）与 TypeBox `CanEvaluate`／`Code()` 的细节：仅转述，未核。
- 支持范围：pi 1.0 的工具参数校验是首用编译 + 进程内按对象身份缓存，没有跨进程缓存（报告的探针词 `enableCompileCache`、`Code(`、`standalone`、`cache`；主线只复核了前一项的位置）。

## E18 同行 DSH

- 消费对象：C-11。
- 来源与精确修订：DSH `639ed015`（2026-09-29），归档 `tmp/sources/dsh-639ed01.tar.gz`（主检出），解包在会话临时目录 `research-peers/dsh-639ed01/`。
- 取得方式：一手原文（主线抽查下列各处）。
- 实际观察：
  - `packages/boot/app-boot/src/config-schema/projector.ts:150`：`const { Ajv2020 } = await import('ajv/dist/2020.js')`——Ajv 只在这一处运行时动态导入。
  - `.agents/notes/implemented/architecture/2026-07-20-unified-json-value-schema-dsl.md:25`：「Adopt full JSON Schema or Ajv: rejected because the harness must fail on every construct it cannot project into its generated SDK and validators; accepting a larger language would make enforcement and model guidance dishonest.」
  - `.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md:70`：拒绝 Ajv 的理由是子集门仍要手写、「it compiles validators through `new Function`」、会成为 dsh-tools 的第一个运行时依赖。
  - `.agents/notes/rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md:33`：拒绝的理由是 schema-DSL 笔记已拒绝更大的 Schema 语言，且「the validator also does realm-intrinsic prototype checks Ajv does not」。
  - `.agents/notes/archived/architecture/2026-06-11-runtime-arg-validation.md:23`：「Validation cost is negligible next to a model call.」——说的是每次校验的运行成本，不是导入时的编译成本。
  - 报告里的工具参数解释型校验器（`packages/core/tools/src/schema.ts:577-598`、`json-schema.ts:487,654`）、Typert「构建期生成、首用 `??=` 物化」、Cordis `resolveConfig`、CI 的 `NODE_COMPILE_CACHE`：仅转述，未核。
- 支持范围：DSH 拒绝 Ajv 的记录理由是语义（只接受能执行的子集）、`new Function` 与依赖数，**不是编译开销**；其前提是收窄的 Schema 词汇表。

## E19 其它同行与库

- 消费对象：C-11。
- 取得方式：**仅转述，未核**。
- 实际观察（报告原值）：Kimi（`~/.kimi-code/bin/kimi`）经 MCP SDK 1.29.0 的 `AjvJsonSchemaValidator` 首用编译、`Client` 进程内 Map 缓存；Cursor `2026.08.04` 用 Ajv 8.18、无 `standaloneCode`；
  zod 4（仓库装 4.6.5）对象 JIT 首次同步 parse 才生成、按 Schema 实例缓存。
- 支持范围：量级参考，不作结论依据。

## E20 Ajv 按 toString 去重 pattern 的反例

- 消费对象：C-12。
- 来源与精确修订：Ajv `8.20.0`（仓库那份）、Node `v24.21.0`、content-blocks `dist/schema-pattern.js`（2026-10-02 10:13 构建）。
- 取得方式：复跑——主线自建探针 `draft-65-probes/pattern-key-collision.mjs`，2026-10-02 约 16:05。
- 方法：正则引擎对 `^a+$`、`^b+$` 各返回一个**非 RegExp** 的 `{ test }` 匹配器，其余返回 `new RegExp`；核心片段：
  ```js
  const engine = Object.assign(
    (source, flags) => source === '^a+$' ? { test: s => /^a+$/u.test(s) }
      : source === '^b+$' ? { test: s => /^b+$/u.test(s) } : new RegExp(source, flags),
    { code: 'engine' })
  const ajv = new Ajv2020({ strict: false, code: { regExp: engine } })
  const v = ajv.compile({ type: 'object', properties: {
    a: { type: 'string', pattern: '^a+$' }, b: { type: 'string', pattern: '^b+$' } } })
  v({ b: 'bbb' }) // 应为 true
  v({ b: 'aaa' }) // 应为 false
  ```
- 实际观察：

  | 情形 | 应得 | 实得 |
  |---|---|---|
  | 同一 Schema 两个非 RegExp pattern：`b:"bbb"`／`b:"aaa"` | true／false | **false／true** |
  | 同一实例分两次 `compile`（`validateSchema:false`）：第二个 Schema 判 `"bbb"`／`"aaa"` | true／false | **false／true** |
  | 对照：两个都用原生 RegExp | true／false | true／false |
  | standalone 生成同一 Schema：`const patternN` 声明个数 | 2 | **1**（`const pattern0 = func0("^a+$", "u");`） |

  pattern 作用域的键集为 `["/^[^#]*#?$/u", "/^[A-Za-z_][-A-Za-z0-9._]*$/u", "[object Object]"]`——两个非 RegExp 匹配器共用一个键。
  今天的 `schemaPattern`：InlineBytes 在 `flags` 为 `'u'` 时返回非 RegExp（`String(...)` 为 `[object Object]`），其余与 `flags` 为空时都返回 RegExp。InlineBytes pattern 出现在 `content-blocks.schema.json` 与 `content-blocks.v2.schema.json`。
- 支持范围：构造验证——Ajv 8.20.0 下，同一实例里出现第二个返回非 RegExp 的 pattern 时，后者静默复用前者的匹配器，运行时与 standalone 生成都如此；
  今天只有一个这样的特例，所以现有判定不受影响。未检索 Ajv issue tracker 是否已有报告。

## E21 设计正文对「加载时编译」的要求

- 消费对象：C-1、C-2。
- 来源与精确修订：`.meta_harness/design/realization/packages/core/` 下的节点正文，仓库 `ff57fc8e3`。
- 取得方式：一手原文（主线逐句核对下列五处；子代理报告另列的约十处未逐一核）。
- 实际观察：
  - [loop-extension v6-design.md](../../design/realization/packages/core/loop-extension/v6-design.md) 第 78 行（由 D-100 采用）：「模块加载时编译固定 Schema 图；完整编译后提供纯函数 | 模块持有只读验证器；缺依赖/无效资源使初始化明确失败，不发布部分可用图」。
  - [model-response v5-design.md](../../design/realization/packages/core/model-response/v5-design.md) 第 108 行：「Schema 编译/模块解析只属于静态制品初始化，缺文件或编译错误必须暴露为构建/导入缺陷，不伪装为 malformed」；第 138 行 MR5-PV6：「变异已导入 JSON 后，固定编译器不串版」。
  - [tool-definition design.md](../../design/realization/packages/core/tool-definition/design.md) 第 126 行：「模块级只有本包自己 Schema 的校验函数，加载时编一次，有界、不变」；
    [tool-definition verification.md](../../design/realization/packages/core/tool-definition/verification.md) 第 33 行：「编译作者 schema 的 ajv 实例不得出现在模块顶层；本包自己 Schema 的校验函数是有界常量，不在此列」。
  - [content-blocks design.md](../../design/realization/packages/core/content-blocks/design.md) 第 169 行：「编译器/缓存归构造它的调用方随引用释放，标准元Schema是固定输入，不建立module增长作者cache」；第 175 行迁移门含「修改资源/作者Schema不改绑定validator」。
  - 「no module-level author cache」的来源 mainline-self-rulings-2026-09 的 M50：tool-definition 参数判定「不设模块级缓存」，编译产物由消费者持有的判定对象持有。
- 支持范围：这几处约束的是「何时编译、失败何时暴露、作者 Schema 的缓存归谁」；它们针对作者／对端输入的缓存，不针对本包固定 Schema 的编译产物（tool-definition verification 第 33 行明文把后者排除在外）。

## 冲突与不一致

| 事项 | 一方 | 另一方 | 本轮处理 |
|---|---|---|---|
| 元校验器的成本 | E1：issue 称每个运行时的 `createExactMetaValidator`「约 0.5 秒」 | E10：同进程 45–57 ms、新进程 78.7 ms（复跑）／107 ms（转述） | 两者并存。推断（未验证）：issue 的 0.5 秒与其剖析里 `exact-schema` 的包含时间 0.55 秒同量级，可能是整张导入图里多次构造的合计，而非单次；区分实验见 research.md「未知」 |
| messages 导入的绝对值 | 子代理 761 ms（load1 约 7）、1,053 ms（load1 约 11.5） | 复跑 621.5 ms（load1 约 8.3） | 三个数照实并列；只比同轮比例 |
| 只取一个闭包的 standalone 导入 | 子代理 19.3 ms | 复跑 10.0 ms | 并列；样本 3–5 个，不支持个位毫秒的结论 |
| ESM 输出里的 `require` | E4：文档称 ESM 输出是「exports & import」 | E3／E8：运行时 helper 的 `.code` 是 `require(...)` 字符串，tool-definition 产物里实际出现 2 处 | 以源码与产物为准；文档没有说明这一点。子代理报告把这条的证据写成「文档」，属误标 |
| 内联原因 | 子代理：`code.source` 让「每个函数的顶层 Schema」内联 | E3 `compile/index.js:62-64` | 一致 |

## 探路件清单与复现命令

全部在会话临时目录，**可能已清理**；目录前缀 `S=/tmp/claude-1001/-data-qiwei-repos-omne-harness-lite/0d12f3b6-aa72-4661-a80c-d0422eb23a91/scratchpad`。
探路件只读仓库（`common.mjs` 里 `REPO` 指向工作树 `test-tiers-mutation`，要求 `packages/core/*/dist` 已构建）。

| 位置 | 是什么 | 复现 |
|---|---|---|
| `$S/research-libs/package.json`、`node_modules/` | 替代库与 Ajv 的安装（`npm install` 于 2026-10-02） | — |
| `$S/research-libs/common.mjs` | 仓库路径、读取 workspace 的 Schema JSON、中位数 | — |
| `$S/research-libs/build-messages.mjs` | messages 的 standalone 生成（`code` 型 exact 关键字、`__schemaPattern` 引擎、`createRequire` 前导） | `node build-messages.mjs [default\|inlineRefsFalse\|optimize0\|prereg\|one]` |
| `$S/research-libs/gen-exact-noajv.mjs` → `exact-keywords-noajv.mjs` | 从 `content-blocks/dist/exact-schema.js` 机械截出不 import Ajv 的 exact 函数 | `node gen-exact-noajv.mjs` |
| `$S/research-libs/check-messages.mjs` | E7 对拍 | `node check-messages.mjs default quick`；`node check-messages.mjs default`（复跑 761 s） |
| `$S/research-libs/probe-validate-keyword-fails.mjs` | E6 | `node probe-validate-keyword-fails.mjs` |
| `$S/research-libs/matrix.mjs` + `bench-messages.mjs`、`bench-meta.mjs`、`bench-tooldef.mjs` | E9、E10、E11、E15 的交替计时 | `node matrix.mjs 3 messages`；`node matrix.mjs 3 meta`；`node matrix.mjs 5 tooldef` |
| `$S/research-libs/bench-breakdown.mjs` | E10 分段 | `node bench-breakdown.mjs` |
| `$S/research-libs/q4-inprocess.mjs` | E12 | `node q4-inprocess.mjs 15` |
| `$S/research-libs/alt-libs.mjs`、`check-alt.mjs`、`check-tooldef.mjs`、`build-tooldef.mjs`、`build-meta.mjs`、`strip-schemas.mjs`、`hash-cache.mjs`、`vt/` | 替代库适配、其余对拍、体积、哈希原型、vitest 探针（均未复跑） | 见各文件头注释 |
| `$S/research-libs/out/`、`results/` | 生成产物与子代理的原始计时输出 | — |
| `$S/draft-65-probes/pattern-key-collision.mjs`、`.out.json` | E20 反例 | `node pattern-key-collision.mjs` |
| `$S/draft-65-probes/rerun-tooldef-ondemand.mjs`、`.out.txt` | E11 复跑 | `node rerun-tooldef-ondemand.mjs 5` |
| `$S/draft-65-sources/` | 本轮复跑输出（`rerun-*`）、文档原文（`ajv-standalone.md`、`node-module-v24.21.0.md`） | `sha256sum` 对上 E4、E13 的值 |
| `$S/research-peers/` | DSH 与 pi 的解包（原件在主检出 `tmp/sources/*.tar.gz`） | `tar -xzf` |

上游升级 Ajv、Node 或任一替代库时，grep 本页页首的版本 token，命中的记录就是要重核的候选。
