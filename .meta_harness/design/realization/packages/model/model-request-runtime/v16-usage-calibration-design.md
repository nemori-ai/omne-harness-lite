# Runtime 输入观察校准实施映射

2026-09-29，revision 1，**candidate；未接受、未实施验收**。本页是已有节点的窄增量，新增 bindings 0。只映射 [MR9](../../../../spec/data/model-response/v9/contract.md) S-41～S-45 与 [RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S-54/S-57～S-59/S-74/S-77～S-83；其余十三操作、授权、取消、共同提交及恢复责任沿原契约。本页中的新增类型、成员、端口和实现分工均为**候选**，不是已发布 API。

## 输入与边界

[catalog](../../../../registry/catalog.json) 中 MR9、RT10 均为 candidate，不能把独立评审或有限模型通过当接受。依据是 [U0 revision3](../../../../record/proposals/model-input-usage-calibration/design.md) 及其[施工简报（已外置）](../../../../record/evidence/2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)。候选精确字节如下；正式接受后须由主线核对采用范围，不能自动跟随同名文件改动。

| 输入 | SHA-256 |
|---|---|
| MR9 contract | `fc4fe5f8092f1abff7efa6b27a228f7321575c5de8205c58de8ee8106ad3ebda` |
| MR9 Schema | `f282244688fa9442787b94f11c02444923843c8d8ae471d323e42792c8ee457c` |
| RT10 contract | `add7ff23a73a6ad5a749f40f6707f408f60d33b6032080ad6ba4751f10d5695c` |

承接 [v7 公共施工面](v7-current-design.md)、[v8 当前 codec](v8-current-codec-design.md)、[v9 估算政策](v9-token-estimate-design.md)、[v10 组合 owner](v10-owner-assembly-design.md)、[v12 时序](v12-recovery-timing-design.md)及[恢复留存](v12-recovery-owner-supplement.md)、[v14 冷宿主](v14-cold-demo-host-design.md)、[v15 观测](v15-diagnostics-demo-design.md)。保留 D025 的 [Cordis 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)，SL3 抽象与既有 JSONL 提供者；不新增 plugin、fiber、service、数据库或计量真值 store。静态必需配置非法仍启动失败；函数显式输入非法沿 malformed，构件不可用沿 unavailable，业务缺凭据仍是既有具名失败。

源码已有 `types.ts`、`invoke.ts`、`service-calls.ts`、`service-dispatch.ts`、`response-construction.ts`、共同 log codec、reconcile 与 example 消费者；本增量尚未接通。纯 `invokeModel` 与 plan 不要求 Cordis、tenant、session、log；P-2 服务是这些公开构件的消费者。完整 compaction、真实 Run/Loop、十三操作缺口与 G-36/G-37 不在本页被补造或关闭。

## 契约责任到实现

| ID／责任 | 公开面／Cordis 落点 | 实现与版本 | 验证与边界 |
|---|---|---|---|
| U16-P1：MR9 S-41～S-44；RT10 S-79 | root 类型、计划输入与结果 | `types.ts` 引入 core 唯一 InputCalibration 等六类值；本节点只定义组合交接与 InputMeasurement | U16-V1/V2；无同义 durable DTO |
| U16-P2：S-57/S-74/S-77～S-79 | `TransportAdapter.plan`；原固定贡献 lease | runtime 给显式来源，transport 实现唯一最终输入投影与 full/φ/δ；结果固定 requestInput/measurement | U16-V3/V4/V10；send 必须消费同一计划 |
| U16-P3：S-54/S-58/S-59；MR9 S-42 | `TransportAdapter.read` → `invokeModel` | reader 单一 final facts；invoke 不解读 opaque R/raw；组合自有 InputCalibration 快照 | U16-V2/V5；取消不等待未来 usage |
| U16-P4：S-77/S-80/S-82 | P-2 openCall、dispatch、dispatchAgain；受控历史读面 | 从原授权读前缀和实际选入链选最新可用准确祖先，交纯 planner | U16-V6/V7；非全局 last response，无权限不降级 |
| U16-P5：MR9 S-45；S-17/S-49/S-75/S-81 | Pending、settleReply、失败／中断结算 | 事实从调用 owner 到原 `[M,R]`／R 批，原 JSONL 条目、尾、keys、fence 同提交 | U16-V8/V9；unknown 不发布可复用事实 |
| U16-P6：S-33/S-36/S-81 | reconcile、原 owner、当前 log codec | 原批原值读回／重送，冷恢复不加载新 meter 来改旧值，readAttempts 全字段返回 | U16-V8/V9；实际停止先于释放 |
| U16-P7：S-63/S-79；S-83 | 现工程 log/trace 与 example 消费 | mode／依据／贡献／回退／耗时，与实际 usage/cost 分开；中英公共 README 实例 | U16-V10～V12；不建正式 acceptance app |

## 唯一公共接口账本

本节是 runtime 所有的候选语言绑定。core 节点独占 `CountingBasis`、`RequestInputEvidence`、`ObservationProvenance`、`ObservedInput`、`OutputGroupEvidence`、`InputCalibration` 的定义与片段校验；从 `@omne-harness-lite/model-response` root 导入。transport 引用本节，不再定义同名接口。现有 Usage、ContentBlock、JsonNumber 沿各自 core 权威入口。

| 公共面 | 候选增量与责任 |
|---|---|
| `PlanInput.calibration`（必填） | 可辨识联合：`{kind:'none', reason:'no_observation'|'source_unavailable'}` 或 `{kind:'observation', inputCalibration, usage, outputBlocks, replaySelection}`。observation 提供原 MR9 自有值、原 Usage、与原 outputGroup 对应的全部实际保留块。函数调用者合法取得来源，不需伪造响应 ID、tenant 或 session。`none` 不能遮盖坏表示或必需服务事实不可读 |
| `replaySelection` | readonly `{sourceBlockIndex, messageIndex, blockIndex}[]`，分别定位原 outputBlocks 与当前 messages 原块；非负整数、源索引合法、目标不可重复归属。transport 从最终投影核映射内容与转换；不是 caller 声明即可信。未选择的原块不凭 aggregate usage 分摊；不能映射的实际输入仍须归 N 或使 φ 不可判而全量 |
| `PlannedSemantics` | 必填 `requestInput: RequestInputEvidence`、`measurement: InputMeasurement`，与内部不可伪造的固定最终 body 同源。known 前缀覆盖这次完整最终输入，boundary 是投影单位数，不是 log seq。此证据表示计划值，不能证明已发送 |
| `InputMeasurement` | 本节点唯一技术结果：`mode:'full'|'marginal'`、可选 `fallbackReason`、`precision:'exact'|'upperBound'|'estimated'`、`predictedInput`、`admissionTokens`、`basis:CountingBasis`；marginal 另有 `replayContribution` 与 `newContribution`（各含 signed JsonNumber tokens 与 precision）。full 只有 `fullContribution:{tokens,precision}`，其中 tokens 非负整数，不编造 φ/δ。两模式用互斥联合表示；精确数运算不得经 JS number 丢精度 |
| `StreamEnd.readFacts`（所有终态必填） | 同一显式 `{usage,cost,observedInput:ObservedInput}`，owned immutable；事件序列可仍包含 account，到最终结果必须由同一 reader facts 累积器交接，不能成为另一权威。已知 serving facts 与原 rawHeaders 保留原来源规则 |
| `TransportAdapter.projectOutput` | 公开纯构件 `(planned,{blocks,source,completeness}) → {projected:OutputGroupEvidence} \| {invalidInput:{reason:'malformed'}} \| {unavailable:true}`；source/completeness 值域沿 MR9，输入来自本次实际保留块。固定 transport 实现及 projectionRevision 产生顺序 block digests，runtime 不实现第二套编码/摘要。成功载荷只沿 core；构件失败不等于已产生 durable unavailable 事实，写方须按实际未留存等事实判别，不能把任意抛错当有效证据 |
| `ModelInvocationResult.inputCalibration` | 必填 InputCalibration；所有正常／失败／取消结果同形，不靠 outcome 推定完整统计或 G。与 actual usage 分开，无服务身份也可单取用 |
| `InvocationObservedFacts.inputCalibration` | 必填自有值，保留已知 request/observation/output 部分；原句柄停止后的事实读取时点不变，不新增查询上游的旁路。未取得的各分量分别按 MR9 unavailable 原因，不能让一项未知擦掉另两项已知 |

组合交接调用 core 候选 `copyInputCalibration(unknown)`，将外部值转成无损深快照；这有实际所有权意义，不能仅 readonly/浅冻结。片段复制只判片段自身形状/局部相等；最终 response/Pending judge 才判 usage、route、blocks 的跨值关系。服务授权、祖先真实性、摘要来源由相应写方验证，不挪给 core。

InputMeasurement 的回退原因保留 S-77 四个来源／失效诊断：`source_unavailable`、`no_observation`、`prefix_changed`、`basis_changed`，两者并存按原优先级；前两项不是第三种失效。φ/δ 的不可判在既有规划诊断中单独标明构件原因，不能伪装 prefix_changed。没有回退的首次 full 也明确 no_observation；来源 malformed 是拒绝，不写成正常 full。

### 计划与计量执行

`service-calls.ts` 的首次 plan、`service-dispatch.ts` 的 dispatch/dispatchAgain planInput 和独立 invoke 一起迁移；不留旧参数重载或不传 calibration 的兼容路径。输入、配置、定义与来源证据在异步前自有捕获；实际获得的 transport lease 固定本次 projection、meter、reader、projectOutput，热更不能把其中一项换成新贡献。

transport 拥有完整最终输入的单位／envelope 编码、basis 和兼容证据判断；runtime 不另写 tokenizer、摘要、角色映射或签名长度估算。原观察的 P 与 envelope 摘要须在当前最终输入实际位置逐值核合；实际新请求为 P、实际选入 G 与其余 N 的无遗漏、无重复覆盖。全部图像、tools、system、模板与 bytes 限额仍检查完整请求；线性序列化和摘要允许，核验不得再次 tokenize P。replaySelection 只定位原块，不能授权删除/重排 P；这仍 prefix_changed。

已知 I 从原 Usage 或 upstream_total 的合法分支取得；不读上一轮 predictedInput。只有投影／basis 关系及 φ/δ 都可解释才走 marginal；两项有符号贡献与 I 相加，最后须是非负整数，再沿 S-74 对 estimated 总量仅一次应用 tokenMargin，准确／有据上界分支保持原规则。estimated 不能升 exact，输出预算不加进输入统计，O/reasoning 不自动当 φ。某项不可判或总量非法走完整 meter；full 仍不可判沿 input_size_unavailable，限额拒绝原样零新锚点、HTTP、响应、终结。所有失败守卫、身份检查与取消优先级保持前身；新增计量不抢先泄露未授权来源。

plan 返回的 body 及 requestInput 必须来自同一次最终映射。dispatch 前实际 messages、tools、参数、margin、精确组件或来源变了就重 plan，再按原提交协议写 dispatched；不能复用 caller 的 passed 标志。纯调用可重复 plan，但仅一次获准 plan 的原值进入 send。新准确观察替换预测基点；缺 usage 的回合不推进，下一轮仍用更早合法祖先，后续所有未覆盖输出和输入归 φ/N，不能漏掉中间回合。

## 服务的授权来源选择

在现有 `CurrentHistoryReaders` 增加候选 `calibration` 受控纯读/组装端口；输入为已授权的完整 `SettlementPrefix`、本次实际选入 messages 及其原读源关联、目标固定 binding/投影。此端口不另读全局日志，不接受“已授权”“同分支”“兼容”的裸布尔。服务先沿既有 session/holdingTenant/日志绑定核权，再把同次 prefix 和投影交给它；真正需要异步读的来源通过原 session 读面取得，不能藏在纯 plan 内。

该端口输出为自有候选序列或明确 `sourceUnavailable`/`noObservation`；必要当前调用／日志值不可解释则沿服务 unavailable。每个候选带原 response 定位（原日志身份、entry/顺序定位、ResponseId、call/dispatch/attempt）及完整原响应、相关原 reply/delivered blocks 和其映射。原读源关联必须可用 prefix 中原条目、原 ModelRequest 及实际 message.response 关系核对；原 response 与 reply 的关联、分支先后关系逐项核验，不能凭同 seq、时间戳或字符串模型名成立。序列按**实际被选择的因果祖先链**排列，不能将物理到达顺序当因果顺序。

来源解释 owner 是现历史读面提供者；runtime 同时核每个定位确在本次已授权 prefix、response/reply 同值、原请求与选入映射相符。来源解释不能证明 branch/顺序时返回 sourceUnavailable，而不是虚造一条链；纯 shape judge 通过不能替代此检查。候选完整值 malformed 或必要 durable facts 无法解释时服务失败，不伪称“没有 observation”。公开独立调用不要求这些服务定位，来源合法性由它自己的调用方承担。

对真实祖先从新到旧找可用准确观察，并由固定 planner 复核 P/θ 和实际 G；较新但缺 usage、response_cache 或不能对应所选输入的响应不遮掉较早合法观察。选中后必须实际用于 marginal（满足 S-82 前提时），不能每次丢掉来源永远 full。没有合法观察为 no_observation；关联无法证明为 source_unavailable；已经明确拿到的候选在当前输入 P/θ 失效沿对应原因 full。不能为了命中找到不同分支旧响应，也不能在 prefix/basis 失效后偷偷宣称精确。

当前 `examples/model-invocation-minimal-demo/src/model-request-text.ts` 已解码完整前缀并核 `[M,R]` 配对，是 noRun 顺序历史来源的真实接线处：扩展同次解释以返回消息来源与候选祖先，不从终端文本或累计账单重建。用户更换模型、系统提示、tools、删改/重排消息后复核实际最终输入；不删除图片/工具块以方便校准。带 Run 的真实分支解释仍由其原 owner 提供，缺席只让相应来源不可用／原操作具名受阻，不假造 Run，也不新增完整分支管理平台。

## read、invoke 与实际停止

reader 在实际解析到统计事实时立即归一化并保留自有快照；usage、cost、observedInput 来自同一个累积器。三个互斥输入分项齐全用 from_usage；缓存细项缺而同次完整 prompt 总量可证用 upstream_total；冲突保留原 usage，observedInput 为 inconsistent_usage。response cache、统计范围不明、缺事实分别如实 unavailable；provenance 只记原始已知字段，不能拿请求模型/provider 填实际返回值。敏感上游回显沿现按来源脱敏政策，不因字段名叫 requestId 或 model 而豁免。

正常、协议失败、解析失败和取消均由 reader 控制路径交一次 StreamEnd.readFacts；reader 捕获已执行读取的故障并据已冻结事实收尾。invoke 使用显式 next 驱动并消费终态值，不能用忽略 generator return 的 for-await 处理丢掉 final，也不能在装配拒绝或 abort 时直接 generator.return() 跳过交接。拒收后停止外发增量，按既有取消路径请求实际资源停止，允许 reader 从**已知事实**完成其本地终止交接；不是继续等上游自然 EOF，不等待未返回的 usage，不延长原超时/取消政策。

reader 及网络 owner 必须在 abort/error 时终止实际读取、释放响应资源并完成其同一次停止 Promise；invoke 保留原 lease、秘密引用和任务 owner 到这些工作实际停止。取消与终态竞争仍只有一个 final；final 返回不替代 socket/reader 的 actual-stopped 证据。取消后的合法已知观察保留；取消前后从未实际解析的未来统计保持未知。构件遗漏必填 handoff／非合作抛错是既有本地提供者故障，不伪称上游 missing_usage；由 reader 保有的已知事实须随受控故障终态交出，不能增加另一查询接口补救。实现无法兑现时阻断该构件交付，不能默改契约。

invoke 用固定 requestInput、read 显式观察和实际保留输出构成 InputCalibration。输出摘要经同一固定 projectOutput，`source` 由结果真实 reply/delivered/none 位置决定，`completeness` 来自实际保留范围，不看 HTTP/outcome/output_tokens 猜测。Pending 的 G 先对应它实际携带的 blocks；结算只改变身份关联，禁止通过过滤、修剪后仍保存旧 G。若既有收场选择保留范围与调用结果不同，结算在原 lease/证据仍可用时对**实际保留块**调用同一纯投影并捕获最终原批；一旦批形成/写入未知，不再重算。MR9 允许 I 已知而 G partial 或 unavailable，不能连带擦掉 I。

发送未执行与发送状态未知按各自已知来源映射 not_sent/send_unknown；known requestInput 本身不证明 sent。普通公开结果及 Pending 仍要求实际 sentAt；MR8 的 interrupted 可空路径保留，不能用 sentAt:null 推断未发、零费用或可重试。某字段不可取得不是其他字段可填零的理由。

## 耐久批、共同对象与恢复

根 codec 接受 MR9 必填 inputCalibration，`ModelLogResponseProjection`、capture/inspect/encode/decode、responseConstruction、Pending 与 readAttempts 全部保真。继续现有 `mrr/3` 键与封装；值判定根迁到 MR9，不新增 MR8 reader/别名/猜版。旧形状缺字段明确不可解释，不补写或修改用户原目录。当前 MR9 的精确 Schema 闭包由 core 承载，冻结必要旧 Schema 仍是当前依赖资源，不能把它当旧执行格式重开兼容。

共同耐久对象是既有 **SL3 JSONL 同一日志的 entries、tail、readKeys/writeKeys（含 ResponseId/call-dispatch 稳定键）与 session fence**。runtime 结算写者、外部 settleReply 写者、reconcile 恢复写者和日志提供者围绕原同一批及这组对象认回/排他/比较：inputCalibration 在原 R payload 内，与原 M 同一个 append 原子批；不另写 calibration 表、sidecar 或第二次事务。只读观察后在别处写“可复用”标志不满足同提交，不引入这种标志。

存储要求沿 SL3：原批持久与原子可见；稳定键唯一/认回且异值冲突可辨；entries/tail/keys 同前缀快照；原 fence 约束旧写者；unknown 与确定未写可区分；合法全前缀可读且不可用具名。此节点没有新跨库约束。日志 owner 对这些已有能力继续负责；runtime 对原值、批身份、owner 留存负责；示例/宿主对恢复入场、真实旧写者停止与授权绑定负责。

交错 A：T1 形成含校准的 `[M,R]`，append 已耐久但回执丢失；T2 用旧尾读不到，不能将 T1 的进程内事实选作 durable source，不能释放 T1 owner 或重发模型；经原恢复权限读回同批后才可使用该事实。交错 B：T1 未知写仍可能落盘，T2 新 meter 已热更且恢复请求到达；T2 先核真正旧写者状态及稳定键/尾/fence，在未静止时保持 unknown；静止后重送原批或者认回原值，绝不以当前 meter 修改原 I/G。两种交错均由 U16-V8/V9 在真实 JSONL/多进程观察执行，进程内 mutex 不是其证据。

unknown 原 owner 保留完整 batch、lease 与未停止任务；原批认回不能提前释放尚未停止的原网络/回调。冷恢复只加载现有 log/codec/恢复入场所需资源，原 MR9 payload 可直接验证和认回；不用凭据、不发 HTTP、不运行新 tokenizer/projection 来复原历史。若原事实丢失只能沿原恢复允许的未知记录构造，各分量如实 unavailable，不能从旧预测补 I；已经存在的原完整批绝不换成补造结果。

## 装卸、观察与消费

| 阶段 | 取得与 owner | 失败／撤除收口 |
|---|---|---|
| 构造纯函数/固定适配 | 显式参数与固定组件；无注册、IO 或隐式当前状态 | 表示错误立即拒绝；同步派生值随调用释放 |
| P-2 装载 | 复用现 session/log、transport acquire、历史解释依赖；计量不增加 inject | 必需依赖/静态配置不合法不发布服务；局部初始化失败沿原组合 close |
| 调用取得 lease | 原 call/dispatch owner 持固定 adapter 及完整计划/事实快照 | 新贡献只影响新取得；旧贡献撤除仍由原 owner 跑完或显式取消，实际停止后释放 |
| 批 unknown/恢复 | 原 unknown owner 持有原完整批和写任务，宿主恢复 scope 持 admission | 原停止/认回/冲突完成条件不变，不因有 measurement 就完成 close |
| 示例关闭 | 原业务停接纳→owner 收口→诊断关写；读面仍按原寿命 | 不抢关日志或 sink 掩盖未收口任务；冷宿主无模型准备也能恢复 |

上游生命周期依据仍是 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)、[inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)；均沿已存在 probe，本页不新增 Cordis 行为主张。源模型/provider 的准确口径、φ 边界及真实兼容证明由 transport G-37 核验，未经证据只能 estimated/不可判，runtime 不从厂商名称推导。

