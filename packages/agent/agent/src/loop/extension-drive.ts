import type {
  Access,
  ActionId,
  AgentCheckpoint,
  AgentClock,
  AgentExecutionId,
  Conclusion,
  EnabledExtension,
  EnabledExtensions,
  ExtensionChain,
  ExtensionImplementations,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  Failure,
  Passage,
  PassageId,
  Subject,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  callsOf,
  chainState,
  closedPass,
  concludeCall,
  effectiveSubject,
  membersAt,
  nextOrdinal,
  reduceChain,
  requestedCall,
  type PassEffect,
  type PassPlace,
} from './extension-pass.ts'
import { agentEvidence } from './identities.ts'
import type { LoopNode } from './nodes.ts'
import { resolve as resolveCall } from './passages.ts'

type Unavailable = Extract<Failure, { kind: 'unavailable' }>
type Recheck = () => Promise<Outcome<unknown, Failure>>
type Saved = Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>>

export type PassSubject = Readonly<{ action: ActionId | null; subject: Subject }>

/** One pass over a position. `id` names it: a pass saved under it is continued, not begun again. */
export type Pass = PassPlace &
  Readonly<{
    id: string
    subjects(): Promise<Outcome<readonly PassSubject[], Failure>>
    trigger?: 'first-content' | 'final'
    failedStops?: 'ignored'
    system?: readonly EnabledExtension[]
  }>

export type PassResult =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'waiting'; failure: Unavailable; recheck: Recheck }>
  | Readonly<{ kind: 'ended'; effects: readonly PassEffect[]; applied: Saved }>

export type PassHost<P> = Readonly<{
  access: Access<P>
  execution: AgentExecutionId
  ports: Readonly<{
    extensions: ExtensionImplementations<P>
    enabledExtensions?: EnabledExtensions<P>
    clock: AgentClock
  }>
  definition: readonly EnabledExtension[]
  checkpoint(): AgentCheckpoint
  cancelled(): boolean
  save(node: LoopNode, write: Readonly<{ checkpoint: Saved }>): Promise<Outcome<void, Failure>>
  signal(): AbortSignal
}>

/** `mine`: the calls this process saved as requested and has not invoked. Only those are invoked fresh. */
type Driver<P> = Readonly<{ host: PassHost<P>; mine: Set<PassageId> }>

const placeOf = ({ position, dimension, purpose }: PassPlace): PassPlace => ({
  position,
  dimension,
  purpose,
})

const waitingOn = (failure: Failure, recheck: Recheck): Outcome<PassResult, Failure> =>
  failure.kind === 'unavailable' ? succeed({ kind: 'waiting', failure, recheck }) : fail(failure)

const inputOf = (chain: ExtensionChain, ordinal: number, item: PassSubject) =>
  agentEvidence(`${chain.pass}/${item.action ?? ''}/input/${ordinal}`, item.subject)

async function readTenant<P>({ host }: Driver<P>, place: PassPlace) {
  const port = host.ports.enabledExtensions
  if (port === undefined) return null
  return port.read({ ...host.access, execution: host.execution, ...placeOf(place) })
}

async function open<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
): Promise<Outcome<ExtensionChain | PassResult, Failure>> {
  const { host, mine } = driver
  if (host.cancelled()) return succeed({ kind: 'cancelled' })
  const read = await readTenant(driver, pass)
  if (read !== null && 'failure' in read)
    return waitingOn(read.failure, async () => (await readTenant(driver, pass)) ?? succeed(null))
  const members = membersAt(pass, {
    definition: host.definition,
    tenant: read === null ? [] : read.ok.members,
    system: pass.system ?? [],
  })
  if (members.length === 0) return succeed({ kind: 'none' })
  const subjects = await pass.subjects()
  if ('failure' in subjects) return waitingOn(subjects.failure, pass.subjects)
  if (subjects.ok.length === 0) return succeed({ kind: 'none' })
  const basis = read === null ? null : read.ok.basis
  const chain: ExtensionChain = { ...placeOf(pass), pass: pass.id, members, basis }
  const first = subjects.ok.map(item =>
    requestedCall(chain, 0, item.action, inputOf(chain, 0, item)),
  )
  const saved = await host.save(node, {
    checkpoint: { chain, passages: [...host.checkpoint().passages, ...first] },
  })
  if ('failure' in saved) return saved
  for (const call of first) mine.add(call.id)
  return succeed(chain)
}

async function invoke<P>(
  { host }: Driver<P>,
  call: Passage,
  subject: Subject,
  earlier: readonly Conclusion[],
  fresh: boolean,
): Promise<ExtensionInvocationResult> {
  const resolved = await host.ports.extensions.resolve({ ...host.access, passage: call })
  if ('failure' in resolved) return { kind: 'notStartedUnavailable' }
  const mode: ExtensionInvocationMode = fresh
    ? { kind: 'fresh' }
    : { kind: 'replay', binding: { passage: call.id, rounds: [], control: 'valid' } }
  const { position, dimension, id: passage } = call
  const input = { position, subject, earlier, execution: host.execution, passage }
  return resolved.ok.invoke(
    dimension === null ? input : { ...input, dimension },
    host.signal(),
    mode,
  )
}

async function conclude<P>(
  driver: Driver<P>,
  call: Passage,
  subject: Subject,
  earlier: readonly Conclusion[],
  trigger: Pass['trigger'],
) {
  const fresh = driver.mine.delete(call.id)
  const instant = await driver.host.ports.clock.now()
  if ('failure' in instant) return instant
  const result = await invoke(driver, call, subject, earlier, fresh)
  const mode = fresh ? 'fresh' : 'replay'
  return succeed(
    concludeCall(call, { mode, subject, trigger: trigger ?? null, at: instant.ok }, result),
  )
}

