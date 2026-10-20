# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，不手写第二套签名；唯一例外是下面的[候选：压缩变体](#候选压缩变体)，它在实现前暂存候选签名。工具部件、角色规则与块身份的非类型行为，正文是本文件的「语义」「判定顺序」两节和 [README](../README.md) 的契约节。压缩变体的行为归 [SPEC.md](../SPEC.md)。

## 导出入口

`package.json` 的 `exports` 只有入口 `.`，`source` 指向 [src/index.ts](../src/index.ts)。调用者不需要资格：任何需要日志消息值的能力都按包名 `@omne-harness/message` 导入。运行时导出恰为 `LOG_MESSAGE_ROLES`、`parseMessageId`、`messageIdEquals`、`judgeMessage`、`judgePart` 五个，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。其余导出都是类型。本包不铸造消息身份，也不铸造块身份。

## 定义索引

| 导出 | 种类 | 定义位置 |
| --- | --- | --- |
| `Message`、`MessageId`、`LogMessageRole`、`MessageRejection`、`MessageJudgment`、`ToolMessage` | 类型 | [src/index.ts](../src/index.ts) |
| `judgeMessage`、`parseMessageId`、`messageIdEquals` | 函数 | [src/index.ts](../src/index.ts) |
| `ToolCallPart`、`IncompleteToolCallPart`、`UnparsedToolCallPart`、`ToolResultPart`、`ToolPart`、`MessagePart` | 类型 | [src/parts.ts](../src/parts.ts) |
| `judgePart` | 函数 | [src/parts.ts](../src/parts.ts) |

失败不抛异常，是返回值：`{ rejected }`，部件上的失败另带 `blockIndex`。`judgePart` 的拒绝值是 `MessageRejection` 的子集，没有 `tool-blocks` 与 `duplicate-id`，这两个只有整条消息的判定才会给出。块身份与标注（`id`、`visibility`，含 `visibility` 内的未知键）由 `@omne-harness/content-block` 的 `judgeBlockIdentity` 判定，`arguments` 由 `@omne-harness/json-text` 的 `judgeJsonValue` 判定，本包不复制这两套规则。

## 候选：压缩变体

