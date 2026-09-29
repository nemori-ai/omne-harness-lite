# 多个历史输出组的完整与增量计量投影

2026-09-29，revision 1，**candidate，未技术采用、未实施、未验证；新增 bindings 0**。本页接续已采用的 [v12 revision 2](v12-usage-calibration-design.md)，不修改其冻结正文。文中新增类型、成员及操作参数均为候选；服务与十三操作数量不变。

## 依据、输入与边界

精确消费 baseline `omne-harness-lite-design-2026-09-15` 的 [MR9](../../../../spec/data/model-response/v9/contract.md) S-41～S-45、[RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S-74/S-77～S-83。两契约在 catalog 为 accepted，接受依据是 [D-107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)；PF-013 rev15 等需求版本沿 MR9 来源表，不另增产品政策。runtime 的现有来源、原批恢复与实际 Run 交接沿 [v16](../model-request-runtime/v16-usage-calibration-design.md)／[v18](../model-request-runtime/v18-failure-execution-design.md) 精确采用范围。

现有公开 `ReplayMeterInput` 已向 φ 显式交出原 observation、绝对 unitIndices 和 selectionSpans；当前 full 只取得 body/serialized、δ 只取得新增投影，不能使用多个较早响应保留下来的 O。这是既有 MR9 部分事实与 RT10 显式输入责任的投影补足，不新增计量真值、领域对象、持久字段或模型操作。

本节点持续消费者是独立函数调用者、runtime 的 transport 适配与各家 InputMeter。公开 `PlanInput`、`PlanOutputHistoryGroup` 及其来源字段账本唯一由 runtime 节点拥有；本节点复用该类型，**不定义第二份组 DTO**。精确候选接口沿 runtime 节点 `v19-output-history-design.md`「唯一公共接口账本」revision 1（SHA256 `348d951ffe855645075911858e963627b60210976da46cd2505a65c3b3423a92`）；本页不提升它的接受状态。候选仅阻止本次多组交接的破坏性迁移，不阻已采用的普通单 φ 路径；未发现需要 MR9/RT10 升版的语义冲突。

## 契约责任到兑现点

| ID／契约责任 | 公开操作、贡献与 Cordis 投影 | 候选实现落点 | 符合性义务或缺口 |
|---|---|---|---|
| H13-P1：MR9 S-43/S-44；RT10 S-79 | `planRequest` 对全部显式历史组做 owned copy、关系及实际投影校验 | `src/calibration.ts`／既有统一输出摘要与消息 span 构件 | H13-V1/V2；无隐藏读源或授权能力 |
| H13-P2：RT10 S-77/S-78 | 一份公共覆盖分配决定 full 或 I+φ+δ；固定贡献内组合 | 同一 calibration 组合；完整请求只投影一次 | H13-V3/V4；不按 modelId 添控制流补丁 |
| H13-P3：MR9 S-43；RT10 S-78/S-79 | `InputMeter.measureFull`、`measureNew` 显式取得所覆盖历史组与位置；复用原 φ 交接 | `src/input-meter.ts`；家族共享纯函数与型号窄依据 | H13-V5/V6；多个 O 到当前输入的映射需要独立版本化依据 |
| H13-P4：RT10 S-74/S-79 | 原固定计划的合成、一次 margin 与完整 bytes/images 检查 | 既有 planner／input-limit gate | H13-V7；实际 usage/cost 不由估算覆盖 |
| H13-P5：RT10 S-80/S-81/S-82 | 接收 runtime 同次合法来源；原 binding/lease 完整固定 | 原纯公开面、贡献注册与服务消费 | H13-V8/V9；本节点无日志写权、来源发布或恢复权 |

## 同一投影上的覆盖分配

规划顺序固定为：校验并拥有显式输入；按最终 reminder、tools、媒体、reasoning、参数和缓存策略生成唯一实际 body/serialized；用同一固定 projection 得到 units/envelope 与消息 span；核所有历史组；最后选择计量路径。只验证 calibration 那一组而跳过其余组不合格。所有已选入内容仍在发送体中，计量覆盖分配不删除、替换或重写 wire。

runtime 与 transport 的候选 `ownPlanInput`、runtime 缺限额前检路径均按唯一账本显式深复制必填 `outputHistory`；缺席不补 `[]`。复用 core `copyInputCalibration` 及现有 usage、blocks、binding、parameters 的 copy，保留无损数、可选事实缺席及有序 selection；不能只 spread、浅 freeze 或断言类型。planner 从这一 owned 值派生投影与位置，后续 caller 修改不影响计划；各 meter 复用此快照，不为每个阶段再复制全部历史。

每组逐项核 outputGroup 指定版本的原块摘要、原块数量/顺序、source/completeness 与原 usage 的关系，再核 selection 指向当前实际块、visibility 与最终 span。实际目标不能由两组同时认领；同组同一目标重复也拒绝。同一原块被复制到两个不同目标的合法内容不能伪称「原完整组只回放一次」，需要固定映射明确支持重复，否则不能消费一次 aggregate O 覆盖两处。不同块可合法同属一个最终消息单元，**span 相交本身不等于重复认领**；共同 framing 必须有唯一 owner，不得按 span 各加一遍。

投影版本无法解释属于依据不足；已能解释却摘要不等、指向不存在/不同原块、重复目标或组之间非法覆盖属于显式输入非法。不能把非法来源当作无来源重算，借 full 绕过真实性校验。旧响应 requestInput/observedInput unavailable 不使其 outputGroup known、原 O、原 route/binding/mode 事实消失。

| 计量模式与区域 | 历史组的处置 | 禁止的重复或遗漏 |
|---|---|---|
| full：没有可复用 I，或 P/basis/必要边界失效 | 全部当前实际输入均须覆盖；仍将合法选入的多个历史输出组交给当前固定 meter，允许它有据使用原 O | full 不等于必须 tokenize opaque；不得因 I 无效而清空 O，也不得绕过旧到新口径映射 |
| marginal 的 P：被可靠 I 覆盖的稳定前缀 | 组的对应目标已在 P 内，仅参与来源/对应核验，不进入 φ/δ 的计数集合 | 原 O 已被 I 吸收，禁止再加；核验可以扫描/hash，禁止 tokenizer 再访问 P |
| marginal 的 G：所选锚响应的实际回放 | 唯一锚组交原 φ；历史集合若包含它，只保留一次计数归属 | calibration 与历史集合的双重表示不能双计；对应关系按 runtime 唯一账本 |
| marginal 的 N：全部剩余新增 | 后续缺可靠 I 的回复、其他选入历史输出与新 user/tool 等均归 δ；向 δ 交付 N 内组事实 | 缺 I 不等于缺 O；δ 不能只数最后一条 user，也不能遗漏无证据组的实际内容 |

组跨 P/G/N、只选部分、原输出 partial、改变顺序，或多个组共享一个无法分解的 unit 时，不均分 aggregate、不按块数比例分摊。本候选位置视图只交接整组归区，不定义跨区域子组输入；需要拆组跨区时转 full。组在单一区域内部分选入或混合 unit，只有当前固定映射能解释实际部分及唯一 framing owner 才可贡献，否则 marginal 不可判转 full。full 可以根据当前实际选择使用自己的已证映射或计量；仍不能解释则 input_size_unavailable。full 是覆盖全部输入的模式，不是容许把整组 O 用于部分选入的例外。

## InputMeter 的显式交接

`FullMeterInput` 候选在既有 body/serialized 外显式接收完整最终投影、当前固定 basis，以及 runtime 所有历史组的只读数组和本节点生成的位置视图。`measureNew` 的候选输入在既有 units/envelope/precedingUnitCount/boundary 外显式接收 N 的绝对 unitIndices、仅归 N 的历史组引用及对应位置视图。原 `ReplayMeterInput` 继续交 observation 与 G 的位置；三个子计算消费同一 owned 快照，不各自重新选择来源。

位置视图只记对同一数组的 group 索引、该组 selection 索引及最终半开 unit span，沿既有 selectionSpans 解释；它是实际投影结果，不复制 usage/inputCalibration/origin，也不是另一个来源凭证。候选签名如下，引用既有本节点 InputProjection/MarginalMeterInput 与 runtime 唯一组类型；禁止 optional 缺省旧形式的兼容重载。公开独立 meter 调用仍须校验本口可判关系；只读类型、planner 内部 frozen 或 caller 的 trusted=true 都不能代替运行期校验。

独立 full 对本口可判的重复目标、已识别投影版本下的摘要不一致等非法输入返回 `{kind:'unavailable'}`，不得产出计量或剔除坏组后重算；独立 φ/δ 对此返回 `{kind:'invalidInput'}`。planner 在选择计量路径前完成显式来源校验，此类非法输入返回 `invalidInput{reason:'malformed'}`，不得借 full 回退或 meter 的 unavailable 将其降为计量依据不足。无法识别旧投影版本属于依据不足，不冒判摘要错误。此处保持 full 的 TokenMeasurement 与 φ/δ 的 MeterContribution 返回类型。

```ts
// 候选；PlanOutputHistoryGroup 只从 runtime 公开入口 import。
interface MeterHistoryInput {
  readonly outputHistory: readonly PlanOutputHistoryGroup[]
  readonly historySpans: readonly {
    readonly groupIndex: number
    readonly selectionIndex: number
    readonly start: number
    readonly end: number
  }[]
}
interface FullMeterInput extends MeterHistoryInput {
  readonly body: JsonObject
  readonly serialized: string
  readonly projection: InputProjection
}
interface NewMeterInput extends MarginalMeterInput, MeterHistoryInput {
  readonly unitIndices: readonly number[]
  readonly countingBasis: CountingBasis
}
// measureFull(input: FullMeterInput): TokenMeasurement
// measureNew(input: NewMeterInput): MeterContribution
```

`projection.requestInput.countingBasis` 给 full 当前依据。δ 的数组仅含全部实际选入目标均归 N 的组，保留完整原块和完整原 replaySelection，不裁成员伪装完整；位置中的 groupIndex 相对该实参数组，unitIndices 与 units 等长且按最终顺序。含跨区域组的 marginal 在本候选交接范围内转 full，不把这份组硬截成 N 子组。historySpans 对每个 selection 恰有一个视图，范围必须在本次投影内；空 N 明确空数组。原 φ 从 calibration 取得计量所需原事实；若当前家族映射另需 origin，则从账本规定的同组 history 唯一项取得，不能从当前路由补造。该原事实应通过 `ReplayMeterInput` 候选新增必填 `outputHistory: readonly PlanOutputHistoryGroup[]` 交接：只允许与 observation 同组的一项或明确空数组；缺所需 origin 时该映射不可判。其余 φ observation/unitIndices/selectionSpans 不改；不增加新来源类型。

锚 observation 与 history 项的目标有交集时，四项原事实及完整 replaySelection 必须逐值一致；不一致 malformed。数组顺序、组内目标顺序沿 runtime 账本；既不凭对象引用判同组，也不因块 digest 相同合并不同原块。可合法保留重复 sourceBlockIndex，但是否能计数归映射依据。

full 返回非负 TokenMeasurement；φ/δ 延续有符号净贡献和精度。共享组合只负责覆盖、合法结果、精确整数求和、精度格与失败映射；模型条件不进入公共组合。每个固定家族实现可共用一个输出组贡献函数，再由窄定义提供适用的原/目标 model、provider、binding、mode、输出保留和边界依据。仅模型名相同不证明 O 与回放输入相等；换 tokenizer/basis 且不能按 RT10 S-77 证明兼容时必须 full，但新 meter 仍可在有证明的旧→新转换范围内使用原 O。无转换依据就不可用此 O，不抹原事实。

有据的估算保留 estimated。O 已含 reasoning 子集，禁止 O+reasoning；O−reasoning 不自动是精确可见文本量；密文字节数、JSON 长度和可见摘要均不能充当隐藏 reasoning tokens。使用 O 覆盖完整组后不能再把同组 text/tool/opaque 完整计量加上，只可加入有明确边界依据的净修正。没有可用 O 的文本可按既有 meter 依据计量，缺失不填零。原 requestInput unavailable 时必须从合法原事实取得映射所需 route/binding/mode；缺少必要事实不能凭当前请求或名称补造。

I 只由可信完整输入观察产生。合成仍为 fullContribution 或 I+φ+δ；历史输出贡献属于这两个模式内部，不是额外第四加项。最终 estimated 总量应用 tokenMargin 一次；实际请求 bytes、逐图解码 bytes、图数、原输出预留全部沿原完整门。诊断只保留 mode、回退原因、basis、精度、阶段耗时及有限数量，不泄原块、opaque、凭据或完整摘要预像。

## 失败、依赖及状态

| 情形 | 责任与结果 |
|---|---|
| 显式值缺必填成员、坏判别/范围、已证来源或内容矛盾、重复目标 | planner 的 invalidInput{malformed}；不得默默滤掉坏组再成功 |
| 合法事实但组范围、原口径或当前转换依据不明 | 对应 meter unavailable；marginal 可 full，full 仍不足沿 S-74 input_size_unavailable，零新 HTTP/锚/响应 |
| 必需构件缺席 | 沿 S-79 unavailable，不当作上游失败或自动切换模型 |
| 服务来源跨日志/租户/分支、原批 unknown 或耐久值坏 | runtime 原读源/原批门先处理；transport 不读日志补证，不把来源非法降成空数组 |
| reader 明确 sourceUnavailable 且必要调用事实仍可解释 | 沿 runtime v19 交 calibration source_unavailable 与显式空 history，实际内容完整进入 full；不可用此分支吞掉必要原 D/M/R 失败 |
| reader noObservation，但实际已选入 known G | runtime 必须走成功序列分支交所有组，calibration 可 no_observation；transport 不从简支自行发现或补组 |
| 组事实与 inputCalibration 不完整但合法 | 保留可判部分；缺 I 不抹 O，缺 O 不造零，partial 不升 complete |
| provider 函数返回非法数字、范围或抛错 | 沿 v12 构件失败/全量回退责任，不假 exact，不凭 0 通过；具名诊断保留实际缺口 |

不新增持久、并发共享状态、网络、环境读取、timer、service 或 fiber。贡献仍由既有 modelTransport/可信模型插件固定整份实现；公共函数不依赖 Cordis、Session、Run 或 ResponseId。Cordis 采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)，不增加上游语义主张。

