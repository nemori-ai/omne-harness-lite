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

1. `pnpm -s run acceptance:lock`。已有 context 时不加 base；没有 context 时加 `--base origin/integration/legacy-refactor`。
2. `node scripts/with-test-slot.mjs pnpm turbo run build --affected`。
3. `pnpm run check:declarations`。
4. `pnpm run contract:api --check`。
5. 依次执行 `pnpm run check:lines`、`check:docs`、`check:design`、`lint:deps`、`lint:rules`、`lint:oxlint`。
6. `./scripts/format.sh check`。

共 11 个步骤，始终在指定工作树执行。每步单独保存 stdout/stderr 和退出结果。失败立即停止，命令返回该步骤的退出码，输出已执行步骤、日志路径和失败日志末 20 行。找不到命令返回 127，命令不可执行返回 126，信号退出映射为 128 加信号值。只有全部步骤成功才返回 passed/0。输入或日志创建错误退出 2。该结果是检查结果，不授予交付接受。

验证由 [delivery-pre-admission.spec.ts](../../tests/delivery-pre-admission.spec.ts) 覆盖完整顺序、绑定分支、失败传播、日志隔离和真实子进程退出码。

## 协作工具安装与固定来源

`collaboration-installation.ts` 拥有安装描述符及本地采用记录。描述符支持版本 1、2 和 3，共同必需字段如下。未知字段和版本拒绝。

| 字段               | 含义与约束                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `repository`       | 唯一的目标 `owner/name`                                                                                                                       |
| `toolCommit`       | 完整 Git SHA。运行工具的独立检出须固定在此提交，且工作树干净                                                                                  |
| `policySource`     | `commit/path/blob/digest`。路径固定为 `docs/engineering/integration-policy.json`，提交与 blob 为完整 SHA，摘要为原始 UTF-8 文件字节的 SHA-256 |
| `acceptanceSource` | 同样的四项定位。路径固定为 `docs/engineering/collaboration-acceptance-sources.json`                                                           |
| `basis`            | 非空的既有 `Evidence` 数组，记录本次安装采用的依据                                                                                            |
| `facts`            | `{kind:"direct"}` 或 `{kind:"published",workflow,bot}`。两种模式不能混用                                                                      |

版本 1 的 published 模式固定 workflow 的 `id/path/ref/head` 及 Bot 的 `login/nodeId`。path 为 `.github/workflows/delivery-facts.yml`，ref 为 `github-gate`，head 为完整 SHA。Project 从 policy 提交中的 delivery config 派生，不由普通命令传入。config 必须启用，仓库、Project 与单写者配置必须有效。

版本 2 的 published 模式还必须提供 `historicalWorkflows` 数组，可为空。每项使用同样的 `id/path/ref/head` 约束。当前 workflow 与历史项不得重复，历史项之间也不得重复。全部项共用固定仓库、Bot 和 Project。历史项只授予事实读取资格，不授予向旧 workflow 派发的能力。历史事实可以早于安装描述符机制，不要求为其编造旧安装摘要。版本 1 不接受这个字段，也不会自动采用历史版本。

版本 3 保留版本 2 的 facts 语义，并增加必填 `gateWorkflow`。其中 path 固定为 `.github/workflows/gate-publish.yml`，ref 固定为 `github-gate`，head 是已采用 workflow 的完整 SHA。reduce 操作入口要求版本 3；版本 1、2 不能通过普通输入补充这个授权来源。旧安装仍可用于其已支持的读取和恢复。普通安装不自动取得 facts 生产权，既有激活和交接协议同样约束版本 3。

`FactsReadDeployment` 与单个生产 `FactsDeployment` 分开。读取器在一次完整评论快照内逐项匹配唯一采用的 workflow，再对合并后的事实检查负面资格、矛盾、重复、编辑和精确 attempt。同一 run 的当前读取与 attempt 1 必须匹配同一个精确 workflow 身份。未知来源不能忽略，也不能变成 facts 缺失。全部读取保持 GET-only。版本 1 和 2 均须显式激活生产者，不能借新空目录绕过旧未决操作。

`collaboration-install-cli.ts` 是显式操作员采用边界。它接收描述符文件及已核对的 SHA-256，校验后在工具检出的私有 Git 目录原子创建 `omne-collaboration-installation.json`。文件保存原始描述符字节和摘要。临时文件先 fsync，再用不可覆盖的 hard link 发布并 fsync 目录。相同采用可重复；不同采用不能覆盖。未完成或冲突的写入不能返回成功。已有记录损坏、工具提交变化或工作树不干净均拒绝。

