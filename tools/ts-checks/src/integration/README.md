# 使用分支集成工具

从仓库根运行。行为承诺归 [SPEC](SPEC.md)，工程节奏归[多层分支规则](../../../../docs/engineering/integration.md)。采用状态从可信main、正式tag和实际context读取；首次接入记录见[工程启用任务](https://github.com/nemori-ai/omne-harness-lite/issues/195)。命令存在不授予项目 ref 或平台写权限。

## 先观察

```sh
node --experimental-strip-types tools/ts-checks/src/integration/cli.ts status
node --experimental-strip-types tools/ts-checks/src/integration/cli.ts baselines
```

`--root` 指定实际被操作的 Git 工作树。引擎核 root、gitDir、分支及采用 anchor。`status` 只读本地。pending 使用原工具默认；adopted 缺 context、anchor 或可信 main 为 unknown，不接受显式 `--base` 绕过。无任何采用线索或 remote 的普通 Git 仓库继续支持原来的显式 SHA 检查。

变更命令统一读取严格 JSON：

```sh
node --experimental-strip-types tools/ts-checks/src/integration/cli.ts execute \
  --root "$SUBJECT" --input "$COMMAND_FILE"
```

`COMMAND_FILE` 是命令参数，不能代替授权。下面列出的对象是完整命令形状；SHA、URL、operation 和路径须取真实读回值。CLI 错误退出2并输出 code/message；检查入口维持自己的退出码。输出中的 unknown、stale、not-observed 均不是发布成功。

## 首次采用及新 clone

`integration-policy.json` 登记具名owner、轨道及四类实际命令。当前轨道责任归[多层分支规则](../../../../docs/engineering/integration.md#轨道责任与保护)，不能把首次接入的development当作永久默认轨道；`github-delivery.json` 的启用只在配置发布后生效。负责人仍须提交完整建设、完成真实检查和具名采用，不能从配置存在推导正式adoption。`full` 只是命令集合名称，单次 `make check` 不证明 startup/install/migration/mainPath 已覆盖。四项须分别指向真实必需 full 命令，未配置时 activation 和 checkpoint 都拒绝。

当前 policy 的 integration、轨道附加检查和 full 都执行 `check`。它经 `check.sh` 调用完整 `integration-check.sh`，包括格式自测与工具行为测试。full 设置 `FULL=1`，日常 integration 保留影响面计划。mainPath 登记 `context-main-path` 与 `check`，其他覆盖不变。封存产品排除规则继续适用，必要工具依赖可构建。
严格工程范围的输入证明、原始 no-data 与失败条件见[回路状态](../../README_ZH.md#回路状态)。已验证且输入未变的行为证据沿用原记录；采用工具仍须在精确 construction 上执行已登记的 full 命令。旧 adopted runner 的预检与新 runner 的实际工程验证分开记录。

依赖从锁文件安装。模板先运行 runner 和 subject 的 `pnpm install --frozen-lockfile --ignore-scripts`，不执行候选 lifecycle；runner 的 Python 环境由 `uv run --project RUNNER --locked` 准备。安装失败是失败。runner 固定 policy commit 的整棵树、工具和锁；subject 安装的是待测锁。构建产品仍会运行 subject 的产品脚本，这不是执行不可信代码的沙箱。平台权限、包来源及执行环境须由负责人提供。不能拿旧树的 node_modules 或旧账本假称已验证新的 runner。

在完整 construction 的 clean、可信 main 检出：

1. 以 `{"kind":"activation-check","legacy":[]}` 运行真实 full 检查。已有任务需要豁免时，在 legacy 中列出每树 `root/gitDir/branch/head/task` 的实际元组。task 是原任务定位；legacy 只保留该旧任务，不能用 `start` 发放新任务。
2. 交给具名 owner 输出中的 operation、checksDigest、constructionHead、legacyDigest。owner 的真实 Issue comment 使用下述 adopt schema，并确认 construction 包含全部正式成果。工具不替人提交或丢弃未提交内容。
3. 执行 `{"kind":"activate","operation":"实际UUID","authority":"真实评论URL"}`。采用 tag 和完整 construction 绑定，不改 enabled 或 cutovers。
4. 新 clone 执行 `{"kind":"bootstrap"}`，完整读取采用 tag 链。没有远端读回不能把缺 tag 判 pending。完整查无首次 tag 只形成该次 positive-absence；保留任一已知采用线索时，tag 或 cache 缺失仍 unknown。

实际接入须禁止覆盖和删除采用 refs。空 namespace 不是历史上从未采用的证明；新 clone 与权威同时失去全部历史线索时，Git 无法判别。owner 须核对初次采用依据或恢复责任，不能仅凭该空查询授权启用。

启用前另核实际 GitHub atomic push、精确 lease 资格、Rulesets、Actions 和两宿主加载。隔离 bare Git 与响应模拟不证明这些部署前提。

## 任务与执行权

Issue 正文的 `当前执行与交接` 中放唯一 `json omne-integration-binding:v1` 围栏区块。形状归 [TaskBinding](../delivery/binding.ts)：schemaVersion=1；issue 包含 repository/id/number/url；revision 等于正文交付修订；attempt、responsible、branch、route、completionTarget、taskBase、writeScope、dispatch、conditions、authorization 都必填。route 为 `{kind:"track",track:ID}`、`{kind:"global",owners:[受影响拥有者]}` 或 `{kind:"cross-track",owners:[受影响拥有者]}`。completionTarget 为 track/main/stable。conditions 只引用同卡条件 ID。

taskBase 是开工固定 SHA，不能用 FI 后的目标替换。work branch 必须以 responsible 加 `/` 开头。dispatch 是下述 dispatch 决定的真实评论 URL。用现有单调度者发放权限、原正文单写者维护绑定；worker 不争写摘要。

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

`register` 与 `start` 同一准入。两者只读取目标任务闭包、授权卡完整评论和目标任务 Project 状态，不枚举仓库历史或全 Project items。闭包最多 32 个 Issue、8 个边层级，独立授权卡计入总数。必需页、条件解析或配置字段不完整时拒绝。Stage 已确认且完整读取后未设值时，`null` 合法。创建 context 前双读相关输入，变化则拒绝写入。

执行失败不创建部分 context。已有同绑定可读回；另一绑定须明确新树。离线 delivery capture 可作观察，不作派发或发布资格。

## 准备、验证和发布

`prepare` 的 `sources` 使用完整固定 commit SHA，拒重复；每次自动固定权威目标 B。以下模式共用一个引擎：

| mode       | 额外字段                          | sources                                   | 目标                 |
| ---------- | --------------------------------- | ----------------------------------------- | -------------------- |
| work       | 无                                | 一个 `{kind:"work",source:SHA}`           | Issue route          |
| fi         | track                             | 一个 `{kind:"main",source:SHA}`           | 登记轨道             |
| ri         | 无                                | 一个 `{kind:"track",track:ID,source:SHA}` | main                 |
| joint      | 无                                | 多个 track source                         | main                 |
| task-sync  | 无                                | main/track source                         | 当前任务人的工作分支 |
| checkpoint | checkpoint；首次还有 initialAudit | 一个 main source                          | stable               |

例如 `{"kind":"prepare","mode":"ri","sources":[{"kind":"track","track":"实际ID","source":"实际SHA"}]}`。RI/joint 自动推导完整 pending prefix 的任务集合。可传 declaredTasks 供精确核对；漏卡、额外卡、缺 unit、未登记父提交均拒绝。checkpoint 从 main 的完整 unit 前缀推导旧 stable 尚未包含的各卡。

prepare 可给单行 `title`（type(scope):具体结果）和 `provenance:{harness,role}`。agent 流程须填实际宿主及角色；纯人调用不虚造来源 trailer。author/committer 使用实际人的 Git 配置，不加 Co-Authored-By；来源不授权限。操作输出 operation、subject 和固定候选；过程在实际根 `tmp/integration/OP/`。冲突由此次集成 owner 在输出的独立 subject 解决并提交，再执行 `{"kind":"seal","operation":"实际UUID"}`。不得 amend 已封存候选；变化后新建操作。

执行 `{"kind":"verify","operation":"实际UUID"}`，取得 receiptDigest。必须使用原 operation 的根查找记录。runner 来自采用提交；`scripts/integration-check.sh` 用显式 subject 调用 runner 的 checker/config，不转调候选 Makefile 或 check.sh。每项真实命令、退出码、日志散列及前后 HEAD/tree/clean 都入回执。任务 writeScope 审计沿自身 first-parent 历史，已登记运输源保留自己的审计；合并新增编辑仍受约束。验收锁对任务历史逐提交检查，不能用净 diff 掩盖先改后改回。

owner 的 publish 评论须精确绑定该回执和每张卡。执行 `{"kind":"publish","operation":"实际UUID","authority":"真实评论URL"}`。此命令有真实 Git 副作用；必须已有该目标的授权与凭据。它不写 Issue/Project。

候选相同且 source 分支后来前进时保留原 S；目标 B 已变则旧候选拒绝。建立新候选、重新验证及取得适用的精确授权。tool/command/receipt/log 或候选改变会使旧证据失效。

## 条件与历史任务

交付条件表允许第七列 `适用目标`，六列表默认 all。integration 支持 all/track/main/stable 或完整 `refs/heads/main`、`refs/heads/stable`、`refs/heads/integration/ID`。未登记 scope 拒绝。进入 main 前的条件只阻 main；work→track 可先完成。start/acceptance 保持 all，最终“main 包含本结果”写 acceptance，避免运输自锁。

publish confirmations 绑定当前条件摘要 `conditionDigest(condition)`、责任和证据。没有这些真实决定不能把普通观察升级为满足。已接受或关闭的 track 结果后续仍可 RI/checkpoint，但 owner 必须给 exact revalidations：historical 是 `digest(canonical(TaskAudit))`，current 是 `digest(canonical({binding,state,updatedAt}))`，并给未撤销及仍适用的证据。两份元组保留，不用新 revision 覆盖历史 unit。旧 work operation 不能凭此复用过期 attempt。

## 真实授权评论

URL 为配置仓库的 Issue comment。工具固定只读 `gh api GET`，核 Issue 非 PR、repository、number、comment、user.login/node_id、policy action 权和当前采集；author_association 不授予权。支持一个 `json omne-integration-authority:v1` 区块。共同字段为 schemaVersion=1、action、policyRevision、responsible、basis（非空依据数组）。各 action 另需：

| action          | 字段                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| dispatch        | task 完整 binding、confirmations                                                                                          |
| publish         | operation、candidate、expectedBase（首次 null）、sources、tasks、receiptDigest、allowedRefs、confirmations、revalidations |
| adopt           | policyCommit、constructionHead、constructionComplete=true、legacyDigest、bootstrapBasis、checksDigest                     |
| policy-adopt    | previous、policyCommit、handoffDigest、checksDigest                                                                       |
| track-bootstrap | track、mainAnchor、allowedRefs、expectedAbsent=true                                                                       |

精确运行时 schema 归 [authority.ts](authority.ts)。unknown 字段不接受。confirmations 每项 issue/condition/digest/evidence；revalidations 每项 historical/current/evidence。撤销评论用 `json omne-integration-revocation:v1`，其 `decisions` 数组列出被撤销决定 URL；出现适用撤销则拒绝，需 owner 新决定。完整撤销治理仍由交付协议拥有。

## 恢复和 checkpoint

事务前封存 intent。发布失败或超时，执行 `{"kind":"resume","operation":"实际UUID"}` 只读 refs；不盲重发。published 表示 branch/tag 精确符合，published-advanced 表示 tag 符合且目标已包含 C 后前进。not-observed 只说明 B 尚在且 tags 不在；unknown/split/collision 交 owner 核对。重复 publish 已有 intent 时也只观察。

checkpoint 直接使用已有 main C，不创建 stable 开发提交。旧 stable 只需是 C 祖先。相同 checkpoint 名已绑定相同 C 且原 unit 与 stable 可核时返回已有事实，不另写 tag；异 C 拒绝。要前移到另一 C 必须换名。full 每项须真实执行，旧 ledger 无效。

技术 handoff 报 declaredTarget、observedTransport、acceptance=unknown、platformWrite=not-performed。Git 已发布但 Issue 投影未完成，由原正文单写者接续；不能自动 Accepted、Closes 或创建第二队列。

## 轨道及规则升级

`{"kind":"track-register","entry":完整Track}` 返回 proposed policy；不写文件或登记远端。Track 字段归 [policy.ts](policy.ts)。提交 revised policy 后，在 clean main 执行 `{"kind":"policy-check"}`，用旧 adopted runner 的 full 命令核验新源码，输出 exact handoffDigest/checksDigest。handoff 列所有本地工作树及 context；owner 要先核对其他 clone 的待发布操作。采用决定确认旧 context/operation 全部失效，保留证据并向新派发接续，不能让旧候选跨规则发布。

执行 `{"kind":"policy-adopt","operation":"实际UUID","authority":"真实评论URL"}`，再 bootstrap。不自动采用候选的新 checker。authority transport 的迁移不包含在此命令，需单独部署决定。

采用 registry 后，`{"kind":"track-bootstrap-plan","track":"实际ID"}` 输出 operation/mainAnchor/allowedRefs。owner 记录对应决定后运行 track-bootstrap，expected absent 原子创建轨道和初始 unit。暂停/owner变更/退役状态仍通过 revised policy。

`{"kind":"track-retire","track":"实际ID"}` 给完整 pending prefix、任务与工作树清单。它不删除 refs/trees/tmp。清理须在任务、接受、投影及唯一材料交接闭合后另获授权。

## 持续验证

```sh
pnpm --filter @omne-harness/ts-checks exec vitest run \
  tests/integration-context.spec.ts tests/integration-engine.spec.ts \
  tests/integration-transport.spec.ts tests/integration-boundaries.spec.ts
pnpm --filter @omne-harness/ts-checks typecheck
```

这些测试用临时真实 Git（含 bare 权威仓库）和受限只读 GitHub 响应。真实仓库检查、fixture 检查、平台部署及宿主加载分别报告，不能互相代替。

幂等身份是已创建的 operation。publish/resume 对同 operation 只接续或观察，不另建 commit/tag。每次 prepare 是新的构造请求并分配新 UUID；中断后先从 tmp/integration 找回已有 operation/draft，不能把重复 prepare 当自动重试。

首次 activation-check 会为本次检查自动传递 bootstrap-check 范围。它只覆盖完整 construction 的实际 subject，记录 root/gitDir/main SHA/descriptor/operation/namespace；各子 checker 的共同 loader 每次真实重读 authority main 和完整采用 namespace，前后也再核。未采用且精确输入不变才返回当次 pending；任何既有 anchor、latch 或采用 ref 都不因参数消失。此参数不授 start/publish 权，也不豁免 runner 的另一 gitDir。命令结束后普通 status 仍 unknown 是正常结果；activate 的真实采用成功后才变 adopted。无需保存 positive-absence 文件或手设环境变量。

网络读取与推送使用 policy networkMs；首次 bootstrap 为30秒。fetch 仅在本地缺对象时执行。超时记录未知，先按原 operation 观察实际 ref，不自动重发。

政策升级前，具名 owner 从 handoff 开始冻结各 clone 的发布；列清在途操作，采用和 bootstrap/任务接续完成后再恢复。变更命令每次读取完整权威采用链，旧 clone 遇新 anchor 会拒绝；工具不静默 bootstrap。publish 更新前再次核采用链，但它与 branch CAS 不是跨 ref 原子事务，不能用该读回代替升级期间的发布冻结。
