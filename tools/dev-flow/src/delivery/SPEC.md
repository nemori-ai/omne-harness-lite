# 只读交付观察规格

本模块观察 GitHub 交付协议的结构和已读事实。它不修改平台，不接受成果，不派发任务，长期产品与持续场景由[产品契约](../../../repo-toolchain/src/product/SPEC.md)独立发现。

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

finding身份由类别、代码、对象和条款组成。卡修订作为独立字段，不改变身份。配置为`github-delivery-config@2`、协议2；采集为`github-delivery-capture@1`、协议2；报告为`github-delivery-report@4`、协议2。旧配置、协议1采集及版本1/2/3报告均为输入错误，退出2，不转换或作为历史基线适配。repository、projectId、protocolVersion 或口径改变时不计改善。当前任何采集层不完整或有采集错误时，消失的旧项进入 notComparable，不计 resolved。该策略保守地限制全局消项，不提供单个 finding 的细粒度完整性证明。

## live读取与失败

`collectDelivery` 仅以固定 argv 调用 `gh api`。REST 使用 GET。GraphQL 仅使用静态 query 与独立变量。无 shell、平台变更命令、token读取或正文执行。

REST 固定采用 `X-GitHub-Api-Version:2026-03-10`。GitHub 官方[版本支持列表](https://docs.github.com/en/rest/about-the-rest-api/api-versions#supported-api-versions)列出此版本，官方[依赖读取示例](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2026-03-10#list-dependencies-an-issue-is-blocked-by)也使用此请求头。版本依据来自官方文档，不能用一次请求成功代替版本承诺。

REST 分页读取目标仓库 Issues、评论和原生 blockedBy，排除 PR。GraphQL 读取父关系和配置指定的 Project。Stage 按字段ID读取，可以映射 GitHub 内建物理 Status。配置字段未在 Project 内确认、Project字段或项缺页时，不标完整。

每个集合最多20页，每页100项。一次采集最多200次请求，总时限120秒，单请求最多15秒，单响应最多8MiB。达到限制或 API 不可用时保留已读项及明确未知。API错误原文不输出，避免传播凭证或无关内容。此观察不是平台原子快照。

## CLI与退出

CLI接受显式 `--config` 及互斥的 `--capture`、`--live`。`--save-capture` 只适用于 live。`--baseline`接收同版本报告，`--report` 指定报告文件，否则输出 stdout。

输出不得覆盖输入或互相覆盖。现存文件按设备与inode识别；未创建的目标按真实父目录与最终符号链接目标识别。解析保留相对目标中的实际目录语义，悬空链接链仍须对账。循环或过长链接链在读取平台及写入前拒绝。输入与输出须为常规文件，父目录须存在。该预检查不提供对并发文件系统变更的原子锁。

观察成功退出0，包括有偏离或 unknown 的报告。非法输入、身份冲突、不可读文件或不能写入输出时退出2。错误输出不含原始 API 内容，不产生空成功报告。本模块没有自动交付阻断或 CI 门禁。

## 持续验证与限制

`tests/delivery-observe.spec.ts` 覆盖输入绑定、六类工作、新旧两层级布局、实际模板填卡、缺失与重复章节、布局混用、父关系、决定声明、条件反例、隐藏阶段循环、投影对账、差量与真实离线CLI。`tests/delivery-github-read.spec.ts` 验证固定只读请求、物理字段映射、采集错误和分页限制。远端响应在这些测试中以有限 fixture 提供。

真实权限、语义接受、跨仓等待链、Project 全局写入竞态、跨会话恢复及业务迁移是否完整未由本模块证明。正式配置保持`enabled:false`。平台启用、默认分支模板发布与实际宿主执行仍须独立验证，每项普通任务独立维护本次身份、范围和结果。

## 集成绑定与目标条件

当前报告版本4包含可选integrationBinding，TaskBinding版本1保持。Issue 唯一 binding 区块绑定当前交付修订及 attempt，字段归 [binding.ts](binding.ts)。缺区块仍可作原交付观察；集成 start/publish 必须有合法绑定。重复、身份或修订不符是偏离，不能据观察报告授权。

条件使用原表，可增加第七列“适用目标”。integration 条件支持 all、track、main、stable 及相应完整 branch ref；六列表映射 all。start/acceptance 只允许 all。未登记精确轨道由采用 policy 拒绝；未满足的目标条件只阻对应运输。最终“main/stable 已包含结果”放 acceptance，不能作为其自身运输前置。旧报告版本拒绝，不转换。已知阶段等待图仍保守，不声明目标细化的完整无环。

## 任务准入采集

`admission.ts` 拥有 `AdmissionCapture`。它供 integration 的 `start` 与 `register` 使用，不是全库 `DeliveryCapture`。离线报告、baseline、delta 和发布检查不接受此输入。

采集从目标任务深度 0 开始，读取同仓库的精确 Issue 条件目标、原生 blockedBy、原生父卡和正文父卡，并递归读取这些目标。普通上下文链接不形成依赖。跨仓库 Issue 条件目标或关系、缺失目标、PR 替代和身份不符均拒绝。已访问的回边不重复读取，也不另加循环拒绝规则。

每次最多读取 32 个不同 Issue，包括独立授权卡。闭包最多 8 个边层级。每个分页集合最多 20 页，每次采集最多 200 个请求、120 秒，每个请求最多 15 秒。超过任一界限或必需页面失败时，不返回部分准入结果。完整闭包仍须在请求和时间预算内完成。

闭包内 Issue 的正文、评论和原生关系必须完整。条件发现复用观察器的解析结果。错误、重复条件行及重复条件章节不能成为完整闭包。缺少起始竖线的行，如果列数与六／七列表头同宽，或第二列为支持的条件类型，则拒绝。末尾竖线可以省略，不改变列数判定。普通单管道说明可以保留。没有这些结构或有限类型信号的自然语言不据此发现依赖。正式条件行仍须满足既有表格契约。独立授权卡只补读身份、正文和完整评论，关系标为未采集，不展开其无关依赖。授权卡同时属于任务闭包时，按闭包成员完整读取。

Project 读取只查询配置 Project 的字段、目标 Issue 的 memberships 和匹配 item 的字段值，并完成各自分页。工具不枚举全 Project items。配置 Stage 字段必须存在，任务必须有唯一匹配 membership。字段遗漏、身份不符或分页未知均拒绝。完整读取后没有 Stage 值时，合法结果为 `null`。

准入观察仅返回目标卡及其 findings。内部投影使用 `issues:partial`、`project:unknown`，保留配置绑定、目标偏离和原生关系对账。该投影不接受 baseline，也不输出全库报告。全库重复创建标识及循环覆盖仍归 `observeDelivery` 的全仓观察。
