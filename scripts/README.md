# 开发与 CI/CD 自动化

这里放仓库级自动化入口：组织检查、构建、产物处理，以及有实际交付对象后的
发布和部署调用。脚本负责顺序、参数、工作目录与退出状态，检查算法和可复用
行为归 [tools/](../tools/README.md) 等所属包，不在流水线与本地脚本中各实现一遍。

| 入口 | 作用 |
|---|---|
| [package-tenancy-host.sh](package-tenancy-host.sh) | 脚本仍执行 `apps/tenancy-host/tools/package.ts`。仓库里没有这个路径，它不会进入 `apps.0.0.1.legacy` |
| [build-tenancy-image.sh](build-tenancy-image.sh) | 脚本仍执行 `apps/tenancy-host/tools/docker-image.ts`。仓库里没有这个路径，它不会进入 `apps.0.0.1.legacy` |
| [package-cli.sh](package-cli.sh) | 把 `@omne-harness/cli` 构建到临时目录，把其中的 `dist/` 写入一个尚不存在的绝对路径 `.tar.gz`。不删除、不写入 `apps/cli/dist`，不安装、不上传 |
| [check.sh](check.sh) | 定位仓库根，先取一个运行名额，再把正文交给测试运行器的 `check` 命令：算基线以来改动的影响面并打印计划，按[步骤图](#check-的步骤图)跑常驻检查与计划里的各步（无依赖的同时跑），最后是严格模式的回路状态；任一步失败即终止其余并返回那一步的退出码。`--admission` 为准入模式并写准入日志（根脚本 `pnpm run admission`），`--keep-going` 失败后继续跑其余步骤 |
| [with-test-slot.sh](with-test-slot.sh) | 运行名额：让重负载的检查在同一台机器上排队执行，见[下文](#运行名额) |
| [slot-unless-plan-only.sh](slot-unless-plan-only.sh) | 根脚本 `test:affected` 与 `mutation` 的入口：实际运行时取一个运行名额，带 `--plan-only` 只列范围时不取 |
| [test-tier.sh](test-tier.sh) | 根脚本 `test:tier` 的入口：取一个运行名额，先构建，再跑全部成员的一层。层必须给 `fast`、`slow` 或 `all`，缺层或层名不对时退出 2 |
| [check-design.sh](check-design.sh) | 根脚本 `check:design` 的入口：先核对设计源，再核对领域对象。`--stale <值>` 只交给第二条 |
| [metrics.sh](metrics.sh) | 根脚本 `metrics` 的入口：参数原样交给钉住的 `omne-metrics`。带 `--coverage` 时取一个运行名额；没给 `--plan` 时先用测试运行器算一份计划（`--base` 交给计划，`FULL=1` 给全量），再以 `--plan` 交给 `omne-metrics` |
| [format.sh](format.sh) | 用根配置 `.oxfmtrc.json` 和本地锁定的 oxfmt 检查或写入受维护文件；`staged` 模式只检查 Git index blob |
| [git-environment.sh](git-environment.sh) | 为显式仓库、独立 fixture 和 staged 命令提供各自的 Git 环境边界 |
| [test-formatting.sh](test-formatting.sh) | 在临时独立 Git 仓库验证格式范围、幂等、部分暂存和 hook 安装边界 |
| [install-format-hook.sh](install-format-hook.sh) | 显式安装格式化 pre-commit hook；发现已有 hook 时拒绝覆盖 |
| [model-probe.mjs](model-probe.mjs) | 模型适配探针入口；公开目录检查与显式付费实验，预算、凭据和结果要求见 [model-probe](../tools/model-probe/README.md) |

安装 Bash、uv、Node/npm/pnpm 并按[验证规范](../docs/verification.md)准备环境后，
在根执行 `pnpm run check` 或 `./scripts/check.sh`，两者等价。脚本也可通过绝对路径从其他目录调用。
需要比较冻结基线时使用 `BASELINE=<git-ref> pnpm run check` 或
`BASELINE=<git-ref> ./scripts/check.sh`；要全量用 `FULL=1 pnpm run check` 或 `FULL=1 ./scripts/check.sh`。脚本只接受 `--admission` 与 `--keep-going` 两个开关。
准入用 `pnpm run admission`（等于 `OMNE_ADMISSION=1 pnpm run check`，见[集成规则](../docs/engineering/integration.md#检查责任)）：
除了构建与类型检查不读缓存，还写准入日志 `tmp/admission/<时间>-<head 短号>.log`，作为准入证据；两种写法都写日志。日志是本节的唯一源，别处只链接过来：

- 首行：命令、head（有未提交改动时注明）、基线与它的来源、核数、开始时刻。
- 中间：影响面计划、每一步的开始与结束（秒数、退出码、失败步骤的日志路径）、总计与关键路径。
- 末行：`exit=<退出码>`。没有这一行表示运行中途中止：基线被拒时根本不写日志（以 2 退出），算计划或步骤图核对抛错时日志只有开头几行。集成节点核对证据时按这一条判断。
基线在正文开头按统一规则解析一次（`BASELINE`，再取任务上下文固定的 `targetBase`，再取 `origin/main`，本地没有这个引用就取 `main`）并以 `BASELINE` 传给各步，
影响面与最后的回路状态共用它。规则由测试运行器的 `baseline` 命令给出，实现在 `@omne-harness/repo-toolchain` 的 `resolveBaseline`，`pnpm run check:plan`、`test:affected` 与 `mutation` 用同一个函数。
已绑定任务的工作树只接受等于 `targetBase` 的显式基线：同步过目标分支以后，开工时的 `taskBase` 不再是合法的 `BASELINE`，传入会被拒绝，脚本这时只在标准错误写出原因并以 2 退出，不运行任何检查（它先占一个运行名额，名额被别的运行占着时，拒绝要排队之后才出现）。已绑定的树不必传基线。

设置 `OMNE_SUBJECT_ROOT` 时，`format.sh` 的检查模式检查该目录所在的仓库，规则仍取脚本自己的检出。格式自测在自身入口清除 `OMNE_SUBJECT_ROOT` 与 `OMNE_RUNNER_ROOT`，保证 fixture 和 Git hook 检查自己的沙盒。

### check 的步骤图

正文先算影响面：按 [test-runs.config.json](../tools/test-runner/test-runs.config.json) 的 `affected` 规则
给每个改动文件归类，打印判成什么、每一步跑还是跳、选中哪些成员与为什么，计划写进被忽略的 `tmp/check-plan/plan.json`
（算不出计划就在这里失败，不改判全量；`pnpm run check:plan` 只打印不跑）。然后按步骤图跑下面这些步骤。表在 [check-steps.ts](../tools/test-runner/src/testing/check-steps.ts)，运行器在 [check-graph.ts](../tools/test-runner/src/testing/check-graph.ts)；`node --experimental-strip-types tools/test-runner/src/testing/cli.ts check --list` 打印当前的表（`check.sh` 不接受这个开关）。调度规则：

- 每一步只声明「先于我完成的步骤」，没有依赖的同时跑。
- 重步骤（构建、类型检查、成员测试、验收）自己按[并行度](../tools/test-runner/README_ZH.md#测试运行)起多进程把机器占满，所以一次只跑一个：两个一起只会互相挤。工作进程预算在起任何步骤之前、机器安静时采一次，经 `OMNE_WORKER_BUDGET` 交给各重步骤；调用方已设它时原样交下去。
- 轻步骤（含 pytest；pytest 自己用 xdist 起几个进程，进程数取预算的四分之一）同时至多 `max(2, 核数 ÷ 3)` 个，与重步骤同时跑、填它留下的空，优先级相同：把轻步骤降级量过，pytest 与 check:docs 这些关键路径上的轻步骤被挤慢 40% 到 100%，总墙钟反而变长。

失败语义：

- 一步失败：不再起新步骤，正在跑的整棵进程树终止，整体退出码取第一个失败的那一步，并打印它日志的末尾。
- `--keep-going`：其余步骤照跑，依赖失败步骤的仍不启动；退出码仍取第一个失败。

产物：

- 每步的输出落 `tmp/check-run/<步骤>.log`，名字里的 `:` 换成 `-`，例如 `check-docs.log`。
- 结束时写逐步耗时表 `tmp/check-run/steps.tsv`（步骤、退出码、秒数、相对开始的起止秒），并打印实际走过的关键路径。

- 不依赖任何步骤的常驻检查：`check:agents`、`check:docs`、`check:design`、`check:lines`、`format:check`、`test:format`、`lint:oxlint`，以及写范围与线归属的核对 `node --experimental-strip-types tools/dev-flow/src/delivery/change-scope-cli.ts`（根 `package.json` 没有对应的脚本）。它读本工作树的 task context，逐提交算出本卡自己改过的文件，再加上未提交的改动。不在 binding 写范围内的文件为 `change-outside-scope`，线内的卡改到别的线或联调轨道的文件为 `change-outside-line`。本卡改了契约成员的 `api` 目录时，它用钉住的 `omne-contract-api --diff <taskBase>` 比较这些成员的快照差异，超过 binding 的契约变更时为 `contract-exceeds-declared`。有任一项时退出 1，检查失败。`omne-contract-api` 运行失败时退出 2，检查也失败。标准错误逐项写文件、代码与改法。没有 task context 时只写「未绑定」，检查继续。算法与退出码见 [dev-flow 交付观察说明](../tools/dev-flow/src/delivery/README.md#改动的写范围与线归属)。
- 不依赖任何步骤、按计划：`pnpm run test:python`（pytest）与构建（被选中的成员及其依赖，另加 `lint:rules` 需要的 identity-values）。
- 构建之后：`check:declarations`；契约成员 API 快照与 dist 的核对 `node --experimental-strip-types tools/dev-flow/src/integration/cli.ts contract-check`（根 `package.json` 没有对应的脚本；它运行钉住的 `omne-contract-api --check --json`。成员为 differs、unreadable、missing 或 invalid 时退出 1，检查失败，标准错误逐个写成员、状态与改法。没有 dist 的成员（unbuilt）只报告：影响面计划没有选中它们，所以没有构建。本卡改了成员的快照或源码时，影响面会选中它。工具缺失、运行失败或输出不合格时退出 2，检查也失败。见 [dev-flow 集成工具说明](../tools/dev-flow/src/integration/README.md#契约快照核对)）；`lint:rules`（也核[验收的覆盖声明](../tools/product-checks/README_ZH.md#验收的覆盖声明)与提交署名）；`lint:deps`（dependency-cruiser 解析验收夹具对 dist 的导入）；按计划的类型检查、成员测试与可执行验收。成员测试跑被选中成员的快层，快层全部通过才跑慢层（[分层](../tools/test-runner/README_ZH.md#测试运行)；`pnpm run test:gate` 也是这一步）；计划为空时明说「没有要跑的成员」，那不是「跑过了、全绿」。可执行验收只跑被选中、带 `acceptance` 脚本的成员，驱动构建出来的 `dist/`，任何一份不过整套检查就失败；耗时记录写进主检出的 `tmp/acceptance-ledger/`，是回路状态里验收耗时传感器的读数来源。计划里一个带验收的成员都没有时，为当前提交记一份标着「本次影响面不含带验收的成员」的账本，传感器认它。现在只有 `apps/cli` 一份，约 6～16 秒。
- 其余全部结束之后：`pnpm run loop:status --strict --base <基线> --out tmp/loop-status-check`：方向与环、验收锁、开着的传感器都有数据（验收被计划跳过时认上一步的记录），破一个就失败（见 [tools/repo-toolchain](../tools/repo-toolchain/README_ZH.md#回路状态)）。基线就是正文开头解析的那一个；HEAD 就是那个提交时照跑，新增依赖为 0。它只读源码、git 与验收的耗时记录，放最后是让前面的失败先报；产物写进被 git 忽略的 `tmp/loop-status-check/`（每次先清掉），回路目录里什么都不写。这一步约 30 秒，大头是重复代码检测。单独跑这一步时，要先在同一个提交上跑过 `pnpm run acceptance`（或 `pnpm run check` 的验收一步留下过记录），否则验收耗时传感器没数据、严格模式判失败。

这样排之后，墙钟由关键路径决定。Linux 上是构建 → 类型检查 → 快层 → 慢层 → 验收 → 回路状态；pytest、文档与设计检查、格式、lint 都与它重叠。Windows 上 pytest 改用 xdist 分进程后，在 check 里约两分钟，与构建、类型检查重叠。逐步耗时表每次都写，关键路径由实际起止时间算出。
判全量时（全局文件改了、有规则不认得的路径、`FULL=1`）计划选中全部成员，全部步骤对全部成员跑。构建与类型检查仍经 turbo 执行。
合并后没有自动补跑，也没有定时任务：全量由负责人不定时让一个会话手动跑 `FULL=1 pnpm run check`。

格式化命令由根 `package.json` 提供：`pnpm format:check` 检查完整受维护范围，
`pnpm format:write` 写入该范围；两者后接 `-- <仓库相对文件...>` 可收窄到明确文件。
`pnpm format:staged` 供 pre-commit hook 使用，`pnpm format:hook:install` 由开发者按需
显式安装本地 hook。安装命令不会覆盖已有 hook，也不应由共享自动化代替用户执行。

显式仓库命令通过 `git-environment.sh` 删除继承的 `GIT_DIR`、`GIT_WORK_TREE`、`GIT_INDEX_FILE`、`GIT_COMMON_DIR`、`GIT_OBJECT_DIRECTORY`、`GIT_ALTERNATE_OBJECT_DIRECTORIES`、`GIT_NAMESPACE`、`GIT_SHALLOW_FILE`。正式检查保留 OMNE runner/subject、认证、Git 配置及测试槽参数；这不是任意 Git 配置隔离。格式自测在首个 fixture Git 调用前另清两个 OMNE root。

`staged` 和已安装的 pre-commit 保留调用者选择的 `GIT_INDEX_FILE`，只清其余七项。非空相对 index 在改变工作目录前按调用目录转为绝对路径；未设置时仍由 Git 定位默认 index。格式检查只读 index，支持 linked worktree。复制格式脚本时须同时复制 `git-environment.sh`；已安装的 pre-commit 自带启动隔离，不依赖 hook 目录中的相邻文件。持续回归见 [格式环境测试](../tools/repo-toolchain/tests/formatting-environment.spec.ts)。

远程发布或部署入口新增时按真实目标明确输入、产物和外部副作用。
形式工具环境单独使用 `pnpm run check:formal-tools` 检查；检查覆盖与未覆盖的含义以验证规范为准。

## 运行名额

多棵工作树、多个 agent 各自起全量检查时，CPU 被压满，本来能过的用例会越过时限。
[with-test-slot.sh](with-test-slot.sh) 把这些重负载的命令排成队：
`scripts/with-test-slot.sh <命令> [参数…]` 拿到名额才执行命令，并原样返回它的退出码。
实现在 [with-test-slot.mjs](with-test-slot.mjs)，只用 Node 标准库，macOS、Linux 与 Windows 通用；
`with-test-slot.sh` 只转发给它。不经 shell 时可直接运行 `node scripts/with-test-slot.mjs <命令> [参数…]`。

经它执行的入口：根 `pnpm run check`（整套占一个名额）、`pnpm run test`、`pnpm run test:gate`、
`pnpm run test:affected`、`pnpm run test:tier`、`pnpm run test:triage`、`pnpm run acceptance`、`pnpm run mutation`、`pnpm run metrics --coverage`；
`test:affected` 与 `mutation` 带 `--plan-only` 时不占名额。已经持有名额的进程再调用它
（例如 `pnpm run check` 里嵌着的测试一步）直接放行，不重复排队。名额随持有它的进程退出而释放，
进程被杀也不会留下卡死的锁。

**先来后到**：进队时领一张号（锁目录里的 `ticket-<号>`），名额空出时只有号码最小的那张活票去拿，
与谁隔多久看一次无关。票和名额（`slot-<序号>.lock`）都是独占创建的文件，记着登记它的进程号与心跳间隔，
登记者定时刷新它的修改时间。进程不在了，或心跳停了超过三个间隔，登记就失效：排在中间的被杀掉，后面的照常往前挪，
失效的文件由下一个看队列的进程删掉。队列的增删在 `queue.lock` 目录内进行，目录由 `mkdir` 原子创建。

| 环境变量 | 初值 | 含义 |
|---|---|---|
| `OMNE_TEST_SLOTS` | 1 | 同时允许几套在跑 |
| `OMNE_TEST_SLOT_DIR` | `/tmp/omne-test-slots-<uid>`；Windows 为系统临时目录下的 `omne-test-slots-<用户名>` | 锁文件目录；同一用户的全部检出共用，不随 `TMPDIR` 变化。要跨用户排队，把它指到一个共享可写的目录 |
| `OMNE_TEST_SLOT_POLL_SECONDS` | 5 | 没轮到时隔多久再看一次 |
| `OMNE_TEST_SLOT_MAX_WAIT_SECONDS` | 7200 | 最多等多久；超过即以 **75** 退出，命令**没有执行** |
| `OMNE_TEST_SLOT_LEDGER` | `${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl` | 运行账本，见下文 |

排队时在标准错误报「前面还有 N 个」，以及每个名额正被什么命令占着、占了多久、在哪个目录、进程号；
前面的人数或持有者变了再报一次，拿到名额时报等了多久。75 表示「没轮到」，既不是检查失败也不是通过；
要么稍后再跑，要么先看是谁占着（`cat <锁目录>/slot-*.lock`）。
还没并入这一版的检出用的是基于 `flock` 的旧脚本，它与新脚本使用不同的登记方式，彼此不互斥；同一台机器上的检出应一起更新。
旧脚本在 macOS 与 Windows 上无法运行。

一个名额等于整台机器，几分钟的受影响范围测试仍要排在几十分钟的全量覆盖率或变异测试后面；
按任务大小分配名额要等数据再定（[#57](https://github.com/nemori-ai/omne-harness-lite/issues/57) 第二步）。

**运行账本**给那一步攒数据：每次用完名额、或等到超时放弃，都往 `OMNE_TEST_SLOT_LEDGER` 追加一行 JSON。
它与名额同一个范围——同一用户的全部检出与一次性克隆——所以不放主检出的 `tmp/`，而放在重启也不清的用户状态目录。
写不进去只在标准错误提醒一句，不改命令的退出码；嵌套放行的调用不另记。

| 字段 | 含义 |
|---|---|
| `event` | `ran`：用了名额；`gave-up`：等到超时放弃（这时 `slot`、`acquiredAt`、`heldSeconds`、`cpuSeconds`、`loadAtAcquire` 为 `null`） |
| `command`、`cwd`、`pid` | 经名额执行的命令（截到 500 字符）、从哪个目录、包装进程号 |
| `issue` | 当前目录所在工作树的 task context（git 目录下的 `omne-integration-context.json`）里最后一项任务的卡号；不是 git 仓库、没有 context 或字段不合格时为 `null` |
| `attempt` | 同一项任务的 attempt，取不到时为 `null`。两项取不到时，脚本都不提醒、不改退出码 |
| `cores`、`slots`、`slot` | 机器核数、名额总数、用的是第几个 |
| `aheadOnArrival` | 进队时前面有几张活票 |
| `arrivedAt`、`acquiredAt`、`endedAt` | 进队、拿到名额、结束（或放弃）的时刻，RFC 3339，截到秒 |
| `waitSeconds`、`heldSeconds` | 排了多久、占了多久，毫秒差向下取整到整秒（见下） |
| `cpuSeconds` | 命令及其已退出的子孙进程用掉的 CPU（用户态加内核态），精确到 0.01 秒 |
| `loadAtAcquire`、`loadAtEnd` | 拿到名额时与结束时的机器负载（1、5、15 分钟平均）；与测试耗时账本里的超时对时间，看负载到多少开始超时 |
| `exitCode` | 命令的退出码；放弃时是 75 |

**秒数的取整。**时刻字段与两个秒数字段只记到整秒，没有毫秒字段。`cpuSeconds` 记到 0.01 秒。

- `waitSeconds` 与 `heldSeconds` 各自把毫秒差向下取整。
- 三个时刻字段各自截到秒。所以 `endedAt` 减 `acquiredAt` 可能比 `heldSeconds` 大 1。`acquiredAt` 减 `arrivedAt` 可能比 `waitSeconds` 大 1 或 2，因为脚本在拿到名额之前量 `waitSeconds`，稍后才取 `acquiredAt`。以 `waitSeconds` 与 `heldSeconds` 为准。
- 命令不到 1 秒时，`heldSeconds` 为 0，而 `cpuSeconds` 可以大于 0。

**平均核数。**这类任务平均占几个核，等于 `cpuSeconds` 除以命令实际占用名额的时间。实际占用时间在 `heldSeconds` 秒以上、`heldSeconds` + 1 秒以下，所以平均核数落在 (`cpuSeconds` ÷ (`heldSeconds` + 1)，`cpuSeconds` ÷ `heldSeconds`] 这个区间里。`heldSeconds` 为 0 时无法相除，只有下界 `cpuSeconds` ÷ 1。命令越短，区间越宽，不要只取上界。

脚本的行为由 `tools/test-runner/tests/test-slot.spec.ts` 核对。

## CI

正式 `Check` 工作流当前停用。[check.yml](../.github/workflows/check.yml) 只保留手动触发，仓库设置也将这份工作流停用。仓库的 Actions 服务已启用，有在线自托管 runner 和临时分支试验工作流；它们不构成 `main` 或 PR 的正式检查。

合并前，在待合并的提交上计算影响面，再运行所需检查。`pnpm run check` 已按共同配置生成影响面计划；用 `pnpm run check:plan` 核对选中的范围、依据与跳过条件。实际结果写进 PR，规则归[整洁回路](../docs/clean-loop.md#回路怎么转)。

主干与记录标签的平台保护归[多层集成](../docs/engineering/integration.md#现行准入)。本地检查不能代替平台门禁。

恢复自动触发时，先核对现有 runner 的在线状态、标签和执行权限；需要新增或重新注册时再按下文操作。在仓库设置里启用 `Check`，命令为 `gh workflow enable Check`，再把工作流文件开头注释掉的三种触发放回 `on:` 之下。核对真实触发和结果后，才能确认正式检查已接通。工作流定义的行为如下。

| 触发 | 做什么 |
|---|---|
| 启用 `Check` 后可手动触发；恢复自动触发后另有 PR、推送到 `main` | 全新检出 → 安装依赖 → 编译 agent 生成物 → `pnpm run check` → `pnpm run metrics`（以 PR 基线或推送前的提交为 `--base`）。度量步骤失败不改变检查结论 |
| 启用 `Check` 后手动触发并勾选 coverage；恢复自动触发后另有每天 03:00（Asia/Shanghai） | 构建后对全部成员跑 `pnpm run metrics --coverage` |

任务跑在**自托管 runner** 上（标签 `self-hosted`、`linux`）。工作流自己安装 Node、pnpm 与 uv，
不依赖 runner 用户的登录环境；它不读任何 `.env`，需要付费模型凭据的测试因此照常跳过。
度量摘要写进任务摘要，四件产物留在 runner 主机的 `$OMNE_METRICS_HOME`
（仓库变量，缺省为 runner 用户的 `~/omne-metrics`）下：PR 在 `pr-<编号>/<提交>/`，
`main` 在 `<提交>/`，夜间在 `nightly/<日期>-<提交>/`。这个目录没有自动清理。

runner 与别的任务共用主机，并行度过高时本来一两秒的用例会被挤过时限。
测试并行度由运行器按 runner 主机的核数、空闲率与内存推出来（策略在 [test-runs.config.json](../tools/test-runner/test-runs.config.json)，本地与 CI 同用一份，见[并行度](../tools/test-runner/README_ZH.md#测试运行)）；
要钉死时设仓库变量 `OMNE_WORKER_BUDGET`（整份工作进程预算）、`OMNE_TEST_MEMBER_CONCURRENCY`（同时跑几个成员）与
`OMNE_VITEST_MAX_WORKERS`（每个成员几个工作进程），留空即用推出的值。本地临时调整用环境变量
`OMNE_WORKER_BUDGET`、`OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS`。`pnpm run check` 自带运行名额，
runner 上的任务与同一用户在主机上手工起的全量检查会互相排队。
耗时账本留在 runner 主机的 `$OMNE_TEST_LEDGER_HOME`（仓库变量；留空则落在检出目录的 `tmp/test-ledger/`，
随下一次全新检出被清掉）。

runner 的注册是主机上的一次性操作，不由仓库脚本代办：

1. 在仓库 Settings → Actions → Runners 取注册令牌，按页面给出的命令把 runner 装在
   **独立目录**（不放进任何检出），以普通用户运行并注册为服务。
2. 只注册一个 runner 实例，同一时刻只跑一个任务；工作流已用 `nice` 降低优先级。
   要进一步限制 CPU，在该服务的 systemd unit 上设 `CPUQuota`。
3. 自托管 runner 会在本机执行 PR 里的代码：仓库保持私有，
   不对外部贡献者的 PR 开放工作流运行。

包专属的构建脚本和 skill 自带脚本随其所有者维护，不统一搬到这里。
源码位置与 workspace 分工见[workspace 规范](../docs/workspace.md)。
