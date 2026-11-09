import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { callHostDomain } from '../../src/host-domains.ts'
import { adoption } from '../coordinator-values.ts'
import { fixture, ok } from './fixture.ts'

type Fixture = Awaited<ReturnType<typeof fixture>>
type Commitment = Readonly<{ fingerprint: unknown; original: unknown }>

/** Rewrites the stored commitment and keeps the record's digests consistent with it. */
async function storeCommitment(f: Fixture, change: (stored: Commitment) => Commitment) {
  const domain = callHostDomain(f.access.tenant, 'delivery', f.access.call)
  const read = await f.store.read(domain)
  if (read.kind !== 'complete') throw new Error('missing delivery domain')
  const row = read.records.find(record => record.kind === 'host')
  if (row?.kind !== 'host') throw new Error('missing delivery record')
  const record = structuredClone(row.host.value) as Record<string, unknown> & {
    payload: Record<string, unknown> & { value: Commitment }
  }
  record.payload.value = change(record.payload.value)
  record.digest = canonicalDigest(record.payload)
  await f.store.commit({
    domain,
    expected: read.revision,
    revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
    writes: [{ kind: 'put', record: { kind: 'host', host: { key: row.host.key, value: record } } }],
  })
}

const offloaded = {
  kind: 'offloaded',
  source: {
    storage: 'fixture',
    key: 'body',
    mediaType: 'text/plain',
    bytes: '1000',
    digest: `sha256:${'a'.repeat(64)}`,
  },
  bodyId: 'body-original',
  representation: {
    kind: 'text',
    codec: adoption('text-codec'),
  },
  bodyBytes: '1000',
  previewKind: 'mechanical',
  retention: {
    adoption: adoption('retention'),
    activatedAt: '2026-11-08T00:00:00.000Z',
    expiresAt: '2026-11-09T00:00:00.000Z',
  },
}

async function releaseUnknown() {
  const f = await fixture()
  vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input =>
    fail({ kind: 'commit-unknown', operation: input.operation }),
  )
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  return f
}

it('keeps resolving a release whose stored commitment is well formed', async () => {
  const f = await releaseUnknown()
  await storeCommitment(f, stored => ({ ...stored, original: offloaded }))
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.reads.operation).toHaveBeenCalledTimes(1)
})

it.each([
  [
    'a fingerprint of another codec',
    (c: Commitment) => ({ ...c, fingerprint: { ...(c.fingerprint as object), codec: 'json' } }),
  ],
  [
    'a fingerprint of another algorithm',
    (c: Commitment) => ({ ...c, fingerprint: { ...(c.fingerprint as object), algorithm: 'md5' } }),
  ],
  [
    'a fingerprint whose digest is not hex',
    (c: Commitment) => ({
      ...c,
      fingerprint: { ...(c.fingerprint as object), digest: 'z'.repeat(64) },
    }),
  ],
  [
    'a fingerprint whose length is not a decimal',
    (c: Commitment) => ({ ...c, fingerprint: { ...(c.fingerprint as object), bytes: '-1' } }),
  ],
  ['a fingerprint that is not a record', (c: Commitment) => ({ ...c, fingerprint: 'sha256' })],
  ['an original of an unknown kind', (c: Commitment) => ({ ...c, original: { kind: 'inline' } })],
  [
    'an offloaded original with a malformed body id',
    (c: Commitment) => ({ ...c, original: { ...offloaded, bodyId: '' } }),
  ],
  [
    'an offloaded original without retention',
    (c: Commitment) => ({ ...c, original: { ...offloaded, retention: undefined } }),
  ],
  [
    'an offloaded original that keeps its summary',
    (c: Commitment) => ({ ...c, original: { ...offloaded, summary: [] } }),
  ],
] as const)('refuses a stored record that commits to %s', async (_name, change) => {
  const f = await releaseUnknown()
  await storeCommitment(f, change)
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.reads.operation).not.toHaveBeenCalled()
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
})
