# 固定 JSON Schema 的编译开销与可用的预编译、缓存手段

- 调查对象与日期：本仓库 `ff57fc8e3` 的 core 包固定 Schema 编译路径；Ajv `8.20.0`；Node `v24.21.0`；五个替代库（版本见 [evidence.md 页首](evidence.md)）；同行 DSH `639ed015`、pi `a13d35a7`（1.0.0）；2026-10-02。
- 消费者：#65 的提案与决定（待出现于 record/proposals、record/decisions）。
- 最近核对：2026-10-02 / 上述版本。
- 当前结论：导入耗时的大头是各包在模块顶层用 Ajv 编译定义，每个进程、每个运行时各付一遍；只推迟到首用，在测过的包上 CPU 省 43%；
  Ajv standalone 能把 messages 的导入从六百到一千毫秒降到几十毫秒，但前提是把 16 个 exact 关键字改写成 `code` 型，代价是每包几百 KB 到 1 MB 的生成代码、与 Ajv 版本绑定、
  改 Schema 必须重生成；Node compile cache 只对模块文件生效，对运行时 Ajv 编译无可辨收益；测过的替代库都承载不了现有 exact 语义；
  另发现 Ajv 按 `toString()` 去重 pattern 的隐患，今天尚未触发。整张导入图与 vitest 下的收益都没有量过。

## 问题与区分条件

#65 问：模块一加载就编译全部固定 JSON Schema，能不能压。候选手段有四类——把编译推迟到首用并在进程内缓存；
构建期用 Ajv standalone 预编译成模块；跨进程复用（Node 模块编译缓存、按内容哈希的磁盘缓存）；换库或调 Ajv 选项。

判断一种手段在本仓库成立到哪，要看四个条件：

