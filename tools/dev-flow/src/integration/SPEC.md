# 分支集成工具行为契约

本工具只承担任务工作树的开工准入、状态读取、基线与 task-sync。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。采用、本机发布与旧建轨道命令及其条款已按 [RFC-0009](../../../../docs/rfcs/RFC-0009-adoption-and-local-tool-retirement.md) 删除，原 I01、I02、I04、I05、I07、I09、I10、I11 随之删除。保留条款沿用原编号。

本模块兑现[多层分支规则](../../../../docs/engineering/integration.md)。公开类型及输入解析归本目录源码，命令用法归 [README](README.md)。以下承诺约束实现。

## 任务与 policy

I03。任务事实来自现有 Issue 的唯一 `omne-integration-binding:v1` JSON 区块，精确格式归 delivery/binding.ts。当前 revision 和 attempt、身份、责任、路线、taskBase 与写范围必须匹配。context 仅缓存事实。平台 Stage、关闭及交付接受不由本模块写入。

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

远端读取只取链上各轨道的分支与起点标签，以及 `github-gate` 分支上的 `gate/cutover.json`，不枚举或拉取其他标签。核对下限与本模块无关。`status` 与 task-sync 不做上游链核对。

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

## 验证义务与限制

持续测试必须驱动真实隔离 Git 与 CLI，覆盖：policy、轨道与派发决定字段的正反例，包括 `parent` 与 `initialBase` 必填、`initialMain` 与其他未知字段拒绝、保留名与自指拒绝；三种 route 的目标分支，以及 global 与 cross-track 指向非顶层轨道时拒绝开工；I14 的每一项，包括链上未登记、retiring、retired、分支不存在、registry 仍为 active 而分支已删除、标签 `parent` 与 registry 不一致、旧标签缺 `parent` 按 main、无标签而有切换点时 `parent` 必须为 main、两者都没有、远端读不到，并且链外条目的问题不影响开工；不读取采用文件、锚点或标签的开工；reviewer 与 team 成员的派发、撤销和不相关平台变化；I15 的来源识别与非法覆盖值、事实齐备时写出 context、两次采集都不发 GraphQL 与 environment 读取，以及每一项评论、区块、运行与授权核对的反例，每个反例都不写 context；I15 的等待与超时用注入的时钟、睡眠与随机数在单元层验证；status 的未绑定、已绑定、behind、diverged 与远端读取失败；task-sync 的正常前进、T 等于 targetBase、未绑定，以及 T 未合并、T 不在远端目标历史、targetBase 后退或跳到另一条历史、工作树有改动、远端读不到等反例，每个反例都不改 context；同步后 baselines 使用新 targetBase、审计仍从 taskBase 开始。GitHub 响应模拟只能证明解析及请求协议。真实 Rulesets、Actions、权限、云端代理、`delivery-facts` workflow 与宿主加载不由本模块的测试证明。

Git 网络读取使用 policy 的 `timeouts.networkMs`，fetch 仅在本地缺对象时执行。超时或读取失败为 unknown。平台读取沿[Get an issue comment](https://docs.github.com/en/rest/issues/comments#get-an-issue-comment)。这些来源不代替实际运行证据。
