# 响应校准与增量输入计量的传输投影

2026-09-29，revision 1，candidate；未接受、未实施。本页只追加本节点映射，不修改 v9/v10/v11 的采用范围。

## 输入与责任边界

精确消费 baseline `omne-harness-lite-design-2026-09-15` 的 [data.model-response/v9](../../../../spec/data/model-response/v9/contract.md)（MR9）和 [capability.model-request-runtime/v10](../../../../spec/capabilities/model-request-runtime/v10/contract.md)（RT10），两者在 catalog 中均为 candidate。沿用已接受 MP6、MS6、CA2、SL3；需求 rev 沿 MR9 来源表（PF-013 rev15 等），新增方向来自 [U0 C 及施工简报](../../../../record/proposals/model-input-usage-calibration/spec-construction-brief.md)。[v10](v10-token-estimate-design.md) 的估算及配置余量、[v11](v11-registry-diagnostics-design.md) 的观测故障隔离继续适用。

这是现有 `packages/model/pi-ai-transport` 的提供者增量。已有 `planRequest`、`readStream`、`InputMeter`、贡献注册/lease 和 Cordis 插件；本页的新接口均为**候选**，尚未实现。`TransportAdapter`、`PlanInput`、`StreamEnd` 及规划结果的公开签名唯一归 [runtime 节点](../model-request-runtime/README.md)；MR9 六个共享值类型唯一归 [core/model-response](../../core/model-response/README.md)。本节点只拥有其实现和 `InputMeter` 组合，不复制这些 DTO 或增加第十四个操作。

## 契约责任到兑现点

| 契约责任 | 公开操作／插件贡献 | 实现落点与版本 | 符合性依据或缺口 |
|---|---|---|---|
| MR9 S-41，RT10 S-57/S-77 | 固定 `planRequest` 的最终输入投影与 basis | `src/plan.ts` 及候选纯投影构件；根入口可单取用 | UCT-V1/V2；摘要只证规定预像相等，来源仍由 caller/runtime 提供 |
| MR9 S-42，RT10 S-59 | `readStream` 首次解析并显式交接 observedInput | `src/stream.ts`、`src/accounts.ts` 的同次归一化；新输出成员消费 runtime 签名 | UCT-V3/V4；当前流尾才 yield account 的实现须迁移 |
| MR9 S-43/S-44，RT10 S-54/S-60 | 固定适配提供者的候选 `projectOutput` 纯构件 | 对 invoke 实际保留内容编码；不重新读 raw | UCT-V5；组对应与 core 关系校验共同验证 |
| RT10 S-74/S-78/S-79 | `InputMeter` 的候选 full/phi/delta 纯计算与 plan 合成 | `src/input-meter.ts`、`src/input-meters/` 家族实现与 `official-models/` 窄定义 | UCT-V6/V7；精度逐模型给证据，未支持者不可伪 exact |
| RT10 S-53/S-77/S-82 | register/acquire/retire 固定整份贡献 | 既有 `src/registry.ts`、`src/plugin.ts`；新修订整体替换 | UCT-V8；算法/投影/reader/兼容依据一并固定 |
| RT10 S-80/S-81，MR9 S-45 | 原 plan 与 reader facts 交给 invoke/原结算 owner | 本节点不写日志、不选择跨会话祖先、不恢复原批 | UCT-V9；原批原子与 unknown 发布控制归 runtime/SL3 |

## 公共组合与唯一编码

新增纯构件的候选名为 `projectInput`、`projectOutput`、`measureFull`、`measureReplay`（φ）、`measureNew`（δ）。它们是固定适配贡献中的可单独导出函数，不能通过服务私有查询才能取得。根与 Cordis 使用同一组函数。runtime 所有的候选接口接收/返回 core 的共享类型，本节点不另定传输 DTO。每个函数只读显式 owned 值、固定版本代码及已装载 tokenizer 制品；不得读日志、环境变量、网络或全局最新模型。制品初始化在贡献发布前完成，不在纯 plan 内懒取网络。

跨节点候选 ledger：`PlanInput.calibration` 显式取 none 或 observation；后者携 `inputCalibration`、原 `usage`、原实际保留 `outputBlocks`、`replaySelection`。selection 每项是 `{sourceBlockIndex,messageIndex,blockIndex}`，分别指原输出块和当前 PlanInput 原消息块；planner 先核原组摘要，再映射到最终投影 span，索引本身不证明内容同一。目标块不能重复归属 G/N，协议合并/拆分后必须能解释实际覆盖，否则 φ 不可判并回退 full。所有未被 I/G 覆盖的实际新增均归 N，不能因 selection 缺失而漏计。

