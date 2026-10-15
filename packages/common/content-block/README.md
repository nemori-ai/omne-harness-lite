# @omne-harness/content-block

[中文](README_ZH.md)

Closed content blocks for text, thinking, voice, image, and file.

## Responsibility and status

This member publishes one closed content block and `judgeContentBlock`. A closed block is text, thinking, voice, image, or file, with its id, visibility, and media type. Tool calls, tool results, and a block that is still growing are not values of this package. Tenant, standing, and causality stay off the block.

Consumers are model, tool, session, and request projection. The package does not own those facts.

## Usage

```ts
import { judgeContentBlock } from '@omne-harness/content-block'

judgeContentBlock({
  kind: 'text',
  id: 'b1',
  visibility: { toHuman: true, toModel: true },
  text: 'hello',
})
```

There is no Cordis entry. Build deletes `dist` before `tsc`.

## Contracts

`judgeContentBlock` returns `{ ok }` or `{ rejected }`. `rejected` is `kind`, `id`, `visibility`, `text`, `media`, or `file`. `CONTENT_BLOCK_KINDS` is `text`, `thinking`, `voice`, `image`, `file`.

## Design

`src/index.ts` owns the kinds, the block types, and `judgeContentBlock`.

## Configuration and operation

The package reads no environment and has no defaults. The caller passes the value.

## Verification

`pnpm --filter @omne-harness/content-block test` runs the public-entry tests. They admit a text block and reject `tool_call`.

## Maintenance

Tool execution fields stay in the tool package.
