import {
  cardRequestOf,
  decodePassageId,
  judgeExtensionOutput,
  type ActionId,
  type AgentCheckpoint,
  type AgentInstant,
  type CardRoundId,
  type ChainMember,
  type ChainSource,
  type Conclusion,
  type Dimension,
  type DurableEvidence,
  type EnabledExtension,
  type ExtensionChain,
  type ExtensionReplayBinding,
  type ExtensionInvocationResult,
  type ExtensionOutput,
  type LoopExtensionDeclaration,
  type Passage,
  type PassageId,
  type Position,
  type Subject,
} from '@omne-harness/agent-contract'
import { canonical } from '../canonical.ts'
import { cardRequestIdentity, cardRound } from './identities.ts'
import { openRound, repeatsAnsweredRound } from './passages.ts'

export type PassPlace = Readonly<{
  position: Position
  dimension: Dimension | null
  purpose: 'main' | null
}>

type Output<K extends ExtensionOutput['kind']> = Extract<ExtensionOutput, { kind: K }>
type With<K extends ExtensionOutput['kind']> = Conclusion & Readonly<{ output: Output<K> }>

/** The positions that run before a protected change; only there an error or an absence may veto. */
const BEFORE_CHANGE: readonly Position[] = [
  'before_compaction',
  'before_model_call',
  'before_action',
  'before_terminal',
]

function appliesAt(declaration: LoopExtensionDeclaration, place: PassPlace): boolean {
  return (
    declaration.position === place.position &&
    canonical(declaration.dimension ?? null) === canonical(place.dimension)
  )
}

/** The members of one chain: the definition's in their declared order, then the tenant's, then the system's. */
export function membersAt(
  place: PassPlace,
  sources: Readonly<Record<ChainSource, readonly EnabledExtension[]>>,
): readonly ChainMember[] {
  const of = (source: ChainSource): ChainMember[] =>
    sources[source]
      .filter(member => appliesAt(member.declaration, place))
      .map(member => ({ source, ...member }))
  return [...of('definition'), ...of('tenant'), ...of('system')]
}

export function callId(pass: string, action: ActionId | null, ordinal: number): PassageId {
  const text = action === null ? `${pass}/call/${ordinal}` : `${pass}/${action}/call/${ordinal}`
  const decoded = decodePassageId(text)
  if ('failure' in decoded) throw new Error(`minted passage ${text} was refused`)
  return decoded.ok
}

export function requestedCall(
  chain: ExtensionChain,
  ordinal: number,
  action: ActionId | null,
  input: DurableEvidence,
): Passage {
  const member = chain.members[ordinal]
  if (member === undefined) throw new Error(`the chain ${chain.pass} has no member ${ordinal}`)
  return {
    id: callId(chain.pass, action, ordinal),
    position: chain.position,
    dimension: chain.dimension,
    purpose: chain.purpose,
    action,
    ordinal,
    declaration: member.declaration,
    implementation: member.implementation,
    input,
    effective: input,
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  }
}

const finalOf = (call: Passage): Conclusion | null =>
  call.progress.kind === 'resolved' || call.progress.kind === 'applied'
    ? call.progress.conclusion
    : null

export function vetoes(conclusion: Conclusion): boolean {
  if (conclusion.output?.kind === 'veto') return true
  return (
    conclusion.skipped === 'unavailable' &&
    conclusion.unavailability === 'veto' &&
    conclusion.power === 'veto' &&
    BEFORE_CHANGE.includes(conclusion.position)
  )
}

export function callsOf(
  chain: ExtensionChain,
  passages: readonly Passage[],
  action: ActionId | null,
): readonly Passage[] {
  const calls: Passage[] = []
  for (let ordinal = 0; ordinal < chain.members.length; ordinal += 1) {
    const id = callId(chain.pass, action, ordinal)
    const call = passages.find(passage => passage.id === id)
    if (call === undefined) break
    calls.push(call)
  }
  return calls
}

export type ChainState =
  | Readonly<{ kind: 'pending'; call: Passage; earlier: readonly Conclusion[] }>
  | Readonly<{ kind: 'ended'; conclusions: readonly Conclusion[] }>

export function chainState(calls: readonly Passage[]): ChainState {
  const conclusions: Conclusion[] = []
  for (const call of calls) {
    const conclusion = finalOf(call)
    if (conclusion === null) return { kind: 'pending', call, earlier: conclusions }
    conclusions.push(conclusion)
  }
  return { kind: 'ended', conclusions }
}

export function nextOrdinal(chain: ExtensionChain, call: Passage, conclusion: Conclusion) {
  const next = call.ordinal + 1
  return vetoes(conclusion) || next >= chain.members.length ? null : next
}

/** What the checkpoint holds once a pass is adopted: no open chain, and none of its calls. */
export function closedPass(
  at: Pick<AgentCheckpoint, 'chain' | 'passages'>,
): Partial<Pick<AgentCheckpoint, 'chain' | 'passages'>> {
  const { chain } = at
  if (chain === null) return {}
  return {
    chain: null,
    passages: at.passages.filter(passage => !passage.id.startsWith(`${chain.pass}/`)),
  }
}

export function effectiveSubject(subject: Subject, earlier: readonly Conclusion[]): Subject {
  return earlier.reduce<Subject>(
    (current, conclusion) =>
      conclusion.output?.kind === 'rewrite' ? conclusion.output.subject : current,
    subject,
  )
}

function identityOf(call: Passage, subject: Subject) {
  return {
    position: call.position,
    ...(call.dimension === null ? {} : { dimension: call.dimension }),
    ...(call.action === null ? {} : { action: call.action }),
    ...(call.position === 'after_model_call' &&
    call.dimension !== null &&
    'ending' in call.dimension &&
    call.dimension.ending === 'failure' &&
    'call' in subject
      ? { call: subject.call }
      : {}),
    passage: call.id,
    extension: call.declaration.name,
    implementation: call.implementation,
    power: call.declaration.power,
  }
}

