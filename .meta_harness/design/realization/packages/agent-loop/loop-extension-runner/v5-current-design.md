# loop-extension-runner v5 当前提供者投影

2026-09-28，revision 3，candidate。持续消费者是本节点实施者、模型运行时失败主体生产者及真实组合验收者；本稿未被技术采用，尚未建包。保留 [design.md](design.md) 与 [v3-design.md](v3-design.md) 的冻结字节和历史接受事实。本稿只补当前版本绑定与缺失实施面，完整 `dispatch`／`replay` 控制责任仍在原节点，不新增 AgentLoop、Session、Inbound 或工具执行责任。所有本节点新增函数、类型、插件、服务、字段和键编码名均为**候选**；标为“已有”的公开导出按下表实际源码读取。

## 输入与采用边界

基线 `omne-harness-lite-design-2026-09-15`。已逐项核对 [catalog](../../../../registry/catalog.json) 的坐标、状态、依赖及接受记录，以下六份 contract 的当前 SHA256 均等于接受记录；文件内部旧 candidate 抬头不推翻接受事件。

| 输入 | 接受依据 | contract SHA256 |
|---|---|---|
| capability.loop-extension-runner/5，S-1～S-54 | D-100 | `e571e01d8e4d86fec3904d9decb37beb38615940125f320a72c250fd63ca4c43` |
| data.loop-extension/6，S-1～S-43（LC6） | D-100 | `d5cf4e24abc0a72ffe27072b8239489812382e3b94f2ee891ca9264338a1954a` |
| data.messages/6，S-1～S-50（MS6） | D-100 | `73736fb36e63961b88b88918c641608204863831f40c503dc96b5cecf9e84c1c` |
| capability.session-log/3，S-1～S-37（SL3） | D-083 | `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26` |
| capability.model-request-runtime/9，S-1～S-76（RT9） | D-104 | `3ae5ee1843a31cb229a11c77a35c2bdc66e51100953322be0febed1ef37e64fb` |
| data.model-response/8，S-1～S-40（MR8） | D-104 | `34b78e9c55df99fa8ea3756c98010914fae92a56375a429316e7fdafb966fe13` |

规范正文入口：[Runner5](../../../../spec/capabilities/loop-extension-runner/v5/contract.md)、[LC6](../../../../spec/data/loop-extension/v6/contract.md)、[MS6](../../../../spec/data/messages/v6/contract.md)、[SL3](../../../../spec/capabilities/session-log/v3/contract.md)、[RT9](../../../../spec/capabilities/model-request-runtime/v9/contract.md)、[MR8](../../../../spec/data/model-response/v8/contract.md)。Runner5 冻结的需求来源 topic/rev 为：PF-012 rev15、PF-008 rev7、PF-002 rev26、PF-013 rev14、PF-014 rev8、PF-004 rev13、PF-000 rev1、PF-005 rev7、PF-015 rev13；当前 PF-013 已为 rev15；新增 token 估算与可配置余量由 RT9 发送门及档案提供者承担，runner 不计量、不填实际用量、不绕过该门。这个增量复核不把 Runner5 的冻结来源 rev14 改成 rev15；本稿不重裁产品要求。D-076 采用的是旧 runner v3 投影；D-100 的七个 provider 节点清单不含本节点。

**规范精确依赖没有自动升级。**Runner5 仍冻结依赖 RT7、MR7、SL2；本稿提议当前实现显式消费 RT9、MR8、SL3。RT7→RT9 的 runner 消费点限于 S-24/S-35/S-50/S-60/S-67/S-76，新增估算门和恢复时序由 runtime 承担，不改 runner 的守卫答复与 retry 含义；D-104 明示 runner 消费的 MR7 S-10/S-14/S-36 未变，MR8 的恢复 Timing 不能被 runner 改成新失败种类或直接触发重试。SL3 保留原栅栏、判重、读取语义，追加面多出的显式 condition 在本节点每次写指定 `unconditional`，不假称 runner 结论与 HTTP 原子。技术采用前须核上述差异和 V5-1，不能以当前包能 import 代替符合性。

其余依赖保持 Runner5 catalog：CB3、CA2、IV1、AE4、AR3、MF3、modality-projection2、tool-admission2、session-tenancy2、execution-environments2。当前表示资源仍沿 LC6/MS6 的精确 Schema 闭包，不将 RT9 所用 MP6 无条件投进 LC6 的 MP5 定义。Cordis 采用 D-025 的 4.0.4，存储为独立抽象；静态配置错误统一**启动失败**。

## 已有公共构件与候选新增面

源码清单固定于承载仓库 `544f39fdc6b963704a4105b8422527a7caae25fa`。源码路径纯文本指认，不越出 design 根建立相对链接。

