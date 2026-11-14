import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SessionFailure } from '@omne-harness/session-contract'
import { acceptOperation } from '../src/derivation.ts'
import { openRequestJournal } from '../src/request-journal.ts'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type FixtureLogin,
  type World,
} from './fixtures/world.ts'

const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65536,
  maxNumberLength: 32,
}

type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

function json(value: object): JsonObject {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok' || read.value.kind !== 'object')
    throw new Error('fixture json did not read')
  return read.value
}

function userMessage(text: string): JsonObject {
  return json({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [{ kind: 'text', id: 'block-1', visibility: { toHuman: true, toModel: true }, text }],
  })
}

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const SUCCEEDED = { outcome: 'succeeded', body: { recovered: false } }
const UNAVAILABLE: SessionFailure = { kind: 'unavailable', owner: 'storage', diagnostic: 'busy' }
const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })

async function created(world: World): Promise<string> {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session
}

type Sent = Readonly<{ who?: FixtureLogin; acceptId?: string; text?: string }>

function send(world: World, session: string, sent: Sent = {}) {
  return ops(world)['send-input'](as(loginIdentity(sent.who ?? ALICE)), {
    tenant: ALICE.tenant,
    session,
    acceptId: sent.acceptId ?? 'accept-1',
    inputId: 'input-1',
    message: userMessage(sent.text ?? 'hi'),
  })
}

function query(world: World, session: string, who: FixtureLogin = ALICE) {
  return ops(world)['query-send-input'](as(loginIdentity(who)), {
    tenant: ALICE.tenant,
    session,
    acceptId: 'accept-1',
  })
}

const accepts = (world: World) =>
  world.session.controls.calls().filter(call => call.method === 'accept')
const acceptCommits = (world: World) =>
  [...world.session.controls.committed().values()].filter(commit => commit.kind === 'accept')
const recordKinds = (world: World) => world.journal.records().map(record => record.kind)

