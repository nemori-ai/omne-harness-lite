import {
  holderOf,
  parseArrange,
  parseLock,
  parseLook,
  parseLookAway,
  parsePile,
  parsePlace,
  parseScatter,
  parseTake,
  type Admission,
  type AdmitInput,
  type CallContext,
  type CanvasAuthority,
  type CanvasId,
  type CanvasKinds,
  type CanvasMovers,
  type CanvasOperations,
  type ChangeAnswer,
  type Instant,
  type KindDeclaration,
  type KindListing,
  type LookAnswer,
  type Mover,
  type Parsed,
  type PlaceAnswer,
  type ReadAnswer,
  type Sheet,
  type Size,
  type SizeRange,
} from '@omne-harness/canvas-contract'
import type { CanvasStore, ChangeResult, Rules, StoreAnswer } from './store.ts'

export interface Clock {
  now(): Instant
}

/** Every value the canvas runs on. The provider refuses to load without one of them. */
export type CanvasConfig = Readonly<{
  sheet: Sheet
  limits: Readonly<{ placed: number; away: number; batch: number }>
  size: SizeRange
  footprint: Size
  admitTimeoutMs: number
}>

export type CanvasPorts = Readonly<{
  store: CanvasStore
  authority: CanvasAuthority
  movers: CanvasMovers
  kinds: CanvasKinds
  clock: Clock
  config: CanvasConfig
}>

const DENIED = Object.freeze({ kind: 'denied' as const })
const UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' as const })
const UNKNOWN = Object.freeze({ kind: 'unknown' as const })
const NO_CHANGE = Object.freeze({ kind: 'no-change' as const })

type Refusal = typeof DENIED | typeof UNAVAILABLE
type Stamp = Readonly<{ canvas: CanvasId; by: Mover; when: Instant; rules: Rules }>

/** Asks the authority; a failure to answer is an unavailable basis, never an allowance. */
async function gate(
  authority: CanvasAuthority,
  ctx: CallContext,
  action: 'read' | 'change',
): Promise<Refusal | null> {
  let answer: Awaited<ReturnType<CanvasAuthority['decide']>>
  try {
    answer = await authority.decide(ctx, action)
  } catch {
    return UNAVAILABLE
  }
  if (answer === 'allowed') return null
  return answer === 'denied' ? DENIED : UNAVAILABLE
}

async function moverOf(movers: CanvasMovers, ctx: CallContext): Promise<Mover | null> {
  try {
    return await movers.moverOf(ctx)
  } catch {
    return null
  }
}

async function reading<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

async function committing<T>(commit: () => Promise<StoreAnswer<T>>): Promise<StoreAnswer<T>> {
  try {
    return await commit()
  } catch {
    return UNKNOWN
  }
}

const ADMISSIONS = ['admitted', 'refused', 'basis-unavailable', 'unknown']

