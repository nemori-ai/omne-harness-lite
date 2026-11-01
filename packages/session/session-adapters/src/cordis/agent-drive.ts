// AD-14, the `sessionAgentDrive` provider: Session's outbound port to Agent. It translates each port
// operation into the public Agent entry that SPEC AD-14 names, and each Agent answer into a
// `DriveFailure` by the result table there. The outbound principal is the one the assembly issues to
// the session coordinator; it is handed in, it is not read from Cordis, the plugin tree or a config.
// `invoke` and `resume` find the Agent instance by the session slot reference of the active Run: the
// plugin reads the Run with the `coordinator` caller class, parses the reference, checks it against
// the Run, takes the slot's instance from `agentInstanceProvision` and resolves its runtime in
// `agentInstances`. The plugin keeps only derived values: the execution handles that `invoke` and
// `resume` returned, dropped when their instance retires or the plugin stops.
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  judgeEvidence,
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
import { decodeModelCallId } from '@omne-harness/model-contract'
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
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeSessionSlotRef } from '../slot-ref.ts'

/** The failures of the coordinator principal: those of `SessionWorkPrincipals.forSession`. */
export type SessionCoordinatorPrincipalFailure = Extract<
  SessionFailure,
  { kind: 'denied' | 'unavailable' | 'quarantined' }
>

/**
 * What the assembly hands to AD-14: the principal that it issues to the coordinator of one
 * session. The assembly entry answers it with `forSession({ actor: 'coordinator', ... })` of the
 * session work principals.
 */
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

/**
 * The security scope of a session's slot (XC-AGINST 第 2 节): the same value for the same session
 * before and after a restart. The host compares it whole and does not parse it.
 */
export function sessionScopeEvidence(tenant: string, session: SessionId): DurableEvidence {
  return { owner: 'session', record: session, revision: '1', digest: digestOf([tenant, session]) }
}

/** The reason basis that names one Session operation, for control and detach. */
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

function receiptOf(receipt: CommandReceipt): DriveReceipt {
  return { revision: receipt.revision, evidence: receipt.evidence }
}

/** The Agent control that one Session control intent becomes, or null when none is sent. */
function controlOf(
  intent: Control,
  reason: DurableEvidence,
): Outcome<ExecutionControl | null, string> {
  switch (intent.kind) {
    case 'stop-call': {
      const { producer } = intent
      if (producer.kind === 'model') {
        const call = decodeModelCallId(producer.call)
        return 'ok' in call
          ? succeed({ kind: 'interrupt-model', call: call.ok, reason })
          : fail('the Model call is not a Model call identity')
      }
      const call = decodeToolCallId(producer.call)
      return 'ok' in call
        ? succeed({ kind: 'interrupt-tool', call: call.ok, reason })
        : fail('the Tool call is not a Tool call identity')
    }
    case 'background-tool': {
      const call = decodeToolCallId(intent.producer.call)
      return 'ok' in call
        ? succeed({ kind: 'background-tool', call: call.ok, reason })
        : fail('the Tool call is not a Tool call identity')
    }
    case 'cancel-run':
    case 'archive':
      return succeed({ kind: 'cancel', reason })
    case 'unarchive':
      return succeed(null)
    default: {
      const unknown: never = intent
      return fail(`unknown control ${describe((unknown as { kind?: unknown }).kind)}`)
    }
  }
}

function statusOf(snapshot: ExecutionSnapshot): ExecutionStatus {
  const { state } = snapshot
  const attached = snapshot.executionAttachment !== null
  if (state.kind === 'ended') {
    const { conclusion } = state
    return {
      revision: snapshot.revision,
      state: 'ended',
      attachment: null,
      conclusion: {
        outcome: conclusion.kind,
        cause: conclusion.kind === 'complete' ? null : conclusion.cause,
        disposition: state.disposition,
      },
      evidence: snapshot.history,
    }
  }
  const suspended = state.kind === 'suspended'
  return {
    revision: snapshot.revision,
    state: suspended ? 'suspended' : 'open',
    attachment: attached ? (suspended ? 'detached' : 'active') : null,
    conclusion: null,
    evidence: snapshot.history,
  }
}

