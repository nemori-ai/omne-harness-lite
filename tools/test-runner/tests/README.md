# 测试运行器验证

变异测试的现行行为与限制归 [使用说明](../README_ZH.md#差分变异)。

| 资源 | 层与范围 |
| --- | --- |
| `mutation-guard.spec.ts` | 快层。公开 TestRunner 的 this、参数、结果与生命周期透传；第一次拒绝直接报告 Error；全原始报告的 RuntimeError 使成员无效、不给分数；命中次数超限的原因前缀与 `@stryker-mutator/api` 10.0.0 一致；`RunReporter` 出错或写不出记录时不让运行失败；形状校验。 |
| `mutation.spec.ts` | 快层。检查范围、配置与报告，含超时复核的分类、复核上限（嵌套变异体计入复跑数）、复核的 Stryker 配置、类型测试读数（测到、没测到、不适用）与没有变异体的改动段（列为未覆盖，不报光秃秃的分数）。 |
| `mutation-cli.spec.ts` | 变异入口的参数。点名成员只列范围的一条在快层。参数互斥、缺省基线现算计划与读准入检查的计划这三条起真实 CLI 子进程，在慢层。 |
| `mutation-stryker-*.spec.ts` | 慢层。启动真实 CLI、Stryker 10.0.0 与 Vitest 4.1.11，按场景分成五个文件，让 vitest 按文件并行。增量与成员并行见下面 `mutation-stryker-incremental.spec.ts` 一行。`score` 覆盖 sandbox 里的类型检查、普通存活、Killed、多 worker、只由参数化用例守着的改动行，以及只改 `as const` 声明时 Stryker 不生成变异体、读数报未覆盖。`recheck` 覆盖 static 运行缺席类型测试的读数、可控耗时注入下的复核与复核上限为 0。`hang` 只有真的挂起的 static 变异体一条：复核时限另加 `mutation.testTimeoutSeconds`（60 秒），这一条要等满复核的时限（Stryker 的估算再加 `mutation.testTimeoutSeconds`），所以单独成一个文件。`preflight` 覆盖文件收集错误与深层 suite 自身错误、同 out 重跑、旧报告留存与预检。 |
| `mutation-schedule.spec.ts` | 快层。成员并行：工作进程按工作量分、不超过预算与上限、每个至少一个；调度时同时在跑的进程不超过预算，结果按成员下标放回；一个成员抛错时排着的不再开始。 |
| `mutation-incremental.spec.ts` | 快层。增量：快照的目录与开关、读不出与指纹对不上按没有快照处理、写不进去不抛、交给 Stryker 的只有被杀的、范围按「整个包含」判、去掉带回的范围外变异体、补回复用的 static 变异体的运行记录、从带颜色码的日志里取复用数。 |
| `mutation-stryker-incremental.spec.ts` | 慢层。夹具上真起 Stryker：第二次复用被杀的、读数不变；改一处被变异的行只重跑那里；范围缩小时读数与不复用时相同；关掉增量时不读不写快照、配置与以前相同；`--force` 不复用；两个成员并行与逐个跑读数相同。 |
| `fixtures/mutation.ts` | 上面几份文件共用的夹具：临时目录、CLI 夹具仓库、手写计划、单成员的 Stryker 夹具项目与 `mutate`。 |
| `pnpm-lockfile.spec.ts` | 快层。读 `pnpm-lock.yaml` 的最小 YAML 解析器：pnpm 9 实际写出的形状、带 peer 后缀的键、错行报行号、结构等价比较。 |
| `lockfile-impact.spec.ts`、`fixtures/lockfiles.ts` | 快层。锁文件差异到成员的映射（[影响面怎么算](../README_ZH.md#测试运行)第 1 条的锁文件例外）：单成员依赖、被两个成员依赖的包升级、去掉的包按基线图、别名依赖；顶层设置、根依赖、解析失败、解释不了的引用判全量；等价无影响。另用本仓库真实锁文件核对解析器与成员清单对得上。 |
| `admission-run.spec.ts` | 快层。准入运行记录（[准入](../README_ZH.md#准入运行记录接续与证据核对)）：原子写入、读回相同、坏文件按没有记录；由步骤图运行写成记录时跑完、被终止、没开始各记成什么；`fullRequested`、`worktree` 缺了或写错就不是记录，工作树根经软链也记成同一个真实路径；完整通过的全量准入的判法（只是计划判了全量、接续的 H1 没带 `FULL=1` 都不算）；两处收集、挑某个提交最近一次干净的全量。 |
| `resume.spec.ts` | 快层。`check --resume-from` 的判断：前提校验的每种拒绝（含 H1 就是当前头、H1 那次在别的工作树）、全局路径与锁文件的退化（锁文件也整次重跑、不问映射）、增量计划里每一步整次／按影响面／常驻（轻步骤 python 总是整次）、H1 按影响面准入时整次的步骤只取本次基线的影响面与基线合并点不同的拒绝、接续记录不作 H1、证据文本；另在临时仓库核对取 git 事实（祖先、树哈希、差异、未提交改动）与结束时重新核对现场（头变了、未提交改动算，被忽略的文件不算）。 |
| `admission-evidence.spec.ts` | `admission-evidence --for <F>`（[准入](../README_ZH.md#准入运行记录接续与证据核对)）。快层：真实 git 夹具上树相同接受、树不同拒绝，每个接受条件单独就能让记录被拒（含计划判了全量却没带 `FULL=1`），接续了带 `FULL=1` 的准入的记录接受、接续了影响面准入或没带 `FULL=1` 的准入的拒绝，缺 `tree` 由头补算，按树找与只读 `tmp/admission`，子命令退出码。慢层：起真实 CLI 子进程核对接受 0、拒绝 1、用法 2。 |
| `check-resume.spec.ts` | 慢层。夹具仓库上端到端跑 `runCheck`（真实 git、turbo、影响面、步骤图、记录与日志，步骤表换成记下范围的假命令）：只在 oxlint 失败的 `FULL=1` 准入写出记录，被终止的步骤记 `ran: false`；修复后 `--resume-from` 全部步骤都跑、没跑到的与轻步骤整次、通过了的重步骤只跑 H1..HEAD 影响到的成员，证据进日志、记录写 `resume` 与 H1 的 `fullRequested`；没有记录的头、不在准入模式、H1 就是当前头、与 `--list` 同给以 2 退出且不写日志记录（含真实 CLI 子进程）；差异碰到 `package.json` 时整次全量并写明，记录照搬 H1 的 `fullRequested`；运行中留下没被忽略的文件时记录记 `dirty`；另一个夹具上 H1 按影响面准入：本次基线合并点不同以 2 退出，相同时接续的整次步骤只选本次基线影响面里的成员、证据写「影响面准入」，接续记录再作 H1 以 2 退出。 |
| `entry-scripts.spec.ts` | 快层。`scripts/` 下入口脚本拥有的部分：`metrics.sh`、`slot-unless-plan-only.sh`、`test-tier.sh`、`check-design.sh` 的参数分派、谁占名额与退出码；`check.sh` 只认 `--admission`、`--keep-going` 与带值的 `--resume-from`，原样交给运行器。 |
| `test-cache.spec.ts` | 成员级测试结果缓存（[结果缓存](../README_ZH.md#测试运行)）。快层：用真实的 `affected` 规则核对每类改动进谁的键（自己、上游传递、读者规则点名、全局、未归类；成员根目录文档、常驻、Python、退役不进）、键随层／平台／Node／列出的环境变量／任一输入内容而变、进键的环境变量按配置选、读不读的策略、只写完整通过、条目的读写与坏条目。慢层：临时仓库核对工作树快照（索引 blob、改过与未跟踪现算、删掉与忽略不在）；本仓库核对 turbo 包依赖图与 `--filter=...` 一致、每个成员都算得出键；真起 turbo 跑两遍核对命中不执行、来源、改输入／换层／不读时照跑、坏条目按未命中。 |

在仓库根运行，重验证须通过共享槽：

```sh
scripts/with-test-slot.sh pnpm --filter @omne-harness/test-runner exec vitest run --mode fast tests/mutation
scripts/with-test-slot.sh pnpm --filter @omne-harness/test-runner exec vitest run --mode slow --typecheck.enabled=false tests/mutation
```

运行前清除外部 `BASELINE`，并按[开发环境要求](../../../docs/development.md#准备可用的检出)准备 Git 等工具。慢层夹具需要可执行真实仓库操作的 Git。慢层夹具独立创建仓库，不操作产品数据。设置 `OMNE_MUTATION_FIXTURE_EVIDENCE` 可保存静态收集错误的原始报告与 CLI 输出。

这些资源验证本工具的测量边界，不证明产品成员的测试质量，也不重算旧读数。
