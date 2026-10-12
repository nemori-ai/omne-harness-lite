# Runner 公共行为

本包拥有纯键／结论／效果／历史、chain 与 ports 的公开承诺及 Cordis 服务定义。本页同时约束遍历、持久结论和回放；具体本地适配、借用资源与装配归提供者。整批动作、准入登记与代际增量按当前采用保留，不以旧单项算法覆盖。

根入口不加载 Cordis；./cordis 拥有 loopExtensionRunner、loopExtensionImplementations、runnerHost 三键。消费者经公开定义组合，JSON 或隔离标签不授租户访问权。实际提供者可独立消费纯函数及显式 ports，不把完整 Session／Agent Runtime 当作本包实现。

## 整批动作与官方准入

RA-1：dispatch 的 before_action 只接受整批请求。宿主核实际 Run、attempt、adoption 和完整模型回复，提供同序稳定锚。
请求必须包含原批次中全部解析成功项，保留原序；来源不可读返回 unavailable，请求与真实来源不符返回 invalidInput。
数据在首个 await 前复制并冻结，grants 保留不透明身份。report 必须与本次真实 adoption 相同。
grants、运行模式和父约束来自可信宿主；请求不能以另一份形状合法的值代替。grants 核对象身份，其余核值。

RA-2：只有真实非空模型批次全部不可解析时允许 actions/anchors 为空。此时仍核实际链和官方贡献，返回 gate 与空结果，不构造虚假经过，不调用空 admit。
本条限定取代旧 runner v5 对 actions 必须非空的要求。单项 replay 仍可读取 before_action，不调用贡献或写日志。

RA-3：gate 是本次采用的链与贡献事实。链无官方末位记 missing/chain；定义在场而贡献或声明依赖明确缺席记 missing/contribution。
来源读取失败为 unavailable，不能充当缺席。官方定义在场时须唯一、末位、固定 builtin、veto 和 admission fallback。
gate 不授予执行权。后续撤除不改写已采用的事实；真实 admit 前后仍核原贡献与经过有效。

RA-4：各项先接续自己的前链，rewrite 必须先确认结论。每项已结束、asked、失败或到达官方末位后，才对到达末位且有表项的候选集调用一次 admit。
候选集为空不调用。无表项与 not_in_composition 分开；权限和 tenantAutoWritable 来自同一 EffectiveValue，不补缺失政策。
普通拓展件使用单项输入；官方贡献使用经过源固定的整批有效输入和原 finalKeys。

RA-5：任一项失败时整次不交效果或 token，已确认结论保留。任一项 asked 时整批不返回 admissions，不能提前交出其他项的 token。
失败或取消须释放会合等待者；贡献实际 Promise 未结束时，关闭仍保有其排空责任。

RA-6：已最终项按原锚和真实历史重建，不再次求值；仅未最终候选进入新的 admit。
未知写未认回或旧写可能迟到时禁止重入。物理恢复保持原业务 Run/attempt，不能借新 attempt 重用旧 adoption。
宿主对换代返回 attemptSuperseded，对已结束 Run 返回 unavailable。部分完成和整批完成的持久确认仍由应用驱动拥有。

RA-7：只有实际官方末位的最终 observed、有效工具表项、完整非等待批次，才返回该项正式 token。
token 是定位值；持久核验、整批完成事实、当前授权与执行意图的共同提交另由准入和运行时保证。

RAC-1：官方准入贡献只有一格。registerAdmission 在同一任已有登记时抛出装配错误，不覆盖现任。
普通 registerBuiltin 不接受 OFFICIAL_ADMISSION_NAME，不得借普通单项调用签名冒充整批准入。
登记属于可信装配面，不授予不可信工具 Context 或插件装载权限。

RAC-2：捕获的 lease 固定贡献代。旧撤除函数只移除自身那一代，不得删除后来登记。
开始调用前与真实 Promise 完成后均核代际和登记状态。失效或抛出时返回 failed/unavailable，不转调新贡献。
业务批次的实际授权、输入和结论仍由经过源、准入绑定与 runner 写入协议核验。

RAC-3：Cordis Service 的登记以调用方 this.ctx.effect 拥有，贡献者卸载即撤除。
关闭先拒新登记／捕获／调用，再等待已开始的真实 Promise 结束。服务不可见和提前拒绝结果不等于贡献已停止。

## 正式准入定位值的纯映射

本段按阶段二 tk1 选择承接原准入提供者 TLT1–3。它只拥有 runner 结论键与 AdmissionToken 的映射。
公开准入行为仍归 core/tool-admission；编码或解码成功不证明结论存在、整批完成或当前获准。
本项目当前集成的准入提供者共同消费此映射；只实现 AdmissionToken 接口不代表支持该格式。