describe('send-input through the request queue', () => {
  it('queues the request, admits it with the principal resumed from the queue, and lets it leave', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await send(world, session)).toEqual(SUCCEEDED)
    const key = { tenant: ALICE.tenantText, session, acceptId: 'accept-1' }
    expect(world.journal.records()).toEqual([
      {
        kind: 'enqueued',
        ...key,
        inputId: 'input-1',
        message: writeJsonText(userMessage('hi')),
        login: ALICE.loginText,
        seq: 0,
      },
      { kind: 'left', ...key },
    ])
    expect(world.resumes()).toEqual([{ tenant: ALICE.tenantText, login: ALICE.loginText }])
    expect(accepts(world)).toHaveLength(1)
    expect(accepts(world)[0]?.operation).toBe(
      acceptOperation(ALICE.tenantText, session, 'accept-1'),
    )
    expect(accepts(world)[0]?.principal).toMatchObject({
      kind: 'acting-for-tenant',
      work: { owner: 'identity-login', work: ALICE.loginText },
    })
  })

  it('keeps the request waiting while Session is unavailable, and answers once, succeeded', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext(UNAVAILABLE, UNAVAILABLE)
    expect(await send(world, session)).toEqual(SUCCEEDED)
    expect(accepts(world)).toHaveLength(3)
    expect(recordKinds(world)).toEqual(['enqueued', 'left'])
  })

  it('admits again after Session answers commit-unknown', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failNext({ kind: 'commit-unknown', operation: 'op' } as SessionFailure)
    expect(await send(world, session)).toEqual(SUCCEEDED)
    expect(accepts(world)).toHaveLength(2)
  })

  it.each([
    [{ kind: 'quarantined', diagnostic: 'x' }],
    [{ kind: 'unsupported' }],
    [{ kind: 'terminal' }],
  ])(
    'answers basis-unavailable once to the Session failure %j, and takes the next request',
    async failure => {
      const world = createWorld()
      const session = await created(world)
      world.session.controls.failNext(failure as SessionFailure)
      const first = send(world, session, { acceptId: 'accept-1' })
      const second = send(world, session, { acceptId: 'accept-2' })
      expect(await first).toEqual({ outcome: 'basis-unavailable' })
      expect(await second).toEqual(SUCCEEDED)
      expect(accepts(world).map(call => call.operation)).toEqual([
        acceptOperation(ALICE.tenantText, session, 'accept-1'),
        acceptOperation(ALICE.tenantText, session, 'accept-2'),
      ])
      expect(recordKinds(world)).toEqual(['enqueued', 'enqueued', 'left', 'left'])
      expect(await query(world, session)).toEqual({ outcome: 'not-committed', body: {} })
    },
  )

  it('admits again under the same identity when the result is not known, and Session recalls it', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.loseAnswers(1)
    expect(await send(world, session)).toEqual({ outcome: 'succeeded', body: { recovered: true } })
    expect(accepts(world).map(call => call.operation)).toEqual([
      acceptOperation(ALICE.tenantText, session, 'accept-1'),
      acceptOperation(ALICE.tenantText, session, 'accept-1'),
    ])
    expect(acceptCommits(world)).toHaveLength(1)
  })

  it('admits again when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('accept', new Error('boom'))
    const answer = send(world, session)
    await vi.waitFor(() => expect(accepts(world).length).toBeGreaterThanOrEqual(2))
    world.session.controls.restore()
    expect(await answer).toEqual(SUCCEEDED)
  })

  it('admits once more after a restart that lost the leave, without a second message', async () => {
    const world = createWorld()
    const session = await created(world)
    world.journal.refuse(record => record.kind === 'left')
    expect(await send(world, session)).toEqual(SUCCEEDED)
    world.journal.refuse(undefined)
    world.restart()
    await vi.waitFor(() => expect(world.journal.open().pending).toEqual([]))
    expect(accepts(world)).toHaveLength(2)
    expect(acceptCommits(world)).toHaveLength(1)
  })

  it('admits after a restart a request that was queued and never admitted', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    void send(world, session)
    await vi.waitFor(() => expect(world.admissions().length).toBeGreaterThanOrEqual(1))
    world.restart()
    world.put('faces')
    await vi.waitFor(() => expect(acceptCommits(world)).toHaveLength(1))
    expect(await query(world, session)).toEqual({ outcome: 'succeeded', body: {} })
  })

  it('admits the request of a call that no longer waits', async () => {
    const world = createWorld()
    const session = await created(world)
    const call = new AbortController()
    world.session.controls.failWith(UNAVAILABLE)
    void ops(world)['send-input'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal: call.signal },
      {
        tenant: ALICE.tenant,
        session,
        acceptId: 'accept-1',
        inputId: 'input-1',
        message: userMessage('hi'),
      },
    )
    await vi.waitFor(() => expect(accepts(world).length).toBeGreaterThanOrEqual(1))
    call.abort()
    world.session.controls.restore()
    await vi.waitFor(() => expect(acceptCommits(world)).toHaveLength(1))
    expect(await query(world, session)).toEqual({ outcome: 'succeeded', body: {} })
  })

  it('keeps the request waiting while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    const answer = send(world, session)
    await vi.waitFor(() => expect(world.admissions().length).toBeGreaterThanOrEqual(2))
    expect(accepts(world)).toHaveLength(0)
    world.put('faces')
    expect(await answer).toEqual(SUCCEEDED)
  })

  it.each(['basis-unavailable', 'throw'] as const)(
    'keeps the request waiting while identity answers %s to the resume',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      world.refuseResumes(refusal)
      const answer = send(world, session)
      await vi.waitFor(() => expect(world.resumes().length).toBeGreaterThanOrEqual(2))
      expect(accepts(world)).toHaveLength(0)
      world.refuseResumes(undefined)
      expect(await answer).toEqual(SUCCEEDED)
    },
  )

  it('answers denied and lets the request leave when identity denies the resume', async () => {
    const world = createWorld()
    const session = await created(world)
    world.refuseResumes('denied')
    expect(await send(world, session)).toEqual({ outcome: 'denied' })
    expect(recordKinds(world)).toEqual(['enqueued', 'left'])
    expect(accepts(world)).toHaveLength(0)
  })

  it('answers basis-unavailable and admits nothing when the journal does not take the request', async () => {
    const world = createWorld()
    const session = await created(world)
    world.journal.refuse(record => record.kind === 'enqueued')
    expect(await send(world, session)).toEqual({ outcome: 'basis-unavailable' })
    expect(accepts(world)).toHaveLength(0)
    expect(await query(world, session)).toEqual({ outcome: 'not-committed', body: {} })
  })
})

