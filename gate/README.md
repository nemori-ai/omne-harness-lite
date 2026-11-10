# github-gate

本分支保存 RFC-0011 第一阶段持有发布身份密钥的流程，以及 npm 发包流程。它不进入任何主干，只有 admin 能更新。

- `.github/workflows/gate-publish.yml`：确认后发布进入 `integration/mainline`、main 和 stable 的 PR。
- `.github/workflows/gate-reconcile.yml`：报告核对下限之后没有记录的主干提交，以及上游链上有分支不存在的轨道，不创建标签。
- `.github/workflows/gate-track.yml`：从上游的 first-parent 提交创建新轨道并写起点标签。只有一条轨道 `integration/mainline`，这个流程保留但现在不使用。
- `gate/cutover.json`：各主干的切换点，即核对下限。切换点之前的历史见 #208。
- `gate/toolchain-paths.txt`：受仓库工具链变更闸门保护的路径，见下文。
- `.github/workflows/gate-release.yml`：把 `@omne-harness/repo-toolchain` 或 `@omne-harness/repo-config` 经 npm 可信发布发到 npm，见下文。

派发方式：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR 号> -f head=<PR head 提交号>`。合入 stable 时还要传 `-f checkpoint=<名称>`。

记录标签：合并写 `omne/gate/unit/<结果提交号>`。合入 stable 写 `omne/gate/stable/<提交号>` 和 `omne/gate/checkpoint/<名称>`，同一提交只能进入 stable 一次。确认在 Actions 运行页面的 `publish` environment 完成，每次发布只确认一次，必须填写说明。

## 允许的 PR

`gate-publish` 只认下表三类 PR：

| base | head | 类别 | 覆盖核对 | 工具链闸门 |
| --- | --- | --- | --- | --- |
| `integration/mainline` | 个人分支 | work | 无 | 命中清单时需要 |
| `main` | `integration/mainline` | promote | mainline 在核对下限之后的每个 first-parent 提交都有目标为 mainline 的 unit | 不需要 |
| `stable` | `main` | stable | main 在切换点之后的 first-parent 历史 | 不需要 |

其他组合都拒绝，包括个人分支进 main、main 或任何 `integration/*` 分支进 mainline、其他 `integration/*` 分支作 base 或进 main，以及 head 为 `stable`、`release` 或 `github-gate`。流程在确认后重新判定一次，类别变化就停止。

mainline 必须能确定身份：有 `omne/gate/track/mainline` 起点标签时取标签正文的 `parent`，没有该字段时为 main；否则在 `gate/cutover.json` 中登记了切换点时为 main；两者都没有时拒绝。`parent` 不是 main 时也拒绝。核对下限先取 `gate/cutover.json` 中的切换点，没有时取起点标签指向的提交。

## 提升 PR 的说明

提升 PR（mainline 进 main）由 mainline 的 owner 提出。PR 说明中包含一节 `## 所含的卡`，每行一张卡，列出自上一次提升以来进入 mainline 的卡：

```text
- #<Issue 编号>：<这张卡在 main 上要满足的条件，没有写“无”>
```

第一阶段由确认者按这份清单核对条件。

## 仓库工具链变更闸门

个人分支进入 mainline 的 PR，如果合并后会改动 `gate/toolchain-paths.txt` 列出的路径，`gate-publish` 在 `publish` 确认之前把命中的路径列在运行摘要里。确认者在同一次 `publish` 确认的说明中写明为什么改这些路径，空说明被拒绝。发布决定评论注明本次改动了工具链路径。

- 命中按合并结果计算：`git merge-tree` 得出的结果与目标分支比较，变化的文件再与清单比对。
- 提升（mainline 进 main）与 main 进 stable 不核对工具链，类别见上表。它们搬运的提交都已经以个人分支进 mainline 的方式经过这道闸门。
- 清单与流程定义只在本分支上，运行时从本次运行的提交读取。仓库里的 PR 改不了它们，在仓库树里添加同名文件也不起作用。
- 本分支只有 admin 能更新，更新不经 PR，也不经这道闸门。改动只能从本分支的提交历史查看，定时核对不检查本分支。

## 发包

派发方式：`gh workflow run gate-release.yml --ref github-gate -f package=<repo-toolchain|repo-config> -f commit=<完整提交号> -f issue=<接收决定评论的 Issue 号>`。加 `-f dry_run=true` 时全部步骤照跑，`npm publish` 带 `--dry-run`，不发布。

- 提交必须已经过闸门：有 `omne/gate/unit/<提交号>` 记录，并在 main 或某条轨道的 first-parent 历史上。版本号取自该提交的 `tools/<包>/package.json`，不由派发者填写。
- npm 上已有的版本不会再发：计划时与发布前各查一次，只有 npm 回答 E404 才算不存在，其他读取失败一律停止。
- 确认在 Actions 运行页面完成，environment 为 `npm-release`，必须填写说明。`npm-release` 的确认者与 `publish` 相同，关闭 admin 跳过，只接受本分支上的运行，不存放密钥。调整 `publish` 的确认者时同步调整它。
- 发布用 npm 可信发布：job 申请 GitHub OIDC token，npm CLI 换取短期发布凭据，不存长期 token，附来源证明。两个包都要在 npmjs.com 的包设置里登记 Trusted Publisher：仓库 `nemori-ai/omne-harness-lite`，工作流 `gate-release.yml`，environment `npm-release`。
- pnpm 打包（把 `catalog:` 换成精确版本、应用 `publishConfig`），npm 发布这个 tarball。
- 稳定版本使用 npm 默认的 `latest` 频道，预发布版本显式使用 `next`。dry-run 使用相同的频道选择。
- 决定评论读取发布步骤的实际 outcome。该步骤失败或未执行时写 `NOT CONFIRMED`，不声明 dry-run 成功或已经发布。
- 发布后读回 integrity 与来源证明，往指定 Issue 写决定评论。发包流程拿不到发布身份 App 的私钥，所以不写 `omne/gate/*` 记录标签；可追溯性由来源证明指向的运行与决定评论承担。npm 上的版本发出后撤不回，读回失败时评论写明“NOT CONFIRMED”，流程失败。

本地回归检查需要 Python 3 与 PyYAML，运行 `python3 -m unittest discover -s gate/tests -v`。检查直接执行工作流内的 shell，替换外部 npm 和 GitHub 命令，不作真实发布。

`workflow_dispatch` 要求默认分支上存在同名文件，main 上的对应文件是空壳。
