import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createScheduleToolDetails } from '@omne-harness/schedule-tools'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { detailsWorld } from './details-world.ts'
import { access, value, adoption } from './world.ts'

it('reads a fixed version through the real Tool ledger, keeps original data, and bounds each continuation to two reads', async () => {
  const w = await detailsWorld()
  const ref = value(await w.details.reference({ access: w.access, result: w.reference.result }))
  expect(ref).toEqual(w.reference)
  expect(w.state.calls).toBe(1)
  const first = value(await w.details.read({ access: w.access, reference: ref, after: null }))
  expect(first.next).not.toBeNull()
  w.state.calls = 0
  const second = value(
    await w.details.read({ access: w.access, reference: ref, after: first.next }),
  )
  expect(w.state.calls).toBe(2)
  expect(second.value.data).toEqual(first.value.data)
  expect(second.source).toEqual(first.source)
  const third = value(
    await w.details.read({ access: w.access, reference: ref, after: second.next }),
  )
  expect(third.next).toBeNull()
  expect(Object.isFrozen(third.value)).toBe(true)
})
it('rejects wrong authority/version, tampered cursors, digest/scope changes, and confirmation changes even at the same revision', async () => {
  const w = await detailsWorld()
  const input = { access: w.access, reference: w.reference, after: null }
  expect(
    await w.details.read({ ...input, reference: { ...w.reference, authority: 'other' } }),
  ).toHaveProperty('failure.kind', 'invalid')
  expect(
    await w.details.reference({
      access: w.access,
      result: value(decodeToolResultVersion('missing')),
    }),
  ).toHaveProperty('failure')
  const first = value(await w.details.read(input))
  expect(await w.details.read({ ...input, after: `${first.next}x` })).toHaveProperty(
    'failure.kind',
    'invalid-cursor',
  )
  for (const field of ['wrongDigest', 'wrongIds', 'changed'] as const) {
    w.state[field] = true
    expect(await w.details.read(input)).toHaveProperty('failure.kind', 'invalid')
    w.state[field] = false
  }
  w.state.unavailable = true
  expect(await w.details.read(input)).toHaveProperty('failure.kind', 'unavailable')
})
it('rejects metadata drift and repeated provider cursors without background pagination', async () => {
  const w = await detailsWorld()
  const input = { access: w.access, reference: w.reference, after: null }
  const first = value(await w.details.read(input))
  w.state.queryDrift = true
  expect(await w.details.read({ ...input, after: first.next })).toHaveProperty(
    'failure.reason',
    'page-metadata-drift',
  )
  w.state.queryDrift = false
  w.state.loop = true
  w.state.calls = 0
  expect(await w.details.read({ ...input, after: first.next })).toHaveProperty(
    'failure.reason',
    'provider-cursor-cycle',
  )
  expect(w.state.calls).toBe(2)
})
it('enforces the same business disclosure guard on generic result/content/raw reads in the real ledger', async () => {
  const w = await detailsWorld()
  const direct = { ...access(), result: w.reference.result }
  expect(await w.ledger.reads.result({ ...direct, after: null })).toHaveProperty('ok')
  w.state.revoked = true
  expect(
    await w.details.read({ access: w.access, reference: w.reference, after: null }),
  ).toHaveProperty('failure.kind', 'denied')
  expect(await w.ledger.reads.result({ ...direct, after: null })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(await w.ledger.reads.content.raw(direct)).toHaveProperty('failure.kind', 'denied')
  const attachment = {
    storage: 'fixture',
    key: 'content',
    mediaType: 'application/json',
    bytes: '3',
    digest: 'digest',
  }
  expect(
    await w.ledger.reads.content.read({ ...direct, attachment, after: null, maxBytes: 100 }),
  ).toHaveProperty('failure.kind', 'denied')
  expect(await w.details.guard.qualify({ ...access(), action: 'read-raw-content' })).toEqual({
    kind: 'denied',
    reason: 'revoked',
  })
  expect(await w.details.guard.qualify({ ...access(), action: 'recover' })).toEqual({
    kind: 'allowed',
  })
  w.state.revoked = false
  expect(await w.ledger.reads.content.raw(direct)).toMatchObject({
    failure: { kind: 'invalid', field: 'result', reason: 'no-raw-output' },
  })
})
it('enforces cumulative byte/deadline limits and refuses factories without the required host policy', async () => {
  const w = await detailsWorld({ bytes: 100 })
  expect(
    await w.details.reference({ access: w.access, result: w.reference.result }),
  ).toHaveProperty('failure.diagnostic', 'output_limit')
  expect(w.state.calls).toBe(1)
  const timed = createScheduleToolDetails({
    cursorKey: w.cursorKey,
    authority: w.reference.authority,
    queries: { readResult: () => new Promise(() => {}) },
    baseGuard: { qualify: async () => ({ kind: 'allowed' }) },
    disclosure: w.disclosure,
    limits: { maxBytes: 4_194_304, timeoutMs: 5 },
  })
  expect(await timed.reference({ access: w.access, result: w.reference.result })).toHaveProperty(
    'failure.diagnostic',
    'deadline_exceeded',
  )
  expect(() =>
    createScheduleToolDetails({
      cursorKey: w.cursorKey,
      authority: 'x',
      queries: w.queries,
      baseGuard: { qualify: async () => ({ kind: 'allowed' }) },
      disclosure: undefined,
      limits: { maxBytes: 100, timeoutMs: 100 },
    } as never),
  ).toThrow('Missing fixed-result host ports')
})
it('passes through provider unknown failures and preserves original error results without assuming success', async () => {
  const w = await detailsWorld()
  const errorValue = {
    kind: 'result',
    action: 'get',
    operation: null,
    result: {
      kind: 'error',
      error: {
        code: 'forbidden',
        message: 'revoked at original call',
        retryable: false,
        requestId: 'r',
        details: {},
      },
    },
  }
  const { readJsonText } = await import('@omne-harness/json-text')
  const { hash } = await import('./details-world.ts')
  const tree = readJsonText(JSON.stringify(errorValue), {
    maxBytes: 4096,
    maxDepth: 32,
    maxItems: 1000,
    maxMembers: 100,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (tree.kind !== 'ok') throw new Error('Invalid fixture')
  const baseline = value(
    await w.queries.readResult({ ...w.access, result: w.reference.result, after: null }),
  )
  const reader = createScheduleToolDetails({
    cursorKey: w.cursorKey,
    authority: w.reference.authority,
    queries: {
      readResult: async () =>
        succeed({
          ...baseline,
          next: null,
          value: {
            ...baseline.value,
            data: {
              kind: 'json',
              contract: adoption,
              schema:
                baseline.value.data.kind === 'json'
                  ? baseline.value.data.schema
                  : { id: '', revision: '', digest: '' },
              value: tree.value,
            },
          },
        }),
    },
    baseGuard: { qualify: async () => ({ kind: 'allowed' }) },
    disclosure: {
      ...w.disclosure,
      observe: async () =>
        succeed({
          ...value(await w.disclosure.observe({ access: w.access, reference: w.reference })),
          scheduleIds: [],
          resultDigest: hash(errorValue),
        }),
      confirm: async ({ observed }) => succeed(observed),
    },
    limits: { maxBytes: 4_194_304, timeoutMs: 1000 },
  })
  expect(await reader.reference({ access: w.access, result: w.reference.result })).toHaveProperty(
    'ok',
  )
})

it('rebuilds the cursor verifier with a host-retained key and rejects a different key', async () => {
  const w = await detailsWorld()
  const first = value(
    await w.details.read({ access: w.access, reference: w.reference, after: null }),
  )
  const configuration = {
    authority: w.reference.authority,
    queries: w.queries,
    baseGuard: { qualify: async () => ({ kind: 'allowed' as const }) },
    disclosure: w.disclosure,
    limits: { maxBytes: 4_194_304, timeoutMs: 1000 },
  }
  const rebuilt = createScheduleToolDetails({ ...configuration, cursorKey: w.cursorKey })
  expect(
    await rebuilt.read({ access: w.access, reference: w.reference, after: first.next }),
  ).toHaveProperty('ok')
  const changed = createScheduleToolDetails({
    ...configuration,
    cursorKey: new Uint8Array(32).fill(24),
  })
  expect(
    await changed.read({ access: w.access, reference: w.reference, after: first.next }),
  ).toHaveProperty('failure.kind', 'invalid-cursor')
  expect(() =>
    createScheduleToolDetails({ ...configuration, cursorKey: new Uint8Array(31) }),
  ).toThrow('at least 32 bytes')
})
it('distinguishes retained raw metadata from a configured byte reader', async () => {
  const w = await detailsWorld({ raw: true })
  const raw = value(await w.ledger.reads.content.raw({ ...access(), result: w.reference.result }))
  const read = {
    ...access(),
    result: w.reference.result,
    attachment: raw.content,
    after: null,
    maxBytes: 100,
  }
  expect(await w.ledger.reads.content.read(read)).toHaveProperty('failure.kind', 'unsupported')
  w.state.revoked = true
  expect(await w.ledger.reads.content.read(read)).toHaveProperty('failure.kind', 'denied')
})

it('rejects malformed page metadata and snapshots provider values before disclosure confirmation', async () => {
  const w = await detailsWorld()
  const first = value(
    await w.queries.readResult({ ...w.access, result: w.reference.result, after: null }),
  )
  const page = {
    ...first,
    next: null,
    value: { ...first.value, content: [...first.value.content] },
  }
  const configuration = {
    cursorKey: w.cursorKey,
    authority: w.reference.authority,
    baseGuard: { qualify: async () => ({ kind: 'allowed' as const }) },
    limits: { maxBytes: 4_194_304, timeoutMs: 1000 },
  }
  const bad = createScheduleToolDetails({
    ...configuration,
    disclosure: w.disclosure,
    queries: {
      readResult: async () =>
        succeed({ ...page, terminal: { kind: 'completed', extra: 'unexpected-field' } }),
    },
  })
  expect(await bad.reference({ access: w.access, result: w.reference.result })).toHaveProperty(
    'failure.kind',
    'invalid',
  )
  const snapshot = createScheduleToolDetails({
    ...configuration,
    queries: { readResult: async () => succeed(page) },
    disclosure: {
      ...w.disclosure,
      confirm: async ({ observed }) => {
        page.value.content.length = 0
        return succeed(observed)
      },
    },
  })
  const read = value(await snapshot.read({ access: w.access, reference: w.reference, after: null }))
  expect(read.value.content).toHaveLength(1)
  expect(page.value.content).toHaveLength(0)
})
