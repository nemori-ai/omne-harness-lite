import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ControlReceipt,
  type Reply,
  type ToolTiming,
} from '@omne-harness/tool-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import type { MutationInput } from './boundary.ts'
import { digestOf } from './evidence.ts'
import { decideControl, type ControlCommand } from './ledger-control.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { SyntheticDecider, SyntheticDecision } from './ledger-result-preparation.ts'
import type { DueEntry, LedgerDomain, TenantId, ToolLedgerStore } from './ledger-store.ts'
import { timerOriginOf, timerSubject, type TimerOrigin } from './ledger-timers.ts'

const FIRE_LIMIT = 100
const LAST_INSTANT = '9999-12-31T23:59:59.999Z' as ToolInstant

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: 'unavailable', dependency, diagnostic } as const)

export type TimerFiring = Readonly<{ fired: number; next: DueEntry | null }>

export type ToolLedgerTimers<P> = Readonly<{
  // Commits the control of each due threshold and foreground limit of the tenant, as Tool itself,
  // and names the timer that falls due next.
  fire(input: Readonly<{ principal: P; tenant: TenantId }>): Reply<TimerFiring>
}>

type Fired = ControlReceipt | null

export type TimerPorts<P> = Readonly<{
  now(): ToolInstant | null
  due: ToolLedgerStore['due']
  read(domain: LedgerDomain): Reply<Snapshot>
  closeSegment(timing: ToolTiming): Promise<ToolTiming>
  settle(
    context: MutationInput<P>,
    action: 'control',
    inputDigest: string,
    decide: SyntheticDecider<Fired>,
  ): Reply<Fired>
}>

// The due entry goes in the same commit. A decision that only answers is final for this snapshot,
// so its entry goes too; a later fire would answer the same.
function unscheduled(decision: SyntheticDecision<Fired>, key: string): SyntheticDecision<Fired> {
  const unschedule = { kind: 'unschedule', key } as const
  if (decision.kind === 'commit') return { ...decision, writes: [...decision.writes, unschedule] }
  return decision.kind === 'reply'
    ? { kind: 'commit', value: null, writes: [unschedule] }
    : decision
}

// Only a call that runs in front accumulates foreground time; any other drops its entry.
function inFront(snapshot: Snapshot): boolean {
  const state = snapshot.call?.state
  return state?.phase === 'running' && state.relation === 'foreground'
}

export function createLedgerTimers<P>(ports: TimerPorts<P>): ToolLedgerTimers<P> {
  // The tenant is the caller's: the copy the due index keeps is data, not the tenant identity.
  async function fireOne(principal: P, tenant: TenantId, entry: DueEntry, origin: TimerOrigin) {
    if (entry.domain.kind !== 'call') return succeed(null)
    const domain = { kind: 'call', tenant, call: entry.domain.call } as const
    const { call } = domain
    const operation = decodeToolOperationId(`timer/${origin}/${Date.parse(entry.dueAt)}`)
    if ('failure' in operation) return succeed(null)
    const before = await ports.read(domain)
    if ('failure' in before) return before
    const timing = before.ok.call?.state.timing
    const intent = { kind: 'background', otherwise: origin === 'threshold' ? 'reject' : 'stop' }
    const place = { tenant, call, operation: operation.ok }
    const command = {
      principal,
      ...place,
      intent,
      origin,
      inputDigest: digestOf({ intent, origin }),
      subject: timerSubject(place),
      ...(timing?.kind === 'running'
        ? { timing: { from: timing, closed: await ports.closeSegment(timing) } }
        : {}),
    } as ControlCommand
    return ports.settle(
      { principal, ...place },
      'control',
      command.inputDigest,
      (snapshot, mint, prepared) =>
        unscheduled(
          inFront(snapshot)
            ? decideControl(snapshot, command, prepared, mint)
            : { kind: 'reply', outcome: succeed(null) },
          entry.key,
        ),
    )
  }

  return {
    async fire({ principal, tenant }) {
      const now = ports.now()
      if (now === null) return unavailable('clock', 'the clock gave no canonical instant')
      const due = await ports.due(tenant, LAST_INSTANT, FIRE_LIMIT)
      if (due.kind !== 'complete') return unavailable('ledger-store', due.diagnostic)
      let fired = 0
      for (const entry of due.entries) {
        const origin = timerOriginOf(entry.key)
        if (origin === null) continue
        if (Date.parse(entry.dueAt) > Date.parse(now)) return succeed({ fired, next: entry })
        const answer = await fireOne(principal, tenant, entry, origin)
        if ('failure' in answer) return answer
        fired += 1
      }
      return succeed({ fired, next: null })
    },
  }
}
