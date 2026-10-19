# test-runner

[English](README.md)

测试运行器：按影响面计划成员的构建、类型检查、测试与验收，运行它们并写耗时账本，另提供差分变异测试。规则在 [`test-runs.config.json`](test-runs.config.json)。本成员不发布，turbo 完全接替以后删除。账本的读取格式由 repo-toolchain 的 `core/test-ledger` 定义，clean loop 与体检页按它读取。

## 测试运行

`src/testing/` 是本包的第三入口：算一次改动的影响面（`pnpm run check` 的执行计划）、决定跑哪些成员的测试、以多大的并行度跑、把时间花在哪记成账本、
失败之后单独重跑归类。它替代了根脚本里原先的 `pnpm -r run test`。同一个运行器也跑成员的可执行验收（`--script acceptance`）。

```sh
pnpm run check:plan [--base <基线>]                 # 只算影响面并打印计划：判成什么、每一步跑还是跳、选中谁与为什么；FULL=1 全量
pnpm run test:affected --base <基线提交或分支>       # 只构建并测试受这次改动影响的成员的快层；不给 --base 时取任务上下文的基线，再缺省 main；--tier slow|all 换层
pnpm run test:affected --base <基线> --plan-only     # 只列受影响范围与层，不构建也不运行
pnpm run test:tier slow                             # 先构建，再跑全部成员的某一层
pnpm run test:triage --run <运行目录>                # 把那次运行里的失败逐条单独重跑并归类（测试或验收的运行都行）
pnpm run test                                       # 全量两层：turbo 先构建，再跑全部成员（同 pnpm run test:tier all）
pnpm run test:gate                                  # pnpm run check 的测试一步：按影响面计划跑被选中成员的快层再慢层（基线 BASELINE，缺省 main；FULL=1 全部）；单独运行时由 turbo 先构建
pnpm run acceptance                                 # 构建有 acceptance 脚本的成员及其依赖，再跑它们的验收；--no-build 不构建
```

**分层。**测试分快慢两层，定义只在仓库根 [`vitest.tiers.mts`](../../vitest.tiers.mts) 写一处：一个 `slow` 标签（带慢层时限 120 秒），
以及把 vitest 的 mode（`fast`／`slow`，不给为两层）翻成 `tagsFilter`、`passWithNoTests` 与 `experimental.preParse`。
每个成员的 vitest 配置写成 `defineConfig(({ mode }) => …)`，在 `test` 里先展开 `testTiers(mode)`，在 `typecheck` 里先展开它的 `typecheck`。
展开的部分还排除嵌套归档目录（`**/*.legacy/**`），并在设了 `OMNE_TEST_REPORT_DIR` 时挂上 JSON 报告与计时报告。这个变量在测试进程里置空，测试起的夹具 vitest 不往运行目录写报告。
成员有三个测试脚本：`test:fast` 是 `vitest run --mode fast`，`test:slow` 是 `vitest run --mode slow --typecheck.enabled=false`（`*.spec-d.ts` 都归快层），`test` 是 `vitest run`。
脚本不先构建，构建由 turbo 的 `dependsOn` 或运行器的构建一步负责。一个测试归慢层：整个文件在开头注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
并写一句为什么慢。时限的先后：用例自己写的（选项里的 `timeout` 或 `test(名字, 函数, 毫秒)`）＞ 慢层标签的 ＞ 成员配置的 `testTimeout` ＞ vitest 默认 5 秒。
运行器的 `--tier fast|slow|all` 选 turbo 任务 `test:fast`、`test:slow` 或 `test`。层只经脚本里的 mode 传递，外面环境里的变量改不了层。
`--base` 缺省 `fast`，`--all` 缺省 `all`，验收不分层、不接受 `--tier`。层记在账本的 `meta.tier`，
慢层与快层运行的目录名带 `-slow`／`-fast` 后缀。被滤掉的用例在报告里是跳过，账本把它们计进「没跑」，不计进「用例」。
整个文件都被滤掉时 vitest 不导入它；用例名或标签不是字面量时静态解析看不出，照常导入、导入后再过滤。
自测：`tests/test-tiers.spec.ts` 真起 vitest 核对三种层各跑了什么、整文件归慢的在快层下不被导入、没有慢测试的项目在慢层下退出 0、标签写错会报错，
并核对交给 turbo 的命令与 `turbo.json` 里三个测试任务的 `env`、`passThroughEnv`。