TLT-1：正式格式为 admission.2. 加无填充的规范 base64url。载荷是 UTF-8 编码的 JSON.stringify 字符串三元组：callId、参数摘要、finalKey。
解码后重新编码必须逐字相同。非法 UTF-8、别名编码、非法身份和非三元组拒绝。纯判断的 admission.1 不是正式格式。

TLT-2：finalKey 必须是 runner/5 在 before_action、固定 omne-official:admission-judgment、final occurrence 的规范键。
解码只验证键形状；实际调用、原锚、scope、结论内容及日志代和尾仍由持久核验确认。

TLT-3：参数摘要是 canonical 参数 UTF-8 字节的 SHA-256，以 64 位小写十六进制表示。
数使用 ExactDecimal.toCanonicalString()，数组保序，对象按 JavaScript 字符串键排序并递归编码。
字符串、布尔值及 null 使用 writeJsonLossless。同值数和对象成员换序的摘要相同，不同大整数或数组换序不得混同。

RS-1：服务单项派发的成功结果可以携带 chain。它是本次调用实际采用并按位置／维度选择的链快照，与本次输出同源。调用者不能用派发结束后的第二次 manifest 读取替代它。该快照只用于核对本次经过，不授予准入或执行权限。

RS-2：RunnerDispatchScope 的 recordFence 只能由可信宿主在核验原义务和实际写权限后提供；它不来自业务请求、工具参数或链贡献。缺省结论写入使用原 Run/attempt fence。宿主为已有结果的维护交付提供 unfenced 时，结论仍保留原 tenant/session/Run/attempt，物理绑定与原主体验证照常成立。该选项不授予新动作准入或模型重试权限，也不放宽尾条件、未知写认回或关闭责任。


## 稳定经过、遍历与提交

同 (session,position,dimension,anchor) 恰一经过，可跨 attempt／重启。调用者从真实日志与输入给稳定且不同经过不碰撞的 anchor，入站与 loop 交错也不能碰撞；runner 不解析、推导或换锚。纯 key 形状不证明原锚正确。before_persist_message 给 contributor 的 input 不露 run／attempt；外层真实 withRun 仍用于写栅栏，公开 user/system 的 noRun 与私有嵌套继承栅栏不混用。

按链顺序逐件 await。subject 叠前件 finals，earlier 仅前件 finals。每件结论确认提交后才开始下一件或交效果，不 fire-and-forget、不取首个非空结果。首 veto／stop／ask／retry 或实际 fallback 否决即停链；未轮到件不写记录。每件同经过至多一个 final，多轮 ask 各自留记录。效果从原 initial 与耐久有效结论重建，rewrite／select_model 后写盖前写；旧 ask 留历史，不与同件 final 一起折叠成永久 asked。

最初非法 input／未知 position／manifestMissing 表示尚未开始。真实 head0／notfound 才 manifestMissing；已存在但内容缺失、读取失败或来源不可核为 unavailable，不能当空链、空历史、skip 或作者 errored。presence 整次失败不伪某项 absent；无 needs 不增加依赖读。贡献真正开始前的 notStartedUnavailable 与开始后失败／被撤除的 errored 分开。表示层非法 output 的 errored.error 恰为 LC 首拒绝 token。command 非阻断说明保非零退出码，区分 timeout／bad_output，不转述 stderr 或原 output。内部构造或 guard 的 invalidInput 不走作者 onError；保已提交前缀。结论后的提醒冲突为 replayInconsistent，不重新求作者。

先做 LC 表示、power、immutable、source 检查，再做真实 capability guard，未判完不提交。所有 before_persist_message rewrite 对派生表示的新增、替换或移除都须核贡献者是真实系统模态转换件，不限 producer=model；普通贡献者即使形状合法也不得生效，走原非法输出政策。系统件身份仍由真实拥有者定义，不造身份名。select_model 核 legalTargets；retry 核 canDispatchAgain 的完整结果集合。refused 的 why 及 alreadyEnded／callNotFound／wrongPhase 按作者错误政策；unavailable／invalidInput 整次同名退出，不写当前件新结论。allowed 只是本次判断，不锁下一次发送资格；runner 不睡眠或调用模型／dispatchAgain。

系统 fallback 固定，不调用替代作者、不造第二结论：modality 仅在有需转换块（含 nested 工具结果）时 veto；retry 不重试；admission 全拒；loop／offload 只记不可用。动态来源不可读不当固定缺席。真实系统件身份由其拥有者定义，不从 builtinName 或类名自造。当前整批准入的 gate、空解析批与正式贡献规则优先，不强加旧 synthetic fallback 经过。

