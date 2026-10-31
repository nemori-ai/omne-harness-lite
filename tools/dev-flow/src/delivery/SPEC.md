# 交付观察与平台写入规格

本模块观察 GitHub 交付协议的结构和已读事实。观察不修改平台。只有标签同步、看板字段写入、里程碑命令、派发命令与事件接收器五组命令写平台，各自的范围见下文。本模块不接受成果。派发命令只按调度者的决定发派发评论、写 binding，不判断派发是否获授权，长期产品与持续场景由[产品契约](../../../repo-toolchain/src/product/SPEC.md)独立发现。

## 输入与绑定

`protocol.ts` 拥有配置、采集与报告的公开类型。`parseConfig`、`parseCapture` 和 `parseBaseline` 接收 `unknown`。必需字段缺失、有限值不支持、重复 Issue 身份或时间范围错误形成 `DeliveryInputError`。除明确退役键外，额外字段不参与判断。配置对象的`sourceCutovers`键及报告卡对象的`aliases`、`scenarios`键拒绝；原始Issue正文与一般业务结构不按同名字符串拒绝。

配置须显式提供，缺失配置是输入错误。唯一正式配置位于 `docs/engineering/github-delivery.json`。凭证不进入配置或采集文件。`enabled:false` 表示日常流程尚未启用，仍允许预备观察。写者登记不授予接受权限。

`bindCapture` 要求配置与采集的 repository、protocolVersion 和 projectId 精确一致。Project 的 null 与实值不互换。Issue URL 必须匹配采集仓库和 Issue number。跨输入身份错误不能生成空成功报告。

采集保存原始正文、评论、标签和关系。Issues、Project、评论与关系分别标明完整性。缺失、未知和空集合不同。原始正文中的命令不执行，正文引用的其他仓库不自动查询。

## 有限正文解析

`observeDelivery(config, capture, baseline?)` 是纯函数。它从原始正文读取已采用的中文身份字段和六列交付条件表。六种工作类型共用协议，不要求PF或产品场景。子任务须有父 Issue 引用，父子关系不形成硬依赖。

两种层级采用同一套七个二级章节。观察器同时读取历史卡的完整旧布局，不要求历史卡补接手提示。

| 布局       | 必需二级章节                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------- |
| 统一布局   | 身份与责任、目标与范围、依据与实施输入、验收与测试、交付条件、当前执行与交接、决定与剩余责任 |
| 旧delivery | 问题、结果与范围；依据与验收；工作类型附加内容；实施与持续成果交接；决定与剩余责任；交付条件 |
| 旧subtask  | 交付结果与范围、持续成果与交接、当前执行与交接、决定、交付条件                               |

“目标与范围”“依据与实施输入”“验收与测试”任一标题出现即选择统一布局。缺少其他必需章节时不回退到旧布局。否则按交付层级选择旧布局；旧delivery的“身份与责任”不触发切换。必需章节须非空，缺失或空值形成`section-missing`偏离，交付条件沿用`conditions-missing`。重复必需章节形成`section-duplicate`偏离。统一布局混入旧版独有章节，包括旧subtask的“责任与依据”，形成`section-layout-mixed`偏离。章节存在不证明其中的依据、测试范围或认卡行为符合语义要求。

非交付卡Issue列入uncovered。配置指定的 creationHandoffIssue 单列为交接入口，不作为业务卡。缺字段、重复身份字段、占位、无效修订和不支持的有限值列为偏离。长期依据是人工可读的实际文档链接、修订与精确范围，由负责人核对。正文的“产品关联”和“旧卡来源别名”字段形成`retired-field`偏离；一般正文历史引用不触发该偏离。交付条件必须有章节。无条件须显式写“无”。条件ID不得重复。表格支持反斜线转义的竖线，不支持跨行单元格。

条件仅解析 issue-result、adopted-source、decision、capability，以及 start、integration、acceptance。自然语言判据、证据可用性和具名权限需要人工复核。

关闭状态、Project阶段、声明覆盖、执行方法和有效接受分别报告。决定评论的有限字段可以读取为声明，完整权限、全范围接受和撤销链保持 unknown。partial、cancel、revoke 或修订不匹配不构成整项接受。评论不全时接受必为 unknown。报告不提供自动 Ready 或派发许可。

## 阶段等待图与原生投影

每张支持卡的 integration 等待本卡 start，acceptance 等待本卡 integration。issue-result 的目标须为完整 IssueURL，判据须明确含整项结果、整卡结果、完整交付结果、整项完成或全范围结果。含不、非、无需、仅、部分或候选等范围限定时保留 unknown。满足这些有限文字条件后，只构建等待目标 acceptance 的已知边，不推断结果已满足。

其他条件、目标范围不清或目标卡未覆盖时，等待链为 unknown。硬条件自指是偏离。已知子图中的循环给出条件ID与完整阶段路径。图始终标为 known-subgraph-only，不声称全图无环。

原生 blockedBy 只投影明确整项结果且阻 start 的 issue-result。已观察到的未解释边是反例。关系完整且目标已读时，缺失投影边是反例。仓库 Issues 与关系均完整时，仓内不存在的目标是悬空反例。缺页、关系不全或仓外目标保留 unknown，不能凭未读到推断不存在。原生关系不证明条件满足。

## 存量与差量

报告包含版本、目标、采集时段、all-repository-issues 口径、卡观察、findings、偏离与 unknown、uncovered 存量，以及 introduced、resolved、remaining、notComparable。

finding身份由类别、代码、对象和条款组成。类别为 deviation、unknown、uncovered 与 attribute。卡修订作为独立字段，不改变身份。配置为`github-delivery-config@2`、协议2。采集为`github-delivery-capture@1`、协议2，Issue 可带 `milestone`（标题或 null），没有该字段表示未读取。报告为`github-delivery-report@5`、协议2，`stock` 含四个类别的数量。旧配置、协议1采集及版本1/2/3/4报告均为输入错误，退出2，不转换或作为历史基线适配。基线只与同版本报告比较。repository、projectId、protocolVersion 或口径改变时不计改善。当前任何采集层不完整或有采集错误时，消失的旧项进入 notComparable，不计 resolved。该策略保守地限制全局消项，不提供单个 finding 的细粒度完整性证明。

## live读取与失败

`collectDelivery` 仅以固定 argv 调用 `gh api`。REST 使用 GET。GraphQL 仅使用静态 query 与独立变量。无 shell、平台变更命令、token读取或正文执行。

