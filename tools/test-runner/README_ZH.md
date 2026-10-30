# test-runner

[English](README.md)

测试运行器：按影响面计划成员的构建、类型检查、测试与验收，运行它们并写耗时账本，另提供差分变异测试。规则在 [`test-runs.config.json`](test-runs.config.json)。本成员不发布，turbo 完全接替以后删除。账本的读取格式由 repo-toolchain 的 `core/test-ledger` 定义，clean loop 与体检页按它读取。

## 测试运行

`src/testing/` 是本包的第三入口：算一次改动的影响面（`pnpm run check` 的执行计划）、决定跑哪些成员的测试、以多大的并行度跑、把时间花在哪记成账本、
失败之后单独重跑归类。它替代了根脚本里原先的 `pnpm -r run test`。同一个运行器也跑成员的可执行验收（`--script acceptance`）。

```sh
node --experimental-strip-types tools/test-runner/src/testing/cli.ts baseline [--base <基线>]  # 打印统一规则取到的基线与来源（explicit、task、origin/main、main）；pnpm run check 开头用它。已绑定任务的树只接受等于 targetBase 的显式基线
pnpm run check:plan [--base <基线>]                 # 只算影响面并打印计划：判成什么、每一步跑还是跳、选中谁与为什么；FULL=1 全量
pnpm run test:affected --base <基线提交或分支>       # 只构建并测试受这次改动影响的成员的快层；不给 --base 时按统一规则取基线（环境变量 BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main）；--tier slow|all 换层
pnpm run test:affected --base <基线> --plan-only     # 只列受影响范围与层，不构建也不运行
pnpm run test:tier slow                             # 先构建，再跑全部成员的某一层
pnpm run test:triage --run <运行目录>                # 把那次运行里的失败逐条单独重跑并归类（测试或验收的运行都行）
pnpm run test                                       # 全量两层：turbo 先构建，再跑全部成员（同 pnpm run test:tier all）
pnpm run test:gate                                  # pnpm run check 的测试一步：按影响面计划跑被选中成员的快层，快层全部通过才跑慢层（基线按统一规则取；FULL=1 全部）；单独运行时由 turbo 先构建
OMNE_TEST_CACHE=0 pnpm run check                    # 成员测试不读结果缓存（照常写）；test:affected、test:tier 与 cli.ts 的 run、step、check 另认 --no-cache。缓存见「结果缓存」
pnpm run acceptance                                 # 构建有 acceptance 脚本的成员及其依赖，再跑它们的验收；--no-build 不构建
node --experimental-strip-types tools/test-runner/src/testing/cli.ts check [--admission] [--keep-going] [--list]  # pnpm run check 的正文：取基线、算计划、按步骤图跑全部检查；调用方（scripts/check.sh）先取运行名额。--list 只打印步骤表（名字、依赖、重轻、命令），不取基线、不算计划、不跑
```

**检查步骤图。**`check` 命令是 `pnpm run check` 的正文：步骤表在 `src/testing/check-steps.ts`，运行器在 `src/testing/check-graph.ts`。

- 每一步只声明先于它完成的步骤，没有依赖的同时跑。
- 重步骤（构建、类型检查、成员测试、验收）自己按预算起多进程，一次只跑一个；轻步骤（含 pytest，pytest 自己按预算的四分之一起 xdist 进程）同时至多 `max(2, 核数 ÷ 3)` 个。
- 一步失败：不再起新步骤，正在跑的整棵进程树终止，退出码取第一个失败的那一步。`--keep-going` 时其余照跑，依赖失败步骤的不启动。
- 产物：每步的输出落 `tmp/check-run/<步骤>.log`（名字里的 `:` 换成 `-`，例如 `check-docs.log`）；结束时写逐步耗时表 `tmp/check-run/steps.tsv`，并打印实际走过的关键路径。
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
   测试运行器与影响面引擎自身的 `cli.ts`／`config.ts`／`run.ts`／`steps.ts`／`support.ts`／`timing-reporter.ts`／`typecheck-scope.ts`／`member-turbo.ts`／`scope.ts`／`turbo.ts`，以及任何位置的 `turbo.json`）：整份计划判全量——
   引擎改了，这次的计划就是用改过的引擎算的，不能拿它来给自己划范围；
   引擎从 repo-toolchain 导入的 `core/workspace`、`core/git` 与根配置的预设来自钉住的 npm 包，改它们的版本就是改锁文件与 `pnpm-workspace.yaml`，同样判全量。
   `tools/dev-flow/src/integration/**` 不是全局路径，按 dev-flow 的成员文件算，改它跑 dev-flow 的测试：
   `scripts/check.sh` 用本包的 `baseline` 取基线，不执行这里的代码；`check:lines` 导入其中的 `parse.ts`、`policy.ts`，它是常驻检查，每次都跑；
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
自测：`tests/scope.spec.ts` 用真实规则与一份造出来的成员清单核对各类改动的判法（含上面几条收窄的正例与反例），另在临时仓库核对改名与非 ASCII 文件名，在本仓库核对 turbo 的依赖图与读者规则里的路径都存在。