## 真实 chain 与只读借用

在授权 scope 核 holdingTenant、同一物理 RunnerLogBinding 的 session／tenant／logGeneration，随机 generation 不授访问权。捕获同一 manifest 实例，一次 readHead 取 latest.loop_extension 及其 record；必要时同历史重读原 filledAt，不混另一实例或新版本。E 必须完整，compositionOrder 是全排列，content 恰含 evaluation／compositionOrder／filledBy，seq／ref／给定或复用关联须可信。

given／mint 筛完整类别；reuse 只按原序删除，不加回、按名排序或替换为全局最新 E。每项 asset/version/from/capability 对应同 E 的 immutable 正文。受限 registry-history reader 只借读，不关闭；不读当前资产，也不借实现自报代替原版本。AssetVersion 不自带 assetId，受控 request 关联、number/content/name 核验，不发明字段。position／dimension／power 来自 E，policy／needs／implementation 来自该正文；允许档合法非空时取最强 observe<rewrite<veto，不越声明、不剪坏值或补 observe。合法 loop reuse 不套注册表私有生产操作的类别限制。

开始后本次 chain 固定，下一 dispatch／replay 须重核当前链的已落 names 前缀；不另承诺清单至提交间永远不变。log 至少包含经过开始时已经提交的全部会话条目，另含本经过前件 final 及原 ask／card／answer；读取失败不交空。environment 先从真实 sessionTenancy 得 tenant，再按 (tenant,session) 解析 env，不反推 tenant、不回退 host 或借别的 session。log／env 句柄只活于本件本调用，返回、取消或实例停止后 finally 失效。失权不等于底层 work 停止，pending 不持 execution handles、不轮询。

replay 是只读：不带 attempt、不伪 0，不受当前 attempt 写栅栏；一次合法原条目读取后核壳、tenant/session、keys、call 关联、ask ordinal、final 及当前 chain 前缀，返回全部结论。真空可以 []，读失败或完整性未知不能伪 []。不 invoke、presence、开句柄、readAskState、guard、mint、取钟、append、补卡或提醒；纯检查不自行授真实读取权限。

## 等待、提醒与冲突

ask 已落而 card 缺失时，真实 card owner 按原 ask 唯一补建。pending 交同原 asked，零 invoke／新结论／新卡；ready 必须全批完成，不从单卡已答、answered 提醒或同 batch 字面推出。等待 owner 核原 session/tenant/pass/piece、ask entry/key/log position/ordinal、card/batch/answer，并完整重建 subject/earlier；原 initial 同值仍由 caller 保证。接续用新 log/env 句柄及当前合法 attempt，不伪原 attempt。

ready 保同一 owner 代际与当前使用权。来源不可核为 unavailable，确知偏离为 replayInconsistent；普通日志追加不是 tail 不变守卫。贡献者 replay 必须认回原耐久模型结果和费用，不再次调用、付费、出卡或借别件答复；走完旧历史才可新 ask。等待 owner 锁存偏离，即使作者 catch 后给 output 也无效，整次停止；不 mint／取钟／写结论／提醒／卡，也不走 onError。未知控制来源不伪 errored，自由或明确不答按真实卡片拥有者规则解释，不自行取默认。

按各位置职责形成的 inject、record、veto 提醒，在经过结束按 chain 顺序补齐后才交 effect。runner 自产的 record／veto 提醒 source 是本件 extension，nature=event。不可用造成 veto 时没有 output.reason，runner 仍提供不含未落内容的不可用理由给 caller；在原本须追加否决提醒的模型回复路径，不能因缺 output.reason 省略该提醒。before_terminal 的理由由 assembler 读取，runner 不另追加提醒；其他位置责任保持。完整提醒与候选结论同 wrapper 耐久保存。作者负责其 MessageId／createdAt；runner 自生身份或时间不可得为 unavailable。提交前自生 ID 冲突可重铸，结论提交后不可再生。共享 mrr/3 MessageId 键，同 ID 须全消息精确相等（数精确、对象无序、数组有序）才幂等。作者提交前异值按非法输出政策；结论后另一写者同 ID 异值为 replayInconsistent，不交效果、替身或修改原结论，不能把 alreadyRecorded 直接当成功。

每提醒经过私有 before_persist_message/system 嵌套，继承真实外层 fence，但 contributor 不见 run／attempt。嵌套失败传外层，nested veto 只阻提醒，不改 outer effect。只一层：nested inject 不生效，record 只 observed，防无限注入。

## 停止、unknown 与物理日志责任

