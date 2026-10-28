// `decide` turns one command into the content of one commit (SPEC「领域服务与归约」): it recalls the
// operation, runs the domain services of the command table, and produces the entry batch or the
// refusal. The guard materials ride along opaque: `decide` reads only their presence (the login
// gate of `startRun`), never their `facts`. `reduce(decide(...))` round-trips under one interpreter.
//
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
  judgeAdvance,
  judgeRunStart,
  resolveOperation,
  routeInput,
  type DecideReads,
  type Decision,
  type EncodedEntry,
  type OperationRecord,
} from './judgments.ts'
import { judgeCompaction } from '@omne-harness/message'
import { decideManagement, decideControl } from './decide-management.ts'
import { decideResults } from './decide-results.ts'
import { decideProducerFact } from './decide-receive.ts'
import { residentEntries, completeEvidence } from './decision-support.ts'
import { digestOf } from './operations.ts'

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

/** True when legal-identity minted `workspace`: its codec encodes only the values it minted. */
function mintedWorkspace(workspace: WorkspaceId): boolean {
  return workspaceCodec.encode(workspace).ok
}

/** Why one attachment field is not a non-empty text, or null when it is one. */
function textRefusal(value: unknown): string | null {
  if (typeof value !== 'string') return 'type'
  return value.length === 0 ? 'empty' : null
}

/**
 * The workspace selection of a creation or a `workspace` change: a `WorkspaceId` with its
 * workspace attachment, or neither. The attachment fields are non-empty text; their format belongs
 * to the workspace domain, so nothing more is read here. `path` names the two fields in the refusal.
 * An input that crossed an untyped boundary may lack the attachment key, so `undefined` is refused.
 */
