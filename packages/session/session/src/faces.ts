// The four faces as one caller class sees them (contract「四个面与公开操作」). Every mutation goes
// through the command handler (SPEC CP-01); every read through the read paths (SPEC CP-03).
import { fail } from '@omne-harness/operation-result'
import type {
  MutationName,
  SessionAccess,
  SessionCallerClass,
  SessionCommand,
  SessionFaces,
  SessionManagement,
  SessionReconciliation,
  SessionWork,
} from '@omne-harness/session-contract'
import type { CommandHandler } from './command.ts'
import type { SessionDependencies } from './dependencies.ts'
import { guarded, OWNERS } from './failures.ts'
import { readSnapshot } from './qualify.ts'
import type { Reads } from './reads.ts'

type FaceMutations<P> = Pick<
  SessionWork<P> & SessionManagement<P> & SessionReconciliation<P>,
  MutationName
>

function accessOf<P>(input: SessionAccess<P>): SessionAccess<P> {
  return { principal: input.principal, tenant: input.tenant, session: input.session }
}

export function createFaces<P>(
  input: Readonly<{
    caller: SessionCallerClass
    handle: CommandHandler<P>
    reads: Reads<P>
    dependencies: SessionDependencies<P>
  }>,
): SessionFaces<P> {
  const { caller, handle, reads, dependencies } = input

  const mutation =
    <K extends MutationName>(kind: K) =>
    (value: Parameters<FaceMutations<P>[K]>[0]): ReturnType<FaceMutations<P>[K]> => {
      const { principal, ...rest } = value
      // The face input is the command input plus the principal; the kind fixes which command it is.
      const command = { kind, input: rest } as SessionCommand
      // The handler answers with the result of the commit of this very command kind.
      return handle(caller, command, principal) as ReturnType<FaceMutations<P>[K]>
    }

  const work: SessionWork<P> = {
    accept: mutation('accept'),
    readWork: value =>
      reads.session(caller, 'readWork', value, view =>
        readSnapshot(view, accessOf(value), 'readWork'),
      ),
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
    loadRecovery: value =>
      reads.session(caller, 'loadRecovery', value, view =>
        readSnapshot(view, accessOf(value), 'loadRecovery'),
      ),
    readModelSelection: value =>
      reads.session(caller, 'readModelSelection', value, view =>
        view.readModelSelection(accessOf(value)),
      ),
    cancelRun: mutation('cancelRun'),
    stopCall: mutation('stopCall'),
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
    pending: value => reads.directory(caller, 'pending', port => port.pending(value)),
    references: value => reads.directory(caller, 'references', port => port.references(value)),
    releasedScopes: value =>
      reads.directory(caller, 'releasedScopes', port => port.releasedScopes(value)),
  }

  const history: SessionFaces<P>['history'] = {
    begin: value =>
      reads.session(caller, 'history.begin', value, view =>
        view.history.begin({
          ...accessOf(value),
          kinds: value.kinds,
          from: value.from,
          direction: value.direction,
          pageBytes: value.pageBytes,
        }),
      ),
    next: value =>
      reads.session(caller, 'history.next', value, view =>
        view.history.next({ ...accessOf(value), cursor: value.cursor }),
      ),
    since: value =>
      reads.session(caller, 'history.since', value, view =>
        view.history.since({
          ...accessOf(value),
          after: value.after,
          kinds: value.kinds,
          pageBytes: value.pageBytes,
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

  return Object.freeze({
    work: Object.freeze(work),
    management: Object.freeze(management),
    reconciliation: Object.freeze(reconciliation),
    history: Object.freeze(history),
  })
}
