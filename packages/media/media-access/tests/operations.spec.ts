import { describe, expect, it } from 'vitest'
import { createWorld, fixtureLogin, loginIdentity, type World } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal
const ref = {
  storage: 'local',
  key: '0123456789abcdef0123456789abcdef',
  mediaType: 'image/png',
  bytes: '11',
  digest: 'sha256:9104',
}
const facts = { kind: 'image', widthPixels: 4, heightPixels: 3 }
const part = new Uint8Array([1, 2, 3])
const target = { mediaTypes: ['image/webp'], maxBytes: 100, maxWidth: 8, maxHeight: 8 }

/** Each operation: its body, the method of the domain it calls, whether it commits, and what it hands over. */
const OPERATIONS = {
  'begin-upload': {
    body: { tenant: ALICE.tenant, upload: 'up-1', mediaType: 'image/png', bytes: 11 },
    method: 'begin',
    commits: true,
    input: { tenant: ALICE.tenant, upload: 'up-1', mediaType: 'image/png', bytes: 11 },
  },
  'append-upload-part': {
    body: { tenant: ALICE.tenant, upload: 'up-1', sequence: 2, part },
    method: 'append',
    commits: true,
    input: { tenant: ALICE.tenant, upload: 'up-1', sequence: 2, part },
  },
  'commit-upload': {
    body: { tenant: ALICE.tenant, upload: 'up-1', digest: 'sha256:9104' },
    method: 'commit',
    commits: true,
    input: { tenant: ALICE.tenant, upload: 'up-1', digest: 'sha256:9104' },
  },
  'query-upload': {
    body: { tenant: ALICE.tenant, upload: 'up-1' },
    method: 'status',
    commits: false,
    input: { tenant: ALICE.tenant, upload: 'up-1' },
  },
  'read-media-page': {
    body: { tenant: ALICE.tenant, ref, offset: 8, limit: 4 },
    method: 'page',
    commits: false,
    input: { tenant: ALICE.tenant, ref, offset: 8, limit: 4, target: null },
  },
  'describe-media': {
    body: { tenant: ALICE.tenant, ref },
    method: 'describe',
    commits: false,
    input: { tenant: ALICE.tenant, ref },
  },
} as const
type Name = keyof typeof OPERATIONS
const NAMES = Object.keys(OPERATIONS) as Name[]

function call(world: World, name: Name, body: unknown = OPERATIONS[name].body) {
  const handler = world.contribution.operations[name] as (
    call: unknown,
    body: unknown,
  ) => Promise<unknown>
  return handler({ principal: loginIdentity(ALICE), messageId: 'm-1', signal }, body)
}
const answering = (name: Name, reply: unknown) => {
  const world = createWorld()
  world.answer(OPERATIONS[name].method, reply)
  return world
}

