# 分支集成工具行为契约

本工具在 gate 运行时等待并代为确认（I21），派发并跟踪工具包的发行运行，为 `pnpm run check` 核对契约快照与 dist（I22）。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。本工具不构造候选，不验证候选，也不发布。认卡、执行记录、绑定、开工、双基线、目标基线同步、轨道树与提升 PR 的说明生成已按 [RFC-0014](../../../../docs/rfcs/RFC-0014-single-card-session-and-gate-relief.md) 删除，相应条款随之删除。保留条款沿用原编号。

本模块兑现[轨道与 gate](../../../../docs/engineering/integration.md)。公开类型及输入解析归本目录源码，命令用法归 [README](README.md)。以下承诺约束实现。

## 交付配置

`parseConfig` 解析 `docs/engineering/github-delivery.json`，只读 gate 用到的字段：`schemaVersion` 为 3，`kind` 为 `github-delivery-config`，`repository` 为不含 `.` 或 `..` 段的 GitHub `owner/name`。其他字段不读。

## gate 等待

I21。`gate-cli.ts wait` 等待一次 workflow 运行。说明去掉首尾空白后，按 UTF-8 编码的字节数须在 1 到 1024 之间，否则在任何请求之前拒绝。按字节计数依据两次实测，不是 GitHub 文档的承诺：750 个字符、1220 字节的说明被拒，604 字节的说明被接受。`environments` 至少有一个环境名，CLI 缺省为 `publish`。仓库取交付配置的 `repository`，`--config` 可以指定另一份配置。每轮先读运行，`status` 为 `completed` 时返回 `conclusion` 与每轮批准的环境 ID；否则读 `pending_deployments`，把 `current_user_can_approve` 为 true 且环境名在 `environments` 中的部署在一次 POST 中批准，评论为说明。每轮按当时的待确认部署判断，不按此前批准过的环境 ID 跳过。然后等待一个间隔。到达时限时以 `unknown` 失败。CLI 在结论为 `success` 时退出0，其他结论退出1，失败退出2。选项重复、未知或缺值时，在读文件与发请求之前退出2。命令不判断当前身份是否获授权代为确认，也不派发 gate。

`gh` 命令经 [shared/gh.ts](../shared/gh.ts) 运行：标准输出按 JSON 解析。非零退出且标准输出为 JSON 时，错误是带响应体的 `GhReadError`，消息不含 API 输出。只有 GET（`--method GET`，或既没有方法也没有字段与输入）在传输失败、超时或 5xx 应答时重试，最多三次，间隔 0.5、1、2 秒；4xx 应答（含 429）、起不来的进程和其他命令不重试。

## 包发布运行命令

`release-run-cli.ts`、仓库根和包内的 `release-run` script、构建后的 `omne-release-run` 迁移包发布脚本。它固定使用 `gate-release.yml` 与 `github-gate`。

输入 JSON 先经 [strict-json.ts](strict-json.ts) 解析，重复键（含转义后相同的键）、超过 1 MiB 或嵌套超过 128 层时拒绝；再由 `parseReleaseRunInput` 严格解析，包含版本、仓库、UUID operationId、包名、候选提交、Issue 号、显式 dryRun 与 workflowHead。支持 repo-toolchain 和 repo-config。派发前读取实际 workflow ID 与 ref head，确认与输入一致；在一次 POST 之前持久保存 intent。精确 dispatch receipt 绑定本次输入和 run。没有 receipt 时返回 unknown，恢复不选择最新 run，也不重复 POST。

每次观察核对同仓库、workflow ID/path、ref、head、workflow_dispatch、run ID 和 attempt 1，并读取精确 attempt。重跑、身份变化、失败或取消均不能报告成功。观察超时只停止本地等待，远端运行可能继续。相同输入和操作日志用于恢复；冲突输入拒绝，日志不共用临时文件。

默认只观察。显式 `--approve --note FILE` 才可能批准，且仅处理 `npm-release`，要求平台 `current_user_can_approve` 为真。审批前再次核对精确 run，并先保存审批 intent；不确定结果不重发。其他环境不批准。实际 approvals 另行读回。GitHub 审批接口按 run 定位，没有 compare-and-set attempt 保证，工具不声明消除该平台并发窗口。

成功退出要求精确 run 完成且 conclusion 为 success。其他观察结果退出 1，输入或命令错误退出 2。输出包含操作身份、run/attempt 链接、诊断及恢复状态。

## 契约快照核对

I22。`contract-check` 让契约快照与 dist 的不一致使 `pnpm run check` 失败。测试运行器的步骤表在构建与类型检查之后调用它。

- 它经 `contract-api.ts` 的 `contractApiCommand` 与 `runContractApi` 运行 dev-flow 依赖解析出的 `omne-contract-api --check --json --root <检出根>`，不运行工作区源码。超时为 `CONTRACT_CHECK_TIMEOUT_MS`（300 秒）。
- 成员状态取钉住版本的六种：`match`、`differs`、`unreadable`、`missing`、`unbuilt`、`invalid`。`differs`、`unreadable`、`missing`、`invalid` 失败，每个成员一项，带成员、状态、说明与改法。`unbuilt` 只报告：影响面计划没有选中的成员不构建。本卡改了一个成员的快照或源码时，影响面选中它，它被构建并核对。本命令不核对没有 dist 的成员是否真的没有变。`differs` 也可能来自早于合并进来的快照的 dist，所以改法先写重新构建。`match` 通过。
- 标准输出是 JSON 报告：`typescript`、各状态的成员数 `counts`、`failures` 与 `unbuilt`。标准错误为每个失败的成员写一行 `contract-check: <状态> <成员>: <说明> 改法：<改法>`，最后写一行汇总。
- 退出码：没有失败的成员为 0，有为 1。找不到 `omne-contract-api`、进程出错或超时、退出码不为 0、输出形状不符时退出 2，错误以一行 JSON `{code, message}` 写到标准错误，标准输出为空。`cli.ts` 的其他子命令一律以 2 拒绝。
- `omne-contract-api --check` 对 `differs` 也退出 0，所以失败判断在本命令。

## 验证义务与限制

持续测试覆盖：交付配置解析真实配置，拒绝别的版本、别的 `kind` 与不合格的仓库名；`gh` 命令的成功、带响应体的失败、不带响应体的失败与超时，以及重试的范围、次数与间隔（进程内替身与子进程替身各一层）。I21 的测试用按轮次应答的 GitHub 替身覆盖只批准指定环境、不可批准的部署不批准、每轮重新批准仍待确认的部署、按 UTF-8 字节超长、按字符却不超长的说明在任何请求之前拒绝而恰为 1024 字节的说明接受、空环境列表拒绝与超时；CLI 子进程覆盖选项边界。包发布运行由 [integration-release-run.spec.ts](../../tests/integration-release-run.spec.ts) 覆盖；替身通过不替代真实受保护环境审批证明。I22 的测试用注入的 `--check --json` 输出覆盖六种状态各自的退出码、同一次运行的全部失败成员与输出形状不符；进程起不来时抛出并带错误码；经 CLI 在临时真实 Git 检出里运行安装的 `omne-contract-api`：快照与 dist 一致时退出 0，改动一个快照后退出 1，改回后退出 0，没有 dist 的成员只报告，配置被拒绝时退出 2。

GitHub 响应模拟只能证明解析及请求协议。真实 Rulesets、Actions、权限与宿主加载不由本模块的测试证明。