| 状态、公开入口 | 本节点的消费与限制 |
|---|---|
| 已有 `packages/core/loop-extension/src/index.ts`：`judgeInput`、`judgeOutput`、`judgeConclusion`、`judgeValue`、`validate`、处置表 | LC6 接收与完整 Conclusion 校验；Schema 不证明来源、历史完整、归属或提交 |
| 已有 `packages/core/messages/src/index.ts`：`judgeMessage`、`judgeMessageInLog`、`judgeModelInvocationRecord` | MS6 提醒及原发出记录判定；完整值不简化成显示文本 |
| 已有 `packages/model/model-request-runtime/src/index.ts`：`captureModelLogValue`、`prepareModelLogEntry`、`inspectModelLogEntry`、`encodeModelLogKey`、`modelLogJsonEqual`、`readSettlementPrefix`、`interpretCallHistory`、`decideRetry`、`retryDelay`、`createModelRuntime` | 消息共用 mrr/3 codec；既有 `CurrentHistoryReaders.failure(prefix, callId)` 是 runtime 的失败来源端口。`src/failure-subject.ts` 的 `readFailureSubject` 是包内构件，**不是已有公共导出**。无现成 runner 结论解释器或 P-5 登记插件 |
| 已有 `packages/session/session-log-jsonl/src/index.ts`：`openJsonlSessionLog`、`SessionLog`，SL3 三操作及 `JsonlSessionLog.close` | 耐久存储消费者，经公开接口读写；close 的物理排空由日志 owner 完成，runner 不关闭共享日志 |
| 候选 `runPass`、`composeEffect`、`passKeys`、三张处置表 | 按下节补全 v3 函数输入：显式初始主体、链、锚、端口与信号；`runPass` 无 Cordis/隐式会话依赖，服务 `dispatch` 使用同一循环。处置表复用 core 公开规则，不另抄常量表 |
| 候选 `prepareRunnerConclusion`、`inspectRunnerConclusion`、`readRunnerRetryConclusions` | 本节点唯一 Conclusion codec 与纯前缀解释器，见下节；不增加 capability 操作、不拥有失败主体政策 |
| 候选 `loopExtensionRunner.dispatch/replay`、`loopExtensionImplementations.registerBuiltin/registerCommandExecutor` | 一个 runner 插件提供两个面；登记返回精确代际的注销闭包；没有包、没有真实 API，可实施性不等于实现 |

### 当前公开函数签名与输入绑定

以下是**候选实现接口**，不是已导出 API，也不修改服务的两个操作或 LC6。`PositionedSubject`、`ExtensionInput`、`Conclusion` 使用 core/loop-extension 的当前公开类型并经 LC6 判定；`LogEntryInput/LogEntry` 使用 SL3 提供者公开类型。记录中的 token 都指精确 JSON 值，不把整数转成不安全的 JS number。函数层不凭类型获得授权、来源真实性或耐久性。

| 候选签名 | 明确的输入、输出及失败边界 |
|---|---|
| `runPass(pass, chain, ports, signal) → Promise<PassResult>` | `pass={initial, anchor, execution}`：`initial` 是未叠加任何结论的 `PositionedSubject`；`execution` 是 `{kind:withRun, run, attempt}` 或 `{kind:noRun}`。`chain` 为 v3 已规定的同 E、同不可变正文的有序条目。`PassResult` 是 Runner5 S-21 的 `{conclusions,effect}` 或其封闭失败值；不新增“无 Run 模型失败”分支。`ports` 绑定本次调用，不读全局 current/latest。 |
| `composeEffect(initial, conclusions) → {effect} \| {invalidInput:true}` | 纯函数；`initial` 为原 `PositionedSubject`，`conclusions` 为本次经过已经确认且按链序的完整 LC6 列表。以原 subject 起步，逐条叠加合法 rewrite 和 select_model，或取第一终止效果。空链／全 observed 交回原 subject；不从第一条结论猜主体。错位置／维度／身份及不合法改写沿 invalidInput；服务对不一致耐久结论先映射为 replayInconsistent，不交给消费者拼接。 |
| `prepareRunnerConclusion({session,tenant,execution,anchor,occurrence,value,reminders}) → {entry:LogEntryInput} \| {invalidInput:true}` | 纯构造；完整 value 先经 LC6 校验，reminders 经 MS6 校验及本稿关联规则，execution 决定壳中 run/attempt，键全部由 passKeys 派生。输入不合不生成半条记录；不发号、不取时、不写日志。before_persist_message 的 execution 可有 Run，但不可泄露到该位置的 ExtensionInput。 |
| `inspectRunnerConclusion({session,tenant,entry}) → {conclusion,anchor,occurrence,reminders,execution} \| {unrelated:true} \| {invalid:true}` | 纯解码；只有壳与 payload 均不指认 runner 域才 unrelated。任何 runner 标记、键、完整值、tenant、字段闭包或壳关联不一致为 invalid；调用方按读场景映射 replayInconsistent 或 unavailable。返回完整捕获值，不返回可修改的原始引用。 |
| `passKeys({position,dimension?,anchor,extension?,occurrence?,modelCallId?}) → {pass,all,final?,ask?,modelCall?} \| {invalidInput:true}` | 纯键构造，精确编码见下表；final/ask 需要 extension，ask 还需要正整数 ordinal，modelCall 只在 failure 位置且带 modelCallId 时产生；缺维度、不配对或字段越界拒绝，不填默认。 |
| `readRunnerRetryConclusions({session,tenant,callId,entries,tail}) → {conclusions:ModelRetryConclusion[]} \| {unavailable:true}` | 纯完整前缀解释器；详细核对与顺序在下节。只返回原 LC6 值，不生成 run/attempt、不生产假的失败主体。 |

`runPass` 每次调用贡献者之前，按当前累积主体和已确认的 earlier **构造并校验一份完整 ExtensionInput**。非 before_persist_message 必须从 execution 取真实 run/attempt；该位置永不向贡献者传两者，即使日志写入仍继承外层 fence。log/environment 由当件受控句柄端口取得、finally 失效，不复用上一次调用句柄。LC6 不支持的 noRun after_model_call 在任何 invoke 之前返回 invalidInput，公开函数和服务一致。

候选 `ports` 的可实施边界如下；每个端口的结果都由 runPass 检查，不以异常或 truthy 值代替业务分支：

