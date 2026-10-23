// The view of a subject that the checks use: every step that waits on the subject is limited to
// `waitMs`, so a provider method, a hook or a transport step that never returns ends the check as
// a failure instead of ending the suite. A promise that cannot be cancelled is left alone.
import type {
  ModelProvider,
  ModelRuntime,
  PreparedTransport,
  MaterializedTransport,
} from '../index.ts'
import { within } from './conformance-kit.ts'
import type {
  ConformanceHooks,
  ConformanceSubject,
  ConformanceTransport,
  HookName,
} from './conformance-types.ts'

function bounded<A extends unknown[], R>(
  waitMs: number,
  what: string,
  step: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args) => within(waitMs, step(...args), what)
}

function boundedRuntime<P>(runtime: ModelRuntime<P>, waitMs: number): ModelRuntime<P> {
  const { calls, consumption, instances } = runtime
  const ask = <A extends unknown[], R>(what: string, step: (...args: A) => Promise<R>) =>
    bounded(waitMs, `the answer of ${what}`, step)
  return {
    calls: {
      admit: ask('admit', calls.admit.bind(calls)),
      inspect: ask('inspect', calls.inspect.bind(calls)),
      dispatches: ask('dispatches', calls.dispatches.bind(calls)),
      cancel: ask('cancel', calls.cancel.bind(calls)),
    },
    consumption: {
      beginRead: ask('beginRead', consumption.beginRead.bind(consumption)),
      readNext: ask('readNext', consumption.readNext.bind(consumption)),
      closeRead: ask('closeRead', consumption.closeRead.bind(consumption)),
      acknowledge: ask('acknowledge', consumption.acknowledge.bind(consumption)),
    },
    instances: { connect: ask('connect', instances.connect.bind(instances)) },
  }
}

function boundedProvider<P>(provider: ModelProvider<P>, waitMs: number): ModelProvider<P> {
  return {
    runtime: boundedRuntime(provider.runtime, waitMs),
    recover: bounded(waitMs, 'the answer of recover', provider.recover.bind(provider)),
    quiesce: bounded(waitMs, 'the answer of quiesce', provider.quiesce.bind(provider)),
  }
}

type Hook = <A extends unknown[], R>(
  name: HookName,
  step: (...args: A) => Promise<R>,
) => (...args: A) => Promise<R>

/** The hooks that bring a call to a state and give it evidence. */
function boundedDriving<P>(hooks: ConformanceHooks<P>, hook: Hook): ConformanceHooks<P> {
  return {
    ...(hooks.startRun && { startRun: hook('startRun', hooks.startRun.bind(hooks)) }),
    ...(hooks.showFacts && { showFacts: hook('showFacts', hooks.showFacts.bind(hooks)) }),
    ...(hooks.settleCall && { settleCall: hook('settleCall', hooks.settleCall.bind(hooks)) }),
    ...(hooks.provideEvidence && {
      provideEvidence: hook('provideEvidence', hooks.provideEvidence.bind(hooks)),
    }),
  }
}

/** The hooks that make a write answer `commit-unknown` and move or block the cleanup. */
function boundedWrites<P>(hooks: ConformanceHooks<P>, hook: Hook): ConformanceHooks<P> {
  return {
    ...(hooks.failNextWrite && {
      failNextWrite: hook('failNextWrite', hooks.failNextWrite.bind(hooks)),
    }),
    ...(hooks.advanceCleanup && {
      advanceCleanup: hook('advanceCleanup', hooks.advanceCleanup.bind(hooks)),
    }),
    ...(hooks.blockCleanup && {
      blockCleanup: hook('blockCleanup', hooks.blockCleanup.bind(hooks)),
    }),
  }
}

/** The hooks that take an instance, a connection, an access right or the directory away. */
function boundedWithdrawals<P>(hooks: ConformanceHooks<P>, hook: Hook): ConformanceHooks<P> {
  return {
    ...(hooks.withdrawInstance && {
      withdrawInstance: hook('withdrawInstance', hooks.withdrawInstance.bind(hooks)),
    }),
    ...(hooks.replaceInstance && {
      replaceInstance: hook('replaceInstance', hooks.replaceInstance.bind(hooks)),
    }),
    ...(hooks.disconnectObservers && {
      disconnectObservers: hook('disconnectObservers', hooks.disconnectObservers.bind(hooks)),
    }),
    ...(hooks.revokeAccess && {
      revokeAccess: hook('revokeAccess', hooks.revokeAccess.bind(hooks)),
    }),
    ...(hooks.failDirectory && {
      failDirectory: hook('failDirectory', hooks.failDirectory.bind(hooks)),
    }),
  }
}

function boundedHooks<P>(hooks: ConformanceHooks<P>, waitMs: number): ConformanceHooks<P> {
  const hook: Hook = (name, step) => bounded(waitMs, `the answer of the ${name} hook`, step)
  return {
    ...boundedDriving(hooks, hook),
    ...boundedWrites(hooks, hook),
    ...boundedWithdrawals(hooks, hook),
  }
}

function boundedMaterialized(
  materialized: MaterializedTransport,
  waitMs: number,
): MaterializedTransport {
  return {
    // Read on every access: a transport whose receipt changes between reads must stay visible.
    get receipt() {
      return materialized.receipt
    },
    start: signal => materialized.start(signal),
    close: bounded(waitMs, 'the close of the materialized transport', () => materialized.close()),
  }
}

function boundedPrepared(prepared: PreparedTransport, waitMs: number): PreparedTransport {
  const materialize = bounded(waitMs, 'the answer of materialize', (signal: AbortSignal) =>
    prepared.materialize(signal),
  )
  return {
    materialize: async signal => {
      const outcome = await materialize(signal)
      return 'ok' in outcome ? { ok: boundedMaterialized(outcome.ok, waitMs) } : outcome
    },
    close: bounded(waitMs, 'the close of the prepared transport', () => prepared.close()),
  }
}

function boundedTransport(given: ConformanceTransport, waitMs: number): ConformanceTransport {
  const prepare = bounded(
    waitMs,
    'the answer of prepare',
    given.transport.prepare.bind(given.transport),
  )
  return {
    transport: {
      prepare: async (request, supplier, dispatch) => {
        const outcome = await prepare(request, supplier, dispatch)
        return 'ok' in outcome ? { ok: boundedPrepared(outcome.ok, waitMs) } : outcome
      },
    },
    sends: () => given.sends(),
    ...(given.request && { request: given.request }),
    ...(given.supplier && { supplier: given.supplier }),
  }
}

/** The subject as the checks see it. `dispose` is left out; the entry calls it on the original. */
export function boundedSubject<P>(
  subject: ConformanceSubject<P>,
  waitMs: number,
): ConformanceSubject<P> {
  return {
    provider: boundedProvider(subject.provider, waitMs),
    principal: subject.principal,
    tenant: subject.tenant,
    otherTenant: subject.otherTenant,
    ...(subject.request && { request: subject.request }),
    ...(subject.consumer && { consumer: subject.consumer }),
    ...(subject.capacity && { capacity: subject.capacity }),
    ...(subject.hooks && { hooks: boundedHooks(subject.hooks, waitMs) }),
    ...(subject.transport && { transport: boundedTransport(subject.transport, waitMs) }),
  }
}
