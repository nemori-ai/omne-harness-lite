// Fixture of the cancellation spec of the `agent-journal` row: a real tree (storage, the access
// double, `session-storage`, the row under test) with a session that has an active Run and an
// opened execution, and the cancellation route through the Journal the row provides. It does not
// import vitest. The Session side is the real `session-storage` row; the access check is the
// contract double of `session-contract/testing`.
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeInputId,
  decodeStepId,
} from '@omne-harness/agent-contract'
import type {
  AcceptedInput,
  AgentCheckpoint,
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  DurableEvidence,
  ExecutionSnapshot,
  FinishAuthorization,
} from '@omne-harness/agent-contract'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionCommand,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { tenantEquals } from '@omne-harness/legal-identity'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import {
  agentJournalCombination,
  createAgentJournalRow,
} from '../../../src/rows/agent-journal/index.ts'
import { accessPolicyRow, providerConfig } from '../storage/fixtures/tree.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

export function ok<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
const must = <T>(outcome: Outcome<T, unknown>): T => ok(outcome as Outcome<T, never>)

export const operation = (text: string): AgentOperationId => must(decodeAgentOperationId(text))

function checkpoint(): AgentCheckpoint {
  const adoption = { owner: 'test', name: 'checkpoint', revision: '1', digest: 'test:checkpoint' }
  return {
    schema: adoption,
    definition: adoption,
    step: must(decodeStepId('step-1')),
    position: 'E3',
    calls: [],
    passages: [],
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
  }
}

const PROVIDER = {
  owner: 'test',
  name: 'message-handoff',
  revision: '1',
  digest: 'test:message-handoff',
}
const DEFINITION = { owner: 'test', name: 'definition', revision: '1', digest: 'test:definition' }

function openInputOf(
  access: SessionAccess<string>,
  execution: AgentExecutionId,
  grant: DurableEvidence,
  initial: AcceptedInput,
): Parameters<AgentJournal<string>['open']>[0] {
  const entry = operation(`open-${access.session}`)
  const runtime = {
    instance: must(decodeAgentInstanceId('instance-1')),
    scope: evidence(`scope/${execution}`),
    definition: DEFINITION,
    grant,
  }
  const invoke = {
    kind: 'invoke' as const,
    operation: entry,
    execution,
    initial,
    checkpoint: checkpoint(),
  }
  const handoff = { kind: 'input' as const, execution, entry, input: initial.id }
  return {
    ...access,
    execution,
    operation: entry,
    original: {
      entry: invoke,
      handoff,
      outcome: {
        request: {
          kind: 'input',
          reference: handoff,
          entry: invoke,
          source: { kind: 'external-input', input: initial.id },
        },
        origin: { kind: 'invoke', ...runtime },
        provider: PROVIDER,
        qualification: evidence(`qualification/${entry}`),
        record: evidence(`record/${entry}`),
        decision: {
          kind: 'prepared',
          message: initial.content,
          admission: evidence(`admission/${entry}`),
        },
      },
    },
    runtime,
  }
}

/** One session with an active Run whose execution the Journal has opened. */
export type Run = Readonly<{ access: SessionAccess<string>; execution: AgentExecutionId }>

export type CancelTree = Readonly<{
  tree: LoadedTree
  journal: AgentJournal<string>
  /** A session of the given principal and name, with an active Run and an opened execution. */
  openRun(access: SessionAccess<string>): Promise<Run>
  release(): void
}>

/**
 * The tree of the release rows below the Journal. `cancellation: 'release'` loads the row the
 * release names, `'absent'` the row made without an installation. The access double allows the
 * tenant of `memoryAccess` and every tenant that created a session of its own.
 */
export async function cancelTree(cancellation: 'release' | 'absent'): Promise<CancelTree> {
  const base = makeBase()
  const combination = agentJournalCombination()
  const policy = accessPolicyRow(request => ({
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }))
  const tree = await loadTree({
    base,
    rows: [
      declared(
        storageRow,
        providerConfig(base.storageRoot, {
          maxCommandsPerCommit: 256,
          maxJsonDepth: 256,
          maxJsonMembers: 1048576,
        }),
      ),
      declared(policy.plugin),
      declared(sessionStorageRow, {
        combinationVersion: combination.combinationVersion,
        directoryFile: base.directoryFile,
        domainRule: 'organization-account/1',
      }),
      declared(
        cancellation === 'release'
          ? (await import('../../../src/rows/agent-journal/index.ts')).agentJournalRow
          : createAgentJournalRow({}),
        combination,
      ),
    ],
  })
  const journal = tree.service<AgentJournal<string>>(agentJournalKey)
  const port = tree.service<SessionTransactionPort<string>>(sessionTransactionsKey)
  if (journal === undefined || port === undefined) throw new Error('the tree provides no Journal')
  async function openRun(access: SessionAccess<string>): Promise<Run> {
    const value = creation({ initial: ordinaryInput('input-1') })
    const create: SessionCommand = {
      kind: 'create',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId(`create-${access.session}`),
        creation: value,
      },
    }
    ok(
      await port!.commit({
        access,
        command: create,
        guards: [
          initializationFixtureGuard(
            initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
          ),
        ],
      }),
    )
    const started = ok(
      await port!.commit({
        access,
        command: {
          kind: 'startRun',
          input: {
            tenant: access.tenant,
            session: access.session,
            operation: operationId(`start-${access.session}`),
            entry: 'interactive',
            candidate: value.definition.candidate,
            instance: { owner: 'agent', id: 'instance-1' },
          },
        },
        guards: [
          guard('evidence-bridge', 'login-entry', { session: access.session, operation: 'start' }),
        ],
      }),
    )
    const snapshot = ok(await port!.readWork(access))
    if (snapshot.run.kind !== 'active') throw new Error('not active')
    const execution = must(decodeAgentExecutionId(snapshot.run.execution.execution))
    const admitted = ok(await port!.readInput({ ...access, input: snapshot.run.first }))
    const initial: AcceptedInput = {
      id: must(decodeInputId(admitted.input)),
      content: admitted.message,
      source: started.receipt.source,
      priority: 'ordinary',
    }
    const opened = ok(
      await journal!.open(openInputOf(access, execution, started.receipt.source, initial)),
    )
    ok(
      await port!.commit({
        access,
        command: {
          kind: 'receive',
          input: {
            tenant: access.tenant,
            session: access.session,
            operation: operationId(`handed-${access.session}`),
            fact: {
              kind: 'input-handover',
              input: String(initial.id) as never,
              execution,
              result: { kind: 'accepted', receipt: opened.receipt.evidence as DurableEvidence },
            },
          },
        },
        guards: [],
      }),
    )
    return { access, execution }
  }
  return { tree, journal, openRun, release: () => base.release() }
}

