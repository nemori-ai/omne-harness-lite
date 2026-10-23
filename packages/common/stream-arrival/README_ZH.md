# @omne-harness/stream-arrival

[English](README.md)

一次流式交付上的一个步骤。步骤是开块、填充、封块、削减和结束。

## 职责与状态

一个步骤属于一次流式交付。它不是入站受理，也不是 Cordis 派发。发出请求的一方与执行工具的一方保留自己的行为，并消费这套词汇。

本包不分配序号，不保存日志，也不携带用量和费用的正文。`judgeStreamArrival` 只核对一个步骤名和一个序号是否在场。它不给步骤排序。`assembleStream` 把一个目标的步骤折成进行中的装配，或折成已经收场的终态。序号、重复和续接的规则在下面的契约里。它不重排。

本包已采用[公共观察契约](README.md#public-observation-contract)扩展，采用范围见 [#682 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/682#issuecomment-6370514518)。引用、游标、帧和观察端口尚未实现或导出，现有到达与装配契约继续有效。中文投影见[公共观察契约](#公共观察契约)。

## 使用

```ts
import { assembleStream, judgeStreamArrival } from '@omne-harness/stream-arrival'

judgeStreamArrival({ step: 'finish', index: '9' })

assembleStream({
  target: { id: 'msg_abcdefghijklmnopqrstuv', role: 'assistant' },
  steps: [
    {
      step: 'open',
      index: '0',
      mode: 'append',
      head: { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true } },
    },
    { step: 'fill', index: '0', seq: '0', chunk: 'hello' },
    { step: 'fill', index: '0', seq: '1', chunk: 'hello' },
    { step: 'close', index: '0' },
    { step: 'finish', index: '0' },
  ],
})
```

调用方取消是 `end: { kind: 'cancelled' }`。它不是步骤。观察者断开不增加步骤，也不增加 `end`。

没有 Cordis 入口。

## 契约

`STREAM_ARRIVAL_STEPS` 是 `open`、`fill`、`close`、`trim`、`finish`。其他步骤名，包括 `event`，得到 `{ rejected: 'step' }`。缺少序号得到 `{ rejected: 'index' }`。该判断只读 `{ step, index }`。

`assembleStream` 返回 `{ ok }` 或 `{ rejected, at, assembly }`。`ok.phase` 是 `live` 或 `ended`。已经收场的装配带 `terminal`。`terminal.kind` 是 `complete`、`truncated`、`failed` 或 `cancelled`。只有 `complete` 带 `message`。

`index` 是发出该目标的 runtime 分配的十进制非负整数。作用域是这一个目标。第一个开块可以是任意安全整数，包括 `8`。后一个开块必须更大，中间可以跳号。`seq` 属于这一块。第一段填充必须是 `0`，下一段必须是上一数字加一。新的间隙或回退拒绝码是 `seq`。

重复先于顺序检查。身份是 `fill` 的块序号加 `seq`，以及其他步骤的步骤名加块序号。`finish` 的身份不带序号。同一身份、同一内容再次到达是空操作，文本不加倍。同一身份、不同内容是 `conflict`，`finish` 的 `replay` 不同（或一个带、一个不带）算不同内容。开块的不同内容是 `index`。

`from` 必须是同一次 `id` 与 `role` 的先前返回值。终态之后，已接受步骤的同值重放保持该终态。新的步骤是 `late`。准入时复制 `id`、`role` 和 `head`。之后修改调用方对象不改变已返回的装配。手写的 `{ phase: 'live' }` 被拒绝。`stopped` 即使还没有封块也是终态。之后的 `close` 或 `finish` 是 `late`。带块的步骤和开块头先判定、后复制，见下面几段。

开块头有 `kind`、`id`、`visibility`。`tool_call` 的头另有非空的 `callId` 和任意字符串 `name`（可为空串）。`tool_result` 的头另有 `callId`。`reasoning_state` 的头只有 `kind`、`id`、`visibility`。voice、image 的头可以带 `mediaType`，file 的头可以带 `storage`、`key`、`mediaType`：这些键取自 content-block 的 `CONTENT_BLOCK_HEAD_KEYS`，值必须是文本。头里没有正文字段，`kind` 也不能是变体名。`id` 与 `visibility` 由 content-block 的 `judgeBlockIdentity` 判定，头保存它返回的 `visibility`。违反规则的头得到 `step`，`detail` 是 `json`（带访问器、非枚举键或非普通原型）、`kind`、`extra`（未知键、正文字段、别的种类的键，或 `visibility` 里的未知键）、`id`、`visibility`，或某个文本键的名字。头先判定、后复制，所以头里的深对象在它的键处被拒绝，不会抛异常。

`close` 可以带 `block`。message 的 `judgePart` 在查看步骤之前先判定这个块，被拒绝时是 `block`，`detail` 是 `judgePart` 的拒绝值。缺省时封住开块头与累积文本。封住的部件在每个键上都必须与开块头相同：`kind`、`id`、`visibility`，以及每个文本键（`callId`、`name`、`mediaType`、`storage`、`key`）。任何不同是 `conflict`。它的 `text` 或 `inline` 与累积文本不一致时，拒绝码也是 `conflict`。这些情况下先前的装配都保持不变。

显式完整 image、voice 或 file 块有一项正文匹配例外。replace 模式从未接受 fill 时，close 可交完整块，不要求匹配初始空正文。这允许整交 inline 图片及封闭媒体 ref。种类、身份、可见性和已声明头字段仍须相同，ref 仍须通过 judgePart。头的 mediaType 不解释为 ref.mediaType。接受过空 fill，或填充后又替换成空串，都禁用该例外。append、text、thinking 和工具调用沿原正文规则。引用不证明内容存在或读取权限，装配器不加载媒体。

`tool_call` 只能用带完整 `tool_call` 的显式块封口。没有 `block` 的封口是 `block`，`detail` 取自 `judgePart`，是 `callId`、`name`、`arguments` 之一。开块头的 `callId` 一定非空，所以实际出现的是 `name`（空名）和 `arguments`（累积文本不是值树）。本包不拿 `arguments` 与累积文本比较：那由流的结算方核对。`tool_call` 块也可以用 `tool_call_unparsed` 部件封口，这是种类与开块头不同的唯一例外：其余键必须与开块头相同，`raw` 必须等于累积文本，否则是 `conflict`。`tool_call_incomplete` 部件永远不被封口：在 `tool_call` 头上是 `block`，`detail` 为 `incomplete`；在别的种类的头上是 `conflict`。别的种类的头收到 `tool_call_unparsed` 也是 `conflict`。带削减记录的 `tool_call` 块不能封成 `tool_call` 或 `tool_call_unparsed`，拒绝码是 `block`，`detail` 为 `trimmed`。剩下的文本也许能解码，但这不能证明模型已经说完。`trim` 只作用于开着的块。对已封口的块 `trim` 是 `closed`，与 `fill` 相同，所以已封口的部件不会再得到削减记录。

`stopped`、`cancelled`、`failed` 收场的终态只带已封口的部件和削减记录，也不当作消息来判定。仍然开着的 `tool_call` 不在其中。有块开着时 `finish` 是 `open`。流的结算方取已封口的部件，加上它构造的半截调用部件，自己对整条消息做判定。`tool_result` 没有追加形式，标记是整块到达的。

`reasoning_state` 部件与 `finish.replay` 归 [STREAM-T01](../../../docs/architecture/runtime/streaming-and-consumption.md#stream-t01)。`reasoning_state` 部件同样没有追加形式，只整块到达：以替换模式开块，再由带完整部件的封块封口。追加模式开块是 `mode`，开块与封块之间的 `fill` 也是 `mode`，与 `tool_result` 相同。不带 `block` 的封块是 `block`，`detail` 为 `payload`，因为头里没有载荷。部件由 message 的 `judgePart` 判定，所以 `toHuman` 为真、载荷为空或 `pairs` 不合法的部件得到 `block`，`detail` 是 `judgePart` 的拒绝值。封口的部件必须与头的 `id`、`visibility` 相同，别的种类的部件是 `conflict`。头里没有别的键。

`finish` 可以带 `replay: { scope, format }`，不带别的键。`replay` 的值为 `undefined` 时视为不带，与 `judgeMessage` 相同。`replay` 必须是普通对象，自有键恰好是 `scope`、`format`，没有访问器，两个值都是文本。其他形状得到 `step`，`detail` 为 `replay`，先前的装配保持不变。文本是否为空、是否过长是 message 的规则，在组成消息时判定。`finish` 被受理时，装配自己写 `at`：已封口部件中 `reasoning_state` 部件的下标，按顺序排列。它把 `{ id, role, blocks, replay: { scope, format, at } }` 交给 `judgeMessage`。`finish` 没带 `replay` 时只交 `{ id, role, blocks }`，此时有续接状态部件的消息是 `block`，`detail` 为 `replay`。有 `thinking`、没有续接状态部件的消息可以带 `replay`，`at` 为空。两者都没有的消息，以及目标不是 assistant 消息时的 `replay`，由 `judgeMessage` 拒绝，分别是 `block` 加 `replay` 与 `extra`。`stopped`、`cancelled`、`failed` 的终态只留已封口的部件，结算方组成消息时自己写 `replay`。用量与费用不在 `replay` 里，也不在任何步骤里。

## 公共观察契约

本节是[英文行为正文](README.md#public-observation-contract)的中文投影，表达同一份承诺。本扩展携带生产者已确认的投影，不替代到达步骤，也不解释 Model、Tool 状态机。共同包不导入这两个领域。各生产者拥有自己的 snapshot、delta 和生产者专属观察结束值。Model 的[投影与当前目标](../../model/model-contract/SPEC.md#公共内容观察与当前目标)由 Model 拥有。

### 引用与游标

`StreamProducer` 是 `model` 或 `tool`。`StreamId`、`StreamPosition`、`StreamRef`、`StreamCursor` 是不同品牌的文本值，纯值中的对象与数组只读。共同层消费 `@omne-harness/legal-identity` 的 `TenantId`、`tenantCodec` 及 `@omne-harness/operation-result` 的 `Outcome`，不导入 Model 或 Tool。

引用绑定生产者、原 invocation 的规范调用文本和一个已发布流身份。生产者先选择 stream 文本，再校验。helper 不分配随机身份。同一 invocation 内，一个 `StreamId` 只标识一个 dispatch、发布代次和投影版本。新 dispatch 或发布代次使用新 `StreamId`。旧引用不转向后继。品牌不证明唯一性、存在、真实来源或当前资格。

游标绑定完整引用及该流内的单调位置。不同流的位置没有共同顺序。每次已确认投影变化都推进公共游标，包括没有新内容的状态变化。

#### 规范文本与上限

规范表示与上限如下，长度按 UTF-16 码元计。

| 值或边界 | 规范文本或上限 |
| --- | --- |
| `StreamId` | `str_` 后至少一个 `[A-Za-z0-9_-]`，总长至多 256 |
| `StreamPosition` | `0` 或 `[1-9][0-9]*`，总长至多 256 |
| `StreamRef` | `JSON.stringify(['stream-ref', 1, producer, canonicalCallText, stream])` |
| `StreamCursor` | `JSON.stringify(['stream-cursor', 1, canonicalRefText, position])` |
| 调用文本输入与 codec 成功输出 | 非空，至多 `STREAM_CALL_MAX_LENGTH = 1668` |
| 引用文本输入与规范输出 | 至多 `STREAM_REFERENCE_MAX_LENGTH = 4096` |
| 游标文本输入与规范输出 | 至多 `STREAM_CURSOR_MAX_LENGTH = 8192` |

身份与位置常量分别为 `STREAM_ID_MAX_LENGTH = 256`、`STREAM_POSITION_MAX_LENGTH = 256`。等于上限继续下一检查，超一单位在 JSON 解析前返回 `length`。这些是文本解析边界；消息、队列、租户容量、吞吐和实际内存限制另有义务。

调用上限覆盖当前 Tool 的 1668 及 Model 的 1024。当前最大规范 Tool invocation 长 1154。两个全为引号的 256 长身份加 256 长 `StreamId`，产生 2487 长规范引用。再加 256 位 position，规范游标长 4872。生产者扩大身份范围前必须重核边界，不截断合法身份来满足上限。

规范输出没有 BOM、非必要空白或末尾换行，持久字节是该文本的 UTF-8。字符串转义沿 ECMAScript `JSON.stringify`。元组顺序和域标记大小写固定，版本是 JSON number `1`，字符串 `"1"` 拒绝。不做 Unicode 归一化、大小写折叠、身份字段 trim 或百分号编码。

输入上限内，引用文本允许元组外 JSON 空白及等值字符串转义。原调用 codec 规范化 call 后，重新按固定元组编码。stream 和 position 不改写。`01`、`+1`、`1.0`、`1e3`、数值、负值和空值均不是合法 position。位置比较先比十进制文本长度，再比等长数字文本，不转 JavaScript number。

游标内嵌引用必须是完整规范引用文本。`judgeStreamCursor` 将它与已判定的目标 ref 逐码元比较。任何不同均为 `foreign-stream`，包括语义等值但带非规范空白的引用。只规范化游标外层 JSON 空白和等值转义，不调用生产者 codec，不另造 call 解析器。

#### 纯操作与失败值

所有操作同步。下表是已采用的输入输出，尚未从本包导出。精确公开声明随实现维护，不在这里建立第二份签名清单。

| 操作 | 输入 | 成功值 |
| --- | --- | --- |
| `decodeStreamId` | 一个 unknown 值 | `StreamId` |
| `decodeStreamPosition` | 一个 unknown 值 | `StreamPosition` |
| `parseStreamEnvelope` | 一个 unknown 引用文本 | 冻结的 `{ producer, call, stream }`，不产生 `StreamRef` 品牌 |
| `encodeStreamRef` | `{ tenant, producer, call, stream }` 与生产者调用 codec | 规范 `StreamRef` |
| `judgeStreamRef` | `{ value, tenant }` 与生产者调用 codec | 规范 `StreamRef` |
| `readStreamRef` | 已判定的 `StreamRef` | 冻结的 `{ producer, call, stream }` |
| `encodeStreamCursor` | `{ ref, position }` | 规范 `StreamCursor` |
| `judgeStreamCursor` | `{ value, ref }`，ref 是已判定目标 | 规范 `StreamCursor` |
| `readStreamCursor` | 已判定的 `StreamCursor` | 冻结的 `{ ref, position }` |
| `compareStreamPositions` | 先左、后右两个已判定位置 | `-1`、`0` 或 `1` |

decode、parse、encode、judge 返回 `Outcome`。`StreamValueRejection` 带 `field` 和 `reason`。field 是 `StreamId`、`StreamPosition`、`StreamRef` 或 `StreamCursor`。reason 集合是 `type`、`length`、`syntax`、`domain`、`version`、`shape`、`producer`、`identity`、`position`、`unreadable`。

身份、位置 decoder 和 envelope parser 直接返回该 rejection。引用失败是带 rejection 的 `invalid-envelope`，或 `wrong-producer`、`malformed`、`invalid-tenant`、`foreign-tenant`。游标失败是带 rejection 的 `invalid`，或 `foreign-stream`。调用 codec 暴露 `producer` 和 `resolve({ text, tenant })`。resolve 经 `Outcome` 返回规范 call 文本，或 `malformed`、`invalid-tenant`、`foreign-tenant`。

检查按以下顺序执行，首个失败决定结果。

1. `decodeStreamId` 先核 string，再核非空及长度上限，最后核词法。失败依次是 `type`、`length`、`identity`。`decodeStreamPosition` 同序，词法失败为 `position`。field 是各自 decoder 的字段名。
2. `parseStreamEnvelope` 依次核 string、非空及引用长度上限、JSON 语法、数组、domain、version、精确五项、producer、call、stream。field 固定 `StreamRef`。非数组或项数不符为 `shape`。producer 非 `model` 或 `tool` 为 `producer`。call 非 string 为 `shape`，空或超限为 `length`。stream 非法为 `identity`。额外项不忽略。成功冻结 envelope，但只提供路由值。
3. `judgeStreamRef` 先以 `tenantCodec.encode` 核 tenant 铸造关系，失败为 `invalid-tenant`。再解析 envelope，失败包为 `invalid-envelope`。再比较 `codec.producer`，不同为 `wrong-producer`，不调用 resolve。最后调用 resolve，保留三种原调用失败。成功重新规范编码，输出超限为 `invalid-envelope`，reason 为 `length`。
4. `encodeStreamRef` 先捕获精确四键 tenant、producer、call、stream 的 data record。每键必须是自有可枚举 data property，原型只能是 `Object.prototype` 或 null。不调用 getter、toJSON 或转换函数。反射异常为 `invalid-envelope/unreadable`，其他非法 record 外形为 `invalid-envelope/shape`。捕获后按上述次序核 tenant、envelope 字段、producer、原 codec 和规范输出。不冻结调用方 record。
5. `encodeStreamCursor` 捕获精确 ref、position 两键 record，沿同一描述符与原型规则，失败为 `invalid`，field 为 `StreamCursor`。ref 是已判定规范品牌，position 重新核词法，非法为 `position`。按固定元组编码并核游标输出上限。伪造 ref 品牌是编程错误，结构检查不证明原调用已验证。
6. `judgeStreamCursor` 依次核原始 string、非空及游标长度上限、JSON 语法、数组、domain、version、精确四项、内嵌 ref、position。field 固定 `StreamCursor`。内嵌 ref 非 string 为 `shape`，空或超限为 `length`。position 非法为 `position`。结构全部通过后才比较目标 ref，不同为 `foreign-stream`，成功返回规范游标文本。

judge 参数容器及调用 codec 是 typed 注入依赖，不是 unknown 序列化对象图。描述符规则仅用于两种 encode record，unknown 文本入口不读取对象属性。codec 是拥有者提供的纯函数。实现缺陷抛出，不伪装成 `malformed`。成功输出非 string、为空或超 1668，是 codec 实现缺陷。

`judgeStreamRef` 是引用解码边界，没有绕过 tenant 和生产者校验的 `decodeStreamRef`。read 只接收这些边界产生的品牌，不核当前资格，不重调生产者 codec。不可读的伪造品牌抛通用 `TypeError`，不回显输入。parse 和 read 的对象结果冻结，调用方输入不冻结、不修改。

各生产者维护原调用 codec 适配器。Model 先调用 `resolveModelInvocationRef(text, tenant)`，再调用 `encodeModelInvocationRef(parts)`。Tool 使用对应的 `resolveToolInvocationRef` 和 `encodeToolInvocationRef`。详细 malformed rejection 映为 `malformed`，`invalid-tenant`、`foreign-tenant` 保持原 kind。共同 tenant 检查先于 Tool codec，所以 Tool 将未铸造 tenant 归 foreign 的内部差异不改变公共结果。没有原 codec 验证的测试 callback 不是正式身份适配器。Tool 具体适配器仍归 Tool。

#### 固定编码例

固定文本由[英文正文中的生成式](README.md#fixed-codec-examples)定义，不依赖随机数或环境。使用匹配的已铸造 tenant 和 Model codec，读取 ref 得到 `{ producer: 'model', call, stream: 'str_a' }`，读取 c10 得到 `{ ref, position: '10' }`。文本前后各加一个空格后 judge 得到同一规范值。比较 `9` 与 `10`，或 `9007199254740992` 与 `9007199254740993`，均返回 `-1`。

固定拒绝例与英文正文相同。

| 对固定例的变更 | 结果 |
| --- | --- |
| ref domain 改 `stream-cursor` | `invalid-envelope/domain` |
| ref version 改字符串 `"1"` | `invalid-envelope/version` |
| ref 添加第六项 null | `invalid-envelope/shape` |
| producer 改 tool，仍配 Model codec | `wrong-producer`，不调用 codec |
| model producer 配合法 Tool invocation | `malformed` |
| 输入同形未铸造 tenant | `invalid-tenant`，不调用 codec |
| 输入另一 account 的已铸造 tenant | `foreign-tenant` |
| stream 是 `str_` | reason 为 `identity` |
| position 是 `01`，或游标 position 是数值零 | reason 为 `position` |
| 游标内嵌 ref 的 stream 改 `str_b` | `foreign-stream` |
| 游标内嵌 ref 文本前加空格 | `foreign-stream` |
| ref 长 4097 或 cursor 长 8193 | JSON 解析前返回 `length` |
| 单独 position 是 256 个 9 | 成功，257 个 9 为 `length` |

编码验证使用真实已铸造 tenant 和生产者原 codec，覆盖固定例、检查优先级、规范化、上限及冻结读值。最大长度例用原 Tool encoder 编码两个全为引号的 256 长身份，再按[英文生成式](README.md#fixed-codec-examples)构造最大引用与游标，长度分别保持 1154、2487、4872。类型检查拒绝四种品牌互换及裸 string 替代，不据此证明真实发布或资格。

### 帧与身份

所有帧用 `kind` 判别，共有以下分支。

| 帧 | 含义 |
| --- | --- |
| snapshot | 已确认投影值与其 cursor |
| delta | 变化值、起始游标 from 与结束游标 cursor |
| gap | 连续性丢失，带最后 cursor 的 after 或 null，reason 为 buffer 或 source-history |
| ended | 本次观察结束，带标准原因或生产者专属结束值 |

snapshot 身份是 ref/cursor，delta 身份是 ref/from/cursor。相同身份必须相同内容。C10 到 C12 与 C11 到 C12 的 delta 可有不同值。生产者可合并已确认变化，但每个 delta 起点必须是该观察者最后交出的 cursor。

标准结束原因是 source-closed、observer-closed、stale-stream、denied、unavailable、capacity。source-closed 只说明来源流不再变化，不证明业务完成。生产者专属结束使用 reason=producer-ended，带由该生产者拥有的 typed 值。StreamFrame、StreamObserver 用额外泛型参数 E 传递，默认 never。它携带公开结束值，不携带原始异常、Error 或任意日志。共同消费者据此结束观察，不推导更强业务事实。

共同层不枚举 Tool 原因，也不将其 closed 重释为永久不变来源。适配器保持原公开原因含义，专属值遵守同样字节上限与披露检查。标准原因足够时 Model 可用 E=never。Tool 的具体结束别名与适配仍归 Tool。

### 快照与订阅边界

观察先交已确认快照，不能开始则明确结束。生产者在同一临界区取得快照 C 并登记 C 之后的订阅。先读快照再普通 subscribe 会漏掉两者之间的确认变化，不能满足本契约。Model 只在保存确认后发布。

观察请求不提供 after 游标重放。gap 或断线后，消费者重新请求当前快照。不承诺耐久 delta replay 或每个上游片段。gap、ended 都是最终帧。没有二者的 EOF 是连接失败，不是成功结束。

### 披露、容量与关闭

每次实际输出帧前，来源检查当前资格、tenant、stream 绑定和发布代次。准备数据发生等待时，准备后重查。最终集成输出边界另核自己的披露资格。排队内容和较早检查不授权稍后的输出。撤权先移除订阅、清空排队数据，再以 denied 结束。已披露内容不能撤回。

提供者声明有限的 snapshot 字节、delta 字节、每观察者排队帧数与字节、每租户观察者数、总内存及队列驻留时间上限。规范字节采用递归排序对象键、保留数组顺序、JSON 字符串转义的 UTF-8 JSON。它不计真实堆开销，提供者另限实际资源。

队列达到上限时，先移除订阅、丢弃待交数据，再交一个终止 gap。不能丢中间数据后继续。超大 snapshot 以 capacity 结束。上限同样覆盖 producer-ended 值。

Abort 和迭代器 return 只移除本次观察，不取消生产者工作、不 ACK 结果、不授权释放结果。业务终局与观察结束是不同事实。

### 交付与验证边界

公共观察端口从身份拥有者唯一公开入口导入 Access，不复制候选身份声明。完整端口要求已采用且可用的身份契约及经验证的消费者声明闭包。纯 ref/cursor 不证明观察服务已经可用。

符合性场景覆盖快照与登记间提交、state-only 更新、错生产者或 tenant、异流 cursor、排队后撤权，也覆盖不同 from 同结束 cursor、慢读者、超大 snapshot 和无终止帧 EOF。纯 codec 与受控观察者不能证明真实生产者原子订阅或实际披露检查。运行时发布、身份集成、消费者刷新与真实适配器分别需要各拥有者的集成证据。

## 设计

`src/index.ts` 拥有步骤表、`judgeStreamArrival` 和 `assembleStream`。

## 配置与运行

包不读环境。发出该目标的 runtime 分配序号。

## 验证

`pnpm --filter @omne-harness/stream-arrival test` 运行 `tests/public-entry.spec.ts`、`tests/assembly.spec.ts`、`tests/tool-call.spec.ts`、`tests/head-and-trim.spec.ts` 和 `tests/reasoning-replay.spec.ts`。这些测试同时承担单元和契约。它们核对步骤名、序号拒绝，以及装配终态，包括重复送达、截断、迟到步骤和调用方取消。`tool-call.spec.ts` 核对闭合的开块头、显式封口规则、两个调用变体、削减规则、深对象和步骤指纹，使用真实的 message、content-block、json-text。`reasoning-replay.spec.ts` 核对 `reasoning_state` 部件的整块到达、开块、填充与封块的拒绝、`finish` 的 `replay`，以及收场消息的 `replay.at`。`head-and-trim.spec.ts` 核对非枚举的头键、报告了没有描述符的键的头、缺 `callId` 的 `tool_result` 头、不带 `mediaType` 的 voice 或 image 头、封口部件多出头没有的文本键、别的种类的头收到 `tool_call_unparsed` 封口、削减过的 `tool_call` 用 text 块封口，以及对从未打开的序号削减。本包是纯值，没有存储集成测试，也没有用户旅程的端到端测试。

## 维护

执行事实留在发出和执行的一方。半截调用部件由流的结算方构造，本包不构造。
