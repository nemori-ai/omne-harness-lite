import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import {
  createAssetModelJudge,
  attributeDeclarationsOf,
  schemaId,
  type AttributeDeclaration,
  type BodyContracts,
  type DeclarationResult,
} from '../src/index.ts'
import { isObject } from '../src/judge.ts'
import { bodies, json } from './ports.ts'

const content = {
  category: 'mcp',
  body: {
    transport: { kind: 'stdio', command: 'node', args: ['repo-db'] },
    timeouts: { connect: 'PT5S', call: 'PT10S' },
    permissions: { execute: { default: 'auto' } },
  },
} as const
const resource = bodies.mcp.schema
const toolResource = bodies.tool.schema
if (!isObject(resource) || typeof resource.$id !== 'string')
  throw new Error('expected frozen MCP resource')
if (!isObject(toolResource) || typeof toolResource.$id !== 'string')
  throw new Error('expected frozen tool resource')
// The standalone declaration spelling is normative MCP examples 7.1, including
// an absolute Duration ref. Copying the body's relative ref would lose its base.
const durationSchema = {
  allOf: [
    { $ref: `${toolResource.$id}#/$defs/Duration` },
    { not: { pattern: '^PT(?:0+H)?(?:0+M)?(?:0+(?:[.]0+)?S)?(?![\\s\\S])' } },
  ],
}
// Protocol fixture sourced from MCP S13/S14/examples 7.1; not the real body implementation.
const fixed: readonly AttributeDeclaration[] = [
  {
    item: 'connectionTarget',
    kind: 'setting',
    category: 'placement_identity',
    domain: { kind: 'open', schema: { $ref: `${resource.$id}#/$defs/McpTransport` } },
    default: content.body.transport,
  },
  {
    item: 'credential',
    kind: 'setting',
    category: 'placement_identity',
    domain: { kind: 'open', schema: { $ref: `${schemaId}#/$defs/CredentialRef` } },
  },
  ...(['connectTimeout', 'callTimeout'] as const).map(item => ({
    item,
    kind: 'setting' as const,
    category: 'preference' as const,
    domain: {
      kind: 'open' as const,
      schema: durationSchema,
    },
    default: item === 'connectTimeout' ? content.body.timeouts.connect : content.body.timeouts.call,
  })),
]
const notFetched = json('{"kind":"not_fetched"}')
const fetchedEmpty = json('{"kind":"fetched","fetchedAt":"2026-09-26T00:00:00Z","tools":[]}')
const fetchedNonempty = json(
  '{"kind":"fetched","fetchedAt":"2026-09-26T00:00:00Z","tools":[{"name":"lookup","inputSchema":{}},{"name":"write","inputSchema":{}}]}',
)
function snapshotKind(value: JsonValue | undefined): 'fetched' | 'not_fetched' | undefined {
  if (value === undefined) return undefined
  if (!isObject(value) || (value.kind !== 'fetched' && value.kind !== 'not_fetched'))
    throw new Error('expected protocol fixture snapshot')
  return value.kind
}
function protocolResult(snapshot: JsonValue | undefined): DeclarationResult<'mcp'> {
  const marker = snapshotKind(snapshot)
  const actions: AttributeDeclaration[] = []
  if (marker === 'fetched' && isObject(snapshot) && Array.isArray(snapshot.tools))
    for (const tool of snapshot.tools) {
      if (!isObject(tool) || typeof tool.name !== 'string') throw new Error('test action name')
      actions.push({
        item: `execute:${tool.name}`,
        kind: 'permission',
        domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
        default: content.body.permissions.execute.default,
      })
    }
  const result = {
    declarations: [...fixed, ...actions],
    actionSnapshotKind: marker,
    toJSON() {
      throw new Error('the process-local declaration result must not be JSON serialized')
    },
  }
  return result
}
function invalidMcpResult(raw: unknown, snapshot?: JsonValue): unknown {
  const invalid = { ...bodies, mcp: { ...bodies.mcp, deriveDeclarations: () => raw } }
  return Reflect.apply(attributeDeclarationsOf, undefined, [
    content,
    Reflect.apply(createAssetModelJudge, undefined, [invalid]),
    snapshot,
  ])
}

