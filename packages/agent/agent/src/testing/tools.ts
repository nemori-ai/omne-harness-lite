// A hand-written double of the Tool runtime that Agent consumes. `tool-contract/testing` gives
// doubles of the Tool ports only, and a real Tool runtime needs a host, a catalog and child calls
// that have no doubles, so this package writes its own. It satisfies `ToolRuntime<P, B>` and runs no
// Tool rule: every method answers `unavailable` until a test scripts it.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolDefiniteFailure, ToolFailure, ToolRuntime } from '@omne-harness/tool-contract'
import { scriptedMethod, type In, type Out, type ScriptOf } from './script.ts'

type Runtime<P> = ToolRuntime<P, ContentBlock>

export type ScriptedToolRuntime<P> = Readonly<{
  port: Runtime<P>
  invoke: ScriptOf<Runtime<P>['invoke']>
  inspect: ScriptOf<Runtime<P>['inspect']>
  queries: Readonly<{ [K in keyof Runtime<P>['queries']]: ScriptOf<Runtime<P>['queries'][K]> }>
  commands: Readonly<{ [K in keyof Runtime<P>['commands']]: ScriptOf<Runtime<P>['commands'][K]> }>
  instances: Readonly<{ connect: ScriptOf<Runtime<P>['instances']['connect']> }>
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
  const connect = scriptedMethod<In<R['instances']['connect']>, Out<R['instances']['connect']>>(
    failing(),
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
      instances: { connect: connect.call },
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
    instances: { connect: connect.script },
    content: { read: read.script, raw: raw.script },
    catalog: { inspect: catalogInspect.script, usage: usage.script, search: search.script },
  }
}
