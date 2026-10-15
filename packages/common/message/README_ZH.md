# @omne-harness/message

[English](README.md)

事实记录里的消息字段，以及 `MessageId` 的解析和相等。

## 职责与状态

潘其威于 2026-10-15 确认本成员。消息是会话日志里一条事实记录的字段，不是日志条目本身。`SystemMessage` 是请求视图，不在六种日志角色里。

本包解析并比较身份。会话在把消息受理进日志时铸造 `msg_` 加 16 字节不可猜文本。投影仍归会话。本包不导出铸造函数。

## 使用

```ts
import { parseMessageId, messageIdEquals } from '@omne-harness/message'

const parsed = parseMessageId('msg_abcdefghijklmnopqrstuv')
if (parsed.ok) messageIdEquals(parsed.value, parsed.value)
```

没有 Cordis 入口。

## 契约

`LOG_MESSAGE_ROLES` 是 `user`、`assistant`、`tool`、`tool_internal`、`system_reminder`、`compaction`。`parseMessageId` 拒绝空串、缺少 `msg_` 前缀，以及不在 `[A-Za-z0-9_-]{22,64}` 里的正文。`messageIdEquals` 是逐字相等。

## 设计

`src/index.ts` 拥有角色表、品牌、`parseMessageId` 和 `messageIdEquals`。

## 配置与运行

包不读环境。会话拥有随机源和受理键。

## 验证

`pnpm --filter @omne-harness/message test` 拒绝没有 `msg_` 的字符串，并核对没有导出 `mintMessageId`。

## 维护

含义变化由潘其威确认。铸造留在会话。
