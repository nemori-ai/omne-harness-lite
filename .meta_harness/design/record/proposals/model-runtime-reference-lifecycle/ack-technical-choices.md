# ACK：模型专属确认与副本释放的施工选择

2026-09-29，revision 1，candidate，未接受。本页接续PF013 rev17（产品独立评审Pass，主线待采用）、[差分性质](ack-domain-reading.md)及[机制读数](ack-mechanism-reading.md)。只改变模型副本生命周期；不新增通用内容/GC服务，不完成Session/Run，不保留无GC永久模式。

## 操作和粒度

新增 `acknowledgeCall({ref:CallKey, expectedResult:AckTarget})`，其中 AckTarget 为 `{kind:'response',response:ResponseId}` 或 `{kind:'ended',ending:'undispatched'|'released'|'interrupted'}`。后者指该CallKey唯一有效的调用终结记录；若存在该调用的终结响应，必须用response目标，不能用较早failed响应确认后来的结果。输入两分支禁止混合字段；expectedResult不同不是重复成功。

1. 先表示校验；再通过现callAccess新增action=ack核当前同租户、归属与承接责任；再存在性/来源当前性；再目标及整调用终态。只读/wait/持有ref不授清理权。
2. 整调用仅complete/handed_up/interrupted可确认；open/dispatching/awaiting_decision/resumable均wrongPhase，不能用ACK取消或替retry策略放弃。失败等待决定者可先用现有releaseCall形成真实终态，再确认。未真实收场的故障不能冒可回收。
3. 若完整ready已构成终态但disposition_pending，消费方ACK是其明确已经处理或自行保管的声明：沿现有nonpersisted `consumed`处分，按原资格/真实late规则，将原final和ACK同SessionLog批提交；不另授persisted消息写权，不生成AssistantMessage，不改原reply/usage/cost。已有final不变，无回复终结也不造回复。
4. ACK以该CallKey+原终结目标为天然幂等键；首次确认和重复确认均核当前资格。重复同目标返回原确认及当前释放进度；不同目标wrongPhase/invalidInput的精确值由后继失败表统一，不自行加厂商分支。ack确认成功后所有新执行/重试/处分入口拒绝已确认调用，不重新取得provider；旧ref不变。
5. 成功返回 `{acknowledged:{ref,target,acknowledgedAt,cleanup:'pending'|'released',pendingReasons?}}`；pendingReasons仅闭合的writer_in_flight/read_in_flight/receipt_unknown/storage_unavailable/external_retention，非正文/密钥。ACK回执不可判则unavailable，不返回acknowledged。返回pending时清理责任已由runtime耐久接管，不要求消费方保持在线或再次ACK。后继acquire/readAttempts/reconcile及同keyopen认回可读同一确认/清理状态。

ACK后完整结果不再由model service重新交付。CallReadView增加明确acknowledged分支，保留ref、原origin、原三个终态、来源进度、确认及清理状态、最小真实费用/结果身份；不带created输入、reply/delivered/raw、inputCalibration或完整profile副本。readAttempts在该分支返回原各次发出的身份/状态/已知usage/cost及未知原值，不返回完整结果正文。独立授权的原Session日志读取不是模型副本重新领取，现有不可变记录及其权限保持。

## 唯一新日志事实与规范边界

MS后继新增 `model_call_acknowledged` 技术记录（不是Message/OutboundMessage）：call、creationKey、原显式输入等价摘要、target、原terminalState、acknowledgedAt以及允许释放的精确ModelCallPayloadRef清单。租户/session/run/attempt仍在原条目壳核对。该记录按CallKey使用稳定ACK判重键和读键；final+ACK需要时同批。它证明消费方已确认，不单凭记录存在宣称物理删除完毕。

清理进度由同存储保留控制行及实际删除结果提供，不另立第二个模型执行事实源。原created/ready marker在ACK前要求payload持续可读；合法ACK之后可以明确指向“模型侧已释放”的历史payload，不作corruption/notFound。final ModelResponse/原AssistantMessage及费用补记保持原日志字节，不删除或替换。CA3按原ResponseId选final胜过ready恰一次；必须先有可独立读的原final账事实/终结事实再释放ready副本，不增加一次费用或把unknown补零。

冻结RT11/MS7不原改；预计RT12与MS8负责操作/记录/视图及保留例外，runtime后继兑现。MR10 final原值、CA3原账选择和SL3泛payload追加足以支撑时保持精确版本。MR10对MS7 AssistantMessage的规范引用若仍可达，按已采用的定义闭包原资源保留，不为“最新”强升无变化消费者，不提供旧执行入口。

## 创建判重在输入删除后仍成立

删除原created输入后，不能把重复creationKey永远报creationConflict，也不能忽略不同输入。确认记录保存原 `ModelCallCreationInput` 全值的版本化语义摘要，包含原显式basis/sourceVersions，不包含后来重选的新依据；摘要在原完整值仍可读取且来源已核实的阶段取得。

候选规范算法 `model-call-creation-semantic-sha256/v1`：先用现有严格无损JSON取得合法值；构造带类型标签的树，null/boolean/string/array/object/number互不混淆。数字按精确十进制规范化为符号、无前导/尾随零的系数和有符号十进制指数（零统一无负号），不展开指数、不经binary64；对象键按其JSON字符串编码的UTF-8字节序排列，数组顺序/重复保持，缺席和null不同。该类型树用明确紧凑JSON编码（字符串保留码点/合法转义，不做Unicode归一），以UTF-8字节SHA-256得到小写64hex。后继规格必须给正反向量，含1/1.0、-0/0、超2^53邻值、对象换序、数组换序、缺席/null、sourceVersions变化与转义边界。

