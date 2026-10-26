# 观察 GitHub 交付结构

检查器生成偏离、unknown、uncovered 与属性发现报告。报告帮助负责人定位下一项核对，不授予 Ready、认领或接受权限。公开行为及限制归[SPEC](SPEC.md)。

## 从离线采集读取

在仓库根运行以下命令。配置须为`github-delivery-config@2`、协议2，采集须为`github-delivery-capture@1`、协议2，包含原始正文和各层完整性。输出报告为`github-delivery-report@5`、协议2。TaskBinding 接受版本1与版本2。旧配置、协议1采集与版本1/2/3/4报告输入退出2，不转换。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

再次观察时，用 `--baseline tmp/<task>/previous-report.json` 比较。同仓库、Project与口径才能比较。读取不全时，工具不会把未读到的旧项计为已解决。

属性发现使用本检出中的 `docs/engineering/delivery-lines.json` 与 `docs/engineering/integration-policy.json`。用 `--lines <file>` 与 `--registry <file>` 指定其他文件。这两个文件读不到或不合格时退出2。

## 显式读取 GitHub

先在交互环境配置 `gh` 的仓库与 Projects 读取权限。工具不读取或打印 token。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/cli.ts \
  --config docs/engineering/github-delivery.json \
  --live \
  --save-capture tmp/<task>/capture.json \
  --report tmp/<task>/delivery-report.json
```

输出父目录须已存在。采集与报告可能含私有项目内容，应留在获准任务目录。工具仅查询配置仓库，不执行正文引用的命令或查询其他仓库。

## 任务准入读取

integration 的 `start`、`register` 使用专用准入采集。它只读取任务依赖闭包、授权卡完整评论及目标任务的 Project 状态。最多 32 个 Issue、8 个边层级，独立授权卡计入总数。必需读取不完整时拒绝准入。Stage 字段已确认且完整读取后未设值时，Stage 为 `null`。

`start` 与 `register` 另要求卡有唯一的 `kind:` 标签、唯一的 `line:` 标签与里程碑，缺任一项时拒绝并逐项列出缺项。判断由 [protocol.ts](protocol.ts) 的 `dispatchFieldGaps` 给出，派发命令用同一判断。属性发现仍只报告，见下文。

上述 `--live` 全库观察命令及报告范围不变。专用采集不用于离线报告、baseline 或发布检查。详细边界归 [SPEC](SPEC.md#任务准入采集)。

## 阅读结果

先看 `completeness` 和采集错误，再看 `stock`、`cards` 与 `findings`。`declaredDecisions` 是评论声明。`acceptance:unknown` 表示有权者仍需核对权限、结果范围和撤销链。

`graph.cycles` 给出已知阶段等待环。空数组只表示已读子图未发现环。`delta.notComparable` 表示口径改变或读取不足，不能计为改善。

正常观察退出0。错误输入退出2。偏离不自动阻断交付。`enabled:false` 可以预备读取，但不能派发日常任务。正式配置保持未启用。长期产品与场景由[产品模块](../../../repo-toolchain/src/product/SPEC.md)独立发现；普通任务沿共同交付协议独立维护本次身份、范围和结果。平台启用、默认分支模板和实际宿主执行仍未由离线检查覆盖。

## 属性发现

报告的 `attribute` 类别列出开放交付卡的属性发现。属性规则归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)，线与轨道归[多层分支集成](../../../../docs/engineering/integration.md#交付线)。属性发现只报告，不计入 `deviation`，不阻止开工。`stock.attribute` 是这一类的数量。

| 代码 | 意义 |
| --- | --- |
| `attribute-missing` | 「身份与责任」缺少交付线、性质或契约变更，或仍是占位。Issue 没有 milestone 时条款为 `milestone` |
| `attribute-invalid` | 属性取值不在允许值中，字段重复，组合不合法（条款以「合法组合:」开头），或 binding 的交付线不在线归属表中 |
| `attribute-binding-drift` | 版本2 binding 的属性与正文不同，或 binding 记录的里程碑与 Issue 现在的 milestone 不同 |
| `nature-route-mismatch` | route 的轨道不是本卡应进入的轨道，或 `integration` 卡的 route 不符合跨线写入的规则 |
| `scope-outside-line` | 线内的卡写其他线的路径，`contract` 卡写契约成员以外的路径，或 `baseline` 卡有仓库写范围 |
| `scope-integration-path` | 线内的卡写联调轨道拥有的路径，包括表中没有列出的路径 |
| `condition-cross-line` | 线内的卡的交付条件引用其他线的卡，或 `baseline` 卡的「交付条件」不是「无」 |
| `label-drift` | `line:`、`nature:` 或 `contract:` 标签与正文属性不同 |
| `binding-v1` | binding 为版本1，不含属性 |

正文的属性是判断的依据。route 与写范围的发现需要 binding。写范围中的 `tmp` 与线归属表的 `shared` 路径不计入归属。`integration` 卡不检查写范围归属。

## 线归属表校验

`pnpm run check:lines` 校验 `docs/engineering/delivery-lines.json`：线 ID 唯一且不为 `integration`，路径归属不重叠，每个工作区成员恰好属于一条线或 `integration.paths`，契约成员是本线路径下的工作区成员，线轨道已在 registry 登记、状态为 active 或 paused、上游是联调轨道。每处错误输出一行，带表中的 JSON 路径。有错误时退出1，输入读不到时退出2。`scripts/check.sh` 每次运行它。

## 标签同步

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/labels-cli.ts --issue <N> [--apply]
```

