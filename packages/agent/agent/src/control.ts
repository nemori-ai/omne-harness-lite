import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
  type AgentJournal,
  type AgentOperationId,
  type ControlRecord,
  type ControlStage,
  type ExecutionSnapshot,
  type Failure,
  type PendingCall,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeModelOperationId,
  resolveModelInvocationRef,
  type ModelInvocationRef,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type {
  ControlProgress,
  ToolInvocationRef,
  ToolOperationRef,
} from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from './construction.ts'
import { json } from './receiving-values.ts'
import { canonical } from './canonical.ts'
import { attemptWrite, originalJournal, type OriginalWrite } from './loop/original-write.ts'

type ModelControl = Pick<ControlRecord, 'operation' | 'stages'> &
  Readonly<{
    command: Extract<ControlRecord['command'], { kind: 'interrupt-model' }>
  }>
type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'journal' | 'models' | 'materials'>

const observationSchema = {
  owner: '@omne-harness/agent',
  name: 'model-control-observation',
  revision: '1',
  digest: 'agent:model-control-observation/1',
} as const

const toolObservationSchema = {
  owner: '@omne-harness/agent',
  name: 'tool-control-observation',
  revision: '1',
  digest: 'agent:tool-control-observation/1',
} as const

export function cancellationOf(snapshot: ExecutionSnapshot): ControlRecord | undefined {
  return snapshot.controls.find(
    record =>
      record.command.kind === 'cancel' && record.stages['intent-established']?.state === 'reached',
  )
}

export function controlOperation(
  execution: AgentExecutionId,
  control: AgentOperationId,
  stage: string,
): AgentOperationId {
  const key = createHash('sha256')
    .update(JSON.stringify([execution, control, stage]))
    .digest('hex')
  const decoded = decodeAgentOperationId(`control/${key}`)
  if ('failure' in decoded) throw new Error('invalid derived Agent control operation')
  return decoded.ok
}

export async function establishCancellation<P>(
  journal: Ports<P>['journal'],
  access: Access<P>,
  execution: AgentExecutionId,
  record: ControlRecord,
): Promise<Outcome<void, Failure>> {
  if (record.command.kind !== 'cancel') return succeed(undefined)
  for (const stage of ['intent-established', 'qualification-revoked'] as const) {
    if (record.stages[stage]?.state === 'reached') continue
    const saved = await journal.recordControl({
      ...access,
      execution,
      operation: controlOperation(execution, record.operation, stage),
      target: record.operation,
      stage,
      state: 'reached',
      source: record.stages.accepted.source,
    })
    if ('failure' in saved) return saved
  }
  return succeed(undefined)
}

type ObservedStage = Exclude<ControlStage, 'accepted' | 'qualification-revoked' | 'duty-released'>
type StagePorts<P> = Pick<AgentDependencies<P, ContentBlock>, 'journal' | 'materials'>

/** What one producer control saves with each observed stage, and where. */
type StageRecording = Readonly<{
  /** The recording operation, which is also the identity of the observation material. */
  identity: string
  purpose: 'model-control' | 'tool-control'
  schema: typeof observationSchema | typeof toolObservationSchema
  record: Pick<ControlRecord, 'operation' | 'command'>
  /** The original call reference the control acts on. */
  reference: ModelInvocationRef | ToolInvocationRef
  /** The producer control operation; for a Tool control it is also attached to the record. */
  operation: ModelOperationId | ToolOperationRef | null
  toolOperation?: ToolOperationRef
}>

/**
 * Saves one observed stage of a Model or Tool control: the observation material first, then the
 * stage fact on the control's own record, both under the derived identity.
 */
async function saveControlStage<P>(
  ports: StagePorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  recording: StageRecording,
  stage: ObservedStage,
  state: 'reached' | 'unresolved',
  observation: unknown,
): Promise<Outcome<void, Failure>> {
  const { identity, record, toolOperation } = recording
  const stored = await ports.materials.preserve({
    ...access,
    execution,
    identity,
    consumer: {
      owner: '@omne-harness/agent',
      work: execution,
      position: record.operation,
      purpose: recording.purpose,
    },
    value: {
      kind: 'facts' as const,
      schema: recording.schema,
      value: json({
        execution,
        control: record.operation,
        command: record.command,
        reference: recording.reference,
        operation: recording.operation,
        observation,
      }),
    },
  })
  if ('failure' in stored) return stored
  const operation = decodeAgentOperationId(identity)
  if ('failure' in operation) throw new Error('invalid derived control recording operation')
  const saved = await ports.journal.recordControl({
    ...access,
    execution,
    operation: operation.ok,
    target: record.operation,
    stage,
    state,
    source: stored.ok,
    ...(toolOperation === undefined ? {} : { toolOperation }),
  })
  return 'failure' in saved ? saved : succeed(undefined)
}

