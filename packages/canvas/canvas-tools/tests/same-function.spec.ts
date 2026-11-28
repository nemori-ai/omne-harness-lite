import { describe, expect, it } from 'vitest'
import type { AnswerOf, Principal } from '@omne-harness/access-cordis-contract'
import { createCanvasContribution } from '@omne-harness/canvas-access'
import type { CanvasOperations } from '@omne-harness/canvas-contract'
import { canvasProtocol, type CanvasProtocol } from '@omne-harness/canvas-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { caller, domain, media, OTHER, personOf, SESSION, TENANT } from './world.ts'

type Operations = CanvasProtocol['operations']
type Name = keyof Operations
const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('not JSON')
  return read.value
}

/** A person's call of canvas/v1 as the entry makes it: the body read off the wire, the answer written back. */
function protocolOn(face: CanvasOperations) {
  const principal = { principal: 'issued' } as unknown as Principal
  const contribution = createCanvasContribution({
    principals: {
      actingFor: async () => ({ ok: principal }),
      contextOf: (_issued, tenant) => personOf(tenant),
    },
    face: () => face,
    changes: () => undefined,
  })
  const call = { principal: { login: 'l' }, messageId: 'm-1', signal: new AbortController().signal }
  return async (name: Name, sample: Record<string, unknown>) => {
    const read = canvasProtocol.operations[name].body.read(
      tree({ tenant: TENANT, ...sample }),
      limits,
    )
    if (!read.ok) throw new Error(`${name} body did not read`)
    const handler = contribution.operations[name] as (c: never, b: never) => Promise<unknown>
    const answer = (await handler(call as never, read.value as never)) as AnswerOf<Operations[Name]>
    if (!('body' in answer)) return { outcome: answer.outcome, body: {} as Record<string, any> }
    const codec = (canvasProtocol.operations[name].outcomes as Record<string, any>)[answer.outcome]
    const written = codec.write(answer.body, limits)
    if (!written.ok) throw new Error(`${answer.outcome} did not write`)
    return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) }
  }
}

type Cell = Readonly<{
  outcome: string
  reason?: string
  entry?: Record<string, string>
  revision?: number
  item?: string
}>

const FAILURE = /^([a-z-]+)(?: ([a-z-]+))?(?: (item|pile) ([^\s:]+))?:/

/** The cell a tool answer stands in: outcome name, reason, entry; on success the revision and item. */
function toolCell(answer: { ok: string } | { failure: { reason: string } }): Cell {
  if ('failure' in answer) {
    const [, outcome = '', reason, side, id] = FAILURE.exec(answer.failure.reason) ?? []
    return {
      outcome,
      ...(reason === undefined ? {} : { reason }),
      ...(side === undefined ? {} : { entry: { [side]: id! } }),
    }
  }
  const [head = '', ...rest] = answer.ok.split('\n')
  const body = JSON.parse(rest.join('\n')) as Record<string, any>
  return {
    outcome: head.startsWith('done ') ? 'succeeded' : head.split(' ')[0]!,
    ...(body['revision'] === undefined ? {} : { revision: body['revision'] }),
    ...(body['item'] === undefined ? {} : { item: body['item'].id }),
  }
}

function protocolCell({ outcome, body }: { outcome: string; body: Record<string, any> }): Cell {
  return {
    outcome,
    ...(body['reason'] === undefined ? {} : { reason: body['reason'] }),
    ...(body['entry'] === undefined ? {} : { entry: body['entry'] }),
    ...(body['revision'] === undefined ? {} : { revision: body['revision'] }),
    ...(body['item'] === undefined ? {} : { item: body['item'].id }),
  }
}

type State = 'none' | 'loose' | 'piled' | 'away' | 'locked'
type Ids = Readonly<{ a: string; e: string }>

/** The same arrangement on a tenant, made by its person: a pile p0, a loose item e, and the item a in `state`. */
async function arrange(face: CanvasOperations, tenant: string, state: State): Promise<Ids> {
  const ctx = personOf(tenant)
  const canvas = 'main'
  const put = async (ref: string) => {
    const placed = await face.place(ctx, { canvas, reference: media(ref) })
    if (placed.kind !== 'done') throw new Error(`place ${ref}: ${placed.kind}`)
    return placed.value.item.id as string
  }
  const done = async (answer: Promise<{ kind: string }>) => {
    const read = await answer
    if (read.kind !== 'done') throw new Error(`setup answered ${read.kind}`)
  }
  const c = await put('c')
  const d = await put('d')
  await done(face.pile(ctx, { canvas, pile: 'p0', items: [c, d] }))
  const e = await put('e')
  if (state === 'none') return { a: 'i99', e }
  const a = await put('a')
  if (state === 'piled') {
    const b = await put('b')
    await done(face.pile(ctx, { canvas, pile: 'p1', items: [a, b] }))
  }
  if (state === 'away') await done(face.take(ctx, { canvas, items: [a] }))
  if (state === 'locked') await done(face.lock(ctx, { canvas, items: [a], locked: true }))
  return { a, e }
}

