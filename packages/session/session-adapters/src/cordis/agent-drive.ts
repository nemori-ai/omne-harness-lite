import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  judgeEvidence,
  type AcceptedInput,
  type AgentExecutionHandle,
  type AgentExecutionId,
  type AgentInstanceId,
  type AgentOperationId,
  type AgentRuntime,
  type CommandReceipt,
  type ExecutionControl,
  type ExecutionSnapshot,
  type Failure,
  type Reply,
} from '@omne-harness/agent-contract'
import {
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentInstancesKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  AgentDrivePort,
  Control,
  DriveFailure,
  DriveReceipt,
  DriveTarget,
  DurableEvidence,
  ExecutionStatus,
  InputId,
  SessionFailure,
  SessionId,
} from '@omne-harness/session-contract'
import { AgentDrivePortService, sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { resolveToolInvocationRef, type ToolCallId } from '@omne-harness/tool-contract'
import { decodeSessionSlotRef } from '../slot-ref.ts'
import { announcePublished } from './published-queue.ts'

export type SessionCoordinatorPrincipalFailure = Extract<
  SessionFailure,
  { kind: 'denied' | 'unavailable' | 'quarantined' }
>

export type SessionAgentDriveInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
}>

type Drive<T> = Outcome<T, DriveFailure>
type Mutation = Readonly<{
  principal: unknown
  tenant: TenantId
  execution: AgentExecutionId
  operation: AgentOperationId
}>
type Kept = Readonly<{
  tenant: string
  instance: AgentInstanceId
  handle: AgentExecutionHandle<unknown>
}>
type Placed = Readonly<{ instance: AgentInstanceId; runtime: AgentRuntime<unknown> }>
type Slot = Readonly<{ scope: DurableEvidence; definition: Adoption }>

const LOGGER = 'session-adapters/agent-drive'

const unavailable = (diagnostic: string): Drive<never> => fail({ kind: 'unavailable', diagnostic })

