# @omne-harness/product-checks

## 总体架构

product-checks 是本仓库的产品规则检查器。规则写死本仓库的产品路径或契约，随产品代码变化，所以不发布到 npm。规则引擎、源码收集、提交署名与验收锁来自 repo-toolchain。

| 部分 | 源码 | 入口命令 |
| --- | --- | --- |
| 包规则 | `src/rules`，登记在 `RULES` | `pnpm run lint:rules`（成员脚本 `scan`） |
| 仓库路径规则 | `src/repository.ts`，登记在 `REPOSITORY_RULES` | 同上 |
| 整洁检查 | `src/hygiene` | 同上，给 `--hygiene` 时跑；基线由 `hygiene:baseline` 写 |
| 验收覆盖声明 | `src/acceptance/coverage.ts` | 同上 |
| 提交署名的历史审计基线 | `src/attribution-baseline.ts` | 同上 |
| 场景状态 | `src/acceptance/scenario-status.ts` | `pnpm run acceptance:scenarios` |
| 替身清点 | `src/retire` | 成员脚本 `retire` |

每个命令的参数、环境变量与退出码见它的 `--help`。

## 领域边界

本成员拥有：

- 每条产品规则与仓库路径规则判什么算违反，以及它不覆盖什么。
- 三份数据文件的形状：`commit-attribution-baseline.json`、`hygiene-baseline.json`、`retire-doubles.json`。

本成员不拥有：

