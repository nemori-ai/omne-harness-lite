# 使用分支集成工具

本工具为任务工作树开工、读取状态与基线，并在同步目标分支后更新目标基线。它也为提升 PR 生成说明，见[提升 PR 的说明](#提升-pr-的说明)。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。本工具不构造候选，也不验证或发布。写平台的只有下面三处，此外不写平台：

- 云端开工时，本工具派发 `delivery-facts` workflow。
- 本地开工新建 context 后，本工具尽力写看板的 Dispatched at、Line、Kind 与 Wave，见[看板字段](#看板字段)。
- 集成节点用 `gate-cli.ts wait` 批准指定环境的待确认部署，见[等待 gate 并代为确认](#等待-gate-并代为确认)。

准备工作树的命令除其中运行的 `start` 外只操作本机检出，见[准备任务工作树](#准备任务工作树)。

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

缺字段、取值不合格或有其他字段时拒绝。`line` 是否登记在线归属表中不由解析判断，由属性发现报告。属性的规则归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)。已派发的 attempt 在交付前不改 binding 版本。

`start` 用工作树中的 dev-flow 读 binding，工作树从 taskBase 开工。所以 binding 的版本由 taskBase 中的 dev-flow 决定：

- taskBase 中的 dev-flow 能读版本 2 时，新 attempt 用版本 2。
- 否则用版本 1。较早的 dev-flow 只读 `omne-integration-binding:v1` 区块，对版本 2 的卡报告 `Task binding is missing`，拒绝开工。

调度者派发前在仓库中运行下面的命令。退出 0 表示 taskBase 能读版本 2，退出 1 表示只能用版本 1：

```sh
git grep -q 'omne-integration-binding:v2' <taskBase> -- tools/dev-flow/src/delivery/binding.ts
```

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

准入核对卡的 revision、attempt、分支、taskBase 是 HEAD 的祖先、写范围与开工条件，拒绝已关闭的卡。卡缺唯一的 `kind:` 标签、唯一的 `line:` 标签或里程碑时以 `refused` 拒绝，消息逐项列出缺项，不写 context。调度者补齐后重跑即可。route 的轨道必须在 registry 中为 active，并且通过上游链核对。上游链从这条轨道开始，沿 registry 的 `parent` 到 `main` 为止。链上的轨道必须满足下列条件：

- 已在 registry 中登记，状态为 active 或 paused。
- 分支存在于远端。
- registry 的 `parent` 与可信来源一致。可信来源先取远端起点标签 `omne/gate/track/<ID>`，没有标签时取 `github-gate` 上的 `gate/cutover.json`。

工具只从远端读取链上的分支、起点标签和该文件。链外条目不影响开工。精确条款见 [SPEC](SPEC.md#上游链核对)。

创建 context 前双读相关输入，变化则拒绝写入。新 context 的 `targetBase` 是开工时读到的远端目标分支提交，`operation` 为 `null`，不写 `anchor`。

执行失败不创建部分 context。已有同绑定 context 时照原样返回；另一绑定须明确新树。离线 delivery capture 可作观察，不作派发资格。

准入成功后、写 context 之前，`start` 与 `register` 判断本卡的属性发现。新建 context 时，有拒绝的发现就以 `refused` 拒绝开工，不写 context，不写看板，退出码为 2。消息逐项写代码、条款、说明与改法，例如：

```text
Attribute findings refuse a new context (1):
- label-drift [nature:] nature: 标签应为 nature:impl，实为 无。 改法：运行 labels-cli.ts --issue <卡号> --apply，按正文同步标签。
```

拒绝全部属性代码，有两个例外只报告：

- 条款为 `binding.milestone` 的 `attribute-binding-drift`。carry 之后 binding 保留派发时的里程碑，这是预期状态。
- 版本 1 的 binding 的 `binding-v1`，只在正文的交付线为 `integration` 时只报告。线内的卡拒绝，改法是重新派发，生成版本 2 的 binding。

已有同绑定的 context 时重跑不拒绝，全部发现只报告。派发命令用同一条拒绝规则。

开工成功时，`start` 与 `register` 向标准错误报告本卡的属性发现，每条一行 JSON，带 `"severity":"report"`。例如：

```json
{"severity":"report","issue":"https://github.com/owner/repo/issues/1","code":"attribute-binding-drift","clause":"binding.milestone","message":"binding 记录派发时的里程碑 M1，Issue 现为 M2。"}
```

报告不改变标准输出、context 与退出码。线归属表读不到时只报告一行 `attribute-rules-unavailable`，不拒绝。代码表见[交付观察说明](../delivery/README.md#属性发现)，精确条款见 [SPEC](SPEC.md#授权与开工) 的 I16。

### 看板字段

`start` 与 `register` 新建 context 后，在本卡的 Project 条目上写 `board.events.dispatched` 启用的字段：Dispatched at（开工当天在 `board.timeZone` 时区中的日期）、Line、Kind（取唯一的 `kind:` 标签）与 Wave（卡还没有 Wave 时，取包含开工日的迭代）。字段 ID、选项 ID 与 `board` 项都在本次开工已读的[交付配置](../../../../docs/engineering/github-delivery.json)中。

- 交付配置没有 `board` 项、或 `board.events.dispatched` 为空时，不写也不报告。
- `board` 项的形状不合格（例如 `timeZone` 不是字符串）时，整个交付配置不合格，`start` 拒绝开工，与交付配置的其他字段相同。
- 已有同绑定的 context 时不写。Project 条目的 Dispatched at 已有值时也不覆盖，所以同一 attempt 在新工作树重跑 `start` 不改开工日期。Wave 已有值时同样不覆盖，同一张卡的新 attempt 不改 Wave。没有包含开工日的迭代时跳过，报告一行 `board-skipped`。
- 写入失败、事件启用了不属于它的写入、缺字段 ID 或时区无效、或有一项被跳过时，向标准错误写报告行，代码为 `board-write-failed`、`board-skipped` 或 `board-unverified`。报告行的格式与属性发现相同。
- 云端会话不发 GraphQL 请求，只报告一行 `board-skipped`。之后在本地会话用 `board-cli.ts dispatched` 补写。

写入只是尽力而为。任何结果都不改变 `start` 的标准输出、context 与退出码。命令与其他事件见[交付观察说明](../delivery/README.md#看板字段写入)，精确条款见 [SPEC](SPEC.md#授权与开工) 的 I18。

## 准备任务工作树

```sh
node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts prepare --issue <N> --tree <目录> [--evidence <目录>] [--root <主检出>] [--remote <名称>]
node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts swap --issue <N> --old <旧目录> --tree <新目录> [--root <主检出>] [--remote <名称>]
node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts projections [--tree <目录>]
node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts remove --tree <目录> [--root <主检出>] [--force]
```

`prepare` 与 `swap` 从卡上的 binding 取分支、派发评论、revision 与 attempt，不另给输入文件。`--root` 缺省为当前目录所属的主检出，`--remote` 缺省为 `origin`。失败时命令停在失败的一步，报告步骤名与最后几行输出，不删除已建的目录。

`prepare` 为一张已派发的卡建新工作树并在其中开工：

1. 目录已存在时拒绝。
2. fetch binding 的分支。本地没有这个分支时，新工作树建本地分支并跟踪远端分支。本地分支落后于远端时先快进到远端尖端；本地分支领先于远端或与远端分叉时拒绝。
3. 用锁文件安装依赖：`pnpm install --frozen-lockfile --ignore-scripts`。
4. 把 `--evidence` 目录复制进 `tmp/issue-<N>/`。
5. 按 `projections` 的步骤重生成 agent 投影。
6. 把 `start` 命令写进 `tmp/issue-<N>/start.json`，用新工作树自己的 dev-flow 运行 `start`。输出 context 与 `start` 写到标准错误的报告行。

`swap` 在同一分支上换一棵树给新 attempt，不删除旧树。旧树有未提交的已跟踪改动、不在 binding 的分支上、或有远端分支没有的提交时拒绝；命令不代为推送。然后命令把旧树的 `tmp/issue-<N>/`（不含 `agents-stage` 开头的目录）复制到系统临时目录，让旧树 `git checkout --detach` 释放分支，再按 `prepare` 从远端尖端建新树并恢复这份副本。旧树中 `tmp/issue-<N>/` 以外的未跟踪与被忽略路径列在输出的 `warnings` 中，原样保留。

`remove` 删除一棵工作树。旧树有未提交的已跟踪改动时总是拒绝。不加 `--force` 时只列出删除会丢掉的未跟踪与被忽略路径，退出1，不删除。加 `--force` 时运行 `git worktree remove --force`。删除前按[工作约定](../../../../docs/engineering/workflow.md)确认清理条件与授权。

`projections` 从本树的 `.meta_harness/agents` 重生成投影：编译到新的临时目录，按内容复制进 `.meta_harness/`，重建根软链接，去掉三份 Cursor 运行时文件的组写权限，最后运行 `pnpm run check:agents`。同步合并之后、准入之前一律运行它：候选自己没改 agent 源时，合并进来的轨道头也可能带别的卡的改动。需要 `uv`、`rsync` 与 `pnpm`。

## 等待 gate 并代为确认

```sh
node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note <说明文件> [--environments <名称,...>] [--interval <秒>] [--timeout <分钟>]
```

命令轮询一次 workflow 运行，缺省每 10 秒一次、最多 90 分钟。每一轮，命令把当前待确认、环境名在 `--environments` 中、且当前身份可以批准的部署用说明文件的内容一次批准；下一轮再批准那时仍待确认的部署，不因某个环境批准过就跳过。`--environments` 缺省为 `publish`。工具链变更闸门等其他审批环境须显式列出，例如 `--environments repo-toolchain-review,publish`。运行结束时输出结论：`success` 退出0，其他结论退出1。超时、读取失败或批准失败时退出2。

说明去掉首尾空白后不能为空，最多 1024 个字符，这是 GitHub 保留的上限。超过时命令在发出任何请求之前退出2。详细说明写进卡上的评论，说明里给出评论链接。命令不判断当前身份是否获授权代为确认：只在该 admin 授权本次确认之后运行，说明中写明代为确认的人。

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

## 提升 PR 的说明

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts ri-notes --track <轨道 ID> [--root PATH] [--format json|markdown]
pnpm run ri-notes --track <轨道 ID>
```

命令读源轨道上游不包含的 first-parent 提交、它们的 unit 记录与 PR 正文，汇总各 PR 声明的「所含的卡」与「契约变化」。上游按起点标签与切换点确定，与 gate 相同。

- 缺省把 JSON 写到标准输出，含逐提交的 unit 与 PR、汇总的卡、契约变化、发现与 Markdown。
- `--format markdown` 只把两节写到标准输出，供贴进提升 PR。发现逐条以 JSON 行写到标准错误，最后一行是汇总。
- `ri-notes --help` 输出用法。

命令只读，只报告。发现不改变退出码，也不进入 `pnpm run check`。远端 Git 读不到、`gh` 不能运行或 `gh` 的错误响应没有 JSON 正文（例如未认证）时，命令失败并退出 2。

贴进 PR 之前，先处理发现：

- `pr-section-missing`、`card-inferred`、`card-unresolved`：PR 没有声明卡。推测的卡的条件写「待确认」，按卡的实际条件改写。推测不出的卡手工补行。
- `unit-missing`：核对下限之后的提交没有 unit。gate 会拦住这次提升，按[现行准入](../../../../docs/engineering/integration.md#现行准入)闭合缺口。
- `unit-invalid`、`unit-target-mismatch`：unit 记录不合格或不属于这条轨道。下限之前的提交也报告。
- `lower-bound-unknown`、`lower-bound-not-ancestor`、`parent-registry-drift`：轨道的核对下限或上游登记有问题。
- `card-other-line`、`card-line-unknown`：卡的交付线不属于这条轨道，或卡没有登记交付线。
- `contracts-unknown`：有提交的契约变化未知，「契约变化」有一行 `- 待确认：…`。JSON 的 `contractGaps` 列出这些提交与原因。逐个核对后改写本节。原样贴进 PR 时，上一层的 `ri-notes` 仍把这个 PR 计为未知。
- 其他 `contract-*` 与 `cards-*`：两节的行格式、路径或级别有问题。

命令用 dev-flow 依赖里钉住的 `omne-contract-api --diff <合并点> --json` 核对「契约变化」。这个命令拿合并点上的契约 API 快照与工作树的快照比较，还读工作树的配置、线归属表、成员的 `package.json`、tsconfig 与已安装的类型。所以只在下列条件都成立时运行：

- 检出的 `HEAD` 等于轨道头。
- 工作树没有未提交改动或未跟踪文件。被 `.gitignore` 忽略的文件不算。

核对完成时，JSON 的 `contractCheck.kind` 为 `checked`，快照差异与声明不符的成员各报一条 `contract-diff-mismatch`。核对没有完成时，`contractCheck.kind` 为 `unavailable`，`reason` 写明原因：HEAD 不对、工作树有改动、Git 读取失败、找不到 `omne-contract-api`、超时、进程出错（附错误码）、退出码与标准错误、输出解析失败、输出的基线不是合并点，或快照差异不可得的成员。成员在合并点或工作树上没有快照、快照读不出时，整个核对为 `unavailable`，不把这些成员当作没有变化。`--format markdown` 模式的 `contractCheck` 在标准错误的汇总行里。超时取 policy 的 `timeouts.networkMs`。全部发现代码与精确条款见 [SPEC](SPEC.md#提升-pr-的说明) 的 I17。

## 持续验证

在 `tools/dev-flow` 下运行：

```sh
pnpm exec vitest run tests/integration-*.spec.ts
pnpm run typecheck
```

测试文件为 `integration-attributes`、`integration-board`、`integration-boundaries`、`integration-cloud`、`integration-context`、`integration-delivery-facts`、`integration-engine`、`integration-contract-diff`、`integration-ri-notes`、`integration-ri-source`、`integration-sync`、`integration-transport`、`integration-upstream`、`integration-worktree`、`integration-gate` 与 `integration-dispatch` 十六个 `.spec.ts`。`integration-worktree` 用记录步骤的替身覆盖 `prepare`、`swap`、`projections`、`remove` 的步骤顺序与拒绝。`integration-gate` 用按轮次应答的 GitHub 替身覆盖 `gate-cli wait` 的环境过滤、每轮批准、说明长度与超时。`integration-dispatch` 用派发命令写出的评论驱动一次真实 `start`。`integration-contract-diff` 在临时真实 Git 检出里运行安装的 `omne-contract-api`。它们用临时真实 Git（含 bare 远端）和受限的 GitHub 响应。`integration-delivery-facts` 用注入的时钟、睡眠与 nonce 驱动云端事实的等待与核对。`integration-cloud` 用模拟云端代理的 `gh` 驱动完整的云端开工。真实仓库检查、fixture 检查、平台部署及宿主加载分别报告，不能互相代替。

网络读取使用 policy 的 `timeouts.networkMs`，`timeouts` 不接受其他字段。fetch 仅在本地缺对象时执行。远端读取失败或超时为 `unknown`。