命令经 `gh api` 读一张卡，按正文属性算出 `line:`、`nature:`、`contract:` 三族标签的目标集合，向标准输出写增删差异。契约变更为 `none` 时目标中没有 `contract:` 标签。不读 Project。

加 `--apply` 时只增删这三族标签，其他标签不变。然后命令再读一次卡，核对三族标签等于目标集合，结果写在 `readback` 与 `verified` 中。

- 正文属性缺失或不合格时退出2，不改标签。
- 某次写入失败时退出2，消息给出失败的是第几次写入。之前的写入已生效，重试前先再读一次卡。
- 读回与目标不同时退出1。

`--config` 与 `--lines` 指定交付配置与线归属表，缺省为本检出中的文件。

## 写范围求交

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/scope-cli.ts <卡号或 binding 文件>...
```

命令读取每张卡的 binding 的 `writeScope`，两两求交，只读，不写平台。参数是纯数字或 `#` 加数字时按卡号经 `gh api` 读 Issue 正文中唯一的 binding 区块，其他参数按文件读。文件可以是一个 binding JSON 对象，也可以是只含一个 binding 区块的文本，例如保存下来的 Issue 正文。派发前还没有写进 Issue 的 binding 用文件传入。

- 两项写范围相同，或一项是另一项下面的路径，即为交集。`tools/dev` 与 `tools/dev-flow` 不相交。
- `tmp` 下的路径与线归属表 `shared` 中的路径不计入，规则与属性发现相同。
- 已关闭的卡不再写入，默认不参与求交，卡号列在 `excluded`。加 `--include-closed` 时关闭的卡也参与。文件参数没有 Issue 状态，总是参与。
- 标准输出是 JSON：每张卡计入与不计入的路径、`excluded`，以及冲突对 `conflicts`。每个冲突对另向标准错误写一行。
- 没有交集退出0，有交集退出1。卡没有 binding、文件不合格、同一张卡给了两次、读不到 GitHub 时退出2。

`--config` 与 `--lines` 指定交付配置与线归属表，缺省为本检出中的文件。经 `pnpm --filter @omne-harness/dev-flow run scope-overlap` 运行时，文件参数相对 `tools/dev-flow` 解析。

## 里程碑命令

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/milestone-cli.ts create <名称> --due <YYYY-MM-DD> [--description <文字>]
node --experimental-strip-types tools/dev-flow/src/delivery/milestone-cli.ts carry --from <A> --to <B> --reason <原因> <卡号>...
```

`create` 经 `gh api` 建一个开放的里程碑。截止日按 UTC 正午提交，所以 UTC-11 到 UTC+11 的时区看到的日期相同。命令读回截止日，与 `--due` 不同时退出1。同名里程碑已存在且截止日相同时直接返回，不写入。同名而截止日不同时退出2，命令不改已有里程碑的截止日。

`create` 不建 Project 视图。输出的 `manualSteps` 列出在网页上为新里程碑建 Board 视图的步骤：过滤为 `milestone:"<名称>"`，列字段选 Status，泳道选 Line。

`carry` 把每张卡从里程碑 A 移到 B，并在每张卡上发一条流转评论。评论第一行是 `<!-- omne-milestone-carry:v1 {"from":"A","to":"B"} -->`，然后写流转的两个里程碑、`--reason` 的原因，以及 binding 不变的说明。卡本来就在 B 时，评论写明本卡已在 B、本次运行未移动。补跑时会出现这种评论：上一次运行改里程碑（PATCH）成功、发评论失败，重跑只补发评论。只有第一行是这个标记的评论才算流转评论。选项的值不能以 `--` 开头。命令不改 binding，也不升交付修订。

- 第一次写入前读全部卡。有卡不在 A 也不在 B、是 PR、或 A 与 B 有一个不存在时退出2，不写入。
- 卡已在 B 时不再改里程碑。卡上已有同一 A 到 B 的流转评论时不再发。所以写入中途失败后，原样重跑同一命令即可补完。
- 某次写入失败时退出2，消息给出失败的是第几次写入，之前的写入保留。
- 写入后再读每张卡的里程碑，结果写在 `readback` 与 `verified` 中。有卡读回不是 B 时退出1。

版本2的 binding 记录派发时的里程碑。carry 之后，属性发现报告 `attribute-binding-drift`，流转评论说明原因。

## 看板字段写入

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts <dispatched|delivered|integrating|accepted> --issue <N> [--date <YYYY-MM-DD>] [--dry-run]
```

