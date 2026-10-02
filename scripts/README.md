# 开发与 CI/CD 自动化

这里放仓库级自动化入口：组织检查、构建、产物处理，以及有实际交付对象后的
发布和部署调用。脚本负责顺序、参数、工作目录与退出状态，检查算法和可复用
行为归 [tools/](../tools/README.md) 等所属包，不在流水线与本地脚本中各实现一遍。

| 入口 | 作用 |
|---|---|
| [package-tenancy-host.sh](package-tenancy-host.sh) | 构建治理中心全新本地.tar.gz归档；不安装、不启动、不上传，见[中心开发入口](../apps/tenancy-host/README.md) |
| [build-tenancy-image.sh](build-tenancy-image.sh) | 从已解压且核完整清单的治理中心app构建指定Linux架构镜像与独占新Docker save归档；不安装、不推送，见[Docker部署入口](../apps/tenancy-host/deploy/docker/README.md) |
| [package-cli.sh](package-cli.sh) | 将现有CLI构建为指定的全新本地.tar.gz归档；不安装、不上传，使用与前提见[CLI开发入口](../apps/cli/README.md) |
| [check.sh](check.sh) | 定位仓库根，先取一个运行名额，再依次运行 agent 产物与根链接、文档、规格、Python 工具测试、产品包检查、可执行验收，最后是严格模式的回路状态；任一步失败即停止并返回非零 |
| [with-test-slot.sh](with-test-slot.sh) | 运行名额：让重负载的检查在同一台机器上排队执行，见[下文](#运行名额) |
| [format.sh](format.sh) | 用根配置和本地锁定 Prettier 检查或写入受维护文件；`staged` 模式只检查 Git index blob |
| [test-formatting.sh](test-formatting.sh) | 在临时独立 Git 仓库验证格式范围、幂等、部分暂存和 hook 安装边界 |
| [install-format-hook.sh](install-format-hook.sh) | 显式安装格式化 pre-commit hook；发现已有 hook 时拒绝覆盖 |
| [model-probe.mjs](model-probe.mjs) | 模型适配探针入口；公开目录检查与显式付费实验，预算、凭据和结果要求见 [model-probe](../tools/model-probe/README.md) |

安装 Bash、Make、uv、Node/npm/pnpm 并按[验证规范](../docs/verification.md)准备环境后，
在根执行 `make check` 或 `./scripts/check.sh`。脚本也可通过绝对路径从其他目录调用。
需要比较冻结基线时使用 `make check BASELINE=<git-ref>` 或
`BASELINE=<git-ref> ./scripts/check.sh`；脚本不接受位置参数。

产品包检查（`product-check`，含全量构建与 `lint:rules`——后者也核[验收的覆盖声明](../tools/ts-checks/README_ZH.md#验收的覆盖声明)）之后是
`make acceptance NO_BUILD=1`：跑每个带 `acceptance` 脚本的成员的可执行验收，驱动刚构建出来的 `dist/`，任何一份不过整套检查就失败；
它的耗时记录写进主检出的 `tmp/acceptance-ledger/`，是下一步验收耗时传感器的读数来源（见 [tools/ts-checks](../tools/ts-checks/README_ZH.md#测试运行)）。
现在只有 `apps/cli` 一份，约 10～16 秒。

最后一步是 `make loop-status STRICT=1 BASE=<基线> OUT=tmp/loop-status-check`：方向与环、验收锁、删卡记录（与验收锁同一个基线）、
开着的传感器都有数据，破一个就失败（见 [tools/ts-checks](../tools/ts-checks/README_ZH.md#回路状态)）。
基线取 `BASELINE`；没给就用 `origin/main`，本地没有这个引用就用 `main`；HEAD 就是那个提交时照跑，新增依赖为 0。
它只读源码、git 与上一步的验收耗时记录，放最后是让前面的失败先报；产物写进被 git 忽略的 `tmp/loop-status-check/`（每次先清掉），
回路目录里什么都不写。这一步约 30 秒，大头是重复代码检测。单独跑这一步时，要先在同一个提交上跑过 `make acceptance`，否则验收耗时传感器没数据、严格模式判失败。

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
`make test-affected`、`make test-triage`、`make metrics COVERAGE=1`。已经持有名额的进程再调用它
（例如 `make check` 里嵌着的测试一步）直接放行，不重复排队。名额随持有它的进程退出而释放，
进程被杀也不会留下卡死的锁。

| 环境变量 | 初值 | 含义 |
|---|---|---|
| `OMNE_TEST_SLOTS` | 1 | 同时允许几套在跑 |
| `OMNE_TEST_SLOT_DIR` | `/tmp/omne-test-slots-<uid>` | 锁文件目录；同一用户的全部检出共用。要跨用户排队，把它指到一个共享可写的目录 |
| `OMNE_TEST_SLOT_POLL_SECONDS` | 5 | 没有空名额时隔多久再看一次 |
| `OMNE_TEST_SLOT_MAX_WAIT_SECONDS` | 7200 | 最多等多久；超过即以 **75** 退出，命令**没有执行** |

排队与拿到名额各在标准错误打一行。75 表示「没轮到」，既不是检查失败也不是通过；
要么稍后再跑，要么先看是谁占着（`ls` 锁目录，`fuser <锁文件>`）。脚本的行为由
`tools/ts-checks/tests/test-slot.spec.ts` 核对。

## CI

**远程 CI 目前关闭，检查结论以本地跑的 `make check` 为准**（2026-10-01 定）。
[check.yml](../.github/workflows/check.yml) 只留了手动触发，仓库设置里这份工作流也已停用：
没有注册 runner 时，自动触发的任务只会排队、不会执行。合并前的门是本地在待合并提交上跑的完整 `make check`。

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
