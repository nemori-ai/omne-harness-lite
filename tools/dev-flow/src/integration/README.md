# 使用分支集成工具

本工具为任务工作树开工、读取状态与基线，并在同步目标分支后更新目标基线。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。本工具不构造候选，也不验证或发布。云端开工时，本工具派发 `delivery-facts` workflow，此外不写平台。

从仓库根运行。行为承诺归 [SPEC](SPEC.md)，工程节奏归[多层分支规则](../../../../docs/engineering/integration.md)。policy 固定读当前 HEAD 提交中的 `docs/engineering/integration-policy.json`，交付配置按 policy 的 `deliveryConfig` 读取。命令存在不授予项目 ref 或平台写权限。

## 先观察

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts baselines [--base REF]
```

`--root PATH` 指定实际被操作的 Git 工作树，缺省为当前目录。

`status` 报告本工作树的 task context 与远端目标分支：

- 没有 context 时输出 `{"bound": false, "root": ..., "branch": ..., "head": ...}`，不读远端。
- 已绑定时另输出 `issue`、`revision`、`attempt`、`taskBase`、`targetBase`、`target`（远端目标分支的 `ref` 与当前提交 `head`）和 `relation`。`relation` 为 `current`（`targetBase` 等于远端目标）、`behind`（`targetBase` 是远端目标的祖先）或 `diverged`（`targetBase` 不在远端目标的历史上）。
- 已绑定而远端目标读不到时失败，错误码为 `unknown`。

目标分支是 binding 的 route 所具名轨道在 registry 中登记的 `integration/<轨道>`，三种 route 相同。远端位置取 policy 的 `transport.location`。

`baselines` 输出检查用的基线。有 context 时输出固定的 `targetBase` 与本任务的审计范围；`--base` 给出的提交与 `targetBase` 不同时拒绝，错误码为 `stale`。没有 context 时 `targetBase` 是 `--base` 的值，它为空时不补缺省；缺省基线的统一规则在 `@omne-harness/repo-toolchain` 的 `resolveBaseline`，`scripts/check.sh` 经测试运行器的 `baseline` 命令使用它，不再调用本命令。输出中的 `state` 来自 `@omne-harness/repo-toolchain` 的读格式：没有 context 时为 `pending`；有 context 时 0.0.4 输出 `adopted`，0.0.5 起输出 `bound`。消费钉住版本的成员只判断它是否为 `pending`，所以两个版本下的结果相同。

## 执行命令

变更命令统一读取严格 JSON 文件：

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts execute \
  --root "$WORKTREE" --input "$COMMAND_FILE"
```

`COMMAND_FILE` 只含命令参数，不能代替授权。`kind` 只接受 `register`、`start` 与 `task-sync`；多余字段或已删除的命令拒绝。成功时向标准输出写 JSON。任何失败都向标准错误写 `{"code": ..., "message": ...}` 并退出 2。`code` 为 `refused`、`unknown`、`stale` 或 `input-error`，都不表示成功。

## 任务与执行权

Issue 正文的 `当前执行与交接` 中放唯一一个 binding 围栏区块：版本 1 为 `json omne-integration-binding:v1`，版本 2 为 `json omne-integration-binding:v2`。区块标记的版本必须等于区块内的 `schemaVersion`。正文同时有两种区块时拒绝。形状归 [TaskBinding](../delivery/binding.ts)。

版本 1：schemaVersion=1；issue 包含 repository/id/number/url；revision 等于正文交付修订；attempt、responsible、branch、route、completionTarget、taskBase、writeScope、dispatch、conditions、authorization 都必填，其他字段拒绝。route 为 `{kind:"track",track:ID}`、`{kind:"global",track:ID,owners:[受影响拥有者]}` 或 `{kind:"cross-track",track:ID,owners:[受影响拥有者]}`。global 与 cross-track 必须具名一条顶层轨道，即 registry 中 `parent` 为 `main` 的轨道。completionTarget 为 track/main/stable。三种 route 的 completionTarget 都可以取 `track`，这时它指 route 中具名的那条轨道。conditions 只引用同卡条件 ID。

版本 2：schemaVersion=2，含版本 1 的全部字段，另加四个必填字段，记录派发时的卡属性：

| 字段 | 取值 |
| --- | --- |
| `line` | 交付线 ID：小写字母开头，只含小写字母、数字与 `-`。线归属表中的线 ID 或 `integration` |
| `nature` | `design`、`contract`、`impl`、`integration` 或 `baseline` |
| `contractChange` | `none`、`additive` 或 `breaking` |
| `milestone` | 派发时 Issue milestone 的标题。Issue 没有 milestone 时为 `null` |

