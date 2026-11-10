// The request body: a request has no size bound and a commit of the storage has one, so the body
// is written as chunks, apart from the call row, which keeps the head. The call holds only with
// its whole body; a body that no call owns does not stay; every later commit and read of the call
// has a size that does not depend on the request.
import { describe, expect, it } from 'vitest'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { createSqlModelCommands } from '@omne-harness/model-storage-sql'
import type { CommitRequestV2, CommitResultV2, SqlStorage } from '@omne-harness/sql-contract'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { chunksOf } from '../src/request-body.ts'
import {
  DIGEST,
  REQUEST,
  callId,
  coreOptions,
  instanceId,
  lookup,
  opId,
  proof,
  sqliteStorage,
  tenantOf,
  textOf,
  type Principal,
} from './fixture.ts'

const A = tenantOf('a')
const DOMAIN = 'body'
const CHUNK_BYTES = 1024

/** The fixture request with a first message of `length` characters. */
function requestOf(length: number): FixedModelRequest {
  const text = 'é"\\\n😀'.repeat(Math.ceil(length / 6)).slice(0, length)
  const copy: { messages: { blocks: { text?: string }[] }[] } = JSON.parse(JSON.stringify(REQUEST))
  const block = copy.messages[0]?.blocks[0]
  if (block === undefined) throw new Error('fixture request')
  block.text = text
  return copy as unknown as FixedModelRequest
}

type Intercept = (request: CommitRequestV2, intent: unknown) => CommitResultV2 | null

/** One process over the test provider. `intercept` may answer a commit in place of the provider. */
function process(
  sqlite: ReturnType<typeof sqliteStorage>,
  intercept: Intercept = () => null,
  chunkBytes = CHUNK_BYTES,
) {
  const sizes: { intent: unknown; bytes: number }[] = []
  const reads: { handler: string; bytes: number }[] = []
  const storage: SqlStorage = {
    ...sqlite.storage,
    async read(request) {
      const result = await sqlite.storage.read(request)
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
      reads.push({ handler: request.handler, bytes })
      return result
    },
    commit(request) {
      const intent = request.commands[0]?.facts['intent']
      sizes.push({ intent, bytes: Buffer.byteLength(JSON.stringify(request.commands), 'utf8') })
      const answered = intercept(request, intent)
      return answered === null ? sqlite.storage.commit(request) : Promise.resolve(answered)
    },
  }
  const core = coreOptions([A])
  const { commands } = createSqlModelCommands<Principal>({
    ...core.options,
    storage,
    domains: lookup([textOf(A)], DOMAIN),
    requestChunkBytes: chunkBytes,
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
  })
  const admit = (name: string, request: FixedModelRequest) => ({
    ...core.admitOf(A, callId(name), opId(`admit-${name}`)),
    request,
  })
  return { commands, admit, sizes, reads }
}

function chunkRows(sqlite: ReturnType<typeof sqliteStorage>, call: string) {
  return sqlite.rows(
    DOMAIN,
    'SELECT seq, total FROM md_request WHERE tenant = ? AND call = ? ORDER BY seq',
    [textOf(A), call],
  )
}

const unknownOf = (request: CommitRequestV2): CommitResultV2 => ({
  kind: 'unknown',
  identity: request.identity,
  diagnostic: null,
})

describe('cutting a body into chunks', () => {
  it('gives chunks that put together are the text, each within the encoded size', () => {
    const text = requestOf(5000).messages[0]?.blocks[0]
    if (text?.kind !== 'text') throw new Error('fixture')
    for (const bytes of [16, 100, 1024, 1 << 20]) {
      const chunks = chunksOf(text.text, bytes)
      expect(chunks.join('')).toBe(text.text)
      for (const chunk of chunks)
        expect(Buffer.byteLength(JSON.stringify(chunk), 'utf8')).toBeLessThanOrEqual(bytes)
    }
  })

  it('fills a chunk to the encoded size when the text allows it', () => {
    // 1024 bytes hold the two quotes and 1022 characters of one byte each.
    expect(chunksOf('a'.repeat(5000), 1024).map(chunk => chunk.length)).toEqual([
      1022, 1022, 1022, 1022, 912,
    ])
  })

  it('does not cut a surrogate pair', () => {
    for (const chunk of chunksOf('😀'.repeat(50), 16)) expect(chunk).toMatch(/^(?:😀)+$/u)
  })

  it('gives no chunk for the empty text and one chunk for a text that fits', () => {
    expect(chunksOf('', 16)).toEqual([])
    expect(chunksOf('abc', 16)).toEqual(['abc'])
  })
})