命令在一张卡的 Project 条目上写一个事件的字段，再读回核对。字段 ID、选项 ID 与看板设置都只登记在[交付配置](../../../../docs/engineering/github-delivery.json)：`project.fields` 的看板字段、`project.options` 的 Stage 与 Line 选项，以及 `board` 项的时区与各事件启用的写入。代码只读键名。

| 事件 | 写入的字段 | 谁在何时运行 |
| --- | --- | --- |
| `dispatched` | Dispatched at、Line、Kind、Wave | `start` 新建 context 后自动写入。自动写入失败时调度者补写 |
| `delivered` | Delivered at，Status 改为 In review | 调度者在执行者交回候选 PR 时 |
| `integrating` | Status 改为 Integrating | 候选通过准入、经 gate 进入轨道时，在合入之前。一波并行的卡由集成节点运行 |
| `accepted` | Accepted at、Cycle days，Status 改为 Accepted | 调度者在接受决定读回后 |

- 日期缺省为运行时刻在 `board.timeZone` 时区中的日期，现为 UTC。`--date` 用于补写。
- Line 取版本2 binding 的交付线，没有时取正文「身份与责任」的交付线。Line 没有对应的选项时跳过这一项，写在 `skipped` 中。
- Kind 取卡上唯一的 `kind:` 标签。卡没有或有多个 `kind:` 标签、或 Kind 没有对应的选项时跳过。
- Wave 记录卡所属的波。交付配置的 `fields.iteration` 是这个字段，它在 Project 中是迭代类型，调度者在派发前把本波的迭代起止配成覆盖本波的派发时间。命令先读该字段的迭代表，取起止范围包含写入日期的迭代；几个迭代都包含这一天时取配置顺序中的第一个。没有这样的迭代时跳过，不猜测。Wave 与 Dispatched at 一样，已有值时不覆盖，所以同一张卡的新 attempt 不改 Wave。
- Dispatched at 已有值时不覆盖，这一项写在 `skipped` 中。同一 attempt 在新工作树重跑 `start` 不改开工日期。
- Cycle days 是 Accepted at 减 Dispatched at 的天数。Dispatched at 为空、不是合法日期或晚于接受日时跳过。
- `board.events` 列出每个事件启用的写入。从列表删掉一项即关闭它。删掉整个 `board` 项即关闭全部看板写入，`start` 也不再写。
- 运行一个没有启用写入的事件（或没有 `board` 项）时，命令不读平台，退出2。
- 每个字段一次 `updateProjectV2ItemFieldValue` 请求。某次写入失败时退出2，消息给出失败的序号，标准错误的 JSON 同时带 `skipped`，之前的写入保留。读回与写入值不同时退出1。
- `--dry-run` 读条目并输出计划写入，不写。输出的 `applied` 为 false，没有 `verified`，退出0。
- 卡不在配置的 Project 中时退出2。命令不把卡加入 Project。
- 云端会话的代理拦截 GraphQL，命令在云端直接退出2。云端的判断与 `start` 相同：`OMNE_DELIVERY_FACTS=workflow`，或没有设置它而 `CCR_AGENT_PROXY_ENABLED=1`。云端改 Stage 用 `delivery-stage`，日期字段留待本地会话补写。

