# Tool 公开入口与设计定义

根入口 `@omne-harness/tool` 导出全部公开契约类型、品牌身份的解码函数、默认结果政策、资产正文端口 `toolBodyContract` 和契约函数。契约函数不做 I/O，不读时钟，不产生随机值，不调度并发，也不持有状态。根入口不导入 Cordis，也不导入提供者成员。

公开类型的唯一定义在 [src/index.ts](../src/index.ts) 及其导出模块。本页是源码导航，不保留手写类型声明。本页只保留尚未实现的函数签名，见[尚未实现的函数](#尚未实现的函数m2m3-实现后移除)。函数实现后，签名移入源码，本页删除对应条目。

服务定义、18 个服务键和 `tool/call-changed` 事件增补由 `@omne-harness/tool/cordis` 导出，源码是 [src/cordis.ts](../src/cordis.ts)，装配规则归 [cordis](cordis.md)。行为、调用资格、参数与依赖分类归 [SPEC 的运行契约](../SPEC.md#342-主干运行契约候选)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model.md)。

## 值、定义和固定请求

[行为与约束](../SPEC.md#342-值定义和固定请求)。

- [identity.ts](../src/identity.ts)：品牌身份、采用与耐久证据引用、访问输入，以及每个品牌身份的解码函数。
- [definitions.ts](../src/definitions.ts)：参数契约、返回声明、工具定义、可用性、调用参数、资源 scope 与固定请求。
- [judge-definition.ts](../src/judge-definition.ts)：`judgeToolDefinition`，按 P02、P13 和 P15 对未知输入做封闭字段与类型检查。

契约函数的失败值用 `field` 给出被拒绝的字段路径，例如 `commands[1].name`。根值本身被拒绝时，`field` 是所求类型名，例如 `ToolDefinition`。`reason` 是 `missing`、`type`、`empty`、`blank`、`duplicate`、`unknown-field`、`accessor` 等具名原因。判定只读取自身数据属性，不调用 getter 或输入中的函数。成功值是冻结的副本。省略的可选字段在副本中仍然省略。

`judgeToolDefinition` 检查与 schema 词汇无关的参数说明规则：每条说明有路径和非空白文本，同一路径只说明一次。哪些参数由 schema 声明取决于词汇，本成员没有词汇解释器，所以判定不从 schema 推导参数清单。`defaults` 是否满足设置 schema 也不在本函数检查。

解码函数接收 `unknown`，返回 `Outcome`，不抛异常。合法身份文本是 1 至 256 个可打印 ASCII 字符，不含空格。失败值的 `field` 是所求身份类型，`reason` 是 `type`、`empty`、`length` 或 `character`。解码成功只给出品牌身份，不证明该调用存在，也不授予使用资格。Session 用 `decodeToolCallId` 解码 `ProducerRef.call`。

## 返回与执行事实

[行为与约束](../SPEC.md#342-返回与执行事实)。

- [results.ts](../src/results.ts)：结果、附件、效果、终局、准入失败、`Reply`、等待与交付状态、`ToolState`、结果页和查询结果。
- [judge-state.ts](../src/judge-state.ts)：`judgeToolState`，按阶段与前后台关系封闭检查 `ToolState`，再检查类型表达不了的字段关系。
- [result-policy.ts](../src/result-policy.ts)：默认结果政策 `defaultResultPolicy`、规则集 `defaultResultPolicyRules` 与采用 `defaultResultPolicyAdoption`（G3）。
- [result-rendering.ts](../src/result-rendering.ts)：`renderToolResult`，按作者种类选择普通渲染或结构化判定。
- [result-projection.ts](../src/result-projection.ts)：`projectToolResult`，把结果投影为模型消息块，不读取字节。

默认结果政策只接受文本块与共享引用块，拒绝 thinking、inline 媒体、inline 文件、嵌套容器和未知分支，规则归 [P14](../SPEC.md#p14-附件引用与模型交付)。采用的 `digest` 是 `sha256:` 加规则集 JSON 文本的 SHA-256 十六进制值，读者可以重新计算。`judge` 拒绝时，`reason` 是规则集 `reject` 中的规则名。消息工具部件（`tool_call`、`tool_result`）和带 `blocks` 或 `content` 成员的值属于嵌套容器。被接受的种类形状不对时，`reason` 是 `invalid-` 加 content-block 的拒绝原因。`judgeResult` 也检查卸载原件的摘要块和附件引用。

## 普通操作与实例目录

[行为与约束](../SPEC.md#342-普通操作与实例目录)。

- [operations.ts](../src/operations.ts)：控制意图与回执、前台返回、过程块、观察、实例句柄、实例目录、交付证据与 `ToolRuntime`。

## 作者执行上下文

本节是作者唯一的过程输出和内部等待接口。异步 `emit` 返回接管回执；同步等待指作者使用 `await wait` 暂停本次工具的后续步骤。两者都不阻塞宿主线程。完整语义归 [P11](../SPEC.md#p11-作者输出与等待原语)，使用示例归 [flows](flows.md#作者调用-emit-和-wait)。

- [wait-contract.ts](../src/wait-contract.ts)：`defineToolWaitContract`。它检查封闭形状，并要求 Ask 协议的 `expiry` 是 `forbidden`。它不调用 `ref.load`。
- [author-context.ts](../src/author-context.ts)：过程更新、emit 回执、原语失败、等待契约、决定与资源回应、`ToolExecutionContext`、`ToolExecutionScope`、等待 schema 快照与响应校验器，以及独立作用域的输入 `IndependentToolScopeInput` 和本地接收者 `ToolProcessReceiver`（G2）。

`contract` 携带作者定义的请求和响应 schema；defineToolWaitContract 固定声明，不授予使用资格。执行绑定只装载其允许的契约。请求是严格 JSON 树，响应 A 从所传契约的 SchemaRef 取得，并在运行时验证后产生；不能靠手填泛型绕过校验。底层持久 DecisionValue 仍为 JSON，作者得到 ToolDecision<A>。取消属于失败分支，不属于决定或资源回应。完整输入、提交失败和响应生效次序归 [P12](../SPEC.md#p12-等待-schema-与响应提交)。

此 validator 是 HITL 或资源接收者在提交有效回应前消费的门槛。valid 只证明一次校验及适用条件，不证明回应已生效。校验器使用原等待保存的 schema 快照、业务规则和资格；source 必须由受信接收者产生。提交者不能指定替代 schema。响应接收与提交接口仍归 HITL 或资源拥有者，Tool 不新增另一张决定表或 HTTP endpoint。

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

- [ports.ts](../src/ports.ts)：其他领域为 Tool 实现的端口（决定桥、执行者绑定、环境、宿主、时钟），执行事实与启动记录，以及 runtime 工厂的配置、依赖与 `ToolProvider`。

## 定义、作者适配与独立消费

下列声明补齐可独立消费的定义、参数和结果适配。不要求 Cordis 或 Session。托管路径还必须走前述准入。具体操作协议归 [protocols](../SPEC.md#tool-操作协议)，输入与依赖归 [object-model](object-model.md)。

ToolAuthor 表示一个操作，不表示所有命令的返回联合。defineToolOperation 在本地封装该操作的 A/R 关系；defineFunctionTool 与 defineCommandTool 使用相同的操作句柄，生成唯一 ToolDefinition 投影。句柄不公开 executor，不能作为脚本调用通路。构造成功不表示 schema 已异步装载或工具已可用。精确绑定、命令选择及恢复规则见 [多命令协议](../SPEC.md#多命令作者注册与返回选择)，作者组合示例见 [flows](flows.md#多命令函数与独立返回)。

- [authoring.ts](../src/authoring.ts)：声明与设置、消费者 profile、检查输入、用法、呈现、`ToolCatalog`、参数与输出 codec、返回校验器、程序输出、`ToolAuthor`、操作句柄、作者注册、装载器、绑定登记表、文本结果工厂与可用性事实。
- [registration.ts](../src/registration.ts)：`defineToolOperation`、`defineFunctionTool` 与 `defineCommandTool`。构造时拒绝空命令表、非法名称、返回模式与作者种类不符，以及程序契约与声明不符。
- [catalog.ts](../src/catalog.ts)：`presentTool` 与 `evaluateToolAvailability`。可用性判定不自做授权，按顺序列出全部未满足的条件。
- [parameter-codec.ts](../src/parameter-codec.ts)：`createDefaultParameterCodec(limits)`，用 `@omne-harness/json-text` 严格解析生效参数。`complete=false` 返回 `incomplete`，重复键与半截 JSON 返回 `invalid`，都不产生参数值。采用摘要覆盖解析预算。

## 持久状态与协议记录

这些值是提供者协议，不开放给脚本。值引用均须查验其拥有者记录。时间、序号和字节计数使用规范非负十进制字符串，解析边界禁止符号、前导零、非整数和溢出投影。

- [records.ts](../src/records.ts)：物理执行、队列位置、计时、协议身份、准备与释放、启动进度与围栏、等待意图与记录、外部回应、控制、检查点、事实批次、程序调度、待办任务与排空状态。

## 输出保管、持久读取与账目

- [custody.ts](../src/custody.ts)：原输出、输出保管、过程快照、诊断页、内容页、内容读取、`ToolReads`、账目范围与查询、单结果卸载。

## 程序编排接缝

[Code 组合协议](../SPEC.md#code-与-tool-的组合协议)规定调用位置、控制范围、计时及结果承接。程序只能取得 `ProgramTools` 的受控代理；其他接口仅交受信宿主。语言、引擎和它们的跨进程编码由 Code 提供者固定采用，本包不开放任意宿主对象。

- [program.ts](../src/program.ts)：子调用位置与预留、子调用状态、程序结束与收束、`ToolChildren`、程序结果与 `ProgramTools`。

ProgramTools.call 交回唯一 ToolResult 封装，其 data 为程序值，content 为展示内容。宿主只在 [P13](../SPEC.md#p13-双返回形态与程序输出契约) 的验证及可靠交接后交给脚本。动态名称调用没有凭空推断出的 T；具体语言 SDK 根据固定的返回声明生成或绑定访问器，仍须核验真实结果。无程序 schema 的工具可显式声明 program=none，程序只得到受验证的 ToolResult，不获得假定存在的业务字段。

## 尚未实现的函数（M2/M3 实现后移除）

下列签名已接受，尚未实现，根入口也不导出它们。类型均从 `@omne-harness/tool` 导入。按 G8，`createToolRuntime` 进入提供者成员 `@omne-harness/tool-host-local` 的根入口，`executeTool` 与 `createIndependentToolScope` 留在本成员根入口。G1 的账本工厂、G4 的宿主时钟、G5 的本地启动协调器和 G7 的绑定登记表也进入提供者成员根入口，它们的签名随该成员实现给出。其他已接受的函数已在源码实现，导航见上文各节。

```ts
declare function createIndependentToolScope(
  input: IndependentToolScopeInput,
): Outcome<ToolExecutionScope, Readonly<{ field: string; reason: string }>>
declare function executeTool<A, R, E>(
  argumentsValue: A, executor: ToolExecutor<A, R, E>, environment: E, scope: ToolExecutionScope,
): Promise<Outcome<R, Readonly<{ reason: string; effect: 'not-started' | 'unknown' }>>>
declare function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>, configuration: ToolConfiguration,
): ToolProvider<P, B>
```

`createIndependentToolScope` 的签名是 G2 写回的形状：`limits` 不是正安全整数时返回失败，不创建作用域。
