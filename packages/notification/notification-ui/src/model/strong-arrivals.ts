import { readTenantText } from '@omne-harness/public-contract'
import type { ScopeSource, Toast } from '@omne-harness/shell-contract'
import type { InboxHub } from './inbox-hub.ts'
import { keyOf, type Entry, type State } from './inbox-machine.ts'

/** The notifications this window has read; null until its first read is ready. Kept in memory only. */
export type Ledger = ReadonlySet<string> | null

export const UNREAD_LEDGER: Ledger = null

const announced = (entry: Entry): boolean =>
  entry.level === 'strong' &&
  entry.marks.seenAt === null &&
  entry.marks.resolved === null &&
  entry.marks.supersededBy === null

/** The strong notifications a ready read brought that the window had not read before. */
export function arrivals(
  ledger: Ledger,
  state: State,
): Readonly<{ ledger: Ledger; strong: readonly Entry[] }> {
  if (state.read.kind !== 'ready') return { ledger, strong: [] }
  if (ledger === null) return { ledger: new Set(state.entries.map(keyOf)), strong: [] }
  const unknown = state.entries.filter(entry => !ledger.has(keyOf(entry)))
  if (unknown.length === 0) return { ledger, strong: [] }
  return { ledger: new Set([...ledger, ...unknown.map(keyOf)]), strong: unknown.filter(announced) }
}

/** Told in the notification's own words, its title: the source and type are identifiers, shown on the panel only. */
export function arrivalToast(entry: Entry, page: string): Toast {
  const key = keyOf(entry)
  return {
    id: key,
    tone: 'attention',
    title: entry.title,
    action: { label: '去看看', page, subject: key },
  }
}

export type ArrivalWatch = Readonly<{
  hub: InboxHub
  scope: ScopeSource
  page: string
  toast: (toast: Toast) => void
}>

/** Watches the inbox of the shell's tenant and toasts strong arrivals. Returns the way to stop. */
export function watchStrongArrivals({ hub, scope, page, toast }: ArrivalWatch): () => void {
  const ledgers = new Map<string, Ledger>()
  let release = (): void => undefined
  const follow = (text: string | undefined): void => {
    release()
    release = () => undefined
    const tenant = text === undefined ? undefined : readTenantText(text)
    if (text === undefined || tenant === undefined) return
    const driver = hub.driver(tenant)
    const check = (): void => {
      const next = arrivals(ledgers.get(text) ?? UNREAD_LEDGER, driver.getState())
      ledgers.set(text, next.ledger)
      for (const entry of next.strong) toast(arrivalToast(entry, page))
    }
    const stopListening = driver.subscribe(check)
    const letGo = driver.retain()
    check()
    release = () => {
      stopListening()
      letGo()
    }
  }
  const stopScope = scope.subscribe(follow)
  follow(scope.get())
  return () => {
    stopScope()
    release()
  }
}
