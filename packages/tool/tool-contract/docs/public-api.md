# Tool 公开入口与设计定义

根入口 `@omne-harness/tool-contract` 导出全部公开契约类型、品牌身份的解码函数、默认结果政策、资产正文端口 `toolBodyContract` 和契约函数。契约函数不做 I/O，不读时钟，不产生随机值，不调度并发，也不持有状态。根入口不导入 Cordis，也不导入提供者成员。

公开类型的唯一定义在 [src/index.ts](../src/index.ts) 及其导出模块。本页是源码导航，不保留手写类型声明。`createToolRuntime`、`createToolLedger`、`executeTool` 与 `createIndependentToolScope` 在 `@omne-harness/tool`（[本增量未交付](../../README.md#未交付标注)），导航见该包的 public-api（`tool/docs/public-api.md`）（[本增量未交付](../../README.md#未交付标注)）。其中 `executeTool` 与 `createIndependentToolScope` 已实现。`createToolLedger` 与 `createToolRuntime` 只实现了一部分路径，其余操作回复具名的 `unsupported`。宿主在 `@omne-harness/tool-host-local`（[本增量未交付](../../README.md#未交付标注)）：G5 的 `createLocalStartCoordinator` 已实现，G4 的宿主时钟与 G7 的绑定登记表尚未交付。五档支持范围见[工具执行组的支持范围](../../README.md#支持范围)。

服务定义、18 个服务键和 `tool-cordis-contract/call-changed` 事件增补由 `@omne-harness/tool-cordis-contract/cordis` 导出，本包不导出它们。源码是 [tool-cordis-contract/src/cordis.ts](../../tool-cordis-contract/src/cordis.ts)，装配规则归 [cordis](../../tool-cordis-contract/docs/cordis.md)。行为、调用资格、参数与依赖分类归 [SPEC 的运行契约](../SPEC.md#342-主干运行契约候选)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model.md)。

## 值、定义和固定请求

[行为与约束](../SPEC.md#342-值定义和固定请求)。

- [identity.ts](../src/identity.ts)：品牌身份、采用与耐久证据引用、访问输入，以及每个品牌身份的解码函数。
- [definitions.ts](../src/definitions.ts)：参数契约、返回声明、工具定义、可用性、调用参数、资源 scope（owner、key 与授予证据 grant）与固定请求。
- [judge-definition.ts](../src/judge-definition.ts)：`judgeToolDefinition`，按 P02、P13 和 P15 对未知输入做封闭字段与类型检查。
- [judge-request.ts](../src/judge-request.ts)：`judgeFixedToolRequest`，对未知输入做固定请求的封闭检查：每个字段的形状、定义经 `judgeToolDefinition`、并发上限是正整数或 null、时限是非负整数或 null、`command` 选中定义声明的操作（函数工具只接受 null，多命令工具要求具名且存在）。它不读存储，不授予资格；来源、当前资格与可用性事实由受理提供者核验。

契约函数的失败值用 `field` 给出被拒绝的字段路径，例如 `commands[1].name`。根值本身被拒绝时，`field` 是所求类型名，例如 `ToolDefinition`。`reason` 是 `missing`、`type`、`empty`、`blank`、`duplicate`、`unknown-field`、`accessor` 等具名原因。判定只读取数据属性，不调用 getter 或输入中的函数。访问器属性以 `accessor` 被拒绝。值字段只读取自身属性。作者能力（例如 executor 与 codec）可以是类实例，所以它的方法与 `adoption` 可以来自原型链。读取输入时抛出的异常（例如 Proxy 的 trap）不传出，整个值以 `unreadable` 被拒绝。json-text 树可以共享子树，但不能成环（`cycle`）。共享子树每到达一次就计数一次，一次判定最多访问 1 000 000 个节点（`budget`，落在会超出上限的 `items` 或 `entries` 列表字段上）。json-text 树内的读取异常以该树的字段名报 `unreadable`。成功值是冻结的副本。省略的可选字段在副本中仍然省略。

`judgeToolDefinition` 检查与 schema 词汇无关的参数说明规则：每条说明有路径和非空白文本，同一路径只说明一次。哪些参数由 schema 声明取决于词汇，本成员没有词汇解释器，所以判定不从 schema 推导参数清单。`defaults` 是否满足设置 schema 也不在本函数检查。

声明 `ToolDeclarations` 的 `inputModalities` 与 `outputModalities` 是 `@omne-harness/modality` 的 `Modality` 数组，只接受[该成员词表](../../../common/modality/SPEC.md#四种模态)的四种模态，省略时投影为文本。`judgeToolDefinition` 用该成员的 `judgeModalities` 判定这两项：不是列表或元素不是文本为 `type`，不在词表内为 `modality`，重复为 `duplicate`，`field` 指向出错的元素，例如 `declarations.inputModalities[1]`。不在词表内的写法（例如 `audio`、`Image`）被拒绝，不映射。附件的 `mediaTypes` 仍只判非空且不重复。

解码函数接收 `unknown`，返回 `Outcome`，不抛异常。合法身份文本是 1 至 256（常量 `TOOL_IDENTITY_MAX_LENGTH`）个可打印 ASCII 字符，不含空格。失败值的 `field` 是所求身份类型，`reason` 是 `type`、`empty`、`length` 或 `character`。解码成功只给出品牌身份，不证明该调用存在，也不授予使用资格。需要保存生产方引用的消费方用 `decodeToolCallId` 解码调用文本。

## 返回与执行事实

[行为与约束](../SPEC.md#342-返回与执行事实)。

- [results.ts](../src/results.ts)：结果、附件、效果、终局、中断原因 `InterruptionCause`、准入失败、`Reply`、等待与交付状态、`ToolState`、结果页和查询结果。
- [judge-state.ts](../src/judge-state.ts)：`judgeToolState`，按阶段与前后台关系封闭检查 `ToolState`，再检查类型表达不了的字段关系。
- [result-policy.ts](../src/result-policy.ts)：默认结果政策 `defaultResultPolicy`、规则集 `defaultResultPolicyRules` 与采用 `defaultResultPolicyAdoption`（G3）。
- [adoption.ts](../src/adoption.ts)：`describedAdoption(rules)` 按发布的规则集给出采用，`digest` 是 `sha256:` 加规则集 JSON 文本的 SHA-256。各实现与 Cordis 定义包用它给出同一摘要。
- [result-rendering.ts](../src/result-rendering.ts)：`renderToolResult`，按作者种类选择普通渲染或结构化判定。renderer 与程序编码的失败、抛出的异常和不是 `Outcome` 的返回值都成为失败 `Outcome`，异常消息保留为原因。文本工厂的返回值不是 `Outcome` 时也是失败。
- [result-projection.ts](../src/result-projection.ts)：`projectToolResult`，把结果投影为供消费方使用的消息块，不读取字节。

默认结果政策只接受文本块与共享引用块，拒绝 thinking、inline 媒体、inline 文件、嵌套容器和未知分支，规则归 [P14](../SPEC.md#p14-附件引用与消费方交付)。采用的 `digest` 是 `sha256:` 加规则集 JSON 文本的 SHA-256 十六进制值，读者可以重新计算。`judge` 拒绝时，`reason` 是规则集 `reject` 中的规则名。消息工具部件（`tool_call`、`tool_result`）和带 `blocks` 或 `content` 成员的值属于嵌套容器。被接受的种类形状不对时，`reason` 是 `invalid-` 加 content-block 的拒绝原因。`judgeResult` 也检查卸载原件的摘要块和附件引用。

## 普通操作与实例目录

[行为与约束](../SPEC.md#342-普通操作与实例目录)。

- [operations.ts](../src/operations.ts)：控制意图（`stop`、带必填 `reach` 的 `withdraw`、`background`）与回执、前台返回及后台占位的来源 `BackgroundSource`、过程块、观察、实例句柄、实例目录、交付证据与 `ToolRuntime`。

## 作者执行上下文

本节是作者唯一的过程输出和内部等待接口。异步 `emit` 返回接管回执；同步等待指作者使用 `await wait` 暂停本次工具的后续步骤。两者都不阻塞宿主线程。完整语义归 [P11](../SPEC.md#p11-作者输出与等待原语)，使用示例归 [flows](flows.md#作者调用-emit-和-wait)。

- [wait-contract.ts](../src/wait-contract.ts)：`defineToolWaitContract`。它检查封闭形状，并要求 Ask 协议的 `expiry` 是 `forbidden`。它不调用 `ref.load`。
- [author-context.ts](../src/author-context.ts)：过程更新、emit 回执、原语失败、等待契约、决定与资源回应、`ToolExecutionContext`、`ToolExecutionScope`、等待 schema 快照与响应校验器，以及独立作用域的输入 `IndependentToolScopeInput` 和本地接收者 `ToolProcessReceiver`（G2）。

`contract` 携带作者定义的请求和响应 schema；defineToolWaitContract 固定声明，不授予使用资格。执行绑定只装载其允许的契约。请求是严格 JSON 树，响应 A 从所传契约的 SchemaRef 取得，并在运行时验证后产生；不能靠手填泛型绕过校验。底层持久 DecisionValue 仍为 JSON，作者得到 ToolDecision<A>。取消属于失败分支，不属于决定或资源回应。完整输入、提交失败和响应生效次序归 [P12](../SPEC.md#p12-等待-schema-与响应提交)。

此 validator 是决策方或资源接收者在提交有效回应前消费的门槛。valid 只证明一次校验及适用条件，不证明回应已生效。校验器使用原等待保存的 schema 快照、业务规则和资格；source 必须由受信接收者产生。提交者不能指定替代 schema。响应接收与提交接口仍归决策方或资源拥有者，Tool 不新增另一张决定表或 HTTP endpoint。

`ToolProcessEmitter` 和 `ToolWaiter` 是给辅助函数的窄依赖。它们不增加 Cordis 服务键。托管上下文由原执行绑定构造，作者不能填写 tenant、call、start、事实游标或保管证据。独立消费者显式提供作用域，`local` 回执不承诺耐久；托管执行只允许 `retained` 回执。执行包装器持有 ToolExecutionScope，作者只拿 context；finish 负责关闭受理并汇合既存输出，不是作者可调用的停止工具。

`IndependentToolScopeInput` 给出正安全整数的 `limits`、本次执行的停止 `signal`、本地接收者 `process` 和回应者 `waits`。作用域把等待历史放在内存中，并受 `limits` 限制。`process` 为 null 时 `emit` 返回 `unsupported`。`waits` 为 null 时 `wait` 返回 `unsupported`。作用域先按 P11 处理顺序、等待键、取消与返回屏障，再调用 `waits`。

## 独立函数与依赖

[行为与约束](../SPEC.md#342-独立函数与依赖)。

- [execution.ts](../src/execution.ts)：文本渲染器、执行者、结果政策接口、执行引用、写入上下文、恢复输入与 `ToolCommands`。

## 发起、队列与环境协议

[行为与约束](../SPEC.md#342-发起队列与环境协议)。

## 等待、计时与接续

[行为与约束](../SPEC.md#342-等待计时与接续)。

## 结果、过程与后继责任

[行为与约束](../SPEC.md#342-结果过程与后继责任)。

<a id="当前增量与验证边界"></a>

## 运行契约的验证边界

[行为与约束](../SPEC.md#342-当前增量与验证边界)。

- [ports.ts](../src/ports.ts)：Tool 声明、由外部提供者实现的端口（决定桥、执行者绑定、环境、宿主、时钟），执行事实与启动记录，以及 Tool 实现交给宿主的 `ToolDriver` 与 `ToolProvider`。runtime 工厂的构造依赖 `ToolDependencies` 与配置 `ToolConfiguration` 不在本包，它们属于实现包，见 tool 的 public-api（`tool/docs/public-api.md`）（[本增量未交付](../../README.md#未交付标注)）。`ToolClock.begin` 只产生标记。没有提交的计时段没有任何效果，也不需要关闭。已用时间只累计已提交的计时段。

## 定义、作者适配与独立消费

下列声明补齐可独立消费的定义、参数和结果适配。不要求 Cordis 或任何外部工作对象。托管路径还必须走前述准入。具体操作协议归 [protocols](../SPEC.md#tool-操作协议)，输入与依赖归 [object-model](object-model.md)。

ToolAuthor 表示一个操作，不表示所有命令的返回联合。defineToolOperation 在本地封装该操作的 A/R 关系；defineFunctionTool 与 defineCommandTool 使用相同的操作句柄，生成唯一 ToolDefinition 投影。句柄不公开 executor，不能作为脚本调用通路。构造成功不表示 schema 已异步装载或工具已可用。精确绑定、命令选择及恢复规则见 [多命令协议](../SPEC.md#多命令作者注册与返回选择)，作者组合示例见 [flows](flows.md#多命令函数与独立返回)。

- [authoring.ts](../src/authoring.ts)：声明与设置、消费方档案 `ToolConsumerProfile`、检查输入、用法、呈现、`ToolCatalog`、参数与输出 codec、返回校验器、程序输出、`ToolAuthor`、操作句柄、作者注册、装载器、绑定登记表、文本结果工厂与可用性事实。
- [registration.ts](../src/registration.ts)：`defineToolOperation`、`defineFunctionTool` 与 `defineCommandTool`。构造时拒绝空命令表、非法名称、返回模式与作者种类不符，以及程序契约与声明不符。句柄与注册是当前执行域的能力，不交给脚本。
- [binding.ts](../src/binding.ts)：子路径入口 `@omne-harness/tool-contract/binding`，只供受信的执行绑定提供者（G7）导入。`readToolOperation` 与 `readToolRegistration` 读取句柄内的作者与注册内的操作表（`ToolOperationSlot`、`ToolRegistrationSlot`）；不是 registration.ts 构造的值读作 `undefined`。根入口不导出它们，所以只持有句柄或注册的代码取不到 executor。`readOwnSlot(value, key)` 按自有属性读取不可信的值，答 `OwnSlot`：属性不存在（`absent`）、是访问器（`accessor`）或带值（`value`）；各实现用它以同一方式读取外来值，不触发 getter。这个入口与根入口一样不依赖 Cordis。
- [judge-release.ts](../src/judge-release.ts)：`judgeConsumerRef` 与 `judgeHandoff`，即 releaseDelivery（P08）的消费位置与交接证据的封闭检查。多出的字段是 `unknown-field`，非文本值是 `type`，返回冻结副本。它们不核证据归属，提供者再比对证据的 `owner` 与消费者。
- [catalog.ts](../src/catalog.ts)：`presentTool` 与 `evaluateToolAvailability`。可用性判定不自做授权，按顺序列出全部未满足的条件。
- [parameter-codec.ts](../src/parameter-codec.ts)：`createDefaultParameterCodec(limits)`，用 `@omne-harness/json-text` 严格解析生效参数。`complete=false` 返回 `incomplete`，重复键、半截 JSON 与不是对象的输入返回 `invalid`，都不产生参数值。采用摘要覆盖解析预算。`judgeToolArguments(input, limits)` 是受理时的判定：原参数与生效参数都完整解析（`ParsedToolArguments`），`complete=false` 返回 `incomplete`，任一文本失败返回 `invalid` 并指明 `original` 或 `effective`，输入或预算形状不对返回 `shape`（`ToolArgumentsRejection`）。它不替代作者 codec 在执行时的解析。

## 持久状态与协议记录

这些值是提供者协议，不开放给脚本。值引用均须查验其拥有者记录。时间、序号和字节计数使用规范非负十进制字符串，解析边界禁止符号、前导零、非整数和溢出投影。

- [records.ts](../src/records.ts)：物理执行、队列位置、计时、协议身份、准备与释放、启动进度与围栏、等待意图与记录、外部回应、控制、检查点、事实批次、程序调度、待办任务与排空状态。

## 输出保管、持久读取与账目

- [custody.ts](../src/custody.ts)：原输出、输出保管、过程快照、诊断页、内容页、内容读取、`ToolReads`、账目范围与查询、单结果卸载。

## 端口一致性套件（`./testing`）

子路径入口 `@omne-harness/tool-contract/testing`（G6）给外部提供者一组一致性套件，每个由提供者实现的端口一个。入口依赖 `node:assert` 和 `node:crypto`，不依赖测试框架，也不依赖 `@omne-harness/tool`（[本增量未交付](../../README.md#未交付标注)）、`tool-host-local`（[本增量未交付](../../README.md#未交付标注)） 或 Cordis。根入口不导出它们。

| 端口 | 套件函数与夹具 | 条款 | 守约的非耐久替身 |
| --- | --- | --- | --- |
| `ToolEnvironment` | `toolEnvironmentConformance`，`ToolEnvironmentFixture` | [P03](../SPEC.md#p03-环境准备和释放) | `createMemoryToolEnvironment` |
| `ToolStartAuthority` | `toolStartAuthorityConformance`，`ToolStartAuthorityFixture` | [P04](../SPEC.md#p04-实际发起围栏) | `createMemoryToolStartAuthority` |
| `ToolExecutorBinding`（`live-only`） | `toolExecutorBindingConformance`，`ToolExecutorBindingFixture` | [P05](../SPEC.md#p05-执行事实与原输出)、[P07](../SPEC.md#p07-计时控制与检查点) | `createMemoryToolExecutorBinding` |
| `ToolOutputCustody` | `toolOutputCustodyConformance`，`ToolOutputCustodyFixture` | [P05](../SPEC.md#p05-执行事实与原输出) | `createMemoryToolOutputCustody` |
| `ToolClock` | `toolClockConformance`，`ToolClockFixture` | [P07](../SPEC.md#p07-计时控制与检查点) | `createMemoryToolClock` |
| `ToolDecisionBridge` | `toolDecisionBridgeConformance`，`ToolDecisionBridgeFixture` | [P06](../SPEC.md#p06-内部等待与答复)、[P12](../SPEC.md#p12-等待-schema-与响应提交) | `createMemoryToolDecisionBridge` |
| `ToolResourceResponses` | `toolResourceResponsesConformance`，`ToolResourceResponsesFixture` | P06、P12 | `createMemoryToolResourceResponses` |

- 用例的形状是共用类型 `ConformanceCase<F>`：`name`、`clause`（SPEC 条款锚点，如 `P04`）和 `run(fixture)`。套件函数返回只读用例数组。用例以 `node:assert/strict` 的 `AssertionError` 表示失败。
- 夹具由消费方的工厂在每条用例前新建一次。必需成员是被测端口和它接受的 `access`（主体与租户）。`otherAccess` 是第二个租户的 access，带它自己的主体；它与 `access` 必须是不同的租户，否则跨租户用例失败并说明原因。可选成员是提供者的控制手柄，用契约词汇命名，例如 `launches`、`emit`、`finish`、`hold`、`settle`、`readBytes`、`advance`、`decide`、`respond`。每个手柄的含义写在夹具接口的注释里。执行者绑定套件读取分片事实的等待期限是夹具成员 `readDeadlineMs`，缺省 1000 毫秒；它“等一个不该出现的事实”的静默期是夹具成员 `quietMs`，缺省 25 毫秒；时钟套件的 `waitMs` 与 `quietMs`、登记套件的 `quietMs`（拒绝后观察目录有无迟到写入，登记套件唯一的定时等待）同理。资源应答套件的 `deadline` 是带期限的等待所携带的时刻，用提供者自己的格式，缺省是一个遥远的未来时刻。这些期限是策略，由提供者按自己的速度配置，不写死在套件里。
- 用例需要的手柄缺失时抛出 `NotApplicable`，它指明手柄名。`runConformanceCase(case, fixture)` 把它报告为 `{ kind: 'not-applicable', handle }`，通过时答 `{ kind: 'passed' }`（类型 `CaseVerdict`），其余错误原样抛出；抛出的错误不带用例名，消费方自己附上 `case.name`。不适用不是通过：消费方必须单列计数，并列出缺失的手柄。
- 回答模型。每个端口有一张表，导出名是 `environmentAnswers`、`startAuthorityAnswers`、`executorBindingAnswers`、`outputCustodyAnswers`、`clockAnswers`、`decisionBridgeAnswers`、`resourceResponsesAnswers`，登记套件的是 `registrationAnswers`（在 `tool-cordis-contract/testing`）。表的形状是 `{ 方法 → { clause, progress, lostReply } }`：`progress` 列出表示“工作还没做完”的答复种类（`pending`、`unknown`、`accepted`），`lostReply` 列出表示“回包丢失、须再问原操作”的失败种类（`commit-unknown`），每行引用决定它的条款。其余答复都是终局：成功、拒绝和 `conflict` 答一次，之后逐字节认回。时钟与登记的表没有进度行：它们的调用即时作答，或只答一次。表由条款推出，不由替身的行为推出。
- 三个原语读取答复，参数都是一个对象。`finalAnswer({ ask, row, completion, view, what })` 取操作的终局：问一次，答复是进度或丢失回复时，先在进度期间再问一次（重送或读取，答复按 `resendRecalls` 判），再调用夹具的完成手柄，最后问一次，要求这次是终局，并且与进度期间已经答出的终局相同；夹具没有该手柄就报告不适用，不再多问。这两次比较都比 `view(earlier)` 与 `view(later)`。`view` 可选，缺省是答复本身；它必须保留答复的 kind。原语返回的仍是最后一次的答复本身，不是视图。环境套件对 `prepare` 与 `inspectPreparation` 传的视图去掉 `prepared` 里的重连能力，只比证据与 preparation，因为 P03 允许每次答出新的重连能力。完成手柄是一个值 `Completion`（`{ name, call }`），由 `completionOf(fixture, name, ...args)` 按夹具成员名取得：名字就是读取成员的键，所以不适用报告的手柄名正是夹具缺的那个成员。回答表里没有进度类也没有丢失回复的方法不传手柄；对这样的读取答出进度类是断言失败。`resendRecalls(row, { earlier, later }, what)` 核对同一操作的后续读取（重送、检查、落地后的答复）：进度单调向前（`pending` 到 `accepted` 到终局），不退回，不为同一进度换一份证据；终局逐字节认回。`crossTenantAnswers({ ask, row, completion, identifying, submitted, what })` 读外租户得到什么：外租户对本租户的记录与对从未存在的记录各问一次，两个答复须同类（成功或同一种失败，kind 也相同），对真实记录的答复不得带出 `identifying` 中的识别值，`submitted` 是外租户自己提交的值（判据见下面跨租户的一条）；任一答复属于该方法回答表的进度类（含丢失回复）时，调用夹具的完成手柄，再各问一次，再查一次，没有手柄就报告不适用。原语把答复当作不可信的值读：`isProgress` 对 `null`、`{ failure: null }` 这类不是答复的值返回 `false`，不抛异常。手柄之后的答复不要求是终局：在 `inspectOperation` 与输出保管的 `inspect` 上，`unknown` 既是进度，也是对从未见过的操作的永久答复。套件不轮询：每条用例只问有限次，不重试，不睡眠。
- 手柄完成契约。凡驱动延迟工作的手柄（`settle`、`completeStop`、`excludeDeferred`、`reachDeadline`、`endFiber`、`finish`、`loseContinuity`）只在延迟工作已经落地、且对端口的每次读取都可见之后才 resolve；套件在手柄之后再问一次。`emit` 把事实交给事实流，事实流的读取等到夹具的 `readDeadlineMs`，所以迟到的 `emit` 在期限内不会被判为违约。时钟的 `advance`、`setBack`、`changeEpoch` 是时间控制，不驱动稍后落地的工作：它们只在时间源已变、之后每次读取都看到它之后才 resolve，所以时钟没有“手柄先于落地”的用例。真正异步的通道不属于这条：事实流用 `readDeadlineMs`，时钟的 `waitUntil` 用 `waitMs`，静默期用 `quietMs`，期限都由夹具给出。在手柄落地之前就 resolve 的夹具违反这一契约，套件会让读取落地状态的用例失败。
- 不适用不是通过。首答是进度（或丢失回复）而夹具没有对应手柄时，用例报告不适用，手柄名写明，不判失败，也不空转：总回 `unknown` 的启动围栏、总回 `commit-unknown` 的输出保管在这些用例上得到不适用。有手柄时，用例推进到终局并照常断言。事实流的批次按事实计数，不按批次计数：一个批次可以带几个事实，用例只要求事实、批次身份与游标各自成立。
- 停止的重送（P07，与 P01“未确认的提交只返回 commit-unknown，随后查询原 operation”、共同不变量的停止行）。首答 `pending` 之后，重送可以报告当前进度，但进度单调：`accepted` 之后不得回到 `pending` 或 `unknown`，也不得换一份 `accepted` 的证据；一旦答过终局（`stopped`、`already-ended`、`relation-changed`、`rejected`），之后的答复逐字节相同。若契约拥有者取更严的读法（重送一律回原 `accepted`），只须在 `resendRecalls` 加一条。采用哪种读法待契约拥有者裁定。
- 入参带 `access` 的端口套件有跨租户用例：用第二个租户的 access 读或改第一个租户的记录，既不读到也不改动，也得不到记录存在与否的任何信息。判据是四条：外租户对“存在于他租户的记录”的答复，与对“从未存在的记录”的答复同类（成功或同一种失败，答复的 kind 也相同），首答是进度时在完成手柄之后仍然同类；外租户对真实记录的答复不得带出该记录的识别值，首答与完成手柄之后的答复都查（前两条经 `crossTenantAnswers`）；第一个租户的记录之后原样可读；外租户的写入没有落到第一个租户的记录上。第二条按下面五步检查：
  1. 两组值，都由用例给出。`identifying` 是本租户记录的识别值，可以是文本，也可以是结构值：记录名、证据摘要、本租户的操作号、本租户的组织文本与账户文本，以及本租户的 `TenantId` 对象本身。`submitted` 是外租户自己提交的值：它的 access（含它自己 `TenantId` 的组织文本与账户文本）、它用的操作号，以及它送来的 resource、permit、registration 等。提交值里任何一层的文本都算提交的文本。
  2. 遍历范围。检查遍历对真实记录的答复的每一层：值和键（键按 `Reflect.ownKeys` 取，symbol 键按它的描述读）、`Map` 的键和值、`Set` 的元素、`Error` 的 `name`、`message` 与 `cause`、数组元素。数组下标是位置，不按文本读。同一个对象只读一次，所以有环的答复也会读完。
  3. 先去掉提交值。字符串里提交的文本的每次出现都是回显。识别文本的一次出现若整个落在一次回显之内，就不算泄露。这相当于先把提交的文本替换成占位符（长的先替换）再查，只有一点不同：一个识别值只有一部分落在回显里时，仍按原文查到。所以外租户回显自己的操作号或身份（例如 `ensure-1`、`org_conformance_other`），不会因为其中含有本租户较短的识别值（`1`、`org_conformance`）而被误判；外租户提交了 `conformance`，答复里的 `acc_conformance` 仍是泄露。外租户自己提交过的结构识别值不查。
  4. 等值检查。任何字符串（值或键）与某个识别文本完全相等，或任何对象与某个结构识别值深相等，都判泄露。
  5. 子串检查。长度不小于 8 的识别文本，出现在更长的字符串里也判泄露，写在诊断文本里的也算。短于 8 的识别文本只做等值检查：短值（例如以行号命名的记录 `1`）会偶然出现在提供者普通的文本里（版本号、计数、外租户的操作号、十六进制摘要），长值不会。

  这五步查不到拆成几段（例如一半在键里、一半在值里）或换了编码（例如 base64）的识别值，也查不到紧挨回显的短识别值（例如 `ensure-1:1`）。这些形式仍然违反契约，只是不在本判据的检查范围内。

  缺 `otherAccess` 时这些用例报告不适用（手柄名 `otherAccess`）。注意：对外租户 `invalidate` 一个不存在的 wait，提供者记下一条自己租户空间里的提前失效并答成功，是合法的，所以用例不强求拒绝，只比较两个答复同类且第一个租户的登记没有被失效。时钟的 `elapsed(evidence)` 没有 access 入参，租户隔离在这个端口上观察不到，没有跨租户用例。契约是否给它加 access 入参，待契约拥有者裁定。
- 每个替身声明 `durability: 'none'`，状态在内存里，不能装配进生产，也不证明耐久提供者符合契约。`memoryTool…Fixture()` 给出带全部手柄的夹具，`createMemoryTool…` 返回的替身类型是 `MemoryTool…`（环境替身另有 `MemoryEnvironment`）。执行者绑定套件另导出 `completedFinal()`，给出一个把启动收场为完成的终局事实，供夹具的 `emit` 使用。回答表的类型是 `AnswerModel` 与 `AnswerRow`，`crossTenantAnswers` 的返回类型是 `CrossTenantAnswers`。本入口没有 `./cordis`，替身不能被 Cordis 装配。
- 启动围栏套件的 permit 不必带守卫：P04 只要求 permit 含各拥有者的版本，没有守卫资源的提供方是合法的。需要守卫的用例（SA4、SA5、SA7、SA12、SA13、SA17）在 permit 没有守卫时报告不适用，手柄名是 `guard`。有守卫资源却不把它放进 permit 的提供者同样得到不适用，不被判为违约；套件不检查 P04 的“permit 含各拥有者版本”对这种提供者成立与否。
- 过期的 consume 可以答 `rejected`，也可以答 `not-started`（P04：不是永久拒绝时，同一启动可再问）。SA7 在答 `rejected` 时要求 inspect 原样认回；答 `not-started` 时要求 inspect 仍是 `rejected` 或 `not-started`，不变成启动。`consume` 与 `inspect` 的 `unknown` 是启动围栏表里的进度行，经 `finalAnswer` 驱动：夹具没有 `settle` 时，SA1 以外的全部用例报告不适用（它们都经 `consume` 或 `inspect` 读到 `unknown`），手柄名 `settle`。
- 执行者绑定替身核对 permit：permit 指向另一个调用、另一个启动或另一个租户，`start` 被拒绝（P04“绑定的 start/resume 封装这一过程”）。套件有三条对应用例（B4、B5、B6），夹具的 `permit` 手柄缺省时，套件取一份指向该启动的 permit 再改它的调用、启动或租户。停止回执（B17）按 P07“pending/unknown、accepted、stopped、already-ended、rejected 分别保留”读：已终局的回执被原样认回，accepted 之后 `inspectControl` 只能答 accepted 或 stopped，不退回 pending。这一读法依据“分别保留”一句，若契约拥有者认为 accepted 之后可以退回 pending，B17 须放宽。采用哪种读法待契约拥有者裁定。
- 时钟套件把 `elapsed` 的入参取为 `begin` 回的 `segment.marker`，并以 `ClockSegment` 之间互不影响、已测时间只前进、不可比较的 epoch 失败（端口上没有 unknown 值，所以 unknown 只能是一个失败）判定。`waitUntil` 没有 SPEC 句子，只按签名判定：到时回 `elapsed`，信号中止回 `cancelled`。这些读法与未判定的条款见 [coverage](../verification/coverage.md#端口一致性套件)。
- 决策桥与资源应答套件共有一组 P06 用例：`ensure` 按原 call 与 wait 认回同一登记，`inspect` 只读，`inspectOperation` 的 committed、excluded 与 pending，迟到的失效仍作用于原登记且幂等；同一操作号重用于另一种动作或另一个 wait 回 `conflict` 且没有效果（P01、P06“回执逐项绑定动作种类、原 wait、采用和输入摘要”）。对从未发出的操作答 `excluded` 是围栏：契约允许，只要之后该操作确实不会生效，所以用例接受“pending 或 unknown”或“excluded 且随后拒绝该操作、不登记它的 wait”。资源应答另查 `expire` 只在确实到期且无更早回应时成立、按登记时的期限与到期支持判断而不是按 expire 调用里的、`deadline: null` 不到期、契约不支持到期时回 `unsupported`，以及 Tool 不替资源拥有者造出超时答案；决策桥另查 `resolve` 交回原决定，包括 no-answer 与 declined。
- 套件只查单个端口对契约的承诺，不做跨端口组合。登记语义套件在 `@omne-harness/tool-cordis-contract/testing`，不在本入口，因为它的对象是 Cordis 目录服务。`answer`、`inspectAnswer` 和 checkpointed 执行者绑定不在套件内。
- 真实实现的对照只有一项已经运行：启动围栏套件在 `tool-host-local`（[本增量未交付](../../README.md#未交付标注)） 对本地协调器运行（含跨租户用例）。结果是 SA13 与 SA14 失败，其余用例通过。这两条用例把同一操作号复用于另一守卫（SA13，`invalidate`）或另一原因（SA14，`exclude`），本地协调器回原证据，没有回 `conflict`，偏离 [P01](../SPEC.md#p01-操作事实与资格)。待修正的是提供者，套件不改。时钟没有真实实现，宿主时钟实现后，在 `tool-host-local`（[本增量未交付](../../README.md#未交付标注)） 的测试里运行同一套件。登记语义套件等实例目录实现后，在真实 Cordis 下运行。环境、执行者绑定、输出保管、决策桥与资源应答也还没有真实实现。在这些端口有第二个实现之前，套件不能以“对一个实现通过”证明自己：回答表和生成的提供者替代第二个实现。每个套件的自证为表生成一个端口边界上的合法提供者：它遮住新操作每个方法的首答，依次用表中每种进度和丢失回复，并在夹具的完成手柄 resolve 时揭开；它不借替身的控制手柄，所以能在替身从不延迟的地方延迟，包括延迟一个拒绝。生成的提供者必须全过且不适用集为空；不给手柄时，需要手柄的用例恰好是不适用的那些，没有一条被判通过。每个套件另有 `legal` 表，列出契约允许的提供者类别：生成的“首答进度、之后各种终局”、真正延迟的提供者（先答进度或丢失回复，落地时才向替身要操作，自带 `hold` 与 `excludeDeferred`）、首答丢失回复、围栏式的 `excluded`、合并就绪事实的执行者、首答 `pending` 之后读当前进度的停止、先预检再终检的登记服务、不带守卫的 permit、只有一个租户的夹具（只有不适用）、核验自身租户的 authority。合法提供者只在端口边界构造，只覆盖端口方法与它自己定义的手柄。违约提供者留作回归行，各让列明的用例恰好失败；重送规则（进度单调、终局逐字节认回）的三类违约在每个有重送路径的方法上各有一个变体。
- 替身对每个改变状态的方法按身份认回，并比较动作种类与输入摘要（登记另加 authority 与资格）：同一身份而种类或输入不同，答 `conflict` 且没有效果。每个端口对每个改变状态的方法有一条用例证明这一点，违约变体（操作账只按身份认）恰好让这些用例失败。启动围栏的 `prepare` 与 `consume` 以 start 与 permit 为身份，不带操作号，执行者绑定的 `acknowledge` 以回执为身份，时钟的 `begin` 每次发新标记，这三类不适用本条。

提供者在自己的测试框架里逐条注册用例。例如在 vitest 中：

```ts
import { it } from 'vitest'
import { runConformanceCase, toolStartAuthorityConformance } from '@omne-harness/tool-contract/testing'

for (const conformance of toolStartAuthorityConformance<MyPrincipal>()) {
  it(`${conformance.clause} ${conformance.name}`, async context => {
    const verdict = await runConformanceCase(conformance, await makeFixture())
    if (verdict.kind === 'not-applicable') context.skip(`missing ${verdict.handle}`)
  })
}
```

用例与违约变体的对应见 [tests/README](../tests/README.md#一致性套件的自证)，用例与场景的对应见 [coverage](../verification/coverage.md#端口一致性套件)。源码在 [testing.ts](../src/testing.ts) 及其 `testing-*.ts` 模块。

## 程序编排接缝

[程序执行方组合协议](../SPEC.md#code-与-tool-的组合协议)规定调用位置、控制范围、计时及结果承接。程序只能取得 `ProgramTools` 的受控代理；其他接口仅交受信宿主。语言、引擎和它们的跨进程编码由程序执行提供者固定采用，本包不开放任意宿主对象。

- [program.ts](../src/program.ts)：子调用位置与预留、子调用状态、程序结束与收束、`ToolChildren`、程序结果与 `ProgramTools`。

ProgramTools.call 交回唯一 ToolResult 封装，其 data 为程序值，content 为展示内容。宿主只在 [P13](../SPEC.md#p13-双返回形态与程序输出契约) 的验证及可靠交接后交给脚本。动态名称调用没有凭空推断出的 T；具体语言 SDK 根据固定的返回声明生成或绑定访问器，仍须核验真实结果。无程序 schema 的工具可显式声明 program=none，程序只得到受验证的 ToolResult，不获得假定存在的业务字段。