function judgeWorkspace(
  workspace: WorkspaceId | null,
  attachment: WorkspaceAttachment | null | undefined,
  path: Readonly<{ workspace: string; attachment: string }>,
): Decision | null {
  if (attachment === undefined) return invalid(path.attachment, 'the field is missing')
  if (workspace === null)
    return attachment === null
      ? null
      : invalid(path.attachment, 'an attachment without a workspace')
  if (!mintedWorkspace(workspace)) return invalid(path.workspace, 'not a legal WorkspaceId')
  if (attachment === null || typeof attachment !== 'object')
    return invalid(path.attachment, 'a workspace without an attachment object')
  for (const field of ['instance', 'basis'] as const) {
    const reason = textRefusal(attachment[field])
    if (reason !== null) return invalid(`${path.attachment}.${field}`, reason)
  }
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
  const workspace = judgeWorkspace(creation.workspace, creation.workspaceAttachment, {
    workspace: 'creation.workspace',
    attachment: 'creation.workspaceAttachment',
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
  const residents = residentEntries(null, creation.residentAdoption, source)
  if (residents.kind !== 'entries') return residents
  out.push(...residents.entries)
  if (creation.residentAdoption !== undefined)
    out.push(
      encodeEntry(
        {
          kind: 'session.adoption',
          adopted: creation.definition.candidate,
          residentKeys: creation.residentAdoption.keys,
        },
        sessionOrigin(source),
      ),
    )
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
    case 'business': {
      if (value.kind === 'ordinary') return invalid('value', 'not a routed input')
      const source = value.kind === 'card-decision' ? value.decision : value.input
      if (!completeEvidence(source) || !completeEvidence(value.destination))
        return invalid('value', 'incomplete route evidence')
      const routed = encodeEntry(
        {
          kind: 'intake.routed',
          task: {
            kind: 'routed-input',
            originalOperation: command.input.operation,
            value,
            state: 'pending',
          },
        },
        sessionOrigin(source),
      )
      return entries(
        value.kind === 'card-decision'
          ? [
              routed,
              encodeEntry(
                { kind: 'hitl.decision', value },
                { owner: 'hitl', via: 'intake', source },
              ),
            ]
          : [routed],
      )
    }
    case 'queue': {
      if (value.kind !== 'ordinary') return invalid('value', 'not an ordinary input')
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
  const residents = residentEntries(snapshot, command.input.residentAdoption, source)
  if (residents.kind !== 'entries') return residents
  out.push(...residents.entries)
  if (
    digestOf(candidate) !== digestOf(snapshot.definition.adopted) ||
    command.input.residentAdoption !== undefined
  )
    out.push(
      encodeEntry(
        {
          kind: 'session.adoption',
          adopted: candidate,
          ...(command.input.residentAdoption === undefined
            ? {}
            : { residentKeys: command.input.residentAdoption.keys }),
        },
        sessionOrigin(source),
      ),
    )
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
  if (snapshot.frozen !== null && snapshot.pending.length > 0)
    out.push(
      encodeEntry(
        {
          kind: 'intake.released',
          inputs: snapshot.pending.filter(
            input => bounded.kind !== 'admission-rejected' || input !== bounded.input,
          ),
        },
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
      return decideProducerFact(snapshot, command)
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

function decideChange(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'change' }>,
): Decision {
  const { declaration } = command.input
  const proof =
    'authorization' in declaration
      ? declaration.authorization
      : 'basis' in declaration
        ? declaration.basis
        : declaration.registration
  if (!completeEvidence(proof)) return invalid('declaration', 'incomplete evidence')
  if (declaration.kind === 'model' && !declaration.name)
    return invalid('declaration.name', 'empty model selection')
  if (
    declaration.kind === 'environment-mode' &&
    (emptyAdoption(declaration.value) || !completeEvidence(declaration.setting))
  )
    return invalid('declaration', 'incomplete environment adoption or setting')
  if (declaration.kind === 'workspace') {
    const refused = judgeWorkspace(declaration.value, declaration.workspaceAttachment, {
      workspace: 'declaration.value',
      attachment: 'declaration.workspaceAttachment',
    })
    if (refused !== null) return refused
  }
  const source = commandEvidence(command.input.operation, 'change')
  if (declaration.kind === 'workspace')
    return entries([
      encodeEntry(
        {
          kind: 'session.workspace-changed',
          workspace: declaration.value,
          workspaceAttachment: declaration.workspaceAttachment,
          basis: declaration.basis,
        },
        sessionOrigin(source),
      ),
    ])
  const kind =
    declaration.kind === 'model'
      ? 'session.model-selected'
      : declaration.kind.endsWith('-mode')
        ? 'session.mode-changed'
        : declaration.kind === 'context-registration'
          ? 'session.context-registration-changed'
          : declaration.kind === 'context-step-commit' || declaration.kind === 'recovery-input'
            ? 'session.recovery-input-adopted'
            : 'session.declaration-adopted'
  const scope = snapshot.contextScopes?.at(-1)?.scope ?? null
  return entries([
    encodeEntry({ kind, declaration, scope }, sessionOrigin(source)),
    ...(declaration.kind === 'environment-mode'
      ? [
          encodeEntry(
            { kind: 'session.declaration-adopted', declaration, scope },
            sessionOrigin(source),
          ),
        ]
      : []),
  ])
}

function decideAttempt(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'claim' | 'reload' | 'release' }>,
): Decision {
  if (command.kind === 'release') {
    const judgment = judgeAdvance(snapshot, {
      kind: 'attempt',
      advance: command.input.advance,
      expected: command.input.expected,
    })
    if (judgment.kind !== 'ok') return rejected(judgment)
    if (!completeEvidence(command.input.handover)) return invalid('handover', 'incomplete evidence')
    return entries([
      encodeEntry(
        {
          kind: 'run.attempt-released',
          run: command.input.advance.run,
          attempt: command.input.advance.attempt,
          reason: 'released',
        },
        sessionOrigin(command.input.handover),
      ),
    ])
  }
  if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (snapshot.run.kind === 'terminal')
    return rejected({ kind: 'terminal', terminal: snapshot.run.terminal })
  if (snapshot.run.kind !== 'active' || command.input.run !== snapshot.run.run)
    return rejected({
      kind: 'stale-advance',
      current: snapshot.run.kind === 'active' ? snapshot.run.advance : null,
    })
  if (command.kind === 'reload' && snapshot.frozen !== null)
    return rejected({ kind: 'frozen', verdict: snapshot.frozen })
  if (command.kind === 'reload' && command.input.expected !== snapshot.revision)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  const source = command.kind === 'claim' ? command.input.continuity : command.input.handover
  if (
    !completeEvidence(source) ||
    !command.input.instance.id ||
    command.input.instance.owner !== 'agent'
  )
    return invalid('instance', 'incomplete instance or handover')
  const out: EncodedEntry[] = []
  if (command.kind === 'reload') {
    if (
      emptyAdoption(command.input.candidate) ||
      command.input.candidate.name !== snapshot.definition.adopted.name
    )
      return invalid('candidate', 'a reload must preserve the definition identity')
    const residents = residentEntries(snapshot, command.input.residentAdoption, source)
    if (residents.kind !== 'entries') return residents
    out.push(...residents.entries)
    if (
      digestOf(command.input.candidate) !== digestOf(snapshot.run.adoption) ||
      command.input.residentAdoption !== undefined
    )
      out.push(
        encodeEntry(
          {
            kind: 'session.adoption',
            adopted: command.input.candidate,
            ...(command.input.residentAdoption === undefined
              ? {}
              : { residentKeys: command.input.residentAdoption.keys }),
          },
          sessionOrigin(source),
        ),
      )
  }
  if (snapshot.run.advance !== null)
    out.push(
      encodeEntry(
        {
          kind: 'run.attempt-released',
          run: snapshot.run.run,
          attempt: snapshot.run.advance.attempt,
          reason: 'superseded',
        },
        sessionOrigin(source),
      ),
    )
  const ordinal = String(BigInt(snapshot.run.ordinal) + 1n)
  out.push(
    encodeEntry(
      {
        kind: 'run.attempt-started',
        run: snapshot.run.run,
        attempt: attemptIdOf(snapshot.run.run, ordinal),
        ordinal,
        instance: command.input.instance,
        reason: command.kind,
      },
      sessionOrigin(source),
    ),
  )
  return entries(out)
}

function decideDerived(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'commitDerived' }>,
  reads: DecideReads,
): Decision {
  const input = command.input
  const source = commandEvidence(input.operation, 'derived')
  if (input.value.kind === 'compaction') {
    if (input.participation === undefined || input.judgment === undefined)
      return invalid('participation', 'context transition materials are required')
    const judgment = judgeAdvance(snapshot, {
      kind: 'participation',
      execution: input.participation.execution,
      joint: input.participation.joint,
    })
    if (judgment.kind !== 'ok') return rejected(judgment)
    if (input.participation.joint !== 'context-transition')
      return invalid('participation', 'not a context transition')
    if (reads.compaction === null)
      return rejected({
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'compaction transaction reads are missing',
      })
    const compact = judgeCompaction(input.value.message, reads.compaction)
    if ('rejected' in compact) return invalid('value.message', compact.rejected)
    return entries([
      encodeEntry(
        {
          kind: 'message.compaction',
          message: input.value.message,
          source: input.judgment,
          admission: input.judgment,
          consumption: null,
          participation: input.participation,
        },
        sessionOrigin(source),
      ),
      encodeEntry(
        {
          kind: 'history.annotated',
          targets: reads.compaction.covered.map(item => item.ref),
          source: input.judgment,
        },
        sessionOrigin(source),
      ),
    ])
  }
  if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (input.expected !== snapshot.revision)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  if (input.value.message.role !== 'system_reminder')
    return invalid('value.message', 'not a context reminder')
  return entries([
    encodeEntry(
      {
        kind: 'message.system_reminder',
        message: input.value.message,
        source: input.value.source,
        admission: null,
        consumption: null,
        participation: null,
      },
      sessionOrigin(source),
    ),
  ])
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
 * `create`. `reads` supplies transaction-bound compaction and management observations.
 */
export function decide(
  previous: WorkSnapshot | null,
  command: SessionCommand,
  guards: readonly GuardCommand[],
  record: OperationRecord | null,
  reads: DecideReads,
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
      return decideChange(previous, command)
    case 'claim':
    case 'reload':
    case 'release':
      return decideAttempt(previous, command)
    case 'bindExternalCall':
    case 'preserveResult':
    case 'completeConsumption':
    case 'completeExternalConsumption':
      return decideResults(previous, command)
    case 'commitDerived':
      return decideDerived(previous, command, reads)
    case 'interrupt': {
      if (
        command.input.urgent.message.blocks.length === 0 ||
        previous.pending.includes(command.input.urgent.input)
      )
        return invalid('urgent', 'empty or duplicate input')
      const control = decideControl(
        previous,
        {
          kind: 'interrupt',
          run: command.input.run,
          urgent: command.input.urgent,
          decision: command.input.decision,
        },
        command.input.operation,
        reads,
      )
      return control.kind === 'entries'
        ? entries([
            ...acceptedOrdinary(command.input.urgent, 'current-run', command.input.run),
            ...control.entries,
          ])
        : control
    }
    case 'freeze':
      if (previous.frozen !== null)
        return reads.frozenReceipt === undefined
          ? rejected({
              kind: 'unavailable',
              owner: 'session-history',
              diagnostic: 'the original freeze receipt is required for state recall',
            })
          : { kind: 'recovered', receipt: reads.frozenReceipt }
      return decideManagement(previous, command, reads)
    case 'control':
    case 'setRelation':
    case 'configureAutoArchive':
    case 'considerAutoArchive':
    case 'recordIdle':
      return decideManagement(previous, command, reads)
    default: {
      const exhaustive: never = command
      return exhaustive
    }
  }
}
