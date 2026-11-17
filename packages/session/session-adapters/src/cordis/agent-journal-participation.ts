import {
  type AttachInput,
  type Book,
  OWNER,
  type OpenInput,
  historyCaller,
  unavailable,
} from './agent-journal-base.ts'
import { sessionEpochOf } from './history-epoch.ts'
import type {
  AgentExecutionId,
  AgentJournal,
  CommandReceipt,
  ExecutionMutation,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandDigest,
  deriveDriveOperation,
  deriveSessionOperation,
  judgeCompletion,
  type ConsumptionId,
  type InputId,
  type SessionCommand,
} from '@omne-harness/session-contract'
import { type ParticipationMethod } from '../participation-mapping.ts'
import { HistoryFailure, normalizedResult } from '../testing/history.ts'
import { outrunParticipation, type JointDecision, type JournalWrite } from '../testing/journal.ts'
import { type JournalCell } from '../testing/root.ts'

// How a Journal commit takes part in a joint Session commit: the participations and the commands.

export function jointCommand<P>(
  book: Book<P>,
  cell: JournalCell<P>,
  input: ExecutionMutation<P>,
  method: JournalWrite,
  receipt: CommandReceipt,
): Outcome<SessionCommand, Failure> | undefined {
  const caller = historyCaller(input, method)
  if (caller.kind === 'none') return undefined
  const operation = deriveSessionOperation({
    kind: 'participation',
    execution: input.execution,
    operation: input.operation,
    joint: caller.kind,
  })
  const common = { tenant: book.tenant, session: book.session, operation }
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
          value: {
            kind: 'compaction',
            message: caller.value.message,
            epoch: sessionEpochOf(caller.value.epoch),
          },
          judgment: caller.admission,
        },
      })
    case 'custody':
    case 'processed': {
      const root = cell.state()
      const execution = [...root.agent.executions.values()].find(
        item => item.id === input.execution,
      )
      if (execution === undefined) return fail({ kind: 'denied', action: method })
      let result
      try {
        result = normalizedResult(root, execution, caller.consumption, caller.result).result
      } catch (error) {
        return fail(
          unavailable(
            error instanceof HistoryFailure && error.failure.kind === 'unavailable'
              ? error.failure.diagnostic
              : error instanceof Error
                ? error.message
                : 'original result',
          ),
        )
      }
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

export function participation<P>(
  book: Book<P>,
  cell: JournalCell<P>,
  input: ExecutionMutation<P>,
  method: JournalWrite,
  receipt: CommandReceipt,
  decision: JointDecision | null,
): Failure | undefined {
  const scratch = book.scratch
  if (scratch === null) return unavailable('a participation outside a provider call')
  const scope = { tenant: book.tenant, session: book.session, execution: input.execution }
  switch (method) {
    case 'open': {
      const value = input as OpenInput<P>
      const entry = value.original.entry
      const initial = entry.kind === 'invoke' ? entry.initial : entry.value
      if (value.runtime.grant === null || initial.source === null)
        return { kind: 'denied', action: 'open' }
      scratch.checks.push({
        ...scope,
        kind: 'open',
        grant: value.runtime.grant,
        initial: {
          input: String(initial.id) as InputId,
          origin: initial.source,
          message: initial.content,
        },
      })
      return undefined
    }
    case 'attach': {
      const value = input as AttachInput<P>
      if (value.grant === null) return { kind: 'denied', action: 'attach' }
      scratch.checks.push({ ...scope, kind: 'attach', grant: value.grant })
      return undefined
    }
    case 'submit': {
      const value = (input as Parameters<AgentJournal<P>['submit']>[0]).value
      if (value.source === null) return { kind: 'denied', action: 'submit' }
      scratch.checks.push({
        ...scope,
        kind: 'submit',
        value: {
          input: String(value.id) as InputId,
          origin: value.source,
          message: value.content,
        },
      })
      return undefined
    }
    case 'tryFinish': {
      const value = input as Parameters<AgentJournal<P>['tryFinish']>[0]
      const conclusion = value.intent.conclusion.kind
      scratch.checks.push({
        ...scope,
        kind: 'finish',
        conclusion: conclusion === 'fail' ? 'failed' : conclusion,
        control: value.authorization.kind === 'cancel' ? String(value.authorization.control) : null,
      })
      return undefined
    }
    default:
      break
  }
  const derived = jointCommand(book, cell, input, method, receipt)
  if (derived === undefined) return undefined
  if ('failure' in derived) return derived.failure
  if (decision === null) return unavailable('participation without a current Session decision')
  if (decision.digest !== commandDigest(derived.ok)) return outrunParticipation
  scratch.commands.push(derived.ok)
  return undefined
}

export function terminalParticipant<P>(
  book: Book<P>,
  cell: JournalCell<P>,
  execution: AgentExecutionId,
  control: string,
) {
  const unread = {
    owner: OWNER,
    record: `${book.tenantText}/${book.session}/participant/unread`,
    revision: '0',
    digest: 'unread',
  }
  const fact = (source: typeof unread, condition: { kind: 'ready' | 'changed' | 'unknown' }) => ({
    owner: 'session',
    protocol: {
      owner: '@omne-harness/session-contract',
      name: 'pa-02-terminal-participation',
      revision: '1',
      digest: 'session-log:pa-02',
    },
    source,
    version: source,
    condition,
    purpose: {
      owner: OWNER,
      record: `${cell.namespace}/participant/judge-cancellation`,
      revision: '0',
      digest: 'purpose',
    },
  })
  const snapshot = book.scratch?.snapshot ?? null
  if (snapshot === null) return fact(unread, { kind: 'unknown' })
  const judged = judgeCompletion(snapshot, execution)
  switch (judged.kind) {
    case 'allowed':
      return fact(unread, { kind: 'ready' })
    case 'blocked':
      return fact(unread, { kind: 'unknown' })
    case 'terminal':
      return fact(judged.terminal.evidence, { kind: 'changed' })
    case 'cancelled': {
      const cancels = snapshot.controls.filter(
        item => item.intent.kind === 'control' && item.intent.value.kind === 'cancel-run',
      )
      const own = cancels.length === 1 ? cancels[0] : undefined
      const matches =
        own !== undefined &&
        deriveDriveOperation({ kind: 'control', execution, control: own.operation }) === control
      return fact(judged.terminal.evidence, { kind: matches ? 'ready' : 'changed' })
    }
  }
}

export function participationOf(method: string): ParticipationMethod | null {
  return method === 'open' ||
    method === 'attach' ||
    method === 'submit' ||
    method === 'tryFinish' ||
    method === 'commit' ||
    method === 'recordResult'
    ? method
    : null
}
