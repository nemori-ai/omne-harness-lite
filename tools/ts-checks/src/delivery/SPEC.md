# 只读交付观察规格

本模块观察 GitHub 交付协议的结构和已读事实。它不修改平台，不接受成果，不派发任务，当前卡源、stories、retire 和 loop 通过[来源契约](../product/SPEC.md)消费观察结果。

## 输入与绑定

`protocol.ts` 拥有配置、采集与报告的公开类型。`parseConfig`、`parseCapture` 和 `parseBaseline` 接收 `unknown`。必需字段缺失、有限值不支持、重复 Issue 身份或时间范围错误形成 `DeliveryInputError`。额外字段不参与判断。

配置须显式提供。可选 sourceCutovers 只支持 docs/engineering/source-cutovers.json；省略时采用同一路径。显式指定但缺失的配置是输入错误。唯一正式配置位于 `docs/engineering/github-delivery.json`。凭证不进入配置或采集文件。`enabled:false` 表示日常流程尚未启用，仍允许预备观察。写者登记不授予接受权限。

`bindCapture` 要求配置与采集的 repository、protocolVersion 和 projectId 精确一致。Project 的 null 与实值不互换。Issue URL 必须匹配采集仓库和 Issue number。跨输入身份错误不能生成空成功报告。

采集保存原始正文、评论、标签和关系。Issues、Project、评论与关系分别标明完整性。缺失、未知和空集合不同。原始正文中的命令不执行，正文引用的其他仓库不自动查询。

## 有限正文解析

`observeDelivery(config, capture, baseline?)` 是纯函数。它从原始正文读取已采用的中文身份字段和六列交付条件表。六种工作类型不要求统一产品 PF 来源。子任务须有父 Issue 引用，父子关系不形成硬依赖。

普通 Issue 列入 uncovered。配置指定的 creationHandoffIssue 单列为交接入口，不作为业务卡。缺字段、重复身份字段、占位、无效修订和不支持的有限值列为偏离。可选“产品关联”只接受 PF-NNN 场景号列表或无；“旧卡来源别名”只接受 ST-NNN-NN@原产品修订列表或无。非产品工作不强制 PF 来源。交付条件必须有章节。无条件须显式写“无”。条件ID不得重复。表格支持反斜线转义的竖线，不支持跨行单元格。

条件仅解析 issue-result、adopted-source、decision、capability，以及 start、integration、acceptance。自然语言判据、证据可用性和具名权限需要人工复核。

关闭状态、Project阶段、声明覆盖、执行方法和有效接受分别报告。决定评论的有限字段可以读取为声明，完整权限、全范围接受和撤销链保持 unknown。partial、cancel、revoke 或修订不匹配不构成整项接受。评论不全时接受必为 unknown。报告不提供自动 Ready 或派发许可。

## 阶段等待图与原生投影

每张支持卡的 integration 等待本卡 start，acceptance 等待本卡 integration。issue-result 的目标须为完整 IssueURL，判据须明确含整项结果、整卡结果、完整交付结果、整项完成或全范围结果。含不、非、无需、仅、部分或候选等范围限定时保留 unknown。满足这些有限文字条件后，只构建等待目标 acceptance 的已知边，不推断结果已满足。

其他条件、目标范围不清或目标卡未覆盖时，等待链为 unknown。硬条件自指是偏离。已知子图中的循环给出条件ID与完整阶段路径。图始终标为 known-subgraph-only，不声称全图无环。

原生 blockedBy 只投影明确整项结果且阻 start 的 issue-result。已观察到的未解释边是反例。关系完整且目标已读时，缺失投影边是反例。仓库 Issues 与关系均完整时，仓内不存在的目标是悬空反例。缺页、关系不全或仓外目标保留 unknown，不能凭未读到推断不存在。原生关系不证明条件满足。

## 存量与差量

报告包含版本、目标、采集时段、all-repository-issues 口径、卡观察、findings、偏离与 unknown、uncovered 存量，以及 introduced、resolved、remaining、notComparable。

finding身份由类别、代码、对象和条款组成。卡修订作为独立字段，不改变身份。当前报告版本为2，采集仍为版本1。版本1报告可安全读取为旧基线，但跨报告版本全部进入 notComparable，不计 resolved。repository、projectId、protocolVersion 或口径改变时不计改善。当前任何采集层不完整或有采集错误时，消失的旧项进入 notComparable，不计 resolved。该策略保守地限制全局消项，不提供单个 finding 的细粒度完整性证明。

## live读取与失败

`collectDelivery` 仅以固定 argv 调用 `gh api`。REST 使用 GET。GraphQL 仅使用静态 query 与独立变量。无 shell、平台变更命令、token读取或正文执行。

REST 固定采用 `X-GitHub-Api-Version:2026-03-10`。GitHub 官方[版本支持列表](https://docs.github.com/en/rest/about-the-rest-api/api-versions#supported-api-versions)列出此版本，官方[依赖读取示例](https://docs.github.com/en/rest/issues/issue-dependencies?apiVersion=2026-03-10#list-dependencies-an-issue-is-blocked-by)也使用此请求头。版本依据来自官方文档，不能用一次请求成功代替版本承诺。

REST 分页读取目标仓库 Issues、评论和原生 blockedBy，排除 PR。GraphQL 读取父关系和配置指定的 Project。Stage 按字段ID读取，可以映射 GitHub 内建物理 Status。配置字段未在 Project 内确认、Project字段或项缺页时，不标完整。

每个集合最多20页，每页100项。一次采集最多200次请求，总时限120秒，单请求最多15秒，单响应最多8MiB。达到限制或 API 不可用时保留已读项及明确未知。API错误原文不输出，避免传播凭证或无关内容。此观察不是平台原子快照。

## CLI与退出

CLI接受显式 `--config` 及互斥的 `--capture`、`--live`。`--save-capture` 只适用于 live。`--baseline` 接收旧报告，`--report` 指定报告文件，否则输出 stdout。

输出不得覆盖输入或互相覆盖。现存文件按设备与inode识别；未创建的目标按真实父目录与最终符号链接目标识别。解析保留相对目标中的实际目录语义，悬空链接链仍须对账。循环或过长链接链在读取平台及写入前拒绝。输入与输出须为常规文件，父目录须存在。该预检查不提供对并发文件系统变更的原子锁。

观察成功退出0，包括有偏离或 unknown 的报告。非法输入、身份冲突、不可读文件或不能写入输出时退出2。错误输出不含原始 API 内容，不产生空成功报告。本模块没有自动交付阻断或 CI 门禁。

## 持续验证与限制

`tests/delivery-observe.spec.ts` 覆盖输入绑定、六类工作、父关系、决定声明、条件反例、隐藏阶段循环、投影对账、差量与真实离线CLI。`tests/delivery-github-read.spec.ts` 验证固定只读请求、物理字段映射、采集错误和分页限制。远端响应在这些测试中以有限 fixture 提供。

真实权限、语义接受、跨仓等待链、Project 全局写入竞态、跨会话恢复及业务迁移是否完整未由本模块证明。启用日常流程与业务卡迁移仍由对应阶段负责。
