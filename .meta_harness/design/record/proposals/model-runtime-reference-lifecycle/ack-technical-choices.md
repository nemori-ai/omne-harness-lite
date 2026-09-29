# ACK：模型专属确认与副本释放的施工选择

2026-09-29，revision 2，candidate，未接受。本页接续PF013 rev17（产品独立评审Pass，主线待采用）、[差分性质](ack-domain-reading.md)及[机制读数](ack-mechanism-reading.md)。只改变模型副本生命周期；不新增通用内容/GC服务，不完成Session/Run，不保留无GC永久模式。

## 操作和粒度

新增 `acknowledgeCall({ref:CallKey, expectedResult:AckTarget})`，其中 AckTarget 为 `{kind:'response',response:ResponseId}` 或 `{kind:'ended',ending:'undispatched'|'released'|'interrupted'}`。后者指该CallKey唯一有效的调用终结记录；若存在该调用的终结响应，必须用response目标，不能用较早failed响应确认后来的结果。输入两分支禁止混合字段；expectedResult不同不是重复成功。

1. 先表示校验；再通过现callAccess新增action=ack核当前同租户、归属与承接责任；再存在性/来源当前性；再目标及整调用终态。只读/wait/持有ref不授清理权。
2. 整调用仅complete/handed_up/interrupted可确认；open/dispatching/awaiting_decision/resumable均wrongPhase，不能用ACK取消或替retry策略放弃。失败等待决定者可先用现有releaseCall形成真实终态，再确认。未真实收场的故障不能冒可回收。
3. ACK与replyDisposition独立。完整ready已构成终态但disposition_pending时，确认只交接副本保管责任，不写consumed/vetoed/persisted final，不生成AssistantMessage；已有final保持原值，无回复终结不造回复。ACK记录保存原ready的最小账见证和完整原值语义摘要，删除模型副本以后仍可核验消费方自行保管的原值；真实处分与账选择见下节。
4. ACK以该CallKey+原终结目标为天然幂等键；首次确认和重复确认均核当前资格。重复同目标返回原确认及当前释放进度；输入表示合法但与真正终结事实不符返回wrongPhase，非法表示才invalidInput。确认成功后所有新执行/重试入口拒绝已确认调用，不重新取得provider；真实后继处分只能走下述原值回送路径。旧ref不变。
5. 成功返回 `{acknowledged:{ref,target,acknowledgedAt,cleanup:'pending'|'released',pendingReasons?}}`；pendingReasons仅闭合的writer_in_flight/read_in_flight/receipt_unknown/storage_unavailable/external_retention，非正文/密钥。ACK回执不可判则unavailable，不返回acknowledged。返回pending时清理责任已由runtime耐久接管，不要求消费方保持在线或再次ACK。后继acquire/readAttempts/reconcile及同keyopen认回可读同一确认/清理状态。

ACK后完整结果不再由model service重新交付。CallReadView增加明确acknowledged分支，保留ref、原origin、原三个终态、来源进度、确认及清理状态、最小真实费用/结果身份；不带created输入、reply/delivered/raw、inputCalibration或完整profile副本。readAttempts在该分支返回原各次发出的身份/状态/已知usage/cost及未知原值，不返回完整结果正文。独立授权的原Session日志读取不是模型副本重新领取，现有不可变记录及其权限保持。

## 唯一新日志事实与规范边界

MS后继新增 `model_call_acknowledged` 技术记录（不是Message/OutboundMessage）：call、creationKey、原显式输入等价摘要、target、原terminalState、acknowledgedAt、未final结果的最小原账见证和语义摘要，以及允许释放的精确ModelCallPayloadRef清单。ACK条目壳保留created原tenant/session/run/attempt，账见证保留终结ready的原账壳；二者attempt可以因合法续接不同，分别核对原来源，共同tenant/session/run与CallKey一致。该记录按CallKey使用稳定ACK判重键和读键；ACK使用独立稳定键，不与尚未确定的处分拼成一批。它证明消费方已确认，不单凭记录存在宣称物理删除完毕。

