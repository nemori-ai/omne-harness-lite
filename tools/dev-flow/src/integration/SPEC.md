# 分支集成工具行为契约

本工具承担任务工作树的开工准入、状态读取、基线与 task-sync，并为提升 PR 生成说明（`ri-notes`，只读、只报告）。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。采用、本机发布与旧建轨道命令及其条款已按 [RFC-0009](../../../../docs/rfcs/RFC-0009-adoption-and-local-tool-retirement.md) 删除，原 I01、I02、I04、I05、I07、I09、I10、I11 随之删除。保留条款沿用原编号。

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

I16。准入成功之后，`start` 与 `register` 报告本卡的属性发现，不拒绝开工。发现由 [delivery/attributes.ts](../delivery/attributes.ts) 的 `attributeFindings` 给出，代码表与判据见[交付观察规格](../delivery/SPEC.md#属性发现)。输入是本次准入采集中的本卡正文、标签、milestone 与条件目标卡，binding，与 policy 同一提交中的 `docs/engineering/delivery-lines.json`，以及 policy registry。版本 1 的 binding 报告 `binding-v1`。

每条发现向标准错误写一行 JSON：`{"severity":"report","issue":卡URL,"code":…,"clause":…,"message":…}`。线归属表缺失、不合格或计算失败时只写一行 `attribute-rules-unavailable`。报告不改变标准输出、context 与退出码。报告写入失败时报告丢失，命令结果不变。

I18。`start` 与 `register` 新建 context 之后，按 [delivery/board.ts](../delivery/board.ts) 的 `recordDispatch` 在本卡的 Project 条目上写 Dispatched at 与 Line。看板设置取本次开工已读的交付配置（policy 的 `deliveryConfig`）中的 `board` 项与字段 ID；没有 `board` 项时不写、不报告。`board` 项的形状不合格时整个交付配置不合格，`start` 按既有规则拒绝；事件、字段 ID 与时区的语义问题只报告。已有同绑定的 context 时不写；条目的 Dispatched at 已有值时不覆盖。Line 取版本 2 binding 的 `line`，版本 1 取正文「身份与责任」的交付线。使用 workflow 事实时不发 GraphQL 请求，只报告 `board-skipped`。失败、跳过与读回不符按 I16 的行格式写到标准错误，代码为 `board-write-failed`、`board-skipped` 或 `board-unverified`。写入在 context 写好与属性报告之后进行，任何结果都不改变标准输出、context 与退出码。本条只写 Dispatched at 与 Line，不写 Stage。Project 写入与时钟经 `openIntegration` 的 `board` 参数注入，缺省为 `gh` 与当前时间。

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
- 每条发现带 `severity:"report"`、代码、定位与说明。定位取 `commit`、`pr`、`issue`、`section` 与 `path` 中适用的几项。发现不改变退出码。
- PR 或卡读取的已知失败（GitHub 带 JSON 正文的错误响应、身份不符、响应字段不合格）报告 `pr-unreadable` 或 `card-unreadable`，其余照常输出。其他错误不转为发现，整次运行按本工具的失败约定退出 2：远端 Git 读不到、`gh` 不能运行、`gh` 的错误响应没有 JSON 正文（例如未认证）、registry 或线归属表缺失或不合格。
- `ri-notes --help` 输出用法并退出 0。

发现代码：

| 代码 | 定位 | 含义 |
| --- | --- | --- |
| `parent-registry-drift` | 无 | registry 的 `parent` 与可信上游不同 |
| `lower-bound-unknown` | 无 | 没有切换点，也没有起点标签 |
| `lower-bound-not-ancestor` | 下限提交 | 下限不是轨道头的祖先 |
| `unit-missing` | 提交 | 下限之后的提交没有 unit |
| `unit-invalid` | 提交 | unit 标签或正文不合格，或没有 `pr`。下限之前的提交也报告 |
| `unit-target-mismatch` | 提交 | unit 的目标不是源轨道，或结果不是该提交。下限之前的提交也报告 |
| `pr-unreadable` | 提交、PR | PR 读不到 |
| `pr-base-mismatch` | 提交、PR | PR 的 base 不是源轨道 |
| `pr-section-missing` | 提交、PR、节 | PR 没有声明一节，或该节没有列表行 |
| `cards-line-invalid` | 提交、PR、节 | 「所含的卡」的行不符合格式 |
| `cards-empty` | 节 | 没有可列出的卡 |
| `contract-line-invalid` | 提交、PR、节 | 「契约变化」的行不符合格式 |
| `contract-path-unknown` | PR、节、路径 | 路径不是契约成员 |
| `contract-level-exceeds-card` | PR、节、路径 | 级别高于所含卡的契约变更 |
| `contract-breaking-off-integration` | PR、节、路径 | 联调轨道之外有 breaking |
| `contracts-unknown` | 节 | 有提交的契约变化未知 |
| `contract-diff-stale` | 节 | 快照差异不覆盖本次范围 |
| `contract-diff-mismatch` | 节、路径 | 快照差异与声明不符 |
| `card-inferred` | 卡 | 卡按分支名推测 |
| `card-unresolved` | 提交、PR，可有卡 | 推测不出卡，或推测的卡没有可用的 binding |
| `card-unreadable` | 卡 | 卡读不到 |
| `card-line-unknown` | 卡 | 卡没有合法的交付线 |
| `card-other-line` | 卡 | 卡的线不属于源轨道及其子孙轨道 |

### 限制

- 跨线核对按卡正文的交付线判断。交付线为 `integration` 的卡出现在线轨道上时不报告，尽管这样的卡应进入联调轨道。
- 提升 PR 的识别与子孙轨道按 registry 的 `parent` 判断，不读子轨道的起点标签。
- 卡的交付线、修订与 binding 取当前正文，不是 PR 合入时的正文。

## 验证义务与限制

持续测试必须驱动真实隔离 Git 与 CLI，覆盖：policy、轨道与派发决定字段的正反例，包括 `parent` 与 `initialBase` 必填、`initialMain` 与其他未知字段拒绝、保留名与自指拒绝；三种 route 的目标分支，以及 global 与 cross-track 指向非顶层轨道时拒绝开工；I14 的每一项，包括链上未登记、retiring、retired、分支不存在、registry 仍为 active 而分支已删除、标签 `parent` 与 registry 不一致、旧标签缺 `parent` 按 main、无标签而有切换点时 `parent` 必须为 main、两者都没有、远端读不到，并且链外条目的问题不影响开工；不读取采用文件、锚点或标签的开工；reviewer 与 team 成员的派发、撤销和不相关平台变化；I15 的来源识别与非法覆盖值、事实齐备时写出 context、两次采集都不发 GraphQL 与 environment 读取，以及每一项评论、区块、运行与授权核对的反例，每个反例都不写 context；I15 的等待与超时用注入的时钟、睡眠与随机数在单元层验证；status 的未绑定、已绑定、behind、diverged 与远端读取失败；task-sync 的正常前进、T 等于 targetBase、未绑定，以及 T 未合并、T 不在远端目标历史、targetBase 后退或跳到另一条历史、工作树有改动、远端读不到等反例，每个反例都不改 context；同步后 baselines 使用新 targetBase、审计仍从 taskBase 开始。I16 的测试覆盖 v2 卡无发现与有发现、v1 卡、线归属表缺失和报告写入失败，每种情况下 context、标准输出与退出码都不变，报告只进标准错误。两次采集之间 milestone 与 updatedAt 一起变化时拒绝写入。I18 的测试经 CLI 子进程覆盖看板写入失败、`board` 项语义无效与 dispatch 写入关闭三种情况下标准输出与退出码不变；用注入的 Project 覆盖新 context 写入两个字段、已有 Dispatched at 不覆盖、重复开工不再写入，以及 workflow 事实下不发请求只报告 `board-skipped`；`board` 项形状不合格时 `start` 拒绝且不写 context。I17 的测试覆盖 gate 格式的逐行比对、节的切分（围栏代码、子列表、重复的节、没有分隔线的页脚）、宽松计入的行、同卡取最新修订与 attempt、同步与提升 PR 的分类、子轨道的卡不报跨线、契约变化的合并与「待确认」、子轨道输出贴进上一层后仍为未知、有列表样式的行时不判「无」，以及未声明两节、unit 缺失、别的线的卡、下限不在历史上与上游漂移各报一条可定位的发现。真实 Git 测试覆盖范围（含上次提升之后的同步合并）、起点标签与切换点给出的上游与下限、起点标签指向另一条轨道作为上游及该分支不存在时拒绝、unit 读取（轻量标签为 invalid，Git 读取失败照常抛出），CLI 有发现时退出码为 0，Markdown 模式把发现写到标准错误。快照差异与声明的比较用注入的差异测试。命令行的差异提供者在临时真实 Git 检出里运行安装的 `omne-contract-api`，覆盖逐成员的 none、additive 与 review，HEAD 不是范围头、工作树有未提交改动（快照文件或成员的 `package.json`）或未跟踪文件、合并点没有快照、两侧都没有快照、工作树缺快照、快照读不回、配置被拒绝（退出 2）、超时与检出不是 Git 仓库，各为 `unavailable` 并写明原因。进程起不来用一个不可执行的文件代替 CLI 测试。输出形状不符只在边界解析上测试。提供者与 `riInput`、`riNotes` 组合的测试在同一个真实检出里用安装的 CLI 产生差异，GitHub 读取用进程内的替身，覆盖声明与快照一致和不一致两种情况；命令行用例核对 `contractCheck` 的原因来自这个提供者。GitHub 响应模拟只能证明解析及请求协议。真实 Rulesets、Actions、权限、云端代理、`delivery-facts` workflow 与宿主加载不由本模块的测试证明。

Git 网络读取使用 policy 的 `timeouts.networkMs`，fetch 仅在本地缺对象时执行。超时或读取失败为 unknown。平台读取沿[Get an issue comment](https://docs.github.com/en/rest/issues/comments#get-an-issue-comment)。这些来源不代替实际运行证据。
