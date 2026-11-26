import { defaultBackoff } from '@omne-harness/client-assembly'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type {
  SlashCommandCandidate,
  SlashCommandCatalog,
  SlashCommandProtocol,
} from '@omne-harness/slash-command-protocol'
import type { Answer, Assist, ComposerMachine, Key } from './ports.ts'

export type SlashCommandClient = ClientOf<SlashCommandProtocol>
export type Schedule = (delayMs: number, run: () => void) => () => void

export type Helper = Readonly<{
  subscribe(listener: () => void): () => void
  read(): Assist
  input(text: string, caret: number): void
  composing(on: boolean): void
  key(key: Key): Answer
  take(index: number): Answer
  literal(text: string): string
  refused(reason: string): void
  close(): void
}>

const CHANGED = 'what was shown changed'
const defaultSchedule: Schedule = (delayMs, run) => {
  const timer = setTimeout(run, delayMs)
  return () => clearTimeout(timer)
}

/** One composer's helper: the list of one session, read now, read again whenever it may have changed. */
export function openHelper(
  client: SlashCommandClient,
  machine: ComposerMachine,
  where: Readonly<{ tenant: string; session: string }>,
  schedule: Schedule = defaultSchedule,
): Helper {
  const { session } = where
  const tenant = readTenantText(where.tenant)
  const listeners = new Set<() => void>()
  let reading = 0
  let closed = false
  const stop = new AbortController()
  let cancelLater: (() => void) | null = null
  let asked: string | null = null
  let offering = 0

  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  // The candidates of the argument at the caret, asked once each time the caret comes to another argument.
  const offer = (): void => {
    const want = machine.read().asking
    const key = want === null ? null : `${want.command}#${String(want.param)}`
    if (key === asked) return
    asked = key
    if (want === null || tenant === undefined || closed) return
    offering += 1
    const mine = offering
    void (async () => {
      let got: readonly SlashCommandCandidate[] | null
      try {
        const answer = await client['read-candidates']({ tenant, session, ...want } as never)
        got = answer.outcome === 'succeeded' ? answer.body.candidates : null
      } catch {
        got = null
      }
      if (mine !== offering || closed) return
      machine.offered(want.command, want.param, got)
      changed()
    })()
  }
  const reread = async (): Promise<void> => {
    if (tenant === undefined || closed) return
    reading += 1
    const mine = reading
    let next: SlashCommandCatalog | null
    try {
      const answer = await client['read-catalog']({ tenant, session } as never)
      next = answer.outcome === 'succeeded' ? answer.body : null
    } catch {
      next = null
    }
    if (mine !== reading || closed) return
    machine.listed(next)
    asked = null
    offer()
    changed()
  }
  const observe = async (attempt: number): Promise<void> => {
    if (tenant === undefined || closed) return
    void reread()
    let heard = false
    try {
      const frames = client.observe['observe-catalog']({ tenant, session } as never, {
        signal: stop.signal,
      })
      for (;;) {
        const next = await frames.next()
        if (next.done === true) break
        heard = true
        void reread()
      }
    } catch {
      // A stream that broke is opened again below, as one that ended.
    }
    if (closed) return
    const wait = defaultBackoff.delayMs(heard ? 0 : attempt)
    cancelLater = schedule(wait, () => void observe(heard ? 1 : attempt + 1))
  }
  if (tenant === undefined) machine.listed(null)
  else void observe(0)

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read: () => machine.read(),
    input(text, caret) {
      machine.input(text, caret)
      offer()
      changed()
    },
    composing(on) {
      machine.composing(on)
      offer()
      changed()
    },
    key(key) {
      const answer = machine.key(key)
      changed()
      return answer
    },
    take: at => machine.take(at),
    literal: text => machine.literal(text),
    refused(reason) {
      if (reason.startsWith(CHANGED)) void reread()
    },
    close() {
      closed = true
      stop.abort()
      cancelLater?.()
      listeners.clear()
    },
  }
}
