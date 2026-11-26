import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'
import type { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { fiberItself, type Entry } from './entry.ts'

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
  /** Called in the step that swaps, before the old generation begins to unload. */
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
  try {
    await staged.await()
    if (input.ready !== undefined && !(await input.ready()))
      return await refused('not-ready', 'the row says the generation did not stand up')
  } catch (error) {
    return await refused('did-not-start', messageOf(error))
  }
  const next = fiberItself(staged)
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