/** Asks the owner once. A throw, the time limit or an answer of no known kind is an unavailable basis. */
async function admitted(
  admit: NonNullable<KindDeclaration['admit']>,
  input: AdmitInput,
  timeoutMs: number,
): Promise<Admission['kind']> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Admission['kind']>(resolve => {
    timer = setTimeout(() => resolve('basis-unavailable'), timeoutMs)
  })
  const answer = async (): Promise<Admission['kind']> => {
    try {
      const admission = await admit(input)
      return ADMISSIONS.includes(admission?.kind) ? admission.kind : 'basis-unavailable'
    } catch {
      return 'basis-unavailable'
    }
  }
  try {
    return await Promise.race([answer(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

function changed(result: ChangeResult): ChangeAnswer {
  if (result.kind === 'changed') return { kind: 'done', value: { revision: result.revision } }
  return result.kind === 'no-change' ? NO_CHANGE : result
}

/** The canvas. Every write answers in the order of the specification; people and agents call the same functions. */
export function createCanvas(ports: CanvasPorts): CanvasOperations {
  const { store, authority, movers, kinds, clock, config } = ports
  const bounds = { sheet: config.sheet, size: config.size, batch: config.limits.batch }
  const sheet = { ...config.sheet, size: config.size, footprint: config.footprint }
  const rules: Rules = {
    sheet: config.sheet,
    footprint: config.footprint,
    placed: config.limits.placed,
    away: config.limits.away,
  }

  async function stampFor<R extends Readonly<{ canvas: CanvasId }>>(
    ctx: CallContext,
    parsed: Parsed<R>,
  ): Promise<Exclude<ChangeAnswer, { kind: 'done' }> | Readonly<{ request: R; stamp: Stamp }>> {
    if ('invalid' in parsed) return parsed.invalid
    const refused = await gate(authority, ctx, 'change')
    if (refused !== null) return refused
    const by = await moverOf(movers, ctx)
    if (by === null) return UNAVAILABLE
    const request = parsed.ok
    return { request, stamp: { canvas: request.canvas, by, when: clock.now(), rules } }
  }

  async function change<R extends Readonly<{ canvas: CanvasId }>>(
    ctx: CallContext,
    parsed: Parsed<R>,
    commit: (request: R, stamp: Stamp) => Promise<StoreAnswer<ChangeResult>>,
  ): Promise<ChangeAnswer> {
    const ready = await stampFor(ctx, parsed)
    if ('kind' in ready) return ready
    const answer = await committing(() => commit(ready.request, ready.stamp))
    if (answer.kind === 'rolled-back') return UNAVAILABLE
    if (answer.kind === 'unknown') return UNKNOWN
    return changed(answer.value)
  }

  return {
    async look(ctx, input): Promise<LookAnswer> {
      const request = parseLook(input)
      if ('invalid' in request) return { kind: 'invalid', where: request.invalid }
      const refused = await gate(authority, ctx, 'read')
      if (refused !== null) return refused
      const read = await reading(() => store.look(ctx.tenant, request.ok.canvas))
      if (read?.kind !== 'read') return UNAVAILABLE
      return { kind: 'done', value: { sheet, ...read.value } }
    },

    async lookAway(ctx, input) {
      const parsed = parseLookAway(input)
      if ('invalid' in parsed) return parsed.invalid
      const refused = await gate(authority, ctx, 'read')
      if (refused !== null) return refused
      const { canvas, limit, before } = parsed.ok
      const read = await reading(() => store.away(ctx.tenant, canvas, { limit, before }))
      return read?.kind === 'read' ? { kind: 'done', value: read.value } : UNAVAILABLE
    },

    async kinds(ctx): Promise<ReadAnswer<readonly KindListing[]>> {
      const refused = await gate(authority, ctx, 'read')
      if (refused !== null) return refused
      let read: ReturnType<CanvasKinds['read']>
      try {
        read = kinds.read()
      } catch {
        return UNAVAILABLE
      }
      return read.kind === 'read' ? { kind: 'done', value: read.kinds } : UNAVAILABLE
    },

    async place(ctx, input): Promise<PlaceAnswer> {
      const ready = await stampFor(ctx, parsePlace(input, bounds))
      if ('kind' in ready) return ready as PlaceAnswer
      const { request, stamp } = ready
      const { canvas, reference } = request
      const placing = await reading(() => store.placing(ctx.tenant, canvas, reference))
      if (placing?.kind !== 'read') return UNAVAILABLE
      if (placing.value.item?.state === 'on') return { kind: 'no-change', item: placing.value.item }

      let entry: ReturnType<CanvasKinds['enter']>
      try {
        entry = kinds.enter(reference.kind)
      } catch {
        return UNAVAILABLE
      }
      if (entry.kind === 'undeclared') return { kind: 'conflict', reason: 'kind-undeclared' }
      if (entry.kind === 'unavailable') return UNAVAILABLE
      if (entry.kind === 'conflict')
        return {
          kind: 'basis-unavailable',
          conflict: { name: reference.kind as KindDeclaration['name'], by: entry.by },
        }
      try {
        if (placing.value.placed >= config.limits.placed)
          return { kind: 'conflict', reason: 'full' }
        if (entry.admit !== undefined) {
          const holder = holderOf(ctx.tenant, canvas, reference)
          const input = { tenant: ctx.tenant, subject: ctx.subject, ref: reference.ref, holder }
          const admission = await admitted(entry.admit, input, config.admitTimeoutMs)
          if (admission === 'refused') return { kind: 'conflict', reason: 'not-admitted' }
          if (admission === 'unknown') return UNKNOWN
          if (admission !== 'admitted') return UNAVAILABLE
        }
        const command = { ...stamp, reference, declared: entry.declared() }
        const { at, near, size } = request
        const answer = await committing(() =>
          store.place(ctx.tenant, { ...command, at, near, size }),
        )
        if (answer.kind === 'rolled-back') return UNAVAILABLE
        if (answer.kind === 'unknown') return UNKNOWN
        const result = answer.value
        if (result.kind === 'changed')
          return { kind: 'done', value: { revision: result.revision, item: result.item } }
        return result
      } finally {
        entry.leave()
      }
    },

    arrange: (ctx, input) =>
      change(ctx, parseArrange(input, bounds), ({ items, piles }, stamp) =>
        store.arrange(ctx.tenant, { ...stamp, items, piles }),
      ),
    take: (ctx, input) =>
      change(ctx, parseTake(input, bounds), ({ items }, stamp) =>
        store.take(ctx.tenant, { ...stamp, items }),
      ),
    pile: (ctx, input) =>
      change(ctx, parsePile(input, bounds), ({ pile, items, at }, stamp) =>
        store.pile(ctx.tenant, { ...stamp, pile, items, at }),
      ),
    scatter: (ctx, input) =>
      change(ctx, parseScatter(input), ({ pile }, stamp) =>
        store.scatter(ctx.tenant, { ...stamp, pile }),
      ),
    lock: (ctx, input) =>
      change(ctx, parseLock(input, bounds), ({ items, locked }, stamp) =>
        store.lock(ctx.tenant, { ...stamp, items, locked }),
      ),
  }
}