| 端口 | 输入→输出及 owner |
|---|---|
| `readConclusions(pass)` | 返回本经过原条目及 tail 或 unavailable；日志适配核键、链和壳后交完整值。ask 轮次及最终条目分开解释，不能把未答 ask 丢掉。读取只及已绑定会话。 |
| `presence(piece)`、`invoke(piece,input,signal)` | 前者按 v3 的 needs／实现代际判可用；后者直接 await 当代实现，并区分起不来、开始后报错、合法 output。实现登记者拥有实际工作；runPass 拥有等待和迟到 rejection 的消费。贡献者不接触未校验的统一输入。 |
| `openHandles(piece)` | 返回 `{log,environment,release}` 或 unavailable；release 使两只句柄失效。它不证明环境一定可解析，解析失败仍沿 LC6/Runner5 既有规则。 |
| `verifyFailure(subject)` | 仅 failure 位置需要，使用下述调用级历史绑定；输入 mismatch 为 invalidInput，来源/代际不可读为 unavailable，不能跳过而认空历史。 |
| `judgeCapabilities(input,output)` | 形状及 power 判定之后，接当前 modelRuntime 或 toolAdmission 的真实判定联合；retry 的完整映射沿 RUN5-P6，不能用 allowed 布尔 stub 签收服务。批次放行依旧由外层批次协调者按 S-29 一次 admit，单个 runPass 不自拆批。 |
| `record(entry,execution)` | entry 来自 prepareRunnerConclusion；返回 SL3 append 原联合。适配显式传 fenced/unfenced 和 unconditional；alreadyRecorded 必须再读同键、校验完整耐久条目并按原回放规则采用合法胜者；结论竞争不要求胜者与本地候选逐值相同。读回不可用不能合成成功。append 的登记、unknown 留存归下述 owner。 |
| `persistReminders(reminders,execution,signal)` | 按 S-19 逐条经唯一一层 before_persist_message 嵌套控制与共享 mrr/3 codec；返回完成或原失败联合，不把 veto 当外层 veto，不再注入第三层。record 成功不代表本端口成功。 |
| `mintReminder`、`now`、`isActive` | 仅首次自产提醒/结论边界用发号时钟；来源不可用为 unavailable，重放不调用。isActive 只是本实例停止检查点，不能代替真实提交/停止证明。 |

`dispatch` 在服务层核身份、真实链、报告、批次及输入准入，构造上述 pass 与调用级 ports 后调用同一 runPass。`replay` 依 S-22 **只返回 Conclusion[]**；调用者若要效果，使用自己传给 replay 的同一原始 `position/dimension/subject` 调 `composeEffect`。重复 dispatch 同样使用调用方对同锚传入的原主体，不能把上次 proceed.subject 当原主体再叠一次。稳定锚与原主体的对应属于调用者的 S-5 义务；节点不发明“存一份最新主体”作为第二权威。

## 契约到公开操作、Cordis、存储的投影

下表是兑现点设计，**没有一行宣称已经实现或验证**。九项操作承诺仍以 Runner5 S-21/S-22 为准。

| 行 | 契约责任 | 公开构件／Cordis 操作（本节点均候选） | 存储、组件及版本 | 依据或缺口 |
|---|---|---|---|---|
| RUN5-P1 | S-5/S-6/S-21①②⑥⑧：输入、锚、权限、真实链 | `dispatch` 接收；MF3 当前类别→AE4 纯判定→同 E 同不可变版本正文→`runPass` | v3 的完整链读法保持；无链与不可读分开 | V5-1/9；RUN5-G1 准入冲突；授权归装配 |
| RUN5-P2 | S-7/S-10/S-12～S-17/S-21④⑤⑨：逐件 await、先落后算、完整控制 | `runPass`、登记面、`composeEffect`；不走事件、不新开每次经过 fiber | LC6 表示／权限检查；SL3 append 确认后才开始下一件 | V5-2/9；ask、不可用、报错、partial/failed 分支不可裁掉 |
| RUN5-P3 | S-11/S-18/S-19/S-28/S-53：唯一结论、modelCallId、完整提醒 | `prepareRunnerConclusion`＋`passKeys`＋日志端口；reminder 使用既有 mrr/3 codec | Conclusion 与 modelCallId 及完整提醒副本同一条目提交；实际提醒经过嵌套后另写 | V5-2/5/6；RUN5-G2；不另存 retry 账 |
| RUN5-P4 | S-22 全九项、S-53.4/S-54：只读回放 | `replay` 仅校验输入、真实链、已有前缀并返回原 `Conclusion[]`；不调实现、不写／补提醒、不问随机源时钟 | 同一完整 LC6 耐久值；无最终结论的 ask 按原等待规则 | V5-2/4/5；未知写不能当无记录 |
| RUN5-P5 | S-53/S-54、LC6 S-42/S-43、RT9 S-34/S-76 | `readRunnerRetryConclusions` 输出同 prefix 原结论；runtime 的 source 组合完整 failureSubject | 完整 SL3 前缀 entries/tail；callId 与会话壳一致；按日志顺序保留重复值 | V5-3/4；RUN5-G3 接线归 runtime／装配 |
| RUN5-P6 | S-14/S-26、RT9 S-35/S-50/S-60/S-67/S-76：默认件与两次守卫 | P-5 登记 `decideRetry` 适配；runner 调真实 `canDispatchAgain`；调用者后续调 `dispatchAgain` | 政策、采样及 previousDelay 显式来源；已落 retry 不是发送许可 | V5-7；RUN5-G1/G4；发送／退避调度归调用者与 runtime |
| RUN5-P7 | S-9/S-21/S-29/S-30/S-50：句柄、批次、提醒、报告、连续否决 | 沿 v3 句柄及整批控制；报告三者核对；两处末位和一层提醒完整保留 | sessionTenancy→executionEnvironments；toolAdmission 等调用时取；不执行工具 | V5-9；既有 G-16/G-17/G-19/G-20 仍在 |
| RUN5-P8 | S-31～S-34、SL3 S-22/S-23：装卸、停止、未知与恢复 | 实例准入门＋调用检查点＋任务 owner＋注销代际；已入提交口跑完该次提交 | 共同日志及真实日志 owner 恢复；无进程内锁代替耐久判重 | V5-5/8；RUN5-G5；D-105 的 runtime scope 不拥有 runner 任务 |

### 当前结论载荷、身份与共享消息键

