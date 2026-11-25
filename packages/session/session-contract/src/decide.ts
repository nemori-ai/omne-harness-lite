import { decideModelProjection } from './model-projection.ts'
import { acceptedOrdinary } from './accepted-ordinary.ts'
import { validSelectionEffort } from './control-values.ts'
import { originalContent } from './before-intake.ts'
import { decidePermissionAssignment } from './permission-state.ts'
import { incompleteAuthorization } from './authorizations.ts'
import {
  DEFAULT_SESSION_INTAKE_LIMITS,
  pendingIntakeCount,
  type SessionIntakeLimits,
} from './intake.ts'
import { decideTodos } from './decide-todos.ts'
import { decideDelivery } from './decide-delivery.ts'
import { requiredWorkEntries } from './work-entry-state.ts'
import { decodeEntries } from './entries.ts'
import { validateFrontierBatch } from './frontier-state.ts'
import { SessionValidationFailure } from './session-validation.ts'
import { CallConflict } from './call-state.ts'
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
import type {
  BoundedClose,
  DeclarationChange,
  RoutedInput,
  RunTerminal,
  WorkSnapshot,
  WorkspaceAttachment,
} from './values.ts'
import type { HistoryEntry, ProducerFact, StartAdoption } from './faces.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import { encodeEntry } from './entries.ts'
import {
  decideInitializationCreate,
  decideInitializationComplete,
  validateInitializationRecall,
} from './decide-initialization.ts'
import {
  expectedHolds,
  expectedRevision,
  judgeAdvance,
  judgeRunStart,
  reloadRefusal,
  resolveOperation,
  routeInput,
  type DecideReads,
  type Decision,
  type EncodedEntry,
  type OperationRecord,
} from './judgments.ts'
import type { SessionHistoryReads } from './history-values.ts'
import { decideCompactionCommit } from './compaction-commit.ts'
import { decideManagement, decideControl } from './decide-management.ts'
import { closeControlFailure, decideNamedControl } from './decide-control.ts'
import { decideResults } from './decide-results.ts'
import { decideProducerFact } from './decide-receive.ts'
import { admitInput, readsWithTerms } from './decide-intake.ts'
import {
  rejected,
  invalid,
  entries,
  residentEntries,
  completeEvidence,
} from './decision-support.ts'
import { judgeFork, judgeStanding } from './standing.ts'
import { closingEntries } from './run-closure.ts'
import { pendingAfterTerminal } from './input-leases.ts'
import { digestOf } from './operations.ts'
import { canonicalInitializationValue, creationInput, tenantText } from './initialization-plan.ts'
import { InitializationInvalid } from './initialization-parse.ts'

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
function emptyAdoption(adoption: Adoption): boolean {
  return [adoption.owner, adoption.name, adoption.revision, adoption.digest].some(
    part => part.length === 0,
  )
}

function mintedWorkspace(workspace: WorkspaceId): boolean {
  return workspaceCodec.encode(workspace).ok
}

function textRefusal(value: unknown): string | null {
  if (typeof value !== 'string') return 'type'
  return value.length === 0 ? 'empty' : null
}

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

export function runIdOf(session: SessionId, first: InputId, predecessor: RunId | null): RunId {
  return `run_${digestOf({ session, first, predecessor })}` as RunId
}

export function attemptIdOf(run: RunId, ordinal: string): AttemptId {
  return `${run}#${ordinal}` as AttemptId
}

export function executionIdOf(run: RunId): string {
  return `${run}/execution`
}

