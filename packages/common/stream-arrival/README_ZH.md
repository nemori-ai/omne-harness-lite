# @omne-harness/stream-arrival

[English](README.md)

一次流式交付上的一个步骤。步骤是开块、填充、封块、削减和结束。

## 职责与状态

一个步骤属于一次流式交付。它不是入站受理，也不是 Cordis 派发。发出请求的一方与执行工具的一方保留自己的行为，并消费这套词汇。

本包不分配序号，不保存日志，也不携带用量和费用的正文。`judgeStreamArrival` 只核对一个步骤名和一个序号是否在场。它不给步骤排序。`assembleStream` 把一个目标的步骤折成进行中的装配，或折成已经收场的终态。序号、重复和续接的规则在下面的契约里。它不重排。

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

开块头有 `kind`、`id`、`visibility`。`tool_call` 的头另有非空的 `callId` 和任意字符串 `name`（可为空串）。`tool_result` 的头另有 `callId`。`reasoning_state` 的头只有三个身份键。voice、image 的头可以带 `mediaType`，file 的头可以带 `storage`、`key`、`mediaType`：这些键取自 content-block 的 `CONTENT_BLOCK_HEAD_KEYS`，值必须是文本。头里没有正文字段，`kind` 也不能是变体名。`id` 与 `visibility` 由 content-block 的 `judgeBlockIdentity` 判定，头保存它返回的 `visibility`。违反规则的头得到 `step`，`detail` 是 `json`（带访问器、非枚举键或非普通原型）、`kind`、`extra`（未知键、正文字段、别的种类的键，或 `visibility` 里的未知键）、`id`、`visibility`，或某个文本键的名字。头先判定、后复制，所以头里的深对象在它的键处被拒绝，不会抛异常。

`close` 可以带 `block`。message 的 `judgePart` 在查看步骤之前先判定这个块，被拒绝时是 `block`，`detail` 是 `judgePart` 的拒绝值。缺省时封住开块头与累积文本。封住的部件在每个键上都必须与开块头相同：`kind`、`id`、`visibility`，以及每个文本键（`callId`、`name`、`mediaType`、`storage`、`key`）。任何不同是 `conflict`。它的 `text` 或 `inline` 与累积文本不一致时，拒绝码也是 `conflict`。这些情况下先前的装配都保持不变。

显式完整 image、voice 或 file 块有一项正文匹配例外。replace 模式从未接受 fill 时，close 可交完整块，不要求匹配初始空正文。这允许整交 inline 图片及封闭媒体 ref。种类、身份、可见性和已声明头字段仍须相同，ref 仍须通过 judgePart。头的 mediaType 不解释为 ref.mediaType。接受过空 fill，或填充后又替换成空串，都禁用该例外。append、text、thinking 和工具调用沿原正文规则。引用不证明内容存在或读取权限，装配器不加载媒体。

`tool_call` 只能用带完整 `tool_call` 的显式块封口。没有 `block` 的封口是 `block`，`detail` 取自 `judgePart`，是 `callId`、`name`、`arguments` 之一。开块头的 `callId` 一定非空，所以实际出现的是 `name`（空名）和 `arguments`（累积文本不是值树）。本包不拿 `arguments` 与累积文本比较：那由流的结算方核对。`tool_call` 块也可以用 `tool_call_unparsed` 部件封口，这是种类与开块头不同的唯一例外：其余键必须与开块头相同，`raw` 必须等于累积文本，否则是 `conflict`。`tool_call_incomplete` 部件永远不被封口：在 `tool_call` 头上是 `block`，`detail` 为 `incomplete`；在别的种类的头上是 `conflict`。别的种类的头收到 `tool_call_unparsed` 也是 `conflict`。带削减记录的 `tool_call` 块不能封成 `tool_call` 或 `tool_call_unparsed`，拒绝码是 `block`，`detail` 为 `trimmed`。剩下的文本也许能解码，但这不能证明模型已经说完。`trim` 只作用于开着的块。对已封口的块 `trim` 是 `closed`，与 `fill` 相同，所以已封口的部件不会再得到削减记录。