候选技术 wrapper 为 `{format:"runner/5", category:"conclusion", anchor, occurrence, value, reminders}`：`value` 是完整 LC6 Conclusion；`reminders` 是按 S-19 确定的完整 MS6 消息序列（没有时显式空）；inject 提醒必须与 value.output 中的原消息逐值同序对应，自产提醒则按该结论与处置分支构造，不能接任意不关联的消息副本。`occurrence` 的闭合形状为 `{kind:"final"}` 或 `{kind:"ask",ordinal}`；ordinal 是从本经过该件耐久 ask 序列导出的正整数。字段是 provider 编码，不修改 LC6。`output.kind=ask` 只能使用 ask 分支；其他最终记录使用 final 分支，包括 skipped/unavailable。SL3 地址负责 session，条目壳负责 tenant 与成对 run/attempt，后者不塞进 Conclusion。prepare/inspect 对非 before_persist_message 必须核壳带 run/attempt；before_persist_message 是否带壳按外层 execution，不能以 LC6 Conclusion 本身未带两者为由创建无 Run failure 条目。首次自生成时才取身份与时钟，未知提交重认期间保留原候选全值，不重铸。

候选 `passKeys` 的编码为 `runner/5/` 加无空白固定数组的 JSON 表示，字符串按 JSON 转义，无分隔拼接或 hash 截断；维度 `{ending:"complete_reply"}`／`{ending:"failure"}` 分别编码为 `ending:complete_reply`／`ending:failure`，`{scope:"each"}`／`{scope:"batch"}` 分别为 `scope:each`／`scope:batch`，无维度用 JSON null；ask 序号采用规范十进制正整数字符串。读取时解码后重编码逐字核对。以下全部键名均为候选：

| 用途 | 固定数组分量；session 是 SL3 外层地址 |
|---|---|
| 经过读取键 | `["pass", position, dimension, anchor]` |
| 最终判重键与相同读取键 | `["final", position, dimension, anchor, extension]` |
| 每轮 ask 判重键与相同读取键 | `["ask", position, dimension, anchor, extension, ordinal]` |
| 全 runner 域读取键；失败调用读取键 | `["all"]`；仅 failure 结论加 `["model-call", modelCallId]` |

键不含 at、供应商、payload hash、运行代际或 attempt，不以新尝试绕过同一次经过最终结论唯一性。不同经过即使完整 Conclusion 值相等也用各自 anchor，历史保留两次。条目同时显式带 dedupeKey 与 readKeys；不假设 SL3 将判重键自动加入读取键。codec 反查 wrapper、LC6、壳及完整键集合；某域 key 与 payload 不一致、未知 runner 格式或旧结论缺 modelCallId 不能当无关日志跳过。不恢复旧运行 codec、不补旧字段。

**提醒共享 MessageId 唯一范围。**沿已经采用的 [共同键设计](../../model/model-request-runtime/v4-log-codec-design.md) 和 [当前 mrr/3 标记](../../model/model-request-runtime/v8-current-codec-design.md)，runner 用现有 `captureModelLogValue(category=message)`、`prepareModelLogEntry(purpose=message)` 生成实际消息条目；其判重与读取键是同一 `encodeModelLogKey({kind:"message",message:id})`，不是 runner 前缀消息键。共享 wrapper 为 mrr/3，`all/messages` 等读取键由 codec 全部生成。Conclusion 则仅在 runner/5 域，不冒充 mrr/3 的 record/message/response。共享纯 import 不构成 runtime 服务环。

作者 inject 原消息完整捕获，自产提醒的 id/createdAt 随 Conclusion 同次落盘；实际消息仍等经过结束及一层 `before_persist_message` 通过再写，不能把它提前和 Conclusion 批写来绕过控制。结论提交前已知作者 ID 异值冲突→S-14 原 onError；自产 ID 提交前碰撞可再取。结论提交后异值抢占→`replayInconsistent`，不可读→`unavailable`，同 ID 同完整值才认回。提醒被嵌套 veto 时不落实际消息；嵌套结论持久保留，重复 dispatch 不重求值。未知 reminder append 沿同一键认回，不换 ID。

### 同一前缀读取与职责交接

候选公开纯函数 `readRunnerRetryConclusions({session, tenant, callId, entries, tail})` 只解释**调用者已合法取得的同一个完整前缀**，返回 `{conclusions}` 或 `{unavailable:true}`；不 IO、不读当前调用、不自己取得另一尾、不生产完整失败主体。先核完整稠密位置、session/tenant、runner 域 wrapper/键／LC6 所有关联，再筛选该 call 的 failure 且最终 `output.kind=retry`；按照原日志位置逐条投影 value。该函数的参数不是读取权或完整来源凭证，单靠数组形状不能证明日志来源；服务和 runtime source 必须在合法 full-read 边界调用它。

每条都保留 `extension/modelCallId/power/output.plan/at` 等原值；两个合法不同位置的同值条目留两次，同条目不重复；不按供应商、默认件、Run/attempt 或 at 筛选／排序。被守卫拒掉而最终 output 非 retry 的提议不收。已落未发同样计入。不同 modelCallId，即使同 Run、同供应商序列也隔离；来源确无符合项才有 `[]`。run 壳存在不使本纯读取器解释 Run 是否结束，它不产出 late。

runtime 现有 `CurrentHistoryReaders.failure(prefix,callId)` 的提供者必须把**传入的** owned `SettlementPrefix` 交给该纯函数，同时用同 prefix 的 `interpretCallHistory` 取得完整 dispatches、profile 和最近失败事实，组合 LC6 failureSubject；其 `readFailureSubject` 再沿已有校验消费。该接线归 runtime／主线，runner 不另加第三个服务操作或反向 inject runtime。`examples/model-invocation-minimal-demo/src/no-run-failure-history.ts` 只在无 runner 域、无 Run 的受控 demo 写域中合法返回空历史；加入真实 runner 后必须换此真实 source，不能删除其 foreign-domain 拒绝再照填 `[]`。