本地安装命令记录操作员已经作出的采用，不验证或生成新的外部人类授权。`basis` 的存在不证明依据有效。操作员须按原有具名权限采用配置。接受来源仍须通过后续逐卡责任、账号、里程碑及撤销校验，安装本身不接受成果。拥有本机文件写权限的攻击者、修改过的执行器和依赖供应链不在此安装记录的防篡改保证内。

`collaboration-bootstrap.ts` 从执行模块所在的源工具检出寻找唯一安装记录，与调用者 cwd 无关。当前只支持干净 Git 源检出的 Node 源执行；`dist` 入口拒绝，不能以已生成目录冒充固定源提交。已有 pre-admission 和 release-run 构建入口不受此限制影响。普通 request、Action、line、watch 命令不接受安装路径、policy 路径、来源提交或接受者选项。

bootstrap 通过 GET-only REST 读取固定提交的 policy、delivery config 和 acceptance source。来源 blob 和原文摘要必须一致。加载前后均核对安装与工具状态。加载结果为同一套 request、line 和 watch 端口；published 模式惰性读取精确的当前、历史和任务派发事实，缺失时不回退到 direct。watch 仅持有该安装快照，后续实际卡仍按现有读回协议动态发现。安装更新须在安全操作边界切换到新检出，不能改写运行中会话的安装记录。

源码入口由仓库根及包内的 `collaboration:install`、`integration:request`、`line`、`reduce:watch` scripts 暴露。安装、来源和装配验证归[安装测试](../../tests/delivery-collaboration-installation.spec.ts)。此测试使用真实临时 Git 和文件系统，远端内容为 REST 替身；不证明真实采用或生产部署。

申请 Action 的部署次序为受审工具与来源提交、实际 workflow 提交、环境中的安装描述符。默认分支须先有同名的手动触发入口；实际登记仅在 `github-gate` 执行。`delivery` environment 的描述符原始字节及 SHA-256 在运行开始时各读取一次；检出前核对摘要、仓库、工具完整 SHA、published 模式及采用的 workflow head 等于 `GITHUB_SHA`。后续检出、只读安装与登记使用同一快照。描述符与摘要缺失或冲突时拒绝；环境采用不替代请求的具名授权和证据校验。

## 生产者接管与转移

`collaboration-producer-state.ts` 拥有私有 Git 目录内的生产者状态。`collaboration:install` 默认只采用读取配置。`--initial-producer` 与 `--producer-from OLD_TOOL_ROOT` 互斥。前者明确声明首次接管，要求 journal 没有旧 slot；后者要求旧写者及其启动器已停止，旧固定检出在本机可访问。此命令仅写本地文件，不调用远端写 API。

`omne-facts-adoption.json` 是不可覆盖的采用预留，固定模式、安装证明、前驱和导入清单。`omne-facts-producer.json` 是完成后的激活记录，必须与预留逐字节相同。`omne-facts-producer-retired.json` 将旧生产者绑定到唯一目标 Git 目录、目标安装与转移摘要。普通生产入口只使用与当前安装匹配、未退役且导入清单完整的激活记录。

转移保留全部 slot、intent 和 receipt 原字节。文件类型、命名、JSON 及每个 intent 的原安装和 deployment 均需校验，不能跳过坏记录。前驱描述符的字节和摘要进入新激活记录。bootstrap 从其固定 policy/config 重建原 deployment，要求相同仓库、Project 和 Bot，并独立核对当前描述符已经允许读取该 workflow。导入描述符不能扩大读取信任。

转移先保存目标预留，再复制并 fsync 全部文件和目录，核对完整源清单及采用记录未变，然后持久记录源退役，最后写目标激活。中断可重复同一转移；已有文件须完全一致，冲突目标拒绝。激活后的重试检查原始导入字节并保留后来追加的 generation，不用旧快照覆盖新 journal。没有激活的部分目标不能 POST。退役检查还在准备入口、journal 修改及 POST 前执行。

这一协议要求物理停止旧写者，不是分布式锁。旧二进制不认识退役记录时仍可能写入，工具不会声称已终止它。不得通过清空 journal、删除退役记录或重启旧生产者恢复。保留 request 回执和 line/wait journal。旧工具回退演练仅限首个新 generation 前的原 wait/request 读取与恢复，源退役和目标激活保持不变，不包含旧 facts 生产者重启。

