// The session service seen through the shape of `SessionTransactionPort`, so the transaction suite
// of session-contract drives it face by face. Each port call becomes the face operation of a caller
// class that the operation admits. The guards a case hands to `commit` are relayed to the evidence
// bridge for that operation: the service collects material from its bridges, never from the caller.
import type {
  SessionCallerClass,
  SessionCommand,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  type SessionTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import type { Harness } from './harness.ts'

/** A caller class that each mutation admits (contract「四个面与公开操作」). */
const CALLER: Readonly<Record<SessionCommand['kind'], SessionCallerClass>> = {
  accept: 'intake',
  startRun: 'coordinator',
  claim: 'coordinator',
  reload: 'coordinator',
  recordMessage: 'coordinator',
  preserveResult: 'coordinator',
  completeConsumption: 'coordinator',
  completeExternalConsumption: 'coordinator',
  bindExternalCall: 'coordinator',
  commitDerived: 'coordinator',
  release: 'coordinator',
  control: 'intake',
  finishRun: 'coordinator',
  create: 'intake',
  completeInitialization: 'intake',
  change: 'intake',
  setRelation: 'intake',
  configureAutoArchive: 'intake',
  considerAutoArchive: 'maintainer',
  recordIdle: 'maintainer',
  interrupt: 'intake',
  cancelRun: 'intake',
  stopCall: 'intake',
  freeze: 'coordinator',
  receive: 'coordinator',
}

export function facadeOf(h: Harness): SessionTransactionPort<string> {
  const coordinator = h.faces('coordinator')
  const intake = h.faces('intake')
  const maintainer = h.faces('maintainer')
  const reader = h.faces('reader')
  return {
    commit: (input => {
      h.relay(input.command.input.operation, input.guards)
      const faces = h.faces(CALLER[input.command.kind])
      const value = { ...input.command.input, principal: input.access.principal }
      // The suite hands one command of one kind; the face method of that kind takes its input.
      const method = (
        {
          ...faces.work,
          ...faces.management,
          ...faces.reconciliation,
        } as unknown as Record<
          string,
          (value: unknown) => ReturnType<SessionTransactionPort<string>['commit']>
        >
      )[input.command.kind]
      if (method === undefined) throw new Error(`no face method ${input.command.kind}`)
      return method(value)
    }) as SessionTransactionPort<string>['commit'],
    readWork: input => coordinator.work.readWork(input),
    readInput: input => coordinator.work.readInput(input),
    queryOperation: input => coordinator.work.queryOperation(input),
    readModelSelection: input => intake.work.readModelSelection(input),
    queryControlOperation: input => intake.work.queryControlOperation(input),
    commitEntries: () => {
      throw new Error('commitEntries is not a face operation')
    },
    history: reader.history,
    pending: input => maintainer.reconciliation.pending(input),
    references: input => maintainer.reconciliation.references(input),
    releasedScopes: input => maintainer.reconciliation.releasedScopes(input),
  }
}

/** The transaction suite fixture over the faces of one harness. */
export function facadeFixture(h: Harness): SessionTransactionsFixture<string> {
  return {
    port: facadeOf(h),
    access: h.access(),
    otherAccess: h.other(),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: command => h.initializationGuards(command),
  }
}