function sessionOrigin(source: DurableEvidence, via: Origin['via'] = 'direct'): Origin {
  return { owner: 'session', via, source }
}

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
  guards: readonly GuardCommand[],
  limits: SessionIntakeLimits,
  reads: DecideReads,
): Decision {
  if (previous !== null) return invalid('session', 'the session already exists')
  const { creation } = command.input
  if (creation.definition.name.length === 0) return invalid('creation.definition.name', 'empty')
  if (emptyAdoption(creation.definition.candidate))
    return invalid('creation.definition.candidate', 'incomplete adoption')
  if (emptyAdoption(creation.execution)) return invalid('creation.execution', 'incomplete adoption')
  if (emptyAdoption(creation.entryContract))
    return invalid('creation.entryContract', 'incomplete adoption')
  const initialModel = creation.initialModelSelection
  if (initialModel !== undefined && (!initialModel.name || !completeEvidence(initialModel.basis)))
    return invalid('creation.initialModelSelection', 'empty name or incomplete evidence')
  if (!validSelectionEffort(initialModel?.reasoningEffort))
    return invalid('creation.initialModelSelection.reasoningEffort', 'invalid reasoning effort')
  const workspace = judgeWorkspace(creation.workspace, creation.workspaceAttachment, {
    workspace: 'creation.workspace',
    attachment: 'creation.workspaceAttachment',
  })
  if (workspace !== null) return workspace
  if (creation.modes.kind === 'explicit' && emptyAdoption(creation.modes.value.environment))
    return invalid('creation.modes.value.environment', 'incomplete adoption')
  if (creation.modes.kind === 'tenant-default' && emptyAdoption(creation.modes.source))
    return invalid('creation.modes.source', 'incomplete adoption')
  const standing = judgeStanding(command.input.session, creation, reads.related)
  if ('kind' in standing) return standing
  const forked = judgeFork(creation, reads.fork)
  if (forked !== null) return forked
  const initialized = decideInitializationCreate(command, guards, standing.tree)
  if (initialized.kind !== 'entries') return initialized
  const out = [...initialized.entries]
  if (creation.initial !== null) {
    if (creation.initial.input.length === 0 || creation.initial.message.blocks.length === 0)
      return invalid('creation.initial', 'the initial input has no identity or no content')
    const admitted = admitInput(creation.initial, 0, { reads, limits }, 'creation.initial')
    if ('kind' in admitted) return admitted
    out.push(...acceptedOrdinary(creation.initial, 'next-run', null, admitted.source))
  }
  return entries(out)
}

function decideAccept(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'accept' }>,
  limits: SessionIntakeLimits,
  reads: DecideReads,
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
      const admitted = admitInput(value, pendingIntakeCount(snapshot), { reads, limits }, 'value')
      if ('kind' in admitted) return admitted
      const run = snapshot.run.kind === 'active' ? snapshot.run.run : null
      return entries(acceptedOrdinary(value, route.destination, run, admitted.source))
    }
  }
}

function adoptionEntries(
  snapshot: WorkSnapshot,
  material: StartAdoption | undefined,
  candidate: Adoption,
  current: Adoption,
  source: DurableEvidence,
): Decision {
  if (material?.verdict !== undefined)
    return rejected({ kind: 'frozen', verdict: material.verdict })
  const residents = residentEntries(snapshot, material, source)
  if (residents.kind !== 'entries') return residents
  if (digestOf(candidate) === digestOf(current) && material === undefined) return residents
  const keys = material === undefined ? {} : { residentKeys: material.keys }
  return entries([
    ...residents.entries,
    encodeEntry({ kind: 'session.adoption', adopted: candidate, ...keys }, sessionOrigin(source)),
  ])
}