function errorOutput(
  declaration: LoopExtensionDeclaration,
  error: string,
): Output<'observed' | 'veto'> {
  const policy = declaration.onError ?? 'treat_as_veto'
  return BEFORE_CHANGE.includes(declaration.position) &&
    declaration.power === 'veto' &&
    policy === 'treat_as_veto'
    ? { kind: 'veto', reason: error }
    : { kind: 'observed' }
}

export type Concluded =
  | Readonly<{ kind: 'final'; conclusion: Conclusion }>
  | Readonly<{ kind: 'ask'; conclusion: With<'ask'> }>
  /** The result is not known: the call stays as it is and is invoked again in replay. */
  | Readonly<{ kind: 'unresolved'; diagnostic: string }>

export type Invocation = Readonly<{
  mode: 'fresh' | 'replay'
  subject: Subject
  trigger: 'first-content' | 'final' | null
  at: AgentInstant
}>

/** What one invocation result means for its call. Total over the result union. */
export function concludeCall(
  call: Passage,
  invocation: Invocation,
  result: ExtensionInvocationResult,
): Concluded {
  const identity = { ...identityOf(call, invocation.subject), at: invocation.at }
  const errored = (error: string): Concluded => ({
    kind: 'final',
    conclusion: {
      ...identity,
      skipped: 'errored',
      error,
      output: errorOutput(call.declaration, error),
    } as Conclusion,
  })
  switch (result.kind) {
    case 'output': {
      const judged = judgeExtensionOutput({
        position: call.position,
        dimension: call.dimension,
        purpose: call.purpose,
        power: call.declaration.power,
        trigger: invocation.trigger,
        subject: invocation.subject,
        output: result.value,
      })
      if (judged.kind === 'refused') return errored(`bad_output: ${judged.reason}`)
      const conclusion = { ...identity, output: judged.value } as Conclusion
      return judged.value.kind === 'ask'
        ? { kind: 'ask', conclusion: conclusion as With<'ask'> }
        : { kind: 'final', conclusion }
    }
    case 'errored':
      return errored(
        result.classification === undefined || result.classification === 'ordinary'
          ? result.error
          : `${result.classification}: ${result.error}`,
      )
    case 'replayInconsistent':
      return errored('replayInconsistent')
    case 'notStartedUnavailable':
      if (invocation.mode === 'replay')
        return {
          kind: 'unresolved',
          diagnostic: 'the implementation of a call in replay is absent',
        }
      return {
        kind: 'final',
        conclusion: {
          ...identity,
          skipped: 'unavailable',
          unavailability: call.declaration.unavailability ?? 'skip',
        } as Conclusion,
      }
    case 'controlUnavailable':
      return { kind: 'unresolved', diagnostic: 'the replay control of the call is not readable' }
    case 'invocationUnresolved':
      return {
        kind: 'unresolved',
        diagnostic: `the invocation is unresolved, its start is ${result.start.kind}`,
      }
  }
}

export type PassEffect = Readonly<{
  route: 'proceed' | 'vetoed' | 'retry'
  subject: Subject
  conclusions: readonly Conclusion[]
  veto: Conclusion | null
  stops: readonly With<'stop'>[]
  injects: readonly With<'inject'>[]
  model: With<'select_model'> | null
  retry: With<'retry'> | null
}>

const outputs = <K extends ExtensionOutput['kind']>(
  conclusions: readonly Conclusion[],
  kind: K,
): With<K>[] => conclusions.filter((item): item is With<K> => item.output?.kind === kind)

/** One effect from the conclusions that were actually formed. A pure reduction: no member that did not run takes part. */
export function reduceChain(subject: Subject, conclusions: readonly Conclusion[]): PassEffect {
  const veto = conclusions.find(vetoes) ?? null
  const retry = outputs(conclusions, 'retry').at(-1) ?? null
  return {
    route: veto !== null ? 'vetoed' : retry !== null ? 'retry' : 'proceed',
    subject: effectiveSubject(subject, conclusions),
    conclusions,
    veto,
    stops: outputs(conclusions, 'stop'),
    injects: outputs(conclusions, 'inject'),
    model: outputs(conclusions, 'select_model').at(-1) ?? null,
    retry,
  }
}

export type Asked =
  | Readonly<{ kind: 'opened'; call: Passage; round: CardRoundId }>
  | Readonly<{ kind: 'repeated' }>

export function askedRound(call: Passage, ask: With<'ask'>): Asked {
  const rounds = call.progress.kind === 'requested' ? 0 : call.progress.rounds.length
  const round = cardRound(call.id, rounds + 1)
  const requests = [cardRequestOf(cardRequestIdentity(round, 1), ask.output.card)]
  if (repeatsAnsweredRound(call, requests)) return { kind: 'repeated' }
  const opened = openRound(call, round, ask, requests)
  if ('failure' in opened)
    throw new Error(`the call ${call.id} cannot open a round in ${opened.failure.state}`)
  return { kind: 'opened', call: opened.ok, round }
}

export function replayBinding(call: Passage): ExtensionReplayBinding {
  const rounds = call.progress.kind === 'requested' ? [] : call.progress.rounds
  return {
    passage: call.id,
    control: 'valid',
    rounds: rounds.map(round => ({
      round: round.round,
      cards: ('cards' in round.progress ? round.progress.cards : []).map(card => ({
        identity: card.identity,
        card: card.card,
        response:
          card.response === null || card.response.kind === 'invalidated'
            ? null
            : { evidence: card.response.evidence, answer: card.response },
      })),
    })),
  }
}