**怎么跑。**`pnpm run test:affected` 先用 turbo 把目标成员连同它们的依赖构建一遍（测试执行的是依赖的 `dist/`；
`pnpm run check` 则由前面的构建一步按计划构建）。然后运行器调用一次 `turbo run <层的任务> --continue=dependencies-successful`。
调用方已经构建过时（`pnpm run check` 的测试一步、`run --all` 不带 `--build`）带 `--only`，只跑测试任务；
否则不带，turbo 按任务的 `dependsOn` 在同一次运行里先构建成员及其上游（准入模式下构建缓存只写不读）。
构建失败的成员不跑测试，记为失败并点名失败的构建。`--concurrency` 是同时跑的成员数，每个成员的 vitest 至多起 `VITEST_MAX_WORKERS` 个工作进程；两个数由下面的「并行度」推出来。
一个成员失败不拦其余的，结束时列全失败；退出码只反映测试是否全过。各成员的退出码与起止时间取自 turbo 的运行摘要（`--summarize`），
摘要里没有某个成员的执行记录时，这个成员记为失败。turbo 的输出按每行的 `<包名>:<任务>: ` 前缀拆成各成员的日志。
报告里出现嵌套归档目录中的测试文件时，这个成员也判失败：成员配置的排除没有生效。
turbo 的 Strict Mode 只把声明过的环境变量传给任务。三个测试任务的 `env` 列出影响结果的变量（临时目录、`OMNE_RUNNER_ROOT`），`passThroughEnv` 只列不影响结果的（vitest 并行度、报告目录）；turbo 的测试任务不缓存，两者在这里都只决定变量能不能传进去。成员级的结果缓存由运行器自己做，见下一段。

**结果缓存。**成员测试按成员、按层缓存**完整通过**的运行（`src/testing/test-cache.ts`）：退出码 0、写出了报告、报告里没有失败的文件或用例、运行器自己没判问题。失败、超时、被中断、没写出报告的从不进缓存；验收不缓存。条目在**主检出**的 `tmp/test-cache/<成员>/<层>-<键>.json`（`OMNE_TEST_CACHE_HOME` 可改根目录），记来源账本的目录、提交、时间、用例数与文件数。
键与影响面**同源**：一个成员的输入集就是「改了会让计划选中它」的那些文件，由 `scope.ts` 的 `classify` 按 `affected` 规则判，不另写一套——全局文件与没有规则认得的文件（改了计划判全量）进每个成员的键；读者规则点名它的文件、它自己的文件（成员根目录文档除外）、它上游成员的文件（按 turbo 的包依赖图传递，一次 `turbo query` 取整张图，与 `--affected` 走同一张图）进它的键；只需常驻检查的路径、Python 工具、退役目录与别的成员的文件不进。
每个文件取 git 的 blob id：已跟踪且干净的读索引，改过与未跟踪的用 `git hash-object` 现算（走同一套换行过滤，内容改回去 id 也回去）；工作树里删掉的不在，被忽略的从不在。键里另有层（turbo 任务名）、平台与架构、Node 版本，以及配置 `cache.env` 列出的环境变量（`NODE_OPTIONS`、`OMNE_RUNNER_ROOT`、`VITEST_*`；`cache.ignoreEnv` 排除 `VITEST_MAX_WORKERS`——并行度、预算、报告目录这类只影响怎么跑的不进键，否则机器一忙键就变、永远不命中）。锁文件、根清单、分层定义、运行器自身的源码与配置、成员的 vitest 配置与 `package.json` 都已由上面的规则进键，不另列。
命中的成员不执行：运行时打印 `缓存命中，<n> 条用例，来源 <账本目录>`；账本 `meta.cache` 记模式（读写、只写、不可用）、命中清单（成员、键、来源、用例数）、本次写入的成员、算不出键的成员与写不进去的原因；`meta.members` 是这次覆盖的全部成员（跑了的加命中的），成员一级与文件一级的读数只有跑了的。快层全部通过（含命中）才跑慢层的规则不变；失败归因照读账本里跑了的失败。
不读缓存（照常写）：`FULL=1`、`--full`、`--no-cache`（`run`、`step`、`check` 都认）、`OMNE_TEST_CACHE=0`，以及准入模式 `OMNE_ADMISSION=1`——准入不读待合并的改动能写入的缓存，与构建、类型检查的 turbo 缓存同一条规则。快照或依赖图取不到、条目坏了、写不进去，一律按未命中：既不让检查失败，也不让检查放行。
借鉴 ub-mode 的 mutator 与 crapper：结果仍有效就复用（差分快照、`--use-existing-coverage`），只重跑输入变了的。
命中意味着：同一台机器上，键完全相同（同样的输入文件内容、层、平台与架构、Node 版本、列出的环境变量）的一次完整通过曾经发生过。不意味着：这次再跑也会过——不稳定的用例、外部服务、时间与没列进键的环境变量都不在键里；也不证明那次运行的报告本身可靠。影响面规则漏掉的读取，缓存键同样漏掉：补读者规则，两边一起补上。自测：`tests/test-cache.spec.ts`（每类输入进谁的键、各类失效、只写完整通过、坏条目；慢层在临时仓库核对快照、在本仓库核对依赖图与每个成员都算得出键、真起 turbo 跑两遍看命中）。

