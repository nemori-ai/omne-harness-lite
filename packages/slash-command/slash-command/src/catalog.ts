import { fail } from '@omne-harness/operation-result'
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
    async take(asker, full, signal) {
      const colon = full.indexOf(':')
      const owners = ports.sources().filter(slot => slot.source.space === full.slice(0, colon))
      const owner = owners.length === 1 ? owners[0] : undefined
      if (colon < 0 || owner === undefined) return fail('unavailable')
      try {
        const taken = await within(ports.timeoutMs, signal, inner =>
          owner.source.take(asker, full.slice(colon + 1), inner),
        )
        return taken === TIMEOUT ? fail('unavailable') : taken
      } catch {
        return fail('unavailable')
      }
    },
  }
}
