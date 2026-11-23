import { describe, expect, it } from 'vitest'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const operations = pluginProtocol.operations
const manifest = JSON.stringify({
  schema: 1,
  name: 'notes',
  summary: 'Notes',
  client: { members: [] },
})
const file = { path: 'client/index.js', digest: 'ab12', bytes: 120 }
const plugin = { name: 'notes', version: '0123456789abcdef', manifest, files: [file] }
const read = { tenant, name: 'notes', version: '0123456789abcdef', path: file.path }

describe('the bodies of plugin/v1 go to the wire and back unchanged', () => {
  it.each([
    ['list-wanted', { tenant, side: 'client' }],
    ['list-wanted', { tenant, side: 'server' }],
    ['read-file', { ...read, offset: 0, limit: 65536 }],
    ['report-loaded', { tenant, client: 'desktop-1', plugins: [] }],
    [
      'report-loaded',
      {
        tenant,
        client: 'desktop-1',
        plugins: [
          { name: 'notes', version: 'v1', state: 'loaded', reason: null },
          { name: 'board', version: 'v2', state: 'failed', reason: 'module threw' },
          { name: 'clock', version: 'v3', state: 'held', reason: null },
        ],
      },
    ],
  ] as const)('%s %j', (name, body) => {
    expectRoundTrip(operations[name].body, body)
  })

  it.each([
    ['list-wanted', { tenant, side: 'both' }],
    ['list-wanted', { side: 'client' }],
    ['read-file', { ...read, offset: -1, limit: 10 }],
    ['read-file', { ...read, offset: 0, limit: '10' }],
    ['read-file', { ...read, limit: 10 }],
    [
      'report-loaded',
      {
        tenant,
        client: 'desktop-1',
        plugins: [{ name: 'notes', version: 'v1', state: 'loading', reason: null }],
      },
    ],
    [
      'report-loaded',
      { tenant, client: 'desktop-1', plugins: [{ name: 'notes', version: 'v1', state: 'loaded' }] },
    ],
    ['report-loaded', { tenant, plugins: [] }],
  ] as const)('%s refuses %j', (name, body) => {
    expect(readSample(operations[name].body, body)).toEqual({ ok: false })
  })
})

describe('the outcomes of plugin/v1 go to the wire and back unchanged', () => {
  it.each([
    ['list-wanted', 'succeeded', { plugins: [] }],
    ['list-wanted', 'succeeded', { plugins: [plugin] }],
    ['read-file', 'succeeded', { part: 'aGVsbG8=', next: 5, bytes: 120 }],
    ['read-file', 'succeeded', { part: '', next: null, bytes: 0 }],
    ['read-file', 'not-found', { reason: 'plugin' }],
    ['read-file', 'not-found', { reason: 'file' }],
    ['read-file', 'limited', {}],
    ['report-loaded', 'succeeded', {}],
  ] as const)('%s %s %j', (name, outcome, body) => {
    const outcomes = operations[name].outcomes as Record<string, unknown>
    expectRoundTrip(outcomes[outcome] as never, body)
  })

  it.each([
    ['list-wanted', 'succeeded', { plugins: [{ ...plugin, manifest: { schema: 1 } }] }],
    ['list-wanted', 'succeeded', { plugins: [{ ...plugin, files: [{ ...file, bytes: '120' }] }] }],
    ['read-file', 'succeeded', { part: 'not base64!', next: null, bytes: 0 }],
    ['read-file', 'not-found', { reason: 'version' }],
    ['report-loaded', 'succeeded', { plugins: [] }],
  ] as const)('%s %s refuses %j', (name, outcome, body) => {
    const outcomes = operations[name].outcomes as Record<string, unknown>
    expect(readSample(outcomes[outcome] as never, body)).toEqual({ ok: false })
  })

  it('a part is bytes in the process and base64 on the wire', () => {
    const body = expectRoundTrip(operations['read-file'].outcomes.succeeded, {
      part: 'aGVsbG8=',
      next: null,
      bytes: 5,
    }) as { part: Uint8Array }
    expect(new TextDecoder().decode(body.part)).toBe('hello')
  })

  it('observe-wanted opens on one side of a tenant and says only that it may have changed', () => {
    const observation = pluginProtocol.observations['observe-wanted']
    expectRoundTrip(observation.open, { tenant, side: 'client' })
    expectRoundTrip(observation.frame, { kind: 'changed' })
    expect(readSample(observation.frame, { kind: 'changed', plugins: [] })).toEqual({ ok: false })
    expect(readSample(observation.open, { tenant })).toEqual({ ok: false })
  })
})
