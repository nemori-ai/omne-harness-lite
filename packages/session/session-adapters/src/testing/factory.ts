import { toolReleases } from './result-release.ts'
import { captureModelSettlement } from './model-settlement.ts'
import { resultPreparation, preparationOperation } from './result-preparation.ts'
import { publicationHooks } from './publication.ts'
import { captureBackground } from './background.ts'
import { normalizeControls } from './control.ts'
import { createFrontier, commandScope, defaultBudget } from './frontier.ts'
import { emptyHistory } from './empty-history.ts'
import { sessionView } from './session-view.ts'
import { captureHuman } from './human.ts'
import {
  type AgentJournal,
  type AgentExecutionId,
  type CallerCommit,
  type ExecutionMutation,
  type Failure,
  type CommandReceipt,
} from '@omne-harness/agent-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandDigest,
  decide,
  reduce,
  deriveSessionOperation,
  judgeCompletion,
  mutationAccessRequest,
  type SessionAccess,
  type SessionAccessCheck,
  type SessionId,
  type SessionCommand,
  type SessionTransactionPort,
  type SessionFailure,
  type SessionOperationId,
  type SessionLogObservation,
  type ConsumptionId,
  type CommittedBatch,
  type GuardCommand,
  type HistoryEntry,
} from '@omne-harness/session-contract'
import type { InitializationSource } from './ports.ts'
import { operationSemantic, createCell, type JournalCell, type SessionState } from './root.ts'
import {
  createJournal,
  outrunParticipation,
  type JointDecision,
  type JournalWrite,
} from './journal.ts'
import { commitAccessMatches, createSessionTransactions, qualifyAccess } from './session.ts'
import {
  history,
  grantAttempt,
  authorityAttempt,
  normalizedResult,
  registration,
  executionKey,
  HistoryFailure,
} from './history.ts'
import { canonical, materializeModelView } from './session-values.ts'
import type { SessionDirectory } from './session-directory.ts'