清理进度由同存储保留控制行及实际删除结果提供，不另立第二个模型执行事实源。原created/ready marker在ACK前要求payload持续可读；合法ACK之后可以明确指向“模型侧已释放”的历史payload，不作corruption/notFound。final ModelResponse/原AssistantMessage及费用补记保持原日志字节，不删除或替换。CA后继按原ResponseId从final、合法ACK中的原账见证、ready选择恰一份（按此顺序），ACK见证逐值保持原usage/cost及原归属，不增加费用、不把unknown补零。只有ready载荷确已验证且见证与其原值一致才能发布ACK；来源矛盾是损坏，不能借优先级掩盖。

冻结RT11/MS7/MR10/CA3不原改；RT12与MS8负责操作/记录/视图及保留例外，CA4补原账见证的唯一来源选择，MR11修改S46的marker内容保留例外但保持完整ready/final值结构与真实处分语义。SL3泛payload追加语义不变。精确规范依赖按实际Schema引用判闭包，不为“最新”强升无变化消费者，不提供旧执行入口。

## 自行保存后的真实处分与原账承接

ACK不是最终处分。若确认时仍pending，原ready的ResponseId、call/dispatch及原承载tenant/session/run/attempt、原outcome、原Usage和Cost精确值、原credentialScope、provider及已知upstreamRequestId保存在ACK见证中；不保存reply、delivered、raw、inputCalibration或完整route/profile。原账有独立来源后不以pending处分阻挡大副本释放。CA4只扩大原账来源选择，不复制有效费用计算或另建账身份。

消费方在确认前取得并自行保存的完整PendingModelResponse，可以在确认后交回settleReply的retainedResult可选入参；ACK后尚无final时该参数必需，表示合法但缺少该参数返回wrongPhase，来源/内容不匹配返回invalidInput/malformed。先重新核当前settle资格，再核完整原值的表示、原ResponseId及ACK保存的语义摘要，最后沿原S49/S69/S70形成真实vetoed/consumed处分；不修改consumed.by现有域。ACK前禁止retainedResult替换runtime已持的权威原值；两份出现则必须相等，不允许caller覆盖。

合法persisted写方同样从调用方自行保存的原PendingModelResponse出发，经独立当前消息写入/处分资格、原回复/合法派生关系核验及ACK摘要验证，取得原子结算协调器的窄锚定权；仍只由它把AssistantMessage与唯一ModelResponse同批提交。公开ACK/ref/read权限不取得这个权。不能在ordinary settleReply里加入persisted分支。缺失调用者自持原值时不能从摘要合成全文，也不把无法继续业务处理变成模型重新保管义务。

完整原值摘要按下述lossless语义算法取得，角色固定为model-call-retained-result-semantic-sha256/v1，哈希输入额外含该角色标签；它覆盖完整原PendingModelResponse，包括校准事实、route、reply等，并非只核显示文本。后继final只允许加入真实replyDisposition/late及原规范已允许的消息派生关系，不能借ACK重写原事实。原原子批未知则照旧保持原批认回；ACK不令其重构或重新消费。原payload UTF-8字节摘要继续只证明原存储字节，不把consumer重序列化结果当作同一字节；本语义摘要在ACK前对权威原值明确取得。

ACK可先于、后于或交错于原合法final。每方分别认回自己的完整原批：final冲突沿原先到合法处分规则，ACK冲突仅认回相同CallKey和终结目标的原ACK。ACK记录的账见证是原ready事实，不宣称提交时仍无final；即使final已胜出仍逐值等价且只选一次。后继读视图从当前日志给出实际pending/final状态，不能把ACK时观察到的pending永久钉住。无消费者后来处分仍不阻挡释放；自行保存丢失的后果由消费方承担，不假造处分。

## 创建判重在输入删除后仍成立

删除原created输入后，不能把重复creationKey永远报creationConflict，也不能忽略不同输入。确认记录保存原 `ModelCallCreationInput` 全值的版本化语义摘要，包含原显式basis/sourceVersions，不包含后来重选的新依据；摘要在原完整值仍可读取且来源已核实的阶段取得。

