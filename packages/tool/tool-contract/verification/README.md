# Tool 持续验证资源

本目录维护 Tool 契约的持续验证义务：产品覆盖与验收规范、旅程验证场景，以及模型与证明的位置。覆盖表与场景说明不表示已实现验收，也不表示设计已接受。行为唯一正文归 [SPEC](../SPEC.md)。

本目录维护契约验证要求；实现包另有 [普通调用恢复有界模型](../../tool/verification/models/README.md)，只覆盖其声明范围，不证明完整契约。后续提供者须按实际环境补充相称证据，注明前提和未覆盖。单次运行、临时模型、候选比较和评审报告留任务 tmp；独立验收由验收责任者维护。

阅读路径见 [index](index.md)。

## 设计覆盖与验收规范

本页规定已接受设计的持续验证义务，不是运行支持表。产品十二项能力全部承诺在 0.0.0 至 0.1.0 完整交付。验证尚未完成不降低阶段范围。

### 产品到成员的覆盖

| 能力 | 公开契约与对象 | 必要协议 | 最低接受反例 |
| --- | --- | --- | --- |
| CAP-TL01 定义呈现取用 | ToolDefinition、ToolGovernance、ToolImplementationFacts、ToolCatalog、ParameterCodec、ToolPresentation | [P02](../SPEC.md#p02-定义准入与队列) | 参数缺说明、重复命令、help与采用不同、未声明programmable、包装来源不可洗白、资产 name 与定义 name 不一致须拒绝装载 |
| CAP-TL02 动态可用及dummy | ToolConsumerProfile、AvailabilityFacts、ToolAvailability、ToolBindingRegistry、换代协调者 | P02、[常驻持有者规则](../SPEC.md#会话常驻规则r1r5) | 两端模态各不满足、合法转换（含 conversion 为 null）、附件不可读；dummy不解析参数、不分配环境、不启动；Run 中途加入或前进、不同形候选替换常驻项、暂时缺席判冻结，见[动态性的验证义务](#动态性的验证义务) |
| CAP-TL03 当前准入固定发起 | FixedToolRequest、ToolStartRecord、StartPermit | [P01](../SPEC.md#p01-操作事实与资格)、[P04](../SPEC.md#p04-实际发起围栏) | 同身份异输入、排队撤权、批决定不齐、失效与consume两种先后、延迟旧请求不能再发 |
| CAP-TL04 设置限额队列 | QueueReservation、QueuePosition、ResourceScope | P02、[P03](../SPEC.md#p03-环境准备和释放) | 两调用争同名额、同工具换实现、scope的grant缺失或属于他方、不同租户同owner同key不共队列、较早准备未完、取消队首、后台/等待不放名额 |
| CAP-TL05 前后台关系 | ActiveRelation、ForegroundReturn、ControlRecord | [P07](../SPEC.md#p07-计时控制与检查点) | 未许可、Ask和resource转换拒绝、完成与后台化竞争、重复只一个占位、不回前台 |
| CAP-TL06 等待答复 | WaitIntent/WaitRecord、ResponseRecord、DecisionBridge/ResourceResponses | [P06](../SPEC.md#p06-内部等待与答复) | 登记确认丢失、取消后登记迟到、answer确认丢失、答复与取消、资源超时不能用于Ask、普通消息不答原请求 |
| CAP-TL07 结果及采用 | ToolAuthor、OutputCodec、ResultPolicy、RawOutput、ToolResult | [P05](../SPEC.md#p05-执行事实与原输出) | 普通对象content字段不改变分支、renderer抛错原件仍在、codec失败不假报耐久、policy拒绝不重跑；内容 ref 无需附件登记，附件仅文本且零媒体读取 |
| CAP-TL08 过程观察 | ProcessBlock、公共 `StreamFrame` 上的 ToolStreamSnapshot / ToolStreamDelta / ToolStreamEnd、ProcessSnapshot | [P08](../SPEC.md#p08-过程分页与全文交接) | 保存前不得展示、快照/增量缝隙、慢观察gap、封块后写、无活体读已展示内容、人用内容不入消费方的请求 |
| CAP-TL09 保管全文取回 | RawOutput、ContentReader、ToolOffloader、Delivery | P05、P08 | 保存成功本域回执丢失、retained/processed两路径、旧release不解除晚到版本、附件换引用、单块超页、消费方归档后仍可依法读 |
| CAP-TL10 控制与撤回 | ToolControl、ControlDispatch/Progress、PhysicalExecution | P07 | stop已接受仍在跑、拒绝/未知不假报停止、withdraw先逻辑终局且名额保持、reach缺失或未知被拒、reach为foreground-and-unadmitted与all的范围分别验证；目标是后台关系（已转后台或发起即后台，不论是否已启动）时 foreground-and-unadmitted 回 rejected（out-of-reach）且调用不变；前台范围的撤回不阻已受理后台子安全resume |
| CAP-TL11 原调用恢复 | ToolRecovery、ToolTask、RecoveryBinding、Checkpoint、DrainState | P01、P03、P04、P07、[P09](../SPEC.md#p09-账目恢复与退出) | prepare/release/suspend响应丢失、查询未知、旧协调者被围栏但物理执行继续、resume拒绝保留旧效果、交接清单变化 |
| CAP-TL12 执行账 | CallAccount、recordAccount、ToolAccounts | P09 | 正常与迟到同源重复不重计、修订替代、未知非零、组织跨边界拒绝、账目读取不披露内容 |

对象的完整身份、生命周期、参数/配置/DI 分类归 [object-model](../docs/object-model.md)。程序组合协议（[composition](../SPEC.md#code-与-tool-的组合协议)）承接 Tool 所有的部分。它的验证反例包括预留后准入未知、父关闭后子受理认回、后台子未收场不能正常结束、Ask计时、异常与 withdraw 的不同 reach 范围、父调用是后台关系时 reach 为 foreground-and-unadmitted 的撤回控制结果为 rejected（out-of-reach）、父域销毁后的保管及成本不重复。程序语言、引擎、help/execute 和执行域隔离的具体验收由程序执行方的提供者与环境提供者交付。

CAP-TL06 与 CAP-TL08 的作者入口由 ToolExecutionContext 的 wait 与 emit 承接。[P11](../SPEC.md#p11-作者输出与等待原语)明确异步保管回执、同步等待语义、有界输出、稳定 key、取消和收尾屏障。它同时影响 CAP-TL07 的最终投影及 CAP-TL11 的接续。完整反例见 [作者组合验证](#作者-emit-和-wait-的组合验证)。类型验证应拒绝 Ask 的 deadline、将等待 Promise 当回应、将 process 当正式结果及把 Context 当收尾能力；实际时序与内存上限仍由提供者验证。

### 验收层次

P14 至 P16 补齐内容 ref/附件地址分流、工具定义的完整投影、配置允许项与合法装载、Cordis 目录和发现隔离，覆盖 CAP-TL01、02、04、07、09、11 的相应边界。反例见[结果分流、装载与依赖隔离](#结果分流装载与依赖隔离)。与决策方的双边协议按决定留到该功能实现时细化，不能据单侧 validator 声称交接完整。

自定义等待由 ToolWaitContract、ToolWaitSchemaSnapshot 与 ToolWaitResponseValidator 承接 CAP-TL06，见 [P12](../SPEC.md#p12-等待-schema-与响应提交)。普通/结构化返回、ToolReturnDeclaration、ToolReturnValidator 与 ToolResult.data 承接 CAP-TL07 及程序执行方的程序数据边界，见 [P13](../SPEC.md#p13-双返回形态与程序输出契约)。[等待与返回反例](#等待-schema-与双返回的验证)覆盖非法提交不结束等待、schema 换代、输出违约、真实效果保留和两种消费者。只有覆盖这些协议的模型或提供者证据才能支持相应验证声明。

ToolOperation 与 ToolImplementation 将各命令的作者和返回契约封闭配对，承接定义形态及 CAP-TL07。见 [多命令独立返回场景](#多命令独立返回)。编译证明限于已写正负例的局部类型关系；精确命令分派、schema 加载和恢复采用仍需提供者行为验证。

1. 表达验证。提取唯一公开声明并使用实际基础包类型编译；非法等待/关系和错误身份类型必须被拒绝；Cordis定义继承覆盖全部门面方法；本地链接、文档登记和Mermaid解析通过。
2. 协议验证。模型至少包含两个调用、同队列名额、两代协调者、撤权/启动、取消/答复、迟到结果和消费者交接。每个外域操作注入发送前、效果后回包前、本域确认前及恢复查询不可用四个断点。错误变体须命中对应不变量。
3. 提供者验证。真实环境分配、原执行查询和控制、检查点排除、事实源ACK、内容与附件保管、计时连续性、权限变更和跨域启动排序域。内存fake不能代这些证明。
4. 部署验证。声明部署条件下的进程崩溃、OS崩溃、断电和重启；跨进程/异构只有实际采用且证据覆盖时才能声明。介质物理损毁后的新恢复资格不在现行已定政策内。
5. 独立评审与接受。choice评审责任和机制，expression评审精确表达；两者无阻断仍不授予负责人技术接受，测试通过也不授予发布支持。

### 动态性的验证义务

[完全动态目标](../../../../docs/requirements.md#完全动态目标sys-dynamic)列出 Tool 的十条验收判据，判据正文归该页。本节规定承载这些判据的验证资源。规则正文归 SPEC 的 [G7](../SPEC.md#342-契约缺口决定) 与[常驻持有者规则](../SPEC.md#会话常驻规则r1r5)。

- 常驻持有者规则 R1–R5 与采用点判定表由纯函数 `shapeOf`、`planAdoption`、`refreshAvailability`、`foldResident` 承载，用表驱动测试逐行验证。`refreshAvailability` 的返回类型不含加入、前进与冻结。
- 绑定登记表增加 G7 套件，写法同现有登记语义套件。
- 换代协调者与作者插件在真实 Cordis 4.0.4 `Context` 上用动态性套件 `runToolDynamicsSuite` 验证。fixture 记录稳定提供者的 fiber uid。
- 根已 ACTIVE 后动态装载并撤除带登记的作者插件，需要 Cordis basis 条目与探针证明。

| 判据 | 主题 | 承载 |
| --- | --- | --- |
| 1 | 稳定提供者的 fiber uid 不变 | 动态性套件 |
| 2 | 同键认回与 conflict，release 与后继 | G7 套件 |
| 3 | 有引用时 `retained` | 动态性套件 |
| 4 | 无引用且无在途调用时 `released` | 动态性套件 |
| 5 | 新旧版本并存 | 动态性套件 |
| 6 | 同形新版只在采用点前进 | 纯函数表驱动测试与动态性套件 |
| 7 | 不同形新版留旧 | 纯函数表驱动测试与动态性套件 |
| 8 | 突然撤除 fiber | 动态性套件 |
| 9 | 冻结判定 | 纯函数表驱动测试与动态性套件 |
| 10 | 无关能力零失败，[P16](../SPEC.md#p16-目录与发现的故障隔离)不变 | 动态性套件 |

有在途调用的排空依赖 [P09](../SPEC.md#p09-账目恢复与退出) 的 `inspectDrain({ executor })`，在 [#421](https://github.com/nemori-ai/omne-harness-lite/issues/421) 的 6.8 验收。

成立前提是单机、单进程与非耐久登记表。跨进程、远端目录与耐久存储不在覆盖之内。`shapeOf` 用文本规范化比较 schema，语义等价但文本不同的 schema 判为不同形。这偏向留旧版，不会误冻结。

### 端口一致性套件

`./testing` 的十个套件（见 [public-api](../docs/public-api.md#端口一致性套件testing)）把提供者验证的一部分变成提供者自己可运行的用例。它们覆盖单个端口的可观察承诺，不覆盖耐久、崩溃和跨端口组合。用例名、条款与违约变体的对应在 [tests/README](../tests/README.md#一致性套件的自证)。下表把用例对回产品能力与场景。用例编号 SA、E、B、C、K、S、D、RX 分别属于启动排序域、环境、执行者绑定、输出保管、时钟、决策桥与资源应答共有的 P06 用例、决策桥专有用例和资源应答专有用例；F、A、RP 分别属于外层调用方的启动围栏、授权消费点和结果接收端口（编号见各自 spec 的 `NAMES`）。登记语义套件在 `tool-cordis-contract`，用例编号 R，对应见 [tests/README](../../tool-cordis-contract/tests/README.md#登记套件的自证)。

| 用例 | 产品能力 | 场景 | 兑现的承诺 |
| --- | --- | --- | --- |
| SA1–SA3、SA6 | CAP-TL03 | [TL-V02](#tl-v02) | prepare 回的 permit 不授权，守卫的三项都有名字；consume 只成立一次，重送与并发认回同一受理；同一启动的第二份 permit 不再受理；inspect 认回受理 |
| SA4、SA5、SA12 | CAP-TL03 | TL-V02 | 失效先于受理则拒绝，受理先于失效则在途；重送的失效认回原证据且只推进守卫一次 |
| SA7–SA11 | CAP-TL03 | TL-V02 | inspect 认回拒绝；not-started 收回旧 permit，新 permit 可受理；exclude 永久排除未受理的启动，不能推翻已受理的启动 |
| SA13、SA14 | CAP-TL03 | TL-V02 | 同一操作号用于另一个守卫或另一个原因，是 conflict 且没有效果（P01） |
| SA15–SA19 | CAP-TL03 | TL-V02 | 另一租户读不到、受理不了、失效不了、排除不了、准备不了启动，得到的答复与不存在的记录相同 |
| F1–F8 | CAP-TL03、CAP-TL10 | TL-V02、[TL-V07](#tl-v07) | 围栏证据返回后旧修订号的 permit 不再受理，已受理的启动不受影响，之后的 permit 照常受理；重送认回首次证据，同一操作号配另一守卫输入是 conflict；另一租户的围栏不影响本租户；另一租户的主体与无资格主体的失效回复 denied，守卫不变，不披露守卫是否存在。围栏与启动排序域共用一个排序域 |
| A1–A10 | CAP-TL03 | TL-V02 | consume 消费绑定的许可一次，重送认回；另一调用出示已消费的许可不启动；受理前撤权回复 rejected 且不消费许可；受理后撤权不撤销受理（残余窗口）；not-started 不消费许可；许可台账或准入裁定不可读时回复 unknown，恢复后同一 permit 照常受理；他租户的许可永不消费；接续不再消费；守卫拒绝时不消费 |
| RP1–RP13 | CAP-TL07、CAP-TL09 | [TL-V05](#tl-v05)、[TL-V06](#tl-v06) | saved 回执带原 key，证据归冻结的消费拥有者；同 key 同内容认回，异内容 conflict；接收方保留自己的副本；租户取自调用引用并进入认回键；非法引用与纯关系表的失败；已中止的 signal 只取消新 key；一个租户占满份额不阻塞另一租户；没有原消费关联是 invalid not-accepted，同一调用推向另一位置是 consumer not-original；同租户无接收资格的主体被拒且不保存 |
| E1–E6 | CAP-TL04、CAP-TL11 | [TL-V07](#tl-v07) | 按准备操作去重（含并发与 pending 时的重送），inspectPreparation 认回，不给另一调用 |
| E7–E10 | CAP-TL11 | TL-V07 | pending 保留原分配，excluded 排除延迟分配，rejected 不降级也不改写原因 |
| E11–E13 | CAP-TL11 | TL-V07 | release 去重，inspectRelease 认回且不冒充已释放 |
| E14、E15 | CAP-TL11 | TL-V07 | 同一操作号用于另一个输入，是 conflict 且没有效果（准备与释放各一条，P01） |
| E16–E19 | CAP-TL11 | TL-V07 | 另一租户读不到准备与释放，拿不到资源，释放不了资源 |
| B1–B6 | CAP-TL11 | TL-V07 | 同 start 不再启动，并发的 start 也只启动一次；另一调用、另一启动、另一租户的 permit 被拒 |
| B7–B13 | CAP-TL07、CAP-TL11 | [TL-V05](#tl-v05)、TL-V07 | inspectStart 的各分支（live、settled、lost、unknown，不查询时不重放）；事实流的开始、来源与游标，从已保存游标重连不跳不重 |
| B14–B16 | CAP-TL07、CAP-TL11 | TL-V05、TL-V07 | ACK 去重并解除源的责任一次，流关闭不是 final |
| B17–B19 | CAP-TL10 | TL-V07 | 停止回执去重且终局回执原样认回，进度单调（accepted 之后不退回 pending，不换证据）；accepted 不是 stopped；已收场回 already-ended |
| B20、B21 | CAP-TL11 | TL-V07 | 同一操作号用于另一个输入，是 conflict 且没有效果（停止与启动各一条，P01） |
| B22、B23 | CAP-TL11 | TL-V07 | 另一租户读不到启动；同一启动操作在另一租户是它自己的执行 |
| C1–C5 | CAP-TL07、CAP-TL09 | TL-V05、[TL-V06](#tl-v06) | 先保管再答复（内容与保管证据逐项有名字），按操作去重，inspect 认回且不编造 |
| C6–C9 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 保管失败不答耐久，答复丢失按操作认回，retainResult 去重且不动原件 |
| C10、C11 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 同一操作号用于另一份字节或另一个结果，是 conflict 且没有效果（P01） |
| C12–C14 | CAP-TL07、CAP-TL09 | TL-V05、TL-V06 | 另一租户读不到输出，不被给予输出，也不能在别人的原输出上保管结果 |
| K1–K5 | CAP-TL04、CAP-TL11 | [TL-V03](#tl-v03)、TL-V07 | begin 只产生标记；没有提交的计时段不影响别的段；elapsed 按标记计时；时间倒退不增加额度；不可比较的 epoch 不被计时 |
| K6–K9 | CAP-TL04 | TL-V03 | waitUntil 到时回 elapsed，信号中止回 cancelled，不提前回 elapsed |
| S1–S5 | CAP-TL06 | [TL-V04](#tl-v04) | ensure 按原 call 与 wait 认回同一登记；inspect 认回、不编造；两个 wait 两个登记；租户之间不串 |
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

条款没有写到能判定通过与否的方法，不写用例，待设计拥有者补足条款后再加。时钟：`elapsed` 的入参证据与 `begin` 回的标记是什么关系（套件取为标记本身）；“已用时间只累计已提交的计时段”在时钟端口上没有提交这个输入，累计归 `ToolCommands`；不可比较的 epoch 在 `Reply` 里没有 unknown 值（套件要求失败，不指定哪一种）；`waitUntil` 的时刻格式、已过去的时刻和信号同时中止的先后；`now()` 与 `waitUntil` 的时刻是否同一格式。决策桥与资源应答：`ensure` 与 `invalidate` 回包丢失时的失败种类（套件用 `hold` 手柄表达“未应用且回包丢失”，不判回包种类）；`resolve` 对不是原决定的证据回哪一种失败；`expire` 对未到期与有更早回应的失败种类；资源应答的 `ensure` 是否也按 call 与 wait 认回而不管操作号。登记：每次 `register` 是否都核验（套件取为是，包括认回）、已退出 fiber 的失败种类、token“不可猜测”在端口上无法判定（套件只查非空且互不相同）、“不取消原工作”只能以“目录从不调用该 handle”作观察代理。时钟的租户隔离经 `elapsed(evidence)` 不可观察（入参只有证据，没有 access），所以时钟套件没有跨租户用例；时钟替身信任标记里的文本，伪造的标记照常被计时，这取决于 `elapsed` 取哪种证据，同属上述第一项。登记与资源应答各有一条条款读法未经契约拥有者确认，套件保持现行读法。登记：`release` 若打开并中止该 handle 上的观察，是否违反[登记协议](../../tool-cordis-contract/docs/cordis.md#登记输入与撤除协议)的“不取消原工作”；R10（registering and releasing never touch the original work）取严格读法，要求目录从不调用该 handle 的 `observe`。资源应答：到期是否必须在 `inspect` 上可见；RX6（expire at the deadline gives an expiry that resolves as expired）要求 `inspect` 显示到期事实。同样待契约拥有者补足的还有：同一操作异输入是否返回 conflict（P01 对外部对端；决策桥与资源应答的操作账已按 P06“回执逐项绑定动作种类、原 wait、采用和输入摘要”判定并回 conflict，其余对端沿用此处所列），对从未准备的资源 release，过期游标与未知批次确认的失败语义，`lost` 的“可信连续性排除”怎样在端口上判定。下列两项待裁定。停止重送的读法：套件取“重送可报告当前进度，进度单调，终局逐字节认回”，严格读法是“相同提交身份一律返回原 accepted 受理”，若取严格读法，`resendRecalls` 只加一条。启动排序域的 `inspect` 是否允许改变状态（替身在 inspect 里撤销 permit 并造排除），P04 对此没有写，套件的 SA8 两种都容忍。启动排序域套件对本地协调器（`tool-host-local`）的运行结果见 [public-api 的 `./testing` 一节](../docs/public-api.md#端口一致性套件testing)。

### 必须区分的失败

准入拒绝、正常业务失败、外部操作结果未知、持久提交未知、当前无活体、可靠确认连续性丢失和原件保管故障分别有证据。验证不得把它们都模拟为一个抛异常再重试。外部效果发生与否独立于终局、停止受理和资源释放；验收必须检查“不声称已撤销”以及“不制造第二执行”。

### 未决与实施条件

[open-questions](../docs/architecture.md#tool-设计状态与外部缺项)保留 MODEL-E01 的共享值迁移与发送验证、具体提供者采用和真实故障证据。Tool本域的公开形状、操作协议和对象分解已有设计；设计接受不表示已实现，未验证不能称已兑现。每项验收记录应写明所用文档版本、实际构建、提供者、环境、oracle、命令、结果及未覆盖范围。

## 旅程验证场景

### 结果分流、装载与依赖隔离

下列是 P14 至 P16 的实施验收要求，尚无运行实现证据。

| 场景 | 必须观察的结果 |
| --- | --- |
| attachments 有图片，content 只有文本 | 只追加地址文本；媒体 reader 调用次数为零，只处理文本的消费方不因附件失去资格 |
| content 有对消费方可见的图片 ref，attachments 为空 | 合法结果；投影阶段零二进制读取，消费方实际需要时才读取该 ref |
| 同一引用显式同时放两处 | 保留内容 ref 和地址提示；不按地址去重，不让其他附件自动升级 |
| 仅人侧 ref 或未披露地址 | 不交付人侧内容；未经披露资格的地址不进入结果消息，不以附件读取资格替代外传资格 |
| 地址文本恰好像 URL、JSON 或媒体标记 | 仍为文本，不自动解析成媒体、不发网络读取 |
| 发送前失权、内容缺失、摘要不符或超预算 | 不发送残缺请求；关闭媒体租约，原结果继续保管，不重执行工具 |
| 投影重试或附件块身份冲突 | 重试沿原结果和消息位置；数量不符、重复及碰撞拒绝，不追加第二份消息 |
| ToolDefinition 为单函数或多命令 | 定义投影保留原工具/命令与 schema，description 包含原描述及 programmable 语义；投影不能表达时 unsupported |
| 配置含未声明路径、重叠路径、无效默认值或越权来源 | 装载失败，不发布部分贡献，不把配置合并进调用 A 或 DI 的 E |
| 新配置失败、旧调用恢复、旧贡献 token 迟到 release | 后续候选不半更新；旧调用使用原采用；旧 token 不能删除新贡献 |
| 只撤 Catalog 或 Directory 提供者 | 持久读、控制与结果交接仍可用；相应发现或 connect 明确 unavailable；与目录存在但无路由区分 |
| Directory 换代，已有 executor 和 observer | 旧观察明确结束；新 connect 得新代。只重建发布子 fiber，真实 start/resume 次数不增加 |
| 已受理的 admit 重试遇到 Catalog 缺席 | 核当前资格后认回原操作，不降成未受理、不新建调用 |

真实提供者须验证媒体读取时机、跨 fiber 撤除和在途执行次数；类型编译或 Mermaid 解析不证明这些行为。与决策方的双边提交细节在该功能实现时补足及评审。

本页维护 TL-V01 至 TL-V07 的持续验证要求。行为条款归 [SPEC](../SPEC.md)，覆盖矩阵归 [coverage](README.md)。这些场景尚未成为可执行验收，实际执行证据留任务 tmp。

### 作者 emit 和 wait 的组合验证

本节承接 [P11](../SPEC.md#p11-作者输出与等待原语)，分别展开 TL-V03 的等待、TL-V05 的过程和 TL-V07 的恢复。以下是提供者必须执行的反例，文档存在不表示运行通过。

| 场景 | 必须观察到的结果 |
| --- | --- |
| emit A、emit B、return R，B 的存储响应先到 | 仍按 A、B 顺序发布；正常 final 不越过未确认 A；R 的原件先保管 |
| emit 请求说明后立即 wait，输出保存未知 | 不提前登记；原输出继续按原身份认回，不产生新事件；取消通路可推进 |
| await emit，作者尚未 return | 宿主已读取并保存事实，回执可以完成，不与作者相互等待 |
| 观察者断线或缓慢，事实存储正常 | emit 可以确认；观察者按 P08 gap 或快照恢复；不得假报工具失败 |
| 未 await 的大量 emit，额度已满 | 明确 capacity，拒绝项不暗中排队；在途字节、条数和累计状态均有界 |
| 单更新过大、累计 append 超额、输入随后被修改 | too-large 明确未受理；已受理副本不变；无静默裁剪或丢事件 |
| append 后 replace 同 index，或封块后再次 emit | invalid，不能改变模式或已封内容；新的合法 index 仍按配置准入 |
| 作者捕获输出保存 unknown 后 return | completed 被屏障阻止；继续原责任；永久保管故障不能被 catch 洗成成功 |
| 同 key 同请求重复 wait，异 key 并发 wait | 前者认回原等待、原回应和一次 consumed/continued 事实，多个 helper 可以各自继续；后者 busy；同 key 异请求 conflict |
| resource 等待的 E 在登记前变化 | ensure 仍使用原 request 保管证据；不改任务关联，不重新提交外部任务 |
| Ask 带 deadline、普通 Promise 当请求、后台 wait | 类型或入口拒绝；不开放登记或资源登记；Ask 不出现 expired |
| 伪造回应、原请求非法、协议不支持到期 | 不填空答案，不把未经核验的 JSON 当有效回应；区分开放前拒绝和开放后仍待处理 |
| 取消先成立，再收到允许决定 | wait 返回 cancelled，不能返回 answer；迟到登记仍须失效 |
| 回应已接收，continued 回执丢失 | 原 source/response 认回，无第二次作者接续；计时使用实际源 marker |
| 作者忘记 await wait，直接 return | 原 R 保管，拒绝正常 completed；等待关闭并保留可靠失效任务 |
| 取消、return 或旧实例关闭后持缓存 context 调用 | 新原语拒绝；既存事实与原副作用仍可保管，不能伪造回滚 |
| live-only 源丢失，与 checkpointed 恢复分别执行 | 前者报告连续性丢失；后者恢复输出位置、key/回应及程序位置，并证明旧执行排除 |
| 独立上下文缺 wait、返回 local 回执；托管绑定返回 local | 独立缺能力为 unsupported，local 不承诺耐久；托管视为提供者违约 |
| 长期执行积累不同 wait key，独立适配器无耐久索引 | 达到历史字节或条数上限即拒绝新 key；旧 key 仍可认回，异输入冲突；不静默淘汰 |
| 回应超过协议预留上限，托管索引暂时不可用 | 前者拒绝无效回应并保留原外域责任；后者不能把旧 key 当新等待，不能无限载入历史 |
| finish 重复、异 exit、输出队列满时停止 | 同值认回，异值拒绝；停止不排在满队列之后；不遗漏原责任 |

协议模型只证明其抽象和输入假设。实现后还须测量真实队列及闭包保留量，验证原 source 的保存/发布窗口、检查点和提供者撤除，不能用类型通过代替这些证据。

### 等待 schema 与双返回的验证

本节分别承接 [P12](../SPEC.md#p12-等待-schema-与响应提交)和 [P13](../SPEC.md#p13-双返回形态与程序输出契约)。这些是持续验证义务，不是提供者已通过的运行结论。

| 输入或交错 | 必须观察到的结果 |
| --- | --- |
| 两个工具的自定义回应分别为审批枚举和资源对象 | 各用原 schema 验证；类型从各自 contract 取得，不交叉解释 |
| 请求 schema 不合法、未知协议或未准入构造 | 等待开放前拒绝，不创建登记或资源登记 |
| 已开放后提交字段缺失、类型错误或越界值 | 给提交方安全的字段问题；wait 不完成、不消费对原请求的有效决定 |
| 首次提交错误，再以新 submission 修正 | 保留同一 wait，正确提交可以成为唯一有效回应 |
| 原 submission 回包未知后换内容重试 | conflict；同内容按原身份查询，不产生两个有效决定 |
| 形状正确，但响应人无权或资源不在候选集 | 拒绝生效，不能凭 schema 合法恢复工具 |
| 校验通过后等待取消、资格撤回或另一答复先提交 | 最终提交守卫发现变化；不会确认两份有效回应 |
| schema 更新或原加载服务撤除 | 继续原修订或明确 unavailable，不自动采用最新版 |
| Ask 的 no-answer/declined、资源到期 | 前两者不套 answer.value schema；资源到期由原协议证明，不能用于 Ask |
| 接收方已宣布有效，但 resolve 给出不匹配内容 | 提供者故障，保留原决定，不改称未回答或再登记 |
| ordinary 返回带 content/data 字段的对象 | 仍按普通 R 检查和渲染，不暗变结构化模式 |
| structured 返回非 ToolResult | 类型拒绝；运行时越界输入也拒绝，不能调用 result(R) 猜转换 |
| 实际返回与 TS 注解不同，或 count 与列表长度矛盾 | 输出验证失败，cause=result，原件和真实效果保留 |
| renderer、程序编码、schema 或整结果政策各自失败 | 能定位阶段；不能发布 completed，不能自动重跑原工具 |
| 校验服务暂时消失但原工具已执行 | 继续保管原返回和 settle 任务，服务恢复只重做验证 |
| ordinary 与 structured 产生相同合法程序数据 | 都取得一个规范 ToolResult 版本；程序执行方不需要知道作者写法 |
| 工具已完成外部副作用但返回值非法 | effect 仍为 occurred 或真实未知，不改成 not-started 或撤销成功 |
| program=none 或工具业务返回为失败联合 | 前者不提供臆造字段；后者不因 schema 合法而自动当业务成功 |
| Catalog 输出 schema 与实际绑定或旧结果版本不同 | 准入或消费拒绝，不用当前新 schema 解释旧数据 |
| 程序数据跨域含函数、宿主对象、不可表达数或循环值 | 明确编码失败，不静默丢值，不泄漏宿主引用 |
| 消费方的消息投影、不同权限读取者、程序执行方分别读结果 | data 不自动进入消费方的请求；完整结果读取资格不足时整次拒绝，不伪装为 data=none；消费方的受信适配器生成展示投影 |
| 多页结果及卸载 | 每页程序元数据相同，按版本认回；无截断JSON或卸载改值；预算不足不发布假可取结果 |
| data 与展示文本含义不同但各自形状合法 | 不声称 schema 证明等价，由具体工具映射断言识别差异 |

类型探针应覆盖直接 ToolResult 作者、普通作者、推断的等待回应类型、Ask 不可到期、无契约泛型、缺失返回声明和结构化错误返回。实际持久提交、竞争、权限与跨域编码仍由提供者组合验证。

#### 多命令独立返回

本组承接 [逐操作注册与选择](../SPEC.md#多命令作者注册与返回选择)，不能仅验证整张命令表存在 returns。

| 场景 | 必须观察到的结果 |
| --- | --- |
| read/list 的 A/R 不同，write 直接返回 ToolResult | 同表登记，不要求共同 R；各操作类型独立，settle 统一外层结果 |
| read 的执行器接上 write 的返回验证器或渲染器 | 类型探针拒绝不兼容关系；运行时越界输入也不能冒充已验证 |
| read 返回恰好符合 write schema 的对象 | read 输出违约，不按其他命令 schema 放行，不重执行 |
| returns 声明 ordinary，但作者采用 structured | 构造拒绝模式失配，不能按对象字段猜模式 |
| program 描述与实际 schema 修订、正文或上限不一致 | 对应操作不公布可用，同步构造成功不代替异步绑定验证 |
| 单函数与多命令复用同一已声明参数操作 | 生成对应 definition；单函数 command=null，多命令按原键显式选择 |
| 空表、来源重名、非法名、继承属性或不存在的命令 | 拒绝不合法注册或调用，不按第一个、原型链或默认命令分派 |
| 修改输入命令表，或 reload 替换同名命令 | 注册快照不变；旧执行、settle 和恢复沿原采用，不跟随新版 |
| 强环境操作混入只提供弱环境的注册 | 类型拒绝；显式适配不能提高权限，命令不自动获得其他命令依赖 |
| 作者取得注册或操作句柄，试图直接从它调用 executor | 公开接口没有执行入口；程序执行方只能取得受控 ProgramTools |
| executor-owned 参数命令且 program=none | 保留自己的参数协议与用法，仍有返回验证和通用 ToolResult |
| 两命令使用相同程序 schema，但交换结果或调用身份 | schema 合法不覆盖归属检查，按原 call/command/resultVersion 拒绝错配 |
| 动态选命令与生成的具体命令 SDK 分别消费 | 动态值按实际声明检查；静态 SDK 来自程序 schema，不从封闭后的 R 猜类型 |

构造类型探针覆盖不同 A/R、混合返回模式、错接返回验证器与渲染器、环境不兼容、句柄不可伪造及单函数参数约束。注册构造、命令分派、schema 一致和恢复场景需要实际实现后的行为验收，不能计作本设计编译证明。

### 定义、可用性与发起

[TL-J01](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j01)及 [TL-F01](../docs/flows.md#tl-f01)使用 [SPEC 定义章节](../SPEC.md#定义可用性与发起)的定义、呈现、动态可用和创作接缝；[TL-J02](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j02)及 [TL-F02](../docs/flows.md#tl-f02)使用发起、排队、参数和固定采用行为。能力范围见 [SPEC 对照](../SPEC.md#旅程能力与验证入口)。

<a id="tl-v01"></a>
#### TL-V01 定义与动态取用

实际组合须验证两种定义完整性、紧凑命令呈现与 help 一致，不熟命令先取用法。让来源撤权、卸载、必需提供者失效和恢复，检查先选同标识合法候选；已知身份有具体不可用结果，未取得身份不猜造，撤权后不读新说明。分别使用消费方的输入能力、输出能力和合法转换构造两端模态反例，并覆盖没有合法转换（conversion 为 null）的消费方；附件只有存储但消费者不能取回时不得判可用。创作只写合法归属，单纯落文件不等装载，不默认组织提交或覆盖。

<a id="tl-v02"></a>
#### TL-V02 发起与逻辑结果

实际消费者须验证完整错误与半截参数均不启动原工具，dummy 对任意参数有原调用结果且不编原工具用量。组合验证整批决定未齐、排队撤权、定义或实现绑定变化与隔离失败，确认实际发起前复核且不暗改参数或退到宿主。观察旧执行和新定义并存，旧采用固定；发起提交未知按原身份对账，不重发效果。不依赖外部工作对象的函数消费及托管调用分别验证其真实依赖，不把纯函数成功作为运行时持久保证。

可编程调用须覆盖以下反例。省略、false 和非法非布尔声明都不能产生脚本许可；true 但撤权仍不执行。脚本通过发现、缓存名称、通用调用入口、SDK 和包装工具分别尝试调用未许可目标，均不能绕过。多命令、动作桥接方的工具与元能力工具适用同一规则。排队时许可撤回阻止启动，已启动调用保持原采用。直接调用不因缺省声明被误拒绝，已知 dummy 仅返回原不可用原因，不启动原工具。

TOOL-M01、TOOL-M02 的公开形状与契约函数已实现，runtime 与提供者只实现了一部分路径，范围见[组的支持范围](../../README.md#支持范围)。上述为持续义务，对尚未交付或尚无证据的部分，不能宣称真实行为已通过。

### 结果、过程与保管

[TL-J05](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j05)及 [TL-F05](../docs/flows.md#tl-f05)使用 [SPEC 结果章节](../SPEC.md#结果过程与保管)的过程、返回与采用行为；[TL-J06](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j06)及 [TL-F06](../docs/flows.md#tl-f06)使用全文、附件和账目行为。对应能力见 [SPEC 对照](../SPEC.md#旅程能力与验证入口)。

<a id="tl-v05"></a>
#### TL-V05 观察与原结果采用

实际组合须验证无帧、追加、替换、封块和重连快照，过程不进入消费方的请求内容且帧失败不单独令执行失败。构造保存失败、确认丢失、扩展否决和消费者替换，分别走先保管后处理及 Tool 仍保管时先完成处理的两条可靠交接路径；原结果始终有责任者，不重复逻辑承接或效果。 另构造消费方工作已正常完成的后台成功结果，核对仍合法的投递可由消费方按其规则承接，Tool 保留原调用且不改写消费方的终态；与已撤回、投递资格撤销及转换否决分支分别验证。消费方不可读图片或转换失败须保原件与原因，不能修改旧终态或为其造后继工作。

<a id="tl-v06"></a>
#### TL-V06 全文与真实账目

验证作者摘要与机械首尾占位、保存失败、原附件地址、分页新返回和读取资格收窄；消费方归档、压缩、消费及确认后仍可在合法资格下取原文，旧占位不改。分别构造暂时不可读、地址失效和不存在，不混成删数据。重复通知和接续执行不重计原账，新取回调用记录真实新成本；迟到、未知费用和 dummy 实际处理分别表达。组织账目读取不授成员正文或其他组织明细，独立调用不造外部工作对象。

MODEL-E01 的共享 ref、消息校验和发送阶段读取仍待实现验证；TOOL-M04 已提出保存及读取设计，真实故障验证仍未完成。TOOL-M03 的引用、承接、分页与费用协议未实现、真实存储故障与断电未验证前，不能声明这些边界已实现。

### 等待、控制与恢复

[TL-J03](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j03)、[TL-J04](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j04)和 [TL-J07](../../../../.meta_harness/design/product/tool-execution/design.md#tl-j07)分别对应 [TL-F03](../docs/flows.md#tl-f03)、[TL-F04](../docs/flows.md#tl-f04)和 [TL-F07](../docs/flows.md#tl-f07)。根 SPEC 拥有其等待、控制和恢复行为，能力范围见 [SPEC 对照](../SPEC.md#旅程能力与验证入口)。

<a id="tl-v03"></a>
#### TL-V03 等待关系与名额

验证未声明后台许可时阈值、上限和控制请求均不放宽；允许时只向后台转换一次，输入、身份、效果和名额不变。前台实际计时不计内部等待，转后台后停止累计；没有合法值不加限制。前后台与内部等待合计并发，超额顺序排队，转后台不漏计仍运行执行。后台终局只交完成、失败或中断，恢复认回原关系，不启动新工具。

<a id="tl-v04"></a>
#### TL-V04 原等待与决定

组合验证 Ask 长期等待、普通消息、不回答、重复或失权答复、登记后交付面断线、调用方退出和合法控制。Ask 无超时默认答案或后台，普通输入不代答；有效决定回原等待且只生效一次，登记、决定成立和处理异步可接续。取消与答复竞争由原拥有者裁定，失效不补答案；查询失败不作废有效登记，自身丢失分支须确认原执行终局。

<a id="tl-v07"></a>
#### TL-V07 控制取消与恢复

验证单次工具停止不自动结束消费方的工作；withdraw 的 reach 为 foreground-and-unadmitted 时，只撤回控制提交时是前台关系的目标（是否已启动不影响），对程序调用只控制前台子调用及未受理预留；reach 为 all 时撤回目标的前后台执行，都不等物理全停。构造控制与转后台的竞争：目标先按阈值转后台，再提交 reach 为 foreground-and-unadmitted 的撤回，控制结果必须是 rejected，原因 out-of-reach，不形成中断，调用不变；发起即后台、尚未启动的目标同样是后台关系，该 reach 的撤回回 rejected（out-of-reach），要撤回它须用 all；同一目标在 reach 为 all 时形成 interrupted 逻辑终局，没有前台 final。缺失、未知的 reach 以及 stop、background 带多余字段的控制被拒。控制路径尚未实现，这些场景是待执行的反例，不表示已有通过的运行证据。完成与停止竞争、撤回后的真实结果和费用均按原调用追加，不伪报未执行、不复活工作，控制方不重启旧调用。分别故障注入仅调用方退出、查询不可用、Tool 自身确认丢失、外部提交未知、保存失败和消费者替换；认回句柄或原结果、不重发，效果未知不写未发生。

持久验证须覆盖进程崩溃、OS 崩溃和断电及唯一附件副本，资源释放或隔离域退出不替代宿主迟到结果责任。不依赖外部工作对象的程序的查询、停止、恢复与真实归属也须验证。TOOL-M02、TOOL-M03 的精确协议未实现或真实故障环境缺失时，保留未覆盖，不用图、mock 或仅进程重启声称完整兑现。

## 后台状态供给的验证边界

[background-calls.spec.ts](../tests/background-calls.spec.ts)覆盖封闭 schema、引用 tenant/call、原 admission、后台未结清筛选、补充结果交付、完整与部分目录、说明缺失及供值失败。字段检查不证明授权。

[background-calls-rc.spec.ts](../tests/background-calls-rc.spec.ts)经公开 RC 入口消费声明与纯投影，覆盖当前来源重算、撤权、旧 generation、scope 终止和生产者撤除。可信目录、授权与 RC 持有者均是测试输入或非耐久替身。生产目录和可信说明来源尚缺，不能据此宣称生产供给、耐久恢复或完整组合通过。

首次采用事实的共享验证见 [environment-allocation.spec.ts](../tests/environment-allocation.spec.ts) 与 [公共套件](../src/testing-environment-allocation.ts)。消费者反例分别在 [driver](../../tool/tests/driver-allocation.spec.ts) 和 [宿主](../../tool-host-local/tests/environment-allocation.spec.ts)。这些测试不证明真实 EE 的原登记、guard、ledger 或冷恢复映射。