`stopped`、`cancelled`、`failed` 收场的终态只带已封口的部件和削减记录，也不当作消息来判定。仍然开着的 `tool_call` 不在其中。有块开着时 `finish` 是 `open`。流的结算方取已封口的部件，加上它构造的半截调用部件，自己对整条消息做判定。`tool_result` 没有追加形式，标记是整块到达的。

`reasoning_state` 部件同样没有追加形式，只整块到达：以替换模式开块，再由带完整部件的封块封口。追加模式开块是 `mode`，开块与封块之间的 `fill` 也是 `mode`，与 `tool_result` 相同。不带 `block` 的封块是 `block`，`detail` 为 `payload`，因为头里没有载荷。部件由 message 的 `judgePart` 判定，所以 `toHuman` 为真、载荷为空或 `pairs` 不合法的部件得到 `block`，`detail` 是 `judgePart` 的拒绝值。封口的部件必须与头的 `id`、`visibility` 相同，别的种类的部件是 `conflict`。头里没有别的键。

`finish` 可以带 `replay: { scope, format }`，不带别的键。`replay` 的值为 `undefined` 时视为不带，与 `judgeMessage` 相同。`replay` 必须是普通对象，自有键恰好是 `scope`、`format`，没有访问器，两个值都是文本。其他形状得到 `step`，`detail` 为 `replay`，先前的装配保持不变。文本是否为空、是否过长是 message 的规则，在组成消息时判定。`finish` 被受理时，装配自己写 `at`：已封口部件中 `reasoning_state` 部件的下标，按顺序排列。它把 `{ id, role, blocks, replay: { scope, format, at } }` 交给 `judgeMessage`。`finish` 没带 `replay` 时只交 `{ id, role, blocks }`，此时有续接状态部件的消息是 `block`，`detail` 为 `replay`。有 `thinking`、没有续接状态部件的消息可以带 `replay`，`at` 为空。两者都没有的消息，以及目标不是 assistant 消息时的 `replay`，由 `judgeMessage` 拒绝，分别是 `block` 加 `replay` 与 `extra`。`stopped`、`cancelled`、`failed` 的终态只留已封口的部件，结算方组成消息时自己写 `replay`。用量与费用不在 `replay` 里，也不在任何步骤里。

## 设计

`src/index.ts` 拥有步骤表、`judgeStreamArrival` 和 `assembleStream`。

## 配置与运行

包不读环境。发出该目标的 runtime 分配序号。

## 验证

`pnpm --filter @omne-harness/stream-arrival test` 运行 `tests/public-entry.spec.ts`、`tests/assembly.spec.ts`、`tests/tool-call.spec.ts`、`tests/head-and-trim.spec.ts` 和 `tests/reasoning-replay.spec.ts`。这些测试同时承担单元和契约。它们核对步骤名、序号拒绝，以及装配终态，包括重复送达、截断、迟到步骤和调用方取消。`tool-call.spec.ts` 核对闭合的开块头、显式封口规则、两个调用变体、削减规则、深对象和步骤指纹，使用真实的 message、content-block、json-text。`reasoning-replay.spec.ts` 核对 `reasoning_state` 部件的整块到达、开块、填充与封块的拒绝、`finish` 的 `replay`，以及收场消息的 `replay.at`。`head-and-trim.spec.ts` 核对非枚举的头键、报告了没有描述符的键的头、缺 `callId` 的 `tool_result` 头、不带 `mediaType` 的 voice 或 image 头、封口部件多出头没有的文本键、别的种类的头收到 `tool_call_unparsed` 封口、削减过的 `tool_call` 用 text 块封口，以及对从未打开的序号削减。本包是纯值，没有存储集成测试，也没有用户旅程的端到端测试。

## 维护

执行事实留在发出和执行的一方。半截调用部件由流的结算方构造，本包不构造。