runner 接收 failure 主体时，完整输入与权威原 dispatches/结论在**生产该主体的同一前缀**核实：缺字段／已确认混调用、缺项、改值、重排→`invalidInput`；权威来源不可取得→`unavailable`。调用层需要传递或保留这次 full-read 的受控视图，不能把来自两次读取的 subject 与最新 tail 拼一起。该视图是实现边界输入，不新增领域 prefix ID 或从 anchor 猜值。以下给出调用级端口；它是**候选跨消费者组合**，与独立 codec/效果函数可分开采用，当前 runtime 尚无生产→runner 的交接入口（RUN5-G3）。replay 对已有结论还核 S-53 modelCallId；缺／错／禁止位置存在→`replayInconsistent`。不能为继续执行而篡改已持久前缀。

#### 候选调用级失败历史绑定

这不是新的服务、领域对象或可序列化通行证；是生产失败主体的调用者传给 `runPass` 的受控端口闭包。拥有完整读取权的 runtime source／消费组合在**一次** `readSettlementPrefix` 成功后，以原 owned prefix 同时计算 `interpretCallHistory`、`readRunnerRetryConclusions` 和完整 LC6 failureSubject。完整 read 尚未成功、任一解释不可用时，不建立绑定、不开始 runner。现有 `readAttempts` 只返回主体值，不能在它返回后再读另一尾来补证据；主线需在生产主体的同次调用中暴露以下消费者绑定，尚未实现或采用。

| 候选组成 | 精确含义与检查 |
|---|---|
| 创建输入 `{prefix, callId, subject}` | prefix 是真实 full-read 返回的 owned SettlementPrefix，持 binding.session/tenant/generation、完整 entries、tail；subject 是同一次生产结果的完整捕获值。构造者再次对同 prefix 的发出序列、最近失败 cause/statusCode/inBand、profileSnapshot、全部 retryConclusions 逐值核对；不能让调用者交一个 verified=true 代替。带 Run 的来源还必须由 runtime 自己核原 Run/attempt 归属。 |
| 传给 runner 的 `verifyFailure(subject) → {authoritativeSubject} \| {invalidInput:true} \| {unavailable:true}` | 闭包固定 session/tenant/callId 与原 prefix，不从可变 registry 找 latest；核当前调用绑定的会话、租户、调用身份完全相等，核提交者 subject 与捕获的完整 subject 精确相等（数字值、所有字段、数组次序、重复条目）。不等为 invalidInput；已 release、绑定代际不再当前、日志 owner 失去可信读取/使用权为 unavailable。成功交回捕获的完整 authoritativeSubject，runner 用它构造贡献者输入，绝非布尔许可。 |
| 生命周期 `release()` | 由创建绑定的调用者持有，finally 在 runPass 完成/取消/不可用收场后调用；幂等关闭使用权并释放 prefix 引用。runner 只持此次调用的引用，不自行延长到下一次经过；replay/下一次 dispatch 重新合法取得所需输入来源。创建中途失败立即释放已取得资源。prefix 不持存储锁，普通新追加不使旧前缀变假，不做“尾未变才 allowed”的自造守卫。 |
| 与最新守卫／写入的关系 | 这个闭包只证明输入历史来自同一次完整读取，不许可再次发送、不证明 Run 未终结、不保证此刻 tail 相同。canDispatchAgain、尝试 fence、runtime 响应 tailEquals 各用自己已定边界；不把核输入与后续 runner 写包装成跨 owner 原子事务。 |

`verifyFailure` 的调用身份绑定由本次服务适配器在进入 runPass 前核 manifest→session/tenant，并将 callId 从 subject.dispatches 一致核出；公共函数消费者须显式提供同等来源。闭包不由不可信主体自带，不接受跨调用复用或前缀数组重封装。实际创建者、release 的物理宿主以及 runtime 何处交给消费回调须由主线在 runtime 节点显式采用；这里不冒充该包已有 API。验证要把第一前缀的 subject 与第二前缀的历史、另租户、已失效 binding、缺一条同值 retry 分别混接，确保失败；普通追加使 tail 变大但原输入未变则仍可核输入，再发仍过最新守卫。

## 控制、默认重试与 noRun 边界

沿 v3：校验输入→真实链／同版本正文→读取结论前缀→逐件判在场→短生命期句柄→直接 await→使句柄失效→形状／权限／能力判定→写前再核取消、实例及 LC6 modelCallId→提交→确认才继续→完整提醒→效果。`replay` 始终只读，缺提醒的补写只发生在重复 `dispatch`。`earlier` 仍是本经过的先前结论，不能替代跨经过 retryConclusions。

P-5 归 model-request-runtime 的独立贡献者：必需 inject 候选登记面，依 RT9 S-67 精确名 `omne-official:default-retry` 注册；出厂 power/rewrite、onError 缺席取 record。登记返回注销闭包包入贡献者 effect，重复同名使该登记者启动失败，runner 不覆盖已有贡献。runner 不 inject P-5，贡献缺席按 S-17 指定 fallback，不让整个 runner 消失。默认件适配仅将完整 subject、显式 `RetryBackoffPolicy`、uniformSample 和 decorrelated 所需 previousDelay 交已有 `decideRetry`；策略取实际 runtime 设置与采样来源，缺静态必需配置启动失败，动态来源不可读报告该次不可用。不得硬编码 n、等待时长、重试次数、初始 previousDelay 或偷偷读另一份历史。P-5 当前只见纯决策函数，登记和来源适配仍未实现。