| 取得项／可用时点 | owner 与部分失败 | 撤除及不变事实 |
|---|---|---|
| 完整 meter/projection/原口径映射随 binding 校验发布 | 原贡献 owner；插件配置错误启动失败，公开注册沿原具名拒绝，不发布半份 | retire 停新借用，旧 lease 固定整份；不能单换历史映射 |
| 本次 owned 历史组与分配结果 | 本次 planner；校验失败丢弃派生值，无写入或外部资源 | 调用结束可释放；原响应及原批不变，无独立清理任务 |
| 已接纳调用、既有 tokenizer 资源 | 原 invocation/贡献 owner；按原 stop/stopped 收口 | 未结束调用按各自原 owner 跑完/实际停止后释放，不由内核卸载自动取消 |

重跑、配置失败与并行 effect 清理仅继承已有已登记 probe 的 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)、[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)。没有新增绑定。

## 存储、装配与取舍

本节点新增存储要求 **0**。RT10 S-81/MR9 S-45 的共同存储对象仍是 runtime/SL3 原 response/reply append batch；没有第二个计量写入者。交错一：输出返回后原批回执 unknown，runtime 不把它作为已耐久历史组发布；transport 无旁路查询。交错二：原批确认后贡献换代，新调用使用原事实及新固定映射，旧 lease 不改、历史不重解回写。实际演练归 H13-V8。

