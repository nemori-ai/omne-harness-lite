// Fast: the cold index of macOS domains on a real state directory. A listing is complete or
// `unavailable`: a marker that cannot be read is never skipped. Runs on every platform.
import { chmod, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import {
  createDomainIndex,
  domainReference,
  parseMarker,
  readDomainReference,
} from '../../src/macos-execution/domain-index.ts'

const scope = { ref: 'scope-a' } as never
const other = { ref: 'scope-b' } as never
const boot = 'B6C8C544-54F8-4C43-967D-A47FD7BEBA7D'
const keyA = '0d6f2a4e-3c1b-4b7e-9a51-6f0e2d1c9b10'
const keyB = '7a1e5c3d-2b4f-4e6a-8c9d-0f1e2d3c4b5a'
const resource = (key: string, of = scope): ManagedResource => ({
  key,
  provider: 'host',
  reference: domainReference(key, boot, of),
})
const coordinate = { bootId: boot, sessions: [{ sid: 400, start: '1793777328.075378' }] }

let state = ''
beforeEach(async () => {
  state = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-domains-')))
})
afterEach(async () => {
  await chmod(join(state, 'macos-domains'), 0o700).catch(() => undefined)
  await rm(state, { recursive: true, force: true })
})

describe('references', () => {
  it('reads back the key and boot it wrote', () => {
    expect(readDomainReference(domainReference(keyA, boot, scope))).toEqual({
      key: keyA,
      bootId: boot,
    })
  })

  it('refuses a reference without a key, with a key that is no uuid, or of another kind', () => {
    const entries = (key: string | undefined) => ({
      kind: 'object' as const,
      entries: [
        ...(key === undefined
          ? []
          : [{ key: 'macosDomain', value: { kind: 'string' as const, value: key } }]),
        { key: 'bootId', value: { kind: 'string' as const, value: boot } },
      ],
    })
    expect(readDomainReference(entries(undefined))).toBeUndefined()
    expect(readDomainReference(entries('../x'))).toBeUndefined()
    expect(
      readDomainReference({
        kind: 'object',
        entries: [{ key: 'macosDomain', value: { kind: 'string', value: keyA } }],
      }),
    ).toBeUndefined()
    expect(readDomainReference({ kind: 'string', value: keyA } as never)).toBeUndefined()
  })
})

describe('markers', () => {
  it('records, reads the coordinate, lists by scope and forgets', async () => {
    const index = createDomainIndex(state)
    expect(await index.list(scope)).toEqual([])
    expect(await index.record(resource(keyA), scope, coordinate)).toBe(true)
    expect(await index.record(resource(keyB, other), other, coordinate)).toBe(true)
    expect(await index.coordinate(keyA)).toEqual(coordinate)
    expect(await index.list(scope)).toEqual([resource(keyA)])
    expect(await index.list(other)).toEqual([resource(keyB, other)])
    // A second record replaces the first: a terminal adds the shell's session.
    const both = {
      bootId: boot,
      sessions: [...coordinate.sessions, { sid: 401, start: '1.000001' }],
    }
    expect(await index.record(resource(keyA), scope, both)).toBe(true)
    expect(await index.coordinate(keyA)).toEqual(both)
    expect(await index.forget(keyA)).toBe(true)
    expect(await index.coordinate(keyA)).toBe('absent')
    expect(await index.list(scope)).toEqual([])
    expect(await readdir(join(state, 'macos-domains'))).toEqual([`${keyB}.json`])
  })

  it('a new index on the same directory lists what an old one recorded', async () => {
    await createDomainIndex(state).record(resource(keyA), scope, coordinate)
    expect(await createDomainIndex(state).list(scope)).toEqual([resource(keyA)])
  })

  it('answers unavailable for an unreadable marker or a foreign file, and never lists a part', async () => {
    const index = createDomainIndex(state)
    await index.record(resource(keyA), scope, coordinate)
    await writeFile(join(state, 'macos-domains', `${keyB}.json`), '{"resource":')
    expect(await index.list(scope)).toBe('unavailable')
    expect(await index.coordinate(keyB)).toBe('unreadable')
    await rm(join(state, 'macos-domains', `${keyB}.json`))
    await writeFile(join(state, 'macos-domains', 'notes.txt'), '')
    expect(await index.list(scope)).toBe('unavailable')
  })

  it('skips staged files and refuses keys that are no uuid', async () => {
    const index = createDomainIndex(state)
    await mkdir(join(state, 'macos-domains'))
    await writeFile(join(state, 'macos-domains', `.${keyA}.1.tmp`), 'partial')
    expect(await index.list(scope)).toEqual([])
    expect(await index.record(resource('../escape'), scope, coordinate)).toBe(false)
    expect(await index.coordinate('../escape')).toBe('absent')
  })

  // Root reads and writes a directory whatever its mode, so the refusal cannot be staged there.
  it.skipIf(process.getuid?.() === 0)(
    'answers false or unavailable when the directory cannot be written or read',
    async () => {
      const index = createDomainIndex(state)
      await index.record(resource(keyA), scope, coordinate)
      await chmod(join(state, 'macos-domains'), 0o000)
      expect(await index.list(scope)).toBe('unavailable')
      expect(await index.record(resource(keyB), scope, coordinate)).toBe(false)
    },
  )
})

describe('marker content', () => {
  const content = (patch: Record<string, unknown>) =>
    JSON.stringify({ resource: resource(keyA), scope: 'scope-a', coordinate, ...patch })

  it('reads a whole marker', () => {
    expect(parseMarker(content({}), keyA)).toEqual({
      resource: resource(keyA),
      scope: 'scope-a',
      coordinate,
    })
  })

  it.each([
    ['another key', { resource: resource(keyB) }],
    ['no scope', { scope: 1 }],
    ['another boot', { coordinate: { bootId: 'X', sessions: coordinate.sessions } }],
    ['no session', { coordinate: { bootId: boot, sessions: [] } }],
    ['a bad start', { coordinate: { bootId: boot, sessions: [{ sid: 400, start: '1.1' }] } }],
    [
      'launchd as session',
      { coordinate: { bootId: boot, sessions: [{ sid: 1, start: '1.000001' }] } },
    ],
    ['no provider', { resource: { key: keyA, reference: domainReference(keyA, boot, scope) } }],
  ])('refuses a marker with %s', (_, patch) => {
    expect(parseMarker(content(patch), keyA)).toBeUndefined()
  })

  it('refuses text that is no JSON object', () => {
    expect(parseMarker('nope', keyA)).toBeUndefined()
    expect(parseMarker('null', keyA)).toBeUndefined()
  })
})