**并行度。**并行度从机器推出来，不写死（`src/testing/parallelism.ts`）。`pnpm run check` 在起任何步骤之前、机器安静时采样一次，经环境变量 `OMNE_WORKER_BUDGET` 交给各重步骤（重步骤开始时跑着的轻步骤是本图自己的，那时再采只会把它们当成别的负载而缩预算：快层曾因此只拿到预算 8、跑 89 秒，改后 43 秒）；单独运行一步时该步自己采（成员测试的快层与慢层各采一次；先等 `parallel.sampleMs` 毫秒让同时起的兄弟进程过了启动尖峰再量）。采的是核数（`availableParallelism()`）、
`parallel.sampleMs` 毫秒内实测的 CPU 空闲率与空闲内存，得到**工作进程预算** = 核数 × 空闲率，再按空闲内存 ÷ `parallel.memoryPerWorkerMiB` 封顶，至少 1、至多核数。
空闲率让已经忙着的机器（同时跑着的别的检查步骤、后台程序）少被挤；运行名额挡的是整套检查，挡不住别的负载。
预算按 `test-runs.config.json` 的 `parallel` 策略分：同时成员数 = ceil(预算 ÷ `memberDivisor`)，每成员工作进程 = ceil(预算 ÷ `workerDivisor`)，两者不低于 `minimum`，后者不高于 `maxWorkersPerMember`。
构建与类型检查的 turbo 并发、Stryker 的工作进程数直接取预算（tsc 与 Stryker 的进程各占一个核）。
策略只含比例与上下限，不含任何一台机器的核数。初值 3、4、8、2 的依据（`docs/verification.md` 要求写明负载、平台与超限行为）：负载是全量 73 个成员，平台是一台 24 核 Windows 宿主（空闲 0.8，预算 19），2026-10-29 扫描：
快层的墙钟 ≈ 各成员 vitest 启动与收集之和 ÷ 同时成员数，到 6 至 8 个成员时碰到 CPU 平台期（91 秒降到 39 至 41 秒），再多只让起子进程的用例贴线；
慢层的下限是起子进程最多的成员（repo-toolchain，28 个慢文件）：它的文件互相挤，每成员 8 个进程比 5 个只快十几秒而文件耗时总和翻倍，所以每成员进程数的除数取 4。
同一策略在 8 核上推出 3 × 2，这只是预测，没有在 8 核上复测；之前 8 核上量到的固定配置 2 × 4 与 4 × 2 只差约 1 分钟。超限的表现是起子进程的用例贴近时限，账本的 `nearTimeout` 列出它们。
`memoryPerWorkerMiB` 是安全上限的估计，不是测量：空闲内存少于它乘预算时才起作用。
预算可用 `OMNE_WORKER_BUDGET`（正整数，超过核数按核数）钉死，不再采样；两个并行度可用环境变量 `OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS` 临时盖过——后者是 vitest 自己认的变量，
会盖过成员配置里的 `maxWorkers`。账本的 `meta` 记下并行度、核数与预算的来历（`budget`：进程数、空闲率、空闲内存，以及是自己采的还是环境变量给的）。

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

## 差分变异