describe('every operation of media/v1', () => {
  it.each(NAMES)(
    '%s asks whether this login may act for the tenant, with the tenant as text',
    async name => {
      const world = answering(name, { ok: null })
      await call(world, name).catch(() => undefined)
      expect(world.asked).toEqual([{ account: ALICE.account, tenant: ALICE.tenantText }])
    },
  )

  it.each(NAMES)(
    '%s is denied before the domain is touched when the login may not act',
    async name => {
      const world = createWorld()
      world.refuseTargets('denied')
      expect(await call(world, name)).toEqual({ outcome: 'denied' })
      expect(world.calls).toEqual([])
    },
  )

  it.each(NAMES)(
    '%s answers basis-unavailable when the acting cannot be judged or judging it breaks',
    async name => {
      for (const refusal of ['basis-unavailable', 'throw'] as const) {
        const world = createWorld()
        world.refuseTargets(refusal)
        expect(await call(world, name)).toEqual({ outcome: 'basis-unavailable' })
        expect(world.calls).toEqual([])
      }
    },
  )

  it.each(NAMES)('%s answers basis-unavailable while the media face is not there', async name => {
    const world = createWorld()
    world.removeFace()
    expect(await call(world, name)).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each(NAMES)(
    '%s hands the domain what the body says, for the tenant of the body',
    async name => {
      const world = answering(name, { failure: { kind: 'unavailable', dependency: 'index' } })
      await call(world, name)
      expect(world.calls).toEqual([
        { method: OPERATIONS[name].method, input: OPERATIONS[name].input },
      ])
    },
  )

  it.each(NAMES)(
    '%s answers basis-unavailable when the domain says a dependency is unavailable',
    async name => {
      const world = answering(name, { failure: { kind: 'unavailable', dependency: 'store' } })
      expect(await call(world, name)).toEqual({ outcome: 'basis-unavailable' })
    },
  )

  it.each(NAMES)(
    '%s: a domain that throws is unknown for a commit and basis-unavailable for a read',
    async name => {
      const world = answering(name, () => {
        throw new Error('the domain broke')
      })
      expect(await call(world, name)).toEqual({
        outcome: OPERATIONS[name].commits ? 'unknown' : 'basis-unavailable',
      })
    },
  )

  it.each(NAMES.filter(name => OPERATIONS[name].commits))(
    '%s answers unknown when the domain does not know whether its write took effect',
    async name => {
      const world = answering(name, { failure: { kind: 'outcome-unknown' } })
      expect(await call(world, name)).toEqual({ outcome: 'unknown' })
    },
  )
})

const uploading = { kind: 'uploading', ticket: { upload: 'up-1', nextSequence: 2, partBytes: 8 } }
const committed = { kind: 'committed', committed: { ref, facts } }
const page = { part, next: 11, mediaType: 'image/png', bytes: 11, facts }

describe('what the domain answers becomes an outcome of the protocol', () => {
  it.each([
    [
      'begin-upload',
      { ok: uploading },
      {
        outcome: 'succeeded',
        body: { status: { kind: 'uploading', nextSequence: 2, partBytes: 8 } },
      },
    ],
    [
      'begin-upload',
      { ok: committed },
      { outcome: 'succeeded', body: { status: { kind: 'committed', ref, facts } } },
    ],
    [
      'begin-upload',
      { failure: { kind: 'too-large', limit: 64 } },
      { outcome: 'limited', body: { limit: 64 } },
    ],
    [
      'begin-upload',
      { failure: { kind: 'unsupported-type' } },
      { outcome: 'unsupported', body: {} },
    ],
    [
      'begin-upload',
      { failure: { kind: 'invalid', field: 'upload' } },
      { outcome: 'invalid', body: { field: 'upload' } },
    ],
    [
      'begin-upload',
      { failure: { kind: 'invalid', field: 'bytes' } },
      { outcome: 'invalid', body: { field: 'bytes' } },
    ],
    [
      'append-upload-part',
      { ok: { nextSequence: 3 } },
      { outcome: 'succeeded', body: { nextSequence: 3 } },
    ],
    ['append-upload-part', { failure: { kind: 'not-found' } }, { outcome: 'not-found', body: {} }],
    [
      'append-upload-part',
      { failure: { kind: 'committed' } },
      { outcome: 'conflict', body: { reason: 'committed' } },
    ],
    [
      'append-upload-part',
      { failure: { kind: 'conflict' } },
      { outcome: 'conflict', body: { reason: 'other-bytes' } },
    ],
    [
      'append-upload-part',
      { failure: { kind: 'gap', nextSequence: 1 } },
      { outcome: 'invalid', body: { reason: 'gap', nextSequence: 1 } },
    ],
    [
      'append-upload-part',
      { failure: { kind: 'beyond-declared' } },
      { outcome: 'invalid', body: { reason: 'beyond-declared' } },
    ],
    [
      'append-upload-part',
      { failure: { kind: 'part-too-large', limit: 8 } },
      { outcome: 'limited', body: { limit: 8 } },
    ],
    ['commit-upload', { ok: { ref, facts } }, { outcome: 'succeeded', body: { ref, facts } }],
    ['commit-upload', { failure: { kind: 'not-found' } }, { outcome: 'not-found', body: {} }],
    [
      'commit-upload',
      { failure: { kind: 'incomplete', nextSequence: 1 } },
      { outcome: 'invalid', body: { reason: 'incomplete', nextSequence: 1 } },
    ],
    [
      'commit-upload',
      { failure: { kind: 'digest-mismatch' } },
      { outcome: 'invalid', body: { reason: 'digest-mismatch' } },
    ],
    [
      'commit-upload',
      { failure: { kind: 'type-mismatch' } },
      { outcome: 'invalid', body: { reason: 'type-mismatch' } },
    ],
    [
      'commit-upload',
      { failure: { kind: 'over-budget' } },
      { outcome: 'invalid', body: { reason: 'over-budget' } },
    ],
    [
      'query-upload',
      { ok: uploading },
      {
        outcome: 'succeeded',
        body: { status: { kind: 'uploading', nextSequence: 2, partBytes: 8 } },
      },
    ],
    [
      'query-upload',
      { ok: committed },
      { outcome: 'succeeded', body: { status: { kind: 'committed', ref, facts } } },
    ],
    ['query-upload', { failure: { kind: 'not-found' } }, { outcome: 'not-found', body: {} }],
    ['read-media-page', { ok: page }, { outcome: 'succeeded', body: page }],
    [
      'read-media-page',
      { failure: { kind: 'invalid-reference' } },
      { outcome: 'not-found', body: { reason: 'reference' } },
    ],
    [
      'read-media-page',
      { failure: { kind: 'material-unavailable' } },
      { outcome: 'not-found', body: { reason: 'material' } },
    ],
    ['read-media-page', { failure: { kind: 'too-large' } }, { outcome: 'limited', body: {} }],
    [
      'describe-media',
      { ok: { state: 'held', facts } },
      { outcome: 'succeeded', body: { state: 'held', facts } },
    ],
    [
      'describe-media',
      { failure: { kind: 'invalid-reference' } },
      { outcome: 'not-found', body: {} },
    ],
  ] as const)('%s: %j', async (name, reply, answer) => {
    expect(await call(answering(name, reply), name)).toEqual(answer)
  })

  it('read-media-page hands the target for display on when the body has one', async () => {
    const world = answering('read-media-page', { ok: page })
    await call(world, 'read-media-page', { ...OPERATIONS['read-media-page'].body, target })
    expect(world.calls[0]?.input).toEqual({ ...OPERATIONS['read-media-page'].input, target })
  })

  it('a tenant that is no minted tenant identity is a fault of the caller', async () => {
    const world = answering('describe-media', { ok: { state: 'held', facts } })
    await expect(call(world, 'describe-media', { tenant: {}, ref })).rejects.toThrow(
      'tenant is not a minted TenantId',
    )
    expect(world.calls).toEqual([])
  })
})
