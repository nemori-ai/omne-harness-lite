import type { AttributeDeclaration, DeclarationResult } from '@omne-harness-lite/asset-model'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { ActionSnapshot, McpEndpoint, McpTransport } from './types.ts'

const root =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data'
const transportDomain = Object.freeze({
  kind: 'open' as const,
  schema: Object.freeze({
    $ref: `${root}/mcp-endpoint/v2/mcp-endpoint.schema.json#/$defs/McpTransport`,
  }),
})
const credentialDomain = Object.freeze({
  kind: 'open' as const,
  schema: Object.freeze({
    $ref: `${root}/asset-model/v2/asset-model.schema.json#/$defs/CredentialRef`,
  }),
})
const durationDomain = Object.freeze({
  kind: 'open' as const,
  schema: Object.freeze({
    allOf: Object.freeze([
      Object.freeze({
        $ref: `${root}/tool-definition/v2/tool-definition.schema.json#/$defs/Duration`,
      }),
      Object.freeze({
        not: Object.freeze({ pattern: '^PT(?:0+H)?(?:0+M)?(?:0+(?:[.]0+)?S)?(?![\\s\\S])' }),
      }),
    ]),
  }),
})
const executeDomain = Object.freeze({
  kind: 'enum' as const,
  values: Object.freeze(['forbid', 'auto', 'ask']),
})
function copyTransport(value: McpTransport): JsonObject {
  if (value.kind === 'streamable_http') return Object.freeze({ kind: value.kind, url: value.url })
  return Object.freeze({
    kind: value.kind,
    command: value.command,
    args: Object.freeze([...value.args]),
    ...(value.env === undefined
      ? {}
      : { env: Object.freeze(Object.fromEntries(Object.entries(value.env))) }),
  })
}
/** SC-4: this is the only producer of a per-action attribute key. */
function executeItem(remoteName: string): string {
  return 'execute:' + remoteName
}
export type McpDeclarations = DeclarationResult<'mcp'>

/** S14–S16: only typed authored data and the caller's actual snapshot are read. */
export function deriveMcpDeclarations(
  body: McpEndpoint,
  actionSnapshot?: ActionSnapshot,
): McpDeclarations {
  const declarations: AttributeDeclaration[] = [
    Object.freeze({
      item: 'connectionTarget',
      kind: 'setting',
      category: 'placement_identity',
      domain: transportDomain,
      default: copyTransport(body.transport),
    }),
    Object.freeze({
      item: 'credential',
      kind: 'setting',
      category: 'placement_identity',
      domain: credentialDomain,
    }),
    Object.freeze({
      item: 'connectTimeout',
      kind: 'setting',
      category: 'preference',
      domain: durationDomain,
      default: body.timeouts.connect,
    }),
    Object.freeze({
      item: 'callTimeout',
      kind: 'setting',
      category: 'preference',
      domain: durationDomain,
      default: body.timeouts.call,
    }),
  ]
  if (actionSnapshot?.kind === 'fetched') {
    for (const descriptor of actionSnapshot.tools)
      declarations.push(
        Object.freeze({
          item: executeItem(descriptor.name),
          kind: 'permission',
          domain: executeDomain,
          default: body.permissions.execute.default,
        }),
      )
  }
  return Object.freeze({
    declarations: Object.freeze(declarations),
    actionSnapshotKind: actionSnapshot?.kind,
  })
}