`pnpm run mutation [--base <基线>] [--since <ref>]` 回答「这次改动碰到的代码，测试守不守得住」：把改动行上的代码逐处改坏（变异体），
看有没有测试因此失败。`src/mutation/` 是 [Stryker](https://stryker-mutator.io/) 10 与它的 vitest runner 上面薄薄的一层，
变异算子、插桩、调度与判定都是 Stryker 的，这里只做三件事：

- **范围**：先取计划，与准入检查、覆盖采集读同一份。`--plan <计划文件>` 读 `plan --json` 写出的计划（准入检查用 `tmp/check-plan/plan.json`），
  计划不是对当前提交算的就报错；不给时按基线现算一份，基线规则与 `test:affected` 相同。计划写进运行目录的 `plan.json`。算完计划后工作树又改了计划外的成员时报错，要求重算计划。
  然后取计划的合并点到工作树（含未提交、未跟踪）的改动，取新一侧的行号（与[结构度量](../repo-toolchain/README_ZH.md#结构度量)同一份 diff 解析），
  只留计划里要跑测试的 `packages/`、`apps/` 成员 `src/` 下的源码（不含 `*.d.ts`），按成员写成 Stryker 的 `mutate` 条目 `文件:起-止`；
  未跟踪的文件整份变异。`--members <成员目录,…>` 改为变异点名成员 `src/` 下的全部源码。`--plan-only` 只列范围。
- **运行**：先构建这些成员及其依赖，再为每个成员调用一次 Stryker：成员目录为工作目录、只跑**快层**（sandbox 里的 vitest 配置以 mode `fast` 展开成员配置）。
  各成员的 Stryker 合起来最多用整份工作进程预算（见「并行度」；每个进程里 vitest 只用一个线程），几个成员同时跑，见下文「成员并行」。
  sandbox 放在与成员**同深度**的 `.stryker-tmp-*` 目录（被 `.gitignore` 忽略）：不少测试用 `import.meta.dirname`
  拼相对路径读成员外的规格与根配置，换了深度就读不到。sandbox 里先把成员的 `node_modules` 软链进来再构建成员
  （`src/mutation/sandbox-build.ts`），跑完连容器目录一起删掉。不就地改源码。
  初跑跑本成员的全部快层，不按「直接导入了被变异文件」挑测试：不少测试按自己的包名导入，走的是 sandbox 里由插过桩的
  源码重新构建的 `dist`，vitest 认不出它们与 `src` 的关系；之后每个变异体按逐条覆盖只跑碰到它的测试。
  Stryker 给每个语句插桩记覆盖，CPU 重的用例会慢上几倍，平时守得住 5 秒的在初跑里就会超时；所以 sandbox 里另写一份
  vitest 配置，展开成员自己的那份，把没写自己时限的用例的时限放宽到 `mutation.testTimeoutSeconds`（初值 60 秒）。
  成员的配置不动；变异体本身的超时由 Stryker 另判。初跑仍超时，说明有用例插桩后超过这个时限：比如 content-blocks
  解码 4 MiB 的那条，点名整个成员时插桩了它碰到的全部文件，60 秒跑不完；只变异改动行时，只要改动不在它经过的文件里就不受影响。
  调大时限的代价是碰到它的每个变异体都要跑那么久，这类成员只用差分范围。
  这份配置还关掉快层的 `experimental.preParse`。Stryker 为每个变异体按用例名过滤测试，但它经 API 起 vitest，
  `testTiers` 从命令行读不到这个过滤，按不带过滤展开：快层开着 preParse 与 `passWithNoTests`，也不挂过滤守卫（见上文「分层」）。
  preParse 只认字面量的用例名，`it.each`、`describe.each` 等生成名字的用例所在文件会被整份滤掉；`passWithNoTests` 又让这次运行算作成功，
  变异体就被误记为存活（#405）。所以这份配置自己关掉 preParse。关掉后，层仍由 `tagsFilter` 在运行时区分：整文件归慢的测试会被导入，但用例全部跳过。
  **sandbox 预检**（#481）：`src/mutation/sandbox-build.ts` 构建完成员后，用这份配置在 sandbox 里跑一遍快层。
  有测试文件只在 sandbox 里加载失败时（比如相对路径越出成员，在副本里指到不存在的目录），Stryker 的 vitest runner
  仍判初跑成功：它只看用例结果与 vitest 的全局错误，不看文件级结果。只由这份文件守着的变异体就全被记为存活。
  vitest 自己的退出码计入文件级失败，所以预检没跑通时 Stryker 不开始变异，入口报「sandbox 预检没通过」并退出 1。
  预检按 Stryker 初跑的选项运行：`threads` 池、一个工作线程、不并发、不采覆盖。同一份文件可能在默认的 `forks` 池里
  能加载、在 worker_threads 里不能（比如顶层 `process.chdir`）。预检的时限是 Stryker 初跑的缺省时限 5 分钟，超时按没跑通算。
  vitest 起不来或被信号打断时，不算预检的结论，入口报 Stryker 出错。快层没有用例时，`passWithNoTests` 让预检通过；
  接着 Stryker 因没有用例拒绝运行，入口同样退出 1，报 Stryker 出错。预检让每个成员多跑一遍快层，耗时约与初跑相当。
- **读数**：读每个成员的 `mutation.json`，只计落在要变异的行上的变异体（跨到范围外的另记一个数），
  汇总被杀、超时、存活、无覆盖、编译错误、运行错误与分数（测出来的占测出来与没测出来之和），
  逐条列出存活与无覆盖的「文件:行 算子 原文 → 替换」。同一行上的几条按 Stryker 生成变异体的先后（报告里的 id）列。
  原始报告按变异体跑完的先后排，这个先后随工作进程的调度变。按 id 列，同样的输入就给出同样的读数。不能计分的变异体按原因单列，不计入各状态：
  报成存活、有用例覆盖、却一条用例都没跑完的记「没跑测试」，这是运行器没跑测试，不是测试没测出来；
  只因时限到了而超时、又没有得到单独复核的判定的记「超时未复核」，规则见下文「超时的计分」。
  有不能计分的变异体，或原始报告有 RuntimeError 时，成员的测量无效：成员照样写进读数（`valid` 为 false），不给分数。
  **未覆盖的改动段**：要变异的一段改动行上，没有一个可计分状态（被杀、超时、存活、无覆盖）的变异体时，这一段记为未覆盖。
  常见原因是 Stryker 不为类型位置生成变异体，`x as T`（含 `as const`）里的字面量也在内；只有编译错误、忽略等不计分状态的变异体碰到的段同样算。
  分数量不到这些段：它们既不算测出来，也不算没测出来。粒度是改动段（diff 的 hunk），不是逐行。
  成员读数的 `unmutated` 逐段给出 `{ file, start, end }`（`file` 是仓库相对路径；整份变异的文件 `end` 为 null）。
  `summary.json` 里的 `score` 仍是只按可计分变异体算的数，读它时要同时看 `unmutated`。
  `summary.md` 的标题行按下面的写法给分数，详细列表逐段写「没有变异体 文件:起-止」（整份变异的文件只写路径），入口的进度行写「没有变异体的改动 N 段」：

  | 情形                             | 分数的写法                                                                       |
  | -------------------------------- | -------------------------------------------------------------------------------- |
  | 没有未覆盖的段                   | `N%`；没有可计分的变异体时写 `—`                                                 |
  | 有未覆盖的段、有可计分的变异体   | `N%（只算有变异体的改动段；未覆盖 M 段：改动上没有变异体）`                      |
  | 有未覆盖的段、没有可计分的变异体 | `—（未覆盖 M 段：改动上没有变异体）`                                             |
  | 测量无效                         | `—（测量无效）`；有未覆盖的段时写 `—（测量无效；未覆盖 M 段：改动上没有变异体）` |

  原件、`summary.md`、`summary.json`、各成员日志、每次运行的类型测试记录（`<成员>.runs.jsonl`）与预检没通过的成员的 `<成员>.preflight-failed` 标记写进
  主检出的 `tmp/mutation-ledger/<提交短号>[-dirty]/<时间>/`（环境变量 `OMNE_MUTATION_LEDGER_HOME` 可改）。

**只变异最近一轮改动（`--since <ref>`）**。评审修复之后要量热点时，给 `--since <上一轮评审的头>`。这就是「只打热点」的做法：

```sh
pnpm run mutation --since <上一轮评审的头> --plan-only   # 先只列范围，核对后再正式运行
pnpm run mutation --since <上一轮评审的头>
```

- 计划仍按基线算（`--base`、`--plan`，或绑定的树里 task context 的 `targetBase`）。`--since` 不改变基线，只收窄范围。所以绑定了 task context 的树里也能用，不必另建未绑定的树。
- 范围取两份改动行的交：`<ref>` 到工作树（含未提交、未跟踪）的改动行，与合并点到工作树的改动行。两份 diff 的新一侧是同一份工作树，行号可比。
  取交保证范围只会收窄：`<ref>` 之前改过、之后又改回基线原样的行，不进范围。
- `<ref>` 必须是 HEAD 的祖先，并且不早于基线与 HEAD 的合并点。合并进来的旁支上的提交也不行。不满足时入口以 2 退出，并写明原因。
  `<ref>` 等于合并点时，范围与不给 `--since` 相同。`<ref>` 等于 HEAD 时，只剩未提交的改动。
- 不能与 `--members` 同给，同给时以 2 退出：点名成员变异它的全部源码，没有基线以来的范围可以收窄。
- 范围说明写「基线 … 以来、并且自 `<ref 短号>`（--since `<ref>`）以来」。`summary.json` 加一节 `since`，写 `ref` 与解析出的 `commit`。
- `--since` 与增量互不影响：`--since` 定范围，增量照常复用范围里上次被杀的变异体。快照只留这次范围里被杀的变异体，
  所以一次 `--since` 运行之后，下一次不带 `--since` 的运行复用得少一些。

**成员并行**。每个成员的 Stryker 有一段固定开销：构建、预检与初跑都只用一个进程，小成员约 5～10 秒。成员挨个跑时，这些开销一段接一段。
所以入口让几个成员同时跑，各成员的 Stryker 工作进程数合起来不超过预算（`VITEST_MAX_WORKERS` 已设时以它为准）。规则如下：

1. 每个成员都有增量快照时，入口按快照里上次第一遍的「耗时 × 工作进程数」估工作量，每个成员最多分到上次的变异体数。
2. 有一个成员没有快照时，入口平分。要变异的行数估不出测试有多慢：一行改动可能要跑很慢的测试。
   这时每个成员的上限按「行数 × 4」估（一行改动实测生成 3～11 个变异体），用不完的进程分给别的成员。
3. 工作量大的成员先开始（工作量相同时行数多的先开始）。空闲的工作进程按工作量成比例分给这一批开始的成员，每个至少 1 个。
4. Stryker 开始后不能改工作进程数。一个成员跑完，它的进程分给还没开始的成员。成员都已开始时，跑完的成员的进程就空着。
5. 读数、出错信息与 `summary.json` 按成员在范围里的顺序写，与跑完的先后无关。进度行按跑完的先后打印，行首的 `[序号/总数]` 是成员在范围里的序号。

并行不改变判定：被杀、存活、无覆盖的集合、各状态的数与分数都与逐个跑相同。有一个读数会随每个成员的工作进程数变：
`typeTests` 里 static 运行没跑类型测试的次数（`withoutTypeTests`，见下文「类型测试缺席」）。static 变异体落在跑过别的运行的工作进程里，
就没有类型测试。每个成员的进程少了，这样的运行就多。2026-10-30 在 `--base 4774fe755` 的四个成员上，逐个跑（每个成员 16 个进程）记 1 次，
并行（每个成员 4 个进程）记 6 次。预算不同时，逐个跑也会这样变。

只有一个成员时，它用整份预算，与并行之前相同。环境变量 `OMNE_MUTATION_PARALLEL=0` 让成员逐个跑，每个成员用整份预算。
`src/mutation/schedule.ts` 拥有这套分法。成员之间不共用 sandbox、报告与日志：sandbox 容器名含成员的 slug，运行目录里的文件名都以成员的 slug 开头。

**进度行**。Stryker 的 `progress-append-only` 报告器在变异阶段每 10 秒写一行进度，形如
`Mutation testing 45% (elapsed: <1m, remaining: ~1m) 10/22 tested (3 survived, 0 timed out)`：已测的与全部变异体数、存活与超时的数。
入口把这一行从成员日志转到命令的标准输出，行首加成员路径。复核那一遍的进度行在成员路径后标「（复核）」。成员并行时，靠成员路径分清是谁的进度。
Stryker 的其余输出只进成员日志。变异阶段不到 10 秒的成员没有进度行。
（以前子进程的输出整个重定向到成员日志文件，所以运行日志在「构建 … 秒」之后没有任何输出。）

**进程数告警**。工作进程预算在启动时取样一次（见「并行度」）。机器在取样时忙，预算就小，整次运行都按这个数跑。
所以没有设 `VITEST_MAX_WORKERS`、预算又不到本机核数的一半时，入口在「Stryker 同时 N 个工作进程」一行之后打一行告警。告警写明：

- 预算的来历：取样时的空闲比例与空闲内存，或「由环境变量 `OMNE_WORKER_BUDGET` 给定，没有取样」。预算受空闲内存所限时也写明。
- 重启命令 `VITEST_MAX_WORKERS=<核数的一半，向上取整> pnpm run mutation <这次的参数>`。

机器其实空闲时，停掉这次运行，用这条命令重启。告警不改变预算，也不影响退出码。

**增量**（借鉴 [unclebob/ub-mode](https://github.com/unclebob/ub-mode) 所列 mutator 的差分快照：上次被杀、代码没变的变异体不再跑，只重跑存活的与改过的）。
入口缺省开 Stryker 的 `incremental` 模式，每个成员一份快照，放在主检出的 `tmp/mutation-incremental/<分支>/<成员 slug>.json`。
分支名按百分号编码成一层目录名。环境变量 `OMNE_MUTATION_INCREMENTAL_HOME` 可改快照的根目录。

- **复用什么**：快照只留上次第一遍里被杀的、落在当时变异范围里的变异体。存活、无覆盖、超时、运行错误与不能计分的变异体不进快照，每次都重跑。
  所以复用的只是上次被杀的结果，存活与无覆盖的结果每次都重新量。复核（见下文「超时的计分」）不开增量。
- **谁判定能不能复用**：Stryker 10.0.0 的 `IncrementalDiffer`。它用 diff-match-patch 比较快照里的源码与现在的源码。
  变异体所在的那段代码变了，就重跑。这段代码没变时，还要核对上次杀死它的测试：这个测试的名字、所在文件与位置都与上次相同，才复用。
  vitest runner 不报告用例在文件里的位置，Stryker 就把每个用例当作占满整个测试文件。所以测试文件里任何一处改动，都让被它里面的用例杀死的变异体重跑。
- **与 mutator 的不同**：mutator 以函数为单位，函数文本没变就不重跑。Stryker 以变异体为单位，只看变异体自己那段代码，
  另外核对杀死它的测试。所以同一个函数里，只有改过的那几处重跑。两者都不看被变异代码调用的其他代码：一个函数调用的别处代码改了，
  这个函数里上次被杀的变异体照样复用。依赖变了要量准时，用 `--force`。
- **范围变了**：Stryker 把快照里不在这次变异范围里的旧变异体原样放进报告。入口在汇总前把报告里不在这次范围里的变异体去掉。
  Stryker 只为整个落在范围里的节点生成变异体，所以留下的正好是这次生成的。原始的 `<成员>.mutation.json` 里仍有那些旧变异体。
- **类型测试的记录**：快照另存 static 变异体的运行记录。复用的 static 变异体这次没有运行记录，入口按位置、算子与替换找回上次的记录。
  变异体的位置挪动过时找不到，`typeTests` 的 static 运行次数就少算这一次。
- **快照与版本**：快照带一个指纹，含快照格式、`@stryker-mutator/core`、`@stryker-mutator/vitest-runner` 与 vitest 的版本、`mutation.testTimeoutSeconds`。指纹对不上时不用这份快照。
- **什么时候写快照**：只在成员测量有效、没有出错时写，先写临时文件再改名。测量无效或出错时，留着上一份快照。
- **读写失败**：快照没有、读不出、形状不对、指纹对不上，都按没有快照处理，整份重跑。写不进去时也只少一次复用。
  这些情形只在输出里写一行原因，不让入口失败，也不改变读数。
- **关闭**：`--no-incremental` 或环境变量 `OMNE_MUTATION_INCREMENTAL=0` 时，入口不读也不写快照。这时 Stryker 的配置、输出与 `summary.*` 与没有增量时相同。
  `--force` 时全部重跑，不复用，跑完照样更新快照。两个参数只能给一个。
- **在哪里看到**：输出开头写快照的目录，以及快照没用上的原因。进度行写「复用 N」。`summary.md` 写一行「增量：复用上次被杀的变异体（不重跑）——成员 N、…」。
  `summary.json` 加一节 `incremental`：`dir`、`force`，以及每个成员的 `reused`（Stryker 日志里没有这个数时为 null）与 `notes`。
  成员读数（`members`）不加字段。复用的变异体照常计入被杀与分数。

2026-10-30 在 Windows 宿主上点名 `packages/util/unix-format`（210 个变异体）：第二次运行复用 192 个，墙钟从 15 秒降到 8 秒。剩下的时间是固定开销：构建、预检与初跑每次都要跑。
只有几个变异体的小成员，复用几乎不省时间。

**只报告**（负责人 2026-10-02 定）：变异体存活不影响退出码，不进 `pnpm run check`；Stryker 起不来、sandbox 预检没通过、
初跑失败、没写出报告、有 RuntimeError、有「没跑测试」或「超时未复核」的变异体、复核的 Stryker 出错时退出 1；参数错退出 2。

变异期间的 reporter 检查文件收集错误与深层 suite 自身错误，不读取普通断言错误。发现错误时抛出包含原文件、suite 与错误栈的诊断。
`omne-vitest` 委托公开的 Vitest runner factory，保留 init、dryRun 与 dispose。底层 mutantRun 拒绝时，包装器直接返回 Error，避免恢复重试掩盖这次失败。

**超时的计分**（#649，负责人 2026-10-22 授权改变计分规则）。Stryker 给每个变异体的运行一个时限：
`timeoutFactor × 净耗时 + timeoutMS + 初跑的额外开销`，缺省 `timeoutFactor` 为 1.5、`timeoutMS` 为 5000 毫秒。
static 变异体要跑全部测试，净耗时取初跑全部用例的耗时。初跑只有一个工作进程。变异时几个工作进程同时冷启动，
各进程的第一次运行比初跑慢，机器负载高时还会更慢，这时真实存活也会超时。
真的挂起的变异体同样只能这样超时：static 变异体在模块加载时就求值，Stryker 的命中计数在 `beforeAll` 里才清零，
模块加载时的求值不计数，所以 static 变异体造成的死循环判不出命中次数超限。只凭一次超时分不出这两种情形。

入口因此对只因时限到了而超时的变异体单独复核一遍。复核只变异这几处（mutate 条目精确到行列），只用一个工作进程，
`timeoutMS` 取 `mutation.testTimeoutSeconds`（初值 60 秒，即每条用例在 sandbox 里的时限），加在 Stryker 自己的估算上。
复核的判定取代第一遍的超时，按位置、算子与替换对回原来的变异体。复核又超时，就按变异造成的挂起算测出来。

| 情形                                                                                          | 旧规则           | 新规则                                                             |
| --------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| 超时，原因以 `Hit limit reached` 开头（命中次数超限）                                         | 算测出来         | 不变：变异让被变异的代码比初跑多执行上百倍，是变异造成的           |
| 超时，没有原因（时限到了），static 或非 static                                                | 算测出来，退出 0 | 单独复核：复核判存活就记存活，判被杀就记被杀，复核又超时才算测出来 |
| 复核没跑成（复核的 Stryker 出错、对不上原来的变异体）、超出复核上限，或第一遍已无效而没有复核 | 不适用           | 记「超时未复核」，不计分，成员测量无效，退出 1                     |

区分两种超时依据原始报告的 `statusReason`。命中次数超限时，`@stryker-mutator/api` 10.0.0 的
`determineHitLimitReached` 给出以 `Hit limit reached` 开头的原因；快层测试把这个前缀与钉住版本的函数对上。
时限到了时，`@stryker-mutator/core` 10.0.0 的 `TimeoutDecorator` 只报 Timeout，没有原因。
第一遍已有 RuntimeError 或「没跑测试」时，成员已经无效，不再花时间复核。
复核的代价是每个有这类超时的成员多跑一遍 Stryker（构建、预检、初跑，再加这几处的运行）。真的挂起的变异体要等满复核的时限：
夹具上一个挂起的 static 变异体，入口总耗时从 13 秒变为 83 秒。

复核复跑的不只是超时的那几个变异体。Stryker 变异位置落在 mutate 范围内的全部变异体，所以外层变异体
（数组、对象字面量、语句块等）的精确范围会带上嵌套在它里面的全部变异体，包括第一遍没有超时的；它们的复核结果不用。
复跑的每个变异体，最坏的情形是真的挂起：要等满 `timeoutFactor × 净耗时 + 初跑额外开销 + 60 秒`。
static 变异体的净耗时是全部快层用例的耗时，model-contract 上约 94 秒一个。复核期间入口一直占着运行名额。

所以复核有上限：每个成员最多复跑 `mutation.recheckMaxMutants` 个变异体（`test-runs.config.json`，初值 8），
环境变量 `OMNE_MUTATION_RECHECK_MAX` 可改，0 表示不复核。上限按复跑数计，含嵌套的变异体。
入口按报告顺序挑复核的目标：加上它不超过上限就复核，超过就跳过，已被前面目标的范围盖住的不另计。
跳过的目标记「超时未复核」，成员测量无效，退出 1。出错信息写明上限、全部复核要复跑多少个，以及怎么调。
初值 8 时，model-contract 上最坏约 8 × 94 秒，再加复核一遍的固定开销（构建、预检、初跑），约 14 分钟。
成员读数的 `recheck` 给出上限、要复核的目标数、跳过数、实际复跑数与全部复核的复跑数。

复核排除了同一次运行里别的工作进程造成的争用，但排除不了机器上别的负载。复核时，运行比 Stryker 的估算还多出 60 秒以上，
就按挂起算测出来。可控耗时注入的夹具上，只在变异体激活时等待 90 秒的测试，第一遍与复核都超时，记作测出来。

**类型测试缺席**（#649）。上游 vitest runner 10.0.0 声明能在进程内重载环境，实际在同一个工作进程里复用一个 Vitest 实例。
Vitest 4.1.11 的类型测试池只在一个实例第一次运行时报告类型测试，之后的运行直接返回第一次的结果，不报告类型测试。
所以初跑之后同一进程里的 static 运行少了全部类型测试，原生 runner 也一样。model-contract 上的表现是 testsCompleted 为 1009，初跑为 1128，少了 119 项。
类型测试不随变异体改变结果：tsc 读的是含全部变异体的同一份插桩源码，变异体只在运行时激活。所以缺席不改变判定。
本工具不让它们重新出现：让 Stryker 在每个 static 变异体之前重启工作进程，能补回类型测试，
但每个 static 运行都要从冷启动开始（含完整的类型检查），却仍只有初跑估出的时限，并发时更容易超时。
读数改为写明缺席：sandbox 里的 `RunReporter` 在每次运行结束时，从 Vitest 的 `state`（与上游 runner 计 testsCompleted 读的同一份状态）
数出类型测试，写进 `<成员>.runs.jsonl`。`state` 在 Vitest 4.1.11 里标为实验性 API，升级 Vitest 时要复核。
这一项只报告，不能让测量失败：`RunReporter` 出了任何错（比如 `state` 变了），只写一条带 `error` 的记录；写不出记录就不写。
成员读数的 `typeTests` 分三种：

- `status` 为 `measured`：给出初跑的类型测试数、有记录的 static 运行次数，与其中类型测试比初跑少的次数。
  `summary.md` 有 static 运行时写一行，没有缺席时写「都跑了类型测试」。
- `status` 为 `notMeasured`：没测到，有没有缺席不明，`reason` 写原因。`summary.md` 写一行「没测到」。原因有：
  运行记录读不出、记录类型测试时出错、没有初跑的记录，以及类型检查开着、初跑却没数到类型测试
  （成员可能没有类型测试文件，也可能 Vitest 改了类型测试池的名字）。
- `null`：类型检查没开，不适用。

第一遍超时、被复核的运行没有记录，不计入这几个数。

原始 JSON（第一遍与复核）中任何 RuntimeError 都使整个成员测量无效，包括目标行外的错误；该成员照样写进 `summary.members`，`valid` 为 false，不给分数。这是保守政策，RuntimeError 不必然表示设施缺陷，也不能改算成 Killed。
诊断保留在原始 JSON 的 statusReason 与成员日志中。上游没生成报告时如实失败。正常 Killed、Survived 与 Timeout 的算法不变，CompileError 单独存在不触发此政策。
复用 `--out` 时，旧原始报告移入独占的 `<成员>.history-*` 目录。本轮必须生成新报告。报告留存失败，或 `summary.json`、`summary.md` 写入失败时，CLI 必须非零退出。旧分数不重算，使用原命令与基线复跑取得新读数。

本内部 CLI 按五档说明本次行为的支持范围：

| 档                     | 本工具的状态与验证入口                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公开类型已导出         | 不适用。本次行为由内部 CLI 提供，不发布产品包类型。                                                                                                                                                                               |
| 纯契约函数已实现       | 不适用。本次没有新增产品契约函数。                                                                                                                                                                                                |
| 独立执行已实现         | mutation CLI 对容器自身错误与原始 RuntimeError 使整成员无效并非零退出；只因时限到了的超时在上限内单独复核，「超时未复核」不计分并非零退出；报告留存或 summary 写入失败同样非零。复跑入口及验证范围见[测试说明](tests/README.md)。 |
| runtime 已实现的路径   | 不适用。本工具是研发 CLI，没有 Tool runtime 路径。                                                                                                                                                                                |
| 尚未交付的宿主与提供者 | 没有新增产品宿主或提供者。包装器外的 child crash、OOM 与代理断连不在本次拒绝转换保证内。                                                                                                                                          |

读数的边界：

- 存活少不等于测试好：只量了改动行，没改的代码不在内；变异算子之外的错误写法量不到。
- 判定会抖（Stryker 的 perTest 判定已知会抖，上游 #6073）：一个存活要复跑确认，再决定补不补测试。
- `static` 标记的变异体在模块加载时就求值，Stryker 只能为它跑全部测试，成本高。
- 慢层的测试不参与：只被慢层测试守着的代码会显示为无覆盖或存活。
- 只跑本成员自己的测试：靠别的成员的测试守着的代码（比如一个契约只由它的提供者的
  一致性套件守着）会显示为无覆盖，那是变异的盲区，不是这份代码没人测。
- 包装器只捕获 child 内底层 mutantRun 的拒绝。包装器外的 child crash、OOM、代理断连仍可能被 Stryker 重试，不在本次保证内。
- 预检读的是插过桩的源码与构建后的 dist。逐个变异体才触发的文件收集错误或 suite 自身错误由 reporter 检查，普通断言失败仍按 Killed 处理。
- 变异让某个测试文件注册 0 项用例、而这份文件本身没有出错时（比如 `for (const name of names())` 中的 `names()` 返回空数组），
  这份文件通过，变异体记为存活。Vitest 自己对这次运行的结论也是通过，这不是收集错误，是测试没守住这处代码。
  `CollectionReporter` 只把文件或 suite 自身的错误判为测量无效，不改判这种情形。
- 复核又超时算测出来（见上文「超时的计分」）。机器上别的负载使复核也慢出 60 秒以上时，这个判定不是变异造成的。
- static 变异体的运行可能没有类型测试（见上文「类型测试缺席」）。读数写明次数，判定不受影响。

自测：`tests/mutation*.spec.ts`。`--since` 的取值核对与改动行的交见 `tests/mutation-since.spec.ts`，入口对它的接线见 `tests/mutation-cli.spec.ts`。进度行的转发与进程数告警见 `tests/mutation-progress.spec.ts`。成员并行的分法与调度见 `tests/mutation-schedule.spec.ts`，增量的快照、范围与开关见 `tests/mutation-incremental.spec.ts`，
夹具上的复用、改一处只重跑那里、范围缩小、关掉增量、`--force` 与两个成员并行见 `tests/mutation-stryker-incremental.spec.ts`。在夹具项目上真起 Stryker 的用例归慢层，按场景分在 `tests/mutation-stryker-*.spec.ts`：没断言的测试留下存活变异体，
在只按包名导入自己的测试文件里补上断言后被杀；只变异改动行；跑完不留 sandbox；有测试文件只在 sandbox 里加载失败时，
预检报错、不出读数，类型断言照常通过也一样；只在 `threads` 池里加载失败的文件同样被拦下；
`--out` 目录里留着上一次的预检标记时，这一次照常出读数；快层没有用例时预检通过、由 Stryker 报错；
一个工作进程时 static 变异体的运行没有类型测试，读数写明缺席；可控的耗时注入使 static 运行超过时限时，
复核把它判回存活，入口退出 0，非 static 变异体照常计分；复核上限为 0 时同一超时记「超时未复核」，入口退出 1；
static 变异体使测试里的循环停不下来时，复核仍超时，算测出来；只改 `as const` 声明时 Stryker 不生成变异体，读数报未覆盖。

公开委托、第一次拒绝、生命周期失败、RuntimeError 使成员无效、命中次数超限原因与钉住版本一致、`RunReporter` 出错不让运行失败的快层验证见 `tests/mutation-guard.spec.ts`。复核上限的配置与环境变量见 `tests/test-runs.spec.ts`。
超时复核的分类、上限与配置、类型测试读数（含没测到）、未覆盖的改动段与分数的写法见 `tests/mutation.spec.ts`。静态部分收集错误、复核、真的挂起、多 worker 与同 out 重跑的真实 CLI 回归见 `tests/mutation-stryker-*.spec.ts`。