缺字段、取值不合格或有其他字段时拒绝。`line` 是否登记在线归属表中不由解析判断，由属性发现报告。属性的规则归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)。已派发的 attempt 在交付前不改 binding 版本。新 attempt 用版本 2。

授权评论中的 `task`、context 中的 binding 与 Issue 正文用同一个解析。context 的 `schemaVersion` 仍为 1。

taskBase 是开工固定 SHA，同步目标分支不改变它。work branch 必须以 responsible 加 `/` 开头。dispatch 是下述 dispatch 决定的真实评论 URL。用现有单调度者发放权限、原正文单写者维护绑定；worker 不争写摘要。

在具名工作分支执行：

```json
{
  "kind": "start",
  "authority": "真实评论URL",
  "issue": "真实IssueURL",
  "revision": 1,
  "attempt": "实际attempt"
}
```

`register` 与 `start` 同一准入。两者只读取目标任务闭包、授权卡完整评论和目标任务 Project 状态，不枚举仓库历史或全 Project items。闭包最多 32 个 Issue、8 个边层级，独立授权卡计入总数。必需页、条件解析或配置字段不完整时拒绝。Stage 已确认且完整读取后未设值时，`null` 合法。

准入核对卡的 revision、attempt、分支、taskBase 是 HEAD 的祖先、写范围与开工条件，拒绝已关闭的卡。route 的轨道必须在 registry 中为 active，并且通过上游链核对。上游链从这条轨道开始，沿 registry 的 `parent` 到 `main` 为止。链上的轨道必须满足下列条件：

- 已在 registry 中登记，状态为 active 或 paused。
- 分支存在于远端。
- registry 的 `parent` 与可信来源一致。可信来源先取远端起点标签 `omne/gate/track/<ID>`，没有标签时取 `github-gate` 上的 `gate/cutover.json`。

