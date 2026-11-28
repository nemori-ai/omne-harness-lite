import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import { createSessionDiagnosticsContribution } from '../src/contribution.ts'
import {
  KINDS,
  createWorld,
  fixtureLogin,
  runEntries,
  type FixtureLogin,
  type World,
  type WorldOptions,
} from './fixtures/world.ts'

const operation = sessionDiagnosticsProtocol.operations['read-session-diagnostics']
const SESSION = 'a'.repeat(64)
const UNKNOWN_SESSION = 'f'.repeat(64)
const limits: JsonLimits = {
  maxBytes: 1_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 256,
  maxStringLength: 100_000,
  maxNumberLength: 32,
}

type Page = Readonly<{
  runs: readonly Readonly<{ run: string; terminal: unknown; modelCalls: readonly unknown[] }>[]
  next: string | null
  exhausted: boolean
  basis: Readonly<{ upper: string }>
  gaps: readonly Readonly<{ source: string; subject: string; reason: string }>[]
}>

const alice = fixtureLogin('a')
const bob = fixtureLogin('b')

function setup(options: WorldOptions = {}, login: FixtureLogin = alice) {
  const world = createWorld(options)
  world.addSession(login, SESSION)
  return world
}

const first = (world: World, login: FixtureLogin, extra: Record<string, unknown> = {}) =>
  world.read(login, {
    tenant: login.tenant,
    session: SESSION,
    cursor: null,
    run: null,
    pageBytes: '1024',
    ...extra,
  } as never)

const onward = (world: World, login: FixtureLogin, cursor: string, session = SESSION) =>
  world.read(login, { tenant: login.tenant, session, cursor })

function pageOf(answer: { outcome: string }): Page {
  if (answer.outcome !== 'succeeded') throw new Error(`expected a page, got ${answer.outcome}`)
  return (answer as unknown as { body: Page }).body
}

function written(answer: { outcome: string }): string {
  const codec = (operation.outcomes as Record<string, unknown>)[answer.outcome]
  if (codec === true) return answer.outcome
  const body = (answer as unknown as { body: unknown }).body
  const result = (
    codec as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  ).write(body, limits)
  if (!result.ok) throw new Error(`${answer.outcome} was not written by its contract codec`)
  return `${answer.outcome}:${writeJsonText(result.value as never)}`
}

describe('the first page and the pages after it', () => {
  it('reads the first page from begin with the configured kinds, backward from the newest, and the next page from the cursor', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const firstPageAnswer = await first(world, alice)
    const page = pageOf(firstPageAnswer)
    expect(Object.keys(page).sort()).toEqual([
      'basis',
      'exhausted',
      'gaps',
      'next',
      'runs',
      'scannedThrough',
    ])
    expect(page.runs.map(run => run.run)).toEqual(['r2'])
    expect(page.runs[0]!.terminal).toEqual({
      outcome: 'failed',
      cause: {
        record: 'model-refused',
        structured: { kind: 'model-refused', failure: 'denied' },
      },
    })
    expect(page.runs[0]!.modelCalls[0]).toMatchObject({
      reference: 'm-r2',
      call: { kind: 'unknown', reason: 'not-accepted' },
    })
    expect(page.basis).toEqual({ upper: '7' })
    expect(page.exhausted).toBe(false)
    expect(page.next).not.toBeNull()
    expect(world.begins[0]).toEqual({
      kinds: KINDS,
      from: null,
      direction: 'backward',
      pageBytes: 1024,
    })
    const next = pageOf(await onward(world, alice, page.next as string))
    expect(next.runs.map(run => run.run)).toEqual(['r1'])
    expect(next.exhausted).toBe(true)
    expect(next.next).toBeNull()
    expect(world.begins[1]).toMatchObject({
      kinds: KINDS,
      from: 'e4',
      direction: 'backward',
      pageBytes: 1024,
    })
  })

  it('answers through the result set of the contract: the page is written by the succeeded codec', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1))
    const answer = await first(world, alice)
    expect(written(answer).startsWith('succeeded:{')).toBe(true)
    expect(Object.keys(operation.outcomes)).toContain(answer.outcome)
  })

  it('filters to one run and gives no cursor for it', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const page = pageOf(await first(world, alice, { run: 'r1' }))
    expect(page.runs.map(run => run.run)).toEqual(['r1'])
    expect(page.exhausted).toBe(true)
    expect(page.next).toBeNull()
  })

  it('keeps the basis of the first page on a continued page: an append after the first page does not move basis.upper', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4), ...runEntries('r3', 7))
    const one = pageOf(await first(world, alice))
    expect(one.basis).toEqual({ upper: '7' })
    world.setUpper('8')
    const two = pageOf(await onward(world, alice, one.next as string))
    expect(two.runs.map(run => run.run)).toEqual(['r2'])
    expect(two.basis).toEqual({ upper: '7' })
    const three = pageOf(await onward(world, alice, two.next as string))
    expect(three.runs.map(run => run.run)).toEqual(['r1'])
    expect(three.basis).toEqual({ upper: '7' })
    expect(three.exhausted).toBe(true)
    expect(pageOf(await first(world, alice)).basis).toEqual({ upper: '8' })
  })
})

