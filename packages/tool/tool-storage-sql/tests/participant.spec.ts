// The `tool` participant module's own guards, which the adapters' read-before-write hides from the
// port tests: they hold when two writers race between a read and a commit. A chunk never changes a
// sealed operation, a manifest seals only chunks that hold exactly its bytes, a retained projection
// needs its raw output, and facts of another protocol are refused.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/sql-contract'
import participant from '../src/worker/participant.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const address = { tenant: 'tenant-a', call: 'call-1', operation: 'preserve-1' }
const base64 = (text: string) => Buffer.from(text).toString('base64')
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const chunk = (digest: string, index: number, text: string) => ({
  ...address,
  intent: 'chunk',
  digest,
  index,
  data: base64(text),
})

const manifest = (
  digest: string,
  text: string,
  extra: Readonly<Record<string, JsonValue>> = {},
) => ({
  ...address,
  intent: 'manifest',
  kind: 'raw',
  digest,
  bytes: Buffer.byteLength(text),
  chunks: 1,
  sha256: sha256(text),
  seal: `seal-${digest}`,
  answer: { digest },
  holds: null,
  ...extra,
})

describe('a chunk for an operation that a manifest already seals', () => {
  it('is refused for another input and keeps the sealed bytes', () => {
    const { port, rows } = migratedPort()
    expect(participant.execute(chunk('d1', 0, 'first'), port).kind).toBe('participated')
    expect(participant.execute(manifest('d1', 'first'), port)).toEqual({
      kind: 'participated',
      response: { kind: 'sealed', answer: { digest: 'd1' } },
    })
    expect(participant.execute(chunk('d2', 0, 'other'), port)).toEqual({
      kind: 'conflict',
      basis: { reason: 'operation' },
    })
    expect(rows('SELECT data FROM tl_chunk LIMIT 10')).toEqual([
      { data: new Uint8Array(Buffer.from('first')) },
    ])
  })
})

describe('a chunk whose data is not canonical base64', () => {
  it('fails and writes nothing', () => {
    const { port, rows } = migratedPort()
    expect(participant.execute({ ...chunk('d1', 0, 'x'), data: 'AB' }, port)).toEqual({
      kind: 'failed',
      diagnostic: 'chunk data is not canonical base64',
    })
    expect(rows('SELECT COUNT(*) AS n FROM tl_chunk')).toEqual([{ n: 0n }])
  })
})

describe('a manifest', () => {
  it('does not seal chunks that hold other bytes than it declares', () => {
    const { port, rows } = migratedPort()
    participant.execute(chunk('d1', 0, 'written'), port)
    expect(participant.execute(manifest('d1', 'declared'), port)).toEqual({
      kind: 'conflict',
      basis: { reason: 'chunks' },
    })
    expect(rows('SELECT COUNT(*) AS n FROM tl_manifest')).toEqual([{ n: 0n }])
  })

  it('of a retained projection needs the raw output it holds, sealed in the same call', () => {
    const { port } = migratedPort()
    participant.execute(chunk('d1', 0, 'projection'), port)
    expect(
      participant.execute(
        manifest('d1', 'projection', {
          kind: 'retain',
          holds: { operation: 'never-preserved', seal: 'seal-x' },
        }),
        port,
      ),
    ).toEqual({ kind: 'conflict', basis: { reason: 'holder' } })
  })
})

describe('facts of another protocol', () => {
  it('are unsupported and write nothing', () => {
    const { port, rows } = migratedPort()
    expect(participant.execute({ intent: 'ledger', tenant: 'tenant-a' }, port)).toEqual({
      kind: 'unsupported',
      basis: { reason: 'facts' },
    })
    expect(rows('SELECT COUNT(*) AS n FROM tl_domain')).toEqual([{ n: 0n }])
  })
})