`PlannedSemantics.requestInput` 与 `measurement`、`StreamEnd.readFacts={usage,cost,observedInput}`、`TransportAdapter.projectOutput(planned,{blocks,source,completeness})` 的唯一类型定义归 runtime；本节点实现它们。`projectOutput` 返回 core `OutputGroupEvidence`。候选 `InputMeasurement` 由 runtime 拥有，包含 full/marginal、回退原因、basis、精度、predictedInput、admissionTokens，以及 marginal 的 replayContribution/newContribution；本节点的候选 `MeterContribution` 才表达子计算的 signed JsonNumber/精度及 unavailable/invalidInput。这里不另造同义接口；最终字段以 runtime 同批候选签名为唯一来源。`ModelInvocationResult`/`InvocationObservedFacts` 交出的必填 `InputCalibration` 由 core 复制校验，完整响应关系仍经 MR9 judge，不以片段校验替代。

### 输入、输出与摘要预像

候选编码修订 `openrouter-input-projection/1` 由本节点唯一实现，并随 binding 固定。它在 reminder 映射、tools、媒体转换、reasoning 保留、参数调整和缓存标记**全部完成后**消费实际 `body`；`serialized` 仍是 HTTP 唯一发送字节串，不另外重建发送体。

1. 有序输入单元是最终 `body.messages` 的每一个完整线上消息对象，含 role、content、工具调用/结果、reasoning/opaque、缓存标记；顺序、重复、空内容均保留。一个消息内全部内容块属于该单元，不用日志 seq 作 boundary。system/developer 若在 messages 中，只在这里计入。
2. envelope 是最终 body 除 `messages` 以外的全部成员，加固定投影解释版本。包括 tools/schema、model/provider 选择、模板解释和实际参数；保守包含非输入参数可导致额外全量回退，但不能把不存在的参数算成实际输入 token。计量算法明确其中哪些承载输入、哪些只是限制复用的解释条件；不能删掉未知字段以制造命中。凭据、请求关联 id、超时在 body 之外，绝不放进摘要预像。
3. 编码函数 C（候选）递归保留数组顺序，对对象 key 按 Unicode 码点排序，再由既有无损 JSON writer 输出紧凑 JSON；字符串采用该 writer 的确定性转义，不做 Unicode normalization，数字保留无损数值的词法表示。词法不同但数值相等允许保守失效。writer 的确切行为和 golden 与 projectionRevision 一起冻结；更换输出规则必须改修订。输入是经过校验的 JSON 值，不允许 getter、undefined 或非 JSON 值参与编码。
4. 对 n 个单元，`prefixDigest = SHA256(UTF8(C([revision,"input-prefix",units[0:n]])))`；`prefixBoundary=n`。`inputEnvelopeDigest = SHA256(UTF8(C([revision,"input-envelope",envelope])))`。数组封装与域字符串使空序列、拼接边界和 input/output 域不可混淆；SHA256 输出小写 hex。版本与 envelope 不因截取 n 而丢失。
5. 输出每块摘要为 `SHA256(UTF8(C([revision,"output-block",block])))`，block 是 invoke 实际保留的完整 MR9 reply/delivered 内容块值，含 id、visibility、opaque 和未知 JSON 成员；每块一摘要，保持顺序及重复。`source/completeness/usageRef` 沿 MR9，不凭 finish reason 补 complete。候选 `projectOutput` 不需要 requestInput known，原 response/request identity 由 invoke/结算 owner 关联。

服务与直接函数必须调用这**同一固定编码实现**；core 只检查类型与可判关系，不再实现一份编码。不同投影修订先判 basis/投影兼容，不能直接比较碰巧相同的 hash。复用还需来源祖先、原 response/reply 对应、实际选入组及 provider 适用条件，摘要不是授权或无碰撞证明。密码学抗碰撞作为实现假设记录，安全边界不靠 hash 独立承担。

计划只持有本次 owned body/serialized、投影、measurement 和可解释出处；durable payload 只加 MR9 规定事实，不另存整份历史输入。核对前缀允许 C/hash 线性扫描稳定字节，禁止把这些稳定单元送入 tokenizer。缓存 checkpoint 若移动而改变旧 message 的实际表示，按 prefix_changed 全量；未经证据不得忽略该改变。

### meter 的三个子计算

`InputMeter` 当前单一 `measure({body,serialized})` 迁为候选 full/phi/delta 组合；破坏性切换所有根、factory、registry、插件和家族构件，不留旧函数旁路。元数据复用精确 model/definition/implementation/provider，并明确 tokenizerRevision、meterRevision、replayRevision、transformRevision 与可判适用依据。MR9 `CountingBasis` 由固定提供者构造，不能由调用者给版本标签自证兼容。

