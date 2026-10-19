# Tool 设计覆盖与验收规范

本页规定已接受设计的持续验证义务，不是运行支持表。产品十二项能力全部承诺在 0.0.0 至 0.1.0 完整交付。验证尚未完成不降低阶段范围。

## 产品到成员的覆盖

| 能力 | 公开契约与对象 | 必要协议 | 最低接受反例 |
| --- | --- | --- | --- |
| CAP-TL01 定义呈现取用 | ToolDefinition、ToolCatalog、ParameterCodec、ToolPresentation | [P02](../SPEC.md#p02-定义准入与队列) | 参数缺说明、重复命令、help与采用不同、未声明programmable、包装来源不可洗白 |
| CAP-TL02 动态可用及dummy | ToolConsumerProfile、AvailabilityFacts、ToolAvailability | P02 | 两端模态各不满足、合法转换（含 conversion 为 null）、附件不可读；dummy不解析参数、不分配环境、不启动 |
| CAP-TL03 当前准入固定发起 | FixedToolRequest、ToolStartRecord、StartPermit | [P01](../SPEC.md#p01-操作事实与资格)、[P04](../SPEC.md#p04-实际发起围栏) | 同身份异输入、排队撤权、批决定不齐、失效与consume两种先后、延迟旧请求不能再发 |
| CAP-TL04 设置限额队列 | QueueReservation、QueuePosition、ResourceScope | P02、[P03](../SPEC.md#p03-环境准备和释放) | 两调用争同名额、同工具换实现、scope的grant缺失或属于他方、不同租户同owner同key不共队列、较早准备未完、取消队首、后台/等待不放名额 |
| CAP-TL05 前后台关系 | ActiveRelation、ForegroundReturn、ControlRecord | [P07](../SPEC.md#p07-计时控制与检查点) | 未许可、Ask和resource转换拒绝、完成与后台化竞争、重复只一个占位、不回前台 |
| CAP-TL06 等待答复 | WaitIntent/WaitRecord、ResponseRecord、DecisionBridge/ResourceResponses | [P06](../SPEC.md#p06-内部等待与答复) | 登记确认丢失、取消后登记迟到、answer确认丢失、答复与取消、资源超时不能用于Ask、普通消息不答原请求 |
| CAP-TL07 结果及采用 | ToolAuthor、OutputCodec、ResultPolicy、RawOutput、ToolResult | [P05](../SPEC.md#p05-执行事实与原输出) | 普通对象content字段不改变分支、renderer抛错原件仍在、codec失败不假报耐久、policy拒绝不重跑；内容 ref 无需附件登记，附件仅文本且零媒体读取 |
| CAP-TL08 过程观察 | ProcessBlock、ToolObservation、ProcessSnapshot | [P08](../SPEC.md#p08-过程分页与全文交接) | 保存前不得展示、快照/增量缝隙、慢观察gap、封块后写、无活体读已展示内容、人用内容不入消费方的请求 |
| CAP-TL09 保管全文取回 | RawOutput、ContentReader、ToolOffloader、Delivery | P05、P08 | 保存成功本域回执丢失、retained/processed两路径、旧release不解除晚到版本、附件换引用、单块超页、消费方归档后仍可依法读 |
| CAP-TL10 控制与撤回 | ToolControl、ControlDispatch/Progress、PhysicalExecution | P07 | stop已接受仍在跑、拒绝/未知不假报停止、withdraw先逻辑终局且名额保持、reach缺失或未知被拒、reach为foreground-and-unadmitted与all的范围分别验证；目标是后台关系（已转后台或发起即后台，不论是否已启动）时 foreground-and-unadmitted 回 rejected（out-of-reach）且调用不变；前台范围的撤回不阻已受理后台子安全resume |
| CAP-TL11 原调用恢复 | ToolRecovery、ToolTask、RecoveryBinding、Checkpoint、DrainState | P01、P03、P04、P07、[P09](../SPEC.md#p09-账目恢复与退出) | prepare/release/suspend响应丢失、查询未知、旧协调者被围栏但物理执行继续、resume拒绝保留旧效果、交接清单变化 |
| CAP-TL12 执行账 | CallAccount、recordAccount、ToolAccounts | P09 | 正常与迟到同源重复不重计、修订替代、未知非零、组织跨边界拒绝、账目读取不披露内容 |

对象的完整身份、生命周期、参数/配置/DI 分类归 [object-model](../docs/object-model.md)。程序组合协议（[composition](../SPEC.md#code-与-tool-的组合协议)）承接 Tool 所有的部分。它的验证反例包括预留后准入未知、父关闭后子受理认回、后台子未收场不能正常结束、Ask计时、异常与 withdraw 的不同 reach 范围、父调用是后台关系时 reach 为 foreground-and-unadmitted 的撤回控制结果为 rejected（out-of-reach）、父域销毁后的保管及成本不重复。程序语言、引擎、help/execute 和执行域隔离的具体验收由程序执行方的提供者与环境提供者交付。

CAP-TL06 与 CAP-TL08 的作者入口由 ToolExecutionContext 的 wait 与 emit 承接。[P11](../SPEC.md#p11-作者输出与等待原语)明确异步保管回执、同步等待语义、有界输出、稳定 key、取消和收尾屏障。它同时影响 CAP-TL07 的最终投影及 CAP-TL11 的接续。完整反例见 [作者组合验证](scenarios.md#作者-emit-和-wait-的组合验证)。类型验证应拒绝 Ask 的 deadline、将等待 Promise 当回应、将 process 当正式结果及把 Context 当收尾能力；实际时序与内存上限仍由提供者验证。

## 验收层次

P14 至 P16 补齐内容 ref/附件地址分流、工具定义的完整投影、配置允许项与合法装载、Cordis 目录和发现隔离，覆盖 CAP-TL01、02、04、07、09、11 的相应边界。反例见[结果分流、装载与依赖隔离](scenarios.md#结果分流装载与依赖隔离)。与决策方的双边协议按决定留到该功能实现时细化，不能据单侧 validator 声称交接完整。

自定义等待由 ToolWaitContract、ToolWaitSchemaSnapshot 与 ToolWaitResponseValidator 承接 CAP-TL06，见 [P12](../SPEC.md#p12-等待-schema-与响应提交)。普通/结构化返回、ToolReturnDeclaration、ToolReturnValidator 与 ToolResult.data 承接 CAP-TL07 及程序执行方的程序数据边界，见 [P13](../SPEC.md#p13-双返回形态与程序输出契约)。[等待与返回反例](scenarios.md#等待-schema-与双返回的验证)覆盖非法提交不结束等待、schema 换代、输出违约、真实效果保留和两种消费者。只有覆盖这些协议的模型或提供者证据才能支持相应验证声明。

ToolOperation 与 ToolAuthorRegistration 将各命令的作者和返回契约封闭配对，承接定义形态及 CAP-TL07。见 [多命令独立返回场景](scenarios.md#多命令独立返回)。编译证明限于已写正负例的局部类型关系；精确命令分派、schema 加载和恢复采用仍需提供者行为验证。

1. 表达验证。提取唯一公开声明并使用实际基础包类型编译；非法等待/关系和错误身份类型必须被拒绝；Cordis定义继承覆盖全部门面方法；本地链接、文档登记和Mermaid解析通过。
2. 协议验证。模型至少包含两个调用、同队列名额、两代协调者、撤权/启动、取消/答复、迟到结果和消费者交接。每个外域操作注入发送前、效果后回包前、本域确认前及恢复查询不可用四个断点。错误变体须命中对应不变量。
3. 提供者验证。真实环境分配、原执行查询和控制、检查点排除、事实源ACK、内容与附件保管、计时连续性、权限变更和跨域启动围栏。内存fake不能代这些证明。
4. 部署验证。声明部署条件下的进程崩溃、OS崩溃、断电和重启；跨进程/异构只有实际采用且证据覆盖时才能声明。介质物理损毁后的新恢复资格不在现行已定政策内。
5. 独立评审与接受。choice评审责任和机制，expression评审精确表达；两者无阻断仍不授予负责人技术接受，测试通过也不授予发布支持。

## 端口一致性套件

`./testing` 的七个套件（见 [public-api](../docs/public-api.md#端口一致性套件testing)）把提供者验证的一部分变成提供者自己可运行的用例。它们覆盖单个端口的可观察承诺，不覆盖耐久、崩溃和跨端口组合。用例名、条款与违约变体的对应在 [tests/README](../tests/README.md#一致性套件的自证)。下表把用例对回产品能力与场景。用例编号 SA、E、B、C、K、S、D、RX 分别属于启动围栏、环境、执行者绑定、输出保管、时钟、决策桥与资源应答共有的 P06 用例、决策桥专有用例和资源应答专有用例。登记语义套件在 `tool-cordis-contract`，用例编号 R，对应见 [tests/README](../../tool-cordis-contract/tests/README.md#登记套件的自证)。

| 用例 | 产品能力 | 场景 | 兑现的承诺 |
| --- | --- | --- | --- |
| SA1–SA3、SA6 | CAP-TL03 | [TL-V02](scenarios.md#tl-v02) | prepare 回的 permit 不授权，守卫的三项都有名字；consume 只成立一次，重送与并发认回同一受理；同一启动的第二份 permit 不再受理；inspect 认回受理 |
| SA4、SA5、SA12 | CAP-TL03 | TL-V02 | 失效先于受理则拒绝，受理先于失效则在途；重送的失效认回原证据且只推进守卫一次 |
| SA7–SA11 | CAP-TL03 | TL-V02 | inspect 认回拒绝；not-started 收回旧 permit，新 permit 可受理；exclude 永久排除未受理的启动，不能推翻已受理的启动 |
| SA13、SA14 | CAP-TL03 | TL-V02 | 同一操作号用于另一个守卫或另一个原因，是 conflict 且没有效果（P01） |
| SA15–SA19 | CAP-TL03 | TL-V02 | 另一租户读不到、受理不了、失效不了、排除不了、准备不了启动，得到的答复与不存在的记录相同 |
| E1–E6 | CAP-TL04、CAP-TL11 | [TL-V07](scenarios.md#tl-v07) | 按准备操作去重（含并发与 pending 时的重送），inspectPreparation 认回，不给另一调用 |
| E7–E10 | CAP-TL11 | TL-V07 | pending 保留原分配，excluded 排除延迟分配，rejected 不降级也不改写原因 |
| E11–E13 | CAP-TL11 | TL-V07 | release 去重，inspectRelease 认回且不冒充已释放 |
| E14、E15 | CAP-TL11 | TL-V07 | 同一操作号用于另一个输入，是 conflict 且没有效果（准备与释放各一条，P01） |
| E16–E19 | CAP-TL11 | TL-V07 | 另一租户读不到准备与释放，拿不到资源，释放不了资源 |
| B1–B6 | CAP-TL11 | TL-V07 | 同 start 不再启动，并发的 start 也只启动一次；另一调用、另一启动、另一租户的 permit 被拒 |
| B7–B13 | CAP-TL07、CAP-TL11 | [TL-V05](scenarios.md#tl-v05)、TL-V07 | inspectStart 的各分支（live、settled、lost、unknown，不查询时不重放）；事实流的开始、来源与游标，从已保存游标重连不跳不重 |
| B14–B16 | CAP-TL07、CAP-TL11 | TL-V05、TL-V07 | ACK 去重并解除源的责任一次，流关闭不是 final |
| B17–B19 | CAP-TL10 | TL-V07 | 停止回执去重且终局回执原样认回，进度单调（accepted 之后不退回 pending，不换证据）；accepted 不是 stopped；已收场回 already-ended |
| B20、B21 | CAP-TL11 | TL-V07 | 同一操作号用于另一个输入，是 conflict 且没有效果（停止与启动各一条，P01） |
| B22、B23 | CAP-TL11 | TL-V07 | 另一租户读不到启动；同一启动操作在另一租户是它自己的执行 |
| C1–C5 | CAP-TL07、CAP-TL09 | TL-V05、[TL-V06](scenarios.md#tl-v06) | 先保管再答复（内容与保管证据逐项有名字），按操作去重，inspect 认回且不编造 |
| C6–C9 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 保管失败不答耐久，答复丢失按操作认回，retainResult 去重且不动原件 |
| C10、C11 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 同一操作号用于另一份字节或另一个结果，是 conflict 且没有效果（P01） |
| C12–C14 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 另一租户读不到输出，不被给予输出，也不能在别人的原输出上保管结果 |
| K1–K5 | CAP-TL04、CAP-TL11 | [TL-V03](scenarios.md#tl-v03)、TL-V07 | begin 只产生标记；没有提交的计时段不影响别的段；elapsed 按标记计时；时间倒退不增加额度；不可比较的 epoch 不被计时 |
| K6–K9 | CAP-TL04 | TL-V03 | waitUntil 到时回 elapsed，信号中止回 cancelled，不提前回 elapsed |
| S1–S5 | CAP-TL06 | [TL-V04](scenarios.md#tl-v04) | ensure 按原 call 与 wait 认回同一登记；inspect 认回、不编造；两个 wait 两个登记；租户之间不串 |
| S6–S8 | CAP-TL06 | TL-V04 | 另一租户读不到登记、查不到操作、失效不了登记，得到的答复与不存在的相同，也不带登记的识别值 |
| S9–S13 | CAP-TL06 | TL-V04 | inspectOperation 的 committed、pending、excluded 与未知；从未发送的操作排除后不落地，也可没有记录；延迟的操作保持 pending，排除后不落地；重送的失效认回原证据 |
| S14–S17 | CAP-TL06 | TL-V04 | 失效只作用于所指的 wait；先到的失效仍作用于原登记；inspect 只读，不当作失效已完成 |
| S18–S21 | CAP-TL06 | TL-V04 | 同一操作身份换了动作、输入、另一个 wait（ensure 与 invalidate 各一条）是 conflict，被拒的复用没有任何效果 |
| D1–D6 | CAP-TL06 | TL-V04 | 另一个操作号仍认回同一登记；inspect 的决定；resolve 交回原决定，no-answer 与 declined 原样；未做的决定被拒绝 |
| D7、D8 | CAP-TL06 | TL-V04 | 另一租户不能解决别人的决定；别的 wait 的决定被拒绝 |
| RX1–RX4 | CAP-TL06 | TL-V04 | inspect 的回应；resolve 交回资源拥有者的值；Tool 不替它造回应 |
| RX5–RX11 | CAP-TL06 | TL-V04 | expire 在期限前被拒，到期且无更早回应时给出可认回的到期事实，较早的回应不被推翻，没有期限的等待不到期，契约不支持到期时是 unsupported，丢失的 expire 回包按操作认回 |
| RX12、RX13 | CAP-TL06 | TL-V04 | 期限与到期支持以登记时为准 |
| RX14、RX15 | CAP-TL06 | TL-V04 | 另一租户不能解决回应，也不能让别人的等待到期 |
| RX16 | CAP-TL06 | TL-V04 | 同一 expire 操作号用于另一个 wait，是 conflict 且没有效果（P01） |

登记套件（`tool-cordis-contract`，R1–R20）：R1–R5 回执、认回与资格（authority、代，R3、R4 即同一身份的异输入 conflict）；R6–R9 fiber、继任者与 release；R10 不碰原工作；R11–R15 核验与写入同步、核验被撤回；R16–R18 并发、已退出与结束 fiber；R19、R20 跨租户的 authority。

承载独立规则的断言都有违约变体：删掉或削弱该断言，自证就变红。类型收窄的断言由编译器守护。证明方式是断言删除变异，逐条结果和前后哈希不随仓库保存。每个套件有一张回答表，由条款推出，经 `finalAnswer` 与 `resendRecalls` 读取答复，跨租户的比较经 `crossTenantAnswers`：两个答复同类，对真实记录的答复里任何一层的值和键都不带出该记录的识别值（先去掉外租户自己提交的值，再做等值检查，长度不小于 8 的识别文本另做子串检查），首答是进度时在完成手柄之后再查一次；自证为每张表生成端口边界上的合法提供者（遮住新操作每个方法的首答，在手柄 resolve 时揭开），它必须全过，没有手柄时需要手柄的用例恰好是不适用的那些。守约但不同的提供者（首答进度的环境与绑定、真正延迟的环境与外部对端、合并事实的执行者、先预核验再最后核验的登记服务、围栏式的 `excluded` 等）必须全过，各 spec 的 `legal` 表只引用 `*-legal.ts` 里的提供者。手柄在延迟工作落地前就 resolve 的夹具，每个落地手柄至少让一条用例失败。

条款没有写到能判定通过与否的方法，不写用例，待设计拥有者补足条款后再加。时钟：`elapsed` 的入参证据与 `begin` 回的标记是什么关系（套件取为标记本身）；“已用时间只累计已提交的计时段”在时钟端口上没有提交这个输入，累计归 `ToolCommands`；不可比较的 epoch 在 `Reply` 里没有 unknown 值（套件要求失败，不指定哪一种）；`waitUntil` 的时刻格式、已过去的时刻和信号同时中止的先后；`now()` 与 `waitUntil` 的时刻是否同一格式。决策桥与资源应答：`ensure` 与 `invalidate` 回包丢失时的失败种类（套件用 `hold` 手柄表达“未应用且回包丢失”，不判回包种类）；`resolve` 对不是原决定的证据回哪一种失败；`expire` 对未到期与有更早回应的失败种类；资源应答的 `ensure` 是否也按 call 与 wait 认回而不管操作号。登记：每次 `register` 是否都核验（套件取为是，包括认回）、已退出 fiber 的失败种类、token“不可猜测”在端口上无法判定（套件只查非空且互不相同）、“不取消原工作”只能以“目录从不调用该 handle”作观察代理。时钟的租户隔离经 `elapsed(evidence)` 不可观察（入参只有证据，没有 access），所以时钟套件没有跨租户用例；时钟替身信任标记里的文本，伪造的标记照常被计时，这取决于 `elapsed` 取哪种证据，同属上述第一项。登记与资源应答各有一条条款读法未经契约拥有者确认，套件保持现行读法。登记：`release` 若打开并中止该 handle 上的观察，是否违反[登记协议](../../tool-cordis-contract/docs/cordis.md#登记输入与撤除协议)的“不取消原工作”；R10（registering and releasing never touch the original work）取严格读法，要求目录从不调用该 handle 的 `observe`。资源应答：到期是否必须在 `inspect` 上可见；RX6（expire at the deadline gives an expiry that resolves as expired）要求 `inspect` 显示到期事实。同样待契约拥有者补足的还有：同一操作异输入是否返回 conflict（P01 对外部对端；决策桥与资源应答的操作账已按 P06“回执逐项绑定动作种类、原 wait、采用和输入摘要”判定并回 conflict，其余对端沿用此处所列），对从未准备的资源 release，过期游标与未知批次确认的失败语义，`lost` 的“可信连续性排除”怎样在端口上判定。下列两项待裁定。停止重送的读法：套件取“重送可报告当前进度，进度单调，终局逐字节认回”，严格读法是“相同提交身份一律返回原 accepted 受理”，若取严格读法，`resendRecalls` 只加一条。启动围栏的 `inspect` 是否允许改变状态（替身在 inspect 里撤销 permit 并造排除），P04 对此没有写，套件的 SA8 两种都容忍。启动围栏套件对本地协调器（`tool-host-local`（[本增量未交付](../../README.md#未交付标注)））的运行结果见 [public-api 的 `./testing` 一节](../docs/public-api.md#端口一致性套件testing)。

## 必须区分的失败

准入拒绝、正常业务失败、外部操作结果未知、持久提交未知、当前无活体、可靠确认连续性丢失和原件保管故障分别有证据。验证不得把它们都模拟为一个抛异常再重试。外部效果发生与否独立于终局、停止受理和资源释放；验收必须检查“不声称已撤销”以及“不制造第二执行”。

## 未决与实施条件

[open-questions](../docs/architecture.md#tool-设计状态与外部缺项)保留 MODEL-E01 的共享值迁移与发送验证、具体提供者采用和真实故障证据。Tool本域的公开形状、操作协议和对象分解已有设计；设计接受不表示已实现，未验证不能称已兑现。每项验收记录应写明所用文档版本、实际构建、提供者、环境、oracle、命令、结果及未覆盖范围。