type Call = readonly [string, Record<string, unknown>]
const ITEM_ROWS: Readonly<Record<string, (ids: Ids) => Call>> = {
  place: () => ['place', { reference: media('a') }],
  'arrange move': ({ a }) => ['arrange', { items: [{ item: a, at: { x: 1600, y: 1600 } }] }],
  'arrange resize': ({ a }) => [
    'arrange',
    { items: [{ item: a, size: { width: 200, height: 100 } }] },
  ],
  'arrange to top': ({ a }) => ['arrange', { items: [{ item: a, top: true }] }],
  'arrange into a pile': ({ a }) => ['arrange', { items: [{ item: a, pile: 'p0' }] }],
  'arrange out of its pile': ({ a }) => ['arrange', { items: [{ item: a, pile: null }] }],
  take: ({ a }) => ['take', { items: [a] }],
  pile: ({ a }) => ['pile', { pile: 'p0', items: [a] }],
  lock: ({ a }) => ['lock', { items: [a] }],
  unlock: ({ a }) => ['unlock', { items: [a] }],
}
const PILE_ROWS: Readonly<Record<string, (ids: Ids, pile: string) => Call>> = {
  'arrange move and rename': (_ids, pile) => [
    'arrange',
    { piles: [{ pile, at: { x: 2000, y: 2000 }, name: 'n' }] },
  ],
  'arrange an item into it': ({ e }, pile) => ['arrange', { items: [{ item: e, pile }] }],
  pile: ({ e }, pile) => ['pile', { pile, items: [e] }],
  scatter: (_ids, pile) => ['scatter', { pile }],
}

/** The operation and body of canvas/v1 for a command of the tool and its params. */
function protocolOf([command, params]: Call): readonly [Name, Record<string, unknown>] {
  if (command === 'lock' || command === 'unlock')
    return ['lock', { canvas: 'main', ...params, locked: command === 'lock' }]
  return [command as Name, { canvas: 'main', ...params }]
}

const STATES: readonly State[] = ['none', 'loose', 'piled', 'away', 'locked']
const CASES = [
  ...Object.entries(ITEM_ROWS).flatMap(([row, make]) =>
    STATES.map(state => ({ name: `${row} × ${state}`, state, make: (ids: Ids) => make(ids) })),
  ),
  ...Object.entries(PILE_ROWS).flatMap(([row, make]) =>
    (['there', 'not there'] as const).map(where => ({
      name: `pile: ${row} × ${where}`,
      state: 'none' as State,
      make: (ids: Ids) => make(ids, where === 'there' ? 'p0' : 'p7'),
    })),
  ),
]

type Moved = Readonly<{ by: unknown }>
const unmoved = <T extends Moved>({ by: _by, ...rest }: T) => rest

/** The arrangement of a tenant, on the sheet and taken off, with who moved each. */
async function arrangementOf(face: CanvasOperations, tenant: string) {
  const ctx = personOf(tenant)
  const look = await face.look(ctx, { canvas: 'main' })
  const away = await face.lookAway(ctx, { canvas: 'main', limit: 100 })
  if (look.kind !== 'done' || away.kind !== 'done') throw new Error('look')
  return [...look.value.items, ...look.value.piles, ...away.value.items] as readonly Moved[]
}

describe('one input through canvas/v1 and through the tool', () => {
  it('covers every row of the table of states', () => {
    expect(CASES).toHaveLength(Object.keys(ITEM_ROWS).length * 5 + 4 * 2)
  })

  it('look: the same sheet, items and piles, and who moved each', async () => {
    const d = domain()
    const ids = await arrange(d.canvas, TENANT, 'piled')
    await caller(d.canvas, TENANT).ok('lock', { items: [ids.e] })
    const byPerson = await protocolOn(d.canvas)('look', { canvas: 'main' })
    const byAgent = await caller(d.canvas, TENANT).ok('look')
    expect(byPerson.outcome).toBe('succeeded')
    expect(byAgent.value).toEqual(byPerson.body)
  })

  it.each(CASES)('$name: the same answer and the same arrangement but for who', async c => {
    const d = domain()
    const person = await arrange(d.canvas, TENANT, c.state)
    const agent = await arrange(d.canvas, OTHER, c.state)
    expect(agent).toEqual(person)
    const call = c.make(person)
    const [operation, body] = protocolOf(call)
    const byPerson = protocolCell(await protocolOn(d.canvas)(operation, body))
    const byAgent = toolCell(await caller(d.canvas, OTHER).run(...call))
    expect(byAgent).toEqual(byPerson)

    const left = await arrangementOf(d.canvas, TENANT)
    const right = await arrangementOf(d.canvas, OTHER)
    expect(right.map(unmoved)).toEqual(left.map(unmoved))
    const moved = right.flatMap((entry, at) =>
      JSON.stringify(entry.by) === JSON.stringify(left[at]!.by) ? [] : [at],
    )
    for (const at of moved) {
      expect(left[at]!.by).toEqual({ kind: 'human' })
      expect(right[at]!.by).toEqual({ kind: 'agent', session: SESSION })
    }
    expect(moved.length > 0).toBe(byPerson.outcome === 'succeeded')
  })
})
