# 已知问题与常用命令

本页的现象来自实际运行。工具或宿主的行为变化后，以实际输出为准，并修订本页。被工具修复的条目删除。

## 常用命令

在工作树根目录运行。尖括号是占位符。

| 目的 | 命令 |
| --- | --- |
| 生成 agent 投影（agent 源没改时） | `uv run --locked python .meta_harness/tooling/src/initialize_agents.py --project-root .` |
| 核对投影 | `pnpm run check:agents` |
| 读任务状态 | `node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status` |
| 同步目标分支后更新 targetBase | 先 `git merge <目标提交>`，再用 `{"kind":"task-sync","target":"<40 位提交号>"}` 运行 `cli.ts execute` |
| 文档检查 | `pnpm run check:docs` |
| 准入 | `pnpm run admission`（等于 `OMNE_ADMISSION=1 pnpm run check`，另写准入日志） |
| 定向复现准入里的测试失败 | `npx turbo run test:<层> --filter=<成员> --only --env-mode=strict -- <测试文件> -t <用例>` |
| 后台运行并传出退出码 | `<命令> > "$log" 2>&1; rc=$?; echo "exit=$rc" >> "$log"; exit "$rc"` |
| 看板 Stage | `node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts <dispatched\|delivered\|integrating\|accepted> --issue <号>`。云端会话用 `gh workflow run delivery-stage.yml --ref github-gate -f issue=<号> -f stage="In progress"` |

## 改了 agent 源之后重新生成投影

编译器不覆盖内容或权限不同的既存文件。改了 agent 源之后直接输出到 `.meta_harness` 会报 `ERROR: output differs; use a fresh staging directory`。规则见 `.meta_harness/tooling/README.md`「使用」。顺序：

```sh
set -euo pipefail
stage="$(mktemp -d tmp/<任务>/agents-stage.XXXXXX)"
uv run --locked python .meta_harness/tooling/src/compile_agents.py --source .meta_harness/agents --output "$stage"
diff -rq "$stage" .meta_harness | grep -v '^Only in .meta_harness' || true
rsync -rlpc "$stage"/ .meta_harness/
uv run --locked python .meta_harness/tooling/src/link_agents.py --project-root .
pnpm run check:agents
rm -rf "$stage"
```

用脚本运行，或每步检查退出码。不要把编译命令接到 `| tail` 之类的管道上。删除了某个 agent 源时，旧的生成文件不会自动删除，`check:agents` 也不检查多出的文件，要手动删。

## 工作树与 task context

- task context 绑定「工作树 + 分支」。同一棵树换分支后，`start` 报 `stale: Context belongs to another tree or branch`。
- 同一张卡开新 attempt 时，旧树上 `start` 报 `stale: Worktree is already bound to another task`。用 `worktree-cli.ts swap` 换树，或按顺序手动做：把旧树的 `tmp/issue-<号>/` 移到主检出 `tmp/` 保存，推送分支，移除旧树，在同一分支上建新树，还原材料。不手删 context。
- 只合并不运行 `task-sync` 时，`targetBase` 仍是旧值，影响面按旧基线算。显式传入不等于 `targetBase` 的基线，检查以 2 退出。
- 线内的卡：`start` 写的 targetBase 是远端联调轨道头，与批次分支分叉是预期结果，不要为此合并联调轨道。

## 投影与环境