/**
 * The provider. It needs the Agent directory, the slot provision, the recovery and control entries
 * and `session` with the `coordinator` class; while any is absent the plugin stays pending and
 * `sessionAgentDrive` is absent, so Session keeps its tasks and replays them.
 */
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

  // --- the port --------------------------------------------------------------------------------

  readonly invoke: AgentDrivePort['invoke'] = input =>
    this.guarded('invoke', async () => {
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation, tenant } = prepared.ok
      const slot = await this.slotOf(input, mutation.principal, tenant)
      if ('failure' in slot) return slot
      const initial = await this.accepted(input, mutation.principal, input.first, input.source)
      if ('failure' in initial) return initial
      const started = await this.onSlot(mutation, slot.ok, runtime =>
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
      // NP-03: without a handle the task stays with Session.
      if (kept === undefined) return unavailable('no execution handle for submit (NP-03)')
      const prepared = await this.prepare(input)
      if ('failure' in prepared) return prepared
      const { mutation } = prepared.ok
      const value = await this.accepted(input, mutation.principal, input.input, input.source)
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
      const resumed = await this.onSlot(mutation, slot.ok, runtime =>
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
      const command = controlOf(input.intent, sessionBasis(tenant, input.session, input.control))
      if ('failure' in command) return this.defect('control', command.failure)
      // unarchive is reconciled by the original Session command; Agent is not called.
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
      const authority = loaded.ok.executionAttachment
      if (authority === null) return unavailable('the execution has no attachment to hand back')
      const answer = await recovery.detach({
        ...mutation,
        authority,
        reason: sessionBasis(tenant, input.session, input.operation),
      })
      return 'ok' in answer ? succeed(answer.ok) : this.agentFailure('detach', answer.failure)
    })

  // NP-04: there is no public entry through which a qualified custodian records a late result.
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
          // The port only queries the drive operations it sent; none of them is a recorded control.
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
      // NP-05: load has no answer for "no record", so this port never says missing.
      return 'ok' in loaded
        ? succeed(statusOf(loaded.ok))
        : this.agentFailure('inspect', loaded.failure)
    })

  // P-7: no Agent entry is called before the host instance-creation entry is adopted for prewarm.
  readonly prewarm: AgentDrivePort['prewarm'] = async () => fail({ kind: 'unsupported' })

  // --- steps -----------------------------------------------------------------------------------

  /**
   * Runs one operation. A closed plugin gives unavailable. A throw is reported as a defect and also
   * gives unavailable, never a rejection.
   */
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
    // A call that was in flight when the plugin stopped keeps nothing.
    if (this.closed) return
    this.kept.set(this.keyOf(tenant, target), {
      tenant,
      instance: placed.instance,
      handle: placed.handle,
    })
  }

  /** A translation defect: reported, and answered as unavailable, never as a business refusal. */
  private defect(operation: string, diagnostic: string): Drive<never> {
    this.scope.logger(LOGGER).error(`${operation}: translation defect: ${diagnostic}`)
    return unavailable(`translation defect: ${diagnostic}`)
  }

  /** The coordinator principal of the target session. */
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

  /** The identities of the target as Agent identities, and the coordinator principal. */
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

  /**
   * The slot of the active Run (SPEC AD-14「会话槽引用」): read the Run, parse its slot reference and
   * check it against the target session and the Run's adoption. Any mismatch is a defect of whoever
   * computed the reference, so no instance is taken.
   */
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

  /** The Agent input of one Session input: its content from `readInput`, with its source basis. */
  private async accepted(
    target: DriveTarget,
    principal: unknown,
    input: InputId,
    source: DurableEvidence,
  ) {
    const id = decodeInputId(input)
    if ('failure' in id) return this.defect('input', 'the input is not an Agent identity')
    const access = { principal, tenant: target.tenant, session: target.session }
    const read = await this.scope[sessionKey].work.readInput({ ...access, input })
    if ('failure' in read) return this.sessionFailure('readInput', read.failure)
    return succeed({
      id: id.ok,
      content: read.ok.message,
      source,
      priority: 'ordinary' as const,
    })
  }

  /** The runtime of the slot's instance: `acquire`, then `resolve`. */
  private async place(mutation: Mutation, slot: Slot): Promise<Drive<Placed>> {
    const access = { principal: mutation.principal, tenant: mutation.tenant }
    const acquired = await this.scope.agentInstanceProvision.acquire({ ...access, ...slot })
    if ('failure' in acquired) return this.agentFailure('acquire', acquired.failure)
    const { instance } = acquired.ok
    const runtime = await this.scope.agentInstances.resolve({ ...access, instance })
    if ('failure' in runtime) return this.agentFailure('resolve', runtime.failure)
    return succeed({ instance, runtime: runtime.ok })
  }

  /**
   * Runs `invoke` or `resume` on the slot's instance. When it answers unavailable and the slot now
   * has another instance (the old one was reclaimed between `acquire` and the call), the call runs
   * once more on the new instance (XC-AGINST 第 3.5 节第 3 条).
   */
  private async onSlot(
    mutation: Mutation,
    slot: Slot,
    call: (runtime: AgentRuntime<unknown>) => Reply<AgentExecutionHandle<unknown>>,
  ): Promise<Drive<Placed & { handle: AgentExecutionHandle<unknown> }>> {
    const first = await this.place(mutation, slot)
    if ('failure' in first) return first
    const answer = await call(first.ok.runtime)
    if ('ok' in answer) return succeed({ ...first.ok, handle: answer.ok })
    if (answer.failure.kind !== 'unavailable') return this.agentFailure('runtime', answer.failure)
    const again = await this.place(mutation, slot)
    if ('failure' in again || again.ok.instance === first.ok.instance)
      return this.agentFailure('runtime', answer.failure)
    const retried = await call(again.ok.runtime)
    return 'ok' in retried
      ? succeed({ ...again.ok, handle: retried.ok })
      : this.agentFailure('runtime', retried.failure)
  }

  /**
   * The receipt of an accepted `invoke` or `resume`: the runtime hands back a handle only, so the
   * receipt is read back by the original operation. An answer that is not known yet stays unknown.
   */
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

  /** The result table of SPEC AD-14, from an Agent failure. */
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
        if (failure.field !== 'value')
          return this.defect(
            operation,
            `Agent answered invalid ${failure.field}: ${failure.reason}`,
          )
        // A refusal of the message admission is a refusal of the input only with the admission
        // provider's own rejection record. This member does not make one (AD-00 rules 2 and 7).
        const rejection = judgeEvidence(Reflect.get(failure, 'rejection'))
        if ('failure' in rejection) return unavailable('Agent invalid 未带拒收证据（NP-12）')
        return fail({ kind: 'invalid', reason: failure.reason, rejection: rejection.ok })
      }
      case 'unavailable':
        return unavailable(`${failure.owner}: ${failure.diagnostic}`)
      case 'commit-unknown':
        return fail({ kind: 'commit-unknown', operation: failure.operation })
      case 'not-ready':
        return unavailable(`${operation}: Agent is not ready`)
      default: {
        const unknown: never = failure
        return this.defect(operation, `Agent answered ${describe(unknown)}`)
      }
    }
  }

  /** A Session failure of a read or of the principal: denied stays denied, the rest is unavailable. */
  private sessionFailure(operation: string, failure: SessionFailure): Drive<never> {
    if (failure.kind === 'denied') return fail({ kind: 'denied' })
    const detail = 'diagnostic' in failure ? `: ${failure.diagnostic}` : ''
    return unavailable(`${operation} answered ${failure.kind}${detail}`)
  }
}

/**
 * The AD-14 plugin. `input.coordinator` is the principal source that the assembly entry hands in;
 * it is not a Cordis service and not a config member.
 */
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
