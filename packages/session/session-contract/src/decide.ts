// `decide` turns one command into the content of one commit (SPEC「领域服务与归约」): it recalls the
// operation, runs the domain services of the command table, and produces the entry batch or the
// refusal. The guard materials ride along opaque: `decide` reads only their presence (the login
// gate of `startRun`), never their `facts`. `reduce(decide(...))` round-trips under one interpreter.
//
// Support in this member (card #536 revision 5): the kinds of the M2 first tenant path are decided
// to the SPEC (`create`, `completeInitialization`, `accept` of an ordinary input, `startRun`,
// `recordMessage`, `receive` of a hand-over, and `finishRun`). Every other kind is refused with
// `unavailable` naming #756 (S-1b); the `workspace` dimension of `change` is judged before that
// refusal, so an illegal selection is `invalid`. The Agent-event copy branch of `receive` is superseded (P1
// decision item 1): the facts it carried (taken batches, the Run's completed terminal) reach
// Session by a replacement that #756 designs.
import type {
  AttemptId,
  DurableEvidence,
  InputId,
  RunId,
  SessionId,
  SessionOperationId,
} from './identity.ts'
import type { Adoption } from './identity.ts'
import { tenantEquals, workspaceCodec, type WorkspaceId } from '@omne-harness/legal-identity'
import type { RunTerminal, WorkSnapshot, WorkspaceAttachment } from './values.ts'
import type { HistoryEntry, ProducerFact, SessionFailure } from './faces.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import { encodeEntry, toJsonValue, type InitializationItem } from './entries.ts'
import {
  OFF_PATH_FAILURE,
  judgeAdvance,
  judgeRunStart,
  resolveOperation,
  routeInput,
  type DecideReads,
  type Decision,
  type EncodedEntry,
  type OperationRecord,
} from './judgments.ts'
import { digestOf } from './operations.ts'

/** The kinds that this member decides to the SPEC; every other kind is left to #756. */
export const PATH_MUTATIONS = Object.freeze([
  'create',
  'completeInitialization',
  'accept',
  'startRun',
  'recordMessage',
  'receive',
  'finishRun',
] as const satisfies readonly SessionCommand['kind'][])

type Origin = HistoryEntry['origin']

function rejected(failure: SessionFailure): Decision {
  return { kind: 'rejected', failure }
}

function invalid(field: string, reason: string): Decision {
  return rejected({ kind: 'invalid', field, reason })
}

function entries(list: readonly EncodedEntry[]): Decision {
  return { kind: 'entries', entries: list }
}

function emptyAdoption(adoption: Adoption): boolean {
  return [adoption.owner, adoption.name, adoption.revision, adoption.digest].some(
    part => part.length === 0,
  )
}

function emptyEvidence(evidence: DurableEvidence): boolean {
  return [evidence.owner, evidence.record, evidence.revision, evidence.digest].some(
    part => part.length === 0,
  )
}

/** True when `value` is a sixth-family `WorkspaceId` that legal-identity minted (its codec encodes it). */
function legalWorkspace(value: unknown): value is WorkspaceId {
  if (typeof value !== 'object' || value === null) return false
  return workspaceCodec.encode(value as WorkspaceId).ok
}

function emptyText(value: unknown): boolean {
  return typeof value !== 'string' || value.length === 0
}

/**
 * The workspace selection of a creation or a `workspace` change: a `WorkspaceId` with its
 * attachment, or neither. The attachment fields are non-empty text; their format belongs to the
 * workspace domain, so nothing more is read here. `prefix` names the fields in the refusal.
 */
function judgeWorkspace(
  workspace: WorkspaceId | null,
  attachment: WorkspaceAttachment | null,
  prefix: Readonly<{ workspace: string; attachment: string }>,
): Decision | null {
  if (workspace === null)
    return attachment === null
      ? null
      : invalid(prefix.attachment, 'an attachment without a workspace')
  if (!legalWorkspace(workspace)) return invalid(prefix.workspace, 'not a legal WorkspaceId')
  if (typeof attachment !== 'object' || attachment === null)
    return invalid(prefix.attachment, 'a workspace without an attachment')
  if (emptyText(attachment.instance)) return invalid(`${prefix.attachment}.instance`, 'empty')
  if (emptyText(attachment.basis)) return invalid(`${prefix.attachment}.basis`, 'empty')
  return null
}

/** The deterministic Run identity of (session, first input, predecessor): the OP-00 elements of `startRun`. */
export function runIdOf(session: SessionId, first: InputId, predecessor: RunId | null): RunId {
  return `run_${digestOf({ session, first, predecessor })}` as RunId
}

