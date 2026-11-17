import { listTodos } from './todos.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  backgroundCallView,
  judgeWaiting,
  shortCallId,
  type MutationName,
  type SessionAccess,
  type SessionCallerClass,
  type StopInitiator,
  type SessionCommand,
  type SessionDirectory,
  type SessionFaces,
  type SessionManagement,
  type SessionReconciliation,
  type SessionWork,
  type BackgroundCallRecord,
  type BackgroundCallResolution,
  type BackgroundCallState,
  type BackgroundCallView,
  type Reply,
  type SessionCallStates,
} from '@omne-harness/session-contract'
import type { CommandHandler } from './command.ts'
import type { Current, SessionDependencies } from './dependencies.ts'
import { guarded, OWNERS, unavailable } from './failures.ts'
import { createHistoryPages } from './history-pages.ts'
import { readSnapshot } from './qualify.ts'
import type { Reads } from './reads.ts'

type FaceMutations<P> = Pick<
  SessionWork<P> & SessionManagement<P> & SessionReconciliation<P>,
  MutationName
>

export type SessionFacesWithDirectory<P> = SessionFaces<P> &
  Readonly<{ directory: SessionDirectory<P> }>

function accessOf<P>(input: SessionAccess<P>): SessionAccess<P> {
  return { principal: input.principal, tenant: input.tenant, session: input.session }
}

function readSnapshotOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  operation: 'readWork' | 'loadRecovery',
  value: SessionAccess<P>,
) {
  return reads.session(caller, operation, value, view =>
    readSnapshot(view, accessOf(value), operation),
  )
}

// Who stops a call is the caller class: a person's client, the agent, or the system (I-4).
const INITIATORS: Readonly<Record<SessionCallerClass, StopInitiator>> = {
  intake: 'user',
  coordinator: 'agent',
  maintainer: 'system',
  reader: 'user',
}

function stopCallOf<P>(handle: CommandHandler<P>, caller: SessionCallerClass) {
  return (value: Parameters<SessionWork<P>['stopCall']>[0]) => {
    const { principal, ...rest } = value
    const input = { ...rest, initiator: INITIATORS[caller] }
    return handle(caller, { kind: 'stopCall', input }, principal) as ReturnType<
      SessionWork<P>['stopCall']
    >
  }
}

function readWaitingOf<P>(reads: Reads<P>, caller: SessionCallerClass, value: SessionAccess<P>) {
  return reads.session(caller, 'readWaiting', value, async view => {
    const snapshot = await readSnapshot(view, accessOf(value), 'readWaiting')
    return 'failure' in snapshot ? snapshot : succeed(judgeWaiting(snapshot.ok))
  })
}

// The state of one call as Tool answers it now; an absent or failing port is an unknown state.
async function stateOf<P>(
  port: SessionCallStates | null,
  value: SessionAccess<P>,
  record: BackgroundCallRecord,
): Promise<BackgroundCallState | null> {
  if (port === null) return null
  try {
    const read = await port.read({
      tenant: value.tenant,
      session: value.session,
      producer: record.producer,
    })
    return 'ok' in read ? read.ok : null
  } catch {
    return null
  }
}

async function readBackgroundCallsOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  value: SessionAccess<P>,
  states: Current<SessionCallStates>,
): Reply<readonly BackgroundCallView[]> {
  const records = await reads.session(caller, 'readBackgroundCalls', value, async view => {
    const snapshot = await readSnapshot(view, accessOf(value), 'readBackgroundCalls')
    if ('failure' in snapshot) return snapshot
    const calls = (snapshot.ok.backgroundCalls ?? []).filter(item => item.settled === undefined)
    return succeed([...calls].sort((left, right) => left.ordinal - right.ordinal))
  })
  if ('failure' in records) return records
  const port = states.current()
  const views = await Promise.all(
    records.ok.map(async record => backgroundCallView(record, await stateOf(port, value, record))),
  )
  return succeed(views)
}

