import { readTenantText } from '@omne-harness/public-contract'
import type {
  Reader,
  SayItem,
  SayReply,
  SayTarget,
  SayTo,
  ScopeSource,
} from '@omne-harness/shell-contract'
import { companionFacts, type CompanionFacts } from './model/companion.ts'
import { takePictures, type PictureIntake, type PicturesTaken } from './model/pictures.ts'
import { replyTo, takerFrom, UNCLEAR, type Reading, type Taker } from './model/reply.ts'
import type { State } from './model/session-machine.ts'
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
  /** Each reply followed on this driver, told it can no longer be read. */
  readonly replies: Set<() => void>
  /** The input id of each message said through this item, by the message id the shell holds. */
  readonly inputs: Map<string, string>
}

type Refused = Readonly<{ kind: 'failed'; reason: string }>

const failed = (reason: string): Refused => ({ kind: 'failed', reason })
const NOTHING_ATTACHED: PicturesTaken = { kind: 'taken', attachments: [] }

const whom = (to: SayTo): Whom => (to.kind === 'new' ? to : { kind: 'session', session: to.key })

type Listener = (reply: SayReply) => void

/** Follows what is said after one message of the session open now; tells only changes, reads once where the run that takes it is not clear, and stops by itself after the last. */
function follow(now: Held, said: string, listener: Listener): () => void {
  const driver = now.lease.driver
  const input = now.inputs.get(said)
  let given: SayReply = { text: '', state: 'coming' }
  let taker: Taker = UNCLEAR
  let asked = false
  let done = false
  let seen: State | null = null
  let stop = (): void => undefined
  const tell = (next: SayReply): void => {
    if (next.text === given.text && next.state === given.state) return
    given = next
    if (next.state !== 'coming') stop()
    listener(next)
  }
  const gone = (): void => tell({ text: given.text, state: 'unknown' })
  function look(): void {
    const state = driver.getState().session
    if (state === seen) return
    seen = state
    const reading = replyTo(state, said, taker)
    if (reading === null) gone()
    else if (reading.kind === 'reply') tell(reading.reply)
    else if (!asked) ask(reading)
  }
  function ask(reading: Extract<Reading, { kind: 'ask' }>): void {
    asked = true
    if (input === undefined) return gone()
    void driver.readInputFate(reading.session, input).then(answer => {
      if (done) return
      const next = takerFrom(answer, reading.run)
      if (next === 'it') return tell(reading.reply)
      if (next === null) return gone()
      taker = next
      seen = null
      look()
    })
  }
  const unsubscribe = driver.subscribe(look)
  now.replies.add(gone)
  stop = () => {
    done = true
    unsubscribe()
    now.replies.delete(gone)
    now.inputs.delete(said)
  }
  look()
  return () => stop()
}

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
    for (const gone of Array.from(held.replies)) gone()
    held.inputs.clear()
    held.stop()
    held.lease.release()
    held = null
  }

  const hold = (scope: string): Held | null => {
    const tenant = readTenantText(scope)
    if (tenant === undefined) return null
    const lease = workspaces.acquire(scope, tenant)
    const facts = companionFacts(lease.driver.getState(), null)
    const made: Held = {
      scope,
      lease,
      stop: () => undefined,
      facts,
      shown: null,
      replies: new Set(),
      inputs: new Map(),
    }
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
      if (answer.kind !== 'sent') return answer
      now.inputs.set(answer.said, answer.input)
      return { kind: 'sent', key: answer.session, said: answer.said }
    },
    show: (scope, key) => {
      const now = heldFor(scope)
      if (now === null) return
      now.lease.driver.openSession(key)
      host.navigate(conversationPage)
    },
    reply: (scope, said, listener) => {
      const now = heldFor(scope)
      if (now !== null) return follow(now, said, listener)
      listener({ text: '', state: 'unknown' })
      return () => undefined
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
