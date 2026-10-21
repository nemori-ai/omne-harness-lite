# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，不手写第二套签名。工具部件、角色规则与块身份的非类型行为，正文是本文件的「语义」「判定顺序」两节和 [README](../README.md) 的契约节。压缩变体的行为归 [SPEC.md](../SPEC.md)。

## 导出入口

`package.json` 的 `exports` 只有入口 `.`，`source` 指向 [src/index.ts](../src/index.ts)。调用者不需要资格：任何需要日志消息值的能力都按包名 `@omne-harness/message` 导入。运行时导出恰为 `LOG_MESSAGE_ROLES`、`parseMessageId`、`messageIdEquals`、`judgeMessage`、`judgePart`、`judgeCompaction`、`parseRecordEntryRef` 七个，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。其余导出都是类型。本包不铸造消息身份，也不铸造块身份。

## 定义索引

| 导出 | 种类 | 定义位置 |
| --- | --- | --- |
| `Message`、`MessageRoleMap`、`UserMessage`、`AssistantMessage`、`ToolMessage`、`ToolInternalMessage`、`SystemReminderMessage` | 类型 | [src/message.ts](../src/message.ts) |
| `MessageId`、`MessageIdParse`、`MessageIdParseError`、`LogMessageRole`、`MessageRejection`、`MessageJudgment` | 类型 | [src/message.ts](../src/message.ts) |
| `judgeMessage`、`parseMessageId`、`messageIdEquals` | 函数 | [src/message.ts](../src/message.ts) |
| `ToolCallPart`、`IncompleteToolCallPart`、`UnparsedToolCallPart`、`CallPart`、`ToolResultPart`、`ToolPart`、`MessagePart`、`MessageContentBlock` | 类型 | [src/parts.ts](../src/parts.ts) |
| `judgePart` | 函数 | [src/parts.ts](../src/parts.ts) |

每个角色的 `blocks` 类型只含该角色允许的部件，也都至少有一块，与 `judgeMessage` 的运行时规则一一对应。`CallPart` 是三种调用部件的联合，`MessageContentBlock` 是除 `thinking` 块以外的内容块。

| 角色 | `blocks` 允许的部件 |
| --- | --- |
| `user`、`tool_internal`、`system_reminder` | 只有不含 `thinking` 的内容块 |
| `assistant` | 全部内容块（含 `thinking`）和三种调用部件，没有标记 |
| `tool` | 第一块是标记 `tool_result`，其余是不含 `thinking` 的内容块 |
| `compaction` | 只有不含 `thinking` 的内容块，是摘要 |

失败不抛异常，是返回值：`{ rejected }`，部件上的失败另带 `blockIndex`。`judgePart` 的拒绝值是 `MessageRejection` 的子集，没有 `misplaced-part`、`duplicate-id`、`covers`、`retained`、`derivation`，这几个只有整条消息的判定才会给出。压缩变体的导出在下一节。块身份与标注（`id`、`visibility`，含 `visibility` 内的未知键）由 `@omne-harness/content-block` 的 `judgeBlockIdentity` 判定，`arguments` 由 `@omne-harness/json-text` 的 `judgeJsonValue` 判定，本包不复制这两套规则。

## 压缩变体