/** The deterministic encoding of (run, ordinal) that `AttemptId` promises. */
export function attemptIdOf(run: RunId, ordinal: string): AttemptId {
  return `${run}#${ordinal}` as AttemptId
}

/** The execution identity that Session allocates for a Run before the Agent accepts it (PM-01). */
export function executionIdOf(run: RunId): string {
  return `${run}/execution`
}

function sessionOrigin(source: DurableEvidence, via: Origin['via'] = 'direct'): Origin {
  return { owner: 'session', via, source }
}

/** Evidence of the command itself, for entries whose source is the Session's own decision. */
function commandEvidence(operation: SessionOperationId, what: string): DurableEvidence {
  return {
    owner: '@omne-harness/session-contract',
    record: `${operation}/${what}`,
    revision: '1',
    digest: `sha256:${digestOf({ operation, what })}`,
  }
}

function decideCreate(
  previous: WorkSnapshot | null,
  command: Extract<SessionCommand, { kind: 'create' }>,
): Decision {
  if (previous !== null) return invalid('session', 'the session already exists')
  const { creation } = command.input
  if (creation.definition.name.length === 0) return invalid('creation.definition.name', 'empty')
  if (emptyAdoption(creation.definition.candidate))
    return invalid('creation.definition.candidate', 'incomplete adoption')
  if (emptyAdoption(creation.execution)) return invalid('creation.execution', 'incomplete adoption')
  if (emptyAdoption(creation.entryContract))
    return invalid('creation.entryContract', 'incomplete adoption')
  const workspace = judgeWorkspace(creation.workspace, creation.attachment, {
    workspace: 'creation.workspace',
    attachment: 'creation.attachment',
  })
  if (workspace !== null) return workspace
  if (creation.modes.kind === 'explicit' && emptyAdoption(creation.modes.value.environment))
    return invalid('creation.modes.value.environment', 'incomplete adoption')
  if (creation.modes.kind === 'tenant-default' && emptyAdoption(creation.modes.source))
    return invalid('creation.modes.source', 'incomplete adoption')
  const items: InitializationItem[] = creation.requiredIdentities.map(identity => ({
    item: identity.name,
    owner: identity.capability,
    protocol: creation.entryContract,
    input: toJsonValue({ capability: identity.capability, name: identity.name }),
  }))
  const source = commandEvidence(command.input.operation, 'created')
  const out: EncodedEntry[] = [
    encodeEntry(
      {
        kind: 'session.created',
        tenant: command.input.tenant,
        session: command.input.session,
        operation: command.input.operation,
        creation,
        items,
      },
      sessionOrigin(source, 'intake'),
    ),
  ]
  if (creation.initial !== null) {
    const initial = creation.initial
    if (initial.input.length === 0 || initial.message.blocks.length === 0)
      return invalid('creation.initial', 'the initial input has no identity or no content')
    out.push(...acceptedOrdinary(initial, 'next-run', null))
  }
  return entries(out)
}

function acceptedOrdinary(
  input: Extract<SessionCommand, { kind: 'accept' }>['input']['value'] & { kind: 'ordinary' },
  destination: 'current-run' | 'next-run',
  run: RunId | null,
): EncodedEntry[] {
  return [
    encodeEntry(
      {
        kind: `message.${input.message.role}`,
        message: input.message,
        source: input.origin,
        admission: null,
        consumption: null,
        participation: null,
      },
      { owner: 'user', via: 'intake', source: input.origin },
    ),
    encodeEntry(
      { kind: 'intake.routed', input: input.input, destination, run, origin: input.origin },
      sessionOrigin(input.origin, 'intake'),
    ),
  ]
}

function decideCompleteInitialization(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'completeInitialization' }>,
): Decision {
  const { result } = command.input
  const task = snapshot.tasks.find(
    item =>
      item.kind === 'initialization' && item.item === result.item && item.owner === result.owner,
  )
  if (task === undefined)
    return invalid('result.item', 'no pending initialization item of that owner')
  if (task.kind === 'initialization' && task.state === 'failed' && result.result.kind === 'failed')
    return rejected({ kind: 'conflict', operation: task.originalOperation })
  const evidence = result.result.kind === 'ready' ? result.result.evidence : result.result.recovery
  if (emptyEvidence(evidence)) return invalid('result.result', 'incomplete evidence')
  return entries([
    encodeEntry(
      { kind: 'session.initialization-item', result },
      { owner: result.owner, via: 'intake', source: evidence },
    ),
  ])
}