export type MemorySessionJournalOptions<P> = Readonly<{
  initialization: InitializationSource
  /**
   * The current access decision of every public Session read and write on `transactions`
   * (session-contract SPEC「当前操作的访问裁定」). Required; the double has no default permission.
   */
  accessCheck: SessionAccessCheck<P>
  /**
   * The current qualification of the Agent Journal operations on the same log (open, submit,
   * commit, load, query, the materials and the testing controls). This is the Agent side of the
   * double; it does not decide Session public operations.
   */
  authorize(input: SessionAccess<P>, action: string): 'allowed' | 'denied' | 'unavailable'
  budget?: Readonly<{ entries: number; bytes: number; capacityBytes: number }>
}>
const denied = (action: string): Failure => ({ kind: 'denied', action })
function agentFailure(
  failure: SessionFailure,
  operation: ExecutionMutation<unknown>['operation'],
): Failure {
  switch (failure.kind) {
    case 'denied':
      return denied(failure.action)
    case 'invalid':
      return { kind: 'invalid', field: failure.field, reason: failure.reason }
    case 'unavailable':
      return failure
    case 'conflict':
      return { kind: 'conflict', operation }
    case 'commit-unknown':
      return { kind: 'commit-unknown', operation }
    case 'quarantined':
      return { kind: 'unavailable', owner: 'session-history', diagnostic: failure.diagnostic }
    case 'archived':
    case 'terminal':
    case 'stale-advance':
    case 'changed':
      return { kind: 'changed' }
    default:
      return { kind: 'unsupported' }
  }
}
export function createMemorySessionJournal<P>(options: MemorySessionJournalOptions<P>) {
  const publications = publicationHooks()
  const publicationKey = (cell: JournalCell<P>, operation: SessionOperationId) =>
    canonical([cell.namespace, operation])
  const cells = new Map<string, JournalCell<P>>()
  const views = new Map<string, ReturnType<typeof createJournal<P>>>()
  const keyOf = (tenant: TenantId, session: SessionId) => {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) throw new TypeError('invalid tenant')
    return `${text.value}\u0000${session}`
  }
  const directory: SessionDirectory = {
    get: key => cells.get(key)?.state().session ?? undefined,
    set(key, value) {
      const cell = cells.get(key)
      if (!cell) throw new Error('missing common root')
      cell.mutate(() => cell.replaceSession(value))
    },
    *values() {
      for (const cell of cells.values()) {
        const state = cell.state().session
        if (state) yield state
      }
    },
    *entries() {
      for (const [key, cell] of cells) {
        const state = cell.state().session
        if (state) yield [key, state]
      }
    },
    gate: key => cells.get(key)?.gate() ?? null,
  }
  const base = createSessionTransactions<P>(directory, {
    initialization: options.initialization,
    capacityBytes: options.budget?.capacityBytes ?? defaultBudget.capacityBytes,
    history: {
      read: (snapshot, _entries, scope, extra, through) =>
        history(cellOf(snapshot.tenant, snapshot.session), snapshot, scope, extra, through),
    },
    accessCheck: options.accessCheck,
  })
  function cellOf(tenant: TenantId, session: SessionId): JournalCell<P> {
    const key = keyOf(tenant, session),
      prior = cells.get(key)
    if (prior) return prior
    const cell: JournalCell<P> = createCell<P>(tenant, session, {
      authorize(input, action) {
        const status = options.authorize({ ...input, session }, action)
        return status === 'allowed'
          ? undefined
          : status === 'denied'
            ? denied(action)
            : { kind: 'unavailable', owner: 'session-qualification', diagnostic: action }
      },
      advances(execution, authority) {
        const state = cell.state().session
        if (!state || state.snapshot.run.kind !== 'active' || !state.snapshot.run.advance)
          return false
        try {
          return (
            authorityAttempt(cell.state(), execution, authority).attempt ===
            state.snapshot.run.advance.attempt
          )
        } catch {
          return false
        }
      },
      participate(input, method, receipt, decision) {
        try {
          return participant(cell, input, method, receipt, decision)
        } catch (error) {
          if (error instanceof HistoryFailure) {
            if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
            return agentFailure(error.failure, input.operation)
          }
          throw error
        }
      },
      committed(input, method, receipt) {
        try {
          const records = cell.state().agent.originals.get(input.execution) ?? []
          const { principal: _principal, tenant: _tenant, ...fixed } = input
          const original =
            'checkpoint' in fixed ? (({ checkpoint: _checkpoint, ...rest }) => rest)(fixed) : fixed
          cell.state().agent.originals.set(input.execution, [
            ...records,
            {
              method,
              input: { ...structuredClone(original), tenant },
              semantic: operationSemantic(input),
              receipt,
            },
          ])
          const root = cell.state(),
            execution = root.agent.executions.get(executionKey(root, input.execution)),
            run = root.sources.runs.get(input.execution)
          root.agent.originalByOperation.set(
            `${input.execution}\0${input.operation}`,
            root.agent.originals.get(input.execution)!.at(-1)!,
          )
          if ((method === 'open' || method === 'attach') && execution) {
            const value = input as Parameters<AgentJournal<P>['open']>[0]
            const authority = execution.attachments.at(-1)?.authority
            if (authority)
              root.agent.authorities.set(
                `${input.execution}\0${canonical(authority)}`,
                grantAttempt(root, input.execution, value.grant),
              )
          }

          if (method === 'recordResult' && execution) {
            const value = input as Parameters<AgentJournal<P>['recordResult']>[0]
            normalizedResult(root, execution, value.consumption, value.result)
          }
          if (execution && run) {
            if (method === 'commit') {
              const value = input as Parameters<AgentJournal<P>['commit']>[0]
              for (const effect of value.effects) {
                const key = `${execution.id}\0${effect.action}`
                if (!root.agent.effectSteps.has(key))
                  root.agent.effectSteps.set(key, value.checkpoint.step)
              }
              const fragments = captureModelSettlement(
                root,
                execution,
                receipt,
                value.replyAdmission,
              )
              if (fragments.length)
                root.agent.modelSettlements.set(execution.id, [
                  ...(root.agent.modelSettlements.get(execution.id) ?? []),
                  ...fragments,
                ])
            }
            const background = captureBackground(root, execution, receipt)
            if (background.length)
              root.agent.background.set(execution.id, [
                ...(root.agent.background.get(execution.id) ?? []),
                ...background,
              ])
            const old = root.agent.indexedEvents.get(input.execution) ?? 0
            const batches = [...(root.agent.batches.get(input.execution) ?? [])]
            for (const event of execution.events.slice(old)) {
              root.agent.eventReceipts.set(`${execution.id}\0${event.sequence}`, receipt)
              if (event.body.kind === 'ended')
                root.agent.ended.set(execution.id, {
                  sequence: event.sequence,
                  source: event.cause,
                })
              if (event.body.kind === 'control')
                root.agent.controls.set(
                  `${execution.id}\0${event.sequence}`,
                  structuredClone(execution.controls),
                )
              const pending =
                event.body.kind === 'waiting'
                  ? event.body.waits.flatMap(wait =>
                      wait.kind === 'producer' ? [wait.pending] : [],
                    )
                  : event.body.kind === 'producer'
                    ? [
                        normalizedResult(root, execution, event.body.consumption, event.body.result)
                          .pending,
                      ]
                    : []
              root.agent.pendingEvents.set(`${execution.id}\0${event.sequence}`, pending)
              for (const value of pending) {
                registration(root, execution, value)
                const key = `${execution.id}\0${value.consumption}`,
                  prior = root.agent.callOrigins.get(key)
                if (!prior)
                  root.agent.callOrigins.set(key, {
                    first: event.sequence,
                    pending: value,
                    association: null,
                  })
                else if (
                  prior.pending.kind === 'tool' &&
                  prior.pending.association === 'intent' &&
                  value.kind === 'tool' &&
                  value.association === 'associated' &&
                  prior.association === null
                )
                  root.agent.callOrigins.set(key, {
                    ...prior,
                    association: { sequence: event.sequence, pending: value, source: event.cause },
                  })
              }
              if (
                event.body.kind === 'waiting' &&
                event.body.waits.some(wait => wait.kind === 'human')
              ) {
                try {
                  root.agent.human.set(
                    `${execution.id}\0${event.sequence}`,
                    captureHuman(event, execution.checkpoint, receipt),
                  )
                } catch (error) {
                  return {
                    kind: 'invalid',
                    field: 'events.waiting',
                    reason:
                      error instanceof Error ? error.message : 'invalid original human material',
                  } as const
                }
              }
            }
            for (const event of execution.events.slice(old))
              if (event.body.kind === 'input-taken') {
                const record = {
                  run: run.run,
                  execution: input.execution,
                  sequence: event.sequence,
                  source: event.cause,
                  batch: {
                    ...event.body.batch,
                    id: String(
                      event.body.batch.id,
                    ) as import('@omne-harness/session-contract').BatchId,
                    ordered: event.body.batch.ordered.map(
                      id => String(id) as import('@omne-harness/session-contract').InputId,
                    ),
                  },
                }
                batches.push(record)
                for (const member of record.batch.ordered)
                  root.agent.inputBatches.set(member, [
                    ...(root.agent.inputBatches.get(member) ?? []),
                    record,
                  ])
              }
            root.agent.batches.set(input.execution, batches)
            root.agent.indexedEvents.set(input.execution, execution.events.length)
          }
          if (method === 'open' || method === 'submit') {
            const value = input as Parameters<AgentJournal<P>['open']>[0] &
              Parameters<AgentJournal<P>['submit']>[0]
            const admitted = method === 'open' ? value.initial : value.value
            const root = cell.state(),
              state = root.session
            if (!state) throw new Error('admission without Session')
            const execution = root.agent.executions.get(executionKey(root, input.execution))
            const attachment = execution?.attachments.at(-1)?.authority
            const prior =
              method === 'open'
                ? value
                : (records.findLast(item => item.method === 'open' || item.method === 'attach')
                    ?.input as Parameters<AgentJournal<P>['attach']>[0] | undefined)
            const grant = prior?.grant
            if (!attachment || !grant) throw new Error('admission without original grant')
            const attempt = grantAttempt(cell.state(), input.execution, grant)
            const run = root.sources.runs.get(input.execution)
            if (!run) throw new Error('admission without original run')
            const id = String(admitted.id) as import('@omne-harness/session-contract').InputId
            const directory = root.agent.admissions.get(id) ?? []
            root.agent.admissions.set(id, [
              ...directory,
              {
                ordinal: String(directory.length),
                run: run.run,
                execution: input.execution,
                runStarted: run.source,
                operation: input.operation,
                accepted: receipt.evidence,
                attempt: attempt.attempt,
                attemptStarted: attempt.started,
                attachment: attachment.executionAttachment,
                grant,
              },
            ])
          }
        } catch (error) {
          if (error instanceof HistoryFailure)
            return error.failure.kind === 'quarantined'
              ? { kind: 'invalid', field: 'original-material', reason: error.failure.diagnostic }
              : agentFailure(error.failure, input.operation)
          throw error
        }
      },
    })
    cells.set(key, cell)
    return cell
  }
  /**
   * The Session command one `commit` or `recordResult` derives from its caller: `undefined` when
   * the caller does not participate, otherwise the command or the Agent failure that stops it.
   */
  function jointCommand(
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
  ): Outcome<SessionCommand, Failure> | undefined {
    let caller: CallerCommit = { kind: 'none' }
    if (method === 'commit') caller = (input as Parameters<AgentJournal<P>['commit']>[0]).caller
    if (method === 'recordResult')
      caller = (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
    if (caller.kind === 'none') return undefined
    const operation = deriveSessionOperation({
      kind: 'participation',
      execution: input.execution,
      operation: input.operation,
      joint: caller.kind,
    })
    const common = { tenant: cell.tenant, session: cell.session, operation }
    const participation = {
      execution: input.execution,
      operation: input.operation,
      joint: caller.kind,
      written: receipt.revision,
      handover: receipt.evidence,
    }
    switch (caller.kind) {
      case 'message':
        return succeed({
          kind: 'recordMessage',
          input: {
            ...common,
            participation,
            value: {
              message: caller.message,
              source: caller.source,
              admission: caller.admission,
              consumption: null,
            },
          },
        })
      case 'context-transition':
        if (caller.value.message.role !== 'compaction')
          return fail({ kind: 'invalid', field: 'caller.value.message', reason: 'not compaction' })
        return succeed({
          kind: 'commitDerived',
          input: {
            ...common,
            participation,
            value: { kind: 'compaction', message: caller.value.message },
            judgment: caller.admission,
          },
        })
      case 'custody':
      case 'processed': {
        const execution = cell
          .state()
          .agent.executions.get(executionKey(cell.state(), input.execution))
        if (!execution) return fail(denied(method))
        const result = normalizedResult(
          cell.state(),
          execution,
          caller.consumption,
          caller.result,
        ).result
        const consumption = String(caller.consumption) as ConsumptionId
        return succeed(
          caller.kind === 'custody'
            ? {
                kind: 'preserveResult',
                input: { ...common, participation, consumption, result, custody: caller.retained },
              }
            : {
                kind: 'completeConsumption',
                input: {
                  ...common,
                  participation,
                  completion: { consumption, result, completion: caller.completion },
                },
              },
        )
      }
    }
  }
  /**
   * The current Session decision of the participation this public call derives (session-contract
   * SPEC「命令表」: every mutation command is decided first). The access is the caller's own
   * principal and tenant on this cell's session.
   */
  async function qualifyJoint(
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
    receipt: CommandReceipt,
  ): Promise<Outcome<JointDecision, Failure>> {
    let derived: Outcome<SessionCommand, Failure> | undefined
    try {
      derived = jointCommand(cell, input, method, receipt)
    } catch (error) {
      if (error instanceof HistoryFailure) {
        if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
        return fail(agentFailure(error.failure, input.operation))
      }
      throw error
    }
    if (derived === undefined)
      return fail({
        kind: 'unavailable',
        owner: 'session-qualification',
        diagnostic: 'qualification of a write without participation',
      })
    if ('failure' in derived) return derived
    const command = derived.ok
    const qualification = await qualifyAccess(
      options.accessCheck,
      mutationAccessRequest(
        { principal: input.principal, tenant: input.tenant, session: cell.session },
        command,
      ),
    )
    if ('failure' in qualification)
      return fail(agentFailure(qualification.failure, input.operation))
    return succeed({ evidence: qualification.ok, digest: commandDigest(command) })
  }
  function participant(
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
    decision: JointDecision | null,
  ): Failure | undefined {
    const state = cell.state().session
    if (!state) return denied(method)
    if (method === 'open' || method === 'attach') {
      const value = input as
        | Parameters<AgentJournal<P>['open']>[0]
        | Parameters<AgentJournal<P>['attach']>[0]
      const attempt = grantAttempt(cell.state(), input.execution, value.grant)
      if (
        state.snapshot.run.kind !== 'active' ||
        state.snapshot.run.advance?.attempt !== attempt.attempt
      )
        return { kind: 'stale-advance' }
      if (method === 'open') {
        const original = value as Parameters<AgentJournal<P>['open']>[0]
        const admitted = state.inputs.get(
          String(original.initial.id) as import('@omne-harness/session-contract').InputId,
        )
        if (
          !admitted ||
          canonical(admitted.origin) !== canonical(original.initial.source) ||
          canonical(admitted.message) !== canonical(original.initial.content)
        )
          return denied(method)
      }
    }
    if (method === 'submit') {
      const value = input as Parameters<AgentJournal<P>['submit']>[0]
      const admitted = state.inputs.get(
        String(value.value.id) as import('@omne-harness/session-contract').InputId,
      )
      if (
        !admitted ||
        canonical(admitted.origin) !== canonical(value.value.source) ||
        canonical(admitted.message) !== canonical(value.value.content)
      )
        return denied(method)
      if (
        state.snapshot.run.kind !== 'active' ||
        state.snapshot.run.execution.execution !== input.execution
      )
        return { kind: 'terminal' }
    }
    if (
      method === 'tryFinish' &&
      (input as Parameters<AgentJournal<P>['tryFinish']>[0]).authorization.kind === 'advancement'
    ) {
      const checked = judgeCompletion(state.snapshot, input.execution)
      if (checked.kind !== 'allowed') return { kind: 'changed' }
    }
    const derived = jointCommand(cell, input, method, receipt)
    if (derived === undefined) return undefined
    if ('failure' in derived) return derived.failure
    const command = derived.ok
    // The Session half commits with the decision this public call obtained before publication,
    // and only for the command that was decided. A write of the same execution that committed
    // while the decision was outstanding changes the revision the participation names; this call
    // then commits nothing and is not decided again (one decision per public write), and a retry
    // decides the participation at the current revision.
    if (decision === null)
      return {
        kind: 'unavailable',
        owner: 'session-qualification',
        diagnostic: 'participation without a current Session decision',
      }
    if (decision.digest !== commandDigest(command)) return outrunParticipation
    const outcome = base.prepareCommand({ command, guards: [], decision: decision.evidence })
    if (!('failure' in outcome)) return undefined
    if (
      method === 'recordResult' &&
      command.kind === 'completeConsumption' &&
      (outcome.failure.kind === 'terminal' ||
        outcome.failure.kind === 'archived' ||
        outcome.failure.kind === 'stale-advance')
    )
      return { kind: 'conflict', operation: input.operation }
    return agentFailure(outcome.failure, input.operation)
  }
  async function interpretEvent(
    cell: JournalCell<P>,
    execution: AgentExecutionId,
    sequence: string,
    operation: SessionOperationId,
    verify: () => SessionFailure | null = () => null,
  ) {
    await publications.wait(publicationKey(cell, operation))
    const qualification = verify()
    if (qualification) return fail(qualification)
    const fault = publications.takeFault(publicationKey(cell, operation))
    if (fault === 'before-publish')
      return fail<SessionFailure>({
        kind: 'unavailable',
        owner: 'session-memory-journal',
        diagnostic: 'injected before interpretation publication',
      })
    const held = cell.current().session?.operations.get(operation)
    if (held)
      return held.projection?.execution === execution && held.projection.sequence === sequence
        ? succeed({ ...held.record.receipt, recovered: true })
        : fail<SessionFailure>({ kind: 'conflict', operation })
    for (;;) {
      const captured = cell.current(),
        event = captured.agent.executions.get(executionKey(captured, execution))?.events[
          Number(sequence) - 1
        ]
      if (event?.body.kind !== 'ended' || captured.session?.snapshot.frozen === null) break
      const prepared = await frontier.prepare(
        cell,
        snapshot => ({ kind: 'pending', inputs: snapshot.pending }),
        [execution],
        verify,
      )
      if (cell.current() === prepared) break
    }
    const finalQualification = verify()
    if (finalQualification) return fail(finalQualification)
    const root = cell.current(),
      state = root.session
    if (!state) return fail<SessionFailure>({ kind: 'denied', action: 'interpret' })
    const original = root.agent.executions.get(executionKey(root, execution))?.events[
      Number(sequence) - 1
    ]
    const material = history(
      cell,
      state.snapshot,
      { kind: 'pending', inputs: state.snapshot.pending },
      [execution],
      original?.body.kind === 'ended' ? undefined : new Map([[execution, sequence]]),
    )
    const boundary = material.index.executions.find(item => item.execution === execution)
    const fact = material.reads.prefixes
      .find(item => item.execution === execution)
      ?.facts.find(item => item.sequence === sequence)
    if (!boundary)
      return fail<SessionFailure>({
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'original execution',
      })
    if (BigInt(sequence) <= BigInt(boundary.readThrough)) return succeed(null)
    if (!fact)
      return fail<SessionFailure>({
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'original event',
      })
    const observation: SessionLogObservation = {
      tenant: cell.tenant,
      session: cell.session,
      execution,
      run: boundary.run,
      operation,
      sequence: fact.sequence,
      revision: boundary.revision,
      executionEvidence: boundary.executionEvidence,
      source: fact.source,
      consequences: fact.consequences,
    }
    const result = await base.controls.project(observation, operation)
    return fault === 'after-publish' && cell.current() !== root
      ? fail<SessionFailure>({ kind: 'commit-unknown', operation })
      : result
  }
  const frontier = createFrontier<P>(options.budget ?? defaultBudget, interpretEvent)
  // Only the public port methods are exposed; the internal `prepareCommand` and
  // `prepareReconciliation` paths of `base` stay behind this boundary.
  const transactions: SessionTransactionPort<P> = {
    readInput: base.readInput,
    queryOperation: base.queryOperation,
    history: base.history,
    pending: base.pending,
    references: base.references,
    releasedScopes: base.releasedScopes,
    readWork: async input => {
      try {
        return await base.readWork(input)
      } catch (error) {
        if (error instanceof HistoryFailure) {
          if (error.failure.kind === 'quarantined')
            cellOf(input.tenant, input.session).quarantine(error.failure.diagnostic)
          return fail(error.failure)
        }
        throw error
      }
    },
    commit: (async input => {
      const command: SessionCommand = input.command
      if (!commitAccessMatches(input.access, command)) return fail(denied(command.kind))
      if (!tenantCodec.encode(command.input.tenant).ok)
        return fail<SessionFailure>({
          kind: 'invalid',
          field: 'tenant',
          reason: 'not a tenant minted by legal-identity',
        })
      // One decision for this call, before the frontier interprets anything on this root.
      const qualification = await qualifyAccess(
        options.accessCheck,
        mutationAccessRequest(input.access, command),
      )
      if ('failure' in qualification) return fail(qualification.failure)
      const prepared: Parameters<typeof base.prepareCommand>[0] = {
        command,
        guards: input.guards,
        decision: qualification.ok,
      }
      const cell = cellOf(command.input.tenant, command.input.session)
      try {
        if (cell.current().session?.operations.has(command.input.operation))
          return base.prepareCommand(prepared)
        for (;;) {
          const root = await frontier.prepare(cell, snapshot => commandScope(command, snapshot))
          await publications.wait(publicationKey(cell, command.input.operation))
          if (cell.current() !== root) continue
          const fault = publications.takeFault(publicationKey(cell, command.input.operation))
          if (fault === 'before-publish')
            return fail<SessionFailure>({
              kind: 'unavailable',
              owner: 'session-memory-journal',
              diagnostic: 'injected before Session publication',
            })
          const result = base.prepareCommand(prepared)
          return fault === 'after-publish' && cell.current() !== root
            ? fail<SessionFailure>({
                kind: 'commit-unknown',
                operation: command.input.operation,
              })
            : result
        }
      } catch (error) {
        if (error instanceof HistoryFailure) {
          if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
          return fail(error.failure)
        }
        throw error
      }
    }) as SessionTransactionPort<P>['commit'],
  }
  function forSession(scope: Readonly<{ tenant: TenantId; session: SessionId }>) {
    const key = keyOf(scope.tenant, scope.session),
      cell = cellOf(scope.tenant, scope.session)
    let view = views.get(key)
    if (!view) {
      view = createJournal(cell, {
        prepareResult: resultPreparation(cell, publications, base.controls.project, agentFailure),
        qualifyParticipation: (input, method, receipt) =>
          qualifyJoint(cell, input, method, receipt),
        requireGrant: true,
        participants: ['message', 'context-transition', 'custody', 'processed'],
        grant: input => {
          const state = cell.state().session
          if (!state) return false
          try {
            const attempt = grantAttempt(cell.state(), input.execution, input.grant)
            return (
              state.snapshot.run.kind === 'active' &&
              state.snapshot.run.advance?.attempt === attempt.attempt
            )
          } catch {
            return false
          }
        },
      })
      views.set(key, view)
    }
    const admitted = <T>(
      input: ExecutionMutation<P>,
      id: string,
      action: () => Promise<Outcome<T, Failure>>,
    ): Promise<Outcome<T, Failure>> => {
      const authorize = (): SessionFailure | null => {
        const refusal = cell.authorize(input, 'input-admission')
        return refusal
          ? refusal.kind === 'denied'
            ? refusal
            : { kind: 'unavailable', owner: 'session-qualification', diagnostic: 'input-admission' }
          : null
      }
      return (async () => {
        const refusal = authorize()
        if (refusal) return fail(agentFailure(refusal, input.operation))
        const encoded = tenantCodec.encode(input.tenant)
        if (!encoded.ok) return fail({ kind: 'denied', action: 'input-admission' })
        if (
          cell
            .current()
            .agent.operations.has(JSON.stringify([encoded.value, input.execution, input.operation]))
        )
          return action()
        try {
          for (;;) {
            const prepared = await frontier.prepare(
              cell,
              () => ({
                kind: 'selected',
                inputs: [id as import('@omne-harness/session-contract').InputId],
              }),
              [],
              authorize,
            )
            if (prepared !== cell.current()) continue
            return action()
          }
        } catch (error) {
          if (error instanceof HistoryFailure) {
            if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
            return fail(agentFailure(error.failure, input.operation))
          }
          throw error
        }
      })()
    }
    const journal: AgentJournal<P> = {
      ...view.provider.journal,
      open: input => admitted(input, input.initial.id, () => view!.port.open(input)),
      submit: input => admitted(input, input.value.id, () => view!.port.submit(input)),
    }
    return {
      ...view.provider,
      journal,
      controls: {
        ...view.receiving,
        resultPreparationOperation: (
          input: ExecutionMutation<P>,
          method: 'commit' | 'recordResult',
        ) => preparationOperation(cell, input, method),
        historyAvailable: cell.historyAvailable,
        loseHumanMaterial(execution: AgentExecutionId, sequence: string) {
          cell.mutate(() => {
            cell.state().agent.human.delete(`${execution}\0${sequence}`)
            cell.touch()
          })
        },
        loseEvent(execution: AgentExecutionId, sequence: string) {
          cell.mutateExecution(execution, () => {
            const value = cell.state().agent.executions.get(executionKey(cell.state(), execution))
            if (value) delete value.events[Number(sequence) - 1]
          })
        },
        applyRetention: view.applyRetention,
        planEvidence: cell.planEvidence,
        pauseWrite: cell.pause,
        faultWrite: cell.fault,
        quarantine: cell.quarantine,
        root: () => cell.current().position,
      },
      durability: 'none' as const,
    }
  }
  return {
    transactions,
    forSession,
    sessionView: (session: SessionId) =>
      sessionView<P>(input => forSession({ tenant: input.tenant, session })),
    durability: 'none' as const,
    controls: {
      entriesOf: base.controls.entriesOf,
      decisionOf: base.controls.decisionOf,
      frontierMetrics: frontier.metrics,
      pauseSession(
        input: Readonly<{ tenant: TenantId; session: SessionId; operation: SessionOperationId }>,
      ) {
        return publications.pause(
          publicationKey(cellOf(input.tenant, input.session), input.operation),
        )
      },
      faultSession(
        input: Readonly<{ tenant: TenantId; session: SessionId; operation: SessionOperationId }>,
        point: 'before-publish' | 'after-publish',
      ) {
        publications.fault(
          publicationKey(cellOf(input.tenant, input.session), input.operation),
          point,
        )
      },
      originalGrant(input: SessionAccess<P> & { execution: AgentExecutionId }) {
        const cell = cellOf(input.tenant, input.session),
          refusal = cell.authorize(input, 'originalGrant')
        if (refusal) return fail(refusal)
        const state = cell.current().session
        if (!state) return fail(denied('originalGrant'))
        const attempt = cell
          .current()
          .sources.attempts.get(
            state.snapshot.run.kind === 'active' ? (state.snapshot.run.advance?.attempt ?? '') : '',
          )
        if (!attempt || attempt.execution !== input.execution) return fail(denied('originalGrant'))
        const receipt = cell.current().sources.grantByAttempt.get(attempt.attempt)
        return succeed(receipt ?? attempt.started)
      },
      async interpret(
        input: SessionAccess<P> & {
          execution: AgentExecutionId
          operation: SessionOperationId
          sequence: string
        },
      ) {
        const cell = cellOf(input.tenant, input.session)
        const permitted = cell.authorize(input, 'interpret')
        if (permitted)
          return fail<SessionFailure>(
            permitted.kind === 'denied'
              ? permitted
              : {
                  kind: 'unavailable',
                  owner: 'session-history',
                  diagnostic: 'qualification unavailable',
                },
          )
        try {
          return await interpretEvent(
            cell,
            input.execution,
            input.sequence,
            input.operation,
            () => {
              const failure = cell.authorize(input, 'interpret')
              return failure
                ? failure.kind === 'denied'
                  ? failure
                  : { kind: 'unavailable', owner: 'session-qualification', diagnostic: 'interpret' }
                : null
            },
          )
        } catch (error) {
          if (error instanceof HistoryFailure) {
            if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
            return fail(error.failure)
          }
          throw error
        }
      },
      async reconcile(
        input: SessionAccess<P> & { execution: AgentExecutionId; operation: SessionOperationId },
      ) {
        const cell = cellOf(input.tenant, input.session),
          refusal = cell.authorize(input, 'reconcile')
        if (refusal)
          return fail<SessionFailure>(
            refusal.kind === 'denied'
              ? refusal
              : { kind: 'unavailable', owner: 'session-qualification', diagnostic: 'reconcile' },
          )
        const held = cell.current().session?.operations.get(input.operation)
        if (held)
          return held.projection?.execution === input.execution && held.projection.sequence === null
            ? succeed({ ...held.record.receipt, recovered: true })
            : fail<SessionFailure>({ kind: 'conflict', operation: input.operation })
        try {
          await publications.wait(publicationKey(cell, input.operation))
          const qualification = cell.authorize(input, 'reconcile')
          if (qualification)
            return fail<SessionFailure>(
              qualification.kind === 'denied'
                ? qualification
                : { kind: 'unavailable', owner: 'session-qualification', diagnostic: 'reconcile' },
            )
          const recovered = cell.current().session?.operations.get(input.operation)
          if (recovered)
            return recovered.projection?.execution === input.execution &&
              recovered.projection.sequence === null
              ? succeed({ ...recovered.record.receipt, recovered: true })
              : fail<SessionFailure>({ kind: 'conflict', operation: input.operation })
          const fault = publications.takeFault(publicationKey(cell, input.operation))
          if (fault === 'before-publish')
            return fail<SessionFailure>({
              kind: 'unavailable',
              owner: 'session-memory-journal',
              diagnostic: 'before snapshot interpretation',
            })
          const root = cell.current(),
            state = root.session
          if (!state) return fail<SessionFailure>({ kind: 'denied', action: 'reconcile' })
          const execution = root.agent.executions.get(executionKey(root, input.execution))
          if (!execution) return fail<SessionFailure>({ kind: 'denied', action: 'reconcile' })
          const material = history(
              cell,
              state.snapshot,
              { kind: 'pending', inputs: state.snapshot.pending },
              [input.execution],
              new Map(),
            ),
            boundary = material.index.executions.find(item => item.execution === input.execution)
          if (!boundary)
            return fail<SessionFailure>({
              kind: 'unavailable',
              owner: 'session-history',
              diagnostic: 'original head',
            })
          const consequences = [...normalizeControls(root, execution, execution.controls)].filter(
            item => item.kind !== 'observed',
          )
          for (const responsibility of execution.results) {
            const consumption = String(responsibility.consumption) as ConsumptionId
            const existing = state.snapshot.consumptions.find(item => item.id === consumption)
            if (
              existing?.results.some(item => item.result.version === responsibility.result.version)
            )
              continue
            const value = normalizedResult(root, execution, consumption, responsibility.result),
              registration = state.snapshot.callRegistrations?.find(
                item => item.consumption === consumption,
              )?.registration
            if (!registration)
              consequences.push({
                kind: 'call-registration',
                consumption,
                registration: {
                  kind: 'associated',
                  binding: value.binding,
                  purpose: value.pending.purpose,
                } as import('@omne-harness/session-contract').SessionCallRegistration,
              })
            else if (registration.kind === 'tool-intent')
              consequences.push({
                kind: 'call-association',
                consumption,
                binding: value.binding,
                source: boundary.executionEvidence,
              })
            consequences.push({
              kind: 'producer',
              consumption,
              binding: value.binding,
              result: value.result,
            })
          }
          const releases = toolReleases(root, execution)
          // Each release the reconciliation would commit is a `receive` write of this caller:
          // one current decision per fact, before anything is prepared or published.
          for (const fact of releases) {
            const qualification = await qualifyAccess(
              options.accessCheck,
              mutationAccessRequest(input, {
                kind: 'receive',
                input: {
                  tenant: input.tenant,
                  session: input.session,
                  operation: input.operation,
                  fact,
                },
              }),
            )
            if ('failure' in qualification) return fail(qualification.failure)
          }
          const result = base.prepareReconciliation(
            {
              tenant: input.tenant,
              session: input.session,
              execution: input.execution,
              operation: input.operation,
              run: boundary.run,
              sequence: null,
              revision: boundary.revision,
              executionEvidence: boundary.executionEvidence,
              source: boundary.executionEvidence,
              consequences: consequences.length ? consequences : [{ kind: 'observed' }],
            },
            input.operation,
            releases,
            () => {
              const qualification = cell.authorize(input, 'reconcile')
              if (qualification)
                return qualification.kind === 'denied'
                  ? qualification
                  : { kind: 'unavailable', owner: 'session-qualification', diagnostic: 'reconcile' }
              const gap = cell.gate()
              if (gap !== null) return { kind: 'quarantined', diagnostic: gap }
              if (cell.current() !== root)
                return {
                  kind: 'unavailable',
                  owner: 'session-history',
                  diagnostic: 'reconciliation root changed',
                }
              return null
            },
          )
          return fault === 'after-publish' && cell.current() !== root
            ? fail<SessionFailure>({ kind: 'commit-unknown', operation: input.operation })
            : result
        } catch (error) {
          if (error instanceof HistoryFailure) {
            if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
            return fail(error.failure)
          }
          throw error
        }
      },
      loadHistory(
        input: Readonly<{
          command: Extract<SessionCommand, { kind: 'create' }>
          guards: readonly GuardCommand[]
          batches: readonly CommittedBatch[]
        }>,
      ): Outcome<void, SessionFailure> {
        const { command, guards, batches } = input,
          cell = cellOf(command.input.tenant, command.input.session)
        if (cell.current().position !== 0n)
          return fail({ kind: 'conflict', operation: command.input.operation })
        const refusal = options.initialization.verify(command, guards)
        if (refusal) return fail(refusal)
        const first = batches[0],
          prepared = decide(null, command, guards, null, { compaction: null })
        if (
          !first ||
          prepared.kind !== 'entries' ||
          canonical(prepared.entries) !==
            canonical(first.entries.map(({ id: _id, revision: _revision, ...entry }) => entry))
        )
          return fail({
            kind: 'invalid',
            field: 'batches',
            reason: 'initial batch does not match trusted creation',
          })
        let snapshot: import('@omne-harness/session-contract').WorkSnapshot | null = null
        const entries: HistoryEntry[] = []
        for (const batch of batches) {
          const scope: import('@omne-harness/session-contract').SessionInputScope =
            batch.entries.some(row => row.kind === 'run.started')
              ? { kind: 'selected', inputs: snapshot?.pending.slice(0, 1) ?? [] }
              : { kind: 'pending', inputs: snapshot?.pending ?? [] }
          const material = snapshot ? emptyHistory(snapshot, scope) : undefined
          const outcome = reduce(
            snapshot && material ? { ...snapshot, historyIndex: material.index } : snapshot,
            batch,
            material?.reads,
          )
          if (outcome.kind === 'quarantined')
            return fail({ kind: 'quarantined', diagnostic: outcome.diagnostic })
          snapshot = outcome.snapshot
          if (!tenantEquals(snapshot.tenant, cell.tenant) || snapshot.session !== cell.session)
            return fail({ kind: 'denied', action: 'loadHistory' })
          entries.push(...batch.entries)
        }
        if (!snapshot) return fail({ kind: 'invalid', field: 'batches', reason: 'empty history' })
        if (
          entries.some(
            row =>
              row.kind === 'intake.routed' &&
              'input' in row &&
              row.input !== command.input.creation.initial?.input,
          )
        )
          return fail({
            kind: 'invalid',
            field: 'batches',
            reason: 'trusted seed requires original input material unavailable from these batches',
          })
        if (
          Buffer.byteLength(canonical({ snapshot, entries })) >
          (options.budget?.capacityBytes ?? defaultBudget.capacityBytes)
        )
          return fail({
            kind: 'unavailable',
            owner: 'session-memory-journal',
            diagnostic: 'trusted seed exceeds snapshot capacity',
          })
        const inputs = new Map<
          import('@omne-harness/session-contract').InputId,
          Extract<import('@omne-harness/session-contract').RoutedInput, { kind: 'ordinary' }>
        >()
        if (command.input.creation.initial)
          inputs.set(command.input.creation.initial.input, command.input.creation.initial)
        const state: SessionState = {
          lastCommit: null,
          frozenReceipt: null,
          snapshot,
          entries,
          inputs,
          operations: new Map(),
          modelView: materializeModelView({ epoch: 'epoch:0', rows: [] }, entries, entries),
        }
        cell.mutate(() => cell.replaceSession(state))
        return succeed(undefined)
      },
    },
  }
}
