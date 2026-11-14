# 仓库工具链的版本与升级

什么时候读：要改 `tools/repo-toolchain` 或 `tools/repo-config`；要发它们的新版本；要改 `pnpm-workspace.yaml` 里的钉子；检查的结果和工作区里工具的源码对不上。

## 检查跑的是哪一份

检查器 `@omne-harness/repo-toolchain` 与配置预设 `@omne-harness/repo-config` 发布在 npm。`pnpm-workspace.yaml` 的 catalog 钉它们的精确版本，根 `package.json` 与 `tools/product-checks`、`tools/dev-flow`、`tools/test-runner` 用 `catalog:` 引用。安装的是 npm 上的包，不是工作区里这两个成员的源码；锁文件记着每个包的完整性摘要。

所以：

- 根脚本 `check:declarations`、`contract:api`、`lint:deps`、`metrics`、`loop:status`、`loop:health`、`acceptance:lock` 跑的是钉住的版本。
- `lint:rules`、影响面计划与成员测试的编排导入的也是钉住的版本。
- 根 `tsconfig.base.json`、`.dependency-cruiser.cjs` 与 `.oxlintrc.json` 引用的是安装的预设。
- 改工作区的 `tools/repo-toolchain` 或 `tools/repo-config`，不改变这些检查的结果，只影响这两个成员自己的构建、类型检查与测试。
- 例外：收工钩子（`.meta_harness/agents/hooks`）跑的是执行检出里的 `tools/repo-toolchain` 源码。它给 agent 读数，不是准入检查。

## 升级的顺序

1. 在一个 PR 里改 `tools/repo-toolchain` 或 `tools/repo-config`，并提高它 `package.json` 里的版本号。这个 PR 改到仓库工具链路径，经变更闸门确认；它仍由当前钉住的版本检查。
2. 这个 PR 进了轨道或 `main` 之后，经 `gate-release` 发布新版本（`SKILL.md`「npm 发行」）。
3. 再开一个只改 catalog 钉子与锁文件的 PR。它只改 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml`，经变更闸门确认。确认者核对它的改动只有这两处：只有这样，用旧版本检查目标分支才等价于用旧版本检查候选。
4. 用旧版本在目标分支上、用新版本在组合候选上各跑一遍 `pnpm run check`。PR 说明写两次的结果与差别，以及新版本删掉或放宽的每一项检查；确认说明引用 PR 说明。旧版本的失败照实保留。
5. 新版本在组合候选上的结果不得比旧版本在目标分支上的结果多出失败；两边都有的既有失败照实列出。不满足时不确认。
6. 新版本有问题时，再开一个 PR 把钉子改回旧版本，同样照第 3 到 5 步运行与确认。npm 上已经发布的版本不再修改。

改锁文件时从目标分支的锁文件出发用 `pnpm install --lockfile-only`，改完核对相对基线没有被删掉的条目。