业务 cancel 给当前件信号并停新件，不提交迟到 output／提醒／效果，不回滚已提交事实。卡片作废归 card owner；recycle／crash 留原 ask 供下次合法接续。贡献开始后被撤除走 errored/onError，但 runner 自身停止或来源失效优先 unavailable。capture 固定原代，旧 disposer 只撤自身，重复幂等；新贡献不替旧在途完成，同名 register 同步抛装配错误且不动旧任。

关准入、发信号、失效句柄均不证明 Promise 或外部效果停止。贡献执行 owner 消费迟到 resolve/reject，跟踪真实完成；runner drain 等真实 invocation，不能提前关闭借用 log/history/waiting owner。

read/append 调用前在原物理 log host 长期 RunnerTaskOwner 登记。unknown 保完整 candidate、原 subject、ask/final key、tenant/session/logGeneration/execution/reminder 责任，不因 unavailable、fiber 替换、source.release 或 cancel 当 absent 或释放；旧写可能迟到时不重求或重卡。closeAdmission 同步关新入口，不撤已交提交；drain 等真实 Promise 和 unknown。

只有旧 writer 真正关闭或可信物理退出且恢复读取获准后，同 binding recovered read 才能认回。原候选同值为 same；异值须判断合法竞争 winner，按 winner 的完整 ask/final 接续，不强求同本地 at/candidate。MessageId 异值仍冲突，不能用 winner 放宽。可信 absent 才解除未知供原锚接续，owner 不暗中 invoke。宿主顺序是关所有消费者准入→停止旧物理 writer／开放恢复读取→reconcileStoppedLog→owner drain，不先等待须关闭日志才能解除的未知。去重、数据与 fence 在同 SL3 条目提交，不假称跨独立库原子。

## 模型失败、调用方与未闭边界

runtime 在同一次真实完整 prefix 产生 failure subject/retry history。runner 核同 session/tenant/physical generation/call、原 profile/dispatches/cause/status/inBand 和原重复序列，不拼第二次 tail 或当前目录。每 failure conclusion 同提交带 modelCallId 与完整结论；缺值或错 call 的耐久结论为 replayInconsistent，不改旧记录或开旧读面。来源未知为 unavailable。

runPass/service 在首 await 前拥有并冻结 actual execution，verifyFailure 第三参数、LC input 和 log fence 用同值，不二读可变 caller。noRun 或 otherRun 挪用原失败为 invalidInput；sameRun 可跨合法 attempt 回放，不要求等原发送 attempt。已 release／revoked／代际无效先 unavailable；可用来源下错误 context/subject 为 invalidInput，不走作者 onError。准备失败无新 acquire/invoke/append/send；来源本来必需的授权读不叫零 IO。释放 source 消费权不释放 unknown log 责任，模型 F0／ACK 仍归模型 owner。

runner 只写结论和提醒，不写 Run 终态、取消请求或向上交接。caller 消费 proceed；before_action veto 是 deny 而非 execution failure；before_model_call veto 不发且 Run failed；before_compaction 超限由 caller 处置；before_terminal veto 继续，reason 由 assembler 进上下文。模型消息 veto 正常结束本 call，不产 failure/after_model_call、不经 retry，下一迭代新 call；工具消息 veto 为 Run failed，user 受理拒绝可见，system 仅不落消息。stop/cancelled 先请求取消再终态，failed 直接终态。before_action 的最终参数先记，再供授权、人签和执行同值，原模型参数不改。

模型回复连续 veto 提醒不转述被阻内容，按本 Run 自最近已落模型回复后的日志次数计数并含本次。连续模型回复否决的上限独立于循环守卫 L2，各自一个阈值；未配或不可读为 unavailable，不能无限继续，达到时 stop/failed。特殊“不再追加提醒”条件仍未闭，不能扩成所有正常 stopped 均免补提醒；一般补提醒责任保持。inject 与 before_model_call rewrite 后的 messages 重组仍待确认，不擅自认定重组规则或重跑同 pass。真实 caller、阈值 owner 与完整 Session 产品提供者未由纯函数或本页自动兑现。

采用的失败边界保留：runPass 外层未识别异常为 unavailable，纯 readPassConclusions 为 invalidInput；内部受控 signal 原对象透传，ports／contributor 沿各自 union/channel，不统一改上抛。成功后 release 异常是否作废及其观测仍未采用，不以新指导替换拒绝语义。

[本地提供者](../../agent-loop/loop-extension-runner-local/SPEC.md)拥有实际适配和装配；[模型与场景义务](../../agent-loop/loop-extension-runner-local/verification/README.md)保留有限前提，不证明完整 Session／Agent 集成。
