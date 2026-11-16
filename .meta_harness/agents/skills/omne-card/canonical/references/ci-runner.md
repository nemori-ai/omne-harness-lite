# 正式 Check 工作流与自托管 runner

什么时候读：要恢复远程 Check 的自动触发；要注册或调整自托管 runner；要找 CI 的度量产物与耗时账本；要在 CI 上钉测试的并行度。

路径都从执行仓库的根算起。

远程 Check 停用期间，检查结论以本地的 `pnpm run check` 为准。工作流的触发与步骤以 `.github/workflows/check.yml` 为源。这一页只写管理员在仓库设置与 runner 主机上要照做的事。

## 恢复自动触发

1. 核对现有 runner 的在线状态、标签与执行权限。需要新增或重新注册时照下一节做。
2. 在仓库设置里启用工作流：`gh workflow enable Check`。
3. 把工作流文件开头注释掉的三种触发放回 `on:` 之下。
4. 核对真实的触发与结果。核对过才算正式检查已接通。

## 注册自托管 runner

runner 的注册是主机上的一次性操作，不由仓库脚本代办。

1. 在仓库 Settings → Actions → Runners 取注册令牌。照页面给出的命令把 runner 装在独立目录里，不放进任何检出。以普通用户运行，并注册为服务。
2. 只注册一个 runner 实例，同一时刻只跑一个任务。工作流已经用 `nice` 降低优先级。要再限制 CPU，在这个服务的 systemd unit 上设 `CPUQuota`。
3. 自托管 runner 会在本机执行 PR 里的代码。不对外部贡献者的 PR 开放工作流运行。

## 仓库变量与产物

- 任务跑在自托管 runner 上，标签是 `self-hosted` 与 `linux`。工作流自己安装 Node、pnpm 与 uv，不依赖 runner 用户的登录环境。它不读任何 `.env`，需要付费模型凭据的测试照常跳过。
- 度量摘要写进任务摘要。四件产物留在 runner 主机的 `$OMNE_METRICS_HOME` 下。它是仓库变量，缺省是 runner 用户的 `~/omne-metrics`。PR 的产物在 `pr-<编号>/<提交>/`，`main` 的在 `<提交>/`，夜间的在 `nightly/<日期>-<提交>/`。这个目录没有自动清理。
- 耗时账本留在 runner 主机的 `$OMNE_TEST_LEDGER_HOME`，它也是仓库变量。留空时账本落在检出目录的 `tmp/test-ledger/`，随下一次全新检出被清掉。
- 测试并行度由测试运行器按主机的核数与内存推出来，本地与 CI 用同一份策略，见 `tools/test-runner/SPEC.md`「并行度」。要钉死时设仓库变量 `OMNE_WORKER_BUDGET`、`OMNE_TEST_MEMBER_CONCURRENCY` 与 `OMNE_VITEST_MAX_WORKERS`。留空时用推出的值。
- `pnpm run check` 的各步自己向令牌池要核。runner 上的任务与同一用户在主机上手工起的全量检查互相排队。