规范算法角色名 `model-call-creation-semantic-sha256/v1` 与 `model-call-retained-result-semantic-sha256/v1` 使用同一无损语义编码函数，角色分别防止创建值与响应值互换。对经现有严格无损JSON接收的值V定义T(V)：null→["z"]，boolean→["b",0或1]，string→["s",该字符串的UTF-16代码单元整数数组]，array→["a",逐项T组成的数组]，object→["o",逐项[键的T,值的T]组成的数组]。对象项按键的UTF-16代码单元序列无符号字典序升序，前缀短者在先；数组原序与重复保持，不做Unicode归一。代码单元编码只确定已有合法字符串的精确表示，不扩大接收边界允许的字符串域。

精确JSON数字→["d",S,C,E]：S为ASCII字符串"+"或"-"，C为系数十进制数字字符串，E为指数十进制字符串。将原数字的整数/小数数字合并、去系数前导零；若全零统一S="+",C="0",E="0"。非零时去系数尾随零，指数为原显式指数（缺席0）减小数位数加去掉的尾随零数，精确整数运算；E不带加号/前导零，零为"0"。C非零首尾均非0。不得展开巨大指数或经binary64，不能把2^53相邻整数归为相等。

最终哈希字节为紧凑ASCII JSON数组 `[角色字符串,T(V)]`：无空白，语法字符为标准ASCII，固定标签/角色只含ASCII字母数字与连字符斜线，C/E/S为上述字符，代码单元整数为无前导零十进制，其余文本已转整数数组，因此不留字符串转义选项。对该字节流计算SHA-256，小写64hex。实现可流式编码/哈希，不要求构造巨大类型树或展开指数。示例：1与1.0均T=["d","+","1","0"]；-0与0均["d","+","0","0"]；0.0100→["d","+","1","-2"]；字符串a→["s",[97]]；空对象["o",[]]与空数组["a",[]]不同。后继给完整角色哈希正反向量，覆盖对象换序、数组换序、缺席/null、sourceVersions变化、转义等价/Unicode不归一、超2^53邻值及巨大指数。

同key在ACK后重入，先当前创建资格，再用同算法比较输入：相等返回原ref和acknowledged摘要分支，不重选档案、不重新打开；不同creationConflict不泄露内容。该摘要采用与现payload SHA-256相同的密码学碰撞安全假设，不宣称有限TLA证明密码学注入。摘要不能授权读取或清理。

## 共同存储对象与删除协议

沿现Storage.write事务扩展runtime私有 `ModelCallRetention(tenant,session,callId)`，含sourceGeneration、phase（retained/retiring/acknowledged/released）、原ACK批认回定位、允许释放的精确locator/version/digest、原输入语义摘要、原origin/target与最小来源。内容行显式带所属CallKey；只对本调用自己创建的行作删除，不按Session前缀扫删。必要的实际读/写占用也归这个控制对象和精确owner代际，不以任意caller计数取代真实性。

- 读取：在同一控制门取实际读取许可，核该行仍retained；真实复制/摘要校验完成或明确失败即解除。不得把用户持句柄、wait或后续业务处理时间算作读占用。确认前已进入者可把完整owned副本交给原消费者，绝不能半读半删；确认后新取读返回acknowledged视图。
- 发布：所有created/ready/final写者在取得内容/发布资格时绑定该控制行及精确generation。retiring关闭依赖模型副本的新发布准入；既有已取得许可的writer保有原完整批并必须实际停止/认回。ACK后合法后继处分使用消费方回送的自持值及确认摘要，不重新打开被释放的内容行；其原final提交资格和未知批责任独立保持。ACK不能仅先查门然后假定此前writer不会晚到。
- 确认准备：核资格/目标和原结果，事务把retained→retiring，固定唯一原确认任务，阻止新读写；同key竞争加入/认回同一任务，不另建批。确认owner只构造ACK原批，其账见证与语义摘要来自已核实原ready，不重新执行外部消费，也不替处分。原writer的final和ACK使用不同判重键；晚到final先赢时原处分保持，不能把没有ACK的final批当成ACK确认。
- unknown：保留原完整批、内容与真实任务；confirmed之前不能删。确证全部原可能writer已停止后按同源完整日志读回；有原批认回，无原批才允许同原批重送；资格已失而确证未提交可撤回准备，不把unknown当无提交。
- 删除：ACK批已确认，实际旧读者/原writer均已收束且不存在仍必需的模型自有引用时，在**同一个Storage事务**核retention phase/代际/确认定位，删除其可释放内容行并更新released小状态。事务失败不报released；成功回执未知先从该同存储对象认回。日志追加与SQL删除从不被称为同一事务。
- 崩溃/重启：retiring与已确认清理责任耐久保存；既有唯一恢复owner先认回日志/原任务再继续。取消信号、计时过期、host离开或attempt fence不等于旧unfenced写方实际停止。环境可用且实际在途工作最终收束时清理必须完成，不等消失的消费者再确认。新的服务不能只依内存Map空认定可删。