describe('what does not enter the queue', () => {
  it('a message that is not a user message', async () => {
    const world = createWorld()
    const session = await created(world)
    const answer = await ops(world)['send-input'](as(loginIdentity(ALICE)), {
      tenant: ALICE.tenant,
      session,
      acceptId: 'accept-1',
      inputId: 'input-1',
      message: json({ role: 'assistant' }),
    })
    expect(answer).toEqual({ outcome: 'protocol-rejected' })
    expect(world.journal.records()).toEqual([])
  })

  it('a login of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await send(world, session, { who: BOB })).toEqual({ outcome: 'denied' })
    expect(world.journal.records()).toEqual([])
    expect(world.resumes()).toEqual([])
  })

  it.each(['denied', 'basis-unavailable', 'throw'] as const)(
    'a login identity answers %s for',
    async refusal => {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      const answer = await send(world, session)
      expect(answer.outcome).toBe(refusal === 'throw' ? 'basis-unavailable' : refusal)
      expect(world.journal.records()).toEqual([])
    },
  )
})

describe('a request that is in the queue', () => {
  it('is unknown to query-send-input, also while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    const answer = send(world, session)
    await vi.waitFor(() => expect(world.admissions().length).toBeGreaterThanOrEqual(1))
    expect(await query(world, session)).toEqual({ outcome: 'unknown' })
    expect(await query(world, session, BOB)).toEqual({ outcome: 'denied' })
    world.put('faces')
    expect(await answer).toEqual(SUCCEEDED)
    expect(await query(world, session)).toEqual({ outcome: 'succeeded', body: {} })
  })

  it('gives its answer to a second call with the same content, and conflict to other content', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    const first = send(world, session)
    const second = send(world, session)
    expect(await send(world, session, { text: 'other' })).toEqual({ outcome: 'conflict', body: {} })
    world.put('faces')
    expect(await first).toEqual(SUCCEEDED)
    expect(await second).toEqual(SUCCEEDED)
    expect(accepts(world)).toHaveLength(1)
    expect(recordKinds(world)).toEqual(['enqueued', 'left'])
  })

  it('answers limited with the bound of the queue when the queue of the session is full', async () => {
    const world = createWorld({ requestQueueLimit: 2 })
    const session = await created(world)
    world.remove('faces')
    const first = send(world, session, { acceptId: 'accept-1' })
    const second = send(world, session, { acceptId: 'accept-2' })
    expect(await send(world, session, { acceptId: 'accept-3' })).toEqual({
      outcome: 'limited',
      body: { resource: 'pending-inputs', limit: 2 },
    })
    world.put('faces')
    expect(await first).toEqual(SUCCEEDED)
    expect(await second).toEqual(SUCCEEDED)
    expect(accepts(world).map(call => call.operation)).toEqual([
      acceptOperation(ALICE.tenantText, session, 'accept-1'),
      acceptOperation(ALICE.tenantText, session, 'accept-2'),
    ])
  })
})

describe('what a send-input call leaves in the journal file (R6)', () => {
  const SENTINEL = 'login-proof-sentinel-3f9c'

  it('writes the login text and nothing else of the login', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'send-input-queue-')))
    try {
      const file = join(directory, 'request-queue.jsonl')
      const journal = await openRequestJournal(file)
      const world = createWorld({}, journal)
      const session = await created(world)
      const login = { ...ALICE, proof: SENTINEL, secret: SENTINEL } as unknown as LoginIdentity
      world.remove('faces')
      const answer = ops(world)['send-input'](as(login), {
        tenant: ALICE.tenant,
        session,
        acceptId: 'accept-1',
        inputId: 'input-1',
        message: userMessage('hi'),
      })
      await vi.waitFor(() => expect(world.admissions().length).toBeGreaterThanOrEqual(1))
      const written = readFileSync(file, 'utf8')
      expect(written).toContain(`"login":"${ALICE.loginText}"`)
      expect(written).not.toContain(SENTINEL)
      world.put('faces')
      expect(await answer).toEqual(SUCCEEDED)
      world.requests.stop()
      await journal.close()
      expect(readFileSync(file, 'utf8')).toBe('')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
