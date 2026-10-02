# 开发与 CI/CD 自动化

这里放仓库级自动化入口：组织检查、构建、产物处理，以及有实际交付对象后的
发布和部署调用。脚本负责顺序、参数、工作目录与退出状态，检查算法和可复用
行为归 [tools/](../tools/README.md) 等所属包，不在流水线与本地脚本中各实现一遍。

| 入口 | 作用 |
|---|---|
| [package-tenancy-host.sh](package-tenancy-host.sh) | 构建治理中心全新本地.tar.gz归档；不安装、不启动、不上传，见[中心开发入口](../apps/tenancy-host/README.md) |
| [build-tenancy-image.sh](build-tenancy-image.sh) | 从已解压且核完整清单的治理中心app构建指定Linux架构镜像与独占新Docker save归档；不安装、不推送，见[Docker部署入口](../apps/tenancy-host/deploy/docker/README.md) |
| [package-cli.sh](package-cli.sh) | 将现有CLI构建为指定的全新本地.tar.gz归档；不安装、不上传，使用与前提见[CLI开发入口](../apps/cli/README.md) |
| [check.sh](check.sh) | 定位仓库根，先取一个运行名额，算基线以来改动的影响面并打印计划，再依次运行常驻检查与计划里的各步，最后是严格模式的回路状态；任一步失败即停止并返回非零 |
| [with-test-slot.sh](with-test-slot.sh) | 运行名额：让重负载的检查在同一台机器上排队执行，见[下文](#运行名额) |
| [format.sh](format.sh) | 用根配置和本地锁定 Prettier 检查或写入受维护文件；`staged` 模式只检查 Git index blob |
| [test-formatting.sh](test-formatting.sh) | 在临时独立 Git 仓库验证格式范围、幂等、部分暂存和 hook 安装边界 |
| [install-format-hook.sh](install-format-hook.sh) | 显式安装格式化 pre-commit hook；发现已有 hook 时拒绝覆盖 |
| [model-probe.mjs](model-probe.mjs) | 模型适配探针入口；公开目录检查与显式付费实验，预算、凭据和结果要求见 [model-probe](../tools/model-probe/README.md) |

安装 Bash、Make、uv、Node/npm/pnpm 并按[验证规范](../docs/verification.md)准备环境后，
在根执行 `make check` 或 `./scripts/check.sh`。脚本也可通过绝对路径从其他目录调用。
需要比较冻结基线时使用 `make check BASELINE=<git-ref>` 或
`BASELINE=<git-ref> ./scripts/check.sh`；要全量用 `make check FULL=1` 或 `FULL=1 ./scripts/check.sh`；脚本不接受位置参数。
基线在脚本开头解析一次（没给就用 `origin/main`，本地没有这个引用就用 `main`）并导出为 `BASELINE`，
影响面与最后的回路状态共用它。

脚本先跑 `tools/ts-checks/src/testing/cli.ts plan`：按 [test-runs.config.json](../tools/ts-checks/test-runs.config.json) 的 `affected` 规则
给每个改动文件归类，打印判成什么、每一步跑还是跳、选中哪些成员与为什么，计划写进被忽略的 `tmp/check-plan/plan.json`
（算不出计划就在这里失败，不改判全量；`make check-plan` 只打印不跑）。之后的顺序是：

1. 常驻：`agents-check`、`docs-check`、`design-check`；
2. 按计划：`make test`（pytest）；
3. 常驻：`pnpm run format:check`、`pnpm run test:format`；
4. 按计划：构建（被选中的成员及其依赖，另加 `lint:rules` 需要的 identity-values）、类型检查、成员测试——被选中成员的快层再慢层（[分层](../tools/ts-checks/README_ZH.md#测试运行)；`pnpm run test:gate` 也是这一步）；计划为空时明说「没有要跑的成员」，那不是「跑过了、全绿」；
5. 常驻：`pnpm run lint:rules`（也核[验收的覆盖声明](../tools/ts-checks/README_ZH.md#验收的覆盖声明)与提交署名）；
6. 按计划：可执行验收——只跑被选中、带 `acceptance` 脚本的成员，驱动上面构建出来的 `dist/`，任何一份不过整套检查就失败；
   耗时记录写进主检出的 `tmp/acceptance-ledger/`，是下一步验收耗时传感器的读数来源。计划里一个带验收的成员都没有时，为当前提交记一份标着「本次影响面不含带验收的成员」的账本，传感器认它。
   现在只有 `apps/cli` 一份，约 10～16 秒。

判全量时（全局文件改了、有规则不认得的路径、`FULL=1`）全部步骤对全部成员跑，构建与类型检查用根 `pnpm run build`／`typecheck`。
合并后没有自动补跑，也没有定时任务：全量由负责人不定时让一个会话手动跑 `make check FULL=1`。
根 `pnpm run check`（`make product-check`）仍保留为单独的产品检查：全量构建与类型检查，测试一步同样跟计划。

最后一步是 `make loop-status STRICT=1 BASE=<基线> OUT=tmp/loop-status-check`：方向与环、验收锁、删卡记录（与验收锁同一个基线）、
开着的传感器都有数据（验收被计划跳过时认上一步的记录），破一个就失败（见 [tools/ts-checks](../tools/ts-checks/README_ZH.md#回路状态)）。
基线就是脚本开头解析的那一个；HEAD 就是那个提交时照跑，新增依赖为 0。
它只读源码、git 与上一步的验收耗时记录，放最后是让前面的失败先报；产物写进被 git 忽略的 `tmp/loop-status-check/`（每次先清掉），
回路目录里什么都不写。这一步约 30 秒，大头是重复代码检测。单独跑这一步时，要先在同一个提交上跑过 `make acceptance`（或 `make check` 的验收一步留下过记录），否则验收耗时传感器没数据、严格模式判失败。

格式化命令由根 `package.json` 提供：`pnpm format:check` 检查完整受维护范围，
`pnpm format:write` 写入该范围；两者后接 `-- <仓库相对文件...>` 可收窄到明确文件。
`pnpm format:staged` 供 pre-commit hook 使用，`pnpm format:hook:install` 由开发者按需
显式安装本地 hook。安装命令不会覆盖已有 hook，也不应由共享自动化代替用户执行。

远程发布或部署入口新增时按真实目标明确输入、产物和外部副作用。
形式工具环境单独使用 `make formal-tools` 检查；检查覆盖与未覆盖的含义以验证规范为准。

## 运行名额

多棵工作树、多个 agent 各自起全量检查时，CPU 被压满，本来能过的用例会越过时限。
[with-test-slot.sh](with-test-slot.sh) 用文件锁把这些重负载的命令排成队：
`scripts/with-test-slot.sh <命令> [参数…]` 拿到名额才执行命令，并原样返回它的退出码。

经它执行的入口：`make check`（整套占一个名额）、根 `pnpm run test` 与 `pnpm run check` 的测试一步、
`make test-affected`、`make test-tier`、`make test-triage`、`make mutation`、`make metrics COVERAGE=1`。已经持有名额的进程再调用它
（例如 `make check` 里嵌着的测试一步）直接放行，不重复排队。名额随持有它的进程退出而释放，
进程被杀也不会留下卡死的锁。

**先来后到**：进队时领一张号（锁目录里的 `ticket-<号>`），名额空出时只有号码最小的那张活票去拿，
与谁隔多久看一次无关。票和持有者登记（`slot-<序号>.holder`）都由登记它的进程锁住，进程退出或被杀，
锁随之失效：排在中间的被杀掉，后面的照常往前挪，失效的文件由下一个看队列的进程删掉。

| 环境变量 | 初值 | 含义 |
|---|---|---|
| `OMNE_TEST_SLOTS` | 1 | 同时允许几套在跑 |
| `OMNE_TEST_SLOT_DIR` | `/tmp/omne-test-slots-<uid>` | 锁文件目录；同一用户的全部检出共用。要跨用户排队，把它指到一个共享可写的目录 |
| `OMNE_TEST_SLOT_POLL_SECONDS` | 5 | 没轮到时隔多久再看一次 |
| `OMNE_TEST_SLOT_MAX_WAIT_SECONDS` | 7200 | 最多等多久；超过即以 **75** 退出，命令**没有执行** |
| `OMNE_TEST_SLOT_LEDGER` | `${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl` | 运行账本，见下文 |

排队时在标准错误报「前面还有 N 个」，以及每个名额正被什么命令占着、占了多久、在哪个目录、进程号；
前面的人数或持有者变了再报一次，拿到名额时报等了多久。75 表示「没轮到」，既不是检查失败也不是通过；
要么稍后再跑，要么先看是谁占着（`cat <锁目录>/slot-*.holder`，或 `fuser <锁目录>/slot-*.lock`）。
还没并入这一版的检出用的是旧脚本：它与新脚本抢同一把名额锁，互斥照旧，但不领号，可能插队；
它占着名额时排队者会报「持有者没有登记」。

一个名额等于整台机器，几分钟的受影响范围测试仍要排在几十分钟的全量覆盖率或变异测试后面；
按任务大小分配名额要等数据再定（[#57](https://github.com/nemori-ai/omne-harness-lite/issues/57) 第二步）。

**运行账本**给那一步攒数据：每次用完名额、或等到超时放弃，都往 `OMNE_TEST_SLOT_LEDGER` 追加一行 JSON。
它与名额同一个范围——同一用户的全部检出与一次性克隆——所以不放主检出的 `tmp/`，而放在重启也不清的用户状态目录。
写不进去只在标准错误提醒一句，不改命令的退出码；嵌套放行的调用不另记。

| 字段 | 含义 |
|---|---|
| `event` | `ran`：用了名额；`gave-up`：等到超时放弃（这时 `slot`、`acquiredAt`、`heldSeconds`、`cpuSeconds`、`loadAtAcquire` 为 `null`） |
| `command`、`cwd`、`pid` | 经名额执行的命令（截到 500 字符）、从哪个目录、包装进程号 |
| `cores`、`slots`、`slot` | 机器核数、名额总数、用的是第几个 |
| `aheadOnArrival` | 进队时前面有几张活票 |
| `arrivedAt`、`acquiredAt`、`endedAt` | 进队、拿到名额、结束（或放弃）的时刻，RFC 3339 |
| `waitSeconds`、`heldSeconds` | 排了多久、占了多久 |
| `cpuSeconds` | 命令及其已退出的子孙进程用掉的 CPU（用户态加内核态）；除以 `heldSeconds` 就是这类任务平均占几个核 |
| `loadAtAcquire`、`loadAtEnd` | 拿到名额时与结束时的机器负载（1、5、15 分钟平均）；与测试耗时账本里的超时对时间，看负载到多少开始超时 |
| `exitCode` | 命令的退出码；放弃时是 75 |

脚本的行为由 `tools/ts-checks/tests/test-slot.spec.ts` 核对。

## CI

**远程 CI 目前关闭，检查结论以实际执行的本地检查证据为准。**
[check.yml](../.github/workflows/check.yml) 只留了手动触发，仓库设置里这份工作流也已停用：
没有注册 runner 时，自动触发的任务只会排队、不会执行。合并前，在待合并的提交上计算影响面，再运行受影响、因此需要执行的检查。
范围、依据与结果写进 PR，规则归[整洁回路](../docs/clean-loop.md#回路怎么转)。当前 `make check` 尚未自动收窄的范围，由实施者手动计算并执行；其自适应改造归增量 10（#68）。

恢复自动触发要三步，缺一步都不算恢复：按下文注册自托管 runner；在仓库设置里启用这份工作流
（`gh workflow enable Check`）；把工作流文件开头注释掉的三种触发放回 `on:` 之下。恢复之后的行为如下。

| 触发 | 做什么 |
|---|---|
| 手动触发（现在仅此一种）；恢复后另有 PR、推送到 `main` | 全新检出 → 安装依赖 → 编译 agent 生成物 → `make check` → `make metrics`（以 PR 基线或推送前的提交为 `BASE`）。度量步骤失败不改变检查结论 |
| 手动触发并勾选 coverage；恢复后另有每天 03:00（Asia/Shanghai） | 构建后对全部成员跑 `make metrics COVERAGE=1` |

任务跑在**自托管 runner** 上（标签 `self-hosted`、`linux`）。工作流自己安装 Node、pnpm 与 uv，
不依赖 runner 用户的登录环境；它不读任何 `.env`，需要付费模型凭据的测试因此照常跳过。
度量摘要写进任务摘要，四件产物留在 runner 主机的 `$OMNE_METRICS_HOME`
（仓库变量，缺省为 runner 用户的 `~/omne-metrics`）下：PR 在 `pr-<编号>/<提交>/`，
`main` 在 `<提交>/`，夜间在 `nightly/<日期>-<提交>/`。这个目录没有自动清理。

runner 与别的任务共用主机，并行度过高时本来一两秒的用例会被挤过时限。
测试并行度的初值在 [test-runs.config.json](../tools/ts-checks/test-runs.config.json)，本地与 CI 同用一份；
runner 主机核数不同时，设仓库变量 `OMNE_TEST_MEMBER_CONCURRENCY`（同时跑几个成员）与
`OMNE_VITEST_MAX_WORKERS`（每个成员几个工作进程），留空即用初值。本地临时调整用环境变量
`OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS`。`make check` 自带运行名额，
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
