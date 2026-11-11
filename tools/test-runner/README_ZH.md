# test-runner

[English](README.md)

测试运行器：按影响面计划成员的构建、类型检查、测试与验收，运行它们并写耗时账本。规则在 [`test-runs.config.json`](test-runs.config.json)。本成员不发布，turbo 完全接替以后删除。账本的读取格式由 repo-toolchain 的 `core/test-ledger` 定义，clean loop 与体检页按它读取。

## 测试运行

`src/testing/` 是本包的第三入口：算一次改动的影响面（`pnpm run check` 的执行计划）、决定跑哪些成员的测试、以多大的并行度跑、把时间花在哪记成账本、
失败之后单独重跑归类。同一个运行器也跑成员的可执行验收（`--script acceptance`）。

```sh
node --experimental-strip-types tools/test-runner/src/testing/cli.ts baseline [--base <基线>]  # 打印统一规则取到的基线与来源（explicit、task、origin/main、main）；pnpm run check 开头用它。已绑定任务的树只接受等于 targetBase 的显式基线
pnpm run check:plan [--base <基线>]                 # 只算影响面并打印计划：判成什么、每一步跑还是跳、选中谁与为什么；FULL=1 全量
pnpm run test:affected --base <基线提交或分支>       # 只构建并测试受这次改动影响的成员的快层；不给 --base 时按统一规则取基线（环境变量 BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main）；--tier slow|all 换层
pnpm run test:affected --base <基线> --plan-only     # 只列受影响范围与层，不构建也不运行
pnpm run test:tier slow                             # 先构建，再跑全部成员的某一层
pnpm run test:triage --run <运行目录>                # 把那次运行里的失败逐条单独重跑并归类（测试或验收的运行都行）
pnpm run test                                       # 全量两层：turbo 先构建，再跑全部成员（同 pnpm run test:tier all）
pnpm run test:gate                                  # pnpm run check 的测试一步：按影响面计划跑被选中成员的快层，快层全部通过才跑慢层（基线按统一规则取；FULL=1 全部）；单独运行时由 turbo 先构建
OMNE_TEST_CACHE=0 pnpm run check                    # 成员测试不读结果缓存（本次有构建时照常写）；test:affected 与 cli.ts 的 run、step、check 另认 --no-cache；test:tier 不认 --no-cache，改用 OMNE_TEST_CACHE=0 或 FULL=1。缓存见「结果缓存」
pnpm run acceptance                                 # 构建有 acceptance 脚本的成员及其依赖，再跑它们的验收；--no-build 不构建
node --experimental-strip-types tools/test-runner/src/testing/cli.ts check [--admission] [--keep-going] [--list] [--resume-from <H1>]  # pnpm run check 的正文：取基线、算计划、按步骤图跑全部检查；调用方（scripts/check.sh）先取运行名额。--list 只打印步骤表（名字、依赖、重轻、命令），不取基线、不算计划、不跑；--resume-from 接续 H1 上快速失败的准入（全量或按影响面），只在准入模式下可用，见「准入」一节
node --experimental-strip-types tools/test-runner/src/testing/cli.ts check --preflight  # pnpm run preflight 的正文：只跑准入里不依赖构建与全量测试的步骤，同时起、失败不终止其余，最后列出全部发现与修法；不写准入日志与记录，见 scripts/README.md「预检」
node --experimental-strip-types tools/test-runner/src/testing/cli.ts admission-evidence --for <F> [--record <路径>]  # 核对 F 上有没有可采用的全量准入（树相同的另一个提交上的也算），见「准入」一节
```

**检查步骤图。**`check` 命令是 `pnpm run check` 的正文：步骤表在 `src/testing/check-steps.ts`，运行器在 `src/testing/check-graph.ts`。