| 子计算（候选） | 显式输入与覆盖范围 | 输出与失败 |
|---|---|---|
| full | 本次完整最终投影、body/serialized、固定 basis | 原 nonnegative TokenMeasurement；无依据 unavailable |
| φ | 同次原 MR9 input/observed/outputGroup、原 usage、此次实际选入 G 的内容及投影、P 与 G 的边界描述 | 带 exact/upperBound/estimated 的有符号净贡献；非法输入 invalidInput，缺依据 unavailable |
| δ | P/G 边界描述、全部剩余新增 N、固定 basis；包括旧锚之后没有可靠 usage 的后续回复与输入 | 同上；必须覆盖边界修正，不只独立数 user 文本 |

有符号贡献采用精确整数运算；不得复用当前禁止负值的 TokenMeasurement 校验器截掉负修正。合成由 plan 执行 `I+φ+δ`，检查非负整数与 RT10 精度格，再对最终 estimated 总量应用 tokenMargin **一次**。reasoning 是 output 子集；原 O 已包含于 I 时不能重复加入。φ 可利用有依据的 O 映射，也可 meter 实际新增回放内容；后者依然只处理锚外内容，不把 aggregate 拆成伪准确逐块数。

边界描述由同一投影构件产生，可提供末端 framing 或 tokenizer 证明需要的有限边界窗口；若算法需要读取整段稳定历史才能修正，必须报告不能执行本增量算法，回退 full，而不能声称 marginal。若有限窗口内重新分词，窗口大小、为何足够及可判条件随具体 meter 修订提供；不能用未经证明的固定字符数冒充通用 tokenizer 性质。

φ/δ 的 unavailable、非法结果或不可证覆盖转 full；full 也无依据时沿 RT10 S-74 input_size_unavailable 拒绝，零 HTTP。有模型依据的 estimated 可以供给，但不变为硬窗口保证。ciphertext 长度、JSON 编码长度、可见 reasoning 长度不能冒充隐藏 reasoning 的 tokens；没有对应解释就 unavailable。无论 marginal/full，request UTF-8 bytes、严格解码逐图 bytes 和图片数量仍检查**完整**最终请求；输出预留沿 profile 原口径，不重复扣除。

家族共用协议投影、tokenizer/模板工具和已证适用的 φ/δ，实现放 `src/input-meters/`；窄型号/供应商映射固定在完整 definition 绑定，不凭厂商名批量声明兼容。官方八家、37 个型号与组织可信代码扩展走同一公共面；组织声明式 profile 不能注入可执行 meter。每个模型需要 full/phi/delta 的适用模态、范围、精度、依据版本、上游对照及负控证据；缺一项按能力实况拒绝或回退，不能把缺项计为完整交付。

## reader 首次解析与终止交接

`readStream` 是解释本次上游统计的唯一 owner。frame 的无损 JSON 校验之后，立刻以固定 reader 修订同时归一化现有 CA2 usage/cost 和 MR9 observedInput，不等正常流尾才解释。已确认完整互斥三项给 from_usage；完整 prompt total 已知但分项缺失给 upstream_total。total 已含 cache 时不能再加一次 cache；response-cache 免推理零不成为输入零。总量/分项冲突给 inconsistent_usage，保留合法原 usage，不选择较方便数字。

重复 cumulative usage 不相加；固定 parser 必须区分同值重复、可确定的后继统计与冲突。不能证明较新统计覆盖范围时不凭“最后一个 frame”替换可信 I，保留已知分项并把矛盾观察标 unavailable。来源 fieldPaths 由 reader 的具名字段表产生，adapterRevision 取实际固定版本；requestId/model/servingProvider 只取真实同次上游事实，不以路由值补缺。上游别名是否同计数依据，依该 binding 的版本化映射判断，未知影响后继复用，不抹掉响应事实。

终止值沿 runtime 所有的 `StreamEnd` 增量，显式携同次 usage/cost/observedInput 和 serving facts；原 account 事件继续沿既有协议，其值与终止事实来自同一个累积器，不能有两套解析。每条正常、in-band/protocol/解析失败、断流、取消返回都使用该累积器。当前 abort 先于 account yield 的分支必须重构；已提取合法 I 在后续异常中保留，已知事实不因输出不完整而清空。

invoke 在停止对外内容交付后继续驱动 reader 的**取消收口**至最终结果，不能调用 generator.return() 使事实交接被跳过；不等待上游自然结束或未来 usage。reader 观察 abort 后立即调用原 response.stop，停止资源接收；try/finally 等待 stopped、撤去监听，然后从已经冻结的已知 facts 返回终止结果。stream event 的原 account 交出与 final readFacts 保持同源。真正没有读到 usage 才填相应 unavailable；取消不延长原 timeout/停止政策。生命周期所有权仍包含实际 stopped，未停止不能提前释放 lease。失控构件直接 throw 属本地构件故障，不能伪成上游 missing_usage；runtime 记录该违例并保全已经显式交出的事实，不私读 opaque R。