describe('the body of an admitted call', () => {
  it('writes a body of one chunk in the commit of the admission itself', async () => {
    const sqlite = sqliteStorage()
    const p = process(sqlite, undefined, 65536)
    expect(await p.commands.admit(p.admit('small', REQUEST))).toHaveProperty('ok')
    expect(p.sizes.map(size => size.intent)).toEqual(['write'])
    expect(chunkRows(sqlite, 'mcall_small')).toEqual([[0n, 1n]])
  })

  it('writes a body of several chunks before the call, and reads the same request back', async () => {
    const sqlite = sqliteStorage()
    const p = process(sqlite)
    const request = requestOf(5000)
    const input = p.admit('large', request)
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    const rows = chunkRows(sqlite, 'mcall_large')
    expect(rows.length).toBeGreaterThan(1)
    expect(rows).toEqual(rows.map((_, seq) => [BigInt(seq), BigInt(rows.length)]))
    expect(p.sizes.map(size => size.intent)).toEqual([...rows.map(() => 'body-chunk'), 'write'])
    for (const size of p.sizes) expect(size.bytes).toBeLessThan(CHUNK_BYTES + 4096)

    expect(await p.commands.loadRequest(input)).toEqual({ ok: request })
    const recovery = await p.commands.loadRecovery(input)
    if (!('ok' in recovery)) throw new Error('no recovery record')
    expect(recovery.ok.request).not.toHaveProperty('messages')
    expect(recovery.ok.request.messageIds).toEqual(request.messages.map(message => message.id))
    const [head] = sqlite.rows(DOMAIN, 'SELECT request FROM md_call WHERE call = ?', [
      'mcall_large',
    ])
    expect(unpackText(head?.[0] as Uint8Array)).not.toContain('😀')
  })

  it('makes every commit after the admission the same size for a small and a large request', async () => {
    const later = async (length: number) => {
      const sqlite = sqliteStorage()
      const p = process(sqlite)
      const input = p.admit('sized', requestOf(length))
      expect(await p.commands.admit(input)).toHaveProperty('ok')
      const before = p.sizes.length
      const claimed = await p.commands.claim({
        ...input,
        operation: opId('claim'),
        instance: instanceId(),
        continuity: proof(input.call),
      })
      expect(claimed).toHaveProperty('ok')
      return p.sizes.slice(before).map(size => size.bytes)
    }
    const small = await later(10)
    expect(small).toHaveLength(1)
    expect(await later(200_000)).toEqual(small)
  })

  it('reads the state of the call in the same size for a small and a large request', async () => {
    const stateRead = async (length: number) => {
      const sqlite = sqliteStorage()
      const p = process(sqlite)
      const input = p.admit('sized', requestOf(length))
      expect(await p.commands.admit(input)).toHaveProperty('ok')
      p.reads.length = 0
      expect(await p.commands.loadRecovery(input)).toHaveProperty('ok')
      return p.reads
    }
    const small = await stateRead(10)
    expect(small.map(read => read.handler)).toEqual(['model.call'])
    expect(await stateRead(200_000)).toEqual(small)
  })

  it('reads the body one chunk at a time, each read within the chunk size', async () => {
    const sqlite = sqliteStorage()
    const p = process(sqlite)
    const input = p.admit('paged', requestOf(20_000))
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    p.reads.length = 0
    expect(await p.commands.loadRequest(input)).toEqual({ ok: input.request })
    const bodyReads = p.reads.filter(read => read.handler === 'model.request')
    expect(bodyReads).toHaveLength(chunkRows(sqlite, 'mcall_paged').length)
    for (const read of bodyReads) expect(read.bytes).toBeLessThan(CHUNK_BYTES + 4096)
  })

  it('does not admit on the chunks of another input', async () => {
    const sqlite = sqliteStorage()
    let once = true
    const p = process(sqlite, (_request, intent) => {
      if (intent === 'write' && once) {
        once = false
        sqlite.seed(DOMAIN, 'UPDATE md_request SET digest = ?', ['f'.repeat(64)])
      }
      return null
    })
    expect(await p.commands.admit(p.admit('other', requestOf(5000)))).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'the request body was not whole at the commit' },
    })
    expect(sqlite.rows(DOMAIN, 'SELECT call FROM md_call', [])).toEqual([])
  })

  it('keeps no chunk of an admission with another input for a call that exists', async () => {
    const sqlite = sqliteStorage()
    const p = process(sqlite)
    const first = p.admit('same', requestOf(5000))
    expect(await p.commands.admit(first)).toHaveProperty('ok')
    const owned = sqlite.rows(DOMAIN, 'SELECT digest, seq FROM md_request ORDER BY seq', [])
    expect(await p.commands.admit(p.admit('same', requestOf(7000)))).toHaveProperty('failure')
    expect(sqlite.rows(DOMAIN, 'SELECT digest, seq FROM md_request ORDER BY seq', [])).toEqual(
      owned,
    )
    expect(await p.commands.loadRequest(first)).toEqual({ ok: first.request })
  })

  it('writes nothing when a call that released its material is admitted again', async () => {
    const sqlite = sqliteStorage()
    const p = process(sqlite)
    const input = p.admit('again', requestOf(5000))
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    // What the release commit leaves: no request head and no chunk (commit.spec.ts).
    sqlite.seed(DOMAIN, 'UPDATE md_call SET request = NULL', [])
    sqlite.seed(DOMAIN, 'DELETE FROM md_request', [])
    p.sizes.length = 0
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    // The core recognises the admission before it stages a write, so no body is written.
    expect(p.sizes).toEqual([])
    expect(chunkRows(sqlite, 'mcall_again')).toEqual([])
  })

  it('refuses the admission when a chunk is missing at the commit, keeps nothing, and admits on the retry', async () => {
    const sqlite = sqliteStorage()
    let once = true
    const p = process(sqlite, (_request, intent) => {
      if (intent === 'write' && once) {
        once = false
        sqlite.seed(DOMAIN, 'DELETE FROM md_request WHERE seq = 0', [])
      }
      return null
    })
    const input = p.admit('gap', requestOf(5000))
    expect(await p.commands.admit(input)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-records',
        diagnostic: 'the request body was not whole at the commit',
      },
    })
    expect(sqlite.rows(DOMAIN, 'SELECT call FROM md_call', [])).toEqual([])
    expect(chunkRows(sqlite, 'mcall_gap')).toEqual([])
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    expect(await p.commands.loadRequest(input)).toEqual({ ok: input.request })
  })

  it('answers unavailable when a chunk commit is not confirmed, and the retry leaves one body', async () => {
    const sqlite = sqliteStorage()
    let lost = false
    const p = process(sqlite, (request, intent) => {
      if (intent !== 'body-chunk' || lost || request.commands[0]?.facts['seq'] !== 1) return null
      lost = true
      return unknownOf(request)
    })
    const input = p.admit('lost', requestOf(5000))
    expect(await p.commands.admit(input)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'model-records' },
    })
    expect(sqlite.rows(DOMAIN, 'SELECT call FROM md_call', [])).toEqual([])
    expect(await p.commands.admit(input)).toHaveProperty('ok')
    const rows = chunkRows(sqlite, 'mcall_lost')
    expect(rows).toEqual(rows.map((_, seq) => [BigInt(seq), BigInt(rows.length)]))
    expect(await p.commands.loadRequest(input)).toEqual({ ok: input.request })
  })

  it('deletes, at the first admission of a new process, the chunks that no call owns', async () => {
    const sqlite = sqliteStorage()
    // The process dies between the chunks and the admission: its discard never commits either.
    const crashed = process(sqlite, (request, intent) =>
      intent === 'write' || intent === 'body-discard' ? unknownOf(request) : null,
    )
    await crashed.commands.admit(crashed.admit('orphan', requestOf(5000)))
    expect(chunkRows(sqlite, 'mcall_orphan').length).toBeGreaterThan(1)
    expect(sqlite.rows(DOMAIN, 'SELECT call FROM md_call', [])).toEqual([])

    const next = process(sqlite)
    const input = next.admit('next', requestOf(3000))
    expect(await next.commands.admit(input)).toHaveProperty('ok')
    expect(chunkRows(sqlite, 'mcall_orphan')).toEqual([])
    expect(chunkRows(sqlite, 'mcall_next').length).toBeGreaterThan(1)
    expect(await next.commands.loadRequest(input)).toEqual({ ok: input.request })
  })

  it('keeps the chunks of a call that holds its material when a new process sweeps', async () => {
    const sqlite = sqliteStorage()
    const first = process(sqlite)
    const kept = first.admit('kept', requestOf(5000))
    expect(await first.commands.admit(kept)).toHaveProperty('ok')
    const next = process(sqlite)
    const other = next.admit('other', REQUEST)
    expect(await next.commands.admit(other)).toHaveProperty('ok')
    expect(await next.commands.loadRequest({ ...kept, principal: other.principal })).toEqual({
      ok: kept.request,
    })
  })
})