同key在ACK后重入，先当前创建资格，再用同算法比较输入：相等返回原ref和acknowledged摘要分支，不重选档案、不重新打开；不同creationConflict不泄露内容。该摘要采用与现payload SHA-256相同的密码学碰撞安全假设，不宣称有限TLA证明密码学注入。摘要不能授权读取或清理。

## 共同存储对象与删除协议

沿现Storage.write事务扩展runtime私有 `ModelCallRetention(tenant,session,callId)`，含sourceGeneration、phase（retained/retiring/acknowledged/released）、原ACK批认回定位、允许释放的精确locator/version/digest、原输入语义摘要、原origin/target与最小来源。内容行显式带所属CallKey；只对本调用自己创建的行作删除，不按Session前缀扫删。必要的实际读/写占用也归这个控制对象和精确owner代际，不以任意caller计数取代真实性。

- 读取：在同一控制门取实际读取许可，核该行仍retained；真实复制/摘要校验完成或明确失败即解除。不得把用户持句柄、wait或后续业务处理时间算作读占用。确认前已进入者可把完整owned副本交给原消费者，绝不能半读半删；确认后新取读返回acknowledged视图。
- 发布：所有created/ready/final写者在取得内容/发布资格时绑定该控制行及精确generation。retiring关闭新发布准入；既有已取得许可的writer保有原完整批并必须实际停止/认回。ACK不能仅先查门然后假定此前writer不会晚到。
- 确认准备：核资格/目标和原结果，事务把retained→retiring，固定唯一原确认任务，阻止新读写；同key竞争加入/认回同一任务，不另建批。必要final+ACK由该确认owner作为保留的唯一发布者写同一SessionLog批；它使用原payload，绝不重新执行外部消费。
- unknown：保留原完整批、内容与真实任务；confirmed之前不能删。确证全部原可能writer已停止后按同源完整日志读回；有原批认回，无原批才允许同原批重送；资格已失而确证未提交可撤回准备，不把unknown当无提交。
- 删除：ACK批已确认，实际旧读者/原writer均已收束且不存在仍必需的模型自有引用时，在**同一个Storage事务**核retention phase/代际/确认定位，删除其可释放内容行并更新released小状态。事务失败不报released；成功回执未知先从该同存储对象认回。日志追加与SQL删除从不被称为同一事务。
- 崩溃/重启：retiring与已确认清理责任耐久保存；既有唯一恢复owner先认回日志/原任务再继续。取消信号、计时过期、host离开或attempt fence不等于旧unfenced写方实际停止。环境可用且实际在途工作最终收束时清理必须完成，不等消失的消费者再确认。新的服务不能只依内存Map空认定可删。

授权的ACK事实与执行原事实由同一本日志裁决；内容准入/删除由上述同一SQL控制行裁决。二者通过“先关闭准入→日志确认→旧责任排空→SQL删除”承接，既不虚构跨库事务，也不把引用仍可发布时的删除交错排除为环境假设。

## 外部内容与最小永久信息

模型侧自己持有的额外AttachmentRef/raw.body保留责任仅在实际provider已提供配对释放且不会删除日志/消费者仍依赖内容时解除；ACK不赋予删除其它owner对象的权力。仅提供inline路径的当前实现不因未来CB全集需要通用内容平台。已启用但不能确认解除的真实外引用明确cleanup_pending/external_retention并留owner；不假称全部释放、不以不存在的provider把所有inline路径永远阻塞。

最小永久信息仅支撑原身份/创建判重、真实终态与账/确认定位、释放状态和版本不可复用；不复制完整messages/tools/参数大对象/结果/原始body。释放模型副本不删除原不可变日志，其长期归档不属于本次模型GC。未知费用能由原final账记录独立继续时不保留无关大输入；确有必需内容须逐项说明依赖并有可恢复清理责任，不以“也许以后要用”保留全部。

## 替代与迁移清单

- RT11 S85“marker存续即payload持续保留/无独立回收路径”、S89完整结果读取、S91按键读取、S92既有操作映射、S94保留/回收保证，以及MS7 S55引用存续：由后继加入合法ACK之后的显式释放例外及新读取分支，未ACK全部原保证保持。
- runtime v20私有无GC段、ST2、反证、选择表永久孤儿成本、R20相关无删除验收：改为retention门/ACK确认/事务释放/崩溃认回。旧条目保持历史字节，不可继续作为生产默认。
- openCall同key ACK后返回、acquire/readAttempts/reconcile、settle/retry/interrupt/hostclose与任何writer必须消费同一已确认状态，禁止旁路旧fullpayload查找与按missing伪notFound；不是只新增一个不被其它入口使用的ACK方法。
- core messages新record/类型及原规范资源，runtime/demo调用者和双语README一起迁移；无Session全实现、模型厂商或T26全部重验前置。实际受影响的资源/声明/消费者门必须跑。

## 有限形式与工程反例

TLA最小模型至少有两CallKey、两consumer、一个晚writer、读占用、SQL控制/内容存在、日志ACK/终态与回执未知、crash/recover。安全性质：未确认不删；未排空不删；ACK不改结果/原账；旧ref不notFound；不同调用不受影响；重复ACK恰一次事实；删除后新读不取内容；原writer晚提交不能发布指向已删内容的未确认结果。进展前提只允许真实环境最终可用、旧任务最终结束与公平清理，不预设已经完成清理。

至少提供去掉关闭准入/真实writer排空/确认先行/同事务删除控制更新的预期失败配置；实测覆盖相同交错、read/delete、unknown批晚提交、重启各中间态、两消费者只有一个ACK、idle handle不阻塞、合法大数创建幂等与费用未知。形式模型不证明SHA碰撞安全、实际SQL/JSONL耐久或外部provider释放。全部后继必须独立spec与architecture review，root接受后才实施。