验证资源为[存储测试](../../tests/delivery-producer-state.spec.ts)和[安装装配测试](../../tests/delivery-collaboration-installation.spec.ts)。前者覆盖真实进程并发、进程终止、完整复制、幂等重试及退役；后者经 CLI 安装和 bootstrap 恢复实际生成的 intent。远端响应使用替身，真实断电与跨机排他不在这些测试的证明范围。

[有限行为模型](../../verification/producer-continuity/README.md)检查两个目标的交接及两个调用者的两代 intent。正向配置核对唯一接管、激活前耐久、增长保留、原 binding 和禁止重复 POST；六个负控须命中各自命名不变量。模型只模拟进程崩溃，不证明断电、legacy 写者撤销、跨机互斥或实现精化。模型检查与上述实现测试分别提供证据。

## 持久 facts 准备

`facts:prepare` 与 `facts-preparation-cli.ts` 提供 reduce 的显式生产入口。普通参数只有 repository、精确 dispatch URL 和 `--retry-failed`。bootstrap 固定 published 安装、workflow、Bot、Project 和私有 Git 目录中的 journal。direct 安装拒绝此生产命令。line/watch 的端口不取得生产能力。

每个调用只观察一次，不等待 Actions 完成。网络观察预算为 30 秒、最多 128 次请求，单次请求最多 15 秒。预算耗尽保留 unknown。结果为 ready、pending、failed 或 unknown，CLI 退出码分别为 0、3、2、2。ready 仍须由完整只读 facts 读取器认证，不能仅凭运行 success。

派发 URL 的 SHA-256 前 128 位经固定 version-8 和 variant 位编码成 journal UUID。键不含调用者 operation ID、安装摘要或派发修订。完整 URL、派发作者账号、正文摘要、更新时间、安装摘要及部署身份保存在每个 intent 中，冲突时拒绝。相同 URL 的编辑或安装变更不能绕过旧操作。

恢复前枚举完整 slot，要求 intent 代号从 1 连续、无孤立 receipt、非法文件或重复 nonce。每代按原始安装摘要和 deployment 校验，观察旧运行及复查失败前驱也使用原部署。其他 ready facts 不能掩盖未决 generation；明确旧失败才可按重试条件创建当前 workflow 的后继。

每代保存独占创建的 `intent-N.json`。只有创建者在文件及目录 fsync 全部成功后可以 POST。其他进程即使读到完整 JSON 也只能观察，不能接管 POST 权。部分文件、落盘错误、进程终止和响应丢失均不允许重发。可用的精确响应写入 `run-N.json`；没有回执时按完整运行标题及固定 workflow 身份恢复。零匹配或不完整分页保持 unknown，多匹配拒绝，禁止按最新运行选择。

工作流标题为 `delivery-facts:<nonce>:<issue>:<authority URL>`，预期标题超过 255 个字符时拒绝派发。恢复核对仓库、head repository、workflow ID/path、ref/head、event、完整标题、当前 attempt 1 和 attempts/1。两个端点的状态和结论须一致，但 `created_at` 是各端点的元数据，可以不同。每个端点分别解析并再次读回，运行身份、状态、结论或创建时间在同一端点发生变化时拒绝。返回及持久前代证据中的 `createdAt` 取当前 run 端点。该标题只证明操作关联，不授予派发资格。

只有公共读取器经完整评论和派发身份读回得到的类型化缺失，才允许初次生产。已存在的有效 facts 可以直接消费。有持久 intent 时，ready 必须包含该代 nonce/run 的认证 observation。负面、冲突、编辑、错误身份和未完成证据不能被解释为缺失。

明确失败的精确运行仍返回 failed，默认不重试。`--retry-failed` 要求 fresh attempt 1 的终止失败及完整 facts 缺失，随后把前代运行证据与新 nonce 保存到唯一后继 intent。并发重试争用同一个后继文件，只允许其持久创建者 POST。它不要求重新发布人的授权。未知派发、rerun、成功但 facts 不可见、资格拒绝及未经采用的安装变化不能创建后继代。