/** The Model failures of a control request that do not say whether the request was taken. */
const UNKNOWN_MODEL_ANSWERS: ReadonlySet<string> = new Set(['unavailable', 'commit-unknown'])

type ModelPending = Extract<PendingCall, { kind: 'model' }>
type ModelControlScope<P> = Readonly<{
  ports: Ports<P>
  access: Access<P>
  execution: AgentExecutionId
  record: ModelControl
  prefix: string
  operation: ModelOperationId
  reference: ModelInvocationRef
}>

/** The saved Model call that the control names, by kind and then by call. */
async function modelControlTarget<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  record: ModelControl,
): Promise<Outcome<ModelPending, Failure>> {
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  const pending = [
    ...loaded.ok.checkpoint.calls,
    ...loaded.ok.effects.map(effect => effect.pending),
  ].find(call => {
    if (call.kind !== 'model') return false
    const resolved = resolveModelInvocationRef(call.reference, access.tenant)
    return 'ok' in resolved && resolved.ok.call === record.command.call
  })
  if (pending?.kind !== 'model')
    return fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: 'original model control reference is unavailable',
    })
  return succeed(pending)
}

/**
 * Saves one observed stage of a Model control. `variant` keeps a second observation of the same
 * stage and state apart, such as the producer's explicit refusal after the request was prepared.
 */
async function saveModelStage<P>(
  scope: ModelControlScope<P>,
  stage: ObservedStage,
  state: 'reached' | 'unresolved',
  observation: unknown,
  variant = '',
): Promise<Outcome<void, Failure>> {
  const { ports, access, execution, record, prefix } = scope
  return saveControlStage(
    ports,
    access,
    execution,
    {
      identity: `control/${prefix}/${stage}/${state}${variant}`,
      purpose: 'model-control',
      schema: observationSchema,
      record,
      reference: scope.reference,
      operation: scope.operation,
    },
    stage,
    state,
    observation,
  )
}

/**
 * What the Model reports of the call: a settlement is the physical stop, a requested control is
 * the producer's confirmation. `null` when nothing more is proven and a request may be sent.
 */
async function observedModelStop<P>(
  scope: ModelControlScope<P>,
): Promise<Outcome<void, Failure> | null> {
  const { ports, access, record } = scope
  const found = await ports.models.calls.inspect({ ...access, reference: scope.reference })
  if ('failure' in found || found.ok.kind !== 'found') return succeed(undefined)
  if (found.ok.state.phase === 'settled')
    return saveModelStage(scope, 'physically-stopped', 'reached', found.ok.state.settlement)
  if (record.stages['producer-confirmed']?.state === 'reached') return succeed(undefined)
  if (found.ok.state.control.kind === 'requested')
    return saveModelStage(scope, 'producer-confirmed', 'reached', found.ok.state.control)
  if (record.stages['producer-confirmed']?.state === 'unresolved') return succeed(undefined)
  return null
}

/** A control retry only observes a request whose original sending outcome is unresolved. */
export async function advanceModelControl<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  record: ModelControl,
): Promise<Outcome<void, Failure>> {
  const pending = await modelControlTarget(ports, access, execution, record)
  if ('failure' in pending) return pending
  const prefix = createHash('sha256')
    .update(JSON.stringify([execution, record.operation]))
    .digest('hex')
  const operation = decodeModelOperationId(`mop_control_${prefix}`)
  if ('failure' in operation) throw new Error('invalid derived model control operation')
  const scope: ModelControlScope<P> = {
    ports,
    access,
    execution,
    record,
    prefix,
    operation: operation.ok,
    reference: pending.ok.reference,
  }
  if (record.stages['intent-established'] === undefined) {
    const saved = await saveModelStage(
      scope,
      'intent-established',
      'reached',
      record.stages.accepted,
    )
    if ('failure' in saved) return saved
  }
  if (record.stages['physically-stopped']?.state === 'reached') return succeed(undefined)
  const observed = await observedModelStop(scope)
  if (observed !== null) return observed
  const prepared = await saveModelStage(scope, 'producer-confirmed', 'unresolved', {
    kind: 'requesting',
  })
  if ('failure' in prepared) return prepared
  const requested = await ports.models.calls.cancel({
    ...access,
    call: record.command.call,
    operation: operation.ok,
  })
  if ('ok' in requested)
    return requested.ok.kind === 'requested'
      ? saveModelStage(scope, 'producer-confirmed', 'reached', requested.ok)
      : succeed(undefined)
  // An unavailable or unknown answer proves nothing more. An explicit refusal is kept with the
  // unresolved confirmation, so it is not read as an answer that never came.
  if (UNKNOWN_MODEL_ANSWERS.has(requested.failure.kind)) return succeed(undefined)
  return saveModelStage(
    scope,
    'producer-confirmed',
    'unresolved',
    { kind: 'refused', failure: requested.failure },
    '/refused',
  )
}