describe('a null cursor and a cursor exclude each other', () => {
  it.each([
    ['a null cursor without run', { cursor: null, pageBytes: '10' }],
    ['a null cursor without pageBytes', { cursor: null, run: null }],
    ['a cursor beside run', { cursor: 'c', run: null }],
    ['a cursor beside pageBytes', { cursor: 'c', pageBytes: '10' }],
    ['a cursor beside run and pageBytes', { cursor: 'c', run: null, pageBytes: '10' }],
  ])('the contract refuses %s before the handler is reached', (_label, rest) => {
    const body = { tenant: alice.tenantText, session: SESSION, ...rest }
    const parsed = JSON.stringify(body)
    const read = readJsonText(parsed, limits)
    if (read.kind !== 'ok') throw new Error('fixture json did not read')
    expect(operation.body.read(read.value, limits).ok).toBe(false)
  })
})

describe('the page bound', () => {
  it('answers invalid to pageBytes over the deployment bound without calling Session, and reads at the bound', async () => {
    const world = setup({ settings: { maxPageBytes: 1000 } })
    const over = await first(world, alice, { pageBytes: '1001' })
    expect(over).toEqual({ outcome: 'invalid', body: {} })
    expect(world.calls).toEqual([])
    const wider = await first(world, alice, { pageBytes: '10000' })
    expect(wider.outcome).toBe('invalid')
    const at = await first(world, alice, { pageBytes: '1000' })
    expect(at.outcome).toBe('succeeded')
    const under = await first(world, alice, { pageBytes: '999' })
    expect(under.outcome).toBe('succeeded')
  })
})

describe('refusals disclose nothing', () => {
  it('answers the same denied, written the same, to another tenant, to an unknown session and to a refused principal', async () => {
    const world = setup()
    world.addSession(bob, 'b'.repeat(64))
    const answers = [
      await world.read(bob, {
        tenant: alice.tenant,
        session: SESSION,
        cursor: null,
        run: null,
        pageBytes: '10',
      }),
      await world.read(alice, {
        tenant: alice.tenant,
        session: UNKNOWN_SESSION,
        cursor: null,
        run: null,
        pageBytes: '10',
      }),
      await world.read(bob, {
        tenant: bob.tenant,
        session: SESSION,
        cursor: null,
        run: null,
        pageBytes: '10',
      }),
    ]
    for (const answer of answers) {
      expect(answer).toEqual({ outcome: 'denied' })
      expect(written(answer)).toBe(written(answers[0]!))
    }
    expect(Object.keys(answers[1]!)).toEqual(['outcome'])
  })

  it('answers the principal refusal as the port gave it, and basis-unavailable when the port throws', async () => {
    const denied = setup()
    denied.refuseAsk(0, 'denied')
    expect(await first(denied, alice)).toEqual({ outcome: 'denied' })
    expect(denied.calls).toEqual([])
    const unavailable = setup()
    unavailable.refuseAsk(0, 'basis-unavailable')
    expect(await first(unavailable, alice)).toEqual({ outcome: 'basis-unavailable' })
    const thrown = setup()
    thrown.refuseAsk(0, 'throw')
    expect(await first(thrown, alice)).toEqual({ outcome: 'basis-unavailable' })
    expect(thrown.calls).toEqual([])
  })
})

describe('a read that cannot be answered', () => {
  it('answers basis-unavailable when the Session read throws', async () => {
    const world = setup()
    world.throwOnBegin()
    expect(await first(world, alice)).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable when Session is not on the tree, with the protocol still answering', async () => {
    const world = setup()
    world.removeFaces()
    expect(await first(world, alice)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.calls).toEqual([])
  })
})