自定义与默认件返回 retry 都先经 LC6 校验再问真实 `modelRuntime.canDispatchAgain`：allowed 才提交；refused 的实际 why、alreadyEnded/callNotFound/wrongPhase 按 S-14/S-26 原报错策略（没有 why 不编）；unavailable／invalidInput 分别同名退出且本件无新结论。提交后仅返回原 effect，调用方显式等 plan.after，再调 `dispatchAgain` 重新过实际守卫与当前输入最终门。已开口、partial、interrupted_mid_reply、failed、runtime_lost 等全部沿 RT9 原联合分支，不能将“模型请求没 complete”一律变成失败重试或将恢复续接计为默认件结论。首内容已交付时，即使违例贡献者给 retry 也必须零第二次发送。限额／凭据／停止导致未发不删除已给 retry。

**RUN5-G1：noRun 输入边界已明确，不是可绕过的服务限制。**Runner5 S-21①②及 LC6 S-11 都不允许 noRun after_model_call。公共 runPass 调真实贡献者必须产生合法 ExtensionInput，因此该输入在函数和服务面均 invalidInput、零 invoke／零新条目。现有 noRun demo 不能据此升级为真实 runner 重试闭环；不补假 Run、不放宽 Schema、不把任意写入一条 Conclusion 称为执行过默认件。合法 noRun 组合限于 before_persist_message 的 user/system 及其嵌套经过。failure 的 codec、纯解释器及 composeEffect 可独立接受完整 LC6 值作纯构件测试；有 Run 的函数／日志测试可以明确提供受控 run/attempt 及栅栏前提，但这种测试不证明生产 Run 来源或完整服务纵线。真实 failure 服务闭环仍须主线落实 Run owner 与相关事实。