function digestOf(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function sessionScopeEvidence(tenant: string, session: SessionId): DurableEvidence {
  return { owner: 'session', record: session, revision: '1', digest: digestOf([tenant, session]) }
}

function sessionBasis(tenant: string, session: SessionId, operation: string): DurableEvidence {
  return {
    owner: 'session',
    record: operation,
    revision: '1',
    digest: digestOf([tenant, session, operation]),
  }
}

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function admissionRecord(failure: Extract<Failure, { kind: 'invalid' }>): DurableEvidence | null {
  if (failure.field !== 'value') return null
  const rejection = judgeEvidence(Reflect.get(failure, 'rejection'))
  return 'ok' in rejection ? rejection.ok : null
}

function receiptOf(receipt: CommandReceipt): DriveReceipt {
  return { revision: receipt.revision, evidence: receipt.evidence }
}

type Unresolved = Readonly<{ kind: 'malformed'; diagnostic: string }>

const unresolved = (
  family: 'Model' | 'Tool',
  failure: Readonly<{ kind: string }>,
): Outcome<never, Unresolved> =>
  fail({
    kind: 'malformed',
    diagnostic: `the ${family} call is not a ${family} invocation reference (${failure.kind})`,
  })

function toolCallOf(reference: string, tenant: TenantId): Outcome<ToolCallId, Unresolved> {
  const parts = resolveToolInvocationRef(reference, tenant)
  return 'ok' in parts ? succeed(parts.ok.call) : unresolved('Tool', parts.failure)
}

function controlOf(
  intent: Control,
  tenant: TenantId,
  reason: DurableEvidence,
): Outcome<ExecutionControl | null, Unresolved> {
  switch (intent.kind) {
    case 'stop-call': {
      const { producer } = intent
      if (producer.kind === 'model') {
        const parts = resolveModelInvocationRef(producer.call, tenant)
        return 'ok' in parts
          ? succeed({ kind: 'interrupt-model', call: parts.ok.call, reason })
          : unresolved('Model', parts.failure)
      }
      const call = toolCallOf(producer.call, tenant)
      return 'ok' in call ? succeed({ kind: 'interrupt-tool', call: call.ok, reason }) : call
    }
    case 'background-tool': {
      const call = toolCallOf(intent.producer.call, tenant)
      return 'ok' in call ? succeed({ kind: 'background-tool', call: call.ok, reason }) : call
    }
    case 'cancel-run':
    case 'archive':
      return succeed({ kind: 'cancel', reason })
    case 'unarchive':
    case 'retry-run':
      return succeed(null)
    default: {
      const unknown: never = intent
      return fail({
        kind: 'malformed',
        diagnostic: `unknown control ${describe((unknown as { kind?: unknown }).kind)}`,
      })
    }
  }
}

function statusOf(snapshot: ExecutionSnapshot, lost: DurableEvidence | null): ExecutionStatus {
  const { state } = snapshot
  if (state.kind === 'ended') {
    const { conclusion } = state
    return {
      revision: snapshot.revision,
      state: 'ended',
      attachment: null,
      lost: null,
      conclusion: {
        outcome: conclusion.kind,
        cause: conclusion.kind === 'complete' ? null : conclusion.cause,
        disposition: state.disposition,
      },
      evidence: snapshot.history,
    }
  }
  if (state.kind === 'suspended')
    return {
      revision: snapshot.revision,
      state: 'suspended',
      attachment: 'detached',
      lost: null,
      conclusion: null,
      evidence: snapshot.history,
    }
  return {
    revision: snapshot.revision,
    state: 'open',
    attachment: snapshot.executionAttachment === null ? null : 'active',
    lost: snapshot.executionAttachment === null ? null : lost,
    conclusion: null,
    evidence: snapshot.history,
  }
}

class SessionAgentDriveProvider<P> extends AgentDrivePortService {
  private readonly kept = new Map<string, Kept>()
  private readonly scope: Context
  private readonly given: SessionAgentDriveInput<P>
  private closed = false

  constructor(scope: Context, given: SessionAgentDriveInput<P>) {
    super(scope)
    this.scope = scope
    this.given = given
    scope.on('agent-cordis-contract/instance-retired', (tenant, instance) => {
      const text = this.tenantText(tenant)
      for (const [key, entry] of this.kept)
        if (entry.tenant === text && entry.instance === instance) this.kept.delete(key)
    })
    scope.effect(() => () => {
      this.closed = true
      this.kept.clear()
    })
  }

  readonly invoke: AgentDrivePort['invoke'] = input =>
    this.guarded('invoke', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation, tenant } = prepared.ok
      const slot = await this.slotOf(input, mutation.principal, tenant)
      if ('failure' in slot) return slot
      const initial = await this.accepted(input, mutation.principal, input.first, input.source)
      if ('failure' in initial) return initial
      const started = await this.onSlot('invoke', mutation, slot.ok, runtime =>
        runtime.invoke({ ...mutation, initial: initial.ok, grant: input.grant }),
      )
      if ('failure' in started) return started
      this.keep(tenant, input, started.ok)
      return this.receipt(input, mutation)
    })

  readonly submit: AgentDrivePort['submit'] = input =>
    this.guarded('submit', async () => {
      const tenant = this.tenantText(input.tenant)
      if (tenant === undefined)
        return this.defect('submit', 'the tenant was not made by the parser')
      const kept = this.kept.get(this.keyOf(tenant, input))
      if (kept === undefined) return unavailable('no execution handle for submit (NP-03)')
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation } = prepared.ok
      const priority = await this.priorityOf(input, mutation.principal, input.input)
      if ('failure' in priority) return priority
      const value = await this.accepted(
        input,
        mutation.principal,
        input.input,
        input.source,
        priority.ok,
      )
      if ('failure' in value) return value
      const answer = await kept.handle.input.submit({ ...mutation, value: value.ok })
      return 'ok' in answer
        ? succeed(receiptOf(answer.ok))
        : this.agentFailure('submit', answer.failure)
    })

  readonly resume: AgentDrivePort['resume'] = input =>
    this.guarded('resume', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation, tenant } = prepared.ok
      const slot = await this.slotOf(input, mutation.principal, tenant)
      if ('failure' in slot) return slot
      const resumed = await this.onSlot('resume', mutation, slot.ok, runtime =>
        runtime.resume({ ...mutation, recovery: input.recovery, grant: input.grant }),
      )
      if ('failure' in resumed) return resumed
      this.keep(tenant, input, resumed.ok)
      return this.receipt(input, mutation)
    })

  readonly control: AgentDrivePort['control'] = input =>
    this.guarded('control', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation, tenant } = prepared.ok
      const reason = sessionBasis(tenant, input.session, input.control)
      const command = controlOf(input.intent, input.tenant, reason)
      if ('failure' in command) return this.defect('control', command.failure.diagnostic)
      if (command.ok === null) return fail({ kind: 'unsupported' })
      const answer = await this.scope.agentExecutionControl.control({
        ...mutation,
        command: command.ok,
      })
      return 'ok' in answer
        ? succeed(receiptOf(answer.ok))
        : this.agentFailure('control', answer.failure)
    })

  readonly detach: AgentDrivePort['detach'] = input =>
    this.guarded('detach', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation, tenant } = prepared.ok
      const recovery = this.scope.agentExecutionRecovery
      const loaded = await recovery.load({
        principal: mutation.principal,
        tenant: mutation.tenant,
        execution: mutation.execution,
      })
      if ('failure' in loaded) return this.agentFailure('detach', loaded.failure)
      if (loaded.ok.state.kind === 'suspended') return succeed(loaded.ok.state.handoff)
      const authority = loaded.ok.executionAttachment
      if (authority === null) return unavailable('the execution has no attachment to hand back')
      const answer = await recovery.detach({
        ...mutation,
        authority,
        reason: sessionBasis(tenant, input.session, input.operation),
      })
      return 'ok' in answer ? succeed(answer.ok) : this.agentFailure('detach', answer.failure)
    })

  readonly recordResult: AgentDrivePort['recordResult'] = async () =>
    unavailable('recordResult has no Agent entry yet (NP-04)')

  readonly query: AgentDrivePort['query'] = input =>
    this.guarded('query', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const answer = await this.scope.agentExecutionRecovery.query(prepared.ok.mutation)
      if ('failure' in answer) return this.agentFailure('query', answer.failure)
      switch (answer.ok.kind) {
        case 'committed':
        case 'excluded':
        case 'unknown':
          return succeed(answer.ok.kind)
        case 'rejected':
          return this.defect('query', 'query answered rejected for a drive operation')
        default: {
          const unknown: never = answer.ok
          return this.defect('query', `query answered ${describe(unknown)}`)
        }
      }
    })

  readonly inspect: AgentDrivePort['inspect'] = input =>
    this.guarded('inspect', async () => {
      const tenant = this.tenantText(input.tenant)
      if (tenant === undefined)
        return this.defect('inspect', 'the tenant was not made by the parser')
      const execution = decodeAgentExecutionId(input.execution)
      if ('failure' in execution)
        return this.defect('inspect', 'the execution is not an Agent identity')
      const principal = await this.principalOf(input)
      if ('failure' in principal) return principal
      const loaded = await this.scope.agentExecutionRecovery.load({
        principal: principal.ok,
        tenant: input.tenant,
        execution: execution.ok,
      })
      if ('failure' in loaded) return this.agentFailure('inspect', loaded.failure)
      const authority = loaded.ok.executionAttachment
      const { kind } = loaded.ok.state
      if (kind === 'ended') this.wake(input.tenant, input.session, execution.ok)
      if (authority === null || kind === 'ended' || kind === 'suspended')
        return succeed(statusOf(loaded.ok, null))
      const contact = await this.scope.agentExecutionRecovery.contact({
        principal: principal.ok,
        tenant: input.tenant,
        execution: execution.ok,
        authority,
      })
      const lost = 'ok' in contact && contact.ok.kind === 'lost' ? contact.ok.evidence : null
      return succeed(statusOf(loaded.ok, lost))
    })

  readonly prewarm: AgentDrivePort['prewarm'] = async () => fail({ kind: 'unsupported' })

  private wake(tenant: TenantId, session: SessionId, execution: AgentExecutionId): void {
    const logger = this.scope.logger(LOGGER)
    announcePublished(this.scope, line => logger.warn(line), { tenant, session, execution })
  }

  private async guarded<T>(operation: string, run: () => Promise<Drive<T>>): Promise<Drive<T>> {
    if (this.closed) return unavailable('the agent drive has stopped')
    try {
      return await run()
    } catch (cause) {
      return this.defect(operation, `threw: ${describe(cause)}`)
    }
  }

  private tenantText(tenant: TenantId): string | undefined {
    try {
      const encoded = tenantCodec.encode(tenant)
      return encoded.ok ? encoded.value : undefined
    } catch {
      return undefined
    }
  }

  private keyOf(tenant: string, target: Pick<DriveTarget, 'session' | 'execution'>): string {
    return JSON.stringify([tenant, target.session, target.execution])
  }

  private keep(
    tenant: string,
    target: DriveTarget,
    placed: Placed & { handle: AgentExecutionHandle<unknown> },
  ) {
    if (this.closed) return
    this.kept.set(this.keyOf(tenant, target), {
      tenant,
      instance: placed.instance,
      handle: placed.handle,
    })
  }

  private defect(operation: string, diagnostic: string): Drive<never> {
    this.scope.logger(LOGGER).error(`${operation}: translation defect: ${diagnostic}`)
    return unavailable(`translation defect: ${diagnostic}`)
  }

  private async principalOf(
    target: Pick<DriveTarget, 'tenant' | 'session'>,
  ): Promise<Drive<unknown>> {
    const principal = await this.given.coordinator({
      tenant: target.tenant,
      session: target.session,
    })
    if ('ok' in principal) return succeed(principal.ok)
    return this.sessionFailure('principal', principal.failure)
  }

  private async prepare(
    target: DriveTarget,
  ): Promise<Drive<Readonly<{ tenant: string; mutation: Mutation }>>> {
    const tenant = this.tenantText(target.tenant)
    if (tenant === undefined) return this.defect('prepare', 'the tenant was not made by the parser')
    const execution = decodeAgentExecutionId(target.execution)
    if ('failure' in execution)
      return this.defect('prepare', 'the execution is not an Agent identity')
    const operation = decodeAgentOperationId(target.operation)
    if ('failure' in operation)
      return this.defect('prepare', 'the operation is not an Agent identity')
    const principal = await this.principalOf(target)
    if ('failure' in principal) return principal
    return succeed({
      tenant,
      mutation: {
        principal: principal.ok,
        tenant: target.tenant,
        execution: execution.ok,
        operation: operation.ok,
      },
    })
  }

  private async slotOf(
    target: DriveTarget,
    principal: unknown,
    tenant: string,
  ): Promise<Drive<Slot>> {
    const access = { principal, tenant: target.tenant, session: target.session }
    const work = await this.scope[sessionKey].work.readWork(access)
    if ('failure' in work) return this.sessionFailure('readWork', work.failure)
    const { run } = work.ok
    if (run.kind !== 'active') return unavailable('the session has no active Run')
    if (run.advance === null) return this.defect('slot', 'the active Run has no advance')
    const decoded = decodeSessionSlotRef(run.advance.instance)
    if ('failure' in decoded)
      return this.defect('slot', `slot reference: ${decoded.failure.reason}`)
    if (decoded.ok.session !== target.session)
      return this.defect('slot', 'the slot reference names another session')
    if (!sameAdoption(decoded.ok.adoption, run.adoption))
      return this.defect('slot', 'the slot reference names another adoption than the active Run')
    return succeed({
      scope: sessionScopeEvidence(tenant, target.session),
      definition: decoded.ok.adoption,
    })
  }

  // The urgent input of an interrupt asks the Agent to release the wait of the current step. The
  // first input of a Run is never one: an interrupt targets a Run that is already active.
  private async priorityOf(
    target: DriveTarget,
    principal: unknown,
    input: InputId,
  ): Promise<Drive<AcceptedInput['priority']>> {
    const access = { principal, tenant: target.tenant, session: target.session }
    const work = await this.scope[sessionKey].work.readWork(access)
    if ('failure' in work) return this.sessionFailure('readWork', work.failure)
    const urgent = work.ok.controls.some(
      control => control.intent.kind === 'interrupt' && control.intent.urgent.input === input,
    )
    return succeed(urgent ? 'urgent' : 'ordinary')
  }

  private async accepted(
    target: DriveTarget,
    principal: unknown,
    input: InputId,
    source: DurableEvidence,
    priority: AcceptedInput['priority'] = 'ordinary',
  ) {
    const id = decodeInputId(input)
    if ('failure' in id) return this.defect('input', 'the input is not an Agent identity')
    const access = { principal, tenant: target.tenant, session: target.session }
    const read = await this.scope[sessionKey].work.readInput({ ...access, input })
    if ('failure' in read) return this.sessionFailure('readInput', read.failure)
    return succeed({ id: id.ok, content: read.ok.message, source, priority })
  }

  private async place(mutation: Mutation, slot: Slot): Promise<Drive<Placed>> {
    const access = { principal: mutation.principal, tenant: mutation.tenant }
    const acquired = await this.scope.agentInstanceProvision.acquire({ ...access, ...slot })
    if ('failure' in acquired) return this.agentFailure('acquire', acquired.failure)
    const { instance } = acquired.ok
    const runtime = await this.scope.agentInstances.resolve({ ...access, instance })
    if ('failure' in runtime) return this.agentFailure('resolve', runtime.failure)
    return succeed({ instance, runtime: runtime.ok })
  }

  private async onSlot(
    operation: 'invoke' | 'resume',
    mutation: Mutation,
    slot: Slot,
    call: (runtime: AgentRuntime<unknown>) => Reply<AgentExecutionHandle<unknown>>,
  ): Promise<Drive<Placed & { handle: AgentExecutionHandle<unknown> }>> {
    const first = await this.place(mutation, slot)
    if ('failure' in first) return first
    const answer = await call(first.ok.runtime)
    if ('ok' in answer) return succeed({ ...first.ok, handle: answer.ok })
    if (answer.failure.kind !== 'unavailable') return this.driveFailure(operation, answer.failure)
    const again = await this.place(mutation, slot)
    if ('failure' in again || again.ok.instance === first.ok.instance)
      return this.driveFailure(operation, answer.failure)
    const retried = await call(again.ok.runtime)
    return 'ok' in retried
      ? succeed({ ...again.ok, handle: retried.ok })
      : this.driveFailure(operation, retried.failure)
  }

  private driveFailure(operation: 'invoke' | 'resume', failure: Failure): Drive<never> {
    if (failure.kind === 'unsupported')
      return fail({ kind: 'refused', failure: 'unsupported', field: null, reason: null })
    if (failure.kind === 'invalid' && admissionRecord(failure) === null)
      return fail({
        kind: 'refused',
        failure: 'invalid',
        field: failure.field,
        reason: failure.reason,
      })
    return this.agentFailure(operation, failure)
  }

  private async receipt(target: DriveTarget, mutation: Mutation): Promise<Drive<DriveReceipt>> {
    const answer = await this.scope.agentExecutionRecovery.query(mutation)
    if ('failure' in answer) return this.agentFailure('query', answer.failure)
    switch (answer.ok.kind) {
      case 'committed':
        return succeed(receiptOf(answer.ok.receipt))
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: target.operation })
      default:
        return this.defect('receipt', `an accepted operation was queried as ${answer.ok.kind}`)
    }
  }

  private agentFailure(operation: string, failure: Failure): Drive<never> {
    switch (failure.kind) {
      case 'denied':
      case 'busy':
      case 'terminal':
      case 'changed':
      case 'stale-advance':
      case 'unsupported':
      case 'conflict':
        return fail({ kind: failure.kind })
      case 'invalid': {
        const rejection = admissionRecord(failure)
        if (rejection !== null) return fail({ kind: 'invalid', reason: failure.reason, rejection })
        if (failure.field !== 'value')
          return this.defect(
            operation,
            `Agent answered invalid ${failure.field}: ${failure.reason}`,
          )
        this.scope
          .logger(LOGGER)
          .error(`${operation}: Agent invalid value: ${failure.reason} 未带拒收证据（NP-12）`)
        return unavailable(`Agent invalid value: ${failure.reason} 未带拒收证据（NP-12）`)
      }
      case 'unavailable':
        return unavailable(`${failure.owner}: ${failure.diagnostic}`)
      case 'commit-unknown':
        return fail({ kind: 'commit-unknown', operation: failure.operation })
      case 'not-ready':
        return unavailable(`${operation}: Agent is not ready`)
      case 'reclaimed':
        return this.defect(operation, 'Agent read a material whose content was reclaimed')
      default: {
        const unknown: never = failure
        return this.defect(operation, `Agent answered ${describe(unknown)}`)
      }
    }
  }

  private sessionFailure(operation: string, failure: SessionFailure): Drive<never> {
    if (failure.kind === 'denied') return fail({ kind: 'denied' })
    const detail = 'diagnostic' in failure ? `: ${failure.diagnostic}` : ''
    return unavailable(`${operation} answered ${failure.kind}${detail}`)
  }
}

export function createSessionAgentDrivePlugin<P>(input: SessionAgentDriveInput<P>) {
  return {
    name: 'session-ad14',
    inject: {
      [agentInstancesKey]: null,
      [agentInstanceProvisionKey]: null,
      [agentExecutionRecoveryKey]: null,
      [agentExecutionControlKey]: null,
      [sessionKey]: { caller: 'coordinator' as const },
    },
    apply(ctx: Context) {
      new SessionAgentDriveProvider(ctx, input)
    },
  }
}
