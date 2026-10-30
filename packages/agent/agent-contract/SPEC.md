# Agent 能力的长期行为规格

状态：调用身份与资格、调用登记、原消费位置、取消与恢复、结果保管及交接已由[技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/262#issuecomment-6186972289)采用，是该接受范围内的现行协作契约。本页及所引专题中上述范围的采用状态以此处和接受记录为准。本页其余内容及所引专题，即公开接口、扩展作者协议、对象模型、外部协调者前提、Loop 算法、恢复切点与机制，已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，同样是现行协作契约。“[生产者接收面](#生产者接收面)”一节，以及提交参加者协议中推进资格失效的冲突映射，属 [#672 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/672) 的写回，其接受在该卡交付时记录。仍然开放的事项由各专题与开放问题页逐项写明。设计接受不表示生产实现、提供者或运行验证已完成。

目标拥有者为 `packages/agent/agent-contract/`。本规格表达持续约束实现的行为。公开类型与机制的设计已按上述状态接受，提供者与实现的接受另行判断，不由设计接受代替。正式产品和全系统架构仍是上层依据。

“[接收共同提交](#接收共同提交)”及相应操作条款属 [#801 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/801) 的写回，其接受在该卡交付时记录。

## 责任与适用调用方

成员提供 AgentDefinition 专有语义、Loop 下一步求值、具备资格的推进协调及 Loop extension 的位置与接续行为。

调用方包括装配者、外部协调者、独立调用者及扩展适配者。外部协调者拥有自己的业务关联、输入受理和日志，通过公开操作关联 Agent 执行。只消费定义或纯求值的使用者不必创建 runtime；Agent 托管推进使用原 execution、执行挂接与当前资格。外部协调者在自己一侧保存业务关联与 Agent 执行身份的映射，Agent 不读取、不解释这些关联。不能通过独立入口绕过系统托管数据的身份、读取和操作限制。

下面三个专题共同构成本成员的完整必要行为。

| 专题 | 本成员拥有 | 消费的邻域保证 |
| --- | --- | --- |
| [定义与选入](docs/public-api/definition.md) | Agent 类型、专有声明、继承与必需身份规则 | 资产持有与版本、合法来源、装配求值和采用 |
| [Loop 与接续](docs/flows/loop.md) | 外部可观察的推进保证与守卫处置阶梯。节点次序、读写与等待归 [Loop 完整算法](../agent/docs/architecture/loop-algorithm.md) | 执行挂接的推进资格（由 Journal 提供者授予，外部协调者路径另需协调者的推进资格依据），Context 组装，Model 与 Tool 原执行 |
| [扩展作者协议](docs/public-api/extensions.md) | 九处位置上作者可见的输入与输出、位置输出表、调用协议、失败和原判断接续 | 共同授权、人工答复、装配绑定与原调用保存 |

## 前提与结果边界

系统推进前取得已校验的采用依据、有效推进资格、可恢复历史或可靠投影、原消费位置及当前模式、权限、Context、模型和资源条件。缺少必要输入不能填假默认值，不用旧日志授权新动作。

本成员的结果是可解释的下一步、候选及其依据、原调用交接、可恢复等待、终态候选或具体失败。模型建议不等于工具发起，准入通过不等于执行成功，空队列不等于工作已完成。

Agent 自己的执行结束由本域条件提交成立。外部协调者的业务终态由该协调者记录，本成员不得另立协调者业务终态的权威。需要两者共同成立时，由提交参加者与 Agent 的 Journal 提供者在同一次条件提交中保护。独立调用者没有这个要求，也无需模拟任何外部对象。纯计算、实际调用、业务承接与资源清理分别报告。

## 身份、范围与归属

每个独立模型、工具及扩展调用具有可恢复身份和原用途，区分同一 step 中的多个动作。step 不能代替调用身份。调用的发起与后续消费分别关联，不能因换执行挂接或换 runtime 新建同一逻辑调用或重记原费用。

进入执行记录的事实有三类。调用登记保存稳定调用身份、固定输入的引用、原消费位置和阻塞范围。会改变后续判断的扩展结论记入执行记录。人的答复交回原卡片。纯观察是留痕。登记不等于已经发出。连续否决不设次数上限。已记下的否决历史不因换执行挂接而消失。

执行记录由 Agent 经 Journal 保存，控制记录与否决历史也保存在执行记录中。业务消息由消息的拥有者保存。Agent 自身的事件由 Agent 的事件序列保存，规则见“事件流与读取”。诊断日志按“性能、诊断与维护”处理。有外部协调者的装配里，Journal 可以由协调者的日志承载。执行记录只有这一份，协调者不另抄 Agent 事实，只从中派生自己的治理事实。Agent 通过事件序列与读取操作提供原事实。

登记的最小对接是现行规则。这张表适用于所有调用方，包括外部协调者和独立调用者。Model 的引用与受理前身份由 [Model 引用契约](../../model/model-contract/SPEC.md#可保存调用引用)固定。Tool 的来源关联由 Tool 契约拥有，不从 Model 推广共同铸造规则。

登记始终保存固定输入的引用、原消费位置和发起者。Model 在受理前保存调用身份，Tool intent 在身份尚未证明时不含调用身份。调用方自己的业务关联只在这次调用实际具有它们时才以消费位置携带，Agent 不为独立调用制造这些身份，也不要求它们。托管访问把租户当作参数。缺租户或跨租户默认拒绝。

| 生产者 | 项 | 规则 |
| --- | --- | --- |
| Model | 关联身份与必要参数 | 首次 admit 前固定 call/admission，编码保存 ModelInvocationRef、固定输入、原消费位置与发起者。Agent 发起的调用关联 execution，独立调用保留原身份，租户显式携带 |
| Model | 成功 | 登记已提交，登记不等于已经发出 |
| Model | 拒绝与参数冲突 | 挂接失去推进资格、输入未固定，或同一调用身份绑定不同固定输入时拒绝 |
| Model | 未知 | 按提交前原 reference 查询。只有权威 not-accepted 才沿原身份再受理，不另造身份 |
| Model | 同身份重试 | 同一身份和同一固定输入认回原登记 |
| Tool | 关联与必要参数 | 先保存完整原 ToolInvokeRequest、consumer、材料 fixed 和 intent。Tool 来源以租户及完整 consumer 分配或认回身份，Agent 不预分配 call/admission |
| Tool | 成功、拒绝与未知 | invoke 四种结果与 associated 保存按“Tool 调用关联与控制引用”。同 consumer 异请求由 Tool 拒绝，不绕过当前资格 |

Agent 为推进某个 execution 发起的调用关联该 execution 和原消费位置；压缩和扩展判断回到原内部位置。独立调用只使用调用方实际提供的身份，不为它制造外部协调者的关联，也不挂到碰巧活跃的 execution。跨租户默认拒绝；持有历史 ID 或句柄不是读取与控制资格。

业务效果的稳定去重身份与追溯尝试分别表达。稳定身份必须区分同一步多个动作，不能只用调用方关联身份与 step 两项。去重是否能够阻止外部重做，还取决于实际操作契约和接收方能力，本成员不承诺所有调用恰好执行一次。

所有 ID、DurableEvidence 和 Authority 均须在进入本成员的边界验证。身份文本用本包导出的解码函数验证，`Adoption`、`DurableEvidence`、`Access` 与 `Authority` 用结构判定验证，规则见“[身份解码与结构判定](#身份解码与结构判定)”。验证只给出形状：结构相同不代表来自可信拥有者，也不证明对象存在或授予资格。

### Tool 调用关联与控制引用

本节按[已采用的契约同步方案](https://github.com/nemori-ai/omne-harness-lite/issues/551#issuecomment-6370458102)定义 Tool 关联与必要控制记录。并按 [E1/E2 修正采用](https://github.com/nemori-ai/omne-harness-lite/issues/551#issuecomment-6370932728)补齐历史未知与引用失败边界。它不改变 Model 已迁移语义、公共 ExecutionControl 或六阶段的业务含义。A2、T0、生产 Materials 和真实提供者组合仍待实现与验证。

#### 两态登记与完整原请求

`PendingCall` 的 Model 分支保持 `reference: ModelInvocationRef` 与原 ModelPurpose。Tool 分支的 purpose 为 action，共同保存 action、consumption、position 与 fixed，并有以下两态。

| association | 保存的身份 | 允许的生产者视图 |
| --- | --- | --- |
| intent | 无 reference，也不允许旧 call 或 admission 字段 | unresolved |
| associated | 必须保存 ToolInvocationRef，仍不允许旧 call 或 admission 字段 | unresolved、tool-active、tool-result、tool-background |

associated 只证明已知调用身份，不证明受理提交成功。Tool 提供引用及其编解码，Agent 不分配 Tool 业务身份。`tool-active`、`tool-result` 和 `tool-background` 只接受 associated Tool pending。运行输入封闭校验由 Tool 的 `judgeToolInvokeRequest` 拥有，TypeScript 结构兼容不能替代它。

Agent 保存的 `pending.position` 与原请求的 `request.consumer` 按 owner、work、position、purpose 四个字段逐一相等。两个领域分别拥有自己的类型。消费位置不是 ConsumptionId。Agent 为每次逻辑动作保存唯一且稳定的原位置，恢复或替换挂接不重建它。新逻辑动作使用新位置，重发原动作使用完整原 consumer。

`fixed` 指向 `AgentMaterials.preserve` 成功返回的 facts 材料。其 value 是完整原 `ToolInvokeRequest`，schema 是该材料格式的精确 Adoption。恢复解读后以 Tool 的 `judgeToolInvokeRequest` 校验，并核对 consumer 投影。`allowed.request` 与材料输入来自同一次冻结且一致。只存 ToolPart、参数摘要或 consumer 不满足要求，当前 catalog 不能重建原请求。具体 schema 实例与序列化须由后续 A2 采用方案绑定，本节不指定虚构 schema。

AgentMaterials 提供者拥有材料，Journal 拥有 fixed 绑定及 effect intent。先保存完整材料，再共同保存 Tool intent、原位置与 effect intent，随后才能 invoke。材料成功而 Journal 未知时保留材料，沿原 Journal operation 查询。只有可靠排除原写入或全部消费责任终结后才能回收。原意图或引用未知时继续保留，checkpoint 前进不丢材料。

| Tool 登记观察 | 接续责任 |
| --- | --- |
| intent，尚未 invoke | 用当前资格和完整原请求发原 invoke |
| association-unknown | 保留无引用 intent，重复完整原 invoke |
| accepted | 保存 associated、原引用与原回执，lookup 读取当前权威状态 |
| commit-unknown 带引用 | 保存 associated 后 lookup；not-accepted 不排除来源继续签发，沿原 invoke 接续 |
| rejected | 仅确定本次尝试拒绝。只有保留事实证明该逻辑动作没有已受理或未决的较早尝试时才建立 denied 槽位；否则保留原 pending、完整请求、consumer、effect intent 与未决保管责任 |

Model 的受理前引用、not-accepted 判定、原固定输入与 ACK result/evidence 继续沿 Model 契约，不能套用 Tool 身份分配方式。

#### 控制接受与迟到引用

公共 `ExecutionControl` 保持原 call 和原因输入，不增加 ToolOperationRef。Tool control 接受先核对当前所有权与访问资格，再按原 control operation 认回或返回 conflict，之后才为新的 control operation 扫描当前 pending。checkpoint 前进不阻止原 control operation 的接受认回。Tool 中断或后台控制受理时，Journal 在该 execution 的 associated Tool pending 中定位原调用。先按 producer kind 区分，再比较 call。Model 控制同样先区分 kind，允许 Model 与 Tool 使用相同文本 ID。Tool 匹配通过当前租户的公开 `resolveToolInvocationRef` 校验。新的 control operation 遇到匹配 producer kind 的畸形引用返回 invalid，field 为 command.call，reason 为 invalid-tool-invocation-reference；外租户引用返回 denied，action 为 control。无匹配或存在多个不同当前租户调用引用时返回 invalid，field 为 command.call，reason 分别为 no-associated-tool-call 或 ambiguous-associated-tool-call。重复相同引用不算多个不同关联。

Tool control 的 `ControlRecord` 保存原 command、`toolInvocation: ToolInvocationRef` 和 `toolOperation: ToolOperationRef | null`，与 accepted 阶段及原接受结果同次保存。toolInvocation 是受理时的原关联快照。非 Tool control 不允许这两个字段。toolOperation 初始 null 只表示尚无已记录操作引用，不证明操作未提交。checkpoint 改变之后，迟到记录仍用 ControlRecord 的 toolInvocation 校验，不重查当前 pending。

`recordControl` 仅增加可选 `toolOperation` 附件。记录者以 `resolveToolOperationRef` 和 `resolveToolInvocationRef` 校验当前租户及原 call、admission 一致。非 Tool target 不接受附件。同一引用可认回，另一引用返回 conflict，省略附件保留旧值。引用只定位，不授予当前资格，不证明 Tool 内部存在或控制完成。source 仍须由有权记录者提供真实阶段依据。

一条 Agent Tool control 对应一次明确 Tool control 尝试，至多保存一个返回操作引用。明确再次提交 Tool control 须使用新的 Agent control operation，保留旧记录。响应在 Agent 保存引用前丢失时保持 unresolved，不能猜 ID 或自动重发。Tool 当前协议不能按原控制意图恢复丢失引用，新操作成功不证明旧 unknown 完成。

#### Recording operation 与阶段事实

相同 recordControl operation 的完整语义输入不变才认回原结果。有效本租户引用以公开 resolver 解码后的规范身份比较，允许的空白差异不改变语义输入。一个 recording operation 首次未带引用时，后来用同一 recording operation 增加引用必须 conflict。后来取得引用时使用后继的 recording operation，target 仍指原 Agent control。

后继的 recording operation 在阶段事实相同而引用由 null 变为已知时仍是真实写入。Journal 原子保存引用、revision 和后继 recording operation 的结果回执，不返回旧阶段回执。阶段事实未变时不重复发布阶段事件，也不覆盖原阶段回执。相同阶段且无新引用保留既有同事实认回。阶段改变按原规则记录，已 reached 事实不能被不同事实覆盖。引用冲突校验先于阶段认回。

recordControl 按以下顺序判定，不把 ToolReferenceFailure 直接作为 Agent Failure 返回。

1. 核对当前租户、访问和记录资格。
2. 用公开 resolveToolOperationRef 处理所供附件，先拒绝外租户，再取得可用的规范身份。外租户输入先于 operation 与 target 查询返回 denied，不泄露目标身份。
3. 认回原 recording operation 或因完整语义输入改变返回 conflict。此步先于 target、stage 和保留引用校验。原 recording operation 后加附件，包括给非 Tool 控制加附件或提供畸形附件，均为异输入 conflict；外租户仍先 denied。
4. 对新的 recording operation 拒绝畸形附件，再核对 target 存在、target kind、保留 Tool 引用的完整性及身份和操作一致性。
5. 核对阶段适用性，最后执行阶段事实认回或新写入。未供附件时保留旧引用。

| 引用边界失败 | Agent Failure |
| --- | --- |
| 新 recording operation 的附件 resolveToolOperationRef 返回 malformed | invalid，field 为 toolOperation，reason 为 malformed-tool-operation-reference |
| 所供附件属于外租户 | denied，action 为 recordControl |
| 新 recording operation 的有效本租户附件指向非 Tool control | invalid，field 为 toolOperation，reason 为 not-applicable-to-control |
| 有效本租户附件的 call 或 admission 不等于原 toolInvocation | conflict，operation 为当前 recording operation |
| 已有 toolOperation 与有效本租户新附件为不同规范操作身份 | conflict，operation 为当前 recording operation |
| 原 recording operation 的完整语义输入改变，包括增加附件或畸形附件 | conflict，operation 为该 recording operation；外租户先 denied |
| 新 recording operation 的 target 不存在 | 既有 invalid，field 为 target |
| 新 recording operation 读取的原 toolInvocation 畸形 | unavailable，owner 为 AgentJournal，diagnostic 为 invalid-retained-tool-invocation |
| 新 recording operation 读取的原 toolInvocation 属于外租户 | denied，action 为 recordControl，不返回外租户细节 |
| 新 recording operation 读取的已有 toolOperation 畸形，或其 call、admission 不等于原 toolInvocation | unavailable，owner 为 AgentJournal，diagnostic 为 invalid-retained-tool-operation |
| 新 recording operation 读取的已有 toolOperation 属于外租户 | denied，action 为 recordControl，不返回外租户细节 |

保留引用损坏是提供者不变量失败，不能归为调用者 conflict。原 recording operation 认回之前不检查保留引用。阶段不适用仍按既有 invalid 映射。上表的失败与阶段不适用的 invalid 不改变原记录或 revision，不调用 Tool，也不创建阶段事件。持久拒绝是例外：新证据与已成立阶段或原终结前提矛盾时，Journal 保存审计并推进一个 revision，见“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)”。这些边界不授予修复记录或绕过资格的权限。

控制接受与记录均共同保存新增字段和原操作结果。现有内存 Journal 只在其原子 apply 边界迁移，不证明生产耐久性。本节只闭合新增引用所需记录。认回、终态与事件的一般规则见“[判定次序与失败映射](#判定次序与失败映射)”“[原操作认回与恢复](#原操作认回与恢复)”与“[六个阶段](#六个阶段)”。F0 多前台 Tool 逐调用尝试与总取消记录的对应机制，继续由后续控制设计与实现承接。不得把单个 ToolOperationRef 塞入总 cancel 记录。

#### Tool 交付解除未知

`releaseDelivery` 未知且原 ToolOperationRef 仍可取得时才查询原操作。可靠否定后可明确重入，released 返回原生产者耐久回执。lookup.delivery 可认回当前释放。引用丢失且 lookup 未证明释放时保持未知，pending 不排除旧操作或迟到提交。本节不新增跨重启保存 release 操作引用的协议。


### 租户与作用域绑定

runtime 在创建时绑定租户和安全作用域。这两项与实例身份、精确采用一起构成身份绑定，不是可序列化配置：配置不能覆盖它们，改变其中任何一项都必须创建新实例。

每次操作的 Access 显式携带主体和租户。runtime 核对 Access 的租户与自身绑定一致，也核对被操作的 execution、句柄、事件和登记属于该租户。execution 身份只在租户内唯一，规则见“[执行身份的范围](#执行身份的范围)”。任一项不一致都按跨租户拒绝处理：返回 denied，不区分对象不存在与无权访问，不返回对象的内容或状态。

缺少租户的操作返回输入无效。本成员不从 runtime 绑定、运行态、Context、历史标识或全局当前状态推断、补全租户。身份参数不是授权证明：主体的当前资格由注入的 AgentAccessCheck 核验，规则见下一小节。撤权后的新动作在实际发起处被拒绝，已经合法发出的调用沿原身份查询和控制。目录键是显式租户加实例身份，跨租户的 resolve 与 connect 同样返回 denied。

### 主体资格核验

AgentAccessCheck 是必需的注入依赖，由授权领域的适配器实现。Agent 不自己解释组织、角色或权限模式。

每个公开操作在实际执行处调用一次 `check`，传入本次的 Access、操作名和作用目标。核验在租户核对之后、任何持久写入或外部发出之前进行。结果按下列规则处理。

| 结果 | 操作的处理 |
| --- | --- |
| allowed | 操作继续，后续的租户、围栏、修订号和挂接核对照常进行。allowed 不代替这些核对 |
| denied | 操作返回 denied，不写入任何状态，不区分对象不存在与无权访问 |
| unavailable | 操作返回 unavailable，不放行，不写入任何状态。调用方可用同一操作身份重试 |

核验结果只对这一次操作有效。Agent 不缓存 allowed，不用较早的 allowed 放行后来的操作。所以撤权在下一次实际执行处生效。已经合法受理的操作不因后来的撤权被回滚，已经合法发出的 Model 或 Tool 调用沿原身份查询和控制。

宿主的登记操作（reserve、publish、withdraw）由宿主核验，目录操作（resolve、connect）由目录核验，两者都在实际执行处以同一端口核验。宿主恢复入口提供的执行视图，以及长期保管者直接调用的执行记录操作，同样由宿主的长期执行记录适配器在实际执行处以同一端口核验，传入与公开操作相同的操作名。这里的执行记录操作包括 query、load、reconcile、detach、终态后观察登记、commitSettlement、取消路线上的 prepareFinish 与 tryFinish（操作名 settle）、recordHandoff（操作名 record-message-handoff），以及经恢复入口发生的 read、events、acknowledge、submit 与 control。commitSettlement 的操作名按变体选择：establish-cancellation 与 judge-cancellation 用 settle，migrate-cancellation 同时用 settle 与 migrate-cancellation，record-card-reconciliation、record-legacy-return 与 record-tool-association 用 reconcile，见“[commitSettlement 的变体](#commitsettlement-的变体)”。结果接收方在写 `received` 条目之前，以操作名 receive-result 在实际执行处核验推送主体，见“[结果接收](#结果接收)”。消息准入提供者在 lookup 与 exclude 的实际执行处分别以 read-message-handoff 与 exclude-message-handoff 核验，不论调用方是谁；prepare 的直接调用也由它以该分支的操作名核验，runtime 在已核验的公开操作之内调用 prepare 时不再次核验。宿主、目录、长期执行记录适配器和消息准入提供者以静态依赖取得 `agentAccessCheck` 服务，工厂得到的是同一个服务实例。取得方式和每个操作名的核验位置见 [Cordis 页](../agent-cordis-contract/docs/cordis.md#主体资格核验的调用位置)。

runtime 的协调角色在已核验的公开操作之内调用 Journal 端口时，不再次核验主体，只核对挂接、围栏、修订号与保管资格。“不再次核验”只限定这一种调用，不适用于上一段列出的直接调用。推进中途主体被撤权，由动作准入在 Model 或 Tool 动作发起处负责，不由主体资格核验承担。

`AgentAccessOperation` 含 read-message-handoff、record-message-handoff 与 exclude-message-handoff：第一个核当前主体对原逻辑请求的读取资格，后两个使用原 execution 的当前保管或收束资格。它们是给闭合联合加成员的破坏性改动。`AgentAccessTarget` 有四个分支：scope、instance、execution 与 input-entry。execution 分支只含 execution，不含 instance，它是逻辑 execution 目标；input-entry 分支含 execution 与原入口操作 O。Access 显式提供 tenant。这项形状不更改任何操作的权限名、授予规则或 Authority 围栏。全部 execution 目标的构造者与授权消费者使用同一个逻辑目标：submit、control、read、events、acknowledge、resume、takeover、query、load、reconcile、detach、record-terminal-observation、settle、migrate-cancellation 与三个消息准入记录操作。原绑定的 scope、精确采用与关联由可信 resolver 读取，授权实现可以核这些真实关系，不要求调用方提供旧实例充当当前实例，也不以当前挂接是否存在作为 submit 的资格前提。

| 操作路径 | 当前资格与目标 | 另核的条件 |
| --- | --- | --- |
| invoke 与首次 open | invoke，真实 instance | 真实运行绑定、原 scope 与 definition、可用槽、适用 grant、协调路径的原来源与关联，以及 H |
| input.submit 与 Journal.submit | submit，原 execution | 原 execution 归属、当前受理前提、协调路径的原来源、分配与模式、H 与输入身份。不要求 runtime、advance、grant 或槽 |
| 外部输入的 H lookup | read-message-handoff，input-entry | 原请求归属与当前读取权。既可查 invoke 的受理前记录，也可查 submit 的 |
| execution 的 H lookup、Rh 与 exclude | read-message-handoff、record-message-handoff 或 exclude-message-handoff，原 execution | 原 P、结果或取消的可信来源。不能用旧 advance 当资格 |
| 原 O 的 query 与 load | query 或 load，原 execution | 当前读取资格。没有 runtime、resume 或旧挂接有效的前提 |
| commitSettlement 的候选、判断与迁移变体 | settle，原 execution；迁移变体另核 migrate-cancellation | 取消授权、expected 与当前取消的适用性。取消 control、旧 Authority、旧 allowed 或调用者给出的 source 都不能代替资格 |
| 取消路线上的 prepareFinish 与 tryFinish | settle，原 execution | 取消授权、expected、候选与已发行的 obligations。取消授权不授予这项资格 |
| commitSettlement 的卡片对账、迟到返回与 Tool 关联登记变体 | reconcile，原 execution | 原责任、真实来源与当前读取资格。不要求旧推进权或旧挂接有效 |
| resume、takeover、detach 等既有 execution 操作 | 各自原操作名，原 execution | 各方法仍核实际实例、Authority、takeover 或交接条件，不从目标去掉 instance 推出免检 |

身份签发按已接受的 [IC-18](../../../docs/architecture/cordis-integration-conventions.md#ic-18) 先核原主体、目标租户与原工作关系，实际代行者不得用服务自身的高权限替原请求放行。原 qualification、origin、Ki、H 或 grant 都不能替代当前资格。

`AgentAccessDecision` 的 unavailable 诊断文本与 Failure 的诊断文本受同一限制：只写身份与状态，不嵌入消息正文、秘密或附件地址，也不携带私有权限块。

主体资格核验与动作准入是两件事。动作准入判断某个 Model 或 Tool 动作能否发起，归扩展与工具准入的规格，本端口不替代它。两者也不合并为一个端口。

## 并发与提交

同一 execution 同一时刻至多一个有效执行挂接。独立调用路径由 Journal 提供者保证，外部协调者路径由协调者授予的推进资格依据加 Journal 的条件提交共同保证。本成员在每次影响推进、发起或消费时核对相应资格。重复通知不自动授权新 execution 或新执行挂接。已被取代的挂接不能发新工作；原生产者仍可保存真实迟到结果。

同位置同动作扩展有序执行，不同动作可并行判断，整批判断齐备且所需卡片均按原规则处理完成后才发获准部分。需要共同成立的资格检查、结果承接和状态提交由具体操作定义原子边界，普通通知不能模拟它。

写入返回未知时按原操作身份查询，不能直接重复可能产生效果的调用。操作身份由稳定要素确定派生：租户、execution、原持久前驱 revision、转移种类与原帧中的稳定槽位，崩溃前后对同一帧与同一转移派生同一身份，不用新的随机身份重试。派生规则见[机制页](../agent/docs/architecture/mechanisms.md#操作身份的确定派生)。读取或查询失败保持未知，不等于不存在。恢复已确认的事实不依赖结束记录必须成对出现。

### 判定次序与失败映射

每个带操作身份的写操作按下列次序判定，返回第一个成立的结果。错误名称是 Failure 的种类，本节不新增 Failure 成员。各操作的精确映射见“[逐操作及输入分类](#逐操作及输入分类)”。

1. 先校验请求形状、租户与本次操作的资格。跨租户或当前资格拒绝返回 denied，核验不可用返回 unavailable。两者都不披露原对象或原操作是否存在。
2. 通过核验后，原 operation 配同语义输入认回原结果，配不同语义输入返回 conflict。原操作结果未定时沿原 operation 查询，不以新的生命周期检查代替它的历史结果。当前资格拒绝先于历史结果认回；认回原结果不恢复旧推进权。
3. 只有本契约明确允许的同事实认回进入“[原操作认回与恢复](#原操作认回与恢复)”的规则。不同 operation 的普通 commit、attach、control 与 tryFinish 不因内容相似而认回。输入身份、确认前缀、既有观察与控制阶段事实各保留自己的等值约束。
4. 对真正的新、需要推进授权的写入，已 superseded 的 Authority 返回 stale-advance。带推进授权的 prepareFinish 也属于这类写入。这项判定先于 ended 与 expected 过期。它不适用于合法的保管或观察操作。
5. 没有上述取代时，对 ended execution 的新 commit、新 detach、新 prepareFinish、新 tryFinish 返回 terminal。attach、submit 与新 control 的 terminal 按各自条款；commitSettlement 的 terminal 按“[commitSettlement 的变体](#commitsettlement-的变体)”的判定顺序。提供者不得先返回 changed，诱导调用方持续重算一个已被禁止的业务写入。
6. execution 尚未 ended 且当前资格成立时，expected 或候选绑定已失效返回 changed。这项检查不能用分离的预读绕过最终权威排序。tryFinish 的 expected 或候选失效以 FinishResult.changed 表达，不以 Failure.changed 代替成功结果联合。
7. recordTerminalObservation 指向不存在的终态后观察项，返回 invalid，field 为 passage。终态不匹配或终态尚不存在返回 invalid，field 为 terminal；采用不匹配返回 invalid，field 为 implementation。同一项配不同 observed 返回 conflict。读取失败或投影不全返回 unavailable，不推成该项不存在。终态尚不存在时不承诺等待后同一请求自动成立。
8. recordControl 的阶段不适用于原控制时返回 invalid。阶段适用、但请求在 ended 之后新建立意图、撤销资格或其他终态前效力时返回 terminal。“[六个阶段](#六个阶段)”列出的三种合法迟到责任阶段仍可保存。与已成立事实或原终结前提矛盾的证据返回 conflict，并按“原操作认回与恢复”的持久拒绝规则保存审计。
9. 当前保管、观察或处理资格失效返回 denied，不因旧挂接失效而返回 stale-advance。失去业务资格后的新 detach 返回 denied；已成立的原交接仍按第 2 条认回，不写新的业务位置。

优先级固定为：当前资格拒绝先于历史结果认回；真正新推进的 stale-advance 先于 ended；ended 先于 expected 过期。

### 原操作认回与恢复

查询结论 committed 表示该 operation 的成功结果已可靠固定，包括本契约允许的合法认回。它不只表示该 operation 新建立了 execution 事实。

原操作 A 已建立某项事实，合法的新操作 B 认回同一事实并成功，而 B 的响应丢失时，按下列规则恢复。

1. B 的 CommandReceipt.operation 为 B，execution 为原 execution。revision 是 B 所认回事实的版本对应的修订，不是查询时的最新 revision。
2. B 的 receipt.evidence 证明其合法认回及来源。Journal 保存原事实的建立操作、固定版本与原依据，不把 A 的事实改署为 B 新建立。消费者不解析来源。
3. B 的请求语义绑定、成功回执、原方法的完整结果与来源在同一权威提交固定，之后才答成功。query(B) 与原方法的重试读同一记录。只增加认回索引不改变 execution 快照，不推进 revision，见“[执行修订](#执行修订)”。真正新增责任、事件或其他 execution 事实时按普通合法 mutation 处理并推进 revision，不能伪装为认回。
4. 每次调用先核当前租户与主体资格，再检查操作与适用的认回资格。同 B 异语义输入 conflict。相同 B 的已成功原结果在新写入的生命周期与 expected 检查之前返回。
5. 原 A 的结果保持不变。B 的结果不随当前确认、控制阶段或 revision 更新而改写。query(B) 返回 committed 后，完整结果的重试暂不可用或撤权时只保留成功事实，等待合法恢复，不另造新的 operation 重做。

需要原方法的完整返回时，调用方用原方法、B 与原语义输入重试，从同一持久结果记录取回。detach 返回原交接依据；open 与 attach 的原操作恢复原回执与 Authority，恢复不让旧 Authority 重新有效。query 只读，不写认回，也不借查询修复出一次认回成功。仅凭 operation 身份的第三方仍可 query 与 load；本契约不承诺仅凭身份重建原方法的全部参数。

认回索引规则的适用范围如下。认回的准入仍由各方法的现行规则与“[判定次序与失败映射](#判定次序与失败映射)”决定，本节不放宽终态、历史阶段或资格边界。

| 路径 | 适用范围 |
| --- | --- |
| submit | 同输入身份、同受理内容的认回。不借相同正文改写原来源、优先级或新增分配 |
| recordControl | 同控制、同阶段、同状态与同来源的既有合法事实认回。unresolved 到 reached 是新事实。新操作遇到已被后继阶段取代的历史事实时不认回：按“[判定次序与失败映射](#判定次序与失败映射)”第 3 条作为新写入，以当前阶段事实判定，结果取逐操作表 recordControl 行已有的失败；与当前阶段或原终结前提矛盾时按“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)”保存审计。原 A 的结果仍可恢复 |
| recordTerminalObservation | 既有固定观察的同值认回。缺失观察项或异值不能靠索引变合法 |
| detach | 目标已 detached 时认回原交接依据，不创建新位置、挂接或责任。superseded 的新 detach 沿既有拒绝，原操作的成功仍可认回 |
| acknowledge | 相同确认，以及被已确认前缀覆盖的 through。不回退，不替换原前缀的推进依据 |
| open、attach | 只恢复原 operation 的完整结果。不新增不同 operation 的同 payload 创建或接管认回 |
| control、commit、tryFinish | 不新增跨 operation 的等值请求去重。新控制身份是新控制；相同 checkpoint 或终态结论不证明同一次事实 |
| prepareFinish、commitSettlement | 只恢复原 operation 的完整结果，不新增跨 operation 的等值认回。迁移记录与关联登记操作的恢复者经稳定派生得到同一 operation，见“[commitSettlement 的变体](#commitsettlement-的变体)” |
| recordResult | 沿原操作恢复及原保管、处理规则。不新增 transfer 为 none、custody 或 processed 的跨 operation 去重；不以相同 payload 跳过共同提交或当前资格 |
| reconcile、quiesce、宿主登记 | 各自协议保持，不改成通用的不可变结果模型 |
| query、load、read 等读取 | 不写认回 |

找到原事实但尚未可靠保存 B 的结果时，不能答 B 成功。B 已稳定保存而响应丢失时，query(B) 必须 committed。查不到 B 不等于 excluded：排除必须证明原写入及延迟提交不能发生，否则为 unknown。“没有新的 execution 事实”不是排除依据。提供者要支持排除之后的受控重新受理时，须在其方案中证明怎样区分新受理与旧延迟请求、怎样序列化查询与重试；只命名一个私有代次不是证明。

#### 查询的四种结论与持久拒绝

AgentExecutionRecovery.query 与 Journal 的同形查询返回四种结论。committed 带原 CommandReceipt。rejected 带原固定的 conflict、耐久审计依据与 revision，它不是成功回执。excluded 带排除依据，必须排除该 operation 的全部写入与迟到写入，不只是“没有当前指针”。unknown 表示未知。query 不重跑原 mutation、判断实现或生产者。消费者对四种结论逐一分支：不把 rejected 落入成功、排除或“已解决”的默认分支，也不把它转成 unknown、excluded、committed 或外部协调者一侧的“未提交”结论。历史的成功记录保持原含义；无法证明拒绝分类的旧记录保持 unknown 或 unavailable，不推测补录。

rejected 只来自 recordControl：新证据与已成立阶段或原终结前提矛盾时，Journal 在同一次提交中按该 recordControl 的原 operation 固定语义输入、完整原请求与来源、目标控制与阶段、被冲突的已成立事实或终态处置、被拒绝的事实、固定的 conflict 结果与审计依据，并推进一个 revision。它不推进控制阶段、不施效、不发业务事件、不改终态。其他 conflict、invalid、denied 与 terminal 不进入这项审计。

- 审计事务确定提交后，原 recordControl 才返回固定的 conflict。提交未定返回 commit-unknown，保留原 operation，不先拒绝再尽力记日志。
- 原 operation 已有成功时认回成功，不改成拒绝。已有持久拒绝、同语义输入时，原方法认回原 conflict，不增 revision 或事件；异输入 conflict，不覆盖旧记录，也不新造审计。
- 新的 recordControl operation 先完成适用的身份、目标与来源校验，再在权威顺序中判断矛盾。来源保留在审计中，不并入 ControlStageFact。
- 回执丢失后对原 operation 的 query 为 rejected，表示审计已存在且该 operation 没有成功的阶段写入。恢复者保留拒绝及其责任，不当作成功的控制、不另发业务、不换号绕过 unknown。确定 excluded 则审计、成功写入与迟到写入都不存在，不因此授权复用该 operation。撤权阻止当前主体披露与认回，不删除责任。
- 保留期覆盖原请求、被冲突依据、结果与审计。

### 执行修订

一个 revision 标识该 execution 的完整已提交事实视图。第一次 open 建立初始 revision，编码与数值起点不作规定。一次原子 mutation 建立一个或多个新 execution 事实时，恰好分配一个后继 revision。revision 严格递增、不复用、不要求数值连续。不能只凭 checkpoint 字节相等判断没有新事实。

新事实包括输入与输入边界、控制阶段、有效挂接与交接、checkpoint 与执行状态、效果意图、事件、结果责任、确认进度、终态后观察、终结责任清单的发行与处置，以及属于本次 Agent mutation 的共同事实。持久的未定台账成为快照可见事实时，它的变化同样分配新 revision。传输层暂时不知结果本身不制造 execution 事实。

所有快照字段、事件与原成功结果在相同权威提交中成立。事件序号逐事件连续，revision 每提交一次，二者不混用。load 可以返回并发写之前的一份完整视图，但不混合修订，也不跨修订分页；不能完成一致读取时返回 unavailable。历史快照的留存不是承诺。

commit、prepareFinish、tryFinish，以及 commitSettlement 的候选、迁移与判断变体，在提交点按完整 revision 核对 expected。attach 的恢复证明所绑定的 revision 同样因任何新事实失效。无 expected 的窄记录操作在当前事实之上合入自身变化，不能用先前读取的整份快照覆盖别人的写入。确认等无事件更新可能使 finish 或接管重读，这是明确接受的保守冲突。已发行的终结责任清单是否仍适用另按责任投影判断，不按发行 revision 判断，规则见“[终结责任清单](#终结责任清单)”。新评估使用新事实；原结果未知的操作仍保留原身份与语义输入。

同一操作同一语义输入认回原成功结果，不再次写事实，不因当前 revision 已更新而改成新提交。同一操作不同语义输入 conflict。恢复先核当前读取或认回资格；旧 Authority 的返回不让它重新有效。允许的新 operation 同事实认回只增加查询索引、不改变任何 execution 事实时，不分配新 revision，该索引不改 history、unresolved 或其他快照字段。

下表的“新修订”指一个新 revision。原操作已成功的同值重试返回原结果，无新修订。拒绝与无写入的 changed、blocked 不产生成功事实；结果未知不是无写入的证明。

| 操作 | 首次建立的新事实 | 认回与无变化边界 | 事件与终态 |
| --- | --- | --- | --- |
| open | 初始输入、checkpoint、资格与挂接：初始修订 | 不新增跨 operation 的创建认回；相同内容不授予第二次创建 | 无事件 |
| attach | 每个真正的新挂接、围栏或转换接续：新修订 | 新 operation 的有效接管是新的权力转换，不按 recovery 字节认回 | 无事件；原结果的恢复不重新激活旧权力 |
| detach | active 到 detached 及位置与责任交接：新修订 | 已 detached 只认回原交接；superseded 仍 stale-advance；失去资格不写新业务位置 | 无事件 |
| submit | 新输入、可靠输入边界及 Ki、H 与 original 的关联：新修订 | 同输入身份同内容认回；recognize-input 只固定 B 的认回结果，不新增 H 或 revision；不忽略其他既有输入约束 | 无事件；input-taken 由后续 I0 保存；ended 后新输入 terminal，原已成功 O 的认回先于此检查 |
| control | 新控制身份及 accepted 事实：新修订 | 不同 operation 的相同命令文本是不同控制，不建立隐式去重 | accepted 事实、control 事件与原结果原子保存 |
| acknowledge | 确认前缀推进等新的可见确认事实：新修订 | 相同确认或较低 through 的既有认回不回退，不产生新前缀 | 无事件，不改 checkpoint；不越过已发出前缀 |
| recordResult | 新保管、处理或释放责任事实：新修订 | 逐项身份、版本、消费位置、transfer 及确认依据沿既有规则；无新责任只认回 | 无事件、输入、效果或 checkpoint 变化；合法责任可在 ended 后登记 |
| recordControl | 新适用阶段、unresolved 到 reached；阶段相同而 toolOperation 由 null 变为已知；矛盾证据的持久拒绝审计：各为新修订 | 同控制、阶段、状态与来源的认回受既有事实身份约束，不把矛盾证据当同值 | 终态前阶段事实与 control 事件原子保存；补引用与持久拒绝审计不发事件；终态后只限三种合法迟到责任事实，无新事件或效果 |
| recordTerminalObservation | 已固定待观察项完成：新修订 | 同值重复认回，异值冲突；不临时添加原本不存在的观察责任 | 无事件、效果、输入或 checkpoint 变化 |
| prepareFinish | 责任清单的发行与 `FinishIntent.obligations`：新修订 | 同 operation 同输入认回原清单 | 无事件，不改 checkpoint |
| commit | 新 checkpoint、状态、转换标记、效果、事件、共同贡献，以及 handoff 的 prepare、resolve 或 retire：新修订 | 相同 checkpoint 仍可能是新转换；无任何新 execution 或参加者事实才属于无变化。无变化的 commit 不推进 revision，回执的 revision 是提交时的当前 revision，不发事件 | 原子保存允许的事件；resolve 的 message 事件与真实历史同次成立；不能创建 ended |
| recordHandoff | 原准入结果或排除及其责任合入 execution 的公开投影：新修订。Ja 先保存同一 H 之后 Rh 首次成功仍是新修订 | 同 operation 同完整输入认回原结果，快照不变时零新修订；异输入 conflict | 无事件，不改 checkpoint、终态或候选；ended 后仍可调用，见“[准入结果保管](#准入结果保管)” |
| tryFinish | 终态、最后事件、固定观察责任及原结果：新修订 | changed 与 blocked 不产生新事实；不同操作不能据相同结论覆盖终态 | 只有本操作创建 ended |
| commitSettlement | 该变体允许的保管或判断记录与责任处置：新修订 | 同 operation 同输入认回原结果 | 无事件，不改 checkpoint |
| load、inputs、read、query、订阅等读取 | 无 | 不借读取修复或改写快照事实 | 不推进 revision |

output.emittedThrough 随事件的耐久提交建立；出口把既有事件交给读取方，不改写同一 revision 下的这个字段。确认不自动结清事件保管或其他结果责任。合法 ended 之后的新结果、观察、保管登记与合法迟到控制事实仍分配新修订，但终态结论、checkpoint 与最后事件不变。不能先违规结束，再用迟到事实补合法性。

### 提交参加者协议

提交参加者是 Agent 之外、需要与 Agent 的一次提交共同成立自己事实的一方。常见的有两类：外部协调者在受理输入和结束工作时登记自己的业务事实，Context 的参加者在压缩转换时保存压缩覆盖范围与保留名单。独立调用者没有提交参加者，Agent 的 Journal 提供者单独保护输入受理和执行结束。

共同提交只发生在一个权威提交序列内：参加者的事实与 Agent 的事实由同一个提供者在同一次提交中保存，提交成功才返回可继续的回执。本规格不承诺把全部端口放进一个跨领域事务。两次独立写入、事件队列和回调都不能代替共同提交。提供者为每种 CallerCommit 共同提交声明它能兑现的参加者，Agent 只在声明范围内发起。

参加者对一次共同提交只有四种响应。

| 响应 | 含义 | Agent 一方的结果 |
| --- | --- | --- |
| 参加 | 参加者的事实与 Agent 的事实在同一次提交中成立 | 提交成功，返回回执 |
| 失败 | 参加者当前不能完成自己的部分，任何一方的事实都没有保存 | 返回 unavailable，可用同一操作重试。结果无法确定时返回 commit-unknown，先按原操作查询 |
| 冲突 | 参加者的当前事实与这次提交的前提不一致，例如已受理的新输入先成立，或参加者一方的终态先成立 | 本次提交不成立，返回 changed 并给出依据，Agent 重读事实后重新求值。冲突的原因是本次提交所用挂接的推进资格已被取代或撤销时，返回 stale-advance，不返回 changed。同一操作身份配上不同输入，另返回 conflict |
| 不支持 | 参加者或提供者不能兑现这种共同提交 | 返回 unsupported，不保存任何一半 |

参加者一方的终态先成立时，Agent 允许参加者先记录自己的终态，再以已保存的取消依据收束 execution。此时 Agent 只认回原取消，不重新裁定，也不恢复业务推进。“不重新裁定”只指取消本身是否有效。取消路线照常走：establish-cancellation、judge-cancellation、prepareFinish 与 tryFinish 都不省略，规则见“[取消判断与路线](#取消判断与路线)”。

Journal 绑定声明固定的协调模式 `capabilities.coordination`，取值为 standalone 或 coordinated。工厂配置 `coordination` 与它同形，见[通用工厂](../agent/docs/public-api.md#工厂配置)。模式描述当前注入的 Journal 绑定，不描述底层提供者能创建的全部绑定：同一提供者可以提供不同的绑定，每个绑定在使用期内不可变。没有隐式的 standalone 默认。`participants` 与 `jointCommits` 只描述 CallerCommit 的外部共同提交种类：空的 participants 不表示没有输入与终态的协调能力，非空的 participants 也不证明协调协议齐全。

coordinated 绑定必须支持 open、attach、submit 与 tryFinish 的完整协议，不能以部分能力冒充。某个 execution 首次建立时固定它的模式与不透明的外部关联。后续写入核对该关联，不允许经另一个 standalone 绑定降级。模式迁移不在本契约内。

| 操作 | coordinated 绑定在 Agent 成功提交中的额外义务 |
| --- | --- |
| open | 核对原协调者的输入来源、适用的推进资格依据与关联，把必要的分配、资格与协调事实与 Agent 的初始内容、挂接和原结果共同保存 |
| attach | 在同一次接管提交中核对当前外部资格、原关联、恢复或接管条件及适用的推进资格效果，不凭旧回执恢复旧挂接的权力 |
| submit | 在同一次受理提交中核对原来源与分配，保护已受理内容与 execution 归属，不增加推进资格参数 |
| tryFinish | 在同一次条件提交中核对外部已受理未交入的输入与适用的终态或取消事实，共同建立对应的终结贡献，不只比较 Agent 本地 revision |

协调者可以先在自身的可靠边界受理输入；open 与 submit 不要求把最初的上游受理搬进 Agent 的事务。两次独立写入、回调或队列都不能代替所要求的共同提交。外部终态先成立时沿已保存的取消路线收束，不新增普通完成的旁路。Agent 不新增外部协调者的数据类型、事务句柄或回调登记。外部协调者的适配拥有不透明依据的解释、绑定恢复与共同存储对象的映射；它尚未提供映射时，只能采用 Agent 的要求，不能声称已合格。Agent 自有的主回复提交不因此变成外部参加。

推进资格依据 grant 不证明提供者支持协调能力。非空 grant 是外部协调者的推进资格依据，非空输入来源依据是外部受理来源，两者都必须走所要求的共同核对。standalone 绑定只承接独立路径：收到非空 grant 或非空来源依据时在写前返回 unsupported，不把这些请求当作独立输入保存；当前资格核对失败仍返回 denied。coordinated 绑定缺少其授予规则要求的 grant 时返回 denied，不能以空 grant 绕过外部核对或降级既有 execution 的模式。standalone 配置加 standalone 绑定可独立 invoke、submit 与 finish；coordinated 配置加 coordinated 绑定在上述四处强制协调。两种模式都可以有空的 participants。

Agent 拒绝不合格的装配。声明的形状是 `AgentJournal.capabilities`，见[公开接口页](docs/public-api/README.md#执行记录与调用方交接端口)，装配会用到的共同提交种类由工厂配置 `jointCommits` 给出。工厂在创建 runtime、登记或写状态之前核对两处 `coordination` 严格相等，并对 `jointCommits` 的每一种比对 `participants`。缺声明、模式不匹配或缺一种都返回 unsupported，不创建 runtime，也不保存任何状态，不退化为只比较 Agent 本地队列。运行时遇到未声明的提交种类同样返回 unsupported，并且在保存任何状态之前返回。Journal 的每次直接调用也在写入前核对绑定与所需支持，在原子提交点核对当前资格、围栏与条件。权限检查先于存在性、模式与原回执的披露。实际不能兑现共同提交返回 unsupported，暂时的依赖故障返回 unavailable，持久结果不明返回 commit-unknown，参加者事实推翻候选沿既有 changed。外部输入关闭与动作发出围栏是两项保护，前者不授权新的 Model 或 Tool 发出。

`received` 条目与材料的共同提交遵循同一提供者、同一权威提交序列及失败不保存任何一半的约束。它由独立的 `AgentReceivedCommits` 端口声明，不扩展上述只表达 `CallerCommit` 的参加者声明与工厂配置。能力、认回和排除规则见“[接收共同提交](#接收共同提交)”。

## 持久性与交付责任

已确认保存的业务进度、扩展结论、有效参数、卡片、答复、结果和账目在普通进程崩溃、操作系统崩溃及断电后仍可读取和解释。可重建缓存不另立事实权威；介质或整机物理损毁不自动纳入普通恢复保证。

Tool 生产侧交付责任的解除（英文 ACK）有两条路径，名称与条件对应 Tool 契约的[可靠交接与处理的两条路径](../../tool/tool-contract/SPEC.md#可靠交接与处理的两条路径)。

- 先保管后处理：合法消费者把内容或有效可恢复引用、原身份、原消费位置与后续责任经 custody 交接保存，返回 saved，由生产者解除。
- 先处理后保存完成依据：合法消费者完成必要处理，经 processed 交接保存完成依据后解除。处理须符合原生产消费契约，不强制另存可重领全文。处理未完成、完成依据保存未知或当前资格失效时不解除。

尚需后续处理时，消费者必须保留足以接续的内容和责任。Model 结果由结果接收方按“[接收共同提交](#接收共同提交)”一次保存完整材料、条目和原消费责任。结果接收方返回 saved 之后，Model 以原 evidence 沿专用 ACK operation 自己取得 ACK，Agent 一侧不执行 Model 的 ACK。整项调用真实收场等解除前提仍归 Model 契约，单次发出失败不满足这一前提。Tool 取得 saved 后按自身协议释放 delivery。生产者的解除回执怎样进入 Journal 尚未闭合，见开放问题 [AGENT-M05](../agent/docs/architecture/open-questions.md#agent-m05)。解除生效后，接续从消费侧保存的数据继续，不要求 Model 重新提供完整副本。工具结果按自身保留契约，不能借 Model 的交付责任解除删除全文。

Model 的 ACK 未知时由 Model 沿原 query 认回，Agent 不再调模型，也不再次处理同一份结果。Tool 仅在原操作引用可取得时 queryOperation；引用丢失且 lookup 未证明释放时保持未知，见“Tool 交付解除未知”。后台占位只解除占位这一版本的前台交付，最终结果以同一 consumption 到达后按两条路径之一解除，该消费关系才闭合。保管者的更替见[机制页](../agent/docs/architecture/mechanisms.md#交付责任解除的两条路径与保管者更替)。

已拒绝的模型回复或工具结果仍保持真实执行记录。它们未形成协作消息不表示原数据、费用或效果可丢弃。推进者死亡也不免除保管责任。

## 取消、退出与结构变更

仅 Agent runtime 退出或释放句柄，不取消独立 Model 或 Tool 执行。等待时可以挂起或交还资源，不把等待本身当故障，也不生成新工作。

收到有效取消后，本成员停止该目标的新推进，按原事实交接未收尾责任。外部协调者保存自己的业务意图和终态。协调者的业务取消范围可以不同于 Agent 执行的取消，它解除协调者自己的等待，不以所有物理执行停止为条件。取消后实际效果与费用如实保留，不报告 disposer 已撤回外部行动。

结构换代消费 assembly 的有效候选与交接决定。原调用、判断和卡片保留原语义，尚未发起动作核对当前约定与资格。纯数据更新不机械替换 Agent runtime，实例替换也不暗换原调用输入。

### 四种控制

控制分为四种。每一种有自己的作用对象和结果，任何一种都不隐含另一种。

| 控制 | 作用对象 | 效果 | 不做的事 |
| --- | --- | --- | --- |
| 中断（interrupt） | 一个具名的模型或工具调用 | 请求生产者中断该调用。工具调用另可请求转后台。模型调用被中断后，该响应中尚未发出的工具建议不执行 | 不终结 execution，不取消其他调用，不撤销执行挂接 |
| 取消（cancel） | 一个 execution | 停止该 execution 的新推进，形成 cancelled 终态候选，并请求中断该 execution 仍在前台的调用 | 不停止已确认转后台的工具、同一 runtime 的其他 execution、其他租户的工作，以及任何不属于该 execution 的调用 |
| 暂停（suspend） | 一个 execution 的推进 | 保存接续并撤销当前执行挂接，execution 进入 suspended，可由合法的接手者恢复。撤销挂接的次序与其间崩溃后的恢复见下文 | 不终结 execution，不请求任何生产者停止 |
| 停用（quiesce） | 一个 runtime 实例 | 新的 invoke 与 resume 返回 unavailable，把在途 execution 交接后撤销登记与资源 | 不取消 Model 与 Tool 的独立执行，不终结 execution |

中断类控制的公开形状是 `interrupt-model`、`interrupt-tool` 和 `background-tool`。取消与暂停是 ExecutionControl 的 `cancel` 与 `suspend`。停用是 AgentRuntimeControl 的 quiesce 操作，不是 ExecutionControl。形状见[公开接口页](docs/public-api/README.md#托管协调与运行实例)。

detach 与 quiesce 的交接行为，以及撤销登记的结果，由“托管协调与运行实例”定义。本节定义控制的种类、范围和阶段。

暂停时记录控制意图与解除挂接的先后次序，以及两步之间或解除挂接前后崩溃时的恢复，已由 [#730](https://github.com/nemori-ai/omne-harness-lite/issues/730#issuecomment-6443023419) 采用。写回本契约之前，本页凡写到暂停撤销挂接或进入 suspended 的地方，都不承诺这部分行为。实现不得按某一种次序或恢复方式声称已兑现本契约。

### 插队

插队不是第五种控制。它是一项 urgent 输入沿原 execution 受理之后，Agent 对当前前台调用使用中断类控制的规则。

1. 受理：urgent 输入经 submit 受理，保留原输入身份和 urgent 属性。它进入原 execution，不创建新的 execution。
2. 模型调用：当前前台模型调用可以中断时，Agent 请求中断该调用。已到达的内容被保存。该响应中尚未发出的工具建议不执行。
3. 工具调用：当前前台工具调用可以转后台时，Agent 请求原 Tool 转后台，并等待真实的转换确认与耐久占位。不能转后台时，Agent 请求该工具允许的中断，并保留已发生的效果。
4. 人工等待：插队不影响人工等待。已呈现的卡片保持有效，Agent 不伪造人的答复，也不撤销卡片。
5. 准备阶段：请求仍在准备、尚未发出时，Agent 只保存插队责任，不对不存在的调用发出中断。

每一次中断或转后台都是一条独立的中断类控制，按下一小节记录阶段事实。插队不取消 execution，不撤销执行挂接。

### 六个阶段

一次控制的进展分为六个互相独立的事实。每个事实各自保存证据，只在实际成立时记录。缺席表示尚未成立，未知单独标记。

1. 受理：控制命令、原因和发起方已可靠保存。受理不表示任何执行已停止。
2. 意图成立：受理后经当前资格核验，该控制成为当前适用的有效意图。先成立的有效取消优先于普通完成，并且是条件终结使用的取消依据。
3. 推进资格撤销：被控制的执行挂接不再被允许发起新的 Model 或 Tool 动作。
4. 生产者确认：作用对象的生产者确认收到并接受了停止或中断请求。
5. 物理停止：生产者报告调用实际停止或收场。外部效果可能已经发生，不被撤回。
6. 责任释放：受控范围内未收尾的结果、费用、卡片和交接责任已由合法的保管方接管或结清。

各种控制适用的阶段如下。不适用的阶段不记录，也不用别的阶段代替。

| 控制 | 受理与意图成立 | 推进资格撤销 | 生产者确认与物理停止 | 责任释放 |
| --- | --- | --- | --- | --- |
| 中断 | 适用 | 不适用，execution 继续推进 | 适用，对象是该调用 | 适用，范围是该调用的结果与费用 |
| 取消 | 适用 | 适用 | 适用，对象是该 execution 仍在前台的每个调用 | 适用，范围是该 execution 的全部未收尾责任 |
| 暂停 | 适用 | 适用，实现为撤销挂接并保存交接。次序与崩溃恢复待 #730 写回，见“[四种控制](#四种控制)” | 不适用，不请求生产者停止 | 适用，范围是该挂接持有的本地责任 |
| 停用 | 适用，意图成立表示开始拒绝新的 invoke | 适用，对象是该 runtime 的全部挂接 | 不适用 | 适用，范围是该 runtime 的全部本地责任 |

对 ExecutionControl 的阶段事实由 Journal 的 recordControl 记录，并在事件流中以 control 事件投影。记录核对原控制命令、真实执行方的回执和当前处理资格，记录阶段及适用的 Tool 操作引用，不变更控制范围，也不批准新的效果。推进者崩溃或更换后，新挂接以原 ControlRecord 认回已成立的阶段，不重发控制命令。生产者在中断到达前已真实收场时，以真实收场为准，中断不改变结果。控制与完成、换代、晚到写入的竞争处置见[机制页](../agent/docs/architecture/mechanisms.md#控制与故障交接)。

execution 未 ended 时，control 的受理事实及其 control 事件，以及 recordControl 的每个新适用阶段事实及其 control 事件，由 Journal 提供者在同一个成功的原子边界保存，连同可查询的原操作结果。明确失败不留下半份成功；结果未知时继续按原 operation 查询，不降为 excluded 或失败。它们与 tryFinish 共用同一 execution 的权威排序：阶段已成立之后，ended 不能越过尚未成立的对应事件。跨进程的持久提供者须兑现这一边界，通知和进程内锁不能代替它。内部步骤不暴露半份成功。

同 operation、同语义输入认回原结果，不重复分配事件；同 operation 改输入仍 conflict。已有同事实的认回不产生新事件。unresolved 到 reached 是新的事实迁移，不能用永久唯一的（control, stage）键抹掉它；旧事件保持不可变。不同 operation 的事实等值与冲突仍保持原控制身份、state 与 source 的语义约束。recordResult 不是 control 事件的来源。

合法 ended 之后，当前有资格的处理方可以保存原控制在原责任范围内真实迟到的 producer-confirmed、physically-stopped 与 duty-released 事实。资格不依赖旧挂接仍 active。阶段事实与可查询的原操作结果持久保存，并可经 load 的 controls 读取；这些写入不追加事件、不修改旧 ended 的内容、不重开业务、不恢复推进权、不产生新效果。补记不能新建立取消意图、撤销推进资格、改变原终结前提或重新判定终态：取消仅 accepted 而普通完成先 ended 时，之后不能借 intent-established 或 reached 新建立有效取消或重新解释原完成。对已生效事实的认回不重新施效。证据与原终结前提矛盾时，按“[判定次序与失败映射](#判定次序与失败映射)”第 8 条返回 conflict 并保存审计，不伪装为正常的阶段迁移。这项例外不放宽条件终结的责任要求：必须 blocked 的责任不能先放过，再以终态后补记补救；没有依据的新控制、阶段或效力不在例外内。读者经 controls 读取迟到的变化，不能期待已 ended 的订阅继续推送。

停用不是 ExecutionControl，没有 ControlRecord。它适用的阶段事实由下列记录承载。

| 阶段 | 承载的记录 |
| --- | --- |
| 受理与意图成立 | quiesce 的受理。runtime 进入 draining，此后新的 invoke 与 resume 返回 unavailable |
| 推进资格撤销 | 每个被交接 execution 的 detach 交接依据 |
| 责任释放 | quiesce 的返回：drained 表示全部交接完成且登记已撤销，unresolved 表示有交接未知，并列出剩余的 execution。宿主的登记状态记录撤销结果 |

取消形成的 cancelled 终态候选，经条件终结以取消授权提交。取消授权必须对应已保存且当前适用的取消控制，不能提交 complete，也不恢复旧挂接的推进权。

对已经 suspended 的 execution 发出取消时，受理与意图成立照常记录。此时没有有效的执行挂接，推进资格撤销已经成立。收束由下一次合法挂接执行：调用方以 resume 取得新挂接，execution 回到 reconciling，Agent 读到已成立的取消意图后进入 settling，以取消授权条件终结。独立调用者同样以 resume 带入。Agent 不设没有挂接的终结主体。收束的节点次序由 Loop 算法页拥有。

## 依赖不可用与降级

必要保存或授权无法取得时，依赖其允许结论的新动作受阻。动作准入不可用全拒，普通扩展和其他可选服务按各自策略，不将局部故障扩大为全系统停机。

降级先避免副作用，确需产生时保留真实范围及可撤回条件。服务恢复后重新核当前条件，不无条件重放旧计划。Loop 自身必要入口失效须具体报告，不能用工具不可用替换件假装整个 Loop 的必要条件成立。

## 性能、诊断与维护

长期读取按所需事实范围和可重建投影组织。读取尺度包含历史持续增长、待处理输入、未完成扩展和结果、取消核对及恢复延迟，不假设每步遍历全部历史。

关键准入、采用、等待、失败、控制、终态候选、消费及未知状态具备定位信息。遥测不默认复制消息正文、秘密和附件；采样不能抹去必要审计和账目事实。费用按原调用和原工作汇总，接续本身不构成额外发出或自动浪费。

事件、日志和诊断不泄露私有权限块、秘密和无权内容。私有权限块是只供扩展和工具读取、模型不可见的权限输入，任何事件正文、失败诊断和遥测都不携带它。Failure 的诊断文本只写身份与状态，不嵌入消息正文、秘密或附件地址。无权读取方读取含无权内容的事件页时，整页被拒绝。费用、守卫计数和读取投影按原身份去重，压缩与实例换代不抹去原事实。runtime 顺序复用时不泄漏上一次执行的状态，规则见“[创建、登记与复用](#创建登记与复用)”。

后续实现维护三个专题中的行为场景与跨能力故障验证。选择证据须覆盖真实调用与消费，不以接口存在、mock 或静态图代替兑现。机制缺项从[问题登记](../../../.meta_harness/design/product/agent-progression/design.md#未决问题与待定事项)读取；独立审阅和测试通过不授予用户接受。


## 旅程验证入口

产品能力和旅程是可定位的文档索引，不是新增公开类型。能力与旅程到设计的追踪归[产品能力与设计覆盖](verification/coverage.md)，本节不另列映射。持续验证场景归[持续验证场景](verification/scenarios.md)，其中的交付责任场景是 SC-AG-80 至 SC-AG-84。各场景须结合本 SPEC 的身份、并发、持久性和控制义务验证，不能只检查界面文字或图中节点存在。

公开协议的消费顺序见[关键协作流程](docs/flows/scenarios.md)。上述场景是持续验证义务，不是已运行的证据。能力实现状态与阶段支持只读[产品同页记录](../../../.meta_harness/design/product/agent-progression/design.md#能力定义与实现状态记录表)。

## 声明判断

本节规定 `@omne-harness/agent-contract` 包根导出的判断函数的可观察行为。这些函数是 `judgeAgentDefinition`、`judgeLoopExtensions`、`judgeExtensionOutput`、身份解码函数、结构判定与 `agentBodyContract`。它们是纯函数：不读时钟，不产生随机值，不做 I/O。它们不执行调用方交来的值中的函数或访问器。值是 Proxy 时，复制会执行它的 trap，处置见各小节。其他例外也在各小节写明。本页其余各节的接口在包根只有类型，没有实现，见“主干运行契约”。

设计在几处没有给出规则。下文在每一处写明所用的规则。

### 定义与扩展声明

公开入口是 `judgeAgentDefinition` 与 `judgeLoopExtensions`。成功结果必须是逐层冻结、不与输入共享对象的声明数据副本。`judgeAgentDefinition` 的成功值冻结定义本身、`references` 与 `attributes` 及其中每个元素，引用的 `capability` 也冻结。`judgeLoopExtensions` 的成功值冻结批次数组和其中每项声明，声明里的 `dimension`、`needs`（含每项需要声明及其 `schema`）与 `implementation` 也冻结。单项拒绝只有 `kind` 与 `reason`。一批扩展被拒绝时还有 `index`。容器不合法时 `index` 为 0。某一项不合法时 `index` 是该项序号。

拒绝原因共十四种：`malformed`、`duplicate-capability`、`unknown-attribute`、`unknown-position`、`unknown-power`、`dimension-missing`、`dimension-not-allowed`、`power-above-ceiling`、`needs-not-allowed`、`implementation-missing`、`error-policy-not-allowed`、`unavailability-not-allowed`、`executable`、`checker-failed`。设计只规定了 `needs`、`implementation`、`onError` 与 `unavailability` 的合法组合，没有给拒绝原因命名。后四个原因（`needs-not-allowed`、`implementation-missing`、`error-policy-not-allowed`、`unavailability-not-allowed`）沿用“一个字段一个原因”的既有写法，调用方不必读诊断文本。`judgeAgentDefinition` 只返回 `malformed`、`duplicate-capability`、`unknown-attribute`、`executable` 与 `checker-failed`。

一次判断的整份输入，以及一批扩展的整份输入，都受这些限额约束。深度不超过 20。单个对象成员不超过 80。JSON 值个数不超过 200，容器计入，键不计入，第 201 个值拒绝。字符串不超过 10000。数字的 JSON 文本不超过 100。字节数是这一次判断的整份 JSON 文本的 UTF-8 长度，不超过 100000，一批扩展按整批文本计算。超过限额得到 `malformed`。整份文本超过限额时 `index` 为 0。`checker-failed` 只表示校验器故障，不表示输入写坏。内部编译预算不是调用方配置。

两个入口都先把输入复制为普通数据。值为函数或访问器时得到 `executable`。`Date`、装箱字符串、非有限数字、`undefined`、`bigint`、循环引用、原型不是 `Object.prototype` 或 `null` 的对象，以及原型不是 `Array.prototype` 的数组，都得到 `malformed`。复制不调用函数，也不执行访问器。输入或其中的值是 Proxy 时，复制经反射读取它，会执行它的 trap，不执行 trap 之外的调用方代码。trap 抛出异常或 Proxy 已撤销时得到 `malformed`，异常不传给调用方。批次中某一项是这样的 Proxy 时，`index` 是该项序号。判断不加载模块，也不返回权限或句柄。

本节的结构问题指一项输入不符合声明表的形状：缺少必需成员，成员的类型或取值不合法，或者出现声明表没有列出的成员。结构问题由 schema 校验发现。组合问题指各成员的形状都合法，但成员之间的组合不合法。

`judgeAgentDefinition` 的输入是封闭对象：`category` 为 `AgentDefinition`，`name` 是非空字符串。定义不带版本：`version` 不是声明表的成员，输入带 `version` 时按“声明表没有列出的成员”得到 `malformed`。每个新 execution 采用当时的合法胜出者，规则见[定义专题的版本采用](docs/public-api/definition.md#版本采用与实际变化)。`references` 与 `attributes` 必须是数组。空数组合法。缺席和 null 拒绝。每个引用是封闭对象，`capability` 是带非空 `category` 与非空 `name` 的封闭对象，`resident` 可省略，给出时是布尔值。每个 attribute 是只含 `item` 的封闭对象。允许的 item 是 `first_token_wait_limit`、`post_first_token_stall_limit`、`model`，常量 `ATTRIBUTE_ITEMS` 列出它们。`item` 是字符串但不在这三项里时得到 `unknown-attribute`。其他结构问题都得到 `malformed`。同一 capability 的 category 与 name 至多一次，重复得到 `duplicate-capability`。同一 `item` 出现两次得到 `malformed`。成功结果的 attribute 只保留 `item`。成功结果没有版本字段。本入口不读取资产库。

一份定义有多处不合法时，`judgeAgentDefinition` 按下面的次序返回第一处。

1. 复制。复制按自有键的次序逐层遍历输入。遍历到每个值时，复制检查深度、单个对象的成员数、JSON 值个数、字符串长度与数字文本长度，也检查这个值是不是函数或访问器。原型、循环引用等其他复制问题同样在遍历到该值时报告。所以限额问题与 `executable` 哪个先报告，取决于遍历先到达哪一个。例如定义先有函数成员、后有超长字符串成员时得到 `executable`，两个成员的次序相反时得到 `malformed`。
2. 字节上限。复制完成之后，判断才计算整份文本的字节数。所以输入超过字节上限、后面的成员里又有函数时，得到 `executable`。
3. 结构问题。schema 校验的第一个问题决定原因，其余问题不报告。问题按 schema 的成员次序排列：`category`、`name`、`references`、`attributes`，然后是声明表没有列出的成员。这个次序与输入的键序无关。
4. 重复的 capability。
5. 重复的 item。

扩展按提交顺序返回。每项声明含 `name`、`position`、`power` 与 `implementation`，可含 `dimension`、`needs`、`onError` 与 `unavailability`。输入还可带来源提示 `source`，值是 `workspace` 或 `author`。`source` 只用于上限判断，不进入成功值，因为设计类型 `LoopExtensionDeclaration` 没有 `source` 字段。`name` 必须是非空字符串。声明表没有列出的成员一律得到 `malformed`。

位置必须是九处之一，否则得到 `unknown-position`。`power` 必须是三档之一，否则得到 `unknown-power`。任何位置都可以声明三档中的任一档。`source` 为 `workspace` 时 `power` 上限是 `observe`，超过得到 `power-above-ceiling`。`after_model_call` 要求 `dimension.ending`，`after_action` 要求 `dimension.scope`。在这两处位置，`dimension` 缺失、是空对象或是另一种维度都得到 `dimension-missing`。`dimension` 不是对象（包括 null），或维度的取值不合法，得到 `malformed`。其他位置带 `dimension` 得到 `dimension-not-allowed`。

`needs` 是需要声明组成的非空列表。每项需要声明是只含 `name`、`schema`、`required` 三个成员的封闭对象：`name` 是非空字符串，`schema` 是只含 `owner`、`name`、`revision`、`digest` 四个字符串的封闭对象，`required` 是布尔值，没有默认值。列表内任何结构问题，以及两项 `name` 相同，都得到 `needs-not-allowed`。一项需要声明对应装配在调用时交付的一项能力或一项命名读取。`name` 是交付时的键：装配注入能力与官方准入按需要名交付读取都用这个名字。`schema` 是交付物所遵守的契约的精确采用，装配按它核对注入物。必需性在 Agent 发起扩展调用之前判定，`fresh` 与 `replay` 的每一次调用都判定一次：装配为本次调用绑定能力时，任一 `required` 为 true 的需要绑定不到，调用不开始，本次调用按该扩展不可用处置，与作者协议[调用结果](docs/public-api/extensions.md#调用协议)的 `notStartedUnavailable` 一行同一规则。`fresh` 调用绑定不到时，不可用的后果分三种：作者扩展取它声明的 `unavailability`，`skip` 或 `veto`，省略时按 `skip`，实际干预力被收窄时 `veto` 退为跳过，见作者协议的[不可用与报错](docs/public-api/extensions.md#不可用与报错)；受信系统扩展按装配方预先指定的处置，可为 `fallback`；官方准入读不到必需需要等同官方准入不可用，本批全部动作被拒绝，见“[整批判断屏障与动作准入](#整批判断屏障与动作准入)”第 2 条。`replay` 调用绑定不到时，作者扩展与受信系统扩展的 Passage 保持原状态，不形成 Conclusion，由下一次合法推进重试 `replay`；官方准入的 `replay` 调用绑定不到时同样等同官方准入不可用，本批全部动作被拒绝。调用开始之后经能力读取失败是调用中的失败，按报错分支与 `onError` 处置。`required` 为 false 的需要缺席时扩展照常调用：注入的能力集合里没有该名字的条目，官方准入的 `permissions` 列表里没有这一项。装配凭需要声明的哪一项认出要注入的能力种类，`NamedCapturedRead` 的 `schema` 与对应需要声明的 `schema` 是什么关系，命名读取里「读不到」包含哪些读取结果，归读面拥有者（授权的命名读取协议）与装配，本契约未定，见 Agent 的[开放问题](../agent/docs/architecture/open-questions.md#命名读取与注入能力怎样对应需要声明)。`implementation` 缺席得到 `implementation-missing`。它是 `builtin`（带非空 `builtinName`）或 `command`（带 `host`、`dialect`、`event`、`command`，可带 `matcher` 与 ISO 8601 时长文本 `timeout`）。`host` 是 `claude_code` 或 `codex`，`dialect`、`event`、`command` 与 `matcher` 是非空字符串。`implementation` 的其他形状得到 `malformed`。判断只检查时长文本，不把它转成数字。

`onError` 的取值受位置与 `power` 限制。后置位置只允许 `ignore`。前置位置的 `observe` 只允许 `ignore`，`rewrite` 允许 `ignore` 与 `record`，`veto` 允许 `ignore`、`record` 与 `treat_as_veto`。取值不在这些范围内，或不是枚举成员，得到 `error-policy-not-allowed`。`unavailability` 是 `skip` 或 `veto`。`veto` 只允许 `power` 为 `veto` 且位置为前置位置的声明，否则得到 `unavailability-not-allowed`，取值不是枚举成员时同样如此。前置位置是 `before_compaction`、`before_model_call`、`before_action` 与 `before_terminal`。省略的可选字段在成功值里也省略，契约不补缺省值。

`judgeLoopExtensions` 分阶段判断，返回第一个失败。

1. 整批输入复制为普通数据，复制失败时 `index` 是出错项的序号，超过 JSON 值个数时 `index` 为 0。整批输入不是数组，或整批文本超过限额，得到 `malformed`，`index` 为 0。
2. 每项声明先过结构检查。成员按 `name`、`position`、`power`、`source`、`dimension`、`needs`、`implementation`、`onError`、`unavailability` 的次序检查，声明表没有列出的成员最后检查。第一处结构问题决定原因：`position` 得到 `unknown-position`，`power` 得到 `unknown-power`，`needs` 得到 `needs-not-allowed`，`onError` 得到 `error-policy-not-allowed`，`unavailability` 得到 `unavailability-not-allowed`，`implementation` 缺席得到 `implementation-missing`，`dimension` 按上文的维度规则得到原因，其余结构问题得到 `malformed`。
3. 结构合法的声明再过组合检查，依次是来源上限、维度、`needs` 重复、`onError` 与位置和 `power` 的组合、`unavailability` 的组合。

第 2、3 阶段按提交次序逐项执行：第 k 项先过结构检查，再过组合检查，然后才判断第 k+1 项。所以结构问题先于组合问题报告，只在同一项之内成立。例如来源为 `workspace`、`power` 为 `veto`、`onError` 为 `bogus` 的声明得到 `error-policy-not-allowed`，不是 `power-above-ceiling`。跨项时，第 k 项的组合问题先于第 k+1 项的结构问题报告。例如第 0 项超过来源上限、第 1 项的位置不是九处之一时，结果是 `power-above-ceiling`，`index` 为 0。

### 扩展输出判断

`judgeExtensionOutput` 判断扩展作者返回的 `output.value`。输入是位置、维度、用途、生效的干预力、触发、作者收到的 `subject` 与返回值。它同步执行。成功值是逐层冻结、不与 `output` 共享对象的副本。拒收结果只有 `kind` 与十种拒收原因之一：`malformed`、`position_unknown`、`power_unknown`、`dimension_missing`、`dimension_not_allowed`、`output_not_allowed_for_power`、`output_not_allowed_at_position`、`ask_at_forbidden_position`、`rewrite_touches_immutable`、`inject_source_mismatch`。拒收原因的类型是 `OutputRefusalReason`，与声明判断的拒绝原因分开，因为被拒收的输出是运行中扩展的错误，不是声明的错误。位置输出表是[扩展作者协议](docs/public-api/extensions.md#位置输出表)，`POSITION_OUTPUTS` 是它的机读形式。判断与这张表放在本包，因为表是契约页的唯一规则，Agent 的实现成员和方言适配器都要用它。

返回值 `output` 来自作者，判断在第 3 步把它复制为普通数据，不执行其中的函数或访问器。`output` 或其中的值是 Proxy 时，复制会执行它的 trap。trap 抛出异常或 Proxy 已撤销时得到 `malformed`。任何 `output` 值都不使判断抛出异常。其余输入由 Agent 提供，判断按它们的类型直接读取，不做安全复制。`subject` 带访问器时，第 7 步比较 `rewrite` 的返回值会执行这些访问器，访问器抛出的异常不被捕获。

判断按七步进行，返回第一个失败。

1. 位置不是九处之一得到 `position_unknown`。干预力不是三档之一得到 `power_unknown`。位置先于干预力检查。
2. `after_model_call` 要求 `dimension.ending` 为 `complete_reply` 或 `failure`，`after_action` 要求 `dimension.scope` 为 `each` 或 `batch`。在这两处位置，`dimension` 为 null、是另一种维度或取值不合法都得到 `dimension_missing`。其他位置的 `dimension` 不为 null 时得到 `dimension_not_allowed`。这一步选出位置输出表的一行。`before_model_call` 的用途为 `main` 时取 `main` 行。用途为 null 或其他值时取更严的 `compaction` 行。
3. 返回值复制为普通数据，并且必须是八种输出之一的封闭形状，否则得到 `malformed`。函数、访问器、循环引用、非有限数和超出限额的值都得到 `malformed`。各输出的形状规则如下。
   - `select_model` 的 `route` 是非空字符串，`reason` 可省略，给出时是字符串。
   - `veto` 与 `stop` 的 `reason` 是非空字符串。`stop` 的 `terminal` 可省略，给出时是 `cancelled` 或 `failed`。
   - `inject` 的 `message` 是封闭对象，带字符串 `id`、字符串 `role` 与数组 `blocks`。
   - `rewrite` 的 `subject` 是对象。
   - `retry` 的 `plan` 是封闭对象：`supplier` 是对象，`notBefore` 是 null 或 RFC 3339 的 UTC 时刻文本，`basis` 是只含 `owner`、`name`、`revision`、`digest` 四个字符串的封闭对象。`notBefore` 是字符串时，判断用 `@omne-harness/utc-instant` 的 `parseInstant` 解析它，解析失败得到 `malformed`。成功值里的 `notBefore` 是品牌类型 `UtcInstantText`：它保留原文本，不规范化。`judgeExtensionOutput` 是本包内 `UtcInstantText` 的唯一产生者，本包不导出单独的解码函数。
   - `ask` 的 `card` 是封闭对象。`explanation` 是字符串。`options` 至少有一项，每项是封闭对象，带非空字符串 `id` 与字符串 `label`，`effect` 可省略，给出时必须是 json-text 的 `JsonValue`。选项的 `id` 互不相同。`about` 是只含 `position` 与可省略的 `action` 的封闭对象。`about.position` 是九处位置之一。`about.action` 给出时必须能由 `decodeActionId` 解码。`proposedRewrite` 可省略，给出时是带非空字符串 `option` 与字符串 `effectiveArguments` 的封闭对象，`option` 必须等于其中一个选项的 `id`。
   - 上面没有写“非空”的字符串可以为空。
4. `inject` 的 `message.role` 不是 `system_reminder` 得到 `inject_source_mismatch`。
5. 位置输出表：`ask` 出现在该行不允许 `ask` 的位置，得到 `ask_at_forbidden_position`。这条先于下一条检查，所以这时不得到 `output_not_allowed_at_position`。其他输出种类不在该行允许的输出里，得到 `output_not_allowed_at_position`。`retry` 只在 `trigger` 为 `first-content` 时合法。`trigger` 为 `final` 或 null 都得到 `output_not_allowed_at_position`。
6. 输出种类超出生效干预力的上限，得到 `output_not_allowed_for_power`。
7. `rewrite` 返回的 `subject` 在可改写字段之外，必须与作者收到的 `subject` 相等，否则得到 `rewrite_touches_immutable`。相等是普通数据的结构相等：键序无关，值为 `undefined` 的成员视为缺席。

判断不检查下列内容，它们归各自的拥有者。

- `inject.message` 中 `id`、`role` 与 `blocks` 形状之外的 `Message` 规则，归 `@omne-harness/message` 的消息类型与消息准入。
- `retry.plan.supplier` 的内容，归 Model 契约 `@omne-harness/model-contract` 的 `Supplier`。
- 可改写字段的取值。`before_model_call` 的可改写字段由该位置之后的重新组装与复核检查，见“[调模型之前的复核与最终请求](#调模型之前的复核与最终请求)”第 1 条。`before_action` 的 `effectiveArguments` 由链末的官方动作准入按新参数判断，见[扩展作者协议的官方动作准入](docs/public-api/extensions.md#官方动作准入)。`after_action` 单结果范围的 `candidate.blocks` 随候选消息交消息准入。

成功值的类型把 `inject.message` 写成 `Message`，把 `rewrite.subject` 写成 `Subject`，把 `retry.plan.supplier` 写成 Model 的 `Supplier`。这三个值只经过本判断的检查。`message` 经第 3 步的形状检查与第 4 步的角色检查。`subject` 经第 3 步的形状检查与第 7 步的等值检查。`supplier` 只经第 3 步的形状检查。消费者在采用这些值之前，运行消息准入、该位置与 Model 各自的判断。

[位置输出表](docs/public-api/extensions.md#位置输出表)按用途区分调模型之前位置的两行，按触发限制 `retry`，但没有写明用途或触发为 null 时怎样判断。本判断在这两处按更严的规则判断，并划分第 3 步与第 4 步的检查。第一，`before_model_call` 的用途为 null 时按 `compaction` 行判断。第二，`retry` 的 `trigger` 为 null 时按非首内容前处理，即拒收。第三，第 3 步只查 `inject.message` 的形状，角色判断留给第 4 步，所以 `inject_source_mismatch` 可以到达。

第 3 步的复制使用输出专用的限额 `OUTPUT_LIMITS`，与声明的限额分开。深度不超过 64。单个对象成员不超过 10000。JSON 值总数不超过 1000000。字符串不超过 10000000。数字的 JSON 文本不超过 100。常量的成员 `maxBytes` 为 50000000。本判断不量字节，这一项不参与判断。声明来自不受信的作者，所以声明限额小，用来防止滥用。输出来自进程内扩展或方言适配器，`rewrite` 的返回值本身就是整份请求，所以输出限额只防失控。声明判断保持原限额。

### 身份解码与结构判定

“[身份、范围与归属](#身份范围与归属)”要求所有 ID、DurableEvidence 和 Authority 在边界验证。本包为每个品牌身份导出一个解码函数，另导出四个结构判定，作为这项验证的方法。设计没有给出身份文本规则。身份文本规则与 Tool 契约相同。

十四个解码函数是 `decodeAgentInstanceId`、`decodeStepId`、`decodeActionId`、`decodePassageId`、`decodeCardRoundId`、`decodeActionBatchId`、`decodeAgentExecutionId`、`decodeExecutionAttachmentId`、`decodeAgentRegistrationId`、`decodeAgentOperationId`、`decodeExecutionRevision`、`decodeInputId`、`decodeInputBatchId` 与 `decodeConsumptionId`。身份文本是可打印 ASCII，不含空格，长度从 1 到 `AGENT_IDENTITY_MAX_LENGTH`（256 个 UTF-16 码元）。解码函数接受 `unknown`，返回 `Outcome`。失败值是 `{ field, reason }`：`field` 是身份类型名，`reason` 是 `type`（不是字符串）、`empty`、`length` 或 `character`。解码按类型、空串、长度、字符的次序检查，返回第一个失败。成功值只是品牌类型。解码不证明实例、执行或登记存在，也不授予资格。

四个结构判定是 `judgeAdoption`、`judgeEvidence`、`judgeAccess` 与 `judgeAuthority`。它们对 `unknown` 做封闭字段检查，返回 `Outcome`，失败值是 `{ field, reason }`。`reason` 是 `type`、`empty`、`unknown-field`、`missing` 或 `identity`。值本身不是普通对象时，`field` 是结构名：`Adoption`、`Evidence`、`Access` 或 `Authority`。`judgeEvidence` 判定 `DurableEvidence`，它的结构名仍是 `Evidence`。成员出错时，`field` 是成员名。嵌套的 `source` 不是普通对象时，`field` 是 `source`。`source` 的成员出错时，`field` 是 `source.` 加成员名，例如 `source.owner`。

每个判定先核对值是普通对象，再按下面写的次序检查必需成员，最后检查未列出的成员，返回第一个失败。成员缺席得到 `missing`。文本成员不是字符串得到 `type`，是空字符串得到 `empty`。未列出的成员得到 `unknown-field`。

- `judgeAdoption` 要求恰好 `owner`、`name`、`revision`、`digest` 四个非空字符串。
- `judgeEvidence` 要求恰好 `owner`、`record`、`revision`、`digest` 四个非空字符串。
- `judgeAccess` 要求恰好 `principal` 与 `tenant`。次序是 `principal` 缺席、`tenant` 缺席、主体判定、租户、未列出的成员。主体的判定由调用方作为第二个参数注入，因为本包不知道主体是什么。主体失败保留其原因，`field` 加前缀 `principal.`。租户必须是 legal-identity 铸造的 `TenantId`，否则得到 `tenant` 的 `type`。
- `judgeAuthority` 要求恰好 `execution`、`executionAttachment`、`instance`、`generation` 与 `source`，按这个次序检查。前三项经各自的解码函数，缺席得到 `missing`，解码失败得到该成员的 `identity`。`generation` 是非空字符串。`source` 是 `DurableEvidence`，按 `judgeEvidence` 的规则检查。

判定只读普通对象的自有数据成员。数组、其他原型的实例、带访问器或符号键的对象，以及反射时抛出异常的对象，都得到 `type`。判定不执行这些访问器。`judgeAccess` 会执行调用方注入的主体判定，不捕获它抛出的异常。除这一处外，这些函数不抛出异常。成功值是冻结的新对象。`judgeAccess` 成功值中的 `principal` 是注入的主体判定返回的值，`tenant` 是输入中的同一个 `TenantId`。判定只给出形状，不证明记录存在，也不证明来源。

### 资产正文契约

`agentBodyContract()` 返回资产包 `BodyContract`，类别是 `AgentDefinition`。消费者向资产包的类别注册表登记它：`createCategoryRegistry().register(agentBodyContract())`。依赖方向是 agent-contract 依赖 assets，assets 不依赖 agent-contract，注册表不导入本包，沿资产 SPEC 的[类别提供方](../../assets/assets/SPEC.md#category-provider)。登记由装配一侧执行，本包不持有注册表。

正文是资产包 `readBodyText` 产生的 json-text 读树，函数只读这棵树，不读资产库和时钟。`schema` 是描述正文形状的读取文档，不是校验器。契约含三个函数。

- `judge(body, context?)` 返回 `{ ok: true }` 或冻结的 `{ ok: false, rejected }`，不抛出异常。不是已登记读树的值得到 `incomplete-reference`。
- `references(body, context?)` 按正文次序返回引用的能力身份。
- `deriveDeclarations(body, context?)` 返回 `entries`，值是正文 `attributes` 中 `item` 的有序列表，没有重复。

`references` 与 `deriveDeclarations` 在正文没有通过 `judge` 时抛出 `TypeError`，消息带拒绝原因。

正文规则与 `judgeAgentDefinition` 同源，同一组夹具在两个入口上得到相同的接受与拒绝。差别有三处。第一，正文不带 `category` 键，因为注册表的键给出类别，带它得到 `unknown-field`。第二，`context.capabilityName` 给出时，正文 `name` 必须与它相等。第三，`judgeAgentDefinition` 按上文的声明限额检查输入，正文契约不另设限额，读树的限额由调用 `readBodyText` 的一方给出。

正文判断的拒绝原因共七个，与 `RefusalReason` 分开，条件见下表。正文与定义同样不带版本：`version` 是未列出的键，得到 `unknown-field`。

| 拒绝原因 | 条件 |
| --- | --- |
| `incomplete-reference` | 正文不是对象，`name` 缺失、为空或不是字符串，`references` 缺失或不是数组，引用不是对象，引用缺 `capability` 或 `capability` 不是对象，或能力的 category、name 不被资产包接受 |
| `name-mismatch` | 注册表调用方给出能力名，且与正文 `name` 不同 |
| `duplicate-capability` | 同一 category 与 name 的引用出现多次 |
| `invalid-resident` | 引用的 `resident` 存在，但不是布尔值 |
| `unknown-attribute` | `attributes` 缺失或不是数组，某项不是对象，或某项的 `item` 不在 `ATTRIBUTE_ITEMS` 里 |
| `duplicate-attribute` | 同一 `item` 出现多次 |
| `unknown-field` | 正文、引用、能力或属性项里有未列出的键 |

一份正文有多处不合法时，`judge` 按下面的次序返回第一处。

1. 正文不是对象。
2. `name`，然后是 `name-mismatch`。
3. `references`：先查它是不是数组，再逐个引用依次查 `capability`、`resident`、引用与能力里的未知键。全部引用通过后查重复的 capability。
4. `attributes`：先查它是不是数组，再逐项依次查 `item`、属性项里的未知键、重复的 `item`。
5. 正文顶层的未知键。

第一，`deriveDeclarations` 的 `entries` 取正文的 attribute 项。设计没有给出 AgentDefinition 的声明词汇，所以沿用上文已经固定的 attribute 词表，不新造概念。第二，嵌套对象里的未知键一律得到 `unknown-field`，与 `judgeAgentDefinition` 的严格对象一致。第三，`references` 与 `attributes` 缺失按拒绝处理，不视为空表，与上文“缺席和 null 拒绝”一致。第四，上表的七个拒绝原因与上面的检查次序。

### 验证入口

装配包通过自己的测试导入这个公开入口。本成员依赖资产包，资产包不依赖本成员。持续验证命令是在仓库根运行 `pnpm turbo run test --filter=@omne-harness/agent-contract`、在成员目录运行 `pnpm typecheck`，测试文件见[测试说明](tests/README.md)。这些测试只证明纯判断与导出面，不证明推进、扩展执行、恢复、提供者或装配。


<a id="342-主干运行契约候选"></a>
<a id="主干运行契约候选"></a>

## 主干运行契约

本节归集运行契约的行为。类型声明的唯一来源是源码，[public-api](docs/public-api/README.md) 导航到它。消费位置与外部协调者的前提归 [context](docs/context.md)，正常、失败与反例场景归[持续验证场景](verification/scenarios.md)。按源码包模板组织文档不授予生产支持。

本节已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，前文已采用范围继续由本页开头的状态标明。接受不表示实现完成。包根导出下面各节的类型，以及声明判断、扩展输出判断、身份解码与结构判定和资产正文契约。求值、协调和实例接口的实现，包括 Loop、Journal 提供者与 runtime，尚未提供。

Agent 将明确事实求成下一步，再通过公开端口协调工作。外部协调者在外部拥有自己的业务关联和终态，通过提交参加者适配输入受理、保存与共同终结，这些概念不进入 Agent 核心。Model/Tool 拥有真实执行。Agent 的纯求值、可恢复 execution 与可复用 runtime 分别表达。对象与层次关系见[共同模型](../../../docs/architecture/runtime/runtime-contract-model.md)。

### 身份、原位置与纯求值

公开类型的源码由[公开接口页](docs/public-api/README.md)导航。Model、Tool 的名称来自各原拥有者的根入口。Agent 自有值和窄端口不导入任何外部协调者的类型。`AgentDefinition` 的类型在 `src/definition.ts`。`Position`、`Power` 与 `LoopExtensionDeclaration` 是[扩展作者协议](docs/public-api/extensions.md#声明)规定的类型，在 `src/extensions.ts`。Agent 不复制 Model 或 Tool 的接口，也不用私有源码代替它们。

[本节定义](docs/public-api/README.md#身份原位置与纯求值)。

StepId 区分一轮主要请求及其动作承接位置，ActionId 区分同一步内不同动作。拒收模型回复之后的新调用有新 action/call，保留原否决历史。PassageId 固定一次位置、扩展采用、动作和链序号。身份生成不授予资格，稳定身份先保管再用于外部操作；恢复不因换执行挂接重建它们。PendingCall.model 保存 ModelInvocationRef，用于 admit、cancel 与恢复对账时的只读 inspect。观察与读取由 Agent 外侧按该引用经 Model 的 current 承担。首次 admit 前即可由已固定的 tenant/call/admission 编码，意图先保存。Tool 分支先保存 intent，只有 Tool 证明调用身份后才保存 associated 与 ToolInvocationRef，见“Tool 调用关联与控制引用”。

AgentCheckpoint 由 Agent 解释并通过 AgentJournal 保存。外部协调者的提交参加者可以把它纳入自己的原子提交，但不得另行维护第二份 Agent 工作状态。效果协调层把生产者公开状态投影为 ProducerDecisionView，纯 Evaluator 不解释外域状态编码。查询不可用返回失败，原状态未定保持 unresolved，不用空集合或结束状态代替。decode 必须核对精确采用、身份关系和完整性，不能把任意 JsonValue 当 AgentCheckpoint。编码只允许数据，不含运行对象。

next 是纯函数，不读时钟、当前注册或数据库，不发请求。相同完整输入与精确采用得到同一决定；缺必要事实返回具体失败。条件快照只是判断依据，影响推进的写入及实际发起仍在领域边界重新裁定。权限模式及环境选择由原领域解释，RuntimeConditions 只传 Loop 所需的 ProgressionDirective 与采用依据，不把 bypass 模式当直接授权，也不含守卫。守卫阶梯由循环判断这一受信系统扩展计算并记为 checkpoint 的守卫事实 `guard`，规则见“[循环守卫](#循环守卫)”。L0 始终保留观测；L3 的失败候选由 I8 按最新守卫事实的 `basis` 认回，L4 的人工等待就是循环判断那次扩展调用的卡片等待，不以换执行挂接清零，Agent 不自动生成默认阈值。

优先级依次为有效取消/终态/失效推进，原操作未知与原结果交接，已有扩展/压缩/人工等待，合法批次承接，当前请求准备，整批动作发起，最终完成候选。原调用在途时不能因新消息改走新请求入口。主回复准入事实由 Journal 与接续共同提交，按原 call/resultVersion 去重；其有范围、有规则采用的投影进入 LoopFacts，不能用当前消息列表重建被压缩掉的原否决历史。没有动作与空队列不直接产生终态；必须核未完等待、模式及终态前经过。Next 只是求值结果，调用方自行伪造某分支也不能绕过实际操作的守卫。

### 请求、扩展和材料接缝

这些是 Agent 消费外域的窄端口。Request Context、Runtime Context、HITL 与材料拥有者负责真实来源和行为，Adapter 在本边界兑现；此处不授予它们新的领域职责或通用执行权限。

[本节定义](docs/public-api/README.md#请求扩展和材料接缝)。

本节前七小节写一次模型请求从选择模型到记录最终请求的行为。随后的小节写扩展、卡片与材料，循环守卫，整批判断屏障与动作准入，工具执行与结果承接，消息准入，以及卡片与准入端口的逐操作要素。Loop 各节点的次序由 Loop 算法页拥有，本节只写必须成立的行为和各方的分工。

#### 请求中的职责划分

一次模型请求由 Context、Model 和 Agent 分担。下表写各方拥有什么。表中没有列出的事项不归 Agent。

| 拥有者 | 拥有的事项 | Agent 的做法 |
| --- | --- | --- |
| Context | 历史与块的投影、读取范围、预算、压缩的决策与计划、表示的合法性 | 消费准备结果。不选择压缩覆盖范围与保留名单，不定预算数值 |
| Model | 档案解析、同名求值、按模态投影判断档案是否相容、请求准备（产生固定请求）、发出与真实收场 | 经 Model 的公开能力受理和读取。不改写档案，不改请求内容 |
| Agent | 用途、调用次序、扩展调用、计划进展的记录、结果的去处、失败候选 | 写入自己的执行记录，不委托其他方保存 |

三方的关系有三条。

1. Agent 不自己决定是否压缩。只有 Context 返回 needs-compaction，Agent 才进入压缩节点。
2. Agent 不为某个模型改写请求内容。请求按实际收件模型由 Context 组装，Model 在受理时再核对一次。
3. Agent 不理解模态细节。模态转换的时点与失败分类归 [request-context 的 RQ-04](../../context/request-context-contract/SPEC.md#rq-04-模态与可追溯表示) 与 [Model 转换件共同契约](../../model/model-contract/SPEC.md#转换件的共同契约)。转换失败时，Agent 按原用途处理所在路径返回的失败。

一次请求准备消费 Request Context 的七组输入，七组的内容归 [RQ-02](../../context/request-context-contract/SPEC.md#rq-02-组装的前置输入)。Agent 经 Agent 一侧（Request Context 所称的协调者一侧）的适配器给出组一，即调用身份与用途：访问身份、用途、消费位置与候选身份。其余六组的组读口由同一个适配器实现：适配器把 Agent 端口携带的材料转为各组读口，Request Context 按 [RQ-13](../../context/request-context-contract/SPEC.md#rq-13-七组的稳定读取) 从各组读口稳定读取。Agent 不把它们作为一个值传入。Agent 不缓存计量结论，每次准备采用本次的结论。Agent 端口字段到七组的对照归 [request-context-contract 的消费与系统定位](../../context/request-context-contract/docs/context.md)，本页不复制。

#### 模型选择

Agent 经 ModelSelection.select 按用途选择模型。用途有三种：主请求、压缩、扩展的内部用途。

1. 输入是用途、runtime 绑定的安全作用域、原消费位置、历史依据、本次准备读到的当前条件和扩展对请求的改写依据。当前条件的 model 是设置侧当前选择的采用依据，不是实际收件模型。选择端口据此按 Model 的同名求值求出实际收件模型。
2. 历史依据与同一次准备交给 prepare 的历史依据相同。选择端口从这份历史依据取得模态要求，再交 Model 解析档案。所以选择时判断模态相容所用的历史范围，与请求准备所用的历史范围一致。
3. 返回值 SelectedModel 包含实际收件模型、已解析的档案、参数、工具描述的来源和证据。选择端口只返回可选的档案：Model 解析出 selectable 为 false 的胜出档案时，选择端口返回失败，不把它交给 Agent。所选路由已下架、被配置排除、模态不相容，或档案来源不可读时，也返回失败。它不改用其他路由。
4. 选择变化只影响下一次请求。最终请求记录之前都属于“下一次请求”：Agent 在记录之前每次准备都重新选择，比较新旧实际收件模型，二者不同就重新准备。最终请求记录之后，选择变化不改写它，也不中断在途调用。
5. 扩展的 select_model 输出作为改写依据交给选择端口。选择端口按有效锁定、模态与外传条件核验，不因此启用被禁用的模型。
6. 选择只说明谁收这个请求，不授予发送资格。Model 在受理与发出点按当前资格、凭据和档案再核验。

#### Runtime Context 的消费

Agent 经 ModelContextReader.read 取得模型可读的 Runtime Context。读取遵守下列规则。

1. 拉取时点有五个：新 execution 开始，每次建立执行挂接（AgentRuntime.resume 或接管之后），每次主请求准备，模型选择变化之后，压缩提交之后。后三个时点在正常路径上落在 RequestPreparation.prepare 与 RequestPreparation.resume 之前，单独列出是因为选择变化和压缩提交都使已读到的快照失效。快照与实际收件模型和历史范围绑定，必须重新读取。每个时点都先选择模型，再读取，因为读取端口需要实际收件模型。
2. 已接受的 [Runtime Context 系统页](../../../docs/architecture/runtime/runtime-context.md)把读取时点写作执行开始或执行挂接建立。前两个时点与它对应，Agent 的拉取时点是它的超集，二者不冲突。
3. 模型可读块与工具、扩展的私有块分开读取。ModelContextReader 在装配时绑定到模型这一个消费者，调用方不能用参数改成其他消费者。它只返回标为模型可读、且当前资格允许的块。
4. 私有块包括权限输入。它们只经工具与扩展各自的注入能力读取，例如动作准入和扩展的 needs 能力，每次读取都核验当前资格。私有块不进入模型请求、事件、失败诊断和遥测。RuntimeConditions 的 context 只是条件依据的引用，不含块内容，也不是模型可读的读取结果。
5. full 还是 incremental 由 Context 决定，Agent 不要求某一种。Agent 向读取端口传入历史依据、本 execution 已采用的覆盖依据（checkpoint 的 adoptedContext，新 execution 为空）和压缩转换依据（压缩提交之后的读取才有）。Context 按 [Runtime Context 的 RC-04](../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料) 返回 full 或 incremental 与覆盖证据。Agent 只记录 Context 返回的种类与覆盖，不改变它们。
6. 读到不等于采用。ModelContextRead 只说明读到了什么。覆盖在最终请求记录时才成为已采用覆盖，并保存在 checkpoint。记录之前，未采用的读取被新的读取、选择变化或压缩提交取代，直接丢弃，不影响已采用覆盖。
7. 空闲期间的变化由新 execution 开始和建立挂接时的拉取承接，不依赖逐条推送。同一 execution 长时间等待后继续推进时，下一次主请求准备前的读取传入 checkpoint 的 adoptedContext，Context 沿提醒链返回 incremental 或 full；Agent 不因等待时长改为要求某一种。
8. 每次读取都核验当前资格，不用旧日志恢复已撤回的访问权。读取不可用时请求不准备，Agent 不用旧快照冒充当前。

#### 请求准备与压缩

history 是调用方合法历史读取范围和精确权威进度的证据，由可信读取适配器取得。Request Context 按其实际公开读取协议解析必要范围，不遍历每一轮完整历史。inputs 指已经可靠承接的完整批。

prepare 只计算。它不修改历史，也不发压缩模型调用。输入除上述历史依据和输入批外，还有条件、选择结果、Runtime Context 的读取结果、同一步的上一次准备、扩展的改写依据和调模型之前位置的经过。返回值有四种：assembled、ready、needs-compaction、cannot-fit。

- 调模型之前位置尚未经过时，装得下的结果是 assembled。它是 Context 组装完成、尚未交给 Model 准备的请求，也是调模型之前位置的输入。
- 调模型之前位置已经经过时，Context 一侧的适配器应用改写依据，重新组装并复核，再把完整的组装输入交给 Model 的请求准备。装得下的结果是 ready，带 Model 返回的固定请求。Model 的请求准备只在这里调用，它的输入沿 [Model 档案与请求准备协议](../../model/model-contract/SPEC.md#档案与请求准备协议)。

assembled 与 ready 都带有它所属的实际收件模型和采用的覆盖。Agent 核对二者与本次选择和读取一致，不一致就重新准备。

一次请求准备以主请求的 step 为身份。同一 step 内的下列调用都属于同一次准备：首次 prepare，调模型之前位置之后的 prepare，压缩提交之后的 RequestPreparation.resume，以及最终请求记录之前因选择变化重新进行的 prepare。checkpoint 的 compaction 记录这一次准备进入的计划。计划结束之后它仍保留，新 step 开始时清空。

CurrentConditions.read 的 previous 是上一次已用于请求准备的条件依据。依据没有变化时返回同值，依据变化时返回新值。条件变化只使尚未记录为最终请求的候选重算，不改已记录的最终请求。协调者在启动推进之前取得的条件是初始依据。Agent 在每次请求准备时经同一个 CurrentConditions 端口再取当前条件，这不改变协调者在启动之前取得条件的义务。

压缩的决策、策略、计划与预算都归 Context。Agent 没有压缩预算配置：AgentConfiguration 不含压缩预算数值。prepare 返回 needs-compaction 时同时给出 CompactionProgress：计划身份、有限的步数上界 bound 和已完成步数 completed。三项都由 Context 的计划给出，Agent 不修改。needs-compaction 的 original 绑定这次 prepare 的完整输入，含改写依据和调模型之前位置的经过。RequestPreparation.resume 从 original 与压缩转换依据重算，不另接收该位置的经过。

压缩节点按下列规则运行。

1. 压缩之前位置：Agent 先经过压缩之前位置。扩展在该位置只能 observed、inject、veto、stop、ask，不能改写。veto 使压缩被跳过，后果见“无法装下”。
2. 逐步执行：derive 的 result 为 null 时返回第一步，之后每次带上上一步的结果，返回下一步、最终转换或失败。每一步是一次独立的内部模型调用，有自己的 ActionId、Model 受理身份、原消费位置（回到压缩节点）和费用。步骤请求按压缩用途选择的实际收件模型准备：Context 一侧的适配器在 derive 内把步骤请求交给 Model 的请求准备，continue 带 Model 返回的固定请求。
3. 进度持久：一步的结果被保管并交给 derive 之后，新的 CompactionProgress 与下一步的效果意图在同一次 Journal 提交中保存。每消费一步，Context 返回的 completed 恰好加一。Agent 另自持已发起步数，记在 CompactionState 的 initiated，随 checkpoint 持久；崩溃后以它认回同一步，同一步被认回时不重复计数。恢复沿已保存的进度继续，不从零开始。
4. 至多一次计划：同一次准备至多进入一个计划，已进入的计划不重开。checkpoint 的 compaction 已记录本 step 的计划时，Context 再次返回 needs-compaction 是合法结果，表示允许的处理之后仍装不下。Agent 不进入第二个计划，以 cannot-fit 进入失败候选，原因是 after-compaction，并附上 Context 的原结果与计划身份。prepare 与 RequestPreparation.resume 返回的这一结果都按本条处理。
5. 不递归：压缩步骤的请求不经过 prepare，也不触发压缩。Agent 不压缩压缩请求。步骤请求只经过压缩用途的调模型之前与之后两次经过，该位置对压缩用途允许的输出见[位置输出表](docs/public-api/extensions.md#位置输出表)，否决的后果见“无法装下”第 3 条。
6. 计划耗尽：completed 达到 bound 而没有合法摘要时，derive 返回 cannot-fit，原因是 after-compaction。Agent 不再发起步骤，沿 Context 的失败结果进入失败候选。Agent 自己也核对上界：不发起序号不小于 bound 的步骤。derive 返回的计划身份与 bound 必须与计划开始时 needs-compaction 给出的相同，completed 不得减少，每消费一步 completed 必须恰好加一，continue 返回时 completed 必须小于 bound。不相同、减少、停滞、多加或 continue 时 completed 不小于 bound，Agent 都按 invalid 失败进入失败候选，不再发起步骤。
7. 转换与提交：derive 返回 transition 后，Agent 保留完整的 PreparedContextTransition，先以 P 固定来源候选，再经 `MessageHandoff.prepare` 取得准入结果，最后以 Ja 把准入结果、Journal 的 context-transition 交接与 Context 参加者的事实在同一次提交中保存。Ja 同次保存摘要消息、合法范围、retained、派生与 commitment 的核验结果、新 epoch、Agent 的接续位置与 message 事件，并在同一事务建立 committed 的转换依据；该依据与 Ja 的回执及 `load` 的结果关联，不用第二次写入补证明。prepared 不是压缩已提交的证明。消息准入 rejected 该消息时不提交转换，该计划按压缩失败收场：失败候选为 cannot-fit，原因记为 after-compaction，`rejection` 为拒收依据。共同提交判定转换非法时，失败候选为 compaction-invalid。有提交参加者的装配由该参加者兑现这一共同提交，独立装配由其固定的历史组合在同一事务兑现，规则见“[消息准入](#消息准入)”。提交未知时只查原 Ja，不能用未提交的派生冒充已压缩；参加者一侧的查询必须桥接原 Ja，不以派生键查空判未提交。
8. 压缩之后位置：Ja 认回 committed 之后才经过压缩之后位置。它只面对已提交的事实，不能改写已提交的摘要、压缩覆盖范围和保留名单。因此没有任何扩展位置能改写压缩候选。
9. 重新准备：Ja 认回 committed 后，Agent 先取得 committed 的转换依据，重签当前读取资格（承担这项重签的端口尚未指定，登记为开放问题的 [U-14](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)），再经 CurrentConditions.read 取当前条件，再重新选择模型，再带压缩转换依据读取当前完整的 Runtime Context，然后调用 RequestPreparation.resume。选择的输入含当前条件，所以读取条件在选择之前。Context 从 original 与压缩转换依据重算 Context 与预算。结果种类由 original 中记录的调模型之前位置经过决定：该经过为 null 时，装得下返回 assembled；非空时，装得下返回 ready。仍装不下时返回 cannot-fit 或 needs-compaction，后者按第 4 条处理。

压缩计划归 Request Context，它选定覆盖范围的终点与保留名单；压缩记录的形状与模型视图规则归[消息成员](../../common/message/SPEC.md)。保护边界见 [RQ-06](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界)。commitment 只在具名的 Context 协议中解析，不能当任意 JSON patch 或业务回调执行。derive 从保管的原内容核验结果的来源，所以不用当前新历史替代原范围。commitment 与实际消息、原准备和每一步的消费依据绑定。同一个 commitment 不能配另一条消息。

压缩的提交链里 Agent 自己的责任如下。Agent 保留并校验 PreparedContextTransition，精确传递 H 与 Ja，只在 Ja 认回 committed 后进入压缩之后位置与 resume。它不解释 covers、retained 或历史持有者的模型视图规则，这些检查继续归 Request Context、消息成员与历史持有者。Agent 一侧的桥接载荷是版本化的，保留原 candidate、plan 与完整 basis 材料、commitment 与真实的 history epoch，原材料与原合法来源依据分开保存。committed 的转换依据绑定 Ja、H、原准备、候选、commitment、实际条目、新 epoch 与历史上界，与 Ja 的原 receipt 和 `load.handoffs` 中该 H 的 `history.transition` 都能找到它。Request Context 的适配器解析这份依据，核验原 candidate、plan、commitment 与实际 history epoch 后构造转换依据；重读当前历史已变化时，按 Request Context 的 epoch 规则重新准备或报告 changed，不把旧 epoch 页与当前页拼接。材料缺失时报告具名 unavailable，不填空集合；缺少历史源登记或事务业务响应协议是 unsupported 的装配缺项，不伪装为暂时 unavailable。Request Context 的 decoder、参加者一侧的字段与事务兑现由各自的拥有者精确配对，登记在[开放问题](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。

压缩内部模型调用的结果确认和崩溃接续，沿 Model 契约和“持久性与交付责任”。

#### 无法装下

1. 无法装下的原因只有两类：固定内容超限（fixed），压缩后仍超限（after-compaction）。
2. 限额未知不是失败，规则见 [RQ-05](../../context/request-context-contract/SPEC.md#rq-05-完整预算与候选完成)。表示不可用，例如没有可用表示或转换缺少能力，按 Context 的原结果以 Failure 转交。Agent 不新增第三类原因。
3. 压缩之前位置否决压缩后，请求仍然装不下。失败原因记为 after-compaction，表示允许的处理之后仍装不下，并记录否决依据。压缩用途的调模型之前位置否决某一步时，该步骤请求不发出，计划按压缩失败收场，原因同样记为 after-compaction，并记录否决依据。Agent 不回到同一步重新经过该位置。
4. 无法装下时，Agent 沿真实原因进入失败候选，由统一的终态出口收束。Agent 不换模型，不删除历史，不分叉，也不无限压缩。出口是有限的，因为计划有上界，同一次准备（以主请求的 step 为身份）至多进入一个计划，压缩请求不递归。
5. 失败保留原因、历史、设置和已有结果。调用方在条件改变后发起新的工作，失败的 execution 不复活。

#### 调模型之前的复核与最终请求

1. 调模型之前位置的输入是 assembled 的请求。经过该位置之后，Agent 总要再调用一次 prepare，带上 previous、改写依据（没有改写时为空）和该位置的经过。扩展给出改写或 select_model 时，Agent 先重新选择，实际收件模型变化时重新读取。同一次经过不重跑该扩展位置，completedPassages 防止同一经过再次自触发。扩展修改之后的重组装与复核义务归 [RQ-07](../../context/request-context-contract/SPEC.md#rq-07-扩展修改发起与固定采用)。
2. 这次 prepare 的结果为 ready 时继续。结果为 cannot-fit 时进入失败候选。结果为 needs-compaction 时按“请求准备与压缩”第 4 条处理：本 step 尚未进入计划时进入一次计划，提交之后的 RequestPreparation.resume 在装得下时直接返回 ready；已经进入计划时以 cannot-fit 失败，原因是 after-compaction。
3. 记录最终请求之前，Agent 再选择一次模型，核对结果与 ready 的实际收件模型一致。不一致时重新读取并重新准备，不用旧的实际收件模型。这次重新准备返回 needs-compaction 时，同样按第 4 条处理。
4. 复核通过后，Agent 记录 FinalRequest：ready 中 Model 返回的固定请求、实际收件模型、采用的覆盖和已应用的改写依据。FinalRequest 是 Agent 对这次请求的采用记录，不是另一次固定。Agent 先保存原操作登记和覆盖采用，再向 Model 受理。记录之后不再改写。
5. Model 在受理与发出点按档案和当前资格核验固定请求，包括工具绑定、表示和实际外传范围。Model 拒绝时，Agent 把 Model 的失败交原用途处理，不换模型。

#### 请求接缝的逐操作要素

输入与返回的类型形状见[公开接口页](docs/public-api/README.md#请求扩展和材料接缝)。下面两张表写这些端口的错误、授权、幂等、并发、事件与生命周期。每个操作都先核对 Access 的租户，advance 已被取代时返回 stale-advance，不产生结果。

| 操作 | 输入要点 | 成功返回 | 错误与未知 |
| --- | --- | --- | --- |
| ModelSelection.select | Access、advance、runtime 的安全作用域、用途、原消费位置、历史依据、当前条件、扩展的改写依据 | SelectedModel | denied；invalid（改写依据不合法，例如被锁定的路由）；unavailable（档案来源不可读，或所选路由没有可选的档案，原因写明下架、配置排除、模态不相容、胜出档案不可选或来源未知）。不改用其他路由 |
| ModelContextReader.read | Access、advance、原消费位置、实际收件模型、历史依据、已采用的覆盖依据（新 execution 为空）、压缩转换依据（可空） | ModelContextRead，其中 full 或 incremental 由 Context 决定 | denied；invalid（已采用的覆盖不属于本 execution）；unavailable（来源不可读）。不返回旧快照冒充当前 |
| CurrentConditions.read | Access、advance、上一次已用于请求准备的条件依据（可空） | RuntimeConditions：推进要求与采用依据的投影，不含守卫 | denied；unavailable（依据缺失，不猜默认允许） |
| RequestPreparation.prepare | Access、advance、action、用途（主请求或扩展）、原消费位置、历史依据、输入批、条件、选择结果、读取结果、同一步的上一次准备（可空）、改写依据、调模型之前位置的经过（尚未经过时为 null，已经经过而没有适用扩展时为空列表；扩展用途总是空列表） | 尚未经过时为 assembled，已经经过时为 ready；两种情形都可能返回 needs-compaction 或 cannot-fit。needs-compaction 的 original 绑定这次 prepare 的完整输入 | denied；invalid（范围越界，对压缩步骤请求调用，或 Model 的请求准备确定拒绝：参数不支持、档案不可选或表示不相容，同输入重试结果不变，field 为 request，reason 为 Model 的拒绝原因，Agent 把 Model 的原结果附在失败候选 request-rejected 中）；unavailable（Context 或 Model 的来源不可读，表示不可用时按 Context 的原结果转交；Model 请求准备的暂时不可用按 Model 的原结果转交，可用同一操作重试）。cannot-fit 的原因只有 fixed 与 after-compaction |
| RequestPreparation.derive | Access、advance、needs-compaction 的原准备、最新进度、本步 action、压缩用途的选择结果、上一步的结果与保管依据（第一步为空） | continue（进度与 Model 已准备的下一步请求 stepRequest）、transition（PreparedContextTransition）或 cannot-fit | denied；invalid（结果不属于该步，或进度与计划不符）；unavailable（来源未知，不用当前新历史替代原范围）。耗尽时返回 cannot-fit，不返回 continue。返回的计划身份或 bound 与计划开始时不同，completed 减少、停滞或多加，或 continue 时 completed 不小于 bound，Agent 都按 invalid 失败 |
| RequestPreparation.resume | Access、advance、原准备（其 original 含调模型之前位置的经过）、提交依据、选择结果、压缩之后的读取结果 | 与 prepare 相同的四种结果，装得下的种类由 original 中记录的该位置经过决定。needs-compaction 由 Agent 按至多一次计划的规则转为 cannot-fit（after-compaction） | changed（提交的来源与原准备不符）；invalid（original 的调模型之前位置经过非空时 Model 的请求准备确定拒绝，field 与原结果的处置同 prepare）；unavailable（提交未知，先按原操作查询）；denied |

| 操作 | 授权 | 幂等身份 | 并发与竞争 | 事件 | 生命周期 |
| --- | --- | --- | --- | --- | --- |
| select | 租户核对。主体能否使用该档案范围由选择端口按 Model 契约核验。选择不授予发送资格 | 没有操作身份。同样的输入与同样的来源修订得到同样的结果。设置可以变化，所以每次准备都重新求值 | 只读，不加锁。设置变化与读取并发时，结果带来源证据，由 Agent 比较 | 无 | 值。只作为最终请求的一部分保存，记录之前可丢弃 |
| ModelContextReader.read | 每次核验模型这个消费者的当前资格。消费者在装配时绑定 | 只读。同一来源修订、同一已采用覆盖与同一压缩转换依据得到同一读取结果 | 不阻塞生产者的更新。读取期间的更新由来源证据区分 | 无 | 值。未采用的读取被后来的读取取代时丢弃。覆盖在最终请求记录时采用，保存在 checkpoint |
| CurrentConditions.read | 租户核对。读取资格不等于推进资格 | 只读。同一 previous 与同一来源得到同一值 | 只读，不加锁 | 无 | 值。条件变化只使未记录的候选重算 |
| prepare | 租户核对。advance 必须是当前有效的执行挂接 | 纯计算。输入相同（含 previous 与调模型之前位置的经过）返回已有结果，输入有合法变化就重新计算 | 同一 execution 同一时刻至多一个未记录的准备，由 Loop 的串行推进和单执行槽保证 | 无 | Preparation 保存在 checkpoint，直到最终请求记录或被新的准备取代 |
| derive | 同 prepare | 同一 action、同一进度与同一结果得到同一返回，认回同一步不重复计数 | 步骤串行。同一计划同一时刻至多一个步骤在途 | 没有新的事件种类。步骤结果以 producer 事件投影，转换消息以 message 事件投影，均由 Agent 提交时产生 | 进度保存在 checkpoint 的压缩状态。ended 之后不接受新步骤 |
| resume | 同 prepare | 同一原准备与同一提交依据得到同一重算结果。原准备的 original 固定了调模型之前位置的经过，resume 不另接收它 | 与 derive 共用单执行槽 | 无 | 返回值取代原准备，计划结束。checkpoint 的 compaction 保留到本 step 结束，新 step 开始时清空 |

#### 扩展、卡片与材料

扩展的调用是有副作用的 `invoke`，作者协议见[扩展作者协议](docs/public-api/extensions.md#调用协议)。一次扩展调用由一个 Passage 记录，它与一次经过的区分见该页页首。Agent 对每次扩展调用保证下列行为。

- 扩展调用的身份与调用模式先经 AgentJournal 提交为已请求，调用才开始。
- 调用返回的合法输出经校验后包装为 Conclusion。输出为 `ask` 时，Conclusion 不是最终结论，与本轮卡片一起提交为已询问。其他输出、报错分支与不可用分支是最终 Conclusion，提交为已结论。
- 已有最终 Conclusion 的扩展调用永不再调用，换执行挂接、换 runtime 或换代都不改变这一点。已询问的扩展调用在答复齐备之后以 `replay` 调用。
- 调用结果未知时，Agent 以 `replay` 模式按原精确采用重新调用，不以 `fresh` 重新开始。
- 扩展经注入能力产生的模型调用与读取按 PassageId 加操作序号记入 Passage.operations。作者可声明的注入能力只有模型调用和两项读取，守卫判断记录只注入给循环判断这一受信系统扩展，扩展不发起工具调用，来源上限为 `observe` 的扩展只取得读取能力。重放时能力按操作种类与原输入依据比对并认回原操作，不重复计费，不重复执行。比对不一致时，Agent 把本次调用锁存为 `replayInconsistent`，按报错处置；认回所需的查询未知时锁存为 `controlUnavailable`。第一次锁存之后，本次调用内能力不再发出新操作，调用结果是第一次锁存的值。规则见作者协议的[输入](docs/public-api/extensions.md#输入)。
- 注入能力不出卡。卡片只由 `ask` 输出产生，按原 round 与请求身份认回，不重复呈现。
- 能力之外的副作用由作者负责幂等。

扩展调用与卡片轮次各有四个状态，迁移与恢复次序见[扩展调用的台账](docs/public-api/extensions.md#扩展调用的台账)与[结构换代与未完成判断](docs/public-api/extensions.md#结构换代与未完成判断)。协调器内部用纯归约计算扩展调用的状态与聚合效果，这是实现手段，见[机制页](../agent/docs/architecture/mechanisms.md#扩展协议的边界)。

RegisteredReads 只路由已登记只读协议，不接受任意 URL、方法或脚本，不允许读取接口产生业务效果；非确定读取结果须先保存再影响后继。RegisteredReads.read 返回 captured 前已经耐久保存原 schema/value/source，回执丢失用 lookup 按 action/passage/original 认回。重复同 action/完整输入返回原值，异参数冲突。外部查询未知不得改用当前新值假装旧判断输入；excluded 须排除迟到捕获，只有原协议仍能重建原输入时才能重试。

扩展返回须按声明位置、干预力、来源和当前资格二次检查。各位置、维度与干预力允许的输出以[位置输出表](docs/public-api/extensions.md#位置输出表)为唯一依据，本节不重述。不合法的返回按拒收处理，拒收原因与后续处置见同页。stop 是需另行核权的控制请求，不是已取消回执。公共联合允许表达各位置的总集合，不意味着每个位置允许所有分支。

每卡 answered 不等于 processed。DecisionCards.read 返回五类结果：chosen、declined、remark、pending、invalidated。remark 是附言：人对卡片说了话，没有给出准驳，`text` 是非空的原话，处置见“[整批判断屏障与动作准入](#整批判断屏障与动作准入)”第 11 条。pending 表示尚无答复。invalidated 不冒充人的答复。整轮所需答复齐备后，Agent 以 `replay` 模式携带答复重新调用原扩展的原精确采用，回放绑定里的答复是 `CardAnswer` 或 `CardRemark`；该调用得到最终 Conclusion 时，该扩展调用的全部轮次才记为 processed。回放又返回 `ask` 时，Agent 为同一扩展调用开出新一轮，之前的轮次保持已答复。新卡片草稿与上一轮已答复的草稿相同时，按 `replayInconsistent` 处置并依 `onError` 形成最终 Conclusion，不开新一轮，人不被重问同一问题。不能携带回放绑定的方言返回 `ask` 时，按不合法输出处理，不出卡，见[作者协议的调用协议](docs/public-api/extensions.md#调用协议)。原扩展在处理答复时可以再经注入能力调模型或读取，这期间卡片保持已答复、未处理。必要卡片处理完成之前，该链不形成最终效果，链上的后续扩展不开始；后续扩展再出的卡片是后继轮次，仍属原批。执行动作之前位置上各链的并行、卡片呈现时机与整批屏障见下文“整批判断屏障与动作准入”。

压缩步骤的模型调用只经过压缩用途的调模型之前与之后两次经过，不经过主请求的那一次调模型之前位置。扩展用途的模型调用不经过这两个位置；它的请求准备以用途 `extension` 调用 prepare 并传空的 `beforeModelCall`，返回 needs-compaction 时不进入压缩计划，而是作为装不下的失败交回扩展。压缩用途与扩展用途的模型选择各用哪份历史依据，见[压缩用途与扩展用途的模型调用](docs/public-api/extensions.md#压缩用途与扩展用途的模型调用)。

每一轮卡片的 round 是稳定的 `CardRoundId`，是卡片轮次自己的身份类型，不复用 ActionId。present 的 identity 在保存卡片需求前确定，卡片端口按原卡请求去重，原扩展调用与卡片需求先保存后呈现。卡片轮次的已请求状态表示卡片草稿已入台账而呈现回执未知。返回未知时，lookup 使用已保存的 passage、round、original 和完整请求身份集合查询原呈现，不要求未知的 card DurableEvidence，也不要求旧 advance 仍有效；当前读取资格仍核验。presented 的 cards 按原请求顺序一一对应，不能遗漏未确认成员。批内只有部分创建时保持 unknown，拥有者持续完成原批或认回确定结果，不能重新问已创建卡。not-presented 需要排除原创建及延迟写入的证据；只有此前提和当前推进仍有效时才可继续同请求呈现。查询不可用保持失败，不能当 not-presented。

取得原卡后 read 返回的 chosen、declined 与 remark 都是人的原处理，不给默认批准或超时。卡片来自作者扩展，或官方准入以外的受信系统扩展（例如循环判断）时，由原扩展按原规则解释。卡片来自官方准入时，chosen 与 declined 按“[整批判断屏障与动作准入](#整批判断屏障与动作准入)”第 6 条处置。两种来源的 remark 都按该节第 11 条处置。declined 表示没有答案，不授予动作，Agent 不因此重问同一张卡。Tool 内部 Ask 只经 Tool 的受信内部 acceptDecision 端口，不接到 Agent 扩展的卡片中。

条件终结之前，Agent 只完成当前必要处置，并固定由存续保管方接续的卡片责任，不为结束执行而先作废尚无答复的卡片。tryFinish 固定的卡片责任见“[终结责任清单](#终结责任清单)”。执行终结后，未清的卡片责任由长期 reconcile 按原身份接续，不需要 runtime，规则如下。

1. requested 但 present 结果未知时，责任不是“无卡片”。reconcile 沿同一 passage、round、original 与请求身份集合调用现有 lookup。
2. lookup 返回 presented 后取得原 cards。not-presented 只有排除了原呈现和迟到呈现才可关闭该项。unknown 或 unavailable 保留原待办。
3. 对存在的卡片，reconcile 用稳定派生的同一 invalidate operation 调用现有 invalidate，reason 指向原终态处置。
4. 答复与作废在同一排序中裁定。已成立的答复保留，其余卡片作废。
5. 返回丢失时以同一 operation 重试 invalidate，不创建新卡片或新的 invalidate 身份。invalidate 同 operation 同输入认回原结果，异输入 conflict，由原提供者保证迟到调用不重复作废。

对账得到的原卡片事实经 commitSettlement 的 record-card-reconciliation 合入原卡片责任，见“[commitSettlement 的变体](#commitsettlement-的变体)”。

AgentMaterials 只保管材料及可解释版本，不拥有工作推进。preserve 同 identity/consumer/内容认回，冲突拒绝。Model 结果不走 preserve 后再绑定 custody 的路径，由结果接收方按“[接收共同提交](#接收共同提交)”保存。通用材料端口及 Tool 的既有保管协议保持有效。孤立材料在绑定未知期间保留，不能超时删除可能已经被外部协调者引用的内容；清理须得到原操作排除或全部消费责任终结的证据。read 每次核权，缺内容明确故障，不能把元数据摘要当正文。processed 路径只保存业务所需完成依据，不强制全文第二副本。

Agent 是 Tool 的普通调用方，以 `ToolInvokeRequest` 经 `ToolRuntime.invoke` 发 direct 调用。`ActionJudgment.allowed.request` 使用这个公开请求，不使用受信 `FixedToolRequest`。请求的 `availability` 原样取自请求组装保存的可用性结论，Agent 不重算或改写它。Tool 的受信入口绑定来源、调用方式及内部固定请求。programmatic 子调用由 Tool 原协议拥有，Agent 不另造来源。`acceptDecision` 是 Tool 受信内部端口，普通 Agent 不因持有 ToolRuntime 获得它。

脚本入口只暴露明确许可且当前合法可用的工具。扩展修改生效参数或包装工具转调目标时保留编排来源，不能借父脚本批准扩大目标权限。原整批判断屏障继续适用；已知参数的同批动作先完成共同判断，动态产生的新目标动作重新准入，不自动算入已批准批次。脚本宿主不能直接取得 executor 或全局 Cordis Context。此规则不定义完整脚本语言、宿主、调度或恢复协议；实际脚本桥接实现须按 Tool 的持续义务验证。

#### 循环守卫

循环守卫阶梯 L0 至 L4 的产品规则归 [J-AG08](../../../.meta_harness/design/product/agent-progression/design.md#j-ag08)，系统位置归系统页的[循环守卫与终态扩展](../../../docs/architecture/runtime/loop-extensions.md#循环守卫与终态扩展)。Agent 对守卫保证下列行为。

1. 守卫的唯一计算者是循环判断这一受信系统扩展。它在调模型之后位置、主请求的完整回复维度运行，不由作者声明。检测算法与阈值是它的策略，以配置项 `loopGuardPolicy` 的精确采用确定，见[工厂配置](../agent/docs/public-api.md#工厂配置)。Agent 不写死阈值，也不把连续否决数直接当作阶梯。
2. 它经执行历史读取能力读本执行已可靠保存的原始工作事实：模型调用与回复、回复准入结论、动作批与结果、它自己以往卡片轮次的结果、费用、step。它不读压缩后的视图。读取记入其 Passage 的 `read` 操作，重放时认回同一值。
3. 它经守卫判断记录能力记录一份 `GuardFact`，记入其 Passage 的 `guard` 操作。效果采纳时 Agent 把该 Passage 的最后一个 `guard` 操作写入 checkpoint 的 `guard`，成为 Agent 自持的守卫事实。这项能力只注入给它，作者声明需要时装配拒绝。形状见[公开接口页](docs/public-api/README.md#身份原位置与纯求值)。
4. L1 与 L2 的干预消息由它以 `inject` 给出，经消息准入以系统提醒来源进入历史一次。L4 不记为守卫事实：L4 就是它以 `ask` 给出的请求人处理。所以 L4 的人工等待就是这次扩展调用在卡片上的等待，执行停在调模型之后位置之内，不在 I8 另开等待。答复到达后它以 `replay` 重新调用，能力先按原序号认回已记录的操作，它的新判断记在新的序号上。答复是附言时，按“[整批判断屏障与动作准入](#整批判断屏障与动作准入)”第 11 条的扩展情形处置：附言原样交给它，后果由它决定。它读到自己上一次 L4 卡片呈现确定失败时，不再以 `ask` 给出同一处置，按策略改判。
5. I8 只读最新守卫事实，不追加消息：`level` 为 3 时形成 kind 为 `guard` 的失败候选，`basis` 取该守卫事实的 `basis`。`level` 为 0 至 2 或守卫事实为 null 时不改变去向。L4 的卡片呈现确定失败时，人无法被询问，Agent 按[整批判断屏障与动作准入](#整批判断屏障与动作准入)第 11 条代写该扩展调用的结论。调模型之后位置没有动作，也不提供否决，所以第 11 条中关于动作拒绝与整批屏障的部分不适用：结论取报错分支，输出为 `observed`，效果在 M4 照常继续，守卫事实按第 7 条保持上一次的值，执行不进入没有答复来源的等待。
6. 守卫事实随 checkpoint 持久。压缩、崩溃、换执行挂接与 runtime 换代都不清零，新 step 不清零。恢复后读到的守卫事实与中断前相同。runtime 顺序复用不沿用上一执行的守卫事实。
7. 循环判断不可用时，Conclusion 记不可用分支，守卫事实保持上一次的值，Agent 不伪造判断。它报错时按后置位置的报错规则处置，守卫事实同样保持上一次的值。
8. 守卫判断的费用归原 Agent 执行。守卫事实缺依据时不编造通过，规则见“[性能、诊断与维护](#性能诊断与维护)”。

#### 整批判断屏障与动作准入

模型完整回复先经“[消息准入](#消息准入)”判定结构合法，由 Ja 进入历史，之后其中全部 `tool_call` 部件组成一个 ActionBatch。每个动作有自己的 ActionId、原参数与生效参数。类型形状见[公开接口页](docs/public-api/README.md#身份原位置与纯求值)的 `ActionBarrier`，作者可见的语义见[扩展作者协议](docs/public-api/extensions.md#整批判断屏障与动作准入)。节点次序归 Loop 算法页。

动作的原调用只取合法的 `tool_call` 部件。回复中的 `tool_call_incomplete` 与 `tool_call_unparsed` 部件不可执行，不进入动作批，Agent 也不把它们改标为 `tool_call`。`tool_call` 的 `name` 是非空字符串但工具未知，或 `arguments` 是合法值树但不满足该工具的业务参数规则时，该调用结构合法，照常进入动作批，不被执行。业务参数规则由 Tool 的实际参数准入判断。工具未知时在哪一步拒绝尚未确定，见开放问题[工具未知的调用在哪一步被拒绝](../agent/docs/architecture/open-questions.md#工具未知的调用在哪一步被拒绝)。Agent 不猜测工具，不修复调用，也不把这类业务拒绝当作结构非法。结构非法的调用使整条回复在消息准入被拒收，见“[消息准入](#消息准入)”。

判断按下列规则进行。

1. 同一动作的执行动作之前链按声明顺序串行，后一个扩展读到前一个扩展的有效改写。不同动作的链并行，互不等待，也互不读取对方的 Conclusion。
2. 官方动作准入是每条链末尾的受信系统扩展。它经 ActionAdmission 端口取得当前准入。端口输入的 `permissions` 是按需要名的一组读取 `NamedCapturedRead`：每项的 `need` 是官方准入所声明的需要名，与扩展声明 `needs` 的 `name` 同义，名字互不相同，次序按声明次序。空列表表示没有读取，不表示有授权。官方准入声明为必需的需要读不到时，不论是 `fresh` 还是 `replay` 的调用，都等同官方准入不可用，本批全部动作被拒绝；作者扩展与受信系统扩展的不可用处置和它一起写在“[声明判断](#声明判断)”的 `needs` 一段。读取怎样产生归读面的拥有者，本契约只定形状。端口输入的 `decision.answer` 携带该卡片唯一有效的人的处理，即 `CardAnswer` 或 `CardRemark`。准入结果：allow 记为该动作的 allowed 判断并保存准入证据，deny 记为 denied，need-decision 按卡片草稿出一轮卡片，unavailable 使本批全部动作被拒绝。端口返回 denied 或 unavailable 的 Failure 时，按 unavailable 处理。全拒时不放行任何动作，也不出卡。同批其他链已开出但尚未呈现的卡片轮次不再呈现。已呈现的卡片由 Agent 以 DecisionCards.invalidate 作废其中尚无答复的卡片，已有答复保留。这些已询问的扩展调用不再以 `replay` 调用。同批仍在运行的链不再被等待：其中尚未开始的扩展调用不再开始，正在进行的调用结束后其 Conclusion 只记录不采纳，链末不再调用 admit。
3. 同批每条链都到达最终 Conclusion 或合法等待之后，Agent 才一次呈现本轮全部卡片。呈现前，卡片轮次已经提交为已请求。
4. 屏障在三个条件同时成立时打开：每条链都有最终 Conclusion，每张卡片都已处理，至少一个动作被允许。卡片所属轮次为 processed 或 present-failed 都计入“已处理”；以呈现失败结束的链计入“有最终 Conclusion”（第 11 条）。屏障状态与打开依据随 checkpoint 提交。屏障打开之前不发起任何已获准的动作，一个动作已经被允许不能越过其他动作尚未完成的判断。
5. 原扩展消费答复后再次返回 `ask`，或后继扩展返回 `ask`，都开出新一轮卡片。新一轮有新的 round，仍属原批，屏障继续关闭。
6. 人明确拒答是答复。它向原扩展返回没有答案，不授予动作。它不是批准，也不等于人不同意。卡片来自作者扩展时，由原扩展决定后果。卡片来自官方准入时，由授权领域按 [AU-05](../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验) 判定。附言也是答复，处置见第 11 条。Agent 不因没有批准重问同一张卡。重复或并发的答复不产生额外许可，一张卡片只有一个有效答复。
7. 动作、生效参数、工具定义采用或影响批准的授权依据改变时，旧批准失效。官方准入以新值重新判断，可能再次出卡。无关的配置变化不重问。准入检查、人看到的卡片与实际发起使用同一份生效参数。参数只在两处改变：同链在官方准入之前的扩展改写它，或人选择卡片草稿 `proposedRewrite` 绑定的那个选项。第一种情形下，官方准入按改写后的参数判断。第二种情形下，`proposedRewrite.option` 指向草稿 `options` 中的一项，人的答复 `chosen` 等于该项时改写生效：卡片来自官方准入时，官方准入在 `replay` 中先把生效参数换成 `proposedRewrite.effectiveArguments`，再带答复按新参数再次判断；卡片来自作者扩展时，由该扩展在 `replay` 中以 rewrite 输出这一改写，之后链末官方准入按新参数判断。
8. 屏障打开后，Agent 按原动作顺序把获准动作交 Tool 发起。发起请求（`ToolInvokeRequest`）的 `batchDecision` 在屏障打开时填入屏障打开的依据，发起时随请求交给 Tool。Tool 按原准入证据、当前主体资格与当前权限再核，规则见 Tool 的[发起的完整前提](../../tool/tool-contract/SPEC.md#发起的完整前提)与 [P04](../../tool/tool-contract/SPEC.md#p04-实际发起围栏)。再核分两段，撤权在实际发起处生效，不以旧允许发出。
   - `accepted` 返回原调用引用与原受理回执。Agent 保存 associated 后进入 T0，dispatched 槽位不把原回执冒充当前状态。
   - `commit-unknown` 带原调用引用。Agent 保存 associated 后以 lookup 查询。not-accepted 不能排除来源继续签发，须沿原 invoke 接续。
   - `association-unknown` 无调用引用。Agent 保留 intent、完整原请求和 consumer，以当前资格重复原 invoke，不进入需要 associated 的 Tool 生产者视图。
   - `rejected` 只确定拒绝本次尝试。保留事实证明该逻辑动作没有已受理或未决的较早尝试时，才建立 denied 槽位，单结果经过的 outcome 为 denied。首次确定拒绝且此前无未知符合条件；较早未知之后的新拒绝本身不符合。否则保留原 intent 或 associated、fixed 完整请求、consumer、effect intent 与未决保管责任，不建立 denied，不覆盖 dispatched、result 或 background。缺槽位表示未决，不表示拒绝。
   - Tool 受理之后、实际启动之前在启动围栏处拒绝：Tool 调用已经存在，Tool 按自己的规则以 unavailable 终局与未启动的效果收场。该动作的槽位为 result，带这个 Tool 终局，单结果经过的 outcome 为 executed。
9. 判断阶段本批全部动作被拒绝时，屏障记为 all-denied。屏障打开后，只有每个动作都确定拒绝且保留事实证明没有已受理或未决的尝试时，才适用无工具等待规则。不能从全部当前响应为 rejected 推导不存在 Tool 或批次可以推进。Agent 仅为符合上述确定拒绝条件的动作按原顺序建立 denied 槽位，单结果经过、候选消息与消息准入的进度记在槽位中，随 checkpoint 保存。被拒绝的动作各自经过执行动作之后的单结果范围，不经过整批范围。拒绝原因与每个动作的拒绝消息保存，经消息准入后进入回复，Loop 沿已有事实重新求值。
   较早尝试未决或已知受理时，保留屏障原 open 决定，不改为 all-denied，该动作不能以新拒绝授权批次完成。其他动作沿原独立发起与逐槽处理规则继续。恢复复用同一逻辑动作和当前合法资格：association-unknown 重入完整原 invoke，已知引用沿 Tool 原 lookup 与 invoke 恢复。lookup 的 not-accepted 加后来 rejected 仍不可靠排除原调用。资格不可得或被撤销时保留未知及交接、结算责任，不伪造资格。当前接口不能证明解决时允许继续未决，不新增 Tool 否定证明接口。
   原受理认回后沿原动作槽位继续 dispatched、result 或 background 的保管、逐槽处理与解除路径，不产生竞争的 denied 结果。T3 不把缺槽位视为齐备，T5 不把该动作视为已完成。
10. 本批尚无答复的卡片按“[扩展、卡片与材料](#扩展卡片与材料)”的终态后卡片规则处置。条件终结之前，Agent 不为结束执行而作废这些卡片。执行终结后，长期 reconcile 按原身份作废它们。已有答复保留，不因作废改写。
11. 卡片端口的两种情形按下列规则处置。
    - 人对卡片有话说，但没有给出准驳：read 对 Agent 返回 remark，带原话 `text` 与依据。附言是答复。Agent 不自行把附言读成批准，也不读成人不同意，附言的含义按卡片来源由原扩展或授权领域解释。附言是这张卡片唯一有效的人的处理，计入该轮已答复。原话由人在回路领域保存，Agent 不合成人的同意或不同意，见 [INV-HI11](../../human-intervention/human-intervention/SPEC.md#inv-hi11-合法拒答拒绝与故障不混同)。Agent 不因没有批准重问同一张卡。附言按卡片的来源处置：
        - 卡片来自作者扩展，或官方准入以外的受信系统扩展（例如循环判断）：Agent 以 `replay` 把附言原样交给原扩展，回放绑定里该卡片的 `answer` 是 `CardRemark`，后果由原扩展决定。依据是人在回路产品的 [J-HI02](../../../.meta_harness/design/product/human-intervention/design.md#j-hi02-在动手之前处理-agent-的请示)：有效答复保留原话并回原请示位置，原 agent 把原话作为指导。依据也是系统页的“[等待与恢复](../../../docs/architecture/runtime/loop-extensions.md#等待与恢复)”：卡片答复回到原等待，而不是转换成一句聊天后让新模型猜测含义。
        - 卡片来自官方准入：Agent 以 `replay` 再调用官方准入，ActionAdmission 端口输入的 `decision.answer` 为该附言 `CardRemark`。附言是自然语言的授权表达，授权领域按 [AU-03](../../identity/authorization/SPEC.md#au-03-授权表达与适用范围) 解释，按 [AU-05](../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验) 判定。解释器读出准驳时，准入按授权的现行规则返回结果，Agent 按第 2 条处置。解释器未提供、不可用或读不出准驳时，附言不形成批准，准入返回 deny，`reason` 为 `human-guidance`。这时该动作的判断为 denied，`evidence` 是这次准入的证据。该轮卡片记为 processed。审计凭这次 `admit` 调用的输入与它返回的 deny 证据，确认拒绝来自官方准入。该动作的 `action-denied` 拒绝消息携带附言原话，模型据此作为指导。该链以官方准入的最终 Conclusion 结束。拒绝结果经拒绝消息回到模型，由模型作答。之后仍要执行该动作时，它作为新动作重新发起，再经过准入。原话交给准入的依据是人在回路产品的 [J-HI03](../../../.meta_harness/design/product/human-intervention/design.md#j-hi03-处理系统的放行卡片)：原话交原准入及授权拥有者按现行规则解释，是否形成授权及其范围由原规则决定，文字本身不自动批准动作。读不出准驳时不合成批准、原 agent 把原话作为指导并调整后再请示的依据是 [J-HI02](../../../.meta_harness/design/product/human-intervention/design.md#j-hi02-在动手之前处理-agent-的请示)。拒绝消息带原话、模型据此作为指导的依据是[决定台账](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)的 J10（官方准入卡以“人给出指导”拒绝）。
    - present 确定失败，即返回 denied 或 conflict：该轮卡片所属的动作被拒绝，拒绝依据标明系统准入故障及真实原因。该轮卡片记为呈现失败，同一扩展调用早先已答复的轮次一起记为已处理，发出 `ask` 的扩展调用以拒绝 Conclusion 进入已结论，不再以 `replay` 调用。这条 Conclusion 由 Agent 写入：取报错分支，error 写明卡片呈现失败，output 为 veto，故障依据保存在该轮的呈现失败记录中，审计以该轮状态区分它与扩展自己的结论。该动作的判断为 denied，该链结束，第 4 条按此计入。本批全部动作都因此被拒绝时屏障记为 all-denied。Agent 不登记人工等待，不伪造人的拒答。规则见 [INV-HI04](../../human-intervention/human-intervention/SPEC.md#inv-hi04-授权决定仅在允许范围与真实资格内生效)。present 返回 unavailable 或 commit-unknown 不是确定失败，按上文以 lookup 认回。这一规则对官方准入的卡片与作者扩展的卡片都适用，作者扩展的卡片不另沿扩展错误策略处置。扩展自己执行报错是另一种情形，按该扩展的 `onError` 处置。

卡片的唯一有效答复、答复与原等待的一致交接、批次只阻塞原等待范围、拒答与故障不混同，归人在回路领域的 [INV-HI06](../../human-intervention/human-intervention/SPEC.md#inv-hi06-一张卡片只有一个有效人的处理)、[INV-HI07](../../human-intervention/human-intervention/SPEC.md#inv-hi07-答复和原等待可恢复一致且交接无空档)、[INV-HI10](../../human-intervention/human-intervention/SPEC.md#inv-hi10-批次只阻塞其原等待范围) 与 [INV-HI11](../../human-intervention/human-intervention/SPEC.md#inv-hi11-合法拒答拒绝与故障不混同)。准入结果的四类与人工决定的授权含义归授权领域的 [AU-04](../../identity/authorization/SPEC.md#au-04-当前准入与结果) 与 [AU-05](../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验)。Agent 消费这些结论，不自己解释权限模式。

#### 工具执行与结果承接

屏障打开后，Agent 按下列规则发起获准动作并承接结果。全拒时的拒绝槽位也按第 3、5 条处理。节点次序归 Loop 算法页。

1. 并发上限：获准动作按工厂配置 `toolConcurrency` 并行发起，超出上限的动作按原动作顺序等待名额。上限是可序列化配置，见[通用工厂](../agent/docs/public-api.md#工厂配置)。Tool 自己的并发与排队规则另行适用。
2. 逐槽保管：每个动作有一个 ActionSlot。真实结果到达，或 Tool 确认转后台并给出耐久占位时，Agent 按原动作身份把结果或占位保管到该槽位。真实结果保管之后，Agent 解除该结果的生产责任。本句不适用于 Tool 的推送路径：推送路径下 Tool 宿主收到 saved 后自己解除，见开放问题 [AGENT-M05](../agent/docs/architecture/open-questions.md#agent-m05)。后台占位保管之后，Agent 只释放占位这一版本的前台交付。原 consumption 的结果责任不因占位而释放，最终结果仍以它到达，见本节第 8 条。最终结果的保管与释放见[机制页](../agent/docs/architecture/mechanisms.md#等待消费与退出)。Tool 的失败结果也是可消费的结果。
3. 单结果经过：每个结果槽位与拒绝槽位各自经过执行动作之后的单结果范围，含结果卸载这一受信系统扩展的改写。单结果经过，以及该槽位相关的 Agent 自身事件（`producer` 与 `entry`）的分配，不等待其他槽位。拒绝槽位的 outcome 为 denied。后台占位不经过单结果范围：该槽位的候选消息由占位直接形成，`each` 为 null。
4. 整批经过：本批每个动作都已有槽位（等待并发名额的获准动作尚未建立槽位，所以本条不成立），全部槽位都具备结果、后台占位或拒绝，全部单结果经过都结束，且至少一个槽位已发起时，Agent 运行一次执行动作之后的整批范围。已发起指 Tool 受理了该动作，槽位曾为 dispatched。该范围只允许 observed、inject、stop、ask，不改写候选，不撤销工具的实际效果。后台槽位在整批 subject 中的 outcome 为 executed，terminal 为 null。全部动作都被拒绝时不经过整批范围，见上文“整批判断屏障与动作准入”第 9 条。
5. 消息准入：单结果经过之后、整批经过（如有）之后，Agent 按原动作顺序对每个槽位先以 P 固定候选，经 `MessageHandoff.prepare` 取得准入结果，再以 Ja 把结果与真实历史同次提交。槽位的 `handoff` 记原 H 的引用，准入进度随 checkpoint 保存，恢复时不重复提交已进入历史的消息。拒收的后果见下文“消息准入”。
6. 发起前再核：Tool 在实际发起处按原准入证据与当前权限再核，Agent 不以旧允许代替这次再核。两段再核各自的槽位结果见上文“整批判断屏障与动作准入”第 8 条。
7. 后台：转后台保持原 Tool 执行身份、原 PendingCall 与原消费关系。Agent 不接管 Tool 的协程或内部等待，不启动第二次工具。后台占位足以满足该槽位，当前步骤不等待后台的真实结束。后台关系与许可归 Tool 的[前后台的关系边界](../../tool/tool-contract/SPEC.md#前后台的关系边界)。
8. 迟到结果：后台的最终结果以原 PendingCall 的 consumption 到达，由 Loop 在合法的后继位置消费。它不改写原槽位的占位，不重开已结束的批次。执行已无推进资格或已终结时，合法保管方只保管与对账，不推进业务。
9. Tool 内部 Ask：Tool 内部等人的等待归 Tool 执行。Agent 只把它投影为 tool-active 的 waiting human，不为它出卡，不把它转后台。人的答复经 Tool 的受信内部 acceptDecision 端口回原等待。它与扩展的卡片是两件事。

#### 消息准入

消息准入是 Agent 自己的规则，不经过扩展。Agent 经 MessageHandoff 端口把候选消息交提供者按来源校验，经 Journal 把准入结果与真实历史关联。准入结果、真实历史应用与公开 invoke 或 submit 的成功是三个不同事实。类型形状见[公开接口页](docs/public-api/README.md#扩展人工卡片与材料)的 `MessageSource`、`HandoffPrepare`、`HandoffOutcome` 与 `HandoffResolution`。

一次准入涉及四个操作身份。它们各有自己的完整语义输入与结果，不混用。

| 记号 | 操作 | 内容 |
| --- | --- | --- |
| P | Journal 的准备记录操作：`commit` 带 `handoff.prepare` | 在任何 prepare、模态转换或由准入触发的外部效果之前保存完整 PendingHandoff，把它纳入终结责任闭包，并把 `checkpoint.currentHandoff` 设为 H。P 可以与冻结候选的既有来源提交合并。P 的 `request.predecessor` 等于该次提交的 expected。首次 P 的 `predecessorHandoff` 为 null |
| H | 准入原操作：`MessageHandoff.prepare` 的操作身份 | 规范值是 `request.reference.operation`，其他 H 引用都指向这个值。内部 H 从租户、execution、本次 P 的 `request.predecessor`、来源种类与稳定位置派生，Journal 在 P 中保存它的完整值；恢复不从新挂接的 revision 或当前 predecessor 重算。外部 H 的派生见“[输入内容与水位线](#输入内容与水位线)” |
| Ja | 应用操作：`commit` 带 `handoff.resolve` 或 `handoff.retire` | 把原准入结果与真实历史、来源接续和 message 事件同次提交，或把已 excluded 的内部 H 退役。每次正常来源应用只有一个 Ja。changed 之后不能用同一个 Ja 配不同 expected 或 checkpoint：先排除原 Ja，再按重新求值规则派生新的应用尝试，仍引用同一 H |
| Rh | 保管记录操作：`recordHandoff` | 把原结果或排除及其责任合入现有 execution，不发布历史。规则见“[准入结果保管](#准入结果保管)” |

P、首个 Ja 与 Rh 的保管根各从 H 加自己的固定阶段派生。(H, 阶段) 只派生首个 Ja。原 Ja 被排除之后，新的应用尝试按机制页“[操作身份的确定派生](../agent/docs/architecture/mechanisms.md#操作身份的确定派生)”从新的 revision 派生，仍引用同一 H。Rh 的后继按“[准入结果保管](#准入结果保管)”的保管链派生。Journal 核对 P 的 source、position、candidate 与该 checkpoint 的原生产者、槽位、Passage 或计划相符。同一来源位置在旧 H 未定时不能另建 H。只有 Ja 的 resolve 或 retire 成功后才能清除 `currentHandoff` 或移到后继，Rh 不改这个指针。`ActionSlot.handoff` 是 `HandoffReference | null`；主回复、系统提醒与压缩转换消息的 checkpoint 保存同形的来源引用。完整结果都由 `ExecutionSnapshot.handoffs` 解析，`FailureCandidate.message-rejected` 的 `from` 与 `evidence` 指向同一个原 outcome。来源引用不是第二份权威。

`MessageHandoff.prepare` 有三个判别分支，每个分支都是完整形状：execution 带 PendingHandoff 与当前 advance；invoke 带 InputHandoff 与本次真实的 InvokeRuntimeContext（instance、scope、definition、grant）；submit 只带 InputHandoff，没有 advance、runtime、current 或 grant 字段。解析器拒绝不适用的字段，不忽略伪造的物理字段后猜分支。`InputHandoff` 的 entry、source 与 reference 由运行时解析器交叉核验。返回值按完整原 request 与 origin 绑定，不能因本次调用的 kind 相同就认定属于同一 H。提供者按下列顺序处理 prepare。

1. 先核形状、租户与本次主体资格。主体资格只在一个位置核验：runtime 在已核验的公开操作之内调用时不再次核验，直接调用由提供者在实际执行处核验，分工见“[主体资格核验](#主体资格核验)”。invoke 分支核实际 instance 的发起资格与真实运行绑定。submit 分支核原 execution 的当前提交资格，不核实例、挂接或槽。
2. 核稳定身份与完整原请求。内部请求必须能认回 P 的权威记录。外部请求按 Ki 原子查找或建立 InputEntry 到 H 的索引，不从本次 instance 派生身份。已有记录先比较原业务内容，返回其完整原 request 与 origin。原结果已固定时，同输入的调用认回原结果，这项认回先于 advance 的判定。
3. 需要开始或接续准入工作时，execution 分支再核当前 advance，advance 已被取代返回 stale-advance。`PendingHandoff.originalAdvance` 只作审计，不是恢复资格。重新调用原 prepare 时传当前 advance，提供者核它有权接续同一原 execution 与原来源，原 request 不变。
4. 首次调用在提供者的耐久记录中同次保存 Ki 与 H、完整 request、按入口判别的 origin、原主体的稳定身份、资格依据、精确实现采用与全部原材料。已有记录只认回，不用本次主体或路由重写来源。提供者不保存凭据。保存确认之前不做转换或其他效果。
5. 有转换效果时，提供者在本记录下固定其原操作与输入，按转换契约恢复。每个实际发起点仍核当前资格，较早的准入不能代替它。lookup 永远不发起或重复这些效果。
6. 提供者保存完整的 prepared 或 rejected 结果，然后才返回。prepared 保存确切的可提交消息与准入依据。rejected 保存 reason、evidence 与原请求。传输超时不能制造 rejected。

prepared 表示准入结果已耐久固定，消息尚未进入模型或人侧历史。它不表示输入已分配、checkpoint 已前移或压缩已提交。`prepared.message` 可以包含准入完成的合法表示转换，它绑定原 candidate、来源与转换依据，消息身份与来源语义不变；压缩消息的 covers、retained、derivation 与 commitment 不经准入改写。Ja 使用这个确切的 `prepared.message`，不使用未转换的内存副本。外部输入的完整 AcceptedInput 不被表示转换覆盖：Journal 保留原 content、source 与 priority 用于原输入身份的相等与追溯，`inputs` 仍返回原可靠受理内容，实际历史消息与原输入有显式关联。`HandoffOutcome.qualification` 是原准入依据，不是重试的当前许可。

| 来源 | 谁调用 prepare | 原完整输入的首个耐久拥有者 | prepared 的同提交边界 | rejected 的耐久表达 |
| --- | --- | --- | --- | --- |
| 外部输入 | Agent 在 invoke 或 submit 的受理之内，以 invoke 或 submit 分支调用。原 open 或 submit 的真实受理才是公开成功 | 准入提供者的受理前记录（preadmission）。coordinated 路径另有原上游受理记录 | 原 open 或 submit 共同保存 accepted input 的完整内容、输入水位线、适用历史引用与贡献、准入记录引用与原成功结果。Q2 所需的来源核对与贡献同提交。上游已可靠受理并写入历史的输入，只认回来源与分配，不双写 | 提供者保留原 rejected。invoke 或 submit 返回原 invalid，字段为 value，原因为拒收原因。不建输入、消息或 execution |
| 模型完整回复 | Agent 在原调用真实收场之后，以 execution 分支调用 | I3 之前的 P 与原 ProducedResult 的保管记录 | Ja 同次保存真实消息、admitted 的 ModelReplyAdmission、拒收投影所需的原事实与接续，回复进入历史并解析动作。caller 固定为 none，主回复仍是 Journal 的核心义务 | Ja 保存 rejected 的 ModelReplyAdmission 与原 handoff 引用。原结果与费用保留，原调用照常收场，不交给重试。否决投影的连续数与累计数加一；退避后新 step 发新调用，连续否决不设次数上限。当前不能推进时 Rh 只记录结果，不提前改变否决计数或新 step |
| 工具结果 | Agent 在单结果经过之后、整批经过（如有）之后，按原动作顺序以 execution 分支调用 | T5 对应稳定 action-slot 的 P，原结果或拒绝事实的保管记录 | Ja 同次保存真实消息、ActionSlot 对 H 的引用、message 事件与接续 | Rh 或当前合法的 Ja 保存完整 rejected，H0 读取它。原结果、效果与费用保留，不重跑工具，不伪造替身结果。执行仍有推进资格时，H0 把原拒收交 F1 提出该执行的失败候选；没有推进资格或已终结时只保管，见下文“H0 的路由” |
| 被拒绝的动作 | 同工具结果 | 同工具结果 | 同工具结果，拒绝消息进入历史 | 同工具结果。拒绝事实与拒绝原因保留 |
| 系统提醒 | Agent 在扩展返回 inject 之后，以 execution 分支调用一次 | 原 Passage 的 Conclusion 已保存，再由 X5 准备 P | Ja 同次保存提醒、原 inject 应用引用与接续，提醒只发布一次 | 提供者与 handoff 责任记录保留 rejected。提醒不进入历史，不改变该扩展的 Conclusion，不改变推进。Passage 的 Conclusion 不改，拒收不写入 Passage |
| 压缩转换消息 | Agent 在 derive 返回 transition 之后，以 execution 分支调用 | 原压缩计划、完整 derive 材料与 P | Ja 同次保存摘要消息、合法范围、retained、派生与 commitment 的核验结果、新 epoch、Agent 接续与 message 事件，生成 committed 的转换依据。规则见“[请求准备与压缩](#请求准备与压缩)”第 7 条 | 不提交任何转换。当前推进者可按原 rejected 形成 cannot-fit（after-compaction），否则只保留原事实 |

对模型完整回复、工具结果，以及 Agent 自己产生的系统提醒、压缩转换消息和被拒绝动作的拒绝消息，消息准入提供者只因校验失败或保存失败拒收，不作业务否决。业务否决不在本端口。

模型完整回复的结构校验以共享消息的 `judgeMessage` 为准，各部件的规则见 [`@omne-harness/message` 的公开接口](../../common/message/docs/public-api.md#语义)。`judgeMessage` 在第一个非法部件处拒绝整条候选，并给出该部件的 `blockIndex`，不剔除非法部件后接纳其余部件。所以 `tool_call` 部件缺少 `name` 或其他必填键、`name` 为空或不是字符串，或 `arguments` 不是合法值树时，整条回复按上表“模型完整回复”一行拒收。同一回复中合法的工具调用也不形成动作，不被执行。原结果、费用与来源照常保留，不以静默剔除代替拒收。

Model 提供者把这样的调用当作已封闭的调用交出，属于提供者违约。Agent 仍按 `judgeMessage` 判定，不以类型断言代替判定。被中断、没有完整收场或仍含 `partial` 部件（Model 的 [`ResultPart`](../../model/model-contract/SPEC.md#普通调用面与实例观察)）的 Model 结果不构成模型完整回复，其中的调用不进入动作批。

外部输入的内容政策归输入受理方：它在交给 Agent 之前对外部输入做内容处理，例如展开、脱敏或否决。这些处理在受理边界完成，Agent 只看到受理后的内容。独立调用路径的最小提供者集合尚无拥有者，登记在[开放问题](../agent/docs/architecture/open-questions.md#独立调用路径的最小装配由谁拥有)。Agent 不实现消息的长期保存。Agent 仍保证自己的执行耐久与消息交接前提：P 先于 prepare 提交，准入结果经 Ja 与真实历史同次提交，恢复时按 H、P、Ja、Rh 各自的身份认回，已进入历史的消息不重复提交，rejected 的候选不进入历史。

模态转换是提供者的义务。候选来自 Tool 内容 ref 以外的来源，并且含需要转换的块时，提供者在固定 prepared 之前调用系统装配的转换件完成转换。Tool 内容 ref 不在准入前加载，在 Model 实际请求时加载。转换的时点、失败分类与适用块归 [request-context 的 RQ-04](../../context/request-context-contract/SPEC.md#rq-04-模态与可追溯表示) 与 [Model 转换件共同契约](../../model/model-contract/SPEC.md#转换件的共同契约)。Agent 只看到 prepared 的消息与派生表示，不理解模态细节。

##### 查看原准入结果

`MessageHandoff.lookup` 读取原准入结果。它不运行 prepare，不转换内容，不写历史，也不发起或重复任何效果。提供者在实际执行处核本次读取资格（read-message-handoff），不要求旧 advance，也不要求旧实例仍存活：外部 input 分支以逻辑 Ki 与原归属核当前读取资格，内部 execution 分支以原执行归属核权。当前主体没有资格返回 denied，来源核验不可用返回 unavailable，两者都不披露对象是否存在。没有可信迁移或原记录读取能力的绑定返回 unsupported，见“[输入内容与水位线](#输入内容与水位线)”。查询带了旧资格依据不构成放行。

lookup 的结论有三种。recorded 返回真实固定的 prepared 或 rejected 结果，并带完整原 request 与 origin，恢复者不依赖旧调用栈。excluded 带排除依据与完整原 request、origin，表示原 H 的 prepared 或 rejected 结果、转换效果、在途效果与延迟完成都已排除，旧调用已永久封闭；已保存的请求意图与排除记录保留。unknown 的 `original` 在请求已耐久保存时返回完整原请求、origin 与记录引用，不能可靠取得时为 null；null 只表示没有取得材料，不证明从未调用。简单查无记录只能返回 unknown。lookup 不自己写封闭事实，尚不能提供排除证明的提供者保持 unknown。

已 excluded 的 H 不再接受 prepare：prepare 返回 unavailable 并携可诊断的原封闭引用，完整排除由 lookup 读取，不伪造 rejected。unknown 之后仍沿同一 H，不以新 H 绕过未知。只有读取资格时只能 lookup，不能借只读结果发起新的转换或首次受理。

##### 内部 H 的排除与退役

Journal 权威的 P 是发现源：即使提供者尚无 H，`load` 与终结责任清单仍能给出原 H、完整 PendingHandoff、P 的提交依据与取消 control。当前有效取消已成立、请求已存而尚无任何转换效果时，O0 或 reconcile 在当前收束与保管资格下调用 `MessageHandoff.exclude`。它不运行转换，不写 Journal，不修改 checkpoint，不发布历史，不要求旧 advance。提供者从工厂固定的可信 Journal resolver 核验 P 的完整 request 与已成立的 cancellation control，调用方给出的 PendingHandoff 或 control 身份本身不是证明。它先核当前租户与 exclude-message-handoff 资格，再核来源：源不可读为 unavailable，当前资格拒绝为 denied，缺原 P resolver 或持久封闭能力为 unsupported。它不把无记录当作成功排除。

每个 H 的 prepare 注册、转换发出权的保留和 exclude 进入同一耐久排序。转换发出权必须在实际发出前保存，记录完整原转换操作与输入；已保留而尚未确认是否发出的工作也算在途。恢复沿这个转换身份，不另发一份新操作。发出点仍核当前资格，较早的 prepare 不能在取消后取得新的效果权。

| exclude 的权威观察 | 原子动作与结果 |
| --- | --- |
| P 成立，H 尚无记录 | 保存完整 P 与 request、取消来源及不可逆的 H 封闭墓碑，返回 excluded |
| H 请求已保存，尚未保留任何转换发出权 | 在同一顺序封闭 H，保留原请求，返回 excluded |
| prepared 或 rejected 已固定 | 返回 recorded 原结果，不改成 excluded |
| 发出权已经保留、转换在途或迟到完成不能排除 | 返回 unknown 并保留原请求。生产者按原操作恢复实际结果后保存 recorded，或取得真正的排除证明后固定 excluded |
| 同 H 已封闭 | 认回同一 excluded。任何迟到的 prepare 都不能重新注册或取得发出权 |

跨进程实现必须把转换 dispatcher 的持久保留与围栏连到同一权威操作，或给出同等强度的已采用协议证明。进程锁、取消 RPC 成功、空查询和“先看标志再发出”都不兑现它。exclude 按 H 与原 P 幂等，取消来源作为真实历史依据保留，并发的合法取消引用不覆盖已有结果。lookup 只读封闭结果，不执行 exclude。Rh 可以把 recorded 或 excluded 合入 Journal 闭包，unknown 保持终结责任未定。

excluded 不授权重发。当前执行仍有合法推进时，E4 在确认排除后按新的持久前提重新求值并建立新的来源尝试；它不能重跑已有 Tool，也不能改动原结果。没有推进资格或已 ended 时只保存原排除与责任处置，不产生新消息或失败候选。旧 H 永不重用。内部先执行 `handoff.retire`，再建立带 `predecessorHandoff` 关联的新 P。外部 Ki 永久指向原 H，不为同一 O 自动生成后继 H。

`handoff.retire` 是 `commit` 的一个具名 Ja 变体，只适用于可信 excluded 的内部 H，在当前 advance、完整 expected、同一来源与 `currentHandoff` 等于 H 下提交。Journal 同次保存原排除与退役依据，令 history 为 not-applicable，清除 `currentHandoff`，保持 `checkpoint.position` 的原来源节点值，由 E4 从该节点重新求值。原 ActionSlot、ProducedResult、Passage 或压缩请求及其结果不变。`ExecutionHandoff.retirement` 保存原 Ja、该次 revision 与退役依据，只有 retire 能从 null 建立它，Rh、prepare 与 lookup 都不写它。retire 不带新 effects、业务事件、replyAdmission 或非 none 的 CallerCommit。只有认回 retire 已 committed 后，E4 才能在新前提下形成后继 P，保存 `predecessorHandoff` 等于 H；H′ 的 predecessor 是新 P 的 expected。新尝试仍消费原已保存的生产者结果。retire 的 ACK 丢失先查 Ja，不凭指针已空猜提交，也不另建 H′。当前已取消、推进权失效或 ended 时不运行 retire，Rh 只保存原排除或结果责任，checkpoint 中的旧 H 可以保留；终结责任清单依据真实 resolution 与合法处置判断该责任已封闭或由谁保管，不从 `currentHandoff` 非空推断仍须业务发布。

内部请求的 origin 为 null。外部请求不因 I1 失联、旧 grant 失效或一次主体撤权自动封闭 H，原业务请求仍可由当前合法的入口接续。外部逻辑意图最终撤回的认定与封闭由原输入拥有者的协议另定，本契约的 exclude 不扩展到该分支，见[开放问题](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。

##### 真实历史的提交点

`handoff.resolve` 是原准入结果与本次来源应用的关联，不要求提供者在事务中重新运行 prepare。Journal 核对 outcome 的真实原记录与 P，再按来源决定自己的新事实：prepared 的 Ja 同次写入实际历史与来源接续，rejected 的 Ja 只写原拒收及该来源允许的接续。`CallerCommit` 的 message 与 context-transition 载荷保持：Journal 逐字段核对它与 H 的确切 outcome 一致，message 的 source 指向原 handoff 记录、admission 指向同一 prepared 结果，context-transition 的 value 来自 `request.source.transition`、admission 指向同一结果；任何不一致都是 invalid，不任取一份。

三个结果各有唯一事实。提供者的 HandoffOutcome 只回答原准备成功或拒绝，固定后不变。Journal 的 `HandoffHistory.committed` 只回答这个 H 是否真的发布及属于哪个 Ja；retire 已 committed 只代表退役完成，history 仍为 not-applicable。公开 invoke 或 submit 的受理结果只由原 open 或 submit 的原结果回答。H 的 prepared 不在 Ja 之后被改写成另一种成功。

绑定声明了对应的外部共同提交种类时，T5 与 inject 必须发 message，C3 必须发 context-transition。绑定未声明时，这些调用使用 caller 为 none，但 Journal 的固定历史组合必须在同一事务内履行同样的核心历史义务：它不能省略 `handoff.resolve`，也不能把 prepared 当作已写历史。主回复与外部输入的核心同提交历史义务不转换为外部 CallerCommit.message；外部协调者若要为这些事实写自己的历史行，由同一 Agent 历史组合登记承担，入口分别是 replyAdmission 与 open、submit 的明确分支，与外部 CallerCommit 分支共用历史事实的唯一写者，不双写。

独立装配的 `jointCommits` 为空只表示没有外部 CallerCommit 请求。合法的历史拥有者可以与 Journal 共用同一存储提供者，仍拥有历史解释与范围保护。绑定在工厂开始之前固定它的历史拥有者 Adoption、原准入记录 resolver、实际共享事务域身份，以及 message 与 context-transition 两个提交处理器；工厂从可信的绑定构造结果核这份登记。没有这个实际组合时工厂返回 unsupported，不创建一个稍后用两次写入兑现的 runtime。能力声明只是需验证的契约，不是证明。Agent 不导出数据库事务句柄，也不允许任意业务回调充当处理器。外部协调者的组合与独立历史组合各自给出真实登记与原子性证据。

一次 Ja 的提交点同时核当前主体与推进资格、完整 expected、原 H 的真实结果、来源位置、消息未被另一 Ja 应用，以及历史拥有者的当前前提。一个 H 至多一次历史应用；后继 Ja 的重试认回原 receipt，不再次插入。参加者或历史写入失败时，Agent、来源与历史全部回滚；提供者已固定的准入结果可以保留，因为它没有历史可见性。ACK 丢失只查原 Ja。Rh 与 Ja 竞争时，已 committed 的历史处置不被 Rh 改回 pending 或 retained，Rh 只补齐缺失的原结果。终态已固定 retained 后任何 Ja 都不得发布该 H。prepared 是已完成的 H 结果，pending history 是尚未应用的来源责任，两者不合并为一个“完成”标志：普通完成先处理仍适用的来源责任，不因 H 已 prepared 就越过它；complete 不把仍适用的 pending history 直接归入 retained；failed 与 cancelled 的保管处置各有合法结论与真实承接依据，不由调用者上传一个 disposition 绕过来源应用。已确定 C3 转换非法而进入失败收束时，清单保留原 prepared 结果、未成功的 C3 操作与真实非法依据，tryFinish 依该失败候选固定 retained，不为结束执行发布非法转换。D020 的取消收束把未发布候选交给具名保管方，在最终终态事务里固定 retained 处置，不调用 prepare 或 Ja 补发消息；只有实际承接记录能结束这项责任，期限届满、无运行时或读取失败都不算承接。

`load` 返回全部未清的 handoff 责任，以及仍被原结果、来源 checkpoint 或终结清单引用的记录。底层可以采用可重建索引与同快照的受限分页，不要求复制消息大载荷。保留期覆盖原请求、原结果、认回与迟到排除责任；没有完成所有引用与责任释放，不能删除提供者记录或只保留哈希。

##### H0 的路由

H0 只读和路由。它没有新 operation、决策帧、快照字段或事件。它的输入是已核验的原 recorded 且 decision 为 rejected 的结果、原来源请求与当前执行事实。unknown、unavailable、denied 与 excluded 都不是拒收，不能伪造成 H0 的输入。当前仍可推进时，H0 形成 F1 候选的纯输入，F1 以自己的条件提交再次核当前资格与完整 revision；资格在 H0 与 F1 之间失效时 F1 不能保存失败，长期保管者仍可用 Rh 保存原拒收并对原 Tool 结果执行合法保管。已经 ended 时不调用 prepare、不写 F1，也不新建 execution。新的合法接手者可以在同 execution 继续原来源：它从 H 恢复完整结果，在当前合法位置重新决定是否可提交 F1；先前的只保管路由不是永久禁止，也不是永久授权。F1 未知时先查 F1 的原 operation，不重新构造另一个失败候选。O0 与 reconcile 处理 handoffs 的未清责任，不从 `reconcile.remaining` 为空推出 handoff 已清；终结核验使用原 H、来源、结果与历史处置，原结果仍 unknown 时按“[终结责任清单](#终结责任清单)”保持 unavailable。取消路径不借 prepare、Rh 或 H0 发起新的消息、Model 调用或卡片，也不把旧取消扩展的结果认回改成继续执行，取消收束的规则见“[取消判断与路线](#取消判断与路线)”。

##### 准入的结果与并发次序

| 条件 | 结果与责任 |
| --- | --- |
| 当前读、保管或写资格不允许 | denied，不披露原结果，不写新事实。旧记录与他人的责任仍存在 |
| execution 分支的 prepare 需要开始或接续工作，而 advance 已失效 | stale-advance。原结果已固定时同输入先认回原结果。submit 分支没有 advance，不因无挂接得到这个错误。lookup 另核当前读资格 |
| 同 Ki 或 H 配不同的完整业务输入 | conflict，不替换原 request、origin 与结果。当前 Access 或交入路由的变化单独核资格；invoke 的 runtime 与 grant 另核物理条件 |
| request、source、outcome、CallerCommit 或证明对不上 | invalid。已有成功结果不能被覆盖 |
| 正常消息校验得到真实否定且已固定原结果 | `HandoffOutcome.decision` 为 rejected。它不是 Journal query 的 rejected |
| 依赖暂时无法读取或可靠性状态不明 | unavailable 或 unknown，按端口类型保留未定，不改成 rejected 或 excluded |
| 缺历史组合、参加者、精确载荷版本或必要的业务响应通道 | 写前 unsupported，不保存一半 |
| Ja 的 expected 或历史前提失效 | changed。只有可靠排除该 Ja 后才重新求值。H 的已固定结果保留 |
| 任一写操作可能已经提交而回执不明 | commit-unknown，携该操作自己的身份。H 查 lookup，P、Ja、Rh 与原输入受理 O 查 Journal query |
| Ja 遇到 ended 或失效推进 | terminal 或 stale-advance，不能发布。当前合法的 Rh 可以保管真实原结果 |
| P、Rh、Ja 或 submit 建立新的 execution 事实 | 同提交一个新 revision。仅认回原结果不推进 revision。submit 不创建新的 execution |
| 新 submit 遇 ended | terminal，不改报 stale-advance、busy 或要求 attach。原已成功 O 的合法认回先于这项检查 |

MessageHandoff 的 prepare、lookup 与 exclude 同样按“[判定次序与失败映射](#判定次序与失败映射)”的优先级判定：当前资格拒绝先于原结果认回，原结果认回先于 stale-advance。

Journal query 的 rejected 只指 recordControl 的持久审计拒绝。Handoff 的 rejected 是另一协议的原业务结果，不扩大 query 的 rejected。H 的查找统一在 lookup；P、Ja、Rh 的成功认回仍是 committed。同 execution 的新准入按原来源顺序调度，lookup 不改变顺序。Rh 可以在不同原责任间并发，每次合入当前事实，不替换整份快照。Ja 与 attach、control、tryFinish 进入同一权威顺序：外部许可先失效则 Ja 拒绝，Ja 先提交则保留原合法消息，不回滚历史。

##### 准入的恢复切点

| 切点 | 权威可见材料 | 允许的后继 |
| --- | --- | --- |
| 内部 P 未提交 | 上一个完整 checkpoint，尚无 prepare 效果 | 查 P。确认 excluded 才重新求值，未知不发 prepare |
| P 已提交，提供者尚无 H，取消已成立 | P 的完整 H、request 与取消 control | 当前合法收束者调用 exclude。墓碑先成立则迟到的 prepare 不能进入，不以空查询结清 |
| P 已提交，prepare 已开始或在途 | 完整 H、request 与未清责任 | 当前合法推进者沿原 H 认回。失去 advance 时只 lookup、合法 exclude 或 Rh 保管。不能排除已保留或在途的转换则保持 unknown |
| 转换开始，prepare 结果未固定 | 提供者的原 request 与原转换操作 | 提供者按原操作恢复，Agent 不重做效果。终结清单保留未定 |
| rejected 已固定，Ja 未提交，随后崩溃并撤权 | lookup 返回完整原 request、rejected 与 reason | 当前保管者调用 Rh，H0 只在可读原事实后路由。无推进时 O0，不写 F1 |
| prepared 已固定，Ja 未提交，随后 ended | 原准入结果存在，历史未发布 | Rh 保留原结果与终态处置，不发布消息，不生成 message 事件 |
| Ja 在写参加者之后、写 Agent 之前失败 | 同一未完成事务 | 两侧都不可见。未知查 Agent 的 Ja，不补写单边 |
| Ja 提交完成，ACK 丢失 | 同一 Ja 的历史、checkpoint、事件与原结果 | query(Ja) 为 committed 后读取原 receipt 与证明，不再次 prepare 或追加历史 |
| Rh 提交完成，ACK 丢失 | 原 outcome 已入 handoff 闭包 | 查 Rh。Rh 的 committed 不等于 Ja 已发布 |
| H0 读完，F1 之前撤权或 ended | 原拒绝仍保留 | F1 在条件提交拒绝，O0 继续合法保管 |
| F1 已发，结果未知 | F1 的原 operation 与同一 H | 先查 F1，不再造候选 |
| C3 已提交，资格重签或 C4 之前崩溃 | 原 Ja、committed 的转换依据与新 epoch | 先认回、重签读取资格并读当前完整快照，再进入压缩之后位置与 resume |
| 外部 prepare 已拒绝，open 未执行，I1 换为 I2 | Ki 到 H 的映射，原 InputEntry、origin 与拒绝 | 当前合法恢复者按 Ki 认回原 invalid，不重判，不创建第二个 H 或空 execution |
| submit 已 prepared 或转换在途，I1 失联后无实例，再有 I2 | Ki 到 H 的映射、完整 request、origin 与原转换身份 | 没有实例的阶段也可由当前合法的 submit 入口接续。prepared 认回原结果，在途沿原 H 恢复。I2 不改变原请求 |
| execution suspended，I1 已 disposed，没有 I2，收到新 submit | 原 execution 的耐久视图、绑定与当前 Access | 原 submit 资格与协调前提成立后受理，不预约槽、不 attach、不改变 suspended。runtime 消失不是拒绝理由 |
| H 已 excluded，retire 未确认 | 原排除与 Ja 的完整请求 | 查 Ja，committed 后才允许新 P。取消时只由 Rh 保管，不推进 checkpoint |
| 外部 prepare 已准入，open 结果未知 | 受理前记录的原 H，加 Journal 的原 open 操作 | 先查原 open。committed 返回原受理，unknown 等待。查无 execution 不证明外部准入未发生 |

#### 卡片与准入端口的逐操作要素

输入与返回的类型形状见[公开接口页](docs/public-api/README.md#扩展人工卡片与材料)。每个操作都先核对 Access 的租户，带 advance 的操作在 advance 已被取代时返回 stale-advance。

| 操作 | 输入要点 | 成功返回 | 错误与未知 |
| --- | --- | --- | --- |
| DecisionCards.present | Access、advance、passage、round、原输入依据、完整有序请求 | 与请求逐项对应的卡片依据 | denied；conflict（同 round 异请求集合）；unavailable；commit-unknown，先 lookup |
| DecisionCards.lookup | Access、passage、round、原输入依据、完整请求身份集合 | presented、not-presented 或 unknown | denied；unavailable。查询不可用不是 not-presented |
| DecisionCards.read | Access、卡片依据 | chosen、declined、remark、pending 或 invalidated | denied；unavailable。不可用时保持原等待，不猜答复 |
| DecisionCards.invalidate | Access、操作身份、passage、round、卡片依据、原因依据 | 每张卡片的当前答复或作废依据 | denied；conflict（同一操作配不同卡片集合）；unavailable；commit-unknown |
| ActionAdmission.admit | Access、advance、execution、passage、动作、原参数、生效参数、定义采用、按需要名的一组读取（空列表表示没有读取）、人的处理（chosen、declined 或 remark，可空） | allow、deny、need-decision 或 unavailable | denied；unavailable；invalid（答复不属于该动作或该卡片）。成功返回的 unavailable 与 Failure 的 denied、unavailable 都使本批全拒，见“整批判断屏障与动作准入”第 2 条 |
| MessageHandoff.prepare | Access 与判别分支：execution 带 PendingHandoff 与当前 advance；invoke 带 InputHandoff 与本次 InvokeRuntimeContext；submit 只带 InputHandoff | HandoffOutcome：完整原 request 与 origin、provider、qualification、record，以及 decision 为 prepared（确切消息与准入依据）或 rejected（reason 与 evidence） | denied；stale-advance（只有 execution 分支）；conflict（同 Ki 或同 H 配不同的完整业务输入）；invalid（不适用字段，或 request、source 与记录对不上）；unavailable（来源不可读；H 已 excluded 时携原封闭引用）；unsupported（缺原 P resolver 或可信的 Ki 迁移能力）；commit-unknown，以 lookup 查询，不以新 H 重试 |
| MessageHandoff.lookup | Access、HandoffLookup：execution 分支带原 H，input-entry 分支带 execution 与原入口 O | recorded（完整 HandoffOutcome）、excluded（完整原 request、origin 与排除依据）或 unknown（original 可空） | denied；unavailable。两者都不披露存在性。查询不可用不是 excluded；unsupported（绑定缺可信迁移或原记录读取能力） |
| MessageHandoff.exclude | Access、完整 PendingHandoff、取消 control 的操作身份 | excluded、recorded 或 unknown，见“[消息准入](#消息准入)”的排除表 | denied；unavailable（源不可读）；unsupported（缺原 P resolver 或持久封闭能力）；invalid（request、来源或证明对不上，含请求不属于该 execution） |

| 操作 | 授权 | 幂等身份 | 并发与竞争 | 事件 | 生命周期 |
| --- | --- | --- | --- | --- | --- |
| present | 租户核对；advance 必须是当前有效的执行挂接；人在回路一侧另核呈现资格 | passage 加 round 加完整请求身份集合，同输入返回原卡片 | 同一轮只呈现一次；部分已创建时后续调用保持 unknown，由提供者完成原批 | waiting 事件由 Agent 在采纳 asked 时提交 | 卡片随扩展调用保留，执行终结后作废尚无答复的卡片 |
| lookup、read | 租户核对；读取资格不等于推进资格，不要求旧 advance 有效 | 只读 | 不阻塞答复的提交 | 无 | 终态后仍可读历史答复 |
| invalidate | 租户核对；由当前合法的终结者或保管方调用，不要求推进资格 | 操作身份 | 与答复提交同一排序：先成立的答复保留，之后的作废只作用于其余卡片 | 无 | 终态后调用 |
| admit | 租户核对；advance 必须是当前有效的执行挂接；授权领域按当前资格判断，Agent 不缓存 allow | 没有认回语义。每次调用都按当前资格判断，同一动作、同一生效参数、同一定义采用、同一组读取与同一答复也可以得到不同结果。恢复时 Agent 以 checkpoint 里已保存的 allowed 证据接续，不重调 admit；之后的撤权由 Tool 发起前的再核兜住 | 不同动作的 admit 并行；同一动作串行 | 无 | allow 的证据保存在 allowed 判断中，Tool 发起前再核 |
| prepare | 租户核对。execution 分支在当前推进之内调用，另核 advance。invoke 分支在 invoke 的受理之内调用，核实际 instance 的发起资格与真实运行绑定。submit 分支在 submit 的受理之内调用，核原 execution 的当前提交资格，不核实例、挂接或槽。主体资格：runtime 在已核验的公开操作之内调用时不再次核验；直接调用时由提供者在实际执行处核验，invoke 分支用操作名 invoke，submit 分支用操作名 submit | H：同 Ki 或同 H 配同完整业务输入认回原 outcome | 同一 execution 的准入按来源节点的次序串行；同 Ki 或 H 的 prepare 在提供者的同一耐久排序中先认回或冲突，再决定是否开始工作 | 无。message 事件由 Ja 的提交产生 | 结果由提供者耐久保存，保留期覆盖原请求、原结果、认回与迟到排除；excluded 的 H 永不重用 |
| lookup | 租户核对；主体资格（read-message-handoff）由提供者在实际执行处核验，目标是 input-entry 或原 execution；读取资格不等于推进或保管资格，不要求旧 advance 或原实例存活 | 只读 | 不改变准入顺序，不阻塞 prepare 与 Ja | 无 | ended 之后仍可读 |
| exclude | 租户核对；主体资格（exclude-message-handoff）由提供者在实际执行处核验，目标是原 execution；当前收束与保管资格，不要求旧 advance | 按 H 与原 P 幂等，并发的合法取消引用不覆盖已有结果 | 与 prepare 注册、转换发出权的保留同一耐久排序 | 无 | 封闭墓碑永久保存；只封闭原准备，不写用户消息或 Agent 终态 |

### 托管协调与运行实例

类型形状见[公开接口页](docs/public-api/README.md#托管协调与运行实例)。本节是输入受理、恢复与接管、Journal 提交、可靠输出、条件终结、取消判断与路线、终结责任清单、commitSettlement 的变体、共同提交、settling、detach、quiesce 与 handover 的唯一行为源，公开接口页只给类型形状。事件序号、游标与确认的行为在“事件流与读取”。

#### 时钟读取与等待

`AgentClock.now` 读取注入提供者的当前 UTC 时刻，成功返回 `AgentInstant`。成功值必须是 `@omne-harness/utc-instant` 的 `parseInstant` 接受的形式：大写 `T` 与 `Z`，没有数字偏移。
提供者无法取得有效时刻时返回 `unavailable`，`owner` 为 `agentClock`，不得返回伪造时刻。
这个读取不承诺单调性、物理时钟可信度或全局排序。
`waitUntil` 仍只等待给定时刻或信号中止。时钟不决定逻辑终态。

协调者新建带时刻的失败候选时，从 `now` 取得时刻，再纯构造 `FailureCandidate`。
取时失败时保留原准备与接续，不写失败候选，也不以系统墙钟或固定默认值替代。
已经形成的同一候选在提交重试时复用原时刻，不再次取时。
纯评估器不读取时钟。

#### 创建、登记与复用

装配者用已验证的 tenant、scope 和精确采用创建 idle runtime，并经宿主发布。reserve 和发布都不创建 execution，也不授予推进资格。调用方通过 invoke 交出首个输入的完整内容，由 Journal 提供者可靠受理新的 execution。execution 身份由调用方在受理前分配并保存，同一身份只能对应一个操作。invoke 只等待可靠受理，返回原 execution 的句柄，不等待 Loop 结束。命令的 accepted 表示已可靠保存，实际的 applied 或 unresolved 由事件或原操作查询给出。

resume 只恢复原 execution。它必须认回原执行及精确采用，不能在 invoke 中夹带任意 checkpoint，也不能因目录为空推断旧推进资格已排除。

runtime 可顺序承接多个 execution，同一时刻至多一个有效执行挂接。执行结束不撤登记，runtime 回 idle。普通新请求使用新的 execution 身份。插队沿原 execution，规则见“取消、退出与结构变更”的“插队”。恢复与接管保持原 action、call、admission、passage 和输入身份，替换推进者取得新的执行挂接。每个 execution 单独建立输入状态、取消状态、调用关联和事件游标，不沿用上一个 execution 的主体、授权、取消状态、输入队列和结果游标。定义解析和连接池等不可变或可重建的内容可以复用。

权限分面由装配者分别发放：connect 只给观察，resolve 在额外核验发起资格后给同一实例的 invoker，两者都不授予发布能力。执行输入、控制、输出与恢复是原 execution 的能力视图，其耐久操作由宿主的长期执行记录适配器提供，不以某个 runtime 的 fiber 存活为前提。宿主恢复入口按 execution 重新取得这些视图，活体句柄只用于活体观察和唤醒。断开旧的活体路由不删除执行视图或原记录。

登记有自己的身份和状态。发布返回类型化的登记身份，登记状态是 published、withdrawing 和 withdrawn。publish 与 withdraw 都带 Access 和操作身份：同一操作同一输入返回原结果，同一操作不同输入返回 conflict。withdraw 只撤销自己的登记，旧登记身份不能撤销后继登记。publish 的输入只含可序列化的身份与状态，其中的状态只是登记时的初值。runtime 状态变化时不重新 publish，只经登记句柄的 report 更新活体观察投影。运行对象如何交给宿主，属于宿主实现的装配接线，不是根契约操作。

后继登记只在实例重新发布时由宿主发起：宿主撤除登记后再次启用同一个仍然存活的实例，或宿主重启后重新发布仍然存活的实例。后继登记取代同一实例的旧登记。runtime 失联后重新启动的进程不是原实例，它使用新的实例身份，不继承原登记。runtime 只注入宿主为本实例提供的 AgentRegistrationHandle，用它报告状态和撤除本实例当前的登记，不能预约实例、发布登记或解析其他实例。观察只给获准的状态投影，signal 只关闭观察。目录键是显式租户与 AgentInstanceId。no-live-route 不证明工作结束或无人有资格。跨进程不能序列化本地运行对象冒充句柄。

#### 受理与单执行槽

invoke 先预约 runtime 的单执行槽，再由 Journal.open 幂等受理；resume 先预约，再由 Journal.attach 认回原记录。预约与槽共同防止重入：结果未知时保留预约，不释放槽再接另一项工作，open 明确未提交才释放。submit 不预约槽：它沿原 execution 的耐久视图受理，不要求活体 runtime、advance、grant、槽、resume 或 attach，规则见“[输入内容与水位线](#输入内容与水位线)”。首次 invoke 没有 execution 可供 P 或 Rh 写入，准入提供者先保存完整 InputEntry 作为受理前记录；它不占执行槽、不产生输入水位线、不授 advance、不触发开始扩展，也不使 invoke 成功。真正的新 open 才检查真实 runtime 的槽、绑定与适用 grant，并与协调参加者共同建立初始 execution、挂接与原完整结果；I1 与 I2 并发由当前资格与 Journal 排序决定唯一受理，晚到的旧请求不能再分配或重激活旧挂接。原 open 已成功的认回永久返回原 Authority，它只表达旧结果；I2 的新推进权另走 resume 与 attach。Journal 在存储受理边界核对当前围栏和 execution 修订号。并发的新 invoke 返回 busy，不进入隐藏队列，排队属于调用方治理。runtime 处于 draining 或 disposed 时，新的 invoke 与 resume 返回 unavailable，不预约执行槽。撤权与新效果的准入必须有确定的顺序：先读取资格、再发送的做法不成立。撤权先成立时，后续准入被拒绝，已经合法发出的调用沿原身份查询和控制。单机协程或 Cordis disposer 不替代围栏证明。

open 与 attach 由 Journal 提供者授予执行挂接：挂接身份、围栏代次和授予依据由提供者保存，并以 Authority 返回给 runtime。Journal 在写入之前核对绑定的协调模式与所需支持，在原子提交点核对当前资格、围栏与 execution 修订号。调用方提供的推进资格依据 grant 可以为空。grant 为空时，Journal 提供者单独授予挂接，这是独立调用路径。grant 非空时，它是外部协调者的推进资格依据，必须走“[提交参加者协议](#提交参加者协议)”所要求的共同核对：coordinated 绑定在同一次 open 或 attach 提交中核对它，核对失败返回 denied；standalone 绑定收到非空 grant 时在写前返回 unsupported，不把这次请求当作独立路径保存。coordinated 绑定在其授予规则要求 grant 时收到空 grant 返回 denied。某个 execution 首次建立时固定它的模式与不透明的外部关联，后续 attach 核对该关联，不允许经另一个 standalone 绑定降级。

#### 恢复与接管

resume 经 Journal.attach 为原 execution 取得新的执行挂接。attach 有两条路径。提供者按 execution 的当前状态与旧挂接的状态选择路径，调用方不选择。

| 路径 | 前提 | attach 成功的结果 | 旧 runtime 的去向 |
| --- | --- | --- | --- |
| 恢复 | execution 处于 suspended，旧挂接已经 detached | 新挂接 active。execution 回到 reconciling。旧挂接保持 detached | 旧 runtime 在 detach 交接成功时已经回 idle，不受本次 attach 影响 |
| 接管 | execution 处于 reconciling、advancing、waiting 或 settling，旧挂接仍是 active，例如旧 runtime 已失联 | 在同一次条件提交中，旧挂接转为 superseded，新挂接成为 active。execution 回到 reconciling | 旧 runtime 不再推进该执行。它的后续提交返回 stale-advance，这是它得知自己被取代的唯一途径。它交出本地资源后从 occupied 回到 idle。若它此时正在停用，则留在 draining，且该执行不计入剩余的交接 |

接管不要求旧 runtime 配合，也不等待旧 runtime 确认。已被取代的挂接不能提交、发起或终结。它的晚到回执只归原操作，不改变新挂接下的位置。原生产者仍可保存真实的迟到结果，规则见“并发与提交”。execution 处于 ended 时，attach 返回 terminal，两条路径都不适用。

接管需要独立的主体资格，操作名是 takeover。它不包含在 resume 的资格之内：只有 resume 资格而没有 takeover 资格的主体，只能恢复已经 suspended 的 execution。核验按下列次序进行。

1. runtime 先核验 resume 的资格，再读取原 execution 的快照。
2. 快照显示旧挂接仍是 active 时，runtime 以 takeover 另核验同一主体对该 execution 的资格。allowed 的依据随 attach 提交。denied 与 unavailable 按“主体资格核验”处理，resume 不进入 attach，也不写入任何状态。
3. 提供者在条件提交时按当前状态选择路径。提交时发现旧挂接仍是 active，而请求没有 takeover 依据，提供者返回 changed，调用方重读快照后重新核验。

经恢复入口的 detach 同样受这项资格约束：目标挂接是 active、且属于仍存活的其他 runtime 时，detach 另需同一主体对该 execution 的 takeover 资格，没有时返回 denied，不写任何状态。只持 detach 与 resume 资格的主体不能借恢复入口把存活推进者的挂接变为 detached 再恢复。宿主对自己停用的实例做 detach 不在此列，见“[交接与停用](#交接与停用)”。

宿主对实例失联的判断可以作为证据，放进 resume 的恢复依据一并提交，供追溯。它不替代 takeover 的资格核验：宿主认为失联，不等于主体有权取代当前的推进者。两个不同操作身份的 resume 互相取代的风险，由 takeover 资格与 attach 的条件提交共同限制。条件提交使同一 execution 同一时刻只有一个 active 挂接，被取代一方的提交返回 stale-advance。

新挂接之后，Agent 先对账原提交、原调用、原结果、原等待与原卡片，再回到原节点。对账按原操作身份做只读查询，Model 为 inspect。查询不改变调用生命周期，查询结果只用于判断。采用的事实以经生产者事实路径写进 Journal 的条目为准。已提交则采用原结果，未定则等待，查询暂不可用时保持未知，不推断失败、未发生或已完成。同一执行等待后被唤醒时，唤醒不是新挂接或接管。执行回到进入等待之前的状态，经 E1、E2、E4 重读后回原节点。只有被打断的首次认回会回到 reconciling。旧实例被取代后迟到的真实结果与费用，仍由合格的保管者保存。Model 交付经结果接收方的共同提交进入 Journal，Tool 保留既有 recordResult 路径。这一句不适用于 Tool 的推送路径（[结果接收](#结果接收)），见开放问题 [AGENT-M05](../agent/docs/architecture/open-questions.md#agent-m05)。两者都不要求旧挂接有效，也不恢复业务推进。每个切点的处置见[机制页的恢复切点表](../agent/docs/architecture/mechanisms.md#恢复切点表)，入口与回归节点见[Loop 算法页](../agent/docs/architecture/loop-algorithm.md#恢复入口与回归点)。

显式换代（reload）可以走任一条路径：旧 runtime 能够配合时，先 detach 再恢复。旧 runtime 失联时，直接接管。两条路径都由治理排序决定先后，先准备并验证新实例，再撤旧授新。换代的 recovery 须绑定 handover 验证过的原 execution 与修订号、源与目标 continuation 摘要、目标采用及转换后的 continuation 摘要。attach 条件核验该原修订仍适用，并共同保存转换后的接续。修订已变化返回 changed，调用方重新加载并核验，不拿旧证明接管新状态。兼容证明不授予推进权。

#### 输入内容与水位线

输入的完整内容经 invoke 与 submit 交给 Agent。Journal 提供者在受理时耐久保存内容、输入身份、来源依据和优先级。受理成功后，Agent 的执行耐久不依赖调用方另外保存这份内容。同一输入身份配同一内容时，提供者认回原受理。同一输入身份配不同内容时，返回 conflict。

独立调用者的来源依据为 null。外部协调者先在自己的可靠受理边界保存输入，再以同一内容和自己的来源依据调用 invoke 或 submit。Agent 保存来源依据用于追溯，不解释它的内容。非空来源依据是外部受理来源，必须走“[提交参加者协议](#提交参加者协议)”所要求的共同核对：coordinated 绑定在受理的同一次提交中核对原来源与分配，保护已受理内容与 execution 归属，不增加推进资格参数；参加者的响应按该协议处理。standalone 绑定收到非空来源依据时在写前返回 unsupported，不把它当作独立输入保存。外部协调者已受理而尚未交给 Agent 的输入，由提交参加者在条件终结时以冲突响应报告，tryFinish 不越过它们。

输入水位线指已可靠分配给该 execution 的输入边界，不能只用内存队列长度代替。inputs 返回该位置按规则应承接的完整有序批，内容来自受理时保存的内容。分页属于提供者内部，不改变批次语义。

外部输入的原入口索引 Ki 是（租户、execution、原 invoke 或 submit 操作 O）。准入提供者拥有 Ki 到原 H 的耐久映射。外部 H 由固定版本标签、Ki、入口种类与 InputId 派生，不含 instance、当前 grant、principal、连接、时间或不存在的 execution revision。目标 execution 是请求身份，不证明 execution 已建立。同 Ki 先比较完整原业务请求，再检查 H，所以更换 kind 或 InputId 不能逃到另一个 H；异 source、候选、内容、原入口或优先级都 conflict，原映射与结果不变。InputEntry 完整保存原 operation、execution 与 AcceptedInput，不含 instance 或 grant；invoke 另存首次 prepare 之前按原 definition 生成的完整初始 checkpoint，恢复从原 request 取回它，不用 I2 的新默认值替换；submit 没有初始 checkpoint。长期适配器、I1 与 I2 使用同一权威 Ki 命名空间与原 provider adoption resolver：新进程的空索引不代表首次调用，Ki 索引可从权威记录完整重建，恢复未就绪为 unavailable，没有可信迁移或原记录读取能力的绑定为 unsupported。

InputOrigin 是首次准入的不可变出处，由提供者首次写入，此后 prepare、lookup 与认回都返回原值；调用方不上传 origin。invoke 分支保留当时真实的 I1、scope、definition 与 grant。submit 分支由可信 Journal resolver 取得原 execution 绑定：executionBinding 指向含 tenant、execution、scope、精确采用、coordination 与不透明外部关联的原版本记录，该记录受 H 的保留责任保护，不能只留哈希；delivery 记录实际交入路由，runtime-view 的 instance 是原视图的可核验来源，不声称该实例现在存活，durable-view 表示首次交入确实没有 runtime 路由，不是 unknown。提供者从受信入口取得路由事实，不从请求参数、当前挂接或先前的 I1 猜造；来源不可确定时保留 unavailable，不填 durable-view 掩盖缺证。I1 失联、同一视图改走长期路由或当前主体变化都不覆盖 origin。原主体的稳定身份编码与首次资格依据另存在提供者记录，凭据不进入材料。origin 是历史事实，不授当前主体或 I2 权力。

Journal.open 的原始受理输入含原 invoke 的 InputEntry、原 H 的引用与本次真实的 InvokeRuntimeContext；首次 open 要求 scope 与 definition 与原 invoke origin 的固定采用一致，并使用原初始 checkpoint。Journal.submit 保留现有 ExecutionMutation 与完整 value，另带谱系判别与 original 关联：new-input 只允许 submit 原入口，Journal 核 operation 等于 `original.entry.operation`、原 origin 确为 submit、原 H 为确切 prepared，随后按新受理协议核协调来源与终结排序，不能把 invoke 的 `entry.initial` 改写成 submit 的 value 伪造首次来源；recognize-input 只表达“[原操作认回与恢复](#原操作认回与恢复)”允许的新 B 认回，Journal 核 B 不等于原 entry 的操作 A，并通过原 O 的权威受理记录证明 A 已可靠受理该 InputId，原 A 可以是 invoke 或 submit。invoke 原输入使用 `entry.initial`，submit 原输入使用 `entry.value`；成功认回要求它与本次 value 的 InputId、完整 content、source、priority 完全一致，并核 tenant 与 execution 归属一致。B 只在自己的权威结果记录中同次固定完整本次语义、B 的回执与真实的 A 来源；不把原事实改署为 B 新建立，不返回原 open 的 Authority，不新建 H、受理前记录、转换、分配、历史、事件或 execution revision。这个判别是内部受理输入，不增加公开 submit 的参数。

| 输入认回的条件 | 既定结果与写入界限 |
| --- | --- |
| 当前请求跨租户，或当前 submit 或适用认回资格已撤回；核验不可用 | denied；核验不可用为 unavailable。先于原事实、存在性、冲突或成功的披露。原记录不变 |
| 当前 O 已绑定完整语义，合法形状的重试改变 kind、InputId、content、source、priority 或原 entry、H、谱系 | conflict，包括谱系改成另一条本身真实的记录或伪造记录。按同 O 语义冲突处理，原成功不变 |
| 当前 O 已成功，完整语义与固定分支、原关联都相同，且当前认回资格成立 | 恢复该 O 的原成功，先于新写生命周期、ended 与 prepare。不重新解析成新分支 |
| 新 B 不同于原 A，A 已可靠受理同一 InputId，tenant 与 execution 归属合法，原谱系真实且内部一致；本次 content、source 或 priority 任一不同 | conflict。不能因本次完整 value 与真实原输入不等而返回关联 invalid。保持原 A、H、内容、来源、优先级与结果，不固定 B 的认回成功 |
| 新 B 引用的原谱系确证伪造，或 original 的 kind、entry、origin，原 H 与 entry，原 source、candidate、Ki、H 的内部关联不一致 | invalid。核的是原材料自身。原记录暂不可读或缺失本身不构成伪造证明 |
| 当前 O 没有可恢复的原成功，原 A 的受理仍 unknown、只有 H prepared，或原受理记录无法可靠取得 | 不答 B 认回成功。按原 O 与 H 恢复并保持 unknown 或 unavailable；prepared 不证明 accepted。不能据一次空 query 或当前请求差异宣称原输入已受理、未受理或可新 prepare |
| 新 B 的当前资格成立，原 A 可靠受理，原谱系真实且内部一致，完整 InputId、content、source、priority 与归属相同，并属允许的认回范围 | 只同次固定 B 自身的完整请求、回执与真实 A 来源，query(B) 与原方法重试共用该固定成功。不把 A 改署为 B，不新增 H 或 execution revision |

公开 submit 的入口先核当前资格，再按 O 与完整语义输入认回 Journal 的原结果：已 committed 直接返回原成功，不先运行 prepare、读取当前槽或重做来源分配；O 已发出而未定时先恢复 O，不因 H 缺席再发一遍。只有原协议的权威记录能确认尚未发出的请求才进入首次 H 准备，调用方的一次空 query 不提供这个结论。H 已固定 rejected 时原公开拒绝保持。当前 O 没有成功或未定责任后，入口先经可信原输入解析判断是否已有同 InputId 的可靠受理，再决定是否属于 recognize-input；只有原协议的权威顺序确认确为尚未受理的新输入时才进入 new-input 与首次 H 准备，认回材料缺失或原受理未定都不允许回退。长期适配器在准入前核当前新输入是否仍适用，包括 ended。准入与最终受理之间发生终结仍由最终的 Journal 顺序拒绝。

| 原 O 或 H 的权威状态 | 当前合法入口可做的事 |
| --- | --- |
| H prepared，O 从未发出 | submit 无活体也可沿原 O 首次受理。invoke 仍须真实实例首次 open。prepared 不是 accepted |
| O committed | 以当前认回资格取原 receipt 与完整结果，不要求 runtime。旧 open 的 Authority 不恢复效力，后继推进另走 attach |
| O 已发出而 unknown，含查询暂时查不到 | 沿原 O 查询与恢复，禁止第二次创建、换号或换 H。只重试原协议允许的同逻辑请求 |
| Journal 的 O 永久 excluded | 保留排除与 prepared。同一 O 的重试认回原排除结果，原样返回。排除之后的受控重新受理须由提供者按“[原操作认回与恢复](#原操作认回与恢复)”的要求证明新受理与旧迟到请求的区分和排序，本契约不自动复用或换号，这项证明登记为开放问题的 [U-13](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口) |
| H rejected，O 从未受理 | 在当前入口的认回资格下返回原 invalid（字段 value，原因为拒收原因），不重判，不创建 execution 或输入 |
| H unknown | 使用完整原 request、origin 与转换操作恢复，同 H 保持未定，不按当前实例新建 H |
| H excluded | Ki 继续指向原 H，lookup 返回排除。入口返回 unavailable 并携封闭诊断，不伪造业务拒绝；新的业务意图由原输入拥有者另定 |

只有读取权时只能 lookup 与 query，不能借 submit 取得写入许可。公开 submit 的重试核当前 submit 资格，撤回时返回 denied，另有读权的主体可以查原记录；当前资格不可用为 unavailable，都不泄露存在性。H prepared 后失去 submit 权时保存原准入结果，不执行 Journal 的新受理；已受理后撤权不抹除原成功，后续披露各核当前资格。

真正的新 submit 在与 control、attach、tryFinish 相同的权威顺序中核当前资格、原 execution、协调路径的来源、分配、关联与模式，以及原 H。成功同次保存完整原输入、水位线、适用历史、Ki、H 与 original 的关联、原结果与回执，并产生一个新 revision。它不创建 execution，不授 Authority，不变更挂接或 checkpoint，不占 runtime 槽，也不直接发 input-taken；活体只可在提交后收到唤醒提示，提示丢失不撤销受理，无活体时由后继的合法推进读取同一输入边界。suspended、detached、quiesced、disposed 与 no-live-route 都不使原 execution 的 submit 能力消失，合法 submit 不自动 resume；urgent 输入在没有当前调用时只保存应有的输入与插队责任，不对不存在的调用发控制。有效取消停止原业务推进，独立的外部 submit 仍按当前输入资格、原来源与协调分配协议判断，取消不新增“取消即 terminal”，也不授取消后的推进权；允许受理的输入保留原 execution 归属并进入取消终局处置，不自动转到后继 execution。tryFinish 先提交 ended 时新的 submit 返回 terminal；submit 先成功时终结必须重读并保留真实处置。取消、ended 或撤权都不把原 unknown 变成 excluded，不把 prepared 变成受理成功。入口提供者维护可重建的耐久受理前待办，含 Ki、H、完整 request、origin、转换、冻结的受理材料与原 O 的未定责任，不依赖 runtime 或调用方内存，也不另建第二个 AgentExecutionRecovery；没有 execution 时 Rh 不可用，原请求继续由入口提供者保管。TTL 不授权删除未清记录或重用身份。

#### 提交与保管

AgentJournal 保存带 expected revision 的 checkpoint、effect intent、事件和原操作结果。commit 原子覆盖 checkpoint、执行状态、稳定 effect intent、已分配序号的事件和操作结果。每次建立新 execution 事实的原子 mutation 分配一个新 revision，规则见“[执行修订](#执行修订)”。需要共同成立的消息、压缩记录及接续、结果保管，通过具名的调用方交接（CallerCommit）与提交参加者共同保存，协议见“并发与提交”。事件订阅与普通保存回执不能代替共同提交。

同一操作同一语义输入返回原结果，同一操作不同输入返回 conflict。本契约允许的新 operation 同事实认回按“[原操作认回与恢复](#原操作认回与恢复)”恢复。changed 表示 expected 已过期且本操作没有提交，调用方重读并重新求值。commit-unknown 保留原操作，先 query 再决定，不换身份重试。query 的结论有 committed、rejected、excluded 与 unknown 四种，见“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)”。excluded 必须排除原写入及延迟提交，不是简单的查无记录。rejected 表示原 recordControl 已被持久拒绝，调用方保留拒绝及其责任，不当作成功、排除或未知。通知只唤醒，不作为恢复事实源。effect intent 先可靠保存。Model 再用原 admission 受理；Tool 再用完整原 ToolInvokeRequest 经普通 invoke 关联。生产者受理及发出点另行核对当前围栏，Journal.commit 不预先授予未来的授权。

load 返回原控制命令、当前完成意图、effect intent、逐结果的责任台账、终态后观察台账、输出进度、已发行的终结责任清单 `finishObligations`（未发行时为 null）、结算投影 `settlement`，以及 handoff 责任的投影 `handoffs`（每项含原 request、resolution、history 与 retirement，范围见“[真实历史的提交点](#真实历史的提交点)”的末段），恢复不依赖旧命令的调用栈。大记录可以用同一快照修订号的受限分页实现，但不能用不完整数组冒充完整快照。

recordResult 供当前合法的保管方核对原结果版本和交付责任，不要求旧挂接有效。transfer 为 custody 或 processed 时，提供者在自己的共同提交边界建立保管或处理依据并更新结果责任，成功回执才能支持生产者确认。Model 的结果采用与账目接收使用“[结果接收](#结果接收)”规定的共同提交，不以此处的 custody、processed 或 release 路径完成。Agent 不把 saved 填入要求原生产者确认的 confirmed.receipt，也不把 Model 的 ACK 作为 Agent 收场条件。它不能修改 checkpoint、接受输入或发新效果。recordResult 不追加 producer 事件，由后继有资格的条件提交承担 producer 投影。transfer 为 none 时只核对已有责任与释放结果，confirmed 必须包含原生产者的确认依据。结果项、版本、消费位置与 transfer 逐项一致，冲突则拒绝。执行 ended 之后仍可调用，保管资格与业务推进权分别检查。结果对账不需要活体或新推进权，终态后只保管原事实，不再发起原业务。

#### 条件终结

Evaluator 提出终结候选的业务内容，协调者调用 Journal.tryFinish 条件终结本 execution。普通路径的次序固定：先完成真实的候选固定（F1）与落终态之前位置的经过（F2），再以 prepareFinish 发行终结责任清单，再 load 最新的完整 revision，最后 tryFinish。取消路径的次序固定：有效取消与必要撤权成立，建立或迁移取消候选，产生真实的判断记录，再 prepareFinish、load 最新的完整 revision，最后 tryFinish；规则见“[取消判断与路线](#取消判断与路线)”。清单的内容与发行规则见“[终结责任清单](#终结责任清单)”。tryFinish 不等待事件消费者返回批准，也不接收调用方的完成批准。它与 submit、control 和 attach 处在同一权威排序中，在最终提交点以同一权威核对当前资格、候选、expected revision、输入边界、责任闭包、适用的终态前判断，以及 coordinated 绑定的外部参加者。适用的终态前判断按候选结论区分：complete 与 failed 候选是落终态之前位置的作者扩展链经过，cancelled 候选是受信取消判断，取消不经过作者的终态前扩展。有效取消优先于普通完成或失败。依赖故障或查询未知不伪装成 blocked 或空队列。相同操作的重试认回原提交，未知先 query，再 load 原终结事实。

FinishIntent 是 Journal 维护的当前候选投影，各节点按下列规则写入。

1. F1 的 commit 只写候选的业务内容：origin、conclusion、failure、inputWatermark、checkpoint 与 conditions。Journal 据此建立 FinishCandidate 与它的 author route，并维护 FinishIntent 投影。
2. 候选身份 `candidate`、`obligations` 与 `beforeTerminal` 由 Journal 填写，调用者不写。普通候选的 `candidate` 是首次 F1 操作的 AgentOperationId，取消候选的身份规则见“[取消判断与路线](#取消判断与路线)”。`obligations` 在准备态为 null，由 prepareFinish 填入。`beforeTerminal` 在候选固定时为 null。
3. F2 把落终态之前位置的经过以普通 Passage 提交。该经过完成的那次提交成立时，Journal 把当前 author route 的 `beforeTerminal` 设为这次提交的依据。
4. tryFinish 输入的 `intent` 只用于与当前 FinishIntent 投影做相等核对，不写入任何字段。两者不相等时返回 FinishResult.changed。

candidate 同身份配不同业务内容返回 conflict。业务前提真正变化时建立新候选并保存旧到新的替代链接，不改写原候选。只发行清单、确认事件或保存与判断无关的迟到事实不修改候选，也不机械重跑 F2；业务前提变化仍须重新核对。

tryFinish 的结果按下表返回。

| 当前事实 | 结果 |
| --- | --- |
| expected 过期、候选被替代、输入的 `intent` 与当前 FinishIntent 投影不相等，或候选依据与实质前提已知变化，含新输入先成立 | FinishResult.changed。调用方重读并重新求值。不以 Failure.changed 代替 |
| 已确定有必要责任未清 | blocked，按 inputs、controls、operations、passages、custody 分类，指向具体责任。多项时按这一固定次序选择第一项，完整清单仍可经 load 读取 |
| 原操作未知，或当前资格、来源、完整闭包不可确定 | unavailable。保留原查询与责任，不转换为 blocked、已清或 excluded |
| obligations 未发行、伪造或指向另一个 candidate | invalid。真实的清单在发行后责任投影已改变时按 changed 处理，调用方重新 prepareFinish，规则见“[终结责任清单](#终结责任清单)” |
| 取消路线上判断记录确定缺失 | blocked，类别为 passages，依据指向当前 route 的 required-judgment 待办。不以空证明结束 |
| 取消路线上当前判断记录为 blocked，前提未变 | blocked，按该记录给出的具体责任类别返回，source 指向原判断记录与该责任。多项按 inputs、controls、operations、passages、custody 的固定次序选择第一项 |
| 取消路线上当前判断记录为 unknown | unavailable。保留原查询与问题，不返回 excluded、blocked 或 ended |
| 取消路线上当前判断记录为 allowed，清单真实，最终核验发现新的确定前提变化 | changed。旧允许不是永久许可 |
| 当前资格拒绝 | denied |
| 新请求遇已 ended | terminal。原成功的同输入重试先于这项检查认回原终结，不重判 ended |
| 写入未知 | commit-unknown。沿原 operation 查询，再 load 原终结事实 |
| 全部资格、候选、责任与参加者条件成立 | ended。同一次提交保存终态、最后事件、终局清单及各项处置、按固定采用生成的终态后观察责任与原操作结果 |

五类责任在 terminal 前须成立的条件，以及终态后可合法延续的责任如下。

| 类别 | terminal 前须成立 | 可合法延续的责任 |
| --- | --- | --- |
| inputs | 普通候选不越过待承接输入。取消候选保留所有 accepted input 的身份、内容、原归属及终局处置 | 按原归属供读取或由原拥有者处置。不自动路由到新 execution |
| controls | 适用的取消与必要撤权已经成立。相关后续职责由合法存续方承接 | “[六个阶段](#六个阶段)”允许的 producer-confirmed、physically-stopped、duty-released 真实迟到阶段 |
| operations | 可能改变候选的未定操作先恢复，不把 unknown 当未发生 | 已合法发出的调用、结果、费用和回执由原生产者与长期接收者负责 |
| passages | 必需的终态前判断有真实有效结果：complete 与 failed 候选是落终态之前位置的作者经过，cancelled 候选是当前的判断记录。未定卡片和调用完整保留 | 终态后按原身份 lookup、read、invalidate 和保管，不重跑扩展，不采纳新业务效果 |
| custody | 每项已收到且须交接的结果有真实完成依据或耐久保管，没有无人保管的窗口 | 原消费、释放确认、费用、未确认输出和固定观察按自身协议接续 |

cancelled 候选的终态前判断由具名、精确版本的受信取消判断承担，complete 与 failed 候选继续使用作者的终态前扩展链。判断的判据、安装、记录与旧取消记录的迁移见“[取消判断与路线](#取消判断与路线)”。判断记录不授予永久许可。

终结授权有两种。推进授权只用于仍然有效的普通完成或失败。取消授权必须对应已保存且当前适用的取消控制，结论只能是 cancelled，它不恢复旧挂接的推进权，也不允许借取消凭据提交 complete 或发新效果。取消授权不授予取消判断与收束资格，这两项资格由主体资格核验的 settle 操作名承担，见“[commitSettlement 的变体](#commitsettlement-的变体)”。两种资格都取不到时，旧实例停止推进并交接，由合法的恢复者沿原记录收束。取消后未处理的输入保留原归属和处置依据，不静默转入后继 execution。

普通 commit 的状态与事件排除 ended，也不能通过材料、recordResult、recordControl 或 detach 旁路创建终态。只有 tryFinish 能共同创建终态、最后事件、按固定采用生成的终态后观察责任和原操作结果。终态前判断绑定具体结论、输入边界、checkpoint 和条件依据，依据失效不能复用旧允许。`FinishIntent.beforeTerminal` 指向当前 route 的实际判断结果，由 Journal 填写：author route 按上文第 3 条设定，cancellation route 在判断记录保存后指向当前判断记录。tryFinish 核对它非空、绑定本候选并属于当前 route；取消路线上判断记录确定缺失时按上表返回 blocked。迁移清空当前证明指针，旧 route 记录中的证明保留。这项依据只记在 FinishIntent，结论本身不另带。终态后判断只读取已提交的终态，不等待人，也不产生新效果。

终结的提交保护由 Journal 提供者承担。独立提供者只裁定 execution 自己的结束，消费者无需提供终态回调，也无需在线确认才能结束。coordinated 绑定在同一次条件提交中核对外部已受理未交入的输入与适用的终态或取消事实，共同建立对应的终结贡献，不只比较 Agent 本地 revision，协议见“并发与提交”。外部协调者已受理而尚未交给 Agent 的输入，由参加者以冲突响应报告，tryFinish 返回 changed，即使本地 revision 没有变化。终结先提交时，后来的 submit 返回 terminal，新输入由协调者另行路由。无法兑现共同提交的装配被拒绝，不以先结束一方再结束另一方代替。

#### 取消判断与路线

cancelled 候选不经过落终态之前位置的作者扩展链。它的终态前判断由具名、精确版本的受信取消判断承担：判断只读各拥有者已核验的权威事实，给出允许、不允许或未定，并把判断耐久记录；它不发起新的 Model 调用、消息注入、卡片或人工问题，也不等待作者 veto。complete 与 failed 候选继续使用作者的终态前扩展链。原作者扩展不能阻止 cancelled 终结；当前事实不明、责任未交清或必要资格缺失仍能阻止终结。空判断、只检查 effects 为空、责任清单存在或非空 Evidence 都不能代替真实判断。取消控制不自行授予判断或收束资格。这条政策的采用依据是 [D020](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6371768059)，技术形状的采用依据是 [C2](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373297399)。

取消路径的次序固定：有效取消与必要撤权成立，建立或迁移取消候选，产生真实的判断记录，再 prepareFinish，load 最新的完整 revision，最后 tryFinish。迁移本身不是判断，也不是允许结果。责任分配如下。

| 责任 | 承载者及公开可核对的事实 |
| --- | --- |
| 固定候选的业务内容 | Journal 的候选记录。普通候选的身份复用首次 F1 的 AgentOperationId，取消候选的身份等于建立它的 operation |
| 选择当前的终态前判断路线 | Journal 的独立 route 记录。迁移只替换 route 指针，不修改候选或旧 Passage |
| 产生取消判断 | 治理安装的精确 `CancellationPolicy`。它只对 Journal 提供的权威事实投影求值 |
| 核验来源、当前资格与排序 | Journal 提供者及其可信的授权、治理与原拥有者读取适配。调用者不能安装这些依赖 |
| 保存新判断与原操作结果 | Journal 在一次权威提交中保存完整输入、结果、当前判断指针、receipt 和新 revision |
| 保留旧扩展及外部效果 | 原 Passage、生产者、卡片与材料拥有者继续拥有原记录。Journal 保留完整的发现索引与接续责任 |
| 最终结束与外域协调 | tryFinish 在当前权威边界再次检查本域责任与 coordinated 绑定的参加者。判断记录不代替共同提交 |

Journal 调用受信判断时，不把 Model、Tool、消息准入、卡片呈现、作者 invoke 或一般 Context 写权限交给它。它没有 `ExtensionOutput`，不能返回 inject、ask、veto 或新的业务动作。允许、不允许与未定是取消政策的事实判断，不是作者的干预力。

##### 候选与路线

候选与路线的形状如下。

```ts
type FinishCandidate = Readonly<{
  candidate: AgentOperationId
  origin: Evidence
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: Evidence
  checkpoint: AgentCheckpoint
  conditions: Evidence
}>

type FinishRoute =
  | Readonly<{
      kind: 'author'
      record: Evidence
      candidate: AgentOperationId
      policy: Adoption
      plan: readonly LegacyF2Entry[]
      beforeTerminal: Evidence | null
    }>
  | Readonly<{
      kind: 'cancellation'
      record: Evidence
      candidate: AgentOperationId
      control: AgentOperationId
      policy: Adoption
      installation: Evidence
      origin:
        | Readonly<{ kind: 'native'; operation: AgentOperationId }>
        | Readonly<{ kind: 'migration'; operation: AgentOperationId }>
    }>
```

`LegacyF2Entry` 是 not-started 或 recorded 的封闭联合，内容见“[commitSettlement 的变体](#commitsettlement-的变体)”的 MigrationRecord 字段表。`origin`、`conditions` 与其他 Evidence 都必须解析到原拥有者保存的固定记录，不能只保存摘要。候选保留 `AgentCheckpoint` 的完整值，或使用具有相同读取契约的永久版本引用；当前 checkpoint 被取代后，候选仍可恢复。这里保存的是候选的必要材料，不改变公开操作只读取当前 checkpoint 的既有含义。

候选的 conclusion、failure、inputWatermark、checkpoint 与 conditions 一经建立不变。当前 route 指针、当前判断指针与 obligations 是另外的事实。取消 route 自身不可变，当前判断指针不进入判断记录的绑定输入。`ExecutionSnapshot.settlement.currentJudgment` 是当前判断记录的 AgentOperationId 或 null。`FinishIntent` 是当前候选的投影：`candidate` 固定候选，准备态 `obligations` 为 null，`beforeTerminal` 指向当前 route 的实际判断结果。迁移后该投影可以从旧证明变为 null，旧 route 记录中的证明仍保留。调用者不能写这些投影字段，Journal 的填写规则见“[条件终结](#条件终结)”。候选同身份配不同业务内容返回 conflict。业务前提真正变化时建立新候选并保存旧到新的替代链接。只发行清单、确认事件或保存与判断无关的迟到事实不修改候选，也不机械重跑原终态前判断。

##### 旧记录的选择

对未 ended 的旧 cancelled 候选，保留原候选，新增一条迁移记录，把该候选的 author route 替换为 cancellation route。候选原来的业务内容不变。新判断记录与旧 Passage 有不同身份与公开种类。

对取消前的 complete 或 failed 候选，其结论已经失效。必须新建 cancelled 候选，新候选的 `candidate` 等于其建立操作。替代记录保存原候选、新候选、取消 control、发生时的 revision 与旧 route。原候选的原请求、Conclusion、卡片及费用进入新候选的责任发现范围，不进入新候选的允许证明。

旧数据没有 `candidate` 字段时，以真实的首次 F1 操作为候选。迁移须读取其固定成功记录及完整业务内容，不以当前状态位置、最新 checkpoint 或新造 ID 猜原 F1。原 F1 未定时先 query 原操作。找不到原记录且不能证明它不存在时，保持缺证未完。

##### 安装记录与资格

治理拥有一份不可变的 `CancellationPolicyInstallation`。Journal 提供者在受控装配入口取得它及相应实现。调用者的请求只引用该记录，不能提交实现、回调或自签资格。

| 字段 | 类型与约束 |
| --- | --- |
| record | Evidence，治理安装记录 |
| decision | Evidence，解析到取消政策及适用技术协议的具名采用 |
| policy | Adoption，完整的 owner、name、revision、digest 四项精确匹配 |
| inputSchema | Adoption，判断输入及判据的精确公开版本 |
| implementation | Adoption，实际只读判断实现的精确版本 |
| legacyProtocols | 只读数组，每项含旧协议 Adoption、旧 checkpoint schema Adoption 与原协议识别规则的 Evidence。只映射精确旧版本，不按名称接受最新版本 |
| admission | Evidence，治理允许新采用与取消专用迁移的范围、签发方及当前状态的读取来源 |

`policy` 是 Agent 产品与技术拥有者固定的受信取消判断协议的采用，不是任意扩展的 Adoption。治理安装实际的四元组、输入规范及实现的固定 digest 后本协议才可运行；运行时缺任一项返回 unavailable，决定评论的文本不能替代可核验的安装。安装的提供者是装配交付的依赖，登记在开放问题页的[端口提供者缺口](../agent/docs/architecture/open-questions.md#端口提供者缺口)。旧策略没有单独保存 policy 字段时，治理的历史发行登记必须能从原 definition、checkpoint schema 与精确扩展采用恢复当时的终态协议；该映射固定版本并保留来源，不把当前扩展配置反推为历史策略。迁移只解释原记录的格式与归属，不执行旧作者代码。

settle 与 migrate-cancellation 两个操作名的资格范围见“[commitSettlement 的变体](#commitsettlement-的变体)”。迁移者须同时具备两者，Journal 还核对治理安装的当前迁移范围包含原精确协议、目标 policy、该租户与该 execution；授权适配器的 allowed 来源、治理准入版本与实际检查目标保存进迁移记录的 qualification。通过已经核权的 runtime 协调入口调用 Journal 时，继续遵守“[主体资格核验](#主体资格核验)”的不重复核验规则；直接的长期恢复入口必须完成相同的资格核验。Journal 在最终提交点核对授权结果的适用性及治理的当前准入，不只消费远早于提交的本地 allowed。迁移记录的 qualification 保存实际发生的那一次核验的归因：经 runtime 协调入口时是该入口已完成的核验，经直接的长期恢复入口时是该入口自己完成的核验。qualification 另保存 Journal 在提交点的适用性核对。不重复核验不表示运行时路径不保存归因。治理撤销或切换政策准入与 execution 写入共用可比较的权威条件：提供者必须能在迁移、判断、prepareFinish 与 tryFinish 的提交点核验其当前状态。这里不为全局治理另造 execution revision；读取到的治理版本是事务条件，治理改变使该条件失效时不提交，重读后按 changed 或资格拒绝处理。没有共同条件检查能力的绑定不能宣称支持本协议。

##### 判断输入、判据与记录

判断的输入、结果与实现接口如下。

```ts
type CancellationJudgmentInput = Readonly<{
  tenant: Access<unknown>['tenant']
  execution: AgentExecutionId
  candidate: FinishCandidate
  control: ControlRecord
  route: Extract<FinishRoute, { kind: 'cancellation' }>
  readRevision: ExecutionRevision
  coverage: ResponsibilityCoverage
  items: readonly FinishObligation[]
  participants: TerminalParticipantFacts
}>

type CancellationDecision =
  | Readonly<{ kind: 'allowed'; basis: readonly Evidence[] }>
  | Readonly<{ kind: 'blocked'; reasons: readonly [CancellationBlock, ...CancellationBlock[]] }>
  | Readonly<{
      kind: 'unknown'
      questions: readonly [CancellationUnknown, ...CancellationUnknown[]]
      knownBlocked: readonly CancellationBlock[]
    }>

interface CancellationPolicy {
  readonly policy: Adoption
  readonly implementation: Adoption
  judge(input: CancellationJudgmentInput): CancellationDecision
}
```

`judge` 是纯求值接口，不是作者 invoke。`basis` 可以引用多个权威事实，它的长度不构成允许判据。Journal 校验输入来自自己的完整权威读取，并校验结果属于当前精确 policy 的合法判据。实现抛错、输出非法或来源不能核验时，操作返回 unavailable，不写“空通过”，也不把报错记为 observed。实际的纯度、权限隔离与判据正确性仍须验证，TypeScript 接口不单独提供安全边界。

`CancellationBlock` 保存五类责任之一、原责任键、具体的 PendingReason、权威 source，以及应当完成的 RecoveryContinuation。`CancellationUnknown` 保存 owner、原责任键、source 或 query 的位置与 reason。reason 是封闭枚举：original-operation-unknown、source-unavailable、source-not-authenticated、coverage-incomplete、policy-unavailable、qualification-unavailable。没有查询身份的缺失材料保留原固定引用，不虚构 operation。对 handoff 责任，`CancellationUnknown` 沿同一 reason 分类：owner 是该来源的准入提供者或来源历史的拥有者，原责任键是 H，另标明相关的 P、Ja 或 Rh 原键与准确的查询位置（H 经 `MessageHandoff.lookup`，P、Ja 与 Rh 经 Journal query）。原操作未定用 PendingReason 的 operation-resolution；已具名 H 的来源历史尚未应用且尚无合法保管处置用 handoff-history，它保存 H、来源键、可信结果与负责的 owner。材料未承接继续用 material-custody，历史责任不塞进 call-custody。

“输入事实未定”与“当前操作不具备记录条件”不同。当前调用者的资格核验、安装的可信性或根责任发现范围无法确认时，操作直接 unavailable，不保存判断记录。只有记录资格与根覆盖完整成立，而某项已具名的原事实未定时，才保存真实的 unknown 判定。治理或资格的未定若属于该原事实本身，必须明确指出原控制或原承接者，不冒称当前写入资格已成立。

判据按下列次序执行。

1. 校验取消有效、必要撤权成立、candidate 与 control 匹配，以及当前完整的责任覆盖。
2. 逐项核验原输入处置、原调用与 unknown、结果及材料的承接、旧 Passage 与卡片的保管、输出与观察的存续责任。
3. 消费 coordinated 绑定参加者的权威条件。原请求未定或必要来源不可确定时，返回 unknown，并保留同时已知的 blocked 理由。
4. 没有上述未知，但有确定的必要待办时，返回 blocked。全部必要责任已经 settled 或合法 held，且参加者允许时，返回 allowed。

作者 veto 不是 blocked 理由。尚未物理停止、待生产者确认释放、未确认输出与终态后观察可以由合格的存续方承接，它们不是自动阻塞项。某项原操作未知可能改变候选或终结合法性时，不能只标 held 后结束。已知仍在运行且合法交给长期接收方的调用，与“是否已提交未知”的操作分别表达。

判断记录 `CancellationJudgmentRecord` 的完整记录包含判断记录的 operation、当前操作的 receipt、policy、implementation 与 inputSchema 采用、安装 record、调用资格的归因、原 candidate、control 与 route、完整输入、完整判定与记录 revision。source 来自 Journal 这次提交。旧判断记录永不更新。新的相关事实允许生成新的判断记录，新记录以 supersedes 指向前一条判断记录。

##### 同权威排序与旧写者围栏

顺序保护覆盖 control、挂接与撤权、candidate、迁移、判断、prepareFinish、tryFinish、责任事实及参与终结的外域事实。每次新的 execution 事实恰好分配一个 revision。迁移记录、route 指针、旧 route 失效、责任闭包和迁移操作的成功结果共同提交，任何中间状态都不对 load 或 query 暴露。

部署受信取消判断之前，提供者必须激活一个存储与实际发起边界都承认的协议围栏。该围栏拒绝不理解本协议的写者继续对已取消的 execution 提交旧的终态前扩展经过、接纳新的作者效果或覆盖新 route。旧写者即使带碰巧最新的 expected，也不能绕过这个语义检查；旧二进制不能直接写绕过此边界的表。无法约束这些写者的部署必须先停止并排除它们，才能启用迁移。

取消有效后，旧 advance 不再准许 Model 或 Tool 受理、消息 inject 接纳、卡片 present 或作者的后续效果。所有实际拥有者在自己的发起或接纳处检查当前围栏。迁移成功不靠撤除某个本地 Cordis fiber 取得这一保证。一个在围栏前已经合法开始的外部动作仍可能完成，它的效果、费用和结果沿原身份保管，提供者不能把它宣称为已撤回。对已经在途但尚未作实际发起检查的旧请求，提供者必须能够排除围栏后的新受理；外部协议不能提供这一点时，把请求作为已经开始或未定的原责任保留，不能一边声称 excluded，一边允许它迟到提交。这样的未定请求是否阻止 ended 由真实的终结前提决定，不能用进程内 CAS 直接证明。同权威提交是语义要求，本契约不选择数据库锁、隔离级别、分布式事务或远端 fencing 的实现；实际提供者必须明确共享存储对象、线性化点、事务失败、跨进程认回与旧写排除。coordinated 绑定不允许退回 standalone 来通过迁移或结束。

##### 旧取消记录的迁移

按旧政策开始的 cancelled 终态前扩展经过，不以新政策偷换原精确采用或解释它的答复。首次部署与迁移逐项识别这些记录，规则如下。

1. 已终结的 execution 不重开、不重判。原精确采用、Conclusion、终态、事件与费用保持历史事实。其未清责任按原身份合法接续，不借迁移再调用扩展或发新业务。
2. 未终结且取消已经成立时，停止旧 cancelled 作者扩展的后续执行。不因等待答复、原调用重试或已得 veto 继续发 Model、inject 或 ask。旧请求、已开始的调用、已有答复与原 Conclusion 全部保留，不改记为 observed、通过或不存在；迟到的事实继续按原身份接收和保管。
3. 旧判断不能直接转成新政策的允许。已得到的旧 allow、veto、ask 或错误都不能替代新判断。由具备当前收束及迁移资格的执行者在权威排序中登记一次明确的政策迁移（`MigrationRecord`），绑定原 execution、取消 control、候选、旧 Adoption 与精确的已知进度、新 Adoption、完整的原责任与当前版本。迁移资格由治理安装并核验，调用者不能自授。
4. 新判断与旧记录可区分且可恢复。迁移后用新的精确政策产生真实的取消判断，保留旧记录及被替代关系。不复用旧 operation 搭配不同的语义输入，也不覆盖旧候选的固定业务内容。需要新的判断身份或候选替代时，按本节与“[commitSettlement 的变体](#commitsettlement-的变体)”的保存与认回协议建立新记录，不以直接编辑存量记录实现。迁移未知沿原迁移 operation 查询，不重复迁移，也不恢复业务推进。
5. 卡片与在途调用保留真实的收束责任。原已答复的内容不删除；未答复的卡片不再是 cancelled 的作者 veto 门槛，但其原呈现未知、作废与答复的排序和保管责任仍进入清单。按“[扩展、卡片与材料](#扩展卡片与材料)”的终态后卡片规则，用原身份查询或幂等作废，不伪造人的答复，不以 lookup 的 not-presented 掩盖迟到呈现。已发出的调用的结果、费用、许可及未知效果按各自拥有者接续。
6. 完整性或迁移依据不足时不自动转换。不能识别原政策或候选、无法恢复责任闭包、来源未知或资格缺失的记录保持具名未完及具体原因，交合法恢复者补证。这一分支是事实限制，不是把旧记录永久排除在支持范围外；验收必须验证迁移恢复与缺证补齐后的接续。

取消前某个 complete 或 failed 候选的终态前经过已开始时，保留其精确采用、Conclusion、原调用、卡片与费用。取消使原候选不再适用，不把该经过的已请求改成已采纳。原卡片与调用作为存续责任进入新候选的清单，取消链作新的真实判断。终态后原卡片按“[扩展、卡片与材料](#扩展卡片与材料)”的终态后规则收束，原扩展不为 cancelled 重新调用。普通的未取消恢复仍按原精确采用，取消专用的迁移不推广到一般的扩展热换代。

各种初始情形的唯一合法处理如下。

| 初始情形 | 唯一合法处理 |
| --- | --- |
| execution 已 ended | 不迁移、不新判断。保留历史 route、Conclusion、费用和终态。沿原结果、卡片、控制及观察责任接续 |
| 新取消，无旧候选 | 以 establish-cancellation 建立候选与原生 cancellation route，再产生判断记录 |
| 新取消，原 complete 或 failed 的终态前经过已开始或完成 | 保存旧候选与完整的终态前经过，以 establish-cancellation 建立新候选和替代链接。停止旧作者的后续，原调用和卡片进入新候选的清单，再产生判断记录 |
| 旧 cancelled 的终态前经过尚未开始 | 用原候选与旧计划迁移。not-started 必须有旧发起的排除依据，不从没有 Passage 推断 |
| 旧 cancelled 的终态前经过为 requested | 固定原 requested、mode、operations 与未定调用，迁移后不 replay 作者。原调用继续 query、receive 与保管 |
| 旧 cancelled 的终态前经过为 asked，卡片未呈现或呈现未知 | 保留完整的 requests、round 与原 present 输入。lookup 原批，不再 present，不等作者答复作为终结门槛 |
| 旧 cancelled 的终态前经过为 asked，已答复未处理 | 保留人的原答复，不 replay 作者，不转 processed。新判断只检查保管与接续责任 |
| 旧 cancelled 的终态前经过为 resolved 或 applied，含原 allow、proceed、veto、stop 或报错 | 保留原 Conclusion 与采纳事实。迁移不把其输出当作允许，必须新判断 |
| 原 F1 或候选身份未知 | 先 query 原操作并恢复原候选，不建立猜测的候选 |
| 旧经过的某个原操作结果未知，但完整责任已可发现 | 可以迁移并保留该 unknown。判断如实判断它是否阻止当前终结，不丢掉原操作 |
| 原候选、精确采用或责任闭包缺失 | 不自动迁移。保留原键、缺失记录、负责的 owner 和补证动作。补证后重新走同一迁移准入 |
| 迁移记录的提交结果未知 | 只 query 原迁移操作，committed 后认回原迁移记录，unknown 保持。不另建迁移记录，不 replay 旧经过 |

缺证恢复允许读取原 Journal 操作结果、历史发行登记、原生产者查询、卡片记录、材料副本及已具名的恢复来源。它不允许重跑旧作者扩展来补全旧事实。缺权限由授权拥有者安排当前合法的恢复者。缺精确采用由治理恢复原发行登记。缺完整记录由原存储拥有者恢复耐久备份或可核验的原来源。来源不可恢复时，该具体责任保持未完并可追溯，不宣称无责任，也不宣称永久不支持全部旧记录。

##### 取消后的 Tool 原 invoke 恢复

原 Tool request 的恢复基于完整的规范输入，不以 consumer 单独相等、hash 相同或当前 catalog 内容代替。恢复者先从 fixed 恢复原 ToolInvokeRequest，用精确 schema 与 Tool 的判定校验，再逐字段核对原 consumer 投影。原租户、原主体来源和原调用入口也保留。当前 principal 及资格每次重新核验，不把旧主体的验证材料填作当前授权。

Tool invoke 在来源恢复时可以继续 reserved 到 issued、admission 与补 wake，它不是纯查询。Tool 契约的稳定主体相同条件仍适用，另一当前 Agent 保管者不因此获得 invoke 的重入资格。取消前的合法普通恢复继续按 Tool 原协议与“[Tool 调用关联与控制引用](#tool-调用关联与控制引用)”。取消已经生效时，按下表处理。

| 原事实 | 取消后的合法动作 | 不足以取得的结论 |
| --- | --- | --- |
| intent 已保存，原 invoke 尚未发送，权威发起围栏排除全部旧的迟到发送 | 保存排除依据与原责任处置，读取既有记录。不发送 invoke | 仅本进程未见发送不是排除 |
| 无引用或 association-unknown，原请求可能在途 | 读取原宿主的耐久返回记录，或等待同一在途返回交给 record-tool-association。无合法来源则保持 unknown，按开放问题页的 [U-8](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口) 配对 | 不默认重入 invoke，不按 consumer 猜 call，不称该动作未发生 |
| 已返回 commit-unknown 加引用 | 先可靠保存该原返回与引用，再用当前合法资格调用既有 lookup。lookup 仍未确定时保留 unknown | not-accepted 不排除原来源继续签发或 admission，不授权取消后 invoke |
| 已返回 accepted 加引用，尚无 ProducedResult | 经 record-tool-association 保存原 accepted 回执。按当前资格 lookup 原引用，并由存续接收者承接该原调用的结果与费用 | 不因仍 running 而重入 invoke 补 wake，不要求先造 ProducedResult |
| 仅取得原引用的可信观察，未取得 accepted 原回执 | 保存该来源实际证明的身份事实，须具有另经采用的来源形状。record-tool-association 只消费原 accepted 或 commit-unknown 返回 | lookup 的当前状态不伪造为原 invoke 的 accepted 回执。外域新读法未采用前不接入 |
| 后来一次 rejected，先前无引用、已关联或受理仍未解决 | 保存本次拒绝的原事实，继续原 intent、原固定请求及已有引用的责任 | 不生成与先前调用竞争的 denied 结果，不按 all-denied 推进 |
| 当前 Tool 读取或原主体恢复资格失效 | 交当前合法拥有者接续，保留原材料及未知 | Agent 的 reconcile 资格或历史 accepted 不授 Tool 读取或异主体 invoke 权 |

只有另外取得精确的 Tool 拥有者采用，证明某个恢复入口只观察原关联或原回执，且不会签发、admit、wake 或创建新控制，才能把它加入取消后的合法动作。现有 invoke 没有这个保证。本契约不自造 Tool 方法名，不调用受信内部的 SourceIssuer。已知 accepted 并有合法耐久接收者的调用可以作为 held 继续存在。无引用或 admission 未定若可能影响终结合法性，判断保持 unknown，tryFinish 为 unavailable；具名的长期持有材料不能把这种未知改成已解决。原 Tool 调用可能继续产生效果与费用，取消判断只决定当前 execution 是否可结束，不制造物理停止的事实。

##### 迟到的作者调用返回

record-legacy-return 保存的 `LegacyInvocationReturn` 包含原 passage、原 invocation 的 input 与 mode、精确 implementation、原宿主经认证的 source、完整的 `ExtensionInvocationResult` 原结果、接收及保管依据。该结果的原 output 仍是原协议的数据：不执行，不翻译成允许，不把旧 requested 改成 applied。返回源不能验证时保持未定，恢复不能重调作者补造它。宿主必须在可靠交接前保留自己已经接收的返回；宿主在可靠保存前崩溃且结果无法查询时，按具体缺证处理，不宣称存在耐久的作者结果。这个端口只保存围栏前原调用的迟到事实，不授予新调用。`ExecutionSnapshot.settlement` 中的迟到返回记录与旧 Passage 并列可读，保持“旧调用后来返回”与“旧输出已经采纳”的区别；它只合入原责任，不反向改变已经合法结束的依据。

##### 取消路线上的 tryFinish

取消路线上的 tryFinish 先处理当前资格及原 operation 恢复，再按 expected 与 candidate 检查当前状态。它须能解析当前 route、迁移记录（若有）、真实的判断记录、精确安装及原输入，核对判断记录的判据输入仍适用，并重新检查所有必要责任及 coordinated 绑定的参加者。判断相关的结果行见“[条件终结](#条件终结)”的结果表。

完整 revision 的任何变化都使旧 expected 失效。调用者 load 最新 revision 后，可以复用仍匹配的判断记录。Journal 比较判断记录所记的具体判据投影，包括原对象键、版本、处置与参加者条件，不只比较总 revision 或一个哈希。纯判断记录、清单记录与无关的确认不自动使判断失效；判断自己的记录操作与 currentJudgment 指针不属于业务判据，所以保存判断记录不会使它自身失效。根覆盖仍核全部新增记录，不能以此省略新增的业务责任。相关的输入、保管、资格、政策或外部参加者变化必须重新核验。无法判断变更是否相关时返回 unavailable，不猜无关。

ended 后保留最终清单的原版及当前责任处置。recordResult、迟到的控制阶段事实、recordTerminalObservation、acknowledge 与三个保管变体可以合法更新自己的责任事实与 revision，不改原终态、判断记录、旧 Conclusion 或末事件。

#### 终结责任清单

Journal 每次接受会产生后续责任的事实时，在同一提交维护该 execution 责任的权威闭包。闭包覆盖原输入、effects 与调用、Passage 与卡片、材料绑定、逐版本结果、控制、未确认输出、终态后观察，以及消息准入的 handoff 责任。checkpoint 替换不能删除未清责任。

handoff 责任是 kind 为 `handoff` 的清单项，类别是 operations，键是租户、execution、HandoffReference 的种类与 H，另保留来源用途；input 分支另核原 entry 与 InputId，内部位置由完整 PendingHandoff 固定。不以当前 checkpoint、Ja、Rh 或 Ki 代替 H。该项完整保存或经同等读取契约解析：完整 HandoffRequest 与原 P 依据或成功原 input 的受理关联；原 InputOrigin 或内部的 origin 为 null、原主体的稳定归因、精确 provider Adoption、原 qualification 与受信来源版本；原 H 的完整 resolution，即 prepared 或 rejected 的完整结果或永久 excluded 的证明，unknown 时保留已知的原 request、origin 与具体问题；HandoffHistory、retirement、原 Ja 与 Rh 的完整原请求与原结果的引用，以及真实来源材料与保留或承接依据。pending 与 retained 不得只剩标签。P、Ja、Rh 仍各有自己的 operation 责任，accepted-input 仍追踪原输入，result 与 material 仍各守自己的交付与保管，同 H 的关联让清单可交叉核验，settled 与 held 逐责任判定。尚未从固定的 H 与来源形成完整 Rh 请求时，该项先保存责任与读取路径，不制造一条空的 Rh 原请求，也不漏掉待保管责任。prepared 只完成准入结果，不完成 pending 历史；complete 不以 retained 绕过仍适用的来源；合法的 failed 或 cancelled 最终同提交固定不发布处置与真实承接，才允许该来源责任记为 held；H 已 excluded 可凭真实排除结清未发出的准入，原请求、排除与退役链的保留仍由具名保管方承担；H unknown 且可能改变终结合法性时，tryFinish 保持 unavailable，不能只填 held。该项的恢复动作只有 lookup、exclude、record 与来源恢复四种，query 保持只读；原操作查询继续处理 P、Ja、Rh 与 O，不把 H 交给 Journal.query。尚未应用的来源历史以具名的 pending 原因 handoff-history 表达，保存 H、来源键、可信结果与负责的拥有者；材料未承接继续用材料保管的原因，历史责任不塞进调用保管。闭包可以用原记录和可重建索引推导，不要求第二份业务日志。未交入 Agent 的外域输入由 coordinated 绑定的参加者核验；清单不枚举尚未发生的外域事实。

prepareFinish 发行清单。它的形状如下。

```ts
prepareFinish(input: ExecutionMutation<P> & {
  authorization: FinishAuthorization
  expected: ExecutionRevision
  candidate: AgentOperationId
}): Reply<Readonly<{ receipt: CommandReceipt; obligations: Evidence }>>
```

在当前资格和 expected 下，Journal 从完整权威闭包发行清单，在同一提交保存清单、`intent.obligations` 与原 operation 的完整成功结果，并推进一个 revision。它不改 checkpoint、候选业务内容或 `beforeTerminal`，不发事件或效果。原 operation 在当前资格核验后认回原结果。发行成功可以包含待办或 unknown，不授予终结。证明由 Journal 核验原发行记录与精确内容，非空 Evidence 或调用者自述不足。

prepareFinish 的失败如下。

- 资格拒绝为 denied。
- 当前资格、来源或完整闭包不可确定为 unavailable。
- 写入未知为 commit-unknown，沿原 operation 恢复。
- 推进授权所属的 Authority 已 superseded 为 stale-advance，按“[判定次序与失败映射](#判定次序与失败映射)”第 4 条先于 ended 与 expected 过期判定。
- expected 或实质前提失效为 Failure.changed。
- 同一 operation 配不同的语义输入（authorization、expected 或 candidate）为 conflict。
- 形状错误为 invalid。
- 新请求遇 ended 为 terminal。原成功认回先于新写入的生命周期检查。

每份清单绑定租户、execution、candidate、发行 operation 与 revision、候选的结论、failure 与 inputWatermark、原 checkpoint 及适用条件依据、完整责任集合的原身份、版本与消费位置、原来源、各项处置，以及权威覆盖边界。原待办保留完整输入或稳定可解析引用，哈希不能替代恢复材料。每项处置是四种之一：原拥有者证明该版本责任已结清；具名长期保管方已承接完整材料和后续动作；已确定尚缺的必要责任及其原因；原事实或原提交结果未定及其问题。确定待办不能只写“等待”。

发行 revision 只用于认回原发行。清单是否仍可用于 tryFinish，按责任投影判断：责任投影是清单所列的责任项集合，以及每项的身份、种类与目标。发行之后只有不改变责任投影的修订推进时（例如确认），调用方重读后以新的 expected 调用 tryFinish，仍沿用原清单。责任投影改变时，tryFinish 返回 changed，调用方重新 prepareFinish。`acknowledgedThrough` 前进不改变责任投影：清单项的身份、种类与目标不变，tryFinish 读当前的确认进度。责任投影改变指清单项增删，或清单项的种类、目标改变。

清单项是 `FinishObligation` 的封闭公开联合，不用 JsonValue 数组隐藏责任。每项的公共头含 `kind`、原身份键、固定的 `source: Evidence`、`version: Evidence`、`position: ConsumerRef | null` 与 `disposition`，disposition 取上述四种处置之一。键由下表的现有身份构成，不新造随机责任 ID。同一原实体有多种责任时，kind 与用途也参与键。

| kind | 类别 | 必需内容 | 原身份键 |
| --- | --- | --- | --- |
| accepted-input | inputs | 完整 AcceptedInput、受理 operation、原归属 Evidence、是否已承接及 InputBatchId。取消未承接输入的处置仍指向原 execution | InputId |
| control | controls | 具名缺口，见下段 | 控制的 AgentOperationId |
| operation | operations | 原 AgentOperationId、原方法、固定完整语义请求（`OriginalMutationRequest`，见下文）的可解析记录、query 的显式结果、结果所属的原记录 | 原 AgentOperationId |
| handoff | operations | 见上文 handoff 责任 | 租户、execution、HandoffReference 的种类与 H，另含来源用途 |
| call | operations | 完整 PendingCall、effect intent 的建立操作、原 fixed 与 position、实际发起、未定或收场事实、既有中断请求及当前承接者 | Model 为 action 与原 ModelInvocationRef。Tool 为“[commitSettlement 的变体](#commitsettlement-的变体)”所述的原 intent 键，引用可以未知；associated 使用 ToolInvocationRef，不能用 ToolCallId 替代完整 admission 关联 |
| passage | passages | 完整 Passage、所属的旧 candidate 与 route、精确 Adoption、是否已被本次取消路线替代。替代不修改 Passage.progress | PassageId |
| card-round | passages | PassageId、完整 CardRound、全部 CardRequest、原 present 的原始输入、lookup 请求身份集合、已有答复、稳定的 invalidate operation 及固定原因 | PassageId 与 CardRoundId |
| result | custody | 完整 ProducedResult、ConsumptionId、ResultResponsibility、原材料引用、版本及每项交付与释放依据 | producer 与 call、version、consumption |
| material | custody | AgentMaterials 的原 identity、ConsumerRef、schema 与原结果版本、完整材料或可解析的固定引用、当前保管者及承接依据 | 原 identity 与 consumer |
| output | custody | 原 execution 的输出区间、emittedThrough、acknowledgedThrough、未确认原事件的读取位置及长期 Journal 保管依据 | 原连续输出区间 |
| terminal-observation | custody | 完整 TerminalObservation、原终态与精确 Adoption、当前观察与保管责任。终态前覆盖固定观察计划，终态提交固定实际集合 | PassageId |

control 项的必需内容与控制受理时的保存义务已由 [#730 DD1](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6443041428) 修订。写回本契约之前，本页不承诺 control 项的公开形状，实现不能按某一种 control 内容声称已兑现本契约。这个缺口登记在开放问题页的 [U-9](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。

`ObligationDisposition` 有下列四个分支。

| kind | 必需字段 | 含义 |
| --- | --- | --- |
| settled | completion: Evidence | 原拥有者证明该具体版本的责任已完成 |
| held | custodian: ConsumerRef、acceptance: Evidence、retained: Evidence、continuation: RecoveryContinuation | 具名长期保管者已承接完整材料和后续动作 |
| pending | reason: PendingReason、required: RecoveryContinuation | 已确定尚缺必要责任。不能只填“等待” |
| unknown | question: CancellationUnknown、required: RecoveryContinuation | 原事实或原提交结果不确定 |

`PendingReason` 是封闭枚举，取值为 input-disposition、cancel-intent、qualification-revocation、operation-resolution、call-custody、required-judgment、passage-custody、card-custody、result-custody、material-custody、output-custody、observation-custody 与 handoff-history。每项另含原对象键、source 与负责的 owner。原因只表达本域承诺，不解码 Session 的内部状态。operation-resolution 用于原操作未定，handoff-history 的用法见上文 handoff 责任。

`RecoveryContinuation` 是按实际动作判别的封闭联合。变体为 original-operation-query、original-invoke-recovery、tool-association-retain、producer-query、producer-receive、producer-release、card-lookup、card-read、card-invalidate、material-read、input-read、output-read-ack、terminal-observe、restore-source，以及下文 handoff 项的四个动作。每个变体带下列内容：

- 原公开操作的完整参数，或具有该精确 schema 的稳定记录引用。
- 当前负责的 owner 与已接受保管的 ConsumerRef。
- 原资格检查的用途。

联合中没有任意命令或恢复回调。引用解析失败时，变体保留原键及具体缺失的来源。original-invoke-recovery 只定位完整原请求与合法分支，不是一条无条件的 invoke 指令。tool-association-retain 带固定的受信返回源与原登记请求，见“[commitSettlement 的变体](#commitsettlement-的变体)”。

`ResponsibilityCoverage` 是本 execution 责任闭包的覆盖范围，含下列分面：Journal 的 readRevision、原输入水位、持久操作与调用的索引位置、全部旧候选与 route 引用、Passage 与卡片的发现位置、结果版本索引、材料绑定索引、输出边界、控制集合、观察计划，以及 handoff 的持久索引。handoff 的持久索引覆盖原 P、被成功 input 认领的 H，以及全部仍被引用的 Ja、Rh、retirement 与 history 版本。每个分面都有权威 owner、固定 version 与完整读取依据，缺页不能当作空数组。索引可以从原记录重建，不允许从当前 checkpoint 删除未清项。MessageHandoff 的来源版本经受信 resolver 关联，不声称外域事务与 execution revision 相同。

`TerminalParticipantFacts` 是 standalone 或 coordinated 的联合。standalone 保留本 execution 首建时的模式依据。coordinated 保存固定的外部关联 Evidence，以及每个既有参加者的 owner、协议 Adoption、精确 source 与 version、只读终结条件的结果和最终共同提交的核验用途。条件结果为 ready、changed、blocked 或 unknown，blocked 只含该参加者授权披露的责任类别与依据。它不是 Session 对象、事务句柄或 CallerCommit，由 Journal 的同权威适配解释这些来源。

`OriginalMutationRequest` 是按原方法判别的封闭联合，每个变体复用原公开方法的完整语义字段。变体覆盖 commit、open、attach、submit、control、acknowledge、recordResult、recordControl、recordTerminalObservation、detach、prepareFinish、tryFinish、recordHandoff 与 commitSettlement 的各变体。

- commit 变体含完整的 `handoff` 字段（prepare、resolve、retire 或 null）。open 与 submit 变体含完整的 `OriginalInputAcceptance`，submit 变体另含 `JournalSubmitLineage`。各变体保存原方法完整的当前 value。
- recordHandoff 变体只表达 observed-operation：它保存规范请求 RhSemanticRequest 与真实调用依据 originalCall。source-bound-request 不是 OriginalMutationRequest，也不建立已受理的 operation 记录。请求材料的分支见“[准入结果保管](#准入结果保管)”。
- 请求记录保留 tenant、execution、operation 及原调用者的授权归因依据。历史 principal 不是新调用的资格，恢复者重试时提供自己的当前 Access。这项归因要求不能用来声称一次未观察到的调用已经发生。
- 联合不能用 JsonValue、`Record<string, unknown>` 或摘要代替。

handoff 项的恢复动作只有下列四种。它们不是任意命令或回调。原操作查询继续处理 P、应用操作、recordHandoff 与原入口操作，不把 H 交给 Journal.query。

| 动作 | 完整参数与来源 | 当前资格 | 合法用途 |
| --- | --- | --- | --- |
| handoff-lookup | 原 HandoffLookup、原 execution 归属或外部输入的入口键、固定的读取拥有者与采用 | read-message-handoff | 只查询原 request、origin 与 resolution。不转换、不 prepare、不补历史 |
| handoff-exclude | 原完整的内部 PendingHandoff、可信的 P 引用及原取消控制 | exclude-message-handoff | 只用于内部请求的取消围栏，不扩到外部输入的最终撤回 |
| handoff-record | recordHandoff 请求材料的明确分支（source-bound-request 或 observed-operation）、RhSemanticRequest 与 operation、可信的提供者绑定、固定的 recorded 或 excluded 来源；observed-operation 另保留真实调用依据 | record-message-handoff，即当前保管资格 | 合入原责任。原 recordHandoff 未知时先 query。source-bound 分支不声称已有历史调用。当前 Access 可变，规范语义固定；没有原 execution 时不创建 execution |
| handoff-source-recovery | 原 P 与应用操作的完整请求及 query 身份，H、来源、位置与原材料 | 查询用当前 query 资格；新的来源应用或 retire 用当前挂接的推进资格 | 先按 query 认回。新的来源应用或 retire 仍须通过现有的 advance、expected 与生命周期检查。取消、失权或 ended 之后只读取与保管。本动作不表示必须执行应用操作或 prepare。应用操作 unknown 且未被排除时，不发新的应用操作，也不发新的 P |

ended 在同一提交保存终局清单、各项处置、最后的 ended 事件、固定的观察集合与原结果。FinishIntent 消失后清单仍可经 load 读取。合法迟到记录在自身原子边界更新处置与 revision，不改原终态，不追加事件。

tryFinish 在同一次提交固定每个尚需处置的 Passage 与 CardRound、原卡片请求集合、已有卡片、已知答复、原 present、lookup 与 invalidate 操作及精确采用。已有答复不能丢。终态后的卡片接续由“[扩展、卡片与材料](#扩展卡片与材料)”拥有。

Journal 在清单中保存每项的完成或未定结果。`reconcile` 返回的 remaining 是 ConsumptionId 列表，不列出全部卡片责任，也不列出 handoff 责任；它的 evidence 可以绑定完整对账轮次，调用者仍须从 `load.finishObligations` 与 `load.handoffs` 判断剩余的非结果职责。remaining 为空不证明全部交清，`currentHandoff` 非空也不单独证明仍须发布。`load.handoffs`、`finishObligations` 与 `settlement` 在同一 execution revision 提供可交叉核验的完整投影或同快照的受限分页；P 不因 `currentHandoff` 变更丢失，历史已 committed 不被 Rh 降回 pending 或 retained，已 retained 后 Ja 不得发布，原最终清单与终态判断不回写。

#### commitSettlement 的变体

`AgentJournalFinishing` 提供 `commitSettlement`。每个请求含 ExecutionMutation；候选、迁移和判断变体另含 expected 与取消 FinishAuthorization。它们没有 checkpoint、effects、events、CallerCommit、replyAdmission 或任意 state 字段。变体的新记录以建立记录的 AgentOperationId 为身份，复用现有租户、execution、operation、revision、Passage、CardRound、消费位置、结果版本、控制身份与 Adoption，不新增 ID 命名空间。`MigrationRecord` 记录一次政策切换，不作为旧 F2 的调用身份。判断记录记录一次精确输入的只读判断，不作为作者 Passage。卡片事实登记记录一次原卡片责任的对账，不作为呈现身份。旧调用返回登记记录一次已开始作者调用的迟到返回，不作为新的作者调用或输出采纳身份。record-tool-association 的一次调用称为关联登记操作，它保存原 invoke 已返回的身份事实，是 Agent 记录操作，不是 Tool call、admission 或控制操作。

六个变体分两组。establish-cancellation、migrate-cancellation 与 judge-cancellation 建立或推进取消候选，下文称候选、迁移与判断变体。record-card-reconciliation、record-legacy-return 与 record-tool-association 只合入原责任的真实事实，下文称保管变体。

| kind | 调用者的其他输入 | Journal 唯一允许的新事实 | 完整成功结果 |
| --- | --- | --- | --- |
| establish-cancellation | installation 依据；前一个当前 candidate 或 null | 从当前权威的取消、checkpoint、输入边界与条件建立固定候选，候选身份等于本 operation。固定新 route；取代 complete 或 failed 候选时保存替代链接及旧责任。beforeTerminal 与 obligations 为 null | receipt、完整 candidate、完整 route、替代记录或 null |
| migrate-cancellation | 当前 candidate；originalRoute 依据；installation 依据；priorExcluded 的完整前驱记录或 null | 保存迁移记录和完整旧恢复截面，切换该候选的 route，清空当前证明指针，不改候选的业务内容 | receipt、完整 MigrationRecord、当前 route |
| judge-cancellation | 当前 candidate；route 依据；installation 依据 | Journal 构造权威输入，调用已安装的判断实现，保存判断记录、完整结果及当前判断指针 | receipt、完整判断记录。允许、阻塞与未定都是一次真实判断的成功保存 |
| record-card-reconciliation | 原 card-round 责任键；原 route 与 candidate；固定的原 lookup 或 invalidate 操作引用 | 经已安装的卡片拥有者适配读取并核验原结果，只合入原卡片责任的新事实和处置 | receipt、该轮完整原责任及当前处置 |
| record-legacy-return | 原 PassageId、原 candidate 与 route、原 invoke 的固定请求依据、原执行宿主保存的返回记录依据 | 核验该调用在取消围栏前已开始，追加真实迟到返回及其材料保管引用。保留旧 progress，不采纳输出 | receipt、完整的 LegacyInvocationReturn，内容见“[取消判断与路线](#取消判断与路线)” |
| record-tool-association | 原 Tool intent 键、固定原请求依据、原宿主的不可变返回 source、priorExcluded 或 null | 只读取并核验 accepted 或 commit-unknown 的原返回，保存既有引用及来源，合入原 call 责任。没有 ProducedResult 也可登记 | receipt、完整 ToolAssociationRecord，含原 Tool 返回和本次固定的责任投影 |

候选、迁移与判断变体不接受调用者给出的判断结果、beforeTerminal 或迁移进度。source 不可读取时返回 unavailable。establish-cancellation 从当前权威读取构造候选，不给调用者任意业务快照的写口；需要新候选时，新建立请求必须指出真实的当前前驱 candidate。establish-cancellation 不能取代“旧 cancelled 候选加作者 route”的情形，该情形只能 migrate-cancellation。judge-cancellation 成功回执的 state 为 applied，表示判断记录已保存，不表示判定为 allowed。保管变体使用当前 reconcile 资格，不用取消授权，不要求旧 advance，允许合法 ended 后调用，合并原事实而不带 expected 的整快照替换。它们的回执只表明各自事实已保存，不能据此推断 execution 已 ended。record-card-reconciliation 只认回旧 lookup、read 与 invalidate，不调用 present，不生成人的答复，不运行扩展；未知结果只能登记为原责任的 unknown。record-legacy-return 不接受调用者直接上传新的 Conclusion；返回源不能验证时保持未定，恢复不能重调作者补造它。生产者、结果、控制和观察仍走已有专用方法。

`AgentAccessOperation` 增加 settle 与 migrate-cancellation，使用现有 execution 目标。settle 只授取消候选建立、判断和终结收束；migrate-cancellation 另授政策切换。迁移者须同时具备两者。终态后卡片、旧作者返回和 Tool 关联登记使用当前 reconcile 保管资格，不要求旧推进权。取消 control、旧 Authority、旧 allowed 或调用者给出的 source 都不能自行授予这些资格。

commitSettlement 的判定顺序如下。

1. 校验封闭形状、租户及本次操作资格。拒绝为 denied，核验不可用为 unavailable，不披露原记录。
2. 查原 operation 的绑定。同输入返回原完整结果，异输入返回 conflict。原操作未定时先恢复原 operation，不用新的生命周期检查代替它的历史结果。
3. 对新的候选、迁移或判断请求，ended 返回 terminal。当前取消必须有效，取消 source 必须匹配原已保存的控制。没有当前收束或迁移资格为 denied，不返回 stale-advance。
4. 当前 installation 或旧 route 确定不再适用、expected 过期、当前 candidate 已改变时返回 Failure.changed。指错 candidate 或 route 种类、伪造控制关系等形状或目标错误返回 invalid。不可确认来源或完整性返回 unavailable。
5. 候选同身份配不同固定内容返回 conflict。迁移只接受尚未切换的原 route；另一个 operation 对已迁移 route 不新建第二次迁移，也不冒充认回，返回 changed。
6. 在同一权威提交中核最终条件，保存新记录、相应指针与责任、完整原操作结果和一个新 revision。提交不能确定时返回 commit-unknown。

本方法不以业务判断 blocked 或 unknown 返回 conflict，也不生成“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)”的持久拒绝审计。invalid、denied、changed 与 terminal 是无写入拒绝；提供者不能证明未写入时只能返回 commit-unknown。原成功认回可以在 ended 后发生，仍需当前认回资格。

迁移记录的身份按“并发与提交”的稳定派生法派生：要素为租户、execution、固定前驱 revision、种类 migrate-cancellation、candidate、原 route 与链位置。首条迁移记录的链位置为 root，后继位置为 successor 加直接前驱被排除迁移请求的 operation。即使 revision 没变，successor 与 root 也产生不同身份；相同快照、相同前驱链的恢复者得到相同身份。同一迁移身份配不同输入返回 conflict。提交处先核该 route 的完整操作索引，存在任何未定的迁移请求就只恢复它。只有已有迁移请求被可靠排除且不能迟到，才可提出后继，且必须引用被排除迁移请求的完整原请求、权威排除依据和上一链位置。排除链必须可追溯到 root，不能截断、循环或把 query 的空读写成排除。最多一条迁移记录能切换当前 route。重启先查完整链和未定槽，不从最新 revision 派生新号绕过它。

MigrationRecord 公开下列字段，不以迁移成功布尔值替代。

| 字段 | 内容 |
| --- | --- |
| operation、receipt | 迁移操作的身份及其固定成功结果 |
| candidate、control | 原候选与适用的 cancel control |
| from | 原 route 的完整不可变值、旧政策 Adoption、原 definition 与 schema、原 beforeTerminal、每项精确扩展 Adoption |
| progress | 每项旧 F2 条目的精确已知进度及原记录依据。条目是 not-started 或 recorded 之一：not-started 保存原计划位置、声明、精确 implementation、预定 PassageId（若有）及排除旧发起与迟到发起的权威依据；recorded 保存完整原 Passage 及其不可变版本引用 |
| to | 新 policy、implementation 与 inputSchema 采用、installation、当前治理准入记录 |
| qualification | 本次 settle 与 migrate-cancellation 的授权归因、目标、治理签发方、当前检查依据 |
| fence | 该取消及本次迁移在权威序列中的旧写排除依据，旧挂接与协议版本约束 |
| coverage、obligations | 本次完整原责任闭包及迁移时各项处置。可以有明确的 pending 或 unknown，不可缺失项 |
| supersession | 原 route 被本迁移记录替代、新 route 由本迁移记录建立，双向可读；旧候选被新候选替代时另保存候选链 |
| priorExcluded | null 表示 root；否则保存直接前驱被排除迁移请求的 operation、完整原请求、权威排除依据及可解析到 root 的完整链 |

迁移记录的 progress 是迁移时的截面，不随迟到答复变动。迁移后迟到的事实另按原身份保存，当前责任投影链接到最新拥有者记录。原 Passage 的业务进度不再从 requested 推到 applied。

Tool 未清责任的键是（租户、execution、kind 为 tool、原 effect-intent 建立操作、action、完整 position）。它沿首次持久意图固定，不使用后来得到的 Tool 引用、当前 checkpoint 位置、当前挂接或新随机 ID；原关联出现后也不改键。即使尚无 reference、ProducedResult 或 ActionSlot，该 intent 也占一项 call 责任，并有原 operation 和材料责任；旧 checkpoint 被替换只改变当前位置，不删除该责任。Tool 的关联事实按同一 intent 聚合并保留来源历史：无引用为 no-proven-reference；有引用且原返回为 commit-unknown 时身份已知而受理未定；有 accepted 回执时保存该已受理事实及原回执。后到的 rejected、无引用或 commit-unknown 不把已知引用或已受理事实降回未知。不同 call 或 admission 的引用不合并为同一关联。

record-tool-association 的来源协议如下。调用者只提交原 intent 键、固定请求记录和受信返回 source，不直接上传 ToolInvocationRef 或 ToolInvokeOutcome。Journal 经受控安装的原宿主读取适配取得 source 的完整不可变内容。source 只证明原调用的实际返回，不能是当前调用者自签的 Evidence、只含摘要的日志或重新调用 Tool 的回调。受信宿主记录须包含原 intent 键、完整原请求或可解析固定引用、原租户及主体归因、真实发送依据、完整的 accepted 或 commit-unknown 返回、收到返回的事实版本及耐久保管承接依据。Journal 核完整原请求一致及 consumer 投影，按公开 resolveToolInvocationRef 核规范租户、call 与 admission，并核原真实入口与调用来源。字符串可解码只证明形状，不证明该返回真实。原宿主仍保管 association-unknown 或 rejected 的真实返回，这些返回不提供新引用，不能交本变体伪装成有关联的返回。

接收与交接的顺序如下。

1. 发送原 invoke 前，Journal 已保存原 intent、fixed 和 effect intent。调用宿主固定接收责任，承接原请求和返回保存职责，该承接进入原责任闭包。已有在途旧记录没有此承接证据时，迁移保留缺项，不追认已耐久。
2. 原 invoke 的在途调用返回时，宿主先把返回和原绑定保存到自己的耐久保管记录，再向上层确认已收到或释放该响应。取消和 runtime 结束只停止新业务，不销毁这个存续保管者。
3. 当前合格恢复者用固定 source 发出关联登记操作。Journal 在同一次权威提交保存关联、来源、原责任投影、该操作的完整结果及一个新 revision。它不 invoke、admit、wake、执行 Tool、发控制、写 ActionSlot、推进 checkpoint 或产生事件。
4. Journal 成功只确认已可靠接收该关联事实。宿主确认对该操作的 query 为 committed 并认回原完整结果后，才可按保留下限释放自己的冗余副本。

返回进入内存但尚未耐久的瞬间不是可靠接收。宿主在此窗口失效且 Tool 没有可合法查询的来源时，保持原 intent 的具名 unknown，不声明已保存引用。可靠保存之后，超时、撤权或 Journal 不可用都不删除 source。

关联登记操作固定原方法、租户、execution、intent、fixed、source 和 priorExcluded；当前 Access 是每次使用时的授权输入，与原主体归因分开。它不带 expected，不用旧整快照替换当前责任。首个关联登记操作由原 intent 键、固定 source 的 owner、record、revision 与 digest、种类 record-tool-association 及 root 槽稳定派生；派生不使用最新 execution revision 或当前 Access。两个恢复者读取同一 source 时得到同一操作身份。新 source 是新事实，使用新的关联登记操作。同一操作的重试不换 source、不补 accepted.state，也不重新读取当前 Tool 来改写原结果。对该操作的 query 为 committed 后，原方法按同一操作与同一完整输入返回原 ToolAssociationRecord。某个关联登记操作被可靠 excluded 后，具备当前 reconcile 资格的恢复者可以提交新的关联登记操作，输入携被排除操作的完整原请求与排除链，新操作的派生加入直接被排除的操作和同一个 source；这只是原事实的首次可靠保存，不是 Tool 重发或业务重新准入。不同 source 可以记录同一规范引用的另一份真实返回，它是新增观察事实，分配新 revision；已有 accepted 不被后到的 unknown 降级。

| 本次条件 | 返回及继续责任 |
| --- | --- |
| 当前 reconcile 或来源读取资格拒绝，或所供目标跨租户 | denied，在披露原 intent、原关联登记操作或 source 前处理。原宿主继续保管 |
| 当前资格不能确认，或新关联登记操作的来源读取、材料或可信绑定不可确定 | unavailable，保留原操作、source 和具名缺项。证据缺失不等于无调用。原成功从已保存结果恢复 |
| 原关联登记操作同完整语义输入已经成功 | 返回原完整结果，先于当前 route、ended 或新写检查。异输入 conflict |
| 新关联登记操作的本域目标不存在，且读取完整 | invalid，field 为 intent。缺页或损坏不能当不存在。非 Tool 目标 invalid |
| 新 source 没有 accepted 或 commit-unknown 返回，或不匹配原请求与真实入口 | 可确定的形状或目标错误 invalid；伪造身份或来源 denied；来源真实性不能确定 unavailable。均不写关联 |
| 原规范引用已知，source 却给出不同的 call 或 admission | conflict。原关联不变，宿主保留矛盾的原返回及恢复责任 |
| 新关联登记操作不符合稳定派生，或绕过该 source 的未定关联登记操作 | invalid，field 为 operation。不登记第二份同 source 成功 |
| 新 source 指向原合法责任，事实可合入 | 同提交保存本次新事实、完整结果与 revision。结束前后均适用，无旧 advance 要求 |
| 是否已写不能确定 | commit-unknown，只 query 原关联登记操作 |

原返回记录损坏按 unavailable 暴露具体拥有者诊断，外租户原材料按 denied 保护。上述错误不增加 Failure 成员，不生成持久拒绝审计。

关联登记操作与 tryFinish 使用同一个 execution 的权威序列。关联登记操作先提交时，新关联、原返回及其责任构成新 revision，旧 expected 的 tryFinish 返回 changed，重读后重新核对。finish 先提交时，必须已把该原 intent 及合法后续接收责任收入最终清单；此时关联登记操作只补原责任事实，不改最终清单原版、候选、判断、终态内容、checkpoint 或末事件，当前责任投影和 revision 可以更新。原未知会影响终结合法性时，finish 本来就必须 unavailable，不能先 ended 再靠关联登记操作补救。返回源先保存而关联登记操作尚未提交时，原宿主仍拥有返回；finish 不能把“Journal 尚未见 reference”当“无调用”，也不能把尚未可靠接收的响应标为 held。ended 后发现新事实与原终结前提冲突时，保留真实源与诊断，交具名拥有者处理，不重写历史或重判 ended。

`ExecutionSnapshot.settlement` 是完整的同 revision 投影，含当前 candidate 与 route、全部存续候选替代链、迁移记录、判断记录、未清责任引用、Tool intent 的稳定键与关联事实历史、ToolAssociationRecord 集合，以及迟到返回记录集合。无引用的 intent 不能从该集合与完整责任清单消失。历史材料可以在同 revision 的受限分页内返回，必须完整或 unavailable。读取不重入 Tool，不制造关联，也不创建新的问题记录或修复迁移。

#### 准入结果保管

`AgentJournalRecording` 提供 `recordHandoff`，记号为 Rh。它把原准入结果或排除及其责任合入现有 execution。请求含 ExecutionMutation 与 `original`（lookup 返回的 recorded 或 excluded），没有 checkpoint、effects、CallerCommit、状态迁移或 events 参数，也没有 expected。它只对已经存在的 execution 工作，且该 request 已经通过 P 或成功的 input 受理进入权威记录。它先核当前保管资格（主体资格 record-message-handoff，目标是原 execution），再通过可信的提供者绑定核验完整 outcome 或排除证明；任意上传的 Evidence、JSON 或同形结果都不是依据。它不创建 execution，不改变 terminal，不写失败候选，不发布消息，不改变 checkpoint，不发事件。允许当前合法的保管者在 ended 后调用。prepared 结果在记录后仍是 pending history，只有合法的 Ja 可以发布；ended 后依据原终态处置把未发布的消息记为 retained，内容留在保管记录，不进入历史；rejected 与 excluded 的 history 为 not-applicable。

Rh 的请求材料分两种。source-bound-request 是从当时可信的 P、input、H 来源版本重建的完整规范请求，可由原责任重建，没有实际 Rh 调用的声明，不是原操作请求，本身不持久化新的待办或占用操作槽。observed-operation 保存规范请求、该操作第一份依法权威留存的真实调用依据 originalCall，以及成功时真实的 committingCall；二者同一调用时引用同一份依据。永久排除材料同样分两种：source-bound-exclusion 含规范请求、当时固定的来源归因与永久排除、围栏依据，明确没有权威留存的 Rh 调用归因，不声称从未发过包；observed-operation-exclusion 原样保留已有权威留存的 originalCall 与原记录引用，未成功故无 committingCall。四者在公开恢复材料中可判别，不以可空的 principal 掩盖来源差别。规范请求 RhSemanticRequest 含 method、tenant、execution、operation、完整 original 与固定的来源归因 sourceAttribution（只描述 P、input 与 H 的真实来源，内部来源的 origin 为 null 时仍为 null），后继另含完整的保管根、直接前驱与规范排除链。当前 Access 每次核验，不进入规范比较或身份派生；真实的 Rh 调用归因由提供者从实际调用与真实授权核验取得，不接受调用方自由指定的历史归因。已有记录只读保全，不改署；没有既有记录时由唯一的成功事务固定真实提交者为 originalCall 与 committingCall。两个合法恢复主体以同规范请求认回同一结果，不因主体不同 conflict。旧归因或来源对应任一不可验证时，返回具名 unavailable 并报告迁移缺证，不默认为 source-bound，也不把后来的恢复者当原调用者。

Rh 的身份按稳定派生法派生，与迁移记录和 Tool 的关联登记操作同一结构，但不继承它们的权限。根 custodyRoot 是原 H 固定 recordHandoff 阶段的首个 Rh operation，另固定原方法、tenant、execution 与精确协议采用；已存在原 Rh 时必须恢复其权威原请求，不另选一个根。rootRequest 固定根的规范请求；factSource 保存原提供者的 owner、精确 Adoption、规范不可变 record 与 version 及完整解析内容或同等恢复引用，摘要用于核验，不单独代表来源身份；factBinding 固定 tenant、execution、完整 HandoffReference 与 H、原 P 依据或成功 input 的受理关联、完整 request、origin、resolution 的种类与全部值，以及 factSource。根的 payload 不能由 recorded 改为 excluded 或 unknown，也不能以 H 的另一次当前读取覆盖原值；新发现的矛盾交原拥有者，原事实与诊断保留。后继按 `hand-off-custody-successor/1`、recordHandoff、tenant、execution、custodyRoot、完整 HandoffReference、canonicalFactSource 与直接前驱 operation 稳定派生；canonicalFactSource 取根已固定的 owner、Adoption、record 与 version，不取当前存储位置。每个前驱只有一个规范后继，相同根、同一事实与同一权威链的恢复者得到同一身份。当前 execution revision、instance、随机数、时钟、principal、恢复者身份、当前 Access 与排除证明的重签字节都不参与派生；后继不取新的 H、InputId、原 entry、来源位置或当前 checkpoint。后继请求只在 recordHandoff 的窄恢复分支表达：它有自己的 operation、原样的 original 与 custody，custody 含 protocol、custodyRoot、rootRequest、factSource、predecessor（直接前驱 operation 与完整请求的固定引用）与 priorExcluded（从根到该前驱的有序权威排除记录链，每项含被排除 operation、原方法与完整语义请求、规范前驱关系、排除权威与固定依据、永久迟到写围栏依据）。同 attempt 异 original、根、来源、前驱或链为 conflict，不把后继当原 Rh 的同输入重试。

恢复者按下列只读定位发现责任，随后只对确定的同一 attempt 调用原方法。

1. 从完整权威 coverage 取得原 P 或成功 input 及 H。无 execution 的外部受理前记录继续归原提供者，不用本协议制造 execution。恢复者核本次读取资格，不依赖旧 runtime 存活。
2. Journal 已有该根的成功记录时，先按当前认回资格取得其完整原请求与结果。原成功优先于重新读取 H、来源或新写生命周期。已知成功暂不可读仍保留成功并返回 unavailable，不推断没有成功。
3. 尚无可认回成功时，通过受信的 H 与来源读取完整原 request、origin、resolution 及规范 factSource。P 与 H 的固定身份确定 custodyRoot，完整原来源确定 factBinding 与 rootRequest；尚无权威留存调用时形成 source-bound-request，不把 P 或 H 的主体填入 originalCall。H 尚未固定结果，或来源缺页、离线、不可认证时，只恢复原 H 与来源，不编造 Rh 的 original，也不先登记一个残缺请求。原 Rh 已有权威请求时消费该原请求，不用新的同形材料替换。
4. 从 custodyRoot 开始核其原状态。committed 则只恢复该 attempt；unknown 或不可读则停在该 attempt，不走下一号。unknown 可包含未调用、实际在途与成功结果不明，这些分支都不授排除。来源与当前资格齐备时，可以按原方法以同 operation、同完整输入重试该 attempt，恢复者不需要先证明此前没有调用。
5. 只有取得该 attempt 完整且可信的永久排除记录，才从根、factSource 与这个直接前驱稳定派生下一 attempt，随后重复上一步。每个前驱只有一个规范后继，不能跳过 unknown、缺页或链节点。暂时查空不等于排除。

该算法不从最新 execution revision、进程、恢复者或随机数选 attempt。每次恢复都核完整权威链，不只相信一个可变的当前 attempt 指针。已知更后的成功记录而中间链不可核时，保留成功事实与缺证 unavailable，不截链、不回退为新调用、不选另一个成功。Journal 可以为已成立的成功与排除记录建立根索引（键为 tenant、execution、custodyRoot），索引是这些权威记录的可重建投影，不是提前占用的 unknown 槽；首次成功在同一成功事务保存必要的根与链索引，首次真实排除在自己的权威发布事务保存必要索引；任何索引都不独立制造一次已受理、待接管或已成功的事实。没有成功前的公开登记、登记角色、登记 ACK、应用 pending 或审计拒绝事务。

recordHandoff 只有一次可见的成功提交，不先持久化请求登记、unknown 槽或半份结果。该成功事务同时保存完整原请求、可信事实、必要的根与链、原完整结果与 receipt、成功责任投影和一个新 revision；未提交的暂存对读者不可见。写前拒绝与确定的完整回滚都没有本次持久写，只有成功可能已提交时才返回 commit-unknown。公开顺序固定如下，恢复者不自行选择错误分支。

1. 只做必要的方法形状与 tenant 输入检查，缺 tenant 或不可解析字段返回 invalid 并指向该字段。涉及私有记录之前核当前租户边界与相应的保管或认回资格：跨租户或明确无资格为 denied，不披露存在性，核验不可用为 unavailable。历史归因不授权。本步不要求旧 runtime 或旧 advance。
2. 在该 attempt 的权威记录中读取已固定的完整规范请求。已固定同 operation 而请求异语义，先返回 conflict，field 为 operation。无法可靠读取该绑定返回 unavailable，不把它当新输入。只有当前 Access 或恢复者变化不是异语义。尚无记录时仍核规范来源派生，不任意抢占 operation。
3. 已有同语义成功时，按当前适用的认回资格返回原完整 CommandReceipt，先于重新读取 factSource、新写生命周期与当前状态条件。原结果不可读为 unavailable 并保留已知成功，不重采来源或改署 originalCall。成功与永久排除的权威事实不能同时成立；记录矛盾时返回 unavailable，owner 为该 Journal 权威，diagnostic 写明原 operation 的状态矛盾，保留事实交拥有者修复，不任择一方。
4. 尚无成功且权威固定的完整永久排除已核实时，原方法唯一返回 invalid，field 为 operation，reason 为 operation-permanently-excluded。它表示输入 operation 在本协议中已永久不能提交，不表示 payload 畸形、主体失权或 execution 终态，不以 conflict、denied、terminal 或 unavailable 替代。排除绑定、围栏或权威记录暂不可读、不可核时返回 unavailable；query 仍按原事实保留 excluded 或 unknown，不降格既知的永久围栏，也不放行写入。
5. 这个 reason 只作诊断分类，不含消息、秘密或附件地址，不新塞 Evidence 进 Failure。原查询坐标是本次请求的 tenant、execution、operation 与 Journal.query：调用方携自己的当前读取 Access 查询，得到既有的 excluded 依据，再读完整排除材料。失败文本不授权换号；query 不可用或材料不足时停在同 attempt，不启用后继。返回失败不写新的 receipt、审计拒绝、query 的 rejected 或 revision。
6. 只在无原成功、无已核永久排除的新写分支核原责任覆盖、根、完整来源、排除链与目标归属。可信的耐久副本可替代离线源；来源暂不可读为 unavailable，确定伪造或不一致为 invalid（相应的 source 或 original 字段），已绑定 operation 异输入仍优先 conflict。原责任不属合法 ended 覆盖时按原 terminal；生命周期核验暂不可读仍 unavailable。缺必要组合能力为写前 unsupported，不冒称暂时不可用。
7. 最终成功点在同根与同 attempt 的权威顺序重新核当前用途资格、固定绑定、原成功或永久排除与新写条件，顺序仍是 1、2、3、4、6。撤权先成立则 denied 且不披露排除；核权不可用则 unavailable。同语义成功先成立取其原结果；异语义绑定先成立 conflict；永久排除先成立按第 4 项 invalid。本事务确定未成功或整体回滚时按已确定原因返回；只有成功可能已提交时才返回 commit-unknown。成功结果仍未知时不凭本地取消、权限变化或未认证的墓碑改报确定失败。

| 观察或切点 | 结果与恢复责任 |
| --- | --- |
| 当前资格拒绝，且该次调用尚未合法成功 | denied，无本次请求、索引、责任或结果的持久写，不披露原结果。原来源责任仍存在，另一个当前合法恢复者使用同 attempt |
| 来源、资格核验或原责任暂不可读，成功未发生 | unavailable，无本次持久写。材料不足不造成功、排除或新 H |
| 相同 attempt 已有成功 | 当前资格先行，返回原完整结果与固定 receipt；不重采来源、不新 revision、不新后继 |
| 本次事务确定整体回滚且迟到提交不可能 | 按上述次序的已确定原因返回 invalid、conflict、denied、terminal、unavailable 或 unsupported；原因是已核永久排除时唯一为 invalid（operation，operation-permanently-excluded）。无本次持久写；一次回滚不证明其他在途调用都被排除 |
| 成功事务可能提交，回执或提交结果不明 | commit-unknown，携这个 attempt。先查 Journal 原操作，继续同 attempt 的完整原请求恢复，不另造后继 |
| query(attempt) 为 unknown 或暂不可读 | 保留原责任、来源与同 attempt。unknown 可为未调用、在途或结果不明，不等于缺责任，不等于排除 |
| 原方法同输入迟到或最终提交被已核永久围栏拒绝 | 当前资格、完整语义与原成功判断先行；唯一返回 invalid，field 为 operation，reason 为 operation-permanently-excluded。失败自身不是后继证明，无本次写 |
| query(attempt) 为 excluded 且完整永久围栏可核 | 原 attempt 永远不能成功，按上文核唯一的直接后继；排除缺请求、来源或围栏材料时仍不能启用后继。原方法与 query 的返回类型不同，不把 query 的 excluded 直接作为方法 Failure |
| 根已有不同 factBinding，或同 operation 改 original、来源或前驱 | conflict，不覆盖原请求与事实；不得另选根绕过 |
| 新请求的链循环、截断、跳过前驱、跨 H 或来源，或派生不符 | invalid，field 为 operation，与 Tool 关联登记操作的同类失败同一结构。已绑定 operation 异输入则优先 conflict；跨租户先按当前资格拒绝，不泄露根 |
| 来源永久毁损但 Rh 未成功 | 具名保管责任未完或 unknown，交来源拥有者处理；不自动 excluded，不新 H，不借新 attempt 重造业务 |

成功在当前合法提交点先成立后，后续撤权不回滚或改报为无写失败；后续 query 与原方法重试另核新的当前资格，失权主体不得借原 receipt 取得当前权限。ACK 未送达不能抹掉成功。当前无合格恢复者时原保管责任继续存在，不因无活体、超时或队列任务结束而消失。Rh 的成功与永久排除必须由 Journal 原操作权威在同一根与 attempt 的顺序裁定，并与 Ja、tryFinish 使用同一个 execution 权威顺序。根与同一事实最多一个成功 attempt：根只在所有原前提合法且未永久排除时可成功，后继只在其全部前驱已永久排除时可成功；不同恢复者以同完整输入争同 attempt 最多一个成功提交，其他者取同一原结果；两个不同后继不能凭不同的到达顺序各占一个成功槽。成功先成立则排除不能再成立；永久排除先成立则所有已发出、在途与迟到的成功路径在最终成功点被拒绝，包括曾经通过资格与来源核验的调用。排除一项从未成功的 attempt 不要求先登记 unknown，但既有排除权威必须从当时已经耐久的可信 P、H、来源或已有原操作记录固定其完整原语义请求、tenant、execution、根、直接前驱与完整链，同次保存永久排除依据、迟到写围栏与必要的可发现索引；只有裸 excluded 或 Evidence 而无法依法还原这一绑定的记录，不能作为后继准入材料，保留 unknown 或 unavailable。排除材料的归因分支固定在该排除事务的权威切点；后来被围栏拒绝的调用不回写原排除材料、不补造其 originalCall、不改成 observed 分支。取消 RPC 成功、调用方断连、锁释放、查无记录或一次事务回滚都不构成排除证明。索引、唯一约束与权威比较必须覆盖跨进程恢复，不能靠进程内的 map、mutex 或 Cordis disposer；提供者不能满足这些条件时明确不支持这项窄后继能力，不以新增 pending 登记绕过。

| 实际发生的转换 | 写入与公开发布 | execution revision 与结果 |
| --- | --- | --- |
| 原 P 或成功 input 建立原 handoff 责任 | 沿既有事务固定原责任、H 与发现位置；尚无 Rh 完整结果时不伪造原请求或成功 | 沿原方法的新事实规则推进；已提交的原 P 或 input 的重复读取不再推进 |
| 尚无 Rh 持久结果，query 仍 unknown | query 与 load 只读取原责任与固定投影；未调用、在途、结果不明都可保持 unknown | 没有新的公开登记事务，不加 revision。unknown 不证明原责任不存在，也不让恢复者换号 |
| 未成功的 attempt 转为真实的永久 excluded 公开投影 | 既有的 Journal 排除权威发布完整原请求、排除依据、围栏与根链索引，同次更新本地公开责任投影 | 公开的 queryState、链或处置改变就恰好加一 revision。没有 Rh 的成功 receipt |
| 原请求或根链转为首次 Rh 成功 | recordHandoff 一次原子成功提交保存事实、请求、根链、完整结果与 receipt，以及全部成功责任投影 | 加一 revision，没有中间登记版本。receipt.revision 固定本次成功版本 |
| Ja 已保存相同 H 之后 Rh 首次成功 | 不重复 H、历史或事件，但首次保存可恢复的 Rh 成功与公开的保管、attempt 状态 | 仍加一 revision，不取 Ja 的旧版本。原 H 不是已成功 Rh 的替代证明 |
| 同一原 attempt 以同完整输入重放原成功 | 当前资格先行，从固定原结果认回，完整公开快照不变 | 零新 revision，原 receipt 不随当前版本漂移 |
| 拒绝、确定回滚或只读 query 与 load | 不产生本次持久的业务、责任或结果写入；其他真正独立的合法事务可以已改变全局状态 | 本次不加 revision，不能通过回写错误或 unknown 记录偷偷变页 |

本地快照中公开的 handoff、保管、operation queryState、链、成功、处置与覆盖引用取同一固定的 execution revision；根与链索引若可重建，只复现原版本记录，不从当前缓存或实时 query 补写页面。永久排除属于 Journal 原操作记录时，发布它的权威事务同时承担相应的公开版本变化，不能先让 query 与快照改变再稍后追补 revision。外部 `MessageHandoff.lookup` 的 H 版本不是 Journal 的 execution revision：实时的 H 从 unknown 变为 recorded 或 excluded 是外域自己的权威版本变化，不因此伪称 Journal 提交了新 revision；Journal 尚未保存的外部结果在本地快照保留准确的原 H、lookup 位置与未完成责任，恢复者另按外域固定版本读取，不动态灌进同 revision 的本地投影；Rh 或合法的 Ja 把可信原结果纳入 Journal 时，才在该本地事务发布相应变化。提供者把 Rh 的排除权威委托给另一存储时，必须写明谁拥有 Rh 的原操作记录、怎样与 Journal 的公开快照与版本同权威发布；未取得共同排序与版本证明时，不得把一个新的 excluded 值实时桥接进旧 revision 的快照并声称完整，这是提供者的组合缺项，不能靠另建成功前登记解决。每个新成功的 receipt.operation 是自身 attempt，revision 是它的成功版本，evidence 证明其窄保存与原来源；要作新的条件写时，恢复者另 load 当前完整快照取得 expected，不把 receipt.revision 或排除记录版本当最新 expected。固定分页在读第 n 页之后遇到真实排除或成功发布 n+1 时，只能继续 n 的原快照，或按现有契约 changed、unavailable 后重读，不拼页，也不在保留的 n 页回填当前排除或成功。原材料不可读报 unavailable，不把丢页当空责任。

Rh 的成功或实际排除的公开变化先于 finish 提交时，旧 expected 失效；重读后按终结判据所依的事实与处置判断是否重求，版本变化本身不机械重跑终态前判断，已保存的 unknown 判断仍是原判断内容。finish 先成立时，后续的 Rh 成功或排除只处理最终清单已合法覆盖的原 H 与来源责任；当前投影变化仍推进 revision，原最终清单、终态判断、终态、checkpoint、末事件与 retained 历史不改。影响终结合法性的未知应先阻止 finish，后来的事实不补发过去的终结许可；原覆盖缺失时不新增责任，保留来源与诊断，按原 terminal 或缺证 unavailable 处理。原来源在收到真正完整的成功结果并核同 factBinding 的可靠承接 ACK 之前继续保管材料、根请求与必要的排除依据；query 为 committed 本身不足以释放唯一原材料，成功结果读回暂不可用或主体失权时保留成功与来源待合法恢复；来源丢失、离线或腐损不自动排除，已成功后外部来源毁损不推翻 Journal 的原完整结果，Journal 自身违背保留义务时保留已知成功并报 unavailable 与提供者缺陷，不重做业务。Journal 保留完整成功、原请求与来源及全部相关排除记录到声明的恢复期及所有引用与未交清责任的更长下限；永久围栏持续到旧命名空间永不复用且旧尝试永不提交，普通 TTL 不构成该条件；链可以有可核验的物化索引，不能只剩计数或悬空摘要。链长度随真实排除次数增长，容量与背压由提供者声明，不用截链或新 H 换取短路径。query 为 committed 只证明该 Rh 成功，不证明 Ja 的历史已发布、终态判断允许或终态合法。

#### 终态后与 ended

settling 保存本域完成意图、未决操作和交接责任。ended 与最后事件共同提交。长期 Journal 接管全部未确认输出和原结果责任后，runtime 即可释放执行槽并回 idle，不等待最后事件被调用方确认。旧 execution 继续读取、确认和保管原结果。业务终结与事件保管责任的释放分别记录，ended 不删除未确认的事件。合法 ended 之后迟到的控制阶段事实按“[六个阶段](#六个阶段)”保存，不追加事件；迟到的结果、观察、保管登记、保管变体与准入结果保管仍分配新 revision，终态结论、checkpoint 与最后事件不变，见“[执行修订](#执行修订)”。

终态后观察责任使用稳定的 PassageId，与原终态、处置及扩展采用绑定。tryFinish 在提交终态时固定其完整集合，observed 为空表示待观察，调用方不能临时添加。load 返回这份台账，具备当前观察与记录资格的长期协调者逐项处理，不需要旧挂接的推进权。终态后判断只做纯观察，结果未知时按原操作查询。尚无完成记录的观察可对同一事实重新求值，不发外部效果。recordTerminalObservation 只为既有的待观察项登记完成，核对终态、原扩展调用、精确采用和证据。重复的同值登记认回，异值登记冲突。缺目标、终态不匹配或尚不存在、采用不匹配的 invalid 字段，以及读取失败的 unavailable，按“[判定次序与失败映射](#判定次序与失败映射)”第 7 条。它不改 checkpoint、不追加事件、不重开输入、不创建效果。普通 commit 不得在已 ended 的执行上写回非终态。观察故障保留待办与原因，不撤终态，也不阻止已交清责任的 runtime 回 idle。此责任可交长期协调者，不要求 runtime 一直占用执行槽。EOF、对象退出和队列空都不是终态。

确认只清理满足保留政策且责任已交清的事件，不能释放其他结果项的责任。ended 执行的事件与结果保留多久，是 Journal 提供者声明的可配置政策。契约只规定下限：存在未确认的事件、未交清的结果责任、待观察的终态后观察，或未释放的材料保管时，Journal 不得删除对应记录。保留期内，旧 execution 的输出、恢复和结果保管能力继续可用。保留期内，已成功的原操作及获准认回操作的语义绑定、完整原结果与必要来源可以恢复；清理旧 checkpoint 或可清理事件不删除这些记录。存在未交清责任时，恢复它所必需的记录、原请求、迁移与判断记录、旧 route、Passage、卡片请求与答复、材料及排除依据至少受这一下限保护。提供者可以物化结果或压缩来源，但不能留下悬空的认回指针、使原结果漂移或复用旧身份。排除证明及围栏保存到旧尝试永久不能提交为止，普通 TTL 不构成该证明。Journal 与宿主的长期保管者不挂在 runtime 的可撤除 fiber 内。

checkpoint 是 execution 当前状态的权威物化，不是状态历史。Journal 为每个 execution 保留最新已提交的 checkpoint；被后继提交取代的 checkpoint 可以在后继提交成功后立即删除。revision 的分配与失效规则见“[执行修订](#执行修订)”。公开操作只读取当前 checkpoint；需要在被取代之后仍可解释的事实，由最终请求记录、Passage、结果责任、操作结果、终态观察台账和事件各自承载，不依赖旧 checkpoint。提供者可以为诊断保留历史版本，契约不读取它们。

#### 交接与停用

detach 只适用于 active 的执行挂接。它同时保存原位置与责任并撤销该挂接，返回可核验的交接依据，成功交接后 runtime 才可回 idle。经恢复入口对仍存活的其他 runtime 的 active 挂接做 detach，另需 takeover 资格，见“[恢复与接管](#恢复与接管)”。对 superseded 的挂接发出新的 detach 返回 stale-advance，对已 detached 的挂接只认回既有交接。暂停控制的结果就是一次 detach 交接，execution 进入 suspended。暂停控制与这次 detach 的先后次序及其间崩溃的恢复待 #730 写回，见“[四种控制](#四种控制)”之后的说明。宿主停用实例和换代时的挂接交接同样使用 detach。失去业务资格后的新 detach 返回 denied，不因旧挂接失效而返回 stale-advance；已成立的原交接仍按“[原操作认回与恢复](#原操作认回与恢复)”认回原交接依据，不写新的业务位置、挂接或责任。对 ended execution 的新 detach 返回 terminal。reconcile 在无活体或 execution 已结束时仍可由合格的保管者处理原结果，不能据此发起新工作。生产者事实的登记与耐久保管由原消费拥有者承担，不能强迫旧的失效挂接重新通过推进检查。

quiesce 是 AgentRuntimeControl 的操作。它使 runtime 进入 draining，此后新的 invoke 与 resume 返回 unavailable。对本实例的全部责任完成交接后，它经登记句柄撤销本实例的登记，释放资源，返回 drained。任一交接未知时返回 unresolved 并报告剩余的 execution，不宣称 drained。quiesce 带操作身份：同一操作同一原因的重试认回原结果；已 unresolved 的重试继续交接并返回当前的剩余；对已在停用中的 runtime 发出的新 quiesce，认回进行中的交接，不创建第二个。Model 与 Tool 的独立执行不因 detach 与 quiesce 而取消，已发生的外部效果不声称可逆。

控制的种类、范围和阶段事实归“取消、退出与结构变更”。本节只定义 detach 与 quiesce 的交接行为，以及撤销登记的结果。

#### 采用交接

adoptions.handover 接收完整 ExecutionSnapshot 与 original，核目标与源同属一个定义身份、原 checkpoint 编码一致及整个原恢复闭包。snapshot 内的原引用须可解析为各自的原精确采用，不能只验私有 state 的 JSON。成功证明绑定 execution/revision、源和目标 continuation 摘要及目标采用。attach 核对原修订仍适用并共同保存转换后接续，修订已变化时返回 changed。兼容证明不授予推进权。

handover 不读取活体的 execution，也不写入任何状态。它的幂等身份、证明失效与 changed 之后的重读见[定义专题的采用解析与交接](docs/public-api/definition.md#采用解析与交接)。目标采用由调用方按新 execution 的同一选择规则取得：当时的合法胜出者，定义不带版本，没有固定到某个版本的分支。选择归采用协调的拥有者。handover 不核对胜出者，只证明原 execution 能交给该目标接续；胜出者随时间变化，核对它会破坏“输入相同则证明相同”的规则。handover 的失败集合不因此增加。

活动 Passage 的精确 implementation/schema、原请求、操作次序、已捕获结果、卡片轮次与消费位置必须保留；只允许外层编码适配，不做语义迁移。新采用只影响尚未开始的经过。显式 reload 先准备新实例，再由治理排序撤旧授新；普通恢复用原采用。无法解释原扩展调用时拒绝交接或保留原精确解释器收束，不能套新版判断、重问卡片或改写固定调用。原调用未物理结束不阻止合法的责任交接。

### 事件流与读取

类型形状见[公开接口页](docs/public-api/README.md#托管协调与运行实例)。本节是事件序号、游标、缺口、背压、订阅关闭与重连的唯一行为源，也定义事件交付的四个层次。

#### 事件身份与序号

事件由 Journal 在条件提交中分配，身份是 execution 加序号。序号是十进制整数的字符串编码，在同一 execution 内从 1 开始，每个事件加 1。提交成功的事件序号连续，没有空洞。序号按数值比较，不按字典序。序号 0 表示第一个事件之前。重放允许重复交付，同一身份的内容不能变化，原文不被后置改写。事件带有 schema 和因果引用。`schema` 是事件格式的精确采用。提供者在建立时固定一个事件格式采用，先于任何 execution 存在；同一 execution 的全部事件，不论种类，都带这一个 `schema`。`entry` 事件的执行挂接与因果引用按“[日志条目](#日志条目)”第 6 条取值；其他种类的事件带有产生它的执行挂接。

Agent 的事件流只发自身事件，`AgentEventBody` 没有透传生产者内容的种类。Model 调用的过程流由观察者按稳定调用引用经 Model 的 current 取得 `StreamRef`；Tool 调用的过程流由观察者按稳定调用引用经 Tool 契约“[过程帧的观察契约](../../tool/tool-contract/SPEC.md#过程帧的观察契约)”的 `current` 取得 `StreamRef`。两者都再经 stream-arrival 的观察端口直接观察，规则见“[流引用与自身事件](#流引用与自身事件)”。接收面条目以 `entry` 事件投影，规则见“[日志条目](#日志条目)”第 6 条。

#### 读取、游标与缺口

read 的 after 是读取方已处理的最后序号。after 为 null 与 "0" 等价，表示从第一个事件开始。limit 是正整数，超过提供者声明上限的请求返回输入无效，不静默截断。after 与 through 必须属于指定的 execution。页中的 next 是下一次读取应使用的 after，页中没有事件时 next 等于请求的 after。caughtUp 表示这一次读取时已追到末尾，不表示终态。只有 ended 事件表示终态已成立。

事件因保留政策不再保留，而读取需要更早的事实时，返回缺口，给出保留起点和恢复入口。缺口不等于空页，也不表示读取方已经消费成功。读取方沿恢复入口取得完整快照后才能继续，Agent 不静默跳过。

#### 订阅、背压与关闭

events 是按需拉取的页序列。读取方消费得慢，只增加它落后的量：不阻塞执行推进，不丢弃已提交的事件。事件已耐久保存在 Journal，落后超出保留窗口时，下一次读取返回缺口。每个活体订阅在内存中的缓冲有字节上界，即配置项 observerBufferBytes（见[通用工厂](../agent/docs/public-api.md#工厂配置)）。缓冲包括 AgentHandle.observe 的状态投影，以及 events 已预取而尚未交出的页。超出上界时该订阅以不可用结束：事件订阅用原游标重连，观察订阅重新 connect。该上界只约束活体订阅的内存，不影响可靠读取与确认。耐久容量不足时，Agent 停止受理依赖新输出的动作并保留待交责任，不丢事件。

订阅因四种原因关闭：读取方的 signal、拒绝、不可用，以及终态事件交付之后。signal 只关闭这一次观察，不取消执行。迭代结束（EOF）本身没有业务含义，既不证明终态，也不证明业务成功或失败。重连以已处理的最后序号作为 after，边界上的重复由读取方按事件身份去重。

每次读取和订阅都核对 Access 与读取资格。读取资格不等于任何执行挂接的推进资格。含有读取方无权内容的页整页拒绝，不返回删减后的页。

#### 确认

acknowledge 的 through 必须是已发出事件的序号，Agent 只确认连续前缀。读取方把事件事实与消费游标共同保存之后，才能提交确认。receipt 是读取方自己的处理依据，可以为 null。Agent 保存它用于追溯，不解释它的内容，只核对 through 单调且不超出已发出的序号。确认是单调的：重复的相同确认认回原回执，小于已确认前缀的 through 认回已确认的前缀而不回退，超出已发出序号的 through 被拒绝。被已确认前缀覆盖的确认按“[原操作认回与恢复](#原操作认回与恢复)”保存自己的请求与认回来源，不替换原前缀的推进依据，也不用自己的依据冒称更高的前缀已被该读取方处理；后来更高的确认成立后，重试原确认仍返回原回执，load 返回当前前缀。同一操作的 receipt 是语义输入的一部分，重试时不得静默换成另一依据。确认回执不公开认回时的前缀数字。确认回执丢失时重试原确认，保存结果未知时先查询原操作。确认只清理满足保留政策且责任已交清的事件，不自动结清事件保管或其他结果责任。

#### 事件交付的四个层次

下列四个层次各自成立，不能互相冒充。

1. 耐久提交：Journal 已把事件与 execution 修订一起保存。这是事件存在的唯一依据。
2. 出口接收：Agent 的事件出口（outlet）把一页事件交给了订阅或读取调用。它只说明页已交出，不说明读取方已保存。
3. 消费者处理：读取方已处理事件，并保存了事件事实与消费游标。这是读取方一侧的事实，Agent 只通过确认得知。
4. 业务接受：消息的拥有者按自己的准入规则接受了该消息。读到 message 事件不是业务接受。业务接受由消息准入决定，不由事件流决定。

确认只表示第三层，不证明终态，不证明业务成功，也不确认 Model 或 Tool 的结果。Model 与 Tool 的结果确认另需真实收场及原处理完成或耐久保管证明，沿各自契约。EOF、超时、撤登记和确认都不自动证明业务终态。

### 生产者接收面

本节依据[决定台账](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6357861225)第三节采用的 J01、J02、J03、J04、J07、J08、J28 与 J40，本节承载这些决定在 Agent 一侧的承诺。`AgentAccessOperation` 增加 receive-result 是给闭合联合加成员，属破坏性改动，见“[结果接收](#结果接收)”第 9 条。本节不定义 Model 或 Tool 的回执类型，也不定义 `StreamRef`。它们归各自的原拥有者。类型的唯一来源是源码，导航见[公开接口页](docs/public-api/README.md#生产者接收面)。

#### 日志条目

J01 规定一份 Journal 内 Agent 条目的读取形状。Agent 在执行记录里另存两类接收面条目，类型是 `AgentJournalEntry`。

| kind | 记下的事实 | 写入者 | 写入时的挂接 |
| --- | --- | --- | --- |
| `start-fence` | Tool 启动围栏已在 Tool 的排序域内生效 | 推进者 | 当前有效的 Authority |
| `received` | 生产者推送的一个结果版本或一个账目修订已被结果接收方保存 | 结果接收方，即合法的保管方 | 不要求挂接 |

条目按下列规则写入和读取。

1. 普通条目经 `AgentJournalEntries.record` 写入。接收方经 `AgentReceivedCommits.commit` 一次提交 `received` 条目与材料，见“[接收共同提交](#接收共同提交)”。原 record 入口保持有效，其接收记录的共存规则见该节。上述端口与 `AgentJournal` 由同一提供者在同一权威排序中兑现。它们由不同排序域提供时，该装配不具备本节的保证。
2. record 成功时推进 execution 修订号，返回 `CommandReceipt`。同一操作同一条目认回原回执。同一操作配不同条目返回 conflict。
3. 推进者写入时带自己的 Authority。该挂接已被取代或其推进资格已撤销时，record 返回 stale-advance，不写入。结果接收方写入 `received` 时 Authority 为 null。`start-fence` 的 Authority 为 null 时返回 invalid，field 为 `authority`。
4. execution 已 ended 时，`start-fence` 返回 terminal。`received` 仍可写入，因为保管资格与推进权分别检查，规则同 recordResult。
5. Access 的租户与 execution 所属租户不同时返回 denied，不区分对象不存在与无权访问。
6. 读取形状是 `ExecutionSnapshot` 与 `AgentEvent`。`ExecutionSnapshot.entries` 是可选字段。提供者支持本端口时，它按提交顺序给出该 execution 的全部已提交条目。字段缺席表示提供者不支持接收面条目，不表示没有条目。需要条目的读方在字段缺席时返回 unavailable，不把缺席当作空列表。条目另以事件种类 `entry` 投影：事件体是 `Readonly<{ kind: 'entry'; entry: AgentJournalEntry }>`。投影按下列规则成立。
   - Journal 在写入条目的同一次原子提交里分配 `entry` 事件。写入条目的入口是 `AgentJournalEntries.record` 与 `AgentReceivedCommits.commit`。条目与事件不会只成立一半。`AgentJournal.commit` 的 `events` 不含 `entry`，`entry` 事件只由写条目的这两个入口分配。
   - execution 已经 ended 时，ended 之后可写的 `received` 条目照常写入，但不追加事件。ended 仍是最后一个事件。终态之后写入的条目只经 load 与 `ExecutionSnapshot.entries` 读取。
   - 事件的执行挂接取该 execution 最近建立的挂接。结果接收方写 `received` 时不带挂接，这一条同样适用。
   - 事件的 `schema` 是该 execution 全部事件共用的那一个事件格式采用，规则见“[事件身份与序号](#事件身份与序号)”。
   - 事件的 `cause` 取写入该条目的那次提交的耐久证据，即该次 record 或 commit 回执的 `evidence`。
   - 同一操作的重放认回原回执，不重复分配事件。
   - 读事件的一方遇到不认识的 `entry.kind` 时保留原事件，不报错，不对 `entry.kind` 做穷尽断言。
7. `AgentJournalEntry` 是开放联合。读方遇到不认识的 kind 时保留原条目，不解释它，不报错，也不丢弃。读方不得对 kind 做穷尽断言。今后增加种类按可加改动处理。
8. 共同提交中，参加者因推进资格已被取代或撤销而冲突时，Agent 返回 stale-advance，规则见“[提交参加者协议](#提交参加者协议)”。
9. 结果接收工厂必须取得同一 `AgentReceivedProvider` 的条目与材料视图，以及 `AgentAccountOutlet`。不得用分离存储或吞掉账目的默认实现补齐依赖。`received` 为 null 时拒绝提供接收能力。在 Model 结果路径中，loop 不写 received、不执行账目出站，只读取 Journal 及同提供者的材料。这不取消 J03 中 Tool 推进者记录 start-fence 的既有责任。该分类针对独立接收工厂，不把 Model 接收责任移入 Agent runtime 工厂。

#### 结果接收

J02 规定结果的去处、常驻的结果接收方、保存回执与账目。结果接收方实现 Model 的 `ModelResultReceiver` 与 Tool 的 `ToolResultReceiver`，按原拥有者的协议返回 saved 回执。结果接收方由 Agent 宿主装配并常驻，是 Agent 实例外的角色，不随实例重装配丢失状态。回执与失败的形状、saved 的合取事实和 push 的决定顺序归 Model 的[结果推送与保存](../../model/model-contract/SPEC.md#结果推送与保存)与 Tool 的[结果推送与保存](../../tool/tool-contract/SPEC.md#结果推送与保存)。本小节只规定接收方在 Agent 一侧的责任。

1. 去处。生产者推送到受理时冻结的 `ConsumerRef`。接收方按冻结 consumer 和原调用引用查找原 `PendingCall`、consumption、execution 与原 instance，不重新选择去处。稳定目标查询由保存原消费绑定的提供者实现，以 Access、冻结 consumer 和原调用引用为查询依据。原绑定随 Journal 已提交的 PendingCall 建立，包含租户、execution、原 instance、reference、consumer 与 consumption。checkpoint 清掉已完成调用、原 attachment 脱离或实例销毁后，提供者仍保留这份绑定供迟到交付和账目使用。不得从当前 attachment 或任意 consumer 文本猜测 instance。
2. 租户。载荷的调用引用编入租户。接收方用原拥有者的公开 resolve 函数取得这个租户，核对它与 `access.tenant` 相同。接收方不从去处、地址或宿主取得租户。目标不存在、跨租户或无权访问时统一返回 denied，不泄漏存在性。
3. 保存。`received` 条目的唯一写入者是结果接收方。它经 `AgentReceivedCommits.commit` 提交完整冻结载荷的 `Material`，或不依赖生产者待释放副本的可恢复引用的材料表示，以及尚无材料证据的条目草稿。提供者在同一次提交中建立完整 `received` 条目、材料与 saved 依据。接收方取得 committed 的原结果后才返回 saved，不在调用方先 preserve 再 record。saved 证据的 owner 是冻结的 `consumer.owner`，证据定位 `received` 条目、材料和原消费责任。能力与未知处理见“[接收共同提交](#接收共同提交)”。
4. 认回键。结果的认回键是（租户，生产者种类，调用，结果版本）。账目的认回键是（调用，Model 的 dispatch 或 Tool 的账目事件 event，修订），租户来自调用引用。键直接取生产者的交付键：Model 的 `ModelDeliveryKey` 与 Tool 的 `ToolDeliveryKey`。接收操作身份由完整交付键确定派生，提供者再按租户与 execution 分域。新旧接收入口共享此认回键，同键同内容认回原条目与原 saved。同键异 consumer、consumption、材料或账目返回 conflict，原条目不变。提交未知时只查询原 operation；仍为 unknown 时不发 saved，不自动换身份。excluded 不冒充成功。
5. 账目。`received` 条目带推送载荷里运行时补全的账目。Model 结果带冻结时全部 dispatch 的账目快照。Tool 结果带 account 或 null。账目交付带该修订的 `CallAccount`。尚无报告时保持 null，不填零。
6. 主体。接收方以代原租户行事的主体写 Journal（J19）。写入所用 Access 的租户就是调用引用的租户。接收方不以系统作用域的主体写某个租户的条目。
7. 容量与背压。接收工厂必须取得显式的租户容量策略，额度不足时按生产者协议返回 backpressured，不删除旧责任来腾出空间。逻辑额度与实际 in-flight 槽分别记录，同 key 已保存不重复占逻辑额度。部分保存、未知及仍在途的写保留相应占用；等待取消不能释放仍在途的槽。只有已知未提交时才释放相应临时预留。取消和容量的完整决定顺序沿原生产者协议，不撤销已成立的共同提交。
8. 恢复。接收方从 `received` 条目与原材料认回已保存交付。尚未收到的账目修订可以经 Model [逐操作行为](../../model/model-contract/SPEC.md#342-逐操作行为)中的 dispatches 取回。取回的账目通过原交付校验并经 `received` 共同提交之后才被采用，不能由查询伪造 loop 可采用的结果。该入口当前只保存在内存里的账目不具备进程重启后的取回保证，耐久责任仍由原提供者承担。
9. 主体资格。每次 push，包括已保存交付的重投，都先以 `AgentAccessCheck` 核验主体的 receive-result 资格，目标使用原绑定的 instance 与 execution。allowed 之后才读取原调用权威或写入。denied 与 unavailable 按生产者协议返回，不写入，没有默认放行。核验结果只对这一次 push 有效，缓存不放行。`AgentAccessOperation` 的 receive-result 成员由本节承担。
10. Model 原交付校验。接收工厂必须取得 Model 的只读 inspect 与 dispatches。每次 push 在主体资格通过后，经这些入口核验原受理、admission、完整冻结 consumer 和完整 dispatch 集合，然后才能认回原 saved。原调用未受理、admission 非原值、consumer 不符、dispatch 缺项或多项等，按 Model 协议的字段与原因返回 invalid；集合不可读返回 unavailable，dependency 为 dispatches。只有这些前置检查通过后，同 key 异内容才返回 conflict。Model 查询只决定 push 准入，完整材料仍来自本次合法的生产者交付，不由 inspect 构造。
11. 完整材料。接收方在首次异步或排队前取得合法 typed delivery 的自有冻结副本，后续调用方修改不得改变已接收输入。Model 交付使用现有 facts 材料分支及具名版本 schema，保存完整 settlement、parts、accounts、consumer 与 key。读取时校验 schema、租户、原 reference、版本及绑定；缺失或不支持的材料显式失败，不把未知 JSON 强转为可信材料。此约定不增加 Material 分支或改变接收共同提交的公开形状。Tool 交付的完整收场 schema（`terminal`、`actualTerminal`、`effect`）尚未采用，见开放问题 [AGENT-M06](../agent/docs/architecture/open-questions.md#agent-m06)。
12. loop 与接收方分工。正常 loop 对 Model 只调用 admit 与 cancel。受理未知或恢复重新挂接时允许 inspect 对账，但不能由查询返回值写 received 或材料。loop 等待 Journal 条目、现有事件提示和 timer，不连接 Model observer，不轮询 Model 收场。缺少 entries 返回 unavailable；无匹配 received 时继续等待。采用时按原 reference、consumer 与 consumption 选择已提交 result，再从同一提供者读取完整材料。后续恢复仍由原 received 派生结果，业务提交沿原 checkpoint 与幂等交接规则。接收提交增加 revision 时，仍持有效 attachment 的 loop 必须重新 load 并以新修订继续条件提交，不能将该变化误判为另一推进者。真正失去 Authority 时仍停止推进。

维护入口 retry/recover 返回 Agent Reply，先从原绑定提供者取得该 execution 的完整原 Model 绑定集合，再核各原 instance/execution 的当前 receive-result 资格。无对象、无原绑定或无权统一 denied；依赖不可读返回 unavailable，不能返回空成功报告。材料读取、出站、报告与诊断均限定到本次绑定集合，await 期间新增绑定不进入本次维护。每次出站和最终报告之前重核资格；拒绝不改变原 unknown、blocked 或实际在途责任。inspect 仅供宿主管理，可返回全局状态，不可暴露为租户查询。

saved 与 outlet 完成互不等待。宿主状态持有出站任务引用和驱动代。重装配不清理真实在途任务；旧代只结算已开始的交接，不发出后继。维护取消结束等待与后续驱动，不撤销交接；目标或资格检查仍未决时返回无内容 unavailable，owner 为 agent-model-receiver，diagnostic 为 maintenance-cancelled。已判定拒绝时保留 denied。任务引用与驱动代属于同进程控制，不是耐久业务身份。

##### Model 接收结果与失败映射

结果接收方把共同提交的内部结果转换为 Model 的公开 push 结果，不扩展两侧的公开联合。公开载荷或关系不合法时，先按 Model 原协议返回其规定的 invalid 字段和原因。提供者内部的 invalid 不属于这些生产者输入错误，按下表处理。

| 内部事实 | 本次 push 的公开结果及接续 |
| --- | --- |
| commit 或 query 返回 committed，原材料与责任均可核对 | 返回原 key 与原 saved。outlet 失败不改变 saved |
| commit-unknown；原 query 返回 unknown，或其依赖不可读 | 返回 outcome-unknown。保留同一 operation、完整输入和占用，只继续查询原操作，不自动换身份或重做 |
| 原 query 的当前资格核验返回 denied | 返回 denied，不披露缓存。原未知继续保留，denied 不构成排除 |
| commit 或 query 返回 excluded | 返回 unavailable，dependency 为 responsibility。保留原排除依据，同 key 重投仍沿原 operation，不得换号复活。已确定未提交的临时预留可以释放 |
| commit 或 query 返回 unsupported，包括旧接收记录缺少 saved 的富结果依据 | 返回 unavailable，dependency 为 responsibility。不补造 saved，不把旧记录当作未提交 |
| denied | 返回 denied，不返回原条目或材料 |
| conflict | 返回 conflict，不改变原状态与责任 |
| commit 返回 unavailable，且没有未决写 | 返回 unavailable，dependency 为 responsibility。不声称原操作已排除，按原身份接续。此前仍有未决写时返回 outcome-unknown |
| 提供者内部 invalid，或与接收无关的 stale-advance、not-ready、terminal、busy、changed | 返回 unavailable，dependency 为 responsibility。保留具名内部诊断，不向生产者泄漏内部输入路径，不虚构 Model 的 invalid 关系 |
| 写入可能成立之后抛错或意外中断 | 返回 outcome-unknown，按原 operation 查明，不能改报普通失败 |
| 确定未开始接管之前抛错 | 返回 unavailable，dependency 为实际失败依赖。原有未决状态继续保留 |

原操作以及未知或排除记录不得因这些响应而清除。查询 unavailable 不能抹掉原 unknown；只有后续权威查询确认 committed 或 excluded 后才能更新该未知状态。接收方不得自动为已排除的交付创建另一 operation。内部诊断保存在宿主持有的接收状态中，接收组件重装配不清除它。

#### 接收共同提交

`AgentReceivedCommits<P, B>` 是结果接收方保存一次交付的独立端口。其 `commit` 接收 `ReceivedCommitInput`，由 `ExecutionMutation`、不含 material 的 `ReceivedEntry` 草稿与完整 `Material<B>` 组成。输入不带 Authority，调用方不预造材料证据。`query` 只接收指向原操作的 `ExecutionMutation`。公开类型的唯一来源是源码，本节规定这些值的行为。

##### 能力与共同可见

`AgentReceivedProvider` 聚合 journal、entries、materials 与 received 四个视图。它们属于同一提供者及同一权威提交序列，不得拼装独立排序域。received 在提供者构造后固定，非空即声明支持本能力，null 表示不支持。需要本能力的消费者在任何保存前拒绝 null，按 unsupported 处理。非空端口实际不能兑现时，也须在本次保存前返回 unsupported，不降级为 preserve 加 record。该声明不改变原工厂依赖分类。

提供者内部准备材料引用、完整条目、原 `CommandReceipt` 及 saved 证据，在一个发布点共同建立材料、条目、消费绑定与操作结果。成功只推进一次 execution revision。材料身份由原交付键与冻结消费绑定确定，不随重复调用的新 operation 改变。发布前可在私有暂存区准备，不能公开本次新材料、条目或可用的 saved。发布后，条目中的 material 经同一提供者的 `AgentMaterials.read` 可读，且指向本次完整材料。

任一公开已提交状态都不能只含本次新增的材料或条目。`AgentJournal.load` 与材料读取必须投影同一权威状态。两次独立读取跨越发布点时可分别读到旧态和新态，本能力不为它们建立共同快照。原先已独立保存的材料不因本次提交而成为新材料，也不能据此追认历史两写具有原子性。

`ReceivedCommitResult` 的 committed 分支带 `ReceivedCommitValue`，其中 receipt 是原命令回执，entry 是含材料引用的完整原条目，saved 是生产者保存回执所需的耐久依据。saved.owner 必须是冻结的 consumer.owner，并定位已成立的条目、材料和原消费责任。receipt.evidence、entry.material 与 saved 分别承担命令、材料和保存依据，不要求三者相等。提供者不能仅改普通命令证据的 owner 来伪造 saved。接收方将原 saved 按生产者协议返回，不在本端口执行生产者 ACK。

##### 资格、身份与认回

commit 与 query 都先核对当前租户、访问及保管资格，再返回任何缓存的结果或排除依据。执行不存在、跨租户或无合法资格一律 denied，不暴露存在性。推送主体按 J02 的 receive-result 核验，直接查询按 query 核验。在已核验的公开操作内调用时遵循“[主体资格核验](#主体资格核验)”的核验分工。提供者另核原交付键、冻结 consumer、原 consumption、完整材料、结果版本和账目绑定。调用方自报消费位置不能代替提供者核对原绑定。

新端口与既有 Journal 命令共享（租户，execution，operation）身份空间，条目接收共享原 delivery 认回关系。提供者先判定已有 operation 的语义冲突或排除状态，再认回 delivery，不能用 delivery 的原结果覆盖该 operation 已有的冲突或排除。其他命令占用的 operation 返回 conflict。相同 operation 的完整语义输入包括 entry 草稿及完整 material，不包括本次准备时生成的证据。

同 operation 同完整语义输入认回原 value，不新增材料、条目或 revision。同 operation 异语义输入返回 conflict。同 delivery 同内容并发时只允许一份材料、一条条目和一次 revision 推进。另一 operation 重送同 delivery、同完整内容时，认回整项原 value，并为该重复 operation 保留到原结果的认回关系。receipt 的 operation、revision、evidence 与 state 均保持原值，不能换成重复 operation。后续以重复 operation 查询也返回该原结果。同 delivery 异 consumer、consumption、材料或账目返回 conflict。

##### 失败、未知与排除

commit 通过 `Reply<ReceivedCommitResult>` 返回 committed 或 excluded，query 通过 `Reply<ReceivedCommitQuery>` 返回 committed、excluded 或 unknown。excluded 携带原排除依据 `DurableEvidence`，不伪装为失败或成功提交。两者仍通过既有 `Reply` 表达 Failure，不扩展原 Failure 或 Journal 查询的闭合联合。

| 情况 | commit | query 及接续 |
| --- | --- | --- |
| 原提交成立 | committed，含原 value | committed，含同一原 value |
| 提交中途确定失败 | unavailable，本次材料与条目均未新增，revision 不变 | 不据失败虚构排除。同 operation 同输入可重试；先前未知仍按原操作查明 |
| 提交可能成立，响应无法确定 | commit-unknown，operation 为原操作 | 按原 operation 查询，不换身份重放可能有效的写入 |
| 原操作尚无足够确定证据 | 提交是否成立不能确定时仍为 commit-unknown | unknown。unknown 与查询失败均保持责任，不表示未提交，不发 saved |
| 已有权威依据排除原操作及其迟到提交 | 同输入返回 excluded 及原 evidence | 返回相同 excluded。查询本身不建立围栏，不因内存缺项生成排除依据 |
| 同 operation 异语义，或同 delivery 异绑定或内容 | conflict，原状态不变 | query 只按原操作投影，不执行内容比较或新写入 |
| 输入形状无效 | invalid，field 精确指向无效输入，reason 说明原因 | 同样适用查询输入 |
| 当前租户或资格不允许 | denied，不返回原状态 | denied，不返回原状态 |
| 依赖或权威状态不可读 | unavailable | unavailable，不能据此确定原提交不存在 |
| 无能力，或旧记录缺少可恢复的富结果依据 | unsupported，本次不新增状态 | unsupported，不表示原操作没有提交 |

invalid 的 field 使用实际输入路径。`ExecutionMutation` 直接包含 Access 的字段，缺租户为 tenant，无效 execution 或 operation 使用对应字段。畸形交付键、消费位置、消费身份或材料分别定位 entry.delivery、entry.consumer、entry.consumption 或 material 下的实际无效路径。已通过结构校验但与原绑定或完整语义输入不一致时使用 conflict，不把它改报为 invalid。权限核验不可用按 unavailable 返回，不能以缓存结果放行。

已有排除依据约束该 operation，重复 commit 不得使其复活，也不得允许迟到提交发布。query 只读原权威事实，不调用 preserve、不补写条目、不另建权威日志。排除之后如何显式建立另一项合法接收，不由本端口规定，调用方不能据此自动换操作身份。

##### 与原入口共存

`AgentJournal.query` 对新提交及其重复 operation 返回同一原 `CommandReceipt`。新 query 是该操作结果的富投影，补回 entry 与 saved。查询旧的非接收命令时返回 unsupported；旧接收记录不足以恢复富结果时同样返回 unsupported，不能以 unknown 暗示没有提交。

新旧接收入口按下表共享原 operation 与 delivery。跨入口只有下列同一接收事实的认回可复用，跨方法复用 operation 为其他语义仍返回 conflict。认回之前均核验当前资格。

| 先成立的事实 | 后来的调用 | 结果 |
| --- | --- | --- |
| 新 commit 已成立 | 旧 record 同 delivery、同完整条目，可为同 operation 或另一 operation | 返回整张原 CommandReceipt；重复 operation 后续 query 也认回原结果，不推进 revision |
| 旧 record 已成立 | 新 commit 同接收事实，原条目、完整材料与原合法 saved 均有可核对依据 | 返回原 receipt、entry 和 saved；不同 operation 同样建立认回关系，不改原回执身份 |
| 旧 record 已成立，但引用的材料缺失或不可读 | 新 commit 同键认回 | unavailable，不补材料，不追加条目或推进 revision |
| 旧 record 及材料已成立，但原合法 saved 无可恢复依据 | 新 commit 同键认回，或新 query 查询该接收操作 | unsupported，不伪造 saved，不表明旧条目未提交 |
| 任一入口的 operation 为异语义，或 delivery 的绑定、材料、账目冲突 | 另一入口写入 | conflict，不覆盖原记录或认回关系 |

既有 `AgentJournal.query` 查询旧 record 时，材料缺失不阻止它投影既有命令回执。新 query 若有足够原结果依据但其材料已不可读，返回 unavailable；缺少富结果依据时返回 unsupported。旧 record 原有必需输入及行为保持，本能力不为旧 preserve、record 两写补发原子性证明。只有新端口的一次联合提交受共同可见保证约束。

##### 生命周期、恢复与验证

commit 只保管原交付，不推进业务，不需要有效挂接。execution ended 之后仍可在合法保管资格下调用 commit 与 query，不恢复业务推进。commit 在同一次提交里分配 `entry` 事件，ended 之后不追加，规则见“[日志条目](#日志条目)”第 6 条。除此之外两者不新增通知、回调或事务阶段。提供者或 runtime 换代后仍沿原 operation、delivery 与同一权威状态认回，不能用新实例身份重建交付。进程内未知与重启后的认回遵循相同规则，实际耐久与跨进程保证由提供者兑现。

`agentJournalEntriesConformance` 保留原单参数入口及其条目验证范围。验证本能力时须显式选择 received 为 required，并给出同一公开状态的 joint fixture。缺少配置或必需方法须立即失败，不能自动探测后跳过。新用例从同一套件入口返回，至少覆盖共同可见、中途失败双方不可见、同操作重试认回原回执。还须验证跨 operation 认回原回执、未知查询、已有排除及迟到提交、租户与绑定边界、ended 接收及旧入口共存。最小内存参考实现只证明这些契约行为，不证明生产耐久、断电或跨进程恢复。

#### Tool 启动围栏

J03 规定 Agent 怎样使 Tool 的旧启动失效，以及“已生效”记在哪里。Agent 是 Tool 的外层调用方，经 Tool 的窄服务 `toolStartFence` 使它负责的、尚未受理的启动失效。服务、键与失效协议归 Tool 的[外层调用方的启动围栏](../../tool/tool-contract/SPEC.md#外层调用方的启动围栏)。依赖方向是 Agent 契约依赖 Tool 契约，Tool 不依赖 Agent。

1. Agent 只取得 `toolStartFence`，不取得 `toolStartAuthority` 的 prepare、consume、inspect 或 exclude。
2. 守卫是 Agent 自己的资源。owner 是 Agent 的拥有者名，resource 是该拥有者内的资源名，例如被撤销的挂接代次。revision 与 evidence 指向 Agent 自己保存的失效依据。
3. invalidate 返回失效证据之后，Agent 把证据写成独立的 `start-fence` 条目，与业务取消的 `ControlRecord` 分开保存。取得证据之前，Agent 不声称新的发起已被阻止。回执未知时，Agent 用原 operation 与原守卫重送。
4. 围栏不停止进行中的调用。对控制责任内仍需停止的每个调用，Agent 分别经公开的 `ToolRuntime.commands.control` 以原调用引用提交 stop，每次使用自己的操作号。stop 受理不等于物理停止。
5. 未决项（#502）：哪些控制或挂接变化触发 invalidate，以及 invalidate 返回 denied 或 unavailable、`start-fence` 的 record 返回 stale-advance 时 Agent 怎样处置，本契约尚未规定。

#### 流引用与自身事件

J04 规定显示投影凭什么观察生产者，以及观察资格由谁签发。

1. Agent 的事件流只发自身事件。生产者的过程流由观察者经 [stream-arrival](../../common/stream-arrival/README.md) 的观察端口直接观察，先快照后增量。观察资格由授权与接入一侧签发，生产者核验。Agent 不签发观察资格。
2. Agent 不记录生产者流引用。Journal 只保存稳定调用引用。Model 调用的观察者按该引用经 Model 的 current（[公共内容观察与当前目标](../../model/model-contract/SPEC.md#公共内容观察与当前目标)）取得当前 `StreamRef`；Tool 调用的观察者按该引用经 Tool 契约“[过程帧的观察契约](../../tool/tool-contract/SPEC.md#过程帧的观察契约)”的 `current` 取得当前 `StreamRef`。重新挂接仍沿各自的 current，不把旧流引用当事实。Agent 实例内可以缓存首次挂接目标，缓存不写进 Journal。`StreamRef` 不带凭据，持有它不是观察资格；观察者另带显式 Access，生产者核对两处租户相同。
3. Agent 不透传生产者的内容。`AgentEventBody` 没有携带生产者内容块、schema 或 cursor 的事件种类，显示投影只凭流引用观察生产者。

#### 账目出站

J28 规定“某次固定请求的账目已收到”由谁、经哪个端口交给 Request Context。

1. 结果接收方在 `received` 条目提交之后，经 Agent 自有的出站端口 `AgentAccountOutlet` 把账目交给 Context 一侧的适配器。账目不经第三方转交，Context 也不直接读 Model。
2. 交接元组 `AgentAccountHandoff` 带编入租户的 Model 调用引用、dispatch、该修订的 `CallAccount`、原结果版本和 `received` 条目的提交证据。原账目确有结果版本的关联时才给出结果版本，否则为 null，不从账目修订推造。端口输入另带 Access。Context 一侧核对 Access 的租户与调用引用的租户相同。
3. 本端口只交 Model 账目。Tool 的账目不经本端口交给 Context。
4. 幂等键是（租户，调用，dispatch，修订）。同一交接可以重交。结果有六种：received、denied、conflict、invalid、unknown、unavailable。received 包括对方认回的重复交接和被较高修订取代的乱序修订。结果为 unknown 或 unavailable 时，接收方保留待办，以同一交接重试。结果为 denied、conflict 或 invalid 时不重试同一交接，接收方仍保留原待办并报告带具名原因的诊断，不静默丢弃。这与 RQ-14 的“调用方保持原待办”一致。received 不是清理 Journal 条目的依据。
5. 接收方在共同提交 committed 之后，交出 result 中全部非 null 的账目，或 account 交付的单个修订。恢复以 `received` 条目及其材料为重放源，不另建权威业务日志。出站失败不撤销已经交给生产者的 saved，重复 push 的 saved 结果也不因此改变。
6. 宿主持有接收状态及接收组件，Agent 实例重建不替换它们。接收组件重装配时继续传入同一宿主状态，经 recover 按 execution 从 received 恢复待办。unknown、unavailable 在 retry 或 recover 时以同一 handoff 重试，宿主在存在可重试待办时驱动 retry。denied、conflict、invalid 的待办标为 blocked 并保留诊断，不自动重试；重装配与 recover 也不得清除 blocked 或重新自动发送。停止只终止本次驱动，不取消已受理的共同提交，不删除材料或待办。内存状态只支持同进程接续；要求跨进程恢复的宿主必须保存该状态。
7. Context 一侧的适配器与目标作用域的取得归 Request Context 的 [RQ-14](../../context/request-context-contract/SPEC.md#rq-14-窗口占用与账目收到)。Agent 契约不导入 Request Context 的成员。

#### 控制映射与无活体入口

J07 规定外部协调者的控制怎样映射到 Agent，以及没有活体 runtime 时控制走哪个入口。外部协调者按下表把自己的控制意图翻译为 Agent 操作。

| 外部协调者的控制意图 | Agent 操作 | 是否需要推进资格 |
| --- | --- | --- |
| 中断一个具名的模型调用 | control，`ExecutionControl` 为 interrupt-model | 否 |
| 中断一个工具调用，或请它转后台 | control，`ExecutionControl` 为 interrupt-tool 或 background-tool | 否 |
| 取消该执行 | control，`ExecutionControl` 为 cancel | 否 |
| 暂停该执行 | control，`ExecutionControl` 为 suspend。解除挂接的次序与崩溃恢复待 #730 写回，见“[四种控制](#四种控制)”之后的说明 | 否 |
| 插队输入 | input.submit，优先级为 urgent。插队不是控制，见“[插队](#插队)” | 否 |
| 交还当前挂接 | 经 `agentExecutionRecovery` 服务调用 `AgentExecutionRecovery.detach`。调用方先经 load 取得目标挂接的 Authority | 否。目标是仍存活的其他 runtime 的挂接时，另需 takeover 资格 |

Agent 提供两个不需推进资格的入口：control 与 detach。

1. control 的形状是 `AgentExecutionControl.control`。`agentExecutionControl` 服务就是经恢复入口发生的 control。宿主的长期执行记录适配器提供这个服务，并在实际执行处以操作名 control 核验主体。外部协调者经它提交控制，不需要执行句柄或挂接。受理、主体资格与六个阶段的规则不变。
2. detach 的形状是 `AgentExecutionRecovery.detach`，经 `agentExecutionRecovery` 服务调用，行为见“[交接与停用](#交接与停用)”。detach 仍带目标挂接的 Authority，调用方经 load 取得它，自己不需要持有挂接。
3. 两个入口都在实际执行处按“[主体资格核验](#主体资格核验)”核验主体。它们不要求调用方持有挂接，也不授予推进资格。
4. 两个入口的形状以本节和公开接口页为准。实现归 #502。
5. 未决项（#502）：经 `agentExecutionControl` 受理控制时 execution 仍有 active 挂接，该挂接的 runtime 怎样得知新的控制，本契约尚未规定。
6. 追加输入不需要活体 runtime：input.submit 沿原 execution 的耐久视图受理，不要求 advance、grant、槽、resume 或 attach，规则见“[输入内容与水位线](#输入内容与水位线)”。长期输入适配器从原 execution 的耐久绑定与原 provider 采用解析 coordination、scope、定义与历史组合，不从当前 runtime 内存取得这些事实；它在自身装配及每次所需操作处核相同的支持要求，不以创建一个 runtime 作为能力检查的前置。缺真实组合仍为 unsupported，原来源暂不可读仍为 unavailable，仅 I1 已 disposed 不触发这两种错误。无活体时 submit 的公开入口与服务键尚未落地，登记在[开放问题](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。

#### 作为 Model 调用方

J08 规定 Agent 作为 Model 调用方时适用的 Model 侧条款。

1. Agent 宿主为 Agent 的消费者 owner 提交 Model 的装配声明 `ModelConsumerOwnerDeclaration`。声明的 work 为 exempt，evidence 是该 owner 的受信证据适配器的采用。声明规则归 Model 的[资格、共同提交与实际发送](../../model/model-contract/SPEC.md#342-资格共同提交与实际发送)。
2. [资格参加者协议闭合之前](../../model/model-contract/SPEC.md#342-资格共同提交与实际发送)，Agent 的全部 Model 调用都按免守卫受理。免守卫不提供单调失格的保护。推进资格撤销之后，新的 Model 发出由 Journal 的条件提交（stale-advance）与动作发出围栏阻止。
3. `retry` 计划的 `notBefore` 非 null 时是 `UtcInstantText`，即 `judgeExtensionOutput` 以 `parseInstant` 校验过的 UTC 时刻文本。Agent 把它原样交给重试策略协调者，作为协调者所形成重试决定的 `notBefore`。扩展给出的时刻文本不会未经校验地到达 Model。`notBefore` 为 null 时，Model 重试决定的 `notBefore` 取该 Conclusion 的 `at`。`at` 由 Agent 在把合法输出包装为 Conclusion 时写入，值是 `AgentClock.now` 的成功值，形式见“[时钟读取与等待](#时钟读取与等待)”。Agent 把 `at` 交给重试策略协调者之前以 `parseInstant` 判定一次。判定失败时不把这次重试交给协调者，按“[时钟读取与等待](#时钟读取与等待)”取时失败一条保留原准备与接续。这里的原准备与接续是调模型之后失败分支在重试决定之前的状态。判定失败是 Agent 一侧时钟的失败，不是扩展的不合法输出，不记到扩展头上。之后该扩展调用怎样接续未决，见 Agent 的[开放问题](../agent/docs/architecture/open-questions.md#at-判定失败之后扩展调用怎样接续)。
4. 调模型之后失败分支的 `retry` 与 `stop` 结论只是策略建议。Agent 把首内容前的失败经过交给重试策略协调者，然后在原消费位置等同一个调用。重试策略协调者实现 Model 的 `ModelRetryPolicy`，托管该失败分支的有序扩展链，受信系统重试扩展是链中唯一的强制组件；两者的采用分开，普通作者扩展都是可选组件。协调者沿原 RetryPosition 形成唯一可核验的决定，Model 保存该决定并核验其来源后才可能准备下一次 dispatch。Agent 不提前消费结果，不代替 Model 确认，也不自己发第二个调用。链上没有合法 retry、有效的停止意图成立，或强制组件确定缺席、失败或超时时，协调者保存 stop 并保留原失败 fault；强制组件不可用的 stop 以 `ModelFault.cause` 为 `policy-unavailable` 表达，diagnostic 指向真实原因。只有某次 RPC 超时而没有原启动或结果事实时保持未知，不伪造耐久的不再重试。链内各输出的归约规则见[扩展作者协议](docs/public-api/extensions.md#输出)，实现位置是开放问题页的 [U-2](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。采用依据是 [Q8](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373457058) 与 [MP1、MP2 的配对](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373845600)。
   - Model `prepareRetry` 的 consumer 编码：owner 等于协调者 adoption 的 owner，work 等于原 ModelCallId 的完整字符串，position 等于原 DispatchId 的完整字符串，purpose 固定为 `model-retry-policy`，在租户范围内解释。协调者的记录键是租户、call 与完整的 RetryPosition，不同的 policy operation 不因 consumer 相同而合并，operation 保持唯一身份。原 Model 调用的 `CallState.consumer` 仍是 Agent 在调模型之后失败分支的等待，与 `RetryPosition.consumer` 不互换。协调者先耐久固定完整的原 position，恢复不借新的 Agent 挂接。
   - 决定来源的核验：Model 的受信适配按原 `position.policy` 解析协调者的 inspect，以当前受信 principal 与显式租户读取原 position，核验同一 decided、同一完整 position、同一决定与同一 source，并验证 source 由协调者的耐久记录拥有者签发、摘要与修订对应真实记录。调用者自报 owner 或 digest、指向任意非空 Evidence 都不构成核验。协调者解析不到、来源读权限未知或记录查询不可用时，Model 不保存新的决定。
   - 协调者的 worker 停用而耐久记录 authority 仍可用时，该 authority 依据原 manifest 的确定生命周期事实记录同一协调者的不可用决定，inspect 仍认回它。协调者的采用与记录 authority 整体缺席时的收场没有采用：原调用保持具名未完，禁止新 retry，不声称已收场，见开放问题页的 [U-8](../agent/docs/architecture/open-questions.md#journal-联合表达的具名缺口)。Settlement 的 source 不能冒充协调者的 decided.source。
   - 协调者的记录、计时、决定与保管由 Model 宿主或其独立的持久依赖持有，寿命不取决于发起的 Agent 挂接。Agent 的 Journal 持有原 Passage、卡片、输出与该失败分支的等待。旧 Agent 挂接丢失不使原策略不可用，协调者保留状态并等待合法后继。
5. 下列各点交 Model 拥有者确认。[#682](https://github.com/nemori-ai/omne-harness-lite/issues/682) 已接受的内容没有确认它们，本契约写为未决项。第 4 条的 consumer 编码与来源核验已由 MP1、MP2 的配对确认，不在此列。
   - 证据适配器的端口形状。Model 契约只有装配声明里的 evidence 采用，没有导出该端口的类型。承接卡未定。
   - replay 被拒之后的再次发出怎样由重试决定表达，以及 resent 从哪里来（PM-05）。这一点与 [#446](https://github.com/nemori-ai/omne-harness-lite/issues/446) 的 5.1 同批确认。
   - J08 原文所说交 Model 确认的其余四点，在具名来源中没有找到，本契约不列出。

#### 执行身份的范围

J40 规定 `AgentExecutionId` 的唯一范围。

1. `AgentExecutionId` 只在租户内唯一，与 Model 的调用身份一致。两个租户可以持有相同文本的 execution 身份，它们是两个不同的 execution。
2. Journal 提供者以（租户，execution）为键保存和查找执行记录。
3. Access 的租户与 execution 所属的租户不同时，操作返回 denied，不区分对象不存在与无权访问。
4. 别的对象引用一个 execution 时同时带租户。只持有 execution 文本不是读取或控制的资格。

### 逐操作及输入分类

输入与返回的类型形状见[公开接口页](docs/public-api/README.md)。下面两张表给出每个公开操作在形状之外的要素：错误、授权、幂等、并发、事件与生命周期。行为的细节在各自的节中，表格只写要点并给出去向。错误名称是 Failure 的种类。每个公开操作都先核对 Access：缺租户返回输入无效，跨租户返回 denied。随后以 AgentAccessCheck 核验主体资格，denied 与 unavailable 按“主体资格核验”处理，不放行。

| 操作 | 输入要点 | 成功返回 | 错误与未知 |
| --- | --- | --- | --- |
| AgentRuntime.invoke | Access、操作身份、调用方预先分配的 execution 身份、受理输入（内容、来源依据、优先级）、推进资格依据（可空）。受理之内先经 `MessageHandoff.prepare` 的 invoke 分支取得准入结果，再以 open 真实受理 | 原 execution 的句柄 | busy；unsupported（装配的提交种类未声明；standalone 绑定收到非空推进资格依据或非空来源依据，写前返回）；unavailable（必需依赖缺席、主体资格核验不可用，runtime 处于 draining 或 disposed，或原 H 已 excluded）；denied（无发起资格、推进资格依据核对失败，或 coordinated 绑定要求 grant 而收到空 grant）；invalid（首个输入被消息准入拒收，字段为 value，原因为拒收原因；不创建 execution；原 H 已 rejected 时按 Ki 认回同一 invalid，不重判）；conflict（同一操作或同一 execution 身份配不同输入，或同 Ki 配不同完整业务请求）；commit-unknown，先按原 open 查询，查无 execution 不证明外部准入未发生 |
| AgentRuntime.resume | Access、操作身份、原 execution、恢复依据（可含宿主的失联判断）、推进资格依据（可空） | 原 execution 的句柄 | 同 invoke；另有 changed（原修订已变化，或提交时发现旧挂接仍 active 而没有 takeover 依据）、terminal（原 execution 已终态）、unavailable（原记录或精确采用不可读）；denied 也包括接管时没有 takeover 资格 |
| input.submit | Access、操作身份、原 execution、受理输入（内容、来源依据、优先级）。由原 execution 的耐久视图取得，不要求活体 runtime、advance、grant、槽、resume 或 attach。受理之内先认回原 O。当前 O 没有成功、也没有未定责任时，经可信原输入解析判断同 InputId 是否已有可靠受理：已可靠受理的以 recognize-input 调 Journal.submit，不经 `MessageHandoff.prepare`；未定或缺材料保持 unknown 或 unavailable；权威顺序确认是新输入时，才经 prepare 的 submit 分支取得准入结果，再以 new-input 的 Journal.submit 真实受理 | 命令回执，accepted 表示内容已可靠保存 | terminal（ended 之后的新输入；原已成功 O 的合法认回先于此检查）；denied；unsupported（standalone 绑定收到非空来源依据，写前返回；绑定缺可信迁移或原记录读取能力）；unavailable（含原 H 已 excluded，携封闭诊断）；invalid（输入被消息准入拒收，字段为 value，原因为拒收原因，不保存为消息，原 H 已 rejected 时按 Ki 认回同一结果；原谱系确证伪造或内部关联不一致）；conflict（同一输入身份或同 O 配不同的内容、来源、优先级或谱系；新 B 认回时本次内容与真实原输入不同）；commit-unknown，沿原 O 查询，不换号、不换 H。认回条件见“[输入内容与水位线](#输入内容与水位线)” |
| control | Access、操作身份、原 execution、ExecutionControl 与原因依据；当前资格后先认回原 control operation，再为新的 control operation 扫描 pending | 命令回执，accepted 只表示受理。受理事实、control 事件与原结果在同一原子边界成立 | invalid（调用不属于该 execution；Tool 新 control operation 的畸形、缺少或歧义关联的 command.call 与精确 reason 见“控制接受与迟到引用”）；denied（含 Tool 引用外租户，action 为 control）；terminal（对已终态的 execution 只认回终态，不复活）；conflict；commit-unknown，继续按原 operation 查询，不降为 excluded |
| output.read、output.events | Access、execution、after，以及 limit 或 signal | 事件页或缺口 | invalid（after 不属于该 execution，limit 非正或超过上限）；denied；unavailable |
| output.acknowledge | Access、操作身份、execution、through、读取方的处理依据（可空） | 命令回执 | invalid（through 超出已发出序号）；denied；unavailable；conflict（同一操作配不同 through 或 receipt）；commit-unknown |
| AgentHandle.observe | Access、signal | 状态投影序列 | 序列以 ended 结束，原因是 closed、denied、retired 或 unavailable |
| AgentDirectory.resolve、connect | Access、instance | resolve 返回该实例的 invoker；connect 返回活体句柄或 no-live-route | denied；unavailable。no-live-route 不是错误，也不证明工作结束 |
| AgentInstanceHost.reserve | Access、操作身份、scope、definition | instance 身份，以及宿主为该实例提供的登记句柄 | denied；conflict；unavailable |
| AgentInstanceHost.publish | Access、操作身份、instance、scope、状态 | 登记身份与登记状态 | denied；conflict（同一操作配不同输入）；unavailable |
| AgentInstanceHost.withdraw | Access、操作身份、instance、登记身份 | 登记状态，withdrawing 或 withdrawn | denied；conflict；unavailable。已被取代的登记返回 withdrawn，不影响后继 |
| AgentRegistrationHandle.withdraw | Access、操作身份、原因依据 | 本实例当前登记的状态，本实例当前没有登记时为 null | denied；conflict；unavailable |
| AgentRegistrationHandle.report | 当前 AgentState | 无 | 不返回错误。宿主不可用时活体观察以 unavailable 结束，不影响执行 |
| AgentExecutionRecovery.query | 指向被查询原操作的 ExecutionMutation | committed（带原 CommandReceipt）、rejected（带原固定的 conflict、审计依据与 revision，只来自 recordControl）、excluded（带排除依据）或 unknown，见“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)” | denied；unavailable。查询失败保持未知 |
| AgentExecutionRecovery.load | Access、execution | ExecutionSnapshot，含 finishObligations、settlement 与 handoffs | denied；unavailable（投影未覆盖原子快照的事实范围，或不能完成同一修订的一致读取） |
| AgentExecutionRecovery.reconcile | ExecutionMutation | 剩余责任与依据。remaining 只列 ConsumptionId，不列出全部卡片责任 | denied；unavailable；conflict |
| AgentExecutionRecovery.detach | ExecutionMutation、挂接资格、原因依据 | 交接依据 | denied（含失去业务资格后的新 detach）；changed；stale-advance（新 detach 的挂接已 superseded）；terminal（ended 之后的新 detach）；commit-unknown。挂接已 detached 时只认回原交接依据 |
| AgentJournal.open、attach | open：ExecutionMutation 与两部分输入，即 original（原 invoke 的 OriginalInputAcceptance，含原 InputEntry 及其初始 checkpoint 与原 H 引用）与 runtime（本次 InvokeRuntimeContext，含 instance、scope、definition 与 grant）。instance、推进资格依据与初始 checkpoint 只从这两部分取得，不另列一份。attach：ExecutionMutation、instance、推进资格依据、恢复依据与 takeover 依据（可空） | 命令回执与新授予的 Authority | 同 invoke 与 resume，但 busy 在 runtime 预约槽时已返回；denied 也包括推进资格依据缺失或核对失败，以及 coordinated 绑定要求 grant 而收到空 grant；unsupported 也包括 standalone 绑定收到非空 grant 或来源依据（写前返回）；attach 对已 ended 的 execution 返回 terminal；attach 核对 execution 首次建立时固定的协调关联，不允许经另一个绑定降级 |
| AgentJournal.commit | 条件提交的全部内容，含调用方交接与 `handoff`（prepare、resolve、retire 或 null） | 命令回执。没有任何新事实时不推进 revision，回执的 revision 是提交时的当前 revision，不发事件，见“[执行修订](#执行修订)” | changed（含 Ja 的 expected 或历史前提失效）；commit-unknown；conflict；terminal（ended 之后的新 commit，含 Ja）；unavailable（含：核验不可用或暂时的依赖故障；提交参加者当前不能完成自己的部分，任何一方的事实都没有保存，可用同一操作重试，见“[提交参加者协议](#提交参加者协议)”）；unsupported（含缺历史组合或参加者，写前返回）；stale-advance（旧挂接，先于 terminal 与 changed）；invalid（`events` 含 `entry` 或 `ended` 事件体。类型已排除它们，调用方绕过类型时得到这个结果，field 为 `events`，reason 是诊断文本，写明是哪一种事件体由 Journal 分配，不作为契约；`handoff` 的 request、outcome 与 CallerCommit 对不上，或 retire 不满足 currentHandoff 等于 H 与可信 excluded）。次序见“[判定次序与失败映射](#判定次序与失败映射)” |
| AgentJournal.recordHandoff | ExecutionMutation、`original`（lookup 的 recorded 或 excluded）；后继另带 custody（protocol、custodyRoot、rootRequest、factSource、predecessor、priorExcluded） | 命令回执，revision 为本次成功版本 | denied；unavailable（来源、资格核验、原责任或记录暂不可读；成功与排除记录矛盾）；conflict（同 operation 异语义；根已有不同 factBinding）；invalid（缺 tenant 或不可解析的字段，field 指向该字段；field 为 operation，reason 为 operation-permanently-excluded 的永久排除；链循环、截断、跳过前驱或派生不符，field 为 operation；确定伪造的 source 或 original 字段）；terminal（原责任不属合法 ended 覆盖）；unsupported（缺必要组合能力，写前返回）；commit-unknown，查原 attempt，不另造后继。次序见“[准入结果保管](#准入结果保管)” |
| AgentJournal.recordResult | 结果、消费、交接、释放 | 命令回执 | conflict（结果项、版本、位置与交接不一致）；denied（当前保管或处理资格失效，不因旧挂接失效返回 stale-advance）；unavailable。合法责任可在 ended 后登记 |
| AgentJournal.recordControl | 目标控制、阶段、来源依据，可选 toolOperation；先核当前资格与附件租户，再认回原 recording operation，之后核新 target、引用与阶段，见“Recording operation 与阶段事实” | 命令回执。新适用阶段事实、control 事件与原结果在同一原子边界成立；ended 之后只保存三种合法迟到阶段，不追加事件 | conflict（原 recording operation 异输入；所供附件的 call、admission 不等于原调用；已有 toolOperation 与所供附件为不同操作身份；新证据与已成立阶段或原终结前提矛盾，此时按“[查询的四种结论与持久拒绝](#查询的四种结论与持久拒绝)”保存审计并推进 revision）；denied（含所供或保留引用外租户）；terminal（阶段适用，但在 ended 之后新建立意图、撤销资格或其他终态前效力）；invalid（target 不存在、阶段不适用、新 recording operation 的畸形附件或非 Tool 附件，精确 field/reason 见引用边界失败表）；unavailable（原 toolInvocation 或已有 toolOperation 损坏，owner 为 AgentJournal，diagnostic 分别为 invalid-retained-tool-invocation、invalid-retained-tool-operation）；commit-unknown（含审计提交未定，保留原 operation） |
| AgentJournal.prepareFinish | ExecutionMutation、终结授权、expected、candidate | 命令回执与清单依据 obligations，同提交保存清单与 `intent.obligations` 并推进一个 revision | stale-advance（推进授权所属的挂接已 superseded，先于 terminal 与 changed）；denied；unavailable（当前资格、来源或完整闭包不可确定）；changed（expected 或实质前提失效）；conflict（同一操作配不同的 authorization、expected 或 candidate）；invalid（形状错误）；terminal（ended 之后的新请求）；commit-unknown。见“[终结责任清单](#终结责任清单)” |
| AgentJournal.tryFinish | 推进授权或取消授权、expected、完成意图 `intent`（含 candidate 与已发行的 obligations，只用于与当前 FinishIntent 投影的相等核对，不写入任何字段） | ended、changed 或 blocked（类别为 inputs、controls、operations、passages 或 custody；取消路线上判断记录确定缺失为 passages），见“[条件终结](#条件终结)” | stale-advance；denied；terminal（ended 之后的新请求；原成功的同输入重试先认回）；invalid（obligations 未发行、伪造或指向另一个 candidate）；conflict（candidate 同身份配不同业务内容）；unavailable（含：原操作未知或必要来源不可用；取消路线上当前判断记录为 unknown；核验不可用或暂时的依赖故障；提交参加者当前不能完成自己的部分，任何一方的事实都没有保存，可用同一操作重试）；unsupported（参加者或提供者不能兑现这次共同提交，不保存任何一半）；commit-unknown。参加者的响应见“[提交参加者协议](#提交参加者协议)”。依赖故障与查询未知不伪装成 blocked |
| AgentJournal.commitSettlement | ExecutionMutation 与变体输入；候选、迁移与判断变体另带 expected 与取消授权 | 该变体的完整成功结果，见“[commitSettlement 的变体](#commitsettlement-的变体)” | denied；unavailable；conflict；changed；invalid（含 field 为 intent 或 operation）；terminal（新的候选、迁移或判断请求遇 ended）；commit-unknown。次序见同节的判定顺序 |
| AgentJournal.recordTerminalObservation | 终态、PassageId、采用、观察依据 | 命令回执 | conflict（同一观察配不同值）；invalid（观察项不存在，field 为 passage；终态不匹配或尚不存在，field 为 terminal；采用不匹配，field 为 implementation）；denied；unavailable（读取失败或投影不全，不推成观察项不存在） |
| AgentJournal.inputs、readReplyAdmissions | Access、execution、水位线或固定范围、游标、页限 | 有序的输入批，或有序去重的事实页 | unavailable；缺页返回缺口，不把空页当作完成 |
| AgentRuntimeControl.quiesce | Access、操作身份、原因依据 | drained 或 unresolved，附剩余 execution 与依据 | denied；conflict；unavailable |
| AgentJournalEntries.record | ExecutionMutation、Authority（`received` 为 null）、接收面条目 | 命令回执 | stale-advance（挂接已被取代或推进资格已撤销）；terminal（ended 之后写 `start-fence`）；invalid（推进者条目缺 Authority，field 为 authority）；conflict（同一操作配不同条目，或同一交付键配不同内容）；denied（跨租户，含调用引用的租户与 Access 不同）；unavailable；commit-unknown。见“[日志条目](#日志条目)” |
| AgentReceivedCommits.commit | ExecutionMutation、不含 material 的 ReceivedEntry 草稿、完整 Material；不带 Authority | committed，含原 receipt、完整 entry 与 saved；或 excluded，含原排除依据 | invalid（实际无效字段）；denied；conflict（operation 异语义或 delivery 异绑定、材料、账目）；unavailable（确定中途失败不新增任一半、不推进 revision，或既有材料不可读）；unsupported（缺能力或旧 saved 无依据，不表示未提交）；commit-unknown，先按原 operation query。精确映射见“[接收共同提交](#接收共同提交)” |
| AgentReceivedCommits.query | 指向被查询原操作的 ExecutionMutation | committed，含原 value；excluded，含原依据；或 unknown | invalid（实际无效查询字段）；denied；unavailable（权威状态或原材料不可读）；unsupported（旧非接收操作或富结果依据不足，不表示未提交）。查询失败保持未知，不产生排除依据 |
| AgentAccountOutlet.deliver | Access、账目交接元组 | received | denied、conflict、invalid：不重试，保留待办并报告诊断；unknown 与 unavailable：以同一交接重试。见“[账目出站](#账目出站)” |

授权列中的“主体资格”都由 AgentAccessCheck 在实际执行处核验，括号内是传入的操作名。Journal 端口的操作在已核验的公开操作之内由 Agent 调用，授权列只写它另外核对的资格。

| 操作 | 授权 | 幂等身份 | 并发与竞争 | 事件 | 生命周期 |
| --- | --- | --- | --- | --- | --- |
| invoke | 租户与 runtime 绑定一致；主体资格（invoke），目标是该实例；推进资格依据由 Journal 提供者核对 | 操作身份加 execution 身份，同输入认回原结果 | 单执行槽；并发的新 invoke 返回 busy | 无。受理不追加事件。execution 的第一个事件由 open 之后首次产生事件的提交分配，不固定为某一种事件 | 创建 execution，runtime 由 idle 进入 occupied |
| resume | 主体资格（resume），目标是原 execution；快照显示旧挂接仍 active 时另核主体资格（takeover），目标同上；推进资格依据 | 操作身份 | 单执行槽；attach 按“恢复与接管”选择路径 | 新事件带新挂接身份 | 恢复：execution 由 suspended 回到 reconciling，新挂接 active，旧挂接保持 detached。接管：execution 由 reconciling、advancing、waiting 或 settling 回到 reconciling，新挂接 active，旧挂接 superseded |
| input.submit | 主体资格（submit），目标是原 execution 的逻辑目标，不要求持有挂接、活体 runtime、advance、grant 或槽；长期输入适配器直接调用时在实际入口以同一操作名核验 | 操作身份加输入身份；同 O 同完整语义输入认回原结果 | 与 tryFinish、control、attach 同一排序，先成立者决定结果；同 Ki 或 H 的准入在提供者的同一耐久排序先认回或冲突 | 无。可靠受理不表示输入已被取用。input-taken 只由 I0 固定输入批的那次提交追加；活体只在提交后收到唤醒提示 | execution 已终态时返回 terminal。suspended、detached、quiesced、disposed 与 no-live-route 都不使 submit 能力消失，合法 submit 不自动 resume |
| control | 主体资格（control），目标是原 execution；扩展发起的控制标明真实来源，不伪造人的决定 | 操作身份 | 与 tryFinish 同一排序；控制通道独立于输入队列，不被长 I/O 饿死 | 受理事实一个 control 事件，与原结果在同一原子边界成立；同操作同输入认回不重复分配 | 见“取消、退出与结构变更”的四种控制、插队与六个阶段 |
| output.read、output.events | 主体资格（read 或 events），目标是原 execution；读取资格不等于推进资格 | 只读 | 多个读取方互不影响；慢读取方不阻塞推进 | 无 | 保留期内终态后仍可读 |
| output.acknowledge | 主体资格（acknowledge），目标是原 execution | 操作身份加 through | 单调，不回退 | 无 | 只清理满足保留政策且责任已交清的事件 |
| AgentHandle.observe | 主体资格（observe），目标是该实例 | 只读 | 每个订阅的缓冲受字节上界约束，超出时该订阅结束 | 无 | 登记撤除或拒绝时以 ended 结束 |
| resolve、connect | 目录核验主体资格（resolve 或 connect），目标是该实例；租户一致 | 只读 | 无 | 无 | 只对 published 登记有效 |
| reserve、publish、withdraw | 宿主核验主体资格（reserve、publish 或 withdraw），reserve 的目标是 scope 与 definition，其余的目标是该实例；租户与实例的租户一致 | 操作身份 | 同一实例的目录条目指向最新登记，被取代的登记转入 withdrawn | 无 | 登记 published、withdrawing、withdrawn；执行结束不改变登记 |
| 登记句柄的 withdraw 与 report | withdraw 由宿主核验主体资格（withdraw），目标是本实例；report 只接受本实例的状态，不核验主体 | withdraw 带操作身份；report 只更新投影 | 只作用于本实例当前的登记 | 无 | report 不改变登记；withdraw 使登记进入 withdrawing 或 withdrawn |
| query、load、reconcile | 主体资格（query、load 或 reconcile），目标是原 execution；不要求旧挂接有效 | query 与 load 只读，不写认回；reconcile 带操作身份 | reconcile 不发起新工作；load 返回同一修订的完整视图或 unavailable | 无 | execution ended 之后仍可调用。读取不推进 revision |
| detach | 主体资格（detach），目标是原 execution；另核当前挂接是 active，或认回既有交接；经恢复入口且目标挂接属于仍存活的其他 runtime 时，另核主体资格（takeover） | 操作身份。已 detached 的目标认回原交接依据 | 与 attach 同一排序 | 无 | 挂接由 active 进入 detached，分配新修订；runtime 交清责任后回 idle。superseded 的挂接返回 stale-advance，失去业务资格返回 denied，ended 返回 terminal |
| Journal.open、attach | 在 invoke 或 resume 之内调用；另核推进资格依据，租户与 runtime 绑定一致；接管路径另核 takeover 依据；coordinated 绑定在同一次提交中核对外部资格、关联与接管条件 | 操作身份。原 operation 恢复原回执与 Authority，不让旧 Authority 重新有效 | 单执行槽预约；条件核对修订号与围栏；写前核对绑定模式 | 无 | 授予新挂接 active。open 建立初始修订；attach 的每个真正的新挂接分配新修订。恢复路径不改变旧的 detached 挂接，接管路径在同一提交中使旧挂接 superseded |
| Journal.commit | 在已核验的操作之内调用；另核当前挂接的资格与 expected 修订号 | 操作身份，同语义输入返回原结果；不新增跨 operation 的等值去重 | 条件提交；changed 后重读 | 提交内的事件获得连续序号 | 不能写 ended；ended 之后的新 commit 返回 terminal |
| Journal.recordResult、recordControl | 在已核验的操作或 reconcile 之内调用；另核当前合法保管方或处理方，不要求旧挂接有效 | 操作身份；同控制、阶段、状态与来源的既有事实认回，unresolved 到 reached 是新事实 | 与 commit 同一排序；recordControl 与 tryFinish 共用权威排序，ended 不越过尚未成立的对应事件 | recordResult 无事件，producer 事件由后继有资格的条件提交承担；recordControl 的每个新适用阶段事实一个 control 事件，与原结果原子保存，ended 之后不追加 | execution ended 之后仍可调用：recordResult 登记合法责任，recordControl 只保存 producer-confirmed、physically-stopped 与 duty-released 三种真实迟到事实；矛盾证据返回 conflict 并保存审计 |
| Journal.prepareFinish | 在已核验的操作之内调用；另核终结授权与 expected 修订号 | 操作身份，同输入认回原清单 | 与 commit 同一排序 | 无，不改 checkpoint | 发行清单与 `intent.obligations`，分配新修订；ended 之后的新请求返回 terminal |
| Journal.tryFinish | 在已核验的操作之内调用；另核推进授权或取消授权、candidate 与已发行的 obligations | 操作身份 | 与 submit、control、attach、recordControl 同一排序 | 与终态共同提交 ended 事件 | execution 进入 ended，runtime 随后回 idle；之后的新请求返回 terminal |
| Journal.commitSettlement | 候选、迁移与判断变体以主体资格（settle，迁移另加 migrate-cancellation）核验，另核取消授权与 expected；保管变体以主体资格（reconcile）核验，不要求旧推进权。长期执行记录适配器直接调用时在实际执行处核验；runtime 在已核验的公开操作之内调用时按“[主体资格核验](#主体资格核验)”不再次核验 | 操作身份；迁移记录与关联登记操作按稳定派生，同输入认回原结果 | 与 tryFinish 同一权威序列 | 无事件，不改 checkpoint | 每个成功的新记录分配新修订；保管变体在 ended 之后仍可调用 |
| Journal.recordHandoff | 主体资格（record-message-handoff），目标是原 execution；另核当前保管资格与可信提供者绑定，不要求旧挂接、旧 advance 或原实例存活 | 操作身份按根与后继稳定派生，同 operation 同完整输入认回原结果；当前 Access 与真实调用归因不进入语义比较 | 与 Ja、attach、control、tryFinish 同一权威序列；根与同一事实最多一个成功 attempt，同输入并发只一个成功，其他者取同一原结果 | 无事件，不改 checkpoint、终态或候选 | 每次合入新事实分配新修订，同输入重放零新修订；ended 之后仍可调用，只处理最终清单已覆盖的责任 |
| Journal.recordTerminalObservation | 长期协调者以主体资格（record-terminal-observation）核验，目标是原 execution；另核观察与记录资格，不要求旧挂接有效 | 操作身份，重复同值认回 | 与 commit 同一排序 | 无，不追加事件 | 只为既有待观察项登记 |
| Journal.inputs | 在已核验的操作之内调用；另核当前挂接的资格 | 只读，同一水位线返回同一批 | 与 submit 同一排序，只返回水位线以内已受理的输入 | 无 | 返回受理时保存的内容，不读取调用方另存的副本 |
| Journal.readReplyAdmissions | 在已核验的操作或 load 之内调用；另核读取资格 | 只读，after 与 next 只在同一 execution、同一范围内有效 | 不阻塞推进 | 无 | 范围内缺页返回缺口，不把空页当作完成 |
| AgentRuntimeControl.quiesce | 主体资格（quiesce），目标是该实例；只交给宿主，不交给执行的调用方 | 操作身份 | 已在停用的 runtime 认回进行中的交接 | 无 | runtime 进入 draining，交清后撤登记并 disposed |
| AgentJournalEntries.record | 推进者在已核验的操作之内调用，另核当前挂接。结果接收方在 push 的决定顺序里核验推送主体的当前接收资格，再写 `received`，另核保管资格，不要求挂接。结果接收方以主体资格（receive-result）在写入之前核验，目标是冻结 consumer 对应的 execution | 操作身份；`received` 的操作身份由交付键确定派生 | 与 commit 同一排序 | 条目在同一次提交里投影为一个 `entry` 事件；ended 之后写入的条目不追加事件 | `received` 在 ended 之后仍可写入 |
| AgentReceivedCommits.commit | push 内先核主体资格（receive-result），另核租户与冻结消费绑定、保管资格；当前资格先于缓存认回，不要求挂接 | operation 与原 delivery；完整输入相同认回整项原 value，重复 operation 不改原 receipt 身份 | 与 Journal、entries、materials 同一权威提交序列；材料与条目一次发布，同 delivery 并发只提交一次 | 条目在同一次提交里投影为一个 `entry` 事件；ended 之后不追加事件，没有通知 | ended 后仍可保管，不恢复推进；已 excluded 的原 operation 不复活 |
| AgentReceivedCommits.query | 当前主体资格（query）、租户、原 execution 的访问与保管资格；先核资格再返回原状态 | 按原 operation 只读；重复 operation 同样认回原 value | 只投影同一权威状态，不创建围栏或第二份日志 | 无 | ended 后仍可查询；unknown 与失败均保留原责任 |
| AgentAccountOutlet.deliver | 结果接收方在 `received` 条目提交之后调用；Context 一侧核对租户与来源 | 租户、调用、dispatch 与修订 | 不阻塞推进；与 saved 互不等待 | 无 | 恢复时从 `received` 条目重放 |
| agentExecutionControl 的 control | 同 control；由宿主的长期执行记录适配器在实际执行处核验 | 同 control | 同 control | 同 control | 形状同 `AgentExecutionControl`，实现归 #502 |

两项 `AgentReceivedCommits` 操作的提供者换代、失效与恢复责任见“[接收共同提交](#接收共同提交)”的生命周期条款。替换运行对象不改变原 operation 或 delivery，不能解除未知或重新授权原业务。

下面的接缝由各自的专题补全逐操作的要素，这里只保留不变的约束，并写明要素的所在位置。

| 接缝 | 参数与成功 | 失败、未知及换代责任 |
| --- | --- | --- |
| evaluator.initial、next、codec | 完整值及精确采用，原位置或下一步 | 缺项拒绝，无效果和隐式读取 |
| selection、modelContext、requests、conditions | 逐操作的要素见“请求接缝的逐操作要素” | 缺源与不能装下分别报告，当前条件变化重算尚未记录为最终请求的候选。只投影推进要求，不复制权限模式 |
| extensions、cards、admission、handoff、reads、materials | 原扩展调用、采用、卡片、准入、来源、内容与消费位置 | 已成立效果不重做，绑定未知不清理，不用最新替原版本 |
| models、tools | 注入领域公开能力 | 发出点核当前资格；换 DI 对象不代业务接管 |
| adoptions | 逐操作的要素见[定义专题](docs/public-api/definition.md#采用解析与交接) | 只解析精确采用，不取最新版本 |
| clock | 当前 UTC 时刻读取与等待能力 | 时钟不决定终态；取时失败为 unavailable，owner 为 agentClock |

输入按四类分责：构造身份绑定、可序列化配置、单次操作参数、注入依赖。分类与逐项规则见[对象模型](docs/object-model.md#值参数与依赖)和[通用工厂](../agent/docs/public-api.md)。接口、状态与完整 OOP 映射见[对象模型](docs/object-model.md)。工厂依赖不入日志。运行对象、锁和队列不成为跨域数据契约。可选遥测不成为业务成功前提。

### 验证边界

完整调用链见[消费与系统定位](docs/context.md)，正常与失败场景见[持续验证场景](verification/scenarios.md)。类型样例只证明所列公开形状可连接，纯状态模型只覆盖所建交错。实际 Storage、同提交授权、生产者动作围栏、断电保管、真实 HITL 和跨进程必须由后继提供者取证。Agent 保管 Tool 内容 ref 与附件地址文本，不加载二进制，也不把地址文本自动转成媒体。需要附件时另起合法读取，依新的结果声明决定后续模型感知。请求组装者把 ToolDefinition 投影为 Model 工具声明，说明已包含 programmable 含义，并保管原工具及命令路由。Model adapter 只转换该声明为供应商 payload；Agent 不预生成供应商字段或以 JsonValue 扩充块语法。MODEL-E01 的共享契约迁移仍待实现与验证。