1. **能不能原样承载 exact 语义。**本仓库把每个数字先投影成 JS number 交给 Ajv，再由 16 个 `exact_*` 关键字按根值与实例路径回取原值判定（[E5](evidence.md#e5-content-blocks-的-exact-关键字与正则引擎)）。
   承载不了这一层的手段会改变判定结果，不只是快慢。
2. **省掉的是每进程的编译，还是只把它挪了位置。**测试按文件分进程，CLI 每次启动一个进程；挪到首用的编译，每个用到它的进程仍付一遍。
3. **额外付什么**：构建步骤、生成代码、版本耦合、测试运行器的加载方式。
4. **现有设计正文对编译时机的承诺**（[E21](evidence.md#e21-设计正文对加载时编译的要求)）：改变编译时机的手段会碰到这些承诺。

本轮**不**回答：该走哪条路；任何一种手段对 `model-request-runtime` 整张导入图、`omne --help` 或整套测试的收益；其余约二十个包能否同样生成。

## 证据入口

- 现状与规模：[E1](evidence.md#e1-issue-65-正文里的现象与剖析读数)（issue 剖析，未复跑）、[E2](evidence.md#e2-本仓库在模块顶层编译固定-schema-的位置)（位置地图，抽查）、
  [E9](evidence.md#e9-messages-的导入耗时矩阵)、[E10](evidence.md#e10-createschemaruntime-的分段与元校验器)（复跑）。
- 按需编译：[E11](evidence.md#e11-tool-definition-上的按需编译对照)（复跑）、[E3](evidence.md#e3-ajv-8200-源码里-standalone-与关键字的约束) 的 `getSchema`／`_addSchema`。
- standalone：[E3](evidence.md#e3-ajv-8200-源码里-standalone-与关键字的约束)、[E4](evidence.md#e4-ajv-standalone-官方文档)（一手原文）、[E6](evidence.md#e6-validate-型关键字与现有正则引擎直接喂给-standalone)、
  [E7](evidence.md#e7-standalone-产物与运行时-ajv-的对拍)、[E8](evidence.md#e8-生成产物的体积构建耗时与可重现性)（复跑）、[E14](evidence.md#e14-vitest-下生成模块的加载方式)（转述）。
- 跨进程缓存：[E13](evidence.md#e13-node-模块编译缓存的官方文档)（一手原文）、[E9](evidence.md#e9-messages-的导入耗时矩阵)、[E16](evidence.md#e16-现成的预编译工具与哈希缓存原型)。
- 选项与替代库：[E12](evidence.md#e12-ajv-选项对编译耗时的影响)（转述）、[E15](evidence.md#e15-替代库的能力与耗时)（能力一手、耗时转述）。
- 同行：[E17](evidence.md#e17-同行-pi-10)、[E18](evidence.md#e18-同行-dsh)（抽查原文）、[E19](evidence.md#e19-其它同行与库)（转述）。
- 隐患：[E20](evidence.md#e20-ajv-按-tostring-去重-pattern-的反例)（构造反例）。
- 各方数字对不上的地方集中在 [冲突与不一致](evidence.md#冲突与不一致)。

## 当前结论

### C-1 导入耗时的大头是模块顶层的 Ajv 编译，每个进程、每个运行时各付一遍

**事实。**约 25 处在模块顶层（或模块级值初始化时）编译固定 Schema（[E2](evidence.md#e2-本仓库在模块顶层编译固定-schema-的位置)，抽查五处与报告一致）。
messages 一个包的导入，计时前已排除 content-blocks 自己的编译，三轮测得 621.5、761.4、1,052.7 ms，几乎全是 CPU（[E9](evidence.md#e9-messages-的导入耗时矩阵)）。
拆开看（复跑，load1 约 6.75）：单独建一个元校验器 45–57 ms；`createSchemaRuntime` 构造（含它自己新建的一个元校验器，与 9 份资源的复制、元校验、`addSchema`）150 ms；编译 54 个定义 426 ms；同一进程再建一套运行时并编译，又是 433 ms（[E10](evidence.md#e10-createschemaruntime-的分段与元校验器)）。
Ajv 的编译缓存挂在实例上、按 Schema 对象身份查（[E3](evidence.md#e3-ajv-8200-源码里-standalone-与关键字的约束) `core.js:447-449`、`:285`），`createSchemaRuntime` 每次调用都新建实例与元校验器（[E5](evidence.md#e5-content-blocks-的-exact-关键字与正则引擎)）。
issue 的剖析给出整张导入图的量级：导入 `model-request-runtime` CPU 8.8 秒，其中 Ajv 约 5.4 秒（[E1](evidence.md#e1-issue-65-正文里的现象与剖析读数)，未复跑）。

**推断。**一套运行时里编译定义约占四分之三，元校验器只占一成左右；loop-extension 这类在一个模块里建两个运行时的包，成本近似翻倍。

- 适用范围：分段只在 messages 上量过；其余包的耗时只有 issue 剖析里的包含时间。绝对毫秒数随负载漂移，只有同轮比例可比。
- 代价与不适用：本条讲的是现状，不涉及手段。
- 撞上这条事实会怎样：多处节点设计把「模块加载时编译、缺依赖或无效资源使初始化失败」写成了承诺（[E21](evidence.md#e21-设计正文对加载时编译的要求)，loop-extension v6、model-response v5、tool-definition）；
  已有测试依赖「工厂构造时就编译并同步抛错」（`asset-evaluation/tests/current-loop-body.spec.ts:53-57`、`content-blocks/tests/schema-runtime.spec.ts:168-169`）。改变编译时机的手段会与这些正文和测试正面相遇。
- 来源：E1、E2、E3、E5、E9、E10、E21。
- 最近核对：2026-10-02 / `ff57fc8e3`、Ajv `8.20.0`。

### C-2 只把编译推迟到首用，在测过的包上 CPU 只省 43%，且不消除每进程的成本

**事实。**tool-definition 上只取 `ToolDefinition` 一个定义，对比取全部 21 个：首用 CPU 468.5→266.8 ms（复跑，−43%）、476.0→266.0 ms（子代理，−44%）（[E11](evidence.md#e11-tool-definition-上的按需编译对照)）。
Ajv 的 `getSchema` 本来就是首次请求才编译（`core.js:273-286`）；但 `validateSchema` 为真时 `addSchema` 当场做元校验（`core.js:460-461`），`createSchemaRuntime` 在构造时就建元校验器、逐份元校验资源（[E5](evidence.md#e5-content-blocks-的-exact-关键字与正则引擎) `schema-runtime.ts:63`、`:89-98`）。
子代理另报同进程第一次编译 457 ms、预热后 158 ms（仅转述）。

**推断。**省得少有三个来源：一个定义的 `$ref` 闭包覆盖了大部分定义；库导入与资源元校验是固定成本；同一进程里第一次编译比之后贵得多。
第三条意味着，即便每个进程只编一个定义，也要付一次「冷」的编译。

- 适用范围：只在 tool-definition（直接 Ajv、无 exact 关键字）上量过；消费者用到的定义越多，省得越少；messages、loop-extension 等经 `createSchemaRuntime` 的包没有量。
- 代价与不适用：推迟之后，缺依赖或无效资源的失败从导入时刻移到第一次用到该定义的时刻，与 C-1 列的设计正文相冲；
  导入时刻不再暴露这类错误，而现状里遍历全部定义的测试并不齐全（[reports/2026-10-02-repo-survey.md](reports/2026-10-02-repo-survey.md) 第 5 节列出没有全定义遍历的包），没被任何测试用到的定义坏了不会被发现。
  测试按文件分进程时，每个用到某定义的文件仍各付一遍它的编译。
- 来源：E3、E5、E11。
- 最近核对：2026-10-02 / Ajv `8.20.0`。

### C-3 Ajv 8.20 standalone 不接受现有 exact 关键字与正则引擎的原样输入

**事实。**16 个 `exact_*` 关键字全部以 `validate:` 定义（[E5](evidence.md#e5-content-blocks-的-exact-关键字与正则引擎)）。Ajv 把 `validate` 型关键字的函数登记成不带 `code` 的作用域值（`keyword.js:87-91`），
standalone 生成时取不到 `code` 就抛 `CodeGen: "code" for keyword0 not defined`（`scope.js:5-9`、`:133-135`）；官方文档写明只支持 `code` 与 `macro` 型自定义关键字，
且 `code` 型用 `gen.scopeValue` 时必须提供 `code`（[E4](evidence.md#e4-ajv-standalone-官方文档) 第 239–241 行）。
正则引擎的 `code` 被原样写进生成代码当标识符（`util.js:142-147`、`code.js:70-79`），现有引擎的 `code` 是 `'schemaPattern'`／`'schemaRuntimePatternFactory'`，生成的模块里没有这个名字。
探针复跑：前者抛上述错误，后者生成的模块加载即报 `schemaPattern is not defined`（[E6](evidence.md#e6-validate-型关键字与现有正则引擎直接喂给-standalone)）。

- 适用范围：Ajv `8.20.0`；负面结论是构造验证过的，不只是读文档。
- 代价与不适用：`macro` 型能否表达 exact 语义未试；`macro` 展开成 Schema，而 exact 判定要在运行时回取原值——这是推断，不是验证。
- 来源：E3、E4、E5、E6。
- 最近核对：2026-10-02 / Ajv `8.20.0`。

### C-4 把 exact 关键字改写为调用同一函数的 code 型之后，已跑的对拍没有分歧

**事实。**探路件把 16 个函数原样取出，注册成 `code` 型关键字，生成代码以 `fn.call(this, schema, data, undefined, {instancePath})` 调用它们；正则引擎的 `code` 改成生成模块能导入的名字。
messages 54 个定义上与仓库运行时对拍：夹具子值 107,676 对、加数字与字符串变异后 581,688 对，均 0 不一致、0 抛错，夹具自带的 45 行 `schemaValid` 全对——主线复跑与子代理报告的计数完全相同（[E7](evidence.md#e7-standalone-产物与运行时-ajv-的对拍)）。
同一工具链下两次重生成的产物逐字节相同（[E8](evidence.md#e8-生成产物的体积构建耗时与可重现性)）。tool-definition 27,783 对、元校验器 29,117 对的 0 不一致只有转述。

**成立前提（事实）。**调用时第三个参数传 `undefined`，只因为 16 个函数都不读这个参数（E5，参数名 `_schema`）；standalone 一侧的 exact 函数是从 `dist/exact-schema.js` 机械截出的副本，不是对 content-blocks 的真实拆分。

- 适用范围：只在这组输入上布尔判定一致；判真的只占 2.2%（12,796／581,688），大部分是「值不属于该定义」的平凡负例；没有比 `errors` 的内容。
- 不支持的推广：等价证明；其余约二十个包（含 loop-extension 的两个运行时、model-response 的成员校验器、skill-package 的绑定对象）同样一致。
- 来源：E5、E7、E8。
- 最近核对：2026-10-02 / Ajv `8.20.0`、`ff57fc8e3` 的 dist。

### C-5 standalone 把导入降到几十毫秒，单次校验不变快

**事实。**同轮交替测量（[E9](evidence.md#e9-messages-的导入耗时矩阵)）：messages 导入现状 621.5 ms（CPU 908）、standalone 39.5 ms（CPU 41.5）——复跑，load1 7.9–8.7；子代理两轮为 761→35、1,053→34.5。
元校验器 78.7→5.2 ms（复跑，[E10](evidence.md#e10-createschemaruntime-的分段与元校验器)）；tool-definition 首用 385.5→14.9 ms（复跑，[E11](evidence.md#e11-tool-definition-上的按需编译对照)）。
每次校验两边同量级：messages 千次 670 对 720 ms，tool-definition 万次 51 对 55 ms（复跑）。

**推断。**收益只在导入与首用；每次校验约 0.7 ms 的成本（含 `createSchemaRuntime` 包装里的无损复制与数字投影，E5 `schema-runtime.ts:110-113`）不受影响——成本主要在包装层这一判断来自子代理，本轮没有拆开量。

- 适用范围：三处生成过的产物；messages 的计时不含 content-blocks 自己的顶层编译，真实导入还要加上它，除非它也随之改变。
- 不支持的推广：整张导入图（`model-request-runtime`、`omne --help`）与 vitest 下的节省；「只取一个闭包」两轮差近一倍（19.3 对 10.0 ms），样本太少，不支持精确比较。
- 来源：E5、E9、E10、E11。
- 最近核对：2026-10-02 / Ajv `8.20.0`、Node `v24.21.0`。

### C-6 standalone 的代价：体积、版本耦合、加载方式与「Schema 不再在运行时生效」

**事实。**
- **体积**：messages 全部 54 个定义的产物 1,070,552 字节，只取一个定义的闭包 374,150，`inlineRefs:false` 895,833；tool-definition 约 307–353 KB，元校验器 76 KB（[E8](evidence.md#e8-生成产物的体积构建耗时与可重现性)）。
  开 `code.source` 后每个被编译 Schema 的顶层对象以字面量内联，连 `description`、`examples` 一起（`compile/index.js:62-64`）；剥掉未引用常量只省 7.2%。官方文档也承认 Schema 多时生成代码可能比 Ajv 本身大（E4 第 7 行）。
- **与 Ajv 版本绑定**：生成代码依赖 Ajv `runtime/` 目录（E4 第 231 行），helper 以 `require("ajv/dist/runtime/…")` 字符串写入（E3）；tool-definition 的产物里实际有 2 处，messages 的产物因 exact 变换替掉了相应原生关键字而为 0（E8）。
  开 `code.esm` 也一样，ESM 产物要另配 `require` 才能加载——文档没写这一点，依据是源码与产物（[冲突与不一致](evidence.md#冲突与不一致)）。
- **exact 函数的出处**：现在的 `exact-schema.ts` 在模块顶层导入 Ajv 与 8 份元 Schema，并在加载时复制它们（E5 `:1-9`、`:424-439`）；生成模块若直接从它取 exact 函数，就会连带加载 Ajv。探路件绕开这一点用的是机械截出的副本（C-4）。
- **生成函数与运行时函数的形状不同**：生成函数不带 `.schema`、`.schemaEnv`（E8），而运行时编译的带（`compile/index.js:93-94`）；仓库里有测试读 `entryValidator('EnvelopeRouteId').schema`（E2），也有包读 Ajv 的 `fn.errors`（E2）——后者在生成产物上的一致性没有比过。
- **构建耗时**：messages 生成一次 1.4 s（复跑，load1 约 10）。
- **vitest**：生成模块不在 `node_modules` 下时被内联转换，首个文件 1,874 ms、之后 450–585 ms；外部化后 38–124 ms（[E14](evidence.md#e14-vitest-下生成模块的加载方式)，仅转述，单次样本）。

**推断。**改 Schema JSON 之后不重新生成，校验结果不会变——对依赖「改 JSON 即改判定」的检查（例如以 Schema 文件为对象的变异测试）意味着要先重生成才看得到效果；
反过来，MR5-PV6「变异已导入 JSON 后固定编译器不串版」（E21）在生成产物上天然成立。产物逐字节可重现（E8）这一事实使「重生成后逐字节比较」能在同一工具链下判定产物是否过期，跨 Node／Ajv 版本是否仍可重现没有验证。
公共资源（content-blocks、call-accounts 等被多包引用的 Schema）在按包生成时会进入每个包的产物；25 个包的总体积没有量。

- 来源：E2、E3、E4、E5、E8、E14、E21。
- 最近核对：2026-10-02 / Ajv `8.20.0`。

### C-7 Node 模块编译缓存只对模块文件生效，对运行时 Ajv 编译无可辨收益

**事实。**官方文档的适用对象只列 CommonJS、ES 模块与 TypeScript 模块的编译（[E13](evidence.md#e13-node-模块编译缓存的官方文档)）；Ajv 的校验函数由 `new Function` 生成（`compile/index.js:89`），不是模块，文档该节也未提及 `new Function`。
实测（E9）：现状 + 缓存 674.2 对 621.5 ms、CPU 927.7 对 908.0（复跑，没有变快）；子代理两轮 761→718、1,053→967 ms，CPU 998→1,014，在噪声内。standalone 文件则 39.5→11.6 ms（复跑）、35→11.8、34.5→14.5。

**推断。**Ajv 编译的大部分时间花在 Ajv 自己用 JS 拼代码，而不是 V8 解析拼出来的函数——即便缓存覆盖 `new Function`，可省的也只是后一部分。这一条没有单独量。

- 适用范围：Node `v24.21.0`；「对 `new Function` 无效」是文档读遍未见加实测无收益，不是构造验证。
- 代价与不适用（文档原文）：缓存只在同一 Node 版本内可复用；默认按模块绝对路径失效（`portable` 选项可放宽）；进程即将退出时才写盘；与 V8 覆盖率同用时覆盖率可能不精确，文档建议测试时关闭；v24.15.0 起才不再是实验特性。
  vitest 下开缓存「没看到收益」只有转述（E14）。
- 来源：E3、E9、E13、E14。
- 最近核对：2026-10-02 / Node `v24.21.0`。

### C-8 调 Ajv 选项只能削掉一部分，且有一项已经被 createSchemaRuntime 用掉

**事实（仅转述，原始结果文件已核）。**tool-definition 上同进程预热后：`code.optimize:false` −37%、`validateSchema:false` −20%、两项都关 −58%；冷进程首用 CPU 476→339（−29%），仍是 standalone 导入（约 21 ms CPU）的 16 倍（[E12](evidence.md#e12-ajv-选项对编译耗时的影响)）。
`createSchemaRuntime` 的主实例与元校验器实例本来就是 `validateSchema:false`（E5），那 20% 对它们不存在；tool-definition 这类直接用 Ajv 的包取默认 `true`（E2）。

- 适用范围：tool-definition 一处、每样本新建实例；`optimize:false` 对每次校验速度的影响只在 tool-definition 上看过（万次 81.5 对 81 ms，转述）。
- 代价与不适用：`validateSchema:false` 去掉的是 `addSchema` 时的元校验这一道检查本身。
- 来源：E2、E5、E12。
- 最近核对：2026-10-02 / Ajv `8.20.0`（未复跑）。

### C-9 测过的替代库都承载不了现有的 exact 语义，首用比 Ajv 便宜的只有解释执行、每次校验慢一个数量级的 cfworker

**事实。**exact 判定要在关键字里拿到根值与实例路径（C-4 前提、E5 `original`）。typebox 1.3.34 的 `~refine` 只以值调用 `check(value)`；schemasafe 1.3.0 的选项全集没有自定义关键字，未知关键字默认抛错、宽松模式下忽略；
cfworker 4.1.1 的 `dist` 里找不到关键字扩展点（读遍导出未见级）（[E15](evidence.md#e15-替代库的能力与耗时)）。
@sinclair/typebox 0.34 不能处理普通 JSON Schema、hyperjump 以实验 API 能表达 exact 语义：仅转述。
耗时（转述）：首用 Ajv 537 ms，typebox 414、schemasafe 476、hyperjump 675，只有解释型的 cfworker 102 ms，但它万次校验 1,235 ms，是 Ajv 的 15 倍；hyperjump 万次 1,162 ms。

- 适用范围：这五个库、这五个版本，以及现有「投影 + 按根与路径回取原值」的 exact 实现结构；不覆盖换一种不需要投影的 exact 实现后的情形，也没有更广地检索其它库。
- 代价与不适用：换库还意味着跨资源 `$ref`、`$dynamicRef` 与 Ajv 的 `ownProperties`、`passContext` 行为要重新对拍；子代理报告 typebox 把资源嵌进 `$defs` 时出现栈溢出（转述）。
- 来源：E5、E15。
- 最近核对：2026-10-02 / 上述版本（能力一手、耗时未复跑）。

### C-10 没有找到成熟的「按内容哈希缓存 Ajv 编译产物」实现，现成的只有存取钩子与 CLI

**事实。**`@fastify/ajv-compiler@4.0.6`（CommonJS，依赖 `ajv ^8.12.0`）据报只给 store／restore 钩子；`ajv-cli@5.0.0` 自 2023-04-28 起无更新、依赖 `ajv ^8.0.0`；`ajv-pack` 已被 standalone 取代（[E16](evidence.md#e16-现成的预编译工具与哈希缓存原型)、E4）。
子代理的哈希缓存原型：未命中 1.27 s、命中 65–89 ms，其中算哈希 30–50 ms（仅转述）。

**推断。**这类缓存的键必须覆盖所有改变产物的输入——Ajv 版本、选项、关键字与正则引擎的源码、资源、导出名；漏掉任何一项，命中的就是过期产物，且不报错。命中时仍要付哈希与读文件，比直接导入生成模块贵。

- 适用范围：「没有找到」只覆盖子代理检索过的几项，是读数缺口，不是「不存在」。
- 来源：E4、E16。
- 最近核对：2026-10-02 / npm 元数据当日值。

### C-11 两家同行都没有跨进程的编译校验器缓存；pi 首用编译加对象身份缓存，DSH 运行时不用 Ajv，理由是语义而非开销

**事实。**pi 1.0 的工具参数校验首次用到才 `Compile(schema)`，按 Schema 对象身份存进 `WeakMap`（`validation.ts:6`、`:271-280`）；但它也在两处模块顶层立即编译（`theme-json.ts:99`、`model-config.ts:245`），打包出的 CLI 启动器先 `enableCompileCache()`（[E17](evidence.md#e17-同行-pi-10)）。
本仓库的 pi fork 没有移植 `validation.ts`（E2）。DSH 运行时只在一条命令里动态导入 Ajv（`projector.ts:150`）；笔记里拒绝 Ajv 的理由是「必须对每个无法投影的构造失败」「接受更大的语言会让约束与模型指引不诚实」、`new Function`、依赖数与原型检查，
另一份笔记说「校验成本与一次模型调用相比可忽略」——说的是每次校验，不是导入时的编译（[E18](evidence.md#e18-同行-dsh)）。

- 适用范围：pi 的 `WeakMap` 只在同一 Schema 对象被反复使用时命中，重新构造的等价对象不命中；DSH 的解释型子集校验器以收窄的 Schema 词汇表为前提，而本仓库的固定 Schema 依赖 Draft 2020-12 的跨资源 `$ref`、元 Schema 的 `$dynamicRef` 与 exact 关键字（E5、E7），这个前提不成立。
- 不支持的推广：两家的选择出自上述各自的前提，不能当作「本仓库这样做也成立」的先例；它们有没有与本仓库同等规模的固定 Schema 没有调查；Kimi、Cursor 两家只有转述（[E19](evidence.md#e19-其它同行与库)）。
- 来源：E2、E5、E17、E18、E19。
- 最近核对：2026-10-02 / pi `a13d35a7`、DSH `639ed015`。

### C-12 Ajv 按 toString 去重 pattern，返回非 RegExp 匹配器的特例一旦有两个就会静默串用

**事实（构造验证）。**Ajv 8.20 在同一实例里按 `rx.toString()` 去重 pattern（`code.js:75`、`scope.js:77-82`）；非 RegExp 的匹配器字符串化都是 `[object Object]`。
探针里两个 pattern 各由一个 `{ test }` 匹配器承担：同一 Schema 内、同一实例分两次 `compile`、以及 standalone 生成，三种情形下第二个 pattern 都用了第一个的匹配器，判定反了；原生 RegExp 对照正常（[E20](evidence.md#e20-ajv-按-tostring-去重-pattern-的反例)）。
今天的 `schemaPattern` 只有 InlineBytes 一个特例返回非 RegExp（E5），所以现有判定不受影响；`createSchemaRuntime` 的调用方 `patternFactory` 被强制返回原生 RegExp，也不受影响。

- 适用范围：Ajv `8.20.0`，运行时与 standalone 同样成立。
- 撞上这条事实会怎样：在 `schemaPattern` 里再加第二个非 RegExp 特例，第二个特例的 pattern 会静默按第一个特例判定，不报错，测试只在恰好覆盖到它时才会红。这个缺陷目前没有已知解法；未检索仓库里是否已有覆盖这一情形的检查，也未检索 Ajv issue tracker 是否已有报告。
- 来源：E3、E5、E20。
- 最近核对：2026-10-02 / Ajv `8.20.0`。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 仓库仍锁 Ajv `8.20.x`，standalone、关键字与 pattern 去重的实现不变 | C-3、C-4、C-6、C-8、C-12 | 已核对当日锁定版本；更高版本未看 |
| Node 仍是 `v24` 且 compile cache 的适用对象不扩到 `new Function` | C-7 | 已核对 `v24.21.0` 文档；其它版本未看 |
| `packages/core/*/dist` 与 `ff57fc8e3` 的源码一致 | C-4、C-5 | dist 构建于源码末次变更之后；复跑期间另一会话重建过 dist，复跑在重建完成后进行 |
| 同轮交替测量能抵消负载漂移 | C-1、C-2、C-5、C-7 的比例 | 三轮负载在 6.7–17 之间，同轮比例一致；绝对值不一致，已并列 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查／实验 | 受影响选择及消费时点 | 所需产物／责任 |
|---|---|---|---|
| 任一手段对整张导入图的节省 | 对 `model-request-runtime` 的 dist 导入、`omne --help`、一组测试文件，同负载交替测改前改后 | 提案的收益估计；#65 验收的数字 | #65 提案方 |
| issue 称元校验器「约 0.5 秒」与实测单次 45–107 ms 的冲突 | 在 `model-request-runtime` 导入期间统计 `createExactMetaValidator` 被调用次数与每次耗时 | C-1 的成本分布 | 待明确 |
| 其余约二十个包能否同样生成、产物总体积 | 对每个包跑同一生成流水线并对拍；统计公共资源重复 | C-4、C-6 的适用范围 | 待明确 |
| 生成产物与运行时的 `errors` 是否一致 | 对读 `fn.errors` 的包（identity-values、offer-expiry）生成并比对错误数组 | C-6 | 待明确 |
| vitest 下的加载方式与 compile cache | 复跑 vitest 探针，多样本，并核对 vitest 关于依赖内联的官方文档 | C-6、C-7 | 待明确 |
| `macro` 型关键字能否承载 exact 语义 | 构造一个 `macro` 版 `exact_minimum` 并对拍 | C-3 | 待明确 |
| Ajv 是否已知 pattern 去重问题 | 检索 Ajv issue tracker 与更高版本的 `usePattern` | C-12 | 待明确 |
| 替代库在不依赖投影的 exact 实现下是否可行 | 本轮未调查 | C-9 的适用范围 | 待明确 |

## 采用与后续核对

尚无提案或决定消费本研究；#65 的提案出现后在入口与本页回填。
上游版本变化先判断是否触及上面任何一条结论；触及就按[演进事件词](../README.md#演进事件词)记 `changelog.md` 再改正文。
