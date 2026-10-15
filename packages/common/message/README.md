# @omne-harness/message

[中文](README_ZH.md)

The message field inside a fact record, plus parse and equality for `MessageId`.

## Responsibility and status

PanQiWei confirmed this member on 2026-10-15. A message is a field of one fact record in the session log. It is not the log entry. `SystemMessage` is a request view and is not one of the six log roles.

This package parses and compares ids. The session mints `msg_` plus 16 unguessable bytes when it accepts a message into the log. Projection stays with the session. This package exports no mint function.

## Usage

```ts
import { parseMessageId, messageIdEquals } from '@omne-harness/message'

const parsed = parseMessageId('msg_abcdefghijklmnopqrstuv')
if (parsed.ok) messageIdEquals(parsed.value, parsed.value)
```

There is no Cordis entry.

## Contracts

`LOG_MESSAGE_ROLES` is `user`, `assistant`, `tool`, `tool_internal`, `system_reminder`, `compaction`. `parseMessageId` rejects an empty string, a missing `msg_` prefix, and a body outside `[A-Za-z0-9_-]{22,64}`. `messageIdEquals` is exact string equality.

## Design

`src/index.ts` owns the role list, the brand, `parseMessageId`, and `messageIdEquals`.

## Configuration and operation

The package reads no environment. The session owns entropy and the admission key.

## Verification

`pnpm --filter @omne-harness/message test` rejects a string without `msg_` and checks that `mintMessageId` is not exported.

## Maintenance

Meaning changes need PanQiWei. Minting stays in session.