- 规则的含义。每条规则的 `source` 字段指回拥有它的契约、节点约束或架构正文，那里改了，规则跟着改。
- 规则引擎、源码收集与 `commit-attribution` 本身：归 repo-toolchain。
- 长期产品正文与场景：归产品区。产品发现与编号场景的解析归 repo-toolchain 的 `src/product`。
- 测试临时目录的约定与理由：归[质量论证「包级测试责任与边界」](../../docs/architecture/assurance.md#包级测试责任与边界)。领域时间与操作计时的区别：归[时间、顺序与版本](../../docs/architecture/cross-cutting-concepts.md#时间顺序与版本)。
- 类型层的检查（失败集合闭合等）：在各包的 `tests/*.spec-d.ts` 里。

消费者：

- 根 `pnpm run lint:rules` 与 `pnpm run check` 的常驻步骤。CLI 读 repo-toolchain 与 `@omne-harness/legal-identity` 的 `dist`，`pnpm run check` 在这一步之前已经构建它们。
- 构建出的模块：`dist/rules/index.js` 导出 `RULES`、`rulesForRoot(root)`、逐项规则与规则工厂；`dist/repository.js` 导出 `collectRepositorySources(root)` 与 `REPOSITORY_RULES`。`Rule`、`SourceFile`、`Violation`、`collectSources` 与 `runRules` 来自 repo-toolchain。

## 心智模型

- 规则检查文本、路径与 TypeScript 语法，不做跨文件的类型分析。一条规则查得出它点名的写法，查不出它「不覆盖」一栏里的写法。
- 被查的包不存在时规则无事可查、静默通过。这不是那个包合规的证据。
- 声明覆盖、实际执行与有效接受是三件事，各自要各自的证据。

## 应然设计

### 扫描与报告

- CLI 在给出的包根上跑包规则（成员脚本 `scan` 给的是 `packages` 与 `apps`），再在被检查的仓库上跑仓库路径规则、验收覆盖声明与提交署名；给 `--hygiene` 时另跑整洁检查。仓库路径规则扫描 `packages/`、`apps/`、`examples/`、`tools/`、`scripts/` 下的执行模块及配置别名的解析结果。
- 运行检查器的仓库取 `OMNE_RUNNER_ROOT`，缺省为本工具所在的检出。被检查的仓库取 `OMNE_SUBJECT_ROOT`，缺省同运行检查器的仓库。不在 Git 检出里时，整洁检查与提交署名写明未检查。
- 有违反时逐条写 `<路径>:<行> [<规则>] <说明>`，退出 1。没有违反时写一行汇总，退出 0。
- 仓库收集器先规范化仓库根。配置的 `extends` 写相对路径时按文件读，写包名时按 Node 的规则从该配置所在目录解析，读锁文件钉住的那份安装，解析不到就报错停止。
- 包存在而规则依赖的布局锚点缺席时报出，不静默失效：入口层包的 `src/events.ts` 与 `src/ops/`、账号能力包的 `src/plugin.ts`、注册组合包的 `TERMINAL_OUTCOMES`。按路径写死的位置集中在 `src/layout.ts`。

### 词法视图

`restricted-call-sites` 的扩展与其后各条跑在 repo-toolchain 的 `core/source-text` 词法视图上：注释与字符串、模板、正则字面量的内容不算代码，括号按代码配对。`no-bail-control` 与 `restricted-call-sites` 的前两项逐行扫原文。core 与身份规则用锁定版本的 TypeScript 语法树，不构造类型检查程序。

### 包规则

| 规则 | 报出 | 不覆盖 |
| --- | --- | --- |
| `no-wall-clock` | 生产源码里的 `Date.now`、`performance.now` 与无参 `new Date`，含解码成员、`globalThis` 访问与同文件的 const 或解构别名。测试豁免。非领域取时按下一节标注 | 跨文件、可变赋值、函数传参或动态成员的数据流 |
| `no-bail-control` | 调用 `ctx.bail(`；异步控制走 `serial` | 无 |
| `no-testing-import` | 产品源码导入 testing 子入口：静态、侧效应、字面的动态导入与 require、重导出、类型导入与解码说明符都算 | 非字面说明符、经函数传参的动态装载 |
| `restricted-call-sites` | `accounts.produce(`、`'organization-purge'`、`createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(` 出现在注册组合包与定义它们的包之外；入口层包里出现即违反 | `apps/` 不在扫描根内；经别名或计算成员的调用 |
| `ops-import-whitelist` | 入口层包 `src/ops/**` 导入白名单之外的模块，或动态导入的说明符不是字面量。`src/events.ts` 只许导入 `node:*`、`@deepseek-ai/cordis`、`zod` | 类型导入与运行时导入不分，都算 |
| `ops-event-whitelist` | `src/ops/**` 里 Cordis 上下文的 `on`、`once` 第一个实参不是从 `src/events.ts` 导入的 `serving`、`stopped`、`defect`，或 `emit`、`parallel`、`serial` 不是 `listening`；字符串字面量与计算出的名字报出 | Node 发射器；经解构、函数返回值或多次转手的上下文 |
| `single-table-entry` | 入口层包的查询构造里表名不是 `'governance_center'` 或本包里定义为该字面量的常量；出现 `sql` 模板或 `sql.raw(`。判不出的写法按违反处理 | `createIndex(...).on(...)` |
| `no-peer-address` | 入口层包源码出现对端地址字段或转发头 | 遍历 `rawHeaders` 后以非字面量比对 |
| `credentials-parse-only` | 入口层包源码出现 `.derive(`、`.verify(`、`.checkPolicy(` | 经别名或计算成员的调用 |
| `presentation-only-authn` | 入口层包源码出现 `.verify(`、`parseLoginStateId`、对 `LoginStateId` 的断言；`accounts` 的方法调用不是 `participate` 或 `resolveActivatedIdentifier` | 以改名导入的类型做断言；实参来源（类型层） |
| `no-network-listen-in-tenancy` | `tenancy/*/src` 导入 `node:http`、`https`、`net`、`tls` 或调用 `.listen(`；入口层包之内只许 `src/transport/**` 与 `src/ops/**` | `node:http2`、`node:dgram`；非字面量的动态导入 |
| `no-presentation-in-diagnostics` | 账号能力包的日志、事件、错误与 `defect(` 的实参里出现展示值 | 经别的变量或辅助函数转手 |
| `no-random-source-inline` | 账号能力包出现 `Math.random`；crypto 随机函数在 `src/presentation.ts` 之外；插件体 `random:` 的值不是 `cryptoRandomSource` | 以位置参数接随机源；插件体构造分散到别的模块 |
| `ai-r8-no-credential-in-write` | 账号能力包里 `storage.write(` 实参的词法范围内出现凭据服务的调用 | 经辅助函数的间接调用、改名的凭据服务变量 |
| `sc-oe-1` | 消费者包里名为 `*Record`、`*Row`、`*Table` 的类型以 `OfferState` 为字段类型 | 不按命名约定起名的持久记录类型 |
| `sc-oe-2` | 名为 `accept` 后接大写字母的接受路径里，对报价状态字面量做相等比较或 `case`，而不是经 `acceptable()` | 经辅助函数逐值比较；查表式分派 |
| `sc-cv-1` | `tenancy/*` 除凭据校验包外，对凭据材料值做成员访问、下标、正则或 `JSON.parse` | 经别的变量转手后再解析 |
| `terminal-outcome-closed` | 注册组合包的 `TERMINAL_OUTCOMES` 不恰为四个字面量；`TerminalOutcome` 不由它派生；返回字面量不在常量里；对 `TerminalOutcome` 断言 | 条件表达式或辅助函数给出的返回值 |
| `og-s42-dynamic-resolve` | `organization-purge` 服务在注册组合包之外被解析 | 服务名经变量拼出后再解析 |
| `no-dialect-bypass` | `tenancy/*/src` 从 `@omne-harness/storage-sql` 导入方言、驱动或 `openStorage`，或 `new Kysely(`；测试豁免 | 经别的包转手取得连接 |
| `core-pure-imports` | 登记的纯 core 节点导入其登记的公开依赖之外的模块；类型导入、重导出、动态导入与 require 都查，动态说明符不是字面量即报出 | 第三方内部的传递依赖、tsconfig 路径别名、经全局对象的 I/O |
| `identity-decision-inputs` | 显式登记或带 JSDoc `@identityDecision` 的准入函数，参数类型里没有登记的物理类型名或品牌 | 未登记也未标注的函数；跨文件的类型别名与继承 |
| `identity-account-references` | 账号身份包的账号记录直接声明第二个 `AccountId` 字段 | 跨文件、继承或联合形式的记录 |
| `identity-scope-columns` | 持久记录的直接对象形状里，组织列与租户列成对可空 | 改名的归属字段；跨文件或复合形式的记录 |

### 非领域取时的标注

领域时间由 Clock 提供。直接取时的非领域用途用一行块注释标在取时表达式前，例如 `/* wall-clock: operation-timing -- measure local lock wait */ Date.now()`。

- 类别有四种：`operation-timing`（本机操作的等待耗时或重试间隔）、`internal-name`（内部临时名称中的时间成分）、`clock-source`（Clock 提供者读取其声明的底层时间源）、`observation-time`（只用于显示的本机观察时刻）。
- 注释用固定前缀，含一个类别、`--` 与非空理由，与取时表达式同处一行，中间只有空格或制表符。它只放行紧接着的一个调用或无参构造。放在声明前、括号外或前一行，未知类别、空理由、多行注释与行注释都不生效。`new Date(value)` 是转换，不用标注。
- 规则只验证标注的形状与位置，不证明理由真实。目录名不授予豁免。

### 豁免与登记表

- `no-testing-import` 放过测试路径、包自己声明为 `./testing` 的那一个入口文件，以及 `rulesForRoot(root)` 按扫描根读出的合法具名成员直接 `acceptance/` 目录。成员清单要解析为对象且 `name` 是非空字符串，否则不取得豁免，无法解析的 `package.json` 报出。默认的 `RULES` 没有扫描根事实，只豁免测试路径。
- `core-pure-imports` 允许的精确 Schema 子入口以 `src/rules/core-pure-imports.ts` 的 `PUBLIC_SUBPATHS` 为准，只授予已有依赖的消费者。相邻路径、未知版本与私有源码都拒绝。`immutable` 根入口只在 `core/model-request-runtime/src/model-log-history.ts` 允许。
- 身份清单从 `@omne-harness/identity-values` 公开入口的 `IDENTITY_TYPE_NAMES` 取，没有第二份名单。`IDENTITY_CHECK_INPUTS` 暴露规则输入。消费者用 `createIdentityDecisionInputs({ ...IDENTITY_CHECK_INPUTS, decisionTargets })` 配置明确的模块与函数。默认函数注册表为空，标注本身不构成隔离保证。
- 范围化规则登记在 `src/rules/core-scoped.ts`：`body-projection-inputs`（五个正文包各自的声明函数）、`parameter-judge-cache-owner`（编译器与动态 cache 的分配点必须在调用方工厂内）、`single-tool-argument-parser`（`parseCollectedToolCall` 恰有一个 `readJsonStrict` 调用点，同包其他产品模块不调用它与 `JSON.parse`）。存在的包缺了登记的模块或函数即报出，包缺席是覆盖缺口。名字与次序两个工厂拒绝空消费者配置。
- `evaluation-publication-boundary` 只允许评估输入存储自身、受信的验收启动与测试，以及精确的 `packages/model/model-request-runtime-local/tests/session-selection-fixture.ts` 通过静态公开入口访问发布面。转导出、动态转发与私有发布入口仍拒绝。`packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts` 可以经公开发布入口建立不可变历史，runner 的产品源码只许导入 reader 类型。

### 测试临时目录的物理路径

`test-temp-physical-path` 登记在 `REPOSITORY_RULES`。

- 扫描 `packages/`、`apps/`、`tools/` 下的测试与夹具，文件类型是 `.ts`、`.mts`、`.cts`、`.js`、`.mjs`、`.cjs`。路径含 `/tests/` 的都扫，否则只扫 `*.spec.*` 与 `*.test.*`。
- 报出：`mkdtempSync` 或 `mkdtemp` 的第一个实参来自系统临时目录（`tmpdir()` 或 `process.env.TMPDIR`，可经调用、模板、运算与本文件的局部常量），而建出的目录没有取物理路径。先建目录、下一句再取物理路径的两段式也报出，回调与 `.then(realpath)` 的写法也报出。
- 放过：建目录的调用直接是 `realpathSync`、`realpath` 或 `realpathSync.native` 的第一个实参；实参里的 `tmpdir()` 已先取物理路径；基准目录不来自系统临时目录。
- 不覆盖：`scripts/` 与 `examples/` 下的测试、`.tsx` 与 `.jsx`、跨文件传入的临时目录、重新赋值、`require` 解构时改名。

### 模型凭据的逐符号守卫

`model-credential-boundary` 登记在 `REPOSITORY_RULES`，只许下列点使用这些能力：

| 符号 | 允许点 |
| --- | --- |
| `createCredentialBindingReader` | 目录 owner；精确 bootstrap 文件中 `createAcceptanceApplication` 的 `start` 构造，交给凭据保管工厂 |
| 返回的 binding reader | 目录 `cordis.ts` 的 `localCredentialLookupPlugin` 与凭据保管的 `model-replica.ts` 执行；bootstrap 不执行、不返回 |
| `createModelReplicaCustodian` | 同一应用的 `start` 唯一构造点 |
| `storeBoundReplica` | 应用 `publishCredential` 的真实来源写入路径 |
| `readBoundReplicaIn` | 应用 `start` 经 `ReplicaReader` 只借出读方法 |
| 组件 `close` | 应用 `closeResources` 与凭据保管的所有者；借用者不得取得 |

守卫跟踪同文件的词法绑定、赋值别名、具名与命名空间导入、普通解构、字面计算成员与有界聚合别名。已识别的受限值不能经未知参数、构造器、返回或导出、回调结果、对象写入或文本呈现逃逸，非字面成员报错。产品测试路径豁免。它不证明真实来源、共同事务、运行期唯一实例或资源实际关闭。

### 验收的覆盖声明

`lint:rules` 找出 `acceptanceLock` 配置的成员根下每个 `acceptance/**/*.acceptance.ts`（不进 `node_modules`、`dist`），以规则 `acceptance-covers` 报出：

- 开头注释块里没有、或不止一行 `// covers: …`；写在代码之后的另报要写在开头。
- 某一项不是 `PD-<slug> <场景编号>`、是空的或写了两次。多项用半角或全角逗号隔开。`slug` 以小写字母开头，后面是小写字母或数字，可用单个连字符分段。
- 声明所指的当前产品来源不存在，或它的 `acceptance.md` 缺对应编号、编号重复。
- 文件名不以 `PD-<slug>.` 开头，或这个 topic 不在它声明覆盖的 topic 里。
- 成员有验收文件，`package.json` 里却没有 `acceptance` 脚本。

产品区的位置取 `loop` 配置的 `sensors.topicChurn.productRoot`。只认 `.acceptance.ts` 结尾的文件。声明的场景存在，不等于验收断言了那条场景要的东西。

### 场景状态

`acceptance:scenarios` 从长期产品正文发现当前 PD 与编号场景，复用覆盖声明的格式。

- 每个当前 PD 都进入报告。缺场景正文或没有编号场景的 PD 单列未覆盖，不从能力表猜场景。
- 覆盖声明、执行、接受分别报告。没有运行证据输入时执行为 unknown，没有有权者完整接受证据时接受为 unknown。零任务、无关联卡或声明覆盖都不当作已交付的证据。
- 跨 topic 的声明按实际场景归属核对，找不到来源保持偏离。
- 正常观察退出 0。非法根、元数据、重复身份、目录不符、越界与工具错误退出 2。合法的空根单列未覆盖。命令只接长期产品输入，拒绝 `--config` 与 `--capture`。

### 提交署名的历史审计基线

`lint:rules` 调用 repo-toolchain 的 `commit-attribution` 之后，用 `commit-attribution-baseline.json` 过滤：只跳过清单里确切提交（完整 40 位 SHA）中把 agent 列为共同作者的行。作者、提交者是 agent，或有产出者行，照常报告。清单之外的提交照常检查。清单每条写完整 SHA 与原因，整份清单引用一条具名决定。格式不对时报错退出，不当作空清单。

### 替身清点

`retire` 是整波放行前的只读核对：按放行波次扫描退役表 `retire-doubles.json` 里的替身，报告三类问题，并列出每个成员 `./testing` 入口的清点表。它不在 `lint:rules` 里。

- 表的每项字段是 `id`、`category`（`A`、`B`、`C`、`none`）、`exports`、`exists`、`retireWave`、`dueBy`、`ownerKind`、`note`。`exists` 记这个替身在刷新所用的提交上是否已存在。表头记录来源文件名、来源 SHA256 与刷新导出名所用的提交。`dueBy` 写在表里，命令不重新推导。`dueBy` 为 null 的项永不到期。
- `overdue`：项已到期，导出名在某个 `./testing` 入口里仍有导出，或在非测试源码里仍有顶层声明。
- `retired-referenced`：项已到期，定义文件与重导出它的入口之外仍有文件引用这个名字。一个文件报一条。
- `misassembled`：B、C 类名字出现在 `apps/**/src` 或 `packages/**/src` 的产品源码里，不要求到期。测试文件与测试设施里的使用不报。A 类是装配替身，没有导出名，不查这一类。
- 表过期（`stale`）：未到期的项写的导出名找不到定义，退出 2。未映射（`unmapped`）：B、C 类项 `exists` 为真而 `exports` 为空，缺省只列出，`--strict` 时退出 1。表缺失、JSON 非法、字段缺失、`dueBy` 非法或检出不是 Git 仓库时退出 2，不输出「未发现问题」。
- 清点表列出每个入口导出的值（纯类型不列）与引用它的文件数，测试与产品源码分计。入口解析用 TypeScript 编译器 API，沿重导出走到声明处。
- 引用查找是名字级的 `git grep -n -w`，只看 `packages/`、`apps/` 下已跟踪的脚本文件：同名的无关符号会误报，经别名导入或动态拼出的名字会漏报，未跟踪的文件看不见。命令只运行 `git rev-parse` 与 `git grep` 并读文件，不写仓库。结果只对被扫描的提交成立。

### 整洁检查

`--hygiene` 跑整洁检查，报出的规则是 `hygiene-document-allowlist`、`hygiene-spec-shape`、`hygiene-spec-content`、`hygiene-comment-forms`、`hygiene-size-bands` 与核基线的 `hygiene-baseline-ratchet`。

- `hygiene-baseline.json` 记线（文件行数、函数行数、规格行数、注释）与存量例外：文档、注释、超线文件、超线函数。它只由 `hygiene:baseline` 写，命令从当前树重算并覆盖整份文件。
- 基线只能收窄。基线里多出不再需要的条目也报出，所以删掉一处例外之后要重新生成基线。
- `.meta_harness/design/architecture/` 与 `.meta_harness/design/basis/` 是给统筹用的留存设计，不约束实现。文档白名单放行这两个目录，不记进基线。别的目录不照这个例子加：要留一份不约束实现的设计，放进这两个目录之一。

## 原则与约束

- 加规则：在 `src/rules/` 写一个 `Rule`，按它要的路径与解析登记进 `RULES` 或 `REPOSITORY_RULES`。补故意违反就失败、合规就通过的两向夹具。来源条款写进 `source` 字段，本规格的规则表同时写「不覆盖」。
- 读真实产品源码做变异核对的用例，锚点是真实源码里的一段文字。产品源码改写后锚点失配时更新锚点，不删核对。变异不修改产品源码。
- 不另建同义规则：一条规则可以同时服务几个来源的同一禁令。
- 夹具通过只证明检查器能检出指定反例，不证明还没有出现的消费者满足契约。
- 改动这些规则与 `commit-attribution-baseline.json` 的 PR 经仓库工具链变更闸门确认。
- 依赖专门 CLI 的回归用例使用构建后的 `dist/`，先构建再跑测试。

## 不变式

- 有任何违反时 `lint:rules` 退出 1。
- 退役表、署名基线或整洁基线读不出时报错，不当作空表。
- 未知不报成功：「未发现问题」只在没有发现、没有过期、没有未映射时输出。
- 替身清点不写仓库。
- 历史审计基线只放过确切提交里的共同作者行。