归装配沿原 owner：runtime 提供同次授权来源及原 route/parameters 事实，独立 public caller 显式提供其合法取得事实；两者都不以哈希代授权。模型贡献 owner 提供初始化完成的 tokenizer/映射与证据版本；既有宿主提供 tokenMargin、诊断/耗时、凭据和停止政策。无新增应用装配节点，不借本增量实现完整 Session/Run/compaction。

现消费者迁移包括 public `invokeModel`/`planRequest`、`TransportAdapter.plan`，以及服务 `openCall`、`dispatch`、`dispatchAgain` 的输入构造面和现有 demo 来源 reader。服务先从同一次授权 prefix 核全部原 D/M/R 和实际选入关系，再交单 I 锚与多组事实，不能找到锚即返回；transport 不补全缺组。public caller 可从自己合法取得的原固定计划与原调用结果裁取 origin，仍不需要租户、Session、Run 或响应身份。demo 的线性/受控来源不因此升级为完整分支或 compaction 来源。

性能边界是稳定 P tokenizer 访问为零，不是历史处理零成本。深复制、完整实际请求序列化、投影/hash、关系核验与完整 bytes/images 门仍可随输入线性增长；多组目标核验用本次调用的索引，不引入跨调用缓存或 store。验收分别记录输入字节、组数、selection 数及各阶段耗时/峰值内存，对固定新增与递增旧历史作比较；未量测前不承诺端到端常数成本。

