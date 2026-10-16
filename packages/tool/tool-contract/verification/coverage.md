# Tool 设计覆盖与验收规范

本页规定已接受设计的持续验证义务，不是运行支持表。产品十二项能力全部承诺在 0.0.0 至 0.1.0 完整交付。验证尚未完成不降低阶段范围。

## 产品到成员的覆盖

| 能力 | 公开契约与对象 | 必要协议 | 最低接受反例 |
| --- | --- | --- | --- |
| CAP-TL01 定义呈现取用 | ToolDefinition、ToolCatalog、ParameterCodec、ToolPresentation | [P02](../SPEC.md#p02-定义准入与队列) | 参数缺说明、重复命令、help与采用不同、未声明programmable、包装来源不可洗白 |
| CAP-TL02 动态可用及dummy | ToolConsumerProfile、AvailabilityFacts、ToolAvailability | P02 | 两端模态各不满足、合法转换、附件不可读；dummy不解析参数、不分配环境、不启动 |
| CAP-TL03 当前准入固定发起 | FixedToolRequest、ToolStartRecord、StartPermit | [P01](../SPEC.md#p01-操作事实与资格)、[P04](../SPEC.md#p04-实际发起围栏) | 同身份异输入、排队撤权、批决定不齐、失效与consume两种先后、延迟旧请求不能再发 |
| CAP-TL04 设置限额队列 | QueueReservation、QueuePosition、ToolConfiguration | P02、[P03](../SPEC.md#p03-环境准备和释放) | 两调用争同名额、同工具换实现、独立scope伪造、较早准备未完、取消队首、后台/等待不放名额 |
| CAP-TL05 前后台关系 | ActiveRelation、ForegroundReturn、ControlRecord | [P07](../SPEC.md#p07-计时控制与检查点) | 未许可、Ask和resource转换拒绝、完成与后台化竞争、重复只一个占位、不回前台 |
| CAP-TL06 等待答复 | WaitIntent/WaitRecord、ResponseRecord、DecisionBridge/ResourceResponses | [P06](../SPEC.md#p06-内部等待与答复) | 出卡确认丢失、取消后卡迟到、answer确认丢失、答复与取消、资源超时不能用于Ask、普通消息不答卡 |
| CAP-TL07 结果及采用 | ToolAuthor、OutputCodec、ResultPolicy、RawOutput、ToolResult | [P05](../SPEC.md#p05-执行事实与原输出) | 普通对象content字段不改变分支、renderer抛错原件仍在、codec失败不假报耐久、policy拒绝不重跑；内容 ref 无需附件登记，附件仅文本且零媒体读取 |
| CAP-TL08 过程观察 | ProcessBlock、ToolObservation、ProcessSnapshot | [P08](../SPEC.md#p08-过程分页与全文交接) | 保存前不得展示、快照/增量缝隙、慢观察gap、封块后写、无活体读已展示内容、人用内容不入模型 |
| CAP-TL09 保管全文取回 | RawOutput、ContentReader、ToolOffloader、Delivery | P05、P08 | 保存成功本域回执丢失、retained/processed两路径、旧release不解除晚到版本、附件换引用、单块超页、归档后仍可依法读 |
| CAP-TL10 控制取消 | ToolControl、ControlDispatch/Progress、PhysicalExecution | P07 | stop已接受仍在跑、拒绝/未知不假报停止、取消先逻辑终局且名额保持、Run前台与归档全范围分别验证；Run取消不阻已受理后台子安全resume |
| CAP-TL11 原调用恢复 | ToolRecovery、ToolTask、RecoveryBinding、Checkpoint、DrainState | P01、P03、P04、P07、[P09](../SPEC.md#p09-账目恢复与退出) | prepare/release/suspend响应丢失、查询未知、旧协调者被围栏但物理执行继续、resume拒绝保留旧效果、交接清单变化 |
| CAP-TL12 执行账 | CallAccount、recordAccount、ToolAccounts | P09 | 正常与迟到同源重复不重计、修订替代、未知非零、组织跨边界拒绝、账目读取不披露内容 |

对象的完整身份、生命周期、参数/配置/DI 分类归 [object-model](../docs/object-model.md)。Code 侧 CODE-A01 至 CODE-A12 由 [composition](../SPEC.md#code-与-tool-的组合协议)承接 Tool 所有的部分，包括预留后准入未知、父关闭后子受理认回、后台子未收场不能正常结束、Ask计时、异常和Run取消不同范围、父域销毁后的保管及成本不重复。语言、引擎、help/execute和执行域隔离的具体验收仍由Code与环境提供者交付。

CAP-TL06 与 CAP-TL08 的作者入口由 ToolExecutionContext 的 wait 与 emit 承接。[P11](../SPEC.md#p11-作者输出与等待原语)明确异步保管回执、同步等待语义、有界输出、稳定 key、取消和收尾屏障。它同时影响 CAP-TL07 的最终投影及 CAP-TL11 的接续。完整反例见 [作者组合验证](scenarios.md#作者-emit-和-wait-的组合验证)。类型验证应拒绝 Ask 的 deadline、将等待 Promise 当回应、将 process 当正式结果及把 Context 当收尾能力；实际时序与内存上限仍由提供者验证。

## 验收层次

P14 至 P16 补齐内容 ref/附件地址分流、工具定义到模型声明的组装投影、配置允许项与合法装载、Cordis 目录和发现隔离，覆盖 CAP-TL01、02、04、07、09、11 的相应边界。反例见[结果分流、装载与依赖隔离](scenarios.md#结果分流装载与依赖隔离)。HITL 双边协议沿 Q-HI02/Q-HI03，按决定留到该功能实现时细化，不能据单侧 validator 声称交接完整。

自定义等待由 ToolWaitContract、ToolWaitSchemaSnapshot 与 ToolWaitResponseValidator 承接 CAP-TL06，见 [P12](../SPEC.md#p12-等待-schema-与响应提交)。普通/结构化返回、ToolReturnDeclaration、ToolReturnValidator 与 ToolResult.data 承接 CAP-TL07 及 Code 的程序数据边界，见 [P13](../SPEC.md#p13-双返回形态与程序输出契约)。[等待与返回反例](scenarios.md#等待-schema-与双返回的验证)覆盖非法提交不结束等待、schema 换代、输出违约、真实效果保留和两种消费者。只有覆盖这些协议的模型或提供者证据才能支持相应验证声明。

ToolOperation 与 ToolAuthorRegistration 将各命令的作者和返回契约封闭配对，承接定义形态及 CAP-TL07。见 [多命令独立返回场景](scenarios.md#多命令独立返回)。编译证明限于已写正负例的局部类型关系；精确命令分派、schema 加载和恢复采用仍需提供者行为验证。

1. 表达验证。提取唯一公开声明并使用实际基础包类型编译；非法等待/关系和错误身份类型必须被拒绝；Cordis定义继承覆盖全部门面方法；本地链接、文档登记和Mermaid解析通过。
2. 协议验证。模型至少包含两个调用、同队列名额、两代协调者、撤权/启动、取消/答复、迟到结果和消费者交接。每个外域操作注入发送前、效果后回包前、本域确认前及恢复查询不可用四个断点。错误变体须命中对应不变量。
3. 提供者验证。真实环境分配、原执行查询和控制、检查点排除、事实源ACK、内容与附件保管、计时连续性、权限变更和跨域启动围栏。内存fake不能代这些证明。
4. 部署验证。声明部署条件下的进程崩溃、OS崩溃、断电和重启；跨进程/异构只有实际采用且证据覆盖时才能声明。介质物理损毁后的新恢复资格不在现行已定政策内。
5. 独立评审与接受。choice评审责任和机制，expression评审精确表达；两者无阻断仍不授予负责人技术接受，测试通过也不授予发布支持。

## 必须区分的失败

准入拒绝、正常业务失败、外部操作结果未知、持久提交未知、当前无活体、可靠确认连续性丢失和原件保管故障分别有证据。验证不得把它们都模拟为一个抛异常再重试。外部效果发生与否独立于终局、停止受理和资源释放；验收必须检查“不声称已撤销”以及“不制造第二执行”。

## 未决与实施条件

[open-questions](../docs/architecture.md#tool-设计状态与外部缺项)保留 MODEL-E01 的共享值迁移与发送验证、具体提供者采用和真实故障证据。Tool本域的公开形状、操作协议和对象分解已有设计；设计接受不表示已实现，未验证不能称已兑现。每项验收记录应写明所用文档版本、实际构建、提供者、环境、oracle、命令、结果及未覆盖范围。