沿 v15 的同一工程诊断 schema/collector 增补规划阶段属性：mode、fallbackReason、basis、precision、predictedInput、admissionTokens、各贡献、计量耗时与已核来源关联；不要把全文 P/G/N、签名、原响应体、凭据放进日志。诊断不写回会话业务日志，sink 失败不改变请求结果。公开纯 planner 的返回自带 measurement；测时由调用边界显式时钟/诊断 owner 承担，不把系统时钟藏入纯函数。真实 usage/cost 保持独立来源，累计账单绝不使用预测输入量。

demo 继续归 `examples/model-invocation-minimal-demo`：完整多轮/流式输出和累计账单沿当前实现，增加显式计量模式/回退观察入口；更换模型后完整上下文送出并重核 basis，不清空会话。不建立 apps/model-request-acceptance 或新 realization/apps 节点。实现完成时 runtime、transport、core 各自 README/README_ZH 更新真实公开面；runtime 两个独立包消费者示例分别展示首次 none/full 和显式原观察/marginal，注明权威来源由调用者持有，代码须真实编译执行，不能只展示内部伪类型。

## 关键选择、取舍与缺口

| 选择 | 落选方最强论证 | 本方弱点／置信度 |
|---|---|---|
| core 唯一 durable 值，runtime 只组装 | 各层自定义投影可减少依赖联动 | 联动改类型面较广，但消除解析/持久两份语义；高 |
| 显式 calibration 与 replaySelection，固定 transport 复核 | 服务隐藏读最近响应可简化调用者参数 | 独立调用输入较多，来源责任必须清楚；保持零隐藏 IO，较高 |
| reader 一次 final facts，停止时交已知值 | 旁路读取 opaque 对象容易保住当前解析器实现 | 要重做 reader 终态交接与错误收口，但取消边界不扩大；高 |
| 当前日志祖先源加线性摘要，不加锚 store/Merkle | 持久索引/树可以降低长期扫描成本 | 长历史仍有线性字节扫描；先以百万量测确定收益，不能把现分词瓶颈换成未量测框架；高 |
| 当前根 breaking 迁移，原批不变 | 旧 reader 可直接打开旧本地目录 | 旧不完整事实明确拒绝，需测试目录不被改写；符合当前无兼容要求；高 |

