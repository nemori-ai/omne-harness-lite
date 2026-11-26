import { readTenantText } from '@omne-harness/public-contract'
import type { Reader, SayItem, SayTarget, SayTo, ScopeSource } from '@omne-harness/shell-contract'
import { companionFacts, type CompanionFacts } from './model/companion.ts'
import { takePictures, type PictureIntake, type PicturesTaken } from './model/pictures.ts'
import { GONE, type SayTarget as Whom } from './model/say.ts'
import type { SessionLease, SessionWorkspaces } from './model/session-workspaces.ts'

const SAY_ITEM = 'session'
const TENANT_CHANGED = '租户换了，这句话没有交出去。'
const NO_TENANT = '读不到这个租户，这句话没有交出去。'

type Host = Readonly<{ scope: ScopeSource; navigate: (page: string) => void }>

/** The driver held for one tenant, and what of it was last told to the listeners. */
type Held = {
  readonly scope: string
  readonly lease: SessionLease
  stop: () => void
  facts: CompanionFacts
  shown: Readonly<{ page: CompanionFacts['page']; targets: readonly SayTarget[] }> | null
}

type Refused = Readonly<{ kind: 'failed'; reason: string }>

const failed = (reason: string): Refused => ({ kind: 'failed', reason })
const NOTHING_ATTACHED: PicturesTaken = { kind: 'taken', attachments: [] }

const whom = (to: SayTo): Whom => (to.kind === 'new' ? to : { kind: 'session', session: to.key })

/** What the session module puts on `shell.say`: the driver the companion speaks through, held for the shell's tenant. */
export function sessionSayItem(
  host: Host,
  workspaces: SessionWorkspaces,
  conversationPage: string,
  intake: Reader<PictureIntake>,
): Readonly<{ item: SayItem; close: () => void }> {
  const listeners = new Set<() => void>()
  let held: Held | null = null
  let closed = false

  const tell = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  const release = (): void => {
    if (held === null) return
    held.stop()
    held.lease.release()
    held = null
  }

  const hold = (scope: string): Held | null => {
    const tenant = readTenantText(scope)
    if (tenant === undefined) return null
    const lease = workspaces.acquire(scope, tenant)
    const facts = companionFacts(lease.driver.getState(), null)
    const made: Held = { scope, lease, stop: () => undefined, facts, shown: null }
    made.stop = lease.driver.subscribe(() => {
      const was = made.facts
      made.facts = companionFacts(lease.driver.getState(), was)
      if (made.facts.page !== was.page || made.facts.current !== was.current) tell()
    })
    return made
  }

  /** The driver of the tenant the shell shows now, when that is the scope asked about. */
  const heldFor = (scope: string | undefined): Held | null => {
    const now = host.scope.get()
    if (closed || scope === undefined || scope !== now) return null
    if (held?.scope !== now) {
      release()
      held = hold(now)
    }
    return held
  }

  const stopFollowing = host.scope.subscribe(scope => {
    if (held === null || held.scope === scope) return
    release()
    tell()
  })

  let intakeThere = intake.get() !== undefined
  const stopReading = intake.subscribe(() => {
    if ((intake.get() !== undefined) === intakeThere) return
    intakeThere = !intakeThere
    tell()
  })

  const ready = (scope: string | undefined): Held | Refused => {
    if (closed) return failed(GONE)
    if (scope !== host.scope.get()) return failed(TENANT_CHANGED)
    return heldFor(scope) ?? failed(NO_TENANT)
  }

  const item: SayItem = {
    id: SAY_ITEM,
    targets: scope => {
      const now = heldFor(scope)
      const sessions = now?.facts.sessions ?? null
      if (now === null || sessions === null) return undefined
      if (now.shown?.page !== now.facts.page) {
        const targets = sessions.map(each => ({ key: each.session, label: each.name }))
        now.shown = { page: now.facts.page, targets }
      }
      return now.shown.targets
    },
    current: scope => heldFor(scope)?.facts.current ?? undefined,
    pictures: scope =>
      !closed && scope !== undefined && scope === host.scope.get() && intake.get() !== undefined,
    subscribe: listener => {
      listeners.add(listener)
      heldFor(host.scope.get())
      return () => void listeners.delete(listener)
    },
    say: async (scope, to, words, pictures = []) => {
      const before = ready(scope)
      if ('reason' in before) return before
      const taken =
        pictures.length === 0
          ? NOTHING_ATTACHED
          : await takePictures(intake, before.scope, pictures)
      if (taken.kind === 'failed') return taken
      const now = ready(scope)
      if ('reason' in now) return now
      const answer = await now.lease.driver.say(whom(to), words, taken.attachments)
      return answer.kind === 'sent' ? { kind: 'sent', key: answer.session } : answer
    },
    show: (scope, key) => {
      const now = heldFor(scope)
      if (now === null) return
      now.lease.driver.openSession(key)
      host.navigate(conversationPage)
    },
  }

  return {
    item,
    close: () => {
      closed = true
      stopFollowing()
      stopReading()
      release()
      listeners.clear()
    },
  }
}
