# 分支集成工具行为契约

本工具承担任务工作树的开工准入、状态读取、基线与 task-sync，为提升 PR 生成说明（`ri-notes`，只读；契约的三个代码让它退出 1），为 `pnpm run check` 核对契约快照与 dist（I22），并为集成节点准备任务工作树（I20）和等待 gate 运行（I21）。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。采用、本机发布与旧建轨道命令及其条款已按 [RFC-0009](../../../../docs/rfcs/RFC-0009-adoption-and-local-tool-retirement.md) 删除，原 I01、I02、I04、I05、I07、I09、I10、I11 随之删除。保留条款沿用原编号。

本模块兑现[多层分支规则](../../../../docs/engineering/integration.md)。公开类型及输入解析归本目录源码，命令用法归 [README](README.md)。以下承诺约束实现。

## 任务与 policy

I03。任务事实来自现有 Issue 的唯一 binding JSON 区块：版本 1 用 `omne-integration-binding:v1` 标记，版本 2 用 `omne-integration-binding:v2` 标记，标记版本等于 `schemaVersion`。精确格式归 delivery/binding.ts。当前 revision 和 attempt、身份、责任、路线、taskBase 与写范围必须匹配。context 仅缓存事实。平台 Stage、关闭及交付接受不由本模块写入。

policy 固定读当前 HEAD 提交中的 `docs/engineering/integration-policy.json`。HEAD 中没有该文件时为 unknown。`parsePolicy` 只接受 `schemaVersion`、`revision`、`repository`、`deliveryConfig`、`tracks`、`transport` 与 `timeouts`，`timeouts` 只接受 `networkMs`，已删除或未知的字段拒绝。轨道条目只接受 `id`、`branch`、`owner`、`source`、`status`、`parent` 与 `initialBase`，全部必填；`status` 取 active、paused、retiring 或 retired。`parent` 取 `main` 或另一条轨道的 ID，不能等于本条目的 `id`。轨道 ID 不能是 `main`、`stable`、`release` 或 `github-gate`。`branch` 必须等于 `integration/<id>`，上游链核对据此由 ID 得到分支名、起点标签名与切换点的键。`initialBase` 是轨道在上游上的起点提交。解析只核对各条目自身的格式，不核对 `parent` 指向的条目是否已登记；上游链由开工时核对，只影响本次 route。`status` 与 task-sync 按登记读取任何状态的轨道，未登记的轨道拒绝。

## 路线与目标分支

route 的形状归 delivery/binding.ts：

- `{kind:"track", track:ID}`：目标分支是该轨道的 `integration/<ID>`。
- `{kind:"global" | "cross-track", track:ID, owners:[受影响拥有者]}`：目标分支是具名轨道的 `integration/<ID>`。`owners` 至少一项。开工时这条轨道在 registry 中的 `parent` 必须是 `main`，即顶层轨道。

三种 route 都可以以 `track` 为 completionTarget，指 route 中的那条轨道。没有以 main 为目标分支的 route。

## 上游链核对

I14。`start` 对 route 中的轨道（下称目标轨道）及其上游链做下列核对，任一不满足就拒绝开工，不写 context。上游链从目标轨道开始，沿 registry 的 `parent` 逐级向上，到 `main` 为止。核对只针对这条链，链外的条目不影响本次开工。

1. 链上每一条轨道都已登记，否则为 refused。链上出现重复的轨道为 refused。
2. 目标轨道为 active；链上其余轨道为 active 或 paused。否则为 refused。
3. 链上每一条轨道的分支都存在于远端。分支不存在为 refused；远端读不到为 unknown。
4. 链上每一条轨道的 registry `parent` 与可信来源一致，可信来源按下列顺序确定，与 `github-gate` 流程相同：
   1. 远端有 `refs/tags/omne/gate/track/<ID>` 时，读该附注标签的正文。正文是 `omne-gate-record:v1` JSON，取 `parent` 字段；没有该字段或取值为 null 时为 `main`，与 `github-gate` 流程的读法相同。
   2. 否则读远端 `github-gate` 分支的 `gate/cutover.json`。其中登记了 `integration/<ID>` 时，可信上游为 `main`。
   3. 两者都没有为 refused。

   registry 的 `parent` 与可信上游不同为 refused。标签不是附注标签、正文不是合格 JSON、`parent` 的取值不合格，或 `gate/cutover.json` 不是以分支名为键、以提交号为值的 JSON 对象，都为 unknown。远端读不到为 unknown。