describe('MCP partial knowledge across the actual AM port and wrapper', () => {
  it.each([
    ['omitted', undefined, undefined, []],
    ['not_fetched', notFetched, 'not_fetched', []],
    ['fetched empty', fetchedEmpty, 'fetched', []],
    ['fetched nonempty', fetchedNonempty, 'fetched', ['execute:lookup', 'execute:write']],
  ] as const)('preserves %s independently of array length', (_name, snapshot, marker, actions) => {
    let received: unknown = 'not called'
    const ports: BodyContracts = {
      ...bodies,
      mcp: {
        ...bodies.mcp,
        deriveDeclarations: (body, input) => {
          expect(body).toBe(content.body)
          received = input
          return protocolResult(input)
        },
      },
    }
    const portsJudge = createAssetModelJudge(ports)

    const result =
      snapshot === undefined
        ? attributeDeclarationsOf(content, portsJudge)
        : attributeDeclarationsOf(content, portsJudge, snapshot)
    expect(received).toBe(snapshot)
    expect(Object.hasOwn(result, 'actionSnapshotKind')).toBe(true)
    expect(result.actionSnapshotKind).toBe(marker)
    expect(result.declarations.map(declaration => declaration.item)).toEqual([
      'connectionTarget',
      'credential',
      'connectTimeout',
      'callTimeout',
      ...actions,
      'disabled',
      'usableBy',
    ])
    expect(result.declarations.slice(0, 4)).toEqual(fixed)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.declarations)).toBe(true)
  })
  it('preserves an own undefined marker for an explicitly undefined optional argument too', () => {
    const ports: BodyContracts = {
      ...bodies,
      mcp: { ...bodies.mcp, deriveDeclarations: (_body, snapshot) => protocolResult(snapshot) },
    }
    const portsJudge = createAssetModelJudge(ports)

    const result = attributeDeclarationsOf(content, portsJudge, undefined)
    expect(Object.hasOwn(result, 'actionSnapshotKind')).toBe(true)
    expect(result.actionSnapshotKind).toBeUndefined()
    expect(result.declarations).toHaveLength(6)
  })
})

describe('port defects cannot forge partial MCP knowledge', () => {
  it('rejects missing and inherited-only markers instead of supplying undefined', () => {
    expect(() => invalidMcpResult({ declarations: fixed })).toThrow(TypeError)
    const inherited = Object.create({ actionSnapshotKind: undefined })
    Object.defineProperty(inherited, 'declarations', { value: fixed, enumerable: true })
    expect(() => invalidMcpResult(inherited)).toThrow(TypeError)
  })
  it.each([null, true, 1, '', 'unknown', {}, []])('rejects an invalid marker %s', marker => {
    expect(() => invalidMcpResult({ declarations: fixed, actionSnapshotKind: marker })).toThrow(
      TypeError,
    )
  })
  it.each([
    [undefined, 'not_fetched'],
    [undefined, 'fetched'],
    [notFetched, undefined],
    [notFetched, 'fetched'],
    [fetchedEmpty, undefined],
    [fetchedEmpty, 'not_fetched'],
    [fetchedNonempty, undefined],
    [fetchedNonempty, 'not_fetched'],
  ] as const)('rejects a marker inconsistent with the actual argument', (snapshot, marker) =>
    expect(() =>
      invalidMcpResult({ declarations: fixed, actionSnapshotKind: marker }, snapshot),
    ).toThrow(TypeError),
  )
  it.each([{ underivable: 'mcp' }, { underivable: 'mcp', actionSnapshotKind: undefined }])(
    'rejects whole-underivable MCP results',
    result => expect(() => invalidMcpResult(result)).toThrow(TypeError),
  )
  it.each(['tool', 'loop_extension', 'skill', 'slash_command', 'connector'] as const)(
    'rejects an own undefined marker on non-MCP %s results',
    category => {
      const raw = { declarations: [], actionSnapshotKind: undefined }
      const invalid = {
        ...bodies,
        [category]: { ...bodies[category], deriveDeclarations: () => raw },
      }
      const nonMcpContent =
        category === 'tool'
          ? { category, definition: {} }
          : category === 'loop_extension'
            ? { category, extension: {} }
            : { category, body: {} }
      expect(() =>
        Reflect.apply(attributeDeclarationsOf, undefined, [
          nonMcpContent,
          Reflect.apply(createAssetModelJudge, undefined, [invalid]),
        ]),
      ).toThrow(TypeError)
    },
  )
  it('also rejects a non-MCP underivable result carrying the marker', () => {
    const invalid = {
      ...bodies,
      connector: {
        ...bodies.connector,
        deriveDeclarations: () => ({ underivable: 'connector', actionSnapshotKind: undefined }),
      },
    }
    expect(() =>
      Reflect.apply(attributeDeclarationsOf, undefined, [
        { category: 'connector', body: {} },
        Reflect.apply(createAssetModelJudge, undefined, [invalid]),
      ]),
    ).toThrow(TypeError)
  })
  it.each([null, 'not_fetched', {}, { kind: 'other' }, { kind: undefined }])(
    'does not invent a discriminant for an invalid explicit snapshot',
    snapshot => {
      expect(() =>
        Reflect.apply(attributeDeclarationsOf, undefined, [
          content,
          Reflect.apply(createAssetModelJudge, undefined, [bodies]),
          snapshot,
        ]),
      ).toThrow(TypeError)
    },
  )
  it('propagates the body implementation exception unchanged', () => {
    const defect = new Error('derive defect')
    const ports: BodyContracts = {
      ...bodies,
      mcp: {
        ...bodies.mcp,
        deriveDeclarations() {
          throw defect
        },
      },
    }
    const portsJudge = createAssetModelJudge(ports)

    expect(() => attributeDeclarationsOf(content, portsJudge)).toThrow(defect)
  })
})