export const sameTenant = (a: SessionAccess<string>, b: SessionAccess<string>) =>
  tenantEquals(a.tenant, b.tenant)

export { memoryAccess }

const cancelId = operation('cancel-control')

/** The cancel control and its reached intent, as the cancel entry saves them. */
export async function requestCancel(
  journal: AgentJournal<string>,
  run: Run,
  control: AgentOperationId = cancelId,
) {
  const saved = await journal.control({
    ...run.access,
    execution: run.execution,
    operation: control,
    command: { kind: 'cancel', reason: evidence('cancel') },
  })
  if ('failure' in saved) return saved
  return journal.recordControl({
    ...run.access,
    execution: run.execution,
    operation: operation(`${control}-intent`),
    target: control,
    stage: 'intent-established',
    state: 'reached',
    source: evidence('intent'),
  })
}

const load = async (journal: AgentJournal<string>, run: Run): Promise<ExecutionSnapshot> =>
  ok(await journal.load({ ...run.access, execution: run.execution }))

function authorizationOf(
  snapshot: ExecutionSnapshot,
  control: AgentOperationId,
): Extract<FinishAuthorization, { kind: 'cancel' }> {
  const record = snapshot.controls.find(item => item.operation === control)
  if (record === undefined) throw new Error('the control should be saved')
  return { kind: 'cancel', control, source: record.stages.accepted.source }
}

/**
 * Establish, judge, prepareFinish and tryFinish under the cancel `control`. Answers the first
 * failure (an `unavailable` of a missing installation among them) or the `tryFinish` result.
 */
export async function endCancelled(
  journal: AgentJournal<string>,
  run: Run,
  installation: DurableEvidence,
  control: AgentOperationId = cancelId,
) {
  const common = async (name: string) => {
    const snapshot = await load(journal, run)
    return {
      snapshot,
      common: {
        ...run.access,
        execution: run.execution,
        operation: operation(name),
        authorization: authorizationOf(snapshot, control),
        expected: snapshot.revision,
      },
    }
  }
  const first = await common('cancel-establish')
  const established = await journal.commitSettlement({
    ...first.common,
    installation,
    kind: 'establish-cancellation',
    predecessor: null,
  })
  if ('failure' in established) return established
  const second = await common('cancel-judge')
  const route = second.snapshot.settlement.route
  if (route === null) throw new Error('a route is expected')
  const judged = await journal.commitSettlement({
    ...second.common,
    installation,
    kind: 'judge-cancellation',
    candidate: route.candidate,
    route: route.record,
  })
  if ('failure' in judged) return judged
  const third = await common('cancel-prepare')
  const prepared = await journal.prepareFinish({
    ...third.common,
    candidate: third.snapshot.settlement.candidate!.candidate,
  })
  if ('failure' in prepared) return prepared
  const fourth = await load(journal, run)
  if (fourth.state.kind !== 'settling') throw new Error('the execution should be settling')
  return journal.tryFinish({
    ...run.access,
    execution: run.execution,
    operation: operation('cancel-end'),
    authorization: authorizationOf(fourth, control),
    expected: fourth.revision,
    intent: fourth.state.intent,
  })
}

/**
 * `intruder` presents the saved cancel control of `run` (its source evidence is all the
 * authorization carries) to establish the cancellation candidate of an execution that is not its own.
 */
export async function establishAs(
  journal: AgentJournal<string>,
  run: Run,
  intruder: SessionAccess<string>,
  installation: DurableEvidence,
  control: AgentOperationId = cancelId,
) {
  const snapshot = await load(journal, run)
  return journal.commitSettlement({
    ...intruder,
    execution: run.execution,
    operation: operation('foreign-establish'),
    authorization: authorizationOf(snapshot, control),
    expected: snapshot.revision,
    installation,
    kind: 'establish-cancellation',
    predecessor: null,
  })
}

export { load }
