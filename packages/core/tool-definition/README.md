# @omne-harness-lite/tool-definition

[中文](README_ZH.md)

Define single-function or multi-command tools, project their model-facing entries, judge parameters, and normalize tool return content. These functions can be used without the OMNE runtime.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                                                        | Use                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `judgeToolDefinition`, `createParameterJudge`                     | Admit definitions and validate selected command arguments |
| `modelEntry`, `modelInput`, `modelName`, `definitionNameOf`       | Project one model-facing entry per tool                   |
| `judgeToolReturn`, `toolResultOf`                                 | Judge and normalize return content                        |
| `toolDependencies`, `toolAttributeDeclarations`, `toolReferences` | Project dependencies, settings and composition            |
| `toolBodyContract`                                                | Plug Tool rules into the asset model                      |

## Project and validate a single tool

A caller-owned parameter judge can be reused for admission and calls. Unknown arguments fail even when the authored root omits `additionalProperties`.

```ts
import {
  createParameterJudge,
  judgeToolDefinition,
  modelEntry,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'

const tool: ToolDefinition = {
  name: 'repo:read',
  description: 'Read one repository file',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Repository-relative path' } },
    required: ['path'],
  },
  permissions: { execute: { default: 'ask' } },
}
const judge = createParameterJudge()
console.log(judgeToolDefinition(tool, judge)) // { ok: true }
console.log(modelEntry(tool).name) // repo__read
console.log(judge.judgeCallArguments(tool, { path: 'README.md' }))
// { ok: { args: { path: 'README.md' } } }
console.log('invalid' in judge.judgeCallArguments(tool, { path: 'README.md', extra: true })) // true
```

## Select a multi-command schema

The model sees one entry; argument judgment uses the selected command schema.

```ts
import {
  createParameterJudge,
  modelInput,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'

const tool: ToolDefinition = {
  name: 'repo',
  description: 'Repository operations',
  paradigm: 'multi',
  origin: { kind: 'authored' },
  permissions: { execute: { default: 'ask' } },
  commands: {
    status: { description: 'Show status', input: { type: 'object', properties: {} } },
    read: {
      description: 'Read a file',
      input: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path' } },
        required: ['path'],
      },
    },
  },
}
const judge = createParameterJudge()
console.log(modelInput(tool).required) // ['command']
console.log(judge.judgeCallArguments(tool, { command: 'status' }))
// { ok: { command: 'status', args: {} } }
console.log('invalid' in judge.judgeCallArguments(tool, { command: 'read', args: {} })) // true
```

## Normalize text and reject calls in results

The caller supplies the identity for a string return. An unparsed tool call remains a call and cannot become result content.

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { toolResultOf, judgeToolReturn } from '@omne-harness-lite/tool-definition'

const blockId = unwrap(parseOpaqueIdentifier('result_text', 'BlockId'))
const result = toolResultOf('{"status":"ok"}', blockId)
console.log(result.content[0]?.kind) // text
console.log(
  judgeToolReturn({
    content: [
      {
        id: 'call_block',
        kind: 'tool_call',
        complete: true,
        callId: 'call_1',
        tool: 'repo__read',
        rawArguments: '{broken',
        unparseable: true,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }),
) // { rejected: 'result_call_in_content' }
```

## Failures and boundaries

`judgeToolDefinition` and `judgeToolReturn` return `{ ok: true }` or `{ rejected }`. `malformed` includes an `M` diagnostic and `schema_unsupported` can include an implementation-limit diagnostic. Call arguments yield `{ ok: { command?, args } }`, `{ invalid }` or `{ unsupported }`; calling the parameter judge with an invalid definition throws `TypeError`. The caller owns the judge and its schema compilation cache.

Input schemas use the supported Draft 2020-12 subset. Every declared parameter needs a description. During argument judgment, omitted root `additionalProperties` means false in the private validator view; model-facing schemas are not rewritten. Regex limits are exposed as `PATTERN_MAX_CODE_POINTS` and `PATTERN_MAX_FINITE_COUNT`. Judgment is synchronous; worker termination and execution time limits belong to the consumer.

A Tool Result is returned content, not an execution outcome. Tool calls are forbidden in result content and offload summaries, including complete calls whose arguments could not be parsed. A JSON-looking string remains text. Identity uniqueness, permissions, dependency availability, background work and execution belong to the runtime. This package does not execute tools or contact models.

Public JSON Schema entries are `@omne-harness-lite/tool-definition/schema` (v3) and `/schema/v2`. See [source exports](src/index.ts), [tests](tests/) and [content blocks](../content-blocks/README.md).

See [behavior](SPEC.md) and [verification duties](verification/README.md).
