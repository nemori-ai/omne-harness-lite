# 多层分支集成

本页拥有工程路线、双基线与权限规则。精确工具行为归[集成工具契约](../../tools/repo-toolchain/src/integration/SPEC.md)，命令归其[README](../../tools/repo-toolchain/src/integration/README.md)。任务仍归[现有交付协议](delivery.md)，不新增活动队列或自动接受规则。

## 采用状态

采用事实以正式tag和实际bootstrap读回为准。PanQiWei已授权首次采用，[工程启用任务](https://github.com/nemori-ai/omne-harness-lite/issues/195)保存实际检查和具名决定。未提交文件、skill 可见、日期或测试通过都不启用机制。正式采用须在本次工作树全部正式成果提交后，由具名负责人确认 construction 完整性、实际平台接入及独立验证，再创建不可覆盖的采用 tag。现有GitHub delivery的启用与集成机制采用分别管理。

正式接入须保护采用 tag 命名空间，禁止覆盖和删除。positive-absence 只证明当次完整查询没有采用 refs，不证明历史上从未采用。已有采用线索时缺失来源仍为 unknown。新 clone 和权威仓库同时失去所有历史线索时，Git 无法区分首次未采用与历史丢失；具名 owner 必须核对初次采用依据或恢复责任，不能仅凭空查询授权启用。

policy revision 2 起，integration、轨道附加检查及 full 均使用完整 `check`，不再保留独立的弱工程检查入口。日常集成按影响面执行，full 通过 `FULL=1` 选择全部活跃成员，并保留 startup、install、migration、mainPath 四类覆盖。
工程集成末尾显式使用严格工程范围。仅当当前与所有有效审计基线均无产品输入时，两项产品传感器保留 no-data 并报告不适用，条件见[整洁回路](../clean-loop.md#回路怎么转)。本地默认 strict 不改变。此修订仍须经过正式 policy 采用；文件中的 revision 不代表已采用。

## 分支与任务

本节到「稳定点与轨道演进」描述本机集成工具的行为。自 2026-10-15 起，四条主干的进入按[现行准入](#现行准入)执行。下面各节中候选发布、unit 标签和 stable checkpoint 的步骤不再用于四条主干，只在 admin 临时恢复原规则集时作为恢复手段。任务开工、路线、taskBase 和 task-sync 仍按本节。

main 保存完整集成结果。任意数量的 integration/<track> 保存已登记责任轨道。stable 指向 main 中经过完整检查的既有 checkpoint。轨道和 stable 不加用户名；工作及临时分支遵守人的署名约定。

任务从真实 Issue 的 revision 和当前 attempt 开始。指定调度者记录并读回人的责任、分支、route、不可变 taskBase、写范围与条件定位。普通任务进入登记轨道；cross-track 或 global 完整单元进入 main，并具名受影响责任。目录不能自动决定路线。

## 轨道责任与保护

[policy registry](integration-policy.json) 登记轨道身份、owner、状态和固定起点。revision 3 按以下责任划分轨道；正式准入仍取决于该 revision 的实际采用与 bootstrap，不能仅凭本表开工。

| 轨道                                | 责任与适用任务                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `integration/legacy-refactor`       | 将 0.0.1.legacy 已支持的功能迁入新的文档体系、架构和包结构；以已确认能力清单防止功能遗漏，不借重构扩大到全部 0.1.0 范围                  |
| `integration/engineering-toolchain` | 持续改进研发工具链，包括 lint、make check、CI/CD、pre-commit hooks 及相关脚手架、检查工具和工程流程                                      |
| `integration/development`           | 首次接入使用的历史轨道；revision 3 将其设为 retiring，停止新任务准入。核清未提升成果及交接责任后，按明确授权删除 ref，保留历史登记与标签 |

新轨道按 registry 的 initialMain 从已确认 main 提交创建，创建由 `gate-track` 流程执行，见[现行准入](#现行准入)。后续 main 变化通过 FI 同步，不改写起点。任务 route 必须明确选择轨道；global 或跨轨道完整结果仍按具名责任进入 main，不设置隐含默认轨道。

GitHub 对 `integration/**/*` 分别实施三项保护：只有仓库管理员可删除，所有人禁止非快进更新，创建与更新只允许发布身份 `omne-harness-lite-publish`。删除权限不代替退役清单和具体动作授权。

main 与 stable 禁止删除和非快进更新，创建与更新只允许发布身份。adoption、unit、checkpoint 标签禁止修改和删除，无 bypass。平台保护不验证任务接受；管理员修改规则本身属于管理权限。

## 完整集成

工作分支向轨道运输完整源前缀。FI 将 main 的完整前缀带到轨道。RI 将轨道未被 main 覆盖的完整单元提升到 main。joint 将多个完整源组合成一个候选。破坏性跨轨道修改同时交付定义、提供者、真实消费者与测试。选择性 cherry-pick 不构成正式 RI。

每次共享发布同时创建 immutable unit tag。RI 自动从这些事实推导完整任务集合，保留每卡自己的 revision、attempt、taskBase 和 taskSource。运输层改变不自动新建卡或提高交付修订。

## 两条基线

候选固定目标 B 和源 S。除 stable checkpoint 外，C 第一父为 B；stable 直接使用已有 main C，只要求旧 stable 是其祖先。B 用于影响面与组合检查。每张卡原始 taskBase 用于到 taskSource 的逐提交审计，仍检查先改后改回及所有相关合并父。FI 或最新目标不能重写任务原起点。全局 main 趋势仍使用 main。

## 权限、候选与恢复

共享集成由明确的集成拥有者执行。工具从已采用提交运行 checker，候选 C 只提供被测输入。候选必须提交且干净，真实命令前后 HEAD 和 tree 不变。验证回执不是任务接受。

发布读取具名 owner 的真实 Issue comment 决定，并再读每卡当前输入和 integration 条件。目标更新比较 expected B，先证明 B 是 C 祖先。branch 和不可覆盖 tag 同一事务更新。目标变化要求重建候选和复验，不能退回普通快进或强推。

超时先观察实际 refs。已发布但 Issue 投影失败时，由原正文单写者修复技术记录，不重放 Git。进入轨道、main、stable、交付接受与关闭分别记录。工具不修改 Stage、接受或关闭。

## 稳定点与轨道演进

stable 选择已有 main 提交，只要求旧 stable 是其祖先。首次创建固定 audit 起点。full profile 及约定的 startup、install、migration、主路径检查归采用 policy。main 后续前进不改变选定 checkpoint。

轨道 registry 记录稳定 ID、owner、来源、状态、initial main anchor 与必要检查。新增或修改 registry 由 owner 提交并按当前受信规则验证后显式采用。bootstrap 用 expected absent 创建初始 ref 和 unit。暂停轨道拒绝新任务。owner 更换先交接未提升 prefix 与活动任务。

退役只形成并核清单。删除 ref、工作树或唯一临时材料仍按[工作约定](workflow.md#责任与协作交接)和[发布边界](publication.md)取得明确授权。Git revert 不撤销外部副作用。

## 现行准入

PanQiWei 于 2026-10-14 接受 [RFC-0004 revision 1](../rfcs/RFC-0004-trunk-pr-admission.md#决定范围)。2026-10-15 起按第一阶段执行，切换记录见 [Issue #208](https://github.com/nemori-ai/omne-harness-lite/issues/208#issuecomment-6184302633)。

四条主干是 `integration/<track>`、`main`、`stable` 和 `release`。代码单向提升。main 向轨道的同步是唯一反向流动。`release` 只定对外发布的位置，还没有创建。

第一阶段的规则如下。

- 四条主干只经 PR 进入，个人工作分支不受限制。轨道接受个人分支或 main 的 PR。main 只接受 `integration/*` 的 PR。stable 只接受 main 的 PR，并且只快进到 main 的 first-parent 历史上的提交。
- 派发 `github-gate` 分支上的 `gate-publish` 流程，传入 PR 号和 PR head 的完整提交号。合入 stable 时还要传 checkpoint 名称。命令见 `github-gate` 分支的 `gate/README.md`。
- 任务卡的派发评论由 `publish` environment 的 reviewer 发出，`start` 据此核对，不再要求 bootstrap 或采用锚点。没有 task context 的检出也能运行本地检查，基线退回 `origin/main`。
- 一位 admin 在 Actions 的 `publish` environment 中确认，必须填写说明。admin 可以确认自己的 PR。agent 可以用 admin 的凭据代为确认，说明中注明代为确认的人。
- 个人分支进入轨道的 PR 如果改动仓库工具链，确认前多一道审批。流程用 `git merge-tree` 算出合并结果，把结果相对目标改动的文件与 `github-gate` 上的 `gate/toolchain-paths.txt` 比对。命中时，先由 `repo-toolchain-review` environment 的确认者确认，再进入 `publish` 的确认。工具链确认也必须填写说明，说明原文写进发布决定评论。未命中的 PR 不经这道审批。轨道进 main、main 进轨道和 main 进 stable 不经这道审批，它们搬运的提交都已经从个人分支进入过轨道。路径清单由卡 [#332](https://github.com/nemori-ai/omne-harness-lite/issues/332) 建立，只在 `github-gate` 上维护。
- 确认后，发布身份 `omne-harness-lite-publish` 构造合并提交。第一父为目标，第二父为 PR head，有冲突就停止，冲突先在来源分支解决。它在一次原子推送中更新目标并创建记录标签，推送比较派发时读到的目标。合并写 `omne/gate/unit/<结果提交号>`。stable 写 `omne/gate/stable/<提交号>` 和 `omne/gate/checkpoint/<名称>`，同一提交只能进入 stable 一次：另一次发布已把 stable 推进到同一提交时，记录已存在，整次推送失败。标签正文是 `omne-gate-record:v1` JSON。
- 发布 main 前，流程核对来源轨道自切换点起每个 first-parent 提交都有目标为该轨道的 unit。发布 stable 前，对 main 做同样的核对。有缺口就停止。
- 已知限制：admin 停用规则集后直接推送主干，平台不能阻止，只能事后发现，依据是组织审计日志和定时核对。其中一种情形流程也无法区分：admin 在流程最后读取目标与推送之间，把 stable 直接推到本次要发布的同一提交。这时流程仍会写入记录。
- 流程不运行测试。自动检查具备之前，确认暂代轨道的自动检查，说明中写明本地运行了哪些检查及结果。确认不等于交付接受。
- `gate-reconcile` 每小时从 main 触发一次。它为切换点之后没有记录的主干提交开缺口 Issue，不创建标签。缺口不设处理时限，由该轨道 owner 或任一 admin 在缺口 Issue 中写具名决定后闭合。
- 新轨道由 `gate-track` 流程在 admin 确认后从 main 的 first-parent 提交创建，并写 `omne/gate/track/<轨道名>` 起点标签。轨道仍须在 registry 登记 owner 与责任。

平台配置如下。main、轨道和 stable 的创建与更新只允许发布身份。`github-gate` 只有 admin 能创建和更新，禁止删除和非快进。`omne/gate/*` 标签只有发布身份能创建，任何人不能修改或删除。仓库只允许 merge commit。`publish` environment 的确认者为 admin，关闭管理员跳过，只接受 `github-gate` 上的运行。`repo-toolchain-review` environment 的确认者与 `publish` 相同，同样关闭管理员跳过、只接受 `github-gate` 上的运行，不存放密钥。调整 `publish` 的确认者时同步调整它。切换点记在 `github-gate` 的 `gate/cutover.json`。切换点之前的历史按 #208 的决定整体认可，不补记录。

发布身份的 App 归组织所有，密钥只放在 `publish` environment，不放仓库级 secrets。审计日志、`github-gate` 的改动和密钥轮换由组织和项目的管理者按需要处理，不设固定周期。流程使用 GitHub 托管 runner。

本机集成工具的 prepare、verify 和 publish 不再用于四条主干。`policy-check`、`policy-adopt` 和采用标签保持原状，第一阶段的流程不读取它们。

### 第二阶段目标

turbo 构建体系建立后进入第二阶段。轨道改为自动检查通过后经合并队列自动合并，取消轨道的确认。增加报告身份和按改动范围的必需检查。受信检查器的版本记在 `github-gate`，升级走该分支上的升级流程，这同时决定 Issue #217 的设计。集成条件评论的格式随之确定。

轨道和 main 的受影响检查，今天仍由 `make check-plan` 与 `make test-affected` 执行。 [RFC-0002 revision 2](../rfcs/RFC-0002-engineering-toolchain.md#影响面选择) 接受以后改用 turbo。替换前必须保留未识别文件转全量，并把 `turbo.json` 一类选择配置当成全局文件。准入基线要显式传入。准入不读取 PR 能写入的缓存。这些条件还没有在 turbo 上落地，所以现行命令不改。

## 未来启用

未来采用前，负责人须核对完整已提交 construction、clean HEAD、必要检查、可信 main 上的 descriptor、已启用 delivery、真实具名决定、现有树 legacy 清单及远端 atomic/Rulesets 资格。新 clone 显式 bootstrap；缺 anchor 或 context 返回 unknown，不回退 main。legacy 仅适用于登记的旧树和旧任务。

工具 README 提供实际命令。规则、模板、生成与本地 bare 测试不能证明 GitHub Rulesets、Actions 或真实宿主已生效。

## 同步与提升的节奏

以事件触发为主。开工或重新接活时，owner 比较工作任务、来源轨道和 main 的实际 SHA；RI 前及 main 有破坏性变更后，再核需要的 FI/task-sync。活跃轨道以完整小批量及时提升，避免长时间累积漂移。空闲轨道在恢复活动时同步，不按日历给所有轨道增加全量构建或付费模型预算。

RI 后，来源轨道若还要继续工作，先检查 main 是否包含新的组合修正或其他轨道前缀；需要这些变化时执行 FI。轨道已包含同一 main 内容时不为流程制造空同步。其他活跃轨道按受影响契约同步；破坏性公共变更由集成 owner 协调相关 owner，在继续依赖工作前闭合。空闲轨道保留已知漂移，恢复时处理。

冲突由本次候选的集成 owner 在独立 candidate worktree 解决，涉及含义的取舍交相应语义 owner。worker 提供来源和测试，不修改共享目标解决冲突。重新封存的 C 需要实际组合验证；各源单独通过不能代替它。

## Issue 与 Project 的配合

每卡声明 completionTarget，并按同一条件表记录 start、integration、acceptance。integration 可限定目标层或实际 ref；未声明为 all。只要求进入 main 前满足的条件，不阻 work→track。最终“main/stable 已包含本结果”属于 acceptance，不作为自身运输前置。

完成 track 即可接受的卡，后续仍可能随完整 prefix 进入 main/stable。历史 unit 保留原 revision/attempt；新的操作由有权 owner 精确重核历史与当前输入、确认未撤销和适用性并重新验证 C。旧 work 操作在任务输入变化后失效，不把接受或关闭当作所有未来运输的拒绝或自动许可。

Project 可由原单投影写者维护可选 Integration target 与 Integration progress 视图，来源为 Issue 的声明和实际 Git unit/checkpoint。视图只报告 declared/observed 及 unknown/inconsistent，不能作第二可编辑队列、改变 Stage 或产生 Accepted/Closes。未配置真实字段时不造字段 ID；本工具不写平台。

## 清理与政策接续

每操作保留固定输入、冲突树、receipt、intent 和观察。先核 Git 已发布、各卡剩余接受/投影责任已交接、唯一 tmp 有去向，再按现有权限清理。unknown 或分裂 ref 时保留证据，不盲重建或重试。

政策或轨道 registry 升级先由旧 adopted runner 验证已经提交的新 main。具名采用决定绑定精确工作树/context 交接清单；旧 context 和 operation 随 anchor 更换失效。其他 clone 的待发布操作由 owner 一并交接并 bootstrap，新树按新的真实派发接续。工具不自动改历史记录、删除旧树或给予旧候选新资格。

历史聚合以完整稳定 Issue identity、revision、attempt 为键。同一卡不同历史 tuple 分别保留 taskBase/taskSource 和原 unit 包含关系，不代表多个当前绑定；同 tuple 的完整 binding 不一致或 source ancestry 分叉仍拒绝。RI/joint/checkpoint 为每个过期 tuple 分别取得 exact owner 重核并审计，不能取最新 taskBase 吞掉旧历史。

政策升级的具名 owner 从 handoff 开始冻结各 clone 的发布，核清在途操作，在新采用与任务接续后恢复。变更入口重读完整权威采用链，旧 anchor 拒绝并要求 bootstrap。该读回与 branch CAS 不是跨 ref 原子事务；升级与发布的串行关系由这次明确交接保证，不宣称同凭据操作者无法绕过。

## 首次接入范围与操作入口

首次policy登记PanQiWei为owner，并从已确认main基线建立development轨道。后续任务按已采用registry及上方轨道责任选路；global和跨轨道结果继续明确进入main。首次采用的legacy清单为空，旧任务不因树或分支保留而取得豁免。

采用前的完整construction通过PR提交到main，再从干净的精确main检出执行activation-check、具名adopt决定和activate。construction进入main但adoption未成功期间，普通检查返回unknown；这是受控接入窗口，不能把提交当采用。

已采用检出先bootstrap，工作树再依据真实Issue派发取得context。main没有任务context时，不直接运行带任务基线的check-plan或make check，也不伪造Issue绑定。

第一阶段的检查责任按[现行准入](#现行准入)执行：提交 PR 的人在有 task context 的任务工作树中运行检查，确认者在说明中写明实际命令和结果。没有任务 context 的 main 本身，例如进入 stable 的 PR，第一阶段没有正式检查入口；确认者写明实际运行的命令及其限制，不写成正式回执。checkpoint prepare 和 verify 只在 admin 临时恢复原规则集时作为恢复手段使用。第二阶段由报告身份在候选上运行必需检查。

当前full profile验证工程工具入口启动、runner/subject锁定依赖安装、真实Git采用与模板迁移场景、开发者上下文查询及工程静态检查。首次启用只执行这一组检查；此前已验证且输入未变的行为证据沿用原记录。`packages.0.0.1.legacy/`与`apps.0.0.1.legacy/`不进入工程静态扫描，也不执行封存产品的全量构建、类型、测试或验收。工具自身的安装、构建和测试也不得依赖这两个旧目录。当前源码与正式采用的检查器版本分别核对；当前源码通过不表示旧受信版本已解除依赖。若受信版本仍消费旧实现，停止该执行链并按采用规则交接，不把新版的独立检查记为旧版正式回执。新packages/apps仍是产品骨架，产品传感器没有输入时如实报告无数据，工程检查通过不代替产品质量结论。新版产品的startup、数据迁移及严格产品传感器门槛须由未来真实成员提供证据。

平台前提为仓库规则24926783对adoption、unit和checkpoint标签禁止更新、删除及非快进修改，无bypass。分支保护按上方职责分别配置。Actions仍沿现有手动、本地验证政策；本次不声称启用自动Actions或验证所有coding agent宿主。实际采用与接续命令归工具README。
