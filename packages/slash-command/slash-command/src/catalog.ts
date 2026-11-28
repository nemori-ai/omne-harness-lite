import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  type Asker,
  type CommandCatalog,
  type CommandEntry,
  type EntrySourceSlot,
  fullName,
  judgeListing,
} from '@omne-harness/slash-command-contract'

export type CatalogPorts<P> = Readonly<{
  sources(): readonly EntrySourceSlot<P>[]
  declared: readonly string[]
  timeoutMs: number
}>

const TIMEOUT = Symbol('timeout')

async function within<T>(
  ms: number,
  outer: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | typeof TIMEOUT> {
  const stop = new AbortController()
  const abort = (): void => stop.abort()
  outer?.addEventListener('abort', abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof TIMEOUT>(resolve => {
    timer = setTimeout(() => {
      stop.abort()
      resolve(TIMEOUT)
    }, ms)
  })
  try {
    return await Promise.race([run(stop.signal), late])
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', abort)
  }
}

type Answer = Readonly<
  { name: string; entries: readonly CommandEntry[] } | { name: string; error: string }
>

async function ask<P>(
  slot: EntrySourceSlot<P>,
  asker: Asker<P>,
  ports: CatalogPorts<P>,
  signal?: AbortSignal,
): Promise<Answer> {
  const { name } = slot.source
  try {
    const listed = await within(ports.timeoutMs, signal, inner => slot.source.list(asker, inner))
    if (listed === TIMEOUT) return { name, error: `${name}: the listing timed out` }
    if (!('ok' in listed)) return { name, error: `${name}: the listing is unavailable` }
    const judged = judgeListing(slot, listed.ok)
    return 'ok' in judged
      ? { name, entries: judged.ok }
      : { name, error: `${name}: ${judged.failure.name} ${judged.failure.reason}` }
  } catch {
    return { name, error: `${name}: the listing threw` }
  }
}

/** The one source whose space the full name is in, and the name within it. */
function ownerOf<P>(
  ports: CatalogPorts<P>,
  full: string,
): Readonly<{ slot: EntrySourceSlot<P>; name: string }> | undefined {
  const colon = full.indexOf(':')
  if (colon < 0) return undefined
  const owners = ports.sources().filter(slot => slot.source.space === full.slice(0, colon))
  return owners.length === 1 ? { slot: owners[0]!, name: full.slice(colon + 1) } : undefined
}

async function asked<P, T, F extends string>(
  ports: CatalogPorts<P>,
  signal: AbortSignal | undefined,
  work: (inner: AbortSignal) => Promise<Outcome<T, F>>,
): Promise<Outcome<T, F | 'unavailable'>> {
  try {
    const answer = await within(ports.timeoutMs, signal, work)
    return answer === TIMEOUT ? fail('unavailable') : answer
  } catch {
    return fail('unavailable')
  }
}

/** The list is asked of every source each time; nothing about any source is kept here. */
export function createCommandCatalog<P>(ports: CatalogPorts<P>): CommandCatalog<P> {
  return {
    async read(asker, signal) {
      const slots = ports.sources()
      const answers = await Promise.all(slots.map(slot => ask(slot, asker, ports, signal)))
      const errors: string[] = []
      const missing = new Set(
        ports.declared.filter(name => !slots.some(slot => slot.source.name === name)),
      )
      const counted = new Map<string, number>()
      for (const answer of answers) {
        if ('error' in answer) {
          errors.push(answer.error)
          missing.add(answer.name)
        } else
          for (const entry of answer.entries)
            counted.set(fullName(entry), (counted.get(fullName(entry)) ?? 0) + 1)
      }
      for (const [name, count] of counted)
        if (count > 1)
          errors.push(`${name}: offered by ${String(count)} sources; none of them counts`)
      const entries = answers
        .flatMap(answer => ('entries' in answer ? answer.entries : []))
        .filter(entry => counted.get(fullName(entry)) === 1)
        .sort((a, b) => (fullName(a) < fullName(b) ? -1 : 1))
      return { catalog: { entries, missing: [...missing].sort() }, errors }
    },
    async take(asker, naming, signal) {
      const owner = ownerOf(ports, naming.name)
      if (owner === undefined) return fail('unavailable')
      const name = { ...naming, name: owner.name }
      return asked(ports, signal, inner => owner.slot.source.take(asker, name, inner))
    },
    async candidates(asker, full, param, signal) {
      const owner = ownerOf(ports, full)
      if (owner === undefined) return fail('unavailable')
      const { source } = owner.slot
      if (source.candidates === undefined) return fail('not-listed')
      return asked(ports, signal, inner => source.candidates!(asker, owner.name, param, inner))
    },
  }
}
