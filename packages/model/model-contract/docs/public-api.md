<a id="model-领域公开契约候选"></a>
# Model 领域公开契约

本页是本包公开声明的源码导航，不重复声明。每个声明只有一个副本，在 `src/` 里。每章写这章给谁用，并链接声明它的源码文件与对应的测试。

公开名字分根入口与 `./provider` 两个入口，规则见[提供者协议入口](#提供者协议入口)。根入口导出 121 个类型和 20 个运行值：身份解码函数与常量、`compareOutputCursors`、调用引用的 codec、`deriveGuardControlOperation`、`judgeModelDelivery`，以及投影纯值 `diffModelStream` 与 `applyModelStreamDelta`。`./provider` 入口导出 72 个类型和 14 个运行值：操作引用的 codec、`decodeReadId`、`compareRevisions`、共享输入 judge 与限额常量，[凭据引用与解析端口](#凭据引用与解析端口)的 `MODEL_SEND`、`decodeCredentialId` 和 `sameCredentialHolder`，以及[推理回放的声明与投影](#推理回放的声明与投影)的三个函数。`./testing` 入口导出[受控替代提供者](#受控替代提供者)一章的 27 个名字（替代提供者、替代传输与三个公开替身），以及[符合性断言](#符合性断言)一章里把替代提供者接成被测方的 `createScriptedConformanceSubject` 与 `ScriptedPrincipal`，共 29 个名字。`./conformance` 入口导出[符合性断言](#符合性断言)一章的义务套件，共 11 个名字，不导出任何替身。[导出清单](../tests/fixtures/exports.json)逐名列出四个入口的名字，没有 `pending` 名字。

[`tests/public-api-types.spec.ts`](../tests/public-api-types.spec.ts) 核对三件事。清单里每个名字都由所属章链接的源码文件声明。清单列出的每一章至少链接一个存在的源码文件。页面链接的源码与测试文件都存在。声明的形状由各章链接的类型探针（`tests/*.spec-d.ts`）核对。

## 提供者协议入口

本包有四个入口。`.` 是消费者入口，`./provider` 是提供者协议入口，`./testing` 是受控替身入口，`./conformance` 是符合性套件入口。分组规则沿用 tool-contract 的 [SPEC「公开入口的分组」](../../../tool/tool-contract/SPEC.md#公开入口的分组)规则 1–7。依据是谁消费一个名字，不是它在哪个源码文件。

- 根入口 = 有 Model 组外导入者的名字 ∪ 这些名字的声明直接或间接引用到的名字 ∪ 按规则 3 判为消费侧的名字：[结果推送与保存](#结果失败和状态)、[显示投影](#model-显示投影纯值)与[当前目标与公共观察](#model-当前目标与公共观察)的名字，身份与调用引用，`ModelRuntime` 的闭包，以及[供应商尝试诊断](#供应商尝试诊断)的读面。Model 组外是 `packages/model` 之外的包与应用，含它们的测试与示例。根入口的每个声明在根入口内自足，不需要从 `./provider` 取类型。
- `./provider` = 只被 Model 组实现成员（`model`、`model-host-local`、`pi-ai-*`、`tokenizer-tiktoken`、`model-cordis-contract`，含本包自己的测试）使用的提供者协议：传输、提交命令、发送边界、重试策略、实例宿主与 `ModelProvider`，受信宿主驱动，档案维护、请求准备与计量校准，转换件与转换目录，分词接口，档案来源与内容权威，凭据解析端口与 `MODEL_SEND`，消费者 owner 的装配声明，以及只有提供者调用的契约函数：共享输入 judge 与限额常量、操作引用的 codec、`decodeReadId`、`compareRevisions`、回放的声明与投影函数。
- 一个名字只从一个入口导出，两个入口共享同一份源码定义，不复制类型。导入 `./provider` 的成员仍然可以导入根入口。`./provider` 不导入 Cordis 或其他 Model 成员，不导出 `./testing` 与 `./conformance` 的名字。
- 根入口不能为空；组外消费者需要的名字不能只在 `./provider`。两种情形都是分组错误，交契约拥有者裁定，不以把该消费者改成导入 `./provider` 来通过。`./provider` 的名字后来有了组外消费者时移回根入口：根入口增加名字是新增，`./provider` 删除名字是破坏性变化，两者都走契约变更协议。导入扫描与闭包计算表列在改变分组的交付 PR 说明中，不进入本页。

下文各章用「入口」一行注明哪些名字在 `./provider`；没有这一行的章全部在根入口。精确归属以 [`src/index.ts`](../src/index.ts) 与 [`src/provider/index.ts`](../src/provider/index.ts) 为准。[`tests/public-entry.spec.ts`](../tests/public-entry.spec.ts) 核对两个入口的运行时键与「一名一入口」，[导出清单](../tests/fixtures/exports.json)按入口逐名列出。

## 导出归属与落地前置

本包拥有领域值、品牌、公开操作与可替换提供者端口，包括 ModelProvider 管理接口。executeModel、createModelRuntime 及其 ModelDependencies、ModelConfiguration 由[领域实现](../../model/docs/public-api.md)拥有，不从本包转导出。Cordis 类与键由[框架契约](../../model-cordis-contract/docs/public-api.md)拥有。

凭据纯契约由本包拥有：`CredentialId` 及其解码函数、引用、查询、存在性与解析结果、`CredentialPort` 和持有者比较函数，声明见[凭据引用与解析端口](#凭据引用与解析端口)。`CredentialId` 在本包只有一个声明，model 与其他消费者不再导出同名类型。model 的内部判定状态、磁盘格式和本地保管诊断不属于本包。精确归属见[组架构](../../docs/architecture.md#凭据的现有装配边界)。

`Outcome` 引用 `@omne-harness/operation-result` 的唯一类型。该共享成员没有生产依赖。本包已将它列为生产依赖，真实导出还须按[安装闭包要求](../../docs/architecture.md#安装闭包与共同依赖前置)验证实际产物。不复制 `Outcome`，不以 `import type` 代替完整安装依赖检查。

行为及调用资格归 [SPEC](../SPEC.md)，消费路径归 [context](context.md)，对象关系归 [object-model](object-model.md)。

<a id="已采用但尚未声明的增量"></a>

### 增量声明与待实施责任

[结果推送与保存](../SPEC.md#结果推送与保存)定义结果键、冻结载荷、saved 合取事实及接收/恢复义务；[公共内容观察与当前目标](../SPEC.md#公共内容观察与当前目标)定义 Model 投影、差分及 current 语义；其中[投影行为契约](../SPEC.md#model-投影及差分)固定完整 ref/dispatch 来源、原修订与输出游标基线、失败顺序和不可变输出。公共 ref/cursor/frame 由 [stream-arrival](../../../common/stream-arrival/README.md#public-observation-contract)拥有。结果键、账目快照与交付载荷的三个纯值类型已从根入口导出，见[结果、失败和状态](#结果失败和状态)。Model 投影与差分纯值见[显示投影入口](#model-显示投影纯值)。saved 回执、结果接收端口和纯交付 judge 已从根入口导出，接收服务与恢复实现仍由提供者承担；current 与 Model 观察别名已从根入口导出，见[当前目标与公共观察](#model-当前目标与公共观察)；公共引用和游标的出口由其拥有者提供。尚未声明的名字不是现有可导入 API，不改变旧实现的必需成员。

新增端口的 `Access` 直接来自 `@omne-harness/legal-identity`。root.ts 再导出同一定义，不另写副本。current 的对象参数和失败顺序归 [目标查询](../SPEC.md#current-的权威含义)。

receiver、observe 与 current 的完整公开声明及实际导入依赖公共身份唯一源，启用条件归[交付边界](../SPEC.md#推送与公共观察的交付边界)。本页不复制候选 Access 或用拟议签名替代实际源码。真实 Evidence adapter、Agent 内部保存映射和 Tool 适配不由本包声明页补造。

## 能力边界

[行为与约束](../SPEC.md#342-能力边界)。

## 根入口的值与请求

[行为与约束](../SPEC.md#342-根入口的值与请求)。

本章给所有调用方：身份品牌与解码函数、受理请求的值形状与共享封闭判断。

`judgeFixedModelRequest(unknown)` 判断独立固定请求。`judgeAdmit<P>(ModelAdmitCandidate<P>)` 保留 typed Access，只将五个 payload 字段视为未知输入。二者返回现有 Outcome。成功值独立深冻结；admit 根浅冻结，P 与已铸造 tenant 保持原对象。失败为 ModelInputRejection 的 field/reason，field 是规范 JSON Pointer。字段集合、资源限制、失败顺序与 Proxy 限制归 [SPEC](../SPEC.md#封闭输入判断)。结构通过不授予资格、采用或容量。

- 再导出：`Adoption` 与 `ConsumerRef` 的唯一定义在 [exchange-refs](../../../common/exchange-refs/SPEC.md)，`Access` 的唯一定义在 legal-identity。root.ts 以原名再导出它们。封闭判断与 64 位小写十六进制的摘要规则留在本包。
- 声明：[`src/root.ts`](../src/root.ts)、[`src/identity-values.ts`](../src/identity-values.ts)、[`src/reference.ts`](../src/reference.ts)、[`src/judge-request.ts`](../src/judge-request.ts)、[`src/input-tree.ts`](../src/input-tree.ts)。
- 入口：`ActorRef`、`ModelOperationRef`、`ModelOperationParts`、`encodeModelOperationRef`、`decodeModelOperationRef`、`resolveModelOperationRef`、`ModelAdmitCandidate`、`ModelInputRejection`、`MODEL_INPUT_LIMITS`、`judgeFixedModelRequest`、`judgeAdmit`、`decodeReadId` 与 `compareRevisions` 在 `./provider`：操作引用由提供者铸造与解析，封闭输入判断由受理提供者调用，读取身份由提供者铸造，修订的先后只有提供者比较。其余在根入口。
- 类型探针：[`tests/root.spec-d.ts`](../tests/root.spec-d.ts)、[`tests/reference.spec-d.ts`](../tests/reference.spec-d.ts)、[`tests/judge-request.spec-d.ts`](../tests/judge-request.spec-d.ts)。运行时行为测试：[`tests/identity.spec.ts`](../tests/identity.spec.ts)、[`tests/reference.spec.ts`](../tests/reference.spec.ts)、[`tests/judge-request.spec.ts`](../tests/judge-request.spec.ts)。

可保存引用的格式、失败顺序与恢复责任见 [SPEC](../SPEC.md#可保存调用引用)。三个普通入口使用 ModelReferenceAccess，底层 ModelInstanceDirectory 仍使用 CallAccess。

身份和序列的文本规则如下，行为条款归[根入口的值与请求](../SPEC.md#342-根入口的值与请求)。

- 每个品牌有一个解码函数，接收 `unknown`，返回 `Outcome`，不抛异常，不读环境、时钟或随机值。`ReadId` 的解码函数 `decodeReadId` 在 `./provider`，其余在根入口。`ModelDiagnosticId` 与 `ModelDiagnosticCursor` 的解码函数在[供应商尝试诊断](#供应商尝试诊断)一节，与两个品牌同处。`CredentialId` 的解码函数 `decodeCredentialId` 在[凭据引用与解析端口](#凭据引用与解析端口)一节，与该品牌同处。
- 解码只核格式。成功只得到品牌，不证明对象存在、属于某租户或可以使用。所属租户与已有关系由处理该操作的提供者核验。
- 身份类（`ModelCallId`、`DispatchId`、`ModelInstanceId`、`ModelOperationId`、`ResultVersion`、`ReadId`、`ModelDiagnosticId`、`ModelDiagnosticCursor`）是固定前缀加主体。前缀见 `MODEL_IDENTITY_PREFIXES`，主体是 1 个以上 `[A-Za-z0-9_-]` 字符。只比较相等，用 `===`。
- 序列类（`Revision`、`OutputCursor`）是十进制非负整数的规范写法：`0`，或不以 `0` 开头的数字串。相等用 `===`，先后用 `compareRevisions`（`./provider`）与 `compareOutputCursors`（根入口），按整数值比较，不转为浮点数。比较只对同一对象的修订或同一调用流内的游标有定义。
- 无前缀类（只有 `CredentialId`）由人在凭据保管的配置路径上命名，不由 Model 铸造，所以没有前缀。它的字符规则不同，见[凭据引用与解析端口](#凭据引用与解析端口)。
- 上述单一身份品牌的文本不超过 `MODEL_IDENTITY_MAX_LENGTH`（256）个 UTF-16 码元。函数不裁剪空白，不折叠大小写。检查按 `ModelIdentityRejection.reason` 的顺序 `type`、`empty`、`length`、`prefix`、`character`、`leading-zero` 自上而下，返回第一个失败。`prefix` 只适用身份类，`leading-zero` 只适用序列类，`CredentialId` 只会返回 `type`、`empty`、`length`、`character`。
- 失败值的 `field` 是品牌键 `ModelIdentityKey`（例如 `'ModelDispatchId'`），不是导出类型名（`DispatchId`）。品牌键带领域前缀，跨领域日志中不会与 Tool 的同名身份混淆。
- 上述单一身份品牌值就是线上文本，编码是恒等函数，所以不发布编码函数。ModelInvocationRef 和 ModelOperationRef 另有编码函数与 1024 上限。品牌相等即文本相等，不发布相等函数。
- `ModelOperationId` 的主体不得以 `--` 开头。该前缀保留给守卫派生的控制 operation（见[消费者 owner 的装配声明](#消费者-owner-的装配声明)）。`decodeModelOperationId` 仍只核格式，不拒绝它。接受调用方提交的 `ModelOperationId` 的公开方法在收到保留值时按[资格、共同提交与实际发送](../SPEC.md#342-资格共同提交与实际发送)返回 `invalid`。

## 结果、失败和状态

[行为与约束](../SPEC.md#342-结果失败和状态)。

本章给调用方和消费者拥有者：操作的失败值、调用状态、终局与确认回执。

- 再导出：`DurableEvidence` 的唯一定义在 [exchange-refs](../../../common/exchange-refs/SPEC.md)，result.ts 以原名再导出。摘要算法归证据的 owner。
- 声明：[`src/result.ts`](../src/result.ts)、[`src/result-delivery-values.ts`](../src/result-delivery-values.ts)、[`src/result-delivery.ts`](../src/result-delivery.ts)、[`src/result-delivery-judge.ts`](../src/result-delivery-judge.ts)。
- 类型探针：[`tests/result.spec-d.ts`](../tests/result.spec-d.ts)、[`tests/result-delivery-values.spec-d.ts`](../tests/result-delivery-values.spec-d.ts)、[`tests/result-delivery.spec-d.ts`](../tests/result-delivery.spec-d.ts)。
- 纯判断及受控接收行为：[`tests/result-delivery.spec.ts`](../tests/result-delivery.spec.ts)。接收替身不从公开入口导出，不证明真实存储或资格提供者的行为。

`ModelResultReceiver` 供消费者实现结果接收。`judgeModelDelivery` 只核 typed 载荷中的有限关系，成功返回原输入；它不复制、冻结、授权或保存。接收顺序、原 dispatch 归属、已知部分保存和未知接续归 [SPEC](../SPEC.md#结果推送与保存)。

结果接收者以交付种类收窄稳定键与载荷。账目快照没有报告时显式为 null。只读声明约束静态赋值；版本值一致、全部 dispatch 覆盖、运行时冻结与真实保存仍由[交付协议](../SPEC.md#交付身份与冻结载荷)核验，不由类型声明证明。

## Model 显示投影纯值

- 声明和运行函数：[`src/model-stream-values.ts`](../src/model-stream-values.ts)。
- 公共入口行为与类型探针：[`tests/model-stream-values.spec.ts`](../tests/model-stream-values.spec.ts)、[`tests/model-stream-values.spec-d.ts`](../tests/model-stream-values.spec-d.ts)。

`ModelStreamSnapshot`、`ModelStreamBase`、`ModelStreamDelta` 和 `ModelStreamProjectionFailure` 定义纯值输入与结果。`diffModelStream` 产生累计块变化，`applyModelStreamDelta` 核对原基线并生成新快照；完整规则与失败顺序归 [SPEC](../SPEC.md#model-投影及差分)。两函数同步核验引用、身份和投影关系，成功结果复制并冻结，不改变输入；它们不证明授权、真实发布或持久保存。观察端口与发布目标查询见[当前目标与公共观察](#model-当前目标与公共观察)。

## Model 当前目标与公共观察

- 声明：[`src/model-stream.ts`](../src/model-stream.ts)。
- 公共入口类型探针：[`tests/model-stream-selection.spec-d.ts`](../tests/model-stream-selection.spec-d.ts)。受控查询行为：[`tests/testing-stream-references.spec.ts`](../tests/testing-stream-references.spec.ts)，经 `./testing` 的 `current` 替身。

`ModelStreamReferences` 供提供者实现当前显示目标查询，`ModelStreamSelection` 将同次权威读取的调用状态与当前目标一起返回。`ModelStreamObservation` 为公共 `StreamObserver` 绑定 Model 投影与差分；公共观察协议由 [stream-arrival](../../../common/stream-arrival/README.md#public-observation-contract) 拥有。查询资格、失败顺序、目标退役和回复乱序规则归 [SPEC](../SPEC.md#current-的权威含义)。这些声明和 `./testing` 的替身不提供真实查询或发布服务，也不证明真实提供者的资格与披露围栏。

## 普通调用面与实例观察

[行为与约束](../SPEC.md#342-普通调用面与实例观察)。

本章给调用方：受理、取消、观察、读取与确认结果用的 `ModelRuntime`。

- 声明：[`src/call-surface.ts`](../src/call-surface.ts)。
- 类型探针：[`tests/call-surface.spec-d.ts`](../tests/call-surface.spec-d.ts)。

`DispatchRecord.messages` 是这次发出所用固定请求的消息身份序列。提供者在准备发出时抄写它，与账目和回执同寿命，清理请求材料时不删除；准备租约用它核对延续前缀，见 [可选校准](../SPEC.md#可选校准及不可解释的历史)。旧记录没有这一项。

### 最终结果项与页预算

ResultPart 与 ResultTrim 的定义见 [call-surface.ts](../src/call-surface.ts)。ResultPage.parts 按页序交付 sealed 或 partial；二者都带真实 trims。消费者先按 kind 分支，sealed 进入完整块处理，partial 进入未封值保管。partial 的工具参数即使可解析也不是 ToolCallPart。未封 voice 不带推测的媒体类型，thinking 的保管不授予展示权。

页目标计规范 parts 数组的 UTF-8 JSON 字节。它不含 Settlement、next 与页包装。首项超目标仍完整独页，整个 ResultPage 不超过原容量 C。消费者须能接收接近 C 的单页，并在有效处理或保管整个结果后提供原 ACK 证据。读取结束本身不证明承接。具体顺序、纯空状态、真实 trim 与固定页规则归 [SPEC](../SPEC.md#342-普通调用面与实例观察)。

## 逐操作行为

[行为与约束](../SPEC.md#342-逐操作行为)。

## 独立执行与提供者操作

[行为与约束](../SPEC.md#342-独立执行与提供者操作)。

本章给提供者作者和宿主装配者：传输、提交命令、发送边界、重试策略、实例宿主与 `ModelProvider`。

- 声明：[`src/provider-protocol.ts`](../src/provider-protocol.ts)。
- 入口：`TransportFailure`、`MaterializationReceipt`、`RetryDecision`、`RetryPosition` 与 `RetryResolution` 在根入口，因为组外消费者导入它们或根入口的声明引用它们。其余在 `./provider`。
- 类型探针：[`tests/provider.spec-d.ts`](../tests/provider.spec-d.ts)。

ModelSendBoundary 的 started 结果同时包含已确认的原 window 和唯一 facts 流。消费者将返回的 window 用于 preserve；Commands 仍核原调用、执行、分派与租户绑定。未知记录认回沿 [接收窗口行为](../SPEC.md#342-重试失联与恢复)，不再次 start。

ToolDeclaration 是 Model 的请求值，只表达名称、已组装说明和参数 JSON Schema。请求组装者负责从工具定义形成该值并保存原工具及命令路由，Model 不读取 ToolDefinition、programmable 或工具注册表。ModelToolPayloadAdapter 将该请求值转换为供应商私有 payload。工具调用输出采用 [共享 ToolCallPart](../../../common/message/docs/public-api.md)，不复制消息关联身份。

ModelMediaReader 只在实际发送阶段读取模型可见的内容 ref；附件地址文本不触发读取。prepare 不预载二进制；materialize 在本次发送准备阶段完成读取与完整性检查，不计量，MaterializedTransport.start 在最终资格围栏内立即发送。原来源、取消、失败和租约规则归 [工具声明转换与内容引用加载](../SPEC.md#工具定义转换与内容引用加载)。这两个接缝由发送提供者注入，不增加工具执行通路。

TransportFact 是传输提供者向 Model 交出的事实。Model runtime 映射为共享到达步骤，序号、整交块及终止的精确规则见 [共享到达映射](../SPEC.md#供应商解释与流状态归约)。它不替代 common/stream-arrival，也不直接传给 assembleStream。

`TransportFact`、`IndependentModelFact` 与 `LateDispatchFact` 的 `account` 变体带 `CallAccountReport`：它是 `CallAccount` 去掉 `subject` 与 `receipt`。提供者不知道调用身份，也不判断迟到。Model runtime 保存账目时补上这两项，规则见 [SPEC](../SPEC.md#342-独立执行与提供者操作)。`diagnostic` 变体带一条 `ProviderDiagnostic`。它是闭合联合，有四种：`replay-omitted`（消息身份、`scope`、`format`、略去的部件个数）、`reasoning-disabled`（原因 `foreign-prefix`）、`reasoning-state-dropped`（原因 `payload-too-long` 与载荷长度）和 `usage-inconsistent`（自相矛盾的用量字段名）。诊断不带载荷或正文，不改变块。

`MaterializationReceipt.replayFormat` 是这次发出产出的推理续接状态部件的回放 `format`，由适配器按其采用给出。适配器不产出推理续接状态时没有这一项，旧记录也没有。Model runtime 收场时用它作 finish 的 `format`，见 [到达与组成](../SPEC.md#回放的到达与组成)。

`ModelTransport.prepare(request, supplier, dispatch)` 的第三个参数是 `TransportDispatch`，带这次发出不由请求固定的输入。`resent` 列出这次再发须视为不可续接的消息，首次发出为空。传输把它交给回放投影，见 [SPEC](../SPEC.md#回放投影)。

## 参数与注入的裁定

[行为与约束](../SPEC.md#342-参数与注入的裁定)。

## 资格、共同提交与实际发送

[行为与约束](../SPEC.md#342-资格共同提交与实际发送)。

## 消费者 owner 的装配声明

[行为与约束](../SPEC.md#342-资格共同提交与实际发送)。

本章给消费者拥有者：声明受理资格的值，以及派生守卫控制 operation 的纯函数。

- 声明：[`src/consumer-owner.ts`](../src/consumer-owner.ts)、[`src/guard-control.ts`](../src/guard-control.ts)。
- 入口：`ModelConsumerOwnerDeclaration` 在 `./provider`，因为当前只有承载受理提交的实现持有它；`deriveGuardControlOperation` 在根入口。
- 类型探针：[`tests/consumer-owner.spec-d.ts`](../tests/consumer-owner.spec-d.ts)。派生函数的行为测试：[`tests/identity.spec.ts`](../tests/identity.spec.ts)。

- `consumerOwner` 与 `ConsumerRef.owner` 按文本相等比较。字段不叫 `owner`，以免与 `Adoption.owner` 混淆。
- `evidence` 指明该 owner 的受信证据适配器。免守卫声明也必须给出它。ACK 的 `DurableEvidence.owner` 填调用的 `ConsumerRef.owner`；证据其余字段与摘要按这个 `evidence` 采用定义，Model 不规定摘要算法，只核证据属于该 owner 且该 owner 认可。
- `work.kind = 'guarded'` 的 `participant` 是已登记资格参加者的版本化身份。资格参加者协议（守卫读数的提交内载体、载体拥有者、参加者先后保证）是前置依赖，尚未闭合。在它闭合前，这一支是暂定形状，受守卫 owner 的装配被拒绝，见 [SPEC](../SPEC.md#342-资格共同提交与实际发送)。可受理的只有免守卫 owner。
- 声明由承载受理提交的 ModelCommands 实现持有并冻结。怎样取得声明由实现自定。同一 `consumerOwner` 出现两次是装配错误，构造时失败。
- 守卫问答事实的形状不在本包发布，原因同上。

`deriveGuardControlOperation(call)` 返回 `mop_--` 加 `call` 去掉 `mcall_` 前缀后的主体。它是纯函数，是契约唯一铸造身份的位置。

- 派生值与原调用等长，不超过 256 个 UTF-16 码元。`mcall_` 与 `mop_--` 都是 6 个字符。
- 派生值能通过 `decodeModelOperationId`，因为 `-` 在主体字符集内。
- 同一调用得到同一值，不同调用得到不同值（单射）。
- 主体以 `--` 开头的 `ModelOperationId` 只由本函数产生。其他铸造方的生成器不得产生这种主体。ULID 与 UUID 原样满足。字母表含 `-` 的生成器（nanoid、base64url）须过滤首两字符。

## 重试、失联与恢复

[行为与约束](../SPEC.md#342-重试失联与恢复)。

## 协议状态图与证据边界

[行为与约束](../SPEC.md#342-协议状态图与证据边界)。

## 档案与请求准备

本章给档案维护入口、选择列表的调用方和请求组装者：档案、请求准备、计量与预算的接口。计量接口供请求组装方在请求前使用，请求准备与发送不调用它。

- 声明：[`src/profile.ts`](../src/profile.ts)。
- 入口：`ModelChoices`、`ModelProfiles`、`ProfileChange`、`ModelProfileMaintenance`、`ModelRequestPreparation`、`OutputWithheld`、`MeterCalibration`、`CalibratedInputMeter`、`ReplayTreatment`、`ReplayDiagnostic`、`ReplayProjectionInput` 与 `ReplayProjection` 在 `./provider`。其余在根入口。
- 类型探针：[`tests/profile.spec-d.ts`](../tests/profile.spec-d.ts)。

这些接口不扩展 ModelRuntime 的控制权限。规则及准备/发送两阶段区别见 [准备协议](../SPEC.md#档案与请求准备协议)。

全部模态是四种：文字、图片、语音和视频，词表归 [`@omne-harness/modality`](../../../common/modality/docs/public-api.md)。本包不转出它，消费者直接从该成员导入 `Modality`。`ModelModality` 是 Model 本阶段支持的三种，由 `Modality` 派生。`ModelProfileDefinition` 的输入输出用 `ModelModality`，`ModalityRequirement` 用 `Modality`。

`ProfileSupplier` 没有凭据字段。求值的 credential 只说明当前可用性，不返回秘密或授予发送资格。ModelProfileMaintenance 的身份参数不是跨层维护许可。精确键和摘要规则由实际提供者采用并验证，不把任意字符串当可信证明。

`MeterRepresentation.units` 是与 `tokenInput` 消息单元逐项对齐的侧表，由家族适配器的 `rules.plan` 写出，手写的表示没有它。`CalibratedInputMeter` 是家族计量器给准备租约的校准入口：`measureCalibrated` 接收普通计量输入和 `MeterCalibration`（锚点的真实输入合计与覆盖的消息，各来源的输出 token 数或 `OutputWithheld` 原因）。普通消费者只调用 `measure`。`RequestBudget.calibration` 是 `CalibrationReport`：有 lineage 的租约计量时出现，只含锚点命中或 `AnchorMiss` 原因。每个原因的条件见 SPEC 的[锚点不命中的原因](../SPEC.md#锚点不命中的原因)与[来源扣留的原因](../SPEC.md#来源扣留的原因)。行为见 [可选校准](../SPEC.md#可选校准及不可解释的历史)。

`ProfileSupplier.replay` 是该供应商的[回放声明](../SPEC.md#推理回放)，三项都可省略，省略的项取默认值；`ReplayDeclaration` 是展开后的完整声明。`AssembledModelInput.replay` 与 `FixedModelRequest.replay` 只有一个取值 `'off'`：本次请求关闭回放，对每次发出都有效。`judgeFixedModelRequest` 接受这个取值，拒绝其他值。`FixedModelRequest.declarations` 是每个供应商展开后的 `ReplayDeclaration`，项数与次序同 `suppliers`。准备方用 `judgeReplayDeclaration` 展开档案供应商的声明并写入这一项。编码与计量使用请求中的声明。`ReplayProjectionInput`、`ReplayProjection`、`ReplayTreatment` 与 `ReplayDiagnostic` 是回放投影的输入与输出，函数见[推理回放的声明与投影](#推理回放的声明与投影)。

## 推理回放的声明与投影

[行为与约束](../SPEC.md#推理回放)。

本章给档案维护方、Model 适配器作者和输入计量器作者：回放声明的读取、展开与校验，以及适配器与计量器共用的回放投影。类型在[档案与请求准备](#档案与请求准备)一章。

- 声明：[`src/replay-values.ts`](../src/replay-values.ts)。
- 入口：三个函数都在 `./provider`。
- 行为测试：[`tests/replay.spec.ts`](../tests/replay.spec.ts)。

- `judgeReplayDeclaration(supplier, index)` 读取并展开供应商的回放声明，再按 SPEC 检查，返回 `Outcome`，成功值是展开后的完整声明（冻结）。`supplier.replay` 的类型是 `unknown`，因为它从存储或配置读来：只有 `undefined`（或没有该键）取全部默认值；否则必须是原型为 `Object.prototype` 或 `null` 的普通对象，自有键只能是 `produces`、`accepts`、`foreignThinking`，每个键是可枚举的数据属性，每个字段只读一次，访问器从不调用，原型链上的键不读；值为 `undefined` 的键视为未声明，取该项默认值。失败是 `invalid`，`field` 为 `suppliers[index].replay`，`reason` 依次是 `replay`（不满足上述读取规则）、`produces`（不是文本、为空或过长，包括默认值过长）、`accepts`（不是数组，或有一项是空洞、访问器、空文本或超长文本）、`accepts-duplicate`、`accepts-lacks-produces`、`foreign-thinking`（不是三个取值之一，包括 `null`）中第一个不满足的项。展开函数不对外导出。
- `projectReplay(input)` 对 `messages` 里每条 assistant 消息给出一条 `ReplayTreatment`，按输入次序，并给出诊断。`ReplayTreatment` 按 `continuable` 判别：可续接的有 `carry`（要写入的推理续接状态部件位置，来自 `replay.at`），`thinking` 为 `native`；不可续接的有 `omit`（要略去的部件位置，来自 `replay.at`），`thinking` 为 `foreignThinking` 的取值。两边都没有对方的位置列表。诊断只含消息身份、`scope`、`format` 与略去的部件个数。函数不读取任何块，也不读取载荷。
- `continuedMessages(projection)` 返回这次投影中可续接的消息身份。上游以 `replay-rejected` 拒绝后，再发把它们作为 `resent` 传入。

## 消息转换

本章给消息准入者和转换件作者：转换目录、转换件与消息转换的接口。

- 声明：[`src/conversion.ts`](../src/conversion.ts)。
- 入口：`ConvertedContent` 与 `ConversionResult` 在根入口。其余在 `./provider`。
- 类型探针：[`tests/conversion.spec-d.ts`](../tests/conversion.spec-d.ts)。

消息准入使用 ModelMessageConversion。`ConverterKey` 与 `acquire` 的模态用 `Modality`，所以视频转换件是合法的。系统装配提供 ModelConverterCatalog 和本地 ModelConverter；Model runtime 不永久依赖转换目录。共享块保持原身份，转换结果随消息准入者的原块一起接纳，不能拼成额外消息。消费行为见 [转换契约](../SPEC.md#转换与历史投影协议)。

转换器读取能力由具体提供者注入，目录只返回已核验的固定采用。`selected.converter` 是目录出借的对象，可以是对登记转换件的包装；包装对象的 `adoption` 与登记的相同，消费者按 `adoption` 认转换件，不按对象身份。ModelConverter 不取得模型调用、Tool 执行或全局 Context。释放一次取得的资源不删除已接纳派生或历史。Tool 来源由可信准入适配器核原事实，不能用 origin 字符串绕过转换或媒体读取规则。

## 文本分词与完整计量依据

本章给计量提供者作者：窄的分词接口和计量依据的值。

- 声明：[`src/tokenizer.ts`](../src/tokenizer.ts)。
- 入口：`TokenizerDefinition` 与 `ModelCountingBasis` 在根入口；`TokenizationSegment`、`TokenizationFailure` 与 `ModelTextTokenizer` 在 `./provider`。
- 类型探针：[`tests/tokenizer.spec-d.ts`](../tests/tokenizer.spec-d.ts)。

ModelTextTokenizer 是具体计量提供者可注入的窄算法接口。普通请求调用者继续使用 ModelRequestPreparation 或 ModelInputMeter，不取得 tokenizer。模板、模型和供应商适用性归计量提供者，精度归 Measurement；本接口不承诺完整请求 token 数。行为见 [分词与计量](../SPEC.md#分词与完整请求计量)。

TokenizerDefinition.configuration 固定规范化、预切分、特殊 token 表及处理规则，vocabulary 固定词表和合并规则。implementation 固定执行这些规则的代码。adoption 指向这一完整组合的不可变描述。资源路径、分词库类型和文件句柄不进入该值。

ModelCountingBasis.supplier 固定供应商、接收方、物理模型及其适配采用。prompt 表示计量所依据的模板或私有模板估算方法。projection、mediaTransform 和 replay 分别固定请求投影、媒体处理、历史回放规则；无处理也必须采用明确的 identity/no-replay 定义，不用缺字段猜默认。basis.evidence 定位适用模型、格式、精度和限制的依据，不是调用者填写的可信布尔值。

RequestBudget.counting 保存所有参与当前报告的计量依据；相同供应商及模型不得出现冲突组合。单个 meter 固定一份 basis，请求组装方组合各供应商报告。meter.measure 的 supplier、representation.adoption、parameters 和约束须与 basis 及其固定采用相容，跨版本输入明确拒绝，不查同名最新实现补齐。

## 受信宿主驱动

本章给提供者作者和执行宿主：驱动、宿主权威与驱动绑定。

- 声明：[`src/driver.ts`](../src/driver.ts)。
- 入口：全部在 `./provider`。
- 类型探针：[`tests/driver.spec-d.ts`](../tests/driver.spec-d.ts)。

ModelDriver 是提供者给执行宿主的能力，不属于普通 ModelRuntime。ModelDriverHost 在宿主本地绑定该能力，跨线程桥只运输 `ModelDriveInput` 里的身份值，不能序列化 driver、Context 或闭包。独立替代提供者可采用自己的调度构造，仍满足共同协议。

精确绑定、唤醒与关闭协议归 [SPEC](../SPEC.md#宿主绑定与驱动协议)。ModelHostAuthority 从当前受信宿主及原受理事实取得工作身份，不能从队列字段或租户字符串伪造主体。

## 档案来源与准备资源

本章给替代提供者作者和装配者：档案来源、请求规则、准备资源与内容权威。

- 声明：[`src/profile-source.ts`](../src/profile-source.ts)。
- 入口：`ModelProfileSnapshot`、`ModelProfileSource` 与 `ModelContentAuthority` 在 `./provider`。其余在根入口。
- 类型探针：[`tests/profile-source.spec-d.ts`](../tests/profile-source.spec-d.ts)。

普通消费者继续使用 ModelProfiles、ModelRequestPreparation 和 ModelMessageConversion。写入档案的权威提供者直接实现 ModelProfileMaintenance，不增加只转发 change 的工厂层。

来源提供者核当前可见范围和设置快照，只返回该租户可读取的档案。precedence 来自当前合法层序，不能由普通调用者传入。读取失败不返回空目录。资源提供者核固定档案、供应商顺序与原采用，取得规则和 meter；凭据只返回合法引用，不读取秘密。一次取得失败整体释放，release 不撤销准备结果。`acquire` 的输入可以带 `PreparationLineage`：`continues` 是被延续的调用，`sources` 以消息为键给出来源调用。请求组装方为 `continues` 作保的前置条件、超限拒绝与空 lineage 见 [lineage 的声明与前置条件](../SPEC.md#lineage-的声明与前置条件)。没有 lineage 时，租约的计量器在释放前给出与家族计量器相同的结果。有 lineage 时，租约按访问依据读取被引用调用的发出记录，`measure` 保持同步并在 `RequestBudget.calibration` 报告判决，见 [可选校准](../SPEC.md#可选校准及不可解释的历史)。租约释放后，它交出的每个计量器都返回 `unavailable`（`preparation-lease-released`）。租约的 `release` 返回结果；释放钩子失败时结果带 `failure`（`unavailable`），不抛出，异常只表示程序缺陷。实际发出重新取得相同采用，不能以准备成功永久持有发送资格。

ModelRequestRules 只处理固定声明、参数和可计算表示，不读媒体字节，不联网。ModelContentAuthority 同时核原来源、实际块和当前权限，origin 字段本身不授予转换或绕过资格。

## 凭据引用与解析端口

[行为与约束](../SPEC.md#342-凭据引用与解析端口)。

本章给凭据的判定方、保管方和替代提供者作者：凭据引用、查询、存在性与解析结果，以及两个函数。

- 声明：[`src/credential.ts`](../src/credential.ts)、[`src/credential-values.ts`](../src/credential-values.ts)。
- 入口：`CredentialId` 在根入口。其余，含 `MODEL_SEND`、`decodeCredentialId` 与 `sameCredentialHolder`，在 `./provider`。
- 类型探针：[`tests/credential.spec-d.ts`](../tests/credential.spec-d.ts)。解码与持有者比较的行为测试：[`tests/credential.spec.ts`](../tests/credential.spec.ts)。

- `CredentialId` 是由人命名的不透明身份。它在凭据保管的配置路径上命名（本地保管的管理操作，或外部密钥管理的引用名），不由 Model 运行时铸造。所以它没有前缀：误混由类型阻止，运行时的误用走 `absent`、`denied` 这类失败分支。
- `decodeCredentialId` 按 `type`、`empty`、`length`、`character` 的顺序返回第一个失败。`length` 是超过 `MODEL_IDENTITY_MAX_LENGTH`（256）个 UTF-16 码元，与其他品牌同一上限。`character` 是含任一 Unicode 空白、控制字符、格式字符或孤立代理码元，包括制表符、零宽字符和双向控制字符，使身份文本可以安全显示与记录。成对的代理码元是一个合法字符，被接受。非 ASCII 的字母和文字被接受。函数不裁剪、不折叠大小写。解码只核格式，不证明凭据存在或属于某租户。
- 从文本或存储复原 `Supplier` 的位置（档案来源、dispatch 记录、重试决定、恢复读取）必须经 `decodeCredentialId` 取得 `Supplier.credential.id`，不得用类型断言。
- `CredentialPort` 只有 `present` 与 `resolve`。保管方自己的诊断不属于端口，Cordis 服务也不转发它。
- `sameCredentialHolder(left, right)` 是持有者语义的比较：`id` 精确相等，且 `tenantEquals` 为真。未经 legal-identity 铸造的租户值返回 `false`。判定方、保管方与替代提供者共用这一个函数。它不是品牌相等，品牌相等仍是 `===`。
- `MODEL_SEND` 是唯一的用途取值。`CredentialQuery.purpose` 是普通字符串，用途不符的查询由端口返回 `denied`。

## 供应商尝试诊断

本章给诊断提供者和有诊断授权的只读调用方：诊断记录、分页与两个身份解码函数。

- 声明：[`src/diagnostics.ts`](../src/diagnostics.ts)、[`src/identity-values.ts`](../src/identity-values.ts)、[`src/reference.ts`](../src/reference.ts)。
- 类型探针：[`tests/diagnostics.spec-d.ts`](../tests/diagnostics.spec-d.ts)。

诊断是独立授权的只读面，不挂到普通调用句柄上，也不要求所有 ModelRuntime 消费者依赖它。提供者从原调用和 dispatch 的耐久事实投影，不接受普通调用者提交诊断内容。

诊断不公开 prompt、消息、工具参数、响应正文、凭据或绑定 ID、媒体引用、URL、headers 和原始异常。adapter 采用描述也须为可披露的登记值，不能夹带路径或秘密。诊断 ID 只定位受保护记录，不是读取凭证。两个解码函数只拒绝格式错误。游标的不可猜测与验证由诊断提供者承担：`list` 仍须验证游标、重新授权，并对无效或已淘汰的游标返回 `invalid`。精确的披露、分页与保留协议见 [SPEC](../SPEC.md#诊断查询与保留)。

## 受控替代提供者

本章给领域外协调者的测试作者。名字由 `./testing` 入口导出。

- 声明：[`src/testing/provider.ts`](../src/testing/provider.ts)、[`src/testing/controller.ts`](../src/testing/controller.ts)、[`src/testing/core.ts`](../src/testing/core.ts)、[`src/testing/transport.ts`](../src/testing/transport.ts)、[`src/testing/error.ts`](../src/testing/error.ts)；三个公开替身：[`src/testing/pusher.ts`](../src/testing/pusher.ts)、[`src/testing/stream-references.ts`](../src/testing/stream-references.ts)、[`src/testing/stream-observation.ts`](../src/testing/stream-observation.ts)，共用的控制面决策 [`src/testing/access.ts`](../src/testing/access.ts)。
- `ScriptedWriteAction` 是 `src/testing/writes.ts` 里 `WriteAction` 的导出别名，由 [`src/testing/index.ts`](../src/testing/index.ts) 声明。
- 行为测试：[`tests/testing-provider.spec.ts`](../tests/testing-provider.spec.ts)、[`tests/testing-transport.spec.ts`](../tests/testing-transport.spec.ts)、[`tests/testing-entry.spec.ts`](../tests/testing-entry.spec.ts)；三个替身：[`tests/testing-pusher.spec.ts`](../tests/testing-pusher.spec.ts)、[`tests/testing-stream-references.spec.ts`](../tests/testing-stream-references.spec.ts)、[`tests/testing-stream-observation.spec.ts`](../tests/testing-stream-observation.spec.ts)。

`@omne-harness/model-contract/testing` 入口给领域外的协调者测试用。它提供一个按脚本行事的 `ModelProvider` 和一个按脚本行事的 `ModelTransport`，用来练习失败路径上的决策。它们不运行模型，不保存任何耐久状态，受理先执行共同封闭输入判断，不读取媒体，只核验脚本登记过的证据，也不导入任何具体提供者、Cordis、pi 或厂商 SDK。状态都在闭包里，不读系统时钟。脚本结算的 parts 与每项 trims 必须是无空位的数组，每条 trim 都须有合法 removed/reason。非法输入抛出 ScriptedModelError，reason 为 invalid-script，并保留原生命周期。符合性断言在另一个入口 `./conformance`（见[符合性断言](#符合性断言)），任何提供者都可以用它检查自己；本入口只带一个把替代提供者接成被测方的函数。

`controller.settle` 显式接收 parts、pageSize 和 pageTargetBytes，不从 play 自动结算。它校验最终项、真实 trim 的形状和原受理容量，在发布结算前按固定页源深复制。首项总能入页，超目标单项独页；后项按规范 parts 数组字节及项数贪心组页。整个 ResultPage（含 Settlement、next 和包装）不得超过原 C。超额或非法输入抛 ScriptedModelError，保留原生命周期。配置或返回对象的后续修改不改变原结果。具体领取与 partial 资格见 [普通调用面](#普通调用面与实例观察)。

脚本给出什么结果，替代件就给出什么结果，由脚本作者对结果负责。它证明协调者怎样处理契约面上的可观察结果，不证明生产提供者的真实发送、持久化与恢复。脚本给出的 `not-committed` 是脚本的回答，不是存储的完整排除证明（[SPEC](../SPEC.md#342-独立执行与提供者操作)对 `query` 的要求）。

`createScriptedModelProvider` 返回的 `provider` 按契约的认回与幂等规则工作：同租户内同 operation 同参数认回原结果，同 operation 不同参数、或同 operation 用于另一种操作，返回 `conflict`；保留值先于资格与存在性检查，一律返回 `invalid`（替代件不记录守卫派生的控制，派生值也不例外），所以主体的调用、他租户的调用与不存在的调用得到同一个回答；其他租户的调用与不存在的调用不可区分；同一调用的后续取消认回原控制。`controller` 是测试的手：它推进调用、撤除或替换实例、撤销主体资格、断开观察者并报告还开着几个观察、让一次写操作返回 `commit-unknown`、设定取消的传播与上游状态，并保管取消之后才到达的结果。它还能给运行中的调用喂入上游事实（`play`）：块表按事实归约出快照里的块，契约禁止的转换（填充未开的块、换填充方式、改已封的块、封口与累计值不符、封口被截断的工具参数）被拒绝，其后的事实被丢弃。`ended` 与 `account` 事实被接受，但不改变块与阶段：调用仍是 `running`，只有 `settle` 使调用收场。每次 `play` 仍提交一个新修订并通知观察者。它能给调用登记可接受的证据（`expectEvidence`）：登记之后，`acknowledge` 只接受登记过的证据，其余返回 `handoff-invalid`；没有登记时接受任何证据。它还能让目录不可达（`failDirectory`），之后每个调用的 `connect` 都返回 `unavailable`。对一个调用的控制不影响其他调用。控制器在脚本违反调用状态时抛 `ScriptedModelError`，契约失败只以回复值给出。

`createScriptedTransport` 返回的 `transport` 按 `prepare`、`materialize`、`start` 三步给出脚本化的事实流。流可以正常终止、耗尽而没有终止事实，或在最后一个事实之后抛错。`start` 在调用时计数，不等第一次迭代；同一对象重复 `materialize` 或 `start` 抛 `ScriptedModelError`。`counts()` 给出各步被调用的次数。信号中止时，流以已确认的中断收场。

`commitUnknown` 让下一次同租户、同动作、同 operation 的写操作回答 `commit-unknown`。`applied` 使写操作实际生效，`dropped` 不留下任何东西；之后同 operation 重发，前者认回原结果，后者成为首次受理。`stays-unknown` 使 `queryCommit` 在那次重发之前一直回答 `unknown`。那次重发指发出该 operation 的调用再发这个 operation：该调用以这个 operation 发出的写，无论认回还是 `conflict`，都解除保持，因为 `conflict` 本身已表明该 operation 生效，之后答 `committed` 是真话，不造成重复执行。同租户另一个调用用同名 operation 的写得到 `conflict`，不解除保持。脚本属于它所指名的租户：别的租户用同名 operation 发写操作，既不消耗这条脚本，也不解除保持。替代件不区分更细的未知种类。

`queryCommit` 把 operation 当作发出它的那个调用的东西：别的租户来问、同租户用别的调用或不存在的调用来问，得到的回答与问一个从未发出过的 operation 深相等。失权按所问的调用判断，换一个调用名不能绕过 `denied`。`not-started`、物化提交未知与实例代次的写入失败属于真实提供者的深接缝（`ModelCommands`），替代件不实现它。

### 三个公开替身

本入口另有[结果推送与保存](../SPEC.md#结果推送与保存)和[公共内容观察与当前目标](../SPEC.md#公共内容观察与当前目标)两个协议的三个公开替身，供契约骨架与消费方的契约测试使用；公开的理由与边界归 [SPEC](../SPEC.md#公开替身与受控替身)。三个替身状态都在闭包里，不读系统时钟，不导入任何接收方实现。`current` 替身与观察替身带测试控制面 `setAccess`：按真实租户与主体身份（`Object.is`）设 `ScriptedAccessDecision` 的 `allow`、`deny` 或 `unavailable`，没有设过的访问一律 `deny`；它不是生产 AccessCheck。推送生产者替身没有自己的控制面，它以构造时给出的 `principal` 行事，资格由被包的提供者与使用方注入的接收端口各自核验。

`createScriptedResultPusher` 包住一个替代提供者。下面按交付的先后列出它的行为。

- 受理：使用方经它返回的 `provider` 受理调用，替身在 `admit` 处记下调用的受理 operation 与引用。`mop_ack-` 与 `mop_push-read-` 是替身保留的两个 operation 前缀，调用方不得用它们铸造自己的 operation。受理 operation 以其中一个前缀开头时，`admit` 抛 `ScriptedModelError('invalid-script')`，不转发给内层提供者。只有 `admit` 核对保留前缀：`cancel` 与消费面的方法原样转发，带保留前缀的 operation 撞上替身自己的 operation 时，由内层提供者按 operation 的 `conflict` 规则回答。
- 驱动：使用方经它返回的 `controller` 驱动脚本。`settle` 与 `recordDispatch` 的行为见下面各项，`controller` 的其余方法原样转发。
- operation 铸造：`settle` 在转发之前铸造两个固定专用 operation。读取结果用 `mop_push-read-` 加调用去掉 `mcall_` 前缀后的主体，取 ACK 用 `mop_ack-` 加同一主体。同一调用重投得到同一 operation，可以认回。主体不以 `--` 开头，与 `deriveGuardControlOperation` 的保留规则不冲突。先铸的是 `mop_push-read-`（14 个字符）：主体超过 242 个字符时，它超出身份长度上限 256，`settle` 抛 `ScriptedModelError('invalid-script')`，不转发给内层控制器，调用保持 `accepted`。`mop_ack-` 的上限 248 因此不会先到。
- 冻结：`settle` 转发给内层控制器后，替身只经公开面（`inspect`、`dispatches`、`beginRead`/`readNext`/`closeRead`）读出 `CallState`、每个 dispatch 的账目快照（没有报告的写 null）与全部有序 `ResultPart`，组成 result 交付并深复制、深冻结。之后改脚本输入不改变载荷。任一步读取失败时，交付记为 `failed`，失败是 `not-frozen`（`step` 为 `inspect`、`dispatches` 或 `read`），不推送，不取 ACK。
- 推送：替身按 `resolveReceiver(consumer.owner)` 取接收端口推送，并按回答记录。
  - 解析结果为 null：记 `no-receiver`。
  - saved：核回执 key 与原 key 结构相等，不等记 `receipt-key-mismatch`。
  - `outcome-unknown`：按原 key 与同一冻结载荷立即重投，最多 `maxRedeliveries`（默认 3）次，之后记 `unknown` 并保留载荷。
  - 其余失败：记 `rejected`，带接收方的失败值，不自动重投。`backpressured`、`unavailable` 由测试经 `redeliver` 驱动。
  - 解析函数或接收端口抛出：记 `threw`，`error` 是抛出的那个值本身。替身不复制它，也不冻结它。
- saved 不可回退：saved 是调用级事实。一次交付 saved 之后，`deliveries()` 与 `settled()` 一直给出 saved 和原回执。之后每次 `redeliver` 照常累计尝试次数（含 `outcome-unknown` 时的立即重投），并以返回值给出这一次 `redeliver` 的结果：saved（带这一次的回执）、带 `PushFailure` 的 `failed` 或 `unknown`。它不改写 saved，不清除原回执。ACK 与晚账的放行都以这个 saved 事实为准。
- `unknown` 不被后来的失败抹去：记为 `unknown` 的交付，之后的 `redeliver` 得到 denied、unavailable、`backpressured` 等失败时，记录仍是 `unknown`，这一次的失败只以返回值给出；只有后来的 saved 取代它。在途时它也仍显示 `unknown`。其余尚未 saved 的交付，`redeliver` 的结果就是它新的记录。没有这个 key 的交付、载荷从未冻结或这次交付正在重投时，`redeliver` 抛 `ScriptedModelError('invalid-script')`。
- ACK：saved 之后替身自己取 ACK，用 `mop_ack-` operation 与 `{kind:'retained', custody: receipt.evidence}` 调用内层 `acknowledge`。`commit-unknown` 时同 operation 重发，上限同 `maxRedeliveries`。其余失败只记进 `acknowledgements()`，不改 result 的 saved 事实。
- 晚账：`recordDispatch` 转发后，带非 null 账目的记录按到达顺序排队。result saved 之后，revision 比冻结快照里该 dispatch 新（或快照为 null）的账目组成 account 交付推送。同 dispatch 同 revision 不重复推送。
- 读数：`deliveries()` 按 key 给出 `pending`、`saved`、`failed`、`unknown` 与尝试次数。`settled(call)` 在该调用的 result 交付、它的 ACK 与排在它之前的账目交付都到终态后兑现。受理过但从未 `settle` 的调用，`settled(call)` 永不兑现。替身自己的工作抛错时（例如接收方回答的回执或失败值不能深复制），`settled(call)` 以该错误拒绝；这一拒绝对该调用之后的每次 `settled(call)` 都有效，出错的那条交付记录显示 `pending`。这是「saved 不可回退」一项的唯一例外，它只在接收方违反纯值约定时出现；saved 事实、ACK 与晚账的放行不受影响。

替身不执行每租户与全局限额及背压、正文释放后的晚账恢复扫描、持久交付待办。它不证明磁盘耐久、跨进程互斥、真实主体或最终输出围栏。

`createScriptedStreamReferences` 从一个确认记录给出 `ModelStreamSelection`：`confirmSelection` 登记 state 与当前目标，`establishWithoutTarget` 登记没有目标的确认，`withdrawTarget` 退役无后继；`setSource('unavailable')` 使读取返回 `unavailable(stream-references)`；`holdResponse`/`reached`/`releaseResponse` 让一次响应等待，等待后重核资格并重读来源。失败顺序按 [current 的失败与读取顺序](../SPEC.md#current-的失败与读取顺序)；`events()` 记录每次通过前置检查的来源读取。登记的记录与返回的 selection 都是深复制、深冻结的纯值。

`createScriptedStreamObservation` 按 `StreamRef` 提供内存中的 `ModelStreamObservation`。`publish` 登记一条新流的首个已确认快照，`advance` 登记同一 ref 的下一个快照并用 `diffModelStream` 得出 delta（失败抛 `ScriptedModelError`）；两者都推进该流的公共位置（从 1 起每次加 1，state-only 变化也推进），返回 `encodeStreamCursor` 的游标。`observe` 按 [stream-arrival 的失败顺序](../../../common/stream-arrival/README.md#failure-order-and-iterator-completion)检查：未铸造或他租户以 `denied` 结束，引用文本不可读以 `stale-stream` 结束，然后查控制面（`deny`→`denied`，`unavailable`→`unavailable`），然后流不存在以 `stale-stream` 结束、已 `end` 的流以 `end` 给出的 reason 结束。通过后先给当前快照，之后每个 `advance` 给一帧 delta，`from` 是该观察者上一帧的游标；取得快照与登记订阅在同一同步临界区完成。signal 中止以 `observer-closed` 结束并退订，已排定的终止帧也让位给它；中止之后交出前仍重核，撤权或控制面不可用时下一帧是 `denied` 或 `unavailable`，优先于 `observer-closed`；同一 ref 再次观察先给当时的完整快照，再给后续 delta，不重放旧 delta。撤权与控制面不可用对所有已开的观察立即生效：替身当场重核每个已开的观察，排队的帧不会在核对失败之后交出。`end` 也立即生效：替身丢弃该流每个已开观察者未取的快照与 delta，之后只交出终止帧。已排定的终止帧在交出前再重核引用、租户与控制面。撤权后的下一帧是 `denied`，控制面不可用后的下一帧是 `unavailable`，二者优先于已排定的终止帧。已排定的终止帧不被之后的 `end` 改写，`end(stale-stream)` 也不例外：替身只重核引用、租户与控制面，不模拟发布代次的核对。`capacity` 是每个观察者待取帧数的上限。加入一帧会超出上限时，替身先移除该观察者的订阅并清空待取帧，再排定一个终止 `gap`：`reason` 为 `buffer`，`after` 是最后交出给该观察者的游标。按[公共契约](../../../common/stream-arrival/README.md#failure-order-and-iterator-completion)，以 `capacity` 结束的情形是快照超限、观察者准入因数量或总资源失败、生产者结束值超限。本替身只限每个观察者的待取帧数（`capacity` 须为正整数，否则构造时抛 `ScriptedModelError('invalid-script')`），不限观察者数与字节，快照总是空队列的第一帧，所以本替身不给 `capacity`。输出帧是深复制、深冻结的纯值；替身不发布真实来源，不持久化，也不模拟目标来源不可用。

## 符合性断言

本章给提供者作者：符合性检查的入口、被测方的形状、义务名单与报告。义务套件由 `@omne-harness/model-contract/conformance` 入口导出，它不导出替身，检查真实提供者的依赖里不会有脚本化的替身。把替代提供者接成被测方的 `createScriptedConformanceSubject` 与 `ScriptedPrincipal` 是替身，留在 `./testing`。

- 声明：[`src/conformance/conformance.ts`](../src/conformance/conformance.ts)、[`src/conformance/conformance-types.ts`](../src/conformance/conformance-types.ts)、[`src/testing/conformance-scripted.ts`](../src/testing/conformance-scripted.ts)。入口文件：[`src/conformance/index.ts`](../src/conformance/index.ts)。
- 行为测试：[`tests/conformance-entry.spec.ts`](../tests/conformance-entry.spec.ts)、[`tests/conformance-exports.spec.ts`](../tests/conformance-exports.spec.ts)。义务表与套件的一致检查：[`tests/conformance-docs.spec.ts`](../tests/conformance-docs.spec.ts)。

`checkModelProviderConformance` 对一个被测方逐条检查契约在公开面上可观察的义务，返回报告。它只经公开面驱动：`ModelProvider.runtime` 的 `calls`、`consumption`、`instances`，`quiesce`，以及可选的 `ModelTransport` 的 `prepare`、`materialize`、`start`。它不读系统时钟，不导入具体提供者，也不拿 `ModelCommands` 这条深接缝。

被测方由 `subject` 工厂给出，每条检查调用一次，所以一条检查不会看到另一条留下的状态。工厂给出的 `ConformanceSubject` 带提供者、一个有权操作 `tenant` 的主体、另一个租户 `otherTenant`，以及可选的请求值、钩子和传输。请求、消费者与容量缺省时用套件自带的值，它们对真实提供者没有意义，真实提供者要给自己接受的值。

有些准备只有装配提供者的一方能做：让调用开始运行、收场并带上耐久证据，撤除或替换实例，撤销主体资格，让目录不可达，让下一次写操作回答 `commit-unknown`。这些由被测方通过可选的 `hooks` 提供。`not-applicable` 不算通过，它有三个来源：被测方没给义务需要的钩子；被测方没给义务需要的传输；结果只有一页，使三条读取义务无法检查，即 `read-page-stable-for-same-after`、`acknowledge-keeps-open-read-readable`、`revoked-reader-gets-no-page`，原因写「提供者把整个结果作为一页给出」。每个钩子的契约写在它的声明旁：`showFacts` 把上游事实当作执行会收到的那样交给运行中的调用，提供者拒绝的事实终止处理，钩子不为此抛错；`settleCall` 对已经收场的调用不做任何事，套件给出的 `pageSize` 与 `pageTargetBytes` 是项数上界与规范 parts 数组字节组页目标。它通过 startRun/settleCall 准备确定的混合 parts，再从普通消费面核值、顺序、trims 和终局；有钩子却丢值或提醒属于失败。传输义务需要 `transport`，其 `sends()` 报告已经离开传输的业务请求数，传输的事实流须以终止事实结束。

报告里每条义务有名字、`pass`、`fail` 或 `not-applicable`，以及失败或缺项的原因。`ok` 在没有任何 `fail` 时为真，`not-applicable` 不使它变假。违约以报告给出，不抛出。被测方抛出的错误（包括钩子抛出的）算作失败，原因里带错误名与消息：契约失败只以回复值给出，抛出表示程序缺陷。`waitMs` 是套件对被测方每一次等待的上限，缺省 1000 毫秒：等工厂、提供者方法、钩子、传输的 `prepare`、`materialize` 与 `close`、`dispose`、观察与事实流都受它限制。超时算当条检查失败，原因说明在等什么，随后套件照常尝试释放被测方，释放同样限时；不能取消的挂起承诺留着不管，不阻塞后面的检查。工厂抛错或超时、`dispose` 抛错或超时，只让当条检查失败，原因注明是工厂还是释放，套件继续跑后面的检查；检查本身失败且释放也失败时，两个原因都保留。事实流超时或出错时，套件调用迭代器的 `return`，并关闭自己打开的第二次物化。

`createScriptedConformanceSubject` 把[受控替代提供者](#受控替代提供者)和替代传输接成带全部钩子的被测方，它通过全部义务，没有 `not-applicable`。它是套件可以被通过的证明，也是提供者作者接自己的提供者时可以照着写的样子。

下表列出全部义务。「依据」指向 SPEC 里规定它的条款；「钩子」是它需要的钩子，空表示只经公开面即可检查。

| 义务 | 检查什么 | 依据 | 钩子 |
| --- | --- | --- | --- |
| `admission-repeat-recognised` | 同调用、同固定输入的重复受理返回原调用与原修订，并标 `recovered` | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `admission-conflict-on-different-input` | 同 operation 配不同固定输入返回 `conflict`，并指名这个 operation | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `operation-not-reused-across-methods` | 受理用过的 operation 再用于取消不成功，调用状态不变 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | |
| `admission-is-not-a-send` | 刚受理的调用不显示已开始的发送 | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `reserved-operation-refused` | `admit`、`cancel`、`inspect`、`beginRead`、`acknowledge` 收到保留 operation 返回 `invalid`，字段名取承载 operation 的字段；引用内的保留 admission 由 reference 拒绝 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | |
| `refused-admission-forms-no-call` | 被拒的受理不形成调用：同一调用用别的 operation 再受理，是首次受理 | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `commit-unknown-keeps-operation` | 受理提交未知后，失败值指名原 operation；同 operation 重试认回原调用；另一个调用用这个 operation 不成功。`applied` 与 `dropped` 各检查一次 | [资格、共同提交与实际发送](../SPEC.md#342-资格共同提交与实际发送) | `failNextWrite` |
| `commit-unknown-not-reported-as-refusal` | 已生效的受理回答提交未知后，`inspect` 不报 `not-accepted` | [逐操作行为](../SPEC.md#342-逐操作行为) | `failNextWrite` |
| `commit-unknown-cancel-recovers-original` | 取消提交未知后，同 operation 重发得到以这个 operation 请求的控制 | [逐操作行为](../SPEC.md#342-逐操作行为) | `failNextWrite` |
| `commit-unknown-acknowledge-recovers-original` | 确认提交未知后，同 operation 重发成功，调用显示这次确认的 operation | [逐操作行为](../SPEC.md#342-逐操作行为) | `failNextWrite`、`startRun`、`settleCall`、`provideEvidence` |
| `mixed-partial-result-readable` | 普通领取按原顺序交付完整块、未封值及真实 trims，保留终局；同 after 重放不变 | [结果保管与承接](../SPEC.md#342-普通调用面与实例观察) | `startRun`、`settleCall` |
| `settled-call-keeps-termination` | 调用收场后，对这个已收场的调用取消（回复什么都接受），再观察，阶段仍是已收场，终局与收场时深相等 | [调用和各次真实发出](../SPEC.md#调用和各次真实发出) | `startRun`、`settleCall` |
| `read-before-settle-refused` | 运行中的调用上 `beginRead` 返回 `not-settled` | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun` |
| `acknowledge-refused-before-settle` | 运行中的调用上 `acknowledge` 不成功，保管状态仍是 `producer` | [ACK 的前提与效果](../SPEC.md#ack-的前提与效果) | `startRun` |
| `forged-evidence-refused` | 以伪造证据确认不成功，保管状态仍是 `producer` | [ACK 的前提与效果](../SPEC.md#ack-的前提与效果) | `startRun`、`settleCall`、`provideEvidence` |
| `acknowledge-records-custody` | 确认成功后，回执指名原调用、结果版本与 operation，调用显示 `acknowledged` | [ACK 的前提与效果](../SPEC.md#ack-的前提与效果) | `startRun`、`settleCall`、`provideEvidence` |
| `duplicate-acknowledge-returns-original` | 同参数重复确认返回同一调用、结果、operation 与证据的回执；不比较清理状态，它会自行推进 | [ACK 的前提与效果](../SPEC.md#ack-的前提与效果) | `startRun`、`settleCall`、`provideEvidence` |
| `acknowledge-conflict-on-different-input` | 同 operation 配不同证据返回 `conflict`，指名原 operation | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun`、`settleCall`、`provideEvidence` |
| `acknowledged-result-not-read-again` | 确认之后新的 `beginRead` 返回 `acknowledged`，不开始新的读 | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun`、`settleCall`、`provideEvidence` |
| `acknowledge-and-read-serialised` | 确认与 `beginRead` 并发，两种先后下结果一致：确认先则读见到这次确认，读先则确认后这个读仍可关闭 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `startRun`、`settleCall`、`provideEvidence` |
| `read-page-stable-for-same-after` | 同一 `after` 的 `readNext` 返回同一页 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `startRun`、`settleCall` |
| `close-read-idempotent` | `closeRead` 重复调用返回同一结束状态 | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun`、`settleCall` |
| `acknowledge-keeps-open-read-readable` | 确认并推进清理之后，已开始的读仍按序读完全部结果 | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun`、`settleCall`、`provideEvidence`、`advanceCleanup` |
| `revoked-reader-gets-no-page` | 读取资格撤销后，`readNext` 不再给页：返回 `denied`，或以 `denied` 结束读取 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `startRun`、`settleCall`、`revokeAccess` |
| `cleanup-failure-keeps-acknowledgement` | 清理不能继续时，调用仍显示 `acknowledged`，重复确认仍成功 | [逐操作行为](../SPEC.md#342-逐操作行为) | `startRun`、`settleCall`、`provideEvidence`、`blockCleanup` |
| `repeat-cancel-returns-original-control` | 第二次取消，不论 operation 是否相同，返回首次请求的控制 | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `cancel-does-not-claim-stop` | 取消的回复不声称上游已停止 | [控制、取消与晚到事实](../SPEC.md#控制取消与晚到事实) | |
| `cancelled-call-ends-interrupted-unacknowledged` | 取消后收场的调用保管状态仍是 `producer`；终局是关联该控制的 `interrupted` 由套件经 `settleCall` 给出，不是提供者的决定（见弱断言清单） | [控制、取消与晚到事实](../SPEC.md#控制取消与晚到事实) | `startRun`、`settleCall` |
| `cancel-confined-to-target-call` | 取消一个调用，同租户另一个调用的状态不变 | [控制、取消与晚到事实](../SPEC.md#控制取消与晚到事实) | |
| `unauthorised-cancel-denied` | 失去取消资格的主体取消返回 `denied`，调用不出现控制 | [控制、取消与晚到事实](../SPEC.md#控制取消与晚到事实) | `revokeAccess` |
| `cancel-sends-nothing-more` | 运行中的调用已显示一个已开始的发送，取消之后它不新增（没有已开始的发送，就看不出新增，按失败报告） | [控制、取消与晚到事实](../SPEC.md#控制取消与晚到事实) | `startRun` |
| `observation-opens-with-snapshot` | 观察的第一项是快照，之后是变化，游标不倒退 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | |
| `stopping-observation-keeps-call-running` | 中止观察以 `observer-closed` 结束，调用仍在运行且没有控制 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `startRun` |
| `disconnect-ends-observation-as-unavailable` | 观察被断开时以 `unavailable` 结束，调用没有收场 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `disconnectObservers` |
| `new-observer-starts-from-snapshot` | 新观察者先得到当前快照：调用仍在运行、保管状态为 `producer`，在途的块在快照里 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `startRun`、`showFacts` |
| `growing-block-holds-accumulated-value` | 增长中的块给归约后的累计值：追加块是各片段之和，替换块是最后一个完整值 | [供应商解释与流状态归约](../SPEC.md#供应商解释与流状态归约) | `startRun`、`showFacts` |
| `sealed-block-takes-no-more-fill` | 封口之后对该块的填充不改变快照里的封口块 | [供应商解释与流状态归约](../SPEC.md#供应商解释与流状态归约) | `startRun`、`showFacts` |
| `unsealed-tool-arguments-not-executable` | 还在到达或被截断的工具参数不成为已封口的工具建议 | [供应商解释与流状态归约](../SPEC.md#供应商解释与流状态归约) | `startRun`、`showFacts` |
| `cross-tenant-access-refused` | 另一租户对调用的取消、读取与确认不成功，调用状态不变 | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `refusal-hides-existence` | 另一租户访问已存在的调用，与访问不存在的调用，对 `inspect`、`dispatches`、`cancel`、`connect`、`beginRead`、`acknowledge`、`readNext`、`closeRead` 的回复整体深相等 | [逐操作行为](../SPEC.md#342-逐操作行为) | |
| `revoked-principal-gets-denied` | 资格撤销后，`inspect`、`beginRead`、`acknowledge` 返回 `denied` | [逐操作行为](../SPEC.md#342-逐操作行为) | `revokeAccess` |
| `revoked-principal-observation-ends-denied` | 资格撤销后，在途观察与新开的观察都以 `denied` 结束，调用没有收场 | [普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察) | `revokeAccess` |
| `withdrawn-instance-has-no-live-route` | 实例撤除后，`connect` 回答 `no-live-route`，原调用仍在 | [逐操作行为](../SPEC.md#342-逐操作行为) | `withdrawInstance` |
| `directory-failure-is-unavailable` | 目录不可达时，`connect` 返回 `unavailable` | [逐操作行为](../SPEC.md#342-逐操作行为) | `failDirectory` |
| `replaced-instance-ends-observation-as-stale` | 实例被替换后，旧句柄的在途观察与新开的观察都以 `stale-instance` 结束，`connect` 给出新实例的句柄，原调用仍在 | [逐操作行为](../SPEC.md#342-逐操作行为) | `replaceInstance` |
| `quiesce-refuses-new-admissions` | `quiesce` 之后新的受理不成功且不留调用，已受理的调用仍可查询 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | |
| `quiesce-reports-pending-and-running` | `quiesce` 报告的待处理与运行中数量是十进制数，且不少于套件已知未收场的调用数 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | `startRun`（只检查运行中数量时） |
| `transport-sends-only-at-start` | `prepare` 与 `materialize` 不发送，`start` 一返回就已发送，不等第一次迭代 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | 传输 |
| `repeated-transport-step-sends-nothing` | 同一 prepared 再 `materialize`、同一 materialized 再 `start`，不给出能产出事实的流，也不再发送 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | 传输 |
| `materialization-receipt-matches-request` | 回执有非空的 payload 摘要，供应商与表示采用同请求一致，两次读取相同；回执带 `replayFormat` 时，它是合法的回放标签，两次读取相同 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | 传输 |
| `fact-stream-ends-once` | 事实流恰有一个 `ended`，它是最后一个事实 | [供应商解释与流状态归约](../SPEC.md#供应商解释与流状态归约) | 传输 |
| `interruption-is-confirmed` | 信号中止后的事实流里，每个 `interrupted` 终止都带 `stop: 'confirmed'` | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | 传输 |
| `transport-close-is-idempotent` | `close` 重复调用不抛错，关闭不发送 | [独立执行与提供者操作](../SPEC.md#342-独立执行与提供者操作) | 传输 |

契约没有给出失败 kind 或判据的地方，以及判据有但公开面上看不到的地方，套件只做较弱但确定的断言，不替契约定 kind：

- 另一租户的取消、读取与确认，页面没有规定失败 kind（[逐操作行为](../SPEC.md#342-逐操作行为)只写拒绝跨租户默认访问）。套件只要求不成功、调用状态不变；读类操作改按「不暴露存在」判，即与访问不存在的调用整体深相等。
- 提前确认或伪证据确认的失败 kind 没有规定（ACK 行只写拒绝）。套件只要求不成功、保管状态仍是 `producer`。
- 「重复确认不重复转移」在公开面上看不到转移，回执也只给结果。套件只比较回执的身份成员。
- 已经开始却长期不进展的读取的期限，以及清理进入 `blocked` 与 `pending` 的条件，页面没有给值（[普通调用面与实例观察](../SPEC.md#342-普通调用面与实例观察)）。套件只要求清理推进期间已开始的读取仍能取到下一页。结果只有一页的提供者，`read-page-stable-for-same-after`、`acknowledge-keeps-open-read-readable`、`revoked-reader-gets-no-page` 三条报告 `not-applicable`。
- 观察者落后时结束观察，`Observation.ended` 的原因集合里没有对应的值（[参数与注入的裁定](../SPEC.md#342-参数与注入的裁定)）。套件不检查。
- 重复 `materialize` 或 `start` 是抛出还是返回失败，页面没有规定。套件两种都接受，只要求不给出能产出事实的流、不再发送。
- 套件没有让替代传输以上游拒绝收场、再观察重试策略的入口。「上游超限以 `input-over-limit` 收场且不重试」因此没有可观察的入口，套件不检查。同理，推理回放被拒后的再发不检查；回放投影与关闭回放发生在适配器编码时，套件也不检查（[推理回放](../SPEC.md#推理回放)）。
- 媒体读取器不在 `ModelTransport` 的签名上，读取器怎样注入没有规定，所以「只在 `materialize` 读取媒体」没有可观察的入口，套件不检查。
- `quiesce` 之后受理失败的 kind 没有规定。套件只要求不成功、不留调用。
- 取消之后 `ControlState.upstream` 的初值没有规定。套件只要求它不是 `stopped`。
- 同一 operation 跨方法复用的失败 kind 没有规定。套件只要求不成功、状态不变。
- 首内容前断流应落在哪一个故障原因，没有规定。套件不检查故障原因；耗尽或抛错的流怎样归约为带诊断的失败，归 Model 实现的执行函数，不在套件里。同理，首内容后失败不重发、重试决定只在首内容前被接受，以及同块填充方式不切换的非法转换怎样终止，也归 Model 实现。
- 已收场调用的终局不反转：公开面上能做的是取消这种可能扰动终局的步骤，再比较前后的阶段与终局。提供者深接缝上覆盖终局的重复收场，公开面看不到，套件不检查。`settleCall` 对已收场的调用什么都不做，所以再调用一次测不到提供者。
- 取消后收场的终局是 `interrupted`、关联该控制：终局由套件经 `settleCall` 交给提供者，不是提供者自己的决定。套件只检查保管状态仍是 `producer`，报告不声称终局来自提供者。
- 混用 call 与 instance 由类型层的负例覆盖。