describe('a failure of the Session read', () => {
  it.each([
    [{ kind: 'denied', action: 'history' }, { outcome: 'denied' }],
    [
      { kind: 'invalid', field: 'cursor', reason: 'x' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'unavailable', owner: 'session', diagnostic: 'x' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'quarantined', diagnostic: 'x' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unsupported' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'not-found' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps %j to %j and nothing else', async (failure, answer) => {
    const world = setup()
    world.failHistory(failure)
    expect(await first(world, alice)).toEqual(answer)
  })
})

describe('the three projection settings', () => {
  it('answer basis-unavailable before Session when none is given', async () => {
    const world = setup({
      settings: { diagnosticsKinds: undefined, maxRuns: undefined, maxCallsPerRun: undefined },
    })
    expect(await first(world, alice)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.calls).toEqual([])
  })

  it.each([
    ['diagnosticsKinds', { diagnosticsKinds: undefined }],
    ['maxRuns', { maxRuns: undefined }],
    ['maxCallsPerRun', { maxCallsPerRun: undefined }],
  ])('answer basis-unavailable before Session when %s alone is missing', async (_name, missing) => {
    const world = setup({ settings: missing })
    expect(await first(world, alice)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.calls).toEqual([])
  })
})

describe('the cursor', () => {
  it('answers invalid to a tampered cursor, to the cursor of another session and to a forged one', async () => {
    const world = setup()
    world.addSession(alice, 'c'.repeat(64))
    world.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const cursor = pageOf(await first(world, alice)).next as string
    const middle = Math.floor(cursor.indexOf('.') / 2)
    const tampered = `${cursor.slice(0, middle)}${cursor[middle] === 'A' ? 'B' : 'A'}${cursor.slice(middle + 1)}`
    const calls = world.calls.length
    for (const [name, answer] of [
      ['tampered', await onward(world, alice, tampered)],
      ['another session', await onward(world, alice, cursor, 'c'.repeat(64))],
      ['forged', await onward(world, alice, 'forged')],
    ] as const)
      expect(answer, name).toEqual({ outcome: 'invalid', body: {} })
    expect(world.calls.length).toBe(calls)
  })

  it('judges eligibility again when continuing: a member that left is denied', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const cursor = pageOf(await first(world, alice)).next as string
    world.forgetMembers()
    world.refuseAsk(world.principalAsks.length + 1, 'denied')
    expect(await onward(world, alice, cursor)).toEqual({ outcome: 'denied' })
  })

  it('opens only the cursors of the contribution that sealed them', async () => {
    const one = setup()
    one.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const cursor = pageOf(await first(one, alice)).next as string
    const other = setup()
    other.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    expect(await onward(other, alice, cursor)).toEqual({ outcome: 'invalid', body: {} })
  })
})

describe('the check before the answer', () => {
  it('asks the principal port again after the projection and gives the page only if it still answers', async () => {
    const world = setup()
    world.entries.push(...runEntries('private-run', 1))
    const answer = await first(world, alice)
    expect(answer.outcome).toBe('succeeded')
    expect(world.principalAsks).toEqual([alice.tenantText, alice.tenantText])
  })

  it.each(['denied', 'basis-unavailable', 'throw'] as const)(
    'withholds the whole page when the second answer of the port is %s',
    async refusal => {
      const world = setup()
      world.entries.push(...runEntries('private-run', 1))
      world.refuseAsk(1, refusal)
      const answer = await first(world, alice)
      expect(answer).toEqual({ outcome: refusal === 'throw' ? 'basis-unavailable' : refusal })
      expect(world.calls).toEqual(['history.begin'])
      expect(JSON.stringify(answer)).not.toContain('private-run')
    },
  )
})

describe('absent ports and the read-only promise', () => {
  it('answers gaps for the Model and Tool branches when their ports are absent, and reads the end from Session', async () => {
    const world = setup({ ports: false })
    world.entries.push(...runEntries('r1', 1))
    const page = pageOf(await first(world, alice))
    expect(page.gaps.filter(gap => gap.reason === 'not-disclosed')).toHaveLength(11)
    expect(page.gaps.filter(gap => gap.reason !== 'not-disclosed')).toEqual([
      { source: 'model', subject: 'm-r1', reason: 'unsupported' },
    ])
    expect(page.runs[0]!.terminal).toMatchObject({
      cause: { structured: { kind: 'model-refused', failure: 'denied' } },
    })
  })

  it('writes nothing to Session, Model or Tool', async () => {
    const world = setup()
    world.entries.push(...runEntries('r1', 1))
    const answer = await first(world, alice)
    expect(answer.outcome).toBe('succeeded')
    expect(world.calls).toEqual(['history.begin'])
    expect(world.writes()).toBe(0)
  })
})

describe('the contribution', () => {
  it('has exactly the one operation and no observation', () => {
    const contribution = createSessionDiagnosticsContribution({
      faces: () => undefined,
      principals: { actingFor: async () => ({ refused: 'denied' }) },
      settings: { maxPageBytes: 1 },
    })
    expect(Object.keys(contribution.operations)).toEqual(['read-session-diagnostics'])
    expect(Object.keys(contribution.observations)).toEqual([])
  })
})