REST 固定采用 `X-GitHub-Api-Version:2026-03-10`。GitHub 官方[版本支持列表](https://docs.github.com/en/rest/about-the-rest-api/api-versions#supported-api-versions)列出此版本，官方[依赖读取示例](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2026-03-10#list-dependencies-an-issue-is-blocked-by)也使用此请求头。版本依据来自官方文档，不能用一次请求成功代替版本承诺。

REST 分页读取目标仓库 Issues、评论和原生 blockedBy，排除 PR。REST 读取原生父关系（`issues/{n}/parent`），GraphQL 读取配置指定的 Project。Stage 按字段ID读取，可以映射 GitHub 内建物理 Status。配置字段未在 Project 内确认、Project字段或项缺页时，不标完整。

每个集合最多20页，每页100项。一次采集最多200次请求，总时限120秒，单请求最多15秒，单响应最多8MiB。达到限制或 API 不可用时保留已读项及明确未知。API错误原文不输出，避免传播凭证或无关内容。此观察不是平台原子快照。

## CLI与退出

board、dispatch、labels、milestone、worktree、gate 共用 `parseCliOptions`。带值选项使用 `--name value`，布尔开关按是否出现取值，不接受 `--name=false` 或 `--name false`。未知选项、重复选项和缺值在读取输入文件或调用 GitHub 前失败，沿各 CLI 现有错误格式退出 2。命令仍分别校验日期、Issue、子命令、必填项和权限。

`--` 结束选项解析，其后均为位置参数。只有 milestone 的既有命令接收位置参数，其他五个 CLI 拒绝非空位置参数；末尾单独的 `--` 可省略。带值选项后直接跟 `--` 仍属于缺值。既有 `--name value` 调用保持可用，不新增短选项或 `--name=value` 语法。六 CLI 子进程参数矩阵只证明解析及副作用前拒绝，命令业务行为继续由各自验证资源覆盖。

CLI接受显式 `--config` 及互斥的 `--capture`、`--live`。`--save-capture` 只适用于 live。`--baseline`接收同版本报告，`--report` 指定报告文件，否则输出 stdout。`--lines` 与 `--registry` 指定属性发现用的线归属表与 policy registry，缺省为本检出的 `docs/engineering/delivery-lines.json` 与 `docs/engineering/integration-policy.json`。两者读不到或不合格时退出2。

输出不得覆盖输入或互相覆盖。现存文件按设备与inode识别；未创建的目标按真实父目录与最终符号链接目标识别。解析保留相对目标中的实际目录语义，悬空链接链仍须对账。循环或过长链接链在读取平台及写入前拒绝。输入与输出须为常规文件，父目录须存在。该预检查不提供对并发文件系统变更的原子锁。

观察成功退出0，包括有偏离或 unknown 的报告。非法输入、身份冲突、不可读文件或不能写入输出时退出2。错误输出不含原始 API 内容，不产生空成功报告。本模块没有自动交付阻断或 CI 门禁。

## 预准入执行

`pre-admission-cli.ts`、仓库根和包内的 `pre-admission` script、构建后的 `omne-pre-admission` 使用同一执行器。输入为工作树、日志目录及新的 operation ID。未传工作树时使用当前目录；未传 ID 时生成 UUID。执行器解析工作树真实路径，用 Git 定位该工作树的 context，不以调用者当前目录代替。每次执行独占创建操作日志，重复 ID 拒绝。

执行顺序固定如下：

1. `pnpm -s run acceptance:lock`。已有 context 时不加 base；没有 context 时加 `--base origin/integration/mainline`。
2. `node scripts/with-test-slot.mjs pnpm turbo run build --affected`。
3. `pnpm run check:declarations`。
4. `pnpm run contract:api --check`。
5. 依次执行 `pnpm run check:lines`、`check:docs`、`check:design`、`lint:deps`、`lint:rules`、`lint:oxlint`。
6. `./scripts/format.sh check`。

共 11 个步骤，始终在指定工作树执行。每步单独保存 stdout/stderr 和退出结果。失败立即停止，命令返回该步骤的退出码，输出已执行步骤、日志路径和失败日志末 20 行。找不到命令返回 127，命令不可执行返回 126，信号退出映射为 128 加信号值。只有全部步骤成功才返回 passed/0。输入或日志创建错误退出 2。该结果是检查结果，不授予交付接受。

验证由 [delivery-pre-admission.spec.ts](../../tests/delivery-pre-admission.spec.ts) 覆盖完整顺序、绑定分支、失败传播、日志隔离和真实子进程退出码。第2步经运行名额脚本起 `pnpm`；[test-slot-launch.spec.ts](../../tests/test-slot-launch.spec.ts) 在所在平台上核对名额脚本起 `pnpm` 与 `.sh` 的方式，Windows 上包括 `pnpm.cjs` 的定位与找不到时以 127 退出。

## 持续验证与限制

`tests/delivery-observe.spec.ts` 覆盖输入绑定、六类工作、新旧两层级布局、实际模板填卡、缺失与重复章节、布局混用、父关系、决定声明、条件反例、隐藏阶段循环、投影对账、差量、属性类别与真实离线CLI。`tests/delivery-attributes.spec.ts` 覆盖属性读取与每个属性发现代码的正反例。`tests/delivery-binding.spec.ts` 覆盖 binding 两个版本的解析与区块读取。`tests/delivery-lines.spec.ts` 覆盖线归属表校验与 `check:lines`。`tests/delivery-labels.spec.ts` 用记录调用的 GitHub 替身覆盖差异、只改四族、正文主工作类型校验、写后正文漂移、读回核对、拒绝与写入失败。`tests/delivery-scope-overlap.spec.ts` 覆盖写范围求交的前缀判断、不计入的路径、默认排除已关闭的卡、重复来源与 binding 读取。`tests/delivery-dispatch.spec.ts` 覆盖派发字段缺项、摘要按现行条件行计算、写平台前的每项拒绝、同一修订与 attempt 不重复派发、占位评论改写与读回、读回失败时先交出派发 URL、只在「认领与派发」内改写、没有「工作树」行时补一行、给出工作树而「认领与派发」不唯一时拒绝且不写入、占位 URL 不写回、binding 写回与 dry run、为新修订派发时按改后正文核对与先改正文再发评论（含核对后正文变化与读回不符时不写评论）、`reviseCardBody` 对修订号变小、binding 区块没有闭合与小节外有 binding 区块的拒绝，以及在真实 Git 检出中读取 taskBase 的输入。`tests/delivery-milestone.spec.ts` 与 `tests/delivery-board.spec.ts` 用记录调用的 GitHub 替身覆盖里程碑与看板写入的请求参数、写前核对、重跑、读回、写入失败，以及看板设置的校验与旧配置的兼容。`tests/integration-board.spec.ts` 在真实 Git 检出中驱动 `start`，覆盖看板写入失败、配置关闭与重复开工时 context 和结果不变。`tests/delivery-github-read.spec.ts` 验证固定只读请求、物理字段映射、采集错误和分页限制。`tests/integration-delivery-facts.spec.ts` 验证提供 Project 事实时不发 GraphQL 请求，以及 Project ID 不符和 item 为空时拒绝。`tests/delivery-identifiers.spec.ts` 覆盖严格 JSON 的重复键、畸形、上限拒绝与文件标签，完整 SHA、SHA-256 摘要与 UUID 校验，以及操作日志的独占写入、按操作分目录与越界名称拒绝。远端响应在这些测试中以有限 fixture 提供。

真实权限、语义接受、跨仓等待链、Project 全局写入竞态、跨会话恢复及业务迁移是否完整未由本模块证明。派发命令改卡的正文时还剩一个并发窗口：从核对正文后到 PATCH 之间，别人对卡的改动会被覆盖。GitHub 不支持条件更新，工具关不掉这个窗口。正式配置保持`enabled:false`。平台启用、默认分支模板发布与实际宿主执行仍须独立验证，每项普通任务独立维护本次身份、范围和结果。

## 集成绑定与目标条件

当前报告版本5包含可选integrationBinding，TaskBinding 为版本1或版本2，形状归[集成工具说明](../integration/README.md#任务与执行权)。Issue 唯一 binding 区块绑定当前交付修订及 attempt，字段归 [binding.ts](binding.ts)。缺区块仍可作原交付观察；集成 start 必须有合法绑定。重复、身份或修订不符是偏离，不能据观察报告授权。

条件使用原表，可增加第七列“适用目标”。integration 条件支持 all、track、main、stable 及相应完整 branch ref；六列表映射 all。start/acceptance 只允许 all。指向未登记轨道的条件由 policy registry 拒绝；未满足的目标条件只阻对应运输。最终“main/stable 已包含结果”放 acceptance，不能作为其自身运输前置。旧报告版本拒绝，不转换。已知阶段等待图仍保守，不声明目标细化的完整无环。

## 属性发现

`observeDelivery` 的第四个参数提供线归属表与 policy registry 时，对每张开放的交付卡调用 [attributes.ts](attributes.ts) 的 `attributeFindings`，把结果记入 `attribute` 类别。没有这个参数时不产生属性发现。关闭的卡、非交付卡与创建交接入口不产生属性发现。

`attributeFindings({ binding, card, conditionCards, lines, registry })` 是纯函数，判据归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)与[多层分支集成](../../../../docs/engineering/integration.md#交付线)：

1. `readCardAttributes` 从「身份与责任」读交付线、性质与契约变更，并带上 Issue 的 milestone、标签与「交付条件」章节的文本。`workKind` 独立读取正文中唯一且属于六类采用范围的「主工作类型」，缺失、重复或未知值为 undefined；它不属于 binding 的三个属性。缺失或占位为 `attribute-missing`。重复、取值不在允许值中或组合不合法为 `attribute-invalid`。Issue 读到的 milestone 为 null 时为 `attribute-missing`，条款为 `milestone`。
2. 正文的属性是判断依据。只有合格的属性参与下面各步。
3. binding 为版本1时报告 `binding-v1`。版本2的交付线不在表中为 `attribute-invalid`。版本2的三个属性与正文不同、或里程碑与 Issue 现在的 milestone 不同为 `attribute-binding-drift`。
4. 有 binding 时核对路线。交付线为 `integration`、或性质为 `integration` 或 `baseline` 的卡进入联调轨道。其余卡进入本线的线轨道，线的 `track` 为 null 时进入联调轨道。route 的轨道不同、或目标轨道未在 registry 登记为 `nature-route-mismatch`。交付线为 `integration` 的卡写线内路径时 route 须为 `cross-track`，且 owners 含受影响线的 owner。只写联调轨道路径时 route 须为 `track`。
5. 有 binding 时核对写范围。`tmp` 下的路径与 `shared` 路径不计入。线内的卡写其他线的路径为 `scope-outside-line`，写联调轨道拥有的路径为 `scope-integration-path`。一项写范围覆盖多个归属时，按它下面的全部归属判断，表中没有列出的部分归联调轨道。`contract` 卡只写本线契约成员，`baseline` 卡没有仓库写范围，否则为 `scope-outside-line`。性质为 `integration` 的卡与交付线为 `integration` 的 `design` 卡不检查写范围归属。
6. `conditionCards` 是目标为 Issue 的交付条件及目标卡的属性。线内的卡引用交付线不是本线也不是 `integration` 的卡为 `condition-cross-line`。目标卡未读到或交付线不合格时不判断。`baseline` 卡没有任何交付条件：`readCardAttributes` 带上「交付条件」章节的文本，它不是「无」时为 `condition-cross-line`，条款为 `交付条件`。
7. `line:`、`nature:`、`contract:` 三族标签与正文属性的投影不同为 `label-drift`。契约变更为 `none` 时不应有 `contract:` 标签。

准入观察不提供规则，所以准入不产生属性发现。`attributeRefusals` 从发现中选出拒绝的项：`REFUSING_ATTRIBUTE_CODES` 是全部代码，`REPORT_ONLY_FINDINGS` 只有条款为 `binding.milestone` 的 `attribute-binding-drift`，正文交付线为 `integration` 时 `binding-v1` 也只报告。`ATTRIBUTE_REMEDIES` 给出每个代码的改法。`start` 新建 context 时按它拒绝，见[集成工具规格](../integration/SPEC.md#授权与开工)的 I16。派发命令按它拒绝，见[派发命令](#派发命令)。`start` 另有派发字段的拒绝，见 `dispatchFieldGaps`。

## 标签同步

`labels.ts` 的 `syncLabels` 只读写一张卡的标签。它用固定 argv 调用 `gh api`：GET 读卡，POST 加标签，DELETE 删标签，不读 Project。卡身份不符或是 PR 时拒绝。目标集合由正文主工作类型和三个属性推导。主工作类型须唯一且属于 `protocol.ts` 的六类采用范围；三个属性任一缺失或不合格时也拒绝，不写入。写入只涉及 `kind:`、`line:`、`nature:`、`contract:` 四族中当前与目标的差异。写入后再读一次卡，`verified` 要求四族标签等于目标集合，且读回正文仍推导出同一目标集合。某次写入失败时报告失败的序号，不回滚之前的写入。标签只是投影，正文仍是属性的唯一源。

## 任务准入采集

`admission.ts` 拥有 `AdmissionCapture`。它供 integration 的 `start` 与 `register` 使用，不是全库 `DeliveryCapture`。离线报告、baseline、delta 和发布检查不接受此输入。

采集从目标任务深度 0 开始，读取同仓库的精确 Issue 条件目标、原生 blockedBy、原生父卡和正文父卡，并递归读取这些目标。普通上下文链接不形成依赖。跨仓库 Issue 条件目标或关系、缺失目标、PR 替代和身份不符均拒绝。已访问的回边不重复读取，也不另加循环拒绝规则。

每次最多读取 32 个不同 Issue，包括独立授权卡。闭包最多 8 个边层级。每个分页集合最多 20 页，每次采集最多 200 个请求、120 秒，每个请求最多 15 秒。超过任一界限或必需页面失败时，不返回部分准入结果。完整闭包仍须在请求和时间预算内完成。

闭包内 Issue 的正文、评论和原生关系必须完整。条件发现复用观察器的解析结果。错误、重复条件行及重复条件章节不能成为完整闭包。缺少起始竖线的行，如果列数与六／七列表头同宽，或第二列为支持的条件类型，则拒绝。末尾竖线可以省略，不改变列数判定。普通单管道说明可以保留。没有这些结构或有限类型信号的自然语言不据此发现依赖。正式条件行仍须满足既有表格契约。独立授权卡只补读身份、正文和完整评论，关系标为未采集，不展开其无关依赖。授权卡同时属于任务闭包时，按闭包成员完整读取。

Project 读取只查询配置 Project 的字段、目标 Issue 的 memberships 和匹配 item 的字段值，并完成各自分页。工具不枚举全 Project items。配置 Stage 字段必须存在，任务必须有唯一匹配 membership。字段遗漏、身份不符或分页未知均拒绝。完整读取后没有 Stage 值时，合法结果为 `null`。

调用方提供已采用的 Project 事实（`AdmissionProject`：Project ID、item 与 Stage）时，采集跳过上述 Project 读取，不发 GraphQL 请求。采集只核对事实的 Project ID 等于配置的 Project ID，并且 item 非空，然后把事实中的 Stage 记为任务 Stage。事实的来源负责确认 membership 与 Stage 字段。integration 在云端开工时提供这份事实，采用条件归[云端事实来源](../integration/SPEC.md#云端事实来源)。

准入观察仅返回目标卡及其 findings。内部投影使用 `issues:partial`、`project:unknown`，保留配置绑定、目标偏离和原生关系对账。该投影不接受 baseline，也不输出全库报告。全库重复创建标识及循环覆盖仍归 `observeDelivery` 的全仓观察。

## 写范围求交

`scopeOverlap(cards, lines)` 是纯函数。每张卡的写范围先去掉不计入的路径：`tmp` 及其下的路径，以及线归属表 `shared` 中的路径及其下的路径，规则与属性发现的写范围归属相同。剩下的路径在不同卡之间两两比较。两条路径相同，或一条是另一条下面的路径（按 `/` 分段的目录前缀），即为一个冲突对。同一张卡内的路径不互相比较。同一来源出现两次是输入错误。`closed` 为 true 的卡默认不参与比较，来源列在 `excluded`；`includeClosed` 为 true 时参与。`issueScope` 按 Issue 的 `state` 给出 `closed`，文件来源没有 `closed`。

`issueScope` 以固定 argv 经 `gh api` GET 读一张卡，复用 `readIssueCard` 与 `readTaskBinding`：卡身份不符、是 PR、没有 binding 或 binding 不合格时拒绝。`fileScope` 读 binding JSON 对象，或只含一个 binding 区块的文本，按 `parseTaskBinding` 校验。

读集检查在 `read-set.ts`。`read-set.ts` 的函数都是纯函数，成员清单与解析路径的基准目录由调用方传入。`readSets(cards, members)` 给出每张卡的读集：计入的写范围路径各自所在的成员（路径等于成员目录，或在成员目录下面时取最深的成员），按成员声明的 `workspace:` 依赖求传递闭包，再加上读集文件的正文页。路径不在任何成员下时不贡献成员；写范围条目是成员目录的父目录（例如 `tools`）时也不贡献成员，因为它不在任何成员下。闭包只按 `package.json` 声明的 `workspace:` 依赖求，不做源码级 import 分析，与影响面选择一致。`readOverlap(entries, readSets)` 对每对不同的卡 a、b，比较 a 计入的写范围路径与 b 的读集路径，比较规则与写范围求交相同，两个方向各算一次。同一张卡的写与读不比较。不计入的写范围路径不参与比较。

`classifyReadConflicts(conflicts, basis)` 把读写交叉分成 `stopping` 与 `frozen` 两组，各保持输入顺序。每个交叉先由 `narrowerReadPath` 取写路径与读路径中较长的那条，也就是被另一条包含的那条，两条相同时取任一条。两条路径互不包含时 `narrowerReadPath` 抛 `invariant` 错误，`readOverlap` 不会产出这种输入。`basis` 由调用方传入：`registered` 是登记的模式，`tracked` 是冻结点上全部被跟踪的文件。`tracked` 中有文件在较长路径上或下面时逐个判定这些文件，没有时判定路径本身。全部判定为说明页时交叉归 `frozen`。否则交叉归 `stopping`，项中加 `file`（第一个不是说明页的文件）与 `reason`（`<file>: <原因>`）。`basis` 是 `{ unknown }` 时全部交叉归 `stopping`，`reason` 写明原因，没有 `file`。

`frozenPageStop(file, registered)` 返回 `file` 不是说明页的原因，是说明页时返回 undefined。说明页同时满足三项：在 `FROZEN_READ_PATHS.areas` 的某一项上或下面；以 `FROZEN_READ_PATHS.pageSuffix`（`.md`）结尾，或匹配 `FROZEN_READ_PATHS.skillStrategy`；不匹配 `registered` 的任何模式（按 `matchesRegistered`）。区的比较按 `/` 分段，`docs/engineering-old` 不在 `docs/engineering` 下，`toolsets` 不在 `tools` 下。`matchesRegistered(file, pattern)` 先把两者中每段开头的 `.` 换成同一个其他字符，再调用 `node:path` 的 `matchesGlob`，所以 `*` 与 `**` 也匹配以 `.` 开头的段，与 test-runner 的 `patternToRegExp` 相同。`?`、`[`、`]`、`{`、`}` 的语义两者仍不同，两边共用一个导出的匹配函数是剩余责任。技能包装的匹配直接用 `matchesGlob`，以 `.` 开头的段不算技能包装，偏向停止。`registeredReadPatterns(value, path)` 从 `REGISTERED_READ_PATTERNS.config` 的内容取 `affected.readers[].paths` 与 `affected.globalPaths`，不取 `affected.pythonPaths`，形状不合格时抛 `input-error`。规则与处置归[读写交叉的两类](../../../../docs/engineering/integration.md#读写交叉的两类)。

`parseReadSetFile` 只认含 `reads` 字段的 JSON 对象，其他内容交给 `fileScope`。字段只能是 `source` 与 `reads`：`source` 为非空字符串，`reads` 为仓库相对路径数组，可以为空，不合格时拒绝。`assignReadSets` 把读集文件挂到卡上：`source` 是 `#` 加数字时按卡号匹配，否则把两边都按调用方给的基准目录（`scope-cli.ts` 传当前目录）解析成绝对路径后，匹配 binding 文件参数。`source` 不对应任何卡参数，或同一张卡有两份读集文件时拒绝。关闭而不参与求交的卡，其读集文件不参与比较。

读集用独立的 JSON 文件，不扩展 binding：binding 的字段集是严格的，增加字段要改 `parseTaskBinding` 与 `start`。

命令只读。成员清单读运行它的检出的工作树。有读写交叉时，`scope-cli.ts` 先用 `git rev-parse` 取这个检出 `HEAD` 的提交，再用 `git show <提交>:<配置>` 与 `git ls-tree -r <提交>` 读出 `basis`。任一项失败时传 `{ unknown }`，不退回只按路径判定。JSON 的 `readBasis` 是 `{ commit }`、`{ unknown }`，没有读写交叉时是 `null`。JSON 结果的 `readConflicts` 是 `stopping`，`frozenReadConflicts` 是 `frozen`。标准错误先写 `read-overlap:` 行，每行末尾加 ` (<reason>)`，再写 `read-overlap-frozen:` 行。有写冲突对或 `stopping` 非空时退出1，只有 `frozen` 时退出0，输入不可用时退出2，标准输出总是完整的 JSON 结果或没有输出。

## 改动的写范围与线归属

[change-scope.ts](change-scope.ts) 的 `changeScope({ root, linesFile, diffContracts })` 只读，核对已绑定工作树中本卡实际改动的文件，以及本卡改到的契约成员的快照差异。[change-scope-cli.ts](change-scope-cli.ts) 是它的命令行，`scripts/check.sh` 在常驻检查中调用它。

- 没有 task context 时返回 `bound: false`，不读 Git 历史，CLI 退出0。context 不属于本工作树或分支、或没有 `ownerTask` 时读取失败，CLI 退出2。
- `cardChanges(root, taskBase, branch)` 要求 `taskBase` 是 HEAD 的祖先，否则以 `refused` 失败。它沿 `git rev-list --first-parent taskBase..HEAD` 逐个提交计算：单父提交取 `git diff-tree -r --no-renames` 的全部文件；合并提交取 `git diff-tree --cc` 的文件，即与每个父提交都不同的文件，含两侧都改过而没有冲突的文件。对每个合并的其他父提交 P，再走 `git rev-list P --not <第一父提交> --exclude=*/<branch> --remotes` 列出的提交，按同样两条规则计入：不在本卡以外任何远端跟踪分支上的提交是本卡自己的工作。最后并入 `git diff --no-renames HEAD`（未提交的改名计旧路径与新路径）与 `git ls-files --others --exclude-standard`。结果去重后排序。不读 `targetBase`。
- 限制（误拒方向）：快进同步、rebase 同步与合并只在本地的别的分支，会把别人的提交算进来；没有冲突而两侧都改过的文件也算进来。改法见 [README](README.md#改动的写范围与线归属)。合并带进来的本卡提交若已推到本卡以外的远端分支名下，不计入；这是剩下的漏检形状。
- `changeFindings(files, binding, lines)` 跳过 `isOpenScope` 为真的文件（`tmp` 与 `shared`）。不在任一 `writeScope` 项之下（按 `under`）的文件为 `change-outside-scope`。版本2、交付线不是 `integration` 的 binding，文件的 `scopeOwners` 含本线以外的归属时为 `change-outside-line`。同一文件两项都有时先列 `change-outside-scope`。每项带固定的 `remedy`。
- 线归属表缺省取 `taskBase` 提交中的 `docs/engineering/delivery-lines.json`。读不到或不合格时失败。
- 契约核对：`touchedContracts(files, members)` 取改动文件中有 `<成员>/api/` 下文件的契约成员。成员取 `taskBase` 线归属表（或 `--lines`）与工作树线归属表的 `contracts` 的并集，因为本卡可以新增成员。没有这样的成员时 `contract.kind` 为 `not-needed`，不运行 `omne-contract-api`。版本1的 binding 没有契约变更字段，`contract.kind` 为 `skipped` 并列出成员。其余情况运行 `diffContracts(taskBase)`，缺省为 dev-flow 依赖解析出的 `omne-contract-api --diff <taskBase> --json --root <检出根>`，经 `contract-diff.ts` 的 `runDiff` 与 `parseDiffRun`，超时 `CONTRACT_DIFF_TIMEOUT_MS`（120 秒）。它比较 `taskBase` 上的快照与工作树的快照，所以未提交的快照改动也计入。运行失败、输出不合格或输出的 `commit` 不是 `taskBase` 时抛出。`contract.kind` 为 `checked`，逐成员列出 `path` 与 `change`。
- `contractFindings(touched, run, declared)` 只看本卡改到的成员。差异为 additive 而申报 `none`，或差异为 review 而申报不是 `breaking`，为 `contract-exceeds-declared`。申报高于差异不报。成员在差异里为 `invalid` 或不在差异里时为 `contract-change-unknown`，`change` 为 null。每项有 `member`、`change`、`declared`、`message` 与 `remedy`。契约发现排在文件发现之后。

CLI 的标准输出是报告 JSON。每项发现另向标准错误写一行 `change-scope: <代码> <文件或成员>: <说明> 改法：<改法>`。退出码：没有发现或未绑定为0，有发现为1，参数、context、Git、线归属表读取错误或 `omne-contract-api` 运行失败为2，错误以一行 JSON `{code, message}` 写到标准错误。

`tests/delivery-change-scope.spec.ts` 在临时真实 Git 仓库与手写 context 上覆盖：范围内放行；本卡提交越界；改名与删除（含未提交的 `git mv`）；从远端同步合并带来的文件不计入；从远端合并同批次别的卡的提交不计入；冲突解决越界；本卡本地侧分支作第二父时计入；目标作第一父、卡分支移到合并时本卡提交计入；契约差异的基线不是 taskBase 时失败；`targetBase` 早于 `taskBase` 且其间有别的卡的提交时不计入；未提交与未跟踪的越界改动；`tmp` 与 `shared` 不计入；别的线与联调轨道的路径即使在写范围内也拒绝；`integration` 卡不做线归属；线归属表取 `taskBase` 的版本；CLI 的未绑定、无发现、有发现与两种退出2。契约核对用注入的差异覆盖三种申报对三种差异、只比较改到的成员、`invalid` 与缺失的成员、版本1跳过，以及没有改 `api` 目录时不运行差异（合并别的卡带进来的快照变化）。用安装的 `omne-contract-api` 在临时检出覆盖：差异为 none 时放行，additive 申报 `none` 时拒绝、申报 `additive` 时放行，合并别的卡对另一成员的 review 不计入，差异运行失败时退出2。

## 契约基线的读取

[baseline.ts](baseline.ts) 读 baseline 卡评论中的 `json omne-contract-baseline:v1` 区块，按评论时间合并。区块格式归 repo-toolchain 的 `omne-contract-api`（`src/declarations/api-baseline.ts`）。dev-flow 依赖的 repo-toolchain 版本不导出这个解析，所以本模块自带一份同形状的校验：顶层只有 `milestone`（必有，字符串或 null）、`members`（非空，每项只有 `path`、`commit`、`sha256`、`apiTree`，`path` 是不重复的仓库相对路径，`commit` 与 `apiTree` 为40位、`sha256` 为64位小写十六进制）与可选的 `breakingCards`（不重复的非空字符串）。

- `readComments(repository, issue, call)` 只发 `gh api --method GET` 加 `REST_HEADERS` 与 `repos/<仓库>/issues/<编号>/comments?per_page=100&page=<n>`，逐页读到一页少于100条为止，最多20页，超出时以 `InputError` 失败。评论的 `id`、`html_url`、`created_at`、`updated_at`、`user.login`、`user.node_id` 与 `body` 不合格时以 `InputError` 失败。命令不写平台。
- 登记者：`publishReviewers(repository, call)` 读 `repos/<仓库>/environments/publish`，取 `required_reviewers`。作者的 login 与 node ID 都等于一个 User 审批者，或作者是一个 Team 审批者的 active 成员时，作者是登记者。这是能派发的人，口径同 `start` 对派发评论的核对（`integration/authority.ts`）。环境读不到或没有审批者时以 `InputError` 失败；团队成员关系读不到时不授予。只有评论里有区块时才读环境。
- `mergeRegistrations(comments, isRegistrar)` 按 `created_at` 再按 `id` 从旧到新处理。没有区块的评论跳过。作者不是登记者的评论不读区块，列在 `ignored`（评论、作者与原因），不改基线，也不加 `breakingCards`。登记者的评论中：一条评论有两个以上区块为 `baseline-duplicate`；区块没有结束的围栏、不是 JSON 或形状不合格为 `baseline-invalid`；区块的 `milestone` 与最早的区块不同为 `baseline-milestone-mismatch`。没有登记者发的区块为 `baseline-missing`。有任一问题时结果为 `refused`，逐项列出代码、评论与说明。
- 没有问题时结果为 `merged`。同一成员取最晚的区块。较晚的区块可以写较早区块没有的成员：基线之后加入的契约成员由 baseline 卡这样补登记首份快照，见[里程碑内的规则](../../../../docs/engineering/integration.md#里程碑内的规则)第4条。漏登记由 `omne-contract-api --baseline` 判出。`breakingCards` 是各区块的并集，按首次出现的顺序。`registrations` 从旧到新列出每条登记评论、作者、`edited`（`updated_at` 不等于 `created_at`）与它写的成员。编辑过的评论照常采信：GitHub 只让作者与有写权限的人编辑评论。
- `renderBaselineBlock` 按固定的键顺序写围栏区块，成员按 `path` 排序。`parseBaselineText` 与 `omne-contract-api --baseline` 读法相同：整段是 JSON 对象，或恰好含一个区块。

[baseline-cli.ts](baseline-cli.ts) 的 `read <卡号> --out <文件> [--config <文件>]` 从交付配置取仓库，读这张卡并合并。每条 `ignored` 向标准错误写一行 `baseline: ignored <评论>: <原因>`。结果为 `merged` 时把区块写到 `--out`，标准输出为 JSON（`issue`、`out`、`kind`、`baseline`、`registrations`、`ignored`），退出0。结果为 `refused` 时不写文件，标准输出为 JSON（`issue`、`kind`、`problems`、`ignored`），每个问题向标准错误写一行 `baseline: <代码> [<评论>]: <说明>`，退出1。参数、交付配置与 GitHub 读取错误（含环境读不到）退出2，标准输出为空，错误以一行 JSON `{kind: "baseline-error", message}` 写到标准错误，不转述 API 输出。云端会话的代理不放行环境读取，所以有区块时命令在云端会话退出2。

`tests/delivery-baseline.spec.ts` 用记录调用的 GitHub 替身覆盖：分页完整且只有固定 argv 的 GET；同一成员取最晚的区块，先比时间、同一时间再比 `id`，与响应顺序无关；较晚的区块加入新成员；`breakingCards` 合并；缺区块、一条评论两个区块、各种不合格的区块（含短一位的哈希与缺 `milestone` 键）与 milestone 不同各拒绝；非登记者较晚的区块不改基线、不加 `breakingCards` 并列在 `ignored`；团队成员授予、login 相同而 node ID 不同不授予；编辑过的评论标 `edited`；环境读不到时失败；写出的区块读回等于合并结果；`parseBaselineText` 的纯 JSON、单区块与两个区块。CLI 用例经 PATH 上的 `gh` 替身覆盖写出文件退出0、拒绝时退出1且不写文件、读取失败与参数错误退出2。与 `--baseline` 的组合不在本成员的测试中：dev-flow 依赖的版本没有 `--baseline`。

## 里程碑命令

`createMilestone` 先分页读仓库全部里程碑，按标题精确匹配。同名多于一个时拒绝。同名且截止日的日期部分等于请求日期时返回已有里程碑，不写。同名而日期不同时拒绝。否则以 POST 建里程碑，`due_on` 为请求日期的 `12:00:00Z`，再以响应中的 `due_on` 判断 `verified`。标题须为一行且不含 `-->`。日期须为真实存在的 `YYYY-MM-DD`。

`carryMilestone` 在第一次写入前完成全部读取与核对：两个里程碑都存在且不同，原因为一行非空文字，卡号不重复，每张卡的里程碑是 A 或 B。任何一项不满足都不写入。每张卡最多两次写入：卡不在 B 时 PATCH 里程碑，卡上没有同一 A 到 B 的流转评论时 POST 评论。流转评论由 `carryComment` 生成。卡已在 B、本次不移动时（例如补跑上次 PATCH 成功、评论失败的运行），评论写明本卡已在 B、本次运行未移动，不写成 A 到 B 的流转。`isCarryComment` 只看评论的第一行，第一行是 `from` 与 `to` 都相同的标记时才认。写入按命令给出卡的顺序串行执行。某次写入失败时报告序号并停止，不回滚。写入后逐卡再读，`verified` 为读回的里程碑等于 B。命令不读或修改 binding。

`milestone create` 不建 Project 视图。它输出 `MILESTONE_VIEW_MANUAL_STEPS`，即在网页上为新里程碑建 Board 视图的步骤。

## 看板字段写入

字段 ID、选项 ID 与看板设置只登记在[交付配置](../../../../docs/engineering/github-delivery.json)。`parseConfig` 读 `project.fields` 的六个看板字段（`line`、`kind`、`dispatchedAt`、`deliveredAt`、`acceptedAt`、`cycleDays`，缺省为 null），Wave 用已有的 `iteration` 字段，`project.options` 的 `stage`、`line` 与 `kind` 选项表（缺省为空）和 `board` 项（缺省为 null），只核对形状，所以没有这些键的旧配置照常可读。`boardEvent(config, event)` 在一个事件运行时判断语义，并把该事件启用的每个写入解析成带字段 ID 与选项的 `EnabledWrite`。没有 `board` 项、或该事件没有启用写入时返回 null，不判断 `board` 项的其余部分。否则：Project ID 须存在；`timeZone` 须是运行环境认可的 IANA 时区；未知事件拒绝；该事件只能启用表中属于自己的写入，同一写入不能列两次；每个启用的写入须有字段 ID（Status 用 Stage 字段，Wave 用 `iteration` 字段，Cycle days 还须有 Dispatched at 字段）；启用 Status 写入时，目标选项（In review、Integrating、Accepted）须在 `options.stage` 中。选项表按自有键查找，`constructor` 一类原型上的名字不算选项。

`planBoardWrites` 只规划已解析的写入，输入还有写入前读到的条目字段值：本事件的日期字段写 `date`，但 Dispatched at 已有值时不覆盖；Wave 已有值时同样不覆盖；Line 写交付线对应的选项；Kind 写已通过 `cardKind` 核对的选项；该函数要求正文主工作类型唯一且有效，并与唯一 `kind:` 标签一致；Wave 写起止范围包含 `date` 的迭代，即 `startDate` 不晚于 `date` 且相差少于 `duration` 天，几个迭代都包含 `date` 时取配置顺序中的第一个；Status 写本事件的目标选项；Cycle days 写 `date` 与 Dispatched at 相差的整天数。Dispatched at 或 Wave 已有值、缺少交付线、交付线没有选项、正文主工作类型缺失、重复、无效或与唯一 `kind:` 标签不一致、Kind 没有选项、没有包含 `date` 的迭代、Dispatched at 为空、不是合法日期或晚于 `date` 时，该项进入 `skipped` 并写明原因，不猜测取值。

`recordBoardEvent` 先读卡在配置 Project 中唯一的条目（Issue 节点的 `projectItems`，含已归档条目），没有或多于一个时拒绝。事件写 Dispatched at、Cycle days 或 Wave 时，在规划之前读一次条目的字段值。事件写 Wave 时，在规划之前读一次该迭代字段的 `configuration.iterations`，迭代长度不是正整数天时拒绝。每项写入是一次 `updateProjectV2ItemFieldValue`，查询文本固定，Project、条目、字段与值作为 GraphQL 变量传入：日期为 `value[date]`，数字以 `-F value[number]` 按数值传入，单选为 `value[singleSelectOptionId]`，迭代为 `value[iterationId]`。写入串行执行。某次写入失败时抛出 `BoardWriteError`，带序号、写入名与已规划的 `skipped`，不回滚。写完后读回各字段。结果是判别联合：`applied: false` 是只读取与规划的 `dryRun`，没有读回；`applied: true` 带 `readback` 与 `verified`，`verified` 表示每个字段等于写入值。错误消息不含 API 原文。

`recordDispatch` 是 `start` 使用的入口，不抛出。`boardEvent(config, 'dispatched')` 为 null 时返回空，不报告。云端会话、`boardEvent` 拒绝、读写失败、跳过的写入与读回不符各返回报告行；写入失败时，已规划的跳过项也各返回一行。代码为 `board-write-failed`、`board-skipped` 或 `board-unverified`。日期是调用时刻在配置时区中的日期。

## 派发命令

[protocol.ts](protocol.ts) 的 `dispatchFieldGaps(issue)` 是纯函数，返回卡缺少的派发字段：`kind:` 标签数不是一、`line:` 标签数不是一、milestone 为 null。milestone 未读取（undefined）时不判断。`start` 与 `register` 在准入核对之后、写 context 之前调用它，结果非空时以 `refused` 拒绝，条款见[集成工具规格](../integration/SPEC.md#授权与开工)的 I19。

`parseDispatchSpec` 严格读调度者的决定：`issue`、`attempt`、`responsible`、`branch`、`taskBase`、`writeScope`、`route`、`completionTarget`、`basis` 与 `confirmations`，全部必填。可选 `revision`，正整数。其他字段拒绝。`confirmations` 每项只有 `condition` 与 `evidence`，不含摘要。

`taskBaseInputs(root, taskBase)` 从 taskBase 提交读 policy、policy 指向的交付配置与线归属表，两者的仓库须相同；taskBase 中 `tools/dev-flow/src/delivery/binding.ts` 不含版本2区块标记时拒绝。`cardAdmission` 以本卡为授权卡位置调用准入采集，因为采集只读授权卡所在的 Issue，不读评论本身。

`planDispatch` 在任何写入之前判断并生成版本2 binding，`dispatch` 为占位 URL。拒绝的条件依次为：卡未开放；`actor` 不等于 `responsible`；`dispatchFieldGaps` 非空；准入观察对本卡有偏离；正文属性不合格或交付修订不唯一；卡上已有评论的 `omne-integration-authority:v1` 区块派发同一修订与 attempt，且没有 `force`；`confirmations` 引用卡上没有的条件；某个 start 条件没有 `confirmations` 项；拟写的 binding 有 `attributeRefusals` 选出的属性发现。交付修订、属性、里程碑与条件 ID 取自采集到的卡。`spec.revision` 大于卡上的交付修订时，上面的全部核对都读 `reviseCardBody` 返回的正文，不读卡上现在的正文，计划带 `revise`。`spec.revision` 小于卡上的交付修订时拒绝。`spec.revision` 等于卡上的交付修订或省略时，计划不带 `revise`。每个 start 条件的确认摘要是 `conditionDigest(condition)`，与 `start` 核对时用同一函数和同一解析。

`dispatchProse(text)` 拒绝空的或只含空白的派发正文，抛出 `input-error`。`dispatch-cli post` 读入 `--text` 文件后先调用它，`postDispatch` 在第一个请求之前也调用它。所以空白正文使 `post` 退出 2，不调用 GitHub。

计划带 `revise` 时，`postDispatch` 先改卡的正文。它 GET 卡，正文须与核对时读到的正文（`revise.before`）相同，不同时以 `refused` 拒绝，不写入。然后它 PATCH 卡的正文为 `revise.body`，再 GET 读回。读回的正文等于 `revise.body` 才继续。改正文的 PATCH 失败、读回正文的 GET 失败或读回不等时，以 `unknown` 失败，不发评论。

之后 `postDispatch` 串行发三个评论请求：POST 占位评论，PATCH 把它改成 `dispatchComment(prose, decision)`，GET 读回。决定中 binding 的 `dispatch` 是占位评论的 `html_url`。改评论的 PATCH 失败时，错误给出占位评论 URL，不重试、不删除。改评论的 PATCH 成功后、读回评论的 GET 之前调用 `onPosted`，交出派发 URL 与 binding。读回评论的 GET 失败时，错误给出派发评论 URL。`verified` 表示读回的评论正文等于写入的正文。

`reviseCardBody(body, revision, route, completionTarget)` 是纯函数，返回为 `revision` 派发时卡的正文。`revision` 等于卡上的交付修订时返回 undefined。大于时改两处：「- 交付修订：」一行改为新号；「### 分支、基线与task context」小节内的 binding 区块（v1 或 v2），连同 `bind` 写在它上面、之间只隔空行的「正式派发：」一行，换成一行派发前说明。说明写新旧修订号、计划集成路线与最终终点。小节内没有 binding 区块时只改第一处。结果的 `from`、`to`、`before`、`body` 与 `edits` 给出新旧修订号、改前正文、改后正文和按正文顺序的每处改动（`part` 为 `revision` 或 `binding`，带 `before` 与 `after`）。下列情况拒绝：

- 正文没有唯一的交付修订行。
- `revision` 小于卡上的交付修订。
- 小节内的 binding 区块没有闭合。
- 小节外有 binding 区块。

函数只比较修订号，不从正文其他内容推断。`dispatch-cli post` 的 `--dry-run` 与正式输出都以 `cardEdits` 给出 `from`、`to` 与 `edits`。

`bindBody(body, binding, worktree?)` 是纯函数。正文须恰有一个「### 分支、基线与task context」小节，小节到下一个二级或三级标题为止。整节换成一行派发说明与版本2 binding 区块，说明的 revision、attempt、taskBase 取自 binding。只在「### 认领与派发」小节内，「- 派发情况：」行以及给出 `worktree` 时的「- 工作树：」行被改写。给出 `worktree` 而小节内没有「- 工作树：」行时，在小节最后一个非空行之后补一行。给出 `worktree` 而正文没有恰好一个「### 认领与派发」小节时以 `input-error` 拒绝，`dispatch-cli bind` 退出 2。binding 的 `dispatch` 是占位 URL 时拒绝。结果的唯一 binding 须按 `readTaskBinding` 读回与输入相同，否则拒绝。`bindCard` 读卡，核对 binding 的仓库与 Issue 节点，写入新正文后再读一次。结果是判别联合：`applied: false` 是只读不写的 `dryRun`；`applied: true` 带 `verified`，表示读回的 binding 与输入相同。读卡由 [github-read.ts](github-read.ts) 的 `fetchIssueCard` 完成，求交与工作树命令共用它。

## 事件等待

线会话与集成节点阻塞在 GitHub 事件上，不轮询 API。接收器把 webhook 事件追加到本机的事件文件，`wait-cli.ts` 读这个文件。`wait-cli.ts` 不写平台。频道接收器只管理归属已证实的精确 hook。legacy 转发器保留单机用途，不自动删除归属未知的 hook。

`events.ts` 的 `normalizeGithubEvent` 把一次投递归一成 `EventRecord`：`delivery`、`event`、`action`、`number`、`state`、`draft`、`base`、`marker`、`html_url`、`receivedAt`。缺少 `X-GitHub-Event` 头或 payload 不是对象时抛出 `DeliveryInputError`。投递不带的字段为 null。评论的 `marker` 取正文第一行 `<!-- ... -->` 里的第一个词，第一行没有这样的注释时为 null。

`head` 是 PR 的 head commit，小写，只有 `pull_request` 事件带。

`matchEvent` 判断三种原子谓词和 `any`，规则只有这些：

- `issue-closed`：事件是 `issues`，action 为 `closed`，号相同。`labeled`、`reopened` 等其他 action 不算。
- `pr-ready`：事件是 `pull_request`，`base` 等于给定分支。action 为 `ready_for_review`，或 action 为 `opened` 或 `synchronize` 且 `draft` 为 false。号与 `head` 都在 `ignore` 列表里的 PR 不算。`head` 比较不分大小写。`head` 为 null 的行不会被忽略。
- `any`：由若干原子谓词组成，任一成员满足即满足。命中的成员取列表里第一个满足的。
- `comment`：事件是 `issue_comment`，action 为 `created`，号相同，`marker` 相同。`edited` 不算。

去重按 `delivery`。同一个 delivery id 只算第一次，之后的行被忽略，包括 `--since` 之前读到的行。`delivery` 为 null 的行不去重。

频道模式使用独立频道和精确 hook 身份。持久配置包括 schemaVersion、repository、instanceId、ownerHost、频道地址、事件文件、订阅类型与 ownership。ownership 区分 uncreated、creating、owned、borrowed、deleted。创建前先保存 creating；创建响应中的 hookId 保存为 owned。响应丢失时仅以实例标记的完整 URL、事件类型和 hook 属性对账。归属不明不得重建或删除。

频道地址只存权限受限配置。频道事件无法证明原始 GitHub 签名，所有业务提示带 `receiver={instanceId,repository,mode:"channel",requiresReconcile:true}`。可选 subject 保留 runId/runAttempt、workflowJobId、checkRunId/checkSuiteId、deploymentId/deploymentStatusId、reviewId、pullNumber、headSha 与 ref；它们只定位权威查询。无效身份元数据不得降为可信旧事件。连接诊断含 connectionEpoch 和 coverage-gap；连接成功不消除频道无可靠重放的限制。

接收器处理 SSE 分片、多行、心跳和重复投递。坏帧、非法编码、日志损坏和永久权限错误明确失败。断连从 1 秒开始指数退避并抖动，最长 30 秒。连接或重连写诊断事件，使等待者做一次有界对账。健康的空闲接收不周期读取 GitHub 业务状态。

同一事件目录的频道与 legacy 接收器共用原子守卫。receiver.pid 保留进程号，receiver-state.json 保存模式、仓库、实例、主机、进程启动身份、hookId、订阅类型、连接状态和诊断。健康检查默认每 5 秒核对本地进程身份、pid 和事件文件。不能只用 PID 存活断言接收健康。无法确认已停止的旧写者时拒绝争抢。

本地状态使用 schemaVersion 2。`processIdentity` 与 `processStartedAt` 分别记录身份和启动时间。Linux 身份由 `/proc/sys/kernel/random/boot_id`、PID 和 `/proc/<pid>/stat` 的第 22 字段启动 tick 组成，不使用墙上时钟或 `ps lstart` 判断身份。解析 stat 时允许 comm 含空格和括号。读取失败或字段无效时不生成替代身份。Windows 继续使用 Get-Process 的 UTC StartTime，其他 POSIX 继续使用 ps lstart 识别进程。

Linux 的启动时间单独取 ps lstart，必须能解析为时间。认领时按查询进程的时区解释该时间，并将所有平台的 `processStartedAt` 保存为 UTC ISO 8601 时间。消费进程按该绝对时刻判断，不按自己的时区重新解释。此转换不改变 Windows 或其他 POSIX 的身份 token。启动时间只在认领时保存，之后校时不重写它。

健康检查比较稳定身份，释放还须核对持久的实例、仓库、文件、主机、PID、模式、管理状态、hookId 和启动时间。核对失败保留 pid 文件。

版本 1 或缺少身份、时间无效或启动时间未带明确时区的本地状态无法通过读取、健康检查或释放，不从旧时间文本猜测时区，不依据旧 PID 授予写权。恢复前须确认原接收器已停止、事件目录属于目标实例，以及配置里的仓库、主机和 hook 归属。只有旧 PID 已不存在或 pid 文件不存在时，新认领才可按既有守卫重建本地状态；PID 仍存活或无法确认已停止时保持拒绝。废弃的 guard 仍需在确认没有写者后人工处理。更新本地状态不迁移或删除 hook，不替代 hook 的精确所有权恢复。

自建频道停止时只删除持久 owned hook，删除前验证精确身份。借用实例只退订，不调用 hook 写接口。创建响应丢失、日志失败或归属不明保存 recovery-needed。clean 只允许处理本机已停止且归属已证实的实例；全仓扫删入口退出。

legacy 的 HTTP 接收器只绑定 127.0.0.1、只接受 POST。给出 secret 时校验 X-Hub-Signature-256；签名不符返回 401，非法投递返回 400，落盘完成返回 204，写失败返回 500。停止时结束自己的 forward 子进程并释放本地写者。gh forward 没有可证明所有权的创建回执，因此不得用前后列表差分猜 hook；停止保留 recovery-needed 并退出 2，422 另给 legacy-hook-conflict。SIGKILL 无法执行清理，后续按持久身份恢复。

check 自检分别验证进程、连接、精确 hook 状态、一条真实事件落盘和等待对账立即返回。借用模式由拥有者提供 hook 证据，消费者仍验证端到端。命令退出、输出可取和 agent 续接是三项不同验证。

check 要求持久 `processStartedAt` 是带明确时区的 ISO 8601 时间，且它和事件 `receivedAt` 都能解析为有限时间。check 拒绝无效时间和启动前事件，接受与启动时刻相等的事件。稳定身份不能作为时间字段参与比较；时间解析失败不能通过 NaN 比较放行。

`waitForEvent` 的语义：

- 阻塞。到匹配事件出现才返回，事件文件不存在时等它出现。
- 先读文件里已有的行，再监听目录，每次只读新增的字节范围。一行只在换行符到达后解析。不是事件的行被跳过。
- 监听之外，每5秒再读一次本地事件文件，补上丢失的监听通知。这次读取只读本地文件，不调用 GitHub API。
- 事件文件变短，或 inode 变了（文件被换成另一个），从头重读。重读到的已计过的 delivery 仍按去重忽略。
- 事件文件不存在不算错误。读事件文件状态的其他错误使等待失败并退出2。
- 旧格式事件行在文件中已有匹配时直接返回，不读 GitHub。带频道身份的行只触发权威对账，不能直接放行。
- 启动对账。已有内容没有可信匹配时，调用注入的对账函数。旧格式事件此后不再调用 GitHub API。`any` 对每个成员各调用一次，第一个命中的成员结束对账。事件在对账期间已经命中时，不再对后面的成员调用对账函数。对账命中时立即返回，输出标 `source: "reconcile"`。可信事件命中标 `source: "event"`。
- 频道行的可选 `receiver` 包含非空 instanceId、repository、mode=channel、requiresReconcile=true。解析保留该信任标记；标记非法时整行无效，不降级成旧格式。频道行的 repository 必须等于调用者明确传入的 repository，且调用者必须提供 reconcile，否则等待失败。CLI 将已解析的 `--repo` 或 origin 仓库传入。
- 频道业务行匹配谓词，或 receiver 的 connected/reconnected 诊断到达时，执行一次有界权威对账。仅权威结果能返回 `source: reconcile`。诊断可附 reasonCode、非负整数 connectionEpoch 和 coverage=coverage-gap；它不证明历史事件已完整重放。对账串行执行，对账期间收到的新触发保留到下一次读取；本地5秒检查不会自行触发平台轮询。
- `any` 的输出多一个 `matched`，值是命中成员的谓词名。库层的 `any` 的成员可以是 `issue-closed`、`pr-ready` 与 `comment`，`wait-cli.ts any` 只组合 `issue-closed` 与 `comment`，所以命令输出的 `matched` 只会是这两个值。原子谓词的输出没有 `matched`。
- 对账失败时等待失败并退出2，不继续等。对账读不到就不能证明没有错过事件。
- 对账读平台当前状态，不是事件。`issue-closed` 看卡现在是否已关闭，`pr-ready` 看目标分支上是否有开放、非草稿且不在 `ignore` 里的 PR，只看 `gh pr list` 返回的前200个开放 PR，输出带它的号与 `head`，`comment` 看 `--since` 之后创建的评论里是否有标记。前两者不受 `--since` 限制。
- `--since` 是 ISO 时间时，只认 `receivedAt` 晚于它的行。是 delivery id 时，只认文件里在该行之后的行。这个 id 不在已有内容里时，等待失败并退出2。
- 超时退出3，标准错误写说明，标准输出为空。超时不表示条件不成立。没有 `--timeout` 时不超时。

退出码：命中 0，输入、对账或文件错误 2，超时 3。`wait-cli.ts` 与 `events-receiver-cli.ts` 以2退出时，标准错误的 JSON 在错误带有系统错误码时多一个 `code` 字段，例如 `ELOOP`；输入错误不带 `code`。

事件文件只保存归一后的字段，不含评论正文。接收器进程不在时，GitHub 不补发事件。旧格式通过启动对账补救，频道还在连接恢复和业务提示时对账。同一个事件文件由一个接收器写，第二个接收器启动会被拒绝。`--ignore <pr>@<head>` 可重复，只属于 `pr-ready`。`head` 须是完整的 commit sha，40 或 64 位十六进制，大小写不分。短 sha 以输入错误退出2，消息说明要完整 sha。`any` 接受可重复的 `--issue-closed <号>` 与 `--comment <issue>:<标记名>`，至少一个。

验证资源：[delivery-events.spec.ts](../../tests/delivery-events.spec.ts)覆盖归一、谓词、等待、对账及 legacy 生命周期。[delivery-events-cli.spec.ts](../../tests/delivery-events-cli.spec.ts)覆盖实际子进程 CLI、退出码、清理拒绝与 SIGHUP 收尾。[delivery-events-trust.spec.ts](../../tests/delivery-events-trust.spec.ts)验证频道提示不能直接放行、重连对账与读回期间新提示保留。[delivery-events-receiver-channel.spec.ts](../../tests/delivery-events-receiver-channel.spec.ts)验证 SSE、频道身份、hook 恢复与本地健康。[delivery-events-receiver-identity.spec.ts](../../tests/delivery-events-receiver-identity.spec.ts)用受控内核与时钟输入验证校时不改变身份、身份变化及旧状态拒绝、释放所有权和事件时间过滤。独立 UTC 生产进程与 Asia/Shanghai 消费进程覆盖启动前事件拒绝和相等边界接受；内核身份及系统查询输出受控，配置权限检查与文件读写使用实际宿主。网络 seam 和本地服务器不能替代真实双机、GitHub 投递及宿主续接验收。

## 首次派发消息具体化

`line-initial-dispatch-cli.ts` 提供 fields、render 和 validate。模板来自工具源码检出的固定模板路径，不从输入 JSON 选择代码或模板。fields 返回模板占位名。输入只含 schemaVersion、milestone、line、revision、fields，未知顶层字段拒绝；字段集合必须与模板完全相同。line 是受限短名，milestone/revision 为正整数，dispatch_revision 必须相同。只输出模板的消息正文，不把填写说明交给 Line。

输入 JSON 与演练证据先经 [strict-json.ts](strict-json.ts) 解析，重复键（含转义后相同的键）、超过 1 MiB 或嵌套超过 128 层时拒绝，错误以文件路径开头，例如 `<path>: json-invalid`。生成使用独占创建。同修订、同内容重放复用文件；已有不同内容或损坏文件明确拒绝，不能静默覆盖。空字段、残留占位、重复 CLI 选项、子命令不接受的选项、常见 token/private key 和 smee 频道地址拒绝。该扫描不是通用秘密证明。输入中的命令始终是消息文本，工具不执行它们。

validate 必须有 `--rehearsal-evidence`，缺少时退出 2。证据先读 `schemaVersion`（只接受 1），再读其余字段：`messageSha256` 是 64 位十六进制摘要，按小写比较；`commands[]` 每项有 `command`、可选 `executed`、`exitCode`（0 到 255 的整数）和 `outputSummary`，其他字段拒绝。两项的 `command` 合并连续空白后相同时拒绝，一条命令只有一个演练结果。`executed` 只作记录，不参与匹配。validate 依次核对下列各项，任一项不成立就退出 2，不输出 STRUCTURE_CHECKED：

1. 消息文件与按输入重新生成的字节相同。
2. `messageSha256` 等于消息文件的 SHA-256。
3. 消息里的代码块都已闭合，且都是 shell 代码块。代码块边界按 CommonMark 识别：开始行缩进不超过 3 个空格，以 3 个以上反引号或 3 个以上 `~` 开头；信息串的第一个词转成小写后是语言。结束行用同一字符，长度不短于开始行，且没有信息串；块内带信息串的边界行仍属于块内容。语言是 `sh`、`bash`、`shell` 或 `zsh` 的块是 shell 代码块。未闭合的块报 `initial-dispatch-fence-unclosed`，其他语言或没有语言标签的块报 `initial-dispatch-non-shell-block`。字段值带入的代码块按同一规则处理。
4. shell 代码块里的每条命令都有证据项。空行和以 `#` 开头的行跳过，行尾反斜杠连接下一行，比较前去掉首尾空白并合并连续空白。缺证据时报 `initial-dispatch-rehearsal-missing` 并列出命令。

证据里与消息命令都不匹配的项不使 validate 失败。结果的 `matchedCommands` 是消息里不同命令的条数，`extraEntries` 按原文列出不匹配的证据项。非 0 退出码不使 validate 失败，结果的 `nonZeroExits` 逐条列出，由 reduce 说明。

工具输出 GENERATED 或 STRUCTURE_CHECKED，均不能代表完整 VALIDATED。输出包含路径、SHA-256 及仍须负责人判断与机器证据共同完成的 guards。授权、精确输入可读性、目标机器命令与策略、等待链和秘密/矛盾检查由 reduce 执行并保存证据。工具不伪造 OPENED_FOR_HUMAN 或 FORWARDED_REPORTED。正式消息不改变 binding 的写范围或已有唯一执行。

验证资源为 [delivery-initial-dispatch.spec.ts](../../tests/delivery-initial-dispatch.spec.ts)，覆盖实际 Node CLI、字段和秘密拒绝、重复生成、修订冲突、输出变更、子命令选项、五事实不混同，以及演练覆盖：缺证据、证据针对别的消息、缺命令、重复命令、空白差异、多余证据项、非 0 退出码、CommonMark 代码块边界、未闭合块和非 shell 块。实际材料可达、打开、转发和接收端唯一执行由宿主行为验收分别验证。