provenance 的原字符串与其他上游回显经现有凭据 owner 的来源脱敏链，在进入公开返回/持久 payload 前完成；fieldPaths/固定版本也不能成为任意 raw 承载口。若脱敏影响来源可判性，事实可以保留，复用必须失败；不为绕脱敏再存第二份原串。独立取得的真实数值 usage 按既有来源政策保真。诊断只记 mode、回退原因、精度、版本和阶段耗时，不打印预像、完整 digest 输入、凭据、输出组内容或原响应。

## 依赖、换代与装卸

Cordis 采用 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)。本增量没有新 service、fiber、任务、计时器或 store。既有稳定 `modelTransport` 和可信模型贡献插件保持原边界；meter/投影/reader 均作为整份贡献的纯组件。

| 取得项与可用时点 | owner／部分失败 | 撤除与保留 |
|---|---|---|
| 完整 definition+meter+projection+reader+兼容依据，验证并发布后可 acquire | 贡献 owner；发布前校验失败不产生半个可用 binding，沿既有插件启动失败；公开注册按既有具名拒绝 | retire 阻止新借用；旧 lease 固定原整组，不能单换 φ 或 reader |
| tokenizer 静态制品/纯函数引用 | 贡献 owner；准备失败释放已取得本地资源，不暗取网络补齐 | 所有旧引用及实际执行结束后 cleanup；同 binding 不得可变闭包热改 |
| 固定计划及在途网络 reader | 原 invocation/lease owner；本地失败走原 stop/stopped 与结果责任 | 发出取消不是已静止；未结束调用跑完并按原 owner 收场，不能靠 Fiber dispose 抹除 |
| 原 MR9 payload 事实 | invoke 交结算 owner；transport 不持有耐久写权 | 已追加事实永不随插件卸载回滚；unknown 原批仍由 runtime 恢复，不能换新版 reader 重算 |

必需服务替换会重跑插件体的依据是 [plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)；跨 effect 不保证串行完成见 [effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)，故排空与资源关闭在原 owner 的同一收口链中等待。配置错误使插件启动失败沿 [plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)，不能以运行期 default 掩盖。三项 probe 均登记，不新增未经核对的 Cordis 主张。候选兼容声明须具体前后 basis、适用输入/供应商范围及证据；默认不能判兼容就 full，不接受 caller `trusted/compatible/skip` 开关。

## 存储与归装配

本节点存储要求新增 **0**：不维护持久锚、索引、Merkle 树、逐消息 token 台账或后台校准。RT10 S-81/MR9 S-45 的共同存储对象仍是 SL3 原 session-log append batch，由 runtime 同一写方提交 response/reply；transport 没有第二个提交。交错一：reader 返回后换代，旧 owner 仍用原事实追加；交错二：原批回执 unknown 后新请求规划，runtime 不能把未确认批当耐久锚，transport 不能私自查日志补证。这两条在 UCT-V9 做真实组合验证。

归装配：显式凭据及脱敏政策、tokenMargin、模型/供应商路由配置、tokenizer 制品来源、诊断 emitter、时钟/耗时测量与终止政策；祖先来源权限、日志读取前缀和 commit unknown 的发布门归 runtime。生产配置继续走既有公共参数/插件校验，不新建配置层。

## 关键选择与未决

| 选择 | 落选方的最强理由 | 本方案弱点与置信度 |
|---|---|---|
| 固定贡献内 full/φ/δ，沿原注册与 lease | 独立 meter 服务便于跨进程共享 tokenizer | 当前无独立状态责任，服务增加身份/换代交接；本方案仍需逐模型证据。高 |
| 一份 canonical 投影与版本化摘要 | caller 自行编码容易独立接入 | 本方案使外部适配器必须提供明确编码；避免多个摘要算法分叉。高 |
| reader 同次终止交接并保留异常前事实 | invoke 读 raw 可少改 reader | 需迁移全部终止分支；否则总量被旧 usage 结构吞掉且来源解释重复。高 |
| 稳定 prefix 只扫描字节，边界有限重分词需依据 | 全量每次重算容易验证与维护 | 增量适配的证明与测试成本更高，复杂模型可能回退 full。高；性能改善幅度待测 |
| 显式模型依据的估算，不默认 I+O | aggregate O 已有且便宜 | φ 对 opaque/隐藏保留语义可能仍不可得；37 个型号不能由统一公式认证。高 |

受阻消费者和关闭条件见 [UCT 验证与缺口](verification.md#v12-响应校准增量)。本稿无新增 binding；有限 TLA 只覆盖其抽象范围，不能认证 tokenizer、上游 I 口径或 37 个型号。契约与本候选接受、公开接口整批迁移、真实模型依据和验收仍须各自完成。