function decideStartRun(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'startRun' }>,
): Decision {
  const judgment = judgeRunStart(snapshot, command.input.entry)
  if (judgment.kind !== 'eligible') {
    if (judgment.kind === 'frozen') return rejected({ kind: 'frozen', verdict: null })
    if (judgment.kind === 'awaiting-person') return rejected({ kind: 'no-input' })
    return rejected({ kind: judgment.kind })
  }
  const { candidate, instance, note } = command.input
  const source = commandEvidence(command.input.operation, 'run-started')
  if (note !== undefined && note.reason.length === 0) return invalid('note', 'no reason')
  const noted =
    note === undefined
      ? []
      : [encodeEntry({ kind: 'session.adoption-noted', note }, sessionOrigin(source))]
  if (note?.kind === 'waiting') return entries(noted)
  if (emptyAdoption(candidate)) return invalid('candidate', 'incomplete adoption')
  if (instance.owner !== 'agent' || instance.id.length === 0)
    return invalid('instance', 'not an Agent instance')
  const predecessor = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
  const run = runIdOf(snapshot.session, judgment.first, predecessor)
  const adopted = adoptionEntries(
    snapshot,
    command.input.residentAdoption,
    candidate,
    snapshot.definition.adopted,
    source,
  )
  if (adopted.kind !== 'entries') return adopted
  const out: EncodedEntry[] = [...adopted.entries, ...noted]
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
  if ('deliveries' in value) return decideDelivery(snapshot, participation, value)
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
  const basis = boundedBasis(command.input.operation, bounded)
  const { rejects } = basis
  const out: EncodedEntry[] = []
  if (rejects !== null) {
    if (rejects.input !== active.first)
      return invalid('bounded.input', 'not the first input of the Run')
    if (!snapshot.pending.includes(rejects.input))
      return invalid('bounded.input', 'the first input is no longer pending')
  }
  if (!completeEvidence(basis.evidence)) return invalid(basis.field, 'incomplete evidence')
  if (rejects !== null)
    out.push(
      encodeEntry(
        {
          kind: 'intake.handed-over',
          input: rejects.input,
          execution: active.execution.execution,
          result: { kind: 'rejected', reason: rejects.reason, rejection: basis.evidence },
        },
        rejects.origin,
      ),
    )
  const terminal: RunTerminal = { run, outcome: 'failed', evidence: basis.evidence }
  out.push(...closingEntries(snapshot, terminal, source, sessionOrigin(source)))
  if (active.advance !== null)
    out.push(
      encodeEntry(
        { kind: 'run.attempt-released', run, attempt: active.advance.attempt, reason: 'bounded' },
        sessionOrigin(source),
      ),
    )
  out.push(
    encodeEntry(
      {
        kind: 'run.terminal',
        terminal,
        sequence: null,
        cause: bounded.kind === 'drive-refused' ? basis.evidence : null,
        disposition: null,
        bounded,
        end: null,
      },
      sessionOrigin(source),
    ),
  )
  const remaining = pendingAfterTerminal(snapshot, terminal.outcome)
  if (snapshot.frozen !== null && remaining.length > 0) {
    const inputs = remaining.filter(input => input !== rejects?.input)
    out.push(encodeEntry({ kind: 'intake.released', inputs }, sessionOrigin(source)))
  }
  return entries(out)
}

type BoundedBasis = Readonly<{
  evidence: DurableEvidence
  field: string
  rejects: Readonly<{ input: InputId; reason: BoundedClose['kind']; origin: Origin }> | null
}>

function boundedBasis(operation: SessionOperationId, bounded: BoundedClose): BoundedBasis {
  switch (bounded.kind) {
    case 'uninterpretable':
      return { evidence: bounded.evidence, field: 'bounded.evidence', rejects: null }
    case 'admission-rejected': {
      const { input, rejection } = bounded
      const origin: Origin = { owner: 'agent', via: 'session-adapter', source: rejection }
      return {
        evidence: rejection,
        field: 'bounded.rejection',
        rejects: { input, reason: bounded.kind, origin },
      }
    }
    case 'drive-refused': {
      const { failure, field, reason, input } = bounded
      const named = [failure, field, reason].filter(part => part !== null).join(' ')
      const evidence: DurableEvidence = {
        owner: '@omne-harness/session-contract',
        record: `drive refused: ${named}`,
        revision: '1',
        digest: `sha256:${digestOf({ operation, what: 'drive-refused', failure, field, reason })}`,
      }
      const rejects =
        input === null ? null : { input, reason: bounded.kind, origin: sessionOrigin(evidence) }
      return { evidence, field: 'bounded', rejects }
    }
  }
}