`compaction` 角色的消息另带 `covers`、`retained`、`derivation` 三个键。`judgeMessage` 按 [SPEC.md](../SPEC.md#judgemessage-对压缩变体的判定) 判这三个键，`judgeCompaction` 判相对历史的规则。下表每行是一个导出，签名以定义位置的源码为准，公开类型由 [tests/compaction-types.spec-d.ts](../tests/compaction-types.spec-d.ts) 锁定。

| 导出 | 种类 | 含义 | 定义位置 |
| --- | --- | --- | --- |
| `CompactionMessage` | 类型 | `role` 为 `compaction` 的消息，`blocks` 是摘要，另带三个键 | [src/message.ts](../src/message.ts) |
| `RecordEntryRef` | 类型 | 记录条目引用，带品牌的非空字符串，由历史持有者铸造，按字符串全等比较 | [src/compaction-shape.ts](../src/compaction-shape.ts) |
| `parseRecordEntryRef` | 函数 | 空串返回 `null`，其他字符串原样带品牌返回 | [src/compaction-shape.ts](../src/compaction-shape.ts) |
| `CompactedRange` | 类型 | 压缩覆盖范围 `{ from, to }` | [src/compaction-shape.ts](../src/compaction-shape.ts) |
| `CompactionDerivation` | 类型 | 派生证据 `{ owner, record, revision, digest }`，本包不解释 | [src/compaction-shape.ts](../src/compaction-shape.ts) |
| `CoveredEntry` | 类型 | 覆盖范围内的一个条目，不带消息的条目 `message` 为 `null` | [src/compaction.ts](../src/compaction.ts) |
| `CompactionContext` | 类型 | `judgeCompaction` 的 `context` 参数：`covered`、`after`、`open` | [src/compaction.ts](../src/compaction.ts) |
| `CompactionRejection` | 类型 | 历史规则的拒绝值 | [src/compaction.ts](../src/compaction.ts) |
| `CompactionJudgment` | 类型 | `judgeCompaction` 的结论：`{ ok }`，或 `{ rejected, ref }`，`ref` 可为 `null` | [src/compaction.ts](../src/compaction.ts) |
| `judgeCompaction` | 函数 | 先用 `judgeMessage` 判 `message`，再判范围、保留名单、调用与结果的配对、未结工作 | [src/compaction.ts](../src/compaction.ts) |

`MessageRejection` 含 `covers`、`retained`、`derivation` 三个值，由 `judgeMessage` 在判 `compaction` 角色的三个键时给出。`judgeMessage` 的成功值类型是 `Message`，可以用 `role` 收窄，例如 `message.role === 'compaction'` 得到 `CompactionMessage`。消费者也可以直接把输入交给 `judgeCompaction`，从其成功值取得 `CompactionMessage`。`judgeCompaction` 的拒绝值与 `MessageRejection` 分开，调用者能区分形状失败与历史规则失败。行为与判定顺序见 [SPEC.md](../SPEC.md)，用例见下面的[压缩用例表](#压缩用例表)。

## 推理续接状态（设计，尚未实现）

assistant 消息将可以带推理续接状态部件 `reasoning_state` 和可选的回放描述 `replay`。实现之前，形状、规则与判定顺序以 [SPEC.md 的推理续接状态](../SPEC.md#推理续接状态)为唯一定义，本节只列计划中的导出。实现时本节改为与上一节相同的定义索引，并补用例表。

| 计划导出 | 种类 | 含义 |
| --- | --- | --- |
| `ReasoningStatePart` | 类型 | 推理续接状态部件，只在 `assistant` 消息里 |
| `ReasoningReplay` | 类型 | 回放描述 `{ scope, format, at, tokens }` |
| `REASONING_STATE_PAYLOAD_MAX_LENGTH`、`REPLAY_TAG_MAX_LENGTH` | 常量 | 载荷与 `scope`、`format` 的长度上限 |

`MessageRejection` 将增加 `payload`、`pairs`、`replay` 三个值；`judgePart` 只会给出前两个。

## 语义

工具部件是带块身份与块标注的块，与内容块同形，每块的标注由生产者写入，各块各自成立。键是闭合的：每种部件有固定的自有键，多出任何一个键都判 `extra`，不保留其他自有键。理由是消息投影不得携带执行者、句柄或私有结果对象。

- `tool_call`：参数收齐并解码成值树的调用，可以执行。`arguments` 是值树，不是文本，保存的是 `judgeJsonValue` 返回的冻结副本，与调用者的输入不共享。
- `tool_call_incomplete`：参数没收齐的调用。`partial` 是原样累计文本，可为空，本包不解析。`visibility` 两位都必须为 false：它留在日志里备查，不给人看也不给模型看，派生请求剔除它。它不参与调用与结果的配对。由流的结算方在结算时构造。
- `tool_call_unparsed`：参数收齐，但累计文本不能解码成值树，或名字不合法的调用。`raw` 是原样累计文本。它登记调用身份，不执行，可以被同 `callId` 的工具消息回答，对 `visibility` 没有另外限制。`name` 不要求非空，也不要求是合法工具名。
- `tool_result`：关联标记，不嵌套内容，不带结果状态。正文是同一条消息里紧随其后的已封闭内容块。一条工具消息恰好承载一个调用的结果，按 `callId` 配对。

整条消息的规则：`tool` 角色的消息第一块必须是标记，其余块是通过内容块判定的、不含 `thinking` 的内容块，全消息恰有一个标记。标记只能出现在 `tool` 角色的消息里。三种调用部件和 `thinking` 块只能出现在 `assistant` 角色的消息里。部件不在角色允许的集合里，判 `misplaced-part`，`blockIndex` 指向第一个放错的块。块身份在整条消息内唯一，不同消息之间不比较。允许哪些内容种类放进工具消息的正文，归结果投影方的政策，本包只判结构。

本包没有结局字段，所以不判定半截调用出现的条件：完整结局的消息不含半截调用由流的结算方保证，派生请求剔除半截调用归请求组装方。调用与结果的配对完整性只由 `judgeCompaction` 在核对压缩记录时判定；`judgeMessage` 和 `judgePart` 不判定。

块身份的铸造方各自负责：在消息内唯一、重放或重试时不变。流的结算方铸造开块头的 `id`，半截与未解析的变体沿用该头的 `id`。结果投影方铸造标记的 `id`。占位追加方若追加 `tool` 角色消息，铸造标记与正文块的 `id`。本包只检查，不铸造。

## 判定顺序

`judgePart` 先看部件本身：有访问器、非枚举自有键或非普通原型的对象判 `json`，部件自身键上的 getter 不被调用；嵌套位置（`visibility`、`arguments`）由各自的判定读取。再按 `kind` 分派：不认识的字符串 `kind` 判 `unknown`，没有 `kind` 或 `kind` 不是字符串则交给内容块判定。对工具部件，先检查键是否闭合（多键判 `extra`，缺键报缺的字段名），然后依次判 `id`、`visibility`、`callId`，最后判该种类自己的字段（`name`、`arguments`、`partial`、`raw`；`tool_call_incomplete` 先判 `visibility` 两位为 false）。键不闭合的部件在第一步被拒，其中的深对象不会被遍历。只有 `arguments` 被递归遍历，且只经 `judgeJsonValue`，`judgeJsonValue` 的任一失败都报 `arguments`，不外泄结构路径。

`judgeMessage` 依次检查消息自己的字段、`compaction` 角色的三个键、逐个部件、角色规则、块身份唯一，返回第一个失败。

顶层消息对象的规则：输入必须是对象且不是数组，否则判 `shape`，顶层不检查原型。「多余键」只看自有的可枚举字符串键，所以 symbol 键和不可枚举键不触发 `extra`。「缺键」按 `in` 判定，继承来的键也算存在。对所有角色，顶层字段的访问器会被调用，每个合法键至多一次：`role` 先读，其余键在通过这两项后读，之后的判定和成功值都用读到的那个值。这与部件不同：部件自身的键不调用 getter。`covers`、`derivation` 与 `retained` 的元素不调用 getter，且 `covers`、`derivation` 比部件更严，会拒绝 symbol 键。

## 验证义务

[tests/tool-parts.spec.ts](../tests/tool-parts.spec.ts) 逐个失败值锁定四种部件的规则、`arguments` 的副本与同 json-text 的组合。[tests/tool-roles.spec.ts](../tests/tool-roles.spec.ts) 锁定角色规则与块身份唯一。[tests/tool-part-types.spec-d.ts](../tests/tool-part-types.spec-d.ts) 锁定工具部件的公开类型，[tests/message-types.spec-d.ts](../tests/message-types.spec-d.ts) 锁定按 `role` 判别的联合：`MessageRoleMap` 的键与日志角色一致，六个角色类型，按 `role` 穷举。[tests/compaction-types.spec-d.ts](../tests/compaction-types.spec-d.ts) 锁定压缩变体的公开类型，包括缺键的 `compaction` 值和带 `covers` 的 `user` 值赋不给 `Message`。[tests/compaction.spec.ts](../tests/compaction.spec.ts) 锁定 `parseRecordEntryRef`，顶层字段只读一次，消息的形状边界，三个键的边界输入（符号键、非普通原型、非枚举键、访问器、`retained` 数组上的多余自有键、稀疏数组），成功值不与输入共享，以及配对的就近、顺序和模型可读判定。[tests/normative.spec.ts](../tests/normative.spec.ts) 逐行执行下面的示例表与压缩用例表，并规定两张表必须展示哪些规则的正反两面。本包不验证结果投影方的输出，也不验证流的结算方交出的部件。

## 示例表

每行是一条规则的一个示例：`规则` 是规则名，`极性` 中「正」是允许的例子，「反」是被拒的例子，`角色` 与 `块` 是 `judgeMessage` 的输入（消息身份固定；角色为 `compaction` 时，测试再补上一组固定的合法 `covers`、`retained`、`derivation`，使这一行只示范块上的规则），`结论` 是 `ok`，或 `rejected:<拒绝值>@<blockIndex>`。表同时是文档和测试：删掉一行或改变一个结论，`tests/normative.spec.ts` 变红。

| 规则 | 极性 | 角色 | 块 | 结论 |
| --- | --- | --- | --- | --- |
| `call.keys` | 正 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `ok` |
| `call.keys` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"},"payload":1}]` | `rejected:extra@0` |
| `call.keys` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","arguments":{"kind":"null"}}]` | `rejected:name@0` |
| `call.identity` | 正 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":false,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `ok` |
| `call.identity` | 反 | `assistant` | `[{"kind":"tool_call","id":"","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:id@0` |
| `call.identity` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true,"tenant":"a"},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:extra@0` |
| `call.callId` | 正 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"call-1","name":"echo","arguments":{"kind":"null"}}]` | `ok` |
| `call.callId` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"","name":"echo","arguments":{"kind":"null"}}]` | `rejected:callId@0` |
| `call.name` | 正 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"web.search","arguments":{"kind":"null"}}]` | `ok` |
| `call.name` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"","arguments":{"kind":"null"}}]` | `rejected:name@0` |
| `call.arguments` | 正 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"object","entries":[{"key":"q","value":{"kind":"string","value":"x"}}]}}]` | `ok` |
| `call.arguments` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":"{\"q\":\"x\"}"}]` | `rejected:arguments@0` |
| `call.arguments` | 反 | `assistant` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"number","lexeme":"01"}}]` | `rejected:arguments@0` |
| `incomplete.keys` | 正 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `ok` |
| `incomplete.keys` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{","payload":1}]` | `rejected:extra@0` |
| `incomplete.visibility` | 正 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `ok` |
| `incomplete.visibility` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":true,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `rejected:visibility@0` |
| `incomplete.visibility` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","partial":"{"}]` | `rejected:visibility@0` |
| `incomplete.callId` | 正 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"call-1","name":"echo","partial":"{"}]` | `ok` |
| `incomplete.callId` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":null,"name":"echo","partial":"{"}]` | `rejected:callId@0` |
| `incomplete.callId` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"","name":"echo","partial":"{"}]` | `rejected:callId@0` |
| `incomplete.name` | 正 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"","partial":"{"}]` | `ok` |
| `incomplete.name` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":null,"partial":"{"}]` | `rejected:name@0` |
| `incomplete.partial` | 正 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":""}]` | `ok` |
| `incomplete.partial` | 反 | `assistant` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":null}]` | `rejected:partial@0` |
| `unparsed.keys` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `ok` |
| `unparsed.keys` | 反 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{","payload":1}]` | `rejected:extra@0` |
| `unparsed.visibility` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","raw":"{"}]` | `ok` |
| `unparsed.visibility` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `ok` |
| `unparsed.callId` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"call-1","name":"echo","raw":"{"}]` | `ok` |
| `unparsed.callId` | 反 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"","name":"echo","raw":"{"}]` | `rejected:callId@0` |
| `unparsed.name` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"","raw":"{"}]` | `ok` |
| `unparsed.name` | 反 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":null,"raw":"{"}]` | `rejected:name@0` |
| `unparsed.raw` | 正 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":""}]` | `ok` |
| `unparsed.raw` | 反 | `assistant` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":1}]` | `rejected:raw@0` |
| `result.keys` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `ok` |
| `result.keys` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k","payload":"x"}]` | `rejected:extra@0` |
| `result.keys` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k","content":[]}]` | `rejected:extra@0` |
| `result.callId` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"call-1"}]` | `ok` |
| `result.callId` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":""}]` | `rejected:callId@0` |
| `role.tool-first` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `ok` |
| `role.tool-first` | 反 | `tool` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@0` |
| `role.tool-first` | 反 | `tool` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:misplaced-part@0` |
| `role.tool-single-marker` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `ok` |
| `role.tool-single-marker` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_result","id":"r2","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:misplaced-part@1` |
| `role.tool-body` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"text","id":"t2","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `ok` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:misplaced-part@1` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `rejected:misplaced-part@1` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `rejected:misplaced-part@1` |
| `role.marker-only-in-tool` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `ok` |
| `role.marker-only-in-tool` | 反 | `user` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:misplaced-part@0` |
| `role.marker-only-in-tool` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:misplaced-part@1` |
| `role.calls-only-in-assistant` | 正 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}},{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"},{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `ok` |
| `role.calls-only-in-assistant` | 反 | `user` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:misplaced-part@0` |
| `role.calls-only-in-assistant` | 反 | `tool_internal` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `rejected:misplaced-part@0` |
| `role.calls-only-in-assistant` | 反 | `system_reminder` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `rejected:misplaced-part@0` |
| `role.calls-only-in-assistant` | 反 | `compaction` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:misplaced-part@1` |
| `role.thinking-only-in-assistant` | 正 | `assistant` | `[{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `ok` |
| `role.thinking-only-in-assistant` | 反 | `user` | `[{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@0` |
| `role.thinking-only-in-assistant` | 反 | `tool_internal` | `[{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@0` |
| `role.thinking-only-in-assistant` | 反 | `system_reminder` | `[{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@0` |
| `role.thinking-only-in-assistant` | 反 | `compaction` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@1` |
| `role.thinking-only-in-assistant` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"thinking","id":"k1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:misplaced-part@1` |
| `id.unique` | 正 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `ok` |
| `id.unique` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"t1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:duplicate-id@1` |
| `id.unique` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"text","id":"r1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:duplicate-id@1` |
| `id.unique` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}},{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"y"}]` | `rejected:duplicate-id@2` |

## 压缩用例表

每行是压缩变体一条规则的一个示例，历史里的条目记作 e1、e2……，按写入顺序。表同时是文档和测试：[tests/normative.spec.ts](../tests/normative.spec.ts) 逐行执行，删掉一行或改变一个结论都会变红。

- `消息`：对基准压缩消息的覆盖。基准是 `{"id":"msg_abcdefghijklmnopqrstuv","role":"compaction","blocks":[一个对模型可见的文本块],"covers":{"from":"e1","to":"e1"},"retained":[],"derivation":{"owner":"o","record":"r","revision":"1","digest":"d"}}`，格里写的键替换基准里的同名键。值为 `"<absent>"` 时删去这个键，值为 `"<getter>"` 时在这个位置放一个访问器，访问器记录自己是否被调用。
- `context`：`-` 表示这一行只用 `judgeMessage` 判；否则是 `judgeCompaction` 的 `context`。`covered` 的每项是 `[引用, 消息]`，`after` 的每项是消息，`open` 是引用列表。消息写成下列简写，`null` 表示不带消息的条目：`text` 是对模型可见的 `user` 消息，`hidden` 是全部块 `toModel` 为假的 `user` 消息，`internal` 是对模型可见的 `tool_internal` 消息，`call:K`、`unparsed:K`、`incomplete:K` 是带 `callId` 为 K 的 `tool_call`、`tool_call_unparsed`、`tool_call_incomplete` 的 `assistant` 消息，`answer:K` 是回答 K 的 `tool` 消息，`compaction` 是一条合法的 `compaction` 消息。
- `结论`：`ok`、`rejected:<拒绝值>` 或 `rejected:<拒绝值>@<ref>`，没有 `@<ref>` 表示 `ref` 为 `null`。用 `;` 分隔的附加断言：`getter 未被调用`，`成功值不变且已冻结`（判定后修改输入的 `retained` 数组，成功值的三个键不变且已冻结）。

| 规则 | 极性 | 消息 | context | 结论 |
| --- | --- | --- | --- | --- |
| `compaction.keys` | 正 | `{}` | `-` | `ok` |
| `compaction.keys` | 反 | `{"derivation":"<absent>"}` | `-` | `rejected:missing` |
| `compaction.keys` | 反 | `{"role":"assistant","retained":"<absent>","derivation":"<absent>"}` | `-` | `rejected:extra` |
| `compaction.keys` | 反 | `{"role":"bogus"}` | `-` | `rejected:extra` |
| `compaction.keys` | 反 | `{"covers":null}` | `-` | `rejected:null` |
| `compaction.order` | 反 | `{"id":"bad","retained":"x"}` | `-` | `rejected:prefix` |
| `compaction.order` | 反 | `{"blocks":[],"retained":"x"}` | `-` | `rejected:empty` |
| `compaction.covers` | 反 | `{"covers":"e1"}` | `-` | `rejected:covers` |
| `compaction.covers` | 反 | `{"covers":{"from":"e1","to":"e1","size":1}}` | `-` | `rejected:covers` |
| `compaction.covers` | 反 | `{"covers":{"from":"e1","to":""}}` | `-` | `rejected:covers` |
| `compaction.covers` | 反 | `{"covers":{"from":"<getter>","to":"e1"}}` | `-` | `rejected:covers; getter 未被调用` |
| `compaction.retained` | 反 | `{"retained":"x"}` | `-` | `rejected:retained` |
| `compaction.retained` | 反 | `{"retained":["e2","e2"]}` | `-` | `rejected:retained` |
| `compaction.retained` | 反 | `{"retained":["e2",""]}` | `-` | `rejected:retained` |
| `compaction.retained` | 反 | `{"retained":["<getter>"]}` | `-` | `rejected:retained; getter 未被调用` |
| `compaction.derivation` | 反 | `{"derivation":{"owner":"o","record":"r","revision":"1"}}` | `-` | `rejected:derivation` |
| `compaction.derivation` | 反 | `{"derivation":{"owner":"o","record":"r","revision":"1","digest":""}}` | `-` | `rejected:derivation` |
| `compaction.copy` | 正 | `{"retained":["e2"]}` | `-` | `ok; 成功值不变且已冻结` |
| `history.message` | 反 | `{"role":"assistant"}` | `{"covered":[["e1","text"]],"after":[],"open":[]}` | `rejected:message` |
| `history.range` | 正 | `{}` | `{"covered":[["e1","text"]],"after":[],"open":[]}` | `ok` |
| `history.range` | 反 | `{}` | `{"covered":[],"after":[],"open":[]}` | `rejected:range` |
| `history.range` | 反 | `{"covers":{"from":"e1","to":"e2"}}` | `{"covered":[["e2","text"]],"after":[],"open":[]}` | `rejected:range` |
| `history.range` | 反 | `{}` | `{"covered":[["e1","text"],["e2","text"]],"after":[],"open":[]}` | `rejected:range` |
| `history.range` | 反 | `{"covers":{"from":"e1","to":"e2"}}` | `{"covered":[["e1","text"],["e2","text"],["e2","text"]],"after":[],"open":[]}` | `rejected:range` |
| `history.range` | 反 | `{}` | `{"covered":[["e1","text"]],"after":["compaction"],"open":[]}` | `rejected:range` |
| `history.outside` | 反 | `{"retained":["e9"]}` | `{"covered":[["e1","text"]],"after":[],"open":[]}` | `rejected:retained-outside@e9` |
| `history.order` | 反 | `{"covers":{"from":"e1","to":"e3"},"retained":["e3","e2"]}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"]],"after":[],"open":[]}` | `rejected:retained-order@e2` |
| `history.not-model` | 反 | `{"covers":{"from":"e1","to":"e4"},"retained":["e4"]}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4",null]],"after":[],"open":[]}` | `rejected:retained-not-model@e4` |
| `history.not-model` | 反 | `{"covers":{"from":"e1","to":"e5"},"retained":["e5"]}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4","text"],["e5","hidden"]],"after":[],"open":[]}` | `rejected:retained-not-model@e5` |
| `history.not-model` | 反 | `{"covers":{"from":"e1","to":"e6"},"retained":["e6"]}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4","text"],["e5","text"],["e6","internal"]],"after":[],"open":[]}` | `rejected:retained-not-model@e6` |
| `history.pairing` | 正 | `{"covers":{"from":"e1","to":"e3"},"retained":["e2","e3"]}` | `{"covered":[["e1","text"],["e2","call:k"],["e3","answer:k"]],"after":[],"open":[]}` | `ok` |
| `history.pairing` | 反 | `{"covers":{"from":"e1","to":"e3"},"retained":["e2"]}` | `{"covered":[["e1","text"],["e2","call:k"],["e3","answer:k"]],"after":[],"open":[]}` | `rejected:pairing@e2` |
| `history.pairing` | 反 | `{"covers":{"from":"e1","to":"e3"},"retained":["e3"]}` | `{"covered":[["e1","text"],["e2","call:k"],["e3","answer:k"]],"after":[],"open":[]}` | `rejected:pairing@e3` |
| `history.pairing` | 反 | `{"covers":{"from":"e1","to":"e2"}}` | `{"covered":[["e1","text"],["e2","call:k"]],"after":["answer:k"],"open":[]}` | `rejected:pairing@e2` |
| `history.pairing` | 正 | `{"covers":{"from":"e1","to":"e2"},"retained":["e2"]}` | `{"covered":[["e1","text"],["e2","call:k"]],"after":["answer:k"],"open":[]}` | `ok` |
| `history.pairing` | 正 | `{"covers":{"from":"e1","to":"e8"},"retained":["e7","e8"]}` | `{"covered":[["e1","text"],["e2","call:k"],["e3","answer:k"],["e4","text"],["e5","text"],["e6","text"],["e7","call:k"],["e8","answer:k"]],"after":[],"open":[]}` | `ok` |
| `history.pairing` | 反 | `{"covers":{"from":"e1","to":"e3"},"retained":["e2"]}` | `{"covered":[["e1","text"],["e2","unparsed:k"],["e3","answer:k"]],"after":[],"open":[]}` | `rejected:pairing@e2` |
| `history.pairing` | 正 | `{"covers":{"from":"e1","to":"e3"},"retained":["e3"]}` | `{"covered":[["e1","text"],["e2","incomplete:k"],["e3","answer:k"]],"after":[],"open":[]}` | `ok` |
| `history.open-work` | 反 | `{"covers":{"from":"e1","to":"e4"}}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4","text"]],"after":[],"open":["e4"]}` | `rejected:open-work@e4` |
| `history.open-work` | 正 | `{}` | `{"covered":[["e1","text"]],"after":["text"],"open":["e7"]}` | `ok` |
| `history.open-work` | 反 | `{"covers":{"from":"e1","to":"e6"}}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4","text"],["e5","text"],["e6","text"]],"after":[],"open":["e6","e4"]}` | `rejected:open-work@e4` |
| `history.repeat` | 正 | `{"covers":{"from":"e1","to":"e3"},"retained":["e2"]}` | `{"covered":[["e1","text"],["e2","compaction"],["e3","text"]],"after":[],"open":[]}` | `ok` |
| `history.first-failure` | 反 | `{"covers":{"from":"e1","to":"e4"},"retained":["e9"]}` | `{"covered":[["e1","text"],["e2","text"],["e3","text"],["e4","text"]],"after":[],"open":["e4"]}` | `rejected:retained-outside@e9` |