type ToolControlRecord = Pick<ControlRecord, 'operation' | 'stages'> &
  Readonly<{
    command: Extract<ControlRecord['command'], { kind: 'interrupt-tool' | 'background-tool' }>
    toolInvocation: ToolInvocationRef
    toolOperation: ToolOperationRef | null
  }>
type ToolPorts<P> = Pick<AgentDependencies<P, ContentBlock>, 'journal' | 'tools' | 'materials'>

/** The control record of a Tool call, narrowed when its command is a Tool control. */
export function toolControlOf(record: ControlRecord): ToolControlRecord | undefined {
  return record.command.kind === 'interrupt-tool' || record.command.kind === 'background-tool'
    ? (record as ToolControlRecord)
    : undefined
}

/**
 * Advances one accepted Tool control by its own record: the original call snapshot `toolInvocation`
 * is the only target, so no other call of the execution is touched. One Agent control makes at
 * most one Tool control attempt. `producer-confirmed` is saved as unresolved before the attempt;
 * an answer lost before its operation reference was saved stays unresolved and is never sent
 * again. A saved reference is only queried. A request is never read as a physical stop.
 */
export async function advanceToolControl<P>(
  ports: ToolPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  record: ToolControlRecord,
): Promise<Outcome<void, Failure>> {
  const prefix = createHash('sha256')
    .update(JSON.stringify([execution, record.operation]))
    .digest('hex')

  async function save(
    stage: ObservedStage,
    state: 'reached' | 'unresolved',
    observation: unknown,
    toolOperation: ToolOperationRef | null,
    variant = '',
  ): Promise<Outcome<void, Failure>> {
    const attachment = toolOperation === null ? '' : '/reference'
    return saveControlStage(
      ports,
      access,
      execution,
      {
        identity: `control/${prefix}/${stage}/${state}${attachment}${variant}`,
        purpose: 'tool-control',
        schema: toolObservationSchema,
        record,
        reference: record.toolInvocation,
        operation: toolOperation,
        ...(toolOperation === null ? {} : { toolOperation }),
      },
      stage,
      state,
      observation,
    )
  }

  /** What a committed control receipt proves: acceptance, or also the actual stop of the call. */
  async function receipt(
    operation: ToolOperationRef,
    progress: ControlProgress,
    observation: unknown,
  ): Promise<Outcome<void, Failure>> {
    if (
      progress.kind === 'accepted' ||
      progress.kind === 'stopped' ||
      progress.kind === 'already-ended'
    ) {
      const confirmed = await save('producer-confirmed', 'reached', observation, operation)
      if ('failure' in confirmed) return confirmed
      if (progress.kind === 'accepted') return succeed(undefined)
      return save('physically-stopped', 'reached', observation, operation)
    }
    // Pending, unknown, rejected out of reach or a changed relation: the reference is kept and
    // the producer has not confirmed this request.
    if (record.toolOperation !== null) return succeed(undefined)
    return save('producer-confirmed', 'unresolved', observation, operation)
  }

  /**
   * The attempt was made. Without its reference nothing can find it again (SPEC "控制接受与迟到
   * 引用"); with it, the original operation is queried and never repeated.
   */
  async function reconcileAttempt(): Promise<Outcome<void, Failure>> {
    const known = record.toolOperation
    if (known === null) return succeed(undefined)
    const queried = await ports.tools.queries.queryOperation({ ...access, operation: known })
    if ('failure' in queried || queried.ok.kind !== 'committed') return succeed(undefined)
    return save('producer-confirmed', 'reached', queried.ok, known)
  }

  if (record.stages['intent-established'] === undefined) {
    const saved = await save('intent-established', 'reached', record.stages.accepted, null)
    if ('failure' in saved) return saved
  }
  if (record.stages['physically-stopped']?.state === 'reached') return succeed(undefined)
  if (record.stages['producer-confirmed']?.state === 'reached') return succeed(undefined)
  if (record.stages['producer-confirmed']?.state === 'unresolved') return reconcileAttempt()
  const requesting = await save('producer-confirmed', 'unresolved', { kind: 'requesting' }, null)
  if ('failure' in requesting) return requesting
  const sent = await ports.tools.commands.control({
    ...access,
    reference: record.toolInvocation,
    intent: record.command.kind === 'background-tool' ? { kind: 'background' } : { kind: 'stop' },
  })
  // An explicit refusal is kept with the unresolved confirmation, apart from an unknown answer.
  if (sent.kind === 'rejected')
    return save(
      'producer-confirmed',
      'unresolved',
      { kind: 'refused', failure: sent.failure },
      null,
      '/refused',
    )
  if (sent.kind === 'commit-unknown')
    return save('producer-confirmed', 'unresolved', { kind: 'commit-unknown' }, sent.operation)
  return receipt(sent.operation, sent.receipt.progress, sent.receipt)
}