- **U16-G1（MR9/RT10 全增量）**：语义接受与本节点技术采用待主线；本页不自行释放实现。四层状态不提升。
- **U16-G2（S-59/S-79）**：公共接口须 core/transport/runtime 同批迁移；真实 reader 的取消/错误终态、快照与包装后独立消费仍待实现验收。缺交接即阻该构件，不伪造缺 usage。
- **U16-G3（S-77/S-80）**：真实分支/选入来源解释由既有历史/宿主 owner 提供；noRun 示例线性前缀可实施，不能据此签收完整 Run/compaction。未知 ancestry 明确 source_unavailable；必需原调用事实不明沿 unavailable。
- **U16-G4（S-81）**：真实 JSONL 并发、unknown 原批、旧任务停止、冷恢复及 lease 留存仍待验；有限模型不代实际 IO。
- **U16-G5（S-82/S-83）**：百万性能与原型有效性待本实现测量；G-37 各模型真实口径/φ 与 G-36 estimated 硬 fit 原开放项保留，不把本地边际性能当上游精确性。已知当前四条 Anthropic explicit/last_message 缓存路由逐轮迁移缓存标记，并可能改变 string/text-array 包装；完整 wire-message 投影可能每轮 prefix_changed 而 full。该范围必须实测并交 transport/主线判定性能目标是否满足，不承诺全部模型正常 append 已增量，也不自行剥 cache_control 冒称 token-neutral。

归装配的身份授权、真实读源、时钟/诊断、安全输入、旧宿主停止及冷恢复权限仍由既有示例/服务/日志 owner 承接；没有因此需要建立新的正式应用节点。所有新验证义务见 [U16 验证](verification.md#u16-输入观察校准实施候选)，均非已运行结果。
