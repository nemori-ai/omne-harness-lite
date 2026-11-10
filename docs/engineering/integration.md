# 轨道与 gate

本页拥有轨道、gate 与准入的时机和规则。精确工具行为归[集成工具契约](../../tools/dev-flow/src/integration/SPEC.md)，命令归其[README](../../tools/dev-flow/src/integration/README.md)；进轨道、提升与发行的操作顺序归 [`omne-card`](../../.meta_harness/agents/skills/omne-card/canonical/SKILL.md)。卡与接受归[卡与交接信息包](delivery.md)，不新增活动队列或自动接受规则。

## 分支与任务

自 2026-10-15 起，四条主干的进入按[现行准入](#现行准入)执行：`github-gate` 的流程构造合并并写记录标签。本机集成工具只负责在 `pnpm run check` 中核对契约快照与 dist（`contract-check`）、等待 gate 运行并代为确认（`gate-cli.ts wait`），以及派发工具包的发行运行（`release-run`）。它不构造候选，不验证候选，也不发布。

main 保存完整集成结果。`integration/mainline` 是唯一的轨道。stable 指向 main 中经过完整检查的既有 checkpoint。轨道和 stable 不加用户名；工作及临时分支遵守人的署名约定。

一张卡由一个会话从卡给定的起点交付，经 gate 进入 `integration/mainline`，见[卡就是交接信息包](delivery.md#卡就是交接信息包)。交付会话在工作分支上用普通的 `git merge` 合并 `origin/integration/mainline` 来同步轨道头，步骤见 `omne-card`「开工」与「进轨道」。依据 [RFC-0014](../rfcs/RFC-0014-single-card-session-and-gate-relief.md)：认卡、执行记录（attempt）、绑定、`start`、task context、双基线、目标基线同步与轨道树已退役。

## 轨道责任与保护

[policy registry](integration-policy.json) 登记轨道身份、owner、状态、上游和固定起点。下表是当前的轨道责任。

| 轨道                                | 责任与适用任务                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `integration/mainline`              | 联调轨道：唯一的轨道，上游是 main，承接卡、跨线集成、联合验收与破坏性契约改动。在它上面完成联调测试与验收后直接提升到 main。依据 [#973](https://github.com/nemori-ai/omne-harness-lite/issues/973) |

轨道的起点记在 registry 的 `initialBase`，后续合并不改写起点。不再新建轨道或子轨道。

GitHub 对 `integration/**/*` 分别实施三项保护：只有仓库管理员可删除，所有人禁止非快进更新，创建与更新只允许发布身份 `omne-harness-lite-publish`。删除权限不代替退役交接和具体动作授权。

main 与 stable 禁止删除和非快进更新，创建与更新只允许发布身份。adoption、unit、checkpoint 标签禁止修改和删除，无 bypass。其中采用标签（`omne/integration/adoption/*`）与旧 unit 标签作为历史保留，任何工具不再读取。平台保护不验证任务接受；管理员修改规则本身属于管理权限。

## 三类 PR

主干之间只有下面三类 PR，其他组合一律拒绝，包括个人分支进 main：

| base | head | 类别 | 覆盖核对 | 工具链闸门 |
| --- | --- | --- | --- | --- |
| `integration/mainline` | 个人分支 | work | 无 | 命中清单时需要 |
| `main` | `integration/mainline` | promote | mainline 在核对下限之后的每个 first-parent 提交都有目标为 mainline 的 unit | 不需要 |
| `stable` | `main` | stable | main 在切换点之后的 first-parent 历史 | 不需要 |

main 只接受 mainline 的提升，所以没有从 main 同步进 mainline 的 PR。核对下限先取 `github-gate` 上 `gate/cutover.json` 的切换点，没有时取起点标签 `omne/gate/track/mainline` 指向的提交。gate 流程的实际判定归 `github-gate` 分支的 `gate/README.md`。

## 完整集成

工作分支经 PR 向 mainline 运输完整源前缀。提升经 mainline 进 main 的 PR，把 mainline 未被 main 覆盖的完整单元带到 main。破坏性修改同时交付定义、提供者、真实消费者与测试。选择性 cherry-pick 不构成正式提升。

`gate-publish` 每次合并同时创建不可修改的 `omne/gate/unit` 记录标签。每次提升前，流程核对 mainline 的每个 first-parent 提交都有 unit 记录，所以缺口被拦住。运输层改变不自动新建卡或提高交付修订。

## 权限、候选与恢复

四条主干的发布由 `github-gate` 的流程执行，确认权限见[现行准入](#现行准入)。本机集成工具不构造候选，也不验证或发布。确认不是任务接受。进入轨道、main、stable、交付接受与关闭分别记录。发布流程不写卡的接受，也不关卡。

运行结果未知时，先读运行页面、目标分支和 `omne/gate/*` 标签，不盲目重新派发。Git 已发布而 Issue 投影失败时，由原正文单写者修复技术记录，不重放 Git。

流程失效时，按 [RFC-0009](../rfcs/RFC-0009-adoption-and-local-tool-retirement.md#流程失效时的恢复) 恢复：

- `github-gate` 上的流程出错：admin 修正 `github-gate` 后重新启动流程。流程会重新核对目标与 PR，重复启动不会重复发布。
- Actions 或发布身份不可用：admin 在一张 Issue 中写明原因，临时把自己加入相应规则集的例外，用普通的 Git 命令完成合并并推送，再恢复规则集并读回。推送产生的提交没有 unit 记录，`gate-reconcile` 会把它报告为缺口 Issue。admin 在缺口 Issue 中写具名决定，说明该提交的来源与处置。第一阶段的 `github-gate` 没有补建 unit 的流程，`gate-reconcile` 只报告、不创建标签。这类缺口按[现行准入](#现行准入)中“没有 unit 的主干提交”的两步闭合。

admin 修改规则集属于管理权限，定时核对与记录核对照常适用。

## 稳定点与轨道

stable 选择 main first-parent 历史上的已有提交，只要求旧 stable 是其祖先。完整检查的要求见[第二阶段目标](#第二阶段目标)。main 后续前进不改变选定 checkpoint。

轨道 registry 记录稳定 ID、分支、owner、来源、状态、`parent` 与 `initialBase`。只登记 `integration/mainline`，它的 `parent` 是 main。owner 更换先交接未提升的成果与活动的卡。

其他 `integration/*` 分支不再登记，由 admin 删除。轨道上的记录标签保留，分支删除后这些提交仍可经标签找到。尚未提升的成果由删除的人负责处理，例如经个人分支转入 mainline，或确认放弃。删除 ref、工作树或唯一临时材料仍按[工作约定](workflow.md#责任与协作交接)和[发布边界](publication.md)取得明确授权。Git revert 不撤销外部副作用。

## 现行准入

现行准入依据 [RFC-0011 revision 1](../rfcs/RFC-0011-trunk-admission-and-track-tree.md#决定范围)。它取代 RFC-0004 中仍然有效的范围，并部分取代 RFC-0009 的三处条款与 RFC-0002 的准入缓存策略。RFC-0008 与 RFC-0009 的其余准入条款仍由原提案拥有，RFC-0011 第 16 至 18 节只作复述。第一阶段自 2026-10-15 起执行，切换记录见 [Issue #208](https://github.com/nemori-ai/omne-harness-lite/issues/208#issuecomment-6184302633)。单一轨道依据 [RFC-0014](../rfcs/RFC-0014-single-card-session-and-gate-relief.md)，它部分取代 RFC-0011 的轨道树与 RFC-0009 的双基线。

四条主干是 `integration/mainline`、`main`、`stable` 和 `release`。代码从 mainline 提升到 main。`release` 只定对外发布的位置，还没有创建。

第一阶段的规则如下。

- 四条主干只经 PR 进入，个人工作分支不受限制。PR 只有[三类](#三类-pr)。stable 只快进到 main 的 first-parent 历史上的提交。head 为 `stable`、`release` 或 `github-gate` 时一律拒绝。`release` 创建之前，以它为 base 的 PR 一律拒绝。
- 派发 `github-gate` 分支上的 `gate-publish` 流程，传入 PR 号和 PR head 的完整提交号。合入 stable 时还要传 checkpoint 名称。命令见 `github-gate` 分支的 `gate/README.md`。
- 本地检查的基线取显式给出的基线，没有时取 `origin/main`；收工钩子例外，它在 `origin/main` 与活跃轨道中取离 HEAD 最近的合并点，见[收工钩子](../../tools/repo-toolchain/README_ZH.md#收工钩子)。
- 一位 admin 在 Actions 的 `publish` environment 中确认，必须填写说明。admin 可以确认自己的 PR。agent 可以用 admin 的凭据代为确认，说明中注明代为确认的人。
- 个人分支进入 mainline 的 PR 如果改动仓库工具链，确认前多一道审批。流程用 `git merge-tree` 算出合并结果，把结果相对目标改动的文件与 `github-gate` 上的 `gate/toolchain-paths.txt` 比对。命中时，先由 `repo-toolchain-review` environment 的确认者确认，再进入 `publish` 的确认。工具链确认也必须填写说明，说明原文写进发布决定评论。未命中的 PR 不经这道审批。提升（mainline 进 main）和 main 进 stable 不经这道审批，它们搬运的提交都已经从个人分支进入过 mainline。路径清单由卡 [#332](https://github.com/nemori-ai/omne-harness-lite/issues/332) 建立，只在 `github-gate` 上维护。
- 确认后，发布身份 `omne-harness-lite-publish` 构造合并提交。第一父为目标，第二父为 PR head，有冲突就停止，冲突先在来源分支解决。它在一次原子推送中更新目标并创建记录标签，推送比较派发时读到的目标。合并写 `omne/gate/unit/<结果提交号>`。stable 写 `omne/gate/stable/<提交号>` 和 `omne/gate/checkpoint/<名称>`，同一提交只能进入 stable 一次：另一次发布已把 stable 推进到同一提交时，记录已存在，整次推送失败。标签正文是 `omne-gate-record:v1` JSON。
- 提升前，流程核对 mainline 在核对下限之后的每个 first-parent 提交都有目标为 mainline 的 unit。发布 stable 前，对 main 在切换点之后的 first-parent 历史做同样的核对。有缺口就停止。
- 提升 PR 由 mainline 的 owner 提出。「所含的卡」列出自上一次提升以来合入 mainline 的卡，以及这些卡在 main 上要满足的条件，行格式见 `github-gate` 分支 `gate/README.md` 的「提升 PR 的说明」。确认者据此核对条件。个人分支进 mainline 的 PR 只列本卡。两类 PR 都写「契约变化」，格式见 [PR 模板](../../.github/pull_request_template.md)。
- 已知限制：admin 停用规则集后直接推送主干，平台不能阻止，只能事后发现，依据是组织审计日志和定时核对。其中一种情形流程也无法区分：admin 在流程最后读取目标与推送之间，把 stable 直接推到本次要发布的同一提交。这时流程仍会写入记录。
- 流程不运行测试。自动检查具备之前，确认暂代轨道的自动检查，说明中写明本地运行了哪些检查及结果。确认不等于交付接受。
- `gate-reconcile` 每小时从 main 触发一次，只开缺口 Issue，不创建标签。它报告核对下限之后没有记录的主干提交与没有对应 stable 记录的 stable 尖端。缺口不设处理时限。缺口存在时，相应主干的提升被拦住。两类缺口的闭合方式不同：
  - 没有 unit 的主干提交，两步都完成后缺口才闭合。移动下限只改变核对范围。
    1. mainline 的 owner 或任一 admin 在缺口 Issue 中写具名决定。决定说明缺口提交的来源和处置，并列出该提交带来的卡（Issue 编号）。
    2. admin 在 `gate/cutover.json` 中把该分支的切换点改为缺口中最后一个没有 unit 的 first-parent 提交，并在缺口 Issue 中注明这次修改的提交。
  - stable 的尖端没有记录：admin 在缺口 Issue 中写具名决定，stable 下一次经流程发布后闭合。
- 2026-10-15 登记的原切换点之前的历史，按 #208 的决定整体认可，不补记录。下限移动后跳过的提交，以缺口 Issue 中的具名决定为依据。
- `@omne-harness/repo-toolchain` 与 `@omne-harness/repo-config` 由 `gate-release` 流程发到 npm。要发布的提交必须已有 unit 记录，并在 main 或 mainline 的 first-parent 历史上；版本号取自该提交的 `package.json`，npm 上已有的版本不再发布。确认走 `npm-release` environment，必须填写说明。发布用 npm 可信发布（GitHub OIDC，不存长期 token），附来源证明；流程把结果写进指定 Issue 的决定评论。命令见 `github-gate` 分支的 `gate/README.md`。首个版本 0.0.1 由 AIEPhoenix 手动发布，记录见 [#332](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6209941107)。仓库检查运行哪个版本由 `pnpm-workspace.yaml` 的 catalog 钉住，升级先发版本、再改钉子，见[仓库工具链的版本](../development.md#仓库工具链的版本)。

平台配置如下。main、轨道和 stable 的创建与更新只允许发布身份。`github-gate` 只有 admin 能创建和更新，禁止删除和非快进。`omne/gate/*` 标签只有发布身份能创建，任何人不能修改或删除。仓库只允许 merge commit。`publish` environment 的确认者为 admin，关闭管理员跳过，只接受 `github-gate` 上的运行。`repo-toolchain-review` 与 `npm-release` 两个 environment 的确认者与 `publish` 相同，同样关闭管理员跳过、只接受 `github-gate` 上的运行，不存放密钥。调整 `publish` 的确认者时同步调整它们。切换点记在 `github-gate` 的 `gate/cutover.json`。历史记录的认可范围见上文 `gate-reconcile` 一条的末项。

发布身份的 App 归组织所有，密钥只放在 `publish` environment，不放仓库级 secrets。审计日志、`github-gate` 的改动和密钥轮换由组织和项目的管理者按需要处理，不设固定周期。流程使用 GitHub 托管 runner。

交付身份是另一个组织所有的 App `omne-harness-lite-delivery`，决定见 [#546](https://github.com/nemori-ai/omne-harness-lite/issues/546)。它只写交付元数据、读权限事实：仓库 Issues 读写、Environments 只读、组织级 Projects 读写，不能写代码或主干。它只安装在本仓库。

交付身份的密钥只放在 `delivery` environment。该 environment 只接受 `github-gate` 上的运行，所以只有 admin 写入 `github-gate` 的流程能使用这把密钥。该 environment 不设确认者，流程运行时不等人确认。

`github-gate` 上的 `delivery-facts` 用交付身份为 Claude Code 云端会话读取开工事实，用法见 `github-gate` 的 `gate/README.md`。本地会话直接读取，不经过这个流程。

已知风险：交付身份的密钥外泄时，持有者能修改组织内全部 Project，能编辑或关闭本仓库的 Issue（包括卡正文），也能发出伪造的开工事实评论。这把密钥按与 admin 权限同等的级别保管和轮换。

### 第二阶段目标

turbo 构建体系建立后进入第二阶段。轨道改为自动检查通过后经合并队列自动合并，取消轨道的确认。增加报告身份和按改动范围的必需检查。受信检查器的版本由仓库的钉子承载，不在 `github-gate` 上另存版本文件；升级按[仓库工具链的版本](../development.md#仓库工具链的版本)先发版本、再开改钉子的 PR，新旧版本各跑一遍。集成条件评论的格式随之确定。

影响面的成员选择、构建、类型检查与成员测试由 turbo 调度。`tools/test-runner` 算出计划并调用 turbo（`turbo.ts`），可执行验收仍由它逐成员运行。[RFC-0002 revision 2](../rfcs/RFC-0002-engineering-toolchain.md#影响面选择) 要求的四条约束已在测试运行器中实现：未识别文件转全量，`turbo.json` 一类选择配置是全局文件，基线显式传入，准入检查不读 turbo 任务缓存。实现方式见[迭代中的受影响测试](../development.md#迭代中的受影响测试)。

stable 的完整检查即 `OMNE_ADMISSION=1 FULL=1 pnpm run check`，由目标分支钉住的检查器版本运行，不再从 policy 读取检查清单。

## 同步与提升的节奏

以事件触发为主。交付会话在开 PR 前与 mainline 头有破坏性变更后，按[分支与任务](#分支与任务)合并轨道头。mainline 以完整小批量及时提升 main，避免长时间累积漂移。不按日历增加全量构建或付费模型预算。破坏性公共变更由 mainline 的 owner 协调相关 owner，在继续依赖工作前闭合。

`gate-publish` 遇到冲突就停止，冲突先在来源分支解决，涉及含义的取舍交相应语义 owner。worker 提供来源和测试，不直接修改共享目标来解决冲突。解决冲突后的合并结果需要实际组合验证；各源单独通过不能代替它。

## 清理与 policy registry

清理前先核 Git 已发布、各卡剩余接受与投影责任已交接、唯一 tmp 有去向，再按现有权限清理。ref 状态未知或分裂时保留证据，不盲目重建或重试。

[policy registry](integration-policy.json) 只含 `schemaVersion`、`revision`、`repository`、`deliveryConfig`、`tracks`、`transport` 与 `timeouts`。`timeouts` 只含网络读取时限 `networkMs`。它现在的读者是收工钩子：按它的轨道找本树的基线分支（[hook-base.ts](../../tools/repo-toolchain/src/loop/hook-base.ts)）。registry 属于仓库工具链路径，改动经仓库工具链变更闸门确认，见 [RFC-0008](../rfcs/RFC-0008-repo-toolchain-trust.md)。

## 检查责任

第一阶段的检查责任按[现行准入](#现行准入)执行：提交 PR 的人在本卡的工作树中运行检查，确认者在说明中写明实际命令和结果。基线按现行准入取显式基线或 `origin/main`（收工钩子的基线例外，见现行准入）。main 本身，例如进入 stable 的 PR，第一阶段没有正式检查入口；确认者写明实际运行的命令及其限制，不写成正式检查结论。第二阶段由报告身份在候选上运行必需检查。

进入任何一条主干（轨道、main、stable、release）之前的检查都是准入检查，不读 turbo 任务缓存（本地与远程），只写本地缓存。缓存命中时任务不会真正运行，检查会显示通过而实际没有运行。合并前的检查带 `OMNE_ADMISSION=1` 运行，进入 stable 时由确认者带这个变量运行；确认说明写明实际命令，没有带这个变量的运行不作为准入检查结论。准入只有一步失败时，按[增量准入](#增量准入)提供证据。准入检查是否写远程缓存仍归 [RFC-0002](../rfcs/RFC-0002-engineering-toolchain.md) 的未决项。成员测试的结果缓存与依赖图缓存同样按这条规则：准入时不读，只写。其他缓存（例如 pnpm 按锁文件完整性校验取包的 store）不在这条规则内。本地缓存 `.turbo/` 不进入 Git。

0.0.1 的封存产品树已从仓库删除，原件见[固定提交](https://github.com/nemori-ai/omne-harness-lite/tree/250d074a88223b7f7dced248ba08ca0160485f31)。工程检查不构建、不测试、也不验收封存产品，工具自身的安装、构建和测试也不依赖它们。新 packages/apps 仍是产品骨架，产品传感器没有输入时如实报告无数据，工程检查通过不代替产品质量结论。新版产品的 startup、数据迁移及严格产品传感器门槛须由未来真实成员提供证据。

下面两节依据负责人 2026-10-30 在 [#945](https://github.com/nemori-ai/omne-harness-lite/issues/945) 的裁定。卡或负责人要求整次重跑时照办。

### 增量准入

准入只有一步失败时，修复后做增量准入，不整次重跑。增量准入是影响面准入的一种，它的基线是上一个已准入的头。

前提，三项都成立才适用：

1. 头 H1 上整次运行了一次准入，带 `OMNE_ADMISSION=1`，范围按本次要求（影响面，或 `FULL=1`）。整次运行指一次 `pnpm run check`，不是逐步组合。它在步骤 X 快速失败，其他跑完的步骤都通过。
2. 修复后得到最终头 H2，H1 是 H2 的祖先。
3. H1..H2 的差异不碰全局路径。全局路径以 `tools/test-runner/test-runs.config.json` 的 `affected.globalPaths` 为准，例如锁文件与工具链配置。碰到全局路径时不适用本节，在 H2 上整次重跑。

在 H2 上带 `OMNE_ADMISSION=1` 运行下面的步骤。步骤的轻重以 [check 的步骤图](../../scripts/README.md#check-的步骤图)为准。

1. 失败步 X。
2. H1 上因快速失败没有跑完的全部步骤，包括被终止的与没有启动的。
3. 全部轻步骤。
4. 在 H1 上已通过的重步骤（构建、类型检查、成员测试与验收），只对 H1..H2 的差异影响到的成员运行。

第 1 至 3 项的范围与 H2 上整次运行的范围相同，基线不变。只有第 4 项以 H1 为基线收窄。

证据写成「H1 上的整次准入（失败于步骤 X）＋ H2 上的增量准入（基线 H1）」，并附 H1..H2 的差异。

`pnpm run admission --resume-from <H1>` 一次跑完上面这些，与 `pnpm run check --admission --resume-from <H1>` 相同。`--resume-from` 只在准入模式下可用。命令读 H1 那次准入写下的运行记录，核对前提 1、2 和记录条件，不满足就以 2 退出。H1..H2 碰到全局路径时，命令按前提 3 在 H2 上整次重跑，范围同 H1 那次，并写明原因。否则命令按上面四项选步骤与成员，证据写进准入日志。H1 只按影响面运行时，第 1 至 3 项也按影响面运行，H1 记录的基线合并点必须与本次相同。接续运行的记录不能再作 H1。记录条件与用法见 `tools/test-runner/README_ZH.md`「准入：运行记录、接续与证据核对」。H1 上的准入没有留下记录时，按下面手工组合。

用 `node --experimental-strip-types tools/test-runner/src/testing/cli.ts` 的三个子命令手工组合上面的步骤，运行时带 `OMNE_ADMISSION=1`：

- `check --list` 打印步骤表：步骤名、前置步骤、轻重和命令。按它与 [check 的步骤图](../../scripts/README.md#check-的步骤图)找出第 1 至 3 项的步骤。
- `plan --json <路径>` 写出计划文件。第 1 至 3 项用默认基线的计划，第 4 项用 `plan --base <H1> --json <路径>` 的计划。
- `step <步骤> --plan <计划文件>` 按计划执行 `python`、`build`、`typecheck`、`test`、`acceptance` 中的一步。其他步骤按步骤表里的命令运行。

### 树相同时复用准入

要在一个提交 F 上做全量准入（`OMNE_ADMISSION=1 FULL=1 pnpm run check`）时，例如 `integration/mainline` 提升 main，F 的树与一个已通过全量准入的头的树相同，那次准入就是 F 上的全量准入，不重跑。

- 比对方法：对两个提交分别运行 `git rev-parse <提交>^{tree}`。两个输出相同，两棵树就相同。核对命令：`node --experimental-strip-types tools/test-runner/src/testing/cli.ts admission-evidence --for <F>`，它在本树 `tmp/admission/*.json` 里找树与 F 相同、干净且每步都通过的全量准入记录：带 `FULL=1` 的整次准入记录，或 H1 带了 `FULL=1` 的接续记录。接受时写明两个提交与树哈希（退出 0），否则逐项列出拒绝原因（退出 1）。
- 准入证据写明两个提交与同一个树哈希。
- 那次准入可以是一次整次运行，也可以是按[增量准入](#增量准入)组成的证据。用增量准入的证据复用时，H1 上的那次整次运行必须带 `FULL=1`。H1 上只按影响面运行时，组成的证据不是全量准入，不能按本条复用。
- 本条只替代全量准入。联调验收命令照常在 F 上运行。
