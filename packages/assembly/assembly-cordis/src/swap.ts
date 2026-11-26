import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import type { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { fiberItself, isUnder, type Entry } from './entry.ts'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']

function fibersUnder(ctx: Context, root: Fiber): Fiber[] {
  const found: Fiber[] = []
  for (const runtime of ctx.registry.values())
    for (const fiber of runtime.fibers) if (isUnder(fiber, root)) found.push(fiber)
  return found
}

/** A fiber is active while a child of it still applies: waits for every fiber under it, names one not active. */
async function notStoodUp(ctx: Context, root: Fiber): Promise<string | undefined> {
  for (let seen = -1; ;) {
    const fibers = fibersUnder(ctx, root)
    if (fibers.length === seen) return fibers.find(each => (each.state as number) !== ACTIVE)?.name
    seen = fibers.length
    await Promise.all(fibers.map(each => each.await()))
  }
}

export type SwapRefusal = 'did-not-start' | 'not-ready' | 'not-offered' | 'seats'

export type Swapped =
  | Readonly<{
      kind: 'swapped'
      fiber: Fiber
      /** Settles when the generation that left has finished what it held and is unloaded. */
      drained: Promise<void>
    }>
  | Readonly<{ kind: 'refused'; reason: SwapRefusal; detail: string }>

export type SwappedEntry = Pick<Entry<unknown>, 'key' | 'offered' | 'promote'>

export type SwapInput = Readonly<{
  old: Fiber
  next: Plugin
  config?: unknown
  entries: readonly SwappedEntry[]
  /** The row's own word that the generation stood up. Not given: `apply` returned. */
  ready?: () => boolean | Promise<boolean>
  swapped?: (fiber: Fiber) => void
}>

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The next generation loads beside the old one and stands by; one step then puts it in service, entries and seats at once. */
export async function swapRow(ctx: Context, input: SwapInput): Promise<Swapped> {
  const dynamis = ctx.get('dynamis') as DynamisService | undefined
  const staged = ctx.plugin(input.next, input.config)
  dynamis?.succeed(staged, input.old)
  const refused = async (reason: SwapRefusal, detail: string): Promise<Swapped> => {
    await staged.dispose()
    return { kind: 'refused', reason, detail }
  }
  const next = fiberItself(staged)
  try {
    await staged.await()
    const waiting = await notStoodUp(ctx, next)
    if (waiting !== undefined) return await refused('not-ready', `${waiting} is not active`)
    if (input.ready !== undefined && !(await input.ready()))
      return await refused('not-ready', 'the row says the generation did not stand up')
  } catch (error) {
    return await refused('did-not-start', messageOf(error))
  }
  const missing = input.entries.find(entry => entry.offered(next) === undefined)
  if (missing !== undefined)
    return await refused('not-offered', `the generation offered nothing to ${missing.key}`)
  const promote = (): void => {
    for (const entry of input.entries) entry.promote(next)
  }
  const rolled = dynamis === undefined ? promote() : dynamis.rollout(next, promote)
  if (rolled?.kind === 'refused') return await refused('seats', rolled.detail)
  input.swapped?.(next)
  return { kind: 'swapped', fiber: next, drained: input.old.dispose() }
}
