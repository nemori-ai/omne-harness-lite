# 通过对话操作交付卡

协议已采用，日常入口以[GitHub交付配置](github-delivery.json)的实际发布状态为准。PanQiWei已授权启用，接入及首次采用记录归[工程启用任务](https://github.com/nemori-ai/omne-harness-lite/issues/195)；未发布或未获本任务授权时只形成获准草稿。每项任务按实际需要明确本次身份、结果和接受责任。平台、默认分支模板及实际宿主执行仍须独立验证，本页不授予发布或启用。

本页供协调、实施、评审和维护agent将人的对话转为真实交付操作，也供负责人理解agent将做什么。卡身份、字段、条件、单写与决定归[交付协议](delivery.md)，各类证据归[工作类型](work-types.md)。本页拥有操作顺序与回执，不复制另一套状态或授权规则。

已接受的设计不表示平台已接入。首次操作先核[单一接入配置](github-delivery.json)的真实仓库、主Project、交接入口及当前能力；没有接入时明确只形成临时草稿或只读说明，不能声称已经建卡、派发或更新状态。

## 从人的话判断本次动作

| 人的意图或说法 | Agent应做的动作 | 不可混淆的边界 |
| --- | --- | --- |
| “我想增加能力”“这里有个bug”“想优化性能” | 整理问题、当前依据、结果和类型，查询是否已有同范围卡；按当前任务授权起草或建卡 | 提出方向不自动表示已有规格、准入齐备或获准实施 |
| “帮我建卡”“把刚讨论的任务记录到队列” | 按获准范围创建或更新唯一卡，读回真实身份、正文及关系 | 建卡授权不等于代码实施、接受或合并授权 |
| “看看下一步”“哪些任务可以做” | 只读队列，报告排序、条件满足及unknown，提出候选 | 读取或建议不构成领取和派发 |
| “开始这张卡”“在这个队列自驱推进” | 在指定卡／队列及既有授权内复核准入，由有权协调者登记attempt并派发 | worker不因API可写就取得调度权；范围不扩大到其他队列 |
| “补充一条要求”“先做B”“A还得等一下” | 区分语义修订、Priority／Wave调整、阶段阻塞或明确暂停，按各拥有者更新 | 改顺序不删依赖；等待不抹去真实阶段；暂停按精确范围处理 |
| “方案接受”“这个结果接受”“先取消” | 定位对象、修订、范围和决定者权限，分别记录技术采用、交付接受或取消 | 接受设计不表示结果交付；部分接受不关闭整卡 |

对话中的已有授权持续有效，不逐次要求人重复许可。确实缺对象、范围、接受权、产品规则或工具资格时，只问影响下一步的必要问题，并继续不依赖它的工作。语境不足以区分接受方案还是接受成果时，不能自行销卡。

## 1. 整理需求并定位已有卡

先识别人的目标和本次操作范围。按实际承诺拥有者定位产品、技术或工程依据；不要强造PF。查询配置仓库内的相关卡及已结束结果，按范围和语义比较，不只按标题去重。已存在同一活动结果时更新其获准修订，不另建并行可编辑卡；新回归或新结果可独立建卡并引用旧结果。

选主工作类型及delivery／subtask层级，确认结果、边界、主接受者、所核输入、开始条件及类型所需证据。缺决定可以保留Backlog及具名问题，不编造默认答案。必须的输入未齐不能记Ready；技术类型并不免除相关产品或架构变化的接受。

讨论尚未变成建卡任务时，在对话或任务tmp形成草稿。草稿不是正式Issue副本或第二队列；获准发布后，真实Issue成为唯一编辑源。后续对话改变范围时核对真实卡及规范，不只修改可能丢失的session log。

## 2. 建卡或修订卡

建卡前读取实际模板和[类型要求](work-types.md)，检查访问、发布授权、创建请求定位及单写责任。按[创建与对账协议](delivery.md#6-访问失败与最小工具)完成稳定操作标识登记、首次发布、结果读回和超时处置。使用宿主实际可用的结构化工具或已核CLI/API，不编造仓库、Project、命令或插件能力。

按[七个信息模块](delivery.md#长期正文与一次交付)填写两种模板，删除占位和填写提示，保留可见的“接手本卡”说明。依据集中记录精确输入，验收通过输入ID引用；实际证据交回执行区。不把前置条件混入结果判据。测试按[包级测试责任与边界](../verification.md#包级测试责任与边界)填写。单元和契约默认由本包承担。集成只由实现具体存储或应用服务的包承担。端到端只由关键旅程的拥有者承担。非代码任务选择适用检查，说明未覆盖和环境缺口。

建卡时按[卡属性与合法组合](delivery.md#卡属性与合法组合)登记交付线、性质与契约变更；调度者在 Issue 上设置里程碑，并打唯一的 `kind:` 与 `line:` 标签，缺任一项时 `start` 拒绝开工。调度者的建卡与派发步骤由 `dispatch` 技能给出，集成节点的步骤由 `integrate` 技能给出；两个技能只引用本页的规则与 dev-flow 的命令，不另立规则。建卡时尚未派发，在执行区写计划路线、最终终点和待定输入，不填占位binding或虚构工作树、开工HEAD及context。接手者须能取得必要输入；仅给另一台机器的tmp路径不足以完成交接。

调度者用 `milestone-cli.ts create <名称> --due <日期>` 建里程碑，用 `milestone-cli.ts carry --from <A> --to <B> --reason <原因> <卡号>...` 把卡移到另一个里程碑。carry 在每张卡上发一条固定格式的流转评论，不改 binding。用法见[交付观察说明](../../tools/dev-flow/src/delivery/README.md#里程碑命令)。

读回实际Issue、正文、所需关系及主Project归属，再报告操作结果。Project加入或关系写入失败时，保留真实Issue身份及缺口，逐项修复，不把整项说成未创建而盲重建。

修订由卡owner授权后交正文单写者集成。语义变化升交付revision，保留既有决定范围；分类标签只投影正文。规范变义先由其拥有者接受并写回，卡引用新有效输入；原生边与条件表不一致须对账。改了卡不表示已满足准入。

主工作类型派生为`kind:<类型>`，层级派生为`level:delivery`或`level:subtask`。责任视图采用`domain:<领域>`、`member:<成员>`及适用的`topic:<产品topic>`标签，从卡的实际责任和长期依据派生；技术卡不强造topic。优先复用已有稳定值，不从测试标签推定新产品领域。领域、成员、topic视图按前缀查询；标签与正文冲突须对账，不能让标签成为第二份责任源。交付线派生为`line:<线ID>`，性质派生为`nature:<性质>`；契约变更为additive或breaking时派生为`contract:<值>`，为none时不打标签。主Project的Line与Kind字段也是投影：`start` 在开工时按binding写 Line，核对正文主工作类型与唯一 `kind:` 标签一致后写 Kind，调度者可用 `board-cli.ts dispatched` 补写。各字段的唯一源与写者见[字段总表](delivery.md#字段总表)，字段ID、选项ID只登记在[交付配置](github-delivery.json)，没有登记时不造字段ID。

当前波视图要求负责人已采用波的节奏，调度者已在Wave字段中为本波建好迭代；空视图不表示没有任务，也不证明筛选有效。工程接入不为验证看板擅自制定项目迭代周期。

## 3. 取任务和派发

协调者先核读取范围与分页完整性、排序、依赖及现存attempt。Ready只是之前的观察，开始前仍核当前必要输入和条件；不能从空列表、closed或Project状态推出资格。返回候选时说明为什么可做、等什么、哪些无法判定。

获准取任务后，由本卡指定的单一调度者发放执行权，调度者须是 `publish` environment 的 reviewer；worker向该协调者交领取请求或候选，不自行竞争修改共享摘要。派发前，调度者按[合法组合](delivery.md#卡属性与合法组合)核对属性、路线、写范围与交付条件；不合时先修订卡，再派发。协调者登记attempt并读回，给执行者明确卡修订、检出／分支、写范围、依据、验证、完成及停止点，随后派发。派发评论与binding写回用 `dispatch-cli.ts post` 与 `bind`，用法见[交付观察说明](../../tools/dev-flow/src/delivery/README.md#派发命令)。工作类型决定加载哪些专项输入，规模决定选哪个pstack流程。

接手会话先在本卡评论声明认卡，注明负责的人、宿主及会话或agent实例、当前修订、授权依据和现存执行核对结果。已有派发就引用该决定；尚未派发就向本卡指定调度者请求领取。认卡评论不授执行权，不新增认领Stage，也不代替唯一attempt读回。已获调度或正文单写职责时，在授权内直接完成登记和更新，不重复请示。

Git任务开工前核对执行区唯一正式binding、直接目标分支及工具生成的context回执。纯评论报告等明确不涉及Git交付的卡，在分支与context小节写“不适用”、成果入口和理由；不造分支或执行Git start。该例外不免除认卡、派发、进展和接受责任。

并行仅在独立写范围和条件允许时展开，共享接口及集成目标有单一责任。其他卡被阻塞不妨碍已获准的独立部分。旧实例失联、调度者交接及过时候选的处置继续按共用协议，不用更新时间或assignee模拟锁。

并行派发多张卡前，调度者运行 `node --experimental-strip-types tools/dev-flow/src/delivery/scope-cli.ts <卡号或 binding 文件>...`，核对写范围两两不相交。任务 tmp 与线归属表的 `shared` 路径不计入。命令退出 1 时不派发这组卡，先改分解。调度者为每条线写线包。线内的卡由线会话按 `claim` 技能 `references/` 中的模板写上下文地图本卡附录与任务信息包。不在线内的卡由调度者写，派发前做一次其中的自包含检查。合入顺序与集成节点的步骤见[集成节点的清单](integration.md#集成节点的清单)。

### 按角色的流程

几条线并行推进一个里程碑时，两个长期角色各有一份可复用的流程，规则仍归本页、[交付协议](delivery.md)与[多层分支集成](integration.md)：

| 角色 | 阶段 | 可执行流程 |
| --- | --- | --- |
| 线会话（推进一条线的会话，跨波不换） | 开工读取冻结输入 → 波内自主实施验证 → 交 ready/blocked/failed 并停写 → 非成功先等有效处置 → 逐当前 reduce 的有效 release 消费 delta → active/idle 续挂或明确 terminal 最终交接 | [`line`](../../.meta_harness/agents/skills/line/canonical/SKILL.md)；卡级动作用 [`claim`](../../.meta_harness/agents/skills/claim/canonical/SKILL.md)，状态归[负责人状态](map-reduce-states.md) |
| 集成节点（兼调度者） | 同一里程碑同一会话负责 → 当前波正式建卡及后一波预案 → 首次消息生成/校验/打开供人转发 → 持续收件与八类监督 → 接管全局集成问题 → 验证成果 → 建后继卡并读回全部存续线 delta → 有权接受 → 最终 release → 关闭读回 | [`dispatch`](../../.meta_harness/agents/skills/dispatch/canonical/SKILL.md)、[`integrate`](../../.meta_harness/agents/skills/integrate/canonical/SKILL.md)；规则归[集成清单](integration.md#集成节点的清单) |

Line 波中按冻结输入自主执行，不向人提问、不通过普通评论向 reduce 求方案。缺口先停依赖项并继续独立工作；达到结束条件时交 blocked/failed 并停写，先等有效处置，不能等下一波答复形成循环阻塞。正常路径按当前 R 的有效 release 逐节点续接，事件只是权威对账提示。精确等待、恢复和有界活动 run 观察由固定工具帮助定义，不用低层 closed/comment 事件代替整波放行。

## 4. 推进和更新状态

执行者在自己的树工作，提供候选及事实；正文单写者集成Issue共享摘要，指定调度者维护Project阶段。二者可以兼任；分离时正文写者向调度者交接已读回的事实及阶段更新建议，不因此获得Stage写权。关键进展、依据变化、阻塞、可审阅候选、暂停／接续及决定发生时更新所需事实，不按每次工具调用上传日志。阶段变化依据[Stage含义](delivery.md#2-卡片与阶段)，保留尚未满足的集成或接受条件。

Claude Code 云端会话不能直接修改 Project Stage：平台代理拦截 GraphQL 与 `orgs/` 路径。云端的调度者派发 `github-gate` 上的 `delivery-stage`：`gh workflow run delivery-stage.yml --ref github-gate -f issue=<卡号> -f stage=<Stage>`。该流程只接受 `publish` environment 的 reviewer 触发，改为 In progress、Accepted 或 Cancelled 前核对卡上的派发或决定评论，不满足时失败、不写入。派发后用 `gh run list --workflow delivery-stage.yml --limit 1` 找到这次运行，用 `gh run view <运行号>` 读结论；运行在 job summary 中写出读回的 Stage。云端会话不能直接读 Project，所以 Project 对账以这份读回为准，并注明运行号。云端的 `start` 自动经 `delivery-facts` 取得派发资格与 Project 事实，条件见[集成工具说明](../../tools/dev-flow/src/integration/README.md)。

本地会话直接修改 Stage 并运行 `start`，不经过这两个流程。「Stage 只能由有资格的人修改」只在云端路径上由流程强制，本地按本节约定执行；`delivery-stage` 也不核对触发者是不是这张卡的调度者。

`delivery-stage` 现在不接受 Integrating。Integrating 只能在本地路径上写入。让该流程接受 Integrating 归 `github-gate` 分支的拥有者。

看板字段的写入如下。命令都只能在本地会话运行；云端会话改 Stage 仍用 `delivery-stage`，日期字段留待本地会话补写。

- 执行者交回候选 PR 时，调度者运行 `node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts delivered --issue <卡号>`。命令写 Delivered at，并把 Stage 改为 In review。线内的卡由线会话在卡的 PR 合入批次分支时运行。
- 候选通过准入、派发 `gate-publish` 时，运行合入的人用同一命令的 `integrating` 把 Stage 改为 Integrating。批次进入联调轨道时，集成节点对线父卡运行这一步，见[集成节点的清单](integration.md#集成节点的清单)。gate 失败时，调度者把 Stage 改回 In review。
- `start` 在新建 context 时写入 Dispatched at、Line、Kind 与 Wave。Dispatched at 与 Wave 已有值时不覆盖，同一张卡的新 attempt 不改它们。写入失败时，调度者用 `board-cli.ts dispatched` 补写。
- Needs decision 由调度者在 Project 中设置，工具不写。需要人拍板时置 `yes`，决定读回后置 `no`，规则见[契约变更与里程碑类型](delivery.md#契约变更与里程碑类型)。

执行者在开工和成果交回时也更新事实。每次注明当前revision/attempt、发生的变化、成果或证据、尚缺条件及下一责任。正文只保留当前摘要，旧attempt和逐轮过程通过评论或技术回执定位。Project对账注明所核Stage及时点；评论、正文或Project写入失败时分别报告未持久的部分，不声称全部已更新。

范围或规范变动时先复核影响。仍可独立推进的部分继续，依赖新决定的部分保留问题；不能靠降低要求或删条件报告完成。成果按既有授权及时保存到Git远端，Issue只保留恢复定位及简短交接。调查、临时测量和单次验证的原始输出按保存边界处理，不整目录提交tmp。

## 5. 提交成果供接受

形成候选后执行按类型和风险选择的验证，并说明实际输入、结果、限制和未覆盖。相称检查及适用独立判断完成后，由协调者将实际成果与证据交给具名结果接受者；需要人的决定时给足对象、范围及缺口，不把全部原始日志交给人逐条检查。

同一对话内多个对象时，明确本次等待的是方案采用、某个子任务、整张交付卡还是合并。agent可以代笔人的明确决定，但须能核对授权人、身份、对象、修订和范围；不因自己的测试结论自授接受。人已经明确决定且有权限时直接回到该对象的记录拥有者，不再反复请示。

RFC采用按[提案及决定关系](../rfcs/README.md#现行源与维护)和[RFC模板](../rfcs/.templates/rfc.md)记录精确提案修订与范围，写回仍分别判断。产品、架构及成员规格的采用，按其现行接受约定更新获准终态、采用状态和修订；非RFC方案的本次接受记录留任务区，不为补史虚构RFC。上述采用均不写成交付卡的accept决定，也不关闭关联卡。交付卡／子任务结果才进入[交付决定协议](delivery.md#4-接受取消与重开)，使用真实Issue及交付revision；合并或发布继续回其已有授权和制品入口。

交付卡的有效决定先读回，再由具名角色修关闭和Project视图。只接受子任务或部分结果时父卡继续活动。平台写入不可用时，区分“负责人已在对话作决定”和“远端决定尚未记录”；停止依赖其持久事实的状态切换，不声称Issue已接受。恢复后取回有权者的可核输入，不能凭模糊回忆补造决定。

接受决定读回后，调度者运行 `node --experimental-strip-types tools/dev-flow/src/delivery/board-cli.ts accepted --issue <卡号>`。命令写 Accepted at，按 Dispatched at 算出 Cycle days，并把 Stage 改为 Accepted。命令不判断接受是否有效，只在决定读回之后运行。

## 6. 暂停、取消和跨会话恢复

明确暂停才保存相应可恢复边界并停止该范围派发；暂缺条件只报告阻塞，不推断人取消目标。取消按具名决定核对后继影响；合并和发布仍按各自授权执行。

新会话先从真实Issue、主Project、长期源和远端Git恢复，核现存attempt及可用执行者，不要求用户重述全部历史。session log可作为辅助线索，不能替代这些事实。来源无法读取、分页不全、请求结果未知或旧执行者状态不明时按共用协议保留unknown，并报告可继续的部分。

## 对人的操作回执

每次完成有意义的操作，简短说明真实卡身份、做了什么、当前阶段、实际已记录或尚缺的事实及下一步；受阻时指明条件、责任和需要人提供的具体决定。区别“草稿已写”“卡已创建”“执行已派发”“候选已验证”“决定已记录”和“视图已修复”，不要只回答“已完成”。

无需向人重复字段清单、技能正文或所有检查过程。工具发生超时或部分失败时准确报告已成功部分及读回结果。自动路由、原生调用或cloud恢复未验证时明说，文档存在不表示agent已经遵循。

## 多层集成的交接

[多层分支规则](integration.md)维护技术运输。Issue 当前 revision/attempt 仍唯一拥有任务、路线和本次集成终点，正文单写者维护工具可读 binding；精确格式由[工具指南](../../tools/dev-flow/src/integration/README.md)拥有。任务同步不能改变原 taskBase 或虚构新 attempt。主干的进入按[现行准入](integration.md#现行准入)执行：开 PR，派发 `gate-publish`，由 admin 填写说明后确认。agent 代为确认时在说明中注明代为确认的人。

binding放在“当前执行与交接”，派发后替换未派发的计划文字。attempt、branch、route、completionTarget、taskBase和writeScope以唯一真实binding为编辑源。相邻记录从路线与 policy registry 的轨道登记解析的直接目标分支、实际开工taskSource、目标targetBase及观察时点，以及生成的context路径和核验回执。这些读回项留在JSON外，不增加v1字段。原taskBase与实际开工HEAD分别保留；目标前进后须重新核对targetBase。不得手工制造context或将本地缓存当授权源。

原交付条件表可增加“适用目标”列；未声明为 all。integration 条件按本次实际 track/main/stable 或登记完整 ref 核对，start/acceptance 保持 all。最终包含结果的条件放 acceptance。现有阶段环观察未完整覆盖目标层细化，未知不得说成全图无环。

完成 track 后已接受的结果仍可能随所在轨道逐层提升，被后续完整 RI 携带到上游与 main。轨道 owner 在提升 PR 的说明中列出这些卡及其在上一层的条件。有权 owner 对每个历史 identity/revision/attempt 与当前输入分别重核，历史 tuple 和 taskBase 不被新修订覆盖。当前 attempt 仍唯一，不因历史集合变成多执行队列。

Project 可由原投影单写者维护可选 Integration target/progress，取自 Issue 声明和实际 Git unit/checkpoint。没有真实字段配置时不造 ID；视图不另增 Stage 或可编辑调度队列。declared/observed 不一致或不足为 inconsistent/unknown，不能升级为 Accepted 或 Closes。Git 已发布而 Issue 投影失败时，由原正文单写者修复技术记录，不重放 Git。dev-flow 对平台的写入范围见[多层分支规则](integration.md#issue-与-project-的配合)。