| 关键选择 | 落选方最强论证 | 本方弱点／置信度 |
|---|---|---|
| 一份显式历史组账本，full/φ/δ 共用 | 只给最近 observation 可最小化调用参数 | 多组校验/位置映射增加成本，需量测；但覆盖缺 I 的中间回复和重锚路径，较高 |
| 同一 projection 分配覆盖，家族只贡献有据计算 | 每模型自己解析完整 body 更容易定制 | 共享边界需准确表示合并 unit，无法分解须回退；避免逐模型重新发明计数归属，高 |
| 丢失 I 只取消输入锚，保留 O 及原事实 | full 清空所有 metadata 最容易实现 | 原→当前转换仍需逐路由证据，不能保证所有旧组可计量；与 MR9 部分事实一致，高 |
| 不新增 meter service/store | 单独服务可集中历史并缓存 | 显式输入可能增加复制/hash，但不引入新真值与生命周期，高；性能收益尚待实测 |

## 形式覆盖与未决

RT10 的 [UsageCalibration.tla](../../../../spec/capabilities/model-request-runtime/v10/formal/UsageCalibration.tla) 已有 AnchorSource、PrefixGuard、BasisGuard、NoDoubleOutput、ErrorReset、OriginalBatch、NoEarlyPublish、ReanchorProgress；既有证据仅在其有限抽象内成立。该模型的 output 是数值序列、ExactReplay/ExactNew 直接用 Count 差，**没有**显式多组 usage/origin、selection→span 关系、部分组 aggregate 选择或转换依据判定。NoDoubleOutput 只检查公式三项相等，不能证明本页组覆盖互斥；这些映射不得冒绑既有形式任务。

H13-G1：runtime revision 1 唯一账本已供本稿引用，两个节点仍待主线联合审查及采用，依赖公开交接的实施受阻。H13-G2：新映射及 H13-V1～V9 尚无实际验证。H13-G3：多个 opaque 组的当前模型转换依据仍归各模型 owner，不以统一接口完成冒充模型认证。H13-G4：若主线要求形式证明组级互斥/转换守卫，需 spec owner 在新正式版本中显式建模 group/selected-target/region/mapping predicate，并配置「同组双加、跨区域 aggregate、无依据转换」负控；本节点不改冻结 TLA，主线须裁定补充证明义务与接受边界。上述缺口与消费者见 [候选验证](verification.md#h13-多个历史输出组候选)。