function decideReceive(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'receive' }>,
  history: SessionHistoryReads | undefined,
): Decision {
  const { fact } = command.input
  switch (fact.kind) {
    case 'input-handover':
      return decideHandover(snapshot, fact)
    default:
      return decideProducerFact(snapshot, command, undefined, history)
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
  if (!completeEvidence(evidence)) return invalid('fact.result', 'incomplete evidence')
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

function decideDeclarationChange(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'change' }>,
  reads: DecideReads,
): Decision {
  const { declaration, expected } = command.input
  if (expected !== undefined && expected !== snapshot.revision)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  if (declaration.kind === 'permission-assignment')
    return decidePermissionAssignment({
      snapshot,
      change: declaration,
      operation: command.input.operation,
      commandDigest: commandDigest(command),
      basis: reads.permissionChange,
      source: commandEvidence(command.input.operation, 'change'),
    })
  if (declaration.kind === 'authorization-expression')
    return decideAuthorization(command, declaration)
  return decideChange(snapshot, command)
}

// Session keeps the person's expression and reduces it; whether it counts is Authorization's to say.
function decideAuthorization(
  command: Extract<SessionCommand, { kind: 'change' }>,
  declaration: Extract<DeclarationChange, { kind: 'authorization-expression' }>,
): Decision {
  const missing = incompleteAuthorization(declaration.expression)
  if (missing !== null) return invalid(`declaration.expression.${missing}`, 'incomplete expression')
  if (!completeEvidence(declaration.authorization))
    return invalid('declaration.authorization', 'incomplete evidence')
  const entry = {
    kind: 'session.authorization-expressed',
    expression: declaration.expression,
    authority: declaration.authorization,
  } as const
  return entries([
    encodeEntry(entry, sessionOrigin(commandEvidence(command.input.operation, 'change'))),
  ])
}

// A mode change names the permission revision it was read at; the commit checks it in the same transaction.
function modeRevisionRefusal(
  snapshot: WorkSnapshot,
  change: Extract<DeclarationChange, { kind: 'permission-mode' }>,
): Decision | null {
  return change.expectedRevision === snapshot.permissions.revision
    ? null
    : { kind: 'rejected', failure: { kind: 'changed', revision: snapshot.revision } }
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
  const moved =
    declaration.kind === 'permission-mode' ? modeRevisionRefusal(snapshot, declaration) : null
  if (moved !== null) return moved
  if (declaration.kind === 'model') {
    if (!declaration.name) return invalid('declaration.name', 'empty model selection')
    if (!validSelectionEffort(declaration.reasoningEffort))
      return invalid('declaration.reasoningEffort', 'invalid reasoning effort')
  }
  if (
    declaration.kind === 'environment-mode' &&
    (emptyAdoption(declaration.value) || !completeEvidence(declaration.setting))
  )
    return invalid('declaration', 'incomplete environment adoption or setting')
  if (declaration.kind === 'workspace') {
    const loading = snapshot.creation.initialization?.sources.find(
      source => source.kind === 'workspace-load',
    )
    if (
      loading !== undefined &&
      snapshot.tasks.some(
        task =>
          task.kind === 'initialization' &&
          task.owner === loading.owner &&
          task.item === loading.item,
      )
    )
      return invalid('declaration.value', 'the original workspace-load item is not ready')
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

/** A reload that names no run records what the next run adopts; it starts nothing. */
function decideIdleReload(
  snapshot: WorkSnapshot,
  input: Extract<SessionCommand, { kind: 'reload' }>['input'],
): Decision {
  if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (snapshot.frozen !== null) return rejected({ kind: 'frozen', verdict: snapshot.frozen })
  if (snapshot.run.kind === 'active') return rejected({ kind: 'run-active' })
  if (!expectedHolds(snapshot, 'reload', input.expected))
    return rejected({ kind: 'changed', revision: expectedRevision(snapshot, 'reload') })
  const { candidate } = input
  if (emptyAdoption(candidate) || candidate.name !== snapshot.definition.adopted.name)
    return invalid('candidate', 'a reload must preserve the definition identity')
  const source = commandEvidence(input.operation, 'reload')
  const current = snapshot.definition.adopted
  return adoptionEntries(snapshot, input.residentAdoption, candidate, current, source)
}

function decideAttempt(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'claim' | 'reload' | 'release' }>,
): Decision {
  if (command.kind === 'reload' && command.input.run === null)
    return decideIdleReload(snapshot, command.input)
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
  const refused =
    command.kind === 'reload'
      ? reloadRefusal(snapshot, snapshot.run.run, command.input.expected)
      : null
  if (refused !== null) return rejected(refused)
  if (command.kind === 'claim' && !expectedHolds(snapshot, 'claim', command.input.expected))
    return rejected(
      snapshot.run.advance !== null
        ? { kind: 'stale-advance', current: snapshot.run.advance }
        : { kind: 'changed', revision: expectedRevision(snapshot, 'claim') },
    )
  const source = command.kind === 'claim' ? command.input.continuity : command.input.handover
  const { instance } = command.input
  if (!source || !completeEvidence(source) || instance?.owner !== 'agent' || !instance.id)
    return invalid('instance', 'incomplete instance or handover')
  const out: EncodedEntry[] = []
  if (command.kind === 'reload') {
    if (
      emptyAdoption(command.input.candidate) ||
      command.input.candidate.name !== snapshot.definition.adopted.name
    )
      return invalid('candidate', 'a reload must preserve the definition identity')
    const adopted = adoptionEntries(
      snapshot,
      command.input.residentAdoption,
      command.input.candidate,
      snapshot.run.adoption,
      source,
    )
    if (adopted.kind !== 'entries') return adopted
    out.push(...adopted.entries)
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
        instance,
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
  if (input.value.kind === 'compaction')
    return decideCompactionCommit(snapshot, command, reads, requiredWorkEntries(snapshot))
  if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (input.expected !== snapshot.revision)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  if (input.value.kind === 'model-projection')
    return decideModelProjection(snapshot, command, reads, source)
  if (input.value.message.role !== 'system_reminder')
    return invalid('value.message', 'not a context reminder')
  return entries([
    encodeEntry(
      {
        kind: 'message.system_reminder',
        ...(input.value.provenance === undefined ? {} : { provenance: input.value.provenance }),
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

/** A replay is compared by what its sender brought: the facts an intake adds are not part of it. */
function asBrought(input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input }
  for (const key of ['value', 'urgent']) {
    const routed = out[key] as Partial<Extract<RoutedInput, { kind: 'ordinary' }>> | undefined
    if (routed?.kind === 'ordinary' && Array.isArray(routed.message?.blocks))
      out[key] = { ...routed, message: originalContent(routed.message) }
  }
  return out
}

export function commandDigest(command: SessionCommand): string {
  const { operation: _operation, ...given } = command.input as Record<string, unknown> & {
    operation: SessionOperationId
  }
  const rest = asBrought(given)
  const input =
    command.kind === 'create'
      ? {
          ...rest,
          tenant: tenantText(command.input.tenant),
          creation: creationInput(command.input.creation),
        }
      : command.kind === 'completeInitialization'
        ? { ...rest, tenant: tenantText(command.input.tenant) }
        : rest
  return digestOf({
    kind: command.kind,
    input:
      command.kind === 'create' || command.kind === 'completeInitialization'
        ? canonicalInitializationValue(input)
        : input,
  })
}

function recallOperation(
  previous: WorkSnapshot | null,
  command: SessionCommand,
  guards: readonly GuardCommand[],
  record: OperationRecord | null,
): Decision | null {
  let digest = ''
  if (record !== null) {
    try {
      digest = commandDigest(command)
    } catch (error) {
      if (error instanceof TypeError || error instanceof InitializationInvalid)
        return invalid('command', error.message)
      throw error
    }
  }
  const recall = resolveOperation(record, command.input.operation, digest)
  if (recall.kind === 'recovered') {
    if (command.kind === 'create' || command.kind === 'completeInitialization') {
      const refused = validateInitializationRecall(previous, command, guards)
      if (refused !== null) return refused
    }
    return { kind: 'recovered', receipt: recall.receipt }
  }
  if (recall.kind === 'conflict') return rejected({ kind: 'conflict', operation: recall.operation })
  return null
}

function decideInterrupt(
  previous: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'interrupt' }>,
  reads: DecideReads,
  limits: SessionIntakeLimits,
): Decision {
  if (
    command.input.urgent.message.blocks.length === 0 ||
    previous.pending.includes(command.input.urgent.input)
  )
    return invalid('urgent', 'empty or duplicate input')
  const pending = pendingIntakeCount(previous)
  const admitted = admitInput(command.input.urgent, pending, { reads, limits }, 'urgent')
  if ('kind' in admitted) return admitted
  const { source } = admitted
  const { urgent, decision, operation } = command.input
  const run = command.input.run ?? (previous.run.kind === 'active' ? previous.run.run : null)
  if (run === null) {
    const { tenant, session } = command.input
    return decideAccept(
      previous,
      { kind: 'accept', input: { tenant, session, operation, value: urgent } },
      limits,
      reads,
    )
  }
  const control = decideControl(
    previous,
    { kind: 'interrupt', run, urgent, decision },
    operation,
    reads,
  )
  return control.kind === 'entries'
    ? entries([...acceptedOrdinary(urgent, 'current-run', run, source), ...control.entries])
    : control
}

function decideFreeze(
  previous: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'freeze' }>,
  reads: DecideReads,
): Decision {
  if (previous.frozen !== null)
    return reads.frozenReceipt === undefined
      ? rejected({
          kind: 'unavailable',
          owner: 'session-history',
          diagnostic: 'the original freeze receipt is required for state recall',
        })
      : { kind: 'recovered', receipt: reads.frozenReceipt }
  return decideManagement(previous, command, reads)
}

function decideCommand(
  previous: WorkSnapshot | null,
  command: SessionCommand,
  guards: readonly GuardCommand[],
  record: OperationRecord | null,
  reads: DecideReads,
): Decision {
  if (
    previous !== null &&
    (previous.session !== command.input.session ||
      !tenantEquals(previous.tenant, command.input.tenant))
  )
    return rejected({ kind: 'denied', action: command.kind })
  const recalled = recallOperation(previous, command, guards, record)
  if (recalled !== null) return recalled
  const limits = reads.intakeLimits ?? DEFAULT_SESSION_INTAKE_LIMITS
  if (command.kind === 'create') return decideCreate(previous, command, guards, limits, reads)
  if (previous === null) return rejected({ kind: 'denied', action: command.kind })
  switch (command.kind) {
    case 'addTodo':
    case 'removeTodo':
    case 'markTodoComplete':
      return decideTodos(previous, command, commandEvidence(command.input.operation, command.kind))
    case 'completeInitialization':
      return decideInitializationComplete(previous, command, guards, reads)
    case 'accept':
      return decideAccept(previous, command, limits, reads)
    case 'startRun':
      return decideStartRun(previous, command)
    case 'recordMessage':
      return decideRecordMessage(previous, command)
    case 'receive':
      return decideReceive(previous, command, reads.history)
    case 'finishRun':
      return decideFinishRun(previous, command)
    case 'change':
      return decideDeclarationChange(previous, command, reads)
    case 'claim':
    case 'reload':
    case 'release':
      return decideAttempt(previous, command)
    case 'bindExternalCall':
    case 'preserveResult':
    case 'completeConsumption':
    case 'completeExternalConsumption':
      return decideResults(previous, command, reads.history)
    case 'commitDerived':
      return decideDerived(previous, command, reads)
    case 'interrupt':
      return decideInterrupt(previous, command, reads, limits)
    case 'cancelRun':
    case 'stopCall':
    case 'retryRun':
      return decideNamedControl(previous, command, reads)
    case 'freeze':
      return decideFreeze(previous, command, reads)
    case 'control':
    case 'setResident':
    case 'recordCommand':
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

export function decide(
  previous: WorkSnapshot | null,
  command: SessionCommand,
  guards: readonly GuardCommand[],
  record: OperationRecord | null,
  reads: DecideReads,
): Decision {
  try {
    const decision = closeControlFailure(
      decideCommand(previous, command, guards, record, readsWithTerms(reads, guards)),
      command,
    )
    if (decision.kind === 'entries' && previous !== null && decision.entries.length > 0) {
      const decoded = decodeEntries(
        decision.entries,
        previous.initialization?.initialAdoption ?? null,
      ).map(value => {
        if (!('ok' in value)) throw new Error('invalid locally encoded entry')
        return value.ok
      })
      validateFrontierBatch(previous, decoded, reads.history)
    }
    return decision
  } catch (error) {
    if (error instanceof SessionValidationFailure) return rejected(error.failure)
    if (error instanceof CallConflict)
      return rejected({ kind: 'conflict', operation: command.input.operation })
    throw error
  }
}