`gh` 需要 Projects 的读写权限（`gh auth refresh -s project`）。Status 是 Stage 字段，只由本卡的调度者写入，规则见[交付操作](../../../../docs/engineering/agent-delivery.md#4-推进和更新状态)。命令不判断接受是否有效。

## 派发命令

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts post --spec <spec.json> --text <prose.md> [--out <binding.json>] [--root <检出>] [--dry-run] [--force]
node --experimental-strip-types tools/dev-flow/src/delivery/dispatch-cli.ts bind --binding <binding.json> [--worktree <路径>] [--dry-run]
```

调度者用这两个命令派发一张卡的一个 attempt。`post` 发派发评论，`bind` 把 binding 写进卡的正文。两步之间不改卡。

`spec.json` 只写调度者的决定，字段全部必填，多余字段拒绝：

| 字段 | 内容 |
| --- | --- |
| `issue` | 卡号 |
| `attempt`、`responsible`、`branch`、`taskBase`、`writeScope`、`route`、`completionTarget` | binding 的同名字段 |
| `basis` | 授权依据 URL，写进评论的 `basis` 与 binding 的 `authorization` |
| `confirmations` | 每个 start 条件一项：`{"condition": "<条件ID>", "evidence": "<确认依据>"}` |

交付修订、交付线、性质、契约变更、里程碑与条件 ID 由命令从卡上读取，不由 spec 给出。每个 start 条件的摘要由命令按卡上现行的条件行计算。所以条件行改过之后重跑 `post`，摘要随之更新。

`post` 在写平台之前完成下列核对，任一不满足时退出2，不写入：

1. 在 `--root` 检出（缺省为当前目录）中读 taskBase 提交里的 policy、交付配置与线归属表。这些就是 `start` 将读的文件。taskBase 须已在本地，否则先 fetch。taskBase 的 dev-flow 不能读版本2 binding 时拒绝。
2. `gh api user` 的登录名须等于 `responsible`，因为 `start` 要求派发评论的作者等于 `responsible`。
3. 卡须开放，有唯一的 `kind:` 标签、唯一的 `line:` 标签与里程碑，与 `start` 的拒绝条件相同。
4. 卡的准入采集没有协议偏离。采集与 `start` 相同，也确认卡在配置的 Project 中。
5. 正文属性与交付修订合格。每个 start 条件都有 `confirmations` 一项，`confirmations` 不引用卡上没有的条件。
6. 卡上没有派发同一修订与 attempt 的评论。有时拒绝并给出那条评论，避免重跑时重复派发；确需重发时加 `--force`。
7. 拟写的 binding 没有属性发现：路线、写范围归属、跨线条件与 `line:`、`nature:`、`contract:` 标签都与正文一致。标签不一致时先用标签同步命令改正。

核对通过后，`post` 先发一条占位评论，再把它改成正式派发评论。正式评论是 `--text` 的文字加上 `omne-integration-authority:v1` 区块，区块中 binding 的 `dispatch` 是这条评论自己的 URL。改写成功后，命令先向标准错误写一行 `{"kind":"dispatch-posted","dispatch":…}`，再按 `--out` 把 binding 写进文件，供 `bind` 使用；写文件失败时退出2，消息给出派发评论 URL。然后读回评论。读回与写入不同时退出1。读回失败时退出2，消息给出已发的派发评论 URL，不要再派发一次。改写占位评论失败时，错误消息给出占位评论的 URL。调度者改写或删除它，再重新派发，命令不重试。`--dry-run` 完成全部核对，输出拟写的 binding 与评论正文，`dispatch` 为占位 URL，不写平台。

`bind` 读卡，把「分支、基线与task context」小节整体换成一行派发说明与 binding 区块。说明中的 revision、attempt 与 taskBase 取自 binding，不手写。只在「认领与派发」小节内，「派发情况」一行改为指向派发评论，给出 `--worktree` 时「工作树」一行改为该路径；其他位置的同名行不改。binding 的 `dispatch` 仍是占位 URL、正文没有唯一的这一小节、或新正文的唯一 binding 读回与输入不同时退出2，不写入。写入后命令再读一次卡核对 binding，结果写在 `verified` 中，不符时退出1。`--dry-run` 输出新正文，不写入。`bind` 只写版本2 binding。

## 事件等待

线会话与集成节点用这组命令阻塞在 GitHub 事件上。命令不轮询 API。

先启动接收器。它在本机监听，把 GitHub 事件追加到事件文件。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/events-receiver-cli.ts serve --port <端口> [--file <事件文件>] [--repo <owner/name>] [--secret <s>]
```

- `--file` 缺省为工作树根下的 `tmp/github-events/events.jsonl`。目录不存在时建立。
- `--repo` 缺省取 `git remote get-url origin`。
- 接收器只绑定 127.0.0.1，只接受 POST。给出 `--secret` 时校验 `X-Hub-Signature-256`，并以 `-S` 传给转发器。
- 接收器自己拉起并持有 `gh webhook forward`，转发 `issues`、`pull_request`、`issue_comment`。
- 启动时先删除仓库里本工具以前留下的 `cli` 类型 hook。
- 按 Ctrl-C 或发 SIGTERM 停止。接收器先停转发器，再删除这次创建的 hook。标准错误出现 `Forwarder hooks left behind` 时，到仓库设置里删除那个 hook。
- 一个事件文件只开一个接收器。

再用三条命令等待。命令一直阻塞到匹配事件出现，打印匹配的那一行 JSON，退出0。

```sh
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts issue-closed --issue <号> [公共参数]
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts pr-ready --base <分支> [公共参数]
node --experimental-strip-types tools/dev-flow/src/delivery/wait-cli.ts comment --issue <号> --marker <标记名> [公共参数]
```

- `--file <事件文件>`，缺省同接收器。
- `--timeout <秒>`，缺省不超时。超时退出3，标准错误写说明。超时不表示条件不成立。
- `--since <ISO 时间或 delivery id>`，只认之后的事件。缺省认文件里已有的全部行。
- `--repo <owner/name>`，对账用，缺省取 `origin`。
- 输出多一个 `source` 字段。`event` 表示事件文件里的行，`reconcile` 表示启动对账命中。
- `comment` 的标记名是评论第一行 `<!-- 标记名 -->` 里的词。`<!-- line-delta -->` 的标记名是 `line-delta`。
- `pr-ready` 认 `ready_for_review`，或 `opened` 且非草稿。
- 命令先读文件里已有的行，再监听文件所在目录。不起进程逐行读。文件不存在时等它出现。

接收器不在时，GitHub 不补发事件。所以每条等待命令启动时对账一次。`issue-closed` 用 `gh issue view` 看卡是否已关闭。`pr-ready` 用 `gh pr list` 看目标分支上是否已有开放且非草稿的 PR。`comment` 用 `gh api` 取 `--since` 之后的评论。已满足就立即返回，标 `source: "reconcile"`。对账读不到时命令退出2，不继续等。之后不再调用 GitHub API。

依赖：

- `gh` 2.x。
- 扩展 `cli/gh-webhook`，用 `gh extension install cli/gh-webhook` 安装。探路用的是 v0.2.0。
- 对仓库的 admin 权限，因为转发器要建立和删除 hook。

延迟：探路实测通常1至3秒，出现过一次26秒。条件刚满足就等不到事件时，用 `--timeout` 设上限。

当前没有验证的情况：私有仓库、同一仓库上并发的转发器、接收器被 SIGKILL 后残留的 hook（下次启动会删除）、真实的 `pull_request` 事件。条款见[SPEC](SPEC.md#事件等待)。

## 运行模块检查

```sh
pnpm --filter @omne-harness/dev-flow exec vitest run \
  tests/delivery-observe.spec.ts tests/delivery-github-read.spec.ts \
  tests/delivery-attributes.spec.ts tests/delivery-binding.spec.ts tests/delivery-lines.spec.ts \
  tests/delivery-labels.spec.ts tests/delivery-scope-overlap.spec.ts tests/delivery-milestone.spec.ts \
  tests/delivery-board.spec.ts tests/delivery-dispatch.spec.ts \
  tests/delivery-events.spec.ts tests/delivery-events-cli.spec.ts
pnpm --filter @omne-harness/dev-flow typecheck
```

平台边界依据 GitHub 官方的[Issue依赖API](https://docs.github.com/en/rest/issues/issue-dependencies)、[Issue API](https://docs.github.com/en/rest/issues/issues)及[GraphQL对象](https://docs.github.com/en/graphql/reference/objects)。实际远端读回仍以采集结果为准。

可选任务绑定和条件目标 scope 由 [binding.ts](binding.ts) 解析，供[集成工具](../integration/README.md)消费。旧六列表 scope 为 all；七列表最后一列是适用目标。阶段等待图尚未完整验证目标层细化，报告保留 uncovered。观察不检查 Git 是否真的达到 completionTarget，也不授发布权限。
