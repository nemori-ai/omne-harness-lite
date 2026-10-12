# @omne-harness-lite/mcp-endpoint

[中文](README_ZH.md)

Pure data for authored MCP connection targets, timeouts, action snapshots and OAuth binding representations. Derive asset declarations from an endpoint and the action snapshot explicitly supplied by a caller.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                                 | Use                                                                |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `judgeMcpEndpoint`, `judgeMcpValue`        | Judge endpoint and related representations                         |
| `deriveMcpDeclarations`                    | Derive fixed settings and known per-action permission declarations |
| `actionEntryName`                          | Construct a projectable tool entry name                            |
| `mcpBodyContract`                          | Supply MCP rules to the asset model                                |
| `validate`, `schemaId`, `SCHEMA_DEF_NAMES` | Use the schema surface                                             |

## Judge a connection target

Endpoint names are supplied separately from the body. The example address is data and is never contacted.

```ts
import { judgeMcpEndpoint, judgeMcpValue, type McpEndpoint } from '@omne-harness-lite/mcp-endpoint'

const endpoint: McpEndpoint = {
  transport: { kind: 'streamable_http', url: 'https://mcp.example.invalid/api' },
  timeouts: { connect: 'PT5S', call: 'PT30S' },
  permissions: { execute: { default: 'ask' } },
}
console.log(judgeMcpEndpoint(endpoint, { capabilityName: 'repo' })) // { ok: true }
console.log(
  judgeMcpEndpoint({
    ...endpoint,
    transport: { kind: 'streamable_http', url: 'https://user:secret@example.invalid' },
  }),
) // { rejected: 'url_invalid' }
console.log(
  judgeMcpValue('OAuthBinding', {
    id: 'oauth_binding_1',
    state: 'granted',
    since: '2026-09-26T10:00:00Z',
  }),
) // { ok: true }
```

## Preserve snapshot knowledge and project names

A fetched empty action set is different from one that was never fetched. Fixed connection settings are available in both cases.

```ts
import {
  deriveMcpDeclarations,
  actionEntryName,
  judgeMcpValue,
  type McpEndpoint,
  type ActionSnapshot,
} from '@omne-harness-lite/mcp-endpoint'

const endpoint: McpEndpoint = {
  transport: { kind: 'stdio', command: 'repo-mcp', args: ['--readonly'] },
  timeouts: { connect: 'PT5S', call: 'PT30S' },
  permissions: { execute: { default: 'ask' } },
}
const actions: ActionSnapshot = {
  kind: 'fetched',
  fetchedAt: '2026-09-26T10:00:00Z',
  tools: [
    {
      name: 'read',
      description: 'Read a file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
    },
  ],
}
console.log(judgeMcpValue('ActionSnapshot', actions)) // { ok: true }
const known = deriveMcpDeclarations(endpoint, actions)
console.log(known.actionSnapshotKind) // fetched
console.log(known.declarations.map(item => item.item))
// ['connectionTarget', 'credential', 'connectTimeout', 'callTimeout', 'execute:read']
console.log(deriveMcpDeclarations(endpoint, { kind: 'not_fetched' }).actionSnapshotKind) // not_fetched
console.log(deriveMcpDeclarations(endpoint).actionSnapshotKind) // undefined
console.log(actionEntryName('repo', 'read')) // { ok: 'repo:read' }
console.log(actionEntryName('repo', 'has space')) // { notProjectable: true }
```

## Failures and boundaries

Judgments return `{ ok: true }` or `{ rejected }`; `malformed` includes an `M` diagnostic. Name projection returns `{ ok: name }` or `{ notProjectable: true }`. Action entry construction is forward-only: keep the endpoint and remote name as separate facts rather than decoding a concatenated name.

MCP descriptor extension fields stay JSON data. `inputSchema` is not compiled or repaired here; projection to executable Tool definitions needs Tool admission in a consumer. Snapshot knowledge is explicit: omitted, `not_fetched`, and `fetched` are distinct. Per-action permissions are derived only from a fetched snapshot; no snapshot does not mean an empty known action set.

The package does not start stdio processes, connect HTTP, discover or call tools, perform OAuth, resolve credentials, or refresh snapshots. OAuth bindings describe data, not authorized state transitions. URL checks validate syntax rather than endpoint trust or secrecy; credentials belong outside the endpoint body. Runtime transport, authorization and lifecycle belong to consumers.

The JSON Schema is available through `@omne-harness-lite/mcp-endpoint/schema`. See [source exports](src/index.ts), [tests](tests/) and [asset evaluation](../asset-evaluation/README.md).

See [behavior](SPEC.md) and [verification duties](verification/README.md).
