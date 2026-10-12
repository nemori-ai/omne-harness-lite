import { describe, expect, it } from 'vitest'
import { readJsonStrict, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import fixture from './fixtures/normative.json' with { type: 'json' }
import {
  deriveMcpDeclarations,
  mcpBodyContract,
  type ActionSnapshot,
  type McpEndpoint,
} from '../src/index.ts'

const body: McpEndpoint = {
  transport: { kind: 'streamable_http', url: 'https://mcp.linear.app/mcp' },
  timeouts: { connect: 'PT15S', call: 'PT2M' },
  permissions: { execute: { default: 'ask' } },
}
const fetched: ActionSnapshot = {
  kind: 'fetched',
  fetchedAt: '2026-09-23T08:00:00Z',
  tools: [
    { name: 'list_issues', inputSchema: {} },
    { name: 'save_issue', inputSchema: {} },
  ],
}
function json(value: unknown): JsonValue {
  const parsed = readJsonStrict(JSON.stringify(value))
  if ('failed' in parsed) throw new Error('invalid test input')
  return parsed.ok
}

describe('S14–S16 explicit-input declaration rule', () => {
  it('reproduces normative section 7.1 six declarations value for value', () => {
    const normative = fixture.cases
      .filter(row => row.id.startsWith('block-8-declaration-'))
      .map(row => row.value)
    expect(deriveMcpDeclarations(body, fetched).declarations).toEqual(normative)
    expect(mcpBodyContract.deriveDeclarations(json(body), json(fetched))).toEqual({
      declarations: normative,
      actionSnapshotKind: 'fetched',
    })
  })
  const paths = [
    { label: 'not provided', snapshot: undefined, kind: undefined, count: 4 },
    {
      label: 'explicitly unknown',
      snapshot: { kind: 'not_fetched' } as const,
      kind: 'not_fetched',
      count: 4,
    },
    {
      label: 'fetched empty',
      snapshot: { kind: 'fetched', fetchedAt: '2026-09-23T08:00:00Z', tools: [] } as const,
      kind: 'fetched',
      count: 4,
    },
    { label: 'fetched nonempty', snapshot: fetched, kind: 'fetched', count: 6 },
  ]
  for (const row of paths) {
    it(`preserves action knowledge provenance: ${row.label}`, () => {
      const direct = deriveMcpDeclarations(body, row.snapshot)
      const viaPort = mcpBodyContract.deriveDeclarations(
        json(body),
        row.snapshot === undefined ? undefined : json(row.snapshot),
      )
      expect('declarations' in viaPort).toBe(true)
      expect(Object.hasOwn(direct, 'actionSnapshotKind')).toBe(true)
      expect(Object.hasOwn(viaPort, 'actionSnapshotKind')).toBe(true)
      expect(direct.actionSnapshotKind).toBe(row.kind)
      expect(direct.declarations).toHaveLength(row.count)
      expect(viaPort).toEqual(direct)
      expect(direct.declarations.slice(0, 4).map(item => item.item)).toEqual([
        'connectionTarget',
        'credential',
        'connectTimeout',
        'callTimeout',
      ])
    })
  }
  it('retains action order and exact raw names even when the bridge cannot project them', () => {
    const snapshot: ActionSnapshot = {
      kind: 'fetched',
      fetchedAt: fetched.fetchedAt,
      tools: [
        { name: 'repo/admin', inputSchema: {} },
        { name: ' _Private ', inputSchema: {} },
        { name: 'list__all.v2', inputSchema: {} },
      ],
    }
    expect(
      deriveMcpDeclarations(body, snapshot)
        .declarations.slice(4)
        .map(item => item.item),
    ).toEqual(['execute:repo/admin', 'execute: _Private ', 'execute:list__all.v2'])
  })
  it('makes action changes affect only the corresponding permission declarations', () => {
    const first = deriveMcpDeclarations(body, fetched).declarations
    const nextSnapshot: ActionSnapshot = {
      kind: 'fetched',
      fetchedAt: fetched.fetchedAt,
      tools: [...fetched.tools, { name: 'delete_issue', inputSchema: {} }],
    }
    const next = deriveMcpDeclarations(body, nextSnapshot).declarations
    expect(next.slice(0, 6)).toEqual(first)
    expect(next[6]).toEqual({
      item: 'execute:delete_issue',
      kind: 'permission',
      domain: { kind: 'enum', values: ['forbid', 'auto', 'ask'] },
      default: 'ask',
    })
    expect(deriveMcpDeclarations(body, { kind: 'not_fetched' }).declarations).toEqual(
      first.slice(0, 4),
    )
    expect(first).toHaveLength(6)
  })
  it('does not produce reserved items or a default credential', () => {
    const result = deriveMcpDeclarations(body, fetched)
    expect(
      result.declarations.some(item =>
        ['disabled', 'usableBy', 'use', 'execute'].includes(item.item),
      ),
    ).toBe(false)
    const credential = result.declarations.find(item => item.item === 'credential')
    expect(credential).toBeDefined()
    if (credential === undefined) throw new Error('missing credential')
    expect(Object.hasOwn(credential, 'default')).toBe(false)
    for (const declaration of result.declarations)
      if (declaration.kind === 'setting') expect(declaration.category).not.toBe('governance')
  })
  it('owns immutable transport defaults without freezing or retaining caller containers', () => {
    const original = {
      transport: { kind: 'stdio' as const, command: 'srv', args: ['$HOME/x'], env: { A: 'a' } },
      timeouts: { connect: 'PT1S', call: 'PT2S' },
      permissions: { execute: { default: 'auto' as const } },
    }
    const result = deriveMcpDeclarations(original)
    original.transport.args.push('later')
    original.transport.env.A = 'changed'
    original.transport.command = 'new'
    expect(result.declarations[0]).toMatchObject({
      default: { kind: 'stdio', command: 'srv', args: ['$HOME/x'], env: { A: 'a' } },
    })
    expect(Object.isFrozen(original.transport)).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.declarations)).toBe(true)
    const connection: AttributeDeclaration | undefined = result.declarations[0]
    if (connection === undefined || connection.kind !== 'setting')
      throw new Error('missing setting')
    expect(Object.isFrozen(connection.default)).toBe(true)
  })
  it('preserves absent environment versus an explicitly empty table', () => {
    const absent: McpEndpoint = { ...body, transport: { kind: 'stdio', command: 's', args: [] } }
    const empty: McpEndpoint = {
      ...absent,
      transport: { kind: 'stdio', command: 's', args: [], env: {} },
    }
    const first = deriveMcpDeclarations(absent).declarations[0]
    const second = deriveMcpDeclarations(empty).declarations[0]
    expect(first).toMatchObject({ default: { kind: 'stdio', command: 's', args: [] } })
    expect(second).toMatchObject({ default: { kind: 'stdio', command: 's', args: [], env: {} } })
    expect(first).not.toEqual(second)
  })
  it('uses port violations for invalid derive input without repairing it', () => {
    expect(() =>
      mcpBodyContract.deriveDeclarations(json({ ...body, credential: 'token' })),
    ).toThrow(TypeError)
    expect(() =>
      mcpBodyContract.deriveDeclarations(json(body), json({ kind: 'fetched', tools: [] })),
    ).toThrow(TypeError)
    expect(() =>
      mcpBodyContract.deriveDeclarations(json(body), json({ kind: 'not_fetched', tools: [] })),
    ).toThrow(TypeError)
  })
  it('exposes only a category-specific body port with no composition dependencies', () => {
    expect(mcpBodyContract.category).toBe('mcp')
    expect(mcpBodyContract.references(json(body))).toEqual([])
    expect(mcpBodyContract.judge(body, { capabilityName: 'git.hub' })).toEqual({
      rejected: 'name_not_projectable',
    })
    expect(() => mcpBodyContract.references(null)).toThrow(TypeError)
    expect(Object.isFrozen(mcpBodyContract)).toBe(true)
  })
})
