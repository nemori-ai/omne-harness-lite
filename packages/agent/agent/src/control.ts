import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
  type AgentJournal,
  type AcceptedInput,
  type AgentOperationId,
  type CommandReceipt,
  type ControlRecord,
  type ControlStage,
  type ExecutionControl,
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
import {
  resolveToolInvocationRef,
  type ControlProgress,
  type ToolControl,
  type ToolInvocationRef,
  type ToolOperationRef,
} from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from './construction.ts'
import { json } from './receiving-values.ts'
import { canonical } from './canonical.ts'
import { attemptWrite, originalJournal, type OriginalWrite } from './loop/original-write.ts'

type ModelControl = Extract<ControlRecord, { command: { kind: 'interrupt-model' } }>
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

type StageRecording = Readonly<{
  identity: string
  purpose: 'model-control' | 'tool-control'
  schema: typeof observationSchema | typeof toolObservationSchema
  record: Pick<ControlRecord, 'operation' | 'command'>
  reference: ModelInvocationRef | ToolInvocationRef
  operation: ModelOperationId | ToolOperationRef | null
  toolOperation?: ToolOperationRef
}>

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

const UNKNOWN_MODEL_ANSWERS: ReadonlySet<string> = new Set(['unavailable', 'commit-unknown'])

type ModelControlScope<P> = Readonly<{
  ports: Ports<P>
  access: Access<P>
  execution: AgentExecutionId
  record: ModelControl
  prefix: string
  operation: ModelOperationId
  reference: ModelInvocationRef
}>

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

export async function advanceModelControl<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  record: ModelControl,
): Promise<Outcome<void, Failure>> {
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
    reference: record.modelInvocation,
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
  if (UNKNOWN_MODEL_ANSWERS.has(requested.failure.kind)) return succeed(undefined)
  return saveModelStage(
    scope,
    'producer-confirmed',
    'unresolved',
    { kind: 'refused', failure: requested.failure },
    '/refused',
  )
}

type ToolCommand = Extract<ExecutionControl, { kind: `${string}-tool` }>
type ToolControlRecord = Pick<ControlRecord, 'operation' | 'stages'> &
  Readonly<{
    command: ToolCommand
    toolInvocation: ToolInvocationRef
    toolOperation: ToolOperationRef | null
  }>
type ToolPorts<P> = Pick<AgentDependencies<P, ContentBlock>, 'journal' | 'tools' | 'materials'>

// The one Tool intent each Agent Tool control asks for.
const TOOL_INTENTS: Readonly<Record<ToolCommand['kind'], ToolControl>> = {
  'interrupt-tool': { kind: 'stop' },
  'background-tool': { kind: 'background', otherwise: 'reject' },
  'release-tool': { kind: 'background', otherwise: 'withdraw' },
  'withdraw-tool': { kind: 'withdraw', reach: 'foreground-and-unadmitted' },
}

export function toolControlOf(record: ControlRecord): ToolControlRecord | undefined {
  return Object.hasOwn(TOOL_INTENTS, record.command.kind)
    ? (record as ToolControlRecord)
    : undefined
}

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
    if (record.toolOperation !== null) return succeed(undefined)
    return save('producer-confirmed', 'unresolved', observation, operation)
  }

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
    intent: TOOL_INTENTS[record.command.kind],
  })
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

export async function advanceAcceptedControl<P>(
  ports: ControlPorts<P>,
  given: Access<P>,
  execution: AgentExecutionId,
  operation: AgentOperationId,
): Promise<Outcome<void, Failure>> {
  // A writer hands its whole control request in; each port gets the access alone, so the control's
  // operation never names a material, a Tool command or a read of its own.
  const access: Access<P> = { principal: given.principal, tenant: given.tenant }
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  const control = loaded.ok.controls.find(record => record.operation === operation)
  if (control === undefined) return succeed(undefined)
  if (control.modelInvocation !== undefined)
    return advanceModelControl(ports, access, execution, control)
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

export function createControlWriter<P>(ports: ControlPorts<P>): AgentJournal<P>['control'] {
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

function releaseCommand<P>(
  access: Access<P>,
  pending: PendingCall,
  reason: CommandReceipt['evidence'],
): Outcome<ExecutionControl | null, Failure> {
  const unresolved = fail({
    kind: 'invalid' as const,
    field: 'checkpoint.calls',
    reason: 'a pending call reference does not resolve',
  })
  if (pending.kind === 'model') {
    const parts = resolveModelInvocationRef(pending.reference, access.tenant)
    return 'ok' in parts
      ? succeed({ kind: 'interrupt-model', call: parts.ok.call, reason })
      : unresolved
  }
  if (pending.association !== 'associated') return succeed(null)
  const parts = resolveToolInvocationRef(pending.reference, access.tenant)
  return 'ok' in parts ? succeed({ kind: 'release-tool', call: parts.ok.call, reason }) : unresolved
}

// An urgent input releases each call the current step waits on and does not wait for a physical
// stop. The operations derive from the submit, so a resent submit recognizes what it wrote.
export async function releaseForeground<P>(
  ports: ControlPorts<P>,
  input: Access<P> & Readonly<{ execution: AgentExecutionId; value: AcceptedInput }>,
  answer: Outcome<CommandReceipt, Failure>,
): Promise<Outcome<CommandReceipt, Failure>> {
  if ('failure' in answer || input.value.priority !== 'urgent') return answer
  const { execution } = input
  const access = { principal: input.principal, tenant: input.tenant }
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  if (loaded.ok.state.kind === 'ended' || cancellationOf(loaded.ok) !== undefined) return answer
  const write = createControlWriter(ports)
  for (const pending of loaded.ok.checkpoint.calls) {
    const command = releaseCommand(access, pending, answer.ok.evidence)
    if ('failure' in command) return command
    if (command.ok === null) continue
    const operation = controlOperation(
      execution,
      answer.ok.operation,
      `release/${pending.reference}`,
    )
    const written = await write({ ...access, execution, operation, command: command.ok })
    // A call that settled or an execution that ended since the read has nothing to release.
    if ('failure' in written && !['invalid', 'terminal'].includes(written.failure.kind))
      return written
  }
  return answer
}
