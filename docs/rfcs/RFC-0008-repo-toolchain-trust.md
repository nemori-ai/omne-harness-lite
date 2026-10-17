---
id: RFC-0008
title: 仓库工具链的受信机制
revision: 1
status: accepted
owner: Brian Lee
---

# RFC-0008：仓库工具链的受信机制

规则与维护责任见[RFC入口](README.md)。本提案部分取代 [RFC-0004](RFC-0004-trunk-pr-admission.md) revision 1：受信检查器版本的载体与升级方式。精确取代范围见「决定范围」。RFC-0004 的其他条款不变，RFC-0004 保持 accepted。

本提案把 [#290 的实施方案](https://github.com/nemori-ai/omne-harness-lite/issues/290#issuecomment-6188641420)中已经由卡 [#332](https://github.com/nemori-ai/omne-harness-lite/issues/332) 实施的受信机制写成正式提案。该方案「本次实施采用的决定」第 4 项约定“正式文本写成新 RFC，部分后继 RFC-0004”。方案中尚未实施的部分（采用命令与本机发布命令的退役等）不在本提案内，见「决定范围」的不采用范围。提案采用、规范写回、实现和交付接受分别判断。2026-10-16 采用本提案 revision 1，记录见 [#354 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/354#issuecomment-6213174060)。

> **更正标注（2026-10-16）**：「受信版本的载体与升级」中列举的仓库检查包含 `scripts/integration-check.sh`。该脚本已按 [RFC-0009](RFC-0009-adoption-and-local-tool-retirement.md) 删除。原文保留，本更正不改变本提案的决定。

## 问题与有效输入

RFC-0004 规定由 `github-gate` 上的一个文件记录受信检查器的提交号，升级经一条专门的升级流程：新旧检查器都运行，确认后原子更新 main、受信版本文件与采用标签。这一设计同时决定了 #217。第二阶段才实施这条升级流程。

#290 的实施方案指出，现行的采用标签与 `integration-policy.json` 把权限、检查规则与受信版本捆在一起，带来四个问题：只有一人能派发；受信版本停在旧提交，旧检查器可能跑不动现在的 main；升级要旧检查器先认可新版本；采用版本一换，全部工作树的 task context 作废。方案把受信对象缩小到“仓库工具链”，并把受信版本的载体从 `github-gate` 上的记录改为仓库里受闸门保护的 npm 包版本钉子。卡 #332 已实施这一改动。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0004](RFC-0004-trunk-pr-admission.md) | revision 1，accepted，[接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/249#issuecomment-6164587010) | 只取代「决定范围」所列条款；四条主干、两档准入、`github-gate` 的保护、记录流程与恢复方式不变 |
| [#290 实施方案](https://github.com/nemori-ai/omne-harness-lite/issues/290#issuecomment-6188641420) | 2026-10-15，PanQiWei 口头确认，「本次实施采用的决定」1 至 5 | 本提案的来源；方案允许 PanQiWei 审核结果时推翻或调整 |
| [#217](https://github.com/nemori-ai/omne-harness-lite/issues/217) | 设计部分由 RFC-0004 决定 | 升级保证尽量保持，有改变的逐条列出 |
| 卡 [#332](https://github.com/nemori-ai/omne-harness-lite/issues/332) | 交付修订 2 | 已实施的事实与证据 |
| [现行准入](../engineering/integration.md#现行准入)、[仓库工具链的版本](../development.md#仓库工具链的版本) | 当前正文 | 已实施部分的现行源；它们先于本提案接受写入，见「写回现行正文」 |

## 建议与改变范围

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 集成规则，[现行准入](../engineering/integration.md#现行准入) | 改动由 `gate-publish` 经一道 `publish` 确认 | 改到仓库工具链路径的 PR 多一道 `repo-toolchain-review` 确认 | 四条主干与两档准入不变 |
| 开发指南，[仓库工具链的版本](../development.md#仓库工具链的版本) | — | 检查器与配置预设钉精确的 npm 版本；升级先发版本、再改钉子 | 仓库的检查运行钉住的包 |
| `github-gate` | 保存准入、记录与核对流程；RFC-0004 设计在此保存受信版本文件 | 增加发包流程 `gate-release` 与路径清单 `gate/toolchain-paths.txt`；不保存受信版本文件 | 只有 admin 能更新 `github-gate` |

### 受信对象与三类划分

受信要防的是 agent 在自己的分支里放松检查、再报告通过。人越权由平台负责：规则集、admin 确认与不可改的记录标签。

| 类别 | 包括什么 | 把关方式 |
| --- | --- | --- |
| 仓库工具链（受信） | 检查器与配置预设（发布为 npm 包）；仓库里的编排、版本钉子、锁文件与配置入口；文档与 agent 检查；流程工具（`tools/dev-flow`、`integration-policy.json`、`github-delivery.json`）。路径见 `github-gate` 的 `gate/toolchain-paths.txt` | 改仓库里的这些文件触发仓库工具链变更闸门；检查器与预设的代码通过发新版本、再改钉子来换 |
| 包内内容（自治） | `packages/**`、`apps/**` 的源码、测试、测试脚本内容与包内文档 | 包负责人与确认者；测试责任按 RFC-0005 |

改仓库工具链的 PR 与业务代码分开提交。

### 三层保护

| 层 | 保护什么 | 怎么保护 |
| --- | --- | --- |
| `github-gate` | 流程定义：Actions 工作流、发布密钥、发包流程、路径清单 | 只有 admin 能更新；密钥只给这条分支上的运行 |
| 仓库工具链变更闸门 | 仓库里的仓库工具链文件，含版本钉子与锁文件 | PR 改到路径清单中的文件，要求 `repo-toolchain-review` 确认并写明说明 |
| 检查器 npm 包 | 检查器 `@omne-harness/repo-toolchain` 与配置预设 `@omne-harness/repo-config` | 仓库运行钉住的精确版本；npm 已发布的版本不能覆盖；除首个版本 0.0.1 外，新版本只经受控发包流程发布 |

### 仓库工具链变更闸门

1. `gate-publish` 用 `git merge-tree` 算出合并结果相对目标改动的文件，与 `github-gate` 上的 `gate/toolchain-paths.txt` 比对。命中的路径列在等待确认的摘要里。
2. 命中时，流程先等待 `repo-toolchain-review` environment 的确认，再进入 `publish` 的确认。`repo-toolchain-review` 的确认者与 `publish` 相同，关闭管理员跳过，只接受 `github-gate` 上的运行，不存放密钥。
3. 确认必须填写说明，空说明被拒绝。说明原文写进发布决定评论。
4. 只有个人分支进入轨道的 PR 经这道确认。轨道进 main、main 进轨道和 main 进 stable 不经这道确认，它们搬运的提交都已经从个人分支进入过轨道。
5. 路径清单只在 `github-gate` 上维护，改它是对 `github-gate` 的 admin 改动。
6. policy registry（`integration-policy.json`）中检查命令、轨道检查或采用条件的改动，同样经这道闸门确认。现行的 `policy-check` 与 `policy-adopt` 在退役前继续有效。

第二阶段有 PR 自动检查之后，同样的判断改为 PR 上的一个必需检查，确认机制不变。

### 检查器与配置预设的发布

- 两个包的源码留在本仓库：`tools/repo-toolchain` 与 `tools/repo-config`，发布在 npm 的 `@omne-harness` 作用域下。根配置文件只保留按包名引用预设的入口（`tsconfig.base.json`、`.dependency-cruiser.cjs`、`.oxlintrc.json`）。其余工具成员（`tools/product-checks`、`tools/dev-flow`、`tools/test-runner`）不发布，由闸门保护。
- 发包流程 `gate-release` 只在 `github-gate` 上运行，由派发者传入要发布的包、源提交与接收决定评论的 Issue。源提交必须已有 `omne/gate/unit` 记录，并在 main 或某条轨道的 first-parent 历史上；版本号取自该提交的 `package.json`；npm 上已有的版本不再发布，计划与发布前各查一次。同一个包的两次发布按并发组串行。
- 确认走 `npm-release` environment，确认者与 `publish` 相同，必须填写说明。发布使用 npm 可信发布（GitHub OIDC，不存长期 token），附来源证明。流程把结果写进指定 Issue 的决定评论。
- 发布成功但决定评论写入失败时，流程以失败结束；重跑会因版本已存在而停止。此时由派发者在该 Issue 上手动补记决定评论，引用运行链接。
- 首个版本 0.0.1 由 AIEPhoenix 手动发布，因为 npm 的可信发布只能为已存在的包配置。

### 受信版本的载体与升级

- 受信版本是 `pnpm-workspace.yaml` 的 catalog 中两个包的精确版本，以及锁文件中它们的 resolution 与 integrity。根目录与不发布的工具成员用 `catalog:` 引用。`linkWorkspacePackages: false` 让普通版本号只从 registry 解析，安装的是 npm 上的包，不是工作区源码。
- 仓库的检查（本地 `make check`、`scripts/integration-check.sh`、根命令 `check:declarations`、`lint:deps`、`lint:rules` 等）运行钉住的版本。改工作区 `tools/repo-toolchain` 或 `tools/repo-config` 的源码不改变这些检查的结果，只影响这两个成员自己的构建、类型检查与测试。收工钩子仍运行工作区源码，见「已知限制」。
- 自动检查接入后（RFC-0004 第二阶段），检查器取自目标分支钉住的版本，不取自 PR 钉住的版本；PR 改钉子由闸门确认。

升级按下面的顺序：

1. 在一个 PR 里改检查器或预设，并提高版本号。这个 PR 改到工具链路径，经闸门确认；它仍由当前钉住的版本检查。
2. PR 进入轨道或 main 后，经 `gate-release` 发布新版本。
3. 再开一个只改 catalog 钉子与锁文件的 PR。确认者核对它的改动确实只有这两处；只有这样，用旧版本检查目标分支才等价于用旧版本检查候选。
4. 用旧版本在目标分支上、用新版本在组合候选上各跑一遍完整检查。PR 说明写两次的结果、差别，以及新版本删除或放宽的每一项检查；PR 作者列出这些项，确认者核对。确认说明引用 PR 说明。
5. 新版本在组合候选上的结果不得比旧版本在目标分支上的结果多出失败；两边都有的既有失败如实列出。不满足时不确认。
6. 新版本有问题时，再开一个 PR 把钉子改回旧版本，同样按第 3 至 5 步运行与确认。npm 上已经发布的版本不再修改。

第一阶段平台不跑检查，第 4 步的两次检查由提交者在本地运行，结果由确认者核对。第二阶段改为 PR 上的必需检查。

与 RFC-0004 及 #217 的升级保证相比：

- **保持**：新旧都跑；旧版本的失败如实保留；删除或放宽的检查须逐项写明；确认后才换；待升级的版本不能批准自己（改钉子须经闸门确认，发布新版本须经 `npm-release` 确认）。
- **改变**：受信版本从 `github-gate` 上的记录改为仓库里受闸门保护的钉子与锁文件；“新检查器必须通过”改为“新版本不得多出失败”，因为仓库目前有既有失败；删除或放宽的清单由 PR 作者列出、确认者核对，不由流程计算；旧版本检查目标分支，而不是候选，前提是第 3 步的核对；升级不再与 main、stable、release 的发布共用并发组，钉子改变后，在途 PR 须在包含新钉子的组合候选上重新检查（现行准入的组合候选规则）。

### 已知限制

- 第一阶段平台不跑检查。本地检查运行钉住的包，但结果由提交者写进说明，最终靠确认者把关。
- agent 仍可以在包内用行内禁用注释或删除测试。这属于包内自治，仓库工具链只报告，不拦截。
- 收工钩子仍运行执行检出里的 `tools/repo-toolchain` 源码。它给 agent 读数，不是准入检查。
- Python 工具（`tools/spec-tools`、`.meta_harness/tooling`）不发布，不钉版本，由闸门保护。
- 来源证明中的 `gitCommit` 是 `github-gate` 上的工作流提交，不是源提交。追溯源提交要经由“来源证明 → 运行 → 发布决定评论”。
- npm 为两个包自动生成了占位版本 `0.0.0-stage`，它不是经本流程发布的版本，仓库不钉它。

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 保持 RFC-0004 原设计：`github-gate` 上的受信版本文件加升级流程 | 受信版本只有 admin 能改 | 要实现两半拆分的升级流程；采用标签与 policy 继续捆绑；旧检查器跑不动新 main 时升级仍然困难 | 放弃 |
| 检查器以 git 提交钉在仓库里（不发 npm） | 不需要 npm 发布 | pnpm 需要从 git 安装或本地构建；没有不可覆盖的版本与来源证明 | 放弃 |
| 检查器发 npm，钉子不受闸门保护 | 实现简单 | agent 可以在同一个 PR 里改钉子或锁文件并报告通过 | 放弃 |
| 检查器发 npm，钉子与锁文件受闸门保护（本提案） | 受信版本不可覆盖、可追溯；换版本是一次带说明的审批 | 每次改检查器都要发版本；第一阶段两次检查靠人工；锁文件受保护后，任何依赖变化都要多一道确认 | 推荐 |

## 验证与消费者切换

已有证据（卡 #332）：

- C1：改到受保护路径的 PR 等待 `repo-toolchain-review` 确认，空说明被拒绝，未命中的 PR 不多这道确认。测试组织的反例与本仓库的真实运行，见 [#332 的进展](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6209340632)。
- C2：检查器拆分前后检查结果一致，见 #344。
- C3：首个版本手动发布的记录；之后的版本经 `gate-release` 发布，带来源证明。见[首发记录](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6209941107)与 [C3 记录](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6210398310)。
- C4：钉住的版本从 npm 安装；改工作区源码不影响检查结果的反例；切换前后各跑一遍。见 [C4 记录](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6211715059)。

#217 的验收情形与本提案的对应：

| #217 情形 | 本提案中的对应 | 状态 |
| --- | --- | --- |
| 成功升级 | 改钉子 PR 新旧都跑，新版本不多出失败，确认后合入 | 未演练。#351 是从运行工作区源码切到钉住版本的首次钉版，不是两个已发布版本之间的升级 |
| 未经授权 | 闸门与 `npm-release` 都要求确认和非空说明 | 闸门的空说明反例见 C1；`npm-release` 的空说明拒绝由流程实现，未单独做反例 |
| 版本或证据变化 | `gate-publish` 核对 PR head；`gate-release` 在发布前再查一次版本 | 已实施 |
| 并发发布 | 同一个包的发布串行；钉子改变后在途 PR 须重新检查 | 前者已实施；后者依赖确认者执行现行准入的组合候选规则 |
| 执行中断 | `gate-release` 只在 npm 上没有该版本时发布，重跑不覆盖；评论失败时手动补记 | 已实施；补记为人工步骤 |
| 新克隆读取受信版本 | 新克隆按锁文件安装钉住的版本 | 已实施 |

尚未覆盖：两个已发布版本之间的真实升级；第二阶段的自动检查；`npm-release` 空说明的反例。

需要切换的消费者：集成规则「现行准入」与「第二阶段目标」；开发指南「仓库工具链的版本」；`github-gate` 的 `gate/README.md` 与 `gate/toolchain-paths.txt`；集成工具 `SPEC.md` 中检查器版本的来源。

## 决定范围

- 有权决定者：PanQiWei（RFC-0004 的有权决定者）。2026-10-16 PanQiWei 授权 AIEPhoenix 对 RFC 修订作出决定。
- 决定日期及对应revision：2026-10-16，revision 1。决定者 AIEPhoenix，记录为 https://github.com/nemori-ai/omne-harness-lite/issues/354#issuecomment-6213174060 。
- 采用范围：本提案 revision 1 的全部条款。本提案取代 RFC-0004 revision 1 的下列范围：
  1. 「检查器的受信版本与升级」一节全文（受信版本记在哪里、适用条件、升级流程、并发与中断、验收）。
  2. 「问题与有效输入」中多层分支规则一行的“检查器升级改走本提案的升级流程”；集成工具契约一行中“I01、I02 中检查器版本的来源要修改，见正文”；#217 一行及「与 #208 和 #217 的关系」中关于 `github-gate` 规定受信版本、#217 升级流程的句子。
  3. 「每一级的自动检查」中“检查器取自受信版本……受信版本的来源见下文”与“检查器取自受信版本，选择规则文件也从检查器一侧读取”：改为检查器取自目标分支钉住的版本，选择规则文件受闸门保护。
  4. 「准入流程保存在 `github-gate` 分支」中“以及受信版本文件”与“发布身份只在升级流程中更新受信版本文件”。
  5. 「受影响的拥有者」中“集成规则，清理与政策接续”一行关于检查器升级的内容，以及“集成规则，首次接入范围与操作入口”一行的“受信版本文件与最新采用标签始终一致”。
  6. 「实质备选」中“经升级流程更新检查器”的后果说明：改为经本提案的升级顺序。
  7. 「决定范围」中“`github-gate` 规定检查器的受信版本”与“这同时决定 #217 的设计”，以及实施阶段说明中第二阶段“实施受信检查器的升级流程”。
  8. 「写回现行正文」中“检查器受信版本的升级流程”一行。
- 不采用范围及必要理由：#290 方案中下列内容不在本提案内，RFC-0004 的相应条款继续有效：
  - 采用标签作为受信来源的退役，`policy-handoff`、`policy-check`、`policy-adopt`、`bootstrap`、`activation-check`、`activate` 与本机 `prepare`、`seal`、`verify`、`publish`、`resume` 的退役，以及相应的恢复路径。它们尚未实施（#290 落地顺序第 8 步），实施时另行提案。在此之前，RFC-0004「决定范围」中“升级流程替代四条主干上的 `policy-check` 与 `policy-adopt`”不再有对应的升级流程，现行 `policy-check` 与 `policy-adopt` 继续有效。
  - 派发权与开工准入的调整，已由 [#306](https://github.com/nemori-ai/omne-harness-lite/issues/306) 单独实施。
  - task-sync 的实现方式、`track-retire`、检查命令清单的删除、包内两条底线（tsconfig 继承预设、必须有 `test` 脚本）与行内禁用注释计数，跟随 #290 后续步骤。
- 未决与依赖停止点：第二阶段把闸门与新旧两次检查改为 PR 上的必需检查，跟随 RFC-0004 第二阶段。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 仓库工具链变更闸门、发包流程 | [现行准入](../engineering/integration.md#现行准入)、`github-gate` 的 `gate/README.md` 与 `gate/toolchain-paths.txt` | 已写回 | #332 实施时先于本提案写入现行源；锁文件于 2026-10-16 加入路径清单（`github-gate` `53974d3f`） |
| 受信版本的载体与升级顺序 | [仓库工具链的版本](../development.md#仓库工具链的版本)、integration.md「第二阶段目标」 | 已写回 | #332（#351）实施时先于本提案写入；升级第 3 至 5 步的核对与“不多出失败”条件随本提案入库写入，2026-10-16 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 写回表所列的现行源 |