function notFinal(
  call: Passage,
  concluded: Exclude<ReturnType<typeof concludeCall>, { kind: 'final' }>,
): Outcome<PassResult, Failure> {
  if (concluded.kind === 'ask')
    return fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: `${call.id}: a card round of an extension is not handled yet`,
    })
  const diagnostic = `${call.id}: ${concluded.diagnostic}`
  const failure: Unavailable = { kind: 'unavailable', owner: 'agentExtensions', diagnostic }
  return succeed({ kind: 'waiting', failure, recheck: async () => succeed(null) })
}

async function advance<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
  chain: ExtensionChain,
  subjects: readonly PassSubject[],
): Promise<Outcome<PassResult, Failure>> {
  const { host, mine } = driver
  for (;;) {
    const passages = host.checkpoint().passages
    const states = subjects.map(item => ({
      item,
      state: chainState(callsOf(chain, passages, item.action)),
    }))
    const pending = states.find(entry => entry.state.kind === 'pending')
    if (pending?.state.kind !== 'pending') {
      const effects = states.map(({ item, state }) =>
        reduceChain(item.subject, state.kind === 'ended' ? state.conclusions : []),
      )
      return succeed({ kind: 'ended', effects, applied: closedPass({ chain, passages }) })
    }
    if (host.cancelled()) return succeed({ kind: 'cancelled' })
    const { call, earlier } = pending.state
    const subject = effectiveSubject(pending.item.subject, earlier)
    const concluded = await conclude(driver, call, subject, earlier, pass.trigger)
    if ('failure' in concluded) return concluded
    if (concluded.ok.kind !== 'final') return notFinal(call, concluded.ok)
    const { conclusion } = concluded.ok
    const evidence = agentEvidence(`${call.id}/conclusion`, conclusion)
    const resolved = resolveCall(call, conclusion, evidence)
    if ('failure' in resolved)
      throw new Error(`the call ${call.id} cannot take a conclusion in ${resolved.failure.state}`)
    const next = nextOrdinal(chain, call, conclusion)
    const after = { ...pending.item, subject: effectiveSubject(subject, [conclusion]) }
    const following =
      next === null ? [] : [requestedCall(chain, next, after.action, inputOf(chain, next, after))]
    const kept = passages.map(passage => (passage.id === call.id ? resolved.ok : passage))
    const saved = await host.save(node, { checkpoint: { passages: [...kept, ...following] } })
    if ('failure' in saved) return saved
    for (const item of following) mine.add(item.id)
  }
}

async function run<P>(
  driver: Driver<P>,
  node: LoopNode,
  pass: Pass,
): Promise<Outcome<PassResult, Failure>> {
  let chain = driver.host.checkpoint().chain
  if (chain !== null && chain.pass !== pass.id)
    return fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent#defect',
      diagnostic: `the pass ${pass.id} began while the pass ${chain.pass} is open`,
    })
  if (chain === null) {
    const opened = await open(driver, node, pass)
    if ('failure' in opened) return opened
    if ('kind' in opened.ok) return succeed(opened.ok)
    chain = opened.ok
  }
  const subjects = await pass.subjects()
  if ('failure' in subjects) return waitingOn(subjects.failure, pass.subjects)
  return advance(driver, node, pass, chain, subjects.ok)
}

// Nothing is saved after the terminal: the observers are requested before it, for the terminal to owe them.
async function planObservers<P>(
  driver: Driver<P>,
  pass: PassPlace & Readonly<{ id: string }>,
  at: Pick<AgentCheckpoint, 'passages'>,
): Promise<Outcome<Pick<AgentCheckpoint, 'chain' | 'passages'> | null, Failure>> {
  const chain: ExtensionChain = { ...placeOf(pass), pass: pass.id, members: [], basis: null }
  const read = await readTenant(driver, pass)
  if (read !== null && 'failure' in read) {
    if (read.failure.kind !== 'unavailable') return read
    const unread = agentEvidence(`${pass.id}/unread`, read.failure)
    return succeed({ chain: { ...chain, unread }, passages: at.passages })
  }
  const members = membersAt(pass, {
    definition: driver.host.definition,
    tenant: read === null ? [] : read.ok.members,
    system: [],
  })
  if (members.length === 0) return succeed(null)
  const formed = { ...chain, members, basis: read === null ? null : read.ok.basis }
  const calls = members.map((_, ordinal) =>
    requestedCall(formed, ordinal, null, agentEvidence(`${pass.id}/input/${ordinal}`)),
  )
  for (const call of calls) driver.mine.add(call.id)
  return succeed({ chain: formed, passages: [...at.passages, ...calls] })
}

async function observe<P>(
  driver: Driver<P>,
  call: Passage,
  subject: Subject,
): Promise<Outcome<Conclusion | null, Failure>> {
  const concluded = await conclude(driver, call, subject, [], undefined)
  if ('failure' in concluded) return concluded
  return succeed(concluded.ok.kind === 'final' ? concluded.ok.conclusion : null)
}

export function createPassDriver<P>(host: PassHost<P>) {
  const driver: Driver<P> = { host, mine: new Set() }
  return {
    run: (node: LoopNode, pass: Pass) => run(driver, node, pass),
    planObservers: (
      pass: PassPlace & Readonly<{ id: string }>,
      at: Pick<AgentCheckpoint, 'passages'>,
    ) => planObservers(driver, pass, at),
    observe: (call: Passage, subject: Subject) => observe(driver, call, subject),
  }
}

export type PassDriver = ReturnType<typeof createPassDriver>