function resolveBackgroundCallOf<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  value: SessionAccess<P> & Readonly<{ id: string }>,
): Reply<BackgroundCallResolution> {
  return reads.session(caller, 'resolveBackgroundCall', value, async view => {
    const snapshot = await readSnapshot(view, accessOf(value), 'resolveBackgroundCall')
    if ('failure' in snapshot) return snapshot
    const record = snapshot.ok.backgroundCalls?.find(item => shortCallId(item.ordinal) === value.id)
    if (record === undefined) return fail({ kind: 'not-found' })
    return succeed({ producer: record.producer, settled: record.settled ?? null })
  })
}

// The reads that answer from one snapshot of the session.
function snapshotReads<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
  states: Current<SessionCallStates>,
) {
  return {
    readWork: (value: SessionAccess<P>) => readSnapshotOf(reads, caller, 'readWork', value),
    readWaiting: (value: SessionAccess<P>) => readWaitingOf(reads, caller, value),
    readBackgroundCalls: (value: SessionAccess<P>) =>
      readBackgroundCallsOf(reads, caller, value, states),
    resolveBackgroundCall: (value: SessionAccess<P> & Readonly<{ id: string }>) =>
      resolveBackgroundCallOf(reads, caller, value),
    readCurrentScope: (value: SessionAccess<P>) =>
      reads.session(caller, 'readCurrentScope', value, view =>
        view.readCurrentScope(accessOf(value)),
      ),
  }
}

// The history reads of the model view: the current window and the context a compaction is judged in.
function modelViewReads<P>(
  reads: Reads<P>,
  caller: SessionCallerClass,
): Pick<SessionFaces<P>['history'], 'readCompactionContext' | 'readModelView'> {
  return {
    readCompactionContext: value =>
      reads.session(caller, 'history.readCompactionContext', value, view =>
        view.history.readCompactionContext({
          ...accessOf(value),
          basis: value.basis,
          coverTo: value.coverTo,
        }),
      ),
    readModelView: value =>
      reads.session(caller, 'history.readModelView', value, view =>
        view.history.readModelView({
          ...accessOf(value),
          basis: value.basis,
          after: value.after,
          pageBytes: value.pageBytes,
        }),
      ),
  }
}

// Both lists of the directory are one read of the tenant's sessions (the same access check).
function directoryOf<P>(reads: Reads<P>, caller: SessionCallerClass): SessionDirectory<P> {
  const absent = () =>
    Promise.resolve(fail(unavailable(OWNERS.directory, 'the transaction port offers no directory')))
  return {
    list: value =>
      reads.directory(caller, 'directory.list', value.tenant, port =>
        port.directory === undefined ? absent() : port.directory.list(value),
      ),
    listArchived: value =>
      reads.directory(caller, 'directory.list', value.tenant, port =>
        port.directory === undefined ? absent() : port.directory.listArchived(value),
      ),
  }
}