function decideAccept(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'accept' }>,
): Decision {
  const { value } = command.input
  const route = routeInput(snapshot, value)
  switch (route.kind) {
    case 'rejected':
      if (route.reason === 'archived') return rejected({ kind: 'archived' })
      if (route.reason === 'frozen') return rejected({ kind: 'frozen', verdict: null })
      return invalid('value', 'the input has no identity or no content')
    case 'card':
    case 'business':
      return rejected(OFF_PATH_FAILURE)
    case 'queue': {
      if (value.kind !== 'ordinary') return rejected(OFF_PATH_FAILURE)
      if (snapshot.pending.includes(value.input))
        return invalid('value.input', 'an input of that identity was already accepted')
      const run = snapshot.run.kind === 'active' ? snapshot.run.run : null
      return entries(acceptedOrdinary(value, route.destination, run))
    }
  }
}

/** The owner of the guard material that confirms the login of an ordinary-input entry (#318 design, 「普通输入的来源与登录门」). */
export const LOGIN_ENTRY_OWNER = 'login-entry'

function decideStartRun(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'startRun' }>,
  guards: readonly GuardCommand[],
): Decision {
  const judgment = judgeRunStart(snapshot, command.input.entry)
  if (judgment.kind !== 'eligible') {
    if (judgment.kind === 'frozen') return rejected({ kind: 'frozen', verdict: null })
    return rejected({ kind: judgment.kind })
  }
  // The login gate (ruling R2): an interactive entry needs the login confirmation that the
  // evidence bridge takes from the first input's origin. Presence only; `facts` stays opaque.
  if (
    command.input.entry === 'interactive' &&
    !guards.some(guard => guard.owner === LOGIN_ENTRY_OWNER)
  )
    return rejected({ kind: 'login-required' })
  const { candidate, instance } = command.input
  if (emptyAdoption(candidate)) return invalid('candidate', 'incomplete adoption')
  if (instance.owner !== 'agent' || instance.id.length === 0)
    return invalid('instance', 'not an Agent instance')
  const predecessor = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
  const run = runIdOf(snapshot.session, judgment.first, predecessor)
  const source = commandEvidence(command.input.operation, 'run-started')
  const out: EncodedEntry[] = []
  if (digestOf(candidate) !== digestOf(snapshot.definition.adopted))
    out.push(encodeEntry({ kind: 'session.adoption', adopted: candidate }, sessionOrigin(source)))
  out.push(
    encodeEntry(
      {
        kind: 'run.started',
        run,
        execution: executionIdOf(run),
        entry: command.input.entry,
        first: judgment.first,
        predecessor,
        adoption: candidate,
      },
      sessionOrigin(source),
    ),
    encodeEntry(
      {
        kind: 'run.attempt-started',
        run,
        attempt: attemptIdOf(run, '1'),
        ordinal: '1',
        instance,
        reason: 'start',
      },
      sessionOrigin(source),
    ),
  )
  return entries(out)
}

function decideRecordMessage(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'recordMessage' }>,
): Decision {
  const { participation, value } = command.input
  if (participation.joint !== 'message')
    return invalid('participation.joint', 'not the message hand-over')
  const judgment = judgeAdvance(snapshot, {
    kind: 'participation',
    execution: participation.execution,
    joint: participation.joint,
  })
  if (judgment.kind === 'stale-advance')
    return invalid('participation.execution', 'not the execution of the active Run')
  if (judgment.kind !== 'ok') return rejected(judgment)
  if (value.message.role === 'user' || value.message.role === 'compaction')
    return invalid('value.message', 'not a message that the message hand-over records')
  return entries([
    encodeEntry(
      {
        kind: `message.${value.message.role}`,
        message: value.message,
        source: value.source,
        admission: value.admission,
        consumption: value.consumption,
        participation,
      },
      { owner: 'agent', via: 'agent-participant', source: value.source },
    ),
  ])
}

function decideFinishRun(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'finishRun' }>,
): Decision {
  const { run, expected, bounded } = command.input
  const judgment = judgeAdvance(snapshot, { kind: 'bounded', run, expected, basis: bounded })
  if (judgment.kind === 'stale-advance')
    return invalid('run', 'not the unfinished Run of this session')
  if (judgment.kind === 'archived') return rejected({ kind: 'archived' })
  if (judgment.kind !== 'ok') return rejected(judgment)
  if (snapshot.run.kind !== 'active')
    return invalid('run', 'not the unfinished Run of this session')
  const active = snapshot.run
  const source = commandEvidence(command.input.operation, 'bounded-close')
  const out: EncodedEntry[] = []
  if (bounded.kind === 'admission-rejected') {
    if (bounded.input !== active.first)
      return invalid('bounded.input', 'not the first input of the Run')
    if (!snapshot.pending.includes(bounded.input))
      return invalid('bounded.input', 'the first input is no longer pending')
    if (emptyEvidence(bounded.rejection)) return invalid('bounded.rejection', 'incomplete evidence')
    out.push(
      encodeEntry(
        {
          kind: 'intake.handed-over',
          input: bounded.input,
          execution: active.execution.execution,
          result: { kind: 'rejected', reason: 'admission-rejected', rejection: bounded.rejection },
        },
        { owner: 'agent', via: 'session-adapter', source: bounded.rejection },
      ),
    )
  } else if (emptyEvidence(bounded.evidence)) {
    return invalid('bounded.evidence', 'incomplete evidence')
  }
  if (active.advance !== null)
    out.push(
      encodeEntry(
        { kind: 'run.attempt-released', run, attempt: active.advance.attempt, reason: 'bounded' },
        sessionOrigin(source),
      ),
    )
  const evidence = bounded.kind === 'admission-rejected' ? bounded.rejection : bounded.evidence
  const terminal: RunTerminal = { run, outcome: 'failed', evidence }
  out.push(
    encodeEntry(
      { kind: 'run.terminal', terminal, sequence: null, cause: null, disposition: null, bounded },
      sessionOrigin(source),
    ),
  )
  return entries(out)
}

