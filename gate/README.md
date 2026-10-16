# github-gate

本分支保存 RFC-0004 第一阶段持有发布身份密钥的流程。它不进入任何主干，只有 admin 能更新。

- `.github/workflows/gate-publish.yml`：确认后发布轨道、main 和 stable 的 PR。
- `.github/workflows/gate-reconcile.yml`：报告切换点之后没有记录的主干提交，不创建标签。
- `.github/workflows/gate-track.yml`：确认后从 main 的 first-parent 提交创建新轨道，并写 `omne/gate/track/<轨道名>` 起点标签。
- `gate/cutover.json`：各主干的切换点。切换点之前的历史见 #208。
- `gate/toolchain-paths.txt`：受仓库工具链变更闸门保护的路径，见下文。
- `.github/workflows/gate-release.yml`：把 `@omne-harness/repo-toolchain` 或 `@omne-harness/repo-config` 经 npm 可信发布发到 npm，见下文。

派发方式：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR 号> -f head=<PR head 提交号>`。合入 stable 时还要传 `-f checkpoint=<名称>`。

记录标签：合并写 `omne/gate/unit/<结果提交号>`。合入 stable 写 `omne/gate/stable/<提交号>` 和 `omne/gate/checkpoint/<名称>`，同一提交只能进入 stable 一次。新轨道写 `omne/gate/track/<轨道名>`。确认在 Actions 运行页面完成，必须填写说明。

新建轨道：`gh workflow run gate-track.yml --ref github-gate -f track=<轨道名，不含 integration/> -f base=<main 上的完整提交号> -f issue=<接收决定评论的 Issue 号>`。轨道仍须在 `integration-policy.json` 登记 owner 与责任。

## 仓库工具链变更闸门

个人分支进入轨道的 PR，如果合并后会改动 `gate/toolchain-paths.txt` 列出的路径，`gate-publish` 先要求 `repo-toolchain-review` environment 的确认，再要求 `publish` 的确认。两道确认都必须写说明，空说明被拒绝。命中的路径列在运行摘要里，工具链确认的说明写进发布决定评论。

- 命中按合并结果计算：`git merge-tree` 得出的结果与目标分支比较，变化的文件再与清单比对。
- 轨道进 main、main 进轨道、main 进 stable 不再审批工具链。它们搬运的提交都已经以个人分支进轨道的方式进入过主干。
- 清单与流程定义只在本分支上，运行时从本次运行的提交读取。仓库里的 PR 改不了它们，在仓库树里添加同名文件也不起作用。
- 本分支只有 admin 能更新，更新不经 PR，也不经这道闸门。改动只能从本分支的提交历史查看，定时核对不检查本分支。
- `repo-toolchain-review` 的确认者与 `publish` 相同，关闭 admin 跳过，只接受本分支上的运行。它不存放密钥。调整 `publish` 的确认者时，同步调整这里。

## 发包

派发方式：`gh workflow run gate-release.yml --ref github-gate -f package=<repo-toolchain|repo-config> -f commit=<完整提交号> -f issue=<接收决定评论的 Issue 号>`。加 `-f dry_run=true` 时全部步骤照跑，`npm publish` 带 `--dry-run`，不发布。

- 提交必须已经过闸门：有 `omne/gate/unit/<提交号>` 记录，并在 main 或某条轨道的 first-parent 历史上。版本号取自该提交的 `tools/<包>/package.json`，不由派发者填写。
- npm 上已有的版本不会再发：计划时与发布前各查一次，只有 npm 回答 E404 才算不存在，其他读取失败一律停止。
- 确认在 Actions 运行页面完成，environment 为 `npm-release`，必须填写说明。`npm-release` 的确认者与 `publish` 相同，关闭 admin 跳过，只接受本分支上的运行，不存放密钥。调整 `publish` 的确认者时同步调整它。
- 发布用 npm 可信发布：job 申请 GitHub OIDC token，npm CLI 换取短期发布凭据，不存长期 token，附来源证明。两个包都要在 npmjs.com 的包设置里登记 Trusted Publisher：仓库 `nemori-ai/omne-harness-lite`，工作流 `gate-release.yml`，environment `npm-release`。
- pnpm 打包（把 `catalog:` 换成精确版本、应用 `publishConfig`），npm 发布这个 tarball。
- 发布后读回 integrity 与来源证明，往指定 Issue 写决定评论。发包流程拿不到发布身份 App 的私钥，所以不写 `omne/gate/*` 记录标签；可追溯性由来源证明指向的运行与决定评论承担。npm 上的版本发出后撤不回，读回失败时评论写明“NOT CONFIRMED”，流程失败。