export function createFaces<P>(
  input: Readonly<{
    caller: SessionCallerClass
    handle: CommandHandler<P>
    reads: Reads<P>
    dependencies: SessionDependencies<P>
  }>,
): SessionFacesWithDirectory<P> {
  const { caller, handle, reads, dependencies } = input

  const mutation =
    <K extends MutationName>(kind: K) =>
    (value: Parameters<FaceMutations<P>[K]>[0]): ReturnType<FaceMutations<P>[K]> => {
      const { principal, ...rest } = value
      const command = { kind, input: rest } as SessionCommand
      return handle(caller, command, principal) as ReturnType<FaceMutations<P>[K]>
    }

  const work: SessionWork<P> = {
    addTodo: mutation('addTodo'),
    removeTodo: mutation('removeTodo'),
    markTodoComplete: mutation('markTodoComplete'),
    listTodos: value => reads.session(caller, 'listTodos', value, view => listTodos(view, value)),
    accept: mutation('accept'),
    ...snapshotReads(reads, caller, dependencies.callStates),
    readInput: value =>
      reads.session(caller, 'readInput', value, view =>
        view.readInput({ ...accessOf(value), input: value.input }),
      ),
    startRun: mutation('startRun'),
    claim: mutation('claim'),
    reload: mutation('reload'),
    recordMessage: mutation('recordMessage'),
    preserveResult: mutation('preserveResult'),
    completeConsumption: mutation('completeConsumption'),
    completeExternalConsumption: mutation('completeExternalConsumption'),
    bindExternalCall: mutation('bindExternalCall'),
    commitDerived: mutation('commitDerived'),
    release: mutation('release'),
    control: mutation('control'),
    finishRun: mutation('finishRun'),
    queryOperation: value =>
      reads.session(caller, 'queryOperation', value, view =>
        view.queryOperation({ ...accessOf(value), operation: value.operation }),
      ),
    loadRecovery: value => readSnapshotOf(reads, caller, 'loadRecovery', value),
    readModelSelection: value =>
      reads.session(caller, 'readModelSelection', value, view =>
        view.readModelSelection(accessOf(value)),
      ),
    cancelRun: mutation('cancelRun'),
    stopCall: stopCallOf(handle, caller),
    retryRun: mutation('retryRun'),
    queryControlOperation: value =>
      reads.session(caller, 'queryControlOperation', value, view =>
        view.queryControlOperation({ ...accessOf(value), operation: value.operation }),
      ),
  }

  const management: SessionManagement<P> = {
    inspectIdle: value =>
      reads.session(caller, 'inspectIdle', value, async view => {
        const access = accessOf(value)
        const snapshot = await readSnapshot(view, access, 'inspectIdle')
        if ('failure' in snapshot) return fail(snapshot.failure)
        const time = await guarded(OWNERS.clock, 'clock.sample', () => dependencies.clock.sample())
        if ('failure' in time) return time
        return guarded(OWNERS.idle, 'idle.inspect', () =>
          dependencies.idle.inspect({ ...access, time: time.ok }),
        )
      }),
    recordIdle: mutation('recordIdle'),
    create: mutation('create'),
    completeInitialization: mutation('completeInitialization'),
    change: mutation('change'),
    setRelation: mutation('setRelation'),
    configureAutoArchive: mutation('configureAutoArchive'),
    considerAutoArchive: mutation('considerAutoArchive'),
    interrupt: mutation('interrupt'),
    freeze: mutation('freeze'),
  }

  const reconciliation: SessionReconciliation<P> = {
    receive: mutation('receive'),
    pending: value => reads.directory(caller, 'pending', value.tenant, port => port.pending(value)),
    references: value =>
      reads.directory(caller, 'references', 'system', port => port.references(value)),
    releasedScopes: value =>
      reads.directory(caller, 'releasedScopes', 'system', port => port.releasedScopes(value)),
  }

  const pages = createHistoryPages()
  const history: SessionFaces<P>['history'] = {
    begin: value =>
      reads.session(caller, 'history.begin', value, view =>
        pages.expanded(
          view,
          accessOf(value),
          'history.begin',
          view.history.begin({
            ...accessOf(value),
            kinds: value.kinds,
            from: value.from,
            direction: value.direction,
            pageBytes: value.pageBytes,
          }),
        ),
      ),
    next: value =>
      reads.session(caller, 'history.next', value, view =>
        pages.expanded(
          view,
          accessOf(value),
          'history.next',
          view.history.next({ ...accessOf(value), cursor: value.cursor }),
        ),
      ),
    since: value =>
      reads.session(caller, 'history.since', value, view =>
        pages.expanded(
          view,
          accessOf(value),
          'history.since',
          view.history.since({
            ...accessOf(value),
            after: value.after,
            kinds: value.kinds,
            pageBytes: value.pageBytes,
          }),
        ),
      ),
    ...modelViewReads(reads, caller),
  }

  const directory = directoryOf(reads, caller)

  return Object.freeze({
    work: Object.freeze(work),
    management: Object.freeze(management),
    reconciliation: Object.freeze(reconciliation),
    history: Object.freeze(history),
    directory: Object.freeze(directory),
  })
}