独立的 Run 终结缺口为 [run-attempt-facts/2 G-3](../../../../spec/capabilities/run-attempt-facts/v2/contract.md#十已知缺口) 与 RT9 G-28：尚无采用的 Run 终结载荷／读取键。它阻 withRun 响应 late、恢复和随之而来的完整服务纵线；不阻纯 Conclusion 编码、合法 before_persist_message 函数组合、既有日志壳尝试栅栏演练。`model_call_ended` 不当 Run ended。本节点不决定 Run 协议，亦不借 S-69 的完整尾比较掩盖事实解释缺失。

## 存储要求、交错与未知结果

本节点不选择数据库，不新增业务表；[session-log-jsonl v3](../../session/session-log-jsonl/v3-design.md) 与[恢复投影](../../session/session-log-jsonl/v3-recovery-design.md)是现有提供者。共享对象始终是**同一会话的已提交 entries、tail、判重键约束和 fence 判定域**；实际 JSONL provider 的权威提交文件是该会话 entries.jsonl，派生索引不是另一份事实。runner 只写 Conclusion／提醒，不写新尝试或 Run 终结；这些写者归 loop。runtime 写发出／响应／模型调用终结，全部经同一日志提交边界。

| 要求 | 条款与对端责任 |
|---|---|
| 完整结论、modelCallId、提醒副本同条目持久确认；判重与写同一步 | Runner5 S-10/S-11/S-53；SL3 S-8/S-13/S-14/S-17；日志 owner 承接既有 RL-1～RL-6；codec／真实组合由 runner 验证 |
| 已有 Run 写 fenced，嵌套写继承外层 fence；合法 noRun before_persist_message 组合显式 unfenced；每次明确 unconditional | Runner5 S-19/S-21；SL3 S-10/S-17。不得改成先读最大 attempt 后裸写 |
| 全读来源、壳与稠密位置可核；按键有序全返回，不可用可识别 | Runner5 S-22/S-53/S-54；SL3 S-18/S-19/S-34；按键 tail 不把局部读提升成完整前缀 |
| 实际消息使用 mrr/3 MessageId 共用键，完整值可认回 | Runner5 S-19/S-28；MS6 S-32；与 runtime [共同键责任](../../model/model-request-runtime/v4-log-codec-design.md)互指；不需另选数据库／引用约束 |
| withRun 响应对原完整 prefix 的 late 判定使用同 tailEquals 原子边界 | RT9 S-69/S-70；SL3 S-32～S-35；该响应提交归 runtime，runner 追加会推进同一 tail；G-28 未闭时不猜 late |
| 未确认提交可辨；旧物理写者停止后权威恢复；耐久内容不随 fiber 消失 | SL3 S-22/S-23，Runner5 S-28/S-34；宿主与日志 owner 提供停止／恢复准入，本节点保留未知任务责任 |

两条必须真并发演练的交错：X5-1，新尝试先提交→旧 runner fenced 写被拒；旧结论先提交→后续同锚读回它，不能按新 attempt 重给。X5-2，runtime 从尾 t 构 withRun 响应，runner 后提交 retry→runtime 的旧 tailEquals 零写并按自身规则重读；runtime 原批先提交→runner 后追加不能追改原响应 late。X5-2 在 G-28 未闭时只能以已解释的受控 Run 场景检验提交机制，不能签收生产 Run 认法。另测两副合法 noRun before_persist_message 函数组合同键竞争，胜方完整值认回；failure 的并发写使用明确有 Run 的受控前提，不能把前者的可执行性挪给后者。

未知 append 不叫 absent。调用 owner 在启动 read/append 前登记任务、稳定键与原完整候选，completion 的 unavailable 不表示物理停止；已入提交口的工作跑完，按该次提交收场，停止后不再推进下一件。读回与本次候选相同的原条目可认回本次提交；读回同经过同件的另一份合法竞争胜者，只能证明已有权威结论，应按 S-21②/S-28 采用胜者，不能冒称本候选已提交。两条路径关闭旧未知任务责任都还需真实旧写者不再产生效果。unavailable 后当次 dispatch 不交效果，新实例须在宿主旧写者停止与日志恢复准入后再决定缺席能否重算；不以超时、换 fiber 或本地锁判断旧条目永不出现。未知时不重新执行已确认最终件、不重发模型、不改 ID／at，也不把另一轮 alreadyRecorded／fence 拒绝当旧轮零写证明。

### 候选 runner 任务 owner 的最小端口

任务 owner 由**日志实际宿主**在装载 runner 前创建并保留到实际停止／恢复完成；它不是 runtime recovery scope，不由 runner fiber 的 dispose 删除。候选构造 `createRunnerTaskOwner({logBinding,diagnostics})` 只管理本 runner 的任务，logBinding 提供真实 SL3 公开操作与宿主代际；不拥有关闭共享日志的权利。

| 候选端口 | 所有权与收场 |
|---|---|
| `start({kind, candidate?, execute}) → {completion}` | 同步登记后才调 execute；kind 为 read 或 append，append 必带 prepare 后稳定的完整 entry、execution、键及绑定代际。completion 的返回或拒绝全部有人消费；确定成功/拒绝按 SL3 处理，无法确认的 append 转入 unknown 集合并保留原候选。读任务也持引用直到其 promise 结算。 |
| `closeAdmission()` | 同步拒绝新 start，并向当前经过发实例停止信号；不取消已经进入 SL3 的原提交，不删除 unknown。fiber 撤除首先调用它，然后撤服务与登记可见性。 |
| `drain() → Promise<void>` | 等待所有已启动调用结算；unknown 未经真实停止/恢复认定前不宣称排空，也不释放旧日志引用。非合作 provider 可使它不完成；不硬编码超时后成功。对外 dispatch 已返回 unavailable 与宿主仍持 unknown 可以同时成立。 |
| `reconcileStoppedLog(readRecovered)` | 仅日志实际宿主可调用；readRecovered 是该宿主在**完成旧日志物理 close/可信进程退出并通过原日志恢复准入**后持有的受控读取闭包，固定同 session/tenant 与被停止的旧绑定代际。它按原稳定键读取完整耐久值：结论条目与本候选同值时认回本次提交；不同时先核是否为同经过同件的合法竞争胜者，合法则采用该原条目，非法才 replayInconsistent。实际提醒 MessageId 同键异值仍按 S-19 为 replayInconsistent。来源不可读 unavailable，可信恢复后的确无记录才认 absent。不能由任意新 SessionLog 或 stopped=true 构造；没有可信停止过程就不调用此口。结果给后续重复 dispatch 沿原锚接续，不在 owner 内重跑贡献者。 |

**原提交认回与竞争胜者采用分开。**A 的候选 C1 追加结果未知，B 的候选 C2 先占同一经过／同一件的判重键，哪怕仅 at 不同，A 的旧写者实际停止后读到 C2，也不能因 C2≠C1 报不一致。恢复解释器核完整 runner/5 wrapper、LC6、共同会话/租户、位置/维度/anchor/name、与本次链的对应、modelCallId 以及合法 Run 壳；按原回放规则确认它是最终结论或对应 ask 轮次的合法已存条目。通过后采用 C2 全值（含其 at、提醒副本及原尝试壳），不把 C1 的字段混进来、不重跑该已最终决定的件、不补写 C1。一次经过跨尝试存续，不能要求胜者的 attempt 必须等于败方候选的 attempt。这个判法不证明 A 从未写入；未知责任仍在真实停止/恢复之后才收口。反例是错 anchor/件、错调用、非法壳、坏 LC6 或与真实链不一致，均为 replayInconsistent；独立的实际消息条目仍用 MessageId 同值认回规则，不接受异内容胜者。

这里明确了 runner 应实现的任务登记/留存，以及日志宿主必须承接的物理停止/恢复接口。**现有宿主没有 runner 的受控恢复绑定**，因此 RUN5-G5 保持为组合缺口；实现者可先交独立 owner 的已知结算与未知留存测试，不能用 mock readRecovered 的成功冒充生产恢复。跨进程旧写者停止仍按 SL3 恢复准入，不以本 owner 的内存状态替代持久事实。共享日志还有其他 owner 时，宿主先统一关闭所有消费者准入，再调用实际日志的 close 等待其物理任务停止／关闭，按日志恢复准入重新读取，调用本 owner 的 reconcileStoppedLog，最后等待本 owner 的 drain。不能先 await 一个仍在等 unknown 的 drain 再启动消除 unknown 所需的日志 close，否则会形成循环等待。runner 无权单独提前关闭共享日志。

## 依赖与装卸配对

保留一条 runner fiber，只必需 inject 日志；链读面、modelRuntime 守卫、toolAdmission、租户／环境解析调用时取。实例内存只持登记、调用句柄和在途资源，不持权威重试次数。不存在隐式 latest fallback；实际可用性与配置错误区分。公开函数面不依赖 Cordis，独立构件可替换；服务封装必须复用同一个 runPass。

| 取得的贡献／资源 | owner、可用时点与部分失败收口 | 撤除、交接与保留 |
|---|---|---|
| runner 两个服务面、实例准入与必需日志引用 | runner 实例；配置/端口齐备且依赖 ACTIVE 后公开；发布中途失败先关准入、撤已提供面、关闭已建 owner | 同一组合清理关闭入口、触发实例停止、撤登记可见性；runner 自身撤除不能写成所有实现突然不可用的结论；旧提交／未知任务仍有人持有 |
| 系统件／命令执行器登记 | 各贡献者；成功登记后可查；注销精确 contribution identity，不删后来的替代物 | P-5 等注销自己的代际；在途引用代际变化按 S-34 报错；已提交 retry 不删除，不给新实例重跑资格 |
| 每件只读日志／执行环境句柄及调用信号 | runner 调用 owner；只供当前件、当前会话；失败立即失效已建句柄 | invoke 返回或取消即失效；迟到 resolve/reject 均有消费和脱敏诊断；外部工作资源和实际停止归实现贡献者，不宣称 abort 使其静止 |
| read/append 任务、未知候选及日志使用权 | runner 的长期 owner 在任务启动前留存；runner fiber 只是该 owner 的使用者；宿主需在装载前持有 owner 直到实际停止／交接 | close 关准入并收已入提交口任务；unavailable 返回不允许丢 owner；日志真正关闭／重开归日志宿主。未发布资源或迟到返回同样收口，不借 D-105 runtime recovery scope 代持 |
| 完整 prefix 读取权、发号／时钟、策略源、稳定锚、调用方身份 | **归装配**；共享真实会话日志与租户来源、P-5 政策和随机源在装载时明确，缺静态配置启动失败；调用期不可读具名失败 | 不以撤 fiber 删除耐久事实；存储、完整读取、唯一恢复与旧写者停止承接到实际宿主；当前没有新增完整纵线 assembly 节点 |

上游依据逐条沿 basis：[async-control-not-bail](../../../../basis/cordis/async-control-not-bail.md) 支撑直接 await；[inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md) 支撑只 inject 必需日志；[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 支撑日志换代重跑；[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) 要求组合收口；[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md) 支撑启动配置错误政策。五条为 4.0.4、有 probe。本稿没有重跑 probe。

“撤除开始先于贡献者注销可观察为非 ACTIVE”的精确时序仍是**待核对主张**，现有 basis 不承载；需按 source-check 取证并做 V5-8。实现必须用宿主可调用的准入关闭及检查点，不把 Cordis 自动取消在途当保证。共享日志不受 runner disposer 直接关闭；没有可靠宿主 owner 留存及实际停止的装配，unknown/restart 生产验收受阻。跨进程时 full-prefix 来源、身份核实、登记代际和写权交接均需协议承接，isolate 不代替租户授权。

## 关键选择与缺口

| 选择 | 落选方最强论证 | 本方弱点、置信度 |
|---|---|---|
| 保留一 fiber／两服务面、函数与服务同一循环；不拆 retry runner | 分开可让默认重试单独交付，故障域较小 | 完整处置面较大，测试需覆盖非 retry 分支；高，重复循环会破坏先落后算与回放一致性 |
| 日志必需 inject，其余现取；P-5 反向登记 | 全部 required 可更早暴露缺接线 | 运行期每件要区分缺席与错误，授权仍归装配；高，符合 S-4/S-17 的缺席处置 |
| Conclusion 独立 runner/5，提醒复用 mrr/3 公共 codec | 全部放 mrr/3 可少一个 decoder；每 owner 独立消息键可少静态依赖 | 两域必须同 prefix 正确相容，新增静态 runtime 包依赖；中高，既有 mrr 类别不含 Conclusion，消息独立键会破坏共享唯一身份 |
| 纯解释器接既有完整 prefix，runtime 组合主体 | runner 全包生产 failureSubject 可少装配接线；自存计数读更快 | 真实性只能由权威读取／装配保证，有 RUN5-G3 接线工作；高，单一日志来源且不反向吞 runtime 责任 |
| 显式初始主体参与效果合成；不从结论反推 | 少一个参数可沿旧签名，已 rewrite 的链看似有足够内容 | 消费者须保留原主体；高，空链与全 observed 没有原主体可推导，S-15 必须交完整 proceed.subject |
| 调用级闭包固定原 full-prefix 与完整失败主体；不新读 latest | runner 自读最新日志接口更简单，不需生产回调 | 创建与释放须跨消费者接线，暂缺真实宿主；中高，来自两个尾的混合事实不能证明同次来源 |
| 保留停止后未知任务 owner，不把不可用当零写 | 立即释放可避免坏实现长期持资源 | 真实不静止会阻回收，需显式政策与宿主留存；高，资源释放不能丢已发生效果 |

| 缺口 | 精确条款、受阻消费者与闭合 owner |
|---|---|
| RUN5-G1 noRun 准入边界 | Runner5 S-21①②、LC6 S-11 均禁止 noRun after_model_call，函数/服务都拒绝。该规则本身明确；受阻的是把 noRun demo 当真实 runner 重试消费者的交付路径。纯 codec/历史/效果构件和合法 before_persist_message 继续；主线须提供合法 Run 消费者，不以函数包装绕开 |
| RUN5-G2 当前 provider 技术采用／实施与证据 | S-10/S-19/S-21/S-22/S-53/S-54；本稿、runner/5 wrapper/键与 SL3/RT9/MR8 显式升级待独立 review 和主线采用，源码尚无。阻声称真实 runner 已交付；owner 主线／runner 实施者 |
| RUN5-G3 同 prefix source 组合与接收交接 | S-53/S-54、RT9 S-34/S-76；runner 只供纯解释器，本稿已给调用级捕获值/校验/释放端口；runtime 同次生产交接与宿主授权尚待实际接线采用。阻生产失败主体／真实 failure 组合的端到端签收；owner runtime＋实际宿主 |
| RUN5-G4 P-5 贡献及政策来源 | S-7/S-14/S-26、RT9 S-35/S-60/S-67；纯 decideRetry 已有，真实登记、有效设置、采样与 previousDelay 适配未建；owner runtime／装配，阻默认件真实登记注销与策略链验收 |
| RUN5-G5 撤除时序、未知写与宿主 | S-33/S-34、SL3 S-22/S-23；basis 精确时序待核对，本稿已有 runner owner 端口与 unknown 留存边界；旧写者实际停止／受控恢复闭包需真实接线与证据。D-105 仅拥有 runtime；owner runner／kernel-basis／日志宿主 |
| RUN5-G6 Run 事实及既有完整控制缺口 | RT9 S-69/G-28、run-attempt-facts2 G-3 阻 withRun late／Run 终结；Runner5 G-1/G-8 的锚和取消／终态交接、G-16/G-17/G-19/G-20 的工具／卡片／环境责任仍由原 owner 闭合，不用假 Run、测试种子或两个布尔值冒充生产来源 |

验证义务与实际检查见 [verification](verification.md#v5-当前投影验证义务)。新增 bindings **0**；旧 Runner/FailureHistory 有限模型只作规格证据，不能绑定为本节点实际实现或完整 prefix 来源证明。
