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

CLI接受显式 `--config` 及互斥的 `--capture`、`--live`。`--save-capture` 只适用于 live。`--baseline`接收同版本报告，`--report` 指定报告文件，否则输出 stdout。`--lines` 与 `--registry` 指定属性发现用的线归属表与 policy registry，缺省为本检出的 `docs/engineering/delivery-lines.json` 与 `docs/engineering/integration-policy.json`。两者读不到或不合格时退出2。

输出不得覆盖输入或互相覆盖。现存文件按设备与inode识别；未创建的目标按真实父目录与最终符号链接目标识别。解析保留相对目标中的实际目录语义，悬空链接链仍须对账。循环或过长链接链在读取平台及写入前拒绝。输入与输出须为常规文件，父目录须存在。该预检查不提供对并发文件系统变更的原子锁。

观察成功退出0，包括有偏离或 unknown 的报告。非法输入、身份冲突、不可读文件或不能写入输出时退出2。错误输出不含原始 API 内容，不产生空成功报告。本模块没有自动交付阻断或 CI 门禁。

## 持续验证与限制

`tests/delivery-observe.spec.ts` 覆盖输入绑定、六类工作、新旧两层级布局、实际模板填卡、缺失与重复章节、布局混用、父关系、决定声明、条件反例、隐藏阶段循环、投影对账、差量、属性类别与真实离线CLI。`tests/delivery-attributes.spec.ts` 覆盖属性读取与每个属性发现代码的正反例。`tests/delivery-binding.spec.ts` 覆盖 binding 两个版本的解析与区块读取。`tests/delivery-lines.spec.ts` 覆盖线归属表校验与 `check:lines`。`tests/delivery-labels.spec.ts` 用记录调用的 GitHub 替身覆盖差异、只改三族、读回核对、拒绝与写入失败。`tests/delivery-scope-overlap.spec.ts` 覆盖写范围求交的前缀判断、不计入的路径、默认排除已关闭的卡、重复来源与 binding 读取。`tests/delivery-dispatch.spec.ts` 覆盖派发字段缺项、摘要按现行条件行计算、写平台前的每项拒绝、同一修订与 attempt 不重复派发、占位评论改写与读回、读回失败时先交出派发 URL、只在「认领与派发」内改写、占位 URL 不写回、binding 写回与 dry run，以及在真实 Git 检出中读取 taskBase 的输入。`tests/delivery-milestone.spec.ts` 与 `tests/delivery-board.spec.ts` 用记录调用的 GitHub 替身覆盖里程碑与看板写入的请求参数、写前核对、重跑、读回、写入失败，以及看板设置的校验与旧配置的兼容。`tests/integration-board.spec.ts` 在真实 Git 检出中驱动 `start`，覆盖看板写入失败、配置关闭与重复开工时 context 和结果不变。`tests/delivery-github-read.spec.ts` 验证固定只读请求、物理字段映射、采集错误和分页限制。`tests/integration-delivery-facts.spec.ts` 验证提供 Project 事实时不发 GraphQL 请求，以及 Project ID 不符和 item 为空时拒绝。远端响应在这些测试中以有限 fixture 提供。

真实权限、语义接受、跨仓等待链、Project 全局写入竞态、跨会话恢复及业务迁移是否完整未由本模块证明。正式配置保持`enabled:false`。平台启用、默认分支模板发布与实际宿主执行仍须独立验证，每项普通任务独立维护本次身份、范围和结果。

## 集成绑定与目标条件