type ControlPorts<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  'journal' | 'models' | 'tools' | 'materials'
>

/**
 * Advances one accepted control by its saved record: a Model or Tool interrupt acts on its own
 * original call only, a cancellation establishes its intent and revokes the advance. Every step is
 * saved under an operation derived from the control, so a retry of the same control operation
 * recognizes what is already saved and repeats nothing. A failure is returned unchanged; the
 * caller retries with the same control operation.
 */
export async function advanceAcceptedControl<P>(
  ports: ControlPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  operation: AgentOperationId,
): Promise<Outcome<void, Failure>> {
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  const control = loaded.ok.controls.find(record => record.operation === operation)
  if (control === undefined) return succeed(undefined)
  if (control.command.kind === 'interrupt-model')
    return advanceModelControl(ports, access, execution, { ...control, command: control.command })
  const tool = toolControlOf(control)
  if (tool !== undefined) return advanceToolControl(ports, access, execution, tool)
  return establishCancellation(ports.journal, access, execution, control)
}

type ControlAttempt = {
  readonly request: string | null
  readonly pending: Map<AgentOperationId, () => Promise<Outcome<void, Failure>>>
  active: boolean
}

const controlAttempts = new WeakMap<object, Map<string, ControlAttempt>>()

async function withControlWrites<P, T>(
  ports: ControlPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  operation: AgentOperationId,
  request: string | null,
  run: (journal: AgentJournal<P>) => Promise<Outcome<T, Failure>>,
): Promise<Outcome<T, Failure>> {
  const attempts = controlAttempts.get(ports.journal) ?? new Map<string, ControlAttempt>()
  controlAttempts.set(ports.journal, attempts)
  const key = canonical([access.tenant, execution, operation])
  const attempt = attempts.get(key) ?? {
    request,
    pending: new Map<AgentOperationId, () => Promise<Outcome<void, Failure>>>(),
    active: false,
  }
  if (request !== null && attempt.request !== null && request !== attempt.request)
    return fail({ kind: 'conflict', operation })
  if (attempt.active) return fail({ kind: 'busy' })
  attempts.set(key, attempt)
  attempt.active = true
  const journal = controlJournal(ports.journal, attempt.pending)
  try {
    for (const [operation, recover] of attempt.pending) {
      const found = await recover()
      if ('failure' in found) return found
      attempt.pending.delete(operation)
    }
    return await run(journal)
  } finally {
    attempt.active = false
    if (attempt.pending.size === 0) attempts.delete(key)
  }
}

function controlJournal<P>(
  journal: AgentJournal<P>,
  pending: ControlAttempt['pending'],
): AgentJournal<P> {
  return originalJournal(journal, async (original, invoke) => {
    if (original.method !== 'control' && original.method !== 'recordControl') return invoke()
    const operation = original.input.operation
    pending.set(operation, () => recognizeControlWrite(journal, original))
    const result = await attemptWrite(original, invoke)
    if ('ok' in result || result.failure.kind !== 'commit-unknown') pending.delete(operation)
    return result
  })
}

async function recognizeControlWrite<P>(
  journal: AgentJournal<P>,
  original: Extract<OriginalWrite<P>, { method: 'control' | 'recordControl' }>,
): Promise<Outcome<void, Failure>> {
  const { operation } = original.input
  try {
    const found = await journal.query(original.input)
    if ('failure' in found) return found
    switch (found.ok.kind) {
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation })
      case 'excluded':
        return fail({ kind: 'conflict', operation })
      case 'rejected':
        return fail(found.ok.failure)
      case 'committed':
        return succeed(undefined)
    }
  } catch {
    return fail({ kind: 'commit-unknown', operation })
  }
}

export async function advanceControl<P>(
  ports: ControlPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  operation: AgentOperationId,
): Promise<Outcome<void, Failure>> {
  return withControlWrites(ports, access, execution, operation, null, journal =>
    advanceAcceptedControl({ ...ports, journal }, access, execution, operation),
  )
}

/** Public control writes are independent of the execution driver's pending write. */
export function createControlWriter<P>(ports: ControlPorts<P>) {
  return (input: Parameters<AgentJournal<P>['control']>[0]) =>
    withControlWrites(
      ports,
      input,
      input.execution,
      input.operation,
      canonical(input.command),
      async journal => {
        const accepted = await journal.control(input)
        if ('failure' in accepted) return accepted
        const advanced = await advanceAcceptedControl(
          { ...ports, journal },
          input,
          input.execution,
          input.operation,
        )
        return 'failure' in advanced ? advanced : accepted
      },
    )
}