function decideReceive(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'receive' }>,
): Decision {
  const { fact } = command.input
  switch (fact.kind) {
    case 'input-handover':
      return decideHandover(snapshot, fact)
    default:
      return rejected(OFF_PATH_FAILURE)
  }
}

function decideHandover(
  snapshot: WorkSnapshot,
  fact: Extract<ProducerFact, { kind: 'input-handover' }>,
): Decision {
  if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (snapshot.run.kind !== 'active' || snapshot.run.execution.execution !== fact.execution)
    return invalid('fact.execution', 'not the execution of the active Run')
  if (!snapshot.pending.includes(fact.input))
    return invalid('fact.input', 'the input is not pending')
  if (fact.result.kind === 'accepted' && snapshot.handed.includes(fact.input))
    return invalid('fact.input', 'the input was already handed over')
  const evidence = fact.result.kind === 'accepted' ? fact.result.receipt : fact.result.rejection
  if (emptyEvidence(evidence)) return invalid('fact.result', 'incomplete evidence')
  return entries([
    encodeEntry(
      {
        kind: 'intake.handed-over',
        input: fact.input,
        execution: fact.execution,
        result: fact.result,
      },
      { owner: 'agent', via: 'session-adapter', source: evidence },
    ),
  ])
}

/**
 * `change` is decided by #756. Its `workspace` dimension is still judged here, so an illegal
 * selection is `invalid` rather than `unavailable`.
 */
function decideChange(command: Extract<SessionCommand, { kind: 'change' }>): Decision {
  const { declaration } = command.input
  if (declaration.kind === 'workspace') {
    const refused = judgeWorkspace(declaration.value, declaration.attachment, {
      workspace: 'declaration.value',
      attachment: 'declaration.attachment',
    })
    if (refused !== null) return refused
  }
  return rejected(OFF_PATH_FAILURE)
}

/**
 * The normalized parameter digest of one command: the command without its operation identity,
 * so the same intent under the same identity recalls and another intent conflicts (SL07).
 */
export function commandDigest(command: SessionCommand): string {
  const { operation: _operation, ...rest } = command.input as Record<string, unknown> & {
    operation: SessionOperationId
  }
  return digestOf({ kind: command.kind, input: rest })
}

/**
 * Runs the domain services for one command and encodes the batch. `previous` is null only for
 * `create`. `reads` is read only by `commitDerived(compaction)`, which this member does not decide.
 */
export function decide(
  previous: WorkSnapshot | null,
  command: SessionCommand,
  guards: readonly GuardCommand[],
  record: OperationRecord | null,
  _reads: DecideReads,
): Decision {
  const recall = resolveOperation(record, command.input.operation, commandDigest(command))
  if (recall.kind === 'recovered') return { kind: 'recovered', receipt: recall.receipt }
  if (recall.kind === 'conflict') return rejected({ kind: 'conflict', operation: recall.operation })
  if (command.kind === 'create') return decideCreate(previous, command)
  if (previous === null) return rejected({ kind: 'denied', action: command.kind })
  if (
    previous.session !== command.input.session ||
    !tenantEquals(previous.tenant, command.input.tenant)
  )
    return rejected({ kind: 'denied', action: command.kind })
  switch (command.kind) {
    case 'completeInitialization':
      return decideCompleteInitialization(previous, command)
    case 'accept':
      return decideAccept(previous, command)
    case 'startRun':
      return decideStartRun(previous, command, guards)
    case 'recordMessage':
      return decideRecordMessage(previous, command)
    case 'receive':
      return decideReceive(previous, command)
    case 'finishRun':
      return decideFinishRun(previous, command)
    case 'change':
      return decideChange(command)
    default:
      return rejected(OFF_PATH_FAILURE)
  }
}