`start` 的远端读取只取链上各轨道的分支与起点标签，以及 `github-gate` 分支上的 `gate/cutover.json`，不枚举或拉取其他标签。`start` 不读核对下限。`status` 与 task-sync 不做上游链核对。[I17](#提升-pr-的说明) 的 `ri-notes` 另有读取范围，它按同一顺序确定上游。

## 两条基线

I06。task context 保存 `targetBase` 与每卡的 `taskBase`/`taskSource`。

- `targetBase` 是最近一次同步进来的目标提交，用于影响面与组合检查。开工时它是 `start` 读到的远端目标分支提交，之后只由 task-sync 前进。
- `taskBase` 在开工时固定，任何同步都不改变它。taskBase..taskSource 的逐提交审计保留已撤销的改动和合并父判断。

各检查边界通过 `@omne-harness/repo-toolchain` 的共同 loader 读取 context。全局 main 趋势仍用 main。`baselines` 有 context 时返回固定 `targetBase`，显式 base 与之不同时为 stale；没有 context 时返回显式 base。

context 的读格式不变：`schemaVersion` 为 1，`operation` 保留并写 `null`。新 context 不写 `anchor`；读取旧 context 时接受并忽略 `anchor` 键。

## 授权与开工

I08。生产授权读取真实 Issue comment。固定只读 `gh api GET` 核对 repository、评论所在 Issue、评论 URL、评论与采集时的正文、作者和更新时间一致，以及严格 action schema。唯一支持的 action 是 dispatch。评论作者须是 `publish` environment 的 required reviewer：个人 reviewer 按 login 与 node ID 匹配，team reviewer 按 active 成员身份匹配；environment 读不到或没有 reviewer 时为 unknown。使用 workflow 事实时，工具不读 environment，派发资格按 [I15](#云端事实来源) 核对。决定的 responsible 须等于作者。决定只接受 schemaVersion、action、responsible、basis、task 与 confirmations，其他字段拒绝。本地 JSON 仅作为草稿或观察。

`start` 与 `register` 的平台读取限于任务闭包、授权卡及任务 Project 状态，范围归 [准入采集](../delivery/SPEC.md#任务准入采集)。闭包包含精确 Issue 条件目标、原生 blockedBy、原生父卡及正文父卡。独立授权卡完整读取评论以核对撤销声明，不读取其无关关系。每次最多 32 个 Issue、8 个边层级，缺页、解析错误、身份不符或超限均为 unknown。

准入核对撤销声明、精确绑定、卡未关闭、工作树分支等于 binding 的分支、taskBase 是 HEAD 的祖先，以及每个 start 条件在派发决定中有当前摘要的确认。工具只核对目标卡偏离，不以准入闭包声称全仓创建标识唯一或循环覆盖。配置 Stage 字段与任务 membership 必须确认，完整读取后的空 Stage 合法。使用 workflow 事实时，membership 与 Stage 来自 I15 的事实，不读 GraphQL。

创建 context 前重新采集同一范围。摘要包括完整闭包内容、独立授权评论和任务 Stage。相关正文、评论、关系、Stage 或闭包变化均拒绝写入。无关 Issue 历史或其他 Project item 不进入读取及摘要。已有同绑定 context 时原样返回；已绑定另一任务时拒绝。context 只新建，不覆盖。

I16。准入成功之后、写 context 之前，`start` 与 `register` 判断本卡的属性发现。发现由 [delivery/attributes.ts](../delivery/attributes.ts) 的 `attributeFindings` 给出，代码表与判据见[交付观察规格](../delivery/SPEC.md#属性发现)。输入是本次准入采集中的本卡正文、标签、milestone 与条件目标卡，binding，与 policy 同一提交中的 `docs/engineering/delivery-lines.json`，以及 policy registry。

拒绝的发现由同一文件的 `attributeRefusals` 选出。派发命令用同一个函数。规则如下：

1. `REFUSING_ATTRIBUTE_CODES` 列出拒绝的代码：全部属性代码。
2. `REPORT_ONLY_FINDINGS` 列出只报告的发现，只有一项：条款为 `binding.milestone` 的 `attribute-binding-drift`。carry 之后，binding 保留派发时的里程碑，[交付协议](../../../../docs/engineering/delivery.md#契约变更与里程碑类型)把这条漂移写为预期状态。
3. 版本 1 的 binding 报告 `binding-v1`。正文「身份与责任」的交付线合格且为 `integration` 时，`binding-v1` 只报告。其余情况拒绝。版本 1 的 binding 没有 `line` 字段，所以交付线取正文。

线归属表在 policy 所在的提交（工作树 HEAD）上缺失或不合格，或读卡与计算属性时出现已知的输入错误（`IntegrationError`、`InputError`）时，属性规则不可得。其他异常照常抛出，不当作规则不可得。

新建 context 时，规则不可得以 `refused` 拒绝，消息为一项 `attribute-rules-unavailable` 与原因；有任一项拒绝的发现也以 `refused` 拒绝。不写 context，不写报告行，不写看板。消息第一行写拒绝的项数，然后每项一行：`- 代码 [条款] 说明 改法：…`。改法取 `ATTRIBUTE_REMEDIES`。CLI 把这个错误写到标准错误，退出码为 2。已有同绑定的 context 时不拒绝，全部发现只报告。

开工成功时，每条发现向标准错误写一行 JSON：`{"severity":"report","issue":卡URL,"code":…,"clause":…,"message":…}`。已有同绑定的 context、规则不可得时只写一行 `attribute-rules-unavailable`。报告不改变标准输出、context 与退出码。报告写入失败时报告丢失，命令结果不变。

I18。`start` 与 `register` 新建 context 之后，按 [delivery/board.ts](../delivery/board.ts) 的 `recordDispatch` 在本卡的 Project 条目上写 `board.events.dispatched` 启用的 Dispatched at、Line、Kind 与 Wave。看板设置取本次开工已读的交付配置（policy 的 `deliveryConfig`）中的 `board` 项与字段 ID；没有 `board` 项时不写、不报告。`board` 项的形状不合格时整个交付配置不合格，`start` 按既有规则拒绝；事件、字段 ID 与时区的语义问题只报告。已有同绑定的 context 时不写；条目的 Dispatched at 已有值时不覆盖。Line 取版本 2 binding 的 `line`，版本 1 取正文「身份与责任」的交付线。Kind 取本次采集中卡的唯一 `kind:` 标签。Wave 只在条目还没有 Wave 时写入，取 Wave 迭代字段中包含开工日的迭代，几个迭代都包含这一天时取配置顺序中的第一个，没有时跳过；同一张卡的新 attempt 不改 Wave。使用 workflow 事实时不发 GraphQL 请求，只报告 `board-skipped`。失败、跳过与读回不符按 I16 的行格式写到标准错误，代码为 `board-write-failed`、`board-skipped` 或 `board-unverified`。写入在 context 写好与属性报告之后进行，任何结果都不改变标准输出、context 与退出码。本条只写这四个字段，不写 Stage。Project 写入与时钟经 `openIntegration` 的 `board` 参数注入，缺省为 `gh` 与当前时间。

I19。准入核对之后、写 context 之前，`start` 与 `register` 用 [delivery/protocol.ts](../delivery/protocol.ts) 的 `dispatchFieldGaps` 判断本次采集中的卡：`kind:` 标签数须为一，`line:` 标签数须为一，milestone 不能为 null。任一项不满足时以 `refused` 拒绝，消息逐项列出缺项，不写 context，不报告属性发现，不写看板。已有同绑定 context 时同样先判断。本条只看标签与 milestone 是否存在，标签与正文属性是否一致归 I16。

准入的双读摘要含 Issue 的 milestone 与 updatedAt。GitHub 修改 milestone 时同时更新 Issue 的 updatedAt，所以两次采集之间修改 milestone 拒绝写入，与修改其他 Issue 字段相同。

## 云端事实来源

I15。Claude Code 云端会话的代理拦截 GraphQL、`orgs/…` 路径与 `environments` 读取。在云端，`start` 与 `register` 的派发资格、任务 Project membership 与 Stage 由 `github-gate` 上的 `delivery-facts` workflow 读取。workflow 以交付身份 `omne-harness-lite-delivery` 读取这些事实，并在任务卡上发一条评论。workflow 的读取和发回归 `github-gate` 与[多层分支规则](../../../../docs/engineering/integration.md)。本条只规定工具一侧的识别、等待、核对与采用。

### 识别事实来源

- 设置了 `OMNE_DELIVERY_FACTS` 时，按它的值选择：`workflow` 用 workflow 事实，`direct` 用直接读取。其他值（包括空串）为 input-error，工具不读平台。
- 没有设置 `OMNE_DELIVERY_FACTS` 时，`CCR_AGENT_PROXY_ENABLED` 等于 `1` 用 workflow 事实。其他情况用直接读取。
- 直接读取保持 I08 与[准入采集](../delivery/SPEC.md#任务准入采集)的读取，不派发 workflow。

### 派发与等待

1. 工具生成 nonce：加密随机的 32 位小写十六进制。
2. 工具记录派发前时间，然后以 REST `POST repos/{o}/{r}/actions/workflows/delivery-facts.yml/dispatches` 派发。`ref` 为 `github-gate`，inputs 为 `issue`（卡号字符串）、`authority`（派发评论 URL）与 `nonce`。
3. 工具以 REST 分页读取任务卡的全部评论，找出正文含 `omne-delivery-facts:v1` 与本次 nonce 的评论。还没有时，约 5 秒后再读。
4. 找到后，工具按下文核对评论和区块，再以 REST `GET repos/{o}/{r}/actions/runs/{run}` 读取区块中的运行。运行未结束时，约 5 秒后重读评论与运行。
5. 全部核对通过后，工具采用这份事实，再做两次准入采集。

从派发前时间起，总时限为 180 秒。单次请求的时限不超过 policy 的 `timeouts.networkMs`，也不超过剩余时间。

### 核对评论与区块

- 正文同时含标记与本次 nonce 的评论只能有一条。任何作者的这类评论都计数。
- 评论作者的 `login` 为 `omne-harness-lite-delivery[bot]`，`user.type` 为 `Bot`。
- 评论没有被编辑过：`updated_at` 等于 `created_at`。有写权限的协作者可以编辑他人评论，所以工具只采用 workflow 写下的原文。
- 正文只有一个 `json omne-delivery-facts:v1` 围栏区块，内容是合法 JSON。
- 区块的键只能是 `schemaVersion`、`nonce`、`run`、`issue`、`authority` 与 `project`。`schemaVersion` 为 1，`nonce` 为 32 位小写十六进制，`run` 与 `issue` 为正整数。
- `authority` 的键只能是 `url`、`author`、`authorNodeId`、`reviewer`、`bodySha256` 与 `updatedAt`。`reviewer` 为布尔，`bodySha256` 为 64 位小写十六进制，其余为非空字符串。
- `project` 的键只能是 `id`、`item` 与 `stage`。`id` 与 `item` 为非空字符串，`stage` 为非空字符串或 `null`。
- 多余的键、缺少的键和类型不符都拒绝。
- `nonce` 等于本次 nonce，`issue` 等于任务卡号，`authority.url` 等于本次派发评论 URL，`project.id` 等于交付配置的 Project ID。

### 核对运行

- `id` 等于区块的 `run`。
- `path` 为 `.github/workflows/delivery-facts.yml`，`head_branch` 为 `github-gate`，`event` 为 `workflow_dispatch`。
- `created_at` 不早于派发前时间减去 60 秒。GitHub 的 `created_at` 只精确到秒，本机时钟也可能有偏差，所以保留 60 秒容差。本次派发与事实的绑定由 nonce 承担，这一项排除更早的运行。
- `status` 不是 `completed` 时继续等待。完成后 `conclusion` 必须为 `success`。

### 采用事实

- I08 的授权核对不读 `publish` environment。工具读取派发评论（REST `issues/comments/{id}`），并核对：
  - `authority.author` 与 `authority.authorNodeId` 等于该评论作者的 `login` 与 `node_id`。
  - `authority.bodySha256` 等于该评论 `.body` 按 UTF-8 原样计算的 SHA-256。
  - `authority.updatedAt` 等于该评论的 `updated_at`。
  - `authority.reviewer` 为 `true`。
- 前三项不等时，workflow 读取之后评论被编辑过，或者 workflow 读了另一条评论。
- 两次准入采集都用事实中的 `project.item` 作为 membership，用 `project.stage` 作为 Stage 快照，不读 GraphQL。采集核对 `project.id` 等于配置的 Project ID，并且 `item` 非空。
- 使用 workflow 事实时，工具不发 GraphQL 请求，也不读 `environments` 或 `orgs/…` 路径。原生父卡按准入采集的 REST 读取。

### 拒绝

工具先核对事实绑定的是这条派发评论（URL、作者、正文摘要与更新时间），绑定不成立时结果为 unknown，不看 `reviewer`。绑定成立而 `authority.reviewer` 为 `false` 时结果为 refused：这是可信事实给出的确定答案，与直接读取时相同。其他核对不满足、超时、读取失败或区块格式错误时，结果为 unknown。两种结果下工具都不写 context。错误信息不含 API 原始输出。

### 已知限制

- Stage 只取一次快照。两次采集使用同一快照，所以云端无法检测两次采集之间的 Stage 变化。
- 区块不含 Stage 字段 ID。workflow 按自己登记的字段 ID 读取 Stage，工具不核对配置的 Stage 字段是否在 Project 中。
- 工具不检查 workflow 读取之前对派发评论的编辑。直接读取同样不检查：两条路径都核对读取时的评论内容。
- workflow 失败时不发评论。工具不能区分 workflow 失败与尚未完成，只能在 180 秒后按超时拒绝。
- nonce 作为 workflow 输入，出现在 Actions 运行记录中。别人发出含同一 nonce 的评论会让本次开工以 unknown 失败，但不能让工具采用伪造的事实。
- 候选评论按正文包含 nonce 原文筛选。这依赖 nonce 为 32 位小写十六进制：JSON 不转义这些字符。改变 nonce 格式时须同时修订筛选。

## 任务工作树与 gate 等待

I20。`worktree-cli.ts` 的 `prepare`、`swap`、`prepare-closures` 与 `projections` 只操作本机检出，不写平台，只经 `gh api GET` 读卡的 binding（`prepare-closures` 不读 binding，也不运行 `start`）。程序以固定 argv 运行，不经 shell，步骤经 [worktree.ts](worktree.ts) 的 `Runner` 注入。任一步骤非零退出时命令停止，报告步骤名与最后五行标准错误，不删除已建的目录或分支。`Runner` 的 `env` 改动子进程环境：值为字符串时设置，值为 `undefined` 时去掉该变量，Windows 上去掉时不分大小写。

- `prepare` 建好工作树之后、`swap` 开始复制任务目录之后的失败是 `WorktreeStepError`，带 `done`（已完成的步骤）、`resume`（从失败的一步接着做完的命令）与 `evidence`（任务目录副本，没有时为 undefined）。CLI 把三者写进标准错误的 JSON，`evidence` 缺时写 `null`。`resume` 按失败的位置取值：
  - `swap` 分离旧树之前失败时，为同一条 `swap` 命令。
  - 旧树已分离、新树未建好时，为带 `--evidence <副本>` 的 `prepare` 命令。
  - 新树已建好时，为剩下的安装、`projections` 与 `start`。复制证据或写 `start.json` 失败时，为删除新树再重跑 `prepare`。
- 文件系统操作的错误以 `unknown` 报告，消息写明步骤名、异常类型与消息。CLI 对既不是输入错误也不是集成错误的异常，消息写明所在阶段、异常类型与消息。从 GitHub 读卡的阶段只写阶段与类型，不写 API 原始输出。

- `prepare` 在目标目录已存在时拒绝。然后它经 `pnpmCommand` 确定 pnpm 怎样起，起不了时拒绝，不运行任何步骤、不建树。它 fetch binding 的分支；本地没有该分支时以跟踪远端分支的方式新建；本地分支是远端分支的祖先时先 `git branch --force` 到远端尖端；本地分支领先或与远端分叉时拒绝，不建树。建树之后，它先把 `evidence` 复制进 `tmp/issue-<N>/`，再把 `startInput(binding)` 写进 `tmp/issue-<N>/start.json`，替换证据里旧 attempt 的同名文件。然后它用冻结锁文件安装依赖，执行 `projections`，用新工作树中的 `cli.ts execute` 运行 `start`。`start` 失败时命令失败，带上 `start` 的标准错误行。`prepare` 不构建成员。
- `swap` 不删除旧树。它依次拒绝：旧树有未提交的已跟踪改动；旧树的当前分支不是 binding 的分支；目标目录已存在；fetch 后旧树 HEAD 不是远端分支的祖先；`pnpmCommand` 起不了 pnpm。这些拒绝都在改动旧树之前发生，命令不推送。之后它按 `swapWarnings` 报告旧树 `tmp/issue-<N>/` 以外的未跟踪与被忽略路径（git 报告的 `tmp/` 本身不报告），把 `tmp/issue-<N>/` 复制到新的系统临时目录（不含名称以 `agents-stage` 开头的目录），对旧树执行 `git checkout --detach`，再以这份副本为 `evidence` 执行 `prepare`。副本留在系统临时目录，路径在结果的 `evidence` 中，命令不删除它。确认新树已恢复后，由操作者删除副本。`swap` 不构建成员。
- `swapWarnings` 逐条列出未跟踪路径与 `REGENERABLE` 之外的被忽略路径，然后对 `REGENERABLE` 的每个类别给出一行计数，没有路径的类别不出现。`REGENERABLE` 是固定名单：最后一段为 `node_modules`、`dist`、`.turbo`、`.venv`、`__pycache__` 或 `.pytest_cache` 的路径，以及 `.meta_harness/` 下的 `.agents`、`.claude`、`.codex`、`.cursor` 及其下的路径。只有被忽略的路径按名单计数。
- `remove` 在树有未提交的已跟踪改动时拒绝。不带 `force` 时只返回未跟踪与被忽略路径的清单，`removed` 为 false，CLI 退出1。带 `force` 时从主检出运行 `git worktree remove --force`，再用 `lstat` 核对目录是否还在磁盘上。`removed` 只在目录已不存在时为 true。Windows 上 git 删掉普通文件，留下 pnpm 建的目录联接与空目录，仍退出0。目录还在时按下面处理：
  - 用 `lstat` 遍历剩下的内容，不跟随任何链接。有普通文件（既不是链接也不是目录）时不再删除任何东西。输出 `removed: false`、`reason`（原因与普通文件的个数）与 `files`（前五个文件，相对树的路径），CLI 退出1。
  - 只有链接与空目录时，逐个删除链接本身：先 `unlink`，失败且该项仍是链接时再 `rmdir`。不递归进链接，链接目标不受影响。然后自底向上用不递归的 `rmdir` 删除空目录。目录不再存在时输出 `removed: true` 与 `leftover`（删除的链接数与目录数）。任一删除失败或目录仍在时输出 `removed: false` 与 `reason`，CLI 退出1。
  - git 已删干净时（POSIX 上的常态）输出 `removed: true`，不带 `leftover`。
- `prepare-closures` 在 `--base`（解析成 40 位提交号）上，为每个 `--closure <名称>:<分支>` 在 `<主检出>/.worktrees/<名称>` 建一棵树，按命令行顺序逐个处理，不并行安装。基线不是提交、pnpm 起不了、闭包名称或分支为空、重复或不可用时，在任何改动之前退出2。建树：目录与分支都不存在时 `git worktree add -b <分支> <树> <基线>`，不设上游；分支已存在而目录不存在时，分支尖端等于基线才用它建树，否则该闭包 `refused`；目录已存在时必须是登记在册、检出该分支的工作树，且树的 HEAD 含基线（`git merge-base --is-ancestor <基线> HEAD`），否则 `refused`，原因写树的 HEAD 不含基线；报告与 `ready.json` 的 `base` 仍是请求的基线。`refused` 在改动之前发生，不阻止其他闭包。跳过键是（基线、树中 `pnpm-lock.yaml` 的 SHA-256、`HEAD:.meta_harness/agents`、该目录未提交改动的 SHA-256、排序去重后的 `--build` 过滤器列表）；未提交改动的摘要由 `git diff HEAD -- .meta_harness/agents` 的输出与该目录下未跟踪文件的路径和内容摘要合成，干净时为固定值。`tmp/closures/<名称>/ready.json` 记录各步成功与同一个键、每个 `--build` 过滤器各有一条成功的 `build <过滤器>` 步骤，且树根 `node_modules` 存在时该闭包 `skipped`，不安装、不投影、不构建。其余情况先删旧记录，再在原树里整套依次安装（与 `prepare` 相同的参数）、`regenerateProjections` 与每个 `--build` 的 `pnpm turbo run build --filter=<过滤器>`，全部成功后写 `ready.json`（`base`、`branch`、`key`、`steps`、`completedAt`），状态为 `created`（新建的树）或 `reused`。某一步失败时，该闭包 `failed`，不删已建的树，后面的闭包不处理，输出 `resume`（同一条命令）。`failed` 或 `refused` 时退出1，全部就绪退出0。步骤经 `Runner` 注入。不推送，不设上游，不读 binding，不运行 `start`。
- `projections` 把本树 `.meta_harness/agents` 编译到新的临时目录，`rsync -rlpc` 进 `.meta_harness/`，运行 `link_agents.py`，去掉 `.meta_harness/.cursor` 下 `Dockerfile`、`environment.json`、`install.sh` 的组写权限，再运行 `pnpm run check:agents`。`check:agents` 失败时命令失败。临时目录无论成败都删除。两次 `uv run --locked` 的环境设 `PYTHONDONTWRITEBYTECODE=1`，并去掉 `UV_DEFAULT_INDEX` 与 `UV_INDEX_URL`，因为锁文件已固定来源。`check:agents` 的脚本也起 `uv run --locked`，所以这一步的环境同样去掉这两个变量。`projections` 在第一步之前确定 pnpm 怎样起。复制一步只在 POSIX 宿主且 `PATH` 中有 `rsync` 时运行 `rsync -rlpc`。其他宿主（包括 Windows）由 `copyProjections` 实现同一语义：创建目录，软链接按链接复制，内容相同的文件不重写，权限位随源（仅 POSIX），不删除目标里多出的文件。
- `prepare` 的安装与 `projections` 的 `check:agents` 经 `pnpmCommand` 起 `pnpm`。其他平台运行 `pnpm`。Windows 上它按 `PATH` 顺序找。先遇到含 `pnpm.exe` 的目录时，起这个 `pnpm.exe`。先遇到含 `pnpm.cmd` 且旁边有 `node_modules/pnpm/bin/pnpm.cjs` 的目录时，用当前 Node 运行这个 `pnpm.cjs`。旁边没有 `pnpm.cjs` 的 `pnpm.cmd` 跳过。都没有时报错。平台与 `PATH` 经可注入的 `Host` 传入。

I21。`gate-cli.ts wait` 等待一次 workflow 运行。说明去掉首尾空白后按字符计须在 1 到 1024 之间，否则在任何请求之前拒绝。`environments` 至少有一个环境名，CLI 缺省为 `publish`。每轮先读运行，`status` 为 `completed` 时返回 `conclusion` 与每轮批准的环境 ID；否则读 `pending_deployments`，把 `current_user_can_approve` 为 true 且环境名在 `environments` 中的部署在一次 POST 中批准，评论为说明。每轮按当时的待确认部署判断，不按此前批准过的环境 ID 跳过。然后等待一个间隔。到达时限时以 `unknown` 失败。CLI 在结论为 `success` 时退出0，其他结论退出1，失败退出2。命令不判断当前身份是否获授权代为确认，也不派发 gate。

## 包发布运行命令

`release-run-cli.ts`、仓库根和包内的 `release-run` script、构建后的 `omne-release-run` 迁移包发布脚本。它固定使用 `gate-release.yml` 与 `github-gate`，与整波放行无关。

输入 JSON 先经 [strict-json.ts](../delivery/strict-json.ts) 解析，重复键（含转义后相同的键）、超过 1 MiB 或嵌套超过 128 层时拒绝；再由 `parseReleaseRunInput` 严格解析，包含版本、仓库、UUID operationId、包名、候选提交、Issue 号、显式 dryRun 与 workflowHead。支持 repo-toolchain 和 repo-config。派发前读取实际 workflow ID 与 ref head，确认与输入一致；在一次 POST 之前持久保存 intent。精确 dispatch receipt 绑定本次输入和 run。没有 receipt 时返回 unknown，恢复不选择最新 run，也不重复 POST。

每次观察核对同仓库、workflow ID/path、ref、head、workflow_dispatch、run ID 和 attempt 1，并读取精确 attempt。重跑、身份变化、失败或取消均不能报告成功。观察超时只停止本地等待，远端运行可能继续。相同输入和操作日志用于恢复；冲突输入拒绝，日志不共用临时文件。

默认只观察。显式 `--approve --note FILE` 才可能批准，且仅处理 `npm-release`，要求平台 `current_user_can_approve` 为真。审批前再次核对精确 run，并先保存审批 intent；不确定结果不重发。其他环境不批准。实际 approvals 另行读回。GitHub 审批接口按 run 定位，没有 compare-and-set attempt 保证，工具不声明消除该平台并发窗口。

成功退出要求精确 run 完成且 conclusion 为 success。其他观察结果退出 1，输入或命令错误退出 2。输出包含操作身份、run/attempt 链接、诊断及恢复状态。持续验证由 [integration-release-run.spec.ts](../../tests/integration-release-run.spec.ts) 维护；替身通过不替代真实受保护环境审批证明。

## 状态与同步

I12。`status` 不改 context。没有 context 时报告未绑定，不读远端。已绑定时报告绑定的卡、修订、attempt、`taskBase`、`targetBase`、远端目标分支及其当前提交，以及 `targetBase` 与远端目标的关系：相等为 current，是其祖先为 behind，其他为 diverged。远端读不到时为 unknown。

I13。task-sync 只在下列条件全部满足时把 `targetBase` 更新为 T：

- 本工作树已绑定任务，context 可读。
- 远端目标分支可读，T 是它的当前提交或祖先。
- T 是本地提交，并且是当前 HEAD 的祖先。
- 当前 `targetBase` 是 T 的祖先。
- 工作树没有未提交的改动，未跟踪文件也算改动。

任一条件不满足就拒绝，context 不变。T 等于当前 `targetBase` 时成功，不写文件。更新只替换 `targetBase`，其他键的值与顺序不变。新内容先写入同目录的临时文件，写前再比对原文件字节，未变才 rename 覆盖；原文件已变化时为 stale，临时文件删除。读者只会看到旧文件或新文件。

## 提升 PR 的说明

I17。`ri-notes` 为一条轨道生成提升 PR 的「所含的卡」与「契约变化」两节，规则归[进轨道 PR 的说明](../../../../docs/engineering/integration.md#进轨道-pr-的说明)。「所含的卡」的行格式归 `github-gate` 分支 `gate/README.md` 的「提升 PR 的说明」。命令只读 Git 与 GitHub，不写 ref、标签、context 或平台。

### 范围与 unit

- registry 与线归属表读当前 HEAD 提交。
- 源轨道的上游按[上游链核对](#上游链核对)第 4 项的可信来源确定，顺序与 gate 相同：起点标签的 `parent`（没有时为 `main`），否则切换点中登记了该分支时为 `main`，两者都没有时拒绝。与 registry 的 `parent` 不同时报告 `parent-registry-drift`，范围按可信上游计算。本命令不核对上游的上游。
- 远端读取源轨道分支、起点标签、`github-gate` 分支、全部 `refs/tags/omne/gate/unit/*` 与上游分支。fetch 只取本地缺少的对象：两个分支头与范围内的 unit 标签对象各批量取一次，`github-gate` 提交、切换点提交与起点标签各自按需取。
- 范围是源轨道上游不包含的 first-parent 提交，从旧到新。上次提升带入上游的提交不在范围中。同步合并在范围中。
- 核对下限与 gate 相同：先取 `gate/cutover.json` 中的切换点，没有时取起点标签指向的提交。下限及之前的提交标为 `before-lower-bound`，不要求 unit。没有下限时报告 `lower-bound-unknown`。下限不是轨道头的祖先时报告 `lower-bound-not-ancestor`，gate 会拒绝这次提升。这两种情况下全部提交都要求 unit。
- 每个提交读 `omne/gate/unit/<提交号>` 的 `omne-gate-record:v1` 正文，取 `pr`。标签或正文不合格时该提交的 unit 为 invalid。Git 读取失败不是 invalid，命令失败。没有 unit 时，主题为 `Merge pull request #<N> from …` 的提交按该 PR 继续读取，来源标为 `subject`。

### PR 与卡

- 每个 PR 经 `gh api` 读取正文、head 与 base。head 为上游分支的是同步 PR，不读两节。head 是 registry 中以源轨道为 `parent` 的轨道分支时为提升 PR，其余为个人分支的 PR。提升 PR 与个人分支的 PR 都读两节。
- 一节从 `## <节名>` 标题开始，到下一个一级或二级标题或分隔线为止。分隔线是单独一行的 `---`、`***` 或 `___`。HTML 注释与围栏代码块中的内容不计。同名的节出现多次时都读。
- 节内只读顶层列表行，即行首最多一个空格后接 `-`、`*` 或 `+`。说明文字与缩进的子列表不计。
- 「契约变化」没有顶层列表行、有一行「无」，并且没有任何列表样式的行（包括缩进的行与引用块中的 `> - …`）时，表示 PR 没有改动契约成员。有列表样式的行而没有顶层列表行时，该节按没有列表行处理。契约成员路径可以写成 Markdown 代码。
- 列表行逐字符合格式时直接采用。「所含的卡」的行有编号、修订与 attempt 而分隔不对时，仍计入并报告 `cards-line-invalid`。「契约变化」的行有路径与级别而分隔不对时，仍计入并报告 `contract-line-invalid`。发现写明该行是否计入。其他列表行报告且不计入。
- 同一张卡取修订最大的声明。修订相同时取范围中最晚的 PR。明确声明优先于推测。
- PR 没有声明「所含的卡」或该节没有列表行时，报告 `pr-section-missing`，并按分支名中的 `issue-<N>` 推测卡。该节的列表行都不能计入时，同样推测。推测的卡的修订与 attempt 取卡当前正文的 binding，条件写「待确认」，并报告 `card-inferred`。推测不出、卡读不到、正文没有 binding 或 binding 不合格时，报告 `card-unresolved` 并写明原因，该卡不进入输出。
- 每张卡读当前正文「身份与责任」的交付线。交付线不是 `integration`，并且该线的目标轨道不是源轨道或其子孙轨道时，报告 `card-other-line`。

### 契约变化

- 同一契约成员取各 PR 声明的最高级别，按 PR 保留说明。
- 下列提交的契约变化未知：没有 PR 的提交（包括下限之前的提交）、PR 读不到、PR 没有声明「契约变化」或该节没有列表行、该节有未计入的行。同步 PR 不计。有未知时，「契约变化」在已知成员之后写一个列表行 `- 待确认：…`，列出这些 PR 与提交，不写「无」，并报告 `contracts-unknown`。读 PR 时，以「待确认」开头的列表行总是不计入的行，所以子轨道的输出原样贴进上一层的提升 PR 后，上一层仍把这个 PR 计为未知。JSON 的 `contractGaps` 逐个列出原因。只有全部已知且没有成员时才写「无」。
- 路径不是线归属表 `contracts` 中的成员时报告 `contract-path-unknown`。PR 的某项级别高于该 PR 所含卡的最高契约变更时报告 `contract-level-exceeds-card`，所含卡中有读不到契约变更的卡时不核对。源轨道不是联调轨道而有 breaking 时报告 `contract-breaking-off-integration`。
- `riNotes` 的输入 `diffContracts` 提供从合并点到轨道头的成员级快照差异，类型为 `ContractDiff`。差异覆盖的范围不是本次范围时报告 `contract-diff-stale`，不比较。差异的 none、additive 分别与声明的 none、additive 相符，review 只与 breaking 相符，不符时报告 `contract-diff-mismatch`。差异不可得时 `contractCheck.kind` 为 `unavailable` 并写明原因。
- 命令行的差异来自 dev-flow 依赖解析出的 `@omne-harness/repo-toolchain` 的 `omne-contract-api --diff <合并点> --json --root <检出根>`，不运行工作区源码。它比较合并点上的快照与工作树的快照，还读工作树的配置、线归属表、成员的 `package.json`、tsconfig 与已安装的类型，所以只在检出 HEAD 等于轨道头，并且工作树没有未提交改动或未跟踪文件（被忽略的文件除外）时运行，否则为 `unavailable`，原因写明实际 HEAD 或工作树有改动。读检出的 Git 状态失败也为 `unavailable` 并写明原因。超时取 policy 的 `timeouts.networkMs`。超时、进程出错（附错误码）、退出码不为 0（附标准错误）与输出形状不符各有各的原因。
- 有成员的分类不可得时，整个差异为 `unavailable`，原因逐个列出这些成员与原因，不把它们当作 none：成员读不出（`invalid`）、合并点上没有快照（含合并点上还不是契约成员）、工作树上仍是契约成员而没有快照、两侧都没有快照。工作树上不再是契约成员的成员保留 `omne-contract-api` 给出的 review。

### 输出与失败

- JSON 输出到标准输出，含源轨道、可信上游、核对下限、逐提交的 unit 与 PR、汇总的卡、契约变化与 `contractGaps`、`contractCheck`、发现与 Markdown。
- `--format markdown` 只把两节输出到标准输出，供贴进提升 PR。推测的卡的条件与「待确认」行须先按发现改写。发现逐条以 JSON 行写到标准错误，最后一行是汇总：发现总数、各代码的条数与 `contractCheck`。
- 每条发现带 `severity:"report"`、代码、定位与说明。定位取 `commit`、`pr`、`issue`、`section` 与 `path` 中适用的几项。
- 退出码：有 `contract-level-exceeds-card`、`contract-breaking-off-integration` 或 `contract-diff-mismatch` 发现时退出 1（`RI_REFUSING_CODES`，`riNotesExitCode`）。其他发现与 `contractCheck` 为 `unavailable` 只报告，退出 0。两种格式的输出与退出码无关：退出 1 时标准输出与标准错误的内容不变。
- PR 或卡读取的已知失败（GitHub 带 JSON 正文的错误响应、身份不符、响应字段不合格）报告 `pr-unreadable` 或 `card-unreadable`，其余照常输出。其他错误不转为发现，整次运行按本工具的失败约定退出 2：远端 Git 读不到、`gh` 不能运行、`gh` 的错误响应没有 JSON 正文（例如未认证）、registry 或线归属表缺失或不合格。
- `ri-notes --help` 输出用法并退出 0。

发现代码：

| 代码                                | 定位             | 含义                                                          |
| ----------------------------------- | ---------------- | ------------------------------------------------------------- |
| `parent-registry-drift`             | 无               | registry 的 `parent` 与可信上游不同                           |
| `lower-bound-unknown`               | 无               | 没有切换点，也没有起点标签                                    |
| `lower-bound-not-ancestor`          | 下限提交         | 下限不是轨道头的祖先                                          |
| `unit-missing`                      | 提交             | 下限之后的提交没有 unit                                       |
| `unit-invalid`                      | 提交             | unit 标签或正文不合格，或没有 `pr`。下限之前的提交也报告      |
| `unit-target-mismatch`              | 提交             | unit 的目标不是源轨道，或结果不是该提交。下限之前的提交也报告 |
| `pr-unreadable`                     | 提交、PR         | PR 读不到                                                     |
| `pr-base-mismatch`                  | 提交、PR         | PR 的 base 不是源轨道                                         |
| `pr-section-missing`                | 提交、PR、节     | PR 没有声明一节，或该节没有列表行                             |
| `cards-line-invalid`                | 提交、PR、节     | 「所含的卡」的行不符合格式                                    |
| `cards-empty`                       | 节               | 没有可列出的卡                                                |
| `contract-line-invalid`             | 提交、PR、节     | 「契约变化」的行不符合格式                                    |
| `contract-path-unknown`             | PR、节、路径     | 路径不是契约成员                                              |
| `contract-level-exceeds-card`       | PR、节、路径     | 级别高于所含卡的契约变更                                      |
| `contract-breaking-off-integration` | PR、节、路径     | 联调轨道之外有 breaking                                       |
| `contracts-unknown`                 | 节               | 有提交的契约变化未知                                          |
| `contract-diff-stale`               | 节               | 快照差异不覆盖本次范围                                        |
| `contract-diff-mismatch`            | 节、路径         | 快照差异与声明不符                                            |
| `card-inferred`                     | 卡               | 卡按分支名推测                                                |
| `card-unresolved`                   | 提交、PR，可有卡 | 推测不出卡，或推测的卡没有可用的 binding                      |
| `card-unreadable`                   | 卡               | 卡读不到                                                      |
| `card-line-unknown`                 | 卡               | 卡没有合法的交付线                                            |
| `card-other-line`                   | 卡               | 卡的线不属于源轨道及其子孙轨道                                |

### 限制

- 跨线核对按卡正文的交付线判断。交付线为 `integration` 的卡出现在线轨道上时不报告，尽管这样的卡应进入联调轨道。
- 提升 PR 的识别与子孙轨道按 registry 的 `parent` 判断，不读子轨道的起点标签。
- 卡的交付线、修订与 binding 取当前正文，不是 PR 合入时的正文。

## 契约快照核对

I22。`contract-check` 让契约快照与 dist 的不一致使 `pnpm run check` 失败。`scripts/check.sh` 在构建之后常驻调用它。

- 它经 `contract-diff.ts` 的 `contractApiCommand` 与 `runContractApi` 运行 dev-flow 依赖解析出的 `omne-contract-api --check --json --root <检出根>`，不运行工作区源码。超时为 `CONTRACT_CHECK_TIMEOUT_MS`（300 秒）。
- 成员状态取钉住版本的六种：`match`、`differs`、`unreadable`、`missing`、`unbuilt`、`invalid`。`differs`、`unreadable`、`missing`、`invalid` 失败，每个成员一项，带成员、状态、说明与改法。`unbuilt` 只报告：影响面计划没有选中的成员不构建。本卡改了一个成员的快照或源码时，影响面选中它，它被构建并核对。本命令不核对没有 dist 的成员是否真的没有变。`differs` 也可能来自早于合并进来的快照的 dist，所以改法先写重新构建。`match` 通过。
- 标准输出是 JSON 报告：`typescript`、各状态的成员数 `counts`、`failures` 与 `unbuilt`。标准错误为每个失败的成员写一行 `contract-check: <状态> <成员>: <说明> 改法：<改法>`，最后写一行汇总。
- 退出码：没有失败的成员为 0，有为 1。找不到 `omne-contract-api`、进程出错或超时、退出码不为 0、输出形状不符时退出 2，错误以一行 JSON `{code, message}` 写到标准错误，标准输出为空。
- `omne-contract-api --check` 对 `differs` 也退出 0，所以失败判断在本命令。

## API 语义复核

`contract-review.ts` 从固定 Git、工具输出、binding 或提升与基线事实生成比较描述 `Comparison`，并提供纯解释函数：输入原始观察与[已核记录](../delivery/SPEC.md#api-语义复核记录)，输出每个成员的工程级别。解释函数不发网络请求，不写平台。记录的权限与失效归交付模块，本模块不再定义。

- 三个范围各自重算比较描述：卡级核对 task context、当前 binding 与正式派发，提升级读取来源轨道、unit、PR 与所含卡，里程碑累计读取 baseline 卡与 Milestone 并运行真实的 `omne-contract-api --baseline`。检查器不相信 draft 文件。
- 比较描述保留完整的原始成员 JSON 与进程退出码，不用丢失差异的简化结果。`checkedMembers` 与 `reviewMembers` 是完整集合，缺项、重复、意外项或不可判定成员都拒绝，列表不截取。
- 目标提交必须来自上下文或提升的直接上游，不来自任意 `--base` 参数。检出 HEAD 必须等于候选 head，工作树无未提交或未忽略的未跟踪文件。前后两次读取 HEAD、工作树、直接目标 head 与关键评论摘要，变化即拒绝。
- 启用检查按固定顺序执行，前一步失败不执行后一步：入口位置（`api-review-entry-outside-root`）、AuthorityFiles 存在性、AuthorityFiles 逐对象相等（`api-review-self-authorization`）、解析目标提交的线归属表与身份文件（`api-review-policy-unavailable`）。AuthorityFiles 含 `tools/dev-flow/src`、`tools/dev-flow/package.json`、`integration.md`、`delivery.md`、`docs/verification.md`、`delivery-lines.json`、`api-review-owners.json`、`integration-policy.json` 与 `repo-toolchain.config.json`。
- 提升范围内任一卡改动了 AuthorityFiles 中的路径时，提升级新路径拒绝。需要用新路径提升时，先单独提升工具与治理改动，再合入含 `review` 成员的改动。
- 原始 `none` 与 `additive` 不需要记录。有效的 `review` 加 `additive` 记录得到 `additive`。有效的 `breaking` 结论为 `api-review-breaking-route-required`，仍走既有 breaking 路径。binding 为 `none` 不能消费 `additive` 结论。
- 里程碑累计通过的条件：基线读取退出码只能是 0 或 1，且为 1 当且仅当 `refused` 为真；无未判定成员，登记的 sha256 与 apiTree 相符；每个成员原始分类为 `none` 或 `additive`，或为 `review` 且有效记录为 `additive`；没有 `breaking` 结论；没有发现，两次读取一致。累计语义路径只放行全部确认为 `additive` 的 `review`。
- 无 `--review-issue` 的提升级、无 `--semantic-review` 的累计级与无记录的卡级，保持旧行为。新路径中 `contractCheck.unavailable` 退出 2，不能沿旧报告模式退出 0。
- `api-review-cli.ts` 提供 `draft-card`、`draft-ri`、`draft-milestone`、`check-milestone` 与 `verify-owner-adoption`。draft 命令只输出待人工核对的草稿，不发评论，不产生通过结论。输入无法完整取得时退出 2，不写部分可签发草稿。没有 `--record`、`--trust-local` 或任意 owner 参数。`ri-notes` 增加 `--review-issue <所含卡号>`，该卡号必须属于本次解析出的所含卡且与载体一致。`check-milestone` 的 `--semantic-review` 只允许 `true` 或缺省。
- `verify-owner-adoption --root <检出> --base <目标提交> --head <PR head 提交>` 是 `publish` 确认者的只读工具，不属于新语义路径，不执行启用检查，也不产生任何复核结论。它用 `git merge-tree --write-tree` 算出合并结果，比较两侧 `api-review-owners.json`，把条目分为新增、改动与删除。对新增与改动的条目，读回采用评论并核对四项：URL 属于本仓库且与读回的 `html_url` 相等、`bodySha256`、`updatedAt`、`authorNodeId`。对删除的条目只列出。三个参数都必填，不重复。提交不在对象库时不自动 fetch。输出 JSON 报告，附读回评论的原始正文，标准错误最后一行为汇总。只发 GET 请求，不写平台、工作树与 task context。
- `verify-owner-adoption` 的失败码：`adoption-verify-foreign-url`、`adoption-verify-comment-missing`、`adoption-verify-mismatch`、`adoption-verify-manifest-invalid` 退出 1；`adoption-verify-input-unknown`（参数无效、提交不在对象库、合并冲突、目标侧不能解析、403、429、网络错误）退出 2。退出 0 只说明四项与平台一致，不说明评论是有权者的决定，也不判断删除是否获准。这两项由确认者阅读后判断。
- 一般情形从目标提交的独立检出运行该命令，不从 PR head 运行，因为 PR 可以修改这条命令。初次入轨时目标还没有这条命令，确认者从工具候选运行，并另外手工读回同样的四项。候选自带的输出不能单独作为依据。

测试使用真实临时 Git 与已安装的 `omne-contract-api`，至少驱动一个新入口完成 module augmentation 的 `review`。GitHub 以替身代替网络。每个拒绝场景只改变一个条件，不依赖另一个先发生的失败。真实 GitHub 的复核由集成负责人只读执行。

## 验证义务与限制

持续测试必须驱动真实隔离 Git 与 CLI，覆盖：policy、轨道与派发决定字段的正反例，包括 `parent` 与 `initialBase` 必填、`initialMain` 与其他未知字段拒绝、保留名与自指拒绝；三种 route 的目标分支，以及 global 与 cross-track 指向非顶层轨道时拒绝开工；I14 的每一项，包括链上未登记、retiring、retired、分支不存在、registry 仍为 active 而分支已删除、标签 `parent` 与 registry 不一致、旧标签缺 `parent` 按 main、无标签而有切换点时 `parent` 必须为 main、两者都没有、远端读不到，并且链外条目的问题不影响开工；不读取采用文件、锚点或标签的开工；reviewer 与 team 成员的派发、撤销和不相关平台变化；I15 的来源识别与非法覆盖值、事实齐备时写出 context、两次采集都不发 GraphQL 与 environment 读取，以及每一项评论、区块、运行与授权核对的反例，每个反例都不写 context；I15 的等待与超时用注入的时钟、睡眠与随机数在单元层验证；status 的未绑定、已绑定、behind、diverged 与远端读取失败；task-sync 的正常前进、T 等于 targetBase、未绑定，以及 T 未合并、T 不在远端目标历史、targetBase 后退或跳到另一条历史、工作树有改动、远端读不到等反例，每个反例都不改 context；同步后 baselines 使用新 targetBase、审计仍从 taskBase 开始。I16 的测试覆盖 v2 卡无发现；每个拒绝代码各一张只有这一项发现的卡被拒绝，不写 context，不调用看板，CLI 退出 2；几项发现时逐项列出代码、条款与改法；carry 之后的里程碑漂移只报告；交付线为 `integration` 的 v1 卡只报告、正文交付线不合格的 v1 卡拒绝；已有同绑定 context 时重跑只报告，标准输出与退出码不变；线归属表缺失或不合格时拒绝新建 context，已有同绑定的 context 时只报告；报告写入失败时照常开工，报告只进标准错误。两次采集之间 milestone 与 updatedAt 一起变化时拒绝写入。I19 的测试覆盖缺 `kind:` 标签、两个 `kind:` 标签、缺 `line:` 标签与 milestone 为 null 时拒绝且不写 context。I20 的 `prepare-closures` 测试用保存分支与已登记工作树的 `Runner` 替身覆盖：新建两棵树（`-b`、不设上游、安装、投影、`ready.json`）、分支在别的提交上而目录缺失时 `refused`、目录未登记或在别的分支上时 `refused`、键不变时 `skipped`、锁文件内容变化、投影源有未提交改动或树变化时在原树重做、第二棵安装失败时第一棵就绪而第三棵不处理且已建的树不删并给出 `resume`、重做失败时旧 `ready.json` 被删、含失败步骤或别的分支或不可解析的记录不算就绪、`--build` 的步骤与顺序、起不了 pnpm 或基线不是提交时不建树、不运行 `start` 也不推送、Windows 宿主的 pnpm 起法；并用真实 Git 核对树的提交、分支与无上游，CLI 子进程核对重复的 `--closure` 与 `--build`、退出码 1（拒绝）与 2（输入错误）及两种输出。I20 的测试用记录步骤的 `Runner` 覆盖 `prepare` 的步骤顺序、跟踪远端与落后本地分支快进两种建法、领先与分叉的本地分支拒绝、证据恢复、已存在目录与失败步骤的拒绝、`start` 失败的报告、`projections` 在 `check:agents` 失败时失败且删除临时目录、用注入的平台与 `PATH` 覆盖 Windows 的 pnpm 启动（只有 `pnpm.exe`、只有 npm 全局布局、两者都有时按 `PATH` 顺序、跳过没有 `pnpm.cjs` 的 `pnpm.cmd`）与没有 `rsync` 时的 Node 复制、起不了 pnpm 时 `prepare` 不运行任何步骤且目录不存在、`uv run --locked` 与 `check:agents` 的环境去掉两个索引变量且真实 `runProgram` 把去掉后的环境交给子进程、`start.json` 在安装之前写成新 attempt、安装失败时的 `done` 与 `resume`、`swap` 先分离旧树再快进分支、不推送不删除、保留证据并按类别列出警告、四种拒绝时不改动旧树、分离失败、新树建好之前失败与建好之后失败三处的 `done`、`resume` 与 `evidence`、`swapWarnings` 的名单与逐条列出的路径，CLI 子进程对未知异常写出阶段、类型与消息且读卡阶段不写原始输出，以及 `remove` 只列清单、强制删除与已跟踪改动时拒绝。`remove` 的残留处理用真实建出的目录联接（POSIX 上为软链接）覆盖：只有链接与空目录时删干净，链接目标（含指向树外存储、指向另一链接、悬空与指向上级目录的链接）删除后仍在；有普通文件时什么都不删并列出前五个文件；目录已不在时照旧报告 removed。慢层用真实 Git 与 CLI 子进程对含联接的工作树跑一次 `remove --force`。I21 的测试用按轮次应答的 GitHub 替身覆盖只批准指定环境、不可批准的部署不批准、每轮重新批准仍待确认的部署、按字符计数的超长说明（含增补平面字符）在任何请求之前拒绝、空环境列表拒绝与超时。`tests/integration-dispatch.spec.ts` 用派发命令生成的评论正文驱动一次真实 `start`，核对 context 的 binding 等于派发的 binding。I18 的测试经 CLI 子进程覆盖看板写入失败、`board` 项语义无效与 dispatch 写入关闭三种情况下标准输出与退出码不变；用注入的 Project 覆盖新 context 写入启用的字段、已有 Dispatched at 不覆盖、重复开工不再写入，以及 workflow 事实下不发请求只报告 `board-skipped`；`board` 项形状不合格时 `start` 拒绝且不写 context。I17 的测试覆盖 gate 格式的逐行比对、节的切分（围栏代码、子列表、重复的节、没有分隔线的页脚）、宽松计入的行、同卡取最新修订与 attempt、同步与提升 PR 的分类、子轨道的卡不报跨线、契约变化的合并与「待确认」、子轨道输出贴进上一层后仍为未知、有列表样式的行时不判「无」，以及未声明两节、unit 缺失、别的线的卡、下限不在历史上与上游漂移各报一条可定位的发现。真实 Git 测试覆盖范围（含上次提升之后的同步合并）、起点标签与切换点给出的上游与下限、起点标签指向另一条轨道作为上游及该分支不存在时拒绝、unit 读取（轻量标签为 invalid，Git 读取失败照常抛出），CLI 只有只报告的发现时退出码为 0，Markdown 模式把发现写到标准错误。`riNotesExitCode` 的测试覆盖三个拒绝代码各退出 1，差异不可得、没有发现与其他代码退出 0。CLI 用例覆盖 `contract-level-exceeds-card` 时两种格式都退出 1、Markdown 的标准输出与 JSON 的 `markdown` 相同，以及安装的 `omne-contract-api` 给出的差异与声明不符时退出 1、相符时退出 0。快照差异与声明的比较用注入的差异测试。命令行的差异提供者在临时真实 Git 检出里运行安装的 `omne-contract-api`，覆盖逐成员的 none、additive 与 review，HEAD 不是范围头、工作树有未提交改动（快照文件或成员的 `package.json`）或未跟踪文件、合并点没有快照、两侧都没有快照、工作树缺快照、快照读不回、配置被拒绝（退出 2）、超时与检出不是 Git 仓库，各为 `unavailable` 并写明原因。进程起不来用一个不可执行的文件代替 CLI 测试。I22 的测试用注入的 `--check --json` 输出覆盖六种状态各自的退出码、同一次运行的全部失败成员与输出形状不符；进程起不来时抛出并带错误码；经 CLI 在临时真实 Git 检出里运行安装的 `omne-contract-api`：快照与 dist 一致时退出 0，改动一个快照后退出 1，改回后退出 0，没有 dist 的成员只报告，配置被拒绝时退出 2。输出形状不符只在边界解析上测试。提供者与 `riInput`、`riNotes` 组合的测试在同一个真实检出里用安装的 CLI 产生差异，GitHub 读取用进程内的替身，覆盖声明与快照一致和不一致两种情况；命令行用例核对 `contractCheck` 的原因来自这个提供者。GitHub 响应模拟只能证明解析及请求协议。真实 Rulesets、Actions、权限、云端代理、`delivery-facts` workflow 与宿主加载不由本模块的测试证明。

Git 网络读取使用 policy 的 `timeouts.networkMs`，fetch 仅在本地缺对象时执行。超时或读取失败为 unknown。平台读取沿[Get an issue comment](https://docs.github.com/en/rest/issues/comments#get-an-issue-comment)。这些来源不代替实际运行证据。
