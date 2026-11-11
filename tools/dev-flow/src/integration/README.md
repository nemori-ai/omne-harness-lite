# 使用分支集成工具

本工具在 gate 运行时等待并代为确认，派发并跟踪工具包的发行运行，并在准入中核对契约快照与 dist。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。本工具不构造候选，也不验证或发布。写平台的只有两处：`gate-cli.ts wait` 批准指定环境的待确认部署，`release-run` 派发一次发行运行并在显式要求时批准 `npm-release`。

从仓库根运行。行为承诺归 [SPEC](SPEC.md)，规则归[轨道与 gate](../../../../docs/engineering/integration.md)。命令存在不授予项目 ref 或平台写权限。

## 等待 gate 并代为确认

```sh
node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note <说明文件> [--environments <名称,...>] [--interval <秒>] [--timeout <分钟>] [--config <文件>]
```

命令轮询一次 workflow 运行，缺省每 10 秒一次、最多 90 分钟。仓库取[交付配置](../../../../docs/engineering/github-delivery.json)的 `repository`。每一轮，命令把当前待确认、环境名在 `--environments` 中、且当前身份可以批准的部署用说明文件的内容一次批准；下一轮再批准那时仍待确认的部署，不因某个环境批准过就跳过。`--environments` 缺省为 `publish`。工具链变更闸门等其他审批环境须显式列出，例如 `--environments repo-toolchain-review,publish`。运行结束时输出结论：`success` 退出0，其他结论退出1。超时、读取失败或批准失败时退出2。

说明去掉首尾空白后不能为空，按 UTF-8 编码最多 1024 字节。超过时命令在发出任何请求之前退出2。GitHub 的错误消息写「1024 characters」，但实测按字节一类的口径：一份 750 个字符、1220 字节的中文说明被拒，604 字节的说明被接受。中文一个字占 3 字节，所以中文说明大约只能写 340 个字。详细说明写进卡上的评论，说明里给出评论链接。命令不判断当前身份是否获授权代为确认：只在该 admin 授权本次确认之后运行，说明中写明代为确认的人。

## 包发布运行

在仓库根运行：

```sh
pnpm run release-run --input /absolute/release.json --journal /absolute/task/release
```

此入口迁移 `release.sh`。包内同名 script 与构建后的 `omne-release-run` 提供同一行为。它启动 `gate-release.yml` 在 `github-gate` 上的一次包发布运行。

输入须包含 `schemaVersion: 1`、`repo`、稳定 UUID `operationId`、`package`、完整 SHA `commit`、正整数 `issue`、布尔 `dryRun` 和完整 SHA `workflowHead`。`package` 只接受 `repo-toolchain` 或 `repo-config`。`workflowHead` 是本次已经核对的实际 `github-gate` 提交；派发前工具再次比对。

默认只观察审批。需要批准时显式加 `--approve --note /absolute/note.txt`，且 GitHub 必须允许当前账户批准 `npm-release`。其他环境不批准。`--timeout SECONDS` 限制观察时间，默认 5400 秒；超时不取消远端运行。

工具保存本次精确 run 与 attempt，成功退出要求该运行完成且 conclusion 为 success。恢复使用相同输入和日志目录。没有精确派发回执时保持 unknown，不根据最新 run 猜测归属，也不重复派发。见 [SPEC](SPEC.md#包发布运行命令)。

## 契约快照核对

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts contract-check [--root PATH]
```

`pnpm run check` 在构建之后每次都运行它。命令运行钉住的 `omne-contract-api --check --json`，拿成员 dist 现场生成的快照与快照文件比较：

- 成员为 `differs`、`unreadable`、`missing` 或 `invalid` 时退出 1，检查失败。标准错误逐个写成员、状态与改法。公开面的改动是本卡要做的时，运行 `pnpm run contract:api --write`，核对快照改动后提交。不是要做的改动时，改回声明。
- 没有 dist 的成员（`unbuilt`）只报告。影响面计划没有选中的成员不构建；本卡改了成员的快照或源码时，影响面会选中它。
- 报 `differs` 时先重新构建这个成员再核对：长期使用的工作树合并了同步之后，dist 可能早于合并进来的快照。仍不一致时才运行 `--write`。
- 找不到 `omne-contract-api`、运行失败或输出不合格时退出 2，检查也失败。

标准输出是 JSON 报告，标准错误最后一行是汇总。精确条款见 [SPEC](SPEC.md#契约快照核对) 的 I22。

## 持续验证

在 `tools/dev-flow` 下运行：

```sh
pnpm exec vitest run tests/integration-*.spec.ts tests/shared-*.spec.ts
pnpm run typecheck
```

`integration-gate` 用按轮次应答的 GitHub 替身覆盖 `gate-cli wait` 的环境过滤、每轮批准、说明长度与超时，`integration-gate-cli-options` 用子进程覆盖它的选项边界。`integration-release-run` 覆盖发行运行的派发、观察、审批与恢复。`integration-contract-check` 在临时真实 Git 检出里运行安装的 `omne-contract-api`。`integration-delivery-config` 覆盖交付配置的解析，`shared-gh` 覆盖 `gh` 命令的结果分类与重试。`integration-boundaries` 核对 `scripts/check.sh`、测试运行器的步骤表与格式化入口对本成员的调用。GitHub 替身通过不代替真实平台证据。