授权的ACK事实与执行原事实由同一本日志裁决；内容准入/删除由上述同一SQL控制行裁决。二者通过“先关闭准入→日志确认→旧责任排空→SQL删除”承接，既不虚构跨库事务，也不把引用仍可发布时的删除交错排除为环境假设。

## 外部内容与最小永久信息

模型侧自己持有的额外AttachmentRef/raw.body保留责任仅在实际provider已提供配对释放且不会删除日志/消费者仍依赖内容时解除；ACK不赋予删除其它owner对象的权力。仅提供inline路径的当前实现不因未来CB全集需要通用内容平台。已启用但不能确认解除的真实外引用明确cleanup_pending/external_retention并留owner；不假称全部释放、不以不存在的provider把所有inline路径永远阻塞。

最小永久信息仅支撑原身份/创建判重、真实终态与账/确认定位、释放状态和版本不可复用；不复制完整messages/tools/参数大对象/结果/原始body。释放模型副本不删除原不可变日志，其长期归档不属于本次模型GC。未知费用能由原final或ACK最小账见证独立继续时不保留无关大输入；确有必需内容须逐项说明依赖并有可恢复清理责任，不以“也许以后要用”保留全部。

## 替代与迁移清单

- CA3 S18/S19/S22/S40～42的ready/final选择扩成final/ACK原账见证/ready，现有有效费用与补账算法不改；MR10 S46的持续保留增加ACK例外，原完整值结构不改，摘要验证不授予消息写权。
- RT11 S85“marker存续即payload持续保留/无独立回收路径”、S89完整结果读取、S91按键读取、S92既有操作映射、S94保留/回收保证，以及MS7 S55引用存续：由后继加入合法ACK之后的显式释放例外及新读取分支，未ACK全部原保证保持。
- runtime v20私有无GC段、ST2、反证、选择表永久孤儿成本、R20相关无删除验收：改为retention门/ACK确认/事务释放/崩溃认回。旧条目保持历史字节，不可继续作为生产默认。
- openCall同key ACK后返回、acquire/readAttempts/reconcile、settle/retry/interrupt/hostclose与任何writer必须消费同一已确认状态，禁止旁路旧fullpayload查找与按missing伪notFound；不是只新增一个不被其它入口使用的ACK方法。
- core messages新record/类型及原规范资源，runtime/demo调用者和双语README一起迁移；无Session全实现、模型厂商或T26全部重验前置。实际受影响的资源/声明/消费者门必须跑。

## 有限形式与工程反例

TLA最小模型至少有两CallKey、两consumer、一个晚writer、读占用、SQL控制/内容存在、日志ACK/终态与回执未知、crash/recover。安全性质：未确认不删；未排空不删；ACK不改结果/原账；旧ref不notFound；不同调用不受影响；重复ACK恰一次事实；删除后新读不取内容；原writer晚提交不能发布指向已删内容的未确认结果。进展前提只允许真实环境最终可用、旧任务最终结束与公平清理，不预设已经完成清理。

至少提供去掉关闭准入/真实writer排空/确认先行/同事务删除控制更新的预期失败配置；实测覆盖相同交错、read/delete、unknown批晚提交、重启各中间态、两消费者只有一个ACK、idle handle不阻塞、合法大数创建幂等与费用未知。形式模型不证明SHA碰撞安全、实际SQL/JSONL耐久或外部provider释放。全部后继必须独立spec与architecture review，root接受后才实施。