当前报告版本5包含可选integrationBinding，TaskBinding 为版本1或版本2，形状归[集成工具说明](../integration/README.md#任务与执行权)。Issue 唯一 binding 区块绑定当前交付修订及 attempt，字段归 [binding.ts](binding.ts)。缺区块仍可作原交付观察；集成 start 必须有合法绑定。重复、身份或修订不符是偏离，不能据观察报告授权。

条件使用原表，可增加第七列“适用目标”。integration 条件支持 all、track、main、stable 及相应完整 branch ref；六列表映射 all。start/acceptance 只允许 all。指向未登记轨道的条件由 policy registry 拒绝；未满足的目标条件只阻对应运输。最终“main/stable 已包含结果”放 acceptance，不能作为其自身运输前置。旧报告版本拒绝，不转换。已知阶段等待图仍保守，不声明目标细化的完整无环。

## 属性发现

`observeDelivery` 的第四个参数提供线归属表与 policy registry 时，对每张开放的交付卡调用 [attributes.ts](attributes.ts) 的 `attributeFindings`，把结果记入 `attribute` 类别。没有这个参数时不产生属性发现。关闭的卡、非交付卡与创建交接入口不产生属性发现。

`attributeFindings({ binding, card, conditionCards, lines, registry })` 是纯函数，判据归[交付协议](../../../../docs/engineering/delivery.md#卡属性与合法组合)与[多层分支集成](../../../../docs/engineering/integration.md#交付线)：

1. `readCardAttributes` 从「身份与责任」读交付线、性质与契约变更，并带上 Issue 的 milestone、标签与「交付条件」章节的文本。缺失或占位为 `attribute-missing`。重复、取值不在允许值中或组合不合法为 `attribute-invalid`。Issue 读到的 milestone 为 null 时为 `attribute-missing`，条款为 `milestone`。
2. 正文的属性是判断依据。只有合格的属性参与下面各步。
3. binding 为版本1时报告 `binding-v1`。版本2的交付线不在表中为 `attribute-invalid`。版本2的三个属性与正文不同、或里程碑与 Issue 现在的 milestone 不同为 `attribute-binding-drift`。
4. 有 binding 时核对路线。交付线为 `integration`、或性质为 `integration` 或 `baseline` 的卡进入联调轨道。其余卡进入本线的线轨道，线的 `track` 为 null 时进入联调轨道。route 的轨道不同、或目标轨道未在 registry 登记为 `nature-route-mismatch`。交付线为 `integration` 的卡写线内路径时 route 须为 `cross-track`，且 owners 含受影响线的 owner。只写联调轨道路径时 route 须为 `track`。
5. 有 binding 时核对写范围。`tmp` 下的路径与 `shared` 路径不计入。线内的卡写其他线的路径为 `scope-outside-line`，写联调轨道拥有的路径为 `scope-integration-path`。一项写范围覆盖多个归属时，按它下面的全部归属判断，表中没有列出的部分归联调轨道。`contract` 卡只写本线契约成员，`baseline` 卡没有仓库写范围，否则为 `scope-outside-line`。性质为 `integration` 的卡与交付线为 `integration` 的 `design` 卡不检查写范围归属。
6. `conditionCards` 是目标为 Issue 的交付条件及目标卡的属性。线内的卡引用交付线不是本线也不是 `integration` 的卡为 `condition-cross-line`。目标卡未读到或交付线不合格时不判断。`baseline` 卡没有任何交付条件：`readCardAttributes` 带上「交付条件」章节的文本，它不是「无」时为 `condition-cross-line`，条款为 `交付条件`。
7. `line:`、`nature:`、`contract:` 三族标签与正文属性的投影不同为 `label-drift`。契约变更为 `none` 时不应有 `contract:` 标签。

准入观察不提供规则，所以准入不产生属性发现，属性发现不改变 `start` 的拒绝条件。`start` 另有派发字段的拒绝，见[派发命令](#派发命令)的 `dispatchFieldGaps`。`start` 的属性报告归[集成工具规格](../integration/SPEC.md#授权与开工)的 I16。

## 标签同步

`labels.ts` 的 `syncLabels` 只读写一张卡的标签。它用固定 argv 调用 `gh api`：GET 读卡，POST 加标签，DELETE 删标签，不读 Project。卡身份不符或是 PR 时拒绝。目标集合是正文属性的投影，三个属性任一缺失或不合格时拒绝，不写入。写入只涉及 `line:`、`nature:`、`contract:` 三族中当前与目标的差异。写入后再读一次卡，`verified` 表示三族标签等于目标集合。某次写入失败时报告失败的序号，不回滚之前的写入。标签只是投影，正文仍是属性的唯一源。

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

`parseReadSetFile` 只认含 `reads` 字段的 JSON 对象，其他内容交给 `fileScope`。字段只能是 `source` 与 `reads`：`source` 为非空字符串，`reads` 为仓库相对路径数组，可以为空，不合格时拒绝。`assignReadSets` 把读集文件挂到卡上：`source` 是 `#` 加数字时按卡号匹配，否则把两边都按调用方给的基准目录（`scope-cli.ts` 传当前目录）解析成绝对路径后，匹配 binding 文件参数。`source` 不对应任何卡参数，或同一张卡有两份读集文件时拒绝。关闭而不参与求交的卡，其读集文件不参与比较。

读集用独立的 JSON 文件，不扩展 binding：binding 的字段集是严格的，增加字段要改 `parseTaskBinding` 与 `start`。

命令只读。成员清单读运行它的检出的工作树。有写冲突对或读写交叉时退出1，输入不可用时退出2，标准输出总是完整的 JSON 结果或没有输出。

## 里程碑命令

`createMilestone` 先分页读仓库全部里程碑，按标题精确匹配。同名多于一个时拒绝。同名且截止日的日期部分等于请求日期时返回已有里程碑，不写。同名而日期不同时拒绝。否则以 POST 建里程碑，`due_on` 为请求日期的 `12:00:00Z`，再以响应中的 `due_on` 判断 `verified`。标题须为一行且不含 `-->`。日期须为真实存在的 `YYYY-MM-DD`。

`carryMilestone` 在第一次写入前完成全部读取与核对：两个里程碑都存在且不同，原因为一行非空文字，卡号不重复，每张卡的里程碑是 A 或 B。任何一项不满足都不写入。每张卡最多两次写入：卡不在 B 时 PATCH 里程碑，卡上没有同一 A 到 B 的流转评论时 POST 评论。流转评论由 `carryComment` 生成。卡已在 B、本次不移动时（例如补跑上次 PATCH 成功、评论失败的运行），评论写明本卡已在 B、本次运行未移动，不写成 A 到 B 的流转。`isCarryComment` 只看评论的第一行，第一行是 `from` 与 `to` 都相同的标记时才认。写入按命令给出卡的顺序串行执行。某次写入失败时报告序号并停止，不回滚。写入后逐卡再读，`verified` 为读回的里程碑等于 B。命令不读或修改 binding。

`milestone create` 不建 Project 视图。它输出 `MILESTONE_VIEW_MANUAL_STEPS`，即在网页上为新里程碑建 Board 视图的步骤。

## 看板字段写入

字段 ID、选项 ID 与看板设置只登记在[交付配置](../../../../docs/engineering/github-delivery.json)。`parseConfig` 读 `project.fields` 的六个看板字段（`line`、`kind`、`dispatchedAt`、`deliveredAt`、`acceptedAt`、`cycleDays`，缺省为 null），Wave 用已有的 `iteration` 字段，`project.options` 的 `stage`、`line` 与 `kind` 选项表（缺省为空）和 `board` 项（缺省为 null），只核对形状，所以没有这些键的旧配置照常可读。`boardEvent(config, event)` 在一个事件运行时判断语义，并把该事件启用的每个写入解析成带字段 ID 与选项的 `EnabledWrite`。没有 `board` 项、或该事件没有启用写入时返回 null，不判断 `board` 项的其余部分。否则：Project ID 须存在；`timeZone` 须是运行环境认可的 IANA 时区；未知事件拒绝；该事件只能启用表中属于自己的写入，同一写入不能列两次；每个启用的写入须有字段 ID（Status 用 Stage 字段，Wave 用 `iteration` 字段，Cycle days 还须有 Dispatched at 字段）；启用 Status 写入时，目标选项（In review、Integrating、Accepted）须在 `options.stage` 中。选项表按自有键查找，`constructor` 一类原型上的名字不算选项。

`planBoardWrites` 只规划已解析的写入，输入还有写入前读到的条目字段值：本事件的日期字段写 `date`，但 Dispatched at 已有值时不覆盖；Wave 已有值时同样不覆盖；Line 写交付线对应的选项；Kind 写唯一 `kind:` 标签对应的选项；Wave 写起止范围包含 `date` 的迭代，即 `startDate` 不晚于 `date` 且相差少于 `duration` 天，几个迭代都包含 `date` 时取配置顺序中的第一个；Status 写本事件的目标选项；Cycle days 写 `date` 与 Dispatched at 相差的整天数。Dispatched at 或 Wave 已有值、缺少交付线、交付线没有选项、没有唯一 `kind:` 标签、Kind 没有选项、没有包含 `date` 的迭代、Dispatched at 为空、不是合法日期或晚于 `date` 时，该项进入 `skipped` 并写明原因，不猜测取值。

`recordBoardEvent` 先读卡在配置 Project 中唯一的条目（Issue 节点的 `projectItems`，含已归档条目），没有或多于一个时拒绝。事件写 Dispatched at、Cycle days 或 Wave 时，在规划之前读一次条目的字段值。事件写 Wave 时，在规划之前读一次该迭代字段的 `configuration.iterations`，迭代长度不是正整数天时拒绝。每项写入是一次 `updateProjectV2ItemFieldValue`，查询文本固定，Project、条目、字段与值作为 GraphQL 变量传入：日期为 `value[date]`，数字以 `-F value[number]` 按数值传入，单选为 `value[singleSelectOptionId]`，迭代为 `value[iterationId]`。写入串行执行。某次写入失败时抛出 `BoardWriteError`，带序号、写入名与已规划的 `skipped`，不回滚。写完后读回各字段。结果是判别联合：`applied: false` 是只读取与规划的 `dryRun`，没有读回；`applied: true` 带 `readback` 与 `verified`，`verified` 表示每个字段等于写入值。错误消息不含 API 原文。

`recordDispatch` 是 `start` 使用的入口，不抛出。`boardEvent(config, 'dispatched')` 为 null 时返回空，不报告。云端会话、`boardEvent` 拒绝、读写失败、跳过的写入与读回不符各返回报告行；写入失败时，已规划的跳过项也各返回一行。代码为 `board-write-failed`、`board-skipped` 或 `board-unverified`。日期是调用时刻在配置时区中的日期。

## 派发命令

[protocol.ts](protocol.ts) 的 `dispatchFieldGaps(issue)` 是纯函数，返回卡缺少的派发字段：`kind:` 标签数不是一、`line:` 标签数不是一、milestone 为 null。milestone 未读取（undefined）时不判断。`start` 与 `register` 在准入核对之后、写 context 之前调用它，结果非空时以 `refused` 拒绝，条款见[集成工具规格](../integration/SPEC.md#授权与开工)的 I19。

`parseDispatchSpec` 严格读调度者的决定：`issue`、`attempt`、`responsible`、`branch`、`taskBase`、`writeScope`、`route`、`completionTarget`、`basis` 与 `confirmations`，全部必填，其他字段拒绝。`confirmations` 每项只有 `condition` 与 `evidence`，不含摘要。

`taskBaseInputs(root, taskBase)` 从 taskBase 提交读 policy、policy 指向的交付配置与线归属表，两者的仓库须相同；taskBase 中 `tools/dev-flow/src/delivery/binding.ts` 不含版本2区块标记时拒绝。`cardAdmission` 以本卡为授权卡位置调用准入采集，因为采集只读授权卡所在的 Issue，不读评论本身。

`planDispatch` 在任何写入之前判断并生成版本2 binding，`dispatch` 为占位 URL。拒绝的条件依次为：卡未开放；`actor` 不等于 `responsible`；`dispatchFieldGaps` 非空；准入观察对本卡有偏离；正文属性不合格或交付修订不唯一；卡上已有评论的 `omne-integration-authority:v1` 区块派发同一修订与 attempt，且没有 `force`；`confirmations` 引用卡上没有的条件；某个 start 条件没有 `confirmations` 项；拟写的 binding 有任何属性发现。交付修订、属性、里程碑与条件 ID 取自采集到的卡。每个 start 条件的确认摘要是 `conditionDigest(condition)`，与 `start` 核对时用同一函数和同一解析。

`postDispatch` 串行发三个请求：POST 占位评论，PATCH 把它改成 `dispatchComment(prose, decision)`，GET 读回。决定中 binding 的 `dispatch` 是占位评论的 `html_url`。PATCH 失败时错误给出占位评论 URL，不重试、不删除。PATCH 成功后、GET 之前调用 `onPosted`，交出派发 URL 与 binding；GET 失败时错误给出派发评论 URL。`verified` 表示读回的评论正文等于写入的正文。

`bindBody(body, binding, worktree?)` 是纯函数。正文须恰有一个「### 分支、基线与task context」小节，小节到下一个二级或三级标题为止。整节换成一行派发说明与版本2 binding 区块，说明的 revision、attempt、taskBase 取自 binding。只在「### 认领与派发」小节内，「- 派发情况：」行以及给出 `worktree` 时的「- 工作树：」行被改写。binding 的 `dispatch` 是占位 URL 时拒绝。结果的唯一 binding 须按 `readTaskBinding` 读回与输入相同，否则拒绝。`bindCard` 读卡，核对 binding 的仓库与 Issue 节点，写入新正文后再读一次。结果是判别联合：`applied: false` 是只读不写的 `dryRun`；`applied: true` 带 `verified`，表示读回的 binding 与输入相同。读卡由 [github-read.ts](github-read.ts) 的 `fetchIssueCard` 完成，求交与工作树命令共用它。

## 协作记录边界

[collaboration-records.ts](collaboration-records.ts) 拥有申请、处置、delta、消费记录、首次 assignment 和 ReleaseRecord 的公开类型及 marker。所有记录使用 schemaVersion 1。首行 marker 区分用途，唯一的 `json omne-collaboration:v1` 围栏保存机器内容。普通评论不进入机器记录集合，marker 本身不授予信任。

[collaboration-comments.ts](collaboration-comments.ts) 编解码评论。[collaboration-json.ts](collaboration-json.ts) 在形状校验前拒绝重复 JSON 键，包括转义后相同的键。单份机器 JSON 上限为 1 MiB，嵌套深度上限为 128。未知版本、未知字段、缺失必需值、无效 UUID、SHA 或 UTC 时间均失败。完整 Git SHA 接受 40 或 64 位十六进制并转为小写。内容摘要使用实际评论 UTF-8 字节的 SHA-256，不先去除空白。

[collaboration-parse.ts](collaboration-parse.ts) 区分形状有效与业务接受。ready 申请必须有 PR、完整 head、验证证据和已停写声明，不能带未完成项。blocked/failed 可没有 PR，但必须列原因和剩余工作。创建 requestId 后，重试保持输入不变。申请回执的 inputDigest 必须等于规范编码后的申请输入摘要。

普通 delta 的 purpose 为 release，active/idle 只能指向同仓库、同里程碑的直接下一波和不同的实际 reduce。terminal 必须带授权依据，不从后继缺失推断。硬阻塞重派的 delta 使用 redispatch，并绑定新的 requestId。它必须保持同一线、同一波及当前 reduce。处置中的 redispatch 还引用该 delta、停写证据、新输入和写权释放证据。记录解析不会自行确认这些证据或执行重派。

[collaboration-read.ts](collaboration-read.ts) 按每页 100 条读取全部评论，读前和读后核对 Issue 身份、正文、更新时间及评论总数。重复页、数量不足或读取期间变化均失败，不返回 empty。这个检查不提供 GitHub 跨请求事务保证。写入、放行或接受前，调用方仍须重新核对所引用的精确记录、摘要和权限。

`readReferencedComment` 按仓库、Issue、评论 ID 和 SHA-256 读取精确引用。返回另一评论、另一卡片或正文摘要变化均失败，空白编辑也不能通过旧摘要。删除和权限错误向调用方传播，不用当前状态替代证据。返回作者供后续权限检查，摘要匹配本身不授予信任。

[collaboration-sequence.ts](collaboration-sequence.ts) 对一个完整记录流排序。revision 从 1 开始，每次增加 1，并引用上一记录 ID。同内容重试可去重，下一项可引用任一相同重试的 ID。同 revision 异文、同 operationId 异文、缺号、错误前项和混入其他流均失败。事件游标不表示业务记录已消费。

[collaboration-write.ts](collaboration-write.ts) 的 `writeSequencedRecord` 发布 state、delta 或 consumption。调用方固定 operationId、revision、前项和 recordedAt，并提供每个波段的已采用派发输入。工具通过生产授权读取器核对完整记录流，检查当前账号及尚未结束的写者时段，再判断新记录是否恰为下一序号。发布时在授权读取完成后采样本机时间；已结束的历史授权即使仍覆盖偏慢的本机时间也不能写入新记录。历史时段仅用于已发布记录的核对与恢复。已有相同操作只返回精确评论引用，不再次写入；同操作异文或未经授权的同文记录均拒绝。

publish 模式在 POST 前调用必需的同步 checkpoint，交出仓库、卡号、operationId、完整正文和摘要。checkpoint 必须持久保存该操作已经进入尝试状态；失败则不 POST。正式命令须把这个端口接到自己的操作日志，内存回调不满足持久化要求。POST 只执行一次，返回内容不作为成功依据。工具随后完整读取记录流，并再次核对序号和权限。响应丢失但记录已经写入时可通过读回确认；读回不可用或记录仍未出现时返回 unknown。结构、权限或并发冲突保留明确错误，调用方仍须依据已经保存的操作意图恢复。

recover 模式只读，返回已核对的精确引用或 unknown。完整读取后没有找到记录，也不能证明先前 POST 已被服务端拒绝，因此不会重发。崩溃、超时或未知结果后必须使用同一持久意图进入 recover，不得当作新 publish。跨机器接续时移交此日志。该接口不提供 GitHub 比较交换或分布式锁；并发同序号写入在读回时成为冲突。申请 workflow 登记、成果接受、最终 ReleaseRecord 发布和卡片关闭由各自业务入口负责，不能由此接口的 confirmed 推导。

[collaboration-trust.ts](collaboration-trust.ts) 根据调用方已从有效派发决定读回的权限快照校验记录。快照分开保存本波参与线、reduce epoch 历史、线负责人授权时段和采用的 workflow。配置对象存在不代表其权限已验证。重叠 reduce 写者、过期写者、撤销后的编辑、错误卡片或上下文均拒绝。ReleaseRecord 必须包含所有参与线，包括 idle。

申请信任检查同时核对 Actions bot 作者、采用的 workflow 路径/ref/提交，以及精确 runId/runAttempt、原始 actor、重跑 actor、事件和 run-name。run-name 绑定 requestId、原始 head 或 none、规范输入摘要。精确 attempt 未完成返回 pending，失败不形成有效登记。权限判断使用 GitHub 评论及运行时间，不能只相信正文中的 recordedAt。端点与字段依据 [GitHub workflow run API](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt)；真实 workflow 部署和回执写入另行验证。

[collaboration-requests.ts](collaboration-requests.ts) 只接收已通过权限校验的记录。业务身份为仓库、里程碑、波、线父卡和 requestId；同一身份的规范输入必须相同。Action 重跑或新运行产生的相同申请合并为一项，保留每个评论和运行定位。不同输入复用同一身份时失败。新 requestId 是新申请，不能被传输去重吞掉。待完成和失败的 workflow 回执不进入有效登记集合，由调用方保留诊断并恢复读取。

### 派发授权读回

[collaboration-authority.ts](collaboration-authority.ts) 的 `readCollaborationAuthority` 从实际 reduce 卡的唯一 binding 定位正式派发，复用现有 `readAuthority` 验证资格、精确评论与撤销情况，并要求派发 task 等于当前 binding。完整评论快照同时保存并核对 milestone。读取期间正文、状态、milestone、评论或更新时间变化均失败，不返回部分权限。

正式派发评论中的唯一 `json omne-collaboration-scope:v1` 区块由 [collaboration-scope.ts](collaboration-scope.ts) 解析。它包含 context、epoch、全体参与线与负责人、采用的申请 workflow、前一派发与停写评论的精确引用，以及可空的接受责任声明。未知版本、重复字段或参与线、缺失字段均拒绝。该区块附在既有派发决定内，不从本地 JSON 或任意 marker 取得权限。

每个 epoch 的开始取正式派发评论的 GitHub 更新时间。换 epoch 必须引用前一派发及 `json omne-collaboration-stop:v1` 评论，停写声明绑定旧 context、epoch、写者和非空证据。停止声明须由旧或新执行负责人写入，且不可编辑；结束时间取其 GitHub 创建时间，必须晚于旧派发、不得晚于新派发。它保存责任人的停写声明，不宣称工具已终止远端进程。

历史派发逐条读回摘要，并独立复用派发资格检查，不因当前派发引用就自动可信。循环、重复 epoch、缺失前项、撤销争议、未链接的另一有效派发、时段重叠或相同计划修订的参与线/workflow 冲突均失败。无资格的普通 scope marker 不成为另一有效写者。`recordAuthorityFor` 只返回读回链已覆盖的计划修订；较早计划的 epoch 不能提前授权后来修订。

本地路径按现有 `readAuthority` 查询当前 reviewer 资格，不声称证明该用户在过去某时刻的资格。云端或需要既有资格事实的路径，只接收已经由 `fetchDeliveryFacts` 等可信读取链采用的、精确绑定该评论的 facts；CLI 不接受用户提供的 JSON 作为资格证明。当前路径采用 facts 而缺历史 URL 的对应 facts 时，明确失败，不回退到环境或 GraphQL 查询。

返回的 `VerifiedCollaborationAuthority` 只证明上述派发及记录权限。其 `scope.acceptanceResponsibility` 仍是声明，工具只核对它指向正文责任字段的摘要。它不授予接受权，也不证明 ReleaseRecord 已接受；接受授权来源与结果决定须由独立接受读取边界验证。

验证入口为 [授权读取测试](../../tests/delivery-collaboration-authority.spec.ts)，使用真实派发校验函数及 REST 替身。覆盖历史资格、云端 facts、停写编辑、计划提前授权、链外写者、卡片变化和撤销；真实 GitHub 采用另行验证。

验证资源为 [schema 测试](../../tests/delivery-collaboration-schema.spec.ts)、[分页与序号测试](../../tests/delivery-collaboration-read.spec.ts)和[信任测试](../../tests/delivery-collaboration-trust.spec.ts)。这些边界函数不自动接受成果、派发任务、创建 PR 或关闭 Issue。

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

自建频道停止时只删除持久 owned hook，删除前验证精确身份。借用实例只退订，不调用 hook 写接口。创建响应丢失、日志失败或归属不明保存 recovery-needed。clean 只允许处理本机已停止且归属已证实的实例；全仓扫删入口退出。

legacy 的 HTTP 接收器只绑定 127.0.0.1、只接受 POST。给出 secret 时校验 X-Hub-Signature-256；签名不符返回 401，非法投递返回 400，落盘完成返回 204，写失败返回 500。停止时结束自己的 forward 子进程并释放本地写者。gh forward 没有可证明所有权的创建回执，因此不得用前后列表差分猜 hook；停止保留 recovery-needed 并退出 2，422 另给 legacy-hook-conflict。SIGKILL 无法执行清理，后续按持久身份恢复。

check 自检分别验证进程、连接、精确 hook 状态、一条真实事件落盘和等待对账立即返回。借用模式由拥有者提供 hook 证据，消费者仍验证端到端。命令退出、输出可取和 agent 续接是三项不同验证。

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

验证资源：[delivery-events.spec.ts](../../tests/delivery-events.spec.ts)覆盖归一、谓词、等待、对账及 legacy 生命周期。[delivery-events-cli.spec.ts](../../tests/delivery-events-cli.spec.ts)覆盖实际子进程 CLI、退出码、清理拒绝与 SIGHUP 收尾。[delivery-events-trust.spec.ts](../../tests/delivery-events-trust.spec.ts)验证频道提示不能直接放行、重连对账与读回期间新提示保留。[delivery-events-receiver-channel.spec.ts](../../tests/delivery-events-receiver-channel.spec.ts)验证 SSE、频道身份、hook 恢复与本地健康。网络 seam 和本地服务器不能替代真实双机、GitHub 投递及宿主续接验收。
