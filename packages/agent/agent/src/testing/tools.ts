// A hand-written double of the Tool runtime that Agent consumes. `tool-contract/testing` gives
// doubles of the Tool ports only, and a real Tool runtime needs a host, a catalog and child calls
// that have no doubles, so this package writes its own. It satisfies `ToolRuntime<P, B>` and runs no
// Tool rule: every method answers `unavailable` until a test scripts it.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolDefiniteFailure, ToolFailure, ToolRuntime } from '@omne-harness/tool-contract'
import { scriptedMethod, type In, type Out, type Script, type ScriptOf } from './script.ts'

type Runtime<P> = ToolRuntime<P, ContentBlock>
type Observe<P> = Runtime<P>['observation']['observe']
type FrameOf<P> = ReturnType<Observe<P>> extends AsyncIterable<infer F> ? F : never

export type ScriptedToolRuntime<P> = Readonly<{
  port: Runtime<P>
  invoke: ScriptOf<Runtime<P>['invoke']>
  inspect: ScriptOf<Runtime<P>['inspect']>
  queries: Readonly<{ [K in keyof Runtime<P>['queries']]: ScriptOf<Runtime<P>['queries'][K]> }>
  commands: Readonly<{ [K in keyof Runtime<P>['commands']]: ScriptOf<Runtime<P>['commands'][K]> }>
  instances: Readonly<{ current: ScriptOf<Runtime<P>['instances']['current']> }>
  /** The observation face answers frames; the script answers the whole iterable of one call. */
  observation: Readonly<{ observe: Script<In<Observe<P>>, AsyncIterable<FrameOf<P>>> }>
  content: Readonly<{ [K in keyof Runtime<P>['content']]: ScriptOf<Runtime<P>['content'][K]> }>
  catalog: Readonly<{ [K in keyof Runtime<P>['catalog']]: ScriptOf<Runtime<P>['catalog'][K]> }>
}>

const OWNER = 'toolRuntime'

function unscripted(): ToolDefiniteFailure {
  return { kind: 'unavailable', dependency: OWNER, diagnostic: `${OWNER} has no scripted answer` }
}

/** The default of a method that returns a `Reply`. */
function failing(): () => Outcome<never, ToolFailure> {
  return () => fail(unscripted())
}

/** An iterable that a scripted answer resolves to, exposed before the answer settles. */
function deferred<T>(answer: Promise<AsyncIterable<T>>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* await answer
    },
  }
}

/** The default of a method that returns a command outcome: a definite rejection. */
function rejecting(): () => Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }> {
  return () => ({ kind: 'rejected', failure: unscripted() })
}

export function createScriptedToolRuntime<P>(): ScriptedToolRuntime<P> {
  type R = Runtime<P>
  const invoke = scriptedMethod<In<R['invoke']>, Out<R['invoke']>>(rejecting())
  const inspect = scriptedMethod<In<R['inspect']>, Out<R['inspect']>>(failing())
  const lookup = scriptedMethod<In<R['queries']['lookup']>, Out<R['queries']['lookup']>>(failing())
  const queryOperation = scriptedMethod<
    In<R['queries']['queryOperation']>,
    Out<R['queries']['queryOperation']>
  >(failing())
  const readProcess = scriptedMethod<
    In<R['queries']['readProcess']>,
    Out<R['queries']['readProcess']>
  >(failing())
  const readWait = scriptedMethod<In<R['queries']['readWait']>, Out<R['queries']['readWait']>>(
    failing(),
  )
  const readDiagnostics = scriptedMethod<
    In<R['queries']['readDiagnostics']>,
    Out<R['queries']['readDiagnostics']>
  >(failing())
  const readResult = scriptedMethod<
    In<R['queries']['readResult']>,
    Out<R['queries']['readResult']>
  >(failing())
  const account = scriptedMethod<In<R['queries']['account']>, Out<R['queries']['account']>>(
    failing(),
  )
  const control = scriptedMethod<In<R['commands']['control']>, Out<R['commands']['control']>>(
    rejecting(),
  )
  const releaseDelivery = scriptedMethod<
    In<R['commands']['releaseDelivery']>,
    Out<R['commands']['releaseDelivery']>
  >(rejecting())
  const current = scriptedMethod<In<R['instances']['current']>, Out<R['instances']['current']>>(
    failing(),
  )
  // Until scripted, an observation ends at once with the public `unavailable`.
  const observe = scriptedMethod<In<Observe<P>>, AsyncIterable<FrameOf<P>>>(() =>
    (async function* (): AsyncGenerator<FrameOf<P>> {
      yield { kind: 'ended', reason: 'unavailable' }
    })(),
  )
  const read = scriptedMethod<In<R['content']['read']>, Out<R['content']['read']>>(failing())
  const raw = scriptedMethod<In<R['content']['raw']>, Out<R['content']['raw']>>(failing())
  const catalogInspect = scriptedMethod<In<R['catalog']['inspect']>, Out<R['catalog']['inspect']>>(
    failing(),
  )
  const usage = scriptedMethod<In<R['catalog']['usage']>, Out<R['catalog']['usage']>>(failing())
  const search = scriptedMethod<In<R['catalog']['search']>, Out<R['catalog']['search']>>(failing())

  return {
    port: {
      invoke: invoke.call,
      inspect: inspect.call,
      queries: {
        lookup: lookup.call,
        queryOperation: queryOperation.call,
        readProcess: readProcess.call,
        readWait: readWait.call,
        readDiagnostics: readDiagnostics.call,
        readResult: readResult.call,
        account: account.call,
      },
      commands: { control: control.call, releaseDelivery: releaseDelivery.call },
      instances: { current: current.call },
      observation: { observe: input => deferred(observe.call(input)) },
      content: { read: read.call, raw: raw.call },
      catalog: { inspect: catalogInspect.call, usage: usage.call, search: search.call },
    },
    invoke: invoke.script,
    inspect: inspect.script,
    queries: {
      lookup: lookup.script,
      queryOperation: queryOperation.script,
      readProcess: readProcess.script,
      readWait: readWait.script,
      readDiagnostics: readDiagnostics.script,
      readResult: readResult.script,
      account: account.script,
    },
    commands: { control: control.script, releaseDelivery: releaseDelivery.script },
    instances: { current: current.script },
    observation: { observe: observe.script },
    content: { read: read.script, raw: raw.script },
    catalog: { inspect: catalogInspect.script, usage: usage.script, search: search.script },
  }
}