状态：候选，未实现。下面的签名是 message 实现卡的输入，`src/` 还没有这些导出，`judgeMessage` 也还没有按 [SPEC.md](../SPEC.md#judgemessage-对压缩变体的判定) 判 `compaction` 角色的三个键。实现交付后，签名移入 `src/index.ts`，本节改为定义索引里的普通行，导出清单与 `tests/public-entry.spec.ts` 同步增加 `judgeCompaction`、`isCompactionMessage`、`parseRecordEntryRef`。

```ts
declare const recordEntryRefBrand: unique symbol
/** Opaque reference to one record entry. The history holder mints it; consumers compare it exactly. */
export type RecordEntryRef = string & { readonly [recordEntryRefBrand]: true }

/** Durable evidence of how the summary and the retained set were derived. This package does not interpret it. */
export type CompactionDerivation = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

export type CompactedRange = Readonly<{ from: RecordEntryRef; to: RecordEntryRef }>

/** The compaction variant. `blocks` is the summary. */
export type CompactionMessage = Message &
  Readonly<{
    role: 'compaction'
    blocks: readonly [ContentBlock, ...ContentBlock[]]
    covers: CompactedRange
    retained: readonly RecordEntryRef[]
    derivation: CompactionDerivation
  }>

/** One entry of the compacted range, in log order. `message` is null for an entry that carries no message. */
export type CoveredEntry = Readonly<{ ref: RecordEntryRef; message: Message | null }>

export type CompactionContext = Readonly<{
  covered: readonly CoveredEntry[]
  after: readonly Message[]
  open: readonly RecordEntryRef[]
}>

export type CompactionRejection =
  | 'message'
  | 'range'
  | 'retained-outside'
  | 'retained-order'
  | 'retained-not-model'
  | 'pairing'
  | 'open-work'

export type CompactionJudgment =
  | Readonly<{ ok: CompactionMessage }>
  | Readonly<{ rejected: CompactionRejection; ref: RecordEntryRef | null }>

export declare function parseRecordEntryRef(raw: string): RecordEntryRef | null

/** Narrows an admitted message to the compaction variant. It does not judge the shape again. */
export declare function isCompactionMessage(message: Message): message is CompactionMessage

/** Judges a compaction record against the history the holder supplies. `message` is judged with judgeMessage first. */
export declare function judgeCompaction(message: unknown, context: CompactionContext): CompactionJudgment
```

`MessageRejection` 同时增加 `covers`、`retained`、`derivation` 三个值，由 `judgeMessage` 在判 `compaction` 角色的三个键时给出。`judgeMessage` 的成功值类型仍是 `Message`；消费者用 `isCompactionMessage` 收窄，或直接把输入交给 `judgeCompaction`，从其成功值取得 `CompactionMessage`。`judgeCompaction` 的拒绝值与 `MessageRejection` 分开，调用者能区分形状失败与历史规则失败。行为、判定顺序和候选反例见 [SPEC.md](../SPEC.md)。

## 语义

工具部件是带块身份与块标注的块，与内容块同形，每块的标注由生产者写入，各块各自成立。键是闭合的：每种部件有固定的自有键，多出任何一个键都判 `extra`，不保留其他自有键。理由是消息投影不得携带执行者、句柄或私有结果对象。

- `tool_call`：参数收齐并解码成值树的调用，可以执行。`arguments` 是值树，不是文本，保存的是 `judgeJsonValue` 返回的冻结副本，与调用者的输入不共享。
- `tool_call_incomplete`：参数没收齐的调用。`partial` 是原样累计文本，可为空，本包不解析。`visibility` 两位都必须为 false：它留在日志里备查，不给人看也不给模型看，派生请求剔除它。它不参与调用与结果的配对。由流的结算方在结算时构造。
- `tool_call_unparsed`：参数收齐，但累计文本不能解码成值树，或名字不合法的调用。`raw` 是原样累计文本。它登记调用身份，不执行，可以被同 `callId` 的工具消息回答，对 `visibility` 没有另外限制。`name` 不要求非空，也不要求是合法工具名。
- `tool_result`：关联标记，不嵌套内容，不带结果状态。正文是同一条消息里紧随其后的已封闭内容块。一条工具消息恰好承载一个调用的结果，按 `callId` 配对。

整条消息的规则：`tool` 角色的消息第一块必须是标记，其余块是通过内容块判定的非工具部件，全消息恰有一个标记。标记只能出现在 `tool` 角色的消息里。三种调用部件只能出现在 `assistant` 角色的消息里。块身份在整条消息内唯一，不同消息之间不比较。允许哪些内容种类放进工具消息的正文，归结果投影方的政策，本包只判结构。

本包没有结局字段，所以不判定半截调用出现的条件：完整结局的消息不含半截调用由流的结算方保证，派生请求剔除半截调用归请求组装方。调用与结果的配对完整性也不在本包判定。

块身份的铸造方各自负责：在消息内唯一、重放或重试时不变。流的结算方铸造开块头的 `id`，半截与未解析的变体沿用该头的 `id`。结果投影方铸造标记的 `id`。占位追加方若追加 `tool` 角色消息，铸造标记与正文块的 `id`。本包只检查，不铸造。

## 判定顺序

`judgePart` 先看部件本身：有访问器、非枚举自有键或非普通原型的对象判 `json`，部件自身键上的 getter 不被调用；嵌套位置（`visibility`、`arguments`）由各自的判定读取。再按 `kind` 分派：不认识的字符串 `kind` 判 `unknown`，没有 `kind` 或 `kind` 不是字符串则交给内容块判定。对工具部件，先检查键是否闭合（多键判 `extra`，缺键报缺的字段名），然后依次判 `id`、`visibility`、`callId`，最后判该种类自己的字段（`name`、`arguments`、`partial`、`raw`；`tool_call_incomplete` 先判 `visibility` 两位为 false）。键不闭合的部件在第一步被拒，其中的深对象不会被遍历。只有 `arguments` 被递归遍历，且只经 `judgeJsonValue`，`judgeJsonValue` 的任一失败都报 `arguments`，不外泄结构路径。

`judgeMessage` 依次检查消息自己的字段、逐个部件、角色规则、块身份唯一，返回第一个失败。

## 验证义务

[tests/tool-parts.spec.ts](../tests/tool-parts.spec.ts) 逐个失败值锁定四种部件的规则、`arguments` 的副本与同 json-text 的组合。[tests/tool-roles.spec.ts](../tests/tool-roles.spec.ts) 锁定角色规则与块身份唯一。[tests/tool-part-types.spec-d.ts](../tests/tool-part-types.spec-d.ts) 锁定公开类型的形状。[tests/normative.spec.ts](../tests/normative.spec.ts) 逐行执行下面的示例表，并规定表必须展示哪些规则的正反两面。本包不验证结果投影方的输出，也不验证流的结算方交出的部件。

## 示例表

每行是一条规则的一个示例：`规则` 是规则名，`极性` 中「正」是允许的例子，「反」是被拒的例子，`角色` 与 `块` 是 `judgeMessage` 的输入（消息身份固定），`结论` 是 `ok`，或 `rejected:<拒绝值>@<blockIndex>`。表同时是文档和测试：删掉一行或改变一个结论，`tests/normative.spec.ts` 变红。

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
| `role.tool-first` | 反 | `tool` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:tool-blocks@0` |
| `role.tool-first` | 反 | `tool` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:tool-blocks@0` |
| `role.tool-single-marker` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `ok` |
| `role.tool-single-marker` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_result","id":"r2","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:tool-blocks@1` |
| `role.tool-body` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"text","id":"t2","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `ok` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:tool-blocks@1` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `rejected:tool-blocks@1` |
| `role.tool-body` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `rejected:tool-blocks@1` |
| `role.marker-only-in-tool` | 正 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `ok` |
| `role.marker-only-in-tool` | 反 | `user` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:tool-blocks@0` |
| `role.marker-only-in-tool` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"}]` | `rejected:tool-blocks@1` |
| `role.calls-only-in-assistant` | 正 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}},{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"},{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `ok` |
| `role.calls-only-in-assistant` | 反 | `user` | `[{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:tool-blocks@0` |
| `role.calls-only-in-assistant` | 反 | `tool_internal` | `[{"kind":"tool_call_incomplete","id":"i1","visibility":{"toHuman":false,"toModel":false},"callId":"k","name":"echo","partial":"{"}]` | `rejected:tool-blocks@0` |
| `role.calls-only-in-assistant` | 反 | `system_reminder` | `[{"kind":"tool_call_unparsed","id":"u1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","raw":"{"}]` | `rejected:tool-blocks@0` |
| `role.calls-only-in-assistant` | 反 | `compaction` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:tool-blocks@1` |
| `id.unique` | 正 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `ok` |
| `id.unique` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"t1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}}]` | `rejected:duplicate-id@1` |
| `id.unique` | 反 | `tool` | `[{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"k"},{"kind":"text","id":"r1","visibility":{"toHuman":true,"toModel":true},"text":"x"}]` | `rejected:duplicate-id@1` |
| `id.unique` | 反 | `assistant` | `[{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"x"},{"kind":"tool_call","id":"c1","visibility":{"toHuman":true,"toModel":true},"callId":"k","name":"echo","arguments":{"kind":"null"}},{"kind":"text","id":"t1","visibility":{"toHuman":true,"toModel":true},"text":"y"}]` | `rejected:duplicate-id@2` |