运行结论只接受 `success`、`failure`、`cancelled`、`timed_out`、`action_required`、`neutral`、`skipped`、`stale`、`startup_failure`。`completed` 的结论不得为 null，未完成运行的结论必须为 null。未知值保持 unknown，不能解释为失败并允许重试。持久前代证据使用同一结论解析。取值依据为 GitHub 的[运行状态说明](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2026-03-10)和[CLI 运行列表](https://cli.github.com/manual/gh_run_list)，本工具不自动采用新增值。

此 journal 是单持久安装的本地互斥事实，不提供独立机器或独立检出间的互斥。删除 journal 会丢失不确定操作的 fence，因此宿主迁移、升级及清理必须先保留并对账旧记录。工具不能从一个空的新目录证明另一宿主没有未决操作。真实断电、网络分区与生产部署需要独立证据。

验证资源为[准备操作测试](../../tests/integration-prepare-delivery-facts.spec.ts)，包含真实子进程争用、intent 字节可见但未刷盘、文件和目录 fsync 错误、创建者被终止及恢复。GitHub 响应在该测试中为替身，不能替代真实工作流和采用验证。

## 持续验证与限制

`tests/delivery-observe.spec.ts` 覆盖输入绑定、六类工作、新旧两层级布局、实际模板填卡、缺失与重复章节、布局混用、父关系、决定声明、条件反例、隐藏阶段循环、投影对账、差量、属性类别与真实离线CLI。`tests/delivery-attributes.spec.ts` 覆盖属性读取与每个属性发现代码的正反例。`tests/delivery-binding.spec.ts` 覆盖 binding 两个版本的解析与区块读取。`tests/delivery-lines.spec.ts` 覆盖线归属表校验与 `check:lines`。`tests/delivery-labels.spec.ts` 用记录调用的 GitHub 替身覆盖差异、只改四族、正文主工作类型校验、写后正文漂移、读回核对、拒绝与写入失败。`tests/delivery-scope-overlap.spec.ts` 覆盖写范围求交的前缀判断、不计入的路径、默认排除已关闭的卡、重复来源与 binding 读取。`tests/delivery-dispatch.spec.ts` 覆盖派发字段缺项、摘要按现行条件行计算、写平台前的每项拒绝、同一修订与 attempt 不重复派发、占位评论改写与读回、读回失败时先交出派发 URL、只在「认领与派发」内改写、占位 URL 不写回、binding 写回与 dry run，以及在真实 Git 检出中读取 taskBase 的输入。`tests/delivery-milestone.spec.ts` 与 `tests/delivery-board.spec.ts` 用记录调用的 GitHub 替身覆盖里程碑与看板写入的请求参数、写前核对、重跑、读回、写入失败，以及看板设置的校验与旧配置的兼容。`tests/integration-board.spec.ts` 在真实 Git 检出中驱动 `start`，覆盖看板写入失败、配置关闭与重复开工时 context 和结果不变。`tests/delivery-github-read.spec.ts` 验证固定只读请求、物理字段映射、采集错误和分页限制。`tests/integration-delivery-facts.spec.ts` 验证提供 Project 事实时不发 GraphQL 请求，以及 Project ID 不符和 item 为空时拒绝。远端响应在这些测试中以有限 fixture 提供。

真实权限、语义接受、跨仓等待链、Project 全局写入竞态、跨会话恢复及业务迁移是否完整未由本模块证明。正式配置保持`enabled:false`。平台启用、默认分支模板发布与实际宿主执行仍须独立验证，每项普通任务独立维护本次身份、范围和结果。

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

准入观察不提供规则，所以准入不产生属性发现，属性发现不改变 `start` 的拒绝条件。`start` 另有派发字段的拒绝，见[派发命令](#派发命令)的 `dispatchFieldGaps`。`start` 的属性报告归[集成工具规格](../integration/SPEC.md#授权与开工)的 I16。

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

`parseReadSetFile` 只认含 `reads` 字段的 JSON 对象，其他内容交给 `fileScope`。字段只能是 `source` 与 `reads`：`source` 为非空字符串，`reads` 为仓库相对路径数组，可以为空，不合格时拒绝。`assignReadSets` 把读集文件挂到卡上：`source` 是 `#` 加数字时按卡号匹配，否则把两边都按调用方给的基准目录（`scope-cli.ts` 传当前目录）解析成绝对路径后，匹配 binding 文件参数。`source` 不对应任何卡参数，或同一张卡有两份读集文件时拒绝。关闭而不参与求交的卡，其读集文件不参与比较。

读集用独立的 JSON 文件，不扩展 binding：binding 的字段集是严格的，增加字段要改 `parseTaskBinding` 与 `start`。

命令只读。成员清单读运行它的检出的工作树。有写冲突对或读写交叉时退出1，输入不可用时退出2，标准输出总是完整的 JSON 结果或没有输出。

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

line-state 记录具名线负责人已消费的 delta 引用和序号。它不携带任务卡，也不授予任务写权，因此 active、idle 和 terminal 的输入都可记账。任务授权在 active 开工和申请入口核对，轮空线不为消费记录创建虚假任务。

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

本地路径按现有 `readAuthority` 查询当前 reviewer 资格，不声称证明该用户在过去某时刻的资格。云端路径通过 `factsFor` 按当前及历史派发 URL 读取可信 facts；CLI 不接受用户提供的 JSON 作为资格证明。当前 facts 的解析发生在外层授权快照捕捉之后，历史 facts 也按实际前序链接惰性读取，不使用提前捕捉的当前值或启动时的任务表。缺少任一对应事实时明确失败，不回退到环境或 GraphQL 查询。

[collaboration-facts.ts](collaboration-facts.ts) 的 `publishedAuthorityReaders` 为已采用的 policy/deployment 提供当前 reduce 的 `authorityFor` 与任务派发的 `taskFactsFor`。每次读取从真实卡的当前 binding 取得派发，历史回调交给既有授权链读取器逐项调用。等待进程因此能识别后来创建的卡及历史链接。此桥接不选择安装来源，不发布 facts，也不把 facts 当作结果接受或整波放行。

返回的 `VerifiedCollaborationAuthority` 只证明上述派发及记录权限。其 `scope.acceptanceResponsibility` 仍是声明，工具只核对它指向正文责任字段的摘要。它不授予接受权，也不证明 ReleaseRecord 已接受；接受授权来源与结果决定须由独立接受读取边界验证。

### 接受来源与决定读回

[collaboration-acceptance-source.ts](collaboration-acceptance-source.ts) 将已明确的人类授权与机器校验分开。`readAcceptanceSources` 只从固定路径 `docs/engineering/collaboration-acceptance-sources.json` 读取调用方已经获准采用的配置提交，并核对 `PolicySource` 的 commit、path、blob 和 digest。它没有 HEAD 默认值，也不从当前工作树读配置。`readAcceptanceSourcesRest` 从同一固定路径及完整提交 SHA 读取 GitHub Contents API，核对文件类型、路径、blob 和解码后字节摘要，再调用相同解析器。REST 读取只使用 GET，供没有本地 Git 对象的宿主使用。

来源 v1 的 `entries` 保持精确逐卡含义，每项保存 Issue 身份、交付 revision、授权声明的精确评论引用及声明者账号 node ID。来源 v2 保留 `entries`，另含显式 `mandates`。每项 mandate 只保存授权源 Issue 身份、精确评论引用和声明者账号 node ID。两个版本均不在配置中重复定义接受者。重复来源、未知字段和版本均拒绝。初始表为空，不授予任何卡接受权。

调用方选择配置提交的依据必须来自既有人的授权及其采用范围。候选分支新增条目、当前 reviewer 身份或本地文件存在均不构成采用。正式命令必须从已接受的任务／工具采用输入取得固定来源，不提供接受者、任意来源 JSON 或任意配置路径选项。加载器核对来源与字节，不机械证明声明者在业务上有权；这项人类决定继续是显式采用的前提。

授权声明在本卡评论内使用 `json omne-collaboration-responsibility:v1`，包含精确 Issue、revision、正文责任字段摘要、owner 和 acceptor 的 login／nodeId，以及非空授权依据。`readAcceptanceResponsibility` 核对当前正文、正式 scope、已采用引用、原始评论和实际作者。仅具名声明或合法派发不能通过。`json omne-collaboration-responsibility-revocation:v1` 引用原声明并给出依据；有权 owner／acceptor 的撤销阻止继续采用，未知作者、编辑或冲突保留错误。历史决定按其 GitHub 创建时间核对当时已采用的声明，历史来源也必须保留在明确采用的配置中；正常换修订不等同撤销历史。

里程碑授权评论使用 `json omne-collaboration-milestone-mandate:v1`，固定 repository、原生 milestone 编号，以及 owner、acceptor、declarationAuthor 的 login／nodeId，并包含非空依据。读取器要求源评论未编辑、字节摘要及作者账号匹配、源 Issue 身份匹配，且源卡和实际 reduce 卡仍属于该原生里程碑。同一里程碑存在多个有效 mandate 时拒绝，不按评论先后选择。有效 mandate 只让匹配的逐卡责任声明取得采用依据，不授予派发权、结果接受或整波放行。逐卡声明仍须存在并通过身份、修订和责任字段校验。当前派发人的账号还必须等于固定 owner。

里程碑授权可以覆盖后来创建的 reduce 卡，等待进程使用同一份已采用来源即可读取它们。账号或里程碑改变时不能沿用这份授权。授权源 Issue 上的精确引用撤销使用既有 `responsibility-revocation` 格式，只接受固定 owner／acceptor。当前读取拒绝已撤销授权；历史读取只使用截止时间前已存在、当时尚未撤销的授权。精确逐卡来源不能绕过同时适用的 mandate 冲突或撤销；mandate 也不能覆盖已明确采用的同卡同 revision 的不同逐卡引用。返回前重新读取各授权源 Issue 的完整快照，期间新增撤销、编辑或移出里程碑均拒绝。该读回不能使 GitHub 多对象读取成为事务。新增能力的替身验证归[里程碑授权测试](../../tests/delivery-collaboration-mandate.spec.ts)及[等待续接测试](../../tests/delivery-reduce-watch.spec.ts)；真实部署采用仍须单独验证。

[collaboration-acceptance.ts](collaboration-acceptance.ts) 定义接受决定与 `readReleaseAcceptance`。接受对象复用 `ReleaseSubject`，即 ReleaseRecord 的 context、finalHead、expectedRequests、results、lines、next，不另建一份清单。决定另含 Issue／revision／attempt、operationId、accept／partial／cancel／revoke、决定账号、授权声明、依据、剩余责任、精确前项及时间。`encodeReleaseAcceptance` 同时生成交付规则的十个人类字段与唯一机器区块；读取要求两者完全一致。未投影或有歧义的自然语言决定保持 unknown，不能从 closed、绿测或正文单词推断接受。

决定链保留跨 revision 前项，逐项核对原文、作者账号及各自已采用授权。新修订撤销可精确引用前一修订并使用其接受授权，即使正文尚未更新也阻止旧接受放行。新接受必须匹配当前 revision、attempt 和责任来源。所有决定及成果读回后，读取器再次核对当前责任及其授权来源；不能用历史截止时间忽略读取期间发生的当前撤销。部分认可、非接受链头、缺失前项、同操作异文、旧引用、编辑过的决定或事后补造授权均拒绝。账号作者可验证，工具不能区分本人键入和使用本人凭证的获授权代笔；代笔依据仍须按交付规则保存。

读取器核对所有参与线，包括 idle；读回结果和 delta 的精确摘要及权限，要求证据先于决定存在。state 须已合入或有明确 superseded 处置，并仍是完整序列的当前结果。delta 须有从首项至被接受项的完整、获授权前序链，且最终 F、continuation 和结果引用与接受对象一致。跨波历史需要相应 reduce 的正式授权；云端使用 factsFor 时，缺少显式 `relatedAuthority` 输入不得回退本地资格查询。读完再次核对来源快照及精确证据，变化即失败；GitHub 多对象读取仍不是事务。

`VerifiedReleaseAcceptance` 证明上述接受决定及所列记录，不证明本波预期请求集合已推导完整、下一波真实卡已经建齐、gate 覆盖当前候选，或本卡已经关闭。reduce 收口入口负责这些装配就绪守卫；等待入口还须核对最终 ReleaseRecord、所有下一步材料与当前卡状态。不得把此读取器单独用作整波放行条件。接受决定单向引用既有成果，最终 ReleaseRecord 再引用接受决定，避免循环引用。

验证入口为 [授权读取测试](../../tests/delivery-collaboration-authority.spec.ts)，使用真实派发校验函数及 REST 替身。覆盖历史资格、云端 facts、停写编辑、计划提前授权、链外写者、卡片变化和撤销；真实 GitHub 采用另行验证。

验证资源为 [schema 测试](../../tests/delivery-collaboration-schema.spec.ts)、[分页与序号测试](../../tests/delivery-collaboration-read.spec.ts)和[信任测试](../../tests/delivery-collaboration-trust.spec.ts)。这些边界函数不自动接受成果、派发任务、创建 PR 或关闭 Issue。

## 事件等待

`runReduceWatch` 每次消费一张实际 reduce 的完整 release，或一个非成功申请的处置。放行前核对接受决定、全部 delta、下一波实际卡、最终记录及关闭事件；重开、撤销和未知记录不能授予开工。active 任务必须仍归该线负责人及原生线父卡，属于当前里程碑并匹配正式派发与基线。已经登记交接的任务不能通过重放旧 release 或 redispatch 再次取得写权。

历史 active 任务已过期时，只有直接后继也有有效最终 release 与关闭证据，才返回 `recover-next`。返回仍只消费当前这一个节点，不重新开旧任务。重复 operationId 从原目标重新核对权威事实，持久结果本身不授予当前权限。

等待游标保存在本机 JSON journal。获取、残锁恢复和释放共用 Node `node:sqlite` 的本机进程互斥，进程退出释放该互斥；恢复仍须显式指定 `--recover-lock` 并确认旧 marker 属于已停止的本机 PID。释放时只删除本操作的 marker。journal 必须是普通单链接文件，拒绝文件本身为符号链接或硬链接；父目录路径别名不另开并发写权。该保证适用于本机文件系统，不声明网络文件系统上的分布式锁。跨机器业务恢复仍以 GitHub 记录为准。Node 24 的 [DatabaseSync 文档](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) 是所用运行时接口的依据。

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

## 候选与整波验证报告

`collaboration-verification.ts` 读取具名验证报告。它不执行报告中的命令，不重新判断评审结论，也不授予接受。Reduce 负责人必须先取得实际检查与独立评审证据，再形成报告。报告读取器验证归属、精确受测对象、必需类别、成功结果和引用字节。日志摘要通过不单独代表检查适用。

报告位于当前 reduce 卡的一条未编辑评论。首行是 `<!-- omne-collaboration-verification:v1 -->`，其余正文为单一 JSON。JSON 必须包含 `schemaVersion:1`、`subject`、`writer`、`checks` 和 UTC `recordedAt`。评论作者必须是当前具名 reduce 负责人，writer 的 login、epoch、authorization 必须等于当前有效派发。拒绝改过的评论、未来记录时间、旧 epoch 和读取期间的授权变化。新结论使用新评论及摘要，不修改旧证据。

候选 subject 包含 `kind:candidate`、完整 context、lineParent、requestId、requestHead、candidateHead 和 targetBase。它必须与当前请求及待写状态完全相同。candidateHead 和 targetBase 不得为空。状态的 verification 引用中恰有一份正式报告，其余证据仍逐项核对摘要。报告必须覆盖 impact、tests、review 和 admission 四类。

整波 subject 包含 `kind:wave`、完整 context、finalHead、expectedRequests、results、lines 和 next。报告必须覆盖 whole-wave、reduce-work、integration-defects 和 pending-writes 四类。整波报告由装配提供显式引用，不通过“最新评论”猜测。报告本身不替代 roster、delta、后继输入、接受和关闭读回。

每项 check 有唯一 name，且只允许以下一种形状：

- `kind:command`：area 为 tests、admission 或 whole-wave；command 为实际执行的非空 argv；exitCode 必须为0；log 为可读回的 Evidence。命令结果由执行者记录，工具不执行评论内的 argv。
- `kind:judgment`：area 为 impact、review、reduce-work、integration-defects 或 pending-writes；conclusion 为 pass，只有 review 可用 not-applicable；reason 必填；evidence 至少一项；remaining 必须为空。review 的不适用理由由负责人按现行风险规则判断，不能用它跳过适用独立评审。pending-writes 的证据须来自实际 journal 与远端恢复核对，不能只根据未报错推断。

所有日志及判断依据使用既有 Evidence 定位与摘要格式。缺类别、重复 name、非零退出、未知结论、残留工作、引用变动或 head/base 不一致均拒绝。完整性与行为覆盖的最终判断仍由 reduce 和独立验收承担，结构化报告不能把窄测试扩称整体通过。

验证资源为 [delivery-collaboration-verification.spec.ts](../../tests/delivery-collaboration-verification.spec.ts)。这些确定性测试覆盖精确 subject、四类覆盖、来源身份、旧证据和失败拒绝，不能代替真实运行与独立判断。

## 首次派发消息具体化

`line-initial-dispatch-cli.ts` 提供 fields、render 和 validate。模板来自工具源码检出的固定模板路径，不从输入 JSON 选择代码或模板。fields 返回模板占位名。输入只含 schemaVersion、milestone、line、revision、fields，未知顶层字段拒绝；字段集合必须与模板完全相同。line 是受限短名，milestone/revision 为正整数，dispatch_revision 必须相同。只输出模板的消息正文，不把填写说明交给 Line。

生成使用独占创建。同修订、同内容重放复用文件；已有不同内容或损坏文件明确拒绝，不能静默覆盖。validate 重新渲染并核对实际文件字节。空字段、残留占位、重复 CLI 选项、常见 token/private key 和 smee 频道地址拒绝。该扫描不是通用秘密证明。输入中的命令始终是消息文本，工具不执行它们。

工具输出 GENERATED 或 STRUCTURE_CHECKED，均不能代表完整 VALIDATED。输出包含路径、SHA-256 及仍须负责人判断与机器证据共同完成的 guards。授权、精确输入可读性、目标机器命令与策略、等待链和秘密/矛盾检查由 reduce 执行并保存证据。工具不伪造 OPENED_FOR_HUMAN、FORWARDED_REPORTED 或 CLAIMED_READBACK。正式消息不改变 binding 的写范围或已有唯一执行。

验证资源为 [delivery-initial-dispatch.spec.ts](../../tests/delivery-initial-dispatch.spec.ts)，覆盖实际 Node CLI、字段和秘密拒绝、重复生成、修订冲突、输出变更及五事实不混同。实际材料可达、打开、转发和接收端唯一执行由宿主行为验收分别验证。


## Reduce 装配与监督边界

`reduce-command.ts` 解析 next、claim、record、prepare、check-release 和 release。严格拒绝未知字段、错误记录种类及重复 CLI 选项。`reduce-cli.ts` 另外提供 supervise 和 ack；所有输入先通过共享 JSON 解析，再加载固定安装。CLI 不接收任意 bootstrap 模块、来源文件或 workflow HEAD。根与成员的 `reduce` script 使用同一源入口。

`reduce-bootstrap.ts` 从版本 3 安装取得 gate workflow SHA，并复用当前 authority、接受来源和验证报告 reader。整波报告检查前后均从受信派发 route 和 policy 派生目标轨道，读回精确 ref、commit 类型及 finalHead。报告期间授权变化或轨道移动均拒绝。此检查不授予写权、接受或部署审批。

候选读取采用 REST `2026-03-10`。该版本已删除 PR 响应中的 `merge_commit_sha`。未合入候选的 mergeCommit 为 null，不使用 GitHub 的试合并提交。PR 已合入时，完整读取该 PR 的 Issue events，要求唯一的 `merged` 事件，并核对事件 URL、commit_id 及同仓库 commit_url。缺失、冲突、重复页或读取失败均拒绝。此事件仍须与精确 gate 成功、PR 已合入及提交在目标轨道可达的事实一起核对，不能单独证明交付接受。来源见 [GitHub 版本变更](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes)和[Issue event 类型](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types#merged)。

恢复已接受且已关闭的原 release 时，先通过共享 reader 核对原接受、完整 release、delta 和关闭事实，并确认原操作字节相同，然后返回原回执。后续波推进轨道不使旧完成结果失效。该恢复不重做发布前就绪检查，不重发或重新关闭。未发布、未关闭、记录冲突或重开的波不走此完成路径。

`reduce-supervision-input.ts` 将活动对象解析为已有 RequestInput、RequestStateRecord、WorkflowEvidence 和 ReleaseRecord。输入不接受轮询周期或采用 gate SHA 覆盖。阶段 VERIFY_WAVE、RELEASE_WAVE 和 FINALIZE 必须提供显式收口目标。未知后继不能从缺省 release 推断为终态。

`reduce-supervision.ts` 在主进程安装文件订阅及本地健康检查。每种远端 probe 使用一个持久 worker；同步 REST 和安装来源读取仅在该 worker 中执行。reconcile、runs、deadline 三种 probe 互不串行等待。worker 只能使用 REST GET，不能调用 GraphQL、审批或任何写操作；模块路径由装配固定。IPC 结果重新解析为 ReduceSignal。协议错误、退出或 120 秒 probe 超时使该 worker 失效，不自动重启或把未知当空集合。

活动 run 完成后撤出该 worker 的轮询集合，并重新读取实际回执与当前 owner/epoch。运行未完成时不周期扫描 Issue/PR。新事件、启动恢复与截止重新对账。收口监督只返回已核验的就绪或已放行事实，不创建接受、delta 或后继卡。phase 与业务状态独立，ack 只写本地信号处置回执。

监督返回可处置信号时退出 0，显式超时退出 3，取消退出 130，输入或监督故障退出 2。超时结果保留原 operationId 和 recovery，不表示波已完成。恢复时使用原输入和 journal。

监督结束会停止子进程并释放订阅和计时器。POSIX worker 使用自有进程组，停止和超时终止整组，避免同步 gh 子进程遗留。Windows 目前只终止直接 worker，命令自身仍受读取超时约束；该平台的子进程树清理不在现有验证结论内。

新增验证资源为 delivery-reduce-assembly、delivery-read-worker、delivery-reduce-integration、delivery-reduce-supervise、delivery-collaboration-installation 和 delivery-collaboration-verification 测试。它们区分真实本机进程/文件/CLI 与 REST 替身；不将替身结果声明为真实工作流部署或 W4 宿主接受。