工具只从远端读取链上的分支、起点标签和该文件。链外条目不影响开工。精确条款见 [SPEC](SPEC.md#上游链核对)。

创建 context 前双读相关输入，变化则拒绝写入。新 context 的 `targetBase` 是开工时读到的远端目标分支提交，`operation` 为 `null`，不写 `anchor`。

执行失败不创建部分 context。已有同绑定 context 时照原样返回；另一绑定须明确新树。离线 delivery capture 可作观察，不作派发资格。

准入成功后，`start` 与 `register` 向标准错误报告本卡的属性发现，每条一行 JSON，带 `"severity":"report"`。例如：

```json
{"severity":"report","issue":"https://github.com/owner/repo/issues/1","code":"label-drift","clause":"line:","message":"line: 标签应为 line:model，实为 无。"}
```

发现只报告，不拒绝开工，不改变标准输出、context 与退出码。版本 1 的 binding 报告 `binding-v1`。线归属表读不到时只报告一行 `attribute-rules-unavailable`。代码表见[交付观察说明](../delivery/README.md#属性发现)，精确条款见 [SPEC](SPEC.md#授权与开工) 的 I16。

## 同步目标分支

任务执行期间同步目标分支分两步：

1. 在工作分支上用普通的 `git merge` 合并远端目标分支的提交 T，解决冲突并提交。
2. 运行 task-sync，`target` 为 T 的 40 位提交号：

```json
{ "kind": "task-sync", "target": "T 的完整提交号" }
```

命令在下列条件全部满足时，把 context 的 `targetBase` 原子更新为 T，其他字段不变：

- 本工作树已绑定任务，context 可读。
- 远端目标分支可读，T 是它的当前提交或祖先。
- T 是本地提交，并且是当前 HEAD 的祖先。
- 当前 `targetBase` 是 T 的祖先。`targetBase` 只能前进。
- 工作树没有未提交的改动，未跟踪文件也算改动。

任一条件不满足就拒绝，context 不变。T 等于当前 `targetBase` 时命令成功，不改文件。命令输出更新后的 context。

## 条件

交付条件表允许第七列 `适用目标`，六列表默认 all。integration 支持 all/track/main/stable 或完整 `refs/heads/main`、`refs/heads/stable`、`refs/heads/integration/ID`。指向未登记轨道的条件拒绝。进入 main 前的条件只阻 main；work→track 可先完成。start/acceptance 保持 all，最终“main 包含本结果”写 acceptance，避免运输自锁。

派发决定的 confirmations 绑定每个 start 条件的当前摘要 `conditionDigest(condition)`。没有这些真实确认就不能开工。

## 真实授权评论

URL 为 policy `repository` 中的 Issue comment。工具固定只读 `gh api GET`，核对评论所在 Issue、评论 URL 与采集时内容一致。评论作者须是 `publish` environment 的 required reviewer：个人 reviewer 按 login 与 node ID 匹配，team reviewer 按 active 成员身份匹配。author_association 不授予权。云端会话读不到 environment，云端会话的派发资格由下节的 workflow 事实给出。

评论中放一个 `json omne-integration-authority:v1` 区块，只支持 `dispatch` 一种 action。字段为 schemaVersion=1、action、responsible（须等于评论作者）、basis（非空依据数组）、task（完整 binding）和 confirmations（每项 issue/condition/digest/evidence）。精确运行时 schema 归 [authority.ts](authority.ts)，其他字段拒绝。

撤销评论用 `json omne-integration-revocation:v1`，字段为 schemaVersion、`decisions`（被撤销决定 URL 的数组）与 basis。出现适用撤销则拒绝，需新的派发决定。完整撤销治理仍由交付协议拥有。

## 云端会话

Claude Code 云端会话的代理拦截 GraphQL、`orgs/…` 路径与 `environments` 读取，所以云端不能直接读取派发资格和 Project。在云端，`start` 与 `register` 先派发 `github-gate` 上的 `delivery-facts` workflow。workflow 以交付身份读取派发资格、任务的 Project membership 与 Stage，并在任务卡上发一条含 `json omne-delivery-facts:v1` 区块的评论。工具核对这条评论和产生它的运行，然后用这份事实完成两次准入采集。

事实来源按环境变量选择：

| 变量 | 取值 | 结果 |
| --- | --- | --- |
| `OMNE_DELIVERY_FACTS` | `workflow` 或 `direct` | 按取值选择，覆盖自动识别。供测试与排障使用 |
| `OMNE_DELIVERY_FACTS` | 其他值，包括空串 | `input-error`，不读平台 |
| `CCR_AGENT_PROXY_ENABLED` | `1`，且没有设置 `OMNE_DELIVERY_FACTS` | 使用 workflow 事实 |
| `CCR_AGENT_PROXY_ENABLED` | 其他值或未设置，且没有设置 `OMNE_DELIVERY_FACTS` | 直接读取 |

使用 workflow 事实时：

- 运行 `start` 的身份须能派发 `delivery-facts.yml`，并能读取任务卡评论与 Actions 运行。
- 命令最多等待 180 秒，约每 5 秒读取一次。
- 工具不发 GraphQL 请求，也不读 `environments` 或 `orgs/…` 路径。
- 任一核对不满足、超时或读取失败时，命令以 `unknown` 失败，不写 context。事实显示派发评论作者不是 reviewer 时以 `refused` 拒绝，与本地路径相同。
- workflow 失败时不发评论，命令在 180 秒后以超时失败。要看失败原因，读 `github-gate` 上的 `delivery-facts` 运行记录。

全部核对条件和已知限制见 [SPEC](SPEC.md#云端事实来源)。其中两项限制直接影响使用：

- Stage 只取一次快照，云端无法检测两次采集之间的 Stage 变化。
- workflow 读取之前对派发评论的编辑不检查，与本地相同。workflow 读取之后的编辑会让开工以 `unknown` 失败。

## 持续验证

在 `tools/dev-flow` 下运行：

```sh
pnpm exec vitest run tests/integration-*.spec.ts
pnpm run typecheck
```

测试文件为 `integration-attributes`、`integration-boundaries`、`integration-cloud`、`integration-context`、`integration-delivery-facts`、`integration-engine`、`integration-sync`、`integration-transport` 与 `integration-upstream` 九个 `.spec.ts`。它们用临时真实 Git（含 bare 远端）和受限的 GitHub 响应。`integration-delivery-facts` 用注入的时钟、睡眠与 nonce 驱动云端事实的等待与核对。`integration-cloud` 用模拟云端代理的 `gh` 驱动完整的云端开工。真实仓库检查、fixture 检查、平台部署及宿主加载分别报告，不能互相代替。

网络读取使用 policy 的 `timeouts.networkMs`，`timeouts` 不接受其他字段。fetch 仅在本地缺对象时执行。远端读取失败或超时为 `unknown`。
