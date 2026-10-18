# @omne-harness/message

[English](README.md)

事实记录里的消息字段，以及 `MessageId` 的解析和相等。

## 职责与状态

消息是会话日志里一条事实记录的字段，不是日志条目本身。`SystemMessage` 是请求视图，不在六种日志角色里。

本包发布消息值和 `judgeMessage`。一条消息是 `{ id, role, blocks }`。`id` 是 `parseMessageId` 接受的字符串。`role` 是六种日志角色之一。`blocks` 是按到达顺序排列的非空部件数组。部件是一条已封闭内容块，或四种工具部件之一：`tool_call`、`tool_call_incomplete`、`tool_call_unparsed`、`tool_result`。工具部件与内容块一样带块身份 `id` 和块标注 `visibility`，键是闭合的，多出任何自有键都是 `extra`。本包不发明工具结果码，部件也不能携带执行者、句柄或私有结果对象。每种部件的含义和示例表在 `docs/public-api.md`。

会话在把消息受理进日志时铸造 `msg_` 加 16 字节不可猜文本。本包不导出铸造函数。`SystemMessage` 仍是请求视图。

## 使用

```ts
import { judgeMessage } from '@omne-harness/message'
```

```json
{
  "id": "msg_abcdefghijklmnopqrstuv",
  "role": "assistant",
  "blocks": [
    {
      "kind": "text",
      "id": "b1",
      "visibility": { "toHuman": true, "toModel": true },
      "text": "hello"
    }
  ]
}
```

`judgeMessage` 接受上面这个对象。`parseMessageId` 和 `messageIdEquals` 仍在同一个入口。

没有 Cordis 入口。

## 契约

`LOG_MESSAGE_ROLES` 是 `user`、`assistant`、`tool`、`tool_internal`、`system_reminder`、`compaction`。`parseMessageId` 拒绝空串、缺少 `msg_` 前缀，以及不在 `[A-Za-z0-9_-]{22,64}` 里的正文。`messageIdEquals` 是逐字相等。

`judgeMessage` 返回 `{ ok }` 或 `{ rejected }`。部件失败还返回 `blockIndex`。`rejected` 是 `shape`、`missing`、`null`、`empty`、`unknown`、`extra`、`prefix`、`body`、`callId`、`name`、`arguments`、`partial`、`raw`、`json`、`tool-blocks`、`duplicate-id`，或内容块的拒绝码。`tenant` 这类未知键是 `extra`。带访问器、非枚举自有键或非普通原型的部件是 `json`，部件自身键上的 getter 不被调用；嵌套位置（`visibility`、`arguments`）由各自的判定读取。工具部件缺字段时报该字段名。成功值只含 `id`、`role` 和 `blocks`。

`tool_call` 有 `kind`、`id`、`visibility`、`callId`、`name`、`arguments`。`callId` 和 `name` 非空。`arguments` 是 `@omne-harness/json-text` 的 `judgeJsonValue` 接受的值树，该判定的任一失败都是 `arguments`。保存的 `arguments` 是该判定返回的冻结副本，与调用者不共享数据。`tool_call_incomplete` 用 `partial` 文本代替 `arguments`，且 `visibility` 两位都为 false。`tool_call_unparsed` 有 `raw` 文本。两个变体的 `callId` 非空，`name` 是任意字符串，`partial` 与 `raw` 是字符串，可为空，任何字段都不是 `null`。`tool_result` 有 `kind`、`id`、`visibility`、`callId`，是关联标记：同一条消息里它后面的内容块是结果正文。

角色规则：`tool` 消息的第一块是 `tool_result`，其余块不是工具部件。`tool_result` 只在 `tool` 消息里。三种调用部件只在 `assistant` 消息里。违反角色规则是 `tool-blocks`，带 `blockIndex`。同一条消息里重复使用的块身份是 `duplicate-id`。`judgeMessage` 按这个顺序返回第一个失败：消息自己的字段、逐个部件、角色规则、块身份。

## 设计

`src/index.ts` 拥有角色表、品牌、`parseMessageId`、`messageIdEquals`、`Message`、`ToolMessage` 和 `judgeMessage`。`src/parts.ts` 拥有工具部件类型和 `judgePart`。块身份规则和值树规则不在这里，来自 content-block 和 json-text。

消息字段挂在会话日志里的事实记录上。`SystemMessage` 在请求组装时现算，不进入这份日志。

```mermaid
flowchart TD
  fact["会话日志中的事实记录"] --> field["消息字段"]
  field --> user["user"]
  field --> assistant["assistant"]
  field --> tool["tool"]
  field --> internal["tool_internal"]
  field --> reminder["system_reminder"]
  field --> compaction["compaction"]
  assembly["请求组装"] --> system["SystemMessage"]
```

## 配置与运行

包不读环境。会话拥有随机源和受理键。

## 验证

`pnpm --filter @omne-harness/message test` 运行 `tests/` 里的文件，同时承担单元和契约。`public-entry.spec.ts` 与 `message.spec.ts` 核对解析、逐字相等、没有铸造导出，以及消息字段的接受和拒绝。`tool-parts.spec.ts` 与 `tool-roles.spec.ts` 核对四种工具部件的每个失败、角色规则、块身份、`arguments` 的副本，以及与 json-text 的组合。`part-kind.spec.ts` 核对不是对象的部件、缺失或非字符串的 `kind`，以及没有原型的部件。`tool-part-types.spec-d.ts` 核对公开类型。`normative.spec.ts` 逐行执行 `docs/public-api.md` 的示例表。本包是纯值，没有存储集成测试，也没有用户旅程的端到端测试。

## 维护

铸造留在会话。