- 新工作树没有 agent 投影时，`pnpm run check` 报缺少生成目录。umask 让投影文件带组写权限时，`check:agents` 报权限不符，对报错的文件 `chmod g-w`。
- 有成员的验收夹具从 `dist` 导入时，准入的依赖检查报模块无法解析。准入前先构建该成员及其依赖。
- 只用离线缓存的测试可能报 `ERR_PNPM_NO_OFFLINE_META`。在临时目录对缺少的包运行 `pnpm install --lockfile-only` 补齐离线元数据，证据里写明这是环境问题。
- 手动构建后又改了源码时，成员下的旧 `dist` 会被 `check:declarations` 读到，结果反映的是旧产物。准入前删掉手动构建残留的 `dist`，需要时按上上条重新构建。
- git 版本太旧时（实测 2.25），turbo 的 `ls --affected` 报 `Unable to query SCM`。把新版 git 放到 PATH 前面。
- Claude Code 会话的钩子命令来自会话启动时所在检出的生成物，并在会话期间缓存。主检出落后时，所有工作树的钩子都可能报错。修法是快进主检出、重装依赖、重新生成投影，再重启会话。
- Claude Code 会话会把 shell 的工作目录重置回会话的主工作目录。在某棵工作树里启动的会话，`cd` 到别的工作树不会保持。要在几棵树之间切换，从主检出根启动会话，或者每条命令都写绝对路径或 `git -C <树>`。

## 卡与派发

- 卡没有前置条件时，「交付条件」整节正文必须恰好是 `无`，不带句号。否则 `start` 报条件表无法建立完整引用。
- 派发评论不可再改。编辑过的派发评论使 `start` 以 `unknown` 失败。要改派发内容时发新的派发。
- 卡上评论里以 `- 决定：` 开头的行会被读成交付决定，种类不是 accept、cancel、revoke、partial 之一时，派发命令与 `start` 报 `decision-kind-invalid`。范围裁定、接管处置这类评论用「裁定」作字段名（P24）。
- 卡不在 Project 中时，云端会话的 `start` 等 180 秒后以 `Delivery facts timed out` 失败。云端会话不能添加 Project item，先请有权限的人加。
- 云端会话的 `gh` GraphQL 请求返回 403。读卡与改卡用 REST：`gh api repos/<仓库>/issues/<号>`，`gh api -X PATCH repos/<仓库>/issues/<号> -F body=@<文件>`。
- 经云端代理写入 GitHub 的正文里，一段没有空白的文字里出现两个 URL，或 URL 后紧跟反引号内容时，整段会被包成代码段。写入前在每个 Markdown 链接后加一个空格。代理还可能在正文末尾追加一行署名，读回比较时忽略它。

## 准入、评审与 gate

- `pnpm run check` 开始时算一次计划文件，之后每步读计划时核对计划对应的提交与当前 HEAD。中途提交会让这次准入失败，只能重跑（P11）。
- `test:triage` 不经过 turbo 的严格环境模式，可能把依赖环境的失败报成「隔离后稳定通过」。用常用命令里的 turbo 命令定向复现。
- 对 `/` 或主目录运行搜索会拖慢准入。简报写明搜索范围是工作树。
- 准入运行时，同一台机器上的其他负载会让有时限的用例超时（例如 5 秒时限），准入停在快层，只能整次重跑。准入期间不派会跑 vitest 的评审子代理，也不跑 metrics、mutation 或 profile（P12）。负载造成的超时先如实报告，写明当时自己有没有加负载。
- gate 确认说明的实测上限是 1024 个字符。超限后同一运行仍在等待确认，缩短说明后可以对同一运行再确认。
- 改动命中 `github-gate` 上 `gate/toolchain-paths.txt` 的 PR 要过两道确认：先 `repo-toolchain-review`，再 `publish`。只改 `constraints.json` 或 `docs/verification.md` 这类文件也可能命中。`gate-cli.ts wait` 的 `--environments` 缺省只有 `publish`，这时要写 `--environments repo-toolchain-review,publish`。
- `gate-release` 的 `npm-release` 确认是不可撤回的发版，不在代确认的授权里。自动模式的权限检查拦下它时不要绕过：把确认命令写成脚本交有权者运行，或请有权者在运行页面确认。
- 会话的 stop hook 可能要求把提交改成 agent 署名。按贡献指南，作者是负责的人。线会话直接按贡献指南处理，不等人确认。
- 上下文压缩后的摘要可能把宿主的署名提示记成常设规则。每次压缩后按贡献指南复核一次（P5）。
