# Runtime 多响应输出事实交接

2026-09-29，revision 1，**candidate，未技术采用，未实施验收**。本页仅接续
[v16](v16-usage-calibration-design.md) 的单输入锚接口与
[v18](v18-failure-execution-design.md) 的实际执行身份接线；不改两份已采用正文。
所有新增类型、字段与函数名均为**候选语言绑定**，不是已发布 API。

## 依据、边界与分层状态

精确基线为 `omne-harness-lite-design-2026-09-15`：
[MR9](../../../../spec/data/model-response/v9/contract.md) S-41～S-45 与
[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S-74/S-77～S-81，
两坐标在 [catalog](../../../../registry/catalog.json) 为 accepted；接受与 v16／transport v12 revision 2
采用归 [D107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)。
v18 采用归 [D106](../../../../record/decisions/runner-current-pure-provider-adoption/decision.md)。
需求沿 [PF-013 rev15](../../../../product/PF-013-model-profiles-and-invocation/design.md)。

本页兑现的已有性质是：MR9 S-43 的输出组不以准确输入计量存在为前提；RT10 S-78 的较早输入锚
之后所有实际输入及回复仍须覆盖；S-79 的 full／φ／δ 只消费显式原事实；S-80 的来源核验仍归服务。
本次是目标态设计的接口补足，不引入新领域对象、计量语义、十四操作、持久记录或存储。
领域性质沿既有规范，机制沿既有节点；本次不是重新进行独立双盲能力拆分。

| 层 | 本增量状态 |
|---|---|
| 语义接受 | 上述 MR9／RT10 已接受；本页不另作语义裁定 |
| 可实施 | 候选账本已明确；须与 transport 后继联合审查及主线采用，才释放迁移 |
| 绑定证据 | 新增 0；原 bindings 保持原范围，H19-V1～V10 是待执行义务 |
| 实际验证 | 尚无本增量实现验收；已有单 φ 接口与旧验收不证明多组 full／δ 已交付 |

节点与源码仍为 `packages/model/model-request-runtime`。复用现 P-2、公开 `invokeModel`、
`TransportAdapter.plan`、历史 reader 与固定 lease；不新增 plugin、fiber、service、inject 或数据库。
Cordis 采用 [D025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。
配置政策保持 v16：必需静态配置错误启动失败，显式输入非法具名 malformed，必要构件/来源不可用
沿既有 unavailable，业务缺凭据保持原具名失败。完整 Run、Session、compaction 与工具执行均外置。

## 契约责任到提供者

| ID／契约责任 | 插件／服务／操作兑现点 | 实现与采用基线 | 符合性依据或缺口 |
|---|---|---|---|
| H19-P1：MR9 S-43；RT10 S-79 | 公开 PlanInput 邻接输出事实序列，和单 PlanCalibration 独立 | root `types.ts`／v16；本页候选迁移 | H19-V1/V2；输入未知不得抹输出，非新 durable DTO |
| H19-P2：RT10 S-77/S-80；MR9 S-45 | P-2 同次授权 prefix 的来源 reader 与 authorizedCalibration | v16 来源选择＋v18 实际 target | H19-V3/V4/V5；不增加全局历史查找/来源认证标签 |
| H19-P3：RT10 S-79 | runtime 与 transport 的显式 owned copy | root `input.ts`、transport 原输入 copy；复用 core 片段类型 | H19-V2/V6；malformed 不变成空序列 |
| H19-P4：RT10 S-78/S-79 | 固定 transport 负责 full／φ／δ 的实际覆盖和模型适用 | transport v12 revision 2 及其待审后继 | H19-V1/V7；本节点不 tokenize、不实现模型条件分支 |
| H19-P5：RT10 S-28～S-30/S-80 | openCall、dispatch、dispatchAgain 与 public invoke 同步消费 | v16/v18 的既有十三操作，不改提交点 | H19-V6/V8；全部 PlanInput 构造面破坏性迁移 |
| H19-P6：MR9 S-45；RT10 S-81 | 原 `[M,R]` 批、reconcile、冷恢复读回 | v16/v18、原 SL3 共享对象 | H19-V9；无新写入、无回写历史、unknown 不发布 |
| H19-P7：RT10 S-79/S-80 | 现工程诊断和双语公开示例 | v15/v16；内容裁剪保持 | H19-V10；不把历史块或密文写进诊断 |

## 唯一公共接口账本

本节仅拥有组合交接类型。core 继续独占 `InputCalibration`、`Usage`、`ContentBlock`、
`Route`、`ModelAdaptationBinding`、`ModelRequestParameters` 等值定义；不复制其 Schema。
transport 后继引用本节，不自造同义源 DTO。

候选类型表达：

```ts
type PlanOutputHistoryGroup = Pick<
  Extract<PlanCalibration, { kind: 'observation' }>,
  'inputCalibration' | 'usage' | 'outputBlocks' | 'replaySelection'
> & {
  readonly origin: Pick<
    Route,
    'adaptation' | 'provider' | 'servingProvider' | 'upstreamModel' | 'parameters'
  >
}
// PlanCalibration 保留 v16 的唯一原定义，不新增第二种锚表示。
// PlanInput 新增必填字段；InvocationInput 继承同一成员。
// readonly outputHistory: readonly PlanOutputHistoryGroup[]
```

| 候选公开面 | 精确责任 |
|---|---|
| `PlanInput.outputHistory` | 必填、自有、顺序保留的 `readonly PlanOutputHistoryGroup[]`。空由调用者明确给 `[]`；缺席/undefined 不等价空。序列按实际目标中首个选入块的位置升序；不是按原响应物理到达时间排序。只含有实际选入目标且 outputGroup known 的组 |
| `PlanOutputHistoryGroup.inputCalibration` | 原完整 core 值；允许 requestInput unavailable、observedInput unavailable。outputGroup 必须 known；不能为满足此输入补造 known，原 unknown 不转成零或空 complete |
| `usage`／`outputBlocks`／`replaySelection` | 原同次 Usage、与原 G 摘要对应的完整保留块、这些块到当前 messages 的实际选入映射。完整块序列与实际选入子集分开；不可裁掉原块后保留旧摘要或用 aggregate 按块分摊 |
| `origin` | 从同一原 `ModelResponse.route` 逐字段裁取 adaptation/provider/parameters，及实际存在的 servingProvider/upstreamModel。binding 内 definition.modelId 是原请求模型；parameters 为原计划实际适配值。可选事实缺席仍缺席，禁止以当前模型/供应商/参数填补。不带 profile 引用、credentialScope、responseId、session 或 Run |
| `PlanCalibration` | 原 v16 none/observation 联合不变。它仍只承担候选输入锚，不能因为缺 I 而代替输出事实序列。锚可存在而 history 空，锚可缺而 history 非空 |
| `AuthorizedCalibrationResult` | 原成功形态破坏性增加字段为 `{calibration: PlanCalibration, outputHistory: readonly PlanOutputHistoryGroup[]}`；失败保持 `{unavailable:true}`。不引入持久结果或新业务错误 |
| `CurrentHistoryReaders.calibration` | 原签名及 `CalibrationHistoryResult` 多候选结构保持。成功 candidates 必须包括当前实际选入、可由原 D/M/R 解释的所有已知输出组，不只包括有准确 I 的候选；`selectedSources` 仍覆盖实际 messages 来源。原 same-call retry 分支、因果次序与实际 target 不变 |
| copy 边界 | runtime `ownPlanInput`、缺限额前检路径，以及 transport `ownPlanInput` 同步显式深复制新成员；复用 core `copyInputCalibration` 与已有 Usage/blocks/parameters/binding copy。内部帮助函数可组合，不能只 spread/浅 freeze 或 type assertion。所有实际数保留 JsonNumber 精度 |

public 调用者可从自己合法取得的原调用输入、固定计划与 `ModelInvocationResult` 构造 origin 和组；
原结果尚无 route 时，原固定计划给 adaptation/provider/parameters，原 reader 的实际已知事实给
servingProvider/upstreamModel，不能从当前调用补造。其合法来源是公开函数前提；这些显式值不获得
服务读权，也不要求 public caller 伪造运行时身份。调用者若未保留必要原事实，可以不声称那份组证据；
实际输入仍完整交给计量，不可据此删除历史内容或默认可发。

### copy 与跨值核验

1. 验必填字段/封闭成员/判别值、原 core 值、非负安全索引及合法目标，保留全部有序块、精确数和缺席。
   known requestInput 的 basis.binding/model/provider 与 origin.adaptation/definition.modelId/provider
   沿 MR9 原相等关系核对；provenance 已给实际模型/供应商与 origin 已给同名事实不相等即 malformed。
   两处都 known 的 projectionRevision 仍须相等。copy 不把 shape 合法标成来源已认证。
2. 每项映射必须在原 outputBlocks 和当前 messages 范围内，目标 `(messageIndex,blockIndex)`
   在该组和整个 outputHistory 中至多被认领一次；非法或重叠整个输入拒绝，不能跳过坏组。
   同组重复回放同一 sourceBlockIndex 不构成可直接使用整组 O 的依据；合法重复回放须由实际内容的
   有据映射或常规计量承担，不允许无依据复制同一组 aggregate。相同内容的不同原块位置仍合法，
   不能因 digest 相同去重。组内 replaySelection 按当前目标顺序，保留实际原 source 索引顺序供 transport 判断重排。
3. 当锚 observation 与 history 一项描述同一当前目标时，inputCalibration/usage/outputBlocks 及该原组映射
   必须逐值同源；不一致是 malformed。这不是 history 内的双重目标许可，而是锚与事实两种角色的交接。
   已有锚完整字段不变；transport 以实际覆盖排除数值重算，不凭对象引用相等或自造全局 group id 去重。
4. runtime 核原定位和实际块值；transport 核版本化摘要、最终转换、完整范围及适用依据。
   requestInput unavailable 不阻组事实传递；此时原 outputGroup.projectionRevision 与 origin 精确 binding
   仍在，当前固定 provider 须识别原输出编码并证明所选块到当前输入的映射可用。
   不能识别该 revision、缺模型映射必要原参数/上游事实或转换依据不足时，此组不提供 O 估算依据；
   transport 仍须覆盖实际块，完整计量不可判才沿 S-74 拒绝。不能只比较 modelId 放行。

## 同次授权前缀的来源算法

来源 reader 是既有宿主端口，不建立新的计量历史服务。runtime 先按现行权限取得 owned prefix，
核 tenant/session/log generation 与实际当前 call/dispatch/run/attempt；withRun 使用 v18 实际 execution。
它对 reader 返回的**全部**候选完成原 D/R/M 定位、值关系、原壳 Run/attempt、完整原批和实际选入链检查，
再发布成功结果；不能选到一个锚就提前返回，遗漏后面的坏来源。

在这一遍核验后形成两条独立输出：

- 输入锚：按 v16 从实际因果祖先新到旧选准确可用 observation，交固定 planner 复核 P/θ。缺准确 I
  的候选不能推进此锚，但也不阻较早合法锚。
- 输出历史：对实际选入且 G known 的每份原响应，无论准确 I 是否存在，按上节裁取原事实和映射。
  每份原响应最多一组；相同原 response 定位重复出现即失败，不按相同内容/模型合组。
  actual selected assistant 有 known G 时必须在此序列中得到唯一说明；不能以可选优化为由省略。
  G unavailable 时不造组；原内容仍由最终完整输入保留，计量是否可行归 transport。

same-call retry 可以贡献 I；没有进入实际上下文的 delivered 输出，其 replaySelection 必为空，
不进入 outputHistory，不能因为有 O 便塞进下一输入。不同 call 没有 M、又没有可证实际因果边时，
沿原来源不可用处理，不把物理日志先后当祖先证明。合法部分选入/重排不自动成为来源非法，原 reader
必须能解释该实际选择；能否据 aggregate 计量由 transport 另判，不能冒充完整回放。

现来源 reader 以原消息逐值相等核 selectedSources；它不提供任意变形视图来源的旁路。
压缩可选择保留下来的完整原消息并使旧 P 失效；若宿主需要删选块/变形消息，必须以现契约许可的真实
读源关系证明，不能伪造原 messageEntry 的值。当前 demo 只兑现已有线性和受控来源，不据本接口声称
完整 compaction/分支宿主已实现；无法解释的选择返回 sourceUnavailable，不擅自放宽原源检查。

### 失败账本

| 情形 | 收场及不能做的事 |
|---|---|
| public 缺必填 outputHistory、坏形状、越界、重复目标、组与锚冲突 | 原 `invalidInput{reason:'malformed'}`；不能静默补 `[]` 或转 full |
| service 已有必要原 D/M/R 不可解释、未知原批、跨域/错定位/停止 generation | 原 `{unavailable:true}`；不发布部分“好组”，不写新 dispatched、不发 HTTP |
| reader 明确 sourceUnavailable，必要调用事实本身仍可解释 | 沿 v16 `calibration:{kind:'none',reason:'source_unavailable'}`，outputHistory 明确 `[]`；这里只表示没有可发布的来源证据，实际完整内容照常交 full，不能伪称有来源或抹去必要事实失败 |
| reader noObservation | 只有不存在可交接的来源观察/组时才能简支；若已有选入历史，应使用成功序列分支，哪怕最终 calibration 为 no_observation，不能用简支吞 known G |
| 原 O 未知、组 partial、当前映射不支持、basis 不能判兼容 | 保留真实组/usage/partial；不得补 O=0 或 exact。transport 可用其他有据方法覆盖实际输入；仍不可判按 input_size_unavailable |
| 无输入锚但多个合法组 | calibration 为 no_observation，history 非空；full 仍收到全部组。不能因走 full 丢组 |

## full／φ／δ 的交接边界

本节点只交源事实，不给模型写补丁。transport 的后继须在同一次最终 input-bearing 投影上，
将每个组的实际目标映射到 units/spans；精确类型归 transport，其来源 DTO 只能引用本账本。

full 覆盖全部实际输入；marginal 中 P 已由 I 覆盖，G 由 φ 覆盖，其余 N 由 δ 覆盖。
history 中落在 P 的组只用于核对，不再加 O；与当前锚输出相同的 G 只给 φ；其后旧 I 未知但 O 已知
的组可以交 δ。跨覆盖边界、混合 unit 或部分选入不准整组 O 外加被其覆盖的可见块计量。
某组不能采用 O 映射不等于可以漏计；不足时完整重算，仍不足才拒绝。完整重算后的下一实际 I
覆盖全部当次输入，后继恢复 marginal 时不得把那些旧 O 再加入。reasoning 仍是 O 子集，不双加。
预估与 actual usage 分开，余量仍只施于最终估算一次。

## 消费者与破坏性迁移

| 消费者 | 必须同步的施工点 |
|---|---|
| public plan／invokeModel／anchored invocation | PlanInput／InvocationInput 及各工厂、wrapper、预检复制、计划固定同时要求 outputHistory；缺字段立即失败，不留旧 overload |
| openCall | 原授权前缀完成后调用同一来源组装，首次 plan 同时交 calibration/outputHistory，不在打开提交里另写计量记录 |
| dispatch／dispatchAgain | 在实际新 dispatched 之前，用本次合法 prefix、实际 target、实际 messages 重取两份结果并重 plan；不能只复用 openCall 的 history 或漏掉重试中间结果 |
| readAttempts／reconcile／settleReply | 完整原 MR9 保真；本页不向持久结果加 outputHistory。冷恢复按原批读回，再由来源函数派生；不重算原响应的 inputCalibration |
| transport 输入 copy／plan／公开 meter | 接唯一 runtime 类型，全文输入保持；固定 lease 的 projection/meter 决定分配和适用，输入发生变化须重新计划 |
| examples、tests、工具和独立包消费者 | 所有构造 PlanInput 的位置一次迁移；首次无历史写显式 []，续轮从真实原结果/来源构造，不批量机械补空绕过历史。两份 README literal 均实际编译运行 |

全部 owned copy 在异步交接前完成；原绑定热更只能影响新 lease。公开纯函数不读日志/网络/环境，
不要求 runtime 存在；service 的身份门不下放成 caller 的 trusted/compatible 布尔。

## 存储、并发与装卸

新增存储要求 **0**。继承 MR9 S-45／RT10 S-81／SL3 的抽象要求：原批原子持久、稳定键唯一并可识别
异值冲突、entries/tail/keys 一致快照、session fence、unknown 可辨、合法完整 prefix 可读或具名不可用。
实现不在此选数据库。runtime 结算、外部回复写方与恢复写方共同触碰的对象仍为**同一 SL3 日志的
entries、tail、readKeys/writeKeys 和 session fence**；本增量只读这些原对象，不添加“已校准”标志。

交错 A：原 `[M,R]` append 已落盘而回执未知，另一计划持旧 prefix；旧 prefix 不得发布该 G。
经合法恢复确认原完整批后，下次重读才可导出原组，不能从写者内存抢先发布。
交错 B：来源读取 prefix t 后另分支响应落盘及 meter 换代；当前计划仍只使用 t 中可证选入的组和
自己的固定 lease，不能换到更晚 G；重试重新核源。恢复写方始终保存原 payload，新的计量只属于新请求。
两种交错见 H19-V8/V9，进程锁、时钟比较与内存“最新值”均不承担原子性。

| 装载/资源 | 取得、归属、可见 | 部分失败与撤除 |
|---|---|---|
| 纯值序列 | 每次调用从显式输入取得深快照，调用 owner 持有，整体核验后交 planner | 拒绝不发布半份结果；调用结束释放内存，无新 disposer |
| P-2 与现历史 reader | 沿原服务依赖及授权 prefix 生命周期，无新注册 | 原静态配置/依赖失败不发布；来源故障按失败账本，已在途 owner 不丢 |
| 固定 transport lease | 原调用 owner 取得一套 projection/meter/read 贡献 | 计量错误不偷换贡献；停止后按原 actual-stopped/未知责任释放，不由 Cordis 卸载假定取消 |
| 原日志与恢复 owner | 沿原宿主权限和恢复开闸取得；耐久事实属日志 | 服务撤除不删历史、不撤销发送；未知批及未停任务继续由原 owner 留存，原运行按各自提交收场 |

Cordis 换必需提供者使插件重跑的依据为
[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)
（4.0.4，有 probe）；本次不增加这条依赖，重跑不能制造全局计量锚。
现内核不保证按异步清理完成顺序排空的依据为
[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)
（4.0.4，有 probe），实际停止及组合关闭沿原 owner 机制。未新增上游机制主张。
归装配事项仍是宿主入口身份核实、同次授权 prefix/Run 分支来源、真实时钟/凭据及恢复入场；
本页不建立新 assembly，examples 只承接其声明的开发演示范围。

## 选择、反向核对与缺口

| 关键选择 | 落选方的最强论证 | 本方弱点／置信度 |
|---|---|---|
| 邻接必填 outputHistory，保留单锚联合 | 把 calibration 改为一个大联合能避免两字段对账 | 要核锚/组重叠关系，但区分 I 与 G 的独立可用性、普通 φ 不被迫迁换形状；高 |
| 复用原 reader 多候选并同遍核验 | 新建输出来源服务可独立替换和缓存 | 原 reader 增加完整性责任，需要迁移所有 reader；无新权限/生命周期，新增服务价值不足；高 |
| origin 仅裁取原 Route 的计量事实 | 传完整 MR9 最省类型与关系检查 | 需显式裁取/交叉检查，但避免 public 函数要求租户、凭据范围、响应身份；高 |
| runtime 核源，transport 判编码/范围/模型映射 | runtime 先筛模型能早拒并减输入 | 需联合验收且 transport 会收到不可采用的合法组；维持唯一模型算法 owner；高 |
| 不新增持久组记录 | 持久索引可减少重读成本 | 可能扫描完整前缀；尚无收益证据，原 MR9 已有足够事实，不加第二真值；高 |

H19-G1：本候选与 transport 后继的接口和覆盖须联合评审/主线采用，阻止这项破坏性迁移，
不阻已采用的普通单 φ 实施。H19-G2：实现及 H19-V1～V10 尚无，owner 为 runtime/transport/消费者
实施方和主线独立验收；已通过旧 source-order 或单组回归不关闭它。
H19-G3：真实分支/compaction 派生视图来源仍属宿主；缺关系解释时相应请求不可借假来源放行。
H19-G4：原 I 不可用时各模型对旧 G 的适用证据由固定 transport 提供，缺依据仅阻依赖该映射的
计量路径，不抹掉组事实、不声称全模型完整交付。未发现需修改 MR9/RT10 的语义冲突；若施工需放宽
同批、授权或来源失败边界，应退回主线，不能在实现里另定政策。
