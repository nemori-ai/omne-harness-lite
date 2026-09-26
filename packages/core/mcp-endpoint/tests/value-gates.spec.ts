import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import offerSchema from '@omne-harness-lite/offer-expiry/schema' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import mcpSchema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import fixture from './fixtures/normative.json' with { type: 'json' }
import {
  actionEntryName,
  judgeMcpEndpoint,
  judgeMcpValue,
  SCHEMA_DEF_NAMES,
  validate,
  type SchemaDefName,
} from '../src/index.ts'

const fixedRuntime = createSchemaRuntime([
  contentSchema,
  identitySchema,
  offerSchema,
  assetSchema,
  toolSchema,
  mcpSchema,
])
function ownDefinition(name: string): name is SchemaDefName {
  return SCHEMA_DEF_NAMES.some(candidate => candidate === name)
}
const ownUrl = new URL('../schema/mcp-endpoint.schema.json', import.meta.url)
const authoritativeUrl = new URL(
  '../../../../.meta_harness/design/spec/data/mcp-endpoint/v2/mcp-endpoint.schema.json',
  import.meta.url,
)

describe('frozen normative examples', () => {
  it('preserves the adopted frozen Schema byte for byte', () => {
    expect(readFileSync(ownUrl)).toEqual(readFileSync(authoritativeUrl))
  })
  it('tracks the exact normative artifact supplying the oracle', () => {
    const bytes = readFileSync(new URL(`../../../../${fixture.source}`, import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sourceSha256)
    expect(fixture.cases).toHaveLength(116)
  })
  for (const row of fixture.cases) {
    it(`${row.id} · ${row.definition}`, () => {
      if (ownDefinition(row.definition)) {
        expect(validate(row.definition, row.value).valid).toBe(row.valid)
        expect(judgeMcpValue(row.definition, row.value)).toEqual(row.judgment)
      } else {
        const validator = fixedRuntime.compile({
          $ref: `${assetSchema.$id}#/$defs/${row.definition}`,
        })
        const parsed = readJsonStrict(JSON.stringify(row.value))
        if ('failed' in parsed) throw new Error('invalid fixture JSON')
        expect(validator.validate(parsed.ok)).toBe(row.valid)
      }
    })
  }
})

const stdio = {
  transport: { kind: 'stdio', command: 'srv', args: [] },
  timeouts: { connect: 'PT1S', call: 'PT1S' },
  permissions: { execute: { default: 'ask' } },
}
const http = { ...stdio, transport: { kind: 'streamable_http', url: 'https://x/mcp' } }

describe('S20 ordered boundary facts', () => {
  const priorities = [
    {
      definition: 'McpEndpoint',
      value: { ...stdio, transport: { kind: 'sse', url: 'https://x/sse' }, credential: 'tok' },
      judgment: { rejected: 'transport_unknown' },
    },
    {
      definition: 'McpEndpoint',
      value: { ...stdio, transport: { ...stdio.transport, command: '' }, credential: 'tok' },
      judgment: { rejected: 'command_empty' },
    },
    {
      definition: 'McpEndpoint',
      value: {
        ...http,
        transport: { kind: 'streamable_http', url: 'HTTPS://u:p@x/' },
        timeouts: { connect: 'PT1S', call: 'PT0S' },
      },
      judgment: { rejected: 'url_invalid' },
    },
    {
      definition: 'McpEndpoint',
      value: {
        ...stdio,
        transport: { ...stdio.transport, command: ' ' },
        timeouts: { connect: 'PT1S', call: 'PT0S' },
      },
      judgment: { rejected: 'command_empty' },
    },
    {
      definition: 'ActionSnapshot',
      value: { kind: 'fetched', tools: [{ name: 'a' }] },
      judgment: { rejected: 'snapshot_missing_time' },
    },
    {
      definition: 'McpEndpoint',
      value: { ...stdio, transport: { ...stdio.transport, command: '' } },
      context: { capabilityName: 'git.hub' },
      judgment: { rejected: 'command_empty' },
    },
    {
      definition: 'McpEndpoint',
      value: stdio,
      context: { capabilityName: 'git.hub' },
      judgment: { rejected: 'name_not_projectable' },
    },
    {
      definition: 'McpEndpoint',
      value: { ...stdio, transport: { command: 'srv', args: [] }, credential: 'tok' },
      judgment: { rejected: 'malformed', malformed: 'M2' },
    },
    {
      definition: 'McpActionName',
      value: 'github:list__all.v2',
      judgment: { rejected: 'name_reserved_sequence' },
    },
  ]
  for (const [index, row] of priorities.entries()) {
    it(`normative section 8 row ${index + 1}`, () => {
      if (!ownDefinition(row.definition)) throw new Error('unknown fixture definition')
      expect(judgeMcpValue(row.definition, row.value, row.context)).toEqual(row.judgment)
    })
  }
  it('uses M1 before missing time when a descriptor is not an object', () => {
    expect(judgeMcpValue('ActionSnapshot', { kind: 'fetched', tools: [null] })).toEqual({
      rejected: 'malformed',
      malformed: 'M1',
    })
  })
  it('separates frozen timestamp shape from actual calendar admission', () => {
    const value = { kind: 'fetched', fetchedAt: '2026-02-30T00:00:00Z', tools: [] }
    expect(validate('ActionSnapshot', value).valid).toBe(true)
    expect(judgeMcpValue('ActionSnapshot', value)).toEqual({
      rejected: 'malformed',
      malformed: 'M7',
    })
  })
  it('does not supply defaults for any body field', () => {
    expect(judgeMcpEndpoint({ transport: stdio.transport })).toEqual({
      rejected: 'malformed',
      malformed: 'M3',
    })
    expect(judgeMcpEndpoint({ ...stdio, timeouts: {} })).toEqual({
      rejected: 'malformed',
      malformed: 'M3',
    })
  })
})

describe('owned lexical definitions and literal input preservation', () => {
  it('uses the shared Instant owner for accepted four-digit years and offset spellings', () => {
    for (const since of [
      '0000-02-29T00:00:00Z',
      '0001-01-01T00:00:00Z',
      '0099-12-31T23:59:59.123456z',
      '2026-01-01t01:00:00+01:00',
    ]) {
      expect(judgeMcpValue('OAuthBinding', { id: 'binding', state: 'pending', since })).toEqual({
        ok: true,
      })
    }
    for (const since of ['0100-02-29T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:60Z']) {
      expect(judgeMcpValue('OAuthBinding', { id: 'binding', state: 'pending', since })).toEqual({
        rejected: 'malformed',
        malformed: 'M7',
      })
    }
  })
  it('keeps all zero duration spellings distinct from strictly positive durations', () => {
    for (const connect of ['PT0S', 'PT00.000S', 'PT0H0M', 'PT00H000M0.0S']) {
      expect(judgeMcpEndpoint({ ...stdio, timeouts: { connect, call: 'PT1S' } })).toEqual({
        rejected: 'malformed',
        malformed: 'M8',
      })
    }
    for (const connect of ['PT0.00000001S', 'PT0H1M', 'PT0001S']) {
      expect(judgeMcpEndpoint({ ...stdio, timeouts: { connect, call: 'PT1S' } })).toEqual({
        ok: true,
      })
    }
  })
  it('reserves the three-character model-name suffix at registration', () => {
    expect(judgeMcpValue('McpEndpointName', 'a'.repeat(125))).toEqual({ ok: true })
    expect(judgeMcpValue('McpEndpointName', 'a'.repeat(126))).toEqual({
      rejected: 'name_not_projectable',
    })
    expect(actionEntryName('a'.repeat(125), 'x')).toEqual({ ok: `${'a'.repeat(125)}:x` })
    expect(actionEntryName('a'.repeat(125), 'xx')).toEqual({ notProjectable: true })
  })
  it('retains the admitted collision without inventing a decoder', () => {
    expect(actionEntryName('a', 'b:c')).toEqual({ ok: 'a:b:c' })
    expect(actionEntryName('a:b', 'c')).toEqual({ ok: 'a:b:c' })
    for (const raw of ['_private', 'list__all', 'repo/admin', 'issues.list', 'create issue', ''])
      expect(actionEntryName('github', raw)).toEqual({ notProjectable: true })
  })
  it('does not rewrite explicit argv, environment, URL, or remote names', () => {
    const body = {
      ...stdio,
      transport: {
        kind: 'stdio',
        command: '/usr/local/bin/mcp server',
        args: ['$HOME/x', ''],
        env: {},
      },
    }
    const original = JSON.stringify(body)
    expect(judgeMcpEndpoint(body)).toEqual({ ok: true })
    expect(JSON.stringify(body)).toBe(original)
    expect(judgeMcpValue('McpToolDescriptor', { name: ' repo/admin ', inputSchema: {} })).toEqual({
      ok: true,
    })
  })
  it('keeps open descriptors and never compiles their inputSchema', () => {
    const parsed = readJsonStrict(
      '{"name":"grep","inputSchema":{"$ref":"https://remote.invalid/schema","pattern":"["},"execution":{"taskSupport":"required"},"n":9007199254740993,"tiny":1e-400}',
    )
    if ('failed' in parsed) throw new Error('invalid fixture')
    expect(judgeMcpValue('McpToolDescriptor', parsed.ok)).toEqual({ ok: true })
    expect(writeJsonLossless(parsed.ok)).toContain('9007199254740993')
    expect(writeJsonLossless(parsed.ok)).toContain('1e-400')
    expect(validate('McpToolDescriptor', parsed.ok).valid).toBe(true)
  })
  it('rejects non-JSON object properties instead of dropping them', () => {
    expect(
      judgeMcpValue('McpToolDescriptor', { name: 'run', inputSchema: {}, extra: undefined }),
    ).toEqual({ rejected: 'malformed', malformed: 'M5' })
    expect(validate('McpToolDescriptor', { name: 'run', inputSchema: {}, extra: NaN }).valid).toBe(
      false,
    )
    const cyclic: Record<string, unknown> = { name: 'run', inputSchema: {} }
    cyclic.self = cyclic
    expect(judgeMcpValue('McpToolDescriptor', cyclic)).toEqual({
      rejected: 'malformed',
      malformed: 'M5',
    })
  })
  it('checks full URLs before WHATWG normalization and retains HTTP admission', () => {
    for (const url of [
      'HTTPS://x/',
      'https:///x',
      'https://u@x/',
      'https://x/#',
      'https://x/\n',
      'https://x/\u0085',
      'https://x\\evil/',
    ])
      expect(judgeMcpValue('McpTransport', { kind: 'streamable_http', url })).toEqual({
        rejected: 'url_invalid',
      })
    for (const url of ['http://127.0.0.1:1/mcp', 'http://[::1]/?secret=literal'])
      expect(judgeMcpValue('McpTransport', { kind: 'streamable_http', url })).toEqual({ ok: true })
  })
  it('checks NUL and exact identifier boundary whitespace without trimming', () => {
    for (const env of [{ '': 'v' }, { 'A=B': 'v' }, { 'A\0B': 'v' }, { A: 'v\0' }])
      expect(
        judgeMcpValue('McpTransport', { kind: 'stdio', command: 'srv', args: [], env }),
      ).toEqual({ rejected: 'malformed', malformed: 'M9' })
    expect(
      judgeMcpValue('OAuthBinding', { id: ' a', state: 'granted', since: '2026-01-01T00:00:00Z' }),
    ).toEqual({ rejected: 'malformed', malformed: 'M12' })
    expect(
      judgeMcpValue('OAuthBinding', { id: 'a b', state: 'granted', since: '2026-01-01T00:00:00Z' }),
    ).toEqual({ ok: true })
  })
})
