---
id: RFC-0009
title: 采用机制与本机发布工具的退役
revision: 1
status: accepted
owner: Brian Lee
---

# RFC-0009：采用机制与本机发布工具的退役

规则与维护责任见[RFC入口](README.md)。本提案部分取代 [RFC-0004](RFC-0004-trunk-pr-admission.md) revision 1：采用标签与 policy registry 作为受信来源的条款、本机集成工具在四条主干上的角色与改造计划，以及流程失效时的恢复方式。精确取代范围见「决定范围」。RFC-0004 的其他条款不变，RFC-0004 保持 accepted。

本提案承接 [RFC-0008](RFC-0008-repo-toolchain-trust.md)「决定范围」中留给后续提案的部分：采用命令与本机发布命令的退役及相应的恢复路径，以及 task-sync 的实现方式、`track-retire` 与检查命令清单的删除。来源是 [#290 的实施方案](https://github.com/nemori-ai/omne-harness-lite/issues/290#issuecomment-6188641420)「流程工具怎么改」与落地顺序中的退役一步。提案采用、规范写回、实现和交付接受分别判断。2026-10-16 采用本提案 revision 1，记录见 [#362 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/362#issuecomment-6217265901)。规范写回与实施由 [#364](https://github.com/nemori-ai/omne-harness-lite/issues/364) 承接，见「写回现行正文」。

## 问题与有效输入

第一阶段的准入已经交给 `github-gate`：`gate-publish` 用 `git merge-tree` 构造合并、经 environment 确认后原子推送，并创建 `omne/gate/unit` 记录；`gate-track` 建轨道；`gate-release` 发布检查器。仓库工具链的受信版本由 RFC-0008 改为仓库里受闸门保护的 npm 版本钉子。派发权与开工准入已由 [#306](https://github.com/nemori-ai/omne-harness-lite/issues/306) 改为核对 `publish` environment 的 reviewer，`start` 不再依赖采用锚点。

旧的本机集成路径因此失去了用途，但代码和正文仍在：

1. `tools/dev-flow/src/integration` 中有 17 个命令，其中 15 个属于采用机制、本机发布与旧建轨道。仓库里没有任何 Makefile、脚本、工作流或 skill 调用它们，只有测试与文档引用。
2. 这些命令依赖采用锚点和 `policy.owners` 中的 owner 授权。#306 之后新开的工作树没有采用锚点，所以它们实际已不可用，包括 task-sync：它是 `prepare` 的一种模式，第一步就要求当前采用。现行正文仍写“task-sync 照常使用”，与代码不符。
3. `status` 仍以采用锚点和 `integration-bootstrap.json` 判断状态。在没有做过 bootstrap 的检出上，它总是返回 `unknown`。
4. `integration-policy.json` 的 `commands`、`profiles`、`checkpointCoverage`、`requiredFiles`、`owners` 只服务于上述命令，`make check` 不读它们。但 `parsePolicy` 强制要求这些字段，`start` 因此间接依赖它们。
5. RFC-0004 的恢复方式写的是“用本机工具完成发布”；它对第二阶段的设计写的是把现行本机工具拆成“检查一半”和“推送一半”在 Actions 上运行。第一阶段的 `gate-publish` 不运行本机工具，这一改造从未实施。
6. 现行准入把本机的 `prepare`、`verify`、`publish` 写成 admin 临时恢复原规则集时的恢复手段。

不处理的后果：正文描述的入口实际不能使用；退役代码继续占用维护与测试；新的执行者按正文去用 task-sync 会失败；采用标签在正文里仍像是受信来源。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0004](RFC-0004-trunk-pr-admission.md) | revision 1，accepted，[接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/249#issuecomment-6164587010) | 只取代「决定范围」所列条款；四条主干、两档准入、`github-gate` 的保护、记录流程与缺口闭合不变 |
| [RFC-0008](RFC-0008-repo-toolchain-trust.md) | revision 1，accepted，[#354 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/354#issuecomment-6213174060) | 其「不采用范围」第 1、3 项交给后续提案的部分由本提案承接；仓库工具链变更闸门与受信版本不变 |
| [#290 实施方案](https://github.com/nemori-ai/omne-harness-lite/issues/290#issuecomment-6188641420) | 2026-10-15，PanQiWei 口头确认；「流程工具怎么改」与落地顺序中的退役一步 | 本提案的来源；有改变的逐条写明 |
| [#306](https://github.com/nemori-ai/omne-harness-lite/issues/306) | 已实施 | 派发权与开工准入的现状，本提案不改变 |
| [现行准入](../engineering/integration.md#现行准入)与集成规则其他各节 | 当前正文 | 需要改写的现行源，见「写回现行正文」 |
| [集成工具契约](../../tools/dev-flow/src/integration/SPEC.md) | I01 至 I11 | 退役命令对应的条款随之删除 |

## 建议与改变范围

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 集成规则，[多层分支规则](../engineering/integration.md) | 采用状态、首次接入、清理与政策接续、本机恢复手段 | 删除采用机制与本机发布路径的描述；写入新的 task-sync 与恢复方式 | 四条主干、两档准入、闸门与记录流程不变；采用、unit、checkpoint 标签仍不可修改和删除 |
| 集成工具（`tools/dev-flow/src/integration`）及其契约 | 17 个命令，契约 I01 至 I11 | 保留 `register`、`start`、`status`、`baselines`，新增 `task-sync`；其余删除 | 开工准入的核对内容不变；task context 的读格式不变 |
| policy registry（`integration-policy.json`） | 命令清单、profiles、owners、采用条件 | 只保留仓库、交付配置位置、轨道登记、远端与超时 | 轨道登记及其 owner 字段保留，`gate-track` 继续使用 |
| `github-gate` | 路径清单列出将删除的文件 | admin 删去失效的路径 | 只有 admin 能改 `github-gate` |

### 退役的命令与文件

删除下列命令及只为它们存在的实现、测试与文档：

| 类别 | 命令或文件 |
| --- | --- |
| 采用机制 | `policy-handoff`、`policy-check`、`policy-adopt`、`bootstrap`、`activation-check`、`activate`；采用入口文件 `docs/engineering/integration-bootstrap.json` |
| 本机发布 | `prepare`（含 `task-sync` 模式）、`seal`、`verify`、`publish`、`resume` |
| 旧建轨道 | `track-register`、`track-bootstrap-plan`、`track-bootstrap`、`track-retire` |
| 受信检出运行器 | `scripts/integration-check.sh` 及 `scripts/check.sh` 中转入它的分支 |

- 建轨道由 `gate-track` 承担。`track-retire` 依赖采用锚点与旧的 `omne/integration/unit` 前缀，在现状下不能运行；轨道退役改由 admin 在 policy registry 中把轨道标为 retiring 或 retired，并删除轨道分支；轨道上的记录标签保留，不删除。具体流程跟随轨道退役另定，不再由本机工具执行。
- `scripts/integration-check.sh` 只在设置受信检出时由 `scripts/check.sh` 转入，它服务于 `verify` 的受信运行器。`verify` 删除后它没有调用者。仓库的检查运行钉住的检查器版本（RFC-0008），不需要另一个受信检出。
- 现有的采用标签（`omne/integration/adoption/*`）与旧 unit 标签不删除，作为历史保留，任何工具不再读取。标签不可修改和删除的规则不变。

### 保留的命令

- `register`、`start`：开工准入的核对内容不变：卡的修订、attempt、分支、taskBase、写范围与开工条件，拒绝已关闭的卡，一个工作树只绑定一个任务，派发权核对 `publish` environment 的 reviewer。`start` 不再读 `integration-bootstrap.json`，policy 固定读 `docs/engineering/integration-policy.json`；context 不再写 `anchor`。
- `baselines`：不变。
- `status`：改为报告本工作树的 task context 与远端目标分支：是否已绑定任务、绑定的卡与修订、`taskBase`、`targetBase`、远端目标分支当前提交，以及 `targetBase` 是否落后于远端目标。删除 pending、unknown、legacy、adopted 四种采用状态。
- task context 的读格式不变：`schemaVersion` 仍为 1，`operation` 字段保留并写 `null`。因此这些改动只在不发布的 `tools/dev-flow` 中进行，不需要给 `@omne-harness/repo-toolchain` 发新版本。

### task-sync 与两条基线

任务执行期间同步目标分支，改为两步：

1. 执行者在自己的工作分支上用普通的 `git merge` 合并远端目标分支的某个提交 T，自己解决冲突并提交。
2. 执行者运行新命令 `task-sync --target T`。命令核对后，把本工作树 context 的 `targetBase` 原子更新为 T。

`task-sync` 只在下列条件全部满足时更新，任一不满足就拒绝并不改 context：

- 本工作树已绑定任务，context 可读。
- T 是远端目标分支当前提交或其祖先。远端读不到时拒绝。
- T 是当前 HEAD 的祖先，即确实已合并进工作分支。
- 当前 `targetBase` 是 T 的祖先，`targetBase` 只能前进，不能后退或改到另一条历史。
- 工作树没有未提交的改动。

两条基线的含义变为：

- `targetBase`（目标基线）：最近一次同步进来的目标提交。影响面计算与组合检查以它为准。开工时等于派发时的目标 HEAD。
- `taskBase`（任务起点）：开工时固定，任何同步都不改变。逐提交审计、验收锁与先改后改回的核对都从它开始，并照常检查合并进来的提交的全部父提交。

集成规则「两条基线」中“候选固定目标 B 和源 S、C 第一父为 B”只描述 `gate-publish` 构造的合并结果，不描述工作分支上的同步合并。工作分支上的同步合并，第一父是工作分支自己。

### policy registry 瘦身

`integration-policy.json` 只保留：`schemaVersion`、`revision`、`repository`、`deliveryConfig`、`tracks`（轨道登记，含 owner、状态与 `initialMain`）、`transport`、`timeouts`。删除 `owners`、`commands`、`profiles`、`checkpointCoverage`、`requiredFiles`，以及轨道条目中的 `checks`。`parsePolicy` 同步改为只校验保留的字段。

#290 方案把删除命令清单放在 turbo 接替之后。这一前提已经满足：影响面的成员选择与构建已交给 turbo（`tools/test-runner` 的 `turbo.ts`），类型检查与测试仍由测试运行器逐成员运行；`make check` 不读命令清单，它的读者只有将要删除的 `verify` 与采用命令。所以命令清单与退役命令同时删除。集成规则中“受影响检查今天仍由 `make check-plan` 与 `make test-affected` 执行……这些条件还没有在 turbo 上落地”一句已经过时，随本提案写回改正。

policy registry 仍属于仓库工具链路径，改动经仓库工具链变更闸门确认（RFC-0008）。

### 流程失效时的恢复

本机工具删除之后，恢复路径如下：

- `github-gate` 上的流程出错：admin 修正 `github-gate` 后重新启动流程。流程会重新核对目标与 PR，重复启动不会重复发布。
- Actions 或发布身份不可用：admin 在一张 Issue 中写明原因，临时把自己加入相应规则集的例外，用普通的 Git 命令完成合并并推送，再恢复规则集并读回。推送产生的提交没有 unit 记录，定时核对（`gate-reconcile`）会把它报告为缺口 Issue。admin 在缺口 Issue 中写具名决定，说明该提交的来源与处置。RFC-0004「记录流程与缺口」规定闭合后由记录身份补建 unit；第一阶段的 `github-gate` 还没有补建 unit 的流程，`gate-reconcile` 只报告、不创建标签。补建入口实施之前，缺口 Issue 中的具名决定是这次恢复的处置记录。

这替代 RFC-0004「流程失效时的恢复」中“用本机工具完成发布”一句。admin 修改规则集仍属于 RFC-0004 所说的“admin 修改规则集”，定时核对与记录核对照常适用。

### 第二阶段不再改造本机工具

RFC-0004 设想第二阶段把现行本机工具拆成“检查一半”与“推送一半”在 Actions 上运行，并相应修改工具契约 I07、I08、I09、I11。第一阶段的 `gate-publish` 已经不运行本机工具，这些工具在本提案中删除，所以这一改造不再进行。第二阶段的自动检查与发布在 `github-gate` 的流程中实现；RFC-0004 对第二阶段的其他要求（必需检查由专用身份报告、检查选择、记录核对）不变。stable 的完整检查即全量 `make check`（`FULL=1`），由目标分支钉住的检查器版本运行，不再从 policy 的 profiles 读取。

“发布身份加入 `integration-policy.json` 的 owners，需要一次 policy 升级”的条款随之失去对象：流程不读 policy 的 owners，policy 也不再有 owners 字段。

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 保留本机工具作为恢复手段 | admin 在平台失效时仍可用工具发布 | 工具依赖采用锚点与 owner 授权，现状下已不能运行；要恢复它就得重新维护采用链 | 放弃 |
| 只改正文，代码保留不用 | 改动最小 | 不可用的代码与测试继续维护；正文与代码再次脱节 | 放弃 |
| task-sync 保留候选、封存与发布流程，只去掉采用依赖 | 同步结果仍经候选与确认 | 任务分支是执行者自己的分支，不需要准入；保留候选流程要继续维护大部分本机发布代码 | 放弃 |
| task-sync 改为普通合并加更新目标基线（本提案） | 执行者自己合并，命令只核对并更新基线 | 同步合并本身不经确认；靠逐提交审计从 taskBase 起覆盖合并进来的提交，以及 `gate-publish` 的最终确认 | 推荐 |
| 派发权改为经权限接口查询仓库 admin | 与 #290 方案措辞一致 | 当前 `publish` environment 的 reviewer 就是仓库 admin，效果相同；改实现没有收益 | 不在本提案内，保持 #306 的实现 |

## 验证与消费者切换

实施时需要的证据：

- 删除后，`register`、`start`、`baselines` 的现有测试照常通过；`start` 在没有 `integration-bootstrap.json`、没有采用锚点的新克隆上可以开工。
- `status` 在已绑定、未绑定、`targetBase` 落后于远端三种情形下的读数，以及远端读不到时的失败。
- `task-sync` 的正反例：正常前进；T 未合并进 HEAD；T 不在远端目标历史上；T 使 `targetBase` 后退或跳到另一条历史；工作树有未提交改动；远端读不到。每个反例都不改 context。
- 同步之后，`baselines` 与 `make check` 以新的 `targetBase` 计算影响面，逐提交审计与验收锁仍从 `taskBase` 开始。
- `parsePolicy` 对瘦身后的 policy 的正反例；`gate-track` 对轨道登记的读取不受影响。
- 组合候选上 `make check`（FULL=1）全部步骤退出 0。

需要切换的消费者：

- 集成规则：「采用状态」「完整集成」「两条基线」「权限、候选与恢复」「现行准入」「清理与政策接续」「首次接入范围与操作入口」「未来启用」各节，以及第二阶段说明中关于受影响检查尚未交给 turbo 的过时句子。
- 集成工具的 README 与 SPEC（I01 至 I11 中退役命令的条款）。
- 开发指南中提到采用、task-sync 与受信检出运行器的段落。
- `branch-integration` 与 `claim` 两个 skill 的源（`.meta_harness/agents/skills/`），按生成入口重新生成宿主产物。
- `tools/test-runner/test-runs.config.json` 中列为全局路径的已删除文件。
- `github-gate` 的 `gate/toolchain-paths.txt`：删去 `integration-bootstrap.json` 与 `scripts/integration-check.sh` 两条路径，由 admin 直接修改。
- RFC-0008 中把 `scripts/integration-check.sh` 列为仓库检查的句子，加更正标注说明该脚本已删除，不改变 RFC-0008 的决定。

尚未覆盖：轨道退役的正式流程（本提案只删除旧命令）；第二阶段的自动检查。

## 决定范围

- 有权决定者：PanQiWei（RFC-0004 的有权决定者）。2026-10-16 PanQiWei 授权 AIEPhoenix 对 RFC 修订作出决定。
- 决定日期及对应revision：2026-10-16，revision 1。决定者 AIEPhoenix，记录为 https://github.com/nemori-ai/omne-harness-lite/issues/362#issuecomment-6217265901 。
- 采用范围：本提案 revision 1 的全部条款。本提案取代 RFC-0004 revision 1 的下列范围：
  1. 「问题与有效输入」中多层分支规则一行的“采用链保留为记录”，改为采用标签保留为历史、不再读取；集成工具契约一行中 I07、I08、I09、I11 的修改计划。
  2. 「名称」中发布流程“运行现行集成工具的候选、验证和发布步骤”。
  3. 「现行集成工具的改造」一节全文。
  4. 「main：确认后由发布流程推送」中集成条件决定作为 I08 新格式的说明，以及发布身份须加入 policy owners、需要一次 policy 升级的句子。
  5. 「每一级的自动检查」中 stable 运行“采用的 policy 规定的启动、安装和迁移检查”与“采用的 policy 规定的完整检查”：改为 stable 的完整检查即全量 `make check`（`FULL=1`），由目标分支钉住的检查器版本运行。policy 的 profiles 删除后，不再有第二份检查清单。
  6. 「必需检查由专用身份报告」中关于 policy owners 的句子。
  7. 「受影响的拥有者」中“权限、候选与恢复”“首次接入范围与操作入口”“集成工具”“集成工具契约”“清理与政策接续”与 policy registry 各行中关于本机工具、采用标签作为受信来源与 owners 升级的内容；“采用标签仍不可修改和删除”保留。
  8. 「流程失效时的恢复」中“用本机工具完成发布”，以及「恢复语义的改变」一节全文。
  9. 「实质备选」中本提案一行“运行现行工具”与“流程失效时只能由 admin 临时调整规则集恢复”的说明，以及放弃 main 合并队列的理由中“保留现行工具的性质更重要”。
  10. 「验证与消费者切换」中试运行期间与本机工具并存的验收、集成工具 SPEC 与 README 的切换内容、切换四步中关于本机工具照常发布、不再使用与退回时恢复使用的句子。
  11. 「决定范围」中“升级流程替代四条主干上的 `policy-check` 与 `policy-adopt`”、“发布身份加入 owners 仍须一次 policy 升级”，以及第一阶段说明中评论格式与 I07、I08、I09、I11 拆分留到第二阶段、流程不读 policy 所以发布身份不加入 owners 的句子。
  12. 「写回现行正文」中“发布身份加入 owners，以及 I07、I08、I09、I11”一行。
- 不采用范围及必要理由：派发权的口径（`publish` environment 的 reviewer 还是经权限接口查询仓库 admin）不在本提案内，保持 #306 的实现。包内两条底线（tsconfig 继承预设、必须有 `test` 脚本）与行内禁用注释计数跟随 #290 后续步骤。
- 未决与依赖停止点：轨道退役的正式流程，裁定者 PanQiWei；在此之前轨道退役由 admin 直接操作 policy registry 与分支。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 采用机制退役、policy registry 瘦身、恢复方式 | [集成规则](../engineering/integration.md) | 已写回 | #364，2026-10-16。删除采用状态、未来启用与首次接入等节，改写两条基线、恢复方式与 policy registry 的说明。#364 修订 3 删去其余历史说法，`timeouts` 只留 `networkMs` |
| 命令退役、`status` 与 `task-sync` | 集成工具 [README](../../tools/dev-flow/src/integration/README.md) 与 [SPEC](../../tools/dev-flow/src/integration/SPEC.md) | 已写回 | #364，2026-10-16。README 按现存命令重写；SPEC 删除退役命令的条款，新增 `status` 与 `task-sync` 的条款。#364 修订 3 删除 policy 的 `timeouts.commandMs` 与派发决定的 `policyRevision` |
| 开发者操作 | [开发指南](../development.md)、`branch-integration` 与 `claim` skill | 已写回 | #364，2026-10-16。开发指南与 `branch-integration` skill 改为新的 task-sync 做法，删除本机发布与采用的说法；`claim` skill 改用 `status` 读回 context。#364 修订 3 删去开发指南中已删命令的历史说明 |
| 路径清单 | `github-gate` 的 `gate/toolchain-paths.txt` | 待写回 | #364 合入后由 admin 修改 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 写回表所列的现行源 |
