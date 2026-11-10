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

/** Rewrites the whole stored record; the change keeps or breaks its digests itself. */
async function storeRecord(f: Fixture, change: (stored: Stored) => unknown) {
  const domain = callHostDomain(f.access.tenant, 'delivery', f.access.call)
  const read = await f.store.read(domain)
  if (read.kind !== 'complete') throw new Error('missing delivery domain')
  const row = read.records.find(record => record.kind === 'host')
  if (row?.kind !== 'host') throw new Error('missing delivery record')
  const value = change(structuredClone(row.host.value) as Stored)
  await f.store.commit({
    domain,
    expected: read.revision,
    revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
    writes: [{ kind: 'put', record: { kind: 'host', host: { key: row.host.key, value } } }],
  })
}

type Stored = Record<string, unknown> & { payload: Record<string, unknown> }

/** The record with `payload`, under the digest of that payload. */
const sealed = (stored: Stored, payload: Record<string, unknown>) => ({
  ...stored,
  payload,
  digest: canonicalDigest(payload),
})
const withValue = (stored: Stored, value: unknown) => sealed(stored, { ...stored.payload, value })
const fingerprintOf = (stored: Stored) =>
  (stored.payload.value as { fingerprint: Record<string, unknown> }).fingerprint
const withFingerprint = (stored: Stored, change: Record<string, unknown>) =>
  withValue(stored, {
    ...(stored.payload.value as object),
    fingerprint: { ...fingerprintOf(stored), ...change },
  })
const hex = 'a'.repeat(64)
const account = (subject: Readonly<{ kind: string; id: string }>) => ({
  subject,
  usage: [],
  cost: [],
  trimmed: { state: 'unknown', unit: 'tokens' },
  place: 'test',
  duration: { state: 'unknown' },
  receipt: 'late',
  revision: '1',
})

it.each<[string, (stored: Stored) => unknown]>([
  ['a record that is not a record', () => 'record'],
  ['a record without a payload', stored => ({ ...stored, payload: null })],
  ['a record whose digest is not its payload digest', stored => ({ ...stored, digest: 'other' })],
  [
    'a payload with a field the record does not know, under the digest of the rest',
    stored => ({
      ...stored,
      payload: { ...stored.payload, extra: 1 },
      digest: canonicalDigest(stored.payload),
    }),
  ],
  [
    'a malformed account under the digest of no payload',
    stored => ({
      ...stored,
      payload: { ...stored.payload, account: 'x' },
      digest: canonicalDigest(null),
    }),
  ],
  [
    'a payload without an account',
    stored => {
      const { account: _account, ...payload } = stored.payload
      return sealed(stored, payload)
    },
  ],
  ['a null commitment', stored => withValue(stored, null)],
  [
    'a null fingerprint',
    stored => withValue(stored, { ...(stored.payload.value as object), fingerprint: null }),
  ],
  [
    'a null original',
    stored => withValue(stored, { ...(stored.payload.value as object), original: null }),
  ],
  ['a digest that is a list', stored => withFingerprint(stored, { digest: [hex] })],
  ['a length that is a list', stored => withFingerprint(stored, { bytes: ['5'] })],
  ['a digest after other text', stored => withFingerprint(stored, { digest: `x${hex}` })],
  ['a digest before other text', stored => withFingerprint(stored, { digest: `${hex}x` })],
  ['a length before other text', stored => withFingerprint(stored, { bytes: '5x' })],
  [
    'an account of another call',
    stored =>
      sealed(stored, {
        ...stored.payload,
        account: account({ kind: 'tool_execution', id: 'other-call' }),
      }),
  ],
  [
    'an account of another subject kind',
    stored =>
      sealed(stored, {
        ...stored.payload,
        account: account({ kind: 'model_call', id: 'original-call' }),
      }),
  ],
  ['a malformed task operation', stored => ({ ...stored, task: '' })],
  ['a malformed freeze operation', stored => ({ ...stored, freeze: '' })],
  ['a malformed release operation', stored => ({ ...stored, release: '' })],
  ['a malformed done operation', stored => ({ ...stored, done: '' })],
  ['an unknown phase', stored => ({ ...stored, phase: { kind: 'bogus' } })],
  [
    'receiver evidence of another owner',
    stored => ({
      ...stored,
      phase: {
        ...(stored.phase as object),
        evidence: { ...(stored.phase as { evidence: object }).evidence, owner: 'other-owner' },
      },
    }),
  ],
])('refuses %s', async (_name, change) => {
  const f = await releaseUnknown()
  await storeRecord(f, change)
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.reads.operation).not.toHaveBeenCalled()
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
})