- 每一步只声明先于它完成的步骤，没有依赖的同时跑。
- 重步骤（构建、类型检查、成员测试、验收）自己按预算起多进程，一次只跑一个；轻步骤（含 pytest，pytest 自己按预算的四分之一起 xdist 进程）同时至多 `max(2, 核数 ÷ 3)` 个。
- 一步失败：不再起新步骤，正在跑的整棵进程树终止，退出码取第一个失败的那一步。`--keep-going` 时其余照跑，依赖失败步骤的不启动。
- 产物：每步的输出落 `tmp/check-run/<head 短号>/<步骤>.log`（名字里的 `:` 换成 `-`，例如 `check-docs.log`），只留最近 5 个头的目录；结束时写逐步耗时表 `tmp/check-run/<head 短号>/steps.tsv` 与运行记录 `run.json`（见「准入」一节），并打印实际走过的关键路径。
- 准入模式（`--admission` 或 `OMNE_ADMISSION=1`）另写准入日志，内容与位置归 [scripts/README.md](../../scripts/README.md#check-的步骤图)。步骤的含义与顺序也归那里。
- `--list` 打印步骤表，供别的成员核对自己有没有接进来（dev-flow 的接线测试用它）。

自测：`tests/check-graph.spec.ts` 用假步骤核对依赖顺序、轻重两条道的并发上限、失败取消与 keep-going、起不来的命令、逐步表与关键路径。

**分层。**测试分快慢两层，定义只在仓库根 [`vitest.tiers.mts`](../../vitest.tiers.mts) 写一处：一个 `slow` 标签（带慢层时限 120 秒），
以及把 vitest 的 mode（`fast`／`slow`，不给为两层）翻成 `tagsFilter`。给了 mode 时，`passWithNoTests` 与 `experimental.preParse`
还取决于命令行的过滤（`-t` 给的用例名，或位置参数给的文件）：

- 不带过滤：两项都开。一层里一个测试都不剩（成员没有慢测试，或全是慢测试）不算失败。
- 带过滤：关 `passWithNoTests`，过滤后一个文件都不剩时 vitest 非零退出。
- 带 `-t`：还关 `preParse`。preParse 只认字面量的用例名，`test.each` 生成的名字与变量给的名字它匹配不到，会把整个文件滤掉。

不论给不给 mode，带过滤时 `testTiers` 还挂上过滤守卫（`src/testing/filter-guard.ts`，vitest 报告器）：过滤后一条用例都没有真跑
（用例全被跳过，或一个文件都没剩），这次运行就退出 1，并在标准错误里写出过滤条件。watch 模式、运行被打断、有文件失败（含加载失败）
或有未处理的错误时，守卫不出声，失败原因由 vitest 自己报。命令行给了 `--reporter` 时，vitest 用它替换配置里的全部报告器，守卫不在：
一个文件都不剩仍由 `passWithNoTests` 判失败，用例全被跳过则不再判失败。运行器自己起的 vitest 都传 `--reporter`：
`run.ts` 的逐成员运行不带过滤；`triage.ts` 的单独重跑只按 JSON 报告归类，没选中的用例记为「未能单独重跑」。
过滤由 `cliFilters` 照 vitest 自己的命令行解析读出。只认经 vitest 的入口 `vitest.mjs` 起的进程，`--` 之后的词不算。
`VITEST_BOOLEAN_OPTIONS` 里的布尔选项不把后面的词当值（那个词不是 `true`、`false` 时算文件过滤），其余选项都吞下后面一个词，
包括命令行没定义的配置键（如 `--typecheck.include`）。经 API 起 vitest 时（如 Stryker）读不到过滤，按不带过滤算。

每个成员的 vitest 配置写成 `defineConfig(({ mode }) => …)`，在 `test` 里先展开 `testTiers(mode)`，在 `typecheck` 里先展开它的 `typecheck`。
展开的部分还排除嵌套归档目录（`**/*.legacy/**`），并在设了 `OMNE_TEST_REPORT_DIR` 时挂上 JSON 报告与计时报告。这个变量在测试进程里置空，测试起的夹具 vitest 不往运行目录写报告。
成员有三个测试脚本：`test:fast` 是 `vitest run --mode fast`，`test:slow` 是 `vitest run --mode slow --typecheck.enabled=false`（`*.spec-d.ts` 都归快层），`test` 是 `vitest run`。
脚本不先构建，构建由 turbo 的 `dependsOn` 或运行器的构建一步负责。一个测试归慢层：整个文件在开头注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
并写一句为什么慢。时限的先后：用例自己写的（选项里的 `timeout` 或 `test(名字, 函数, 毫秒)`）＞ 慢层标签的 ＞ 成员配置的 `testTimeout` ＞ vitest 默认 5 秒。
运行器的 `--tier fast|slow|all` 选 turbo 任务 `test:fast`、`test:slow` 或 `test`。层只经脚本里的 mode 传递，外面环境里的变量改不了层。
`--base` 缺省 `fast`，`--all` 缺省 `all`，验收不分层、不接受 `--tier`。层记在账本的 `meta.tier`，
慢层与快层运行的目录名带 `-slow`／`-fast` 后缀。被滤掉的用例在报告里是跳过，账本把它们计进「没跑」，不计进「用例」。
开着 preParse 时（给了 mode、不带 `-t`），整个文件都被滤掉时 vitest 不导入它；用例名或标签不是字面量时静态解析看不出，照常导入、导入后再过滤。
自测：`tests/test-tiers.spec.ts` 真起 vitest 核对三种层各跑了什么、整文件归慢的在快层下不被导入、没有慢测试的项目在慢层下退出 0、标签写错会报错，
并核对交给 turbo 的命令与 `turbo.json` 里三个测试任务的 `env`、`passThroughEnv`。
同一文件还真起 vitest 核对带过滤的运行：快层、慢层与「文件加用例名」三种写法都选中 `test.each` 生成的用例；
用例名或文件过滤后选不中时非零退出并写出过滤条件；布尔选项后面紧跟的文件过滤同样认得；带点的带值选项吞下它的值，不当成文件过滤；
过滤到的文件加载失败时非零退出，只报加载错误；失败归因的单独重跑选不中时归为「未能单独重跑」。
两条对账测试把 `VITEST_BOOLEAN_OPTIONS` 与安装的 vitest 命令行定义双向比对，把 `cliFilters` 的读数与 vitest 的 `parseCLI` 逐选项比对：
vitest 升级后新增或改动布尔选项，表没跟上，这两条就失败。
`tests/filter-guard.spec.ts` 直接核对守卫：一条用例都没跑或一个文件都没剩时判失败；有用例真跑了、运行被打断、watch 模式、
文件失败或有未处理的错误时不出声。

**验收**（`run --all --script acceptance`）：选的是 `package.json` 里有 `acceptance` 脚本的成员（同样排除 `affected.excludeRoots` 和 `.legacy` 目录），
逐个跑 `pnpm run acceptance`，并行度、vitest 的 JSON 报告、账本格式都与测试相同。计时报告器的输出路径只能写在配置里，所以验收的账本没有导入耗时，贴线按 vitest 默认时限判；账本根另放在主检出的 `tmp/acceptance-ledger/`
（`OMNE_ACCEPTANCE_LEDGER_HOME` 可改），不混进体检页读的测试账本。每份 `ledger.json` 的 `meta.script` 写着跑的是哪一种，
`triage` 照它经同一个脚本重跑（`pnpm run <脚本> <文件> -t …`，验收的那份带着自己的 vitest 配置）。验收的 `--all` 缺省先构建，`--no-build` 跳过。
测试的 `--all` 缺省不构建（由调用方先构建），给 `--build` 才构建；`--base` 缺省构建，`--no-build` 跳过。`pnpm run check` 不调 `pnpm run acceptance`，而是按计划跑 `step acceptance`：
只跑被选中、带验收的成员（驱动前面构建好的 `dist/`，不再构建），任何一份不过整套检查就失败；一个都没有时记一份「跳过」的账本（见[验收耗时](../repo-toolchain/README_ZH.md#验收耗时)）。

**影响面怎么算**（`src/testing/scope.ts` 归类改动文件，`src/testing/turbo.ts` 调 turbo 选成员；规则在 `test-runs.config.json` 的 `affected`）。改动文件取基线合并点到当前工作树的全部差异，
含未提交与未跟踪的文件，改名拆成删与增两侧，文件名原样（不受 git 的引号转义影响）。完整成员清单读 `pnpm-workspace.yaml`，用于解析声明依赖。直接检查、测试及验收目标排除 `affected.excludeRoots` 下的成员和任意层级中以 `.legacy` 结尾的目录。`FULL=1`、未知路径回退和 `run --all` 均应用这一排除。必要的封存构建依赖可准备，但不运行其类型检查、测试和验收。`.legacy-not` 不属于排除后缀。
以 `.legacy` 结尾目录中的改动先记为排除，不触发未知路径全量回退。其余改动文件按顺序归到第一类命中的：

1. **全局**（`globalPaths`：根清单、锁文件、共享 tsconfig、分层定义 `vitest.tiers.mts`、`scripts/check.sh` 与入口脚本 `check-design.sh`、`metrics.sh`、`slot-unless-plan-only.sh`、`test-tier.sh`、本配置文件、
   测试运行器与影响面引擎自身的源码（`src/` 下从入口 `src/testing/cli.ts` 与 `src/testing/check.ts` 沿静态导入能到的 `.ts` 文件，加上按路径加载的过滤守卫，列在 `tests/engine-closure.spec.ts` 的 `PATH_LOADED` 里；清单由该文件守住，新增引擎模块时测试会提示加进 `globalPaths`），以及任何位置的 `turbo.json`）：整份计划判全量——
   引擎改了，这次的计划就是用改过的引擎算的，不能拿它来给自己划范围。
   引擎从 repo-toolchain 导入的 `core/workspace`、`core/git` 与根配置的预设来自钉住的 npm 包，改它们的版本就是改 `pnpm-workspace.yaml`（全量）与锁文件（按下一条判）。
   **锁文件例外**（`pnpm-lock.yaml`，`src/testing/lockfile-impact.ts`，`src/testing/pnpm-lockfile.ts` 读它）：只用于普通的影响面计划，增量准入（`check --resume-from`）里锁文件按全局文件处理，见下面「准入」一节。
   它是唯一命中的全局文件时不直接全量，而是把基线与工作树两份锁文件的差异按 importer 映射到成员——
   `importers:` 下有变化的条目对应的成员，加上直接或间接依赖了有变化的 `packages:`／`snapshots:` 条目的成员（沿 snapshot 的 `dependencies`、`optionalDependencies` 反向求传递闭包，去掉的包按基线图、新加的按工作树图）；
   映射到的成员作为种子，与代码改动的成员一样按 turbo 的依赖图带上下游。下面任一情形仍判全量并写明原因：顶层 `lockfileVersion`、`settings`、`overrides`、`patchedDependencies`、`catalogs` 或别的顶层键有变化；
   根 importer（`.`，全仓的工具）的依赖直接或间接变了；任一份解析失败，或锁文件里有解释不了的引用（importer 不在成员清单里、依赖指向不存在的 snapshot、变化的包没有任何 importer 依赖它）；
   `tools/test-runner` 自己在映射到的成员或其下游里（引擎自己的依赖变了）；与别的全局文件一起改（这时不问映射）。两份解析后等价时不因锁文件选成员。
   计划输出的「锁文件：」一行原样写出映射模块的结论，被选中成员的原因写明锁文件里它哪些依赖变了；`check:plan --json` 的 `plan.lockfile` 是同一句话。
   测试结果缓存的键不按这条收窄：锁文件仍进每个成员的键，锁文件一变全部条目失效，比计划保守（只多重跑、不少跑），见「结果缓存」。
   `tools/dev-flow/src/integration/**` 不是全局路径，按 dev-flow 的成员文件算，改它跑 dev-flow 的测试：
   `scripts/check.sh` 用本包的 `baseline` 取基线，不执行这里的代码；
   其他工具成员不导入 dev-flow；
2. **读者**（`readers`：`{ paths, members, why }`）：这些路径被这些成员的测试读——改了只把这些成员带进来，**不沿反向依赖传播**；
   每条记录实际读者和依据；`packages`、`apps`、`examples` 下的 TS → product-checks；成员清单 → test-runner；
   工程协议及当前产品设计输入 → dev-flow 与 product-checks；
   `docs/clean-loop.md`、整洁之道对照表、`scripts/with-test-slot.sh` → repo-toolchain 与 test-runner；
   被成员测试读的成员根目录文档与组目录下的文档 → 读它的那个成员，逐份写在配置的 `readers` 里，这里不另列；
3. **成员文件**：按最长的成员目录前缀归属。哪些成员进来由 turbo 的 `--affected` 给出：改了文件的成员，与按 `package.json` 声明的依赖
   直接、间接依赖它的成员（含 `devDependencies`，因为测试可能导入生产代码不导入的包）。
   成员根目录与 `apps/*/deploy/` 下的 `.md`（`memberDocuments`）不算成员改动，归「只需常驻检查」。
   turbo 按包计改动，会选中那个成员与它的全部下游。计划这样处理（依据见 [RFC-0002 revision 3](../../docs/rfcs/RFC-0002-engineering-toolchain.md#影响面选择)）：
   - 只改了文档的成员当作没有改动：不进测试、类型检查与验收，也不作下游选择的种子。
   - 计划用 turbo 的依赖图（`turbo ls --filter=...<包>`）求出只改了文档的成员及其下游，从 `--affected` 里拿掉其中不是代码改动成员下游的那些。
   - 同一成员既改文档又改代码，照旧选中它与下游。只改了文档的成员是别的代码改动成员的下游时，照旧作为下游选中。
   - 拿掉之前核对：turbo 选中的每个成员都要在代码改动成员或只改了文档的成员的下游里（含它们自己）。
     有解释不了的成员，说明 turbo 的种子里有规则没认出的改动，计划判全量，理由点名这些成员。
   - 被测试读的成员根目录文档由上面的读者规则点名，只选规则点名的成员，不带下游。
   - 计划说明把没有选中的这类成员列在「只改了文档、不选的成员」下；`check:plan --json` 的 `plan.documentsOnly` 给出同一份清单。

   所以只改一个不被任何测试读的成员 `SPEC.md` 或 `README.md`，计划只跑常驻检查；改被读者规则点名的文档，选中规则点名的成员。
   测试读了成员根目录文档却没有读者规则，改它时就漏选：新增这样的读取要同时补一条读者规则。
   `tests/` 等其余目录里的 `.md` 可能是夹具（本包 `loop-canary.spec.ts` 就改写夹具里的 README 再断言），照成员改动算；

4. **Python 工具**（`pythonPaths`）：跑 pytest；
5. **只需常驻检查**（`residentPaths`）：文档、设计区、research、给人读的指南 `.meta_harness/human/**`、`examples/`、`.github/`、格式配置、`tools/model-probe/` 等；
   `.meta_harness/human/` 下只有 `.md`，只有常驻检查 `check:docs` 读它，成员测试、pytest 与影响面规则都不读；
6. 其余（没有规则认得的，如 `.gitignore`）：整份计划判全量，理由点名前几个文件与总数。

读者、成员文件与 Python 工具三种归属可以同时成立（另一个成员的 `schema/` 既是那个成员的文件又被别的成员的测试读），三者都算。
被选中的成员定下之后：测试、类型检查、验收各取其中有对应脚本的；构建取其中有 `build` 脚本的，
另加 `residentBuild` 列的成员，纯文档改动也构建它；它们的上游由 `turbo run build` 按依赖先构建。
`residentBuild` 现在是 legal-identity（`lint:rules` 导入它的 `dist`）、repo-toolchain（工具 CLI 经包入口导入它）与 `packages/agent/agent`
（`lint:deps` 解析它的验收夹具 `acceptance/fixtures/executor.mjs` 对 `dist/index.js` 的导入，没有构建产物的检出上「只需常驻检查」的计划会在 `lint:deps` 失败）。
类型检查由 `turbo run typecheck` 对被选中的成员运行它们自己的 `typecheck` 脚本：不先构建，同时 4 个成员。任务按输入缓存：根 `turbo.json` 让它依赖上游成员的 `typecheck`，上游源码一改，下游的任务哈希随之改变；成员目录以外、又不经 `workspace:` 依赖读到的文件列在 `globalDependencies` 里：仓库根的 `vitest.tiers.mts`（tools 成员的 vitest 配置），以及 `tools/repo-toolchain/src/**` 与 `tools/repo-toolchain/tests/fixtures/**`（`tools/dev-flow`、`tools/test-runner` 的测试经相对路径导入）。单独运行读写本地缓存，准入模式只写不读，与构建相同。
嵌套归档目录（名字以 `.legacy` 结尾）的排除写在成员的 `tsconfig.test.json`（模板给 `"exclude": ["**/*.legacy/**"]`）。
运行前 `src/testing/typecheck-scope.ts` 只解析配置、不跑 tsc，核对编译根里没有归档文件：成员自己的 `exclude` 盖掉了模板那条，
或者 `include` 指到成员目录外的归档目录，或者 `typecheck` 不是 `tsc -p <配置>` 形式而成员里有归档目录，就点名报错，不运行类型检查。
`FULL=1` 或 `--full` 直接给全量计划。算不出计划——基线不存在、取不到改动、规则点名的成员不存在、turbo 出错、成员目录下有不合规则的 `turbo.json`——就报错退出，不改判全量。
成员目录下的 `turbo.json`（`src/testing/member-turbo.ts`）：`apps/*` 之外的一律拒绝；`apps/*` 的由 `turbo run <根任务…> --dry=json` 取合成后的定义，
按[开发指南](../../docs/development.md#迭代中的受影响测试)的七条暂行规则核对——`extends` 只能是 `["//"]`，只覆盖根已定义的任务，`dependsOn` 与 `env` 只增不减，
测试任务不缓存，`outputs`、`inputs` 不指到成员目录外，不设 `persistent`。`passThroughEnv` 只放不影响结果的变量，这一条机器判不了，留给评审。
计划与不经计划的测试运行（`run --all`）都做这项核对。
turbo 的运行条件（根配置取运行检查器仓库的 `turbo.json`、基线显式传入、`OMNE_ADMISSION=1` 时只写不读缓存、关闭遥测与升级提示）在 `src/testing/turbo.ts`。

`cli.ts replay [--ref main] [--count 40]` 对一条分支最近的 first-parent 提交逐个以父提交为基线算计划（成员清单取那个提交上的、规则取现在的，只算不跑；turbo 的包依赖图取当前工作树的，是一个近似，现在已不存在的成员没有下游），
改规则前后用它看「判全量的有几个、该不该全量」。

**不能声称**：没被选中的成员通过；测试读了某个路径却没写进读者规则，改它时就漏选——规则是查出来的现状，不是机器推导的，
新增一处这样的读取要同时补一条规则；环境变量、外部服务与时间不在影响面里。合并后没有自动补跑，全量由负责人不定时让一个会话手动跑 `FULL=1 pnpm run check`。
自测：`tests/scope.spec.ts` 用真实规则与一份造出来的成员清单核对各类改动的判法（含上面几条收窄的正例与反例，以及锁文件按 importer 映射的几种结论与它和文档种子、别的成员改动并存时的选法），另在临时仓库核对改名与非 ASCII 文件名，在本仓库核对 turbo 的依赖图与读者规则里的路径都存在。锁文件差异到成员的映射本身见 `tests/lockfile-impact.spec.ts`，解析器见 `tests/pnpm-lockfile.spec.ts`。

**怎么跑。**`pnpm run test:affected` 先用 turbo 把目标成员连同它们的依赖构建一遍（测试执行的是依赖的 `dist/`；
`pnpm run check` 则由前面的构建一步按计划构建）。然后运行器调用一次 `turbo run <层的任务> --continue=dependencies-successful`。
调用方已经构建过时（`pnpm run check` 的测试一步、`run --all` 不带 `--build`）带 `--only`，只跑测试任务；
否则不带，turbo 按任务的 `dependsOn` 在同一次运行里先构建成员及其上游（准入模式下构建缓存只写不读）。
构建失败的成员不跑测试，记为失败并点名失败的构建。`--concurrency` 是同时跑的成员数，每个成员的 vitest 至多起 `VITEST_MAX_WORKERS` 个工作进程；两个数由下面的「并行度」推出来。
一个成员失败不拦其余的，结束时列全失败；退出码只反映测试是否全过。各成员的退出码与起止时间取自 turbo 的运行摘要（`--summarize`），
摘要里没有某个成员的执行记录时，这个成员记为失败。turbo 的输出按每行的 `<包名>:<任务>: ` 前缀拆成各成员的日志。
报告里出现嵌套归档目录中的测试文件时，这个成员也判失败：成员配置的排除没有生效。
turbo 的 Strict Mode 只把声明过的环境变量传给任务。`turbo.json` 里三个测试任务的 `env` 列出影响结果的变量（临时目录、`OMNE_RUNNER_ROOT`），`passThroughEnv` 只列不影响结果的（vitest 并行度、报告目录）；turbo 的测试任务不缓存，两者在这里都只决定变量能不能传进去。成员级的结果缓存由运行器自己做，它的键读 `test-runs.config.json` 的 `cache.env`，与 `turbo.json` 的 `env` 是两份各自独立的清单，见下一段。

**结果缓存。**成员测试按成员、按层缓存**完整通过**的运行（`src/testing/test-cache.ts`）：退出码 0、写出了报告、报告里没有失败的文件或用例、运行器自己没判问题。失败、超时、被中断、没写出报告的从不进缓存；验收不缓存。写缓存还要满足下面两条。条目在**主检出**的 `tmp/test-cache/<成员>/<层>-<键>.json`（`OMNE_TEST_CACHE_HOME` 可改根目录），记来源账本的目录、提交、时间、用例数与文件数。
只有对这次构建出的产物跑出的通过才写缓存。具体规则：

- 构建成功后，运行器为每个被构建的成员记两个摘要。**输入摘要**在构建**开始前**取，与缓存键同源，但不含层。**产物摘要**在构建**完成后**取：本成员与上游成员 `dist/` 里全部文件的路径、字节数与 mtimeMs，排序后取 sha256。只 stat，不读文件内容。
- `step build --plan` 把这份记录写在计划文件旁的 `built-from.json` 里，带上计划的头号；每个成员项是 `{ input, output }`。取不到产物摘要时不留记录，后面的测试不写缓存。
- `run --build` 在同一进程里取开跑前的输入摘要。构建紧接测试，间隙很短，这条路径不记产物摘要，也不核对：这段间隙里别的进程改写 `dist/`，它看不出。
- 写缓存前，运行器重算成员当前的输入摘要，必须等于构建记录里的输入摘要。记录来自文件时，还要重算产物摘要，必须等于记录里的产物摘要。任一项不等，就跳过这个成员，并打印原因：「构建之后输入变了」或「构建之后 dist 被改过」。
- 构建完成之后、测试算键之前有一段间隙：这段间隙里 `dist/` 可能被别的构建换掉。输入摘要看不出这种变化，产物摘要看得出。
- 整份记录不可用时不写缓存，原因分三种：计划旁边没有构建记录；记录是另一个提交的（原因里写两个头号的前 9 位）；记录是旧格式（成员项不是 `{ input, output }`）。
- 手工跑 `step test --plan`、前面没有构建这一步时，一律不写。
- 没有 `build` 脚本的成员不在构建记录里，所以在 `check` 里不写缓存。这是有意的：宁可少命中，也不错命中。
- 产物摘要不读文件内容。改了 `dist/` 里文件的内容、又让字节数与 mtimeMs 保持不变，这种改动发现不了。
键与影响面**同源**：一个成员的输入集就是「改了会让计划选中它」的那些文件，由 `scope.ts` 的 `classify` 按 `affected` 规则判，不另写一套——全局文件与没有规则认得的文件（改了计划判全量）进每个成员的键；读者规则点名它的文件、它自己的文件（成员根目录文档除外）、它上游成员的文件（按 turbo 的包依赖图传递，一次 `turbo query` 取整张图，与 `--affected` 走同一张图）进它的键；只需常驻检查的路径、Python 工具、退役目录与别的成员的文件不进。
每个文件取 git 的 blob id：已跟踪且干净的读索引，改过与未跟踪的用 `git hash-object` 现算（走同一套换行过滤，内容改回去 id 也回去）；工作树里删掉的不在，被忽略的从不在。键里另有层（turbo 任务名）、平台与架构、Node 版本，以及 `test-runs.config.json` 的 `cache.env` 列出的环境变量（`NODE_OPTIONS`、`OMNE_RUNNER_ROOT`、`VITEST_*`；`cache.ignoreEnv` 排除 `VITEST_MAX_WORKERS`——并行度、预算、报告目录这类只影响怎么跑的不进键，否则机器一忙键就变、永远不命中）。锁文件、根清单、分层定义、运行器自身的源码与配置、成员的 vitest 配置与 `package.json` 都已由上面的规则进键，不另列。
命中的成员不执行：运行时打印 `缓存命中，<n> 条用例，来源 <账本目录>`，摘要末尾一行写命中几个成员、来源哪些账本、这次写入了几个。一个成员都不跑时，打印 `<N> 个成员全部命中缓存，没有执行（<层>）`。成员测试的账本（`ledger.json`）因此有以下形状：

- `meta.members`：这次覆盖的全部成员，跑了的加命中的。
- `meta.cache`：`mode`（`read-write`、`write-only` 或 `unavailable`：这次读不读缓存）、`reason`（只写不读或不可用的原因）、`home`（缓存根）、`hits`（每项有 `member`、`key`、`source` 即来源账本目录、`tests` 即用例数）、`written`（这次写入的成员）、`write`（`on` 或 `off`：这次写不写缓存）、`skipped`（通过了、但因为没有构建记录、构建之后输入变了、构建之后 dist 被改过或运行期间输入变了而没写的成员数）、`uncacheable`（算不出键的成员与原因）、`problems`（写不进去的原因）。验收的账本没有这一栏。`mode` 与 `write` 互相独立，例如 `mode: read-write` 同时 `write: off`，表示这次读了缓存、但不写。
- `members`、各成员的文件、`failures` 与 `nearTimeout`：只有这次跑了的成员。一层的成员全部命中时它们都是空的，这一层算通过。

快层全部通过（含命中）才跑慢层的规则不变。`triage` 与失败归因只读 `failures`：命中的成员没有失败可重跑，跑了的失败照常单独重跑、归类。
锁文件在键里不按 importer 收窄：计划把锁文件改动映射到受影响的成员，键却取整份锁文件的内容摘要。所以锁文件一变，所有成员的条目都失效，没被映射到的成员也要重跑。这只多重跑、不少跑。
**什么时候写缓存。**两条都要满足，成员才写：

1. 本次调用为被选中的成员构建过，并且有构建记录（见上）。`run --no-build` 与默认不构建的 `run --all` 不写，因为这两种调用测试可能跑的是旧 `dist/`。`check`、`step test` 在构建一步之后运行，`test:affected` 与 `test:tier` 默认构建，它们可以写。
2. 跑完后重算键，与开跑前的键一致。运行中输入变了的成员跳过，日志写一行原因。重算本身失败的成员同样跳过。

**什么时候不读缓存（照常算键）。**各入口的读写条件分别是：

| 入口 | 不读缓存的条件 | 写缓存 |
| --- | --- | --- |
| `pnpm run check`、`pnpm run test:gate`（`step test`） | `FULL=1`、`OMNE_TEST_CACHE=0`、准入模式 `OMNE_ADMISSION=1`；`pnpm run check` 不认 `--full`、`--no-cache`，`cli.ts check` 与 `step` 另认 | 构建之后，满足上面两条时写 |
| `pnpm run test:affected`（`run --base`） | `FULL=1`、`--no-cache`、`OMNE_TEST_CACHE=0`、准入模式 | 缺省构建，满足上面两条时写；给 `--no-build` 不写 |
| `pnpm run test:tier`、`pnpm run test`（`run --all --build`） | `FULL=1`、`OMNE_TEST_CACHE=0`、准入模式；不认 `--no-cache` | 带 `--build`，同一进程里有构建记录，满足上面两条时写。所以 `FULL=1 pnpm run test` 不读缓存，但会写 |
| `cli.ts run --all`（不带 `--build`） | `FULL=1`、`--no-cache`、`OMNE_TEST_CACHE=0`、准入模式 | 不写 |

本次没有构建记录时同样不写，账本里 `write` 为 `off`。`run` 与 `check` 都认环境变量 `FULL=1`。准入不读待合并的改动能写入的缓存，与构建、类型检查的 turbo 缓存同一条规则。快照或依赖图取不到、条目坏了、写不进去，一律按未命中：既不让检查失败，也不让检查放行。
做法借鉴 [ub-mode](https://github.com/unclebob/ub-mode/tree/57a8bdd) 的 mutator 与 crapper：结果仍有效就复用，只重跑输入变了的。
命中意味着：同一台机器上，键完全相同（同样的输入文件内容、层、平台与架构、Node 版本、列出的环境变量）的一次完整通过曾经发生过。不意味着：这次再跑也会过——不稳定的用例、外部服务、时间与没列进键的环境变量都不在键里；也不证明那次运行的报告本身可靠。影响面规则漏掉的读取，缓存键同样漏掉：补读者规则，两边一起补上。自测：`tests/test-cache.spec.ts`（每类输入进谁的键、各类失效、只写完整通过、坏条目；慢层在临时仓库核对快照、在本仓库核对依赖图与每个成员都算得出键、真起 turbo 跑两遍看命中；另在临时仓库里分进程走 `step build --plan`、改源码、`step test --plan`，并起命令行 `run` 核对 `--build` 的接线）。

**并行度。**并行度从机器推出来，不写死（`src/testing/parallelism.ts`）。`pnpm run check` 在起任何步骤之前、机器安静时采样一次，经环境变量 `OMNE_WORKER_BUDGET` 交给各重步骤（重步骤开始时跑着的轻步骤是本图自己的，那时再采会把它们当成别的负载而缩预算，所以只在起步骤之前采一次）；单独运行一步时该步自己采（成员测试的快层与慢层各采一次；先等 `parallel.sampleMs` 毫秒让同时起的兄弟进程过了启动尖峰再量）。采的是核数（`availableParallelism()`）、
`parallel.sampleMs` 毫秒内实测的 CPU 空闲率与空闲内存，得到**工作进程预算** = 核数 × 空闲率，再按空闲内存 ÷ `parallel.memoryPerWorkerMiB` 封顶，至少 1、至多核数。
空闲率让已经忙着的机器（同时跑着的别的检查步骤、后台程序）少被挤；运行名额挡的是整套检查，挡不住别的负载。
预算按 `test-runs.config.json` 的 `parallel` 策略分：同时成员数 = ceil(预算 ÷ `memberDivisor`)，每成员工作进程 = ceil(预算 ÷ `workerDivisor`)，两者不低于 `minimum`，后者不高于 `maxWorkersPerMember`。
构建与类型检查的 turbo 并发、vitest 的工作进程数直接取预算（tsc 的进程占一个核）。
策略只含比例与上下限，不含任何一台机器的核数。初值 3、4、8、2 的依据（`docs/verification.md` 要求写明负载、平台与超限行为）：负载是全量 73 个成员，平台是一台 24 核 Windows 宿主（空闲 0.8，预算 19），扫描的结论：
快层的墙钟 ≈ 各成员 vitest 启动与收集之和 ÷ 同时成员数，到 6 至 8 个成员时碰到 CPU 平台期（91 秒降到 39 至 41 秒），再多只让起子进程的用例贴线；
慢层的下限是起子进程最多的成员（repo-toolchain，28 个慢文件）：它的文件互相挤，每成员 8 个进程比 5 个只快十几秒而文件耗时总和翻倍，所以每成员进程数的除数取 4。
同一策略在 8 核上推出 3 × 2，这只是预测，没有在 8 核上复测；之前 8 核上量到的固定配置 2 × 4 与 4 × 2 只差约 1 分钟。超限的表现是起子进程的用例贴近时限，账本的 `nearTimeout` 列出它们。
`memoryPerWorkerMiB` 是安全上限的估计，不是测量：空闲内存少于它乘预算时才起作用。
预算可用 `OMNE_WORKER_BUDGET`（正整数，超过核数按核数）钉死，不再采样；两个并行度可用环境变量 `OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS` 临时盖过——后者是 vitest 自己认的变量，
会盖过成员配置里的 `maxWorkers`。账本的 `meta` 记下并行度、核数与预算的来历（`budget`：进程数、空闲率、空闲内存，以及是自己采的还是环境变量给的）。

**覆盖率的并发度。**`node --experimental-strip-types tools/test-runner/src/testing/cli.ts coverage-parallel` 打印 `<同时成员数>x<每成员工作进程数>` 一行，说明写到标准错误（`src/testing/coverage-parallel.ts`）。
`pnpm run metrics --coverage` 经 `scripts/metrics.sh` 在占到运行名额后调用它，把结果经环境变量 `OMNE_METRICS_COVERAGE_PARALLEL` 交给 repo-toolchain 的 omne-metrics（repo-toolchain 不依赖本包，预算只在这里推）。
预算与成员测试相同（`OMNE_WORKER_BUDGET` 可钉死）。每成员工作进程数按上面的策略取，不超过预算。同时成员数 = floor(预算 ÷ 每成员工作进程数)，至少 1。
两数之积不超过预算：与成员测试不同，覆盖率这一趟不按名义进程数超订。24 核宿主上预算 19 时是 3x5。

**耗时账本。**每次运行在**主检出**的 `tmp/test-ledger/<提交短号>[-dirty]/<时间>/`（`OMNE_TEST_LEDGER_HOME` 可改根目录，
`--out` 可直接指定）留下：

| 文件                                              | 内容                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.md`                                      | 同时打印到标准输出：总数与墙钟、逐条失败、最慢的成员、超过 `ledger.slowFileSeconds` 的文件、导入耗时最多的成员、贴着自身时限的用例，以及「归层」一行（见下）                                                                                                                  |
| `ledger.json`                                     | 运行坐标（提交、是否干净、基线、并行度、核数、计划的模式与理由；按计划跑验收时另有 `scope`：跳过了谁、为什么；成员测试另有 `cache`：缓存怎么用的、谁命中、来源在哪、谁写进去了）与成员、文件两级的用例耗时与导入耗时、贴着时限的用例（`nearTimeout`，带各自的时限）、失败清单 |
| `<成员>.log`、`<成员>.json`、`<成员>.timing.json` | 各成员的原始输出、vitest 的 JSON 报告、计时报告                                                                                                                                                                                                                               |
| `turbo.log`、`turbo-summary.json`                 | 成员测试时 turbo 的整份输出与运行摘要（摘要从被测检出的 `.turbo/runs/` 挪来）                                                                                                                                                                                                 |
| `build.log`                                       | 验收运行前的构建输出（测试的构建输出在 `turbo.log` 里）                                                                                                                                                                                                                       |

**计时报告**是 `testTiers` 在设了报告目录时随 JSON 报告一起挂给 vitest 的报告器（`src/testing/timing-reporter.ts`，输出路径是报告器选项 `outputFile`），补上 JSON 报告没有的两样：
每个文件的导入耗时（vitest 的 `collectDuration`：导入测试模块及其依赖、执行 describe 回调），每条用例解析后的时限与标签。
**贴着时限**指耗时 ≥ 用例自身时限 × `ledger.nearTimeoutRatio`（初值 0.5：空闲时就占掉一半时限的用例，机器一忙就会越线），
按占时限的比例排；时限 0（vitest 里是不设时限）的不列；成员没写出计时报告时按 vitest 默认的 5 秒算，并在摘要里注明有几条是这样假定的。
成员的 `fileSeconds` 是各文件用例耗时之和（从第一条用例开始到最后一条结束），`collectSeconds` 是各文件导入耗时之和；
墙钟减去两者是进程启动、类型检查与并行重叠。同一文件里同名的用例取第一条的时限。

**归层**一行只列事实，按计时报告里的标签分层：快层用例合计超过 `ledger.slowFileSeconds` 的文件、快层里超过单条预算的用例
（耗时 ≥ 自身时限与 vitest 默认时限中较小的那个 × `nearTimeoutRatio`：自带更宽时限的用例也按默认时限判，快层的预算不随它放宽；
这两项是快层的预算没守住），以及全归慢层、却每条都不到 vitest 默认时限 × `nearTimeoutRatio` 的一半、整份不到 `slowFileSeconds` 的一半的文件
（归慢了却其实守得住；回快层的线取一半，是因为空闲与忙时的读数差一倍上下，同一条线会让贴着它的文件来回被点名）。各列前 `ledger.top` 个。只量这一次跑到的那一层：快层运行里看不到慢层，反之亦然；
受机器负载影响，一次的读数只是线索。

**失败归因。**`triage` 读那次运行的账本，把每处失败单独重跑 `triage.repeats` 次（一次只起一个工作进程、
旁边不跑别的），用例名转义并加锚后交给 vitest 的 `-t`，再从 JSON 报告里核对这条用例确实跑了：

| 归类           | 重跑看到了什么                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 隔离仍失败     | 每次单独跑都不过。与同时运行的其他负载无关                                                                                                                                   |
| 隔离时过时不过 | 单独跑就不稳定                                                                                                                                                               |
| 隔离稳定通过   | 每次单独跑都过；此时再把它所在的文件整个单独跑一次，一并报告。它只说明这不是该用例单独的逻辑错误——原失败可能来自并行负载，也可能来自用例之间的相互影响或执行顺序，工具不区分 |
| 未能单独重跑   | 名字没选中、没有报告，或失败不在任何测试文件里（例如类型检查），要看日志                                                                                                     |

归因只报告，不改变那次运行的结论。重跑的日志与报告在运行目录的 `triage/` 下。

策略都在 [test-runs.config.json](test-runs.config.json)，不写死在代码里。自测：`tests/test-runs.spec.ts`；
运行名额脚本的行为核对在 `tests/test-slot.spec.ts`，脚本本身见[自动化入口](../../scripts/README.md#运行名额)。

## 准入：运行记录、接续与证据核对

规则归[集成规则](../../docs/engineering/integration.md#检查责任)的「增量准入」与「树相同时复用准入」两节；这里是执行它们的工具。三样东西：每次 `check` 写的运行记录、`check --resume-from <H1>` 与 `admission-evidence --for <F>`。准入开始时的环境自检与自愈、预检入口与成员测试的定向重跑归 [scripts/README.md](../../scripts/README.md#环境自检与自愈)，这里只写它们在记录里的形状。

**运行记录**（`src/testing/admission-run.ts`，schemaVersion 1，`kind: admission-run`）。JSON 记录的形状归本节，文本准入日志的格式归 [scripts/README.md](../../scripts/README.md) 的准入日志一段。每次 `check` 结束时写一份 JSON，在本头的目录里是 `tmp/check-run/<head 短号>/run.json`；准入运行另在准入日志旁边写一份同名的 `.json`（`tmp/admission/<时间>-<head 短号>.json`），与日志是同一份事实的两种写法：人读日志，工具读记录。栏目：

| 栏                           | 含义                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `head`、`tree`               | 40 位提交号与 `git rev-parse HEAD^{tree}` 的树哈希                                                                                                                                                                  |
| `dirty`                      | 开始时或结束时工作树有未提交改动（`git status --porcelain` 非空，或 `git ls-files -v` 里有 assume-unchanged、skip-worktree 的文件；被忽略的文件不算），或结束时头已不是 `head`；这样的记录不是对 `head` 的证据 |
| `worktree`                   | 运行所在工作树的根，取真实路径。接续只在 H1 那次的同一棵工作树里进行 |
| `admission`                  | 是不是准入运行（`--admission` 或 `OMNE_ADMISSION=1`）；只有准入运行能被接续或复用                                                                                                                                   |
| `mode`、`base`、`resumeFrom` | `mode` 说范围：`full`（计划判全量，全部步骤对全部成员跑了：带了 `FULL=1`，或全局文件、未归类路径等让计划判了全量）、`affected`（按影响面，`base` 是本次基线与头的合并点，40 位）或 `resume`（接续，`base` 是 H1，`resumeFrom` 写 H1 的头、树、它失败的那一步、H1 那次的 `mode`（`full` 或 `affected`）与 H1 那次的 `fullRequested`） |
| `fullRequested`              | 说要求：这次运行带没带 `FULL=1`。计划因全局文件判了全量、没带 `FULL=1` 的，`mode` 是 `full`，这一栏是 `false`。接续退化为整次重跑时照搬 H1 的这一栏（重跑的范围同 H1 那次）；接续运行本身不带 `FULL=1`，记 `false`，H1 的在 `resumeFrom` 里 |
| `caches`                     | 这次运行时各缓存的状态：`test` 测试结果缓存（准入只写不读记 `off`，读缓存记 `on`）、`depGraph` 依赖图缓存（`OMNE_DEP_GRAPH_CACHE=0` 记 `off`，否则 `on`）。旧记录里多出的 `mutation` 字段读时忽略              |
| `steps`                      | 按步骤表的顺序，每步 `ran`、`exit`、`seconds`：跑完的记退出码，被终止的与没开始的记 `ran: false`、`exit: null`                                                                                                      |
| `failedStep`                 | 快速失败的那一步（最早结束的失败步骤）；全部通过为 `null`                                                                                                                                                           |
| `startedAt`、`finishedAt`    | 起止时刻                                                                                                                                                                                                            |
| `environment`                | 开始时环境自检与自愈的结果（`src/testing/environment.ts`）：`dependencies.status` 取 `in-sync`、`reinstalled`、`install-failed`、`no-lockfile` 之一加 `detail`；`lineEndings.restored` 是从索引重新检出的 CRLF 工作副本，`kept` 是另有内容改动、没有覆盖的，`blocked` 是 `core.autocrlf=true` 时不检出的说明。只有准入运行写；早于这一栏的记录没有 |
| `retried`                    | test 步一层失败后定向重跑过的文件（`src/testing/test-retry.ts`）：每项 `member`、`file`、`tier`（`fast`／`slow`）、`kind`（`timeout`、`stack-trace`、`startup`、`assertion`）、`firstError`（账本里第一处失败的第一行）、`retryResult`（`passed`、`failed`、`not-run`）。`admission-evidence` 把它列进输出，确认者看得到哪些用例是重跑才过的。没失败或没重跑时为空或没有 |
| `testFailures`               | test 步最终失败时仍失败的文件（定向重跑后仍不过的，或没重跑时的全部），形状同 `retried` 去掉 `retryResult`；`--resume-from` 据它收窄。通过时为空或没有。失败不在任何文件里（成员一级）时为空 |

写入先写临时名再改名，读到的要么是完整的旧记录要么是新的；解析失败、形状不对的文件按「没有记录」处理，不猜。`tmp/check-run/` 只留最近 5 个头的目录。

`dirty` 在结束时再核对一次：各步骤只在被忽略的目录里写东西（`tmp/`、`dist/`、`.turbo/`、`__pycache__/`、`.pytest_cache/` 等），干净的工作树跑完仍是干净的。用 `git update-index --skip-worktree` 或 `--assume-unchanged` 标过的文件，`git status` 看不到它们的改动，所以也算未提交改动。步骤在工作树里留下没被忽略的文件，或运行中有人提交、切换了头，记录就记 `dirty: true`。`tree` 取开始时那个头的树。

**`check --admission --resume-from <H1>`**（`src/testing/resume.ts` 判断，`check.ts` 执行）。H1 上跑过一次准入（全量，或按影响面）、快速失败在步骤 X，修复后在 HEAD 上接着跑，不整次重跑。规则归集成规则的「增量准入」。根脚本的写法是 `pnpm run admission --resume-from <H1>` 或 `pnpm run check --admission --resume-from <H1>`，两者相同。`--resume-from` 只在准入模式下可用（`--admission` 或 `OMNE_ADMISSION=1`），不在准入模式时以 2 退出。它与 `FULL=1` 互斥，与 `--list` 同给时也以 2 退出。

**合并点为什么要求相同。**H1 按影响面运行时，它的影响面是合并点..H1。接续里收窄的重步骤只跑 H1..HEAD 的影响面。两段差异首尾相接时，合并点..H1 ∪ H1..HEAD = 合并点..HEAD，两部分合起来才是 HEAD 相对本次基线的影响面。合并点不同，这两段就接不上。所以 H1 按影响面时，它记录的 `base` 必须等于本次基线与 HEAD 的合并点（`git merge-base <本次基线> HEAD`）。

**只在 H1 那次的工作树里接续。**收窄的构建只重建 H1..HEAD 影响到的成员。常驻步骤与其余成员的测试读的 `dist/` 是 H1 那次留在磁盘上的。记录的 `worktree` 与本次运行的工作树根不同时，以 2 退出。H1 之后在这棵树上构建过别的提交时，磁盘上的 `dist/` 不再是 H1 那次的产物。命令看得出本树上留下记录的运行（准入与否都算；同一工作树、开始时间晚于 H1 记录的结束时间、任何模式，含失败的接续）：它们的头到 HEAD 的改动并进影响面与全局路径的核对，所以它们构建过又被撤回的成员也会补建；其中有带未提交改动的记录，或某个头算不出差异，整次重跑。命令看不出手工构建与没有留下记录的运行，这些情况由运行的人判断，必要时整次重跑。

判断在写任何东西之前，三种结论。

**拒绝**：以 2 退出，不留日志、不写记录，原因逐条写明。下面任一条成立就拒绝：

- 工作树有未提交改动。
- H1 就是当前头，没有修复提交。要重跑请整次准入。
- H1 不是 HEAD 的祖先。
- H1 没有干净的、准入模式的、`mode: full` 或 `mode: affected` 的记录。两处都找：`tmp/admission/*.json` 与 `tmp/check-run/*/run.json`。非准入的、带未提交改动的记录不算。
- H1 只有接续运行（`mode: resume`）的记录。接续不链式。
- 记录写的树与 H1 实际的树不符。
- H1 那次准入的工作树与本次不同。
- H1 按影响面时，记录的基线合并点与本次的不同。
- 记录没有失败步骤：全部通过，或有步骤没跑完却没有失败。
- 除 X 外还有步骤没通过。
- 记录不自洽：失败步骤在步骤表里没有对应的失败结果。
- X 不在当前步骤表里。

**退化为整次重跑**：H1..HEAD 的差异碰到全局路径（`test-runs.config.json` 的 `affected.globalPaths`，退役目录里的不算）时，不接续。锁文件 `pnpm-lock.yaml` 也按全局文件处理，不问 importer 映射。H1..HEAD 的影响面自己判全量（有不认得的路径、turbo 选中了解释不了的成员）时，同样整次重跑。重跑按 H1 那次的范围照常算计划：H1 全量就是 `FULL=1` 的计划，H1 按影响面就是相对本次基线的影响面。说明写进准入日志。记录是一次 `mode: full` 或 `mode: affected`，`fullRequested` 照搬 H1 的。

**接续**：全部步骤都跑。每一步在 HEAD 上的范围按下表定。「整次运行的范围」是 HEAD 上按 H1 那次的范围整次运行时这一步的范围：H1 全量时选全部成员，H1 按影响面时选 HEAD 相对本次基线的影响面。

| 步骤类别 | H1 上的状态 | HEAD 上的范围 |
| --- | --- | --- |
| 常驻步骤（`check:docs`、`lint:oxlint` 等，不按计划） | 任何状态 | 整仓，与每次运行相同 |
| 按计划的轻步骤（`python`） | 任何状态 | 整次运行的范围 |
| 按计划的重步骤（构建、类型检查、成员测试、验收） | 失败（X） | 整次运行的范围。X 是成员测试且满足下一行的条件时例外 |
| 成员测试 | 失败（X），记录写了失败的文件（`testFailures`）、失败都在慢层（快层已对全部成员通过）、H1..HEAD 的差异（含中间运行补进的）都落在这些文件所在的成员里 | 只跑必要的：H1..HEAD 影响到的成员照常跑快慢两层，失败的文件各单独跑一次（所在成员已整个跑过的不重复），计划的 `testResume` 列出它们，证据分组写「只跑失败用例文件」。差异碰到别的路径、失败在快层（慢层在 H1 上没跑过）或记录没写失败文件时回退整次，理由写明。它之后的验收读的是构建的产物，不因它整次 |
| 按计划的重步骤 | 没跑到：被终止、没开始，或记录里没有这一步 | 整次运行的范围 |
| 按计划的重步骤 | 通过，且它之后（`after`，传递）有整次跑的步骤 | 整次运行的范围。成员测试与验收读构建出来的 `dist/`，缩了构建范围就会读到旧产物 |
| 按计划的重步骤 | 通过，其余情况 | 只跑 H1..HEAD 影响到的成员 |

计划文件按步骤各取整次或 H1..HEAD 影响面的那一份。`reason` 写明「接续 H1 的全量准入（失败于 X）：整次 …；按 H1..HEAD 影响面 …」。H1 按影响面时写「接续 H1 的影响面准入（失败于 X）：整次（本次基线的影响面） …」。基线一栏仍是统一规则取到的那一个。

证据写进准入日志：H1 全量时是「准入证据：H1 全量（失败于 X）＋ HEAD 增量（基线 H1）」，H1 按影响面时是「准入证据：H1 影响面准入（失败于 X）＋ HEAD 增量（基线 H1）」，并另起一行写明本次基线与合并点。之后按整次／按影响面／常驻分组列出每一步与原因、H1 运行时的缓存状态、H1..HEAD 的差异文件清单。退化时写「H1 全量（失败于 X）不接续，HEAD 整次全量——原因」，H1 按影响面时写「…不接续，HEAD 整次按本次基线的影响面——原因」，附差异清单。记录的 `mode` 是 `resume`，`resumeFrom` 指向 H1，写明 H1 那次的范围与 H1 带没带 `FULL=1`。

**`admission-evidence --for <F> [--record <路径>]`**（`src/testing/admission-evidence.ts`）。核对 F 上有没有可采用的全量准入，规则归集成规则的「树相同时复用准入」。给 `--record` 时只看那一份；不给时在本树 `tmp/admission/*.json` 里按 F 的树哈希找（不读 `tmp/check-run/`），同树且可采用的取最晚结束的那份。

接受条件如下，每一条都要满足：

- 记录是 schemaVersion 1 的 `admission-run`，`admission` 为真。
- 范围是带了 `FULL=1` 的全量，二者之一：
  - `mode: full` 且 `fullRequested` 为真。
  - `mode: resume` 且 `resumeFrom.fullRequested` 为真：H1 那次带了 `FULL=1`，「H1 全量＋ HEAD 增量」组成的证据是全量准入。
- `dirty` 为假，`failedStep` 为 null。
- 步骤表非空，每步都 `ran: true`、`exit: 0`。
- 有 `finishedAt`。
- 记录的头在本仓库里，记录写的树与头的树一致。
- 树（记录缺 `tree` 时由头补算）等于 F 的树。

下面的记录不是全量准入，拒绝：

- `mode: affected`。
- `mode: full` 但没带 `FULL=1`（`fullRequested` 为假）：只是计划判了全量，原因写「没有带 FULL=1」。
- 接续记录的 H1 只按影响面运行，或 H1 只是计划判了全量（`resumeFrom.fullRequested` 为假）。

任何一项不满足就拒绝，并逐项列出原因。接受时一行写明「F 采用 C 的全量准入，树 … 相同；记录 …；缓存 …」（接续记录另写明「H1 … 的全量准入＋ C 上的增量准入」），退出 0；拒绝退出 1；用法错误退出 2。只核对树相同，不要求 F 是 gate 合并提交，也不看 C 与 F 的祖先关系。

**不能声称**：接续不重跑 H1 上通过了的重步骤的全部成员，只跑 H1..HEAD 影响到的——影响面规则漏掉的读取这里同样漏掉；H1 按影响面时，整个接续的范围也只是 HEAD 相对本次基线的影响面；接续读 H1 那次留在磁盘上的 `dist/`，命令只补建本树上留下记录的运行构建过的成员，手工构建或没有留下记录的运行改过的 `dist/` 看不出；pnpm 依赖提升（`hoistPattern`）让成员读到没声明的依赖时，锁文件的 importer 映射看不到这种读取；`admission-evidence` 接受的是「这棵树上跑过一次干净的全量准入」，不是「这次再跑也会过」；记录与日志都在被忽略的 `tmp/` 下，换一棵检出就没有，不是远程或跨机器的证据。

自测：`tests/environment.spec.ts`（依赖一致不动、副本不同离线安装、安装失败、CRLF 工作副本重新检出、有内容改动不覆盖、`autocrlf=true` 不检出、记录一栏的解析）、`tests/preflight.spec.ts`（两步失败一步慢时全部跑完并一次列出、全过退出 0、安装失败不跑步骤、步骤表只有轻步骤且每步有修法）、`tests/test-retry.spec.ts`（失败分类、≤10 重跑全过记通过、重跑仍失败、>10 不重跑（恰好 10 处重跑的边界）、退出码非 0 却解析不出失败按失败返回、成员一级失败不重跑、报告与记录两栏的读写）、`tests/admission-run.spec.ts`（记录的读写、由步骤图运行写成记录、挑 H1 的记录、工作树根的写法）、`tests/resume.spec.ts`（前提校验的每种拒绝、全局路径与锁文件的退化、增量计划里每一步怎么跑、H1 按影响面时的范围与基线核对、接续不链式、证据文本、取 git 事实、结束时重新核对现场）、`tests/admission-evidence.spec.ts`（逐字段的拒绝、没带 `FULL=1` 的拒绝、按树找、子命令退出码，慢层起真实 CLI）、`tests/check-resume.spec.ts`（慢层，夹具仓库上端到端：只在 oxlint 失败的准入写出记录，修复后接续只跑规定的步骤与成员、轻步骤整次跑，拒绝以 2 退出，碰全局路径整次全量，运行中留下没被忽略的文件时记 dirty；H1 按影响面时接续不选影响面外的成员、基线合并点不同拒绝、接续记录不作 H1；开始时 CRLF 工作副本被重新检出且记录写明；test 步留下的重跑报告进记录；H1 失败于 test 时接续只跑影响到的成员加失败的文件）。接续里 test 步真正按 `testResume` 跑文件的那段（`steps.ts`）只有选择函数的单测（`tests/tier-order.spec.ts`），没有在真实成员上跑过接续。
