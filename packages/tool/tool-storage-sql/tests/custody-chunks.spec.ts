// The chunked custody (D2 decision 3): a preserve of any size keeps its original in chunks that each
// fit one command and seals them with a manifest committed last. Until the manifest is durable,
// inspect never answers retained; a resend of the operation overwrites what a crash left; another
// input under a sealed operation is a conflict that changes nothing. Custody rows move no ledger
// domain revision (review N2), and the factory refuses a chunk size that cannot fit a command.
import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { LedgerRecord } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
  type RawOutput,
  type ToolCallId,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolOutputCustody, CHUNK_ENVELOPE_BYTES } from '../src/index.ts'
import { domainNameOf, openApp, TENANT_A, type App } from './fixtures/app.ts'
import { readRawBytes } from './fixtures/custody.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(input: Parameters<typeof openApp>[0] = {}): Promise<App> {
  const created = await openApp(input)
  opened.push(created)
  return created
}

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const call = (text: string): ToolCallId => decoded(decodeToolCallId(text))
const operation = (text: string): ToolOperationId => decoded(decodeToolOperationId(text))
const revision = (text: string) => decoded(decodeToolRevision(text))
const codec = { owner: 'test', name: 'bytes', revision: '1', digest: 'sha256:bytes' }
const source: DurableEvidence = {
  owner: 'test',
  record: 'final',
  revision: '1',
  digest: 'sha256:final',
}
const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function mutation(callText: string, operationText: string) {
  return {
    principal: 'tester',
    tenant: TENANT_A,
    call: call(callText),
    operation: operation(operationText),
  }
}

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer)
    throw new Error(`expected success, got ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const CHUNK = 1000

describe('A3: an original several times larger than one chunk', () => {
  it('is kept whole: retained, read back chunk by chunk with the same bytes and SHA-256', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions({ maxChunkBytes: CHUNK }))
    const bytes = new Uint8Array(randomBytes(5 * CHUNK + 300))
    const raw = ok(
      await custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes, source }),
    )
    expect(raw.content.bytes).toBe(String(bytes.length))
    expect(raw.content.digest).toBe(sha256(bytes))
    expect(a.faults.commits('chunk')).toBe(6)
    expect(a.faults.commits('manifest')).toBe(1)
    expect(ok(await custody.inspect(mutation('call-1', 'preserve-1')))).toEqual({
      kind: 'retained',
      raw,
    })
    const back = await readRawBytes(a, TENANT_A, raw)
    expect(sha256(back)).toBe(sha256(bytes))
    expect(Buffer.from(back).equals(Buffer.from(bytes))).toBe(true)
  })

  it('is not retained while the manifest is missing, and a resend of the operation seals it', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions({ maxChunkBytes: CHUNK }))
    const bytes = new Uint8Array(randomBytes(3 * CHUNK + 1))
    // Four chunks and the manifest: the process stops before the fifth and last commit.
    a.faults.armCommitAt('interrupted', 5)
    await expect(
      custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes, source }),
    ).rejects.toThrow('injected')
    expect(a.faults.commits('chunk')).toBe(4)
    expect(ok(await custody.inspect(mutation('call-1', 'preserve-1')))).toEqual({ kind: 'unknown' })
    const raw = ok(
      await custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes, source }),
    )
    expect(ok(await custody.inspect(mutation('call-1', 'preserve-1')))).toEqual({
      kind: 'retained',
      raw,
    })
    expect(Buffer.from(await readRawBytes(a, TENANT_A, raw)).equals(Buffer.from(bytes))).toBe(true)
  })

  it('a resend after a crash overwrites the orphan chunks, and no chunk beyond the manifest stays', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions({ maxChunkBytes: CHUNK }))
    a.faults.armCommit('interrupted', 'manifest')
    const first = new Uint8Array(randomBytes(4 * CHUNK))
    await expect(
      custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes: first, source }),
    ).rejects.toThrow('injected')
    const bytes = new Uint8Array(randomBytes(CHUNK + 10))
    const raw = ok(
      await custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes, source }),
    )
    expect(Buffer.from(await readRawBytes(a, TENANT_A, raw)).equals(Buffer.from(bytes))).toBe(true)
    const rows = a.sqlite.inspect(
      domainNameOf(TENANT_A),
      'SELECT COUNT(*) AS n FROM tl_chunk WHERE call = ? AND operation = ?',
      ['call-1', 'preserve-1'],
    )
    expect(rows[0]?.['n']).toBe(2n)
  })

  it('another input under a sealed operation is a conflict, and the original stays as it was', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions({ maxChunkBytes: CHUNK }))
    const bytes = new Uint8Array(randomBytes(2 * CHUNK + 5))
    const raw = ok(
      await custody.preserve({ ...mutation('call-1', 'preserve-1'), codec, bytes, source }),
    )
    const other = new Uint8Array(randomBytes(2 * CHUNK + 5))
    const answer = await custody.preserve({
      ...mutation('call-1', 'preserve-1'),
      codec,
      bytes: other,
      source,
    })
    expect(answer).toEqual({ failure: { kind: 'conflict', operation: operation('preserve-1') } })
    expect(ok(await custody.inspect(mutation('call-1', 'preserve-1')))).toEqual({
      kind: 'retained',
      raw,
    })
    expect(Buffer.from(await readRawBytes(a, TENANT_A, raw)).equals(Buffer.from(bytes))).toBe(true)
  })

  it('every chunk fits the command bound with the longest identities, at the largest chunk size', async () => {
    const maxCommandBytes = 16_384
    const maxChunkBytes = Math.floor(((maxCommandBytes - CHUNK_ENVELOPE_BYTES) * 3) / 4)
    const a = await app({ maxCommandBytes })
    const custody = createSqlToolOutputCustody<string>(
      a.custodyOptions({ maxCommandBytes, maxChunkBytes }),
    )
    const bytes = new Uint8Array(randomBytes(3 * maxChunkBytes + 7))
    const raw = ok(
      await custody.preserve({
        ...mutation('c'.repeat(256), 'o'.repeat(256)),
        codec,
        bytes,
        source,
      }),
    )
    expect(Buffer.from(await readRawBytes(a, TENANT_A, raw)).equals(Buffer.from(bytes))).toBe(true)
  })
})

describe('A8: custody rows and manifests move no ledger domain revision', () => {
  it('preserve and retainResult leave the call domain of the same call at its revision', async () => {
    const a = await app()
    const custody = createSqlToolOutputCustody<string>(a.custodyOptions({ maxChunkBytes: CHUNK }))
    const domain = { kind: 'call', tenant: TENANT_A, call: call('call-1') } as const
    const record: LedgerRecord<ContentBlock> = { kind: 'host', host: { key: 'k', value: 1 } }
    expect(
      await a.store.commit({
        domain,
        expected: revision('0'),
        revision: revision('1'),
        writes: [{ kind: 'put', record }],
      }),
    ).toEqual({ kind: 'committed' })
    const before = await a.store.read(domain)
    const raw: RawOutput = ok(
      await custody.preserve({
        ...mutation('call-1', 'preserve-1'),
        codec,
        bytes: new Uint8Array(randomBytes(3 * CHUNK)),
        source,
      }),
    )
    ok(
      await custody.retainResult({
        ...mutation('call-1', 'retain-1'),
        raw,
        value: { content: [], data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
      }),
    )
    expect(before).toEqual({ kind: 'complete', revision: '1', records: [record] })
    expect(await a.store.read(domain)).toEqual(before)
    // A projection is not an original: inspect of its operation recalls no raw output (TS-08).
    expect(ok(await custody.inspect(mutation('call-1', 'retain-1')))).toEqual({ kind: 'unknown' })
  })
})

describe('A10: the chunk bound is checked when the custody is built', () => {
  it('refuses a chunk size whose base64 form and envelope exceed maxCommandBytes', async () => {
    const a = await app()
    const fits = Math.floor(((1_048_576 - CHUNK_ENVELOPE_BYTES) * 3) / 4)
    expect(() =>
      createSqlToolOutputCustody(
        a.custodyOptions({ maxCommandBytes: 1_048_576, maxChunkBytes: fits }),
      ),
    ).not.toThrow()
    expect(() =>
      createSqlToolOutputCustody(
        a.custodyOptions({ maxCommandBytes: 1_048_576, maxChunkBytes: fits + 3 }),
      ),
    ).toThrow(RangeError)
  })

  it('refuses a chunk size or a command bound that is not a positive safe integer', async () => {
    const a = await app()
    for (const maxChunkBytes of [0, -1, 1.5, Number.NaN])
      expect(() => createSqlToolOutputCustody(a.custodyOptions({ maxChunkBytes }))).toThrow(
        RangeError,
      )
    expect(() => createSqlToolOutputCustody(a.custodyOptions({ maxCommandBytes: 0 }))).toThrow(
      RangeError,
    )
  })
})