**验收**（`run --all --script acceptance`）：选的是 `package.json` 里有 `acceptance` 脚本的成员（同样排除 `affected.excludeRoots` 和 `.legacy` 目录），
逐个跑 `pnpm run acceptance`，并行度、vitest 的 JSON 报告、账本格式都与测试相同。计时报告器的输出路径只能写在配置里，所以验收的账本没有导入耗时，贴线按 vitest 默认时限判；账本根另放在主检出的 `tmp/acceptance-ledger/`
（`OMNE_ACCEPTANCE_LEDGER_HOME` 可改），不混进体检页读的测试账本。每份 `ledger.json` 的 `meta.script` 写着跑的是哪一种，
`triage` 照它经同一个脚本重跑（`pnpm run <脚本> <文件> -t …`，验收的那份带着自己的 vitest 配置）。验收的 `--all` 缺省先构建，`--no-build` 跳过。
测试的 `--all` 缺省不构建（由调用方先构建），给 `--build` 才构建；`--base` 缺省构建，`--no-build` 跳过。`pnpm run check` 不调 `pnpm run acceptance`，而是按计划跑 `step acceptance`：
只跑被选中、带验收的成员（驱动前面构建好的 `dist/`，不再构建），任何一份不过整套检查就失败；一个都没有时记一份「跳过」的账本（见[验收耗时](../repo-toolchain/README_ZH.md#验收耗时)）。

**影响面怎么算**（`src/testing/scope.ts` 归类改动文件，`src/testing/turbo.ts` 调 turbo 选成员；规则在 `test-runs.config.json` 的 `affected`）。改动文件取基线合并点到当前工作树的全部差异，
含未提交与未跟踪的文件，改名拆成删与增两侧，文件名原样（不受 git 的引号转义影响）。完整成员清单读 `pnpm-workspace.yaml`，用于解析声明依赖。直接检查、测试及验收目标排除 `affected.excludeRoots` 下的成员和任意层级中以 `.legacy` 结尾的目录。`FULL=1`、未知路径回退和 `run --all` 均应用这一排除。必要的封存构建依赖可准备，但不运行其类型检查、测试和验收。`.legacy-not` 不属于排除后缀。
以 `.legacy` 结尾目录中的改动先记为排除，不触发未知路径全量回退。其余改动文件按顺序归到第一类命中的：

1. **全局**（`globalPaths`：根清单、锁文件、共享 tsconfig、分层定义 `vitest.tiers.mts`、`scripts/check.sh`、本配置文件、
   测试运行器与影响面引擎自身的 `cli.ts`／`config.ts`／`run.ts`／`steps.ts`／`support.ts`／`timing-reporter.ts`／`typecheck-scope.ts`／`member-turbo.ts`／`scope.ts`／`turbo.ts`，以及任何位置的 `turbo.json`）：整份计划判全量——
   引擎改了，这次的计划就是用改过的引擎算的，不能拿它来给自己划范围；
   引擎从 repo-toolchain 导入的 `core/workspace`、`core/git` 与根配置的预设来自钉住的 npm 包，改它们的版本就是改锁文件与 `pnpm-workspace.yaml`，同样判全量；
2. **读者**（`readers`：`{ paths, members, why }`）：这些路径被这些成员的测试读——改了只把这些成员带进来，**不沿反向依赖传播**；
   每条记录实际读者和依据；`packages`、`apps`、`examples` 下的 TS → product-checks；成员清单 → test-runner；
   工程协议及当前产品设计输入 → dev-flow 与 product-checks；
   `docs/clean-loop.md`、整洁之道对照表、`scripts/with-test-slot.sh` → repo-toolchain 与 test-runner；
3. **成员文件**：按最长的成员目录前缀归属。哪些成员进来由 turbo 的 `--affected` 给出：改了文件的成员，与按 `package.json` 声明的依赖
   直接、间接依赖它的成员（含 `devDependencies`，因为测试可能导入生产代码不导入的包）。turbo 按包计改动：
   成员根目录与 `apps/*/deploy/` 下的 `.md`（`memberDocuments`）在这里归「只需常驻检查」，但 turbo 仍选中那个成员，计划里标「只改了文档」；
   这比原先「成员文档不算改动」多跑，不少跑。`tests/` 等其余目录里的 `.md` 可能是夹具
   （本包 `loop-canary.spec.ts` 就改写夹具里的 README 再断言），照成员改动算；
4. **Python 工具**（`pythonPaths`）：跑 pytest；
5. **只需常驻检查**（`residentPaths`）：文档、设计区、research、`examples/`、`.github/`、格式配置、`tools/model-probe/` 等；
6. 其余（没有规则认得的，如 `.gitignore`）：整份计划判全量，理由点名前几个文件与总数。

读者、成员文件与 Python 工具三种归属可以同时成立（另一个成员的 `schema/` 既是那个成员的文件又被别的成员的测试读），三者都算。
被选中的成员定下之后：测试、类型检查、验收各取其中有对应脚本的；构建取其中有 `build` 脚本的，
另加 `residentBuild` 列的成员（`lint:rules` 导入它的 `dist`），纯文档改动也构建它；它们的上游由 `turbo run build` 按依赖先构建。
类型检查由 `turbo run typecheck` 对被选中的成员运行它们自己的 `typecheck` 脚本：不先构建，不缓存（根 `turbo.json` 设 `cache: false`），同时 4 个成员。
嵌套归档目录（名字以 `.legacy` 结尾）的排除写在成员的 `tsconfig.test.json`（模板给 `"exclude": ["**/*.legacy/**"]`）。
运行前 `src/testing/typecheck-scope.ts` 只解析配置、不跑 tsc，核对编译根里没有归档文件：成员自己的 `exclude` 盖掉了模板那条，
或者 `include` 指到成员目录外的归档目录，或者 `typecheck` 不是 `tsc -p <配置>` 形式而成员里有归档目录，就点名报错，不运行类型检查。
`FULL=1` 或 `--full` 直接给全量计划。算不出计划——基线不存在、取不到改动、规则点名的成员不存在、turbo 出错、成员目录下有不合规则的 `turbo.json`——就报错退出，不改判全量。
成员目录下的 `turbo.json`（`src/testing/member-turbo.ts`）：`apps/*` 之外的一律拒绝；`apps/*` 的由 `turbo run <根任务…> --dry=json` 取合成后的定义，
按 #390 的 D6 七条暂行规则核对——`extends` 只能是 `["//"]`，只覆盖根已定义的任务，`dependsOn` 与 `env` 只增不减，
测试任务不缓存，`outputs`、`inputs` 不指到成员目录外，不设 `persistent`。`passThroughEnv` 只放不影响结果的变量，这一条机器判不了，留给评审。
计划与不经计划的测试运行（`run --all`）都做这项核对。
turbo 的运行条件（根配置取运行检查器仓库的 `turbo.json`、基线显式传入、`OMNE_ADMISSION=1` 时只写不读缓存、关闭遥测与升级提示）在 `src/testing/turbo.ts`。

`cli.ts replay [--ref main] [--count 40]` 对一条分支最近的 first-parent 提交逐个以父提交为基线算计划（成员清单取那个提交上的、规则取现在的，只算不跑；turbo 的包依赖图取当前工作树的，是一个近似），
改规则前后用它看「判全量的有几个、该不该全量」。

**不能声称**：没被选中的成员通过；测试读了某个路径却没写进读者规则，改它时就漏选——规则是查出来的现状，不是机器推导的，
新增一处这样的读取要同时补一条规则；环境变量、外部服务与时间不在影响面里。合并后没有自动补跑，全量由负责人不定时让一个会话手动跑 `FULL=1 pnpm run check`。
自测：`tests/affected.spec.ts` 用真实规则与一份造出来的成员清单核对各类改动的判法，另在临时仓库核对改名与非 ASCII 文件名。

**怎么跑。**`pnpm run test:affected` 先用 turbo 把目标成员连同它们的依赖构建一遍（测试执行的是依赖的 `dist/`；
`pnpm run check` 则由前面的构建一步按计划构建）。然后运行器调用一次 `turbo run <层的任务> --continue=dependencies-successful`。
调用方已经构建过时（`pnpm run check` 的测试一步、`run --all` 不带 `--build`）带 `--only`，只跑测试任务；
否则不带，turbo 按任务的 `dependsOn` 在同一次运行里先构建成员及其上游（准入模式下构建缓存只写不读）。
构建失败的成员不跑测试，记为失败并点名失败的构建。`--concurrency` 取 `parallel.memberConcurrency`，每个成员的 vitest 至多起 `parallel.vitestMaxWorkers` 个工作进程。
一个成员失败不拦其余的，结束时列全失败；退出码只反映测试是否全过。各成员的退出码与起止时间取自 turbo 的运行摘要（`--summarize`），
摘要里没有某个成员的执行记录时，这个成员记为失败。turbo 的输出按每行的 `<包名>:<任务>: ` 前缀拆成各成员的日志。
报告里出现嵌套归档目录中的测试文件时，这个成员也判失败：成员配置的排除没有生效。
turbo 的 Strict Mode 只把声明过的环境变量传给任务。三个测试任务的 `env` 列出影响结果的变量（临时目录、`OMNE_RUNNER_ROOT`），`passThroughEnv` 只列不影响结果的（vitest 并行度、报告目录）；测试任务不缓存，两者在这里都只决定变量能不能传进去。两个并行度可用环境变量
`OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS` 临时覆盖——后者是 vitest 自己认的变量，
会盖过成员配置里的 `maxWorkers`。初值 2 × 4 是在 8 核主机上量出来的：pnpm 默认的 4 个成员并行、
每个成员最多 7 个工作进程时，全量要 18 到 22 分钟且有十几条用例被挤过时限；2 × 4 约 13 分钟。

**耗时账本。**每次运行在**主检出**的 `tmp/test-ledger/<提交短号>[-dirty]/<时间>/`（`OMNE_TEST_LEDGER_HOME` 可改根目录，
`--out` 可直接指定）留下：

| 文件                                              | 内容                                                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.md`                                      | 同时打印到标准输出：总数与墙钟、逐条失败、最慢的成员、超过 `ledger.slowFileSeconds` 的文件、导入耗时最多的成员、贴着自身时限的用例，以及「归层」一行（见下）                                                |
| `ledger.json`                                     | 运行坐标（提交、是否干净、基线、并行度、核数、计划的模式与理由；按计划跑验收时另有 `scope`：跳过了谁、为什么）与成员、文件两级的用例耗时与导入耗时、贴着时限的用例（`nearTimeout`，带各自的时限）、失败清单 |
| `<成员>.log`、`<成员>.json`、`<成员>.timing.json` | 各成员的原始输出、vitest 的 JSON 报告、计时报告                                                                                                                                                             |
| `turbo.log`、`turbo-summary.json`                 | 成员测试时 turbo 的整份输出与运行摘要（摘要从被测检出的 `.turbo/runs/` 挪来）                                                                                                                                |
| `build.log`                                       | 验收运行前的构建输出（测试的构建输出在 `turbo.log` 里）                                                                                                                                                                                  |

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

`pnpm run mutation [--base <基线>]` 回答「这次改动碰到的代码，测试守不守得住」：把改动行上的代码逐处改坏（变异体），
看有没有测试因此失败。`src/mutation/` 是 [Stryker](https://stryker-mutator.io/) 10 与它的 vitest runner 上面薄薄的一层，
变异算子、插桩、调度与判定都是 Stryker 的，这里只做三件事：

- **范围**：先取计划，与准入检查、覆盖采集读同一份。`--plan <计划文件>` 读 `plan --json` 写出的计划（准入检查用 `tmp/check-plan/plan.json`），
  计划不是对当前提交算的就报错；不给时按基线现算一份，基线规则与 `test:affected` 相同。计划写进运行目录的 `plan.json`。算完计划后工作树又改了计划外的成员时报错，要求重算计划。
  然后取计划的合并点到工作树（含未提交、未跟踪）的改动，取新一侧的行号（与[结构度量](../repo-toolchain/README_ZH.md#结构度量)同一份 diff 解析），
  只留计划里要跑测试的 `packages/`、`apps/` 成员 `src/` 下的源码（不含 `*.d.ts`），按成员写成 Stryker 的 `mutate` 条目 `文件:起-止`；
  未跟踪的文件整份变异。`--members <成员目录,…>` 改为变异点名成员 `src/` 下的全部源码。`--plan-only` 只列范围。
- **运行**：先构建这些成员及其依赖，再逐成员调用 Stryker：成员目录为工作目录、只跑**快层**（sandbox 里的 vitest 配置以 mode `fast` 展开成员配置）、
  并行度取 `test-runs.config.json` 的 `parallel.vitestMaxWorkers`（环境变量 `VITEST_MAX_WORKERS` 可改）。
  sandbox 放在与成员**同深度**的 `.stryker-tmp-*` 目录（被 `.gitignore` 忽略）：不少测试用 `import.meta.dirname`
  拼相对路径读成员外的规格与根配置，换了深度就读不到。sandbox 里先把成员的 `node_modules` 软链进来再构建成员
  （`src/mutation/sandbox-build.ts`），跑完连容器目录一起删掉。不就地改源码。
  初跑跑本成员的全部快层，不按「直接导入了被变异文件」挑测试：不少测试按自己的包名导入，走的是 sandbox 里由插过桩的
  源码重新构建的 `dist`，vitest 认不出它们与 `src` 的关系；之后每个变异体按逐条覆盖只跑碰到它的测试。
  Stryker 给每个语句插桩记覆盖，CPU 重的用例会慢上几倍，平时守得住 5 秒的在初跑里就会超时；所以 sandbox 里另写一份
  vitest 配置，展开成员自己的那份，只把没写自己时限的用例的时限放宽到 `mutation.testTimeoutSeconds`（初值 60 秒）。
  成员的配置不动；变异体本身的超时由 Stryker 另判。初跑仍超时，说明有用例插桩后超过这个时限：比如 content-blocks
  解码 4 MiB 的那条，点名整个成员时插桩了它碰到的全部文件，60 秒跑不完；只变异改动行时，只要改动不在它经过的文件里就不受影响。
  调大时限的代价是碰到它的每个变异体都要跑那么久，这类成员只用差分范围。
- **读数**：读每个成员的 `mutation.json`，只计落在要变异的行上的变异体（跨到范围外的另记一个数），
  汇总被杀、超时、存活、无覆盖、编译错误、运行错误与分数（测出来的占测出来与没测出来之和），
  逐条列出存活与无覆盖的「文件:行 算子 原文 → 替换」。原件、`summary.md`、`summary.json` 与各成员日志写进
  主检出的 `tmp/mutation-ledger/<提交短号>[-dirty]/<时间>/`（环境变量 `OMNE_MUTATION_LEDGER_HOME` 可改）。

**只报告**（负责人 2026-10-02 定）：变异体存活不影响退出码，不进 `pnpm run check`；Stryker 起不来、初跑失败、
没写出报告才退出 1，参数错退出 2。读数的边界：

- 存活少不等于测试好：只量了改动行，没改的代码不在内；变异算子之外的错误写法量不到。
- 判定会抖（Stryker 的 perTest 判定已知会抖，上游 #6073）：一个存活要复跑确认，再决定补不补测试。
- `static` 标记的变异体在模块加载时就求值，Stryker 只能为它跑全部测试，成本高。
- 慢层的测试不参与：只被慢层测试守着的代码会显示为无覆盖或存活。
- 只跑本成员自己的测试：靠别的成员的测试守着的代码（比如一个契约只由它的提供者的
  一致性套件守着）会显示为无覆盖，那是变异的盲区，不是这份代码没人测。

自测：`tests/mutation.spec.ts`，其中一条在夹具项目上真起 Stryker（归慢层）：没断言的测试留下存活变异体，
在只按包名导入自己的测试文件里补上断言后被杀；只变异改动行；跑完不留 sandbox。
